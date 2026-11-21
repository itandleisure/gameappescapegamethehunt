import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { GameController, type ControllerDeps } from '../core/game-controller';
import { msg } from '../core/i18n';
import { withIssueLog } from '../core/logged-backend';
import { SupabaseBackend } from '../core/supabase-backend';
import { alertHunter } from './alerts';
import { logIssue, setLogContext } from './diagnostics';
import { readFile } from './read-file';
import { supabase } from './supabase';

/**
 * Eén spel tegelijk per telefoon. De achtergrondtaak voor GPS en de schermen
 * gebruiken dezelfde controller.
 */
const deps: ControllerDeps = {
  // Mislukte verzoeken komen in het logboek (tabblad Logging in het beheer).
  backend: withIssueLog(new SupabaseBackend(supabase, readFile), logIssue),
  store: AsyncStorage,
  newId: () => Crypto.randomUUID(),
  // Hunter in de buurt: trillen, met het scherm uit via een melding op de telefoon.
  onHunterNear: (team) => {
    const radius = current?.hunterAlertRadius ?? 100;
    void alertHunter(msg(team.language, 'hunterNearNotice'), msg(team.language, 'hunterNearBody', { m: radius }));
  },
  // Team gepakt: trillen, met het scherm uit via een melding op de telefoon.
  onCaught: (team, notice) => {
    const lang = team.language;
    const title = msg(lang, notice.own ? 'caughtOwnTitle' : 'caughtTitle');
    const body = notice.own ? msg(lang, 'caughtOwnBody', { points: notice.points }) : msg(lang, 'caughtBody', { team: notice.teamName });
    void alertHunter(title, body);
  },
};

let current: GameController | null = null;
let resuming: Promise<GameController | null> | null = null;
const watchers = new Set<(controller: GameController | null) => void>();

function setCurrent(controller: GameController | null) {
  current = controller;
  if (controller) setLogContext({ teamId: controller.team.id, sessionId: controller.team.sessionId });
  else setLogContext({});
  for (const watch of watchers) watch(controller);
}

export function currentGame(): GameController | null {
  return current;
}

export function onGameChange(watch: (controller: GameController | null) => void): () => void {
  watchers.add(watch);
  return () => watchers.delete(watch);
}

/** Laadt een lopend spel na het (her)starten van de app of in de achtergrondtaak. */
export async function resumeGame(): Promise<GameController | null> {
  if (current) return current;
  resuming ??= GameController.resume(deps).finally(() => {
    resuming = null;
  });
  const controller = await resuming;
  if (controller && !current) {
    setCurrent(controller);
    // Herstart midden in het spel: helpt om crashes of een gestopte app te herkennen.
    logIssue('info', 'app_herstart', 'Spel hervat na (her)starten van de app');
  }
  return current;
}

export async function joinGame(joinCode: string, teamName: string, language: string, phone: string) {
  setCurrent(await GameController.join(deps, joinCode, teamName, language, phone));
  logIssue('info', 'aangemeld', 'Team aangemeld op dit toestel');
  return current!;
}

export async function rejoinGame(teamName: string, joinCode = '') {
  setCurrent(await GameController.rejoin(deps, teamName, joinCode));
  logIssue('info', 'aangemeld', 'Verder gespeeld op dit toestel (teamnaam)');
  return current!;
}

export async function leaveGame() {
  await current?.leave();
  setCurrent(null);
}
