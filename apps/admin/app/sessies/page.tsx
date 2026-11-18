'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import {
  formatInZone,
  STATUS_LABEL,
  TIMEZONES,
  toJoinCode,
  validateSession,
  zonedToUtc,
  type SessionInput,
  type SessionStatus,
} from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { tx } from '@/lib/text';

interface SessionRow {
  id: string;
  name: string;
  join_code: string;
  status: SessionStatus;
  test_mode: boolean;
  track_count: number;
  starts_at: string | null;
  timezone: string;
  game_versions: { version: number; name: unknown } | null;
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
  centralStart: true,
  joinCode: '',
};

export default function SessionsPage() {
  const { org } = useAuth();
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
        .select('id, name, join_code, status, test_mode, track_count, starts_at, timezone, game_versions(version, name:package->name)')
        .eq('org_id', org.id)
        .order('created_at', { ascending: false }),
      db.from('game_versions').select('id, game_id, version, name:package->name').order('version', { ascending: false }),
    ]);
    if (s.error || v.error) {
      setErrors([(s.error ?? v.error)!.message]);
      return;
    }
    setSessions(s.data as unknown as SessionRow[]);
    // Per spel alleen de nieuwste versie aanbieden.
    const seen = new Set<string>();
    const options: VersionOption[] = [];
    for (const row of v.data as { id: string; game_id: string; version: number; name: unknown }[]) {
      if (seen.has(row.game_id)) continue;
      seen.add(row.game_id);
      options.push({ id: row.id, label: `${tx(row.name)} (v${row.version})` });
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
        central_start: form.centralStart ?? false,
        status: 'open',
        ...(form.joinCode?.trim() ? { join_code: form.joinCode.trim().toUpperCase() } : {}),
      });
    setBusy(false);
    if (error) {
      setErrors([/join_code/.test(error.message) ? 'Deze hunt-code is al in gebruik. Kies een andere.' : error.message]);
      return;
    }
    setForm({ ...EMPTY, gameVersionId: form.gameVersionId });
    setShowForm(false);
    await load();
  };

  const setStatus = async (id: string, status: SessionStatus) => {
    const { error } = await supabase().from('sessions').update({ status }).eq('id', id);
    if (error) setErrors([error.message]);
    await load();
  };

  return (
    <>
      <h1>Hunts</h1>
      <p className="muted">
        Een hunt is één spel op één moment, bijvoorbeeld een bedrijfsuitje. Teams doen mee met de hunt-code, zolang de
        hunt open staat. In testmodus kunnen opdrachten in de app geopend worden zonder ter plekke te zijn.
      </p>

      {!showForm ? (
        <div className="actions">
          <button onClick={() => setShowForm(true)} disabled={versions.length === 0}>
            Nieuwe hunt
          </button>
          {versions.length === 0 && sessions !== null ? (
            <span className="muted">Publiceer eerst een spel onder Spellen.</span>
          ) : null}
        </div>
      ) : (
        <form className="card" onSubmit={create}>
          <div className="row">
            <div>
              <label htmlFor="name">Naam</label>
              <input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bedrijfsuitje Parteon" />
            </div>
            <div>
              <label htmlFor="code">Hunt-code (optioneel)</label>
              <input
                id="code"
                value={form.joinCode ?? ''}
                maxLength={12}
                onChange={(e) => setForm({ ...form, joinCode: toJoinCode(e.target.value) })}
                placeholder="bijv. PARTEON (leeg = 5 willekeurige tekens)"
              />
              {form.name.trim() && toJoinCode(form.name) !== (form.joinCode ?? '') && toJoinCode(form.name).length >= 4 ? (
                <button type="button" className="link small" onClick={() => setForm({ ...form, joinCode: toJoinCode(form.name) })}>
                  Gebruik {toJoinCode(form.name)}
                </button>
              ) : null}
            </div>
            <div>
              <label htmlFor="game">Spel</label>
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
              <label htmlFor="start">Start (optioneel)</label>
              <input id="start" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </div>
            <div>
              <label htmlFor="tz">Tijdzone</label>
              <select id="tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {TIMEZONES.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tracks">Tracks</label>
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
            Testmodus
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.centralStart ?? false}
              onChange={(e) => setForm({ ...form, centralStart: e.target.checked })}
            />
            Centrale start: teams lezen eerst de speluitleg, daarna start de spelleider het spel voor iedereen tegelijk
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
              Hunt aanmaken
            </button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>
              Annuleren
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

      <h2>Overzicht</h2>
      {sessions === null ? (
        <p className="muted">Laden…</p>
      ) : sessions.length === 0 ? (
        <p className="muted">Nog geen hunts.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hunt</th>
                <th>Hunt-code</th>
                <th>Start</th>
                <th>Status</th>
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
                      {s.game_versions ? `${tx(s.game_versions.name)} v${s.game_versions.version}` : ''} · {s.track_count} tracks
                    </div>
                  </td>
                  <td className="code">{s.join_code}</td>
                  <td>{formatInZone(s.starts_at, s.timezone)}</td>
                  <td>
                    <span className={`badge ${s.status === 'open' ? 'open' : ''}`}>{STATUS_LABEL[s.status]}</span>{' '}
                    {s.test_mode ? <span className="badge test">Test</span> : null}
                  </td>
                  <td>
                    <div className="actions" style={{ marginTop: 0, flexWrap: 'nowrap' }}>
                    <Link href={`/sessies/${s.id}`} className="buttonlink">
                      Live &amp; resultaten
                    </Link>
                    {s.status !== 'open' ? (
                      <button className="secondary" onClick={() => void setStatus(s.id, 'open')}>
                        Openen
                      </button>
                    ) : (
                      <button className="secondary" onClick={() => void setStatus(s.id, 'closed')}>
                        Sluiten
                      </button>
                    )}
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
