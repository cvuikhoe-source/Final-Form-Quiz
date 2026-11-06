import * as XLSX from 'xlsx';
import type { ExamQuestion, ExamQuestionType } from '@/types';

export interface GrammarExamLessonMetadata {
  title: string;
  description: string;
  jlptLevel: string;
}

export interface ParsedExamQuestionResult {
  questionNo: number;
  questionType: ExamQuestionType;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  timeSeconds: number;
  answerExplanation: string;
  vocabularyHanViet?: string;
  sortOrder: number;
  active: boolean;
  rawRowIndex: number;
}

export interface GrammarExamParseError {
  row: number;
  column?: string;
  message: string;
  critical?: boolean;
}

export interface GrammarExamParseResult {
  success: boolean;
  lessonMetadata: GrammarExamLessonMetadata;
  validQuestions: ParsedExamQuestionResult[];
  errors: GrammarExamParseError[];
  warnings: string[];
  summary: {
    totalRows: number;
    validCount: number;
    errorCount: number;
    multipleChoiceCount: number;
    sentenceOrderingCount: number;
  };
}

// Chuẩn hóa tên cột
function normalizeColKey(key: string): string {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, '_');
}

// Chuẩn hóa đáp án đúng
function normalizeCorrectAnswer(val: unknown): 'A' | 'B' | 'C' | 'D' | null {
  const s = String(val ?? '').trim().toUpperCase();
  if (s === 'A' || s === '1' || s === '①') return 'A';
  if (s === 'B' || s === '2' || s === '②') return 'B';
  if (s === 'C' || s === '3' || s === '③') return 'C';
  if (s === 'D' || s === '4' || s === '④') return 'D';
  return null;
}

// Chuẩn hóa loại câu hỏi
function normalizeQuestionType(val: unknown, questionText: string): ExamQuestionType {
  const s = String(val ?? '').trim().toLowerCase();
  if (s.includes('order') || s.includes('sắp xếp') || s.includes('sap xep') || s.includes('★') || s.includes('sao')) {
    return 'sentence_ordering';
  }
  if (questionText.includes('★') || questionText.includes('＿＿')) {
    return 'sentence_ordering';
  }
  return 'multiple_choice';
}

export function parseGrammarExamWorkbookBuffer(buffer: ArrayBuffer | Uint8Array): GrammarExamParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // 1. Tìm sheet Exam_Questions
  const sheetNames = wb.SheetNames;
  let targetSheetName = sheetNames.find(
    (name) => {
      const lower = name.toLowerCase().trim();
      return lower === 'exam_questions' || lower === 'examquestions' || lower === 'cau_hoi' || lower.includes('cau hoi');
    }
  );

  if (!targetSheetName) {
    // Nếu không thấy sheet tên Exam_Questions, lấy sheet đầu tiên
    targetSheetName = sheetNames[0];
  }

  const ws = wb.Sheets[targetSheetName];
  if (!ws) {
    return {
      success: false,
      lessonMetadata: { title: 'Luyện thi Ngữ pháp', description: '', jlptLevel: 'N2' },
      validQuestions: [],
      errors: [{ row: 0, message: 'File Excel không có nội dung hoặc không tìm thấy sheet hợp lệ.' }],
      warnings: [],
      summary: { totalRows: 0, validCount: 0, errorCount: 1, multipleChoiceCount: 0, sentenceOrderingCount: 0 },
    };
  }

  // Chuyển sheet sang dạng mảng mảng 2 chiều để quét header
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rawData.length < 2) {
    return {
      success: false,
      lessonMetadata: { title: 'Luyện thi Ngữ pháp', description: '', jlptLevel: 'N2' },
      validQuestions: [],
      errors: [{ row: 1, message: 'Sheet dữ liệu rỗng hoặc không có dữ liệu hàng.' }],
      warnings: [],
      summary: { totalRows: 0, validCount: 0, errorCount: 1, multipleChoiceCount: 0, sentenceOrderingCount: 0 },
    };
  }

  // 2. Tìm hàng Header
  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(rawData.length, 5); r++) {
    const row = rawData[r] as unknown[];
    const normalized = row.map((cell) => normalizeColKey(String(cell)));
    if (normalized.some((k) => k.includes('question_text') || k.includes('question_no') || k.includes('correct_answer'))) {
      headerRowIndex = r;
      break;
    }
  }

  const headers = (rawData[headerRowIndex] as unknown[]).map((c) => normalizeColKey(String(c)));
  const colMap: Record<string, number> = {};
  headers.forEach((h, idx) => {
    if (h) colMap[h] = idx;
  });

  const getCol = (row: unknown[], ...keys: string[]): string => {
    for (const k of keys) {
      const idx = colMap[k];
      if (idx !== undefined && row[idx] !== undefined) {
        return String(row[idx]).trim();
      }
    }
    return '';
  };

  const errors: GrammarExamParseError[] = [];
  const warnings: string[] = [];
  const validQuestions: ParsedExamQuestionResult[] = [];

  let detectedTitle = '';
  let detectedDesc = '';
  let detectedJlpt = 'N2';

  const seenQuestionNos = new Set<number>();
  const seenQuestionTexts = new Set<string>();

  const dataRows = rawData.slice(headerRowIndex + 1);
  let multipleChoiceCount = 0;
  let sentenceOrderingCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] as unknown[];
    const rowNumber = headerRowIndex + 2 + i; // Số dòng Excel 1-based

    // Bỏ qua dòng trống hoàn toàn
    if (!row || row.every((c) => String(c ?? '').trim() === '')) {
      continue;
    }

    const title = getCol(row, 'lesson_title', 'title', 'ten_bai_hoc');
    const desc = getCol(row, 'lesson_description', 'description', 'mo_ta');
    const jlpt = getCol(row, 'jlpt_level', 'jlpt', 'trinh_do');

    if (!detectedTitle && title) detectedTitle = title;
    if (!detectedDesc && desc) detectedDesc = desc;
    if (jlpt) detectedJlpt = jlpt.toUpperCase();

    const qNoRaw = getCol(row, 'question_no', 'question_number', 'stt', 'so_cau');
    const qTypeRaw = getCol(row, 'question_type', 'type', 'loai_cau_hoi');
    const qText = getCol(row, 'question_text', 'question', 'de_bai', 'cau_hoi');
    const optA = getCol(row, 'option_a', 'opt_a', 'phuong_an_a', 'dap_an_a');
    const optB = getCol(row, 'option_b', 'opt_b', 'phuong_an_b', 'dap_an_b');
    const optC = getCol(row, 'option_c', 'opt_c', 'phuong_an_c', 'dap_an_c');
    const optD = getCol(row, 'option_d', 'opt_d', 'phuong_an_d', 'dap_an_d');
    const corrAnsRaw = getCol(row, 'correct_answer', 'answer', 'dap_an_dung', 'dap_an');
    const timeSecRaw = getCol(row, 'time_seconds', 'time', 'thoi_gian');
    const explanation = getCol(row, 'answer_explanation', 'explanation', 'giai_thich');
    const vocabHanViet = getCol(row, 'vocabulary_han_viet', 'vocabulary', 'han_viet', 'tu_vung');
    const sortOrderRaw = getCol(row, 'sort_order', 'thu_tu');
    const activeRaw = getCol(row, 'active', 'kich_hoat');

    // Kiểm tra câu hỏi bắt buộc
    if (!qText) {
      errors.push({ row: rowNumber, column: 'question_text', message: 'Nội dung câu hỏi (question_text) không được để trống.' });
      continue;
    }

    // Kiểm tra các phương án A, B, C, D
    if (!optA || !optB || !optC || !optD) {
      errors.push({ row: rowNumber, column: 'options', message: 'Cần có đủ 4 phương án A, B, C, D.' });
      continue;
    }

    // Kiểm tra đáp án đúng
    const corrAns = normalizeCorrectAnswer(corrAnsRaw);
    if (!corrAns) {
      errors.push({
        row: rowNumber,
        column: 'correct_answer',
        message: `Đáp án đúng "${corrAnsRaw}" không hợp lệ. Vui lòng chọn A, B, C hoặc D (hoặc 1, 2, 3, 4).`,
      });
      continue;
    }

    // Phân tích loại câu hỏi
    const questionType = normalizeQuestionType(qTypeRaw, qText);
    if (questionType === 'multiple_choice') multipleChoiceCount++;
    else sentenceOrderingCount++;

    // Xử lý question_no
    let questionNo = parseInt(qNoRaw, 10);
    if (isNaN(questionNo) || questionNo <= 0) {
      questionNo = validQuestions.length + 31; // Tự động đánh số từ 31 trở đi
    }

    // Chống trùng số câu trong cùng một file
    if (seenQuestionNos.has(questionNo)) {
      warnings.push(`Dòng ${rowNumber}: Số câu (question_no = ${questionNo}) bị trùng trong file, đã tự tăng số thứ tự.`);
      questionNo = Math.max(...Array.from(seenQuestionNos)) + 1;
    }
    seenQuestionNos.add(questionNo);

    // Chống trùng nội dung câu hỏi chuẩn hóa
    const normText = qText.trim().replace(/\s+/g, ' ').toLowerCase();
    if (seenQuestionTexts.has(normText)) {
      warnings.push(`Dòng ${rowNumber}: Nội dung câu hỏi trùng lặp với một câu trước đó.`);
    }
    seenQuestionTexts.add(normText);

    // Thời gian làm bài gợi ý
    let timeSeconds = parseInt(timeSecRaw, 10);
    if (isNaN(timeSeconds) || timeSeconds <= 0) {
      timeSeconds = questionType === 'sentence_ordering' ? 90 : 60;
    }

    // Thứ tự sắp xếp
    let sortOrder = parseInt(sortOrderRaw, 10);
    if (isNaN(sortOrder)) {
      sortOrder = questionNo;
    }

    // Kích hoạt
    const active = activeRaw.toLowerCase() !== 'false' && activeRaw !== '0';

    validQuestions.push({
      questionNo,
      questionType,
      questionText: qText,
      optionA: optA,
      optionB: optB,
      optionC: optC,
      optionD: optD,
      correctAnswer: corrAns,
      timeSeconds,
      answerExplanation: explanation,
      vocabularyHanViet: vocabHanViet || undefined,
      sortOrder,
      active,
      rawRowIndex: rowNumber,
    });
  }

  // Tên bài mặc định nếu không phát hiện
  if (!detectedTitle) {
    detectedTitle = `Luyện thi Ngữ pháp JLPT ${detectedJlpt} (${validQuestions.length} câu)`;
  }

  return {
    success: errors.length === 0 && validQuestions.length > 0,
    lessonMetadata: {
      title: detectedTitle,
      description: detectedDesc || `Bài luyện thi ngữ pháp gồm ${validQuestions.length} câu hỏi.`,
      jlptLevel: detectedJlpt,
    },
    validQuestions,
    errors,
    warnings,
    summary: {
      totalRows: dataRows.length,
      validCount: validQuestions.length,
      errorCount: errors.length,
      multipleChoiceCount,
      sentenceOrderingCount,
    },
  };
}

// Chuyển kết quả parse sang ExamQuestion hoàn chỉnh gắn với lessonId
export function parsedQuestionToExamQuestion(
  parsed: ParsedExamQuestionResult,
  lessonId: string,
  idGenerator: (prefix: string) => string = (p) => `${p}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
): ExamQuestion {
  return {
    id: idGenerator('eq'),
    lessonId,
    questionNo: parsed.questionNo,
    questionType: parsed.questionType,
    questionText: parsed.questionText,
    optionA: parsed.optionA,
    optionB: parsed.optionB,
    optionC: parsed.optionC,
    optionD: parsed.optionD,
    correctAnswer: parsed.correctAnswer,
    timeSeconds: parsed.timeSeconds,
    answerExplanation: parsed.answerExplanation,
    vocabularyHanViet: parsed.vocabularyHanViet,
    sortOrder: parsed.sortOrder,
    active: parsed.active,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Tải file mẫu trực tiếp về máy client
export function downloadGrammarExamTemplate(): void {
  // Tạo file mẫu với 20 câu mẫu (câu 31 - 50)
  const templateQuestions = [
    {
      lesson_title: 'Luyện thi Ngữ pháp JLPT N2 - Đề số 01 (Câu 31 - 50)',
      lesson_description: 'Bài luyện thi chuyên sâu Ngữ pháp JLPT N2 gồm 20 câu hỏi chọn đáp án và sắp xếp câu sao (★).',
      jlpt_level: 'N2',
      question_no: 31,
      question_type: 'multiple_choice',
      question_text: '彼の実力からすれば、今回の試験に合格することなど（　　　）。',
      option_a: '造作もないことだ',
      option_b: '造作もないことではない',
      option_c: '難しくないわけがない',
      option_d: '不可能にすぎない',
      correct_answer: 'A',
      time_seconds: 60,
      answer_explanation: '【Cấu trúc】〜からすれば（Xét từ... thì...）+ 造作もない（Dễ dàng, không tốn công sức）。\n【Lý do đúng】A là đáp án chính xác: "Xét từ thực lực của anh ấy thì việc đỗ kỳ thi lần này là chuyện quá dễ dàng".\n【Ghi nhớ】造作もない = わけなくできる (dễ như trở bàn tay).',
      vocabulary_han_viet: '実力 (THỰC LỰC - じつりょく): Thực lực; 試験 (THÍ NGHIỆM - しけん): Kỳ thi; 合格 (HỢP CÁCH - ごうかく): Đỗ đạt.',
      sort_order: 1,
      active: 'TRUE',
    },
    {
      lesson_title: 'Luyện thi Ngữ pháp JLPT N2 - Đề số 01 (Câu 31 - 50)',
      lesson_description: 'Bài luyện thi chuyên sâu Ngữ pháp JLPT N2 gồm 20 câu hỏi chọn đáp án và sắp xếp câu sao (★).',
      jlpt_level: 'N2',
      question_no: 32,
      question_type: 'multiple_choice',
      question_text: 'どんなに頼まれた（　　　）、不正なことには協力できません。',
      option_a: 'ところで',
      option_b: 'ものの',
      option_c: 'とおりで',
      option_d: 'につけても',
      correct_answer: 'A',
      time_seconds: 60,
      answer_explanation: '【Cấu trúc】どんなに〜たところで（Dù có... đến mức nào đi nữa thì kết quả vẫn vô ích/không đổi）。',
      vocabulary_han_viet: '頼む (LẠI - たのむ): Nhờ vả; 不正 (BẤT CHÍNH - ふせい): Bất chính; 協力 (HIỆP LỰC - きょうりょく): Hợp tác.',
      sort_order: 2,
      active: 'TRUE',
    },
    {
      lesson_title: 'Luyện thi Ngữ pháp JLPT N2 - Đề số 01 (Câu 31 - 50)',
      lesson_description: 'Bài luyện thi chuyên sâu Ngữ pháp JLPT N2 gồm 20 câu hỏi chọn đáp án và sắp xếp câu sao (★).',
      jlpt_level: 'N2',
      question_no: 45,
      question_type: 'sentence_ordering',
      question_text: '健康のためには、無理な ＿＿ ＿＿ ★ ＿＿ を心がけることが大切だ。',
      option_a: 'バランスの取れた',
      option_b: 'ダイエットをする',
      option_c: '食事',
      option_d: 'よりむしろ',
      correct_answer: 'A',
      time_seconds: 90,
      answer_explanation: '【Thứ tự đúng】2 - 4 - 1 - 3 (ダイエットをする → よりむしろ → バランスの取れた → 食事)。\n【Vị trí sao ★】Phương án A (バランスの取れた). Cấu trúc: AよりむしろB (Thà rằng B hơn là A).',
      vocabulary_han_viet: '健康 (KIỆN KHANG - けんこう): Sức khỏe; 無理 (VÔ LÝ - むり): Quá sức; 食事 (THỰC SỰ - しょくじ): Bữa ăn.',
      sort_order: 15,
      active: 'TRUE',
    },
  ];

  const huongDan = [
    { 'Tên cột': 'lesson_title', 'Bắt buộc': 'CÓ', 'Ghi chú': 'Tất cả các dòng phải cùng tên bài học để gộp vào 1 Lesson.' },
    { 'Tên cột': 'question_no', 'Bắt buộc': 'CÓ', 'Ghi chú': 'Số thứ tự câu hỏi (ví dụ: 31, 32, ..., 50).' },
    { 'Tên cột': 'question_type', 'Bắt buộc': 'CÓ', 'Ghi chú': 'multiple_choice (chọn A/B/C/D) hoặc sentence_ordering (câu sắp xếp có sao ★).' },
    { 'Tên cột': 'question_text', 'Bắt buộc': 'CÓ', 'Ghi chú': 'Đề bài tiếng Nhật, giữ nguyên khoảng trống ＿＿ và ★.' },
    { 'Tên cột': 'option_a, b, c, d', 'Bắt buộc': 'CÓ', 'Ghi chú': 'Bốn phương án lựa chọn.' },
    { 'Tên cột': 'correct_answer', 'Bắt buộc': 'CÓ', 'Ghi chú': 'A, B, C hoặc D (hoặc 1, 2, 3, 4).' },
    { 'Tên cột': 'answer_explanation', 'Bắt buộc': 'CÓ', 'Ghi chú': 'Phân tích chi tiết tại sao đúng/sai, cấu trúc, ghi nhớ.' },
    { 'Tên cột': 'vocabulary_han_viet', 'Bắt buộc': 'KHÔNG', 'Ghi chú': 'Kanji, âm Hán Việt, cách đọc và nghĩa.' },
  ];

  const wb = XLSX.utils.book_new();
  const wsQ = XLSX.utils.json_to_sheet(templateQuestions);
  wsQ['!cols'] = [
    { wch: 35 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 18 },
    { wch: 50 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 },
    { wch: 15 }, { wch: 12 }, { wch: 60 }, { wch: 50 }, { wch: 10 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsQ, 'Exam_Questions');

  const wsH = XLSX.utils.json_to_sheet(huongDan);
  wsH['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsH, 'Huong_Dan_Input');

  XLSX.writeFile(wb, 'mau_input_luyen_thi_ngu_phap_31_50.xlsx');
}

