import { useEffect, useRef, type ComponentType, type Ref, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView as RNWebView, type WebViewProps } from 'react-native-webview';
import { colors } from '../theme';
import { LOGO_ICON_DATA_URI } from './logo-data';
import { boundaryMaskGeoJson } from '@hunt/engine';
import type { GameMapProps } from './types';

/**
 * Kaart in een webweergave met MapLibre GL JS. Alleen voor testen in Expo Go,
 * waar de native kaartmodule ontbreekt. Zelfde kaartstijl en markeringen.
 */
// De typen van react-native-webview passen (nog) niet bij React 19; zelfde component.
type WebViewHandle = { injectJavaScript: (script: string) => void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

// Versie 5: de laatste met een los script (UMD). Versie 6 levert alleen nog
// ES-modules, waardoor een gewone <script>-tag niets laadt en de kaart leeg bleef.
const MAPLIBRE = 'https://unpkg.com/maplibre-gl@5.6.0/dist';

function html(styleUrl: string, accent: string, dark: string) {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="${MAPLIBRE}/maplibre-gl.css">
<script>
// Fouten zichtbaar maken in plaats van een zwart scherm.
function showError(msg) { var e = document.getElementById('err'); if (!e) { document.body.insertAdjacentHTML('beforeend', '<div id="err"></div>'); e = document.getElementById('err'); } e.textContent = 'Kaart: ' + msg; }
window.onerror = function (m) { showError(String(m)); };
</script>
<script src="${MAPLIBRE}/maplibre-gl.js"></script>
<style>
html,body,#map{margin:0;height:100%;background:${dark}}
.pin{background:${accent};color:${dark};font:700 13px -apple-system,sans-serif;padding:4px 8px;border-radius:12px;border:2px solid ${dark};max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{width:30px;height:30px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px}
.logo{width:34px;height:34px;padding:0;border-radius:50%;background-image:url(${LOGO_ICON_DATA_URI});background-size:78%;background-position:center;background-repeat:no-repeat}
.flag{background:#fff;color:#111;border-radius:15px;padding:3px 8px;font-size:15px}
.me{width:16px;height:16px;border-radius:50%;background:#2f81f7;border:3px solid #fff;box-shadow:0 0 0 2px rgba(47,129,247,.4)}
#err{position:absolute;top:40%;left:16px;right:16px;text-align:center;color:#fff;font:14px -apple-system,sans-serif}
</style></head><body><div id="map"></div><script>
if (!window.maplibregl) { showError('kon niet laden (geen internet?)'); window.hunt = () => {}; throw new Error('maplibre ontbreekt'); }
const map = new maplibregl.Map({ container: 'map', style: ${JSON.stringify(styleUrl)}, attributionControl: { compact: true } });
map.on('error', (e) => showError((e && e.error && e.error.message) || 'onbekende fout'));
let markers = [], me = null, fitted = false;
let current = ${JSON.stringify(styleUrl)}, last = null;
window.hunt = (data) => {
  last = data;
  // Andere kaartstijl gekozen: stijl wisselen zonder het beeld te verplaatsen, daarna alles er weer op.
  if (data.style && data.style !== current) { current = data.style; map.setStyle(data.style); map.once('style.load', () => apply(last)); return; }
  map.loaded() ? apply(data) : map.once('load', () => apply(data));
};
function apply(d) {
  if (d.bounds && !fitted) { map.fitBounds([[d.bounds[0], d.bounds[1]], [d.bounds[2], d.bounds[3]]], { padding: { top: 140, bottom: 120, left: 40, right: 40 }, animate: false }); fitted = true; }
  markers.forEach((m) => m.remove());
  markers = d.markers.map((m) => { const el = document.createElement('div'); if (m.logoColor) { el.className = 'pin logo'; el.style.backgroundColor = m.logoColor; } else if (m.flag !== undefined) { el.className = 'pin flag'; el.textContent = '\u{1F3C1}' + m.flag; } else { el.className = m.badge ? 'pin badge' : 'pin'; el.textContent = m.badge || m.label; }
    return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([m.lng, m.lat]).addTo(map); });
  if (d.overlay && !map.getSource('overlay')) {
    const o = d.overlay;
    map.addSource('overlay', { type: 'image', url: o.url, coordinates: [[o.nw.lng, o.nw.lat], [o.se.lng, o.nw.lat], [o.se.lng, o.se.lat], [o.nw.lng, o.se.lat]] });
    map.addLayer({ id: 'overlay', type: 'raster', source: 'overlay', paint: { 'raster-opacity': 0.85 } });
  }
  if (d.mask) {
    // Laag buiten het speelveld, onder de grenslijn.
    const o = d.boundary.outside;
    if (map.getSource('outside')) map.getSource('outside').setData(d.mask);
    else map.addSource('outside', { type: 'geojson', data: d.mask });
    if (!map.getLayer('outside')) map.addLayer({ id: 'outside', type: 'fill', source: 'outside', paint: {} }, map.getLayer('boundary') ? 'boundary' : undefined);
    map.setPaintProperty('outside', 'fill-color', o.color);
    map.setPaintProperty('outside', 'fill-opacity', o.opacity);
  } else if (map.getLayer('outside')) map.setPaintProperty('outside', 'fill-opacity', 0);
  if (d.boundary) {
    const b = { type: 'FeatureCollection', features: [] };
    const c = d.boundary.points.map((p) => [p.lng, p.lat]);
    if (c.length >= 3) { c.push(c[0]); b.features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }); }
    if (map.getSource('boundary')) map.getSource('boundary').setData(b);
    else { map.addSource('boundary', { type: 'geojson', data: b }); map.addLayer({ id: 'boundary', type: 'line', source: 'boundary', layout: { 'line-join': 'round' }, paint: { 'line-color': d.boundary.color, 'line-width': 3 } }); }
  }
  if (d.position) {
    if (!me) { const el = document.createElement('div'); el.className = 'me'; me = new maplibregl.Marker({ element: el }).setLngLat([d.position.lng, d.position.lat]).addTo(map); }
    else me.setLngLat([d.position.lng, d.position.lat]);
  }
}
</script></body></html>`;
}

export default function WebMap({ styleUrl, bounds, markers, overlay, boundary, position }: GameMapProps) {
  const ref = useRef<WebViewHandle>(null);
  const mask = boundary && boundary.outside.opacity > 0 ? boundaryMaskGeoJson(boundary) : null;
  const payload = JSON.stringify({ bounds, markers, overlay, boundary, mask, position, style: styleUrl });
  // De pagina zelf blijft op de eerste stijl; wisselen gaat via window.hunt.
  const [firstStyle] = useState(styleUrl);

  useEffect(() => {
    ref.current?.injectJavaScript(`window.hunt && window.hunt(${payload}); true;`);
  }, [payload]);

  return (
    <WebView
      ref={ref}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
      originWhitelist={['*']}
      // Met een https-basisadres: zonder dat heeft de pagina geen eigen herkomst
      // en kan MapLibre op iOS zijn achtergrondtaak (web worker) niet starten.
      source={{ html: html(firstStyle, colors.accent, colors.background), baseUrl: 'https://kaart.escapegamethehunt.app/' }}
      onLoadEnd={() => ref.current?.injectJavaScript(`window.hunt && window.hunt(${payload}); true;`)}
      scrollEnabled={false}
      onError={(e) => console.warn('webkaart', e.nativeEvent.description)}
    />
  );
}
