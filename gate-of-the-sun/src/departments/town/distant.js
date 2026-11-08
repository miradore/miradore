// Distant country beyond the fields: low hills with far white villages, cypresses and a windmill,
// seen over the wall in the establishing shot and through the breach later.
import * as THREE from 'three';
import { box, cyl, cone, sphere, merge } from './common.js';
import { cypress } from './flora.js';

export function buildDistant(ctx, M) {
  const { MAP, ID, LAYER, tag, makeCel } = ctx;
  const group = new THREE.Group(); group.name = 'distant';
  const rng = MAP.mulberry32(8080);
  const hillG = [[], []], whiteG = [], domeG = [], roofG = [], trunkG = [], crownG = [];

  // hills: half ellipsoids sunk into the plain
  const hills = [];
  const spots = [[-420, -560], [-250, -600], [-90, -660], [60, -560], [210, -640], [380, -580], [-600, -700], [560, -720], [-330, -760], [140, -800], [-20, -520], [300, -760], [-160, -520], [470, -520]];
  spots.forEach(([x, z], k) => {
    const rx = 90 + rng() * 90, rz = 50 + rng() * 50, hy = 18 + rng() * 34;
    const g = new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(rx, hy, rz); g.translate(x, -1.5, z);
    hillG[k % 2].push(g);
    hills.push({ x, z, rx, rz, hy });
  });
  const hillY = (h, x, z) => { const q = 1 - ((x - h.x) / h.rx) ** 2 - ((z - h.z) / h.rz) ** 2; return q > 0 ? h.hy * Math.sqrt(q) - 1.5 : -1.5; };

  // villages: tight clusters of white cubes with a dome or a bell tower, on the shoulders of some hills
  for (const k of [0, 1, 2, 3, 5, 8, 12]) {
    const h = hills[k];
    const n = 14 + Math.floor(rng() * 14);
    const cx = h.x + (rng() - 0.5) * h.rx * 0.4, cz = h.z + h.rz * (0.1 + rng() * 0.35);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 34;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.6;
      const y = hillY(h, x, z);
      if (y < 0) continue;
      const w = 5 + rng() * 5, d = 5 + rng() * 5, hh = 4 + rng() * 5;
      whiteG.push(box(w, hh + 3, d, x, y + (hh + 3) / 2 - 3, z));
      if (rng() < 0.25) roofG.push(box(w * 0.5, 2.4, d * 0.5, x + w * 0.2, y + hh + 1.2, z));
      if (rng() < 0.08) domeG.push(sphere(Math.min(w, d) * 0.35, x, y + hh, z, 10, 5, true));
    }
    const ty = hillY(h, cx, cz);
    whiteG.push(box(4, 16, 4, cx, ty + 6, cz));
    domeG.push(sphere(2.2, cx, ty + 14, cz, 10, 5, true));
    // cypresses around the village
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2, r = 30 + rng() * 25;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.6;
      cypress(trunkG, crownG, x, hillY(h, x, z), z, 12 + rng() * 8, rng);
    }
  }
  // cypress rows along field edges and the hill feet (kept well off the automatons' path)
  for (let i = 0; i < 46; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (70 + rng() * 380), z = -120 - rng() * 520;
    let y = 0; for (const h of hills) y = Math.max(y, hillY(h, x, z));
    cypress(trunkG, crownG, x, y, z, 9 + rng() * 9, rng);
  }

  // the windmill on the hill west of the road
  const wh = hills[1];
  const wx = wh.x + 20, wz = wh.z - 5, wy = hillY(wh, wx, wz) - 0.5;
  whiteG.push(cyl(3.2, 4.2, 13, 14, wx, wy, wz));
  roofG.push(cone(3.8, 4.5, 14, wx, wy + 13, wz));
  const sails = new THREE.Group(); sails.name = 'windmillSails';
  sails.position.set(wx, wy + 11.5, wz + 4.4);
  const sailG = [cyl(0.5, 0.5, 1.2, 8, 0, -0.6, 0).rotateX(Math.PI / 2)];
  for (let k = 0; k < 4; k++) {
    const arm = box(0.35, 10, 0.25, 0, 5.4, 0); arm.rotateZ(k * Math.PI / 2); sailG.push(arm);
    const cloth = box(1.8, 7.5, 0.08, 1.05, 6.2, 0.15); cloth.rotateZ(k * Math.PI / 2); sailG.push(cloth);
  }
  const sailM = new THREE.Mesh(merge(sailG), M.wood); sailM.name = 'windmillSailBlades';
  tag(sailM, { inkId: ID.BG_MIN + 33, layer: LAYER.BG }); sails.add(sailM); group.add(sails);

  const add = (list, mat, name, inkId) => { const g = merge(list); if (!g) return; const m = new THREE.Mesh(g, mat); m.name = name; tag(m, { inkId, layer: LAYER.BG, castShadow: false }); group.add(m); };
  add(hillG[0], M.hill, 'hillsGreen', ID.FIELD);
  add(hillG[1], M.hillOchre, 'hillsOchre', ID.MOUNTAIN);
  const villageWhite = makeCel({ color: 0xF6F0E4, shade: 0xB4A6CC, paint: 'soft', paintScale: 20, paintSeed: 1 });
  add(whiteG, villageWhite, 'farVillages', ID.BG_MIN + 31);
  add(roofG, M.pot, 'farRoofs', ID.BG_MIN + 32);
  add(domeG, M.dome, 'farDomes', ID.BG_MIN + 36);
  add(trunkG, M.wood, 'cypressTrunks', ID.PLANT);
  add(crownG, M.cypress, 'cypresses', ID.PLANT);

  function update(frame) {
    sails.rotation.z = -MAP.hold(frame, 2) * 0.012;
  }
  return { group, update };
}
