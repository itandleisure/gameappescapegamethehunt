// Kaartstijlen voor de voorbeelden: Toner-achtig buiten het speelveld, kleur erbinnen.
// Elke stijl wordt gemaakt uit een palet, op dezelfde kaartdata als onze eigen stijlen (OpenFreeMap).

const SRC = { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } };
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const zw = (a, b) => ['interpolate', ['exponential', 1.5], ['zoom'], ...a.flatMap((z, i) => [z, b[i]])];

// Alleen herkenningspunten: kerken, stadhuis, musea, monumenten. Geen horeca of winkels
// (ook geen 'library': daar vallen in OpenMapTiles ook boekwinkels onder).
export const POI_CLASSES = ['place_of_worship', 'town_hall', 'museum', 'castle', 'monument', 'attraction', 'theatre'];

export function makeStyle(p, { labels = true, landmarks = false } = {}) {
  const roadColor = p.road;
  const layers = [
    { id: 'papier', type: 'background', paint: { 'background-color': p.bg } },
    { id: 'groen', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood', 'farmland', 'wetland']]], paint: { 'fill-color': p.green } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': p.park, 'fill-outline-color': p.parkEdge } },
    { id: 'terrein', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['in', ['get', 'class'], ['literal', ['cemetery', 'pitch', 'stadium', 'playground']]], paint: { 'fill-color': p.terrain } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': p.water } },
    { id: 'water-rand', type: 'line', source: 'omt', 'source-layer': 'water', paint: { 'line-color': p.waterEdge, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 17, 1.5] } },
    { id: 'vaarwater', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': p.waterway, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 17, 4] } },
    { id: 'gebouw', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': p.building, 'fill-outline-color': p.buildingEdge } },
    { id: 'spoor', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': p.rail ?? roadColor, 'line-width': 1.5, 'line-dasharray': [3, 2] } },
    { id: 'pad', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]], minzoom: 14, paint: { 'line-color': p.path ?? roadColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.7, 18, 2], 'line-dasharray': [2, 1.5] } },
  ];
  const minor = ['in', ['get', 'class'], ['literal', ['minor', 'service']]];
  const major = ['in', ['get', 'class'], ['literal', ['tertiary', 'secondary', 'primary', 'trunk', 'motorway']]];
  const round = { 'line-cap': 'round', 'line-join': 'round' };
  if (p.casing) {
    // Wegen als witte band met een rand, zoals een gewone stadskaart.
    layers.push(
      { id: 'straat-klein-rand', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: minor, layout: round, paint: { 'line-color': p.casing, 'line-width': zw([13, 16, 19], [1.2, 5, 16]) } },
      { id: 'straat-rand', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: major, layout: round, paint: { 'line-color': p.casing, 'line-width': zw([10, 14, 17, 19], [1.5, 5, 12, 22]) } },
    );
  }
  layers.push(
    { id: 'straat-klein', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: minor, layout: round, paint: { 'line-color': p.roadMinor ?? roadColor, 'line-width': zw([13, 16, 19], [0.6, p.casing ? 3.5 : 2.5, p.casing ? 13 : 9]) } },
    { id: 'straat', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: major, layout: round, paint: { 'line-color': roadColor, 'line-width': zw([10, 14, 17, 19], [0.8, p.casing ? 3.5 : 3, p.casing ? 9 : 8, p.casing ? 18 : 16]) } },
    { id: 'brug', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['==', ['get', 'brunnel'], 'bridge'], minzoom: 14, layout: { 'line-cap': 'butt' }, paint: { 'line-color': p.bridge ?? p.bg, 'line-width': zw([14, 18], [1, 5]), 'line-gap-width': zw([14, 18], [2, 10]) } },
  );
  if (landmarks) {
    layers.push(
      { id: 'herkenningspunt', type: 'circle', source: 'omt', 'source-layer': 'poi', minzoom: 14, filter: ['all', ['in', ['get', 'class'], ['literal', POI_CLASSES]], ['has', 'name']], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 6], 'circle-color': p.poi, 'circle-stroke-color': p.halo, 'circle-stroke-width': 1.5 } },
    );
  }
  if (labels) {
    layers.push(
      { id: 'water-naam', type: 'symbol', source: 'omt', 'source-layer': 'water_name', layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 13 }, paint: { 'text-color': p.waterText ?? p.text, 'text-halo-color': p.halo, 'text-halo-width': 1.5 } },
      { id: 'straatnaam', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 14, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 18, 14], 'text-max-angle': 30 }, paint: { 'text-color': p.text, 'text-halo-color': p.halo, 'text-halo-width': 2 } },
    );
  }
  if (landmarks) {
    layers.push(
      { id: 'park-naam', type: 'symbol', source: 'omt', 'source-layer': 'park', minzoom: 14, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'text-max-width': 8 }, paint: { 'text-color': p.parkText, 'text-halo-color': p.halo, 'text-halo-width': 1.5 } },
      { id: 'herkenningspunt-naam', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 14, filter: ['all', ['in', ['get', 'class'], ['literal', POI_CLASSES]], ['has', 'name']], layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-max-width': 8 }, paint: { 'text-color': p.poiText ?? p.poi, 'text-halo-color': p.halo, 'text-halo-width': 1.5 } },
    );
  }
  return { version: 8, sources: SRC, glyphs: GLYPHS, layers };
}

/** Buiten het speelveld: Toner-achtig zwart-wit (wit land, zwart water, zwarte wegen). */
export const TONER = {
  bg: '#ffffff', green: '#f1f1f1', park: '#e4e4e4', parkEdge: '#b0b0b0', terrain: '#ececec',
  water: '#111111', waterEdge: '#111111', waterway: '#111111', building: '#e3e3e3', buildingEdge: '#a3a3a3',
  road: '#111111', text: '#111111', waterText: '#ffffff', halo: '#ffffff', bridge: '#ffffff',
};

/** De vier voorstellen voor binnen het speelveld. */
export const VARIANTEN = [
  {
    id: '1-toner-met-kleur',
    naam: 'A. Toner met kleur',
    uitleg: 'Zelfde zwarte straten als buiten, maar parken groen, water blauw en gebouwen zandkleurig.',
    palet: {
      bg: '#fbf8f1', green: '#d3e8bd', park: '#a8d48a', parkEdge: '#5f9e3c', terrain: '#c8e2ae',
      water: '#7cc0ea', waterEdge: '#2f7fb8', waterway: '#4d9fd6', building: '#ead9c0', buildingEdge: '#a88c66',
      road: '#111111', text: '#111111', halo: '#ffffff', poi: '#e5963f', poiText: '#8a4f12', parkText: '#2f6b1a', waterText: '#1d5a87',
    },
  },
  {
    id: '2-gewone-stadskaart',
    naam: 'B. Gewone stadskaart',
    uitleg: 'Zoals een normale plattegrond: witte straten met een rand, zachte kleuren. Groot verschil met buiten.',
    palet: {
      bg: '#f4f1ea', green: '#d8eac4', park: '#bfe0a6', parkEdge: '#86b867', terrain: '#d2e6bd',
      water: '#a5d3f2', waterEdge: '#6fa9d6', waterway: '#8ec5ec', building: '#e4ddd2', buildingEdge: '#c2b6a5',
      road: '#ffffff', roadMinor: '#ffffff', casing: '#b9b1a4', path: '#9a8f80', rail: '#7a7a7a', bridge: '#f4f1ea',
      text: '#3b3a36', halo: '#ffffff', poi: '#e5963f', poiText: '#8a4f12', parkText: '#3f7a25', waterText: '#2e6a9a',
    },
  },
  {
    id: '3-huisstijl-leisteen',
    naam: 'C. Huisstijl leisteen',
    uitleg: 'Kleuren van Badass Games: leisteenblauw water en straten, gedempt groen, oranje herkenningspunten.',
    palet: {
      bg: '#eef1f5', green: '#cfdcc4', park: '#adc79c', parkEdge: '#6e8f5c', terrain: '#c4d6b6',
      water: '#6f8fae', waterEdge: '#3e5670', waterway: '#5a7a9a', building: '#d6dce4', buildingEdge: '#8995a5',
      road: '#252f3d', text: '#252f3d', halo: '#ffffff', poi: '#e5963f', poiText: '#b0601a', parkText: '#3f5f31', waterText: '#ffffff',
    },
  },
  {
    id: '4-donker-speelveld',
    naam: 'D. Donker speelveld',
    uitleg: 'Het speelveld is donker leisteen met kleur, buiten blijft het wit. Het speelveld springt er echt uit.',
    palet: {
      bg: '#2c3848', green: '#33493a', park: '#3d6b45', parkEdge: '#5f9a63', terrain: '#36513d',
      water: '#2a6fa8', waterEdge: '#5aa0d8', waterway: '#3b84c0', building: '#3c4a5c', buildingEdge: '#56677d',
      road: '#e8ecf1', roadMinor: '#c3ccd7', path: '#9aa7b6', rail: '#9aa7b6', bridge: '#2c3848',
      text: '#ffffff', halo: '#252f3d', poi: '#e5963f', poiText: '#f2b46d', parkText: '#9fd8a3', waterText: '#b9dcf7',
    },
  },
];
