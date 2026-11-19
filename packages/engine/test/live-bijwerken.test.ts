/**
 * Lopende spellen live bijwerken: een team speelt op versie 1, de beheerder
 * verplaatst een locatie en zet de hunt over op versie 2. De voortgang blijft.
 */
import { describe, expect, it } from 'vitest';
import { computeState } from '../src/engine.js';
import { composeGame } from '../src/layers.js';
import type { GamePackage } from '../src/types.js';
import { leeuwarden, leeuwardenPoints as P, theHuntBase } from './fixtures/the-hunt.js';
import { min, Script, T0 } from './helpers.js';

const v1 = composeGame(theHuntBase, [leeuwarden], { id: 'the-hunt-leeuwarden', version: 1 });
const team = { track: 3, startedAt: T0 };

/** Versie 2: de startlocatie ligt ~500 m verderop. */
function movedStart(publishedAt?: number): GamePackage {
  return {
    ...v1,
    version: 2,
    ...(publishedAt !== undefined ? { publishedAt } : {}),
    tasks: v1.tasks.map((t) => (t.id === 'start' && t.location ? { ...t, location: { ...t.location, lat: t.location.lat + 0.0045 } } : t)),
  };
}

describe('lopend spel live bijwerken', () => {
  const s = new Script().reach(0.5, 'start', P.start).ok(0.7, 'start');

  it('houdt een aankomst van vóór de update, ook als de locatie verplaatst is', () => {
    const before = computeState(v1, team, s.events, min(10));
    const after = computeState(movedStart(min(5)), team, s.events, min(10));
    expect(after.rejected).toEqual([]);
    expect(after.tasks['start']).toEqual(before.tasks['start']);
    expect(after.score).toBe(before.score);
  });

  it('keurt een nieuwe aankomst op de oude plek af', () => {
    const late = new Script().reach(6, 'start', P.start);
    const after = computeState(movedStart(min(5)), team, late.events, min(10));
    expect(after.rejected.map((r) => r.reason)).toContain('buiten de straal');
  });

  it('zonder publicatietijd blijft alles zoals het was', () => {
    const after = computeState(movedStart(), team, s.events, min(10));
    expect(after.rejected.map((r) => r.reason)).toContain('buiten de straal');
  });
});
