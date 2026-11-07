// GIANT department: the 90 m bronze automaton and the five small automatons.
// Geometry: giant.js, automatons.js, parts.js. Animation: poses.js (pure function of the held frame).
// Vents for FX steam: group.userData.vents (array of Object3D, local +z points out of the vent).
import * as THREE from 'three';
import { buildGiant } from './giant.js';
import { giantPose } from './poses.js';
import { buildAutomatons, automatonsVisible } from './automatons.js';

export default {
  name: 'giant',
  async build(ctx) {
    const { MAP } = ctx;
    const group = new THREE.Group(); group.name = 'giantDept';
    const giant = buildGiant(ctx);
    group.add(giant.root);
    const autos = buildAutomatons(ctx);
    for (const a of autos) group.add(a.root);

    // vents API for FX
    const vents = [...giant.vents, ...autos.flatMap((a) => a.vents)];
    group.userData.vents = vents;
    group.userData.giantVents = giant.vents;
    group.userData.automatonVents = autos.map((a) => a.vents);
    group.userData.giant = giant.root;
    group.userData.automatons = autos.map((a) => a.root);
    console.log(`[giant] triangles: giant ${giant.triangles}, automatons ${autos.map((a) => a.triangles).join('/')}, vents ${vents.length}`);

    // initial pose so the hierarchy is valid before the first update
    const p0 = giantPose(MAP.T.HEAD_RISE_END, ctx.frameInfo(MAP.T.HEAD_RISE_END));
    giant.apply(p0); ctx.setOpacity(giant.root, 1);
    for (const a of autos) a.apply(MAP.T.AUTOMATONS_START);

    function update(frame, info) {
      const pose = giantPose(frame, info);
      if (!pose) { giant.root.visible = false; ctx.anchors.giantHead = MAP.GIANT.headCenter.slice(); }
      else {
        giant.root.visible = true;
        giant.apply(pose);
        ctx.setOpacity(giant.root, pose.opacity);
        // the giant's head anchor follows the mask (shot 15 camera looks at it)
        const hc = new THREE.Vector3(0, 9, 0); giant.head.localToWorld(hc);
        ctx.anchors.giantHead = [hc.x, hc.y, hc.z];
      }
      const showAutos = automatonsVisible(info.shotId);
      const fh = MAP.hold(frame, 2);
      for (const a of autos) { a.root.visible = showAutos; if (showAutos) a.apply(Math.max(fh, MAP.T.AUTOMATONS_START)); }
    }

    return {
      group,
      update,
      colliders: {
        static: [],
        bodies: [
          { name: 'giant', parts: giant.meshes },
          ...autos.map((a, i) => ({ name: 'automaton' + i, parts: a.meshes })),
        ],
      },
      popAllowed: [],
    };
  },
};
