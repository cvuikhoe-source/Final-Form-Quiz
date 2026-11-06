import { useState, useRef, useEffect, useMemo } from 'react';
import type { Lesson, ExamQuestion, ReadingExamPassage, User, LessonFolder } from '@/types';
import { loadClasses, loadSubjectItems, createSubject, type SubjectItem } from '@/storage';
import { toast } from '@/components/Toast';
import {
  parseReadingExamWorkbookBuffer,
  downloadReadingExamTemplate,
  parsedQuestionToReadingExamQuestion,
  parsedPassageToReadingPassage,
  type ReadingExamParseResult,
} from '@/lib/readingExamExcelParser';
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
  BookOpenText,
  FileText,
  Clock,
} from 'lucide-react';

interface ReadingExamImportModalProps {
  currentUser: User;
  targetFolderId?: string | null;
  folders?: LessonFolder[];
  classes?: Array<{ id: string; name: string }>;
  onClose: () => void;
  onImport: (lesson: Lesson, passages: ReadingExamPassage[], questions: ExamQuestion[]) => Promise<void> | void;
}

export function ReadingExamImportModal({
  currentUser,
  targetFolderId = null,
  folders = [],
  classes = [],
  onClose,
  onImport,
}: ReadingExamImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseResult, setParseResult] = useState<ReadingExamParseResult | null>(null);
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
  const [expandedPassageId, setExpandedPassageId] = useState<string | null>(null);

  // Subject selection & state
  const [availableSubjects, setAvailableSubjects] = useState<SubjectItem[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [isCreatingSubject, setIsCreatingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const isSubmittingRef = useRef(false);

  // Lọc thư mục thuộc danh mục Đọc hiểu
  const readingFolders = useMemo(() => {
    return folders.filter((f) => (f.categoryId === 'cat-reading' || !f.categoryId) && !f.archivedAt);
  }, [folders]);

  useEffect(() => {
    loadSubjectItems()
      .then((subs) => {
        let filtered = subs;
        if (currentUser.role === 'teacher' && currentUser.allowedSubjects && currentUser.allowedSubjects.length > 0) {
          filtered = subs.filter((s) => currentUser.allowedSubjects?.includes(s.name));
        }
        setAvailableSubjects(filtered);
        if (filtered.length > 0) {
          setSelectedSubjectId(filtered[0].id);
        }
      })
      .catch((err) => console.error('Failed to load subjects:', err));

    if (classes.length === 0) {
      loadClasses().then((cls) => {
        setAvailableClasses(cls.map((c) => ({ id: c, name: c })));
      });
    }
  }, [currentUser, classes.length]);

  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setLoading(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const res = parseReadingExamWorkbookBuffer(buffer, selectedFile.name.replace(/\.[^/.]+$/, ''));
      setParseResult(res);
      if (res.lessonMetadata.title) setTitle(res.lessonMetadata.title);
      if (res.lessonMetadata.description) setDescription(res.lessonMetadata.description);
      if (res.lessonMetadata.jlptLevel) setJlptLevel(res.lessonMetadata.jlptLevel);
      if (res.passages.length > 0) setExpandedPassageId(res.passages[0].id);
    } catch (err: unknown) {
      console.error(err);
      toast('Lỗi khi đọc file Excel: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
      handleFileChange(droppedFile);
    } else {
      toast('Vui lòng chọn file Excel định dạng .xlsx hoặc .xls', 'error');
    }
  };

  const handleCreateNewSubject = async () => {
    const trimmed = newSubjectName.trim();
    if (!trimmed) {
      toast('Tên môn học không được để trống', 'error');
      return;
    }
    try {
      const created = await createSubject(trimmed);
      setAvailableSubjects((prev) => [...prev, created]);
      setSelectedSubjectId(created.id);
      setNewSubjectName('');
      setIsCreatingSubject(false);
      toast(`Đã tạo môn học "${created.name}"`, 'success');
    } catch (err: unknown) {
      toast('Lỗi tạo môn học: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current || importing) return;
    if (!parseResult || !parseResult.success || parseResult.validQuestions.length === 0) {
      toast('Không có câu hỏi hợp lệ để nhập', 'error');
      return;
    }
    if (!title.trim()) {
      toast('Vui lòng nhập tên bài học', 'error');
      return;
    }
    if (!selectedSubjectId) {
      toast('Chưa có môn học. Vui lòng tạo hoặc chọn môn học trước khi nhập!', 'error');
      return;
    }

    try {
      isSubmittingRef.current = true;
      setImporting(true);

      const lessonId = `lexam_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const selectedSubject = availableSubjects.find((s) => s.id === selectedSubjectId);

      // Chuyển đổi các đoạn văn sang ReadingExamPassage
      const passages: ReadingExamPassage[] = parseResult.passages.map((p) =>
        parsedPassageToReadingPassage(p, lessonId)
      );

      // Map temporary passage id (p_1, p_2) sang actual database passage id
      const passageIdMap = new Map<string, string>();
      parseResult.passages.forEach((p, idx) => {
        passageIdMap.set(p.id, passages[idx].id);
      });

      // Chuyển đổi các câu hỏi sang ExamQuestion
      const examQuestions: ExamQuestion[] = parseResult.validQuestions.map((q) =>
        parsedQuestionToReadingExamQuestion(q, lessonId, passageIdMap)
      );

      // Đúng 1 Lesson duy nhất
      const lesson: Lesson = {
        id: lessonId,
        title: title.trim(),
        source: 'Excel Luyện thi Đọc hiểu',
        sheetId: '',
        meaning: `Đề thi luyện đọc hiểu JLPT ${jlptLevel} gồm ${passages.length} đoạn văn và ${examQuestions.length} câu hỏi`,
        connectionRule: '',
        notes: description.trim(),
        distinction: '',
        examples: [],
        exercises: [],
        answers: [],
        sortOrder: 0,
        targetClasses: selectedClasses.length > 0 ? selectedClasses : ['Tất cả'],
        categoryId: 'cat-reading',
        folderId: selectedFolderId,
        createdBy: currentUser.id,
        subjectId: selectedSubjectId,
        subjectName: selectedSubject?.name,
        startAt: null,
        deadline: null,
        classSchedules: {},
        examQuestionsCount: examQuestions.length,
        passageCount: passages.length,
        lessonType: 'reading_exam',
        jlptLevel,
        description: description.trim(),
        createdAt: new Date().toISOString(),
      };

      await onImport(lesson, passages, examQuestions);
      toast(`Đã nhập thành công 1 bài học đọc hiểu gồm ${passages.length} đoạn văn và ${examQuestions.length} câu hỏi!`, 'success');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fade-in">
      <div className="flex h-[92vh] w-full max-w-4xl flex-col rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shadow-2xs">
              <BookOpenText size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Nhập Đề Luyện Thi Đọc Hiểu từ Excel
              </h2>
              <p className="text-xs text-slate-500">
                1 file Excel = 1 Lesson luyện thi gồm nhiều đoạn văn và câu hỏi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* File Upload Zone */}
          {!parseResult && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center transition-all ${
                dragOver
                  ? 'border-amber-500 bg-amber-50/60 scale-[0.99]'
                  : 'border-slate-200 bg-slate-50/50 hover:border-amber-300 hover:bg-amber-50/20'
              }`}
            >
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shadow-xs">
                <Upload size={28} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                Kéo thả file Excel vào đây, hoặc click để chọn file
              </h3>
              <p className="mt-1 text-xs text-slate-500 max-w-md">
                File cần có sheet <strong>câu hỏi input mấu</strong> theo chuẩn 12 cột (Đoạn văn, Câu hỏi, Đáp án A-D, Đáp án đúng, Thời gian, Dịch tiếng Việt, Phân tích, Hán tự, Ngữ pháp).
              </p>

              <div className="mt-5 flex items-center gap-3">
                <label className="cursor-pointer rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 active:scale-[0.98] transition-all">
                  <span>Chọn file từ máy tính</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={(e) => {
                      const selected = e.target.files?.[0];
                      if (selected) handleFileChange(selected);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={downloadReadingExamTemplate}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition-all"
                >
                  <Download size={15} />
                  <span>Tải file mẫu (Câu 48-52)</span>
                </button>
              </div>

              {loading && (
                <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-amber-800">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                  Đang phân tích cấu trúc đoạn văn và câu hỏi...
                </div>
              )}
            </div>
          )}

          {/* Parse Result Summary & Metadata form */}
          {parseResult && (
            <div className="space-y-6">
              {/* File Info Card */}
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                    <FileSpreadsheet size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-800">
                      {file?.name || 'File đã chọn'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {parseResult.summary.totalRows} hàng dữ liệu • {parseResult.passages.length} đoạn văn • {parseResult.validQuestions.length} câu hỏi
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setParseResult(null);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Chọn file khác
                  </button>
                  <button
                    type="button"
                    onClick={downloadReadingExamTemplate}
                    className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    <Download size={13} />
                    Mẫu
                  </button>
                </div>
              </div>

              {/* Status Banner */}
              {parseResult.errors.length > 0 ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-800 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-rose-900">
                    <AlertCircle size={16} />
                    Phát hiện {parseResult.errors.length} lỗi trong file Excel:
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-rose-700 text-[11px]">
                    {parseResult.errors.slice(0, 5).map((e, idx) => (
                      <li key={idx}>
                        Dòng {e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 flex items-center justify-between text-xs text-emerald-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    File Excel hợp lệ: 1 Bài học • {parseResult.passages.length} Đoạn văn • {parseResult.validQuestions.length} Câu hỏi sẵn sàng nhập!
                  </div>
                  {parseResult.summary.noOfficialAnswerCount > 0 && (
                    <span className="rounded bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                      {parseResult.summary.noOfficialAnswerCount} câu chưa có đáp án chính thức
                    </span>
                  )}
                </div>
              )}

              {/* Metadata Form */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-2xs">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <Sparkles size={16} className="text-amber-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    Thông tin Bài học Đọc hiểu (1 Lesson duy nhất)
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tên bài học */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tên bài học <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="VD: Luyện thi Đọc hiểu N2 - 紅葉の異変 & 言葉の定義づけ"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  {/* Môn học */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Môn học được phép <span className="text-rose-500">*</span>
                      </label>
                      {currentUser.role === 'admin' && !isCreatingSubject && (
                        <button
                          type="button"
                          onClick={() => setIsCreatingSubject(true)}
                          className="text-[11px] font-semibold text-amber-700 hover:underline"
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
                          placeholder="Nhập tên môn học..."
                          className="flex-1 rounded-xl border border-amber-300 px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <button
                          type="button"
                          onClick={handleCreateNewSubject}
                          className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                        >
                          Lưu
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsCreatingSubject(false)}
                          className="rounded-xl border border-slate-200 px-2 text-xs text-slate-500 hover:bg-slate-100"
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <select
                        value={selectedSubjectId}
                        onChange={(e) => setSelectedSubjectId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      >
                        {availableSubjects.length === 0 ? (
                          <option value="">Chưa có môn học - Vui lòng tạo môn trước</option>
                        ) : (
                          availableSubjects.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))
                        )}
                      </select>
                    )}
                  </div>

                  {/* Cấp độ JLPT */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cấp độ JLPT
                    </label>
                    <select
                      value={jlptLevel}
                      onChange={(e) => setJlptLevel(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="N1">JLPT N1</option>
                      <option value="N2">JLPT N2</option>
                      <option value="N3">JLPT N3</option>
                      <option value="N4">JLPT N4</option>
                      <option value="N5">JLPT N5</option>
                    </select>
                  </div>

                  {/* Thư mục lưu trữ */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Thư mục lưu trữ (Danh mục Đọc hiểu)
                    </label>
                    <select
                      value={selectedFolderId || ''}
                      onChange={(e) => setSelectedFolderId(e.target.value || null)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">(Gốc - Không thuộc thư mục nào)</option>
                      {readingFolders.map((f) => (
                        <option key={f.id} value={f.id}>
                          📁 {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Lớp áp dụng */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Lớp học áp dụng
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-1">
                      <button
                        type="button"
                        onClick={() => setSelectedClasses([])}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                          selectedClasses.length === 0
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Tất cả
                      </button>
                      {availableClasses.map((c) => {
                        const isSel = selectedClasses.includes(c.name);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedClasses((prev) =>
                                isSel ? prev.filter((x) => x !== c.name) : [...prev, c.name]
                              );
                            }}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                              isSel
                                ? 'bg-amber-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mô tả */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mô tả / Ghi chú bài học
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Ghi chú về nội dung bài đọc hiểu, mẹo ôn tập..."
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Preview Passages & Questions list */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Xem trước đoạn văn & câu hỏi ({parseResult.passages.length} đoạn • {parseResult.validQuestions.length} câu)
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Bấm vào từng câu để xem chi tiết giải thích
                  </span>
                </div>

                {/* Render Passages */}
                {parseResult.passages.map((passage, pIdx) => {
                  const pQuestions = parseResult.validQuestions.filter(
                    (q) => q.passageId === passage.id
                  );
                  const isPassageExpanded = expandedPassageId === passage.id;

                  return (
                    <div
                      key={passage.id}
                      className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs"
                    >
                      {/* Passage Header Banner */}
                      <div
                        onClick={() =>
                          setExpandedPassageId(isPassageExpanded ? null : passage.id)
                        }
                        className="flex items-center justify-between bg-slate-50 px-4 py-3 cursor-pointer hover:bg-slate-100/70 transition-colors border-b border-slate-100"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white font-bold text-xs">
                            {pIdx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-xs font-bold text-slate-800 font-jp">
                                {passage.passageTitle || `Đoạn văn ${pIdx + 1}`}
                              </p>
                              <span className="rounded bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 shrink-0">
                                {pQuestions.length} câu hỏi (Câu {pQuestions.map((q) => q.questionNo).join(', ')})
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5 font-jp">
                              {passage.passageJa.substring(0, 80)}...
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-slate-400">
                          {isPassageExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>

                      {/* Passage Preview Content */}
                      {isPassageExpanded && (
                        <div className="p-4 space-y-4 bg-slate-50/40">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            {/* Japanese Passage Card */}
                            <div className="rounded-xl border border-amber-200 bg-[#FFFDF7] p-3.5 space-y-1.5 shadow-2xs">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                                <BookOpenText size={13} /> Đoạn văn tiếng Nhật (Mặt trước)
                              </p>
                              <p className="text-xs text-slate-800 leading-relaxed font-jp whitespace-pre-wrap max-h-48 overflow-y-auto pr-1">
                                {passage.passageJa}
                              </p>
                            </div>

                            {/* Vietnamese Translation Card */}
                            <div className="rounded-xl border border-sky-200 bg-[#EAF3FB] p-3.5 space-y-1.5 shadow-2xs">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800 flex items-center gap-1">
                                <FileText size={13} /> Bản dịch tiếng Việt (Mặt sau)
                              </p>
                              <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto pr-1">
                                {passage.passageVi || '(Chưa có bản dịch tiếng Việt)'}
                              </p>
                            </div>
                          </div>

                          {/* Questions for this passage */}
                          <div className="space-y-2.5 pt-2">
                            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                              Danh sách câu hỏi của đoạn {pIdx + 1}:
                            </p>

                            {pQuestions.map((q) => {
                              const isQExpanded = expandedQuestionNo === q.questionNo;
                              return (
                                <div
                                  key={q.questionNo}
                                  className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 hover:border-amber-300 transition-all shadow-2xs"
                                >
                                  <div
                                    onClick={() =>
                                      setExpandedQuestionNo(isQExpanded ? null : q.questionNo)
                                    }
                                    className="flex items-start justify-between gap-3 cursor-pointer"
                                  >
                                    <div className="flex items-start gap-2.5 min-w-0">
                                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700 font-bold text-xs mt-0.5">
                                        {q.questionNo}
                                      </span>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          {q.topic && (
                                            <span className="rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold px-1.5 py-0.2">
                                              {q.topic}
                                            </span>
                                          )}
                                          {q.correctAnswer ? (
                                            <span className="rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2">
                                              Đáp án: {q.correctAnswer}
                                            </span>
                                          ) : (
                                            <span className="rounded bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2">
                                              Chưa có đáp án chính thức
                                            </span>
                                          )}
                                          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                            <Clock size={10} /> {q.timeSeconds}s
                                          </span>
                                        </div>
                                        <p className="mt-1 text-xs font-semibold text-slate-800 font-jp leading-snug">
                                          {q.questionText}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      className="text-slate-400 hover:text-slate-600 mt-1"
                                    >
                                      {isQExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                  </div>

                                  {/* Expanded question details */}
                                  {isQExpanded && (
                                    <div className="pt-2 border-t border-slate-100 space-y-3 text-xs animate-fade-in">
                                      {/* 4 Choices */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                                          const optText = optKey === 'A' ? q.optionA : optKey === 'B' ? q.optionB : optKey === 'C' ? q.optionC : q.optionD;
                                          const isCorrect = q.correctAnswer === optKey;
                                          return (
                                            <div
                                              key={optKey}
                                              className={`rounded-lg border p-2 flex items-start gap-2 ${
                                                isCorrect
                                                  ? 'border-emerald-300 bg-emerald-50/60 font-semibold text-emerald-950'
                                                  : 'border-slate-200 bg-slate-50/50 text-slate-700'
                                              }`}
                                            >
                                              <span
                                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold ${
                                                  isCorrect
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-slate-200 text-slate-700'
                                                }`}
                                              >
                                                {optKey}
                                              </span>
                                              <span className="font-jp text-xs leading-relaxed">
                                                {optText}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>

                                      {/* Explanation */}
                                      {q.explanation && (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1">
                                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            Phân tích & Minh chứng đáp án
                                          </p>
                                          <p className="whitespace-pre-wrap text-[11px] text-slate-700 leading-relaxed font-jp">
                                            {q.explanation}
                                          </p>
                                        </div>
                                      )}

                                      {/* Kanji & Grammar */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {q.kanjiVocabulary && (
                                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 space-y-1">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                                              Hán tự trong đoạn văn
                                            </p>
                                            <p className="whitespace-pre-wrap text-[11px] text-slate-700 leading-relaxed font-jp">
                                              {q.kanjiVocabulary}
                                            </p>
                                          </div>
                                        )}
                                        {q.grammarStructures && (
                                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 space-y-1">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                                              Cấu trúc ngữ pháp
                                            </p>
                                            <p className="whitespace-pre-wrap text-[11px] text-slate-700 leading-relaxed font-jp">
                                              {q.grammarStructures}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!parseResult || !parseResult.success || importing || !selectedSubjectId}
            className="flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {importing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Đang nhập đề đọc hiểu...</span>
              </>
            ) : (
              <>
                <BookOpenText size={16} />
                <span>
                  Nhập bài học đọc hiểu ({parseResult?.validQuestions.length ?? 0} câu)
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
