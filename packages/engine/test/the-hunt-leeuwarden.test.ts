/**
 * Escape Game The Hunt Leeuwarden als geautomatiseerd testscenario (ontwerp §5.6).
 * Elke wijziging aan de engine moet deze scenario's blijven halen.
 */
import { describe, expect, it } from 'vitest';
import { canUseHint, computeState, reachableTargets } from '../src/engine.js';
import { composeGame } from '../src/layers.js';
import { assignTrack } from '../src/tracks.js';
import type { GameEvent } from '../src/types.js';
import { INTRO, leeuwarden, leeuwardenPoints, PUZZLES, theHuntBase } from './fixtures/the-hunt.js';
import { min, Script, T0 } from './helpers.js';

const game = composeGame(theHuntBase, [leeuwarden], { id: 'the-hunt-leeuwarden', version: 1 });
const TRACK = 3;
const team = { track: TRACK, startedAt: T0 };
const P = leeuwardenPoints;

const SOLUTIONS: Record<string, string> = {
  'puzzel-tangram': 'Vluchtroute',
  'puzzel-morse': 'EXTRACTIE',
  'puzzel-blokjes': '4711',
  'puzzel-stratenkaart': 'de Oldehove',
  'puzzel-cryptex': ' Hunter ',
  'puzzel-kompas': 'Noord Oost',
};

/** Start, introreeks van 12 schermen, beide trackvragen en alle puzzels zodra ze vrijkomen. */
function solidTeam(): Script {
  const s = new Script();
  s.reach(0.5, 'start', P.start).ok(0.7, 'start');
  INTRO.forEach((id, i) => s.ok(1 + i * 0.5, id));
  s.text(8, 'puzzel-tangram', SOLUTIONS['puzzel-tangram']!);
  s.reach(12, 'lokaal-1', P.track(TRACK, 1)).text(12.5, 'lokaal-1', 'zaailand');
  s.text(15, 'puzzel-morse', SOLUTIONS['puzzel-morse']!);
  s.reach(22, 'lokaal-2', P.track(TRACK, 2)).text(22.5, 'lokaal-2', 'Waagplein');
  s.answer(25, 'puzzel-blokjes', { type: 'number', value: SOLUTIONS['puzzel-blokjes']! });
  s.text(33, 'puzzel-stratenkaart', SOLUTIONS['puzzel-stratenkaart']!);
  s.answer(36, 'fotomissie', { type: 'photo', photoId: 'foto-1' });
  s.text(44, 'puzzel-cryptex', SOLUTIONS['puzzel-cryptex']!);
  s.text(52, 'puzzel-kompas', SOLUTIONS['puzzel-kompas']!);
  return s;
}

/** Hernoemt ids zodat losse extra gebeurtenissen niet botsen met het script. */
const extra = (s: Script, prefix: string): GameEvent[] => s.events.map((e, i) => ({ ...e, id: `${prefix}${i}` }));

describe('Escape Game The Hunt Leeuwarden', () => {
  it('heeft een geldig samengesteld spelpakket', () => {
    expect(game.tasks.find((t) => t.id === 'start')?.location?.lat).toBeCloseTo(P.start.lat);
    expect(game.tasks.filter((t) => t.tags.includes('oplossing'))).toHaveLength(6);
  });

  it('team lost alles op, gaat naar het juiste extractiepunt en ontsnapt met 1900 punten', () => {
    const s = solidTeam();
    s.reach(63, 'extractie-a', P.extractieA).confirm(63.2, 'extractie-a').ok(63.3, 'extractie-a');
    const state = computeState(game, team, s.events, min(90));

    expect(state.rejected).toEqual([]);
    expect(state.ended).toEqual({ ending: 'ontsnapt', at: min(63.3) });
    // 6 puzzels × 200 + 2 trackvragen × 50 + 600 bonus
    expect(state.score).toBe(1900);
    expect(state.messages.map((m) => m.text.nl)).toEqual([
      'Er zijn 10 minuten verstreken.',
      'Er zijn 20 minuten verstreken.',
      'Er zijn 30 minuten verstreken.',
      'Er zijn 40 minuten verstreken.',
      'Er zijn 50 minuten verstreken.',
      'Super! Ga naar het juiste extractiepunt.',
    ]);
    // Tijdregels vuren op het exacte moment, niet bij de volgende gebeurtenis.
    expect(state.firedRules['tijdlijn-30']).toBe(min(30));
    expect(state.firedRules['finale']).toBe(min(60));
    expect(state.firedRules['tijd-op']).toBeUndefined();
  });

  it('introreeks: startlocatie opent 12 uitlegschermen na elkaar, daarna terug te lezen', () => {
    const s = new Script().reach(0.5, 'start', P.start).ok(0.7, 'start');
    let state = computeState(game, team, s.events, min(0.8));
    expect(state.tasks[INTRO[0]!]!.status).toBe('open');
    expect(state.tasks[INTRO[1]!]!.status).toBe('hidden');

    INTRO.forEach((id, i) => s.ok(1 + i * 0.5, id));
    state = computeState(game, team, s.events, min(7));
    expect(state.activeSequence).toBeUndefined();
    for (const id of INTRO) {
      expect(state.tasks[id]).toMatchObject({ status: 'done', playground: 'speluitleg' });
    }
    expect(state.tasks['puzzel-tangram']).toMatchObject({ status: 'visible', inList: true });
    expect(state.tasks['lokaal-1']).toMatchObject({ status: 'visible', onMap: true });
  });

  it('elke 10 minuten komt een nieuwe puzzel vrij', () => {
    const events = solidTeam().events.filter((e) => !e.task.startsWith('puzzel'));
    const visibleAt = (m: number) =>
      PUZZLES.filter((p) => computeState(game, team, events, min(m)).tasks[p.id]!.status !== 'hidden').length;
    expect(visibleAt(9.9)).toBe(1);
    expect(visibleAt(10)).toBe(2);
    expect(visibleAt(29.9)).toBe(3);
    expect(visibleAt(50)).toBe(6);
  });

  it('fotomissie opent na 35 minuten', () => {
    const events = solidTeam().events.filter((e) => e.task !== 'fotomissie');
    expect(computeState(game, team, events, min(34.9)).tasks['fotomissie']!.status).toBe('hidden');
    const state = computeState(game, team, events, min(35));
    expect(state.tasks['fotomissie']).toMatchObject({ status: 'open', inList: true });
  });

  it('beide trackvragen gedaan geeft de bonushint in de playground Extractiepunt', () => {
    const state = computeState(game, team, solidTeam().events, min(23));
    expect(state.tasks['extractie-hint']).toMatchObject({ status: 'visible', playground: 'extractiepunt' });
    expect(state.firedRules['track-bonus']).toBe(min(22.5));
  });

  it('finale pas na 60 minuten, ook als alle puzzels eerder goed zijn', () => {
    const events = solidTeam().events;
    const before = computeState(game, team, events, min(59.9));
    expect(before.tasks['extractie-a']!.status).toBe('hidden');
    const after = computeState(game, team, events, min(60));
    for (const id of ['extractie-a', 'extractie-b', 'extractie-c']) {
      expect(after.tasks[id]).toMatchObject({ status: 'visible', onMap: true });
    }
  });

  it('geen finale zolang niet alle puzzels goed zijn', () => {
    const events = solidTeam().events.filter((e) => e.task !== 'puzzel-kompas');
    const state = computeState(game, team, events, min(70));
    expect(state.tasks['extractie-a']!.status).toBe('hidden');
    expect(state.firedRules['finale']).toBeUndefined();
  });

  it('hints kosten 25, 50 en 75 punten, op volgorde, en gaan uit als de puzzel goed is', () => {
    const s = solidTeam()
      .hint(11, 'puzzel-morse', 1) // niet op volgorde
      .hint(11.1, 'puzzel-morse', 0)
      .hint(12.1, 'puzzel-morse', 1)
      .hint(16, 'puzzel-morse', 2); // na het oplossen (15 min)
    s.reach(63, 'extractie-a', P.extractieA).confirm(63.2, 'extractie-a').ok(63.3, 'extractie-a');
    const state = computeState(game, team, s.events, min(90));

    expect(state.score).toBe(1900 - 25 - 50);
    expect(state.tasks['puzzel-morse']!.hintsUsed).toBe(2);
    expect(state.rejected.map((r) => r.reason)).toEqual(['hints gaan op volgorde', 'hint niet beschikbaar']);
    expect(canUseHint(game, computeState(game, team, s.events, min(14)), 'puzzel-morse')).toBe(true);
    expect(canUseHint(game, computeState(game, team, s.events, min(15)), 'puzzel-morse')).toBe(false);
  });

  it('fout antwoord op een puzzel: opdracht blijft open tot hij goed is', () => {
    const early = extra(new Script().text(9, 'puzzel-morse', 'te vroeg'), 'vroeg');
    expect(computeState(game, team, [...solidTeam().events, ...early], min(10)).rejected).toEqual([
      { event: 'vroeg0', reason: 'opdracht is niet open' },
    ]);

    const wrong = extra(new Script().text(11, 'puzzel-morse', 'vluchten').text(12, 'puzzel-morse', 'nog fout'), 'fout');
    const events = [...solidTeam().events, ...wrong];
    expect(computeState(game, team, events, min(14)).tasks['puzzel-morse']).toMatchObject({
      status: 'visible',
      attempts: 2,
    });
    expect(computeState(game, team, events, min(16)).tasks['puzzel-morse']).toMatchObject({
      status: 'done',
      correct: true,
      attempts: 3,
    });
  });

  it('verkeerd extractiepunt: einde zonder bonus', () => {
    const s = solidTeam();
    s.reach(64, 'extractie-b', P.extractieB).confirm(64.2, 'extractie-b').ok(64.3, 'extractie-b');
    s.reach(66, 'extractie-a', P.extractieA); // na het einde
    const state = computeState(game, team, s.events, min(90));
    expect(state.ended).toEqual({ ending: 'verkeerd-extractiepunt', at: min(64.3) });
    expect(state.score).toBe(1300);
    expect(state.rejected.at(-1)?.reason).toBe('spel is al afgelopen');
  });

  it('bevestiging weigeren: extractiepunt blijft op de kaart en kan later opnieuw', () => {
    const s = solidTeam();
    s.reach(61, 'extractie-c', P.extractieC).add(61.1, { type: 'declined', task: 'extractie-c' });
    let state = computeState(game, team, s.events, min(62));
    expect(state.tasks['extractie-c']).toMatchObject({ status: 'visible', onMap: true });
    expect(state.ended).toBeUndefined();

    s.reach(70, 'extractie-a', P.extractieA);
    state = computeState(game, team, s.events, min(70.1));
    expect(state.tasks['extractie-a']!.status).toBe('confirming');
  });

  it('na 75 minuten: alles uit en einde "tijd op"', () => {
    const events = solidTeam().events.filter((e) => e.task !== 'puzzel-kompas');
    const late = extra(new Script().text(80, 'puzzel-kompas', 'noordoost'), 'laat');
    const state = computeState(game, team, [...events, ...late], min(90));
    expect(state.ended).toEqual({ ending: 'tijd-op', at: min(75) });
    expect(state.tasks['puzzel-kompas']!.status).toBe('deactivated');
    expect(state.tasks['puzzel-tangram']!.status).toBe('done');
    expect(state.score).toBe(5 * 200 + 2 * 50);
    expect(state.rejected).toEqual([{ event: 'laat0', reason: 'spel is al afgelopen' }]);
  });

  describe('GPS', () => {
    it('weigert onnauwkeurige metingen en metingen buiten de straal', () => {
      const s = new Script()
        .reach(0.2, 'start', P.start, 45)
        .reach(0.3, 'start', { lat: P.start.lat + 0.001, lng: P.start.lng }, 5); // ±111 m
      const state = computeState(game, team, s.events, min(1));
      expect(state.rejected.map((r) => r.reason)).toEqual(['GPS-meting te onnauwkeurig', 'buiten de straal']);
      expect(state.tasks['start']!.status).toBe('visible');
    });

    it('trackvragen openen alleen op de locatie van de eigen track', () => {
      const events = solidTeam().events.filter((e) => !e.task.startsWith('lokaal'));
      const other = extra(new Script().reach(12, 'lokaal-1', P.track(1, 1)), 'x');
      const state = computeState(game, team, [...events, ...other], min(13));
      expect(state.rejected).toEqual([{ event: 'x0', reason: 'buiten de straal' }]);
      const target = reachableTargets(game, team, state).find((t) => t.task === 'lokaal-1');
      expect(target?.location.lat).toBeCloseTo(P.track(TRACK, 1).lat);
    });

    it('spelleiding kan een opdracht handmatig openen', () => {
      const events = solidTeam().events.filter((e) => e.task !== 'lokaal-1');
      const manual = extra(
        new Script().add(30, { type: 'manualOpen', task: 'lokaal-1' }).text(31, 'lokaal-1', 'Zaailand'),
        'm',
      );
      const state = computeState(game, team, [...events, ...manual], min(32));
      expect(state.tasks['lokaal-1']).toMatchObject({ status: 'done', correct: true });
    });
  });

  describe('offline en wachtrij', () => {
    it('dubbel verstuurde en door elkaar binnengekomen gebeurtenissen geven dezelfde uitkomst', () => {
      const s = solidTeam();
      s.reach(63, 'extractie-a', P.extractieA).confirm(63.2, 'extractie-a').ok(63.3, 'extractie-a');
      const reference = computeState(game, team, s.events, min(90));

      const shuffled: GameEvent[] = [...s.events, ...s.events.slice(10, 20)];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (i * 7919) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      expect(computeState(game, team, shuffled, min(90))).toEqual(reference);
    });

    it('rekent tussentijds en achteraf hetzelfde (app en server komen overeen)', () => {
      const events = solidTeam().events;
      const live = computeState(
        game,
        team,
        events.filter((e) => e.at <= min(40)),
        min(40),
      );
      expect(computeState(game, team, events, min(40))).toEqual(live);
    });
  });

  it('tracks: teams worden op volgorde van inloggen verdeeld', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 11].map((n) => assignTrack(n, 5))).toEqual([1, 2, 3, 4, 5, 1, 2, 1]);
    expect(assignTrack(4, 3)).toBe(1);
  });
});

describe('speluitleg vóór een centrale start', () => {
  it('telt de gelezen uitleg bij de start als afgerond', () => {
    const withBriefing = { ...game, briefing: 'intro' };
    const state = computeState(withBriefing, { ...team, briefingRead: true }, [], min(1));
    for (const id of INTRO) expect(state.tasks[id]!.status).toBe('done');
    // De regel na de uitleg vuurt meteen bij de start: eerste puzzel staat klaar.
    expect(state.tasks[PUZZLES[0].id]!.status).toBe('visible');
    // Zonder klaarmelding blijft alles zoals het was.
    const before = computeState(withBriefing, team, [], min(1));
    expect(before.tasks[INTRO[0]!]!.status).not.toBe('done');
  });
});
