import { describe, expect, it } from 'vitest';
import { theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { finishPoint, gatherAt, iconPins, pinKey, puzzleChoice, puzzles, startPoint } from '../src/lib/city-setup.js';
import type { Pin } from '../src/lib/map-edit.js';

const pin = (key: string, track: number | null, editable = true): Pin => ({
  key,
  track,
  label: '',
  logo: false,
  flag: false,
  title: key,
  location: { lat: 53.2, lng: 5.8, radius: 10 },
  editable,
  own: true,
});

describe('stappenplan stad inrichten', () => {
  it('laat de finish en vaste iconen buiten stap 4', () => {
    const list = [pin('extractie-finish', null), pin('extractie-a', null), pin('extractie-b', null), pin('lokaal-1', 2), pin('uitleg-01', null, false)];
    expect(iconPins(list).map(pinKey)).toEqual(['extractie-b|', 'lokaal-1|2']);
  });

  it('legt de iconen rond de start, met hun eigen straal', () => {
    const start = { lat: 52, lng: 5 };
    const out = gatherAt([pin('lokaal-1', 1), pin('lokaal-1', 2)], start);
    expect(out['lokaal-1|1']!.radius).toBe(10);
    expect(out['lokaal-1|1']).not.toEqual({ ...start, radius: 10 });
    expect(Math.abs(out['lokaal-1|2']!.lat - start.lat)).toBeLessThan(0.001);
  });

  it('leest start, finish en puzzels', () => {
    expect(startPoint({ start: { lat: 1, lng: 2 } })).toEqual({ lat: 1, lng: 2 });
    expect(startPoint({})).toBeNull();
    const game = { ...theHuntBase, version: 0 };
    expect(finishPoint(game)).not.toBeNull();
    const keys = puzzles(game).map((p) => p.key);
    expect(keys.length).toBeGreaterThan(0);
    const choice = puzzleChoice({ puzzles: { [keys[0]!]: false } }, game);
    expect(choice[keys[0]!]).toBe(false);
    expect(Object.values(choice).filter(Boolean)).toHaveLength(keys.length - 1);
  });
});
