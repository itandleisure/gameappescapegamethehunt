'use client';
import Link from 'next/link';
import { tKey } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';

export type SettingsPage = 'overzicht' | 'bedrijf' | 'tickets' | 'spellen' | 'fotoboek' | 'webshop';

export const SETTINGS_PAGES: { key: SettingsPage; href: string; label: string; text: string }[] = [
  {
    key: 'bedrijf',
    href: '/instellingen/bedrijf',
    label: tKey('Bedrijf en logo'),
    text: tKey('Naam, logo, website, e-mail en telefoon. Komen in het fotoboek, op de klantpagina en in de e-mail aan de klant.'),
  },
  {
    key: 'tickets',
    href: '/instellingen/tickets',
    label: tKey('Nieuwe tickets'),
    text: tKey('Wat er bij een nieuw ticket al ingevuld staat: tijdzone, aantal tracks, teamchat en testmodus.'),
  },
  {
    key: 'spellen',
    href: '/instellingen/spellen',
    label: tKey('Spellen en landen'),
    text: tKey('GPS, verzamelpunt, kaartstijl en speelveld voor alle spellen, en per land de taal en tijdzone.'),
  },
  {
    key: 'fotoboek',
    href: '/instellingen/fotoboek',
    label: tKey('Fotoboek'),
    text: tKey("Vaste foto's, links, de andere spellen, eigen teksten en hoe lang de klant het fotoboek kan bekijken."),
  },
  {
    key: 'webshop',
    href: '/instellingen/webshop',
    label: tKey('Webshop'),
    text: tKey('De sleutel waarmee de webshop zelf tickets aanmaakt, met het aantal gekochte teams.'),
  },
];

/** Knoppen tussen de instellingen, met de uitleg dat ze voor alles gelden. */
export function SettingsNav({ active, orgName }: { active: SettingsPage; orgName: string }) {
  const { t } = useLanguage();
  return (
    <>
      <p className="muted">
        <Link href="/instellingen">{t('Instellingen')}</Link>
        {active !== 'overzicht' ? ` › ${t(SETTINGS_PAGES.find((p) => p.key === active)?.label ?? '')}` : null}
      </p>
      <nav className="actions settings-nav" aria-label={t('Instellingen')}>
        {SETTINGS_PAGES.map((p) => (
          <Link key={p.key} href={p.href} className={`button ${p.key === active ? '' : 'secondary'}`} aria-current={p.key === active ? 'page' : undefined}>
            {t(p.label)}
          </Link>
        ))}
      </nav>
      <p className="global-note">
        {t('Algemene instellingen: ze gelden voor alles van {org}, dus voor alle spellen, steden, tickets en fotoboeken.', { org: orgName })}
      </p>
    </>
  );
}
