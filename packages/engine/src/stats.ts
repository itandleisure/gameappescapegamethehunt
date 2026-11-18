import { distanceMeters, type GpsFix } from './geo.js';
import type { GamePackage, RevealPiece, TeamState, Text } from './types.js';

export interface DistanceOptions {
  /** Metingen met grotere onzekerheid tellen niet mee. Standaard 30 m. */
  maxAccuracy?: number;
  /** Kleinere stappen zijn ruis van stilstaan en tellen niet. Standaard 5 m. */
  minStep?: number;
  /** Snellere sprongen zijn GPS-fouten (lopend team). Standaard 8 m/s. */
  maxSpeed?: number;
}

/**
 * Totaal afgelegde afstand in meters uit de GPS-route van een team.
 * Filtert onnauwkeurige metingen, ruis bij stilstaan en sprongen in het
 * signaal, zodat de afstand niet oploopt terwijl een team op één plek staat.
 * Dezelfde regels staan in de databasefunctie `team_distance`.
 */
export function routeDistance(fixes: readonly GpsFix[], options: DistanceOptions = {}): number {
  const maxAccuracy = options.maxAccuracy ?? 30;
  const minStep = options.minStep ?? 5;
  const maxSpeed = options.maxSpeed ?? 8;
  const usable = fixes.filter((f) => f.accuracy >= 0 && f.accuracy <= maxAccuracy).sort((a, b) => a.at - b.at);
  let total = 0;
  let anchor = usable[0];
  let previousAt = anchor?.at ?? 0;
  for (const fix of usable.slice(1)) {
    if (!anchor) break;
    const step = distanceMeters(anchor, fix);
    // Snelheid ten opzichte van de vorige meting: een sprong is snel, ook na lang stilstaan.
    const seconds = (fix.at - previousAt) / 1000;
    previousAt = fix.at;
    if (step < minStep) continue;
    if (seconds <= 0 || step / seconds > maxSpeed) continue;
    total += step;
    anchor = fix;
  }
  return total;
}

export interface TeamSummary {
  score: number;
  /** Speeltijd in ms: van start tot einde, of tot nu als het spel nog loopt. */
  durationMs: number;
  distanceMeters: number;
  answered: number;
  correct: number;
  incorrect: number;
  hintsUsed: number;
  ending?: string;
  /** Foto's per opdracht (bijvoorbeeld de fotomissie voor het fotoboek). */
  photos: { task: string; photoId: string }[];
}

/** Samenvatting van een team voor ranglijst, monitor en export. */
export function summarizeTeam(
  game: GamePackage,
  startedAt: number,
  state: TeamState,
  fixes: readonly GpsFix[] = [],
): TeamSummary {
  let answered = 0;
  let correct = 0;
  let incorrect = 0;
  let hintsUsed = 0;
  const photos: TeamSummary['photos'] = [];
  for (const task of game.tasks) {
    const ts = state.tasks[task.id];
    if (!ts) continue;
    hintsUsed += ts.hintsUsed;
    if (ts.status === 'done' && task.answer.type !== 'info') {
      answered += 1;
      if (ts.correct) correct += 1;
      else incorrect += 1;
    }
    if (ts.lastAnswer?.type === 'photo') photos.push({ task: task.id, photoId: ts.lastAnswer.photoId });
  }
  const end = state.ended?.at ?? state.now;
  const summary: TeamSummary = {
    score: state.score,
    durationMs: Math.max(0, end - startedAt),
    distanceMeters: Math.round(routeDistance(fixes.filter((f) => f.at >= startedAt && f.at <= end))),
    answered,
    correct,
    incorrect,
    hintsUsed,
    photos,
  };
  if (state.ended) summary.ending = state.ended.ending;
  return summary;
}

/** Ranglijst: hoogste score eerst, bij gelijke score de snelste. */
export function rank<T extends { score: number; durationMs: number }>(teams: readonly T[]): (T & { rank: number })[] {
  const sorted = [...teams].sort((a, b) => b.score - a.score || a.durationMs - b.durationMs);
  return sorted.map((t, i) => {
    const prev = sorted[i - 1];
    const same = prev && prev.score === t.score && prev.durationMs === t.durationMs;
    return { ...t, rank: same ? 0 : i + 1 };
  }).map((t, i, all) => ({ ...t, rank: t.rank || all[i - 1]!.rank }));
}

/**
 * Welke vakken van de foto op een playground nog afgedekt zijn: de vakken
 * waarvan de opdracht nog niet goed beantwoord is.
 */
export function hiddenPieces(game: GamePackage, state: TeamState, playground: string): RevealPiece[] {
  const reveal = game.playgrounds.find((p) => p.id === playground)?.reveal;
  if (!reveal) return [];
  return reveal.pieces.filter((piece) => state.tasks[piece.task]?.correct !== true);
}

/** Wat een team op een tabblad met codevakjes ziet. */
export interface CodeView {
  /** Per vakje het stukje code, of null zolang de opdracht nog niet goed is. */
  boxes: (string | null)[];
  /** Het hintveld: null als er geen is, `open: false` zolang de hint nog dicht is. */
  hint: { open: false } | { open: true; text: Text } | null;
}

/**
 * De codevakjes en het hintveld van een tabblad voor één team. Een vakje gaat
 * open als zijn opdracht goed is; het hintveld zodra de hintopdracht zichtbaar
 * wordt (of al gedaan is).
 */
export function codeView(game: GamePackage, state: TeamState, playground: string): CodeView | null {
  const code = game.playgrounds.find((p) => p.id === playground)?.code;
  if (!code) return null;
  const boxes = code.boxes.map((box) => (state.tasks[box.task]?.correct === true ? box.value : null));
  let hint: CodeView['hint'] = null;
  if (code.hint) {
    const task = game.tasks.find((t) => t.id === code.hint);
    const ts = state.tasks[code.hint];
    const open = !!task && !!ts && (ts.correct === true || (ts.status !== 'hidden' && ts.status !== 'deactivated'));
    hint = open ? { open: true, text: task!.body } : { open: false };
  }
  return { boxes, hint };
}
