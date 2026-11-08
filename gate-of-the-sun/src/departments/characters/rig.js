// Parametric FK rig for anthropomorphic animal characters, drawn-anime polish pass: egg skulls with
// cheek tufts and forelocks, leaf ears, lathe torsos, tapered limbs, soft mitten hands, rounded feet.
// No SkinnedMesh. Local frame: +z forward, +y up, +x is the character's left. root sits at the feet.
//
// Head hierarchy (the anime "face cheat"):
//   head joint -> headMesh (egg skull, scaled by headScale)
//              -> skull group (ears, tufts, forelock, horns): never cheated, keeps the silhouette
//              -> face group (rotated toward the camera every frame by updateCheat)
//                   -> faceS (scaled by headScale): eyes, brows, blush, masks
//                   -> muzzle, nose, mouth, glasses, tear
import * as THREE from 'three';
import { makeEyeFrames, makeMouthFrames, makeBlushTexture, makeEarTexture } from './eyes.js';
import * as S from './shapes.js';

// ------------------------------------------------------------------ caches
const geoCache = new Map();
function cached(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }
const r3 = (v) => Math.round(v * 1000) / 1000;
export const G = {
  sphere: (r, w = 16, h = 12) => cached(`sp${r3(r)}_${w}_${h}`, () => new THREE.SphereGeometry(r, w, h)),
  capsule: (r, len, cs = 4, rs = 12) => cached(`cp${r3(r)}_${r3(len)}_${cs}_${rs}`, () => new THREE.CapsuleGeometry(r, Math.max(0.001, len), cs, rs)),
  box: (w, h, d) => cached(`bx${r3(w)}_${r3(h)}_${r3(d)}`, () => new THREE.BoxGeometry(w, h, d)),
  cone: (r, h, rs = 10) => cached(`cn${r3(r)}_${r3(h)}_${rs}`, () => new THREE.ConeGeometry(r, h, rs)),
  cyl: (rt, rb, h, rs = 12) => cached(`cy${r3(rt)}_${r3(rb)}_${r3(h)}_${rs}`, () => new THREE.CylinderGeometry(rt, rb, h, rs)),
  torus: (R, t, rs = 8, ts = 24, arc = Math.PI * 2) => cached(`to${r3(R)}_${r3(t)}_${rs}_${ts}_${r3(arc)}`, () => new THREE.TorusGeometry(R, t, rs, ts, arc)),
  patch: (r, ws, hs, phi0, phiLen, th0, thLen) => cached(`pa${r3(r)}_${ws}_${hs}_${r3(phi0)}_${r3(phiLen)}_${r3(th0)}_${r3(thLen)}`, () => new THREE.SphereGeometry(r, ws, hs, phi0, phiLen, th0, thLen)),
  plane: (w, h) => cached(`pl${r3(w)}_${r3(h)}`, () => new THREE.PlaneGeometry(w, h)),
  lathe: (key, pts, segs = 14) => cached(`la${key}`, () => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), segs)),
};

// ------------------------------------------------------------------ colour helpers
const ch = (hex, i) => (hex >> (16 - 8 * i)) & 255;
const pack = (r, g, b) => (Math.min(255, Math.max(0, Math.round(r))) << 16) | (Math.min(255, Math.max(0, Math.round(g))) << 8) | Math.min(255, Math.max(0, Math.round(b)));
/** deeper core-shadow tone: darker and cooler (violet) than the painted shade */
export function deeper(hex, k = 0.8) { return pack(ch(hex, 0) * k * 0.94, ch(hex, 1) * k * 0.92, ch(hex, 2) * k * 1.06); }
/** warm highlight tone toward cream */
export function lighter(hex, k = 0.3) { return pack(ch(hex, 0) + (255 - ch(hex, 0)) * k, ch(hex, 1) + (250 - ch(hex, 1)) * k, ch(hex, 2) + (232 - ch(hex, 2)) * k); }
export function darker(hex, k = 0.72) { return pack(ch(hex, 0) * k, ch(hex, 1) * k, ch(hex, 2) * k * 1.04); }

const matCache = new Map();
/** cel material, cached by colour and options (shade2, highlight, paint, side) */
export function celMat(ctx, color, shade, opts = {}) {
  const key = `${color}_${shade ?? 'auto'}_${opts.shade2 ?? ''}_${opts.highlight ?? ''}_${opts.highlightEdge ?? ''}_${opts.paint ?? ''}_${opts.side ?? ''}`;
  let m = matCache.get(key);
  if (!m) { m = ctx.makeCel({ color, shade, wobble: 0.1, ...(opts.shade2 !== undefined ? { band2Edge: -0.6 } : {}), ...opts }); matCache.set(key, m); }
  return m;
}
/** linear-space ratio a / b as an sRGB hex (a shade multiplier for a white-based mapped material) */
function ratioHex(a, b) { const A = new THREE.Color(a), B = new THREE.Color(b); return new THREE.Color(Math.min(1, A.r / Math.max(1e-4, B.r)), Math.min(1, A.g / Math.max(1e-4, B.g)), Math.min(1, A.b / Math.max(1e-4, B.b))).getHex(); }
const css = (hex) => '#' + (hex >>> 0).toString(16).padStart(6, '0');
const earMatCache = new Map();
/** cel material carrying a painted ear texture: lit = texture, shadows keep the fur's shade ratios */
function earMat(ctx, o, fur, furShade) {
  const key = JSON.stringify(o) + fur + '_' + furShade;
  let m = earMatCache.get(key);
  if (!m) {
    const tex = makeEarTexture({ ...o, fur: css(fur), inner: css(o.inner), tip: o.tip !== undefined ? css(o.tip) : undefined });
    m = ctx.makeCel({ color: 0xffffff, map: tex, shade: ratioHex(furShade, fur), shade2: ratioHex(deeper(furShade, 0.82), fur), band2Edge: -0.6, wobble: 0.1 });
    earMatCache.set(key, m);
  }
  return m;
}
const flatCache = new Map();
export function flatMat(ctx, color) {
  let m = flatCache.get(color); if (!m) { m = ctx.makeFlat({ color }); flatCache.set(color, m); } return m;
}
const eyeSetCache = new Map();
export function eyeSet(styleKey, style) {
  let s = eyeSetCache.get(styleKey);
  if (!s) { s = { L: makeEyeFrames(style, 'L'), R: makeEyeFrames(style, 'R') }; eyeSetCache.set(styleKey, s); }
  return s;
}
let mouthFrames = null;
export function mouthSet() { if (!mouthFrames) mouthFrames = makeMouthFrames(); return mouthFrames; }
let blushTex = null;
const eyeMatCache = new Map();
function eyeMat(ctx, tex) { let m = eyeMatCache.get(tex); if (!m) { m = ctx.makeFlat({ map: tex, alphaTest: 0.5 }); eyeMatCache.set(tex, m); } return m; }

export const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'uaL', 'uaR', 'faL', 'faR', 'handL', 'handR',
  'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'tail', 'tail2', 'earL', 'earR', 'browL', 'browR', 'glasses', 'prop'];

const DEG = Math.PI / 180;

/**
 * buildFigure(ctx, spec) -> fig { root, j, base, dims, parts, setPose, setEyes, setMouth, headWorld(),
 *   updateCheat(camPos), setCloseUp(on), face, skull, headMesh }
 */
export function buildFigure(ctx, spec) {
  const { LAYER } = ctx;
  const hero = spec.lod !== 'crowd';
  const SW = hero ? 20 : 12, SH = hero ? 14 : 8, RS = hero ? 14 : 8, CAP = hero ? 4 : 2;
  const fig = { spec, parts: [], j: {}, base: {}, dims: {}, name: spec.name };
  const root = new THREE.Group(); root.name = spec.name; fig.root = root;

  // ------------------------------------------------------------ materials
  const fur = celMat(ctx, spec.fur, spec.furShade, { shade2: deeper(spec.furShade) });
  const furHi = celMat(ctx, spec.fur, spec.furShade, { shade2: deeper(spec.furShade), highlight: lighter(spec.fur, 0.32) });
  const creamC = spec.cream ?? spec.fur, creamS = spec.creamShade ?? spec.furShade;
  const cream = celMat(ctx, creamC, creamS, { shade2: deeper(creamS) });
  const dark = celMat(ctx, spec.dark ?? 0x2b1d1a, spec.darkShade ?? 0x15100e);
  const cloth = (c) => celMat(ctx, c.color, c.shade, { paint: 'soft', paintScale: 0.6, paintAmount: 0.5 });
  const clothDS = (c) => celMat(ctx, c.color, c.shade, { paint: 'soft', paintScale: 0.6, paintAmount: 0.5, side: THREE.DoubleSide });

  function part(parent, geometry, material, name, pos, rot, scale) {
    const m = new THREE.Mesh(geometry, material);
    m.name = `${spec.name}_${name}`;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    parent.add(m); fig.parts.push(m);
    return m;
  }
  function joint(parent, name, pos, rot, order) {
    const g = new THREE.Group(); g.name = `${spec.name}_j_${name}`;
    if (order) g.rotation.order = order;
    if (pos) g.position.set(pos[0], pos[1], pos[2]);
    if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(g); fig.j[name] = g; fig.base[name] = rot ? [rot[0], rot[1], rot[2]] : [0, 0, 0];
    return g;
  }
  function group(parent, name, pos) { const g = new THREE.Group(); g.name = `${spec.name}_g_${name}`; if (pos) g.position.set(pos[0], pos[1], pos[2]); parent.add(g); return g; }

  // ------------------------------------------------------------ dimensions
  const H = spec.H;
  const headR = spec.headR;
  const d = fig.dims;
  d.H = H; d.headR = headR;
  d.thigh = spec.thigh; d.shin = spec.shin; d.footH = spec.footH; d.footL = spec.footL ?? d.footH * 2.6; d.footW = spec.footW ?? d.footH * 1.6;
  d.hipsY = spec.hipsY ?? (d.thigh + d.shin + d.footH);
  d.torso = spec.torso; d.neck = spec.neck;
  d.pelvis = spec.pelvis; d.hipW = spec.hipW; d.hipDrop = spec.hipDrop ?? d.pelvis[1] * 0.25;
  d.limbR = spec.limbR; d.armR = spec.armR ?? spec.limbR * 0.8;
  d.shoulderW = spec.shoulderW; d.upperArm = spec.upperArm; d.foreArm = spec.foreArm;
  d.chest = spec.chest; d.headScale = spec.headScale ?? [1, 1, 1];
  d.headCentreY = spec.headCentreY ?? headR * d.headScale[1] * 0.92;   // head centre above the neck joint
  d.pelvisBottom = d.pelvis[1];
  d.standHead = d.hipsY + d.torso + d.neck + d.headCentreY;
  const T = d.torso, P = d.pelvis[0], p = d.pelvis[1], C = d.chest[0];
  const B = spec.bellyR ?? P * 0.9;
  const depth = Math.min(0.95, (d.chest[2] / C) * 0.9);              // torso front-back flattening

  // ------------------------------------------------------------ hips and legs
  const hips = joint(root, 'hips', [0, d.hipsY, 0]);
  const pelvisMat = spec.clothes?.dress ? cloth(spec.clothes.dress) : (spec.clothes?.tunic ? cloth(spec.clothes.tunic) : fur);
  part(hips, G.sphere(1, SW, SH), pelvisMat, 'pelvis', [0, 0, 0], null, [P, p, d.pelvis[2]]);

  const footMat = spec.clothes?.boots ? dark : (spec.footColor ? celMat(ctx, spec.footColor, spec.footShade) : fur);
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const th = joint(hips, 'thigh' + s, [sx * d.hipW, -d.hipDrop, 0]);
    // radii stay inside the clearance maths of poses.js (limbR at hip and knee, 0.82 limbR at the ankle)
    part(th, S.taperLimb(d.limbR, d.limbR * 0.8, d.thigh, RS, CAP, 0.08), fur, 'thigh' + s);
    const sh = joint(th, 'shin' + s, [0, -d.thigh, 0]);
    part(sh, S.taperLimb(d.limbR * 0.8, d.limbR * 0.6, d.shin, RS, CAP, 0.14), fur, 'shin' + s);
    if (spec.clothes?.boots) {
      const bp = S.smoothProfile([[d.limbR * 0.66, -d.shin - 0.004], [d.limbR * 0.74, -d.shin * 0.8], [d.limbR * 0.84, -d.shin * 0.55], [d.limbR * 0.93, -d.shin * 0.42], [d.limbR * 0.88, -d.shin * 0.38]], 3);
      part(sh, S.lathe(`boot${r3(d.limbR)}_${r3(d.shin)}`, bp, RS), celMat(ctx, spec.dark ?? 0x2b1d1a, spec.darkShade ?? 0x15100e, { side: THREE.DoubleSide }), 'boot' + s);
    }
    const ft = joint(sh, 'foot' + s, [0, -d.shin, 0]);
    part(ft, S.footShape(d.footW, d.footH, d.footL, d.footL * 0.22, hero ? 14 : 8), footMat, 'foot' + s);
  }

  // ------------------------------------------------------------ torso (one lathe: belly, waist, chest, shoulders)
  const spine = joint(hips, 'spine', [0, 0, 0]);
  const waist = Math.min(B, C) * 0.9;
  const torsoPts = [[0.001, -p * 0.55], [P * 0.7, -p * 0.45], [P * 0.93, -p * 0.08], [Math.max(B, P * 0.9) * 0.98, T * 0.16], [waist, T * 0.34],
    [C * 0.95, T * 0.52], [C * 1.0, T * 0.66], [C * 0.97, T * 0.78], [C * 0.84, T * 0.88], [C * 0.56, T * 0.96], [headR * 0.42, T * 1.0], [0.001, T * 1.02]];
  const torsoProfile = S.smoothProfile(torsoPts, hero ? 3 : 2);
  const torsoAt = (y) => { for (let i = 0; i < torsoProfile.length - 1; i++) { const a = torsoProfile[i], b = torsoProfile[i + 1]; if (y >= a[1] && y <= b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / Math.max(1e-6, b[1] - a[1]); } return 0; };
  part(spine, S.lathe(`torso_${spec.name}_${r3(T)}_${r3(P)}_${r3(C)}`, torsoProfile, RS + 2), fur, 'torso', [0, 0, 0], null, [1, 1, depth]);
  const chest = joint(spine, 'chest', [0, T * 0.5, 0]);
  if (spec.clothes?.chestPatch) {
    part(chest, G.sphere(1, SW, SH), cream, 'chestPatch', [0, T * 0.4, C * depth * 0.62], null, [C * 0.5, T * 0.16, C * 0.42 * depth]);
  }
  /** a clothing shell over the torso between y0 and y1 (spine frame), inflated by k */
  const shell = (key, y0, y1, k, add, segs, phiStart, phiLen) => {
    const pts = []; const n = hero ? 12 : 6;
    for (let i = 0; i <= n; i++) { const y = y0 + (y1 - y0) * i / n; pts.push([torsoAt(y) * k + add, y]); }
    return S.lathe(`${key}_${spec.name}`, pts, segs ?? RS + 2, phiStart ?? 0, phiLen ?? Math.PI * 2);
  };
  const tunic = spec.clothes?.tunic;
  if (tunic) {
    const tm = clothDS(tunic);
    // body of the tunic up to a collar line, then a flared hem on the hips (the hips frame stays upright when seated)
    part(spine, shell('tunic', -p * 0.05, T * 0.965, 1.07, 0.004), tm, 'tunic', [0, 0, 0], null, [1, 1, depth]);
    const r0 = torsoAt(p * 0.15) * 1.08 + 0.004;
    const hemPts = S.smoothProfile([[r0 * 0.98, p * 0.35], [r0 * 1.0, p * 0.05], [r0 * 1.06, -p * 0.2], [r0 * 1.15, -p * 0.4], [r0 * 1.2, -p * 0.48]], 3);
    part(hips, S.lathe(`hem_${spec.name}`, hemPts, RS + 4), tm, 'hem', [0, 0, 0], null, [1, 1, Math.min(0.98, depth * 1.05)]);
    const collarR = torsoAt(T * 0.965) * 1.07 + 0.004;
    part(spine, G.torus(collarR, Math.max(0.006, headR * 0.035), 5, RS + 4), celMat(ctx, tunic.shade, darker(tunic.shade, 0.75)), 'collar', [0, T * 0.965, 0], [Math.PI / 2, 0, 0], [1, depth, 1]);
  }
  if (spec.clothes?.waistcoat) {
    const wc = clothDS(spec.clothes.waistcoat);
    // open-fronted waistcoat: lathe with a gap at the front (phi = 0 is +z)
    part(spine, shell('waistcoat', T * 0.04, T * 0.93, 1.08, 0.006, RS + 2, 0.42, Math.PI * 2 - 0.84), wc, 'waistcoat', [0, 0, 0], null, [1, 1, depth]);
    const wy = T * 0.04; const wr = torsoAt(wy) * 1.08 + 0.006;
    for (const sx of [-1, 1]) part(spine, G.cone(wr * 0.16, T * 0.12, 4), wc, 'waistcoatPoint' + (sx > 0 ? 'L' : 'R'), [sx * Math.sin(0.5) * wr, wy - T * 0.04, Math.cos(0.5) * wr * depth], [Math.PI, 0, 0], [1, 1, 0.35]);
  }
  if (spec.clothes?.apron) {
    const ap = clothDS(spec.clothes.apron);
    const ar = P * 1.1;
    const aPts = S.smoothProfile([[ar, p * 0.3], [ar * 1.02, -p * 0.4], [ar * 1.12, -p - T * 0.35], [ar * 1.2, -p - T * 0.6]], 3);
    part(hips, S.lathe(`apron_${spec.name}`, aPts, 10, -0.95, 1.9), ap, 'apron', [0, 0, 0], null, [1, 1, 0.95]);
    part(spine, shell('apronBib', T * 0.42, T * 0.84, 1.1, 0.008, 8, -0.7, 1.4), ap, 'apronBib', [0, 0, 0], null, [1, 1, depth]);
  }
  if (spec.clothes?.dress) {
    const dr = clothDS(spec.clothes.dress);
    const skirtLen = d.hipsY * 0.78;
    const pts = S.smoothProfile([[P * 0.95, p * 0.3], [P * 1.0, 0], [P * 1.15, -skirtLen * 0.35], [P * 1.55, -skirtLen * 0.8], [P * 1.75, -skirtLen]], 3);
    part(hips, S.lathe(`skirt${r3(P)}_${r3(skirtLen)}`, pts, RS + 4), dr, 'skirt', [0, p * 0.1, 0], null, [1, 1, 0.9]);
    part(spine, shell('bodice', -p * 0.05, T * 0.965, 1.07, 0.004), dr, 'bodice', [0, 0, 0], null, [1, 1, depth]);
    part(spine, G.torus(torsoAt(T * 0.965) * 1.07 + 0.004, Math.max(0.006, headR * 0.035), 5, RS + 4), celMat(ctx, spec.clothes.dress.shade, darker(spec.clothes.dress.shade, 0.75)), 'collar', [0, T * 0.965, 0], [Math.PI / 2, 0, 0], [1, depth, 1]);
  }
  if (spec.clothes?.sash) {
    const sm = cloth(spec.clothes.sash);
    part(spine, G.torus(torsoAt(T * 0.12) * 1.12 + 0.01, 0.022, 6, RS + 4), sm, 'sash', [0, T * 0.12, 0], [Math.PI / 2, 0, 0], [1, depth, 1]);
  }

  // shoulders and arms: tapered limbs, larger soft hands
  const tunicMat = tunic ? cloth(tunic) : null;
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const ua = joint(chest, 'ua' + s, [sx * d.shoulderW, T * 0.42, 0]);
    const sleeve = tunic && !tunic.sleeveless;
    const uaMat = sleeve ? tunicMat : fur;
    part(ua, G.sphere(d.armR * 1.25, SW - 4, SH - 2), uaMat, 'shoulder' + s, [0, 0, 0]);
    part(ua, S.taperLimb(d.armR * 1.15, d.armR * 0.95, d.upperArm, RS, CAP, 0.06), uaMat, 'upperArm' + s);
    const fa = joint(ua, 'fa' + s, [0, -d.upperArm, 0]);
    part(fa, S.taperLimb(d.armR * 0.98, d.armR * 0.8, d.foreArm, RS, CAP, 0.14), fur, 'foreArm' + s);
    const hand = joint(fa, 'hand' + s, [0, -d.foreArm, 0]);
    buildHand(fig, hand, s, d.armR, spec.handColor ? celMat(ctx, spec.handColor, spec.handShade) : (spec.cream && spec.creamHands ? cream : fur), hero);
  }

  // ------------------------------------------------------------ neck and head
  const neck = joint(chest, 'neck', [0, T * 0.5, 0.0]);
  part(neck, G.cyl(headR * 0.38, headR * 0.44, d.neck + headR * 0.3, RS), fur, 'neck', [0, d.neck * 0.5 + headR * 0.05, 0]);
  if (spec.clothes?.scarf) {
    const sc = cloth(spec.clothes.scarf);
    part(neck, G.torus(headR * 0.5, headR * 0.17, 8, RS + 4), sc, 'scarf', [0, d.neck * 0.55, 0.0], [Math.PI / 2, 0, 0]);
    part(neck, S.earShape('leaf', headR * 0.95, headR * 0.15, headR * 0.03, 0, 1, 1, 1, 6, 6, 0), sc, 'scarfTail', [headR * 0.18, d.neck * 0.3, headR * 0.52], [Math.PI - 0.1, 0, -0.12]);
  }
  if (spec.clothes?.neckerchief) {
    const nk = cloth(spec.clothes.neckerchief);
    part(neck, G.torus(headR * 0.46, headR * 0.1, 6, RS + 4), nk, 'kerchief', [0, d.neck * 0.45, 0.0], [Math.PI / 2, 0, 0]);
    part(neck, G.cone(headR * 0.3, headR * 0.6, 4), nk, 'kerchiefFlap', [0, d.neck * 0.45 - headR * 0.35, headR * 0.5], [Math.PI + 0.25, Math.PI / 4, 0], [1, 1, 0.4]);
  }
  const head = joint(neck, 'head', [0, d.neck, 0]);
  const hs = d.headScale;
  const SK = spec.skull ?? { crown: 0.14, jaw: 0.2, lift: 0.06 };
  fig.skullK = SK;
  const headMesh = part(head, S.eggHead(headR, hero ? 30 : 14, hero ? 22 : 10, SK), furHi, 'head', [0, d.headCentreY, 0], null, hs);
  fig.headMesh = headMesh;
  const skull = group(head, 'skull', [0, d.headCentreY, 0]); fig.skull = skull;
  const face = group(head, 'face', [0, d.headCentreY, 0]); face.rotation.order = 'YXZ'; fig.face = face;
  const faceS = group(face, 'faceS'); faceS.scale.set(hs[0], hs[1], hs[2]); fig.faceS = faceS;
  /** point on the skull surface (unscaled skull space) for azimuth / elevation, pushed out by off */
  const onSkull = (az, el, off = 0) => {
    const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(az) * Math.cos(el);
    const v = S.skullPoint(headR, dx, dy, dz, SK); return [(v.x + dx * off) * hs[0], (v.y + dy * off) * hs[1], (v.z + dz * off) * hs[2]];
  };
  fig.onSkull = onSkull;

  // eyes as skull-hugging patches; close-ups get 10 percent bigger, slightly wider spaced eyes
  const ey = spec.eyes;
  const set = eyeSet(ey.key, ey.style);
  fig.eyeFrames = set; fig.eyeMeshes = {};
  const eyeSeg = hero ? 12 : 6;
  const eyeGeo = (k) => S.skullPatch(headR, SK, 0.0035, eyeSeg, eyeSeg, Math.PI / 2 - ey.phiLen * k / 2, ey.phiLen * k, Math.PI / 2 - ey.elev - ey.thetaLen * k / 2, ey.thetaLen * k);
  const eyeGeoBase = eyeGeo(1), eyeGeoClose = hero ? eyeGeo(1.1) : eyeGeoBase;
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const m = new THREE.Mesh(eyeGeoBase, eyeMat(ctx, set[s].open)); m.name = `${spec.name}_eye${s}`;
    m.rotation.y = sx * ey.az; faceS.add(m); fig.parts.push(m); fig.eyeMeshes[s] = m;
  }
  fig.setEyes = (frame) => { for (const s of ['L', 'R']) { const t = set[s][frame] || set[s].open; fig.eyeMeshes[s].material = eyeMat(ctx, t); } };

  // brows: thin tapered curved ribbons lying on the skull, slightly darker than the fur
  const browEl = ey.elev + ey.thetaLen * 0.56, browAz = ey.az * 0.98;
  const browRad = (() => { const v = S.skullPoint(headR, 0, Math.sin(browEl), Math.cos(browEl), SK); return v.length() + 0.0028; })();
  const browMat = celMat(ctx, spec.browColor ?? darker(spec.fur, 0.6), spec.browShade ?? darker(spec.furShade, 0.6));
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const g = joint(faceS, 'brow' + s, [0, 0, 0], [-browEl, sx * browAz, 0], 'YXZ');
    fig['browMesh' + s] = part(g, S.browRibbon(browRad, ey.phiLen * 0.36, hero ? 0.09 : 0.1, 0.05, s, hero ? 12 : 6), browMat, 'brow' + s);
  }

  // cheek blush (kids and children only): hatched pink decals under the eyes
  if (hero && spec.blush !== false) {
    if (!blushTex) blushTex = makeBlushTexture();
    const bm = ctx.makeFlat({ map: blushTex, alphaTest: 0.5 });
    const bGeo = S.skullPatch(headR, SK, 0.003, 6, 4, Math.PI / 2 - 0.17, 0.34, Math.PI / 2 + 0.06, 0.2);
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(bGeo, bm); m.name = `${spec.name}_blush${sx > 0 ? 'L' : 'R'}`; m.rotation.y = sx * (ey.az + 0.16); faceS.add(m); fig.parts.push(m); }
  }

  // muzzle (soft, flattened), nose, mouth: on the cheated face
  const mz = spec.muzzle;
  const mzMat = celMat(ctx, mz.color ?? creamC, mz.shade ?? creamS, { shade2: deeper(mz.shade ?? creamS) });
  const mzPos = [0, -headR * (mz.y ?? 0.3), headR * (mz.z ?? 0.72)];
  const mw = mz.w * 1.08, mh = mz.h * 0.92, md = mz.d * 0.82;
  part(face, G.sphere(1, SW, SH), mzMat, 'muzzle', [mzPos[0], mzPos[1], mzPos[2] + mz.d * 0.08], null, [mw, mh, md]);
  const mzFront = mzPos[2] + mz.d * 0.08 + md;
  const noseMat = celMat(ctx, mz.noseColor ?? 0x2b1d1a, mz.noseShade ?? 0x15100e, { highlight: lighter(mz.noseColor ?? 0x2b1d1a, 0.35), highlightEdge: 0.7 });
  if (mz.snout) {
    part(face, G.cyl(mz.w * 0.55, mz.w * 0.6, mz.d * 0.35, RS), celMat(ctx, mz.snoutColor ?? 0xE89AA8, mz.snoutShade ?? 0xB86878), 'snout', [0, mzPos[1] + mz.h * 0.15, mzFront - mz.d * 0.05], [Math.PI / 2, 0, 0]);
    for (const sx of [-1, 1]) part(face, G.sphere(mz.w * 0.12, 8, 6), noseMat, 'nostril' + sx, [sx * mz.w * 0.22, mzPos[1] + mz.h * 0.15, mzFront + mz.d * 0.13]);
  } else {
    part(face, G.sphere(1, SW - 6, SH - 4), noseMat, 'nose', [0, mzPos[1] + mh * 0.5, mzFront - md * 0.12], null, [mw * 0.4, mh * 0.32, md * 0.3]);
  }
  const mouths = mouthSet(); fig.mouthFrames = mouths;
  const mouth = new THREE.Mesh(G.plane(mz.w * 2.0, mz.w * 2.0), eyeMat(ctx, mouths.closed)); mouth.name = `${spec.name}_mouth`;
  mouth.position.set(0, mzPos[1] - mh * 0.42, mzPos[2] + mz.d * 0.08 + md * 0.86); mouth.rotation.x = -0.55;
  face.add(mouth); fig.parts.push(mouth); fig.mouthMesh = mouth;
  fig.setMouth = (k) => { mouth.material = eyeMat(ctx, mouths[k] || mouths.closed); };

  // skull silhouette: ears, cheek tufts, forelock
  const k = { fur, furHi, cream, dark, hero, SW, SH, CAP, RS, part, joint, group, ctx, onSkull, SK };
  buildEars(fig, skull, spec, k);
  buildTufts(fig, skull, spec, k);
  buildTail(fig, hips, spec, k);
  buildExtras(fig, face, faceS, skull, spec, k);
  if (spec.clothes?.headscarf) {
    const hc = cloth(spec.clothes.headscarf);
    const cap = new THREE.Mesh(S.skullPatch(headR, SK, 0.012, SW, 6, 0, Math.PI * 2, 0, 1.35), hc); cap.name = `${spec.name}_headscarf`; cap.scale.set(hs[0], hs[1], hs[2]);
    skull.add(cap); fig.parts.push(cap);
    part(skull, G.sphere(headR * 0.18, 8, 6), hc, 'scarfKnot', [0, -headR * 0.15, -headR * 0.95]);
  }
  if (spec.clothes?.satchel) {
    const sm = cloth(spec.clothes.satchel);
    part(hips, S.roundBox(headR * 0.45, headR * 0.35, headR * 0.15, 0.4, 10, 6), sm, 'satchel', [-P * 1.05 - headR * 0.1, 0.0, -d.pelvis[2] * 0.2]);
    part(spine, G.cyl(0.012, 0.012, T * 1.25, 6), sm, 'strap', [0, T * 0.5, C * depth * 0.95], [0, 0, 0.62]);
  }

  // prop joint on the right hand (jug, basket, cloth, pebble)
  joint(fig.j.handR, 'prop', [0, -d.armR * 1.6, 0]);

  // layer and ink tags
  ctx.tag(root, { inkId: spec.inkId, layer: LAYER.FG, castShadow: true, receiveShadow: true });
  for (const m of fig.parts) if (m.material && m.material.userData.isFlat) { m.castShadow = false; }

  // ------------------------------------------------------------ face cheat and close-ups
  const _c = new THREE.Vector3();
  /** rotate the face toward the camera: up to 35 degrees yaw, 20 pitch; fades out for back views */
  fig.updateCheat = (camPos, o = {}) => {
    if (!root.visible) return;
    root.updateMatrixWorld(true);
    head.worldToLocal(_c.copy(camPos)); _c.y -= d.headCentreY;
    const yaw = Math.atan2(_c.x, _c.z), pitch = Math.atan2(_c.y, Math.hypot(_c.x, _c.z));
    const ay = Math.abs(yaw);
    const w = (o.weight ?? 1) * (ay < 100 * DEG ? 1 : Math.max(0, 1 - (ay - 100 * DEG) / (50 * DEG)));
    const maxY = (o.maxYaw ?? 35) * DEG, maxP = (o.maxPitch ?? 20) * DEG;
    face.rotation.set(-Math.max(-maxP, Math.min(maxP, pitch)) * w, Math.max(-maxY, Math.min(maxY, yaw * 0.9)) * w, 0);
    face.updateMatrixWorld(true);
  };
  fig.closeUp = false;
  fig.setCloseUp = (on) => {
    on = !!on && hero;
    fig.closeUp = on;
    const kAz = on ? 1.08 : 1;
    for (const s of ['L', 'R']) { const sx = s === 'L' ? 1 : -1; fig.eyeMeshes[s].geometry = on ? eyeGeoClose : eyeGeoBase; fig.eyeMeshes[s].rotation.y = sx * ey.az * kAz; }
    if (fig.glassSides) for (const gs of fig.glassSides) gs.update(on);
  };

  fig.setPose = (pose) => applyPose(fig, pose);
  fig.headWorld = (() => { const v = new THREE.Vector3(); return () => { root.updateMatrixWorld(true); return headMesh.getWorldPosition(v).toArray(); }; })();
  fig.triangles = () => fig.parts.reduce((a, m) => { const idx = m.geometry.index; return a + (idx ? idx.count / 3 : m.geometry.attributes.position.count / 3); }, 0);
  return fig;
}

// ------------------------------------------------------------------ hands
/** soft mitten hand: rounded palm, three rounded fingers and a thumb, a little larger than life (anime) */
function buildHand(fig, hand, side, armR, mat, hero) {
  const sx = side === 'L' ? 1 : -1;
  const name = `${fig.spec.name}_hand${side}`;
  const rs = hero ? 8 : 5, cap = hero ? 3 : 2;
  const pw = armR * 2.25, ph = armR * 2.05, pd = armR * 1.2;
  const palm = new THREE.Mesh(S.roundBox(pw / 2, ph / 2, pd / 2, 0.55, hero ? 12 : 8, hero ? 8 : 6), mat); palm.name = name + '_palm'; palm.position.set(0, -ph * 0.42, 0); hand.add(palm); fig.parts.push(palm);
  const fr = pw * 0.15, fl = ph * 0.42;
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(S.taperLimb(fr, fr * 0.9, fl * (i === 1 ? 1.05 : 0.95), rs, cap), mat); f.name = name + '_finger' + i;
    f.position.set((i - 1) * pw * 0.3, -ph * 0.78, pd * 0.04); f.rotation.x = -0.32; f.rotation.z = (i - 1) * 0.08; hand.add(f); fig.parts.push(f);
  }
  const th = new THREE.Mesh(S.taperLimb(fr * 1.1, fr * 0.95, fl * 0.72, rs, cap), mat); th.name = name + '_thumb';
  th.position.set(-sx * pw * 0.4, -ph * 0.32, pd * 0.22); th.rotation.z = -sx * 0.75; th.rotation.x = -0.45; hand.add(th); fig.parts.push(th);
  hand.userData.handMeshes = [palm, th];
  return hand;
}

// ------------------------------------------------------------------ ears
function buildEars(fig, skull, spec, k) {
  const { part, joint, group, fur, furHi, cream, dark, RS, hero, onSkull } = k;
  const R = fig.dims.headR; const e = spec.ears || { type: 'round' };
  const innerMat = e.inner ? celMat(k.ctx, e.inner, e.innerShade) : cream;
  const tipMat = e.tip ? celMat(k.ctx, e.tip, e.tipShade ?? deeper(e.tip, 0.8)) : dark;
  const segL = hero ? 12 : 6, segW = hero ? 10 : 6;
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const sz = e.size ?? 1;
    let az, el, tiltZ, tiltX = 0;
    switch (e.type) {
      case 'fox': az = 0.52; el = 0.98; tiltZ = 0.28; tiltX = -0.08; break;
      case 'hare': az = 0.32; el = 1.2; tiltZ = 0.12; tiltX = -0.12; break;
      case 'lynx': az = 0.6; el = 0.95; tiltZ = 0.36; break;
      case 'leaf': az = 1.2; el = 0.45; tiltZ = 1.15; break;
      case 'goat': az = 1.25; el = 0.4; tiltZ = 1.5; break;
      case 'floppy': az = 1.15; el = 0.75; tiltZ = 1.25; break;
      case 'pig': az = 0.7; el = 1.0; tiltZ = 0.75; tiltX = 0.5; break;
      case 'small': az = 0.75; el = 0.95; tiltZ = 0.45; break;
      default: az = 0.8; el = 0.85; tiltZ = 0.45; break; // round
    }
    if (e.flop === s && e.type !== 'hare') { tiltZ += 0.85; tiltX += 0.2; }
    // ear pivot just under the skull surface (az measured from the face toward the side)
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el) * sx, Math.sin(el), Math.cos(az) * Math.cos(el) * 0.2).normalize();
    const pos = onSkull(Math.atan2(dir.x, dir.z), Math.asin(dir.y), -0.07 * R);
    const g = joint(skull, 'ear' + s, pos, [tiltX, 0, -sx * tiltZ]);
    switch (e.type) {
      case 'hare': {
        // flattened tapered leaf with a painted pink inner panel; the flop ear folds backward at a third of its length
        const L = R * 1.85 * sz, W = R * 0.3 * sz, TH = R * 0.07 * sz;
        const flop = e.flop === s;
        const geo = S.earGeo('leaf', L, W, TH, { segL: hero ? 18 : 8, segW: hero ? 14 : 8, bend: flop ? -1.25 : -0.08, bendAt: 0.34, cup: 0.3 });
        part(g, geo, earMat(k.ctx, { inner: e.inner, v0: 0.1, v1: 0.88, panel: 0.56 }, spec.fur, spec.furShade), 'ear' + s);
        break; }
      case 'fox': case 'lynx': {
        // pointed triangle ears, cream inner panel and dark tip painted on; the lynx adds a thin dark tuft spike
        const lynx = e.type === 'lynx';
        const L = R * (lynx ? 0.7 : 1.0) * sz, W = R * (lynx ? 0.34 : 0.4) * sz, TH = R * 0.075 * sz;
        const geo = S.earGeo('tri', L, W, TH, { segL: hero ? 12 : 6, segW: hero ? 14 : 8, bend: lynx ? 0 : -0.12, bendAt: 0.5, cup: 0.35 });
        part(g, geo, earMat(k.ctx, { inner: e.inner ?? spec.cream, v0: 0.06, v1: 0.7, panel: 0.62, panelPow: 0.4, tip: e.tip ?? spec.dark, tipFrom: lynx ? 0.7 : 0.6 }, spec.fur, spec.furShade), 'ear' + s);
        if (lynx) part(g, S.spike(R * 0.5 * sz, R * 0.028, R * 0.014, sx * 0.4, 5, true), dark, 'earTuft' + s, [0, L * 0.96, 0], [0, 0, -sx * 0.08]);
        break; }
      case 'leaf': case 'goat': {
        const L = R * (e.type === 'goat' ? 0.95 : 0.8) * sz, W = R * 0.24 * sz, TH = R * 0.06 * sz;
        part(g, S.earShape('leaf', L, W, TH, 0, 1, 1, 1, segL, segW, 0), fur, 'ear' + s);
        part(g, S.earShape('leaf', L, W, TH, 0.1, 0.85, 0.58, 0.35, segL, segW, 0), innerMat, 'earIn' + s, [0, 0.1 * L, TH * 0.7]);
        break; }
      case 'floppy': {
        const L = R * 0.95 * sz, W = R * 0.26 * sz, TH = R * 0.07 * sz;
        part(g, S.earShape('leaf', L, W, TH, 0, 1, 1, 1, segL, segW, 0), fur, 'ear' + s, [0, R * 0.05, 0], [Math.PI, 0, 0]);
        break; }
      case 'pig': {
        const L = R * 0.6 * sz, W = R * 0.3 * sz, TH = R * 0.06 * sz;
        part(g, S.earShape('tri', L, W, TH, 0, 1, 1, 1, segL, segW, 0), fur, 'ear' + s, [0, 0, 0], [0.35, 0, 0]);
        break; }
      case 'small': {
        const r = R * 0.22 * sz;
        part(g, G.sphere(r, 10, 8), fur, 'ear' + s, [0, r * 0.6, 0], null, [1, 1.1, 0.5]);
        break; }
      default: {
        const r = R * 0.3 * sz;
        part(g, G.sphere(r, 12, 8), fur, 'ear' + s, [0, r * 0.7, 0], null, [1, 1, 0.55]);
        part(g, G.sphere(r * 0.6, 10, 6), innerMat, 'earIn' + s, [0, r * 0.7, r * 0.3], null, [1, 1, 0.4]);
      }
    }
  }
}

// ------------------------------------------------------------------ cheek tufts and forelock (drawn fluff)
function buildTufts(fig, skull, spec, k) {
  const { part, furHi, cream, hero, onSkull } = k;
  const R = fig.dims.headR;
  const style = spec.tufts ?? (hero ? 'kid' : 'crowd');
  if (style === 'none') return;
  const big = style === 'lynx' ? 1.55 : style === 'hare' ? 0.8 : style === 'crowd' ? 0.85 : 1;
  const tuftMat = spec.tuftCream === false ? furHi : (style === 'lynx' || style === 'fox' ? cream : furHi);
  const rows = style === 'crowd' ? [[-0.3, 0.25, 0.3], [-0.55, 0.85, 0.24]]
    : style === 'hare' ? [[-0.28, 0.3, 0.26], [-0.48, 0.8, 0.22]]
    : [[-0.22, 0.2, 0.34], [-0.42, 0.6, 0.3], [-0.62, 1.0, 0.22]];
  for (const sx of [-1, 1]) {
    const items = rows.map(([el, droop, len], i) => {
      const p = onSkull(sx * 1.32, el, -0.05 * R);
      return { len: len * R * big, width: R * 0.12 * big * (1 - i * 0.12), thick: R * 0.045, curl: -sx * 0.55, inPlane: true, seg: hero ? 5 : 3,
        pos: p, rot: [0, sx * 0.25, -sx * (Math.PI / 2 + droop)] };
    });
    const geo = S.tuft(`${spec.name}_cheek${sx}`, items);
    part(skull, geo, tuftMat, 'cheekTuft' + (sx > 0 ? 'L' : 'R'));
  }
  if (spec.forelock) {
    const items = [[0, 1.3, 0.46, 0.35], [0.3, 1.22, 0.36, 0.5], [-0.28, 1.24, 0.34, 0.45]].map(([az, el, len, tilt], i) => ({
      len: len * R, width: R * 0.17 * (1 - i * 0.15), thick: R * 0.06, curl: 1.1, seg: hero ? 6 : 3,
      pos: onSkull(az, el, -0.08 * R), rot: [tilt, 0, -az * 1.6] }));
    part(skull, S.tuft(`${spec.name}_forelock`, items), furHi, 'forelock');
  }
}

// ------------------------------------------------------------------ tails
function buildTail(fig, hips, spec, k) {
  const { part, joint, fur, cream, dark, RS, CAP, hero } = k;
  const t = spec.tail || { type: 'none' };
  const p = fig.dims.pelvis;
  if (t.type === 'none') return;
  const tipMat = t.tip ? celMat(k.ctx, t.tip, t.tipShade, { shade2: deeper(t.tipShade ?? t.tip) }) : cream;
  const g = joint(hips, 'tail', [0, -p[1] * 0.2, -p[2] * 0.85], [t.pitch ?? 0.9, 0, 0]);
  switch (t.type) {
    case 'bushy': {
      // bushy lathe tail swelling from a slim root to a pointed cream (white) tip
      const len = t.len ?? fig.dims.H * 0.5, r = t.r ?? fig.dims.H * 0.085;
      const a = S.smoothProfile([[0.001, r * 0.2], [r * 0.38, 0], [r * 0.62, -len * 0.25], [r * 0.9, -len * 0.55], [r * 0.98, -len * 0.82], [0.001, -len * 0.82]], 3);
      part(g, S.lathe(`tailA_${spec.name}`, a, RS), fur, 'tail');
      const g2 = joint(g, 'tail2', [0, -len * 0.75, 0], [-0.5, 0, 0]);
      const b = S.smoothProfile([[0.001, len * 0.08], [r * 0.95, 0], [r * 1.0, -len * 0.1], [r * 0.85, -len * 0.28], [r * 0.4, -len * 0.42], [0.001, -len * 0.5]], 3);
      part(g2, S.lathe(`tailB_${spec.name}`, b, RS), fur, 'tailMid');
      const c = S.smoothProfile([[r * 0.94, -len * 0.12], [r * 0.9, -len * 0.25], [r * 0.48, -len * 0.4], [0.001, -len * 0.52]], 3);
      part(g2, S.lathe(`tailC_${spec.name}`, c, RS), tipMat, 'tailTip', [0, 0, 0], null, [1.04, 1, 1.04]);
      break; }
    case 'puff': part(g, G.sphere(t.r ?? fig.dims.H * 0.07, 10, 8), tipMat, 'tail', [0, -0.01, 0]); break;
    case 'bob': part(g, S.taperLimb(t.r ?? fig.dims.H * 0.04, (t.r ?? fig.dims.H * 0.04) * 0.9, t.len ?? fig.dims.H * 0.08, 8, CAP), fur, 'tail');
      part(g, G.sphere((t.r ?? fig.dims.H * 0.04) * 1.0, 8, 6), dark, 'tailTip', [0, -(t.len ?? fig.dims.H * 0.08) * 1.0, 0]); break;
    case 'stub': part(g, G.sphere(t.r ?? fig.dims.H * 0.045, 8, 6), fur, 'tail', [0, -0.01, 0]); break;
    case 'curly': part(g, G.torus(t.r ?? fig.dims.H * 0.05, (t.r ?? fig.dims.H * 0.05) * 0.3, 6, 12, Math.PI * 1.6), fur, 'tail', [0, -0.02, -0.01], [0.3, Math.PI / 2, 0]); break;
    case 'long': {
      const len = t.len ?? fig.dims.H * 0.4, r = t.r ?? fig.dims.H * 0.03;
      part(g, S.taperLimb(r * 0.8, r, len * 0.6, 8, CAP), fur, 'tail');
      const g2 = joint(g, 'tail2', [0, -len * 0.6, 0], [-0.6, 0, 0]);
      part(g2, S.taperLimb(r * 0.95, r * 0.45, len * 0.4, 8, CAP), t.tip ? tipMat : fur, 'tail2');
      if (t.rings) for (let i = 0; i < 3; i++) part(g, G.torus(r * 1.0, r * 0.3, 5, 10), dark, 'ring' + i, [0, -len * (0.1 + i * 0.16), 0], [Math.PI / 2, 0, 0]);
      break; }
    case 'thick': {
      const len = t.len ?? fig.dims.H * 0.35, r = t.r ?? fig.dims.H * 0.05;
      part(g, S.taperLimb(r, r * 0.55, len * 0.8, 8, CAP), fur, 'tail', [0, 0, 0], null, [1.3, 1, 0.7]);
      break; }
  }
  void hero;
}

// ------------------------------------------------------------------ species extras
function buildExtras(fig, face, faceS, skull, spec, k) {
  const { part, group, fur, cream, dark, RS, SW, SH, SK } = k;
  const R = fig.dims.headR; const hs = fig.dims.headScale;
  const ex = spec.extras || [];
  const ey = spec.eyes;
  // face markings hug the skull and turn with the face cheat
  const patchMesh = (mat, name, phi0, phiLen, th0, thLen, off = 0.002) => {
    const m = new THREE.Mesh(S.skullPatch(R, SK, off, 16, 6, phi0, phiLen, th0, thLen), mat); m.name = `${spec.name}_${name}`; faceS.add(m); fig.parts.push(m); return m;
  };
  for (const x of ex) {
    switch (x) {
      case 'mask': { // raccoon: dark band across the eyes
        const dm = celMat(k.ctx, 0x3a2f33, 0x1f181b);
        patchMesh(dm, 'mask', Math.PI / 2 - 1.15, 2.3, Math.PI / 2 - ey.elev - ey.thetaLen * 0.62, ey.thetaLen * 1.25);
        patchMesh(cream, 'maskBrow', 0, Math.PI * 2, Math.PI / 2 - ey.elev - ey.thetaLen * 0.95, ey.thetaLen * 0.33, 0.0015);
        break; }
      case 'badgerFace': { // white face with the dark head and dark eye stripes
        const wh = celMat(k.ctx, 0xF6F2EC, 0xB9A4C9, { shade2: deeper(0xB9A4C9) });
        patchMesh(wh, 'faceWhite', Math.PI / 2 - 1.3, 2.6, 0.5, 1.5, 0.0015);
        for (const sx of [-1, 1]) patchMesh(dark, 'stripe' + sx, Math.PI / 2 + sx * ey.az - 0.3, 0.6, 0.2, 1.9, 0.002);
        break; }
      case 'dogPatch': {
        const dm = celMat(k.ctx, spec.dark ?? 0x5a3a24, spec.darkShade ?? 0x3a2416);
        patchMesh(dm, 'patch', Math.PI / 2 - ey.az - 0.42, 0.8, Math.PI / 2 - ey.elev - ey.thetaLen * 0.75, ey.thetaLen * 1.5, 0.002);
        break; }
      case 'horns': {
        const hm = celMat(k.ctx, 0xC9B79A, 0x8A7558, { highlight: 0xF0E2C4 });
        for (const sx of [-1, 1]) part(skull, S.taperLimb(R * 0.11, R * 0.02, R * 0.5, 8, 2), hm, 'horn' + sx, [sx * R * 0.35, R * 0.92, -R * 0.1], [2.54, 0, -sx * 0.25]);
        break; }
      case 'antlers': {
        const am = celMat(k.ctx, 0xB89A74, 0x7A6248);
        for (const sx of [-1, 1]) {
          const g = group(skull, 'antler' + sx, [sx * R * 0.45, R * 0.95, -R * 0.1]); g.rotation.set(-0.35, 0, -sx * 0.35);
          part(g, G.cyl(R * 0.05, R * 0.07, R * 1.3, 6), am, 'beam' + sx, [0, R * 0.65, 0]);
          part(g, G.cyl(R * 0.03, R * 0.05, R * 0.6, 6), am, 'tineA' + sx, [sx * R * 0.2, R * 0.75, R * 0.1], [0.5, 0, sx * 0.9]);
          part(g, G.cyl(R * 0.03, R * 0.05, R * 0.5, 6), am, 'tineB' + sx, [-sx * R * 0.12, R * 1.15, -R * 0.05], [-0.4, 0, -sx * 0.8]);
        }
        break; }
      case 'tusks': {
        const tm = celMat(k.ctx, 0xF3EBDA, 0xB9A4C9);
        const mz = spec.muzzle;
        for (const sx of [-1, 1]) part(face, G.cone(R * 0.06, R * 0.32, 6), tm, 'tusk' + sx, [sx * mz.w * 0.85, -R * (mz.y ?? 0.3) - mz.h * 0.1, R * (mz.z ?? 0.72) + mz.d * 0.4], [0.15, 0, -sx * 0.35]);
        break; }
      case 'beard': part(face, G.cone(R * 0.16, R * 0.45, 6), cream, 'beard', [0, -R * 0.85, R * 0.55], [Math.PI - 0.3, 0, 0]); break;
      case 'wool': {
        const wm = celMat(k.ctx, spec.wool ?? 0xF7F1E4, spec.woolShade ?? 0xC5B6D8, { shade2: deeper(spec.woolShade ?? 0xC5B6D8) });
        const rng = (i) => (Math.sin(i * 12.9898) * 43758.5453) % 1;
        for (let i = 0; i < 7; i++) {
          const a = i / 7 * Math.PI * 2; const r = R * 0.33;
          part(skull, G.sphere(r, 10, 8), wm, 'wool' + i, [Math.cos(a) * R * 0.55 * hs[0], R * 0.82 + Math.abs(rng(i)) * R * 0.08, Math.sin(a) * R * 0.5 * hs[2]]);
        }
        part(skull, G.sphere(R * 0.45, 12, 8), wm, 'woolTop', [0, R * 0.95, 0]);
        const chd = fig.dims.chest; const sp = fig.j.spine;
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; part(sp, G.sphere(chd[0] * 0.5, 10, 8), wm, 'bodyWool' + i, [Math.cos(a) * chd[0] * 0.85, fig.dims.torso * 0.55 + Math.sin(a * 2) * 0.02, Math.sin(a) * chd[2] * 0.8]); }
        break; }
      case 'boarMane': {
        const items = [0, 1, 2, 3].map((i) => ({ len: R * 0.32, width: R * 0.1, thick: R * 0.04, curl: -0.4, seg: 3, pos: [0, R * (0.95 - i * 0.12), -R * (0.1 + i * 0.2)], rot: [-0.5 - i * 0.2, 0, 0] }));
        part(skull, S.tuft(`${spec.name}_mane`, items), dark, 'mane');
        break; }
      case 'glasses': {
        // round rims with a painted glint, centred on the eyes; spacing follows the close-up eye spacing
        const gm = celMat(k.ctx, 0x4a3c3a, 0x1e1618, { highlight: 0x7a625c, highlightEdge: 0.55 });
        const g = k.joint(face, 'glasses', [0, 0, 0]);
        const el = ey.elev;
        const lensR0 = R * ey.thetaLen * 0.56;
        fig.glassSides = [];
        for (const sx of [-1, 1]) {
          const side = group(g, 'glassSide' + sx);
          const rim = part(side, G.torus(lensR0, R * 0.022, 6, 28), gm, 'rim' + sx);
          const hl = new THREE.Mesh(G.plane(lensR0 * 0.07, lensR0 * 0.34), flatMat(k.ctx, 0xEAF6FF)); hl.name = `${spec.name}_lensHL${sx}`;
          hl.position.set(sx * lensR0 * 0.66, lensR0 * 0.5, 0.004); hl.rotation.set(0, 0, sx * 0.75); side.add(hl); fig.parts.push(hl); hl.castShadow = false;
          const arm = part(side, G.cyl(R * 0.014, R * 0.014, R * 1.1, 5), gm, 'glassArm' + sx, [sx * lensR0 * 0.9, lensR0 * 0.3, -R * 0.5], [Math.PI / 2, 0, 0]);
          void rim; void arm;
          const update = (on) => {
            const az = ey.az * (on ? 1.08 : 1), sc = on ? 1.1 : 1;
            const xo = R * hs[0] * Math.sin(az) * 1.02, zf = R * hs[2] * Math.cos(az) + 0.03, ey0 = R * hs[1] * Math.sin(el);
            side.position.set(sx * xo, ey0, zf); side.rotation.set(0, sx * az * 0.6, 0); side.scale.setScalar(sc);
          };
          update(false); fig.glassSides.push({ update });
        }
        const xo = R * hs[0] * Math.sin(ey.az) * 1.02, zf = R * hs[2] * Math.cos(ey.az) + 0.03;
        part(g, G.cyl(R * 0.016, R * 0.016, Math.max(0.01, xo * 2 - lensR0 * 1.9), 5), gm, 'bridge', [0, R * hs[1] * Math.sin(el) + lensR0 * 0.15, zf + 0.002], [0, 0, Math.PI / 2]);
        break; }
    }
  }
  void fur; void RS; void SW; void SH;
}

// ------------------------------------------------------------------ pose application
/** pose: { joint: [rx, ry, rz], ..., hipsPos: [x,y,z], eyes: 'open', mouth: 'closed' } ; rotations add to base. */
export function applyPose(fig, pose) {
  for (const name of JOINTS) {
    const j = fig.j[name]; if (!j) continue;
    const b = fig.base[name]; const p = pose[name];
    if (p) j.rotation.set(b[0] + p[0], b[1] + p[1], b[2] + p[2]); else j.rotation.set(b[0], b[1], b[2]);
  }
  const hp = pose.hipsPos || [0, fig.dims.hipsY, 0];
  fig.j.hips.position.set(hp[0], hp[1], hp[2]);
  if (pose.eyes) fig.setEyes(pose.eyes);
  if (pose.mouth) fig.setMouth(pose.mouth);
  if (fig.j.glasses) { const gp = pose.glasses || [0, 0, 0]; fig.j.glasses.rotation.set(gp[0], gp[1], gp[2]); }
}

export function lerpPose(a, b, t) {
  const out = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = a[k], vb = b[k];
    if (Array.isArray(va) || Array.isArray(vb)) {
      const A = va || [0, 0, 0], B = vb || [0, 0, 0];
      out[k] = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
    } else out[k] = t < 0.5 ? (va ?? vb) : (vb ?? va);
  }
  if (!a.hipsPos && b.hipsPos) out.hipsPos = b.hipsPos; // avoid lerping with zero
  if (a.hipsPos && !b.hipsPos) out.hipsPos = a.hipsPos;
  return out;
}
