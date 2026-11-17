import { describe, expect, it } from 'vitest';
import type { LayerRows } from '../src/lib/game-model';
import { centerBounds, gameFieldEditable, imageCorners, initialBounds, moveCorner, overlayPath, ownGameField } from '../src/lib/map-settings';

const layer = (l: 'base' | 'city' | 'client', extra: Partial<LayerRows> = {}): LayerRows =>
  ({
    game: { id: l, org_id: 'o', slug: l, layer: l, parent_id: null, languages: ['nl'], default_language: 'nl', settings: {} },
    tasks: [],
    locations: [],
    rules: [],
    playgrounds: [],
    overridable: [],
    overrides: [],
    translations: [],
    ...extra,
  }) as LayerRows;

describe('kaartinstellingen', () => {
  it('basisspel mag alles, een variant alleen wat aanpasbaar is', () => {
    const base = layer('base', { overridable: [{ task_id: null, field: 'mapOverlay', layers: ['city'] }] as LayerRows['overridable'] });
    expect(gameFieldEditable([base], 'meetingPoint')).toBe(true);
    expect(gameFieldEditable([base, layer('city')], 'mapOverlay')).toBe(true);
    expect(gameFieldEditable([base, layer('city')], 'meetingPoint')).toBe(false);
    expect(gameFieldEditable([base, layer('city'), layer('client')], 'mapOverlay')).toBe(false);
  });

  it('weet of de waarde uit de eigen laag komt', () => {
    const base = layer('base');
    base.game.settings = { mapOverlay: { image: 'x', bounds: [] } };
    expect(ownGameField([base], 'mapOverlay')).toBe(true);
    expect(ownGameField([base], 'meetingPoint')).toBe(false);
    const city = layer('city', { overrides: [{ task_id: null, field: 'meetingPoint', value: {} }] as LayerRows['overrides'] });
    expect(ownGameField([base, city], 'meetingPoint')).toBe(true);
  });

  it('maakt een pad in de map van het spel en weigert andere bestanden', () => {
    expect(overlayPath('abc', 'image/png', 5)).toBe('abc/overlay-5.png');
    expect(() => overlayPath('abc', 'application/pdf')).toThrow();
  });

  it('plaatst een overlay met de verhouding van de afbeelding', () => {
    const [nw, se] = initialBounds({ lat: 53.2, lng: 5.8 }, 2000, 1000, 400);
    const height = (nw.lat - se.lat) * 111_320;
    expect(height).toBeCloseTo(200, 0);
    expect((nw.lat + se.lat) / 2).toBeCloseTo(53.2, 5);
    expect((nw.lng + se.lng) / 2).toBeCloseTo(5.8, 5);
    expect(imageCorners([nw, se])[1]).toEqual([se.lng, nw.lat]);
  });

  it('houdt noordwest en zuidoost op hun plek bij slepen en verschuiven', () => {
    const b = moveCorner([{ lat: 2, lng: 1 }, { lat: 1, lng: 2 }], 'nw', { lat: 0, lng: 3 });
    expect(b).toEqual([{ lat: 1, lng: 2 }, { lat: 0, lng: 3 }]);
    expect(centerBounds([{ lat: 2, lng: 1 }, { lat: 1, lng: 2 }], { lat: 10, lng: 10 })).toEqual([
      { lat: 10.5, lng: 9.5 },
      { lat: 9.5, lng: 10.5 },
    ]);
  });
});
