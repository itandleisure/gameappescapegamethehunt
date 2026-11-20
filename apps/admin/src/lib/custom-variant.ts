/**
 * Op maat maken: een klantvariant van een stad voor één groep, via een kort
 * stappenplan (groep → morsecode → lokale vragen → klaar). Alleen de velden
 * die het basisspel voor klanten aanpasbaar maakt, komen in het stappenplan.
 */
import type { GamePackage, Task, Text } from '@hunt/engine';
import { citySlug } from './city-rollout';
import type { LayerRows, OverrideRow, TranslationRow } from './game-model';
import { t as tr } from './i18n';

/** Welke opdrachten het stappenplan aanpast, afgeleid uit de aanpasbare velden van het basisspel. */
export interface CustomSpec {
  /** De morsecodepuzzel: hints (en misschien de oplossing) per groep. */
  morse: { key: string; answer: boolean } | null;
  /** De lokale vragen: vraagtekst en antwoord per groep. */
  locals: string[];
}

export function customSpec(base: LayerRows): CustomSpec {
  const keyById = new Map(base.tasks.map((t) => [t.id, t.key]));
  const order = new Map(base.tasks.map((t) => [t.key, t.position]));
  const client = (field: string) =>
    base.overridable
      .filter((o) => o.task_id !== null && o.field === field && o.layers.includes('client'))
      .map((o) => keyById.get(o.task_id!))
      .filter((k): k is string => Boolean(k));
  const withHints = client('hints');
  const morseKey = withHints.find((k) => k.includes('morse')) ?? withHints[0] ?? null;
  const answers = new Set(client('answer'));
  const locals = [...new Set(client('body'))]
    .filter((k) => k !== morseKey && answers.has(k))
    .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return { morse: morseKey ? { key: morseKey, answer: answers.has(morseKey) } : null, locals };
}

export type LocalAnswer =
  | { type: 'choice'; options: string[]; correct: number }
  | { type: 'text'; accepted: string }
  | { type: 'number'; value: string };

export interface CustomDraft {
  group: string;
  morse: {
    /** Is de oplossing hetzelfde als in de stad? */
    sameAnswer: boolean;
    answer: string;
    hints: string[];
    costs: number[];
  } | null;
  locals: { key: string; title: string; question: string; answer: LocalAnswer | null }[];
}

const pick = (text: Text | undefined, lang: string) => text?.[lang] ?? text?.nl ?? Object.values(text ?? {})[0] ?? '';

function answerText(answer: Task['answer']): string | null {
  if (answer.type === 'number') return String(answer.value);
  if (answer.type === 'text') return answer.accepted.join(', ');
  return null;
}

function localAnswer(answer: Task['answer'], lang: string): LocalAnswer | null {
  if (answer.type === 'choice') return { type: 'choice', options: answer.options.map((o) => pick(o, lang)), correct: answer.correct };
  if (answer.type === 'text') return { type: 'text', accepted: answer.accepted.join(', ') };
  if (answer.type === 'number') return { type: 'number', value: String(answer.value) };
  return null;
}

/** Startwaarden van het stappenplan: wat het spel nu heeft (de stad, of de kopie waarmee je begint). */
export function draftFrom(pkg: GamePackage, spec: CustomSpec, lang: string, city?: GamePackage): CustomDraft {
  const task = (key: string) => pkg.tasks.find((t) => t.id === key);
  const morse = spec.morse ? task(spec.morse.key) : undefined;
  const cityMorse = spec.morse ? (city ?? pkg).tasks.find((t) => t.id === spec.morse!.key) : undefined;
  const ownAnswer = morse ? answerText(morse.answer) : null;
  const cityAnswer = cityMorse ? answerText(cityMorse.answer) : null;
  return {
    group: '',
    morse: morse
      ? {
          sameAnswer: !spec.morse!.answer || ownAnswer === null || ownAnswer === cityAnswer,
          answer: ownAnswer ?? '',
          hints: morse.hints.map((h) => pick(h.text, lang)),
          costs: morse.hints.map((h) => h.cost),
        }
      : null,
    locals: spec.locals.flatMap((key) => {
      const t = task(key);
      return t ? [{ key, title: pick(t.title, lang), question: pick(t.body, lang), answer: localAnswer(t.answer, lang) }] : [];
    }),
  };
}

/** Wat er per stap nog ontbreekt (leeg = in orde). */
export function checkGroup(draft: CustomDraft): string[] {
  return draft.group.trim() ? [] : [tr('Vul de naam van de groep in.')];
}

export function checkMorse(draft: CustomDraft, answerType: 'number' | 'text' | null): string[] {
  const m = draft.morse;
  if (!m || m.sameAnswer) return [];
  if (!m.answer.trim()) return [tr('Vul de nieuwe oplossing van de morsecode in.')];
  if (answerType === 'number' && !Number.isFinite(Number(m.answer.trim().replace(',', '.'))))
    return [tr('De oplossing van de morsecode moet een getal zijn.')];
  return [];
}

export function checkLocals(draft: CustomDraft): string[] {
  const out: string[] = [];
  for (const l of draft.locals) {
    if (!l.question.trim()) out.push(tr('Vul de vraag in bij {title}.', { title: l.title }));
    const a = l.answer;
    if (a?.type === 'choice' && a.options.filter((o) => o.trim()).length < 2)
      out.push(tr('Geef bij {title} minstens twee antwoorden.', { title: l.title }));
    if (a?.type === 'choice' && !a.options[a.correct]?.trim()) out.push(tr('Kies bij {title} het goede antwoord.', { title: l.title }));
    if (a?.type === 'text' && !a.accepted.trim()) out.push(tr('Vul bij {title} het goede antwoord in.', { title: l.title }));
    if (a?.type === 'number' && !Number.isFinite(Number(a.value.trim().replace(',', '.'))))
      out.push(tr('Het antwoord bij {title} moet een getal zijn.', { title: l.title }));
  }
  return out;
}

/** Het type van de oplossing van de morsecode in de stad (number of text), anders null. */
export function morseAnswerType(pkg: GamePackage, spec: CustomSpec): 'number' | 'text' | null {
  const type = spec.morse ? pkg.tasks.find((t) => t.id === spec.morse!.key)?.answer.type : undefined;
  return type === 'number' || type === 'text' ? type : null;
}

/** Naam en sleutel van het nieuwe spel. */
export function customName(cityName: string, group: string): string {
  return `${cityName} · ${group.trim()}`;
}

export function customSlug(citySlugValue: string, group: string, taken: Iterable<string>): string {
  return citySlug(citySlugValue, group, taken);
}

/** Teksten die naar de andere talen van het spel vertaald moeten worden, per sleutel. */
export function textsToTranslate(draft: CustomDraft, city: GamePackage, spec: CustomSpec, lang: string): Record<string, string> {
  const out: Record<string, string> = {};
  const changed = changedHints(draft, city, spec, lang);
  if (changed) draft.morse!.hints.forEach((h, i) => h.trim() && (out[`${spec.morse!.key}|hint.${i}`] = h.trim()));
  for (const l of draft.locals) {
    if (l.question.trim()) out[`${l.key}|body`] = l.question.trim();
    if (l.answer?.type === 'choice') l.answer.options.forEach((o, i) => o.trim() && (out[`${l.key}|option.${i}`] = o.trim()));
  }
  return out;
}

/** Zijn de hints anders dan in de stad? Zo niet, dan volgt de groep de hints van de stad. */
function changedHints(draft: CustomDraft, city: GamePackage, spec: CustomSpec, lang: string): boolean {
  if (!draft.morse || !spec.morse) return false;
  const cityHints = city.tasks.find((t) => t.id === spec.morse!.key)?.hints ?? [];
  return draft.morse.hints.some((h, i) => h.trim() !== pick(cityHints[i]?.text, lang).trim() && h.trim() !== '');
}

export interface CustomRows {
  translations: TranslationRow[];
  overrides: OverrideRow[];
  /** Velden die vooraf leeg moeten (zodat een kopie of een eerdere poging niets achterlaat). */
  clear: { key: string; taskId: string; field: string }[];
}

/**
 * De rijen voor de klantvariant. `translated` heeft per taal de vertaalde
 * teksten van textsToTranslate (mag ontbreken).
 */
export function draftToRows(
  draft: CustomDraft,
  spec: CustomSpec,
  city: GamePackage,
  base: LayerRows,
  lang: string,
  translated: Record<string, Record<string, string>> = {},
): CustomRows {
  const taskId = (key: string) => base.tasks.find((t) => t.key === key)?.id ?? key;
  const translations: TranslationRow[] = [];
  const overrides: OverrideRow[] = [];
  const clear: CustomRows['clear'] = [];
  const text = (id: string, value: string): Text => {
    const out: Text = { [lang]: value.trim() };
    for (const [l, texts] of Object.entries(translated)) if (l !== lang && texts[id]?.trim()) out[l] = texts[id]!.trim();
    return out;
  };
  const push = (key: string, field: string, value: Text) => {
    for (const [l, v] of Object.entries(value)) if (v) translations.push({ entity: 'task', entity_id: key, field, lang: l, text: v });
  };

  if (spec.morse && draft.morse) {
    const key = spec.morse.key;
    clear.push({ key, taskId: taskId(key), field: 'hints' }, { key, taskId: taskId(key), field: 'answer' });
    if (changedHints(draft, city, spec, lang)) {
      const cityHints = city.tasks.find((t) => t.id === key)?.hints ?? [];
      draft.morse.hints.forEach((h, i) => {
        // Leeg gelaten hint: die van de stad blijft staan.
        const value: Text = h.trim() ? text(`${key}|hint.${i}`, h) : (cityHints[i]?.text ?? {});
        push(key, `hint.${i}`, value);
      });
    }
    if (spec.morse.answer && !draft.morse.sameAnswer) {
      const type = morseAnswerType(city, spec);
      const raw = draft.morse.answer.trim();
      const value =
        type === 'number'
          ? { type: 'number', value: Number(raw.replace(',', '.')) }
          : { type: 'text', accepted: raw.split(',').map((s) => s.trim()).filter(Boolean) };
      overrides.push({ task_id: taskId(key), field: 'answer', value });
    }
  }

  for (const l of draft.locals) {
    clear.push({ key: l.key, taskId: taskId(l.key), field: 'body' }, { key: l.key, taskId: taskId(l.key), field: 'answer' });
    push(l.key, 'body', text(`${l.key}|body`, l.question));
    const a = l.answer;
    if (!a) continue;
    let value: Task['answer'];
    if (a.type === 'choice') {
      const kept = a.options.map((o, i) => ({ o, i })).filter(({ o }) => o.trim());
      value = {
        type: 'choice',
        options: kept.map(({ o, i }) => text(`${l.key}|option.${i}`, o)),
        correct: Math.max(0, kept.findIndex(({ i }) => i === a.correct)),
      };
    } else if (a.type === 'text') {
      value = { type: 'text', accepted: a.accepted.split(',').map((s) => s.trim()).filter(Boolean) };
    } else {
      value = { type: 'number', value: Number(a.value.trim().replace(',', '.')) };
    }
    overrides.push({ task_id: taskId(l.key), field: 'answer', value });
  }
  return { translations, overrides, clear };
}
