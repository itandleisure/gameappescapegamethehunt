import { describe, expect, it } from 'vitest';
import { checkAnswer, matchesAccepted, normalizeText, parseNumber } from '../src/answers.js';
import type { AnswerSpec } from '../src/types.js';

describe('antwoorden', () => {
  it('vergelijkt tekst zonder hoofdletters, spaties en accenten', () => {
    expect(normalizeText('  Café  Noord ')).toBe('cafenoord');
    const spec: AnswerSpec = { type: 'text', accepted: ['Café de Waag', 'waag'] };
    expect(checkAnswer(spec, { type: 'text', text: 'cafe DE waag' })).toEqual({ valid: true, correct: true });
    expect(checkAnswer(spec, { type: 'text', text: 'WAAG' })).toEqual({ valid: true, correct: true });
    expect(checkAnswer(spec, { type: 'text', text: 'kerk' })).toEqual({ valid: true, correct: false });
    expect(checkAnswer(spec, { type: 'text', text: '   ' })).toMatchObject({ valid: false });
  });

  it('leest getallen met komma of punt', () => {
    expect(parseNumber('3,5')).toBe(3.5);
    expect(parseNumber(' 1 200 ')).toBe(1200);
    expect(parseNumber('abc')).toBeUndefined();
    const spec: AnswerSpec = { type: 'number', value: 3.5, tolerance: 0.1 };
    expect(checkAnswer(spec, { type: 'number', value: '3,55' })).toEqual({ valid: true, correct: true });
    expect(checkAnswer(spec, { type: 'number', value: 4 })).toEqual({ valid: true, correct: false });
  });

  it('meerkeuze en meerdere antwoorden', () => {
    const choice: AnswerSpec = { type: 'choice', options: [{ nl: 'a' }, { nl: 'b' }], correct: 1 };
    expect(checkAnswer(choice, { type: 'choice', option: 1 })).toEqual({ valid: true, correct: true });
    expect(checkAnswer(choice, { type: 'choice', option: 5 })).toMatchObject({ valid: false });
    const multi: AnswerSpec = { type: 'multi', options: [{ nl: 'a' }, { nl: 'b' }, { nl: 'c' }], correct: [0, 2] };
    expect(checkAnswer(multi, { type: 'multi', options: [2, 0] })).toEqual({ valid: true, correct: true });
    expect(checkAnswer(multi, { type: 'multi', options: [0] })).toEqual({ valid: true, correct: false });
    expect(checkAnswer(multi, { type: 'multi', options: [0, 1, 2] })).toEqual({ valid: true, correct: false });
  });

  it('info en foto tellen als goed; verkeerd type wordt geweigerd', () => {
    expect(checkAnswer({ type: 'info' }, { type: 'info' })).toEqual({ valid: true, correct: true });
    expect(checkAnswer({ type: 'photo' }, { type: 'photo', photoId: 'p1' })).toEqual({ valid: true, correct: true });
    expect(checkAnswer({ type: 'photo' }, { type: 'info' })).toMatchObject({ valid: false });
  });

  it('kent een jokerteken in goedgekeurde antwoorden, zoals Loquiz', () => {
    const spec = { type: 'text' as const, accepted: ['ver*'] };
    expect(checkAnswer(spec, { type: 'text', text: 'Verloren' })).toEqual({ valid: true, correct: true });
    expect(checkAnswer(spec, { type: 'text', text: 'ver' })).toEqual({ valid: true, correct: true });
    expect(checkAnswer(spec, { type: 'text', text: 'over' })).toEqual({ valid: true, correct: false });
    expect(matchesAccepted('*toren', 'Oldehove toren')).toBe(true);
    expect(matchesAccepted('a.b', 'axb')).toBe(false);
  });
});
