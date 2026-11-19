import { gpsQuality } from './diagnostics';
import { currentGame, resumeGame } from './game';
import { currentLeader, resumeLeader, shareLeaderPosition } from './leader';

/**
 * Wat er met GPS-metingen gebeurt, in de app en in de webapp: bij een spel
 * gaan ze naar de spelregels (opdrachten openen op locatie), bij een
 * spelleider wordt de positie gedeeld met de andere spelleiders.
 */
export type Fix = { lat: number; lng: number; accuracy: number; at: number };

let lastFix: Fix | null = null;
const fixWatchers = new Set<(fix: Fix) => void>();

/** Laatste meting, voor de GPS-indicator op het scherm. */
export function onFix(watch: (fix: Fix) => void): () => void {
  fixWatchers.add(watch);
  if (lastFix) watch(lastFix);
  return () => fixWatchers.delete(watch);
}

function publish(fix: Fix) {
  lastFix = fix;
  for (const watch of fixWatchers) watch(fix);
}

/** Verwerkt metingen; `onOpened` als er daardoor een opdracht openging (trillen). */
export async function handleFixes(fixes: Fix[], onOpened: () => void): Promise<void> {
  // Spelleider: geen spel, alleen de positie delen met de andere spelleiders.
  const leader = currentLeader() ?? (currentGame() ? null : await resumeLeader());
  if (leader) {
    const latest = [...fixes].sort((a, b) => a.at - b.at).pop();
    if (!latest) return;
    gpsQuality.fix(latest.accuracy, latest.at, 50);
    publish(latest);
    await shareLeaderPosition(latest);
    return;
  }
  const game = currentGame() ?? (await resumeGame());
  if (!game) return;
  const sorted = [...fixes].sort((a, b) => a.at - b.at);
  const limit = game.game.gps?.maxAccuracy ?? 30;
  for (const fix of sorted) {
    // Zwak of weggevallen GPS komt in het logboek (tabblad Logging).
    gpsQuality.fix(fix.accuracy, fix.at, limit);
    publish(fix);
    const opened = await game.onLocation(fix);
    if (opened.length > 0) onOpened();
  }
  void game.tick();
}
