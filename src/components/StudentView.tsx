import { useState, useMemo, useEffect } from 'react';
import type { Exam, User, CompletionRecord, ExamResult } from '@/types';
import { ExamCard } from './ExamCard';
import { loadSubjects, getSubjectMeta, examVisibleForUser, isExamCompletedByUser, isExpiredForUser } from '@/storage';
import { Search, SlidersHorizontal, Inbox } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface StudentViewProps {
  exams: Exam[];
  user: User;
  completions: CompletionRecord[];
  results: ExamResult[];
  onStart: (exam: Exam) => void;
  onMarkCompleted: (id: string) => void;
}

export function StudentView({ exams, user, completions, results, onStart, onMarkCompleted }: StudentViewProps) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [subjects, setSubjects] = useState<string[]>([]);

  useEffect(() => { loadSubjects().then(setSubjects); }, []);

  const visibleExams = useMemo(
    () => exams.filter((e) => examVisibleForUser(e, user)),
    [exams, user]
  );

  const allSubjects = useMemo(() => {
    if (user.allowedSubjects.length > 0) return user.allowedSubjects;
    const examSubjects = visibleExams.map((e) => e.subject);
    const combined = new Set([...subjects, ...examSubjects]);
    return Array.from(combined);
  }, [subjects, visibleExams, user.allowedSubjects]);

  const filtered = useMemo(() => {
    return visibleExams.filter((e) => {
      const matchesSearch = e.title.toLowerCase().includes(search.toLowerCase());
      const matchesSubject = filterSubject === 'all' || e.subject === filterSubject;
      return matchesSearch && matchesSubject;
    });
  }, [visibleExams, search, filterSubject]);

  const openCount = visibleExams.filter((e) => e.status === 'open' && !isExpiredForUser(e, user) && !isExamCompletedByUser(e.id, user.id, completions)).length;
  const completedCount = visibleExams.filter((e) => isExamCompletedByUser(e.id, user.id, completions)).length;

  // Get score for an exam
  const getScore = (examId: string): ExamResult | undefined => {
    return results.find((r) => r.examId === examId && (r.studentUsername === user.username || r.studentName === user.fullName));
  };

  const classLabel = user.assignedClasses.length > 0 ? user.assignedClasses.join(', ') : t('common.allClasses');

  return (
    <div className="px-4 pb-24 pt-4 md:px-0 md:pb-8">
      <div className="mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-4 text-white shadow-md">
        <p className="text-sm text-blue-100">{t('student.greeting')}</p>
        <p className="text-lg font-bold">{user.fullName}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="rounded-lg bg-white/15 px-2 py-0.5 text-xs font-medium">{t('student.classLabel', { label: classLabel })}</span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
          <p className="text-2xl font-bold text-blue-600">{openCount}</p>
          <p className="text-xs text-slate-500">{t('student.openExams')}</p>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
          <p className="text-2xl font-bold text-emerald-600">{completedCount}</p>
          <p className="text-xs text-slate-500">{t('common.completed')}</p>
        </div>
      </div>

      <div className="relative mb-3">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('student.searchPlaceholder')}
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm shadow-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
      </div>

      <div className="mb-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <SlidersHorizontal size={16} className="shrink-0 text-slate-400" />
        <button onClick={() => setFilterSubject('all')}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${filterSubject === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
          {t('common.all')}
        </button>
        {allSubjects.map((s) => {
          const meta = getSubjectMeta(s);
          const active = filterSubject === s;
          return (
            <button key={s} onClick={() => setFilterSubject(s)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${active ? 'bg-blue-600 text-white' : `${meta.bg} ${meta.text} border border-transparent`}`}>
              {s}
            </button>
          );
        })}
      </div>

      {visibleExams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox size={48} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">{t('student.empty')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('student.emptyHint')}</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 lg:grid-cols-3">
          {filtered.map((exam) => {
            const score = getScore(exam.id);
            return (
              <ExamCard
                key={exam.id}
                exam={exam}
                user={user}
                completed={isExamCompletedByUser(exam.id, user.id, completions)}
                score={score?.score}
                onStart={onStart}
                onMarkCompleted={onMarkCompleted}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox size={48} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">{t('student.noMatch')}</p>
        </div>
      )}
    </div>
  );
}
