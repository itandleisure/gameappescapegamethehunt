'use client';
import { gameLanguageTag } from '@/lib/game-languages';
import { Fragment, useEffect, useState } from 'react';
import { useT } from '@/lib/language';
import { formatDistance, formatDuration, type SessionResultsView, type TeamResult } from '@/lib/results';
import { supabase } from '@/lib/supabase';

/** Vakjes per puzzel achter de teamnaam, elk met het nummer van zijn puzzel: groen als die is opgelost. */
function PuzzleChecks({ team, puzzles }: { team: TeamResult; puzzles: SessionResultsView['puzzles'] }) {
  const t = useT();
  if (puzzles.length === 0) return null;
  return (
    <span className="puzzles" aria-label={t('{n} van {m} puzzels opgelost', { n: team.solvedPuzzles.length, m: puzzles.length })}>
      {puzzles.map((p, i) => {
        const done = team.solvedPuzzles.includes(p.id);
        return (
          <span key={p.id} className={done ? 'puzzle done' : 'puzzle'} title={`${p.title}: ${done ? t('opgelost') : t('nog niet opgelost')}`}>
            {i + 1}
          </span>
        );
      })}
    </span>
  );
}

/** Hoe ver het team is met de speluitleg, bijvoorbeeld "Uitleg 5/12". Helemaal gelezen: groen. */
function BriefingProgress({ team }: { team: TeamResult }) {
  const t = useT();
  const { read, total } = team.briefing;
  if (total === 0) return null;
  const done = read >= total;
  return (
    <span className={done ? 'badge open' : 'badge'} title={t('Gelezen schermen van de speluitleg')}>
      {done ? t('Uitleg gelezen ✓') : t('Uitleg {n}/{m}', { n: read, m: total })}
    </span>
  );
}

/** Teller "gepakt" met een min en een plus. Telt direct in de database, zodat meerdere spelleiders tegelijk kunnen tikken. */
function CaughtCounter({ team }: { team: TeamResult }) {
  const t = useT();
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = pending ?? team.caught;
  const bump = async (delta: 1 | -1) => {
    if (value + delta < 0) return;
    setPending(value + delta);
    setError(null);
    const { data, error: e } = await supabase().rpc('bump_team_caught', { p_team: team.id, p_delta: delta });
    if (e) {
      setError(e.message);
      setPending(null);
    } else {
      setPending(typeof data === 'number' ? data : null);
    }
  };
  // Zodra de live update binnen is, die waarde volgen.
  useEffect(() => {
    setPending((p) => (p === team.caught ? null : p));
  }, [team.caught]);
  return (
    <span className="counter" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="secondary small" aria-label={t('Eén keer minder gepakt')} disabled={value === 0} onClick={() => void bump(-1)}>
        −
      </button>
      <strong>{value}</strong>
      <button type="button" className="secondary small" aria-label={t('Eén keer meer gepakt')} onClick={() => void bump(1)}>
        +
      </button>
      {error ? <span className="error small"> {error}</span> : null}
    </span>
  );
}

function TeamAnswers({ team }: { team: TeamResult }) {
  const t = useT();
  if (team.answers.length === 0) return <p className="muted">{t('Nog geen antwoorden.')}</p>;
  return (
    <table className="inner">
      <thead>
        <tr>
          <th>{t('Tijd')}</th>
          <th>{t('Opdracht')}</th>
          <th>{t('Antwoord')}</th>
          <th className="num">{t('Pogingen')}</th>
          <th className="num">{t('Hints')}</th>
          <th className="num">{t('Punten')}</th>
        </tr>
      </thead>
      <tbody>
        {team.answers.map((a) => (
          <tr key={a.task}>
            <td>{formatDuration(a.atSeconds)}</td>
            <td>{a.title}</td>
            <td className={a.result}>
              {a.answer}
              {a.result === 'wrong' && a.expected ? <span className="muted small"> ({t('goed:')} {a.expected})</span> : null}
            </td>
            <td className="num">{a.attempts}</td>
            <td className="num">{a.hintsUsed}</td>
            <td className="num">{a.points}</td>
          </tr>
        ))}
        {team.bonusPoints !== 0 ? (
          <tr>
            <td></td>
            <td colSpan={4}>{t('Overige punten (regels en einde)')}</td>
            <td className="num">{team.bonusPoints}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export function Standings({
  view,
  colors,
  startedAt,
  phone,
}: {
  view: SessionResultsView;
  colors: Map<string, string>;
  startedAt: (id: string) => string;
  phone: (id: string) => string | null;
}) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = search.trim().toLowerCase();
  const teams = q ? view.teams.filter((x) => x.name.toLowerCase().includes(q)) : view.teams;
  const sum = (f: (x: TeamResult) => number) => teams.reduce((s, x) => s + f(x), 0);
  const columns = 12 + (view.puzzles.length ? 1 : 0);

  return (
    <>
      <input className="search" placeholder={t('Zoek team')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="table-wrap">
        <table className="standings stack">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('Team')}</th>
              <th className="num">{t('Punten')}</th>
              {view.puzzles.length ? <th>{t('Puzzels')}</th> : null}
              <th className="num">{t('Gepakt')}</th>
              <th className="num">{t('Antwoorden')}</th>
              <th className="num">{t('Goed')}</th>
              <th className="num">{t('Fout')}</th>
              <th className="num">{t('Hints')}</th>
              <th className="num">{t('Afstand')}</th>
              <th>{t('Gestart')}</th>
              <th>{t('Speeltijd')}</th>
              <th>{t('Uitkomst')}</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((tm) => (
              <Fragment key={tm.id}>
                <tr className="clickable" onClick={() => setOpen(open === tm.id ? null : tm.id)}>
                  <td className="rank">{tm.rank}</td>
                  <td className="team">
                    <span className="dot" style={{ background: colors.get(tm.id) }} /> <strong>{tm.name}</strong> <BriefingProgress team={tm} />
                    <div className="muted small">
                      {phone(tm.id) ? (
                        <a href={`tel:${phone(tm.id)}`} onClick={(e) => e.stopPropagation()}>
                          {phone(tm.id)}
                        </a>
                      ) : null}
                      {phone(tm.id) ? ' · ' : ''}{t('track {n}', { n: tm.track })} · {gameLanguageTag(tm.language)}
                    </div>
                  </td>
                  <td className="num" data-label={t('Punten')}>
                    <strong>{tm.score}</strong>
                  </td>
                  {view.puzzles.length ? (
                    <td className="puzzles" data-label={t('Puzzels')}>
                      <PuzzleChecks team={tm} puzzles={view.puzzles} />
                    </td>
                  ) : null}
                  <td className="num" data-label={t('Gepakt')}>
                    <CaughtCounter team={tm} />
                  </td>
                  <td className="num minor" data-label={t('Antwoorden')}>{tm.answers.length}</td>
                  <td className="num minor" data-label={t('Goed')}>{tm.correct}</td>
                  <td className="num minor" data-label={t('Fout')}>{tm.wrong}</td>
                  <td className="num minor" data-label={t('Hints')}>{tm.hintsUsed}</td>
                  <td className="num minor" data-label={t('Afstand')}>{formatDistance(tm.distanceM)}</td>
                  <td className="minor" data-label={t('Gestart')}>{startedAt(tm.id)}</td>
                  <td data-label={t('Speeltijd')}>
                    {formatDuration(tm.durationSeconds)} {tm.playing ? <span className="badge open">{t('speelt')}</span> : null}
                  </td>
                  <td data-label={t('Uitkomst')}>{tm.outcomeLabel}</td>
                </tr>
                {open === tm.id ? (
                  <tr className="details">
                    <td colSpan={columns}>
                      <TeamAnswers team={tm} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
          {teams.length > 1 ? (
            <tfoot>
              <tr>
                <td></td>
                <td className="team">{t('Totaal ({n} teams)', { n: teams.length })}</td>
                <td className="num" data-label={t('Punten')}>{sum((t) => t.score)}</td>
                {view.puzzles.length ? <td></td> : null}
                <td className="num" data-label={t('Gepakt')}>{sum((t) => t.caught)}</td>
                <td className="num minor" data-label={t('Antwoorden')}>{sum((t) => t.answers.length)}</td>
                <td className="num minor" data-label={t('Goed')}>{sum((t) => t.correct)}</td>
                <td className="num minor" data-label={t('Fout')}>{sum((t) => t.wrong)}</td>
                <td className="num minor" data-label={t('Hints')}>{sum((t) => t.hintsUsed)}</td>
                <td className="num minor" data-label={t('Afstand')}>{formatDistance(sum((t) => t.distanceM ?? 0))}</td>
                <td></td>
                <td data-label={t('Speeltijd')}>{formatDuration(sum((t) => t.durationSeconds ?? 0))}</td>
                <td></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="muted small">{t('Klik op een team voor de antwoorden per opdracht.')}</p>
    </>
  );
}
