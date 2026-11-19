/**
 * Bouwt de webapp voor spelers (de speler-app in de browser) naar
 * public/speel, zodat hij op hetzelfde domein staat als de beheeromgeving en
 * de spellinks: https://<domein>/speel/. Zie apps/player/scripts/web-build.mjs.
 *
 * Mislukt het bouwen van de webapp, dan faalt de controle op GitHub (CI), maar
 * gaat een deploy van de beheeromgeving gewoon door: beheer mag nooit stuk gaan
 * door de webapp. De oude webapp blijft dan niet staan; de melding staat in het
 * bouwverslag.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const admin = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(admin, '..', 'player', 'scripts', 'web-build.mjs');
const result = spawnSync(process.execPath, [script, '--out', join(admin, 'public', 'speel'), '--base', '/speel'], { stdio: 'inherit' });

if (result.status !== 0) {
  if (process.env.GITHUB_ACTIONS) process.exit(1);
  console.warn('\n⚠️  Webapp voor spelers niet gebouwd; de beheeromgeving gaat zonder /speel online.\n');
}
