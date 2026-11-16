/**
 * Klokcorrectie: de speeltijd rekent vanaf de servertijd, zodat een team de
 * timer niet kan beïnvloeden door de telefoonklok te verzetten.
 */
export interface ClockSample {
  /** Telefoontijd bij versturen van het verzoek (ms). */
  sentAt: number;
  /** Servertijd in het antwoord (ms). */
  serverTime: number;
  /** Telefoontijd bij ontvangst van het antwoord (ms). */
  receivedAt: number;
}

/**
 * Schat het verschil `servertijd - telefoontijd` in ms. Gebruikt de mediaan
 * van de metingen met de kortste rondreistijd, zodat één trage meting de
 * schatting niet verpest.
 */
export function estimateClockOffset(samples: ClockSample[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a.receivedAt - a.sentAt - (b.receivedAt - b.sentAt));
  const best = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  const offsets = best
    .map((s) => s.serverTime - (s.sentAt + s.receivedAt) / 2)
    .sort((a, b) => a - b);
  const mid = Math.floor(offsets.length / 2);
  return offsets.length % 2 ? offsets[mid]! : (offsets[mid - 1]! + offsets[mid]!) / 2;
}

/** Zet een telefoontijd om naar servertijd. */
export function toServerTime(deviceTime: number, offset: number): number {
  return Math.round(deviceTime + offset);
}
