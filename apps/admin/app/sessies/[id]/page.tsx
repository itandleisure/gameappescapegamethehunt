'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { buildTrails, teamColor } from '@/lib/live-map';
import { buildResults, resultsToCsv } from '@/lib/results';
import { formatInZone, STATUS_LABEL } from '@/lib/sessions';
import { useSessionLive } from '@/lib/session-live';
import { Answers } from '@/results/Answers';
import { LiveMap } from '@/results/LiveMap';
import { Photowall } from '@/results/Photowall';
import { Standings } from '@/results/Standings';

const TABS = [
  { id: 'kaart', label: 'Kaart' },
  { id: 'ranglijst', label: 'Ranglijst' },
  { id: 'antwoorden', label: 'Antwoorden' },
  { id: 'fotos', label: 'Fotomuur' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function SessionLivePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, updatedAt, reload } = useSessionLive(id);
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
    const teams = data.teams.map((t) => ({ ...t, distance_m: trails.get(t.id)?.distanceM ?? 0 }));
    return buildResults(data.game, teams, data.events, Math.max(now, updatedAt));
  }, [data, now, updatedAt]);

  if (error && !data) return <ul className="errors"><li>{error}</li></ul>;
  if (!data || !view) return <p className="muted">Laden…</p>;
  const { session } = data;

  const download = () => {
    const blob = new Blob([resultsToCsv(view)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `resultaten-${session.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const teamName = (teamId: string) => data.teams.find((t) => t.id === teamId)?.name ?? 'Onbekend team';
  const phone = (teamId: string) => data.teams.find((t) => t.id === teamId)?.phone ?? null;
  const startedAt = (teamId: string) => {
    const iso = data.teams.find((t) => t.id === teamId)?.started_at ?? null;
    return iso ? formatInZone(iso, session.timezone) : '–';
  };
  const playing = view.teams.filter((t) => t.playing).length;

  return (
    <>
      <p className="muted">
        <Link href="/sessies">Sessies</Link> › {session.name}
      </p>
      <div className="row" style={{ alignItems: 'center' }}>
        <h1 style={{ margin: 0, flex: '1 1 auto' }}>{session.name}</h1>
        <div className="actions" style={{ marginTop: 0, flex: '0 0 auto' }}>
          <button className="secondary" onClick={() => void reload()}>
            Vernieuwen
          </button>
          <button className="secondary" onClick={download} disabled={view.teams.length === 0}>
            Excel-export
          </button>
        </div>
      </div>
      <p className="muted">
        <span className={`badge ${session.status === 'open' ? 'open' : ''}`}>{STATUS_LABEL[session.status]}</span>{' '}
        {session.test_mode ? <span className="badge test">Test</span> : null} Code <strong>{session.join_code}</strong> ·{' '}
        {data.teams.length} team{data.teams.length === 1 ? '' : 's'}
        {playing ? `, ${playing} aan het spelen` : ''} · bijgewerkt{' '}
        {new Intl.DateTimeFormat('nl-NL', { timeStyle: 'medium' }).format(new Date(updatedAt))}
        {error ? <span className="error"> · {error}</span> : null}
      </p>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => choose(t.id)}>
            {t.label}
            {t.id === 'fotos' && data.photos.length ? ` (${data.photos.length})` : ''}
          </button>
        ))}
      </nav>

      {tab === 'kaart' ? <LiveMap data={data} colors={colors} /> : null}
      {tab === 'ranglijst' ? <Standings view={view} colors={colors} startedAt={startedAt} phone={phone} /> : null}
      {tab === 'antwoorden' ? <Answers view={view} game={data.game} colors={colors} /> : null}
      {tab === 'fotos' ? (
        <Photowall photos={data.photos} game={data.game} teamName={teamName} colors={colors} timeZone={session.timezone} />
      ) : null}
    </>
  );
}
