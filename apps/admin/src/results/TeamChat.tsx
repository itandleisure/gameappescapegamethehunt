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
}

const COLUMNS = 'id, team_id, sender, sender_name, body, created_at';
const MAX_LENGTH = 500;

/**
 * Teamchat van een hunt: alle teams en de spelleiding in één gesprek. De
 * spelleider zet de chat aan of uit, praat mee en haalt berichten weg.
 */
export function TeamChat({
  data,
  colors,
  onChange,
}: {
  data: SessionLive;
  colors: Map<string, string>;
  onChange: () => void;
}) {
  const { session } = data;
  const { t, locale } = useLanguage();
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
      .eq('channel', 'teams')
      .order('created_at');
    if (e) setError(e.message);
    else setRows(d as ChatRow[]);
  }, [session.id]);

  useEffect(() => {
    void load();
    const db = supabase();
    const channel = db
      .channel(`teamchat-beheer-${session.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${session.id}` }, (p) => {
        const row = p.new as ChatRow & { channel?: string };
        if (row.channel !== 'teams') return;
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
      void db.removeChannel(channel);
    };
  }, [session.id, load]);

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
    // Afzender en tijd vult de database in.
    const { data: row, error: err } = await supabase()
      .from('messages')
      .insert({ session_id: session.id, sender: 'staff', channel: 'teams', body })
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
    if (!window.confirm(t('Dit bericht verwijderen? De teams zien het dan niet meer.'))) return;
    const { error: e } = await supabase().from('messages').delete().eq('id', row.id);
    if (e) setError(e.message);
    else setRows((r) => (r ? r.filter((x) => x.id !== row.id) : r));
  };

  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: session.timezone });

  return (
    <div className="teamchat">
      <p>
        <label className="switch">
          <input type="checkbox" role="switch" checked={session.team_chat} onChange={() => void toggle()} />
          <span className="slider" aria-hidden="true" />
          <span className={session.team_chat ? 'on' : 'off'}>{session.team_chat ? t('Teamchat aan') : t('Teamchat uit')}</span>
        </label>{' '}
        <span className="muted">
          {session.team_chat
            ? t('Alle teams van deze hunt kunnen elkaar berichten sturen. Jij leest mee en kunt berichten verwijderen.')
            : t('Zet de teamchat aan om teams elkaar berichten te laten sturen. Eerdere berichten blijven zichtbaar.')}
        </span>
      </p>
      {error ? <ul className="errors"><li>{error}</li></ul> : null}
      <div className="chatlist" ref={list}>
        {rows === null ? <p className="muted">{t('Laden…')}</p> : null}
        {rows?.length === 0 ? <p className="muted">{t('Nog geen berichten.')}</p> : null}
        {rows?.map((m) => (
          <div key={m.id} className={m.sender === 'staff' ? 'chatmsg staff' : 'chatmsg'}>
            <div className="chatmeta">
              {m.team_id ? <span className="dot" style={{ background: colors.get(m.team_id) ?? 'var(--muted)' }} /> : null}
              <strong>{m.sender === 'staff' ? t('Spelleiding') : (m.sender_name ?? t('Onbekend team'))}</strong>
              <span className="muted">{time.format(new Date(m.created_at))}</span>
              <button className="link" title={t('Verwijderen')} onClick={() => void remove(m)}>
                {t('Verwijderen')}
              </button>
            </div>
            <div className="chatbody">{m.body}</div>
          </div>
        ))}
      </div>
      <form className="chatform" onSubmit={(e) => void send(e)}>
        <input
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('Bericht aan alle teams')}
          aria-label={t('Bericht aan alle teams')}
        />
        <button type="submit" disabled={busy || !text.trim()}>
          {t('Versturen')}
        </button>
      </form>
    </div>
  );
}
