'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import {
  isAdminLanguage,
  LOCALES,
  pickAdminLanguage,
  setCurrentLanguage,
  translate,
  type AdminLanguage,
  type Vars,
} from './i18n';

const STORAGE_KEY = 'hunt-admin-language';

interface LanguageState {
  lang: AdminLanguage;
  locale: string;
  setLang: (lang: AdminLanguage) => void;
  t: (nl: string, vars?: Vars) => string;
}

const LanguageContext = createContext<LanguageState>({
  lang: 'nl',
  locale: LOCALES.nl,
  setLang: () => {},
  t: (nl, vars) => translate('nl', nl, vars),
});

function readStored(): AdminLanguage | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isAdminLanguage(v) ? v : null;
  } catch {
    return null;
  }
}

function store(lang: AdminLanguage) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // geen opslag beschikbaar: dan alleen voor deze keer
  }
}

/**
 * Taal van de beheerapp. De keuze wordt per gebruiker bewaard in het account
 * (zodat hij op elk apparaat terugkomt) en in de browser (zodat het
 * inlogscherm ook al in de goede taal staat).
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AdminLanguage>('nl');

  const apply = useCallback((next: AdminLanguage) => {
    setCurrentLanguage(next);
    setLangState(next);
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    apply(readStored() ?? pickAdminLanguage(navigator.languages ?? [navigator.language]));
    const fromUser = (meta: unknown) => {
      const v = (meta as { admin_language?: unknown } | undefined)?.admin_language;
      if (isAdminLanguage(v)) {
        store(v);
        apply(v);
      }
    };
    void supabase()
      .auth.getSession()
      .then(({ data }) => fromUser(data.session?.user.user_metadata));
    const { data } = supabase().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') fromUser(session?.user.user_metadata);
    });
    return () => data.subscription.unsubscribe();
  }, [apply]);

  const setLang = useCallback(
    (next: AdminLanguage) => {
      store(next);
      apply(next);
      void supabase()
        .auth.getSession()
        .then(({ data }) => {
          const user = data.session?.user;
          if (user && !user.is_anonymous) void supabase().auth.updateUser({ data: { admin_language: next } });
        });
    },
    [apply],
  );

  const value = useMemo<LanguageState>(
    () => ({ lang, locale: LOCALES[lang], setLang, t: (nl, vars) => translate(lang, nl, vars) }),
    [lang, setLang],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);

/** Vertaalfunctie voor de huidige taal; het component wisselt direct mee bij een andere taal. */
export const useT = () => useContext(LanguageContext).t;
