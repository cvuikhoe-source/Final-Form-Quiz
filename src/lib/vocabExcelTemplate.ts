import * as XLSX from 'xlsx';

export const VOCAB_REQUIRED_HEADERS = [
  'id',
  'vocabulary',
  'reading_hiragana',
  'meaning_vi',
  'example_jp_1',
  'example_vi_1',
] as const;

export const VOCAB_ALL_HEADERS = [
  'id',
  'vocabulary',
  'reading_hiragana',
  'meaning_vi',
  'han_viet',
  'kanji_memory_hint',
  'example_jp_1',
  'example_vi_1',
  'example_reading_1',
  'example_jp_2',
  'example_reading_2',
  'example_vi_2',
  'jlpt_level',
  'word_type',
  'reading_romaji',
  'onyomi',
  'kunyomi',
  'tags',
  'related_words',
  'lesson_name',
  'active',
  // Phân tích Kanji 1
  'kanji_1',
  'kanji_1_han_viet',
  'kanji_1_meaning',
  'kanji_1_onyomi',
  'kanji_1_kunyomi',
  // Phân tích Kanji 2
  'kanji_2',
  'kanji_2_han_viet',
  'kanji_2_meaning',
  'kanji_2_onyomi',
  'kanji_2_kunyomi',
  // Phân tích Kanji 3
  'kanji_3',
  'kanji_3_han_viet',
  'kanji_3_meaning',
  'kanji_3_onyomi',
  'kanji_3_kunyomi',
  // Phân tích Kanji 4
  'kanji_4',
  'kanji_4_han_viet',
  'kanji_4_meaning',
  'kanji_4_onyomi',
  'kanji_4_kunyomi',
] as const;

/**
 * Tạo workbook mẫu Excel nhập Từ vựng cho QuizForms
 * Gồm:
 * 1. Sheet `Vocabulary_Data`: Chứa header chuẩn, dòng 1-2 ghi chú, dòng 4 tiêu đề, bắt đầu nhập từ dòng 5.
 * 2. Sheet `Instructions`: Hướng dẫn tiếng Việt chi tiết về quy tắc, cột bắt buộc, ví dụ minh họa kèm phân tích Kanji.
 */
export function buildVocabExcelTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // ─── Sheet 1: Vocabulary_Data ──────────────────────────────
  const vocabDataRows: (string | number)[][] = [
    ['QuizForms - Mẫu nhập dữ liệu Từ vựng (Vui lòng đọc sheet "Instructions" để xem hướng dẫn chi tiết)'],
    ['Lưu ý: Các cột có dấu (*) là bắt buộc. Không sửa hoặc xóa tiêu đề tại Hàng 4. Nhập dữ liệu từ Hàng 5 trở đi.'],
    [], // Row 3 trống
    [...VOCAB_ALL_HEADERS], // Row 4 (index 3): Headers
    // Sheet Vocabulary_Data không để dòng dữ liệu mẫu để tránh import nhầm vào hệ thống.
  ];

  const wsVocab = XLSX.utils.aoa_to_sheet(vocabDataRows);
  wsVocab['!cols'] = [
    { wch: 10 }, // id
    { wch: 20 }, // vocabulary
    { wch: 22 }, // reading_hiragana
    { wch: 26 }, // meaning_vi
    { wch: 22 }, // han_viet
    { wch: 38 }, // kanji_memory_hint
    { wch: 38 }, // example_jp_1
    { wch: 38 }, // example_vi_1
    { wch: 32 }, // example_reading_1
    { wch: 38 }, // example_jp_2
    { wch: 32 }, // example_reading_2
    { wch: 38 }, // example_vi_2
    { wch: 12 }, // jlpt_level
    { wch: 16 }, // word_type
    { wch: 18 }, // reading_romaji
    { wch: 16 }, // onyomi
    { wch: 16 }, // kunyomi
    { wch: 22 }, // tags
    { wch: 26 }, // related_words
    { wch: 26 }, // lesson_name
    { wch: 10 }, // active
    // Kanji 1
    { wch: 10 }, // kanji_1
    { wch: 18 }, // kanji_1_han_viet
    { wch: 26 }, // kanji_1_meaning
    { wch: 16 }, // kanji_1_onyomi
    { wch: 16 }, // kanji_1_kunyomi
    // Kanji 2
    { wch: 10 }, // kanji_2
    { wch: 18 }, // kanji_2_han_viet
    { wch: 26 }, // kanji_2_meaning
    { wch: 16 }, // kanji_2_onyomi
    { wch: 16 }, // kanji_2_kunyomi
    // Kanji 3
    { wch: 10 }, // kanji_3
    { wch: 18 }, // kanji_3_han_viet
    { wch: 26 }, // kanji_3_meaning
    { wch: 16 }, // kanji_3_onyomi
    { wch: 16 }, // kanji_3_kunyomi
    // Kanji 4
    { wch: 10 }, // kanji_4
    { wch: 18 }, // kanji_4_han_viet
    { wch: 26 }, // kanji_4_meaning
    { wch: 16 }, // kanji_4_onyomi
    { wch: 16 }, // kanji_4_kunyomi
  ];
  XLSX.utils.book_append_sheet(wb, wsVocab, 'Vocabulary_Data');

  // ─── Sheet 2: Instructions ─────────────────────────────────
  const instructionRows: (string | number)[][] = [
    ['HƯỚNG DẪN NHẬP DỮ LIỆU TỪ VỰNG QUIZFORMS'],
    [''],
    ['I. QUY TẮC CHUNG'],
    ['1. Định dạng file', 'Chỉ sử dụng file có đuôi mở rộng là .xlsx.'],
    ['2. Tên Sheet dữ liệu', 'Sheet dữ liệu phải đặt tên là "Vocabulary_Data". Không đổi tên sheet này.'],
    ['3. Dòng tiêu đề (Headers)', 'Hàng 4 là dòng tiêu đề (Headers). Tuyệt đối không xóa hoặc thay đổi tên các cột ở Hàng 4.'],
    ['4. Nhập dữ liệu', 'Dữ liệu bắt đầu nhập từ Hàng 5 trở đi. Mỗi dòng tương ứng với 1 từ vựng.'],
    ['5. Bỏ qua dòng trống', 'Các dòng hoàn toàn trống sẽ được hệ thống tự động bỏ qua khi nhập.'],
    ['6. Không gộp ô', 'Tuyệt đối không dùng tính năng Merge Cells (gộp ô) trong sheet dữ liệu.'],
    ['7. Thư mục lưu trữ', 'Không nhập cột folder_id. Hệ thống tự động gán từ vựng vào Thư mục đang chọn trên giao diện.'],
    ['8. Gom nhóm bài học', 'Nếu muốn gom các từ vựng vào bài học cụ thể, hãy điền tên bài vào cột "lesson_name" (VD: "Bài 1 - Gia đình").'],
    [''],
    ['II. QUY CÁCH VÀ MÔ TẢ CHI TIẾT TỪNG CỘT'],
    ['Tên cột', 'Bắt buộc', 'Kiểu dữ liệu', 'Mô tả & Quy tắc', 'Ví dụ minh họa'],
    ['id', 'Bắt buộc (*)', 'Chữ / Số', 'Mã định danh duy nhất cho từ vựng trong bài học', 'v001'],
    ['vocabulary', 'Bắt buộc (*)', 'Tiếng Nhật', 'Từ vựng tiếng Nhật bằng Kanji hoặc Kana', '特色'],
    ['reading_hiragana', 'Bắt buộc (*)', 'Hiragana', 'Cách đọc chuẩn bằng chữ Hiragana', 'とくしょく'],
    ['meaning_vi', 'Bắt buộc (*)', 'Tiếng Việt', 'Ý nghĩa của từ vựng bằng tiếng Việt', 'Đặc sắc, đặc điểm nổi bật'],
    ['han_viet', 'Tùy chọn', 'Tiếng Việt in hoa', 'Âm Hán Việt toàn từ (giúp người học liên tưởng ngữ nghĩa)', 'ĐẶC SẮC'],
    ['kanji_memory_hint', 'Tùy chọn', 'Tiếng Việt', 'Gợi ý ghi nhớ hoặc câu chuyện liên tưởng kanji', 'Chữ ĐẶC (con bò đặc biệt) kết hợp SẮC (màu sắc nổi trội)'],
    ['example_jp_1', 'Bắt buộc (*)', 'Tiếng Nhật', 'Câu ví dụ thứ nhất bằng tiếng Nhật', 'この街には古い歴史という特色がある。'],
    ['example_vi_1', 'Bắt buộc (*)', 'Tiếng Việt', 'Dịch nghĩa tiếng Việt của câu ví dụ 1', 'Thành phố này có nét đặc sắc là lịch sử lâu đời.'],
    ['example_reading_1', 'Tùy chọn', 'Hiragana', 'Cách đọc Hiragana cho câu ví dụ 1', 'このまちにはふるいれきしというとくしょくがある。'],
    ['example_jp_2', 'Tùy chọn', 'Tiếng Nhật', 'Câu ví dụ thứ hai bằng tiếng Nhật (nếu có)', '製品の特色を説明する。'],
    ['example_reading_2', 'Tùy chọn', 'Hiragana', 'Cách đọc Hiragana cho câu ví dụ 2', 'せいひんのとくしょくをせつめいする。'],
    ['example_vi_2', 'Tùy chọn', 'Tiếng Việt', 'Dịch nghĩa tiếng Việt của câu ví dụ 2', 'Giải thích các đặc sắc của sản phẩm.'],
    ['jlpt_level', 'Tùy chọn', 'Text', 'Cấp độ JLPT: N5, N4, N3, N2, N1', 'N2'],
    ['word_type', 'Tùy chọn', 'Text', 'Loại từ: Danh từ, Động từ, Tính từ đuôi い/な...', 'Danh từ'],
    ['reading_romaji', 'Tùy chọn', 'Text', 'Cách đọc phiên âm Romaji', 'tokushoku'],
    ['onyomi', 'Tùy chọn', 'Katakana', 'Âm On của từ (nếu có)', 'トク, ショク'],
    ['kunyomi', 'Tùy chọn', 'Hiragana', 'Âm Kun của từ (nếu có)', 'いろ'],
    ['tags', 'Tùy chọn', 'Text', 'Thẻ phân loại bài học', 'Đặc điểm, Xã hội'],
    ['related_words', 'Tùy chọn', 'Text', 'Các từ liên quan, phân cách bằng dấu gạch đứng |', '特徴|特技|色彩'],
    ['lesson_name', 'Tùy chọn', 'Text', 'Tên bài học để gom nhóm nhiều từ vào cùng bài', 'Bài 15: Đặc điểm & Tính chất'],
    ['active', 'Tùy chọn', 'TRUE / FALSE', 'TRUE = hiển thị, FALSE = tạm ẩn. Mặc định để trống coi là TRUE', 'TRUE'],
    ['kanji_1', 'Tùy chọn', 'Chữ Hán đơn', 'Chữ Kanji thứ 1 trong từ', '特'],
    ['kanji_1_han_viet', 'Tùy chọn', 'Text in hoa', 'Âm Hán Việt của Kanji 1', 'ĐẶC'],
    ['kanji_1_meaning', 'Tùy chọn', 'Tiếng Việt', 'Ý nghĩa của Kanji 1', 'Đặc biệt, riêng biệt'],
    ['kanji_1_onyomi', 'Tùy chọn', 'Katakana', 'Âm On của Kanji 1', 'トク'],
    ['kanji_1_kunyomi', 'Tùy chọn', 'Hiragana', 'Âm Kun của Kanji 1', ''],
    ['kanji_2', 'Tùy chọn', 'Chữ Hán đơn', 'Chữ Kanji thứ 2 trong từ', '色'],
    ['kanji_2_han_viet', 'Tùy chọn', 'Text in hoa', 'Âm Hán Việt của Kanji 2', 'SẮC'],
    ['kanji_2_meaning', 'Tùy chọn', 'Tiếng Việt', 'Ý nghĩa của Kanji 2', 'Màu sắc, sắc thái'],
    ['kanji_2_onyomi', 'Tùy chọn', 'Katakana', 'Âm On của Kanji 2', 'ショク, シキ'],
    ['kanji_2_kunyomi', 'Tùy chọn', 'Hiragana', 'Âm Kun của Kanji 2', 'いろ'],
    ['kanji_3..4', 'Tùy chọn', '...', 'Tương tự cho các từ có 3 hoặc 4 chữ Kanji', '...'],
    [''],
    ['III. VÍ DỤ MINH HỌA MẪU DỮ LIỆU ĐIỀN VÀO HÀNG 5 VÀ 6'],
    ['Dòng mẫu 1 (Từ vựng Kanji có phân tích từng chữ):'],
    ['id', 'vocabulary', 'reading_hiragana', 'meaning_vi', 'han_viet', 'kanji_memory_hint', 'kanji_1', 'kanji_1_han_viet', 'kanji_1_meaning', 'kanji_2', 'kanji_2_han_viet', 'kanji_2_meaning'],
    ['v001', '特色', 'とくしょく', 'Đặc sắc, điểm nổi bật', 'ĐẶC SẮC', 'Ghép từ ĐẶC (đặc biệt) và SẮC (màu sắc nét)', '特', 'ĐẶC', 'Đặc biệt, riêng biệt', '色', 'SẮC', 'Màu sắc, diện mạo'],
    [''],
    ['Dòng mẫu 2 (Từ vựng cơ bản thông thường):'],
    ['id', 'vocabulary', 'reading_hiragana', 'meaning_vi', 'example_jp_1', 'example_vi_1', 'jlpt_level', 'word_type'],
    ['v002', '食べる', 'たべる', 'Ăn', '朝ごはんを食べます。', 'Tôi ăn bữa sáng.', 'N5', 'Động từ nhóm 2'],
    [''],
    ['Dòng mẫu 3 (Từ vựng danh từ trường học):'],
    ['id', 'vocabulary', 'reading_hiragana', 'meaning_vi', 'example_jp_1', 'example_vi_1', 'jlpt_level', 'word_type'],
    ['v003', '学校', 'がっこう', 'Trường học', '毎朝、学校へ行きます。', 'Mỗi sáng tôi đều đến trường.', 'N5', 'Danh từ'],
  ];

  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionRows);
  wsInstructions['!cols'] = [
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 50 },
    { wch: 42 },
  ];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

  return wb;
}

/**
 * Tải file Excel mẫu về máy tính người dùng
 */
export function downloadVocabExcelTemplate(fileName = 'QuizForms_Mau_Nhap_Tu_Vung.xlsx'): void {
  const wb = buildVocabExcelTemplateWorkbook();
  XLSX.writeFile(wb, fileName);
}
