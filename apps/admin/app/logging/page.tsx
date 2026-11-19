'use client';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  APP_LOG_COLUMNS,
  appLogsToCsv,
  deviceSummary,
  kindLabel,
  levelLabel,
  searchText,
  sourceLabel,
  type AppLogLevel,
  type AppLogRow,
  type AppLogSource,
} from '@/lib/app-logs';
import { tKey } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';
import { supabase } from '@/lib/supabase';

const PERIODS = [
  { hours: 1, label: tKey('Laatste uur') },
  { hours: 24, label: tKey('Laatste 24 uur') },
  { hours: 24 * 7, label: tKey('Laatste 7 dagen') },
  { hours: 24 * 28, label: tKey('Laatste 28 dagen') },
] as const;
const LIMIT = 1000;

/**
 * Logboek met technische meldingen van alle events: fouten in de app, de
 * webapp en het beheer, zwak of weggevallen GPS, mislukte uploads en
 * verzoeken, met het toestel erbij. Los van de logging per event.
 */
export default function LoggingPage() {
  const { t, locale } = useLanguage();
  const [rows, setRows] = useState<AppLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState<number>(24);
  const [level, setLevel] = useState<AppLogLevel | 'problemen' | ''>('problemen');
  const [source, setSource] = useState<AppLogSource | ''>('');
  const [kind, setKind] = useState('');
  const [query, setQuery] = useState('');
  const [device, setDevice] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();
    const { data, error: e } = await supabase()
      .from('app_logs')
      .select(`${APP_LOG_COLUMNS}, sessions(name), teams(name)`)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    if (e) {
      setError(e.message);
      return;
    }
    setError(null);
    setRows(data as unknown as AppLogRow[]);
  }, [hours]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const time = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }),
    [locale],
  );
  const kinds = useMemo(() => [...new Set((rows ?? []).map((r) => r.kind))].sort((a, b) => kindLabel(a).localeCompare(kindLabel(b))), [rows]);

  const needle = query.trim().toLowerCase();
  const shown = (rows ?? []).filter(
    (r) =>
      (level === '' || (level === 'problemen' ? r.level !== 'info' : r.level === level)) &&
      (!source || r.source === source) &&
      (!kind || r.kind === kind) &&
      (!device || r.install_id === device) &&
      (!needle || searchText(r).includes(needle)),
  );
  const counts = {
    error: shown.filter((r) => r.level === 'error').length,
    warn: shown.filter((r) => r.level === 'warn').length,
    devices: new Set(shown.map((r) => r.install_id).filter(Boolean)).size,
  };

  const download = () => {
    const csv = appLogsToCsv(shown, (iso) => time.format(new Date(iso)));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t('logboek')}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const toggle = (id: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <h1>{t('Logging')}</h1>
      <p className="muted">
        {t('Technische meldingen van de app, de webapp en het beheer: fouten, zwak of weggevallen GPS, mislukte uploads en verbindingen, met het toestel erbij. Wat er per event in het spel gebeurde, staat bij het event onder Logging.')}
      </p>
      <div className="row logfilters">
        <select aria-label={t('Periode')} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          {PERIODS.map((p) => (
            <option key={p.hours} value={p.hours}>
              {t(p.label)}
            </option>
          ))}
        </select>
        <select aria-label={t('Ernst')} value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
          <option value="problemen">{t('Fouten en waarschuwingen')}</option>
          <option value="error">{t('Alleen fouten')}</option>
          <option value="warn">{t('Alleen waarschuwingen')}</option>
          <option value="info">{t('Alleen info')}</option>
          <option value="">{t('Alles')}</option>
        </select>
        <select aria-label={t('Bron')} value={source} onChange={(e) => setSource(e.target.value as AppLogSource | '')}>
          <option value="">{t('App, webapp en beheer')}</option>
          {(['app', 'webapp', 'spelleider', 'beheer'] as const).map((s) => (
            <option key={s} value={s}>
              {sourceLabel(s)}
            </option>
          ))}
        </select>
        <select aria-label={t('Soort')} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t('Alle soorten')}</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {kindLabel(k)}
            </option>
          ))}
        </select>
        <input type="search" placeholder={t('Zoeken…')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="secondary" onClick={() => void load()}>
          {t('Vernieuwen')}
        </button>
        <button className="secondary" onClick={download} disabled={shown.length === 0}>
          {t('Excel-export')}
        </button>
      </div>
      {device ? (
        <p>
          {t('Alleen toestel {id}', { id: device.slice(0, 8) })}{' '}
          <button className="link" onClick={() => setDevice(null)}>
            {t('Alle toestellen')}
          </button>
        </p>
      ) : null}
      {error ? <ul className="errors"><li>{error}</li></ul> : null}
      {rows === null && !error ? <p className="muted">{t('Laden…')}</p> : null}
      {rows !== null ? (
        <p className="muted">
          {t('{n} meldingen: {errors} fouten, {warnings} waarschuwingen, van {devices} toestellen.', {
            n: shown.length,
            errors: counts.error,
            warnings: counts.warn,
            devices: counts.devices,
          })}
          {rows.length >= LIMIT ? ` ${t('Alleen de nieuwste {n}; kies een kortere periode.', { n: LIMIT })}` : ''}
        </p>
      ) : null}
      {rows !== null && shown.length === 0 ? <p className="muted">{t('Geen meldingen in deze periode.')}</p> : null}
      {shown.length > 0 ? (
        <div className="table-wrap">
          <table className="eventlog applog">
            <tbody>
              {shown.map((r) => {
                const isOpen = open.has(r.id);
                const tone = r.level === 'error' ? 'bad' : r.level === 'warn' ? 'warn' : '';
                return (
                  <Fragment key={r.id}>
                    <tr className={`clickable ${tone}`} onClick={() => toggle(r.id)}>
                      <td className="logtime">{time.format(new Date(r.client_time ?? r.created_at))}</td>
                      <td className="logteam">
                        {r.session_id ? (
                          <Link href={`/sessies/${r.session_id}#logging`} onClick={(e) => e.stopPropagation()}>
                            {r.sessions?.name ?? t('Event')}
                          </Link>
                        ) : (
                          <span className="muted">{t('Geen event')}</span>
                        )}
                        {r.teams?.name ? <div className="muted">{r.teams.name}</div> : null}
                      </td>
                      <td className="logtext">
                        <span className="logkind">{levelLabel(r.level)}</span>{' '}
                        <span className="logkind">{sourceLabel(r.source)}</span> {kindLabel(r.kind)}
                        {r.repeat_count > 1 ? <strong> ×{r.repeat_count}</strong> : null}
                        {r.message ? <div className="logdetail">{r.message}</div> : null}
                        <div className="muted logdetail">{deviceSummary(r.device)}</div>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="details">
                        <td colSpan={3}>
                          {r.install_id ? (
                            <p>
                              {t('Toestel-id')}: <code>{r.install_id}</code>{' '}
                              <button className="link" onClick={() => setDevice(r.install_id)}>
                                {t('Alle meldingen van dit toestel')}
                              </button>
                            </p>
                          ) : null}
                          <p className="muted">
                            {t('Ontvangen')}: {time.format(new Date(r.created_at))}
                          </p>
                          <pre className="logjson">{JSON.stringify({ details: r.details, toestel: r.device }, null, 2)}</pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
