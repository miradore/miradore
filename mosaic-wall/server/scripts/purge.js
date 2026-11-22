#!/usr/bin/env node
'use strict';
// Deletes guest photos, clips, tiles and job rows older than RETENTION_DAYS (default 7).
//   node scripts/purge.js            delete what is past retention
//   node scripts/purge.js --dry-run  only list it
//   node scripts/purge.js --all      delete everything (after an event)
const fs = require('fs');
const path = require('path');
const { config } = require('../src/config');
const { jobs } = require('../src/db');
const media = require('../src/media');

const dry = process.argv.includes('--dry-run');
const all = process.argv.includes('--all');
const cutoff = Date.now() - config.RETENTION_DAYS * 86400e3;
const old = jobs.all().filter((j) => all || +new Date(j.submitted_at) < cutoff);

for (const j of old) {
  const files = [
    j.photo_path,
    path.join(config.dirs.clips, `${j.id}.mp4`),
    path.join(config.dirs.tiles, `${j.id}.mov`),
    path.join(config.dirs.hero, `${j.id}.mp4`),
  ];
  console.log(`${dry ? 'would delete' : 'deleting'} ${j.id} (${j.submitted_at})`);
  if (dry) continue;
  for (const f of files) fs.rmSync(f, { force: true });
  media.upsertTileColor(j.id, null);
  jobs.remove(j.id);
}
console.log(`${old.length} job(s) ${dry ? 'past retention' : 'removed'}. Remember: photos uploaded to Higgsfield are governed by their retention, not this script.`);
