'use client';
import { t as text, type GamePackage } from '@hunt/engine';
import { useState } from 'react';
import type { SessionResultsView } from '@/lib/results';

/** Per opdracht: welk team gaf welk antwoord, goed of fout, met punten (zoals "Answers" in Loquiz). */
export function Answers({ view, game, colors }: { view: SessionResultsView; game: GamePackage; colors: Map<string, string> }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [onlyAnswered, setOnlyAnswered] = useState(true);
  const tasks = onlyAnswered ? view.tasks.filter((x) => x.answered > 0) : view.tasks;

  return (
    <>
      <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
        <p className="muted" style={{ margin: 0 }}>
          {view.tasks.length} opdrachten met een antwoord, {view.tasks.filter((x) => x.answered > 0).length} al beantwoord.
        </p>
        <label className="check" style={{ margin: 0, flex: '0 0 auto' }}>
          <input type="checkbox" checked={onlyAnswered} onChange={(e) => setOnlyAnswered(e.target.checked)} />
          Alleen beantwoorde opdrachten
        </label>
      </div>
      <div className="answers">
        {tasks.map((col, i) => {
          const task = game.tasks.find((x) => x.id === col.id)!;
          const body = text(task.body, 'nl', game.defaultLanguage);
          const isOpen = expanded.has(col.id);
          const given = view.teams.flatMap((team) => {
            const a = team.answers.find((x) => x.task === col.id);
            return a ? [{ team, a }] : [];
          });
          return (
            <article key={col.id} className="card answercard">
              <div className="question">
                <div className="qhead">
                  <span className="muted">{i + 1}</span>
                  <span className="points">{col.points}</span>
                </div>
                <h3>{col.title}</h3>
                {body ? (
                  <>
                    <div className={`body${isOpen || body.length <= 160 ? ' open' : ''}`}>{body}</div>
                    {body.length > 160 ? (
                    <button
                      className="link small"
                      onClick={() => {
                        const next = new Set(expanded);
                        if (isOpen) next.delete(col.id);
                        else next.add(col.id);
                        setExpanded(next);
                      }}
                    >
                      {isOpen ? 'Minder' : 'Meer tekst'}
                    </button>
                    ) : null}
                  </>
                ) : null}
                {task.answer.type === 'choice' || task.answer.type === 'multi' ? (
                  <div className="options">
                    {task.answer.options.map((o, n) => {
                      const spec = task.answer as { type: 'choice'; correct: number } | { type: 'multi'; correct: number[] };
                      const ok = spec.type === 'choice' ? spec.correct === n : spec.correct.includes(n);
                      return (
                        <span key={n} className={`option${ok ? ' correct' : ''}`}>
                          {text(o, 'nl', game.defaultLanguage)}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                {task.answer.type === 'text' ? (
                  <p className="muted small">Goed: {task.answer.accepted.join(' / ')}</p>
                ) : null}
              </div>
              <div className="given">
                <div className="small muted">
                  Antwoorden {col.answered ? `· ${col.correct} van ${col.answered} goed` : ''}
                </div>
                {given.length === 0 ? <p className="muted">Nog geen antwoorden</p> : null}
                <ul>
                  {given.map(({ team, a }) => (
                    <li key={team.id} className={a.result}>
                      <span className="dot" style={{ background: colors.get(team.id) }} />
                      <strong>{team.name}</strong>
                      : {a.answer}, {a.points}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
