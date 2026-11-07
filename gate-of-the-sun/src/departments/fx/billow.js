// Inked billows: a cluster of overlapping spheres sharing one cel material. The core ink pass
// outlines each sphere where depth or normals jump, so a cluster reads as a drawn cumulus.
// All sphere surfaces stay within radius R of the billow centre (plus a 5 percent churn margin),
// which is what the camera clearance checks rely on.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';

export const SPHERE = new THREE.SphereGeometry(1, 18, 12);

export class Billow {
  constructor(ctx, { seed, count = 12, color, shade, inkId, name = 'billow', bandEdge = 0.08 }) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = name;
    this.mat = ctx.makeCel({ color, shade, bandEdge, bandSoft: 0.03, wobble: 0.3 });
    const rng = MAP.mulberry32(seed);
    this.parts = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(SPHERE, this.mat);
      m.name = `${name}_s${i}`;
      let r, d, dir;
      if (i === 0) { r = 0.62; d = 0; dir = new THREE.Vector3(0, 0.1, 0); }
      else {
        r = 0.26 + rng() * 0.32;
        const th = rng() * Math.PI * 2, ph = Math.acos(2 * rng() - 1);
        // flattened base, taller crown
        dir = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph) * 0.8 + 0.28, Math.sin(ph) * Math.sin(th)).normalize();
        d = Math.pow(rng(), 0.55) * (1 - r);
      }
      m.userData.off = dir.multiplyScalar(d);
      m.userData.r = r;
      m.userData.ph = rng() * Math.PI * 2;
      this.group.add(m);
      this.parts.push(m);
    }
    ctx.tag(this.group, { inkId, layer: ctx.LAYER.FG, castShadow: true, receiveShadow: true });
    this.group.visible = false;
    this._op = -1;
  }
  hide() { this.group.visible = false; }
  /** Place the billow. t drives a slow internal churn, spin turns the whole cluster, squash scales y. */
  set(x, y, z, R, { t = 0, opacity = 1, spin = 0, squash = 1 } = {}) {
    const g = this.group;
    g.visible = true;
    g.position.set(x, y, z);
    g.rotation.set(0, spin, 0);
    for (const m of this.parts) {
      const o = m.userData.off, r = m.userData.r;
      const churn = 0.05 * (1 - r);
      const px = o.x + Math.sin(t + m.userData.ph) * churn;
      const pz = o.z + Math.cos(t * 0.8 + m.userData.ph * 1.7) * churn;
      m.position.set(px * R, o.y * R * squash, pz * R);
      m.scale.set(r * R, r * R * squash, r * R);
    }
    if (opacity !== this._op) { this.ctx.setOpacity(g, opacity); this._op = opacity; }
  }
}

export function dustStyle(ctx) { const P = ctx.MAP.PALETTE; return { color: P.dust, shade: P.dustShade, inkId: ctx.ID.DUST }; }
export function steamStyle(ctx) { const P = ctx.MAP.PALETTE; return { color: P.steam, shade: P.steamShade, inkId: ctx.ID.STEAM }; }

/** Build n billows and register them (added to reg.group and reg.pop). */
export function makeBillows(ctx, reg, n, { seed, count, style, name }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const b = new Billow(ctx, { seed: seed * 131 + i * 7 + 3, count, ...style, name: `${name}${i}` });
    reg.add(b.group);
    out.push(b);
  }
  return out;
}

/**
 * Radial burst of billows from a point. Billow k flies out along a hashed direction (biased upward),
 * grows from r0 to r1 and fades over the last 45 percent of life. Returns true while alive.
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
    const opacity = 1 - MAP.smooth((u - 0.68) / 0.32);   // fade late: partial opacity dithers in the data pass too
    billows[k].set(x + dx * dist, cy, z + dz * dist, R, { t: fh * 0.08, opacity, spin: (h1 - 0.5) * spinRate * u * 4 });
  }
  return true;
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
