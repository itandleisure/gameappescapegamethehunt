'use client';
import { useState } from 'react';
import { useT } from '@/lib/language';
import { supabase } from '@/lib/supabase';

/**
 * Spelleider-link: een geheime link naar de live monitor en de resultaten van
 * deze hunt, voor een spelleider zonder account. Een nieuwe link zet de oude uit.
 */
export function LeaderLink({ sessionId }: { sessionId: string }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchLink = async (fresh: boolean) => {
    if (fresh && !window.confirm(t('Nieuwe link maken? De oude link werkt dan niet meer.'))) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    const { data, error: e } = await supabase().rpc('leader_link', { p_session: sessionId, p_new: fresh });
    setBusy(false);
    if (e) setError(e.message);
    else setUrl(`${window.location.origin}/spelleider/${data as string}`);
  };
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (!url) {
    return (
      <button className="secondary" disabled={busy} onClick={() => void fetchLink(false)}>
        {t('Spelleider-link')}
      </button>
    );
  }
  return (
    <div className="card" style={{ flexBasis: '100%' }}>
      <p className="small muted" style={{ marginTop: 0 }}>
        {t('Met deze link ziet een spelleider de kaart, de ranglijst met telefoonnummers, de antwoorden en de teamchat, stuurt hij berichten als The Hunters en houdt hij "gepakt" bij. Zonder account. Deel hem alleen met de spelleiding.')}
      </p>
      <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label={t('Spelleider-link')} />
      <div className="actions">
        <button className="secondary" onClick={() => void copy()}>
          {copied ? t('Gekopieerd') : t('Kopiëren')}
        </button>
        <a className="buttonlink" href={url} target="_blank" rel="noreferrer">
          {t('Openen')}
        </a>
        <button className="link" disabled={busy} onClick={() => void fetchLink(true)}>
          {t('Nieuwe link (oude werkt niet meer)')}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
