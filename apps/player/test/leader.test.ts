import { describe, expect, it } from 'vitest';
import { composeGame, type GameEvent } from '@hunt/engine';
import { INTRO, leeuwarden, leeuwardenPoints as P, theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { min, Script, T0 } from '../../../packages/engine/test/helpers.js';
import { LeaderApi, chatPhotoPath, lastPositions, leaderError, mergePositions, puzzleProgress, standings, type LeaderPosition, type LeaderTeam } from '../src/core/leader.js';
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

  it('stuurt de teamchat en de hunters-chat naar hun eigen functie', async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args]);
        return { data: fn.includes('send') ? { id: 'm' } : [], error: null };
      },
    };
    const api = new LeaderApi(client as unknown as ConstructorParameters<typeof LeaderApi>[0]);
    await api.messages('s');
    await api.messages('s', 'hunters');
    await api.send('s', 'hoi');
    await api.send('s', 'hoi', 'hunters');
    expect(calls.map(([fn]) => fn)).toEqual(['leader_messages', 'leader_hunter_messages', 'leader_send_message', 'leader_send_hunter_message']);
  });

  it('foto in de teamchat: eerst naar de eigen foto\'s van het fotoboek, dan het bericht', async () => {
    const steps: string[] = [];
    let exists = false;
    const client = {
      storage: {
        from: (bucket: string) => ({
          upload: async (path: string) => {
            steps.push(`upload ${bucket}/${path}`);
            // Tweede poging: het bestand staat er al, dat is geen fout.
            const error = exists ? { message: 'The resource already exists' } : null;
            exists = true;
            return { data: null, error };
          },
        }),
      },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        steps.push(`${fn} ${String(args.p_photo)} ${String(args.p_body)}`);
        return { data: { id: args.p_photo, body: args.p_body, photo_path: chatPhotoPath('s1', 'f1') }, error: null };
      },
    };
    const api = new LeaderApi(client as unknown as ConstructorParameters<typeof LeaderApi>[0]);
    const row = await api.sendPhoto('s1', 'f1', new ArrayBuffer(4), 'Vossen gepakt!');
    await api.sendPhoto('s1', 'f1', new ArrayBuffer(4));
    expect(row.photo_path).toBe('s1/eigen/chat-f1.jpg');
    expect(steps).toEqual([
      'upload photobooks/s1/eigen/chat-f1.jpg',
      'leader_send_photo f1 Vossen gepakt!',
      'upload photobooks/s1/eigen/chat-f1.jpg',
      'leader_send_photo f1 ',
    ]);
  });
});

describe('spelleider: puzzels per team', () => {
  const game = composeGame(theHuntBase, [leeuwarden], { id: 'the-hunt-leeuwarden', version: 1 });
  const rows = (teamId: string, events: GameEvent[]) =>
    events.map((e) => {
      const { id, at, type, ...rest } = e as GameEvent & Record<string, unknown>;
      const { task, ...payload } = rest as { task?: string } & Record<string, unknown>;
      return { id: `${teamId}-${id}`, team_id: teamId, type, task_key: task ?? null, payload, client_time: new Date(at).toISOString() };
    });
  const started = (id: string, started_at: string | null): LeaderTeam => ({ ...team(id, 0, 1), started_at });

  it('telt de opgeloste puzzels, net als de resultatenpagina', () => {
    const a = new Script();
    a.reach(0.5, 'start', P.start).ok(0.7, 'start');
    INTRO.forEach((id, i) => a.ok(1 + i * 0.5, id));
    a.text(8, 'puzzel-tangram', 'Vluchtroute');
    a.text(14, 'puzzel-morse', 'fout');
    a.text(15, 'puzzel-morse', 'EXTRACTIE');
    const b = new Script();
    b.reach(0.5, 'start', P.start).ok(0.7, 'start');
    INTRO.forEach((id, i) => b.ok(1 + i * 0.5, id));
    b.text(9, 'puzzel-tangram', 'iets anders');

    const T = new Date(T0).toISOString();
    const progress = puzzleProgress(
      {
        session: { id: 's', name: 's', timezone: 'Europe/Amsterdam', status: 'live', team_chat: true },
        game,
        teams: [started('a', T), started('b', T), started('c', null)],
        events: [...rows('a', a.events), ...rows('b', b.events)],
        positions: [],
        leaders: [],
      },
      min(30),
    );
    expect(progress.puzzles.map((p) => p.id)).toContain('puzzel-tangram');
    expect([...progress.solved.get('a')!].sort()).toEqual(['puzzel-morse', 'puzzel-tangram']);
    expect(progress.solved.get('b')!.size).toBe(0);
    expect(progress.solved.get('c')!.size).toBe(0);
  });

  it('zonder spel geen puzzels', () => {
    const progress = puzzleProgress(
      { session: { id: 's', name: 's', timezone: 'UTC', status: 'live', team_chat: true }, game: null, teams: [], positions: [], leaders: [] },
      0,
    );
    expect(progress.puzzles).toEqual([]);
  });
});
