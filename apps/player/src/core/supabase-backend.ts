import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameEvent, GamePackage, GpsFix } from '@hunt/engine';
import type { Backend, ChatMessage, LoadedGame, PendingPhoto, SessionInfo, TeamRecord, TeamSignals } from './types.js';

/** Fout met een tekstsleutel uit i18n, zodat het scherm een nette melding toont. */
/** Extensie in de bucket photos: jpg voor foto's, mp4 of mov voor video's (zie isVideoPath in de engine). */
export function mediaExtension(photo: Pick<PendingPhoto, 'contentType'>): 'jpg' | 'mp4' | 'mov' {
  return photo.contentType === 'video/quicktime' ? 'mov' : photo.contentType === 'video/mp4' ? 'mp4' : 'jpg';
}

export class BackendError extends Error {
  constructor(
    readonly key: 'errorUnknownSession' | 'errorLocked' | 'errorFull' | 'errorUnknownTeam' | 'errorAmbiguousTeam' | 'errorTeamNameTaken' | 'errorLanguage' | 'errorPhone' | 'errorNetwork' | 'errorGeneric',
    cause?: unknown,
  ) {
    super(key);
    this.name = 'BackendError';
    (this as { cause?: unknown }).cause = cause;
  }
}

interface TeamRow {
  id: string;
  session_id: string;
  name: string;
  language: string;
  track: number;
  team_code: string;
  started_at: string | null;
  ended_at: string | null;
  ready_at?: string | null;
}

export interface EventRow {
  id: string;
  type: string;
  task_key: string | null;
  payload: Record<string, unknown>;
  client_time: string;
}

interface MessageRow {
  id: string;
  team_id: string | null;
  sender_name: string | null;
  body: string;
  created_at: string;
  photo_path?: string | null;
}

/** Zoveel berichten van de teamchat haalt de app hooguit op. */
export const CHAT_LIMIT = 200;

export function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.sender_name,
    body: row.body,
    createdAt: Date.parse(row.created_at),
    ...(row.photo_path ? { photoPath: row.photo_path } : {}),
  };
}

const ms = (iso: string | null) => (iso === null ? null : Date.parse(iso));

export function toTeam(row: TeamRow): TeamRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    language: row.language,
    track: row.track,
    teamCode: row.team_code,
    startedAt: ms(row.started_at),
    endedAt: ms(row.ended_at),
    readyAt: ms(row.ready_at ?? null),
  };
}

/** Gebeurtenis → rij in de tabel events. */
export function toEventRow(teamId: string, event: GameEvent) {
  const { id, at, type, ...rest } = event as GameEvent & Record<string, unknown>;
  const { task, ...payload } = rest as { task?: string } & Record<string, unknown>;
  return {
    id,
    team_id: teamId,
    type,
    task_key: task ?? null,
    payload,
    client_time: new Date(at).toISOString(),
  };
}

/** Rij uit de tabel events → gebeurtenis. */
export function fromEventRow(row: EventRow): GameEvent {
  return {
    ...row.payload,
    id: row.id,
    at: Date.parse(row.client_time),
    type: row.type,
    ...(row.task_key === null ? {} : { task: row.task_key }),
  } as GameEvent;
}

function translate(error: { code?: string; message?: string } | null, fallback: BackendError['key'] = 'errorGeneric') {
  if (!error) return new BackendError(fallback);
  if (error.code === 'P0003') return new BackendError('errorLocked', error);
  if (error.code === 'P0007') return new BackendError('errorFull', error);
  if (error.code === 'P0005') return new BackendError('errorAmbiguousTeam', error);
  if (error.code === '23505') return new BackendError('errorTeamNameTaken', error);
  if (error.code === 'P0002') return new BackendError(fallback === 'errorUnknownTeam' ? 'errorUnknownTeam' : 'errorUnknownSession', error);
  if (error.code === '22023' && error.message?.includes('telefoon')) return new BackendError('errorPhone', error);
  if (error.code === '22023') return new BackendError('errorLanguage', error);
  if (error.message?.includes('Failed to fetch') || error.message?.includes('Network request failed')) {
    return new BackendError('errorNetwork', error);
  }
  return new BackendError('errorGeneric', error);
}

/**
 * Backend op Supabase. Spelers loggen anoniem in; de toegangsregels in de
 * database zorgen dat een team alleen bij zijn eigen gegevens kan.
 */
export class SupabaseBackend implements Backend {
  constructor(
    private readonly client: SupabaseClient,
    /** Leest een lokaal fotobestand als bytes (in de app via expo-file-system). */
    private readonly readFile: (uri: string) => Promise<ArrayBuffer>,
  ) {}

  async ensureSignedIn() {
    const { data } = await this.client.auth.getSession();
    if (data.session) return;
    const { error } = await this.client.auth.signInAnonymously();
    if (error) throw translate(error, 'errorNetwork');
  }

  async joinSession(joinCode: string, teamName: string, language: string, phone: string) {
    const { data, error } = await this.client.rpc('join_session', {
      p_join_code: joinCode,
      p_team_name: teamName,
      p_language: language,
      p_phone: phone,
    });
    if (error) throw translate(error, 'errorUnknownSession');
    return toTeam(data as TeamRow);
  }

  async rejoinTeam(teamName: string, joinCode = '') {
    // Zonder hunt-code zoekt de database in de hunts die nu lopen.
    const { data, error } = await this.client.rpc('rejoin_team_by_name', { p_join_code: joinCode, p_team_name: teamName });
    if (error) throw translate(error, 'errorUnknownTeam');
    return toTeam(data as TeamRow);
  }

  async startTeam(teamId: string) {
    const { data, error } = await this.client.rpc('start_team', { p_team: teamId });
    if (error) throw translate(error);
    return toTeam(data as TeamRow);
  }

  async loadTeam(teamId: string) {
    const { data, error } = await this.client.from('teams').select('*').eq('id', teamId).single();
    if (error) throw translate(error);
    return toTeam(data as TeamRow);
  }

  async loadGame(team: TeamRecord): Promise<LoadedGame> {
    const { data, error } = await this.client
      .from('sessions')
      .select('id, name, timezone, status, test_mode, team_chat, join_code, game_version_id, game_versions(package)')
      .eq('id', team.sessionId)
      .single();
    if (error || !data) throw translate(error);
    const row = data as unknown as {
      id: string;
      name: string;
      timezone: string;
      status: SessionInfo['status'];
      test_mode: boolean;
      team_chat?: boolean;
      join_code?: string;
      game_version_id: string;
      game_versions: { package: GamePackage } | null;
    };
    if (!row.game_versions) throw new BackendError('errorGeneric');
    return {
      session: { id: row.id, name: row.name, timezone: row.timezone, status: row.status, testMode: row.test_mode, teamChat: row.team_chat ?? false, joinCode: row.join_code },
      game: row.game_versions.package,
      versionId: row.game_version_id,
    };
  }

  async loadEvents(teamId: string) {
    const { data, error } = await this.client
      .from('events')
      .select('id, type, task_key, payload, client_time')
      .eq('team_id', teamId)
      .order('client_time');
    if (error) throw translate(error, 'errorNetwork');
    return (data as EventRow[]).map(fromEventRow);
  }

  async sendEvents(teamId: string, events: GameEvent[]) {
    if (events.length === 0) return;
    const { error } = await this.client
      .from('events')
      .upsert(events.map((e) => toEventRow(teamId, e)), { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw translate(error, 'errorNetwork');
  }

  async recordPositions(teamId: string, fixes: GpsFix[]) {
    const { error } = await this.client.rpc('record_positions', { p_team: teamId, p_fixes: fixes });
    if (error) throw translate(error, 'errorNetwork');
  }

  async teamSignals(teamId: string, since: number): Promise<TeamSignals> {
    const { data, error } = await this.client.rpc('team_signals', { p_team: teamId, p_since: since });
    if (error) throw translate(error, 'errorNetwork');
    const raw = (data ?? {}) as { hunter_near?: boolean; caught?: { id: string; team_id: string; team_name: string; points: number | string; at: number | string }[] };
    return {
      hunterNear: raw.hunter_near === true,
      caught: (raw.caught ?? []).map((c) => ({ id: c.id, teamId: c.team_id, teamName: c.team_name, points: Number(c.points) || 0, at: Number(c.at) })),
    };
  }

  async uploadPhoto(teamId: string, photo: PendingPhoto) {
    const path = `${teamId}/${photo.task}/${photo.photoId}.${mediaExtension(photo)}`;
    const body = await this.readFile(photo.uri);
    const contentType = photo.contentType ?? 'image/jpeg';
    const upload = await this.client.storage.from('photos').upload(path, body, { contentType, upsert: false });
    // Bestaat het bestand al, dan is een eerdere poging gelukt maar het antwoord verloren gegaan.
    if (upload.error && !/exists|Duplicate/i.test(upload.error.message)) throw translate(upload.error, 'errorNetwork');
    const { error } = await this.client
      .from('photos')
      .upsert({ id: photo.photoId, team_id: teamId, task_key: photo.task, path }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw translate(error, 'errorNetwork');
    return path;
  }

  async serverTime() {
    const { data, error } = await this.client.rpc('server_time');
    if (error) throw translate(error, 'errorNetwork');
    return Date.parse(data as string);
  }

  async loadChat(sessionId: string, since?: number) {
    let query = this.client
      .from('messages')
      .select('id, team_id, sender_name, body, created_at, photo_path')
      .eq('session_id', sessionId)
      .eq('channel', 'teams');
    if (since !== undefined) query = query.gt('created_at', new Date(since).toISOString());
    const { data, error } = await query.order('created_at', { ascending: false }).limit(CHAT_LIMIT);
    if (error) throw translate(error, 'errorNetwork');
    return (data as MessageRow[]).map(toChatMessage).reverse();
  }

  async sendChat(sessionId: string, teamId: string, message: { id: string; body: string }) {
    // Afzender, teamnaam en tijd vult de database zelf in.
    const { data } = await this.client.auth.getSession();
    const { error } = await this.client.from('messages').upsert(
      {
        id: message.id,
        session_id: sessionId,
        team_id: teamId,
        sender: 'team',
        sender_user: data.session?.user.id,
        channel: 'teams',
        body: message.body,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (error) throw translate(error, 'errorNetwork');
  }

  watchChat(sessionId: string, onChange: (deleted: boolean) => void) {
    const channel = this.client
      .channel(`teamchat-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${sessionId}` }, () => onChange(false))
      // Bij verwijderen kan Supabase niet filteren: alleen het id komt mee, van elke hunt.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => onChange(true))
      .subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }

  async loadTeamChat(sessionId: string) {
    const { data, error } = await this.client.from('sessions').select('team_chat').eq('id', sessionId).single();
    if (error) throw translate(error, 'errorNetwork');
    return Boolean((data as { team_chat?: boolean }).team_chat);
  }

  async loadSessionVersion(sessionId: string) {
    const { data, error } = await this.client.from('sessions').select('game_version_id').eq('id', sessionId).single();
    if (error) throw translate(error, 'errorNetwork');
    return (data as { game_version_id: string }).game_version_id;
  }
}
