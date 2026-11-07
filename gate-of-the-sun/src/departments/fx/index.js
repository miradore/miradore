// FX department: bolt, dome of light, shock wave, steam column, joint steam, cracks, impact flash,
// gate burst debris, boulders and landings, dome shatter, dust bursts, dust wall, ash, pebble splash.
// Everything is a pure function of the frame. Steam and dust run on 2s, falling debris on 1s.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import { makeLight } from './light.js';
import { makeSteam } from './steam.js';
import { makeDust } from './dust.js';
import { makeBoulders } from './boulders.js';
import { makeAmbient } from './ambient.js';

export default {
  name: 'fx',
  async build(ctx) {
    const group = new THREE.Group();
    group.name = 'fx';
    const popAllowed = [];
    // registry: every FX object is added to the group and listed as allowed to appear or vanish mid shot
    const reg = {
      add(obj) {
        group.add(obj);
        obj.traverse((o) => { if (o.isMesh) popAllowed.push(o); });
      },
    };
    const modules = [makeLight(ctx, reg), makeSteam(ctx, reg), makeDust(ctx, reg), makeBoulders(ctx, reg), makeAmbient(ctx, reg)];
    let sphereCount = 0; group.traverse((o) => { if (o.isMesh && o.geometry.type === 'SphereGeometry') sphereCount++; });
    console.log('[fx] built: meshes', popAllowed.length, 'billow spheres', sphereCount);

    const camPos = new THREE.Vector3();
    return {
      group,
      update(frame, info, ctx) {
        const fh = MAP.hold(frame, 2);
        const st = ctx.cameraState(frame);
        camPos.copy(st.pos);
        let flash = 0;
        for (const m of modules) {
          const f = m.update(frame, fh, info, ctx, camPos);
          if (typeof f === 'number') flash = Math.max(flash, f);
        }
        ctx.post.flash = flash;
      },
      colliders: { static: [], bodies: [] },
      popAllowed,
    };
  },
};
