import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { PracticeQuestionType, PracticeDifficulty } from '@/types';
import { generateId } from '@/storage';
import { toast } from '@/components/Toast';
import {
  X, FileSpreadsheet, Upload, Download, CheckCircle2, AlertCircle,
  AlertTriangle, Info, ChevronDown,
} from 'lucide-react';

export interface ImportedQuestion {
  id: string;
  questionType: PracticeQuestionType;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  explanation: string;
  hint: string;
  difficulty: PracticeDifficulty;
  questionCategory: string;
  tags: string;
  imageUrl: string;
  points: number;
}

interface ImportRow {
  rowNumber: number;
  questionNo: string;
  questionType: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  explanation: string;
  hint: string;
  points: string;
  difficulty: string;
  category: string;
  tags: string;
  imageUrl: string;
  errors: string[];
  warnings: string[];
}

const VALID_TYPES = ['single_choice', 'multiple_choice', 'true_false', 'short_answer'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
const LETTERS = ['A', 'B', 'C', 'D'];
const MAX_ROWS = 300;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const TYPE_LABEL: Record<string, string> = {
  single_choice: 'Chọn 1 đáp án',
  multiple_choice: 'Nhiều đáp án',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời ngắn',
};

function normalizeType(raw: string): string {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (VALID_TYPES.includes(v)) return v;
  return '';
}

function normalizeDifficulty(raw: string): PracticeDifficulty {
  const v = raw.trim().toLowerCase();
  if (v === 'easy' || v === 'dễ' || v === 'de') return 'easy';
  if (v === 'hard' || v === 'khó' || v === 'kho') return 'hard';
  return 'medium';
}

function normalizeLetters(raw: string): string[] {
  return raw.toUpperCase().replace(/[^A-D,]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function PracticeImportModal({ mode = 'create', targetFolderId = null, targetFolderName = null, onClose, onImport }: {
  mode?: 'create' | 'append';
  targetFolderId?: string | null;
  targetFolderName?: string | null;
  onClose: () => void;
  onImport: (imported: ImportedQuestion[]) => void;
}) {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<
    | { ok: true; expected: number; saved: number }
    | { ok: false; expected: number; saved: number; message: string }
    | null
  >(null);
  const [showGuide, setShowGuide] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importingRef = useRef(false);

  // Closing mid-import would orphan the save (its toasts would fire after the
  // modal is gone, appearing as random red flashes during navigation).
  const requestClose = () => { if (!importingRef.current) onClose(); };

  const downloadTemplate = () => {
    const headers = ['question_no', 'question_type', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'explanation', 'hint', 'points', 'difficulty', 'category', 'tags', 'image_url'];
    const examples = [
      [1, 'single_choice', '「食べる」の意味は？', 'ăn', 'uống', 'ngủ', 'đi', 'A', '食べる = ăn', 'Động từ nhóm 1', 1, 'easy', 'Danh từ cơ bản', 'jlpt-n5,dong-tu', ''],
      [2, 'multiple_choice', 'Những từ nào là động từ?', '食べる', '水', '飲む', '本', 'A,C', '食べる (ăn) và 飲む (uống) đều là động từ', '', 2, 'medium', 'Từ loại', 'jlpt-n4', ''],
      [3, 'true_false', '「猫」nghĩa là con chó.', 'Đúng', 'Sai', '', '', 'B', '猫 = con mèo, không phải con chó', '', 1, 'easy', 'Danh từ cơ bản', '', ''],
      [4, 'short_answer', 'Số 100 trong tiếng Nhật viết bằng Hiragana là gì?', '', '', '', '', 'ひゃく', '百 = ひゃく (một trăm)', '', 2, 'hard', 'Số đếm', 'jlpt-n5', ''],
    ];
    const wsQ = XLSX.utils.aoa_to_sheet([headers, ...examples]);
    wsQ['!cols'] = [{ wch: 11 }, { wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 34 }, { wch: 18 }, { wch: 8 }, { wch: 11 }, { wch: 16 }, { wch: 18 }, { wch: 22 }];

    const guideRows = [
      ['CỘT', 'BẮT BUỘC?', 'Ý NGHĨA', 'GIÁ TRỊ HỢP LỆ / VÍ DỤ'],
      ['question_no', 'Có', 'Số thứ tự câu hỏi (không trùng)', '1, 2, 3...'],
      ['question_type', 'Có', 'Loại câu hỏi', 'single_choice (chọn 1 đáp án) / multiple_choice (chọn nhiều đáp án) / true_false (Đúng-Sai) / short_answer (trả lời ngắn)'],
      ['question', 'Có', 'Nội dung câu hỏi', '「食べる」の意味は？'],
      ['option_a', 'Có* (trừ short_answer)', 'Đáp án A', 'ăn — với true_false: A = Đúng, B = Sai'],
      ['option_b', 'Có* (trừ short_answer)', 'Đáp án B', 'uống'],
      ['option_c', 'Không', 'Đáp án C (tùy chọn)', 'ngủ'],
      ['option_d', 'Không', 'Đáp án D (tùy chọn)', 'đi'],
      ['correct_answer', 'Có', 'Đáp án đúng', 'single_choice: A hoặc B/C/D; multiple_choice: A,C (cách nhau bằng dấu phẩy); true_false: A (Đúng) hoặc B (Sai); short_answer: nội dung đáp án, ví dụ ひゃく'],
      ['explanation', 'Không', 'Giải thích hiển thị sau khi trả lời', '食べる = ăn'],
      ['hint', 'Không', 'Gợi ý cho học sinh', 'Động từ nhóm 1'],
      ['points', 'Không (mặc định 1)', 'Điểm của câu', '1, 2, 5... (số 0-100)'],
      ['difficulty', 'Không (mặc định medium)', 'Mức độ', 'easy / medium / hard'],
      ['category', 'Không', 'Nhóm/chủ đề câu hỏi', 'Từ vựng cơ bản'],
      ['tags', 'Không', 'Các tag, cách nhau dấu phẩy', 'jlpt-n5,dong-tu'],
      ['image_url', 'Không', 'Link hình ảnh cho câu hỏi', 'https://...'],
      ['', '', '', ''],
      ['LỖI THƯỜNG GẶP', '', '', ''],
      ['Thiếu question hoặc question_type', '', '', 'Hàng sẽ bị báo lỗi và không import'],
      ['correct_answer = E', '', '', 'Chỉ có đáp án A-D, E không tồn tại'],
      ['multiple_choice để "A" nhưng chọn nhiều', '', '', 'Nhiều đáp án phải cách nhau bằng dấu phẩy: A,C'],
      ['points ghi "hai điểm"', '', '', 'Points phải là số'],
      ['Đổi tên cột ở dòng đầu', '', '', 'Không đổi tên cột ở dòng tiêu đề'],
      ['File khác .xlsx', '', '', 'Chỉ hỗ trợ .xlsx'],
    ];
    const wsG = XLSX.utils.aoa_to_sheet(guideRows);
    wsG['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 34 }, { wch: 80 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsQ, 'QUESTIONS');
    XLSX.utils.book_append_sheet(wb, wsG, 'HUONG_DAN');
    XLSX.writeFile(wb, 'Mau_Import_Bai_Luyen_Tap.xlsx');
    toast('Đã tải file Excel mẫu', 'success');
  };

  const parseFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast('Chỉ hỗ trợ file .xlsx. Vui lòng lưu file dạng Excel .xlsx', 'error');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast('File quá lớn (tối đa 5MB)', 'error');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames.find((n) => n.trim().toUpperCase() === 'QUESTIONS') ?? wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        if (!ws) { toast('File không có sheet dữ liệu', 'error'); return; }
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        if (json.length === 0) { toast('Sheet không có dòng dữ liệu nào', 'error'); return; }
        if (json.length > MAX_ROWS) {
          toast(`Quá ${MAX_ROWS} dòng — chỉ xét ${MAX_ROWS} dòng đầu`, 'error');
        }
        setRows(json.slice(0, MAX_ROWS).map((row, idx) => parseRow(row, idx + 2)));
      } catch {
        toast('Không đọc được file Excel. File có thể bị hỏng hoặc sai định dạng.', 'error');
        setRows(null);
      }
    };
    reader.onerror = () => toast('Không đọc được file', 'error');
    reader.readAsArrayBuffer(file);
  };

  const parseRow = (row: Record<string, unknown>, rowNumber: number): ImportRow => {
    const get = (key: string) => String(row[key] ?? '').trim();
    const r: ImportRow = {
      rowNumber,
      questionNo: get('question_no'),
      questionType: normalizeType(get('question_type')),
      question: get('question'),
      optionA: get('option_a'),
      optionB: get('option_b'),
      optionC: get('option_c'),
      optionD: get('option_d'),
      correctAnswer: get('correct_answer'),
      explanation: get('explanation'),
      hint: get('hint'),
      points: get('points'),
      difficulty: get('difficulty'),
      category: get('category'),
      tags: get('tags'),
      imageUrl: get('image_url'),
      errors: [],
      warnings: [],
    };

    const rawCorrect = get('correct_answer');

    if (!r.questionType) r.errors.push('question_type: loại câu hỏi thiếu hoặc không hợp lệ (single_choice / multiple_choice / true_false / short_answer)');
    if (!r.question) r.errors.push('question: nội dung câu hỏi đang trống');
    if (!rawCorrect) r.errors.push('correct_answer: thiếu đáp án đúng');

    if (r.questionType && r.questionType !== 'short_answer') {
      if (!r.optionA || !r.optionB) r.errors.push('option_a/option_b: thiếu đáp án A hoặc B');
      const letters = normalizeLetters(rawCorrect);
      if (letters.length === 0 && rawCorrect) r.errors.push(`correct_answer: "${rawCorrect}" không phải đáp án A-D hợp lệ`);
      if (r.questionType === 'single_choice' && letters.length > 1) {
        r.errors.push('correct_answer: single_choice chỉ được 1 đáp án (nhiều đáp án hãy dùng multiple_choice)');
      }
      const missing = letters.filter((l) => (r[`option${l}` as 'optionA' | 'optionB' | 'optionC' | 'optionD'] ?? '') === '');
      if (missing.length > 0) r.errors.push(`correct_answer: đáp án ${missing.join(', ')} không có nội dung`);
      if (letters.length > 1 && r.questionType === 'multiple_choice' && letters.length === 1) {
        r.warnings.push('multiple_choice chỉ có 1 đáp án đúng — cân nhắc đổi sang single_choice');
      }
    } else if (r.questionType === 'short_answer') {
      if (LETTERS.includes(rawCorrect.toUpperCase()) && !rawCorrect.slice(1)) {
        r.warnings.push('correct_answer trông như một chữ cái A-D — short_answer cần nội dung đáp án');
      }
    }

    if (r.points) {
      const n = Number(r.points);
      if (isNaN(n) || n < 0 || n > 100) r.errors.push(`points: "${r.points}" không phải điểm hợp lệ (0-100)`);
    }
    if (r.difficulty && !VALID_DIFFICULTIES.includes(normalizeDifficulty(r.difficulty)) && !['dễ', 'de', 'khó', 'kho'].includes(r.difficulty.trim().toLowerCase())) {
      r.errors.push(`difficulty: "${r.difficulty}" không hợp lệ (easy / medium / hard)`);
    }
    if (r.questionNo) {
      const n = Number(r.questionNo);
      if (isNaN(n) || n < 1) r.errors.push(`question_no: "${r.questionNo}" không phải số thứ tự hợp lệ`);
    }
    const isEmpty = !r.question && !rawCorrect && !r.optionA && !r.optionB && !r.questionType;
    if (isEmpty) r.errors.push('Dòng trống hoàn toàn');
    return r;
  };

  const validCount = rows?.filter((r) => r.errors.length === 0).length ?? 0;
  const warnCount = rows?.filter((r) => r.errors.length === 0 && r.warnings.length > 0).length ?? 0;
  const errorCount = rows?.filter((r) => r.errors.length > 0).length ?? 0;
  const hasErrors = errorCount > 0;
  const canImport = !!rows && validCount > 0 && !hasErrors && !importing;

  const statusOf = (r: ImportRow): 'ok' | 'warn' | 'error' =>
    r.errors.length > 0 ? 'error' : r.warnings.length > 0 ? 'warn' : 'ok';

  const handleImport = async () => {
    if (!canImport || !rows) return;
    setImporting(true);
    importingRef.current = true;
    setImportResult(null);
    const imported = rows
      .filter((r) => r.errors.length === 0)
      .map((r) => {
        const qno = Number(r.questionNo);
        return {
          qno: !isNaN(qno) && qno >= 1 ? qno : 0,
          q: {
            id: generateId('pq'),
            questionType: (r.questionType || 'single_choice') as PracticeQuestionType,
            questionText: r.question,
            optionA: r.optionA, optionB: r.optionB, optionC: r.optionC, optionD: r.optionD,
            correctAnswer: r.questionType === 'short_answer'
              ? r.correctAnswer
              : normalizeLetters(r.correctAnswer).sort().join(','),
            explanation: r.explanation,
            hint: r.hint,
            difficulty: normalizeDifficulty(r.difficulty),
            questionCategory: r.category,
            tags: r.tags,
            imageUrl: r.imageUrl,
            points: r.points ? Number(r.points) : 1,
          } as ImportedQuestion,
        };
      })
      .sort((a, b) => a.qno - b.qno)
      .map((x) => x.q);

    if (mode === 'append') {
      onImport(imported);
      toast(`Đã nhập ${imported.length} câu hỏi từ Excel`, 'success');
      onClose();
      return;
    }

    // Create practice + questions, then VERIFY against the database before
    // declaring success. Never trust the parsed row count alone.
    const storage = await import('@/storage');
    const title = fileName.replace(/\.xlsx$/i, '').trim() || 'Bài luyện tập mới';
    const practiceId = generateId('practice');
    try {
      await storage.upsertPractices([{
        id: practiceId,
        title,
        category: 'vocabulary',
        level: 'N5',
        linkedLessonId: null,
        passage: '',
        audioSourceType: 'URL',
        audioSource: '',
        audioFileName: '',
        teacherName: '',
        targetClasses: [],
        startAt: null,
        deadline: null,
        classSchedules: {},
        allowAiTutor: true,
        status: 'DRAFT',
        sortOrder: Date.now() % 100000,
        folderId: targetFolderId,
        archivedAt: null,
        createdAt: new Date().toISOString(),
      }]);
      await storage.upsertPracticeQuestions(imported.map((q, i) => ({ ...q, practiceId, questionNo: i + 1 })));

      const saved = (await storage.getPracticeQuestionsAdmin(practiceId)).length;
      if (saved === imported.length) {
        setImportResult({ ok: true, expected: imported.length, saved });
        toast(`Import thành công — đã lưu ${saved}/${imported.length} câu hỏi vào "${title}"`, 'success');
        onImport([]);
      } else {
        setImportResult({
          ok: false,
          expected: imported.length,
          saved,
          message: saved === 0
            ? 'Không lưu được câu hỏi nào. Vui lòng thử lại.'
            : 'Chỉ một phần câu hỏi được lưu. Vui lòng thử lại.',
        });
        toast('Import chưa hoàn tất — số câu hỏi lưu được ít hơn dự kiến', 'error');
      }
    } catch (err) {
      setImportResult({
        ok: false,
        expected: imported.length,
        saved: 0,
        message: err instanceof Error && err.message
          ? `Lỗi lưu dữ liệu: ${err.message}`
          : 'Lỗi lưu dữ liệu. Vui lòng thử lại.',
      });
      toast('Import thất bại — dữ liệu chưa được lưu', 'error');
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in md:items-center" onClick={requestClose}>
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 animate-slide-up safe-bottom md:max-w-3xl md:rounded-2xl md:animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <FileSpreadsheet size={22} className="text-emerald-600" />
            Nhập câu hỏi từ Excel
          </h3>
          <button onClick={requestClose} disabled={importing} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        {mode === 'create' && (
          <p className="mb-3 rounded-xl bg-blue-50 px-3.5 py-2.5 text-xs text-blue-700">
            Bài luyện tập sẽ được tạo trong thư mục: <b>{targetFolderName ?? 'Trang chủ'}</b>
          </p>
        )}

        {/* Template download */}
        <button
          onClick={downloadTemplate}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 transition-all active:scale-[0.98] hover:bg-emerald-100"
        >
          <Download size={18} />
          Tải file Excel mẫu
        </button>

        {/* Guide (collapsible) */}
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/60">
          <button onClick={() => setShowGuide((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
            <span className="flex items-center gap-2 text-sm font-semibold text-blue-700">
              <Info size={16} /> Hướng dẫn nhập Excel
            </span>
            <ChevronDown size={16} className={`text-blue-500 transition-transform ${showGuide ? 'rotate-180' : ''}`} />
          </button>
          {showGuide && (
            <div className="space-y-1.5 border-t border-blue-200 px-4 py-3 text-xs leading-relaxed text-slate-600">
              <p><b>Bước 1:</b> Tải file Excel mẫu ở trên.</p>
              <p><b>Bước 2:</b> Điền câu hỏi vào sheet <b>QUESTIONS</b> theo đúng các cột (xem sheet <b>HUONG_DAN</b> chi tiết ý nghĩa từng cột).</p>
              <p><b>Bước 3:</b> Không đổi tên các cột ở dòng tiêu đề.</p>
              <p><b>Bước 4:</b> Lưu file dạng <b>.xlsx</b>.</p>
              <p><b>Bước 5:</b> Kéo thả hoặc chọn file bên dưới để kiểm tra.</p>
              <p><b>Bước 6:</b> Xem bảng preview, sửa lỗi nếu có trong file rồi tải lên lại.</p>
              <p><b>Bước 7:</b> Bấm <b>Import bài luyện tập</b> khi tất cả dòng hợp lệ.</p>
              <p className="pt-1"><b>Đáp án đúng:</b> single_choice ghi <code>A</code>; multiple_choice ghi <code>A,C</code> (dấu phẩy); true_false ghi <code>A</code> (Đúng) hoặc <code>B</code> (Sai); short_answer ghi nội dung đáp án (không phân biệt hoa/thường).</p>
            </div>
          )}
        </div>

        {/* Upload area */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) parseFile(f); }}
          onClick={() => fileRef.current?.click()}
          className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-8 transition-all ${
            dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
          }`}
        >
          <Upload size={32} className={`mb-2 ${dragOver ? 'text-blue-500' : 'text-slate-400'}`} />
          <p className="text-sm font-medium text-slate-600">{fileName || 'Kéo thả hoặc chọn file Excel'}</p>
          <p className="mt-1 text-xs text-slate-400">Chỉ hỗ trợ .xlsx (tối đa 5MB, {MAX_ROWS} dòng)</p>
          <input ref={fileRef} type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }} className="hidden" />
        </div>

        {/* Results */}
        {rows && (
          <div className="space-y-3">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-xl bg-slate-100 px-2 py-2 text-center">
                <p className="text-lg font-bold text-slate-700">{rows.length}</p>
                <p className="text-[10px] text-slate-500">Tổng</p>
              </div>
              <div className="rounded-xl bg-emerald-50 px-2 py-2 text-center">
                <p className="text-lg font-bold text-emerald-700">{validCount}</p>
                <p className="text-[10px] text-emerald-600">Hợp lệ</p>
              </div>
              <div className="rounded-xl bg-amber-50 px-2 py-2 text-center">
                <p className="text-lg font-bold text-amber-600">{warnCount}</p>
                <p className="text-[10px] text-amber-600">Cảnh báo</p>
              </div>
              <div className="rounded-xl bg-rose-50 px-2 py-2 text-center">
                <p className="text-lg font-bold text-rose-600">{errorCount}</p>
                <p className="text-[10px] text-rose-500">Lỗi</p>
              </div>
            </div>

            {/* Preview table */}
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="max-h-72 overflow-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2.5 py-2">STT</th>
                      <th className="px-2.5 py-2">Loại</th>
                      <th className="px-2.5 py-2">Câu hỏi</th>
                      <th className="px-2.5 py-2">Đáp án</th>
                      <th className="px-2.5 py-2">Đáp án đúng</th>
                      <th className="px-2.5 py-2">Điểm</th>
                      <th className="px-2.5 py-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => {
                      const st = statusOf(r);
                      const answerSummary = r.questionType === 'short_answer'
                        ? r.correctAnswer || '—'
                        : LETTERS.filter((l) => r[`option${l}` as 'optionA' | 'optionB' | 'optionC' | 'optionD'])
                            .map((l) => `${l}. ${r[`option${l}` as 'optionA' | 'optionB' | 'optionC' | 'optionD']}`).join(' · ') || '—';
                      return (
                        <tr key={r.rowNumber} className={st === 'error' ? 'bg-rose-50/50' : st === 'warn' ? 'bg-amber-50/40' : 'bg-white'}>
                          <td className="px-2.5 py-2 text-slate-500">{r.questionNo || r.rowNumber}</td>
                          <td className="px-2.5 py-2 text-slate-600">{r.questionType ? TYPE_LABEL[r.questionType] : '—'}</td>
                          <td className="max-w-[220px] truncate px-2.5 py-2 font-medium text-slate-700" title={r.question}>{r.question || '(trống)'}</td>
                          <td className="max-w-[180px] truncate px-2.5 py-2 text-slate-500" title={answerSummary}>{answerSummary}</td>
                          <td className="px-2.5 py-2 font-semibold text-emerald-600">{r.correctAnswer || '—'}</td>
                          <td className="px-2.5 py-2 text-slate-500">{r.points || 1}</td>
                          <td className="px-2.5 py-2">
                            {st === 'ok' && <span className="flex items-center gap-1 font-semibold text-emerald-600"><CheckCircle2 size={13} /> Hợp lệ</span>}
                            {st === 'warn' && <span className="flex items-center gap-1 font-semibold text-amber-600"><AlertTriangle size={13} /> Cảnh báo</span>}
                            {st === 'error' && <span className="flex items-center gap-1 font-semibold text-rose-600"><AlertCircle size={13} /> Có lỗi</span>}
                            {(r.errors.length > 0 || r.warnings.length > 0) && (
                              <p className="mt-1 max-w-[200px] text-[10px] leading-snug text-slate-500">
                                {[...r.errors, ...r.warnings].join('; ')}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Import result (verified against the database) */}
            {importResult && (
              <div className={`rounded-xl px-4 py-3 text-sm ${importResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                <p className="font-bold">{importResult.ok ? 'IMPORT HOÀN TẤT' : 'IMPORT CHƯA HOÀN TẤT'}</p>
                <p className="mt-1 text-xs">Đã đọc: {importResult.expected} câu · Đã lưu: {importResult.saved} câu{!importResult.ok && ` · Không lưu được: ${importResult.expected - importResult.saved} câu`}</p>
                {!importResult.ok && importResult.message && <p className="mt-1 text-xs">{importResult.message}</p>}
                {importResult.ok && (
                  <button onClick={onClose} className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                    Đóng
                  </button>
                )}
              </div>
            )}

            {/* Import button */}
            <button
              onClick={handleImport}
              disabled={!canImport}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={18} />
              {importing ? 'Đang nhập...' : hasErrors ? `Sửa ${errorCount} dòng lỗi trước khi import` : `Import ${validCount} câu hỏi`}
            </button>
            {hasErrors && (
              <p className="text-center text-[11px] text-rose-500">
                Có {errorCount} dòng lỗi. Sửa file Excel rồi tải lên lại — chỉ dòng hợp lệ mới được import.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
