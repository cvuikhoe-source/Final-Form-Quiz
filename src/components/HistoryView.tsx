import { useMemo, useState } from 'react';
import type { Exam, User, CompletionRecord, ExamResult } from '@/types';
import { getSubjectMeta, isExamCompletedByUser } from '@/storage';
import { formatDateTime, formatDate } from './shared';
import { getEffectiveDeadline } from '@/storage';
import { CheckCircle2, Clock, XCircle, History as HistoryIcon, ExternalLink, Award } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface HistoryViewProps {
  exams: Exam[];
  user: User;
  completions: CompletionRecord[];
  results: ExamResult[];
}

export function HistoryView({ exams, user, completions, results }: HistoryViewProps) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'completed' | 'missed'>('completed');

  const userCompletions = useMemo(
    () => completions.filter((c) => c.userId === user.id),
    [completions, user.id]
  );

  const getScore = (examId: string): ExamResult | undefined => {
    return results.find((r) => r.examId === examId && (r.studentUsername === user.username || r.studentName === user.fullName));
  };

  const completedExams = useMemo(() => {
    return exams
      .filter((e) => isExamCompletedByUser(e.id, user.id, completions))
      .map((e) => ({ exam: e, record: userCompletions.find((c) => c.examId === e.id) }))
      .sort((a, b) => (b.record?.completedAt ?? '').localeCompare(a.record?.completedAt ?? ''));
  }, [exams, user, completions, userCompletions]);

  const missedExams = useMemo(
    () => exams.filter((e) => !isExamCompletedByUser(e.id, user.id, completions) && e.status === 'closed'),
    [exams, user, completions]
  );

  const list = tab === 'completed' ? completedExams : missedExams.map((e) => ({ exam: e, record: undefined }));

  return (
    <div className="px-4 pb-24 pt-4 md:px-0 md:pb-8">
      <h2 className="mb-1 text-lg font-bold text-slate-800">{t('history.title')}</h2>
      <p className="mb-4 text-sm text-slate-500">{t('history.subtitle')}</p>

      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab('completed')}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${tab === 'completed' ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}`}>
          <CheckCircle2 size={16} /> {t('history.tab.completed', { count: completedExams.length })}
        </button>
        <button onClick={() => setTab('missed')}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${tab === 'missed' ? 'bg-red-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}`}>
          <XCircle size={16} /> {t('history.tab.missed', { count: missedExams.length })}
        </button>
      </div>

      {list.length > 0 ? (
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 lg:grid-cols-3">
          {list.map(({ exam, record }) => {
            const meta = getSubjectMeta(exam.subject);
            const score = getScore(exam.id);
            return (
              <div key={exam.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${meta.bg} ${meta.text}`}>{exam.subject}</span>
                  {tab === 'completed' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 size={14} /> {t('history.submitted')}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500"><XCircle size={14} /> {t('history.notDone')}</span>
                  )}
                </div>

                <h3 className="mb-2 text-sm font-semibold text-slate-800">{exam.title}</h3>

                <div className="space-y-1 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5"><Clock size={14} className="text-slate-400" /> {t('common.minutesCount', { count: exam.durationMinutes })}</div>
                  <div>{t('history.deadline', { date: formatDate(getEffectiveDeadline(exam, user)) })}</div>
                  {tab === 'completed' && record && (
                    <div className="font-medium text-emerald-600">{t('history.completedAt', { time: formatDateTime(record.completedAt) })}</div>
                  )}
                </div>

                {score && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <Award size={18} className={score.score >= 5 ? 'text-emerald-600' : 'text-red-500'} />
                    <span className="text-sm text-slate-500">{t('history.scoreLabel')}</span>
                    <span className={`text-lg font-bold ${score.score >= 5 ? 'text-emerald-600' : 'text-red-500'}`}>{score.score}</span>
                    <span className="ml-auto text-xs text-slate-400">{score.status === 'graded' ? t('history.graded') : t('history.notGraded')}</span>
                  </div>
                )}

                <div className="mt-3">
                  <a href={exam.formsUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    <ExternalLink size={14} /> {t('history.openForms')}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <HistoryIcon size={48} className="mb-3 text-slate-300" />
          {tab === 'completed' ? (
            <><p className="text-sm font-medium text-slate-500">{t('history.emptyCompleted')}</p><p className="mt-1 text-xs text-slate-400">{t('history.emptyCompletedHint')}</p></>
          ) : (
            <><p className="text-sm font-medium text-slate-500">{t('history.emptyMissed')}</p><p className="mt-1 text-xs text-slate-400">{t('history.emptyMissedHint')}</p></>
          )}
        </div>
      )}
    </div>
  );
}
