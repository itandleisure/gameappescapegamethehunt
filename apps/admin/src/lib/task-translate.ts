/**
 * Vertalen vanuit het Nederlands: welke teksten van een opdracht gaan naar de
 * vertaaldienst, en hoe komen de vertalingen terug in het formulier of de
 * database. Puur (zonder netwerk), zodat het te testen is.
 *
 * Velden heten zoals in de tabel `translations`: title, body, confirm,
 * correctComment, wrongComment, option.<n> en hint.<n>.
 */
import { richToPlain } from '@hunt/engine';
import type { TranslationRow } from './game-model';
import type { TaskForm, Texts } from './task-form';

/** Brontaal: Nederlands als het spel dat heeft, anders de standaardtaal. */
export function sourceLanguage(languages: readonly string[], defaultLanguage: string): string {
  return languages.includes('nl') ? 'nl' : defaultLanguage;
}

/** Is deze tekst leeg (ook als er alleen lege opmaak in staat)? */
export function isBlank(value: string | undefined): boolean {
  return !value || richToPlain(value).trim() === '';
}

type Simple = 'title' | 'body' | 'confirm' | 'correctComment' | 'wrongComment';
const SIMPLE: Simple[] = ['title', 'body', 'confirm', 'correctComment', 'wrongComment'];

/** Groep velden zoals een stad of klant ze mag aanpassen. */
export type FieldGroup = Simple | 'answer' | 'hints';

function groupOf(field: string): FieldGroup {
  if (field.startsWith('option.')) return 'answer';
  if (field.startsWith('hint.')) return 'hints';
  return field as Simple;
}

/** Alle vertaalbare velden van het formulier, met hun teksten per taal. */
export function formFields(form: TaskForm): [string, Texts][] {
  const out: [string, Texts][] = [];
  for (const f of SIMPLE) {
    if (f === 'confirm' && !form.hasConfirm) continue;
    out.push([f, form[f]]);
  }
  if (form.answerType === 'choice' || form.answerType === 'multi') form.options.forEach((o, i) => out.push([`option.${i}`, o]));
  form.hints.forEach((h, i) => out.push([`hint.${i}`, h.text]));
  return out;
}

export interface TranslationJob {
  /** Brontekst per veld. */
  texts: Record<string, string>;
  /** Velden met al een tekst in een doeltaal (die zou worden overschreven). */
  filled: number;
}

/**
 * Wat er vanuit de brontaal te vertalen is. `only` beperkt tot de velden die
 * deze laag mag (en wil) aanpassen. Met `emptyOnly` alleen velden waar in
 * minstens één doeltaal nog niets staat.
 */
export function translationJob(
  form: TaskForm,
  source: string,
  targets: readonly string[],
  opts: { only?: (group: FieldGroup) => boolean; emptyOnly?: boolean } = {},
): TranslationJob {
  const texts: Record<string, string> = {};
  let filled = 0;
  for (const [field, value] of formFields(form)) {
    if (opts.only && !opts.only(groupOf(field))) continue;
    const src = value[source];
    if (isBlank(src)) continue;
    const done = targets.filter((l) => !isBlank(value[l])).length;
    if (opts.emptyOnly && done === targets.length) continue;
    texts[field] = src!;
    filled += done;
  }
  return { texts, filled };
}

/** Vertalingen per taal, per veld. */
export type Translations = Record<string, Record<string, string>>;

/**
 * Zet vertalingen in het formulier. Met `emptyOnly` blijft een tekst die er al
 * stond staan (bijvoorbeeld een met de hand verbeterde vertaling).
 */
export function applyTranslations(form: TaskForm, translations: Translations, emptyOnly: boolean): TaskForm {
  const put = (current: Texts, field: string): Texts => {
    let next = current;
    for (const [lang, byField] of Object.entries(translations)) {
      const text = byField[field];
      if (text === undefined || isBlank(text)) continue;
      if (emptyOnly && !isBlank(current[lang])) continue;
      next = { ...next, [lang]: text };
    }
    return next;
  };
  const out: TaskForm = { ...form };
  for (const f of SIMPLE) out[f] = put(form[f], f);
  out.options = form.options.map((o, i) => put(o, `option.${i}`));
  out.hints = form.hints.map((h, i) => ({ ...h, text: put(h.text, `hint.${i}`) }));
  return out;
}

/**
 * Voor "alle opdrachten vertalen" in het basisspel: per opdracht de velden met
 * een brontekst waarvan minstens één doeltaal nog leeg is.
 */
export function missingPerTask(
  rows: readonly TranslationRow[],
  taskKeys: readonly string[],
  source: string,
  targets: readonly string[],
): Map<string, Record<string, string>> {
  const byField = new Map<string, Map<string, string>>();
  for (const r of rows) {
    if (r.entity !== 'task') continue;
    const k = `${r.entity_id}\u0000${r.field}`;
    if (!byField.has(k)) byField.set(k, new Map());
    byField.get(k)!.set(r.lang, r.text);
  }
  const keys = new Set(taskKeys);
  const out = new Map<string, Record<string, string>>();
  for (const [k, langs] of byField) {
    const [task, field] = k.split('\u0000') as [string, string];
    if (!keys.has(task)) continue;
    const src = langs.get(source);
    if (isBlank(src)) continue;
    if (targets.every((l) => !isBlank(langs.get(l)))) continue;
    if (!out.has(task)) out.set(task, {});
    out.get(task)![field] = src!;
  }
  return out;
}

/** Nieuwe rijen voor `translations`: alleen voor talen die nog leeg zijn. */
export function newTranslationRows(
  rows: readonly TranslationRow[],
  task: string,
  translations: Translations,
): TranslationRow[] {
  const has = new Set(
    rows.filter((r) => r.entity === 'task' && r.entity_id === task && !isBlank(r.text)).map((r) => `${r.field}\u0000${r.lang}`),
  );
  const out: TranslationRow[] = [];
  for (const [lang, byField] of Object.entries(translations)) {
    for (const [field, text] of Object.entries(byField)) {
      if (isBlank(text) || has.has(`${field}\u0000${lang}`)) continue;
      out.push({ entity: 'task', entity_id: task, field, lang, text });
    }
  }
  return out;
}
