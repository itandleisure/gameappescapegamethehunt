'use client';
import { gameLanguageTag } from '@/lib/game-languages';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { openTodos } from '@/lib/city-rollout';
import { currentLanguage, tKey } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';
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

/** Zet de spellen in boomvolgorde: basisspel (template), dan zijn steden, dan hun klanten. */
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

export default function GamesPage() {
  const { org } = useAuth();
  const { t, locale } = useLanguage();
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

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

  return (
    <>
      <h1>{t('Spellen')}</h1>
      <p className="muted">
        {t('Hier staan de spellen per stad en klant. Een nieuwe stad maak je vanuit een template (onder Templates). Publiceren maakt een vaste versie waarmee je events maakt.')}
      </p>
      <div className="actions">
        <Link href="/templates" className="filebutton">
          {t('Nieuwe stad uitrollen')}
        </Link>
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
      ) : games.every((g) => g.layer === 'base') ? (
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
              {tree(games)
                .filter(({ game }) => game.layer !== 'base')
                .map(({ game, depth }) => ({ game, depth: game.parent_id && games.some((b) => b.id === game.parent_id && b.layer === 'base') ? 0 : Math.max(0, depth - 1) }))
                .map(({ game: g, depth }) => {
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
                      {g.layer === 'city' ? (
                        <div className="muted">
                          {(() => {
                            const base = games.find((b) => b.id === g.parent_id);
                            const name = base ? gameTitle(base) : '';
                            return g.base_version === null
                              ? t('{template}: werkversie', { template: name })
                              : t('{template} v{n}', { template: name, n: g.base_version });
                          })()}
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
                    <td>{g.languages.map(gameLanguageTag).join(' ')}</td>
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
