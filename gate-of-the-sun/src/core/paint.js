// Procedural gouache texture maps. Each is a tileable multiply map around 1.0 (grey, slight hue drift)
// that makeCel samples in world space (triplanar), so painted variation follows the geometry without UVs.
import * as THREE from 'three';
import { mulberry32 } from '../../shared/map.js';

const SIZE = 512;
const cache = new Map();

function tileNoise(rng, cells) {
  // value noise on a wrapping lattice
  const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = rng();
  return (x, y) => {
    const fx = (x / SIZE) * cells, fy = (y / SIZE) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (a, b) => g[((b % cells + cells) % cells) * cells + ((a % cells + cells) % cells)];
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function strokes(ctx, rng, n, { len = [30, 120], w = [6, 22], alpha = [0.03, 0.08], angle = 0, spread = 0.4, light = 0.5 }) {
  // soft brush strokes, drawn three times with wrap offsets so the map tiles
  for (let i = 0; i < n; i++) {
    const x = rng() * SIZE, y = rng() * SIZE;
    const L = len[0] + rng() * (len[1] - len[0]);
    const W = w[0] + rng() * (w[1] - w[0]);
    const a = angle + (rng() - 0.5) * spread * Math.PI;
    const v = rng() < light ? 255 : 0;
    ctx.strokeStyle = `rgba(${v},${v},${v},${(alpha[0] + rng() * (alpha[1] - alpha[0])).toFixed(3)})`;
    ctx.lineWidth = W; ctx.lineCap = 'round';
    for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) {
      ctx.beginPath();
      const bend = (rng() - 0.5) * L * 0.3;
      ctx.moveTo(x + ox - Math.cos(a) * L / 2, y + oy - Math.sin(a) * L / 2);
      ctx.quadraticCurveTo(x + ox - Math.sin(a) * bend, y + oy + Math.cos(a) * bend, x + ox + Math.cos(a) * L / 2, y + oy + Math.sin(a) * L / 2);
      ctx.stroke();
    }
  }
}

function blotches(ctx, rng, n, { r = [20, 80], alpha = [0.03, 0.07], light = 0.5 }) {
  for (let i = 0; i < n; i++) {
    const x = rng() * SIZE, y = rng() * SIZE, R = r[0] + rng() * (r[1] - r[0]);
    const v = rng() < light ? 255 : 0;
    const a = alpha[0] + rng() * (alpha[1] - alpha[0]);
    for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, R);
      g.addColorStop(0, `rgba(${v},${v},${v},${a})`); g.addColorStop(0.7, `rgba(${v},${v},${v},${a * 0.8})`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + ox, y + oy, R, 0, Math.PI * 2); ctx.fill();
    }
  }
}

const KINDS = {
  stucco(ctx, rng) {
    blotches(ctx, rng, 60, { r: [40, 140], alpha: [0.03, 0.06] });
    strokes(ctx, rng, 220, { len: [60, 200], w: [10, 30], alpha: [0.02, 0.05], angle: 0, spread: 0.25 });
    blotches(ctx, rng, 30, { r: [6, 20], alpha: [0.04, 0.08], light: 0.3 });
  },
  stone(ctx, rng) {
    blotches(ctx, rng, 80, { r: [30, 110], alpha: [0.04, 0.08] });
    strokes(ctx, rng, 120, { len: [80, 260], w: [4, 14], alpha: [0.03, 0.07], angle: Math.PI / 2, spread: 0.08, light: 0.25 });
    strokes(ctx, rng, 200, { len: [30, 90], w: [8, 20], alpha: [0.03, 0.06], angle: 0, spread: 0.3 });
    blotches(ctx, rng, 120, { r: [2, 6], alpha: [0.08, 0.16], light: 0.2 });
  },
  ground(ctx, rng) {
    blotches(ctx, rng, 90, { r: [30, 120], alpha: [0.03, 0.07] });
    strokes(ctx, rng, 160, { len: [40, 140], w: [10, 26], alpha: [0.02, 0.05], angle: 0.3, spread: 0.6 });
    blotches(ctx, rng, 260, { r: [2, 5], alpha: [0.1, 0.2], light: 0.35 });
  },
  paving(ctx, rng) {
    KINDS.ground(ctx, rng);
    // slab joints: irregular rows of slabs, tile 4 x 4 slabs
    ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 3;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const y = r * SIZE / rows;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y); ctx.stroke();
      const off = (r % 2) * SIZE / 8;
      for (let c = 0; c < 4; c++) { const x = (off + c * SIZE / 4 + (rng() - 0.5) * 20 + SIZE) % SIZE; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + SIZE / rows); ctx.stroke(); }
    }
  },
  metal(ctx, rng) {
    blotches(ctx, rng, 70, { r: [20, 90], alpha: [0.05, 0.1] });
    strokes(ctx, rng, 160, { len: [60, 220], w: [3, 10], alpha: [0.04, 0.09], angle: Math.PI / 2, spread: 0.06, light: 0.3 });
    blotches(ctx, rng, 140, { r: [3, 9], alpha: [0.06, 0.12], light: 0.6 });
  },
  foliage(ctx, rng) {
    for (let i = 0; i < 500; i++) blotches(ctx, rng, 1, { r: [8, 22], alpha: [0.08, 0.14], light: rng() < 0.5 ? 0.9 : 0.1 });
  },
  soft(ctx, rng) {
    blotches(ctx, rng, 50, { r: [40, 150], alpha: [0.02, 0.05] });
    strokes(ctx, rng, 100, { len: [60, 180], w: [12, 30], alpha: [0.015, 0.035], spread: 1 });
  },
};

/** Returns a cached CanvasTexture for a paint kind ('stucco','stone','ground','paving','metal','foliage','soft'). */
export function paintTexture(kind = 'soft', seed = 1) {
  const key = kind + ':' + seed;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgb(232,232,232)'; ctx.fillRect(0, 0, SIZE, SIZE);   // 232/255 ~ 0.91, scaled to ~1 in shader
  const rng = mulberry32(seed * 7919 + kind.length * 104729);
  (KINDS[kind] || KINDS.soft)(ctx, rng);
  // faint large scale noise so tiles never read as repeats
  const img = ctx.getImageData(0, 0, SIZE, SIZE); const n = tileNoise(rng, 6);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4; const v = (n(x, y) - 0.5) * 18;
    img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v * 1.1;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4; tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}
