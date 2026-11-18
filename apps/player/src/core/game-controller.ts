import {
  LocationGate,
  PositionUploader,
  canUseHint,
  computeState,
  reachableTargets,
  type AnswerValue,
  type GameEvent,
  type GamePackage,
  type GpsFix,
  type TeamContext,
  type TeamState,
} from '@hunt/engine';
import { ClockSync } from './clock.js';
import { Retry } from './outbox.js';
import type { Backend, KeyValueStore, LoadedGame, PendingPhoto, SessionInfo, TeamRecord } from './types.js';

export const STORAGE_KEY = 'hunt.game.v1';

/** Wat de app op het scherm toont. */
export interface Snapshot {
  team: TeamRecord;
  session: SessionInfo;
  game: GamePackage;
  /** Leeg zolang het team nog niet op Start heeft gedrukt. */
  state: TeamState | null;
  /** Servertijd van deze momentopname. */
  now: number;
  /** Aantal dingen dat nog naar de server moet (gebeurtenissen, foto's). */
  pending: number;
  /** Of het laatste verzoek aan de server lukte. */
  online: boolean;
  /** Deze telefoon meldde het team aan en moet nog een teamfoto maken. */
  teamPhotoNeeded: boolean;
}

/** Opdrachtsleutel van de teamfoto in de tabel photos (een echte sleutel begint nooit met _). */
export const TEAM_PHOTO_KEY = '_teamfoto';

export interface ControllerDeps {
  backend: Backend;
  store: KeyValueStore;
  /** Telefoonklok (ms). */
  deviceNow?: () => number;
  /** Maakt unieke id's voor gebeurtenissen en foto's. */
  newId?: () => string;
}

interface Saved {
  team: TeamRecord;
  loaded: LoadedGame;
  events: GameEvent[];
  unsent: string[];
  photos: PendingPhoto[];
  clockOffset: number;
  /** 'needed' na aanmelden op deze telefoon, 'taken' zodra de teamfoto er is. */
  teamPhoto?: 'needed' | 'taken';
  /** Alleen in een testsessie: zoveel ms is de klok van het spel vooruitgezet. */
  testSkipMs?: number;
}

type Listener = (snapshot: Snapshot) => void;

/** UUID v4; de app geeft een cryptografisch sterke versie mee (expo-crypto). */
export function randomUuid(random: () => number = Math.random): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Het hart van de speler-app. Houdt de gebeurtenissen van het team bij,
 * rekent de toestand uit met de engine (ook offline), opent opdrachten op
 * locatie, en stuurt gebeurtenissen, posities en foto's naar de server.
 */
export class GameController {
  private readonly clock: ClockSync;
  private readonly gate: LocationGate;
  private readonly uploader = new PositionUploader();
  private readonly eventRetry = new Retry();
  private readonly photoRetry = new Retry();
  private readonly positionRetry = new Retry();
  private readonly listeners = new Set<Listener>();
  private readonly newId: () => string;
  private online = true;
  private currentTick: Promise<void> | null = null;
  private nextTick: Promise<void> | null = null;
  private lastPullAt = 0;
  /** Na "Nee" op een bevestigingsvraag: tot wanneer (servertijd) die locatie niet opnieuw vraagt. */
  private readonly snoozed = new Map<string, number>();

  private constructor(
    private readonly deps: ControllerDeps,
    private data: Saved,
  ) {
    this.clock = new ClockSync(deps.deviceNow ?? Date.now);
    this.clock.offset = data.clockOffset;
    this.gate = new LocationGate({ maxAccuracy: data.loaded.game.gps.maxAccuracy });
    this.newId = deps.newId ?? (() => randomUuid());
  }

  // ---------------------------------------------------------------------------
  // Starten
  // ---------------------------------------------------------------------------

  /** Nieuw team aanmelden met de sessiecode van de spelleiding. */
  static async join(deps: ControllerDeps, joinCode: string, teamName: string, language: string, phone: string) {
    await deps.backend.ensureSignedIn();
    const team = await deps.backend.joinSession(joinCode, teamName, language, phone);
    return GameController.open(deps, team, 'needed');
  }

  /** Op een tweede telefoon verder spelen met de teamcode. */
  static async rejoin(deps: ControllerDeps, teamCode: string) {
    await deps.backend.ensureSignedIn();
    const team = await deps.backend.rejoinTeam(teamCode);
    return GameController.open(deps, team);
  }

  /** Na het herstarten van de app: verder waar het team was. */
  static async resume(deps: ControllerDeps): Promise<GameController | null> {
    const raw = await deps.store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const controller = new GameController(deps, JSON.parse(raw) as Saved);
    // Gebeurtenissen van een andere telefoon van hetzelfde team ophalen; lukt
    // dat niet (offline), dan gaat het spel gewoon verder met wat er lokaal is.
    await controller.pull().catch(() => undefined);
    return controller;
  }

  private static async open(deps: ControllerDeps, team: TeamRecord, teamPhoto?: 'needed') {
    const [loaded, events] = await Promise.all([deps.backend.loadGame(team), deps.backend.loadEvents(team.id)]);
    const controller = new GameController(deps, { team, loaded, events, unsent: [], photos: [], clockOffset: 0, ...(teamPhoto ? { teamPhoto } : {}) });
    await controller.clock.sync(() => deps.backend.serverTime()).catch(() => undefined);
    controller.data.clockOffset = controller.clock.offset;
    await controller.save();
    return controller;
  }

  /** Centrale start: de spelleider start het spel voor alle teams tegelijk. */
  get centralStart(): boolean {
    return this.data.loaded.session.centralStart === true;
  }

  /** Opdrachten van de speluitleg die het team vóór een centrale start leest. */
  briefingTasks(): string[] {
    const id = this.game.briefing;
    return (id && this.game.sequences.find((s) => s.id === id)?.tasks) || [];
  }

  /** Team heeft de speluitleg gelezen en wacht op de start. */
  async markReady(): Promise<void> {
    if (this.data.team.readyAt) return;
    this.data.team = await this.deps.backend.teamReady(this.data.team.id);
    await this.save();
    this.emit();
  }

  /**
   * Centrale start: kijkt of de spelleider het spel al heeft gestart. Geeft
   * true zodra de speeltijd loopt.
   */
  async checkStarted(): Promise<boolean> {
    if (this.data.team.startedAt !== null) return true;
    try {
      this.data.team = await this.deps.backend.loadTeam(this.data.team.id);
      this.online = true;
    } catch {
      this.online = false;
      return false;
    }
    await this.save();
    this.emit();
    return this.data.team.startedAt !== null;
  }

  /** Start de speeltijd (eenmalig, servertijd). */
  async start(): Promise<void> {
    if (this.data.team.startedAt !== null) return;
    if (this.centralStart) {
      await this.checkStarted();
      return;
    }
    this.data.team = await this.deps.backend.startTeam(this.data.team.id);
    await this.save();
    this.emit();
  }

  /** Stopt met spelen op deze telefoon en wist de lokale gegevens. */
  async leave(): Promise<void> {
    await this.deps.store.removeItem(STORAGE_KEY);
    this.listeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Toestand
  // ---------------------------------------------------------------------------

  get team(): TeamRecord {
    return this.data.team;
  }

  get game(): GamePackage {
    return this.data.loaded.game;
  }

  get context(): TeamContext | null {
    const { track, startedAt, readyAt } = this.data.team;
    if (startedAt === null) return null;
    return this.centralStart && readyAt ? { track, startedAt, briefingRead: true } : { track, startedAt };
  }

  snapshot(): Snapshot {
    const now = this.now();
    const ctx = this.context;
    return {
      team: this.data.team,
      session: this.data.loaded.session,
      game: this.game,
      state: ctx ? computeState(this.game, ctx, this.data.events, now) : null,
      now,
      pending: this.data.unsent.length + this.data.photos.length,
      online: this.online,
      teamPhotoNeeded: this.data.teamPhoto === 'needed',
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // GPS
  // ---------------------------------------------------------------------------

  /**
   * Verwerkt een GPS-meting (tijd in telefoontijd). Geeft de opdrachten terug
   * die hierdoor openen, zodat de app kan trillen of een geluid laten horen.
   */
  async onLocation(fix: GpsFix): Promise<string[]> {
    const ctx = this.context;
    if (!ctx) return [];
    const serverFix = { ...fix, at: this.clock.toServer(fix.at) + (this.data.testSkipMs ?? 0) };
    this.uploader.add(serverFix);

    const state = computeState(this.game, ctx, this.data.events, serverFix.at);
    if (state.ended) return [];
    const targets = reachableTargets(this.game, ctx, state).filter((x) => !((this.snoozed.get(x.task) ?? 0) > serverFix.at));
    const reached = this.gate.feed(serverFix, targets);
    for (const task of reached) {
      this.record({ type: 'locationReached', task, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy });
    }
    if (reached.length > 0) await this.commit();
    return reached;
  }

  /**
   * Alleen in een testsessie: doet alsof het team bij de opdracht staat, zodat
   * de spelleiding een spel kan doorlopen zonder ter plekke te zijn.
   * Geeft false als het niet mag of de opdracht nu niet op de kaart open staat.
   */
  async simulateArrival(task: string): Promise<boolean> {
    const ctx = this.context;
    if (!ctx || !this.data.loaded.session.testMode) return false;
    const state = computeState(this.game, ctx, this.data.events, this.now());
    const target = reachableTargets(this.game, ctx, state).find((x) => x.task === task);
    if (!target) return false;
    const { lat, lng } = target.location;
    this.record({ type: 'locationReached', task, lat, lng, accuracy: 0 });
    await this.commit();
    return true;
  }

  /** Opdrachten die in een testsessie met simulateArrival te openen zijn. */
  testTargets(): string[] {
    const ctx = this.context;
    if (!ctx || !this.data.loaded.session.testMode) return [];
    const state = computeState(this.game, ctx, this.data.events, this.now());
    return reachableTargets(this.game, ctx, state).map((x) => x.task);
  }

  // ---------------------------------------------------------------------------
  // Acties van het team
  // ---------------------------------------------------------------------------

  async confirm(task: string): Promise<void> {
    this.record({ type: 'confirmed', task });
    await this.commit();
  }

  /**
   * "Nee" op een bevestigingsvraag. Het team krijgt `declineSeconds` (standaard
   * 20) om de cirkel uit te lopen; staat het er daarna nog, dan komt de vraag
   * terug. Geeft het aantal seconden terug, voor de afteltimer.
   */
  async decline(task: string): Promise<number> {
    const seconds = this.game.gps.declineSeconds ?? 20;
    this.record({ type: 'declined', task });
    this.snoozed.set(task, this.now() + seconds * 1000);
    this.gate.reset(task);
    await this.commit();
    return seconds;
  }

  async answer(task: string, answer: AnswerValue): Promise<void> {
    this.record({ type: 'answered', task, answer });
    await this.commit();
  }

  /** Neemt de volgende hint; geeft false als dat nu niet mag. */
  async useHint(task: string): Promise<boolean> {
    const snap = this.snapshot();
    if (!snap.state || !canUseHint(this.game, snap.state, task)) return false;
    this.record({ type: 'hintUsed', task, hint: snap.state.tasks[task]!.hintsUsed });
    await this.commit();
    return true;
  }

  /**
   * Foto bij een opdracht. Telt direct als antwoord; de foto zelf gaat op de
   * achtergrond naar de server, ook als er nu even geen bereik is.
   */
  async submitPhoto(task: string, uri: string): Promise<void> {
    const photoId = this.newId();
    this.data.photos.push({ photoId, task, uri, takenAt: this.now() });
    this.record({ type: 'answered', task, answer: { type: 'photo', photoId } });
    await this.commit();
  }

  /** Servertijd, in een testsessie plus de tijd die vooruitgezet is. */
  private now(): number {
    return this.clock.now() + (this.data.testSkipMs ?? 0);
  }

  /**
   * Alleen in een testsessie: zet de klok van het spel vooruit, zodat
   * opdrachten en regels die op tijd gaan meteen te testen zijn.
   */
  async skipTime(minutes: number): Promise<boolean> {
    if (!this.data.loaded.session.testMode || !(minutes > 0)) return false;
    this.data.testSkipMs = (this.data.testSkipMs ?? 0) + minutes * 60_000;
    await this.commit();
    return true;
  }

  /** De teamfoto bij het aanmelden; gaat net als andere foto's mee met de wachtrij. */
  async submitTeamPhoto(uri: string): Promise<void> {
    this.data.photos.push({ photoId: this.newId(), task: TEAM_PHOTO_KEY, uri, takenAt: this.now() });
    this.data.teamPhoto = 'taken';
    await this.commit();
  }

  // ---------------------------------------------------------------------------
  // Synchroniseren
  // ---------------------------------------------------------------------------

  /**
   * Roep regelmatig aan (bijvoorbeeld elke 5 seconden). Verstuurt wat klaarstaat
   * en haalt af en toe gebeurtenissen van andere telefoons van het team op.
   */
  tick(): Promise<void> {
    // Nooit twee rondes tegelijk; een verzoek tijdens een ronde wacht op de volgende.
    if (!this.currentTick) {
      this.currentTick = this.runTick().finally(() => {
        this.currentTick = null;
      });
      return this.currentTick;
    }
    this.nextTick ??= this.currentTick.then(() => {
      this.nextTick = null;
      return this.tick();
    });
    return this.nextTick;
  }

  private async runTick(): Promise<void> {
    try {
      const device = (this.deps.deviceNow ?? Date.now)();
      await this.flushEvents(device);
      await this.flushPositions();
      await this.flushPhotos(device);
      if (device - this.lastPullAt >= 30_000) {
        this.lastPullAt = device;
        await this.pull().catch(() => undefined);
      }
    } finally {
      this.emit();
    }
  }

  private async flushEvents(device: number) {
    if (this.data.unsent.length === 0 || !this.eventRetry.ready(device)) return;
    const ids = new Set(this.data.unsent);
    const batch = this.data.events.filter((e) => ids.has(e.id));
    try {
      await this.deps.backend.sendEvents(this.data.team.id, batch);
      this.data.unsent = this.data.unsent.filter((id) => !ids.has(id));
      this.eventRetry.succeeded();
      this.online = true;
      await this.save();
    } catch {
      this.eventRetry.failed(device);
      this.online = false;
    }
  }

  private async flushPositions() {
    const now = this.now();
    if (!this.uploader.shouldFlush(now) || !this.positionRetry.ready(now)) return;
    const batch = this.uploader.takeBatch(now);
    if (batch.length === 0) return;
    try {
      await this.deps.backend.recordPositions(this.data.team.id, batch);
      this.positionRetry.succeeded();
    } catch {
      this.uploader.requeue(batch);
      this.positionRetry.failed(now);
    }
  }

  private async flushPhotos(device: number) {
    if (this.data.photos.length === 0 || !this.photoRetry.ready(device)) return;
    const photo = this.data.photos[0]!;
    try {
      await this.deps.backend.uploadPhoto(this.data.team.id, photo);
      this.data.photos.shift();
      this.photoRetry.succeeded();
      await this.save();
    } catch {
      this.photoRetry.failed(device);
    }
  }

  /** Haalt gebeurtenissen van de server op en voegt ze samen met de lokale. */
  private async pull() {
    const [remote, team] = await Promise.all([
      this.deps.backend.loadEvents(this.data.team.id),
      this.deps.backend.loadTeam(this.data.team.id),
    ]);
    const known = new Set(this.data.events.map((e) => e.id));
    const added = remote.filter((e) => !known.has(e.id));
    this.data.team = team;
    if (added.length > 0) this.data.events = [...this.data.events, ...added];
    await this.save();
    this.emit();
  }

  // ---------------------------------------------------------------------------
  // Intern
  // ---------------------------------------------------------------------------

  private record(event: DistributiveOmit<GameEvent, 'id' | 'at'>) {
    const full = { ...event, id: this.newId(), at: this.now() } as GameEvent;
    this.data.events.push(full);
    this.data.unsent.push(full.id);
  }

  private async commit() {
    await this.save();
    this.emit();
    void this.tick();
  }

  private async save() {
    this.data.clockOffset = this.clock.offset;
    await this.deps.store.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }

  private emit() {
    if (this.listeners.size === 0) return;
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
