import type { LatLng, TaskLocation } from './types.js';

const EARTH_RADIUS_M = 6_371_008.8;

/** Afstand in meters tussen twee punten (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isInside(point: LatLng, location: TaskLocation): boolean {
  return distanceMeters(point, location) <= location.radius;
}

export interface GpsFix extends LatLng {
  /** Onzekerheid in meters (zoals de telefoon die opgeeft). */
  accuracy: number;
  /** Tijdstip in ms. */
  at: number;
}

export interface LocationGateOptions {
  /** Metingen met grotere onzekerheid tellen niet mee. Standaard 30 m. */
  maxAccuracy?: number;
  /** Aantal opeenvolgende goede metingen binnen de cirkel. Standaard 2. */
  requiredFixes?: number;
  /** Of: zo lang (ms) binnen de cirkel. Standaard 3000. */
  dwellMs?: number;
  /** Extra marge (m) buiten de straal voordat een locatie opnieuw kan openen. Standaard 10. */
  exitMargin?: number;
}

export interface GateTarget {
  task: string;
  location: TaskLocation;
}

interface TargetTrack {
  insideFixes: number;
  firstInsideAt?: number;
  triggered: boolean;
}

/**
 * Bepaalt in de app wanneer een team echt bij een locatie is.
 *
 * - Metingen met slechte nauwkeurigheid worden genegeerd: ze tellen niet mee
 *   en resetten ook niets.
 * - Een locatie opent pas na `requiredFixes` opeenvolgende goede metingen
 *   binnen de cirkel, of na `dwellMs` binnen de cirkel.
 * - Een eenmaal geopende locatie opent pas opnieuw nadat het team de cirkel
 *   (plus marge) heeft verlaten.
 */
export class LocationGate {
  private readonly opts: Required<LocationGateOptions>;
  private readonly tracks = new Map<string, TargetTrack>();

  constructor(options: LocationGateOptions = {}) {
    this.opts = {
      maxAccuracy: options.maxAccuracy ?? 30,
      requiredFixes: options.requiredFixes ?? 2,
      dwellMs: options.dwellMs ?? 3000,
      exitMargin: options.exitMargin ?? 10,
    };
  }

  /** Verwerkt een meting en geeft de opdrachten terug die nu openen. */
  feed(fix: GpsFix, targets: GateTarget[]): string[] {
    if (!(fix.accuracy >= 0) || fix.accuracy > this.opts.maxAccuracy) return [];
    const reached: string[] = [];
    for (const target of targets) {
      const track = this.tracks.get(target.task) ?? { insideFixes: 0, triggered: false };
      const distance = distanceMeters(fix, target.location);
      if (distance <= target.location.radius) {
        track.insideFixes += 1;
        track.firstInsideAt ??= fix.at;
        const dwellReached = fix.at - track.firstInsideAt >= this.opts.dwellMs;
        if (!track.triggered && (track.insideFixes >= this.opts.requiredFixes || dwellReached)) {
          track.triggered = true;
          reached.push(target.task);
        }
      } else {
        track.insideFixes = 0;
        track.firstInsideAt = undefined;
        if (distance > target.location.radius + this.opts.exitMargin) track.triggered = false;
      }
      this.tracks.set(target.task, track);
    }
    return reached;
  }

  reset(task?: string): void {
    if (task) this.tracks.delete(task);
    else this.tracks.clear();
  }
}
