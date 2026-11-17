import { composeGame } from '@hunt/engine';
import { describe, expect, it } from 'vitest';
import { leeuwarden, leeuwardenPoints, theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { formatDuration, msg, MESSAGES, pickLanguage } from '../src/core/i18n.js';
import { Retry } from '../src/core/outbox.js';
import { chooseMaxZoom, playAreaBounds, tileCount } from '../src/core/play-area.js';
import { fromEventRow, toEventRow } from '../src/core/supabase-backend.js';

const game = composeGame(theHuntBase, [leeuwarden], { id: 'lwd', version: 1 });

describe('speelveld', () => {
  it('omvat alle locaties van alle tracks met marge', () => {
    const [w, s, e, n] = playAreaBounds(game)!;
    for (const p of [leeuwardenPoints.start, leeuwardenPoints.extractieA, leeuwardenPoints.extractieC, leeuwardenPoints.track(5, 1)]) {
      expect(p.lng).toBeGreaterThan(w);
      expect(p.lng).toBeLessThan(e);
      expect(p.lat).toBeGreaterThan(s);
      expect(p.lat).toBeLessThan(n);
    }
  });

  it('houdt de download van een stad klein', () => {
    const bounds = playAreaBounds(game)!;
    const maxZoom = chooseMaxZoom(bounds);
    expect(maxZoom).toBeGreaterThanOrEqual(16);
    expect(tileCount(bounds, 12, maxZoom)).toBeLessThanOrEqual(3000);
  });

  it('heeft geen speelveld zonder locaties', () => {
    expect(playAreaBounds({ ...game, tasks: [], meetingPoint: undefined })).toBeUndefined();
  });
});

describe('talen van de app', () => {
  it('kiest de taal van de telefoon als het spel die heeft', () => {
    expect(pickLanguage(['es-ES', 'en-GB'], ['nl', 'en', 'es'], 'nl')).toBe('es');
    expect(pickLanguage(['fr-FR'], ['nl', 'en'], 'nl')).toBe('nl');
    expect(pickLanguage([], ['en'], 'nl')).toBe('en');
  });

  it('heeft elke tekst in elke taal', () => {
    const keys = Object.keys(MESSAGES.nl!).sort();
    for (const [lang, messages] of Object.entries(MESSAGES)) {
      expect(Object.keys(messages).sort(), lang).toEqual(keys);
      for (const value of Object.values(messages)) expect(value.trim(), lang).not.toBe('');
    }
  });

  it('vult variabelen in en valt terug op Engels', () => {
    expect(msg('nl', 'hintCost', { cost: 25 })).toBe('Hint gebruiken (−25 punten)');
    expect(msg('fi', 'submit')).toBe('Submit');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_909_000)).toBe('1:05:09');
  });
});

describe('opnieuw proberen', () => {
  it('wacht steeds langer, tot maximaal een minuut', () => {
    const r = new Retry(2_000, 60_000);
    r.failed(0);
    expect(r.ready(1_999)).toBe(false);
    expect(r.ready(2_000)).toBe(true);
    for (let i = 0; i < 10; i++) r.failed(0);
    expect(r.ready(59_999)).toBe(false);
    expect(r.ready(60_000)).toBe(true);
    r.succeeded();
    expect(r.ready(0)).toBe(true);
  });
});

describe('gebeurtenissen in de database', () => {
  it('gaan heen en terug zonder verlies', () => {
    const event = { id: 'e1', at: Date.UTC(2026, 0, 1), type: 'answered' as const, task: 'puzzel-morse', answer: { type: 'text' as const, text: 'EXTRACTIE' } };
    const row = toEventRow('team-1', event);
    expect(row).toMatchObject({ team_id: 'team-1', type: 'answered', task_key: 'puzzel-morse', payload: { answer: event.answer } });
    expect(fromEventRow(row)).toEqual(event);
  });
});
