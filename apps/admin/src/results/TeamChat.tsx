'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useLanguage } from '@/lib/language';
import type { SessionLive } from '@/lib/session-live';
import { supabase } from '@/lib/supabase';

export interface ChatRow {
  id: string;
  team_id: string | null;
  sender: 'staff' | 'team';
  sender_name: string | null;
  body: string;
  created_at: string;
  /** Foto van een spelleider (bucket photobooks, bij de eigen foto's van het fotoboek). */
  photo_path?: string | null;
}

const COLUMNS = 'id, team_id, sender, sender_name, body, created_at, photo_path';

/** Foto in een chatbericht; klikken opent hem groot. */
function ChatPhoto({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase()
      .storage.from('photobooks')
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => alive && setUrl(data?.signedUrl ?? null));
    return () => {
      alive = false;
    };
  }, [path]);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="chatphoto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} loading="lazy" />
    </a>
  );
}
const MAX_LENGTH = 500;

/**
 * Teamchat van een hunt: alle teams en de spelleiding in één gesprek. De
 * spelleider zet de chat aan of uit, praat mee en haalt berichten weg.
 * Met channel="hunters" de onderlinge chat van de spelleiders in de app, die
 * teams nooit zien; daarin staat ieder met zijn eigen naam.
 */
export function TeamChat({
  channel = 'teams',
  data,
  colors,
  onChange,
}: {
  channel?: 'teams' | 'hunters';
  data: SessionLive;
  colors: Map<string, string>;
  onChange: () => void;
}) {
  const { session } = data;
  const { t, locale } = useLanguage();
  const hunters = channel === 'hunters';
  const [rows, setRows] = useState<ChatRow[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data: d, error: e } = await supabase()
      .from('messages')
      .select(COLUMNS)
      .eq('session_id', session.id)
      .eq('channel', channel)
      .order('created_at');
    if (e) setError(e.message);
    else setRows(d as ChatRow[]);
  }, [session.id, channel]);

  useEffect(() => {
    void load();
    const db = supabase();
    const live = db
      .channel(`${channel}-beheer-${session.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${session.id}` }, (p) => {
        const row = p.new as ChatRow & { channel?: string };
        if (row.channel !== channel) return;
        setRows((r) => (r && !r.some((x) => x.id === row.id) ? [...r, row] : r));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => {
        const id = (p.old as { id?: string }).id;
        setRows((r) => (r ? r.filter((x) => x.id !== id) : r));
      })
      .subscribe();
    // Vangnet als de live verbinding even wegvalt.
    const timer = setInterval(() => !document.hidden && void load(), 20_000);
    return () => {
      clearInterval(timer);
      void db.removeChannel(live);
    };
  }, [session.id, channel, load]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [rows]);

  const toggle = async () => {
    setError(null);
    const { error: e } = await supabase().from('sessions').update({ team_chat: !session.team_chat }).eq('id', session.id);
    if (e) setError(e.message);
    else onChange();
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    // Afzender, naam ("The Hunters") en tijd vult de database in.
    const { data: row, error: err } = await supabase()
      .from('messages')
      .insert({ session_id: session.id, sender: 'staff', channel, body })
      .select(COLUMNS)
      .single();
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setText('');
    setRows((r) => (r && !r.some((x) => x.id === (row as ChatRow).id) ? [...r, row as ChatRow] : r));
  };

  const remove = async (row: ChatRow) => {
    const ask = hunters ? t('Dit bericht verwijderen?') : t('Dit bericht verwijderen? De teams zien het dan niet meer.');
    if (!window.confirm(ask)) return;
    const { error: e } = await supabase().from('messages').delete().eq('id', row.id);
    if (e) setError(e.message);
    else setRows((r) => (r ? r.filter((x) => x.id !== row.id) : r));
  };

  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: session.timezone });

  return (
    <div className="teamchat">
      {hunters ? (
        <p className="muted">
          {t('De onderlinge chat van de spelleiders in de app. Teams zien deze chat niet. Spelleiders staan erin met hun eigen naam, jij als Organisatie.')}
        </p>
      ) : (
        <p>
          <label className="switch">
            <input type="checkbox" role="switch" checked={session.team_chat} onChange={() => void toggle()} />
            <span className="slider" aria-hidden="true" />
            <span className={session.team_chat ? 'on' : 'off'}>{session.team_chat ? t('Teamchat aan') : t('Teamchat uit')}</span>
          </label>{' '}
          <span className="muted">
            {session.team_chat
              ? t('Alle teams van dit ticket kunnen elkaar berichten sturen. Jij leest mee en kunt berichten verwijderen.')
              : t('Zet de teamchat aan om teams elkaar berichten te laten sturen. Eerdere berichten blijven zichtbaar.')}
          </span>
        </p>
      )}
      {error ? <ul className="errors"><li>{error}</li></ul> : null}
      <div className="chatlist" ref={list}>
        {rows === null ? <p className="muted">{t('Laden…')}</p> : null}
        {rows?.length === 0 ? <p className="muted">{t('Nog geen berichten.')}</p> : null}
        {rows?.map((m) => (
          <div key={m.id} className={m.sender === 'staff' ? 'chatmsg staff' : 'chatmsg'}>
            <div className="chatmeta">
              {m.team_id ? <span className="dot" style={{ background: colors.get(m.team_id) ?? 'var(--muted)' }} /> : null}
              <strong>{m.sender === 'staff' ? (m.sender_name ?? (hunters ? t('Organisatie') : t('Spelleiding'))) : (m.sender_name ?? t('Onbekend team'))}</strong>
              <span className="muted">{time.format(new Date(m.created_at))}</span>
              <button className="link" title={t('Verwijderen')} onClick={() => void remove(m)}>
                {t('Verwijderen')}
              </button>
            </div>
            {m.photo_path ? <ChatPhoto path={m.photo_path} alt={m.body} /> : null}
            {m.photo_path && m.body === '📷' ? null : <div className="chatbody">{m.body}</div>}
          </div>
        ))}
      </div>
      <form className="chatform" onSubmit={(e) => void send(e)}>
        <input
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder={hunters ? t('Bericht aan de spelleiders') : t('Bericht aan alle teams')}
          aria-label={hunters ? t('Bericht aan de spelleiders') : t('Bericht aan alle teams')}
        />
        <button type="submit" disabled={busy || !text.trim()}>
          {t('Versturen')}
        </button>
      </form>
    </div>
  );
}
