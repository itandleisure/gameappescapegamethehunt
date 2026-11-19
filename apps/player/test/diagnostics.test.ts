import { describe, expect, it } from 'vitest';
import { Diagnostics, GpsQuality, MAX_PENDING, SAME_ISSUE_EVERY_MS, type LogEntry } from '../src/core/diagnostics';
import { CLOCK_WARN_MS, withIssueLog } from '../src/core/logged-backend';
import { BackendError } from '../src/core/supabase-backend';
import type { Backend } from '../src/core/types';

function setup(fail = false) {
  let now = Date.UTC(2026, 10, 21, 12, 0, 0);
  const sent: LogEntry[][] = [];
  const memory = new Map<string, string>();
  const state = { fail };
  const d = new Diagnostics({
    send: async (entries) => {
      if (state.fail) throw new Error('offline');
      sent.push(entries);
    },
    store: { getItem: async (k) => memory.get(k) ?? null, setItem: async (k, v) => void memory.set(k, v) },
    now: () => now,
    device: () => ({ os: 'Android', osVersion: '14' }),
    installId: async () => 'toestel-1',
  });
  return { d, sent, memory, state, advance: (ms: number) => (now += ms) };
}

describe('logboek van de telefoon', () => {
  it('stuurt meldingen met toestel, team en hunt', async () => {
    const { d, sent } = setup();
    d.setContext({ source: 'webapp', teamId: 't1', sessionId: 's1' });
    d.log('warn', 'gps_zwak', 'GPS onnauwkeurig', { gemiddeld_m: 80 });
    await d.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]![0]).toMatchObject({
      source: 'webapp',
      level: 'warn',
      kind: 'gps_zwak',
      team_id: 't1',
      session_id: 's1',
      device: { os: 'Android' },
      install_id: 'toestel-1',
      count: 1,
    });
    expect(d.queued).toBe(0);
  });

  it('voegt dezelfde melding samen en bewaart hem zonder bereik', async () => {
    const { d, sent, memory, state } = setup(true);
    for (let i = 0; i < 40; i++) d.log('warn', 'antwoorden_versturen_mislukt', 'errorNetwork');
    await d.flush();
    expect(sent).toHaveLength(0);
    expect(d.queued).toBe(1);
    expect(memory.get('hunt.logboek')).toContain('"count":40');

    // Na herstarten van de app staat hij er nog; met bereik gaat hij weg.
    const again = new Diagnostics({ send: async (e) => void sent.push(e), store: { getItem: async (k) => memory.get(k) ?? null, setItem: async (k, v) => void memory.set(k, v) } });
    state.fail = false;
    await again.flush();
    expect(sent[0]![0]).toMatchObject({ kind: 'antwoorden_versturen_mislukt', count: 40 });
    expect(sent[0]![0]!.details).toHaveProperty('eerste');
  });

  it('stuurt dezelfde melding hooguit eens per 5 minuten', async () => {
    const { d, sent, advance } = setup();
    d.log('warn', 'gps_onderbroken', 'x');
    await d.flush();
    d.log('warn', 'gps_onderbroken', 'x');
    d.log('warn', 'gps_onderbroken', 'x');
    d.log('error', 'app_fout', 'boem');
    await d.flush();
    expect(sent.flat().map((e) => e.kind)).toEqual(['gps_onderbroken', 'app_fout']);
    advance(SAME_ISSUE_EVERY_MS);
    await d.flush();
    expect(sent.flat().at(-1)).toMatchObject({ kind: 'gps_onderbroken', count: 2 });
  });

  it('houdt de wachtrij klein en laat eerst info-meldingen vallen', () => {
    const { d } = setup(true);
    d.log('error', 'app_crash', 'belangrijk');
    for (let i = 0; i < MAX_PENDING + 20; i++) d.log('info', 'uit_beeld', `keer ${i}`);
    expect(d.queued).toBe(MAX_PENDING);
  });
});

describe('GPS-kwaliteit', () => {
  const T = Date.UTC(2026, 10, 21, 12, 0, 0);
  it('meldt zwak GPS pas na een minuut, één keer, en het herstel', () => {
    const logs: [string, string][] = [];
    const q = new GpsQuality((level, kind) => logs.push([level, kind]));
    for (let s = 0; s <= 120; s += 5) q.fix(80, T + s * 1000, 30);
    q.fix(8, T + 125_000, 30);
    expect(logs).toEqual([
      ['warn', 'gps_zwak'],
      ['info', 'gps_hersteld'],
    ]);
  });

  it('meldt niets bij een korte dip', () => {
    const logs: string[] = [];
    const q = new GpsQuality((_l, kind) => logs.push(kind));
    q.fix(80, T, 30);
    q.fix(80, T + 20_000, 30);
    q.fix(10, T + 25_000, 30);
    expect(logs).toEqual([]);
  });

  it('meldt een onderbreking van de metingen', () => {
    const logs: string[] = [];
    const q = new GpsQuality((_l, kind, message) => logs.push(`${kind}: ${message}`));
    q.fix(10, T, 30);
    q.fix(10, T + 200_000, 30);
    expect(logs).toEqual(['gps_onderbroken: 200 s geen GPS-meting']);
  });
});

describe('mislukte verzoeken', () => {
  const failing = (error: unknown) => async () => {
    throw error;
  };
  const backend = {
    ensureSignedIn: async () => undefined,
    sendEvents: failing(new BackendError('errorNetwork', { message: 'Failed to fetch' })),
    joinSession: failing(new BackendError('errorUnknownSession', { code: 'P0002', message: 'onbekende code' })),
    uploadPhoto: failing(new BackendError('errorGeneric', { message: 'Payload too large', status: 413 })),
    serverTime: async () => Date.UTC(2026, 0, 1),
  } as unknown as Backend;

  it('zet ze in het logboek met de juiste ernst', async () => {
    const logs: [string, string, string][] = [];
    const logged = withIssueLog(backend, (level, kind, message) => logs.push([level, kind, message]), () => Date.UTC(2026, 0, 1) + CLOCK_WARN_MS + 60_000);
    await logged.ensureSignedIn();
    await expect(logged.sendEvents('t', [])).rejects.toBeInstanceOf(BackendError);
    await expect(logged.joinSession('X', 'n', 'nl', '06')).rejects.toBeInstanceOf(BackendError);
    await expect(logged.uploadPhoto('t', { photoId: 'p', task: 'a', uri: 'x' } as never)).rejects.toBeInstanceOf(BackendError);
    await logged.serverTime();
    expect(logs).toEqual([
      ['warn', 'antwoorden_versturen_mislukt', 'errorNetwork: Failed to fetch'],
      ['info', 'aanmelden_mislukt', 'errorUnknownSession: onbekende code'],
      ['error', 'foto_upload_mislukt', 'errorGeneric: Payload too large'],
      ['warn', 'klok_afwijking', 'Klok van de telefoon wijkt 180 s af van de server'],
    ]);
  });
});
