import { describe, expect, it } from 'vitest';
import { checkAnswer } from '@hunt/engine';
import file from '../src/templates/escape-game-the-hunt-v1.json';
import { parseGameFile } from '../src/lib/game-import.js';
import { baseToRows, type LayerRows } from '../src/lib/game-model.js';
import { composeChain } from '../src/lib/game-store.js';
import {
  checkGroup,
  checkLocals,
  checkMorse,
  customName,
  customSlug,
  customSpec,
  draftFrom,
  draftToRows,
  morseAnswerType,
  textsToTranslate,
} from '../src/lib/custom-variant.js';

const parsed = parseGameFile(JSON.stringify(file));
if (!parsed.ok) throw new Error('template niet in te lezen');
const base = baseToRows(parsed.bundle.base, { id: 'base', slug: 'escape-game-the-hunt' });
const layer = (id: string, kind: 'city' | 'client', parent: string, extra: Partial<LayerRows> = {}): LayerRows => ({
  game: { id, slug: id, layer: kind, parent_id: parent, languages: ['nl', 'en'], default_language: 'nl', settings: { name: { nl: id } }, base_version: null },
  tasks: [],
  locations: [],
  rules: [],
  playgrounds: [],
  overridable: [],
  overrides: [],
  translations: [],
  ...extra,
});
const city = layer('leeuwarden', 'city', 'base');
const cityPkg = composeChain([base, city]);
const spec = customSpec(base);

describe('op maat maken', () => {
  it('vindt de morsecode en de twee lokale vragen in het basisspel', () => {
    expect(spec).toEqual({ morse: { key: 'puzzel-morse', answer: true }, locals: ['lokaal-1', 'lokaal-2'] });
    expect(morseAnswerType(cityPkg, spec)).toBe('number');
  });

  it('begint met wat de stad heeft', () => {
    const d = draftFrom(cityPkg, spec, 'nl');
    expect(d.morse?.sameAnswer).toBe(true);
    expect(d.morse?.answer).toBe('159');
    expect(d.morse?.hints).toHaveLength(3);
    expect(d.morse?.costs).toEqual([25, 50, 75]);
    expect(d.locals.map((l) => l.key)).toEqual(['lokaal-1', 'lokaal-2']);
    expect(d.locals[0]!.answer?.type).toBe('choice');
  });

  it('controleert elke stap', () => {
    const d = draftFrom(cityPkg, spec, 'nl');
    expect(checkGroup(d)).toHaveLength(1);
    expect(checkGroup({ ...d, group: 'Parteon' })).toEqual([]);
    expect(checkMorse({ ...d, morse: { ...d.morse!, sameAnswer: false, answer: '' } }, 'number')).toHaveLength(1);
    expect(checkMorse({ ...d, morse: { ...d.morse!, sameAnswer: false, answer: 'abc' } }, 'number')).toHaveLength(1);
    expect(checkMorse({ ...d, morse: { ...d.morse!, sameAnswer: false, answer: '271' } }, 'number')).toEqual([]);
    expect(checkLocals({ ...d, locals: [{ ...d.locals[0]!, question: ' ' }] })).toHaveLength(1);
    expect(checkLocals(d)).toEqual([]);
  });

  it('maakt een klantvariant die het spel echt aanpast', () => {
    const d = draftFrom(cityPkg, spec, 'nl');
    d.group = 'Parteon';
    d.morse = { ...d.morse!, sameAnswer: false, answer: '271', hints: ['Hint een', '', 'Hint drie'] };
    d.locals[0] = { ...d.locals[0]!, question: 'In welk jaar?', answer: { type: 'choice', options: ['1997', '', '2003', '2011'], correct: 2 } };
    d.locals[1] = { ...d.locals[1]!, question: 'Hoeveel woningen?' };
    const texts = textsToTranslate(d, cityPkg, spec, 'nl');
    expect(Object.keys(texts)).toContain('puzzel-morse|hint.0');
    expect(texts['lokaal-1|body']).toBe('In welk jaar?');
    const en = Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, `EN ${v}`]));
    const rows = draftToRows(d, spec, cityPkg, base, 'nl', { en });
    const client = layer('leeuwarden-parteon', 'client', 'leeuwarden', { translations: rows.translations, overrides: rows.overrides });
    const pkg = composeChain([base, city, client]);

    const morse = pkg.tasks.find((t) => t.id === 'puzzel-morse')!;
    expect(checkAnswer(morse.answer, { type: 'number', value: 271 })).toEqual({ valid: true, correct: true });
    expect(morse.hints.map((h) => h.text.nl)).toEqual(['Hint een', cityPkg.tasks.find((t) => t.id === 'puzzel-morse')!.hints[1]!.text.nl, 'Hint drie']);
    expect(morse.hints[0]!.text.en).toBe('EN Hint een');
    expect(morse.hints.map((h) => h.cost)).toEqual([25, 50, 75]);

    const q1 = pkg.tasks.find((t) => t.id === 'lokaal-1')!;
    expect(q1.body).toEqual({ nl: 'In welk jaar?', en: 'EN In welk jaar?' });
    expect(q1.answer).toEqual({ type: 'choice', options: [{ nl: '1997', en: 'EN 1997' }, { nl: '2003', en: 'EN 2003' }, { nl: '2011', en: 'EN 2011' }], correct: 1 });
    // De locaties blijven die van de stad.
    expect(q1.trackLocations).toEqual(cityPkg.tasks.find((t) => t.id === 'lokaal-1')!.trackLocations);
  });

  it('laat de oplossing en de hints van de stad staan als die niet veranderen', () => {
    const d = { ...draftFrom(cityPkg, spec, 'nl'), group: 'Parteon' };
    const rows = draftToRows(d, spec, cityPkg, base, 'nl');
    expect(rows.translations.some((r) => r.field.startsWith('hint.'))).toBe(false);
    expect(rows.overrides.some((o) => o.field === 'answer' && o.task_id === base.tasks.find((t) => t.key === 'puzzel-morse')!.id)).toBe(false);
    // Wel opruimen wat een kopie meebracht.
    expect(rows.clear.map((c) => `${c.key}:${c.field}`)).toContain('puzzel-morse:hints');
  });

  it('naam en sleutel', () => {
    expect(customName('Leeuwarden', ' Parteon ')).toBe('Leeuwarden · Parteon');
    expect(customSlug('leeuwarden', 'Parteon B.V.', ['leeuwarden-parteon-b-v'])).toBe('leeuwarden-parteon-b-v-2');
  });
});
