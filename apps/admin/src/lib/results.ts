// Resultaten van een sessie, zoals de resultatenpagina van Loquiz ze toont:
// een ranglijst en per team de antwoorden per opdracht.
// Punten en antwoorden worden opnieuw uitgerekend met de spelregel-engine,
// uit dezelfde gebeurtenissen als de app; zo kloppen ze altijd met het spel.
import {
  computeState,
  t,
  type AnswerSpec,
  type AnswerValue,
  type GameEvent,
  type GamePackage,
  type Lang,
  type Task,
} from '@hunt/engine';

export interface TeamRow {
  id: string;
  name: string;
  track: number;
  language: string;
  score: number;
  outcome: string | null;
  started_at: string | null;
  ended_at: string | null;
  /** Uit session_results(): gelopen afstand volgens de GPS-route. */
  distance_m?: number;
}

export interface EventRow {
  id: string;
  team_id: string;
  type: string;
  task_key: string | null;
  payload: Record<string, unknown>;
  client_time: string;
}

export interface PhotoRow {
  id: string;
  team_id: string;
  task_key: string;
  path: string;
  created_at: string;
}

export type AnswerResult = 'correct' | 'wrong' | 'done';

export interface TaskAnswer {
  task: string;
  title: string;
  /** Leesbaar antwoord, zoals het team het gaf. */
  answer: string;
  /** Het goede antwoord, om naast een fout antwoord te tonen. */
  expected: string;
  result: AnswerResult;
  points: number;
  attempts: number;
  hintsUsed: number;
  /** Tijd sinds de start van het team, in seconden. */
  atSeconds: number | null;
  /** Bij een foto-opdracht: id van de foto (event-payload). */
  photoId?: string;
}

export interface TeamResult {
  rank: number;
  id: string;
  name: string;
  track: number;
  language: string;
  score: number;
  outcome: string | null;
  /** Titel van het einde, bijvoorbeeld "Ontsnapt". */
  outcomeLabel: string;
  durationSeconds: number | null;
  distanceM: number | null;
  correct: number;
  wrong: number;
  hintsUsed: number;
  /** Punten die niet bij een opdracht horen (regels, einde). */
  bonusPoints: number;
  playing: boolean;
  answers: TaskAnswer[];
}

export interface TaskColumn {
  id: string;
  title: string;
  points: number;
  /** Aantal teams dat de opdracht goed had / heeft beantwoord. */
  correct: number;
  answered: number;
}

export interface SessionResultsView {
  teams: TeamResult[];
  /** Opdrachten met een antwoord, in spelvolgorde: de kolommen van het overzicht. */
  tasks: TaskColumn[];
}

const ms = (iso: string | null) => (iso === null ? null : Date.parse(iso));

/** Rij uit de tabel events → gebeurtenis voor de engine. */
export function fromEventRow(row: EventRow): GameEvent {
  return {
    ...row.payload,
    id: row.id,
    at: Date.parse(row.client_time),
    type: row.type,
    ...(row.task_key === null ? {} : { task: row.task_key }),
  } as GameEvent;
}

function lang(game: GamePackage, value: string): Lang {
  return (game.languages as string[]).includes(value) ? (value as Lang) : game.defaultLanguage;
}

/** Antwoord van een team als tekst, in de taal van de beheerder (Nederlands). */
export function describeAnswer(spec: AnswerSpec, value: AnswerValue | undefined, language: Lang): string {
  if (!value) return '';
  switch (value.type) {
    case 'info':
      return 'Gelezen';
    case 'choice':
      return spec.type === 'choice' ? t(spec.options[value.option], language) || `Optie ${value.option + 1}` : `Optie ${value.option + 1}`;
    case 'multi':
      return value.options
        .map((o) => (spec.type === 'multi' ? t(spec.options[o], language) || `Optie ${o + 1}` : `Optie ${o + 1}`))
        .join(', ');
    case 'text':
      return value.text;
    case 'number':
      return String(value.value);
    case 'photo':
      return 'Foto';
  }
}

export function expectedAnswer(spec: AnswerSpec, language: Lang): string {
  switch (spec.type) {
    case 'choice':
      return t(spec.options[spec.correct], language);
    case 'multi':
      return spec.correct.map((o) => t(spec.options[o], language)).join(', ');
    case 'text':
      return spec.accepted[0] ?? '';
    case 'number':
      return spec.tolerance ? `${spec.value} (± ${spec.tolerance})` : String(spec.value);
    default:
      return '';
  }
}

/** Opdrachten die op de resultatenpagina een kolom krijgen. */
export function scoredTasks(game: GamePackage): Task[] {
  return game.tasks.filter((task) => task.answer.type !== 'info');
}

/**
 * Bouwt de resultaten van een sessie: ranglijst (hoogste score, bij gelijke
 * score de snelste) met per team de antwoorden per opdracht.
 */
export function buildResults(
  game: GamePackage,
  teams: readonly TeamRow[],
  events: readonly EventRow[],
  now: number,
): SessionResultsView {
  const byTeam = new Map<string, GameEvent[]>();
  for (const row of events) {
    const list = byTeam.get(row.team_id) ?? [];
    list.push(fromEventRow(row));
    byTeam.set(row.team_id, list);
  }
  const tasks = scoredTasks(game);
  const display: Lang = (game.languages as string[]).includes('nl') ? ('nl' as Lang) : game.defaultLanguage;

  const results: Omit<TeamResult, 'rank'>[] = teams.map((team) => {
    const startedAt = ms(team.started_at);
    const endedAt = ms(team.ended_at);
    const teamLang = lang(game, team.language);
    const endingTitle = (id: string | null) =>
      id === null ? '' : t(game.endings.find((e) => e.id === id)?.title, display) || id;
    const base = {
      id: team.id,
      name: team.name,
      track: team.track,
      language: team.language,
      distanceM: team.distance_m ?? null,
    };
    if (startedAt === null) {
      return {
        ...base,
        score: team.score,
        outcome: team.outcome,
        outcomeLabel: endingTitle(team.outcome),
        durationSeconds: null,
        correct: 0,
        wrong: 0,
        hintsUsed: 0,
        bonusPoints: 0,
        playing: false,
        answers: [],
      };
    }
    const evs = (byTeam.get(team.id) ?? []).sort((a, b) => a.at - b.at);
    const until = endedAt ?? now;
    const state = computeState(game, { track: team.track, startedAt }, evs, until);
    const end = state.ended?.at ?? endedAt ?? now;

    const pointsPerTask = new Map<string, number>();
    let bonusPoints = 0;
    for (const entry of state.ledger) {
      if (entry.task) pointsPerTask.set(entry.task, (pointsPerTask.get(entry.task) ?? 0) + entry.points);
      else bonusPoints += entry.points;
    }

    const answers: TaskAnswer[] = [];
    let correct = 0;
    let wrong = 0;
    let hintsUsed = 0;
    for (const task of game.tasks) {
      const ts = state.tasks[task.id];
      if (!ts) continue;
      hintsUsed += ts.hintsUsed;
      if (task.answer.type === 'info') continue;
      const answered = ts.lastAnswer !== undefined || ts.status === 'done';
      if (!answered) continue;
      const result: AnswerResult =
        task.answer.type === 'photo' ? 'done' : ts.correct === true ? 'correct' : 'wrong';
      if (result === 'correct') correct += 1;
      if (result === 'wrong') wrong += 1;
      const answer: TaskAnswer = {
        task: task.id,
        title: t(task.title, display) || task.id,
        answer: describeAnswer(task.answer, ts.lastAnswer, teamLang),
        expected: expectedAnswer(task.answer, teamLang),
        result,
        points: pointsPerTask.get(task.id) ?? 0,
        attempts: ts.attempts,
        hintsUsed: ts.hintsUsed,
        atSeconds: ts.completedAt === undefined ? null : Math.round((ts.completedAt - startedAt) / 1000),
      };
      if (ts.lastAnswer?.type === 'photo') answer.photoId = ts.lastAnswer.photoId;
      answers.push(answer);
    }
    answers.sort((a, b) => (a.atSeconds ?? Infinity) - (b.atSeconds ?? Infinity));

    return {
      ...base,
      score: state.score,
      outcome: state.ended?.ending ?? team.outcome,
      outcomeLabel: endingTitle(state.ended?.ending ?? team.outcome),
      durationSeconds: Math.max(0, Math.round((end - startedAt) / 1000)),
      correct,
      wrong,
      hintsUsed,
      bonusPoints,
      playing: !state.ended && endedAt === null,
      answers,
    };
  });

  // Hoogste score eerst; bij gelijke score de snelste; teams die niet zijn gestart achteraan.
  const sorted = [...results].sort(
    (a, b) =>
      b.score - a.score ||
      (a.durationSeconds ?? Infinity) - (b.durationSeconds ?? Infinity) ||
      a.name.localeCompare(b.name, 'nl'),
  );
  const ranked: TeamResult[] = [];
  sorted.forEach((team, i) => {
    const prev = ranked[i - 1];
    const tie = prev && prev.score === team.score && prev.durationSeconds === team.durationSeconds;
    ranked.push({ ...team, rank: tie ? prev.rank : i + 1 });
  });

  const columns: TaskColumn[] = tasks.map((task) => {
    let ok = 0;
    let answered = 0;
    for (const team of ranked) {
      const a = team.answers.find((x) => x.task === task.id);
      if (!a) continue;
      answered += 1;
      if (a.result !== 'wrong') ok += 1;
    }
    return { id: task.id, title: t(task.title, display) || task.id, points: task.points, correct: ok, answered };
  });

  return { teams: ranked, tasks: columns };
}

/** 3780 → "1:03:00", 754 → "12:34" */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '–';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function formatDistance(meters: number | null): string {
  if (meters === null) return '–';
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Excel-export van het overzicht: per team een rij, per opdracht een kolom
 * met de behaalde punten (leeg = niet beantwoord). Puntkomma's, zodat het in
 * Nederlandse Excel meteen goed opent.
 */
export function resultsToCsv(view: SessionResultsView): string {
  const header = [
    'plaats', 'team', 'punten', 'speeltijd', 'afstand_km', 'goed', 'fout', 'hints', 'uitkomst',
    ...view.tasks.map((task) => task.title),
  ];
  const rows = view.teams.map((team) => [
    team.rank,
    team.name,
    team.score,
    formatDuration(team.durationSeconds),
    team.distanceM === null ? '' : (team.distanceM / 1000).toFixed(2).replace('.', ','),
    team.correct,
    team.wrong,
    team.hintsUsed,
    team.outcomeLabel,
    ...view.tasks.map((task) => team.answers.find((a) => a.task === task.id)?.points ?? ''),
  ]);
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
