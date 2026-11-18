import { chooseMapRewrites, type UrlRewrite } from '@hunt/engine';
import { MAPTILER_KEY } from '../config';
import { IN_EXPO_GO } from './runtime';

let ready: Promise<UrlRewrite[]> | null = null;
let current: UrlRewrite[] = [];

/**
 * Kiest bij het opstarten de kaartdienst: MapTiler als er een sleutel is en
 * MapTiler antwoordt, anders OpenFreeMap. In de echte app zet MapLibre daarna
 * zelf alle adressen om, ook voor het vooraf downloaden van het speelveld.
 * Zie packages/engine/src/map-provider.ts.
 */
export function prepareMapProvider(): Promise<UrlRewrite[]> {
  ready ??= chooseMapRewrites(MAPTILER_KEY).then((rewrites) => {
    current = rewrites;
    if (rewrites.length && !IN_EXPO_GO) {
      const { TransformRequestManager } = require('@maplibre/maplibre-react-native') as typeof import('@maplibre/maplibre-react-native');
      rewrites.forEach((r, i) => TransformRequestManager.addUrlTransform({ id: `kaartdienst-${i}`, match: r.find, find: r.find, replace: r.replace }));
    }
    return rewrites;
  });
  return ready;
}

/** De gekozen omzettingen (leeg zolang er nog niets gekozen is of bij OpenFreeMap). */
export function mapRewrites(): UrlRewrite[] {
  return current;
}
