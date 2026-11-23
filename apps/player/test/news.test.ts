import { composeGame, type GamePackage } from '@hunt/engine';
import { describe, expect, it } from 'vitest';
import { leeuwarden, theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { GameController } from '../src/core/game-controller.js';
import { msg } from '../src/core/i18n.js';
import { translateNews } from '../src/core/leader.js';
import { endStats, formatKm, lapsFor, mergeNews, newsView, stepsFor, type NewsFlash } from '../src/core/news.js';
import { MemoryStore } from '../src/core/types.js';
import { FakeBackend } from './fake-backend.js';

const game = composeGame(theHuntBase, [leeuwarden], { id: 'the-hunt-leeuwarden', version: 1 });
const T0 = Date.UTC(2026, 10, 21, 13, 0, 0);
const MIN = 60_000;

/** Spel waarin de morsepuzzel (na 10 minuten in de lijst) meteen het einde "ontsnapt" geeft. */
const escapeGame: GamePackage = {
  ...game,
  rules: [...game.rules, { id: 'snel-weg', when: { kind: 'correct', select: { task: 'puzzel-morse' } }, then: [{ kind: 'end', ending: 'ontsnapt' }] }],
};

async function playing(g: GamePackage = game) {
  let device = T0;
  let n = 0;
  const backend = new FakeBackend(g, T0);
  const buzz: string[] = [];
  const deps = {
    backend,
    store: new MemoryStore(),
    deviceNow: () => device,
    newId: () => `id-${++n}`,
    onNews: (_team: unknown, flash: NewsFlash) => buzz.push(flash.id),
  };
  const advance = (ms: number) => {
    device += ms;
    backend.serverNow += ms;
  };
  const c = await GameController.join(deps, 'LWD001', 'Vossen', 'nl', '06 12345678');
  await c.start();
  return { c, backend, advance, buzz };
}

const t = (key: Parameters<typeof msg>[1], vars?: Record<string, string | number>) => msg('nl', key, vars);

describe('nieuwsflitsen', () => {
  it('een flits van de spelleider komt onderin, trilt één keer en verdwijnt na wegtikken', async () => {
    const { c, backend, advance, buzz } = await playing();
    advance(MIN);
    backend.news.push({ id: 'f1', kind: 'leader', icon: '⏳', title: { nl: 'Nog 10 minuten!', en: '10 minutes left!' }, at: backend.serverNow });
    await c.tick();
    const snap = c.snapshot();
    expect(snap.newsCurrent?.id).toBe('f1');
    expect(snap.newsUnread).toBe(1);
    expect(buzz).toEqual(['f1']);
    expect(newsView(snap.newsCurrent!, game, 'en', t).title).toBe('10 minutes left!');

    // Tien seconden later: de server geeft hem niet nog een keer.
    advance(10_000);
    await c.tick();
    expect(c.snapshot().news).toHaveLength(1);

    await c.dismissNews('f1');
    expect(c.snapshot().newsCurrent).toBeNull();
    expect(c.snapshot().newsUnread).toBe(1); // nog niet in de lijst bekeken
    await c.markNewsRead();
    expect(c.snapshot().newsUnread).toBe(0);
    expect(buzz).toHaveLength(1);
  });

  it('nieuws van vóór de start of van het eigen team komt niet', async () => {
    const { c, backend, advance } = await playing();
    backend.news.push({ id: 'oud', kind: 'leader', title: { nl: 'Welkom' }, at: T0 - MIN });
    backend.news.push({ id: 'eigen', kind: 'escaped', teamId: c.team.id, teamName: 'Vossen', at: T0 + 1 });
    advance(MIN);
    await c.tick();
    expect(c.snapshot().news).toEqual([]);
  });

  it('oud nieuws (geen bereik gehad) komt alleen in de lijst', () => {
    const now = T0 + 20 * MIN;
    const list = mergeNews([], [{ id: 'a', kind: 'leader', at: T0 }, { id: 'b', kind: 'leader', at: now - MIN }], now);
    expect(list.map((n) => [n.id, n.shown === true])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('teksten van automatische flitsen in de eigen taal', () => {
    expect(newsView({ id: 'x', kind: 'puzzle', at: 0, teamName: 'Dassen', task: 'puzzel-morse', n: 1 }, game, 'nl', t)).toMatchObject({
      title: 'Dassen loste "Morsecode" op',
      sub: 'Als eerste!',
      tone: 'accent',
    });
    expect(newsView({ id: 'x', kind: 'puzzle', at: 0, teamName: 'Dassen', task: 'puzzel-morse', n: 3 }, game, 'nl', t).sub).toBe('Al 3 teams hebben deze puzzel');
    expect(newsView({ id: 'x', kind: 'escaped', at: 0, teamName: 'Dassen', n: 2 }, game, 'nl', t)).toMatchObject({
      title: 'Dassen heeft het extractiepunt bereikt',
      sub: '',
      tone: 'success',
    });
  });

  it('meldt een opgeloste puzzel en de ontsnapping één keer, en de eindstand', async () => {
    const { c, backend, advance } = await playing(escapeGame);
    advance(11 * MIN);
    await c.tick();
    await c.answer('puzzel-morse', { type: 'text', text: 'extractie' });
    await c.tick();
    advance(10_000);
    await c.tick();
    expect(backend.reported).toEqual([
      { teamId: c.team.id, kind: 'puzzle', task: 'puzzel-morse' },
      { teamId: c.team.id, kind: 'escaped' },
    ]);
    const state = c.snapshot().state!;
    expect(backend.finished.get(c.team.id)).toEqual({ score: state.score, ending: 'ontsnapt', endedAt: state.ended!.at });
  });

  it('zonder bereik later melden', async () => {
    const { c, backend, advance } = await playing(escapeGame);
    advance(11 * MIN);
    backend.offline = true;
    await c.answer('puzzel-morse', { type: 'text', text: 'extractie' });
    await c.tick();
    expect(backend.reported).toEqual([]);
    backend.offline = false;
    advance(MIN);
    await c.tick();
    expect(backend.reported).toHaveLength(2);
    expect(backend.finished.has(c.team.id)).toBe(true);
  });

  it('"Nog 10 minuten" één keer, bij een spel met vaste speeltijd (75 minuten)', async () => {
    const { c, advance, buzz } = await playing();
    advance(64 * MIN);
    await c.tick();
    expect(c.snapshot().news).toEqual([]);
    advance(MIN + 1_000);
    await c.tick();
    const flash = c.snapshot().newsCurrent!;
    expect(flash.kind).toBe('time');
    expect(newsView(flash, game, 'nl', t).title).toBe('Nog 10 minuten tot het einde');
    advance(MIN);
    await c.tick();
    expect(c.snapshot().news).toHaveLength(1);
    expect(buzz).toHaveLength(1);
  });

  it('"Nog 10 minuten" niet als het in het beheer uit staat', async () => {
    const { c, backend, advance } = await playing();
    backend.newsAuto = { timeLeft: false };
    await c.tick();
    advance(66 * MIN);
    await c.tick();
    expect(c.snapshot().news).toEqual([]);
  });
});

describe('eindscherm', () => {
  it('plaats tussen de teams die klaar zijn, voorlopig zolang er nog teams spelen', async () => {
    const { c, backend, advance } = await playing(escapeGame);
    advance(11 * MIN);
    await c.answer('puzzel-morse', { type: 'text', text: 'extractie' });
    const score = c.snapshot().state!.score;
    backend.finished.set('team-a', { score: score + 50, ending: 'ontsnapt', endedAt: T0 });
    backend.finished.set('team-b', { score: score - 50, ending: 'tijd-op', endedAt: T0 });
    backend.summary = { distance: 2_400, teams: 4, firstEscapeTeam: 'team-a', firstPuzzleTeam: c.team.id };
    await c.loadSummary();
    const stats = c.endStats()!;
    expect(stats).toMatchObject({ meters: 2_400, place: 2, teams: 4, provisional: true, escaped: true, caught: 0 });
    expect(stats.durationMs).toBe(11 * MIN);
    expect(stats.badges).toEqual(['escaped', 'neverCaught', 'fastest', 'noHints']);
  });

  it('zonder bereik: de afstand van deze telefoon, zonder plaats', async () => {
    const { c, backend, advance } = await playing(escapeGame);
    const at = (m: number) => ({ lat: 53.2 + m / 111_000, lng: 5.79, accuracy: 8, at: T0 + 10 * MIN + m * 1000 });
    advance(10 * MIN);
    for (const m of [0, 50, 100, 150]) await c.onLocation(at(m));
    advance(MIN);
    backend.offline = true;
    await c.answer('puzzel-morse', { type: 'text', text: 'extractie' });
    await c.loadSummary();
    const stats = c.endStats()!;
    expect(stats.meters).toBeGreaterThan(140);
    expect(stats.place).toBeUndefined();
  });

  it('kilometers, stappen en rondjes', () => {
    expect(formatKm(6_849, 'nl')).toBe('6,8');
    expect(formatKm(6_849, 'en')).toBe('6.8');
    expect(formatKm(0, 'nl')).toBe('0,0');
    expect(stepsFor(6_800)).toBe(9_000);
    expect(lapsFor(6_800)).toBe(17);
  });

  it('endStats zonder einde van het spel', () => {
    expect(() =>
      endStats({ game, state: { now: T0, score: 0, tasks: {}, firedRules: {}, messages: [], ledger: [], rejected: [] }, events: [], teamId: 'x', startedAt: T0, localMeters: 0 }),
    ).not.toThrow();
  });
});

describe('eigen flits van de spelleider vertalen', () => {
  it('vult de talen van het spel aan', async () => {
    const r = await translateNews(
      async (body) => ({
        ok: true,
        json: async () => ({ translations: Object.fromEntries((body as { targets: string[] }).targets.map((l) => [l, { title: `T-${l}`, body: `B-${l}` }])) }),
      }),
      'nl',
      ['nl', 'en', 'de'],
      'Kom naar de brug',
      'Daar staat iets klaar',
    );
    expect(r).toEqual({
      title: { nl: 'Kom naar de brug', en: 'T-en', de: 'T-de' },
      body: { nl: 'Daar staat iets klaar', en: 'B-en', de: 'B-de' },
      translated: true,
    });
  });

  it('zonder vertaling toch de getypte tekst', async () => {
    const r = await translateNews(async () => ({ ok: false, json: async () => ({}) }), 'nl', ['nl', 'en'], 'Kom', '');
    expect(r).toEqual({ title: { nl: 'Kom' }, body: {}, translated: false });
  });
});
