'use client';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/language';
import { supabase } from '@/lib/supabase';

/**
 * Ingelogd, maar (nog) geen lid van een organisatie. Zelf een organisatie
 * aanmaken kan niet: toegang loopt via een uitnodiging (Toegang).
 */
export default function StartPage() {
  const { reload, user } = useAuth();
  const t = useT();
  return (
    <div className="card narrow">
      <h1>{t('Nog geen toegang')}</h1>
      <p className="muted">
        {t('Je account ({email}) is nog niet aan een organisatie gekoppeld. Vraag de beheerder om je uit te nodigen met dit e-mailadres, en klik daarna op Opnieuw proberen.', { email: user?.email ?? '' })}
      </p>
      <div className="actions">
        <button onClick={() => void reload()}>{t('Opnieuw proberen')}</button>
        <button className="link" onClick={() => void supabase().auth.signOut()}>
          {t('Uitloggen')}
        </button>
      </div>
    </div>
  );
}
