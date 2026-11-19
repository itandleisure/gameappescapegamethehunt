'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/language';
import { supabase } from '@/lib/supabase';

/** Wachtwoord kiezen: na de inloglink uit de uitnodiging, of na "wachtwoord vergeten". */
export default function PasswordPage() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase().auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message);
    else router.replace('/sessies');
  };

  return (
    <div className="card narrow">
      <h1>{t('Wachtwoord kiezen')}</h1>
      <p className="muted">{t('Kies een wachtwoord voor {email}. Daarmee log je voortaan in.', { email: user?.email ?? '' })}</p>
      <form onSubmit={submit}>
        <label htmlFor="password">{t('Wachtwoord')}</label>
        <input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <p className="error">{error}</p> : null}
        <div className="actions">
          <button type="submit" disabled={busy}>
            {t('Opslaan')}
          </button>
        </div>
      </form>
    </div>
  );
}
