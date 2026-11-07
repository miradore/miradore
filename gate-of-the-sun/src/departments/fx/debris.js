// Ballistic debris: chips, splinters, shards and boulders. Every piece has a launch frame, a landing
// frame and a landing point; the parabola is solved analytically so the position is a pure function
// of the frame. Pieces tumble in flight and rest where they land. Falling debris runs on 1s.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';

/** Icosahedron with deterministic radial jitter (consistent across duplicated vertices). */
export function rockGeometry(seed, detail = 1, jitter = 0.35) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = Math.round(x * 97) * 3.1 + Math.round(y * 97) * 7.7 + Math.round(z * 97) * 13.3 + seed * 101;
    const j = 1 - jitter * 0.5 + MAP.hash1(key) * jitter;
    const sy = 0.8 + MAP.hash1(key + 5.5) * 0.3;
    p.setXYZ(i, x * j, y * j * sy, z * j);
  }
  g.computeVertexNormals();
  return g;
}

const CHIP_GEOMS = [rockGeometry(1, 0, 0.6), rockGeometry(2, 0, 0.6), rockGeometry(3, 0, 0.6), new THREE.BoxGeometry(1, 0.6, 1.3)];
const SPLINTER = new THREE.BoxGeometry(0.12, 0.12, 1);
const SHARD = new THREE.TetrahedronGeometry(1, 0);

export class Debris {
  /**
   * kind: chip | splinter | shard | rock. size: [min, max] metres (rock radius or chip size).
   * Each piece: f0 launch frame, f1 landing frame, p0 origin, p1 landing point, g gravity.
   */
  constructor(ctx, reg, { seed, count, kind = 'chip', size = [0.3, 0.8], color, shade, inkId, name, g = 9.8, castShadow = true }) {
    this.ctx = ctx;
    this.pieces = [];
    this.group = new THREE.Group(); this.group.name = name;
    this.mat = ctx.makeCel({ color, shade, bandEdge: 0.1 });
    const rng = MAP.mulberry32(seed);
    for (let i = 0; i < count; i++) {
      let geo;
      if (kind === 'splinter') geo = SPLINTER;
      else if (kind === 'shard') geo = SHARD;
      else if (kind === 'rock') geo = rockGeometry(seed * 7 + i, 1, 0.4);
      else geo = CHIP_GEOMS[i % CHIP_GEOMS.length];
      const m = new THREE.Mesh(geo, this.mat);
      m.name = `${name}_${i}`;
      const s = size[0] + rng() * (size[1] - size[0]);
      if (kind === 'splinter') m.scale.set(1 + rng(), 1 + rng(), s);
      else if (kind === 'shard') m.scale.set(s, s * (0.3 + rng() * 0.4), s);
      else m.scale.setScalar(s);
      m.visible = false;
      const axis = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
      this.pieces.push({ mesh: m, f0: 0, f1: 1, p0: new THREE.Vector3(), p1: new THREE.Vector3(), g, axis, omega: 3 + rng() * 9, rest: new THREE.Quaternion(), size: s, restRot: rng() * Math.PI * 2 });
      this.group.add(m);
    }
    ctx.tag(this.group, { inkId, layer: ctx.LAYER.FG, castShadow, receiveShadow: true });
    reg.add(this.group);
    this._q = new THREE.Quaternion();
  }
  /** Set a piece's flight. */
  set(i, f0, f1, p0, p1, g) {
    const p = this.pieces[i];
    p.f0 = f0; p.f1 = Math.max(f0 + 1, f1); p.p0.set(p0[0], p0[1], p0[2]); p.p1.set(p1[0], p1[1], p1[2]);
    if (g !== undefined) p.g = g;
  }
  /** World position of piece i at frame f (writes into out). */
  posAt(i, f, out) {
    const p = this.pieces[i];
    if (f >= p.f1) return out.copy(p.p1);
    const T = (p.f1 - p.f0) / 24, t = MAP.clamp((f - p.f0) / 24, 0, T);
    const u = t / T;
    const vy = (p.p1.y - p.p0.y + 0.5 * p.g * T * T) / T;
    out.set(MAP.lerp(p.p0.x, p.p1.x, u), p.p0.y + vy * t - 0.5 * p.g * t * t, MAP.lerp(p.p0.z, p.p1.z, u));
    return out;
  }
  /** Smallest distance from piece i's path (frames f0..f1) to point c. */
  pathDistance(i, c) {
    const p = this.pieces[i]; const v = new THREE.Vector3(); let best = 1e9;
    for (let f = p.f0; f <= p.f1; f++) { this.posAt(i, f, v); best = Math.min(best, v.distanceTo(c)); }
    return best;
  }
  /** Update all pieces at frame f (1s). hideBefore / hideAfter clip the visible range. */
  update(f, { hideAfter = Infinity, hideBefore = -Infinity, opacity = 1 } = {}) {
    const vis = f >= hideBefore && f <= hideAfter;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i], m = p.mesh;
      if (!vis || f < p.f0) { m.visible = false; continue; }
      m.visible = true;
      this.posAt(i, f, m.position);
      const t = Math.min(f, p.f1) - p.f0;
      m.quaternion.setFromAxisAngle(p.axis, (t / 24) * p.omega + p.restRot);
    }
    if (opacity !== this._op) { this.ctx.setOpacity(this.group, opacity); this._op = opacity; }
  }
}

/** Points FX must keep debris away from: close cameras in the debris shots (from shots.json). */
export const CAMERA_POINTS = [
  [0, 5.5, 82], [-20, 6, 92], [-30, 16, 72], [37.5, 1.5, 51.5], [4, 2.6, 46], [10, 2.3, 34],
  [-56, 55, -8], [0, 6.5, 64], [42, 22, 112], [6, 3.6, 54], [0, 5.3, 98], [0, 5.3, 94], [0, 5.3, 96],
  [14, 4.7, 66], [23.5, 4.3, 51], [22, 32, 124], [3, 5.0, 72], [9, 2.0, 22],
  // hare close-ups (shots 4, 30, 31): camera near the hare head anchor plus its offsets
  [32.2, 2.3, 44.3], [31.9, 2.2, 46.6], [31.2, 2.2, 46.3], [29.3, 2.2, 45.4],
].map((a) => new THREE.Vector3(a[0], a[1], a[2]));

/**
 * Assign ballistic flights for every piece with a deterministic generator, re-rolling the landing
 * point when the path would come within margin of a camera point. pick(i, rng) returns
 * { f0, f1, p0: [x,y,z], p1: [x,y,z], g }.
 */
export function assignFlights(debris, seed, pick, margin = 2.5) {
  const rng = MAP.mulberry32(seed);
  for (let i = 0; i < debris.pieces.length; i++) {
    let ok = false;
    for (let attempt = 0; attempt < 12 && !ok; attempt++) {
      const d = pick(i, rng, attempt);
      debris.set(i, d.f0, d.f1, d.p0, d.p1, d.g);
      ok = true;
      const m = margin + debris.pieces[i].size;
      for (const c of CAMERA_POINTS) if (debris.pathDistance(i, c) < m) { ok = false; break; }
    }
  }
}
