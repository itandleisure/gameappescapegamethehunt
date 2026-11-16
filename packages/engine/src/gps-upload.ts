import { distanceMeters, type GpsFix } from './geo.js';

export interface PositionUploadOptions {
  /** Metingen met grotere onzekerheid worden niet verstuurd. Standaard 30 m. */
  maxAccuracy?: number;
  /** Nieuwe positie pas versturen na zoveel meter verplaatsing. Standaard 10 m. */
  minDistance?: number;
  /** Maar nooit vaker dan eens per zoveel ms. Standaard 5 s. */
  minIntervalMs?: number;
  /** En stilstaand toch eens per zoveel ms, zodat de monitor ziet dat het team er nog is. Standaard 30 s. */
  heartbeatMs?: number;
  /** Bundel versturen na zoveel ms. Standaard 20 s. */
  flushEveryMs?: number;
  /** Of zodra de bundel zo groot is. Standaard 50. */
  maxBatch?: number;
}

/**
 * Bepaalt in de app welke GPS-metingen naar de server gaan, en wanneer.
 *
 * De telefoon meet continu (de LocationGate gebruikt elke meting), maar de
 * server krijgt alleen een uitgedunde route, gebundeld in één verzoek per
 * ~20 seconden. Bij 10.000 telefoons tegelijk is dat ~500 verzoeken per
 * seconde in plaats van ~10.000.
 */
export class PositionUploader {
  private readonly opts: Required<PositionUploadOptions>;
  private pending: GpsFix[] = [];
  private lastKept?: GpsFix;
  private lastFlushAt?: number;

  constructor(options: PositionUploadOptions = {}) {
    this.opts = {
      maxAccuracy: options.maxAccuracy ?? 30,
      minDistance: options.minDistance ?? 10,
      minIntervalMs: options.minIntervalMs ?? 5_000,
      heartbeatMs: options.heartbeatMs ?? 30_000,
      flushEveryMs: options.flushEveryMs ?? 20_000,
      maxBatch: options.maxBatch ?? 50,
    };
  }

  /** Verwerkt een meting; geeft true als hij in de bundel is gezet. */
  add(fix: GpsFix): boolean {
    if (!(fix.accuracy >= 0) || fix.accuracy > this.opts.maxAccuracy) return false;
    const last = this.lastKept;
    if (last) {
      const elapsed = fix.at - last.at;
      if (elapsed < this.opts.minIntervalMs) return false;
      const moved = distanceMeters(last, fix) >= this.opts.minDistance;
      if (!moved && elapsed < this.opts.heartbeatMs) return false;
    }
    this.lastKept = fix;
    this.pending.push(fix);
    this.lastFlushAt ??= fix.at;
    return true;
  }

  /** Of de bundel nu verstuurd moet worden. */
  shouldFlush(now: number): boolean {
    if (this.pending.length === 0) return false;
    if (this.pending.length >= this.opts.maxBatch) return true;
    return now - (this.lastFlushAt ?? now) >= this.opts.flushEveryMs;
  }

  /**
   * Haalt de bundel op om te versturen. Lukt versturen niet (geen bereik),
   * geef hem dan terug met `requeue`, zodat er niets verloren gaat.
   */
  takeBatch(now: number): GpsFix[] {
    const batch = this.pending;
    this.pending = [];
    this.lastFlushAt = now;
    return batch;
  }

  requeue(batch: GpsFix[]): void {
    this.pending = [...batch, ...this.pending];
  }

  get size(): number {
    return this.pending.length;
  }
}
