// The 90 m bronze automaton: FK hierarchy of Groups (no SkinnedMesh), plates with gold rims,
// ball joints, steam vents. buildGiant returns a rig with apply(pose) used by index.js every frame.
import * as THREE from 'three';
import { makeMaterials, makeInk, mesh, ringPlates, boxPlate, ball, vent, spherePlate, countTriangles, SLIT_LIT, SLIT_DARK, HALO_LIT, HALO_DARK } from './parts.js';
import { applyTwoBone, makeIkTemps, setWorldQuaternion } from './ik.js';

// Proportions (metres, standing). Hips 41.5, thigh 20, shin 17, ankle 5.51 above the sole.
export const G = {
  hipY: 41.5, hipX: 7, thigh: 20, shin: 17, ankleH: 5.51,
  shoulderX: 14, shoulderY: 22, upperArm: 25, foreArm: 23,
  neckBase: 24.5, neckSeg: 2.3, headPivot: 2.4, headR: 9, headUp: 9,  // head centre = hips + 24.5 + 2.3*2 + 2.4 + 9 = 82
  footCentre: new THREE.Vector3(0, -3, 3),                           // foot box centre relative to the ankle (foot frame)
};

function buildHand(bc, hand, side) {
  // local frame: origin at the wrist, fingers along -y, back of the hand +z, palm side -z.
  // At the wall slam the hand lies flat: palm on the merlon tops (z -6..4.5), knuckles over the
  // town side edge and the finger tips hooked down the town face (z 6.4..8.6).
  ball(bc, hand, 2.4, [0, 0, 0], 16);
  boxPlate(bc, hand, { w: 8, h: 10.5, d: 3.4, pos: [0, -5.75, -4.1], rim: 0.3 });
  const xs = [-3.0, -1.0, 1.0, 3.0];
  for (let i = 0; i < 4; i++) {
    const x = xs[i];
    const v = (i - 1.5) * 0.06;
    ball(bc, hand, 1.5, [x, -11.2, -1.2 + v], 12);
    boxPlate(bc, hand, { w: 1.7, h: 2.4, d: 2.2, pos: [x, -12.5, -1.4 + v], rim: 0.18 });
    ball(bc, hand, 1.3, [x, -13.9, -1.4 + v], 12);
    boxPlate(bc, hand, { w: 1.7, h: 2.4, d: 9.5, pos: [x, -14.0, -6.4 + v], rim: 0.18 });
  }
  vent(bc, hand, { pos: [side * 2.5, -9, -2.4], dir: [side * 0.25, 0.1, 1], r: 0.7, len: 1.4, joint: 'knuckle', side: side > 0 ? 'L' : 'R' });
  vent(bc, hand, { pos: [-side * 2.5, -9, -2.4], dir: [-side * 0.25, 0.1, 1], r: 0.7, len: 1.4, joint: 'knuckle', side: side > 0 ? 'L2' : 'R2' });
}

function buildFoot(bc, foot, side) {
  ball(bc, foot, 2.6, [0, 0, 0], 16);
  boxPlate(bc, foot, { w: 7, h: 12, d: 5, pos: [0, -3, 2], rot: [-Math.PI / 2, 0, 0], rim: 0.3, drift: new THREE.Vector3(0, 1, 0) });
  boxPlate(bc, foot, { w: 6.2, h: 3.0, d: 2.8, pos: [0, -3.6, 9.4], rim: 0.22 });
  // ankle shroud plates
  ringPlates(bc, foot, { y: -0.6, h: 2.2, rTop: 3.2, rBot: 3.6, n: 3, phase: 0.4, rim: 0.25, core: false });
  vent(bc, foot, { pos: [0, -0.4, -3.1], dir: [0, 0.35, -1], r: 0.8, len: 1.6, joint: 'ankle', side: side > 0 ? 'L' : 'R' });
}

function buildHead(bc, head) {
  const skull = new THREE.Group(); skull.position.y = G.headUp; head.add(skull);
  const base = mesh(bc, new THREE.SphereGeometry(G.headR, 28, 18), bc.mats.verd, 'skull');
  base.userData.drift = new THREE.Vector3(0, 1, 0); skull.add(base);
  const r = G.headR;
  // face plate and its gold frame
  spherePlate(bc, skull, { r: r + 0.3, phiC: Math.PI / 2, phiW: 1.5, thetaC: Math.PI / 2, thetaW: 1.9, segs: 12 });
  for (const s of [-1, 1]) spherePlate(bc, skull, { r: r + 0.45, phiC: Math.PI / 2 + s * 0.75, phiW: 0.12, thetaC: Math.PI / 2, thetaW: 1.9, mat: bc.mats.gold, name: 'rim', segs: 3, segsH: 12 });
  for (const s of [-1, 1]) spherePlate(bc, skull, { r: r + 0.45, phiC: Math.PI / 2, phiW: 1.62, thetaC: Math.PI / 2 + s * 0.95, thetaW: 0.1, mat: bc.mats.gold, name: 'rim', segs: 12, segsH: 2 });
  // brow plate overlapping the face top, with a gold lower edge
  spherePlate(bc, skull, { r: r + 0.6, phiC: Math.PI / 2, phiW: 2.0, thetaC: 0.72, thetaW: 0.55, segs: 12 });
  spherePlate(bc, skull, { r: r + 0.75, phiC: Math.PI / 2, phiW: 2.0, thetaC: 1.0, thetaW: 0.1, mat: bc.mats.gold, name: 'rim', segs: 12, segsH: 2 });
  // cheek plates
  for (const s of [-1, 1]) spherePlate(bc, skull, { r: r + 0.35, phiC: Math.PI / 2 + s * 1.3, phiW: 0.8, thetaC: 1.8, thetaW: 1.0, segs: 8 });
  // back plates
  spherePlate(bc, skull, { r: r + 0.25, phiC: -Math.PI / 2, phiW: 2.2, thetaC: 1.35, thetaW: 1.5, segs: 12 });
  // crown ring and finial, jaw ring
  const crown = mesh(bc, new THREE.TorusGeometry(r * Math.sin(0.45), 0.42, 6, 28), bc.mats.gold, 'crown');
  crown.rotation.x = Math.PI / 2; crown.position.y = r * Math.cos(0.45); crown.userData.drift = new THREE.Vector3(0, 1, 0); skull.add(crown);
  const fin = ball(bc, skull, 1.5, [0, r + 0.6, 0], 12); fin.userData.drift.set(0, 1, 0);
  const jaw = mesh(bc, new THREE.TorusGeometry(r * Math.sin(2.35), 0.42, 6, 28), bc.mats.gold, 'jaw');
  jaw.rotation.x = Math.PI / 2; jaw.position.y = r * Math.cos(2.35); jaw.userData.drift = new THREE.Vector3(0, -1, 0); skull.add(jaw);
  // the slit: bright flat sector in front, darker wider halo behind it
  const halo = spherePlate(bc, skull, { r: r + 0.36, phiC: Math.PI / 2, phiW: 0.19, thetaC: Math.PI / 2, thetaW: 0.98, mat: bc.mats.halo, name: 'halo', inkId: base.userData.inkId, segs: 3, segsH: 12, drift: false });
  const slit = spherePlate(bc, skull, { r: r + 0.42, phiC: Math.PI / 2, phiW: 0.09, thetaC: Math.PI / 2, thetaW: 0.8, mat: bc.mats.slit, name: 'slit', inkId: base.userData.inkId, segs: 3, segsH: 10, drift: false });
  halo.castShadow = false; slit.castShadow = false;
  halo.userData.drift = new THREE.Vector3(0, 0, 1); slit.userData.drift = new THREE.Vector3(0, 0, 1);
  return { slit, halo };
}

export function buildGiant(ctx) {
  const { MAP, ID, LAYER, tag } = ctx;
  const mats = makeMaterials(ctx);
  const bc = { mats, ink: makeInk(ID.GIANT_MIN, ID.GIANT_MAX), tag, layer: LAYER.FG, meshes: [], vents: [], name: 'giant' };

  const root = new THREE.Group(); root.name = 'giant';
  const pelvis = new THREE.Group(); pelvis.name = 'giant.pelvis'; pelvis.position.y = G.hipY; root.add(pelvis);
  ringPlates(bc, pelvis, { y: -4.5, h: 6, rTop: 8.4, rBot: 9.6, n: 4, phase: Math.PI / 4, rim: 0.34 });
  boxPlate(bc, pelvis, { w: 6, h: 5, d: 1.4, pos: [0, -2.5, 9.6], rim: 0.3 });

  const torso = new THREE.Group(); torso.name = 'giant.torso'; pelvis.add(torso);
  ringPlates(bc, torso, { y: 1.5, h: 5.5, rTop: 7.8, rBot: 9.0, n: 5, phase: 0.3 });
  ringPlates(bc, torso, { y: 6.5, h: 5.5, rTop: 9.6, rBot: 11.4, n: 6, phase: 0.0 });
  ringPlates(bc, torso, { y: 11.5, h: 6, rTop: 11.0, rBot: 12.4, n: 6, phase: Math.PI / 6 });
  ringPlates(bc, torso, { y: 17, h: 5.5, rTop: 10.4, rBot: 11.8, n: 6, phase: 0.0 });
  ringPlates(bc, torso, { y: 22, h: 3, rTop: 8.6, rBot: 9.8, n: 4, phase: Math.PI / 4 });
  boxPlate(bc, torso, { w: 9, h: 7, d: 1.4, pos: [0, 14.5, 11.9], rim: 0.3 });                 // pectoral plate
  const sunDisc = mesh(bc, new THREE.CylinderGeometry(2.4, 2.4, 0.5, 20), mats.gold, 'emblem');
  sunDisc.rotation.x = Math.PI / 2; sunDisc.position.set(0, 14.5, 12.8); sunDisc.userData.drift = new THREE.Vector3(0, 0, 1); torso.add(sunDisc);
  for (const s of [-1, 1]) vent(bc, torso, { pos: [s * 3.6, 24.2, -3.2], dir: [s * 0.35, 0.6, -1], r: 1.0, len: 2.0, joint: 'neck', side: s > 0 ? 'L' : 'R' });

  // neck: three segments, each takes a share of the head pitch and yaw
  const neck1 = new THREE.Group(); neck1.position.y = G.neckBase; torso.add(neck1);
  const neck2 = new THREE.Group(); neck2.position.y = G.neckSeg; neck1.add(neck2);
  const neck3 = new THREE.Group(); neck3.position.y = G.neckSeg; neck2.add(neck3);
  const head = new THREE.Group(); head.name = 'giant.head'; head.position.y = G.headPivot; neck3.add(head);
  for (const [n, ph] of [[neck1, 0], [neck2, 0.5], [neck3, 1.0]]) ringPlates(bc, n, { y: 0.1, h: 2.1, rTop: 4.0, rBot: 4.5, n: 3, phase: ph, rim: 0.3 });
  const neckCore = mesh(bc, new THREE.CylinderGeometry(3.4, 3.6, 10, 12), mats.dark, 'neckcore'); neckCore.position.y = 4; neckCore.userData.drift = new THREE.Vector3(0, 0, 0); neck1.add(neckCore);
  const { slit, halo } = buildHead(bc, head);

  // shoulders, arms
  const arms = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const pauld = new THREE.Group(); pauld.position.set(side * G.shoulderX, G.shoulderY, 0); pauld.rotation.z = -side * 0.35; torso.add(pauld);
    spherePlate(bc, pauld, { r: 6.6, phiC: 0, phiW: Math.PI * 1.96, thetaC: 0.55, thetaW: 1.1, segs: 20 });
    const prim = mesh(bc, new THREE.TorusGeometry(6.6 * Math.sin(1.1), 0.4, 6, 24), mats.gold, 'rim'); prim.rotation.x = Math.PI / 2; prim.position.y = 6.6 * Math.cos(1.1); prim.userData.drift = new THREE.Vector3(0, 1, 0); pauld.add(prim);
    vent(bc, pauld, { pos: [side * 2.0, 5.6, -3.0], dir: [side * 0.4, 0.8, -0.8], r: 1.0, len: 2.0, joint: 'shoulder', side: key });

    const upper = new THREE.Group(); upper.name = 'giant.upperArm' + key; upper.position.set(side * G.shoulderX, G.shoulderY, 0); torso.add(upper);
    ball(bc, upper, 3.6, [0, 0, 0], 20);
    ringPlates(bc, upper, { y: -11.5, h: 7.5, rTop: 3.8, rBot: 3.5, n: 4, phase: 0.2 });
    ringPlates(bc, upper, { y: -20, h: 7.5, rTop: 3.5, rBot: 3.2, n: 4, phase: 0.6 });
    const ucore = mesh(bc, new THREE.CylinderGeometry(3.0, 2.9, 22, 12), mats.dark, 'armcore'); ucore.position.y = -13; ucore.userData.drift = new THREE.Vector3(0, 0, 0); upper.add(ucore);
    const fore = new THREE.Group(); fore.name = 'giant.foreArm' + key; fore.position.y = -G.upperArm; upper.add(fore);
    ball(bc, fore, 3.2, [0, 0, 0], 18);
    ringPlates(bc, fore, { y: -10.5, h: 7, rTop: 3.3, rBot: 3.0, n: 4, phase: 0.1 });
    ringPlates(bc, fore, { y: -19.5, h: 8, rTop: 3.0, rBot: 2.75, n: 4, phase: 0.5 });
    const fcore = mesh(bc, new THREE.CylinderGeometry(2.7, 2.5, 21, 12), mats.dark, 'armcore'); fcore.position.y = -12; fcore.userData.drift = new THREE.Vector3(0, 0, 0); fore.add(fcore);
    vent(bc, fore, { pos: [0, -1.4, -3.3], dir: [0, 0.45, -1], r: 0.85, len: 1.7, joint: 'elbow', side: key });
    const hand = new THREE.Group(); hand.name = 'giant.hand' + key; hand.position.y = -G.foreArm; fore.add(hand);
    buildHand(bc, hand, side);
    arms[key] = { upper, fore, hand };
  }

  // legs
  const legs = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const thigh = new THREE.Group(); thigh.name = 'giant.thigh' + key; thigh.position.set(side * G.hipX, 0, 0); pelvis.add(thigh);
    ball(bc, thigh, 3.6, [0, 0, 0], 20);
    ringPlates(bc, thigh, { y: -11, h: 7, rTop: 4.0, rBot: 3.7, n: 4, phase: 0.3 });
    ringPlates(bc, thigh, { y: -18.5, h: 6.5, rTop: 3.7, rBot: 3.4, n: 4, phase: 0.7 });
    const tcore = mesh(bc, new THREE.CylinderGeometry(3.2, 3.1, 18, 12), mats.dark, 'legcore'); tcore.position.y = -10.5; tcore.userData.drift = new THREE.Vector3(0, 0, 0); thigh.add(tcore);
    vent(bc, thigh, { pos: [side * 3.3, -1.0, -0.5], dir: [side * 1, 0.35, -0.2], r: 0.9, len: 1.8, joint: 'hip', side: key });
    const shin = new THREE.Group(); shin.name = 'giant.shin' + key; shin.position.y = -G.thigh; thigh.add(shin);
    ball(bc, shin, 3.3, [0, 0, 0], 18);
    ringPlates(bc, shin, { y: -9.5, h: 6, rTop: 3.5, rBot: 3.2, n: 4, phase: 0.2 });
    ringPlates(bc, shin, { y: -15, h: 5, rTop: 3.2, rBot: 3.0, n: 4, phase: 0.6 });
    const score = mesh(bc, new THREE.CylinderGeometry(2.9, 2.7, 15, 12), mats.dark, 'legcore'); score.position.y = -9; score.userData.drift = new THREE.Vector3(0, 0, 0); shin.add(score);
    vent(bc, shin, { pos: [side * 1.0, -1.2, 3.1], dir: [side * 0.3, 0.4, 1], r: 0.9, len: 1.8, joint: 'knee', side: key });
    const foot = new THREE.Group(); foot.name = 'giant.foot' + key; foot.position.y = -G.shin; shin.add(foot);
    buildFoot(bc, foot, side);
    legs[key] = { thigh, shin, foot };
  }

  // remember rest positions for the dissolve drift and give every plate a deterministic seed
  const drifters = [];
  root.traverse((o) => { if (o.isMesh && o.userData.drift) { o.userData.rest = o.position.clone(); o.userData.seed = MAP.hash1(drifters.length * 3.7 + 11); drifters.push(o); } });

  const ik = makeIkTemps();
  const litA = new THREE.Color(SLIT_LIT), darkA = new THREE.Color(SLIT_DARK), litB = new THREE.Color(HALO_LIT), darkB = new THREE.Color(HALO_DARK);
  const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

  const rig = {
    root, pelvis, torso, head, neck: [neck1, neck2, neck3], arms, legs, slit, halo, meshes: bc.meshes, vents: bc.vents, mats,
    triangles: countTriangles(root),
    /** Apply a pose (see poses.js for the shape). */
    apply(pose) {
      root.position.set(pose.root[0], pose.root[1], pose.root[2]);
      pelvis.position.set(pose.hips.x - pose.root[0], pose.hips.y - pose.root[1], pose.hips.z - pose.root[2]);
      pelvis.rotation.set(0, pose.hipsYaw || 0, 0);
      torso.rotation.set(pose.torso.pitch, pose.torso.yaw, pose.torso.roll, 'YXZ');
      const np = pose.head.pitch / 4, ny = pose.head.yaw / 4, nr = (pose.head.roll || 0) / 4;
      for (const n of [neck1, neck2, neck3, head]) n.rotation.set(np, ny, nr, 'YXZ');
      root.updateMatrixWorld(true);
      for (const key of ['L', 'R']) {
        const a = pose.arms[key], arm = arms[key], side = key === 'L' ? 1 : -1;
        if (a.ik) {
          let target = a.ik.wrist;
          if (a.ik.wristRel) { arm.upper.getWorldPosition(_v); target = _v.add(a.ik.wristRel); }
          applyTwoBone(arm.upper, arm.fore, G.upperArm, G.foreArm, target, a.ik.pole, arm.hand, a.ik.handQuat, ik);
        } else {
          arm.upper.rotation.set(-a.fk.forward, a.fk.twist || 0, side * a.fk.out, 'ZXY');
          arm.fore.rotation.set(-(a.fk.elbow || 0), 0, 0);
          arm.hand.rotation.set(-(a.fk.handPitch || 0), 0, side * (a.fk.handRoll || 0), 'XYZ');
          arm.upper.updateMatrixWorld(true);
        }
      }
      for (const key of ['L', 'R']) {
        const l = pose.legs[key], leg = legs[key];
        applyTwoBone(leg.thigh, leg.shin, G.thigh, G.shin, l.ankle, l.pole, leg.foot, l.footQuat, ik);
      }
      // slit glow
      const s = pose.slit, pulse = pose.pulse || 0;
            halo.material.color.lerpColors(darkB, litB, s * (0.75 + 0.25 * pulse));
      slit.material.color.lerpColors(darkA, litA, s * (0.82 + 0.18 * pulse));
      // dissolve drift
      const t = pose.drift || 0;
      for (const o of drifters) {
        if (t <= 0) { o.position.copy(o.userData.rest); continue; }
        const k = o.userData.seed;
        o.position.copy(o.userData.rest).addScaledVector(o.userData.drift, 3 * t * (0.5 + k)).addScaledVector(_up, 6 * t * (0.4 + 0.6 * MAP.hash1(k * 91)));
      }
      root.updateMatrixWorld(true);
    },
    /** World position of a foot box centre from an ankle position and foot quaternion. */
    footCentreFromAnkle(ankle, q, out) { return out.copy(G.footCentre).applyQuaternion(q).add(ankle); },
    ankleFromFootCentre(centre, q, out) { return out.copy(G.footCentre).applyQuaternion(q).multiplyScalar(-1).add(centre); },
  };
  return rig;
}
