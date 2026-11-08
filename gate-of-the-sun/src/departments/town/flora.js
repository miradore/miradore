// Plants: clustered trees with trunks and branches, bougainvillea clusters with leaves and trailing
// strands, small vegetation tufts and cypresses. Builders push geometries into caller-owned lists.
import * as THREE from 'three';
import { cyl, sphere } from './common.js';

/** Squashed sphere (y scaled by sy) centred at (x, y, z). */
export function blob(r, x, y, z, sy = 0.8, ws = 10, hs = 7) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return g;
}

/** Cylinder from point a to point b (radii ra at a, rb at b). */
export function limb(a, b, ra, rb, seg = 6) {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(rb, ra, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate(a[0], a[1], a[2]);
  return g;
}

/**
 * A street tree: trunk with a slight lean, 3-4 branches, 5-9 foliage masses in two greens and a darker
 * underside mass. out = { trunk: [], leafA: [], leafB: [], under: [] }. Trunk base sits at (x, gy, z).
 */
export function makeTree(out, x, gy, z, rng, size = 1) {
  const lean = [(rng() - 0.5) * 0.5 * size, (rng() - 0.5) * 0.5 * size];
  const forkY = gy + 2.4 * size;
  const fork = [x + lean[0], forkY, z + lean[1]];
  out.trunk.push(limb([x, gy - 0.1, z], fork, 0.3 * size, 0.2 * size, 7));
  const crownC = [fork[0], forkY + 1.9 * size, fork[2]];
  const nB = 3 + Math.floor(rng() * 2);
  const nM = 5 + Math.floor(rng() * 5);
  const a0 = rng() * Math.PI * 2;
  for (let k = 0; k < nB; k++) {
    const a = a0 + (k / nB) * Math.PI * 2 + (rng() - 0.5) * 0.6;
    const r = (1.2 + rng() * 0.6) * size;
    const tip = [fork[0] + Math.cos(a) * r, forkY + (1.4 + rng() * 0.9) * size, fork[2] + Math.sin(a) * r];
    out.trunk.push(limb(fork, tip, 0.15 * size, 0.06 * size, 5));
  }
  // underside: a broad darker mass under the crown so the canopy reads with a shadowed belly
  out.under.push(blob(2.0 * size, crownC[0], crownC[1] - 0.55 * size, crownC[2], 0.45, 12, 6));
  for (let k = 0; k < nM; k++) {
    const a = a0 + (k / nM) * Math.PI * 2 + rng() * 0.5;
    const top = k === 0;
    const rr = top ? 0 : (1.1 + rng() * 0.7) * size;
    const r = (top ? 1.35 : 0.85 + rng() * 0.5) * size;
    const y = crownC[1] + (top ? 0.9 * size : (rng() - 0.3) * 1.0 * size);
    (k % 2 ? out.leafB : out.leafA).push(blob(r, crownC[0] + Math.cos(a) * rr, y, crownC[2] + Math.sin(a) * rr, 0.82));
  }
}

/**
 * Bougainvillea: a cluster of small blossom clumps in two magentas with leaf clumps, and a few trailing
 * strands hanging down. (x, y, z) is the cluster centre, out normal (nx, nz) points away from the wall.
 * out = { blossA, blossB, leafA, leafB }.
 */
export function bougCluster(out, x, y, z, nx, nz, rad, rng, lvl = 2, strands = true) {
  const n = lvl >= 2 ? 7 : lvl === 1 ? 3 : 2;
  const tx = -nz, tz = nx;                      // tangent along the wall
  const seg = lvl >= 2 ? [7, 5] : lvl === 1 ? [6, 4] : [5, 4];
  for (let k = 0; k < n; k++) {
    const u = (rng() - 0.5) * rad * 1.8, v = (rng() - 0.5) * rad * 1.2, w = rng() * rad * 0.5;
    const r = rad * (lvl >= 2 ? 0.32 + rng() * 0.22 : 0.42 + rng() * 0.22);
    const px = x + tx * u + nx * w, pz = z + tz * u + nz * w, py = y + v;
    (rng() < 0.55 ? out.blossA : out.blossB).push(sphere(r, px, py, pz, seg[0], seg[1]));
  }
  // leaves peeking out between the blossoms (two greens)
  const nl = lvl >= 2 ? 3 : 1;
  for (let k = 0; k < nl; k++) {
    const u = (rng() - 0.5) * rad * 1.9, v = (rng() - 0.6) * rad * 1.1;
    (k % 2 ? out.leafB : out.leafA).push(sphere(rad * (0.22 + rng() * 0.12), x + tx * u + nx * rad * 0.15, y + v, z + tz * u + nz * rad * 0.15, lvl ? 6 : 5, 4));
  }
  // trailing strands: chains of small blossoms hanging down the wall
  if (lvl >= 1 && strands) {
    const ns = lvl >= 2 ? 2 + Math.floor(rng() * 2) : 1;
    for (let s = 0; s < ns; s++) {
      const u = (rng() - 0.5) * rad * 1.6;
      const len = rad * (1.4 + rng() * 1.6);
      const steps = lvl >= 2 ? 6 : 4;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const sway = Math.sin(t * 3 + s) * 0.12;
        const px = x + tx * (u + sway) + nx * 0.18, pz = z + tz * (u + sway) + nz * 0.18, py = y - rad * 0.4 - t * len;
        const r = (0.16 - t * 0.07) * Math.max(0.7, rad);
        (k % 3 === 0 ? out.leafA : (k % 2 ? out.blossA : out.blossB)).push(sphere(r, px, py, pz, 6, 4));
      }
    }
  }
}

/** A small vegetation tuft (grass and a weed) sitting on a ledge at (x, y, z). */
export function tuft(list, x, y, z, s, rng) {
  const n = 3 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const a = rng() * Math.PI * 2, r = s * 0.35 * rng();
    const h = s * (0.6 + rng() * 0.8);
    const g = new THREE.ConeGeometry(s * 0.18, h, 4, 1);
    g.rotateZ((rng() - 0.5) * 0.9); g.rotateY(rng() * 3);
    g.translate(x + Math.cos(a) * r, y + h / 2 - 0.02, z + Math.sin(a) * r);
    list.push(g);
  }
  list.push(sphere(s * 0.32, x, y + s * 0.12, z, 6, 4));
}

/** Cypress: tall narrow flame with a short trunk. */
export function cypress(trunks, crowns, x, y, z, h, rng) {
  const r = h * (0.12 + rng() * 0.04);
  trunks.push(cyl(r * 0.25, r * 0.3, h * 0.15, 5, x, y - 0.2, z));
  const g = new THREE.SphereGeometry(r, 8, 8);
  // flame profile: stretch and pinch the top
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vy = p.getY(i) / r;                           // -1..1
    const k = vy > 0 ? 1 - vy * 0.75 : 1 - (-vy) * 0.2;
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    p.setY(i, (vy * 0.5 + 0.5) * h * 0.92);
  }
  g.computeVertexNormals();
  g.translate(x, y + h * 0.08, z);
  crowns.push(g);
}
