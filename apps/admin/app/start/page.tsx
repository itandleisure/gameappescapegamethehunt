'use client';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/language';
import { supabase } from '@/lib/supabase';

export default function StartPage() {
  const { reload } = useAuth();
  const t = useT();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().rpc('create_organization', { p_name: name });
    if (error) setError(error.message);
    else await reload();
    setBusy(false);
  };

  return (
    <div className="card narrow">
      <h1>{t('Organisatie aanmaken')}</h1>
      <p className="muted">
        {t('Je bent nog geen lid van een organisatie. Maak je eigen organisatie aan, of vraag een eigenaar om je toe te voegen.')}
      </p>
      <form onSubmit={submit}>
        <label htmlFor="name">{t('Naam')}</label>
        <input
          id="name"
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Badass Games"
        />
        {error ? <p className="error">{error}</p> : null}
        <div className="actions">
          <button type="submit" disabled={busy}>
            {t('Aanmaken')}
          </button>
        </div>
      </form>
    </div>
  );
}
