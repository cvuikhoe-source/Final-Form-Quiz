import { useState, useRef, useEffect, useCallback } from 'react';
import type { Practice, PracticeQuestion, User } from '@/types';
import { sendAITutorChat, AIError, type AIMessage, type AITutorContext } from '@/lib/aiService';
import { Sparkles, X, Send, Lightbulb, BookOpen, PenLine, Loader2 } from 'lucide-react';

const RATE_LIMIT_MS = 3000;
const MAX_TUTOR_MESSAGES = 20;

interface TutorMessage extends AIMessage {
  pending?: boolean;
}

interface Props {
  user: User;
  practice: Practice;
  questions: PracticeQuestion[];
  currentQuestionNo: number | null;
  studentAnswer: string | null;
  onClose: () => void;
}

const SUGGESTED_CHIPS: { label: string; icon: typeof Lightbulb; prompt: (qNo: number | null) => string }[] = [
  {
    label: 'Gợi ý tư duy câu này',
    icon: Lightbulb,
    prompt: (qNo) => qNo != null ? `Hãy gợi ý hướng tư duy cho câu ${qNo}, đừng đưa đáp án.` : 'Hãy gợi ý cách tư duy để giải câu hỏi này, đừng đưa đáp án.',
  },
  {
    label: 'Giải thích từ vựng / ngữ pháp',
    icon: BookOpen,
    prompt: () => 'Giải thích từ vựng và ngữ pháp chính xuất hiện trong câu hỏi này.',
  },
  {
    label: 'Cho ví dụ tương tự',
    icon: PenLine,
    prompt: () => 'Cho tôi một ví dụ tương tự (không phải ví dụ của chính câu này) để hiểu rõ hơn.',
  },
];

export function AITutorDrawer({ user, practice, questions, currentQuestionNo, studentAnswer, onClose }: Props) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSentRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const currentQuestion = questions.find((q) => q.questionNo === currentQuestionNo) ?? null;

  const buildContext = useCallback((): AITutorContext => ({
    practiceTitle: practice.title,
    category: practice.category,
    level: practice.level,
    passage: practice.passage || undefined,
    questionNo: currentQuestionNo,
    questionText: currentQuestion?.questionText,
    questionType: currentQuestion?.questionType,
    optionA: currentQuestion?.optionA,
    optionB: currentQuestion?.optionB,
    optionC: currentQuestion?.optionC,
    optionD: currentQuestion?.optionD,
    studentAnswer: studentAnswer ?? null,
  }), [practice, currentQuestion, currentQuestionNo, studentAnswer]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const now = Date.now();
    if (now - lastSentRef.current < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (now - lastSentRef.current)) / 1000);
      setError(`Vui lòng đợi ${wait}s trước khi hỏi tiếp.`);
      return;
    }
    lastSentRef.current = now;
    setError(null);

    const userMsg: TutorMessage = { role: 'user', content: trimmed };
    const history = [...messages, userMsg].slice(-MAX_TUTOR_MESSAGES);
    setMessages((prev) => [...prev, userMsg, { role: 'model', content: '', pending: true }]);
    setInput('');
    setLoading(true);

    try {
      const reply = await sendAITutorChat(
        history.map((m) => ({ role: m.role, content: m.content })),
        buildContext(),
        { username: user.username, password: user.password },
        practice.id,
      );
      setMessages((prev) => {
        const next = [...prev];
        const lastIdx = next.length - 1;
        if (lastIdx >= 0 && next[lastIdx].pending) {
          next[lastIdx] = { role: 'model', content: reply };
        } else {
          next.push({ role: 'model', content: reply });
        }
        return next;
      });
    } catch (err) {
      const msg = err instanceof AIError ? err.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
      setError(msg);
      setMessages((prev) => prev.filter((m) => !m.pending));
    } finally {
      setLoading(false);
    }
  }, [loading, messages, buildContext, user, practice.id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl animate-slide-up md:animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow">
              <Sparkles size={16} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Gia sư AI</p>
              <p className="text-[10px] text-slate-400">Gợi ý tư duy — không đưa đáp án</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* Current question context */}
        {currentQuestionNo != null && (
          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Đang ở câu {currentQuestionNo}</p>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Sparkles size={32} className="mb-2 text-emerald-400" />
              <p className="text-sm font-semibold text-slate-700">Hỏi Gia sư AI</p>
              <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-slate-400">
                Gia sư sẽ gợi ý cách suy nghĩ, giải thích từ vựng/ngữ pháp — nhưng không tiết lộ đáp án đúng.
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {m.pending ? (
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <Loader2 size={14} className="animate-spin" /> Đang nghĩ...
                  </span>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
            </div>
          ))}
          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>
          )}
        </div>

        {/* Suggested chips */}
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 py-2.5">
          {SUGGESTED_CHIPS.map((chip) => {
            const Icon = chip.icon;
            return (
              <button
                key={chip.label}
                onClick={() => send(chip.prompt(currentQuestionNo))}
                disabled={loading}
                className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
              >
                <Icon size={12} /> {chip.label}
              </button>
            );
          })}
        </div>

        {/* Input */}
        <div className="border-t border-slate-200 px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Nhập câu hỏi cho Gia sư..."
              className="max-h-24 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100"
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
