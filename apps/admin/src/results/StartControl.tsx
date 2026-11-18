'use client';
import { useState } from 'react';
import type { SessionLive } from '@/lib/session-live';
import { supabase } from '@/lib/supabase';

/**
 * Centrale start: de spelleider vergrendelt de hunt als alle teams binnen zijn,
 * ziet welke teams de speluitleg hebben gelezen en start dan het spel voor
 * iedereen tegelijk.
 */
export function StartControl({ data, onChange }: { data: SessionLive; onChange: () => void }) {
  const { session, teams } = data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = teams.filter((t) => t.ready_at).length;

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (r.error) setError(r.error.message);
    else onChange();
  };

  const toggleLock = () =>
    run(() => supabase().from('sessions').update({ locked: !session.locked }).eq('id', session.id));
  const start = () => {
    const missing = teams.length - ready;
    const question =
      missing > 0
        ? `${missing} team${missing === 1 ? ' is' : 's zijn'} nog niet klaar met de uitleg. Toch het spel starten voor alle teams?`
        : `Het spel starten voor alle ${teams.length} teams? De tijd gaat dan voor iedereen lopen.`;
    if (window.confirm(question)) void run(() => supabase().rpc('start_session', { p_session: session.id }));
  };

  return (
    <section className="card startcontrol">
      <h2 style={{ marginTop: 0 }}>Start van het spel</h2>
      {session.status !== 'open' ? (
        <p className="notice">Zet de hunt eerst op Open, dan kunnen teams zich aanmelden.</p>
      ) : null}
      <ol className="steps">
        <li className={session.locked ? 'done' : ''}>
          <strong>Aanmelden.</strong> {teams.length} team{teams.length === 1 ? '' : 's'} binnen.{' '}
          {session.locked ? 'Vergrendeld: nieuwe teams kunnen niet meer aanmelden.' : 'Vergrendel als alle teams binnen zijn.'}{' '}
          <button className="link" disabled={busy} onClick={() => void toggleLock()}>
            {session.locked ? 'Ontgrendelen' : 'Vergrendelen'}
          </button>
        </li>
        <li className={teams.length > 0 && ready === teams.length ? 'done' : ''}>
          <strong>Speluitleg lezen.</strong> {ready} van {teams.length} teams klaar.
          <ul className="readylist">
            {teams.map((t) => (
              <li key={t.id}>
                <span className={t.ready_at ? 'ok' : 'muted'}>{t.ready_at ? '✓' : '…'}</span> {t.name}{' '}
                <span className="muted small">teamcode {t.team_code}</span>
              </li>
            ))}
          </ul>
        </li>
        <li>
          <strong>Starten.</strong> De speeltijd begint voor alle teams op hetzelfde moment.
          <div className="actions">
            <button disabled={busy || teams.length === 0 || session.status !== 'open'} onClick={start}>
              Start het spel voor alle teams
            </button>
          </div>
        </li>
      </ol>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
