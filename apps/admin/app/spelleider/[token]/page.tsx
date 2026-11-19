'use client';
import type { GamePackage } from '@hunt/engine';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tKey } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';
import { buildTrails, teamColor } from '@/lib/live-map';
import { buildResults } from '@/lib/results';
import { formatInZone } from '@/lib/sessions';
import type { SessionLive } from '@/lib/session-live';
import { supabase } from '@/lib/supabase';
import { Answers } from '@/results/Answers';
import { LiveMap } from '@/results/LiveMap';
import { Standings, type BumpCaught } from '@/results/Standings';
import { TeamChat, type ChatApi, type ChatRow } from '@/results/TeamChat';

const TABS = [
  { id: 'kaart', label: tKey('Kaart') },
  { id: 'ranglijst', label: tKey('Ranglijst') },
  { id: 'antwoorden', label: tKey('Antwoorden') },
  { id: 'chat', label: tKey('Teamchat') },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** Elke 10 seconden bijwerken; posities alleen de nieuwe. */
const REFRESH_MS = 10_000;

type LeaderData = Omit<SessionLive, 'photos' | 'game'> & { game: GamePackage | null };

/**
 * Live monitor en resultaten voor de spelleider, zonder account: een geheime
 * link per hunt (Live & resultaten → Spelleider-link). Alleen kijken en
 * "gepakt" bijhouden.
 */
export default function LeaderPage() {
  const { token } = useParams<{ token: string }>();
  const { t, lang, locale } = useLanguage();
  const [data, setData] = useState<LeaderData | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [tab, setTab] = useState<Tab>('kaart');
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef<LeaderData | null>(null);
  latest.current = data;

  const load = useCallback(async () => {
    const cur = latest.current;
    const after = cur ? cur.positions.reduce((m, p) => Math.max(m, p.id), 0) : 0;
    const { data: d, error: e } = await supabase().rpc('leader_session', { p_token: token, p_after_position: after });
    if (e) {
      if (e.code === 'P0002') setFailed(true);
      else setError(e.message);
      return;
    }
    const next = d as LeaderData;
    setData((prev) => ({ ...next, positions: prev && after ? [...prev.positions, ...next.positions] : next.positions }));
    setUpdatedAt(Date.now());
    setError(null);
  }, [token]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
      setNow(Date.now());
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as Tab;
    if (TABS.some((x) => x.id === fromHash)) setTab(fromHash);
  }, []);
  const choose = (next: Tab) => {
    setTab(next);
    window.history.replaceState(null, '', `#${next}`);
  };

  const colors = useMemo(() => new Map((data?.teams ?? []).map((x, i) => [x.id, teamColor(i)])), [data?.teams]);
  const view = useMemo(() => {
    if (!data?.game) return null;
    const trails = buildTrails(data.positions, { maxAccuracy: data.game.gps?.maxAccuracy ?? 30 });
    const teams = data.teams.map((x) => ({ ...x, distance_m: trails.get(x.id)?.distanceM ?? x.stored_distance_m ?? 0 }));
    return buildResults(data.game, teams, data.events, Math.max(now, updatedAt));
    // lang: resultaten bevatten teksten in de gekozen taal.
  }, [data, now, updatedAt, lang]);

  const chatApi = useMemo<ChatApi>(
    () => ({
      load: async () => {
        const { data: d, error: e } = await supabase().rpc('leader_messages', { p_token: token });
        return { rows: (d as ChatRow[] | null) ?? null, error: e?.message ?? null };
      },
      send: async (body) => {
        const { data: d, error: e } = await supabase().rpc('leader_send_message', { p_token: token, p_body: body });
        return { row: (d as ChatRow | null) ?? null, error: e?.message ?? null };
      },
    }),
    [token],
  );

  const bumpCaught: BumpCaught = async (teamId, delta) => {
    const { data: v, error: e } = await supabase().rpc('leader_bump_caught', { p_token: token, p_team: teamId, p_delta: delta });
    if (!e) void load();
    return { value: typeof v === 'number' ? v : null, error: e?.message ?? null };
  };

  if (failed) {
    return (
      <>
        <h1>{t('Link werkt niet')}</h1>
        <p className="muted">{t('Deze spelleider-link bestaat niet (meer). Vraag de organisator om een nieuwe link.')}</p>
      </>
    );
  }
  if (!data || !view || !data.game) return error ? <p className="error">{error}</p> : <p className="muted">{t('Laden…')}</p>;
  const { session } = data;
  const game = data.game;
  const liveData: SessionLive = { ...data, game, photos: [] };
  const startedAt = (teamId: string) => {
    const iso = data.teams.find((x) => x.id === teamId)?.started_at ?? null;
    return iso ? formatInZone(iso, session.timezone) : '–';
  };
  const playing = view.teams.filter((x) => x.playing).length;

  return (
    <>
      <h1 style={{ marginBottom: 4 }}>{session.name}</h1>
      <p className="muted">
        {t('Spelleider')} · {session.status === 'open' ? t('Open') : t('Dicht')} · {t('Code')} <strong>{session.join_code}</strong> ·{' '}
        {data.teams.length === 1 ? t('1 team') : t('{n} teams', { n: data.teams.length })}
        {playing ? `, ${t('{n} aan het spelen', { n: playing })}` : ''} · {t('bijgewerkt')}{' '}
        {new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(new Date(updatedAt))}
        {error ? <span className="error"> · {error}</span> : null}
      </p>
      <nav className="tabs">
        {TABS.map((x) => (
          <button key={x.id} className={tab === x.id ? 'active' : ''} onClick={() => choose(x.id)}>
            {t(x.label)}
          </button>
        ))}
      </nav>
      {tab === 'kaart' ? <LiveMap data={liveData} colors={colors} /> : null}
      {tab === 'ranglijst' ? <Standings view={view} colors={colors} startedAt={startedAt} phone={(teamId) => data.teams.find((x) => x.id === teamId)?.phone ?? null} bumpCaught={bumpCaught} /> : null}
      {tab === 'antwoorden' ? <Answers view={view} game={game} colors={colors} /> : null}
      {tab === 'chat' ? <TeamChat data={liveData} colors={colors} onChange={() => void load()} api={chatApi} /> : null}
    </>
  );
}
