// The 90 m bronze colossus: FK hierarchy of Groups (no SkinnedMesh). Forged verdigris plates with
// gold edge bands, rivet rows, verdigris drips and engraved relief; layered pauldrons, sun emblem on
// the chest, narrow banded waist, tassets, heavy greaves, articulated fingers, the round mask with
// its rayed slit. buildGiant returns a rig with apply(pose) used by index.js every frame.
import * as THREE from 'three';
import {
  makeMaterials, makeInk, mesh, part, ring, ball, vent, countTriangles, finish, mergeList,
  cylSurf, sphSurf, mapSurf, slabGeo, patchGeo, ribbonGeo, rivetGeo, forgedPlate, pillow, volute, localMetric, wrapGeo,
  SLIT_LIT, SLIT_DARK, HALO_LIT, HALO_DARK,
} from './parts.js';
import { applyTwoBone, makeIkTemps } from './ik.js';

// Proportions (metres, standing). Hips 41.5, thigh 20, shin 17, ankle 5.51 above the sole.
export const G = {
  hipY: 41.5, hipX: 7, thigh: 20, shin: 17, ankleH: 5.51,
  shoulderX: 14, shoulderY: 22, upperArm: 25, foreArm: 23,
  neckBase: 24.5, neckSeg: 2.3, headPivot: 2.4, headR: 7.5, headUp: 9,  // head centre = hips + 24.5 + 2.3*2 + 2.4 + 9 = 82
  footCentre: new THREE.Vector3(0, -3, 3),                             // foot centre relative to the ankle (foot frame)
};
// finger layout (hand frame): knuckle line, phalanx lengths. L1 is fixed by the wall grip clearance.
export const HAND = { knuckleY: -11.2, fingerZ: -4.2, L1: 3.0, L2: 3.4, L3: 2.8, xs: [-3.75, -1.25, 1.25, 3.75], len: [0.9, 1.0, 0.96, 0.82] };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

export function buildGiant(ctx) {
  const { MAP, ID, LAYER, tag } = ctx;
  const H = (n) => MAP.hash1(n);
  const mats = makeMaterials(ctx, { paintScale: 8, seed: 1 });
  const bc = { mats, ink: makeInk(ID.GIANT_MIN, ID.GIANT_MAX), tag, layer: LAYER.FG, meshes: [], vents: [], name: 'giant' };
  let seed = 1;
  // forged ring with the giant's defaults
  const R = (parent, o) => ring(bc, parent, { hash: H, seed: seed++, thick: 0.6, bu: 0.38, bv: 0.14, su: 8, sv: 3, band: 0.6, bandRaise: 0.18, rivetR: 0.25, rivetSpacing: 1.9, drips: 0.4, dripLen: 0.6, gap: 0.05, ...o });

  const root = new THREE.Group(); root.name = 'giant';
  const pelvis = new THREE.Group(); pelvis.name = 'giant.pelvis'; pelvis.position.y = G.hipY; root.add(pelvis);

  // ------------------------------------------------------------------ pelvis, belt, tassets
  R(pelvis, { y: -4.5, h: 6, rTop: 8.7, rBot: 9.8, n: 6, phase: 0.2, broken: [4] });
  {
    const pt = part(bc, pelvis, 'belt', { drift: V(0, 0, 1) });
    const s = cylSurf({ rTop: 8.7, rBot: 9.25, h: 1.9, t0: 0, len: TAU, y0: 0.2 });
    pt.add('gold', slabGeo(s, { thick: 0.9, bump: pillow(0, 0.18), su: 48, sv: 2 }));
    for (let k = 0; k < 32; k++) { const u = k / 32; pt.add('dark', rivetGeo(s.P(u, 0.5, 0.18), s.N(u, 0.5), 0.3, 5)); }
    pt.end();
  }
  const tassets = [];
  for (const side of [1, -1]) for (const front of [true, false]) {
    const tc = front ? side * 0.4 : Math.PI - side * 0.4;
    const hinge = V(10.0 * Math.sin(tc), -0.6, 10.0 * Math.cos(tc));
    const g = new THREE.Group(); g.name = 'giant.tasset'; g.position.copy(hinge); pelvis.add(g);
    const T = new THREE.Matrix4().makeTranslation(-hinge.x, -hinge.y, -hinge.z);
    const lames = [[-5.4, 4.8, 10.0, 10.45, 0.6], [-9.3, 4.4, 10.2, 10.75, 0.64], [-13.0, 4.2, 10.45, 11.0, 0.68]];
    lames.forEach(([y0, h, rTop, rBot, w], k) => {
      const surf = mapSurf(cylSurf({ rTop, rBot, h, t0: tc - w / 2, len: w, y0 }), T);
      const pt = part(bc, g, 'tasset', { drift: V(Math.sin(tc), -0.2, Math.cos(tc)) });
      const bump = forgedPlate(pt, surf, { thick: 0.5, bu: 0.3, bv: 0.12, su: 6, sv: 3, band: 0.55, bandRaise: 0.18, rivetR: 0.24, rivetSpacing: 1.6, drips: k === 0 ? 0.5 : 0.3, dripLen: 0.5, hash: H, seed: seed++ });
      if (k === 2) volute(pt, surf, 0.5, 0.52, { size: 1.0, width: 0.2, bump });
      pt.end();
    });
    tassets.push({ g, front, side, axis: V(Math.cos(tc), 0, -Math.sin(tc)), phase: H(side * 3 + (front ? 1 : 2)) * 6 });
  }

  // ------------------------------------------------------------------ torso
  const torso = new THREE.Group(); torso.name = 'giant.torso'; pelvis.add(torso);
  // narrow waist: three overlapping horizontal bands, the middle one carries a meander
  R(torso, { y: 0.6, h: 3.2, rTop: 7.2, rBot: 8.2, n: 6, phase: 0.1, band: 0.45, drips: 0.25, rivetSpacing: 1.6 });
  R(torso, { y: 3.0, h: 3.2, rTop: 7.0, rBot: 7.7, n: 6, phase: 0.6, band: 0.45, rivets: false, drips: 0, meanderBand: [0.22, 0.86, 1.5, 0.13] });
  R(torso, { y: 5.4, h: 3.4, rTop: 8.7, rBot: 7.5, n: 6, phase: 0.3, band: 0.45, drips: 0.3, rivetSpacing: 1.6 });
  // ribs: the plate on the left side is missing, the works show through
  R(torso, { y: 8.2, h: 4.0, rTop: 11.3, rBot: 9.1, n: 6, phase: 0, missing: [1] });
  // chest (front plate centred) and the yoke over it
  R(torso, { y: 11.6, h: 6.8, rTop: 13.0, rBot: 11.7, n: 6, phase: -Math.PI / 6, thick: 0.75, bu: 0.45, broken: [2], drips: 0.5 });
  R(torso, { y: 18.0, h: 5.0, rTop: 10.2, rBot: 13.4, n: 6, phase: 0, thick: 0.7, drips: 0.45 });
  // segmented neck collar (gorget)
  R(torso, { y: 22.2, h: 2.6, rTop: 8.6, rBot: 10.6, n: 8, phase: 0.2, band: 0.5, drips: 0.2, rivetSpacing: 1.5 });
  R(torso, { y: 24.2, h: 2.3, rTop: 7.2, rBot: 8.9, n: 8, phase: 0.6, band: 0.45, drips: 0, rivetSpacing: 1.4 });
  R(torso, { y: 25.9, h: 2.0, rTop: 6.2, rBot: 7.5, n: 8, phase: 0.0, band: 0.4, drips: 0, rivetSpacing: 1.3 });
  // the sun emblem on the breast: medallion, 12 wedge disc, 12 rays (echoes the gate's sun)
  {
    const s = cylSurf({ rTop: 13.0, rBot: 11.7, h: 6.8, t0: -Math.PI / 2, len: Math.PI, y0: 11.6 });
    const pt = part(bc, torso, 'emblem', { drift: V(0, 0, 1) });
    const lift = () => 0.62;
    const flat = [];
    const disc = (r0, r1, a0, a1, z0, z1, segs = 6) => {
      const shp = new THREE.Shape();
      shp.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      for (let k = 0; k <= segs; k++) { const a = a0 + (a1 - a0) * k / segs; shp.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); }
      for (let k = segs; k >= 0; k--) { const a = a0 + (a1 - a0) * k / segs; shp.lineTo(Math.cos(a) * r0, Math.sin(a) * r0); }
      return new THREE.ExtrudeGeometry(shp, { depth: z1 - z0, bevelEnabled: false }).translate(0, 0, z0);
    };
    pt.add('verd', wrapGeo(disc(0, 6.3, 0, TAU, -0.3, 0.25, 48), s, 0.5, 0.5, lift));
    pt.add('gold', wrapGeo(disc(5.9, 6.6, 0, TAU, -0.2, 0.5, 48), s, 0.5, 0.5, lift));
    for (let k = 0; k < 12; k++) {
      const a0 = k * Math.PI / 6 + 0.03, a1 = (k + 1) * Math.PI / 6 - 0.03;
      pt.add('gold', wrapGeo(disc(0.35, 2.7, a0, a1, 0.2, 0.75, 3), s, 0.5, 0.5, lift));
      const a = 15 * Math.PI / 180 + k * Math.PI / 6, c = Math.cos(a), sn = Math.sin(a);
      const long = k % 2 === 0;
      const P = (rr, t) => new THREE.Vector2(c * rr - sn * t, sn * rr + c * t);
      const tri = new THREE.Shape([P(3.05, -0.75), P(long ? 5.6 : 4.9, 0), P(3.05, 0.75)]);
      pt.add('gold', wrapGeo(new THREE.ExtrudeGeometry(tri, { depth: 0.45, bevelEnabled: false }).translate(0, 0, 0.2), s, 0.5, 0.5, lift));
    }
    pt.add('gold', wrapGeo(disc(2.85, 3.1, 0, TAU, 0.2, 0.6, 36), s, 0.5, 0.5, lift));
    for (let k = 0; k < 24; k++) { const a = k * TAU / 24; const x = Math.cos(a) * 6.25, y = Math.sin(a) * 6.25; const u = 0.5 + x / s.du, v = 0.5 + y / s.dv; pt.add('gold', rivetGeo(s.P(u, v, 0.62 + 0.5), s.N(u, v), 0.22, 5)); }
    pt.end();
  }
  for (const s of [-1, 1]) vent(bc, torso, { pos: [s * 3.6, 25.3, -7.3], dir: [s * 0.35, 0.6, -1], r: 1.0, len: 2.0, joint: 'neck', side: s > 0 ? 'L' : 'R' });

  // ------------------------------------------------------------------ neck and head
  const neck1 = new THREE.Group(); neck1.position.y = G.neckBase; torso.add(neck1);
  const neck2 = new THREE.Group(); neck2.position.y = G.neckSeg; neck1.add(neck2);
  const neck3 = new THREE.Group(); neck3.position.y = G.neckSeg; neck2.add(neck3);
  const head = new THREE.Group(); head.name = 'giant.head'; head.position.y = G.headPivot; neck3.add(head);
  for (const [n, ph] of [[neck1, 0], [neck2, 0.4], [neck3, 0.8]]) R(n, { y: 0.0, h: 2.4, rTop: 5.4, rBot: 6.0, n: 5, phase: ph, band: 0.45, drips: 0, rivetSpacing: 1.3, su: 6 });
  const neckCore = mesh(bc, finish(new THREE.CylinderGeometry(4.8, 5.0, 10, 14)), mats.dark, 'neckcore'); neckCore.position.y = 4; neckCore.userData.drift = V(0, 0, 0); neck1.add(neckCore);
  const { slit, halo } = buildHead(head);

  // ------------------------------------------------------------------ shoulders and arms
  const arms = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const pauld = new THREE.Group(); pauld.name = 'giant.pauldron' + key; pauld.position.set(side * G.shoulderX, G.shoulderY, 0); pauld.rotation.z = -side * 0.35; torso.add(pauld);
    buildPauldron(pauld, side);
    const vd = V(side * 0.3, 1.0, -0.4).normalize();
    vent(bc, pauld, { pos: V(side * 1.4, 0.8, 0).addScaledVector(vd, 7.75).toArray(), dir: [vd.x, vd.y, vd.z], r: 1.0, len: 2.0, joint: 'shoulder', side: key });

    const upper = new THREE.Group(); upper.name = 'giant.upperArm' + key; upper.position.set(side * G.shoulderX, G.shoulderY, 0); torso.add(upper);
    ball(bc, upper, 4.1, [0, 0, 0], 20);
    R(upper, { y: -12.6, h: 8.4, rTop: 4.5, rBot: 4.15, n: 5, phase: 0.3, rivetSpacing: 1.5, su: 6 });
    R(upper, { y: -21.4, h: 8.6, rTop: 4.25, rBot: 3.9, n: 5, phase: side > 0 ? 0.0 : 0.943, broken: side > 0 ? [] : [0], rivetSpacing: 1.5, su: 6 });
    const ucore = mesh(bc, finish(new THREE.CylinderGeometry(3.4, 3.2, 22, 12)), mats.dark, 'armcore'); ucore.position.y = -13; ucore.userData.drift = V(0, 0, 0); upper.add(ucore);
    const fore = new THREE.Group(); fore.name = 'giant.foreArm' + key; fore.position.y = -G.upperArm; upper.add(fore);
    ball(bc, fore, 3.7, [0, 0, 0], 18);
    buildCouter(fore);
    R(fore, { y: -10.2, h: 7.6, rTop: 3.9, rBot: 3.6, n: 5, phase: side > 0 ? 0.314 : 0.6, missing: side > 0 ? [3] : [], rivetSpacing: 1.4, su: 6 });
    R(fore, { y: -19.8, h: 9.2, rTop: 3.65, rBot: 3.9, n: 5, phase: 0.9, rivetSpacing: 1.4, su: 6, drips: 0.3 });
    const fcore = mesh(bc, finish(new THREE.CylinderGeometry(3.0, 2.8, 21, 12)), mats.dark, 'armcore'); fcore.position.y = -12; fcore.userData.drift = V(0, 0, 0); fore.add(fcore);
    vent(bc, fore, { pos: [0, -1.4, -3.9], dir: [0, 0.45, -1], r: 0.85, len: 1.7, joint: 'elbow', side: key });
    const hand = new THREE.Group(); hand.name = 'giant.hand' + key; hand.position.y = -G.foreArm; fore.add(hand);
    const fingers = buildHand(hand, side);
    arms[key] = { upper, fore, hand, fingers };
  }

  // ------------------------------------------------------------------ legs
  const legs = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const thigh = new THREE.Group(); thigh.name = 'giant.thigh' + key; thigh.position.set(side * G.hipX, 0, 0); pelvis.add(thigh);
    ball(bc, thigh, 4.3, [0, 0, 0], 20);
    R(thigh, { y: -11.0, h: 8.6, rTop: 5.1, rBot: 4.7, n: 5, phase: 0.2, rivetSpacing: 1.6, su: 6 });
    R(thigh, { y: -19.0, h: 7.4, rTop: 4.8, rBot: 4.3, n: 5, phase: 0.75, rivetSpacing: 1.6, su: 6 });
    const tcore = mesh(bc, finish(new THREE.CylinderGeometry(3.9, 3.6, 18, 12)), mats.dark, 'legcore'); tcore.position.y = -10.5; tcore.userData.drift = V(0, 0, 0); thigh.add(tcore);
    vent(bc, thigh, { pos: [side * 4.9, -2.0, -0.6], dir: [side * 1, 0.35, -0.2], r: 0.9, len: 1.8, joint: 'hip', side: key });
    const shin = new THREE.Group(); shin.name = 'giant.shin' + key; shin.position.y = -G.thigh; thigh.add(shin);
    ball(bc, shin, 3.7, [0, 0, 0], 18);
    buildKnee(shin);
    buildGreave(shin, side);
    vent(bc, shin, { pos: [side * 4.15, -1.6, 1.0], dir: [side * 1, 0.35, 0.35], r: 0.9, len: 1.8, joint: 'knee', side: key });
    const foot = new THREE.Group(); foot.name = 'giant.foot' + key; foot.position.y = -G.shin; shin.add(foot);
    buildFoot(foot, side);
    legs[key] = { thigh, shin, foot };
  }

  // ================================================================== builders (closures over bc)
  function buildHead(headG) {
    const r = G.headR;
    const skull = new THREE.Group(); skull.position.y = G.headUp; headG.add(skull);
    const base = mesh(bc, finish(new THREE.SphereGeometry(r, 28, 18)), mats.verd, 'skull');
    base.userData.drift = V(0, 1, 0); skull.add(base);
    const Qz = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(0, 0, 1));
    const Rm = r + 0.3, A = 0.98;
    // the round mask (cap around +z) with its gold rim and rivets; v = 1 at the centre, 0 at the rim
    const maskS = sphSurf({ R: Rm, phi0: 0, phiLen: TAU, thLo: A, thHi: 0.0, quat: Qz });
    const mk = part(bc, skull, 'mask', { drift: V(0, 0, 1) });
    mk.add('verd', slabGeo(maskS, { thick: 0.6, su: 40, sv: 8 }));
    mk.add('gold', slabGeo(maskS, { thick: 0.7, bump: () => 0.24, su: 48, sv: 1, v0: -0.012, v1: 0.085 }));
    for (let k = 0; k < 28; k++) { const u = (k + 0.5) / 28; mk.add('dark', rivetGeo(maskS.P(u, 0.04, 0.24), maskS.N(u, 0.04), 0.2, 5)); }
    // radial rays around the slit (the sun again), alternating long and short, none along the slit
    const a = 1.35, b = 3.95;
    for (let k = 0; k < 28; k++) {
      const ph = (k + 0.5) * TAU / 28;
      if (Math.abs(Math.sin(ph)) < 0.36) continue;
      const rho0 = 1 / Math.sqrt((Math.sin(ph) / a) ** 2 + (Math.cos(ph) / b) ** 2) + 0.35;
      const rho1 = (k % 2 ? 0.8 : 0.66) * A * Rm;
      if (rho1 <= rho0 + 0.6) continue;
      const v0 = 1 - rho0 / Rm / A, v1 = 1 - rho1 / Rm / A;
      mk.add('gold', ribbonGeo(maskS, (t) => [ph / TAU, v0 + (v1 - v0) * t], { n: 6, width: (t) => 0.34 - 0.18 * t, height: 0.13 }));
    }
    // a ring of small engraved dots between the rays and the rim
    for (let k = 0; k < 28; k++) { const u = k / 28; mk.add('gold', rivetGeo(maskS.P(u, 0.17, 0), maskS.N(u, 0.17), 0.14, 5)); }
    // slit frame on the head sphere: gold lips either side of the halo, caps at the ends
    const fS = sphSurf({ R: Rm, phi0: -0.25, phiLen: 0.5, thLo: Math.PI / 2 + 0.6, thHi: Math.PI / 2 - 0.6 });
    const pu = (phi) => (phi + 0.25) / 0.5, pv = (th) => (Math.PI / 2 + 0.6 - th) / 1.2;
    for (const s of [-1, 1]) mk.add('gold', ribbonGeo(fS, (t) => [pu(s * 0.088), pv(Math.PI / 2 + 0.5 - t * 1.0)], { n: 10, width: 0.32, height: 0.2 }));
    for (const s of [-1, 1]) mk.add('gold', ribbonGeo(fS, (t) => [pu(-0.088 + 0.176 * t), pv(Math.PI / 2 + s * 0.5)], { n: 3, width: 0.32, height: 0.2 }));
    mk.end();
    // the slit: bright flat sector in front, darker wider halo behind it
    const hS = sphSurf({ R: Rm, phi0: -0.07, phiLen: 0.14, thLo: Math.PI / 2 + 0.47, thHi: Math.PI / 2 - 0.47 });
    const sS = sphSurf({ R: Rm, phi0: -0.032, phiLen: 0.064, thLo: Math.PI / 2 + 0.4, thHi: Math.PI / 2 - 0.4 });
    const haloM = mesh(bc, patchGeo(hS, { off: 0.03, su: 3, sv: 12 }), mats.halo, 'halo', mk.id);
    const slitM = mesh(bc, patchGeo(sS, { off: 0.07, su: 2, sv: 10 }), mats.slit, 'slit', mk.id);
    for (const m of [haloM, slitM]) { m.castShadow = false; m.userData.drift = V(0, 0, 1); skull.add(m); }
    // crown cap with a gold lower band, the crest ridge from brow to nape
    {
      const cS = sphSurf({ R: r + 0.22, phi0: 0, phiLen: TAU, thLo: 0.64, thHi: 0.0 });
      const pt = part(bc, skull, 'crown', { drift: V(0, 1, 0) });
      pt.add('verd', slabGeo(cS, { thick: 0.5, su: 36, sv: 4 }));
      pt.add('gold', slabGeo(cS, { thick: 0.6, bump: () => 0.2, su: 36, sv: 1, v0: -0.01, v1: 0.12 }));
      for (let k = 0; k < 24; k++) { const u = (k + 0.5) / 24; pt.add('gold', rivetGeo(cS.P(u, 0.22, 0), cS.N(u, 0.22), 0.2, 5)); }
      const Rc = r + 0.2;
      const crestS = { P(u, v, off = 0) { const al = 0.62 - u * 2.5, rr = Rc + off; return V(0, rr * Math.cos(al), rr * Math.sin(al)); }, N(u) { const al = 0.62 - u * 2.5; return V(0, Math.cos(al), Math.sin(al)); }, du: Rc * 2.5, dv: 1 };
      pt.add('verd', ribbonGeo(crestS, (t) => [t, 0], { n: 24, width: (t) => 1.0 - 0.3 * Math.abs(t - 0.35), height: (1.7), base: -0.1 }));
      pt.add('gold', ribbonGeo(crestS, (t) => [t, 0], { n: 24, width: 0.55, height: 2.05, base: 1.6 }));
      for (let k = 1; k < 9; k++) for (const s of [-1, 1]) { const u = k / 9, p = crestS.P(u, 0, 0.9), n = crestS.N(u); pt.add('gold', rivetGeo(p.add(V(s * 0.5, 0, 0)), V(s, 0, 0), 0.18, 5)); }
      pt.end();
    }
    // ear discs with a gold rim, a boss and eight ribs
    for (const s of [-1, 1]) {
      const pt = part(bc, skull, 'ear', { drift: V(s, 0, 0) });
      const discG = [];
      discG.push(new THREE.CylinderGeometry(2.3, 2.5, 1.3, 24).rotateZ(Math.PI / 2));
      pt.add('verd', mergeList(discG).translate(s * 7.45, 0.3, -0.4));
      pt.add('gold', finish(new THREE.TorusGeometry(2.2, 0.26, 6, 24).rotateY(Math.PI / 2)).translate(s * 8.1, 0.3, -0.4));
      pt.add('gold', finish(new THREE.SphereGeometry(0.75, 10, 5, 0, TAU, 0, Math.PI / 2).rotateZ(-s * Math.PI / 2)).translate(s * 8.08, 0.3, -0.4));
      for (let k = 0; k < 8; k++) {
        const ang = k * Math.PI / 4;
        pt.add('gold', finish(new THREE.BoxGeometry(0.3, 1.1, 0.22).translate(0, 1.4, 0).rotateX(ang).translate(s * 8.12, 0.3, -0.4)));
      }
      pt.end();
    }
    // back plates of the skull, a nape guard below them
    [[1.02, 1.42], [2.48, 1.32], [3.84, 1.42]].forEach(([p0, w], k) => {
      const s = sphSurf({ R: r + 0.18, phi0: p0, phiLen: w, thLo: 2.25, thHi: 0.62 });
      const pt = part(bc, skull, 'skullplate', { drift: V(Math.sin(p0 + w / 2), 0.2, Math.cos(p0 + w / 2)) });
      forgedPlate(pt, s, { thick: 0.45, bu: 0.25, bv: 0.25, su: 8, sv: 6, band: 0.5, rivetR: 0.2, rivetSpacing: 1.2, drips: 0.5, dripLen: 0.45, hash: H, seed: seed++ });
      pt.end();
    });
    return { slit: slitM, halo: haloM };
  }

  function buildPauldron(pauld, side) {
    const c = V(side * 1.4, 0.8, 0);
    const out = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    // cap
    const cap = sphSurf({ R: 7.6, phi0: 0, phiLen: TAU, thLo: 0.84, thHi: 0.02, centre: c });
    const pt = part(bc, pauld, 'pauldron', { drift: V(side * 0.6, 1, 0) });
    pt.add('verd', slabGeo(cap, { thick: 0.6, bump: pillow(0, 0.2), su: 32, sv: 5 }));
    pt.add('gold', slabGeo(cap, { thick: 0.7, bump: () => 0.2, su: 32, sv: 1, v0: -0.01, v1: 0.09 }));
    for (let k = 0; k < 22; k++) { const u = (k + 0.5) / 22; pt.add('gold', rivetGeo(cap.P(u, 0.16, 0.12), cap.N(u, 0.16), 0.24, 5)); }
    const uo = ((out % TAU) + TAU) % TAU / TAU;
    volute(pt, cap, uo, 0.47, { size: 1.6, width: 0.24, height: 0.15, bump: pillow(0, 0.2), rot: 0 });
    volute(pt, cap, uo - 0.12, 0.42, { size: 0.9, width: 0.18, height: 0.13, bump: pillow(0, 0.2), rot: 0.6 });
    volute(pt, cap, uo + 0.12, 0.42, { size: 0.9, width: 0.18, height: 0.13, bump: pillow(0, 0.2), rot: -0.6 });
    pt.end();
    // three lames fanning down and out, each overlapping the one below
    [[8.1, 0.66, 1.1, 1.6], [8.6, 0.96, 1.38, 1.46], [9.1, 1.24, 1.66, 1.32]].forEach(([Rl, th0, th1, wf], k) => {
      const w = wf * Math.PI;
      const s = sphSurf({ R: Rl, phi0: out - w / 2, phiLen: w, thLo: th1, thHi: th0, centre: c });
      const lp = part(bc, pauld, 'pauldron', { drift: V(side, 0.4 - k * 0.3, 0) });
      const bump = forgedPlate(lp, s, { thick: 0.55, bu: 0.15, bv: 0.22, su: 18, sv: 3, band: 0.6, bandRaise: 0.2, rivetR: 0.24, rivetSpacing: 1.7, drips: 0.45, dripLen: 0.5, hash: H, seed: seed++ });
      if (k === 1) for (const du of [-0.24, 0.24]) volute(lp, s, 0.5 + du, 0.55, { size: 0.75, width: 0.16, height: 0.12, bump, rot: du > 0 ? 0 : Math.PI });
      lp.end();
    });
  }

  function buildCouter(fore) {
    // elbow cop: a dome on the outer point of the elbow (local +z faces the pole) with a fan lame
    const Q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(0, 0, 1));
    const s = sphSurf({ R: 4.15, phi0: 0, phiLen: TAU, thLo: 0.95, thHi: 0.0, quat: Q });
    const pt = part(bc, fore, 'couter', { drift: V(0, 0, 1) });
    forgedPlate(pt, s, { thick: 0.5, bu: 0, bv: 0.25, su: 20, sv: 3, band: 0.5, rivets: false, drips: 0 });
    for (let k = 0; k < 12; k++) { const u = (k + 0.5) / 12; pt.add('gold', rivetGeo(s.P(u, 0.18, 0.1), s.N(u, 0.18), 0.2, 5)); }
    volute(pt, s, 0.25, 0.5, { size: 0.7, width: 0.15, height: 0.12, rot: Math.PI / 2 });
    pt.end();
  }

  function buildKnee(shin) {
    // poleyn: knee cop toward the pole (local +z), kept compact so the kick knee clears the arch
    const Q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(0, 0, 1));
    const s = sphSurf({ R: 3.95, phi0: 0, phiLen: TAU, thLo: 0.9, thHi: 0.0, quat: Q, centre: V(0, -0.6, 0) });
    const pt = part(bc, shin, 'poleyn', { drift: V(0, 0, 1) });
    forgedPlate(pt, s, { thick: 0.5, bu: 0, bv: 0.2, su: 20, sv: 3, band: 0.45, rivets: false, drips: 0 });
    for (let k = 0; k < 10; k++) { const u = (k + 0.5) / 10; pt.add('gold', rivetGeo(s.P(u, 0.2, 0.1), s.N(u, 0.2), 0.18, 5)); }
    pt.end();
  }

  function buildGreave(shin, side) {
    R(shin, { y: -10.6, h: 7.8, rTop: 4.5, rBot: 4.15, n: 5, phase: 0.0, rivetSpacing: 1.5, su: 6, drips: 0.45 });
    R(shin, { y: -16.6, h: 6.4, rTop: 4.2, rBot: 4.55, n: 5, phase: 0.63, rivetSpacing: 1.5, su: 6, drips: 0.35 });
    const score = mesh(bc, finish(new THREE.CylinderGeometry(3.5, 3.3, 15, 12)), mats.dark, 'legcore'); score.position.y = -9; score.userData.drift = V(0, 0, 0); shin.add(score);
    // a gold ridge down the front of the greave
    const s = cylSurf({ rTop: 4.5 + 0.38, rBot: 4.55 + 0.3, h: 13.4, t0: -0.2, len: 0.4, y0: -16.4 });
    const pt = part(bc, shin, 'greave', { drift: V(0, 0, 1) });
    pt.add('gold', ribbonGeo(s, (t) => [0.5, 0.06 + 0.88 * t], { n: 6, width: 0.5, height: 0.35 }));
    pt.end();
  }

  function buildFoot(foot, side) {
    ball(bc, foot, 3.0, [0, 0, 0], 16);
    // sole (dark) and the overlapping toe lames of the sabaton, ankle cuff
    const sole = mesh(bc, finish(new THREE.BoxGeometry(7.8, 1.25, 15.2).translate(0, -4.875, 3.2)), mats.dark, 'sole');
    sole.userData.drift = V(0, 1, 0); foot.add(sole);
    // swap y and z: cylinder axis along +z (toe direction), theta 0 = up
    const swap = (z0) => new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, -4.25, 0, 1, 0, z0, 0, 0, 0, 1);
    const lames = [[-4.3, 4.4, 3.95, 3.95], [-0.4, 4.0, 4.05, 4.0], [3.2, 3.6, 3.75, 3.7], [6.4, 3.0, 3.35, 3.2], [8.9, 2.0, 2.85, 2.55]];
    lames.forEach(([z0, len, rBack, rFront], k) => {
      const s = mapSurf(cylSurf({ rTop: rFront, rBot: rBack, h: len, t0: -Math.PI / 2, len: Math.PI, y0: 0 }), swap(z0));
      const pt = part(bc, foot, 'sabaton', { drift: V(0, 0.6, 0.6) });
      forgedPlate(pt, s, { thick: 0.5, bu: 0.25, bv: 0.12, su: 10, sv: 2, band: 0.5, bandRaise: 0.16, topBand: 0, rivetR: 0.22, rivetSpacing: 1.5, drips: k < 3 ? 0.4 : 0, dripLen: 0.4, hash: H, seed: seed++, rivets: k < 4 });
      pt.end();
    });
    R(foot, { y: -1.7, h: 2.6, rTop: 3.55, rBot: 4.05, n: 4, phase: 0.4, band: 0.45, drips: 0, rivetSpacing: 1.2, su: 6, core: false });
    vent(bc, foot, { pos: [0, -0.4, -3.95], dir: [0, 0.35, -1], r: 0.8, len: 1.6, joint: 'ankle', side: side > 0 ? 'L' : 'R' });
  }

  function buildHand(hand, side) {
    // local frame: origin at the wrist, fingers along -y, back of the hand +z, palm side -z.
    // At the wall slam the hand lies flat: palm on the merlon tops (z -6..4.7), the first phalanx runs
    // to the town edge and the other two hang down the town face clear of it (see HAND).
    ball(bc, hand, 2.7, [0, 0, 0], 16);
    const palm = part(bc, hand, 'palm', { drift: V(0, 0.3, 1) });
    palm.add('dark', finish(new THREE.BoxGeometry(10.4, 10.6, 3.0).translate(0, -5.9, -4.25)));
    // three back-of-hand lames (cylinder about the hand's long axis), each overlapping the next
    const axisM = (zc) => new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, zc, 0, 0, 0, 1);
    [[-0.5, 3.9, 9.45], [-3.9, 3.8, 9.3], [-7.2, 3.9, 9.15]].forEach(([yTop, h, Rr], k) => {
      const s = mapSurf(cylSurf({ rTop: Rr, rBot: Rr, h, t0: -0.56, len: 1.12, y0: yTop - h }), axisM(-2.75 - 9.0));
      forgedPlate(palm, s, { thick: 0.5, bu: 0.12, bv: 0.25, su: 8, sv: 2, band: 0.45, bandRaise: 0.16, rivetR: 0.2, rivetSpacing: 1.4, drips: k === 0 ? 0.5 : 0, dripLen: 0.5, hash: H, seed: seed++ });
    });
    // knuckle plates over each finger root
    const Qk = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(0, 0, 1));
    for (const x of HAND.xs) {
      const s = sphSurf({ R: 1.45, phi0: 0, phiLen: TAU, thLo: 1.0, thHi: 0.0, quat: Qk, centre: V(side * x, HAND.knuckleY + 0.2, -3.25) });
      palm.add('gold', slabGeo(s, { thick: 0.3, su: 12, sv: 2 }));
    }
    palm.end();
    vent(bc, hand, { pos: [side * 2.5, -9, -1.75], dir: [side * 0.25, 0.1, 1], r: 0.7, len: 1.4, joint: 'knuckle', side: side > 0 ? 'L' : 'R' });
    vent(bc, hand, { pos: [-side * 2.5, -9, -1.75], dir: [-side * 0.25, 0.1, 1], r: 0.7, len: 1.4, joint: 'knuckle', side: side > 0 ? 'L2' : 'R2' });

    // fingers: three phalanges each, FK groups so the grip can curl (rotation.x, positive curls toward the palm)
    const fingers = [];
    HAND.xs.forEach((x0, i) => {
      const x = side * x0;
      const lens = [HAND.L1, HAND.L2 * HAND.len[i], HAND.L3 * HAND.len[i]];
      const g1 = new THREE.Group(); g1.position.set(x, HAND.knuckleY, HAND.fingerZ); hand.add(g1);
      const g2 = new THREE.Group(); g2.position.y = -lens[0]; g1.add(g2);
      const g3 = new THREE.Group(); g3.position.y = -lens[1]; g2.add(g3);
      [g1, g2, g3].forEach((g, k) => phalanx(g, lens[k], k, k === 2));
      fingers.push([g1, g2, g3]);
    });
    // thumb on the -side edge, two phalanges
    const t0 = new THREE.Group(); t0.position.set(-side * 5.0, -2.8, HAND.fingerZ); t0.rotation.set(0, 0, -side * 0.62); hand.add(t0);
    ball(bc, t0, 1.35, [0, 0, 0], 10);
    const t1 = new THREE.Group(); t0.add(t1);
    const t2 = new THREE.Group(); t2.position.y = -2.9; t1.add(t2);
    phalanx(t1, 2.9, 0, false, 1.25); phalanx(t2, 2.5, 2, true, 1.15);
    fingers.thumb = [t1, t2];
    return fingers;
  }

  function phalanx(g, L, k, tip, rad = 1.0) {
    // dark core, verdigris shell over the back and sides with a gold band at the far end, a joint ball at the root
    const pt = part(bc, g, 'finger', { drift: V(0, 0.3, 1) });
    pt.add('dark', finish(new THREE.CylinderGeometry(rad, rad * 0.95, L, 8).translate(0, -L / 2, 0)));
    pt.add('dark', finish(new THREE.SphereGeometry(rad * 1.05, 10, 6)));
    const s = cylSurf({ rTop: rad * 1.18, rBot: rad * 1.12, h: L * 0.86, t0: -1.85, len: 3.7, y0: -L * 0.93 });
    pt.add('verd', slabGeo(s, { thick: 0.22, bump: pillow(0.1, 0.12), su: 8, sv: 2 }));
    pt.add('gold', slabGeo(s, { thick: 0.28, bump: () => 0.13, su: 8, sv: 1, v0: -0.01, v1: 0.16 }));
    pt.add('gold', rivetGeo(s.P(0.5, 0.62, 0.12), s.N(0.5, 0.62), 0.2, 5));
    if (tip) {
      pt.add('dark', finish(new THREE.SphereGeometry(rad * 0.95, 10, 5, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI).translate(0, -L, 0)));
      pt.add('gold', finish(new THREE.ConeGeometry(rad * 0.8, 0.9, 8).rotateX(Math.PI).translate(0, -L - 0.6, 0.15)));
    }
    pt.end();
  }

  // remember rest positions for the dissolve drift and give every plate a deterministic seed
  const drifters = [];
  root.traverse((o) => { if (o.isMesh && o.userData.drift) { o.userData.rest = o.position.clone(); o.userData.seed = MAP.hash1(drifters.length * 3.7 + 11); drifters.push(o); } });

  const ik = makeIkTemps();
  const litA = new THREE.Color(SLIT_LIT), darkA = new THREE.Color(SLIT_DARK), litB = new THREE.Color(HALO_LIT), darkB = new THREE.Color(HALO_DARK);
  const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _qp = new THREE.Quaternion();
  const RELAXED = [0.5, 0.7, 0.5];

  const rig = {
    root, pelvis, torso, head, neck: [neck1, neck2, neck3], arms, legs, tassets, slit, halo, meshes: bc.meshes, vents: bc.vents, mats,
    triangles: countTriangles(root),
    /** Apply a pose (see poses.js for the shape). */
    apply(pose) {
      root.position.set(pose.root[0], pose.root[1], pose.root[2]);
      pelvis.position.set(pose.hips.x - pose.root[0], pose.hips.y - pose.root[1], pose.hips.z - pose.root[2]);
      pelvis.rotation.set(0, pose.hipsYaw || 0, 0);
      torso.rotation.set(pose.torso.pitch, pose.torso.yaw, pose.torso.roll, 'YXZ');
      const np = pose.head.pitch / 4, ny = pose.head.yaw / 4, nr = (pose.head.roll || 0) / 4;
      for (const n of [neck1, neck2, neck3, head]) n.rotation.set(np, ny, nr, 'YXZ');
      // finger curls (grip per hand: knuckle, middle, tip)
      for (const key of ['L', 'R']) {
        const gr = (pose.grip && pose.grip[key]) || RELAXED, f = arms[key].fingers;
        for (const fg of f) { fg[0].rotation.x = gr[0]; fg[1].rotation.x = gr[1]; fg[2].rotation.x = gr[2]; }
        f.thumb[0].rotation.x = gr[0] * 0.7; f.thumb[1].rotation.x = gr[0] * 0.9;
      }
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
      // tassets: the front ones ride up on a lifted thigh, the back ones on a thigh swung back; a slow sway on 2s
      pelvis.getWorldQuaternion(_qp).invert();
      const fh = pose.fh || 0;
      for (const t of tassets) {
        const thigh = legs[t.side > 0 ? 'L' : 'R'].thigh;
        thigh.getWorldQuaternion(_q);
        _d.set(0, -1, 0).applyQuaternion(_q).applyQuaternion(_qp);
        const fwd = Math.atan2(_d.z, -_d.y);
        const lift = t.front ? Math.max(0, fwd - 0.18) * 0.92 : Math.max(0, -fwd - 0.05) * 0.9;
        const sway = 0.035 * Math.sin(fh * 0.23 + t.phase) + 0.02 * Math.sin(fh * 0.61 + t.phase * 2);
        t.g.quaternion.setFromAxisAngle(t.axis, (t.front ? -1 : 1) * (lift + sway));
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
    /** World position of a foot centre from an ankle position and foot quaternion. */
    footCentreFromAnkle(ankle, q, out) { return out.copy(G.footCentre).applyQuaternion(q).add(ankle); },
    ankleFromFootCentre(centre, q, out) { return out.copy(G.footCentre).applyQuaternion(q).multiplyScalar(-1).add(centre); },
  };
  return rig;
}
