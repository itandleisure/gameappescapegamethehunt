'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ADMIN_LANGUAGES, ADMIN_LANGUAGE_NAMES, isAdminLanguage, type AdminLanguage } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';
import { buildPhotoZip, saveBlob } from '@/lib/photo-zip';
import {
  defaultItems,
  gameCaption,
  huntStats,
  mailBody,
  moveItem,
  paginate,
  pdfFileName,
  CAUGHT_PHOTO_KEY,
  TEAM_PHOTO_KEY,
  unusedGamePhotos,
  zipFileName,
  type BookItem,
  type Photobook,
  type PhotobookSettings,
} from '@/lib/photobook';
import { buildPhotobookPdf } from '@/lib/photobook-pdf';
import {
  deleteFile,
  listOwnPhotos,
  loadPhotobook,
  loadSettings,
  rotateToken,
  savePhotobook,
  sessionOrg,
  setShared,
  shareLink,
  signItems,
  signPdf,
  uploadOwnPhoto,
  uploadPdf,
} from '@/lib/photobook-store';
import type { SessionResultsView } from '@/lib/results';
import type { SessionLive } from '@/lib/session-live';
import { tx } from '@/lib/text';

type Draft = Pick<Photobook, 'title' | 'city' | 'intro' | 'items' | 'show_ranking' | 'language'>;

/**
 * Fotoboek voor de klant: spelfoto's, eigen foto's en de vaste foto's kiezen
 * en ordenen, een PDF in Escape Game The Hunt-stijl maken en die met link en
 * wachtwoord 28 dagen met de klant delen.
 */
export function PhotobookEditor({ data, view }: { data: SessionLive; view: SessionResultsView }) {
  const { t, lang, locale } = useLanguage();
  const { session } = data;
  const [saved, setSaved] = useState<Photobook | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [settings, setSettings] = useState<PhotobookSettings | null>(null);
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
      gameCaption(
        p,
        teamName(p.team_id),
        p.task_key === TEAM_PHOTO_KEY
          ? ''
          : p.task_key === CAUGHT_PHOTO_KEY
            ? t('Gepakt door The Hunters!')
            : tx(data.game.tasks.find((x) => x.id === p.task_key)?.title),
      ),
    [data.game.tasks, teamName, t],
  );

  // Laden: bestaand fotoboek, of een eerste opzet met alle spelfoto's en de vaste foto's.
  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const org = await sessionOrg(session.id);
        const [book, own, set] = await Promise.all([
          loadPhotobook(session.id),
          listOwnPhotos(session.id).catch(() => []),
          org ? loadSettings(org).catch(() => null) : Promise.resolve(null),
        ]);
        if (stop) return;
        setSaved(book);
        setOwnFiles(own);
        setSettings(set);
        setDraft(
          book ?? {
            title: session.name,
            city: '',
            intro: '',
            items: defaultItems(data.photos, view.teams.map((x) => x.id), caption, set?.stock_paths ?? []),
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
  const unusedFiles = useMemo(() => {
    const used = new Set(items.filter((i) => i.source !== 'game').map((i) => i.path));
    return [
      ...ownFiles.filter((p) => !used.has(p)).map((path) => ({ source: 'own' as const, path })),
      ...(settings?.stock_paths ?? []).filter((p) => !used.has(p)).map((path) => ({ source: 'stock' as const, path })),
    ];
  }, [items, ownFiles, settings]);

  // Voorbeeldfoto's: tijdelijke links ophalen voor wat nog geen link heeft.
  const wanted = [...items, ...unusedGame.map((p) => ({ source: 'game' as const, path: p.path })), ...unusedFiles].filter(
    (i) => !urls.has(i.path),
  );
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

  const save = async (extra: Partial<Pick<Photobook, 'pdf_path' | 'pdf_made_at'>> = {}) => {
    const book = await savePhotobook({ session_id: session.id, ...draft, ...extra });
    setSaved(book);
    setDirty(false);
    return book;
  };

  const addOwn = (files: FileList | null) =>
    void run(t("Foto's uploaden…"), async () => {
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
      const extra = settings?.stock_paths.slice(0, 2) ?? [];
      const signed = await signItems([
        ...items,
        ...extra.map((path) => ({ source: 'stock' as const, path })),
        ...(settings?.cover_path ? [{ source: 'stock' as const, path: settings.cover_path }] : []),
      ]);
      const bytes = await buildPhotobookPdf({
        title: draft.title || session.name,
        city: draft.city.trim(),
        intro: draft.intro,
        language: draft.language,
        items: items.flatMap((i) => (signed.has(i.path) ? [{ ...i, url: signed.get(i.path)! }] : [])),
        coverUrl: settings?.cover_path ? (signed.get(settings.cover_path) ?? null) : null,
        extraUrls: extra.flatMap((p) => (signed.has(p) ? [signed.get(p)!] : [])),
        stats: draft.show_ranking ? huntStats(view.teams) : null,
        links: settings?.links ?? {},
        onProgress: (done, total) => setBusy(t('Foto {n} van {total} verwerken…', { n: done, total })),
      });
      setBusy(t('PDF opslaan…'));
      const path = await uploadPdf(session.id, bytes);
      await save({ pdf_path: path, pdf_made_at: new Date().toISOString() });
      saveBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), pdfFileName(draft.title || session.name));
      setNotice(t('De PDF is gemaakt en gedownload.'));
    });

  const makeZip = () =>
    void run(t('Zip maken…'), async () => {
      const signed = await signItems(items);
      const blob = await buildPhotoZip(
        items.flatMap((i) => (signed.has(i.path) ? [{ ...i, url: signed.get(i.path)! }] : [])),
        (done, total) => setBusy(t('Foto {n} van {total} verwerken…', { n: done, total })),
      );
      saveBlob(blob, zipFileName(draft.title || session.name));
    });

  const share = (on: boolean) =>
    void run(t('Opslaan…'), async () => {
      if (!saved) return;
      const until = await setShared(session.id, on);
      setSaved({ ...saved, shared: on, shared_until: until });
      if (on) setNotice(t('Het fotoboek is {days} dagen te bekijken.', { days: 28 }));
    });

  const pages = paginate(items).length;
  const link = saved ? shareLink(saved.share_token) : '';
  const fmtDate = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(iso));
  const expired = !!saved?.shared_until && Date.parse(saved.shared_until) < Date.now();
  const mail = saved ? mailBody(draft.language, draft.title || session.name, link, saved.share_password, saved.shared_until) : null;
  const madeAt = saved?.pdf_made_at
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(saved.pdf_made_at))
    : null;

  const thumb = (path: string, alt: string) =>
    urls.get(path) ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={urls.get(path)} alt={alt} loading="lazy" />
    ) : (
      <div className="placeholder muted">{t('Laden…')}</div>
    );
  const sourceBadge = (source: BookItem['source']) =>
    source === 'own' ? (
      <span className="badge pb-own">{t('Eigen foto')}</span>
    ) : source === 'stock' ? (
      <span className="badge pb-own">{t('Vaste foto')}</span>
    ) : null;

  return (
    <>
      <p className="muted">
        {t("Maak na afloop een fotoboek voor de klant: kies de foto's uit het spel, voeg jullie eigen foto's toe, zet ze in de goede volgorde en maak er een PDF van.")}{' '}
        <Link href="/instellingen/fotoboek">{t('Vaste foto\'s en links van elk fotoboek')}</Link>
      </p>

      <div className="card">
        <div className="row">
          <div>
            <label htmlFor="pb-city">{t('Stad')}</label>
            <input
              id="pb-city"
              value={draft.city}
              maxLength={80}
              placeholder="Leeuwarden"
              onChange={(e) => change({ city: e.target.value })}
            />
          </div>
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
        <p className="help">{t('Op de voorkant: "Bedankt voor het spelen van The Hunt in {city}". De titel is de naam van de PDF en de klantpagina.', { city: draft.city || '…' })}</p>
        <label htmlFor="pb-intro">{t('Tekst op de voorkant')}</label>
        <textarea
          id="pb-intro"
          rows={2}
          maxLength={4000}
          value={draft.intro}
          placeholder={t('Bijvoorbeeld: Wat een middag! Hier zijn de mooiste momenten van jullie hunt.')}
          onChange={(e) => change({ intro: e.target.value })}
        />
        <label className="check">
          <input type="checkbox" checked={draft.show_ranking} onChange={(e) => change({ show_ranking: e.target.checked })} />
          {t('Pagina "Jullie Hunt in cijfers" (afstand, stappen en CO2 per team)')}
        </label>
      </div>

      <div className="row" style={{ alignItems: 'center', margin: '24px 0 12px' }}>
        <h2 style={{ margin: 0, flex: '1 1 auto' }}>
          {t('In het fotoboek')} ({items.length})
        </h2>
        <div className="actions" style={{ marginTop: 0, flex: '0 0 auto' }}>
          <label className={`filebutton ${busy ? 'disabled' : ''}`}>
            {t("Eigen foto's toevoegen")}
            <input type="file" accept="image/*" multiple disabled={!!busy} onChange={(e) => addOwn(e.target.files)} />
          </label>
        </div>
      </div>
      <p className="muted small">
        {items.length === 0
          ? t("Nog geen foto's gekozen.")
          : t(
              "Sleep de foto's in de goede volgorde. Grote foto's (zoals de groepsfoto) krijgen een eigen pagina, de andere komen met maximaal vier op een pagina ({n} fotopagina's).",
              { n: pages },
            )}
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
              {sourceBadge(item.source)}
            </div>
            <figcaption>
              <input
                value={item.caption}
                placeholder={item.large ? t('Groepsfoto') : t('Onderschrift')}
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

      {unusedGame.length || unusedFiles.length ? (
        <>
          <div className="row" style={{ alignItems: 'center', margin: '24px 0 12px' }}>
            <h2 style={{ margin: 0, flex: '1 1 auto' }}>
              {t('Niet in het fotoboek')} ({unusedGame.length + unusedFiles.length})
            </h2>
            <div className="actions" style={{ marginTop: 0, flex: '0 0 auto' }}>
              <button
                className="secondary"
                onClick={() =>
                  setItems([
                    ...items,
                    ...unusedGame.map((p) => ({ source: 'game' as const, path: p.path, caption: caption(p) })),
                    ...unusedFiles.map((f) => ({ ...f, caption: '' })),
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
            {unusedFiles.map((f) => (
              <figure key={f.path}>
                <div className="pb-thumb">
                  {thumb(f.path, t('Eigen foto'))}
                  {sourceBadge(f.source)}
                </div>
                <figcaption>
                  <div className="pb-tools">
                    <button className="secondary" onClick={() => setItems([...items, { ...f, caption: '' }])}>
                      {t('Toevoegen')}
                    </button>
                    {f.source === 'own' ? (
                      <button
                        className="link"
                        onClick={() =>
                          void run(t('Verwijderen…'), async () => {
                            await deleteFile(f.path);
                            setOwnFiles((list) => list.filter((x) => x !== f.path));
                          })
                        }
                      >
                        {t('Verwijderen')}
                      </button>
                    ) : null}
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
          <button className="secondary" disabled={!!busy || items.length === 0} onClick={makeZip}>
            {t("Alle foto's als zip")}
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
              <input type="checkbox" checked={saved.shared} disabled={!!busy} onChange={(e) => share(e.target.checked)} />
              {t('Delen met de klant (28 dagen)')}
            </label>
            {saved.shared ? (
              <>
                <p className="muted small">
                  {t("Met deze link en het wachtwoord bekijkt de klant de foto's en downloadt het fotoboek en alle foto's, zonder in te loggen.")}
                </p>
                <div className="row" style={{ alignItems: 'end' }}>
                  <div style={{ flex: '3 1 320px' }}>
                    <label htmlFor="pb-link">{t('Link')}</label>
                    <input id="pb-link" readOnly value={link} onFocus={(e) => e.target.select()} />
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <label htmlFor="pb-pw">{t('Wachtwoord')}</label>
                    <input id="pb-pw" className="mono" readOnly value={saved.share_password} onFocus={(e) => e.target.select()} />
                  </div>
                </div>
                <p className={expired ? 'error' : 'muted'}>
                  {saved.shared_until
                    ? expired
                      ? t('Verlopen op {date}. Verleng om het opnieuw te delen.', { date: fmtDate(saved.shared_until) })
                      : t('Te bekijken tot {date}.', { date: fmtDate(saved.shared_until) })
                    : null}
                </p>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button
                    className="secondary"
                    onClick={() =>
                      void navigator.clipboard.writeText(`${link}\n${t('Wachtwoord: {password}', { password: saved.share_password })}`).then(
                        () => setNotice(t('Link en wachtwoord gekopieerd.')),
                        () => setError(t('Kopiëren lukte niet. Selecteer de link en kopieer hem zelf.')),
                      )
                    }
                  >
                    {t('Kopieer link en wachtwoord')}
                  </button>
                  {mail ? (
                    <a className="button secondary" href={`mailto:?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`}>
                      {t('Mail naar de klant')}
                    </a>
                  ) : null}
                  <a className="button secondary" href={link} target="_blank" rel="noreferrer">
                    {t('Bekijken')}
                  </a>
                  <button className="secondary" disabled={!!busy} onClick={() => share(true)}>
                    {t('Verlengen tot 28 dagen vanaf nu')}
                  </button>
                </div>
                <p>
                  <button
                    className="link"
                    disabled={!!busy}
                    onClick={() =>
                      void run(t('Opslaan…'), async () => {
                        setSaved(await rotateToken(session.id));
                        setNotice(t('Nieuwe link en wachtwoord gemaakt. De oude werken niet meer.'));
                      })
                    }
                  >
                    {t('Nieuwe link en wachtwoord maken (de oude werken dan niet meer)')}
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
