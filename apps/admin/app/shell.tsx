'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ADMIN_LANGUAGES, ADMIN_LANGUAGE_NAMES, isAdminLanguage, tKey } from '@/lib/i18n';
import { LanguageProvider, useLanguage, useT } from '@/lib/language';
import { supabase } from '@/lib/supabase';

const NAV = [
  { href: '/sessies', label: tKey('Hunts') },
  { href: '/spellen', label: tKey('Spellen') },
];

/** Taalkeuze van de beheerapp; wordt per gebruiker onthouden. */
export function LanguagePicker() {
  const { lang, setLang } = useLanguage();
  const t = useT();
  return (
    <select
      className="langpick"
      aria-label={t('Taal')}
      title={t('Taal')}
      value={lang}
      onChange={(e) => {
        if (isAdminLanguage(e.target.value)) setLang(e.target.value);
      }}
    >
      {ADMIN_LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {ADMIN_LANGUAGE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}

function Header() {
  const { user, org } = useAuth();
  const path = usePathname();
  const t = useT();
  if (!user || !org) return null;
  return (
    <header className="top">
      <span className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-dark.png" alt="" className="logo only-light" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.png" alt="" className="logo only-dark" />
        Escape Game The Hunt
      </span>
      <nav>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? 'active' : ''}>
            {t(n.label)}
          </Link>
        ))}
      </nav>
      <span className="who">
        {org.name} · {user.email}
        <LanguagePicker />
        <button className="link" onClick={() => void supabase().auth.signOut()}>
          {t('Uitloggen')}
        </button>
      </span>
    </header>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  const t = useT();
  if (loading) return <main className="muted">{t('Laden…')}</main>;
  return <main>{children}</main>;
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Header />
        <Gate>{children}</Gate>
      </AuthProvider>
    </LanguageProvider>
  );
}
