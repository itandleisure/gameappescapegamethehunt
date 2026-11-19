import { composeGame, type GameEvent } from '@hunt/engine';
import { describe, expect, it } from 'vitest';
import { INTRO, leeuwarden, leeuwardenPoints as P, theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { min, Script, T0 } from '../../../packages/engine/test/helpers.js';
import { buildResults, formatDistance, formatDuration, resultsToCsv, type EventRow, type TeamRow } from '../src/lib/results.js';

const game = composeGame(theHuntBase, [leeuwarden], { id: 'the-hunt-leeuwarden', version: 1 });

function rows(teamId: string, events: GameEvent[]): EventRow[] {
  return events.map((e) => {
    const { id, at, type, ...rest } = e as GameEvent & Record<string, unknown>;
    const { task, ...payload } = rest as { task?: string } & Record<string, unknown>;
    return { id: `${teamId}-${id}`, team_id: teamId, type, task_key: task ?? null, payload, client_time: new Date(at).toISOString() };
  });
}

const team = (id: string, name: string, track: number, started = true): TeamRow => ({
  id,
  name,
  track,
  language: 'nl',
  score: 0,
  outcome: null,
  started_at: started ? new Date(T0).toISOString() : null,
  ended_at: null,
  distance_m: 2400,
});

describe('resultatenpagina', () => {
  // Team A: tangram goed, morse eerst fout en dan goed.
  const a = new Script();
  a.reach(0.5, 'start', P.start).ok(0.7, 'start');
  INTRO.forEach((id, i) => a.ok(1 + i * 0.5, id));
  a.text(8, 'puzzel-tangram', 'Vluchtroute');
  a.text(14, 'puzzel-morse', 'fout');
  a.text(15, 'puzzel-morse', 'EXTRACTIE');
  // Team B: alleen tangram fout.
  const b = new Script();
  b.reach(0.5, 'start', P.start).ok(0.7, 'start');
  INTRO.forEach((id, i) => b.ok(1 + i * 0.5, id));
  b.text(9, 'puzzel-tangram', 'iets anders');

  const view = buildResults(
    game,
    [team('b', 'Bravo', 2), team('a', 'Alfa', 1), team('c', 'Charlie', 3, false)],
    [...rows('a', a.events), ...rows('b', b.events)],
    min(30),
  );

  it('zet het team met de meeste punten bovenaan en niet gestarte teams onderaan', () => {
    expect(view.teams.map((t) => t.name)).toEqual(['Alfa', 'Bravo', 'Charlie']);
    expect(view.teams.map((t) => t.rank)).toEqual([1, 2, 3]);
    expect(view.teams[0]!.playing).toBe(true);
    expect(view.teams[0]!.durationSeconds).toBe(30 * 60);
  });

  it('toont per team de antwoorden, goed of fout, met punten', () => {
    const alfa = view.teams[0]!;
    expect(alfa.correct).toBe(2);
    expect(alfa.wrong).toBe(0);
    const morse = alfa.answers.find((x) => x.task === 'puzzel-morse')!;
    expect(morse.result).toBe('correct');
    expect(morse.answer).toBe('EXTRACTIE');
    expect(morse.atSeconds).toBe(15 * 60);
    expect(alfa.answers.reduce((s, x) => s + x.points, 0) + alfa.bonusPoints).toBe(alfa.score);

    const bravo = view.teams[1]!;
    const tangram = bravo.answers.find((x) => x.task === 'puzzel-tangram')!;
    expect(tangram.result).toBe('wrong');
    expect(tangram.answer).toBe('iets anders');
    expect(tangram.expected).not.toBe('');
  });

  it('toont per team welke puzzels zijn opgelost, in de volgorde van de codevakjes', () => {
    expect(view.puzzles.length).toBeGreaterThanOrEqual(2);
    const ids = view.puzzles.map((p) => p.id);
    expect(ids).toContain('puzzel-tangram');
    expect(ids).toContain('puzzel-morse');
    expect(view.teams[0]!.solvedPuzzles.sort()).toEqual(['puzzel-morse', 'puzzel-tangram']);
    expect(view.teams[1]!.solvedPuzzles).toEqual([]);
    expect(view.teams[2]!.solvedPuzzles).toEqual([]);
  });

  it('neemt het aantal keren gepakt over, standaard 0', () => {
    const v = buildResults(game, [{ ...team('a', 'Alfa', 1), caught: 2 }, team('b', 'Bravo', 2)], [], min(5));
    expect(v.teams.find((t) => t.id === 'a')!.caught).toBe(2);
    expect(v.teams.find((t) => t.id === 'b')!.caught).toBe(0);
  });

  it('telt per opdracht hoeveel teams hem goed hadden', () => {
    const tangram = view.tasks.find((x) => x.id === 'puzzel-tangram')!;
    expect(tangram).toMatchObject({ answered: 2, correct: 1 });
  });

  it('maakt een Excel-bestand met een kolom per opdracht', () => {
    const csv = resultsToCsv(view);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('plaats;team;punten');
    expect(lines[1]).toMatch(/^1;Alfa;/);
  });

  it('schrijft tijd en afstand leesbaar', () => {
    expect(formatDuration(754)).toBe('12:34');
    expect(formatDuration(3780)).toBe('1:03:00');
    expect(formatDuration(null)).toBe('–');
    expect(formatDistance(2400)).toBe('2,4 km');
    expect(formatDistance(800)).toBe('800 m');
  });
});
