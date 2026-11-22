'use strict';
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { config } = require('./config');

const db = new DatabaseSync(config.dbFile);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 3000;
  CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT PRIMARY KEY,
    theme         TEXT NOT NULL,
    photo_path    TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'new',   -- new, generating, ready, approved, rejected, failed
    submitted_at  TEXT NOT NULL,
    ready_at      TEXT,
    seconds_taken REAL,                          -- submit to clip ready, queue wait included
    error         TEXT,
    attempts      INTEGER NOT NULL DEFAULT 0,
    request_id    TEXT,                          -- Higgsfield request id, so a restart can resume polling
    clip_path     TEXT,
    source        TEXT                           -- model name, "mock" or "still"
  );
  CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, submitted_at);
`);

const COLUMNS = ['id', 'theme', 'photo_path', 'status', 'submitted_at', 'ready_at', 'seconds_taken', 'error', 'attempts', 'source'];

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** jobs.csv always mirrors the whole table. Written to a temp file first so a reader never sees half a file. */
function writeCsv() {
  const rows = db.prepare('SELECT * FROM jobs ORDER BY submitted_at').all();
  const lines = [COLUMNS.join(',')];
  for (const r of rows) lines.push(COLUMNS.map((c) => csvCell(r[c])).join(','));
  const tmp = config.jobsCsv + '.tmp';
  fs.writeFileSync(tmp, lines.join('\n') + '\n');
  fs.renameSync(tmp, config.jobsCsv);
}

const jobs = {
  create({ id, theme, photoPath }) {
    db.prepare('INSERT INTO jobs (id, theme, photo_path, submitted_at) VALUES (?, ?, ?, ?)')
      .run(id, theme, photoPath, new Date().toISOString());
    writeCsv();
    return jobs.get(id);
  },
  get: (id) => db.prepare('SELECT * FROM jobs WHERE id = ?').get(id),
  all: () => db.prepare('SELECT * FROM jobs ORDER BY submitted_at').all(),
  byStatus: (status) => db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY submitted_at').all(status),
  update(id, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return jobs.get(id);
    db.prepare(`UPDATE jobs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...keys.map((k) => fields[k]), id);
    writeCsv();
    return jobs.get(id);
  },
  remove(id) {
    db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
    writeCsv();
  },
  counts() {
    const out = { new: 0, generating: 0, ready: 0, approved: 0, rejected: 0, failed: 0 };
    for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status').all()) out[r.status] = r.n;
    return out;
  },
};

writeCsv();
module.exports = { jobs, writeCsv };
