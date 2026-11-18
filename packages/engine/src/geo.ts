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

const CURVE_STEPS = 16;

/** Punt op een kwadratische bocht van a naar b met stuurpunt c (t van 0 tot 1). */
export function curvePoint(a: LatLng, c: LatLng, b: LatLng, t: number): LatLng {
  const u = 1 - t;
  return { lat: u * u * a.lat + 2 * u * t * c.lat + t * t * b.lat, lng: u * u * a.lng + 2 * u * t * c.lng + t * t * b.lng };
}

/**
 * De hele grens als losse punten, met bochten uitgeschreven tot korte rechte
 * stukjes. Niet gesloten: het laatste punt loopt niet terug naar het eerste.
 */
export function boundaryPath(boundary: { points: (LatLng & { curve?: LatLng })[] } | null | undefined): LatLng[] {
  const pts = boundary?.points ?? [];
  const closed = pts.length >= 3;
  const out: LatLng[] = [];
  pts.forEach((p, i) => {
    out.push({ lat: p.lat, lng: p.lng });
    const next = pts[(i + 1) % pts.length];
    if (!p.curve || !next || (!closed && i === pts.length - 1)) return;
    for (let s = 1; s < CURVE_STEPS; s++) out.push(curvePoint(p, p.curve, next, s / CURVE_STEPS));
  });
  return out;
}

/**
 * Speelveldgrens als gesloten lijn in GeoJSON, voor MapLibre (beheerapp en
 * speler-app), met bochten. Leeg zonder minstens 2 punten.
 */
export function boundaryGeoJson(boundary: { points: (LatLng & { curve?: LatLng })[] } | null | undefined) {
  const pts = boundary?.points ?? [];
  if (pts.length < 2) return { type: 'FeatureCollection' as const, features: [] };
  const coords = boundaryPath(boundary).map((p) => [p.lng, p.lat]);
  if (pts.length >= 3) coords.push(coords[0]!);
  return {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } }],
  };
}
