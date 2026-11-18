import type { GameEvent, GamePackage, GpsFix } from '@hunt/engine';

/** Een team zoals de server het teruggeeft. Tijden in ms sinds epoch (servertijd). */
export interface TeamRecord {
  id: string;
  sessionId: string;
  name: string;
  language: string;
  track: number;
  teamCode: string;
  startedAt: number | null;
  endedAt: number | null;
}

export interface SessionInfo {
  id: string;
  name: string;
  timezone: string;
  status: 'draft' | 'open' | 'closed';
  testMode: boolean;
}

export interface LoadedGame {
  session: SessionInfo;
  game: GamePackage;
}

/** Een foto die nog naar de server moet. */
export interface PendingPhoto {
  photoId: string;
  task: string;
  /** Lokaal bestand op de telefoon. */
  uri: string;
  takenAt: number;
}

/**
 * Alles wat de app van de server nodig heeft. De echte versie praat met
 * Supabase (`supabase-backend.ts`); de tests gebruiken een nep-server.
 */
export interface Backend {
  /** Zorgt voor een (anonieme) login op dit toestel. */
  ensureSignedIn(): Promise<void>;
  joinSession(joinCode: string, teamName: string, language: string, phone: string): Promise<TeamRecord>;
  rejoinTeam(teamCode: string): Promise<TeamRecord>;
  startTeam(teamId: string): Promise<TeamRecord>;
  loadTeam(teamId: string): Promise<TeamRecord>;
  loadGame(team: TeamRecord): Promise<LoadedGame>;
  loadEvents(teamId: string): Promise<GameEvent[]>;
  /** Stuurt gebeurtenissen; dubbel versturen mag (zelfde id wordt genegeerd). */
  sendEvents(teamId: string, events: GameEvent[]): Promise<void>;
  recordPositions(teamId: string, fixes: GpsFix[]): Promise<void>;
  /** Uploadt een foto en registreert hem; geeft het opslagpad terug. */
  uploadPhoto(teamId: string, photo: PendingPhoto): Promise<string>;
  /** Servertijd in ms. */
  serverTime(): Promise<number>;
}

/** Sleutel-waardeopslag op de telefoon (AsyncStorage heeft dezelfde vorm). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  async getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    this.data.delete(key);
  }
}
