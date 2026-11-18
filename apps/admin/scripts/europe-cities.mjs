/**
 * Maakt src/lib/europe-cities.json: per Europees land de grotere plaatsen met
 * hun middelpunt, voor de keuzelijst bij "Nieuwe stad uitrollen".
 *
 * Bron: GeoNames (https://www.geonames.org, CC BY 4.0) via het npm-pakket
 * all-the-cities. Opnieuw maken:
 *
 *   npm i --no-save all-the-cities@3.1.0 && node scripts/europe-cities.mjs
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cities = require('all-the-cities');

export const EUROPE =
  'AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM UA VA XK'.split(' ');

/** Namen zoals ze in het land zelf gebruikt worden, waar GeoNames de Engelse naam geeft. */
const LOCAL = {
  NL: { 'The Hague': 'Den Haag', 'Almere Stad': 'Almere' },
  BE: { Brussels: 'Brussel' },
};

const MIN_POPULATION = 15000;
const MAX_PER_COUNTRY = 300;
const MIN_PER_COUNTRY = 10;
const round = (n) => Math.round(n * 1e4) / 1e4;

const out = {};
for (const country of EUROPE) {
  const list = cities
    .filter((c) => c.country === country && c.featureCode !== 'PPLX' && c.featureCode !== 'PPLH')
    .sort((a, b) => b.population - a.population);
  const big = list.filter((c) => c.population >= MIN_POPULATION).slice(0, MAX_PER_COUNTRY);
  const pick = big.length >= MIN_PER_COUNTRY ? big : list.slice(0, MIN_PER_COUNTRY);
  const seen = new Set();
  const rows = [];
  for (const c of pick) {
    const name = LOCAL[country]?.[c.name] ?? c.name;
    if (seen.has(name)) continue;
    seen.add(name);
    const [lng, lat] = c.loc.coordinates;
    rows.push([name, round(lat), round(lng)]);
  }
  out[country] = rows.sort((a, b) => a[0].localeCompare(b[0]));
}
writeFileSync(new URL('../src/lib/europe-cities.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(Object.values(out).reduce((n, l) => n + l.length, 0), 'plaatsen');
