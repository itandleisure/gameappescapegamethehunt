import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { Diagnostics, GpsQuality, type LogLevel } from '../core/diagnostics';
import { deviceInfo } from './device';
import { supabase } from './supabase';

/**
 * Het logboek van deze telefoon (tabblad Logging in het beheer). Meldingen
 * gaan elke halve minuut mee, en meteen bij een fout.
 */
const INSTALL_KEY = 'hunt.installatie';

export const diagnostics = new Diagnostics({
  send: async (entries) => {
    const { error } = await supabase.rpc('log_app_issues', { p_entries: entries });
    if (error) throw error;
  },
  store: AsyncStorage,
  device: deviceInfo,
  installId: async () => {
    const saved = await AsyncStorage.getItem(INSTALL_KEY);
    if (saved) return saved;
    const id = Crypto.randomUUID();
    await AsyncStorage.setItem(INSTALL_KEY, id);
    return id;
  },
});

const PLAYER_SOURCE = Platform.OS === 'web' ? 'webapp' : 'app';
diagnostics.setContext({ source: PLAYER_SOURCE });

/** Speler of spelleider: zet bij welk team en welke hunt de meldingen horen. */
export function setLogContext(context: { leader?: boolean; teamId?: string | null; sessionId?: string | null }) {
  diagnostics.setContext({
    source: context.leader ? 'spelleider' : PLAYER_SOURCE,
    teamId: context.teamId ?? null,
    sessionId: context.sessionId ?? null,
  });
}

export function logIssue(level: LogLevel, kind: string, message = '', details?: Record<string, unknown>) {
  diagnostics.log(level, kind, message, details);
  if (level === 'error') void diagnostics.flush();
}

export function logError(kind: string, error: unknown, details?: Record<string, unknown>, level: LogLevel = 'error') {
  diagnostics.error(kind, error, details, level);
  if (level === 'error') void diagnostics.flush();
}

/** GPS-kwaliteit van deze telefoon (zwak signaal, onderbrekingen). */
export const gpsQuality = new GpsQuality(logIssue);

let started = false;
/** Start het versturen: elke 30 seconden, en bij terugkomen in de app. */
export function startDiagnostics() {
  if (started) return;
  started = true;
  void diagnostics.load().then(() => diagnostics.flush());
  setInterval(() => void diagnostics.flush(), 30_000);
}
