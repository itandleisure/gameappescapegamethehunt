import { useEffect, useRef, type ComponentType, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import { WebView as RNWebView, type WebViewProps } from 'react-native-webview';
import { colors } from '../theme';
import type { GameMapProps } from './types';

/**
 * Kaart in een webweergave met MapLibre GL JS. Alleen voor testen in Expo Go,
 * waar de native kaartmodule ontbreekt. Zelfde kaartstijl en markeringen.
 */
// De typen van react-native-webview passen (nog) niet bij React 19; zelfde component.
type WebViewHandle = { injectJavaScript: (script: string) => void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

const MAPLIBRE = 'https://unpkg.com/maplibre-gl@6.16.0/dist';

function html(styleUrl: string, accent: string, dark: string) {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="${MAPLIBRE}/maplibre-gl.css">
<script src="${MAPLIBRE}/maplibre-gl.js"></script>
<style>
html,body,#map{margin:0;height:100%;background:${dark}}
.pin{background:${accent};color:${dark};font:700 13px -apple-system,sans-serif;padding:4px 8px;border-radius:12px;border:2px solid ${dark};max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.me{width:16px;height:16px;border-radius:50%;background:#2f81f7;border:3px solid #fff;box-shadow:0 0 0 2px rgba(47,129,247,.4)}
</style></head><body><div id="map"></div><script>
const map = new maplibregl.Map({ container: 'map', style: ${JSON.stringify(styleUrl)}, attributionControl: { compact: true } });
let markers = [], me = null, fitted = false;
window.hunt = (data) => {
  map.loaded() ? apply(data) : map.once('load', () => apply(data));
};
function apply(d) {
  if (d.bounds && !fitted) { map.fitBounds([[d.bounds[0], d.bounds[1]], [d.bounds[2], d.bounds[3]]], { padding: { top: 140, bottom: 120, left: 40, right: 40 }, animate: false }); fitted = true; }
  markers.forEach((m) => m.remove());
  markers = d.markers.map((m) => { const el = document.createElement('div'); el.className = 'pin'; el.textContent = m.label;
    return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([m.lng, m.lat]).addTo(map); });
  if (d.overlay && !map.getSource('overlay')) {
    const o = d.overlay;
    map.addSource('overlay', { type: 'image', url: o.url, coordinates: [[o.nw.lng, o.nw.lat], [o.se.lng, o.nw.lat], [o.se.lng, o.se.lat], [o.nw.lng, o.se.lat]] });
    map.addLayer({ id: 'overlay', type: 'raster', source: 'overlay', paint: { 'raster-opacity': 0.85 } });
  }
  if (d.position) {
    if (!me) { const el = document.createElement('div'); el.className = 'me'; me = new maplibregl.Marker({ element: el }).setLngLat([d.position.lng, d.position.lat]).addTo(map); }
    else me.setLngLat([d.position.lng, d.position.lat]);
  }
}
</script></body></html>`;
}

export default function WebMap({ styleUrl, bounds, markers, overlay, position }: GameMapProps) {
  const ref = useRef<WebViewHandle>(null);
  const payload = JSON.stringify({ bounds, markers, overlay, position });

  useEffect(() => {
    ref.current?.injectJavaScript(`window.hunt && window.hunt(${payload}); true;`);
  }, [payload]);

  return (
    <WebView
      ref={ref}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
      originWhitelist={['*']}
      source={{ html: html(styleUrl, colors.accent, colors.background) }}
      onLoadEnd={() => ref.current?.injectJavaScript(`window.hunt && window.hunt(${payload}); true;`)}
      scrollEnabled={false}
    />
  );
}
