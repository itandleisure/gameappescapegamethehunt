import { useEffect, useRef, type ComponentType, type Ref, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView as RNWebView, type WebViewProps } from 'react-native-webview';
import { colors } from '../theme';
import { webMapHtml } from './web-map-html';
import { boundaryMaskGeoJson, circlesGeoJson, insideStyleUrl, type UrlRewrite } from '@hunt/engine';
import { prepareMapProvider } from '../../services/map-provider';
import type { GameMapProps } from './types';

/**
 * Kaart in een webweergave met MapLibre GL JS. Alleen voor testen in Expo Go,
 * waar de native kaartmodule ontbreekt. Zelfde kaartstijl en markeringen.
 */
// De typen van react-native-webview passen (nog) niet bij React 19; zelfde component.
type WebViewHandle = { injectJavaScript: (script: string) => void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

export default function WebMap({ styleUrl, bounds, markers, overlay, boundary, circles, position, follow, line }: GameMapProps) {
  const ref = useRef<WebViewHandle>(null);
  const mask = boundary && boundary.outside.opacity > 0 ? boundaryMaskGeoJson(boundary) : null;
  const payload = JSON.stringify({ bounds, markers, overlay, boundary, mask, circles: circles?.length ? circlesGeoJson(circles) : null, position, follow: follow?.length ? follow : null, line: line ?? null, style: styleUrl, inside: insideStyleUrl(styleUrl) ?? null });
  // De pagina zelf blijft op de eerste stijl; wisselen gaat via window.hunt.
  const [firstStyle] = useState(styleUrl);

  useEffect(() => {
    ref.current?.injectJavaScript(`window.hunt && window.hunt(${payload}); true;`);
  }, [payload]);

  // Eerst de kaartdienst kiezen; de pagina neemt de omzettingen één keer mee.
  const [rewrites, setRewrites] = useState<UrlRewrite[] | null>(null);
  useEffect(() => {
    let alive = true;
    void prepareMapProvider().then((r) => alive && setRewrites(r));
    return () => {
      alive = false;
    };
  }, []);
  if (!rewrites) return null;

  return (
    <WebView
      ref={ref}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
      originWhitelist={['*']}
      // Met een https-basisadres: zonder dat heeft de pagina geen eigen herkomst
      // en kan MapLibre op iOS zijn achtergrondtaak (web worker) niet starten.
      source={{ html: webMapHtml(firstStyle, colors.accent, colors.background, rewrites), baseUrl: 'https://kaart.escapegamethehunt.app/' }}
      onLoadEnd={() => ref.current?.injectJavaScript(`window.hunt && window.hunt(${payload}); true;`)}
      scrollEnabled={false}
      onError={(e) => console.warn('webkaart', e.nativeEvent.description)}
    />
  );
}
