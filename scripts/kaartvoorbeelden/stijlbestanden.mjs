// Schrijft de kaartstijlen "Toner" (buiten het speelveld) en "Toner met kleur" (binnen) naar
// apps/admin/public/kaart/. Opnieuw draaien na een wijziging in stijlen.mjs:
//   node scripts/kaartvoorbeelden/stijlbestanden.mjs
import { writeFileSync } from 'node:fs';
import { makeStyle, TONER, VARIANTEN } from './stijlen.mjs';

const dir = new URL('../../apps/admin/public/kaart/', import.meta.url);
const meta = (name, omschrijving) => ({ name, metadata: { omschrijving } });
const write = (file, style) => writeFileSync(new URL(file, dir), JSON.stringify(style, null, 1) + '\n');
write('toner.json', { ...meta('Toner', 'Zwart-wit in Toner-stijl op OpenStreetMap-data via OpenFreeMap. Buiten het speelveld.'), ...makeStyle(TONER) });
write('toner-kleur.json', { ...meta('Toner met kleur', 'Binnen het speelveld: zwarte straten, groene parken, blauw water, herkenningspunten.'), ...makeStyle(VARIANTEN[0].palet, { landmarks: true }) });
