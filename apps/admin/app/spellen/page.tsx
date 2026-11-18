'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { parseGameFile } from '@/lib/game-import';
import { copyExternalImages, importBundle } from '@/lib/game-store';
import { supabase } from '@/lib/supabase';
import { tx } from '@/lib/text';

interface GameRow {
  id: string;
  slug: string;
  parent_id: string | null;
  layer: 'base' | 'city' | 'client';
  languages: string[];
  settings: { name?: unknown };
  game_versions: { version: number; published_at: string }[];
  name: { text: string; lang: string }[];
}

const LAYER_LABEL: Record<GameRow['layer'], string> = { base: 'Basisspel', city: 'Stad', client: 'Klant' };

/** Zet de spellen in boomvolgorde: basisspel, dan zijn steden, dan hun klanten. */
function tree(games: GameRow[]): { game: GameRow; depth: number }[] {
  const out: { game: GameRow; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const g of games.filter((x) => x.parent_id === parent).sort((a, b) => a.slug.localeCompare(b.slug))) {
      out.push({ game: g, depth });
      walk(g.id, depth + 1);
    }
  };
  walk(null, 0);
  // Varianten op een gedeeld spel van een andere organisatie (ouder niet zichtbaar).
  for (const g of games) if (!out.some((o) => o.game.id === g.id)) out.push({ game: g, depth: 0 });
  return out;
}

function gameTitle(g: { slug: string; layer: string; settings: { name?: unknown }; name?: { text: string; lang: string }[] }) {
  const own = g.name?.find((n) => n.lang === 'nl') ?? g.name?.[0];
  if (g.layer === 'base' && own) return own.text;
  return tx(g.settings.name) || g.slug;
}

export default function GamesPage() {
  const { org } = useAuth();
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!org) return;
    const db = supabase();
    const [g, n] = await Promise.all([
      db
        .from('games')
        .select('id, slug, parent_id, layer, languages, settings, game_versions(version, published_at)')
        .eq('org_id', org.id),
      db.from('translations').select('game_id, text, lang').eq('entity', 'game').eq('entity_id', '').eq('field', 'name'),
    ]);
    if (g.error || n.error) {
      setErrors([(g.error ?? n.error)!.message]);
      return;
    }
    const names = n.data as { game_id: string; text: string; lang: string }[];
    setGames((g.data as unknown as Omit<GameRow, 'name'>[]).map((row) => ({ ...row, name: names.filter((x) => x.game_id === row.id) })));
  }, [org]);

  useEffect(() => {
    void load();
  }, [load]);

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !org) return;
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      const parsed = parseGameFile(await file.text());
      if (!parsed.ok) {
        setErrors(parsed.errors);
        return;
      }
      if (games?.some((g) => g.slug === parsed.slug || parsed.bundle.variants.some((v) => v.id === g.slug))) {
        setErrors([`Er bestaat al een spel met de naam ${parsed.slug} of een van de varianten. Pas het id in het bestand aan.`]);
        return;
      }
      const baseId = await importBundle(supabase(), org.id, parsed.bundle);
      const n = parsed.bundle.variants.length;
      const photos = await copyExternalImages(supabase(), baseId);
      setNotice(
        `${parsed.slug} geïmporteerd${n > 0 ? `, met ${n} variant${n === 1 ? '' : 'en'}` : ''}.` +
          (photos.copied ? ` ${photos.copied} foto${photos.copied === 1 ? '' : "'s"} naar de eigen opslag gekopieerd.` : '') +
          ' Publiceer het spel om er hunts mee te maken.',
      );
      if (photos.failed.length) {
        setErrors([`Deze foto's konden niet worden gekopieerd en wijzen nog naar de oude site:`, ...photos.failed]);
      }
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>Spellen</h1>
      <p className="muted">
        Een basisspel bevat de opdrachten en regels. Een stad vult locaties en lokale vragen in, een klant alleen de
        velden die het basisspel als aanpasbaar markeert. Publiceren maakt een vaste versie waarmee je hunts maakt.
      </p>
      <div className="actions">
        <label className={`filebutton${busy ? ' disabled' : ''}`}>
          <input type="file" accept="application/json,.json" onChange={importFile} disabled={busy} />
          {busy ? 'Bezig…' : 'Spel importeren (JSON)'}
        </label>
      </div>
      {notice ? <p className="notice">{notice}</p> : null}
      {errors.length > 0 ? (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}

      <h2>Overzicht</h2>
      {games === null ? (
        <p className="muted">Laden…</p>
      ) : games.length === 0 ? (
        <p className="muted">Nog geen spellen.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Spel</th>
                <th>Soort</th>
                <th>Talen</th>
                <th>Gepubliceerd</th>
              </tr>
            </thead>
            <tbody>
              {tree(games).map(({ game: g, depth }) => {
                const latest = [...g.game_versions].sort((a, b) => b.version - a.version)[0];
                return (
                  <tr key={g.id}>
                    <td style={{ paddingLeft: 12 + depth * 24 }}>
                      <Link href={`/spellen/${g.id}`}>
                        <strong>{gameTitle(g)}</strong>
                      </Link>
                      <div className="muted">{g.slug}</div>
                    </td>
                    <td>{LAYER_LABEL[g.layer]}</td>
                    <td>{g.languages.join(', ').toUpperCase()}</td>
                    <td>
                      {latest
                        ? `v${latest.version} · ${new Date(latest.published_at).toLocaleDateString('nl-NL')}`
                        : 'Nog niet'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
