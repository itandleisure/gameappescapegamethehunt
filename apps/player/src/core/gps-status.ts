/**
 * Houdt bij of de GPS nog meetingen geeft. In de webapp stopt de browser de
 * GPS zodra het scherm uit gaat of de speler naar een andere app gaat; dan
 * moet het team dat op het scherm zien, en na terugkomen horen hoe lang de
 * GPS uit stond. Zonder telefoonfuncties, zodat het te testen is.
 */

export type GpsState =
  /** Nog geen meting sinds het starten (even geduld, of buiten zoeken). */
  | 'waiting'
  /** Recente meting. */
  | 'ok'
  /** Te lang geen meting. */
  | 'lost'
  /** De speler of de browser staat locatie niet toe. */
  | 'denied'
  /** GPS staat niet aan. */
  | 'off';

export interface GpsStatus {
  state: GpsState;
  /** Tijd van de laatste meting (ms), of null. */
  lastFixAt: number | null;
  /** Hoe lang de app net weg was (scherm uit of andere app), in ms; 0 als er niets te melden is. */
  awayMs: number;
}

/** Zonder meting in deze tijd heet de GPS weggevallen. */
export const GPS_LOST_AFTER_MS = 30_000;
/** Pas melden dat de speler weg was als het langer duurde dan dit. */
export const AWAY_NOTICE_AFTER_MS = 5_000;
/** Zo lang blijft de melding "je was even weg" staan. */
export const AWAY_NOTICE_FOR_MS = 20_000;

export class GpsMonitor {
  private tracking = false;
  private startedAt = 0;
  private lastFix: number | null = null;
  private denied = false;
  private hiddenAt: number | null = null;
  private away: { ms: number; until: number } | null = null;

  constructor(private readonly lostAfterMs = GPS_LOST_AFTER_MS) {}

  start(now: number) {
    if (this.tracking) return;
    this.tracking = true;
    this.startedAt = now;
    this.denied = false;
  }

  stop() {
    this.tracking = false;
    this.away = null;
    this.hiddenAt = null;
  }

  fix(at: number) {
    this.lastFix = Math.max(this.lastFix ?? 0, at);
    this.denied = false;
  }

  deny() {
    this.denied = true;
  }

  /** Pagina niet meer in beeld (scherm uit, andere app). */
  hide(now: number) {
    if (this.tracking && this.hiddenAt === null) this.hiddenAt = now;
  }

  /** Weer in beeld. Telt de wachttijd voor "weggevallen" opnieuw vanaf nu. */
  show(now: number) {
    if (this.hiddenAt === null) return;
    const ms = now - this.hiddenAt;
    this.hiddenAt = null;
    if (!this.tracking) return;
    if (ms >= AWAY_NOTICE_AFTER_MS) this.away = { ms, until: now + AWAY_NOTICE_FOR_MS };
    // De browser heeft even nodig voor een nieuwe meting.
    this.startedAt = now;
  }

  /** Melding "je was weg" wegklikken. */
  dismissAway() {
    this.away = null;
  }

  status(now: number): GpsStatus {
    const awayMs = this.away && now < this.away.until ? this.away.ms : 0;
    const lastFixAt = this.lastFix;
    if (!this.tracking) return { state: 'off', lastFixAt, awayMs: 0 };
    if (this.denied) return { state: 'denied', lastFixAt, awayMs };
    const fresh = lastFixAt !== null && now - lastFixAt <= this.lostAfterMs;
    if (fresh) return { state: 'ok', lastFixAt, awayMs };
    // Net gestart of net terug in beeld: even wachten op een meting.
    const waiting = now - this.startedAt <= this.lostAfterMs;
    return { state: waiting ? 'waiting' : 'lost', lastFixAt, awayMs };
  }
}
