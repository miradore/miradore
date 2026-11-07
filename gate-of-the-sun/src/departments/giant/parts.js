// Geometry factories shared by the giant and the small automatons: curved plates with gold rims,
// box plates, ball joints, steam vents. Everything is built from primitives so the ink pass finds
// honest crease edges. Plates cycle their ink ids so neighbouring plates always get a line.
import * as THREE from 'three';

export const DARK_BRONZE = 0x3A2A16, DARK_BRONZE_SHADE = 0x1E150B, GOLD_SHADE = 0xA8822A;
export const SLIT_LIT = 0x9CFFFF, SLIT_DARK = 0x0C2A2E, HALO_LIT = 0x3FC8DC, HALO_DARK = 0x08181C;

/** One material set per body (dithered opacity must not be shared between bodies). */
export function makeMaterials(ctx) {
  const P = ctx.MAP.PALETTE;
  return {
    verd: ctx.makeCel({ color: P.verdigris, shade: P.verdigrisShade, wobble: 0.1 }),
    gold: ctx.makeCel({ color: P.gold, shade: GOLD_SHADE, wobble: 0.08 }),
    dark: ctx.makeCel({ color: DARK_BRONZE, shade: DARK_BRONZE_SHADE, wobble: 0.06 }),
    slit: ctx.makeFlat({ color: SLIT_DARK }),
    halo: ctx.makeFlat({ color: HALO_DARK }),
  };
}

/** Ink id cycler for a body: ids wrap through [min, max]. */
export function makeInk(min, max) {
  let i = 0;
  return { next() { const id = min + (i % (max - min + 1)); i++; return id; }, peek() { return min + (i % (max - min + 1)); } };
}

// geometry cache so identical plates share buffers
const geoCache = new Map();
function cached(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }

export function countTriangles(obj) {
  let n = 0;
  obj.traverse((o) => { if (o.isMesh && o.geometry) { const g = o.geometry; n += g.index ? g.index.count / 3 : g.attributes.position.count / 3; } });
  return n;
}

/**
 * Build context: { mats, ink, tag, layer, meshes, name } where meshes collects every mesh for colliders.
 */
export function mesh(bc, geo, mat, name, inkId) {
  const m = new THREE.Mesh(geo, mat);
  m.name = bc.name + '.' + name;
  bc.tag(m, { inkId: inkId ?? bc.ink.next(), layer: bc.layer });
  bc.meshes.push(m);
  return m;
}

/**
 * Ring of n curved plates around the local Y axis of `parent`, between y0 and y0+h.
 * rTop/rBot: radii at the top and bottom of the plate (flare). Gold rims: arcs along top and bottom
 * edges (torus sectors) and thin cylinders along the vertical edges. Plates store a drift direction
 * for the dissolve (outward normal in the parent's frame).
 */
export function ringPlates(bc, parent, { y, h, rTop, rBot, n = 4, gap = 0.12, phase = 0, rim = 0.32, segs = 6, rimVertical = true, core = true }) {
  const group = new THREE.Group(); group.position.y = y; parent.add(group);
  const span = (Math.PI * 2) / n;
  const len = span - gap;
  const rMid = (rTop + rBot) / 2;
  for (let i = 0; i < n; i++) {
    const t0 = phase + i * span + gap / 2;
    const tc = t0 + len / 2;
    const plate = mesh(bc, cached(`cyl|${rTop}|${rBot}|${h}|${segs}|${len.toFixed(4)}`, () => new THREE.CylinderGeometry(rTop, rBot, h, segs, 1, true, 0, len)), bc.mats.verd, 'plate');
    plate.rotation.y = t0;
    plate.position.y = h / 2;
    plate.userData.drift = new THREE.Vector3(Math.sin(tc), 0, Math.cos(tc));
    group.add(plate);
    // rims: top and bottom arcs. Torus arc angle a maps to cylinder theta = PI/2 - a when rotated by +90 deg about x.
    const topArc = mesh(bc, cached(`tor|${rTop}|${rim}|${len.toFixed(4)}`, () => new THREE.TorusGeometry(rTop, rim, 5, Math.max(4, segs), len)), bc.mats.gold, 'rim', plate.userData.inkId);
    topArc.rotation.set(Math.PI / 2, 0, Math.PI / 2 - (t0 + len), 'XYZ');
    topArc.position.y = h; topArc.userData.drift = plate.userData.drift; group.add(topArc);
    const botArc = mesh(bc, cached(`tor|${rBot}|${rim}|${len.toFixed(4)}`, () => new THREE.TorusGeometry(rBot, rim, 5, Math.max(4, segs), len)), bc.mats.gold, 'rim', plate.userData.inkId);
    botArc.rotation.set(Math.PI / 2, 0, Math.PI / 2 - (t0 + len), 'XYZ');
    botArc.position.y = 0; botArc.userData.drift = plate.userData.drift; group.add(botArc);
    if (rimVertical) {
      for (const a of [t0, t0 + len]) {
        const bar = mesh(bc, cached(`bar|${rim}|${h}|${rTop - rBot}`, () => new THREE.CylinderGeometry(rim, rim, Math.hypot(h, rTop - rBot), 5, 1, true)), bc.mats.gold, 'rim', plate.userData.inkId);
        bar.position.set(Math.sin(a) * rMid, h / 2, Math.cos(a) * rMid);
        // tilt along the flare direction (radial)
        const tilt = Math.atan2(rBot - rTop, h);
        bar.rotation.set(0, a, 0); bar.rotateX(tilt);
        bar.userData.drift = plate.userData.drift;
        group.add(bar);
      }
    }
  }
  if (core) {
    const c = mesh(bc, cached(`core|${rTop}|${rBot}|${h}`, () => new THREE.CylinderGeometry(rTop * 0.92, rBot * 0.92, h * 1.02, 12, 1, false)), bc.mats.dark, 'core');
    c.position.y = h / 2; group.add(c);
  }
  return group;
}

/** Box plate with gold rims along the four edges of its +z face. Drift is local +z of the parent. */
export function boxPlate(bc, parent, { w, h, d, pos = [0, 0, 0], rot = [0, 0, 0], rim = 0.3, drift = null, rims = true }) {
  const g = new THREE.Group(); g.position.set(...pos); g.rotation.set(...rot); parent.add(g);
  const box = mesh(bc, cached(`box|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), bc.mats.verd, 'plate');
  box.userData.drift = drift ? drift.clone() : new THREE.Vector3(0, 0, 1).applyEuler(g.rotation);
  g.add(box);
  if (rims) {
    const id = box.userData.inkId;
    const hz = cached(`rimh|${w}|${rim}`, () => new THREE.CylinderGeometry(rim, rim, w, 5, 1, true));
    const vt = cached(`rimv|${h}|${rim}`, () => new THREE.CylinderGeometry(rim, rim, h, 5, 1, true));
    for (const s of [-1, 1]) {
      const a = mesh(bc, hz, bc.mats.gold, 'rim', id); a.rotation.z = Math.PI / 2; a.position.set(0, s * h / 2, d / 2); a.userData.drift = box.userData.drift; g.add(a);
      const b = mesh(bc, vt, bc.mats.gold, 'rim', id); b.position.set(s * w / 2, 0, d / 2); b.userData.drift = box.userData.drift; g.add(b);
    }
  }
  return g;
}

/** Ball joint (dark bronze sphere). */
export function ball(bc, parent, r, pos = [0, 0, 0], segs = 18) {
  const b = mesh(bc, cached(`ball|${r}|${segs}`, () => new THREE.SphereGeometry(r, segs, Math.max(8, Math.round(segs * 0.66)))), bc.mats.dark, 'joint');
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
  const cyl = mesh(bc, cached(`vent|${r}|${len}`, () => new THREE.CylinderGeometry(r, r * 1.15, len, 10, 1, false)), bc.mats.dark, 'vent');
  cyl.rotation.x = Math.PI / 2; cyl.position.z = -len / 2;
  cyl.userData.drift = new THREE.Vector3(0, 0, 0);
  v.add(cyl);
  const lip = mesh(bc, cached(`ventlip|${r}`, () => new THREE.TorusGeometry(r, r * 0.22, 5, 10)), bc.mats.gold, 'ventrim', cyl.userData.inkId);
  lip.position.z = -0.05; lip.userData.drift = new THREE.Vector3(0, 0, 0); v.add(lip);
  v.userData = { vent: true, small, joint, side, radius: r, active: () => { for (let p = v; p; p = p.parent) if (!p.visible) return false; return true; } };
  bc.vents.push(v);
  return v;
}

/** Sphere sector plate (for the head) centred on direction phiC (around Y, PI/2 = +z) and thetaC (from +y pole). */
export function spherePlate(bc, parent, { r, phiC, phiW, thetaC, thetaW, mat, name = 'plate', inkId, segs = 10, segsH, drift = true }) {
  const sw = Math.max(3, segs), sh = Math.max(2, segsH ?? Math.round(segs * 0.7));
  const g = cached(`sph|${r}|${phiW.toFixed(3)}|${thetaW.toFixed(3)}|${sw}|${sh}`, () => new THREE.SphereGeometry(r, sw, sh, -phiW / 2, phiW, thetaC - thetaW / 2, thetaW));
  const m = mesh(bc, g, mat ?? bc.mats.verd, name, inkId);
  // SphereGeometry: x = -cos(phi) sin(theta), z = sin(phi) sin(theta). phi = PI/2 points to +z. Rotate about y so the sector centre lands on phiC.
  m.rotation.y = phiC;
  if (drift) m.userData.drift = new THREE.Vector3(-Math.cos(phiC) * Math.sin(thetaC), Math.cos(thetaC), Math.sin(phiC) * Math.sin(thetaC));
  else m.userData.drift = new THREE.Vector3(0, 0, 0);
  parent.add(m);
  return m;
}
