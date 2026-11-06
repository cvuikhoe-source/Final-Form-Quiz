import assert from 'assert';

function parseLabeledLines(text) {
  const result = { A: '', B: '', C: '', D: '' };
  if (!text || !text.trim()) return result;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let currentKey = null;
  for (const line of lines) {
    const match = line.match(/^([A-Da-d])[.:\)\s]\s*(.*)$/);
    if (match) {
      currentKey = match[1].toUpperCase();
      result[currentKey] = line;
    } else if (currentKey) {
      result[currentKey] += ' ' + line;
    }
  }
  return result;
}

function parseExampleGroups(text) {
  const result = {
    A: { example_jp: '', example_vi: '' },
    B: { example_jp: '', example_vi: '' },
    C: { example_jp: '', example_vi: '' },
    D: { example_jp: '', example_vi: '' },
  };
  if (!text || !text.trim()) return result;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let currentKey = null;
  let isTranslation = false;

  for (const line of lines) {
    const labelMatch = line.match(/^([A-Da-d])[.:\)\s]\s*(.*)$/);
    if (labelMatch) {
      currentKey = labelMatch[1].toUpperCase();
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

// Sample Question 1 inputs
const colH_q1 = `A. そうざい【惣菜】(Tổng thái): món ăn làm sẵn, thức ăn phụ.
B. そうさい【総裁】(Tổng tài): tổng tài, người đứng đầu một tổ chức.
C. しょうざい【商材】(Thương tài): mặt hàng, sản phẩm hoặc tư liệu dùng trong kinh doanh.
D. しょうさい【詳細】(Tường tế): chi tiết, tỉ mỉ — đây là cách đọc đúng của 「詳細」 trong câu.`;

const colI_q1 = `A. そうざい（惣菜）: món ăn chế biến sẵn, thức ăn phụ bán sẵn.
B. そうさい（総裁）: tổng tài, người đứng đầu một tổ chức hoặc cơ quan.
C. しょうざい（商材）: mặt hàng, sản phẩm hoặc tư liệu dùng để kinh doanh.
D. しょうさい（詳細）: chi tiết, cụ thể, tỉ mỉ — nghĩa đúng của từ trong câu hỏi.`;

const colJ_q1 = `A. 惣菜（そうざい）: 仕事で帰りが遅くなった日は、スーパーで惣菜を買って夕食を済ませることが多い。
→ Những ngày đi làm về muộn, tôi thường mua đồ ăn làm sẵn ở siêu thị để dùng bữa tối.

B. 総裁（そうさい）: 新しい総裁には、組織の改革を進める強い指導力が求められている。
→ Vị tổng tài mới được kỳ vọng có năng lực lãnh đạo mạnh mẽ để thúc đẩy cải cách tổ chức.

C. 商材（しょうざい）: 市場の需要を十分に調査したうえで、オンライン販売に適した商材を選ぶべきだ。
→ Sau khi nghiên cứu kỹ nhu cầu thị trường, nên lựa chọn mặt hàng phù hợp để bán trực tuyến.

D. 詳細（しょうさい）: 契約を結ぶ前に、条件の詳細を担当者に確認しておいたほうがいい。
→ Trước khi ký hợp đồng, nên xác nhận trước các chi tiết điều kiện với người phụ trách.`;

const parsedH = parseLabeledLines(colH_q1);
const parsedI = parseLabeledLines(colI_q1);
const parsedJ = parseExampleGroups(colJ_q1);

console.log('Parsed H:', parsedH);
console.log('Parsed I:', parsedI);
console.log('Parsed J:', parsedJ);

assert.strictEqual(parsedH.D, 'D. しょうさい【詳細】(Tường tế): chi tiết, tỉ mỉ — đây là cách đọc đúng của 「詳細」 trong câu.');
assert.strictEqual(parsedI.A, 'A. そうざい（惣菜）: món ăn chế biến sẵn, thức ăn phụ bán sẵn.');
assert.strictEqual(parsedJ.A.example_jp, '惣菜（そうざい）: 仕事で帰りが遅くなった日は、スーパーで惣菜を買って夕食を済ませることが多い。');
assert.strictEqual(parsedJ.A.example_vi, 'Những ngày đi làm về muộn, tôi thường mua đồ ăn làm sẵn ở siêu thị để dùng bữa tối.');
assert.strictEqual(parsedJ.D.example_vi, 'Trước khi ký hợp đồng, nên xác nhận trước các chi tiết điều kiện với người phụ trách.');
console.log('ALL TESTS PASSED!');
