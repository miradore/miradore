// Gate: arch of voussoirs and spandrel fill, two bronze doors carved with the sun, and the broken state
// (door slabs and stone blocks flying into the town from T.KICK, landing on the ground or on roofs).
import * as THREE from 'three';
import { box, boxRot, cyl, sphere, merge, extrudePoly, pointInPoly } from './common.js';
import { G, planLanding, ballistic, tumble } from './physics.js';

export function buildGate(ctx, M, surfFn) {
  const { MAP, ID, LAYER, tag } = ctx;
  const Gt = MAP.GATE, W = MAP.WALL;
  const group = new THREE.Group(); group.name = 'gate';
  const colliders = [], popAllowed = [], pieces = [];
  const R = Gt.archRadius, hx = Gt.width / 2, yC = Gt.height - R;   // arch centre (0, 20)
  const thick = W.thickness;

  // ---------------------------------------------------------------- arch ring (17 voussoirs) and spandrels
  const nV = 17, rIn = R - 0.05, rOut = R + 1.7, rMid = (rIn + rOut) / 2;
  const vw = (Math.PI * rMid) / nV + 0.18;
  const voussoirs = [];
  for (let i = 0; i < nV; i++) {
    const a = Math.PI * (i + 0.5) / nV;
    const geo = new THREE.BoxGeometry(vw, rOut - rIn, thick + 0.6);
    geo.rotateZ(a - Math.PI / 2);
    const p = new THREE.Vector3(Math.cos(a) * rMid, yC + Math.sin(a) * rMid, 0);
    geo.translate(p.x, p.y, p.z);
    const m = new THREE.Mesh(geo, i % 2 ? M.sandstoneDark : M.sandstone);
    m.name = 'voussoir' + i; tag(m, { inkId: ID.GATE, layer: LAYER.BG }); group.add(m); colliders.push(m);
    voussoirs.push({ mesh: m, i, a, p });
  }
  // door jambs and a frame proud of the wall faces; spandrel fill above the ring
  const sg = [];
  for (const s of [-1, 1]) {
    sg.push(box(1.6, Gt.height - R + 0.5, thick + 0.8, s * (hx + 0.8), (Gt.height - R + 0.5) / 2, 0));
    // stepped fill between the outer ring and the pier corners
    sg.push(box(hx - 8.0, 2.6, thick, s * (8.0 + (hx - 8.0) / 2), 25.2 + 1.3, 0));
    sg.push(box(hx - 5.3, 2.2, thick, s * (5.3 + (hx - 5.3) / 2), 27.8 + 1.1, 0));
  }
  sg.push(box(hx * 2 + 3.2, W.height - 31.0, thick + 0.6, 0, 31.0 + (W.height - 31.0) / 2, 0));
  sg.push(box(hx * 2, 1.5, thick, 0, 29.8 + 0.75, 0));
  // a carved sun disc in the spandrel over the arch (stone), and a cornice
  sg.push(box(hx * 2 + 4, 1.0, thick + 1.4, 0, 34.5, 0));
  const spandrel = new THREE.Mesh(merge(sg), M.sandstone); spandrel.name = 'gateSpandrel'; tag(spandrel, { inkId: ID.GATE, layer: LAYER.BG }); group.add(spandrel); colliders.push(spandrel);
  const relief = new THREE.Mesh(merge([cyl(2.6, 2.6, 0.3, 16, 0, 0, 0).rotateX(Math.PI / 2).translate(0, 40.5, thick / 2 + 0.3)]), M.sandstoneDark);
  relief.name = 'gateRelief'; tag(relief, { inkId: ID.WALL, layer: LAYER.BG }); group.add(relief);

  // ---------------------------------------------------------------- the sun carving pieces (shared by intact and broken doors)
  const sunC = { x: 0, y: 17 }, sunR = 6.0;
  const rayPoly = (ang) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    const P = (r, t) => [sunC.x + c * r - s * t, sunC.y + s * r + c * t];
    return [P(6.5, -0.55), P(9.6, 0), P(6.5, 0.55)];
  };
  const wedgePoly = (a0, a1) => {
    const pts = [[sunC.x, sunC.y]];
    for (let k = 0; k <= 4; k++) { const a = a0 + (a1 - a0) * k / 4; pts.push([sunC.x + Math.cos(a) * sunR, sunC.y + Math.sin(a) * sunR]); }
    return pts;
  };
  const rays = []; for (let k = 0; k < 12; k++) rays.push(15 * Math.PI / 180 + k * Math.PI / 6);
  const wedges = []; for (let k = 0; k < 12; k++) wedges.push([k * Math.PI / 6, (k + 1) * Math.PI / 6]);
  const sunGeoFor = (containsFn, zFace) => {
    const list = [];
    for (const a of rays) { const mid = [sunC.x + Math.cos(a) * 8, sunC.y + Math.sin(a) * 8]; if (containsFn(mid[0], mid[1])) for (const zf of zFace) list.push(extrudePoly(rayPoly(a), 0.22).translate(0, 0, zf)); }
    for (const [a0, a1] of wedges) { const am = (a0 + a1) / 2; const mid = [sunC.x + Math.cos(am) * 3.5, sunC.y + Math.sin(am) * 3.5]; if (containsFn(mid[0], mid[1])) for (const zf of zFace) list.push(extrudePoly(wedgePoly(a0, a1), 0.22).translate(0, 0, zf)); }
    return list;
  };
  const studsFor = (containsFn, zFace) => {
    const list = [];
    for (const sx of [-8.6, -6.2, -1.6, 1.6, 6.2, 8.6]) for (let y = 1.6; y < 27; y += 2.6) {
      if (Math.hypot(sx - sunC.x, y - sunC.y) < sunR + 0.6) continue;
      if (y > yC && Math.hypot(sx, y - yC) > R - 0.8) continue;
      if (!containsFn(sx, y)) continue;
      for (const zf of zFace) list.push(sphere(0.26, sx, y, zf, 7, 5));
    }
    return list;
  };
  const dz = Gt.doorThickness / 2;
  const faces = [dz + 0.11, -dz - 0.11];

  // ---------------------------------------------------------------- intact doors
  const doorOutline = (s) => {
    const pts = [[0, 0], [s * hx, 0], [s * hx, yC]];
    for (let k = 1; k <= 8; k++) { const a = (s > 0 ? 0 : Math.PI) + (s > 0 ? 1 : -1) * (Math.PI / 2) * k / 8; pts.push([Math.cos(a) * (R - 0.2), yC + Math.sin(a) * (R - 0.2)]); }
    return pts;
  };
  const doors = [];
  [1, -1].forEach((s, k) => {
    const outline = doorOutline(s);
    const inside = (x, y) => pointInPoly(x, y, outline);
    const body = merge([extrudePoly(outline, Gt.doorThickness), ...[dz, -dz].flatMap((zf) => [box(0.5, Gt.height - 0.6, 0.12, s * 0.3, (Gt.height - 0.6) / 2, zf > 0 ? zf + 0.06 : zf - 0.06), ...[5, 12, 24].map((y) => box(hx - 0.6, 0.5, 0.12, s * (hx / 2 + 0.1), y, zf > 0 ? zf + 0.06 : zf - 0.06))])]);
    const door = new THREE.Mesh(body, M.bronze); door.name = s > 0 ? 'gateDoorR' : 'gateDoorL';
    tag(door, { inkId: ID.GATE, layer: LAYER.BG });
    const sun = new THREE.Mesh(merge(sunGeoFor(inside, faces)), M.gold); sun.name = (s > 0 ? 'gateSunR' : 'gateSunL'); tag(sun, { inkId: ID.GATE, layer: LAYER.BG }); door.add(sun);
    const studs = new THREE.Mesh(merge(studsFor(inside, faces)), M.bronzeDark); studs.name = (s > 0 ? 'gateStudsR' : 'gateStudsL'); tag(studs, { inkId: ID.GATE, layer: LAYER.BG, castShadow: false }); door.add(studs);
    group.add(door); colliders.push(door); popAllowed.push(door); doors.push(door);
  });

  // ---------------------------------------------------------------- broken door pieces (8 per door, jagged tiling)
  const rng = MAP.mulberry32(9001);
  const jit = (k, amp) => (MAP.hash1(k) - 0.5) * amp;
  const makeDoorPieces = (s) => {
    const cols = [0, 4.6 + jit(s * 3 + 1, 1.4), hx];
    const rows = [0, 6.2 + jit(s * 7 + 2, 1.6), 12.6 + jit(s * 7 + 3, 1.6), yC - 1.3 + jit(s * 7 + 4, 0.8)];
    const node = (i, j) => {
      let x = cols[i], y = rows[j];
      if (i === 1 && j > 0 && j < 3) x += jit(s * 11 + j * 3, 1.6);
      if (j > 0 && j < 3 && i > 0 && i < 2) y += jit(s * 13 + i * 5 + j, 1.2);
      return [s * x, y];
    };
    const midpoint = (a, b, key) => {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const off = jit(key, 1.3);
      // only interior edges are jagged (edges on the outline x=0, x=+-hx, y=0 stay straight)
      const onOutline = (Math.abs(mx) < 0.01 || Math.abs(Math.abs(mx) - hx) < 0.01 || Math.abs(my) < 0.01);
      return onOutline ? [mx, my] : [mx - dy / len * off, my + dx / len * off];
    };
    const polys = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
      const a = node(i, j), b = node(i + 1, j), c = node(i + 1, j + 1), d = node(i, j + 1);
      polys.push([a, midpoint(a, b, s * 100 + i * 10 + j), b, midpoint(b, c, s * 200 + i * 10 + j), c, midpoint(c, d, s * 100 + i * 10 + j + 1), d, midpoint(d, a, s * 200 + (i - 1) * 10 + j)]);
    }
    // two cap pieces including the arc
    const yTop = rows[3];
    const xm = Math.abs(node(1, 3)[0]);
    const arcPts = (fromX, toX) => {
      const pts = [];
      const a0 = Math.acos(Math.min(1, fromX / (R - 0.05))), a1 = Math.acos(Math.min(1, toX / (R - 0.05)));
      for (let k = 0; k <= 6; k++) { const a = a0 + (a1 - a0) * k / 6; pts.push([s * Math.cos(a) * (R - 0.05), yC + Math.sin(a) * (R - 0.05)]); }
      return pts;
    };
    const n0 = node(0, 3), n1 = node(1, 3), n2 = node(2, 3);
    const seamTop = [s * xm, yC + Math.sqrt(Math.max(0, (R - 0.05) ** 2 - xm * xm))];
    polys.push([n1, midpoint(n1, n2, s * 300), n2, [s * hx, yC], ...arcPts(hx - 0.05, xm), midpoint(seamTop, n1, s * 301)]);
    polys.push([n0, midpoint(n0, n1, s * 302), n1, midpoint(n1, seamTop, s * 301), ...arcPts(xm, 0), [0, yTop]]);
    return polys;
  };
  let pieceIdx = 0;
  const addPiece = (geoList, mat, children, name, p0, half, landFlat, kind) => {
    // geoList are in world (gate) coordinates: recentre on p0
    const g = merge(geoList); g.translate(-p0.x, -p0.y, -p0.z);
    const m = new THREE.Mesh(g, mat); m.name = name;
    tag(m, { inkId: ID.DEBRIS_MIN + (pieceIdx % 10), layer: LAYER.FG });
    for (const ch of children) { ch.geometry.translate(-p0.x, -p0.y, -p0.z); tag(ch, { inkId: ID.DEBRIS_MIN + ((pieceIdx + 4) % 10), layer: LAYER.FG, castShadow: false }); m.add(ch); }
    group.add(m); popAllowed.push(m);
    const r = MAP.mulberry32(9100 + pieceIdx);
    const speed = 25 + r() * 35;
    const elev = (-4 + r() * 22) * Math.PI / 180;
    let lat = (r() - 0.5) * 16 * Math.PI / 180 + p0.x * 0.012;
    const v = new THREE.Vector3(Math.sin(lat) * speed, Math.sin(elev) * speed, Math.cos(lat) * Math.cos(elev) * speed);
    // keep the main street clear of landed debris: aim so the landing x is at least 9.5 m off the axis
    {
      let first = planLanding(p0, v, surfFn, half, 142);
      if (Math.abs(first.x) < 9.5) {
        const side = (p0.x !== 0 ? Math.sign(p0.x) : (r() < 0.5 ? -1 : 1));
        const xT = side * (9.5 + r() * 12);
        lat = Math.asin(Math.max(-0.45, Math.min(0.45, (xT - p0.x) / Math.max(1, speed * first.t))));
        v.set(Math.sin(lat) * speed, Math.sin(elev) * speed, Math.cos(lat) * Math.cos(elev) * speed);
        first = planLanding(p0, v, surfFn, half, 142);
      }
      // keep the hero house roof free for the boulder of shot 23
      const H = MAP.HERO_HOUSE;
      for (let k = 0; k < 4 && first.x > H.xMin - 3 && first.x < H.xMax + 3 && first.z > H.zMin - 3 && first.z < H.zMax + 3; k++) {
        lat -= 4 * Math.PI / 180;
        v.set(Math.sin(lat) * speed, Math.sin(elev) * speed, Math.cos(lat) * Math.cos(elev) * speed);
        first = planLanding(p0, v, surfFn, half, 142);
      }
    }
    const yaw = r() * Math.PI * 2;
    const finalQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    if (landFlat === 'z') finalQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));   // local z (thin axis) up
    const plan = planLanding(p0, v, surfFn, half, 142);
    pieces.push({ mesh: m, p0: p0.clone(), v, t: plan.t, land: new THREE.Vector3(plan.x, plan.y, plan.z), finalQ, turns: 1 + Math.floor(r() * 2), delay: Math.floor(r() * 3), kind });
    pieceIdx++;
    return m;
  };
  [1, -1].forEach((s) => {
    const polys = makeDoorPieces(s);
    polys.forEach((poly, k) => {
      let cx = 0, cy = 0; for (const p of poly) { cx += p[0]; cy += p[1]; } cx /= poly.length; cy /= poly.length;
      const inside = (x, y) => pointInPoly(x, y, poly);
      const p0 = new THREE.Vector3(cx, cy, 0);
      const children = [];
      const sunG = sunGeoFor(inside, faces); if (sunG.length) { const sm = new THREE.Mesh(merge(sunG), M.gold); sm.name = 'pieceSun' + pieceIdx; children.push(sm); }
      const stG = studsFor(inside, faces); if (stG.length) { const st = new THREE.Mesh(merge(stG), M.bronzeDark); st.name = 'pieceStuds' + pieceIdx; children.push(st); }
      addPiece([extrudePoly(poly, Gt.doorThickness)], M.bronze, children, 'gatePieceDoor' + (s > 0 ? 'R' : 'L') + k, p0, 0.85, 'z', 'door');
    });
  });
  // stone blocks: the lower 5 voussoirs each side split in three along z, plus jamb stones
  const lowerV = voussoirs.filter((v) => v.i < 5 || v.i >= nV - 5);
  for (const v of lowerV) popAllowed.push(v.mesh);
  for (const v of lowerV) {
    for (let k = 0; k < 3; k++) {
      const zc = -4 + k * 4;
      const geo = new THREE.BoxGeometry(vw - 0.1, rOut - rIn - 0.1, 3.8);
      geo.rotateZ(v.a - Math.PI / 2);
      geo.translate(v.p.x, v.p.y, zc);
      addPiece([geo], k % 2 ? M.sandstoneDark : M.sandstone, [], 'gatePieceStone' + pieceIdx, new THREE.Vector3(v.p.x, v.p.y, zc), 0.85, 'box', 'stone');
    }
  }
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const y = 3 + k * 6, geo = box(1.6, 2.6, 2.2, s * (hx + 0.8), y, 3);
    addPiece([geo], M.sandstone, [], 'gatePieceJamb' + pieceIdx, new THREE.Vector3(s * (hx + 0.8), y, 3), 1.1, 'box', 'stone');
  }
  // ruined door remnants: a buckled hinge-side strip of each door, swung into the town and leaning
  const remnants = [];
  for (const s of [-1, 1]) {
    const poly = [[s * (hx - 0.1), 0], [s * (hx - 2.4), 0], [s * (hx - 1.9), 2.6], [s * (hx - 2.6), 4.4], [s * (hx - 2.0), 6.3], [s * (hx - 2.5), 8.1], [s * (hx - 1.6), 9.4], [s * (hx - 0.1), 9.0]];
    const geo = extrudePoly(poly, Gt.doorThickness);
    geo.translate(-s * hx, 0, 0);                       // hinge axis at the local origin
    const inside = (x, y) => pointInPoly(x, y, poly);
    const m = new THREE.Mesh(geo, M.bronze); m.name = 'gateRemnant' + (s > 0 ? 'R' : 'L');
    tag(m, { inkId: ID.DEBRIS_MIN + 8, layer: LAYER.FG });
    const st = studsFor(inside, faces); if (st.length) { const sm = new THREE.Mesh(merge(st), M.bronzeDark); sm.geometry.translate(-s * hx, 0, 0); sm.name = m.name + 'Studs'; tag(sm, { inkId: ID.DEBRIS_MIN + 8, layer: LAYER.FG, castShadow: false }); m.add(sm); }
    m.position.set(s * hx, 0.05, 0);
    m.rotation.set(0, s * 1.4, -s * 0.12);
    group.add(m); popAllowed.push(m); remnants.push(m);
  }
  // rubble left at the threshold after the kick
  const rubble = new THREE.Mesh(merge([
    box(3, 1.2, 2.5, -7, 0.6, 4), box(2.2, 1.6, 2, 7.5, 0.8, 5), box(1.5, 0.9, 1.5, -5, 0.45, 7), box(1.8, 1.1, 1.3, 5.5, 0.55, 8.5), box(1.2, 0.8, 1.2, -9.5, 0.4, 7.5),
    boxRot(2.4, 1.0, 1.4, 8, 0.5, 2.5, 0, 0.6, 0), boxRot(1.6, 1.4, 1.2, -5, 0.7, 9.5, 0.2, -0.4, 0),
  ]), M.sandstoneDark);
  rubble.name = 'gateRubble'; tag(rubble, { inkId: ID.DEBRIS_MIN + 9, layer: LAYER.FG }); group.add(rubble); popAllowed.push(rubble);

  const _p = new THREE.Vector3(), _q = new THREE.Quaternion();
  function update(frame) {
    const broken = frame >= MAP.T.KICK;
    for (const d of doors) d.visible = !broken;
    for (const v of lowerV) v.mesh.visible = !broken;
    rubble.visible = broken;
    for (const rm of remnants) rm.visible = broken;
    for (const pc of pieces) {
      const m = pc.mesh;
      if (!broken) { m.visible = false; continue; }
      m.visible = true;
      const t = Math.max(0, (frame - MAP.T.KICK - pc.delay) / 24);
      if (t >= pc.t) { m.position.copy(pc.land); m.quaternion.copy(pc.finalQ); continue; }
      ballistic(pc.p0, pc.v, t, _p);
      m.position.copy(_p);
      m.quaternion.copy(tumble(pc.finalQ, pc.turns, t, pc.t, _q));
    }
  }
  update(0);
  return { group, colliders, popAllowed, update };
}
