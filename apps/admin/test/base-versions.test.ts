import { describe, expect, it } from 'vitest';
import { leeuwarden, theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { baseToRows, variantToRows } from '../src/lib/game-model.js';
import { composeChain, snapshotToLayer, versionLabel, versionTitle } from '../src/lib/game-store.js';

const json = (v: unknown) => JSON.parse(JSON.stringify(v));
const baseRows = baseToRows(theHuntBase, { id: 'base', slug: 'the-hunt' });
const cityRows = variantToRows(
  leeuwarden,
  { id: 'lwd', slug: leeuwarden.id, parent_id: 'base', languages: ['nl', 'en'], default_language: 'nl' },
  (k) => k,
);

describe('versies van het basisspel', () => {
  it('een stad op een vastgezette versie speelt hetzelfde als op het basisspel van toen', () => {
    // Zo komt de versie uit de database: als JSON, met base_version erbij.
    const snapshot = snapshotToLayer(json({ ...baseRows, game: { ...baseRows.game, base_version: 3 } }));
    expect(snapshot.game.base_version).toBeNull();
    expect(json(composeChain([snapshot, cityRows]))).toEqual(json(composeChain([baseRows, cityRows])));
  });

  it('vult lijsten aan die in een oudere versie nog niet bestonden', () => {
    const { playgrounds: _p, rules: _r, ...old } = json(baseRows);
    const snapshot = snapshotToLayer(old);
    expect(snapshot.playgrounds).toEqual([]);
    expect(snapshot.rules).toEqual([]);
  });
});

describe('naam van een templateversie', () => {
  it('toont de eigen naam, en anders "Template v{n}"', () => {
    expect(versionTitle({ version: 2, name: 'Nederland' })).toBe('Nederland');
    expect(versionTitle({ version: 2, name: null })).toBe('Template v2');
    expect(versionTitle({ version: 3, name: '  ' })).toBe('Template v3');
  });

  it('zet in keuzelijsten het nummer achter de naam', () => {
    expect(versionLabel({ version: 3, name: 'Internationaal – Spanje/Frankrijk' })).toBe('Internationaal – Spanje/Frankrijk (v3)');
    expect(versionLabel({ version: 1, name: null })).toBe('Template v1');
  });
});
