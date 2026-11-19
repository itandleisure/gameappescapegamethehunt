/**
 * Het stappenplan "Stad inrichten": de rekenregels achter de schermen, los
 * van de pagina zodat ze te testen zijn.
 */
import type { GamePackage, LatLng, TaskLocation } from '@hunt/engine';
import { spreadAround } from './city-rollout';
import type { Pin } from './map-edit';

/**
 * Opdrachten die op de finishlocatie staan: de finishvlag en extractiepunt
 * locatie 3 (het juiste extractiepunt). Het verzamelpunt komt op dezelfde plek.
 */
export const FINISH_TASKS = ['extractie-finish', 'extractie-a'] as const;

/** De twee lokale vragen (stadsvragen) van The Hunt. */
export const LOCAL_QUESTIONS = ['lokaal-1', 'lokaal-2'] as const;

/** De morsecodepuzzel; een stad mag de hints aanpassen. */
export const MORSE_TASK = 'puzzel-morse';

/** Sleutel van een pin per opdracht en track, zoals op de kaartpagina. */
export const pinKey = (p: Pick<Pin, 'key' | 'track'>) => `${p.key}|${p.track ?? ''}`;

/** Waar de finish nu ligt: de finishvlag, anders het verzamelpunt. */
export function finishPoint(game: GamePackage): LatLng | null {
  const flag = game.tasks.find((t) => t.id === FINISH_TASKS[0])?.location;
  const point = flag ?? game.meetingPoint ?? null;
  return point ? { lat: point.lat, lng: point.lng } : null;
}

/** De startlocatie die bij de stad is aangewezen (settings.start). */
export function startPoint(settings: Record<string, unknown> | null | undefined): LatLng | null {
  const value = settings?.start as Partial<LatLng> | undefined;
  return value && typeof value.lat === 'number' && typeof value.lng === 'number' ? { lat: value.lat, lng: value.lng } : null;
}

/** De iconen die je in stap 4 versleept: alles wat de stad mag verplaatsen, behalve de finish. */
export function iconPins(pins: Pin[]): Pin[] {
  const finish = new Set<string>(FINISH_TASKS);
  return pins.filter((p) => p.editable && p.location && !finish.has(p.key));
}

/** Alle iconen in een kleine spiraal rond de startlocatie (niet erop), met hun eigen straal. */
export function gatherAt(pins: Pin[], start: LatLng): Record<string, TaskLocation> {
  // Het eerste punt van de spiraal is de start zelf; daar blijft het startpunt zichtbaar.
  const points = spreadAround(start, pins.length + 1).slice(1);
  return Object.fromEntries(pins.map((p, i) => [pinKey(p), { ...points[i]!, radius: p.location?.radius ?? 25 }]));
}
