import type { Practice, PracticeQuestionFull, PracticeQuestionType, PracticeDifficulty } from '@/types';
import { AI_LIMITS } from '@/lib/aiConfig';

// ─── Types ─────────────────────────────────────────────────────

export interface AIMessage {
  role: 'user' | 'model';
  content: string;
}

export interface AIQuestionProposal {
  questionType: PracticeQuestionType;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  explanation: string;
  hint: string;
  difficulty: PracticeDifficulty;
  questionCategory: string;
  tags: string;
  imageUrl: string;
  points: number;
}

export interface AIAnswerReview {
  questionNo: number;
  status: 'ok' | 'review' | 'warning';
  currentAnswer: string;
  suggestedAnswer: string | null;
  reason: string;
}

export interface AIFieldProposal {
  questionNo: number;
  explanation: string | null;
  hint: string | null;
}

export interface AIDuplicateGroup {
  questionNos: number[];
  reason: string;
}

export type AIResult =
  | { kind: 'text'; text: string }
  | { kind: 'questions'; proposals: AIQuestionProposal[] }
  | { kind: 'answerReview'; reviews: AIAnswerReview[] }
  | { kind: 'fields'; proposals: AIFieldProposal[] }
  | { kind: 'duplicates'; groups: AIDuplicateGroup[] };

export interface AIContext {
  practice: Practice | null;
  questions: PracticeQuestionFull[];
  folderPath: string;
  selectedQuestionNo: number | null;
}

// ─── Error with friendly Vietnamese message ────────────────────

export class AIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIError';
  }
}

// ─── Context serialization (only what AI needs) ────────────────

export function buildAIContextPayload(ctx: AIContext) {
  const { practice, questions, folderPath, selectedQuestionNo } = ctx;
  return {
    practice: practice
      ? {
          title: practice.title,
          category: practice.category,
          level: practice.level,
          status: practice.status,
          targetClasses: practice.targetClasses,
          passage: practice.passage || undefined,
        }
      : null,
    questions: questions.slice(0, AI_LIMITS.maxQuestionsInContext).map((q) => ({
      questionNo: q.questionNo,
      questionType: q.questionType,
      questionText: q.questionText,
      optionA: q.optionA || undefined,
      optionB: q.optionB || undefined,
      optionC: q.optionC || undefined,
      optionD: q.optionD || undefined,
      correctAnswer: q.correctAnswer || undefined,
      explanation: q.explanation || undefined,
      hint: q.hint || undefined,
      difficulty: q.difficulty,
      points: q.points,
      questionCategory: q.questionCategory || undefined,
      tags: q.tags || undefined,
    })),
    folderPath,
    selectedQuestionNo,
  };
}

// ─── JSON extraction & validation ──────────────────────────────

export function extractAndParseJSON(rawText: string): unknown {
  if (!rawText || !rawText.trim()) throw new AIError('Phản hồi từ AI rỗng. Dữ liệu chưa được lưu.');

  let cleanText = rawText.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstObject = cleanText.indexOf('{');
  const firstArray = cleanText.indexOf('[');
  const starts = [firstObject, firstArray].filter((index) => index >= 0);
  const firstStart = starts.length > 0 ? Math.min(...starts) : -1;
  const lastObject = cleanText.lastIndexOf('}');
  const lastArray = cleanText.lastIndexOf(']');
  const lastEnd = Math.max(lastObject, lastArray);
  if (firstStart >= 0 && lastEnd > firstStart) {
    cleanText = cleanText.slice(firstStart, lastEnd + 1);
  }

  try {
    return JSON.parse(cleanText) as unknown;
  } catch (error) {
    console.error('AI Raw Output:', rawText);
    const reason = error instanceof Error ? error.message : 'JSON không hợp lệ';
    throw new AIError(`AI trả về JSON không hợp lệ (${reason}). Dữ liệu chưa được lưu.`);
  }
}

function extractJsonBlock(text: string): unknown {
  return extractAndParseJSON(text);
}

const VALID_TYPES: PracticeQuestionType[] = ['single_choice', 'multiple_choice', 'true_false', 'short_answer'];
const VALID_DIFFICULTIES: PracticeDifficulty[] = ['easy', 'medium', 'hard'];

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parseProposal(raw: unknown): AIQuestionProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const questionType = str(r.questionType ?? r.question_type ?? r.type) as PracticeQuestionType;
  if (!VALID_TYPES.includes(questionType)) return null;

  const questionText = str(r.questionText ?? r.question_text ?? r.question);
  if (!questionText) return null;

  const optionList = Array.isArray(r.options) ? r.options.map(str) : [];
  const optionA = str(r.optionA ?? r.option_a) || optionList[0] || (questionType === 'true_false' ? 'Đúng' : '');
  const optionB = str(r.optionB ?? r.option_b) || optionList[1] || (questionType === 'true_false' ? 'Sai' : '');
  const optionC = str(r.optionC ?? r.option_c) || optionList[2] || '';
  const optionD = str(r.optionD ?? r.option_d) || optionList[3] || '';

  if (questionType !== 'short_answer' && (!optionA || !optionB)) return null;

  let correctAnswer = str(r.correctAnswer ?? r.correct_answer ?? r.answer);
  if (questionType !== 'short_answer') {
    // Normalize to sorted letters, and validate referenced options exist
    const letters = correctAnswer.toUpperCase().replace(/[1-4]/g, (digit) => 'ABCD'[Number(digit) - 1]).replace(/[^A-D,]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    if (letters.length === 0) return null;
    const unique = Array.from(new Set(letters)).sort();
    if (questionType === 'single_choice' || questionType === 'true_false') {
      if (unique.length !== 1) return null;
    }
    const missing = unique.filter((l) => !({ A: optionA, B: optionB, C: optionC, D: optionD }[l as 'A' | 'B' | 'C' | 'D']));
    if (missing.length > 0) return null;
    correctAnswer = unique.join(',');
  } else if (!correctAnswer) {
    return null;
  }

  const rawDifficulty = str(r.difficulty ?? r.level).toLowerCase();
  const difficulty = (VALID_DIFFICULTIES.includes(rawDifficulty as PracticeDifficulty)
    ? rawDifficulty
    : 'medium') as PracticeDifficulty;

  const pointsRaw = Number(r.points);
  const points = Number.isFinite(pointsRaw) && pointsRaw > 0 && pointsRaw <= 100 ? pointsRaw : 1;

  return {
    questionType,
    questionText,
    optionA, optionB, optionC, optionD,
    correctAnswer,
    explanation: str(r.explanation),
    hint: str(r.hint),
    difficulty,
    questionCategory: str(r.questionCategory ?? r.category),
    tags: str(r.tags),
    imageUrl: str(r.imageUrl ?? r.image_url),
    points,
  };
}

function looksLikeDuplicate(a: AIQuestionProposal, b: AIQuestionProposal): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  return norm(a.questionText) === norm(b.questionText);
}

function validateProposals(parsed: unknown): AIQuestionProposal[] {
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { questions?: unknown[] })?.questions)
      ? (parsed as { questions: unknown[] }).questions
      : null;
  if (!arr || arr.length === 0) {
    throw new AIError('AI trả về dữ liệu chưa đúng định dạng. Dữ liệu chưa được lưu.');
  }
  const proposals = arr
    .slice(0, AI_LIMITS.maxQuestionCount)
    .map(parseProposal)
    .filter((p): p is AIQuestionProposal => p !== null);

  if (proposals.length === 0) {
    throw new AIError('AI trả về câu hỏi không hợp lệ theo định dạng của ứng dụng. Dữ liệu chưa được lưu.');
  }
  // drop exact duplicates within the batch
  const seen: AIQuestionProposal[] = [];
  for (const p of proposals) {
    if (!seen.some((s) => looksLikeDuplicate(s, p))) seen.push(p);
  }
  return seen;
}

function parseAnswerReview(parsed: unknown): AIAnswerReview[] {
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { reviews?: unknown[] })?.reviews)
      ? (parsed as { reviews: unknown[] }).reviews
      : null;
  if (!arr) throw new AIError('AI trả về dữ liệu chưa đúng định dạng.');
  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((r) => {
      const questionNo = Number(r.questionNo ?? r.question_no);
      const rawStatus = str(r.status).toLowerCase();
      const status: AIAnswerReview['status'] =
        rawStatus === 'review' || rawStatus === 'warning' ? (rawStatus === 'warning' ? 'warning' : 'review') : 'ok';
      return {
        questionNo: Number.isFinite(questionNo) ? questionNo : 0,
        status,
        currentAnswer: str(r.currentAnswer ?? r.current_answer),
        suggestedAnswer: r.suggestedAnswer ? str(r.suggestedAnswer) : r.suggested_answer ? str(r.suggested_answer) : null,
        reason: str(r.reason),
      };
    })
    .filter((r) => r.questionNo > 0);
}

function parseFieldProposals(parsed: unknown): AIFieldProposal[] {
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { proposals?: unknown[] })?.proposals)
      ? (parsed as { proposals: unknown[] }).proposals
      : null;
  if (!arr) throw new AIError('AI trả về dữ liệu chưa đúng định dạng.');
  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((r) => {
      const questionNo = Number(r.questionNo ?? r.question_no);
      return {
        questionNo: Number.isFinite(questionNo) ? questionNo : 0,
        explanation: r.explanation == null ? null : str(r.explanation) || null,
        hint: r.hint == null ? null : str(r.hint) || null,
      };
    })
    .filter((r) => r.questionNo > 0 && (r.explanation !== null || r.hint !== null));
}

function parseDuplicates(parsed: unknown): AIDuplicateGroup[] {
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { groups?: unknown[] })?.groups)
      ? (parsed as { groups: unknown[] }).groups
      : null;
  if (!arr) throw new AIError('AI trả về dữ liệu chưa đúng định dạng.');
  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((r) => {
      const nos = Array.isArray(r.questionNos ?? r.question_nos)
        ? (r.questionNos ?? r.question_nos) as unknown[]
        : Array.isArray(r.questions) ? r.questions as unknown[] : [];
      return {
        questionNos: nos.map(Number).filter((n) => Number.isFinite(n) && n > 0),
        reason: str(r.reason),
      };
    })
    .filter((g) => g.questionNos.length >= 2);
}

// ─── Prompt builders ───────────────────────────────────────────

function jsonOnlyInstruction(): string {
  return 'Trả về DUY NHẤT JSON hợp lệ (không markdown, không giải thích ngoài JSON).';
}

// Light normalization for text pasted from PDFs/Word: fixes broken line breaks and
// repeated page furniture WITHOUT removing any meaningful content.
export function normalizeSourceText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sourceQuestionPrompt(opts: {
  topic: string;
  questionType: PracticeQuestionType | 'any';
  difficulty: PracticeDifficulty | 'any';
  points: number;
  withExplanation: boolean;
  withHint: boolean;
}): string {
  return `Bạn là một trợ lý giáo dục chuyên nghiệp. NHIỆM VỤ BẮT BUỘC: tạo câu hỏi luyện tập bằng cách TRÍCH XUẤT từ NỘI DUNG NGUỒN do giáo viên cung cấp (nguồn nằm giữa <<<SOURCE>>> và <<<END SOURCE>>> trong các tin nhắn ngay sau prompt này).
${TYPE_NOTE}
${opts.questionType !== 'any' ? `Loại câu hỏi: ${opts.questionType}.` : 'Chọn loại câu hỏi phù hợp với nội dung.'}
${opts.topic ? `Chủ đề tham khảo (KHÔNG ưu tiên hơn nguồn): ${opts.topic}.` : ''}
${opts.difficulty !== 'any' ? `Độ khó: ${opts.difficulty}.` : 'Giữ độ khó phù hợp với đề trong nguồn.'}
Ngôn ngữ trình bày: Tiếng Việt (giữ nguyên phần tiếng Nhật / thuật ngữ trong nguồn).
Điểm mỗi câu: ${opts.points}.
${opts.withExplanation ? 'Mỗi câu PHẢI có explanation.' : 'Không cần explanation.'}
${opts.withHint ? 'Mỗi câu PHẢI có hint.' : 'Không cần hint.'}
QUY TẮC NGHIÊM NGẶT:
1. Bạn CHỈ ĐƯỢC PHÉP dựa vào các câu hỏi, câu văn, danh sách từ vựng, ngữ pháp hoặc bài đọc CÓ TRONG NỘI DUNG NGUỒN để trích xuất thành câu hỏi bài tập.
2. TUYỆT ĐỐI KHÔNG tự ý sáng tác câu hỏi mới nằm ngoài nội dung nguồn khi trong nguồn đã có sẵn câu hỏi và các lựa chọn đáp án.
3. Nếu nội dung nguồn là dạng đề bài có sẵn (ví dụ các câu tiếng Nhật có 4 lựa chọn 1, 2, 3, 4 như kanji, ngữ pháp):
   - Trích xuất chính xác câu đề bài làm 'questionText' (giữ nguyên tiếng Nhật).
   - Lấy đúng các phương án lựa chọn làm 'optionA'–'optionD' theo đúng thứ tự 1, 2, 3, 4.
   - Xác định phương án đúng làm 'correctAnswer' (A/B/C/D tương ứng 1/2/3/4; với short_answer dùng nội dung đáp án).
   - Bổ sung giải thích ngắn gọn, dễ hiểu vào 'explanation'.
4. ĐỒNG BỘ SỐ LƯỢNG: nếu nguồn có sẵn số câu cụ thể, ưu tiên trích xuất đủ số câu có trong nguồn; "Số lượng câu" chỉ là giới hạn trên khi nguồn dài hơn.
5. Nếu nguồn không đủ: chỉ tạo số câu đáng tin cậy, kèm câu thông báo đầu tiên (loại short_answer) nói rõ điều đó.
6. Không trùng với câu hỏi đã có trong bài luyện tập.
${jsonOnlyInstruction()}
Định dạng JSON:
{"questions":[{"questionType":"single_choice","questionText":"...","optionA":"...","optionB":"...","optionC":"...","optionD":"...","correctAnswer":"A","explanation":"...","hint":"...","difficulty":"easy|medium|hard","questionCategory":"...","tags":"tag1,tag2","points":${opts.points}}]}`;
}

export function buildSourceGeneratePrompt(form: {
  count?: number;
  topic?: string;
  questionType?: PracticeQuestionType | 'any';
  difficulty?: PracticeDifficulty | 'any';
  points?: number;
  withExplanation?: boolean;
  withHint?: boolean;
}): string {
  return sourceQuestionPrompt({
    topic: form.topic ?? '',
    questionType: form.questionType ?? 'any',
    difficulty: form.difficulty ?? 'any',
    points: form.points ?? 1,
    withExplanation: form.withExplanation ?? true,
    withHint: form.withHint ?? false,
  });
}

const TYPE_NOTE = 'Loại câu hỏi chỉ được là 1 trong: single_choice, multiple_choice, true_false, short_answer.';

function generatePrompt(opts: {
  count: number;
  topic: string;
  questionType: PracticeQuestionType | 'any';
  difficulty: PracticeDifficulty | 'any';
  language: string;
  points: number;
  withExplanation: boolean;
  withHint: boolean;
}): string {
  return `Tạo ${opts.count} câu hỏi luyện tập mới dựa trên nội dung và phong cách của bài hiện tại.
${TYPE_NOTE}
${opts.questionType !== 'any' ? `Loại câu hỏi: ${opts.questionType}.` : 'Chọn loại câu hỏi phù hợp với nội dung.'}
${opts.topic ? `Chủ đề: ${opts.topic}.` : ''}
${opts.difficulty !== 'any' ? `Độ khó: ${opts.difficulty}.` : ''}
Ngôn ngữ trình bày: ${opts.language}.
Điểm mỗi câu: ${opts.points}.
${opts.withExplanation ? 'Mỗi câu PHẢI có explanation.' : 'Không cần explanation.'}
${opts.withHint ? 'Mỗi câu PHẢI có hint.' : 'Không cần hint.'}
Không trùng với câu hỏi đã có trong bài.
${jsonOnlyInstruction()}
Định dạng JSON:
{"questions":[{"questionType":"single_choice","questionText":"...","optionA":"...","optionB":"...","optionC":"...","optionD":"...","correctAnswer":"A","explanation":"...","hint":"...","difficulty":"easy|medium|hard","questionCategory":"...","tags":"tag1,tag2","points":1}]}`;
}

function reviewPrompt(): string {
  return `Kiểm tra tính hợp lý của đáp án trong tất cả câu hỏi của bài.
Với mỗi câu: xác nhận đáp án hiện tại đúng, HOẶC nêu nghi ngờ kèm đáp án đề xuất và lý do, HOẶC cảnh báo (ví dụ 2 lựa chọn gần giống nhau).
${jsonOnlyInstruction()}
Định dạng JSON:
{"reviews":[{"questionNo":1,"status":"ok|review|warning","currentAnswer":"B","suggestedAnswer":"C hoặc null","reason":"..."}]}`;
}

function fieldsPrompt(scope: string, wantExplanation: boolean, wantHint: boolean): string {
  return `Tạo ${[wantExplanation && 'explanation', wantHint && 'hint'].filter(Boolean).join(' và ')} cho ${scope}.
Chỉ tạo cho những câu THỰC SỰ cần (ưu tiên câu còn thiếu). Nếu câu đã có nội dung tốt thì bỏ qua câu đó.
${jsonOnlyInstruction()}
Định dạng JSON:
{"proposals":[{"questionNo":5,"explanation":"... hoặc null","hint":"... hoặc null"}]}`;
}

function rewritePrompt(instruction: string, questionNo: number | null): string {
  const target = questionNo ? `câu ${questionNo}` : 'các câu được nhắc đến';
  return `Chỉnh sửa ${target} theo yêu cầu: ${instruction || 'viết lại rõ ràng, dễ hiểu hơn'}.
${TYPE_NOTE}
${jsonOnlyInstruction()}
Định dạng JSON:
{"questions":[{"questionType":"...","questionText":"...","optionA":"...","optionB":"...","optionC":"...","optionD":"...","correctAnswer":"A","explanation":"...","hint":"...","difficulty":"...","questionCategory":"...","tags":"...","points":1}]}`;
}

function similarPrompt(questionNo: number, count: number): string {
  return `Tạo ${count} câu hỏi TƯƠNG TỰ câu ${questionNo} (cùng format, cùng chủ đề, có thể đổi độ khó vừa phải).
${TYPE_NOTE}
Không trùng câu gốc.
${jsonOnlyInstruction()}
Định dạng JSON:
{"questions":[{"questionType":"...","questionText":"...","optionA":"...","optionB":"...","optionC":"...","optionD":"...","correctAnswer":"A","explanation":"...","hint":"...","difficulty":"...","questionCategory":"...","tags":"...","points":1}]}`;
}

const KNOWLEDGE_PROMPT = 'Giải thích kiến thức ngôn ngữ/chủ đề chính được kiểm tra trong bài luyện tập này dành cho giáo viên tham khảo trước khi dạy.';
const STRUCTURE_PROMPT = 'Đánh giá cấu trúc bài luyện tập: phân bố loại câu hỏi, độ khó, độ phủ chủ đề, điểm mạnh, điểm yếu và 2-3 gợi ý cải thiện cụ thể.';
const DUPLICATES_PROMPT = `Tìm các câu hỏi trùng hoặc gần trùng nhau trong bài (nội dung giống, options giống, hoặc hỏi cùng một kiến thức).
${jsonOnlyInstruction()}
Định dạng JSON:
{"groups":[{"questionNos":[3,7],"reason":"..."}]}`;

// ─── Action definitions ────────────────────────────────────────

export interface AIActionResult {
  prompt: string;
  resultKind: 'questions' | 'answerReview' | 'fields' | 'duplicates' | 'text';
}

export function buildActionPrompt(
  actionId: string,
  opts: {
    selectedQuestionNo: number | null;
    form?: {
      count?: number;
      topic?: string;
      questionType?: PracticeQuestionType | 'any';
      difficulty?: PracticeDifficulty | 'any';
      language?: string;
      points?: number;
      withExplanation?: boolean;
      withHint?: boolean;
      scope?: string;
      rewriteInstruction?: string;
    };
  }
): AIActionResult {
  const f = opts.form ?? {};
  switch (actionId) {
    case 'generate':
      return {
        prompt: generatePrompt({
          count: Math.min(Math.max(f.count ?? 5, AI_LIMITS.minQuestionCount), AI_LIMITS.maxQuestionCount),
          topic: f.topic ?? '',
          questionType: f.questionType ?? 'any',
          difficulty: f.difficulty ?? 'any',
          language: f.language ?? 'Tiếng Việt (giữ nguyên phần tiếng Nhật)',
          points: f.points ?? 1,
          withExplanation: f.withExplanation ?? true,
          withHint: f.withHint ?? false,
        }),
        resultKind: 'questions',
      };
    case 'review':
      return { prompt: reviewPrompt(), resultKind: 'answerReview' };
    case 'explanations':
      return { prompt: fieldsPrompt(f.scope ?? 'các câu còn thiếu trong bài', true, false), resultKind: 'fields' };
    case 'hints':
      return { prompt: fieldsPrompt(f.scope ?? 'các câu còn thiếu trong bài', false, true), resultKind: 'fields' };
    case 'rewrite':
      return { prompt: rewritePrompt(f.rewriteInstruction ?? '', opts.selectedQuestionNo), resultKind: 'questions' };
    case 'similar': {
      const qno = opts.selectedQuestionNo;
      if (!qno) {
        return { prompt: 'Hãy chọn một câu hỏi cụ thể trước khi tạo câu tương tự.', resultKind: 'text' };
      }
      return {
        prompt: similarPrompt(qno, Math.min(Math.max(f.count ?? 3, 1), AI_LIMITS.maxQuestionCount)),
        resultKind: 'questions',
      };
    }
    case 'knowledge':
      return { prompt: KNOWLEDGE_PROMPT, resultKind: 'text' };
    case 'structure':
      return { prompt: STRUCTURE_PROMPT, resultKind: 'text' };
    case 'duplicates':
      return { prompt: DUPLICATES_PROMPT, resultKind: 'duplicates' };
    default:
      return { prompt: '', resultKind: 'text' };
  }
}

export function parseAIResult(kind: AIActionResult['resultKind'], rawText: string): AIResult {
  if (kind === 'text') return { kind: 'text', text: rawText };
  const parsed = extractAndParseJSON(rawText);
  switch (kind) {
    case 'questions': return { kind: 'questions', proposals: validateProposals(parsed) };
    case 'answerReview': return { kind: 'answerReview', reviews: parseAnswerReview(parsed) };
    case 'fields': return { kind: 'fields', proposals: parseFieldProposals(parsed) };
    case 'duplicates': return { kind: 'duplicates', groups: parseDuplicates(parsed) };
  }
}

// ─── Service: calls the Supabase Edge Function ─────────────────

export async function sendAIChat(
  messages: AIMessage[],
  context: AIContext,
  credentials: { username: string; password: string },
  resultKind?: AIActionResult['resultKind'],
  sourceText?: string,
): Promise<AIResult> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new AIError('Ứng dụng chưa kết nối máy chủ. Vui lòng thử lại sau.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 70_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        Apikey: anonKey,
      },
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
        messages: messages.slice(-AI_LIMITS.maxMessagesSent),
        context: buildAIContextPayload(context),
        ...(sourceText ? { sourceText } : {}),
      }),
      signal: controller.signal,
    });

    let body: { reply?: string; error?: string } = {};
    try {
      body = await res.json();
    } catch {
      // non-JSON response
    }

    if (!res.ok || body.error) {
      throw new AIError(body.error || `Không nhận được phản hồi từ AI (mã ${res.status}).`);
    }
    if (!body.reply || typeof body.reply !== 'string') {
      throw new AIError('AI trả về phản hồi rỗng. Vui lòng thử lại.');
    }

    // If the caller declared the expected result kind, parse with it directly so
    // a JSON block preceded by lead-in text is not misclassified as plain text.
    if (resultKind && resultKind !== 'text') {
      try {
        const parsed = extractJsonBlock(body.reply);
        if (resultKind === 'questions') return { kind: 'questions', proposals: validateProposals(parsed) };
        if (resultKind === 'answerReview') return { kind: 'answerReview', reviews: parseAnswerReview(parsed) };
        if (resultKind === 'fields') return { kind: 'fields', proposals: parseFieldProposals(parsed) };
        if (resultKind === 'duplicates') return { kind: 'duplicates', groups: parseDuplicates(parsed) };
      } catch (e) {
        console.error('AI Raw Output:', body.reply);
        if (e instanceof AIError) throw e;
        throw new AIError('Không thể đọc dữ liệu câu hỏi từ AI. Dữ liệu chưa được lưu.');
      }
      return { kind: 'text', text: body.reply };
    }

    const looksJson = /^\s*[{[]/.test(body.reply.trim());
    if (looksJson) {
      try {
        const parsed = extractJsonBlock(body.reply);
        if (Array.isArray((parsed as { questions?: unknown[] })?.questions)) {
          return { kind: 'questions', proposals: validateProposals(parsed) };
        }
        if (Array.isArray((parsed as { reviews?: unknown[] })?.reviews)) {
          return { kind: 'answerReview', reviews: parseAnswerReview(parsed) };
        }
        if (Array.isArray((parsed as { proposals?: unknown[] })?.proposals)) {
          return { kind: 'fields', proposals: parseFieldProposals(parsed) };
        }
        if (Array.isArray((parsed as { groups?: unknown[] })?.groups)) {
          return { kind: 'duplicates', groups: parseDuplicates(parsed) };
        }
      } catch (e) {
        if (e instanceof AIError) throw e;
      }
    }
    return { kind: 'text', text: body.reply };
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AIError('AI phản hồi quá lâu (hết thời gian chờ). Vui lòng thử lại.');
    }
    throw new AIError('Mất kết nối tới trợ lý AI. Vui lòng kiểm tra mạng và thử lại.');
  } finally {
    clearTimeout(timer);
  }
}

// ─── AI Tutor (student-facing, pedagogical, no answers) ───────

export interface AITutorContext {
  practiceTitle: string;
  category: string;
  level: string;
  passage?: string;
  questionNo: number | null;
  questionText?: string;
  questionType?: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  studentAnswer?: string | null;
}

export async function sendAITutorChat(
  messages: AIMessage[],
  context: AITutorContext,
  credentials: { username: string; password: string },
  practiceId: string,
): Promise<string> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-tutor`;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new AIError('Ứng dụng chưa kết nối máy chủ. Vui lòng thử lại sau.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        Apikey: anonKey,
      },
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
        practiceId,
        messages: messages.slice(-10),
        context,
      }),
      signal: controller.signal,
    });

    let body: { reply?: string; error?: string } = {};
    try {
      body = await res.json();
    } catch {
      // non-JSON response
    }

    if (!res.ok || body.error) {
      throw new AIError(body.error || `Không nhận được phản hồi từ AI (mã ${res.status}).`);
    }
    if (!body.reply || typeof body.reply !== 'string') {
      throw new AIError('AI trả về phản hồi rỗng. Vui lòng thử lại.');
    }
    return body.reply;
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AIError('AI phản hồi quá lâu. Vui lòng thử lại.');
    }
    throw new AIError('Mất kết nối tới Gia sư AI. Vui lòng kiểm tra mạng và thử lại.');
  } finally {
    clearTimeout(timer);
  }
}
