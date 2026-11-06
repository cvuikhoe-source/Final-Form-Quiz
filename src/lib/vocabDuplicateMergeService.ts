import type { VocabularyItem, KanjiBreakdownItem } from '@/types';

export interface FieldComparison<T = unknown> {
  field: string;
  label: string;
  existingValue: T;
  incomingValue: T;
  status: 'fill' | 'unchanged' | 'conflict';
  chosenValue?: T;
}

export interface KanjiBreakdownMergeResult {
  merged: KanjiBreakdownItem[];
  hasChanges: boolean;
  conflicts: {
    kanji: string;
    field: string;
    existing: string;
    incoming: string;
  }[];
}

export interface VocabularyMergePlan {
  action: 'create' | 'update' | 'unchanged' | 'conflict';
  existingItem?: VocabularyItem;
  fillableFields: FieldComparison[];
  unchangedFields: FieldComparison[];
  conflictFields: FieldComparison[];
  mergedItem: VocabularyItem;
}

/**
 * Chuẩn hóa chuỗi ký tự:
 * - Loại bỏ ký tự ẩn (zero-width, BOM, non-breaking spaces)
 * - Unicode NFC
 * - Trim và rút gọn khoảng trắng
 */
export function cleanJapaneseString(str?: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[\u200B-\u200D\uFEFF\u00A0\t\r\n]/g, ' ')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Trích xuất từ vựng và cách đọc từ bất kỳ đối tượng nào
 * (hỗ trợ cả camelCase từ VocabularyItem và snake_case từ Database / Excel row)
 */
export function extractVocabAndReading(obj: Record<string, unknown> | null | undefined): {
  vocabulary: string;
  readingHiragana: string;
} {
  if (!obj) return { vocabulary: '', readingHiragana: '' };

  const vocab = cleanJapaneseString(
    obj.vocabulary ??
    obj.Vocabulary ??
    obj.vocab ??
    obj['từ_vựng'] ??
    obj['tu_vung'] ??
    ''
  );

  const hira = cleanJapaneseString(
    obj.readingHiragana ??
    obj.reading_hiragana ??
    obj['Reading_Hiragana'] ??
    obj.hiragana ??
    obj.Hiragana ??
    obj.reading ??
    obj.Reading ??
    obj['cách_đọc'] ??
    obj['cach_doc'] ??
    ''
  );

  return { vocabulary: vocab, readingHiragana: hira };
}

/**
 * Chuẩn hóa khóa nhận diện từ vựng:
 * Khóa = normalized(vocabulary) + ':::' + normalized(reading_hiragana)
 * Quy tắc:
 * - Unicode NFC
 * - Loại bỏ ký tự ẩn
 * - Trim khoảng trắng đầu cuối
 * - Rút gọn khoảng trắng thừa ở giữa
 * - Giữ nguyên chữ Nhật (không convert Kanji -> Kana, không dùng meaning_vi)
 */
export function normalizeVocabularyKey(vocabulary?: string | null, readingHiragana?: string | null): string {
  const normVocab = cleanJapaneseString(vocabulary);
  const normHira = cleanJapaneseString(readingHiragana);
  return `${normVocab}:::${normHira}`;
}

export interface ExistingVocabLookupMap {
  exactMap: Map<string, VocabularyItem>;
  vocabOnlyMap: Map<string, VocabularyItem>;
  idMap: Map<string, VocabularyItem>;
}

/**
 * Xây dựng Map tra cứu đa lớp cho các từ vựng hiện có của bài học:
 * 1. exactMap: Khóa chính (vocabulary + ':::' + readingHiragana)
 * 2. vocabOnlyMap: Khóa dự phòng chỉ theo vocabulary (nếu từ không bị trùng đa âm)
 * 3. idMap: Khóa theo vocabId / id
 */
export function buildExistingVocabLookupMap(items: VocabularyItem[]): ExistingVocabLookupMap {
  const exactMap = new Map<string, VocabularyItem>();
  const vocabOnlyCounts = new Map<string, number>();
  const vocabOnlyMap = new Map<string, VocabularyItem>();
  const idMap = new Map<string, VocabularyItem>();

  // Bước 1: Đếm số lượng từ cùng vocabulary
  items.forEach((it) => {
    const { vocabulary } = extractVocabAndReading(it as unknown as Record<string, unknown>);
    if (vocabulary) {
      vocabOnlyCounts.set(vocabulary, (vocabOnlyCounts.get(vocabulary) ?? 0) + 1);
    }
  });

  // Bước 2: Điền các map tra cứu
  items.forEach((it) => {
    const { vocabulary, readingHiragana } = extractVocabAndReading(it as unknown as Record<string, unknown>);
    const exactKey = normalizeVocabularyKey(vocabulary, readingHiragana);

    exactMap.set(exactKey, it);

    // Nếu từ này là duy nhất trong bài học theo vocabulary, lưu vào vocabOnlyMap làm fallback an toàn
    if (vocabulary && vocabOnlyCounts.get(vocabulary) === 1) {
      vocabOnlyMap.set(vocabulary, it);
    }

    if (it.vocabId) {
      idMap.set(it.vocabId.trim(), it);
    }
    if (it.id) {
      idMap.set(it.id.trim(), it);
    }
  });

  return { exactMap, vocabOnlyMap, idMap };
}

/**
 * Tìm kiếm từ vựng trùng lặp từ lookup map
 */
export function findMatchInLookupMap(
  lookup: ExistingVocabLookupMap,
  itemOrRow: Record<string, unknown>
): VocabularyItem | undefined {
  const { vocabulary, readingHiragana } = extractVocabAndReading(itemOrRow);

  // 1. Tra cứu theo khóa chính xác (vocabulary + readingHiragana)
  if (vocabulary) {
    const exactKey = normalizeVocabularyKey(vocabulary, readingHiragana);
    const match = lookup.exactMap.get(exactKey);
    if (match) return match;
  }

  // 2. Tra cứu theo vocabId / id (nếu có)
  const rawId = String(itemOrRow.vocabId ?? itemOrRow.id ?? itemOrRow.vocab_id ?? '').trim();
  if (rawId && lookup.idMap.has(rawId)) {
    return lookup.idMap.get(rawId);
  }

  // 3. Fallback: Tra cứu theo vocabulary (nếu từ là duy nhất trong bài học)
  if (vocabulary && lookup.vocabOnlyMap.has(vocabulary)) {
    return lookup.vocabOnlyMap.get(vocabulary);
  }

  return undefined;
}

/**
 * Kiểm tra xem một giá trị có bị xem là "trống" hay không
 */
export function isValueEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

/**
 * Merge mảng tags hoặc chuỗi tags ngăn cách bởi dấu phẩy, loại bỏ trùng lặp
 */
export function mergeTags(existingTags: string, incomingTags: string): { merged: string; changed: boolean } {
  const parse = (str: string) =>
    (str || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

  const existingSet = new Set(parse(existingTags));
  const initialSize = existingSet.size;

  parse(incomingTags).forEach((t) => existingSet.add(t));

  const merged = Array.from(existingSet).join(', ');
  const changed = existingSet.size !== initialSize;
  return { merged, changed };
}

/**
 * Merge mảng từ liên quan (related_words), bảo toàn thứ tự và loại bỏ trùng lặp
 */
export function mergeRelatedWords(existing: string[], incoming: string[]): { merged: string[]; changed: boolean } {
  const existingArr = Array.isArray(existing) ? existing.map((w) => (w || '').trim()).filter(Boolean) : [];
  const incomingArr = Array.isArray(incoming) ? incoming.map((w) => (w || '').trim()).filter(Boolean) : [];

  const set = new Set(existingArr);
  const initialSize = set.size;

  incomingArr.forEach((w) => set.add(w));
  const merged = Array.from(set);
  return { merged, changed: merged.length !== initialSize };
}

/**
 * Merge phân tích từng chữ Kanji (kanjiBreakdown) theo ký tự kanji
 * Ví dụ:
 * - Cũ: 特 -> ĐẶC
 * - Mới: 特 -> ĐẶC -> "Đặc biệt" -> onyomi "トク"
 * => Bổ sung meaningVi và onyomi vào mục 特 hiện tại, không tạo mục thứ 2!
 */
export function mergeKanjiBreakdown(
  existingBreakdown: KanjiBreakdownItem[] | undefined,
  incomingBreakdown: KanjiBreakdownItem[] | undefined
): KanjiBreakdownMergeResult {
  const existingList = Array.isArray(existingBreakdown) ? [...existingBreakdown] : [];
  const incomingList = Array.isArray(incomingBreakdown) ? [...incomingBreakdown] : [];

  const map = new Map<string, KanjiBreakdownItem>();
  existingList.forEach((k) => {
    if (k && k.kanji) {
      map.set(k.kanji.trim(), { ...k });
    }
  });

  const conflicts: KanjiBreakdownMergeResult['conflicts'] = [];
  let hasChanges = false;

  for (const inc of incomingList) {
    if (!inc || !inc.kanji) continue;
    const kanjiKey = inc.kanji.trim();
    if (!kanjiKey) continue;

    const curr = map.get(kanjiKey);
    if (!curr) {
      // Kanji mới hoàn toàn -> thêm vào
      map.set(kanjiKey, {
        kanji: kanjiKey,
        hanViet: (inc.hanViet || '').trim(),
        meaningVi: (inc.meaningVi || '').trim(),
        onyomi: (inc.onyomi || '').trim() || undefined,
        kunyomi: (inc.kunyomi || '').trim() || undefined,
      });
      hasChanges = true;
    } else {
      // Kanji đã có -> enrich bổ sung trường còn thiếu, không ghi đè dữ liệu có sẵn
      const updated = { ...curr };

      // Hán Việt
      if (isValueEmpty(updated.hanViet) && !isValueEmpty(inc.hanViet)) {
        updated.hanViet = inc.hanViet.trim();
        hasChanges = true;
      } else if (!isValueEmpty(updated.hanViet) && !isValueEmpty(inc.hanViet)) {
        if (updated.hanViet.trim().toUpperCase() !== inc.hanViet.trim().toUpperCase()) {
          conflicts.push({
            kanji: kanjiKey,
            field: 'hanViet',
            existing: updated.hanViet,
            incoming: inc.hanViet,
          });
        }
      }

      // Nghĩa tiếng Việt
      if (isValueEmpty(updated.meaningVi) && !isValueEmpty(inc.meaningVi)) {
        updated.meaningVi = inc.meaningVi.trim();
        hasChanges = true;
      } else if (!isValueEmpty(updated.meaningVi) && !isValueEmpty(inc.meaningVi)) {
        if (updated.meaningVi.trim() !== inc.meaningVi.trim()) {
          conflicts.push({
            kanji: kanjiKey,
            field: 'meaningVi',
            existing: updated.meaningVi,
            incoming: inc.meaningVi,
          });
        }
      }

      // Onyomi
      if (isValueEmpty(updated.onyomi) && !isValueEmpty(inc.onyomi)) {
        updated.onyomi = (inc.onyomi || '').trim() || undefined;
        hasChanges = true;
      }

      // Kunyomi
      if (isValueEmpty(updated.kunyomi) && !isValueEmpty(inc.kunyomi)) {
        updated.kunyomi = (inc.kunyomi || '').trim() || undefined;
        hasChanges = true;
      }

      map.set(kanjiKey, updated);
    }
  }

  return {
    merged: Array.from(map.values()),
    hasChanges,
    conflicts,
  };
}

/**
 * Danh sách cấu hình các trường cần so sánh và merge
 */
const FIELD_DEFINITIONS: {
  key: keyof VocabularyItem;
  label: string;
  type: 'string' | 'tags' | 'related' | 'breakdown';
}[] = [
  { key: 'meaningVi', label: 'Nghĩa tiếng Việt', type: 'string' },
  { key: 'hanViet', label: 'Âm Hán Việt', type: 'string' },
  { key: 'readingRomaji', label: 'Romaji', type: 'string' },
  { key: 'jlptLevel', label: 'Cấp độ JLPT', type: 'string' },
  { key: 'wordType', label: 'Loại từ', type: 'string' },
  { key: 'onyomi', label: 'Âm On (Onyomi)', type: 'string' },
  { key: 'kunyomi', label: 'Âm Kun (Kunyomi)', type: 'string' },
  { key: 'kanjiMemoryHint', label: 'Gợi ý ghi nhớ Kanji', type: 'string' },
  { key: 'audioText', label: 'Văn bản phát âm', type: 'string' },
  { key: 'exampleJp1', label: 'Ví dụ 1 (Nhật)', type: 'string' },
  { key: 'exampleReading1', label: 'Ví dụ 1 (Đọc)', type: 'string' },
  { key: 'exampleVi1', label: 'Ví dụ 1 (Dịch)', type: 'string' },
  { key: 'exampleJp2', label: 'Ví dụ 2 (Nhật)', type: 'string' },
  { key: 'exampleReading2', label: 'Ví dụ 2 (Đọc)', type: 'string' },
  { key: 'exampleVi2', label: 'Ví dụ 2 (Dịch)', type: 'string' },
  { key: 'tags', label: 'Thẻ tag', type: 'tags' },
  { key: 'relatedWords', label: 'Từ liên quan', type: 'related' },
  { key: 'kanjiBreakdown', label: 'Phân tích Kanji', type: 'breakdown' },
];

/**
 * Xây dựng kế hoạch Merge chi tiết giữa bản ghi hiện tại và dữ liệu mới
 */
export function buildVocabularyMergePlan(
  existingItem: VocabularyItem,
  incomingItem: Partial<VocabularyItem>
): VocabularyMergePlan {
  const fillableFields: FieldComparison[] = [];
  const unchangedFields: FieldComparison[] = [];
  const conflictFields: FieldComparison[] = [];

  const mergedItem: VocabularyItem = {
    ...existingItem,
    // Không đổi ID bản ghi cũ
    id: existingItem.id,
    // Không đổi Lesson ID của bản ghi cũ
    lessonId: existingItem.lessonId,
  };

  for (const def of FIELD_DEFINITIONS) {
    const key = def.key;
    const existVal = existingItem[key];
    const incVal = incomingItem[key];

    if (def.type === 'tags') {
      const { merged, changed } = mergeTags(
        (existVal as string) || '',
        (incVal as string) || ''
      );
      if (changed) {
        fillableFields.push({
          field: key,
          label: def.label,
          existingValue: existVal || '',
          incomingValue: incVal || '',
          status: 'fill',
          chosenValue: merged,
        });
        (mergedItem as unknown as Record<string, unknown>)[key] = merged;
      } else {
        unchangedFields.push({
          field: key,
          label: def.label,
          existingValue: existVal || '',
          incomingValue: incVal || '',
          status: 'unchanged',
        });
      }
      continue;
    }

    if (def.type === 'related') {
      const { merged, changed } = mergeRelatedWords(
        (existVal as string[]) || [],
        (incVal as string[]) || []
      );
      if (changed) {
        fillableFields.push({
          field: key,
          label: def.label,
          existingValue: existVal || [],
          incomingValue: incVal || [],
          status: 'fill',
          chosenValue: merged,
        });
        (mergedItem as unknown as Record<string, unknown>)[key] = merged;
      } else {
        unchangedFields.push({
          field: key,
          label: def.label,
          existingValue: existVal || [],
          incomingValue: incVal || [],
          status: 'unchanged',
        });
      }
      continue;
    }

    if (def.type === 'breakdown') {
      const breakdownRes = mergeKanjiBreakdown(
        existVal as KanjiBreakdownItem[] | undefined,
        incVal as KanjiBreakdownItem[] | undefined
      );

      if (breakdownRes.conflicts.length > 0) {
        conflictFields.push({
          field: key,
          label: def.label,
          existingValue: existVal || [],
          incomingValue: incVal || [],
          status: 'conflict',
        });
      } else if (breakdownRes.hasChanges) {
        fillableFields.push({
          field: key,
          label: def.label,
          existingValue: existVal || [],
          incomingValue: incVal || [],
          status: 'fill',
          chosenValue: breakdownRes.merged,
        });
        mergedItem.kanjiBreakdown = breakdownRes.merged;
      } else {
        unchangedFields.push({
          field: key,
          label: def.label,
          existingValue: existVal || [],
          incomingValue: incVal || [],
          status: 'unchanged',
        });
      }
      continue;
    }

    // Trường hợp chuỗi văn bản thông thường
    const existEmpty = isValueEmpty(existVal);
    const incEmpty = isValueEmpty(incVal);

    if (existEmpty && !incEmpty) {
      // Cũ trống, mới có -> Bổ sung
      fillableFields.push({
        field: key,
        label: def.label,
        existingValue: '',
        incomingValue: incVal,
        status: 'fill',
        chosenValue: incVal,
      });
      (mergedItem as unknown as Record<string, unknown>)[key] = incVal;
    } else if (!existEmpty && incEmpty) {
      // Cũ có, mới trống -> Giữ dữ liệu cũ, không xóa!
      unchangedFields.push({
        field: key,
        label: def.label,
        existingValue: existVal,
        incomingValue: '',
        status: 'unchanged',
      });
    } else if (existEmpty && incEmpty) {
      // Cả 2 đều trống
      unchangedFields.push({
        field: key,
        label: def.label,
        existingValue: '',
        incomingValue: '',
        status: 'unchanged',
      });
    } else {
      // Cả 2 đều có dữ liệu
      const strExist = (existVal ?? '').toString().trim();
      const strInc = (incVal ?? '').toString().trim();

      if (strExist === strInc) {
        unchangedFields.push({
          field: key,
          label: def.label,
          existingValue: existVal,
          incomingValue: incVal,
          status: 'unchanged',
        });
      } else {
        // XUNG ĐỘT: Cả 2 bên đều có dữ liệu nhưng khác nhau!
        conflictFields.push({
          field: key,
          label: def.label,
          existingValue: existVal,
          incomingValue: incVal,
          status: 'conflict',
        });
      }
    }
  }

  // Xác định action tổng thể
  let action: VocabularyMergePlan['action'] = 'unchanged';
  if (conflictFields.length > 0) {
    action = 'conflict';
  } else if (fillableFields.length > 0) {
    action = 'update';
  }

  return {
    action,
    existingItem,
    fillableFields,
    unchangedFields,
    conflictFields,
    mergedItem,
  };
}

/**
 * Tìm kiếm các từ trùng lặp trong bài học hiện tại và trên toàn bộ hệ thống
 */
export function findVocabularyDuplicates(
  allLessonItems: VocabularyItem[],
  incomingItem: Partial<VocabularyItem>,
  currentLessonId: string
): {
  exactInCurrentLesson: VocabularyItem[];
  exactInOtherLessons: VocabularyItem[];
} {
  const targetKey = normalizeVocabularyKey(incomingItem.vocabulary, incomingItem.readingHiragana);

  const exactInCurrentLesson: VocabularyItem[] = [];
  const exactInOtherLessons: VocabularyItem[] = [];

  for (const item of allLessonItems) {
    const itemKey = normalizeVocabularyKey(item.vocabulary, item.readingHiragana);
    if (itemKey === targetKey) {
      if (item.lessonId === currentLessonId) {
        exactInCurrentLesson.push(item);
      } else {
        exactInOtherLessons.push(item);
      }
    }
  }

  return {
    exactInCurrentLesson,
    exactInOtherLessons,
  };
}

