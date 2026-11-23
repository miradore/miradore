'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const WebSocket = require('ws');

const PORT = 18000 + Math.floor(Math.random() * 2000);
const URL = `ws://localhost:${PORT}/ws`;
const STATE = path.join(os.tmpdir(), `cs-test-${PORT}.json`);
let proc;

function boot() {
  return new Promise((resolve) => {
    proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT, OPERATOR_KEY: 'k', ZONES: 'Left,Right', LEAD_MS: '100', STATE_FILE: STATE, SHOW_NAME: 'ROX <b>' },
    });
    proc.stdout.on('data', (d) => { if (String(d).includes('listening')) resolve(); });
  });
}
function stop(sig = 'SIGTERM') { return new Promise((r) => { proc.once('exit', r); proc.kill(sig); }); }

// A client that records everything it receives.
function client(hello) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const c = { ws, got: [], send: (o) => ws.send(JSON.stringify(o)), of: (t) => c.got.filter((m) => m.t === t), closed: false };
    ws.on('message', (d) => c.got.push(JSON.parse(d)));
    ws.on('close', () => { c.closed = true; });
    ws.on('error', reject);
    ws.on('open', () => { if (hello) c.send(hello); setTimeout(() => resolve(c), 80); });
  });
}
const aud = (zone) => client({ t: 'hello', role: 'aud', zone });
// The pause lets the previous test's cue clear the minimum gap between look changes.
const pad = async () => { const p = await client({ t: 'hello', role: 'pad', key: 'k' }); await wait(450); return p; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test.before(async () => { try { fs.unlinkSync(STATE); } catch {} await boot(); });
test.after(async () => { await stop(); try { fs.unlinkSync(STATE); } catch {} });

test('audience gets its zone position and a clock answer', async () => {
  const a = await aud('right');
  assert.deepStrictEqual(a.of('welcome')[0], { t: 'welcome', zone: 'right', idx: 1, n: 2, master: 1, cue: null });
  a.send({ t: 'sync', c: 42 });
  await wait(50);
  const s = a.of('sync')[0];
  assert.strictEqual(s.c, 42);
  assert.ok(Math.abs(s.s - Date.now()) < 2000);
  a.ws.close();
});

test('unknown zone falls back to the first zone', async () => {
  const a = await aud('nope');
  assert.strictEqual(a.of('welcome')[0].zone, 'left');
  a.ws.close();
});

test('wrong operator key is refused', async () => {
  const p = await client({ t: 'hello', role: 'pad', key: 'wrong' });
  p.send({ t: 'cue', look: { type: 'color', c: [1, 1, 1] } });
  await wait(1200);
  assert.strictEqual(p.of('denied').length, 1);
  assert.strictEqual(p.closed, true);
});

test('audience cannot send cues or brightness', async () => {
  const a = await aud('left'), b = await aud('left');
  a.send({ t: 'cue', look: { type: 'color', c: [1, 2, 3] } });
  a.send({ t: 'master', v: 0 });
  await wait(80);
  assert.strictEqual(b.of('cue').length + b.of('master').length, 0);
  a.ws.close(); b.ws.close();
});

test('cue goes only to the chosen zone, is scheduled ahead and replayed to late joiners', async () => {
  const p = await pad(), l = await aud('left'), r = await aud('right');
  const before = Date.now();
  p.send({ t: 'cue', zones: ['right'], look: { type: 'color', c: [300, -5, 'x'], fade: 99999 } });
  await wait(80);
  assert.strictEqual(l.of('cue').length, 0);
  const c = r.of('cue')[0];
  assert.deepStrictEqual(c.look, { type: 'color', c: [255, 0, 0], fade: 10000 });   // clamped
  assert.ok(c.at - before > 50 && c.at - before < 400);
  assert.deepStrictEqual(p.of('cue')[0].zones, ['right']);                           // pad hears it too
  const late = await aud('right');
  assert.deepStrictEqual(late.of('welcome')[0].cue.look, c.look);
  [p, l, r, late].forEach((x) => x.ws.close());
});

test('bad looks are ignored and limits are enforced', async () => {
  const p = await pad(), a = await aud('left');
  p.send({ t: 'cue', look: { type: 'nope' } });
  p.send({ t: 'cue', look: null });
  p.send({ t: 'cue', look: { type: 'text', text: '' } });
  p.send({ t: 'cue', look: { type: 'split', colors: [[1, 1, 1]] } });
  p.send({ t: 'cue', zones: ['ghost'], look: { type: 'color', c: [1, 1, 1] } });
  p.send({ t: 'cue', look: { type: 'pulse', c: [1, 1, 1], bpm: 900 } });
  await wait(450);
  p.send({ t: 'cue', look: { type: 'text', text: 'x'.repeat(100) + '<script>' } });
  await wait(450);
  p.send({ t: 'cue', look: { type: 'countdown', secs: 99999 } });
  await wait(100);
  const looks = a.of('cue').map((m) => m.look);
  assert.strictEqual(looks.length, 3);
  assert.strictEqual(looks[0].bpm, 180);
  assert.strictEqual(looks[1].text.length, 24);
  assert.ok(looks[2].end - a.of('cue')[2].at === 600000);
  p.ws.close(); a.ws.close();
});

test('beat phase is kept when the tempo was tapped long ago', async () => {
  const p = await pad(), a = await aud('left');
  const t0 = Date.now() - 10 * 60 * 1000 + 123;
  p.send({ t: 'cue', look: { type: 'pulse', c: [1, 1, 1], bpm: 120, t0 } });
  await wait(80);
  const c = a.of('cue')[0];
  assert.ok(c.look.t0 <= c.at && c.at - c.look.t0 < 500);
  const off = ((c.look.t0 - t0) % 500 + 500) % 500;
  assert.ok(off < 0.01 || off > 499.99, `phase moved by ${off}`);
  p.ws.close(); a.ws.close();
});

test('flash is rate limited and never replayed to late joiners', async () => {
  const p = await pad(), a = await aud('left');
  p.send({ t: 'cue', look: { type: 'color', c: [9, 9, 9] } });
  await wait(500);
  for (let i = 0; i < 5; i++) p.send({ t: 'cue', look: { type: 'flash', c: [255, 255, 255] } });
  await wait(100);
  assert.strictEqual(a.of('cue').filter((m) => m.look.type === 'flash').length, 1);
  const late = await aud('left');
  assert.strictEqual(late.of('welcome')[0].cue.look.type, 'color');
  [p, a, late].forEach((x) => x.ws.close());
});

test('brightness is clamped, sent to everyone and remembered', async () => {
  const p = await pad(), a = await aud('right');
  p.send({ t: 'master', v: 7 });
  await wait(200);
  for (let i = 0; i < 50; i++) p.send({ t: 'master', v: 0.9 });
  p.send({ t: 'master', v: 0.4 });
  await wait(200);
  assert.deepStrictEqual(a.of('master').map((m) => m.v), [1, 0.4]);   // clamped, and a burst is merged into one
  const late = await aud('left');
  assert.strictEqual(late.of('welcome')[0].master, 0.4);
  [p, a, late].forEach((x) => x.ws.close());
});

test('fast tapping cannot strobe: changes are spaced out and the last tap wins', async () => {
  const p = await pad(), a = await aud('left');
  // 20 alternating white/black taps in one second, then a final red.
  for (let i = 0; i < 20; i++) { p.send({ t: 'cue', look: { type: 'color', c: i % 2 ? [0, 0, 0] : [255, 255, 255] } }); await wait(50); }
  p.send({ t: 'cue', look: { type: 'color', c: [255, 0, 0] } });
  await wait(700);
  const cues = a.of('cue');
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].at - cues[i - 1].at >= 333, `gap ${cues[i].at - cues[i - 1].at}`);
  assert.ok(cues.length <= 6, `${cues.length} changes`);
  assert.deepStrictEqual(cues[cues.length - 1].look.c, [255, 0, 0]);
  p.ws.close(); a.ws.close();
});

test('re-timing a beat look is limited, and flash is thinned while a beat look runs', async () => {
  const p = await pad(), a = await aud('left');
  p.send({ t: 'cue', look: { type: 'pulse', c: [255, 255, 255], bpm: 180 } });
  await wait(450);
  for (let i = 0; i < 10; i++) { p.send({ t: 'cue', look: { type: 'pulse', c: [255, 255, 255], bpm: 180, t0: Date.now() } }); await wait(100); }
  for (let i = 0; i < 5; i++) { p.send({ t: 'cue', look: { type: 'flash', c: [255, 255, 255] } }); await wait(100); }
  await wait(1200);
  const cues = a.of('cue');
  assert.strictEqual(cues.filter((m) => m.look.type === 'flash').length, 0, 'no flash on top of a 180 BPM pulse');
  const pulses = cues.filter((m) => m.look.type === 'pulse');
  assert.ok(pulses.length <= 3, `${pulses.length} pulse cues`);
  for (let i = 1; i < pulses.length; i++) assert.ok(pulses[i].at - pulses[i - 1].at >= 1999);
  p.ws.close(); a.ws.close();
});

test('a connection that never identifies itself is closed', async () => {
  const c = await client(null);
  await wait(10500);
  assert.strictEqual(c.closed, true);
});

test('standby clears the live look', async () => {
  const p = await pad();
  p.send({ t: 'cue', look: { type: 'idle' } });
  await wait(80);
  const late = await aud('left');
  assert.strictEqual(late.of('welcome')[0].cue, null);
  p.ws.close(); late.ws.close();
});

test('a chatty phone is cut off, garbage is ignored', async () => {
  const a = await aud('left');
  a.ws.send('not json'); a.ws.send('[1,2]'); a.ws.send('null');
  await wait(50);
  assert.strictEqual(a.closed, false);
  for (let i = 0; i < 200; i++) a.send({ t: 'sync', c: i });
  await wait(150);
  assert.strictEqual(a.closed, true);
});

test('pages are served, show name is escaped, QR works', async () => {
  const get = async (p) => { const r = await fetch(`http://localhost:${PORT}${p}`); return { r, body: await r.text() }; };
  const home = await get('/');
  assert.strictEqual(home.r.status, 200);
  assert.ok(home.body.includes('ROX &lt;b&gt;') && !home.body.includes('ROX <b>'));
  assert.ok(home.body.includes('Looks.create') && !home.body.includes('__LOOKS__'));
  assert.strictEqual(home.r.headers.get('referrer-policy'), 'no-referrer');
  assert.strictEqual((await get('/pad')).r.status, 200);
  const qr = await get('/qr?z=right');
  assert.ok(qr.body.startsWith('<svg'));
  assert.strictEqual((await get('/server.js')).r.status, 404);
  assert.strictEqual((await get('/../server.js')).r.status, 404);
  assert.strictEqual(JSON.parse((await get('/healthz')).body).ok, true);
});

test('the live look survives a server restart', async () => {
  const p = await pad();
  p.send({ t: 'cue', look: { type: 'rainbow' } });
  await wait(80);
  await stop();
  await boot();
  const a = await aud('left');
  assert.strictEqual(a.of('welcome')[0].cue.look.type, 'rainbow');
  assert.strictEqual(a.of('welcome')[0].master, 0.4);
  a.ws.close();
});

test('a tampered state file cannot inject a broken or unsafe look', async () => {
  await stop();
  fs.writeFileSync(STATE, JSON.stringify({ saved: Date.now(), master: 55, cues: {
    left: { t: 'cue', at: Date.now(), look: { type: 'cycle', colors: [], period: 1 } },
    right: { t: 'cue', at: Date.now(), look: { type: 'pulse', c: [255, 255, 255], bpm: 6000, t0: 0 } },
  } }));
  await boot();
  const l = await aud('left'), r = await aud('right');
  assert.strictEqual(l.of('welcome')[0].cue, null);
  assert.strictEqual(l.of('welcome')[0].master, 1);
  assert.strictEqual(r.of('welcome')[0].cue.look.bpm, 180);
  l.ws.close(); r.ws.close();
});

test('the audience limit never locks the operator out', async () => {
  await stop();
  process.env.MAX_CLIENTS = '3';
  await boot();
  delete process.env.MAX_CLIENTS;
  const as = [];
  for (let i = 0; i < 5; i++) as.push(await aud('left'));
  await wait(100);
  assert.strictEqual(as.filter((a) => a.of('welcome').length).length, 3);
  const p = await pad();
  assert.strictEqual(p.of('welcome').length, 1);
  as.forEach((a) => a.ws.close()); p.ws.close();
});
