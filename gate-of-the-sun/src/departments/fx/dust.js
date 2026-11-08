// Dust and impact effects: hand impact cracks, dust burst and chips; gate burst dust, trail, chips
// and splinters; the advancing dust wall; the hero house facade dust.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import { makeBillows, dustStyle, dustBaseStyle, burst, trail as trailPuffs } from './billow.js';
import { Debris, assignFlights } from './debris.js';

const { T, ID, PALETTE } = MAP;

/** Dust wall front (z of the leading surfaces). Slower than the first brief so the cameras of shots
 *  23 (z 54), 25 (z 66) and 26 (z 51) are never inside it; the shot notes ask for z 20 to 60 in shot 24. */
export function dustFront(f) {
  if (f < T.DUST_WALL_START) return -1;
  if (f < 1296) return MAP.lerp(10, 20, (f - T.DUST_WALL_START) / 116);
  if (f < 1368) return MAP.lerp(20, 60, (f - 1296) / 72);
  if (f < 1416) return MAP.lerp(60, 62, (f - 1368) / 48);
  return 62;
}

export function makeDust(ctx, reg) {
  const style = dustStyle(ctx);
  const { LAYER } = ctx;

  // ---------------- hand impact cracks: 12 jagged polylines on the town face of the wall (z = 6.15)
  const crackMat = ctx.makeCel({ color: 0x3A2418, shade: 0x241410 });
  const crackBox = new THREE.BoxGeometry(1, 1, 0.3);
  const cracks = new THREE.Group(); cracks.name = 'cracks';
  const crackSegs = [];
  {
    const rng = MAP.mulberry32(1201);
    // 6 main cracks radiating down and sideways from the fingers, each with short side branches
    const addCrack = (x, y, ang, n, start, t0, t1) => {
      for (let j = 0; j < n; j++) {
        const len = 1.4 + rng() * 2.4;
        ang += (rng() - 0.5) * 1.6; ang = MAP.clamp(ang, -1.45, 1.45);
        const nx = x + Math.sin(ang) * len, ny = y - Math.cos(ang) * len;
        if (ny < 30 || nx < 14 || nx > 46) break;
        const m = new THREE.Mesh(crackBox, crackMat); m.name = `crack${crackSegs.length}`;
        m.position.set((x + nx) / 2, (y + ny) / 2, 6.12);
        m.rotation.z = Math.atan2(-(nx - x), ny - y);
        const thick = MAP.lerp(t0, t1, j / n);
        m.scale.set(thick, len + thick, 1);
        m.visible = false;
        cracks.add(m);
        crackSegs.push({ mesh: m, at: start + Math.round(j * 2.2) });
        if (j > 0 && j < n - 1 && rng() < 0.45) addCrack(nx, ny, ang + (rng() < 0.5 ? -1 : 1) * (0.7 + rng() * 0.6), 2 + Math.floor(rng() * 3), start + Math.round(j * 2.2) + 2, thick * 0.6, 0.03);
        x = nx; y = ny;
      }
    };
    for (let i = 0; i < 6; i++) {
      const x = 27 + (rng() - 0.5) * 8 + i * 1.2, y = 49.7;
      addCrack(x, y, (i / 5 - 0.5) * 2.4 + (rng() - 0.5) * 0.4, 6 + Math.floor(rng() * 4), T.HAND_IMPACT + Math.floor(rng() * 4), 0.09, 0.025);
    }
    ctx.tag(cracks, { inkId: ID.DEBRIS_MIN, layer: LAYER.FG, castShadow: false, receiveShadow: false });
    reg.add(cracks);
  }
  const handBurst = makeBillows(ctx, reg, 12, { seed: 91, count: 8, style, name: 'handDust' });
  const handChips = new Debris(ctx, reg, { seed: 93, count: 20, kind: 'chip', size: [0.3, 0.7], color: PALETTE.sandstone, shade: PALETTE.sandstoneShade, inkId: ID.DEBRIS_MIN + 1, name: 'handChip' });
  assignFlights(handChips, 94, (i, rng) => {
    const xl = 12 + rng() * 13, zl = 9 + rng() * 22;          // west of the canal (x < 26)
    return { f0: T.HAND_IMPACT + Math.floor(rng() * 3), f1: 688 + Math.floor(rng() * 22), p0: [30 + (rng() - 0.5) * 6, 48, 7], p1: [xl, MAP.groundY(xl, zl) + 0.25, zl], g: 9.8 };
  });

  // ---------------- gate burst: dust burst, trailing streak, chips and splinters
  const gateBurst = makeBillows(ctx, reg, 30, { seed: 101, count: 8, style, name: 'gateDust' });
  const trail = makeBillows(ctx, reg, 8, { seed: 103, count: 8, style, name: 'trailDust' });
  const trailData = trail.map((b, k) => ({ z: 8 + k * 5.2, birth: MAP.hold(T.KICK + k * 4, 2), x: (MAP.hash1(k + 1000) - 0.5) * 8, y: 7 + k * 0.8 }));
  const gateChips = new Debris(ctx, reg, { seed: 105, count: 150, kind: 'chip', size: [0.3, 1.0], color: PALETTE.sandstone, shade: PALETTE.sandstoneShade, inkId: ID.DEBRIS_MIN + 1, name: 'gateChip' });
  assignFlights(gateChips, 106, (i, rng) => {
    let zl = 12 + Math.pow(rng(), 1.3) * 78, xl = -28 + rng() * 52;   // never in the canal (x >= 26)
    if (xl > 12 && zl > 34 && zl < 58) xl -= 30;                        // keep the kids' steps clear for the close-ups
    return { f0: T.KICK + Math.floor(rng() * 4), f1: 1140 + Math.floor(rng() * 60), p0: [(rng() - 0.5) * 18, 3 + rng() * 24, 1], p1: [xl, MAP.groundY(xl, zl) + 0.3, zl], g: 9.8 };
  });
  const splinters = new Debris(ctx, reg, { seed: 107, count: 40, kind: 'splinter', size: [1.2, 2.8], color: 0x6B4A2A, shade: 0x3E2A16, inkId: ID.DEBRIS_MIN + 6, name: 'splinter' });
  assignFlights(splinters, 108, (i, rng) => {
    let zl = 10 + rng() * 50, xl = -26 + rng() * 48;
    if (xl > 12 && zl > 34) xl -= 30;
    return { f0: T.KICK + Math.floor(rng() * 3), f1: 1136 + Math.floor(rng() * 44), p0: [(rng() - 0.5) * 16, 2 + rng() * 24, 0.5], p1: [xl, MAP.groundY(xl, zl) + 0.15, zl], g: 9.8 };
  });

  // ---------------- trails of dust behind the big flying gate door pieces (town's gatePieceDoor*).
  // Town owns their flights; FX only reads the live mesh position. Approximate launch points and
  // landing frames (measured from town's ballistics) shape the path behind the piece:
  // position at time te = lerp(p0, P(t), te / t) + 0.5 g te (t - te) up, exact for a parabola.
  const DOOR_P0 = { R: [[2.35, 3.43], [7.34, 3.44], [2.15, 9.84], [7.19, 9.93], [2.28, 16.09], [7.36, 15.85], [7.89, 22.76], [2.48, 25.44]],
    L: [[-2.53, 3.08], [-7.68, 3.11], [-2.6, 9.44], [-7.75, 9.41], [-2.57, 15.53], [-7.53, 15.61], [-7.86, 22.78], [-2.49, 25.48]] };
  const DOOR_LAND = { R: [1158, 1144, 1166, 1138, 1151, 1177, 1161, 1184], L: [1127, 1125, 1155, 1157, 1166, 1161, 1167, 1175] };
  const doorTrails = [];
  for (const sd of ['R', 'L']) for (let k = 0; k < 8; k++) {
    doorTrails.push({ name: `gatePieceDoor${sd}${k}`, p0: new THREE.Vector3(DOOR_P0[sd][k][0], DOOR_P0[sd][k][1], 0.5), land: DOOR_LAND[sd][k],
      puffs: makeBillows(ctx, reg, 3, { seed: 140 + doorTrails.length, count: 5, style, name: `pieceTrail${sd}${k}_` }), mesh: undefined });
  }
  const trailTmp = new THREE.Vector3(), pieceNow = new THREE.Vector3();
  const LAUNCH = T.KICK + 1;

  // ---------------- dust wall. Every surface keeps x <= 20 and z <= front (camera clearances of shots
  // 23, 25 and 26). Layers: a front of big lobes with heavy dark bases, a second rank and a towering
  // rank behind, smaller crest lobes rolling over the top edge, and wisps streaming off both ends.
  const base = dustBaseStyle(ctx);
  const wallRows = [
    { depth: 0, y: 0.75, xs: [-48, -37, -26, -15, -5, 4], R: [13, 15], count: 12, base: true },
    { depth: 14, y: 0.9, yOff: 12, xs: [-43, -31, -19, -8, 3], R: [13, 16], count: 12, base: true },
    { depth: 28, y: 0.6, yOff: 26, xs: [-36, -21, -6], R: [12, 14.5], count: 12, base: false },
  ];
  const wallBillows = [];
  const wallData = [];
  wallRows.forEach((row, ri) => row.xs.forEach((x, xi) => {
    const h = MAP.hash1(ri * 17 + xi * 3 + 1100);
    const R = MAP.lerp(row.R[0], row.R[1], h);
    wallData.push({ x, R, depth: row.depth, yMul: row.y, yOff: row.yOff || 0, ph: h * 6.28 });
    wallBillows.push(...makeBillows(ctx, reg, 1, { seed: 111 + ri * 13 + xi, count: row.count, style, name: `dustWall${ri}_${xi}_`, base: row.base ? base : null, flat: 0.85 }));
  }));
  // crest: mid-size lobes along the top edge, leaning forward and rolling over
  const crest = makeBillows(ctx, reg, 7, { seed: 117, count: 8, style, name: 'wallCrest', flat: 0.5 });
  const crestData = crest.map((b, k) => ({ x: -53 + k * 10 + (MAP.hash1(k + 1150) - 0.5) * 4, R: 6 + 2.5 * MAP.hash1(k + 1160), up: MAP.hash1(k + 1170), ph: MAP.hash1(k + 1180) * 6.28 }));
  // wisps: small stretched billows streaming off the west and east ends, cycling with fades at both ends
  const wisps = makeBillows(ctx, reg, 8, { seed: 119, count: 6, style, name: 'wallWisp', flat: 0.4 });
  const wispDir = new THREE.Vector3();

  // ---------------- hero house facade dust
  const facade = makeBillows(ctx, reg, 10, { seed: 121, count: 8, style, name: 'facadeDust' });
  // ---------------- small dust wisps drifting across the canal steps in shot 26 (1416..1476)
  const drift = makeBillows(ctx, reg, 6, { seed: 131, count: 5, style, name: 'driftDust' });

  return {
    update(frame, fh, info, ctx) {
      // cracks appear progressively from their own frame and stay
      for (const s of crackSegs) s.mesh.visible = frame >= s.at;
      burst(handBurst, fh, { x: 30, y: 50.5, z: 8, birth: T.HAND_IMPACT, life: 56, spread: 5, r0: 1.0, r1: 3.6, rise: 2.5, seed: 640, up: 0.25, zBias: 0.8 });
      handChips.update(frame);
      // gate burst
      burst(gateBurst, fh, { x: 0, y: 7, z: 3, birth: T.KICK, life: 104, spread: 30, r0: 2, r1: 12, rise: 6, seed: 1112, up: 0.25, zBias: 0.9, floor: 0.5 });
      for (let k = 0; k < trail.length; k++) {
        const d = trailData[k]; const a = fh - d.birth;
        if (a < 0 || a > 64) { trail[k].hide(); continue; }
        const u = a / 64, e = MAP.easeOut(u);
        trail[k].set(d.x, d.y + 6 * u, d.z, MAP.lerp(2, 8, e), { t: fh * 0.09, opacity: 1 - MAP.smooth((u - 0.65) / 0.35), spin: k });
      }
      gateChips.update(frame);
      splinters.update(frame);
      // door piece trails (frames KICK..landing, puffs fade after)
      if (fh >= T.KICK && fh < 1200) {
        for (const d of doorTrails) {
          if (d.mesh === undefined) d.mesh = ctx.scene.getObjectByName(d.name) || null;
          if (!d.mesh) { for (const b of d.puffs) b.hide(); continue; }
          d.mesh.getWorldPosition(pieceNow);
          const t = (Math.min(frame, d.land) - LAUNCH) / 24;
          trailPuffs(d.puffs, fh, (e, out) => {
            if (e < LAUNCH + 2 || e >= d.land || t <= 0) return false;
            const te = (e - LAUNCH) / 24, s = MAP.clamp(te / t, 0, 1);
            out.lerpVectors(d.p0, pieceNow, s); out.y += 4.9 * te * Math.max(0, t - te);
            return true;
          }, { every: 4, life: 12, r0: 0.7, r1: 2.4, rise: 1.2, seed: d.land, tmp: trailTmp });
        }
      } else for (const d of doorTrails) for (const b of d.puffs) b.hide();
      // dust wall
      const front = dustFront(fh);
      if (front < 0 || fh >= 1600) { for (const b of wallBillows) b.hide(); for (const b of crest) b.hide(); for (const b of wisps) b.hide(); }
      else {
        const grow = 0.35 + 0.65 * MAP.easeOut((fh - T.DUST_WALL_START) / 70);
        const thin = MAP.smooth((fh - 1420) / 180);
        const depthK = MAP.clamp((front - 10) / 50, 0.1, 1);
        for (let k = 0; k < wallBillows.length; k++) {
          const d = wallData[k];
          const R = d.R * grow * MAP.lerp(1, 0.6, thin) * (1 + 0.06 * Math.sin(fh * 0.05 + d.ph));
          const zc = Math.max(front - d.depth * depthK - R, 4 + R * 0.3);
          const y = MAP.groundY(d.x, zc) + d.yOff * grow + R * d.yMul + 10 * thin;
          wallBillows[k].set(d.x, y, zc, R, { t: fh * 0.05 + d.ph, opacity: 1 - thin, spin: d.ph + fh * 0.004 });
        }
        // crest lobes ride the top edge of the front ranks and roll forward over it
        for (let k = 0; k < crest.length; k++) {
          const d = crestData[k];
          const R = d.R * grow * MAP.lerp(1, 0.6, thin);
          const zc = Math.max(front - 5 * depthK - R, 4 + R * 0.3);
          const top = (d.up < 0.5 ? 0.75 * 14 + 14 : 12 + 0.9 * 14.5 + 14.5) * grow;
          const y = MAP.groundY(d.x, zc) + top + R * 0.2 + 10 * thin + 1.2 * Math.sin(fh * 0.04 + d.ph);
          crest[k].set(d.x, y, zc, R, { t: fh * 0.07 + d.ph, opacity: 1 - thin, spin: d.ph, roll: d.ph + (fh - T.DUST_WALL_START) * 0.02 });
        }
        // wisps: 5 off the west end (drifting west and up), 3 off the east end (rising and curling back west, inside x <= 20)
        for (let k = 0; k < wisps.length; k++) {
          const h1 = MAP.hash1(k + 1190), h2 = MAP.hash1(k + 1195);
          const s = ((fh - T.DUST_WALL_START) * (0.006 + 0.004 * h1) + h2) % 1;
          const op = MAP.smooth(s / 0.2) * (1 - MAP.smooth((s - 0.65) / 0.35)) * (1 - thin) * MAP.smooth((grow - 0.35) / 0.4);
          if (op < 0.04) { wisps[k].hide(); continue; }
          const R = (2.5 + 2.5 * s) * (0.8 + 0.4 * h1) * grow, st = 1.7;
          const Rb = R * st;
          let x, y;
          if (k < 5) { x = -55 - 26 * s - 6 * h1; y = 8 + 14 * h2 + 18 * s; wispDir.set(-1, 0.45, 0).normalize(); }
          else { x = 20 - Rb - 0.5 - 4 * h1 - 16 * s; y = 18 + 10 * h2 + 22 * s; wispDir.set(-0.7, 1, 0).normalize(); }
          const zc = Math.max(front - 6 * depthK - Rb, 4 + Rb * 0.3);
          wisps[k].set(x, MAP.groundY(x, zc) + y * grow + 10 * thin, zc, R, { t: fh * 0.1 + k, opacity: op, spin: h2 * 6, stretch: st, dir: wispDir });
        }
      }
      // drift wisps, shot 26 only (hidden at the shot boundaries)
      if (fh >= 1416 && fh < 1476) {
        for (let k = 0; k < drift.length; k++) {
          const h1 = MAP.hash1(k + 1300), h2 = MAP.hash1(k + 1310), h3 = MAP.hash1(k + 1320);
          // low puffs sliding along the canal steps beyond the hare, 6 to 10 m from the shot 26 camera
          const x = 27 + (((fh - 1416) * (0.08 + 0.05 * h1) + h2 * 6) % 6);
          const z = 42 + h3 * 7, R = 0.4 + 0.5 * h2;
          drift[k].set(x, MAP.stepTopY(1, z) + 1.6 + h1 * 0.8, z, R * 0.8, { t: fh * 0.12 + k, opacity: 0.7, spin: fh * 0.01 + k, squash: 0.7 });
        }
      } else for (const b of drift) b.hide();
      // facade dust
      burst(facade, fh, { x: -9, y: MAP.groundY(-9, 40) + 1, z: 40, birth: T.FACADE_START, life: 60, spread: 7, r0: 2, r1: 7, rise: 4, seed: 1247, up: 0.2, flat: 0.5, floor: MAP.groundY(-9, 40) });
    },
  };
}
