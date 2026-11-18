import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_LANGUAGES, DICTIONARIES, pickAdminLanguage, setCurrentLanguage, translate } from '../src/lib/i18n.js';
import { ago } from '../src/lib/live-map.js';

/** Alle teksten die in de code met t('…'), tr('…') of tKey('…') vertaald worden. */
function sourceKeys(): Set<string> {
  const root = join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(join(root, 'app'));
  walk(join(root, 'src'));
  const keys = new Set<string>();
  const rx = /(?<![\w$.])(?:t|tr|tKey)\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(rx)) keys.add(m[2]!.replace(/\\(['"])/g, '$1'));
  }
  return keys;
}

const placeholders = (s: string) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();

describe('vertalingen beheerapp', () => {
  const keys = sourceKeys();

  it('vindt de teksten in de code', () => {
    expect(keys.size).toBeGreaterThan(300);
    expect(keys.has('Uitloggen')).toBe(true);
  });

  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    it(`${lang}: elke tekst is vertaald, met dezelfde {plekken}`, () => {
      const missing = [...keys].filter((k) => !(k in dict));
      expect(missing).toEqual([]);
      const wrong = [...keys].filter((k) => placeholders(k).join() !== placeholders(dict[k]!).join());
      expect(wrong).toEqual([]);
    });

    it(`${lang}: geen vertalingen van teksten die niet meer bestaan`, () => {
      expect(Object.keys(dict).filter((k) => !keys.has(k))).toEqual([]);
    });
  }

  it('vult plekken in en valt terug op Nederlands', () => {
    expect(translate('en', 'Uitloggen')).toBe('Log out');
    expect(translate('de', '{n} teams', { n: 3 })).toBe('3 Teams');
    expect(translate('es', 'Een tekst die (nog) niet bestaat')).toBe('Een tekst die (nog) niet bestaat');
    expect(translate('nl', 'track {n}', { n: 2 })).toBe('track 2');
  });

  it('kiest de taal van de browser als die er is', () => {
    expect(pickAdminLanguage(['pt-BR', 'en'])).toBe('pt');
    expect(pickAdminLanguage(['fr-FR'])).toBe('nl');
    expect(ADMIN_LANGUAGES).toEqual(['nl', 'en', 'de', 'es', 'pt', 'it']);
  });

  it('teksten buiten componenten volgen de gekozen taal', () => {
    const T = Date.UTC(2026, 0, 1);
    setCurrentLanguage('en');
    expect(ago(T, T + 180_000)).toBe('3 min ago');
    setCurrentLanguage('nl');
    expect(ago(T, T + 180_000)).toBe('3 min geleden');
  });
});
