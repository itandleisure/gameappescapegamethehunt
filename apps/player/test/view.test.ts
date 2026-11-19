import { composeGame, computeState } from '@hunt/engine';
import { describe, expect, it } from 'vitest';
import { INTRO, leeuwarden, leeuwardenPoints, PUZZLES, theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { answerFeedback, isAnswerable, isValidPhone, listGroups, mapStyleChoice, puzzleProgress, taskToShow } from '../src/core/view.js';
import { insideStyleUrl, MAP_STYLES } from '@hunt/engine';

const game = composeGame(theHuntBase, [leeuwarden], { id: 'lwd', version: 1 });
const T0 = Date.UTC(2026, 10, 21, 13, 0, 0);
const team = { track: 2, startedAt: T0 };
const at = (s: number) => T0 + s * 1000;
const P = leeuwardenPoints;

describe('schermen', () => {
  it('toont na de startlocatie vanzelf de speluitleg, scherm voor scherm', () => {
    const events = [
      { id: '1', at: at(10), type: 'locationReached' as const, task: 'start', ...P.start, accuracy: 5 },
      { id: '2', at: at(20), type: 'answered' as const, task: 'start', answer: { type: 'info' as const } },
    ];
    let state = computeState(game, team, events.slice(0, 1), at(15));
    expect(taskToShow(game, state)).toBe('start');
    state = computeState(game, team, events, at(25));
    expect(taskToShow(game, state)).toBe(INTRO[0]);
  });

  it('kan een opdracht op de kaart pas openen op locatie', () => {
    const state = computeState(game, team, [], at(1));
    expect(state.tasks.start!.status).toBe('visible');
    expect(isAnswerable(game, team, state, 'start')).toBe(false);
  });

  it('geeft na een antwoord de juiste melding', () => {
    const events = [
      { id: '1', at: at(10), type: 'locationReached' as const, task: 'start', ...P.start, accuracy: 5 },
    ];
    const before = computeState(game, team, events, at(11));
    const after = computeState(game, team, [...events, { id: '2', at: at(12), type: 'answered' as const, task: 'start', answer: { type: 'info' as const } }], at(13));
    expect(answerFeedback(before, after, 'start')).toBe('correct');
    expect(answerFeedback(after, after, 'start')).toBe('rejected');
  });

  it('groepeert de lijst per playground', () => {
    const state = computeState(game, team, [], at(1));
    const groups = listGroups(game, state);
    for (const g of groups) for (const t of g.tasks) expect(state.tasks[t.id]!.status).not.toBe('hidden');
  });

  it('toont geen tabblad met alleen naslag (speluitleg) tussen de opdrachten, en verbergt gelezen uitleg', () => {
    const base = JSON.parse(JSON.stringify(theHuntBase)) as typeof theHuntBase;
    const uitleg = base.playgrounds.find((p) => p.id === 'speluitleg')!;
    uitleg.body = { nl: 'Tijdlijn van het spel' };
    const g = composeGame(base, [leeuwarden], { id: 'lwd', version: 1 });
    const events = [
      { id: '1', at: at(10), type: 'locationReached' as const, task: 'start', ...P.start, accuracy: 5 },
      { id: '2', at: at(20), type: 'answered' as const, task: 'start', answer: { type: 'info' as const } },
    ];
    const state = computeState(g, team, events, at(25));
    const groups = listGroups(g, state);
    expect(groups.some((gr) => gr.playground === 'speluitleg')).toBe(false);
    expect(groups.flatMap((gr) => gr.tasks).map((t) => t.id)).not.toContain('start');
  });

  it('toont opgeloste puzzels als vinkje in de blokjes en haalt ze uit de lijst', () => {
    const base = JSON.parse(JSON.stringify(theHuntBase)) as typeof theHuntBase;
    base.playgrounds.find((p) => p.id === 'extractiepunt')!.code = { boxes: PUZZLES.map((z) => ({ task: z.id, value: '1' })) };
    const g = composeGame(base, [leeuwarden], { id: 'lwd', version: 1 });
    const state = computeState(g, team, [], at(1));
    for (const z of PUZZLES) state.tasks[z.id] = { ...state.tasks[z.id]!, status: 'visible', inList: true };
    state.tasks[PUZZLES[1].id] = { ...state.tasks[PUZZLES[1].id]!, status: 'done', correct: true };
    expect(puzzleProgress(g, state).map((p) => p.solved)).toEqual([false, true, false, false, false, false]);
    const listed = listGroups(g, state).flatMap((gr) => gr.tasks).map((t) => t.id);
    expect(listed).toContain(PUZZLES[0].id);
    expect(listed).not.toContain(PUZZLES[1].id);
    expect(puzzleProgress(game, state)).toEqual([]);
  });

  it('controleert telefoonnummers', () => {
    for (const ok of ['0612345678', '+31 6 1234 5678', '058-1234567']) expect(isValidPhone(ok)).toBe(true);
    for (const bad of ['', '12345', 'bel me', '06-1234567a']) expect(isValidPhone(bad)).toBe(false);
  });

  it('wisselt de kaartstijl, met de stijl van het spel als begin', () => {
    const first = mapStyleChoice(game, null);
    expect(first.id).toBe('toner-kleur');
    // Standaard: kleur binnen het speelveld, Toner erbuiten.
    expect(insideStyleUrl(first.url)).toMatch(/toner-kleur\.json$/);
    expect(insideStyleUrl(MAP_STYLES[1]!.source.styleUrl)).toBeUndefined();
    const second = mapStyleChoice(game, first.next);
    expect(second.id).toBe(MAP_STYLES[1]!.id);
    // Een onbekende bewaarde stijl valt terug op die van het spel.
    expect(mapStyleChoice(game, 'https://example.org/weg.json').url).toBe(first.url);
    // Een eigen stijl van het spel staat vooraan.
    const own = mapStyleChoice({ ...game, map: { styleUrl: 'https://example.org/eigen.json' } }, null);
    expect(own.id).toBe('spel');
  });
});
