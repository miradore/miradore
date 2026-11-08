// Flat light effects (no ink): the bolt, its afterglow, the dome of light with its rings, the
// lifted debris flecks, the shock wave torus with its street puffs and wind streaks, and the kick star.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import { makeBillows, dustStyle, torusFor } from './billow.js';
import { Debris, assignFlights } from './debris.js';

const { T, ID } = MAP;
const UP = new THREE.Vector3(0, 1, 0);

function flatMesh(ctx, geo, color, { opacity = 1, side = THREE.FrontSide, name, inkId = ID.GLOW } = {}) {
  const m = new THREE.Mesh(geo, ctx.makeFlat({ color, side, opacity }));
  m.name = name;
  ctx.tag(m, { inkId, layer: ctx.LAYER.FG, castShadow: false, receiveShadow: false });
  m.visible = false;
  return m;
}

/** A jagged bolt from (x0, 600, z) down to (0, 0, z): chain of thin boxes with kinks, three forks and three thin secondary forks. */
function buildBolt(ctx, seed, color, widthMul, z, name, { opacity = 1, inkId = ID.BOLT } = {}) {
  const g = new THREE.Group(); g.name = name;
  const mat = ctx.makeFlat({ color, opacity });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const rng = MAP.mulberry32(seed);
  // kinks are dense in the band the shot 6 camera sees above the wall (y 80..160) and alternate sides
  const ys = [600, 470, 360, 280, 225, 190, 165, 143, 124, 106, 90, 74, 58, 40, 22, 0];
  let side = rng() < 0.5 ? -1 : 1;
  const pts = ys.map((y, i) => {
    const down = 1 - y / 600;
    const amp = 5 + 12 * Math.pow(down, 0.6);
    side = -side;
    const x = (i === ys.length - 1) ? 0 : side * amp * (0.5 + rng() * 0.8);
    return new THREE.Vector3(x, y, z + (rng() - 0.5) * 3);
  });
  const seg = (a, b, w) => {
    const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length();
    const m = new THREE.Mesh(box, mat); m.name = name + '_seg';
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    m.scale.set(w, len + w * 0.6, w * 0.45);
    g.add(m);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const w = MAP.lerp(3, 8, Math.pow(1 - pts[i].y / 600, 1.5)) * widthMul;
    seg(pts[i], pts[i + 1], w);
  }
  // forks: short branches leaving kinks in the visible range
  for (let k = 0; k < 3; k++) {
    const i = 5 + k * 2;
    const a = pts[i];
    const fs = rng() < 0.5 ? -1 : 1;
    const b = a.clone().add(new THREE.Vector3(fs * (12 + rng() * 14), -(14 + rng() * 16), 0));
    const c = b.clone().add(new THREE.Vector3(fs * (6 + rng() * 10), -(10 + rng() * 14), 0));
    const w = MAP.lerp(3, 8, Math.pow(1 - a.y / 600, 1.5)) * widthMul * 0.45;
    seg(a, b, w); seg(b, c, w * 0.7);
  }
  // thin secondary forks: long jagged hairlines leaving the upper kinks, each with a short twig.
  // They use their own generator so the main channel and the first forks keep their exact shapes.
  const rng2 = MAP.mulberry32(seed + 4049);
  [3, 6, 9].forEach((i, k) => {
    let a = pts[i].clone();
    const fs = (k % 2 === 0 ? 1 : -1) * (pts[i].x >= 0 ? 1 : -1);
    const w0 = MAP.lerp(3, 8, Math.pow(1 - a.y / 600, 1.5)) * widthMul * 0.2;
    const n = 4 + Math.floor(rng2() * 2);
    for (let j = 0; j < n; j++) {
      const b = a.clone().add(new THREE.Vector3(fs * (7 + rng2() * 11) * (j % 2 ? 0.45 : 1), -(9 + rng2() * 13), 0));
      const w = w0 * (1 - j / (n + 1));
      seg(a, b, w);
      if (j === 1) {
        const c = b.clone().add(new THREE.Vector3(-fs * (5 + rng2() * 6), -(8 + rng2() * 8), 0));
        seg(b, c, w * 0.6);
      }
      a = b;
    }
  });
  ctx.tag(g, { inkId, layer: ctx.LAYER.FG, castShadow: false, receiveShadow: false });
  return g;
}

export function makeLight(ctx, reg) {
  const { LAYER } = ctx;
  // ---- bolt: two variants, each with a wide cyan back bolt and a pale core
  const bolts = [0, 1].map((v) => {
    const grp = new THREE.Group(); grp.name = 'bolt_v' + v;
    // soft outer glow band: a much wider flat copy of the same path at lower (dithered) opacity, no ink
    grp.add(buildBolt(ctx, 900 + v * 17, 0x8FF0FF, 5.2, -66, 'boltGlow' + v, { opacity: 0.4, inkId: ID.GLOW }));
    grp.add(buildBolt(ctx, 900 + v * 17, 0x4FE0FF, 2.1, -63, 'boltBack' + v));
    grp.add(buildBolt(ctx, 900 + v * 17, 0xBFFFFF, 1.0, -60, 'boltCore' + v));
    grp.visible = false; reg.add(grp); return grp;
  });
  // ---- afterglow disc behind the wall (vertical, facing the town)
  const glow = flatMesh(ctx, new THREE.CircleGeometry(1, 64), 0xDFFBFF, { side: THREE.DoubleSide, name: 'afterglow' });
  glow.position.set(0, 15, -64); reg.add(glow);
  // ---- dome of light: hemisphere squashed in z so it stays behind the wall, three rings in the XY plane
  const dome = flatMesh(ctx, new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), 0xCFF6FF, { side: THREE.DoubleSide, name: 'domeLight', inkId: ID.DOME });
  dome.position.set(0, 0, -60); reg.add(dome);
  const rings = [0, 1, 2].map((k) => {
    const r = flatMesh(ctx, torusFor(100, 1.6), 0xFFFFFF, { name: 'domeRing' + k, inkId: ID.DOME, side: THREE.DoubleSide });
    r.position.set(0, 0, -58 - k * 0.5); reg.add(r); return r;
  });
  // ---- lifted debris flecks
  const flecks = new Debris(ctx, reg, { seed: 41, count: 60, kind: 'chip', size: [1.6, 3.4], color: 0x3A2A22, shade: 0x1E1410, inkId: ID.DEBRIS_MIN + 2, name: 'domeFleck', g: 4.5 });
  assignFlights(flecks, 42, (i, rng) => {
    const th = rng() * Math.PI * 2, rr = 10 + rng() * 55;
    const x0 = Math.cos(th) * rr, z0 = -60 + Math.sin(th) * rr * 0.6;
    // "landing" is the apex region far above: a slow lift that keeps climbing until the dome fades
    const f0 = T.DOME_START + Math.floor(rng() * 10), f1 = T.DOME_END + 40;
    return { f0, f1, p0: [x0, 2, z0], p1: [x0 * 1.8, 150 + rng() * 90, z0 - 20 + rng() * 10], g: 4.5 };
  }, 0);
  // ---- shock wave torus and street puffs
  const shock = flatMesh(ctx, torusFor(100, 3), 0xFFFFFF, { opacity: 0.5, name: 'shockRing', inkId: ID.SHOCK, side: THREE.DoubleSide });
  shock.position.set(0, 8, -30); shock.rotation.x = Math.PI / 2; reg.add(shock);
  const puffs = makeBillows(ctx, reg, 30, { seed: 51, count: 8, style: dustStyle(ctx), name: 'shockPuff' });
  const puffData = puffs.map((b, k) => {
    const zk = 10 + k * 5.2 + MAP.hash1(k + 300) * 3;
    const lane = MAP.hash1(k + 310);
    const xk = lane < 0.4 ? (MAP.hash1(k + 320) - 0.5) * 10 : (lane < 0.7 ? -22 + MAP.hash1(k + 330) * 12 : 10 + MAP.hash1(k + 340) * 12);
    return { x: xk, z: zk, birth: MAP.hold(Math.round(T.SHOCK_START + (zk + 30) / 3.5), 2), r: 3 + MAP.hash1(k + 350) * 2 };
  });
  // ---- wind streaks in the kids' area (shot 9)
  const streakGeo = new THREE.BoxGeometry(0.03, 0.02, 0.45);
  const streakMatA = ctx.makeCel({ color: 0xD9B26A, shade: 0xA8803D });
  const streakMatB = ctx.makeCel({ color: 0x8FB85A, shade: 0x55803A });
  const streaks = new THREE.Group(); streaks.name = 'streaks';
  const streakInfo = [];
  for (let i = 0; i < 80; i++) {
    const m = new THREE.Mesh(streakGeo, i % 3 === 0 ? streakMatB : streakMatA); m.name = 'streak' + i;
    const s = 0.6 + MAP.hash1(i + 400) * 0.7; m.scale.set(s, s, s);
    streaks.add(m);
    streakInfo.push({ x: 23 + MAP.hash1(i + 410) * 10, y: 0.3 + MAP.hash1(i + 420) * 3.0, phase: MAP.hash1(i + 430) * 16, speed: 0.75 + MAP.hash1(i + 440) * 0.35, wob: MAP.hash1(i + 450) * 6.28 });
  }
  ctx.tag(streaks, { inkId: ID.DEBRIS_MIN + 4, layer: LAYER.FG, castShadow: false, receiveShadow: false });
  streaks.visible = false; reg.add(streaks);
  // ---- kick impact star (8 spikes) at the gate
  function starShape(n, R, r) {
    const s = new THREE.Shape();
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2, rad = i % 2 === 0 ? R : r; const x = Math.cos(a) * rad, y = Math.sin(a) * rad; if (i === 0) s.moveTo(x, y); else s.lineTo(x, y); }
    s.closePath(); return s;
  }
  const star = flatMesh(ctx, new THREE.ShapeGeometry(starShape(8, 1, 0.38)), 0xFFFFFF, { side: THREE.DoubleSide, name: 'kickStar', inkId: ID.BOLT });
  star.position.set(0, 14, 0.5); reg.add(star);
  const starInner = flatMesh(ctx, new THREE.ShapeGeometry(starShape(8, 0.55, 0.2)), 0xFFF3B0, { side: THREE.DoubleSide, name: 'kickStarInner', inkId: ID.BOLT });
  starInner.position.set(0, 14, 0.8); reg.add(starInner);

  const camPos = new THREE.Vector3();
  return {
    update(frame, fh, info, ctx, cam) {
      // ---------------- bolt + flash
      // short white flash so the bolt reads against a clear sky (the core adds a diffusion glow)
      let flash = 0;
      if (frame >= T.BOLT && frame <= T.BOLT + 1) flash = 1.0;
      else if (frame === T.BOLT + 2) flash = 0.35;
      else if (frame === T.BOLT + 3) flash = 0.12;
      const boltOn = frame >= T.BOLT && frame <= T.BOLT + 9;
      const variant = Math.floor((frame - T.BOLT) / 2) % 2;
      bolts[0].visible = boltOn && variant === 0;
      bolts[1].visible = boltOn && variant === 1;
      if (frame >= T.BOLT && frame < T.BOLT + 24) {
        const u = (frame - T.BOLT) / 24;
        glow.visible = true; glow.scale.setScalar(MAP.lerp(30, 120, MAP.easeOut(u)));
        ctx.setOpacity(glow, MAP.lerp(0.95, 0.3, u));
      } else glow.visible = false;
      // ---------------- dome of light 360..430
      if (frame >= T.DOME_START && frame < T.DOME_END) {
        const u = (frame - T.DOME_START) / (T.DOME_END - T.DOME_START);
        const R = MAP.lerp(40, 220, MAP.easeOut(u));
        const fadeOut = frame >= 420 ? 1 - (frame - 420) / 10 : 1;
        dome.visible = true; dome.scale.set(R, R, Math.min(R, 52));
        ctx.setOpacity(dome, MAP.lerp(0.85, 0.4, u) * fadeOut);
        rings.forEach((r, k) => {
          const rr = R * (1.12 + 0.3 * k) * (1 + 0.4 * MAP.easeOut(u));
          r.visible = true; r.geometry = torusFor(rr, 1.6 + k * 0.4); r.scale.setScalar(rr);
          ctx.setOpacity(r, fadeOut);
        });
        flecks.update(frame, { hideBefore: T.DOME_START, hideAfter: T.DOME_END, opacity: fadeOut });
      } else { dome.visible = false; for (const r of rings) r.visible = false; flecks.update(frame, { hideBefore: 1, hideAfter: 0 }); }
      // ---------------- shock wave 420..480
      if (frame >= T.SHOCK_START && frame <= T.SHOCK_END) {
        const u = (frame - T.SHOCK_START) / (T.SHOCK_END - T.SHOCK_START);
        const R = MAP.lerp(20, 260, u);
        shock.visible = true; shock.geometry = torusFor(R, 3); shock.scale.setScalar(R);
        ctx.setOpacity(shock, 0.5 * (1 - MAP.smooth((u - 0.7) / 0.3)));
      } else shock.visible = false;
      for (let k = 0; k < puffs.length; k++) {
        const d = puffData[k]; const a = fh - d.birth;
        if (a < 0 || a > 44) { puffs[k].hide(); continue; }
        const u = a / 44, e = MAP.easeOut(u);
        puffs[k].set(d.x, MAP.groundY(d.x, d.z) + 1 + 6 * u + d.r * 0.6, d.z + 5 * u, MAP.lerp(d.r, d.r * 3, e), { t: fh * 0.1, opacity: 1 - MAP.smooth((u - 0.7) / 0.3) });
      }
      // ---------------- wind streaks 440..500
      if (frame >= 440 && frame <= 500) {
        streaks.visible = true;
        camPos.copy(cam);
        for (let i = 0; i < streakInfo.length; i++) {
          const s = streakInfo[i], m = streaks.children[i];
          const z = 40 + (((frame - 440) * s.speed + s.phase) % 16);
          m.position.set(s.x + Math.sin(frame * 0.3 + s.wob) * 0.3, s.y + Math.sin(frame * 0.2 + s.wob) * 0.2, z);
          const d = m.position.distanceTo(camPos);
          if (d < 2.0) m.position.sub(camPos).normalize().multiplyScalar(2.0).add(camPos);
          m.rotation.set(Math.sin(frame * 0.4 + s.wob) * 0.2, 0, Math.cos(frame * 0.5 + s.wob) * 0.15);
        }
      } else streaks.visible = false;
      // ---------------- kick star 1112..1115 and impact flash
      // the core holds a two-frame impact negative at 1113..1114, so the flash is a single frame
      if (frame === T.KICK) flash = Math.max(flash, 0.7);
      if (frame >= T.KICK && frame <= T.KICK + 3) {
        const Rs = [10, 16, 13, 18][frame - T.KICK];
        star.visible = true; star.scale.setScalar(Rs); star.rotation.z = (frame - T.KICK) * 0.2;
        starInner.visible = true; starInner.scale.setScalar(Rs); starInner.rotation.z = -(frame - T.KICK) * 0.3;
      } else { star.visible = false; starInner.visible = false; }
      return flash;
    },
  };
}
