import { GameController, type ControllerDeps } from '../../src/core/game-controller';
import { MemoryStore } from '../../src/core/types';
import { FakeBackend } from '../../test/fake-backend';
import { currentScene, previewGame, testImage } from '../scenes';

/**
 * Schermvoorbeeld: vervangt src/services/game.ts. Zelfde functies, maar met
 * een nepserver in het geheugen en een spel in de toestand van de scène.
 */
const { scene, img, long, code } = currentScene();

class PreviewBackend extends FakeBackend {
  override async serverTime() {
    return Date.now();
  }
}

const backend = new PreviewBackend(previewGame(scene, img, long, code), Date.now());
backend.testMode = scene === 'play';
backend.teamChat = scene === 'chat' || scene === 'play';
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
  if (scene === 'teamcode') return controller;
  await controller.start();
  if (scene === 'chat') {
    const lang = long ? ' Dit is een heel lang bericht om te zien of het netjes afbreekt op een klein scherm.'.repeat(4) : '';
    backend.postChat('team-9', long ? 'De Allerlangste Teamnaam Van Heel Nederland En Omstreken' : 'De Wolven', `Wie heeft de sleutel al gevonden?${lang}`);
    backend.postChat(null, null, 'Nog 20 minuten, zet hem op!');
    backend.postChat('team-8', 'Vossen', 'Wij zitten bij de Oldehove 🦊');
    await controller.refreshChat();
    if (long) for (let i = 1; i <= 12; i++) backend.postChat('team-8', 'Vossen', `Bericht ${i}`);
    await controller.refreshChat();
    await controller.sendChat(long ? `Wij zijn er bijna!${lang}` : 'Wij zijn er bijna!');
    if (long) backend.offline = true;
    else await controller.tick();
    return controller;
  }
  if (code) {
    // Een paar puzzels al opgelost, voor de blokjes met vinkjes bovenaan de opdrachten.
    await controller.answer('puzzel-tangram', { type: 'text', text: 'vluchtroute' });
    await controller.answer('puzzel-morse', { type: 'text', text: 'extractie' });
    await controller.answer('puzzel-stratenkaart', { type: 'text', text: 'Oldehove' });
  }
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

export async function rejoinGame(teamName: string, joinCode = '') {
  setCurrent(await GameController.rejoin(deps, teamName, joinCode));
  return current!;
}

export async function leaveGame() {
  await current?.leave();
  setCurrent(null);
}
