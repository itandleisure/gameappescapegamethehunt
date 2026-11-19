'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_LOG_COLUMNS, type AppLogRow } from '@/lib/app-logs';
import { useLanguage } from '@/lib/language';
import { buildSessionLog, categoryLabel, logToCsv, type LogCategory, type LogChat } from '@/lib/session-log';
import type { SessionLive } from '@/lib/session-live';
import { supabase } from '@/lib/supabase';

const CATEGORIES: LogCategory[] = ['opdracht', 'regel', 'spel', 'foto', 'chat', 'techniek'];
const STEP = 300;

/**
 * Logboek van een event: alles wat er gebeurde, nieuwste bovenaan. Per team
 * en per soort te filteren, met zoeken en een export voor Excel.
 */
export function EventLog({ data, colors, updatedAt }: { data: SessionLive; colors: Map<string, string>; updatedAt: number }) {
  const { t, locale } = useLanguage();
  const { session } = data;
  const [chat, setChat] = useState<LogChat[]>([]);
  const [issues, setIssues] = useState<AppLogRow[]>([]);
  const [team, setTeam] = useState('');
  const [category, setCategory] = useState<LogCategory | ''>('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(STEP);

  // Chatberichten van alle kanalen; elke 20 seconden bijwerken zolang het tabblad open is.
  const loadChat = useCallback(async () => {
    const { data: rows } = await supabase()
      .from('messages')
      .select('id, team_id, sender, sender_name, body, created_at, channel, photo_path')
      .eq('session_id', session.id)
      .order('created_at');
    if (rows) setChat(rows as LogChat[]);
    // Technische meldingen van de telefoons (zwak GPS, fouten). Leeg als de tabel er (nog) niet is.
    const { data: logs } = await supabase()
      .from('app_logs')
      .select(APP_LOG_COLUMNS)
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (logs) setIssues(logs as unknown as AppLogRow[]);
  }, [session.id]);
  useEffect(() => {
    void loadChat();
    const timer = setInterval(() => {
      if (!document.hidden) void loadChat();
    }, 20_000);
    return () => clearInterval(timer);
  }, [loadChat]);

  const entries = useMemo(
    () =>
      buildSessionLog({
        game: data.game,
        teams: data.teams,
        events: data.events,
        photos: data.photos,
        chat,
        leaders: data.leaders,
        issues,
        now: Math.max(Date.now(), updatedAt),
      }),
    // updatedAt: tijdregels lopen door, ook zonder nieuwe gebeurtenissen.
    [data, chat, issues, updatedAt],
  );

  const time = useMemo(
    () => new Intl.DateTimeFormat(locale, { timeZone: session.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    [locale, session.timezone],
  );
  const day = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: session.timezone, dateStyle: 'medium' }), [locale, session.timezone]);
  const teamName = (id: string | null) => (id ? (data.teams.find((x) => x.id === id)?.name ?? t('Onbekend team')) : t('Spelleiding'));

  const needle = query.trim().toLowerCase();
  const shown = entries.filter(
    (e) =>
      (!team || (team === '-' ? e.teamId === null : e.teamId === team)) &&
      (!category || e.category === category) &&
      (!needle || `${teamName(e.teamId)} ${e.text} ${e.detail ?? ''}`.toLowerCase().includes(needle)),
  );

  const download = () => {
    const csv = logToCsv(shown, teamName, (ms) => `${day.format(ms)} ${time.format(ms)}`);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t('logboek')}-${session.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Een datumregel als de dag wisselt (bij events die over middernacht lopen of meerdere dagen).
  let lastDay = '';

  return (
    <>
      <div className="row logfilters">
        <select aria-label={t('Team')} value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">{t('Alle teams')}</option>
          {data.teams.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
          <option value="-">{t('Spelleiding')}</option>
        </select>
        <select aria-label={t('Soort')} value={category} onChange={(e) => setCategory(e.target.value as LogCategory | '')}>
          <option value="">{t('Alles')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <input type="search" placeholder={t('Zoeken…')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="secondary" onClick={download} disabled={shown.length === 0}>
          {t('Excel-export')}
        </button>
      </div>
      <p className="muted">
        {shown.length === 1 ? t('1 gebeurtenis, nieuwste bovenaan.') : t('{n} gebeurtenissen, nieuwste bovenaan.', { n: shown.length })}
      </p>
      {shown.length === 0 ? (
        <p className="muted">{t('Nog niets gebeurd.')}</p>
      ) : (
        <div className="table-wrap">
          <table className="eventlog">
            <tbody>
              {shown.slice(0, limit).map((e) => {
                const d = day.format(e.at);
                const header = d !== lastDay && lastDay !== '' ? d : null;
                lastDay = d;
                return [
                  header ? (
                    <tr key={`dag-${e.id}`} className="logday">
                      <td colSpan={4}>{header}</td>
                    </tr>
                  ) : null,
                  <tr key={e.id} className={e.tone ?? ''}>
                    <td className="logtime">{time.format(e.at)}</td>
                    <td className="logteam">
                      {e.teamId ? <span className="dot" style={{ background: colors.get(e.teamId) }} /> : null} {teamName(e.teamId)}
                    </td>
                    <td className="logtext">
                      <span className="logkind">{categoryLabel(e.category)}</span> {e.text}
                      {e.detail ? <div className="muted logdetail">{e.detail}</div> : null}
                    </td>
                    <td className="logpoints">{e.points ? `${e.points > 0 ? '+' : ''}${e.points}` : ''}</td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      {shown.length > limit ? (
        <div className="actions">
          <button className="secondary" onClick={() => setLimit((n) => n + STEP)}>
            {t('Meer tonen')}
          </button>
        </div>
      ) : null}
    </>
  );
}
