'use client';
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { parseGamePackage } from '@/lib/game-import';
import { supabase } from '@/lib/supabase';
import { tx } from '@/lib/text';

interface GameRow {
  id: string;
  slug: string;
  layer: 'base' | 'city' | 'client';
  languages: string[];
  game_versions: { id: string; version: number; published_at: string; name: unknown }[];
}

const LAYER: Record<GameRow['layer'], string> = { base: 'Basisspel', city: 'Stad', client: 'Klant' };

export default function GamesPage() {
  const { org } = useAuth();
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!org) return;
    const { data, error } = await supabase()
      .from('games')
      .select('id, slug, layer, languages, game_versions(id, version, published_at, name:package->name)')
      .eq('org_id', org.id)
      .order('slug');
    if (error) setErrors([error.message]);
    else setGames(data as unknown as GameRow[]);
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
      const parsed = parseGamePackage(await file.text());
      if (!parsed.ok) {
        setErrors(parsed.errors);
        return;
      }
      const db = supabase();
      let gameId = games?.find((g) => g.slug === parsed.slug)?.id;
      if (!gameId) {
        const { data, error } = await db
          .from('games')
          .insert({
            org_id: org.id,
            layer: 'base',
            slug: parsed.slug,
            languages: parsed.game.languages,
            default_language: parsed.game.defaultLanguage,
            settings: { imported: true },
          })
          .select('id')
          .single();
        if (error) throw error;
        gameId = data.id as string;
      }
      const { data: version, error } = await db.rpc('publish_game_version', { p_game: gameId, p_package: parsed.game });
      if (error) throw error;
      setNotice(`${parsed.slug} gepubliceerd als versie ${(version as { version: number }).version}.`);
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String((err as { message?: string }).message ?? err)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>Spellen</h1>
      <p className="muted">
        De editor voor opdrachten, steden en klantvarianten volgt. Tot die tijd kun je een spelpakket (JSON) importeren.
        Bestaat het spel al, dan wordt het een nieuwe versie; lopende sessies blijven op hun eigen versie.
      </p>
      <div className="actions">
        <label className={`filebutton${busy ? ' disabled' : ''}`}>
          <input type="file" accept="application/json,.json" onChange={importFile} disabled={busy} />
          {busy ? 'Bezig…' : 'Spelpakket importeren'}
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
                <th>Laatste versie</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => {
                const latest = [...g.game_versions].sort((a, b) => b.version - a.version)[0];
                return (
                  <tr key={g.id}>
                    <td>
                      <strong>{latest ? tx(latest.name) : g.slug}</strong>
                      <div className="muted">{g.slug}</div>
                    </td>
                    <td>{LAYER[g.layer]}</td>
                    <td>{g.languages.join(', ').toUpperCase()}</td>
                    <td>
                      {latest
                        ? `v${latest.version} · ${new Date(latest.published_at).toLocaleDateString('nl-NL')}`
                        : 'Niet gepubliceerd'}
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
