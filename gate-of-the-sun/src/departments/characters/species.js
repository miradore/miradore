// Character specs: the three kids, the mothers and their children, and seven parametric crowd species.
import * as MAP from '../../../shared/map.js';

const KID_EYES = (key, irisTop, irisBot, extra = {}) => ({
  key, style: { irisTop, irisBot, size: 256, ...extra }, az: 0.44, elev: 0.08, phiLen: 0.66, thetaLen: 0.74,
});
const ADULT_EYES = (key, irisTop, irisBot, extra = {}) => ({
  key, style: { irisTop, irisBot, size: 128, ...extra }, az: 0.42, elev: 0.14, phiLen: 0.5, thetaLen: 0.52,
});

/** kid proportions from height, head radius, torso and neck (chibi leaning: head ~35 percent of height) */
function kidBody(H, headR, torso, neck, hs, pelvis) {
  const hipsY = H - torso - neck - headR * hs[1] * 1.92;
  const footH = 0.035;
  const thigh = (hipsY - footH) * 0.52, shin = hipsY - footH - thigh;
  return { H, headR, headScale: hs, torso, neck, hipsY, thigh, shin, footH, footL: 0.1, footW: 0.065, pelvis,
    hipW: pelvis[0] * 0.5, limbR: pelvis[0] * 0.38, armR: 0.036, chest: [pelvis[0] * 1.12, torso * 0.3, pelvis[2] * 1.05],
    shoulderW: pelvis[0] * 1.1, upperArm: torso * 0.36, foreArm: torso * 0.31, bellyR: pelvis[0] * 0.88 };
}
function adultBody(H, o = {}) {
  const headR = H * (o.headK ?? 0.112); const hs = o.hs ?? [1, 1.03, 1];
  const torso = H * (o.torsoK ?? 0.30), neck = H * 0.028;
  const hipsY = H - torso - neck - headR * hs[1] * 1.92;
  const footH = H * 0.028; const thigh = (hipsY - footH) * 0.52, shin = hipsY - footH - thigh;
  const pw = H * (o.pelvisK ?? 0.092);
  return { H, headR, headScale: hs, torso, neck, hipsY, thigh, shin, footH, footL: H * 0.075, footW: H * 0.045,
    pelvis: [pw, H * 0.07, pw * 0.85], hipW: pw * 0.5, limbR: pw * 0.4, armR: H * 0.027,
    chest: [pw * (o.chestK ?? 1.15), torso * 0.32, pw * 0.95], shoulderW: pw * 1.18, upperArm: torso * 0.5, foreArm: torso * 0.46, bellyR: pw * (o.bellyK ?? 0.9) };
}
function childBody(H) {
  const headR = H * 0.19, hs = [1, 1.02, 1]; const torso = H * 0.34, neck = H * 0.025;
  const hipsY = H - torso - neck - headR * hs[1] * 1.92; const footH = H * 0.035;
  const thigh = (hipsY - footH) * 0.52, shin = hipsY - footH - thigh; const pw = H * 0.11;
  return { H, headR, headScale: hs, torso, neck, hipsY, thigh, shin, footH, footL: H * 0.085, footW: H * 0.055,
    pelvis: [pw, H * 0.1, pw * 0.9], hipW: pw * 0.5, limbR: pw * 0.38, armR: H * 0.03, chest: [pw * 1.1, torso * 0.3, pw * 1.0],
    shoulderW: pw * 1.1, upperArm: torso * 0.38, foreArm: torso * 0.33, bellyR: pw * 0.9 };
}

// ------------------------------------------------------------------ the kids
export function foxSpec(inkId) {
  return {
    name: 'fox', inkId, lod: 'hero',
    ...kidBody(1.25, 0.21, 0.42, 0.035, [0.98, 1.04, 0.98], [0.13, 0.12, 0.115]),
    fur: 0xE8803A, furShade: 0xA9522A, cream: 0xFBEBD2, creamShade: 0xC9A58F, dark: 0x3B2420, darkShade: 0x1E1210,
    ears: { type: 'fox', inner: 0xFBEBD2, innerShade: 0xC9A58F, tip: 0x3B2420 },
    tail: { type: 'bushy', len: 0.55, r: 0.085, tip: 0xFBEBD2, tipShade: 0xC9A58F, pitch: 1.0 },
    muzzle: { w: 0.075, h: 0.058, d: 0.085, y: 0.3, z: 0.7, color: 0xFBEBD2, shade: 0xC9A58F },
    eyes: KID_EYES('fox', '#5b2a0a', '#f0a83a', { lid: 0.055 }),
    extras: [],
    clothes: { tunic: { color: MAP.PALETTE.cobalt, shade: MAP.PALETTE.cobaltShade, sleeveless: true }, chestPatch: true, neckerchief: { color: 0xD93A2B, shade: 0x8E2318 }, boots: true },
  };
}
export function hareSpec(inkId) {
  return {
    name: 'hare', inkId, lod: 'hero',
    ...kidBody(1.15, 0.205, 0.38, 0.03, [1.0, 1.04, 1.0], [0.12, 0.11, 0.105]),
    fur: 0xE9E1D2, furShade: 0xA99FBF, cream: 0xFBF7F0, creamShade: 0xC4BBD4, dark: 0x3A3238, darkShade: 0x1D181C,
    ears: { type: 'hare', inner: 0xF2B8C0, innerShade: 0xB97E8C, flop: 'R' },
    tail: { type: 'puff', r: 0.07, tip: 0xFBF7F0, tipShade: 0xC4BBD4, pitch: 0.7 },
    muzzle: { w: 0.062, h: 0.05, d: 0.062, y: 0.28, z: 0.72, color: 0xFBF7F0, shade: 0xC4BBD4, noseColor: 0xE08A98, noseShade: 0x9E5A68 },
    eyes: { ...KID_EYES('hare', '#2f3f63', '#8fb6d9', { size: 512, lid: 0.052 }), phiLen: 0.72, thetaLen: 0.82 },
    extras: ['glasses'],
    browColor: 0x5a4f58, browShade: 0x2e272d,
    clothes: { waistcoat: { color: 0x3E8E5A, shade: 0x245535 }, chestPatch: true, satchel: { color: 0x8B5A2B, shade: 0x53351A } },
  };
}
export function lynxSpec(inkId) {
  return {
    name: 'lynx', inkId, lod: 'hero',
    ...kidBody(1.22, 0.20, 0.43, 0.035, [0.98, 1.02, 0.98], [0.125, 0.12, 0.11]),
    fur: 0xC9A26A, furShade: 0x8E6B45, cream: 0xF3E6CF, creamShade: 0xB89E86, dark: 0x3B2C22, darkShade: 0x1E150F,
    ears: { type: 'lynx', inner: 0xF3E6CF, innerShade: 0xB89E86 },
    tail: { type: 'bob', r: 0.045, len: 0.09, pitch: 0.8 },
    muzzle: { w: 0.072, h: 0.055, d: 0.072, y: 0.3, z: 0.7, color: 0xF3E6CF, shade: 0xB89E86 },
    eyes: KID_EYES('lynx', '#1f4a2c', '#8fd07a', { baseOpen: 0.78, flat: true, lid: 0.05 }),
    extras: ['ruff'],
    clothes: { tunic: { color: 0x8C8C96, shade: 0x55555E, sleeveless: true }, scarf: { color: 0x8E2A2A, shade: 0x561717 } },
  };
}

// ------------------------------------------------------------------ mothers and children
export function badgerSpec(inkId) {
  return {
    name: 'badger', inkId, lod: 'hero',
    ...adultBody(1.6, { headK: 0.115, bellyK: 1.0 }),
    fur: 0x8C8A90, furShade: 0x55535C, cream: 0xF4F0EA, creamShade: 0xB9A4C9, dark: 0x2A2428, darkShade: 0x15120F,
    ears: { type: 'round', inner: 0xF4F0EA, innerShade: 0xB9A4C9, size: 0.8 },
    tail: { type: 'stub', r: 0.06, pitch: 0.9 },
    muzzle: { w: 0.07, h: 0.055, d: 0.09, y: 0.3, z: 0.72, color: 0xF4F0EA, shade: 0xB9A4C9 },
    eyes: ADULT_EYES('badger', '#2a1a14', '#7a4a2a'),
    extras: ['badgerFace'],
    clothes: { tunic: { color: 0x6E5A8E, shade: 0x443560, sleeveless: false }, apron: { color: 0xF2E9D8, shade: 0xB9A4C9 }, headscarf: { color: 0xD9A441, shade: 0x8E6A22 } },
  };
}
export function pigletSpec(inkId) {
  return {
    name: 'piglet', inkId, lod: 'hero',
    ...childBody(0.7),
    fur: 0xF2B8C0, furShade: 0xB97E8C, cream: 0xF9D5DA, creamShade: 0xC2929B, dark: 0x5a3540, darkShade: 0x2e1a20,
    ears: { type: 'pig', size: 1.0 },
    tail: { type: 'curly', r: 0.03, pitch: 0.3 },
    muzzle: { w: 0.05, h: 0.045, d: 0.06, y: 0.3, z: 0.72, color: 0xF2B8C0, shade: 0xB97E8C, snout: true, snoutColor: 0xE89AA8, snoutShade: 0xB86878 },
    eyes: KID_EYES('piglet', '#3a2a1a', '#a06a3a', { size: 128 }),
    extras: [],
    clothes: { tunic: { color: 0xF2C94C, shade: 0xB08A22, sleeveless: true } },
  };
}
export function goatSpec(inkId) {
  return {
    name: 'goat', inkId, lod: 'hero',
    ...adultBody(1.7, { headK: 0.108 }),
    fur: 0xF3EBDA, furShade: 0xB9A4C9, cream: 0xFBF7F0, creamShade: 0xC4BBD4, dark: 0x4a3a30, darkShade: 0x261d18,
    ears: { type: 'goat', inner: 0xF2C4C8, innerShade: 0xB98A90 },
    tail: { type: 'stub', r: 0.05, pitch: 0.4 },
    muzzle: { w: 0.07, h: 0.06, d: 0.1, y: 0.3, z: 0.72, color: 0xFBF7F0, shade: 0xC4BBD4, noseColor: 0x6a4a45, noseShade: 0x3a2a25 },
    eyes: ADULT_EYES('goat', '#3a2f1a', '#c9a24a'),
    extras: ['horns', 'beard'],
    clothes: { dress: { color: 0x3C6ED8, shade: 0x22418A }, sash: { color: 0xF2E9D8, shade: 0xB9A4C9 } },
  };
}
export function goatKidSpec(inkId) {
  return {
    name: 'goatkid', inkId, lod: 'hero',
    ...childBody(0.6),
    fur: 0xF3EBDA, furShade: 0xB9A4C9, cream: 0xFBF7F0, creamShade: 0xC4BBD4, dark: 0x4a3a30, darkShade: 0x261d18,
    ears: { type: 'goat', inner: 0xF2C4C8, innerShade: 0xB98A90, size: 0.9 },
    tail: { type: 'stub', r: 0.025, pitch: 0.4 },
    muzzle: { w: 0.04, h: 0.035, d: 0.05, y: 0.3, z: 0.72, color: 0xFBF7F0, shade: 0xC4BBD4, noseColor: 0x6a4a45, noseShade: 0x3a2a25 },
    eyes: KID_EYES('goatkid', '#3a2f1a', '#c9a24a', { size: 128 }),
    extras: [],
    clothes: { tunic: { color: 0xE9553B, shade: 0x9A3524, sleeveless: true } },
  };
}

// ------------------------------------------------------------------ crowd species
const CLOTH = [
  [0x1F49B5, 0x15307A], [0xE9553B, 0x9A3524], [0xF2C94C, 0xB08A22], [0x3E8E5A, 0x245535], [0x8E2A2A, 0x561717],
  [0x6E5A8E, 0x443560], [0xF2E9D8, 0xB9A4C9], [0x8C8C96, 0x55555E], [0xD9A441, 0x8E6A22], [0x3C8ED8, 0x22528A],
];
function tint(hex, k) { const r = Math.min(255, Math.round(((hex >> 16) & 255) * k)), g = Math.min(255, Math.round(((hex >> 8) & 255) * k)), b = Math.min(255, Math.round((hex & 255) * k)); return (r << 16) | (g << 8) | b; }

export const SPECIES = ['bear', 'deer', 'dog', 'sheep', 'raccoon', 'otter', 'boar'];

/** Parametric crowd member. seed drives colours, height and clothes deterministically. */
export function crowdSpec(species, seed, inkId) {
  const rng = MAP.mulberry32(1000 + seed * 7919);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const female = rng() < 0.5;
  const cloth = pick(CLOTH), cloth2 = pick(CLOTH);
  let s;
  switch (species) {
    case 'bear': {
      const H = 1.78 + rng() * 0.12; const k = 0.85 + rng() * 0.3;
      s = { ...adultBody(H, { headK: 0.118, pelvisK: 0.105, chestK: 1.25, bellyK: 1.05 }), fur: tint(0x8A5A32, k), furShade: tint(0x563619, k), cream: tint(0xD9B48C, k), creamShade: tint(0x9E7A58, k),
        ears: { type: 'round', size: 1.0 }, tail: { type: 'stub' }, muzzle: { w: 0.085, h: 0.07, d: 0.1, y: 0.28, z: 0.72 },
        eyes: ADULT_EYES('bear', '#2a1a10', '#8a5a2a'), extras: [] };
      break; }
    case 'deer': {
      const H = 1.72 + rng() * 0.1; const k = 0.9 + rng() * 0.2;
      s = { ...adultBody(H, { headK: 0.105, pelvisK: 0.082 }), fur: tint(0xC48A5A, k), furShade: tint(0x8A5A34, k), cream: tint(0xF2E2C8, k), creamShade: tint(0xB99E86, k),
        ears: { type: 'leaf', inner: 0xF2E2C8, innerShade: 0xB99E86 }, tail: { type: 'stub', r: 0.05 }, muzzle: { w: 0.062, h: 0.055, d: 0.11, y: 0.32, z: 0.72, noseColor: 0x2a1a14 },
        eyes: ADULT_EYES('deer', '#1f140e', '#5a3a2a', { lid: 0.06 }), extras: female ? [] : ['antlers'] };
      break; }
    case 'dog': {
      const H = 1.58 + rng() * 0.12; const base = pick([[0xD9A86C, 0x9A7042, 0x5a3a24], [0xE8E0D0, 0xA99FBF, 0x6a5a4a], [0x6A4A34, 0x3E2A1C, 0xE8D8C0], [0x3a3a3f, 0x1f1f24, 0xd8d0c8]]);
      s = { ...adultBody(H, { headK: 0.112 }), fur: base[0], furShade: base[1], cream: 0xF2E8DA, creamShade: 0xB9A4C9, dark: base[2], darkShade: tint(base[2], 0.6),
        ears: { type: 'floppy', size: 1.0 }, tail: { type: 'long', len: H * 0.3, r: H * 0.028, pitch: 1.6 }, muzzle: { w: 0.075, h: 0.06, d: 0.11, y: 0.3, z: 0.7, color: 0xF2E8DA, shade: 0xB9A4C9 },
        eyes: ADULT_EYES('dog', '#3a2010', '#c08030'), extras: ['dogPatch'] };
      break; }
    case 'sheep': {
      const H = 1.52 + rng() * 0.1; const dark = rng() < 0.4;
      s = { ...adultBody(H, { headK: 0.11, pelvisK: 0.1, chestK: 1.2 }), fur: dark ? 0x3a3034 : 0xE9DCC6, furShade: dark ? 0x1e181b : 0xA99FBF, cream: dark ? 0x4a4044 : 0xF2E8DA, creamShade: dark ? 0x2a2428 : 0xB9A4C9,
        wool: 0xF7F1E4, woolShade: 0xC5B6D8, ears: { type: 'small', size: 1.3 }, tail: { type: 'stub', r: 0.04 }, muzzle: { w: 0.07, h: 0.06, d: 0.09, y: 0.3, z: 0.7, color: dark ? 0x4a4044 : 0xF2E8DA, shade: dark ? 0x2a2428 : 0xB9A4C9 },
        eyes: ADULT_EYES('sheep', '#2f3a4a', '#9fb8c8'), extras: ['wool'] };
      break; }
    case 'raccoon': {
      const H = 1.5 + rng() * 0.08;
      s = { ...adultBody(H, { headK: 0.12 }), fur: 0x8E8A86, furShade: 0x5A5658, cream: 0xEDE7DD, creamShade: 0xB9A4C9, dark: 0x3a2f33, darkShade: 0x1f181b,
        ears: { type: 'small', inner: 0xEDE7DD, innerShade: 0xB9A4C9, size: 1.2 }, tail: { type: 'long', len: H * 0.35, r: H * 0.04, pitch: 1.3, rings: true }, muzzle: { w: 0.06, h: 0.05, d: 0.09, y: 0.32, z: 0.72, color: 0xEDE7DD, shade: 0xB9A4C9 },
        eyes: ADULT_EYES('raccoon', '#1a1410', '#5a4a3a'), extras: ['mask'] };
      break; }
    case 'otter': {
      const H = 1.55 + rng() * 0.1; const k = 0.9 + rng() * 0.2;
      s = { ...adultBody(H, { headK: 0.108, torsoK: 0.32 }), fur: tint(0x6B4A33, k), furShade: tint(0x3E2A1C, k), cream: tint(0xD9C4A8, k), creamShade: tint(0x9E8A72, k),
        ears: { type: 'small', size: 0.9 }, tail: { type: 'thick', len: H * 0.38, r: H * 0.05, pitch: 1.5 }, muzzle: { w: 0.085, h: 0.05, d: 0.08, y: 0.3, z: 0.7 },
        eyes: ADULT_EYES('otter', '#1a1410', '#4a3a2a'), extras: [] };
      break; }
    default: { // boar
      const H = 1.68 + rng() * 0.12;
      s = { ...adultBody(H, { headK: 0.115, pelvisK: 0.105, chestK: 1.25 }), fur: 0x5E4A3C, furShade: 0x362A20, cream: 0x8E7A68, creamShade: 0x5a4a3e, dark: 0x2a1f18, darkShade: 0x15100c,
        ears: { type: 'pig', size: 1.1 }, tail: { type: 'long', len: H * 0.18, r: H * 0.015, pitch: 1.4 }, muzzle: { w: 0.085, h: 0.07, d: 0.12, y: 0.3, z: 0.72, snout: true, snoutColor: 0x4a3a30, snoutShade: 0x2a1f18 },
        eyes: ADULT_EYES('boar', '#1a1410', '#6a4a2a'), extras: ['tusks', 'boarMane'] };
    }
  }
  s.name = `crowd${seed}`; s.inkId = inkId; s.lod = 'crowd'; s.species = species;
  s.clothes = { tunic: { color: cloth[0], shade: cloth[1], sleeveless: rng() < 0.5 } };
  if (female) { s.clothes.apron = { color: cloth2[0], shade: cloth2[1] }; if (rng() < 0.7) s.clothes.headscarf = { color: cloth2[0], shade: cloth2[1] }; }
  else if (rng() < 0.4) s.clothes.sash = { color: cloth2[0], shade: cloth2[1] };
  s.female = female;
  return s;
}
