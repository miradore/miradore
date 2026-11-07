// Dust and impact effects: hand impact cracks, dust burst and chips; gate burst dust, trail, chips
// and splinters; the advancing dust wall; the hero house facade dust.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import { makeBillows, dustStyle, burst } from './billow.js';
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
  const crackMat = ctx.makeCel({ color: 0x5A3A2A, shade: 0x33201A });
  const crackBox = new THREE.BoxGeometry(1, 1, 0.3);
  const cracks = new THREE.Group(); cracks.name = 'cracks';
  const crackSegs = [];
  {
    const rng = MAP.mulberry32(1201);
    for (let i = 0; i < 12; i++) {
      let x = 30 + (rng() - 0.5) * 6, y = 49.6;
      let ang = (rng() - 0.5) * 2.2;                       // from straight down, radians
      const n = 5 + Math.floor(rng() * 3);
      const start = T.HAND_IMPACT + Math.floor(rng() * 5);
      for (let j = 0; j < n; j++) {
        const len = 2.2 + rng() * 2.2;
        ang += (rng() - 0.5) * 1.2; ang = MAP.clamp(ang, -1.3, 1.3);
        const nx = x + Math.sin(ang) * len, ny = y - Math.cos(ang) * len;
        if (ny < 27) break;
        const m = new THREE.Mesh(crackBox, crackMat); m.name = `crack${i}_${j}`;
        m.position.set((x + nx) / 2, (y + ny) / 2, 6.15);
        m.rotation.z = Math.atan2(-(nx - x), ny - y);        // box y axis along the segment
        const thick = MAP.lerp(0.32, 0.14, j / n);
        m.scale.set(thick, len + thick * 0.5, 1);
        m.visible = false;
        cracks.add(m);
        crackSegs.push({ mesh: m, at: start + Math.round(j * 2.6) });
        x = nx; y = ny;
      }
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

  // ---------------- dust wall: three rows, keeping every surface at x <= 20 and z <= front
  const wallRows = [
    { depth: 0, y: 0.75, xs: [-40, -29, -18, -7, 4], R: [13, 15] },
    { depth: 16, y: 1.0, yOff: 8, xs: [-36, -24, -12, 0], R: [13, 16] },
    { depth: 32, y: 0.6, yOff: 16, xs: [-30, -16, -2], R: [12, 14] },
  ];
  const wallBillows = [];
  const wallData = [];
  wallRows.forEach((row, ri) => row.xs.forEach((x, xi) => {
    const h = MAP.hash1(ri * 17 + xi * 3 + 1100);
    const R = MAP.lerp(row.R[0], row.R[1], h);
    wallData.push({ x, R, depth: row.depth, yMul: row.y, yOff: row.yOff || 0, ph: h * 6.28 });
  }));
  wallBillows.push(...makeBillows(ctx, reg, wallData.length, { seed: 111, count: 9, style, name: 'dustWall' }));

  // ---------------- hero house facade dust
  const facade = makeBillows(ctx, reg, 10, { seed: 121, count: 8, style, name: 'facadeDust' });
  // ---------------- small dust wisps drifting across the canal steps in shot 26 (1416..1476)
  const wisps = makeBillows(ctx, reg, 6, { seed: 131, count: 5, style, name: 'driftDust' });

  return {
    update(frame, fh) {
      // cracks appear progressively from their own frame and stay
      for (const s of crackSegs) s.mesh.visible = frame >= s.at;
      burst(handBurst, fh, { x: 30, y: 49, z: 7.5, birth: T.HAND_IMPACT, life: 72, spread: 10, r0: 1.5, r1: 7, rise: 3, seed: 640, up: 0.15, zBias: 0.7 });
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
      // dust wall
      const front = dustFront(fh);
      if (front < 0 || fh >= 1600) { for (const b of wallBillows) b.hide(); }
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
      }
      // drift wisps, shot 26 only (hidden at the shot boundaries)
      if (fh >= 1416 && fh < 1476) {
        for (let k = 0; k < wisps.length; k++) {
          const h1 = MAP.hash1(k + 1300), h2 = MAP.hash1(k + 1310), h3 = MAP.hash1(k + 1320);
          // low puffs sliding along the canal steps beyond the hare, 6 to 10 m from the shot 26 camera
          const x = 27 + (((fh - 1416) * (0.08 + 0.05 * h1) + h2 * 6) % 6);
          const z = 42 + h3 * 7, R = 0.4 + 0.5 * h2;
          wisps[k].set(x, MAP.stepTopY(1, z) + 0.3 + h1 * 0.6, z, R, { t: fh * 0.12 + k, opacity: 1, spin: fh * 0.01 + k, squash: 0.7 });
        }
      } else for (const b of wisps) b.hide();
      // facade dust
      burst(facade, fh, { x: -9, y: MAP.groundY(-9, 40) + 1, z: 40, birth: T.FACADE_START, life: 60, spread: 7, r0: 2, r1: 7, rise: 4, seed: 1247, up: 0.2, flat: 0.5, floor: MAP.groundY(-9, 40) });
    },
  };
}
