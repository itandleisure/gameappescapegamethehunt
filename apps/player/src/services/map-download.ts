import { DEFAULT_MAP_SOURCE, type GamePackage } from '@hunt/engine';
import { chooseMaxZoom, playAreaBounds } from '../core/play-area';
import { prepareMapProvider } from './map-provider';
import { IN_EXPO_GO } from './runtime';

type OfflineManagerType = typeof import('@maplibre/maplibre-react-native').OfflineManager;

/** De native kaartmodule ontbreekt in Expo Go; daar wordt niets gedownload. */
function offlineManager(): OfflineManagerType | null {
  if (IN_EXPO_GO) return null;
  return (require('@maplibre/maplibre-react-native') as typeof import('@maplibre/maplibre-react-native')).OfflineManager;
}

/**
 * Downloadt alleen het speelveld van deze sessie (enkele MB) zodat de kaart
 * ook werkt in steegjes zonder bereik. Na afloop wordt het weer verwijderd.
 * Zie docs/ontwerp.md §2.1.
 */

const packName = (sessionId: string) => `speelveld-${sessionId}`;
const MIN_ZOOM = 12;

export function mapStyleUrl(game: GamePackage): string {
  return game.map?.styleUrl ?? DEFAULT_MAP_SOURCE.styleUrl;
}

export async function downloadPlayArea(
  sessionId: string,
  game: GamePackage,
  onProgress: (percent: number) => void,
): Promise<void> {
  const bounds = playAreaBounds(game);
  const OfflineManager = offlineManager();
  // Downloaden bij dezelfde kaartdienst als waar de kaart straks uit leest.
  await prepareMapProvider();
  if (!bounds || !OfflineManager) return;
  const name = packName(sessionId);
  const existing = (await OfflineManager.getPacks()).find((p) => (p.metadata as { name?: string } | undefined)?.name === name);
  if (existing) {
    onProgress(100);
    return;
  }
  await OfflineManager.createPack(
    {
      mapStyle: mapStyleUrl(game),
      bounds,
      minZoom: MIN_ZOOM,
      maxZoom: chooseMaxZoom(bounds, MIN_ZOOM),
      metadata: { name },
    },
    (_pack, status) => onProgress(Math.round(status.percentage)),
    () => undefined,
  );
}

/** Verwijdert de kaarten van eerdere sessies. */
export async function removePlayAreas(keepSessionId?: string): Promise<void> {
  const OfflineManager = offlineManager();
  if (!OfflineManager) return;
  const keep = keepSessionId ? packName(keepSessionId) : undefined;
  for (const pack of await OfflineManager.getPacks()) {
    const name = (pack.metadata as { name?: string } | undefined)?.name;
    if (name?.startsWith('speelveld-') && name !== keep) await OfflineManager.deletePack(pack.id);
  }
}
