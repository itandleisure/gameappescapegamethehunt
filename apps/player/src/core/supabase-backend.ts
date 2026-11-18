import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameEvent, GamePackage, GpsFix } from '@hunt/engine';
import type { Backend, LoadedGame, PendingPhoto, SessionInfo, TeamRecord } from './types.js';

/** Fout met een tekstsleutel uit i18n, zodat het scherm een nette melding toont. */
export class BackendError extends Error {
  constructor(
    readonly key: 'errorUnknownSession' | 'errorUnknownTeam' | 'errorLanguage' | 'errorPhone' | 'errorNetwork' | 'errorGeneric',
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
}

interface EventRow {
  id: string;
  type: string;
  task_key: string | null;
  payload: Record<string, unknown>;
  client_time: string;
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

  async rejoinTeam(teamCode: string) {
    const { data, error } = await this.client.rpc('rejoin_team', { p_team_code: teamCode });
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
      .select('id, name, timezone, status, test_mode, game_versions(package)')
      .eq('id', team.sessionId)
      .single();
    if (error || !data) throw translate(error);
    const row = data as unknown as {
      id: string;
      name: string;
      timezone: string;
      status: SessionInfo['status'];
      test_mode: boolean;
      game_versions: { package: GamePackage } | null;
    };
    if (!row.game_versions) throw new BackendError('errorGeneric');
    return {
      session: { id: row.id, name: row.name, timezone: row.timezone, status: row.status, testMode: row.test_mode },
      game: row.game_versions.package,
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

  async uploadPhoto(teamId: string, photo: PendingPhoto) {
    const path = `${teamId}/${photo.task}/${photo.photoId}.jpg`;
    const body = await this.readFile(photo.uri);
    const upload = await this.client.storage.from('photos').upload(path, body, { contentType: 'image/jpeg', upsert: false });
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
}
