'use client';
import { useState } from 'react';
import { useT } from '@/lib/language';
import { supabase } from '@/lib/supabase';
import type { SessionStatus } from '@/lib/sessions';

/** Schuifknop om een hunt open (teams kunnen aanmelden) of dicht te zetten. */
export function OpenToggle({
  id,
  status,
  onChange,
}: {
  id: string;
  status: SessionStatus;
  onChange: (status: SessionStatus) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = status === 'open';

  const toggle = async () => {
    const next: SessionStatus = open ? 'closed' : 'open';
    setBusy(true);
    setError(null);
    const { error: e } = await supabase().from('sessions').update({ status: next }).eq('id', id);
    setBusy(false);
    if (e) setError(e.message);
    else onChange(next);
  };

  return (
    <label className="switch" title={open ? t('Teams kunnen aanmelden. Klik om te sluiten.') : t('Klik om het ticket te openen.')}>
      <input type="checkbox" role="switch" checked={open} disabled={busy} onChange={() => void toggle()} />
      <span className="slider" aria-hidden="true" />
      <span className={open ? 'on' : 'off'}>{open ? t('Open') : t('Dicht')}</span>
      {error ? <span className="error"> {error}</span> : null}
    </label>
  );
}
