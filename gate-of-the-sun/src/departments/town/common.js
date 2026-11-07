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
export function heightGrid(xs, zs, hFn) {
  const pos = [], nrm = [];
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
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

/** Build the shared material set once. */
export function makeMaterials(ctx) {
  const { makeCel, MAP } = ctx; const P = MAP.PALETTE;
  const cel = (color, shade, extra = {}) => makeCel({ color, shade, ...extra });
  return {
    stucco: P.stucco.map((c) => cel(c, P.stuccoShade)),
    interior: cel(0xF1E4CF, 0xB9A4C9),
    recess: cel(0x4E4070, 0x362B52),
    cobalt: cel(P.cobalt, P.cobaltShade),
    dome: cel(P.dome, P.domeShade),
    sandstone: cel(P.sandstone, P.sandstoneShade),
    sandstoneDark: cel(0xD1A27D, 0xA86A4C),
    bronze: cel(P.bronze, P.bronzeShade),
    bronzeDark: cel(0x6E4F22, 0x3F2C12),
    gold: cel(MAP.GATE.sunColor, 0xB08A32),
    water: cel(0x2DA6BC, 0x1C7589),
    sand: cel(0xE9D9B6, 0xB9A4C9),
    paving: cel(0xE3CDB0, 0xB29AC2),
    stone: cel(0xD8C7AE, 0xA891B5),
    field: cel(P.field, P.fieldShade),
    fieldShade: cel(P.fieldShade, 0x4E7328),
    wheat: cel(0xE0C45E, 0xB2933A),
    plain: cel(0xC9D48A, 0x9BAE66),
    hedge: cel(0x4F8A3A, 0x2F5C26),
    road: cel(0xD9B98C, 0xA98662),
    mountain: cel(P.mountain, P.mountainShade),
    mountainFar: cel(0x8DA3DC, 0x6D85C9),
    awning: P.awning.map((c) => cel(c, new THREE.Color(c).multiplyScalar(0.62).getHex())),
    white: cel(0xFFFFFF, 0xC7B9EA),
    bougainvillea: cel(P.bougainvillea, P.bougainvilleaShade),
    leaf: cel(0x5FA05A, 0x33663A),
    pot: cel(0xC9794A, 0x8A4A2C),
    wood: cel(0x9C6B3C, 0x5E3D20),
    cloth: [cel(0xFFFFFF, 0xC7B9EA), cel(P.cobalt, P.cobaltShade), cel(0xE9553B, 0x9A3625), cel(0xF2C94C, 0xA88A2C), cel(0xE6397E, 0xA71E5A), cel(0x7CC5E8, 0x4A86B0), cel(0xF6E7C8, 0xB9A4C9)],
  };
}
