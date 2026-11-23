import type { GameEvent, GamePackage, GpsFix, HuntRecords, NewsAuto, Text } from '@hunt/engine';

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
  /** Speluitleg gelezen, klaar voor de centrale start. */
  readyAt?: number | null;
}

export interface SessionInfo {
  id: string;
  name: string;
  timezone: string;
  status: 'draft' | 'open' | 'closed';
  testMode: boolean;
  /** Hunt-code van de spelleiding; met deze code en de teamnaam speelt een team verder. */
  joinCode?: string;
  /** Teams in deze hunt kunnen met elkaar chatten. */
  teamChat?: boolean;
}

/** Bericht in de teamchat van de hunt. */
export interface ChatMessage {
  id: string;
  /** Team dat het stuurde; null bij een bericht van de spelleiding. */
  teamId: string | null;
  /** Teamnaam van de afzender (door de server ingevuld); null bij de spelleiding. */
  name: string | null;
  body: string;
  /** Servertijd in ms; bij een bericht dat nog verstuurd moet de tijd van deze telefoon. */
  createdAt: number;
  /** Nog niet bij de server (geen bereik). */
  pending?: boolean;
  /** Foto van de spelleiding bij het bericht (pad in de bucket photobooks). */
  photoPath?: string;
}

export interface LoadedGame {
  session: SessionInfo;
  game: GamePackage;
  /** Id van de gespeelde versie (game_versions.id); ontbreekt bij spellen van vóór deze toevoeging. */
  versionId?: string;
}

/** Een foto die nog naar de server moet. */
export interface PendingPhoto {
  photoId: string;
  task: string;
  /** Lokaal bestand op de telefoon. */
  uri: string;
  takenAt: number;
  /** Video (video-opdracht); zonder dit veld is het een JPEG-foto. */
  contentType?: 'video/mp4' | 'video/quicktime';
}

/** Een team is gepakt door een Hunter (de spelleider meldde het). */
export interface CaughtSignal {
  /** Id van de gebeurtenis 'caught'. */
  id: string;
  teamId: string;
  teamName: string;
  /** Strafpunten, bijvoorbeeld -100. */
  points: number;
  /** Servertijd (ms). */
  at: number;
}

/**
 * Nieuwsflits van de server: van de spelleider, of automatisch over een ander
 * team (extractiepunt bereikt, puzzel opgelost).
 */
export interface NewsSignal {
  id: string;
  kind: 'leader' | 'escaped' | 'puzzle';
  teamId?: string | null;
  teamName?: string | null;
  /** De puzzel (opdrachtsleutel) bij 'puzzle'. */
  task?: string | null;
  /** Van de spelleider: emoji, titel en tekst per taal. */
  icon?: string | null;
  title?: Text;
  body?: Text;
  /** Het hoeveelste team met dit nieuws (1 = als eerste). */
  n?: number | null;
  /** Servertijd (ms). */
  at: number;
}

export interface TeamSignals {
  hunterNear: boolean;
  caught: CaughtSignal[];
  /** Alleen als de app `newsSince` meegaf. */
  news?: NewsSignal[];
  /** Welke automatische flitsen aan staan. */
  newsAuto?: Partial<NewsAuto>;
}

/** Wat de server weet voor het eindscherm (zie team_summary). */
export interface TeamSummary extends HuntRecords {
  /** Afgelegde afstand volgens de GPS-route op de server, in meters. */
  distance: number | null;
  /** Aantal gestarte teams. */
  teams: number;
  /** Teams die klaar zijn, met hun eindscore. */
  finished: { team: string; score: number }[];
}

/**
 * Alles wat de app van de server nodig heeft. De echte versie praat met
 * Supabase (`supabase-backend.ts`); de tests gebruiken een nep-server.
 */
export interface Backend {
  /** Zorgt voor een (anonieme) login op dit toestel. */
  ensureSignedIn(): Promise<void>;
  joinSession(joinCode: string, teamName: string, language: string, phone: string): Promise<TeamRecord>;
  /** Verder spelen met de hunt-code en de teamnaam. */
  /** Verder spelen met de teamnaam; de hunt-code is alleen nodig als de naam in meerdere lopende hunts voorkomt. */
  rejoinTeam(teamName: string, joinCode?: string): Promise<TeamRecord>;
  startTeam(teamId: string): Promise<TeamRecord>;
  /** Meldt dat het team de speluitleg heeft gelezen (centrale start). */
  loadTeam(teamId: string): Promise<TeamRecord>;
  loadGame(team: TeamRecord): Promise<LoadedGame>;
  loadEvents(teamId: string): Promise<GameEvent[]>;
  /** Stuurt gebeurtenissen; dubbel versturen mag (zelfde id wordt genegeerd). */
  sendEvents(teamId: string, events: GameEvent[]): Promise<void>;
  recordPositions(teamId: string, fixes: GpsFix[]): Promise<void>;
  /**
   * Wat een spelend team elke 10 seconden vraagt: is er een Hunter (ingelogde
   * spelleider) binnen de afstand van het spel (alleen ja of nee; de server
   * vergelijkt met de laatst verstuurde positie van het team), en welke teams
   * zijn na `since` (servertijd in ms) gepakt. Optioneel.
   */
  teamSignals?(teamId: string, since: number, newsSince?: number): Promise<TeamSignals>;
  /** Meldt nieuws over dit team voor de andere teams: extractiepunt bereikt of een puzzel opgelost. Optioneel. */
  reportNews?(teamId: string, kind: 'escaped' | 'puzzle', task?: string): Promise<void>;
  /** Aan het einde: score, einde en eindtijd (servertijd in ms). Optioneel. */
  finishTeam?(teamId: string, score: number, ending: string, endedAt: number): Promise<void>;
  /** Voor het eindscherm: afstand, eindstand en wie de eerste of de meeste was. Optioneel. */
  teamSummary?(teamId: string): Promise<TeamSummary>;
  /** Uploadt een foto en registreert hem; geeft het opslagpad terug. */
  uploadPhoto(teamId: string, photo: PendingPhoto): Promise<string>;
  /** Servertijd in ms. */
  serverTime(): Promise<number>;
  /**
   * Teamchat van de hunt, oudste eerst. Met `since` (servertijd in ms) alleen
   * nieuwere berichten, anders de laatste berichten.
   */
  loadChat(sessionId: string, since?: number): Promise<ChatMessage[]>;
  /** Stuurt een bericht; dubbel versturen mag (zelfde id wordt genegeerd). */
  sendChat(sessionId: string, teamId: string, message: { id: string; body: string }): Promise<void>;
  /**
   * Live melding bij een nieuw (`deleted` false) of verwijderd bericht in de
   * teamchat. Optioneel: zonder live verbinding haalt de app de chat regelmatig op.
   */
  watchChat?(sessionId: string, onChange: (deleted: boolean) => void): () => void;
  /** Staat de teamchat (nog) aan? De spelleider kan hem tijdens het spel aan- of uitzetten. */
  loadTeamChat(sessionId: string): Promise<boolean>;
  /**
   * Welke versie van het spel de hunt nu speelt (game_versions.id). Verandert
   * als de beheerder het spel live bijwerkt. Optioneel.
   */
  loadSessionVersion?(sessionId: string): Promise<string>;
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
