import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { LeaderApi, type LeaderLogin } from '../core/leader';
import { logError, logIssue, setLogContext } from './diagnostics';
import { supabase } from './supabase';

/**
 * Spelleider op deze telefoon. Bewaard, zodat de spelleider na het herstarten
 * van de app (of in de achtergrondtaak voor GPS) ingelogd blijft.
 */
const KEY = 'hunt.spelleider';
/** Zo vaak stuurt de app de positie van de spelleider hooguit. */
const POSITION_EVERY_MS = 10_000;

export const leaderApi = new LeaderApi(supabase);

let current: LeaderLogin | null = null;
let loaded = false;
const watchers = new Set<(login: LeaderLogin | null) => void>();

function setCurrent(login: LeaderLogin | null) {
  current = login;
  if (login) setLogContext({ leader: true, sessionId: login.sessionId });
  else if (loaded) setLogContext({});
  loaded = true;
  for (const watch of watchers) watch(login);
}

export function currentLeader(): LeaderLogin | null {
  return current;
}

export async function resumeLeader(): Promise<LeaderLogin | null> {
  if (loaded) return current;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const login = raw ? (JSON.parse(raw) as LeaderLogin) : null;
    if (!loaded) setCurrent(login);
  } catch {
    if (!loaded) setCurrent(null);
  }
  return current;
}

export async function joinAsLeader(code: string, name: string): Promise<LeaderLogin> {
  let login: LeaderLogin;
  try {
    login = await leaderApi.join(code, name);
  } catch (error) {
    logError('spelleider_inloggen_mislukt', error, undefined, 'warn');
    throw error;
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(login));
  setCurrent(login);
  logIssue('info', 'aangemeld', 'Spelleider ingelogd op dit toestel');
  return login;
}

/** Uitloggen. Lukt het afmelden bij de server niet (geen bereik), dan toch lokaal uitloggen. */
export async function leaveLeader() {
  const login = current;
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
  setCurrent(null);
  if (login) await leaderApi.leave(login.sessionId).catch(() => undefined);
}

let lastSent = 0;
let sending = false;

/** Positie van de spelleider delen, hooguit elke 10 seconden. */
export async function shareLeaderPosition(fix: { lat: number; lng: number; accuracy: number; at: number }) {
  const login = current;
  if (!login || sending || fix.at - lastSent < POSITION_EVERY_MS) return;
  sending = true;
  try {
    await leaderApi.position(login.sessionId, fix);
    lastSent = fix.at;
  } catch (error) {
    // Geen bereik: de volgende meting probeert het opnieuw.
    logError('positie_delen_mislukt', error, undefined, 'warn');
  } finally {
    sending = false;
  }
}

/** Ingelogde spelleider voor de schermen; loading tot de opgeslagen login gelezen is. */
export function useLeader(): { loading: boolean; leader: LeaderLogin | null } {
  const [state, setState] = useState({ loading: !loaded, leader: current });
  useEffect(() => {
    const watch = (leader: LeaderLogin | null) => setState({ loading: false, leader });
    watchers.add(watch);
    void resumeLeader().then((leader) => setState({ loading: false, leader }));
    return () => {
      watchers.delete(watch);
    };
  }, []);
  return state;
}
