# Hướng dẫn thiết lập môi trường và cấu hình QuizForms

Tài liệu này hướng dẫn cách cấu hình môi trường phát triển và kết nối dịch vụ cho dự án.

---

## 1. Biến môi trường Frontend (`.env`)

Dự án sử dụng Vite và Supabase client ở phía trình duyệt.

### Các bước thiết lập:
1. Tạo một bản sao từ file mẫu:
   ```bash
   cp .env.example .env
   ```
2. Điền thông tin dự án Supabase của bạn vào file `.env`:
   - `VITE_SUPABASE_URL`: Đường dẫn API của dự án Supabase (dạng `https://<project-id>.supabase.co`).
   - `VITE_SUPABASE_ANON_KEY`: Khóa ẩn danh (Anon/Public key) của Supabase.

> **Lưu ý bảo mật quan trọng:**
> - Tuyệt đối **KHÔNG** đưa khóa quản trị (`service_role` key) vào file `.env` phía client.
> - File `.env` chứa thông tin kết nối thực tế đã được cấu hình trong `.gitignore` để ngăn chặn việc commit nhầm lên kho lưu trữ mã nguồn.

---

## 2. Cấu hình Backend & Edge Functions (Supabase)

### A. Khởi tạo cơ sở dữ liệu
- Chạy các tệp migration trong thư mục `supabase/migrations/` trên Supabase SQL Editor theo thứ tự thời gian.

### B. Biến bí mật cho Edge Functions (`GEMINI_API_KEY`)
- Các tính năng AI (AI Assistant cho giáo viên và AI Tutor cho học sinh) sử dụng Google Gemini.
- Khóa `GEMINI_API_KEY` được lưu trữ an toàn trong **Supabase Edge Function Secrets**, không đặt ở frontend.
- Cấu hình qua Supabase CLI hoặc Dashboard:
  ```bash
  supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
  ```
- Xem chi tiết tại [docs/ai-assistant-config.md](./ai-assistant-config.md).

---

## 3. Khởi chạy ứng dụng

```bash
# Cài đặt thư viện (nếu mới clone)
npm install

# Khởi chạy chế độ phát triển
npm run dev

# Kiểm tra kiểu TypeScript
npm run typecheck

# Kiểm tra linter
npm run lint

# Đóng gói sản phẩm (Build)
npm run build
```

