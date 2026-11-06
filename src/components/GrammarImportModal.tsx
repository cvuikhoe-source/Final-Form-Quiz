import { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import type {
  Lesson,
  GrammarItem,
  LessonCategory,
  LessonFolder,
  User,
} from '@/types';
import { generateId, loadGrammarItems, loadSubjectItems, createSubject, type SubjectItem } from '@/storage';
import { loadLessonFolders } from '@/lib/lessonFolderService';
import {
  downloadGrammarExcelTemplate,
  parseGrammarExcelWorkbook,
  rowResultToGrammarItem,
  ParsedGrammarRowResult,
  GrammarExcelParseResult,
} from '@/lib/grammarExcelTemplate';
import {
  buildExistingGrammarLookupMap,
  findMatchInGrammarLookupMap,
  buildGrammarMergePlan,
  GrammarMergePlan,
} from '@/lib/grammarDuplicateMergeService';
import { toast } from './Toast';
import {
  X, Upload, FileSpreadsheet, AlertTriangle,
  Download, RefreshCw, BookOpen,
  ChevronRight, ArrowLeft, Search, ChevronDown, ChevronUp,
  HelpCircle, ShieldCheck, CheckCheck
} from 'lucide-react';

export type ExistingGrammarStrategy = 'fill_missing' | 'update_existing' | 'skip_existing';

export interface GrammarImportModalProps {
  currentUser?: User;
  onClose: () => void;
  onImport: (lesson: Lesson, grammarItems: GrammarItem[]) => Promise<void> | void;
  categories?: LessonCategory[];
  targetFolderId?: string | null;
  targetLesson?: Lesson;
  existingItems?: GrammarItem[];
}

type Phase = 'select' | 'validation' | 'meta' | 'preview' | 'importing';

interface RowWithDuplicateInfo {
  parsedRow: ParsedGrammarRowResult;
  item: GrammarItem;
  duplicateAction: 'create' | 'update' | 'unchanged' | 'conflict';
  existingMatch?: GrammarItem;
  mergePlan?: GrammarMergePlan;
}

export function GrammarImportModal({
  currentUser,
  onClose,
  onImport,
  targetFolderId,
  targetLesson,
  existingItems = [],
}: GrammarImportModalProps) {
  const [phase, setPhase] = useState<Phase>('select');
  const [fileName, setFileName] = useState('');
  const [parseResult, setParseResult] = useState<GrammarExcelParseResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Lesson Metadata Form
  const [lessonName, setLessonName] = useState(targetLesson ? targetLesson.title : 'Ngữ pháp N2');
  const [description, setDescription] = useState(targetLesson ? targetLesson.meaning : '');
  const [jlptLevel, setJlptLevel] = useState<string>('N2');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(targetFolderId ?? null);
  const [lessonStatus, setLessonStatus] = useState<'published' | 'draft'>('published');
  const [availableFolders, setAvailableFolders] = useState<LessonFolder[]>([]);

  // Subject selection & state
  const [availableSubjects, setAvailableSubjects] = useState<SubjectItem[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(targetLesson?.subjectId ?? '');
  const [isCreatingSubject, setIsCreatingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const isSubmittingRef = useRef(false);

  // Duplicate resolution & filters
  const [existingStrategy, setExistingStrategy] = useState<ExistingGrammarStrategy>('fill_missing');
  const [activeFilter, setActiveFilter] = useState<'all' | 'valid' | 'duplicate' | 'invalid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Load lesson folders
  useEffect(() => {
    loadLessonFolders('cat-grammar')
      .then((f: LessonFolder[]) => setAvailableFolders(f))
      .catch(() => {});
  }, []);

  // Load subjects from database
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

  // Teachers can only select subjects in allowedSubjects
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

  // Tải danh sách item hiện có để phát hiện trùng lặp
  const [loadedExistingItems, setLoadedExistingItems] = useState<GrammarItem[]>(existingItems);
  useEffect(() => {
    if (targetLesson?.id && (!existingItems || existingItems.length === 0)) {
      loadGrammarItems(targetLesson.id).then((items) => {
        if (items && items.length > 0) setLoadedExistingItems(items);
      }).catch(() => {});
    }
  }, [targetLesson, existingItems]);

  const lookupMap = useMemo(() => {
    return buildExistingGrammarLookupMap(loadedExistingItems || []);
  }, [loadedExistingItems]);

  // Phân tích và xử lý trùng lặp trên các dòng hợp lệ
  const evaluatedRows: RowWithDuplicateInfo[] = useMemo(() => {
    if (!parseResult) return [];

    return parseResult.validRows.map((row) => {
      const tempItem = rowResultToGrammarItem(row, targetLesson?.id || 'temp-lesson-id', generateId);
      const match = findMatchInGrammarLookupMap(lookupMap, row.grammarPattern, row.itemCode);

      if (match) {
        const mergePlan = buildGrammarMergePlan(match, tempItem);
        return {
          parsedRow: row,
          item: tempItem,
          duplicateAction: mergePlan.action,
          existingMatch: match,
          mergePlan,
        };
      }

      return {
        parsedRow: row,
        item: tempItem,
        duplicateAction: 'create',
      };
    });
  }, [parseResult, lookupMap, targetLesson]);

  // Thống kê tổng quan
  const stats = useMemo(() => {
    if (!parseResult) {
      return { total: 0, valid: 0, invalid: 0, skipped: 0, duplicate: 0, examples: 0, exercises: 0, answers: 0 };
    }

    let examplesCount = 0;
    let exercisesCount = 0;
    let answersCount = 0;

    parseResult.validRows.forEach((r) => {
      examplesCount += r.examples?.length || 0;
      exercisesCount += r.exercises?.length || 0;
      answersCount += r.answers?.length || 0;
    });

    const duplicateCount = evaluatedRows.filter((r) => r.duplicateAction !== 'create').length;

    return {
      total: parseResult.totalRows,
      valid: parseResult.validRows.length,
      invalid: parseResult.invalidRows.length,
      skipped: parseResult.skippedRows.length,
      duplicate: duplicateCount,
      examples: examplesCount,
      exercises: exercisesCount,
      answers: answersCount,
    };
  }, [parseResult, evaluatedRows]);

  // Bộ lọc tìm kiếm & tab
  const filteredRows = useMemo(() => {
    let list = evaluatedRows;
    if (activeFilter === 'duplicate') {
      list = list.filter((r) => r.duplicateAction !== 'create');
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((r) => {
      const code = (r.parsedRow.itemCode || '').toLowerCase();
      const pat = (r.parsedRow.grammarPattern || '').toLowerCase();
      const mean = (r.parsedRow.meaning || '').toLowerCase();
      return code.includes(q) || pat.includes(q) || mean.includes(q);
    });
  }, [evaluatedRows, activeFilter, searchQuery]);

  // Xử lý đọc file Excel
  const handleProcessFile = (file: File) => {
    setFileName(file.name);
    setParseResult(null);

    // Gợi ý tên bài học từ tên file nếu chưa có
    const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
    if (!targetLesson && baseName.length > 2) {
      setLessonName(baseName.charAt(0).toUpperCase() + baseName.slice(1));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const res = parseGrammarExcelWorkbook(wb);

        setParseResult(res);

        if (res.inferredLessonTitle && !targetLesson) {
          setLessonName(res.inferredLessonTitle);
        }
        if (res.inferredJlptLevel) {
          setJlptLevel(res.inferredJlptLevel);
        }

        // Chuyển sang bước 2: Kiểm tra dữ liệu & validation
        setPhase('validation');
      } catch (err: unknown) {
        console.error('Lỗi khi đọc file Excel:', err);
        const msg = err instanceof Error ? err.message : 'File không đúng định dạng';
        toast(`Lỗi khi đọc file: ${msg}`, 'error');
      }
    };
    reader.onerror = () => {
      toast('Không thể đọc file từ thiết bị', 'error');
    };
    reader.readAsArrayBuffer(file);
  };

  // Thực thi Import nguyên khối (Atomic)
  const handleConfirmImport = async () => {
    if (isSubmittingRef.current || isImporting) return;
    if (!parseResult || evaluatedRows.length === 0) {
      toast('Không có mục ngữ pháp hợp lệ nào để nhập.', 'error');
      return;
    }
    if (!selectedSubjectId) {
      toast('Vui lòng chọn môn học cho bài học trước khi nhập', 'error');
      setPhase('meta');
      return;
    }

    isSubmittingRef.current = true;
    setIsImporting(true);
    setPhase('importing');

    try {
      // 1. Tạo DUY NHẤT 1 Lesson cho cả file
      const finalLessonId = targetLesson ? targetLesson.id : generateId('lesson-grammar');
      const finalLessonTitle = lessonName.trim() || 'Bài học Ngữ pháp';
      const selectedSubject = availableSubjects.find((s) => s.id === selectedSubjectId);

      const finalLesson: Lesson = targetLesson ? {
        ...targetLesson,
        title: finalLessonTitle,
        meaning: description.trim() || targetLesson.meaning,
        folderId: selectedFolderId ?? targetLesson.folderId ?? null,
        subjectId: selectedSubjectId,
        subjectName: selectedSubject?.name ?? targetLesson.subjectName ?? null,
      } : {
        id: finalLessonId,
        title: finalLessonTitle,
        source: fileName || 'Nhập từ Excel',
        sheetId: parseResult.sheetName || 'Grammar_Data',
        meaning: description.trim() || `${evaluatedRows.length} mục ngữ pháp`,
        connectionRule: '',
        notes: '',
        distinction: '',
        examples: [],
        exercises: [],
        answers: [],
        sortOrder: 1,
        targetClasses: [],
        categoryId: 'cat-grammar',
        folderId: selectedFolderId ?? null,
        subjectId: selectedSubjectId,
        subjectName: selectedSubject?.name ?? null,
        startAt: null,
        deadline: null,
        classSchedules: {},
        itemCount: evaluatedRows.length,
        createdAt: new Date().toISOString(),
      };

      // 2. Gộp danh sách các GrammarItem với cùng finalLessonId
      const finalGrammarItems: GrammarItem[] = [];

      evaluatedRows.forEach((rowInfo) => {
        const { item, duplicateAction, existingMatch, mergePlan } = rowInfo;

        if (duplicateAction === 'create') {
          finalGrammarItems.push({
            ...item,
            id: generateId('gitem'),
            lessonId: finalLessonId,
          });
        } else if (duplicateAction === 'update' || duplicateAction === 'conflict') {
          if (existingStrategy === 'skip_existing') {
            return;
          } else if (existingStrategy === 'update_existing') {
            finalGrammarItems.push({
              ...item,
              id: existingMatch?.id || item.id,
              lessonId: finalLessonId,
            });
          } else if (existingStrategy === 'fill_missing' && mergePlan) {
            finalGrammarItems.push({
              ...mergePlan.mergedItem,
              id: existingMatch?.id || item.id,
              lessonId: finalLessonId,
            });
          } else {
            finalGrammarItems.push({
              ...item,
              id: generateId('gitem'),
              lessonId: finalLessonId,
            });
          }
        } else {
          finalGrammarItems.push({
            ...item,
            id: generateId('gitem'),
            lessonId: finalLessonId,
          });
        }
      });

      // 3. Thực thi nhập bài học & items
      await onImport(finalLesson, finalGrammarItems);

      toast(
        `Đã tạo thành công 1 bài học "${finalLesson.title}" gồm ${finalGrammarItems.length} mục ngữ pháp!`,
        'success'
      );
      onClose();
    } catch (err: unknown) {
      console.error('Lỗi khi nhập bài học ngữ pháp:', err);
      const msg = err instanceof Error ? err.message : 'Quá trình nhập dữ liệu gặp lỗi. Đã tự động hủy thao tác.';
      toast(msg, 'error');
      setPhase('preview');
    } finally {
      setIsImporting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] sm:max-h-[90vh] flex flex-col rounded-2xl sm:rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 sm:px-6 py-3.5 bg-gradient-to-r from-indigo-50/60 via-white to-blue-50/40 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl sm:rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
              <BookOpen size={19} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                {targetLesson ? `Nhập thêm ngữ pháp: ${targetLesson.title}` : 'Nhập Ngữ pháp từ Excel'}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                1 file Excel = 1 bài học duy nhất chứa nhiều mục ngữ pháp (GrammarItem)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Phase Stepper */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 sm:px-6 py-2 text-xs overflow-x-auto shrink-0">
          <div className="flex items-center gap-1 sm:gap-2">
            <span className={`font-semibold ${phase === 'select' ? 'text-indigo-600' : 'text-slate-700'}`}>1. Chọn file</span>
            <ChevronRight size={13} className="text-slate-300" />
            <span className={`font-semibold ${phase === 'validation' ? 'text-indigo-600' : 'text-slate-500'}`}>2. Đọc & Kiểm tra</span>
            <ChevronRight size={13} className="text-slate-300" />
            <span className={`font-semibold ${phase === 'meta' ? 'text-indigo-600' : 'text-slate-500'}`}>3. Thông tin bài</span>
            <ChevronRight size={13} className="text-slate-300" />
            <span className={`font-semibold ${phase === 'preview' ? 'text-indigo-600' : 'text-slate-500'}`}>4. Xem trước & Xử lý trùng</span>
            <ChevronRight size={13} className="text-slate-300" />
            <span className={`font-semibold ${phase === 'importing' ? 'text-indigo-600' : 'text-slate-400'}`}>5. Hoàn tất</span>
          </div>
        </div>

        {/* Main Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* ─── BƯỚC 1: CHỌN FILE & TẢI FILE MẪU ────────────────────── */}
          {phase === 'select' && (
            <div className="space-y-5">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
                    handleProcessFile(file);
                  } else {
                    toast('Vui lòng chọn file Excel định dạng .xlsx hoặc .xls', 'error');
                  }
                }}
                className={`flex flex-col items-center justify-center rounded-2xl sm:rounded-3xl border-2 border-dashed p-8 sm:p-10 text-center transition-all ${
                  dragOver
                    ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]'
                    : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="mb-3.5 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 shadow-inner">
                  <Upload size={28} />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-slate-800 mb-1">
                  Kéo và thả file Excel (.xlsx) vào đây
                </h3>
                <p className="text-xs text-slate-500 max-w-md mb-4 leading-relaxed">
                  File mẫu hỗ trợ đầy đủ các trường cấu trúc, ý nghĩa, ví dụ (JSON), bài tập (JSON) và đáp án (JSON).
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleProcessFile(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    <FileSpreadsheet size={16} />
                    <span>Chọn file từ thiết bị</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadGrammarExcelTemplate()}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-2.5 text-xs sm:text-sm font-semibold text-indigo-700 hover:bg-indigo-100 active:scale-95 transition-all"
                  >
                    <Download size={16} />
                    <span>Tải file Excel mẫu chuẩn (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Hộp giải thích quy cách */}
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 space-y-2 text-xs text-blue-900 leading-relaxed">
                <div className="flex items-center gap-2 font-bold text-blue-800">
                  <HelpCircle size={16} />
                  <span>Quy cách nhập dữ liệu Ngữ pháp chuẩn hóa</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1">
                  <li>Một file Excel tạo đúng một bài học (ví dụ: "Ngữ pháp N2").</li>
                  <li>Mỗi hàng trong sheet <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono text-[11px]">Grammar_Data</code> là một mục ngữ pháp hoàn chỉnh.</li>
                  <li>Nếu file có 50 hàng: Tạo đúng 1 Lesson chứa 50 GrammarItem bên trong.</li>
                  <li>Ví dụ, bài tập và đáp án được lưu dạng JSON array và liên kết chính xác qua STT.</li>
                </ul>
              </div>
            </div>
          )}

          {/* ─── BƯỚC 2: VALIDATION & BÁO CÁO PHÂN TÍCH ──────────────── */}
          {phase === 'validation' && parseResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Kết quả đọc file: <span className="text-indigo-600">{fileName}</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sheet dữ liệu: <code className="font-mono font-semibold">{parseResult.sheetName}</code>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setPhase('select')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  <RefreshCw size={13} />
                  <span>Chọn file khác</span>
                </button>
              </div>

              {/* 4 Cards thống kê nhanh */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold text-slate-500">Tổng số hàng</p>
                  <p className="text-lg font-bold text-slate-900">{stats.total}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-[11px] font-semibold text-emerald-700">Hàng hợp lệ</p>
                  <p className="text-lg font-bold text-emerald-800">{stats.valid}</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                  <p className="text-[11px] font-semibold text-rose-700">Hàng có lỗi</p>
                  <p className="text-lg font-bold text-rose-800">{stats.invalid}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-[11px] font-semibold text-amber-700">Bỏ qua (Inactive)</p>
                  <p className="text-lg font-bold text-amber-800">{stats.skipped}</p>
                </div>
              </div>

              {/* Thống kê nội dung phụ trợ */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 font-semibold text-indigo-700">
                  {stats.examples} câu ví dụ
                </span>
                <span className="rounded-lg bg-orange-50 border border-orange-200 px-2.5 py-1 font-semibold text-orange-700">
                  {stats.exercises} bài tập luyện tập
                </span>
                <span className="rounded-lg bg-pink-50 border border-pink-200 px-2.5 py-1 font-semibold text-pink-700">
                  {stats.answers} đáp án & giải thích
                </span>
              </div>

              {/* Danh sách lỗi nếu có */}
              {parseResult.invalidRows.length > 0 && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-800">
                    <AlertTriangle size={15} />
                    <span>Phát hiện {parseResult.invalidRows.length} hàng dữ liệu chưa đạt yêu cầu:</span>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {parseResult.invalidRows.map((r, i) => (
                      <div key={i} className="rounded-xl bg-white border border-rose-100 p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between font-bold text-slate-800">
                          <span>Dòng {r.rowNumber}: {r.grammarPattern || r.itemCode || '(Chưa có tên)'}</span>
                          <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
                            {r.errors.length} lỗi
                          </span>
                        </div>
                        {r.errors.map((err, j) => (
                          <p key={j} className="text-rose-600 text-[11px]">
                            • <strong>Cột [{err.column}]:</strong> {err.reason}
                            <span className="text-slate-500 ml-1">({err.fixSuggestion})</span>
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] text-slate-500 italic">
                    Lưu ý: Các hàng có lỗi sẽ tự động được loại bỏ. Bạn có thể tiếp tục với {stats.valid} hàng hợp lệ hoặc sửa file Excel rồi tải lại.
                  </p>
                </div>
              )}

              {/* Nút hành động */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPhase('select')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <ArrowLeft size={14} />
                  <span>Quay lại</span>
                </button>

                <button
                  type="button"
                  disabled={stats.valid === 0}
                  onClick={() => setPhase('meta')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>Tiếp tục thiết lập bài học ({stats.valid} mục)</span>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ─── BƯỚC 3: CẤU HÌNH THÔNG TIN BÀI HỌC ─────────────────── */}
          {phase === 'meta' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Thiết lập thông tin chung cho bài học</h3>
                <p className="text-xs text-slate-500">
                  Thông tin này áp dụng cho toàn bộ {stats.valid} mục ngữ pháp trong file
                </p>
              </div>

              <div className="space-y-3.5 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
                {/* Tên bài học */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên bài học ngữ pháp <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={lessonName}
                    onChange={(e) => setLessonName(e.target.value)}
                    placeholder="Ví dụ: Ngữ pháp N2 - Shinkanzen Master"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Toàn bộ {stats.valid} mục ngữ pháp sẽ nằm bên trong bài học này.
                  </p>
                </div>

                {/* Mô tả bài học */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mô tả bài học
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Nhập mô tả tóm tắt nội dung bài học..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Môn học (bắt buộc) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Môn học <span className="text-rose-500">*</span>
                    </label>
                    {(!currentUser || currentUser.role === 'admin') && (
                      <button
                        type="button"
                        onClick={() => setIsCreatingSubject((prev) => !prev)}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        {isCreatingSubject ? 'Đóng tạo môn học' : '⊕ Thêm môn học mới'}
                      </button>
                    )}
                  </div>

                  {isCreatingSubject && (
                    <div className="flex items-center gap-2 mb-2 p-2 bg-indigo-50/70 border border-indigo-200 rounded-xl">
                      <input
                        type="text"
                        value={newSubjectName}
                        onChange={(e) => setNewSubjectName(e.target.value)}
                        placeholder="Nhập tên môn học mới..."
                        className="flex-1 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 shadow-xs"
                      >
                        Lưu môn
                      </button>
                    </div>
                  )}

                  {selectableSubjects.length === 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      <p className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                        Chưa có môn học. Vui lòng tạo môn học trước.
                      </p>
                      {currentUser && currentUser.role !== 'admin' && (
                        <p className="mt-1 text-[11px] text-amber-700">
                          Bạn chưa được gán môn học nào. Vui lòng liên hệ Admin để phân quyền môn học.
                        </p>
                      )}
                    </div>
                  ) : (
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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

                {/* Grid: JLPT + Thư mục + Trạng thái */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Cấp độ JLPT</label>
                    <select
                      value={jlptLevel}
                      onChange={(e) => setJlptLevel(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="N1">JLPT N1</option>
                      <option value="N2">JLPT N2</option>
                      <option value="N3">JLPT N3</option>
                      <option value="N4">JLPT N4</option>
                      <option value="N5">JLPT N5</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Thư mục đích</label>
                    <select
                      value={selectedFolderId || ''}
                      onChange={(e) => setSelectedFolderId(e.target.value || null)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">(Thư mục gốc)</option>
                      {availableFolders.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Trạng thái phát hành</label>
                    <select
                      value={lessonStatus}
                      onChange={(e) => setLessonStatus(e.target.value as 'published' | 'draft')}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="published">Xuất bản (Published)</option>
                      <option value="draft">Bản nháp (Draft)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Nút điều hướng */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPhase('validation')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <ArrowLeft size={14} />
                  <span>Quay lại</span>
                </button>

                <button
                  type="button"
                  disabled={!lessonName.trim() || !selectedSubjectId}
                  onClick={() => setPhase('preview')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>Xem trước & Xử lý trùng</span>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ─── BƯỚC 4: XEM TRƯỚC & XỬ LÝ TRÙNG LẶP ────────────────── */}
          {phase === 'preview' && (
            <div className="space-y-4">
              {/* Header preview & Tìm kiếm */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Xem trước danh sách mục ngữ pháp ({evaluatedRows.length} mục)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Bài học: <strong>{lessonName}</strong> • {stats.examples} ví dụ • {stats.exercises} bài tập • {stats.answers} đáp án
                  </p>
                </div>

                <div className="relative w-full sm:w-60">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm theo mẫu, mã, ý nghĩa..."
                    className="w-full rounded-xl border border-slate-200 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Tabs lọc hiển thị */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    activeFilter === 'all'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Tất cả ({evaluatedRows.length})
                </button>
                {stats.duplicate > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveFilter('duplicate')}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      activeFilter === 'duplicate'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    Trùng lặp ({stats.duplicate})
                  </button>
                )}
              </div>

              {/* Chiến lược xử lý trùng lặp nếu có mục trùng */}
              {stats.duplicate > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <ShieldCheck size={16} className="text-amber-700" />
                    <span>Phát hiện {stats.duplicate} mục ngữ pháp trùng với dữ liệu đã có. Chọn cách xử lý:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      existingStrategy === 'fill_missing'
                        ? 'border-amber-400 bg-amber-100/70 font-semibold'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}>
                      <input
                        type="radio"
                        name="dupStrategy"
                        checked={existingStrategy === 'fill_missing'}
                        onChange={() => setExistingStrategy('fill_missing')}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-slate-800">Điền trường còn thiếu</p>
                        <p className="text-[10px] text-slate-500 font-normal">Giữ nguyên dữ liệu cũ, chỉ bổ sung ví dụ/bài tập mới.</p>
                      </div>
                    </label>

                    <label className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      existingStrategy === 'update_existing'
                        ? 'border-amber-400 bg-amber-100/70 font-semibold'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}>
                      <input
                        type="radio"
                        name="dupStrategy"
                        checked={existingStrategy === 'update_existing'}
                        onChange={() => setExistingStrategy('update_existing')}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-slate-800">Ghi đè mục trùng</p>
                        <p className="text-[10px] text-slate-500 font-normal">Cập nhật toàn bộ nội dung từ file Excel vào mục cũ.</p>
                      </div>
                    </label>

                    <label className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      existingStrategy === 'skip_existing'
                        ? 'border-amber-400 bg-amber-100/70 font-semibold'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}>
                      <input
                        type="radio"
                        name="dupStrategy"
                        checked={existingStrategy === 'skip_existing'}
                        onChange={() => setExistingStrategy('skip_existing')}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-slate-800">Bỏ qua mục trùng</p>
                        <p className="text-[10px] text-slate-500 font-normal">Không import lại các mục đã tồn tại trong bài học.</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Danh sách Accordion các mục ngữ pháp */}
              <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-80 overflow-y-auto bg-white">
                {filteredRows.map((r, idx) => {
                  const isExpanded = expandedRow === idx;
                  const item = r.parsedRow;
                  const isDup = r.duplicateAction !== 'create';

                  return (
                    <div key={idx} className="transition-colors hover:bg-slate-50/50">
                      {/* Accordion Header */}
                      <div
                        onClick={() => setExpandedRow(isExpanded ? null : idx)}
                        className="flex items-center justify-between p-3 sm:p-3.5 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                            {idx + 1}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-jp text-xs sm:text-sm font-bold text-slate-900 truncate">
                                {item.grammarPattern}
                              </span>
                              {item.jlptLevel && (
                                <span className="shrink-0 rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 text-[10px] font-bold text-indigo-700">
                                  {item.jlptLevel}
                                </span>
                              )}
                              {isDup && (
                                <span className="shrink-0 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.2 text-[10px] font-bold text-amber-700">
                                  Trùng lặp ({r.duplicateAction})
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 truncate mt-0.5">
                              {item.itemCode ? `[${item.itemCode}] ` : ''}{item.meaning}
                            </p>
                          </div>
                        </div>

                        {/* Badges count + Toggle Icon */}
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-[11px] text-slate-400 hidden sm:inline">
                            {item.examples.length} ví dụ • {item.exercises.length} bài tập • {item.answers.length} đáp án
                          </span>
                          {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                        </div>
                      </div>

                      {/* Accordion Expandable Details */}
                      {isExpanded && (
                        <div className="p-3.5 sm:p-4 bg-slate-50/70 border-t border-slate-100 space-y-3 text-xs">
                          {/* Phần 1: Cấu trúc & Ý nghĩa */}
                          <div className="space-y-1.5">
                            <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                              1. Cấu trúc & Ý nghĩa
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-slate-200">
                              <div>
                                <span className="font-bold text-slate-500">Mã mục:</span> {item.itemCode || '(Chưa có)'}
                              </div>
                              <div>
                                <span className="font-bold text-slate-500">Nguồn:</span> {item.source || '(Chưa có)'}
                              </div>
                              <div className="sm:col-span-2">
                                <span className="font-bold text-slate-500">Quy tắc liên kết:</span> {item.connectionRule}
                              </div>
                              {item.caution && (
                                <div className="sm:col-span-2">
                                  <span className="font-bold text-amber-700">Lưu ý:</span> {item.caution}
                                </div>
                              )}
                              {item.distinction && (
                                <div className="sm:col-span-2">
                                  <span className="font-bold text-purple-700">Phân biệt:</span> {item.distinction}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Phần 2: Danh sách câu ví dụ */}
                          {item.examples.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="font-bold text-emerald-800 uppercase text-[10px] tracking-wider">
                                2. Câu ví dụ ({item.examples.length} câu)
                              </p>
                              <div className="space-y-1.5">
                                {item.examples.map((ex, exIdx) => (
                                  <div key={exIdx} className="bg-white p-2.5 rounded-xl border border-emerald-100 space-y-1">
                                    <p className="font-jp font-bold text-slate-900">
                                      #{ex.stt}: {ex.japanese}
                                    </p>
                                    <p className="text-emerald-800 font-medium">
                                      → {ex.vietnamese}
                                    </p>
                                    {ex.analysis && (
                                      <p className="text-slate-500 text-[11px]">
                                        <em>Phân tích:</em> {ex.analysis}
                                      </p>
                                    )}
                                    {ex.vocabulary_furigana && (
                                      <p className="text-slate-500 text-[11px]">
                                        <em>Furigana:</em> {ex.vocabulary_furigana}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Phần 3: Danh sách bài tập & đáp án */}
                          {item.exercises.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="font-bold text-orange-800 uppercase text-[10px] tracking-wider">
                                3. Bài tập & Đáp án ({item.exercises.length} bài tập)
                              </p>
                              <div className="space-y-2">
                                {item.exercises.map((exer, exerIdx) => {
                                  const matchingAnswer = item.answers.find((a) => a.stt === exer.stt);
                                  return (
                                    <div key={exerIdx} className="bg-white p-2.5 rounded-xl border border-orange-100 space-y-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-orange-700">#{exer.stt} ({exer.type}):</span>
                                        <span className="font-jp font-semibold text-slate-800">{exer.question}</span>
                                      </div>
                                      {exer.type === 'multiple_choice' && (
                                        <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 pl-2">
                                          <span>A: {exer.option_a}</span>
                                          <span>B: {exer.option_b}</span>
                                          {exer.option_c && <span>C: {exer.option_c}</span>}
                                          {exer.option_d && <span>D: {exer.option_d}</span>}
                                        </div>
                                      )}
                                      {matchingAnswer && (
                                        <div className="mt-1 pt-1 border-t border-slate-100 text-[11px] text-pink-700">
                                          <strong>Đáp án:</strong> {matchingAnswer.answer}
                                          {matchingAnswer.detailed_explanation && (
                                            <span className="text-slate-600 ml-1.5">({matchingAnswer.detailed_explanation})</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPhase('meta')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <ArrowLeft size={14} />
                  <span>Quay lại</span>
                </button>

                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isImporting || evaluatedRows.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-indigo-200 hover:from-indigo-700 hover:to-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <CheckCheck size={16} />
                  <span>Xác nhận nhập {evaluatedRows.length} mục vào 1 bài học</span>
                </button>
              </div>
            </div>
          )}

          {/* ─── BƯỚC 5: ĐANG THỰC HIỆN IMPORT (PROGRESS) ─────────────── */}
          {phase === 'importing' && (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 animate-spin">
                <RefreshCw size={28} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Đang thực thi nhập nguyên khối...</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Đang khởi tạo bài học "{lessonName}" và liên kết {evaluatedRows.length} mục ngữ pháp.
                </p>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
