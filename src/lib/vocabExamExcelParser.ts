import * as XLSX from 'xlsx';
import type { ExamQuestion, VocabExamOptionDetails } from '@/types';

export interface VocabExamLessonMetadata {
  title: string;
  description: string;
  jlptLevel: string;
}

export interface ParsedVocabExamQuestionResult {
  questionNo: number;
  questionType: 'multiple_choice';
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  timeSeconds: number;
  optionDetails: VocabExamOptionDetails;
  sortOrder: number;
  active: boolean;
  rawRowIndex: number;
}

export interface VocabExamParseError {
  row: number;
  column?: string;
  message: string;
  critical?: boolean;
}

export interface VocabExamParseResult {
  success: boolean;
  lessonMetadata: VocabExamLessonMetadata;
  validQuestions: ParsedVocabExamQuestionResult[];
  errors: VocabExamParseError[];
  warnings: string[];
  summary: {
    totalRows: number;
    validCount: number;
    errorCount: number;
  };
}

// Chuẩn hóa tên cột
function normalizeColKey(key: string): string {
  return String(key || '')
    .trim()
    .toLowerCase()
    .normalize('NFC')
    .replace(/[\s\-_]+/g, '_');
}

// Chuẩn hóa đáp án đúng
function normalizeCorrectAnswer(val: unknown): 'A' | 'B' | 'C' | 'D' | null {
  const s = String(val ?? '').trim().toUpperCase();
  if (s === 'A' || s === '1' || s === '①' || s.startsWith('A')) return 'A';
  if (s === 'B' || s === '2' || s === '②' || s.startsWith('B')) return 'B';
  if (s === 'C' || s === '3' || s === '③' || s.startsWith('C')) return 'C';
  if (s === 'D' || s === '4' || s === '④' || s.startsWith('D')) return 'D';
  return null;
}

// Tách dòng có nhãn A. B. C. D. (Cột H và I)
export function parseLabeledLines(text: string): Record<'A' | 'B' | 'C' | 'D', string> {
  const result: Record<'A' | 'B' | 'C' | 'D', string> = { A: '', B: '', C: '', D: '' };
  if (!text || !text.trim()) return result;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let currentKey: 'A' | 'B' | 'C' | 'D' | null = null;

  for (const line of lines) {
    const match = line.match(/^([A-Da-d])[.:)\s]\s*(.*)$/);
    if (match) {
      currentKey = match[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
      result[currentKey] = line;
    } else if (currentKey) {
      result[currentKey] += ' ' + line;
    }
  }
  return result;
}

// Tách các nhóm ví dụ tiếng Nhật và dịch tiếng Việt (Cột J)
export function parseExampleGroups(text: string): Record<'A' | 'B' | 'C' | 'D', { example_jp: string; example_vi: string }> {
  const result: Record<'A' | 'B' | 'C' | 'D', { example_jp: string; example_vi: string }> = {
    A: { example_jp: '', example_vi: '' },
    B: { example_jp: '', example_vi: '' },
    C: { example_jp: '', example_vi: '' },
    D: { example_jp: '', example_vi: '' },
  };
  if (!text || !text.trim()) return result;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let currentKey: 'A' | 'B' | 'C' | 'D' | null = null;
  let isTranslation = false;

  for (const line of lines) {
    const labelMatch = line.match(/^([A-Da-d])[.:)\s]\s*(.*)$/);
    if (labelMatch) {
      currentKey = labelMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
      result[currentKey].example_jp = labelMatch[2] ? labelMatch[2].trim() : '';
      isTranslation = false;
    } else if (line.startsWith('→') || line.startsWith('->') || line.startsWith('=>')) {
      if (currentKey) {
        result[currentKey].example_vi = line.replace(/^(→|->|=>)\s*/, '').trim();
        isTranslation = true;
      }
    } else if (currentKey) {
      if (isTranslation) {
        result[currentKey].example_vi += (result[currentKey].example_vi ? ' ' : '') + line;
      } else {
        result[currentKey].example_jp += (result[currentKey].example_jp ? ' ' : '') + line;
      }
    }
  }
  return result;
}

export function parseVocabExamWorkbookBuffer(buffer: ArrayBuffer | Uint8Array): VocabExamParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // 1. Tìm sheet Câu hỏi
  const sheetNames = wb.SheetNames;
  let targetSheetName = sheetNames.find((name) => {
    const lower = name.toLowerCase().trim().normalize('NFC');
    return lower === 'câu hỏi' || lower === 'cau hoi' || lower === 'cau_hoi' || lower.includes('cau hoi') || lower.includes('câu hỏi');
  });

  if (!targetSheetName) {
    // Nếu không thấy sheet tên Câu hỏi, lấy sheet đầu tiên
    targetSheetName = sheetNames[0];
  }

  const ws = wb.Sheets[targetSheetName];
  if (!ws) {
    return {
      success: false,
      lessonMetadata: { title: 'Luyện thi Từ vựng', description: '', jlptLevel: 'N2' },
      validQuestions: [],
      errors: [{ row: 0, message: 'File Excel không có nội dung hoặc không tìm thấy sheet hợp lệ.' }],
      warnings: [],
      summary: { totalRows: 0, validCount: 0, errorCount: 1 },
    };
  }

  // Chuyển sheet sang dạng mảng 2 chiều để quét header
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rawData.length < 2) {
    return {
      success: false,
      lessonMetadata: { title: 'Luyện thi Từ vựng', description: '', jlptLevel: 'N2' },
      validQuestions: [],
      errors: [{ row: 1, message: 'Sheet dữ liệu rỗng hoặc không có dữ liệu hàng.' }],
      warnings: [],
      summary: { totalRows: 0, validCount: 0, errorCount: 1 },
    };
  }

  // 2. Tìm hàng Header
  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(rawData.length, 5); r++) {
    const row = rawData[r] as unknown[];
    const normalized = row.map((cell) => normalizeColKey(String(cell)));
    if (normalized.some((k) => k.includes('câu_hỏi') || k.includes('cau_hoi') || k.includes('đáp_án') || k.includes('dap_an'))) {
      headerRowIndex = r;
      break;
    }
  }

  const headers = (rawData[headerRowIndex] as unknown[]).map((c) => normalizeColKey(String(c)));
  const colMap: Record<string, number> = {};
  headers.forEach((h, idx) => {
    if (h) colMap[h] = idx;
  });

  // Helper tìm index cột theo nhiều từ khóa
  const findColIndex = (...keywords: string[]): number => {
    for (const kw of keywords) {
      const normalizedKw = normalizeColKey(kw);
      for (const [colName, idx] of Object.entries(colMap)) {
        if (colName === normalizedKw || colName.includes(normalizedKw)) {
          return idx;
        }
      }
    }
    return -1;
  };

  const colQuestion = findColIndex('câu_hỏi', 'cau_hoi', 'question', 'noi_dung_cau_hoi');
  const colA = findColIndex('đáp_án_a', 'dap_an_a', 'option_a', 'tam_giac');
  const colB = findColIndex('đáp_án_b', 'dap_an_b', 'option_b', 'thoi');
  const colC = findColIndex('đáp_án_c', 'dap_an_c', 'option_c', 'tron');
  const colD = findColIndex('đáp_án_d', 'dap_an_d', 'option_d', 'vuong');
  const colCorrect = findColIndex('đáp_án_đúng', 'dap_an_dung', 'correct_answer', 'dap_an_chinh_xac');
  const colTime = findColIndex('thời_gian', 'thoi_gian', 'time_seconds', 'thoi_gian_giay');
  const colHanViet = findColIndex('giải_thích_từ_hán_việt', 'giai_thich_tu_han_viet', 'hán_việt', 'han_viet');
  const colMeaning = findColIndex('nghĩã_của', 'nghia_cua', 'nghĩa', 'nghia', 'meaning');
  const colExample = findColIndex('ví_dụ_minh_họa', 'vi_du_minh_hoa', 'ví_dụ', 'vi_du', 'example');

  const getCell = (row: unknown[], idx: number): string => {
    if (idx >= 0 && row[idx] !== undefined && row[idx] !== null) {
      return String(row[idx]).trim();
    }
    return '';
  };

  const errors: VocabExamParseError[] = [];
  const warnings: string[] = [];
  const validQuestions: ParsedVocabExamQuestionResult[] = [];

  let autoQuestionNo = 1;

  for (let r = headerRowIndex + 1; r < rawData.length; r++) {
    const row = rawData[r] as unknown[];
    // Bỏ qua dòng trống hoàn toàn
    if (!row || row.every((c) => String(c ?? '').trim() === '')) {
      continue;
    }

    const rowNum = r + 1; // 1-based index cho người dùng

    // 1. Câu hỏi (Col A)
    const rawQuestionText = colQuestion >= 0 ? getCell(row, colQuestion) : getCell(row, 0);
    if (!rawQuestionText) {
      errors.push({ row: rowNum, column: 'Câu hỏi', message: 'Nội dung câu hỏi không được để trống.' });
      continue;
    }

    // Tách questionNo nếu có số câu ở đầu, ví dụ: [1], [2], 1., 1)
    let extractedNo = autoQuestionNo;
    const noMatch = rawQuestionText.match(/^\[?(\d+)\]?[.:\s]/);
    if (noMatch) {
      extractedNo = parseInt(noMatch[1], 10);
    }

    // 2. Lựa chọn A, B, C, D (Col B, C, D, E)
    const optA = colA >= 0 ? getCell(row, colA) : getCell(row, 1);
    const optB = colB >= 0 ? getCell(row, colB) : getCell(row, 2);
    const optC = colC >= 0 ? getCell(row, colC) : getCell(row, 3);
    const optD = colD >= 0 ? getCell(row, colD) : getCell(row, 4);

    if (!optA) errors.push({ row: rowNum, column: 'Đáp án A', message: 'Đáp án A không được để trống.' });
    if (!optB) errors.push({ row: rowNum, column: 'Đáp án B', message: 'Đáp án B không được để trống.' });
    if (!optC) errors.push({ row: rowNum, column: 'Đáp án C', message: 'Đáp án C không được để trống.' });
    if (!optD) errors.push({ row: rowNum, column: 'Đáp án D', message: 'Đáp án D không được để trống.' });

    if (!optA || !optB || !optC || !optD) {
      continue;
    }

    // 3. Đáp án đúng (Col F)
    const rawCorrect = colCorrect >= 0 ? getCell(row, colCorrect) : getCell(row, 5);
    const correctAns = normalizeCorrectAnswer(rawCorrect);
    if (!correctAns) {
      errors.push({
        row: rowNum,
        column: 'Đáp án đúng',
        message: `Đáp án đúng không hợp lệ: "${rawCorrect}". Chỉ chấp nhận A, B, C hoặc D.`,
      });
      continue;
    }

    // 4. Thời gian (Col G)
    const rawTime = colTime >= 0 ? getCell(row, colTime) : getCell(row, 6);
    let parsedTime = 30;
    if (rawTime) {
      const num = parseInt(rawTime.replace(/[^\d]/g, ''), 10);
      if (!Number.isNaN(num) && num > 0) {
        parsedTime = num;
      }
    }

    // 5. Giải thích Hán Việt (Col H)
    const rawHanViet = colHanViet >= 0 ? getCell(row, colHanViet) : getCell(row, 7);
    const parsedH = parseLabeledLines(rawHanViet);

    // 6. Nghĩa các đáp án (Col I)
    const rawMeaning = colMeaning >= 0 ? getCell(row, colMeaning) : getCell(row, 8);
    const parsedI = parseLabeledLines(rawMeaning);

    // 7. Ví dụ minh họa (Col J)
    const rawExample = colExample >= 0 ? getCell(row, colExample) : getCell(row, 9);
    const parsedJ = parseExampleGroups(rawExample);

    // Tạo cấu trúc optionDetails
    const optionDetails: VocabExamOptionDetails = {
      A: {
        han_viet: parsedH.A || '',
        meaning: parsedI.A || '',
        example_jp: parsedJ.A.example_jp || '',
        example_vi: parsedJ.A.example_vi || '',
      },
      B: {
        han_viet: parsedH.B || '',
        meaning: parsedI.B || '',
        example_jp: parsedJ.B.example_jp || '',
        example_vi: parsedJ.B.example_vi || '',
      },
      C: {
        han_viet: parsedH.C || '',
        meaning: parsedI.C || '',
        example_jp: parsedJ.C.example_jp || '',
        example_vi: parsedJ.C.example_vi || '',
      },
      D: {
        han_viet: parsedH.D || '',
        meaning: parsedI.D || '',
        example_jp: parsedJ.D.example_jp || '',
        example_vi: parsedJ.D.example_vi || '',
      },
    };

    validQuestions.push({
      questionNo: extractedNo,
      questionType: 'multiple_choice',
      questionText: rawQuestionText,
      optionA: optA,
      optionB: optB,
      optionC: optC,
      optionD: optD,
      correctAnswer: correctAns,
      timeSeconds: parsedTime,
      optionDetails,
      sortOrder: autoQuestionNo,
      active: true,
      rawRowIndex: rowNum,
    });

    autoQuestionNo++;
  }

  // Tiêu đề gợi ý từ sheet hoặc tên mặc định
  let lessonTitle = 'Luyện thi Từ vựng';
  if (validQuestions.length > 0) {
    lessonTitle = `Luyện thi Từ vựng JLPT N2 (${validQuestions.length} câu)`;
  }

  return {
    success: validQuestions.length > 0,
    lessonMetadata: {
      title: lessonTitle,
      description: `Đề luyện thi Từ vựng gồm ${validQuestions.length} câu hỏi trắc nghiệm kèm giải thích chi tiết và ví dụ minh họa.`,
      jlptLevel: 'N2',
    },
    validQuestions,
    errors,
    warnings,
    summary: {
      totalRows: validQuestions.length + errors.length,
      validCount: validQuestions.length,
      errorCount: errors.length,
    },
  };
}

export function parsedQuestionToExamQuestion(
  parsed: ParsedVocabExamQuestionResult,
  lessonId: string
): ExamQuestion {
  return {
    id: `vxq-${Date.now()}-${parsed.questionNo}-${Math.random().toString(36).substring(2, 7)}`,
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
    answerExplanation: JSON.stringify(parsed.optionDetails),
    vocabularyHanViet: JSON.stringify(parsed.optionDetails),
    optionDetails: parsed.optionDetails,
    sortOrder: parsed.sortOrder,
    active: parsed.active,
  };
}

export function downloadVocabExamTemplate(): void {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Câu hỏi',
    'Đáp án A (Tam giác)',
    'Đáp án B (Thoi)',
    'Đáp án C (Tròn)',
    'Đáp án D (Vuông)',
    'Đáp án đúng (A/B/C/D)',
    'Thời gian (giây)',
    'Giải thích từ hán việt của các đáp án',
    'Nghĩã củacác đáp án',
    'các câu ví dụ minh họa của từ trong đáp án',
  ];

  const sampleRow1 = [
    '[1] 状況を「詳細」に書いてください。「詳細」の読み方として最もよいものはどれですか。',
    'そうざい',
    'そうさい',
    'しょうざい',
    'しょうさい',
    'D',
    30,
    'A. そうざい【惣菜】(Tổng thái): món ăn làm sẵn, thức ăn phụ.\nB. そうさい【総裁】(Tổng tài): tổng tài, người đứng đầu một tổ chức.\nC. しょうざい【商材】(Thương tài): mặt hàng, sản phẩm hoặc tư liệu dùng trong kinh doanh.\nD. しょうさい【詳細】(Tường tế): chi tiết, tỉ mỉ — đây là cách đọc đúng của 「詳細」 trong câu.',
    'A. そうざい（惣菜）: món ăn chế biến sẵn, thức ăn phụ bán sẵn.\nB. そうさい（総裁）: tổng tài, người đứng đầu một tổ chức hoặc cơ quan.\nC. しょうざい（商材）: mặt hàng, sản phẩm hoặc tư liệu dùng để kinh doanh.\nD. しょうさい（詳細）: chi tiết, cụ thể, tỉ mỉ — nghĩa đúng của từ trong câu hỏi.',
    'A. 惣菜（そうざい）: 仕事で帰りが遅くなった日は、スーパーで惣菜を買って夕食を済ませることが多い。\n→ Những ngày đi làm về muộn, tôi thường mua đồ ăn làm sẵn ở siêu thị để dùng bữa tối.\n\nB. 総裁（そうさい）: 新しい総裁には、組織の改革を進める強い指導力が求められている。\n→ Vị tổng tài mới được kỳ vọng có năng lực lãnh đạo mạnh mẽ để thúc đẩy cải cách tổ chức.\n\nC. 商材（しょうざい）: 市場の需要を十分に調査したうえで、オンライン販売に適した商材を選ぶべきだ。\n→ Sau khi nghiên cứu kỹ nhu cầu thị trường, nên lựa chọn mặt hàng phù hợp để bán trực tuyến.\n\nD. 詳細（しょうさい）: 契約を結ぶ前に、条件の詳細を担当者に確認しておいたほうがいい。\n→ Trước khi ký hợp đồng, nên xác nhận trước các chi tiết điều kiện với người phụ trách.',
  ];

  const sampleRow2 = [
    '[2] 「分析」には少し時間がかかります。「分析」の読み方として最もよいものはどれですか。',
    'ぶんせき',
    'ぶんかい',
    'ぶんせつ',
    'ぶんかつ',
    'A',
    30,
    'A. ぶんせき【分析】(Phân tích): phân tích, chia nhỏ để xem xét — đáp án đúng.\nB. ぶんかい【分解】(Phân giải): tháo rời, phân rã; không phải cách đọc của 分析.\nC. ぶんせつ【文節】(Văn tiết): đơn vị ngữ pháp trong câu; không phải cách đọc của 分析.\nD. ぶんかつ【分割】(Phân cát): phân chia, chia cắt; không phải cách đọc của 分析.',
    'A. ぶんせき【分析】(Phân tích): phân tích, chia nhỏ để xem xét\nB. ぶんかい【分解】(Phân giải): tháo rời, phân rã; không phải cách đọc của 分析.\nC. ぶんせつ【文節】(Văn tiết): đơn vị ngữ pháp trong câu; không phải cách đọc của 分析.\nD. ぶんかつ【分割】(Phân cát): phân chia, chia cắt; không phải cách đọc của 分析.',
    'A. 分析（ぶんせき）: 売上が落ちた原因を分析したところ、広告の効果が弱いことが分かった。\n→ Sau khi phân tích nguyên nhân doanh số giảm, chúng tôi phát hiện quảng cáo kém hiệu quả.\n\nB. 分解（ぶんかい）: 故障した機械を分解して、部品を一つずつ確認した。\n→ Tôi tháo rời máy hỏng và kiểm tra từng linh kiện.\n\nC. 文節（ぶんせつ）: この文を文節に分けると、意味が理解しやすくなる。\n→ Chia câu này thành các đơn vị ngữ pháp sẽ giúp dễ hiểu nghĩa hơn.\n\nD. 分割（ぶんかつ）: 支払いは三回に分割することも可能です。\n→ Khoản thanh toán cũng có thể được chia thành ba lần.',
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow1, sampleRow2]);

  // Độ rộng cột
  ws['!cols'] = [
    { wch: 45 }, // Câu hỏi
    { wch: 15 }, // A
    { wch: 15 }, // B
    { wch: 15 }, // C
    { wch: 15 }, // D
    { wch: 12 }, // Đáp án đúng
    { wch: 12 }, // Thời gian
    { wch: 50 }, // Hán Việt
    { wch: 50 }, // Nghĩa
    { wch: 70 }, // Ví dụ
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Câu hỏi');
  XLSX.writeFile(wb, 'mau_input_luyen_thi_tu_vung.xlsx');
}
