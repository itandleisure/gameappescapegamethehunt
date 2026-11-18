import { describe, expect, it } from 'vitest';
import { ago, buildTrails, isStale, teamColor, trailsGeoJson, TEAM_COLORS, type PositionRow } from '../src/lib/live-map.js';

const T = Date.parse('2026-11-14T10:00:00Z');
const at = (s: number) => new Date(T + s * 1000).toISOString();
// ~11 m per 0.0001 graad noorderbreedte
const pos = (team: string, s: number, north: number, accuracy = 8): PositionRow => ({
  team_id: team,
  lat: 53.2 + north * 0.0001,
  lng: 5.8,
  accuracy,
  recorded_at: at(s),
});

describe('live kaart', () => {
  it('tekent de gelopen route per team, zonder onnauwkeurige metingen', () => {
    const trails = buildTrails([pos('a', 20, 2), pos('a', 0, 0), pos('a', 10, 1), pos('a', 15, 50, 80), pos('b', 0, 0)]);
    const a = trails.get('a')!;
    expect(a.coordinates).toHaveLength(3);
    expect(a.coordinates[0]![1]).toBeCloseTo(53.2);
    expect(a.last!.at).toBe(T + 20_000);
    expect(a.distanceM).toBeGreaterThan(15);
    expect(trails.get('b')!.coordinates).toHaveLength(1);
  });

  it('laat de nieuwste positie zien, ook als die onnauwkeurig is', () => {
    const trails = buildTrails([pos('a', 0, 0), pos('a', 30, 5, 60)]);
    expect(trails.get('a')!.last!.accuracy).toBe(60);
  });

  it('voegt stapjes bij stilstaan samen', () => {
    const trails = buildTrails([pos('a', 0, 0), pos('a', 5, 0.1), pos('a', 10, 0.15), pos('a', 15, 3)]);
    expect(trails.get('a')!.coordinates).toHaveLength(2);
  });

  it('kan de route beperken tot de laatste minuten', () => {
    const trails = buildTrails([pos('a', 0, 0), pos('a', 600, 10), pos('a', 900, 20)], { since: T + 500_000 });
    expect(trails.get('a')!.coordinates).toHaveLength(2);
  });

  it('maakt één lijn per team met zijn kleur', () => {
    const trails = buildTrails([pos('a', 0, 0), pos('a', 10, 1), pos('b', 0, 0)]);
    const geo = trailsGeoJson(
      [
        { id: 'a', name: 'Alfa', track: 1, color: teamColor(0) },
        { id: 'b', name: 'Bravo', track: 2, color: teamColor(1) },
      ],
      trails,
    );
    expect(geo.features).toHaveLength(1);
    expect(geo.features[0]!.properties.color).toBe(TEAM_COLORS[0]);
  });

  it('zegt hoe oud een positie is', () => {
    expect(ago(T, T + 5_000)).toBe('zojuist');
    expect(ago(T, T + 45_000)).toBe('45 s geleden');
    expect(ago(T, T + 180_000)).toBe('3 min geleden');
    expect(ago(T, T + 65 * 60_000)).toBe('1 u 5 min geleden');
    expect(isStale(T, T + 60_000)).toBe(false);
    expect(isStale(T, T + 3 * 60_000)).toBe(true);
  });
});
