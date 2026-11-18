import type { GamePackage, TaskLocation } from '@hunt/engine';
import type { LayerRows } from './game-model';

/** Welke locatie de kaart toont: de vaste locatie (track null) of die van één track. */
export type TrackChoice = number | null;

export interface Pin {
  key: string;
  /** null = vaste locatie (voor alle tracks), anders het tracknummer. */
  track: TrackChoice;
  /** Kort teken in het icoon: het kaartnummer van de opdracht, anders de eerste letters. */
  label: string;
  /** Logo-icoon in de trackkleur in plaats van letters of een nummer. */
  logo: boolean;
  /** Finishvlag (met het nummer als label), zoals bij de extractiepunten. */
  flag: boolean;
  title: string;
  location: TaskLocation | null;
  editable: boolean;
  /** Komt de locatie uit deze laag (true) of uit een laag erboven? */
  own: boolean;
}

/** Hoeveel tracks er in het spel voorkomen (minstens 1). */
export function trackCount(game: GamePackage): number {
  let max = 1;
  for (const t of game.tasks) for (const n of Object.keys(t.trackLocations ?? {})) max = Math.max(max, Number(n));
  return max;
}

/**
 * Pinnen voor de kaarteditor. In het basisspel is alles te verplaatsen; in een
 * stad alleen wat het basisspel als aanpasbaar markeert (vaste locatie of
 * locaties per track). Een klant past geen locaties aan.
 */
export function pinsFor(chain: LayerRows[], game: GamePackage, track: TrackChoice, title: (key: string) => string): Pin[] {
  const base = chain[0]!;
  const self = chain[chain.length - 1]!;
  const layer = self.game.layer;
  const idByKey = new Map(base.tasks.map((t) => [t.key, t.id]));
  const field = track === null ? 'location' : 'trackLocations';

  return game.tasks.map((task) => {
    const taskId = idByKey.get(task.id);
    const location = track === null ? (task.location ?? null) : (task.trackLocations?.[track] ?? null);
    const editable =
      layer === 'base' ||
      (layer === 'city' &&
        base.overridable.some((o) => o.task_id === taskId && o.field === field && o.layers.includes('city')));
    const own = self.locations.some((l) => l.task_id === taskId && l.track === track);
    const name = title(task.id);
    const flag = task.mapIcon === 'flag';
    const label = task.mapLabel ?? (flag ? '' : name.slice(0, 2).toUpperCase());
    return { key: task.id, track, label, logo: task.mapIcon === 'logo', flag, title: name, location, editable, own };
  });
}

/**
 * Alle pinnen van alle tracks tegelijk, zoals de Loquiz-creator: de vaste
 * locaties plus per track de locaties die bij die track horen. Opdrachten
 * zonder locatie staan er niet bij (die plaats je via de lijst).
 */
export function allPins(chain: LayerRows[], game: GamePackage, title: (key: string) => string): Pin[] {
  const tracks: TrackChoice[] = [null, ...Array.from({ length: trackCount(game) }, (_, i) => i + 1)];
  return tracks.flatMap((t) => pinsFor(chain, game, t, title).filter((p) => p.location));
}

export { trackColor } from '@hunt/engine';

/** Cirkel als GeoJSON-veelhoek, voor de activatiestraal op de kaart. */
export function circle(lat: number, lng: number, radius: number, steps = 48): [number, number][] {
  const points: [number, number][] = [];
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    points.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return points;
}
