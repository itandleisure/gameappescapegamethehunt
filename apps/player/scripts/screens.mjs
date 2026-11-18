/**
 * Schermcontrole van de speler-app op veel schermmaten.
 *
 * Bouwt de app voor de browser met nepdata (SCREEN_PREVIEW=1, zie preview/),
 * opent elk scherm op kleine en grote telefoons en een tablet, en controleert:
 *  - niets steekt buiten het scherm uit (geen horizontaal scrollen);
 *  - elke knop is te bereiken (in beeld te scrollen en niet afgedekt);
 *  - foto's blijven binnen hun kader, ook heel grote, heel kleine of rare maten;
 *  - geen foutmeldingen in de app.
 * Schermafbeeldingen (wat de speler ziet zonder te scrollen) komen in
 * screens/, met een overzicht in index.html.
 *
 *   pnpm --filter @hunt/player screens            # bouwen en controleren
 *   pnpm --filter @hunt/player screens --no-build # alleen controleren
 *   ... screens --device=klein --scene=opdracht      # alleen schermen waarvan de naam dit bevat
 */
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-screens');
const out = join(root, 'screens');

export const DEVICES = [
  { id: 'klein-320', label: 'Kleine telefoon (iPhone SE 1e gen., oude Android)', width: 320, height: 568 },
  { id: 'android-360', label: 'Gangbare Android (Samsung A-serie)', width: 360, height: 640 },
  { id: 'iphone-se-375', label: 'iPhone SE / 8', width: 375, height: 667 },
  { id: 'iphone-390', label: 'iPhone 13 / 14 / 15', width: 390, height: 844 },
  { id: 'pixel-412', label: 'Pixel / Galaxy S', width: 412, height: 915 },
  { id: 'promax-430', label: 'iPhone Pro Max / Plus', width: 430, height: 932 },
  { id: 'tablet-800', label: 'Android-tablet', width: 800, height: 1280 },
];

const tasksButton = /^Opdrachten/;
/** Scènes: start-URL en daarna eventueel knoppen om naar het scherm te gaan. */
export const SCENES = [
  { id: 'aanmelden', url: '/?scene=join' },
  { id: 'teamfoto', url: '/?scene=teamphoto' },
  { id: 'teamcode', url: '/?scene=teamcode' },
  { id: 'teamcode-lang', url: '/?scene=teamcode&long=1' },
  { id: 'kaart-testmodus', url: '/?scene=play' },
  { id: 'kaart-lang-offline', url: '/?scene=play&long=1' },
  { id: 'opdrachtenlijst', url: '/?scene=task', clicks: [tasksButton] },
  { id: 'opdrachtenlijst-lang', url: '/?scene=task&long=1&img=tall', clicks: [tasksButton] },
  ...['normal', 'huge', 'tiny', 'wide', 'tall', 'broken', 'none'].map((img) => ({
    id: `opdracht-foto-${img}`,
    url: `/?scene=task&img=${img}`,
    clicks: [tasksButton, /^Tangram/],
  })),
  { id: 'opdracht-lang', url: '/?scene=task&long=1&img=huge', clicks: [tasksButton, /^Een hele lange titel/] },
  { id: 'opdracht-hint', url: '/?scene=task&img=wide', clicks: [tasksButton, /^Tangram/, /^Hint gebruiken/, /^Ja$/] },
  { id: 'fotomissie', url: '/?scene=task&img=none', clicks: [tasksButton, /^Leg het bewijs vast/, /^Maak (een )?foto/i] },
  { id: 'chat', url: '/?scene=chat', clicks: [/^(💬|Chat)/] },
  { id: 'chat-lang-offline', url: '/?scene=chat&long=1', clicks: [/^(💬|Chat)/] },
  { id: 'einde-verzamelpunt', url: '/?scene=end' },
  { id: 'einde-lang', url: '/?scene=end&long=1' },
];

function build() {
  rmSync(dist, { recursive: true, force: true });
  const result = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', dist], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, SCREEN_PREVIEW: '1', EXPO_NO_TELEMETRY: '1' },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error('Bouwen voor de browser mislukt');
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf' };
function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(dist, path);
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Controles op de pagina zelf; geeft een lijst met problemen terug. */
async function inspect(page) {
  return page.evaluate(async () => {
    const problems = [];
    // Een telefoon scrolt de pagina zelf niet: wat niet in een scrollvak staat en onder de rand valt, is weg.
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    const vw = window.innerWidth;
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const name = (el) => (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
    // Alles dat rechts of links buiten het scherm valt (tekst en knoppen).
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || (el.children.length > 0 && !el.innerText) || getComputedStyle(el).opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        // Binnen een ouder die het afknipt telt het niet als het niet zichtbaar is.
        let clipped = false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (ps.overflowX !== 'visible') {
            const pr = p.getBoundingClientRect();
            if (pr.right <= vw + 1 && pr.left >= -1) clipped = true;
            break;
          }
        }
        if (!clipped && (el.innerText || el.tagName === 'IMG')) problems.push(`buiten beeld (${Math.round(r.left)}–${Math.round(r.right)} px): "${name(el)}"`);
      }
    }
    if (document.documentElement.scrollWidth > vw + 1) problems.push(`pagina scrolt horizontaal (${document.documentElement.scrollWidth} px breed)`);
    // Foto's: binnen hun kader en niet groter dan het scherm.
    // In de browser tekent React Native een foto als achtergrond van een vak, met een onzichtbare <img> erin.
    for (const img of document.querySelectorAll('img')) {
      const box = getComputedStyle(img).opacity === '0' ? img.parentElement : img;
      if (!box || !visible(box)) continue;
      const r = box.getBoundingClientRect();
      if (r.width > vw + 1) problems.push(`foto breder dan het scherm (${Math.round(r.width)} px)`);
      if (r.height > window.innerHeight * 1.2) problems.push(`foto hoger dan het scherm (${Math.round(r.height)} px)`);
    }
    // Elke knop in beeld te scrollen en niet afgedekt door iets anders.
    for (const el of document.querySelectorAll('[role="button"]')) {
      if (!visible(el)) continue;
      // Alleen echte scrollvakken scrollen (zoals de speler met de vinger doet); scrollIntoView
      // zou ook vakken verschuiven die op een telefoon vastzitten.
      document.documentElement.scrollTop = 0;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const oy = getComputedStyle(p).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) {
          const er = el.getBoundingClientRect();
          const pr = p.getBoundingClientRect();
          p.scrollTop += er.top + er.height / 2 - (pr.top + pr.height / 2);
        }
      }
      await new Promise((r) => setTimeout(r, 30));
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (y < 0 || y > window.innerHeight || x < 0 || x > vw) {
        problems.push(`knop niet te bereiken: "${name(el)}"`);
        continue;
      }
      const hit = document.elementFromPoint(x, y);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) problems.push(`knop afgedekt: "${name(el)}" door "${name(hit)}"`);
      if (r.height < 40) problems.push(`knop te klein om te tikken (${Math.round(r.height)} px hoog): "${name(el)}"`);
    }
    window.scrollTo(0, 0);
    for (const s of document.querySelectorAll('*')) if (s.scrollTop) s.scrollTop = 0;
    return problems;
  });
}

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

async function main() {
  const devices = DEVICES.filter((d) => !arg('device') || d.id.includes(arg('device')));
  const scenes = SCENES.filter((s) => !arg('scene') || s.id.includes(arg('scene')));
  if (!process.argv.includes('--no-build')) build();
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const report = [];
  let failures = 0;
  for (const device of devices) {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: 1,
      locale: 'nl-NL',
      hasTouch: true,
      isMobile: device.width < 600,
    });
    for (const scene of scenes) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`fout in de app: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && !/example\.invalid|ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 160)}`));
      const problems = [];
      try {
        await page.goto(base + scene.url);
        await page.waitForTimeout(1200);
        for (const label of scene.clicks ?? []) {
          const target = page.getByRole('button', { name: label }).or(page.getByText(label)).first();
          await target.scrollIntoViewIfNeeded({ timeout: 5000 });
          await target.click({ timeout: 5000 });
          await page.waitForTimeout(700);
        }
        await page.waitForTimeout(500);
        problems.push(...(await inspect(page)));
      } catch (e) {
        problems.push(`scène niet te openen: ${String(e.message).split('\n')[0]}`);
      }
      problems.push(...errors);
      const file = `${device.id}--${scene.id}.png`;
      await page.screenshot({ path: join(out, file) }).catch(() => undefined);
      await page.close();
      const unique = [...new Set(problems)];
      failures += unique.length > 0 ? 1 : 0;
      report.push({ device: device.id, scene: scene.id, file, problems: unique });
      console.log(`${unique.length ? '✗' : '✓'} ${device.id.padEnd(14)} ${scene.id}${unique.map((p) => `\n    - ${p}`).join('')}`);
    }
    await context.close();
  }
  await browser.close();
  server.close();
  writeFileSync(join(out, 'rapport.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(out, 'index.html'), overview(report, devices, scenes));
  console.log(`\n${report.length - failures} van ${report.length} schermen in orde. Schermafbeeldingen: ${join(out, 'index.html')}`);
  process.exitCode = failures ? 1 : 0;
}

function overview(report, devices, scenes) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const rows = scenes.map((scene) => {
    const cells = devices.map((d) => {
      const r = report.find((x) => x.device === d.id && x.scene === scene.id);
      const bad = r.problems.length > 0;
      return `<td class="${bad ? 'bad' : ''}"><a href="${r.file}"><img loading="lazy" src="${r.file}" width="${Math.round(d.width / 2.2)}"></a>${bad ? `<ul>${r.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</td>`;
    }).join('');
    return `<tr><th>${scene.id}</th>${cells}</tr>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><title>Schermcontrole speler-app</title>
<style>body{font:14px system-ui;background:#f4f4f4;margin:16px}table{border-collapse:collapse}td,th{vertical-align:top;padding:6px;border:1px solid #ddd;background:#fff}th{text-align:left}td.bad{background:#fde8e8}ul{margin:4px 0 0;padding-left:16px;max-width:220px;color:#b00;font-size:12px}img{display:block;border:1px solid #ccc}</style>
<h1>Schermcontrole speler-app</h1><table><tr><th></th>${devices.map((d) => `<th>${esc(d.label)}<br>${d.width}×${d.height}</th>`).join('')}</tr>${rows}</table>`;
}

await main();
