import type { GrammarItem } from '@/types';

export interface GrammarFieldComparison<T = unknown> {
  field: string;
  label: string;
  existingValue: T;
  incomingValue: T;
  status: 'fill' | 'unchanged' | 'conflict';
}

export interface GrammarMergePlan {
  action: 'create' | 'update' | 'unchanged' | 'conflict';
  existingItem?: GrammarItem;
  fillableFields: GrammarFieldComparison[];
  unchangedFields: GrammarFieldComparison[];
  conflictFields: GrammarFieldComparison[];
  mergedItem: GrammarItem;
}

/**
 * Chuẩn hóa chuỗi ký tự Nhật / Việt:
 * Loại bỏ ký tự ẩn, Unicode NFC, trim
 */
export function cleanGrammarString(str?: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[\u200B-\u200D\uFEFF\u00A0\t\r\n]/g, ' ')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Chuẩn hóa mã mục ngữ pháp (item_code)
 */
export function normalizeItemCodeKey(code?: string | null): string {
  return cleanGrammarString(code).toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

/**
 * Chuẩn hóa mẫu ngữ pháp để so sánh trùng lặp:
 * - Bỏ các ký tự đặc biệt đầu cuối: ～, ~, -, ・, 、
 * - Chuyển chữ thường
 * - Thu gọn khoảng trắng
 */
export function normalizeGrammarPatternKey(pattern?: string | null): string {
  const cleaned = cleanGrammarString(pattern).toLowerCase();
  return cleaned
    .replace(/[～~〜\-–—・、。()（）[\]]/g, '')
    .replace(/\s+/g, '');
}

export interface ExistingGrammarLookupMap {
  codeMap: Map<string, GrammarItem>;
  patternMap: Map<string, GrammarItem>;
  exactMap: Map<string, GrammarItem>;
}

export function buildExistingGrammarLookupMap(items: GrammarItem[]): ExistingGrammarLookupMap {
  const codeMap = new Map<string, GrammarItem>();
  const patternMap = new Map<string, GrammarItem>();
  const exactMap = new Map<string, GrammarItem>();

  for (const it of items) {
    if (it.itemCode || it.itemId) {
      const codeKey = normalizeItemCodeKey(it.itemCode || it.itemId);
      if (codeKey && !codeMap.has(codeKey)) codeMap.set(codeKey, it);
    }

    if (it.grammarPattern) {
      const exact = cleanGrammarString(it.grammarPattern).toLowerCase();
      const norm = normalizeGrammarPatternKey(it.grammarPattern);

      if (exact && !exactMap.has(exact)) exactMap.set(exact, it);
      if (norm && !patternMap.has(norm)) patternMap.set(norm, it);
    }
  }

  return { codeMap, patternMap, exactMap };
}

export function findMatchInGrammarLookupMap(
  lookup: ExistingGrammarLookupMap,
  pattern: string,
  itemCode?: string
): GrammarItem | undefined {
  // 1. Khớp theo item_code nếu có
  if (itemCode) {
    const codeKey = normalizeItemCodeKey(itemCode);
    if (codeKey && lookup.codeMap.has(codeKey)) {
      return lookup.codeMap.get(codeKey);
    }
  }

  // 2. Khớp chính xác theo pattern
  const exact = cleanGrammarString(pattern).toLowerCase();
  if (exact && lookup.exactMap.has(exact)) {
    return lookup.exactMap.get(exact);
  }

  // 3. Khớp mềm theo pattern chuẩn hóa
  const norm = normalizeGrammarPatternKey(pattern);
  if (norm && lookup.patternMap.has(norm)) {
    return lookup.patternMap.get(norm);
  }

  return undefined;
}

/**
 * Xây dựng kế hoạch so sánh và hòa nhập (Merge Plan) cho 1 mục ngữ pháp
 */
export function buildGrammarMergePlan(
  existing: GrammarItem,
  incoming: GrammarItem
): GrammarMergePlan {
  const fillableFields: GrammarFieldComparison[] = [];
  const unchangedFields: GrammarFieldComparison[] = [];
  const conflictFields: GrammarFieldComparison[] = [];

  const check = (
    field: string,
    label: string,
    existVal: unknown,
    inVal: unknown
  ) => {
    const eStr = cleanGrammarString(existVal);
    const iStr = cleanGrammarString(inVal);

    if (eStr === iStr) {
      unchangedFields.push({ field, label, existingValue: existVal, incomingValue: inVal, status: 'unchanged' });
    } else if (!eStr && iStr) {
      fillableFields.push({ field, label, existingValue: existVal, incomingValue: inVal, status: 'fill' });
    } else if (eStr && !iStr) {
      unchangedFields.push({ field, label, existingValue: existVal, incomingValue: inVal, status: 'unchanged' });
    } else {
      conflictFields.push({ field, label, existingValue: existVal, incomingValue: inVal, status: 'conflict' });
    }
  };

  const existConn = existing.connectionRule || existing.structure || '';
  const inConn = incoming.connectionRule || incoming.structure || '';
  const existCaution = existing.caution || existing.explanation || '';
  const inCaution = incoming.caution || incoming.explanation || '';

  check('meaning', 'Ý nghĩa', existing.meaning, incoming.meaning);
  check('connectionRule', 'Quy tắc kết nối (接続)', existConn, inConn);
  check('caution', 'Lưu ý khi dùng (注意)', existCaution, inCaution);
  check('distinction', 'Phân biệt', existing.distinction || '', incoming.distinction || '');
  check('source', 'Nguồn tài liệu', existing.source || '', incoming.source || '');
  check('jlptLevel', 'Cấp độ JLPT', existing.jlptLevel || '', incoming.jlptLevel || '');
  check('tags', 'Từ khóa (Tags)', existing.tags || '', incoming.tags || '');

  // Kiểm tra examples
  const existExCount = existing.examples?.length ?? 0;
  const inExCount = incoming.examples?.length ?? 0;
  if (existExCount === 0 && inExCount > 0) {
    fillableFields.push({
      field: 'examples',
      label: 'Danh sách ví dụ',
      existingValue: existing.examples,
      incomingValue: incoming.examples,
      status: 'fill',
    });
  } else if (existExCount > 0 && inExCount === 0) {
    unchangedFields.push({
      field: 'examples',
      label: 'Danh sách ví dụ',
      existingValue: existing.examples,
      incomingValue: incoming.examples,
      status: 'unchanged',
    });
  } else if (existExCount > 0 && inExCount > 0) {
    const eJson = JSON.stringify(existing.examples);
    const iJson = JSON.stringify(incoming.examples);
    if (eJson === iJson) {
      unchangedFields.push({ field: 'examples', label: 'Danh sách ví dụ', existingValue: existing.examples, incomingValue: incoming.examples, status: 'unchanged' });
    } else {
      conflictFields.push({ field: 'examples', label: 'Danh sách ví dụ', existingValue: existing.examples, incomingValue: incoming.examples, status: 'conflict' });
    }
  }

  // Kiểm tra exercises
  const existExerCount = existing.exercises?.length ?? 0;
  const inExerCount = incoming.exercises?.length ?? 0;
  if (existExerCount === 0 && inExerCount > 0) {
    fillableFields.push({
      field: 'exercises',
      label: 'Danh sách bài tập',
      existingValue: existing.exercises,
      incomingValue: incoming.exercises,
      status: 'fill',
    });
  } else if (existExerCount > 0 && inExerCount === 0) {
    unchangedFields.push({
      field: 'exercises',
      label: 'Danh sách bài tập',
      existingValue: existing.exercises,
      incomingValue: incoming.exercises,
      status: 'unchanged',
    });
  } else if (existExerCount > 0 && inExerCount > 0) {
    const eJson = JSON.stringify(existing.exercises);
    const iJson = JSON.stringify(incoming.exercises);
    if (eJson === iJson) {
      unchangedFields.push({ field: 'exercises', label: 'Danh sách bài tập', existingValue: existing.exercises, incomingValue: incoming.exercises, status: 'unchanged' });
    } else {
      conflictFields.push({ field: 'exercises', label: 'Danh sách bài tập', existingValue: existing.exercises, incomingValue: incoming.exercises, status: 'conflict' });
    }
  }

  // Kiểm tra answers
  const existAnsCount = existing.answers?.length ?? 0;
  const inAnsCount = incoming.answers?.length ?? 0;
  if (existAnsCount === 0 && inAnsCount > 0) {
    fillableFields.push({
      field: 'answers',
      label: 'Danh sách đáp án',
      existingValue: existing.answers,
      incomingValue: incoming.answers,
      status: 'fill',
    });
  } else if (existAnsCount > 0 && inAnsCount === 0) {
    unchangedFields.push({
      field: 'answers',
      label: 'Danh sách đáp án',
      existingValue: existing.answers,
      incomingValue: incoming.answers,
      status: 'unchanged',
    });
  } else if (existAnsCount > 0 && inAnsCount > 0) {
    const eJson = JSON.stringify(existing.answers);
    const iJson = JSON.stringify(incoming.answers);
    if (eJson === iJson) {
      unchangedFields.push({ field: 'answers', label: 'Danh sách đáp án', existingValue: existing.answers, incomingValue: incoming.answers, status: 'unchanged' });
    } else {
      conflictFields.push({ field: 'answers', label: 'Danh sách đáp án', existingValue: existing.answers, incomingValue: incoming.answers, status: 'conflict' });
    }
  }

  let action: GrammarMergePlan['action'] = 'unchanged';
  if (conflictFields.length > 0) {
    action = 'conflict';
  } else if (fillableFields.length > 0) {
    action = 'update';
  }

  // Merged item: Giữ an toàn dữ liệu cũ, điền các trường thiếu
  const mergedItem: GrammarItem = {
    ...existing,
    itemCode: existing.itemCode || incoming.itemCode,
    itemId: existing.itemId || incoming.itemId,
    grammarPattern: existing.grammarPattern || incoming.grammarPattern,
    meaning: existing.meaning || incoming.meaning,
    connectionRule: existConn || inConn,
    caution: existCaution || inCaution,
    structure: existConn || inConn,
    explanation: existCaution || inCaution,
    distinction: existing.distinction || incoming.distinction,
    source: existing.source || incoming.source,
    jlptLevel: existing.jlptLevel || incoming.jlptLevel,
    tags: existing.tags || incoming.tags,
    examples: (existing.examples && existing.examples.length > 0) ? existing.examples : (incoming.examples ?? []),
    exercises: (existing.exercises && existing.exercises.length > 0) ? existing.exercises : (incoming.exercises ?? []),
    answers: (existing.answers && existing.answers.length > 0) ? existing.answers : (incoming.answers ?? []),
    updatedAt: new Date().toISOString(),
  };

  return {
    action,
    existingItem: existing,
    fillableFields,
    unchangedFields,
    conflictFields,
    mergedItem,
  };
}
