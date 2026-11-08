// Inked billows drawn as anime cumulus: a cluster of overlapping spheres, a few big lobes with many
// small ones bubbling on the rims and a flattened base. Every sphere carries its own ink id from the
// steam or dust range (overlapping neighbours always differ), so the core ink pass draws the inner
// cauliflower lines where one puff overlaps another. Materials use the two-tone cel shadow and a hard
// painted highlight. All sphere surfaces stay within radius R of the billow centre (R * stretch for a
// stretched billow), which is what the camera clearance guard relies on.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';

export const SPHERE = new THREE.SphereGeometry(1, 20, 14);
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- camera clearance guard
// index.js sets the camera position of the current frame before any module updates. A billow whose
// surface would come closer than its style's clearance shrinks about its own centre, so it never grows
// past its unguarded bounds (front limits stay valid) and the change is continuous in the frame.
let CAM = null;
export function setCamera(v) { CAM = v; }
function guard(cx, cy, cz, Rb, clear) {
  if (!CAM) return 1;
  const d = Math.hypot(cx - CAM.x, cy - CAM.y, cz - CAM.z), need = clear + 0.3;
  if (d - Rb >= need) return 1;
  return Math.max(0, (d - need) / Rb);
}

// ---------------------------------------------------------------- styles
export function steamStyle(ctx) {
  const P = ctx.MAP.PALETTE, ID = ctx.ID;
  return { color: P.steam, shade: P.steamShade, shade2: 0x8E9CC4, band2Edge: -0.3, highlight: 0xFFFFFF, highlightEdge: 0.75, bandEdge: 0.2,
    idMin: ID.STEAM_MIN, idMax: ID.STEAM_MAX, clear: 1.0 };
}
export function dustStyle(ctx) {
  const P = ctx.MAP.PALETTE, ID = ctx.ID;
  return { color: P.dust, shade: P.dustShade, shade2: 0x7E5C2A, band2Edge: -0.3, highlight: 0xF2D49A, highlightEdge: 0.75, bandEdge: 0.2,
    idMin: ID.DUST_MIN, idMax: ID.DUST_MAX, clear: 1.5 };
}
/** Darker dust for the heavy lower lobes of the dust wall. */
export function dustBaseStyle(ctx) {
  return { ...dustStyle(ctx), color: 0xBE914C, shade: 0x8E6830, shade2: 0x5E4220, highlight: 0xD9B26A };
}
function celFrom(ctx, s) {
  return ctx.makeCel({ color: s.color, shade: s.shade, shade2: s.shade2, band2Edge: s.band2Edge, highlight: s.highlight, highlightEdge: s.highlightEdge,
    bandEdge: s.bandEdge, bandSoft: 0.025, wobble: 0.28 });
}

/** Greedy colouring: each sphere gets an id from [idMin, idMax] that no overlapping sibling uses. */
function assignIds(parts, idMin, idMax, start) {
  const N = idMax - idMin + 1;
  for (let i = 0; i < parts.length; i++) {
    // small rim bubbles take their lobe's id so they read as bumps on its outline, not as balls;
    // the bigger ones keep their own id and add a curl line where they overlap the lobe
    if (parts[i].parent && parts[i].r < 0.22) { parts[i].id = parts[i].parent.id; continue; }
    const used = new Set();
    for (let j = 0; j < i; j++) {
      const a = parts[i], b = parts[j];
      if (a.off.distanceTo(b.off) < (a.r + b.r) * 1.15) used.add(b.id);
    }
    let id = idMin + ((start + i * 3) % N);
    for (let k = 0; k < N && used.has(id); k++) id = idMin + ((id - idMin + 1) % N);
    parts[i].id = id;
  }
}

/** Unit-space cumulus layout: big lobes, an optional crown, small rim bubbles, flattened base. */
function layout(seed, count, flat) {
  const rng = MAP.mulberry32(seed);
  const parts = [];
  const plane = MAP.lerp(-0.95, -0.42, flat);          // base plane in unit space
  const BOUND = 0.93;                                  // leaves room for churn and pulse
  const fit = (p) => {
    // keep inside the unit bound, then sit on the base plane as a flattened ellipsoid
    let L = p.off.length();
    if (L + p.r > BOUND) { p.r = Math.min(p.r, BOUND * 0.6); L = p.off.length(); if (L + p.r > BOUND) p.off.multiplyScalar((BOUND - p.r) / L); }
    const lift = p.off.y - plane;
    p.ys = MAP.clamp(lift / p.r, 0.6, 1);
    if (p.off.y - p.r * p.ys < plane) p.off.y = plane + p.r * p.ys;
    L = p.off.length();
    if (L + p.r > BOUND) { const h = Math.hypot(p.off.x, p.off.z), need = Math.sqrt(Math.max(0, (BOUND - p.r) ** 2 - p.off.y ** 2)); if (h > need && h > 1e-6) { p.off.x *= need / h; p.off.z *= need / h; } }
    return p;
  };
  const nBig = count >= 9 ? 3 : count >= 5 ? 2 : 1;
  const a0 = rng() * Math.PI * 2;
  for (let i = 0; i < nBig; i++) {
    const a = a0 + (i / nBig) * Math.PI * 2 + (rng() - 0.5) * 0.7;
    const dist = nBig === 1 ? 0 : 0.2 + rng() * 0.12;
    const r = (i === 0 ? 0.56 : 0.44 + rng() * 0.1);
    parts.push(fit({ off: new THREE.Vector3(Math.cos(a) * dist, 0.02 + rng() * 0.12, Math.sin(a) * dist), r, big: true }));
  }
  if (count >= 7) parts.push(fit({ off: new THREE.Vector3((rng() - 0.5) * 0.15, 0.42, (rng() - 0.5) * 0.15), r: 0.36 + rng() * 0.06, big: true }));
  // base discs: wide, low and flat so the billow sits on a drawn flat bottom
  const nBase = count >= 10 ? 2 : count >= 6 ? 1 : 0;
  for (let i = 0; i < nBase; i++) {
    const a = a0 + Math.PI * (0.5 + i) + (rng() - 0.5) * 0.6;
    parts.push(fit({ off: new THREE.Vector3(Math.cos(a) * 0.38, plane + 0.12, Math.sin(a) * 0.38), r: 0.32 + rng() * 0.06, big: false, base: true }));
  }
  // rim bubbles on the big lobes, biased upward and outward
  const lobes = parts.filter((p) => p.big);
  while (parts.length < count) {
    const L = lobes[Math.floor(rng() * lobes.length)];
    const th = rng() * Math.PI * 2, y = 0.05 + rng() * 0.9;
    const dir = new THREE.Vector3(Math.cos(th) * Math.sqrt(1 - y * y), y, Math.sin(th) * Math.sqrt(1 - y * y));
    const out = new THREE.Vector3(L.off.x, 0, L.off.z);
    if (out.lengthSq() > 1e-6) dir.addScaledVector(out.normalize(), 0.5).normalize();
    const r = 0.13 + Math.pow(rng(), 1.6) * 0.17;
    parts.push(fit({ off: L.off.clone().addScaledVector(dir, L.r * 0.88), r, big: false, parent: L }));
  }
  return parts;
}

export class Billow {
  constructor(ctx, { seed, count = 12, style, name = 'billow', flat = 0.6, base = null }) {
    this.ctx = ctx;
    this.clear = style.clear ?? 1.0;
    this.group = new THREE.Group();
    this.group.name = name;
    this.mat = celFrom(ctx, style);
    this.baseMat = base ? celFrom(ctx, base) : null;
    const parts = layout(seed, count, flat);
    const rng = MAP.mulberry32(seed + 77);
    assignIds(parts, style.idMin, style.idMax, Math.floor(rng() * 64));
    const low = MAP.lerp(-0.95, -0.42, flat) + 0.32;
    this.parts = [];
    parts.forEach((p, i) => {
      const m = new THREE.Mesh(SPHERE, this.baseMat && p.off.y < low ? this.baseMat : this.mat);
      m.name = `${name}_s${i}`;
      m.userData.off = p.off; m.userData.r = p.r; m.userData.ys = p.ys; m.userData.ph = rng() * Math.PI * 2; m.userData.ink = p.id;
      this.group.add(m);
      this.parts.push(m);
    });
    ctx.tag(this.group, { layer: ctx.LAYER.FG, castShadow: true, receiveShadow: true });
    for (const m of this.parts) m.userData.inkId = m.userData.ink;
    this.group.visible = false;
    this._op = -1;
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._e = new THREE.Euler();
  }
  hide() { this.group.visible = false; }
  /**
   * Place the billow. t drives the internal churn, spin turns it about y, roll about x, squash scales y.
   * stretch > 1 with dir elongates the whole billow along dir (a jet's first frames).
   */
  set(x, y, z, R, { t = 0, opacity = 1, spin = 0, squash = 1, roll = 0, stretch = 1, dir = null } = {}) {
    const g = this.group;
    const k = guard(x, y, z, R * Math.max(1, stretch, squash), this.clear);
    if (k < 0.04) { g.visible = false; return; }
    R *= k;
    g.visible = true;
    g.position.set(x, y, z);
    this._e.set(roll, spin, 0, 'YXZ');
    this._q.setFromEuler(this._e);
    if (dir && stretch > 1.001) { this._q2.setFromUnitVectors(UP, dir); g.quaternion.multiplyQuaternions(this._q2, this._q); g.scale.set(1, stretch, 1); }
    else { g.quaternion.copy(this._q); g.scale.set(1, 1, 1); }
    for (const m of this.parts) {
      const o = m.userData.off, r = m.userData.r, ph = m.userData.ph;
      const churn = 0.05 * (1 - r);
      const pulse = r < 0.3 ? 1 + 0.06 * Math.sin(t * 1.3 + ph * 2.0) : 1;
      const px = o.x + Math.sin(t + ph) * churn;
      const pz = o.z + Math.cos(t * 0.8 + ph * 1.7) * churn;
      m.position.set(px * R, o.y * R * squash, pz * R);
      m.scale.set(r * R * pulse, r * R * m.userData.ys * squash * pulse, r * R * pulse);
    }
    if (opacity !== this._op) { this.ctx.setOpacity(g, opacity); this._op = opacity; }
  }
}

/**
 * A curl tail: a chain of small spheres placed by the caller (swirling steam tails on the column).
 * Ink ids alternate along the chain so every sphere gets its own line.
 */
export class Chain {
  constructor(ctx, { count, style, name }) {
    this.ctx = ctx; this.clear = style.clear ?? 1.0;
    this.group = new THREE.Group(); this.group.name = name;
    this.mat = celFrom(ctx, style);
    const N = style.idMax - style.idMin + 1;
    this.parts = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(SPHERE, this.mat); m.name = `${name}_s${i}`;
      this.group.add(m); this.parts.push(m);
    }
    ctx.tag(this.group, { layer: ctx.LAYER.FG, castShadow: true, receiveShadow: true });
    this.parts.forEach((m, i) => { m.userData.inkId = style.idMin + ((Math.floor(i / 3) * 4 + 1) % N); });
    this.group.visible = false; this._op = -1;
  }
  hide() { this.group.visible = false; }
  /** pts: array of [x, y, z, r] in world space. */
  set(pts, opacity = 1) {
    this.group.visible = true;
    for (let i = 0; i < this.parts.length; i++) {
      const m = this.parts[i], p = pts[i];
      const k = p ? guard(p[0], p[1], p[2], p[3], this.clear) : 0;
      if (!p || p[3] * k < 0.02) { m.visible = false; continue; }
      m.visible = true; m.position.set(p[0], p[1], p[2]); m.scale.setScalar(p[3] * k);
    }
    if (opacity !== this._op) { this.ctx.setOpacity(this.group, opacity); this._op = opacity; }
  }
}

/** Build n billows and register them. */
export function makeBillows(ctx, reg, n, { seed, count, style, name, flat, base }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const b = new Billow(ctx, { seed: seed * 131 + i * 7 + 3, count, style, name: `${name}${i}`, flat, base });
    reg.add(b.group);
    out.push(b);
  }
  return out;
}

/**
 * Radial burst of billows from a point. Billow k flies out along a hashed direction (biased upward),
 * grows from r0 to r1 and fades over the last part of its life. Returns true while alive.
 * fh is the held frame (2s). floor keeps billow centres above a ground height.
 */
export function burst(billows, fh, { x, y, z, birth, life, spread, r0, r1, rise = 0, seed, up = 0.35, floor = null, flat = 0.35, zBias = 0, spinRate = 0.5 }) {
  const a = fh - birth;
  if (a < 0 || a > life) { for (const b of billows) b.hide(); return false; }
  const u = a / life, e = MAP.easeOut(u);
  for (let k = 0; k < billows.length; k++) {
    const h1 = MAP.hash2(seed, k), h2 = MAP.hash2(seed + 11, k), h3 = MAP.hash2(seed + 23, k);
    const th = h1 * Math.PI * 2;
    const el = (h2 - 0.5) * flat * Math.PI;
    let dx = Math.cos(th) * Math.cos(el), dy = Math.sin(el) + up, dz = Math.sin(th) * Math.cos(el) + zBias;
    const len = Math.hypot(dx, dy, dz) || 1; dx /= len; dy /= len; dz /= len;
    const dist = spread * e * (0.35 + 0.65 * h3);
    const R = MAP.lerp(r0, r1, e) * (0.7 + 0.6 * h2);
    let cy = y + dy * dist + rise * u;
    if (floor !== null) cy = Math.max(cy, floor + R * 0.55);
    const opacity = 1 - MAP.smooth((u - 0.68) / 0.32);   // fade late: the ink fades with it
    billows[k].set(x + dx * dist, cy, z + dz * dist, R, { t: fh * 0.08, opacity, spin: (h1 - 0.5) * spinRate * u * 4 });
  }
  return true;
}

/**
 * Trail puffs behind a moving object, on 2s. posAt(e, out) gives the object's position at emission
 * frame e (or returns false when nothing is emitted then). Puffs are emitted every `every` frames,
 * each mesh slot holding one puff for its whole life so nothing jumps between slots.
 */
export function trail(puffs, fh, posAt, { every = 4, life = 12, r0 = 0.6, r1 = 2.2, rise = 1.5, seed = 0, tmp }) {
  const n = puffs.length;
  const E = Math.floor(fh / every) * every;
  const used = new Array(n).fill(false);
  for (let j = 0; j * every < life && j < n; j++) {
    const e = E - j * every, age = fh - e;
    const slot = ((Math.floor(e / every) % n) + n) % n;
    if (age >= life || !posAt(e, tmp)) continue;
    const u = age / life, eo = MAP.easeOut(u);
    const h = MAP.hash2(seed + 3, e);
    used[slot] = true;
    puffs[slot].set(tmp.x + (h - 0.5) * 0.8 * eo, tmp.y + rise * u, tmp.z + (MAP.hash2(seed + 5, e) - 0.5) * 0.8 * eo, MAP.lerp(r0, r1, eo) * (0.8 + 0.4 * h),
      { t: fh * 0.1 + h * 6, opacity: 1 - MAP.smooth((u - 0.45) / 0.55), spin: h * 6 });
  }
  for (let s = 0; s < n; s++) if (!used[s]) puffs[s].hide();
}

/** Pick a prebuilt torus whose tube to major ratio is closest to tube / R (geometry is uniform scaled by R). */
const TORUS_RATIOS = [0.3, 0.15, 0.08, 0.04, 0.02, 0.012, 0.006];
const TORI = TORUS_RATIOS.map((r) => new THREE.TorusGeometry(1, r, 10, 96));
export function torusFor(R, tube) {
  const want = tube / Math.max(R, 1e-3);
  let best = 0, bd = 1e9;
  for (let i = 0; i < TORUS_RATIOS.length; i++) { const d = Math.abs(Math.log(TORUS_RATIOS[i] / want)); if (d < bd) { bd = d; best = i; } }
  return TORI[best];
}
