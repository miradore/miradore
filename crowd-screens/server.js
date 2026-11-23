'use strict';
// Miradore Crowd Screens: show server.
// Serves the audience page and the operator pad, keeps one shared clock,
// and relays small scheduled cues from the pad to every phone.

const http = require('http');
const fs = require('fs');
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
const MAX_BPM = 180; // 3 flashes per second at most (photosensitivity limit)

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
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const rgb = (c, dflt = [255, 255, 255]) =>
  Array.isArray(c) && c.length === 3 ? c.map((v) => Math.round(num(v, 0, 255, 0))) : dflt;
const str = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function cleanLook(l, at) {
  if (!l || typeof l !== 'object') return null;
  switch (l.type) {
    case 'color': return { type: 'color', c: rgb(l.c), fade: num(l.fade, 0, 10000, 0) };
    case 'rainbow': return { type: 'rainbow', period: num(l.period, 2000, 60000, 6000) };
    case 'pulse': return { type: 'pulse', c: rgb(l.c), bpm: num(l.bpm, 30, MAX_BPM, 120), t0: num(l.t0, at - 60000, at + 5000, at) };
    case 'sparkle': return { type: 'sparkle', c: rgb(l.c) };
    case 'chase': return { type: 'chase', c: rgb(l.c), period: num(l.period, 1000, 20000, 3000) };
    case 'cycle': {
      const colors = (Array.isArray(l.colors) ? l.colors : []).slice(0, 6).map((c) => rgb(c));
      if (colors.length < 2) return null;
      return { type: 'cycle', colors, period: num(l.period, 2000, 60000, 8000) };
    }
    case 'text': {
      const text = str(l.text, 24);
      if (!text) return null;
      return { type: 'text', text, fg: rgb(l.fg, [0, 0, 0]), bg: rgb(l.bg) };
    }
    case 'countdown':
      return {
        type: 'countdown', end: at + num(l.secs, 1, 600, 10) * 1000,
        endText: str(l.endText, 12) || 'GO!', fg: rgb(l.fg, [0, 0, 0]), bg: rgb(l.bg),
      };
    default: return null;
  }
}

// ---------- HTTP ----------
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/pad': ['pad.html', 'text/html; charset=utf-8'],
};
const cache = new Map();
function readFile(name) {
  if (!cache.has(name) || process.env.NODE_ENV !== 'production') {
    cache.set(name, fs.readFileSync(path.join(__dirname, 'public', name)));
  }
  return cache.get(name);
}
function baseUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0];
  return `${proto}://${req.headers.host}`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, phones: audience.size }));
    }
    if (url.pathname === '/qr') {
      const zone = zoneById.get(url.searchParams.get('z')) || ZONES[0];
      const link = `${baseUrl(req)}/?z=${zone.id}`;
      const svg = await QRCode.toString(link, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
      return res.end(svg);
    }
    const f = files[url.pathname];
    if (!f || req.method !== 'GET') { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': f[1], 'cache-control': 'no-cache' });
    res.end(readFile(f[0]));
  } catch (e) {
    res.writeHead(500); res.end('Error');
  }
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false, maxPayload: 4096 });
const audience = new Set();
const pads = new Set();
const zoneClients = new Map(ZONES.map((z) => [z.id, new Set()]));
const zoneCue = new Map(); // zone id -> last cue, replayed to phones that join late

const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
const keyOk = (k) => {
  const a = Buffer.from(String(k || '')), b = Buffer.from(OPERATOR_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

wss.on('connection', (ws) => {
  if (wss.clients.size > MAX_CLIENTS) return ws.close(1013, 'full');
  ws.alive = true;
  ws.msgs = 0;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('error', () => {});
  ws.on('message', (raw) => {
    // Phones only ever need a handful of messages; cut off anything chatty.
    if (++ws.msgs > 120 && ws.role !== 'pad') return ws.terminate();
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'sync') return send(ws, { t: 'sync', c: m.c, s: now() });

    if (m.t === 'hello' && !ws.role) {
      if (m.role === 'pad') {
        if (!keyOk(m.key)) { send(ws, { t: 'denied' }); return ws.close(); }
        ws.role = 'pad';
        pads.add(ws);
        return send(ws, { t: 'welcome', zones: ZONES, lead: LEAD_MS, maxBpm: MAX_BPM });
      }
      const zone = zoneById.get(m.zone) || ZONES[0];
      ws.role = 'aud';
      ws.zone = zone.id;
      audience.add(ws);
      zoneClients.get(zone.id).add(ws);
      return send(ws, { t: 'welcome', zone: zone.id, idx: zone.index, n: ZONES.length, cue: zoneCue.get(zone.id) || null });
    }

    if (m.t === 'cue' && ws.role === 'pad') {
      const at = now() + LEAD_MS;
      const look = cleanLook(m.look, at);
      if (!look) return;
      const targets = Array.isArray(m.zones) && m.zones.length
        ? m.zones.filter((id) => zoneById.has(id)) : ZONES.map((z) => z.id);
      const cue = { t: 'cue', at, look };
      const payload = JSON.stringify(cue);
      for (const id of targets) {
        zoneCue.set(id, cue);
        for (const c of zoneClients.get(id)) if (c.readyState === 1) c.send(payload);
      }
    }
  });
  ws.on('close', () => {
    audience.delete(ws);
    pads.delete(ws);
    if (ws.zone) zoneClients.get(ws.zone).delete(ws);
  });
});

// Live phone counts for the pad.
setInterval(() => {
  if (!pads.size) return;
  const zones = {};
  for (const [id, set] of zoneClients) zones[id] = set.size;
  const payload = JSON.stringify({ t: 'stats', total: audience.size, zones });
  for (const p of pads) if (p.readyState === 1) p.send(payload);
}, 1000);

// Drop connections that went away without saying so.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.msgs = 0; // the message allowance is per 30 seconds
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`Crowd Screens listening on :${PORT}`);
  console.log(`Zones: ${ZONES.map((z) => z.name).join(', ')}`);
  console.log(`Operator pad: /pad?key=${OPERATOR_KEY}`);
});
