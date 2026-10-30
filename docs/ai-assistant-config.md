# AI Trợ lý cho giáo viên — Cấu hình

## 1. Biến môi trường cần tạo

- `GEMINI_API_KEY` — khoá API của Google Gemini (lấy tại https://aistudio.google.com/apikey).
- Được lưu dưới dạng **Supabase Edge Function secret** (máy chủ), KHÔNG phải biến `VITE_*` phía frontend.

## 2. Vị trí cấu hình

- Edge Function: `supabase/functions/ai-assistant/index.ts`
- Secret được đặt qua Supabase Dashboard → Edge Functions → Secrets (tên: `GEMINI_API_KEY`).

## 3. Cách kiểm tra kết nối

1. Mở trang **Luyện tập** → mở một bài → bấm **Hỏi AI**.
2. Nếu panel báo *"Chưa cấu hình kết nối Gemini"* → secret chưa được đặt hoặc sai tên.
3. Nếu báo *"Khoá API Gemini không hợp lệ"* → secret đã đặt nhưng key sai/hết hiệu lực.
4. Hỏi thử: "Tóm tắt bài này" — nhận được trả lời nghĩa là kết nối hoạt động.

## 4. Lưu ý bảo mật

- KHÔNG ghi khoá API thật vào file này hay bất kỳ file nào trong source code.
- Khoá API chỉ tồn tại phía máy chủ; frontend chỉ nhận nội dung trả lời.
- Khoá không bao giờ được log ra console hay trả về trong response.
