// Pose generators. A pose is a plain object of joint rotations (added to the rig's base rotations)
// plus hipsPos in the root frame. Everything here is a pure function of its inputs.
import * as MAP from '../../../shared/map.js';
import { lerpPose } from './rig.js';
export { lerpPose };

const { clamp } = MAP;
const PI = Math.PI;

export function basePose(fig) { return { hipsPos: [0, fig.dims.hipsY, 0] }; }

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
  pose['thigh' + side] = [-(phi + alpha), 0, lat];
  pose['shin' + side] = [PI - knee, 0, 0];
  pose['foot' + side] = [(phi + alpha) - (PI - knee), 0, -lat];
}

/** Standing idle. o: { sway, armsDown, weight } */
export function standPose(fig, o = {}) {
  const d = fig.dims; const pose = basePose(fig);
  const L = d.thigh + d.shin;
  const spread = o.spread ?? 0.02;
  pose.hipsPos = [0, d.footH + L * 0.985 - (o.crouch || 0), 0];
  legIK(fig, pose, 'L', d.hipW + spread, d.footH, (o.footLz ?? 0)); legIK(fig, pose, 'R', -d.hipW - spread, d.footH, (o.footRz ?? 0));
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
  const hipY = d.footH + reach * 0.99 + bob - (o.crouch || 0) + (run ? d.H * 0.01 : 0);
  pose.hipsPos = [0, hipY, 0];
  legIK(fig, pose, 'L', d.hipW, d.footH + fl.y, fl.z); legIK(fig, pose, 'R', -d.hipW, d.footH + fr.y, fr.z);
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
  const dir = k > 0.4 ? -1 : 1;                      // shins forward (legs out) or tucked back (knees hugged)
  let shinAng = drop >= d.shin ? 0 : Math.acos(clamp(drop / d.shin, -1, 1));
  if (dir < 0) shinAng = Math.min(shinAng, thetaT - 0.35); // keep the foot in front of the pelvis
  const spread = o.legSpread ?? 0.08;
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const tOff = (o['thighOff' + s] ?? 0);
    pose['thigh' + s] = [-(thetaT + tOff), 0, sx * spread];
    pose['shin' + s] = [thetaT + tOff - dir * shinAng, 0, 0];
    pose['foot' + s] = [dir * shinAng - (o.toes ?? 0), 0, -sx * spread];
  }
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
  pose.hipsPos = [0, kneeY + d.thigh + d.hipDrop - (o.sit ?? 0) * d.thigh * 0.5, 0];
  pose.spine = [o.lean ?? 0.3, o.twist ?? 0, 0];
  const t = (o.sit ?? 0) * 0.55; // sitting back on the heels tilts the thighs back
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
