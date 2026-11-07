// Terrain: ground following MAP.groundY, the canal trench, fields, road, hedges and the mountain ring.
import * as THREE from 'three';
import { box, boxRot, cone, merge, heightGrid } from './common.js';

export function buildTerrain(ctx, M) {
  const { MAP, ID, LAYER, tag } = ctx;
  const group = new THREE.Group(); group.name = 'terrain';
  const C = MAP.CANAL;
  const EPS = 0.004;

  // ---------------------------------------------------------------- ground
  const xs = [];
  for (let x = -260; x <= 260 + 1e-6; x += 4) xs.push(x);
  for (const x of [C.xBankTop - EPS, C.xBankTop, C.xEast + 2, C.xEast + 2 + EPS]) xs.push(x);
  xs.sort((a, b) => a - b);
  const zs = [];
  for (let z = -320; z <= 180 + 1e-6; z += 4) zs.push(z);
  for (const z of [C.zMin - EPS, C.zMin, C.zMax, C.zMax + EPS, 8, -6]) zs.push(z);
  zs.sort((a, b) => a - b);
  const inCanal = (x, z) => x >= C.xBankTop - 1e-9 && x <= C.xEast + 2 + 1e-9 && z >= C.zMin - 1e-9 && z <= C.zMax + 1e-9;
  const hFn = (x, z) => (inCanal(x, z) ? MAP.groundY(C.xBankTop, z) - 3.0 : MAP.groundY(x, z));
  const ground = new THREE.Mesh(heightGrid(xs, zs, hFn), M.sand);
  ground.name = 'ground';
  tag(ground, { inkId: ID.TERRAIN, layer: LAYER.BG });
  group.add(ground);

  // ---------------------------------------------------------------- fields (z < -6)
  const rng = MAP.mulberry32(1101);
  const fieldG = [], shadeG = [], wheatG = [], hedgeG = [];
  let z = -6;
  let k = 0;
  while (z > -320) {
    const d = 10 + rng() * 22;
    const z1 = Math.max(-320, z - d);
    const zc = (z + z1) / 2, dz = z - z1;
    const pick = rng();
    const list = pick < 0.42 ? fieldG : pick < 0.72 ? shadeG : wheatG;
    // left and right of the road (road x in [-4.5, 4.5])
    list.push(box(255.5 - 4.5, 0.14, dz, -(4.5 + (255.5 - 4.5) / 2), 0.07, zc));
    list.push(box(255.5 - 4.5, 0.14, dz, 4.5 + (255.5 - 4.5) / 2, 0.07, zc));
    // hedge rows along some boundaries, broken into segments with gaps
    if (k % 2 === 1) {
      for (const side of [-1, 1]) {
        let x = side * 6;
        while (Math.abs(x) < 250) {
          const len = 12 + rng() * 26;
          const gap = rng() < 0.3 ? 6 + rng() * 8 : 0;
          const xa = x, xb = side * Math.min(250, Math.abs(x) + len);
          hedgeG.push(box(Math.abs(xb - xa), 1.0 + rng() * 0.6, 1.4, (xa + xb) / 2, 0.6, z1 + 0.7));
          x = xb + side * gap;
        }
      }
    }
    // a few lone trees / bushes in the fields
    if (rng() < 0.5) {
      const tx = (rng() - 0.5) * 400, tz = zc + (rng() - 0.5) * dz * 0.6;
      if (Math.abs(tx) > 8) hedgeG.push(new THREE.SphereGeometry(2.2 + rng() * 1.6, 8, 6).translate(tx, 3.2, tz), box(0.6, 2.4, 0.6, tx, 1.2, tz));
    }
    z = z1; k++;
  }
  // cross hedges parallel to the road at a few x positions
  for (const hx of [-62, -118, 58, 124, -180, 176]) hedgeG.push(box(1.4, 1.2, 240, hx, 0.6, -150));
  const addField = (list, mat, name) => {
    const g = merge(list); if (!g) return;
    const m = new THREE.Mesh(g, mat); m.name = name; tag(m, { inkId: ID.FIELD, layer: LAYER.BG }); group.add(m);
  };
  addField(fieldG, M.field, 'fieldGreen');
  addField(shadeG, M.fieldShade, 'fieldDark');
  addField(wheatG, M.wheat, 'fieldWheat');
  const hedges = new THREE.Mesh(merge(hedgeG), M.hedge); hedges.name = 'hedges'; tag(hedges, { inkId: ID.PLANT, layer: LAYER.BG }); group.add(hedges);
  // dirt road from the gate to the horizon, with a faint camber
  const road = new THREE.Mesh(merge([box(9, 0.2, 314, 0, 0.1, -6 - 157), box(5, 0.08, 314, 0, 0.24, -6 - 157)]), M.road);
  road.name = 'road'; tag(road, { inkId: ID.TERRAIN, layer: LAYER.BG }); group.add(road);

  // ---------------------------------------------------------------- distant plain beyond the field grid
  const plain = new THREE.Mesh(merge([
    box(3200, 0.1, 1200, 0, -0.06, -320 - 600),
    box(1400, 0.1, 500, -260 - 700, -0.06, -70),
    box(1400, 0.1, 500, 260 + 700, -0.06, -70),
  ]), M.plain);
  plain.name = 'plain'; tag(plain, { inkId: ID.FIELD, layer: LAYER.BG, castShadow: false }); group.add(plain);

  // ---------------------------------------------------------------- mountains: ring from west to east through the north
  const mrng = MAP.mulberry32(2202);
  const nearG = [], farG = [];
  const ring = (list, rMin, rMax, hMin, hMax, count) => {
    for (let i = 0; i < count; i++) {
      const a = Math.PI * (-0.08 + 1.16 * (i / (count - 1))) + (mrng() - 0.5) * 0.04;   // angle around (0,0): 0 = +x (east), pi = -x (west); -z is north at a = pi/2
      const r = rMin + mrng() * (rMax - rMin);
      const x = Math.cos(a) * r, z = -Math.sin(a) * r;
      const h = hMin + mrng() * (hMax - hMin);
      const w = h * (1.4 + mrng() * 1.6);
      const seg = 4 + Math.floor(mrng() * 3);
      const g = cone(w, h, seg, x, -2, z); g.rotateY(0);
      // tilt a little and squash for a jagged painted outline
      const rot = new THREE.Matrix4().makeRotationY(mrng() * Math.PI);
      g.translate(-x, 0, -z); g.applyMatrix4(rot); g.scale(1, 1, 0.55 + mrng() * 0.5); g.translate(x, 0, z);
      list.push(g);
      if (mrng() < 0.5) list.push(cone(w * 0.55, h * 0.75, 4 + Math.floor(mrng() * 2), x + (mrng() - 0.5) * w, -2, z + (mrng() - 0.5) * w * 0.4));
    }
  };
  ring(nearG, 900, 1080, 55, 115, 46);
  ring(farG, 1180, 1400, 90, 175, 40);
  const near = new THREE.Mesh(merge(nearG), M.mountain); near.name = 'mountainsNear'; tag(near, { inkId: ID.MOUNTAIN, layer: LAYER.BG, castShadow: false, receiveShadow: false }); group.add(near);
  const far = new THREE.Mesh(merge(farG), M.mountainFar); far.name = 'mountainsFar'; tag(far, { inkId: ID.MOUNTAIN, layer: LAYER.BG, castShadow: false, receiveShadow: false }); group.add(far);

  return { group, ground };
}
