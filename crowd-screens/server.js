'use strict';
// Miradore Crowd Screens: show server.
// Serves the audience page and the operator pad, keeps one shared clock,
// and relays small scheduled cues from the pad to every phone.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT) || 8080;
// How far ahead of "now" a cue is scheduled, so it reaches every phone before it fires.
const LEAD_MS = Number(process.env.LEAD_MS) || 500;
const MAX_CLIENTS = Number(process.env.MAX_CLIENTS) || 20000;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const OPERATOR_KEY = process.env.OPERATOR_KEY || crypto.randomBytes(6).toString('hex');
const SHOW_NAME = (process.env.SHOW_NAME || '').slice(0, 40);
const QUICK_TEXTS = (process.env.QUICK_TEXTS || 'MAKE SOME NOISE,HANDS UP,ONE MORE,THANK YOU')
  .split(',').map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 8);
const STATE_FILE = process.env.STATE_FILE || path.join(os.tmpdir(), `crowd-screens-${PORT}.json`);
const STATE_MAX_AGE_MS = 6 * 3600 * 1000;
// Photosensitivity limit: screens must not flash more than about 3 times a second,
// however fast the pad is tapped. Everything below enforces that on the server.
const MAX_BPM = 180;
const GAP_MS = 334;           // minimum time between two look changes in a zone
const BEAT_REGAP_MS = 2000;   // minimum time between re-timings of a running beat look

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ZONES = (process.env.ZONES || 'Main')
  .split(',').map((s) => s.trim()).filter(Boolean)
  .map((name, index) => ({ id: slug(name) || 'z' + index, name, index }));
const zoneById = new Map(ZONES.map((z) => [z.id, z]));

// Monotonic clock: immune to the server's wall clock being adjusted mid-show.
const T0 = Date.now() - performance.now();
const now = () => T0 + performance.now();

// ---------- look validation (everything from the pad is clamped here) ----------
const num = (v, lo, hi, dflt) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const rgb = (c, dflt = [255, 255, 255]) =>
  Array.isArray(c) && c.length === 3 ? c.map((v) => Math.round(num(v, 0, 255, 0))) : dflt;
const rgbList = (list, max) => (Array.isArray(list) ? list : []).slice(0, max).map((c) => rgb(c));
const str = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
// Keep the operator's beat phase, but anchor it just before the cue so it never drifts out of range.
function beatAnchor(t0, bpm, at) {
  const n = Number(t0);
  if (t0 == null || !Number.isFinite(n)) return at;
  const len = 60000 / bpm;
  return at - ((((at - n) % len) + len) % len);
}

function cleanLook(l, at) {
  if (!l || typeof l !== 'object') return null;
  switch (l.type) {
    case 'idle': return { type: 'idle' };
    case 'color': return { type: 'color', c: rgb(l.c), fade: num(l.fade, 0, 10000, 0) };
    case 'rainbow': return { type: 'rainbow', period: num(l.period, 2000, 60000, 6000) };
    case 'pulse': { const bpm = num(l.bpm, 30, MAX_BPM, 120); return { type: 'pulse', c: rgb(l.c), bpm, t0: beatAnchor(l.t0, bpm, at) }; }
    case 'alt': { const bpm = num(l.bpm, 30, MAX_BPM, 120); return { type: 'alt', a: rgb(l.a), b: rgb(l.b, [0, 0, 0]), bpm, t0: beatAnchor(l.t0, bpm, at) }; }
    case 'breathe': return { type: 'breathe', c: rgb(l.c), period: num(l.period, 2000, 20000, 4000) };
    case 'sparkle': return { type: 'sparkle', c: rgb(l.c) };
    case 'chase': return { type: 'chase', c: rgb(l.c), period: num(l.period, 1000, 20000, 3000) };
    case 'cycle': { const colors = rgbList(l.colors, 6); return colors.length < 2 ? null : { type: 'cycle', colors, period: num(l.period, 2000, 60000, 8000) }; }
    case 'split': { const colors = rgbList(l.colors, 6); return colors.length < 2 ? null : { type: 'split', colors }; }
    case 'shimmer': { const colors = rgbList(l.colors, 6); return colors.length < 2 ? null : { type: 'shimmer', colors, speed: num(l.speed, 200, 5000, 600) }; }
    case 'flash': return { type: 'flash', c: rgb(l.c), dur: num(l.dur, 200, 2000, 700) };
    case 'text': { const text = str(l.text, 24); return text ? { type: 'text', text, fg: rgb(l.fg, [0, 0, 0]), bg: rgb(l.bg) } : null; }
    case 'countdown':
      return {
        type: 'countdown', end: at + num(l.secs, 1, 600, 10) * 1000,
        endText: str(l.endText, 12) || 'GO', fg: rgb(l.fg, [0, 0, 0]), bg: rgb(l.bg),
      };
    default: return null;
  }
}

// ---------- show state (survives a server restart) ----------
const zoneCue = new Map(); // zone id -> last cue, replayed to phones that join late
let master = 1;
try {
  const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  if (Date.now() - s.saved < STATE_MAX_AGE_MS) {
    master = num(s.master, 0, 1, 1);
    for (const [id, cue] of Object.entries(s.cues || {})) {
      const at = Number(cue && cue.at);
      const look = Number.isFinite(at) ? cleanLook(cue.look, at) : null;   // never trust the file blindly
      if (!zoneById.has(id) || !look || look.type === 'idle' || look.type === 'flash') continue;
      if (look.type === 'countdown') look.end = num(cue.look.end, 0, at + 600000, at);
      zoneCue.set(id, { t: 'cue', at, look });
    }
  }
} catch { /* no saved state */ }
let saveTimer = null;
function saveState() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const data = JSON.stringify({ saved: Date.now(), master, cues: Object.fromEntries(zoneCue) });
    fs.writeFile(STATE_FILE + '.tmp', data, (e) => { if (!e) fs.rename(STATE_FILE + '.tmp', STATE_FILE, () => {}); });
  }, 250);
}

// ---------- HTTP ----------
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pages = { '/': 'index.html', '/pad': 'pad.html' };
const cache = new Map();
const qrCache = new Map();
function page(name) {
  if (!cache.has(name) || process.env.DEV) {
    const dir = path.join(__dirname, 'public');
    const html = fs.readFileSync(path.join(dir, name), 'utf8')
      .replace('/*__LOOKS__*/', () => fs.readFileSync(path.join(dir, 'looks.js'), 'utf8'))
      .replace(/__SHOW__/g, () => esc(SHOW_NAME));
    cache.set(name, Buffer.from(html));
  }
  return cache.get(name);
}
function baseUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() === 'https' ? 'https' : 'http';
  const host = /^[a-z0-9.:\-\[\]]+$/i.test(req.headers.host || '') ? req.headers.host : 'localhost';
  return `${proto}://${host}`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, phones: audience.size }));
    }
    if (url.pathname === '/qr') {
      const zone = zoneById.get(url.searchParams.get('z')) || ZONES[0];
      const link = ZONES.length > 1 ? `${baseUrl(req)}/?z=${zone.id}` : `${baseUrl(req)}/`;
      if (!qrCache.has(link)) {
        if (qrCache.size > 50) qrCache.clear();
        qrCache.set(link, await QRCode.toString(link, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' }));
      }
      const svg = qrCache.get(link);
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      return res.end(svg);
    }
    const name = pages[url.pathname];
    if (!name || (req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
    });
    res.end(req.method === 'HEAD' ? undefined : page(name));
  } catch (e) {
    res.writeHead(500); res.end('Error');
  }
});

server.keepAliveTimeout = 65000;   // longer than typical load balancer idle timeouts
server.headersTimeout = 66000;
server.on('error', (e) => { console.error('Server error:', e.message); process.exit(1); });

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false, maxPayload: 4096 });
const audience = new Set();
const pads = new Set();
const zoneClients = new Map(ZONES.map((z) => [z.id, new Set()]));
const zstate = new Map(ZONES.map((z) => [z.id, { lastAt: -1e12, lastFlashAt: -1e12, pending: null, timer: null }]));

const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
function fanout(set, payload) {
  for (const c of set) {
    if (c.readyState !== 1) continue;
    // A phone that has stopped reading is dropped rather than buffered for; it will reconnect.
    if (c.bufferedAmount > 65536) { c.terminate(); continue; }
    c.send(payload);
  }
}
const keyOk = (k) => {
  const a = crypto.createHash('sha256').update(String(k || '')).digest();
  const b = crypto.createHash('sha256').update(OPERATOR_KEY).digest();
  return crypto.timingSafeEqual(a, b);
};
const cuesObject = () => Object.fromEntries(zoneCue);

// ---------- cue scheduling ----------
const isBeat = (l) => !!l && (l.type === 'pulse' || l.type === 'alt');
const liveLook = (id) => (zoneCue.get(id) || {}).look;

// A look change is sent at once if the zone has been quiet for GAP_MS. Otherwise it is held
// and only the latest one is sent when the gap has passed, so fast tapping cannot strobe.
function requestCue(id, raw, t) {
  const z = zstate.get(id);
  clearTimeout(z.timer); z.timer = null; z.pending = null;
  const gap = isBeat(raw) && isBeat(liveLook(id)) ? BEAT_REGAP_MS : GAP_MS;
  const wait = z.lastAt + gap - (t + LEAD_MS);
  if (wait <= 0) return fire(id, raw, t + LEAD_MS);
  z.pending = raw;
  z.timer = setTimeout(() => { z.timer = null; z.pending = null; fire(id, raw, now() + LEAD_MS); }, wait);
}
function fire(id, raw, at) {
  const look = cleanLook(raw, at);
  if (!look) return;
  zstate.get(id).lastAt = at;
  if (look.type === 'idle') zoneCue.delete(id); else zoneCue.set(id, { t: 'cue', at, look });
  fanout(zoneClients.get(id), JSON.stringify({ t: 'cue', at, look }));
  fanout(pads, JSON.stringify({ t: 'cue', at, look, zones: [id] }));
  saveState();
}
// A flash is momentary and never replayed. It shares the zone's change budget, and is
// thinned out further while a beat look is already flashing the screen.
function flashGap(look) {
  const rate = isBeat(look) ? look.bpm / 60 : look && look.type === 'sparkle' ? 2 : 0;
  return rate >= 2.9 ? Infinity : Math.max(GAP_MS, 1000 / (3 - rate));
}
function fireFlash(targets, look, t) {
  const at = t + LEAD_MS;
  const ok = targets.filter((id) => {
    const z = zstate.get(id);
    return !z.pending && at - z.lastAt >= GAP_MS && at - z.lastFlashAt >= flashGap(liveLook(id));
  });
  if (!ok.length) return;
  const payload = JSON.stringify({ t: 'cue', at, look });
  for (const id of ok) {
    const z = zstate.get(id);
    z.lastAt = z.lastFlashAt = at;
    fanout(zoneClients.get(id), payload);
  }
  fanout(pads, JSON.stringify({ t: 'cue', at, look, zones: ok }));
}
let masterTimer = null;
function sendMaster() {
  masterTimer = null;
  const payload = JSON.stringify({ t: 'master', v: master });
  fanout(audience, payload);
  fanout(pads, payload);
}

wss.on('connection', (ws) => {
  // Spare room above the audience limit so the operator can always get in.
  if (wss.clients.size > MAX_CLIENTS + 500) return ws.close(1013, 'full');
  ws.alive = true;
  // A connection that never says who it is does not get to stay.
  ws.helloTimer = setTimeout(() => { if (!ws.role) ws.terminate(); }, 10000);
  ws.msgs = 0;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('error', () => {});
  ws.on('message', (raw) => {
    // Phones only ever need a handful of messages; cut off anything chatty.
    if (++ws.msgs > 120 && ws.role !== 'pad') return ws.terminate();
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'sync') return send(ws, { t: 'sync', c: num(m.c, -1e15, 1e15, 0), s: now() });

    if (m.t === 'hello' && !ws.role) {
      if (m.role === 'pad') {
        if (!keyOk(m.key)) {
          ws.role = 'denied';
          return setTimeout(() => { send(ws, { t: 'denied' }); ws.close(); }, 1000);   // slows key guessing
        }
        ws.role = 'pad';
        pads.add(ws);
        return send(ws, {
          t: 'welcome', zones: ZONES, lead: LEAD_MS, maxBpm: MAX_BPM, flashGap: GAP_MS,
          cues: cuesObject(), master, quick: QUICK_TEXTS, show: SHOW_NAME,
        });
      }
      if (audience.size >= MAX_CLIENTS) return ws.close(1013, 'full');
      const zone = zoneById.get(m.zone) || ZONES[0];
      ws.role = 'aud';
      ws.zone = zone.id;
      audience.add(ws);
      zoneClients.get(zone.id).add(ws);
      return send(ws, { t: 'welcome', zone: zone.id, idx: zone.index, n: ZONES.length, master, cue: zoneCue.get(zone.id) || null });
    }

    if (ws.role !== 'pad') return;

    if (m.t === 'cue') {
      const t = now();
      const probe = cleanLook(m.look, t + LEAD_MS);
      if (!probe) return;
      const targets = Array.isArray(m.zones) && m.zones.length
        ? [...new Set(m.zones.filter((id) => zoneById.has(id)))] : ZONES.map((z) => z.id);
      if (probe.type === 'flash') return fireFlash(targets, probe, t);
      for (const id of targets) requestCue(id, m.look, t);
    } else if (m.t === 'master') {
      master = num(m.v, 0, 1, 1);
      saveState();
      if (!masterTimer) masterTimer = setTimeout(sendMaster, 100);   // at most 10 updates a second
    }
  });
  ws.on('close', () => {
    clearTimeout(ws.helloTimer);
    audience.delete(ws);
    pads.delete(ws);
    if (ws.zone) zoneClients.get(ws.zone).delete(ws);
  });
});

// Live phone counts for the pad.
let peak = 0;
setInterval(() => {
  peak = Math.max(peak, audience.size);
  if (!pads.size) return;
  const zones = {};
  for (const [id, set] of zoneClients) zones[id] = set.size;
  fanout(pads, JSON.stringify({ t: 'stats', total: audience.size, peak, zones }));
}, 1000).unref();

// Drop connections that went away without saying so.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.msgs = 0; // the message allowance is per 30 seconds
    ws.ping();
  }
}, 30000).unref();

// During a show, staying up matters more than stopping on an unexpected error.
process.on('uncaughtException', (e) => console.error('uncaughtException', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify({ saved: Date.now(), master, cues: cuesObject() })); } catch { /* best effort */ }
    for (const ws of wss.clients) ws.close(1012, 'restart');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

server.listen(PORT, () => {
  console.log(`Crowd Screens listening on :${PORT}`);
  console.log(`Zones: ${ZONES.map((z) => z.name).join(', ')}`);
  console.log(`Operator pad: /pad?key=${process.env.OPERATOR_KEY ? '<your OPERATOR_KEY>' : OPERATOR_KEY}`);
  if (OPERATOR_KEY.length < 10) console.warn('Warning: OPERATOR_KEY is short. Use a long random key for a real show.');
});
