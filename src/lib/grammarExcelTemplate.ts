import * as XLSX from 'xlsx';
import type {
  GrammarItem,
  GrammarItemExample,
  GrammarItemExercise,
  GrammarItemAnswer,
} from '@/types';

export const GRAMMAR_REQUIRED_HEADERS = [
  'item_code',
  'grammar_pattern',
  'meaning',
  'connection_rule',
] as const;

export const GRAMMAR_ALL_HEADERS = [
  'item_code',
  'grammar_pattern',
  'source',
  'meaning',
  'connection_rule',
  'caution',
  'distinction',
  'examples_json',
  'exercises_json',
  'answers_json',
  'jlpt_level',
  'tags',
  'sort_order',
  'active',
] as const;

export interface GrammarRowValidationError {
  rowNumber: number;
  column: string;
  invalidValue: string;
  reason: string;
  fixSuggestion: string;
}

export interface ParsedGrammarRowResult {
  rowNumber: number;
  itemCode: string;
  grammarPattern: string;
  source: string;
  meaning: string;
  connectionRule: string;
  caution: string;
  distinction: string;
  examples: GrammarItemExample[];
  exercises: GrammarItemExercise[];
  answers: GrammarItemAnswer[];
  jlptLevel: string;
  tags: string;
  sortOrder: number;
  active: boolean;
  errors: GrammarRowValidationError[];
  raw: Record<string, string>;
}

export interface GrammarExcelParseResult {
  sheetName: string;
  totalRows: number;
  validRows: ParsedGrammarRowResult[];
  invalidRows: ParsedGrammarRowResult[];
  skippedRows: ParsedGrammarRowResult[];
  allRows: ParsedGrammarRowResult[];
  inferredLessonTitle?: string;
  inferredJlptLevel?: string;
}

// ─── Dữ liệu mẫu chuẩn từ test.xlsx (Bai_24_01_YouDewaNaika) ───────
export const SAMPLE_GRAMMAR_ITEM = {
  item_code: 'Bai_24_01_YouDewaNaika',
  grammar_pattern: '～（よ）うではないか',
  source: 'Tài liệu luyện thi JLPT N2',
  meaning: 'Hãy cùng nhau làm V (lời kêu gọi mạnh mẽ, mang tính cổ vũ, thường dùng trong diễn thuyết hoặc văn phong trang trọng)',
  connection_rule: 'Động từ chia thể ý chí (V-よう / V-おう) + ではないか / じゃないか',
  caution: 'Mang sắc thái trang trọng, thường dùng bởi nam giới hoặc người lãnh đạo kêu gọi tập thể. Không dùng cho việc riêng tư cá nhân hàng ngày.',
  distinction: 'Khác với ～ましょう (thân mật, rủ rê thông thường), ～（よ）うではないか mang tính hiệu triệu, thúc đẩy hành động vì mục tiêu chung.',
  examples_json: JSON.stringify([
    {
      stt: 1,
      japanese: '環境を守るために何ができるか、考えてみようではないか。',
      vietnamese: 'Hãy cùng suy nghĩ xem có thể làm gì để bảo vệ môi trường!',
      analysis: '考えてみる→考えてみよう＋ではないか: kêu gọi cùng suy nghĩ thử.',
      vocabulary_furigana: '環境（かんきょう）: môi trường; 守る（まもる）: bảo vệ.',
      note: 'Ví dụ từ tài liệu; dịch thành lời kêu gọi, không phải câu hỏi thông thường.',
    },
    {
      stt: 2,
      japanese: '困難な時こそ、力を合わせて乗り越えていこうではないか。',
      vietnamese: 'Chính vào lúc khó khăn, chúng ta hãy cùng chung sức vượt qua!',
      analysis: '乗り越えていく→乗り越えていこう＋ではないか: kêu gọi đồng lòng vượt qua gian khó.',
      vocabulary_furigana: '困難（こんなん）: khó khăn; 乗り越える（のりこえる）: vượt qua.',
      note: 'Sắc thái kêu gọi tinh thần tập thể mạnh mẽ.',
    },
  ], null, 2),
  exercises_json: JSON.stringify([
    {
      stt: 1,
      type: 'multiple_choice',
      question: 'よりよい学校を一緒に（　）ではないか。',
      option_a: '作る',
      option_b: '作ろう',
      option_c: '作って',
      hint: '作る chia thể ý chí để kêu gọi.',
    },
    {
      stt: 2,
      type: 'translate',
      question: 'Dịch sang tiếng Nhật: "Hãy cùng nhau cố gắng để đạt được mục tiêu!" (Dùng cấu trúc ～（よ）うではないか)',
      option_a: '',
      option_b: '',
      option_c: '',
      hint: 'Mục tiêu: 目標 (もくひょう), cố gắng: 頑張る (がんばる) chia thể ý chí.',
    },
  ], null, 2),
  answers_json: JSON.stringify([
    {
      stt: 1,
      answer: 'B: 作ろう',
      complete_sentence: 'よりよい学校を一緒に作ろうではないか。',
      detailed_explanation: '作る→作ろう: hãy cùng xây dựng trường tốt hơn; mẫu nhấn sự đồng lòng.',
      distractor_errors: 'A thể từ điển; C thể て, không đúng thể ý chí trước ではないか.',
      self_assessment: 'Tự chấm: chọn đúng và giải thích được cách nối, sắc thái.',
    },
    {
      stt: 2,
      answer: '目標を達成するために、一緒に頑張ろうではないか。',
      complete_sentence: '目標を達成するために、一緒に頑張ろうではないか。',
      detailed_explanation: '頑張る chia thể ý chí thành 頑張ろう + ではないか tạo lời hiệu triệu mạnh mẽ.',
      distractor_errors: 'Chú ý không dùng 頑張りましょう nếu trong ngữ cảnh văn bản kêu gọi trang trọng.',
      self_assessment: 'Tự chấm: dịch đúng ngữ pháp ý chí + ではないか và đúng ngữ cảnh.',
    },
  ], null, 2),
  jlpt_level: 'N2',
  tags: 'kêu gọi, ý chí, N2, trang trọng',
  sort_order: 1,
  active: 'TRUE',
};

/**
 * Tạo workbook mẫu Excel nhập Ngữ pháp cho QuizForms
 * 1. Sheet `Grammar_Data`: Chứa đúng 14 cột chuẩn, 1 hàng = 1 GrammarItem hoàn chỉnh.
 * 2. Sheet `Huong_Dan`: Hướng dẫn đầy đủ quy cách, cấu trúc JSON và ví dụ từ test.xlsx.
 */
export function buildGrammarExcelTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // ─── Sheet 1: Grammar_Data ─────────────────────────────────
  const grammarDataRows: (string | number)[][] = [
    ['QuizForms - Mẫu nhập dữ liệu Ngữ pháp (Đọc sheet "Huong_Dan" để xem quy cách)'],
    ['Lưu ý: Các cột có dấu (*) là bắt buộc. Không sửa tiêu đề tại Hàng 4. Nhập dữ liệu từ Hàng 5 trở đi.'],
    [], // Hàng 3 để trống
    [...GRAMMAR_ALL_HEADERS], // Hàng 4 (index 3): Headers
    // Dòng 5: Mẫu chuẩn lấy từ test.xlsx (Bai_24_01_YouDewaNaika)
    [
      SAMPLE_GRAMMAR_ITEM.item_code,
      SAMPLE_GRAMMAR_ITEM.grammar_pattern,
      SAMPLE_GRAMMAR_ITEM.source,
      SAMPLE_GRAMMAR_ITEM.meaning,
      SAMPLE_GRAMMAR_ITEM.connection_rule,
      SAMPLE_GRAMMAR_ITEM.caution,
      SAMPLE_GRAMMAR_ITEM.distinction,
      SAMPLE_GRAMMAR_ITEM.examples_json,
      SAMPLE_GRAMMAR_ITEM.exercises_json,
      SAMPLE_GRAMMAR_ITEM.answers_json,
      SAMPLE_GRAMMAR_ITEM.jlpt_level,
      SAMPLE_GRAMMAR_ITEM.tags,
      SAMPLE_GRAMMAR_ITEM.sort_order,
      SAMPLE_GRAMMAR_ITEM.active,
    ],
  ];

  const wsGrammar = XLSX.utils.aoa_to_sheet(grammarDataRows);
  wsGrammar['!cols'] = [
    { wch: 26 }, // item_code
    { wch: 26 }, // grammar_pattern
    { wch: 26 }, // source
    { wch: 45 }, // meaning
    { wch: 40 }, // connection_rule
    { wch: 45 }, // caution
    { wch: 40 }, // distinction
    { wch: 50 }, // examples_json
    { wch: 50 }, // exercises_json
    { wch: 50 }, // answers_json
    { wch: 12 }, // jlpt_level
    { wch: 25 }, // tags
    { wch: 12 }, // sort_order
    { wch: 10 }, // active
  ];
  XLSX.utils.book_append_sheet(wb, wsGrammar, 'Grammar_Data');

  // ─── Sheet 2: Huong_Dan ─────────────────────────────────────
  const guideRows: string[][] = [
    ['QUY CÁCH VÀ HƯỚNG DẪN NHẬP DỮ LIỆU NGỮ PHÁP TỪ EXCEL'],
    [''],
    ['1. NGUYÊN TẮC HOẠT ĐỘNG CHÍNH:'],
    ['- Toàn bộ các dòng trong một file Excel sẽ được gom vào ĐÚNG 1 BÀI HỌC NGỮ PHÁP LỚN (ví dụ: "Ngữ pháp N2").'],
    ['- Mỗi dòng trong sheet "Grammar_Data" là một GrammarItem (mục ngữ pháp) hoàn chỉnh.'],
    ['- Ví dụ file có 50 dòng: Tạo đúng 1 Lesson chứa 50 GrammarItem. Tuyệt đối không tạo 50 Lesson riêng.'],
    ['- Thông tin bài học (tên bài, thư mục đích, cấp độ) được cấu hình một lần trong modal khi import.'],
    [''],
    ['2. DANH SÁCH VÀ QUY CÁCH CÁC CỘT:'],
    ['Tên cột', 'Bắt buộc', 'Mô tả chi tiết', 'Ví dụ'],
    ['item_code', 'CÓ (*)', 'Mã định danh duy nhất của mục ngữ pháp', 'Bai_24_01_YouDewaNaika'],
    ['grammar_pattern', 'CÓ (*)', 'Tên/mẫu ngữ pháp tiếng Nhật', '～（よ）うではないか'],
    ['source', 'Không', 'Nguồn tài liệu giáo trình', 'Tài liệu luyện thi JLPT N2'],
    ['meaning', 'CÓ (*)', 'Ý nghĩa tiếng Việt đầy đủ', 'Hãy cùng nhau làm V (lời kêu gọi mạnh mẽ)'],
    ['connection_rule', 'CÓ (*)', 'Quy tắc kết nối/cấu trúc (接続)', 'V-よう + ではないか'],
    ['caution', 'Không', 'Lưu ý khi sử dụng (注意)', 'Dùng trong ngữ cảnh trang trọng, hiệu triệu'],
    ['distinction', 'Không', 'Phân biệt sắc thái với mẫu khác', 'Khác với ～ましょう (thân mật hơn)'],
    ['examples_json', 'Không', 'JSON array chứa các câu ví dụ thực tế', '[{"stt":1,"japanese":"...","vietnamese":"...","analysis":"...","vocabulary_furigana":"...","note":"..."}]'],
    ['exercises_json', 'Không', 'JSON array chứa các bài tập luyện tập', '[{"stt":1,"type":"multiple_choice","question":"...","option_a":"...","option_b":"...","option_c":"...","hint":"..."}]'],
    ['answers_json', 'Không', 'JSON array chứa đáp án & giải thích liên kết theo stt', '[{"stt":1,"answer":"B: 作ろう","complete_sentence":"...","detailed_explanation":"...","distractor_errors":"...","self_assessment":"..."}]'],
    ['jlpt_level', 'Không', 'Cấp độ JLPT (N1, N2, N3, N4, N5)', 'N2'],
    ['tags', 'Không', 'Từ khóa tìm kiếm, cách nhau bằng dấu phẩy', 'kêu gọi, ý chí, N2'],
    ['sort_order', 'Không', 'Thứ tự sắp xếp hiển thị trong bài học', '1, 2, 3...'],
    ['active', 'Không', 'TRUE: Kích hoạt hiển thị; FALSE: Bỏ qua dòng này', 'TRUE'],
    [''],
    ['3. QUY TẮC ĐỊNH DẠNG JSON VÀ LIÊN KẾT BÀI TẬP - ĐÁP ÁN:'],
    ['- Các cột examples_json, exercises_json, answers_json phải là JSON array hợp lệ (bắt đầu bằng [ và kết thúc bằng ]).'],
    ['- exercises_json hỗ trợ tối thiểu dạng "multiple_choice" (cần option_a, option_b) và dạng "translate" (dịch câu).'],
    ['- answers_json phải có STT khớp đúng với STT của exercise trong exercises_json. Không được có đáp án mồ côi.'],
    ['- Mỗi bài tập chỉ có duy nhất một đáp án có STT tương ứng trong cùng một mục ngữ pháp.'],
    ['- Giữ nguyên ký tự tiếng Nhật (Kanji, Furigana), tiếng Việt có dấu và các ký tự đặc biệt.'],
  ];

  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
  wsGuide['!cols'] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 55 },
    { wch: 55 },
  ];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan');

  return wb;
}

/**
 * Tải file Excel mẫu về máy tính người dùng
 */
export function downloadGrammarExcelTemplate(fileName = 'Mau_nhap_ngu_phap_QuizForms.xlsx'): void {
  const wb = buildGrammarExcelTemplateWorkbook();
  XLSX.writeFile(wb, fileName);
}

// ─── PARSER ENGINE CHO EXCEL NGỮ PHÁP ─────────────────────────────

function truncateText(str: string, maxLen = 60): string {
  if (!str) return '';
  return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str;
}

/**
 * Parser an toàn cho chuỗi JSON array từ Excel cell.
 * Không dùng eval, bắt đúng lỗi, hỗ trợ ký tự Nhật-Việt và giữ nguyên dấu xuống dòng.
 */
function parseJsonArrayField<T>(
  rawVal: string,
  rowNumber: number,
  columnName: string,
  errors: GrammarRowValidationError[]
): T[] {
  const trimmed = (rawVal || '').trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push({
      rowNumber,
      column: columnName,
      invalidValue: truncateText(trimmed),
      reason: `Cú pháp JSON không hợp lệ: ${msg}`,
      fixSuggestion: `Kiểm tra lại dấu ngoặc kép ", dấu ngoặc vuông [] và dấu phẩy ngăn cách trong cột ${columnName}.`,
    });
    return [];
  }

  if (!Array.isArray(parsed)) {
    errors.push({
      rowNumber,
      column: columnName,
      invalidValue: truncateText(trimmed),
      reason: `Giá trị cột ${columnName} phải là một JSON array [...], không phải object đơn hoặc giá trị nguyên thủy.`,
      fixSuggestion: `Bao bọc danh sách các mục bằng cặp ngoặc vuông [ ... ].`,
    });
    return [];
  }

  return parsed as T[];
}

/**
 * Phân tích và validate workbook Excel nhập Ngữ pháp
 */
export function parseGrammarExcelWorkbook(wb: XLSX.WorkBook): GrammarExcelParseResult {
  // 1. Tìm sheet dữ liệu
  let sheetName = wb.SheetNames.find(
    (s) => s.trim().toLowerCase() === 'grammar_data' ||
           s.trim().toLowerCase() === 'grammar' ||
           s.trim().toLowerCase() === 'ngu_phap'
  );

  if (!sheetName) {
    sheetName = wb.SheetNames.find(
      (s) => !['huong_dan', 'instructions', 'guide', 'danh_muc'].includes(s.trim().toLowerCase())
    ) || wb.SheetNames[0];
  }

  if (!sheetName) {
    throw new Error('Không tìm thấy sheet dữ liệu trong file Excel.');
  }

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown as string[][];

  if (!rows || rows.length === 0) {
    return {
      sheetName,
      totalRows: 0,
      validRows: [],
      invalidRows: [],
      skippedRows: [],
      allRows: [],
    };
  }

  // 2. Tìm hàng tiêu đề (Headers)
  const isHeaderRow = (r: unknown[]): boolean => {
    if (!r || !Array.isArray(r)) return false;
    const normalized = r.map((c) => String(c ?? '').trim().toLowerCase().replace(/\s+/g, '_'));
    return (
      normalized.includes('grammar_pattern') ||
      normalized.includes('item_code') ||
      normalized.includes('mẫu_ngữ_pháp') ||
      normalized.includes('tên_ngữ_pháp') ||
      (normalized.includes('meaning') && (normalized.includes('connection_rule') || normalized.includes('structure')))
    );
  };

  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    if (isHeaderRow(rows[r])) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx < 0) {
    headerRowIdx = rows.length > 3 ? 3 : 0;
  }

  const dataStartIdx = headerRowIdx + 1;
  const headers = (rows[headerRowIdx] ?? []).map((h) => String(h ?? '').trim());

  // 3. Chuẩn hóa tên cột
  const colIdx: Record<string, number> = {};
  headers.forEach((h, i) => {
    const norm = h.toLowerCase().replace(/\s+/g, '_');
    colIdx[norm] = i;
    colIdx[h] = i;

    // Aliases
    if (norm === 'item_code' || norm === 'item_id' || norm === 'mã_mục' || norm === 'mã' || norm === 'tên_mục') {
      colIdx['item_code'] = i;
    }
    if (norm.includes('mẫu') || norm.includes('tên_ngữ_pháp') || norm.includes('ngu_phap') || norm === 'pattern') {
      colIdx['grammar_pattern'] = i;
    }
    if (norm === 'source' || norm.includes('nguồn') || norm.includes('tài_liệu')) {
      colIdx['source'] = i;
    }
    if (norm.includes('nghĩa') || norm === 'meaning') {
      colIdx['meaning'] = i;
    }
    if (norm.includes('cấu_trúc') || norm.includes('liên_kết') || norm.includes('quy_tắc') || norm.includes('接続') || norm === 'structure' || norm === 'connection_rule') {
      colIdx['connection_rule'] = i;
      colIdx['structure'] = i;
    }
    if (norm.includes('lưu_ý') || norm.includes('chú_ý') || norm.includes('giải_thích') || norm.includes('注意') || norm === 'caution' || norm === 'explanation') {
      colIdx['caution'] = i;
      colIdx['explanation'] = i;
    }
    if (norm.includes('phân_biệt') || norm === 'distinction') {
      colIdx['distinction'] = i;
    }
    if (norm === 'examples_json' || norm === 'examples' || norm.includes('câu_ví_dụ')) {
      colIdx['examples_json'] = i;
    }
    if (norm === 'exercises_json' || norm === 'exercises' || norm.includes('bài_tập')) {
      colIdx['exercises_json'] = i;
    }
    if (norm === 'answers_json' || norm === 'answers' || norm.includes('đáp_án')) {
      colIdx['answers_json'] = i;
    }
    if (norm.includes('cấp_độ') || norm.includes('jlpt')) {
      colIdx['jlpt_level'] = i;
    }
    if (norm.includes('từ_khóa') || norm.includes('tags')) {
      colIdx['tags'] = i;
    }
    if (norm === 'sort_order' || norm === 'stt' || norm.includes('thứ_tự')) {
      colIdx['sort_order'] = i;
    }
    if (norm.includes('kích_hoạt') || norm === 'active') {
      colIdx['active'] = i;
    }
  });

  const getColVal = (rowIdx: number, key: string): string => {
    const idx = colIdx[key];
    if (idx === undefined || idx < 0) return '';
    return String(rows[rowIdx]?.[idx] ?? '').trim();
  };

  const validRows: ParsedGrammarRowResult[] = [];
  const invalidRows: ParsedGrammarRowResult[] = [];
  const skippedRows: ParsedGrammarRowResult[] = [];
  const allRows: ParsedGrammarRowResult[] = [];

  let inferredLessonTitle = '';
  let inferredJlptLevel = '';

  for (let r = dataStartIdx; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => String(c ?? '').trim() === '')) {
      // Bỏ qua hàng hoàn toàn trống
      continue;
    }

    const rowNumber = r + 1; // 1-based index (Excel row number)
    const raw: Record<string, string> = {};
    headers.forEach((h, j) => {
      raw[h] = String(row[j] ?? '').trim();
    });

    const rowErrors: GrammarRowValidationError[] = [];

    // Kiểm tra active (nếu FALSE thì đánh dấu skipped)
    const activeRaw = getColVal(r, 'active').toUpperCase();
    const isInactive = activeRaw === 'FALSE' || activeRaw === '0' || activeRaw === 'NO';

    // Đọc các trường
    const itemCode = getColVal(r, 'item_code');
    const grammarPattern = getColVal(r, 'grammar_pattern');
    const source = getColVal(r, 'source');
    const meaning = getColVal(r, 'meaning');
    const connectionRule = getColVal(r, 'connection_rule') || getColVal(r, 'structure');
    const caution = getColVal(r, 'caution') || getColVal(r, 'explanation');
    const distinction = getColVal(r, 'distinction');
    const examplesRaw = getColVal(r, 'examples_json');
    const exercisesRaw = getColVal(r, 'exercises_json');
    const answersRaw = getColVal(r, 'answers_json');
    const jlptLevel = (getColVal(r, 'jlpt_level') || 'N2').toUpperCase();
    const tags = getColVal(r, 'tags');
    const sortOrderVal = parseInt(getColVal(r, 'sort_order'), 10);
    const sortOrder = isNaN(sortOrderVal) ? allRows.length + 1 : sortOrderVal;

    const lessonNameCol = getColVal(r, 'lesson_name') || getColVal(r, 'tên_bài_học') || getColVal(r, 'bài_học');
    if (lessonNameCol && !inferredLessonTitle) {
      inferredLessonTitle = lessonNameCol;
    }

    if (!inferredJlptLevel && jlptLevel) {
      inferredJlptLevel = jlptLevel;
    }

    // Validation các trường bắt buộc
    if (!itemCode) {
      rowErrors.push({
        rowNumber,
        column: 'item_code',
        invalidValue: '(trống)',
        reason: 'Cột item_code bắt buộc không được để trống.',
        fixSuggestion: 'Nhập mã định danh duy nhất cho mục ngữ pháp (ví dụ: Bai_24_01_YouDewaNaika).',
      });
    }

    if (!grammarPattern) {
      rowErrors.push({
        rowNumber,
        column: 'grammar_pattern',
        invalidValue: '(trống)',
        reason: 'Cột grammar_pattern bắt buộc không được để trống.',
        fixSuggestion: 'Nhập mẫu ngữ pháp tiếng Nhật (ví dụ: ～（よ）うではないか).',
      });
    }

    if (!meaning) {
      rowErrors.push({
        rowNumber,
        column: 'meaning',
        invalidValue: '(trống)',
        reason: 'Cột meaning bắt buộc không được để trống.',
        fixSuggestion: 'Nhập ý nghĩa tiếng Việt của mẫu ngữ pháp.',
      });
    }

    if (!connectionRule) {
      rowErrors.push({
        rowNumber,
        column: 'connection_rule',
        invalidValue: '(trống)',
        reason: 'Cột connection_rule (hoặc structure) bắt buộc không được để trống.',
        fixSuggestion: 'Nhập cấu trúc liên kết ngữ pháp (ví dụ: V-よう + ではないか).',
      });
    }

    // ── Parse & Validate examples_json ──
    const parsedExamplesRaw = parseJsonArrayField<Record<string, unknown>>(
      examplesRaw,
      rowNumber,
      'examples_json',
      rowErrors
    );

    const examples: GrammarItemExample[] = [];
    parsedExamplesRaw.forEach((exObj, exIdx) => {
      if (typeof exObj !== 'object' || exObj === null) {
        rowErrors.push({
          rowNumber,
          column: 'examples_json',
          invalidValue: truncateText(JSON.stringify(exObj)),
          reason: `Phần tử thứ ${exIdx + 1} trong examples_json không phải là một đối tượng JSON hợp lệ.`,
          fixSuggestion: 'Mỗi ví dụ phải là một đối tượng dạng {"stt": 1, "japanese": "...", "vietnamese": "..."}.',
        });
        return;
      }

      const stt = Number(exObj.stt ?? exIdx + 1);
      const japanese = String(exObj.japanese ?? exObj.example_jp ?? '').trim();
      const vietnamese = String(exObj.vietnamese ?? exObj.example_vi ?? '').trim();
      const analysis = String(exObj.analysis ?? exObj.example_analysis ?? '').trim();
      const vocabularyFurigana = String(exObj.vocabulary_furigana ?? exObj.vocabulary ?? '').trim();
      const note = String(exObj.note ?? exObj.notes ?? '').trim();

      if (!japanese) {
        rowErrors.push({
          rowNumber,
          column: 'examples_json',
          invalidValue: `Ví dụ #${stt}`,
          reason: `Ví dụ thứ ${exIdx + 1} thiếu câu tiếng Nhật (trường "japanese").`,
          fixSuggestion: 'Bổ sung trường "japanese" cho ví dụ.',
        });
      }

      examples.push({
        stt,
        japanese,
        vietnamese,
        analysis: analysis || undefined,
        vocabulary_furigana: vocabularyFurigana || undefined,
        vocabulary: vocabularyFurigana || undefined,
        note: note || undefined,
      });
    });

    // ── Parse & Validate exercises_json ──
    const parsedExercisesRaw = parseJsonArrayField<Record<string, unknown>>(
      exercisesRaw,
      rowNumber,
      'exercises_json',
      rowErrors
    );

    const exercises: GrammarItemExercise[] = [];
    const exerciseSttSet = new Set<number>();

    parsedExercisesRaw.forEach((exerObj, exerIdx) => {
      if (typeof exerObj !== 'object' || exerObj === null) {
        rowErrors.push({
          rowNumber,
          column: 'exercises_json',
          invalidValue: truncateText(JSON.stringify(exerObj)),
          reason: `Bài tập thứ ${exerIdx + 1} trong exercises_json không phải đối tượng JSON hợp lệ.`,
          fixSuggestion: 'Mỗi bài tập phải có stt, type, question...',
        });
        return;
      }

      const stt = Number(exerObj.stt ?? exerIdx + 1);
      const type = String(exerObj.type ?? 'multiple_choice').trim().toLowerCase();
      const question = String(exerObj.question ?? '').trim();
      const optA = String(exerObj.option_a ?? exerObj.optionA ?? '').trim();
      const optB = String(exerObj.option_b ?? exerObj.optionB ?? '').trim();
      const optC = String(exerObj.option_c ?? exerObj.optionC ?? '').trim();
      const optD = String(exerObj.option_d ?? exerObj.optionD ?? '').trim();
      const hint = String(exerObj.hint ?? '').trim();

      if (!question) {
        rowErrors.push({
          rowNumber,
          column: 'exercises_json',
          invalidValue: `Bài tập #${stt}`,
          reason: `Bài tập #${stt} thiếu câu hỏi (trường "question").`,
          fixSuggestion: 'Bổ sung đề bài cho bài tập.',
        });
      }

      if (type === 'multiple_choice' && !optA && !optB) {
        rowErrors.push({
          rowNumber,
          column: 'exercises_json',
          invalidValue: `Bài tập trắc nghiệm #${stt}`,
          reason: `Bài tập trắc nghiệm #${stt} thiếu các lựa chọn (option_a, option_b).`,
          fixSuggestion: 'Bổ sung các phương án lựa chọn cho bài tập trắc nghiệm.',
        });
      }

      exerciseSttSet.add(stt);

      exercises.push({
        stt,
        type,
        question,
        option_a: optA || undefined,
        option_b: optB || undefined,
        option_c: optC || undefined,
        option_d: optD || undefined,
        optionA: optA || undefined,
        optionB: optB || undefined,
        optionC: optC || undefined,
        optionD: optD || undefined,
        hint: hint || undefined,
      });
    });

    // ── Parse & Validate answers_json ──
    const parsedAnswersRaw = parseJsonArrayField<Record<string, unknown>>(
      answersRaw,
      rowNumber,
      'answers_json',
      rowErrors
    );

    const answers: GrammarItemAnswer[] = [];
    const answerSttSet = new Set<number>();

    parsedAnswersRaw.forEach((ansObj, ansIdx) => {
      if (typeof ansObj !== 'object' || ansObj === null) {
        rowErrors.push({
          rowNumber,
          column: 'answers_json',
          invalidValue: truncateText(JSON.stringify(ansObj)),
          reason: `Đáp án thứ ${ansIdx + 1} trong answers_json không phải đối tượng JSON hợp lệ.`,
          fixSuggestion: 'Mỗi đáp án phải có stt, answer, complete_sentence...',
        });
        return;
      }

      const stt = Number(ansObj.stt ?? ansIdx + 1);
      const answer = String(ansObj.answer ?? '').trim();
      const completeSentence = String(ansObj.complete_sentence ?? ansObj.fullSentence ?? '').trim();
      const detailedExplanation = String(ansObj.detailed_explanation ?? ansObj.explanation ?? '').trim();
      const distractorErrors = String(ansObj.distractor_errors ?? ansObj.commonErrors ?? '').trim();
      const selfAssessment = String(ansObj.self_assessment ?? ansObj.selfAssess ?? '').trim();

      // Kiểm tra trùng lặp STT trong answers_json
      if (answerSttSet.has(stt)) {
        rowErrors.push({
          rowNumber,
          column: 'answers_json',
          invalidValue: `STT #${stt}`,
          reason: `Trùng lặp STT #${stt} trong danh sách đáp án answers_json.`,
          fixSuggestion: 'Mỗi bài tập chỉ có duy nhất một đáp án với STT tương ứng.',
        });
      }
      answerSttSet.add(stt);

      // Kiểm tra đáp án mồ côi (chỉ kiểm tra nếu có bài tập)
      if (exerciseSttSet.size > 0 && !exerciseSttSet.has(stt)) {
        rowErrors.push({
          rowNumber,
          column: 'answers_json',
          invalidValue: `STT #${stt}`,
          reason: `Đáp án có STT #${stt} không tương ứng với bài tập nào trong exercises_json (đáp án mồ côi).`,
          fixSuggestion: `Đảm bảo STT của đáp án khớp với STT của bài tập (${Array.from(exerciseSttSet).join(', ')}).`,
        });
      }

      answers.push({
        stt,
        answer,
        complete_sentence: completeSentence || undefined,
        fullSentence: completeSentence || undefined,
        detailed_explanation: detailedExplanation || undefined,
        explanation: detailedExplanation || undefined,
        distractor_errors: distractorErrors || undefined,
        commonErrors: distractorErrors || undefined,
        self_assessment: selfAssessment || undefined,
        selfAssess: selfAssessment || undefined,
      });
    });

    const parsedRow: ParsedGrammarRowResult = {
      rowNumber,
      itemCode,
      grammarPattern,
      source,
      meaning,
      connectionRule,
      caution,
      distinction,
      examples,
      exercises,
      answers,
      jlptLevel,
      tags,
      sortOrder,
      active: !isInactive,
      errors: rowErrors,
      raw,
    };

    allRows.push(parsedRow);

    if (isInactive) {
      skippedRows.push(parsedRow);
    } else if (rowErrors.length > 0) {
      invalidRows.push(parsedRow);
    } else {
      validRows.push(parsedRow);
    }
  }

  return {
    sheetName,
    totalRows: allRows.length,
    validRows,
    invalidRows,
    skippedRows,
    allRows,
    inferredLessonTitle,
    inferredJlptLevel,
  };
}

/**
 * Chuyển đổi ParsedGrammarRowResult thành GrammarItem hoàn chỉnh
 */
export function rowResultToGrammarItem(
  row: ParsedGrammarRowResult,
  lessonId: string,
  generateIdFn: (prefix: string) => string
): GrammarItem {
  return {
    id: generateIdFn('gitem'),
    lessonId,
    itemCode: row.itemCode,
    itemId: row.itemCode,
    grammarPattern: row.grammarPattern,
    source: row.source || undefined,
    meaning: row.meaning,
    connectionRule: row.connectionRule,
    caution: row.caution || undefined,
    distinction: row.distinction || undefined,
    examples: row.examples,
    exercises: row.exercises,
    answers: row.answers,
    jlptLevel: row.jlptLevel || undefined,
    tags: row.tags || undefined,
    sortOrder: row.sortOrder,
    active: row.active,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    // Backward compatibility getters
    structure: row.connectionRule,
    explanation: row.caution,
    exampleJp: row.examples[0]?.japanese || '',
    exampleVi: row.examples[0]?.vietnamese || '',
    exampleAnalysis: row.examples[0]?.analysis || '',
    notes: row.examples[0]?.note || '',
  };
}
