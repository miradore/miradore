// Giant poses as a pure function of the (held) frame. Returns null when the giant is hidden.
// World frame: feet at MAP.GIANT.feet, facing +z (town). The giant's left is +x.
// Arms and legs are posed through two bone IK: wrists either absolute (wrist) or relative to the
// shoulder joint in world axes (wristRel); ankles absolute. Everything else is FK angles.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import { G } from './giant.js';

const { hold, lerp, smooth, clamp, remap } = MAP;
const FEET = MAP.GIANT.feet;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();

// hand lying flat, fingers toward +z, back of the hand up
export const HAND_FLAT = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(V(1, 0, 0), V(0, 0, -1), V(0, 1, 0)));
// hands hanging, palms toward the body
const HANG = { L: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2), R: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -Math.PI / 2) };
export const Q_ID = new THREE.Quaternion();

function footQuat(pitch) { return new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), pitch); }
function armRel(side, x, y, z, pole, q) { return { ik: { wristRel: V(side * x, y, z), pole: V(pole[0] * side, pole[1], pole[2]).normalize(), handQuat: q || HANG[side > 0 ? 'L' : 'R'] } }; }
function armAbs(side, p, pole, q) { return { ik: { wrist: p, pole: V(pole[0] * side, pole[1], pole[2]).normalize(), handQuat: q || HANG[side > 0 ? 'L' : 'R'] } }; }

const STAND_ARM = [4, -45, 8], STAND_POLE = [0.25, 0, -1];
const KNEE_WRIST = (side) => V(side * 11, 15.5, -27);

function base() {
  return {
    root: [FEET[0], FEET[1], FEET[2]],
    hips: V(FEET[0], G.hipY, FEET[2]), hipsYaw: 0,
    torso: { pitch: 0, yaw: 0, roll: 0 },
    head: { pitch: 0, yaw: 0, roll: 0 },
    arms: { L: armRel(1, ...STAND_ARM, STAND_POLE), R: armRel(-1, ...STAND_ARM, STAND_POLE) },
    legs: {
      L: { ankle: V(FEET[0] + G.hipX, G.ankleH, FEET[2]), pole: V(0, 0.05, 1), footQuat: Q_ID },
      R: { ankle: V(FEET[0] - G.hipX, G.ankleH, FEET[2]), pole: V(0, 0.05, 1), footQuat: Q_ID },
    },
    slit: 1, pulse: 0, opacity: 1, drift: 0,
  };
}

function pulseAt(fh) { return 0.5 + 0.5 * Math.sin((fh / 24) * Math.PI * 2 * 0.9); }
function breathe(p, fh, amp = 1) {
  // about 0.3 m of sway at the head on a 3 s cycle (0.3 m over a 40 m lever is 0.0075 rad)
  p.torso.pitch += 0.0075 * amp * Math.sin((fh / 24) * Math.PI * 2 / 3);
  p.torso.roll += 0.004 * amp * Math.sin((fh / 24) * Math.PI * 2 / 4.2 + 1.3);
}

// crouch behind the wall (shot 12 and the start of 14). u = 0 deep crouch, u = 1 standing.
function crouch(p, u) {
  p.hips.set(FEET[0], lerp(20, G.hipY, u), FEET[2]);
  p.torso.pitch = lerp(0.61, 0, u);
  p.head.pitch = lerp(1.3, 0, u);
  p.legs.L.pole.set(0, 0.1, 1); p.legs.R.pole.set(0, 0.1, 1);
}
// hands on the knees blending to hanging arms as the giant stands
function crouchArms(p, u) {
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const standWrist = V(side * (G.shoulderX + STAND_ARM[0]), G.hipY + G.shoulderY + STAND_ARM[1], FEET[2] + STAND_ARM[2]);
    const wrist = KNEE_WRIST(side).lerp(standWrist, u);
    const pole = V(side * 1, 0.2, -0.4).lerp(V(side * STAND_POLE[0], 0, -1), u);
    const q = HAND_FLAT.clone().slerp(HANG[key], u);
    p.arms[key] = armAbs(side, wrist, [pole.x * side, pole.y, pole.z], q);
  }
}

// keyframe helper: keys [[f, value...], ...], linear between keys (poses are held on 2s anyway)
function key(keys, f) {
  if (f <= keys[0][0]) return keys[0].slice(1);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (f >= a[0] && f <= b[0]) {
      const t = (f - a[0]) / Math.max(1, b[0] - a[0]);
      return a.slice(1).map((v, j) => lerp(v, b[j + 1], t));
    }
  }
  return keys[keys.length - 1].slice(1);
}

// Kick keys: local f, foot centre xyz, foot pitch, knee pole xyz, hips xyz, torso pitch, torso roll,
// left wrist offset xyz (from the shoulder), right wrist offset xyz.
const KICK = [
  [0, -7, 20, -75, 1.05, 0, -0.8, 0.6, 3, 40.5, -46, -0.2, -0.1, 17, -35, -14, -17, -35, -14],
  [2, -7, 21.5, -77.5, 1.15, 0, -0.8, 0.6, 3, 40.8, -46.5, -0.25, -0.1, 17, -34, -16, -17, -34, -16],
  [4, -6, 18, -60, 0.6, 0, -0.2, 1, 2.5, 38.5, -43, -0.15, -0.08, 16, -34, -4, -16, -33, -18],
  [6, -3, 14, -32, 0.15, 0, 0.6, 0.8, 1.5, 34, -36, 0.0, -0.04, 15, -33, 8, -15, -31, -21],
  [8, 0, 12, 0, 0, 0, 0.9, 0.45, 0, 30, -30, -0.1, 0, 14, -33, 14, -14, -30, -22],
  [10, 0, 12, 5, 0, 0, 0.9, 0.45, 0, 29.5, -29, -0.08, 0, 14, -33, 14, -14, -30, -22],
  [12, 0, 12, 7.5, 0, 0, 0.9, 0.45, 0, 29, -28, -0.06, 0, 14, -33, 14, -14, -30, -22],
];

function applyKick(p, k) {
  const [cx, cy, cz, pitch, px, py, pz, hx, hy, hz, tp, tr, lx, ly, lz, rx, ry, rz] = k;
  const q = footQuat(pitch);
  const centre = V(cx, cy, cz);
  p.legs.R.ankle.copy(G.footCentre).applyQuaternion(q).multiplyScalar(-1).add(centre);
  p.legs.R.pole.set(px, py, pz);
  p.legs.R.footQuat = q;
  p.hips.set(hx, hy, hz);
  p.torso.pitch = tp; p.torso.roll = tr;
  p.arms.L = armRel(1, lx, ly, lz, [0.8, 0.2, -0.6]);
  p.arms.R = armRel(-1, -rx, ry, rz, [0.8, 0.2, -0.6]);
  p.head.pitch = 0.436; p.head.yaw = 0.08;
}

/** Returns the pose for a frame, or null when the giant is hidden in that shot. */
export function giantPose(frame, info) {
  const fh = hold(frame, 2);
  const shot = info.shotId;
  const lf = fh - info.shot.start;
  const p = base();
  p.pulse = pulseAt(fh);

  switch (shot) {
    case 12: {
      // crouched behind the wall, left hand slams onto the wall top at local f4
      crouch(p, 0); crouchArms(p, 0);
      p.torso.roll = -0.15; p.head.yaw = 0.35;
      const u = clamp(lf / 4, 0, 1);
      const wrist = V(MAP.GIANT.handImpact[0], 58.85, -6.5);
      wrist.y += 28 * (1 - u);
      const settle = clamp((lf - 4) / 2, 0, 1);
      const pole = V(-0.2, 1, -0.3 - 0.25 * settle).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.9 * (1 - u)).multiply(HAND_FLAT);
      p.arms.L = { ik: { wrist, pole, handQuat: q } };
      p.hips.y -= 0.5 * (lf === 4 ? 1 : lf === 6 ? 0.5 : 0);
      p.slit = 0;
      return p;
    }
    case 14: {
      const u = smooth(lf / 84);
      crouch(p, u); crouchArms(p, u);
      p.slit = remap(fh, MAP.T.HEAD_RISE_START + 40, MAP.T.HEAD_RISE_START + 48);
      return p;
    }
    case 15: { breathe(p, fh); return p; }
    case 18: {
      breathe(p, fh);
      const u = smooth(lf / 60);
      p.head.pitch = 0.436 * u; p.head.yaw = 0.08 * u;
      return p;
    }
    case 19: {
      p.head.pitch = 0.436; p.head.yaw = 0.08;
      const u = lf / 48;
      // phase 1: foot lifts and draws up; phase 2: cocks back
      const u1 = smooth(clamp(u / 0.5, 0, 1)), u2 = smooth(clamp((u - 0.5) / 0.5, 0, 1));
      const c0 = V(-G.hipX, G.ankleH, FEET[2]).add(G.footCentre), c1 = V(-7, 18, -58), c2 = V(-7, 20, -75);
      const centre = u < 0.5 ? c0.lerp(c1, u1) : c1.lerp(c2, u2);
      const pitch = u < 0.5 ? lerp(0, 0.5, u1) : lerp(0.5, 1.05, u2);
      const pole = u < 0.5 ? V(0, 0.05, 1).lerp(V(0, -0.3, 1), u1) : V(0, -0.3, 1).lerp(V(0, -0.8, 0.6), u2);
      const q = footQuat(pitch);
      p.legs.R.ankle.copy(G.footCentre).applyQuaternion(q).multiplyScalar(-1).add(centre);
      p.legs.R.pole.copy(pole); p.legs.R.footQuat = q;
      const ub = smooth(u);
      p.hips.set(3 * ub, lerp(G.hipY, 40.5, ub), FEET[2]);
      p.torso.pitch = -0.2 * ub; p.torso.roll = -0.1 * ub;
      const aL = V(...STAND_ARM).lerp(V(17, -35, -14), ub), aR = V(-STAND_ARM[0], STAND_ARM[1], STAND_ARM[2]).lerp(V(-17, -35, -14), ub);
      const pl = V(...STAND_POLE).lerp(V(0.8, 0.2, -0.6), ub);
      p.arms.L = armRel(1, aL.x, aL.y, aL.z, [pl.x, pl.y, pl.z]);
      p.arms.R = armRel(-1, -aR.x, aR.y, aR.z, [pl.x, pl.y, pl.z]);
      return p;
    }
    case 20: { applyKick(p, key(KICK, lf)); return p; }
    case 21: {
      const k = key(KICK, 12).slice();
      const w = smooth(remap(lf, 20, 48));
      // foot held in the breach then slowly withdrawn
      k[0] = 0; k[1] = lerp(12, 15, w); k[2] = lerp(2, -20, w);
      k[7] = 0; k[8] = lerp(30, 33, w); k[9] = lerp(-31, -37, w);
      k[10] = lerp(-0.1, -0.05, w);
      applyKick(p, k);
      return p;
    }
    case 27: {
      const t = remap(fh, MAP.T.DISSOLVE_START, MAP.T.DISSOLVE_START + 68);
      p.slit = 1 - smooth(lf / 40);
      p.opacity = 1 - t; p.drift = t;
      return p;
    }
    default: return null;
  }
}
