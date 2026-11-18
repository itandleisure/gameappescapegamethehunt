import { describe, expect, it } from 'vitest';
import { boundaryGeoJson, insertPoint, movePoint, rectAround, removePoint } from '../src/lib/boundary.js';

const p = (lat: number, lng: number) => ({ lat, lng });

describe('speelveldgrens', () => {
  it('voegt de eerste punten achteraan toe', () => {
    expect(insertPoint([p(0, 0), p(0, 1)], p(1, 1))).toEqual([p(0, 0), p(0, 1), p(1, 1)]);
  });

  it('zet een nieuw punt op de dichtstbijzijnde zijde', () => {
    // Vierkant 0,0 → 0,1 → 1,1 → 1,0; een punt net onder de zuidzijde komt tussen de eerste twee.
    const square = [p(0, 0), p(0, 0.01), p(0.01, 0.01), p(0.01, 0)];
    expect(insertPoint(square, p(-0.001, 0.005))).toEqual([p(0, 0), p(-0.001, 0.005), p(0, 0.01), p(0.01, 0.01), p(0.01, 0)]);
    // Een punt links van de westzijde komt tussen het laatste en het eerste punt.
    expect(insertPoint(square, p(0.005, -0.001)).at(-1)).toEqual(p(0.005, -0.001));
  });

  it('verplaatst en verwijdert punten', () => {
    expect(movePoint([p(0, 0), p(1, 1)], 1, p(2.1234567, 3))).toEqual([p(0, 0), p(2.123457, 3)]);
    expect(removePoint([p(0, 0), p(1, 1), p(2, 2)], 1)).toEqual([p(0, 0), p(2, 2)]);
  });

  it('maakt een rechthoek om de locaties', () => {
    const r = rectAround([p(53.2, 5.79), p(53.21, 5.8)], 0);
    expect(r).toEqual([p(53.21, 5.79), p(53.21, 5.8), p(53.2, 5.8), p(53.2, 5.79)]);
    expect(rectAround([])).toEqual([]);
    const m = rectAround([p(53.2, 5.79)], 111.32);
    expect(m[0]!.lat).toBeCloseTo(53.201, 6);
  });

  it('sluit de lijn voor de kaart', () => {
    expect(boundaryGeoJson(null).features).toHaveLength(0);
    const g = boundaryGeoJson({ points: [p(0, 0), p(0, 1), p(1, 1)] });
    expect(g.features[0]!.geometry.coordinates).toEqual([[0, 0], [1, 0], [1, 1], [0, 0]]);
  });
});
