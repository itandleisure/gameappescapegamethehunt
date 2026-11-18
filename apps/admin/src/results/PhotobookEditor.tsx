'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ADMIN_LANGUAGES, ADMIN_LANGUAGE_NAMES, isAdminLanguage, LOCALES, type AdminLanguage } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';
import {
  defaultItems,
  gameCaption,
  mailBody,
  moveItem,
  paginate,
  pdfFileName,
  TEAM_PHOTO_KEY,
  unusedGamePhotos,
  type BookItem,
  type Photobook,
} from '@/lib/photobook';
import { buildPhotobookPdf } from '@/lib/photobook-pdf';
import {
  deleteOwnPhoto,
  listOwnPhotos,
  loadPhotobook,
  rotateToken,
  savePhotobook,
  setShared,
  shareLink,
  signItems,
  signPdf,
  uploadOwnPhoto,
  uploadPdf,
} from '@/lib/photobook-store';
import { formatDuration, type SessionResultsView } from '@/lib/results';
import type { SessionLive } from '@/lib/session-live';
import { tx } from '@/lib/text';

type Draft = Pick<Photobook, 'title' | 'intro' | 'items' | 'show_ranking' | 'language'>;

/**
 * Fotoboek voor de klant: spelfoto's en eigen foto's kiezen en ordenen, een
 * PDF in Escape Game The Hunt-stijl maken en die via een link delen.
 */
export function PhotobookEditor({ data, view }: { data: SessionLive; view: SessionResultsView }) {
  const { t, lang, locale } = useLanguage();
  const { session } = data;
  const [saved, setSaved] = useState<Photobook | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [ownFiles, setOwnFiles] = useState<string[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const teamName = useCallback((id: string) => data.teams.find((x) => x.id === id)?.name ?? t('Onbekend team'), [data.teams, t]);
  const caption = useCallback(
    (p: { team_id: string; task_key: string }) =>
      gameCaption(p, teamName(p.team_id), p.task_key === TEAM_PHOTO_KEY ? '' : tx(data.game.tasks.find((x) => x.id === p.task_key)?.title)),
    [data.game.tasks, teamName],
  );

  // Laden: bestaand fotoboek, of een eerste opzet met alle spelfoto's.
  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const [book, own] = await Promise.all([loadPhotobook(session.id), listOwnPhotos(session.id).catch(() => [])]);
        if (stop) return;
        setSaved(book);
        setOwnFiles(own);
        setDraft(
          book ?? {
            title: session.name,
            intro: '',
            items: defaultItems(data.photos, view.teams.map((x) => x.id), caption),
            show_ranking: true,
            language: lang,
          },
        );
        setDirty(!book);
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      stop = true;
    };
    // Alleen bij het openen van de sessie; latere foto's verschijnen bij "Niet in het fotoboek".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const items = draft?.items ?? [];
  const unusedGame = useMemo(() => unusedGamePhotos(items, data.photos), [items, data.photos]);
  const unusedOwn = useMemo(() => {
    const used = new Set(items.filter((i) => i.source === 'own').map((i) => i.path));
    return ownFiles.filter((p) => !used.has(p));
  }, [items, ownFiles]);

  // Voorbeeldfoto's: tijdelijke links ophalen voor wat nog geen link heeft.
  const wanted = [
    ...items,
    ...unusedGame.map((p) => ({ source: 'game' as const, path: p.path })),
    ...unusedOwn.map((path) => ({ source: 'own' as const, path })),
  ].filter((i) => !urls.has(i.path));
  const wantedKey = wanted.map((i) => `${i.source}:${i.path}`).join('|');
  useEffect(() => {
    if (!wantedKey) return;
    const list = wantedKey.split('|').map((k) => {
      const [source, ...rest] = k.split(':');
      return { source: source as BookItem['source'], path: rest.join(':') };
    });
    void signItems(list)
      .then((found) => setUrls((u) => new Map([...u, ...found])))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [wantedKey]);

  useEffect(() => {
    if (!saved?.pdf_path) return setPdfUrl(null);
    void signPdf(saved.pdf_path).then(setPdfUrl);
  }, [saved?.pdf_path, saved?.pdf_made_at]);

  if (error && !draft) return <p className="error">{error}</p>;
  if (!draft) return <p className="muted">{t('Laden…')}</p>;

  const change = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
    setNotice(null);
  };
  const setItems = (next: BookItem[]) => change({ items: next });
  const updateItem = (index: number, patch: Partial<BookItem>) =>
    setItems(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const save = async (extra: Partial<Photobook> = {}) => {
    const book = await savePhotobook({ session_id: session.id, ...draft, ...extra });
    setSaved(book);
    setDirty(false);
    return book;
  };

  const addOwn = (files: FileList | null) =>
    void run(t('Foto\'s uploaden…'), async () => {
      const list = [...(files ?? [])];
      const added: BookItem[] = [];
      for (const [i, file] of list.entries()) {
        setBusy(t('Foto {n} van {total} uploaden…', { n: i + 1, total: list.length }));
        const path = await uploadOwnPhoto(session.id, file);
        added.push({ source: 'own', path, caption: '' });
      }
      setOwnFiles((f) => [...f, ...added.map((a) => a.path)]);
      setItems([...items, ...added]);
    });

  const makePdf = () =>
    void run(t('PDF maken…'), async () => {
      const signed = await signItems(items);
      const ranking = draft.show_ranking
        ? view.teams
            .filter((x) => x.durationSeconds !== null)
            .map((x) => ({ rank: x.rank, name: x.name, score: x.score, duration: formatDuration(x.durationSeconds) }))
        : [];
      const bytes = await buildPhotobookPdf({
        title: draft.title || session.name,
        subtitle: [
          session.starts_at
            ? new Intl.DateTimeFormat(LOCALES[draft.language], { dateStyle: 'long', timeZone: session.timezone }).format(new Date(session.starts_at))
            : '',
          draft.title && draft.title !== session.name ? session.name : '',
        ]
          .filter(Boolean)
          .join(' · '),
        intro: draft.intro,
        language: draft.language,
        items: items.flatMap((i) => (signed.has(i.path) ? [{ ...i, url: signed.get(i.path)! }] : [])),
        ranking,
        onProgress: (done, total) => setBusy(t('Foto {n} van {total} verwerken…', { n: done, total })),
      });
      setBusy(t('PDF opslaan…'));
      const path = await uploadPdf(session.id, bytes);
      await save({ pdf_path: path, pdf_made_at: new Date().toISOString() });
      // Meteen downloaden.
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      a.download = pdfFileName(draft.title || session.name);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setNotice(t('De PDF is gemaakt en gedownload.'));
    });

  const pages = paginate(items).length;
  const link = saved ? shareLink(saved.share_token) : '';
  const mail = saved ? mailBody(draft.language, draft.title || session.name, link) : null;
  const madeAt = saved?.pdf_made_at ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(saved.pdf_made_at)) : null;

  const thumb = (path: string, alt: string) =>
    urls.get(path) ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={urls.get(path)} alt={alt} loading="lazy" />
    ) : (
      <div className="placeholder muted">{t('Laden…')}</div>
    );

  return (
    <>
      <p className="muted">
        {t('Maak na afloop een fotoboek voor de klant: kies de foto\'s uit het spel, voeg jullie eigen foto\'s toe, zet ze in de goede volgorde en maak er een PDF van.')}
      </p>

      <div className="card">
        <div className="row">
          <div style={{ flex: '2 1 300px' }}>
            <label htmlFor="pb-title">{t('Titel')}</label>
            <input id="pb-title" value={draft.title} maxLength={200} onChange={(e) => change({ title: e.target.value })} />
          </div>
          <div>
            <label htmlFor="pb-lang">{t('Taal van het fotoboek')}</label>
            <select
              id="pb-lang"
              value={draft.language}
              onChange={(e) => isAdminLanguage(e.target.value) && change({ language: e.target.value as AdminLanguage })}
            >
              {ADMIN_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {ADMIN_LANGUAGE_NAMES[l]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor="pb-intro">{t('Tekst op de voorkant')}</label>
        <textarea
          id="pb-intro"
          rows={3}
          maxLength={4000}
          value={draft.intro}
          placeholder={t('Bijvoorbeeld: Wat een middag! Hier zijn de mooiste momenten van jullie hunt.')}
          onChange={(e) => change({ intro: e.target.value })}
        />
        <label className="check">
          <input type="checkbox" checked={draft.show_ranking} onChange={(e) => change({ show_ranking: e.target.checked })} />
          {t('Ranglijst in het fotoboek')}
        </label>
      </div>

      <div className="row" style={{ alignItems: 'center', margin: '24px 0 12px' }}>
        <h2 style={{ margin: 0, flex: '1 1 auto' }}>
          {t('In het fotoboek')} ({items.length})
        </h2>
        <div className="actions" style={{ marginTop: 0, flex: '0 0 auto' }}>
          <label className={`filebutton ${busy ? 'disabled' : ''}`}>
            {t('Eigen foto\'s toevoegen')}
            <input type="file" accept="image/*" multiple disabled={!!busy} onChange={(e) => addOwn(e.target.files)} />
          </label>
        </div>
      </div>
      <p className="muted small">
        {items.length === 0
          ? t('Nog geen foto\'s gekozen.')
          : t('Sleep de foto\'s in de goede volgorde. De eerste foto komt op de voorkant. Grote foto\'s krijgen een eigen pagina, de andere komen met maximaal vier op een pagina ({n} fotopagina\'s).', { n: pages })}
      </p>
      <div className="photowall photobook">
        {items.map((item, i) => (
          <figure
            key={item.path}
            draggable
            className={dragging === i ? 'dragging' : ''}
            onDragStart={() => setDragging(i)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging !== null) setItems(moveItem(items, dragging, i));
              setDragging(null);
            }}
          >
            <div className="pb-thumb">
              {thumb(item.path, item.caption)}
              <span className="pb-number">{i + 1}</span>
              {item.source === 'own' ? <span className="badge pb-own">{t('Eigen foto')}</span> : null}
            </div>
            <figcaption>
              <input
                value={item.caption}
                placeholder={t('Onderschrift')}
                aria-label={t('Onderschrift')}
                onChange={(e) => updateItem(i, { caption: e.target.value })}
              />
              <div className="pb-tools">
                <button className="secondary" title={t('Naar voren')} aria-label={t('Naar voren')} disabled={i === 0} onClick={() => setItems(moveItem(items, i, i - 1))}>
                  ←
                </button>
                <button
                  className="secondary"
                  title={t('Naar achteren')}
                  aria-label={t('Naar achteren')}
                  disabled={i === items.length - 1}
                  onClick={() => setItems(moveItem(items, i, i + 1))}
                >
                  →
                </button>
                <label className="check small">
                  <input type="checkbox" checked={!!item.large} onChange={(e) => updateItem(i, { large: e.target.checked || undefined })} />
                  {t('Groot')}
                </label>
                <button className="link" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                  {t('Weghalen')}
                </button>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      {unusedGame.length || unusedOwn.length ? (
        <>
          <div className="row" style={{ alignItems: 'center', margin: '24px 0 12px' }}>
            <h2 style={{ margin: 0, flex: '1 1 auto' }}>
              {t('Niet in het fotoboek')} ({unusedGame.length + unusedOwn.length})
            </h2>
            <div className="actions" style={{ marginTop: 0, flex: '0 0 auto' }}>
              <button
                className="secondary"
                onClick={() =>
                  setItems([
                    ...items,
                    ...unusedGame.map((p) => ({ source: 'game' as const, path: p.path, caption: caption(p) })),
                    ...unusedOwn.map((path) => ({ source: 'own' as const, path, caption: '' })),
                  ])
                }
              >
                {t('Alles toevoegen')}
              </button>
            </div>
          </div>
          <div className="photowall photobook unused">
            {unusedGame.map((p) => (
              <figure key={p.path}>
                <div className="pb-thumb">{thumb(p.path, caption(p))}</div>
                <figcaption>
                  <div className="small">{caption(p)}</div>
                  <div className="pb-tools">
                    <button className="secondary" onClick={() => setItems([...items, { source: 'game', path: p.path, caption: caption(p) }])}>
                      {t('Toevoegen')}
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
            {unusedOwn.map((path) => (
              <figure key={path}>
                <div className="pb-thumb">
                  {thumb(path, t('Eigen foto'))}
                  <span className="badge pb-own">{t('Eigen foto')}</span>
                </div>
                <figcaption>
                  <div className="pb-tools">
                    <button className="secondary" onClick={() => setItems([...items, { source: 'own', path, caption: '' }])}>
                      {t('Toevoegen')}
                    </button>
                    <button
                      className="link"
                      onClick={() =>
                        void run(t('Verwijderen…'), async () => {
                          await deleteOwnPhoto(path);
                          setOwnFiles((f) => f.filter((x) => x !== path));
                        })
                      }
                    >
                      {t('Verwijderen')}
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      ) : null}

      <h2>{t('Maken en delen')}</h2>
      <div className="card">
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="secondary" disabled={!!busy || !dirty} onClick={() => void run(t('Opslaan…'), async () => void (await save()))}>
            {t('Opslaan')}
          </button>
          <button disabled={!!busy || items.length === 0} onClick={makePdf}>
            {t('PDF maken')}
          </button>
          {pdfUrl && !busy ? (
            <a className="button secondary" href={pdfUrl} target="_blank" rel="noreferrer">
              {t('Laatste PDF openen')}
            </a>
          ) : null}
        </div>
        {busy ? <p className="muted">{busy}</p> : null}
        {dirty && !busy ? <p className="muted">{t('Niet opgeslagen wijzigingen')}</p> : null}
        {madeAt ? (
          <p className="muted">
            {t('PDF gemaakt op {time}.', { time: madeAt })}
            {dirty ? ` ${t('Je hebt daarna nog iets veranderd: maak de PDF opnieuw voordat je hem deelt.')}` : ''}
          </p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="notice">{notice}</p> : null}

        {saved?.pdf_path ? (
          <>
            <label className="check" style={{ marginTop: 16 }}>
              <input
                type="checkbox"
                checked={saved.shared}
                disabled={!!busy}
                onChange={(e) => {
                  const shared = e.target.checked;
                  void run(t('Opslaan…'), async () => {
                    await setShared(session.id, shared);
                    setSaved({ ...saved, shared });
                  });
                }}
              />
              {t('Delen met de klant')}
            </label>
            {saved.shared ? (
              <>
                <p className="muted small">
                  {t('Met deze link bekijkt de klant de foto\'s en downloadt het fotoboek, zonder in te loggen.')}
                </p>
                <div className="row" style={{ alignItems: 'center' }}>
                  <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ flex: '3 1 320px' }} />
                  <div className="actions" style={{ marginTop: 0, flex: '0 0 auto' }}>
                    <button
                      className="secondary"
                      onClick={() =>
                        void navigator.clipboard.writeText(link).then(
                          () => setNotice(t('Link gekopieerd.')),
                          () => setError(t('Kopiëren lukte niet. Selecteer de link en kopieer hem zelf.')),
                        )
                      }
                    >
                      {t('Kopieer link')}
                    </button>
                    {mail ? (
                      <a
                        className="button secondary"
                        href={`mailto:?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`}
                      >
                        {t('Mail naar de klant')}
                      </a>
                    ) : null}
                    <a className="button secondary" href={link} target="_blank" rel="noreferrer">
                      {t('Bekijken')}
                    </a>
                  </div>
                </div>
                <p>
                  <button
                    className="link"
                    disabled={!!busy}
                    onClick={() =>
                      void run(t('Opslaan…'), async () => {
                        const token = await rotateToken(session.id);
                        setSaved({ ...saved, share_token: token });
                        setNotice(t('Nieuwe link gemaakt. De oude link werkt niet meer.'));
                      })
                    }
                  >
                    {t('Nieuwe link maken (de oude werkt dan niet meer)')}
                  </button>
                </p>
              </>
            ) : null}
          </>
        ) : (
          <p className="muted small">{t('Na het maken van de PDF kun je het fotoboek met de klant delen.')}</p>
        )}
      </div>
    </>
  );
}
