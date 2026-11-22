'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');

const { config, loadThemes } = require('./src/config');
const { jobs } = require('./src/db');
const media = require('./src/media');
const queue = require('./src/queue');

const app = express();
app.disable('x-powered-by');
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes; ids are also valid TouchDesigner operator names
const newId = () => Array.from(crypto.randomBytes(8), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
const validId = (id) => /^[a-z0-9]{8}$/.test(id);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------- booth (iPad)

app.get('/api/themes', (req, res) => {
  const themes = loadThemes().themes.filter((t) => t.enabled !== false).slice(0, 3);
  res.json(themes.map(({ id, label, color }) => ({ id, label, color })));
});

app.post('/api/jobs', upload.single('photo'), (req, res) => {
  const theme = String(req.body.theme || '');
  if (!loadThemes().themes.some((t) => t.id === theme)) return res.status(400).json({ error: 'Unknown theme' });
  const buf = req.file && req.file.buffer;
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return res.status(400).json({ error: 'Photo must be a JPEG' });
  const id = newId();
  const photoPath = path.join(config.dirs.uploads, `${id}.jpg`);
  fs.writeFileSync(photoPath, buf);
  jobs.create({ id, theme, photoPath });
  console.log(`[job] ${id} submitted (${theme})`);
  res.json({ jobId: id, clipUrl: `${config.PUBLIC_BASE_URL}/clip/${id}` });
});

app.get('/api/qr/:id.svg', wrap(async (req, res) => {
  if (!validId(req.params.id)) return res.sendStatus(404);
  const svg = await QRCode.toString(`${config.PUBLIC_BASE_URL}/clip/${req.params.id}`, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
  res.type('image/svg+xml').send(svg);
}));

// ---------------------------------------------------------------- guest phone

// What a guest may know about their job. A clip is only public once the operator has approved it.
function publicState(job) {
  if (!job) return 'gone';
  if (job.status === 'approved') return 'ready';
  if (job.status === 'rejected' || job.status === 'failed') return 'unavailable';
  return 'pending';
}

app.get('/api/clip/:id', (req, res) => res.json({ state: publicState(validId(req.params.id) && jobs.get(req.params.id)) }));

app.get('/clip/:id/video', (req, res) => {
  const job = validId(req.params.id) && jobs.get(req.params.id);
  if (publicState(job) !== 'ready') return res.sendStatus(404);
  const file = path.join(config.dirs.hero, `${job.id}.mp4`);
  if (!fs.existsSync(file)) return res.sendStatus(404);
  if (req.query.download) res.attachment(`miradore-labs-${job.id}.mp4`);
  res.sendFile(file);
});

app.get('/clip/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'clip.html')));

// ---------------------------------------------------------------- operator (MacBook only by default)

const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const operatorOnly = (req, res, next) => {
  if (!config.OPERATOR_LOCAL_ONLY || LOCAL.has(req.socket.remoteAddress)) return next();
  res.status(403).send('The operator page only opens on the MacBook: http://localhost:' + config.PORT + '/operator');
};

app.get('/operator', operatorOnly, (req, res) => res.sendFile(path.join(__dirname, 'public', 'operator.html')));

app.get('/api/operator/jobs', operatorOnly, (req, res) => {
  const all = jobs.all();
  const slim = (j) => ({ id: j.id, theme: j.theme, status: j.status, seconds_taken: j.seconds_taken, error: j.error, attempts: j.attempts, source: j.source, submitted_at: j.submitted_at });
  res.json({
    counts: jobs.counts(),
    provider: config.GEN_PROVIDER === 'mock' ? 'mock' : config.GEN_MODEL,
    ready: all.filter((j) => j.status === 'ready').map(slim),
    failed: all.filter((j) => j.status === 'failed').map(slim),
    waiting: all.filter((j) => j.status === 'new' || j.status === 'generating').map(slim),
  });
});

app.get('/operator/media/:kind/:id', operatorOnly, (req, res) => {
  const job = validId(req.params.id) && jobs.get(req.params.id);
  if (!job) return res.sendStatus(404);
  const file = req.params.kind === 'photo' ? job.photo_path : job.clip_path;
  if (!file || !fs.existsSync(file)) return res.sendStatus(404);
  res.sendFile(file);
});

const jobIn = (statuses) => (req, res, next) => {
  const job = validId(req.params.id) && jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'No such job' });
  if (!statuses.includes(job.status)) return res.status(409).json({ error: `Job is ${job.status}` });
  req.job = job;
  next();
};

app.post('/api/operator/jobs/:id/approve', operatorOnly, jobIn(['ready']), wrap(async (req, res) => {
  const job = req.job;
  // Hero first: the wall plays the hero clip the moment the tile lands in /tiles.
  const hero = path.join(config.dirs.hero, `${job.id}.mp4`);
  fs.copyFileSync(job.clip_path, hero + '.part');
  fs.renameSync(hero + '.part', hero);
  const tile = await media.makeTile(job.clip_path, job.id);
  try {
    media.upsertTileColor(job.id, await media.averageColor(tile));
  } catch (err) {
    console.warn(`[approve] ${job.id} average colour failed: ${err.message}`);
  }
  jobs.update(job.id, { status: 'approved' });
  console.log(`[approve] ${job.id} is on the wall`);
  res.json({ ok: true });
}));

app.post('/api/operator/jobs/:id/reject', operatorOnly, jobIn(['ready']), (req, res) => {
  jobs.update(req.job.id, { status: 'rejected' });
  res.json({ ok: true });
});

app.post('/api/operator/jobs/:id/retry', operatorOnly, jobIn(['failed', 'rejected']), (req, res) => {
  queue.retry(req.job.id);
  res.json({ ok: true });
});

app.post('/api/operator/jobs/:id/still', operatorOnly, jobIn(['failed', 'rejected']), wrap(async (req, res) => {
  await queue.stillFallback(req.job.id);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- static + errors

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: String(err.message || err) });
});

// ---------------------------------------------------------------- listen

http.createServer(app).listen(config.PORT, () => {
  console.log(`Operator page   http://localhost:${config.PORT}/operator`);
  console.log(`Guest clip links ${config.PUBLIC_BASE_URL}/clip/<jobId>`);
});

const keyFile = path.join(config.dirs.certs, 'key.pem');
const certFile = path.join(config.dirs.certs, 'cert.pem');
if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
  https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, app).listen(config.HTTPS_PORT, () => {
    const host = new URL(config.PUBLIC_BASE_URL).hostname;
    console.log(`iPad capture    https://${host}:${config.HTTPS_PORT}/`);
  });
} else {
  console.warn('No certs/ found: the iPad camera needs HTTPS. Run "npm run cert" and restart.');
}

console.log(`Generation: ${config.GEN_PROVIDER === 'mock' ? 'MOCK (no API calls)' : 'Higgsfield ' + config.GEN_MODEL}, concurrency ${config.MAX_CONCURRENCY}`);
queue.start();
