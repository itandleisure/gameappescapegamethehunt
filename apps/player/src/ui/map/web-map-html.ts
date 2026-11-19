import type { UrlRewrite } from '@hunt/engine';
import { LOGO_ICON_DATA_URI } from './logo-data';

/**
 * De kaartpagina met MapLibre GL JS, voor de kaart in een webweergave (Expo
 * Go) en in de webapp (browser). Gegevens komen binnen via window.hunt(...).
 */
// Versie 5: de laatste met een los script (UMD). Versie 6 levert alleen nog
// ES-modules, waardoor een gewone <script>-tag niets laadt en de kaart leeg bleef.
export const MAPLIBRE = 'https://unpkg.com/maplibre-gl@5.6.0/dist';

/** Opmaak van de markeringen en de foutmelding (pagina en webapp). */
export function mapCss(accent: string, dark: string) {
  return `.pin{background:${accent};color:${dark};font:700 13px -apple-system,sans-serif;padding:4px 8px;border-radius:12px;border:2px solid ${dark};max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{width:30px;height:30px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px}
.logo{width:34px;height:34px;padding:0;border-radius:50%;background-image:url(${LOGO_ICON_DATA_URI});background-size:78%;background-position:center;background-repeat:no-repeat}
.flag{background:#fff;color:#111;border-radius:15px;padding:3px 8px;font-size:15px}
.person{display:flex;align-items:center;gap:4px}.person .dot{width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)}.person .name{background:#fff;color:#111;font:600 12px -apple-system,sans-serif;padding:3px 6px;border-radius:4px;white-space:nowrap}.person.stale{opacity:.5}
.me{width:16px;height:16px;border-radius:50%;background:#2f81f7;border:3px solid #fff;box-shadow:0 0 0 2px rgba(47,129,247,.4)}
#err{position:absolute;top:40%;left:16px;right:16px;text-align:center;color:#fff;background:rgba(37,47,61,.88);padding:10px 12px;border-radius:8px;font:14px -apple-system,sans-serif}
`;
}

/**
 * De kaart zelf, als tekst: de body van een functie met de parameters
 * (maplibregl, container, styleUrl, rewriteList, showError). Geeft hunt(data)
 * terug. Dezelfde code draait in de kaartpagina (Expo Go) en rechtstreeks in
 * de webapp (GameMap.web.tsx).
 */
export const MAP_SCRIPT = String.raw`// Kaartdienst: adressen omzetten naar MapTiler (zie map-provider.ts in de engine).
const rewrites = rewriteList.map((r) => [new RegExp(r.find), r.replace]);
const transformRequest = (url) => ({ url: rewrites.reduce((u, [find, replace]) => u.replace(find, replace), url) });
const map = new maplibregl.Map({ container, style: styleUrl, attributionControl: { compact: true }, transformRequest });
map.on('error', (e) => showError((e && e.error && e.error.message) || 'onbekende fout'));
let markers = [], me = null, fitted = false;
let current = styleUrl, last = null;
const hunt = (data) => {
  last = data;
  // Andere kaartstijl gekozen: stijl wisselen zonder het beeld te verplaatsen, daarna alles er weer op.
  // Zonder diff: false komt er geen 'style.load' als de nieuwe stijl op de oude lijkt (zoals Toner
  // zonder MapTiler, die zwart-wit wordt), en dan kwamen de pinnen en de eigen positie nooit op de kaart.
  if (data.style && data.style !== current) { current = data.style; map.once('style.load', () => apply(last)); map.setStyle(data.style, { diff: false }); return; }
  map.loaded() ? apply(data) : map.once('load', () => apply(data));
};
function apply(d) {
  if (d.bounds && !fitted) { map.fitBounds([[d.bounds[0], d.bounds[1]], [d.bounds[2], d.bounds[3]]], { padding: { top: 140, bottom: 120, left: 40, right: 40 }, animate: false }); fitted = true; }
  markers.forEach((m) => m.remove());
  markers = d.markers.map((m) => { const el = document.createElement('div'); if (m.person) { el.className = 'person' + (m.person.stale ? ' stale' : ''); const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = m.person.color; if (m.person.ring) dot.style.borderColor = m.person.ring; const name = document.createElement('span'); name.className = 'name'; name.textContent = m.label; el.append(dot, name); } else if (m.logoColor) { el.className = 'pin logo'; el.style.backgroundColor = m.logoColor; } else if (m.flag !== undefined) { el.className = 'pin flag'; el.textContent = '\u{1F3C1}' + m.flag; } else { el.className = m.badge ? 'pin badge' : 'pin'; el.textContent = m.badge || m.label; }
    return new maplibregl.Marker({ element: el, anchor: m.person ? 'left' : 'bottom', offset: m.person ? [-9, 0] : [0, 0] }).setLngLat([m.lng, m.lat]).addTo(map); });
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
  if (d.circles) {
    if (map.getSource('circles')) map.getSource('circles').setData(d.circles);
    else {
      map.addSource('circles', { type: 'geojson', data: d.circles });
      map.addLayer({ id: 'circles-fill', type: 'fill', source: 'circles', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 } });
      map.addLayer({ id: 'circles-line', type: 'line', source: 'circles', paint: { 'line-color': ['get', 'color'], 'line-width': 2 } });
    }
  }
  if (d.position) {
    if (!me) { const el = document.createElement('div'); el.className = 'me'; me = new maplibregl.Marker({ element: el }).setLngLat([d.position.lng, d.position.lat]).addTo(map); }
    else me.setLngLat([d.position.lng, d.position.lat]);
  }
}
hunt.remove = () => map.remove();
return hunt;
`;

export function webMapHtml(styleUrl: string, accent: string, dark: string, rewrites: UrlRewrite[]) {
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
${mapCss(accent, dark)}
</style></head><body><div id="map"></div><script>
if (!window.maplibregl) { showError('kon niet laden (geen internet?)'); window.hunt = () => {}; throw new Error('maplibre ontbreekt'); }
window.hunt = new Function('maplibregl', 'container', 'styleUrl', 'rewriteList', 'showError', ${JSON.stringify(MAP_SCRIPT)})(maplibregl, 'map', ${JSON.stringify(styleUrl)}, ${JSON.stringify(rewrites)}, showError);
</script></body></html>`;
}
