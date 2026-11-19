'use client';
import { useState } from 'react';
import { useT } from '@/lib/language';
import { supabase } from '@/lib/supabase';

const BATCH = 100;
const PAGE = 1000;

type Db = ReturnType<typeof supabase>;

/** Paden van alle spelfoto's van de teams in dit ticket. */
async function teamPhotoPaths(db: Db, sessionId: string): Promise<string[]> {
  const { data: teams, error } = await db.from('teams').select('id').eq('session_id', sessionId);
  if (error) throw new Error(error.message);
  const ids = (teams ?? []).map((r) => (r as { id: string }).id);
  const paths: string[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    for (let from = 0; ; from += PAGE) {
      const { data, error: e } = await db
        .from('photos')
        .select('path')
        .in('team_id', ids.slice(i, i + BATCH))
        .order('id')
        .range(from, from + PAGE - 1);
      if (e) throw new Error(e.message);
      paths.push(...(data ?? []).map((r) => (r as { path: string }).path));
      if (!data || data.length < PAGE) break;
    }
  }
  return paths;
}

/** Bestanden in de map van het ticket in de fotoboek-opslag: het fotoboek zelf en de eigen foto's en chatfoto's (map eigen). */
async function photobookPaths(db: Db, sessionId: string): Promise<string[]> {
  const paths: string[] = [];
  for (const folder of [sessionId, `${sessionId}/eigen`]) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db.storage.from('photobooks').list(folder, { limit: PAGE, offset });
      if (error) throw new Error(error.message);
      // Een map (zoals eigen) heeft geen id; die is geen bestand.
      paths.push(...(data ?? []).filter((f) => f.id && f.name && !f.name.startsWith('.')).map((f) => `${folder}/${f.name}`));
      if (!data || data.length < PAGE) break;
    }
  }
  return paths;
}

/**
 * Ticket helemaal verwijderen, ook als er al mee gespeeld is of als het nooit
 * gebruikt is: teams, telefoonnummers, routes, foto's, chat en fotoboek. Eerst
 * de bestanden uit de opslag, dan het ticket zelf (de rest gaat in de database
 * automatisch mee). Na 28 dagen gebeurt het opruimen van persoonsgegevens ook
 * vanzelf; deze knop is om het meteen te doen.
 */
export function DeleteSession({
  id,
  name,
  teamCount,
  photoPaths,
  onDeleted,
  short = false,
}: {
  id: string;
  name: string;
  /** Aantal teams dat meedeed; 0 als het ticket nog niet gebruikt is. */
  teamCount: number;
  /** Foto's die de pagina al kent; zonder deze lijst worden ze opgezocht. */
  photoPaths?: string[];
  onDeleted: () => void;
  /** Korte knoptekst, voor in de lijst met tickets. */
  short?: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    const rest = t('Alle teams, resultaten, foto\'s, routes, telefoonnummers, chat en het fotoboek worden ook verwijderd. Dit kan niet ongedaan worden.');
    const question =
      teamCount === 0
        ? t('Ticket "{name}" verwijderen? Er heeft nog geen team mee gespeeld. Dit kan niet ongedaan worden.', { name })
        : `${teamCount === 1 ? t('Ticket "{name}" verwijderen? Er heeft al 1 team mee gespeeld.', { name }) : t('Ticket "{name}" verwijderen? Er hebben al {n} teams mee gespeeld.', { name, n: teamCount })} ${rest}`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setError(null);
    try {
      const db = supabase();
      const photos = photoPaths ?? (await teamPhotoPaths(db, id));
      for (let i = 0; i < photos.length; i += BATCH) {
        const { error: e } = await db.storage.from('photos').remove(photos.slice(i, i + BATCH));
        if (e) throw new Error(e.message);
      }
      const book = await photobookPaths(db, id);
      for (let i = 0; i < book.length; i += BATCH) {
        const { error: e } = await db.storage.from('photobooks').remove(book.slice(i, i + BATCH));
        if (e) throw new Error(e.message);
      }
      const { error: e, count } = await db.from('sessions').delete({ count: 'exact' }).eq('id', id);
      if (e) throw new Error(e.message);
      if (!count) throw new Error(t('Alleen de spelleiding van dit ticket kan het verwijderen.'));
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <button className="danger" disabled={busy} onClick={() => void remove()}>
        {busy ? t('Verwijderen…') : short ? t('Verwijderen') : t('Ticket verwijderen')}
      </button>
      {error ? <span className="error"> {error}</span> : null}
    </>
  );
}
