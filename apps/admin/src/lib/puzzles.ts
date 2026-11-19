/**
 * Fysieke puzzels: de lijst met puzzels uit de tassen (tabel puzzles) en hoe
 * een stad per puzzelplek kiest welke puzzel erin zit.
 *
 * Er zijn altijd zes puzzelplekken (de opdrachten met de tag "puzzel" in het
 * template). Tijdlijn, codevakjes en de finale blijven aan die plekken
 * vastzitten; de gekozen puzzel vult alleen titel, tekst, antwoord, hints en
 * reacties van de plek in.
 */
import type { Action, AnswerSpec, GamePackage, Hint, Task, Text } from '@hunt/engine';

export interface PuzzleRow {
  id: string;
  name: string;
  title: Text;
  body: Text;
  correct_comment: Text;
  wrong_comment: Text;
  answer: Extract<AnswerSpec, { type: 'text' } | { type: 'number' }>;
  hints: Hint[];
}

export const PUZZLE_COLUMNS = 'id, name, title, body, correct_comment, wrong_comment, answer, hints';

/** Keuze per puzzelplek (sleutel van de opdracht) → id van de puzzel; geen keuze = die uit het template. */
export type PuzzleChoice = Record<string, string | null>;

const filled = (t: Text | undefined | null): t is Text => !!t && Object.values(t).some((v) => typeof v === 'string' && v.trim());

/** De puzzelplekken van het spel (opdrachten met de tag "puzzel"), in spelvolgorde. */
export function puzzleSlots(game: GamePackage): Task[] {
  return game.tasks.filter((t) => t.tags.includes('puzzel'));
}

/** De keuze uit games.settings.puzzles. Oude waarden (true/false, 'nl'/'int') tellen als geen keuze. */
export function puzzleChoice(settings: Record<string, unknown> | null | undefined, game: GamePackage): PuzzleChoice {
  const saved = (settings?.puzzles ?? {}) as Record<string, unknown>;
  const uuid = /^[0-9a-f-]{36}$/i;
  return Object.fromEntries(
    puzzleSlots(game).map((t) => {
      const v = saved[t.id];
      return [t.id, typeof v === 'string' && uuid.test(v) ? v : null];
    }),
  );
}

/** De gekozen puzzel op een plek zetten. Lege teksten nemen die van de plek over. */
export function applyPuzzle(task: Task, puzzle: PuzzleRow): Task {
  return {
    ...task,
    title: filled(puzzle.title) ? puzzle.title : task.title,
    body: filled(puzzle.body) ? puzzle.body : task.body,
    correctComment: filled(puzzle.correct_comment) ? puzzle.correct_comment : task.correctComment,
    wrongComment: filled(puzzle.wrong_comment) ? puzzle.wrong_comment : task.wrongComment,
    answer: puzzle.answer,
    hints: puzzle.hints.map((h) => ({ ...h, text: h.text ?? {} })),
  };
}

/**
 * Alle gekozen puzzels in het spelpakket zetten. Een puzzel die niet (meer)
 * bestaat, laat de plek zoals hij is. Teksten die de oude puzzel bij naam
 * noemen (de tijdlijnberichten, de uitleg) krijgen de naam van de nieuwe.
 */
export function applyPuzzles(game: GamePackage, choice: PuzzleChoice, puzzles: PuzzleRow[]): GamePackage {
  const byId = new Map(puzzles.map((p) => [p.id, p]));
  let out: GamePackage = game;
  for (const slot of puzzleSlots(game)) {
    const id = choice[slot.id];
    const puzzle = id ? byId.get(id) : undefined;
    if (!puzzle) continue;
    const next = applyPuzzle(slot, puzzle);
    out = renameMentions({ ...out, tasks: out.tasks.map((t) => (t.id === slot.id ? next : t)) }, slot, next);
  }
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Vervangt per taal de oude naam door de nieuwe. `loose`: overal; anders alleen "naam puzzel", "naam-puzzel" of "naampuzzel". */
function renameText(text: Text, from: Text, to: Text, loose: boolean): Text {
  let changed = false;
  const result: Text = {};
  for (const [lang, value] of Object.entries(text)) {
    const old = from[lang]?.trim() || from.nl?.trim();
    const name = to[lang]?.trim() || to.nl?.trim();
    if (typeof value !== 'string' || !old || !name || old === name) {
      result[lang] = value;
      continue;
    }
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escape(old)}${loose ? '' : '(?=[ -]?puzzel)'}`, 'giu');
    const next = value.replace(pattern, () => name);
    if (next !== value) changed = true;
    result[lang] = next;
  }
  return changed ? result : text;
}

/** Waar de oude puzzel bij naam genoemd wordt, de naam van de nieuwe zetten. */
function renameMentions(game: GamePackage, before: Task, after: Task): GamePackage {
  const from = before.title ?? {};
  const to = after.title ?? {};
  // Regels die deze puzzel vrijgeven: hun bericht gaat over deze puzzel.
  const showsSlot = (a: Action) =>
    a.kind === 'show' && (('task' in a.select && a.select.task === before.id) || ('tasks' in a.select && a.select.tasks.includes(before.id)));
  return {
    ...game,
    rules: game.rules.map((r) => {
      const loose = r.then.some(showsSlot);
      let changed = false;
      const then = r.then.map((a) => {
        if (a.kind !== 'message') return a;
        const text = renameText(a.text, from, to, loose);
        if (text === a.text) return a;
        changed = true;
        return { ...a, text };
      });
      return changed ? { ...r, then } : r;
    }),
    tasks: game.tasks.map((t) => {
      const own = t.id === before.id;
      const body = renameText(t.body, from, to, own);
      return body === t.body ? t : { ...t, body };
    }),
  };
}

/** Een puzzel uit een opdracht van het template, om de lijst mee te beginnen. */
export function puzzleFromTask(task: Task, name: string): Omit<PuzzleRow, 'id'> | null {
  if (task.answer.type !== 'text' && task.answer.type !== 'number') return null;
  return {
    name,
    title: task.title ?? {},
    body: task.body ?? {},
    correct_comment: task.correctComment ?? {},
    wrong_comment: task.wrongComment ?? {},
    answer: task.answer,
    hints: task.hints,
  };
}
