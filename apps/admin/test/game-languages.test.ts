import { describe, expect, it } from 'vitest';
import { GAME_LANGUAGES, GAME_LANGUAGE_FLAGS, gameLanguageList, gameLanguageName, gameLanguageTag, languageName } from '../src/lib/game-languages.js';

describe('namen van speltalen', () => {
  it('geeft vlag, Nederlandse naam en eigen naam', () => {
    expect(gameLanguageName('el', 'nl')).toBe('🇬🇷 Grieks (Ελληνικά)');
    expect(gameLanguageName('bg', 'nl')).toBe('🇧🇬 Bulgaars (Български)');
    expect(gameLanguageName('nl', 'nl')).toBe('🇳🇱 Nederlands');
    expect(gameLanguageName('ga', 'nl')).toBe('🇮🇪 Iers (Gaeilge)');
  });

  it('volgt de taal van de beheeromgeving', () => {
    expect(languageName('el', 'en')).toBe('Greek');
    expect(languageName('el', 'es')).toBe('Griego');
    expect(gameLanguageList(['nl', 'en'], 'nl')).toBe('🇳🇱 Nederlands, 🇬🇧 Engels');
    expect(gameLanguageTag('mt')).toBe('🇲🇹 MT');
  });

  it('heeft een vlag en een Nederlandse naam voor elke taal', () => {
    for (const code of GAME_LANGUAGES) {
      expect(GAME_LANGUAGE_FLAGS[code]).toBeTruthy();
      expect(languageName(code, 'nl')).not.toBe(code.toUpperCase());
    }
  });
});
