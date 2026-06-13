import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { resources } from './locales';

export const LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
] as const;

export type LangCode = (typeof LANGUAGES)[number]['code'];

const STORAGE_KEY = 'stacklet-language';

/** Read the persisted language (default: English). Safe to call before render. */
export function getInitialLanguage(): LangCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some((l) => l.code === stored)) return stored as LangCode;
  } catch {
    // localStorage unavailable — fall through
  }
  return 'en';
}

/** Text direction for a language code. */
export function dirFor(code: string): 'ltr' | 'rtl' {
  return LANGUAGES.find((l) => l.code === code)?.dir ?? 'ltr';
}

/** Apply lang + dir to <html> (used before first paint and on every change). */
export function applyLanguageAttrs(code: string): void {
  const el = document.documentElement;
  el.lang = code;
  el.dir = dirFor(code);
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

interface LanguageApi {
  language: LangCode;
  setLanguage: (code: LangCode) => void;
}

const LanguageContext = createContext<LanguageApi | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LangCode>(getInitialLanguage);

  const setLanguage = useCallback((code: LangCode) => {
    setLanguageState(code);
    void i18n.changeLanguage(code);
    applyLanguageAttrs(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // ignore persistence failure
    }
  }, []);

  const api = useMemo<LanguageApi>(() => ({ language, setLanguage }), [language, setLanguage]);
  return <LanguageContext.Provider value={api}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageApi {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

export default i18n;
