'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { parseGameFile } from '@/lib/game-import';
import { copyExternalImages, importBundle, loadBaseVersions, setBaseVersionNote, type BaseVersion } from '@/lib/game-store';
import { useLanguage } from '@/lib/language';
import { supabase } from '@/lib/supabase';

/** De standaardtemplate die met de beheerapp meekomt. */
const BUILT_IN = {
  slug: 'escape-game-the-hunt',
  note: 'Escape Game The Hunt Template v1: speluitleg, zes puzzels, fotomissie, twee stadsvragen (in te vullen per stad) en drie extractiepunten.',
};

interface Template {
  id: string;
  slug: string;
  name: string;
  versions: BaseVersion[];
  cities: number;
}

/** Templates: de basisspellen met hun vaste versies, en vanaf hier steden uitrollen. */
export default function TemplatesPage() {
  const { org } = useAuth();
  const { t, lang, locale } = useLanguage();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!org) return;
    const db = supabase();
    const [g, n] = await Promise.all([
      db.from('games').select('id, slug, layer, parent_id, default_language').eq('org_id', org.id),
      db.from('translations').select('game_id, text, lang').eq('entity', 'game').eq('entity_id', '').eq('field', 'name'),
    ]);
    if (g.error || n.error) {
      setErrors([(g.error ?? n.error)!.message]);
      return;
    }
    const games = g.data as { id: string; slug: string; layer: string; parent_id: string | null; default_language: string }[];
    const names = n.data as { game_id: string; text: string; lang: string }[];
    const bases = games.filter((x) => x.layer === 'base').sort((a, b) => a.slug.localeCompare(b.slug));
    const list = await Promise.all(
      bases.map(async (b) => {
        const own = names.filter((x) => x.game_id === b.id);
        const name = (own.find((x) => x.lang === lang) ?? own.find((x) => x.lang === b.default_language) ?? own[0])?.text ?? b.slug;
        return {
          id: b.id,
          slug: b.slug,
          name,
          versions: await loadBaseVersions(db, b.id),
          cities: games.filter((x) => x.parent_id === b.id && x.layer === 'city').length,
        };
      }),
    );
    setTemplates(list);
  }, [org, lang]);

  useEffect(() => {
    void load().catch((err) => setErrors([err instanceof Error ? err.message : String(err)]));
  }, [load]);

  const loadBuiltIn = async () => {
    if (!org) return;
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      const file = (await import('@/templates/escape-game-the-hunt-v1.json')).default;
      const parsed = parseGameFile(JSON.stringify(file));
      if (!parsed.ok) {
        setErrors(parsed.errors);
        return;
      }
      const db = supabase();
      const baseId = await importBundle(db, org.id, parsed.bundle);
      await setBaseVersionNote(db, baseId, 1, BUILT_IN.note);
      const photos = await copyExternalImages(db, baseId);
      setNotice(t('Escape Game The Hunt Template v1 staat klaar. Je kunt er nu steden mee uitrollen.'));
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

  const hasBuiltIn = templates?.some((x) => x.slug === BUILT_IN.slug) ?? true;

  return (
    <>
      <h1>{t('Templates')}</h1>
      <p className="muted">
        {t('Een template is het basisspel waarmee je een nieuwe stad uitrolt. Elke template heeft vaste versies (v1, v2, ...); een stad bouwt voort op één versie.')}
      </p>
      {notice ? <p className="notice">{notice}</p> : null}
      {errors.length > 0 ? (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}

      {templates === null ? (
        <p className="muted">{t('Laden…')}</p>
      ) : (
        <>
          {!hasBuiltIn ? (
            <section className="card" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Escape Game The Hunt Template v1</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                {t('De standaardtemplate met de speluitleg, zes puzzels, fotomissie, stadsvragen en extractiepunten. Laad hem in om er steden mee uit te rollen.')}
              </p>
              <button type="button" onClick={() => void loadBuiltIn()} disabled={busy}>
                {busy ? t('Bezig…') : t('Template v1 inladen')}
              </button>
            </section>
          ) : null}

          {templates.length === 0 ? null : (
            <div className="versions">
              {templates.map((tp) => (
                <section key={tp.id} className="card">
                  <h2 style={{ marginTop: 0 }}>{tp.name}</h2>
                  <p className="muted" style={{ marginTop: 0 }}>
                    {tp.cities === 1 ? t('1 stad') : t('{n} steden', { n: tp.cities })}
                  </p>
                  {tp.versions.length === 0 ? (
                    <p className="muted">{t('Nog geen templates.')}</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <tbody>
                          {tp.versions.map((v) => (
                            <tr key={v.version}>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <strong>{t('Template v{n}', { n: v.version })}</strong>
                                <div className="muted">{new Date(v.created_at).toLocaleDateString(locale)}</div>
                              </td>
                              <td style={{ whiteSpace: 'pre-wrap' }}>{v.note ?? <span className="muted">–</span>}</td>
                              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                                <Link href={`/spellen/nieuw?basis=${tp.id}&versie=${v.version}`} className="filebutton">
                                  {t('Nieuwe stad uitrollen')}
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="actions" style={{ marginTop: 12 }}>
                    <Link href={`/spellen/${tp.id}#versies`}>{t('Template bewerken of nieuwe versie maken')}</Link>
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
