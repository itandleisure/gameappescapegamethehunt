'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LOCALES, isAdminLanguage } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';
import { bookText } from '@/lib/photobook';
import { formatDuration } from '@/lib/results';
import { supabase } from '@/lib/supabase';

interface SharedBook {
  title: string;
  intro: string;
  language: string;
  session: string;
  starts_at: string | null;
  timezone: string;
  organization: string;
  items: { source: string; path: string; caption: string; large?: boolean; url: string }[];
  ranking: { rank: string; name: string; score: string; duration_seconds: string | null }[];
  pdf_url: string | null;
}

/** Fotoboek voor de klant: werkt zonder inloggen, via de geheime link. */
export default function SharedPhotobookPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useLanguage();
  const [book, setBook] = useState<SharedBook | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void supabase()
      .functions.invoke(`photobook?token=${encodeURIComponent(token)}`, { method: 'GET' })
      .then(({ data, error }) => {
        if (error || !data) setFailed(true);
        else setBook(data as SharedBook);
      });
  }, [token]);

  useEffect(() => {
    if (book) document.title = `${book.title} – Escape Game The Hunt`;
  }, [book]);

  if (failed) return <p className="muted">{t('Dit fotoboek is niet (meer) gedeeld. Vraag de organisatie om een nieuwe link.')}</p>;
  if (!book) return <p className="muted">{t('Laden…')}</p>;

  const lang = isAdminLanguage(book.language) ? book.language : 'nl';
  const date = book.starts_at
    ? new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'long', timeZone: book.timezone || 'Europe/Amsterdam' }).format(new Date(book.starts_at))
    : '';

  return (
    <>
      <section className="book-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/logo-full-light.png" alt="Escape Game The Hunt" />
        <div>
          <h1>{book.title}</h1>
          <p>{[date, book.title !== book.session ? book.session : ''].filter(Boolean).join(' · ')}</p>
          <div className="bar" />
          {book.intro ? <p>{book.intro}</p> : null}
          {book.pdf_url ? (
            <p style={{ marginTop: 16 }}>
              <a className="button" href={book.pdf_url} target="_blank" rel="noreferrer">
                {bookText(lang, 'download')}
              </a>
            </p>
          ) : null}
        </div>
      </section>

      {book.ranking.length ? (
        <>
          <h2>{bookText(lang, 'ranking')}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{bookText(lang, 'place')}</th>
                  <th>{bookText(lang, 'team')}</th>
                  <th>{bookText(lang, 'points')}</th>
                  <th>{bookText(lang, 'time')}</th>
                </tr>
              </thead>
              <tbody>
                {book.ranking.map((r) => (
                  <tr key={`${r.rank}-${r.name}`}>
                    <td>
                      <strong>{r.rank}</strong>
                    </td>
                    <td>{r.name}</td>
                    <td>{r.score}</td>
                    <td>{formatDuration(r.duration_seconds === null ? null : Number(r.duration_seconds))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <h2>{bookText(lang, 'photos')}</h2>
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
      <p className="muted small" style={{ marginTop: 32, textAlign: 'center' }}>
        Escape Game The Hunt
      </p>
    </>
  );
}
