import type { Action, Condition, Placement, Rule, Selector } from '@hunt/engine';
import { tx } from './text';

/** Leesbare zinnen voor regels, zodat de spelleiding ze kan nalopen. */

function selector(s: Selector): string {
  if ('task' in s) return `opdracht ${s.task}`;
  if ('tasks' in s) return `opdrachten ${s.tasks.join(', ')}`;
  if ('tag' in s) return `opdrachten met label ${s.tag}`;
  return 'alle opdrachten';
}

function placement(p: Placement): string {
  if (p === 'map') return 'op de kaart';
  if (p === 'list') return 'in de lijst';
  return `in playground ${p.playground}`;
}

const match = (m: 'all' | 'any' | undefined) => (m === 'any' ? 'een van ' : '');

export function describeCondition(c: Condition): string {
  switch (c.kind) {
    case 'completed':
      return `${match(c.match)}${selector(c.select)} afgerond`;
    case 'correct':
      return `${match(c.match)}${selector(c.select)} goed beantwoord`;
    case 'incorrect':
      return `${match(c.match)}${selector(c.select)} fout beantwoord`;
    case 'elapsed':
      return `${c.minutes} minuten na de start`;
    case 'afterCompleted':
      return `${c.seconds} seconden nadat ${c.task} is afgerond`;
    case 'score':
      return `score ${c.op} ${c.value}`;
    case 'onTrack':
      return `team speelt track ${c.track}`;
    case 'and':
      return c.conditions.map(describeCondition).map(wrap).join(' én ');
    case 'or':
      return c.conditions.map(describeCondition).map(wrap).join(' of ');
    case 'not':
      return `niet (${describeCondition(c.condition)})`;
    default:
      return JSON.stringify(c);
  }
}

const wrap = (s: string) => (s.includes(' én ') || s.includes(' of ') ? `(${s})` : s);

export function describeAction(a: Action): string {
  switch (a.kind) {
    case 'show':
      return `toon ${selector(a.select)} ${placement(a.on)}`;
    case 'open':
      return `open ${a.task} direct`;
    case 'deactivate':
      return `zet ${selector(a.select)} uit`;
    case 'award':
      return `${a.points >= 0 ? '+' : ''}${a.points} punten${a.reason ? ` (${a.reason})` : ''}`;
    case 'message':
      return `bericht: “${tx(a.text)}”`;
    case 'startSequence':
      return `start reeks ${a.sequence}`;
    case 'end':
      return `einde: ${a.ending}`;
    default:
      return JSON.stringify(a);
  }
}

export function describeRule(r: Rule): string {
  return `Als ${describeCondition(r.when)}, dan ${r.then.map(describeAction).join('; ')}.`;
}

/** Leest een regel uit het JSON-veld van de editor. */
export function parseRule(id: string, label: string, whenText: string, thenText: string): { rule?: Rule; error?: string } {
  let when: unknown;
  let then: unknown;
  try {
    when = JSON.parse(whenText);
  } catch {
    return { error: 'De voorwaarde is geen geldige JSON.' };
  }
  try {
    then = JSON.parse(thenText);
  } catch {
    return { error: 'De acties zijn geen geldige JSON.' };
  }
  if (typeof when !== 'object' || when === null || typeof (when as { kind?: unknown }).kind !== 'string') {
    return { error: 'De voorwaarde moet een object met "kind" zijn.' };
  }
  if (!Array.isArray(then) || then.some((a) => typeof a !== 'object' || a === null || typeof a.kind !== 'string')) {
    return { error: 'De acties moeten een lijst van objecten met "kind" zijn.' };
  }
  const rule: Rule = { id, when: when as Condition, then: then as Action[] };
  if (label.trim()) rule.label = label.trim();
  return { rule };
}

/** Een tijd in een voorwaarde: minuten na de start, of seconden na een opdracht. */
export type TimeSetting = { kind: 'elapsed'; minutes: number } | { kind: 'afterCompleted'; task: string; seconds: number };

/** Alle tijden in een voorwaarde, in vaste volgorde (diepte eerst). */
export function timeSettings(c: Condition): TimeSetting[] {
  switch (c.kind) {
    case 'elapsed':
      return [{ kind: 'elapsed', minutes: c.minutes }];
    case 'afterCompleted':
      return [{ kind: 'afterCompleted', task: c.task, seconds: c.seconds }];
    case 'and':
    case 'or':
      return c.conditions.flatMap(timeSettings);
    case 'not':
      return timeSettings(c.condition);
    default:
      return [];
  }
}

/** Dezelfde voorwaarde met nieuwe tijden (in de volgorde van timeSettings). */
export function withTimes(c: Condition, values: number[]): Condition {
  let i = 0;
  const walk = (x: Condition): Condition => {
    switch (x.kind) {
      case 'elapsed':
        return { ...x, minutes: values[i++] ?? x.minutes };
      case 'afterCompleted':
        return { ...x, seconds: values[i++] ?? x.seconds };
      case 'and':
      case 'or':
        return { ...x, conditions: x.conditions.map(walk) };
      case 'not':
        return { ...x, condition: walk(x.condition) };
      default:
        return x;
    }
  };
  return walk(c);
}
