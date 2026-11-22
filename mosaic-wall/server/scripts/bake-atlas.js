#!/usr/bin/env node
'use strict';
// Step 4b, only if the live wall cannot hold 50 fps. Bakes every tile into one looping HAP video
// (atlas/atlas.mov) that TouchDesigner plays as a single Movie File In TOP.
//   node scripts/bake-atlas.js --cols 10 --rows 10            bake once
//   node scripts/bake-atlas.js --cols 10 --rows 10 --watch    bake every 2 minutes
// Cell positions come from data/cells.csv, which the TouchDesigner wall writes (name,cell).
const fs = require('fs');
const path = require('path');
const { config } = require('../src/config');
const media = require('../src/media');

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const COLS = Number(arg('cols', 10)), ROWS = Number(arg('rows', 10));
const SECONDS = Number(arg('seconds', 10));
const EVERY_MS = Number(arg('every', 120)) * 1000;
// Largest cell, in multiples of 4 px (HAP needs that), that keeps the atlas inside 3840x2160.
const CELL = Math.max(4, Math.floor(Math.min(3840 / COLS, 2160 / ROWS, 320) / 4) * 4);
const cellsCsv = path.join(config.dirs.data, 'cells.csv');

function readCells() {
  const map = new Map();
  if (!fs.existsSync(cellsCsv)) return map;
  for (const line of fs.readFileSync(cellsCsv, 'utf8').split('\n').slice(1)) {
    const [name, cell] = line.trim().split(',');
    if (name && cell !== undefined && Number(cell) >= 0 && Number(cell) < COLS * ROWS) map.set(name, Number(cell));
  }
  return map;
}

async function bake() {
  const cells = readCells();
  if (!cells.size) return console.log('data/cells.csv is empty. Open the wall in TouchDesigner first so it can write the cell layout.');
  const slots = [...cells].filter(([name]) => fs.existsSync(path.join(config.dirs.tiles, name + '.mov')));
  if (!slots.length) return console.log('No tiles to bake.');

  const args = ['-y', '-v', 'error'];
  for (const [name] of slots) args.push('-stream_loop', '-1', '-i', path.join(config.dirs.tiles, name + '.mov'));
  const W = COLS * CELL, H = ROWS * CELL;
  const chains = [`color=c=black:s=${W}x${H}:r=30[bg0]`];
  slots.forEach(([, cell], i) => {
    const x = (cell % COLS) * CELL, y = Math.floor(cell / COLS) * CELL;
    chains.push(`[${i}:v]scale=${CELL}:${CELL},fps=30[t${i}]`);
    chains.push(`[bg${i}][t${i}]overlay=${x}:${y}[bg${i + 1}]`);
  });
  // overlay chain rather than one xstack: it leaves unbaked cells transparent to the live layer and has no input-count limit
  const graphFile = path.join(config.dirs.atlas, 'graph.txt');
  fs.writeFileSync(graphFile, chains.join(';\n'));
  const tmp = path.join(config.dirs.atlas, '.atlas.part');
  args.push('-filter_complex_script', graphFile, '-map', `[bg${slots.length}]`, '-t', String(SECONDS), '-an', '-c:v', 'hap', '-f', 'mov', tmp);

  const t0 = Date.now();
  await media.run('ffmpeg', args);
  fs.renameSync(tmp, path.join(config.dirs.atlas, 'atlas.mov'));
  // TouchDesigner reads this list to know which tiles are now inside the atlas and can stop playing live.
  const listTmp = path.join(config.dirs.atlas, '.baked.part');
  fs.writeFileSync(listTmp, 'name,cell\n' + slots.map(([n, c]) => `${n},${c}`).join('\n') + '\n');
  fs.renameSync(listTmp, path.join(config.dirs.atlas, 'baked.csv'));
  console.log(`${new Date().toLocaleTimeString()} baked ${slots.length} tiles into ${W}x${H} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

(async () => {
  await bake().catch((e) => console.error(e.message));
  if (process.argv.includes('--watch')) setInterval(() => bake().catch((e) => console.error(e.message)), EVERY_MS);
})();
