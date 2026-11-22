'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const num = (name, def) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== '' ? v : def;
};

const dirs = {
  uploads: path.join(ROOT, 'uploads'),
  clips: path.join(ROOT, 'clips'),
  tiles: path.join(ROOT, 'tiles'),
  hero: path.join(ROOT, 'hero'),
  atlas: path.join(ROOT, 'atlas'),
  data: path.join(ROOT, 'data'),
  certs: path.join(ROOT, 'certs'),
};
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}

const PORT = num('PORT', 3000);

const config = {
  ROOT,
  dirs,
  PORT,
  HTTPS_PORT: num('HTTPS_PORT', 3443),
  PUBLIC_BASE_URL: (process.env.PUBLIC_BASE_URL || `http://${lanIp()}:${PORT}`).replace(/\/$/, ''),
  OPERATOR_LOCAL_ONLY: (process.env.OPERATOR_LOCAL_ONLY || 'true') !== 'false',
  RETENTION_DAYS: num('RETENTION_DAYS', 7),
  GEN_PROVIDER: process.env.GEN_PROVIDER || 'higgsfield',
  GEN_MODEL: process.env.GEN_MODEL || 'dop-turbo',
  MAX_CONCURRENCY: Math.max(1, num('MAX_CONCURRENCY', 3)),
  GEN_TIMEOUT_S: num('GEN_TIMEOUT_S', 300),
  POLL_INTERVAL_MS: num('POLL_INTERVAL_MS', 3000),
  MOCK_SECONDS: num('MOCK_SECONDS', 5),
  MOCK_FAIL_RATE: num('MOCK_FAIL_RATE', 0),
  HF_CREDENTIALS: process.env.HF_CREDENTIALS || '',
  jobsCsv: path.join(ROOT, 'jobs.csv'),
  tileColorsCsv: path.join(dirs.data, 'tile_colors.csv'),
  dbFile: path.join(dirs.data, 'jobs.db'),
};

function loadThemes() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'themes.json'), 'utf8'));
  return { avoid: raw.avoid || '', themes: raw.themes || [] };
}

function loadModel() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8'));
  const model = raw.models[config.GEN_MODEL];
  if (!model) throw new Error(`GEN_MODEL "${config.GEN_MODEL}" is not in models.json`);
  return model;
}

module.exports = { config, loadThemes, loadModel };
