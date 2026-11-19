'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/language';
import type { LeaderRow } from '@/lib/session-live';
import { supabase } from '@/lib/supabase';

/**
 * Spelleiders van een hunt: één code waarmee de spelleiders in de game-app
 * inloggen, het maximale aantal, en wie er nu is ingelogd. Een nieuwe code
 * meldt iedereen af.
 */
export function LeaderCode({
  sessionId,
  maxLeaders,
  leaders,
  canEdit,
  onChange,
}: {
  sessionId: string;
  maxLeaders: number;
  leaders: LeaderRow[];
  /** Beheerder of partner; een oud spelleider-account kan alleen kijken. */
  canEdit: boolean;
  onChange: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [max, setMax] = useState(String(maxLeaders));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMax(String(maxLeaders)), [maxLeaders]);

  const fetchCode = async (fresh: boolean) => {
    if (fresh && !window.confirm(t('Nieuwe spelleider-code maken? Alle spelleiders worden afgemeld en moeten opnieuw inloggen.'))) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase().rpc('leader_code', { p_session: sessionId, p_new: fresh });
    setBusy(false);
    if (e) setError(e.message);
    else {
      setCode(data as string);
      setOpen(true);
      if (fresh) onChange();
    }
  };

  const saveMax = async () => {
    const n = Number(max);
    if (!Number.isInteger(n) || n < 0 || n > 50) {
      setError(t('Kies een aantal van 0 tot 50.'));
      return;
    }
    if (n === maxLeaders) return;
    setError(null);
    const { error: e } = await supabase().from('sessions').update({ max_leaders: n }).eq('id', sessionId);
    if (e) setError(e.message);
    else onChange();
  };

  const signOut = async (leader: LeaderRow) => {
    if (!window.confirm(t('{name} afmelden als spelleider?', { name: leader.name }))) return;
    const { error: e } = await supabase().from('session_leaders').delete().eq('id', leader.id);
    if (e) setError(e.message);
    else onChange();
  };

  const label = leaders.length
    ? t('Spelleiders ({n}/{max})', { n: leaders.length, max: maxLeaders })
    : t('Spelleiders');

  if (!open) {
    return (
      <button className="secondary" disabled={busy} onClick={() => (canEdit ? void fetchCode(false) : setOpen(true))}>
        {label}
      </button>
    );
  }
  return (
    <div className="card" style={{ flexBasis: '100%' }}>
      <div className="row" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0, flex: '1 1 auto' }}>{label}</h2>
        <button className="link" onClick={() => setOpen(false)}>
          {t('Sluiten')}
        </button>
      </div>
      <p className="small muted">
        {t('Spelleiders openen de game-app, kiezen "Inloggen als spelleider" en vullen deze code en hun eigen naam in. Ze zien de teams en elkaar op de kaart, bellen teams, houden "gepakt" bij en chatten als The Hunters. Teams zien de spelleiders niet.')}
      </p>
      {code ? (
        <p>
          {t('Spelleider-code')} <strong className="bigcode">{code}</strong>
        </p>
      ) : null}
      {canEdit ? (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div>
            <label htmlFor="max-leaders">{t('Maximaal aantal spelleiders')}</label>
            <input
              id="max-leaders"
              type="number"
              min={0}
              max={50}
              value={max}
              onChange={(e) => setMax(e.target.value)}
              onBlur={() => void saveMax()}
              style={{ maxWidth: 120 }}
            />
          </div>
          <button className="link" disabled={busy} onClick={() => void fetchCode(true)}>
            {t('Nieuwe code (iedereen afmelden)')}
          </button>
        </div>
      ) : null}
      {leaders.length === 0 ? (
        <p className="muted small">{t('Nog geen spelleiders ingelogd.')}</p>
      ) : (
        <ul className="teamlist">
          {leaders.map((l) => (
            <li key={l.id}>
              <span className="dot hunterdot" />
              <span>{l.name}</span>
              {canEdit ? (
                <button className="link small" onClick={() => void signOut(l)}>
                  {t('Afmelden')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
