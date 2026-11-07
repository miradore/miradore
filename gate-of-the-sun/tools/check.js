// Pre-render checks on every frame using the real geometry (BVH): intersections, camera inside
// meshes or below ground, camera jerks, mid-shot pops. Usage: node tools/check.js [--step=1] [--start=0] [--end=1860]
import { chromium } from 'playwright'; import fs from 'node:fs'; import { serve } from './serve.js';
import shotsJson from '../shared/shots.json' with { type: 'json' };
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const step = parseInt(arg('step', '1')), start = parseInt(arg('start', '0')), end = parseInt(arg('end', '1860'));
const { server, url } = await serve();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${url}/index.html?scale=0.25`);
await page.waitForFunction(() => window.__anime && (window.__anime.app || window.__anime.error), null, { timeout: 900000 });
const err = await page.evaluate(() => window.__anime.error); if (err) { console.log('BUILD ERROR', err); process.exit(1); }
console.log('checker stats', JSON.stringify(await page.evaluate(() => window.__anime.checkStats())));
const shots = shotsJson.shots;
const shotOf = (f) => shots.find((s) => f >= s.start && f < s.end);
const report = { intersections: [], cameraInside: [], belowGround: [], jerks: [], pops: [], framesChecked: 0 };
let prev = null, prev2 = null, prevVis = null, prevShot = null;
const t0 = Date.now();
for (let f = start; f < end; f += step) {
  const r = await page.evaluate((f) => { const r = window.__anime.check(f); return r; }, f);
  report.framesChecked++;
  const shot = shotOf(f);
  if (r.intersections.length) report.intersections.push({ frame: f, shot: shot.id, pairs: dedupe(r.intersections) });
  if (r.cameraInside.length) report.cameraInside.push({ frame: f, shot: shot.id, meshes: r.cameraInside });
  if (r.belowGround) report.belowGround.push({ frame: f, shot: shot.id });
  // camera jerks: second difference of position and orientation within a shot, outside shake windows
  if (prev && prev2 && prevShot === shot.id && shotOf(f - 2 * step)?.id === shot.id) {
    const local = f - shot.start;
    const inShake = (shot.shake || []).some((s) => local >= s.start - 1 && local <= s.end + 1);
    if (!inShake) {
      const acc = Math.hypot(r.camera[0] - 2 * prev.camera[0] + prev2.camera[0], r.camera[1] - 2 * prev.camera[1] + prev2.camera[1], r.camera[2] - 2 * prev.camera[2] + prev2.camera[2]);
      const ang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180 / Math.PI;
      const dAng = Math.abs(ang(r.quat, prev.quat) - ang(prev.quat, prev2.quat));
      const dist = Math.hypot(r.camera[0] - prev.camera[0], r.camera[1] - prev.camera[1], r.camera[2] - prev.camera[2]);
      if (acc > 0.25 + 0.5 * dist || dAng > 1.0 || Math.abs(r.fov - prev.fov) > 1.5) report.jerks.push({ frame: f, shot: shot.id, acc: +acc.toFixed(3), dAng: +dAng.toFixed(3), dfov: +(r.fov - prev.fov).toFixed(2) });
    }
  }
  // pops: named mesh toggles visibility mid shot while inside the frustum, not in popAllowed
  if (prevVis && prevShot === shot.id) {
    const pm = new Map(prevVis.map((v) => [v[0], v]));
    for (const v of r.vis) {
      const p = pm.get(v[0]); if (!p) continue;
      if (p[1] !== v[1] && (v[2] || p[2]) && !v[3]) report.pops.push({ frame: f, shot: shot.id, name: v[0], now: v[1] });
    }
  }
  prev2 = prev; prev = r; prevVis = r.vis; prevShot = shot.id;
  if ((f - start) % (step * 120) === 0) console.log(`checked ${f} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
function dedupe(pairs) { const s = new Set(pairs.map((p) => p.a + ' x ' + p.b)); return [...s]; }
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/check_report.json', JSON.stringify(report, null, 1));
const n = (k) => report[k].length;
console.log(`\nframes checked: ${report.framesChecked}`);
console.log(`intersections: ${n('intersections')} frames`); for (const i of report.intersections.slice(0, 40)) console.log('  f' + i.frame, 'shot', i.shot, i.pairs.slice(0, 6).join('; '));
console.log(`camera inside mesh: ${n('cameraInside')} frames`); for (const i of report.cameraInside.slice(0, 20)) console.log('  f' + i.frame, 'shot', i.shot, i.meshes.join(','));
console.log(`camera below ground: ${n('belowGround')} frames`, report.belowGround.slice(0, 10).map((x) => x.frame).join(','));
console.log(`camera jerks: ${n('jerks')}`); for (const j of report.jerks.slice(0, 20)) console.log('  ', JSON.stringify(j));
const popsByName = {}; for (const p of report.pops) (popsByName[p.name] ||= []).push(p.frame);
console.log(`mid-shot pops: ${n('pops')} (${Object.keys(popsByName).length} objects)`); for (const [k, v] of Object.entries(popsByName).slice(0, 30)) console.log('  ', k, 'frames', v.slice(0, 8).join(','));
await browser.close(); server.close();
process.exit(n('intersections') + n('cameraInside') + n('belowGround') + n('jerks') + n('pops') ? 2 : 0);
