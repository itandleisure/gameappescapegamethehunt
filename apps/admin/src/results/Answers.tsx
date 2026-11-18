'use client';
import { richToPlain, t as text, type GamePackage, type Lang } from '@hunt/engine';
import { useState } from 'react';
import { useLanguage } from '@/lib/language';
import type { SessionResultsView } from '@/lib/results';

/** Per opdracht: welk team gaf welk antwoord, goed of fout, met punten (zoals "Answers" in Loquiz). */
export function Answers({ view, game, colors }: { view: SessionResultsView; game: GamePackage; colors: Map<string, string> }) {
  const { t, lang } = useLanguage();
  const show = ((game.languages as string[]).includes(lang) ? lang : 'nl') as Lang;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [onlyAnswered, setOnlyAnswered] = useState(true);
  const tasks = onlyAnswered ? view.tasks.filter((x) => x.answered > 0) : view.tasks;

  return (
    <>
      <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
        <p className="muted" style={{ margin: 0 }}>
          {t('{n} opdrachten met een antwoord, {done} al beantwoord.', {
            n: view.tasks.length,
            done: view.tasks.filter((x) => x.answered > 0).length,
          })}
        </p>
        <label className="check" style={{ margin: 0, flex: '0 0 auto' }}>
          <input type="checkbox" checked={onlyAnswered} onChange={(e) => setOnlyAnswered(e.target.checked)} />
          {t('Alleen beantwoorde opdrachten')}
        </label>
      </div>
      <div className="answers">
        {tasks.map((col, i) => {
          const task = game.tasks.find((x) => x.id === col.id)!;
          const body = richToPlain(text(task.body, show, game.defaultLanguage));
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
                      {isOpen ? t('Minder') : t('Meer tekst')}
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
                          {text(o, show, game.defaultLanguage)}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                {task.answer.type === 'text' ? (
                  <p className="muted small">{t('Goed:')} {task.answer.accepted.join(' / ')}</p>
                ) : null}
              </div>
              <div className="given">
                <div className="small muted">
                  {t('Antwoorden')} {col.answered ? `· ${t('{correct} van {n} goed', { correct: col.correct, n: col.answered })}` : ''}
                </div>
                {given.length === 0 ? <p className="muted">{t('Nog geen antwoorden')}</p> : null}
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
