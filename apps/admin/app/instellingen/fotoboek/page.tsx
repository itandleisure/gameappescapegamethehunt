'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { tKey } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';
import { DEFAULT_GAMES, MAX_GAMES, moveItem, type BookGame, type BookLinks, type PhotobookSettings } from '@/lib/photobook';
import { deleteFile, loadSettings, saveSettings, signItems, uploadStockPhoto } from '@/lib/photobook-store';

const LINK_FIELDS: { key: keyof BookLinks; label: string; placeholder: string }[] = [
  { key: 'video', label: tKey('Video van The Hunt'), placeholder: 'https://www.youtube.com/…' },
  { key: 'google_review', label: tKey('Google-review'), placeholder: 'https://g.page/r/…/review' },
  { key: 'website_review', label: tKey('Review via de website'), placeholder: 'https://escapegamethehunt.nl/review' },
  { key: 'vacancy', label: tKey('Vacature voor Hunters'), placeholder: 'https://escapegamethehunt.nl/werken-bij' },
  { key: 'website', label: tKey('Website'), placeholder: 'escapegamethehunt.nl' },
  { key: 'email', label: tKey('E-mail'), placeholder: 'info@…' },
  { key: 'phone', label: tKey('Telefoon'), placeholder: '085 …' },
  { key: 'games', label: tKey('Website met alle spellen (knop op de laatste pagina)'), placeholder: 'https://badassgames.nl' },
];

/** Vaste onderdelen van elk fotoboek: omslagfoto, algemene foto's en links. */
export default function PhotobookSettingsPage() {
  const { org } = useAuth();
  const { t } = useLanguage();
  const [settings, setSettings] = useState<PhotobookSettings | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canEdit = !!org && ['owner', 'admin', 'editor'].includes(org.role);

  useEffect(() => {
    if (!org) return;
    void loadSettings(org.id).then(setSettings, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [org]);

  const paths = settings
    ? [
        ...(settings.cover_path ? [settings.cover_path] : []),
        ...settings.stock_paths,
        ...settings.games.flatMap((g) => (g.image_path ? [g.image_path] : [])),
      ]
    : [];
  const missing = paths.filter((p) => !urls.has(p)).join('|');
  useEffect(() => {
    if (!missing) return;
    void signItems(missing.split('|').map((path) => ({ source: 'stock' as const, path }))).then((found) =>
      setUrls((u) => new Map([...u, ...found])),
    );
  }, [missing]);

  if (!org) return null;
  if (!settings) return error ? <p className="error">{error}</p> : <p className="muted">{t('Laden…')}</p>;

  const change = (patch: Partial<PhotobookSettings>) => {
    setSettings({ ...settings, ...patch });
    setDirty(true);
    setNotice(null);
  };
  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const upload = (files: FileList | null, cover: boolean) =>
    void run(t("Foto's uploaden…"), async () => {
      const added: string[] = [];
      for (const file of [...(files ?? [])]) added.push(await uploadStockPhoto(org.id, file));
      if (cover) change({ cover_path: added[0] ?? settings.cover_path });
      else change({ stock_paths: [...settings.stock_paths, ...added] });
    });
  const setGame = (index: number, patch: Partial<BookGame>) =>
    change({ games: settings.games.map((g, i) => (i === index ? { ...g, ...patch } : g)) });
  const uploadGame = (index: number, files: FileList | null) =>
    void run(t("Foto's uploaden…"), async () => {
      const file = files?.[0];
      if (file) setGame(index, { image_path: await uploadStockPhoto(org.id, file) });
    });
  const remove = (path: string) =>
    void run(t('Verwijderen…'), async () => {
      const next = { ...settings, stock_paths: settings.stock_paths.filter((p) => p !== path), cover_path: settings.cover_path === path ? null : settings.cover_path };
      await saveSettings(next);
      await deleteFile(path).catch(() => undefined);
      setSettings(next);
    });
  const img = (path: string) =>
    urls.get(path) ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={urls.get(path)} alt="" loading="lazy" />
    ) : (
      <div className="placeholder muted">{t('Laden…')}</div>
    );

  return (
    <>
      <p className="muted">
        <Link href="/sessies">{t('Tickets')}</Link> › {t('Fotoboek')}
      </p>
      <h1>{t("Vaste foto's en links van elk fotoboek")}</h1>
      <p className="muted">
        {t("Deze foto's en links komen in elk fotoboek van {org}. De vaste foto's staan achteraan, en je kunt ze per fotoboek weghalen of verplaatsen.", { org: org.name })}
      </p>
      {!canEdit ? <p className="muted">{t('Alleen eigenaren, beheerders en partners kunnen dit wijzigen.')}</p> : null}

      <h2>{t('Vaste foto voor de voorkant')}</h2>
      <p className="muted small">{t('Een foto van jullie die altijd groot op de voorkant staat, en bij de video. Zonder deze foto komt de eerste foto van het fotoboek op de voorkant.')}</p>
      <div className="photowall photobook">
        {settings.cover_path ? (
          <figure>
            <div className="pb-thumb">{img(settings.cover_path)}</div>
            {canEdit ? (
              <figcaption>
                <button className="link" onClick={() => change({ cover_path: null })}>
                  {t('Weghalen')}
                </button>
              </figcaption>
            ) : null}
          </figure>
        ) : null}
      </div>
      {canEdit ? (
        <label className={`filebutton ${busy ? 'disabled' : ''}`} style={{ marginTop: 12 }}>
          {settings.cover_path ? t('Andere omslagfoto') : t('Omslagfoto kiezen')}
          <input type="file" accept="image/*" disabled={!!busy} onChange={(e) => upload(e.target.files, true)} />
        </label>
      ) : null}

      <h2>{t("Vaste foto's")}</h2>
      <p className="muted small">
        {t("Algemene foto's van jullie, bijvoorbeeld van de Hunters. Hebben de spelers minder dan {n} foto's, dan vullen deze foto's het fotoboek aan. De eerste twee komen ook op de reviewpagina.", { n: 8 })}
      </p>
      <div className="photowall photobook">
        {settings.stock_paths.map((path, i) => (
          <figure key={path}>
            <div className="pb-thumb">
              {img(path)}
              <span className="pb-number">{i + 1}</span>
            </div>
            {canEdit ? (
              <figcaption>
                <div className="pb-tools">
                  <button className="secondary" aria-label={t('Naar voren')} disabled={i === 0} onClick={() => change({ stock_paths: moveItem(settings.stock_paths, i, i - 1) })}>
                    ←
                  </button>
                  <button
                    className="secondary"
                    aria-label={t('Naar achteren')}
                    disabled={i === settings.stock_paths.length - 1}
                    onClick={() => change({ stock_paths: moveItem(settings.stock_paths, i, i + 1) })}
                  >
                    →
                  </button>
                  <button className="link" onClick={() => remove(path)}>
                    {t('Verwijderen')}
                  </button>
                </div>
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>
      {canEdit ? (
        <label className={`filebutton ${busy ? 'disabled' : ''}`} style={{ marginTop: 12 }}>
          {t("Vaste foto's toevoegen")}
          <input type="file" accept="image/*" multiple disabled={!!busy} onChange={(e) => upload(e.target.files, false)} />
        </label>
      ) : null}

      <h2>{t('Meer spellen van Badass Games')}</h2>
      <p className="muted small">{t('Blokken op de laatste pagina ("Bedankt voor het spelen"), met een foto, een korte tekst en een link. Hooguit {n}.', { n: MAX_GAMES })}</p>
      <div className="pb-games">
        {settings.games.map((g, i) => (
          <div className="card" key={i}>
            <div className="row">
              <div>
                <label htmlFor={`game-name-${i}`}>{t('Naam')}</label>
                <input id={`game-name-${i}`} value={g.name} disabled={!canEdit} onChange={(e) => setGame(i, { name: e.target.value })} />
              </div>
              <div style={{ flex: '2 1 260px' }}>
                <label htmlFor={`game-url-${i}`}>{t('Link')}</label>
                <input id={`game-url-${i}`} value={g.url} placeholder="https://badassgames.nl/…" disabled={!canEdit} onChange={(e) => setGame(i, { url: e.target.value })} />
              </div>
            </div>
            <label htmlFor={`game-text-${i}`}>{t('Tekst')}</label>
            <textarea id={`game-text-${i}`} rows={2} maxLength={300} value={g.text} disabled={!canEdit} onChange={(e) => setGame(i, { text: e.target.value })} />
            <div className="row" style={{ alignItems: 'center' }}>
              {g.image_path ? <div className="pb-game-img">{img(g.image_path)}</div> : <p className="muted small">{t('Nog geen foto.')}</p>}
              {canEdit ? (
                <div className="actions" style={{ marginTop: 0 }}>
                  <label className={`filebutton ${busy ? 'disabled' : ''}`}>
                    {g.image_path ? t('Andere foto') : t('Foto kiezen')}
                    <input type="file" accept="image/*" disabled={!!busy} onChange={(e) => uploadGame(i, e.target.files)} />
                  </label>
                  <button className="secondary" disabled={i === 0} onClick={() => change({ games: moveItem(settings.games, i, i - 1) })}>
                    ↑
                  </button>
                  <button className="link" onClick={() => change({ games: settings.games.filter((_, j) => j !== i) })}>
                    {t('Weghalen')}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {canEdit ? (
        <div className="actions">
          <button
            className="secondary"
            disabled={settings.games.length >= MAX_GAMES}
            onClick={() => change({ games: [...settings.games, { name: '', text: '', url: '', image_path: null }] })}
          >
            {t('Spel toevoegen')}
          </button>
          <button className="link" onClick={() => change({ games: DEFAULT_GAMES.map((g) => ({ ...g })) })}>
            {t('Terug naar de vier standaardspellen')}
          </button>
        </div>
      ) : null}

      <h2>{t('Links')}</h2>
      <div className="card">
        <p className="muted small" style={{ marginTop: 0 }}>
          {t('Een onderdeel zonder link komt niet in het fotoboek.')}
        </p>
        {LINK_FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`link-${f.key}`}>{t(f.label)}</label>
            <input
              id={`link-${f.key}`}
              value={settings.links[f.key] ?? ''}
              placeholder={f.placeholder}
              disabled={!canEdit}
              onChange={(e) => change({ links: { ...settings.links, [f.key]: e.target.value } })}
            />
          </div>
        ))}
      </div>

      {canEdit ? (
        <div className="actions">
          <button
            disabled={!!busy || !dirty}
            onClick={() =>
              void run(t('Opslaan…'), async () => {
                await saveSettings(settings);
                setDirty(false);
                setNotice(t('Opgeslagen.'));
              })
            }
          >
            {t('Opslaan')}
          </button>
        </div>
      ) : null}
      {busy ? <p className="muted">{busy}</p> : null}
      {dirty && !busy ? <p className="muted">{t('Niet opgeslagen wijzigingen')}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}
    </>
  );
}
