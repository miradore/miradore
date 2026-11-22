'use strict';
// Everything that shells out to ffmpeg. Arguments go through execFile, never a shell.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { config } = require('./config');

function run(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 32 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        const tail = String(stderr || '').trim().split('\n').slice(-3).join(' | ');
        reject(new Error(`${bin} failed: ${tail || err.message}`));
      } else resolve(stdout);
    });
  });
}

async function duration(file) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(String(out).trim()) || 0;
}

/**
 * Square 320x320 HAP tile for TouchDesigner. Written under a dot-name and renamed at the end,
 * so the Folder DAT never picks up a half-written file.
 */
async function makeTile(clipPath, id) {
  const out = path.join(config.dirs.tiles, `${id}.mov`);
  const tmp = path.join(config.dirs.tiles, `.${id}.part`);
  await run('ffmpeg', [
    '-y', '-v', 'error', '-i', clipPath,
    '-vf', 'crop=min(iw\\,ih):min(iw\\,ih),scale=320:320,fps=30',
    '-an', '-c:v', 'hap', '-f', 'mov', tmp,
  ]);
  fs.renameSync(tmp, out);
  return out;
}

/** Average colour of the tile's middle frame, 0..1 per channel. Used by the Step 5 reveal. */
async function averageColor(file) {
  const mid = (await duration(file)) / 2;
  const buf = await run('ffmpeg', [
    '-v', 'error', '-ss', mid.toFixed(2), '-i', file, '-frames:v', '1',
    '-vf', 'scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ], { encoding: 'buffer' });
  if (buf.length < 3) throw new Error('could not read a frame for the average colour');
  return [buf[0] / 255, buf[1] / 255, buf[2] / 255];
}

/** tile_colors.csv: one row per tile (name,r,g,b). TouchDesigner reads it for the mosaic reveal. */
function upsertTileColor(name, rgb) {
  const rows = new Map();
  if (fs.existsSync(config.tileColorsCsv)) {
    for (const line of fs.readFileSync(config.tileColorsCsv, 'utf8').split('\n').slice(1)) {
      const [n, r, g, b] = line.split(',');
      if (n) rows.set(n, [r, g, b]);
    }
  }
  if (rgb) rows.set(name, rgb.map((v) => Number(v).toFixed(4)));
  else rows.delete(name);
  const tmp = config.tileColorsCsv + '.tmp';
  fs.writeFileSync(tmp, 'name,r,g,b\n' + [...rows].map(([n, c]) => [n, ...c].join(',')).join('\n') + '\n');
  fs.renameSync(tmp, config.tileColorsCsv);
}

/** 5 second slow push-in on the still photo. Used by the mock provider and as the last-resort fallback. */
async function makeStillClip(photoPath, outPath, seconds = 5) {
  const frames = Math.round(seconds * 30);
  const tmp = outPath + '.part';
  await run('ffmpeg', [
    '-y', '-v', 'error', '-loop', '1', '-i', photoPath,
    '-vf', `scale=2160:2700,zoompan=z='1+0.12*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1350:fps=30`,
    '-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-f', 'mp4', tmp,
  ]);
  fs.renameSync(tmp, outPath);
  return outPath;
}

module.exports = { run, duration, makeTile, averageColor, upsertTileColor, makeStillClip };
