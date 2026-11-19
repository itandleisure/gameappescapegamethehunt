import { boundaryMaskGeoJson, circlesGeoJson, type UrlRewrite } from '@hunt/engine';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { prepareMapProvider } from '../../services/map-provider';
import { colors } from '../theme';
import type { GameMapProps } from './types';
import { webMapHtml } from './web-map-html';

/**
 * Kaart in de webapp: dezelfde kaartpagina als in Expo Go (MapLibre GL JS),
 * hier in een iframe. Zelfde stijl en markeringen als de app.
 */
type HuntWindow = Window & { hunt?: (data: unknown) => void };

export default function GameMap({ styleUrl, bounds, markers, overlay, boundary, circles, position }: GameMapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const mask = boundary && boundary.outside.opacity > 0 ? boundaryMaskGeoJson(boundary) : null;
  const payload = JSON.stringify({ bounds, markers, overlay, boundary, mask, circles: circles?.length ? circlesGeoJson(circles) : null, position, style: styleUrl });
  const latest = useRef(payload);
  latest.current = payload;
  const [firstStyle] = useState(styleUrl);

  const send = () => {
    const win = frame.current?.contentWindow as HuntWindow | null | undefined;
    try {
      win?.hunt?.(JSON.parse(latest.current));
    } catch {
      // kaart nog niet klaar; onLoad stuurt hem opnieuw
    }
  };
  useEffect(send, [payload]);

  const [rewrites, setRewrites] = useState<UrlRewrite[] | null>(null);
  useEffect(() => {
    let alive = true;
    void prepareMapProvider().then((r) => alive && setRewrites(r));
    return () => {
      alive = false;
    };
  }, []);
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    if (rewrites) setHtml(webMapHtml(firstStyle, colors.accent, colors.background, rewrites));
  }, [rewrites, firstStyle]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
      {html ? (
        <iframe
          ref={frame}
          title="Kaart"
          srcDoc={html}
          onLoad={send}
          style={{ border: 0, width: '100%', height: '100%', display: 'block', background: colors.background }}
        />
      ) : null}
    </View>
  );
}

export type { GameMapProps, MapMarker } from './types';
