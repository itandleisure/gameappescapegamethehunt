'use client';
import { useEffect, useState } from 'react';
import { tKey } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';
import { DEFAULT_COMPANY, type CompanySettings } from '@/lib/org-settings';
import { LOGO_TYPES, signedLogo, uploadLogo } from '@/lib/org-settings-store';
import { SaveBar } from '@/settings/SaveBar';
import { SettingsNav } from '@/settings/SettingsNav';
import { useSettingsForm } from '@/settings/useSettingsForm';

const FIELDS: { key: Exclude<keyof CompanySettings, 'logo_path'>; label: string; placeholder: string; help?: string }[] = [
  { key: 'name', label: tKey('Naam van het spel'), placeholder: DEFAULT_COMPANY.name, help: tKey('Op de voorkant en onderaan elke pagina van het fotoboek, en onder de e-mail aan de klant.') },
  { key: 'group', label: tKey('Naam van de groep met de andere spellen'), placeholder: DEFAULT_COMPANY.group, help: tKey('Zoals in "Meer spellen van Badass Games" op de laatste pagina van het fotoboek.') },
  { key: 'website', label: tKey('Website'), placeholder: 'escapegamethehunt.nl' },
  { key: 'email', label: tKey('E-mail'), placeholder: 'info@…' },
  { key: 'phone', label: tKey('Telefoon'), placeholder: '085 …' },
];

/** Instellingen › Bedrijf en logo. */
export default function CompanySettingsPage() {
  const { t } = useLanguage();
  const form = useSettingsForm();
  const { org, settings, change, canEdit, busy, run } = form;
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const logoPath = settings?.company.logo_path ?? null;

  useEffect(() => {
    void signedLogo(logoPath).then(setLogoUrl);
  }, [logoPath]);

  if (!org) return null;
  if (!settings) return form.error ? <p className="error">{form.error}</p> : <p className="muted">{t('Laden…')}</p>;

  const setCompany = (patch: Partial<CompanySettings>) => change((s) => ({ ...s, company: { ...s.company, ...patch } }));
  const upload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      form.setError(t('Kies een logo als PNG of JPG.'));
      return;
    }
    void run(t("Foto's uploaden…"), async () => setCompany({ logo_path: await uploadLogo(org.id, file) }));
  };

  return (
    <>
      <h1>{t('Bedrijf en logo')}</h1>
      <SettingsNav active="bedrijf" orgName={org.name} />

      <div className="card">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`company-${f.key}`}>{t(f.label)}</label>
            <input
              id={`company-${f.key}`}
              value={settings.company[f.key]}
              placeholder={f.placeholder}
              maxLength={f.key === 'phone' ? 40 : f.key === 'name' || f.key === 'group' ? 80 : 300}
              disabled={!canEdit}
              onChange={(e) => setCompany({ [f.key]: e.target.value })}
            />
            {f.help ? <p className="help">{t(f.help)}</p> : null}
          </div>
        ))}
      </div>

      <h2>{t('Logo')}</h2>
      <p className="muted small">
        {t('Een licht logo (wit of oranje) op een doorzichtige achtergrond, als PNG. Het staat op de voorkant en de laatste pagina van het fotoboek en op de klantpagina. Zonder eigen logo blijft het logo van The Hunt staan.')}
      </p>
      <div className="settings-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl ?? '/logo-full-light.png'} alt={settings.company.name} />
      </div>
      {canEdit ? (
        <div className="actions">
          <label className={`filebutton ${busy ? 'disabled' : ''}`}>
            {logoPath ? t('Ander logo') : t('Eigen logo kiezen')}
            <input type="file" accept="image/png,image/jpeg" disabled={!!busy} onChange={(e) => upload(e.target.files)} />
          </label>
          {logoPath ? (
            <button className="link" onClick={() => setCompany({ logo_path: null })}>
              {t('Terug naar het standaardlogo')}
            </button>
          ) : null}
        </div>
      ) : null}

      <SaveBar {...form} onSave={() => void form.save()} />
    </>
  );
}
