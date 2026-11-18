import { composeGame } from '@hunt/engine';
import { describe, expect, it } from 'vitest';
import { leeuwarden, parteon, theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { parseGameFile } from '../src/lib/game-import.js';
import { formatInZone, validateSession, zonedToUtc } from '../src/lib/sessions.js';

describe('spelpakket importeren', () => {
  it('accepteert een samengesteld spel', () => {
    const game = composeGame(theHuntBase, [leeuwarden], { id: 'the-hunt-leeuwarden', version: 1 });
    const result = parseGameFile(JSON.stringify(game));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.slug).toBe('the-hunt-leeuwarden');
      expect(result.bundle.variants).toEqual([]);
      expect(result.bundle.base).not.toHaveProperty('version');
    }
  });

  it('accepteert een bundel met basisspel, stad en klant', () => {
    const result = parseGameFile(JSON.stringify({ base: theHuntBase, variants: [leeuwarden, parteon] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle.variants.map((v) => v.id)).toEqual([leeuwarden.id, parteon.id]);
  });

  it('weigert een variant die een niet-aanpasbaar veld wijzigt', () => {
    const bad = { ...leeuwarden, overrides: [{ target: { task: 'puzzel-tangram', field: 'points' }, value: 1 }] };
    const result = parseGameFile(JSON.stringify({ base: theHuntBase, variants: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('weigert geen JSON, een verkeerde standaardtaal en kapotte verwijzingen', () => {
    expect(parseGameFile('{niet')).toEqual({ ok: false, errors: ['Dit is geen geldig JSON-bestand.'] });
    const game = composeGame(theHuntBase, [leeuwarden], { id: 'the-hunt-leeuwarden', version: 1 });
    const wrongLang = parseGameFile(JSON.stringify({ ...game, defaultLanguage: 'de' }));
    expect(wrongLang.ok).toBe(false);
    const broken = parseGameFile(JSON.stringify({ ...game, sequences: [{ id: 'x', tasks: ['bestaat-niet'] }] }));
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.errors.join(' ')).toContain('bestaat-niet');
  });
});

describe('sessies', () => {
  it('controleert de invoer', () => {
    const ok = { name: 'Bedrijfsuitje', gameVersionId: 'v1', startsAt: '', timezone: 'Europe/Amsterdam', trackCount: 5, testMode: false };
    expect(validateSession(ok)).toEqual([]);
    expect(validateSession({ ...ok, name: ' ', trackCount: 0, gameVersionId: '' })).toHaveLength(3);
    expect(validateSession({ ...ok, joinCode: 'HUNT1' })).toEqual([]);
    expect(validateSession({ ...ok, joinCode: 'HUNT 1' })).toHaveLength(1);
  });

  it('rekent lokale tijd om naar UTC, ook in de zomertijd', () => {
    expect(zonedToUtc('2026-11-21T14:00', 'Europe/Amsterdam')).toBe('2026-11-21T13:00:00.000Z');
    expect(zonedToUtc('2026-07-01T14:00', 'Europe/Amsterdam')).toBe('2026-07-01T12:00:00.000Z');
    expect(zonedToUtc('2026-07-01T14:00', 'Europe/Lisbon')).toBe('2026-07-01T13:00:00.000Z');
    expect(formatInZone('2026-11-21T13:00:00.000Z', 'Europe/Amsterdam')).toContain('14:00');
  });
});
