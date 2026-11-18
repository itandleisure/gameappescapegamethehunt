import { locationFor, type GamePackage, type Task, type TeamContext, type TeamState } from '@hunt/engine';

/**
 * Afleidingen uit de toestand voor de schermen. Puur rekenwerk, zodat het
 * zonder telefoon te testen is.
 */

/** Of het team deze opdracht nu kan openen en beantwoorden. */
export function isAnswerable(game: GamePackage, team: TeamContext, state: TeamState, taskId: string): boolean {
  const task = game.tasks.find((t) => t.id === taskId);
  const ts = state.tasks[taskId];
  if (!task || !ts || state.ended) return false;
  if (ts.status === 'open' || ts.status === 'confirming') return true;
  if (ts.status !== 'visible') return false;
  const needsLocation = ts.onMap && locationFor(task, team.track) !== undefined;
  return !needsLocation && (ts.inList || ts.playground !== undefined);
}

/**
 * De opdracht die nu vanzelf in beeld moet komen: eerst het huidige scherm van
 * een reeks (zoals de speluitleg), dan een bevestigingsvraag, dan een open opdracht.
 */
export function taskToShow(game: GamePackage, state: TeamState): string | undefined {
  if (state.ended) return undefined;
  const active = state.activeSequence;
  if (active) {
    const id = game.sequences.find((s) => s.id === active.id)?.tasks[active.index];
    if (id && state.tasks[id]?.status === 'open') return id;
  }
  const confirming = game.tasks.find((t) => state.tasks[t.id]?.status === 'confirming');
  if (confirming) return confirming.id;
  return game.tasks.find((t) => state.tasks[t.id]?.status === 'open')?.id;
}

export interface ListGroup {
  /** Undefined = de gewone lijst; anders de playground. */
  playground?: string;
  tasks: Task[];
}

/** Opdrachten voor het lijstscherm, gegroepeerd per playground. */
export function listGroups(game: GamePackage, state: TeamState): ListGroup[] {
  const groups = new Map<string | undefined, Task[]>();
  for (const task of game.tasks) {
    const ts = state.tasks[task.id];
    if (!ts || ts.status === 'hidden' || ts.status === 'deactivated') continue;
    if (!ts.inList && ts.playground === undefined) continue;
    // Gelezen uitleg (info) staat voortaan alleen nog op het tabblad met naslag, niet meer tussen de opdrachten.
    if (ts.status === 'done' && task.answer.type === 'info') continue;
    const key = ts.playground;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  // Een playground met een foto die stukje voor stukje zichtbaar wordt, staat er altijd.
  for (const p of game.playgrounds) if ((p.reveal || p.body) && !groups.has(p.id)) groups.set(p.id, []);
  const order = [undefined, ...game.playgrounds.map((p) => p.id)];
  return order.filter((k) => groups.has(k)).map((k) => ({ ...(k === undefined ? {} : { playground: k }), tasks: groups.get(k)! }));
}

/** Uitkomst van het laatste antwoord op een opdracht, voor de melding na versturen. */
export function answerFeedback(before: TeamState, after: TeamState, taskId: string): 'correct' | 'wrong' | 'tryAgain' | 'rejected' {
  const b = before.tasks[taskId]!;
  const a = after.tasks[taskId]!;
  if (a.attempts === b.attempts) return 'rejected';
  if (a.status === 'done') return a.correct ? 'correct' : 'wrong';
  return 'tryAgain';
}
