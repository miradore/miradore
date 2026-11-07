// Square: paving, fountain, two bell towers, north colonnade, market stalls and the domed pavilion at (-18, 55).
import * as THREE from 'three';
import { box, boxRot, cyl, sphere, merge, slab } from './common.js';

export function buildSquare(ctx, M) {
  const { MAP, ID, LAYER, tag } = ctx;
  const S = MAP.SQUARE;
  const group = new THREE.Group(); group.name = 'square';
  const colliders = [], footprints = [], popAllowed = [];
  const gy = MAP.groundY;

  // paving, slightly proud of the ground
  const paving = new THREE.Mesh(slab(S.xMin, S.xMax, S.zMin - 0.5, S.zMax, (x, z) => gy(x, z) + 0.08, (x, z) => gy(x, z) - 0.3, 3, 10), M.paving);
  paving.name = 'squarePaving'; tag(paving, { inkId: ID.CANAL, layer: LAYER.BG }); group.add(paving); colliders.push(paving);

  // fountains: a symmetric pair at x = +-15 (the main street runs through the centre of the square and must stay clear)
  const waterG = [], basinG = [];
  for (const fx of [-15, 15]) {
    const fz = 78, fy = gy(fx, fz) + 0.08;
    basinG.push(
      cyl(3.3, 3.5, 0.9, 18, fx, fy, fz),
      ...Array.from({ length: 16 }, (_, k) => boxRot(1.2, 0.35, 0.5, fx + Math.cos((k / 16) * Math.PI * 2) * 3.05, fy + 1.07, fz + Math.sin((k / 16) * Math.PI * 2) * 3.05, 0, -(k / 16) * Math.PI * 2, 0)),
      cyl(0.5, 0.65, 2.0, 10, fx, fy + 0.9, fz),
      cyl(1.3, 0.95, 0.4, 14, fx, fy + 2.9, fz),
      cyl(0.16, 0.22, 0.8, 8, fx, fy + 3.3, fz),
      sphere(0.3, fx, fy + 4.25, fz, 10, 8),
    );
    waterG.push(cyl(2.85, 2.85, 0.1, 18, fx, fy + 0.9, fz), cyl(1.1, 1.1, 0.08, 14, fx, fy + 3.3, fz));
    footprints.push({ x0: fx - 3.5, x1: fx + 3.5, z0: fz - 3.5, z1: fz + 3.5, top: fy + 1.2 });
  }
  const basin = new THREE.Mesh(merge(basinG), M.stone);
  basin.name = 'fountains'; tag(basin, { inkId: ID.CANAL, layer: LAYER.BG }); group.add(basin); colliders.push(basin);
  const water = new THREE.Mesh(merge(waterG), M.water);
  water.name = 'fountainWater'; tag(water, { inkId: ID.WATER, layer: LAYER.BG, castShadow: false }); group.add(water);

  // bell towers
  MAP.BELL_TOWERS.forEach((bt, k) => {
    const by = gy(bt.x, bt.z) - 0.1, w = 5.2;
    const shaftH = bt.h - 6;
    const sg = [
      box(w, shaftH, w, bt.x, by + shaftH / 2, bt.z),
      box(w + 0.8, 0.5, w + 0.8, bt.x, by + 0.25, bt.z),                   // plinth
      box(w + 0.5, 0.35, w + 0.5, bt.x, by + shaftH + 0.17, bt.z),         // string course
    ];
    // belfry: four corner posts, arches and a cap slab
    const pb = by + shaftH + 0.35, postH = 4.6;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) sg.push(box(0.9, postH, 0.9, bt.x + sx * (w / 2 - 0.45), pb + postH / 2, bt.z + sz * (w / 2 - 0.45)));
    const rad = (w - 1.8) / 2;
    for (let face = 0; face < 4; face++) {
      const ang = face * Math.PI / 2;
      for (let a = 0; a < 5; a++) {
        const th = Math.PI * (a + 0.5) / 5;
        // local frame: arch in the xy plane at the face offset along +z, then rotated about the tower axis
        const g = new THREE.BoxGeometry(1.45, 0.45, 0.9);
        g.rotateZ(th + Math.PI / 2);
        g.translate(Math.cos(th) * (rad + 0.2), postH - rad - 0.3 + Math.sin(th) * (rad + 0.2), w / 2 - 0.45);
        g.rotateY(ang);
        g.translate(bt.x, pb, bt.z);
        sg.push(g);
      }
    }
    sg.push(box(w + 0.6, 0.6, w + 0.6, bt.x, pb + postH + 0.3, bt.z));
    // small drum and turquoise dome
    sg.push(cyl(1.9, 1.9, 0.9, 14, bt.x, pb + postH + 0.6, bt.z));
    const tower = new THREE.Mesh(merge(sg), M.stucco[0]);
    tower.name = 'bellTower' + k; tag(tower, { inkId: ID.BG_MIN + 20 + k, layer: LAYER.BG }); group.add(tower); colliders.push(tower);
    const dome = new THREE.Mesh(merge([sphere(1.9, bt.x, pb + postH + 1.5, bt.z, 16, 10, true), sphere(0.25, bt.x, pb + postH + 3.75, bt.z, 8, 6), cyl(0.06, 0.06, 0.5, 6, bt.x, pb + postH + 3.3, bt.z)]), M.dome);
    dome.name = 'bellTowerDome' + k; tag(dome, { inkId: ID.BG_MIN + 36, layer: LAYER.BG }); group.add(dome);
    // the bronze bell hanging in the belfry
    const bellY = pb + 1.4;
    const bell = new THREE.Mesh(merge([
      cyl(0.55, 1.05, 1.5, 12, bt.x, bellY, bt.z), sphere(0.6, bt.x, bellY + 1.5, bt.z, 10, 7),
      cyl(0.08, 0.08, 1.2, 6, bt.x, bellY + 1.9, bt.z), sphere(0.22, bt.x, bellY - 0.1, bt.z, 8, 6),
      box(2.6, 0.25, 0.25, bt.x, bellY + 3.1, bt.z),
    ]), M.bronze);
    bell.name = 'bell' + k; tag(bell, { inkId: ID.BELL, layer: LAYER.BG }); group.add(bell);
    // belfry openings read as dark recesses from far away: dark panels behind the posts, set back
    const dark = new THREE.Mesh(merge([box(w - 1.9, postH - 0.6, 0.1, bt.x, pb + postH / 2 - 0.1, bt.z), box(0.1, postH - 0.6, w - 1.9, bt.x, pb + postH / 2 - 0.1, bt.z)]), M.recess);
    dark.name = 'belfryDark' + k; tag(dark, { inkId: ID.BG_MIN + 38, layer: LAYER.BG, castShadow: false }); group.add(dark);
    footprints.push({ x0: bt.x - w / 2, x1: bt.x + w / 2, z0: bt.z - w / 2, z1: bt.z + w / 2, top: by + bt.h + 4 });
  });

  // colonnade along the north side of the square (z about 60..63.6), both sides of the main street
  const cg = [], arcG = [];
  for (const [xa, xb] of [[-29, -7.5], [7.5, 29]]) {
    const n = 6, step = (xb - xa) / (n - 1);
    const zc = 61.8;
    const baseY = Math.min(gy(xa, zc), gy(xb, zc)) + 0.05;
    const colH = 3.8;
    for (let k = 0; k < n; k++) {
      const x = xa + k * step;
      cg.push(cyl(0.42, 0.48, colH, 10, x, baseY, zc), box(1.15, 0.3, 1.15, x, baseY + colH + 0.15, zc), box(1.1, 0.25, 1.1, x, baseY + 0.12, zc));
      if (k < n - 1) {
        const xm = x + step / 2, rad = step / 2 - 0.3;
        for (let a = 0; a < 5; a++) {
          const th = Math.PI * (a + 0.5) / 5;
          arcG.push(boxRot(rad * 0.72, 0.5, 1.0, xm + Math.cos(th) * (rad + 0.2), baseY + colH + 0.3 + Math.sin(th) * (rad + 0.2), zc, 0, 0, th + Math.PI / 2));
        }
      }
    }
    const entY = baseY + colH + 0.3 + step / 2 + 0.1;
    cg.push(box(xb - xa + 1.4, 1.0, 3.6, (xa + xb) / 2, entY + 0.5, zc), box(xb - xa + 1.4, 0.5, 0.35, (xa + xb) / 2, entY + 1.25, zc - 1.62), box(xb - xa + 1.4, 0.5, 0.35, (xa + xb) / 2, entY + 1.25, zc + 1.62));
    footprints.push({ x0: xa - 0.7, x1: xb + 0.7, z0: zc - 1.8, z1: zc + 1.8, top: entY + 1.0 });
  }
  const colonnade = new THREE.Mesh(merge([...cg, ...arcG]), M.stucco[3]);
  colonnade.name = 'colonnade'; tag(colonnade, { inkId: ID.BG_MIN + 24, layer: LAYER.BG }); group.add(colonnade); colliders.push(colonnade);

  // market stalls with striped awnings
  const stallG = [], goodsG = [[], [], [], []], awnG = [[], [], []], whiteG = [];
  const rng = MAP.mulberry32(777);
  const stalls = [[-14, 66], [-25, 67], [14, 66], [25, 67], [-15, 89], [-25, 88], [15, 89], [25, 88], [-27, 77], [27, 78]];
  stalls.forEach(([sx, sz], k) => {
    const y = gy(sx, sz) + 0.08;
    const rot = (rng() - 0.5) * 0.6 + (k >= 8 ? Math.PI / 2 : 0);
    const L = (dx, dz) => [sx + Math.cos(rot) * dx - Math.sin(rot) * dz, sz + Math.sin(rot) * dx + Math.cos(rot) * dz];
    for (const [dx, dz] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) { const p = L(dx, dz); stallG.push(box(0.14, 2.5, 0.14, p[0], y + 1.25, p[1])); }
    stallG.push(boxRot(2.6, 0.1, 1.5, sx, y + 0.95, sz, 0, -rot, 0), boxRot(2.4, 0.85, 1.3, sx, y + 0.48, sz, 0, -rot, 0));
    const ci = k % 3;
    awnG[ci].push(boxRot(3.0, 0.08, 1.15, sx, y + 2.65, sz, 0, -rot, 0));
    for (let s = 0; s < 4; s++) {
      const p = L(-1.2 + s * 0.8, 0);
      whiteG.push(boxRot(0.36, 0.05, 1.15, p[0], y + 2.71, p[1], 0, -rot, 0));
    }
    const nGoods = 5 + Math.floor(rng() * 4);
    for (let g = 0; g < nGoods; g++) { const p = L((rng() - 0.5) * 2.0, (rng() - 0.5) * 1.0); goodsG[Math.floor(rng() * 4)].push(sphere(0.2 + rng() * 0.12, p[0], y + 1.2, p[1], 8, 6)); }
    footprints.push({ x0: sx - 1.6, x1: sx + 1.6, z0: sz - 1.2, z1: sz + 1.2, top: y + 2.7 });
  });
  const stallMesh = new THREE.Mesh(merge(stallG), M.wood); stallMesh.name = 'marketStalls'; tag(stallMesh, { inkId: ID.BG_MIN + 30, layer: LAYER.BG }); group.add(stallMesh); colliders.push(stallMesh);
  awnG.forEach((g, k) => { const m = merge(g); if (!m) return; const mm = new THREE.Mesh(m, M.awning[k]); mm.name = 'stallAwning' + k; tag(mm, { inkId: ID.AWNING, layer: LAYER.BG }); group.add(mm); });
  { const mm = new THREE.Mesh(merge(whiteG), M.white); mm.name = 'stallStripes'; tag(mm, { inkId: ID.AWNING, layer: LAYER.BG, castShadow: false }); group.add(mm); }
  [M.pot, M.wheat, M.leaf, M.bougainvillea].forEach((mat, k) => { const m = merge(goodsG[k]); if (!m) return; const mm = new THREE.Mesh(m, mat); mm.name = 'goods' + k; tag(mm, { inkId: ID.PLANT, layer: LAYER.BG, castShadow: false }); group.add(mm); });

  // domed pavilion at (-18, 55): the dome FX shatters at T.DOME_SHATTER (hidden from frame 1236)
  const px = -18, pz = 55, py = gy(px, pz);
  const pav = new THREE.Mesh(merge([
    box(5.0, 0.4, 5.0, px, py + 0.2, pz),
    ...[[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]].map(([dx, dz]) => cyl(0.34, 0.4, 3.8, 10, px + dx, py + 0.4, pz + dz)),
    box(4.6, 0.7, 4.6, px, py + 4.55, pz),
    cyl(2.1, 2.1, 0.9, 14, px, py + 4.9, pz),
  ]), M.stucco[0]);
  pav.name = 'pavilion'; tag(pav, { inkId: ID.BG_MIN + 26, layer: LAYER.BG }); group.add(pav); colliders.push(pav);
  const pavDome = new THREE.Mesh(merge([sphere(2.1, px, py + 5.8, pz, 16, 10, true), sphere(0.26, px, py + 8.2, pz, 8, 6), cyl(0.06, 0.06, 0.4, 6, px, py + 7.85, pz)]), M.dome);
  pavDome.name = 'pavilionDome'; tag(pavDome, { inkId: ID.BG_MIN + 36, layer: LAYER.BG }); group.add(pavDome); popAllowed.push(pavDome);
  footprints.push({ x0: px - 2.5, x1: px + 2.5, z0: pz - 2.5, z1: pz + 2.5, top: py + 5.3 });

  function update(frame) {
    pavDome.visible = frame < MAP.T.DOME_SHATTER;
    // fountain ripple: a tiny breathing of the water discs on 2s
    const h = MAP.hold(frame, 2);
    const s = 1 + Math.sin(h * 0.35) * 0.006;
    water.scale.set(s, 1, s);
    water.position.y = Math.sin(h * 0.5) * 0.012;
  }

  return { group, colliders, footprints, popAllowed, update };
}
