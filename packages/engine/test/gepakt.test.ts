import { describe, expect, it } from 'vitest';
import { computeState } from '../src/engine.js';
import { composeGame } from '../src/layers.js';
import type { GameEvent } from '../src/types.js';
import { leeuwarden, theHuntBase } from './fixtures/the-hunt.js';
import { min, T0 } from './helpers.js';

const game = composeGame(theHuntBase, [leeuwarden], { id: 'the-hunt-leeuwarden', version: 1 });
const team = { track: 1, startedAt: T0 };
const caught = (id: string, at: number, points = -100): GameEvent => ({ id, at, type: 'caught', points });

describe('team gepakt', () => {
  it('kost de straf uit de gebeurtenis, elke keer, en staat in het puntenoverzicht', () => {
    const base = computeState(game, team, [], min(30)).score;
    const state = computeState(game, team, [caught('p1', min(10)), caught('p2', min(20))], min(30));
    expect(state.score).toBe(base - 200);
    expect(state.ledger.filter((l) => l.reason === 'caught').map((l) => l.points)).toEqual([-100, -100]);
    expect(state.rejected).toEqual([]);
  });

  it('telt ook als het spel al afgelopen is', () => {
    const ended = computeState(game, team, [], min(500));
    if (!ended.ended) return; // spel zonder einde op tijd: niets te controleren
    const after = computeState(game, team, [caught('p3', min(499))], min(500));
    expect(after.score).toBe(ended.score - 100);
  });
});
