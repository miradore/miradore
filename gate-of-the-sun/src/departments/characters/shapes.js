// Designed shapes for the characters: egg skulls, tapered limbs, rounded boxes, leaf ears, fur spikes,
// brow ribbons and surface-hugging decal patches. All geometry is cached by key and built once.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map();
const r3 = (v) => Math.round(v * 1000) / 1000;
export function cached(key, make) { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g; }

/** average the normals of coincident vertices (seams) so the ink pass sees no false crease */
export function weldNormals(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal; const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e5)}_${Math.round(p.getY(i) * 1e5)}_${Math.round(p.getZ(i) * 1e5)}`;
    let a = map.get(k); if (!a) { a = []; map.set(k, a); } a.push(i);
  }
  const v = new THREE.Vector3();
  for (const idx of map.values()) {
    if (idx.length < 2) continue;
    v.set(0, 0, 0); for (const i of idx) v.add(new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i)));
    v.normalize(); for (const i of idx) n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true; return geo;
}

// ------------------------------------------------------------------ skull
/**
 * Egg skull deformation (a surface of revolution about y so a yaw face cheat keeps features on it).
 * The face band (yn in [-0.55, 0.42]) stays a true sphere; the crown narrows above it and the jaw
 * fills out below it (wider at the cheeks, narrower crown: a soft teardrop).
 */
export function skullScale(yn, k) {
  let s = 1;
  if (yn > 0.42) { const t = (yn - 0.42) / 0.58; s -= k.crown * t * t; }
  if (yn < -0.55) { const t = (-0.55 - yn) / 0.45; s += k.jaw * Math.sin(Math.PI * Math.min(1, t * 0.9)) * 0.9; }
  return s;
}
export function skullPoint(R, dx, dy, dz, k, out = new THREE.Vector3()) {
  const s = skullScale(dy, k);
  return out.set(dx * R * s, dy * R * (dy > 0.42 ? 1 + k.lift * (dy - 0.42) : 1), dz * R * s);
}
export function eggHead(R, ws, hs, k) {
  return cached(`egg${r3(R)}_${ws}_${hs}_${k.crown}_${k.jaw}_${k.lift}`, () => {
    const g = new THREE.SphereGeometry(1, ws, hs); const p = g.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { skullPoint(R, p.getX(i), p.getY(i), p.getZ(i), k, v); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); weldNormals(g); g.computeBoundingSphere(); return g;
  });
}
/** a sphere patch (eye, mask, blush) re-projected onto the skull surface plus an offset */
export function skullPatch(R, k, off, ws, hs, phi0, phiLen, th0, thLen) {
  return cached(`spa${r3(R)}_${r3(off)}_${ws}_${hs}_${r3(phi0)}_${r3(phiLen)}_${r3(th0)}_${r3(thLen)}_${k.crown}_${k.jaw}`, () => {
    const g = new THREE.SphereGeometry(1, ws, hs, phi0, phiLen, th0, thLen); const p = g.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      skullPoint(R, x, y, z, k, v); v.x += x * off; v.y += y * off; v.z += z * off; p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeBoundingSphere(); return g;
  });
}

// ------------------------------------------------------------------ limbs and lathes
/** tapered capsule along -y from the origin: radius r1 at the top joint, r2 at the bottom joint */
export function taperLimb(r1, r2, len, rs = 12, cap = 4, bulge = 0) {
  return cached(`tl${r3(r1)}_${r3(r2)}_${r3(len)}_${rs}_${cap}_${r3(bulge)}`, () => {
    const pts = [];
    for (let i = 0; i <= cap; i++) { const a = (i / cap) * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * r2, -len - Math.cos(a) * r2)); }
    const mid = 5;
    for (let i = 1; i < mid; i++) { const t = i / mid; const b = bulge * Math.sin(Math.PI * t) * (r1 + r2) * 0.5; pts.push(new THREE.Vector2(r2 + (r1 - r2) * t + b, -len * (1 - t))); }
    for (let i = 0; i <= cap; i++) { const a = (i / cap) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1, Math.sin(a) * r1)); }
    // tiny pole caps instead of zero radius: zero-area pole triangles upset the BVH triangle tests
    pts[pts.length - 1].x = r1 * 0.03; pts[0].x = r2 * 0.03;
    return new THREE.LatheGeometry(pts, rs);
  });
}
/** lathe from [r, y] points (bottom to top); phi window optional (open front for waistcoats) */
export function lathe(key, pts, segs = 16, phiStart = 0, phiLen = Math.PI * 2) {
  return cached(`lt_${key}_${segs}_${r3(phiStart)}_${r3(phiLen)}`, () => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(Math.max(0, p[0]), p[1])), segs, phiStart, phiLen));
}
/** smooth a coarse [r, y] profile with Catmull-Rom so lathes read as drawn curves */
export function smoothProfile(pts, n = 3) {
  const v = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  const c = new THREE.SplineCurve(v); return c.getPoints((pts.length - 1) * n).map((p) => [p.x, p.y]);
}

/** rounded box (superellipsoid): half extents, roundness e (1 sphere, ~0.3 boxy) */
export function roundBox(hx, hy, hz, e = 0.45, ws = 12, hs = 8) {
  return cached(`rb${r3(hx)}_${r3(hy)}_${r3(hz)}_${r3(e)}_${ws}_${hs}`, () => {
    const g = new THREE.SphereGeometry(1, ws, hs); const p = g.attributes.position;
    const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), e);
    for (let i = 0; i < p.count; i++) p.setXYZ(i, f(p.getX(i)) * hx, f(p.getY(i)) * hy, f(p.getZ(i)) * hz);
    g.computeVertexNormals(); weldNormals(g); g.computeBoundingSphere(); return g;
  });
}
/** rounded foot / boot: flat sole, domed top that slopes down to a round toe.
 *  Fits inside the box x in [-w/2, w/2], y in [-h, 0], z in [zc - l/2, zc + l/2] (foot clearance maths stays exact). */
export function footShape(w, h, l, zc, rs = 12) {
  return cached(`ft${r3(w)}_${r3(h)}_${r3(l)}_${r3(zc)}_${rs}`, () => {
    const g = new THREE.SphereGeometry(1, rs, Math.max(6, rs >> 1)); const p = g.attributes.position;
    const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const toe = (sp(z, 0.7) + 1) / 2;                                  // 0 heel .. 1 toe
      const yb = y < 0 ? -Math.pow(-y, 0.3) : y;                         // flattened sole
      const top = 1 - 0.42 * toe * toe;
      const yy = yb > 0 ? -h / 2 + (h / 2) * yb * top : -h / 2 + (h / 2) * yb;
      p.setXYZ(i, sp(x, 0.75) * w * 0.5 * (0.86 + 0.14 * toe), Math.min(0, Math.max(-h, yy)), zc + sp(z, 0.7) * l * 0.5);
    }
    g.computeVertexNormals(); weldNormals(g); g.computeBoundingSphere(); return g;
  });
}

// ------------------------------------------------------------------ ears, spikes, tails
/**
 * Leaf / triangle ear along +y: width profile w(t), thickness th(t), slight cup (front concave),
 * built for t in [t0, t1] and shifted so t0 sits at y = 0 (for a bend joint).
 * kind: 'leaf' (hare, rounded tip) or 'tri' (fox, lynx: wide base, pointed tip)
 */
export function earShape(kind, L, W, TH, t0 = 0, t1 = 1, wScale = 1, thScale = 1, segL = 10, segW = 10, cup = 0.35) {
  return cached(`ear${kind}_${r3(L)}_${r3(W)}_${r3(TH)}_${r3(t0)}_${r3(t1)}_${r3(wScale)}_${r3(thScale)}_${segL}_${segW}_${r3(cup)}`, () => {
    const wOf = (t) => kind === 'leaf'
      ? W * Math.pow(Math.sin(Math.PI * Math.min(1, 0.16 + 0.84 * Math.pow(t, 0.8))), 0.75) * (1 - 0.15 * t)
      : W * Math.pow(1 - t, 0.85) * (0.82 + 0.18 * Math.sin(Math.PI * t * 0.9));
    const pos = [], idx = [];
    for (let i = 0; i <= segL; i++) {
      const t = t0 + (t1 - t0) * (i / segL); const w = Math.max(0.0006, wOf(t) * wScale);
      const th = Math.max(0.0005, TH * thScale * (0.45 + 0.55 * wOf(t) / W));
      const y = (t - t0) * L;
      for (let j = 0; j < segW; j++) {
        const a = (j / segW) * Math.PI * 2; const cx = Math.cos(a), cz = Math.sin(a);
        pos.push(cx * w, y, cz * th + cup * w * (1 - cx * cx) * 0.35 * (1 - t));
      }
    }
    for (let i = 0; i < segL; i++) for (let j = 0; j < segW; j++) {
      const a = i * segW + j, b = i * segW + (j + 1) % segW, c = (i + 1) * segW + j, d = (i + 1) * segW + (j + 1) % segW;
      idx.push(a, c, b, b, c, d);
    }
    // close both ends with a fan
    const capEnd = (row, flip) => { const ci = pos.length / 3; let sx = 0, sy = 0, sz = 0; for (let j = 0; j < segW; j++) { sx += pos[(row * segW + j) * 3]; sy += pos[(row * segW + j) * 3 + 1]; sz += pos[(row * segW + j) * 3 + 2]; } pos.push(sx / segW, sy / segW + (flip ? 0 : 0), sz / segW);
      for (let j = 0; j < segW; j++) { const a = row * segW + j, b = row * segW + (j + 1) % segW; if (flip) idx.push(ci, a, b); else idx.push(ci, b, a); } };
    capEnd(0, false); capEnd(segL, true);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  });
}

/**
 * One continuous ear with UVs (u around the section, v along the length) and an optional bend built into
 * the centreline (no seams): the centreline rises along +y, then folds by `bend` radians about x
 * (negative folds backward) around t = bendAt. Front of the ear is +z. kind 'leaf' (rounded tip) or 'tri'.
 */
export function earGeo(kind, L, W, TH, o = {}) {
  const segL = o.segL ?? 14, segW = o.segW ?? 12, bend = o.bend ?? 0, bendAt = o.bendAt ?? 0.33, cup = o.cup ?? 0.25;
  return cached(`eg${kind}_${r3(L)}_${r3(W)}_${r3(TH)}_${segL}_${segW}_${r3(bend)}_${r3(bendAt)}_${r3(cup)}`, () => {
    const wOf = (t) => kind === 'leaf'
      ? W * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.42) / 0.58, 2))) * (1 - 0.12 * t)
      : W * Math.pow(Math.max(0, 1 - t), 0.85) * (0.82 + 0.18 * Math.sin(Math.PI * t * 0.9));
    const pos = [], uv = [], idx = [];
    let cy = 0, cz = 0; const dt = 1 / segL;
    const angAt = (t) => { const k = Math.min(1, Math.max(0, (t - (bendAt - 0.07)) / 0.14)); return bend * k * k * (3 - 2 * k); };
    for (let i = 0; i <= segL; i++) {
      const t = i / segL;
      if (i > 0) { const a = angAt(t - dt / 2); cy += Math.cos(a) * L * dt; cz += Math.sin(a) * L * dt; }
      const a = angAt(t); const ny = -Math.sin(a), nz = Math.cos(a);       // front normal of the section frame
      const w = Math.max(0.0008, wOf(t)), th = Math.max(0.0006, TH * (0.4 + 0.6 * wOf(t) / W));
      for (let j = 0; j <= segW; j++) {
        const v = (j / segW) * Math.PI * 2; const cx = Math.cos(v), sz = Math.sin(v);
        const off = sz * th + cup * w * 0.3 * (1 - cx * cx) * (1 - t);      // cupped front
        pos.push(cx * w, cy + ny * off, cz + nz * off); uv.push(j / segW, t);
      }
    }
    const R = segW + 1;
    for (let i = 0; i < segL; i++) for (let j = 0; j < segW; j++) { const a = i * R + j, b = a + 1, c = a + R, d = c + 1; idx.push(a, c, b, b, c, d); }
    // base cap (buried in the skull)
    const ci = pos.length / 3; pos.push(0, 0, 0); uv.push(0.25, 0); for (let j = 0; j < segW; j++) idx.push(ci, j + 1, j);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals(); weldNormals(g); g.computeBoundingSphere(); return g;
  });
}

/** a flat pointed fur spike along +y, curled toward +z (positive curl) and flattened in z */
export function spike(len, width, thick, curl = 0.3, seg = 5, inPlane = false) {
  return cached(`spk${r3(len)}_${r3(width)}_${r3(thick)}_${r3(curl)}_${seg}_${inPlane}`, () => {
    const pos = [], idx = []; const N = 4;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg; const w = width * (1 - t) * (0.85 + 0.35 * Math.sin(Math.PI * t * 0.7)); const th = thick * (1 - t * 0.85);
      const yy = len * t, zz = curl * len * t * t * 0.5;
      for (const [x, dz] of [[w, 0], [0, th], [-w, 0], [0, -th]]) { if (inPlane) pos.push(x + zz, yy, dz); else pos.push(x, yy, zz + dz); }
    }
    if (inPlane) pos.push(curl * len * 0.56, len * 1.06, 0); else pos.push(0, len * 1.06, curl * len * 0.56);
    for (let i = 0; i < seg; i++) for (let j = 0; j < N; j++) { const a = i * N + j, b = i * N + (j + 1) % N, c = (i + 1) * N + j, d = (i + 1) * N + (j + 1) % N; idx.push(a, b, c, b, d, c); }
    const tip = (seg + 1) * N; for (let j = 0; j < N; j++) idx.push(seg * N + j, seg * N + (j + 1) % N, tip);
    const base = pos.length / 3; pos.push(0, 0, 0); for (let j = 0; j < N; j++) idx.push(base, (j + 1) % N, j);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  });
}
/** several spikes merged into one tuft geometry. items: [{ len, width, thick, curl, pos:[x,y,z], rot:[x,y,z] }] */
export function tuft(key, items) {
  return cached(`tuft_${key}`, () => {
    const gs = items.map((it) => {
      const g = spike(it.len, it.width, it.thick, it.curl ?? 0.3, it.seg ?? 5, !!it.inPlane).clone();
      const m = new THREE.Matrix4().compose(new THREE.Vector3(...it.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...it.rot, 'XYZ')), new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m); return g;
    });
    const g = mergeGeometries(gs); g.computeBoundingSphere(); return g;
  });
}

/** brow ribbon on a sphere of radius rad around +z: tapered from the inner end, gently arched.
 *  side 'L' has its inner end toward -x (the nose), 'R' toward +x. halfAng in radians. */
export function browRibbon(rad, halfAng, thick, arch, side, seg = 10) {
  return cached(`brow${r3(rad)}_${r3(halfAng)}_${r3(thick)}_${r3(arch)}_${side}_${seg}`, () => {
    const pos = [], idx = []; const inner = side === 'L' ? -1 : 1;
    for (let i = 0; i <= seg; i++) {
      const u = -1 + 2 * i / seg;                         // -1..1 across the brow
      const fromInner = (1 - u * inner) / 2;              // 0 at inner end, 1 at outer end
      const az = u * halfAng; const el = arch * (1 - u * u) - 0.25 * arch * fromInner;
      const th = thick * (1.0 - 0.8 * fromInner) * (fromInner < 0.08 ? 0.6 + 5 * fromInner : 1);
      for (const s of [-1, 1]) { const e = el + s * th * 0.5; pos.push(Math.sin(az) * Math.cos(e) * rad, Math.sin(e) * rad, Math.cos(az) * Math.cos(e) * rad); }
    }
    for (let i = 0; i < seg; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  });
}
