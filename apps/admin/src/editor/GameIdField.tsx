'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { isValidGameId, normalizeGameId } from '@/lib/event-links';
import { useLanguage } from '@/lib/language';
import { supabase } from '@/lib/supabase';

/**
 * Game-ID van een spel: het leesbare, unieke deel vóór de dubbele punt in de
 * spellink /<game-ID>:<spelcode>. Aanpassen kan; oude links blijven werken,
 * omdat de spelcode het event al vindt.
 */
export function GameIdField({ gameId }: { gameId: string }) {
  const { t } = useLanguage();
  const [value, setValue] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase()
      .from('games')
      .select('public_id')
      .eq('id', gameId)
      .maybeSingle()
      .then(({ data }) => {
        // Zonder kolom (database nog niet bijgewerkt) blijft het veld weg.
        if (alive) setValue((data as { public_id?: string } | null)?.public_id ?? null);
      });
    return () => {
      alive = false;
    };
  }, [gameId]);

  if (!value) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (draft === null) return;
    const next = normalizeGameId(draft);
    if (!isValidGameId(next)) {
      setError(t('Een game-ID heeft 2 tot 40 tekens: kleine letters, cijfers en streepjes.'));
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase().from('games').update({ public_id: next }).eq('id', gameId).select('public_id').maybeSingle();
    setBusy(false);
    if (err) {
      setError(err.code === '23505' ? t('Dit game-ID is al in gebruik bij een ander spel.') : err.message);
      return;
    }
    setValue((data as { public_id: string } | null)?.public_id ?? next);
    setDraft(null);
  };

  if (draft === null) {
    return (
      <p className="muted small" style={{ marginTop: -8 }}>
        {t('Game-ID')} <strong>{value}</strong>{' '}
· {t('spellinks: /{game}:SPELCODE', { game: value })} ·{' '}
        <button type="button" className="link small" onClick={() => setDraft(value)}>
          {t('Aanpassen')}
        </button>
      </p>
    );
  }
  return (
    <form className="card" onSubmit={(e) => void save(e)} style={{ marginBottom: 16 }}>
      <label htmlFor="game-id">{t('Game-ID')}</label>
      <input id="game-id" value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} autoFocus />
      <p className="small muted">
        {t('Wordt: /{game}:SPELCODE. Bestaande links en QR-codes met het oude game-ID blijven werken.', {
          game: normalizeGameId(draft) || '…',
        })}
      </p>
      {error ? <p className="error">{error}</p> : null}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? t('Bezig…') : t('Opslaan')}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => (setDraft(null), setError(null))}>
          {t('Annuleren')}
        </button>
      </div>
    </form>
  );
}
