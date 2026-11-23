import { earnedBadges, isEscapeEnding, t as tx, type Badge, type GameEvent, type GamePackage, type TeamState, type Text } from '@hunt/engine';
import type { MessageKey } from './i18n.js';
import type { NewsSignal, TeamSummary } from './types.js';

/**
 * Een nieuwsflits op de telefoon: van de server (spelleider, ander team
 * ontsnapt of puzzel opgelost) of door de app zelf ("Nog 10 minuten").
 */
export interface NewsFlash {
  id: string;
  kind: NewsSignal['kind'] | 'time';
  /** Servertijd (ms). */
  at: number;
  teamName?: string;
  task?: string;
  /** Het hoeveelste team met dit nieuws (1 = als eerste). */
  n?: number;
  icon?: string;
  title?: Text;
  body?: Text;
  /** Bij 'time': minuten tot het einde. */
  minutes?: number;
  /** Al op het scherm geweest (weggetikt of vanzelf weg). */
  shown?: boolean;
}

/** Zo lang staat een flits onderin het scherm, als het team er niet op tikt. */
export const NEWS_VISIBLE_MS = 6_000;
/** Ouder nieuws (de app stond uit of had geen bereik) komt niet meer onderin, alleen in de lijst. */
export const NEWS_FRESH_MS = 5 * 60_000;
/** Zoveel flitsen bewaart de app voor de lijst Nieuws. */
export const NEWS_KEEP = 40;

export function fromSignal(signal: NewsSignal): NewsFlash {
  const out: NewsFlash = { id: signal.id, kind: signal.kind, at: signal.at };
  if (signal.teamName) out.teamName = signal.teamName;
  if (signal.task) out.task = signal.task;
  if (signal.n) out.n = signal.n;
  if (signal.icon) out.icon = signal.icon;
  if (signal.title) out.title = signal.title;
  if (signal.body) out.body = signal.body;
  return out;
}

/** Kleur van de flits: rood = gevaar, groen = ontsnapt, oranje = spel, grijs = spelleiding. */
export type NewsTone = 'danger' | 'success' | 'accent' | 'muted';

export interface NewsView {
  icon: string;
  tone: NewsTone;
  kicker: string;
  title: string;
  sub: string;
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Teksten van een flits in de taal van het team. */
export function newsView(flash: NewsFlash, game: GamePackage, lang: string, t: Translate): NewsView {
  const team = flash.teamName ?? '';
  switch (flash.kind) {
    case 'escaped':
      return {
        icon: '🏁',
        tone: 'success',
        kicker: t('newsKindEscaped'),
        title: t('newsEscaped', { team }),
        sub: flash.n === 1 ? t('newsFirst') : '',
      };
    case 'puzzle': {
      const task = game.tasks.find((x) => x.id === flash.task);
      const puzzle = tx(task?.title, lang, game.defaultLanguage) || flash.task || '';
      return {
        icon: '🧩',
        tone: 'accent',
        kicker: t('newsKindPuzzle'),
        title: t('newsPuzzle', { team, puzzle }),
        sub: flash.n === 1 ? t('newsFirst') : flash.n ? t('newsPuzzleCount', { n: flash.n }) : '',
      };
    }
    case 'time':
      return {
        icon: '⏳',
        tone: 'accent',
        kicker: t('newsKindTime'),
        title: t('newsTimeLeft', { n: flash.minutes ?? 10 }),
        sub: t('newsTimeLeftBody'),
      };
    default:
      return {
        icon: flash.icon || '📣',
        tone: 'muted',
        kicker: t('newsKindLeader'),
        title: tx(flash.title, lang, game.defaultLanguage),
        sub: tx(flash.body, lang, game.defaultLanguage),
      };
  }
}

/** Voegt nieuwe flitsen toe aan de lijst: zonder dubbele, oudste eerst, hooguit NEWS_KEEP. */
export function mergeNews(list: readonly NewsFlash[], fresh: readonly NewsFlash[], now: number): NewsFlash[] {
  const known = new Set(list.map((n) => n.id));
  const added = fresh
    .filter((n) => !known.has(n.id))
    // Oud nieuws komt alleen nog in de lijst, niet meer onderin het scherm.
    .map((n) => (now - n.at > NEWS_FRESH_MS ? { ...n, shown: true } : n));
  const merged = [...list, ...added].sort((a, b) => a.at - b.at);
  return merged.length > NEWS_KEEP ? merged.slice(merged.length - NEWS_KEEP) : merged;
}

/** De flits die nu onderin hoort: de oudste die nog niet getoond is. */
export function currentNews(list: readonly NewsFlash[], now: number): NewsFlash | null {
  return list.find((n) => !n.shown && now - n.at <= NEWS_FRESH_MS) ?? null;
}

// ---------------------------------------------------------------------------
// Eindscherm
// ---------------------------------------------------------------------------

export interface EndStats {
  meters: number;
  durationMs: number;
  score: number;
  caught: number;
  escaped: boolean;
  /** Plaats tussen de teams die klaar zijn; ontbreekt zonder gegevens van de server. */
  place?: number;
  /** Aantal gestarte teams. */
  teams?: number;
  /** Nog niet alle teams zijn klaar: de plaats kan nog veranderen. */
  provisional?: boolean;
  badges: Badge[];
}

/**
 * Cijfers voor het eindscherm. De afstand komt van de server (alle telefoons
 * van het team samen) of, zonder bereik, van deze telefoon zelf.
 */
export function endStats(input: {
  game: GamePackage;
  state: TeamState;
  events: readonly GameEvent[];
  teamId: string;
  startedAt: number;
  localMeters: number;
  summary?: TeamSummary | null;
}): EndStats {
  const { game, state, events, teamId, startedAt, localMeters, summary } = input;
  const endedAt = state.ended?.at ?? state.now;
  const out: EndStats = {
    meters: Math.max(summary?.distance ?? 0, localMeters),
    durationMs: Math.max(0, endedAt - startedAt),
    score: state.score,
    caught: events.filter((e) => e.type === 'caught').length,
    escaped: isEscapeEnding(game, state.ended?.ending),
    badges: earnedBadges({ game, state, events, teamId, startedAt, records: summary ?? null }),
  };
  if (summary && summary.teams > 0) {
    const others = summary.finished.filter((f) => f.team !== teamId);
    out.place = 1 + others.filter((f) => f.score > state.score).length;
    out.teams = Math.max(summary.teams, others.length + 1);
    out.provisional = others.length + 1 < out.teams;
  }
  return out;
}

/** Ongeveer zoveel stappen per kilometer (gemiddelde paslengte van 75 cm). */
export const STEPS_PER_KM = 1_330;
/** Een rondje atletiekbaan. */
export const LAP_METERS = 400;

/** "6,8" voor 6.800 meter, in de notatie van de taal. */
export function formatKm(meters: number, lang: string): string {
  const km = meters / 1000;
  return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.floor(km * 10) / 10);
}

/** Aantal stappen, afgerond op honderdtallen. */
export function stepsFor(meters: number): number {
  return Math.round(((meters / 1000) * STEPS_PER_KM) / 100) * 100;
}

export function lapsFor(meters: number): number {
  return Math.round(meters / LAP_METERS);
}
