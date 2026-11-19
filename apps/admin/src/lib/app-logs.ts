// Technische meldingen uit de speler-app, de webapp en het beheer (tabel
// app_logs): fouten, zwak GPS, mislukte verzoeken, met het toestel erbij.
import { t as tr, tKey } from './i18n';

export type AppLogLevel = 'error' | 'warn' | 'info';
export type AppLogSource = 'app' | 'webapp' | 'spelleider' | 'beheer';

export interface AppLogRow {
  id: number;
  created_at: string;
  client_time: string | null;
  source: AppLogSource;
  level: AppLogLevel;
  kind: string;
  message: string;
  details: Record<string, unknown>;
  device: Record<string, unknown>;
  install_id: string | null;
  session_id: string | null;
  team_id: string | null;
  repeat_count: number;
  sessions?: { name: string } | null;
  teams?: { name: string } | null;
}

export const APP_LOG_COLUMNS =
  'id, created_at, client_time, source, level, kind, message, details, device, install_id, session_id, team_id, repeat_count';

/** Leesbare naam per soort melding. Onbekende soorten tonen hun code. */
const KINDS: Record<string, string> = {
  gps_zwak: tKey('Zwak GPS-signaal'),
  gps_hersteld: tKey('GPS weer goed'),
  gps_onderbroken: tKey('GPS onderbroken'),
  gps_fout: tKey('GPS-fout'),
  gps_uit: tKey('Locatie staat uit'),
  gps_achtergrond_fout: tKey('GPS op de achtergrond mislukt'),
  locatie_geweigerd: tKey('Locatietoestemming geweigerd'),
  locatie_alleen_voorgrond: tKey('Locatie alleen met app open'),
  uit_beeld: tKey('Webapp uit beeld'),
  inloggen_mislukt: tKey('Inloggen mislukt'),
  aanmelden_mislukt: tKey('Aanmelden mislukt'),
  spelleider_inloggen_mislukt: tKey('Spelleider inloggen mislukt'),
  starten_mislukt: tKey('Starten mislukt'),
  foto_upload_mislukt: tKey('Foto uploaden mislukt'),
  antwoorden_versturen_mislukt: tKey('Antwoorden versturen mislukt'),
  gps_versturen_mislukt: tKey('GPS-route versturen mislukt'),
  positie_delen_mislukt: tKey('Positie spelleider delen mislukt'),
  spel_laden_mislukt: tKey('Spel laden mislukt'),
  chat_versturen_mislukt: tKey('Chatbericht versturen mislukt'),
  verzoek_mislukt: tKey('Verzoek aan de server mislukt'),
  klok_afwijking: tKey('Klok van de telefoon wijkt af'),
  kaart_downloaden_mislukt: tKey('Kaart downloaden mislukt'),
  laden_mislukt: tKey('Bestand laden mislukt'),
  scherm_aan_mislukt: tKey('Scherm aan houden mislukt'),
  app_crash: tKey('App gecrasht'),
  app_fout: tKey('Fout in de app'),
  scherm_crash: tKey('Scherm gecrasht'),
  webapp_fout: tKey('Fout in de webapp'),
  beheer_fout: tKey('Fout in het beheer'),
  app_herstart: tKey('App herstart tijdens het spel'),
  aangemeld: tKey('Aangemeld op toestel'),
  offline: tKey('Geen internet'),
  online: tKey('Weer internet'),
};

export function kindLabel(kind: string): string {
  const label = KINDS[kind];
  return label ? tr(label) : kind;
}

export function levelLabel(level: AppLogLevel): string {
  switch (level) {
    case 'error':
      return tr('Fout');
    case 'warn':
      return tr('Waarschuwing');
    case 'info':
      return tr('Info');
  }
}

export function sourceLabel(source: AppLogSource): string {
  switch (source) {
    case 'app':
      return tr('App');
    case 'webapp':
      return tr('Webapp');
    case 'spelleider':
      return tr('Spelleider');
    case 'beheer':
      return tr('Beheer');
  }
}

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

/** Kort: "Android 14 · SM-A525F · Chrome 131" of "iOS 17.5 · app 1.2.0". */
export function deviceSummary(device: Record<string, unknown> | null | undefined): string {
  if (!device) return '';
  const os = [str(device.os), str(device.osVersion)].filter(Boolean).join(' ');
  const model = [str(device.merk), str(device.model)].filter(Boolean).join(' ');
  const app = str(device.browser) || (str(device.app) ? `app ${str(device.app)}` : '');
  return [os, model, app].filter(Boolean).join(' · ');
}

/** Tekst om in te zoeken: soort, bericht, toestel, hunt en team. */
export function searchText(row: AppLogRow): string {
  return [kindLabel(row.kind), row.kind, row.message, deviceSummary(row.device), row.sessions?.name, row.teams?.name, row.install_id]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Als CSV voor Excel, oudste eerst. */
export function appLogsToCsv(rows: readonly AppLogRow[], time: (iso: string) => string): string {
  const cell = (v: unknown) => {
    const s = v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [tr('Tijd'), tr('Ernst'), tr('Bron'), tr('Soort'), tr('Melding'), tr('Aantal'), tr('Event'), tr('Team'), tr('Toestel'), tr('Toestel-id'), tr('Details')];
  const lines = [...rows]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) =>
      [
        time(r.client_time ?? r.created_at),
        levelLabel(r.level),
        sourceLabel(r.source),
        kindLabel(r.kind),
        r.message,
        r.repeat_count,
        r.sessions?.name ?? '',
        r.teams?.name ?? '',
        deviceSummary(r.device),
        r.install_id ?? '',
        r.details,
      ]
        .map(cell)
        .join(';'),
    );
  return `﻿${[head.join(';'), ...lines].join('\n')}`;
}
