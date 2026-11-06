import { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import type { Lesson, VocabularyItem, LessonCategory, KanjiBreakdownItem, User } from '@/types';
import { generateId, loadVocabItems, loadSubjectItems, createSubject, type SubjectItem } from '@/storage';
import { downloadVocabExcelTemplate, VOCAB_REQUIRED_HEADERS } from '@/lib/vocabExcelTemplate';
import {
  normalizeVocabularyKey,
  buildVocabularyMergePlan,
  VocabularyMergePlan,
  buildExistingVocabLookupMap,
  findMatchInLookupMap,
} from '@/lib/vocabDuplicateMergeService';
import { toast } from './Toast';
import {
  X, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  TableProperties, Download, RefreshCw,
} from 'lucide-react';

export interface VocabImportResultReport {
  row_number: number;
  vocabulary: string;
  reading_hiragana: string;
  action: 'create' | 'update' | 'unchanged' | 'conflict' | 'invalid' | 'skipped';
  status: string;
  message: string;
  updated_fields: string;
  conflict_fields: string;
}

export type ExistingVocabStrategy = 'fill_missing' | 'review_conflicts' | 'skip_existing';

interface ParsedVocabRow {
  item: VocabularyItem | null;
  raw: Record<string, string>;
  rowNum: number;
  errors: string[];
  skipped: boolean;
  skipReason: string;
  duplicateAction: 'create' | 'update' | 'unchanged' | 'conflict';
  existingMatch?: VocabularyItem;
  fillableCount: number;
  conflictCount: number;
  mergePlan?: VocabularyMergePlan;
}

interface LessonMeta {
  lessonId: string;
  lessonName: string;
  description: string;
  jlptLevel: string;
  tags: string;
  targetClasses: string[];
}

export interface VocabImportModalProps {
  currentUser?: User;
  onClose: () => void;
  onImport: (
    lessons: Lesson[],
    vocabItems: VocabularyItem[],
    updatedItems?: VocabularyItem[]
  ) => Promise<void> | void;
  categories?: LessonCategory[];
  targetCategoryId?: string;
  targetFolderId?: string | null;
  targetLesson?: Lesson;
  existingItems?: VocabularyItem[];
  allSystemItems?: VocabularyItem[];
}

type Phase = 'select' | 'parsing' | 'validating' | 'ready' | 'importing' | 'done';

const REQUIRED_FIELDS = [...VOCAB_REQUIRED_HEADERS];

export function VocabImportModal({
  currentUser,
  onClose,
  onImport,
  targetCategoryId = '',
  targetFolderId,
  targetLesson,
  existingItems = [],
}: VocabImportModalProps) {
  const [phase, setPhase] = useState<Phase>('select');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedVocabRow[]>([]);
  const [, setFieldMapping] = useState<Record<string, string>>({});
  const [lessonMetas, setLessonMetas] = useState<LessonMeta[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'valid' | 'invalid' | 'skipped' | 'duplicate' | 'conflict'>('all');
  const [existingStrategy, setExistingStrategy] = useState<ExistingVocabStrategy>('fill_missing');

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
  const [importReports, setImportReports] = useState<VocabImportResultReport[]>([]);

  const validRows = useMemo(() => parsedRows.filter((r) => r.item && !r.skipped), [parsedRows]);
  const invalidRows = useMemo(() => parsedRows.filter((r) => r.errors.length > 0 && !r.skipped), [parsedRows]);
  const skippedRows = useMemo(() => parsedRows.filter((r) => r.skipped), [parsedRows]);
  const duplicateRows = useMemo(() => validRows.filter((r) => r.duplicateAction !== 'create'), [validRows]);
  const conflictRows = useMemo(() => validRows.filter((r) => r.duplicateAction === 'conflict'), [validRows]);

  const filteredRows = useMemo(() => {
    if (activeFilter === 'valid') return validRows;
    if (activeFilter === 'invalid') return invalidRows;
    if (activeFilter === 'skipped') return skippedRows;
    if (activeFilter === 'duplicate') return duplicateRows;
    if (activeFilter === 'conflict') return conflictRows;
    return parsedRows;
  }, [parsedRows, validRows, invalidRows, skippedRows, duplicateRows, conflictRows, activeFilter]);

  const duplicateVocabInFile = useMemo(() => {
    const vocabs = new Map<string, number>();
    validRows.forEach((r) => {
      if (r.item) {
        const k = normalizeVocabularyKey(r.item.vocabulary, r.item.readingHiragana);
        vocabs.set(k, (vocabs.get(k) ?? 0) + 1);
      }
    });
    return new Set(Array.from(vocabs.entries()).filter(([, c]) => c > 1).map(([k]) => k));
  }, [validRows]);

  const parseFile = (file: File) => {
    setFileName(file.name);
    setPhase('parsing');
    setParsedRows([]);
    setLessonMetas([]);
    setFieldMapping({});
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });

        const targetSheetName = wb.SheetNames.find(
          (s) => s.trim().toLowerCase() === 'vocabulary_data' || s.trim().toLowerCase() === 'vocabulary'
        );

        if (!targetSheetName) {
          toast('File Excel thiếu worksheet Vocabulary_Data (hoặc Vocabulary)', 'error');
          setPhase('select');
          return;
        }

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
            // ignore
          }
        }

        const ws = wb.Sheets[targetSheetName];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown as string[][];

        if (!rows || rows.length === 0) {
          toast('Sheet dữ liệu trống', 'error');
          setPhase('select');
          return;
        }

        const checkRowContainsHeaders = (r: unknown[]): boolean => {
          if (!r || !Array.isArray(r)) return false;
          const normalizedCells = r.map((c) => String(c ?? '').trim().toLowerCase().replace(/\s+/g, '_'));
          return (
            normalizedCells.includes('vocabulary') &&
            (normalizedCells.includes('id') || normalizedCells.includes('meaning_vi') || normalizedCells.includes('reading_hiragana'))
          );
        };

        let headerRowIdx = -1;
        if (rows[3] && checkRowContainsHeaders(rows[3])) {
          headerRowIdx = 3;
        } else {
          for (let r = 0; r < Math.min(rows.length, 6); r++) {
            if (checkRowContainsHeaders(rows[r])) {
              headerRowIdx = r;
              break;
            }
          }
        }

        if (headerRowIdx < 0) {
          headerRowIdx = rows.length > 3 ? 3 : 0;
        }

        const dataStartIdx = headerRowIdx + 1;
        const headers = (rows[headerRowIdx] ?? []).map((h) => String(h ?? '').trim());

        const colIdx: Record<string, number> = {};
        headers.forEach((h, i) => {
          const normalized = h.toLowerCase().replace(/\s+/g, '_');
          colIdx[normalized] = i;
          colIdx[h] = i;
        });

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

        const missingHeaders = REQUIRED_FIELDS.filter((f) => resolveCol(f) < 0);
        if (missingHeaders.length > 0) {
          toast(`File thiếu các cột bắt buộc: ${missingHeaders.join(', ')}`, 'error');
          setPhase('select');
          return;
        }

        const getVal = (rowIdx: number, fieldName: string): string => {
          const ci = resolveCol(fieldName);
          if (ci < 0) return '';
          return String(rows[rowIdx]?.[ci] ?? '').trim();
        };

        const parsed: ParsedVocabRow[] = [];
        const lessonGroups = new Map<string, { name: string; items: ParsedVocabRow[] }>();

        // Map tra cứu từ vựng đã tồn tại trong bài học mục tiêu (lớp phòng thủ đa tầng)
        let currentExisting = existingItems;
        if ((!currentExisting || currentExisting.length === 0) && targetLesson?.id) {
          try {
            currentExisting = await loadVocabItems(targetLesson.id);
          } catch (err) {
            console.warn('Không thể tải từ vựng hiện tại của bài học:', err);
          }
        }
        const lookupMap = buildExistingVocabLookupMap(currentExisting || []);

        for (let i = dataStartIdx; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.every((c) => String(c ?? '').trim() === '')) continue;

          const rowNum = i + 1;
          const rawObj: Record<string, string> = {};
          headers.forEach((h, j) => { rawObj[h] = String(row[j] ?? '').trim(); });

          const errors: string[] = [];

          const activeVal = getVal(i, 'active').toUpperCase();
          if (activeVal === 'FALSE' || activeVal === '0' || activeVal === 'NO') {
            parsed.push({
              item: null,
              raw: rawObj,
              rowNum,
              errors: [],
              skipped: true,
              skipReason: 'active = FALSE',
              duplicateAction: 'create',
              fillableCount: 0,
              conflictCount: 0,
            });
            continue;
          }

          for (const field of REQUIRED_FIELDS) {
            const val = getVal(i, field);
            if (!val) {
              errors.push(`Thiếu ${field}`);
            }
          }

          const relatedWordsRaw = getVal(i, 'related_words');
          const relatedWords = relatedWordsRaw
            ? relatedWordsRaw.split('|').map((w) => w.trim()).filter(Boolean)
            : [];

          const hanViet = getVal(i, 'han_viet');
          const kanjiMemoryHint = getVal(i, 'kanji_memory_hint');

          let kanjiBreakdown: KanjiBreakdownItem[] = [];
          const rawBreakdown = getVal(i, 'kanji_breakdown');
          if (rawBreakdown) {
            try {
              const parsedJson = JSON.parse(rawBreakdown);
              if (Array.isArray(parsedJson)) kanjiBreakdown = parsedJson;
            } catch {
              kanjiBreakdown = [];
            }
          }
          if (kanjiBreakdown.length === 0) {
            for (let k = 1; k <= 4; k++) {
              const kChar = getVal(i, `kanji_${k}`);
              const kHanViet = getVal(i, `kanji_${k}_han_viet`);
              const kMeaning = getVal(i, `kanji_${k}_meaning`) || getVal(i, `kanji_${k}_meaning_vi`);
              const kOnyomi = getVal(i, `kanji_${k}_onyomi`);
              const kKunyomi = getVal(i, `kanji_${k}_kunyomi`);
              if (kChar || kHanViet) {
                kanjiBreakdown.push({
                  kanji: kChar,
                  hanViet: kHanViet,
                  meaningVi: kMeaning,
                  onyomi: kOnyomi || undefined,
                  kunyomi: kKunyomi || undefined,
                });
              }
            }
          }

          const lessonIdRaw = targetLesson ? targetLesson.id : getVal(i, 'lesson_id');
          const lessonName = targetLesson ? targetLesson.title : (getVal(i, 'lesson_name') || getVal(i, 'lesson') || '');

          const itemId = generateId('vocab');
          const vocabText = getVal(i, 'vocabulary');
          const hiraText = getVal(i, 'reading_hiragana');

          const item: VocabularyItem = {
            id: itemId,
            lessonId: lessonIdRaw || '',
            vocabId: getVal(i, 'id'),
            vocabulary: vocabText,
            readingHiragana: hiraText,
            readingRomaji: getVal(i, 'reading_romaji'),
            onyomi: getVal(i, 'onyomi'),
            kunyomi: getVal(i, 'kunyomi'),
            meaningVi: getVal(i, 'meaning_vi'),
            hanViet,
            kanjiBreakdown: kanjiBreakdown.length > 0 ? kanjiBreakdown : undefined,
            kanjiMemoryHint,
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

          // Kiểm tra trùng lặp với danh sách từ vựng hiện có bằng lookupMap đa tầng
          let duplicateAction: ParsedVocabRow['duplicateAction'] = 'create';
          let existingMatch: VocabularyItem | undefined;
          let fillableCount = 0;
          let conflictCount = 0;
          let mergePlan: VocabularyMergePlan | undefined;

          if (errors.length === 0) {
            const foundExisting = findMatchInLookupMap(lookupMap, {
              vocabulary: vocabText,
              readingHiragana: hiraText,
              id: getVal(i, 'id'),
              vocabId: getVal(i, 'id'),
            });
            if (foundExisting) {
              existingMatch = foundExisting;
              mergePlan = buildVocabularyMergePlan(foundExisting, item);
              duplicateAction = mergePlan.action;
              fillableCount = mergePlan.fillableFields.length;
              conflictCount = mergePlan.conflictFields.length;
            }
          }

          const parsedRow: ParsedVocabRow = {
            item: errors.length === 0 ? item : null,
            raw: rawObj,
            rowNum,
            errors,
            skipped: false,
            skipReason: '',
            duplicateAction,
            existingMatch,
            fillableCount,
            conflictCount,
            mergePlan,
          };
          parsed.push(parsedRow);

          if (errors.length === 0) {
            const groupKey = lessonIdRaw || lessonName || '__single__';
            if (!lessonGroups.has(groupKey)) {
              lessonGroups.set(groupKey, {
                name: lessonName || (lessonIdRaw ? `Bài học ${lessonIdRaw}` : 'Bài học từ vựng'),
                items: [],
              });
            }
            lessonGroups.get(groupKey)!.items.push(parsedRow);
          }
        }

        setParsedRows(parsed);

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

  const handleConfirmImport = async () => {
    if (isSubmittingRef.current) return;
    if (!selectedSubjectId) {
      toast('Vui lòng chọn môn học cho bài học trước khi nhập', 'error');
      return;
    }
    isSubmittingRef.current = true;
    setPhase('importing');

    try {
      const lessons: Lesson[] = [];
      const newVocabItems: VocabularyItem[] = [];
      const updatedVocabItems: VocabularyItem[] = [];
      const reports: VocabImportResultReport[] = [];
      const selectedSubject = availableSubjects.find((s) => s.id === selectedSubjectId);

      // Nếu đang import vào bài học mục tiêu cụ thể
      if (targetLesson) {
        lessons.push({
          ...targetLesson,
          subjectId: selectedSubjectId,
          subjectName: selectedSubject?.name ?? targetLesson.subjectName ?? null,
        });
      } else {
        lessonMetas.forEach((meta) => {
          const lesson: Lesson = {
            id: meta.lessonId,
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
            targetClasses: meta.targetClasses.length > 0 ? meta.targetClasses : [],
            categoryId: targetCategoryId || null,
            folderId: targetFolderId ?? null,
            subjectId: selectedSubjectId,
            subjectName: selectedSubject?.name ?? null,
            startAt: null,
            deadline: null,
            classSchedules: {},
            createdAt: new Date().toISOString(),
          };
          lessons.push(lesson);
        });
      }

      parsedRows.forEach((row) => {
        if (row.skipped) {
          reports.push({
            row_number: row.rowNum,
            vocabulary: row.raw['vocabulary'] || '',
            reading_hiragana: row.raw['reading_hiragana'] || '',
            action: 'skipped',
            status: 'Bỏ qua',
            message: row.skipReason || 'Bị bỏ qua do active=FALSE',
            updated_fields: '',
            conflict_fields: '',
          });
          return;
        }

        if (row.errors.length > 0 || !row.item) {
          reports.push({
            row_number: row.rowNum,
            vocabulary: row.raw['vocabulary'] || '',
            reading_hiragana: row.raw['reading_hiragana'] || '',
            action: 'invalid',
            status: 'Lỗi',
            message: row.errors.join('; '),
            updated_fields: '',
            conflict_fields: '',
          });
          return;
        }

        const item = row.item;
        const lessonId = targetLesson ? targetLesson.id : (item.lessonId || lessonMetas[0]?.lessonId || '');

        // 1. Trường hợp TỪ MỚI
        if (row.duplicateAction === 'create' || !row.existingMatch) {
          const createdItem: VocabularyItem = {
            ...item,
            lessonId,
            sortOrder: newVocabItems.length,
          };
          newVocabItems.push(createdItem);

          reports.push({
            row_number: row.rowNum,
            vocabulary: item.vocabulary,
            reading_hiragana: item.readingHiragana,
            action: 'create',
            status: 'Thành công',
            message: 'Tạo mới thành công',
            updated_fields: '',
            conflict_fields: '',
          });
          return;
        }

        // 2. Trường hợp TỪ ĐÃ TỒN TẠI
        const plan = row.mergePlan;

        if (existingStrategy === 'skip_existing') {
          reports.push({
            row_number: row.rowNum,
            vocabulary: item.vocabulary,
            reading_hiragana: item.readingHiragana,
            action: 'unchanged',
            status: 'Bỏ qua',
            message: 'Bỏ qua do tùy chọn không cập nhật từ đã tồn tại',
            updated_fields: '',
            conflict_fields: '',
          });
          return;
        }

        if (!plan || plan.action === 'unchanged') {
          reports.push({
            row_number: row.rowNum,
            vocabulary: item.vocabulary,
            reading_hiragana: item.readingHiragana,
            action: 'unchanged',
            status: 'Giữ nguyên',
            message: 'Thông tin hoàn toàn trùng khớp, không thay đổi',
            updated_fields: '',
            conflict_fields: '',
          });
          return;
        }

        // Merge theo chiến lược an toàn
        const finalMerged = { ...plan.mergedItem };
        const updatedFieldsList = plan.fillableFields.map((f) => f.label).join(', ');
        const conflictFieldsList = plan.conflictFields.map((f) => f.label).join(', ');

        if (existingStrategy === 'fill_missing') {
          // Chỉ điền trường trống, giữ toàn bộ trường xung đột
          plan.conflictFields.forEach((cf) => {
            (finalMerged as unknown as Record<string, unknown>)[cf.field] = cf.existingValue;
          });

          updatedVocabItems.push(finalMerged);

          reports.push({
            row_number: row.rowNum,
            vocabulary: item.vocabulary,
            reading_hiragana: item.readingHiragana,
            action: 'update',
            status: 'Thành công',
            message: `Đã bổ sung ${plan.fillableFields.length} trường còn thiếu. Giữ nguyên ${plan.conflictFields.length} trường xung đột.`,
            updated_fields: updatedFieldsList,
            conflict_fields: conflictFieldsList,
          });
        } else if (existingStrategy === 'review_conflicts') {
          // Cho phép cập nhật cả trường conflict nếu người dùng chấp nhận
          updatedVocabItems.push(finalMerged);

          reports.push({
            row_number: row.rowNum,
            vocabulary: item.vocabulary,
            reading_hiragana: item.readingHiragana,
            action: plan.action === 'conflict' ? 'conflict' : 'update',
            status: 'Cập nhật',
            message: `Đã cập nhật dữ liệu mới (bao gồm ${plan.conflictFields.length} trường xung đột).`,
            updated_fields: updatedFieldsList,
            conflict_fields: conflictFieldsList,
          });
        }
      });

      setImportReports(reports);

      // Gọi callback import với Timeout Guard 30s để đảm bảo không bao giờ bị kẹt loading vô thời hạn
      const IMPORT_TIMEOUT_MS = 30000;
      await Promise.race([
        Promise.resolve(onImport(lessons, newVocabItems, updatedVocabItems)),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Thao tác nhập dữ liệu quá thời gian chờ (Timeout 30 giây). Vui lòng kiểm tra lại kết nối mạng.')),
            IMPORT_TIMEOUT_MS
          )
        ),
      ]);

      setPhase('done');
      toast(`Đã xử lý: ${newVocabItems.length} tạo mới, ${updatedVocabItems.length} cập nhật bổ sung.`, 'success');
    } catch (err: unknown) {
      console.error('Lỗi khi thực hiện nhập dữ liệu từ vựng:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast(`Lỗi khi nhập dữ liệu: ${msg}`, 'error');
      setPhase('ready'); // Luôn giải phóng trạng thái kẹt loading để người dùng thao tác tiếp
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleDownloadReport = () => {
    if (importReports.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(importReports);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import_Summary');
    XLSX.writeFile(wb, `QuizForms_Vocab_Import_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filterTabs: { id: typeof activeFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Tất cả', count: parsedRows.length },
    { id: 'valid', label: 'Hợp lệ', count: validRows.length },
    { id: 'duplicate', label: 'Đã có sẵn', count: duplicateRows.length },
    ...(conflictRows.length > 0
      ? [{ id: 'conflict' as const, label: `Xung đột (${conflictRows.length})`, count: conflictRows.length }]
      : []),
    { id: 'invalid', label: 'Lỗi', count: invalidRows.length },
    { id: 'skipped', label: 'Bỏ qua', count: skippedRows.length },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-fade-in md:items-center p-3" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl safe-bottom" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between border-b pb-3">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-base sm:text-lg font-bold text-slate-800">
              <FileSpreadsheet size={22} className="text-indigo-600" /> Nhập từ vựng từ Excel
            </h3>
            {targetLesson && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                Mục tiêu: <strong className="text-slate-700">{targetLesson.title}</strong>
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </div>

        {/* Nút tải file Excel mẫu */}
        {phase === 'select' && (
          <>
            <div className="mb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5">
              <div>
                <p className="text-xs font-bold text-indigo-900">Chưa có file mẫu chuẩn?</p>
                <p className="text-[11px] text-indigo-700">Tải file Excel mẫu chính thức của QuizForms để điền dữ liệu đúng quy cách.</p>
              </div>
              <button
                type="button"
                onClick={() => downloadVocabExcelTemplate()}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-indigo-300 bg-white px-3.5 py-2 text-xs font-bold text-indigo-700 shadow-xs hover:bg-indigo-50 shrink-0 active:scale-[0.98] transition-all"
              >
                <Download size={15} /> Tải file Excel mẫu
              </button>
            </div>

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
          </>
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
            <p className="text-sm font-medium text-slate-600">Đang kiểm tra trùng lặp và dữ liệu...</p>
          </div>
        )}

        {(phase === 'ready' || phase === 'importing') && (
          <>
            {/* Summary */}
            <div className="mb-3 rounded-xl bg-slate-100 px-3.5 py-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">{fileName}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3 text-slate-600">
                <span>Tổng: <strong>{parsedRows.length}</strong></span>
                <span className="text-emerald-700">Tạo mới: <strong>{validRows.filter((r) => r.duplicateAction === 'create').length}</strong></span>
                <span className="text-blue-700">Đã tồn tại: <strong>{duplicateRows.length}</strong></span>
                {invalidRows.length > 0 && <span className="text-red-600">Lỗi: <strong>{invalidRows.length}</strong></span>}
                {skippedRows.length > 0 && <span className="text-amber-600">Bỏ qua: <strong>{skippedRows.length}</strong></span>}
              </div>
            </div>

            {/* Môn học */}
            <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-bold text-slate-800">
                  Môn học áp dụng cho bài học: <span className="text-rose-500">*</span>
                </label>
                {(!currentUser || currentUser.role === 'admin') && (
                  <button
                    type="button"
                    onClick={() => setIsCreatingSubject((prev) => !prev)}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    {isCreatingSubject ? 'Đóng' : '⊕ Thêm môn học mới'}
                  </button>
                )}
              </div>

              {isCreatingSubject && (
                <div className="flex items-center gap-2 mb-2 p-2 bg-white border border-indigo-300 rounded-lg">
                  <input
                    type="text"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    placeholder="Nhập tên môn học mới..."
                    className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                    className="rounded bg-indigo-600 px-3 py-1 text-xs font-bold text-white hover:bg-indigo-700"
                  >
                    Lưu môn
                  </button>
                </div>
              )}

              {selectableSubjects.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                    Chưa có môn học. Vui lòng tạo môn học trước.
                  </p>
                </div>
              ) : (
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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

            {/* Chiến lược xử lý từ đã tồn tại */}
            <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 text-xs">
              <p className="font-bold text-indigo-950 mb-1.5 flex items-center gap-1.5">
                <RefreshCw size={14} className="text-indigo-600" />
                <span>Cách xử lý từ vựng đã tồn tại trong bài học:</span>
              </p>
              <div className="space-y-1.5">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="existing_strategy"
                    value="fill_missing"
                    checked={existingStrategy === 'fill_missing'}
                    onChange={() => setExistingStrategy('fill_missing')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800">
                      Chỉ bổ sung trường còn thiếu, giữ toàn bộ dữ liệu cũ (Khuyên dùng)
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Tự động điền các ô cũ bị trống (ví dụ Hán Việt, Romaji, Kanji breakdown). Không ghi đè khi dữ liệu khác nhau.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="existing_strategy"
                    value="review_conflicts"
                    checked={existingStrategy === 'review_conflicts'}
                    onChange={() => setExistingStrategy('review_conflicts')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800">
                      Cập nhật dữ liệu mới nếu có khác biệt
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Ghi đè bằng dữ liệu trong file Excel cho các trường xung đột.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="existing_strategy"
                    value="skip_existing"
                    checked={existingStrategy === 'skip_existing'}
                    onChange={() => setExistingStrategy('skip_existing')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800">
                      Bỏ qua toàn bộ từ đã tồn tại
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Chỉ tạo mới các từ chưa từng xuất hiện trong bài học này.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Cảnh báo khi có xung đột dữ liệu */}
            {conflictRows.length > 0 && (
              <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-950 flex items-start gap-2.5 shadow-xs">
                <AlertTriangle size={18} className="shrink-0 text-amber-600 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-amber-900">
                      Phát hiện {conflictRows.length} từ có dữ liệu khác với bài học (Xung đột)
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveFilter('conflict')}
                      className="text-[11px] underline font-semibold text-amber-800 hover:text-amber-950 shrink-0"
                    >
                      Xem từ xung đột →
                    </button>
                  </div>
                  <p className="mt-0.5 text-[11px] text-amber-800 leading-relaxed">
                    Dữ liệu trong file Excel khác với dữ liệu đang có trong bài học. Vui lòng chọn chiến lược xử lý bên dưới (Mặc định: Chỉ bổ sung trường còn thiếu, an toàn không mất dữ liệu cũ).
                  </p>
                </div>
              </div>
            )}

            {/* Trùng lặp nội bộ trong file Excel */}
            {duplicateVocabInFile.size > 0 && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                <span>
                  Phát hiện {duplicateVocabInFile.size} từ xuất hiện nhiều lần trong chính file Excel tải lên.
                </span>
              </div>
            )}

            {/* Filter tabs */}
            <div className="mb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
              {filterTabs.map((ft) => (
                <button
                  key={ft.id}
                  onClick={() => setActiveFilter(ft.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-all ${
                    activeFilter === ft.id
                      ? 'bg-slate-700 text-white'
                      : ft.id === 'conflict'
                      ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {ft.label}
                </button>
              ))}
            </div>

            {/* Data preview */}
            <div className="mb-4 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              {filteredRows.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Không có dòng nào</p>
              ) : (
                filteredRows.slice(0, 60).map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs ${r.skipped ? 'opacity-50' : ''}`}>
                    <span className="w-7 shrink-0 font-mono text-[10px] text-slate-400">{r.rowNum}</span>
                    {r.skipped ? (
                      <span className="flex-1 text-amber-600">Bỏ qua: {r.skipReason}</span>
                    ) : r.errors.length > 0 ? (
                      <span className="flex-1 text-red-600 font-medium">{r.errors.join('; ')}</span>
                    ) : (
                      <>
                        <span className="font-jp w-24 sm:w-32 truncate font-bold text-slate-800">
                          {r.item?.vocabulary}
                        </span>
                        <span className="font-jp w-24 sm:w-28 truncate text-blue-600">
                          {r.item?.readingHiragana}
                        </span>
                        <span className="flex-1 truncate text-slate-600">
                          {r.item?.meaningVi}
                        </span>

                        {/* Chi tiết trường xung đột */}
                        {r.duplicateAction === 'conflict' && r.mergePlan && r.mergePlan.conflictFields.length > 0 && (
                          <span
                            className="text-[10px] text-amber-700 italic truncate max-w-[140px] hidden sm:inline"
                            title={r.mergePlan.conflictFields.map((f) => `${f.label}: [Cũ] "${f.existingValue}" ➔ [Mới] "${f.incomingValue}"`).join('; ')}
                          >
                            Khác: {r.mergePlan.conflictFields.map((f) => f.label).join(', ')}
                          </span>
                        )}

                        {/* Status Badge */}
                        {r.duplicateAction === 'create' ? (
                          <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            Mới
                          </span>
                        ) : r.duplicateAction === 'update' ? (
                          <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                            Bổ sung ({r.fillableCount})
                          </span>
                        ) : r.duplicateAction === 'conflict' ? (
                          <span
                            className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 cursor-help"
                            title={r.mergePlan?.conflictFields.map((f) => `${f.label}: [Cũ] "${f.existingValue}" ➔ [Mới] "${f.incomingValue}"`).join('\n')}
                          >
                            Xung đột ({r.conflictCount})
                          </span>
                        ) : (
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            Giữ nguyên
                          </span>
                        )}
                      </>
                    )}
                  </div>
                ))
              )}
              {filteredRows.length > 60 && (
                <p className="py-2 text-center text-[10px] text-slate-400">... và {filteredRows.length - 60} dòng nữa</p>
              )}
            </div>

            {/* Import Button */}
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={validRows.length === 0 || !selectedSubjectId || phase === 'importing'}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {phase === 'importing' ? (
                <><TableProperties size={18} className="animate-pulse" /> Đang xử lý nhập dữ liệu...</>
              ) : (
                <><FileSpreadsheet size={18} /> Xác nhận nhập dữ liệu ({validRows.length} dòng)</>
              )}
            </button>
          </>
        )}

        {/* Phase Done: Báo cáo kết quả và tải file */}
        {phase === 'done' && (
          <div className="py-2 text-center space-y-4">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 size={28} />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-800">Nhập dữ liệu hoàn tất!</h4>
              <p className="text-xs text-slate-500 mt-1">
                Tất cả từ vựng đã được xử lý và lưu an toàn vào cơ sở dữ liệu.
              </p>
            </div>

            {/* Thống kê chi tiết 6 trạng thái theo đúng yêu cầu */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs max-w-xl mx-auto">
              <div className="rounded-xl bg-emerald-50 p-2.5 border border-emerald-100 text-center">
                <span className="text-[11px] text-emerald-600 font-medium block">Tạo mới</span>
                <span className="text-base font-bold text-emerald-700">
                  {importReports.filter((r) => r.action === 'create').length}
                </span>
              </div>
              <div className="rounded-xl bg-blue-50 p-2.5 border border-blue-100 text-center">
                <span className="text-[11px] text-blue-600 font-medium block">Cập nhật</span>
                <span className="text-base font-bold text-blue-700">
                  {importReports.filter((r) => r.action === 'update').length}
                </span>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-200 text-center">
                <span className="text-[11px] text-slate-500 font-medium block">Không đổi</span>
                <span className="text-base font-bold text-slate-700">
                  {importReports.filter((r) => r.action === 'unchanged').length}
                </span>
              </div>
              <div className="rounded-xl bg-amber-50 p-2.5 border border-amber-200 text-center">
                <span className="text-[11px] text-amber-700 font-medium block">Xung đột</span>
                <span className="text-base font-bold text-amber-800">
                  {importReports.filter((r) => r.action === 'conflict').length}
                </span>
              </div>
              <div className="rounded-xl bg-gray-50 p-2.5 border border-gray-200 text-center">
                <span className="text-[11px] text-gray-500 font-medium block">Bỏ qua</span>
                <span className="text-base font-bold text-gray-700">
                  {importReports.filter((r) => r.action === 'skipped').length}
                </span>
              </div>
              <div className="rounded-xl bg-red-50 p-2.5 border border-red-100 text-center">
                <span className="text-[11px] text-red-600 font-medium block">Lỗi</span>
                <span className="text-base font-bold text-red-700">
                  {importReports.filter((r) => r.action === 'invalid').length}
                </span>
              </div>
            </div>

            {/* Chi tiết từng dòng kết quả */}
            <div className="text-left border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-[11px] font-semibold text-slate-600 flex justify-between">
                <span>Chi tiết kết quả từng dòng ({importReports.length} dòng):</span>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">
                {importReports.map((rep) => (
                  <div key={rep.row_number} className="p-2.5 flex items-start gap-2">
                    <span className="text-slate-400 font-mono text-[10px] w-6 shrink-0">#{rep.row_number}</span>
                    <span className="font-bold text-slate-800 w-24 shrink-0 truncate">{rep.vocabulary}</span>
                    <span className="text-slate-500 w-24 shrink-0 truncate">{rep.reading_hiragana}</span>
                    <span className="flex-1 text-[11px] text-slate-600 truncate">{rep.message}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                        rep.action === 'create'
                          ? 'bg-emerald-100 text-emerald-800'
                          : rep.action === 'update'
                          ? 'bg-blue-100 text-blue-800'
                          : rep.action === 'conflict'
                          ? 'bg-amber-100 text-amber-800'
                          : rep.action === 'invalid'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {rep.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Nút tải file kết quả */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={handleDownloadReport}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
              >
                <Download size={15} /> Tải file kết quả (.xlsx)
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-indigo-600 px-6 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm"
              >
                Đóng cửa sổ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
