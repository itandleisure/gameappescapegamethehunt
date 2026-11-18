'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { openTodos } from '@/lib/city-rollout';
import { currentLanguage, tKey } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';
import { parseGameFile } from '@/lib/game-import';
import { copyExternalImages, importBundle } from '@/lib/game-store';
import { supabase } from '@/lib/supabase';
import { tx } from '@/lib/text';

interface GameRow {
  id: string;
  slug: string;
  parent_id: string | null;
  layer: 'base' | 'city' | 'client';
  base_version: number | null;
  languages: string[];
  settings: { name?: unknown; todo?: unknown };
  game_versions: { version: number; published_at: string }[];
  name: { text: string; lang: string }[];
}

const LAYER_LABEL: Record<GameRow['layer'], string> = { base: tKey('Basisspel'), city: tKey('Stad'), client: tKey('Klant') };

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
  const own = g.name?.find((n) => n.lang === currentLanguage()) ?? g.name?.find((n) => n.lang === 'nl') ?? g.name?.[0];
  if (g.layer === 'base' && own) return own.text;
  return tx(g.settings.name) || g.slug;
}

/** Per versie van het basisspel hoeveel steden erop zitten, bijvoorbeeld "v1: 3 steden · v2: 1 stad". */
function versionSummary(games: GameRow[], baseId: string, t: (nl: string, vars?: Record<string, string | number>) => string): string {
  const counts = new Map<number | null, number>();
  for (const c of games) if (c.parent_id === baseId && c.layer === 'city') counts.set(c.base_version, (counts.get(c.base_version) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => (a ?? Infinity) - (b ?? Infinity))
    .map(([version, n]) =>
      (version === null ? t('werkversie') : t('versie {n}', { n: version })) + ': ' + (n === 1 ? t('1 stad') : t('{n} steden', { n })),
    )
    .join(' · ');
}

export default function GamesPage() {
  const { org } = useAuth();
  const { t, locale } = useLanguage();
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
        .select('id, slug, parent_id, layer, base_version, languages, settings, game_versions(version, published_at)')
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
        setErrors([t('Er bestaat al een spel met de naam {name} of een van de varianten. Pas het id in het bestand aan.', { name: parsed.slug })]);
        return;
      }
      const baseId = await importBundle(supabase(), org.id, parsed.bundle);
      const n = parsed.bundle.variants.length;
      const photos = await copyExternalImages(supabase(), baseId);
      setNotice(
        (n === 0
          ? t('{name} geïmporteerd.', { name: parsed.slug })
          : n === 1
            ? t('{name} geïmporteerd, met 1 variant.', { name: parsed.slug })
            : t('{name} geïmporteerd, met {n} varianten.', { name: parsed.slug, n })) +
          (photos.copied
            ? ' ' +
              (photos.copied === 1
                ? t('1 foto naar de eigen opslag gekopieerd.')
                : t("{n} foto's naar de eigen opslag gekopieerd.", { n: photos.copied }))
            : '') +
          ' ' +
          t('Publiceer het spel om er hunts mee te maken.'),
      );
      if (photos.failed.length) {
        setErrors([t("Deze foto's konden niet worden gekopieerd en wijzen nog naar de oude site:"), ...photos.failed]);
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
      <h1>{t('Spellen')}</h1>
      <p className="muted">
        {t('Een basisspel bevat de opdrachten en regels. Een stad vult locaties en lokale vragen in, een klant alleen de velden die het basisspel als aanpasbaar markeert. Publiceren maakt een vaste versie waarmee je hunts maakt.')}
      </p>
      <div className="actions">
        {games?.some((g) => g.layer === 'base') ? (
          <Link href="/spellen/nieuw" className="filebutton">
            {t('Nieuwe stad uitrollen')}
          </Link>
        ) : null}
        <label className={`filebutton${busy ? ' disabled' : ''}`}>
          <input type="file" accept="application/json,.json" onChange={importFile} disabled={busy} />
          {busy ? t('Bezig…') : t('Spel importeren (JSON)')}
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

      <h2>{t('Overzicht')}</h2>
      {games === null ? (
        <p className="muted">{t('Laden…')}</p>
      ) : games.length === 0 ? (
        <p className="muted">{t('Nog geen spellen.')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Spel')}</th>
                <th>{t('Soort')}</th>
                <th>{t('Talen')}</th>
                <th>{t('Gepubliceerd')}</th>
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
                    <td>
                      {t(LAYER_LABEL[g.layer])}
                      {g.layer === 'base' && games.some((c) => c.parent_id === g.id && c.layer === 'city') ? (
                        <div className="muted">{versionSummary(games, g.id, t)}</div>
                      ) : null}
                      {g.layer === 'city' ? (
                        <div className="muted">
                          {g.base_version === null
                            ? t('basisspel: werkversie')
                            : t('basisspel: versie {n}', { n: g.base_version })}
                        </div>
                      ) : null}
                      {(() => {
                        const open = g.layer === 'city' ? openTodos(g.settings) : null;
                        if (!open) return null;
                        return (
                          <div>
                            <span className="badge test">{open === 1 ? t('nog 1 punt te doen') : t('nog {n} punten te doen', { n: open })}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td>{g.languages.join(', ').toUpperCase()}</td>
                    <td>
                      {latest
                        ? `v${latest.version} · ${new Date(latest.published_at).toLocaleDateString(locale)}`
                        : t('Nog niet')}
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
