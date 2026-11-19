/**
 * Fysieke puzzels: de lijst met puzzels uit de tassen (tabel puzzles) en hoe
 * een stad per puzzelplek kiest welke puzzel erin zit.
 *
 * Er zijn altijd zes puzzelplekken (de opdrachten met de tag "puzzel" in het
 * template). Tijdlijn, codevakjes en de finale blijven aan die plekken
 * vastzitten; de gekozen puzzel vult alleen titel, tekst, antwoord, hints en
 * reacties van de plek in.
 */
import type { AnswerSpec, GamePackage, Hint, Task, Text } from '@hunt/engine';

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

/** Alle gekozen puzzels in het spelpakket zetten. Een puzzel die niet (meer) bestaat, laat de plek zoals hij is. */
export function applyPuzzles(game: GamePackage, choice: PuzzleChoice, puzzles: PuzzleRow[]): GamePackage {
  const byId = new Map(puzzles.map((p) => [p.id, p]));
  return {
    ...game,
    tasks: game.tasks.map((t) => {
      const id = choice[t.id];
      const puzzle = id ? byId.get(id) : undefined;
      return puzzle && t.tags.includes('puzzel') ? applyPuzzle(t, puzzle) : t;
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
