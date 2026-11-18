'use client';
import { Fragment, useState } from 'react';
import { useT } from '@/lib/language';
import { formatDistance, formatDuration, type SessionResultsView, type TeamResult } from '@/lib/results';

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

  return (
    <>
      <input className="search" placeholder={t('Zoek team')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="table-wrap">
        <table className="standings">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('Team')}</th>
              <th className="num">{t('Punten')}</th>
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
                  <td>{tm.rank}</td>
                  <td>
                    <span className="dot" style={{ background: colors.get(tm.id) }} /> <strong>{tm.name}</strong>
                    <div className="muted small">
                      {phone(tm.id) ? (
                        <a href={`tel:${phone(tm.id)}`} onClick={(e) => e.stopPropagation()}>
                          {phone(tm.id)}
                        </a>
                      ) : null}
                      {phone(tm.id) ? ' · ' : ''}{t('track {n}', { n: tm.track })} · {tm.language.toUpperCase()}
                    </div>
                  </td>
                  <td className="num">
                    <strong>{tm.score}</strong>
                  </td>
                  <td className="num">{tm.answers.length}</td>
                  <td className="num">{tm.correct}</td>
                  <td className="num">{tm.wrong}</td>
                  <td className="num">{tm.hintsUsed}</td>
                  <td className="num">{formatDistance(tm.distanceM)}</td>
                  <td>{startedAt(tm.id)}</td>
                  <td>
                    {formatDuration(tm.durationSeconds)} {tm.playing ? <span className="badge open">{t('speelt')}</span> : null}
                  </td>
                  <td>{tm.outcomeLabel}</td>
                </tr>
                {open === tm.id ? (
                  <tr className="details">
                    <td colSpan={11}>
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
                <td>{t('Totaal ({n} teams)', { n: teams.length })}</td>
                <td className="num">{sum((t) => t.score)}</td>
                <td className="num">{sum((t) => t.answers.length)}</td>
                <td className="num">{sum((t) => t.correct)}</td>
                <td className="num">{sum((t) => t.wrong)}</td>
                <td className="num">{sum((t) => t.hintsUsed)}</td>
                <td className="num">{formatDistance(sum((t) => t.distanceM ?? 0))}</td>
                <td></td>
                <td>{formatDuration(sum((t) => t.durationSeconds ?? 0))}</td>
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
