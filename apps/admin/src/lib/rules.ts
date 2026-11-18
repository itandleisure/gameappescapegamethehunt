import type { Action, Condition, Placement, Rule, Selector } from '@hunt/engine';
import { t, translate } from './i18n';
import { tx } from './text';

/** Leesbare zinnen voor regels, zodat de spelleiding ze kan nalopen. */

function selector(s: Selector): string {
  if ('task' in s) return t('opdracht {task}', { task: s.task });
  if ('tasks' in s) return t('opdrachten {tasks}', { tasks: s.tasks.join(', ') });
  if ('tag' in s) return t('opdrachten met label {tag}', { tag: s.tag });
  return t('alle opdrachten');
}

function placement(p: Placement): string {
  if (p === 'map') return t('op de kaart');
  if (p === 'list') return t('in de lijst');
  return t('in playground {name}', { name: p.playground });
}

const match = (m: 'all' | 'any' | undefined, s: Selector) => (m === 'any' ? t('een van {what}', { what: selector(s) }) : selector(s));

export function describeCondition(c: Condition): string {
  switch (c.kind) {
    case 'completed':
      return t('{what} afgerond', { what: match(c.match, c.select) });
    case 'correct':
      return t('{what} goed beantwoord', { what: match(c.match, c.select) });
    case 'incorrect':
      return t('{what} fout beantwoord', { what: match(c.match, c.select) });
    case 'elapsed':
      return t('{time} na de start', { time: formatDuration(c.minutes * 60) });
    case 'afterCompleted':
      return t('{time} nadat {task} is afgerond', { time: formatDuration(c.seconds), task: c.task });
    case 'score':
      return t('score {op} {value}', { op: c.op, value: c.value });
    case 'onTrack':
      return t('team speelt track {n}', { n: c.track });
    case 'and':
      return c.conditions.map(describeCondition).map(wrap).join(` ${t('én')} `);
    case 'or':
      return c.conditions.map(describeCondition).map(wrap).join(` ${t('of')} `);
    case 'not':
      return t('niet ({what})', { what: describeCondition(c.condition) });
    default:
      return JSON.stringify(c);
  }
}

const wrap = (s: string) => (s.includes(` ${t('én')} `) || s.includes(` ${t('of')} `) ? `(${s})` : s);

export function describeAction(a: Action): string {
  switch (a.kind) {
    case 'show':
      return t('toon {what} {where}', { what: selector(a.select), where: placement(a.on) });
    case 'open':
      return t('open {task} direct', { task: a.task });
    case 'deactivate':
      return t('zet {what} uit', { what: selector(a.select) });
    case 'award':
      return `${t('{n} punten', { n: `${a.points >= 0 ? '+' : ''}${a.points}` })}${a.reason ? ` (${a.reason})` : ''}`;
    case 'message':
      return t('bericht: “{text}”', { text: tx(a.text) });
    case 'startSequence':
      return t('start reeks {name}', { name: a.sequence });
    case 'end':
      return t('einde: {name}', { name: a.ending });
    default:
      return JSON.stringify(a);
  }
}

export function describeRule(r: Rule): string {
  return t('Als {when}, dan {then}.', { when: describeCondition(r.when), then: r.then.map(describeAction).join('; ') });
}

/** Leest een regel uit het JSON-veld van de editor. */
export function parseRule(id: string, label: string, whenText: string, thenText: string): { rule?: Rule; error?: string } {
  let when: unknown;
  let then: unknown;
  try {
    when = JSON.parse(whenText);
  } catch {
    return { error: t('De voorwaarde is geen geldige JSON.') };
  }
  try {
    then = JSON.parse(thenText);
  } catch {
    return { error: t('De acties zijn geen geldige JSON.') };
  }
  if (typeof when !== 'object' || when === null || typeof (when as { kind?: unknown }).kind !== 'string') {
    return { error: t('De voorwaarde moet een object met "kind" zijn.') };
  }
  if (!Array.isArray(then) || then.some((a) => typeof a !== 'object' || a === null || typeof a.kind !== 'string')) {
    return { error: t('De acties moeten een lijst van objecten met "kind" zijn.') };
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

/** Tijd van een instelling in seconden. */
export function settingSeconds(s: TimeSetting): number {
  return s.kind === 'elapsed' ? Math.round(s.minutes * 60) : s.seconds;
}

/** Waarde voor withTimes uit seconden: minuten bij "na de start", anders seconden. */
export function settingValue(s: TimeSetting, seconds: number): number {
  return s.kind === 'elapsed' ? Math.round((seconds / 60) * 10_000) / 10_000 : seconds;
}

/** Seconden als uren, minuten en seconden. */
export function splitDuration(total: number): { h: number; m: number; s: number } {
  const n = Math.max(0, Math.round(total));
  return { h: Math.floor(n / 3600), m: Math.floor((n % 3600) / 60), s: n % 60 };
}

/** Leesbare tijd: "1 uur 5 minuten", "1 minuut 30 seconden", "45 seconden". */
export function formatDuration(total: number, tr: (nl: string, vars?: Record<string, string | number>) => string = t): string {
  const { h, m, s } = splitDuration(total);
  const parts: string[] = [];
  if (h) parts.push(h === 1 ? tr('1 uur') : tr('{n} uur', { n: h }));
  if (m) parts.push(m === 1 ? tr('1 minuut') : tr('{n} minuten', { n: m }));
  if (s) parts.push(s === 1 ? tr('1 seconde') : tr('{n} seconden', { n: s }));
  return parts.length ? parts.join(' ') : tr('{n} minuten', { n: 0 });
}

/** Nederlands, voor omschrijvingen uit het spel zelf (die zijn Nederlands). */
const formatDurationNl = (total: number) => formatDuration(total, (nl, vars) => translate('nl', nl, vars));

/**
 * Omschrijving van een regel met de nieuwe tijden, zodat "Na 10 minuten: …"
 * meeloopt als de tijd verandert. Alleen tijden "na de start" die letterlijk
 * als "N minuten" in de omschrijving staan worden vervangen.
 */
export function relabel(label: string, settings: TimeSetting[], seconds: number[]): string {
  let out = label;
  settings.forEach((s, i) => {
    if (s.kind !== 'elapsed') return;
    const next = seconds[i];
    if (next === undefined || next === settingSeconds(s)) return;
    const old = String(s.minutes).replace('.', '[.,]');
    out = out.replace(new RegExp(`\\b${old} (minuten|minuut|min)\\b`), formatDurationNl(next));
  });
  return out;
}
