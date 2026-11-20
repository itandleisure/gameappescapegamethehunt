'use client';
import { isVideoPath, type GamePackage } from '@hunt/engine';
import { useEffect, useState } from 'react';
import type { PhotoRow } from '@/lib/results';
import { useLanguage } from '@/lib/language';
import { supabase } from '@/lib/supabase';
import { tx } from '@/lib/text';

/** Opdrachtsleutel van de teamfoto die een team bij het aanmelden maakt. */
export const TEAM_PHOTO = '_teamfoto';

/** Alle foto's van de sessie (teamfoto's en foto-opdrachten), nieuwste eerst, met team en opdracht. */
export function Photowall({
  photos,
  game,
  teamName,
  colors,
  timeZone,
}: {
  photos: PhotoRow[];
  game: GamePackage;
  teamName: (id: string) => string;
  colors: Map<string, string>;
  timeZone: string;
}) {
  const { t, locale } = useLanguage();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState<'all' | 'team' | 'task'>('all');

  const missing = photos.filter((p) => !urls[p.path]).map((p) => p.path);
  const missingKey = missing.join('|');

  useEffect(() => {
    if (!missingKey) return;
    void supabase()
      .storage.from('photos')
      .createSignedUrls(missingKey.split('|'), 60 * 60)
      .then(({ data, error: e }) => {
        if (e) {
          setError(e.message);
          return;
        }
        setUrls((u) => {
          const next = { ...u };
          for (const row of data ?? []) if (row.path && row.signedUrl) next[row.path] = row.signedUrl;
          return next;
        });
      });
  }, [missingKey]);

  const shown = [...photos]
    .filter((p) => (!filter || p.team_id === filter) && (kind === 'all' || (kind === 'team') === (p.task_key === TEAM_PHOTO)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const teamIds = [...new Set(photos.map((p) => p.team_id))];
  const time = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone, timeStyle: 'short' }).format(new Date(iso));

  return (
    <>
      <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
        <p className="muted" style={{ margin: 0 }}>
          {photos.length === 1 ? t('1 foto.') : t("{n} foto's.", { n: photos.length })}{' '}
          {t('Klik op een foto om hem groot te openen of te downloaden.')}
        </p>
        {photos.some((p) => p.task_key === TEAM_PHOTO) ? (
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} style={{ flex: '0 1 200px' }}>
            <option value="all">{t("Alle foto's")}</option>
            <option value="team">{t("Alleen teamfoto's")}</option>
            <option value="task">{t("Alleen opdrachtfoto's")}</option>
          </select>
        ) : null}
        {teamIds.length > 1 ? (
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ flex: '0 1 220px' }}>
            <option value="">{t('Alle teams')}</option>
            {teamIds.map((id) => (
              <option key={id} value={id}>
                {teamName(id)}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {photos.length === 0 ? <p className="muted">{t("Nog geen foto's.")}</p> : null}
      <div className="photowall">
        {shown.map((p) => (
          <figure key={p.id}>
            {urls[p.path] && isVideoPath(p.path) ? (
              <video src={urls[p.path]} controls preload="metadata" playsInline aria-label={t('Video van {team}', { team: teamName(p.team_id) })} />
            ) : urls[p.path] ? (
              <a href={urls[p.path]} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urls[p.path]} alt={t('Foto van {team}', { team: teamName(p.team_id) })} loading="lazy" />
              </a>
            ) : (
              <div className="placeholder muted">{t('Laden…')}</div>
            )}
            <figcaption>
              <span className="dot" style={{ background: colors.get(p.team_id) }} /> <strong>{teamName(p.team_id)}</strong>
              <div className="muted small">
                {p.task_key === TEAM_PHOTO ? t('Teamfoto') : tx(game.tasks.find((x) => x.id === p.task_key)?.title) || p.task_key} ·{' '}
                {time(p.created_at)}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
