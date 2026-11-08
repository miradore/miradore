// Geometry factories shared by the giant and the small automatons. Everything is built from honest
// primitives so the ink pass finds real crease edges: thick forged plates with a pillowed crown,
// raised gold edge bands, rivet domes, engraved relief (raised gold ribbons), verdigris drip decals,
// exposed gears where plates are missing. A plate and its trims are merged into one mesh per
// material (one ink id per plate) so the draw call count stays low.
import * as THREE from 'three';

export const DARK_BRONZE = 0x3A2A16, DARK_BRONZE_SHADE = 0x1E150B, GOLD_SHADE = 0xA8822A;
export const VERD_SHADE2 = 0x1F4A40, VERD_HI = 0xBFEFD8, GOLD_HI = 0xFFF2B0, GOLD_SHADE2 = 0x6E4F18;
export const SLIT_LIT = 0x9CFFFF, SLIT_DARK = 0x0C2A2E, HALO_LIT = 0x3FC8DC, HALO_DARK = 0x08181C;

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** One material set per body (dithered opacity must not be shared between bodies). */
export function makeMaterials(ctx, { paintScale = 8, seed = 1 } = {}) {
  const P = ctx.MAP.PALETTE;
  const verd = ctx.makeCel({ color: P.verdigris, shade: P.verdigrisShade, shade2: VERD_SHADE2, band2Edge: -0.4, highlight: VERD_HI, highlightEdge: 0.86, paint: 'metal', paintScale, paintSeed: seed, wobble: 0.1 });
  const gold = ctx.makeCel({ color: P.gold, shade: GOLD_SHADE, shade2: GOLD_SHADE2, highlight: GOLD_HI, highlightEdge: 0.78, paint: 'metal', paintScale: paintScale * 0.6, paintAmount: 0.45, paintSeed: seed + 4, wobble: 0.08 });
  const dark = ctx.makeCel({ color: DARK_BRONZE, shade: DARK_BRONZE_SHADE, shade2: 0x100A05, highlight: 0x9C7A44, highlightEdge: 0.9, paint: 'metal', paintScale: paintScale * 0.5, paintAmount: 0.6, paintSeed: seed + 7, wobble: 0.06 });
  // painted decal: verdigris runs in the shade colour, pulled toward the camera so they never fight the plate
  const drip = ctx.makeCel({ color: P.verdigrisShade, shade: VERD_SHADE2, shade2: 0x15352D, paint: 'metal', paintScale, paintAmount: 0.5, paintSeed: seed + 2, wobble: 0.05 });
  drip.polygonOffset = true; drip.polygonOffsetFactor = -2; drip.polygonOffsetUnits = -4;
  return { verd, gold, dark, drip, slit: ctx.makeFlat({ color: SLIT_DARK }), halo: ctx.makeFlat({ color: HALO_DARK }) };
}

/** Ink id cycler for a body: ids wrap through [min, max]. */
export function makeInk(min, max) {
  let i = 0;
  return { next() { const id = min + (i % (max - min + 1)); i++; return id; }, peek() { return min + (i % (max - min + 1)); } };
}

export function countTriangles(obj) {
  let n = 0;
  obj.traverse((o) => { if (o.isMesh && o.geometry) { const g = o.geometry; n += g.index ? g.index.count / 3 : g.attributes.position.count / 3; } });
  return n;
}

// ------------------------------------------------------------------------------------------------
// low level: everything ends up as non-indexed position / normal / uv so batches can be concatenated

export function finish(g) {
  let h = g.index ? g.toNonIndexed() : g;
  if (!h.attributes.normal) h.computeVertexNormals();
  if (!h.attributes.uv) h.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(h.attributes.position.count * 2), 2));
  for (const k of Object.keys(h.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') h.deleteAttribute(k);
  return h;
}

export function mergeList(list) {
  const gs = list.filter(Boolean).map(finish);
  let n = 0; for (const g of gs) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of gs) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return m;
}

/** Triangles from a list of [a, b, c] Vector3 with explicit normals (flat) oriented toward `out`. */
function triSoup(tris, out) {
  const pos = [], nor = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  for (const t of tris) {
    let [a, b, c] = t;
    e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
    if (n.lengthSq() < 1e-12) continue;
    const o = t[3] || out;
    if (o && n.dot(o) < 0) { const tmp = b; b = c; c = tmp; n.negate(); }
    n.normalize();
    for (const p of [a, b, c]) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return finish(g);
}

/** Smooth shaded grid surface: P(i, j) -> Vector3 for i in 0..su, j in 0..sv, oriented so normals agree with out(i, j). */
function gridSurface(su, sv, P, out) {
  const pos = [], idx = [];
  for (let j = 0; j <= sv; j++) for (let i = 0; i <= su; i++) { const p = P(i, j); pos.push(p.x, p.y, p.z); }
  const at = (i, j) => j * (su + 1) + i;
  // orientation from the middle quad
  const im = Math.floor(su / 2), jm = Math.floor(sv / 2);
  const a = P(im, jm), b = P(Math.min(su, im + 1), jm), c = P(im, Math.min(sv, jm + 1));
  const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
  const flip = n.dot(out(im, jm)) < 0;
  for (let j = 0; j < sv; j++) for (let i = 0; i < su; i++) {
    const p00 = at(i, j), p10 = at(i + 1, j), p01 = at(i, j + 1), p11 = at(i + 1, j + 1);
    if (!flip) idx.push(p00, p10, p11, p00, p11, p01); else idx.push(p00, p11, p10, p00, p01, p11);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return finish(g);
}

// ------------------------------------------------------------------------------------------------
// surfaces: P(u, v, off) point at parameter (u, v) in [0,1]^2 pushed `off` metres along the outward
// direction N(u, v). du / dv are the metric lengths of the u and v sides (for spacing in metres).

/** Flared cylinder sector around local +y. u: angle t0..t0+len (theta 0 = +z, PI/2 = +x), v: y0..y0+h. */
export function cylSurf({ rTop, rBot, h, t0, len, y0 = 0 }) {
  const rMid = (rTop + rBot) / 2;
  return {
    P(u, v, off = 0) { const th = t0 + u * len, r = rBot + (rTop - rBot) * v + off; return V(r * Math.sin(th), y0 + v * h, r * Math.cos(th)); },
    N(u) { const th = t0 + u * len; return V(Math.sin(th), 0, Math.cos(th)); },
    du: len * rMid, dv: Math.hypot(h, rTop - rBot),
  };
}

/** Sphere band with its pole on +y. u: azimuth phi0..phi0+phiLen (0 = +z, PI/2 = +x), v: 0 at thLo (lower edge) to 1 at thHi. */
export function sphSurf({ R, phi0, phiLen, thLo, thHi, centre = V(0, 0, 0), quat = null }) {
  const s = {
    P(u, v, off = 0) {
      const ph = phi0 + u * phiLen, th = thLo + v * (thHi - thLo), r = R + off;
      const p = V(r * Math.sin(th) * Math.sin(ph), r * Math.cos(th), r * Math.sin(th) * Math.cos(ph));
      if (quat) p.applyQuaternion(quat);
      return p.add(centre);
    },
    N(u, v) {
      const ph = phi0 + u * phiLen, th = thLo + v * (thHi - thLo);
      const n = V(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
      return quat ? n.applyQuaternion(quat) : n;
    },
    du: R * Math.abs(phiLen) * Math.max(0.2, Math.sin((thLo + thHi) / 2)), dv: R * Math.abs(thHi - thLo),
  };
  return s;
}

/** Plate bump: pillowed crown across u and a gentle bulge along v. */
export const pillow = (bu, bv) => (u, v) => bu * Math.sin(Math.PI * THREE.MathUtils.clamp(u, 0, 1)) + bv * Math.sin(Math.PI * THREE.MathUtils.clamp(v, 0, 1));

/**
 * Thick plate on a surface: outer face at bump(u,v), inner edge at -thick, closed side walls.
 * vmax(u) optionally tears the top edge (broken plates). Inner face omitted (never seen).
 */
export function slabGeo(surf, { thick = 0.5, bump = () => 0, su = 8, sv = 4, v0 = 0, v1 = 1, u0 = 0, u1 = 1, vmax = null, inner = false }) {
  const U = (i) => u0 + (u1 - u0) * i / su;
  const Vt = (i) => (vmax ? Math.min(v1, vmax(U(i))) : v1);
  const Vv = (i, j) => v0 + (Vt(i) - v0) * j / sv;
  const parts = [];
  const outP = (i, j) => { const u = U(i), v = Vv(i, j); return surf.P(u, v, bump(u, v)); };
  const inP = (i, j) => { const u = U(i), v = Vv(i, j); return surf.P(u, v, -thick); };
  parts.push(gridSurface(su, sv, outP, (i, j) => surf.N(U(i), Vv(i, j))));
  if (inner) parts.push(gridSurface(su, sv, inP, (i, j) => surf.N(U(i), Vv(i, j)).negate()));
  // side walls: bottom (j = 0), top (j = sv), left (i = 0), right (i = su)
  const walls = [];
  const wall = (pts, outDir) => { for (let k = 0; k < pts.length - 1; k++) { const [a, b] = [pts[k], pts[k + 1]]; walls.push([a.o, b.o, b.i, outDir(k)], [a.o, b.i, a.i, outDir(k)]); } };
  const row = (j) => { const r = []; for (let i = 0; i <= su; i++) r.push({ o: outP(i, j), i: inP(i, j) }); return r; };
  const col = (i) => { const r = []; for (let j = 0; j <= sv; j++) r.push({ o: outP(i, j), i: inP(i, j) }); return r; };
  const vdir = (sign, i, j) => surf.P(U(i), Vv(i, Math.min(sv, j + 1)), 0).sub(surf.P(U(i), Vv(i, Math.max(0, j - 1)), 0)).multiplyScalar(sign);
  const udir = (sign, i, j) => surf.P(U(Math.min(su, i + 1)), Vv(i, j), 0).sub(surf.P(U(Math.max(0, i - 1)), Vv(i, j), 0)).multiplyScalar(sign);
  wall(row(0), (k) => vdir(-1, k, 0));
  wall(row(sv), (k) => vdir(1, k, sv));
  wall(col(0), (k) => udir(-1, 0, k));
  wall(col(su), (k) => udir(1, su, k));
  parts.push(triSoup(walls));
  return mergeList(parts);
}

/** Inner (inward facing) face of a slab, for plates whose underside is seen. */
export function innerGeo(surf, { thick = 0.5, su = 8, sv = 4, v0 = 0, v1 = 1, vmax = null }) {
  const U = (i) => i / su, Vt = (i) => (vmax ? Math.min(v1, vmax(U(i))) : v1);
  const Vv = (i, j) => v0 + (Vt(i) - v0) * j / sv;
  return gridSurface(su, sv, (i, j) => surf.P(U(i), Vv(i, j), -thick), (i, j) => surf.N(U(i), Vv(i, j)).negate());
}

/** Single sided surface patch at a constant offset (slit, halo, decals). */
export function patchGeo(surf, { off = 0, su = 4, sv = 4, u0 = 0, u1 = 1, v0 = 0, v1 = 1 }) {
  const U = (i) => u0 + (u1 - u0) * i / su, Vv = (j) => v0 + (v1 - v0) * j / sv;
  return gridSurface(su, sv, (i, j) => surf.P(U(i), Vv(j), off), (i, j) => surf.N(U(i), Vv(j)));
}

/**
 * Raised ribbon (engraving relief, filigree, rays, bands) following a path on a surface.
 * path(t) -> [u, v]; width in metres (number or function of t); height above the bump surface.
 */
export function ribbonGeo(surf, path, { n = 8, width = 0.2, height = 0.12, bump = () => 0, base = -0.04, caps = true }) {
  const W = typeof width === 'function' ? width : () => width;
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, [u, v] = path(t);
    const b = bump(u, v);
    pts.push({ p: surf.P(u, v, b + base), top: surf.P(u, v, b + height), nrm: surf.N(u, v), w: W(t) });
  }
  const tris = [];
  const L = [], R = [], TL = [], TR = [];
  for (let k = 0; k <= n; k++) {
    const a = pts[Math.max(0, k - 1)], c = pts[Math.min(n, k + 1)];
    const tan = c.p.clone().sub(a.p).normalize();
    const bin = new THREE.Vector3().crossVectors(pts[k].nrm, tan).normalize().multiplyScalar(pts[k].w / 2);
    L.push(pts[k].p.clone().sub(bin)); R.push(pts[k].p.clone().add(bin));
    TL.push(pts[k].top.clone().sub(bin)); TR.push(pts[k].top.clone().add(bin));
  }
  for (let k = 0; k < n; k++) {
    const nrm = pts[k].nrm;
    tris.push([TL[k], TR[k], TR[k + 1], nrm], [TL[k], TR[k + 1], TL[k + 1], nrm]);
    const sideL = L[k].clone().sub(R[k]), sideR = sideL.clone().negate();
    tris.push([L[k], TL[k], TL[k + 1], sideL], [L[k], TL[k + 1], L[k + 1], sideL]);
    tris.push([R[k], TR[k], TR[k + 1], sideR], [R[k], TR[k + 1], R[k + 1], sideR]);
  }
  if (caps) {
    const t0 = pts[0].p.clone().sub(pts[1].p), t1 = pts[n].p.clone().sub(pts[n - 1].p);
    tris.push([L[0], R[0], TR[0], t0], [L[0], TR[0], TL[0], t0], [L[n], R[n], TR[n], t1], [L[n], TR[n], TL[n], t1]);
  }
  return triSoup(tris);
}

/** Flat drip decal hanging `off` metres off the surface: path in (u, v), tapering to a bead. */
export function dripGeo(surf, path, { n = 6, width = 0.35, off = 0.02, bump = () => 0 }) {
  const tris = [];
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, [u, v] = path(t);
    const w = width * (k === n ? 0.05 : (1 - 0.75 * t) * (0.85 + 0.3 * Math.sin(t * 9.0)));
    pts.push({ p: surf.P(u, v, bump(u, v) + off), nrm: surf.N(u, v), w });
  }
  for (let k = 0; k <= n; k++) {
    const a = pts[Math.max(0, k - 1)], c = pts[Math.min(n, k + 1)];
    const tan = c.p.clone().sub(a.p).normalize();
    pts[k].bin = new THREE.Vector3().crossVectors(pts[k].nrm, tan).normalize();
  }
  for (let k = 0; k < n; k++) {
    const A = pts[k], B = pts[k + 1];
    const al = A.p.clone().addScaledVector(A.bin, -A.w / 2), ar = A.p.clone().addScaledVector(A.bin, A.w / 2);
    const bl = B.p.clone().addScaledVector(B.bin, -B.w / 2), br = B.p.clone().addScaledVector(B.bin, B.w / 2);
    tris.push([al, ar, br, A.nrm], [al, br, bl, A.nrm]);
  }
  return triSoup(tris);
}

const domeCache = new Map();
/** Rivet: low dome sitting on the surface point p with normal nrm. */
export function rivetGeo(p, nrm, r = 0.25, segs = 6) {
  const key = r + '|' + segs;
  let base = domeCache.get(key);
  if (!base) { base = finish(new THREE.SphereGeometry(r, segs, 3, 0, Math.PI * 2, 0, Math.PI / 2)); domeCache.set(key, base); }
  const g = base.clone();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), nrm.clone().normalize()));
  g.translate(p.x - nrm.x * r * 0.3, p.y - nrm.y * r * 0.3, p.z - nrm.z * r * 0.3);
  return g;
}

/** Gear with k teeth lying in the XY plane (axis +z), extruded `depth`, centred on z = 0. */
export function gearGeo(R, k = 12, depth = 0.6, tooth = 0.18, hub = 0.35) {
  const s = new THREE.Shape();
  const steps = k * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2, ph = i % 4;
    const r = ph === 1 || ph === 2 ? R * (1 + tooth) : R;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, R * hub, 0, Math.PI * 2, true); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return finish(g);
}

/** Place a geometry (built around the origin, axis +z) at p facing along dir, spun by `spin`. */
export function placeGeo(g, p, dir, spin = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir.clone().normalize());
  if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), spin));
  g.applyQuaternion(q); g.translate(p.x, p.y, p.z);
  return g;
}

/** Wrap a flat design (x right, y up, z = height above the surface, all metres) onto a surface around (uc, vc). */
export function wrapGeo(geo, surf, uc, vc, bump = () => 0) {
  const g = finish(geo.clone());
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = uc + p.getX(i) / surf.du, v = vc + p.getY(i) / surf.dv;
    const q = surf.P(u, v, bump(u, v) + p.getZ(i));
    p.setXYZ(i, q.x, q.y, q.z);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------------
// parts: a part collects geometry per material and becomes one mesh per material, sharing one ink id

export function mesh(bc, geo, mat, name, inkId) {
  const m = new THREE.Mesh(geo, mat);
  m.name = bc.name + '.' + name + '.' + bc.meshes.length;
  bc.tag(m, { inkId: inkId ?? bc.ink.next(), layer: bc.layer });
  bc.meshes.push(m);
  return m;
}

export function part(bc, parent, name, { drift = V(0, 0, 0), inkId } = {}) {
  const lists = new Map();
  const id = inkId ?? bc.ink.next();
  const p = {
    id,
    add(matKey, g) { if (!g) return p; if (!lists.has(matKey)) lists.set(matKey, []); lists.get(matKey).push(g); return p; },
    end() {
      const out = [];
      for (const [k, list] of lists) {
        const m = mesh(bc, mergeList(list), bc.mats[k], name + (k === 'verd' ? '' : '-' + k), id);
        m.userData.drift = drift.clone();
        if (k === 'drip') { m.castShadow = false; }
        parent.add(m); out.push(m);
      }
      return out;
    },
  };
  return p;
}

/** Rivet row along u at height v on a surface (spacing in metres), skipping the plate ends. */
export function rivetRow(pt, surf, v, { spacing = 1.6, r = 0.22, bump = () => 0, u0 = 0.06, u1 = 0.94, mat = 'gold', segs = 6 }) {
  const n = Math.max(1, Math.round((u1 - u0) * surf.du / spacing));
  const us = [];
  for (let k = 0; k <= n; k++) {
    const u = u0 + (u1 - u0) * k / n;
    pt.add(mat, rivetGeo(surf.P(u, v, bump(u, v)), surf.N(u, v), r, segs));
    us.push(u);
  }
  return us;
}

/**
 * Forged plate: thick pillowed slab, gold band on the lower edge (optionally the top edge), rivet row
 * under the top edge, a few verdigris drips running down from rivets (hash chosen).
 */
export function forgedPlate(pt, surf, o) {
  const { thick = 0.5, bu = 0.3, bv = 0.15, su = 8, sv = 3, band = 0.55, bandRaise = 0.16, topBand = 0, rivets = true, rivetR = 0.22, rivetSpacing = 1.7,
    drips = 0, seed = 1, hash, vmax = null, sideBands = 0, dripLen = 0.55 } = o;
  const bump = pillow(bu, bv);
  pt.add('verd', slabGeo(surf, { thick, bump, su, sv, vmax }));
  // underside of plates seen from below (pauldron lames, tassets): a dark inner face
  if (o.innerMat) pt.add(o.innerMat, innerGeo(surf, { thick, su, sv, vmax }));
  const bv0 = band / surf.dv, tb = topBand / surf.dv;
  const bandBump = (u, v) => bump(u, v) + bandRaise;
  if (band > 0) pt.add('gold', slabGeo(surf, { thick: thick + 0.06, bump: bandBump, su, sv: 1, v0: -0.01, v1: bv0 }));
  if (topBand > 0 && !vmax) pt.add('gold', slabGeo(surf, { thick: thick + 0.06, bump: bandBump, su, sv: 1, v0: 1 - tb, v1: 1.01 }));
  if (sideBands > 0) {
    const w = sideBands / surf.du;
    for (const [a, b] of [[-0.005, w], [1 - w, 1.005]]) pt.add('gold', slabGeo(surf, { thick: thick + 0.06, bump: (u, v) => bump(u, v) + bandRaise * 0.7, su: 1, sv: Math.max(2, sv), u0: a, u1: b, v0: bv0, v1: vmax ? 0.9 * vmax(0.5) : 1 - tb }));
  }
  if (rivets) {
    const vr = vmax ? Math.min(0.85, vmax(0.5) - 0.12) : 1 - Math.max(tb, 0.35 / surf.dv) - 0.45 / surf.dv;
    const us = rivetRow(pt, surf, vr, { spacing: rivetSpacing, r: rivetR, bump, u0: 0.08, u1: 0.92 });
    if (band > 0) rivetRow(pt, surf, bv0 * 0.5, { spacing: rivetSpacing * 1.3, r: rivetR * 0.8, bump: bandBump, u0: 0.1, u1: 0.9 });
    if (drips > 0 && hash) {
      us.forEach((u, k) => {
        if (hash(seed * 7.3 + k * 1.37) > drips) return;
        const len = dripLen * (0.5 + hash(seed * 3.1 + k * 2.9));
        const wob = (hash(seed + k * 5.1) - 0.5) * 0.03;
        const vStart = vr - (rivetR * 1.1) / surf.dv;
        const vEnd = Math.max(bv0 + 0.03, vStart - len);
        pt.add('drip', dripGeo(surf, (t) => [u + wob * t * t, vStart - (vStart - vEnd) * t], { width: rivetR * 1.6, bump }));
        // a second, shorter run beside the first now and then
        if (hash(seed * 1.9 + k) < 0.4) {
          const u2 = u + 0.35 / surf.du, vE2 = Math.max(bv0 + 0.03, vStart - len * 0.5);
          pt.add('drip', dripGeo(surf, (t) => [u2, vStart - 0.1 / surf.dv - (vStart - vE2) * t], { width: rivetR * 1.1, bump }));
        }
      });
    }
  }
  return bump;
}

/** Greek key (meander) band of raised gold ribbons on a plate between v0 and v1. */
export function meander(pt, surf, { v0, v1, cell = 1.6, w = 0.14, h = 0.1, bump = () => 0, u0 = 0.04, u1 = 0.96 }) {
  const n = Math.max(1, Math.floor((u1 - u0) * surf.du / cell));
  const cu = (u1 - u0) / n;
  const seg = (a, b, k = 3) => pt.add('gold', ribbonGeo(surf, (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], { n: k, width: w, height: h, bump }));
  const vv = (f) => v0 + (v1 - v0) * f;
  seg([u0, vv(0)], [u1, vv(0)], n * 3); seg([u0, vv(1)], [u1, vv(1)], n * 3);
  for (let i = 0; i < n; i++) {
    const a = u0 + i * cu, U = (f) => a + cu * f;
    seg([U(0.1), vv(0)], [U(0.1), vv(0.82)], 1);
    seg([U(0.1), vv(0.82)], [U(0.8), vv(0.82)], 2);
    seg([U(0.8), vv(0.82)], [U(0.8), vv(0.22)], 1);
    seg([U(0.8), vv(0.22)], [U(0.35), vv(0.22)], 1);
    seg([U(0.35), vv(0.22)], [U(0.35), vv(0.58)], 1);
  }
}

/** Exposed works: two or three meshing gears and a drive shaft, seen through a missing plate. */
export function gears(pt, surf, uc, vc, { depth = 0.5, R = 1.6, hash, seed = 1, k = 14 }) {
  const N = surf.N(uc, vc);
  const pA = surf.P(uc, vc, -depth);
  pt.add('dark', placeGeo(gearGeo(R, k, 0.7), pA, N, hash(seed) * 3));
  const up = surf.P(uc, Math.min(1, vc + 0.3), -depth).sub(pA).normalize();
  const side = new THREE.Vector3().crossVectors(N, up).normalize();
  const pB = pA.clone().addScaledVector(side, R * 1.75).addScaledVector(up, R * 0.5).addScaledVector(N, -0.3);
  pt.add('gold', placeGeo(gearGeo(R * 0.72, Math.round(k * 0.7), 0.6), pB, N, hash(seed + 1) * 3));
  const pC = pA.clone().addScaledVector(side, -R * 1.5).addScaledVector(up, -R * 0.9).addScaledVector(N, -0.15);
  pt.add('dark', placeGeo(gearGeo(R * 0.6, Math.round(k * 0.6), 0.6), pC, N, hash(seed + 2) * 3));
  // axle caps and a piston rod
  pt.add('gold', placeGeo(finish(new THREE.CylinderGeometry(R * 0.32, R * 0.32, 1.2, 8).rotateX(Math.PI / 2)), pA, N));
  const rod = finish(new THREE.CylinderGeometry(R * 0.18, R * 0.18, R * 3.2, 6));
  pt.add('dark', placeGeo(rod.rotateX(Math.PI / 2), pA.clone().addScaledVector(up, R * 0.4).addScaledVector(N, -0.6), up));
}

/**
 * Ring of n forged plates around local +y of `parent`, between y and y+h. Each plate is its own part
 * (one ink id) with drift along its outward normal. missing: plate indices left out to show gears;
 * broken: indices torn short at the top. Returns the group.
 */
export function ring(bc, parent, o) {
  const { y, h, rTop, rBot, n = 4, gap = 0.06, phase = 0, core = true, coreScale = 0.86, missing = [], broken = [], meanderBand = null, hash, seed = 1, name = 'plate' } = o;
  const group = new THREE.Group(); group.position.y = y; parent.add(group);
  const span = (Math.PI * 2) / n, len = span - gap;
  for (let i = 0; i < n; i++) {
    const t0 = phase + i * span + gap / 2, tc = t0 + len / 2;
    const surf = cylSurf({ rTop, rBot, h, t0, len });
    const pt = part(bc, group, name, { drift: V(Math.sin(tc), 0, Math.cos(tc)) });
    const sd = seed * 13 + i;
    if (missing.includes(i)) {
      gears(pt, surf, 0.5, 0.5, { depth: (o.thick ?? 0.5) + 0.3, R: Math.min(h, surf.du) * 0.22, hash, seed: sd });
      // torn stubs of the plate left at both ends
      forgedPlate(pt, cylSurf({ rTop, rBot, h, t0, len: len * 0.16 }), { ...o, su: 2, rivets: false, drips: 0, vmax: (u) => 0.55 + 0.4 * hash(sd + u * 3) });
      forgedPlate(pt, cylSurf({ rTop, rBot, h, t0: t0 + len * 0.86, len: len * 0.14 }), { ...o, su: 2, rivets: false, drips: 0, vmax: (u) => 0.4 + 0.3 * hash(sd + 9 + u * 3) });
      pt.end();
      continue;
    }
    const isBroken = broken.includes(i);
    const vmax = isBroken ? (u) => 0.52 + 0.18 * Math.sin(u * 11 + sd) + 0.12 * hash(sd + Math.floor(u * 7)) : null;
    const bump = forgedPlate(pt, surf, { ...o, seed: sd, hash, vmax });
    if (isBroken) gears(pt, cylSurf({ rTop, rBot, h, t0, len, y0: 0 }), 0.5, 0.82, { depth: (o.thick ?? 0.5) + 0.3, R: Math.min(h, surf.du) * 0.16, hash, seed: sd + 5 });
    if (meanderBand && !isBroken) meander(pt, surf, { v0: meanderBand[0], v1: meanderBand[1], bump, cell: meanderBand[2] || 1.6, w: meanderBand[3] || 0.14 });
    pt.end();
  }
  if (core) {
    const c = mesh(bc, finish(new THREE.CylinderGeometry(rTop * coreScale, rBot * coreScale, h * 1.02, 14, 1, false)), bc.mats.dark, 'core');
    c.position.y = h / 2; c.userData.drift = V(0, 0, 0); group.add(c);
  }
  return group;
}

/** Ball joint (dark bronze sphere). */
export function ball(bc, parent, r, pos = [0, 0, 0], segs = 18) {
  const b = mesh(bc, finish(new THREE.SphereGeometry(r, segs, Math.max(8, Math.round(segs * 0.66)))), bc.mats.dark, 'joint');
  b.position.set(...pos); parent.add(b);
  b.userData.drift = new THREE.Vector3(0, 0, 0);
  return b;
}

/**
 * Steam vent: a short dark cylinder; the returned Object3D sits at the mouth with local +z pointing out,
 * so FX can call vent.getWorldPosition(v) and vent.getWorldDirection(d).
 */
export function vent(bc, parent, { pos, dir, r = 0.8, len = 1.6, small = false, joint = '', side = '' }) {
  const v = new THREE.Object3D(); v.name = bc.name + '.vent.' + joint + side;
  v.position.set(...pos);
  const d = new THREE.Vector3(...dir).normalize();
  v.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  parent.add(v);
  const g = mergeList([
    new THREE.CylinderGeometry(r, r * 1.15, len, 10, 1, false).rotateX(Math.PI / 2).translate(0, 0, -len / 2),
  ]);
  const cyl = mesh(bc, g, bc.mats.dark, 'vent');
  cyl.userData.drift = new THREE.Vector3(0, 0, 0);
  v.add(cyl);
  const lip = mesh(bc, finish(new THREE.TorusGeometry(r, r * 0.22, 5, 10).translate(0, 0, -0.05)), bc.mats.gold, 'ventrim', cyl.userData.inkId);
  lip.userData.drift = new THREE.Vector3(0, 0, 0); v.add(lip);
  v.userData = { vent: true, small, joint, side, radius: r, active: () => { for (let p = v; p; p = p.parent) if (!p.visible) return false; return true; } };
  bc.vents.push(v);
  return v;
}

/** A surface carried through an affine matrix (points) and its linear part (directions). */
export function mapSurf(surf, m) {
  return {
    P: (u, v, off = 0) => surf.P(u, v, off).applyMatrix4(m),
    N: (u, v) => surf.N(u, v).transformDirection(m),
    du: surf.du, dv: surf.dv,
  };
}

/** Local metric lengths (metres per unit u and v) of a surface around (u, v). */
export function localMetric(surf, u, v) {
  const e = 1e-3, p = surf.P(u, v, 0);
  return { du: surf.P(u + e, v, 0).distanceTo(p) / e, dv: surf.P(u, v + e, 0).distanceTo(p) / e };
}

/** Double volute (S scroll) of raised gold ribbon centred at (uc, vc), size in metres. */
export function volute(pt, surf, uc, vc, { size = 1.5, turns = 1.25, width = 0.2, height = 0.13, bump = () => 0, n = 36, rot = 0 }) {
  const m = localMetric(surf, uc, vc);
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const sg of [1, -1]) {
    pt.add('gold', ribbonGeo(surf, (t) => {
      const r = size * (1 - 0.82 * t), a = t * turns * Math.PI * 2;
      const x = sg * (-size + r * Math.cos(a)), y = sg * r * Math.sin(a);
      return [uc + (x * c - y * s) / m.du, vc + (x * s + y * c) / m.dv];
    }, { n, width: (t) => width * (1 - 0.45 * t), height, bump }));
  }
}
