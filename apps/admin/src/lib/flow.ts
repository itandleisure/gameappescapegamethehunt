import type { Action, BaseGame, Condition, Placement, Rule, Selector } from '@hunt/engine';
import { t } from './i18n';
import { formatMinutes } from './rules';
import { tx } from './text';

/**
 * Het spelverloop: de regels van een spel in gewone taal, met namen van
 * opdrachten in plaats van sleutels. Regels die op een vast moment na de
 * start gaan staan op de tijdlijn; de rest staat onder "Als dit gebeurt".
 */

export interface Names {
  task(id: string): string;
  sequence(id: string): { name: string; count: number };
  ending(id: string): string;
  playground(id: string): string;
  /** Aantal opdrachten met dit label. */
  tagCount(tag: string): number;
}

export function namesFor(base: BaseGame): Names {
  const tasks = new Map(base.tasks.map((x) => [x.id, tx(x.title).trim() || x.id]));
  const sequences = new Map(base.sequences.map((s) => [s.id, s.tasks.length]));
  const endings = new Map(base.endings.map((e) => [e.id, tx(e.title).trim() || e.id]));
  const playgrounds = new Map(base.playgrounds.map((p) => [p.id, tx(p.name).trim() || p.id]));
  return {
    task: (id) => tasks.get(id) ?? id,
    sequence: (id) => ({ name: id, count: sequences.get(id) ?? 0 }),
    ending: (id) => endings.get(id) ?? id,
    playground: (id) => playgrounds.get(id) ?? id,
    tagCount: (tag) => base.tasks.filter((x) => x.tags.includes(tag)).length,
  };
}

const q = (s: string) => `‘${s}’`;

export function selectorText(s: Selector, n: Names): string {
  if ('task' in s) return q(n.task(s.task));
  if ('tasks' in s) {
    const list = s.tasks.map((id) => q(n.task(id)));
    if (list.length <= 3) return list.join(', ');
    return t('{n} opdrachten ({first} … {last})', { n: list.length, first: list[0]!, last: list[list.length - 1]! });
  }
  if ('tag' in s) return t('de {n} opdrachten met label {tag}', { tag: q(s.tag), n: n.tagCount(s.tag) });
  return t('alle opdrachten');
}

export function placementText(p: Placement, n: Names): string {
  if (p === 'map') return t('op de kaart');
  if (p === 'list') return t('in de opdrachtenlijst');
  return t('op het tabblad {name}', { name: q(n.playground(p.playground)) });
}

/** Seconden na de start waarop een regel op de tijdlijn staat, of null. */
export function ruleMoment(rule: Rule): number | null {
  const c = rule.when;
  if (c.kind === 'elapsed') return Math.round(c.minutes * 60);
  if (c.kind === 'and') {
    const e = c.conditions.find((x) => x.kind === 'elapsed');
    if (e && e.kind === 'elapsed') return Math.round(e.minutes * 60);
  }
  return null;
}

/** Wat er naast het moment nog moet gelden ("alleen als …"). */
export function extraConditions(rule: Rule): Condition[] {
  const c = rule.when;
  if (c.kind !== 'and') return [];
  let skipped = false;
  return c.conditions.filter((x) => {
    if (!skipped && x.kind === 'elapsed') {
      skipped = true;
      return false;
    }
    return true;
  });
}

const several = (s: Selector) => !('task' in s);

export function conditionText(c: Condition, n: Names): string {
  const what = (m: 'all' | 'any' | undefined, s: Selector) =>
    m === 'any' && several(s) ? t('een van {what}', { what: selectorText(s, n) }) : selectorText(s, n);
  switch (c.kind) {
    case 'completed':
      return t('{what} afgerond', { what: what(c.match, c.select) });
    case 'correct':
      return t('{what} goed', { what: what(c.match, c.select) });
    case 'incorrect':
      return t('{what} fout', { what: what(c.match, c.select) });
    case 'elapsed':
      return t('{time} na de start', { time: t('{n} min', { n: formatMinutes(c.minutes * 60) }) });
    case 'afterCompleted':
      return t('{seconds} seconden nadat {task} is afgerond', { seconds: c.seconds, task: q(n.task(c.task)) });
    case 'score':
      return t('score {op} {value}', { op: c.op, value: c.value });
    case 'onTrack':
      return t('team speelt track {n}', { n: c.track });
    case 'and':
      return c.conditions.map((x) => conditionText(x, n)).join(` ${t('én')} `);
    case 'or':
      return c.conditions.map((x) => conditionText(x, n)).join(` ${t('of')} `);
    case 'not': {
      const inner = c.condition;
      if (inner.kind === 'completed') return t('{what} nog niet afgerond', { what: selectorText(inner.select, n) });
      if (inner.kind === 'correct')
        return several(inner.select)
          ? t('{what} niet allemaal goed', { what: selectorText(inner.select, n) })
          : t('{what} nog niet goed', { what: selectorText(inner.select, n) });
      return t('niet: {what}', { what: conditionText(inner, n) });
    }
    default:
      return JSON.stringify(c);
  }
}

export interface ActionLine {
  icon: string;
  text: string;
  /** Volledige tekst van een bericht. */
  detail?: string;
}

export function actionLine(a: Action, n: Names): ActionLine {
  switch (a.kind) {
    case 'message':
      return { icon: '✉️', text: t('Bericht aan het team'), detail: tx(a.text) };
    case 'show':
      return {
        icon: a.on === 'map' ? '📍' : '🧩',
        text: several(a.select)
          ? t('{what} verschijnen {where}', { what: selectorText(a.select, n), where: placementText(a.on, n) })
          : t('{what} verschijnt {where}', { what: selectorText(a.select, n), where: placementText(a.on, n) }),
      };
    case 'open':
      return { icon: '⚡', text: t('{what} gaat direct open', { what: q(n.task(a.task)) }) };
    case 'deactivate':
      return {
        icon: '🔒',
        text: several(a.select) ? t('{what} gaan dicht', { what: selectorText(a.select, n) }) : t('{what} gaat dicht', { what: selectorText(a.select, n) }),
      };
    case 'award':
      return { icon: '⭐', text: `${t('{n} punten', { n: `${a.points >= 0 ? '+' : ''}${a.points}` })}${a.reason ? ` (${a.reason})` : ''}` };
    case 'startSequence': {
      const s = n.sequence(a.sequence);
      return { icon: '▶️', text: t('Reeks {name} start: {n} schermen na elkaar', { name: q(s.name), n: s.count }) };
    }
    case 'hideScore':
      return { icon: '🙈', text: t('Punten verdwijnen uit beeld bij het team') };
    case 'end':
      return { icon: '🏁', text: t('Spel eindigt: {name}', { name: q(n.ending(a.ending)) }) };
    default:
      return { icon: '•', text: JSON.stringify(a) };
  }
}

/** Omschrijving zonder de minuten vooraan ("10 - Puzzel 1 vrijgeven" → "Puzzel 1 vrijgeven"). */
export function labelWithoutTime(label: string): string {
  return label.replace(/^\d+(?::\d{2})? - /, '');
}

export interface Moment {
  seconds: number;
  rules: Rule[];
}

/** Regels op de tijdlijn per moment, op tijd geordend; binnen een moment in regelvolgorde. */
export function timeline(rules: Rule[]): { moments: Moment[]; other: Rule[] } {
  const byTime = new Map<number, Rule[]>();
  const other: Rule[] = [];
  for (const r of rules) {
    const s = ruleMoment(r);
    if (s === null) other.push(r);
    else byTime.set(s, [...(byTime.get(s) ?? []), r]);
  }
  const moments = [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([seconds, rs]) => ({ seconds, rules: rs }));
  return { moments, other };
}

/** Een nieuwe sleutel die nog niet bestaat: moment-10, moment-10-2, … */
export function newRuleKey(rules: Rule[], base: string): string {
  const taken = new Set(rules.map((r) => r.id));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}
