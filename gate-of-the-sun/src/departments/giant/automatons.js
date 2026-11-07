// Five small (14 m) automatons in the giant's design language, simplified. They appear at
// T.AUTOMATONS_START and walk toward the gate; two of them (A and B) are staged to step through the
// breach during shot 29. Pure function of the held frame, feet never below the ground.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import { makeMaterials, makeInk, mesh, ringPlates, boxPlate, ball, vent, spherePlate, countTriangles, SLIT_LIT, HALO_LIT } from './parts.js';
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
  const fast = 50 / (72 / 24);                        // A covers z -30 .. +20 during shot 29 (1608..1680)
  const plans = [];
  plans.push({ name: 'A', from: V(0, 0, -30 - fast * ((1608 - 1548) / 24)), dir: V(0, 0, 1), speed: fast, cycle: 0.6 });
  plans.push({ name: 'B', from: V(2.5, 0, -55 - fast * ((1608 - 1548) / 24)), dir: V(0, 0, 1), speed: fast, cycle: 0.6 });
  const targets = [[-4, 0, 0], [5, 0, 0], [-6, 0, 0]];
  for (let i = 2; i < 5; i++) {
    const from = V(S[i][0], 0, S[i][2]);
    const to = V(...targets[i - 2]);
    const dir = to.clone().sub(from).normalize();
    plans.push({ name: 'CDE'[i - 2], from, dir, speed: 4, cycle: 1.6 });
  }
  return plans;
}
export const PLANS = makePlans();

export function buildAutomaton(ctx, index, mats) {
  const { ID, LAYER, tag } = ctx;
  const bc = { mats, ink: makeInk(ID.AUTOMATON_MIN, ID.AUTOMATON_MAX), tag, layer: LAYER.FG, meshes: [], vents: [], name: 'automaton' + index };
  // offset the ink cycle per automaton so neighbours differ
  for (let i = 0; i < index * 3; i++) bc.ink.next();

  const root = new THREE.Group(); root.name = 'automaton' + index;
  const body = new THREE.Group(); root.add(body);                       // yaw + bob
  const pelvis = new THREE.Group(); pelvis.position.y = A.hipWalk; body.add(pelvis);
  ringPlates(bc, pelvis, { y: -0.8, h: 1.1, rTop: 1.35, rBot: 1.55, n: 3, phase: 0.5, rim: 0.07, segs: 5 });
  const torso = new THREE.Group(); pelvis.add(torso);
  ringPlates(bc, torso, { y: 0.3, h: 1.1, rTop: 1.25, rBot: 1.5, n: 4, phase: 0.2, rim: 0.07, segs: 5 });
  ringPlates(bc, torso, { y: 1.3, h: 1.3, rTop: 1.7, rBot: 1.95, n: 4, phase: 0.6, rim: 0.07, segs: 5 });
  ringPlates(bc, torso, { y: 2.55, h: 0.75, rTop: 1.25, rBot: 1.6, n: 3, phase: 0.1, rim: 0.07, segs: 5 });
  vent(bc, torso, { pos: [0, 3.2, -0.6], dir: [0, 0.7, -1], r: 0.16, len: 0.35, small: true, joint: 'neck' });
  const neck = new THREE.Group(); neck.position.y = A.neckBase; torso.add(neck);
  ringPlates(bc, neck, { y: 0.05, h: 0.9, rTop: 0.62, rBot: 0.7, n: 3, phase: 0.3, rim: 0.06, segs: 4 });
  const head = new THREE.Group(); head.position.y = A.neckLen; neck.add(head);
  const skull = new THREE.Group(); skull.position.y = A.headUp; head.add(skull);
  const sk = mesh(bc, new THREE.SphereGeometry(A.headR, 18, 12), mats.verd, 'skull'); skull.add(sk);
  spherePlate(bc, skull, { r: A.headR + 0.06, phiC: Math.PI / 2, phiW: 1.4, thetaC: Math.PI / 2, thetaW: 1.8, segs: 8 });
  const crown = mesh(bc, new THREE.TorusGeometry(A.headR * Math.sin(0.5), 0.08, 5, 16), mats.gold, 'crown'); crown.rotation.x = Math.PI / 2; crown.position.y = A.headR * Math.cos(0.5); skull.add(crown);
  const halo = spherePlate(bc, skull, { r: A.headR + 0.08, phiC: Math.PI / 2, phiW: 0.2, thetaC: Math.PI / 2, thetaW: 0.95, mat: mats.halo, name: 'halo', inkId: sk.userData.inkId, segs: 3, segsH: 8, drift: false });
  const slit = spherePlate(bc, skull, { r: A.headR + 0.1, phiC: Math.PI / 2, phiW: 0.1, thetaC: Math.PI / 2, thetaW: 0.8, mat: mats.slit, name: 'slit', inkId: sk.userData.inkId, segs: 3, segsH: 8, drift: false });
  halo.castShadow = false; slit.castShadow = false;

  const arms = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const pauld = new THREE.Group(); pauld.position.set(side * A.shoulderX, A.shoulderY, 0); pauld.rotation.z = -side * 0.35; torso.add(pauld);
    spherePlate(bc, pauld, { r: 1.0, phiC: 0, phiW: Math.PI * 1.96, thetaC: 0.55, thetaW: 1.1, segs: 12 });
    vent(bc, pauld, { pos: [side * 0.3, 0.85, -0.45], dir: [side * 0.4, 0.8, -0.8], r: 0.16, len: 0.35, small: true, joint: 'shoulder', side: key });
    const upper = new THREE.Group(); upper.position.set(side * A.shoulderX, A.shoulderY, 0); torso.add(upper);
    ball(bc, upper, 0.55, [0, 0, 0], 12);
    ringPlates(bc, upper, { y: -3.0, h: 2.3, rTop: 0.6, rBot: 0.5, n: 3, phase: 0.2, rim: 0.06, segs: 5 });
    const fore = new THREE.Group(); fore.position.y = -A.upperArm; upper.add(fore);
    ball(bc, fore, 0.5, [0, 0, 0], 12);
    ringPlates(bc, fore, { y: -2.7, h: 2.1, rTop: 0.5, rBot: 0.42, n: 3, phase: 0.5, rim: 0.06, segs: 5 });
    vent(bc, fore, { pos: [0, -0.2, -0.5], dir: [0, 0.4, -1], r: 0.14, len: 0.3, small: true, joint: 'elbow', side: key });
    const hand = new THREE.Group(); hand.position.y = -A.foreArm; fore.add(hand);
    ball(bc, hand, 0.38, [0, 0, 0], 10);
    boxPlate(bc, hand, { w: 1.0, h: 1.3, d: 0.5, pos: [0, -0.8, 0], rim: 0.05, rims: false });
    arms[key] = { upper, fore, hand };
  }
  const legs = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const thigh = new THREE.Group(); thigh.position.set(side * A.hipX, 0, 0); pelvis.add(thigh);
    ball(bc, thigh, 0.6, [0, 0, 0], 12);
    ringPlates(bc, thigh, { y: -2.9, h: 2.3, rTop: 0.65, rBot: 0.55, n: 3, phase: 0.3, rim: 0.06, segs: 5 });
    const shin = new THREE.Group(); shin.position.y = -A.thigh; thigh.add(shin);
    ball(bc, shin, 0.52, [0, 0, 0], 12);
    ringPlates(bc, shin, { y: -2.5, h: 1.9, rTop: 0.55, rBot: 0.48, n: 3, phase: 0.6, rim: 0.06, segs: 5 });
    vent(bc, shin, { pos: [side * 0.15, -0.2, 0.5], dir: [side * 0.3, 0.4, 1], r: 0.15, len: 0.3, small: true, joint: 'knee', side: key });
    const foot = new THREE.Group(); foot.position.y = -A.shin; shin.add(foot);
    ball(bc, foot, 0.42, [0, 0, 0], 10);
    boxPlate(bc, foot, { w: 1.1, h: 2.0, d: 0.7, pos: [0, -0.35, 0.45], rot: [-Math.PI / 2, 0, 0], rim: 0.06 });
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
      pelvis.position.y = A.hipWalk + 0.12 * Math.sin(phL * Math.PI * 4);
      torso.rotation.set(0.06, 0.05 * Math.sin(phL * Math.PI * 2), 0.03 * Math.sin(phL * Math.PI * 2), 'YXZ');
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
        else { const s = (ph - 0.5) / 0.5; zOff = -S / 4 + smooth(s) * S / 2; y = A.ankleH + 0.9 * Math.sin(Math.PI * s); pitch = 0.35 * Math.sin(Math.PI * s); }
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
  const mats = makeMaterials(ctx);
  const rigs = [];
  for (let i = 0; i < MAP.SMALL_AUTOMATONS.count; i++) rigs.push(buildAutomaton(ctx, i, mats));
  return rigs;
}

/** Shots in which the automatons are on screen. */
export function automatonsVisible(shotId) { return shotId === 28 || shotId === 29; }
