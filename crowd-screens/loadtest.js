'use strict';
// Simulates a crowd of phones plus one operator, and reports how fast cues arrive.
// Usage: node loadtest.js <ws-url> <phones> <operator-key> [cues]
//   e.g. node loadtest.js ws://localhost:8080/ws 5000 mykey 10

const WebSocket = require('ws');
const [url = 'ws://localhost:8080/ws', nArg = '1000', key = '', cuesArg = '10'] = process.argv.slice(2);
const N = Number(nArg), CUES = Number(cuesArg);
const phones = [];
let open = 0, failed = 0, dropped = 0;
let sentAt = 0, lat = [];

function phone() {
  const ws = new WebSocket(url, { perMessageDeflate: false });
  ws.on('open', () => { open++; ws.send(JSON.stringify({ t: 'hello', role: 'aud', zone: '' })); });
  ws.on('message', (d) => { if (d.toString().startsWith('{"t":"cue"')) lat.push(Date.now() - sentAt); });
  ws.on('error', () => { failed++; });
  ws.on('close', () => { dropped++; });
  phones.push(ws);
}
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];

(async () => {
  console.log(`Connecting ${N} phones to ${url} ...`);
  for (let i = 0; i < N; i++) { phone(); if (i % 250 === 249) await new Promise((r) => setTimeout(r, 250)); }
  for (let i = 0; i < 100 && open + failed < N; i++) await new Promise((r) => setTimeout(r, 200));
  console.log(`Connected: ${open}/${N}  failed: ${failed}`);

  const pad = new WebSocket(url);
  await new Promise((r) => pad.on('open', r));
  pad.send(JSON.stringify({ t: 'hello', role: 'pad', key }));
  await new Promise((r) => setTimeout(r, 500));

  let worst = 0, missing = 0;
  for (let i = 0; i < CUES; i++) {
    lat = []; sentAt = Date.now();
    pad.send(JSON.stringify({ t: 'cue', look: { type: 'color', c: [i % 2 ? 255 : 0, 80, 200], fade: 0 } }));
    await new Promise((r) => setTimeout(r, 1500));
    lat.sort((a, b) => a - b);
    missing += open - lat.length;
    if (lat.length) worst = Math.max(worst, lat[lat.length - 1]);
    console.log(`cue ${i + 1}: received ${lat.length}/${open}  p50 ${pct(lat, 0.5)}ms  p99 ${pct(lat, 0.99)}ms  max ${lat[lat.length - 1]}ms`);
  }
  console.log(`\nMissed deliveries: ${missing}   slowest delivery: ${worst}ms   dropped connections: ${dropped}`);
  console.log('Cues fire 500ms after sending by default, so every delivery under 500ms lands in sync.');
  process.exit(missing || failed ? 1 : 0);
})();
