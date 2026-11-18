import { chooseMapRewrites, rewriteMapUrl } from '@hunt/engine';

let loading: Promise<typeof import('maplibre-gl')> | null = null;

/**
 * Laadt MapLibre in de browser, met de web worker uit public/maplibre/
 * (zie scripts/copy-maplibre-worker.mjs). Zonder dit tekent de kaart niets.
 *
 * Met NEXT_PUBLIC_MAPTILER_KEY halen alle kaarten hun tegels bij MapTiler;
 * zonder sleutel, of als MapTiler niet reageert, bij OpenFreeMap. De kaart-
 * stijlen blijven hetzelfde (zie packages/engine/src/map-provider.ts).
 */
export function loadMaplibre(): Promise<typeof import('maplibre-gl')> {
  loading ??= (async () => {
    const [lib, rewrites] = await Promise.all([import('maplibre-gl'), chooseMapRewrites(process.env.NEXT_PUBLIC_MAPTILER_KEY)]);
    lib.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
    if (!rewrites.length) return lib;
    class MapWithProvider extends lib.Map {
      constructor(options: ConstructorParameters<typeof lib.Map>[0]) {
        super({ transformRequest: (url) => ({ url: rewriteMapUrl(url, rewrites) }), ...options });
      }
    }
    return { ...lib, Map: MapWithProvider } as typeof lib;
  })().catch((e: unknown) => {
    loading = null; // volgende keer opnieuw proberen
    throw e;
  });
  return loading;
}
