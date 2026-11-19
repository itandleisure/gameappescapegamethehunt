'use client';
/**
 * Templateversies van een basisspel: per versie bekijken wat erin zit
 * (omschrijving, opdrachten, regels, steden) en een nieuwe template maken
 * van de werkversie, die dan het volgende versienummer krijgt.
 */
import { gameLanguageList } from '@/lib/game-languages';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { LayerRows } from '@/lib/game-model';
import { createBaseVersion, loadBaseVersionSnapshot, setBaseVersionNote, type BaseVersion } from '@/lib/game-store';
import { versionContents, type VersionContents } from '@/lib/template-contents';
import { useLanguage } from '@/lib/language';
import { supabase } from '@/lib/supabase';

interface City {
  id: string;
  slug: string;
  layer: 'city' | 'client';
  base_version: number | null;
}

interface Props {
  baseId: string;
  versions: BaseVersion[];
  cities: City[];
  /** Na een wijziging: opnieuw laden en een melding tonen. */
  onChanged: (notice: string) => Promise<void>;
  onError: (message: string) => void;
}

export function TemplateVersions({ baseId, versions, cities, onChanged, onError }: Props) {
  const { t, locale } = useLanguage();
  const [open, setOpen] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<Record<number, LayerRows>>({});
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const next = (versions[0]?.version ?? 0) + 1;

  const toggle = async (version: number) => {
    setNoteDraft(null);
    if (open === version) {
      setOpen(null);
      return;
    }
    setOpen(version);
    if (snapshots[version]) return;
    try {
      const db = supabase();
      const [own, previous] = await Promise.all([
        loadBaseVersionSnapshot(db, baseId, version),
        version > 1 && !snapshots[version - 1] ? loadBaseVersionSnapshot(db, baseId, version - 1).catch(() => null) : null,
      ]);
      setSnapshots((s) => ({ ...s, [version]: own, ...(previous ? { [version - 1]: previous } : {}) }));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    try {
      await onChanged(await work());
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveNote = (e: FormEvent, version: number) => {
    e.preventDefault();
    void run(async () => {
      await setBaseVersionNote(supabase(), baseId, version, noteDraft ?? '');
      setNoteDraft(null);
      return t('Omschrijving van versie {n} opgeslagen.', { n: version });
    });
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const n = await createBaseVersion(supabase(), baseId, newNote);
      setNewNote('');
      setCreating(false);
      setOpen(n);
      return t('Template versie {n} gemaakt. Steden blijven op hun huidige versie tot je ze zelf overzet.', { n });
    });
  };

  const citiesOn = (version: number) => cities.filter((c) => c.layer === 'city' && c.base_version === version);
  const working = cities.filter((c) => c.layer === 'city' && c.base_version === null);

  return (
    <section className="card" id="versies" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>{t('Templateversies')}</h2>
      <p className="muted">
        {t('Een template is een vaste versie van dit basisspel. Nieuwe steden rol je uit vanaf een template. Wat je hieronder in de opdrachten aanpast, komt pas in een template als je een nieuwe template maakt.')}
      </p>

      {versions.length === 0 ? <p className="muted">{t('Nog geen templates.')}</p> : null}
      <div className="versions">
        {versions.map((v, i) => {
          const used = citiesOn(v.version);
          const isOpen = open === v.version;
          const snapshot = snapshots[v.version];
          const contents: VersionContents | null = snapshot ? versionContents(snapshot, snapshots[v.version - 1] ?? null) : null;
          return (
            <div key={v.version} className={`version${isOpen ? ' open' : ''}`}>
              <button type="button" className="version-head" onClick={() => void toggle(v.version)} aria-expanded={isOpen}>
                <span className="version-title">
                  {t('Template versie {n}', { n: v.version })}
                  {i === 0 ? <span className="badge open" style={{ marginLeft: 8 }}>{t('nieuwste')}</span> : null}
                </span>
                <span className="muted">
                  {new Date(v.created_at).toLocaleDateString(locale)} · {used.length === 1 ? t('1 stad') : t('{n} steden', { n: used.length })}
                </span>
                <span className="version-summary">{v.note ? v.note.split('\n')[0] : <em className="muted">{t('Nog geen omschrijving bij deze versie.')}</em>}</span>
                <span className="version-chevron" aria-hidden>
                  {isOpen ? '▾' : '▸'}
                </span>
              </button>

              {isOpen ? (
                <div className="version-body">
                  <h3>{t('Omschrijving (alleen voor ons team)')}</h3>
                  {noteDraft !== null ? (
                    <form onSubmit={(e) => saveNote(e, v.version)}>
                      <textarea value={noteDraft} maxLength={2000} rows={5} autoFocus onChange={(e) => setNoteDraft(e.target.value)} />
                      <div className="actions">
                        <button type="submit" disabled={busy}>
                          {busy ? t('Bezig…') : t('Opslaan')}
                        </button>
                        <button type="button" className="secondary" onClick={() => setNoteDraft(null)} disabled={busy}>
                          {t('Annuleren')}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {v.note ? <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{v.note}</p> : null}
                      <button type="button" className="link small" onClick={() => setNoteDraft(v.note ?? '')}>
                        {v.note ? t('Aanpassen') : t('Omschrijving toevoegen')}
                      </button>
                    </>
                  )}

                  {!contents ? (
                    <p className="muted">{t('Laden…')}</p>
                  ) : (
                    <>
                      <h3>{t('Wat zit erin')}</h3>
                      <p className="muted" style={{ marginTop: 0 }}>
                        {t('{tasks} opdrachten · {rules} regels · {locations} locaties op de kaart · talen {languages}', {
                          tasks: contents.tasks.length,
                          rules: contents.rules,
                          locations: contents.locations,
                          languages: gameLanguageList(contents.languages),
                        })}
                      </p>
                      {contents.compared ? (
                        <p style={{ marginTop: 0 }}>
                          {contents.added.length === 0 && contents.removed.length === 0 && contents.changed.length === 0
                            ? t('Zelfde opdrachten als versie {n}.', { n: v.version - 1 })
                            : [
                                contents.added.length ? t('{n} nieuw', { n: contents.added.length }) : null,
                                contents.changed.length ? t('{n} aangepast', { n: contents.changed.length }) : null,
                                contents.removed.length ? t('{n} weggehaald', { n: contents.removed.length }) : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') +
                              ' ' +
                              t('ten opzichte van versie {n}', { n: v.version - 1 })}
                          {contents.removed.length ? (
                            <span className="muted"> ({t('weggehaald')}: {contents.removed.join(', ')})</span>
                          ) : null}
                        </p>
                      ) : null}
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>{t('Opdracht')}</th>
                              <th>{t('Soort')}</th>
                              <th>{t('Punten')}</th>
                              <th>{t('Stad past aan')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contents.tasks.map((tk) => (
                              <tr key={tk.key}>
                                <td>
                                  <strong>{tk.title}</strong>
                                  {tk.status === 'new' ? (
                                    <span className="badge open" style={{ marginLeft: 8 }}>
                                      {t('nieuw')}
                                    </span>
                                  ) : tk.status === 'changed' ? (
                                    <span className="badge test" style={{ marginLeft: 8 }}>
                                      {t('aangepast')}
                                    </span>
                                  ) : null}
                                  <div className="muted">{tk.key}</div>
                                </td>
                                <td>{t(tk.type)}</td>
                                <td>{tk.points}</td>
                                <td className="muted">{tk.cityFields.join(', ') || '–'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  <h3>{t('Steden op deze versie')}</h3>
                  {used.length ? (
                    <p style={{ marginTop: 0 }}>
                      {used.map((c, j) => (
                        <span key={c.id}>
                          {j > 0 ? ', ' : ''}
                          <Link href={`/spellen/${c.id}`}>{c.slug}</Link>
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p className="muted" style={{ marginTop: 0 }}>
                      {t('Nog geen.')}{' '}
                      <Link href={`/spellen/nieuw?basis=${baseId}&versie=${v.version}`}>{t('Nieuwe stad uitrollen')}</Link>
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {working.length ? (
        <p className="muted">
          {t('Op de werkversie (voor testen):')}{' '}
          {working.map((c, j) => (
            <span key={c.id}>
              {j > 0 ? ', ' : ''}
              <Link href={`/spellen/${c.id}`}>{c.slug}</Link>
            </span>
          ))}
        </p>
      ) : null}

      {creating ? (
        <form className="version-new" onSubmit={create}>
          <h3 style={{ marginTop: 0 }}>{t('Nieuwe template maken: versie {n}', { n: next })}</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            {t('Legt het basisspel zoals het nu is vast als template versie {n}. Bestaande steden blijven op hun eigen versie; nieuwe steden kunnen versie {n} kiezen.', { n: next })}
          </p>
          <label htmlFor="new-version-note">{t('Wat zit erin, of wat is er anders?')}</label>
          <textarea
            id="new-version-note"
            value={newNote}
            maxLength={2000}
            rows={4}
            autoFocus
            onChange={(e) => setNewNote(e.target.value)}
            placeholder={t('Bijvoorbeeld: nieuwe puzzel bij het extractiepunt')}
          />
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? t('Bezig…') : t('Template versie {n} maken', { n: next })}
            </button>
            <button type="button" className="secondary" onClick={() => setCreating(false)} disabled={busy}>
              {t('Annuleren')}
            </button>
          </div>
        </form>
      ) : (
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" onClick={() => setCreating(true)}>
            {t('Nieuwe template maken (versie {n})', { n: next })}
          </button>
        </div>
      )}
    </section>
  );
}
