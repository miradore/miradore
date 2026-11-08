// Hill town: rows of cubic stucco houses with roof terraces, domes, shutters, awnings, laundry,
// bougainvillea, pots, external stairs. Streets, square, canal and hero house footprint are kept clear.
import * as THREE from 'three';
import { box, boxRot, cyl, sphere, merge, decalPoly } from './common.js';
import { bougCluster, makeTree } from './flora.js';

const FH = 3.4;

export function buildHouses(ctx, M, detail) {
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
  // painted decal on a face: polygon in (u, y) face coordinates, `off` metres off the wall
  const faceFrame = (f) => ({
    O: f.axis === 'z' ? [0, 0, f.c] : [f.c, 0, 0], U: f.axis === 'z' ? [1, 0, 0] : [0, 0, 1], V: [0, 1, 0],
    N: f.axis === 'z' ? [0, 0, f.sign] : [f.sign, 0, 0],
  });
  const faceDecal = (f, pts, off = 0.01) => { const F = faceFrame(f); return decalPoly(pts, F.O, F.U, F.V, F.N, off); };
  const faceRect = (f, u0, u1, y0, y1, off = 0.01) => faceDecal(f, [[u0, y0], [u1, y0], [u1, y1], [u0, y1]], off);
  const gyAt = (f, u) => (f.axis === 'z' ? MAP.groundY(u, f.c) : MAP.groundY(f.c, u));

  // drawn detail lists (ink ids differ from the house bodies so every frame, sill and slat gets a line)
  const ID_TRIM = ID.BG_MIN + 39, ID_SLAT = 248, ID_IRON = 249;
  const trimG = [], slatG = [], ironG = [], glassG = [], beamG = [], terraG = [], glintG = [];
  const decal = { stain: [], stainDark: [], patch: [], patchStone: [], damp: [] };
  const signG = [[], [], [], []], signInkG = [];
  const boug = { blossA: [], blossB: [], leafA: [], leafB: [] };
  const stat = { windows: [0, 0, 0], balconies: 0, lanterns: 0, signs: 0, pots: 0, stains: 0, patches: 0, pipes: 0, vigas: 0 };

  /** Long wavy streak hanging from (u, yTop): a painted run of grime under a spout or sill. */
  const streak = (f, u, yTop, w, L, dr) => {
    const pts = [[u - w / 2, yTop], [u + w / 2, yTop]];
    const n = 5;
    for (let k = 1; k <= n; k++) { const t = k / n; pts.push([u + w / 2 * (1 - t * 0.7) + (dr() - 0.5) * w * 0.2, yTop - L * t * (0.75 + dr() * 0.25)]); }
    pts.push([u + (dr() - 0.5) * w * 0.2, yTop - L]);
    for (let k = n; k >= 1; k--) { const t = k / n; pts.push([u - w / 2 * (1 - t * 0.7) + (dr() - 0.5) * w * 0.2, yTop - L * t * (0.7 + dr() * 0.3)]); }
    return pts;
  };
  /** Irregular blob outline around (u, y). */
  const blobPts = (u, y, ru, ry, dr, n = 9) => {
    const pts = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; const r = 0.7 + dr() * 0.45; pts.push([u + Math.cos(a) * ru * r, y + Math.sin(a) * ry * r]); }
    return pts;
  };

  /** Window with frame, sill, shutters (slatted), optional balcony or hanging pot. */
  const addWindow = (f, u, y, lvl, shutters, isFront, upper, dr) => {
    if (lvl === 1 && upper && isFront && dr() < 0.16) lvl = 2;          // some full windows with balconies on the streets
    stat.windows[lvl]++;
    if (lvl < 2) {
      // painted-flat window: dark pane quad (or a shallow box at medium range), a trim surround quad and
      // shutter quads with slat quads on top; the differing ink ids still draw every edge
      if (lvl === 1) recessG.push(faceBox(f, u, y, 1.0, 1.55, 0.2, 0.03)); else recessG.push(faceRect(f, u - 0.5, u + 0.5, y - 0.775, y + 0.775, 0.03));
      trimG.push(faceRect(f, u - 0.68, u + 0.68, y - 0.86, y + 0.96, 0.02));
      if (lvl === 1) trimG.push(faceBox(f, u, y - 0.84, 1.46, 0.12, 0.3, 0.22));
      if (shutters) for (const s of [-1, 1]) {
        const us = u + s * 0.9;
        cobaltG.push(faceRect(f, us - 0.23, us + 0.23, y - 0.8, y + 0.8, 0.05));
        if (lvl === 1) for (let k = 0; k < 2; k++) slatG.push(faceRect(f, us - 0.18, us + 0.18, y - 0.72 + k * 0.78, y - 0.08 + k * 0.78, 0.06));
      }
      if (lvl === 1 && dr() < 0.12) { stat.stains++; decal.stain.push(faceDecal(f, streak(f, u, y - 0.9, 1.2, 0.6 + dr() * 0.8, dr), 0.012)); }
      return;
    }
    const p = facePoint(f, u, y, 0.4);
    const balcony = upper && isFront && dr() < 0.3 && detail.clear(p[0], p[1] - 0.6, p[2], 1.2, 1.8);
    const yb = balcony ? y - 0.83 : y - 0.775;            // window becomes a French door over a balcony
    recessG.push(faceBox(f, u, (yb + y + 0.775) / 2, 1.0, y + 0.775 - yb, 0.2, 0.03));
    if (dr() < 0.7) glintG.push(faceDecal(f, [[u - 0.36, y + 0.1], [u - 0.12, y + 0.62], [u + 0.04, y + 0.62], [u - 0.2, y + 0.1]], 0.036));
    // frame: lintel and jambs proud of the wall, a deeper sill
    trimG.push(faceBox(f, u, y + 0.775 + 0.09, 1.38, 0.18, 0.14, 0.11));
    for (const s of [-1, 1]) trimG.push(faceBox(f, u + s * 0.59, (yb + y + 0.775) / 2, 0.18, y + 0.775 - yb, 0.1, 0.08));
    if (!balcony) trimG.push(faceBox(f, u, y - 0.775 - 0.06, 1.46, 0.12, 0.32, 0.24));
    if (shutters) {
      const n = lvl === 2 ? 3 : 2;
      for (const s of [-1, 1]) {
        const us = u + s * 0.9;
        cobaltG.push(faceBox(f, us, y, 0.46, 1.6, 0.06, 0.07));
        const gap = 0.08, sh = (1.6 - gap * (n + 1)) / n;
        for (let k = 0; k < n; k++) slatG.push(faceBox(f, us, y - 0.8 + gap + sh / 2 + k * (sh + gap), 0.36, sh, 0.04, 0.1));
      }
    }
    if (balcony) {
      stat.balconies++;
      const ys = y - 0.9;
      trimG.push(faceBox(f, u, ys, 1.9, 0.14, 0.82, 0.82));
      for (const s of [-1, 1]) trimG.push(faceBox(f, u + s * 0.72, ys - 0.22, 0.12, 0.3, 0.45, 0.45));
      const railY = ys + 0.07 + 0.92;
      ironG.push(faceBox(f, u, railY, 1.86, 0.05, 0.05, 0.79), faceBox(f, u, ys + 0.16, 1.86, 0.04, 0.04, 0.79));
      for (const s of [-1, 1]) {
        ironG.push(faceBox(f, u + s * 0.91, railY, 0.05, 0.05, 0.76, 0.8));
        for (const dd of [0.3, 0.55]) ironG.push(faceBox(f, u + s * 0.91, (ys + railY) / 2 + 0.03, 0.03, railY - ys - 0.07, 0.03, dd));
      }
      const spacing = 0.17;
      for (let x = -0.85 + spacing / 2; x < 0.86; x += spacing) ironG.push(faceBox(f, u + x, (ys + railY) / 2 + 0.03, 0.025, railY - ys - 0.07, 0.025, 0.78));
      // a pot on the balcony
      if (dr() < 0.6) {
        const q = facePoint(f, u + (dr() - 0.5) * 1.0, ys + 0.07, 0.45);
        potG.push(cyl(0.18, 0.13, 0.3, 7, q[0], q[1], q[2]));
        bougCluster(boug, q[0], q[1] + 0.55, q[2], f.axis === 'x' ? f.sign : 0, f.axis === 'z' ? f.sign : 0, 0.42, dr, lvl, true);
      }
    } else if (lvl === 2 && !shutters && dr() < 0.3) {
      // hanging pot on an iron bracket beside the window
      const s = dr() < 0.5 ? -1 : 1, up = u + s * 1.25;
      if (up > f.u0 + 0.4 && up < f.u1 - 0.4) {
        stat.pots++;
        ironG.push(faceBox(f, up, y + 0.45, 0.04, 0.04, 0.42, 0.42), faceBox(f, up, y + 0.35, 0.06, 0.25, 0.03, 0.03));
        const q = facePoint(f, up, y - 0.25, 0.34);
        ironG.push(box(0.015, 0.45, 0.015, q[0], y + 0.2, q[2]));
        potG.push(cyl(0.17, 0.12, 0.26, 7, q[0], q[1], q[2]));
        leafG.push(sphere(0.22, q[0], q[1] + 0.32, q[2], 7, 5));
        boug.blossA.push(sphere(0.1, q[0] + 0.12, q[1] + 0.38, q[2], 6, 4), sphere(0.09, q[0] - 0.1, q[1] + 0.3, q[2] + 0.05, 6, 4));
        boug.leafB.push(sphere(0.08, q[0], q[1] - 0.05, q[2], 6, 4), sphere(0.07, q[0] + 0.05, q[1] - 0.22, q[2], 6, 4));
      }
    }
    // grime run under the sill
    if (dr() < 0.3) { stat.stains++; decal.stain.push(faceDecal(f, streak(f, u, y - 0.9, 1.2, 0.6 + dr() * 0.8, dr), 0.012)); }
  };

  // true distance to the next house beside a lot (east: dir 1, west: dir -1)
  const realGap = (lot, dir) => {
    let g = 99;
    for (const o of lots) {
      if (o === lot || o.z1 <= lot.z0 || o.z0 >= lot.z1) continue;
      const d = dir > 0 ? o.x0 - lot.x1 : lot.x0 - o.x1;
      if (d >= -0.01 && d < g) g = d;
    }
    return g;
  };

  // ---------------------------------------------------------------- houses
  let tileCount = 0;
  lots.forEach((lot, i) => {
    const dr = MAP.mulberry32(31000 + i * 17);     // detail randomness (separate stream: the layout stays as before)
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
    const lvlHouse = Math.max(...['S', 'N', 'W', 'E'].map((k) => { const f = bfaces[k]; const p = facePoint(f, (f.u0 + f.u1) / 2, base + h / 2, 0); return detail.lvlAt(p[0], p[1], p[2]); }));
    const lvlFront = (() => { const p = facePoint(bfront, (bfront.u0 + bfront.u1) / 2, base + h / 2, 0); return detail.lvlAt(p[0], p[1], p[2]); })();
    const openFaces = [];
    // windows on every face that is not pressed against a neighbour
    for (const key of ['S', 'N', 'W', 'E']) {
      const f = bfaces[key];
      if (f.axis === 'x') { const gap = (key === 'W') === (lot.side > 0) ? lot.gapIn : lot.gapOut; if (gap < 0.5) continue; }
      const len = f.u1 - f.u0;
      const n = Math.max(1, Math.floor((len - 1.4) / 2.7));
      const step = len / n;
      // faces onto a wide gap (the canal quay, the forecourt, a lane) may carry balconies like a street front
      const wide = f === bfront || (f.axis === 'x' && realGap(lot, key === 'E' ? 1 : -1) > 2.5);
      openFaces.push({ f, n, step, key, wide });
      for (let fl = 0; fl < floors; fl++) {
        const y = base + fl * FH + 2.05;
        for (let k = 0; k < n; k++) {
          const u = f.u0 + step * (k + 0.5);
          if (f === bfront && fl === 0 && Math.abs(u - doorU) < step * 0.5) continue;     // the door takes this bay
          if (rng() < 0.12) continue;
          if (!shutters) rng();                                                          // (kept: the old sill choice)
          const p = facePoint(f, u, y, 0);
          addWindow(f, u, y, detail.lvlAt(p[0], p[1], p[2]), shutters, wide, fl > 0, dr);
        }
      }
    }
    // door on the front face with a stone threshold, a cobalt panel and a lintel
    const doorBottom = base + 0.06;
    cobaltG.push(faceBox(bfront, doorU, doorBottom + 1.2, 1.25, 2.4, 0.15, 0.1));
    trimG.push(faceBox(bfront, doorU, doorBottom + 2.5, 1.7, 0.25, 0.35, 0.35));
    trimG.push(faceBox(bfront, doorU, doorBottom + 0.08, 1.9, 0.16, 0.38, 0.38));
    if (lvlFront >= 1) {
      for (const s of [-1, 1]) trimG.push(faceBox(bfront, doorU + s * 0.74, doorBottom + 1.2, 0.22, 2.4, 0.2, 0.18));
      if (lvlFront === 2) for (const s of [-1, 1]) for (const [yy, hh] of [[0.62, 0.9], [1.68, 1.0]]) slatG.push(faceBox(bfront, doorU + s * 0.29, doorBottom + yy, 0.44, hh, 0.04, 0.13));
    }
    // awning over the door or a shop opening
    let hasAwning = false;
    if (rng() < 0.4) {
      hasAwning = true;
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
    // wall lantern beside the door
    if (lvlFront >= 1 && dr() < 0.5) {
      const s = hasStairs ? -stairDir : (dr() < 0.5 ? -1 : 1);
      const uL = doorU + s * 1.06, yL = doorBottom + 2.25;
      const q = facePoint(bfront, uL, yL, 0.3);
      if (uL > bfront.u0 + 0.3 && uL < bfront.u1 - 0.3 && detail.clear(q[0], q[1], q[2], 0.3, 1.2)) {
        stat.lanterns++;
        ironG.push(faceBox(bfront, uL, yL + 0.3, 0.12, 0.34, 0.04, 0.04), faceBox(bfront, uL, yL + 0.36, 0.04, 0.04, 0.3, 0.3));
        ironG.push(faceBox(bfront, uL, yL + 0.19, 0.26, 0.06, 0.26, 0.36), faceBox(bfront, uL, yL - 0.17, 0.2, 0.05, 0.2, 0.33));
        glassG.push(faceBox(bfront, uL, yL + 0.01, 0.18, 0.32, 0.18, 0.32));
      }
    }
    // faded painted shop sign over the door (no awning there)
    if (!hasAwning && lvlFront >= 1 && dr() < 0.35) {
      const sw = 2.0 + dr() * 1.2;
      const su = Math.min(bfront.u1 - sw / 2 - 0.3, Math.max(bfront.u0 + sw / 2 + 0.3, doorU));
      if (bfront.u1 - bfront.u0 > sw + 0.8) {
        stat.signs++;
        const y0 = doorBottom + 2.78, y1 = y0 + 0.55;
        const ci = Math.floor(dr() * 4);
        signG[ci].push(faceDecal(bfront, [[su - sw / 2, y0 + 0.02], [su + sw / 2 - 0.05, y0], [su + sw / 2, y1 - 0.03], [su - sw / 2 + 0.04, y1]], 0.012));
        // lettering: blocky painted glyphs, a little worn
        const nG = 4 + Math.floor(dr() * 4);
        const gw = (sw - 0.5) / nG;
        for (let g = 0; g < nG; g++) {
          if (dr() < 0.12) continue;
          const gu = su - sw / 2 + 0.25 + g * gw + gw * 0.15;
          const wg = gw * 0.62;
          signInkG.push(faceRect(bfront, gu, gu + wg, y0 + 0.13, y0 + 0.17, 0.016), faceRect(bfront, gu, gu + wg * 0.28, y0 + 0.13, y1 - 0.13, 0.016));
          if (dr() < 0.6) signInkG.push(faceRect(bfront, gu, gu + wg, y1 - 0.17, y1 - 0.13, 0.016));
          if (dr() < 0.5) signInkG.push(faceRect(bfront, gu + wg * 0.72, gu + wg, y0 + 0.13, y1 - 0.13, 0.016));
        }
        // the plaster around the sign is a shade dirtier
        decal.stain.push(faceDecal(bfront, blobPts(su + sw * 0.3, y0 - 0.05, 0.5, 0.25, dr, 7), 0.011));
      }
    }
    // rising damp along the foot of the street front and of open faces near the cameras (follows the slope)
    for (const f of [bfront, ...openFaces.map((o) => o.f).filter((f) => f !== bfront && lvlHouse >= 1)]) {
      const pts = [], n = Math.max(3, Math.ceil((f.u1 - f.u0) / 0.8));
      const hd = 0.35 + dr() * 0.3;
      for (let k = 0; k <= n; k++) { const u = f.u0 + 0.02 + (f.u1 - f.u0 - 0.04) * k / n; pts.push([u, gyAt(f, u) + hd + (dr() - 0.5) * 0.18]); }
      for (let k = n; k >= 0; k--) { const u = f.u0 + 0.02 + (f.u1 - f.u0 - 0.04) * k / n; pts.push([u, gyAt(f, u) - 0.05]); }
      decal.damp.push(faceDecal(f, pts, 0.01));
    }
    // plaster fallen off in patches, showing the rubble stone underneath
    const nPatch = lvlHouse === 2 ? 4 : lvlHouse === 1 ? 2 : 1;
    for (let k = 0; k < nPatch; k++) {
      if (dr() > 0.6) continue;
      const of = openFaces[Math.floor(dr() * openFaces.length)]; if (!of) continue;
      const f = of.f;
      const gi = Math.floor(dr() * (of.n + 1));
      const u = gi === 0 ? f.u0 + 0.7 : gi === of.n ? f.u1 - 0.7 : f.u0 + of.step * gi;
      const fl = Math.floor(dr() * floors);
      const y = base + fl * FH + (dr() < 0.5 ? 0.5 : 3.0) + dr() * 0.2;
      const ru = 0.45 + dr() * 0.3, ry = 0.3 + dr() * 0.25;
      stat.patches++;
      decal.patch.push(faceDecal(f, blobPts(u, y, ru, ry, dr, 10), 0.012));
      const nst = 3 + Math.floor(dr() * 4);
      for (let s = 0; s < nst; s++) {
        const su = u + (dr() - 0.5) * ru * 1.1, sy = y + (dr() - 0.5) * ry * 1.0;
        const sw = 0.12 + dr() * 0.14, sh = 0.08 + dr() * 0.07;
        decal.patchStone.push(faceDecal(f, [[su - sw, sy - sh * 0.8], [su + sw * 0.9, sy - sh], [su + sw, sy + sh * 0.7], [su - sw * 0.8, sy + sh]], 0.016));
      }
    }
    // spouts through the parapet and their stains; drainpipes on some houses
    for (const of of openFaces) {
      const f = of.f;
      if (f !== bfront && dr() < 0.5) continue;
      const nsp = of.n >= 3 && dr() < 0.5 ? 2 : 1;
      for (let s = 0; s < nsp; s++) {
        const gi = 1 + Math.floor(dr() * Math.max(1, of.n - 1));
        const u = of.n > 1 ? f.u0 + of.step * Math.min(of.n - 1, gi) : (dr() < 0.5 ? f.u0 + 0.45 : f.u1 - 0.45);
        const lvlS = (() => { const p = facePoint(f, u, top, 0); return detail.lvlAt(p[0], p[1], p[2]); })();
        if (lvlS >= 1 && dr() < 0.3) {
          // drainpipe from the parapet to the street
          stat.pipes++;
          const q = facePoint(f, u, base, 0.12);
          terraG.push(cyl(0.075, 0.075, top - base + 0.05, 6, q[0], base, q[2]));
          const qh = facePoint(f, u, top + 0.05, 0.16);
          terraG.push(box(0.3, 0.3, 0.3, qh[0], qh[1], qh[2]));
          decal.stainDark.push(faceDecal(f, streak(f, u, top + 0.2, 0.55, 1.0 + dr() * 1.2, dr), 0.011));
          continue;
        }
        if (lvlS >= 1) terraG.push(faceBox(f, u, top + 0.12, 0.16, 0.14, 0.75, 0.62));
        stat.stains++;
        const L = Math.min(h - 0.8, 2.0 + dr() * 3.5);
        decal.stainDark.push(faceDecal(f, streak(f, u, top + 0.08, 0.5 + dr() * 0.3, L, dr), 0.011));
      }
    }
    // vigas: wooden beam ends poking out under the parapet
    if (lvlFront >= 1 && dr() < 0.4) {
      const f = bfront;
      const yv = top - 0.32;
      const nv = Math.floor((f.u1 - f.u0 - 0.8) / 0.9);
      const q = facePoint(f, (f.u0 + f.u1) / 2, yv, 0.3);
      if (nv > 1 && detail.clear(q[0], q[1], q[2], (f.u1 - f.u0) / 2, 1.0)) {
        stat.vigas++;
        const s0 = (f.u0 + f.u1) / 2 - ((nv - 1) * 0.9) / 2;
        for (let k = 0; k < nv; k++) {
          beamG.push(faceBox(f, s0 + k * 0.9, yv, 0.2, 0.2, 0.6, 0.45));
          if (dr() < 0.5) decal.stain.push(faceDecal(f, streak(f, s0 + k * 0.9, yv - 0.1, 0.22, 0.4 + dr() * 0.5, dr), 0.011));
        }
      }
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
      trimG.push(box(hw + 0.3, 0.25, hd + 0.3, hx, top + hh + 0.12, hz));
      recessG.push(box(0.9, 1.7, 0.2, hx, top + 0.95, hz - hd / 2 - 0.02));
    }
    if (rng() < 0.5) {
      const chx = rng() < 0.5 ? bx0 + 0.9 : bx1 - 0.9, chz = rng() < 0.5 ? bz0 + 0.9 : bz1 - 0.9;
      sg.push(box(0.7, 1.5, 0.7, chx, top + 0.75, chz));
      trimG.push(box(1.0, 0.22, 1.0, chx, top + 1.55, chz));
    }
    // bougainvillea spilling over the front parapet: clusters of small blossoms, leaves and trailing strands
    if (rng() < 0.3) {
      const n = 8 + Math.floor(rng() * 5);
      const u0 = front.u0 + 1 + rng() * Math.max(0.5, front.u1 - front.u0 - 5);
      const nx = front.axis === 'x' ? front.sign : 0, nz = front.axis === 'z' ? front.sign : 0;
      for (let k = 0; k < n; k++) {
        const rad = 0.5 + rng() * 0.65;
        const p = facePoint(front, u0 + rng() * 3.5, top + 0.9 - rng() * 3.2 - (k === 0 ? -0.4 : 0), rad * 0.45);
        const dd = detail.distAt(p[0], p[1], p[2]);
        const lv = dd < 40 ? 2 : dd < 70 ? 1 : 0;
        if (lv === 0 && k % 2) continue;
        bougCluster(boug, p[0], p[1], p[2], nx, nz, rad * (lv === 0 ? 1.2 : 1), dr, lv, k < (lv === 2 ? 4 : 2));
      }
    }
    // pots by the door
    if (rng() < 0.55) {
      for (const s of [-1, 1]) {
        if (rng() < 0.4) continue;
        const p = facePoint(bfront, doorU + s * 1.15, doorBottom, 0.5);
        potG.push(cyl(0.34, 0.26, 0.55, 7, p[0], p[1], p[2]));
        leafG.push(sphere(0.48, p[0], p[1] + 0.85, p[2], 7, 5));
        if (lvlFront === 2) { leafG.push(sphere(0.3, p[0] + 0.25, p[1] + 1.15, p[2], 7, 5)); boug.blossB.push(sphere(0.14, p[0] - 0.2, p[1] + 1.1, p[2] + 0.1, 6, 4)); }
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
    const mesh = new THREE.Mesh(merge(sg), M.stucco[((i * 7 + Math.floor(rng() * 4)) % 4) + 4 * (i % 2)]);
    mesh.name = 'house' + i;
    tag(mesh, { inkId: idOf(i), layer: LAYER.BG });
    group.add(mesh); colliders.push(mesh);
    lot.base = base; lot.top = top; lot.index = i;
    footprints.push({ x0: lot.x0, x1: lot.x1, z0: lot.z0, z1: lot.z1, top, base });
  });

  // ---------------------------------------------------------------- garden walls on the strip behind the hero row (z 46..51)
  const gw = [];
  const grng = MAP.mulberry32(5150);
  for (const [x0, x1] of [[-23, -7.5], [7.5, 22]]) {
    const y = MAP.groundY((x0 + x1) / 2, 50.5);
    gw.push(box(x1 - x0, 1.7, 0.4, (x0 + x1) / 2, y + 0.85, 50.6));
    trimG.push(box(x1 - x0 + 0.1, 0.14, 0.56, (x0 + x1) / 2, y + 1.77, 50.6));          // coping
    for (let x = x0 + 1.5; x < x1 - 1; x += 3.1 + (x1 - x0) * 0.02) {
      const rad = 0.5 + MAP.hash1(x) * 0.5;
      const py = y + 1.9 + MAP.hash1(x + 3) * 0.3, pz = 50.6 + (MAP.hash1(x + 9) - 0.5) * 0.6;
      { const dd = detail.distAt(x, py, pz); bougCluster(boug, x, py, pz, 0, 1, rad * 1.1, grng, dd < 40 ? 2 : dd < 70 ? 1 : 0, true); }
    }
    // damp at the foot and a few stains on the town side
    const fN = { axis: 'z', sign: 1, c: 50.8, u0: x0, u1: x1 };
    decal.damp.push(faceDecal(fN, [[x0 + 0.05, y - 0.05], [x1 - 0.05, y - 0.05], [x1 - 0.05, y + 0.32], [(x0 + x1) / 2, y + 0.45], [x0 + 0.05, y + 0.3]], 0.01));
  }
  // gate forecourt: low walls, clustered trees along the canal side, a trough
  const fc = [], trunks = [], tree = { trunk: [], leafA: [], leafB: [], under: [] }, branches = [];
  fc.push(box(0.4, 1.1, 18, 22.4, MAP.groundY(22.4, 17) + 0.55, 17.5), box(15.6, 1.1, 0.4, 14.8, MAP.groundY(14.8, 26.8) + 0.55, 26.8));
  fc.push(box(2.4, 0.9, 1.2, 9.5, 0.45, 12), box(2.0, 0.6, 0.9, 9.5, 0.9, 12));
  trimG.push(box(0.56, 0.12, 18.1, 22.4, MAP.groundY(22.4, 17) + 1.16, 17.5), box(15.7, 0.12, 0.56, 14.8, MAP.groundY(14.8, 26.8) + 1.16, 26.8));
  const trng = MAP.mulberry32(6262);
  for (const [tx, tz] of [[20.6, 23.5], [20.6, 12.5], [12, 24.5]]) {
    const gy = MAP.groundY(tx, tz);
    const before = tree.trunk.length;
    makeTree(tree, tx, gy, tz, trng, 1.15);
    trunks.push(tree.trunk[before]);                         // the main trunk is the collider; branches are not
    for (let k = before + 1; k < tree.trunk.length; k++) branches.push(tree.trunk[k]);
  }
  const fcWalls = new THREE.Mesh(merge(fc), M.stone); fcWalls.name = 'forecourtWalls'; tag(fcWalls, { inkId: ID.CANAL, layer: LAYER.BG }); group.add(fcWalls); colliders.push(fcWalls);
  const fcTrunks = new THREE.Mesh(merge(trunks), M.wood); fcTrunks.name = 'forecourtTrunks'; tag(fcTrunks, { inkId: ID.PLANT, layer: LAYER.BG }); group.add(fcTrunks); colliders.push(fcTrunks);
  const fcBranch = new THREE.Mesh(merge(branches), M.wood); fcBranch.name = 'forecourtBranches'; tag(fcBranch, { inkId: ID.PLANT, layer: LAYER.BG }); group.add(fcBranch);
  const fcUnder = new THREE.Mesh(merge(tree.under), M.treeUnder); fcUnder.name = 'forecourtTreesUnder'; tag(fcUnder, { inkId: 247, layer: LAYER.BG }); group.add(fcUnder);
  const fcCanopy = new THREE.Mesh(merge(tree.leafA), M.treeLeaf); fcCanopy.name = 'forecourtTrees'; tag(fcCanopy, { inkId: ID.PLANT, layer: LAYER.BG }); group.add(fcCanopy);
  const fcCanopyB = new THREE.Mesh(merge(tree.leafB), M.treeLeafB); fcCanopyB.name = 'forecourtTreesB'; tag(fcCanopyB, { inkId: 247, layer: LAYER.BG }); group.add(fcCanopyB);
  const garden = new THREE.Mesh(merge(gw), M.stucco[5]); garden.name = 'gardenWalls'; tag(garden, { inkId: ID_GARDEN, layer: LAYER.BG }); group.add(garden); colliders.push(garden);

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
  addMerged(slatG, M.cobaltSlat, 'shutterSlats', ID_SLAT, false);
  addMerged(trimG, M.trim, 'stoneTrims', ID_TRIM);
  addMerged(beamG, M.wood, 'vigas', ID_TRIM);
  addMerged(terraG, M.pot, 'spoutsAndPipes', ID_TRIM);
  addMerged(ironG, M.iron, 'ironwork', ID_IRON);
  addMerged(glassG, M.glass, 'lanternGlass', ID_IRON, false);
  addMerged(drumG, M.stucco[3], 'domeDrums', ID_DOME - 1);
  addMerged(domeG, M.dome, 'domes', ID_DOME);
  awnG.forEach((g, k) => addMerged(g, M.awning[k], 'awnings' + k, ID.AWNING));
  addMerged(whiteG, M.white, 'awningStripes', ID.AWNING, false);
  addMerged(boug.blossA, M.bougainvillea, 'bougainvillea', ID.PLANT);
  addMerged(boug.blossB, M.blossomLight, 'bougainvilleaLight', 247);
  addMerged(boug.leafA, M.leaf, 'bougainvilleaLeaves', ID.PLANT);
  addMerged(boug.leafB, M.leafDark, 'bougainvilleaLeavesDark', 247);
  addMerged(potG, M.pot, 'pots', ID.PLANT);
  addMerged(leafG, M.leaf, 'potPlants', ID.PLANT);
  addMerged(linesG, M.wood, 'laundryLines', ID.LAUNDRY, false);
  // painted decals: id 0 so the ink pass never outlines them
  addMerged(glintG, M.glint, 'windowGlints', ID.NONE, false);
  for (const k of Object.keys(decal)) addMerged(decal[k], M[k === 'damp' ? 'stainDark' : k], 'decal_' + k, ID.NONE, false);
  signG.forEach((g, k) => addMerged(g, M.signs[k], 'shopSigns' + k, ID.NONE, false));
  addMerged(signInkG, M.signInk, 'shopSignLetters', ID.NONE, false);

  return { group, colliders, footprints, laundry, tiles, lots };
}
