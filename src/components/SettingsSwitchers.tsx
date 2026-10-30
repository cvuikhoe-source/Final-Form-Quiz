import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useLanguage } from '@/context/LanguageContext';

const btnCls =
  'flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors duration-200 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme} className={`${btnCls} w-9`} aria-label="Chuyển giao diện sáng/tối">
      {theme === 'dark' ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} />}
    </button>
  );
}

export function LanguageToggle() {
  const { lang, toggleLang } = useLanguage();
  return (
    <button
      onClick={toggleLang}
      aria-label={lang === 'vn' ? 'Switch to English' : 'Chuyển sang tiếng Việt'}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm transition-colors duration-200 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      {lang === 'vn' ? 'VN' : 'EN'}
    </button>
  );
}
