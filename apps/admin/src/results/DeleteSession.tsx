'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useT } from '@/lib/language';
import { supabase } from '@/lib/supabase';

const BATCH = 100;

/**
 * Hunt helemaal verwijderen, met teams, telefoonnummers, routes, foto's, chat
 * en fotoboek. Eerst de bestanden uit de opslag, dan de hunt zelf (de rest
 * gaat in de database automatisch mee). Na 28 dagen gebeurt het opruimen van
 * persoonsgegevens ook vanzelf; deze knop is om het meteen te doen.
 */
export function DeleteSession({ id, name, photoPaths }: { id: string; name: string; photoPaths: string[] }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (!window.confirm(t('Hunt "{name}" helemaal verwijderen, met alle teams, foto\'s, routes, telefoonnummers en chat? Dit kan niet ongedaan worden.', { name }))) return;
    setBusy(true);
    setError(null);
    try {
      const db = supabase();
      for (let i = 0; i < photoPaths.length; i += BATCH) {
        const { error: e } = await db.storage.from('photos').remove(photoPaths.slice(i, i + BATCH));
        if (e) throw new Error(e.message);
      }
      const { data: files } = await db.storage.from('photobooks').list(id, { limit: 1000 });
      const bookPaths = (files ?? []).map((f) => `${id}/${f.name}`);
      if (bookPaths.length) {
        const { error: e } = await db.storage.from('photobooks').remove(bookPaths);
        if (e) throw new Error(e.message);
      }
      const { error: e, count } = await db.from('sessions').delete({ count: 'exact' }).eq('id', id);
      if (e) throw new Error(e.message);
      if (!count) throw new Error(t('Alleen de spelleiding van deze hunt kan hem verwijderen.'));
      router.replace('/sessies');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <button className="danger" disabled={busy} onClick={() => void remove()}>
        {busy ? t('Verwijderen…') : t('Hunt verwijderen')}
      </button>
      {error ? <span className="error"> {error}</span> : null}
    </>
  );
}
