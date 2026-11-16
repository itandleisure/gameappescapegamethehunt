import { describe, expect, it } from 'vitest';
import { computeState } from '../src/engine.js';
import { composeGame } from '../src/layers.js';
import { rank, routeDistance, summarizeTeam } from '../src/stats.js';
import { leeuwarden, leeuwardenPoints, LWD, offset, theHuntBase } from './fixtures/the-hunt.js';
import { min, Script, T0 } from './helpers.js';

const walk = (meters: number[], accuracy = 8) =>
  meters.map((north, i) => ({ ...offset(LWD, north, 0), accuracy, at: min(i) }));

describe('afstand', () => {
  it('telt de gelopen route op', () => {
    expect(routeDistance(walk([0, 60, 120, 180]))).toBeCloseTo(180, 0);
  });

  it('negeert stilstaan, onnauwkeurige metingen en sprongen', () => {
    const fixes = [
      ...walk([0, 2, -1, 3, 1]), // stilstaan met ruis
      { ...offset(LWD, 900, 0), accuracy: 8, at: min(5) + 5000 }, // sprong van 900 m in 5 s
      { ...offset(LWD, 300, 0), accuracy: 60, at: min(6) }, // onnauwkeurig
      { ...offset(LWD, 100, 0), accuracy: 10, at: min(7) },
    ];
    expect(routeDistance(fixes)).toBeCloseTo(100, 0);
  });
});

describe('samenvatting en ranglijst', () => {
  const game = composeGame(theHuntBase, [leeuwarden], { id: 'lwd', version: 1 });

  it('vat een team samen voor resultaten en fotoboek', () => {
    const s = new Script()
      .reach(0.5, 'start', leeuwardenPoints.start)
      .ok(0.7, 'start')
      .hint(36, 'fotomissie', 0)
      .answer(36.5, 'fotomissie', { type: 'photo', photoId: 'foto-team-1' });
    const state = computeState(game, { track: 1, startedAt: T0 }, s.events, min(90));
    const summary = summarizeTeam(game, T0, state, walk([0, 100, 200]));
    expect(summary).toMatchObject({
      ending: 'tijd-op',
      durationMs: 75 * 60_000,
      answered: 1,
      correct: 1,
      photos: [{ task: 'fotomissie', photoId: 'foto-team-1' }],
    });
    expect(summary.distanceMeters).toBe(200);
  });

  it('rangschikt op score en bij gelijke score op tijd', () => {
    const r = rank([
      { name: 'A', score: 1200, durationMs: 70 },
      { name: 'B', score: 1900, durationMs: 63 },
      { name: 'C', score: 1200, durationMs: 65 },
      { name: 'D', score: 1200, durationMs: 65 },
    ]);
    expect(r.map((t) => `${t.rank}${t.name}`)).toEqual(['1B', '2C', '2D', '4A']);
  });
});
