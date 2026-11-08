// The great wall: body, crenellations, course grooves, buttresses, round towers, and the crack zone
// around the hand impact whose top is built from separate blocks (five drop at T.HAND_IMPACT).
import * as THREE from 'three';
import { box, cyl, cone, sphere, merge, decalPoly } from './common.js';
import { tuft } from './flora.js';
import { G, landTime } from './physics.js';

export function buildWall(ctx, M, detail) {
  const { MAP, ID, LAYER, tag } = ctx;
  const W = MAP.WALL, Gt = MAP.GATE;
  const group = new THREE.Group(); group.name = 'wall';
  const colliders = [], popAllowed = [];
  const h = W.height, hz = W.thickness / 2;           // z in [-6, 6]
  const half = W.length / 2;
  const crack = { x0: 20, x1: 40, yTop: h - 2.5 };    // separate blocks above yTop in this x range
  const g = [];

  // body: pieces left of the gate, between the gate and the crack zone, under the crack zone, right of it
  const gx = Gt.width / 2;                             // 10
  g.push(box(half - gx, h, W.thickness - 0.6, -(gx + (half - gx) / 2), h / 2, -0.3));
  g.push(box(crack.x0 - gx, h, W.thickness - 0.6, gx + (crack.x0 - gx) / 2, h / 2, -0.3));
  g.push(box(crack.x1 - crack.x0, crack.yTop, W.thickness - 0.6, (crack.x0 + crack.x1) / 2, crack.yTop / 2, -0.3));
  g.push(box(half - crack.x1, h, W.thickness - 0.6, crack.x1 + (half - crack.x1) / 2, h / 2, -0.3));
  // town face built as courses: 2.5 m tall rows with 0.4 m deep grooves between them, each row cut into
  // blocks of 3 to 4 m staggered per course. Neighbouring blocks alternate ink ids so every joint is drawn;
  // a few blocks are repairs in a different, greyer stone.
  const courseH = 2.5;
  const crng = MAP.mulberry32(7300);
  const blkG = [[], []], repairG = [];
  let ci = 0;
  for (let y = 0; y < h - 0.01; y += courseH, ci++) {
    const sh = courseH - 0.4;
    const yc = y + sh / 2 + 0.05;
    const pushCourse = (x0, x1) => {
      if (x1 <= x0) return;
      let x = x0 - (ci % 2 ? 1.7 : 0) - crng() * 0.8;
      let k = ci % 2;
      while (x < x1) {
        const L = 3 + crng() * 1.0;
        const a = Math.max(x0, x), b = Math.min(x1, x + L - 0.09);
        if (b - a > 0.2) {
          const g = box(b - a, sh, 0.6, (a + b) / 2, yc, hz - 0.3);
          if (crng() < 0.045) repairG.push(g); else blkG[k % 2].push(g);
        }
        x += L; k++;
      }
    };
    pushCourse(-half, -gx);
    if (y + courseH <= crack.yTop + 0.01) pushCourse(gx, half); else { pushCourse(gx, crack.x0); pushCourse(crack.x1, half); }
  }
  // outer face course (plainer, the fields side)
  g.push(box(half - gx, h, 0.25, -(gx + (half - gx) / 2), h / 2, -hz + 0.125));
  g.push(box(half - gx, h, 0.25, gx + (half - gx) / 2, h / 2, -hz + 0.125));
  // crenellations: merlons 2.5 wide, 3 tall, gaps 1.5 (period 4) on both faces; walkway parapet lip
  for (let x = -half + 0.75; x < half - 2.5; x += 4) {
    const xc = x + 1.25;
    if (xc > -gx - 1.5 && xc < gx + 1.5) { /* gate: merlons still run across the top */ }
    const inCrack = xc > crack.x0 && xc < crack.x1;
    if (inCrack) continue;
    g.push(box(2.5, 3, 1.5, xc, h + 1.5, hz - 0.75));
    g.push(box(2.5, 3, 1.5, xc, h + 1.5, -hz + 0.75));
  }
  g.push(box(W.length, 0.3, W.thickness - 3, 0, h + 0.15, 0));   // walkway paving, slightly raised
  // buttresses on the town face every 30 m (offset so none sits under the hand or at a tower)
  for (const bx of [-225, -165, -105, -45, -15, 15, 45, 105, 165, 225]) {
    g.push(box(4, 38, 3, bx, 19, hz + 1.5));
    g.push(box(4, 4, 1.5, bx, 40, hz + 0.75));
    g.push(box(5, 1.2, 4, bx, 38.6, hz + 2));
  }
  // plinth along the town face
  // plinth along the town face, interrupted at the gate opening
  { const gx = MAP.GATE.width / 2 + 0.6; g.push(box(half - gx, 1.6, 1.0, -(gx + (half - gx) / 2), 0.8, hz + 0.5)); g.push(box(half - gx, 1.6, 1.0, gx + (half - gx) / 2, 0.8, hz + 0.5)); }
  const wall = new THREE.Mesh(merge(g), M.sandstone); wall.name = 'wall';
  tag(wall, { inkId: ID.WALL, layer: LAYER.BG }); group.add(wall); colliders.push(wall);
  const courseMeshes = [[blkG[0], M.sandstone, 'wallCoursesA', ID.WALL], [blkG[1], M.sandstoneAlt, 'wallCoursesB', 247], [repairG, M.sandstoneRepair, 'wallRepairs', 248]];
  for (const [list, mat, name, inkId] of courseMeshes) {
    const m = new THREE.Mesh(merge(list), mat); m.name = name; tag(m, { inkId, layer: LAYER.BG }); group.add(m); colliders.push(m);
  }

  // ---------------------------------------------------------------- weathering on the town face (painted, id 0)
  const streakG = [], streakDarkG = [], tuftG = [];
  const wr = MAP.mulberry32(7400);
  const FACE = [0, 0, hz], U = [1, 0, 0], V = [0, 1, 0], N = [0, 0, 1];
  const buttressNear = (x) => [-225, -165, -105, -45, -15, 15, 45, 105, 165, 225].some((b) => Math.abs(x - b) < 3.2);
  // streaks run down from under the merlons, clipped to the course faces so they never float over a groove
  for (let x = -half + 3; x < half - 3; x += 2.2 + wr() * 3.4) {
    if (Math.abs(x) < gx + 2 || (x > crack.x0 - 2 && x < crack.x1 + 2) || buttressNear(x)) continue;
    const w = 0.5 + wr() * 1.1, L = 3 + wr() * (wr() < 0.3 ? 14 : 6);
    const yTop = h - 0.35, dark = wr() < 0.35;
    for (let c = 19; c >= 0; c--) {
      const y0 = c * courseH + 0.05, y1 = y0 + courseH - 0.4;
      if (y1 < yTop - L) break;
      const a = Math.max(y0, yTop - L), b = Math.min(y1, yTop);
      if (b - a < 0.05) continue;
      const wa = w * (0.25 + 0.75 * (1 - (yTop - a) / L)), wb = w * (0.25 + 0.75 * (1 - (yTop - b) / L));
      const j = (wr() - 0.5) * 0.1;
      (dark ? streakDarkG : streakG).push(decalPoly([[x - wa / 2 + j, a], [x + wa / 2 + j, a], [x + wb / 2, b], [x - wb / 2, b]], FACE, U, V, N, 0.012));
    }
  }
  // tufts on the ledges: buttress caps, the plinth and a few course grooves near the shots' cameras
  for (const bx of [-225, -165, -105, -45, -15, 15, 45, 105, 165, 225]) {
    const nT = 1 + Math.floor(wr() * 3);
    for (let k = 0; k < nT; k++) tuft(tuftG, bx + (wr() - 0.5) * 4, 39.2, hz + 0.3 + wr() * 3.4, 0.45 + wr() * 0.3, wr);
  }
  for (let k = 0; k < 70; k++) {
    const x = (wr() < 0.5 ? -1 : 1) * (gx + 1 + wr() * (half - gx - 2));
    if (x > crack.x0 - 1 && x < crack.x1 + 1) continue;
    if (k < 30) tuft(tuftG, x, 1.6, hz + 0.25 + wr() * 0.6, 0.3 + wr() * 0.25, wr);
    else { const c = 1 + Math.floor(wr() * 18); tuft(tuftG, x, c * courseH + 0.05 - 0.4 + 0.0, hz - 0.18, 0.25 + wr() * 0.2, wr); }
  }
  const addW = (list, mat, name, inkId, cast = false) => { const g = merge(list); if (!g) return; const m = new THREE.Mesh(g, mat); m.name = name; tag(m, { inkId, layer: LAYER.BG, castShadow: cast }); group.add(m); };
  addW(streakG, M.wallStreak, 'wallStreaks', ID.NONE);
  addW(streakDarkG, M.stainDark, 'wallStreaksDark', ID.NONE);
  addW(tuftG, M.moss, 'wallTufts', ID.PLANT, true);

  // crack zone: top course blocks and merlons as separate meshes
  const dropSet = new Set([1, 3, 14, 15, 17]);   // chosen clear of the hand (fingers span x 26..34)         // indices of the blocks that fall
  const blocks = [], drops = [];
  let bi = 0;
  for (let x = crack.x0; x < crack.x1 - 0.01; x += 2.5) {
    for (const zc of [-3, 3]) {
      const geo = new THREE.BoxGeometry(2.5, 2.5, 6);
      const p = new THREE.Vector3(x + 1.25, crack.yTop + 1.25, zc);
      blocks.push({ geo, p, w: 2.5, hgt: 2.5, d: 6, idx: bi++ });
    }
  }
  for (let x = crack.x0 + 0.75; x < crack.x1 - 2.5; x += 4) {
    for (const zc of [hz - 0.75, -hz + 0.75]) {
      const geo = new THREE.BoxGeometry(2.5, 3, 1.5);
      blocks.push({ geo, p: new THREE.Vector3(x + 1.25, h + 1.5, zc), w: 2.5, hgt: 3, d: 1.5, idx: bi++ });
    }
  }
  const staticG = [];
  for (const b of blocks) {
    if (!dropSet.has(b.idx)) { b.geo.translate(b.p.x, b.p.y, b.p.z); staticG.push(b.geo); continue; }
    const m = new THREE.Mesh(b.geo, M.sandstone);
    m.name = 'wallBlock' + b.idx; m.position.copy(b.p);
    tag(m, { inkId: ID.WALL, layer: LAYER.BG }); m.userData.debrisId = b.idx % 10;
    group.add(m); popAllowed.push(m); colliders.push(m);
    const r = MAP.mulberry32(7000 + b.idx);
    // toward the town side (+z), slow tumble, long fall
    const v = new THREE.Vector3((r() - 0.5) * 1.2, 0.4 + r() * 1.2, 1.4 + r() * 2.6);
    const restH = Math.min(b.hgt, b.d) / 2;
    const landY = MAP.groundY(b.p.x, 14) + restH;
    const t = landTime(b.p.y, v.y, landY);
    const land = new THREE.Vector3(b.p.x + v.x * t, landY, Math.max(8.5, Math.min(20, b.p.z + v.z * t)));
    const axis = new THREE.Vector3(1, (r() - 0.5) * 0.4, (r() - 0.5) * 0.3).normalize();
    // final orientation: lie on the largest face. For the deep blocks that means the 6 m axis stays along z.
    const finalQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (r() - 0.5) * 0.8);
    if (b.hgt > b.d) finalQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    drops.push({ mesh: m, p0: b.p.clone(), v, t, land, axis, rate: 1.5 + r() * 2.5, finalQ, tStart: MAP.T.HAND_IMPACT + Math.floor(r() * 4) });
  }
  const crackStatic = new THREE.Mesh(merge(staticG), M.sandstone); crackStatic.name = 'wallCrackBlocks';
  tag(crackStatic, { inkId: ID.WALL, layer: LAYER.BG }); group.add(crackStatic); colliders.push(crackStatic);
  // a few extra cracked block edges around the hand so the ink reads a jagged top there
  const jag = [];
  const jr = MAP.mulberry32(7100);
  for (let k = 0; k < 10; k++) jag.push(box(0.9 + jr() * 1.4, 0.4 + jr() * 0.6, 0.9 + jr() * 1.4, crack.x0 + 1 + jr() * 18, h + 0.4 + jr() * 0.3, (jr() - 0.5) * 8));
  const jagM = new THREE.Mesh(merge(jag), M.sandstoneDark); jagM.name = 'wallRubbleTop'; tag(jagM, { inkId: ID.WALL + 0, layer: LAYER.BG }); group.add(jagM);

  // round towers: coursed shafts (alternate rings slightly proud, alternate ink ids), arrow slits framed in
  // darker stone, string course, machicolation ring, merlons and turquoise roofs
  const tg = [], roofG = [], slitG = [], frameG = [], bandG = [];
  const rAt = (y) => W.towerRadius + 0.6 * (1 - y / W.towerHeight);
  const slitAt = (tx, a, y, list, wu, hy, proud, thick) => {
    const g = new THREE.BoxGeometry(wu, hy, thick);
    g.translate(0, 0, rAt(y) + proud - thick / 2);
    g.rotateY(a);
    g.translate(tx, y, 0);
    list.push(g);
  };
  for (const tx of W.towerXs) {
    tg.push(cyl(W.towerRadius, W.towerRadius + 0.6, W.towerHeight, 18, tx, 0, 0));
    for (let y = 2.5; y < W.towerHeight - 3; y += 5) bandG.push(cyl(rAt(y + 2.5) + 0.06, rAt(y) + 0.06, 2.5 - 0.02, 18, tx, y + 0.01, 0));
    tg.push(cyl(W.towerRadius + 0.7, W.towerRadius + 0.7, 0.8, 18, tx, W.towerHeight - 2.2, 0));     // string course
    tg.push(cyl(W.towerRadius + 0.9, W.towerRadius + 0.6, 1.2, 18, tx, W.towerHeight - 0.4, 0));      // machicolation ring
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; tg.push(box(1.6, 1.8, 1.6, tx + Math.cos(a) * (W.towerRadius + 0.3), W.towerHeight + 1.7, Math.sin(a) * (W.towerRadius + 0.3)).rotateY(0)); }
    roofG.push(cone(W.towerRadius + 1.0, 9, 12, tx, W.towerHeight + 2.4, 0));
    roofG.push(sphere(0.6, tx, W.towerHeight + 11.9, 0, 8, 6), cyl(0.12, 0.12, 1.2, 6, tx, W.towerHeight + 11.2, 0));
    // slits face the town (+z) and the fields (-z), clear of the wall body; the angle is measured from +z about y
    for (const y of [16, 28, 40]) for (const a of [0, 0.55, -0.55, Math.PI, Math.PI - 0.55, Math.PI + 0.55]) {
      slitAt(tx, a, y, slitG, 0.32, 2.1, 0.12, 0.3);
      slitAt(tx, a, y + 1.2, frameG, 0.95, 0.3, 0.16, 0.36);      // head stone
      slitAt(tx, a, y - 1.2, frameG, 1.1, 0.3, 0.2, 0.42);        // sill
      for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.3, 2.1, 0.32); g.translate(s * 0.31, 0, rAt(y) + 0.14 - 0.16); g.rotateY(a); g.translate(tx, y, 0); frameG.push(g); }
    }
  }
  const towers = new THREE.Mesh(merge(tg), M.sandstoneDark); towers.name = 'towers'; tag(towers, { inkId: ID.TOWER, layer: LAYER.BG }); group.add(towers); colliders.push(towers);
  const bands = new THREE.Mesh(merge(bandG), M.sandstone); bands.name = 'towerCourses'; tag(bands, { inkId: 247, layer: LAYER.BG }); group.add(bands); colliders.push(bands);
  const roofs = new THREE.Mesh(merge(roofG), M.dome); roofs.name = 'towerRoofs'; tag(roofs, { inkId: ID.TOWER + 0, layer: LAYER.BG }); group.add(roofs);
  const slits = new THREE.Mesh(merge(slitG), M.recess); slits.name = 'arrowSlits'; tag(slits, { inkId: ID.BG_MIN + 38, layer: LAYER.BG, castShadow: false }); group.add(slits);
  const frames = new THREE.Mesh(merge(frameG), M.sandstoneFrame); frames.name = 'arrowSlitFrames'; tag(frames, { inkId: 248, layer: LAYER.BG }); group.add(frames);

  const _ax = new THREE.Vector3(), _q = new THREE.Quaternion();
  function update(frame) {
    for (const d of drops) {
      const m = d.mesh;
      if (frame < d.tStart) { m.position.copy(d.p0); m.quaternion.identity(); m.userData.inkId = ID.WALL; m.layers.set(LAYER.BG); continue; }
      m.userData.inkId = ID.DEBRIS_MIN + (d.mesh.userData.debrisId || 0); m.layers.set(LAYER.FG);
      const t = Math.min(d.t, (frame - d.tStart) / 24);
      if (t >= d.t) { m.position.copy(d.land); m.quaternion.copy(d.finalQ); continue; }
      m.position.set(d.p0.x + d.v.x * t, d.p0.y + d.v.y * t - 0.5 * G * t * t, Math.min(d.land.z, d.p0.z + d.v.z * t));
      // tumble toward the final orientation with extra turns
      const u = t / d.t;
      _q.copy(d.finalQ);
      const w = Math.min(1, Math.max(-1, _q.w)); const ang = 2 * Math.acos(w); const s = Math.sqrt(Math.max(0, 1 - w * w));
      if (s < 1e-6) _ax.copy(d.axis); else _ax.set(_q.x / s, _q.y / s, _q.z / s);
      m.quaternion.setFromAxisAngle(_ax, (ang + Math.PI * 2) * u);
    }
  }
  update(0);
  return { group, colliders, popAllowed, update };
}
