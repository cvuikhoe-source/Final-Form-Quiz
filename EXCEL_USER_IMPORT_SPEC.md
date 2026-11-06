# SPEC: IMPORT TÀI KHOẢN GIÁO VIÊN / HỌC SINH BẰNG EXCEL

## 0. Mục tiêu

Bổ sung vào QuizForms chức năng nhập hàng loạt tài khoản Teacher và Student từ file Excel `.xlsx` ngay trong màn hình **Quản lý tài khoản**.

Luồng sử dụng:

1. Admin hoặc Teacher bấm `Nhập Excel`.
2. Tải file mẫu.
3. Điền nhiều tài khoản.
4. Chọn file `.xlsx`.
5. Hệ thống đọc và preview dữ liệu.
6. Validate toàn bộ từng dòng.
7. Người dùng bấm `Tạo tài khoản`.
8. Backend tạo Supabase Auth user và `app_users` profile cho từng dòng.
9. Hiển thị kết quả thành công/thất bại theo từng dòng.

Không lưu plaintext password vào `app_users`. Password chỉ dùng lúc tạo Supabase Auth user.

## 1. Trạng thái hiện tại cần giữ nguyên

- One-step user creation đã hoạt động qua `admin-create-user`.
- Admin và Teacher đăng nhập bằng Supabase Auth.
- Auth Student mới đăng nhập bằng Supabase Auth.
- `hs_10a1` vẫn là legacy.
- Admin có thể tạo Teacher/Student theo quyền hiện tại.
- Teacher chỉ được quản lý/reset password Student thuộc lớp được phân công.
- `assignedClasses` và `allowedSubjects` đã có trong `app_users`.
- `admin-reset-password` đang được phát triển/triển khai.
- Không làm mất các thay đổi chưa commit hiện tại.

## 2. Kiểm tra Git trước khi sửa

Chạy:

```bash
git status --short
git log -5 --oneline
git tag
```

Nếu có thay đổi của các tính năng trước, không reset/stash/checkout. Báo cáo và chỉ tiếp tục nếu các file đó đúng là thay đổi đang được giữ lại theo yêu cầu của người dùng.

Không commit, không push, không deploy, không chạy migration trong nhiệm vụ này.

## 3. Công nghệ Excel

Kiểm tra `package.json` trước.

- Nếu dự án chưa có thư viện đọc `.xlsx`, dùng package `xlsx` (SheetJS) làm dependency frontend.
- Không dùng CSV thay thế.
- Không dùng `eval`.
- Chỉ đọc file do người dùng chọn trong trình duyệt.
- Giới hạn dung lượng file, đề xuất tối đa 5 MB.
- Giới hạn số dòng, đề xuất tối đa 500 tài khoản/lần.
- Chỉ nhận `.xlsx`; từ chối `.xls`, `.csv`, file khác.

Nếu thêm dependency, báo cáo rõ thay đổi `package.json` và lock file.

## 4. File mẫu Excel

Tạo chức năng `Tải file mẫu` sinh file `.xlsx` với sheet `Users`.

Header bắt buộc, đúng thứ tự:

- `full_name`
- `username`
- `password`
- `role`
- `assigned_classes`
- `allowed_subjects`

Quy ước:

- `role`: chỉ `student` hoặc `teacher`.
- `assigned_classes`: nhiều lớp phân tách bằng dấu `;`, ví dụ `10A1;10A2`.
- `allowed_subjects`: nhiều môn phân tách bằng dấu `;`, ví dụ `Toán;Lý`.
- Password tối thiểu 8, tối đa 128 ký tự.
- Username 3–50 ký tự, được normalize lowercase, regex `^[a-z0-9._-]+$`.

Thêm sheet `Instructions` giải thích bằng tiếng Việt, nhưng không chứa tài khoản thật.

Thêm tối đa 2 dòng dữ liệu mẫu giả an toàn:

```text
Nguyễn Văn Mẫu | hs_mau01 | Mau123456 | student | 10A1 | Toán;Lý
Giáo viên Mẫu | gv_mau01 | Mau123456 | teacher | 10A1;10A2 | Toán
```

Không tự import hai dòng mẫu nếu người dùng không xóa. Có thể thêm cột/flag `sample` hoặc hướng dẫn rõ phải xóa dữ liệu mẫu; ưu tiên workbook mẫu chỉ có header + instructions để tránh tạo nhầm.

## 5. Giao diện

Sửa màn hình `UserManagementView.tsx` hoặc tách component mới nếu file quá lớn.

Bên cạnh nút `+ Thêm`, thêm nút:

`Nhập Excel`

Khi bấm mở modal `UserExcelImportModal` gồm:

- Nút `Tải file mẫu`.
- Vùng chọn/kéo-thả file `.xlsx`.
- Tên file và dung lượng.
- Nút `Đọc file` nếu cần.
- Bảng preview có phân trang hoặc giới hạn hiển thị.
- Tổng dòng hợp lệ.
- Tổng dòng lỗi.
- Nút `Hủy`.
- Nút `Tạo tài khoản`.

Không hiển thị plaintext password trong preview. Cột password chỉ hiển thị `••••••••` hoặc `Đã nhập`.

Không ghi password vào console.

## 6. Validate frontend

Mỗi dòng tạo model tạm có:

- `rowNumber`
- `fullName`
- `username`
- `password` chỉ giữ tạm trong state import
- `role`
- `assignedClasses`
- `allowedSubjects`
- `errors[]`
- `status`: `pending | valid | invalid | processing | success | failed`

Validate:

- Bỏ dòng trống hoàn toàn.
- Header thiếu/sai: dừng import, báo rõ header.
- Họ tên không rỗng, tối đa 120 ký tự.
- Username normalize trim/lowercase, đúng regex, không có `@`.
- Password 8–128 ký tự; không trim làm thay đổi password.
- Role chỉ `student`/`teacher`.
- Split lớp/môn bằng `;`, trim, bỏ rỗng, bỏ trùng.
- Kiểm tra lớp có tồn tại trong danh sách `loadClasses()` hiện hành.
- Kiểm tra môn có tồn tại trong `loadSubjects()` hiện hành.
- Không tự tạo lớp mới khi import.
- Username không được trùng trong cùng file.
- Không gửi dòng invalid tới backend.

Hiển thị lỗi theo từng dòng, ví dụ:

- `Thiếu họ tên`
- `Username không hợp lệ`
- `Username trùng trong file`
- `Mật khẩu phải có ít nhất 8 ký tự`
- `Role không hợp lệ`
- `Lớp 10A9 không tồn tại`
- `Môn XYZ không tồn tại`

## 7. Phân quyền import

### Admin

- Được import Teacher và Student.
- Không được import role Admin.

### Teacher

- Chỉ được import Student.
- Mọi lớp trong `assigned_classes` của từng Student phải nằm trong `callerProfile.assigned_classes` của Teacher.
- Không cho Teacher import Student không có lớp.
- Không cho Teacher import Student ngoài lớp phụ trách.
- Không tin role/lớp do frontend để quyết định quyền; backend phải kiểm tra lại.

### Student

- Không thấy nút import.
- Không được gọi API thành công.

## 8. Backend batch Edge Function

Ưu tiên tạo Edge Function mới:

`supabase/functions/import-users/index.ts`

Không gọi `admin-create-user` lặp từ browser theo kiểu song song không kiểm soát.

Request:

```json
{
  "users": [
    {
      "fullName": "Nguyễn Văn An",
      "username": "hs_10a1_new",
      "password": "Password123",
      "role": "student",
      "assignedClasses": ["10A1"],
      "allowedSubjects": ["Toán"]
    }
  ]
}
```

Header:

`Authorization: Bearer <JWT>`

Function phải:

1. Chỉ chấp nhận POST/OPTIONS.
2. Xác minh JWT bằng Supabase Auth.
3. Query caller profile theo `auth_user_id`.
4. Chỉ cho Admin/Teacher theo matrix quyền trên.
5. Validate lại toàn bộ rows phía server.
6. Giới hạn tối đa 500 rows.
7. Không log body, password, token.
8. Không nhận auth UID, email nội bộ, app user ID từ frontend.
9. Tự tạo email `<normalizedUsername>@quizforms.internal`.
10. Tạo từng user bằng `auth.admin.createUser`.
11. INSERT `app_users` với `password = NULL` và `auth_user_id` đúng.
12. Nếu INSERT profile của một row lỗi sau khi Auth user đã tạo, xóa Auth user đó để rollback row.
13. Không rollback các row đã thành công trước đó. Trả kết quả từng dòng để người dùng biết partial success.
14. Xử lý tuần tự hoặc concurrency nhỏ, tối đa 3–5 row cùng lúc; không `Promise.all` 500 user không kiểm soát.
15. Không tạo role Admin.
16. Không UPDATE user đã tồn tại.

Response:

```json
{
  "success": true,
  "summary": {
    "total": 10,
    "created": 8,
    "failed": 2
  },
  "results": [
    {
      "rowNumber": 2,
      "username": "hs_10a1_new",
      "status": "created",
      "user": {
        "id": "user-...",
        "username": "hs_10a1_new",
        "fullName": "Nguyễn Văn An",
        "role": "student",
        "assignedClasses": ["10A1"],
        "allowedSubjects": ["Toán"]
      }
    },
    {
      "rowNumber": 3,
      "username": "duplicate",
      "status": "failed",
      "error": {
        "code": "USERNAME_EXISTS",
        "message": "Tên đăng nhập đã tồn tại."
      }
    }
  ]
}
```

Không trả password, token, internal email, Auth UID hoặc service role.

## 9. Frontend service

Mở rộng `src/lib/adminUserService.ts` hoặc tạo `userImportService.ts`.

Hàm import phải:

- Lấy session/access token hiện tại.
- Gửi JWT trong Authorization header.
- Gửi duy nhất rows hợp lệ.
- Không log request body.
- Parse response partial success.
- Map user thành công vào `User` không có password.
- Không lưu password vào localStorage.
- Xóa toàn bộ password khỏi state ngay khi request kết thúc, dù thành công hay lỗi.

## 10. Kết quả import trên UI

Sau khi backend trả kết quả:

- Hiển thị `Tổng`, `Thành công`, `Thất bại`.
- Từng dòng có trạng thái.
- Cho tải file kết quả `.xlsx` không chứa password, gồm:
  - `row_number`
  - `username`
  - `status`
  - `message`
- Cập nhật danh sách user ngay cho các dòng thành công.
- Không reload toàn trang nếu không cần.
- Không gửi lại dòng đã thành công khi người dùng retry.
- Nút `Thử lại dòng lỗi` chỉ gửi các dòng lỗi còn hợp lệ và password vẫn đang tạm giữ; nếu password state đã xóa, yêu cầu chọn lại file thay vì lưu password lâu dài.

## 11. An toàn dữ liệu và UX

- Cảnh báo trước khi import số lượng lớn.
- Không hiển thị password trong preview/result.
- Không copy password vào clipboard tự động.
- Không telemetry/log chứa dữ liệu nhạy cảm.
- Khi đóng modal, xóa parsed rows và password khỏi state.
- Khi đổi file, xóa dữ liệu file cũ.
- Có progress: `Đang tạo 12/100` nếu backend hỗ trợ; nếu request batch duy nhất thì dùng trạng thái `Đang xử lý...` và summary sau cùng.
- Ngăn double submit.

## 12. Không làm hỏng chức năng hiện tại

Giữ nguyên:

- Tạo một tài khoản.
- Sửa lớp/môn.
- Reset password Admin/Teacher.
- Teacher reset Student cùng lớp.
- Login Supabase/legacy.
- Auth student mới.
- `app_users.password = NULL` cho Auth users.

Không sửa database schema/migration/RLS trong nhiệm vụ này nếu không thực sự cần.
Không sửa AI functions.
Không commit/push/deploy.

## 13. Tests và quality gates

Bổ sung unit tests nếu project có test framework. Ít nhất phải test pure helpers:

- Parse header.
- Normalize username.
- Split `;`.
- Duplicate username trong file.
- Invalid role.
- Invalid class/subject.
- Teacher import ngoài lớp.

Chạy:

```bash
npm run typecheck
npm run lint
npm run build
git diff --check
git status --short
```

Security scan:

- Không `SERVICE_ROLE` trong `src/`.
- Không log password/JWT/token.
- Không password trong User/localStorage/response/result file.
- Không auth UID/email nội bộ từ frontend.
- Backend kiểm tra role/lớp.
- Rollback Auth user khi profile insert lỗi.

## 14. Báo cáo cuối

Báo cáo:

1. File mới/sửa.
2. Dependency Excel.
3. Cấu trúc file mẫu.
4. Parser/validation.
5. Quyền Admin/Teacher.
6. Edge Function batch.
7. Rollback từng row.
8. UI preview/result.
9. Cách password được bảo vệ.
10. Kết quả quality gates/security scan.
11. Git status/diff quan trọng.
12. Xác nhận chưa deploy/commit/push.

## 15. Hướng dẫn triển khai

Sau khi code pass, chỉ cung cấp hướng dẫn, không tự chạy:

```bash
npx supabase functions deploy import-users
```

Sau deploy test theo thứ tự:

1. Admin import 1 Student.
2. Admin import 1 Teacher.
3. Teacher import Student cùng lớp.
4. Teacher import Student ngoài lớp, phải bị từ chối.
5. File có username trùng.
6. File có role Admin.
7. File sai header.
8. Xác nhận Auth user + profile + UUID + password NULL.
9. Login tài khoản import thành công.

DỪNG sau khi code và quality gates hoàn tất. Không deploy, commit, push hoặc tạo user thật.
