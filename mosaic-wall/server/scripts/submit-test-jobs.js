#!/usr/bin/env node
'use strict';
// Step 3 check: push N jobs through the queue without the iPad.
//   node scripts/submit-test-jobs.js 10 path/to/photo1.jpg [photo2.jpg ...]
// With no photos given it makes a plain test card. Use real staff photos when the real API is on.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const n = Number(process.argv[2]) || 10;
let photos = process.argv.slice(3);
const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

(async () => {
  if (!photos.length) {
    const card = path.join(os.tmpdir(), 'mosaic-test-card.jpg');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1350', '-frames:v', '1', card]);
    photos = [card];
    console.log('No photos given, using a test card (fine for GEN_PROVIDER=mock only).');
  }
  const themes = await (await fetch(`${base}/api/themes`)).json();
  for (let i = 0; i < n; i++) {
    const form = new FormData();
    form.append('theme', themes[i % themes.length].id);
    form.append('photo', new Blob([fs.readFileSync(photos[i % photos.length])], { type: 'image/jpeg' }), 'photo.jpg');
    const res = await fetch(`${base}/api/jobs`, { method: 'POST', body: form });
    const body = await res.json();
    console.log(res.ok ? `submitted ${body.jobId}  ${body.clipUrl}` : `FAILED ${JSON.stringify(body)}`);
  }
  console.log(`\nNow approve them at ${base}/operator and read jobs.csv.`);
})();
