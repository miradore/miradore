// Eye, mouth and small decal textures drawn on canvases (anime cue). All textures are
// CanvasTexture in sRGB with transparent edges; meshes use makeFlat with alphaTest 0.5.
import * as THREE from 'three';

function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

/**
 * drawEye(opts) draws one eye in viewer space (as seen from in front of the face) and returns a texture.
 *  size      canvas size in px
 *  irisTop / irisBot   two tone iris colours (dark upper, lighter lower)
 *  open      0..1 upper lid opening (1 open, ~0.5 half, ~0.7 narrowed)
 *  closed    true draws a closed lid curve only
 *  wet       0 none, 1 or 2 wet variants (extra highlights, glossy lower rim, tremble)
 *  lookX, lookY   pupil offset (-1..1), lookY negative looks up
 *  outer     'left' or 'right': screen side of the outer corner (lash flick side)
 *  flat      true gives a flatter, calmer upper lid (lynx)
 *  mirror    true mirrors the canvas horizontally (the skull patches map u left to right as seen from the front, so eyes are not mirrored)
 */
export function drawEye(opts = {}) {
  const S = opts.size ?? 256;
  const c = newCanvas(S, S); const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  if (opts.mirror === true) { g.translate(S, 0); g.scale(-1, 1); }
  const open = opts.closed ? 0 : (opts.open ?? 1);
  const cx = S * 0.5, cy = S * 0.56;
  const rx = S * 0.40;
  const ryTopFull = S * (opts.flat ? 0.33 : 0.40);
  const ryTop = ryTopFull * open;
  const ryBot = S * 0.28;
  const ink = opts.ink ?? '#2a1a14';
  const lw = S * (opts.lid ?? 0.05);
  const outerRight = (opts.outer ?? 'right') === 'right';
  const ox = outerRight ? 1 : -1;

  // upper lid curve (cubic, round top)
  function upperPath(k = 1) {
    g.moveTo(cx - rx, cy);
    g.bezierCurveTo(cx - rx * 0.88, cy - ryTop * 1.38 * k, cx + rx * 0.88, cy - ryTop * 1.38 * k, cx + rx, cy);
  }
  function lowerPath() { g.bezierCurveTo(cx + rx * 0.8, cy + ryBot * 1.3, cx - rx * 0.8, cy + ryBot * 1.3, cx - rx, cy); }

  if (opts.closed) {
    // closed: one curved line sitting low, bulging downward, with a lash flick
    g.strokeStyle = ink; g.lineWidth = lw * 1.1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - rx, cy - S * 0.02);
    g.quadraticCurveTo(cx, cy + ryBot * 1.05, cx + rx, cy - S * 0.02); g.stroke();
    g.beginPath(); g.moveTo(cx + ox * rx, cy - S * 0.02); g.lineTo(cx + ox * (rx + S * 0.05), cy - S * 0.08); g.stroke();
    // faint lower lid
    g.strokeStyle = 'rgba(42,26,20,0.45)'; g.lineWidth = lw * 0.35;
    g.beginPath(); g.moveTo(cx - rx * 0.7, cy + ryBot * 0.95); g.quadraticCurveTo(cx, cy + ryBot * 1.35, cx + rx * 0.7, cy + ryBot * 0.95); g.stroke();
    return toTex(c);
  }

  if (opts.squeeze) {
    // squeezed shut in fear: a bold chevron (">" "<") pointing to the nose, with two little stress ticks
    g.strokeStyle = ink; g.lineWidth = lw * 1.35; g.lineCap = 'round'; g.lineJoin = 'round';
    const ix = -ox;                                   // inner side
    g.beginPath(); g.moveTo(cx - ix * rx * 0.75, cy - ryTopFull * 0.62); g.quadraticCurveTo(cx + ix * rx * 0.05, cy - ryTopFull * 0.18, cx + ix * rx * 0.62, cy + S * 0.01);
    g.quadraticCurveTo(cx + ix * rx * 0.05, cy + ryBot * 0.35, cx - ix * rx * 0.7, cy + ryBot * 0.82); g.stroke();
    g.lineWidth = lw * 0.55;
    g.beginPath(); g.moveTo(cx - ix * rx * 0.95, cy - ryTopFull * 0.2); g.lineTo(cx - ix * rx * 1.12, cy - ryTopFull * 0.32); g.stroke();
    g.beginPath(); g.moveTo(cx - ix * rx * 0.95, cy + ryBot * 0.3); g.lineTo(cx - ix * rx * 1.12, cy + ryBot * 0.42); g.stroke();
    return toTex(c);
  }

  // eye opening
  g.save();
  g.beginPath(); upperPath(); lowerPath(); g.closePath();
  g.fillStyle = opts.sclera ?? '#ffffff'; g.fill();
  g.clip();
  if (opts.wet) { // slightly blue lower sclera when wet
    const sg = g.createLinearGradient(0, cy, 0, cy + ryBot * 1.2); sg.addColorStop(0, 'rgba(205,235,250,0)'); sg.addColorStop(1, 'rgba(190,228,248,0.9)');
    g.fillStyle = sg; g.fillRect(0, cy, S, ryBot * 1.3);
  }
  // iris
  const irR = rx * (opts.irisScale ?? 0.60);
  const ix = cx + (opts.lookX ?? 0) * rx * 0.28;
  const iy = cy + ryTopFull * 0.08 + (opts.lookY ?? 0) * ryTopFull * 0.42;
  const irRy = irR * 1.12;
  const grad = g.createLinearGradient(0, iy - irRy, 0, iy + irRy);
  grad.addColorStop(0, opts.irisTop ?? '#4a2a10'); grad.addColorStop(0.5, opts.irisMid ?? mixHex(opts.irisTop ?? '#4a2a10', opts.irisBot ?? '#e6a53a', 0.5)); grad.addColorStop(1, opts.irisBot ?? '#e6a53a');
  g.fillStyle = grad; g.beginPath(); g.ellipse(ix, iy, irR, irRy, 0, 0, Math.PI * 2); g.fill();
  // iris rim
  g.strokeStyle = 'rgba(30,16,10,0.75)'; g.lineWidth = irR * 0.10; g.beginPath(); g.ellipse(ix, iy, irR * 0.97, irRy * 0.97, 0, 0, Math.PI * 2); g.stroke();
  // lower crescent glow
  g.fillStyle = withAlpha(opts.irisBot ?? '#e6a53a', 0.55, 1.25); g.beginPath(); g.ellipse(ix, iy + irRy * 0.45, irR * 0.55, irRy * 0.32, 0, 0, Math.PI * 2); g.fill();
  // pupil
  const pr = irR * (opts.pupil ?? (opts.wet ? 0.5 : 0.46));
  g.fillStyle = '#15100e'; g.beginPath(); g.ellipse(ix, iy + irRy * 0.04, pr, pr * 1.18, 0, 0, Math.PI * 2); g.fill();
  // lid shadow across the top of the opening
  const sh = g.createLinearGradient(0, cy - ryTop, 0, cy - ryTop * 0.35); sh.addColorStop(0, 'rgba(70,35,50,0.5)'); sh.addColorStop(1, 'rgba(70,35,50,0)');
  g.fillStyle = sh; g.fillRect(0, cy - ryTop - 2, S, ryTop * 0.7);
  // highlights: big upper-left, small lower-right (viewer space)
  const tr = opts.wet === 2 ? S * 0.012 : 0;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(ix - irR * 0.40 + tr, iy - irRy * 0.42, irR * (opts.wet ? 0.34 : 0.30), irRy * (opts.wet ? 0.36 : 0.32), -0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(ix + irR * 0.42 - tr * 0.5, iy + irRy * 0.42, irR * 0.14, irRy * 0.13, 0, 0, Math.PI * 2); g.fill();
  if (opts.wet) {
    g.beginPath(); g.ellipse(ix - irR * 0.05 - tr, iy + irRy * 0.66 + tr * 0.5, irR * 0.12, irRy * 0.09, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(ix + irR * 0.22 + tr, iy - irRy * 0.72, irR * 0.09, irRy * 0.08, 0, 0, Math.PI * 2); g.fill();
    // glossy rim along the lower lid (tear line)
    g.strokeStyle = 'rgba(225,248,255,0.95)'; g.lineWidth = S * 0.028; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - rx * 0.78, cy + ryBot * 0.75 + tr); g.quadraticCurveTo(cx, cy + ryBot * 1.22 + tr, cx + rx * 0.78, cy + ryBot * 0.75 + tr); g.stroke();
  }
  g.restore();

  // upper lid stroke with lash flick at the outer corner
  g.strokeStyle = ink; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); upperPath(); g.stroke();
  g.lineWidth = lw * 0.9; g.beginPath(); g.moveTo(cx + ox * rx, cy); g.lineTo(cx + ox * (rx + S * 0.06), cy - S * 0.08 - ryTop * 0.15); g.stroke();
  // lower lid faint line
  g.strokeStyle = 'rgba(42,26,20,0.5)'; g.lineWidth = lw * 0.3;
  g.beginPath(); g.moveTo(cx - rx * 0.85, cy + ryBot * 0.55); g.bezierCurveTo(cx - rx * 0.5, cy + ryBot * 1.25, cx + rx * 0.5, cy + ryBot * 1.25, cx + rx * 0.85, cy + ryBot * 0.55); g.stroke();
  return toTex(c);
}

function hexToRgb(h) { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mixHex(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); const m = A.map((v, i) => Math.round(v + (B[i] - v) * t)); return `rgb(${m[0]},${m[1]},${m[2]})`; }
function withAlpha(h, a, mul = 1) { const c = hexToRgb(h).map((v) => Math.min(255, Math.round(v * mul))); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

/** A full set of frames for one eye side. style: { irisTop, irisBot, size, flat, lid, sclera, baseOpen } */
export function makeEyeFrames(style, side) {
  // side 'L' is the character's left eye (viewer's right); the outer corner is then on the viewer's right
  const outer = side === 'L' ? 'right' : 'left';
  const base = { ...style, outer, size: style.size ?? 256, open: style.baseOpen ?? 1 };
  const f = {};
  f.open = drawEye(base);
  f.half = drawEye({ ...base, open: (style.baseOpen ?? 1) * 0.45, lookY: 0.15 });
  f.closed = drawEye({ ...base, closed: true });
  f.up = drawEye({ ...base, lookY: -0.75, open: Math.min(1, (style.baseOpen ?? 1) * 1.08) });
  f.wet1 = drawEye({ ...base, wet: 1 });
  f.wet2 = drawEye({ ...base, wet: 2 });
  f.wetUp = drawEye({ ...base, wet: 1, lookY: -0.5 });
  f.narrow = drawEye({ ...base, open: 0.62, flat: true, lookY: 0.05 });
  f.wide = drawEye({ ...base, open: Math.min(1, (style.baseOpen ?? 1) * 1.1), irisScale: 0.52, lookY: -0.3 });
  f.side = drawEye({ ...base, lookX: side === 'L' ? 0.6 : -0.6, lookY: -0.2 });
  // fear and grief (polish pass)
  f.squeeze = drawEye({ ...base, squeeze: true });
  f.fear = drawEye({ ...base, open: Math.min(1, (style.baseOpen ?? 1) * 1.12), irisScale: 0.44, pupil: 0.32, lookY: -0.15 });
  f.fearUp = drawEye({ ...base, open: Math.min(1, (style.baseOpen ?? 1) * 1.12), irisScale: 0.44, pupil: 0.32, lookY: -0.7 });
  f.fearWet1 = drawEye({ ...base, open: Math.min(1, (style.baseOpen ?? 1) * 1.08), irisScale: 0.5, pupil: 0.36, lookY: -0.45, wet: 1 });
  f.fearWet2 = drawEye({ ...base, open: Math.min(1, (style.baseOpen ?? 1) * 1.08), irisScale: 0.5, pupil: 0.36, lookY: -0.45, wet: 2 });
  f.wetGaze1 = drawEye({ ...base, wet: 1, lookX: 0.85, lookY: 0.08, open: (style.baseOpen ?? 1) * 0.9 });
  f.wetGaze2 = drawEye({ ...base, wet: 2, lookX: 0.85, lookY: 0.08, open: (style.baseOpen ?? 1) * 0.9 });
  f.wetGazeHalf = drawEye({ ...base, wet: 1, lookX: 0.7, lookY: 0.2, open: (style.baseOpen ?? 1) * 0.45 });
  return f;
}

/** Mouth frames drawn on a small canvas in viewer space (plane u runs left to right as seen from the front).
 *  closed (soft cat "w"), smile, sad, small, gasp, trem1/trem2 (fear, small open trembling), sadT1/sadT2
 *  (grief: trembling downturned line, no tongue), grit (clenched teeth), scream (wide open, corners down). */
export function makeMouthFrames(opts = {}) {
  const S = opts.size ?? 128; const ink = '#2b1a16'; const inside = '#5a1e24'; const lw = S * 0.06;
  function base() { const c = newCanvas(S, S); const g = c.getContext('2d'); g.clearRect(0, 0, S, S); g.lineCap = 'round'; g.lineJoin = 'round'; return [c, g]; }
  const P = (v) => v * S;
  const out = {};
  { const [c, g] = base(); g.strokeStyle = ink; g.lineWidth = lw;
    g.beginPath(); g.moveTo(P(0.3), P(0.45)); g.quadraticCurveTo(P(0.4), P(0.6), P(0.5), P(0.47)); g.quadraticCurveTo(P(0.6), P(0.6), P(0.7), P(0.45)); g.stroke(); out.closed = toTex(c); }
  { const [c, g] = base(); g.strokeStyle = ink; g.lineWidth = lw;
    g.beginPath(); g.moveTo(P(0.3), P(0.58)); g.quadraticCurveTo(P(0.5), P(0.4), P(0.7), P(0.58)); g.stroke(); out.sad = toTex(c); }
  { const [c, g] = base(); g.fillStyle = ink; g.beginPath(); g.ellipse(P(0.5), P(0.53), P(0.13), P(0.11), 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = inside; g.beginPath(); g.ellipse(P(0.5), P(0.545), P(0.085), P(0.07), 0, 0, Math.PI * 2); g.fill(); out.small = toTex(c); }
  // shocked gasp: a tall "O", dark inside, a sliver of upper teeth, no tongue (an open smile would read as joy)
  { const [c, g] = base(); g.fillStyle = ink; g.beginPath(); g.ellipse(P(0.5), P(0.54), P(0.17), P(0.26), 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = inside; g.beginPath(); g.ellipse(P(0.5), P(0.57), P(0.12), P(0.2), 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(P(0.5), P(0.335), P(0.1), P(0.03), 0, 0, Math.PI * 2); g.fill(); out.gasp = toTex(c); }
  { const [c, g] = base(); g.strokeStyle = ink; g.lineWidth = lw;
    g.beginPath(); g.moveTo(P(0.24), P(0.42)); g.quadraticCurveTo(P(0.37), P(0.66), P(0.5), P(0.48)); g.quadraticCurveTo(P(0.63), P(0.66), P(0.76), P(0.42)); g.stroke(); out.smile = toTex(c); }
  // fear: small open mouth, wavy upper lip, corners pulled down; two phases alternate on 2s
  for (const [k, ph] of [['trem1', 0], ['trem2', 1]]) {
    const [c, g] = base(); const j = ph ? 0.018 : -0.018;
    g.fillStyle = ink; g.beginPath();
    g.moveTo(P(0.33), P(0.58)); g.quadraticCurveTo(P(0.38), P(0.46 + j), P(0.44), P(0.5 - j)); g.quadraticCurveTo(P(0.5), P(0.44 + j), P(0.56), P(0.5 - j)); g.quadraticCurveTo(P(0.62), P(0.46 + j), P(0.67), P(0.58));
    g.quadraticCurveTo(P(0.5), P(0.68), P(0.33), P(0.58)); g.closePath(); g.fill();
    g.fillStyle = inside; g.beginPath(); g.ellipse(P(0.5), P(0.57), P(0.1), P(0.04), 0, 0, Math.PI * 2); g.fill();
    out[k] = toTex(c);
  }
  // grief: trembling downturned line with a tiny dark opening at the centre, no tongue, no smile
  for (const [k, ph] of [['sadT1', 0], ['sadT2', 1]]) {
    const [c, g] = base(); const j = ph ? 0.016 : -0.016;
    g.strokeStyle = ink; g.lineWidth = lw * 0.95;
    g.beginPath(); g.moveTo(P(0.29), P(0.62)); g.quadraticCurveTo(P(0.34), P(0.5 + j), P(0.41), P(0.5 - j)); g.quadraticCurveTo(P(0.5), P(0.46 + j), P(0.59), P(0.5 - j)); g.quadraticCurveTo(P(0.66), P(0.5 + j), P(0.71), P(0.62)); g.stroke();
    g.fillStyle = ink; g.beginPath(); g.ellipse(P(0.5), P(0.53), P(0.07), P(0.045), 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = inside; g.beginPath(); g.ellipse(P(0.5), P(0.54), P(0.04), P(0.022), 0, 0, Math.PI * 2); g.fill();
    out[k] = toTex(c);
  }
  // clenched teeth (bracing): white teeth band, ink outline, tooth lines, corners pulled down
  { const [c, g] = base(); g.fillStyle = '#ffffff'; g.strokeStyle = ink; g.lineWidth = lw * 0.8;
    g.beginPath(); g.moveTo(P(0.24), P(0.5)); g.quadraticCurveTo(P(0.5), P(0.4), P(0.76), P(0.5)); g.lineTo(P(0.72), P(0.64)); g.quadraticCurveTo(P(0.5), P(0.6), P(0.28), P(0.64)); g.closePath(); g.fill(); g.stroke();
    g.lineWidth = lw * 0.5; g.beginPath(); g.moveTo(P(0.26), P(0.56)); g.quadraticCurveTo(P(0.5), P(0.5), P(0.74), P(0.56)); g.stroke();
    for (const x of [0.38, 0.5, 0.62]) { g.beginPath(); g.moveTo(P(x), P(0.46)); g.lineTo(P(x), P(0.62)); g.stroke(); }
    out.grit = toTex(c); }
  // scream: wide open, corners down, upper teeth band, no smile
  { const [c, g] = base(); g.fillStyle = ink; g.beginPath();
    g.moveTo(P(0.26), P(0.62)); g.quadraticCurveTo(P(0.3), P(0.36), P(0.5), P(0.36)); g.quadraticCurveTo(P(0.7), P(0.36), P(0.74), P(0.62)); g.quadraticCurveTo(P(0.5), P(0.82), P(0.26), P(0.62)); g.closePath(); g.fill();
    g.fillStyle = inside; g.beginPath(); g.ellipse(P(0.5), P(0.6), P(0.17), P(0.14), 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(P(0.5), P(0.415), P(0.15), P(0.035), 0, 0, Math.PI * 2); g.fill(); out.scream = toTex(c); }
  return out;
}

/** Cheek blush: three short hatched pink strokes (anime), transparent elsewhere. */
export function makeBlushTexture() {
  const S = 128; const c = newCanvas(S, S); const g = c.getContext('2d'); g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(240,150,160,0.75)'; g.beginPath(); g.ellipse(S * 0.5, S * 0.5, S * 0.36, S * 0.2, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e0727f'; g.lineWidth = S * 0.045; g.lineCap = 'round';
  for (const x of [0.36, 0.5, 0.64]) { g.beginPath(); g.moveTo(S * (x + 0.05), S * 0.36); g.lineTo(S * (x - 0.05), S * 0.62); g.stroke(); }
  return toTex(c);
}

/** Elongated tear drop texture (cyan-white). */
export function makeTearTexture() {
  const S = 64; const c = newCanvas(S, S); const g = c.getContext('2d'); g.clearRect(0, 0, S, S);
  const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, '#f4ffff'); gr.addColorStop(1, '#b9ecff');
  g.fillStyle = gr; g.beginPath(); g.moveTo(S * 0.5, S * 0.05); g.bezierCurveTo(S * 0.9, S * 0.6, S * 0.85, S * 0.95, S * 0.5, S * 0.95); g.bezierCurveTo(S * 0.15, S * 0.95, S * 0.1, S * 0.6, S * 0.5, S * 0.05); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(S * 0.38, S * 0.6, S * 0.08, S * 0.14, 0, 0, Math.PI * 2); g.fill();
  return toTex(c);
}

/**
 * Ear texture in the earGeo UV layout (u around the section, front of the ear is u in 0..0.5, v along the
 * length): fur base, an inner panel lens on the front face, an optional dark tip. Hard edges, no gradients.
 */
export function makeEarTexture(o) {
  const Wc = 128, Hc = 512; const c = newCanvas(Wc, Hc); const g = c.getContext('2d');
  g.fillStyle = o.fur; g.fillRect(0, 0, Wc, Hc);
  const v0 = o.v0 ?? 0.08, v1 = o.v1 ?? 0.88, pw = o.panel ?? 0.6;
  g.fillStyle = o.inner;
  for (let y = 0; y < Hc; y++) {
    const v = 1 - (y + 0.5) / Hc; if (v < v0 || v > v1) continue;
    const k = Math.pow(Math.sin(Math.PI * (v - v0) / (v1 - v0)), o.panelPow ?? 0.55) * pw;
    const a = Math.acos(Math.min(1, k)) / (Math.PI * 2);              // cos(2 pi u) < k on the front half
    g.fillRect(a * Wc, y, (0.5 - 2 * a) * Wc, 1);
  }
  if (o.tip) { const vt = o.tipFrom ?? 0.62; g.fillStyle = o.tip;
    for (let y = 0; y < Hc; y++) { const v = 1 - (y + 0.5) / Hc; if (v < vt) continue; const wob = 0.025 * Math.sin(y * 0.15); if (v > vt + wob) g.fillRect(0, y, Wc, 1); } }
  const t = toTex(c); t.anisotropy = 8; return t;
}
