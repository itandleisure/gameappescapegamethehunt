'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { LOCALES, isAdminLanguage, type AdminLanguage } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';
import { buildPhotoZip, saveBlob } from '@/lib/photo-zip';
import {
  bookText,
  DEFAULT_GAMES_URL,
  displayUrl,
  footerText,
  formatNumber,
  href,
  huntStats,
  parseGames,
  zipFileName,
  type BookLinks,
  type BookTextKey,
} from '@/lib/photobook';
import { supabase } from '@/lib/supabase';

interface SharedBook {
  title: string;
  city: string;
  intro: string;
  language: string;
  session: string;
  starts_at: string | null;
  timezone: string;
  items: { source: string; path: string; caption: string; large?: boolean; url: string }[];
  teams: { rank: number; name: string; score: number; duration_seconds: number | null; distance_m: number }[];
  cover_url: string | null;
  links: BookLinks;
  games: unknown;
  pdf_url: string | null;
  shared_until: string | null;
}

type Failure = 'wrong_password' | 'expired' | 'not_found';
const STORE = 'hunt-fotoboek-wachtwoord';

/** Fotoboek voor de klant: werkt zonder inloggen, met de link en het wachtwoord. */
export default function SharedPhotobookPage() {
  const { token } = useParams<{ token: string }>();
  const { lang: adminLang } = useLanguage();
  const [password, setPassword] = useState('');
  const [book, setBook] = useState<SharedBook | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(false);
  const [zipping, setZipping] = useState<string | null>(null);

  const open = async (pw: string) => {
    setLoading(true);
    setFailure(null);
    const { data, error } = await supabase().functions.invoke('photobook', { body: { token, password: pw } });
    setLoading(false);
    if (error || !data) {
      const status = (error as { context?: Response } | null)?.context?.status;
      setFailure(status === 401 ? 'wrong_password' : status === 410 ? 'expired' : 'not_found');
      try {
        sessionStorage.removeItem(`${STORE}-${token}`);
      } catch {
        /* geen opslag */
      }
      return;
    }
    setBook(data as SharedBook);
    try {
      sessionStorage.setItem(`${STORE}-${token}`, pw);
    } catch {
      /* geen opslag */
    }
  };

  // Na verversen hoeft het wachtwoord niet opnieuw.
  useEffect(() => {
    let pw: string | null = null;
    try {
      pw = sessionStorage.getItem(`${STORE}-${token}`);
    } catch {
      /* geen opslag */
    }
    if (pw) {
      setPassword(pw);
      void open(pw);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (book) document.title = `${book.title} – Escape Game The Hunt`;
  }, [book]);

  const lang: AdminLanguage = book && isAdminLanguage(book.language) ? book.language : adminLang;
  const T = (key: BookTextKey, vars?: Record<string, string | number>) => bookText(lang, key, vars);
  const date = (iso: string, timeZone?: string) =>
    new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'long', ...(timeZone ? { timeZone } : {}) }).format(new Date(iso));

  if (!book) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      void open(password);
    };
    return (
      <div className="book">
        <section className="book-gate">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/logo-full-light.png" alt="Escape Game The Hunt" />
          <span className="book-label">{T('missionDone')}</span>
          <h1>{T('thanks')}</h1>
          <form onSubmit={submit}>
            <label htmlFor="pw">{T('password')}</label>
            <p>{T('passwordAsk')}</p>
            <div className="book-pw">
              <input
                id="pw"
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="XXXX-XXXX-XXXX"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit" disabled={loading || !password.trim()}>
                {T('open')}
              </button>
            </div>
            {failure ? (
              <p className="book-error">
                {failure === 'wrong_password' ? T('wrongPassword') : failure === 'expired' ? T('expired') : T('notFound')}
              </p>
            ) : null}
          </form>
        </section>
      </div>
    );
  }

  const stats = book.teams.length ? huntStats(book.teams.map((x) => ({ name: x.name, distanceM: x.distance_m }))) : null;
  const num = (v: number, d = 0) => formatNumber(lang, v, d);
  const cover = book.cover_url ?? book.items[0]?.url ?? null;
  const { google_review, website_review, vacancy, video, website, email, phone } = book.links;
  const imageUrls = new Map(
    (Array.isArray(book.games) ? (book.games as { image_path?: string | null; image_url?: string | null }[]) : []).flatMap((g) =>
      g.image_path && g.image_url ? [[g.image_path, g.image_url] as const] : [],
    ),
  );
  const games = parseGames(book.games);
  const allGames = book.links.games || DEFAULT_GAMES_URL;

  const zip = () => {
    setZipping(T('zipping', { n: 0, total: book.items.length }));
    void buildPhotoZip(book.items, (n, total) => setZipping(T('zipping', { n, total })))
      .then((blob) => saveBlob(blob, zipFileName(book.title)))
      .finally(() => setZipping(null));
  };

  return (
    <div className="book">
      <section className="book-cover" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
        <div className="book-cover-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/logo-full-light.png" alt="Escape Game The Hunt" />
          <span className="book-label">{T('missionDone')}</span>
          <h1>
            {T('thanksFor')}
            <br />
            {book.city ? (
              <>
                {T('huntIn')} <span className="accent">{book.city}</span>
              </>
            ) : (
              <span className="accent">Escape Game The Hunt</span>
            )}
          </h1>
          <p className="muted-light">
            {[book.starts_at ? date(book.starts_at, book.timezone || undefined) : '', book.title !== book.session ? book.title : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
          {book.intro ? <p>{book.intro}</p> : null}
          <div className="book-actions">
            {book.pdf_url ? (
              <a className="book-btn orange" href={book.pdf_url} target="_blank" rel="noreferrer">
                {T('download')}
              </a>
            ) : null}
            <button className="book-btn outline" onClick={zip} disabled={!!zipping || book.items.length === 0}>
              {zipping ?? T('downloadZip')}
            </button>
          </div>
          {book.shared_until ? <p className="muted-light small">{T('availableUntil', { date: date(book.shared_until) })}</p> : null}
        </div>
      </section>

      {stats ? (
        <section className="book-section">
          <span className="book-label">{T('missionDone')}</span>
          <h2>{T('statsTitle')}</h2>
          <p className="muted">{T('statsIntro')}</p>
          <div className="book-cards">
            <div>
              <strong>{num(stats.avgKm, 1)} km</strong>
              <span>{T('avgKm')}</span>
            </div>
            <div>
              <strong>{num(stats.avgStepsPP)}</strong>
              <span>{T('stepsPP')}</span>
            </div>
            <div>
              <strong>{num(stats.totalKm, 1)} km</strong>
              <span>{T('totalKm', { n: stats.teams.length })}</span>
            </div>
            <div className="dark">
              <strong>{num(stats.totalCo2Kg, 1)} kg</strong>
              <span>{T('co2Saved')}</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="book-table">
              <thead>
                <tr>
                  <th>{T('team')}</th>
                  <th>{T('km')}</th>
                  <th>{T('steps')}</th>
                  <th>{T('kcal')}</th>
                  <th>{T('co2')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.teams.map((x) => (
                  <tr key={x.name}>
                    <td>{x.name}</td>
                    <td>{num(x.km, 1)}</td>
                    <td>{num(x.stepsPP)}</td>
                    <td>{num(x.kcalPP)}</td>
                    <td>{num(x.co2Kg, 2)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>{T('together')}</td>
                  <td>{num(stats.totalKm, 1)}</td>
                  <td />
                  <td />
                  <td>{num(stats.totalCo2Kg, 1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted small">{T('footnote')}</p>
          {video ? (
            <a className="book-video" href={href('url', video)} target="_blank" rel="noreferrer">
              <strong>{T('videoTitle')}</strong> <span className="muted">{T('videoText')}</span> <span className="accent">{T('videoLink')} →</span>
            </a>
          ) : null}
        </section>
      ) : null}

      <section className="book-section">
        <span className="book-label">{T('missionDone')}</span>
        <h2>{T('yourPhotos')}</h2>
        <div className="book-photos">
          {book.items.map((item) => (
            <figure key={item.path} className={item.large ? 'large' : ''}>
              <a href={item.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.caption} loading="lazy" />
              </a>
              {item.caption ? <figcaption>{item.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      </section>

      {google_review || website_review || vacancy ? (
        <section className="book-section dark">
          {google_review || website_review ? (
            <>
              <h2>{T('reviewTitle')}</h2>
              <p>{T('reviewText')}</p>
              <div className="book-actions">
                {google_review ? (
                  <a className="book-btn orange" href={href('url', google_review)} target="_blank" rel="noreferrer">
                    {T('googleReview')}
                  </a>
                ) : null}
                {website_review ? (
                  <a className="book-btn outline" href={href('url', website_review)} target="_blank" rel="noreferrer">
                    {T('websiteReview')}
                  </a>
                ) : null}
              </div>
            </>
          ) : null}
          {vacancy ? (
            <div className="book-vacancy">
              <span className="book-label">{T('vacancyLabel')}</span>
              <h3>{T('vacancyTitle')}</h3>
              <p>{T('vacancyText')}</p>
              <p>
                <strong>{T('vacancyAsk')}</strong>
              </p>
              <a className="book-btn dark" href={href('url', vacancy)} target="_blank" rel="noreferrer">
                {T('vacancyLink')} →
              </a>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="book-section dark">
        <span className="book-label">{T('missionDone')}</span>
        <h2>{T('thanks')}</h2>
        <p>{T('thanksText')}</p>
        {games.length ? (
          <>
            <h3>{T('moreGames')}</h3>
            <p className="muted-light">{T('moreGamesText')}</p>
            <div className="book-games">
              {games.map((g) => (
                <a key={g.name} className="book-game" href={g.url ? href('url', g.url) : undefined} target="_blank" rel="noreferrer">
                  {g.image_path && imageUrls.get(g.image_path) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrls.get(g.image_path)} alt="" loading="lazy" />
                  ) : null}
                  <strong>{g.name}</strong>
                  <span>{g.text}</span>
                  {g.url ? <span className="accent">{displayUrl(g.url)} →</span> : null}
                </a>
              ))}
            </div>
            <div className="book-actions">
              <a className="book-btn orange" href={href('url', allGames)} target="_blank" rel="noreferrer">
                {T('allGames')}: {displayUrl(allGames)}
              </a>
            </div>
          </>
        ) : null}
      </section>

      <footer className="book-footer">
        <span className="book-label">{footerText(book.city)}</span>
        <span>
          {website ? <a href={href('url', website)}>{displayUrl(website)}</a> : null}
          {email ? <a href={href('email', email)}>{email}</a> : null}
          {phone ? <a href={href('phone', phone)}>{phone}</a> : null}
        </span>
      </footer>
    </div>
  );
}
