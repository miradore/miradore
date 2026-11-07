// TOWN department: terrain, canal, hill town, square, hero house, wall, towers and gate.
// All geometry is procedural and deterministic; update(frame) is a pure function of the frame.
import * as THREE from 'three';
import { makeMaterials } from './common.js';
import { buildTerrain } from './terrain.js';
import { buildCanal } from './canal.js';
import { buildHouses } from './houses.js';
import { buildSquare } from './square.js';
import { buildHero } from './hero.js';
import { buildWall } from './wall.js';
import { buildGate } from './gate.js';
import { makeSurface } from './physics.js';

export default {
  name: 'town',
  async build(ctx) {
    const { MAP } = ctx;
    const M = makeMaterials(ctx);
    const group = new THREE.Group(); group.name = 'town';

    const terrain = buildTerrain(ctx, M);
    const canal = buildCanal(ctx, M);
    const houses = buildHouses(ctx, M);
    const square = buildSquare(ctx, M);
    const hero = buildHero(ctx, M);
    const wall = buildWall(ctx, M);
    const footprints = [...houses.footprints, ...square.footprints, hero.footprint];
    const gate = buildGate(ctx, M, makeSurface(MAP, footprints));
    for (const part of [terrain, canal, houses, square, hero, wall, gate]) group.add(part.group);

    group.userData.laundry = houses.laundry.map((l) => ({ mesh: l.mesh, baseQuat: l.baseQuat }));

    const _q = new THREE.Quaternion();
    const T = MAP.T;
    function update(frame, info) {
      const h2 = MAP.hold(frame, 2);
      const t2 = h2 / 24;
      // shock wave position (z) while it crosses the town
      const wave = frame >= T.SHOCK_START && frame <= T.SHOCK_END + 12 ? (frame - T.SHOCK_START) * 3 : -1e9;
      // laundry: gentle sway on 2s, hard whip as the wave passes
      for (const l of houses.laundry) {
        let ang = Math.sin(t2 * 1.6 + l.phase) * l.amp + Math.sin(t2 * 3.7 + l.phase * 1.3) * l.amp * 0.3;
        const dzw = l.z - wave;                           // positive: wave has not reached the cloth yet
        if (dzw < 6 && dzw > -40) {
          const k = MAP.clamp(1 - (-dzw) / 40, 0, 1);     // decays over 40 m behind the front
          const whip = Math.sin((h2 - (l.z / 3 + T.SHOCK_START)) * 0.9 + l.phase) * 1.25 * k + 0.5 * k;
          ang += whip;
        }
        _q.setFromAxisAngle(l.axis, ang);
        l.mesh.quaternion.copy(l.baseQuat).multiply(_q);
      }
      // roof tiles lift briefly as the wave passes and settle back
      for (const tl of houses.tiles) {
        const m = tl.mesh;
        const dzw = tl.base.z - wave;
        m.position.copy(tl.base); m.rotation.set(0, 0, 0);
        if (dzw < 0 && dzw > -36) {
          const u = -dzw / 36;                                // 0 at the front, 1 when settled
          const lift = Math.sin(u * Math.PI) * (1.2 + MAP.hash1(tl.seed) * 1.6);
          m.position.y += lift; m.position.z += u * (1.5 + MAP.hash1(tl.seed + 1) * 2.5);
          m.rotation.x = Math.sin(u * Math.PI) * (1.5 + MAP.hash1(tl.seed + 2) * 3.0);
          m.rotation.z = Math.sin(u * Math.PI * 2) * 0.6;
        }
      }
      square.update(frame);
      hero.update(frame);
      wall.update(frame);
      gate.update(frame);
    }
    update(0);

    const staticColliders = [terrain.ground, ...canal.colliders, ...wall.colliders, ...gate.colliders, ...houses.colliders, ...square.colliders, ...hero.colliders];
    const popAllowed = [...gate.popAllowed, ...wall.popAllowed, ...hero.popAllowed, ...square.popAllowed];
    return { group, update, colliders: { static: staticColliders, bodies: [] }, popAllowed };
  },
};
