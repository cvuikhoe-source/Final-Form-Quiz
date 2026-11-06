# ĐẶC TẢ AI: XÂY DỰNG BÀI HỌC LUYỆN THI ĐỌC HIỂU TỪ EXCEL

## 1. Nhiệm vụ

Hãy sửa trực tiếp project hiện tại để bổ sung chức năng **Bài học luyện thi Đọc hiểu JLPT** dựa trên đặc tả này.

Không cần đọc lại file Excel. Tài liệu này đã mô tả cấu trúc input, dữ liệu mẫu, giao diện mẫu, nghiệp vụ, phân quyền và kiểm thử.

Nguyên tắc bắt buộc:

```text
1 file Excel = 1 Lesson luyện thi Đọc hiểu
N hàng Excel = N câu hỏi trong cùng Lesson
Nhiều câu có thể dùng chung một đoạn văn
```

Tuyệt đối không tạo một Lesson cho từng hàng hoặc từng câu hỏi.

---

## 2. Workbook nguồn

Workbook nguồn có 3 sheet:

1. `câu hỏi input mấu`: dữ liệu input chính.
2. `Giao diện`: mô phỏng chi tiết giao diện làm bài.
3. `Prompt`: mô tả UI/UX, luồng tương tác, trường hợp đặc biệt và tiêu chí nghiệm thu.

Dữ liệu mẫu hiện có 5 câu, số 48–52, thuộc 2 đoạn văn:

- Đoạn văn 1 dùng chung cho câu 48, 49, 50 và 51.
- Đoạn văn 2 dùng riêng cho câu 52.

Ứng dụng không được giới hạn cứng 5 câu. Parser phải hỗ trợ tối thiểu 200 dòng.

---

# PHẦN A. CẤU TRÚC INPUT EXCEL

## 3. Sheet dữ liệu: `câu hỏi input mấu`

Dòng đầu là tiêu đề. Mỗi dòng tiếp theo là một câu hỏi.

### Cột A: `Đoạn văn`

- Chứa toàn bộ đoạn đọc tiếng Nhật.
- Một đoạn văn có thể được dùng cho nhiều câu hỏi.
- Chỉ dòng đầu của nhóm bắt buộc có đoạn văn đầy đủ.
- Các dòng sau có thể ghi `giống trên` hoặc để trống.
- Khi gặp `giống trên` hoặc ô trống, parser phải lấy đoạn văn thật gần nhất phía trên.

### Cột B: `Câu hỏi`

- Chứa số câu và nội dung câu hỏi.
- Ví dụ:

```text
48. 【問題9・紅葉の異変】空欄 (48) に入る最もよいものはどれか。
```

Parser cần tách được:

- `question_no`: 48
- `topic`: 問題9・紅葉の異変
- `question_text`: toàn bộ câu hỏi

### Cột C: Đáp án A
### Cột D: Đáp án B
### Cột E: Đáp án C
### Cột F: Đáp án D

Mỗi câu có bốn lựa chọn A/B/C/D.

### Cột G: `Đáp án đúng (A/B/C/D)`

- Giá trị hợp lệ: A, B, C hoặc D.
- Nếu trống, câu vẫn được import nhưng phải có trạng thái `no_official_answer`.
- Câu không có đáp án chính thức không được tính điểm.

### Cột H: `Thời gian (giây)`

- Thời gian đề xuất cho mỗi câu.
- Dữ liệu mẫu là 30 giây.
- Phải là số dương.

### Cột I: `Dich tiếng việt đoạn văn`

- Bản dịch tiếng Việt của đoạn văn ở cột A.
- Dùng chung cho các câu cùng đoạn.
- Nếu giá trị là `giống trên` hoặc trống, lấy bản dịch thật gần nhất phía trên.

### Cột J: `Phân tích giải thích đáp án và đưa minh chứng để chúng minh đáp án`

Chứa văn bản nhiều dòng, có thể gồm:

- Đáp án đúng.
- Đọc ngữ cảnh.
- Minh chứng trong đoạn văn.
- Lý do loại từng đáp án sai.
- Mẹo làm bài.
- Ví dụ để nhớ.
- Emoji và ký hiệu như ✅ ❌ 🧠 1️⃣ 2️⃣.

Phải giữ nguyên xuống dòng và Unicode.

### Cột K: `Các từ hán tự trong đoạn văn`

Chứa danh sách:

```text
漢字（かな）— ÂM HÁN VIỆT: nghĩa
```

Ví dụ:

```text
紅葉（こうよう／もみじ）— HỒNG DIỆP: lá đỏ mùa thu
温暖化（おんだんか）— ÔN NOÃN HÓA: sự nóng lên
```

### Cột L: `Các cấu trúc ngữ pháp trong đoạn văn`

Chứa danh sách cấu trúc, giải thích và mẹo nhớ, ví dụ:

```text
～によって: do/bởi...
～そうです: nghe nói...
Vるようになる: trở nên/bắt đầu...
```

Phải giữ nguyên xuống dòng và thứ tự.

---

## 4. Quy tắc kế thừa `giống trên`

Parser phải duy trì hai biến trạng thái:

```text
lastRealPassageJa
lastRealPassageVi
```

Với từng hàng:

1. Nếu cột A có nội dung thật và khác `giống trên`, cập nhật `lastRealPassageJa`.
2. Nếu cột A trống hoặc là `giống trên`, dùng `lastRealPassageJa`.
3. Nếu cột I có nội dung thật và khác `giống trên`, cập nhật `lastRealPassageVi`.
4. Nếu cột I trống hoặc là `giống trên`, dùng `lastRealPassageVi`.
5. Nếu chưa từng có đoạn văn thật phía trên, báo lỗi đúng số dòng và không import hàng đó.

Nhiều câu cùng đoạn phải cùng `passage_id`.

Không tạo bản sao đoạn văn cho mỗi câu nếu database hỗ trợ quan hệ Passage 1–N Questions.

---

# PHẦN B. DỮ LIỆU MẪU QUAN TRỌNG

## 5. Nhóm đoạn văn 1: `紅葉の異変`

### Tiêu đề

```text
紅葉の異変　サリム ソフィア
```

### Nội dung tiếng Nhật

```text
私は日本の秋の景色が好きです。秋になって紅葉が始まり、緑だった葉が黄色やオレンジ、赤に変わると、とてもきれいです。秋の紅葉は、日本の四季の変化を感じさせてくれるものです。

(48)　ですが、先日テレビで、紅葉がピークを迎える時期が年々遅くなっているというニュースを見ました。中には、1月になってからピークを迎えたところもあるそうで、驚きました。温暖化によって平均気温が上昇していることが大きな原因だそうです。私は、夏が過ぎて気温が下がってくれば、必ず紅葉が始まると思っていました。(49)、そうではありませんでした。紅葉には、条件となる気温の変化がありました。

葉の変色が始まるのは、1日の最低気温が大体8度以下になってからです。秋になっても、最低気温が一定の気温まで下がらなければ、紅葉は (50)。その後、さらに寒くなり、5～6度まで下がると、紅葉は一気に進みます。また、5度以下の日が続くと、最も美しい新葉が見られるといわれています。

紅葉に起きている異変を知り、このまま温暖化が進むと、日本の秋の景色が変わってしまう可能性もあるのではないかと思いました。もしかしたら、紅葉自体が見られなくなる日も来るかもしれません。紅葉を通して、温暖化が身近な問題であることをより強く (51)。
```

### Các câu dùng chung đoạn văn

#### Câu 48

```text
48. 【問題9・紅葉の異変】空欄 (48) に入る最もよいものはどれか。
A: そこの紅葉
B: そんな紅葉
C: そちら
D: 紅葉
Đáp án đúng: B
Thời gian: 30
```

Ý chính giải thích:

- `そんな紅葉` nhắc lại đặc điểm lá đỏ đẹp vừa mô tả.
- `ですが` tạo quan hệ đối lập với tin lá đỏ đạt đỉnh ngày càng muộn.
- A sai vì `そこ` chỉ nơi chốn.
- C sai vì `そちら` chỉ hướng/nơi/người.
- D có thể đúng ngữ pháp nhưng liên kết văn mạch kém tự nhiên hơn B.

#### Câu 49

```text
49. 【問題9・紅葉の異変】空欄 (49) に入る最もよいものはどれか。
A: 結局
B: 確かに
C: しかし
D: つまり
Đáp án đúng: C
Thời gian: 30
```

Ý chính giải thích:

- Trước chỗ trống là suy nghĩ cũ `必ず紅葉が始まると思っていました`.
- Sau chỗ trống là phủ định `そうではありませんでした`.
- Hai ý ngược chiều nên chọn `しかし`.

#### Câu 50

```text
50. 【問題9・紅葉の異変】空欄 (50) に入る最もよいものはどれか。
A: 始まらないのです
B: 始まらないためです
C: 始まらないのでしょうか
D: 始まらないためでしょうか
Đáp án đúng: A
Thời gian: 30
```

Ý chính giải thích:

- Nếu nhiệt độ tối thiểu chưa xuống đủ mức thì lá chưa đổi màu.
- Đây là lời giải thích quy luật, dùng `～のです`.
- Không phải câu hỏi nên loại C/D.
- `～ためです` cần quan hệ kết quả → nguyên nhân, không phù hợp ở đây.

#### Câu 51

```text
51. 【問題9・紅葉の異変】空欄 (51) に入る最もよいものはどれか。
A: 感じているからだと思います
B: 感じられるところだと思います
C: 感じさせることができました
D: 感じるようになりました
Đáp án đúng: D
Thời gian: 30
```

Ý chính giải thích:

- Tác giả thay đổi nhận thức sau khi biết sự bất thường của lá đỏ.
- `より強く` thể hiện sự thay đổi so với trước.
- Dùng `Vるようになる` để diễn tả bắt đầu/trở nên cảm nhận.

---

## 6. Nhóm đoạn văn 2: `言葉の定義づけ`

### Nội dung tiếng Nhật

```text
（一）言葉の定義づけ
自分の言葉は自分の頭の中にしかなく、相手の言葉は相手の頭の中にしかありません。抽象的な言葉の場合には、まったく同じ意味で使用していることのほうが少ないと言えるでしょう。

したがって、議論をする際には、言葉の定義づけ（注）が重要になってきます。相手がどういう意味でその言葉を使用しているのか、自分と同じ意味で使用しているのかを確認することは大切なことです。これは、論理的に会話をするうえでの大前提となるものです。

（注）定義づけ：ここでは、意味を決めること
```

### Câu 52

```text
52. 【問題10（一）・言葉の定義づけ】筆者によると、論理的な会話をするのに必要なことは何か。

A: 抽象的な言葉をできるだけ使用しないようにする。
B: 抽象的な言葉を、正しい意味かどうかを確認してから使用する。
C: 同じ言葉を、相手と自分が同じ意味で使用しているかを確認する。
D: 相手の知らない言葉は、自分がどういう意味で使用しているかを説明する。

Đáp án đúng: C
Thời gian: 30
```

Ý chính giải thích:

- Câu then chốt nói cần xác nhận đối phương đang dùng từ với nghĩa gì và có cùng nghĩa với mình không.
- `これは` trong câu cuối chỉ việc xác nhận đó.
- Đó là tiền đề của hội thoại logic.
- Đáp án C chứa đủ: cùng từ, đối phương, bản thân, cùng nghĩa, xác nhận.

---

# PHẦN C. MÔ HÌNH DỮ LIỆU

## 7. Lesson

Một file Excel tạo đúng một Lesson:

```text
lesson_type: reading_exam
category_id: cat-reading
```

Lesson lưu:

- id
- title
- description
- subject_id bắt buộc
- jlpt_level
- folder_id
- status
- created_by
- passage_count
- question_count

## 8. ReadingExamPassage

Mỗi đoạn văn duy nhất lưu một lần:

```text
id
lesson_id
passage_key
passage_title
passage_ja
passage_vi
sort_order
created_at
updated_at
```

`passage_key` có thể được tạo ổn định từ:

- vị trí đoạn văn đầu tiên trong file; hoặc
- hash nội dung đã chuẩn hóa.

## 9. ReadingExamQuestion

```text
id
lesson_id
passage_id
question_no
topic
question_text
option_a
option_b
option_c
option_d
correct_answer nullable
time_seconds
explanation
kanji_vocabulary
grammar_structures
sort_order
active
created_at
updated_at
```

Nếu tái sử dụng bảng `exam_questions`, cần có:

```text
exam_type = reading
passage_id
explanation
kanji_vocabulary
grammar_structures
```

Không làm hỏng `grammar_exam` và `vocabulary_exam`.

## 10. ReadingExamProgress

Lưu theo:

```text
user_id + lesson_id + question_id
```

Trường cần có:

- selected_answer
- is_correct nullable
- submitted
- time_spent
- completed_at
- updated_at

Không dùng LocalStorage làm nguồn dữ liệu chính hoặc nguồn quyền. Có thể dùng LocalStorage chỉ làm cache tạm.

---

# PHẦN D. GIAO DIỆN IMPORT

## 11. Nút nhập đề

Trong tab `Đọc hiểu`, thêm nút:

```text
Nhập đề luyện thi
```

Quy trình:

1. Chọn/kéo thả file `.xlsx`.
2. Đọc sheet `câu hỏi input mấu`.
3. Validate và áp dụng `giống trên`.
4. Nhóm câu hỏi theo đoạn văn.
5. Nhập metadata Lesson.
6. Preview.
7. Import.

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

Teacher chỉ chọn môn trong `allowed_subjects`.

## 12. Preview

Hiển thị:

- Tổng số đoạn văn duy nhất.
- Tổng số câu.
- Số câu hợp lệ/lỗi.
- Các câu thuộc đoạn nào.
- Đoạn Nhật và bản dịch Việt.
- Bốn lựa chọn.
- Đáp án đúng hoặc trạng thái chưa có đáp án.
- Thời gian.
- Phân tích.
- Hán tự.
- Ngữ pháp.

Với dữ liệu mẫu phải hiển thị:

```text
1 Lesson
2 đoạn văn
5 câu hỏi
Đoạn 1: câu 48–51
Đoạn 2: câu 52
```

## 13. Import nguyên tử

Chỉ báo thành công sau khi Supabase xác nhận:

- 1 Lesson được tạo.
- 2 Passage được tạo.
- 5 Question được tạo.
- Câu 48–51 cùng passage_id.
- Câu 52 có passage_id khác.
- Owner grant tồn tại.
- Subject hợp lệ.
- Refetch xong và card mới xuất hiện.

Nếu lỗi:

- Không để Lesson rỗng.
- Không để Passage/Question dở dang.
- Rollback hoặc cleanup an toàn.
- Không báo thành công giả.
- Chống double-click.

---

# PHẦN E. GIAO DIỆN LÀM BÀI

## 14. Header cố định

Hiển thị:

- Tên Lesson.
- JLPT level.
- `Câu 48 · 1/5`.
- Thanh tiến độ.
- Chủ đề.
- Đồng hồ đếm ngược theo câu.
- Nút cài đặt A− / A+ / Dark mode / tắt animation.

## 15. Split View

Màn hình chia hai phần:

- Mặc định đoạn văn 40%.
- Câu hỏi và giải thích 60%.
- Có thanh kéo thay đổi tỉ lệ.
- Giới hạn 25%–75%.
- Lưu tỉ lệ cho lần sau.

Trên desktop/tablet có thể chuyển thành hai cột trái–phải.

## 16. Flip Card đoạn văn

### Mặt trước

- Đoạn tiếng Nhật.
- Font `Yu Mincho` hoặc `Noto Serif JP`.
- Cỡ chữ lớn, line-height khoảng 1.8.
- Nền giấy washi `#FFFDF7`.
- Giữ nguyên xuống dòng.
- Các ký hiệu `(48)`, `(49)`, `(50)`, `(51)` được đánh dấu vàng nhạt.

### Mặt sau

- Bản dịch tiếng Việt.
- Nền xanh nhạt `#EAF3FB`.

### Tương tác

- Chạm thẻ để lật 3D quanh trục Y.
- Thời gian khoảng 500ms, ease-in-out.
- Chạm lần nữa để lật lại.
- Có nhãn `Chạm để lật`.
- Hai mặt cuộn độc lập.
- Khi lật, cuộn mặt mới về đầu.
- Có tùy chọn tắt animation.

Các câu 48–51 phải giữ trạng thái lật và vị trí cuộn khi chuyển giữa nhau vì dùng chung đoạn văn.

## 17. Khu vực câu hỏi

Hiển thị:

- Nội dung câu hỏi.
- Bốn AnswerOption A/B/C/D.
- Chọn được một đáp án.
- Người học có thể đổi lựa chọn trước khi nộp.
- Nút `Nộp bài`.

Trước khi nộp:

- Không lộ đáp án đúng.
- Explanation/Kanji/Grammar đều bị khóa.

Sau khi nộp:

- Đúng: lựa chọn xanh + dấu ✓ + banner `CHÍNH XÁC`.
- Sai: lựa chọn đã chọn đỏ, đáp án đúng xanh, rung nhẹ + banner `CHƯA ĐÚNG`.
- Khóa thay đổi đáp án.
- Có nút `Làm lại câu này`.

Nếu không có đáp án chính thức:

- Banner vàng `Chưa có đáp án chính thức`.
- Không tính điểm.
- Vẫn cho mở phần giải thích.

## 18. Explanation Sheet

Sau khi nộp mới mở khóa ba tab/accordion:

1. `Giải thích & Mẹo làm bài`
2. `Hán tự · Âm Hán Việt`
3. `Cấu trúc Ngữ pháp`

Yêu cầu render:

- Giữ nguyên xuống dòng.
- Hỗ trợ emoji ✅ ❌ 🧠 📝 📚.
- Dòng bắt đầu ✅: nền xanh nhẹ.
- Dòng bắt đầu ❌: nền đỏ nhẹ.
- Dòng bắt đầu 🧠: nền vàng nhẹ.
- Font 14–15px, dễ đọc.
- Hán tự dạng `漢字（かな）— ÂM HÁN VIỆT: nghĩa` hiển thị thành thẻ và có thể phóng to.

## 19. Điều hướng

- `Câu trước`.
- `Câu sau`.
- Question Picker.
- Khi sang câu mới: reset lựa chọn chưa nộp, cuộn vùng câu hỏi lên đầu, đóng phần giải thích.
- Chuyển giữa câu cùng đoạn không tải lại Passage.
- Chuyển sang đoạn mới thì thay Flip Card.

## 20. Tổng kết

Cuối bài hiển thị:

- Số đúng/tổng.
- Số sai.
- Số chưa làm.
- Câu không tính điểm.
- Tổng thời gian.
- Danh sách câu sai.
- `Xem lại câu sai`.
- `Làm lại toàn bộ`.
- `Quay về danh sách`.

---

# PHẦN F. THIẾT KẾ

## 21. Màu sắc

- Navy: `#1F2A5C`
- Sakura: `#E85D75`
- Washi: `#FBF7F0`
- Indigo nhạt: `#EEF1FA`
- Đúng: `#2E9E6B`
- Sai: `#D64545`
- Vàng: `#F2B84B`
- Chữ: `#2B2B33`
- Dark background: `#14172B`
- Dark text: `#EDEDF2`

## 22. Components đề xuất

- AppHeader
- ProgressBar
- QuestionPicker
- TimerBadge
- SplitView
- DragHandle
- FlipCard
- PassageFront
- PassageBack
- QuestionCard
- AnswerOption
- SubmitButton
- ResultBanner
- LockedPanel
- ExplanationSheet
- KanjiCard
- NavBar
- SummaryScreen
- SettingsSheet

Ưu tiên tái sử dụng component và Lesson ACL hiện có của project.

---

# PHẦN G. CARD VÀ DANH SÁCH BÀI HỌC

## 23. Card Reading Exam

Card hiển thị:

- Tên Lesson.
- Badge `Luyện thi Đọc hiểu`.
- JLPT level.
- Môn học.
- Số đoạn văn.
- Số câu hỏi.
- Tiến độ.
- Folder.
- Menu ba chấm.

Khi mở `reading_exam`, vào màn hình luyện thi đọc hiểu, không mở Reading View thông thường.

Bài Đọc hiểu thông thường vẫn hoạt động như cũ.

---

# PHẦN H. PHÂN QUYỀN

## 24. Lesson ACL

- Admin quản lý tất cả.
- Teacher tạo/import trở thành owner.
- Teacher owner/manager được cấp Lesson cho lớp/học sinh mình phụ trách.
- Student chỉ thấy Lesson được cấp trực tiếp hoặc qua lớp.
- Lesson không có Subject không hiển thị cho Student.
- RLS bảo vệ Lesson, Passage, Question và Progress.
- Không dùng LocalStorage làm nguồn quyền.

---

# PHẦN I. TEST BẮT BUỘC

## 25. Parser

1. File mẫu tạo đúng 1 Lesson.
2. Tạo đúng 2 Passage.
3. Tạo đúng 5 Question.
4. Câu 48–51 cùng passage_id.
5. Câu 52 dùng passage_id khác.
6. `giống trên` và ô trống kế thừa đúng Passage/Bản dịch.
7. Unicode Nhật-Việt và xuống dòng nguyên vẹn.
8. Correct answer đúng: 48=B, 49=C, 50=A, 51=D, 52=C.
9. Deep equality nội dung câu 48 và 52 với đặc tả này.
10. Không tạo 5 Lesson.

## 26. Giao diện

1. Split View kéo được từ 25%–75%.
2. Flip Card lật Nhật/Việt.
3. Câu cùng Passage giữ trạng thái lật/cuộn.
4. Chưa nộp thì ba phần giải thích bị khóa.
5. Nộp xong mới mở.
6. Đúng/sai hiển thị đúng.
7. Câu thiếu đáp án không tính điểm.
8. Tổng kết chính xác.
9. Mobile 360–430px không tràn ngang.
10. Landscape và desktop hoạt động.

## 27. Persistence và Security

1. Refresh vẫn giữ Progress.
2. Student được cấp xem được.
3. Student không được cấp bị chặn.
4. Thay lessonId/passageId/questionId bị RLS chặn.
5. Teacher không sửa Lesson ngoài quyền.
6. Owner grant được tạo khi import.

## 28. Regression

- Luyện thi Ngữ pháp vẫn hoạt động.
- Luyện thi Từ vựng vẫn hoạt động.
- Đọc hiểu thường vẫn hoạt động.
- Lesson ACL và Subject không bị ảnh hưởng.
- Không làm mất dữ liệu thật.

---

# PHẦN J. QUALITY GATE VÀ GIỚI HẠN

## 29. Chạy kiểm tra

```bash
npm run typecheck
npm run lint
npm run build
```

Chạy thêm test parser, import, UI state, progress, Lesson ACL và RLS.

Không báo PASS nếu timeout, killed hoặc chưa có exit code cuối.

## 30. Giới hạn

- Không xóa dữ liệu thật.
- Không đổi/reset mật khẩu.
- Không reset database.
- Không làm hỏng các loại Lesson hiện có.
- Không khôi phục Folder ACL.
- Không commit.
- Không push.
- Không deploy.
- Không chạy migration production.
- Không tự sửa nội dung mẫu.
- Không tạo một Lesson cho mỗi hàng.
- Không dùng LocalStorage làm nguồn dữ liệu/quyền chính.

---

# PHẦN K. BÁO CÁO CUỐI

Báo cáo:

1. File/component/migration đã tạo hoặc sửa.
2. Cách nhóm nhiều câu vào một Passage.
3. Cách bảo đảm một Excel chỉ tạo một Lesson.
4. Kết quả deep equality câu 48 và 52.
5. Cách xử lý `giống trên`.
6. Giao diện Split View và Flip Card.
7. Cách khóa/mở Explanation.
8. Cách lưu Progress.
9. Kết quả Lesson ACL/RLS.
10. Kết quả mobile/desktop.
11. Typecheck/lint/build/test với exit code thật.
12. Migration còn chờ triển khai.
13. Xác nhận không mất dữ liệu, không đổi mật khẩu, không commit/push/deploy.

Hãy thực hiện đầy đủ từ đầu đến cuối theo tài liệu này. Không cần đọc file Excel nữa.
