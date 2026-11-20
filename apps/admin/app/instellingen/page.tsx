'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/language';
import { SETTINGS_PAGES, SettingsNav } from '@/settings/SettingsNav';

/** Menu Instellingen: overzicht van de algemene instellingen. */
export default function SettingsPage() {
  const { org } = useAuth();
  const { t } = useLanguage();
  if (!org) return null;
  return (
    <>
      <h1>{t('Instellingen')}</h1>
      <SettingsNav active="overzicht" orgName={org.name} />
      <div className="settings-grid">
        {SETTINGS_PAGES.map((p) => (
          <Link key={p.key} href={p.href} className="card">
            <h2>{t(p.label)}</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {t(p.text)}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
