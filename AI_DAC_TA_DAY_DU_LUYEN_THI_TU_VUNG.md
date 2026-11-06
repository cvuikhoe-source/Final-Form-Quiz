# ĐẶC TẢ ĐẦY ĐỦ: BÀI HỌC LUYỆN THI TỪ VỰNG TỪ FILE EXCEL

## 1. Mục đích tài liệu

Tài liệu này mô tả đầy đủ nội dung và cấu trúc của workbook nguồn `01-25_tao Form.xlsx` để AI có thể sửa code mà không cần tự mở file Excel.

AI phải triển khai chức năng **Nhập đề luyện thi Từ vựng** theo đúng nguyên tắc:

```text
1 file Excel = 1 Lesson luyện thi Từ vựng
N hàng trong sheet Câu hỏi = N câu hỏi trong cùng Lesson
```

Tuyệt đối không tạo một Lesson cho mỗi hàng Excel.

---

## 2. Workbook nguồn

Workbook có 3 sheet:

1. `Câu hỏi`: dữ liệu đầu vào chính.
2. `Luyện thi`: giao diện mẫu làm bài và xem giải thích.
3. `Prompt`: mô tả yêu cầu UI/UX và nguyên tắc xử lý dữ liệu.

AI không cần đọc workbook nữa. Toàn bộ thông tin cần thiết đã được mô tả trong tài liệu này.

---

# PHẦN A. SHEET `Câu hỏi`

## 3. Cấu trúc cột

Dòng đầu tiên là header. Mỗi dòng tiếp theo là một câu hỏi.

### Cột A: `Câu hỏi`

Chứa câu hỏi tiếng Nhật, có số câu ở đầu.

Ví dụ:

```text
[1] 状況を「詳細」に書いてください。「詳細」の読み方として最もよいものはどれですか。
```

### Cột B: `Đáp án A (Tam giác)`

Nội dung lựa chọn A.

### Cột C: `Đáp án B (Thoi)`

Nội dung lựa chọn B.

### Cột D: `Đáp án C (Tròn)`

Nội dung lựa chọn C.

### Cột E: `Đáp án D (Vuông)`

Nội dung lựa chọn D.

### Cột F: `Đáp án đúng (A/B/C/D)`

Chỉ nhận một trong bốn giá trị:

```text
A
B
C
D
```

### Cột G: `Thời gian (giây)`

Thời gian gợi ý cho mỗi câu. Dữ liệu mẫu là `30` giây.

### Cột H: `Giải thích từ hán việt của các đáp án`

Một ô chứa nhiều dòng. Mỗi dòng tương ứng với một lựa chọn A/B/C/D.

Ví dụ:

```text
A. そうざい【惣菜】(Tổng thái): món ăn làm sẵn, thức ăn phụ.
B. そうさい【総裁】(Tổng tài): tổng tài, người đứng đầu một tổ chức.
C. しょうざい【商材】(Thương tài): mặt hàng, sản phẩm hoặc tư liệu dùng trong kinh doanh.
D. しょうさい【詳細】(Tường tế): chi tiết, tỉ mỉ — đây là cách đọc đúng của 「詳細」 trong câu.
```

### Cột I: `Nghĩã củacác đáp án`

Một ô chứa nhiều dòng. Mỗi dòng tương ứng với nghĩa của lựa chọn A/B/C/D.

### Cột J: `các câu ví dụ minh họa của từ trong đáp án`

Một ô chứa dữ liệu ví dụ cho cả bốn đáp án. Mỗi lựa chọn gồm:

1. Một dòng ví dụ tiếng Nhật.
2. Một dòng dịch tiếng Việt bắt đầu bằng ký hiệu `→`.

Parser phải ghép đúng ví dụ và bản dịch cho từng lựa chọn.

---

## 4. Dữ liệu mẫu chính xác: Câu 1

### Câu hỏi

```text
[1] 状況を「詳細」に書いてください。「詳細」の読み方として最もよいものはどれですか。
```

### Các lựa chọn

```text
A: そうざい
B: そうさい
C: しょうざい
D: しょうさい
```

### Đáp án đúng

```text
D
```

### Thời gian

```text
30 giây
```

### Hán Việt và giải thích từng đáp án

```text
A. そうざい【惣菜】(Tổng thái): món ăn làm sẵn, thức ăn phụ.
B. そうさい【総裁】(Tổng tài): tổng tài, người đứng đầu một tổ chức.
C. しょうざい【商材】(Thương tài): mặt hàng, sản phẩm hoặc tư liệu dùng trong kinh doanh.
D. しょうさい【詳細】(Tường tế): chi tiết, tỉ mỉ — đây là cách đọc đúng của 「詳細」 trong câu.
```

### Nghĩa từng đáp án

```text
A. そうざい（惣菜）: món ăn chế biến sẵn, thức ăn phụ bán sẵn.
B. そうさい（総裁）: tổng tài, người đứng đầu một tổ chức hoặc cơ quan.
C. しょうざい（商材）: mặt hàng, sản phẩm hoặc tư liệu dùng để kinh doanh.
D. しょうさい（詳細）: chi tiết, cụ thể, tỉ mỉ — nghĩa đúng của từ trong câu hỏi.
```

### Ví dụ và bản dịch

```text
A. 惣菜（そうざい）: 仕事で帰りが遅くなった日は、スーパーで惣菜を買って夕食を済ませることが多い。
→ Những ngày đi làm về muộn, tôi thường mua đồ ăn làm sẵn ở siêu thị để dùng bữa tối.

B. 総裁（そうさい）: 新しい総裁には、組織の改革を進める強い指導力が求められている。
→ Vị tổng tài mới được kỳ vọng có năng lực lãnh đạo mạnh mẽ để thúc đẩy cải cách tổ chức.

C. 商材（しょうざい）: 市場の需要を十分に調査したうえで、オンライン販売に適した商材を選ぶべきだ。
→ Sau khi nghiên cứu kỹ nhu cầu thị trường, nên lựa chọn mặt hàng phù hợp để bán trực tuyến.

D. 詳細（しょうさい）: 契約を結ぶ前に、条件の詳細を担当者に確認しておいたほうがいい。
→ Trước khi ký hợp đồng, nên xác nhận trước các chi tiết điều kiện với người phụ trách.
```

---

## 5. Dữ liệu mẫu chính xác: Câu 2

### Câu hỏi

```text
[2] 「分析」には少し時間がかかります。「分析」の読み方として最もよいものはどれですか。
```

### Các lựa chọn

```text
A: ぶんせき
B: ぶんかい
C: ぶんせつ
D: ぶんかつ
```

### Đáp án đúng

```text
A
```

### Thời gian

```text
30 giây
```

### Hán Việt và giải thích từng đáp án

```text
A. ぶんせき【分析】(Phân tích): phân tích, chia nhỏ để xem xét — đáp án đúng.
B. ぶんかい【分解】(Phân giải): tháo rời, phân rã; không phải cách đọc của 分析.
C. ぶんせつ【文節】(Văn tiết): đơn vị ngữ pháp trong câu; không phải cách đọc của 分析.
D. ぶんかつ【分割】(Phân cát): phân chia, chia cắt; không phải cách đọc của 分析.
```

### Nghĩa từng đáp án

```text
A. ぶんせき【分析】(Phân tích): phân tích, chia nhỏ để xem xét
B. ぶんかい【分解】(Phân giải): tháo rời, phân rã; không phải cách đọc của 分析.
C. ぶんせつ【文節】(Văn tiết): đơn vị ngữ pháp trong câu; không phải cách đọc của 分析.
D. ぶんかつ【分割】(Phân cát): phân chia, chia cắt; không phải cách đọc của 分析.
```

### Ví dụ và bản dịch

```text
A. 分析（ぶんせき）: 売上が落ちた原因を分析したところ、広告の効果が弱いことが分かった。
→ Sau khi phân tích nguyên nhân doanh số giảm, chúng tôi phát hiện quảng cáo kém hiệu quả.

B. 分解（ぶんかい）: 故障した機械を分解して、部品を一つずつ確認した。
→ Tôi tháo rời máy hỏng và kiểm tra từng linh kiện.

C. 文節（ぶんせつ）: この文を文節に分けると、意味が理解しやすくなる。
→ Chia câu này thành các đơn vị ngữ pháp sẽ giúp dễ hiểu nghĩa hơn.

D. 分割（ぶんかつ）: 支払いは三回に分割することも可能です。
→ Khoản thanh toán cũng có thể được chia thành ba lần.
```

---

# PHẦN B. QUY TẮC PARSER

## 6. Quy tắc tách dữ liệu nhiều dòng

Parser không được chỉ lấy cả ô H/I/J làm một chuỗi chung.

### Cột H và I

Tách theo dòng bắt đầu bằng:

```text
A.
B.
C.
D.
```

Kết quả phải map vào đúng lựa chọn tương ứng.

### Cột J

Tách theo nhóm:

```text
A. [Ví dụ tiếng Nhật]
→ [Dịch tiếng Việt]
B. [Ví dụ tiếng Nhật]
→ [Dịch tiếng Việt]
C. [Ví dụ tiếng Nhật]
→ [Dịch tiếng Việt]
D. [Ví dụ tiếng Nhật]
→ [Dịch tiếng Việt]
```

Nếu một trường bị thiếu:

- Không làm parser crash.
- Ghi nhận lỗi/cảnh báo đúng dòng.
- Hiển thị ô trống trong preview nếu đây là trường tùy chọn.
- Không tráo dữ liệu sang đáp án khác.

### Chuẩn hóa câu hỏi

Parser có thể tách số câu `[1]`, `[2]` thành `question_no`, nhưng phải giữ nguyên toàn bộ nội dung câu hỏi tiếng Nhật.

### Validation

- Câu hỏi không được rỗng.
- Bốn đáp án A/B/C/D không được rỗng.
- Đáp án đúng phải thuộc A/B/C/D.
- Thời gian phải là số dương.
- Phải giữ nguyên Unicode Nhật-Việt.

---

# PHẦN C. MÔ HÌNH DỮ LIỆU

## 7. Lesson

Một lần import tạo một Lesson duy nhất:

```text
lesson_type: vocabulary_exam
category_id: cat-vocab
```

Lesson lưu:

- title
- description
- subject_id bắt buộc
- jlpt_level
- folder_id
- status
- created_by
- exam_questions_count

Teacher tạo/import Lesson thì Teacher trở thành owner.

## 8. VocabularyExamQuestion

Mỗi dòng Excel tạo một câu hỏi:

```text
id
lesson_id
question_no
question_text
option_a
option_b
option_c
option_d
correct_answer
time_seconds
option_details
sort_order
active
created_at
updated_at
```

### Cấu trúc `option_details`

```json
{
  "A": {
    "han_viet": "...",
    "meaning": "...",
    "example_jp": "...",
    "example_vi": "..."
  },
  "B": {
    "han_viet": "...",
    "meaning": "...",
    "example_jp": "...",
    "example_vi": "..."
  },
  "C": {
    "han_viet": "...",
    "meaning": "...",
    "example_jp": "...",
    "example_vi": "..."
  },
  "D": {
    "han_viet": "...",
    "meaning": "...",
    "example_jp": "...",
    "example_vi": "..."
  }
}
```

Có thể tái sử dụng bảng `exam_questions` nếu thêm trường phân loại đề rõ ràng, ví dụ:

```text
exam_type = vocabulary
```

Không làm hỏng bài luyện thi Ngữ pháp hiện hữu.

---

# PHẦN D. GIAO DIỆN IMPORT

## 9. Nút nhập đề

Trong tab `Từ vựng`, thêm nút:

```text
Nhập đề luyện thi
```

Luồng import:

1. Chọn hoặc kéo thả Excel.
2. Parser đọc sheet `Câu hỏi`.
3. Preview và validation.
4. Nhập metadata Lesson.
5. Xác nhận Import.

Metadata bắt buộc:

- Tên bài học.
- Môn học.
- Folder đích.

Metadata tùy chọn:

- Mô tả.
- JLPT level.
- Trạng thái.

Nếu chưa có môn học:

```text
Chưa có môn học. Vui lòng tạo môn học trước.
```

Admin được thêm môn mới. Teacher chỉ chọn môn trong `allowed_subjects`.

Preview phải hiển thị đầy đủ nội dung của từng câu và từng lựa chọn.

Chỉ báo thành công khi Supabase xác nhận:

```text
1 Lesson đã được tạo
N câu hỏi đã được lưu
Tất cả câu hỏi dùng cùng lesson_id
Owner grant đã tồn tại
Subject đã được gắn
Card bài học đã xuất hiện sau refetch
```

Không dùng LocalStorage để giả thành công.

---

# PHẦN E. GIAO DIỆN LÀM BÀI

## 10. Bố cục

Dựa theo sheet `Luyện thi`:

### Khu vực câu hỏi phía trên

- Sticky/cố định trong vùng bài học.
- Tên Lesson.
- JLPT level.
- Câu X/N.
- Thời gian gợi ý.
- Điểm đúng/sai.
- Câu hỏi tiếng Nhật.
- Bốn lựa chọn A/B/C/D dạng thẻ lớn.

### Khu vực giải thích phía dưới

- Cuộn độc lập.
- Trước khi chọn đáp án: ẩn hoàn toàn.
- Sau khi chọn: hiển thị đúng/sai và bốn khối phân tích A/B/C/D.

Mỗi khối phân tích gồm:

- Nội dung đáp án.
- Hán Việt.
- Nghĩa.
- Ví dụ tiếng Nhật.
- Dịch tiếng Việt.

Khối đáp án đúng có màu xanh và nhãn:

```text
ĐÁP ÁN ĐÚNG
```

### Phản hồi

- Chọn đúng: thẻ lựa chọn chuyển xanh.
- Chọn sai: lựa chọn đã chọn chuyển đỏ và đáp án đúng chuyển xanh.
- Cho phép làm lại.

### Điều hướng

- Câu trước.
- Câu tiếp.
- Danh sách số câu.
- Nộp bài.
- Tổng kết.
- Xem câu sai.
- Làm lại toàn bộ.

### Lưu tiến độ

Lưu theo:

```text
user_id + lesson_id + question_id
```

---

# PHẦN F. CARD BÀI HỌC

## 11. Card luyện thi Từ vựng

Hiển thị:

- Tên Lesson.
- Badge `Luyện thi Từ vựng`.
- JLPT level.
- Môn học.
- Tổng số câu.
- Tiến độ.
- Số câu đúng.
- Folder.
- Menu ba chấm.

Khi mở `vocabulary_exam`, mở màn hình luyện thi, không mở Flashcard.

Bài từ vựng thường vẫn mở Flashcard như cũ.

Không làm mất 135 VocabularyItem hiện tại.

---

# PHẦN G. LỊCH HỌC HÀNG LOẠT

## 12. Áp dụng cho mọi loại bài

`Lịch học hàng loạt` phải hoạt động với:

- Ngữ pháp.
- Từ vựng.
- Luyện thi Ngữ pháp.
- Luyện thi Từ vựng.
- Nghe hiểu.
- Đọc hiểu.

Luồng:

1. Chọn nhiều Lesson.
2. Bấm `Lịch học hàng loạt`.
3. Chọn lớp và lịch.
4. Xem danh sách bài áp dụng.
5. Xác nhận.
6. Cập nhật hàng loạt.
7. Tự clear selection sau thành công.

Teacher chỉ lên lịch bài có quyền owner/manager và chỉ chọn lớp được phân công.

Backend phải chặn IDOR.

---

# PHẦN H. BỎ NÚT BỎ CHỌN HÀNG LOẠT

## 13. Thành phần cần bỏ

Xóa trên mọi tab:

```text
Bỏ chọn hàng loạt
Bỏ chọn
```

nếu nút đó chỉ dùng để clear toàn bộ selection.

Phải giữ:

- Checkbox từng bài.
- Chọn tất cả.
- Lịch học hàng loạt.
- Di chuyển hàng loạt nếu còn sử dụng.

Người dùng bỏ chọn bằng checkbox từng bài hoặc toggle `Chọn tất cả`.

Sau thao tác hàng loạt thành công, tự reset lựa chọn.

---

# PHẦN I. SỬA NÚT QUA BÀI NGỮ PHÁP

## 14. Logic đúng

### Còn GrammarItem trong cùng Lesson

- Hiển thị `Mục tiếp theo`.
- Không disabled.
- Chuyển sang GrammarItem tiếp theo.
- Cuộn về đầu trang.
- Lưu tiến độ mục hiện tại.

### Hết GrammarItem nhưng còn Lesson Ngữ pháp tiếp theo

- Hiển thị `Bài tiếp theo`.
- Hiển thị tên bài kế tiếp.
- Mở Lesson kế tiếp.

Lesson kế tiếp phải:

- Thuộc `cat-grammar`.
- Không phải Lesson hiện tại.
- Có subject hợp lệ.
- Người dùng có quyền Lesson ACL.
- Đúng trạng thái hiển thị.
- Theo thứ tự hiện tại.

### Thực sự hết

Chỉ hiển thị `Đã hết bài` và disabled khi:

- Đang ở GrammarItem cuối.
- Không còn Lesson Ngữ pháp tiếp theo hợp lệ.

Cần kiểm tra:

- `siblingLessons`.
- Filter category/subject/ACL.
- `findIndex` trả về -1.
- Callback mở Lesson tiếp theo.
- Điều kiện disabled cũ.
- Logic có bỏ qua GrammarItem tiếp theo hay không.

Nút `Bài trước` phải hoạt động tương xứng.

---

# PHẦN J. PHÂN QUYỀN

## 15. Lesson ACL

- Admin quản lý tất cả.
- Teacher tạo/import thì trở thành owner.
- Teacher owner/manager được cấp bài cho lớp hoặc học sinh được phân công.
- Student chỉ thấy bài được cấp trực tiếp hoặc qua lớp.
- Lesson không có môn không hiển thị cho Student.
- Backend/RLS chặn truy cập trực tiếp khi không có quyền.
- LocalStorage không được dùng làm nguồn quyền.

---

# PHẦN K. KIỂM THỬ

## 16. Test import

- File 2 dòng tạo đúng 1 Lesson + 2 câu hỏi.
- File N dòng tạo đúng 1 Lesson + N câu hỏi.
- Tất cả câu hỏi có cùng lesson_id.
- Deep equality dữ liệu Câu 1 và Câu 2 với tài liệu này.
- Nội dung A/B/C/D không bị tráo.
- Refresh và đăng nhập lại vẫn thấy bài.
- Double-click không tạo trùng.
- Import lỗi không để Lesson rỗng.

## 17. Test giao diện làm bài

- Chưa trả lời không lộ phân tích.
- Chấm đúng/sai chính xác.
- Hiển thị đủ bốn khối giải thích.
- Lưu và nạp lại tiến độ.
- Làm lại hoạt động.
- Mobile không tràn ngang.

## 18. Test lịch học hàng loạt

- Chọn bài ở mọi loại nội dung.
- Modal hiển thị đúng danh sách.
- Chỉ cập nhật bài có quyền.
- Teacher không chọn lớp khác.
- Tự clear selection sau thành công.
- Không còn nút Bỏ chọn hàng loạt.

## 19. Test điều hướng Ngữ pháp

- Còn GrammarItem thì Mục tiếp theo hoạt động.
- Hết GrammarItem nhưng còn Lesson thì Bài tiếp theo hoạt động.
- Chỉ disabled khi thực sự hết.
- Không mở bài ngoài quyền.
- Không mở bài khác category.

## 20. Regression

- 135 VocabularyItem còn nguyên.
- Flashcard hoạt động.
- Import Từ vựng thường hoạt động.
- Import Ngữ pháp hoạt động.
- Luyện thi Ngữ pháp hoạt động.
- Lesson ACL và Subject không bị ảnh hưởng.

---

# PHẦN L. QUALITY GATE VÀ GIỚI HẠN

## 21. Chạy kiểm tra

```bash
npm run typecheck
npm run lint
npm run build
```

Chạy thêm test parser/import, luyện thi, lịch hàng loạt, điều hướng Ngữ pháp, Lesson ACL và regression.

Không báo PASS nếu tiến trình timeout, killed hoặc không có exit code cuối.

## 22. Không được làm

- Không xóa dữ liệu thật.
- Không đổi/reset mật khẩu.
- Không reset database.
- Không làm mất 135 VocabularyItem.
- Không làm hỏng Flashcard.
- Không khôi phục Folder ACL.
- Không commit.
- Không push.
- Không deploy.
- Không chạy migration production.
- Không tự sửa nội dung dữ liệu mẫu.
- Không tạo một Lesson cho mỗi hàng.

---

# PHẦN M. BÁO CÁO CUỐI

Báo cáo:

1. File/component/migration đã tạo hoặc sửa.
2. Cách bảo đảm 1 file chỉ tạo 1 Lesson.
3. Kết quả deep equality hai câu mẫu.
4. Cách lưu chi tiết A/B/C/D.
5. Giao diện luyện thi Từ vựng.
6. Cách lưu tiến độ.
7. Kết quả lịch học hàng loạt.
8. Vị trí đã gỡ Bỏ chọn hàng loạt.
9. Nguyên nhân nút Qua bài bị disabled.
10. Logic điều hướng mới.
11. Kết quả desktop/mobile.
12. Typecheck/lint/build/test với exit code thật.
13. Migration nào còn chờ triển khai.
14. Xác nhận không mất dữ liệu, không đổi mật khẩu, không commit/push/deploy.

Hãy thực hiện toàn bộ từ đầu đến cuối. Không cần đọc file Excel nữa vì toàn bộ nội dung cần thiết đã nằm trong tài liệu này.
