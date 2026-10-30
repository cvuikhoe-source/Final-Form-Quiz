import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { Practice, PracticeQuestionFull, PracticeQuestionType, PracticeDifficulty } from '@/types';
import {
  sendAIChat, buildActionPrompt, buildSourceGeneratePrompt, normalizeSourceText,
  type AIMessage, type AIResult, type AIQuestionProposal, type AIAnswerReview,
  type AIFieldProposal, type AIDuplicateGroup, type AIContext, type AIActionResult,
} from '@/lib/aiService';
import { AI_LIMITS, AI_QUICK_ACTIONS } from '@/lib/aiConfig';
import { toast } from '@/components/Toast';
import {
  X, Bot, Send, Minus, Sparkles, CheckSquare, Square, Trash2, RotateCcw,
  MessageSquarePlus, ChevronDown, ChevronUp, User, Maximize2, Minimize2, FileText,
} from 'lucide-react';

interface AIPanelProps {
  practice: Practice;
  questions: PracticeQuestionFull[];
  folderPath: string;
  canManage: boolean;
  credentials: { username: string; password: string };
  initialSelectedQuestionNo: number | null;
  onClose: () => void;
  onApplyProposals: (proposals: AIQuestionProposal[]) => void;
  onApplyFields: (proposals: AIFieldProposal[]) => void;
}

type PanelTab = 'chat' | 'preview';
export type { PanelTab };

interface FormState {
  count: number;
  topic: string;
  questionType: PracticeQuestionType | 'any';
  difficulty: PracticeDifficulty | 'any';
  points: number;
  withExplanation: boolean;
  withHint: boolean;
  scope: string;
  rewriteInstruction: string;
  sourceText: string;
}

const defaultForm: FormState = {
  count: 5,
  topic: '',
  questionType: 'any',
  difficulty: 'any',
  points: 1,
  withExplanation: true,
  withHint: false,
  scope: 'Các câu còn thiếu trong toàn bài',
  rewriteInstruction: '',
  sourceText: '',
};

const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400';

export function AIPanel(props: AIPanelProps) {
  const { practice, questions, folderPath, canManage, credentials, initialSelectedQuestionNo, onClose, onApplyProposals, onApplyFields } = props;

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [results, setResults] = useState<Record<number, AIResult>>({});
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [selectedQuestionNo, setSelectedQuestionNo] = useState<number | null>(initialSelectedQuestionNo);
  const [openAction, setOpenAction] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [expandedForms, setExpandedForms] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [busyLabel, setBusyLabel] = useState('AI đang soạn trả lời…');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busyRef = useRef(false);

  const context: AIContext = useMemo(
    () => ({ practice, questions, folderPath, selectedQuestionNo }),
    [practice, questions, folderPath, selectedQuestionNo]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Keep the quick-action form visible when it opens.
  useEffect(() => {
    if (openAction || expandedForms) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [openAction, expandedForms]);

  // Auto-resize chat input: grows with content up to 200px, then scrolls.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const send = useCallback(async (
    userText: string,
    resultKind?: AIActionResult['resultKind'],
    promptOverride?: string,
    sourceText?: string,
    autoApplyQuestions = false,
  ) => {
    const text = userText.trim().slice(0, AI_LIMITS.maxInputChars);
    if ((!text && !promptOverride) || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);

    const outgoing: AIMessage = { role: 'user', content: text || promptOverride || '' };
    const nextMessages = [...messages, outgoing];
    setMessages(nextMessages);
    setInput('');
    setBusyLabel(sourceText ? 'AI đang đọc nội dung nguồn và tạo câu hỏi…' : 'AI đang soạn trả lời…');

    try {
      const result = await sendAIChat(
        nextMessages,
        context,
        credentials,
        resultKind,
        sourceText ? normalizeSourceText(sourceText) : undefined,
      );
      if (autoApplyQuestions && result.kind === 'questions') {
        onApplyProposals(result.proposals);
        setAutoAppliedResultKey(nextMessages.length);
      }
      setMessages((prev) => [...prev, { role: 'model', content: result.kind === 'text' ? result.text : '(đã tạo đề xuất — xem phần Dự thảo bên dưới)' }]);
      setResults((prev) => ({ ...prev, [nextMessages.length]: result }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Có lỗi khi liên hệ AI.';
      setMessages((prev) => [...prev, { role: 'model', content: `⚠️ ${msg}` }]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [messages, context, credentials, onApplyProposals]);

  const runQuickAction = (actionId: string, withForm: boolean) => {
    if (withForm) {
      setOpenAction((cur) => (cur === actionId ? null : actionId));
      return;
    }
    const { prompt, resultKind } = buildActionPrompt(actionId, { selectedQuestionNo });
    void send(prompt, resultKind, prompt);
  };

  const runQuickActionWithForm = (actionId: string) => {
    if (actionId === 'generate' && !form.sourceText.trim()) {
      toast('Vui lòng dán nội dung nguồn trước khi tạo câu hỏi!', 'error');
      return;
    }
    const hasSource = actionId === 'generate' && form.sourceText.trim().length > 0;
    const { resultKind } = buildActionPrompt(actionId, { selectedQuestionNo, form });
    const prompt = hasSource
      ? buildSourceGeneratePrompt(form)
      : buildActionPrompt(actionId, { selectedQuestionNo, form }).prompt;
    setOpenAction(null);
    void send(prompt, resultKind, prompt, hasSource ? form.sourceText : undefined, hasSource);
  };

  const startNewConversation = () => {
    setMessages([]);
    setResults({});
    setAutoAppliedResultKey(null);
    setSelectedQuestionNo(null);
    setOpenAction(null);
    toast('Đã bắt đầu cuộc trò chuyện mới', 'info');
  };

  const selectedQuestion = selectedQuestionNo
    ? questions.find((q) => q.questionNo === selectedQuestionNo) ?? null
    : null;

  const lastStructured = Object.values(results).reverse().find((r) => r.kind !== 'text') ?? null;

  // ─── Preview helpers ────────────────────────────────────────
  const [previewSelection, setPreviewSelection] = useState<Set<number>>(new Set());
  const [editedProposals, setEditedProposals] = useState<AIQuestionProposal[]>([]);
  const [autoAppliedResultKey, setAutoAppliedResultKey] = useState<number | null>(null);

  useEffect(() => {
    if (lastStructured && lastStructured.kind === 'questions') {
      setEditedProposals(lastStructured.proposals.map((p) => ({ ...p })));
      setPreviewSelection(new Set(lastStructured.proposals.map((_, i) => i)));
      setMinimized(false);
    }
  }, [lastStructured]);

  const togglePreviewItem = (i: number) => {
    setPreviewSelection((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const applySelected = () => {
    if (!canManage) return;
    const chosen = editedProposals.filter((_, i) => previewSelection.has(i));
    if (chosen.length === 0) { toast('Hãy chọn ít nhất một câu', 'error'); return; }
    onApplyProposals(chosen);
  };

  const applyFieldProposals = (proposals: AIFieldProposal[]) => {
    if (!canManage) return;
    onApplyFields(proposals);
  };

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-40 md:bottom-6 md:right-6">
        <button
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-xl hover:bg-blue-700"
        >
          <Bot size={18} /> Trợ lý AI
          {messages.length > 0 && <span className="rounded-full bg-white/20 px-2 text-xs">{messages.length}</span>}
        </button>
      </div>
    );
  }

  return (
    <aside className={`fixed inset-0 z-50 flex max-h-screen flex-col overflow-hidden bg-white md:inset-y-0 md:left-auto md:right-0 md:h-full ${panelExpanded ? 'md:w-[720px]' : 'md:w-[560px]'} md:rounded-l-2xl md:border-l md:border-slate-200 md:shadow-2xl`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Bot size={18} className="text-blue-600" />
          Trợ lý AI
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={startNewConversation} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Cuộc trò chuyện mới">
            <MessageSquarePlus size={16} />
          </button>
          <button
            onClick={() => setPanelExpanded((v) => !v)}
            className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:block"
            title={panelExpanded ? 'Thu hẹp panel' : 'Mở rộng panel'}
          >
            {panelExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button onClick={() => setMessages([])} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Xóa lịch sử phiên hiện tại">
            <RotateCcw size={16} />
          </button>
          <button onClick={() => setMinimized(true)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Thu nhỏ">
            <Minus size={16} />
          </button>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Đóng">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Selected-question banner */}
      <div className="border-b border-slate-100 bg-blue-50/60 px-4 py-2 text-xs text-blue-700">
        {selectedQuestion ? (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">Đang hỏi về: <b>Câu {selectedQuestion.questionNo}</b> — {selectedQuestion.questionText.slice(0, 40)}…</span>
            <button onClick={() => setSelectedQuestionNo(null)} className="shrink-0 rounded-md px-1.5 py-0.5 font-medium hover:bg-blue-100">
              Bỏ chọn
            </button>
          </div>
        ) : (
          <span>Hỏi về toàn bộ bài luyện tập: <b>{practice.title}</b></span>
        )}
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-500">
            Hỏi AI về bài luyện tập này, ví dụ: <i>"Câu 3 có hợp lý không?"</i>, <i>"Tạo thêm 5 câu từ vựng N2"</i>.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'model' && <span className="mt-1 shrink-0 rounded-full bg-blue-100 p-1.5"><Bot size={13} className="text-blue-600" /></span>}
            <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
              m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {m.content}
            </div>
            {m.role === 'user' && <span className="mt-1 shrink-0 rounded-full bg-slate-200 p-1.5"><User size={13} className="text-slate-600" /></span>}
          </div>
        ))}
        {busy && (
          <div className="flex gap-2">
            <span className="mt-1 shrink-0 rounded-full bg-blue-100 p-1.5"><Bot size={13} className="animate-pulse text-blue-600" /></span>
            <div className="rounded-2xl bg-slate-100 px-3.5 py-2 text-sm text-slate-400">{busyLabel}</div>
          </div>
        )}

        {/* Structured preview */}
        {lastStructured && lastStructured.kind === 'questions' && (
          <QuestionPreview
            proposals={editedProposals}
            selection={previewSelection}
            onToggle={togglePreviewItem}
            onSelectAll={() => setPreviewSelection(new Set(editedProposals.map((_, i) => i)))}
            onSelectNone={() => setPreviewSelection(new Set())}
            onEdit={(i, patch) => setEditedProposals((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))}
            onRemove={(i) => {
              setEditedProposals((prev) => prev.filter((_, idx) => idx !== i));
              setPreviewSelection((prev) => {
                const next = new Set<number>();
                Array.from(prev).forEach((v) => { if (v < i) next.add(v); else if (v > i) next.add(v - 1); });
                return next;
              });
            }}
            onRegenerate={(i) => {
              const p = editedProposals[i];
              void send(`Tạo lại câu hỏi khác thay cho câu sau (không trùng): ${p.questionText}`);
            }}
            canManage={canManage}
            onApply={applySelected}
            alreadyApplied={autoAppliedResultKey === Number(Object.entries(results).find(([, value]) => value === lastStructured)?.[0] ?? -1)}
          />
        )}
        {lastStructured && lastStructured.kind === 'answerReview' && (
          <AnswerReviewPreview reviews={lastStructured.reviews} canManage={canManage} questions={questions} />
        )}
        {lastStructured && lastStructured.kind === 'fields' && (
          <FieldsPreview proposals={lastStructured.proposals} canManage={canManage} onApply={applyFieldProposals} />
        )}
        {lastStructured && lastStructured.kind === 'duplicates' && (
          <DuplicatesPreview groups={lastStructured.groups} />
        )}

      {/* Quick actions — inside the scrollable body so the form and its button are always reachable */}
      <div className="mt-3 border-t border-slate-100 px-0 pb-1 pt-2.5">
        <button onClick={() => setExpandedForms((v) => !v)} className="mb-1.5 flex w-full items-center justify-between text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5"><Sparkles size={13} className="text-amber-500" /> Hành động nhanh</span>
          {expandedForms ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {expandedForms && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {AI_QUICK_ACTIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => runQuickAction(a.id, 'needsForm' in a && a.needsForm === true)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all active:scale-[0.97] ${
                  openAction === a.id
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {a.icon} {a.label}
              </button>
            ))}
          </div>
        )}

        {/* Per-action form */}
        {openAction && (
          <div className="mb-2 space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-3">
            {openAction === 'generate' && (
              <div className="rounded-lg border border-amber-200 bg-white p-2">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <FileText size={13} className="text-amber-500" /> Nội dung nguồn
                </label>
                <textarea
                  value={form.sourceText}
                  onChange={(e) => setForm((f) => ({ ...f, sourceText: e.target.value }))}
                  rows={7}
                  placeholder="Dán nội dung được copy từ PDF, Word, website hoặc tài liệu khác vào đây.\n\nAI sẽ đọc nội dung này và tạo câu hỏi dựa trên chính nội dung được cung cấp."
                  className={`${inputCls} max-h-[180px] resize-y overflow-y-auto leading-relaxed`}
                />
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                  <span className={form.sourceText.length > AI_LIMITS.maxSourceTextChars ? 'font-semibold text-rose-600' : 'text-slate-400'}>
                    {form.sourceText.length.toLocaleString('vi-VN')} / {AI_LIMITS.maxSourceTextChars.toLocaleString('vi-VN')} ký tự
                  </span>
                  {form.sourceText.length > 0 && (
                    <button
                      onClick={() => setForm((f) => ({ ...f, sourceText: '' }))}
                      className="font-medium text-rose-500 hover:underline"
                    >
                      Xóa nội dung
                    </button>
                  )}
                </div>
                {form.sourceText.length > AI_LIMITS.maxSourceTextChars && (
                  <p className="mt-1 text-[11px] font-medium text-rose-600">
                    Nội dung vượt quá giới hạn {AI_LIMITS.maxSourceTextChars.toLocaleString('vi-VN')} ký tự. Hãy bớt bớt nội dung hoặc chia thành nhiều lần tạo.
                  </p>
                )}
              </div>
            )}
            {(openAction === 'generate' || openAction === 'similar') && (
              <>
                <label className="block text-xs text-slate-600">Số lượng câu</label>
                <input type="number" min={1} max={AI_LIMITS.maxQuestionCount} value={form.count}
                  onChange={(e) => setForm((f) => ({ ...f, count: Number(e.target.value) || 5 }))} className={inputCls} />
                {openAction === 'generate' && (
                  <input value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                    placeholder="Chủ đề (tùy chọn)" className={inputCls} />
                )}
              </>
            )}
            {openAction === 'generate' && (
              <div className="grid grid-cols-2 gap-2">
                <select value={form.questionType} onChange={(e) => setForm((f) => ({ ...f, questionType: e.target.value as FormState['questionType'] }))} className={inputCls}>
                  <option value="any">Loại: tự chọn</option>
                  <option value="single_choice">Chọn 1 đáp án</option>
                  <option value="multiple_choice">Chọn nhiều đáp án</option>
                  <option value="true_false">Đúng / Sai</option>
                  <option value="short_answer">Trả lời ngắn</option>
                </select>
                <select value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as FormState['difficulty'] }))} className={inputCls}>
                  <option value="any">Độ khó: tự chọn</option>
                  <option value="easy">Dễ</option>
                  <option value="medium">Trung bình</option>
                  <option value="hard">Khó</option>
                </select>
              </div>
            )}
            {(openAction === 'generate' || openAction === 'similar') && (
              <input type="number" min={1} max={100} value={form.points}
                onChange={(e) => setForm((f) => ({ ...f, points: Number(e.target.value) || 1 }))}
                placeholder="Điểm mỗi câu" className={inputCls} />
            )}
            {(openAction === 'generate' || openAction === 'similar') && (
              <div className="flex gap-4 text-xs text-slate-600">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={form.withExplanation} onChange={(e) => setForm((f) => ({ ...f, withExplanation: e.target.checked }))} />
                  Có giải thích
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={form.withHint} onChange={(e) => setForm((f) => ({ ...f, withHint: e.target.checked }))} />
                  Có gợi ý
                </label>
              </div>
            )}
            {(openAction === 'explanations' || openAction === 'hints') && (
              <select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} className={inputCls}>
                <option>Các câu còn thiếu trong toàn bài</option>
                {selectedQuestion && <option>{`Chỉ câu ${selectedQuestion.questionNo}`}</option>}
                <option>Tất cả câu hỏi trong bài</option>
              </select>
            )}
            {openAction === 'rewrite' && (
              <textarea value={form.rewriteInstruction} onChange={(e) => setForm((f) => ({ ...f, rewriteInstruction: e.target.value }))}
                rows={2} placeholder="Muốn chỉnh sửa thế nào? (VD: viết lại dễ hiểu hơn)" className={inputCls} />
            )}
            <div className="sticky bottom-0 z-10 -mx-1 -mb-1 bg-gradient-to-t from-blue-50 via-blue-50 to-blue-50/0 pb-1 pt-2">
              <button
                onClick={() => runQuickActionWithForm(openAction)}
                disabled={busy || (openAction === 'generate' && (
                  form.sourceText.length > AI_LIMITS.maxSourceTextChars ||
                  (form.sourceText.trim().length > 0 && form.sourceText.trim().length < 50)
                ))}
                className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-700 disabled:opacity-40"
              >
                {openAction === 'generate' && form.sourceText.trim() ? '✨ Tạo câu hỏi từ nội dung' : 'Chạy với thông tin trên'}
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!busy) void send(input);
              }
            }}
            rows={3}
            maxLength={AI_LIMITS.maxInputChars}
            placeholder="Hỏi AI về bài luyện tập này..."
            className="max-h-[200px] min-h-[72px] flex-1 resize-none overflow-y-auto rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-blue-400"
          />
          <button
            onClick={() => void send(input)}
            disabled={busy || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md transition-all hover:bg-blue-700 disabled:opacity-40"
            title="Gửi"
          >
            <Send size={17} />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">Enter để gửi · Shift+Enter để xuống dòng</p>
      </div>
    </aside>
  );
}

// ─── Preview components ────────────────────────────────────────

const TYPE_LABEL: Record<PracticeQuestionType, string> = {
  single_choice: 'Chọn 1 đáp án',
  multiple_choice: 'Chọn nhiều',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời ngắn',
};

function QuestionPreview(p: {
  proposals: AIQuestionProposal[];
  selection: Set<number>;
  onToggle: (i: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onEdit: (i: number, patch: Partial<AIQuestionProposal>) => void;
  onRemove: (i: number) => void;
  onRegenerate: (i: number) => void;
  canManage: boolean;
  onApply: () => void;
  alreadyApplied?: boolean;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-700">
        <Sparkles size={13} /> AI đề xuất {p.proposals.length} câu hỏi — chưa lưu gì cả
      </p>
      <div className="mb-2 flex gap-2 text-[11px]">
        <button onClick={p.onSelectAll} className="font-medium text-blue-600 hover:underline">Chọn tất cả</button>
        <button onClick={p.onSelectNone} className="font-medium text-slate-500 hover:underline">Bỏ chọn tất cả</button>
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {p.proposals.map((prop, i) => (
          <div key={i} className={`rounded-xl border bg-white p-2.5 text-xs ${p.selection.has(i) ? 'border-blue-300' : 'border-slate-200 opacity-70'}`}>
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => p.onToggle(i)} className="flex items-center gap-1.5 font-semibold text-slate-700">
                {p.selection.has(i) ? <CheckSquare size={14} className="text-blue-600" /> : <Square size={14} className="text-slate-400" />}
                Câu {i + 1} · {TYPE_LABEL[prop.questionType]} · {prop.difficulty} · {prop.points}đ
              </button>
              <div className="flex gap-1">
                <button onClick={() => setEditingIndex(editingIndex === i ? null : i)} className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50">Sửa</button>
                <button onClick={() => p.onRegenerate(i)} className="rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-50">Tạo lại</button>
                <button onClick={() => p.onRemove(i)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-rose-500" title="Xóa khỏi dự thảo">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <p className="mt-1 text-slate-700">{prop.questionText}</p>
            {prop.optionA && (
              <p className="mt-0.5 text-slate-500">
                {['A', 'B', 'C', 'D'].map((L) => {
                  const v = ({ A: prop.optionA, B: prop.optionB, C: prop.optionC, D: prop.optionD } as Record<string, string>)[L];
                  return v ? `${L}) ${v}` : null;
                }).filter(Boolean).join(' · ')}
              </p>
            )}
            <p className="mt-0.5 font-semibold text-emerald-600">Đáp án: {prop.correctAnswer}</p>
            {editingIndex === i && (
              <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                <textarea rows={2} value={prop.questionText} onChange={(e) => p.onEdit(i, { questionText: e.target.value })} className={inputCls} placeholder="Nội dung câu hỏi" />
                {prop.questionType !== 'short_answer' && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <input value={prop.optionA} onChange={(e) => p.onEdit(i, { optionA: e.target.value })} className={inputCls} placeholder="Đáp án A" />
                    <input value={prop.optionB} onChange={(e) => p.onEdit(i, { optionB: e.target.value })} className={inputCls} placeholder="Đáp án B" />
                    <input value={prop.optionC} onChange={(e) => p.onEdit(i, { optionC: e.target.value })} className={inputCls} placeholder="Đáp án C" />
                    <input value={prop.optionD} onChange={(e) => p.onEdit(i, { optionD: e.target.value })} className={inputCls} placeholder="Đáp án D" />
                  </div>
                )}
                <input value={prop.correctAnswer} onChange={(e) => p.onEdit(i, { correctAnswer: e.target.value.toUpperCase() })} className={inputCls} placeholder="Đáp án đúng (A hoặc A,C hoặc nội dung)" />
                <input value={prop.explanation} onChange={(e) => p.onEdit(i, { explanation: e.target.value })} className={inputCls} placeholder="Giải thích" />
                <input value={prop.hint} onChange={(e) => p.onEdit(i, { hint: e.target.value })} className={inputCls} placeholder="Gợi ý" />
                <div className="grid grid-cols-3 gap-1.5">
                  <select value={prop.difficulty} onChange={(e) => p.onEdit(i, { difficulty: e.target.value as PracticeDifficulty })} className={inputCls}>
                    <option value="easy">Dễ</option>
                    <option value="medium">Trung bình</option>
                    <option value="hard">Khó</option>
                  </select>
                  <input type="number" min={1} max={100} value={prop.points} onChange={(e) => p.onEdit(i, { points: Number(e.target.value) || 1 })} className={inputCls} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {p.canManage && !p.alreadyApplied && (
        <button onClick={p.onApply} disabled={p.selection.size === 0}
          className="mt-2.5 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-blue-700 disabled:opacity-40">
          Thêm {p.selection.size} câu vào bài luyện tập
        </button>
      )}
      {p.alreadyApplied && <p className="mt-2.5 text-center text-xs font-semibold text-emerald-600">✓ Đã thêm vào bài luyện tập</p>}
    </div>
  );
}

function AnswerReviewPreview({ reviews, canManage, questions }: { reviews: AIAnswerReview[]; canManage: boolean; questions: PracticeQuestionFull[] }) {
  const problems = reviews.filter((r) => r.status !== 'ok');
  const oks = reviews.filter((r) => r.status === 'ok');
  void canManage; void questions;
  return (
    <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-3 text-xs">
      <p className="mb-2 font-bold text-blue-700">✅ Đề xuất kiểm tra đáp án (AI chỉ đề xuất — không tự thay đổi)</p>
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {problems.map((r) => (
          <div key={r.questionNo} className="rounded-xl border border-slate-200 bg-white p-2.5">
            <p className="font-semibold text-slate-700">
              Câu {r.questionNo} · {r.status === 'review' ? 'Nên kiểm tra lại' : 'Cảnh báo'}
            </p>
            <p className="text-slate-500">Đáp án hiện tại: <b>{r.currentAnswer || '—'}</b>{r.suggestedAnswer && <> · AI đề nghị xem: <b className="text-amber-600">{r.suggestedAnswer}</b></>}</p>
            {r.reason && <p className="mt-0.5 text-slate-500">{r.reason}</p>}
          </div>
        ))}
        {oks.length > 0 && (
          <p className="text-slate-500">{oks.length} câu không phát hiện vấn đề: {oks.map((r) => r.questionNo).join(', ')}</p>
        )}
      </div>
    </div>
  );
}

function FieldsPreview({ proposals, canManage, onApply }: { proposals: AIFieldProposal[]; canManage: boolean; onApply: (p: AIFieldProposal[]) => void }) {
  const [edited, setEdited] = useState(proposals);
  useEffect(() => { setEdited(proposals); }, [proposals]);
  return (
    <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-3 text-xs">
      <p className="mb-2 font-bold text-emerald-700">💡 Đề xuất giải thích / gợi ý — chưa áp dụng</p>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {edited.map((prop, i) => (
          <div key={prop.questionNo} className="rounded-xl border border-slate-200 bg-white p-2.5">
            <p className="font-semibold text-slate-700">Câu {prop.questionNo}</p>
            {prop.explanation !== null && (
              <textarea rows={2} value={prop.explanation} onChange={(e) => setEdited((prev) => prev.map((x, idx) => (idx === i ? { ...x, explanation: e.target.value } : x)))} className={`${inputCls} mt-1`} />
            )}
            {prop.hint !== null && (
              <textarea rows={1} value={prop.hint} onChange={(e) => setEdited((prev) => prev.map((x, idx) => (idx === i ? { ...x, hint: e.target.value } : x)))} className={`${inputCls} mt-1`} />
            )}
          </div>
        ))}
      </div>
      {canManage && (
        <button onClick={() => onApply(edited)} className="mt-2.5 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          Áp dụng vào các câu đã chọn
        </button>
      )}
    </div>
  );
}

function DuplicatesPreview({ groups }: { groups: AIDuplicateGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3 text-xs text-emerald-700">
        Không phát hiện câu hỏi trùng lặp.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-3 text-xs">
      <p className="mb-2 font-bold text-amber-700">🔍 Phát hiện {groups.length} nhóm câu trùng / gần trùng (AI chỉ đề xuất — không tự xóa)</p>
      <div className="space-y-1.5">
        {groups.map((g, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-2.5">
            <p className="font-semibold text-slate-700">Câu {g.questionNos.join(', ')}</p>
            {g.reason && <p className="text-slate-500">{g.reason}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
