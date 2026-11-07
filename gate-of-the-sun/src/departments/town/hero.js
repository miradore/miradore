// Hero house (shot 23): the +x facade is built from separate slabs that peel off and fall into the
// street between T.FACADE_START and T.FACADE_END. Interior floors, walls and furniture are separate meshes.
import * as THREE from 'three';
import { box, cyl, sphere, merge } from './common.js';
import { G, landTime } from './physics.js';

export function buildHero(ctx, M) {
  const { MAP, ID, LAYER, tag } = ctx;
  const H = MAP.HERO_HOUSE;
  const group = new THREE.Group(); group.name = 'heroHouse';
  const colliders = [], popAllowed = [];
  const fh = H.floorHeight, floors = H.floors;
  const base = MAP.groundY(H.xMax, H.zMin) - 0.05;
  const top = base + floors * fh;
  const cz = (H.zMin + H.zMax) / 2, cx = (H.xMin + H.xMax) / 2;
  const T = 0.4;                                    // wall thickness
  const idBG = ID.BG_MIN + 12;

  const add = (geo, mat, name, inkId, layer = LAYER.BG) => {
    const m = new THREE.Mesh(geo, mat); m.name = name; tag(m, { inkId, layer }); group.add(m); return m;
  };

  // back wall (-x), side walls, interior floors, roof slab, stub parapets (the +x parapet is in blocks)
  colliders.push(add(box(T, floors * fh, H.zMax - H.zMin, H.xMin + T / 2, base + floors * fh / 2, cz), M.interior, 'heroBackWall', idBG));
  colliders.push(add(box(H.xMax - H.xMin - T, floors * fh, T, cx + T / 2, base + floors * fh / 2, H.zMin + T / 2), M.stucco[0], 'heroSideWallS', idBG + 1));
  colliders.push(add(box(H.xMax - H.xMin - T, floors * fh, T, cx + T / 2, base + floors * fh / 2, H.zMax - T / 2), M.stucco[0], 'heroSideWallN', idBG + 1));
  for (let f = 0; f <= floors; f++) {
    const y = base + f * fh;
    const slabGeo = box(H.xMax - H.xMin - T, 0.3, H.zMax - H.zMin - 2 * T, cx + T / 2, y + (f === 0 ? 0.15 : -0.15), cz);
    colliders.push(add(slabGeo, f === floors ? M.stucco[2] : M.wood, f === floors ? 'heroRoof' : 'heroFloor' + f, f === floors ? idBG + 2 : idBG + 3));
  }
  // roof furniture: parapets on three sides, a small hut, a chimney
  const pw = 0.35, ph = 0.9;
  colliders.push(add(merge([
    box(pw, ph, H.zMax - H.zMin, H.xMin + pw / 2, top + ph / 2, cz),
    box(H.xMax - H.xMin, ph, pw, cx, top + ph / 2, H.zMin + pw / 2),
    box(H.xMax - H.xMin, ph, pw, cx, top + ph / 2, H.zMax - pw / 2),
    box(2.8, 2.4, 2.6, H.xMin + 2.0, top + 1.2, H.zMin + 2.2),
    box(3.1, 0.25, 2.9, H.xMin + 2.0, top + 2.5, H.zMin + 2.2),
    box(0.7, 1.4, 0.7, H.xMin + 1.0, top + 0.7, H.zMax - 1.2), box(1.0, 0.2, 1.0, H.xMin + 1.0, top + 1.45, H.zMax - 1.2),
  ]), M.stucco[2], 'heroRoofFurniture', idBG + 2));
  // windows on the back and side walls (dark recesses, cobalt shutters)
  const rec = [], cob = [];
  for (let f = 0; f < floors; f++) {
    const y = base + f * fh + 2.0;
    for (const z of [H.zMin + 3, H.zMin + 6, H.zMin + 9]) { rec.push(box(0.2, 1.5, 1.0, H.xMin - 0.03 + 0.1, y, z)); cob.push(box(0.1, 1.5, 0.45, H.xMin - 0.08 + 0.05, y, z - 0.74), box(0.1, 1.5, 0.45, H.xMin - 0.08 + 0.05, y, z + 0.74)); }
    for (const x of [H.xMin + 3, H.xMin + 7]) { rec.push(box(1.0, 1.5, 0.2, x, y, H.zMin - 0.03 + 0.1)); rec.push(box(1.0, 1.5, 0.2, x, y, H.zMax + 0.03 - 0.1)); }
  }
  add(merge(rec), M.recess, 'heroRecesses', ID.BG_MIN + 38);
  add(merge(cob), M.cobalt, 'heroShutters', ID.BG_MIN + 37);

  // furniture silhouettes: table and chairs on the ground floor, bed on the first, hanging lamp on the second
  const furn = [];
  const fx = cx + 1.0;
  furn.push(box(2.0, 0.1, 1.1, fx, base + 0.3 + 0.78, cz), ...[[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]].map(([dx, dz]) => box(0.1, 0.78, 0.1, fx + dx, base + 0.3 + 0.39, cz + dz)));
  furn.push(box(0.5, 0.5, 0.5, fx - 1.6, base + 0.3 + 0.25, cz), box(0.5, 0.9, 0.08, fx - 1.85, base + 0.3 + 0.45, cz));
  furn.push(box(0.5, 0.5, 0.5, fx + 1.6, base + 0.3 + 0.25, cz), box(0.5, 0.9, 0.08, fx + 1.85, base + 0.3 + 0.45, cz));
  add(merge(furn), M.wood, 'heroFurnitureWood', idBG + 4);
  const bedY = base + fh;
  add(merge([box(2.2, 0.5, 1.6, cx - 2.5, bedY + 0.25, cz + 2.5), box(0.12, 1.2, 1.6, cx - 3.6, bedY + 0.6, cz + 2.5)]), M.wood, 'heroBedFrame', idBG + 4);
  add(merge([box(2.0, 0.3, 1.5, cx - 2.5, bedY + 0.65, cz + 2.5), box(0.6, 0.18, 1.0, cx - 3.2, bedY + 0.9, cz + 2.5)]), M.white, 'heroBedding', idBG + 5);
  add(merge([box(1.2, 0.1, 1.2, cx + 1, bedY + 0.05, cz - 2.5)]), M.awning[0], 'heroRug', idBG + 5);
  const lampY = base + 3 * fh - 0.15;
  add(merge([cyl(0.03, 0.03, 1.2, 6, cx, lampY - 1.2, cz), cyl(0.5, 0.25, 0.45, 10, cx, lampY - 1.65, cz), sphere(0.2, cx, lampY - 1.75, cz, 8, 6)]), M.bronzeDark, 'heroLamp', idBG + 6);

  // ---------------------------------------------------------------- the falling facade: 3 floors x 3 bays
  const bays = [[H.zMin, H.zMin + 4], [H.zMin + 4, H.zMin + 8], [H.zMin + 8, H.zMax]];
  const slabs = [];
  const streetX = H.xMax;
  // order: top floor first (long fall), then middle, then ground
  let order = 0;
  for (let f = floors - 1; f >= 0; f--) {
    for (let b = 0; b < 3; b++) {
      const [z0, z1] = bays[b];
      const zc = (z0 + z1) / 2, w = z1 - z0, y0 = base + f * fh;
      const slabG = [box(T, fh, w, 0, fh / 2, 0)];          // local: pivot at the bottom outer edge, slab extends -x
      slabG[0].translate(-T / 2, 0, 0);
      const cobG = [], recG = [];
      // window (or door on the ground floor middle bay) and shutters, on the +x face
      if (f === 0 && b === 1) { cobG.push(box(0.15, 2.4, 1.25, 0.08 - 0.075, 1.2, 0)); slabG.push(box(0.35, 0.25, 1.7, 0.1, 2.55, 0)); }
      else { recG.push(box(0.2, 1.55, 1.0, 0.03 - 0.1, 2.05, 0)); cobG.push(box(0.1, 1.55, 0.45, 0.09 - 0.05, 2.05, -0.74), box(0.1, 1.55, 0.45, 0.09 - 0.05, 2.05, 0.74)); }
      if (f === 0 && b === 1) slabG.push(box(0.7, 0.16, 1.9, 0.35, 0.08, 0));
      const slab = new THREE.Mesh(merge(slabG), M.stucco[0]);
      const idx = order++;
      slab.name = 'heroFacade' + idx;
      tag(slab, { inkId: ID.DEBRIS_MIN + (idx % 10), layer: LAYER.FG });
      const cobM = new THREE.Mesh(merge(cobG), M.cobalt); cobM.name = 'heroFacadeShutter' + idx; tag(cobM, { inkId: ID.DEBRIS_MIN + ((idx + 3) % 10), layer: LAYER.FG }); slab.add(cobM);
      if (recG.length) { const recM = new THREE.Mesh(merge(recG), M.recess); recM.name = 'heroFacadeRecess' + idx; tag(recM, { inkId: ID.DEBRIS_MIN + ((idx + 5) % 10), layer: LAYER.FG, castShadow: false }); slab.add(recM); }
      slab.position.set(streetX, y0, zc);
      group.add(slab); colliders.push(slab); popAllowed.push(slab);
      // deterministic fall plan
      const r = MAP.mulberry32(5000 + idx);
      const tStart = MAP.T.FACADE_START + idx * 2;
      const hingeFrames = 6 + Math.floor(r() * 4);
      const hingeAngle = 0.35 + r() * 0.25;              // radians rotated outward (about +z axis, top toward +x) at release
      // release: the slab centre at hinge angle, then flies with the velocity of the hinge motion plus a push
      const hc = { x: streetX + Math.sin(hingeAngle) * fh / 2, y: y0 + Math.cos(hingeAngle) * fh / 2, z: zc };
      const omega = hingeAngle / (hingeFrames / 24);
      const v = { x: omega * (fh / 2) * Math.cos(hingeAngle) + 1.5 + r() * 2.0, y: -omega * (fh / 2) * Math.sin(hingeAngle) + 0.5, z: (r() - 0.5) * 0.6 };
      // land lying flat on the street: the slab's thin axis (x) becomes vertical. Final centre height = T/2 (+ shutters)
      const landY = MAP.groundY(hc.x + v.x * 1.2, zc) + T / 2 + 0.1 + (f === 0 && b === 1 ? 0.2 : 0);
      const tFlight = landTime(hc.y, v.y, landY);
      const landX = Math.min(5.0, hc.x + v.x * tFlight);
      slabs.push({ mesh: slab, idx, f, b, y0, zc, tStart, hingeFrames, hingeAngle, hc, v, tFlight, landX, landY, spin: (0.5 + r() * 0.5) });
    }
  }
  // +x parapet in blocks that drop when the boulder hits the roof at FACADE_START
  const parapet = [];
  for (let k = 0; k < 7; k++) {
    const z = H.zMin + 0.85 + k * 1.72;
    const blk = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 1.6), M.stucco[2]);
    blk.name = 'heroParapet' + k; tag(blk, { inkId: ID.DEBRIS_MIN + ((k + 7) % 10), layer: LAYER.FG });
    const p0 = new THREE.Vector3(H.xMax - pw / 2, top + ph / 2, z);
    blk.position.copy(p0); group.add(blk); popAllowed.push(blk);
    const r = MAP.mulberry32(6000 + k);
    const v = new THREE.Vector3(1.0 + r() * 3.5, 1.0 + r() * 1.5, (r() - 0.5) * 1.5);
    const landY = MAP.groundY(0, z) + pw / 2 + 0.02;
    const t = landTime(p0.y, v.y, landY);
    const land = new THREE.Vector3(p0.x + v.x * t, landY, p0.z + v.z * t);
    const axis = new THREE.Vector3(r() - 0.5, r() - 0.5, 1).normalize();
    parapet.push({ mesh: blk, p0, v, t, land, axis, rate: 4 + r() * 6, tStart: MAP.T.FACADE_START + Math.floor(r() * 3), yaw: r() * 6.283 });
  }

  const _ax = new THREE.Vector3(0, 0, 1), _up = new THREE.Vector3(0, 1, 0);
  function update(frame) {
    for (const s of slabs) {
      const m = s.mesh;
      if (frame < s.tStart) { m.position.set(streetX, s.y0, s.zc); m.quaternion.identity(); continue; }
      const fr = frame - s.tStart;
      if (fr <= s.hingeFrames) {
        const a = s.hingeAngle * MAP.easeIn(fr / s.hingeFrames);
        m.position.set(streetX, s.y0, s.zc);
        m.quaternion.setFromAxisAngle(_ax, -a);          // rotate top toward +x
        continue;
      }
      const t = Math.min(s.tFlight, (fr - s.hingeFrames) / 24);
      const u = t / s.tFlight;
      // centre of the slab in flight; the slab mesh pivot is at its bottom edge, so offset by the rotated half height
      const ang = -(s.hingeAngle + (Math.PI / 2 - s.hingeAngle + Math.PI * 2 * Math.round(s.spin)) * u);
      const finalAng = -Math.PI / 2;
      const useAng = u >= 1 ? finalAng : ang;
      m.quaternion.setFromAxisAngle(_ax, useAng);
      const cxp = u >= 1 ? s.landX : s.hc.x + s.v.x * t;
      const cyp = u >= 1 ? s.landY : s.hc.y + s.v.y * t - 0.5 * G * t * t;
      const czp = s.zc + s.v.z * t;
      // pivot = centre - R * (0, fh/2, 0)
      const sa = Math.sin(useAng), ca = Math.cos(useAng);
      m.position.set(cxp + sa * fh / 2, cyp - ca * fh / 2, czp);
    }
    for (const p of parapet) {
      const m = p.mesh;
      if (frame < p.tStart) { m.position.copy(p.p0); m.quaternion.identity(); continue; }
      const t = Math.min(p.t, (frame - p.tStart) / 24);
      if (t >= p.t) { m.position.copy(p.land); m.quaternion.setFromAxisAngle(_up, p.yaw); continue; }
      m.position.set(p.p0.x + p.v.x * t, p.p0.y + p.v.y * t - 0.5 * G * t * t, p.p0.z + p.v.z * t);
      m.quaternion.setFromAxisAngle(p.axis, p.rate * t);
    }
  }
  update(0);
  return { group, colliders, popAllowed, update, footprint: { x0: H.xMin, x1: H.xMax, z0: H.zMin, z1: H.zMax, top } };
}
