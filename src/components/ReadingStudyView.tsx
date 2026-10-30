import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft, ChevronDown, ChevronUp, BookOpen, Clock, CheckCircle2, XCircle,
  Send, Trophy, RotateCcw, Lightbulb, Quote, ArrowDown,
} from 'lucide-react';
import type {
  ReadingLesson, ReadingQuestionSafe, ReadingGrammar, ReadingResult,
  ReadingProgressRecord, ReadingUiState, User, ReadingAnswerDetail,
} from '@/types';
import {
  getReadingQuestionsSafe, loadReadingGrammar, loadReadingProgress,
  saveReadingProgressRecord, submitReadingAttempt,
} from '@/storage';
import { useLanguage } from '@/context/LanguageContext';

interface ReadingStudyViewProps {
  lesson: ReadingLesson;
  currentUser: User;
  onBack: () => void;
  onNavigate: (lesson: ReadingLesson) => void;
  prevLesson: ReadingLesson | null;
  nextLesson: ReadingLesson | null;
  onCompleted: (id: string) => void;
}

const LEVEL_BADGE: Record<string, string> = {
  N5: 'bg-emerald-100 text-emerald-700',
  N4: 'bg-sky-100 text-sky-700',
  N3: 'bg-blue-100 text-blue-700',
  N2: 'bg-orange-100 text-orange-700',
  N1: 'bg-red-100 text-red-700',
};

function Accordion({
  title, icon, expanded, onToggle, children,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 bg-slate-50/80 px-4 py-3 text-left transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
          {icon} {title}
        </span>
        {expanded ? <ChevronUp size={18} className="shrink-0 text-slate-400" /> : <ChevronDown size={18} className="shrink-0 text-slate-400" />}
      </button>
      {expanded && <div className="px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

export function ReadingStudyView({
  lesson, currentUser, onBack, onNavigate, prevLesson, nextLesson, onCompleted,
}: ReadingStudyViewProps) {
  const { t } = useLanguage();
  const [questions, setQuestions] = useState<ReadingQuestionSafe[]>([]);
  const [grammar, setGrammar] = useState<ReadingGrammar[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [qExpanded, setQExpanded] = useState(true);
  const [gExpanded, setGExpanded] = useState(true);
  const [aExpanded, setAExpanded] = useState(true);
  const [showUnanswered, setShowUnanswered] = useState(false);
  const textRef = useRef<HTMLDivElement | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answeredCount = Object.keys(answers).length;

  // Load questions, grammar, and saved progress
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setResult(null);
    setAnswers({});
    setFlipped(false);
    setQExpanded(true);
    setGExpanded(true);
    setAExpanded(true);
    Promise.all([
      getReadingQuestionsSafe(lesson.id),
      loadReadingGrammar(lesson.id),
      loadReadingProgress(currentUser.id, lesson.id),
    ]).then(([qs, g, prog]) => {
      if (!alive) return;
      setQuestions(qs);
      setGrammar(g);
      if (prog) {
        setAnswers(prog.answers ?? {});
        if (prog.result) setResult(prog.result);
        if (prog.uiState) {
          const ui: ReadingUiState = prog.uiState;
          if (ui.questionExpanded !== undefined) setQExpanded(ui.questionExpanded);
          if (ui.grammarExpanded !== undefined) setGExpanded(ui.grammarExpanded);
          if (ui.answerExpanded !== undefined) setAExpanded(ui.answerExpanded);
          if (ui.translationFlipped !== undefined) setFlipped(ui.translationFlipped);
        }
        if (prog.readingScrollPosition > 0 && textRef.current) {
          setTimeout(() => { if (textRef.current) textRef.current.scrollTop = prog.readingScrollPosition; }, 100);
        }
      }
      setLoading(false);
    }).catch(() => {
      if (!alive) return;
      setError(t('reading.loadError'));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [lesson.id, currentUser.id]);

  // Debounced persistence of answers + scroll + UI state
  const persist = useCallback((overrides: Partial<ReadingProgressRecord> = {}) => {
    const payload: ReadingProgressRecord = {
      answers,
      score: result?.score ?? 0,
      totalPoints: result?.totalPoints ?? 0,
      correctCount: result?.correctCount ?? 0,
      questionCount: result?.questionCount ?? questions.length,
      completed: result !== null,
      readingScrollPosition: textRef.current?.scrollTop ?? 0,
      uiState: { questionExpanded: qExpanded, grammarExpanded: gExpanded, answerExpanded: aExpanded, translationFlipped: flipped },
      result,
      updatedAt: '',
      ...overrides,
    };
    saveReadingProgressRecord(currentUser.id, lesson.id, payload).catch(() => undefined);
  }, [answers, result, questions.length, qExpanded, gExpanded, aExpanded, flipped, currentUser.id, lesson.id]);

  const persistUi = useCallback((ui: ReadingUiState) => {
    persist({ uiState: ui, readingScrollPosition: textRef.current?.scrollTop ?? 0 });
  }, [persist]);

  const toggleQ = useCallback(() => {
    setQExpanded((v) => { const nv = !v; persistUi({ questionExpanded: nv, grammarExpanded: gExpanded, answerExpanded: aExpanded, translationFlipped: flipped }); return nv; });
  }, [persistUi, gExpanded, aExpanded, flipped]);

  const toggleG = useCallback(() => {
    setGExpanded((v) => { const nv = !v; persistUi({ questionExpanded: qExpanded, grammarExpanded: nv, answerExpanded: aExpanded, translationFlipped: flipped }); return nv; });
  }, [persistUi, qExpanded, aExpanded, flipped]);

  const toggleA = useCallback(() => {
    setAExpanded((v) => { const nv = !v; persistUi({ questionExpanded: qExpanded, grammarExpanded: gExpanded, answerExpanded: nv, translationFlipped: flipped }); return nv; });
  }, [persistUi, qExpanded, gExpanded, flipped]);

  const onScroll = useCallback(() => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => persist(), 600);
  }, [persist]);

  const choose = useCallback((qid: string, key: string, multi: boolean) => {
    if (result) return;
    setAnswers((prev) => {
      if (!multi) return { ...prev, [qid]: key };
      const cur = (prev[qid] ?? '').split('').filter(Boolean);
      const next = cur.includes(key) ? cur.filter((c) => c !== key) : [...cur, key].sort();
      return { ...prev, [qid]: next.join('') };
    });
  }, [result]);

  const handleSubmit = useCallback(async () => {
    if (submitting || result) return;
    if (answeredCount < questions.length) {
      setShowUnanswered(true);
      setTimeout(() => setShowUnanswered(false), 3000);
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await submitReadingAttempt(lesson.id, currentUser.id, answers);
      setResult(res);
      setAExpanded(true);
      onCompleted(lesson.id);
    } catch {
      setError(t('listening.errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  }, [answers, answeredCount, questions.length, submitting, result, lesson.id, currentUser.id, onCompleted]);

  const retry = useCallback(() => {
    setResult(null);
    setAnswers({});
  }, []);

  const options = (q: ReadingQuestionSafe) => (['A', 'B', 'C', 'D'] as const).filter((k) => {
    const v = k === 'A' ? q.optionA : k === 'B' ? q.optionB : k === 'C' ? q.optionC : q.optionD;
    return v && v.trim() !== '';
  });

  return (
    <div className="px-4 pb-28 pt-4 md:px-0 md:pb-8">
      <button onClick={onBack} className="mb-2 flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">
        <ChevronLeft size={18} /> {t('reading.breadcrumb', { level: lesson.level, no: String(lesson.lessonNo).padStart(2, '0') })}
      </button>

      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-400">{t('reading.lessonNo', { no: String(lesson.lessonNo).padStart(2, '0') })}</p>
          <h2 className="font-jp text-lg font-bold text-slate-800">{lesson.titleJa}</h2>
          {lesson.titleVi && <p className="text-sm text-slate-500">{lesson.titleVi}</p>}
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
            <span className={`rounded px-1.5 py-0.5 font-bold ${LEVEL_BADGE[lesson.level] ?? ''}`}>{lesson.level}</span>
            <span className="flex items-center gap-1"><Clock size={10} /> {t('common.minutesCount', { count: lesson.estimatedMinutes })}</span>
            {lesson.category && <span>{lesson.category}</span>}
          </div>
        </div>
        {result && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5">
            <Trophy size={15} className="text-amber-600" />
            <span className="text-sm font-bold text-amber-700">{result.score}/{result.totalPoints}</span>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && (
        <>
          {/* ── STICKY READING PANEL — full width, top/bottom layout ── */}
          <div className="sticky top-[61px] z-30 mb-4 md:top-[81px]">
            <div className="flashcard-3d h-[calc(32vh+84px)] md:h-[calc(38vh+84px)]">
              <div className={`flashcard-inner ${flipped ? 'flipped' : ''}`}>
                {/* Front: Japanese reading */}
                <div className="flashcard-face flashcard-front flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
                  <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-700"><BookOpen size={16} /> {t('reading.readingPanel')}</span>
                    <span className="font-jp text-[10px] text-slate-400">日本語</span>
                  </div>
                  <div
                    ref={textRef}
                    onScroll={onScroll}
                    className="font-jp min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-5 py-4 text-[16px] leading-[2] text-slate-700 selection:bg-blue-100 md:px-8 md:text-[18px] nice-scroll"
                  >
                    {lesson.readingTextJa}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFlipped((f) => !f)}
                    className="flex shrink-0 items-center justify-center gap-1.5 border-t border-slate-100 bg-white py-2.5 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-sky-50 hover:text-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    <RotateCcw size={12} /> {t('reading.viewTranslation')}
                  </button>
                </div>
                {/* Back: Vietnamese translation — same size, reuses vocab flashcard animation */}
                <div className="flashcard-face flashcard-back flex flex-col overflow-hidden rounded-2xl border border-sky-200 bg-sky-50/95 shadow-md">
                  <div className="flex shrink-0 items-center justify-between border-b border-sky-100 bg-sky-50 px-4 py-2.5">
                    <span className="flex items-center gap-2 text-xs font-bold text-sky-700"><Quote size={14} /> {t('reading.translationPanel')}</span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-5 py-4 text-sm leading-[1.8] text-slate-600 md:px-8 nice-scroll">
                    {lesson.translationVi || t('reading.noTranslation')}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFlipped((f) => !f)}
                    className="flex shrink-0 items-center justify-center gap-1.5 border-t border-sky-100 bg-white py-2.5 text-[11px] font-semibold text-sky-500 transition-colors hover:bg-sky-50 hover:text-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    <RotateCcw size={12} /> {t('reading.viewOriginal')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Scroll hint */}
          <div className="mb-3 flex items-center gap-1.5 pl-1 text-[10px] font-medium text-slate-400">
            <ArrowDown size={11} /> {t('reading.scrollHint')}
          </div>

          {/* ── LEARNING AREA — Questions ── */}
          {questions.length > 0 && (
            <Accordion
              title={t('reading.questionsTitle', { answered: answeredCount, total: questions.length })}
              icon={<Lightbulb size={16} />}
              expanded={qExpanded}
              onToggle={toggleQ}
            >
              <div className="nice-scroll max-h-[60vh] space-y-3 overflow-y-auto pr-1 md:max-h-[480px]">
                {questions.map((q) => {
                  const detail = result?.details.find((d) => d.questionId === q.id) as ReadingAnswerDetail | undefined;
                  const chosen = answers[q.id] ?? detail?.chosen ?? null;
                  const multi = q.questionType === 'multiple_choice';
                  return (
                    <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">
                          <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-teal-100 text-[10px] font-bold text-teal-600">{q.questionNo}</span>
                          {q.questionTextVi}
                        </p>
                        {detail && (detail.isCorrect ? <CheckCircle2 size={18} className="shrink-0 text-emerald-500" /> : <XCircle size={18} className="shrink-0 text-red-400" />)}
                      </div>
                      <div className="space-y-1.5">
                        {options(q).map((k) => {
                          const v = k === 'A' ? q.optionA : k === 'B' ? q.optionB : k === 'C' ? q.optionC : q.optionD;
                          const isChosen = chosen?.includes(k) ?? false;
                          const isCorrect = detail?.correct.includes(k) ?? false;
                          let cls = 'border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/40';
                          if (result) {
                            if (isCorrect) cls = 'border-emerald-300 bg-emerald-50';
                            else if (isChosen) cls = 'border-red-300 bg-red-50';
                            else cls = 'border-slate-100 bg-slate-50 opacity-60';
                          } else if (isChosen) {
                            cls = 'border-teal-500 bg-teal-50 ring-2 ring-teal-100';
                          }
                          return (
                            <button
                              key={k}
                              disabled={!!result}
                              onClick={() => choose(q.id, k, multi)}
                              className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${cls}`}
                            >
                              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                result ? (isCorrect ? 'bg-emerald-500 text-white' : isChosen ? 'bg-red-400 text-white' : 'bg-slate-200 text-slate-500')
                                  : isChosen ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {k}
                              </span>
                              <span className="flex-1 text-sm text-slate-700">{v}</span>
                              {result && isChosen && !isCorrect && <span className="text-[10px] font-semibold text-red-500">{t('common.yourChoice')}</span>}
                              {result && isCorrect && <span className="text-[10px] font-semibold text-emerald-600">{t('common.correctAnswer')}</span>}
                            </button>
                          );
                        })}
                      </div>
                      {result && detail && (
                        <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-600">
                            <span className="font-semibold">{t('reading.yourChoiceLabel')} </span>
                            <span className={detail.isCorrect ? 'text-emerald-600' : 'text-red-500'}>{detail.chosen ?? '—'}</span>
                            {!detail.isCorrect && <span className="font-semibold"> · {t('reading.correctLabel')} <span className="text-emerald-600">{detail.correct}</span></span>}
                            <span className="ml-1 font-semibold text-emerald-600">{detail.isCorrect ? t('reading.resultCorrect') : t('reading.resultWrong')}</span>
                            <span className="ml-1 text-slate-400">{t('reading.pointsEarned', { earned: detail.earned, points: detail.points })}</span>
                          </p>
                          {detail.explanationVi && (
                            <p className="text-xs leading-relaxed text-slate-600"><span className="font-semibold">{t('common.explanation')} </span>{detail.explanationVi}</p>
                          )}
                          {detail.evidenceJa && (
                            <p className="font-jp border-l-2 border-teal-300 pl-2 text-xs italic leading-relaxed text-slate-500">「{detail.evidenceJa}」</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Accordion>
          )}

          {/* ── LEARNING AREA — Grammar ── */}
          {grammar.length > 0 && (
            <div className="mt-3">
              <Accordion
                title={t('reading.grammarTitle', { count: grammar.length })}
                icon={<BookOpen size={16} />}
                expanded={gExpanded}
                onToggle={toggleG}
              >
                <div className="nice-scroll max-h-[50vh] space-y-3 overflow-y-auto pr-1 md:max-h-[400px]">
                  {grammar.map((g) => (
                    <div key={g.id} className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
                      <p className="font-jp text-sm font-bold text-slate-800">{'①②③④⑤⑥⑦⑧⑨⑩'[g.grammarNo - 1] ?? g.grammarNo} {g.pattern}</p>
                      <div className="mt-2 space-y-1 text-xs leading-relaxed">
                        {g.meaningVi && <p><span className="font-semibold text-blue-600">{t('reading.meaning')}</span> <span className="text-slate-600">{g.meaningVi}</span></p>}
                        {g.formation && <p><span className="font-semibold text-violet-500">{t('reading.structure')}</span> <span className="font-jp text-slate-600">{g.formation}</span></p>}
                        {g.exampleJa && <p><span className="font-semibold text-teal-600">{t('reading.example')}</span> <span className="font-jp text-slate-600">{g.exampleJa}</span></p>}
                        {g.exampleVi && <p><span className="font-semibold text-slate-400">{t('reading.translation')}</span> <span className="text-slate-500">{g.exampleVi}</span></p>}
                        {g.noteVi && <p className="rounded-lg bg-white/70 p-2 text-slate-500"><span className="font-semibold text-orange-500">{t('reading.note')}</span> {g.noteVi}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Accordion>
            </div>
          )}

          {/* ── LEARNING AREA — Submit (before result) ── */}
          {questions.length > 0 && !result && (
            <div className="mt-5">
              {showUnanswered && (
                <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-600">
                  {t('reading.unansweredWarning')}
                </p>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-teal-700 disabled:opacity-50"
              >
                <Send size={17} /> {submitting ? t('listening.submitting') : t('reading.submit')}
              </button>
            </div>
          )}

          {/* ── LEARNING AREA — Result summary + Answers accordion (after submit) ── */}
          {questions.length > 0 && result && (
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-600 p-5 text-center text-white shadow-md">
                <Trophy size={28} className="mx-auto mb-2 text-amber-300" />
                <p className="text-3xl font-extrabold">{result.score}/{result.totalPoints}</p>
                <p className="mt-1 text-sm text-teal-100">
                  {t('reading.correctSummary', { correct: result.correctCount, wrong: result.questionCount - result.correctCount })}
                </p>
              </div>
              <Accordion
                title={t('reading.answersTitle')}
                icon={<CheckCircle2 size={16} />}
                expanded={aExpanded}
                onToggle={toggleA}
              >
                <div className="nice-scroll max-h-[60vh] space-y-3 overflow-y-auto pr-1 md:max-h-[480px]">
                  {result.details.map((d) => {
                    const detail = d as ReadingAnswerDetail;
                    return (
                      <div key={detail.questionId} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800">
                            <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-teal-100 text-[10px] font-bold text-teal-600">{detail.questionNo}</span>
                            {t('reading.questionNo', { no: detail.questionNo })}
                          </p>
                          {detail.isCorrect ? <CheckCircle2 size={18} className="shrink-0 text-emerald-500" /> : <XCircle size={18} className="shrink-0 text-red-400" />}
                        </div>
                        <div className="space-y-1.5 text-xs text-slate-600">
                          <p>
                            <span className="font-semibold">{t('reading.yourChoiceLabel')} </span>
                            <span className={detail.isCorrect ? 'text-emerald-600' : 'text-red-500'}>{detail.chosen ?? '—'}</span>
                            <span className="font-semibold"> · {t('reading.correctLabel')} <span className="text-emerald-600">{detail.correct}</span></span>
                            <span className="ml-1 font-semibold text-emerald-600">{detail.isCorrect ? t('reading.resultCorrect') : t('reading.resultWrong')}</span>
                            <span className="ml-1 text-slate-400">{t('reading.pointsEarned', { earned: detail.earned, points: detail.points })}</span>
                          </p>
                          {detail.explanationVi && (
                            <p className="leading-relaxed"><span className="font-semibold">{t('common.explanation')} </span>{detail.explanationVi}</p>
                          )}
                          {detail.evidenceJa && (
                            <p className="font-jp border-l-2 border-teal-300 pl-2 italic leading-relaxed text-slate-500">「{detail.evidenceJa}」</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Accordion>
              <button
                onClick={retry}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw size={16} /> {t('listening.retry')}
              </button>
            </div>
          )}

          {/* Prev / Next — non-sticky, bottom of learning area */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => prevLesson && onNavigate(prevLesson)}
              disabled={!prevLesson}
              aria-label={t('reading.prevLesson')}
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} /> {t('reading.prevBtn')}
            </button>
            <button
              onClick={() => nextLesson && onNavigate(nextLesson)}
              disabled={!nextLesson}
              aria-label={t('reading.nextLesson')}
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-teal-200 bg-teal-50 py-3 text-sm font-semibold text-teal-700 shadow-sm transition-all hover:bg-teal-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('reading.nextBtn')} <ChevronLeft size={16} className="rotate-180" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
