// AI Assistant Edge Function — proxies Google Gemini API for the teacher AI assistant.
// The GEMINI_API_KEY lives only in Supabase edge secrets; it never reaches the browser.
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'] as const;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 4000;
const MAX_CONTEXT_CHARS = 24000;
const MAX_SOURCE_CHARS = 15000;
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_TOKENS = 4096;

const SYSTEM_INSTRUCTION = `Bạn là "Trợ lý AI" dành cho giáo viên trong ứng dụng quản lý bài luyện tập tiếng Nhật (JLPT).
Quy tắc:
- Trả lời đúng trọng tâm, ngắn gọn, dùng đúng ngôn ngữ giáo viên đang dùng (mặc định tiếng Việt), giữ nguyên thuật ngữ chuyên môn (Kanji, Kana, cách đọc).
- Ưu tiên tuyệt đối dữ liệu bài luyện tập được cung cấp trong context. KHÔNG bịa thông tin khi thiếu dữ liệu — hãy nói rõ bạn cần thêm gì.
- Bạn chỉ ĐỀ XUẤT. Không nói như thể bạn đã sửa hay lưu gì cả.
- Khi được yêu cầu tạo nội dung có cấu trúc (câu hỏi, đề xuất), trả về DUY NHẤT một khối JSON hợp lệ, không kèm markdown fences, không kèm giải thích ngoài JSON. JSON phải dùng đúng các trường questionType, questionText, optionA, optionB, optionC, optionD, correctAnswer, explanation, hint, difficulty, questionCategory, tags, points.
- Giữ nguyên nội dung tiếng Nhật (Kanji/Kana/đáp án) trừ khi giáo viên yêu cầu thay đổi.
- Không tạo loại câu hỏi ngoài 4 loại hỗ trợ: single_choice, multiple_choice, true_false, short_answer.`;

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface PracticeContextPayload {
  practice?: Record<string, unknown>;
  questions?: Record<string, unknown>[];
  folderPath?: string;
  selectedQuestionNo?: number | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function friendlyError(status: number, message: string): string {
  if (status === 401 || status === 403) return 'Khoá API Gemini không hợp lệ hoặc đã bị thu hồi. Vui lòng kiểm tra cấu hình AI phía máy chủ.';
  if (status === 429) return 'AI đang bận hoặc đã đạt giới hạn sử dụng. Vui lòng thử lại sau ít phút.';
  if (status === 400 && /API key/i.test(message)) return 'Khoá API Gemini không hợp lệ. Vui lòng kiểm tra cấu hình AI phía máy chủ.';
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

function sanitizeContext(raw: unknown): string {
  const ctx = (raw ?? {}) as PracticeContextPayload;
  const parts: string[] = [];
  if (ctx.folderPath) parts.push(`Vị trí thư mục: ${ctx.folderPath}`);
  if (ctx.practice) {
    const p = ctx.practice;
    const meta = [
      p.title, p.category, p.level, p.status,
      Array.isArray(p.targetClasses) ? p.targetClasses.join(', ') : '',
    ].filter(Boolean).join(' | ');
    parts.push(`Bài luyện tập: ${meta}`);
    if (p.passage) parts.push(`Bài đọc: ${String(p.passage).slice(0, 2000)}`);
  }
  if (Array.isArray(ctx.questions)) {
    const list = ctx.questions.slice(0, 100).map((q) => {
      const opts = ['A', 'B', 'C', 'D']
        .map((L) => q[`option${L}` as 'optionA' | 'optionB' | 'optionC' | 'optionD'])
        .filter(Boolean)
        .map((v, i) => `${'ABCD'[i]}) ${v}`)
        .join(' ');
      return [
        `Câu ${q.questionNo ?? '?'}`,
        `loại=${q.questionType ?? '?'}`,
        q.questionText,
        opts,
        `đáp án=${q.correctAnswer ?? '(chưa có)'}`,
        q.explanation ? `giải thích=${q.explanation}` : null,
        q.hint ? `gợi ý=${q.hint}` : null,
        `độ khó=${q.difficulty ?? 'medium'} điểm=${q.points ?? 1}`,
        q.tags ? `tags=${q.tags}` : null,
      ].filter(Boolean).join(' | ');
    });
    parts.push(`Danh sách câu hỏi:\n${list.join('\n')}`);
  }
  if (ctx.selectedQuestionNo != null) {
    parts.push(`>>> Giáo viên đang tập trung vào: CÂU ${ctx.selectedQuestionNo} <<<`);
  }
  return parts.join('\n\n').slice(0, MAX_CONTEXT_CHARS);
}

function sanitizeSourceText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length > MAX_SOURCE_CHARS) {
    throw new Error(`Nội dung nguồn quá dài (${cleaned.length.toLocaleString('vi-VN')} ký tự, tối đa ${MAX_SOURCE_CHARS.toLocaleString('vi-VN')}). Hãy chia nhỏ tài liệu thành nhiều lần tạo.`);
  }
  return cleaned;
}

async function callGeminiOnce(
  model: string,
  contents: ChatMessage[],
  context: string,
): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('AI_NOT_CONFIGURED');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [
        { role: 'user', parts: [{ text: `CONTEXT BÀI LUYỆN TẬP HIỆN TẠI:\n${context}` }] },
        ...contents.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
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
      throw Object.assign(new Error(friendlyError(res.status, txt)), {
        status: res.status,
        detail: txt.slice(0, 300),
      });
    }

    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    if (!text.trim()) throw new Error('AI trả về phản hồi rỗng. Vui lòng thử lại.');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// Tries the preferred model first; on 404 (unknown model) / 429 / 503 (overloaded)
// it falls back to the next one so a single busy model cannot block the panel.
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

    // The app uses its own username/password auth (app_users table), not Supabase Auth.
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) return json({ error: 'Bạn cần đăng nhập để dùng trợ lý AI.' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: account } = await admin
      .from('app_users')
      .select('role')
      .eq('username', username)
      .eq('password', password)
      .maybeSingle();

    if (!account) return json({ error: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' }, 401);
    if (account.role !== 'teacher' && account.role !== 'admin') {
      return json({ error: 'Chỉ giáo viên và quản trị viên mới được dùng trợ lý AI.' }, 403);
    }

    const messages = sanitizeMessages(body.messages);
    if (messages.length === 0) return json({ error: 'Không có nội dung câu hỏi.' }, 400);
    const context = sanitizeContext(body.context);

    let sourceText = '';
    try {
      sourceText = sanitizeSourceText(body.sourceText);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'Nội dung nguồn không hợp lệ.' }, 400);
    }
    if (sourceText) {
      const sourceTurn: ChatMessage = {
        role: 'user',
        content: `NỘI DUNG NGUỒN giáo viên cung cấp (bắt buộc dùng làm căn cứ chính để tạo câu hỏi — mọi câu hỏi và đáp án phải bám vào nội dung này, không bịa kiến thức ngoài nguồn; nếu nguồn không đủ thì chỉ tạo số câu đáng tin cậy và báo rõ):
<<<SOURCE>>>
${sourceText}
<<<END SOURCE>>>`,
      };
      messages.push(sourceTurn);
    }

    const text = await callGemini(messages, context);
    return json({ reply: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'AI_NOT_CONFIGURED') {
      return json({ error: 'Chưa cấu hình kết nối Gemini. Vui lòng kiểm tra cấu hình AI phía máy chủ.' }, 503);
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      return json({ error: 'AI phản hồi quá lâu (hết thời gian chờ). Vui lòng thử lại.' }, 504);
    }
    const status = (err as { status?: number }).status;
    const detail = (err as { detail?: string }).detail;
    return json(
      { error: msg || 'Có lỗi xảy ra khi liên hệ AI.', ...(detail ? { detail } : {}) },
      typeof status === 'number' && status >= 400 ? status : 500,
    );
  }
});
