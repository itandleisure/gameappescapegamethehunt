// Live kaart voor de spelleiding (de Hunters): waar is elk team nu, en welke
// route heeft het gelopen. Pure functies, zodat ze zonder kaart te testen zijn.
import { distanceMeters, routeDistance, type GamePackage, type LatLng } from '@hunt/engine';

export interface PositionRow {
  team_id: string;
  lat: number;
  lng: number;
  accuracy: number;
  recorded_at: string;
}

export interface MapTeam {
  id: string;
  name: string;
  track: number;
  color: string;
}

/** Goed van elkaar te onderscheiden kleuren op de zwart-witte kaart. */
export const TEAM_COLORS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0fa3b1',
  '#f032e6', '#9a6324', '#808000', '#000075', '#ff6f91', '#2a9d8f',
  '#bc6c25', '#6a4c93', '#d00000', '#1982c4',
];

export function teamColor(index: number): string {
  return TEAM_COLORS[index % TEAM_COLORS.length]!;
}

export interface TeamTrail {
  teamId: string;
  /** Bruikbare punten, oud → nieuw, als [lng, lat] voor MapLibre. */
  coordinates: [number, number][];
  last?: { lat: number; lng: number; at: number; accuracy: number };
  distanceM: number;
}

/**
 * Route per team uit de GPS-posities. Onnauwkeurige metingen tellen niet mee
 * en kleine stapjes bij stilstaan worden samengevoegd, zodat de lijn rustig
 * blijft. De laatste bekende positie is altijd de nieuwste meting, ook als
 * die onnauwkeurig is: beter een ruwe plek dan geen plek.
 */
export function buildTrails(
  positions: readonly PositionRow[],
  options: { maxAccuracy?: number; since?: number; minStep?: number } = {},
): Map<string, TeamTrail> {
  const maxAccuracy = options.maxAccuracy ?? 30;
  const minStep = options.minStep ?? 3;
  const byTeam = new Map<string, PositionRow[]>();
  for (const p of positions) {
    const list = byTeam.get(p.team_id) ?? [];
    list.push(p);
    byTeam.set(p.team_id, list);
  }
  const trails = new Map<string, TeamTrail>();
  for (const [teamId, rows] of byTeam) {
    const fixes = rows
      .map((r) => ({ lat: r.lat, lng: r.lng, accuracy: r.accuracy, at: Date.parse(r.recorded_at) }))
      .sort((a, b) => a.at - b.at);
    const newest = fixes[fixes.length - 1];
    const coordinates: [number, number][] = [];
    let prev: LatLng | undefined;
    for (const f of fixes) {
      if (f.accuracy > maxAccuracy) continue;
      if (options.since !== undefined && f.at < options.since) continue;
      if (prev && distanceMeters(prev, f) < minStep) continue;
      coordinates.push([f.lng, f.lat]);
      prev = f;
    }
    trails.set(teamId, {
      teamId,
      coordinates,
      last: newest ? { lat: newest.lat, lng: newest.lng, at: newest.at, accuracy: newest.accuracy } : undefined,
      distanceM: Math.round(routeDistance(fixes, { maxAccuracy })),
    });
  }
  return trails;
}

/** GeoJSON met één lijn per team, voor de laag met routes. */
export function trailsGeoJson(teams: readonly MapTeam[], trails: Map<string, TeamTrail>) {
  return {
    type: 'FeatureCollection' as const,
    features: teams.flatMap((team) => {
      const trail = trails.get(team.id);
      if (!trail || trail.coordinates.length < 2) return [];
      return [
        {
          type: 'Feature' as const,
          properties: { team: team.id, color: team.color },
          geometry: { type: 'LineString' as const, coordinates: trail.coordinates },
        },
      ];
    }),
  };
}

/** "zojuist", "45 s geleden", "3 min geleden", "1 u 5 min geleden" */
export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return 'zojuist';
  if (s < 60) return `${s} s geleden`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min geleden`;
  return `${Math.floor(m / 60)} u ${m % 60} min geleden`;
}

/** Positie ouder dan 2 minuten: het team heeft (even) geen verbinding of GPS. */
export function isStale(at: number, now: number): boolean {
  return now - at > 2 * 60_000;
}

export interface TaskPoint {
  id: string;
  title: string;
  label: string;
  lat: number;
  lng: number;
  radius: number;
  /** Track waarvoor deze locatie geldt; leeg = voor iedereen. */
  track?: number;
}

/**
 * Opdrachten op de kaart. Vaste locaties altijd; locaties per track alleen
 * voor de tracks die nu getoond worden (bij één gekozen team: zijn track).
 */
export function taskPoints(game: GamePackage, tracks: readonly number[], title: (id: string) => string): TaskPoint[] {
  const out: TaskPoint[] = [];
  for (const task of game.tasks) {
    const label = task.mapLabel ?? '';
    if (task.location) out.push({ id: task.id, title: title(task.id), label, ...task.location });
    for (const track of tracks) {
      const loc = task.trackLocations?.[track];
      if (loc) out.push({ id: task.id, title: title(task.id), label, ...loc, track });
    }
  }
  return out;
}

/** Kaartuitsnede [west, zuid, oost, noord] rond een set punten. */
export function boundsOf(points: readonly LatLng[]): [number, number, number, number] | undefined {
  if (points.length === 0) return undefined;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [w, s, e, n];
}
