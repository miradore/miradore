// Parallel headless render of all frames. Usage: node tools/render.js [--workers=2] [--start=0] [--end=1860] [--out=out/frames] [--scale=1]
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path'; import { serve } from './serve.js';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const workers = parseInt(arg('workers', '2')), start = parseInt(arg('start', '0')), end = parseInt(arg('end', '1860'));
const outDir = arg('out', 'out/frames'); const scale = arg('scale', '1');
fs.mkdirSync(outDir, { recursive: true });
const { server, url } = await serve();
const todo = []; for (let f = start; f < end; f++) if (!fs.existsSync(path.join(outDir, `f${String(f).padStart(5, '0')}.png`))) todo.push(f);
console.log(`rendering ${todo.length} frames with ${workers} workers`);
let next = 0, done = 0; const t0 = Date.now();
async function worker(id) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.log(`[w${id} pageerror]`, e.message));
  await page.goto(`${url}/index.html?scale=${scale}`);
  await page.waitForFunction(() => window.__anime && (window.__anime.app || window.__anime.error), null, { timeout: 900000 });
  const err = await page.evaluate(() => window.__anime.error); if (err) { console.log('BUILD ERROR', err); process.exit(1); }
  while (next < todo.length) {
    const f = todo[next++];
    try {
      const data = await page.evaluate((f) => { window.__anime.render(f); return window.__anime.grab(); }, f);
      fs.writeFileSync(path.join(outDir, `f${String(f).padStart(5, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
    } catch (e) { console.log(`[w${id}] frame ${f} failed: ${e.message}`); next = Math.min(next, todo.indexOf(f)); await page.reload(); await page.waitForFunction(() => window.__anime && window.__anime.app, null, { timeout: 900000 }); continue; }
    done++;
    if (done % 20 === 0 || done === todo.length) { const el = (Date.now() - t0) / 1000; console.log(`${done}/${todo.length} frames, ${el.toFixed(0)} s elapsed, eta ${((todo.length - done) * el / done).toFixed(0)} s`); }
  }
  await browser.close();
}
await Promise.all(Array.from({ length: workers }, (_, i) => worker(i)));
server.close(); console.log('done');
