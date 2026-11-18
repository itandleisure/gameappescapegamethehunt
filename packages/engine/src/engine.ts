import { checkAnswer } from './answers.js';
import { distanceMeters } from './geo.js';
import type {
  Action,
  Condition,
  GameEvent,
  GamePackage,
  LedgerEntry,
  Placement,
  Rule,
  Selector,
  Task,
  TaskLocation,
  TaskState,
  TeamContext,
  TeamState,
} from './types.js';

const MINUTE = 60_000;
const MAX_RULE_PASSES = 100;

/**
 * Berekent de toestand van een team uit het spelpakket, de teamgegevens en
 * de lijst gebeurtenissen, op tijdstip `now`.
 *
 * De berekening is volledig deterministisch: dezelfde invoer geeft altijd
 * dezelfde toestand. Daardoor kan de app hem offline draaien en rekent de
 * server hem na met precies dezelfde code.
 *
 * Elke regel vuurt hooguit één keer, op het eerste moment dat de voorwaarde
 * waar wordt. Tijdregels ("na 10 minuten") vuren op het exacte moment, ook als
 * er op dat moment geen gebeurtenis was.
 */
export function computeState(
  game: GamePackage,
  team: TeamContext,
  events: readonly GameEvent[],
  now: number,
): TeamState {
  return new Run(game, team).replay(events, now);
}

/** Zoekt de locatie van een opdracht voor een bepaalde track. */
export function locationFor(task: Task, track: number): TaskLocation | undefined {
  return task.trackLocations?.[track] ?? task.location;
}

/** Opdrachten die het team nu via GPS kan openen (voor de LocationGate in de app). */
export function reachableTargets(game: GamePackage, team: TeamContext, state: TeamState) {
  if (state.ended) return [];
  return game.tasks.flatMap((task) => {
    const ts = state.tasks[task.id];
    const location = locationFor(task, team.track);
    if (!ts || !location || ts.status !== 'visible' || !ts.onMap) return [];
    return [{ task: task.id, location }];
  });
}

/** Of een team nu een hint mag gebruiken voor deze opdracht. */
export function canUseHint(game: GamePackage, state: TeamState, taskId: string): boolean {
  const task = game.tasks.find((t) => t.id === taskId);
  const ts = state.tasks[taskId];
  if (!task || !ts || state.ended) return false;
  if (ts.status !== 'visible' && ts.status !== 'open') return false;
  return ts.hintsUsed < task.hints.length;
}

/**
 * De opdrachten van de speluitleg die teams vóór een centrale start lezen.
 * Is er geen speluitleg ingesteld, dan de eerste reeks die de regels starten
 * (bij The Hunt de introreeks), zodat teams niet eerst op de start wachten.
 */
export function briefingTasks(game: GamePackage): string[] {
  let id = game.briefing;
  if (!id) {
    for (const rule of game.rules) {
      const a = rule.then.find((x) => x.kind === 'startSequence');
      if (a?.kind === 'startSequence') {
        id = a.sequence;
        break;
      }
    }
  }
  return (id && game.sequences.find((s) => s.id === id)?.tasks) || [];
}

class Run {
  private readonly tasks = new Map<string, Task>();
  private readonly state: TeamState;
  private current: number;

  constructor(
    private readonly game: GamePackage,
    private readonly team: TeamContext,
  ) {
    for (const task of game.tasks) this.tasks.set(task.id, task);
    this.current = team.startedAt;
    const initial = (): TaskState => ({ status: 'hidden', onMap: false, inList: false, attempts: 0, hintsUsed: 0 });
    this.state = {
      now: team.startedAt,
      score: 0,
      tasks: Object.fromEntries(game.tasks.map((t) => [t.id, initial()])),
      firedRules: {},
      messages: [],
      ledger: [],
      rejected: [],
    };
    // Speluitleg al vóór de start gelezen: die opdrachten zijn bij de start afgerond.
    for (const id of team.briefingRead ? briefingTasks(game) : []) {
      const ts = this.state.tasks[id];
      if (ts) Object.assign(ts, { status: 'done', correct: true, completedAt: team.startedAt });
    }
  }

  replay(events: readonly GameEvent[], now: number): TeamState {
    const seen = new Set<string>();
    const ordered = events
      .filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    this.evaluateRules(this.current);
    for (const event of ordered) {
      if (event.at > now) break;
      const at = Math.max(event.at, this.team.startedAt);
      this.advanceTo(at);
      if (this.state.ended) {
        this.reject(event, 'spel is al afgelopen');
        continue;
      }
      this.apply(event, at);
      this.evaluateRules(at);
    }
    this.advanceTo(Math.max(now, this.current));
    this.state.now = Math.max(now, this.current);
    return this.state;
  }

  // -------------------------------------------------------------------------
  // Tijd
  // -------------------------------------------------------------------------

  /** Laat de tijd lopen tot `target` en vuurt tijdregels op hun exacte moment. */
  private advanceTo(target: number): void {
    while (!this.state.ended) {
      const next = this.nextThreshold(this.current, target);
      if (next === undefined) break;
      this.current = next;
      this.evaluateRules(next);
    }
    this.current = Math.max(this.current, target);
  }

  private nextThreshold(after: number, upTo: number): number | undefined {
    let best: number | undefined;
    const consider = (time: number) => {
      if (time > after && time <= upTo && (best === undefined || time < best)) best = time;
    };
    const walk = (c: Condition): void => {
      switch (c.kind) {
        case 'elapsed':
          consider(this.team.startedAt + c.minutes * MINUTE);
          break;
        case 'afterCompleted': {
          const done = this.state.tasks[c.task]?.completedAt;
          if (done !== undefined) consider(done + c.seconds * 1000);
          break;
        }
        case 'and':
        case 'or':
          c.conditions.forEach(walk);
          break;
        case 'not':
          walk(c.condition);
          break;
        default:
          break;
      }
    };
    for (const rule of this.game.rules) if (!(rule.id in this.state.firedRules)) walk(rule.when);
    return best;
  }

  // -------------------------------------------------------------------------
  // Regels
  // -------------------------------------------------------------------------

  private evaluateRules(at: number): void {
    for (let pass = 0; pass < MAX_RULE_PASSES; pass++) {
      let fired = false;
      for (const rule of this.game.rules) {
        if (this.state.ended) return;
        if (rule.id in this.state.firedRules) continue;
        if (!this.holds(rule.when, at)) continue;
        this.fire(rule, at);
        fired = true;
      }
      if (!fired) return;
    }
    throw new Error('Regels blijven elkaar aanroepen; controleer de regels op een lus.');
  }

  private fire(rule: Rule, at: number): void {
    this.state.firedRules[rule.id] = at;
    for (const action of rule.then) {
      if (this.state.ended) return;
      this.perform(action, at, rule.id);
    }
  }

  private holds(c: Condition, at: number): boolean {
    switch (c.kind) {
      case 'completed':
        return this.match(c.select, c.match, (ts) => ts.status === 'done');
      case 'correct':
        return this.match(c.select, c.match, (ts) => ts.status === 'done' && ts.correct === true);
      case 'incorrect':
        return this.match(c.select, c.match, (ts) => ts.status === 'done' && ts.correct === false);
      case 'elapsed':
        return at - this.team.startedAt >= c.minutes * MINUTE;
      case 'afterCompleted': {
        const done = this.state.tasks[c.task]?.completedAt;
        return done !== undefined && at - done >= c.seconds * 1000;
      }
      case 'score':
        return compare(this.state.score, c.op, c.value);
      case 'onTrack':
        return this.team.track === c.track;
      case 'and':
        return c.conditions.every((x) => this.holds(x, at));
      case 'or':
        return c.conditions.some((x) => this.holds(x, at));
      case 'not':
        return !this.holds(c.condition, at);
    }
  }

  private match(select: Selector, mode: 'all' | 'any' = 'all', test: (ts: TaskState) => boolean): boolean {
    const ids = this.select(select);
    if (ids.length === 0) return false;
    const results = ids.map((id) => test(this.state.tasks[id]!));
    return mode === 'all' ? results.every(Boolean) : results.some(Boolean);
  }

  private select(select: Selector): string[] {
    if ('task' in select) return this.tasks.has(select.task) ? [select.task] : [];
    if ('tasks' in select) return select.tasks.filter((id) => this.tasks.has(id));
    if ('tag' in select) return this.game.tasks.filter((t) => t.tags.includes(select.tag)).map((t) => t.id);
    return this.game.tasks.map((t) => t.id);
  }

  // -------------------------------------------------------------------------
  // Acties
  // -------------------------------------------------------------------------

  private perform(action: Action, at: number, ruleId: string): void {
    switch (action.kind) {
      case 'show':
        for (const id of this.select(action.select)) this.show(id, action.on);
        break;
      case 'open':
        this.open(action.task);
        break;
      case 'deactivate': {
        for (const id of this.select(action.select)) {
          const ts = this.state.tasks[id]!;
          if (ts.status !== 'done') ts.status = 'deactivated';
        }
        const active = this.state.activeSequence;
        if (active) {
          const seq = this.game.sequences.find((s) => s.id === active.id);
          const currentTask = seq?.tasks[active.index];
          if (currentTask && this.state.tasks[currentTask]?.status === 'deactivated') {
            this.state.activeSequence = undefined;
          }
        }
        break;
      }
      case 'award':
        this.addPoints(at, action.points, 'award', undefined, action.reason);
        break;
      case 'message':
        this.state.messages.push({ at, text: action.text, rule: ruleId });
        break;
      case 'startSequence': {
        const seq = this.game.sequences.find((s) => s.id === action.sequence);
        if (!seq || seq.tasks.length === 0) break;
        // Al vóór de start gelezen (speluitleg bij een centrale start): niet opnieuw tonen.
        if (seq.tasks.every((id) => this.state.tasks[id]?.status === 'done')) break;
        this.state.activeSequence = { id: seq.id, index: 0 };
        this.open(seq.tasks[0]!);
        break;
      }
      case 'end': {
        const ending = this.game.endings.find((e) => e.id === action.ending);
        if (ending && ending.bonus !== 0) this.addPoints(at, ending.bonus, 'ending', undefined, ending.id);
        this.state.ended = { ending: action.ending, at };
        this.state.activeSequence = undefined;
        break;
      }
    }
  }

  private show(id: string, on: Placement): void {
    const ts = this.state.tasks[id];
    if (!ts || ts.status === 'deactivated') return;
    if (on === 'map') ts.onMap = true;
    else if (on === 'list') ts.inList = true;
    else ts.playground = on.playground;
    if (ts.status === 'hidden') ts.status = 'visible';
  }

  private open(id: string): void {
    const ts = this.state.tasks[id];
    if (!ts || ts.status === 'deactivated' || ts.status === 'done') return;
    ts.status = 'open';
  }

  // -------------------------------------------------------------------------
  // Gebeurtenissen
  // -------------------------------------------------------------------------

  private apply(event: GameEvent, at: number): void {
    const task = this.tasks.get(event.task);
    const ts = this.state.tasks[event.task];
    if (!task || !ts) return this.reject(event, 'onbekende opdracht');

    switch (event.type) {
      case 'locationReached': {
        if (ts.status !== 'visible' || !ts.onMap) return this.reject(event, 'opdracht staat niet open op de kaart');
        const location = locationFor(task, this.team.track);
        if (!location) return this.reject(event, 'opdracht heeft geen locatie');
        if (!(event.accuracy >= 0) || event.accuracy > this.game.gps.maxAccuracy) {
          return this.reject(event, 'GPS-meting te onnauwkeurig');
        }
        if (distanceMeters(event, location) > location.radius) return this.reject(event, 'buiten de straal');
        ts.status = task.confirm ? 'confirming' : 'open';
        return;
      }
      case 'manualOpen':
        if (ts.status === 'done' || ts.status === 'deactivated') {
          return this.reject(event, 'opdracht is al afgerond of uit');
        }
        ts.status = 'open';
        return;
      case 'confirmed':
        if (ts.status !== 'confirming') return this.reject(event, 'er staat geen bevestiging open');
        ts.status = 'open';
        return;
      case 'declined':
        if (ts.status !== 'confirming') return this.reject(event, 'er staat geen bevestiging open');
        ts.status = 'visible';
        return;
      case 'hintUsed': {
        if (ts.status !== 'visible' && ts.status !== 'open') return this.reject(event, 'hint niet beschikbaar');
        if (event.hint !== ts.hintsUsed) return this.reject(event, 'hints gaan op volgorde');
        const hint = task.hints[event.hint];
        if (!hint) return this.reject(event, 'deze hint bestaat niet');
        ts.hintsUsed += 1;
        this.addPoints(at, -hint.cost, 'hint', task.id, `hint ${event.hint + 1}`);
        return;
      }
      case 'answered': {
        if (!this.canAnswer(task, ts)) return this.reject(event, 'opdracht is niet open');
        const result = checkAnswer(task.answer, event.answer);
        if (!result.valid) return this.reject(event, result.reason);
        ts.attempts += 1;
        ts.lastAnswer = event.answer;
        if (result.correct) {
          if (task.points !== 0) this.addPoints(at, task.points, 'answer', task.id);
          this.complete(task, ts, at, true);
        } else {
          if (task.wrongPoints) this.addPoints(at, task.wrongPoints, 'wrong', task.id);
          if (!task.retryUntilCorrect) this.complete(task, ts, at, false);
        }
        return;
      }
    }
  }

  /** Open opdrachten, en opdrachten in lijst of playground zonder locatie, mogen beantwoord worden. */
  private canAnswer(task: Task, ts: TaskState): boolean {
    if (ts.status === 'open') return true;
    if (ts.status !== 'visible') return false;
    const needsLocation = ts.onMap && locationFor(task, this.team.track) !== undefined;
    return !needsLocation && (ts.inList || ts.playground !== undefined);
  }

  private complete(task: Task, ts: TaskState, at: number, correct: boolean): void {
    ts.status = 'done';
    ts.correct = correct;
    ts.completedAt = at;
    const active = this.state.activeSequence;
    if (!active) return;
    const seq = this.game.sequences.find((s) => s.id === active.id);
    if (!seq || seq.tasks[active.index] !== task.id) return;
    const nextIndex = active.index + 1;
    const next = seq.tasks[nextIndex];
    if (next === undefined) {
      this.state.activeSequence = undefined;
    } else {
      this.state.activeSequence = { id: seq.id, index: nextIndex };
      this.open(next);
    }
  }

  private addPoints(at: number, points: number, reason: LedgerEntry['reason'], task?: string, note?: string): void {
    this.state.score += points;
    const entry: LedgerEntry = { at, points, reason };
    if (task) entry.task = task;
    if (note) entry.note = note;
    this.state.ledger.push(entry);
  }

  private reject(event: GameEvent, reason: string): void {
    this.state.rejected.push({ event: event.id, reason });
  }
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case '>=':
      return a >= b;
    case '>':
      return a > b;
    case '<=':
      return a <= b;
    case '<':
      return a < b;
    case '==':
      return a === b;
    default:
      return false;
  }
}
