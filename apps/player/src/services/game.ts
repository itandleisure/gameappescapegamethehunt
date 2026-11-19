import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { GameController, type ControllerDeps } from '../core/game-controller';
import { SupabaseBackend } from '../core/supabase-backend';
import { supabase } from './supabase';

/**
 * Eén spel tegelijk per telefoon. De achtergrondtaak voor GPS en de schermen
 * gebruiken dezelfde controller.
 */
const deps: ControllerDeps = {
  backend: new SupabaseBackend(supabase, (uri) => new File(uri).arrayBuffer()),
  store: AsyncStorage,
  newId: () => Crypto.randomUUID(),
};

let current: GameController | null = null;
let resuming: Promise<GameController | null> | null = null;
const watchers = new Set<(controller: GameController | null) => void>();

function setCurrent(controller: GameController | null) {
  current = controller;
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
  if (controller && !current) setCurrent(controller);
  return current;
}

export async function joinGame(joinCode: string, teamName: string, language: string, phone: string) {
  setCurrent(await GameController.join(deps, joinCode, teamName, language, phone));
  return current!;
}

export async function rejoinGame(teamName: string, joinCode = '') {
  setCurrent(await GameController.rejoin(deps, teamName, joinCode));
  return current!;
}

export async function leaveGame() {
  await current?.leave();
  setCurrent(null);
}
