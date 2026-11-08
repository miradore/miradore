// Shared helpers for the town department: geometry builders, merging and the material set.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Box geometry centred at (x, y, z). */
export function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** Box rotated (Euler, radians) about its own centre, then placed at (x, y, z). */
export function boxRot(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

/** Cylinder (axis y) placed with its base at y. */
export function cyl(rTop, rBot, h, seg, x, y, z) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, false);
  g.translate(x, y + h / 2, z);
  return g;
}

/** Sphere / hemisphere centred at (x, y, z). */
export function sphere(r, x, y, z, ws = 12, hs = 8, hemi = false) {
  const g = new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, hemi ? Math.PI / 2 : Math.PI);
  g.translate(x, y, z);
  return g;
}

/** Cone with its base at y. */
export function cone(r, h, seg, x, y, z) {
  const g = new THREE.ConeGeometry(r, h, seg, 1, false);
  g.translate(x, y + h / 2, z);
  return g;
}

/** Merge a list of geometries (indexed or not) into one non-indexed geometry. Returns null when empty. */
export function merge(list) {
  const gs = [];
  for (const g of list) {
    if (!g) continue;
    gs.push(g.index ? g.toNonIndexed() : g);
  }
  if (!gs.length) return null;
  if (gs.length === 1) return gs[0];
  const m = mergeGeometries(gs, false);
  for (const g of gs) g.dispose();
  return m;
}

/** Point in polygon (2D, array of [x, y]). */
export function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Extrude a 2D polygon ([x, y] list) in the xy plane by depth along z, centred on z = 0. */
export function extrudePoly(poly, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i][0], poly[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/**
 * Prism whose top follows topFn(x, z) and bottom follows botFn(x, z); x in [x0, x1], z in [z0, z1].
 * Built from segments of length dz along z (and dx along x when given). Closed on all sides.
 */
export function slab(x0, x1, z0, z1, topFn, botFn, dz = 2, dx = 0) {
  const pos = [], nrm = [];
  const zs = []; for (let z = z0; z < z1 - 1e-6; z += dz) zs.push(z); zs.push(z1);
  const xs = []; if (dx > 0) { for (let x = x0; x < x1 - 1e-6; x += dx) xs.push(x); xs.push(x1); } else xs.push(x0, x1);
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    pos.push(...a, ...b, ...c); nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  const T = (x, z) => [x, topFn(x, z), z];
  const B = (x, z) => [x, botFn(x, z), z];
  for (let j = 0; j < zs.length - 1; j++) {
    const za = zs[j], zb = zs[j + 1];
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i], xb = xs[i + 1];
      quad(T(xa, za), T(xa, zb), T(xb, zb), T(xb, za));          // top (normal +y)
      quad(B(xa, za), B(xb, za), B(xb, zb), B(xa, zb));          // bottom
    }
    quad(T(x0, za), B(x0, za), B(x0, zb), T(x0, zb));            // west side (normal -x)
    quad(T(x1, za), T(x1, zb), B(x1, zb), B(x1, za));            // east side (normal +x)
  }
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i], xb = xs[i + 1];
    quad(T(xa, z0), T(xb, z0), B(xb, z0), B(xa, z0));            // near cap (normal -z)
    quad(T(xa, z1), B(xa, z1), B(xb, z1), T(xb, z1));            // far cap (normal +z)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  return g;
}

/** Height-field grid over explicit x and z coordinate lists. Non-indexed, flat normals per quad. */
export function heightGrid(xs, zs, hFn, keep = null) {
  const pos = [], nrm = [];
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    if (keep && !keep((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2)) continue;
    const a = [xs[i], hFn(xs[i], zs[j]), zs[j]], b = [xs[i], hFn(xs[i], zs[j + 1]), zs[j + 1]];
    const c = [xs[i + 1], hFn(xs[i + 1], zs[j + 1]), zs[j + 1]], d = [xs[i + 1], hFn(xs[i + 1], zs[j]), zs[j]];
    for (const t of [[a, b, c], [a, c, d]]) {
      const [p, q, r] = t;
      const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      pos.push(...p, ...q, ...r); nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  return g;
}

/**
 * Flat decal polygon: pts are [u, v] pairs in a plane spanned by world unit vectors U and V through origin O,
 * pushed `off` metres along the outward normal N. Triangles are wound so they face N. Returns a geometry.
 */
export function decalPoly(pts, O, U, V, N, off = 0.01) {
  const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const W = (p) => [O[0] + U[0] * p[0] + V[0] * p[1] + N[0] * off, O[1] + U[1] * p[0] + V[1] * p[1] + N[1] * off, O[2] + U[2] * p[0] + V[2] * p[1] + N[2] * off];
  const pos = [], nrm = [];
  for (const t of tris) {
    let a = W(pts[t[0]]), b = W(pts[t[1]]), c = W(pts[t[2]]);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * N[0] + ny * N[1] + nz * N[2] < 0) { const tmp = b; b = c; c = tmp; }
    pos.push(...a, ...b, ...c); nrm.push(...N, ...N, ...N);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  return g;
}

/** Axis-aligned rectangle decal [u0, u1] x [v0, v1] (see decalPoly). */
export function decalRect(u0, u1, v0, v1, O, U, V, N, off = 0.01) {
  return decalPoly([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], O, U, V, N, off);
}

/**
 * Flat strip lying on a surface y = yFn(x, z) + lift, from (ax, az) to (bx, bz), width w, split every `seg`
 * metres so it follows slopes. Pushes raw triangle positions (facing up) into list.
 */
export function groundStrip(list, ax, az, bx, bz, w, yFn, lift = 0.003, seg = 1.5) {
  const L = Math.hypot(bx - ax, bz - az); if (L < 1e-6) return;
  const dx = (bx - ax) / L, dz = (bz - az) / L, px = -dz * w / 2, pz = dx * w / 2;
  const n = Math.max(1, Math.ceil(L / seg));
  for (let k = 0; k < n; k++) {
    const x0 = ax + dx * L * k / n, z0 = az + dz * L * k / n, x1 = ax + dx * L * (k + 1) / n, z1 = az + dz * L * (k + 1) / n;
    const P = (x, z) => [x, yFn(x, z) + lift, z];
    const a = P(x0 - px, z0 - pz), b = P(x0 + px, z0 + pz), c = P(x1 + px, z1 + pz), d = P(x1 - px, z1 - pz);
    // wind so the normal points up
    const up = ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])) > 0;
    if (up) list.push(...a, ...b, ...c, ...a, ...c, ...d); else list.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
}

/** Geometry from raw triangle positions (non-indexed, flat normals, empty uvs). */
export function rawGeometry(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  return g;
}

/** Build the shared material set once. */
export function makeMaterials(ctx) {
  const { makeCel, MAP } = ctx; const P = MAP.PALETTE;
  // paint maps are costly to generate (one canvas per kind and seed), so seeds collapse onto a small set:
  // two washes for stucco and stone, one for the rest. Scale and world position give the remaining variety.
  const SEEDS = { stucco: 2, stone: 1 };
  const cel = (color, shade, extra = {}) => {
    const o = { color, shade, ...extra };
    if (o.paint) o.paintSeed = 1 + ((o.paintSeed ?? 1) % (SEEDS[o.paint] || 1));
    return makeCel(o);
  };
  // stucco: four whites, each painted with two different seeds so neighbouring houses never share a wash
  const STUCCO2 = 0x9883B3;            // deep violet core shadow on the far side of the form
  const SAND2 = 0x985440;              // deep sienna core shadow on the sandstone
  const stucco = [];
  for (let s = 0; s < 2; s++) P.stucco.forEach((c, k) => stucco.push(cel(c, P.stuccoShade, { shade2: STUCCO2, band2Edge: -0.3, paint: 'stucco', paintScale: 3 + ((k * 3 + s * 5) % 5) * 0.5, paintSeed: 11 + k * 7 + s * 31 })));
  const stoneP = (scale, seed, amount = 1) => ({ paint: 'stone', paintScale: scale, paintSeed: seed, paintAmount: amount });
  return {
    stucco,
    interior: cel(0xF1E4CF, 0xB9A4C9, { paint: 'stucco', paintScale: 3, paintSeed: 3 }),
    recess: cel(0x4E4070, 0x362B52),
    cobalt: cel(P.cobalt, P.cobaltShade, { shade2: 0x0F2160, band2Edge: -0.3, paint: 'metal', paintScale: 2, paintSeed: 5, paintAmount: 0.6 }),
    cobaltSlat: cel(0x2A58C4, 0x183784, { shade2: 0x10235F, band2Edge: -0.3, paint: 'metal', paintScale: 2, paintSeed: 6, paintAmount: 0.6 }),
    dome: cel(P.dome, P.domeShade, { shade2: 0x136070, highlight: 0x7FE6EA, highlightEdge: 0.86, paint: 'soft', paintScale: 4, paintSeed: 8 }),
    sandstone: cel(P.sandstone, P.sandstoneShade, { shade2: SAND2, band2Edge: -0.3, ...stoneP(6, 21) }),
    sandstoneAlt: cel(0xDDAC86, 0xB27254, { shade2: SAND2, band2Edge: -0.3, ...stoneP(6, 22) }),
    sandstoneRepair: cel(0xD9B392, 0xAC7E6E, { shade2: 0x8A5848, band2Edge: -0.3, ...stoneP(4, 23) }),
    sandstoneFrame: cel(0xB98563, 0x8C5640, { shade2: 0x6E3C2C, band2Edge: -0.3, ...stoneP(3, 24) }),
    sandstoneDark: cel(0xD1A27D, 0xA86A4C, { shade2: 0x8A4A36, band2Edge: -0.3, ...stoneP(6, 25) }),
    bronze: cel(P.bronze, P.bronzeShade, { shade2: 0x3A2810, highlight: 0xC9A15A, highlightEdge: 0.86, paint: 'metal', paintScale: 3, paintSeed: 9 }),
    bronzeDark: cel(0x6E4F22, 0x3F2C12, { paint: 'metal', paintScale: 2, paintSeed: 10 }),
    gold: cel(MAP.GATE.sunColor, 0xB08A32, { highlight: 0xFFF0B0, highlightEdge: 0.8, paint: 'metal', paintScale: 3, paintSeed: 12, paintAmount: 0.6 }),
    water: cel(0x2DA6BC, 0x1C7589, { paint: 'soft', paintScale: 6, paintSeed: 13 }),
    ripple: cel(0x9BE6EE, 0x5FBBCB),
    sand: cel(0xE9D9B6, 0xB9A4C9, { paint: 'ground', paintScale: 5, paintSeed: 14 }),
    street: cel(0xE6D2B4, 0xB49EC4, { paint: 'paving', paintScale: 3, paintSeed: 15 }),
    streetBand: cel(0xCDB396, 0x9C88AA, { paint: 'stone', paintScale: 1.2, paintSeed: 1 }),
    paving: cel(0xE3CDB0, 0xB29AC2, { paint: 'paving', paintScale: 3, paintSeed: 16 }),
    stone: cel(0xD8C7AE, 0xA891B5, { shade2: 0x86709A, band2Edge: -0.3, ...stoneP(3, 17) }),
    canalStone: cel(0xD8C7AE, 0xA891B5, { shade2: 0x86709A, band2Edge: -0.3, ...stoneP(2.5, 18) }),
    canalSand: cel(P.sandstone, P.sandstoneShade, { shade2: SAND2, band2Edge: -0.3, ...stoneP(2.5, 19) }),
    trim: cel(0xEADCC4, 0xAE98BC, { shade2: 0x8E78A6, band2Edge: -0.3, ...stoneP(1.5, 26) }),
    field: cel(P.field, P.fieldShade, { paint: 'soft', paintScale: 60, paintSeed: 27 }),
    fieldShade: cel(P.fieldShade, 0x4E7328, { paint: 'soft', paintScale: 50, paintSeed: 28 }),
    wheat: cel(0xE0C45E, 0xB2933A, { paint: 'soft', paintScale: 40, paintSeed: 29 }),
    plain: cel(0xC9D48A, 0x9BAE66, { paint: 'soft', paintScale: 120, paintSeed: 30 }),
    hill: cel(0xB7C77E, 0x8F9F8C, { shade2: 0x7A8496, paint: 'soft', paintScale: 80, paintSeed: 31 }),
    hillOchre: cel(0xD7C68A, 0xA7A090, { shade2: 0x8A8A98, paint: 'soft', paintScale: 70, paintSeed: 32 }),
    hedge: cel(0x4F8A3A, 0x2F5C26, { paint: 'foliage', paintScale: 6, paintSeed: 33 }),
    cypress: cel(0x2F6A44, 0x1C4430, { shade2: 0x13302A, paint: 'foliage', paintScale: 4, paintSeed: 34 }),
    road: cel(0xD9B98C, 0xA98662, { paint: 'ground', paintScale: 5, paintSeed: 35 }),
    mountain: cel(P.mountain, P.mountainShade, { shade2: 0x3E4E8E, paint: 'soft', paintScale: 120, paintSeed: 36 }),
    mountainFar: cel(0x8DA3DC, 0x6D85C9, { paint: 'soft', paintScale: 120, paintSeed: 37 }),
    awning: P.awning.map((c, k) => cel(c, new THREE.Color(c).multiplyScalar(0.62).getHex(), { paint: 'soft', paintScale: 2, paintSeed: 40 + k, paintAmount: 0.8 })),
    white: cel(0xFFFFFF, 0xC7B9EA, { paint: 'soft', paintScale: 2, paintSeed: 43, paintAmount: 0.6 }),
    bougainvillea: cel(P.bougainvillea, P.bougainvilleaShade, { shade2: 0x7A1244, paint: 'foliage', paintScale: 1.5, paintSeed: 44 }),
    blossomLight: cel(0xF26FA6, 0xC23A78, { shade2: 0x8A1A52, paint: 'foliage', paintScale: 1.5, paintSeed: 45 }),
    leaf: cel(0x5FA05A, 0x33663A, { shade2: 0x234A30, paint: 'foliage', paintScale: 2, paintSeed: 46 }),
    leafDark: cel(0x3F7E46, 0x24502E, { shade2: 0x183A26, paint: 'foliage', paintScale: 2, paintSeed: 47 }),
    treeLeaf: cel(0x6BAA52, 0x3E7444, { shade2: 0x284E3A, band2Edge: -0.35, highlight: 0x9CCB6A, highlightEdge: 0.8, paint: 'foliage', paintScale: 2.5, paintSeed: 48 }),
    treeLeafB: cel(0x5C9C4E, 0x356A40, { shade2: 0x234634, band2Edge: -0.35, highlight: 0x8CC062, highlightEdge: 0.82, paint: 'foliage', paintScale: 2.5, paintSeed: 49 }),
    treeUnder: cel(0x3C6E46, 0x274C36, { shade2: 0x1A3628, paint: 'foliage', paintScale: 2.5, paintSeed: 50 }),
    pot: cel(0xC9794A, 0x8A4A2C, { shade2: 0x6A3420, paint: 'stone', paintScale: 1.5, paintSeed: 51 }),
    wood: cel(0x9C6B3C, 0x5E3D20, { paint: 'stone', paintScale: 1.5, paintSeed: 52, paintAmount: 0.7 }),
    iron: cel(0x3A3346, 0x221D2E, { highlight: 0x6A6080, highlightEdge: 0.85 }),
    glass: cel(0xFFE6A0, 0xD8A85E),
    glint: cel(0x857CB6, 0x5F5690),
    // painted decals (flat shapes 1 cm off the walls, no ink): stains, plaster patches, damp, signs
    stain: cel(0xC9B6A2, 0x9580A8, { paint: 'stucco', paintScale: 1.5, paintSeed: 53 }),
    stainDark: cel(0xAE9A86, 0x7E6A96, { paint: 'stucco', paintScale: 1.5, paintSeed: 54 }),
    patch: cel(0xDDB792, 0xAE8274, { paint: 'stone', paintScale: 1.2, paintSeed: 55 }),
    patchStone: cel(0xC99A78, 0x9A6C62, { paint: 'stone', paintScale: 0.8, paintSeed: 56 }),
    wallStreak: cel(0xB27C62, 0x86524A, { paint: 'stone', paintScale: 2, paintSeed: 57 }),
    wallStreakDark: cel(0x9A6C5C, 0x704846, { paint: 'stone', paintScale: 2, paintSeed: 57 }),
    wallBleach: cel(0xF6DEC4, 0xCC9C84, { paint: 'stone', paintScale: 2, paintSeed: 57 }),
    wet: cel(0xA87660, 0x744A4A, { highlight: 0xD0A890, highlightEdge: 0.9, paint: 'stone', paintScale: 1.5, paintSeed: 58 }),
    algae: cel(0x587A3E, 0x3A5638, { paint: 'foliage', paintScale: 1, paintSeed: 59 }),
    moss: cel(0x7E9E4E, 0x4E6A3E, { shade2: 0x334A30, paint: 'foliage', paintScale: 1, paintSeed: 60 }),
    jointDark: cel(0x8E6E5C, 0x6A4C4C),
    wornEdge: cel(0xEFE2CC, 0xBCA9C4, { paint: 'stone', paintScale: 1.2, paintSeed: 61 }),
    signs: [cel(0x8FB9B2, 0x6E8FA0), cel(0xD69A86, 0xA27484), cel(0xE2C27E, 0xAE9478), cel(0x9FA8D4, 0x7880AC)],
    signInk: cel(0x5C4A5E, 0x3E3050),
    cloth: [cel(0xFFFFFF, 0xC7B9EA), cel(P.cobalt, P.cobaltShade), cel(0xE9553B, 0x9A3625), cel(0xF2C94C, 0xA88A2C), cel(0xE6397E, 0xA71E5A), cel(0x7CC5E8, 0x4A86B0), cel(0xF6E7C8, 0xB9A4C9)],
  };
}
