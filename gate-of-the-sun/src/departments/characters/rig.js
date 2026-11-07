// Parametric FK rig for anthropomorphic animal characters. Primitives only (spheres, capsules,
// boxes, cones, lathes), no SkinnedMesh. Local frame: +z forward, +y up, +x is the character's left.
// root sits at the feet (sole bottoms at y = 0 when standing).
import * as THREE from 'three';
import { makeEyeFrames, makeMouthFrames } from './eyes.js';

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

const matCache = new Map();
export function celMat(ctx, color, shade) {
  const key = `${color}_${shade ?? 'auto'}`;
  let m = matCache.get(key);
  if (!m) { m = ctx.makeCel({ color, shade, wobble: 0.1 }); matCache.set(key, m); }
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
const eyeMatCache = new Map();
function eyeMat(ctx, tex) { let m = eyeMatCache.get(tex); if (!m) { m = ctx.makeFlat({ map: tex, alphaTest: 0.5 }); eyeMatCache.set(tex, m); } return m; }

export const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'uaL', 'uaR', 'faL', 'faR', 'handL', 'handR',
  'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'tail', 'tail2', 'earL', 'earR', 'browL', 'browR', 'glasses', 'prop'];

/**
 * buildFigure(ctx, spec) -> fig { root, j, base, dims, parts, setPose, setEyes, setMouth, headWorld() }
 */
export function buildFigure(ctx, spec) {
  const { LAYER } = ctx;
  const hero = spec.lod !== 'crowd';
  const SW = hero ? 20 : 12, SH = hero ? 14 : 8, CS = hero ? 4 : 3, RS = hero ? 14 : 8;
  const fig = { spec, parts: [], j: {}, base: {}, dims: {}, name: spec.name };
  const root = new THREE.Group(); root.name = spec.name; fig.root = root;
  const fur = celMat(ctx, spec.fur, spec.furShade);
  const cream = celMat(ctx, spec.cream ?? spec.fur, spec.creamShade ?? spec.furShade);
  const dark = celMat(ctx, spec.dark ?? 0x2b1d1a, spec.darkShade ?? 0x15100e);

  function part(parent, geometry, material, name, pos, rot, scale) {
    const m = new THREE.Mesh(geometry, material);
    m.name = `${spec.name}_${name}`;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    parent.add(m); fig.parts.push(m);
    return m;
  }
  function joint(parent, name, pos, rot) {
    const g = new THREE.Group(); g.name = `${spec.name}_j_${name}`;
    if (pos) g.position.set(pos[0], pos[1], pos[2]);
    if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(g); fig.j[name] = g; fig.base[name] = rot ? [rot[0], rot[1], rot[2]] : [0, 0, 0];
    return g;
  }

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
  d.pelvisBottom = d.pelvis[1];                                           // below hips origin
  d.standHead = d.hipsY + d.torso + d.neck + d.headCentreY;             // head centre height standing

  // ------------------------------------------------------------ hips and legs
  const hips = joint(root, 'hips', [0, d.hipsY, 0]);
  const pelvisGeo = G.sphere(1, SW, SH);
  part(hips, pelvisGeo, spec.clothes?.dress ? celMat(ctx, spec.clothes.dress.color, spec.clothes.dress.shade) : (spec.clothes?.tunic ? celMat(ctx, spec.clothes.tunic.color, spec.clothes.tunic.shade) : fur), 'pelvis', [0, 0, 0], null, [d.pelvis[0], d.pelvis[1], d.pelvis[2]]);

  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const th = joint(hips, 'thigh' + s, [sx * d.hipW, -d.hipDrop, 0]);
    part(th, G.capsule(d.limbR, Math.max(0.01, d.thigh - d.limbR * 1.2), CS, RS), fur, 'thigh' + s, [0, -d.thigh / 2, 0]);
    const sh = joint(th, 'shin' + s, [0, -d.thigh, 0]);
    const shinMat = spec.clothes?.boots ? fur : fur;
    part(sh, G.capsule(d.limbR * 0.82, Math.max(0.01, d.shin - d.limbR * 1.0), CS, RS), shinMat, 'shin' + s, [0, -d.shin / 2, 0]);
    if (spec.clothes?.boots) part(sh, G.cyl(d.limbR * 0.95, d.limbR * 1.05, d.shin * 0.45, RS), dark, 'boot' + s, [0, -d.shin * 0.78, 0]);
    const ft = joint(sh, 'foot' + s, [0, -d.shin, 0]);
    const footMat = spec.clothes?.boots ? dark : (spec.footColor ? celMat(ctx, spec.footColor, spec.footShade) : fur);
    part(ft, G.box(d.footW, d.footH, d.footL), footMat, 'foot' + s, [0, -d.footH / 2, d.footL * 0.22]);
  }

  // ------------------------------------------------------------ torso
  const spine = joint(hips, 'spine', [0, 0, 0]);
  const tunic = spec.clothes?.tunic;
  const tunicMat = tunic ? celMat(ctx, tunic.color, tunic.shade) : null;
  // belly: capsule from pelvis top to chest
  const bellyR = spec.bellyR ?? d.pelvis[0] * 0.9;
  part(spine, G.capsule(bellyR, d.torso * 0.35, CS, RS), tunicMat ?? fur, 'belly', [0, d.torso * 0.36, 0], null, [1, 1, spec.bellyFlat ?? 0.85]);
  const chest = joint(spine, 'chest', [0, d.torso * 0.5, 0]);
  const ch = d.chest;
  part(chest, G.sphere(1, SW, SH), tunicMat ?? fur, 'chestMass', [0, d.torso * 0.22, 0], null, [ch[0], ch[1], ch[2]]);
  if (spec.clothes?.chestPatch) {
    // cream chest patch peeking above the neckline
    part(chest, G.sphere(1, SW, SH), cream, 'chestPatch', [0, d.torso * 0.38, ch[2] * 0.45], null, [ch[0] * 0.55, ch[1] * 0.45, ch[2] * 0.6]);
  }
  if (tunic) {
    // sleeveless tunic shell over belly and chest (slightly wider), neckline
    part(spine, G.cyl(ch[0] * 1.08, d.pelvis[0] * 1.1, d.torso * 0.78, RS), tunicMat, 'tunic', [0, d.torso * 0.42, 0], null, [1, 1, 0.82]);
  }
  if (spec.clothes?.waistcoat) {
    const wc = celMat(ctx, spec.clothes.waistcoat.color, spec.clothes.waistcoat.shade);
    for (const sx of [-1, 1]) part(spine, G.box(ch[0] * 0.62, d.torso * 0.62, 0.016), wc, 'waistcoat' + (sx > 0 ? 'L' : 'R'), [sx * ch[0] * 0.5, d.torso * 0.5, ch[2] * 0.82 + 0.004], [0, sx * 0.25, 0]);
    part(spine, G.box(ch[0] * 1.9, d.torso * 0.6, 0.012), wc, 'waistcoatBack', [0, d.torso * 0.52, -ch[2] * 0.86], null);
  }
  if (spec.clothes?.apron) {
    const ap = celMat(ctx, spec.clothes.apron.color, spec.clothes.apron.shade);
    part(hips, G.box(d.pelvis[0] * 1.5, d.torso * 1.15, 0.014), ap, 'apron', [0, -d.pelvis[1] * 0.9 + d.torso * 0.05, d.pelvis[2] * 0.9 + 0.012], [0.04, 0, 0]);
    part(spine, G.box(d.pelvis[0] * 0.9, d.torso * 0.45, 0.012), ap, 'apronBib', [0, d.torso * 0.5, ch[2] * 0.9 + 0.008], [-0.08, 0, 0]);
  }
  if (spec.clothes?.dress) {
    const dr = celMat(ctx, spec.clothes.dress.color, spec.clothes.dress.shade);
    const skirtLen = d.hipsY * 0.78;
    const pts = [[d.pelvis[0] * 0.95, 0], [d.pelvis[0] * 1.15, -skirtLen * 0.35], [d.pelvis[0] * 1.6, -skirtLen * 0.8], [d.pelvis[0] * 1.75, -skirtLen], [d.pelvis[0] * 1.55, -skirtLen]];
    part(hips, G.lathe(`skirt${r3(d.pelvis[0])}_${r3(skirtLen)}`, pts, RS + 4), dr, 'skirt', [0, d.pelvis[1] * 0.1, 0], null, [1, 1, 0.9]);
    part(spine, G.cyl(ch[0] * 1.05, d.pelvis[0] * 1.08, d.torso * 0.75, RS), dr, 'bodice', [0, d.torso * 0.42, 0], null, [1, 1, 0.82]);
  }
  if (spec.clothes?.sash) {
    const sm = celMat(ctx, spec.clothes.sash.color, spec.clothes.sash.shade);
    part(spine, G.torus(d.pelvis[0] * 1.02, 0.025, 6, RS + 4), sm, 'sash', [0, d.torso * 0.12, 0], [Math.PI / 2, 0, 0], [1, 0.85, 1]);
  }

  // shoulders and arms
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const ua = joint(chest, 'ua' + s, [sx * d.shoulderW, d.torso * 0.42, 0]);
    const sleeve = spec.clothes?.tunic && !spec.clothes.tunic.sleeveless;
    const uaMat = sleeve ? tunicMat : fur;
    part(ua, G.sphere(d.armR * 1.25, SW - 4, SH - 2), uaMat, 'shoulder' + s, [0, 0, 0]);
    part(ua, G.capsule(d.armR, Math.max(0.01, d.upperArm - d.armR), CS, RS), uaMat, 'upperArm' + s, [0, -d.upperArm / 2, 0]);
    const fa = joint(ua, 'fa' + s, [0, -d.upperArm, 0]);
    part(fa, G.capsule(d.armR * 0.85, Math.max(0.01, d.foreArm - d.armR), CS, RS), fur, 'foreArm' + s, [0, -d.foreArm / 2, 0]);
    const hand = joint(fa, 'hand' + s, [0, -d.foreArm, 0]);
    buildHand(hand, s, d.armR, spec.handColor ? celMat(ctx, spec.handColor, spec.handShade) : (spec.cream && spec.creamHands ? cream : fur), 'hand' + s);
  }

  // neck and head
  const neck = joint(chest, 'neck', [0, d.torso * 0.5, 0.0]);
  part(neck, G.cyl(headR * 0.38, headR * 0.42, d.neck + headR * 0.3, RS), fur, 'neck', [0, d.neck * 0.5 + headR * 0.05, 0]);
  if (spec.clothes?.scarf) {
    const sc = celMat(ctx, spec.clothes.scarf.color, spec.clothes.scarf.shade);
    part(neck, G.torus(headR * 0.5, headR * 0.17, 8, RS + 4), sc, 'scarf', [0, d.neck * 0.55, 0.0], [Math.PI / 2, 0, 0]);
    part(neck, G.box(headR * 0.3, headR * 0.9, 0.03), sc, 'scarfTail', [headR * 0.15, d.neck * 0.3 - headR * 0.4, headR * 0.55], [0.12, 0, 0.1]);
  }
  if (spec.clothes?.neckerchief) {
    const nk = celMat(ctx, spec.clothes.neckerchief.color, spec.clothes.neckerchief.shade);
    part(neck, G.torus(headR * 0.46, headR * 0.1, 6, RS + 4), nk, 'kerchief', [0, d.neck * 0.45, 0.0], [Math.PI / 2, 0, 0]);
    part(neck, G.cone(headR * 0.3, headR * 0.6, 4), nk, 'kerchiefFlap', [0, d.neck * 0.45 - headR * 0.35, headR * 0.5], [Math.PI + 0.25, Math.PI / 4, 0], [1, 1, 0.4]);
  }
  const head = joint(neck, 'head', [0, d.neck, 0]);
  const hs = d.headScale;
  const headMesh = part(head, G.sphere(headR, SW + 4, SH + 4), fur, 'head', [0, d.headCentreY, 0], null, hs);
  fig.headMesh = headMesh;
  // face group at head centre (unscaled) for features
  const face = new THREE.Group(); face.position.set(0, d.headCentreY, 0); head.add(face); fig.face = face;

  // eyes as sphere patches hugging the (scaled) head, children of the head mesh
  const ey = spec.eyes;
  const set = eyeSet(ey.key, ey.style);
  fig.eyeFrames = set; fig.eyeMeshes = {};
  const patch = G.patch(headR + 0.0035, hero ? 10 : 6, hero ? 10 : 6, Math.PI / 2 - ey.phiLen / 2, ey.phiLen, Math.PI / 2 - ey.elev - ey.thetaLen / 2, ey.thetaLen);
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const m = new THREE.Mesh(patch, eyeMat(ctx, set[s].open)); m.name = `${spec.name}_eye${s}`;
    m.rotation.y = sx * ey.az; headMesh.add(m); fig.parts.push(m); fig.eyeMeshes[s] = m;
  }
  fig.setEyes = (frame) => { for (const s of ['L', 'R']) { const t = set[s][frame] || set[s].open; fig.eyeMeshes[s].material = eyeMat(ctx, t); } };

  // brows: group pivots at head centre, box tangent at radius
  const br = spec.brows ?? { az: ey.az, elev: ey.elev + ey.thetaLen * 0.62, w: headR * 0.42 };
  const browMat = celMat(ctx, spec.browColor ?? 0x2b1d1a, spec.browShade ?? 0x15100e);
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const g = joint(face, 'brow' + s, [0, 0, 0], [-br.elev, sx * br.az, 0]);
    const bm = part(g, G.box(br.w, headR * 0.075, 0.02), browMat, 'brow' + s, [0, 0, headR * hs[2] + 0.012], [0, 0, sx * 0.12], null);
    fig['browMesh' + s] = bm;
  }

  // muzzle, nose, mouth
  const mz = spec.muzzle;
  const mzMat = celMat(ctx, mz.color ?? spec.cream ?? spec.fur, mz.shade ?? spec.creamShade ?? spec.furShade);
  const mzPos = [0, -headR * (mz.y ?? 0.3), headR * (mz.z ?? 0.72)];
  part(face, G.sphere(1, SW, SH), mzMat, 'muzzle', mzPos, null, [mz.w, mz.h, mz.d]);
  const noseMat = celMat(ctx, mz.noseColor ?? 0x2b1d1a, mz.noseShade ?? 0x15100e);
  if (mz.snout) {
    part(face, G.cyl(mz.w * 0.55, mz.w * 0.6, mz.d * 0.35, RS), celMat(ctx, mz.snoutColor ?? 0xE89AA8, mz.snoutShade ?? 0xB86878), 'snout', [0, mzPos[1] + mz.h * 0.15, mzPos[2] + mz.d * 0.9], [Math.PI / 2, 0, 0]);
    for (const sx of [-1, 1]) part(face, G.sphere(mz.w * 0.12, 8, 6), noseMat, 'nostril' + sx, [sx * mz.w * 0.22, mzPos[1] + mz.h * 0.15, mzPos[2] + mz.d * 1.08]);
  } else {
    part(face, G.sphere(1, SW - 6, SH - 4), noseMat, 'nose', [0, mzPos[1] + mz.h * 0.42, mzPos[2] + mz.d * 0.88], null, [mz.w * 0.42, mz.h * 0.4, mz.d * 0.32]);
  }
  const mouths = mouthSet(); fig.mouthFrames = mouths;
  const mouth = new THREE.Mesh(G.plane(mz.w * 2.0, mz.w * 2.0), eyeMat(ctx, mouths.closed)); mouth.name = `${spec.name}_mouth`;
  mouth.position.set(0, mzPos[1] - mz.h * 0.35, mzPos[2] + mz.d * 0.86); mouth.rotation.x = -0.55;
  face.add(mouth); fig.parts.push(mouth); fig.mouthMesh = mouth;
  fig.setMouth = (k) => { mouth.material = eyeMat(ctx, mouths[k] || mouths.closed); };

  // ears
  buildEars(fig, face, spec, { fur, cream, dark, hero, SW, SH, CS, RS, part, joint, ctx });
  // tail
  buildTail(fig, hips, spec, { fur, cream, dark, hero, SW, SH, CS, RS, part, joint, ctx });
  // species extras
  buildExtras(fig, face, head, headMesh, spec, { fur, cream, dark, hero, SW, SH, CS, RS, part, joint, ctx });
  // clothes on the head
  if (spec.clothes?.headscarf) {
    const hc = celMat(ctx, spec.clothes.headscarf.color, spec.clothes.headscarf.shade);
    const cap = new THREE.Mesh(G.patch(headR + 0.012, SW, 6, 0, Math.PI * 2, 0, 1.35), hc); cap.name = `${spec.name}_headscarf`; cap.scale.set(hs[0], hs[1], hs[2]);
    face.add(cap); fig.parts.push(cap);
    part(face, G.sphere(headR * 0.18, 8, 6), hc, 'scarfKnot', [0, -headR * 0.15, -headR * 0.95]);
  }
  if (spec.clothes?.satchel) {
    const sm = celMat(ctx, spec.clothes.satchel.color, spec.clothes.satchel.shade);
    part(hips, G.box(headR * 0.9, headR * 0.7, headR * 0.3), sm, 'satchel', [-d.pelvis[0] * 1.05 - headR * 0.1, 0.0, -d.pelvis[2] * 0.2]);
    part(spine, G.cyl(0.012, 0.012, d.torso * 1.25, 6), sm, 'strap', [0, d.torso * 0.5, ch[2] * 0.82], [0, 0, 0.62]);
  }

  // prop joint on the right hand (jug, basket, cloth, pebble)
  joint(fig.j.handR, 'prop', [0, -d.armR * 1.6, 0]);

  // layer and ink tags
  ctx.tag(root, { inkId: spec.inkId, layer: LAYER.FG, castShadow: true, receiveShadow: true });
  for (const m of fig.parts) if (m.material && m.material.userData.isFlat) { m.castShadow = false; }

  fig.setPose = (pose) => applyPose(fig, pose);
  fig.headWorld = (() => { const v = new THREE.Vector3(); return () => { root.updateMatrixWorld(true); return headMesh.getWorldPosition(v).toArray(); }; })();
  fig.triangles = () => fig.parts.reduce((a, m) => { const idx = m.geometry.index; return a + (idx ? idx.count / 3 : m.geometry.attributes.position.count / 3); }, 0);
  return fig;
}

// ------------------------------------------------------------------ hands
function buildHand(hand, side, armR, mat, name) {
  const sx = side === 'L' ? 1 : -1;
  const pw = armR * 1.9, ph = armR * 2.0, pd = armR * 1.0;
  const palm = new THREE.Mesh(G.box(pw, ph, pd), mat); palm.name = name + '_palm'; palm.position.set(0, -ph * 0.45, 0); hand.add(palm);
  const fw = pw / 3.6, fh = ph * 0.6, fd = pd * 0.9;
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(G.box(fw, fh, fd), mat); f.name = name + '_finger' + i;
    f.position.set((i - 1) * fw * 1.25, -ph * 0.95 - fh * 0.42, 0); f.rotation.x = -0.25; hand.add(f);
  }
  const th = new THREE.Mesh(G.box(fw, fh * 0.75, fd), mat); th.name = name + '_thumb';
  th.position.set(-sx * (pw * 0.5 + fw * 0.3), -ph * 0.45, pd * 0.35); th.rotation.z = -sx * 0.6; th.rotation.x = -0.4; hand.add(th);
  hand.userData.handMeshes = [palm, th];
  return hand;
}

// ------------------------------------------------------------------ ears
function buildEars(fig, face, spec, k) {
  const { part, joint, fur, cream, dark, RS } = k;
  const R = fig.dims.headR; const hs = fig.dims.headScale; const e = spec.ears || { type: 'round' };
  const innerMat = e.inner ? celMat(k.ctx, e.inner, e.innerShade) : cream;
  const tipMat = e.tip ? celMat(k.ctx, e.tip, e.tipShade) : dark;
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const sz = e.size ?? 1;
    let az, el, tiltZ, tiltX = 0;
    switch (e.type) {
      case 'fox': az = 0.55; el = 0.95; tiltZ = 0.3; break;
      case 'hare': az = 0.35; el = 1.2; tiltZ = 0.14; break;
      case 'lynx': az = 0.6; el = 0.95; tiltZ = 0.4; break;
      case 'leaf': az = 1.2; el = 0.45; tiltZ = 1.15; break;
      case 'goat': az = 1.25; el = 0.4; tiltZ = 1.5; break;
      case 'floppy': az = 1.15; el = 0.75; tiltZ = 1.25; break;
      case 'pig': az = 0.7; el = 1.0; tiltZ = 0.75; tiltX = 0.5; break;
      case 'small': az = 0.75; el = 0.95; tiltZ = 0.45; break;
      default: az = 0.8; el = 0.85; tiltZ = 0.45; break; // round
    }
    if (e.flop === s) { tiltZ += 0.85; tiltX += 0.2; }   // one ear flops outward
    // ear pivot on the head surface
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el) * sx, Math.sin(el), Math.cos(az) * Math.cos(el) * 0.2);
    dir.normalize();
    const pos = [dir.x * R * hs[0] * 0.92, dir.y * R * hs[1] * 0.92, dir.z * R * hs[2] * 0.92];
    const g = joint(face, 'ear' + s, pos, [tiltX, 0, -sx * tiltZ]);
    switch (e.type) {
      case 'fox': {
        const h = R * 0.95 * sz, r = R * 0.42 * sz;
        part(g, G.cone(r, h, 8), fur, 'ear' + s, [0, h * 0.42, 0], null, [1, 1, 0.42]);
        part(g, G.cone(r * 0.62, h * 0.72, 8), innerMat, 'earIn' + s, [0, h * 0.32, r * 0.14], null, [1, 1, 0.3]);
        part(g, G.cone(r * 0.38, h * 0.36, 8), tipMat, 'earTip' + s, [0, h * 0.78, 0], null, [1.02, 1, 0.44]);
        break; }
      case 'hare': {
        const h = R * 1.55 * sz, r = R * 0.2 * sz;
        part(g, G.capsule(r, h, 3, RS), fur, 'ear' + s, [0, h * 0.5, 0], null, [1, 1, 0.5]);
        part(g, G.capsule(r * 0.6, h * 0.8, 3, RS), innerMat, 'earIn' + s, [0, h * 0.5, r * 0.3], null, [1, 1, 0.3]);
        break; }
      case 'lynx': {
        const h = R * 0.6 * sz, r = R * 0.34 * sz;
        part(g, G.cone(r, h, 8), fur, 'ear' + s, [0, h * 0.42, 0], null, [1, 1, 0.45]);
        part(g, G.cone(r * 0.6, h * 0.7, 8), innerMat, 'earIn' + s, [0, h * 0.3, r * 0.12], null, [1, 1, 0.3]);
        part(g, G.cone(r * 0.16, h * 0.55, 6), dark, 'earTuft' + s, [0, h * 0.95, 0], [0, 0, -sx * 0.1]);
        break; }
      case 'leaf': case 'goat': {
        const h = R * (e.type === 'goat' ? 0.95 : 0.75) * sz, r = R * 0.22 * sz;
        part(g, G.capsule(r, h * 0.6, 3, RS), fur, 'ear' + s, [0, h * 0.42, 0], null, [1, 1, 0.45]);
        part(g, G.capsule(r * 0.6, h * 0.45, 3, RS), innerMat, 'earIn' + s, [0, h * 0.42, r * 0.28], null, [1, 1, 0.3]);
        break; }
      case 'floppy': {
        const h = R * 0.95 * sz, r = R * 0.26 * sz;
        part(g, G.capsule(r, h * 0.55, 3, RS), fur, 'ear' + s, [0, -h * 0.35, 0], null, [1, 1, 0.42]);
        break; }
      case 'pig': {
        const h = R * 0.6 * sz, r = R * 0.3 * sz;
        part(g, G.cone(r, h, 6), fur, 'ear' + s, [0, h * 0.4, 0], null, [1, 1, 0.35]);
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

// ------------------------------------------------------------------ tails
function buildTail(fig, hips, spec, k) {
  const { part, joint, fur, cream, dark, RS, CS } = k;
  const t = spec.tail || { type: 'none' };
  const p = fig.dims.pelvis;
  if (t.type === 'none') return;
  const tipMat = t.tip ? celMat(k.ctx, t.tip, t.tipShade) : cream;
  const g = joint(hips, 'tail', [0, -p[1] * 0.2, -p[2] * 0.85], [t.pitch ?? 0.9, 0, 0]);
  switch (t.type) {
    case 'bushy': {
      const len = t.len ?? fig.dims.H * 0.5, r = t.r ?? fig.dims.H * 0.085;
      part(g, G.capsule(r, len * 0.55, CS, RS), fur, 'tail', [0, -len * 0.45, 0]);
      const g2 = joint(g, 'tail2', [0, -len * 0.75, 0], [-0.5, 0, 0]);
      part(g2, G.sphere(r * 0.95, RS, 8), tipMat, 'tailTip', [0, -r * 0.6, 0], null, [1, 1.3, 1]);
      break; }
    case 'puff': part(g, G.sphere(t.r ?? fig.dims.H * 0.07, 10, 8), tipMat, 'tail', [0, -0.01, 0]); break;
    case 'bob': part(g, G.capsule(t.r ?? fig.dims.H * 0.04, t.len ?? fig.dims.H * 0.08, 3, 8), fur, 'tail', [0, -(t.len ?? fig.dims.H * 0.08) * 0.5, 0]);
      part(g, G.sphere((t.r ?? fig.dims.H * 0.04) * 1.05, 8, 6), dark, 'tailTip', [0, -(t.len ?? fig.dims.H * 0.08) * 1.0, 0]); break;
    case 'stub': part(g, G.sphere(t.r ?? fig.dims.H * 0.045, 8, 6), fur, 'tail', [0, -0.01, 0]); break;
    case 'curly': part(g, G.torus(t.r ?? fig.dims.H * 0.05, (t.r ?? fig.dims.H * 0.05) * 0.3, 6, 12, Math.PI * 1.6), fur, 'tail', [0, -0.02, -0.01], [0.3, Math.PI / 2, 0]); break;
    case 'long': {
      const len = t.len ?? fig.dims.H * 0.4, r = t.r ?? fig.dims.H * 0.03;
      part(g, G.capsule(r, len * 0.55, CS, 8), fur, 'tail', [0, -len * 0.3, 0]);
      const g2 = joint(g, 'tail2', [0, -len * 0.6, 0], [-0.6, 0, 0]);
      part(g2, G.capsule(r * 0.8, len * 0.4, CS, 8), t.tip ? tipMat : fur, 'tail2', [0, -len * 0.2, 0]);
      if (t.rings) for (let i = 0; i < 3; i++) part(g, G.torus(r * 1.02, r * 0.3, 5, 10), dark, 'ring' + i, [0, -len * (0.1 + i * 0.16), 0], [Math.PI / 2, 0, 0]);
      break; }
    case 'thick': {
      const len = t.len ?? fig.dims.H * 0.35, r = t.r ?? fig.dims.H * 0.05;
      part(g, G.capsule(r, len * 0.7, CS, 8), fur, 'tail', [0, -len * 0.4, 0], null, [1.3, 1, 0.7]);
      break; }
  }
}

// ------------------------------------------------------------------ species extras
function buildExtras(fig, face, head, headMesh, spec, k) {
  const { part, joint, fur, cream, dark, RS, SW, SH } = k;
  const R = fig.dims.headR; const hs = fig.dims.headScale;
  const ex = spec.extras || [];
  const ey = spec.eyes;
  const patchMesh = (mat, name, phi0, phiLen, th0, thLen, r = R + 0.002) => {
    const m = new THREE.Mesh(G.patch(r, 16, 6, phi0, phiLen, th0, thLen), mat); m.name = `${spec.name}_${name}`; headMesh.add(m); fig.parts.push(m); return m;
  };
  for (const x of ex) {
    switch (x) {
      case 'mask': { // raccoon: dark band across the eyes
        const dm = celMat(k.ctx, 0x3a2f33, 0x1f181b);
        patchMesh(dm, 'mask', Math.PI / 2 - 1.15, 2.3, Math.PI / 2 - ey.elev - ey.thetaLen * 0.62, ey.thetaLen * 1.25);
        patchMesh(cream, 'maskBrow', 0, Math.PI * 2, Math.PI / 2 - ey.elev - ey.thetaLen * 0.95, ey.thetaLen * 0.33, R + 0.0015);
        break; }
      case 'badgerFace': { // white face with the dark head and dark eye stripes
        const wh = celMat(k.ctx, 0xF6F2EC, 0xB9A4C9);
        patchMesh(wh, 'faceWhite', Math.PI / 2 - 1.3, 2.6, 0.5, 1.5, R + 0.0015);
        const dm = dark;
        for (const sx of [-1, 1]) patchMesh(dm, 'stripe' + sx, Math.PI / 2 + sx * ey.az - 0.3, 0.6, 0.2, 1.9, R + 0.002);
        break; }
      case 'dogPatch': {
        const dm = celMat(k.ctx, spec.dark ?? 0x5a3a24, spec.darkShade ?? 0x3a2416);
        patchMesh(dm, 'patch', Math.PI / 2 - ey.az - 0.42, 0.8, Math.PI / 2 - ey.elev - ey.thetaLen * 0.75, ey.thetaLen * 1.5, R + 0.002);
        break; }
      case 'horns': {
        const hm = celMat(k.ctx, 0xC9B79A, 0x8A7558);
        for (const sx of [-1, 1]) part(face, G.cone(R * 0.11, R * 0.5, 8), hm, 'horn' + sx, [sx * R * 0.35, R * 0.98, -R * 0.1], [-0.6, 0, -sx * 0.25]);
        break; }
      case 'antlers': {
        const am = celMat(k.ctx, 0xB89A74, 0x7A6248);
        for (const sx of [-1, 1]) {
          const g = new THREE.Group(); g.position.set(sx * R * 0.45, R * 0.95, -R * 0.1); g.rotation.set(-0.35, 0, -sx * 0.35); face.add(g);
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
      case 'ruff': // lynx cheek ruffs: flattened cones pointing down and out from the cheeks
        for (const sx of [-1, 1]) part(face, G.cone(R * 0.28, R * 0.55, 6), cream, 'ruff' + sx, [sx * R * 0.78 * hs[0], -R * 0.45, R * 0.25], [Math.PI + 0.2, 0, sx * 0.55], [1, 1, 0.45]);
        break;
      case 'wool': {
        const wm = celMat(k.ctx, spec.wool ?? 0xF7F1E4, spec.woolShade ?? 0xC5B6D8);
        const rng = (i) => (Math.sin(i * 12.9898) * 43758.5453) % 1;
        for (let i = 0; i < 7; i++) {
          const a = i / 7 * Math.PI * 2; const r = R * 0.33;
          part(face, G.sphere(r, 10, 8), wm, 'wool' + i, [Math.cos(a) * R * 0.55 * hs[0], R * 0.82 + Math.abs(rng(i)) * R * 0.08, Math.sin(a) * R * 0.5 * hs[2]]);
        }
        part(face, G.sphere(R * 0.45, 12, 8), wm, 'woolTop', [0, R * 0.95, 0]);
        // body wool
        const ch = fig.dims.chest; const sp = fig.j.spine;
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; part(sp, G.sphere(ch[0] * 0.5, 10, 8), wm, 'bodyWool' + i, [Math.cos(a) * ch[0] * 0.85, fig.dims.torso * 0.55 + Math.sin(a * 2) * 0.02, Math.sin(a) * ch[2] * 0.8]); }
        break; }
      case 'boarMane': {
        for (let i = 0; i < 4; i++) part(face, G.cone(R * 0.1, R * 0.3, 5), dark, 'mane' + i, [0, R * (0.95 - i * 0.12), -R * (0.1 + i * 0.2)], [-0.5 - i * 0.2, 0, 0]);
        break; }
      case 'glasses': {
        const gm = celMat(k.ctx, 0x2a2426, 0x151012);
        const g = joint(face, 'glasses', [0, 0, 0]);
        const lensR = R * ey.thetaLen * 0.5;
        const zc = R * hs[2] * 0.93;
        const zf = R * hs[2] * Math.cos(ey.az) + 0.03;
        const elevY = R * hs[1] * Math.sin(ey.elev);
        const xo = R * hs[0] * Math.sin(ey.az) * 1.02;
        for (const sx of [-1, 1]) {
          part(g, G.torus(lensR, R * 0.02, 6, 24), gm, 'rim' + sx, [sx * xo, elevY, zf], [0, sx * ey.az * 0.6, 0]);
          // thin highlight sliver inside the upper lens, does not cover the eye
          const hl = new THREE.Mesh(G.plane(lensR * 0.8, lensR * 0.12), flatMat(k.ctx, 0xCFE6F5)); hl.name = `${spec.name}_lensHL${sx}`;
          hl.position.set(sx * xo + sx * lensR * 0.05, elevY + lensR * 0.62, zf + 0.004); hl.rotation.set(0, sx * ey.az * 0.6, sx * 0.35); g.add(hl); fig.parts.push(hl); hl.castShadow = false;
          // arm back to the ear
          part(g, G.cyl(R * 0.014, R * 0.014, R * 1.1, 5), gm, 'glassArm' + sx, [sx * (xo + lensR * 0.9), elevY + lensR * 0.3, zf - R * 0.5], [Math.PI / 2, 0, 0]);
        }
        part(g, G.cyl(R * 0.015, R * 0.015, xo * 2 - lensR * 1.9, 5), gm, 'bridge', [0, elevY + lensR * 0.15, zf + 0.002], [0, 0, Math.PI / 2]);
        break; }
    }
  }
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
