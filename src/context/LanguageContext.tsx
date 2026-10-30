import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { vn } from '@/locales/vn';
import type { Lang, TranslationKey } from '@/locales/vn';
import { en } from '@/locales/en';

type Translator = (key: TranslationKey, vars?: Record<string, string | number>) => string;

const dictionaries: Record<Lang, Record<TranslationKey, string>> = { vn, en };

const LanguageContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; toggleLang: () => void; t: Translator }>({
  lang: 'vn',
  setLang: () => {},
  toggleLang: () => {},
  t: (key) => vn[key],
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    localStorage.getItem('app_lang') === 'en' ? 'en' : 'vn'
  );

  useEffect(() => {
    localStorage.setItem('app_lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback<Translator>(
    (key, vars) => {
      let text: string = dictionaries[lang][key] ?? vn[key];
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.split(`{${name}}`).join(String(value));
        }
      }
      return text;
    },
    [lang]
  );

  const setLang = (l: Lang) => setLangState(l);

  const toggleLang = () => setLangState((prev) => (prev === 'vn' ? 'en' : 'vn'));

  return <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
