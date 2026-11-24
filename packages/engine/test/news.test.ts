import { describe, expect, it } from 'vitest';
import { composeGame } from '../src/layers.js';
import {
  addDistance,
  DEFAULT_NEWS_PRESETS,
  earnedBadges,
  gameTimeLimitMinutes,
  isEscapeEnding,
  NEWS_BODY_MAX,
  NEWS_TITLE_MAX,
  type DistanceProgress,
} from '../src/news.js';
import { routeDistance } from '../src/stats.js';
import type { GameEvent, TeamState } from '../src/types.js';
import { leeuwarden, LWD, offset, PUZZLES, theHuntBase } from './fixtures/the-hunt.js';
import { min, T0 } from './helpers.js';

const game = composeGame(theHuntBase, [leeuwarden], { id: 'the-hunt-leeuwarden', version: 1 });

/** De 25 talen van de speler-app. */
const LANGS = ['nl', 'en', 'de', 'fr', 'es', 'it', 'pt', 'da', 'sv', 'no', 'fi', 'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'el', 'hr', 'sl', 'et', 'lv', 'lt', 'ga', 'mt'];

function ended(ending: string, at: number, correct: string[] = []): TeamState {
  return {
    now: at,
    score: 0,
    tasks: Object.fromEntries(correct.map((id) => [id, { status: 'done', onMap: false, inList: false, attempts: 1, correct: true, hintsUsed: 0 }])),
    firedRules: {},
    messages: [],
    ledger: [],
    ended: { ending, at },
    rejected: [],
  };
}

describe('nieuwsflitsen', () => {
  it('startset snelknoppen staat in alle 25 talen, niet te lang', () => {
    expect(DEFAULT_NEWS_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const preset of DEFAULT_NEWS_PRESETS) {
      expect(Object.keys(preset.title).sort()).toEqual([...LANGS].sort());
      expect(Object.keys(preset.body ?? {}).sort()).toEqual([...LANGS].sort());
      for (const text of [...Object.values(preset.title), ...Object.values(preset.body ?? {})]) expect(text?.trim()).toBeTruthy();
      expect(Math.max(...Object.values(preset.title).map((s) => s!.length))).toBeLessThanOrEqual(NEWS_TITLE_MAX);
      expect(Math.max(...Object.values(preset.body ?? {}).map((s) => s!.length))).toBeLessThanOrEqual(NEWS_BODY_MAX);
    }
    expect(new Set(DEFAULT_NEWS_PRESETS.map((p) => p.id)).size).toBe(DEFAULT_NEWS_PRESETS.length);
  });

  it('speeltijd uit de regel "na x minuten → einde"', () => {
    expect(gameTimeLimitMinutes(game)).toBe(75);
    expect(gameTimeLimitMinutes({ rules: [] })).toBeUndefined();
  });

  it('ontsnapt = einde met bonus', () => {
    expect(isEscapeEnding(game, 'ontsnapt')).toBe(true);
    expect(isEscapeEnding(game, 'tijd-op')).toBe(false);
    expect(isEscapeEnding(game, 'verkeerd-extractiepunt')).toBe(false);
    expect(isEscapeEnding(game, undefined)).toBe(false);
  });
});

describe('afstand onderweg', () => {
  it('telt hetzelfde als routeDistance: geen ruis, geen sprongen, geen onnauwkeurige metingen', () => {
    const fixes = [
      { ...LWD, accuracy: 8, at: 0 },
      { ...offset(LWD, 2, 0), accuracy: 8, at: 10_000 }, // ruis
      { ...offset(LWD, 50, 0), accuracy: 8, at: 40_000 },
      { ...offset(LWD, 50, 400), accuracy: 8, at: 45_000 }, // sprong
      { ...offset(LWD, 100, 0), accuracy: 60, at: 60_000 }, // onnauwkeurig
      { ...offset(LWD, 100, 0), accuracy: 8, at: 80_000 },
    ];
    let progress: DistanceProgress = { meters: 0 };
    for (const fix of fixes) progress = addDistance(progress, fix);
    expect(progress.meters).toBeCloseTo(routeDistance(fixes), 3);
    expect(progress.meters).toBeGreaterThan(95);
    expect(progress.meters).toBeLessThan(105);
  });
});

describe('badges', () => {
  const caught: GameEvent = { id: 'c1', at: min(30), type: 'caught', points: -100 };
  const hint: GameEvent = { id: 'h1', at: min(20), type: 'hintUsed', task: PUZZLES[0].id, hint: 0 };

  it('ontsnapt zonder gepakt te worden en zonder hints', () => {
    const state = ended('ontsnapt', min(50), [PUZZLES[0].id]);
    expect(earnedBadges({ game, state, events: [], teamId: 't1', startedAt: T0 })).toEqual(['escaped', 'neverCaught', 'noHints']);
  });

  it('comeback en op het nippertje', () => {
    const state = ended('ontsnapt', min(74));
    expect(earnedBadges({ game, state, events: [caught, hint], teamId: 't1', startedAt: T0 })).toEqual(['escaped', 'lastMinute', 'comeback']);
  });

  it('eerste en meeste komen van de server', () => {
    const state = ended('ontsnapt', min(60));
    const records = { firstEscapeTeam: 't1', firstPuzzleTeam: 't1', mostDistanceTeam: 't1', mostPhotosTeam: 't2' };
    expect(earnedBadges({ game, state, events: [hint], teamId: 't1', startedAt: T0, records })).toEqual([
      'escaped',
      'neverCaught',
      'firstOut',
      'fastest',
      'marathon',
    ]);
  });

  it('tijd op: geen ontsnappingsbadges, en niets zolang het spel loopt', () => {
    const state = ended('tijd-op', min(75));
    expect(earnedBadges({ game, state, events: [caught], teamId: 't1', startedAt: T0, records: { firstEscapeTeam: 't1' } })).toEqual([]);
    expect(earnedBadges({ game, state: { ...state, ended: undefined }, events: [], teamId: 't1', startedAt: T0 })).toEqual([]);
  });
});
