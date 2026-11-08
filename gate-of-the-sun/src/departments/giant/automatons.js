// Five small (14 m) automatons in the giant's design language at lower detail (shoulder scales, sun boss,
// rayed mask). They appear at
// T.AUTOMATONS_START and walk toward the gate; two of them (A and B) are staged to step through the
// breach during shot 29. Pure function of the held frame, feet never below the ground.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import { makeMaterials, makeInk, mesh, part, ring, ball, vent, countTriangles, finish, cylSurf, sphSurf, mapSurf, slabGeo, patchGeo, ribbonGeo, forgedPlate, wrapGeo, SLIT_LIT, HALO_LIT } from './parts.js';
import { applyTwoBone, makeIkTemps } from './ik.js';

const { hold, lerp, smooth, clamp } = MAP;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const A = {
  hipWalk: 6.4, hipX: 1.1, thigh: 3.4, shin: 3.0, ankleH: 0.71,
  shoulderX: 2.2, shoulderY: 3.0, upperArm: 3.6, foreArm: 3.2,
  neckBase: 3.3, neckLen: 1.0, headR: 1.5, headUp: 1.6,
  footCentre: new THREE.Vector3(0, -0.35, 0.45),
};

// Walk plans: A and B are staged for shot 29, the others come from MAP.SMALL_AUTOMATONS.starts.
// pos(frame) is linear along a straight line; speed in m/s, cycle in seconds.
function makePlans() {
  const S = MAP.SMALL_AUTOMATONS.starts;
  const fast = 20 / (72 / 24);                        // A covers z -16 .. +4 during shot 29 (1608..1680), about 6.7 m/s
  const plans = [];
  plans.push({ name: 'A', from: V(0, 0, -16 - fast * ((1608 - 1548) / 24)), dir: V(0, 0, 1), speed: fast, cycle: 1.0, bob: 0.3, lift: 1.3 });
  plans.push({ name: 'B', from: V(2.5, 0, -36 - fast * ((1608 - 1548) / 24)), dir: V(0, 0, 1), speed: fast, cycle: 1.0, bob: 0.3, lift: 1.3 });
  const targets = [[-4, 0, 0], [5, 0, 0], [-6, 0, 0]];
  for (let i = 2; i < 5; i++) {
    const from = V(S[i][0], 0, S[i][2]);
    const to = V(...targets[i - 2]);
    const dir = to.clone().sub(from).normalize();
    plans.push({ name: 'CDE'[i - 2], from, dir, speed: 4, cycle: 1.6, bob: 0.15, lift: 0.9 });
  }
  return plans;
}
export const PLANS = makePlans();

export function buildAutomaton(ctx, index, mats) {
  const { ID, LAYER, tag, MAP: M } = ctx;
  const H = (n) => M.hash1(n + index * 31.7);
  const bc = { mats, ink: makeInk(ID.AUTOMATON_MIN, ID.AUTOMATON_MAX), tag, layer: LAYER.FG, meshes: [], vents: [], name: 'automaton' + index };
  // offset the ink cycle per automaton so neighbours differ
  for (let i = 0; i < index * 3; i++) bc.ink.next();
  let seed = 1 + index * 50;
  // the giant's forged ring at a fraction of the detail
  const R = (parent, o) => ring(bc, parent, { hash: H, seed: seed++, thick: 0.1, bu: 0.06, bv: 0.03, su: 4, sv: 2, band: 0.13, bandRaise: 0.04, rivetR: 0.06, rivetSpacing: 0.55, drips: 0, gap: 0.08, ...o });

  const root = new THREE.Group(); root.name = 'automaton' + index;
  const body = new THREE.Group(); root.add(body);                       // yaw + bob
  const pelvis = new THREE.Group(); pelvis.position.y = A.hipWalk; body.add(pelvis);
  R(pelvis, { y: -0.85, h: 1.1, rTop: 1.32, rBot: 1.55, n: 4, phase: 0.5 });
  const torso = new THREE.Group(); pelvis.add(torso);
  // narrow banded waist, chest with the sun boss, yoke, collar
  R(torso, { y: 0.15, h: 0.72, rTop: 1.12, rBot: 1.38, n: 4, phase: 0.2, rivets: false });
  R(torso, { y: 0.72, h: 0.72, rTop: 1.42, rBot: 1.18, n: 4, phase: 0.6, rivets: false });
  R(torso, { y: 1.35, h: 1.3, rTop: 2.0, rBot: 1.6, n: 4, phase: -Math.PI / 4, thick: 0.14 });
  R(torso, { y: 2.5, h: 0.8, rTop: 1.3, rBot: 2.08, n: 4, phase: 0.0, rivets: false });
  R(torso, { y: 3.1, h: 0.45, rTop: 0.9, rBot: 1.32, n: 6, phase: 0.3, rivets: false, band: 0.1, core: false });
  {
    const s = cylSurf({ rTop: 2.12, rBot: 2.12, h: 4, t0: -Math.PI / 2, len: Math.PI, y0: 0 });
    const pt = part(bc, torso, 'emblem', { drift: V(0, 0, 1) });
    const W = (g) => wrapGeo(g, s, 0.5, 2.0 / 4);
    const circ = (r, z0, z1, hole = 0) => { const sh = new THREE.Shape(); sh.absarc(0, 0, r, 0, Math.PI * 2, false); if (hole) { const h = new THREE.Path(); h.absarc(0, 0, hole, 0, Math.PI * 2, true); sh.holes.push(h); } return new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, z0); };
    pt.add('verd', W(circ(0.82, -0.5, 0.05)));
    pt.add('gold', W(circ(0.92, -0.2, 0.11, 0.8)));
    pt.add('gold', W(circ(0.34, 0.03, 0.14)));
    for (let k = 0; k < 12; k++) {
      const a = 15 * Math.PI / 180 + k * Math.PI / 6, c = Math.cos(a), sn = Math.sin(a);
      const P = (rr, t) => new THREE.Vector2(c * rr - sn * t, sn * rr + c * t);
      pt.add('gold', W(new THREE.ExtrudeGeometry(new THREE.Shape([P(0.4, -0.1), P(k % 2 ? 0.66 : 0.76, 0), P(0.4, 0.1)]), { depth: 0.08, bevelEnabled: false }).translate(0, 0, 0.03)));
    }
    pt.end();
  }
  vent(bc, torso, { pos: [0, 3.2, -1.05], dir: [0, 0.7, -1], r: 0.16, len: 0.35, small: true, joint: 'neck' });
  const neck = new THREE.Group(); neck.position.y = A.neckBase; torso.add(neck);
  R(neck, { y: 0.05, h: 0.9, rTop: 0.62, rBot: 0.72, n: 3, phase: 0.3, rivets: false, band: 0.1 });
  const head = new THREE.Group(); head.position.y = A.neckLen; neck.add(head);
  const skull = new THREE.Group(); skull.position.y = A.headUp; head.add(skull);
  const sk = mesh(bc, finish(new THREE.SphereGeometry(A.headR, 16, 10)), mats.verd, 'skull'); sk.userData.drift = V(0, 1, 0); skull.add(sk);
  // the round mask with a gold rim, rays around the slit, crest ridge, ear discs
  const Qz = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(0, 0, 1));
  const Rm = A.headR + 0.06, Am = 0.95;
  const maskS = sphSurf({ R: Rm, phi0: 0, phiLen: Math.PI * 2, thLo: Am, thHi: 0, quat: Qz });
  const mk = part(bc, skull, 'mask', { drift: V(0, 0, 1) });
  mk.add('verd', slabGeo(maskS, { thick: 0.1, su: 18, sv: 4 }));
  mk.add('gold', slabGeo(maskS, { thick: 0.12, bump: () => 0.05, su: 18, sv: 1, v0: -0.01, v1: 0.1 }));
  for (let k = 0; k < 16; k++) {
    const ph = (k + 0.5) * Math.PI * 2 / 16;
    if (Math.abs(Math.sin(ph)) < 0.35) continue;
    const rho0 = 1 / Math.sqrt((Math.sin(ph) / 0.3) ** 2 + (Math.cos(ph) / 0.8) ** 2) + 0.08, rho1 = (k % 2 ? 0.82 : 0.68) * Am * Rm;
    const v0 = 1 - rho0 / Rm / Am, v1 = 1 - rho1 / Rm / Am;
    mk.add('gold', ribbonGeo(maskS, (t) => [ph / (Math.PI * 2), v0 + (v1 - v0) * t], { n: 2, width: (t) => 0.08 - 0.04 * t, height: 0.035, caps: false }));
  }
  const Rc = A.headR + 0.03;
  const crestS = { P(u, v, off = 0) { const al = 0.62 - u * 2.4, rr = Rc + off; return V(0, rr * Math.cos(al), rr * Math.sin(al)); }, N(u) { const al = 0.62 - u * 2.4; return V(0, Math.cos(al), Math.sin(al)); }, du: Rc * 2.4, dv: 1 };
  mk.add('gold', ribbonGeo(crestS, (t) => [t, 0], { n: 10, width: 0.2, height: 0.32, base: -0.03 }));
  for (const s of [-1, 1]) {
    mk.add('verd', finish(new THREE.CylinderGeometry(0.42, 0.46, 0.26, 12).rotateZ(Math.PI / 2)).translate(s * 1.47, 0.05, -0.05));
    mk.add('gold', finish(new THREE.TorusGeometry(0.4, 0.06, 4, 12).rotateY(Math.PI / 2)).translate(s * 1.6, 0.05, -0.05));
  }
  mk.end();
  const halo = mesh(bc, patchGeo(sphSurf({ R: Rm, phi0: -0.09, phiLen: 0.18, thLo: Math.PI / 2 + 0.5, thHi: Math.PI / 2 - 0.5 }), { off: 0.012, su: 2, sv: 6 }), mats.halo, 'halo', mk.id);
  const slit = mesh(bc, patchGeo(sphSurf({ R: Rm, phi0: -0.045, phiLen: 0.09, thLo: Math.PI / 2 + 0.42, thHi: Math.PI / 2 - 0.42 }), { off: 0.025, su: 2, sv: 6 }), mats.slit, 'slit', mk.id);
  for (const m of [halo, slit]) { m.castShadow = false; m.userData.drift = V(0, 0, 0); skull.add(m); }

  const arms = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const pauld = new THREE.Group(); pauld.position.set(side * A.shoulderX, A.shoulderY, 0); pauld.rotation.z = -side * 0.35; torso.add(pauld);
    // shoulder scales: a cap and two lames fanning down and out
    const c = V(side * 0.15, 0.1, 0), out = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    const cap = part(bc, pauld, 'pauldron', { drift: V(side, 1, 0) });
    forgedPlate(cap, sphSurf({ R: 1.05, phi0: 0, phiLen: Math.PI * 2, thLo: 0.85, thHi: 0.02, centre: c }), { thick: 0.1, bu: 0, bv: 0.04, su: 12, sv: 3, band: 0.11, bandRaise: 0.04, rivets: false, drips: 0 });
    cap.end();
    [[1.13, 0.68, 1.15, 1.5], [1.21, 1.0, 1.45, 1.35]].forEach(([Rl, th0, th1, wf]) => {
      const w = wf * Math.PI;
      const lp = part(bc, pauld, 'pauldron', { drift: V(side, 0.2, 0) });
      forgedPlate(lp, sphSurf({ R: Rl, phi0: out - w / 2, phiLen: w, thLo: th1, thHi: th0, centre: c }), { thick: 0.09, bu: 0.03, bv: 0.04, su: 10, sv: 2, band: 0.11, bandRaise: 0.04, rivets: false, drips: 0 });
      lp.end();
    });
    vent(bc, pauld, { pos: c.clone().add(V(side * 0.3, 1.0, -0.4).normalize().multiplyScalar(1.1)).toArray(), dir: [side * 0.3, 1.0, -0.4], r: 0.16, len: 0.35, small: true, joint: 'shoulder', side: key });
    const upper = new THREE.Group(); upper.position.set(side * A.shoulderX, A.shoulderY, 0); torso.add(upper);
    ball(bc, upper, 0.55, [0, 0, 0], 10);
    R(upper, { y: -3.0, h: 2.3, rTop: 0.62, rBot: 0.52, n: 3, phase: 0.2 });
    const fore = new THREE.Group(); fore.position.y = -A.upperArm; upper.add(fore);
    ball(bc, fore, 0.5, [0, 0, 0], 10);
    R(fore, { y: -2.7, h: 2.1, rTop: 0.52, rBot: 0.56, n: 3, phase: 0.5 });
    vent(bc, fore, { pos: [0, -0.2, -0.55], dir: [0, 0.4, -1], r: 0.14, len: 0.3, small: true, joint: 'elbow', side: key });
    const hand = new THREE.Group(); hand.position.y = -A.foreArm; fore.add(hand);
    ball(bc, hand, 0.38, [0, 0, 0], 8);
    const hp = part(bc, hand, 'hand', { drift: V(0, 0, 1) });
    hp.add('verd', finish(new THREE.BoxGeometry(1.0, 0.95, 0.45).translate(0, -0.7, 0)));
    for (const x of [-0.36, -0.12, 0.12, 0.36]) {
      hp.add('dark', finish(new THREE.BoxGeometry(0.2, 0.42, 0.24).translate(x, -1.35, 0.02)));
      hp.add('verd', finish(new THREE.BoxGeometry(0.21, 0.36, 0.24).translate(0, -0.18, 0).rotateX(0.7).translate(x, -1.56, 0.02)));
    }
    hp.add('gold', finish(new THREE.BoxGeometry(1.04, 0.1, 0.5).translate(0, -1.12, 0)));
    hp.end();
    arms[key] = { upper, fore, hand };
  }
  const legs = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const thigh = new THREE.Group(); thigh.position.set(side * A.hipX, 0, 0); pelvis.add(thigh);
    ball(bc, thigh, 0.6, [0, 0, 0], 10);
    R(thigh, { y: -2.95, h: 2.4, rTop: 0.7, rBot: 0.58, n: 3, phase: 0.3 });
    const shin = new THREE.Group(); shin.position.y = -A.thigh; thigh.add(shin);
    ball(bc, shin, 0.52, [0, 0, 0], 10);
    R(shin, { y: -2.55, h: 2.0, rTop: 0.62, rBot: 0.6, n: 3, phase: 0.6 });
    const kq = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(0, 0, 1));
    const kp = part(bc, shin, 'poleyn', { drift: V(0, 0, 1) });
    forgedPlate(kp, sphSurf({ R: 0.58, phi0: 0, phiLen: Math.PI * 2, thLo: 0.9, thHi: 0, quat: kq, centre: V(0, -0.1, 0) }), { thick: 0.08, bu: 0, bv: 0.03, su: 10, sv: 2, band: 0.08, bandRaise: 0.03, rivets: false, drips: 0 });
    kp.end();
    vent(bc, shin, { pos: [side * 0.62, -0.2, 0.25], dir: [side * 1, 0.4, 0.4], r: 0.15, len: 0.3, small: true, joint: 'knee', side: key });
    const foot = new THREE.Group(); foot.position.y = -A.shin; shin.add(foot);
    ball(bc, foot, 0.42, [0, 0, 0], 8);
    const fp = part(bc, foot, 'sabaton', { drift: V(0, 1, 0) });
    fp.add('dark', finish(new THREE.BoxGeometry(1.1, 0.22, 2.0).translate(0, -0.59, 0.45)));
    const swap = (z0) => new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, -0.48, 0, 1, 0, z0, 0, 0, 0, 1);
    [[-0.55, 1.05, 0.55, 0.52], [0.42, 0.62, 0.5, 0.44], [0.98, 0.45, 0.42, 0.32]].forEach(([z0, len, rb, rf]) => {
      forgedPlate(fp, mapSurf(cylSurf({ rTop: rf, rBot: rb, h: len, t0: -Math.PI / 2, len: Math.PI }), swap(z0)), { thick: 0.08, bu: 0.03, bv: 0.02, su: 6, sv: 1, band: 0, topBand: 0.09, bandRaise: 0.03, rivets: false, drips: 0 });
    });
    fp.end();
    legs[key] = { thigh, shin, foot };
  }
  slit.material.color.set(SLIT_LIT); halo.material.color.set(HALO_LIT);

  const ik = makeIkTemps();
  const plan = PLANS[index];
  const yaw = Math.atan2(plan.dir.x, plan.dir.z);
  const _side = V(plan.dir.z, 0, -plan.dir.x);            // local +x in world (right-handed with +y up)
  const _ankle = V(0, 0, 0), _pole = V(0, 0, 0), _q = new THREE.Quaternion(), _qf = new THREE.Quaternion(), _fx = V(1, 0, 0);
  const rig = {
    root, meshes: bc.meshes, vents: bc.vents, triangles: countTriangles(root),
    /** Place and pose the automaton for a global frame (already held). */
    apply(fh) {
      const t = (fh - MAP.T.AUTOMATONS_START) / 24;
      const d = plan.speed * t;
      const S = plan.speed * plan.cycle;                  // stride per cycle
      const phL = ((d / S) % 1 + 1) % 1, phR = (phL + 0.5) % 1;
      root.position.copy(plan.from).addScaledVector(plan.dir, d);
      root.position.y = 0;
      root.rotation.y = yaw;
      pelvis.position.y = A.hipWalk - plan.bob * 0.5 + plan.bob * 0.5 * Math.cos(phL * Math.PI * 4 + Math.PI);   // heavy bob, lowest at each foot plant
      torso.rotation.set(0.08, 0.08 * Math.sin(phL * Math.PI * 2), 0.05 * Math.sin(phL * Math.PI * 2), 'YXZ');
      head.rotation.set(0.1, 0, 0);
      root.updateMatrixWorld(true);
      // arms swing opposite to the legs
      for (const key of ['L', 'R']) {
        const sgn = key === 'L' ? -1 : 1, side = key === 'L' ? 1 : -1;
        const fwd = sgn * 0.45 * Math.cos(phL * Math.PI * 2);
        arms[key].upper.rotation.set(-fwd, 0, side * 0.2, 'ZXY');
        arms[key].fore.rotation.set(-0.5, 0, 0);
      }
      root.updateMatrixWorld(true);
      for (const key of ['L', 'R']) {
        const ph = key === 'L' ? phL : phR, side = key === 'L' ? 1 : -1;
        let zOff, y, pitch;
        if (ph < 0.5) { const s = ph / 0.5; zOff = S / 4 - s * S / 2; y = A.ankleH; pitch = 0; }
        else { const s = (ph - 0.5) / 0.5; zOff = -S / 4 + smooth(s) * S / 2; y = A.ankleH + plan.lift * Math.sin(Math.PI * s); pitch = 0.35 * Math.sin(Math.PI * s); }
        // ankle in world: body position + lateral + along the path
        _ankle.copy(root.position).addScaledVector(_side, side * A.hipX).addScaledVector(plan.dir, zOff);
        _ankle.y = y;
        _pole.copy(plan.dir).add(V(0, 0.1, 0));
        _qf.setFromAxisAngle(_fx, pitch); _q.setFromAxisAngle(V(0, 1, 0), yaw).multiply(_qf);
        applyTwoBone(legs[key].thigh, legs[key].shin, A.thigh, A.shin, _ankle, _pole, legs[key].foot, _q, ik);
      }
      root.updateMatrixWorld(true);
    },
  };
  return rig;
}

export function buildAutomatons(ctx) {
  const mats = makeMaterials(ctx, { paintScale: 3, seed: 5 });
  const rigs = [];
  for (let i = 0; i < MAP.SMALL_AUTOMATONS.count; i++) rigs.push(buildAutomaton(ctx, i, mats));
  return rigs;
}

/** Shots in which the automatons are on screen. */
export function automatonsVisible(shotId) { return shotId === 28 || shotId === 29; }
