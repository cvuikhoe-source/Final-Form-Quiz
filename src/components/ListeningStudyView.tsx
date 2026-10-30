import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronLeft, Headphones, Send, CheckCircle2, XCircle,
  Volume2, Trophy, RotateCcw,
} from 'lucide-react';
import type {
  ListeningLesson, ListeningQuestion, ListeningAttemptResult, User, ListeningAnswerKey,
} from '@/types';
import { AudioPlayer } from '@/components/AudioPlayer';
import { useLanguage } from '@/context/LanguageContext';
import { getListeningAudioUrl, getListeningQuestionsSafe, submitListeningAttempt } from '@/storage';

interface ListeningStudyViewProps {
  lesson: ListeningLesson;
  currentUser: User;
  onBack: () => void;
  onSubmitted: (score: number, total: number) => void;
}

const LEVEL_BADGE: Record<string, string> = {
  N5: 'bg-emerald-100 text-emerald-700',
  N4: 'bg-sky-100 text-sky-700',
  N3: 'bg-blue-100 text-blue-700',
  N2: 'bg-orange-100 text-orange-700',
  N1: 'bg-red-100 text-red-700',
};

export function ListeningStudyView({ lesson, currentUser, onBack, onSubmitted }: ListeningStudyViewProps) {
  const { t } = useLanguage();
  const [questions, setQuestions] = useState<ListeningQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, ListeningAnswerKey>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ListeningAttemptResult | null>(null);
  const [seekTo, setSeekTo] = useState<{ time: number; nonce: number } | null>(null);

  const audioUrl = useMemo(
    () => getListeningAudioUrl(lesson.audioSource, lesson.audioSourceType),
    [lesson.audioSource, lesson.audioSourceType]
  );

  useEffect(() => {
    setLoading(true);
    getListeningQuestionsSafe(lesson.id)
      .then((qs) => { setQuestions(qs); setLoading(false); })
      .catch(() => { setError(t('listening.errorLoad')); setLoading(false); });
  }, [lesson.id]);

  const answeredCount = Object.keys(answers).length;

  const choose = useCallback((qid: string, key: ListeningAnswerKey) => {
    if (result) return;
    setAnswers((prev) => ({ ...prev, [qid]: key }));
  }, [result]);

  const replaySegment = useCallback((start: number | null, end: number | null) => {
    if (start === null) return;
    setSeekTo({ time: start, nonce: Date.now() });
    if (end !== null && end > start) {
      const a = document.querySelector('audio');
      if (a) {
        const stop = () => { if (a.currentTime >= end) a.pause(); };
        a.addEventListener('timeupdate', stop, { once: true });
      }
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting || result) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await submitListeningAttempt(lesson.id, currentUser.id, currentUser.username, answers);
      setResult(res);
      onSubmitted(res.score, res.totalPoints);
    } catch {
      setError(t('listening.errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  }, [answers, currentUser.id, currentUser.username, lesson.id, onSubmitted, result, submitting]);

  const retry = useCallback(() => {
    setResult(null);
    setAnswers({});
  }, []);

  const fmt = (t: number | null) => {
    if (t === null) return '';
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="px-4 pb-28 pt-4 md:px-0 md:pb-8">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">
        <ChevronLeft size={18} /> {t('listening.backToList')}
      </button>

      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
          <Headphones size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-800">{lesson.title}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${LEVEL_BADGE[lesson.level] ?? 'bg-slate-100 text-slate-600'}`}>
              {lesson.level}
            </span>
          </div>
          {lesson.subtitle && <p className="text-xs text-slate-500">{lesson.subtitle}</p>}
          {lesson.description && <p className="mt-1 text-xs text-slate-400">{lesson.description}</p>}
        </div>
      </div>

      {/* Audio player */}
      <AudioPlayer src={audioUrl} seekTo={seekTo} />

      {/* Transcript toggle after submit */}
      {result && lesson.transcript && (
        <details className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <summary className="cursor-pointer text-xs font-semibold text-slate-600">{t('listening.viewTranscript')}</summary>
          <p className="mt-2 whitespace-pre-wrap font-jp text-xs leading-relaxed text-slate-600">{lesson.transcript}</p>
        </details>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="mt-3 text-sm text-slate-500">{t('listening.loadingQuestions')}</p>
        </div>
      )}

      {error && !loading && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && questions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Volume2 size={44} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">{t('listening.noQuestions')}</p>
        </div>
      )}

      {/* Questions */}
      {!loading && questions.length > 0 && (
        <>
          <div className="mb-3 mt-5 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">
              {t('listening.questionProgress', { answered: answeredCount, total: questions.length })}
            </p>
            {result && (
              <div className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5">
                <Trophy size={16} className="text-amber-600" />
                <span className="text-sm font-bold text-amber-700">
                  {t('listening.scoreSummary', { score: result.score, total: result.totalPoints, correct: result.correctCount, count: result.questionCount })}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {questions.map((q) => {
              const detail = result?.details.find((d) => d.questionId === q.id);
              const chosen = answers[q.id] ?? detail?.chosen ?? null;
              const options = (['A', 'B', 'C', 'D'] as ListeningAnswerKey[]).filter((k) => {
                const v = k === 'A' ? q.optionA : k === 'B' ? q.optionB : k === 'C' ? q.optionC : q.optionD;
                return v && v.trim() !== '';
              });
              const showExpl = result && q.showExplanation !== 'NEVER';
              return (
                <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-blue-100 text-[10px] font-bold text-blue-600">
                          {q.questionNo}
                        </span>
                        <span className="font-jp">{q.questionText}</span>
                      </p>
                      {q.questionTranslationVi && (
                        <p className="mt-0.5 pl-7 text-xs text-slate-500">{q.questionTranslationVi}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {q.startTimeSec !== null && q.allowReplay && (
                        <button
                          onClick={() => replaySegment(q.startTimeSec, q.endTimeSec)}
                          className="flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-600 hover:bg-sky-100"
                        >
                          <Volume2 size={12} /> {t('listening.replay')}
                        </button>
                      )}
                      {detail && (
                        detail.isCorrect
                          ? <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
                          : <XCircle size={18} className="shrink-0 text-red-500" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {options.map((k) => {
                      const v = k === 'A' ? q.optionA : k === 'B' ? q.optionB : k === 'C' ? q.optionC : q.optionD;
                      const isChosen = chosen === k;
                      const isCorrect = detail?.correct === k;
                      let cls = 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50';
                      if (result) {
                        if (isCorrect) cls = 'border-emerald-400 bg-emerald-50';
                        else if (isChosen) cls = 'border-red-300 bg-red-50';
                        else cls = 'border-slate-100 bg-slate-50 opacity-60';
                      } else if (isChosen) {
                        cls = 'border-blue-500 bg-blue-50 ring-2 ring-blue-100';
                      }
                      return (
                        <button
                          key={k}
                          disabled={!!result}
                          onClick={() => choose(q.id, k)}
                          className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${cls}`}
                        >
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                            result
                              ? isCorrect ? 'bg-emerald-500 text-white' : isChosen ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-500'
                              : isChosen ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {k}
                          </span>
                          <span className="font-jp flex-1 text-sm text-slate-700">{v}</span>
                          {result && isChosen && !isCorrect && <span className="text-[10px] font-semibold text-red-500">{t('common.yourChoice')}</span>}
                          {result && isCorrect && <span className="text-[10px] font-semibold text-emerald-600">{t('common.correctAnswer')}</span>}
                        </button>
                      );
                    })}
                  </div>

                  {result && showExpl && detail && (
                    <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3">
                      {detail.explanationVi && (
                        <p className="text-xs leading-relaxed text-slate-600">
                          <span className="font-semibold text-slate-700">{t('common.explanation')} </span>{detail.explanationVi}
                        </p>
                      )}
                      {detail.explanationJa && (
                        <p className="font-jp text-xs leading-relaxed text-slate-500">{detail.explanationJa}</p>
                      )}
                      {detail.transcriptSegment && (
                        <p className="font-jp border-t border-slate-200 pt-1.5 text-xs italic leading-relaxed text-slate-400">
                          「{detail.transcriptSegment}」
                        </p>
                      )}
                      {q.startTimeSec !== null && (
                        <p className="text-[10px] text-slate-400">
                          {t('listening.audioSegment', { start: fmt(detail.startTimeSec), end: fmt(detail.endTimeSec) })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Submit / result footer */}
          <div className="mt-5">
            {!result ? (
              <button
                onClick={handleSubmit}
                disabled={submitting || answeredCount === 0}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={17} />
                {submitting ? t('listening.submitting') : t('listening.submit', { answered: answeredCount, total: questions.length })}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-5 text-center text-white shadow-md">
                  <Trophy size={28} className="mx-auto mb-2 text-amber-300" />
                  <p className="text-3xl font-extrabold">{result.score}/{result.totalPoints}</p>
                  <p className="mt-1 text-sm text-blue-100">
                    {t('listening.correctCount', { correct: result.correctCount, total: result.questionCount })}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/25">
                    <div
                      className="h-full rounded-full bg-amber-300 transition-all duration-700"
                      style={{ width: `${result.totalPoints > 0 ? Math.round((result.score / result.totalPoints) * 100) : 0}%` }}
                    />
                  </div>
                </div>
                <button
                  onClick={retry}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw size={16} /> {t('listening.retry')}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
