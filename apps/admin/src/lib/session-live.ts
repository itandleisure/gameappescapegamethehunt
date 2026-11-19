'use client';
// Gegevens van één sessie voor de live kaart en de resultaten, met live updates.
import type { GamePackage } from '@hunt/engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PositionRow } from './live-map';
import { t as tr } from './i18n';
import type { EventRow, PhotoRow, TeamRow } from './results';
import { supabase } from './supabase';

export interface SessionInfo {
  id: string;
  name: string;
  status: 'draft' | 'open' | 'closed';
  test_mode: boolean;
  starts_at: string | null;
  timezone: string;
  join_code: string;
  /** Teams kunnen elkaar berichten sturen. */
  team_chat: boolean;
  /** Zoveel spelleiders mogen tegelijk inloggen in de game-app. */
  max_leaders: number;
}

/** Spelleider die in de game-app is ingelogd, met zijn laatste positie. Teams zien deze niet. */
export interface LeaderRow {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  located_at: string | null;
  created_at: string;
}

const LEADER_COLUMNS = 'id, name, lat, lng, accuracy, located_at, created_at';

/** Ingelogde spelleiders. Leeg als de tabel er (nog) niet is. */
async function loadLeaders(sessionId: string): Promise<LeaderRow[]> {
  const { data, error } = await supabase().from('session_leaders').select(LEADER_COLUMNS).eq('session_id', sessionId).order('created_at');
  if (error || !data) return [];
  return data as LeaderRow[];
}

export interface LiveTeam extends TeamRow {
  login_order: number;
  /** Code waarmee een andere telefoon het team overneemt. */
  team_code: string;
  /** Telefoonnummer uit de aanmelding (tabel team_contacts), alleen voor de spelleiding. */
  phone?: string | null;
  /** Afstand die bij het opruimen (na 28 dagen) is vastgelegd; daarna zijn er geen posities meer. */
  stored_distance_m?: number | null;
}

/** Telefoonnummers per team. Leeg als de tabel er (nog) niet is of er geen toegang is. */
async function loadPhones(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase().from('team_contacts').select('team_id, phone').in('team_id', ids);
  if (error || !data) return new Map();
  return new Map((data as { team_id: string; phone: string }[]).map((r) => [r.team_id, r.phone]));
}

export interface SessionLive {
  session: SessionInfo;
  game: GamePackage;
  teams: LiveTeam[];
  events: EventRow[];
  positions: (PositionRow & { id: number })[];
  photos: PhotoRow[];
  leaders: LeaderRow[];
}

const PAGE = 1000;

/** Haalt alle rijen op, in blokken (Supabase geeft er standaard hooguit 1000 per keer). */
async function all<T>(fetch: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetch(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

function mergeById<T extends { id: string | number }>(list: T[], rows: T[]): T[] {
  if (rows.length === 0) return list;
  const seen = new Set(list.map((r) => r.id));
  const fresh = rows.filter((r) => !seen.has(r.id));
  return fresh.length ? [...list, ...fresh] : list;
}

const TEAM_COLUMNS = 'id, name, track, language, score, outcome, started_at, ended_at, login_order, team_code, caught, ready_at, stored_distance_m:distance_m';

export function useSessionLive(id: string) {
  const [data, setData] = useState<SessionLive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const latest = useRef<SessionLive | null>(null);
  latest.current = data;

  const load = useCallback(async () => {
    const db = supabase();
    try {
      const s = await db
        .from('sessions')
        .select('id, name, status, test_mode, starts_at, timezone, join_code, team_chat, max_leaders, game_versions(package)')
        .eq('id', id)
        .single();
      if (s.error) throw new Error(s.error.message);
      const row = s.data as unknown as SessionInfo & { game_versions: { package: GamePackage } | null };
      if (!row.game_versions) throw new Error(tr('Het spel van dit ticket is niet gevonden.'));
      const t = await db.from('teams').select(TEAM_COLUMNS).eq('session_id', id).order('login_order');
      if (t.error) throw new Error(t.error.message);
      const ids = (t.data as LiveTeam[]).map((x) => x.id);
      const phones = await loadPhones(ids);
      const teams = (t.data as LiveTeam[]).map((x) => ({ ...x, phone: phones.get(x.id) ?? null }));
      const leaders = await loadLeaders(id);
      const [events, positions, photos] = ids.length
        ? await Promise.all([
            all<EventRow>((a, b) =>
              db.from('events').select('id, team_id, type, task_key, payload, client_time').in('team_id', ids).order('client_time').order('id').range(a, b),
            ),
            all<PositionRow & { id: number }>((a, b) =>
              db.from('positions').select('id, team_id, lat, lng, accuracy, recorded_at').in('team_id', ids).order('id').range(a, b),
            ),
            all<PhotoRow>((a, b) =>
              db.from('photos').select('id, team_id, task_key, path, created_at').in('team_id', ids).order('created_at').range(a, b),
            ),
          ])
        : [[], [], []];
      const { game_versions, ...session } = row;
      setData({ session, game: game_versions.package, teams, events, positions, photos, leaders });
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const teamKey = data?.teams.map((x) => x.id).join(',') ?? '';

  // Spelleiders in de game-app: live, met elke 15 seconden een vangnet.
  useEffect(() => {
    const db = supabase();
    const refresh = () => {
      if (document.hidden) return;
      void loadLeaders(id).then((leaders) => setData((d) => (d ? { ...d, leaders } : d)));
    };
    const channel = db
      .channel(`spelleiders-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_leaders', filter: `session_id=eq.${id}` }, refresh)
      .subscribe();
    const timer = setInterval(refresh, 15_000);
    return () => {
      clearInterval(timer);
      void db.removeChannel(channel);
    };
  }, [id]);

  // Live: nieuwe posities, antwoorden en foto's komen direct binnen.
  useEffect(() => {
    if (!teamKey) return;
    const db = supabase();
    const filter = `team_id=in.(${teamKey})`;
    const add = <K extends 'events' | 'positions' | 'photos'>(key: K, row: SessionLive[K][number]) => {
      setData((d) => (d ? { ...d, [key]: mergeById(d[key] as { id: string | number }[], [row as { id: string | number }]) } : d));
      setUpdatedAt(Date.now());
    };
    const channel = db
      .channel(`sessie-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'positions', filter }, (p) => add('positions', p.new as never))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter }, (p) => add('events', p.new as never))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos', filter }, (p) => add('photos', p.new as never))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `session_id=eq.${id}` }, (p) => {
        const row = p.new as LiveTeam | undefined;
        if (p.eventType === 'UPDATE' && row?.id) {
          setData((d) => (d ? { ...d, teams: d.teams.map((x) => (x.id === row.id ? { ...x, ...row, phone: x.phone } : x)) } : d));
        } else {
          void load(); // nieuw of verwijderd team: alles opnieuw, met de nieuwe filter
        }
      })
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [id, teamKey, load]);

  // Vangnet als de live verbinding even wegvalt: elke 20 seconden bijwerken.
  useEffect(() => {
    const timer = setInterval(() => {
      const d = latest.current;
      if (!d || d.teams.length === 0 || document.hidden) return;
      const ids = d.teams.map((x) => x.id);
      const lastPos = d.positions.reduce((m, p) => Math.max(m, p.id), 0);
      const db = supabase();
      void Promise.all([
        db.from('positions').select('id, team_id, lat, lng, accuracy, recorded_at').in('team_id', ids).gt('id', lastPos).order('id').limit(PAGE),
        db.from('events').select('id, team_id, type, task_key, payload, client_time').in('team_id', ids).gte('server_time', new Date(Date.now() - 120_000).toISOString()).limit(PAGE),
        db.from('photos').select('id, team_id, task_key, path, created_at').in('team_id', ids).gte('created_at', new Date(Date.now() - 120_000).toISOString()),
        db.from('teams').select(TEAM_COLUMNS).eq('session_id', id),
      ]).then(([p, e, f, t]) => {
        setData((cur) => {
          if (!cur) return cur;
          const teams = (t.data as LiveTeam[] | null) ?? cur.teams;
          if (teams.length !== cur.teams.length) {
            void load();
            return cur;
          }
          return {
            ...cur,
            teams: cur.teams.map((x) => {
              const n = teams.find((y) => y.id === x.id);
              return n ? { ...n, phone: x.phone } : x;
            }),
            positions: mergeById(cur.positions, (p.data as SessionLive['positions'] | null) ?? []),
            events: mergeById(cur.events, (e.data as EventRow[] | null) ?? []),
            photos: mergeById(cur.photos, (f.data as PhotoRow[] | null) ?? []),
          };
        });
        setUpdatedAt(Date.now());
      });
    }, 20_000);
    return () => clearInterval(timer);
  }, [id, load]);

  return { data, error, updatedAt, reload: load };
}
