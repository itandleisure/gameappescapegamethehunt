import { describe, expect, it } from 'vitest';
import { estimateClockOffset, toServerTime } from '../src/clock.js';
import { distanceMeters, LocationGate } from '../src/geo.js';
import { LWD, offset } from './fixtures/the-hunt.js';

const target = { task: 't', location: { ...LWD, radius: 20 } };
const fix = (north: number, accuracy: number, at: number) => ({ ...offset(LWD, north, 0), accuracy, at });

describe('GPS', () => {
  it('berekent afstanden in meters', () => {
    expect(distanceMeters(LWD, offset(LWD, 100, 0))).toBeCloseTo(100, 0);
    expect(distanceMeters(LWD, offset(LWD, 0, 250))).toBeCloseTo(250, 0);
  });

  it('opent pas na twee opeenvolgende goede metingen binnen de cirkel', () => {
    const gate = new LocationGate();
    expect(gate.feed(fix(5, 8, 0), [target])).toEqual([]);
    expect(gate.feed(fix(6, 8, 1000), [target])).toEqual(['t']);
    // daarna niet opnieuw zolang het team er blijft
    expect(gate.feed(fix(4, 8, 2000), [target])).toEqual([]);
  });

  it('negeert een sprong in het signaal', () => {
    const gate = new LocationGate();
    expect(gate.feed(fix(5, 8, 0), [target])).toEqual([]);
    expect(gate.feed(fix(80, 8, 1000), [target])).toEqual([]); // sprong naar buiten reset de teller
    expect(gate.feed(fix(5, 8, 2000), [target])).toEqual([]);
    expect(gate.feed(fix(5, 8, 3000), [target])).toEqual(['t']);
  });

  it('telt metingen met slechte nauwkeurigheid niet mee', () => {
    const gate = new LocationGate();
    expect(gate.feed(fix(0, 50, 0), [target])).toEqual([]);
    expect(gate.feed(fix(0, 50, 1000), [target])).toEqual([]);
    expect(gate.feed(fix(0, 12, 2000), [target])).toEqual([]);
    expect(gate.feed(fix(0, 45, 3000), [target])).toEqual([]); // reset niets
    expect(gate.feed(fix(0, 12, 4000), [target])).toEqual(['t']);
  });

  it('opent ook na een paar seconden binnen de cirkel', () => {
    const gate = new LocationGate({ requiredFixes: 10, dwellMs: 3000 });
    expect(gate.feed(fix(0, 10, 0), [target])).toEqual([]);
    expect(gate.feed(fix(0, 10, 3000), [target])).toEqual(['t']);
  });

  it('kan opnieuw openen na het verlaten van de cirkel', () => {
    const gate = new LocationGate({ requiredFixes: 1 });
    expect(gate.feed(fix(0, 5, 0), [target])).toEqual(['t']);
    gate.feed(fix(25, 5, 1000), [target]); // net buiten, binnen de marge
    expect(gate.feed(fix(0, 5, 2000), [target])).toEqual([]);
    gate.feed(fix(60, 5, 3000), [target]); // echt weg
    expect(gate.feed(fix(0, 5, 4000), [target])).toEqual(['t']);
  });
});

describe('klokcorrectie', () => {
  it('schat het verschil met de servertijd en negeert trage metingen', () => {
    const offset = estimateClockOffset([
      { sentAt: 1000, serverTime: 6050, receivedAt: 1100 },
      { sentAt: 2000, serverTime: 7040, receivedAt: 2080 },
      { sentAt: 3000, serverTime: 9000, receivedAt: 5000 }, // traag
    ]);
    expect(offset).toBeGreaterThan(4990);
    expect(offset).toBeLessThan(5010);
    expect(toServerTime(10_000, offset)).toBeCloseTo(15_000, -2);
    expect(estimateClockOffset([])).toBe(0);
  });
});

describe('speelveldgrens met bochten', () => {
  it('schrijft een bocht uit tot korte stukjes die door het stuurpunt worden getrokken', async () => {
    const { boundaryPath, boundaryGeoJson, curvePoint } = await import('../src/geo.js');
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 1 };
    const c = { lat: 1, lng: 0.5 };
    const straight = boundaryPath({ points: [a, b, { lat: 1, lng: 1 }] });
    expect(straight).toHaveLength(3);
    const curved = boundaryPath({ points: [{ ...a, curve: c }, b, { lat: 1, lng: 1 }] });
    expect(curved).toHaveLength(3 + 15);
    expect(curvePoint(a, c, b, 0.5)).toEqual({ lat: 0.5, lng: 0.5 });
    expect(curved).toContainEqual({ lat: 0.5, lng: 0.5 });
    const geo = boundaryGeoJson({ points: [{ ...a, curve: c }, b, { lat: 1, lng: 1 }] });
    const coords = geo.features[0]!.geometry.coordinates;
    expect(coords.at(-1)).toEqual(coords[0]);
  });
});

describe('laag buiten het speelveld', () => {
  const ringArea = (r: number[][]) => {
    let a = 0;
    for (let i = 0; i < r.length - 1; i++) a += r[i]![0]! * r[i + 1]![1]! - r[i + 1]![0]! * r[i]![1]!;
    return a;
  };

  it('maakt de wereld met het speelveld als gat, ongeacht de tekenrichting', async () => {
    const { boundaryMaskGeoJson } = await import('../src/geo.js');
    const square = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 0 }];
    for (const points of [square, [...square].reverse()]) {
      const geo = boundaryMaskGeoJson({ points });
      const [outer, hole] = geo.features[0]!.geometry.coordinates;
      expect(ringArea(outer!)).toBeGreaterThan(0);
      expect(ringArea(hole!)).toBeLessThan(0);
      expect(hole!.at(-1)).toEqual(hole![0]);
      expect(hole).toHaveLength(5);
    }
  });

  it('is leeg zonder gesloten grens', async () => {
    const { boundaryMaskGeoJson } = await import('../src/geo.js');
    expect(boundaryMaskGeoJson(null).features).toHaveLength(0);
    expect(boundaryMaskGeoJson({ points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] }).features).toHaveLength(0);
  });

  it('vult kleur en dekking aan met standaardwaarden', async () => {
    const { outsideShade, DEFAULT_OUTSIDE_COLOR, DEFAULT_OUTSIDE_OPACITY } = await import('../src/types.js');
    expect(outsideShade(null)).toEqual({ color: DEFAULT_OUTSIDE_COLOR, opacity: DEFAULT_OUTSIDE_OPACITY });
    expect(outsideShade({ outsideColor: '#000000', outsideOpacity: 0 })).toEqual({ color: '#000000', opacity: 0 });
    expect(outsideShade({ outsideOpacity: 3 }).opacity).toBe(1);
  });
});
