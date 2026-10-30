import { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { Lesson, VocabularyItem, LessonCategory } from '@/types';
import { generateId, loadClasses } from '@/storage';
import { toast } from './Toast';
import {
  X, Upload, FileSpreadsheet, CheckCircle2, Users, AlertTriangle,
  FolderOpen, Check, TableProperties,
} from 'lucide-react';

interface ParsedVocabRow {
  item: VocabularyItem | null;
  raw: Record<string, string>;
  rowNum: number;
  errors: string[];
  skipped: boolean;
  skipReason: string;
}

interface LessonMeta {
  lessonId: string;
  lessonName: string;
  description: string;
  jlptLevel: string;
  tags: string;
  targetClasses: string[];
}

interface VocabImportModalProps {
  onClose: () => void;
  onImport: (lessons: Lesson[], vocabItems: VocabularyItem[]) => void;
  categories: LessonCategory[];
  targetCategoryId: string;
}

type Phase = 'select' | 'parsing' | 'validating' | 'ready' | 'importing' | 'done';

const REQUIRED_FIELDS = [
  'id', 'vocabulary', 'reading_hiragana', 'meaning_vi',
  'example_jp_1', 'example_vi_1',
];

export function VocabImportModal({
  onClose, onImport, targetCategoryId,
}: VocabImportModalProps) {
  const [phase, setPhase] = useState<Phase>('select');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedVocabRow[]>([]);
  const [, setFieldMapping] = useState<Record<string, string>>({});
  const [lessonMetas, setLessonMetas] = useState<LessonMeta[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'valid' | 'invalid' | 'skipped'>('all');

  useMemo(() => { loadClasses().then(setClasses); }, []);

  const toggleClass = (cls: string) => {
    setSelectedClasses((prev) => {
      if (cls === 'Tất cả') return prev.includes('Tất cả') ? [] : ['Tất cả'];
      const withoutAll = prev.filter((c) => c !== 'Tất cả');
      return withoutAll.includes(cls) ? withoutAll.filter((c) => c !== cls) : [...withoutAll, cls];
    });
  };

  const validRows = useMemo(() => parsedRows.filter((r) => r.item && !r.skipped), [parsedRows]);
  const invalidRows = useMemo(() => parsedRows.filter((r) => r.errors.length > 0 && !r.skipped), [parsedRows]);
  const skippedRows = useMemo(() => parsedRows.filter((r) => r.skipped), [parsedRows]);

  const filteredRows = useMemo(() => {
    if (activeFilter === 'valid') return validRows;
    if (activeFilter === 'invalid') return invalidRows;
    if (activeFilter === 'skipped') return skippedRows;
    return parsedRows;
  }, [parsedRows, validRows, invalidRows, skippedRows, activeFilter]);

  // Check for duplicate IDs and vocab
  const duplicateIds = useMemo(() => {
    const ids = new Map<string, number>();
    validRows.forEach((r) => { if (r.item?.vocabId) ids.set(r.item.vocabId, (ids.get(r.item.vocabId) ?? 0) + 1); });
    return new Set(Array.from(ids.entries()).filter(([, c]) => c > 1).map(([k]) => k));
  }, [validRows]);

  const duplicateVocab = useMemo(() => {
    const vocabs = new Map<string, number>();
    validRows.forEach((r) => { if (r.item) vocabs.set(r.item.vocabulary, (vocabs.get(r.item.vocabulary) ?? 0) + 1); });
    return new Set(Array.from(vocabs.entries()).filter(([, c]) => c > 1).map(([k]) => k));
  }, [validRows]);

  const parseFile = (file: File) => {
    setFileName(file.name);
    setPhase('parsing');
    setParsedRows([]);
    setLessonMetas([]);
    setFieldMapping({});
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });

        // Check for Vocabulary_Data sheet
        if (!wb.SheetNames.includes('Vocabulary_Data')) {
          toast('File Excel thiếu worksheet Vocabulary_Data', 'error');
          setPhase('select');
          return;
        }

        // Read field mapping if present
        const mappingSheet = wb.Sheets['Field_Mapping'];
        const mapping: Record<string, string> = {};
        if (mappingSheet) {
          try {
            const mappingRows = XLSX.utils.sheet_to_json<Record<string, string>>(mappingSheet, { defval: '' });
            for (const row of mappingRows) {
              const field = String(row['field'] ?? row['Field'] ?? '').trim();
              const column = String(row['column'] ?? row['Column'] ?? '').trim();
              if (field && column) mapping[field] = column;
            }
            setFieldMapping(mapping);
          } catch {
            // mapping parse failed, use defaults
          }
        }

        const ws = wb.Sheets['Vocabulary_Data'];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown as string[][];

        // Row 1-2: notes, Row 4: headers, Row 5+: data
        const headerRowIdx = 3; // 0-indexed = row 4
        const dataStartIdx = 4; // 0-indexed = row 5

        const headers = (rows[headerRowIdx] ?? []).map((h) => String(h ?? '').trim());

        // Build column index lookup
        const colIdx: Record<string, number> = {};
        headers.forEach((h, i) => {
          const normalized = h.toLowerCase().replace(/\s+/g, '_');
          colIdx[normalized] = i;
          colIdx[h] = i;
        });

        // Use field mapping to resolve columns, fallback to direct names
        const resolveCol = (fieldName: string): number => {
          const mapped = mapping[fieldName];
          if (mapped) {
            const mappedNorm = mapped.toLowerCase().replace(/\s+/g, '_');
            if (colIdx[mappedNorm] !== undefined) return colIdx[mappedNorm];
            if (colIdx[mapped] !== undefined) return colIdx[mapped];
          }
          const norm = fieldName.toLowerCase().replace(/\s+/g, '_');
          return colIdx[norm] ?? -1;
        };

        const getVal = (rowIdx: number, fieldName: string): string => {
          const ci = resolveCol(fieldName);
          if (ci < 0) return '';
          return String(rows[rowIdx]?.[ci] ?? '').trim();
        };

        const parsed: ParsedVocabRow[] = [];
        const lessonGroups = new Map<string, { name: string; items: ParsedVocabRow[] }>();

        for (let i = dataStartIdx; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.every((c) => String(c ?? '').trim() === '')) continue;

          const rowNum = i + 1; // 1-indexed Excel row
          const rawObj: Record<string, string> = {};
          headers.forEach((h, j) => { rawObj[h] = String(row[j] ?? '').trim(); });

          const errors: string[] = [];

          // Check active field
          const activeVal = getVal(i, 'active').toUpperCase();
          if (activeVal === 'FALSE' || activeVal === '0' || activeVal === 'NO') {
            parsed.push({ item: null, raw: rawObj, rowNum, errors: [], skipped: true, skipReason: 'active = FALSE' });
            continue;
          }

          // Validate required fields
          for (const field of REQUIRED_FIELDS) {
            const val = getVal(i, field);
            if (!val) {
              errors.push(`Dòng ${rowNum} thiếu ${field}`);
            }
          }

          // Parse related_words split by |
          const relatedWordsRaw = getVal(i, 'related_words');
          const relatedWords = relatedWordsRaw
            ? relatedWordsRaw.split('|').map((w) => w.trim()).filter(Boolean)
            : [];

          // Determine lesson grouping
          const lessonIdRaw = getVal(i, 'lesson_id');
          const lessonName = getVal(i, 'lesson_name') || getVal(i, 'lesson') || '';

          const itemId = generateId('vocab');
          const item: VocabularyItem = {
            id: itemId,
            lessonId: lessonIdRaw || '',
            vocabId: getVal(i, 'id'),
            vocabulary: getVal(i, 'vocabulary'),
            readingHiragana: getVal(i, 'reading_hiragana'),
            readingRomaji: getVal(i, 'reading_romaji'),
            onyomi: getVal(i, 'onyomi'),
            kunyomi: getVal(i, 'kunyomi'),
            meaningVi: getVal(i, 'meaning_vi'),
            jlptLevel: getVal(i, 'jlpt_level') || getVal(i, 'jlpt'),
            wordType: getVal(i, 'word_type') || getVal(i, 'type'),
            tags: getVal(i, 'tags'),
            relatedWords,
            audioText: getVal(i, 'audio_text'),
            exampleJp1: getVal(i, 'example_jp_1'),
            exampleReading1: getVal(i, 'example_reading_1'),
            exampleVi1: getVal(i, 'example_vi_1'),
            exampleJp2: getVal(i, 'example_jp_2'),
            exampleReading2: getVal(i, 'example_reading_2'),
            exampleVi2: getVal(i, 'example_vi_2'),
            active: true,
            sortOrder: parsed.filter((p) => !p.skipped).length,
            createdAt: new Date().toISOString(),
          };

          const parsedRow: ParsedVocabRow = {
            item: errors.length === 0 ? item : null,
            raw: rawObj,
            rowNum,
            errors,
            skipped: false,
            skipReason: '',
          };
          parsed.push(parsedRow);

          // Group by lesson
          if (errors.length === 0) {
            const groupKey = lessonIdRaw || lessonName || '__single__';
            if (!lessonGroups.has(groupKey)) {
              lessonGroups.set(groupKey, { name: lessonName || (lessonIdRaw ? `Bài học ${lessonIdRaw}` : 'Bài học từ vựng'), items: [] });
            }
            lessonGroups.get(groupKey)!.items.push(parsedRow);
          }
        }

        setParsedRows(parsed);

        // Build lesson metas
        const metas: LessonMeta[] = Array.from(lessonGroups.entries()).map(([key, group]) => ({
          lessonId: key === '__single__' ? generateId('lesson-vocab') : key,
          lessonName: group.name,
          description: '',
          jlptLevel: '',
          tags: '',
          targetClasses: [],
        }));
        setLessonMetas(metas);

        setPhase('validating');
        setTimeout(() => setPhase('ready'), 300);
      } catch {
        toast('Không thể đọc file Excel. Vui lòng kiểm tra định dạng file.', 'error');
        setPhase('select');
      }
    };
    reader.onerror = () => {
      toast('Lỗi khi đọc file', 'error');
      setPhase('select');
    };
    reader.readAsArrayBuffer(file);
  };

  const updateLessonMeta = (idx: number, updates: Partial<LessonMeta>) => {
    setLessonMetas((prev) => prev.map((m, i) => (i === idx ? { ...m, ...updates } : m)));
  };

  const handleConfirmImport = () => {
    setPhase('importing');
    const lessons: Lesson[] = [];
    const vocabItems: VocabularyItem[] = [];

    lessonMetas.forEach((meta) => {
      const lessonId = meta.lessonId;
      const lesson: Lesson = {
        id: lessonId,
        title: meta.lessonName || 'Bài học từ vựng',
        source: fileName,
        sheetId: 'Vocabulary_Data',
        meaning: meta.description || '',
        connectionRule: '',
        notes: '',
        distinction: '',
        examples: [],
        exercises: [],
        answers: [],
        sortOrder: lessons.length + 1,
        targetClasses: meta.targetClasses.length > 0 ? meta.targetClasses : selectedClasses,
        categoryId: targetCategoryId || null,
        startAt: null,
        deadline: null,
        classSchedules: {},
        createdAt: new Date().toISOString(),
      };
      lessons.push(lesson);

      // Find items for this lesson
      validRows.forEach((r) => {
        if (!r.item) return;
        if (lessonMetas.length === 1 || r.item.lessonId === meta.lessonId) {
          vocabItems.push({ ...r.item, lessonId, sortOrder: vocabItems.length });
        }
      });
    });

    onImport(lessons, vocabItems);
    setPhase('done');
    setTimeout(() => { onClose(); }, 1000);
  };

  const filterTabs: { id: typeof activeFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Tất cả', count: parsedRows.length },
    { id: 'valid', label: 'Hợp lệ', count: validRows.length },
    { id: 'invalid', label: 'Lỗi', count: invalidRows.length },
    { id: 'skipped', label: 'Bỏ qua', count: skippedRows.length },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in md:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 animate-slide-up safe-bottom md:max-w-2xl md:rounded-2xl md:animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <FileSpreadsheet size={22} className="text-indigo-600" /> Nhập từ vựng từ Excel
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="mb-4 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-700 space-y-1">
          <p className="font-semibold">Yêu cầu file Excel:</p>
          <p>• Sheet <b>Vocabulary_Data</b>: hàng 1-2 ghi chú, hàng 4 tiêu đề cột, hàng 5+ dữ liệu</p>
          <p>• Sheet <b>Field_Mapping</b> (tùy chọn): ánh xạ tên cột</p>
          <p>• Cột bắt buộc: id, vocabulary, reading_hiragana, meaning_vi, example_jp_1, example_vi_1</p>
        </div>

        {phase === 'select' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) parseFile(f); }}
            onClick={() => fileRef.current?.click()}
            className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-8 transition-all ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
          >
            <Upload size={32} className={`mb-2 ${dragOver ? 'text-indigo-500' : 'text-slate-400'}`} />
            <p className="text-sm font-medium text-slate-600">Kéo thả hoặc chọn file Excel</p>
            <p className="mt-1 text-xs text-slate-400">Hỗ trợ .xlsx</p>
            <input ref={fileRef} type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }} className="hidden" />
          </div>
        )}

        {phase === 'parsing' && (
          <div className="flex flex-col items-center justify-center py-12">
            <TableProperties size={36} className="mb-3 animate-pulse text-indigo-400" />
            <p className="text-sm font-medium text-slate-600">Đang đọc file...</p>
          </div>
        )}

        {phase === 'validating' && (
          <div className="flex flex-col items-center justify-center py-12">
            <TableProperties size={36} className="mb-3 animate-pulse text-blue-400" />
            <p className="text-sm font-medium text-slate-600">Đang kiểm tra dữ liệu...</p>
          </div>
        )}

        {(phase === 'ready' || phase === 'importing' || phase === 'done') && (
          <>
            {/* Summary */}
            <div className="mb-3 rounded-xl bg-slate-100 px-3 py-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">{fileName}</span>
                {phase === 'done' && <span className="flex items-center gap-1 font-medium text-emerald-600"><CheckCircle2 size={14} /> Thành công</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3 text-slate-500">
                <span>Tổng dòng: {parsedRows.length}</span>
                <span className="text-emerald-600">Hợp lệ: {validRows.length}</span>
                {invalidRows.length > 0 && <span className="text-red-500">Lỗi: {invalidRows.length}</span>}
                {skippedRows.length > 0 && <span className="text-amber-500">Bỏ qua: {skippedRows.length}</span>}
              </div>
            </div>

            {/* Duplicate warnings */}
            {(duplicateIds.size > 0 || duplicateVocab.size > 0) && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="mb-1 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-amber-600" />
                  <p className="text-xs font-semibold text-amber-700">Cảnh báo trùng lặp</p>
                </div>
                {duplicateIds.size > 0 && <p className="text-[10px] text-amber-600">{duplicateIds.size} ID trùng lặp</p>}
                {duplicateVocab.size > 0 && <p className="text-[10px] text-amber-600">{duplicateVocab.size} từ vựng trùng lặp</p>}
              </div>
            )}

            {/* Lesson metadata confirmation */}
            {lessonMetas.length > 0 && (
              <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center gap-1.5">
                  <FolderOpen size={15} className="text-slate-500" />
                  <p className="text-xs font-semibold text-slate-700">
                    {lessonMetas.length === 1 ? 'Xác nhận thông tin bài học' : `${lessonMetas.length} bài học được phát hiện`}
                  </p>
                </div>
                {lessonMetas.map((meta, idx) => (
                  <div key={idx} className="mb-2 rounded-lg bg-white p-2.5">
                    <input
                      type="text"
                      value={meta.lessonName}
                      onChange={(e) => updateLessonMeta(idx, { lessonName: e.target.value })}
                      placeholder="Tên bài học"
                      className="mb-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-blue-400"
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={meta.jlptLevel}
                        onChange={(e) => updateLessonMeta(idx, { jlptLevel: e.target.value })}
                        placeholder="JLPT (VD: N3)"
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-400"
                      />
                      <input
                        type="text"
                        value={meta.tags}
                        onChange={(e) => updateLessonMeta(idx, { tags: e.target.value })}
                        placeholder="Tags (phẩy ngăn cách)"
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-400"
                      />
                    </div>
                    <input
                      type="text"
                      value={meta.description}
                      onChange={(e) => updateLessonMeta(idx, { description: e.target.value })}
                      placeholder="Mô tả bài học"
                      className="mt-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-400"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Class selector */}
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Users size={15} className="text-slate-500" />
                <p className="text-xs font-semibold text-slate-700">Lớp áp dụng</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => toggleClass('Tất cả')}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${selectedClasses.includes('Tất cả') ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>
                  Tất cả
                </button>
                {classes.map((cls) => (
                  <button key={cls} onClick={() => toggleClass(cls)}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${selectedClasses.includes(cls) ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>
                    {cls}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter tabs */}
            <div className="mb-2 flex gap-1.5">
              {filterTabs.map((ft) => (
                <button
                  key={ft.id}
                  onClick={() => setActiveFilter(ft.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${activeFilter === ft.id ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {ft.label} ({ft.count})
                </button>
              ))}
            </div>

            {/* Data preview */}
            <div className="mb-3 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              {filteredRows.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Không có dòng nào</p>
              ) : (
                filteredRows.slice(0, 50).map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 border-b border-slate-50 px-3 py-2 text-xs ${r.skipped ? 'opacity-50' : ''}`}>
                    <span className="w-8 shrink-0 font-mono text-[10px] text-slate-400">{r.rowNum}</span>
                    {r.skipped ? (
                      <span className="flex-1 text-amber-500">Bỏ qua: {r.skipReason}</span>
                    ) : r.errors.length > 0 ? (
                      <span className="flex-1 text-red-500">{r.errors[0]}</span>
                    ) : (
                      <>
                        <span className="font-jp flex-1 truncate font-semibold text-slate-700">{r.item?.vocabulary || r.raw['vocabulary']}</span>
                        <span className="hidden flex-1 truncate text-blue-500 md:block">{r.item?.readingHiragana || r.raw['reading_hiragana']}</span>
                        <span className="flex-1 truncate text-emerald-700">{r.item?.meaningVi || r.raw['meaning_vi']}</span>
                        {r.item?.jlptLevel && <span className="rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-bold text-indigo-600">{r.item.jlptLevel}</span>}
                        <Check size={14} className="shrink-0 text-emerald-500" />
                      </>
                    )}
                  </div>
                ))
              )}
              {filteredRows.length > 50 && (
                <p className="py-2 text-center text-[10px] text-slate-400">... và {filteredRows.length - 50} dòng nữa</p>
              )}
            </div>

            {/* Import button */}
            {phase !== 'done' && (
              <button
                onClick={handleConfirmImport}
                disabled={validRows.length === 0 || phase === 'importing'}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {phase === 'importing' ? (
                  <><TableProperties size={18} className="animate-pulse" /> Đang nhập...</>
                ) : (
                  <><FileSpreadsheet size={18} /> Nhập bài học ({validRows.length} từ)</>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
