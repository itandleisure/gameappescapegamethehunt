import { describe, expect, it } from 'vitest';
import { theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import type { TranslationRow } from '../src/lib/game-model.js';
import { taskToForm, type TaskForm } from '../src/lib/task-form.js';
import { applyTranslations, missingPerTask, newTranslationRows, sourceLanguage, taskLanguageStates, translationJob } from '../src/lib/task-translate.js';

const form = (patch: Partial<TaskForm> = {}): TaskForm => ({
  ...taskToForm(theHuntBase.tasks[0]!),
  title: { nl: 'De toren', en: 'The tower' },
  body: { nl: '<p>Tel de <b>ramen</b>.</p>', en: '<p></p>' },
  hasConfirm: false,
  confirm: { nl: 'Zeker?' },
  correctComment: {},
  wrongComment: { nl: 'Helaas' },
  answerType: 'choice',
  options: [{ nl: 'Drie' }, { nl: 'Vier', de: 'Vier' }],
  correct: [0],
  hints: [{ cost: '10', text: { nl: 'Kijk omhoog' }, image: '' }],
  ...patch,
});

describe('vertalen vanuit het Nederlands', () => {
  it('kiest Nederlands als brontaal, anders de standaardtaal', () => {
    expect(sourceLanguage(['en', 'nl'], 'en')).toBe('nl');
    expect(sourceLanguage(['en', 'de'], 'en')).toBe('en');
  });

  it('stuurt alle velden met een Nederlandse tekst, en telt bestaande vertalingen', () => {
    const job = translationJob(form(), 'nl', ['en', 'de']);
    // Geen bevestigingsvraag (uit) en geen lege velden.
    expect(Object.keys(job.texts).sort()).toEqual(['body', 'hint.0', 'option.0', 'option.1', 'title', 'wrongComment']);
    // Alleen title.en en option.1.de staan er al; een lege <p></p> telt niet.
    expect(job.filled).toBe(2);
  });

  it('slaat met emptyOnly velden over die in elke taal al gevuld zijn', () => {
    const job = translationJob(form({ title: { nl: 'De toren', en: 'The tower', de: 'Der Turm' } }), 'nl', ['en', 'de'], { emptyOnly: true });
    expect(job.texts.title).toBeUndefined();
    expect(job.texts['option.1']).toBe('Vier');
  });

  it('beperkt een variant tot de velden die hij zelf aanpast', () => {
    const job = translationJob(form(), 'nl', ['en'], { only: (g) => g === 'hints' });
    expect(Object.keys(job.texts)).toEqual(['hint.0']);
  });

  it('zet vertalingen in het formulier en laat met emptyOnly bestaande teksten staan', () => {
    const result = {
      en: { title: 'The Tower!', body: '<p>Count the <b>windows</b>.</p>', 'option.0': 'Three', 'hint.0': 'Look up' },
      de: { title: 'Der Turm', 'option.1': 'Vier!' },
    };
    const keep = applyTranslations(form(), result, true);
    expect(keep.title).toEqual({ nl: 'De toren', en: 'The tower', de: 'Der Turm' });
    expect(keep.body.en).toBe('<p>Count the <b>windows</b>.</p>');
    expect(keep.options[0]).toEqual({ nl: 'Drie', en: 'Three' });
    expect(keep.options[1]!.de).toBe('Vier');
    expect(keep.hints[0]!.text.en).toBe('Look up');
    const all = applyTranslations(form(), result, false);
    expect(all.title.en).toBe('The Tower!');
    expect(all.options[1]!.de).toBe('Vier!');
  });

  it('vindt per opdracht wat nog ontbreekt en maakt alleen nieuwe rijen', () => {
    const row = (entity_id: string, field: string, lang: string, text: string): TranslationRow => ({ entity: 'task', entity_id, field, lang, text });
    const rows = [
      row('a', 'title', 'nl', 'Toren'),
      row('a', 'title', 'en', 'Tower'),
      row('a', 'title', 'de', 'Turm'),
      row('a', 'hint.0', 'nl', 'Omhoog'),
      row('a', 'hint.0', 'en', 'Up'),
      row('b', 'body', 'nl', 'Tekst'),
      row('weg', 'title', 'nl', 'Verwijderde opdracht'),
      { entity: 'rule', entity_id: 'r', field: 'message', lang: 'nl', text: 'Regel' },
    ] as TranslationRow[];
    const todo = missingPerTask(rows, ['a', 'b'], 'nl', ['en', 'de']);
    expect(Object.fromEntries(todo)).toEqual({ a: { 'hint.0': 'Omhoog' }, b: { body: 'Tekst' } });
    const fresh = newTranslationRows(rows, 'a', { en: { 'hint.0': 'Look up' }, de: { 'hint.0': 'Nach oben', title: 'Turm!' } });
    expect(fresh).toEqual([row('a', 'hint.0', 'de', 'Nach oben')]);
  });
});

describe('vertaalstatus per opdracht', () => {
  it('geeft per taal klaar, deels of niets', () => {
    const row = (entity_id: string, field: string, lang: string, text: string): TranslationRow => ({ entity: 'task', entity_id, field, lang, text });
    const rows = [
      row('a', 'title', 'nl', 'Toren'),
      row('a', 'title', 'en', 'Tower'),
      row('a', 'title', 'de', 'Turm'),
      row('a', 'hint.0', 'nl', 'Omhoog'),
      row('a', 'hint.0', 'en', 'Up'),
      row('a', 'body', 'en', 'Alleen Engels'),
      row('b', 'title', 'nl', 'Ander'),
    ];
    expect(taskLanguageStates(rows, 'a', 'nl', ['nl', 'en', 'de', 'es'])).toEqual({ nl: 'done', en: 'done', de: 'partial', es: 'none' });
    expect(taskLanguageStates(rows, 'leeg', 'nl', ['en'])).toEqual({ en: 'done' });
  });
});
