// AI Tutor Edge Function — pedagogical assistant for STUDENTS taking a practice.
// Unlike the teacher ai-assistant, this function NEVER reveals the correct answer.
// It verifies server-side that the practice has allow_ai_tutor = true before responding.
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'] as const;
const MAX_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 2000;
const MAX_CONTEXT_CHARS = 8000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 1024;

const SYSTEM_INSTRUCTION = `Bạn là "Gia sư AI" hỗ trợ học sinh đang làm bài luyện tập tiếng Nhật (JLPT) trong ứng dụng học tập.
NGUYÊN TẮC SƯ PHẠM BẮT BUỘC:
- Đóng vai trò gia sư hướng dẫn tư duy: gợi mở hướng suy nghĩ, đặt câu hỏi dẫn dắt, giải thích khái niệm.
- Được giải thích từ vựng, ngữ pháp, cấu trúc câu, cách phân tích đề bài.
- Được cho ví dụ tương tự (không phải ví dụ của chính câu hỏi đang hỏi).
- TUYỆT ĐỐI KHÔNG đưa ra đáp án đúng cuối cùng (A, B, C, D hoặc nội dung đáp án) của câu hỏi học sinh đang làm.
- TUYỆT ĐỐI KHÔNG nói "đáp án đúng là X", "chọn X", "đáp án là X" dưới bất kỳ hình thức nào.
- Nếu học sinh hỏi "đáp án là gì", hãy từ chối khéo và hướng dẫn họ tự suy luận.
- Trả lời ngắn gọn, thân thiện, bằng tiếng Việt (giữ nguyên từ/kí tự tiếng Nhật), tối đa 3-4 câu.
- Chỉ dùng dữ liệu câu hỏi được cung cấp trong context để hiểu học sinh đang gặp gì — không bịa thông tin.`;

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface TutorContextPayload {
  practiceTitle?: string;
  category?: string;
  level?: string;
  passage?: string;
  questionNo?: number | null;
  questionText?: string;
  questionType?: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  studentAnswer?: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function friendlyError(status: number, message: string): string {
  if (status === 401 || status === 403) return 'Khoá API Gemini không hợp lệ. Vui lòng báo giáo viên kiểm tra cấu hình AI.';
  if (status === 429) return 'AI đang bận, đã đạt giới hạn. Vui lòng đợi vài giây rồi thử lại.';
  if (status === 400 && /API key/i.test(message)) return 'Khoá API Gemini không hợp lệ. Vui lòng báo giáo viên kiểm tra cấu hình AI.';
  if (status >= 500) return 'Dịch vụ AI tạm thời gặp sự cố. Vui lòng thử lại.';
  return 'Không nhận được phản hồi từ AI. Vui lòng thử lại.';
}

function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is ChatMessage =>
      !!m && typeof m === 'object' &&
      (m.role === 'user' || m.role === 'model') &&
      typeof m.content === 'string')
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
}

function buildContext(raw: unknown): string {
  const ctx = (raw ?? {}) as TutorContextPayload;
  const parts: string[] = [];
  if (ctx.practiceTitle) parts.push(`Bài luyện tập: ${ctx.practiceTitle} (${ctx.category ?? '?'} · ${ctx.level ?? '?'})`);
  if (ctx.passage) parts.push(`Bài đọc (tham khảo): ${String(ctx.passage).slice(0, 3000)}`);
  if (ctx.questionNo != null) {
    const opts = [ctx.optionA, ctx.optionB, ctx.optionC, ctx.optionD]
      .filter(Boolean)
      .map((v, i) => `${'ABCD'[i]}) ${v}`)
      .join(' ');
    parts.push(`Học sinh đang ở CÂU ${ctx.questionNo}: ${ctx.questionText ?? ''}\n${opts}`);
    if (ctx.questionType) parts.push(`Loại câu hỏi: ${ctx.questionType}`);
    if (ctx.studentAnswer) parts.push(`Học sinh đang chọn/trả lời: ${ctx.studentAnswer}`);
  }
  return parts.join('\n\n').slice(0, MAX_CONTEXT_CHARS);
}

async function callGeminiOnce(model: string, contents: ChatMessage[], context: string): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('AI_NOT_CONFIGURED');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [
        { role: 'user', parts: [{ text: `NGỮ CẢNH HỌC SINH:\n${context}` }] },
        ...contents.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: MAX_TOKENS,
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`Gemini API error ${res.status}: ${txt.slice(0, 500)}`);
      throw Object.assign(new Error(friendlyError(res.status, txt)), { status: res.status, detail: txt.slice(0, 300) });
    }

    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    if (!text.trim()) throw new Error('AI trả về phản hồi rỗng. Vui lòng thử lại.');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(contents: ChatMessage[], context: string): Promise<string> {
  let lastError: unknown;
  for (const model of GEMINI_MODELS) {
    try {
      return await callGeminiOnce(model, contents, context);
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number }).status;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'AI_NOT_CONFIGURED') throw err;
      if (status === 404 || status === 429 || status === 503) {
        console.error(`Gemini model ${model} unavailable (status ${status ?? '?'}), trying next.`);
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'Yêu cầu không hợp lệ.' }, 400);

    // Auth: student (or teacher/admin) must be a valid app_user.
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) return json({ error: 'Bạn cần đăng nhập để dùng Gia sư AI.' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: account } = await admin
      .from('app_users')
      .select('id, role')
      .eq('username', username)
      .eq('password', password)
      .maybeSingle();

    if (!account) return json({ error: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' }, 401);

    // Server-side enforcement: the practice MUST have allow_ai_tutor = true.
    const practiceId = typeof body.practiceId === 'string' ? body.practiceId : '';
    if (!practiceId) return json({ error: 'Thiếu thông tin bài luyện tập.' }, 400);

    const { data: practice } = await admin
      .from('practices')
      .select('allow_ai_tutor, status')
      .eq('id', practiceId)
      .maybeSingle();

    if (!practice) return json({ error: 'Không tìm thấy bài luyện tập.' }, 404);
    if (practice.allow_ai_tutor !== true) {
      return json({ error: 'Giáo viên đã tắt Gia sư AI cho bài luyện tập này.' }, 403);
    }

    const messages = sanitizeMessages(body.messages);
    if (messages.length === 0) return json({ error: 'Không có nội dung câu hỏi.' }, 400);
    const context = buildContext(body.context);

    const text = await callGemini(messages, context);
    return json({ reply: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'AI_NOT_CONFIGURED') {
      return json({ error: 'Chưa cấu hình kết nối Gemini. Vui lòng báo giáo viên.' }, 503);
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      return json({ error: 'AI phản hồi quá lâu. Vui lòng thử lại.' }, 504);
    }
    const status = (err as { status?: number }).status;
    const detail = (err as { detail?: string }).detail;
    return json(
      { error: msg || 'Có lỗi xảy ra khi liên hệ AI.', ...(detail ? { detail } : {}) },
      typeof status === 'number' && status >= 400 ? status : 500,
    );
  }
});
