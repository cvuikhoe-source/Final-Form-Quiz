# YÊU CẦU AI: THIẾT KẾ BÀI HỌC LUYỆN THI NGỮ PHÁP TỪ EXCEL

Hãy đọc file mẫu `mau_input_luyen_thi_ngu_phap_31_50.xlsx`, đặc biệt các sheet `Exam_Questions`, `Huong_Dan_Input` và `Mo_Ta_Giao_Dien`, rồi triển khai trực tiếp trên project hiện tại.

## Nguyên tắc dữ liệu bắt buộc

- Một file Excel chỉ tạo **một Lesson luyện thi ngữ pháp**.
- Mỗi hàng trong `Exam_Questions` tạo **một ExamQuestion** bên trong Lesson đó.
- File có 20 hàng phải tạo đúng **1 Lesson + 20 ExamQuestion**, không tạo 20 Lesson.
- Các hàng phải dùng cùng `lesson_title`; metadata chung chỉ lưu một lần ở Lesson.
- Hỗ trợ import mới và import bổ sung vào Lesson đã có.
- Chống trùng theo `lesson_id + question_no` hoặc nội dung câu hỏi chuẩn hóa.
- Import phải an toàn: validate trước, chống bấm lặp, không để Lesson rỗng/import dở dang khi lỗi.

## Cột input

- `lesson_title`, `lesson_description`, `jlpt_level`
- `question_no`, `question_type`, `question_text`
- `option_a`, `option_b`, `option_c`, `option_d`
- `correct_answer`, `time_seconds`
- `answer_explanation`, `vocabulary_han_viet`
- `sort_order`, `active`

`question_type` hỗ trợ:

- `multiple_choice`: chọn một đáp án A/B/C/D.
- `sentence_ordering`: câu sắp xếp có `＿＿` và `★`; bốn phương án là bốn mảnh ghép.

## Giao diện làm bài

1. Đầu trang: tên bài học, JLPT, tiến độ `Câu X/N`, số đúng và thời gian.
2. Hiển thị câu hỏi tiếng Nhật rõ ràng; giữ nguyên khoảng trống, `＿＿` và `★`.
3. Bốn đáp án A/B/C/D dạng nút lớn, dùng tốt trên điện thoại.
4. Trước khi chọn không được lộ đáp án và phân tích.
5. Sau khi chọn: báo đúng/sai, đánh dấu đáp án người học và đáp án đúng.
6. Hiển thị khối `Phân tích đáp án`: giải thích cấu trúc, lý do đáp án đúng, lý do loại đáp án sai, ghi nhớ.
7. Hiển thị khối `Từ vựng – Âm Hán Việt`: Kanji, cách đọc, âm Hán Việt, nghĩa.
8. Có Câu trước/Câu tiếp, danh sách số câu, trạng thái chưa làm/đúng/sai.
9. Kết thúc bài: tổng điểm, đúng/sai/chưa làm, thời gian, làm lại, xem câu sai.
10. Lưu tiến độ và đáp án theo user + lesson.
11. Mobile: không hover, nút tối thiểu 44px, không cuộn ngang, bố cục dọc dễ đọc.

## Phân quyền

- Admin và Teacher có quyền phù hợp được tạo/import/sửa bài luyện thi.
- Teacher chỉ thao tác Lesson tự tạo hoặc được cấp quyền.
- Student chỉ làm Lesson được cấp trực tiếp hoặc qua lớp.
- Backend/RLS phải kiểm tra JWT, auth.uid(), Lesson ACL; không chỉ ẩn nút frontend.

## Kiểm thử bắt buộc

- File mẫu 20 hàng tạo đúng 1 Lesson + 20 ExamQuestion.
- Tất cả ExamQuestion có cùng `lesson_id`.
- Không tạo 20 Lesson.
- Nội dung câu 31-50, đáp án, giải thích và từ vựng được giữ nguyên Unicode.
- Chấm đúng/sai chính xác.
- Không lộ lời giải trước khi trả lời.
- Câu `sentence_ordering` hiển thị đúng dấu `＿＿` và `★`.
- Refresh vẫn giữ tiến độ.
- Student không truy cập bài chưa được cấp.
- Typecheck, lint, build và test đều exit code 0.

## Giới hạn

- Không xóa dữ liệu thật.
- Không đổi mật khẩu.
- Không reset database.
- Không commit, push hoặc deploy.
- Không dùng localStorage làm nguồn quyền truy cập.

Hãy bắt đầu bằng việc phân tích luồng import Từ vựng/Ngữ pháp hiện có, tái sử dụng mô hình “một file = một Lesson, nhiều hàng = nhiều item”, sau đó triển khai ExamQuestion và giao diện luyện thi theo file mẫu.
