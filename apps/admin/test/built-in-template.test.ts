import { describe, expect, it } from 'vitest';
import { checkAnswer, composeGame } from '@hunt/engine';
import file from '../src/templates/escape-game-the-hunt-v1.json';
import { parseGameFile } from '../src/lib/game-import.js';

describe('meegeleverde template v1', () => {
  it('is in te lezen en samen te stellen', () => {
    const parsed = parseGameFile(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.slug).toBe('escape-game-the-hunt');
    expect(parsed.bundle.variants).toEqual([]);
    expect(composeGame(parsed.bundle.base, [], { id: parsed.slug, version: 1 }).tasks.length).toBeGreaterThan(20);
  });

  it('blokjespuzzel: 314 en 413 zijn goed, wat ertussen ligt niet', () => {
    const parsed = parseGameFile(JSON.stringify(file));
    if (!parsed.ok) throw new Error('template niet in te lezen');
    const spec = parsed.bundle.base.tasks.find((t) => t.id === 'puzzel-blokjes')!.answer;
    const check = (text: string) => checkAnswer(spec, { type: 'text', text });
    expect(check('314')).toEqual({ valid: true, correct: true });
    expect(check(' 413 ')).toEqual({ valid: true, correct: true });
    expect(check('363')).toEqual({ valid: true, correct: false });
  });
});
