import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { COUNTRIES, type Country, type Lang } from './countries';
import { DICT } from './dict';

const STORAGE_KEY = 'cx-country';

interface LocaleValue {
  country: Country | null;
  lang: Lang;
  /** Translate an English string; unknown strings fall back to English. `{name}` placeholders are filled from `vars`. */
  t: (en: string, vars?: Record<string, string | number>) => string;
  chooseCountry: (code: string) => void;
  /** Back to the country gateway. */
  resetCountry: () => void;
}

const LocaleContext = createContext<LocaleValue | null>(null);

function readStored(): Country | null {
  try {
    const code = localStorage.getItem(STORAGE_KEY);
    return COUNTRIES.find((c) => c.code === code && c.lang) ?? null;
  } catch {
    return null;
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [country, setCountry] = useState<Country | null>(readStored);
  const lang: Lang = country?.lang ?? 'en';

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const chooseCountry = useCallback((code: string) => {
    const next = COUNTRIES.find((c) => c.code === code && c.lang);
    if (!next) return;
    try {
      localStorage.setItem(STORAGE_KEY, next.code);
    } catch {
      /* private mode — the choice just lasts for this visit */
    }
    setCountry(next);
  }, []);

  const resetCountry = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setCountry(null);
  }, []);

  const t = useCallback(
    (en: string, vars?: Record<string, string | number>) => {
      const out = (lang !== 'en' && DICT[lang]?.[en]) || en;
      return vars ? out.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : out;
    },
    [lang],
  );

  const value = useMemo(() => ({ country, lang, t, chooseCountry, resetCountry }), [country, lang, t, chooseCountry, resetCountry]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>');
  return ctx;
}
