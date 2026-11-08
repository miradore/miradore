// Boulders launched by the kick, their landings (dust burst and chips) and the shattered turquoise dome.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import { makeBillows, dustStyle, burst, trail } from './billow.js';
import { Debris, assignFlights, CAMERA_POINTS } from './debris.js';

const { T, ID, PALETTE } = MAP;

// landing points (x, z); roof landings are 1, 2, 4, 5 in the brief (indices 0, 1, 3, 4).
// Landing 11 was briefed at (4, 74); it is moved to (-1, 76) so the resting boulder clears the shot 28 camera at (3, 5, 72).
const LAND = [[-14, 58], [12, 70], [-30, 48], [-18, 55], [-16, 40], [20, 96], [-8, 118], [24, 120], [-36, 80], [16, 134], [-1, 76], [-24, 140]];
const ROOF = new Set([0, 1, 3, 4]);
const G_BOULDER = 6.5;
const SANDSTONES = [[0xE2B48E, 0xB8785A], [0xD9A77E, 0xA96E4F], [0xC9A27A, 0x8F6A4A], [0xE8C19C, 0xB98564]];

export function makeBoulders(ctx, reg) {
  const style = dustStyle(ctx);
  // ---------------- the twelve boulders (one material each for colour variety)
  const boulders = [];
  const rocks = new THREE.Group(); rocks.name = 'boulders';
  const tmp = new THREE.Vector3();
  for (let i = 0; i < 12; i++) {
    const r = 1.5 + MAP.hash1(i + 1500) * 2.5;
    const col = SANDSTONES[i % SANDSTONES.length];
    const d = new Debris(ctx, { add: (g) => rocks.add(g) }, { seed: 1510 + i, count: 1, kind: 'rock', size: [r, r], color: col[0], shade: col[1], inkId: ID.BOULDER_MIN + (i % 10), name: 'boulder' + i, g: G_BOULDER });
    const [lx, lz] = LAND[i];
    const ly = MAP.groundY(lx, lz) + (ROOF.has(i) ? 10.5 : 2);
    const f0 = T.KICK + Math.floor(i * 0.7);
    d.set(0, f0, T.BOULDER_LANDINGS[i], [(MAP.hash1(i + 1520) - 0.5) * 16, 15, 0], [lx, ly, lz], G_BOULDER);
    d.pieces[0].omega = 1.5 + MAP.hash1(i + 1530) * 2.5;
    // report (do not alter) any boulder path that grazes a camera
    for (const c of CAMERA_POINTS) if (d.pathDistance(0, c) < r + 1.5) console.warn('[fx] boulder', i, 'passes within', (d.pathDistance(0, c)).toFixed(1), 'm of camera', c.toArray());
    boulders.push(d);
  }
  ctx.tag(rocks, { inkId: undefined, layer: ctx.LAYER.FG, castShadow: true, receiveShadow: true });
  reg.add(rocks);
  // ---------------- a short trail of four dust puffs behind each boulder in flight
  const trails = boulders.map((d, i) => makeBillows(ctx, reg, 4, { seed: 1550 + i, count: 4, style, name: `boulderTrail${i}_` }));
  const trailTmp = new THREE.Vector3();

  // ---------------- landing bursts and chips
  const landBursts = LAND.map((p, i) => makeBillows(ctx, reg, 10, { seed: 1600 + i, count: 7, style, name: `landDust${i}_` }));
  const landChips = new Debris(ctx, reg, { seed: 1700, count: 120, kind: 'chip', size: [0.25, 0.6], color: PALETTE.sandstone, shade: PALETTE.sandstoneShade, inkId: ID.DEBRIS_MIN + 1, name: 'landChip' });
  assignFlights(landChips, 1701, (k, rng) => {
    const i = Math.floor(k / 10); const [lx, lz] = LAND[i];
    const ly = MAP.groundY(lx, lz) + (ROOF.has(i) ? 10.5 : 0.2);
    const th = rng() * Math.PI * 2, rr = 1.5 + rng() * 5;
    const xl = lx + Math.cos(th) * rr, zl = lz + Math.sin(th) * rr;
    const yl = ROOF.has(i) && rr < 4 ? ly + 0.2 : MAP.groundY(xl, zl) + 0.2;
    return { f0: T.BOULDER_LANDINGS[i], f1: T.BOULDER_LANDINGS[i] + 12 + Math.floor(rng() * 18), p0: [lx, ly + 1.5, lz], p1: [xl, yl, zl], g: 9.8 };
  }, 1.5);

  // ---------------- dome shatter at (-18, 55), frame 1236
  const domeY = MAP.groundY(-18, 55) + 10.5;
  const shards = new Debris(ctx, reg, { seed: 1800, count: 25, kind: 'shard', size: [0.8, 2.0], color: PALETTE.dome, shade: PALETTE.domeShade, inkId: ID.DEBRIS_MIN + 5, name: 'domeShard' });
  assignFlights(shards, 1801, (k, rng) => {
    const th = rng() * Math.PI * 2, rr = 3 + rng() * 11;
    const xl = -18 + Math.cos(th) * rr, zl = 55 + Math.sin(th) * rr;
    const yl = rr < 6 ? domeY + 0.3 : MAP.groundY(xl, zl) + 0.3;
    return { f0: T.DOME_SHATTER, f1: T.DOME_SHATTER + 14 + Math.floor(rng() * 26), p0: [-18 + (rng() - 0.5) * 4, domeY + 2 + rng() * 3, 55 + (rng() - 0.5) * 4], p1: [xl, yl, zl], g: 9.8 };
  }, 1.5);
  const domeBurst = makeBillows(ctx, reg, 12, { seed: 1810, count: 7, style, name: 'domeDust' });

  return {
    update(frame, fh) {
      for (const b of boulders) b.update(frame);
      for (let i = 0; i < boulders.length; i++) {
        const d = boulders[i], p = d.pieces[0];
        if (fh < p.f0 || fh > p.f1 + 16) { for (const b of trails[i]) b.hide(); continue; }
        const k = p.size / 3;
        trail(trails[i], fh, (e, out) => { if (e < p.f0 + 2 || e >= p.f1) return false; d.posAt(0, e, out); return true; },
          { every: 4, life: 16, r0: 0.7 * k + 0.3, r1: 2.2 * k + 0.6, rise: 1.0, seed: 1560 + i, tmp: trailTmp });
      }
      for (let i = 0; i < LAND.length; i++) {
        const [lx, lz] = LAND[i];
        const ly = MAP.groundY(lx, lz) + (ROOF.has(i) ? 10.5 : 0.5);
        burst(landBursts[i], fh, { x: lx, y: ly + 1, z: lz, birth: MAP.hold(T.BOULDER_LANDINGS[i], 2), life: 56, spread: 4, r0: 1.5, r1: 4.5, rise: 3, seed: 1900 + i, up: 0.3, floor: ly });
      }
      landChips.update(frame);
      shards.update(frame);
      burst(domeBurst, fh, { x: -18, y: domeY + 2, z: 55, birth: MAP.hold(T.DOME_SHATTER, 2), life: 64, spread: 6, r0: 2, r1: 6, rise: 5, seed: 1236, up: 0.4 });
    },
  };
}
