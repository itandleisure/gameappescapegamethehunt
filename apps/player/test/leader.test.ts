import { describe, expect, it } from 'vitest';
import { lastPositions, leaderError, mergePositions, standings, type LeaderPosition, type LeaderTeam } from '../src/core/leader.js';
import { LEADER_MESSAGES, leaderMsg } from '../src/core/leader-i18n.js';

const pos = (id: number, team: string, at: string, accuracy = 5): LeaderPosition => ({
  id,
  team_id: team,
  lat: 53 + id / 1000,
  lng: 5.8,
  accuracy,
  recorded_at: at,
});

const team = (id: string, score: number, login_order: number): LeaderTeam => ({
  id,
  name: id,
  track: 1,
  score,
  caught: 0,
  outcome: null,
  started_at: null,
  ended_at: null,
  login_order,
  phone: null,
});

describe('spelleider-modus', () => {
  it('neemt per team de laatste nauwkeurige positie', () => {
    const last = lastPositions([
      pos(1, 'a', '2026-11-19T10:00:00Z'),
      pos(2, 'a', '2026-11-19T10:01:00Z'),
      pos(3, 'a', '2026-11-19T10:02:00Z', 200),
      pos(4, 'b', '2026-11-19T10:00:30Z'),
    ]);
    expect(last.get('a')?.id).toBe(2);
    expect(last.get('b')?.id).toBe(4);
  });

  it('voegt nieuwe posities toe zonder dubbele en houdt het geheugen klein', () => {
    const list = [pos(1, 'a', '2026-11-19T10:00:00Z')];
    expect(mergePositions(list, [pos(1, 'a', '2026-11-19T10:00:00Z'), pos(2, 'a', '2026-11-19T10:01:00Z')]).map((p) => p.id)).toEqual([1, 2]);
    expect(mergePositions(list, [pos(2, 'a', '2026-11-19T10:01:00Z'), pos(3, 'a', '2026-11-19T10:02:00Z')], 2).map((p) => p.id)).toEqual([2, 3]);
  });

  it('zet de ranglijst op punten, dan op volgorde van inloggen', () => {
    expect(standings([team('x', 10, 1), team('y', 30, 2), team('z', 10, 0)]).map((t) => t.id)).toEqual(['y', 'z', 'x']);
  });

  it('vertaalt fouten van de database', () => {
    expect(leaderError({ code: 'P0002' }, false).key).toBe('leaderUnknownCode');
    expect(leaderError({ code: 'P0002' }).key).toBe('leaderSignedOut');
    expect(leaderError({ code: 'P0006' }, false).key).toBe('leaderFull');
    expect(leaderError({ code: '23505' }, false).key).toBe('leaderNameTaken');
    expect(leaderError({ message: 'TypeError: Network request failed' }).key).toBe('errorNetwork');
  });

  it('heeft alle teksten in elke taal en valt terug op Engels', () => {
    const keys = Object.keys(LEADER_MESSAGES.nl!).sort();
    for (const dict of Object.values(LEADER_MESSAGES)) expect(Object.keys(dict).sort()).toEqual(keys);
    expect(leaderMsg('nl', 'leaderPoints', { n: 40 })).toBe('40 punten');
    expect(leaderMsg('fi', 'leaderButton')).toBe("I'm a game leader");
  });
});
