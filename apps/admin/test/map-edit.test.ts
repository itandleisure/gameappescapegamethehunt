import { composeGame } from '@hunt/engine';
import { describe, expect, it } from 'vitest';
import { leeuwarden, parteon, theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { baseToRows, variantToRows } from '../src/lib/game-model.js';
import { allPins, circle, pinsFor, trackCount, trackColor } from '../src/lib/map-edit.js';

const base = baseToRows(theHuntBase, { id: 'base', slug: 'the-hunt' });
const meta = (slug: string, parent: string) => ({ id: slug, slug, parent_id: parent, languages: ['nl', 'en'], default_language: 'nl' });
const city = variantToRows(leeuwarden, meta('leeuwarden', 'base'), (k) => k);
const client = variantToRows(parteon, meta('parteon', 'leeuwarden'), (k) => k);
const game = composeGame(theHuntBase, [leeuwarden], { id: 'x', version: 1 });

describe('kaarteditor', () => {
  it('telt de tracks', () => expect(trackCount(game)).toBe(5));

  it('basisspel mag alles verplaatsen, een stad alleen aanpasbare locaties, een klant niets', () => {
    expect(pinsFor([base], game, null, (k) => k).every((p) => p.editable)).toBe(true);
    const cityPins = pinsFor([base, city], game, null, (k) => k);
    expect(cityPins.find((p) => p.key === 'start')).toMatchObject({ editable: true, own: true });
    expect(cityPins.find((p) => p.key === 'puzzel-tangram')?.editable).toBe(false);
    const track = pinsFor([base, city], game, 2, (k) => k).find((p) => p.key === 'lokaal-1');
    expect(track).toMatchObject({ editable: true, own: true });
    expect(track?.location).not.toBeNull();
    expect(pinsFor([base, city, client], game, null, (k) => k).some((p) => p.editable)).toBe(false);
  });

  it('tekent een gesloten cirkel van de juiste grootte', () => {
    const c = circle(53.2, 5.79, 100);
    expect(c[0]).toEqual(c[c.length - 1]);
    const [lng] = c[0]!;
    expect(Math.abs(lng - 5.79) * 111_320 * Math.cos((53.2 * Math.PI) / 180)).toBeCloseTo(100, 0);
  });

  it('toont alle tracks tegelijk, elk met een eigen kleur', () => {
    const pins = allPins([base], game, (k) => k);
    const tracks = new Set(pins.map((p) => p.track));
    expect(tracks.has(null)).toBe(true);
    expect(tracks.size).toBeGreaterThan(2);
    expect(pins.every((p) => p.location)).toBe(true);
    expect(new Set([null, 1, 2, 3, 4, 5].map(trackColor)).size).toBe(6);
  });
});
