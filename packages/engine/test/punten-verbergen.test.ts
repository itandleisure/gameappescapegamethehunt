import { describe, expect, it } from 'vitest';
import { computeState } from '../src/engine.js';
import { composeGame } from '../src/layers.js';
import { leeuwarden, theHuntBase } from './fixtures/the-hunt.js';
import { min, T0 } from './helpers.js';

// Basisspel met de regel uit de template: na 60 minuten punten verbergen.
const game = composeGame(
  {
    ...theHuntBase,
    rules: [
      ...theHuntBase.rules,
      { id: 'punten-verbergen', label: '60 - Punten verbergen', when: { kind: 'elapsed', minutes: 60 }, then: [{ kind: 'hideScore' }] },
    ],
  },
  [leeuwarden],
  { id: 'the-hunt-leeuwarden', version: 1 },
);
const team = { track: 1, startedAt: T0 };

describe('punten verbergen', () => {
  it('toont de punten tot 60 minuten', () => {
    expect(computeState(game, team, [], min(59)).scoreHiddenAt).toBeUndefined();
  });

  it('verbergt de punten vanaf 60 minuten, maar blijft ze tellen', () => {
    const state = computeState(game, team, [], min(61));
    expect(state.scoreHiddenAt).toBe(min(60));
    expect(typeof state.score).toBe('number');
  });

  it('zonder de regel blijven de punten zichtbaar', () => {
    const plain = composeGame(theHuntBase, [leeuwarden], { id: 'x', version: 1 });
    expect(computeState(plain, team, [], min(80)).scoreHiddenAt).toBeUndefined();
  });
});
