// Canal: stone channel with three exact steps on the west bank, water, east bank wall, footbridge, bollards.
import * as THREE from 'three';
import { box, boxRot, cyl, sphere, merge, slab } from './common.js';

export function buildCanal(ctx, M) {
  const { MAP, ID, LAYER, tag } = ctx;
  const C = MAP.CANAL;
  const group = new THREE.Group(); group.name = 'canal';
  const colliders = [];
  const bankY = (z) => MAP.groundY(C.xBankTop, z);
  const bed = (x, z) => bankY(z) - 3.0;

  // steps: top surface exactly MAP.stepTopY(i, z), x in [26 + 2i, 28 + 2i]
  for (let i = 0; i < C.steps; i++) {
    const x0 = C.xBankTop + i * C.stepDepth, x1 = x0 + C.stepDepth;
    const g = slab(x0, x1, C.zMin, C.zMax, (x, z) => MAP.stepTopY(i, z), bed, 1);
    const m = new THREE.Mesh(g, i % 2 ? M.stone : M.sandstone);
    m.name = 'canalStep' + i;
    tag(m, { inkId: ID.CANAL, layer: LAYER.BG });
    group.add(m); colliders.push(m);
  }
  // west bank kerb (a low stone edge at the top of the steps, slightly proud of the ground)
  const kerb = new THREE.Mesh(slab(C.xBankTop - 1.2, C.xBankTop, C.zMin, C.zMax, (x, z) => bankY(z) + 0.12, (x, z) => bankY(z) - 0.6, 2), M.stone);
  kerb.name = 'canalKerbWest'; tag(kerb, { inkId: ID.CANAL, layer: LAYER.BG }); group.add(kerb); colliders.push(kerb);

  // water surface
  const water = new THREE.Mesh(slab(C.xWater, C.xEast, C.zMin, C.zMax, (x, z) => bankY(z) - C.waterDrop, (x, z) => bankY(z) - C.waterDrop - 0.3, 2), M.water);
  water.name = 'canalWater'; tag(water, { inkId: ID.WATER, layer: LAYER.BG, castShadow: false }); group.add(water);

  // east bank wall: x in [40, 42], with a parapet top above ground
  const east = new THREE.Mesh(slab(C.xEast, C.xEast + 2, C.zMin, C.zMax, (x, z) => bankY(z) + 0.9, bed, 2), M.sandstone);
  east.name = 'canalWallEast'; tag(east, { inkId: ID.CANAL, layer: LAYER.BG }); group.add(east); colliders.push(east);
  // coping stones on the east wall (ink from id edges against the wall body)
  const copG = [];
  for (let z = C.zMin + 1; z < C.zMax - 1; z += 3) copG.push(box(2.3, 0.3, 2.6, C.xEast + 1, bankY(z + 1.3) + 1.05, z + 1.3));
  const coping = new THREE.Mesh(merge(copG), M.stone); coping.name = 'canalCoping'; tag(coping, { inkId: ID.WALL, layer: LAYER.BG }); group.add(coping);

  // end walls (north and south ends of the channel)
  const ends = new THREE.Mesh(merge([
    slab(C.xBankTop, C.xEast + 2, C.zMin - 1.2, C.zMin, (x, z) => bankY(C.zMin) + 0.3, bed, 2),
    slab(C.xBankTop, C.xEast + 2, C.zMax, C.zMax + 1.2, (x, z) => bankY(C.zMax) + 0.3, bed, 2),
  ]), M.sandstone);
  ends.name = 'canalEnds'; tag(ends, { inkId: ID.CANAL, layer: LAYER.BG }); group.add(ends); colliders.push(ends);

  // bollards along the west bank
  const bolG = [];
  for (let z = C.zMin + 4; z < C.zMax; z += 10) {
    const y = bankY(z);
    bolG.push(cyl(0.22, 0.28, 0.9, 8, C.xBankTop - 1.9, y, z), sphere(0.3, C.xBankTop - 1.9, y + 1.0, z, 8, 6));
  }
  const bollards = new THREE.Mesh(merge(bolG), M.bronzeDark); bollards.name = 'bollards'; tag(bollards, { inkId: ID.WALL, layer: LAYER.BG }); group.add(bollards);

  // arched footbridge at z = 70 from the west bank (x = 24) to the east bank (x = 43)
  const bz = 70, xa = 24.4, xb = 43.6, span = xb - xa, mid = (xa + xb) / 2;
  const base = bankY(bz) + 0.6;
  const deckG = [], railG = [];
  const nSeg = 12;
  for (let i = 0; i < nSeg; i++) {
    const t0 = i / nSeg, t1 = (i + 1) / nSeg;
    const x0 = xa + t0 * span, x1 = xa + t1 * span;
    const y0 = base + Math.sin(t0 * Math.PI) * 2.2, y1 = base + Math.sin(t1 * Math.PI) * 2.2;
    const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
    deckG.push(boxRot(len + 0.05, 0.5, 3.2, (x0 + x1) / 2, (y0 + y1) / 2, bz, 0, 0, ang));
    // low parapets either side
    railG.push(boxRot(len + 0.05, 0.9, 0.3, (x0 + x1) / 2, (y0 + y1) / 2 + 0.6, bz - 1.45, 0, 0, ang));
    railG.push(boxRot(len + 0.05, 0.9, 0.3, (x0 + x1) / 2, (y0 + y1) / 2 + 0.6, bz + 1.45, 0, 0, ang));
  }
  // abutments
  deckG.push(slab(xa - 1.6, xa + 0.4, bz - 1.8, bz + 1.8, () => base + 0.25, bed, 2));
  deckG.push(slab(xb - 0.4, xb + 1.0, bz - 1.8, bz + 1.8, () => base + 0.25, bed, 2));
  const bridge = new THREE.Mesh(merge(deckG), M.sandstone); bridge.name = 'footbridge'; tag(bridge, { inkId: ID.CANAL, layer: LAYER.BG }); group.add(bridge); colliders.push(bridge);
  const rails = new THREE.Mesh(merge(railG), M.stone); rails.name = 'footbridgeRails'; tag(rails, { inkId: ID.WALL, layer: LAYER.BG }); group.add(rails);

  return { group, colliders };
}
