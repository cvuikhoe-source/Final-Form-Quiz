import * as XLSX from 'xlsx';
import assert from 'assert';
import { parseVocabExamWorkbookBuffer } from '../src/lib/vocabExamExcelParser.js';

// Build sample workbook
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
XLSX.utils.book_append_sheet(wb, ws, 'Câu hỏi');

const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
const res = parseVocabExamWorkbookBuffer(buffer);

console.log('Success:', res.success);
console.log('Total valid questions:', res.validQuestions.length);
console.log('Errors:', res.errors);

assert.strictEqual(res.success, true);
assert.strictEqual(res.validQuestions.length, 2);

// Check Question 1 deep equality
const q1 = res.validQuestions[0];
assert.strictEqual(q1.questionNo, 1);
assert.strictEqual(q1.questionText, '[1] 状況を「詳細」に書いてください。「詳細」の読み方として最もよいものはどれですか。');
assert.strictEqual(q1.optionA, 'そうざい');
assert.strictEqual(q1.optionB, 'そうさい');
assert.strictEqual(q1.optionC, 'しょうざい');
assert.strictEqual(q1.optionD, 'しょうさい');
assert.strictEqual(q1.correctAnswer, 'D');
assert.strictEqual(q1.timeSeconds, 30);
assert.strictEqual(q1.optionDetails.A.han_viet, 'A. そうざい【惣菜】(Tổng thái): món ăn làm sẵn, thức ăn phụ.');
assert.strictEqual(q1.optionDetails.B.han_viet, 'B. そうさい【総裁】(Tổng tài): tổng tài, người đứng đầu một tổ chức.');
assert.strictEqual(q1.optionDetails.C.han_viet, 'C. しょうざい【商材】(Thương tài): mặt hàng, sản phẩm hoặc tư liệu dùng trong kinh doanh.');
assert.strictEqual(q1.optionDetails.D.han_viet, 'D. しょうさい【詳細】(Tường tế): chi tiết, tỉ mỉ — đây là cách đọc đúng của 「詳細」 trong câu.');

assert.strictEqual(q1.optionDetails.A.meaning, 'A. そうざい（惣菜）: món ăn chế biến sẵn, thức ăn phụ bán sẵn.');
assert.strictEqual(q1.optionDetails.D.meaning, 'D. しょうさい（詳細）: chi tiết, cụ thể, tỉ mỉ — nghĩa đúng của từ trong câu hỏi.');

assert.strictEqual(q1.optionDetails.A.example_jp, '惣菜（そうざい）: 仕事で帰りが遅くなった日は、スーパーで惣菜を買って夕食を済ませることが多い。');
assert.strictEqual(q1.optionDetails.A.example_vi, 'Những ngày đi làm về muộn, tôi thường mua đồ ăn làm sẵn ở siêu thị để dùng bữa tối.');
assert.strictEqual(q1.optionDetails.D.example_jp, '詳細（しょうさい）: 契約を結ぶ前に、条件の詳細を担当者に確認しておいたほうがいい。');
assert.strictEqual(q1.optionDetails.D.example_vi, 'Trước khi ký hợp đồng, nên xác nhận trước các chi tiết điều kiện với người phụ trách.');

// Check Question 2 deep equality
const q2 = res.validQuestions[1];
assert.strictEqual(q2.questionNo, 2);
assert.strictEqual(q2.questionText, '[2] 「分析」には少し時間がかかります。「分析」の読み方として最もよいものはどれですか。');
assert.strictEqual(q2.optionA, 'ぶんせき');
assert.strictEqual(q2.optionB, 'ぶんかい');
assert.strictEqual(q2.optionC, 'ぶんせつ');
assert.strictEqual(q2.optionD, 'ぶんかつ');
assert.strictEqual(q2.correctAnswer, 'A');
assert.strictEqual(q2.timeSeconds, 30);
assert.strictEqual(q2.optionDetails.A.han_viet, 'A. ぶんせき【分析】(Phân tích): phân tích, chia nhỏ để xem xét — đáp án đúng.');
assert.strictEqual(q2.optionDetails.A.example_jp, '分析（ぶんせき）: 売上が落ちた原因を分析したところ、広告の効果が弱いことが分かった。');
assert.strictEqual(q2.optionDetails.A.example_vi, 'Sau khi phân tích nguyên nhân doanh số giảm, chúng tôi phát hiện quảng cáo kém hiệu quả.');

console.log('✅ ALL DEEP EQUALITY CHECKS PASSED FOR QUESTION 1 & QUESTION 2!');

