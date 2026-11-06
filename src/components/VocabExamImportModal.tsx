import { useState, useRef, useEffect, useMemo } from 'react';
import type { Lesson, ExamQuestion, User, LessonFolder } from '@/types';
import { loadClasses, loadSubjectItems, createSubject, type SubjectItem } from '@/storage';
import { toast } from '@/components/Toast';
import {
  parseVocabExamWorkbookBuffer,
  downloadVocabExamTemplate,
  parsedQuestionToExamQuestion,
  type VocabExamParseResult,
} from '@/lib/vocabExamExcelParser';
import {
  X,
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Languages,
} from 'lucide-react';

interface VocabExamImportModalProps {
  currentUser: User;
  targetFolderId?: string | null;
  folders?: LessonFolder[];
  classes?: Array<{ id: string; name: string }>;
  onClose: () => void;
  onImport: (lesson: Lesson, questions: ExamQuestion[]) => Promise<void> | void;
}

export function VocabExamImportModal({
  currentUser,
  targetFolderId = null,
  folders = [],
  classes = [],
  onClose,
  onImport,
}: VocabExamImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseResult, setParseResult] = useState<VocabExamParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // Lesson metadata fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [jlptLevel, setJlptLevel] = useState('N2');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(targetFolderId);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [availableClasses, setAvailableClasses] = useState<Array<{ id: string; name: string }>>(classes);
  const [expandedQuestionNo, setExpandedQuestionNo] = useState<number | null>(null);

  // Subject selection & state
  const [availableSubjects, setAvailableSubjects] = useState<SubjectItem[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [isCreatingSubject, setIsCreatingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const isSubmittingRef = useRef(false);

  // Lọc thư mục thuộc danh mục Từ vựng
  const vocabFolders = useMemo(() => {
    return folders.filter((f) => (f.categoryId === 'cat-vocab' || !f.categoryId) && !f.archivedAt);
  }, [folders]);

  useEffect(() => {
    loadSubjectItems()
      .then((subs) => {
        setAvailableSubjects(subs);
        if (subs.length > 0) {
          setSelectedSubjectId((prev) => {
            if (prev) return prev;
            if (currentUser?.role === 'teacher' && currentUser.allowedSubjects?.length > 0) {
              const matched = subs.find((s) =>
                currentUser.allowedSubjects.some((as) => as === s.id || as.toLowerCase() === s.name.toLowerCase())
              );
              return matched ? matched.id : '';
            }
            return subs[0].id;
          });
        }
      })
      .catch(() => {});
  }, [currentUser]);

  const selectableSubjects = useMemo(() => {
    if (!currentUser || currentUser.role === 'admin') return availableSubjects;
    if (currentUser.role === 'teacher' && currentUser.allowedSubjects?.length > 0) {
      return availableSubjects.filter((s) =>
        currentUser.allowedSubjects.some((as) => as === s.id || as.toLowerCase() === s.name.toLowerCase())
      );
    }
    return availableSubjects;
  }, [availableSubjects, currentUser]);

  const handleAddNewSubject = async () => {
    const trimmed = newSubjectName.trim();
    if (!trimmed) return;
    try {
      const created = await createSubject(trimmed);
      setAvailableSubjects((prev) => [...prev, created]);
      setSelectedSubjectId(created.id);
      setNewSubjectName('');
      setIsCreatingSubject(false);
      toast(`Đã thêm môn học "${created.name}"`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi tạo môn học';
      toast(msg, 'error');
    }
  };

  useEffect(() => {
    if (classes.length === 0) {
      loadClasses()
        .then((cls: string[]) => {
          setAvailableClasses(cls.map((c) => ({ id: c, name: c })));
        })
        .catch(() => {});
    } else {
      setAvailableClasses(classes);
    }
  }, [classes]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      toast('Vui lòng chọn file Excel định dạng .xlsx hoặc .xls', 'error');
      return;
    }
    setFile(f);
    setLoading(true);
    setParseResult(null);

    try {
      const buffer = await f.arrayBuffer();
      const res = parseVocabExamWorkbookBuffer(buffer);
      setParseResult(res);

      if (res.lessonMetadata?.title) {
        setTitle(res.lessonMetadata.title);
      } else if (!title) {
        setTitle(f.name.replace(/\.[^/.]+$/, ''));
      }
      if (res.lessonMetadata?.description) {
        setDescription(res.lessonMetadata.description);
      }
      if (res.lessonMetadata?.jlptLevel) {
        setJlptLevel(res.lessonMetadata.jlptLevel);
      }

      if (res.errors.length > 0) {
        toast(`File có ${res.errors.length} lỗi cần xem xét.`, 'warning');
      } else if (res.validQuestions.length > 0) {
        toast(`Đã phân tích thành công ${res.validQuestions.length} câu hỏi luyện thi!`, 'success');
      }
    } catch (err) {
      console.error(err);
      toast('Không thể đọc file Excel. Vui lòng kiểm tra lại định dạng.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmImport = async () => {
    if (!parseResult || parseResult.validQuestions.length === 0) {
      toast('Không có câu hỏi nào hợp lệ để nhập', 'error');
      return;
    }

    if (isSubmittingRef.current || importing) return;
    if (!selectedSubjectId) {
      toast('Chưa có môn học. Vui lòng tạo môn học trước.', 'error');
      return;
    }

    const finalTitle = title.trim() || 'Bài luyện thi Từ vựng';
    isSubmittingRef.current = true;
    setImporting(true);

    try {
      const lessonId = `lesson-vocab-exam-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const selectedSubject = availableSubjects.find((s) => s.id === selectedSubjectId);

      const lesson: Lesson = {
        id: lessonId,
        title: finalTitle,
        source: jlptLevel ? `JLPT ${jlptLevel}` : 'Luyện thi Từ vựng',
        sheetId: 'cau_hoi',
        meaning: description.trim() || 'Bài luyện thi trắc nghiệm Từ vựng',
        connectionRule: '',
        notes: '',
        distinction: '',
        examples: [],
        exercises: [],
        answers: [],
        sortOrder: 0,
        targetClasses: selectedClasses,
        categoryId: 'cat-vocab',
        folderId: selectedFolderId || null,
        createdBy: currentUser.id,
        subjectId: selectedSubjectId,
        subjectName: selectedSubject?.name ?? null,
        startAt: null,
        deadline: null,
        classSchedules: {},
        examQuestionsCount: parseResult.validQuestions.length,
        itemCount: parseResult.validQuestions.length,
        lessonType: 'vocabulary_exam',
        jlptLevel,
        description: description.trim(),
        createdAt: new Date().toISOString(),
      };

      const examQuestions: ExamQuestion[] = parseResult.validQuestions.map((q) =>
        parsedQuestionToExamQuestion(q, lessonId)
      );

      // Gọi onImport để hoàn tất việc lưu Lesson, ExamQuestions và tạo grant
      await onImport(lesson, examQuestions);

      toast(`Đã nhập thành công 1 bài học với ${examQuestions.length} câu hỏi luyện thi!`, 'success');
      onClose();
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Nhập đề luyện thi thất bại';
      toast(msg, 'error');
    } finally {
      isSubmittingRef.current = false;
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-fade-in">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-50/70 via-white to-teal-50/50 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
              <Languages size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Nhập đề Luyện thi Từ vựng từ Excel</h2>
              <p className="text-xs text-slate-500">1 file Excel = 1 Bài học • N hàng = N câu hỏi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Step 1: Upload box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                1. Chọn file Excel đề luyện thi (.xlsx)
              </label>
              <button
                type="button"
                onClick={downloadVocabExamTemplate}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
              >
                <Download size={13} />
                <span>Tải file Excel mẫu</span>
              </button>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition-all cursor-pointer ${
                dragOver
                  ? 'border-emerald-500 bg-emerald-50/50'
                  : file
                  ? 'border-emerald-300 bg-emerald-50/20'
                  : 'border-slate-200 bg-slate-50/50 hover:border-emerald-400 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-xs border border-slate-200 text-emerald-600 mb-2">
                {file ? <FileSpreadsheet size={24} /> : <Upload size={22} />}
              </div>
              {file ? (
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-800">{file.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {(file.size / 1024).toFixed(1)} KB • Nhấn hoặc kéo file khác để thay đổi
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-700">Kéo thả file Excel vào đây hoặc click để chọn</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Hỗ trợ định dạng workbook (.xlsx, .xls) có sheet "Câu hỏi"</p>
                </div>
              )}
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-6 text-xs text-slate-500 gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              <span>Đang đọc và phân tích cấu trúc file Excel...</span>
            </div>
          )}

          {/* Step 2: Metadata form */}
          {parseResult && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  2. Thông tin bài học luyện thi
                </span>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                  {parseResult.validQuestions.length} câu hỏi hợp lệ
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tên bài học <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="VD: Luyện thi Từ vựng JLPT N2 - Đề số 1"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Môn học <span className="text-red-500">*</span>
                    </label>
                    {currentUser?.role === 'admin' && !isCreatingSubject && (
                      <button
                        type="button"
                        onClick={() => setIsCreatingSubject(true)}
                        className="text-[11px] font-semibold text-emerald-600 hover:underline"
                      >
                        + Thêm môn mới
                      </button>
                    )}
                  </div>
                  {isCreatingSubject ? (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newSubjectName}
                        onChange={(e) => setNewSubjectName(e.target.value)}
                        placeholder="Tên môn học mới..."
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleAddNewSubject}
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        Lưu
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreatingSubject(false)}
                        className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Hủy
                      </button>
                    </div>
                  ) : (
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-emerald-500"
                    >
                      <option value="">-- Chọn môn học --</option>
                      {selectableSubjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Thư mục đích</label>
                  <select
                    value={selectedFolderId || ''}
                    onChange={(e) => setSelectedFolderId(e.target.value || null)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-emerald-500"
                  >
                    <option value="">🏠 Trang chủ (Không có thư mục)</option>
                    {vocabFolders.map((f) => (
                      <option key={f.id} value={f.id}>
                        📁 {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cấp độ JLPT</label>
                  <select
                    value={jlptLevel}
                    onChange={(e) => setJlptLevel(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-emerald-500"
                  >
                    <option value="N1">JLPT N1</option>
                    <option value="N2">JLPT N2</option>
                    <option value="N3">JLPT N3</option>
                    <option value="N4">JLPT N4</option>
                    <option value="N5">JLPT N5</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Lớp học áp dụng</label>
                  <select
                    multiple
                    value={selectedClasses}
                    onChange={(e) => {
                      const vals = Array.from(e.target.selectedOptions, (option) => option.value);
                      setSelectedClasses(vals);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 outline-none focus:border-emerald-500 h-[64px]"
                  >
                    {availableClasses.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mô tả bài học (tùy chọn)</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Mô tả nội dung bài luyện thi từ vựng..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-emerald-500 resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Question Preview */}
          {parseResult && parseResult.validQuestions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  3. Xem trước câu hỏi & Lựa chọn ({parseResult.validQuestions.length})
                </span>
                <span className="text-[11px] text-slate-400">Nhấn vào câu để xem chi tiết A/B/C/D</span>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {parseResult.validQuestions.map((q) => {
                  const isExpanded = expandedQuestionNo === q.questionNo;
                  return (
                    <div
                      key={q.questionNo}
                      className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-emerald-300 transition-colors"
                    >
                      <div
                        onClick={() => setExpandedQuestionNo(isExpanded ? null : q.questionNo)}
                        className="flex items-start justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold">
                            {q.questionNo}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 leading-snug">{q.questionText}</p>
                            <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
                              {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                                <div
                                  key={opt}
                                  className={`rounded-lg px-2 py-1 flex items-center gap-1.5 truncate border ${
                                    q.correctAnswer === opt
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 font-bold'
                                      : 'border-slate-100 bg-slate-50 text-slate-600'
                                  }`}
                                >
                                  <span className="shrink-0">{opt}:</span>
                                  <span className="truncate">
                                    {opt === 'A' ? q.optionA : opt === 'B' ? q.optionB : opt === 'C' ? q.optionC : q.optionD}
                                  </span>
                                  {q.correctAnswer === opt && (
                                    <CheckCircle2 size={12} className="text-emerald-600 ml-auto shrink-0" />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <button type="button" className="text-slate-400 p-1 hover:text-slate-600">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>

                      {/* Chi tiết phân tích A/B/C/D */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5 animate-fade-in text-xs">
                          {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                            const d = q.optionDetails[opt];
                            const isCorrect = q.correctAnswer === opt;
                            return (
                              <div
                                key={opt}
                                className={`rounded-xl p-2.5 border ${
                                  isCorrect ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-slate-50/60'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                      isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    Đáp án {opt}
                                  </span>
                                  {isCorrect && (
                                    <span className="text-[10px] font-bold text-emerald-700">ĐÁP ÁN ĐÚNG</span>
                                  )}
                                </div>
                                {d.han_viet && (
                                  <p className="text-[11px] text-slate-700">
                                    <span className="font-semibold text-slate-500">Hán Việt: </span>
                                    {d.han_viet}
                                  </p>
                                )}
                                {d.meaning && (
                                  <p className="text-[11px] text-slate-700 mt-0.5">
                                    <span className="font-semibold text-slate-500">Nghĩa: </span>
                                    {d.meaning}
                                  </p>
                                )}
                                {d.example_jp && (
                                  <div className="mt-1 text-[11px] bg-white p-2 rounded-lg border border-slate-100">
                                    <p className="font-jp text-slate-800">{d.example_jp}</p>
                                    {d.example_vi && <p className="text-slate-500 mt-0.5">→ {d.example_vi}</p>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lỗi nếu có */}
          {parseResult && parseResult.errors.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50/70 p-3.5 space-y-1.5 text-xs text-red-700">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertCircle size={15} />
                <span>Có {parseResult.errors.length} hàng dữ liệu gặp lỗi:</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                {parseResult.errors.slice(0, 10).map((err, idx) => (
                  <li key={idx}>
                    Dòng {err.row} {err.column ? `(${err.column})` : ''}: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Đóng
          </button>
          <button
            type="button"
            disabled={!parseResult || parseResult.validQuestions.length === 0 || importing || !selectedSubjectId}
            onClick={handleConfirmImport}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {importing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Đang lưu đề luyện thi...</span>
              </>
            ) : (
              <>
                <Sparkles size={15} />
                <span>Xác nhận nhập đề ({parseResult?.validQuestions.length ?? 0} câu)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
