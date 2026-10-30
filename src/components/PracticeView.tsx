import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { User, Practice, PracticeCategory, PracticeQuestion, PracticeQuestionFull, PracticeAttemptResult } from '@/types';
import {
  loadPractices, getPracticeQuestionsSafe, submitPracticeAttempt,
  getPracticeAudioUrl, loadPracticeProgressMap,
  practiceVisibleForUser, getEffectivePracticeSchedule,
} from '@/storage';
import { AudioPlayer } from '@/components/AudioPlayer';
import { useLanguage } from '@/context/LanguageContext';
import { AITutorDrawer } from '@/components/AITutorDrawer';
import { toast } from '@/components/Toast';
import {
  ArrowLeft, Languages, BookOpen, FileText, Headphones, ChevronRight,
  CheckCircle2, XCircle, Clock, Play, Sparkles,
} from 'lucide-react';

const PRACTICE_CATEGORIES: { key: PracticeCategory; labelKey: 'practice.cat.vocab.label' | 'practice.cat.grammar.label' | 'practice.cat.reading.label' | 'practice.cat.listening.label'; descKey: 'practice.cat.vocab.desc' | 'practice.cat.grammar.desc' | 'practice.cat.reading.desc' | 'practice.cat.listening.desc'; icon: typeof Languages; color: string }[] = [
  { key: 'vocabulary', labelKey: 'practice.cat.vocab.label', descKey: 'practice.cat.vocab.desc', icon: Languages, color: 'from-indigo-500 to-blue-600' },
  { key: 'grammar', labelKey: 'practice.cat.grammar.label', descKey: 'practice.cat.grammar.desc', icon: BookOpen, color: 'from-emerald-500 to-teal-600' },
  { key: 'reading', labelKey: 'practice.cat.reading.label', descKey: 'practice.cat.reading.desc', icon: FileText, color: 'from-orange-500 to-amber-600' },
  { key: 'listening', labelKey: 'practice.cat.listening.label', descKey: 'practice.cat.listening.desc', icon: Headphones, color: 'from-sky-500 to-cyan-600' },
];

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

type Step =
  | { kind: 'hub' }
  | { kind: 'list'; category: PracticeCategory }
  | { kind: 'do'; practice: Practice };

export function PracticeView({ user }: { user: User }) {
  const { t } = useLanguage();
  const [practices, setPractices] = useState<Practice[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, { attempts: number; done: boolean; lastScore: number | null; lastTotalPoints: number | null }>>({});
  const [step, setStep] = useState<Step>({ kind: 'hub' });

  const isStudent = user.role === 'student';

  useEffect(() => {
    loadPractices().then((all) => {
      setPractices(all.filter((p) => practiceVisibleForUser(p, user)));
    });
  }, [user]);

  useEffect(() => {
    const map = loadPracticeProgressMap()[user.id] ?? {};
    setProgressMap(map);
  }, [user.id]);

  // ─── Progress per category ────────────────────────────────
  const categoryStats = useMemo(() => {
    const stats: Record<PracticeCategory, { total: number; done: number }> = {
      vocabulary: { total: 0, done: 0 },
      grammar: { total: 0, done: 0 },
      reading: { total: 0, done: 0 },
      listening: { total: 0, done: 0 },
    };
    practices.forEach((p) => {
      stats[p.category].total += 1;
      if (progressMap[p.id]?.done) stats[p.category].done += 1;
    });
    return stats;
  }, [practices, progressMap]);

  const goBack = useCallback(() => {
    setStep((prev) => {
      if (prev.kind === 'do') return { kind: 'list', category: prev.practice.category };
      return { kind: 'hub' };
    });
  }, []);

  // ─── Do practice ──────────────────────────────────────────
  if (step.kind === 'do') {
    return <PracticeRunner user={user} practice={step.practice} onBack={goBack} onFinished={(score, total) => {
      setProgressMap((prev) => ({
        ...prev,
        [step.practice.id]: {
          attempts: (prev[step.practice.id]?.attempts ?? 0) + 1,
          done: true,
          lastScore: score,
          lastTotalPoints: total,
        },
      }));
    }} />;
  }

  // ─── List of a category ───────────────────────────────────
  if (step.kind === 'list') {
    const list = practices
      .filter((p) => p.category === step.category)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const meta = PRACTICE_CATEGORIES.find((c) => c.key === step.category)!;
    return (
      <div className="px-4 pb-28 pt-4 md:px-0 md:pb-8">
        <button onClick={goBack} className="mb-3 flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> {t('practice.backToList')}
        </button>
        <div className="mb-4 flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.color} text-white shadow-md`}>
            <meta.icon size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">{t(meta.labelKey)}</h2>
            <p className="text-xs text-slate-400">{t('practice.countLessons', { count: list.length })}</p>
          </div>
        </div>
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-center">
            <meta.icon size={40} className="mb-2 text-slate-300" />
            <p className="text-sm font-medium text-slate-400">{t('practice.empty')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((p) => {
              const prog = progressMap[p.id];
              const schedule = getEffectivePracticeSchedule(p, user);
              const startMs = schedule.startAt ? new Date(schedule.startAt).getTime() : null;
              const deadlineMs = schedule.deadline ? new Date(schedule.deadline).getTime() : null;
              const nowMs = Date.now();
              const upcoming = startMs !== null && nowMs < startMs;
              const expired = deadlineMs !== null && nowMs >= deadlineMs;
              return (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">{p.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{p.level}</span>
                        {p.teacherName && <span>{p.teacherName}</span>}
                      </div>
                    </div>
                    {prog?.done && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-600">
                        <CheckCircle2 size={12} /> {t('practice.score', { score: prog.lastScore ?? 0, total: prog.lastTotalPoints ?? 0 })}
                      </span>
                    )}
                  </div>
                  {schedule.startAt || schedule.deadline ? (
                    <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                      <Clock size={10} />
                      {fmtDateTime(schedule.startAt)} → {fmtDateTime(schedule.deadline)}
                    </p>
                  ) : null}
                  {upcoming ? (
                    <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">{t('practice.notOpenYet', { time: fmtDateTime(schedule.startAt) })}</div>
                  ) : expired ? (
                    <div className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-500">{t('status.closed')}</div>
                  ) : (
                    <button
                      onClick={() => setStep({ kind: 'do', practice: p })}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                    >
                      <Play size={15} /> {prog?.done ? t('practice.retry') : t('practice.start')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── Hub: 4 category cards ────────────────────────────────
  return (
    <div className="px-4 pb-28 pt-4 md:px-0 md:pb-8">
      <div className="mb-1">
        <h2 className="text-lg font-bold text-slate-800">{t('practice.backToList')}</h2>
        <p className="text-sm text-slate-500">{t('practice.subtitle')}</p>
      </div>

      {/* Flow: Bài học → Luyện tập → Bài thi */}
      <div className="mb-4 flex items-center gap-1.5 text-[11px] font-medium">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">{t('practice.flow.lessons')}</span>
        <span className="text-slate-300">→</span>
        <span className="rounded-full bg-blue-600 px-2.5 py-1 text-white">{t('practice.flow.practice')}</span>
        <span className="text-slate-300">→</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">{t('practice.flow.exam')}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PRACTICE_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const stat = categoryStats[cat.key];
          const pct = stat.total > 0 ? Math.round((stat.done / stat.total) * 100) : 0;
          return (
            <button
              key={cat.key}
              onClick={() => setStep({ kind: 'list', category: cat.key })}
              className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-200 hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${cat.color} text-white shadow-md transition-transform group-hover:scale-105`}>
                  <Icon size={24} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800">{t(cat.labelKey)}</p>
                  <p className="text-xs text-slate-400">{t(cat.descKey)}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{t('practice.countLessons', { count: stat.total })}</p>
                  {stat.total > 0 && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>{t('practice.progress')}</span>
                        <span className="font-semibold text-emerald-600">{pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <ChevronRight size={18} className="shrink-0 self-center text-slate-300 transition-colors group-hover:text-blue-400" />
              </div>
            </button>
          );
        })}
      </div>
      {isStudent && <p className="mt-4 text-center text-[11px] text-slate-400">{t('practice.studentHint')}</p>}
    </div>
  );
}

// ─── Practice runner: questions + instant feedback ────────────

export function PracticeRunner({ user, practice, onBack, onFinished, loadQuestions }: {
  user: User;
  practice: Practice;
  onBack: () => void;
  onFinished: (score: number, total: number) => void;
  // Admin preview passes the teacher loader (admin RPC has no PUBLISHED filter);
  // students use the default safe loader (published only, answers stripped).
  loadQuestions?: (practiceId: string) => Promise<PracticeQuestionFull[] | PracticeQuestion[]>;
}) {
  const { t } = useLanguage();
  const [questions, setQuestions] = useState<PracticeQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PracticeAttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [activeQuestionNo, setActiveQuestionNo] = useState<number | null>(null);
  const audioUrl = practice.audioSource ? getPracticeAudioUrl(practice.audioSource, practice.audioSourceType) : '';
  const aliveRef = useRef(false);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = loadQuestions ?? getPracticeQuestionsSafe;
    load(practice.id)
      .then((qs) => { if (!cancelled) setQuestions(qs); })
      .catch(() => { if (!cancelled) setLoadError(t('practice.loadError')); });
    return () => { cancelled = true; };
  }, [practice.id, loadQuestions, t]);

  const detailFor = useCallback((qid: string) => result?.details.find((d) => d.questionId === qid) ?? null, [result]);

  const onAnswer = useCallback((qid: string, value: string, qNo: number) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
    setActiveQuestionNo(qNo);
  }, []);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await submitPracticeAttempt(practice.id, user.id, user.username, answers);
      if (!aliveRef.current) return;
      setResult(res);
      setConfirming(false);
      onFinished(res.score, res.totalPoints);
      toast(t('practice.toast.result', { correct: res.correctCount, total: res.questionCount }), 'success');
    } catch {
      if (aliveRef.current) toast(t('practice.toast.submitFailed'), 'error');
    } finally {
      if (aliveRef.current) setSubmitting(false);
    }
  };

  // Load failed (not the same as genuinely empty): retryable error state
  if (questions === null) {
    return (
      <div className="px-4 pb-28 pt-4 md:px-0 md:pb-8">
        <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> {t('common.back')}
        </button>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 py-16 text-center">
          <XCircle size={44} className="mb-3 text-rose-400" />
          <p className="text-sm font-semibold text-rose-700">{t('practice.errorTitle')}</p>
          <p className="mt-1 max-w-xs text-xs text-rose-500">{loadError ?? t('practice.genericError')}</p>
          <button
            onClick={() => { setLoadError(null); setQuestions(null); }}
            className="mt-4 rounded-xl bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  // Published but empty (legacy data): show a clear state, never a lone Submit button
  if (questions.length === 0) {
    return (
      <div className="px-4 pb-28 pt-4 md:px-0 md:pb-8">
        <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> {t('common.back')}
        </button>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 py-16 text-center">
          <FileText size={44} className="mb-3 text-amber-400" />
          <p className="text-sm font-semibold text-amber-700">{t('practice.emptyQuestions')}</p>
          <p className="mt-1 max-w-xs text-xs text-amber-600">{t('practice.emptyQuestionsHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-28 pt-4 md:px-0 md:pb-8">
      <button onClick={onBack} disabled={submitting}
        className="mb-3 flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50 disabled:hover:text-slate-500">
        <ArrowLeft size={16} /> {t('common.back')}
      </button>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800">{practice.title}</h2>
        <p className="text-xs text-slate-400">{practice.level} · {t('practice.countQuestions', { count: questions.length })}</p>
      </div>

      {/* Reading passage */}
      {practice.category === 'reading' && practice.passage && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('practice.passageLabel')}</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{practice.passage}</p>
        </div>
      )}

      {/* Audio */}
      {practice.category === 'listening' && audioUrl && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('practice.audioLabel')}</p>
          <AudioPlayer src={audioUrl} />
        </div>
      )}

      {/* Questions */}
      <div className="space-y-3">
        {questions.map((q) => {
          const chosen = answers[q.id] ?? null;
          const detail = detailFor(q.id);
          return (
            <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-slate-800">
                <span className="mr-1.5 text-slate-400">{t('practice.questionNo', { no: q.questionNo })}</span>
                {q.questionText}
              </p>
              <div className="space-y-2">
                {q.questionType === 'short_answer' ? (
                  <input
                    type="text"
                    value={chosen ?? ''}
                    disabled={!!result}
                    onChange={(e) => onAnswer(q.id, e.target.value, q.questionNo)}
                    onFocus={() => setActiveQuestionNo(q.questionNo)}
                    placeholder={t('practice.answerPlaceholder')}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 transition-colors focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:bg-slate-50"
                  />
                ) : (
                OPTION_LETTERS.map((letter) => {
                  const text = q[`option${letter}` as 'optionA' | 'optionB' | 'optionC' | 'optionD'];
                  if (!text) return null;
                  const isChosen = chosen === letter;
                  let cls = 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50';
                  if (detail) {
                    if (detail.correct === letter) cls = 'border-emerald-300 bg-emerald-50';
                    else if (isChosen) cls = 'border-rose-300 bg-rose-50';
                    else cls = 'border-slate-200 bg-white opacity-70';
                  } else if (isChosen) {
                    cls = 'border-blue-500 bg-blue-50 ring-1 ring-blue-200';
                  }
                  return (
                    <button
                      key={letter}
                      disabled={!!result}
                      onClick={() => onAnswer(q.id, letter, q.questionNo)}
                      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${cls}`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        detail && detail.correct === letter ? 'bg-emerald-500 text-white'
                        : detail && isChosen ? 'bg-rose-500 text-white'
                        : isChosen ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>{letter}</span>
                      <span className="text-slate-700">{text}</span>
                    </button>
                  );
                })
                )}
              </div>
              {/* Instant feedback */}
              {detail && (
                <div className={`mt-3 rounded-xl px-3 py-2.5 ${detail.isCorrect ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                  <p className={`flex items-center gap-1.5 text-xs font-bold ${detail.isCorrect ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {detail.isCorrect ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {detail.isCorrect ? t('practice.correct') : t('practice.incorrect', { answer: detail.correct })}
                  </p>
                  {detail.explanation && <p className="mt-1.5 text-xs leading-relaxed text-slate-600"><span className="font-semibold">{t('common.explanation')}</span> {detail.explanation}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Result summary — primary metric is correct questions, weighted score is labeled separately */}
      {result ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <p className="text-3xl font-extrabold text-emerald-600">{result.correctCount}/{result.questionCount}</p>
          <p className="mt-1 text-sm font-medium text-emerald-700">{t('practice.correctCount')}</p>
          <p className="mt-2 text-2xl font-bold text-emerald-500">
            {result.questionCount > 0 ? Math.round((result.correctCount / result.questionCount) * 100) : 0}%
          </p>
          {result.totalPoints !== result.questionCount && (
            <p className="mt-2 text-xs font-medium text-emerald-600">{t('practice.points', { score: result.score, total: result.totalPoints })}</p>
          )}
          <button onClick={onBack} className="mt-4 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
            {t('practice.finish')}
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setConfirming(true)}
            disabled={submitting}
            className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? t('practice.submitting') : t('common.submit')}
          </button>
          {confirming && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => !submitting && setConfirming(false)}>
              <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-base font-bold text-slate-800">{t('practice.confirmTitle')}</h3>
                {(() => {
                  const unanswered = (questions ?? []).filter((q) => !answers[q.id]).length;
                  return unanswered > 0 ? (
                    <p className="mt-2 text-sm text-slate-500">{t('practice.unanswered', { count: unanswered })}</p>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">{t('practice.allAnswered')}</p>
                  );
                })()}
                <div className="mt-5 flex gap-2">
                  <button onClick={() => setConfirming(false)} disabled={submitting}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    {t('practice.keepWorking')}
                  </button>
                  <button onClick={handleSubmit} disabled={submitting}
                    className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    {submitting ? t('practice.submitting') : t('common.submit')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Floating AI Tutor button — only while doing the practice (no result yet) and teacher enabled it */}
      {practice.allowAiTutor && !result && (
        <button
          onClick={() => setTutorOpen(true)}
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 active:scale-95 md:bottom-6"
          aria-label={t('practice.openAiTutor')}
        >
          <Sparkles size={18} />
          <span className="hidden sm:inline">{t('practice.aiTutorBtn')}</span>
        </button>
      )}

      {tutorOpen && (
        <AITutorDrawer
          user={user}
          practice={practice}
          questions={questions}
          currentQuestionNo={activeQuestionNo}
          studentAnswer={activeQuestionNo != null ? (answers[questions.find((q) => q.questionNo === activeQuestionNo)?.id ?? ''] ?? null) : null}
          onClose={() => setTutorOpen(false)}
        />
      )}
    </div>
  );
}
