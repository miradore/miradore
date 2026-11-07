// Hill town: rows of cubic stucco houses with roof terraces, domes, shutters, awnings, laundry,
// bougainvillea, pots, external stairs. Streets, square, canal and hero house footprint are kept clear.
import * as THREE from 'three';
import { box, boxRot, cyl, sphere, merge } from './common.js';

const FH = 3.4;

export function buildHouses(ctx, M) {
  const { MAP, ID, LAYER, tag } = ctx;
  const group = new THREE.Group(); group.name = 'houses';
  const rng = MAP.mulberry32(4242);
  const colliders = [], footprints = [], laundry = [], tiles = [];
  const recessG = [], cobaltG = [], domeG = [], drumG = [], awnG = [[], [], []], whiteG = [], bougG = [], potG = [], leafG = [], linesG = [], woodG = [];
  const H = MAP.HERO_HOUSE;
  const idOf = (i) => ID.BG_MIN + (i % 36);
  const ID_DOME = ID.BG_MIN + 36, ID_COBALT = ID.BG_MIN + 37, ID_RECESS = ID.BG_MIN + 38, ID_GARDEN = ID.BG_MIN + 35;

  // ---------------------------------------------------------------- rows (z ranges) and their front direction
  const rows = [
    { z0: 8, z1: 16.5, front: -1 }, { z0: 18, z1: 26, front: 1 },
    { z0: 34, z1: 46, front: -1 },
    { z0: 59, z1: 70, front: -1 }, { z0: 71.5, z1: 82.5, front: -1 }, { z0: 84, z1: 95, front: 1 }, { z0: 96.5, z1: 106, front: 1 },
    { z0: 114, z1: 124.5, front: -1 }, { z0: 126, z1: 136, front: 1 },
    { z0: 144, z1: 156, front: -1 }, { z0: 158, z1: 170, front: 1 },
  ];
  const blocked = (x0, x1, z0, z1) => {
    const hit = (a0, a1, b0, b1) => x1 > a0 && x0 < a1 && z1 > b0 && z0 < b1;
    if (hit(-6.5, 6.5, 6, 171)) return true;                       // main street
    if (hit(6.5, 23, 8, 27.5)) return true;                         // gate forecourt (open sight lines for shots 3, 5, 29)
    if (hit(22.5, 44.5, 8, 152)) return true;                       // canal and bank paths
    if (hit(-30.5, 30.5, 58, 95.5)) return true;                    // square and colonnade
    if (hit(H.xMin - 0.6, H.xMax + 0.6, H.zMin - 0.6, H.zMax + 0.6)) return true;   // hero house
    return false;
  };

  // ---------------------------------------------------------------- lots
  const lots = [];
  for (const row of rows) {
    for (const side of [1, -1]) {
      let x = 6.6 * side;
      let prevGap = 99;
      while (Math.abs(x) < 118) {
        const w = 7 + rng() * 5;
        const gap = rng() < 0.35 ? 0.25 : 0.8 + rng() * 1.6;
        const xa = Math.min(x, x + side * w), xb = Math.max(x, x + side * w);
        if (Math.abs(xb) > 120 || Math.abs(xa) > 120) break;
        // lots sit 0.4 m back from the street edge so sills, lintels and thresholds never enter the street volume
        const depth = row.z1 - row.z0 - 0.4 - rng() * 1.5;
        const z0 = row.front < 0 ? row.z0 + 0.4 : row.z1 - 0.4 - depth, z1 = row.front < 0 ? row.z0 + 0.4 + depth : row.z1 - 0.4;
        if (blocked(xa, xb, z0, z1)) {
          // jump over the obstacle
          if (xa < 23 && xb > 6.5 && z1 > 8 && z0 < 27.5) { x = 23.1; prevGap = 99; continue; }
          if (xa < 44.5 && xb > 22.5 && z1 > 8 && z0 < 152) { x = side > 0 ? 44.6 : -45; prevGap = 99; continue; }
          if (xa < 30.5 && xb > -30.5 && z1 > 58 && z0 < 95.5) { x = side > 0 ? 30.8 : -30.8; prevGap = 99; continue; }
          if (xa < H.xMax + 0.6 && xb > H.xMin - 0.6 && z1 > H.zMin - 0.6 && z0 < H.zMax + 0.6) { x = side > 0 ? H.xMax + 0.9 : H.xMin - 0.9; prevGap = 99; continue; }
          x += side * (w + gap); prevGap = gap; continue;
        }
        const lot = { x0: xa, x1: xb, z0, z1, front: row.front, gapIn: prevGap, gapOut: gap, side };
        // houses touching the main street face it
        if (Math.abs(xa) < 7.2 && side > 0) lot.front = 'W'; else if (Math.abs(xb) < 7.2 && side < 0) lot.front = 'E';
        lots.push(lot);
        x += side * (w + gap); prevGap = gap;
      }
    }
  }

  // ---------------------------------------------------------------- face helpers
  // face: { axis: 'z'|'x', sign: -1|1, c: plane coordinate, u0, u1 (extent along the face), yb: base }
  const facesOf = (lot, base) => ({
    S: { axis: 'z', sign: -1, c: lot.z0, u0: lot.x0, u1: lot.x1, yb: base, key: -1 },
    N: { axis: 'z', sign: 1, c: lot.z1, u0: lot.x0, u1: lot.x1, yb: base, key: 1 },
    W: { axis: 'x', sign: -1, c: lot.x0, u0: lot.z0, u1: lot.z1, yb: base, key: 'W' },
    E: { axis: 'x', sign: 1, c: lot.x1, u0: lot.z0, u1: lot.z1, yb: base, key: 'E' },
  });
  // box on a face: wu along the face, hy tall, thick deep, outer surface `proud` beyond the face plane
  const faceBox = (f, u, y, wu, hy, thick, proud) => {
    const cc = f.c + f.sign * (proud - thick / 2);
    return f.axis === 'z' ? box(wu, hy, thick, u, y, cc) : box(thick, hy, wu, cc, y, u);
  };
  const facePoint = (f, u, y, out) => (f.axis === 'z' ? [u, y, f.c + f.sign * out] : [f.c + f.sign * out, y, u]);

  // ---------------------------------------------------------------- houses
  let tileCount = 0;
  lots.forEach((lot, i) => {
    const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0, cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
    const base = Math.min(MAP.groundY(cx, lot.z0), MAP.groundY(cx, lot.z1)) - 0.06;
    const floors = rng() < 0.72 ? 3 : 2;
    const h = floors * FH + 0.5;
    const top = base + h;
    const sg = [];
    const faces = facesOf(lot, base);
    const frontKey = lot.front;
    const front = frontKey === 'W' ? faces.W : frontKey === 'E' ? faces.E : frontKey < 0 ? faces.S : faces.N;
    // door position along the front (same u range on the lot face and the set-back body face)
    let doorU = front.u0 + (front.u1 - front.u0) * (0.3 + rng() * 0.4);
    // the badger mother stands at a cobalt door at x = -13 on the z = 114 facade (shot 2)
    if (front.axis === 'z' && Math.abs(front.c - 114) < 0.5 && lot.x0 < -13 && lot.x1 > -13) doorU = -13;
    // external stairs need 7.2 m of facade beside the door, inside the lot
    const stairDir = doorU < (front.u0 + front.u1) / 2 ? 1 : -1;
    const stairRoom = stairDir > 0 ? front.u1 - 0.3 - (doorU + 1.2) : (doorU - 1.2) - (front.u0 + 0.3);
    const hasStairs = rng() < 0.2 && stairRoom > 6.2;
    // body (set back behind the stair strip on the front when there are stairs)
    let bx0 = lot.x0, bx1 = lot.x1, bz0 = lot.z0, bz1 = lot.z1;
    if (hasStairs) { if (front.axis === 'z') { if (front.sign < 0) bz0 += 1.2; else bz1 -= 1.2; } else { if (front.sign < 0) bx0 += 1.2; else bx1 -= 1.2; } }
    const bw = bx1 - bx0, bd = bz1 - bz0, bcx = (bx0 + bx1) / 2, bcz = (bz0 + bz1) / 2;
    sg.push(box(bw, h, bd, bcx, base + h / 2, bcz));
    // parapet
    const pw = 0.35, ph = 0.9;
    sg.push(box(bw, ph, pw, bcx, top + ph / 2, bz0 + pw / 2), box(bw, ph, pw, bcx, top + ph / 2, bz1 - pw / 2));
    sg.push(box(pw, ph, bd, bx0 + pw / 2, top + ph / 2, bcz), box(pw, ph, bd, bx1 - pw / 2, top + ph / 2, bcz));
    // body faces after set back
    const bodyLot = { x0: bx0, x1: bx1, z0: bz0, z1: bz1 };
    const bfaces = facesOf(bodyLot, base);
    const bfront = frontKey === 'W' ? bfaces.W : frontKey === 'E' ? bfaces.E : frontKey < 0 ? bfaces.S : bfaces.N;
    const shutters = rng() < 0.62;
    // windows on every face that is not pressed against a neighbour
    for (const key of ['S', 'N', 'W', 'E']) {
      const f = bfaces[key];
      if (f.axis === 'x') { const gap = (key === 'W') === (lot.side > 0) ? lot.gapIn : lot.gapOut; if (gap < 0.5) continue; }
      const len = f.u1 - f.u0;
      const n = Math.max(1, Math.floor((len - 1.4) / 2.7));
      const step = len / n;
      for (let fl = 0; fl < floors; fl++) {
        const y = base + fl * FH + 2.05;
        for (let k = 0; k < n; k++) {
          const u = f.u0 + step * (k + 0.5);
          if (f === bfront && fl === 0 && Math.abs(u - doorU) < step * 0.5) continue;     // the door takes this bay
          if (rng() < 0.12) continue;
          recessG.push(faceBox(f, u, y, 1.0, 1.55, 0.2, 0.03));
          if (shutters) { cobaltG.push(faceBox(f, u - 0.74, y, 0.45, 1.55, 0.1, 0.09)); cobaltG.push(faceBox(f, u + 0.74, y, 0.45, 1.55, 0.1, 0.09)); }
          else if (rng() < 0.5) sg.push(faceBox(f, u, y - 0.85, 1.3, 0.14, 0.3, 0.3));     // stone sill
        }
      }
    }
    // door on the front face with a stone threshold, a cobalt panel and a lintel
    const doorBottom = base + 0.06;
    cobaltG.push(faceBox(bfront, doorU, doorBottom + 1.2, 1.25, 2.4, 0.15, 0.1));
    sg.push(faceBox(bfront, doorU, doorBottom + 2.5, 1.7, 0.25, 0.35, 0.35));
    sg.push(faceBox(bfront, doorU, doorBottom + 0.08, 1.9, 0.16, 0.38, 0.38));
    // awning over the door or a shop opening
    if (rng() < 0.4) {
      const aw = 2.6 + rng() * 1.6, ci = Math.floor(rng() * 3);
      const au = Math.min(bfront.u1 - aw / 2 - 0.2, Math.max(bfront.u0 + aw / 2 + 0.2, doorU + (rng() - 0.5) * 2));
      const ay = doorBottom + 2.95, depth = 1.5, tilt = 0.35;
      const centre = facePoint(bfront, au, ay + Math.sin(tilt) * depth / 2, Math.cos(tilt) * depth / 2);
      const rot = bfront.axis === 'z' ? [bfront.sign > 0 ? -tilt : tilt, 0, 0] : [0, 0, bfront.sign > 0 ? tilt : -tilt];
      awnG[ci].push(boxRot(bfront.axis === 'z' ? aw : depth, 0.08, bfront.axis === 'z' ? depth : aw, centre[0], centre[1], centre[2], rot[0], rot[1], rot[2]));
      // white stripes laid along the slope, slightly proud
      const nst = Math.floor(aw / 0.7);
      for (let s = 0; s < nst; s++) {
        const su = au - aw / 2 + 0.35 + s * 0.7 + 0.35;
        if (s % 2) continue;
        const c2 = facePoint(bfront, su, ay + 0.06 + Math.sin(tilt) * depth / 2, Math.cos(tilt) * depth / 2);
        whiteG.push(boxRot(bfront.axis === 'z' ? 0.36 : depth, 0.05, bfront.axis === 'z' ? depth : 0.36, c2[0], c2[1], c2[2], rot[0], rot[1], rot[2]));
      }
      // valance
      const c3 = facePoint(bfront, au, ay + Math.sin(tilt) * depth - 0.18, Math.cos(tilt) * depth);
      awnG[ci].push(bfront.axis === 'z' ? box(aw, 0.36, 0.06, c3[0], c3[1], c3[2]) : box(0.06, 0.36, aw, c3[0], c3[1], c3[2]));
    }
    // external stairs along the front
    if (hasStairs) {
      const nS = 7, rise = FH / nS, run = 0.62;
      const dir = stairDir;
      const uStart = doorU + dir * 1.2;
      for (let s = 0; s < nS; s++) {
        const u = uStart + dir * (s + 0.5) * run;
        const hh = (s + 1) * rise;
        sg.push(faceBox(bfront, u, base + hh / 2, run + 0.02, hh, 1.15, 1.15));
      }
      // landing and first floor door
      const uL = uStart + dir * (nS * run + 0.7);
      sg.push(faceBox(bfront, uL, base + FH - 0.12, 1.4, 0.24, 1.15, 1.15));
      sg.push(faceBox(bfront, uL, base + FH / 2 - 0.12, 1.4, FH - 0.24, 1.15, 1.15));
      sg.push(faceBox(bfront, uL + dir * 0.55, base + FH + 0.5, 0.12, 1.0, 1.2, 1.2));   // low rail post
      cobaltG.push(faceBox(bfront, uL, base + FH + 1.1, 1.1, 2.2, 0.12, 0.08));
    }
    // roof furniture
    const r = rng();
    if (r < 0.25 && Math.min(bw, bd) > 7.5) {
      const rad = Math.min(bw, bd) * 0.27;
      drumG.push(cyl(rad, rad, 1.2, 14, bcx, top, bcz));
      domeG.push(sphere(rad, bcx, top + 1.2, bcz, 16, 10, true));
      domeG.push(sphere(0.28, bcx, top + 1.2 + rad + 0.3, bcz, 8, 6), cyl(0.07, 0.07, 0.4, 6, bcx, top + 1.2 + rad - 0.05, bcz));
    } else if (r < 0.62) {
      const hw = 2.4 + rng() * 1.2, hd = 2.4 + rng() * 1.0, hh = 2.5;
      const hx = bx0 + pw + hw / 2 + rng() * Math.max(0, bw - hw - 2 * pw), hz = bz0 + pw + hd / 2 + rng() * Math.max(0, bd - hd - 2 * pw);
      sg.push(box(hw, hh, hd, hx, top + hh / 2, hz));
      sg.push(box(hw + 0.3, 0.25, hd + 0.3, hx, top + hh + 0.12, hz));
      recessG.push(box(0.9, 1.7, 0.2, hx, top + 0.95, hz - hd / 2 - 0.02));
    }
    if (rng() < 0.5) {
      const chx = rng() < 0.5 ? bx0 + 0.9 : bx1 - 0.9, chz = rng() < 0.5 ? bz0 + 0.9 : bz1 - 0.9;
      sg.push(box(0.7, 1.5, 0.7, chx, top + 0.75, chz), box(1.0, 0.22, 1.0, chx, top + 1.55, chz));
    }
    // bougainvillea spilling over the front parapet
    if (rng() < 0.3) {
      const n = 8 + Math.floor(rng() * 5);
      const u0 = front.u0 + 1 + rng() * Math.max(0.5, front.u1 - front.u0 - 5);
      for (let k = 0; k < n; k++) {
        const rad = 0.5 + rng() * 0.65;
        const p = facePoint(front, u0 + rng() * 3.5, top + 0.9 - rng() * 3.2 - (k === 0 ? -0.4 : 0), rad * 0.45);
        bougG.push(sphere(rad, p[0], p[1], p[2], 8, 6));
      }
    }
    // pots by the door
    if (rng() < 0.55) {
      for (const s of [-1, 1]) {
        if (rng() < 0.4) continue;
        const p = facePoint(bfront, doorU + s * 1.15, doorBottom, 0.5);
        potG.push(cyl(0.34, 0.26, 0.55, 8, p[0], p[1], p[2]));
        leafG.push(sphere(0.48, p[0], p[1] + 0.85, p[2], 8, 6));
      }
    }
    // a loose roof tile for the shock wave on houses near the main street
    if (tileCount < 44 && Math.abs(cx) < 48) {
      const tu = bx0 + 0.6 + rng() * Math.max(0.5, bw - 1.2);
      const tz = lot.front === 1 ? bz1 - pw / 2 : bz0 + pw / 2;
      const tile = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.9), M.pot);
      tile.position.set(tu, top + ph + 0.05, tz); tile.name = 'roofTile' + tileCount;
      tag(tile, { inkId: idOf(i), layer: LAYER.BG }); group.add(tile);
      tiles.push({ mesh: tile, base: tile.position.clone(), seed: tileCount });
      tileCount++;
    }
    const mesh = new THREE.Mesh(merge(sg), M.stucco[(i * 7 + Math.floor(rng() * 4)) % 4]);
    mesh.name = 'house' + i;
    tag(mesh, { inkId: idOf(i), layer: LAYER.BG });
    group.add(mesh); colliders.push(mesh);
    lot.base = base; lot.top = top; lot.index = i;
    footprints.push({ x0: lot.x0, x1: lot.x1, z0: lot.z0, z1: lot.z1, top, base });
  });

  // ---------------------------------------------------------------- garden walls on the strip behind the hero row (z 46..51)
  const gw = [];
  for (const [x0, x1] of [[-23, -7.5], [7.5, 22]]) {
    const y = MAP.groundY((x0 + x1) / 2, 50.5);
    gw.push(box(x1 - x0, 1.7, 0.4, (x0 + x1) / 2, y + 0.85, 50.6));
    for (let x = x0 + 1.5; x < x1 - 1; x += 3.1 + (x1 - x0) * 0.02) {
      const rad = 0.5 + MAP.hash1(x) * 0.5;
      bougG.push(sphere(rad, x, y + 1.9 + MAP.hash1(x + 3) * 0.3, 50.6 + (MAP.hash1(x + 9) - 0.5) * 0.6, 8, 6));
    }
  }
  // gate forecourt: low walls, a few low trees along the canal side, a trough
  const fc = [], trunks = [], canopies = [];
  fc.push(box(0.4, 1.1, 18, 22.4, MAP.groundY(22.4, 17) + 0.55, 17.5), box(15.6, 1.1, 0.4, 14.8, MAP.groundY(14.8, 26.8) + 0.55, 26.8));
  fc.push(box(2.4, 0.9, 1.2, 9.5, 0.45, 12), box(2.0, 0.6, 0.9, 9.5, 0.9, 12));
  for (const [tx, tz] of [[20.6, 23.5], [20.6, 12.5], [12, 24.5]]) {
    const gy = MAP.groundY(tx, tz);
    trunks.push(cyl(0.22, 0.3, 2.6, 7, tx, gy, tz));
    canopies.push(sphere(2.0, tx, gy + 4.0, tz, 10, 7), sphere(1.4, tx + 1.1, gy + 4.9, tz - 0.6, 8, 6), sphere(1.3, tx - 1.0, gy + 4.7, tz + 0.8, 8, 6));
  }
  const fcWalls = new THREE.Mesh(merge(fc), M.stone); fcWalls.name = 'forecourtWalls'; tag(fcWalls, { inkId: ID.CANAL, layer: LAYER.BG }); group.add(fcWalls); colliders.push(fcWalls);
  const fcTrunks = new THREE.Mesh(merge(trunks), M.wood); fcTrunks.name = 'forecourtTrunks'; tag(fcTrunks, { inkId: ID.PLANT, layer: LAYER.BG }); group.add(fcTrunks); colliders.push(fcTrunks);
  const fcCanopy = new THREE.Mesh(merge(canopies), M.leaf); fcCanopy.name = 'forecourtTrees'; tag(fcCanopy, { inkId: ID.PLANT, layer: LAYER.BG }); group.add(fcCanopy);
  const garden = new THREE.Mesh(merge(gw), M.stucco[1]); garden.name = 'gardenWalls'; tag(garden, { inkId: ID_GARDEN, layer: LAYER.BG }); group.add(garden); colliders.push(garden);

  // ---------------------------------------------------------------- laundry lines across the cross streets and the main street
  const lotAt = (x, z, pred) => lots.find((l) => x >= l.x0 && x <= l.x1 && z >= l.z0 - 0.6 && z <= l.z1 + 0.6 && pred(l));
  const addLine = (a, b, axis, seed) => {
    const lr = MAP.mulberry32(seed);
    const L = axis === 'z' ? b[2] - a[2] : b[0] - a[0];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    linesG.push(axis === 'z' ? box(0.05, 0.05, Math.abs(L), mid[0], mid[1], mid[2]) : box(Math.abs(L), 0.05, 0.05, mid[0], mid[1], mid[2]));
    const n = 3 + Math.floor(lr() * 4);
    let s = 0.8 + lr() * 0.8;
    for (let k = 0; k < n && s < Math.abs(L) - 1; k++) {
      const cw = 0.55 + lr() * 0.6, ch = 0.7 + lr() * 0.7;
      const geo = axis === 'z' ? new THREE.BoxGeometry(0.05, ch, cw) : new THREE.BoxGeometry(cw, ch, 0.05);
      geo.translate(0, -ch / 2 - 0.02, 0);
      const mesh = new THREE.Mesh(geo, M.cloth[Math.floor(lr() * M.cloth.length)]);
      const t = s / Math.abs(L);
      mesh.position.set(a[0] + (b[0] - a[0]) * t, a[1] - 0.02, a[2] + (b[2] - a[2]) * t);
      mesh.name = 'cloth' + laundry.length;
      tag(mesh, { inkId: ID.LAUNDRY, layer: LAYER.BG, castShadow: false });
      group.add(mesh);
      laundry.push({ mesh, baseQuat: mesh.quaternion.clone(), axis: axis === 'z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), phase: lr() * 6.283, z: mesh.position.z, amp: 0.08 + lr() * 0.1 });
      s += cw + 0.25 + lr() * 0.6;
    }
  };
  let lineSeed = 900;
  for (const zc of MAP.CROSS_STREETS_Z) {
    for (let x = -116; x <= 116; x += 7.5 + MAP.hash1(x + zc) * 6) {
      if (Math.abs(x) < 8 || (x > 21 && x < 46)) continue;
      if (MAP.hash2(x, zc) < 0.4) continue;
      const north = lotAt(x, zc - 4, (l) => Math.abs(l.z1 - (zc - 4)) < 0.8);
      const south = lotAt(x, zc + 4, (l) => Math.abs(l.z0 - (zc + 4)) < 0.8);
      if (!north || !south) continue;
      const gy = MAP.groundY(x, zc);
      const y = Math.min(north.top, south.top) - 1.6 - MAP.hash1(x * 3 + zc) * 1.8;
      if (y < gy + 4.3) continue;
      addLine([x, y, north.z1], [x, y, south.z0], 'z', lineSeed++);
    }
  }
  for (const zc of [22, 42, 100, 120, 130, 150, 162]) {
    const west = lotAt(-6.7, zc, (l) => Math.abs(l.x1 + 6.6) < 0.8);
    const east = lotAt(6.7, zc, (l) => Math.abs(l.x0 - 6.6) < 0.8);
    if (!west || !east) continue;
    const y = Math.min(west.top, east.top) - 1.4 - MAP.hash1(zc) * 1.5;
    if (y < MAP.groundY(0, zc) + 4.6) continue;
    addLine([west.x1, y, zc], [east.x0, y, zc], 'x', lineSeed++);
  }

  // ---------------------------------------------------------------- shared town-wide meshes
  const addMerged = (list, mat, name, inkId, cast = true) => {
    const g = merge(list); if (!g) return null;
    const m = new THREE.Mesh(g, mat); m.name = name; tag(m, { inkId, layer: LAYER.BG, castShadow: cast }); group.add(m); return m;
  };
  addMerged(recessG, M.recess, 'windowRecesses', ID_RECESS, false);
  addMerged(cobaltG, M.cobalt, 'cobaltJoinery', ID_COBALT, false);
  addMerged(drumG, M.stucco[3], 'domeDrums', ID_DOME - 1);
  addMerged(domeG, M.dome, 'domes', ID_DOME);
  awnG.forEach((g, k) => addMerged(g, M.awning[k], 'awnings' + k, ID.AWNING));
  addMerged(whiteG, M.white, 'awningStripes', ID.AWNING, false);
  addMerged(bougG, M.bougainvillea, 'bougainvillea', ID.PLANT);
  addMerged(potG, M.pot, 'pots', ID.PLANT);
  addMerged(leafG, M.leaf, 'potPlants', ID.PLANT);
  addMerged(linesG, M.wood, 'laundryLines', ID.LAUNDRY, false);

  return { group, colliders, footprints, laundry, tiles, lots };
}
