// Canal: stone channel with three exact steps on the west bank, water, east bank wall, footbridge, bollards.
import * as THREE from 'three';
import { box, boxRot, cyl, sphere, merge, slab, decalPoly, decalRect } from './common.js';
import { tuft } from './flora.js';

export function buildCanal(ctx, M, detail) {
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
    const m = new THREE.Mesh(g, i % 2 ? M.canalStone : M.canalSand);
    m.name = 'canalStep' + i;
    tag(m, { inkId: ID.CANAL, layer: LAYER.BG });
    group.add(m); colliders.push(m);
  }
  // west bank kerb (a low stone edge at the top of the steps, slightly proud of the ground)
  const kerb = new THREE.Mesh(slab(C.xBankTop - 1.2, C.xBankTop, C.zMin, C.zMax, (x, z) => bankY(z) + 0.12, (x, z) => bankY(z) - 0.6, 2), M.canalStone);
  kerb.name = 'canalKerbWest'; tag(kerb, { inkId: ID.CANAL, layer: LAYER.BG }); group.add(kerb); colliders.push(kerb);

  // water surface
  const water = new THREE.Mesh(slab(C.xWater, C.xEast, C.zMin, C.zMax, (x, z) => bankY(z) - C.waterDrop, (x, z) => bankY(z) - C.waterDrop - 0.3, 2), M.water);
  water.name = 'canalWater'; tag(water, { inkId: ID.WATER, layer: LAYER.BG, castShadow: false }); group.add(water);

  // east bank wall: x in [40, 42], with a parapet top above ground
  const east = new THREE.Mesh(slab(C.xEast, C.xEast + 2, C.zMin, C.zMax, (x, z) => bankY(z) + 0.9, bed, 2), M.canalSand);
  east.name = 'canalWallEast'; tag(east, { inkId: ID.CANAL, layer: LAYER.BG }); group.add(east); colliders.push(east);
  // coping stones on the east wall (ink from id edges against the wall body)
  const copG = [];
  for (let z = C.zMin + 1; z < C.zMax - 1; z += 3) copG.push(box(2.3, 0.3, 2.6, C.xEast + 1, bankY(z + 1.3) + 1.05, z + 1.3));
  const coping = new THREE.Mesh(merge(copG), M.canalStone); coping.name = 'canalCoping'; tag(coping, { inkId: ID.WALL, layer: LAYER.BG }); group.add(coping);

  // end walls (north and south ends of the channel)
  const ends = new THREE.Mesh(merge([
    slab(C.xBankTop, C.xEast + 2, C.zMin - 1.2, C.zMin, (x, z) => bankY(C.zMin) + 0.3, bed, 2),
    slab(C.xBankTop, C.xEast + 2, C.zMax, C.zMax + 1.2, (x, z) => bankY(C.zMax) + 0.3, bed, 2),
  ]), M.canalSand);
  ends.name = 'canalEnds'; tag(ends, { inkId: ID.CANAL, layer: LAYER.BG }); group.add(ends); colliders.push(ends);

  // bollards along the west bank
  const bolG = [];
  for (let z = C.zMin + 4; z < C.zMax; z += 10) {
    if (z > 36 && z < 56) continue;   // keep the kids' stretch of bank clear for the close-ups
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

  // ---------------------------------------------------------------- step dressing (never raises the step tops)
  // Joint lines are flat strips 3 mm above the tops and 3 mm off the risers with their own ink id, so the
  // ink pass draws them as grooves. Wet band, algae and moss patches are flat painted decals (id 0).
  const jointG = [], wornG = [], wetG = [], algaeG = [], mossFlatG = [], mossG = [];
  const UP = [0, 1, 0], EASTN = [1, 0, 0], WESTN = [-1, 0, 0];
  const drng = MAP.mulberry32(3131);
  const waterY = (z) => bankY(z) - C.waterDrop;
  for (let i = 0; i < C.steps; i++) {
    const x0 = C.xBankTop + i * C.stepDepth, x1 = x0 + C.stepDepth;
    const off0 = (i % 2) * 0.6;
    for (let z = C.zMin + 0.6 + off0; z < C.zMax - 0.3; z += 1.2) {
      const zj = z + (drng() - 0.5) * 0.08;
      // top joint, running across the step (along x); the strip follows the slope of the top
      jointG.push(decalPoly([[x0 + 0.03, zj - 0.018], [x1 - 0.03, zj - 0.018], [x1 - 0.03, zj + 0.018], [x0 + 0.03, zj + 0.018]], [0, MAP.stepTopY(i, zj), 0], [1, 0, 0], [0, 0, 1], UP, 0.003));
      // riser joint on the east face of the step, from the top down to the next step (or to the water)
      const yTop = MAP.stepTopY(i, zj), yBot = i < C.steps - 1 ? MAP.stepTopY(i + 1, zj) : waterY(zj);
      jointG.push(decalRect(zj - 0.018, zj + 0.018, yBot + 0.01, yTop - 0.01, [x1, 0, 0], [0, 0, 1], [0, 1, 0], EASTN, 0.003));
    }
  }
  // kerb at the top of the steps: joints on its tread and on its face down to the first step
  for (let z = C.zMin + 0.3; z < C.zMax - 0.3; z += 1.2) {
    const zj = z + (drng() - 0.5) * 0.08, yk = bankY(zj) + 0.12;
    jointG.push(decalPoly([[C.xBankTop - 1.17, zj - 0.018], [C.xBankTop - 0.03, zj - 0.018], [C.xBankTop - 0.03, zj + 0.018], [C.xBankTop - 1.17, zj + 0.018]], [0, yk, 0], [1, 0, 0], [0, 0, 1], UP, 0.003));
    jointG.push(decalRect(zj - 0.018, zj + 0.018, MAP.stepTopY(0, zj) + 0.01, yk - 0.01, [C.xBankTop, 0, 0], [0, 0, 1], [0, 1, 0], EASTN, 0.003));
  }
  // a lighter worn nosing along the front edge of each tread (flat, 2 mm, following the sloping top)
  for (let i = 0; i < C.steps; i++) {
    const x1 = C.xBankTop + (i + 1) * C.stepDepth;
    for (let z = C.zMin; z < C.zMax - 1e-6; z += 2) {
      const zb = Math.min(C.zMax, z + 2), ya = MAP.stepTopY(i, z) + 0.002, yb = MAP.stepTopY(i, zb) + 0.002;
      const w = 0.14 + drng() * 0.08;
      const pos = [x1 - w, ya, z, x1 - 0.015, ya, z, x1 - 0.015, yb, zb, x1 - w, ya, z, x1 - 0.015, yb, zb, x1 - w, yb, zb];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      if (g.attributes.normal.getY(0) < 0) { const p = g.attributes.position; for (let k = 0; k < 6; k += 3) { const t = [p.getX(k + 1), p.getY(k + 1), p.getZ(k + 1)]; p.setXYZ(k + 1, p.getX(k + 2), p.getY(k + 2), p.getZ(k + 2)); p.setXYZ(k + 2, t[0], t[1], t[2]); } g.computeVertexNormals(); }
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
      wornG.push(g);
    }
  }
  // wet band at the water line on the lowest riser and on the east wall, with a thin algae line
  for (let z = C.zMin; z < C.zMax - 1e-6; z += 1) {
    const zb = Math.min(C.zMax, z + 1);
    const wy = waterY(z), wyb = waterY(zb);
    const hA = 0.28 + drng() * 0.14, hB = 0.28 + drng() * 0.14;
    const yCap = MAP.stepTopY(C.steps - 1, z) - 0.04;
    for (const [xFace, N, sgn] of [[C.xWater, EASTN, 1], [C.xEast, WESTN, -1]]) {
      const top = (y, h) => Math.min(sgn > 0 ? yCap : 99, y + h);
      wetG.push(decalPoly([[z, wy - 0.05], [zb, wyb - 0.05], [zb, top(wyb, hB)], [z, top(wy, hA)]], [xFace, 0, 0], [0, 0, 1], [0, 1, 0], N, 0.004));
      algaeG.push(decalPoly([[z, wy - 0.02], [zb, wyb - 0.02], [zb, wyb + 0.07 + drng() * 0.04], [z, wy + 0.07]], [xFace, 0, 0], [0, 0, 1], [0, 1, 0], N, 0.006));
    }
  }
  // moss: flat patches in the inner corners of the treads, and small tufts on the lowest riser above the water
  for (let k = 0; k < 140; k++) {
    const i = 1 + Math.floor(drng() * (C.steps - 1));          // treads of steps 1 and 2, against the riser above
    const xr = C.xBankTop + i * C.stepDepth;
    const z = C.zMin + 1 + drng() * (C.zMax - C.zMin - 2);
    const L = 0.3 + drng() * 0.8, W = 0.1 + drng() * 0.18;
    const y = MAP.stepTopY(i, z);
    mossFlatG.push(decalPoly([[xr + 0.005, z - L / 2], [xr + W * 0.7, z - L * 0.35], [xr + W, z], [xr + W * 0.6, z + L * 0.4], [xr + 0.005, z + L / 2]], [0, y, 0], [1, 0, 0], [0, 0, 1], UP, 0.004));
  }
  for (let k = 0; k < 70; k++) {
    const z = C.zMin + 1 + drng() * (C.zMax - C.zMin - 2);
    const yTopRiser = MAP.stepTopY(C.steps - 1, z) - 0.08, yW = waterY(z) + 0.04;
    const y = yW + drng() * Math.max(0, (yTopRiser - yW) * 0.35);
    // tuft hangs on the riser face: wholly below the tread of step 2 and east of x = 32
    const g = []; tuft(g, 0, 0, 0, 0.16 + drng() * 0.08, drng);
    for (const t of g) { t.rotateZ(-Math.PI / 2 * 0.8); t.translate(C.xWater + 0.05, y, z); mossG.push(t); }
    if (drng() < 0.5) { const g2 = []; tuft(g2, 0, 0, 0, 0.18, drng); for (const t of g2) { t.rotateZ(Math.PI / 2 * 0.8); t.translate(C.xEast - 0.05, waterY(z) + 0.06 + drng() * 0.2, z + 0.7); mossG.push(t); } }
  }
  const addD = (list, mat, name, inkId, shadow = false) => { const g = merge(list); if (!g) return null; const m = new THREE.Mesh(g, mat); m.name = name; tag(m, { inkId, layer: LAYER.BG, castShadow: shadow }); group.add(m); return m; };
  addD(jointG, M.jointDark, 'stepJoints', 249);
  addD(wornG, M.wornEdge, 'stepWornEdges', ID.NONE);
  addD(wetG, M.wet, 'canalWetBand', ID.NONE);
  addD(algaeG, M.algae, 'canalAlgae', ID.NONE);
  addD(mossFlatG, M.moss, 'stepMoss', ID.NONE);
  addD(mossG, M.moss, 'canalMossTufts', ID.PLANT);

  // ---------------------------------------------------------------- painted ripple highlights on the water
  // Flat lighter wavy shapes 1 cm above the surface, animated on 2s: each one drifts and breathes.
  const rip = new THREE.Shape();
  rip.moveTo(-0.5, 0); rip.quadraticCurveTo(-0.25, 0.09, 0, 0.02); rip.quadraticCurveTo(0.25, -0.05, 0.5, 0.03);
  rip.quadraticCurveTo(0.25, 0.0, 0, 0.065); rip.quadraticCurveTo(-0.25, 0.14, -0.5, 0);
  const ripG = new THREE.ShapeGeometry(rip, 6);
  ripG.rotateX(-Math.PI / 2);                                   // lie flat, facing up
  ripG.rotateY(Math.PI / 2);                                    // long axis along z (the canal)
  const nR = 170;
  const ripples = new THREE.InstancedMesh(ripG, M.ripple, nR);
  ripples.name = 'canalRipples'; ripples.frustumCulled = false;
  tag(ripples, { inkId: ID.WATER, layer: LAYER.BG, castShadow: false });
  const rdata = [];
  for (let k = 0; k < nR; k++) {
    // denser where the kids sit (shots 3, 4, 9, 13, 26, 30, 31)
    const z = k < 90 ? 30 + drng() * 34 : C.zMin + 2 + drng() * (C.zMax - C.zMin - 4);
    rdata.push({ x: C.xWater + 0.4 + drng() * (C.xEast - C.xWater - 0.8), z, len: 1.0 + drng() * 1.8, wid: 3.0 + drng() * 2.5, ph: drng() * 6.283, sp: 0.6 + drng() * 0.8, flip: drng() < 0.5 ? -1 : 1 });
  }
  group.add(ripples);
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _yAx = new THREE.Vector3(0, 1, 0);
  function update(frame) {
    const t = MAP.hold(frame, 2) / 24;
    for (let k = 0; k < nR; k++) {
      const r = rdata[k];
      const z = r.z + Math.sin(t * 0.7 * r.sp + r.ph) * 0.35;
      _p.set(r.x + Math.sin(t * 1.1 * r.sp + r.ph * 2) * 0.12, waterY(z) + 0.01, z);
      _q.setFromAxisAngle(_yAx, Math.sin(t * 0.9 + r.ph) * 0.12 + (r.flip < 0 ? Math.PI : 0));
      _s.set(r.wid * (0.8 + 0.25 * Math.sin(t * 2.3 * r.sp + r.ph)), 1, r.len * (0.75 + 0.3 * Math.sin(t * 1.9 * r.sp + r.ph * 3)));
      ripples.setMatrixAt(k, _m4.compose(_p, _q, _s));
    }
    ripples.instanceMatrix.needsUpdate = true;
  }
  update(0);

  return { group, colliders, update };
}
