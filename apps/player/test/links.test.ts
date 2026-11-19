import { describe, expect, it } from 'vitest';
import { joinRoute, parseJoinLink } from '../src/core/links.js';

describe('spellinks openen de app', () => {
  it('leest https-links', () => {
    expect(parseJoinLink('https://escapegamethehunt.badassgames.nl/the-hunt-leeuwarden:abc12')).toEqual({ gameId: 'the-hunt-leeuwarden', code: 'ABC12' });
    expect(parseJoinLink('https://escapegamethehunt.badassgames.nl/leeuwarden%3AABC12?utm=x')).toEqual({ gameId: 'leeuwarden', code: 'ABC12' });
    expect(parseJoinLink('/leeuwarden:ABC12')).toEqual({ gameId: 'leeuwarden', code: 'ABC12' });
  });

  it('leest het eigen adres van de app', () => {
    expect(parseJoinLink('thehunt:///?code=abc12&game=leeuwarden')).toEqual({ gameId: 'leeuwarden', code: 'ABC12' });
    expect(parseJoinLink('thehunt://leeuwarden:ABC12')).toEqual({ gameId: 'leeuwarden', code: 'ABC12' });
  });

  it('laat andere links met rust', () => {
    expect(parseJoinLink('https://escapegamethehunt.badassgames.nl/resultaten/leeuwarden:ABC12')).toBeNull();
    expect(parseJoinLink('/play')).toBeNull();
    expect(parseJoinLink('/task/abc')).toBeNull();
    expect(parseJoinLink('/leeuwarden:AB')).toBeNull();
  });

  it('gaat naar aanmelden met de code', () => {
    expect(joinRoute({ gameId: 'leeuwarden', code: 'ABC12' })).toBe('/?code=ABC12&game=leeuwarden');
  });
});
