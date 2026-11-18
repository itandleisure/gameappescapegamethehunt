import { composeGame } from '@hunt/engine';
import { describe, expect, it } from 'vitest';
import { amsterdam, leeuwarden, parteon, theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { baseToRows, rowsToBase, rowsToVariant, variantToRows } from '../src/lib/game-model.js';

const json = (v: unknown) => JSON.parse(JSON.stringify(v));
const baseRows = baseToRows(theHuntBase, { id: 'base', slug: 'the-hunt' });
const variantRows = (v: typeof leeuwarden, parent: string) =>
  variantToRows(v, { id: v.id, slug: v.id, parent_id: parent, languages: ['nl', 'en'], default_language: 'nl' }, (k) => k);

describe('spelmodel in de database', () => {
  it('slaat het basisspel op en leest het ongewijzigd terug', () => {
    expect(json(rowsToBase(baseRows))).toEqual(json(theHuntBase));
    // Alle teksten staan in translations, niet in de opdrachten zelf.
    expect(JSON.stringify(baseRows.tasks)).not.toContain('"nl"');
  });

  it('bewaart de speelveldgrens in de spelinstellingen', () => {
    const base = json(theHuntBase);
    base.boundary = { points: [{ lat: 53.2, lng: 5.79 }, { lat: 53.21, lng: 5.8 }, { lat: 53.2, lng: 5.81 }], color: '#ff0000' };
    const rows = baseToRows(base, { id: 'base', slug: 'the-hunt' });
    expect((rows.game.settings as { boundary?: unknown }).boundary).toEqual(base.boundary);
    expect(rowsToBase(rows).boundary).toEqual(base.boundary);
  });

  it('bewaart de foto bij een opdracht in de instellingen van de opdracht', () => {
    const base = json(theHuntBase);
    base.tasks[0].image = 'https://example.org/foto.jpg';
    const rows = baseToRows(base, { id: 'base', slug: 'the-hunt' });
    expect(rows.tasks[0]!.settings).toEqual({ image: 'https://example.org/foto.jpg' });
    expect(rowsToBase(rows).tasks[0]!.image).toBe('https://example.org/foto.jpg');
  });

  it('bewaart tabbladen met naslagtekst, foto met vakken en nummers in kaarticonen', () => {
    const base = json(theHuntBase);
    const ids = base.tasks.map((t: { id: string }) => t.id);
    base.tasks[0].mapLabel = '1';
    base.playgrounds[0].reveal = { image: 'https://example.org/gps.png', width: 1440, height: 6500, pieces: [{ task: ids[1], x: 40, y: 880, w: 440, h: 420 }] };
    base.playgrounds[1].body = { nl: 'Tijdlijn', en: 'Timeline' };
    const rows = baseToRows(base, { id: 'base', slug: 'the-hunt' });
    expect(rows.game.settings.playgroundReveal).toEqual({ [base.playgrounds[0].id]: base.playgrounds[0].reveal });
    expect(json(rowsToBase(rows))).toEqual(base);
  });

  it('bewaart afbeeldingen bij hints op hun plek', () => {
    const base = json(theHuntBase);
    const task = base.tasks.find((t: { hints: unknown[] }) => t.hints.length >= 2);
    task.hints[1].image = 'https://example.org/hint2.jpg';
    const rows = baseToRows(base, { id: 'base', slug: 'the-hunt' });
    const row = rows.tasks.find((t) => t.key === task.id)!;
    expect((row.settings!.hintImages as unknown[])[0]).toBeNull();
    const back = rowsToBase(rows).tasks.find((t) => t.id === task.id)!;
    expect(back.hints[1]!.image).toBe('https://example.org/hint2.jpg');
    expect(back.hints[0]!.image).toBeUndefined();
  });

  it('stadsvariant en klantvariant geven hetzelfde gepubliceerde spel', () => {
    const base = rowsToBase(baseRows);
    for (const variants of [[leeuwarden], [amsterdam], [leeuwarden, parteon]]) {
      const expected = composeGame(theHuntBase, variants, { id: 'x', version: 1 });
      const fromRows = variants.map((v, i) => rowsToVariant(variantRows(v, i === 0 ? 'base' : variants[0]!.id), baseRows));
      expect(json(composeGame(base, fromRows, { id: 'x', version: 1 }))).toEqual(json(expected));
    }
  });

  it('zet locaties van een stad in task_locations en teksten in translations', () => {
    const rows = variantRows(leeuwarden, 'base');
    expect(rows.locations.some((l) => l.task_id === 'start' && l.track === null)).toBe(true);
    expect(rows.locations.some((l) => l.track !== null)).toBe(true);
    expect(rows.translations.some((t) => t.field === 'body' && t.entity_id === 'lokaal-1')).toBe(true);
    expect(rows.overrides.some((o) => o.field === 'meetingPoint')).toBe(true);
  });
});
