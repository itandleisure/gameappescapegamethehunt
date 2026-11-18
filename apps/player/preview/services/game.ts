import { GameController, type ControllerDeps } from '../../src/core/game-controller';
import { MemoryStore } from '../../src/core/types';
import { FakeBackend } from '../../test/fake-backend';
import { currentScene, previewGame, testImage } from '../scenes';

/**
 * Schermvoorbeeld: vervangt src/services/game.ts. Zelfde functies, maar met
 * een nepserver in het geheugen en een spel in de toestand van de scène.
 */
const { scene, img, long } = currentScene();

class PreviewBackend extends FakeBackend {
  override async serverTime() {
    return Date.now();
  }
}

const backend = new PreviewBackend(previewGame(scene, img, long), Date.now());
backend.testMode = scene === 'play';
backend.centralStart = scene === 'central';
let n = 0;
const deps: ControllerDeps = { backend, store: new MemoryStore(), newId: () => `voorbeeld-${++n}` };

let current: GameController | null = null;
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

let prepared: Promise<GameController | null> | null = null;
async function prepare(): Promise<GameController | null> {
  if (scene === 'join') return null;
  const teamName = long ? 'De Allerlangste Teamnaam Van Heel Nederland En Omstreken' : 'De Speurneuzen';
  const controller = await GameController.join(deps, 'LWD001', teamName, 'nl', '+31 6 12345678');
  if (scene === 'teamphoto') return controller;
  await controller.submitTeamPhoto(testImage(4000, 3000));
  if (scene === 'teamcode' || scene === 'central') return controller;
  await controller.start();
  if (long) backend.offline = true;
  await controller.tick();
  return controller;
}

export async function resumeGame(): Promise<GameController | null> {
  prepared ??= prepare();
  const controller = await prepared;
  if (controller && !current) setCurrent(controller);
  return current;
}

export async function joinGame(joinCode: string, teamName: string, language: string, phone: string) {
  setCurrent(await GameController.join(deps, joinCode, teamName, language, phone));
  return current!;
}

export async function rejoinGame(teamCode: string) {
  setCurrent(await GameController.rejoin(deps, teamCode));
  return current!;
}

export async function leaveGame() {
  await current?.leave();
  setCurrent(null);
}
