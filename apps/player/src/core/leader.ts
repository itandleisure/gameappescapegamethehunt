import type { SupabaseClient } from '@supabase/supabase-js';
import { computeState, puzzleTasks, t, type GamePackage } from '@hunt/engine';
import { fromEventRow, type EventRow } from './supabase-backend.js';

/**
 * Spelleider-modus: een spelleider logt in met de spelleider-code van een hunt
 * en een eigen naam. Hij ziet geen spel, maar de teams en de andere
 * spelleiders op de kaart, de ranglijst met telefoonnummers en de teamchat.
 * Alles loopt via functies in de database; teams zien de spelleiders niet.
 */

/** Wie er op deze telefoon als spelleider is ingelogd. */
export interface LeaderLogin {
  sessionId: string;
  sessionName: string;
  name: string;
}

export interface LeaderTeam {
  id: string;
  name: string;
  track: number;
  score: number;
  caught: number;
  outcome: string | null;
  started_at: string | null;
  ended_at: string | null;
  login_order: number;
  phone: string | null;
  /** Speluitleg vóór een centrale start gelezen. */
  ready_at?: string | null;
}

export interface LeaderPosition {
  id: number;
  team_id: string;
  lat: number;
  lng: number;
  accuracy: number;
  recorded_at: string;
}

export interface Hunter {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  located_at: string | null;
  /** Deze telefoon. */
  me: boolean;
}

export interface LeaderData {
  session: { id: string; name: string; timezone: string; status: string; team_chat: boolean };
  game: GamePackage | null;
  teams: LeaderTeam[];
  /** Gebeurtenissen van alle teams (antwoorden enz.), om de puzzels uit te rekenen. */
  events?: (EventRow & { team_id: string })[];
  positions: LeaderPosition[];
  leaders: Hunter[];
}

export interface LeaderMessage {
  id: string;
  team_id: string | null;
  sender: 'team' | 'staff';
  sender_name: string | null;
  body: string;
  created_at: string;
  /** Alleen in de hunters-chat: eigen bericht. */
  own?: boolean;
}

/** Teamchat (alle teams en de hunters) of de onderlinge chat van de hunters. */
export type LeaderChannel = 'teams' | 'hunters';

export type LeaderErrorKey = 'leaderUnknownCode' | 'leaderFull' | 'leaderNameTaken' | 'leaderSignedOut' | 'errorNetwork' | 'errorGeneric';

export class LeaderError extends Error {
  constructor(
    readonly key: LeaderErrorKey,
    cause?: unknown,
  ) {
    super(key);
    this.name = 'LeaderError';
    (this as { cause?: unknown }).cause = cause;
  }
}

/** Databasefout → tekstsleutel voor het scherm. */
export function leaderError(error: { code?: string; message?: string } | null, signedIn = true): LeaderError {
  if (!error) return new LeaderError('errorGeneric');
  if (error.code === 'P0002') return new LeaderError(signedIn ? 'leaderSignedOut' : 'leaderUnknownCode', error);
  if (error.code === 'P0006') return new LeaderError('leaderFull', error);
  if (error.code === '23505') return new LeaderError('leaderNameTaken', error);
  if (error.message?.includes('Failed to fetch') || error.message?.includes('Network request failed')) {
    return new LeaderError('errorNetwork', error);
  }
  return new LeaderError('errorGeneric', error);
}

/** Kleuren voor de teams, goed te onderscheiden op de kaart (zelfde als in het beheer). */
export const TEAM_COLORS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0fa3b1',
  '#f032e6', '#9a6324', '#808000', '#000075', '#ff6f91', '#2a9d8f',
  '#bc6c25', '#6a4c93', '#d00000', '#1982c4',
];
export const HUNTER_COLOR = '#111111';
export const HUNTER_RING = '#dc2626';

/** Na zoveel tijd zonder positie toont de kaart iemand vervaagd. */
export const STALE_MS = 2 * 60_000;

/** Laatste bruikbare positie per team. */
export function lastPositions(positions: LeaderPosition[], maxAccuracy = 50): Map<string, LeaderPosition> {
  const out = new Map<string, LeaderPosition>();
  for (const p of positions) {
    if (p.accuracy > maxAccuracy) continue;
    const cur = out.get(p.team_id);
    if (!cur || Date.parse(p.recorded_at) >= Date.parse(cur.recorded_at)) out.set(p.team_id, p);
  }
  return out;
}

/** Nieuwe posities erbij, zonder dubbele; de oudste vallen weg zodat het geheugen niet volloopt. */
export function mergePositions(list: LeaderPosition[], fresh: LeaderPosition[], keep = 5_000): LeaderPosition[] {
  if (fresh.length === 0) return list;
  const seen = new Set(list.map((p) => p.id));
  const merged = [...list, ...fresh.filter((p) => !seen.has(p.id))];
  return merged.length > keep ? merged.slice(merged.length - keep) : merged;
}

/** Ranglijst: meeste punten eerst, bij gelijke stand wie het eerst inlogde. */
export function standings(teams: LeaderTeam[]): LeaderTeam[] {
  return [...teams].sort((a, b) => b.score - a.score || a.login_order - b.login_order);
}

export interface PuzzleProgress {
  /** De puzzels van het spel, in de volgorde van de codevakjes. */
  puzzles: { id: string; title: string }[];
  /** Per team de ids van de opgeloste puzzels. */
  solved: Map<string, Set<string>>;
}

/**
 * Welke puzzels elk team heeft opgelost, uitgerekend met de spelregel-engine
 * uit dezelfde gebeurtenissen als de app en de resultatenpagina in het beheer.
 */
export function puzzleProgress(data: LeaderData, now: number): PuzzleProgress {
  const game = data.game;
  if (!game) return { puzzles: [], solved: new Map() };
  const puzzles = puzzleTasks(game).map((task) => ({
    id: task.id,
    title: t(task.title, game.defaultLanguage) || task.id,
  }));
  const solved = new Map<string, Set<string>>();
  if (puzzles.length === 0) return { puzzles, solved };
  const byTeam = new Map<string, EventRow[]>();
  for (const row of data.events ?? []) {
    const list = byTeam.get(row.team_id) ?? [];
    list.push(row);
    byTeam.set(row.team_id, list);
  }
  for (const team of data.teams) {
    const startedAt = team.started_at ? Date.parse(team.started_at) : null;
    if (startedAt === null) {
      solved.set(team.id, new Set());
      continue;
    }
    const events = (byTeam.get(team.id) ?? []).map(fromEventRow).sort((a, b) => a.at - b.at);
    const until = team.ended_at ? Date.parse(team.ended_at) : now;
    try {
      const state = computeState(game, { track: team.track, startedAt, briefingRead: Boolean(team.ready_at) }, events, until);
      solved.set(team.id, new Set(puzzles.filter((p) => state.tasks[p.id]?.correct === true).map((p) => p.id)));
    } catch {
      solved.set(team.id, new Set());
    }
  }
  return { puzzles, solved };
}

/** Toegang tot de database voor de spelleider. */
export class LeaderApi {
  constructor(private readonly client: SupabaseClient) {}

  async ensureSignedIn() {
    const { data } = await this.client.auth.getSession();
    if (data.session) return;
    const { error } = await this.client.auth.signInAnonymously();
    if (error) throw leaderError(error);
  }

  async join(code: string, name: string): Promise<LeaderLogin> {
    await this.ensureSignedIn();
    const { data, error } = await this.client.rpc('leader_join', { p_code: code, p_name: name });
    if (error) throw leaderError(error, false);
    const row = data as { session_id: string; session_name: string; name: string };
    return { sessionId: row.session_id, sessionName: row.session_name, name: row.name };
  }

  async load(sessionId: string, afterPosition = 0): Promise<LeaderData> {
    const { data, error } = await this.client.rpc('leader_session', { p_session: sessionId, p_after_position: afterPosition });
    if (error) throw leaderError(error);
    return data as LeaderData;
  }

  async position(sessionId: string, fix: { lat: number; lng: number; accuracy: number }) {
    const { error } = await this.client.rpc('leader_position', {
      p_session: sessionId,
      p_lat: fix.lat,
      p_lng: fix.lng,
      p_accuracy: fix.accuracy,
    });
    if (error) throw leaderError(error);
  }

  async bumpCaught(sessionId: string, teamId: string, delta: 1 | -1): Promise<number> {
    const { data, error } = await this.client.rpc('leader_bump_caught', { p_session: sessionId, p_team: teamId, p_delta: delta });
    if (error) throw leaderError(error);
    return data as number;
  }

  async messages(sessionId: string, channel: LeaderChannel = 'teams'): Promise<LeaderMessage[]> {
    const fn = channel === 'hunters' ? 'leader_hunter_messages' : 'leader_messages';
    const { data, error } = await this.client.rpc(fn, { p_session: sessionId });
    if (error) throw leaderError(error);
    return data as LeaderMessage[];
  }

  async send(sessionId: string, body: string, channel: LeaderChannel = 'teams'): Promise<LeaderMessage> {
    const fn = channel === 'hunters' ? 'leader_send_hunter_message' : 'leader_send_message';
    const { data, error } = await this.client.rpc(fn, { p_session: sessionId, p_body: body });
    if (error) throw leaderError(error);
    return data as LeaderMessage;
  }

  async leave(sessionId: string) {
    const { error } = await this.client.rpc('leader_leave', { p_session: sessionId });
    if (error) throw leaderError(error);
  }
}
