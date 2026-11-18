import { describe, expect, it } from 'vitest';
import { computeState } from '../src/engine.js';
import { composeGame } from '../src/layers.js';
import { codeView, rank, hiddenPieces, routeDistance, summarizeTeam } from '../src/stats.js';
import type { TeamState } from '../src/types.js';
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

describe('foto stukje voor stukje (extractiepunt)', () => {
  const puzzles = ['p1', 'p2', 'p3'];
  const withReveal = (pieces: { task: string; x: number; y: number; w: number; h: number }[]) => {
    const base = JSON.parse(JSON.stringify(theHuntBase)) as typeof theHuntBase;
    const ids = base.tasks.map((t) => t.id);
    const real = pieces.map((p, i) => ({ ...p, task: p.task.startsWith('p') ? ids[i]! : p.task }));
    base.playgrounds.find((p) => p.id === 'extractiepunt')!.reveal = { image: 'https://example.org/gps.jpg', width: 1440, height: 6500, pieces: real };
    return { base, ids: real.map((p) => p.task) };
  };
  const stateWith = (correct: string[], wrong: string[] = []) =>
    ({
      tasks: Object.fromEntries([...correct.map((id) => [id, { correct: true }]), ...wrong.map((id) => [id, { correct: false }])]),
    }) as unknown as TeamState;

  it('dekt alleen de vakken af van opdrachten die nog niet goed zijn', () => {
    const { base, ids } = withReveal(puzzles.map((task, i) => ({ task, x: 40 + i * 440, y: 880, w: 440, h: 420 })));
    const game = composeGame(base, [leeuwarden], { id: 'lwd', version: 1 });
    expect(hiddenPieces(game, stateWith([]), 'extractiepunt')).toHaveLength(3);
    const left = hiddenPieces(game, stateWith([ids[0]!], [ids[1]!]), 'extractiepunt');
    expect(left.map((p) => p.task)).toEqual([ids[1], ids[2]]);
    expect(hiddenPieces(game, stateWith(ids), 'extractiepunt')).toEqual([]);
    expect(hiddenPieces(game, stateWith([]), 'speluitleg')).toEqual([]);
  });

  it('weigert een onbekende opdracht of een vak buiten de foto', () => {
    const { base } = withReveal([
      { task: 'bestaat-niet', x: 0, y: 0, w: 10, h: 10 },
      { task: 'p', x: 1400, y: 0, w: 100, h: 10 },
    ]);
    expect(() => composeGame(base, [leeuwarden], { id: 'x', version: 1 })).toThrow(/onbekende opdracht bestaat-niet[\s\S]*vak 2 valt buiten de foto/);
  });
});

describe('GPS-code in vakjes (extractiepunt)', () => {
  const withCode = () => {
    const base = JSON.parse(JSON.stringify(theHuntBase)) as typeof theHuntBase;
    const ids = base.tasks.map((t) => t.id);
    base.playgrounds.find((p) => p.id === 'extractiepunt')!.code = {
      boxes: [
        { task: ids[0]!, value: '53.' },
        { task: ids[1]!, value: '201' },
        { task: ids[2]!, value: '895' },
      ],
      hint: ids[3]!,
    };
    base.overridable.push({ target: { game: 'playgroundCodes' }, layers: ['city'] });
    return { base, ids };
  };
  const state = (tasks: Record<string, { correct?: boolean; status?: string }>) => ({ tasks }) as unknown as TeamState;

  it('opent een vakje als de opdracht goed is en het hintveld als de hint verschijnt', () => {
    const { base, ids } = withCode();
    const game = composeGame(base, [leeuwarden], { id: 'lwd', version: 1 });
    const none = codeView(game, state({ [ids[3]!]: { status: 'hidden' } }), 'extractiepunt')!;
    expect(none.boxes).toEqual([null, null, null]);
    expect(none.hint).toEqual({ open: false });
    const some = codeView(game, state({ [ids[0]!]: { correct: true }, [ids[1]!]: { correct: false }, [ids[3]!]: { status: 'visible' } }), 'extractiepunt')!;
    expect(some.boxes).toEqual(['53.', null, null]);
    expect(some.hint).toEqual({ open: true, text: game.tasks.find((t) => t.id === ids[3])!.body });
    expect(codeView(game, state({}), 'speluitleg')).toBeNull();
  });

  it('een stad vult haar eigen code in; lege vakjes houden die van het basisspel', () => {
    const { base, ids } = withCode();
    const city = { ...leeuwarden, overrides: [...leeuwarden.overrides, { target: { game: 'playgroundCodes' as const }, value: { extractiepunt: ['41.', '', '002'] } }] };
    const game = composeGame(base, [city], { id: 'x', version: 1 });
    const all = codeView(game, state(Object.fromEntries(ids.slice(0, 3).map((id) => [id, { correct: true }]))), 'extractiepunt')!;
    expect(all.boxes).toEqual(['41.', '201', '002']);
  });

  it('weigert een vakje bij een onbekende opdracht', () => {
    const { base } = withCode();
    base.playgrounds.find((p) => p.id === 'extractiepunt')!.code!.boxes[1]!.task = 'bestaat-niet';
    expect(() => composeGame(base, [leeuwarden], { id: 'x', version: 1 })).toThrow(/vakje 2 hoort bij onbekende opdracht bestaat-niet/);
  });
});
