import { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { Lesson, LessonExample, LessonExercise, LessonAnswer, ExerciseType, LessonCategory } from '@/types';
import { loadClasses } from '@/storage';
import { toast } from './Toast';
import { X, Upload, FileSpreadsheet, Download, CheckCircle2, Users, FolderOpen, AlertTriangle, FileText } from 'lucide-react';

interface ParsedSheetResult {
  lesson: Lesson | null;
  sheetName: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

interface LessonImportModalProps {
  onClose: () => void;
  onImport: (lessons: Lesson[]) => void;
  categories: LessonCategory[];
}

const SKIP_SHEET_NAMES = ['huong_dan', 'huong dan', 'hướng dẫn', 'template', 'config', 'danh_muc', 'danh muc', 'muc_luc', 'muc luc', 'readme', 'guide', '说明'];
const MIN_DATA_ROWS = 2;

export function LessonImportModal({ onClose, onImport, categories }: LessonImportModalProps) {
  const [parsedResults, setParsedResults] = useState<ParsedSheetResult[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  useEffect(() => { loadClasses().then(setClasses); }, []);

  const toggleClass = (cls: string) => {
    setSelectedClasses((prev) => {
      if (cls === 'Tất cả') return prev.includes('Tất cả') ? [] : ['Tất cả'];
      const withoutAll = prev.filter((c) => c !== 'Tất cả');
      return withoutAll.includes(cls) ? withoutAll.filter((c) => c !== cls) : [...withoutAll, cls];
    });
  };

  const validResults = useMemo(
    () => parsedResults.filter((r) => r.lesson && !r.skipped),
    [parsedResults]
  );
  const skippedResults = useMemo(
    () => parsedResults.filter((r) => r.skipped || r.error),
    [parsedResults]
  );
  const selectedLessons = useMemo(
    () => validResults.filter((r) => r.lesson && !excludedIds.has(r.lesson.id)).map((r) => r.lesson!),
    [validResults, excludedIds]
  );

  const toggleExclude = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    const dmData = [
      ['STT', 'Tên ngữ pháp', 'Ý nghĩa', 'Tên sheet bài học'],
      [1, '～に際して・～にあたって', 'Vào lúc / Nhân dịp (khi thực hiện việc quan trọng)', 'Bai_01'],
      [2, '～と思うと・～と思ったら', 'Vừa … thì …/ Ngờ đâu …', 'Bai_02'],
    ];
    const wsDm = XLSX.utils.aoa_to_sheet(dmData);
    wsDm['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 45 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsDm, 'Danh_muc');

    const b1Data = [
      ['PHẦN 1: CẤU TRÚC & Ý NGHĨA', '', '', ''],
      ['Nguồn tài liệu', 'Mau_bai_hoc_ngu_phap_JLPT_N2.xlsx', '', ''],
      ['Tên ngữ pháp', '～に際して・～にあたって', '', ''],
      ['Ý nghĩa', 'Vào lúc / Nhân dịp (khi thực hiện việc quan trọng)', '', ''],
      ['Quy tắc liên kết (接続)', 'V-る/N + に際して　／　V-る/N + にあたって', '', ''],
      ['Lưu ý (注意)', '「に際して」mang sắc thái trang trọng, dùng trong văn viết.', '', ''],
      ['Phân biệt', '・に際して ≒ にあたって（trang trọng hơn）', '', ''],
      [],
      ['PHẦN 2: CÂU VÍ DỤ THỰC TẾ (例文)', '', '', '', '', ''],
      ['STT', 'Tiếng Nhật', 'Tiếng Việt', 'Phân tích', 'Từ vựng / Furigana', 'Ghi chú'],
      [1, '渡航に際して、パスポートの有効期限を確認してください。', 'Nhân dịp xuất ngoại, hãy kiểm tra thời hạn hộ chiếu.', 'N + に際して → thời điểm trước/trong khi thực hiện', '渡航(とこう): xuất ngoại', 'Văn phong trang trọng'],
      [2, '新年度にあたって、目標を立てた。', 'Nhân đầu năm học mới, tôi đã đặt ra mục tiêu.', 'N + にあたって → nhân dịp dấu mốc', '新年度(しんねんど): năm học mới', ''],
      [],
      ['PHẦN 3: BÀI TẬP LUYỆN TẬP (練習問題)', '', '', '', '', '', ''],
      ['STT', 'Dạng bài', 'Đề bài', 'Lựa chọn A', 'Lựa chọn B', 'Lựa chọn C', 'Gợi ý'],
      [1, 'multiple_choice', '卒業（　　）、先生方への感謝の気持ちを伝えたい。', 'に際して', 'にもかかわらず', 'にとって', 'Nhân dịp tốt nghiệp'],
      [2, 'translate', 'Dịch sang tiếng Nhật: Nhân dịp kỷ niệm 10 năm...', '', '', '', '創立10周年'],
      [],
      ['PHẦN 4: ĐÁP ÁN & GIẢI THÍCH (解答と解説)', '', '', '', '', ''],
      ['STT', 'Đáp án', 'Câu hoàn chỉnh / Bài dịch', 'Giải thích chi tiết', 'Lỗi gây nhiễu', 'Tự đánh giá'],
      [1, 'A: に際して', '卒業に際して、先生方への感謝の気持ちを伝えたい。', '「に際して」dùng với N/V-る, mang nghĩa "nhân dịp".', '「にもかかわらず」= dù cho → sai ngữ cảnh.', '★★★★☆'],
      [2, '会社設立10周年にあたって、大きなパーティーを開催します。', '会社設立10周年にあたって...', 'にあたって/に際して đều đúng.', 'Không dùng のとき vì trang trọng.', '★★☆☆☆'],
    ];
    const wsB1 = XLSX.utils.aoa_to_sheet(b1Data);
    wsB1['!cols'] = [{ wch: 6 }, { wch: 45 }, { wch: 40 }, { wch: 35 }, { wch: 30 }, { wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsB1, 'Bai_01');

    XLSX.writeFile(wb, 'Mau_bai_hoc_ngu_phap_JLPT_N2.xlsx');
    toast('Đã tải file mẫu', 'success');
  };

  const isAuxiliarySheet = (name: string): boolean => {
    const lower = name.toLowerCase().trim();
    return SKIP_SHEET_NAMES.some((skip) => lower.includes(skip));
  };

  const isSheetEmpty = (ws: XLSX.WorkSheet): boolean => {
    try {
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
      let nonEmptyRows = 0;
      for (const row of rows) {
        const hasData = row.some((cell) => String(cell ?? '').trim() !== '');
        if (hasData) nonEmptyRows++;
      }
      return nonEmptyRows < MIN_DATA_ROWS;
    } catch {
      return true;
    }
  };

  const extractSortOrder = (sheetName: string, fallback: number): number => {
    const match = sheetName.match(/(\d+)/);
    if (match) return parseInt(match[1], 10);
    return fallback;
  };

  const parseSheet = (ws: XLSX.WorkSheet, sheetName: string, sortOrder: number, source: string, sheetIndex: number): Lesson | null => {
    try {
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
      const get = (r: number, c: number): string => String(rows[r]?.[c] ?? '').trim();

      let part1Row = -1, part2Row = -1, part3Row = -1, part4Row = -1;
      for (let i = 0; i < rows.length; i++) {
        const cell = String(rows[i]?.[0] ?? '').toUpperCase();
        if (cell.includes('PHẦN 1') || cell.includes('PHAN 1') || cell.includes('CẤU TRÚC')) { part1Row = i; }
        if (cell.includes('PHẦN 2') || cell.includes('PHAN 2') || cell.includes('VÍ DỤ') || cell.includes('例文')) { part2Row = i; }
        if (cell.includes('PHẦN 3') || cell.includes('PHAN 3') || cell.includes('BÀI TẬP') || cell.includes('練習')) { part3Row = i; }
        if (cell.includes('PHẦN 4') || cell.includes('PHAN 4') || cell.includes('ĐÁP ÁN') || cell.includes('解答')) { part4Row = i; }
      }

      let title = '', meaning = '', connectionRule = '', notes = '', distinction = '', src = source;
      const startP1 = part1Row >= 0 ? part1Row + 1 : 1;
      const endP1 = part2Row >= 0 ? part2Row : Math.min(startP1 + 8, rows.length);
      for (let i = startP1; i < endP1; i++) {
        const key = get(i, 0).toLowerCase();
        const val = get(i, 1);
        if (!val) continue;
        if (key.includes('nguồn') || key.includes('nguon')) src = val;
        else if (key.includes('tên ngữ pháp') || key.includes('ten ngu phap') || key.includes('ngữ pháp')) title = val;
        else if (key.includes('ý nghĩa') || key.includes('y nghia')) meaning = val;
        else if (key.includes('quy tắc') || key.includes('接続') || key.includes('liên kết')) connectionRule = val;
        else if (key.includes('lưu ý') || key.includes('注意') || key.includes('lu y')) notes = val;
        else if (key.includes('phân biệt') || key.includes('phan biet')) distinction = val;
      }
      if (!title) title = sheetName.replace(/_/g, ' ');

      const examples: LessonExample[] = [];
      if (part2Row >= 0) {
        const dataStart = part2Row + 2;
        const dataEnd = part3Row >= 0 ? part3Row : Math.min(dataStart + 50, rows.length);
        for (let i = dataStart; i < dataEnd; i++) {
          const stt = Number(get(i, 0));
          if (!stt || isNaN(stt)) continue;
          examples.push({ stt, japanese: get(i, 1), vietnamese: get(i, 2), analysis: get(i, 3), vocabulary: get(i, 4), note: get(i, 5) });
        }
      }

      const exercises: LessonExercise[] = [];
      if (part3Row >= 0) {
        const dataStart = part3Row + 2;
        const dataEnd = part4Row >= 0 ? part4Row : Math.min(dataStart + 50, rows.length);
        for (let i = dataStart; i < dataEnd; i++) {
          const stt = Number(get(i, 0));
          if (!stt || isNaN(stt)) continue;
          const rawType = get(i, 1).toLowerCase();
          let type: ExerciseType = 'multiple_choice';
          if (rawType.includes('conjug') || rawType.includes('chia')) type = 'conjugation';
          else if (rawType.includes('arrang') || rawType.includes('sắp xếp') || rawType.includes('sap xep')) type = 'arrange';
          else if (rawType.includes('trans') || rawType.includes('dịch')) type = 'translate';
          exercises.push({ stt, type, question: get(i, 2), optionA: get(i, 3), optionB: get(i, 4), optionC: get(i, 5), optionD: get(i, 6), hint: get(i, 7) || get(i, 6) });
        }
      }

      const answers: LessonAnswer[] = [];
      if (part4Row >= 0) {
        const dataStart = part4Row + 2;
        for (let i = dataStart; i < rows.length; i++) {
          const stt = Number(get(i, 0));
          if (!stt || isNaN(stt)) continue;
          answers.push({ stt, answer: get(i, 1), fullSentence: get(i, 2), explanation: get(i, 3), commonErrors: get(i, 4), selfAssess: get(i, 5) });
        }
      }

      const safeSheetName = sheetName.replace(/\s+/g, '_');
      return {
        id: `lesson-${Date.now()}-${safeSheetName}-${sheetIndex}`,
        title,
        source: src,
        sheetId: sheetName,
        meaning,
        connectionRule,
        notes,
        distinction,
        examples,
        exercises,
        answers,
        sortOrder,
        targetClasses: [],
        categoryId: selectedCategoryId || null,
        startAt: null,
        deadline: null,
        classSchedules: {},
        createdAt: new Date().toISOString(),
      };
    } catch (e) {
      console.warn('Parse error for sheet', sheetName, e);
      return null;
    }
  };

  const parseFile = (file: File) => {
    setFileName(file.name);
    setParsing(true);
    setParsedResults([]);
    setExcludedIds(new Set());
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });

        // Build a sort-order lookup from Danh_muc if it exists (optional, not a filter)
        const dmOrderMap = new Map<string, number>();
        const dmSheet = wb.Sheets['Danh_muc'] || wb.Sheets['danh_muc'];
        if (dmSheet) {
          try {
            const dmRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(dmSheet, { defval: '' });
            dmRows.forEach((row, idx) => {
              const sn = String(row['Tên sheet bài học'] ?? row['ten_sheet'] ?? '').trim();
              if (sn) dmOrderMap.set(sn, idx + 1);
            });
          } catch {
            // Danh_muc parse failed — ignore, not critical
          }
        }

        // ALWAYS iterate ALL sheets in the workbook — no filtering by Danh_muc
        const allSheetNames = wb.SheetNames;

        const results: ParsedSheetResult[] = [];
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        allSheetNames.forEach((name, idx) => {
          const ws = wb.Sheets[name];
          if (!ws) return;

          // Skip auxiliary sheets
          if (isAuxiliarySheet(name)) {
            results.push({ lesson: null, sheetName: name, skipped: true, skipReason: 'Sheet phụ (Danh_muc, Template, Hướng dẫn...)' });
            skipCount++;
            return;
          }

          // Skip empty sheets
          if (isSheetEmpty(ws)) {
            results.push({ lesson: null, sheetName: name, skipped: true, skipReason: 'Sheet trống hoặc quá ít dữ liệu' });
            skipCount++;
            return;
          }

          // Determine sort order: Danh_muc lookup > number in sheet name > sheet index
          const order = dmOrderMap.has(name) ? dmOrderMap.get(name)! : extractSortOrder(name, idx + 1);

          const lesson = parseSheet(ws, name, order, file.name, idx);
          if (lesson) {
            results.push({ lesson, sheetName: name });
            successCount++;
          } else {
            results.push({ lesson: null, sheetName: name, error: 'Không thể phân tích cấu trúc bài học' });
            errorCount++;
          }
        });

        setParsedResults(results);

        if (successCount === 0) {
          toast('Không tìm thấy bài học hợp lệ trong file', 'error');
        } else {
          let msg = `Đã phân tích ${successCount} bài học`;
          if (skipCount > 0) msg += `, bỏ qua ${skipCount} sheet phụ`;
          if (errorCount > 0) msg += `, ${errorCount} sheet lỗi`;
          toast(msg, 'success');
        }
      } catch {
        toast('Không thể đọc file Excel. Vui lòng kiểm tra định dạng file.', 'error');
      } finally {
        setParsing(false);
      }
    };
    reader.onerror = () => {
      toast('Lỗi khi đọc file', 'error');
      setParsing(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = () => {
    if (selectedLessons.length === 0) {
      toast('Vui lòng chọn ít nhất 1 bài học để import', 'error');
      return;
    }
    const withMeta = selectedLessons.map((l) => ({
      ...l,
      targetClasses: selectedClasses,
      categoryId: selectedCategoryId || null,
    }));
    onImport(withMeta);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in md:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 animate-slide-up safe-bottom md:max-w-2xl md:rounded-2xl md:animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <FileSpreadsheet size={22} className="text-indigo-600" /> Nhập bài học từ Excel
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="mb-4 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-700 space-y-1">
          <p className="font-semibold">Hỗ trợ đọc tất cả các sheet trong file Excel:</p>
          <p>• Mỗi sheet = 1 bài học (tự động bỏ qua sheet Danh_muc, Template, Hướng dẫn...)</p>
          <p>• Cấu trúc mỗi sheet: 4 phần (Cấu trúc, Ví dụ, Bài tập, Đáp án)</p>
        </div>

        <button onClick={downloadTemplate}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
          <Download size={18} /> Tải file Excel giáo án mẫu
        </button>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) parseFile(f); }}
          onClick={() => fileRef.current?.click()}
          className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-8 transition-all ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
        >
          <Upload size={32} className={`mb-2 ${dragOver ? 'text-indigo-500' : 'text-slate-400'}`} />
          <p className="text-sm font-medium text-slate-600">{parsing ? 'Đang phân tích...' : (fileName || 'Kéo thả hoặc chọn file Excel')}</p>
          <p className="mt-1 text-xs text-slate-400">Hỗ trợ .xlsx, .xls — đa sheet</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }} className="hidden" />
        </div>

        {/* Parsed results preview */}
        {parsedResults.length > 0 && (
          <>
            {/* Summary bar */}
            <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs">
              <span className="font-semibold text-slate-700">
                {selectedLessons.length}/{validResults.length} bài học được chọn
              </span>
              {skippedResults.length > 0 && (
                <span className="text-slate-500">{skippedResults.length} sheet bỏ qua</span>
              )}
            </div>

            {/* Valid lessons with checkboxes */}
            <div className="mb-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-600 mb-1.5">Danh sách bài học trích xuất:</p>
              {validResults.map(({ lesson, sheetName }) => {
                if (!lesson) return null;
                const excluded = excludedIds.has(lesson.id);
                return (
                  <label
                    key={lesson.id}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all cursor-pointer ${excluded ? 'bg-slate-50 opacity-50' : 'bg-indigo-50 hover:bg-indigo-100/70'}`}
                  >
                    <button
                      onClick={(e) => { e.preventDefault(); toggleExclude(lesson.id); }}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${excluded ? 'border-slate-300 bg-white' : 'border-indigo-600 bg-indigo-600'}`}
                    >
                      {!excluded && <CheckCircle2 size={14} className="text-white" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold truncate ${excluded ? 'text-slate-400' : 'text-indigo-800'}`}>
                        {lesson.title || sheetName}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-indigo-500">
                        <span className="flex items-center gap-0.5"><FileText size={9} /> {sheetName}</span>
                        <span>{lesson.examples.length} ví dụ</span>
                        <span>·</span>
                        <span>{lesson.exercises.length} bài tập</span>
                        {lesson.answers.length > 0 && (<><span>·</span><span>{lesson.answers.length} đáp án</span></>)}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Skipped/error sheets */}
            {skippedResults.length > 0 && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-amber-600" />
                  <p className="text-xs font-semibold text-amber-700">Sheet bị bỏ qua ({skippedResults.length})</p>
                </div>
                <div className="space-y-1">
                  {skippedResults.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-[10px] text-amber-600">
                      <span className="font-medium">{r.sheetName}</span>
                      <span>—</span>
                      <span>{r.skipReason || r.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category selector */}
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <FolderOpen size={15} className="text-slate-500" />
                <p className="text-xs font-semibold text-slate-700">Danh mục bài học</p>
              </div>
              <p className="mb-2 text-[10px] text-slate-400">Chọn danh mục cho các bài học được chọn</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button key={cat.id} onClick={() => setSelectedCategoryId(cat.id)}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${selectedCategoryId === cat.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>
                    {cat.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Class selector */}
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Users size={15} className="text-slate-500" />
                <p className="text-xs font-semibold text-slate-700">Lớp áp dụng (tất cả bài học)</p>
              </div>
              <p className="mb-2 text-[10px] text-slate-400">Bỏ trống = tất cả các lớp đều xem được</p>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => toggleClass('Tất cả')}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${selectedClasses.includes('Tất cả') ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>
                  Tất cả các lớp
                </button>
                {classes.map((cls) => (
                  <button key={cls} onClick={() => toggleClass(cls)}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${selectedClasses.includes(cls) ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>
                    {cls}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleConfirmImport}
              disabled={selectedLessons.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet size={18} /> Xác nhận nhập {selectedLessons.length} bài học
            </button>
          </>
        )}
      </div>
    </div>
  );
}
