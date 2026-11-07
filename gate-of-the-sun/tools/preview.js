// Render selected frames to PNG for review. Usage: node tools/preview.js out/preview 0 100 200 ... [--scale=0.5] [--depts=town,fx]
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path'; import { serve } from './serve.js';
const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--') && isNaN(parseInt(a))) || 'out/preview';
const frames = args.filter((a) => !a.startsWith('--') && !isNaN(parseInt(a))).map(Number);
const scale = (args.find((a) => a.startsWith('--scale=')) || '--scale=1').split('=')[1];
const depts = (args.find((a) => a.startsWith('--depts=')) || '--depts=').split('=')[1];
const extra = ((args.find((a) => a.startsWith('--q=')) || '--q=')).slice(4);
fs.mkdirSync(outDir, { recursive: true });
const { server, url } = await serve();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-web-security'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => { console.log('[page]', m.text().slice(0, 1500)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto(`${url}/index.html?scale=${scale}${depts ? '&depts=' + depts : ''}${extra ? '&' + extra : ''}`);
await page.waitForFunction(() => window.__anime && (window.__anime.app || window.__anime.error), null, { timeout: 600000 });
const err = await page.evaluate(() => window.__anime.error); if (err) { console.log('BUILD ERROR', err); process.exit(1); }
console.log('built in', Date.now() - t0, 'ms');
for (const f of frames) {
  const t = Date.now();
  await page.evaluate((f) => window.__anime.render(f), f);
  const data = await page.evaluate(() => window.__anime.grab());
  fs.writeFileSync(path.join(outDir, `f${String(f).padStart(5, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
  console.log('frame', f, Date.now() - t, 'ms');
}
await browser.close(); server.close();
