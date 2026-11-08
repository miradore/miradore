// Pose generators. A pose is a plain object of joint rotations (added to the rig's base rotations)
// plus hipsPos in the root frame. Everything here is a pure function of its inputs.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import { lerpPose } from './rig.js';
export { lerpPose };

const { clamp, lerp } = MAP;
const PI = Math.PI;

export function basePose(fig) { return { hipsPos: [0, fig.dims.hipsY, 0] }; }

/** Blend two poses and re-solve the legs so blended feet keep their (blended) targets; then make sure
 *  no part of either leg dips below the root plane (plus 1.2 cm). */
export function blendPose(fig, a, b, t) {
  const out = lerpPose(a, b, t);
  if (a._feet && b._feet) for (const s of ['L', 'R']) if (a._feet[s] && b._feet[s]) {
    const A = a._feet[s], B = b._feet[s];
    legIK(fig, out, s, lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
  }
  groundClamp(fig, out);
  return out;
}

const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _p = new THREE.Vector3();
function rotOf(fig, pose, name) { const b = fig.base[name] || [0, 0, 0]; const r = pose[name] || [0, 0, 0]; _e.set(b[0] + r[0], b[1] + r[1], b[2] + r[2], 'XYZ'); return new THREE.Matrix4().makeRotationFromEuler(_e); }
/** Lowest point of the legs in the root frame; raises hipsPos so it stays 1.2 cm above the root plane. */
export function groundClamp(fig, pose) {
  const d = fig.dims; const hp = pose.hipsPos || [0, d.hipsY, 0];
  let minY = Infinity;
  const hips = new THREE.Matrix4().makeTranslation(hp[0], hp[1], hp[2]).multiply(rotOf(fig, pose, 'hips'));
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const th = hips.clone().multiply(new THREE.Matrix4().makeTranslation(sx * d.hipW, -d.hipDrop, 0)).multiply(rotOf(fig, pose, 'thigh' + s));
    const sh = th.clone().multiply(new THREE.Matrix4().makeTranslation(0, -d.thigh, 0)).multiply(rotOf(fig, pose, 'shin' + s));
    const ft = sh.clone().multiply(new THREE.Matrix4().makeTranslation(0, -d.shin, 0)).multiply(rotOf(fig, pose, 'foot' + s));
    const pts = [[th, 0, 0, 0, d.limbR], [th, 0, -d.thigh, 0, d.limbR], [sh, 0, -d.shin, 0, d.limbR * 0.82]];
    for (const [m, x, y, z, r] of pts) { _p.set(x, y, z).applyMatrix4(m); minY = Math.min(minY, _p.y - r); }
    for (const cx of [-1, 1]) for (const cy of [-1, 1]) for (const cz of [-1, 1]) {
      _p.set(cx * d.footW / 2, -d.footH / 2 + cy * d.footH / 2, d.footL * 0.22 + cz * d.footL / 2).applyMatrix4(ft); minY = Math.min(minY, _p.y);
    }
  }
  if (minY < 0.012) pose.hipsPos = [hp[0], hp[1] + (0.012 - minY), hp[2]];
  return pose;
}

/** Per-foot clamp against a world surface: with the root at (rx, ry, rz) facing yaw, every sole corner of
 *  each foot must sit at least `gap` above surf(x, z) under it; a sinking foot has its IK target raised. */
export function clampFeet(fig, pose, rx, ry, rz, yaw, surf, gap = 0.015) {
  const d = fig.dims; const feet = pose._feet; if (!feet) return pose;
  const root = new THREE.Matrix4().makeTranslation(rx, ry, rz).multiply(new THREE.Matrix4().makeRotationY(yaw));
  for (let iter = 0; iter < 2; iter++) {
    let changed = false;
    const hp = pose.hipsPos || [0, d.hipsY, 0];
    const hips = root.clone().multiply(new THREE.Matrix4().makeTranslation(hp[0], hp[1], hp[2])).multiply(rotOf(fig, pose, 'hips'));
    for (const s of ['L', 'R']) {
      if (!feet[s]) continue;
      const sx = s === 'L' ? 1 : -1;
      const th = hips.clone().multiply(new THREE.Matrix4().makeTranslation(sx * d.hipW, -d.hipDrop, 0)).multiply(rotOf(fig, pose, 'thigh' + s));
      const sh = th.clone().multiply(new THREE.Matrix4().makeTranslation(0, -d.thigh, 0)).multiply(rotOf(fig, pose, 'shin' + s));
      const ft = sh.clone().multiply(new THREE.Matrix4().makeTranslation(0, -d.shin, 0)).multiply(rotOf(fig, pose, 'foot' + s));
      let deficit = 0;
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
        _p.set(cx * d.footW / 2, -d.footH, d.footL * 0.22 + cz * d.footL / 2).applyMatrix4(ft);
        deficit = Math.max(deficit, surf(_p.x, _p.z) + gap - _p.y);
      }
      if (deficit > 0) { const t = feet[s]; legIK(fig, pose, s, t[0], t[1] + deficit, t[2]); changed = true; }
    }
    if (!changed) break;
  }
  return pose;
}

/** Two bone leg IK in the root frame. Target is the ankle position. Hips rotation is assumed small. */
export function legIK(fig, pose, side, tx, ty, tz) {
  const d = fig.dims; const sx = side === 'L' ? 1 : -1;
  const hp = pose.hipsPos || [0, d.hipsY, 0];
  const px = hp[0] + sx * d.hipW, py = hp[1] - d.hipDrop, pz = hp[2];
  let vx = tx - px, vy = ty - py, vz = tz - pz;
  const a = d.thigh, b = d.shin;
  let dist = Math.hypot(vx, vy, vz);
  const maxD = (a + b) * 0.998;
  if (dist > maxD) { const s = maxD / dist; vx *= s; vy *= s; vz *= s; dist = maxD; }
  if (dist < 1e-4) dist = 1e-4;
  const phi = Math.atan2(vz, -vy);
  const lat = Math.atan2(vx, Math.hypot(vy, vz));
  const alpha = Math.acos(clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1));
  const knee = Math.acos(clamp((a * a + b * b - dist * dist) / (2 * a * b), -1, 1));
  pose._feet = pose._feet || {}; pose._feet[side] = [tx, ty, tz];
  pose['thigh' + side] = [-(phi + alpha), 0, lat];
  pose['shin' + side] = [PI - knee, 0, 0];
  pose['foot' + side] = [(phi + alpha) - (PI - knee), 0, -lat];
}

/** Standing idle. o: { sway, armsDown, weight } */
export function standPose(fig, o = {}) {
  const d = fig.dims; const pose = basePose(fig);
  const L = d.thigh + d.shin;
  const spread = o.spread ?? 0.02;
  const sl = o.slope ?? 0;                       // ground rise per metre along local +z
  pose.hipsPos = [0, d.footH + L * 0.985 - (o.crouch || 0), 0];
  legIK(fig, pose, 'L', d.hipW + spread, d.footH + sl * (o.footLz ?? 0), (o.footLz ?? 0)); legIK(fig, pose, 'R', -d.hipW - spread, d.footH + sl * (o.footRz ?? 0), (o.footRz ?? 0));
  pose.uaL = [o.armX ?? 0.08, 0, 0.16 + (o.armOut ?? 0)]; pose.uaR = [o.armX ?? 0.08, 0, -0.16 - (o.armOut ?? 0)];
  pose.faL = [-(o.elbow ?? 0.2), 0, 0]; pose.faR = [-(o.elbow ?? 0.2), 0, 0];
  pose.spine = [o.lean ?? 0.02, o.twist ?? 0, 0];
  return pose;
}

/** Walk or run cycle. phase 0..1. o: { stride, lift, bob, armSwing, lean, run, duty, crouch } */
export function gaitPose(fig, phase, o) {
  const d = fig.dims; const pose = basePose(fig);
  const run = !!o.run;
  const duty = o.duty ?? (run ? 0.4 : 0.62);
  const stride = o.stride ?? (run ? d.H * 0.55 : d.H * 0.3);
  const lift = o.lift ?? (run ? d.H * 0.16 : d.H * 0.05);
  const L = d.thigh + d.shin;
  function foot(p) {
    p = ((p % 1) + 1) % 1;
    if (p < duty) { const t = p / duty; return { z: stride * (0.5 - t), y: 0 }; }
    const t = (p - duty) / (1 - duty); const s = t * t * (3 - 2 * t);
    return { z: stride * (-0.5 + s), y: lift * Math.sin(PI * t) };
  }
  const fl = foot(phase), fr = foot(phase + 0.5);
  const reach = Math.sqrt(Math.max(0.01, L * L - (stride * 0.5) * (stride * 0.5)));
  const bobAmp = o.bob ?? (run ? d.H * 0.035 : d.H * 0.012);
  const bob = run ? bobAmp * (0.5 - 0.5 * Math.cos(4 * PI * phase + PI)) : bobAmp * (0.5 - 0.5 * Math.cos(4 * PI * phase));
  const sl = o.slope ?? 0;                       // ground rise per metre along local +z
  const hipY = d.footH + reach * 0.99 + bob - (o.crouch || 0) + (run ? d.H * 0.01 : 0) + Math.abs(sl) * stride * 0.5;
  pose.hipsPos = [0, hipY, 0];
  legIK(fig, pose, 'L', d.hipW, d.footH + fl.y + sl * fl.z, fl.z); legIK(fig, pose, 'R', -d.hipW, d.footH + fr.y + sl * fr.z, fr.z);
  const sw = o.armSwing ?? (run ? 0.9 : 0.35);
  const c = Math.cos(2 * PI * phase);
  pose.uaL = [sw * c + (run ? -0.3 : 0.05), 0, run ? 0.3 : 0.14]; pose.uaR = [-sw * c + (run ? -0.3 : 0.05), 0, run ? -0.3 : -0.14];
  pose.faL = [run ? -1.7 : -0.35, 0, 0]; pose.faR = [run ? -1.7 : -0.35, 0, 0];
  pose.spine = [o.lean ?? (run ? 0.3 : 0.03), 0, 0];
  pose.hips = [0, (run ? 0.1 : 0.05) * Math.sin(2 * PI * phase), 0];
  pose.neck = [run ? -0.15 : 0, 0, 0];
  if (run) { pose.earL = [-0.6, 0, 0]; pose.earR = [-0.6, 0, 0]; pose.tail = [0.3, 0.15 * Math.sin(2 * PI * phase), 0]; }
  else pose.tail = [0, 0.12 * Math.sin(2 * PI * phase), 0];
  return pose;
}

/** Seated on a flat surface (root at the seat). o: { lean, twist, kneesUp (0..1), arms, legSpread } */
export function sitPose(fig, o = {}) {
  const d = fig.dims; const pose = {};
  const hipY = d.pelvis[1] + 0.012;
  pose.hipsPos = [0, hipY, o.back ?? 0];
  pose.spine = [o.lean ?? 0.2, o.twist ?? 0, o.roll ?? 0];
  const k = o.kneesUp ?? 0;
  const thetaT = PI / 2 + k * 0.95;                 // thigh pitch from vertical-down (forward positive)
  const pivotY = hipY - d.hipDrop;
  const kneeY = pivotY + d.thigh * Math.sin(k * 0.95);
  const drop = kneeY - d.footH - 0.015;
  const dir = o.shinDir ?? (k > 0.4 ? -1 : 1);       // shins forward (legs out) or tucked back (knees hugged)
  let shinAng = drop >= d.shin ? 0 : Math.acos(clamp(drop / d.shin, -1, 1));
  if (dir < 0) shinAng = Math.min(shinAng, thetaT - 0.35); // keep the foot in front of the pelvis
  const spread = o.legSpread ?? 0.08;
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const tOff = (o['thighOff' + s] ?? 0);
    if (o.straight) {
      // legs stretched out along the seat surface: thigh level, shin angled slightly down so the heel rests
      const kneeY2 = pivotY; const drop2 = kneeY2 - d.footH - 0.02;
      const sa = Math.asin(clamp(drop2 / d.shin, -1, 1));
      pose['thigh' + s] = [-PI / 2, 0, sx * spread];
      pose['shin' + s] = [sa, 0, 0];
      pose['foot' + s] = [PI / 2 - sa, 0, -sx * spread];
      continue;
    }
    pose['thigh' + s] = [-(thetaT + tOff), 0, sx * spread];
    pose['shin' + s] = [thetaT + tOff - dir * shinAng, 0, 0];
    pose['foot' + s] = [dir * shinAng - (o.toes ?? 0), 0, -sx * spread];
  }
  // tail lies back along the seat, slightly rising, instead of hanging through it
  pose.tail = [PI / 2 + 0.12 - (fig.base.tail ? fig.base.tail[0] : 0), 0, 0];
  if (fig.j.tail2) pose.tail2 = [0.2, 0, 0];
  switch (o.arms) {
    case 'hug': pose.uaL = [-0.6, 0, 0.15]; pose.uaR = [-0.6, 0, -0.15]; pose.faL = [-0.5, 0, -0.85]; pose.faR = [-0.5, 0, 0.85]; break;
    case 'knees': pose.uaL = [-0.75, 0, 0.12]; pose.uaR = [-0.75, 0, -0.12]; pose.faL = [-0.25, 0, 0]; pose.faR = [-0.25, 0, 0]; break;
    case 'back': pose.uaL = [0.75, 0, 0.3]; pose.uaR = [0.75, 0, -0.3]; pose.faL = [-0.15, 0, 0]; pose.faR = [-0.15, 0, 0]; break;
    case 'lap': pose.uaL = [-0.55, 0, 0.12]; pose.uaR = [-0.55, 0, -0.12]; pose.faL = [-1.25, 0.5, 0]; pose.faR = [-1.25, -0.5, 0]; break;
    default: pose.uaL = [-0.3, 0, 0.15]; pose.uaR = [-0.3, 0, -0.15]; pose.faL = [-0.6, 0, 0]; pose.faR = [-0.6, 0, 0];
  }
  return pose;
}

/** Kneeling (shins flat on the surface, root at the surface). */
export function kneelPose(fig, o = {}) {
  const d = fig.dims; const pose = {};
  const kneeY = d.limbR + 0.012;
  const t = (o.sit ?? 0) * 0.55; // sitting back on the heels tilts the thighs back
  pose.hipsPos = [0, kneeY + d.thigh * Math.cos(t) + d.hipDrop, -d.thigh * Math.sin(t)];
  pose.spine = [o.lean ?? 0.3, o.twist ?? 0, 0];
  for (const s of ['L', 'R']) { const sx = s === 'L' ? 1 : -1; pose['thigh' + s] = [t, 0, sx * 0.1]; pose['shin' + s] = [PI / 2 - t, 0, 0]; pose['foot' + s] = [PI / 2, 0, -sx * 0.1]; }
  pose.uaL = [-0.6, 0, 0.2]; pose.uaR = [-0.6, 0, -0.2]; pose.faL = [-0.5, 0, 0]; pose.faR = [-0.5, 0, 0];
  return pose;
}

/** Crouch with feet at given root-frame positions (used for climbing). */
export function crouchPose(fig, o = {}) {
  const d = fig.dims; const pose = basePose(fig);
  const L = d.thigh + d.shin;
  pose.hipsPos = [0, d.footH + L * (o.height ?? 0.7), o.hipsZ ?? -0.05];
  legIK(fig, pose, 'L', d.hipW, d.footH + (o.footLy ?? 0), o.footLz ?? 0.05); legIK(fig, pose, 'R', -d.hipW, d.footH + (o.footRy ?? 0), o.footRz ?? -0.05);
  pose.spine = [o.lean ?? 0.5, o.twist ?? 0, 0];
  pose.uaL = [-0.8, 0, 0.2]; pose.uaR = [-0.8, 0, -0.2]; pose.faL = [-0.4, 0, 0]; pose.faR = [-0.4, 0, 0];
  pose.tail = [0.5, 0, 0]; pose.tail2 = [0.3, 0, 0];
  return pose;
}

/** Add a look direction (radians): yaw positive turns toward the character's left, pitch negative looks up. */
export function look(pose, yaw, pitch, o = {}) {
  const sShare = o.spineShare ?? (Math.abs(yaw) > 0.9 ? 0.35 : 0.15);
  const spine = pose.spine || [0, 0, 0];
  pose.spine = [spine[0], spine[1] + yaw * sShare, spine[2]];
  const neck = pose.neck || [0, 0, 0];
  pose.neck = [neck[0] + pitch * 0.35, neck[1] + yaw * (1 - sShare) * 0.4, neck[2] + (o.roll ?? 0) * 0.4];
  const head = pose.head || [0, 0, 0];
  pose.head = [head[0] + pitch * 0.65, head[1] + yaw * (1 - sShare) * 0.6, head[2] + (o.roll ?? 0) * 0.6];
  return pose;
}

/** Deterministic blink state for a character: returns 'open' | 'half' | 'closed'. */
export function blinkState(frame, seed, o = {}) {
  const period = Math.round((3 + MAP.hash1(seed) * 2) * 24);
  const offset = Math.round(MAP.hash1(seed + 17) * period);
  const f = ((frame + offset) % period + period) % period;
  if (f < 2) return 'half';
  if (f < 6) return 'closed';
  if (f < 8) return 'half';
  return 'open';
}

/** Tremble helper on 2s: alternates sign every two frames. */
export function alt2(frame) { return Math.floor(frame / 2) % 2 === 0 ? 1 : -1; }

export function facing(pose, yawWorld) { pose.rootYaw = yawWorld; return pose; }

/**
 * Two-bone arm IK toward a WORLD wrist target. The figure must already carry its pose (setPose) so the
 * chest matrix is current. pole: world direction the elbow should point to. Writes ua/fa into pose.
 */
export function armIK(fig, pose, side, target, pole) {
  const d = fig.dims; const sx = side === 'L' ? 1 : -1;
  fig.root.updateMatrixWorld(true);
  const chest = fig.j.chest;
  const inv = new THREE.Matrix4().copy(chest.matrixWorld).invert();
  const sh = new THREE.Vector3(sx * d.shoulderW, d.torso * 0.42, 0);
  const t = new THREE.Vector3(...target).applyMatrix4(inv).sub(sh);
  const p = new THREE.Vector3(...pole).transformDirection(inv);
  const a = d.upperArm, b = d.foreArm;
  let dist = t.length(); const D = t.clone().normalize();
  dist = clamp(dist, Math.abs(a - b) + 1e-3, (a + b) * 0.999);
  const alpha = Math.acos(clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1));
  const bend = PI - Math.acos(clamp((a * a + b * b - dist * dist) / (2 * a * b), -1, 1));
  const e = p.sub(D.clone().multiplyScalar(p.dot(D))).normalize();
  const U = D.clone().multiplyScalar(Math.cos(alpha)).add(e.clone().multiplyScalar(Math.sin(alpha))).normalize();
  const Y = U.clone().negate();
  const Z = D.clone().sub(U.clone().multiplyScalar(D.dot(U))).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  const eu = new THREE.Euler().setFromRotationMatrix(m, 'XYZ');
  const base = fig.base['ua' + side] || [0, 0, 0];
  pose['ua' + side] = [eu.x - base[0], eu.y - base[1], eu.z - base[2]];
  pose['fa' + side] = [-bend, 0, 0];
  return pose;
}
