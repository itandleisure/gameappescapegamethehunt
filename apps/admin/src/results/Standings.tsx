'use client';
import { Fragment, useState } from 'react';
import { formatDistance, formatDuration, type SessionResultsView, type TeamResult } from '@/lib/results';

function TeamAnswers({ team }: { team: TeamResult }) {
  if (team.answers.length === 0) return <p className="muted">Nog geen antwoorden.</p>;
  return (
    <table className="inner">
      <thead>
        <tr>
          <th>Tijd</th>
          <th>Opdracht</th>
          <th>Antwoord</th>
          <th className="num">Pogingen</th>
          <th className="num">Hints</th>
          <th className="num">Punten</th>
        </tr>
      </thead>
      <tbody>
        {team.answers.map((a) => (
          <tr key={a.task}>
            <td>{formatDuration(a.atSeconds)}</td>
            <td>{a.title}</td>
            <td className={a.result}>
              {a.answer}
              {a.result === 'wrong' && a.expected ? <span className="muted small"> (goed: {a.expected})</span> : null}
            </td>
            <td className="num">{a.attempts}</td>
            <td className="num">{a.hintsUsed}</td>
            <td className="num">{a.points}</td>
          </tr>
        ))}
        {team.bonusPoints !== 0 ? (
          <tr>
            <td></td>
            <td colSpan={4}>Overige punten (regels en einde)</td>
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
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = search.trim().toLowerCase();
  const teams = q ? view.teams.filter((t) => t.name.toLowerCase().includes(q)) : view.teams;
  const sum = (f: (t: TeamResult) => number) => teams.reduce((s, t) => s + f(t), 0);

  return (
    <>
      <input className="search" placeholder="Zoek team" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="table-wrap">
        <table className="standings">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th className="num">Punten</th>
              <th className="num">Antwoorden</th>
              <th className="num">Goed</th>
              <th className="num">Fout</th>
              <th className="num">Hints</th>
              <th className="num">Afstand</th>
              <th>Gestart</th>
              <th>Speeltijd</th>
              <th>Uitkomst</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <Fragment key={t.id}>
                <tr className="clickable" onClick={() => setOpen(open === t.id ? null : t.id)}>
                  <td>{t.rank}</td>
                  <td>
                    <span className="dot" style={{ background: colors.get(t.id) }} /> <strong>{t.name}</strong>
                    <div className="muted small">
                      {phone(t.id) ? (
                        <a href={`tel:${phone(t.id)}`} onClick={(e) => e.stopPropagation()}>
                          {phone(t.id)}
                        </a>
                      ) : null}
                      {phone(t.id) ? ' · ' : ''}track {t.track} · {t.language.toUpperCase()}
                    </div>
                  </td>
                  <td className="num">
                    <strong>{t.score}</strong>
                  </td>
                  <td className="num">{t.answers.length}</td>
                  <td className="num">{t.correct}</td>
                  <td className="num">{t.wrong}</td>
                  <td className="num">{t.hintsUsed}</td>
                  <td className="num">{formatDistance(t.distanceM)}</td>
                  <td>{startedAt(t.id)}</td>
                  <td>
                    {formatDuration(t.durationSeconds)} {t.playing ? <span className="badge open">speelt</span> : null}
                  </td>
                  <td>{t.outcomeLabel}</td>
                </tr>
                {open === t.id ? (
                  <tr className="details">
                    <td colSpan={11}>
                      <TeamAnswers team={t} />
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
                <td>Totaal ({teams.length} teams)</td>
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
      <p className="muted small">Klik op een team voor de antwoorden per opdracht.</p>
    </>
  );
}
