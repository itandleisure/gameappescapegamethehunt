/**
 * Laadt MapLibre in de browser, met de web worker uit public/maplibre/
 * (zie scripts/copy-maplibre-worker.mjs). Zonder dit tekent de kaart niets.
 */
export async function loadMaplibre(): Promise<typeof import('maplibre-gl')> {
  const lib = await import('maplibre-gl');
  lib.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
  return lib;
}
