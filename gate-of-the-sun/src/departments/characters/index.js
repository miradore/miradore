// CHARACTERS department: the three kids, the mothers with their children and a parametric crowd.
// Every pose is a pure function of the frame (held on 2s). See acting.js for the per-shot direction.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import { buildFigure, G, celMat } from './rig.js';
import { foxSpec, hareSpec, lynxSpec, badgerSpec, pigletSpec, goatSpec, goatKidSpec, crowdSpec, SPECIES } from './species.js';
import { makeTearTexture } from './eyes.js';
import { makeCast, direct } from './acting.js';

const CLOSE_UPS = new Set([4, 13, 30, 31]);

export default {
  name: 'characters',
  async build(ctx) {
    const { ID, LAYER, tag } = ctx;
    const group = new THREE.Group(); group.name = 'characters';
    let nextId = ID.CHAR_MIN;
    const figs = {};
    const make = (spec) => { const f = buildFigure(ctx, spec); group.add(f.root); figs[spec.name] = f; return f; };
    make(foxSpec(nextId++)); make(hareSpec(nextId++)); make(lynxSpec(nextId++));
    make(badgerSpec(nextId++)); make(pigletSpec(nextId++)); make(goatSpec(nextId++)); make(goatKidSpec(nextId++));

    // crowd: 56 members, 8 of each species, species cycling with the index
    const crowd = [];
    for (let i = 0; i < 56; i++) {
      const sp = SPECIES[i % SPECIES.length];
      const f = buildFigure(ctx, crowdSpec(sp, i, nextId++));
      group.add(f.root); crowd.push(f);
    }

    // ---------------------------------------------------------------- props
    const props = {};
    const propMat = (c, s) => celMat(ctx, c, s);
    // pebble (fox, shot 3): flies free after release
    props.pebble = new THREE.Mesh(G.sphere(0.022, 8, 6), propMat(0x8E8A86, 0x55535C)); props.pebble.name = 'pebble'; group.add(props.pebble);
    // tear (hare, shot 31)
    const tearTex = makeTearTexture();
    props.tear = new THREE.Mesh(G.plane(0.016, 0.05), ctx.makeFlat({ map: tearTex, alphaTest: 0.5 })); props.tear.name = 'hare_tear';
    figs.hare.face.add(props.tear); props.tear.castShadow = false;
    // clay jug (raccoon, shot 17)
    props.jug = new THREE.Group(); props.jug.name = 'jug';
    const jugBody = new THREE.Mesh(G.lathe('jug', [[0.0, 0], [0.07, 0], [0.11, 0.08], [0.1, 0.17], [0.05, 0.22], [0.055, 0.27], [0.04, 0.27], [0.0, 0.27]], 14), propMat(0xB8714A, 0x7A4328)); jugBody.name = 'jug_body';
    const jugHandle = new THREE.Mesh(G.torus(0.05, 0.012, 6, 12, Math.PI), propMat(0xB8714A, 0x7A4328)); jugHandle.name = 'jug_handle'; jugHandle.position.set(0.1, 0.17, 0); jugHandle.rotation.z = -Math.PI / 2 + 0.2;
    props.jug.add(jugBody, jugHandle); group.add(props.jug);
    // basket with apples (shot 11 onward, static at a bear's feet)
    props.basket = new THREE.Group(); props.basket.name = 'basket';
    const bk = new THREE.Mesh(G.lathe('basket', [[0.0, 0], [0.14, 0], [0.19, 0.14], [0.2, 0.16], [0.17, 0.16], [0.16, 0.14], [0.12, 0.02], [0.0, 0.02]], 14), propMat(0xC9A26A, 0x8E6B45)); bk.name = 'basket_body';
    bk.rotation.z = 1.2; bk.position.set(0, 0.13, 0); props.basket.add(bk);
    const appleMat = propMat(0xD93A2B, 0x8E2318);
    [[0.3, 0.06, 0.1], [0.42, 0.06, -0.08], [0.55, 0.06, 0.18], [0.25, 0.06, -0.25], [0.7, 0.06, 0.02]].forEach((p, i) => { const a = new THREE.Mesh(G.sphere(0.055, 10, 8), appleMat); a.name = 'apple' + i; a.position.set(p[0], p[1], p[2]); props.basket.add(a); });
    group.add(props.basket);
    // folded cloth in the badger's hands (shot 2), a part of the badger body
    props.cloth = new THREE.Mesh(G.box(0.2, 0.025, 0.16), propMat(0xF2E9D8, 0xB0B5C7)); props.cloth.name = 'badger_cloth';
    figs.badger.j.prop.add(props.cloth); props.cloth.position.set(0.1, 0, 0.02); figs.badger.parts.push(props.cloth);

    for (const p of [props.pebble, props.jug, props.basket, props.cloth, props.tear]) tag(p, { inkId: ID.CHAR_MAX, layer: LAYER.FG });

    // ---------------------------------------------------------------- collider bodies
    const bodies = [];
    for (const k of Object.keys(figs)) bodies.push({ name: k, parts: figs[k].parts.slice() });
    for (const c of crowd) bodies.push({ name: c.name, parts: c.parts.slice() });

    const cast = makeCast(ctx, figs, crowd, props);
    const debug = typeof location !== 'undefined' && /chardebug/.test(location.search);
    if (debug) {
      const tri = (f) => Math.round(f.triangles());
      console.log('[characters] triangles fox', tri(figs.fox), 'hare', tri(figs.hare), 'lynx', tri(figs.lynx), 'badger', tri(figs.badger), 'goat', tri(figs.goat), 'piglet', tri(figs.piglet), 'crowd max', Math.max(...crowd.map(tri)), 'crowd', crowd.slice(0, 7).map((c) => c.spec.species + ':' + tri(c)).join(' '));
    }

    return {
      group,
      update(frame, info, ctx2) {
        const c = ctx2 || ctx;
        // close-up faces (shots 4, 13, 30, 31): 10 percent bigger eyes, spaced slightly wider
        const close = CLOSE_UPS.has(info.shotId);
        for (const k of ['fox', 'hare', 'lynx']) if (figs[k].closeUp !== close) figs[k].setCloseUp(close);
        direct(cast, frame, info, c);
        // anime face cheat: every face turns toward this frame's lens (anchors are final at this point)
        const cam = c.cameraState(frame).pos;
        for (const k of Object.keys(figs)) figs[k].updateCheat(cam);
        for (const f of crowd) f.updateCheat(cam);
        if (debug) {
          const a = MAP.ANCHORS; const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]).toFixed(3);
          const fh = figs.fox.headWorld(), hh = figs.hare.headWorld(), lh = figs.lynx.headWorld();
          const hj = figs.hare.j; console.log('[characters] hare hips', hj.hips.position.toArray().map((v) => v.toFixed(3)), 'thighL', hj.thighL.rotation.toArray().slice(0, 3).map((v) => v.toFixed(2)), 'shinL', hj.shinL.rotation.toArray().slice(0, 3).map((v) => v.toFixed(2)), 'spine', hj.spine.rotation.toArray().slice(0, 3).map((v) => v.toFixed(2)));
          if (info.shotId === 9) { const w = (o) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return v.toArray().map((x) => x.toFixed(2)).join(','); };
            const F = figs.fox.j, Hh = figs.hare.j;
            console.log(`[characters] hug f${frame} foxHead ${w(figs.fox.headMesh)} foxChest ${w(F.chest)} foxHandL ${w(F.handL)} foxHandR ${w(F.handR)} foxElbowL ${w(F.faL)} foxElbowR ${w(F.faR)} | hareHead ${w(figs.hare.headMesh)} hareChest ${w(Hh.chest)} hareNeck ${w(Hh.neck)} hareHips ${w(Hh.hips)} hareShL ${w(Hh.uaL)} hareShR ${w(Hh.uaR)}`); }
          console.log(`[characters] f${frame} shot${info.shotId} fox ${fh.map((v) => v.toFixed(2))} d=${d(fh, a.foxHead)} hare ${hh.map((v) => v.toFixed(2))} d=${d(hh, a.hareHead)} lynx ${lh.map((v) => v.toFixed(2))} d=${d(lh, a.lynxHead)}`);
        }
      },
      colliders: { static: [], bodies },
      popAllowed: [props.pebble, props.tear],
    };
  },
};
