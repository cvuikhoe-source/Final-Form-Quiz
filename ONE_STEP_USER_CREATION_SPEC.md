# ONE-STEP USER CREATION SPEC — QUIZFORMS

## 0. Mục tiêu và điểm dừng

Triển khai mã nguồn cho tính năng **Tạo tài khoản một bước**:

1. Admin nhập một lần: họ tên, username, mật khẩu ban đầu, xác nhận mật khẩu, vai trò, lớp, môn học.
2. Frontend gọi Edge Function bằng JWT của Admin.
3. Edge Function xác thực người gọi và quyền Admin.
4. Edge Function tạo Supabase Auth user với email nội bộ `<username>@quizforms.internal`.
5. Edge Function tạo profile `public.app_users` và gắn `auth_user_id` tự động.
6. Không lưu plaintext password cho tài khoản mới.
7. Không yêu cầu Admin vào Supabase Dashboard, copy UID hay chạy SQL mapping.

### Ràng buộc bắt buộc

- Chỉ chuẩn bị code, migration và hướng dẫn triển khai.
- Không chạy migration.
- Không deploy Edge Function.
- Không commit.
- Không push.
- Không tạo user thật.
- Không chạy `git reset`, `git stash`, `supabase db reset`, `supabase db push`, `supabase migration up`, `supabase functions deploy`.
- Nếu quality gate thất bại, dừng và báo lỗi chính xác.

## 1. Bối cảnh hiện tại

- Branch: `master`.
- Commit hiện tại: `8605d2a feat(auth): migrate teacher login to Supabase`.
- Tag: `checkpoint-before-one-step-user-creation`.
- Admin và Teacher đã dùng Supabase Auth.
- Student `hs_10a1` vẫn dùng login legacy.
- `public.app_users` có:
  - `id text primary key`
  - `username text unique not null`
  - `password text not null`
  - `full_name text not null`
  - `role text not null`
  - `assigned_classes text[] not null`
  - `allowed_subjects text[] not null`
  - `created_at timestamptz not null`
  - `auth_user_id uuid null`
- Đã có partial unique index cho `auth_user_id IS NOT NULL`.
- Không được làm hỏng login/logout hiện tại.
- Không được đưa `SUPABASE_SERVICE_ROLE_KEY` vào frontend.

## 2. Giai đoạn 0 — Phân tích trước khi sửa

Chạy:

```bash
git status --short
git log -5 --oneline
git tag
```

Nếu working tree không sạch: dừng, báo file thay đổi, không sửa/stash/reset.

Đọc và phân tích tối thiểu:

- `src/components/UserManagementView.tsx`
- `src/components/LoginScreen.tsx`
- `src/App.tsx`
- `src/storage.ts`
- `src/types.ts`
- `src/lib/supabase.ts`
- `supabase/functions/ai-assistant/index.ts`
- `supabase/functions/ai-tutor/index.ts`
- migration tạo `app_users`
- migration thêm `auth_user_id`

Tìm chính xác:

- Form Create/Edit user hiện tại.
- Hàm `createUser`, `saveUsers`, `loadUsers`.
- Cách Admin session được lưu và lấy access token.
- Cách refresh danh sách user.
- Mọi chỗ dùng/hiển thị/lưu `user.password`.
- Mọi chỗ INSERT/UPDATE `app_users`.

Không đoán cấu trúc hoặc tên hàm.

## 3. Giai đoạn 1 — Migration cho password nullable

Tạo đúng một migration mới trong `supabase/migrations/`, tên theo timestamp hiện tại và hậu tố:

`allow_null_password_for_auth_users.sql`

Nội dung tương đương:

```sql
-- New Auth-backed users keep passwords only in Supabase Auth.
-- This legacy column remains temporarily for unmigrated users.
-- Remove the column only after the legacy migration is fully completed.
ALTER TABLE public.app_users
ALTER COLUMN password DROP NOT NULL;
```

Chỉ cho phép thay đổi nullable. Không xóa cột, không UPDATE dữ liệu, không đổi RLS, không trigger, không thực thi migration.

## 4. Giai đoạn 2 — Edge Function `admin-create-user`

Tạo:

`supabase/functions/admin-create-user/index.ts`

### 4.1 HTTP và CORS

- Chỉ chấp nhận `POST`.
- Xử lý `OPTIONS` và CORS theo convention hiện tại.
- Header bắt buộc:
  - `Authorization: Bearer <Admin JWT>`
  - `Content-Type: application/json`

Body:

```json
{
  "username": "hs_10a2",
  "password": "initial-password",
  "fullName": "Nguyễn Văn B",
  "role": "student",
  "assignedClasses": ["10A2"],
  "allowedSubjects": []
}
```

Frontend không gửi `auth_user_id`, email nội bộ, service role key, caller role, app profile ID hay token trong body.

### 4.2 Xác thực người gọi

1. Đọc `Authorization` header và kiểm tra định dạng Bearer.
2. Thiếu/sai header: HTTP 401.
3. Xác minh JWT bằng phương pháp phù hợp với Supabase SDK hiện tại, không chỉ decode payload.
4. Lấy Auth UID thật của người gọi.
5. Không tin caller ID/role/email từ body.
6. Token hết hạn/không hợp lệ: HTTP 401, không lộ JWT hoặc chi tiết nội bộ.

### 4.3 Kiểm tra quyền Admin

Dùng server-side Admin client truy vấn `public.app_users` theo:

`auth_user_id = callerAuthUser.id`

Chỉ select:

`id, username, role, auth_user_id`

Chỉ tiếp tục khi profile tồn tại, `role = 'admin'` và UID khớp. Nếu không: HTTP 403, không tạo dữ liệu.

### 4.4 Validate input

Username:

- String bắt buộc, trim, lowercase.
- 3–50 ký tự.
- Regex `^[a-z0-9._-]+$`.
- Không `@`, khoảng trắng, slash/backslash.

Password:

- String bắt buộc.
- 8–128 ký tự.
- Không trim làm thay đổi password.
- Không log/response/lỗi chứa password.

Full name:

- String bắt buộc, trim, không rỗng, tối đa 120 ký tự.

Role:

- Chỉ `teacher` hoặc `student`.
- Không tạo `admin` từ chức năng này.

Arrays:

- `assignedClasses`, `allowedSubjects` phải là string arrays hoặc mặc định `[]`.
- Trim, bỏ rỗng, bỏ trùng, giới hạn số lượng và độ dài hợp lý.

Input sai: HTTP 400, không tạo Auth/profile.

### 4.5 Kiểm tra trùng

Kiểm tra `public.app_users` theo normalized username, chỉ select `id, username, auth_user_id`.

Nếu đã tồn tại: HTTP 409, code `USERNAME_EXISTS`.

Tạo email phía server:

```ts
const internalEmail = `${normalizedUsername}@quizforms.internal`;
```

Nếu Admin API báo email tồn tại, trả HTTP 409, không lộ chi tiết Auth provider.

### 4.6 Tạo Auth user

Khởi tạo Admin client chỉ trong Edge Function bằng:

- `Deno.env.get('SUPABASE_URL')`
- `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`

Gọi tương đương:

```ts
supabaseAdmin.auth.admin.createUser({
  email: internalEmail,
  password,
  email_confirm: true,
  user_metadata: {
    username: normalizedUsername,
    full_name: normalizedFullName
  }
})
```

Không log password/JWT/token/secret. Không trả Auth session.

### 4.7 Tạo profile

- Sinh `appUserId` theo convention hiện tại.
- Không dùng Auth UUID làm `app_users.id`.
- INSERT:
  - `id = appUserId`
  - `username = normalizedUsername`
  - `password = NULL`
  - `full_name = normalizedFullName`
  - `role`
  - `assigned_classes`
  - `allowed_subjects`
  - `auth_user_id = authUser.id`
- Không lưu plaintext password.
- Return đúng các trường profile cần thiết, không return password.

### 4.8 Compensating rollback

Nếu Auth user tạo thành công nhưng INSERT profile thất bại:

1. Gọi `supabaseAdmin.auth.admin.deleteUser(authUser.id)`.
2. Rollback thành công: HTTP 500, thông báo chung.
3. Rollback thất bại: log server tối thiểu Auth UID, username, timestamp, safe error code/message. Không log password/JWT/secret/stack cho frontend.
4. Không báo thành công nếu profile chưa tạo.

### 4.9 Response chuẩn

Thành công HTTP 201:

```json
{
  "success": true,
  "user": {
    "id": "...",
    "username": "...",
    "fullName": "...",
    "role": "student",
    "assignedClasses": [],
    "allowedSubjects": []
  }
}
```

Lỗi:

```json
{
  "success": false,
  "error": {
    "code": "USERNAME_EXISTS",
    "message": "Tên đăng nhập đã tồn tại."
  }
}
```

Mã tối thiểu: `METHOD_NOT_ALLOWED`, `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_INPUT`, `USERNAME_EXISTS`, `AUTH_CREATE_FAILED`, `PROFILE_CREATE_FAILED`, `INTERNAL_ERROR`.

Không return password, token, session, service role, stack trace.

## 5. Giai đoạn 3 — Frontend service

Tạo `src/lib/adminUserService.ts`, trừ khi project có convention rõ ràng hơn.

Service phải:

1. Dùng client hiện có từ `src/lib/supabase.ts`.
2. `supabase.auth.getSession()` và kiểm tra access token.
3. Không có session: báo cần đăng nhập lại và không request.
4. Gọi `admin-create-user`, ưu tiên `supabase.functions.invoke()`.
5. Xác minh SDK có gắn JWT; nếu cần truyền `Authorization: Bearer <token>` rõ ràng.
6. Body chỉ gồm username, password, fullName, role, assignedClasses, allowedSubjects.
7. Không gửi service role/auth_user_id/appUserId/caller role/internal email.
8. Không log/lưu password.
9. Parse 400/401/403/409/500 và trả thông báo phù hợp.
10. Trả User profile chuẩn hóa không có password.

## 6. Giai đoạn 4 — Nâng cấp form tạo tài khoản

Sửa component quản lý user thực tế sau khi đọc code, dự kiến `src/components/UserManagementView.tsx`.

Form Create có:

- Họ và tên
- Tên đăng nhập
- Mật khẩu ban đầu
- Xác nhận mật khẩu
- Vai trò
- Lớp được phân công
- Môn học được phép

Chỉ role `teacher` và `student`.

Yêu cầu:

- Admin chỉ nhập username, không thấy `@quizforms.internal`.
- Username trim/lowercase.
- Password 8–128 ký tự, confirm khớp, input type password.
- Không hiển thị/điền password cũ.
- Không INSERT `app_users` trực tiếp từ frontend.
- Không gọi legacy `createUser` cho user mới.
- Gọi `adminUserService`.
- Disable submit, chống double submit, có trạng thái đang tạo.
- Thành công: cập nhật list, đóng modal, xóa password states, toast.
- Lỗi: giữ modal, thông báo an toàn, không log password.
- Nếu dùng chung modal Create/Edit: password fields chỉ có ở Create; Edit không đọc/hiển thị password.

## 7. Giai đoạn 5 — User type và storage

Rà soát toàn bộ `User.password`.

Mục tiêu:

- User profile mới không chứa password.
- Password không vào localStorage hoặc response.

Nếu an toàn, đổi:

```ts
password: string
```

thành:

```ts
password?: string
```

Sửa lỗi TypeScript tối thiểu. Không dùng `any`, `@ts-ignore`, không tắt strict. Student legacy phải vẫn hoạt động. Legacy loader có thể tạm đọc password, nhưng Auth user/session không chứa password.

## 8. Giai đoạn 6 — Login tương thích

Giữ:

- Admin và Teacher qua Supabase Auth.
- `hs_10a1` legacy.
- Logout hiện tại.
- Mapping hiện tại.

Tài khoản mới có Auth user + `auth_user_id` + DB password NULL nên phải đăng nhập được bằng username.

Ưu tiên:

1. Normalize username.
2. Dựng email nội bộ.
3. Thử Supabase Auth trước.
4. Auth thành công: query profile theo `auth_user_id`, xác minh username/role.
5. Chỉ fallback legacy khi đã xác định profile có `auth_user_id IS NULL`.
6. Không fallback legacy chỉ vì Supabase password sai.
7. Không tạo đường bypass Supabase Auth cho tài khoản đã migrate.

Nếu không thể triển khai fallback an toàn mà không làm yếu bảo mật: giữ LoginScreen hiện tại, báo rõ giới hạn, không làm hỏng các tài khoản đang dùng.

## 9. Giai đoạn 7 — Nút Mật khẩu tạm thời

Không triển khai `admin-reset-password` đầy đủ trong nhiệm vụ này.

Phải:

- Loại password khỏi Edit form.
- Không hiển thị password hiện tại.
- Auth user có `auth_user_id`: không UPDATE `app_users.password`, không báo thành công giả; hiển thị: `Chức năng đặt lại mật khẩu Supabase Auth sẽ được nâng cấp ở bước tiếp theo.`
- Legacy user: giữ hành vi cần thiết và ghi rõ là legacy.
- Không xóa hoàn toàn nút Mật khẩu.

## 10. Giai đoạn 8 — Quality gates và security scan

Chạy:

```bash
npm run typecheck
npm run lint
npm run build
git diff --check
git status --short
```

Nếu có test command hợp lệ, chạy test liên quan.

Nếu bất kỳ lệnh nào lỗi: dừng, báo chính xác, không commit/push, không tuyên bố hoàn thành.

Tìm kiếm bảo mật:

- `SUPABASE_SERVICE_ROLE_KEY` trong `src/`
- `service_role` trong frontend
- console log password/token
- `select('*')` trên `app_users` trong code mới
- password trong Create/Edit
- raw password gán vào User
- password vào localStorage
- password trong Edge response
- hardcoded secret

Xác nhận service role chỉ nằm trong Edge Function qua `Deno.env`; không in `.env`; không chạy migration/deploy/commit/push/tạo user thật.

## 11. Giai đoạn 9 — Báo cáo cuối

Báo cáo:

1. File mới và file sửa.
2. Toàn bộ migration.
3. Kiến trúc Edge Function.
4. JWT và quyền Admin.
5. Validation.
6. Tạo Auth/profile và rollback.
7. Frontend service.
8. Form Create.
9. User type/storage.
10. Login tài khoản mới.
11. Hành vi nút Mật khẩu.
12. Kết quả mọi quality gates/security scans.
13. `git status --short` và diff quan trọng.
14. Xác nhận chưa migration/deploy/commit/push/tạo user.

## 12. Giai đoạn 10 — Hướng dẫn triển khai thủ công

Cung cấp chính xác:

1. Backup `app_users`.
2. Áp dụng migration password NULL.
3. Deploy `admin-create-user`.
4. Kiểm tra JWT.
5. Test tạo Teacher và Student thử nghiệm.
6. Xác nhận Auth user, email nội bộ, confirmed, profile, UID mapping, DB password NULL.
7. Test login.
8. Test username trùng, password sai chuẩn, 401, Teacher bị 403.
9. Test rollback profile failure.
10. Rollback thủ công.

## 13. Điểm dừng bắt buộc

Sau khi code, quality gates và báo cáo hoàn tất:

- Dừng lại.
- Không chạy migration.
- Không deploy Edge Function.
- Không commit.
- Không push.
- Không tạo user thật.
- Chờ review.
