import { boundaryPath, locationFor, type GamePackage, type LatLng } from '@hunt/engine';

/** [west, zuid, oost, noord] in graden, zoals MapLibre die verwacht. */
export type Bounds = [number, number, number, number];

const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Het speelveld: alle opdrachtlocaties (van alle tracks) en het verzamelpunt,
 * met een marge eromheen. Alleen dit stuk kaart downloadt de app bij het
 * inloggen (zie docs/ontwerp.md §2.1).
 */
export function playAreaBounds(game: GamePackage, marginMeters = 300): Bounds | undefined {
  const points: LatLng[] = [];
  for (const task of game.tasks) {
    if (task.location) points.push(task.location);
    for (const loc of Object.values(task.trackLocations ?? {})) points.push(loc);
  }
  if (game.meetingPoint) points.push(game.meetingPoint);
  // De hele speelveldgrens moet op de kaart (en in de download) passen.
  for (const p of boundaryPath(game.boundary)) points.push(p);
  if (points.length === 0) return undefined;

  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  const dLat = marginMeters / METERS_PER_DEGREE_LAT;
  const midLat = (south + north) / 2;
  const dLng = marginMeters / (METERS_PER_DEGREE_LAT * Math.cos((midLat * Math.PI) / 180));
  return [west - dLng, south - dLat, east + dLng, north + dLat];
}

/** Midden van het speelveld, voor de beginpositie van de kaart. */
export function boundsCenter([west, south, east, north]: Bounds): LatLng {
  return { lat: (south + north) / 2, lng: (west + east) / 2 };
}

/** Aantal kaarttegels voor deze bounds over de zoomniveaus, om de download te begrenzen. */
export function tileCount([west, south, east, north]: Bounds, minZoom: number, maxZoom: number): number {
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const [x1, y1] = tileXY(west, north, z);
    const [x2, y2] = tileXY(east, south, z);
    total += (Math.abs(x2 - x1) + 1) * (Math.abs(y2 - y1) + 1);
  }
  return total;
}

export function tileXY(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return [x, y];
}

/** Hoogste zoomniveau waarbij de download onder het maximum aantal tegels blijft. */
export function chooseMaxZoom(bounds: Bounds, minZoom = 12, preferredMax = 17, maxTiles = 3000): number {
  for (let z = preferredMax; z > minZoom; z--) {
    if (tileCount(bounds, minZoom, z) <= maxTiles) return z;
  }
  return minZoom;
}

/** Locaties voor de kaart van dit team (zijn eigen track). */
export function taskMarkers(game: GamePackage, track: number, visibleIds: Iterable<string>) {
  const visible = new Set(visibleIds);
  return game.tasks.flatMap((task) => {
    const location = locationFor(task, track);
    return location && visible.has(task.id) ? [{ id: task.id, location }] : [];
  });
}
