import { describe, expect, it } from 'vitest';
import { composeGame } from '@hunt/engine';
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
});
