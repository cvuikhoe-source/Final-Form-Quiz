import { useState, useRef, useEffect, useMemo } from 'react';
import type { Lesson, ExamQuestion, User } from '@/types';
import { generateId, loadClasses, loadSubjectItems, createSubject, type SubjectItem } from '@/storage';
import { toast } from '@/components/Toast';
import {
  parseGrammarExamWorkbookBuffer,
  downloadGrammarExamTemplate,
  parsedQuestionToExamQuestion,
  type GrammarExamParseResult,
  type ParsedExamQuestionResult,
} from '@/lib/grammarExamExcelParser';
import {
  X,
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface GrammarExamImportModalProps {
  currentUser: User;
  classes?: Array<{ id: string; name: string }>;
  targetLesson?: Lesson | null;
  onClose: () => void;
  onImport: (lesson: Lesson, questions: ExamQuestion[]) => Promise<void> | void;
}

export function GrammarExamImportModal({
  currentUser,
  classes = [],
  targetLesson = null,
  onClose,
  onImport,
}: GrammarExamImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseResult, setParseResult] = useState<GrammarExamParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // Lesson metadata fields (editable before final import)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [jlptLevel, setJlptLevel] = useState('N2');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [availableClasses, setAvailableClasses] = useState<Array<{ id: string; name: string }>>(classes);
  const [showExplanationId, setShowExplanationId] = useState<number | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // Subject selection & state
  const [availableSubjects, setAvailableSubjects] = useState<SubjectItem[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(targetLesson?.subjectId ?? '');
  const [isCreatingSubject, setIsCreatingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    loadSubjectItems().then((subs) => {
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
    }).catch(() => {});
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
      loadClasses().then((cls: string[]) => {
        setAvailableClasses(cls.map((c) => ({ id: c, name: c })));
      }).catch(() => {});
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
      const res = parseGrammarExamWorkbookBuffer(buffer);
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
      toast('Vui lòng chọn môn học cho bài học trước khi nhập', 'error');
      return;
    }

    const finalTitle = title.trim() || targetLesson?.title || 'Bài luyện thi ngữ pháp';
    isSubmittingRef.current = true;
    setImporting(true);

    try {
      const lessonId = targetLesson ? targetLesson.id : generateId();
      const selectedSubject = availableSubjects.find((s) => s.id === selectedSubjectId);

      const lesson: Lesson = targetLesson
        ? {
            ...targetLesson,
            title: finalTitle,
            description: description.trim() || targetLesson.description,
            jlptLevel: jlptLevel || targetLesson.jlptLevel,
            examQuestionsCount: parseResult.validQuestions.length,
            targetClasses: selectedClasses.length > 0 ? selectedClasses : targetLesson.targetClasses,
            subjectId: selectedSubjectId,
            subjectName: selectedSubject?.name ?? targetLesson.subjectName ?? null,
          }
        : {
            id: lessonId,
            title: finalTitle,
            source: jlptLevel ? `JLPT ${jlptLevel}` : 'Luyện thi ngữ pháp',
            sheetId: '',
            meaning: description.trim() || `Bộ đề luyện thi ngữ pháp ${jlptLevel || ''}`.trim(),
            connectionRule: '',
            notes: '',
            distinction: '',
            examples: [],
            exercises: [],
            answers: [],
            sortOrder: 0,
            targetClasses: selectedClasses,
            categoryId: 'cat-grammar',
            folderId: null,
            subjectId: selectedSubjectId,
            subjectName: selectedSubject?.name ?? null,
            startAt: null,
            deadline: null,
            classSchedules: {},
            lessonType: 'grammar_exam',
            jlptLevel: jlptLevel || 'N2',
            description: description.trim(),
            examQuestionsCount: parseResult.validQuestions.length,
            createdBy: currentUser.id,
            createdAt: new Date().toISOString(),
          };

      const questions: ExamQuestion[] = parseResult.validQuestions.map(
        (pq: ParsedExamQuestionResult) => parsedQuestionToExamQuestion(pq, lessonId)
      );

      await onImport(lesson, questions);
      toast(`Đã nhập thành công ${questions.length} câu hỏi vào bài học "${finalTitle}"!`, 'success');
      onClose();
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Đã xảy ra lỗi trong quá trình lưu dữ liệu';
      toast(msg, 'error');
    } finally {
      setImporting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                {targetLesson ? `Bổ sung câu hỏi: ${targetLesson.title}` : 'Nhập đề luyện thi ngữ pháp từ Excel'}
              </h2>
              <p className="text-xs text-slate-500">
                Hỗ trợ mẫu chuẩn JLPT (Trắc nghiệm & Sắp xếp sao ★)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white/80 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Guide & Template Download Bar */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-950 space-y-1">
                <p className="font-semibold">Mẫu chuẩn đề luyện thi ngữ pháp (Câu 31 – 50)</p>
                <p className="text-emerald-800">
                  1 file Excel = 1 Bài học luyện thi gồm 20 câu hỏi trắc nghiệm & sắp xếp câu ngôi sao.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Hướng dẫn
              </button>
              <button
                type="button"
                onClick={() => downloadGrammarExamTemplate()}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Tải file mẫu Excel
              </button>
            </div>
          </div>

          {/* Collapsible Guide */}
          {showGuide && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-2 animate-in fade-in duration-200">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Quy cách các cột trong Sheet &quot;Exam_Questions&quot;:
              </h4>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 leading-relaxed">
                <li><strong className="text-slate-800">lesson_title, lesson_description, jlpt_level:</strong> Tiêu đề bài học, mô tả và cấp độ (N1, N2, N3...).</li>
                <li><strong className="text-slate-800">question_no:</strong> Số thứ tự câu hỏi (ví dụ: 31 đến 50).</li>
                <li><strong className="text-slate-800">question_type:</strong> <code>multiple_choice</code> (chọn 1 trong 4) hoặc <code>sentence_ordering</code> (sắp xếp vị trí có dấu ★).</li>
                <li><strong className="text-slate-800">question_text:</strong> Nội dung câu hỏi tiếng Nhật. Với sắp xếp sao, định dạng có các dấu gạch dưới <code>＿＿</code> và dấu sao <code>★</code>.</li>
                <li><strong className="text-slate-800">option_a, option_b, option_c, option_d:</strong> 4 lựa chọn tương ứng.</li>
                <li><strong className="text-slate-800">correct_answer:</strong> Đáp án đúng (A, B, C, D hoặc 1, 2, 3, 4).</li>
                <li><strong className="text-slate-800">time_seconds:</strong> Thời gian làm bài gợi ý (giây), mặc định 45s.</li>
                <li><strong className="text-slate-800">answer_explanation:</strong> Phân tích ngữ pháp chi tiết, lý do đúng/sai và lưu ý.</li>
                <li><strong className="text-slate-800">vocabulary_han_viet:</strong> Từ vựng, Furigana và Âm Hán Việt đi kèm.</li>
              </ul>
            </div>
          )}

          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
              dragOver
                ? 'border-emerald-500 bg-emerald-50/50 scale-[0.99]'
                : file
                ? 'border-emerald-300 bg-emerald-50/20 hover:border-emerald-400'
                : 'border-slate-300 bg-slate-50/50 hover:border-emerald-400 hover:bg-slate-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-white shadow-md border border-slate-100 flex items-center justify-center text-emerald-600">
                <Upload className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {file ? file.name : 'Kéo thả file Excel vào đây hoặc click để chọn'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Định dạng hỗ trợ: .xlsx, .xls (Dung lượng tối đa 10MB)
                </p>
              </div>
            </div>
          </div>

          {loading && (
            <div className="text-center py-6 text-sm text-slate-500 animate-pulse">
              Đang phân tích cấu trúc bài luyện thi và các câu hỏi...
            </div>
          )}

          {/* Metadata & Preview Section */}
          {parseResult && (
            <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
              {/* Errors & Warnings if any */}
              {parseResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    Phát hiện lỗi không thể nhập ({parseResult.errors.length}):
                  </div>
                  <ul className="text-xs text-red-600 list-disc pl-5 space-y-0.5">
                    {parseResult.errors.map((e, idx) => (
                      <li key={idx}>
                        Dòng {e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {parseResult.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Cảnh báo cần lưu ý ({parseResult.warnings.length}):
                  </div>
                  <ul className="text-xs text-amber-700 list-disc pl-5 space-y-0.5">
                    {parseResult.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Lesson Metadata Form */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Thông tin bài học luyện thi (1 bài tạo từ file)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium text-slate-700">
                      Tên bài học <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ví dụ: Đề Luyện Thi Ngữ Pháp N2 - Đề Số 1"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700">Cấp độ JLPT</label>
                    <select
                      value={jlptLevel}
                      onChange={(e) => setJlptLevel(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="N1">JLPT N1</option>
                      <option value="N2">JLPT N2</option>
                      <option value="N3">JLPT N3</option>
                      <option value="N4">JLPT N4</option>
                      <option value="N5">JLPT N5</option>
                      <option value="Tổng hợp">Tổng hợp</option>
                    </select>
                  </div>

                  {/* Môn học */}
                  <div className="md:col-span-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-700">
                        Môn học <span className="text-red-500">*</span>
                      </label>
                      {currentUser?.role === 'admin' && (
                        <button
                          type="button"
                          onClick={() => setIsCreatingSubject((prev) => !prev)}
                          className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
                        >
                          {isCreatingSubject ? 'Đóng' : '⊕ Thêm môn học mới'}
                        </button>
                      )}
                    </div>

                    {isCreatingSubject && (
                      <div className="flex items-center gap-2 mb-2 p-2 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                        <input
                          type="text"
                          value={newSubjectName}
                          onChange={(e) => setNewSubjectName(e.target.value)}
                          placeholder="Nhập tên môn học..."
                          className="flex-1 rounded border border-emerald-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddNewSubject();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddNewSubject}
                          className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          Lưu
                        </button>
                      </div>
                    )}

                    {selectableSubjects.length === 0 ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                        <p className="font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          Chưa có môn học. Vui lòng tạo môn học trước.
                        </p>
                      </div>
                    ) : (
                      <select
                        value={selectedSubjectId}
                        onChange={(e) => setSelectedSubjectId(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- Chọn môn học (bắt buộc) --</option>
                        {selectableSubjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-xs font-medium text-slate-700">Mô tả bài học</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      placeholder="Mô tả nội dung bài học, dạng bài (Trắc nghiệm 31-44, Sắp xếp câu sao 45-50)..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    />
                  </div>
                </div>

                {/* Target Classes Selection */}
                {availableClasses.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                    <label className="text-xs font-medium text-slate-700">
                      Giao cho lớp học (Tùy chọn):
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableClasses.map((c) => {
                        const isSelected = selectedClasses.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedClasses(
                                isSelected
                                  ? selectedClasses.filter((id) => id !== c.id)
                                  : [...selectedClasses, c.id]
                              );
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                              isSelected
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                            }`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Questions Preview List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span>Danh sách câu hỏi xem trước</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 font-semibold">
                      {parseResult.validQuestions.length} câu hỏi
                    </span>
                  </h3>
                  <span className="text-xs text-slate-500">
                    Tất cả câu hỏi sẽ được lưu vào 1 bài học duy nhất
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
                  {parseResult.validQuestions.map((q: ParsedExamQuestionResult) => {
                    const isExpanded = showExplanationId === q.questionNo;
                    return (
                      <div key={q.questionNo} className="p-3.5 hover:bg-slate-50/80 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            <span className="px-2 py-1 rounded-md bg-slate-800 text-white text-xs font-bold font-mono">
                              Câu {q.questionNo}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                q.questionType === 'sentence_ordering'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {q.questionType === 'sentence_ordering' ? '★ Sắp xếp câu' : 'Trắc nghiệm'}
                            </span>
                            <div className="font-japanese text-sm font-medium text-slate-900 leading-relaxed break-words">
                              {q.questionText}
                            </div>
                          </div>
                          <span className="flex-shrink-0 px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                            Đáp án: {q.correctAnswer}
                          </span>
                        </div>

                        {/* Options Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pl-9">
                          {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                            const optText = q[`option${letter}`];
                            const isCorrect = q.correctAnswer === letter;
                            return (
                              <div
                                key={letter}
                                className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-2 ${
                                  isCorrect
                                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900 font-medium'
                                    : 'bg-white border-slate-200 text-slate-700'
                                }`}
                              >
                                <span
                                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                    isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {letter}
                                </span>
                                <span className="font-japanese truncate">{optText}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Explanation Toggle */}
                        {(q.answerExplanation || q.vocabularyHanViet) && (
                          <div className="mt-2 pl-9">
                            <button
                              type="button"
                              onClick={() => setShowExplanationId(isExpanded ? null : q.questionNo)}
                              className="text-[11px] font-medium text-emerald-600 hover:text-emerald-800 flex items-center gap-1"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="w-3.5 h-3.5" /> Thu gọn giải thích
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3.5 h-3.5" /> Xem giải thích & từ vựng Hán Việt
                                </>
                              )}
                            </button>
                            {isExpanded && (
                              <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2 animate-in fade-in duration-150">
                                {q.answerExplanation && (
                                  <div>
                                    <span className="font-semibold text-slate-800">Phân tích:</span>{' '}
                                    <span className="text-slate-600 whitespace-pre-line">
                                      {q.answerExplanation}
                                    </span>
                                  </div>
                                )}
                                {q.vocabularyHanViet && (
                                  <div>
                                    <span className="font-semibold text-slate-800">Từ vựng - Hán Việt:</span>{' '}
                                    <span className="text-slate-600 whitespace-pre-line">
                                      {q.vocabularyHanViet}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Hủy bỏ
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={!parseResult || parseResult.validQuestions.length === 0 || !title.trim() || !selectedSubjectId || importing}
              className={`px-6 py-2.5 text-xs font-bold text-white rounded-xl shadow-md flex items-center gap-2 transition-all ${
                !parseResult || parseResult.validQuestions.length === 0 || !title.trim() || !selectedSubjectId || importing
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-emerald-200'
              }`}
            >
              {importing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang nhập dữ liệu...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Xác nhận nhập {parseResult ? `${parseResult.validQuestions.length} câu hỏi` : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
