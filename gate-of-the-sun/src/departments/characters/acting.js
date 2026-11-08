// Per-shot direction for every character. direct(cast, frame, info, ctx) is a pure function of the frame:
// nothing is carried between calls, all randomness comes from MAP.hash*/mulberry32 with fixed seeds.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import * as P from './poses.js';

const { hold, lerp, clamp, smooth, hash1, hash2, groundY, stepTopY, KIDS, MOTHERS, T } = MAP;
const PI = Math.PI;
const EAST = PI / 2, WEST = -PI / 2, NORTH = PI, SOUTH = 0;   // root yaw to face +x, -x, -z, +z
const yawTo = (dx, dz) => Math.atan2(dx, dz);
const FOX13 = { z: 47.75, lean: 0.5 };   // fox placement in the lynx close-up (shot 13)
// shot 9: the fox kneels on the wall side of the hare and folds over him (root, lean, left arm; the right mirrors)
const HUG9 = { x: 29.3, z: 44.97, yaw: 0, lean: 0.45, head: [0.5, 0.15, 0], neck: [0.15, 0, 0], handL: [-0.6, 0, -0.2],
  wristL: [29.35, 1.27, 45.24], wristR: [29.12, 1.24, 45.33], poleL: [0.8, 0.8, -0.4], poleR: [-0.8, 0.8, -0.4] };

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _zero = new THREE.Vector3(0, 0, 0), _up = new THREE.Vector3(0, 1, 0);
// shots 30-31: hare body yaw and head look so the face points at the camera (camera bearing ~1.14 rad)
const HARE30 = { yaw: 1.36, look: -0.2 };

/** Surface height under a foot: the town's square paving sits 8 cm proud of the ground and the canal
 *  kerb (x 24.8..26) 12 cm proud. Margins cover a running stride so no foot lands inside an edge. */
export function surfY(x, z) {
  if (x >= 24.5 && x <= 26.0 && z >= 10 && z <= 150) return groundY(26, z) + 0.12;
  if (x >= -30.6 && x <= 30.6 && z >= 58.9 && z <= 95.6) return groundY(x, z) + 0.08;
  return groundY(x, z);
}
/** ground rise per metre along the facing direction (for foot placement over a stride) */
function slopeAt(x, z, yaw) { const dx = Math.sin(yaw) * 0.5, dz = Math.cos(yaw) * 0.5; return surfY(x + dx, z + dz) - surfY(x - dx, z - dz); }
function place(fig, x, y, z, yaw) { fig.root.position.set(x, y, z); fig.root.rotation.set(0, yaw, 0); }
/** place a moving figure and make sure each foot clears the real surface under it (slope and paving edges) */
function placeGait(fig, x, z, yaw, pose) { const y = surfY(x, z) + 0.012; place(fig, x, y, z, yaw); P.clampFeet(fig, pose, x, y, z, yaw, surfY); fig.setPose(pose); }
function show(fig, v) { fig.root.visible = !!v; }
function breath(pose, frame, seed, amp = 0.02) { const s = pose.spine || [0, 0, 0]; pose.spine = [s[0] + amp * Math.sin(frame * 0.26 + seed * 3.1), s[1], s[2]]; return pose; }
function tremble(pose, frame, amp) { const t = P.alt2(frame) * amp; const s = pose.spine || [0, 0, 0]; pose.spine = [s[0], s[1], s[2] + t]; const h = pose.head || [0, 0, 0]; pose.head = [h[0], h[1], h[2] - t * 1.5]; return pose; }
function brows(pose, worry, anger = 0) { const t = worry - anger; const lift = -0.12 * Math.max(0, worry) + 0.05 * Math.max(0, anger); pose.browL = [lift, 0, -t]; pose.browR = [lift, 0, t]; return pose; }
/** small open trembling mouth (fear), alternating on 2s */
function trem(f2) { return Math.floor(f2 / 2) % 2 === 0 ? 'trem1' : 'trem2'; }
/** trembling downturned grief mouth, alternating on 2s */
function sadTrem(f2) { return Math.floor(f2 / 2) % 2 === 0 ? 'sadT1' : 'sadT2'; }
function wetEyes(frame) { return Math.floor(frame / 2) % 2 === 0 ? 'wet1' : 'wet2'; }
function blinkOr(frame, seed, def) { const b = P.blinkState(frame, seed); return b === 'open' ? def : b; }
/** attach a child figure in front of a parent's chest (carried). Offsets in the chest frame. */
function carry(parent, child, off, yawRel, childPose) {
  parent.root.updateMatrixWorld(true);
  const chest = parent.j.chest; chest.updateWorldMatrix(true, false);
  _v.set(off[0], off[1], off[2]); chest.localToWorld(_v);
  child.root.position.copy(_v);
  chest.getWorldQuaternion(_q); _q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawRel, 0)));
  child.root.quaternion.copy(_q);
  child.setPose(childPose);
}

// ------------------------------------------------------------------ seats and poses for the kids
function kidSeat(name) {
  const k = KIDS[name];
  const dx = name === 'lynx' ? 0.38 : 0.1;      // pelvis forward of the seat point so heads meet ANCHORS
  return { x: k.seat[0] + dx, y: k.seat[1], z: k.seat[2] };
}
function foxSit(fig, o = {}) { return P.sitPose(fig, { lean: 0.26, arms: 'knees', legSpread: 0.1, kneesUp: 0.7, shinDir: 1, ...o }); }
function hareSit(fig, o = {}) { return P.sitPose(fig, { lean: 0.32, kneesUp: 0.8, arms: 'hug', legSpread: 0.06, ...o }); }
function lynxSit(fig, o = {}) { return P.sitPose(fig, { lean: -0.05, arms: 'back', legSpread: 0.14, straight: true, ...o }); }

/** frozen awe toward the wall: the kids face +x, the wall is behind-left (yaw ~ +1.6) and high (pitch -0.55) */
function aweLook(pose, fig, frame, o = {}) {
  P.look(pose, o.yaw ?? 1.55, o.pitch ?? -0.6, { spineShare: 0.42 });
  pose.eyes = o.eyes ?? blinkOr(frame, fig.spec.inkId, 'wide');
  pose.mouth = o.mouth ?? trem(frame);
  brows(pose, o.worry ?? 0.32);
  return pose;
}

// ------------------------------------------------------------------ crowd placements (deterministic)
export function makeCast(ctx, figs, crowd, props) {
  const rng = MAP.mulberry32(4242);
  const square = [];
  const fixed = { 0: [-10.6, 77.0], 1: [-9.0, 76.6], 2: [-7.4, 77.3], 3: [-5.8, 76.9], 4: [-8.2, 78.9], 7: [6.6, 71.0] };
  // keep clear of the fountain (0,78), the market stalls, the shot cameras and the lane in front of the fountain
  const avoid = [[0, 78, 5.6], [-6, 62, 3], [6, 58, 3], [2, 58, 3], [0, 82, 3.2],
    [-14, 66, 3], [14, 66, 3], [-15, 89, 3], [15, 89, 3], [-25, 67, 3], [25, 67, 3], [-25, 88, 3], [25, 88, 3], [-27, 77, 3], [27, 78, 3]];
  const inLane = (x, z) => Math.abs(x) < 5.8 && z < 84;
  for (let i = 0; i < 32; i++) {
    let p;
    if (fixed[i]) p = fixed[i];
    else {
      for (let tries = 0; tries < 60; tries++) {
        const x = -12 + rng() * 24, z = 64.5 + rng() * 25.5;
        let ok = !inLane(x, z);
        for (const q of square) if (Math.hypot(q.x - x, q.z - z) < 1.5) { ok = false; break; }
        for (const a of avoid) if (Math.hypot(a[0] - x, a[1] - z) < a[2]) { ok = false; break; }
        for (const k of Object.keys(fixed)) if (Math.hypot(fixed[k][0] - x, fixed[k][1] - z) < 1.6) { ok = false; break; }
        if (ok) { p = [x, z]; break; }
      }
      if (!p) p = [-12 + (i % 4) * 2.2, 84.5 + Math.floor(i / 4) * 1.6];
    }
    square.push({ x: p[0], z: p[1], idleYaw: rng() * PI * 2, runV: 3.2 + rng() * 0.8, armMode: Math.floor(rng() * 3), earTremble: rng() < 0.3 });
  }
  // flee lanes: x = +-5.4 (clear of the fountain rim and of the houses beyond the square), slots 1.8 m apart by start z
  for (const side of [-1, 1]) {
    const members = square.map((q, k) => ({ q, k })).filter(({ q }) => Math.sign(q.x || 1) === side).sort((a, b) => b.q.z - a.q.z);
    members.forEach(({ q, k }, rank) => { q.laneX = side * 5.4 + (hash1(k + 300) - 0.5) * 0.3; q.slotZ = 91 - rank * 1.8; });
  }
  const street10 = [[-4.2, 37], [-2.5, 42], [-0.5, 39.5], [1.5, 43], [3.2, 38], [4.6, 41]];
  const run24 = [];
  for (let i = 0; i < 20; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    // lanes either side of the fountain (rim at r 4.7) inside the street; outer lanes staggered half a row
    const lane = [-6.15, -5.25, 5.25, 6.15][col];
    const outer = col === 0 || col === 3;
    run24.push({ x: lane + (hash2(i, 3) - 0.5) * 0.1, z0: 64.5 + row * 3.4 + (outer ? 1.7 : 0) + (hash2(i, 5) - 0.5) * 0.4 - (i === 1 ? 2.0 : 0), v: i === 1 ? 3.9 : 4.3 + (hash2(i, 7) - 0.5) * 0.8, phase: hash2(i, 9) });
  }
  const run25 = [];
  for (let i = 0; i < 6; i++) run25.push({ x: -7.6 - (i % 3) * 1.3, z0: 64.2 + Math.floor(i / 3) * 3.5 + (i % 3) * 0.6 + hash2(i, 11) * 0.6, v: 3.3 + hash2(i, 13) * 0.6, phase: hash2(i, 15) });
  return { ctx, figs, crowd, props, square, street10, run24, run25 };
}

// ------------------------------------------------------------------ main entry
export function direct(cast, frame, info, ctx) {
  const { figs, crowd, props } = cast;
  const shot = info.shotId;
  const f2 = hold(frame, 2);
  const lf = f2 - info.shot.start;        // local held frame
  const lt = lf / 24;

  directKids(cast, frame, f2, lf, lt, shot, info, ctx);
  directMothers(cast, frame, f2, lf, lt, shot);
  directCrowd(cast, frame, f2, lf, lt, shot);
  directProps(cast, frame, f2, lf, lt, shot);
}

// ------------------------------------------------------------------ kids
function directKids(cast, frame, f2, lf, lt, shot, info, ctx) {
  const { fox, hare, lynx } = cast.figs;
  const kids = [fox, hare, lynx];
  for (const k of kids) show(k, true);
  const seatF = kidSeat('fox'), seatH = kidSeat('hare'), seatL = kidSeat('lynx');
  const bank = (z) => surfY(25.2, z) + 0.012;      // the kerb at the top of the steps
  // tear hidden unless shot 31 sets it
  cast.props.tear.visible = false;

  if (shot <= 3 || shot === 4) {
    // ---- calm: seated on the steps
    place(fox, seatF.x, seatF.y, seatF.z, EAST); place(hare, seatH.x, seatH.y, seatH.z, EAST); place(lynx, seatL.x, seatL.y, seatL.z, EAST);
    // fox: looks at the water, tosses a pebble in shot 3 at local 28..40
    let pf = foxSit(fox);
    P.look(pf, 0.05, 0.18); pf.eyes = blinkOr(f2, 1, 'open'); pf.mouth = 'smile';
    if (shot === 3) {
      if (lf >= 20 && lf < 28) { const t = smooth((lf - 20) / 8); pf.uaR = [lerp(-0.75, 0.5, t), 0, -0.3]; pf.faR = [lerp(-0.25, -1.5, t), 0, 0]; P.look(pf, 0.05, lerp(0.18, 0.0, t)); }
      else if (lf >= 28 && lf < 34) { pf.uaR = [0.5, 0, -0.3]; pf.faR = [-1.5, 0, 0]; }
      else if (lf >= 34 && lf < 40) { const t = smooth((lf - 34) / 6); pf.uaR = [lerp(0.5, -1.9, t), 0, -0.25]; pf.faR = [lerp(-1.5, -0.2, t), 0, 0]; pf.spine = [0.26 + 0.12 * t, 0, 0]; pf.mouth = 'small'; }
      else if (lf >= 40 && lf < 50) { const t = smooth((lf - 40) / 10); pf.uaR = [lerp(-1.9, -0.75, t), 0, -0.3]; pf.faR = [lerp(-0.2, -0.25, t), 0, 0]; pf.spine = [0.38 - 0.12 * t, 0, 0]; pf.mouth = 'smile'; }
    }
    breath(pf, f2, 1, 0.012); fox.setPose(pf);
    // hare: hugging knees; shot 4 acting
    let ph = hareSit(hare);
    let yaw = 0.12, pitch = 0.05, worry = 0.05, eyes = blinkOr(f2, 2, 'open'), mouth = 'closed';
    if (shot === 4) {
      if (lf >= 8 && lf < 10) eyes = 'half'; else if (lf >= 10 && lf < 14) eyes = 'closed'; else if (lf >= 14 && lf < 16) eyes = 'half';
      if (lf >= 30 && lf < 34) ph.earL = [-0.45, 0, 0.1];
      if (lf >= 20) worry = 0.05 + 0.25 * smooth((lf - 20) / 8);
      if (lf >= 36) { const t = smooth((lf - 36) / 6); yaw = lerp(0.12, 0.7, t); pitch = lerp(0.05, -0.26, t); mouth = 'small'; }
      if (lf >= 40 && eyes === 'open') eyes = wetEyes(f2);
    }
    P.look(ph, yaw, pitch, { spineShare: 0.2 }); ph.eyes = eyes; ph.mouth = mouth; brows(ph, worry);
    breath(ph, f2, 2, 0.012); hare.setPose(ph);
    // lynx: reclined, calm, looking at the sky
    let pl = lynxSit(lynx);
    P.look(pl, -0.1, -0.3); pl.eyes = blinkOr(f2, 3, 'narrow'); pl.mouth = 'closed';
    breath(pl, f2, 3, 0.012); lynx.setPose(pl);
  } else if (shot >= 5 && shot <= 8) {
    // ---- frozen, looking up at the wall; flinch at the bolt (348)
    place(fox, seatF.x, seatF.y, seatF.z, EAST); place(hare, seatH.x, seatH.y, seatH.z, EAST); place(lynx, seatL.x, seatL.y, seatL.z, EAST);
    const flinch = f2 >= T.BOLT && f2 < T.BOLT + 6;
    const after = f2 >= T.BOLT + 6;
    const o = flinch ? { eyes: 'squeeze', pitch: 0.1, mouth: 'grit', worry: 0.45 } : after ? { mouth: 'gasp', worry: 0.42, eyes: 'fear' } : {};
    fox.setPose(breath(aweLook(foxSit(fox, { lean: 0.1 }), fox, f2, o), f2, 1));
    hare.setPose(breath(aweLook(hareSit(hare, { lean: 0.15 }), hare, f2, o), f2, 2));
    lynx.setPose(breath(aweLook(lynxSit(lynx, { lean: -0.05 }), lynx, f2, { ...o, eyes: o.eyes ?? blinkOr(f2, 3, 'open') }), f2, 3));
  } else if (shot === 9) {
    // ---- blown back: fox throws himself over the hare, lynx braces
    const s1h = stepTopY(1, 45.4) + 0.0;
    const foxKneel = { x: HUG9.x, y: stepTopY(1, HUG9.z), z: HUG9.z };
    const t = smooth(clamp(lf / 6, 0, 1));
    // protective hug: the fox kneels on the wall side of the hare, bows over him and lays both arms across
    // his back and shoulders (wrist targets solved with arm IK on the final placement)
    const kneel = P.kneelPose(fox, { lean: HUG9.lean });
    kneel.handL = HUG9.handL.slice(); kneel.handR = [HUG9.handL[0], -HUG9.handL[1], -HUG9.handL[2]];
    kneel.head = HUG9.head.slice(); kneel.neck = HUG9.neck.slice(); kneel.eyes = 'squeeze'; kneel.mouth = 'grit'; kneel.earL = [0.7, 0, 0.1]; kneel.earR = [0.7, 0, -0.1]; kneel.tail = [0.3, 0.9, 0]; kneel.tail2 = [0.3, 0, 0];
    brows(kneel, 0.45);
    tremble(kneel, f2, 0.02);
    place(fox, foxKneel.x, foxKneel.y, foxKneel.z, SOUTH + HUG9.yaw);
    fox.setPose(kneel);
    P.armIK(fox, kneel, 'L', HUG9.wristL, HUG9.poleL); P.armIK(fox, kneel, 'R', HUG9.wristR, HUG9.poleR);
    if (t < 1) {
      const sit = foxSit(fox, { lean: 0.1 }); sit.eyes = 'squeeze'; sit.mouth = 'scream'; brows(sit, 0.45);
      // root path: forward over the step edge with a hop so nothing dips into step 0; z leads x so he passes north of the hare
      const x = lerp(seatF.x, foxKneel.x, t), z = lerp(seatF.z, foxKneel.z, Math.sqrt(t));
      const surf = x < 28 ? stepTopY(0, z) : stepTopY(1, z);
      const y = surf + 0.012 + 0.16 * Math.sin(PI * t);
      place(fox, x, y, z, lerp(EAST, SOUTH + HUG9.yaw, t));
      fox.setPose(P.lerpPose(sit, kneel, t));
    } else fox.setPose(kneel);
    place(hare, seatH.x, seatH.y, seatH.z, EAST);
    const ph = hareSit(hare, { lean: 0.95 }); ph.head = [0.45, 0, 0]; ph.eyes = 'squeeze'; ph.mouth = lf < 12 ? 'scream' : trem(f2); ph.earL = [0.2, 0, 0.8]; ph.earR = [0.2, 0, 0.6]; brows(ph, 0.5);
    hare.setPose(tremble(ph, f2, 0.02));
    place(lynx, seatL.x, seatL.y, seatL.z, EAST);
    const pl = lynxSit(lynx, { lean: 0.15, roll: 0.5, arms: 'back' }); pl.uaR = [0.1, 0, -1.35]; pl.faR = [-0.05, 0, 0]; pl.uaL = [-1.2, 0, 0.5]; pl.faL = [-1.4, 0, 0];
    P.look(pl, 0.5, 0.1); pl.eyes = 'squeeze'; pl.mouth = 'grit'; pl.earL = [0.3, 0, 0.7]; pl.earR = [0.3, 0, 0.6]; brows(pl, 0.4);
    lynx.setPose(tremble(pl, f2, 0.02));
  } else if (shot >= 10 && shot <= 25) {
    // ---- frozen awe on the steps through the giant's appearance; flinch at the kick
    place(fox, seatF.x, seatF.y, seatF.z, EAST); place(hare, seatH.x, seatH.y, seatH.z, EAST); place(lynx, seatL.x, seatL.y, seatL.z, EAST);
    const kick = f2 >= T.KICK && f2 < T.KICK + 8;
    const o = kick ? { eyes: 'squeeze', pitch: 0.0, mouth: 'grit', worry: 0.45 } : { mouth: f2 > T.KICK ? 'gasp' : trem(f2), worry: f2 > T.KICK ? 0.42 : 0.34 };
    if (shot === 13) {
      // the lynx close-up frames the step behind him: the fox shuffles along the step toward +z and
      // hunches over his knees so his head sits low and clear of the lynx's head silhouette
      const fz = FOX13.z; place(fox, seatF.x, stepTopY(0, fz), fz, EAST);
      const pf = foxSit(fox, { lean: FOX13.lean, arms: 'hug', kneesUp: 0.85 });
      fox.setPose(breath(aweLook(pf, fox, f2, { ...o, yaw: 1.35, pitch: -0.3 }), f2, 1));
    } else fox.setPose(breath(aweLook(foxSit(fox, { lean: 0.1 }), fox, f2, o), f2, 1));
    if (shot === 13) {
      // lynx close-up: head turned toward +z so the face presents three-quarter to the lens (the face
      // cheat does the rest), wary narrowed eyes, worried brows, trembling mouth; turns to the wall at local 20
      const pl = lynxSit(lynx, { lean: -0.05 });
      const tt = smooth((lf - 20) / 8);
      const yaw = lf < 20 ? -0.22 : lerp(-0.22, 0.85, tt);
      P.look(pl, yaw, lf < 20 ? -0.08 : lerp(-0.08, -0.4, tt), { spineShare: 0.3 });
      pl.eyes = blinkOr(f2, 3, lf < 20 ? 'narrow' : 'fear'); pl.mouth = trem(f2); brows(pl, 0.34);
      if ((lf >= 8 && lf < 12) || (lf >= 30 && lf < 34)) pl.earR = [-0.3, 0, -0.15];
      if (lf >= 10 && lf < 14) pl.earL = [-0.25, 0, 0.1];
      lynx.setPose(breath(pl, f2, 3, 0.01));
    } else lynx.setPose(breath(aweLook(lynxSit(lynx, { lean: -0.05 }), lynx, f2, { ...o, eyes: o.eyes ?? blinkOr(f2, 3, 'open') }), f2, 3));
    hare.setPose(breath(aweLook(hareSit(hare, { lean: 0.15 }), hare, f2, o), f2, 2));
  } else if (shot === 26) {
    // ---- up the steps: keyframed root paths; levels are the surfaces under the root
    const zF = 46.3, zH = 46.7;
    
    const standBack = (fig, yaw) => { const p = P.standPose(fig, { lean: 0.1 }); P.look(p, yaw, -0.15, { spineShare: 0.4 }); return p; };
    const crouch = (fig) => P.crouchPose(fig, { height: 0.62, lean: 0.3 });
    const crouchUp = (fig) => { const p = P.crouchPose(fig, { height: 0.55, lean: 0.75, footLy: 0.02, footRy: 0.02, footLz: 0.02, footRz: -0.02 }); p.uaL = [-1.6, 0, 0.3]; p.uaR = [-1.6, 0, -0.3]; p.faL = [-0.2, 0, 0]; p.faR = [-0.2, 0, 0]; return p; };
    // fox: pulls (left arm back toward the hare), scrambles up the bank riser, stands at the top facing the hare
    const pull = (fig) => { const p = P.standPose(fig, { lean: 0.35 }); p.tail = [0.4, 0, 0]; p.uaL = [1.2, 0, 0.35]; p.faL = [-0.3, 0, 0]; p.uaR = [-0.6, 0, -0.2]; P.look(p, 1.1, 0.0, { spineShare: 0.5 }); return p; };
    // once on the bank the fox turns to face the hare and hauls with both arms, leaning back
    const haul = (fig) => { const p = P.standPose(fig, { lean: -0.12, footLz: 0.06, footRz: -0.08 }); p.tail = [0.3, 0, 0]; p.uaL = [-0.75, 0, 0.3]; p.uaR = [-0.75, 0, -0.3]; p.faL = [-0.35, 0, 0]; p.faR = [-0.35, 0, 0]; P.look(p, 0, 0.35); return p; };
    const foxKeys = [
      { f: 0, x: 27.35, lvl: 0, pose: pull(fox), yaw: WEST },
      { f: 10, x: 26.6, lvl: 0, pose: crouch(fox), yaw: WEST },
      { f: 14, x: 26.3, lvl: 1, pose: crouchUp(fox), yaw: WEST },
      { f: 22, x: 25.6, lvl: 1, pose: standBack(fox, 0), yaw: WEST },
      { f: 30, x: 25.05, lvl: 1, pose: haul(fox), yaw: EAST },
      { f: 59, x: 25.0, lvl: 1, pose: haul(fox), yaw: EAST },
    ];
    const stumble = (fig) => { const p = P.standPose(fig, { lean: 0.5, crouch: 0.03 }); p.uaR = [-1.45, 0, -0.3]; p.faR = [-0.2, 0, 0]; p.uaL = [-0.9, 0, 0.5]; p.head = [0.2, 0, 0.15]; return p; };
    const hareKeys = [
      { f: 0, x: 28.9, lvl: 0, pose: stumble(hare), yaw: WEST },
      { f: 8, x: 28.6, lvl: 0, pose: crouch(hare), yaw: WEST },
      { f: 12, x: 28.3, lvl: 1, pose: crouchUp(hare), yaw: WEST },
      { f: 20, x: 27.6, lvl: 1, pose: stumble(hare), yaw: WEST },
      { f: 30, x: 26.6, lvl: 1, pose: crouch(hare), yaw: WEST },
      { f: 34, x: 26.3, lvl: 2, pose: crouchUp(hare), yaw: WEST },
      { f: 42, x: 25.9, lvl: 2, pose: stumble(hare), yaw: WEST },
      { f: 50, x: 25.9, lvl: 2, pose: standBack(hare, 1.2), yaw: WEST },
      { f: 59, x: 25.9, lvl: 2, pose: standBack(hare, 1.2), yaw: WEST },
    ];
    const levelsF = [stepTopY(0, zF), surfY(25.5, zF)];
    const levelsH = [stepTopY(1, zH), stepTopY(0, zH), surfY(25.5, zH)];
    const runKeys = (fig, keys, levels, z) => {
      let a = keys[0], b = keys[keys.length - 1];
      for (let i = 0; i < keys.length - 1; i++) if (lf >= keys[i].f && lf <= keys[i + 1].f) { a = keys[i]; b = keys[i + 1]; break; }
      const t = a === b ? 0 : smooth(clamp((lf - a.f) / Math.max(1, b.f - a.f), 0, 1));
      const x = lerp(a.x, b.x, t);
      const y = lerp(levels[a.lvl], levels[b.lvl], t) + 0.012 + (a.lvl !== b.lvl ? 0.05 * Math.sin(PI * t) : 0);
      const yaw = lerp(a.yaw, b.yaw, t);
      place(fig, x, y, z, yaw);
      const pose = P.blendPose(fig, a.pose, b.pose, t);
      pose.eyes = blinkOr(f2, fig.spec.inkId, fig === hare ? (Math.floor(f2 / 2) % 2 === 0 ? 'fearWet1' : 'fearWet2') : 'fear'); pose.mouth = fig === hare ? trem(f2) : 'scream'; brows(pose, 0.45);
      fig.setPose(pose);
    };
    runKeys(fox, foxKeys, levelsF, zF);
    runKeys(hare, hareKeys, levelsH, zH);
    // lynx at the top looking back toward the gate
    place(lynx, 25.0, bank(48.5), 48.5, NORTH);
    const pl = P.standPose(lynx, { lean: 0.05 }); P.look(pl, -0.1, -0.25); pl.eyes = blinkOr(f2, 3, 'narrow'); pl.mouth = 'small'; brows(pl, 0.1);
    lynx.setPose(breath(pl, f2, 3));
  } else if (shot >= 27 && shot <= 29) {
    // ---- the three stand at the top of the bank, small, looking toward the gate
    place(hare, 25.2, bank(45.4), 45.4, NORTH); place(fox, 25.2, bank(47.2), 47.2, NORTH); place(lynx, 25.0, bank(48.5), 48.5, NORTH);
    const ph = P.standPose(hare, { lean: 0.05 }); P.look(ph, 0.05, -0.2); ph.eyes = blinkOr(f2, 2, wetEyes(f2)); ph.mouth = 'small'; brows(ph, 0.3); hare.setPose(breath(ph, f2, 2));
    const pf = P.standPose(fox, { lean: 0.1 }); P.look(pf, -0.05, -0.2); pf.eyes = blinkOr(f2, 1, 'open'); pf.mouth = 'closed'; brows(pf, 0, 0.2); pf.uaL = [-0.3, 0, 0.3]; fox.setPose(breath(pf, f2, 1));
    const pl = P.standPose(lynx, { lean: 0.02 }); P.look(pl, 0.1, -0.2); pl.eyes = blinkOr(f2, 3, 'narrow'); pl.mouth = 'closed'; lynx.setPose(breath(pl, f2, 3));
  } else {
    // ---- shots 30-31: the hare stands at the top of the steps, face three-quarter to the camera
    // body three-quarter (turned 0.2 rad past the lens), head turned back so the face points at the camera;
    // eyes slide off camera toward -z (the gate)
    place(hare, 25.2, bank(45.4), 45.4, HARE30.yaw);
    const ph = P.standPose(hare, { lean: 0.06 });
    P.look(ph, HARE30.look, -0.06, { spineShare: 0.25 });
    const gaze = Math.floor(f2 / 2) % 2 === 0 ? 'wetGaze1' : 'wetGaze2';
    let eyes = gaze;
    if (shot === 31) { if (lf >= 38 && lf < 40) eyes = 'wetGazeHalf'; else if (lf >= 40 && lf < 44) eyes = 'closed'; else if (lf >= 44 && lf < 46) eyes = 'wetGazeHalf'; }
    else { const b = P.blinkState(f2, 2); eyes = b === 'open' ? gaze : b === 'half' ? 'wetGazeHalf' : 'closed'; }
    ph.eyes = eyes; ph.mouth = sadTrem(f2); brows(ph, 0.5);
    ph.glasses = shot === 31 ? [0.0, 0.01, 0.07] : [0.0, 0.015, 0.1];   // askew by 4 degrees in the close-up (6 in shot 30)
    ph.uaL = [0.1, 0, 0.2]; ph.uaR = [0.1, 0, -0.2]; ph.faL = [-0.15, 0, 0]; ph.faR = [-0.15, 0, 0];
    hare.setPose(breath(ph, f2, 2, 0.01));
    // tear forming at shot 31 local 20, running down the right cheek on 2s
    if (shot === 31 && lf >= 20) {
      const tear = cast.props.tear; tear.visible = true;
      const R = hare.dims.headR; const hs = hare.dims.headScale;
      const t = clamp((lf - 20) / 30, 0, 1);
      const az = -(hare.spec.eyes.az * (hare.closeUp ? 1.08 : 1) + 0.06), el = lerp(-0.36, -0.78, t);
      const sc = 1 + 0.6 * clamp((lf - 20) / 6, 0, 1);
      tear.position.fromArray(hare.onSkull(az, el, 0.006));
      // orient in the face frame (pure function of the frame: no stale world matrices)
      _v.copy(tear.position).normalize(); _m.lookAt(_v, _zero, _up); tear.quaternion.setFromRotationMatrix(_m);
      tear.scale.set(sc * 0.8, sc, 1);
    }
    // fox beside him, partially in frame; lynx further along the bank
    place(fox, 25.3, bank(46.5), 46.5, EAST);
    const pf = P.standPose(fox, { lean: 0.08 }); P.look(pf, 1.3, -0.1, { spineShare: 0.45 }); pf.eyes = blinkOr(f2, 1, 'half'); pf.mouth = 'sad'; brows(pf, 0.35); fox.setPose(breath(pf, f2, 1));
    place(lynx, 25.0, bank(48.5), 48.5, NORTH);
    const pl = P.standPose(lynx, { lean: 0.02 }); P.look(pl, 0.1, -0.2); pl.eyes = blinkOr(f2, 3, 'narrow'); lynx.setPose(breath(pl, f2, 3));
  }
  // anchors: the camera follows the real head in shots 30-31, otherwise the map anchors apply
  if (shot >= 30) ctx.anchors.hareHead = hare.headWorld(); else delete ctx.anchors.hareHead;
}

// ------------------------------------------------------------------ mothers
function directMothers(cast, frame, f2, lf, lt, shot) {
  const { badger, piglet, goat, goatkid } = cast.figs;
  const vis = shot === 2 || shot === 25;
  for (const f of [badger, piglet, goat, goatkid]) show(f, vis);
  cast.props.cloth.visible = shot === 2;
  if (!vis) return;
  if (shot === 2) {
    // badger in the doorway folding a cloth, looking down at the piglet
    const b = MOTHERS.badger.shot2; place(badger, b[0], surfY(b[0], b[2]) + 0.012, b[2], EAST);
    const pb = P.standPose(badger, { lean: 0.08 });
    const fold = 0.5 - 0.5 * Math.cos(lt * PI * 0.5 * 2);       // slow fold rhythm (2 s)
    pb.uaL = [-0.95 - 0.1 * fold, 0.1, 0.35]; pb.uaR = [-0.95 - 0.1 * fold, -0.1, -0.35];
    pb.faL = [-1.25 + 0.25 * fold, 0.55, 0]; pb.faR = [-1.25 + 0.25 * fold, -0.55, 0];
    pb.handL = [0, 0, 0.3]; pb.handR = [0, 0, -0.3];
    P.look(pb, -0.2, 0.42); pb.eyes = blinkOr(f2, 4, 'half'); pb.mouth = 'smile';
    badger.setPose(breath(pb, f2, 4, 0.01));
    // piglet tugging at the apron hem (position pulled closer than the map point so it can reach)
    const p = MOTHERS.piglet.shot2; place(piglet, -12.45, surfY(-12.45, p[2]) + 0.012, p[2], WEST);
    const pp = P.standPose(piglet, { lean: -0.12 - 0.1 * P.alt2(hold(frame, 12)), spread: 0.02 });
    pp.uaL = [-1.75, 0, 0.15]; pp.uaR = [-1.75, 0, -0.15]; pp.faL = [-0.2, 0, 0]; pp.faR = [-0.2, 0, 0];
    P.look(pp, 0.05, -0.55); pp.eyes = blinkOr(f2, 5, 'up'); pp.mouth = 'small';
    piglet.setPose(pp);
    // goat mother walks slowly west with her baby by the hand
    // the map point for the goat sits on the camera's line to the badger, so she walks 1.5 m nearer the south kerb
    const g = MOTHERS.goat.shot2; const gx = g[0] - 0.4 * lt; const gz = g[2] - 1.5;
    place(goat, gx, surfY(gx, gz) + 0.012, gz, WEST);
    const cyc = 2 * 0.36 / 0.4;                                   // seconds per cycle (two steps of 0.36 m)
    const pg = P.gaitPose(goat, (lt / cyc) % 1, { stride: 0.36, lift: 0.06, bob: 0.015 });
    pg.uaL = [0.55, 0, 0.42]; pg.faL = [-0.1, 0, 0];           // left hand down and back toward the baby
    P.look(pg, 0.45, 0.25); pg.eyes = blinkOr(f2, 6, 'half'); pg.mouth = 'smile';
    goat.setPose(pg);
    const kx = gx + 0.72, kz = gz + 0.42;
    place(goatkid, kx, surfY(kx, kz) + 0.012, kz, WEST);
    const pk = P.gaitPose(goatkid, (lt / (2 * 0.18 / 0.4)) % 1, { stride: 0.18, lift: 0.03, bob: 0.006 });
    pk.uaR = [0.1, 0, -2.3]; pk.faR = [-0.1, 0, 0];             // right arm up toward mother's hand
    P.look(pk, -0.6, -0.5); pk.eyes = blinkOr(f2, 7, 'up'); pk.mouth = 'smile';
    goatkid.setPose(pk);
  } else {
    // shot 25: badger steps to the piglet, bends, scoops (0..10), rises (10..16) and runs; goat runs clutching the baby
    const b0 = MOTHERS.badger.shot25, p0 = MOTHERS.piglet.shot25;
    const toPig = yawTo(p0[0] - b0[0], p0[2] - b0[2]);
    const runDir = new THREE.Vector2(-10, 8).normalize();   // west and north (screen left), clear of the fountain at (0, 78)
    const runYaw = yawTo(runDir.x, runDir.y);
    const stepT = smooth(clamp(lf / 6, 0, 1));
    const bx0 = lerp(b0[0], b0[0] + 0.45, stepT), bz0 = lerp(b0[2], b0[2] + 0.22, stepT);
    const curled = () => { const c = P.basePose(piglet); c.hipsPos = [0, piglet.dims.hipsY * 0.9, 0]; c.thighL = [-1.3, 0, 0.15]; c.thighR = [-1.3, 0, -0.15]; c.shinL = [1.6, 0, 0]; c.shinR = [1.6, 0, 0]; c.footL = [-0.3, 0, 0]; c.footR = [-0.3, 0, 0]; c.uaL = [-1.0, 0, 0.3]; c.uaR = [-1.0, 0, -0.3]; c.faL = [-1.0, 0, 0]; c.faR = [-1.0, 0, 0]; c.head = [0.2, 0, 0]; c.eyes = 'closed'; c.mouth = 'sad'; c.earL = [-0.4, 0, 0]; c.earR = [-0.4, 0, 0]; return c; };
    const carryArms = (p) => { p.uaL = [-0.7, 0, 0.7]; p.uaR = [-0.7, 0, -0.7]; p.faL = [-1.6, 1.0, 0]; p.faR = [-1.6, -1.0, 0]; return p; };
    if (lf < 10) {
      place(badger, bx0, surfY(bx0, bz0) + 0.012, bz0, toPig);
      const bend = smooth(clamp(lf / 10, 0, 1));
      const pb = P.standPose(badger, { lean: 1.0 * bend, crouch: 0.1 * bend, footLz: 0.12, footRz: -0.1 });
      pb.uaL = [-0.5 - 0.7 * bend, 0, 0.4]; pb.uaR = [-0.5 - 0.7 * bend, 0, -0.4]; pb.faL = [-0.3, 0, 0]; pb.faR = [-0.3, 0, 0];
      P.look(pb, 0, 0.3); pb.eyes = 'wide'; pb.mouth = 'gasp'; brows(pb, 0.35);
      badger.setPose(pb);
      // piglet on the ground reaching up, then lifted (lerp 8..10)
      const pp = P.standPose(piglet, { lean: -0.1 }); pp.uaL = [-2.4, 0, 0.3]; pp.uaR = [-2.4, 0, -0.3]; pp.faL = [-0.2, 0, 0]; pp.faR = [-0.2, 0, 0];
      P.look(pp, 0, -0.5); pp.eyes = 'wet1'; pp.mouth = 'gasp';
      if (lf < 8) { place(piglet, p0[0], surfY(p0[0], p0[2]) + 0.012, p0[2], yawTo(b0[0] - p0[0], b0[2] - p0[2])); piglet.setPose(pp); }
      else {
        // blend toward the carried position
        const t = smooth((lf - 8) / 2);
        const gp = new THREE.Vector3(p0[0], surfY(p0[0], p0[2]) + 0.012, p0[2]);
        const gq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawTo(b0[0] - p0[0], b0[2] - p0[2]), 0));   // the piglet faces the mother on the ground, then is turned away as she lifts him
        carry(badger, piglet, [0.1, -0.2, 0.37], 0, curled());
        piglet.root.position.lerpVectors(gp, piglet.root.position, t); piglet.root.quaternion.slerpQuaternions(gq, piglet.root.quaternion, t);
        piglet.setPose(P.lerpPose(pp, curled(), t));
      }
    } else {
      const rise = smooth(clamp((lf - 10) / 6, 0, 1));
      const runT = Math.max(0, lt - 16 / 24);
      const bx = bx0 + runDir.x * 3.4 * runT, bz = bz0 + runDir.y * 3.4 * runT;
      const yaw = lf < 16 ? lerp(toPig, runYaw, rise) : runYaw;
      let pb;
      if (lf < 16) { pb = P.standPose(badger, { lean: lerp(1.0, 0.12, rise), crouch: 0.1 * (1 - rise) }); }
      else pb = P.gaitPose(badger, (runT / 0.5) % 1, { run: true, stride: badger.dims.H * 0.4, lean: 0.12, slope: slopeAt(bx, bz, yaw) });
      carryArms(pb); P.look(pb, 0, 0.1); pb.eyes = 'wide'; pb.mouth = 'gasp'; brows(pb, 0.35);
      placeGait(badger, bx, bz, yaw, pb);
      carry(badger, piglet, [0.1, -0.2, 0.37], 0, curled());
    }
    // goat mother clutching the baby, runs behind
    const g0 = MOTHERS.goat.shot25; const gDir = new THREE.Vector2(-2.5, 11).normalize(); const gYaw = yawTo(gDir.x, gDir.y);
    const gT = Math.max(0, lt - 6 / 24);
    const gx = g0[0] + gDir.x * 3.2 * gT, gz = g0[2] + gDir.y * 3.2 * gT;
    let pg = gT > 0 ? P.gaitPose(goat, (gT / 0.5) % 1, { run: true, stride: goat.dims.H * 0.4, lean: 0.12, slope: slopeAt(gx, gz, gYaw) }) : P.standPose(goat, { lean: 0.1 });
    carryArms(pg); P.look(pg, 0, 0.15); pg.eyes = 'wide'; pg.mouth = 'gasp'; brows(pg, 0.35); pg.earL = [-0.5, 0, 0]; pg.earR = [-0.5, 0, 0];
    placeGait(goat, gx, gz, gYaw, pg);
    const kc = P.basePose(goatkid); kc.hipsPos = [0, goatkid.dims.hipsY * 0.9, 0]; kc.thighL = [-1.3, 0, 0.15]; kc.thighR = [-1.3, 0, -0.15]; kc.shinL = [1.6, 0, 0]; kc.shinR = [1.6, 0, 0]; kc.footL = [-0.3, 0, 0]; kc.footR = [-0.3, 0, 0];
    kc.uaL = [-1.0, 0, 0.3]; kc.uaR = [-1.0, 0, -0.3]; kc.faL = [-1.0, 0, 0]; kc.faR = [-1.0, 0, 0]; kc.head = [0.25, 0, 0]; kc.eyes = 'closed'; kc.mouth = 'sad';
    carry(goat, goatkid, [0, -0.24, 0.35], 0, kc);
  }
}

// ------------------------------------------------------------------ crowd
function crowdFrozen(fig, f2, seed, info, o = {}) {
  const p = P.standPose(fig, { lean: -0.05, spread: 0.03 });
  switch (info.armMode) {
    case 1: p.uaL = [-1.1, 0, 0.3]; p.faL = [-0.9, 0, 0]; p.uaR = [0.15, 0, -0.25]; p.faR = [-0.3, 0, 0]; break;
    case 2: p.uaL = [-0.9, 0, 0.2]; p.uaR = [-0.9, 0, -0.2]; p.faL = [-1.5, 0.3, 0]; p.faR = [-1.5, -0.3, 0]; break;
    default: p.uaL = [-0.2, 0, 0.45]; p.uaR = [-0.2, 0, -0.45]; p.faL = [-0.5, 0, 0]; p.faR = [-0.5, 0, 0];
  }
  P.look(p, o.yaw ?? 0, o.pitch ?? -0.6, { spineShare: 0.3 });
  p.eyes = blinkOr(f2, seed + 50, hash1(seed + 5) < 0.5 ? 'fearUp' : 'up'); p.mouth = o.mouth ?? (hash1(seed) < 0.75 ? trem(f2 + seed * 2) : 'gasp');
  brows(p, 0.4);
  if (info.earTremble) { const t = P.alt2(f2) * 0.12; p.earL = [t, 0, 0]; p.earR = [-t, 0, 0]; }
  return breath(p, f2, seed, 0.02);
}

function directCrowd(cast, frame, f2, lf, lt, shot) {
  const { crowd, square, street10, run24, run25 } = cast;
  const n = crowd.length;
  const vis = new Array(n).fill(false);
  const g = (x, z) => surfY(x, z) + 0.012;
  if (shot <= 22) {
    // the square set (0..31)
    for (let i = 0; i < 32; i++) {
      const fig = crowd[i], s = square[i]; vis[i] = true;
      if (f2 < T.KICK + 8) {
        if (shot <= 4) {
          place(fig, s.x, g(s.x, s.z), s.z, s.idleYaw);
          const p = P.standPose(fig, { lean: 0.03, spread: 0.03 }); P.look(p, 0.2 * Math.sin(i), 0.05); p.eyes = blinkOr(f2, i + 50, 'open'); p.mouth = 'closed';
          fig.setPose(breath(p, f2, i, 0.015));
        } else {
          place(fig, s.x, g(s.x, s.z), s.z, NORTH);
          const flinch = (f2 >= T.BOLT && f2 < T.BOLT + 6) || (f2 >= T.KICK && f2 < T.KICK + 8);
          fig.setPose(crowdFrozen(fig, f2, i, s, flinch ? { pitch: 0.2, mouth: 'gasp' } : { pitch: -0.55 - 0.1 * hash1(i + 3) }));
          if (flinch) fig.setEyes('closed');
        }
      } else {
        // turn and run away from the gate toward +z, converging on two lanes either side of the fountain
        // (slots ordered by start z so paths never cross); all at the same speed so the file keeps its order
        const t0 = (T.KICK + 8) / 24, t = frame / 24 - t0;
        const turn = smooth(clamp(t / (6 / 24), 0, 1));
        const runT = Math.max(0, t - 6 / 24);
        const V = 3.6;
        const path = (tt) => { const k = smooth(clamp(tt / 2.0, 0, 1)); return [lerp(s.x, s.laneX, k), lerp(s.z + V * tt, s.slotZ + V * tt, k)]; };
        const [px, z] = path(runT); const [px2, z2] = path(runT + 0.1);
        const yaw = runT > 0 ? yawTo(px2 - px, z2 - z) : SOUTH;
        if (runT <= 0) { place(fig, px, g(px, z), z, lerp(NORTH, yaw, turn)); const p = crowdFrozen(fig, f2, i, s, { pitch: -0.2 }); fig.setPose(p); }
        else { const p = P.gaitPose(fig, (runT / 0.5 + hash1(i)) % 1, { run: true, slope: slopeAt(px, z, yaw) }); p.eyes = 'fear'; p.mouth = hash1(i + 4) < 0.5 ? 'gasp' : 'scream'; brows(p, 0.45); placeGait(fig, px, z, yaw, p); }
      }
    }
    if (shot === 10) {
      for (let k = 0; k < 6; k++) {
        const i = 32 + k, fig = crowd[i]; vis[i] = true; const [x, z] = street10[k];
        place(fig, x, g(x, z), z, NORTH);
        const p = crowdFrozen(fig, f2, i, { armMode: k % 3, earTremble: false }, { pitch: -0.7 });
        if (k === 2) { p.uaR = [-2.4, 0, -0.35]; p.faR = [0.05, 0, 0]; }
        fig.setPose(p);
      }
    }
    if (shot === 2) {
      // two extras far down the cross street to the west
      const a = crowd[38], b = crowd[39]; vis[38] = vis[39] = true;
      const ax = -30 - 0.5 * lt; place(a, ax, g(ax, 110.3), 110.3, WEST);
      a.setPose(P.gaitPose(a, (lt / 1.6) % 1, { stride: 0.4, lift: 0.06 }));
      place(b, -37, g(-37, 111.6), 111.6, EAST + 0.6);
      const pb = P.standPose(b, { lean: 0.05 }); pb.uaL = [-0.6, 0, 0.3]; pb.faL = [-1.4, 0, 0]; b.setPose(pb);
    }
  } else if (shot === 23) {
    // a dog and a sheep run toward camera down the main street from z 30 to z 56
    const z = 36 + 24 * (lf / 60);     // east side of the street, clear of the falling facade slabs
    const pairs = [[9, 1.6, 0], [10, 3.1, -2.2]];
    for (const [i, x, dz] of pairs) {
      const fig = crowd[i]; vis[i] = true; const zz = z + dz;
      const p = P.gaitPose(fig, (lt / 0.5 + hash1(i)) % 1, { run: true, stride: fig.dims.H * 0.6, slope: slopeAt(x, zz, SOUTH) }); p.eyes = 'wide'; p.mouth = 'gasp'; brows(p, 0.3);
      placeGait(fig, x, zz, SOUTH, p);
    }
  } else if (shot === 24) {
    // 20 runners toward camera; the otter (index 5) trips at local 30 and is up by 50
    for (let i = 0; i < 20; i++) {
      const fig = crowd[i], r = run24[i]; vis[i] = true;
      let z = r.z0 + r.v * lt;
      let pose;
      if (i === 5) {
        const t30 = 30 / 24, t50 = 50 / 24;
        const zRun = r.z0 + r.v * Math.min(lt, t30);
        const fallT = clamp((lt - t30) / (6 / 24), 0, 1), upT = clamp((lt - 44 / 24) / (6 / 24), 0, 1);
        z = zRun + 0.6 * smooth(fallT) + r.v * Math.max(0, lt - t50);
        const run = P.gaitPose(fig, (lt / 0.5 + r.phase) % 1, { run: true, slope: slopeAt(r.x, z, SOUTH) });
        const down = P.kneelPose(fig, { lean: 1.05, sit: 0.3 }); down.uaL = [-0.45, 0, 0.25]; down.uaR = [-0.45, 0, -0.25]; down.faL = [0, 0, 0]; down.faR = [0, 0, 0]; down.head = [-0.3, 0, 0];
        if (lt < t30) pose = run;
        else if (lt < t30 + 6 / 24) pose = P.blendPose(fig, run, down, smooth(fallT));
        else if (lt < 44 / 24) pose = down;
        else if (lt < t50) pose = P.blendPose(fig, down, run, smooth(upT));
        else pose = run;
      } else pose = P.gaitPose(fig, (lt / 0.5 + r.phase) % 1, { run: true, stride: fig.dims.H * (0.5 + 0.1 * hash1(i)), slope: slopeAt(r.x, z, SOUTH) });
      pose.eyes = blinkOr(f2, i + 50, hash1(i + 7) < 0.5 ? 'fear' : 'wide'); pose.mouth = hash1(i + 9) < 0.5 ? 'scream' : 'gasp'; brows(pose, 0.45);
      placeGait(fig, r.x, z, SOUTH + (hash1(i + 20) - 0.5) * 0.1, pose);
    }
  } else if (shot === 25) {
    // background runners beyond the mothers (further west)
    for (let k = 0; k < 6; k++) {
      const i = 20 + k, fig = crowd[i], r = run25[k]; vis[i] = true;
      const z = r.z0 + r.v * lt;
      const p = P.gaitPose(fig, (lt / 0.5 + r.phase) % 1, { run: true, slope: slopeAt(r.x, z, SOUTH) }); p.eyes = 'wide'; p.mouth = 'gasp';
      placeGait(fig, r.x, z, SOUTH, p);
    }
  }
  for (let i = 0; i < n; i++) show(crowd[i], vis[i]);
}

// ------------------------------------------------------------------ props
function directProps(cast, frame, f2, lf, lt, shot) {
  const { props, figs, crowd, square } = cast;
  // pebble: in the fox's right hand until local 34 of shot 3, then an arc into the canal
  if (shot === 3 && lf < 40) {
    props.pebble.visible = true;
    if (lf < 34) { figs.fox.root.updateMatrixWorld(true); figs.fox.j.prop.getWorldPosition(props.pebble.position); }
    else {
      const t = (lf - 34) / 6;
      // release point: compute the hand position at local 34 (held pose) is costly; use a fixed point near the fox's hand
      const p0 = new THREE.Vector3(KIDS.fox.seat[0] + 0.45, KIDS.fox.seat[1] + 0.75, KIDS.fox.seat[2] - 0.1);
      const p1 = new THREE.Vector3(33.0, groundY(26, 46.8) - 2.2 + 0.03, 46.8);
      props.pebble.position.lerpVectors(p0, p1, t); props.pebble.position.y += 0.35 * Math.sin(PI * t);
    }
  } else props.pebble.visible = false;

  // basket at the second bear's feet, shots 1..22
  const sq7 = square[7];
  props.basket.visible = shot <= 22;
  props.basket.position.set(sq7.x + 0.55, surfY(sq7.x, sq7.z) + 0.012, sq7.z + 0.55); props.basket.rotation.y = 0.6;

  // jug: raccoon (index 4) holds it in both hands; drops it at frame 960 (shot 17 local 12)
  props.jug.visible = shot <= 22;
  if (shot <= 22 && f2 < T.KICK + 8) {
    const rac = crowd[4];
    const dropF = 948 + 12;
    const hold0 = [0, -0.06, 0.32];
    if (f2 < dropF) {
      const p = { uaL: [-1.0, 0, 0.3], uaR: [-1.0, 0, -0.3], faL: [-1.15, 0.45, 0], faR: [-1.15, -0.45, 0] };
      // keep the rest of the raccoon's pose, only the arms hold the jug
      for (const k of Object.keys(p)) { const b = rac.base[k]; rac.j[k].rotation.set(b[0] + p[k][0], b[1] + p[k][1], b[2] + p[k][2]); }
      rac.root.updateMatrixWorld(true);
      _v.set(hold0[0], hold0[1], hold0[2]); rac.j.chest.localToWorld(_v); props.jug.position.copy(_v);
      rac.j.chest.getWorldQuaternion(props.jug.quaternion);
    } else {
      // arms open as the jug falls; jug drops, tips and lies still
      const p = { uaL: [-0.6, 0, 0.6], uaR: [-0.6, 0, -0.6], faL: [-0.6, 0.2, 0], faR: [-0.6, -0.2, 0] };
      for (const k of Object.keys(p)) { const b = rac.base[k]; rac.j[k].rotation.set(b[0] + p[k][0], b[1] + p[k][1], b[2] + p[k][2]); }
      rac.root.updateMatrixWorld(true);
      _v.set(hold0[0], hold0[1], hold0[2]); rac.j.chest.localToWorld(_v);
      const gy = surfY(_v.x, _v.z) + 0.012;
      const h0 = _v.y - gy;
      const tFall = Math.sqrt(2 * Math.max(0.01, h0 - 0.1) / 9.8);
      const t = (frame - dropF) / 24;      // falling debris may be on 1s
      const u = clamp(t / tFall, 0, 1);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rac.root.quaternion);
      props.jug.position.set(_v.x + fwd.x * 0.25 * u, lerp(_v.y, gy + 0.125, u * u), _v.z + fwd.z * 0.25 * u);
      props.jug.rotation.set(0, rac.root.rotation.y, u * (PI / 2 + 0.1));
      if (u >= 1) props.jug.position.y = gy + 0.125;
    }
  } else if (shot <= 22) {
    // the crowd has fled: the jug lies where it fell
    const rac = crowd[4]; const s4 = square[4];
    props.jug.position.set(s4.x, surfY(s4.x, s4.z - 0.57) + 0.012 + 0.125, s4.z - 0.57); props.jug.rotation.set(0, NORTH, PI / 2 + 0.1);
  }
}
