'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { tKey } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';
import { buildTrails, teamColor } from '@/lib/live-map';
import { buildResults, resultsToCsv } from '@/lib/results';
import { formatInZone } from '@/lib/sessions';
import { useSessionLive } from '@/lib/session-live';
import { Answers } from '@/results/Answers';
import { LiveMap } from '@/results/LiveMap';
import { DeleteSession } from '@/results/DeleteSession';
import { OpenToggle } from '@/results/OpenToggle';
import { PhotobookEditor } from '@/results/PhotobookEditor';
import { Photowall } from '@/results/Photowall';
import { Standings } from '@/results/Standings';
import { TeamChat } from '@/results/TeamChat';

const TABS = [
  { id: 'kaart', label: tKey('Kaart') },
  { id: 'ranglijst', label: tKey('Ranglijst') },
  { id: 'antwoorden', label: tKey('Antwoorden') },
  { id: 'fotos', label: tKey('Fotomuur') },
  { id: 'fotoboek', label: tKey('Fotoboek') },
  { id: 'chat', label: tKey('Teamchat') },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function SessionLivePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, updatedAt, reload } = useSessionLive(id);
  const { t, lang, locale } = useLanguage();
  const [tab, setTab] = useState<Tab>('kaart');
  const [now, setNow] = useState(() => Date.now());

  // Tabblad onthouden in de adresbalk, zodat verversen op dezelfde plek blijft.
  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as Tab;
    if (TABS.some((t) => t.id === fromHash)) setTab(fromHash);
  }, []);
  const choose = (next: Tab) => {
    setTab(next);
    window.history.replaceState(null, '', `#${next}`);
  };

  // Speeltijd van lopende teams bijwerken.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const colors = useMemo(() => new Map((data?.teams ?? []).map((t, i) => [t.id, teamColor(i)])), [data?.teams]);

  const view = useMemo(() => {
    if (!data) return null;
    const trails = buildTrails(data.positions, { maxAccuracy: data.game.gps?.maxAccuracy ?? 30 });
    const teams = data.teams.map((t) => ({ ...t, distance_m: trails.get(t.id)?.distanceM ?? t.stored_distance_m ?? 0 }));
    return buildResults(data.game, teams, data.events, Math.max(now, updatedAt));
    // lang: resultaten bevatten teksten in de gekozen taal.
  }, [data, now, updatedAt, lang]);

  if (error && !data) return <ul className="errors"><li>{error}</li></ul>;
  if (!data || !view) return <p className="muted">{t('Laden…')}</p>;
  const { session } = data;

  const download = () => {
    const blob = new Blob([resultsToCsv(view)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t('resultaten')}-${session.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const teamName = (teamId: string) => data.teams.find((t) => t.id === teamId)?.name ?? t('Onbekend team');
  const phone = (teamId: string) => data.teams.find((t) => t.id === teamId)?.phone ?? null;
  const startedAt = (teamId: string) => {
    const iso = data.teams.find((t) => t.id === teamId)?.started_at ?? null;
    return iso ? formatInZone(iso, session.timezone) : '–';
  };
  const playing = view.teams.filter((t) => t.playing).length;

  return (
    <>
      <p className="muted">
        <Link href="/sessies">{t('Hunts')}</Link> › {session.name}
      </p>
      <div className="row" style={{ alignItems: 'center' }}>
        <h1 style={{ margin: 0, flex: '1 1 auto' }}>{session.name}</h1>
        <div className="actions" style={{ marginTop: 0, flex: '0 0 auto' }}>
          <button className="secondary" onClick={() => void reload()}>
            {t('Vernieuwen')}
          </button>
          <button className="secondary" onClick={download} disabled={view.teams.length === 0}>
            {t('Excel-export')}
          </button>
          <DeleteSession id={session.id} name={session.name} photoPaths={data.photos.map((p) => p.path)} />
        </div>
      </div>
      <p className="muted">
        <OpenToggle id={session.id} status={session.status} onChange={() => void reload()} />{' '}
        {session.test_mode ? <span className="badge test">{t('Test')}</span> : null} {t('Code')} <strong>{session.join_code}</strong> ·{' '}
        {data.teams.length === 1 ? t('1 team') : t('{n} teams', { n: data.teams.length })}
        {playing ? `, ${t('{n} aan het spelen', { n: playing })}` : ''} · {t('bijgewerkt')}{' '}
        {new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(new Date(updatedAt))}
        {error ? <span className="error"> · {error}</span> : null}
      </p>

      <nav className="tabs">
        {TABS.map((x) => (
          <button key={x.id} className={tab === x.id ? 'active' : ''} onClick={() => choose(x.id)}>
            {t(x.label)}
            {x.id === 'fotos' && data.photos.length ? ` (${data.photos.length})` : ''}
          </button>
        ))}
      </nav>

      {tab === 'kaart' ? <LiveMap data={data} colors={colors} /> : null}
      {tab === 'ranglijst' ? <Standings view={view} colors={colors} startedAt={startedAt} phone={phone} /> : null}
      {tab === 'antwoorden' ? <Answers view={view} game={data.game} colors={colors} /> : null}
      {tab === 'fotos' ? (
        <Photowall photos={data.photos} game={data.game} teamName={teamName} colors={colors} timeZone={session.timezone} />
      ) : null}
      {tab === 'fotoboek' ? <PhotobookEditor data={data} view={view} /> : null}
      {tab === 'chat' ? <TeamChat data={data} colors={colors} onChange={() => void reload()} /> : null}
    </>
  );
}
