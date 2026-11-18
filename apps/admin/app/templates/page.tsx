'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { parseGameFile } from '@/lib/game-import';
import {
  copyExternalImages,
  createBaseVersion,
  deleteBaseVersion,
  importBundle,
  loadBaseVersions,
  setBaseVersionNote,
  type BaseVersion,
} from '@/lib/game-store';
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
  /** Aantal steden per versie. */
  perVersion: Record<number, number>;
}

/** Templates: de basisspellen met hun vaste versies, en vanaf hier steden uitrollen. */
export default function TemplatesPage() {
  const { org } = useAuth();
  const { t, lang, locale } = useLanguage();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Formulier voor een nieuwe versie: bij welke template, met welke omschrijving. */
  const [creating, setCreating] = useState<{ id: string; note: string } | null>(null);
  /** Versie die op bevestiging wacht om te verwijderen. */
  const [removing, setRemoving] = useState<{ id: string; version: number } | null>(null);

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      setNotice(await work());
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const createVersion = (e: FormEvent) => {
    e.preventDefault();
    if (!creating) return;
    void run(async () => {
      const n = await createBaseVersion(supabase(), creating.id, creating.note);
      setCreating(null);
      return t('Template v{n} gemaakt: een volledige kopie van de template zoals die nu is.', { n });
    });
  };

  const removeVersion = (id: string, version: number) =>
    void run(async () => {
      await deleteBaseVersion(supabase(), id, version);
      setRemoving(null);
      return t('Template v{n} verwijderd.', { n: version });
    });

  const load = useCallback(async () => {
    if (!org) return;
    const db = supabase();
    const [g, n] = await Promise.all([
      db.from('games').select('id, slug, layer, parent_id, default_language, base_version').eq('org_id', org.id),
      db.from('translations').select('game_id, text, lang').eq('entity', 'game').eq('entity_id', '').eq('field', 'name'),
    ]);
    if (g.error || n.error) {
      setErrors([(g.error ?? n.error)!.message]);
      return;
    }
    const games = g.data as {
      id: string;
      slug: string;
      layer: string;
      parent_id: string | null;
      default_language: string;
      base_version: number | null;
    }[];
    const names = n.data as { game_id: string; text: string; lang: string }[];
    const bases = games.filter((x) => x.layer === 'base').sort((a, b) => a.slug.localeCompare(b.slug));
    const list = await Promise.all(
      bases.map(async (b) => {
        const own = names.filter((x) => x.game_id === b.id);
        const perVersion: Record<number, number> = {};
        for (const c of games) {
          if (c.parent_id === b.id && c.layer === 'city' && c.base_version != null) {
            perVersion[c.base_version] = (perVersion[c.base_version] ?? 0) + 1;
          }
        }
        const name = (own.find((x) => x.lang === lang) ?? own.find((x) => x.lang === b.default_language) ?? own[0])?.text ?? b.slug;
        return {
          id: b.id,
          slug: b.slug,
          name,
          versions: await loadBaseVersions(db, b.id),
          cities: games.filter((x) => x.parent_id === b.id && x.layer === 'city').length,
          perVersion,
        };
      }),
    );
    setTemplates(list);
  }, [org, lang]);

  useEffect(() => {
    void load().catch((err) => setErrors([err instanceof Error ? err.message : String(err)]));
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
      const taken = await supabase().from('games').select('slug').eq('org_id', org.id);
      if ((taken.data ?? []).some((g: { slug: string }) => g.slug === parsed.slug || parsed.bundle.variants.some((v) => v.id === g.slug))) {
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
          t('Je kunt er nu steden mee uitrollen.'),
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
      <div className="actions">
        <label className={`filebutton${busy ? ' disabled' : ''}`}>
          <input type="file" accept="application/json,.json" onChange={importFile} disabled={busy} />
          {busy ? t('Bezig…') : t('Template importeren (JSON)')}
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
                              <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                                {(tp.perVersion[v.version] ?? 0) === 1
                                  ? t('1 stad')
                                  : t('{n} steden', { n: tp.perVersion[v.version] ?? 0 })}
                              </td>
                              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                                <div className="actions" style={{ justifyContent: 'flex-end', margin: 0 }}>
                                  <Link href={`/spellen/nieuw?basis=${tp.id}&versie=${v.version}`} className="filebutton">
                                    {t('Nieuwe stad uitrollen')}
                                  </Link>
                                  {removing?.id === tp.id && removing.version === v.version ? (
                                    <>
                                      <button type="button" className="danger" onClick={() => removeVersion(tp.id, v.version)} disabled={busy}>
                                        {busy ? t('Bezig…') : t('Ja, verwijderen')}
                                      </button>
                                      <button type="button" className="secondary" onClick={() => setRemoving(null)} disabled={busy}>
                                        {t('Annuleren')}
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      className="secondary"
                                      disabled={busy || (tp.perVersion[v.version] ?? 0) > 0 || tp.versions.length === 1}
                                      title={
                                        (tp.perVersion[v.version] ?? 0) > 0
                                          ? t('Er staan nog steden op versie {n}. Zet die eerst over naar een andere versie.', { n: v.version })
                                          : tp.versions.length === 1
                                            ? t('De enige versie van een template kan niet weg.')
                                            : undefined
                                      }
                                      onClick={() => setRemoving({ id: tp.id, version: v.version })}
                                    >
                                      {t('Verwijderen')}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {creating?.id === tp.id ? (
                    <form className="version-new" onSubmit={createVersion}>
                      <h3 style={{ marginTop: 0 }}>
                        {t('Nieuwe templateversie: v{n}', { n: (tp.versions[0]?.version ?? 0) + 1 })}
                      </h3>
                      <p className="muted" style={{ marginTop: 0 }}>
                        {t('Maakt een volledige, op zichzelf staande kopie van de template zoals die nu is. Bestaande steden blijven op hun versie; een oude versie zonder steden kun je daarna verwijderen.')}
                      </p>
                      <label htmlFor={`note-${tp.id}`}>{t('Wat zit erin, of wat is er anders?')}</label>
                      <textarea
                        id={`note-${tp.id}`}
                        value={creating.note}
                        maxLength={2000}
                        rows={3}
                        autoFocus
                        onChange={(e) => setCreating({ ...creating, note: e.target.value })}
                      />
                      <div className="actions">
                        <button type="submit" disabled={busy}>
                          {busy ? t('Bezig…') : t('Template v{n} maken', { n: (tp.versions[0]?.version ?? 0) + 1 })}
                        </button>
                        <button type="button" className="secondary" onClick={() => setCreating(null)} disabled={busy}>
                          {t('Annuleren')}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="actions" style={{ marginTop: 12 }}>
                      <button type="button" onClick={() => setCreating({ id: tp.id, note: '' })} disabled={busy}>
                        {t('Maak nieuwe templateversie (v{n})', { n: (tp.versions[0]?.version ?? 0) + 1 })}
                      </button>
                      <Link href={`/spellen/${tp.id}#versies`}>{t('Template bewerken')}</Link>
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
