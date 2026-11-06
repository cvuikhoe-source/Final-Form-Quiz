import { useEffect } from 'react';
import type { Role, ViewMode } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import type { TranslationKey } from '@/locales/vn';
import { ClipboardList, Users, BarChart3, UserCircle, History, GraduationCap, BookOpen, PencilLine, X } from 'lucide-react';

interface BottomNavProps {
  role: Role;
  current: ViewMode;
  onChange: (mode: ViewMode) => void;
  mobileMenuOpen?: boolean;
  onCloseMobileMenu?: () => void;
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

export function BottomNav({ role, current, onChange, mobileMenuOpen = false, onCloseMobileMenu }: BottomNavProps) {
  const { t } = useLanguage();
  const items = role === 'admin' ? ADMIN_NAV : role === 'teacher' ? TEACHER_NAV : STUDENT_NAV;

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // Handle ESC key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen && onCloseMobileMenu) {
        onCloseMobileMenu();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, onCloseMobileMenu]);

  return (
    <>
      {/* ─── MOBILE DRAWER BACKDROP ─── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300 md:hidden"
          onClick={onCloseMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* ─── MOBILE DRAWER SIDEBAR (< 768px) ─── */}
      <aside
        id="mobile-navigation-drawer"
        aria-label="Menu điều hướng di động"
        aria-modal="true"
        role="dialog"
        className={`fixed left-0 top-0 bottom-0 z-50 flex h-full w-[280px] max-w-[82vw] flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-in-out md:hidden dark:border-slate-800 dark:bg-slate-900 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-md">
              <GraduationCap size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800 dark:text-white">QuizForms</h1>
              <p className="text-[10px] text-slate-400">{t('header.tagline')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobileMenu}
            aria-label="Đóng menu"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>

        {/* Drawer Navigation List */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const Icon = item.icon;
            const active = current === item.mode;
            return (
              <button
                key={item.mode}
                type="button"
                onClick={() => {
                  onChange(item.mode);
                  onCloseMobileMenu?.();
                }}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                  active
                    ? 'bg-blue-50 text-blue-700 shadow-2xs dark:bg-blue-950/60 dark:text-blue-400'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ─── DESKTOP FIXED SIDEBAR (>= 768px) ─── */}
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-60 flex-col border-r border-slate-200/80 bg-white md:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-md">
            <GraduationCap size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 dark:text-white">QuizForms</h1>
            <p className="text-[10px] text-slate-400">{t('header.tagline')}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const Icon = item.icon;
            const active = current === item.mode;
            return (
              <button
                key={item.mode}
                type="button"
                onClick={() => onChange(item.mode)}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ─── MOBILE BOTTOM NAV BAR (< 768px) ─── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 glass border-t border-slate-200/80 safe-bottom md:hidden">
        <div className="mx-auto flex w-full max-w-md items-stretch justify-around">
          {items.map((item) => {
            const Icon = item.icon;
            const active = current === item.mode;
            return (
              <button
                key={item.mode}
                type="button"
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
