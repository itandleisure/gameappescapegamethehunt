'use client';
import { useState } from 'react';
import type { SessionLive } from '@/lib/session-live';
import { useT } from '@/lib/language';
import { supabase } from '@/lib/supabase';

/**
 * Centrale start: de spelleider vergrendelt de hunt als alle teams binnen zijn,
 * ziet welke teams de speluitleg hebben gelezen en start dan het spel voor
 * iedereen tegelijk.
 */
export function StartControl({ data, onChange }: { data: SessionLive; onChange: () => void }) {
  const { session, teams } = data;
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = teams.filter((x) => x.ready_at).length;

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
        ? missing === 1
          ? t('1 team is nog niet klaar met de uitleg. Toch het spel starten voor alle teams?')
          : t('{n} teams zijn nog niet klaar met de uitleg. Toch het spel starten voor alle teams?', { n: missing })
        : t('Het spel starten voor alle {n} teams? De tijd gaat dan voor iedereen lopen.', { n: teams.length });
    if (window.confirm(question)) void run(() => supabase().rpc('start_session', { p_session: session.id }));
  };

  return (
    <section className="card startcontrol">
      <h2 style={{ marginTop: 0 }}>{t('Start van het spel')}</h2>
      {session.status !== 'open' ? (
        <p className="notice">{t('Zet de hunt eerst op Open, dan kunnen teams zich aanmelden.')}</p>
      ) : null}
      <ol className="steps">
        <li className={session.locked ? 'done' : ''}>
          <strong>{t('Aanmelden.')}</strong>{' '}
          {teams.length === 1 ? t('1 team binnen.') : t('{n} teams binnen.', { n: teams.length })}{' '}
          {session.locked ? t('Vergrendeld: nieuwe teams kunnen niet meer aanmelden.') : t('Vergrendel als alle teams binnen zijn.')}{' '}
          <button className="link" disabled={busy} onClick={() => void toggleLock()}>
            {session.locked ? t('Ontgrendelen') : t('Vergrendelen')}
          </button>
        </li>
        <li className={teams.length > 0 && ready === teams.length ? 'done' : ''}>
          <strong>{t('Speluitleg lezen.')}</strong> {t('{ready} van {n} teams klaar.', { ready, n: teams.length })}
          <ul className="readylist">
            {teams.map((x) => (
              <li key={x.id}>
                <span className={x.ready_at ? 'ok' : 'muted'}>{x.ready_at ? '✓' : '…'}</span> {x.name}{' '}
                <span className="muted small">{t('teamcode {code}', { code: x.team_code })}</span>
              </li>
            ))}
          </ul>
        </li>
        <li>
          <strong>{t('Starten.')}</strong> {t('De speeltijd begint voor alle teams op hetzelfde moment.')}
          <div className="actions">
            <button disabled={busy || teams.length === 0 || session.status !== 'open'} onClick={start}>
              {t('Start het spel voor alle teams')}
            </button>
          </div>
        </li>
      </ol>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
