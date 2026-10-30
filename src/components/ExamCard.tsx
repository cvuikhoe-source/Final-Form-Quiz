import type { Exam, User } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { getSubjectMeta, getEffectiveDeadline } from '@/storage';
import { StatusBadge, formatDate, daysUntil, ClassBadge } from './shared';
import { Clock, CalendarClock, CheckCircle2, ExternalLink } from 'lucide-react';

interface ExamCardProps {
  exam: Exam;
  user: User;
  completed: boolean;
  score?: number;
  onStart: (exam: Exam) => void;
  onMarkCompleted: (id: string) => void;
  showTargetClasses?: boolean;
}

export function ExamCard({ exam, user, completed, score, onStart, onMarkCompleted, showTargetClasses = false }: ExamCardProps) {
  const { t } = useLanguage();
  const meta = getSubjectMeta(exam.subject);
  const effectiveDeadline = getEffectiveDeadline(exam, user);
  const days = daysUntil(effectiveDeadline);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-slate-300">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${meta.bg} ${meta.text}`}>
            {exam.subject}
          </span>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {t('exam.grade', { grade: exam.grade })}
          </span>
        </div>
        <StatusBadge status={exam.status} />
      </div>

      <h3 className="mb-3 text-base font-semibold leading-snug text-slate-800">{exam.title}</h3>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Clock size={15} className="text-slate-400" />
          {exam.durationMinutes} {t('common.minutes')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock size={15} className="text-slate-400" />
          {t('exam.deadline', { date: formatDate(effectiveDeadline) })}
        </span>
      </div>

      {showTargetClasses && exam.targetClasses.length > 0 && (
        <div className="mb-3">
          <ClassBadge classes={exam.targetClasses} />
        </div>
      )}

      {exam.status === 'open' && !completed && (
        <div className="mb-3 text-xs font-medium text-amber-600">
          {days > 0 ? t('exam.daysLeft', { count: days }) : days === 0 ? t('exam.dueToday') : t('exam.overdue', { count: Math.abs(days) })}
        </div>
      )}

      {completed && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          <CheckCircle2 size={15} />
          {t('exam.completed')}
          {score !== undefined && (
            <span className="ml-1 rounded bg-white px-1.5 py-0.5 font-bold text-emerald-700">{t('exam.scoreLabel', { score })}</span>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {exam.status === 'open' && !completed ? (
          <button
            onClick={() => onStart(exam)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.98] hover:bg-blue-700"
          >
            <ExternalLink size={16} />
            {t('exam.start')}
          </button>
        ) : completed ? (
          <button
            onClick={() => onStart(exam)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-600 transition-all active:scale-[0.98] hover:bg-slate-100"
          >
            <ExternalLink size={16} />
            {t('exam.review')}
          </button>
        ) : (
          <button
            disabled
            className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-400"
          >
            {t('exam.notOpen')}
          </button>
        )}

        {exam.status === 'open' && !completed && (
          <button
            onClick={() => onMarkCompleted(exam.id)}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700 transition-all active:scale-[0.98] hover:bg-emerald-100"
            title={t('exam.markComplete')}
          >
            <CheckCircle2 size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
