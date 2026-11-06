import * as XLSX from 'xlsx';
import type { ExamQuestion, ReadingExamPassage } from '@/types';

export interface ReadingExamLessonMetadata {
  title: string;
  description: string;
  jlptLevel: string;
}

export interface ParsedReadingPassage {
  id: string;
  passageKey: string;
  passageTitle: string;
  passageJa: string;
  passageVi: string;
  sortOrder: number;
  questionCount: number;
}

export interface ParsedReadingQuestion {
  id?: string;
  passageId: string;
  passageKey: string;
  questionNo: number;
  topic: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D' | null;
  timeSeconds: number;
  explanation: string;
  kanjiVocabulary: string;
  grammarStructures: string;
  sortOrder: number;
  rawRowIndex: number;
}

export interface ReadingExamParseError {
  row: number;
  column?: string;
  message: string;
  critical?: boolean;
}

export interface ReadingExamParseResult {
  success: boolean;
  lessonMetadata: ReadingExamLessonMetadata;
  passages: ParsedReadingPassage[];
  validQuestions: ParsedReadingQuestion[];
  errors: ReadingExamParseError[];
  warnings: string[];
  summary: {
    totalRows: number;
    passageCount: number;
    questionCount: number;
    validCount: number;
    errorCount: number;
    noOfficialAnswerCount: number;
  };
}

// Chuẩn hóa tên cột để so khớp linh hoạt
function normalizeColKey(key: string): string {
  return String(key || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

// Kiểm tra xem chuỗi có phải là "giống trên" hay ô trống để kế thừa
export function isInheritValue(text: string): boolean {
  if (!text || !text.trim()) return true;
  const norm = text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  return (
    norm === 'giong tren' ||
    norm === 'nhu tren' ||
    norm === 'giong' ||
    norm === 'nhu' ||
    norm === 'nt' ||
    norm === '"' ||
    norm === '〃' ||
    norm === '-'
  );
}

// Trích xuất tiêu đề ngắn từ đoạn văn
export function extractPassageTitle(passageJa: string): string {
  if (!passageJa || !passageJa.trim()) return 'Đoạn văn đọc hiểu';
  const firstLine = passageJa.split(/\r?\n/)[0].trim();
  // Nếu dòng đầu ngắn và có ký hiệu tiêu đề như （一） hoặc tên bài
  if (firstLine.length > 0 && firstLine.length <= 60) {
    return firstLine;
  }
  return firstLine.substring(0, 45) + '...';
}

// Trích xuất số câu và chủ đề từ Cột B
export function extractQuestionMeta(rawQuestion: string, rowIndex: number): {
  questionNo: number;
  topic: string;
  questionText: string;
} {
  const text = (rawQuestion || '').trim();
  let questionNo = rowIndex + 1;
  let topic = '';
  const questionText = text;

  // 1. Tách questionNo: ví dụ "48. " hoặc "48: " hoặc "Câu 48"
  const noMatch = text.match(/^(\d+)[\s.:、)\]]/) || text.match(/^(?:Câu|cau)\s*(\d+)[\s.:、)\]]/i);
  if (noMatch) {
    questionNo = parseInt(noMatch[1], 10);
  }

  // 2. Tách topic từ 【...】 hoặc [...]
  const topicMatch = text.match(/【(.*?)】/) || text.match(/\[(.*?)\]/);
  if (topicMatch) {
    topic = topicMatch[1].trim();
  }

  return { questionNo, topic, questionText };
}

// Bóc tách workbook đọc hiểu từ buffer
export function parseReadingExamWorkbookBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fallbackTitle = 'Bài học Luyện thi Đọc hiểu'
): ReadingExamParseResult {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetNames = wb.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    return {
      success: false,
      lessonMetadata: { title: fallbackTitle, description: '', jlptLevel: 'N2' },
      passages: [],
      validQuestions: [],
      errors: [{ row: 0, message: 'File Excel không có sheet nào' }],
      warnings: [],
      summary: { totalRows: 0, passageCount: 0, questionCount: 0, validCount: 0, errorCount: 1, noOfficialAnswerCount: 0 },
    };
  }

  // Tìm sheet "câu hỏi input mấu" hoặc sheet đầu tiên phù hợp
  let targetSheetName = sheetNames[0];
  for (const name of sheetNames) {
    const norm = normalizeColKey(name);
    if (norm.includes('cauhoiinput') || norm.includes('input') || norm.includes('cauhoi') || norm.includes('debai')) {
      targetSheetName = name;
      break;
    }
  }

  const sheet = wb.Sheets[targetSheetName];
  if (!sheet) {
    return {
      success: false,
      lessonMetadata: { title: fallbackTitle, description: '', jlptLevel: 'N2' },
      passages: [],
      validQuestions: [],
      errors: [{ row: 0, message: `Không tìm thấy sheet dữ liệu trong file Excel` }],
      warnings: [],
      summary: { totalRows: 0, passageCount: 0, questionCount: 0, validCount: 0, errorCount: 1, noOfficialAnswerCount: 0 },
    };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rows.length < 2) {
    return {
      success: false,
      lessonMetadata: { title: fallbackTitle, description: '', jlptLevel: 'N2' },
      passages: [],
      validQuestions: [],
      errors: [{ row: 1, message: 'Sheet dữ liệu không có dòng câu hỏi nào (chỉ có tiêu đề hoặc rỗng)' }],
      warnings: [],
      summary: { totalRows: 0, passageCount: 0, questionCount: 0, validCount: 0, errorCount: 1, noOfficialAnswerCount: 0 },
    };
  }

  // Phân tích header (Dòng 0)
  const headerRow = (rows[0] || []).map((h) => String(h || '').trim());
  const colIndexMap: Record<string, number> = {};

  headerRow.forEach((colName, idx) => {
    const k = normalizeColKey(colName);
    if (k.includes('dapandung') || k.includes('correct') || k.includes('key')) colIndexMap['correct_answer'] = idx;
    else if (k === 'dapana' || k === 'a' || k === 'luachona' || k === 'phuongana') colIndexMap['option_a'] = idx;
    else if (k === 'dapanb' || k === 'b' || k === 'luachonb' || k === 'phuonganb') colIndexMap['option_b'] = idx;
    else if (k === 'dapanc' || k === 'c' || k === 'luachonc' || k === 'phuonganc') colIndexMap['option_c'] = idx;
    else if (k === 'dapand' || k === 'd' || k === 'luachond' || k === 'phuongand') colIndexMap['option_d'] = idx;
    else if (k.includes('thoigian') || k.includes('time') || k.includes('giay') || k.includes('second')) colIndexMap['time'] = idx;
    else if (k.includes('nguphap') || k.includes('grammar') || k.includes('cautruc')) colIndexMap['grammar'] = idx;
    else if (k.includes('hantu') || k.includes('kanji') || k.includes('hanviet')) colIndexMap['kanji'] = idx;
    else if (k.includes('phantich') || k.includes('giaithich') || k.includes('minhchung') || k.includes('explanation')) colIndexMap['explanation'] = idx;
    else if (k.includes('dichtiengviet') || k.includes('dichdoan') || k.includes('vietnamese') || k.includes('bandich') || k.includes('dich')) colIndexMap['passage_vi'] = idx;
    else if (k === 'doanvan' || k === 'a' || k === 'passage' || k === 'vanban' || k.includes('doanvan')) colIndexMap['passage_ja'] = idx;
    else if (k.includes('cauhoi') || k.includes('question') || k === 'b') colIndexMap['question'] = idx;
  });

  // Fallback mặc định theo vị trí 12 cột chuẩn A-L
  if (colIndexMap['passage_ja'] === undefined) colIndexMap['passage_ja'] = 0;
  if (colIndexMap['question'] === undefined) colIndexMap['question'] = 1;
  if (colIndexMap['option_a'] === undefined) colIndexMap['option_a'] = 2;
  if (colIndexMap['option_b'] === undefined) colIndexMap['option_b'] = 3;
  if (colIndexMap['option_c'] === undefined) colIndexMap['option_c'] = 4;
  if (colIndexMap['option_d'] === undefined) colIndexMap['option_d'] = 5;
  if (colIndexMap['correct_answer'] === undefined) colIndexMap['correct_answer'] = 6;
  if (colIndexMap['time'] === undefined) colIndexMap['time'] = 7;
  if (colIndexMap['passage_vi'] === undefined) colIndexMap['passage_vi'] = 8;
  if (colIndexMap['explanation'] === undefined) colIndexMap['explanation'] = 9;
  if (colIndexMap['kanji'] === undefined) colIndexMap['kanji'] = 10;
  if (colIndexMap['grammar'] === undefined) colIndexMap['grammar'] = 11;

  const validQuestions: ParsedReadingQuestion[] = [];
  const errors: ReadingExamParseError[] = [];
  const warnings: string[] = [];

  // Trạng thái kế thừa "giống trên"
  let lastRealPassageJa = '';
  let lastRealPassageVi = '';
  let passageCounter = 0;
  const passageMap = new Map<string, ParsedReadingPassage>();
  let currentPassageId = '';
  let currentPassageKey = '';

  let detectedJlptLevel = 'N2';
  let firstDetectedTopic = '';
  let noOfficialAnswerCount = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    // Kiểm tra dòng có nội dung nào không
    const rowHasContent = row.some((cell) => String(cell || '').trim() !== '');
    if (!rowHasContent) continue;

    const rawPassageJa = String(row[colIndexMap['passage_ja']] || '').trim();
    const rawQuestion = String(row[colIndexMap['question']] || '').trim();
    const rawOptA = String(row[colIndexMap['option_a']] || '').trim();
    const rawOptB = String(row[colIndexMap['option_b']] || '').trim();
    const rawOptC = String(row[colIndexMap['option_c']] || '').trim();
    const rawOptD = String(row[colIndexMap['option_d']] || '').trim();
    const rawCorrect = String(row[colIndexMap['correct_answer']] || '').trim().toUpperCase();
    const rawTime = String(row[colIndexMap['time']] || '').trim();
    const rawPassageVi = String(row[colIndexMap['passage_vi']] || '').trim();
    const rawExplanation = String(row[colIndexMap['explanation']] || '').trim();
    const rawKanji = String(row[colIndexMap['kanji']] || '').trim();
    const rawGrammar = String(row[colIndexMap['grammar']] || '').trim();

    // ── XỬ LÝ ĐOẠN VĂN & KẾ THỪA "GIỐNG TRÊN" ──
    const passageJaIsInherit = isInheritValue(rawPassageJa);
    const passageViIsInherit = isInheritValue(rawPassageVi);

    if (!passageJaIsInherit && rawPassageJa) {
      // Đoạn văn tiếng Nhật thật mới
      lastRealPassageJa = rawPassageJa;
      passageCounter++;
      currentPassageKey = `passage_key_${passageCounter}`;
      currentPassageId = `p_${passageCounter}`;

      if (!passageViIsInherit && rawPassageVi) {
        lastRealPassageVi = rawPassageVi;
      }

      const pTitle = extractPassageTitle(rawPassageJa);
      passageMap.set(currentPassageId, {
        id: currentPassageId,
        passageKey: currentPassageKey,
        passageTitle: pTitle,
        passageJa: lastRealPassageJa,
        passageVi: lastRealPassageVi,
        sortOrder: passageCounter,
        questionCount: 0,
      });
    } else {
      // Đoạn văn kế thừa "giống trên"
      if (!lastRealPassageJa) {
        errors.push({
          row: r + 1,
          column: 'A',
          message: `Hàng ${r + 1} ghi "giống trên" nhưng chưa từng có đoạn văn thật phía trên!`,
          critical: true,
        });
        continue;
      }
      // Nếu cột I có bản dịch mới
      if (!passageViIsInherit && rawPassageVi) {
        lastRealPassageVi = rawPassageVi;
        const currentP = passageMap.get(currentPassageId);
        if (currentP) {
          currentP.passageVi = lastRealPassageVi;
        }
      }
    }

    // ── VALIDATE CÂU HỎI VÀ ĐÁP ÁN ──
    if (!rawQuestion) {
      errors.push({
        row: r + 1,
        column: 'B',
        message: `Hàng ${r + 1}: Cột Câu hỏi không được để trống`,
        critical: true,
      });
      continue;
    }

    if (!rawOptA || !rawOptB || !rawOptC || !rawOptD) {
      errors.push({
        row: r + 1,
        message: `Hàng ${r + 1}: Phải có đủ 4 đáp án A, B, C, D`,
        critical: true,
      });
      continue;
    }

    // Phân tích câu hỏi
    const { questionNo, topic, questionText } = extractQuestionMeta(rawQuestion, validQuestions.length);
    if (!firstDetectedTopic && topic) {
      firstDetectedTopic = topic;
    }

    // Nhận diện JLPT Level nếu có trong topic hoặc question
    const jlptMatch = (rawQuestion + ' ' + rawExplanation).match(/\b(N[1-5])\b/i);
    if (jlptMatch) {
      detectedJlptLevel = jlptMatch[1].toUpperCase();
    }

    // Phân tích đáp án đúng
    let correctAnswer: 'A' | 'B' | 'C' | 'D' | null = null;
    if (rawCorrect === 'A' || rawCorrect === 'B' || rawCorrect === 'C' || rawCorrect === 'D') {
      correctAnswer = rawCorrect;
    } else if (rawCorrect) {
      // Trích xuất ký tự đầu nếu là "B." hoặc "Đáp án B"
      const m = rawCorrect.match(/\b([A-D])\b/i);
      if (m) {
        correctAnswer = m[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
      }
    }

    if (!correctAnswer) {
      noOfficialAnswerCount++;
      warnings.push(`Hàng ${r + 1} (Câu ${questionNo}): Chưa có đáp án chính thức (trạng thái no_official_answer).`);
    }

    // Thời gian
    let timeSeconds = parseInt(rawTime, 10);
    if (Number.isNaN(timeSeconds) || timeSeconds <= 0) {
      timeSeconds = 30;
    }

    // Cập nhật số câu của Passage
    const currentPassage = passageMap.get(currentPassageId);
    if (currentPassage) {
      currentPassage.questionCount++;
    }

    validQuestions.push({
      passageId: currentPassageId,
      passageKey: currentPassageKey,
      questionNo,
      topic,
      questionText,
      optionA: rawOptA,
      optionB: rawOptB,
      optionC: rawOptC,
      optionD: rawOptD,
      correctAnswer,
      timeSeconds,
      explanation: rawExplanation,
      kanjiVocabulary: rawKanji,
      grammarStructures: rawGrammar,
      sortOrder: validQuestions.length + 1,
      rawRowIndex: r,
    });
  }

  const passagesList = Array.from(passageMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

  // Tạo tiêu đề bài học mặc định thông minh
  let finalTitle = fallbackTitle;
  if (firstDetectedTopic) {
    finalTitle = `Luyện thi Đọc hiểu: ${firstDetectedTopic}`;
  } else if (passagesList.length > 0 && passagesList[0].passageTitle) {
    finalTitle = `Luyện thi Đọc hiểu: ${passagesList[0].passageTitle}`;
  }

  const success = validQuestions.length > 0 && errors.length === 0;

  return {
    success,
    lessonMetadata: {
      title: finalTitle,
      description: `Đề thi luyện đọc hiểu JLPT gồm ${passagesList.length} đoạn văn và ${validQuestions.length} câu hỏi.`,
      jlptLevel: detectedJlptLevel,
    },
    passages: passagesList,
    validQuestions,
    errors,
    warnings,
    summary: {
      totalRows: rows.length - 1,
      passageCount: passagesList.length,
      questionCount: validQuestions.length,
      validCount: validQuestions.length,
      errorCount: errors.length,
      noOfficialAnswerCount,
    },
  };
}

// Chuyển đổi câu hỏi đã parse thành ExamQuestion lưu vào database
export function parsedQuestionToReadingExamQuestion(
  q: ParsedReadingQuestion,
  lessonId: string,
  realPassageIdMap?: Map<string, string>
): ExamQuestion {
  const actualPassageId = (realPassageIdMap && realPassageIdMap.get(q.passageId)) || q.passageId;
  const questionId = `${lessonId}_q_${q.questionNo}`;

  return {
    id: questionId,
    lessonId,
    questionNo: q.questionNo,
    questionType: 'multiple_choice',
    questionText: q.questionText,
    optionA: q.optionA,
    optionB: q.optionB,
    optionC: q.optionC,
    optionD: q.optionD,
    correctAnswer: q.correctAnswer,
    timeSeconds: q.timeSeconds,
    answerExplanation: q.explanation,
    sortOrder: q.sortOrder,
    active: true,
    passageId: actualPassageId,
    topic: q.topic,
    kanjiVocabulary: q.kanjiVocabulary,
    grammarStructures: q.grammarStructures,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Chuyển đổi đoạn văn đã parse thành ReadingExamPassage lưu vào database
export function parsedPassageToReadingPassage(
  p: ParsedReadingPassage,
  lessonId: string
): ReadingExamPassage {
  const passageId = `${lessonId}_passage_${p.sortOrder}`;
  return {
    id: passageId,
    lessonId,
    passageKey: p.passageKey,
    passageTitle: p.passageTitle,
    passageJa: p.passageJa,
    passageVi: p.passageVi,
    sortOrder: p.sortOrder,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Tải xuống file Excel mẫu chuẩn 12 cột kèm đầy đủ dữ liệu mẫu (Câu 48-52)
export function downloadReadingExamTemplate(): void {
  const wb = XLSX.utils.book_new();

  // Dữ liệu mẫu 12 cột chính xác theo đặc tả Phần B
  const headers = [
    'Đoạn văn',
    'Câu hỏi',
    'Đáp án A',
    'Đáp án B',
    'Đáp án C',
    'Đáp án D',
    'Đáp án đúng (A/B/C/D)',
    'Thời gian (giây)',
    'Dich tiếng việt đoạn văn',
    'Phân tích giải thích đáp án và đưa minh chứng để chúng minh đáp án',
    'Các từ hán tự trong đoạn văn',
    'Các cấu trúc ngữ pháp trong đoạn văn',
  ];

  const passage1Ja = `私は日本の秋の景色が好きです。秋になって紅葉が始まり、緑だった葉が黄色やオレンジ、赤に変わると、とてもきれいです。秋の紅葉は、日本の四季の変化を感じさせてくれるものです。

(48) \u3000ですが、先日テレビで、紅葉がピークを迎える時期が年々遅くなっているというニュースを見ました。中には、1月になってからピークを迎えたところもあるそうで、驚きました。温暖化によって平均気温が上昇していることが大きな原因だそうです。私は、夏が過ぎて気温が下がってくれば、必ず紅葉が始まると思っていました。(49)、そうではありませんでした。紅葉には、条件となる気温の変化がありました。

葉の変色が始まるのは、1日の最低気温が大体8度以下になってからです。秋になっても、最低気温が一定の気温まで下がらなければ、紅葉は (50)。その後、さらに寒くなり、5～6度まで下がると、紅葉は一気に進みます。また、5度以下の日が続くと、最も美しい新葉が見られるといわれています。

紅葉に起きている異変を知り、このまま温暖化が進むと、日本の秋の景色が変わってしまう可能性もあるのではないかと思いました。もしかしたら、紅葉自体が見られなくなる日も来るかもしれません。紅葉を通して、温暖化が身近な問題であることをより強く (51)。`;

  const passage1Vi = `Tôi rất thích phong cảnh mùa thu của Nhật Bản. Khi mùa thu đến, lá phong bắt đầu đổi màu, những chiếc lá từ xanh chuyển sang vàng, cam rồi đỏ trông vô cùng đẹp đẽ. Lá đỏ mùa thu chính là thứ giúp chúng ta cảm nhận được sự chuyển giao bốn mùa của Nhật Bản.

Tuy vậy, hôm nọ trên tivi, tôi thấy bản tin nói rằng thời điểm lá đỏ đạt đỉnh ngày càng muộn hơn qua từng năm. Trong đó, có nơi sang tận tháng 1 mới đạt đỉnh, điều này làm tôi rất ngạc nhiên. Nghe nói nguyên nhân lớn là do nhiệt độ trung bình tăng lên bởi sự nóng lên toàn cầu. Tôi từng nghĩ rằng hễ qua mùa hè và nhiệt độ giảm xuống thì chắc chắn lá đỏ sẽ bắt đầu. Thế nhưng, sự thật không phải như vậy. Để lá đỏ xuất hiện cần có sự thay đổi nhiệt độ mang tính điều kiện.

Hiện tượng lá bắt đầu đổi màu diễn ra sau khi nhiệt độ thấp nhất trong ngày xuống dưới khoảng 8 độ C. Dù sang thu, nếu nhiệt độ thấp nhất không giảm xuống mức nhất định thì lá đỏ sẽ không bắt đầu. Sau đó, trời lạnh hơn nữa, khi nhiệt độ giảm xuống 5 đến 6 độ thì lá đỏ sẽ chuyển màu đồng loạt. Ngoài ra, người ta nói rằng nếu những ngày dưới 5 độ C kéo dài thì sẽ có thể ngắm được những tán lá mới đẹp nhất.

Biết về sự bất thường đang diễn ra với lá đỏ, tôi nghĩ rằng nếu hiện tượng nóng lên toàn cầu cứ tiếp diễn thì có khả năng cảnh sắc mùa thu Nhật Bản sẽ thay đổi. Biết đâu, ngày mà ta không còn được nhìn thấy chính lá đỏ nữa cũng sẽ đến. Qua lá đỏ, tôi càng cảm nhận mạnh mẽ hơn rằng sự nóng lên toàn cầu là một vấn đề rất gần gũi.`;

  const passage2Ja = `（一）言葉の定義づけ
自分の言葉は自分の頭の中にしかなく、相手の言葉は相手の頭の中にしかありません。抽象的な言葉の場合には、まったく同じ意味で使用していることのほうが少ないと言えるでしょう。

したがって、議論をする際には、言葉の定義づけ（注）が重要になってきます。相手がどういう意味でその言葉を使用しているのか、自分と同じ意味で使用しているのかを確認することは大切なことです。これは、論理的に会話をするうえでの大前提となるものです。

（注）定義づけ：ここでは、意味を決めること`;

  const passage2Vi = `(1) Định nghĩa từ ngữ
Từ ngữ của bản thân chỉ nằm trong đầu mình, và từ ngữ của đối phương chỉ nằm trong đầu của đối phương. Trong trường hợp những từ ngữ trừu tượng, có thể nói rằng việc hai bên sử dụng với hoàn toàn cùng một ý nghĩa là rất hiếm.

Do đó, khi thảo luận, việc định nghĩa từ ngữ trở nên rất quan trọng. Xác nhận xem đối phương đang sử dụng từ đó với ý nghĩa gì, có cùng ý nghĩa với mình hay không là một điều quan trọng. Đây chính là tiền đề lớn để có thể trò chuyện một cách logic.

(Chú thích) Định nghĩa: ở đây có nghĩa là xác định ý nghĩa`;

  const kanjiP1 = `紅葉（こうよう／もみじ）— HỒNG DIỆP: lá đỏ mùa thu
温暖化（おんだんか）— ÔN NOÃN HÓA: sự nóng lên toàn cầu
異変（いへん）— DỊ BIẾN: sự bất thường, sự biến đổi khác lạ
最低気温（さいていきおん）— TỐI ĐÊ KHÍ ÔN: nhiệt độ thấp nhất`;

  const grammarP1 = `～によって: do, bởi vì... (chỉ nguyên nhân)
～そうです: nghe nói là... (truyền văn)
Vるようになる: trở nên/bắt đầu... (sự biến đổi nhận thức)`;

  const dataRows = [
    headers,
    [
      passage1Ja,
      '48. 【問題9・紅葉の異変】空欄 (48) に入る最もよいものはどれか。',
      'そこの紅葉',
      'そんな紅葉',
      'そちら',
      '紅葉',
      'B',
      30,
      passage1Vi,
      `✅ Đáp án đúng: B (そんな紅葉)
- 「そんな紅葉」nhắc lại đặc điểm lá đỏ mùa thu tuyệt đẹp vừa được miêu tả ở đoạn 1.
- Liên từ đối lập「ですが」phía sau tạo sự tương phản với việc lá đỏ đạt đỉnh ngày càng trễ.
❌ Phân tích đáp án sai:
- A (そこの紅葉): Sai vì「そこ」chỉ nơi chốn/vị trí cụ thể.
- C (そちら): Sai vì「そちら」chỉ phương hướng, phía người nghe hoặc cách xưng hô lịch sự.
- D (紅葉): Có thể đúng ngữ pháp nhưng tính liên kết văn cảnh không tự nhiên và chặt chẽ bằng B.
🧠 Mẹo làm bài:
- Khi câu văn có「ですが」, hãy chú ý đại từ chỉ định liên kết nội dung tích cực phía trước với nội dung bất thường phía sau.`,
      kanjiP1,
      grammarP1,
    ],
    [
      'giống trên',
      '49. 【問題9・紅葉の異変】空欄 (49) に入る最もよいものはどれか。',
      '結局',
      '確かに',
      'しかし',
      'つまり',
      'C',
      30,
      'giống trên',
      `✅ Đáp án đúng: C (しかし)
- Trước chỗ trống là suy nghĩ chủ quan cũ:「必ず紅葉が始まると思っていました」(tôi từng nghĩ chắc chắn lá đỏ sẽ bắt đầu).
- Sau chỗ trống là sự thật phủ định:「そうではありませんでした」(thực tế không phải vậy).
- Hai vế mang ý nghĩa nghịch đối lập trực tiếp nên liên từ bắt buộc phải là「しかし」(tuy nhiên/thế nhưng).
❌ Phân tích đáp án sai:
- A (結局): rốt cuộc/kết cục (chỉ kết quả sau một quá trình).
- B (確かに): quả thật/đúng là (thừa nhận một điều hiển nhiên).
- D (つまり): tóm lại/nghĩa là (giải thích hoặc diễn đạt lại).`,
      kanjiP1,
      grammarP1,
    ],
    [
      'giống trên',
      '50. 【問題9・紅葉の異変】空欄 (50) に入る最もよいものはどれか。',
      '始まらないのです',
      '始まらないためです',
      '始まらないのでしょうか',
      '始まらないためでしょうか',
      'A',
      30,
      'giống trên',
      `✅ Đáp án đúng: A (始まらないのです)
- Câu diễn giải một quy luật tự nhiên đã được kiểm chứng khoa học: nếu nhiệt độ không giảm thì lá đỏ sẽ không bắt đầu đổi màu.
- Đuôi câu「～のです」dùng để giải thích bản chất/sự thật khách quan.
❌ Phân tích đáp án sai:
- B (始まらないためです):「ためです」yêu cầu vế sau là kết quả giải thích nguyên nhân, không hợp ngữ cảnh điều kiện「～なければ」.
- C & D: Đuôi nghi vấn「～のでしょうか」chỉ phỏng đoán hỏi người khác, trong khi đây là câu trần thuật khẳng định quy luật.`,
      kanjiP1,
      grammarP1,
    ],
    [
      'giống trên',
      '51. 【問題9・紅葉の異変】空欄 (51) に入る最もよいものはどれか。',
      '感じているからだと思います',
      '感じられるところだと思います',
      '感じさせることができました',
      '感じるようになりました',
      'D',
      30,
      'giống trên',
      `✅ Đáp án đúng: D (感じるようになりました)
- Cụm từ「より強く」(mạnh mẽ hơn trước) báo hiệu sự biến đổi nhận thức từ trước đến nay.
- Cấu trúc「Vるようになる」biểu thị trạng thái biến đổi: trước đây chưa nhận thức sâu sắc, nay bắt đầu/trở nên nhận thức sâu sắc hơn.
❌ Phân tích đáp án sai:
- A (感じているからだと思います): chỉ nêu nguyên nhân, không thể hiện được sự biến đổi nhận thức theo thời gian.
- B (感じられるところだと思います): không tự nhiên trong việc bộc lộ cảm xúc cá nhân.
- C (感じさせることができました): dạng sai khiến (làm cho ai đó cảm thấy), không phù hợp chủ ngữ bản thân tác giả.`,
      kanjiP1,
      grammarP1,
    ],
    [
      passage2Ja,
      '52. 【問題10（一）・言葉の定義づけ】筆者によると、論理的な会話をするのに必要なことは何か。',
      '抽象的な言葉をできるだけ使用しないようにする。',
      '抽象的な言葉を、正しい意味かどうかを確認してから使用する。',
      '同じ言葉を、相手と自分が同じ意味で使用しているかを確認する。',
      '相手の知らない言葉は、自分がどういう意味で使用しているかを説明する。',
      'C',
      30,
      passage2Vi,
      `✅ Đáp án đúng: C (同じ言葉を、相手と自分が同じ意味で使用しているかを確認する。)
- Minh chứng trong bài:「相手がどういう意味でその言葉を使用しているのか、自分と同じ意味で使用しているのかを確認することは大切なことです。これは、論理的に会話をするうえでの大前提となるものです。」
- Đáp án C bao quát đầy đủ 5 yếu tố then chốt: cùng một từ ngữ, đối phương và bản thân, cùng một ý nghĩa, việc xác nhận.
❌ Phân tích đáp án sai:
- A: Tác giả không hề nói "cố gắng không dùng từ trừu tượng", mà nói cần định nghĩa khi sử dụng.
- B: Bài viết không đề cập đến việc "kiểm tra xem từ đó có đúng nghĩa hay không", mà là kiểm tra sự đồng nhất về ý nghĩa giữa 2 người.
- D: Bài viết bàn về việc hai người có cùng hiểu một nghĩa hay không, không giới hạn ở "từ đối phương không biết".
🧠 Mẹo làm bài:
- Chú ý câu có đại từ chỉ thị「これは、...」(Đây là...). Nội dung ngay trước「これは」chính là chìa khóa trả lời câu hỏi!`,
      `定義づけ（ていぎづけ）— ĐỊNH NGHĨA: xác định/định nghĩa ý nghĩa
抽象的（ちゅうしょうてき）— TRỪU TƯỢNG TÍNH: tính trừu tượng
大前提（だいぜんてい）— ĐẠI TIỀN ĐỀ: tiền đề lớn, điều kiện tiên quyết`,
      `～うえで: trong quá trình..., để... (tiền đề thực hiện hành động)
～にしか...ない: chỉ có ở... (nhấn mạnh sự hạn chế)`,
    ],
  ];

  const wsMain = XLSX.utils.aoa_to_sheet(dataRows);
  // Column width
  wsMain['!cols'] = [
    { wch: 45 }, // A: Đoạn văn
    { wch: 40 }, // B: Câu hỏi
    { wch: 25 }, // C: A
    { wch: 25 }, // D: B
    { wch: 25 }, // E: C
    { wch: 25 }, // F: D
    { wch: 15 }, // G: Đáp án đúng
    { wch: 12 }, // H: Thời gian
    { wch: 45 }, // I: Dịch đoạn văn
    { wch: 50 }, // J: Phân tích
    { wch: 35 }, // K: Hán tự
    { wch: 35 }, // L: Ngữ pháp
  ];
  XLSX.utils.book_append_sheet(wb, wsMain, 'câu hỏi input mấu');

  // Sheet 2: Giao diện
  const uiRows = [
    ['MÔ TẢ GIAO DIỆN BÀI HỌC LUYỆN THI ĐỌC HIỂU'],
    ['1. Split View: Chia 2 khu vực (Đoạn văn bên trái 40%, Câu hỏi bên phải 60%), có thể kéo co giãn 25% - 75%.'],
    ['2. Flip Card: Chạm thẻ đoạn văn để lật 3D xem bản dịch tiếng Việt, chạm lần nữa để lật về tiếng Nhật.'],
    ['3. Đánh dấu chỗ trống: Các ký hiệu (48), (49), (50), (51) trong đoạn văn được tô màu vàng nhạt nổi bật.'],
    ['4. Khóa giải thích: Phần Giải thích, Hán tự và Ngữ pháp bị khóa trước khi bấm "Nộp bài".'],
    ['5. Đồng hồ đếm ngược: Đếm ngược thời gian cho từng câu và phát cảnh báo khi gần hết giờ.'],
  ];
  const wsUI = XLSX.utils.aoa_to_sheet(uiRows);
  XLSX.utils.book_append_sheet(wb, wsUI, 'Giao diện');

  // Sheet 3: Prompt
  const promptRows = [
    ['QUY TẮC NGHIỆP VỤ NHẬP EXCEL ĐỌC HIỂU'],
    ['1. 1 file Excel = 1 Lesson đọc hiểu (lesson_type: reading_exam, category_id: cat-reading).'],
    ['2. N hàng trong file = N câu hỏi nằm chung trong 1 bài học duy nhất.'],
    ['3. Cột A nếu ghi "giống trên" hoặc để trống sẽ tự động kế thừa đoạn văn gần nhất phía trên.'],
    ['4. Cột I nếu ghi "giống trên" hoặc để trống sẽ tự động kế thừa bản dịch gần nhất phía trên.'],
    ['5. Nhiều câu hỏi cùng đoạn văn sẽ dùng chung 1 passage_id.'],
  ];
  const wsPrompt = XLSX.utils.aoa_to_sheet(promptRows);
  XLSX.utils.book_append_sheet(wb, wsPrompt, 'Prompt');

  XLSX.writeFile(wb, 'mau_input_luyen_thi_doc_hieu.xlsx');
}
