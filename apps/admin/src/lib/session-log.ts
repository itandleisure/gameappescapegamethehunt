// Logboek van een event: alles wat er gebeurde, per team, op volgorde van tijd.
// Opgeloste puzzels, hints, uitgevoerde regels (spelverloop), het einde,
// foto's, chatberichten en spelleiders. Regels en punten worden opnieuw
// uitgerekend met de spelregel-engine uit dezelfde gebeurtenissen als de app,
// dus het logboek klopt altijd met wat het team in de app zag.
import { checkAnswer, computeState, isVideoPath, t, type GameEvent, type GamePackage, type Lang } from '@hunt/engine';
import { currentLanguage, t as tr } from './i18n';
import { describeAnswer, fromEventRow, type EventRow, type PhotoRow, type TeamRow } from './results';
import { deviceSummary, kindLabel, type AppLogRow } from './app-logs';
import { describeAction, describeRule } from './rules';

export type LogCategory = 'spel' | 'opdracht' | 'regel' | 'foto' | 'chat' | 'techniek';

export interface LogEntry {
  /** Uniek binnen het logboek (voor React). */
  id: string;
  /** Tijdstip in ms. */
  at: number;
  /** Team waar het om gaat; null bij spelleiders of de spelleiding. */
  teamId: string | null;
  category: LogCategory;
  /** Korte zin, zoals "Puzzel Tangram goed beantwoord". */
  text: string;
  /** Extra uitleg, zoals het antwoord of wat een regel deed. */
  detail?: string;
  /** Punten erbij of eraf. */
  points?: number;
  /** Goed of fout, voor de kleur. */
  tone?: 'ok' | 'bad';
}

export interface LogTeam extends TeamRow {
  created_at?: string | null;
}

export interface LogChat {
  id: string;
  team_id: string | null;
  sender: 'staff' | 'team';
  sender_name: string | null;
  body: string;
  created_at: string;
  channel?: string | null;
  photo_path?: string | null;
}

export interface LogLeader {
  id: string;
  name: string;
  created_at: string;
}

export interface LogInput {
  game: GamePackage;
  teams: readonly LogTeam[];
  events: readonly EventRow[];
  photos?: readonly PhotoRow[];
  chat?: readonly LogChat[];
  leaders?: readonly LogLeader[];
  /** Technische meldingen van de telefoons (tabel app_logs). */
  issues?: readonly AppLogRow[];
  now: number;
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);

/** Alle gebeurtenissen van een event, nieuwste eerst. */
export function buildSessionLog({ game, teams, events, photos = [], chat = [], leaders = [], issues = [], now }: LogInput): LogEntry[] {
  const display: Lang = (game.languages as string[]).includes(currentLanguage())
    ? (currentLanguage() as Lang)
    : (game.languages as string[]).includes('nl')
      ? ('nl' as Lang)
      : game.defaultLanguage;
  const tasks = new Map(game.tasks.map((x) => [x.id, x]));
  const title = (id: string | undefined) => (id ? t(tasks.get(id)?.title, display) || id : '');
  const endingTitle = (id: string) => t(game.endings.find((e) => e.id === id)?.title, display) || id;
  const teamLang = (team: LogTeam): Lang =>
    (game.languages as string[]).includes(team.language) ? (team.language as Lang) : game.defaultLanguage;

  const byTeam = new Map<string, GameEvent[]>();
  for (const row of events) {
    const list = byTeam.get(row.team_id) ?? [];
    list.push(fromEventRow(row));
    byTeam.set(row.team_id, list);
  }

  const out: LogEntry[] = [];
  const push = (e: LogEntry) => {
    if (Number.isFinite(e.at)) out.push(e);
  };

  for (const team of teams) {
    const joined = ms(team.created_at);
    if (joined !== null) push({ id: `${team.id}:aangemeld`, at: joined, teamId: team.id, category: 'spel', text: tr('Team aangemeld') });
    const ready = ms(team.ready_at);
    if (ready !== null) push({ id: `${team.id}:klaar`, at: ready, teamId: team.id, category: 'spel', text: tr('Speluitleg gelezen, klaar voor de start') });

    const startedAt = ms(team.started_at);
    const evs = (byTeam.get(team.id) ?? []).sort((a, b) => a.at - b.at);
    if (startedAt === null) continue;
    push({ id: `${team.id}:start`, at: startedAt, teamId: team.id, category: 'spel', text: tr('Gestart') });

    const endedAt = ms(team.ended_at);
    const state = computeState(game, { track: team.track, startedAt, briefingRead: Boolean(team.ready_at) }, evs, endedAt ?? now);
    const rejected = new Map(state.rejected.map((r) => [r.event, r.reason]));
    const lang = teamLang(team);

    // Gebeurtenissen uit de app.
    for (const ev of evs) {
      if (ev.at > (endedAt ?? now)) continue;
      const base = { id: ev.id, at: ev.at, teamId: team.id, category: 'opdracht' as const };
      const name = title(ev.task);
      const why = rejected.get(ev.id);
      const ignored = why === undefined ? undefined : tr('Niet meegeteld: {reason}', { reason: why });
      const task = tasks.get(ev.task);
      switch (ev.type) {
        case 'locationReached':
          push({ ...base, text: tr('Bij de locatie van {task}', { task: name }), detail: ignored, tone: ignored ? 'bad' : undefined });
          break;
        case 'confirmed':
          push({ ...base, text: tr('{task} geopend', { task: name }), detail: ignored });
          break;
        case 'declined':
          push({ ...base, text: tr('{task} (nog) niet geopend', { task: name }), detail: ignored });
          break;
        case 'manualOpen':
          push({ ...base, text: tr('{task} geopend door de spelleiding', { task: name }), detail: ignored });
          break;
        case 'hintUsed': {
          const cost = task?.hints[ev.hint]?.cost ?? 0;
          push({
            ...base,
            text: tr('Hint {n} gebruikt bij {task}', { n: ev.hint + 1, task: name }),
            detail: ignored,
            points: ignored || !cost ? undefined : -cost,
          });
          break;
        }
        case 'answered': {
          const answer = task ? describeAnswer(task.answer, ev.answer, lang) : '';
          if (ignored || !task) {
            push({ ...base, text: tr('{task} beantwoord', { task: name }), detail: [answer, ignored].filter(Boolean).join(' · '), tone: 'bad' });
            break;
          }
          if (task.answer.type === 'info') {
            push({ ...base, text: tr('{task} gelezen', { task: name }) });
            break;
          }
          if (task.answer.type === 'photo' || task.answer.type === 'video') {
            const text = task.answer.type === 'video' ? tr('Video ingestuurd bij {task}', { task: name }) : tr('Foto ingestuurd bij {task}', { task: name });
            push({ ...base, text, points: task.points || undefined, tone: 'ok' });
            break;
          }
          const check = checkAnswer(task.answer, ev.answer);
          const correct = check.valid && check.correct;
          push({
            ...base,
            text: correct ? tr('{task} goed beantwoord', { task: name }) : tr('{task} fout beantwoord', { task: name }),
            detail: answer ? tr('Antwoord: {answer}', { answer }) : undefined,
            points: correct ? task.points || undefined : task.wrongPoints || undefined,
            tone: correct ? 'ok' : 'bad',
          });
          break;
        }
        default: {
          const type = (ev as { type: string }).type;
          push({ ...base, text: name ? `${type}: ${name}` : type, detail: ignored });
        }
      }
    }

    // Regels die zijn uitgevoerd (spelverloop), met wat ze deden.
    for (const rule of game.rules) {
      const at = state.firedRules[rule.id];
      if (at === undefined) continue;
      const points = rule.then.reduce((sum, a) => sum + (a.kind === 'award' ? a.points : 0), 0);
      push({
        id: `${team.id}:regel:${rule.id}`,
        at,
        teamId: team.id,
        category: 'regel',
        text: tr('Regel: {name}', { name: rule.label?.trim() || describeRule(rule) }),
        detail: rule.then.map(describeAction).join('; '),
        points: points || undefined,
      });
    }

    if (state.ended) {
      const ending = game.endings.find((e) => e.id === state.ended!.ending);
      push({
        id: `${team.id}:einde`,
        at: state.ended.at,
        teamId: team.id,
        category: 'spel',
        text: tr('Einde: {name}', { name: endingTitle(state.ended.ending) }),
        points: ending?.bonus || undefined,
      });
    } else if (endedAt !== null) {
      push({ id: `${team.id}:gestopt`, at: endedAt, teamId: team.id, category: 'spel', text: tr('Gestopt') });
    }
  }

  for (const p of photos) {
    push({
      id: `foto:${p.id}`,
      at: Date.parse(p.created_at),
      teamId: p.team_id,
      category: 'foto',
      text: isVideoPath(p.path) ? tr('Video geüpload bij {task}', { task: title(p.task_key) }) : tr('Foto geüpload bij {task}', { task: title(p.task_key) }),
    });
  }

  for (const m of chat) {
    const channel = m.channel === 'hunters' ? tr('Chat hunters') : m.channel === 'teams' ? tr('Teamchat') : tr('Bericht');
    const from = m.sender === 'staff' ? m.sender_name || tr('Spelleiding') : null;
    push({
      id: `chat:${m.id}`,
      at: Date.parse(m.created_at),
      teamId: m.sender === 'team' ? m.team_id : null,
      category: 'chat',
      text: from ? tr('{channel}: bericht van {name}', { channel, name: from }) : tr('{channel}: bericht', { channel }),
      detail: m.photo_path ? `${m.body} (${tr('met foto')})` : m.body,
    });
  }

  for (const l of leaders) {
    push({
      id: `spelleider:${l.id}`,
      at: Date.parse(l.created_at),
      teamId: null,
      category: 'spel',
      text: tr('Spelleider {name} ingelogd in de app', { name: l.name }),
    });
  }

  for (const r of issues) {
    const device = deviceSummary(r.device);
    push({
      id: `techniek:${r.id}`,
      at: Date.parse(r.client_time ?? r.created_at),
      teamId: r.team_id,
      category: 'techniek',
      text: `${kindLabel(r.kind)}${r.repeat_count > 1 ? ` (×${r.repeat_count})` : ''}`,
      detail: [r.message, device].filter(Boolean).join(' · ') || undefined,
      tone: r.level === 'error' ? 'bad' : undefined,
    });
  }

  return out.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** Logboek als CSV voor Excel. */
export function logToCsv(entries: readonly LogEntry[], teamName: (id: string | null) => string, time: (ms: number) => string): string {
  const cell = (v: unknown) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [tr('Tijd'), tr('Team'), tr('Soort'), tr('Wat'), tr('Details'), tr('Punten')];
  const lines = [...entries]
    .sort((a, b) => a.at - b.at)
    .map((e) => [time(e.at), teamName(e.teamId), categoryLabel(e.category), e.text, e.detail, e.points].map(cell).join(';'));
  return `﻿${[head.join(';'), ...lines].join('\n')}`;
}

export function categoryLabel(c: LogCategory): string {
  switch (c) {
    case 'spel':
      return tr('Start en einde');
    case 'opdracht':
      return tr('Opdrachten');
    case 'regel':
      return tr('Regels');
    case 'foto':
      return tr("Foto's");
    case 'chat':
      return tr('Chat');
    case 'techniek':
      return tr('Techniek');
  }
}
