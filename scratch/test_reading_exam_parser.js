import assert from 'assert';
import * as XLSX from 'xlsx';

// Copy parser functions for standalone pure-JS testing
function normalizeColKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

function isInheritValue(text) {
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

function extractPassageTitle(passageJa) {
  if (!passageJa || !passageJa.trim()) return 'Đoạn văn đọc hiểu';
  const firstLine = passageJa.split(/\r?\n/)[0].trim();
  if (firstLine.length > 0 && firstLine.length <= 60) {
    return firstLine;
  }
  return firstLine.substring(0, 45) + '...';
}

function extractQuestionMeta(rawQuestion, rowIndex) {
  const text = (rawQuestion || '').trim();
  let questionNo = rowIndex + 1;
  let topic = '';
  let questionText = text;

  const noMatch = text.match(/^(\d+)[\s.:、)\]]/) || text.match(/^(?:Câu|cau)\s*(\d+)[\s.:、)\]]/i);
  if (noMatch) {
    questionNo = parseInt(noMatch[1], 10);
  }

  const topicMatch = text.match(/【(.*?)】/) || text.match(/\[(.*?)\]/);
  if (topicMatch) {
    topic = topicMatch[1].trim();
  }

  return { questionNo, topic, questionText };
}

function parseReadingExamWorkbookBuffer(buffer, fallbackTitle = 'Bài học Luyện thi Đọc hiểu') {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetNames = wb.SheetNames;
  let targetSheetName = sheetNames[0];
  for (const name of sheetNames) {
    const norm = normalizeColKey(name);
    if (norm.includes('cauhoiinput') || norm.includes('input') || norm.includes('cauhoi') || norm.includes('debai')) {
      targetSheetName = name;
      break;
    }
  }

  const sheet = wb.Sheets[targetSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });

  const headerRow = (rows[0] || []).map((h) => String(h || '').trim());
  const colIndexMap = {};

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

  const validQuestions = [];
  const errors = [];
  const warnings = [];

  let lastRealPassageJa = '';
  let lastRealPassageVi = '';
  let passageCounter = 0;
  const passageMap = new Map();
  let currentPassageId = '';
  let currentPassageKey = '';

  let detectedJlptLevel = 'N2';
  let firstDetectedTopic = '';
  let noOfficialAnswerCount = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
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

    const passageJaIsInherit = isInheritValue(rawPassageJa);
    const passageViIsInherit = isInheritValue(rawPassageVi);

    if (!passageJaIsInherit && rawPassageJa) {
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
      if (!lastRealPassageJa) {
        errors.push({
          row: r + 1,
          column: 'A',
          message: `Hàng ${r + 1} ghi "giống trên" nhưng chưa từng có đoạn văn thật phía trên!`,
          critical: true,
        });
        continue;
      }
      if (!passageViIsInherit && rawPassageVi) {
        lastRealPassageVi = rawPassageVi;
        const currentP = passageMap.get(currentPassageId);
        if (currentP) {
          currentP.passageVi = lastRealPassageVi;
        }
      }
    }

    if (!rawQuestion) {
      errors.push({ row: r + 1, column: 'B', message: `Hàng ${r + 1}: Cột Câu hỏi không được để trống`, critical: true });
      continue;
    }

    if (!rawOptA || !rawOptB || !rawOptC || !rawOptD) {
      errors.push({ row: r + 1, message: `Hàng ${r + 1}: Phải có đủ 4 đáp án A, B, C, D`, critical: true });
      continue;
    }

    const { questionNo, topic, questionText } = extractQuestionMeta(rawQuestion, validQuestions.length);
    if (!firstDetectedTopic && topic) firstDetectedTopic = topic;

    const jlptMatch = (rawQuestion + ' ' + rawExplanation).match(/\b(N[1-5])\b/i);
    if (jlptMatch) detectedJlptLevel = jlptMatch[1].toUpperCase();

    let correctAnswer = null;
    if (rawCorrect === 'A' || rawCorrect === 'B' || rawCorrect === 'C' || rawCorrect === 'D') {
      correctAnswer = rawCorrect;
    } else if (rawCorrect) {
      const m = rawCorrect.match(/\b([A-D])\b/i);
      if (m) correctAnswer = m[1].toUpperCase();
    }

    if (!correctAnswer) {
      noOfficialAnswerCount++;
      warnings.push(`Hàng ${r + 1} (Câu ${questionNo}): Chưa có đáp án chính thức`);
    }

    let timeSeconds = parseInt(rawTime, 10);
    if (Number.isNaN(timeSeconds) || timeSeconds <= 0) timeSeconds = 30;

    const currentPassage = passageMap.get(currentPassageId);
    if (currentPassage) currentPassage.questionCount++;

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
  let finalTitle = fallbackTitle;
  if (firstDetectedTopic) finalTitle = `Luyện thi Đọc hiểu: ${firstDetectedTopic}`;
  else if (passagesList.length > 0 && passagesList[0].passageTitle) finalTitle = `Luyện thi Đọc hiểu: ${passagesList[0].passageTitle}`;

  return {
    success: validQuestions.length > 0 && errors.length === 0,
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

// Build Excel file and test
const wb = XLSX.utils.book_new();

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

(48)　ですが、先日テレビで、紅葉がピークを迎える時期が年々遅くなっているというニュースを見ました。中には、1月になってからピークを迎えたところもあるそうで、驚きました。温暖化によって平均気温が上昇していることが大きな原因だそうです。私は、夏が過ぎて気温が下がってくれば、必ず紅葉が始まると思っていました。(49)、そうではありませんでした。紅葉には、条件となる気温の変化がありました。

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
    'Phân tích câu 48: Chọn B...',
    '紅葉（こうよう）— HỒNG DIỆP: lá đỏ mùa thu',
    '～によって: do/bởi...',
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
    'Phân tích câu 49: Chọn C...',
    '紅葉（こうよう）— HỒNG DIỆP: lá đỏ mùa thu',
    '～によって: do/bởi...',
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
    'Phân tích câu 50: Chọn A...',
    '変色（へんしょく）— BIẾN SẮC: đổi màu',
    '～のです: giải thích quy luật',
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
    'Phân tích câu 51: Chọn D...',
    '可能性（かのうせい）— KHẢ NĂNG TÍNH: khả năng',
    'Vるようになる: trở nên/bắt đầu...',
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
    'Phân tích câu 52: Chọn C...',
    '定義づけ（ていぎづけ）— ĐỊNH NGHĨA',
    '～うえで: để, trong quá trình...',
  ],
];

const ws = XLSX.utils.aoa_to_sheet(dataRows);
XLSX.utils.book_append_sheet(wb, ws, 'câu hỏi input mấu');
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

const result = parseReadingExamWorkbookBuffer(buf);

console.log('--- TEST RESULTS ---');
console.log('Success:', result.success);
console.log('Summary:', result.summary);
console.log('Passage Count:', result.passages.length);
console.log('Question Count:', result.validQuestions.length);

assert.strictEqual(result.success, true);
assert.strictEqual(result.passages.length, 2, 'Should create exactly 2 passages');
assert.strictEqual(result.validQuestions.length, 5, 'Should create exactly 5 questions');

const p1Id = result.passages[0].id;
const p2Id = result.passages[1].id;

assert.notStrictEqual(p1Id, p2Id, 'Passage 1 and Passage 2 must have distinct IDs');

const q48 = result.validQuestions.find((q) => q.questionNo === 48);
const q49 = result.validQuestions.find((q) => q.questionNo === 49);
const q50 = result.validQuestions.find((q) => q.questionNo === 50);
const q51 = result.validQuestions.find((q) => q.questionNo === 51);
const q52 = result.validQuestions.find((q) => q.questionNo === 52);

assert(q48 && q49 && q50 && q51 && q52, 'All 5 questions must exist');

assert.strictEqual(q48.passageId, p1Id, 'Q48 must belong to Passage 1');
assert.strictEqual(q49.passageId, p1Id, 'Q49 must belong to Passage 1');
assert.strictEqual(q50.passageId, p1Id, 'Q50 must belong to Passage 1');
assert.strictEqual(q51.passageId, p1Id, 'Q51 must belong to Passage 1');
assert.strictEqual(q52.passageId, p2Id, 'Q52 must belong to Passage 2');

assert.strictEqual(q48.correctAnswer, 'B');
assert.strictEqual(q49.correctAnswer, 'C');
assert.strictEqual(q50.correctAnswer, 'A');
assert.strictEqual(q51.correctAnswer, 'D');
assert.strictEqual(q52.correctAnswer, 'C');

assert.strictEqual(result.passages[0].passageJa, passage1Ja);
assert.strictEqual(result.passages[0].passageVi, passage1Vi);
assert.strictEqual(result.passages[1].passageJa, passage2Ja);
assert.strictEqual(result.passages[1].passageVi, passage2Vi);

console.log('Q48 Topic:', q48.topic);
console.log('Q52 Topic:', q52.topic);
assert.strictEqual(q48.topic, '問題9・紅葉の異変');
assert.strictEqual(q52.topic, '問題10（一）・言葉の定義づけ');

console.log('ALL READING EXAM PARSER TESTS PASSED!');
