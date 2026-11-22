#!/usr/bin/env node
'use strict';
// Step 4 check: duplicate the real tiles until there are N (default 100), so the wall can be load tested.
//   node scripts/make-test-tiles.js 100        make copies named dup001.mov ...
//   node scripts/make-test-tiles.js --clean    remove the copies again
const fs = require('fs');
const path = require('path');
const { config } = require('../src/config');
const media = require('../src/media');

const tiles = config.dirs.tiles;
const isDup = (f) => /^dup\d+\.mov$/.test(f);
const list = () => fs.readdirSync(tiles).filter((f) => f.endsWith('.mov') && !f.startsWith('.'));

if (process.argv[2] === '--clean') {
  for (const f of list().filter(isDup)) {
    fs.unlinkSync(path.join(tiles, f));
    fs.rmSync(path.join(config.dirs.hero, f.replace('.mov', '.mp4')), { force: true });
    media.upsertTileColor(f.replace('.mov', ''), null);
  }
  console.log('Test copies removed.');
  process.exit(0);
}

(async () => {
  const target = Number(process.argv[2]) || 100;
  const real = list().filter((f) => !isDup(f));
  if (!real.length) { console.error('No tiles yet. Approve some clips first.'); process.exit(1); }
  let have = list().length;
  for (let i = 1; have < target; i++) {
    const name = 'dup' + String(i).padStart(3, '0');
    const dest = path.join(tiles, name + '.mov');
    if (fs.existsSync(dest)) continue;
    const src = real[(i - 1) % real.length];
    const hero = path.join(config.dirs.hero, src.replace('.mov', '.mp4'));
    if (fs.existsSync(hero)) fs.copyFileSync(hero, path.join(config.dirs.hero, name + '.mp4'));
    fs.copyFileSync(path.join(tiles, src), path.join(tiles, '.' + name + '.part'));
    fs.renameSync(path.join(tiles, '.' + name + '.part'), dest);
    media.upsertTileColor(name, await media.averageColor(dest));
    have++;
  }
  console.log(`${have} tiles in ${tiles}`);
})();
