import { boundaryMaskGeoJson, circlesGeoJson, insideStyleUrl } from '@hunt/engine';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { prepareMapProvider } from '../../services/map-provider';
import { colors } from '../theme';
import type { GameMapProps } from './types';
import { MAPLIBRE, MAP_SCRIPT, mapCss } from './web-map-html';

/**
 * Kaart in de webapp: dezelfde kaartcode als in Expo Go (MapLibre GL JS),
 * maar rechtstreeks in de pagina en niet in een los venstertje (iframe).
 * Safari op de iPhone start in zo'n venstertje (srcdoc) de achtergrondtaak
 * van MapLibre niet: dan laden alleen de achtergrondkleur en losse plaatjes,
 * geen straten, en zoomt de kaart nooit in op het speelveld.
 */
type Hunt = ((data: unknown) => void) & { remove: () => void };
type MapFactory = (maplibregl: unknown, container: HTMLElement, styleUrl: string, rewrites: unknown, showError: (msg: string) => void) => Hunt;

let library: Promise<unknown> | null = null;

/** Laadt MapLibre (script en opmaak) één keer in de pagina. */
function loadMaplibre(accent: string, dark: string): Promise<unknown> {
  library ??= new Promise((resolve, reject) => {
    const w = window as Window & { maplibregl?: unknown };
    const style = document.createElement('style');
    style.textContent = mapCss(accent, dark);
    document.head.appendChild(style);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${MAPLIBRE}/maplibre-gl.css`;
    document.head.appendChild(link);
    if (w.maplibregl) return resolve(w.maplibregl);
    const script = document.createElement('script');
    script.src = `${MAPLIBRE}/maplibre-gl.js`;
    script.onload = () => (w.maplibregl ? resolve(w.maplibregl) : reject(new Error('maplibre ontbreekt')));
    script.onerror = () => reject(new Error('kon niet laden (geen internet?)'));
    document.head.appendChild(script);
  }).catch((e: unknown) => {
    library = null; // volgende keer opnieuw proberen
    throw e;
  });
  return library;
}

export default function GameMap({ styleUrl, bounds, markers, overlay, boundary, circles, position }: GameMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const hunt = useRef<Hunt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mask = boundary && boundary.outside.opacity > 0 ? boundaryMaskGeoJson(boundary) : null;
  const payload = JSON.stringify({ bounds, markers, overlay, boundary, mask, circles: circles?.length ? circlesGeoJson(circles) : null, position, style: styleUrl, inside: insideStyleUrl(styleUrl) ?? null });
  const latest = useRef(payload);
  latest.current = payload;
  const [firstStyle] = useState(styleUrl);

  const send = () => {
    try {
      hunt.current?.(JSON.parse(latest.current));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(send, [payload]);

  // Kaart één keer aanmaken, na het kiezen van de kaartdienst.
  useEffect(() => {
    let alive = true;
    void Promise.all([prepareMapProvider(), loadMaplibre(colors.accent, colors.background)])
      .then(([rewrites, maplibregl]) => {
        if (!alive || !container.current) return;
        const create = new Function('maplibregl', 'container', 'styleUrl', 'rewriteList', 'showError', MAP_SCRIPT) as MapFactory;
        hunt.current = create(maplibregl, container.current, firstStyle, rewrites, (msg) => alive && setError(msg));
        send();
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      hunt.current?.remove();
      hunt.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstStyle]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div ref={container} style={{ position: 'absolute', inset: 0, background: colors.background }} />
        {error ? <div id="err">{`Kaart: ${error}`}</div> : null}
      </div>
    </View>
  );
}

export type { GameMapProps, MapMarker } from './types';
