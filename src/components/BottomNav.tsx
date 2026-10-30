import type { Role, ViewMode } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import type { TranslationKey } from '@/locales/vn';
import { ClipboardList, Users, BarChart3, UserCircle, History, GraduationCap, BookOpen, PencilLine } from 'lucide-react';

interface BottomNavProps {
  role: Role;
  current: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const ADMIN_NAV: { mode: ViewMode; label: TranslationKey; icon: typeof ClipboardList }[] = [
  { mode: 'lessons', label: 'nav.lessons', icon: BookOpen },
  { mode: 'practice', label: 'nav.practice', icon: PencilLine },
  { mode: 'exams', label: 'nav.exams', icon: ClipboardList },
  { mode: 'users', label: 'nav.users', icon: Users },
  { mode: 'stats', label: 'nav.stats', icon: BarChart3 },
  { mode: 'profile', label: 'nav.profile', icon: UserCircle },
];

const TEACHER_NAV: { mode: ViewMode; label: TranslationKey; icon: typeof ClipboardList }[] = [
  { mode: 'lessons', label: 'nav.lessons', icon: BookOpen },
  { mode: 'practice', label: 'nav.practice', icon: PencilLine },
  { mode: 'exams', label: 'nav.exams', icon: ClipboardList },
  { mode: 'students', label: 'nav.students', icon: GraduationCap },
  { mode: 'stats', label: 'nav.stats', icon: BarChart3 },
  { mode: 'profile', label: 'nav.profile', icon: UserCircle },
];

const STUDENT_NAV: { mode: ViewMode; label: TranslationKey; icon: typeof ClipboardList }[] = [
  { mode: 'lessons', label: 'nav.lessons', icon: BookOpen },
  { mode: 'practice', label: 'nav.practice', icon: PencilLine },
  { mode: 'exams', label: 'nav.examsStudent', icon: ClipboardList },
  { mode: 'history', label: 'nav.history', icon: History },
  { mode: 'profile', label: 'nav.profile', icon: UserCircle },
];

export function BottomNav({ role, current, onChange }: BottomNavProps) {
  const { t } = useLanguage();
  const items = role === 'admin' ? ADMIN_NAV : role === 'teacher' ? TEACHER_NAV : STUDENT_NAV;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-60 flex-col border-r border-slate-200/80 bg-white md:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-md">
            <GraduationCap size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800">QuizForms</h1>
            <p className="text-[10px] text-slate-400">{t('header.tagline')}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {items.map((item) => {
            const Icon = item.icon;
            const active = current === item.mode;
            return (
              <button
                key={item.mode}
                onClick={() => onChange(item.mode)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {t(item.label)}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 glass border-t border-slate-200/80 safe-bottom md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {items.map((item) => {
            const Icon = item.icon;
            const active = current === item.mode;
            return (
              <button
                key={item.mode}
                onClick={() => onChange(item.mode)}
                className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors ${
                  active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                }`}
              >
                {active && (
                  <span className="absolute top-0 h-1 w-8 rounded-full bg-blue-600 dark:bg-blue-400" />
                )}
                <Icon size={21} strokeWidth={active ? 2.5 : 2} />
                <span className={`text-[10px] font-medium ${active ? 'font-semibold' : ''}`}>
                  {t(item.label)}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
