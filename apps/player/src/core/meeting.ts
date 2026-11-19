import { checkFix, distanceMeters, LocationGate, type GpsFix, type LatLng } from '@hunt/engine';
import type { MessageKey } from './i18n';

/**
 * Lopen naar het verzamelpunt na afloop van het spel. Zonder telefoonfuncties,
 * zodat het te testen is.
 */

/** Zo lang zonder bruikbare meting heet de GPS "werkt niet"; dan mag het team zelf melden dat het er is. */
export const MEETING_NO_GPS_MS = 30_000;

/**
 * Of het team bij het verzamelpunt is. Dezelfde regels als bij het openen van
 * een opdracht op locatie: twee metingen of 3 seconden binnen de cirkel, en
 * een zwakke meting telt mee als de onzekerheid de cirkel raakt (tot 75 m).
 */
export class MeetingArrival {
  private readonly gate: LocationGate;
  private lastUsable: number | null = null;

  constructor(
    private readonly point: LatLng & { radius: number },
    private readonly maxAccuracy: number,
    private readonly startedAt: number,
  ) {
    this.gate = new LocationGate({ maxAccuracy });
  }

  /** Verwerkt een meting; true zodra het team er is. */
  feed(fix: GpsFix): boolean {
    if (checkFix(fix, this.point, this.maxAccuracy) !== 'unusable') {
      this.lastUsable = Math.max(this.lastUsable ?? 0, fix.at);
    }
    return this.gate.feed(fix, [{ task: 'verzamelpunt', location: this.point }]).length > 0;
  }

  /** De GPS geeft (al een tijd) geen bruikbare meting: toon dan de knop "Wij zijn er". */
  gpsFailing(now: number): boolean {
    return now - (this.lastUsable ?? this.startedAt) > MEETING_NO_GPS_MS;
  }
}

/** Afstand als tekst: meters dichtbij, kilometers verder weg. */
export function distanceText(meters: number, lang: string): { key: MessageKey; vars: Record<string, string | number> } {
  if (meters < 1000) return { key: 'distanceLeft', vars: { meters: Math.round(meters) } };
  const digits = meters < 10_000 ? 1 : 0;
  let km: string;
  try {
    km = new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(meters / 1000);
  } catch {
    km = (meters / 1000).toFixed(digits);
  }
  return { key: 'distanceLeftKm', vars: { km } };
}

/** Hemelsbrede afstand in meters (afgerond). */
export function metersTo(from: LatLng, to: LatLng): number {
  return Math.round(distanceMeters(from, to));
}
