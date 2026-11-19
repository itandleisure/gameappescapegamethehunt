import { describe, expect, it } from 'vitest';
import { appLogsToCsv, deviceSummary, kindLabel, searchText, type AppLogRow } from '../src/lib/app-logs.js';

const row = (over: Partial<AppLogRow> = {}): AppLogRow => ({
  id: 1,
  created_at: '2026-11-21T12:00:05Z',
  client_time: '2026-11-21T12:00:00Z',
  source: 'webapp',
  level: 'warn',
  kind: 'gps_zwak',
  message: 'GPS onnauwkeurig: gemiddeld 85 m (grens 30 m)',
  details: { gemiddeld_m: 85 },
  device: { os: 'Android', osVersion: '14', model: 'SM-A525F', browser: 'Chrome 131' },
  install_id: 'abc',
  session_id: 's1',
  team_id: 't1',
  repeat_count: 2,
  sessions: { name: 'Leeuwarden 21-11' },
  teams: { name: 'Vossen' },
  ...over,
});

describe('logboek met technische meldingen', () => {
  it('vat het toestel kort samen', () => {
    expect(deviceSummary(row().device)).toBe('Android 14 · SM-A525F · Chrome 131');
    expect(deviceSummary({ os: 'iOS', osVersion: '17.5', app: '1.2.0', model: 'phone' })).toBe('iOS 17.5 · phone · app 1.2.0');
    expect(deviceSummary({})).toBe('');
  });

  it('geeft soorten een leesbare naam en laat onbekende staan', () => {
    expect(kindLabel('gps_zwak')).toBe('Zwak GPS-signaal');
    expect(kindLabel('iets_nieuws')).toBe('iets_nieuws');
  });

  it('zoekt in soort, toestel, event en team', () => {
    const text = searchText(row());
    for (const word of ['zwak gps', 'sm-a525f', 'leeuwarden', 'vossen']) expect(text).toContain(word);
  });

  it('maakt een CSV', () => {
    const csv = appLogsToCsv([row(), row({ id: 2, created_at: '2026-11-21T11:00:00Z', client_time: null, level: 'error', kind: 'app_crash', message: 'a;b' })], (iso) => iso);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('App gecrasht');
    expect(lines[1]).toContain('"a;b"');
    expect(lines[2]).toContain('Vossen');
  });
});
