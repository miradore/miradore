// Per-shot photography ("satsuei") settings and frame events: light leaks, diffusion glow, close-up
// background blur, speed/focus lines and impact frames. Pure function of the frame.
import * as THREE from 'three';
import { T, clamp } from '../../shared/map.js';

const CALM = { leakColor: 0xFFD08A, leakPos: [0.0, 1.0], leakAmt: 0.2, bloom: 0.22, bloomThresh: 0.92 };
const DREAD = { leakColor: 0xC9C2F2, leakPos: [0.5, 1.05], leakAmt: 0.16, bloom: 0.25, bloomThresh: 0.9 };
const CHAOS = { leakColor: 0xFFC070, leakPos: [1.0, 1.0], leakAmt: 0.22, bloom: 0.25, bloomThresh: 0.9 };
const AFTER = { leakColor: 0xFFE0A8, leakPos: [0.5, 0.95], leakAmt: 0.2, bloom: 0.28, bloomThresh: 0.88 };

const SHOT = {
  1: CALM, 2: CALM, 3: { ...CALM, bgBlur: 2 }, 4: { ...CALM, bgBlur: 7 }, 5: CALM,
  6: { leakColor: 0x9FF6FF, leakPos: [0.5, 1.1], leakAmt: 0.3, bloom: 0.55, bloomThresh: 0.85 },
  7: { leakColor: 0x9FF6FF, leakPos: [0.5, 1.1], leakAmt: 0.3, bloom: 0.45, bloomThresh: 0.85 },
  8: { leakColor: 0xE8E2FF, leakPos: [1.0, 1.0], leakAmt: 0.15, bloom: 0.25, bloomThresh: 0.9 },
  9: { leakColor: 0xE8E2FF, leakPos: [1.0, 1.0], leakAmt: 0.15, bloom: 0.25, bloomThresh: 0.9, bgBlur: 2 },
  10: DREAD, 11: DREAD, 12: DREAD, 13: { ...DREAD, bgBlur: 6 }, 14: DREAD,
  15: { leakColor: 0x9CFFFF, leakPos: [0.5, 1.05], leakAmt: 0.15, bloom: 0.45, bloomThresh: 0.85 },
  16: DREAD, 17: { ...DREAD, bgBlur: 3 }, 18: DREAD, 19: DREAD,
  20: CHAOS, 21: CHAOS, 22: CHAOS, 23: CHAOS, 24: CHAOS, 25: { ...CHAOS, bgBlur: 2 }, 26: { ...CHAOS, bgBlur: 3 },
  27: AFTER, 28: AFTER, 29: AFTER,
  30: { leakColor: 0xFFE6C8, leakPos: [0.0, 1.0], leakAmt: 0.15, bloom: 0.22, bloomThresh: 0.92, bgBlur: 7 },
  31: { leakColor: 0xFFE6C8, leakPos: [0.0, 1.0], leakAmt: 0.15, bloom: 0.22, bloomThresh: 0.92, bgBlur: 9 },
};

// speed / focus lines: [start, end, world centre or screen centre, dark lines?, peak amount]
const SPEED = [
  { a: T.HAND_IMPACT, b: T.HAND_IMPACT + 16, world: [30, 51, 4], dark: true, amt: 1.0, decay: true },
  { a: 840, b: 876, screen: [0.5, 0.52], dark: true, amt: 0.3, decay: false },
  { a: 948, b: 996, screen: [0.5, 0.55], dark: true, amt: 0.35, decay: false },
  { a: T.KICK, b: T.KICK + 14, world: [0, 12, 0], dark: false, amt: 1.0, decay: true },
  { a: 1128, b: 1146, world: [0, 16, 0], dark: false, amt: 0.8, decay: true },
];
// impact frames: two-tone negatives held for two frames
const IMPACT = [
  { f: [T.HAND_IMPACT, T.HAND_IMPACT + 1], deep: 0x160A10 },
  { f: [T.KICK + 1, T.KICK + 2], deep: 0x7A0C1C },
];

const _v = new THREE.Vector3();
export function lookAt(frame, info, camera) {
  const base = SHOT[info.shotId] || CALM;
  const out = { bgBlur: 0, speed: 0, speedCenter: [0.5, 0.5], speedDark: true, impact: 0, impactDeep: 0x160A10, ...base };
  for (const s of SPEED) {
    if (frame < s.a || frame >= s.b) continue;
    const t = (frame - s.a) / (s.b - s.a);
    out.speed = s.amt * (s.decay ? clamp(1 - t, 0, 1) : Math.min(1, t * 4) * Math.min(1, (1 - t) * 4));
    out.speedDark = s.dark;
    if (s.world) { _v.set(...s.world).project(camera); out.speedCenter = [(_v.x + 1) / 2, (_v.y + 1) / 2]; }
    else out.speedCenter = s.screen;
  }
  for (const im of IMPACT) if (frame >= im.f[0] && frame <= im.f[1]) { out.impact = 1; out.impactDeep = im.deep; }
  return out;
}
