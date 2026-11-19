'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/language';
import {
  formatInZone,
  TIMEZONES,
  toJoinCode,
  validateSession,
  zonedToUtc,
  type SessionInput,
  type SessionStatus,
} from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { DeleteSession } from '@/results/DeleteSession';
import { OpenToggle } from '@/results/OpenToggle';
import { tx } from '@/lib/text';
import { displayName } from '@/lib/game-name';

type GameRef = { layer: 'base' | 'city' | 'client'; slug: string; settings: Record<string, unknown> } | null;

/**
 * Spel van een versie zoals de beheerder het kent: de naam in de app, en bij
 * een stad of klant de huidige naam van die variant erachter.
 */
function versionLabel(v: { version: number; name: unknown; games?: GameRef }): string {
  const name = tx(v.name);
  const variant = v.games && v.games.layer !== 'base' ? displayName(v.games) : '';
  return `${name}${variant && variant !== name ? ` · ${variant}` : ''} (v${v.version})`;
}

interface SessionRow {
  id: string;
  name: string;
  join_code: string;
  status: SessionStatus;
  test_mode: boolean;
  track_count: number;
  starts_at: string | null;
  timezone: string;
  game_versions: { version: number; name: unknown; games?: GameRef } | null;
  teams: { count: number }[];
}

interface VersionOption {
  id: string;
  label: string;
}

const EMPTY: SessionInput = {
  name: '',
  gameVersionId: '',
  startsAt: '',
  timezone: 'Europe/Amsterdam',
  trackCount: 5,
  testMode: false,
  teamChat: false,
  joinCode: '',
};

export default function SessionsPage() {
  const { org } = useAuth();
  const t = useT();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [versions, setVersions] = useState<VersionOption[]>([]);
  const [form, setForm] = useState<SessionInput>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!org) return;
    const db = supabase();
    const [s, v] = await Promise.all([
      db
        .from('sessions')
        .select('id, name, join_code, status, test_mode, track_count, starts_at, timezone, teams(count), game_versions(version, name:package->name, games(layer, slug, settings))')
        .eq('org_id', org.id)
        .order('created_at', { ascending: false }),
      db.from('game_versions').select('id, game_id, version, name:package->name, games(layer, slug, settings)').order('version', { ascending: false }),
    ]);
    if (s.error || v.error) {
      setErrors([(s.error ?? v.error)!.message]);
      return;
    }
    setSessions(s.data as unknown as SessionRow[]);
    // Per spel alleen de nieuwste versie aanbieden.
    const seen = new Set<string>();
    const options: VersionOption[] = [];
    for (const row of v.data as unknown as { id: string; game_id: string; version: number; name: unknown; games?: GameRef }[]) {
      if (seen.has(row.game_id)) continue;
      // Hunts spelen met een stad of klantspel; een template heeft templateversies.
      if (row.games?.layer === 'base') continue;
      seen.add(row.game_id);
      options.push({ id: row.id, label: versionLabel(row) });
    }
    setVersions(options);
    setForm((f) => (f.gameVersionId || !options[0] ? f : { ...f, gameVersionId: options[0].id }));
  }, [org]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!org) return;
    const problems = validateSession(form);
    setErrors(problems);
    if (problems.length > 0) return;
    setBusy(true);
    const { error } = await supabase()
      .from('sessions')
      .insert({
        org_id: org.id,
        game_version_id: form.gameVersionId,
        name: form.name.trim(),
        starts_at: form.startsAt ? zonedToUtc(form.startsAt, form.timezone) : null,
        timezone: form.timezone,
        track_count: form.trackCount,
        test_mode: form.testMode,
        team_chat: form.teamChat ?? false,
        status: 'open',
        ...(form.joinCode?.trim() ? { join_code: form.joinCode.trim().toUpperCase() } : {}),
      });
    setBusy(false);
    if (error) {
      setErrors([/join_code/.test(error.message) ? t('Deze ticketcode is al in gebruik. Kies een andere.') : error.message]);
      return;
    }
    setForm({ ...EMPTY, gameVersionId: form.gameVersionId });
    setShowForm(false);
    await load();
  };

  return (
    <>
      <h1>{t('Tickets')}</h1>
      <p className="muted">
        {t('Een ticket is één spel op één moment, bijvoorbeeld een bedrijfsuitje. Teams doen mee met de ticketcode, zolang het ticket open staat. In testmodus kunnen opdrachten in de app geopend worden zonder ter plekke te zijn.')}
      </p>

      {!showForm ? (
        <div className="actions">
          <button onClick={() => setShowForm(true)} disabled={versions.length === 0}>
            {t('Nieuw ticket')}
          </button>
          {versions.length === 0 && sessions !== null ? (
            <span className="muted">{t('Publiceer eerst een spel onder Spellen.')}</span>
          ) : null}
        </div>
      ) : (
        <form className="card" onSubmit={create}>
          <div className="row">
            <div>
              <label htmlFor="name">{t('Naam')}</label>
              <input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('Bedrijfsuitje Parteon')} />
            </div>
            <div>
              <label htmlFor="code">{t('Ticketcode (optioneel)')}</label>
              <input
                id="code"
                value={form.joinCode ?? ''}
                maxLength={12}
                onChange={(e) => setForm({ ...form, joinCode: toJoinCode(e.target.value) })}
                placeholder={t('bijv. PARTEON (leeg = 5 willekeurige tekens)')}
              />
              {form.name.trim() && toJoinCode(form.name) !== (form.joinCode ?? '') && toJoinCode(form.name).length >= 4 ? (
                <button type="button" className="link small" onClick={() => setForm({ ...form, joinCode: toJoinCode(form.name) })}>
                  {t('Gebruik {code}', { code: toJoinCode(form.name) })}
                </button>
              ) : null}
            </div>
            <div>
              <label htmlFor="game">{t('Spel')}</label>
              <select id="game" value={form.gameVersionId} onChange={(e) => setForm({ ...form, gameVersionId: e.target.value })}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <div>
              <label htmlFor="start">{t('Start (optioneel)')}</label>
              <input id="start" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </div>
            <div>
              <label htmlFor="tz">{t('Tijdzone')}</label>
              <select id="tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {TIMEZONES.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tracks">{t('Tracks')}</label>
              <input
                id="tracks"
                type="number"
                min={1}
                max={50}
                value={form.trackCount}
                onChange={(e) => setForm({ ...form, trackCount: Number(e.target.value) })}
              />
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.testMode} onChange={(e) => setForm({ ...form, testMode: e.target.checked })} />
            {t('Testmodus')}
          </label>
          <label className="check">
            <input type="checkbox" checked={form.teamChat ?? false} onChange={(e) => setForm({ ...form, teamChat: e.target.checked })} />
            {t('Teamchat: teams kunnen elkaar berichten sturen, de spelleiding leest mee (ook later aan of uit te zetten)')}
          </label>
          {errors.length > 0 ? (
            <ul className="errors">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}
          <div className="actions">
            <button type="submit" disabled={busy}>
              {t('Ticket aanmaken')}
            </button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>
              {t('Annuleren')}
            </button>
          </div>
        </form>
      )}

      {!showForm && errors.length > 0 ? (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}

      <h2>{t('Overzicht')}</h2>
      {sessions === null ? (
        <p className="muted">{t('Laden…')}</p>
      ) : sessions.length === 0 ? (
        <p className="muted">{t('Nog geen tickets.')}</p>
      ) : (
        <div className="table-wrap">
          <table className="stack">
            <thead>
              <tr>
                <th>{t('Ticket')}</th>
                <th>{t('Ticketcode')}</th>
                <th>{t('Start')}</th>
                <th>{t('Status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/sessies/${s.id}`}>
                      <strong>{s.name}</strong>
                    </Link>
                    <div className="muted">
                      {s.game_versions ? versionLabel(s.game_versions) : ''} · {t('{n} tracks', { n: s.track_count })}
                    </div>
                  </td>
                  <td className="code" data-label={t('Ticketcode')}>{s.join_code}</td>
                  <td data-label={t('Start')}>{formatInZone(s.starts_at, s.timezone)}</td>
                  <td data-label={t('Status')}>
                    <OpenToggle id={s.id} status={s.status} onChange={() => void load()} />{' '}
                    {s.test_mode ? <span className="badge test">{t('Test')}</span> : null}
                  </td>
                  <td>
                    <div className="actions" style={{ marginTop: 0, flexWrap: 'wrap' }}>
                    <Link href={`/sessies/${s.id}`} className="buttonlink">
                      {t('Live & resultaten')}
                    </Link>
                    {org?.role !== 'instructor' ? (
                      <DeleteSession id={s.id} name={s.name} teamCount={s.teams?.[0]?.count ?? 0} onDeleted={() => void load()} short />
                    ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
