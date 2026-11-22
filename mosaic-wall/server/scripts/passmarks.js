#!/usr/bin/env node
'use strict';
// Step 6: reads jobs.csv and prints the pass marks that can be measured from it.
//   node scripts/passmarks.js [jobs.csv] [--since 2026-11-23T10:00]
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const sinceAt = args.indexOf('--since');
const since = sinceAt >= 0 ? new Date(args[sinceAt + 1]) : null;
const file = args.find((a, i) => !a.startsWith('--') && i !== sinceAt + 1) || path.join(__dirname, '..', 'jobs.csv');

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

let jobs = parseCsv(fs.readFileSync(file, 'utf8'));
if (since) jobs = jobs.filter((j) => new Date(j.submitted_at) >= since);
if (!jobs.length) { console.log('No jobs in range.'); process.exit(1); }

const done = jobs.filter((j) => ['ready', 'approved', 'rejected'].includes(j.status));
const secs = done.map((j) => Number(j.seconds_taken)).filter(Number.isFinite).sort((a, b) => a - b);
const median = secs.length ? (secs[Math.floor((secs.length - 1) / 2)] + secs[Math.ceil((secs.length - 1) / 2)]) / 2 : NaN;
const worst = secs.length ? secs[secs.length - 1] : NaN;
const failed = jobs.filter((j) => j.status === 'failed').length;
const finished = done.length + failed;
const failRate = finished ? (failed / finished) * 100 : 0;
const retried = jobs.filter((j) => Number(j.attempts) > 1).length;
const stills = jobs.filter((j) => j.source === 'still').length;
const pending = jobs.length - finished;

// Best hour: most submissions in any 60 minute window.
const times = jobs.map((j) => +new Date(j.submitted_at)).sort((a, b) => a - b);
let bestHour = 0;
for (let i = 0, k = 0; i < times.length; i++) {
  while (times[i] - times[k] > 3600e3) k++;
  bestHour = Math.max(bestHour, i - k + 1);
}

const line = (ok, label, value, mark) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} ${String(value).padEnd(12)} ${mark}`);
console.log(`${jobs.length} jobs from ${file}${since ? ' since ' + since.toISOString() : ''}\n`);
line(median < 120, 'Photo to clip ready, median', median.toFixed(1) + ' s', 'under 120 s');
line(worst < 240, 'Photo to clip ready, worst', worst.toFixed(1) + ' s', 'under 240 s');
line(bestHour >= 30, 'Guests in the busiest hour', bestHour, '30 or more (event target 60)');
line(failRate < 5, 'Failures after one retry', failRate.toFixed(1) + ' %', 'under 5 %');
console.log(`\nInfo  ${retried} job(s) needed the retry, ${stills} used the still-photo fallback, ${pending} still in progress.`);
console.log('Not measured here: wall fps, face likeness (ask 10 guests), 2 hour soak (see touchdesigner/README.md).');
