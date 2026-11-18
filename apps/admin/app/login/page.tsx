'use client';
import { useState, type FormEvent } from 'react';
import { useT } from '@/lib/language';
import { supabase } from '@/lib/supabase';
import { LanguagePicker } from '../shell';

export default function LoginPage() {
  const t = useT();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const auth = supabase().auth;
    if (mode === 'login') {
      const { error } = await auth.signInWithPassword({ email, password });
      if (error) setError(error.message === 'Invalid login credentials' ? t('E-mail of wachtwoord klopt niet.') : error.message);
    } else {
      const { data, error } = await auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      if (error) setError(error.message);
      else if (!data.session) setNotice(t('Check je mail en klik op de bevestigingslink. Daarna kun je inloggen.'));
    }
    setBusy(false);
  };

  return (
    <div className="card narrow">
      <div className="langcorner">
        <LanguagePicker />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-full-dark.png" alt="Escape Game The Hunt" className="loginlogo only-light" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-full-light.png" alt="Escape Game The Hunt" className="loginlogo only-dark" />
      <h1>{mode === 'login' ? t('Inloggen') : t('Account aanmaken')}</h1>
      <p className="muted">{t('Beheeromgeving van Escape Game The Hunt.')}</p>
      <form onSubmit={submit}>
        <label htmlFor="email">{t('E-mail')}</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">{t('Wachtwoord')}</label>
        <input
          id="password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="notice">{notice}</p> : null}
        <div className="actions">
          <button type="submit" disabled={busy}>
            {mode === 'login' ? t('Inloggen') : t('Account aanmaken')}
          </button>
          <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? t('Nog geen account?') : t('Ik heb al een account')}
          </button>
        </div>
      </form>
    </div>
  );
}
