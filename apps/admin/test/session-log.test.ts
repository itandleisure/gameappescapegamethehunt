import { composeGame, type GameEvent } from '@hunt/engine';
import { describe, expect, it } from 'vitest';
import { INTRO, leeuwarden, leeuwardenPoints as P, theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { min, Script, T0 } from '../../../packages/engine/test/helpers.js';
import type { EventRow } from '../src/lib/results.js';
import { buildSessionLog, logToCsv, type LogTeam } from '../src/lib/session-log.js';

const game = composeGame(theHuntBase, [leeuwarden], { id: 'the-hunt-leeuwarden', version: 1 });

function rows(teamId: string, events: GameEvent[]): EventRow[] {
  return events.map((e) => {
    const { id, at, type, ...rest } = e as GameEvent & Record<string, unknown>;
    const { task, ...payload } = rest as { task?: string } & Record<string, unknown>;
    return { id: `${teamId}-${id}`, team_id: teamId, type, task_key: task ?? null, payload, client_time: new Date(at).toISOString() };
  });
}

const team = (id: string, name: string, started = true): LogTeam => ({
  id,
  name,
  track: 1,
  language: 'nl',
  score: 0,
  outcome: null,
  started_at: started ? new Date(T0).toISOString() : null,
  ended_at: null,
  created_at: new Date(T0 - 5 * 60_000).toISOString(),
});

describe('logboek van een event', () => {
  const a = new Script();
  a.reach(0.5, 'start', P.start).ok(0.7, 'start');
  INTRO.forEach((id, i) => a.ok(1 + i * 0.5, id));
  a.text(8, 'puzzel-tangram', 'Vluchtroute');
  a.text(14, 'puzzel-morse', 'fout');
  a.text(15, 'puzzel-morse', 'EXTRACTIE');
  // Hint op een opdracht die (nog) niet zichtbaar is: wordt niet meegeteld.
  a.hint(16, 'puzzel-tangram', 0);

  const log = buildSessionLog({
    game,
    teams: [team('a', 'Alfa'), team('c', 'Charlie', false)],
    events: rows('a', a.events),
    photos: [{ id: 'f1', team_id: 'a', task_key: 'puzzel-tangram', path: 'a/x.jpg', created_at: new Date(min(9)).toISOString() }],
    chat: [
      { id: 'm1', team_id: 'a', sender: 'team', sender_name: 'Alfa', body: 'Hallo!', created_at: new Date(T0 + 60_000 * 10).toISOString(), channel: 'teams' },
      { id: 'm2', team_id: null, sender: 'staff', sender_name: 'Piet', body: 'Komt eraan', created_at: new Date(T0 + 60_000 * 11).toISOString(), channel: 'hunters' },
    ],
    leaders: [{ id: 'l1', name: 'Piet', created_at: new Date(T0 - 60_000).toISOString() }],
    now: min(30),
  });

  it('staat op volgorde, nieuwste eerst', () => {
    const times = log.map((e) => e.at);
    expect([...times].sort((x, y) => y - x)).toEqual(times);
  });

  it('toont aanmelden en start, ook van teams die nog niet zijn gestart', () => {
    expect(log.some((e) => e.teamId === 'a' && e.text === 'Gestart' && e.at === T0)).toBe(true);
    expect(log.some((e) => e.teamId === 'c' && e.text === 'Team aangemeld')).toBe(true);
    expect(log.some((e) => e.teamId === 'c' && e.text === 'Gestart')).toBe(false);
  });

  it('toont opgeloste en foute puzzels met antwoord en punten', () => {
    const fout = log.find((e) => e.id === `a-${a.events.find((x) => x.type === 'answered' && x.task === 'puzzel-morse')!.id}`)!;
    expect(fout.tone).toBe('bad');
    expect(fout.text).toMatch(/fout beantwoord/);
    expect(fout.detail).toBe('Antwoord: fout');
    const goed = log.filter((e) => e.tone === 'ok' && e.text.includes('goed beantwoord'));
    expect(goed.length).toBeGreaterThanOrEqual(2);
    expect(goed.some((e) => e.detail === 'Antwoord: EXTRACTIE' && e.at === min(15))).toBe(true);
  });

  it('toont uitgevoerde regels uit het spelverloop', () => {
    const rules = log.filter((e) => e.category === 'regel');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((e) => e.text.startsWith('Regel: ') && e.teamId === 'a')).toBe(true);
  });

  it('laat zien dat een gebeurtenis niet is meegeteld', () => {
    const hint = log.find((e) => e.text.startsWith('Hint 1'))!;
    expect(hint.detail).toMatch(/^Niet meegeteld: /);
    expect(hint.points).toBeUndefined();
  });

  it("toont foto's, chat en spelleiders", () => {
    expect(log.some((e) => e.category === 'foto' && e.teamId === 'a')).toBe(true);
    expect(log.find((e) => e.id === 'chat:m1')).toMatchObject({ teamId: 'a', text: 'Teamchat: bericht', detail: 'Hallo!' });
    expect(log.find((e) => e.id === 'chat:m2')).toMatchObject({ teamId: null, text: 'Chat hunters: bericht van Piet' });
    expect(log.some((e) => e.text === 'Spelleider Piet ingelogd in de app')).toBe(true);
  });

  it('maakt een CSV, oudste eerst', () => {
    const csv = logToCsv(log, (id) => id ?? 'Spelleiding', (ms) => new Date(ms).toISOString());
    const lines = csv.split('\n');
    expect(lines[0]).toBe('﻿Tijd;Team;Soort;Wat;Details;Punten');
    expect(lines).toHaveLength(log.length + 1);
    expect(lines[1]).toContain('Team aangemeld');
  });
});
