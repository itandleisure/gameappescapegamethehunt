'use client';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LanguagePicker } from '../shell';
import {
  APP_PACKAGE,
  appSchemeUrl,
  appStoreUrl,
  eventPath,
  parseEventLink,
  playStoreUrl,
  type EventLink,
} from '@/lib/event-links';
import { useLanguage } from '@/lib/language';
import { supabase } from '@/lib/supabase';

interface LinkInfo {
  game_id: string;
  code: string;
  game_matches: boolean;
  name: Record<string, string> | string;
  default_language: string;
  status: 'draft' | 'open' | 'closed';
}

type Device = 'ios' | 'android' | 'other';

function detectDevice(): Device {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  // iPadOS meldt zich als Mac, maar heeft een touchscreen.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'other';
}

/**
 * Android: opent de app als die er is, en anders meteen Google Play.
 * (Chrome kent intent-links; andere browsers vallen terug op de gewone link.)
 */
function androidIntent(link: EventLink): string {
  const params = new URLSearchParams({ code: link.code, game: link.gameId });
  return `intent:///?${params.toString()}#Intent;scheme=thehunt;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(playStoreUrl())};end`;
}

/**
 * Spellink: /<game-ID>:<spelcode>. Op een telefoon met de app opent de app
 * zelf deze link (universal link / app link) en komt de speler hier niet.
 * Zonder app: uitleg, de spelcode en de knoppen naar de winkels.
 */
export default function EventLinkPage() {
  const { link: raw } = useParams<{ link: string }>();
  const { t, lang } = useLanguage();
  const router = useRouter();
  const parsed = parseEventLink(raw);
  const [info, setInfo] = useState<LinkInfo | null | 'missing'>(null);
  const [device, setDevice] = useState<Device>('other');

  useEffect(() => setDevice(detectDevice()), []);

  useEffect(() => {
    if (!parsed) return;
    let alive = true;
    void supabase()
      .rpc('event_link', { p_game: parsed.gameId, p_code: parsed.code })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) return setInfo('missing');
        const found = data as LinkInfo;
        setInfo(found);
        // Oud of verkeerd game-ID: netjes de juiste link in de adresbalk.
        if (!found.game_matches || found.code !== parsed.code) {
          router.replace(eventPath({ gameId: found.game_id, code: found.code }));
        }
      });
    return () => {
      alive = false;
    };
    // parsed is afgeleid van raw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  if (!parsed || !decodeSafe(raw).includes(':')) notFound();

  const link: EventLink = info && info !== 'missing' ? { gameId: info.game_id, code: info.code } : parsed;
  const name =
    info && info !== 'missing'
      ? typeof info.name === 'string'
        ? info.name
        : (info.name[lang] ?? info.name[info.default_language] ?? Object.values(info.name)[0] ?? '')
      : '';
  const appStore = appStoreUrl();
  const openApp = device === 'android' ? androidIntent(link) : appSchemeUrl(link);

  return (
    <div className="eventlink">
      <div className="eventlink-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full-dark.png" alt="Escape Game The Hunt" className="eventlink-logo only-light" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full-light.png" alt="Escape Game The Hunt" className="eventlink-logo only-dark" />
        <LanguagePicker />
      </div>

      {info === null ? <p className="muted">{t('Laden…')}</p> : null}

      {info === 'missing' ? (
        <div className="card">
          <h1>{t('Deze spellink klopt niet')}</h1>
          <p>{t('We vinden geen event met spelcode {code}. Controleer de link of vraag de organisatie om een nieuwe.', { code: parsed.code })}</p>
        </div>
      ) : null}

      {info && info !== 'missing' ? (
        <div className="card">
          {name ? <h1 style={{ marginTop: 0 }}>{name}</h1> : null}
          <p className="muted" style={{ marginBottom: 4 }}>
            {t('Jullie spelcode')}
          </p>
          <p className="eventlink-code">{link.code}</p>
          {info.status === 'closed' ? <p className="error">{t('Dit event is gesloten.')}</p> : null}
          {info.status === 'draft' ? (
            <p className="muted">{t('Dit event is nog niet geopend. Aanmelden kan zodra de spelleiding het event opent.')}</p>
          ) : null}

          <h2>{t('Zo doe je mee')}</h2>
          <ol className="eventlink-steps">
            <li>{t('Download de app Escape Game The Hunt.')}</li>
            <li>{t('Scan de QR-code daarna nog een keer, of tik opnieuw op deze link: de app opent met de spelcode al ingevuld.')}</li>
            <li>{t('Lukt dat niet? Open de app en vul de spelcode {code} in.', { code: link.code })}</li>
          </ol>

          <div className="eventlink-buttons">
            {device !== 'android' && appStore ? (
              <a className="button" href={appStore}>
                {t('Download in de App Store')}
              </a>
            ) : null}
            {device !== 'ios' ? (
              <a className="button" href={playStoreUrl()}>
                {t('Download op Google Play')}
              </a>
            ) : null}
            {device !== 'other' ? (
              <a className="button secondary" href={openApp}>
                {t('Ik heb de app al: open de app')}
              </a>
            ) : (
              <p className="small muted">{t('Open deze link op je telefoon, of scan de QR-code met de camera van je telefoon.')}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function decodeSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
