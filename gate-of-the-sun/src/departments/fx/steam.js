// Steam: the vast column behind the wall, the joint steam puffs on the giant, and the dissolve burst.
// All on 2s (positions from the held frame fh).
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import { makeBillows, steamStyle, Chain } from './billow.js';

const { T } = MAP;
const AXIS = { x: 0, z: -50 };

// fallback vents when the giant department is not loaded: world position and jet direction
const FALLBACK_VENTS = [[0, 72, -46, 0, 0.6, -0.8], [22, 66, -46, 0.6, 0.6, -0.5], [-22, 66, -46, -0.6, 0.6, -0.5], [10, 45, -46, 0.9, 0.3, -0.3], [-10, 45, -46, -0.9, 0.3, -0.3],
  [9, 22, -46, 0.3, 0.1, 0.9], [-9, 22, -46, -0.3, 0.1, 0.9], [30, 50, -46, 0.3, 0.9, -0.2], [-30, 50, -46, -0.3, 0.9, -0.2]];

/** Column height in metres as a function of frame. */
function columnHeight(f) {
  if (f < T.STEAM_COLUMN) return 0;
  // the shot 10 camera only sees steam above about y 120 over the wall, so the column shoots up early in the shot
  if (f < 504) return MAP.lerp(0, 60, MAP.easeOut((f - T.STEAM_COLUMN) / 64));
  if (f < 576) return MAP.lerp(60, 220, MAP.easeOut((f - 504) / 72));
  if (f < 700) return MAP.lerp(220, 240, (f - 576) / 124);
  return 240;
}

export function makeSteam(ctx, reg) {
  const style = steamStyle(ctx);
  // ---------------- column: 11 tiers x 4 billows, arranged in a U open toward the town (the giant stays in front)
  const LEVELS = 11, PER = 4;
  const column = makeBillows(ctx, reg, LEVELS * PER, { seed: 61, count: 10, style, name: 'steamCol', flat: 0.8 });
  const colData = column.map((b, k) => {
    const level = Math.floor(k / PER), j = k % PER;
    const h1 = MAP.hash1(k + 600), h2 = MAP.hash1(k + 620), h3 = MAP.hash1(k + 640);
    const u = (level + 0.3 + h1 * 0.4) / LEVELS;
    const theta = -Math.PI * (0.1 + 0.8 * ((j + 0.15 + h2 * 0.7) / PER));
    // tiers bulge out and tuck in alternately so the column rolls upward in drawn steps
    const bulge = 1 + 0.14 * Math.sin(level * 1.9 + 0.6);
    return { level, j, u, theta, ring: (36 + 28 * h3) * bulge, br: (15 + 8 * h1 + 9 * u) * (0.9 + 0.2 * bulge), hb: u * 200 * 0.6, roll: (h2 - 0.5) * 0.5 };
  });
  // ---------------- curl tails: small spheres spiralling off the two sides of the column
  const TAILS = 6, TAIL_N = 12;
  const tails = [];
  for (let i = 0; i < TAILS; i++) {
    const c = new Chain(ctx, { count: TAIL_N, style, name: 'steamCurl' + i });
    reg.add(c.group);
    tails.push({ chain: c, side: i % 2 === 0 ? 1 : -1, level: [3, 4, 6, 7, 9, 8][i], ph: MAP.hash1(i + 660) * 6.28, size: 0.75 + 0.5 * MAP.hash1(i + 670) });
  }
  const tailPts = Array.from({ length: TAIL_N }, () => [0, 0, 0, 0]);
  // ---------------- joint steam: two puff slots per vent, jetting along the vent then rising
  const MAX_VENTS = 16, SLOTS = 2;
  const joint = makeBillows(ctx, reg, MAX_VENTS * SLOTS, { seed: 71, count: 8, style, name: 'jointPuff', flat: 0.55 });
  // ---------------- dissolve burst along the body volume
  const dissolve = makeBillows(ctx, reg, 60, { seed: 81, count: 7, style, name: 'dissolve' });
  const disData = dissolve.map((b, k) => {
    const h = (n) => MAP.hash2(800 + n, k);
    return { birth: MAP.hold(T.DISSOLVE_START + Math.floor(h(1) * 44), 2), x: (h(2) - 0.5) * 50, y: 10 + h(3) * 80, z: -60 + h(4) * 30, dx: (h(5) - 0.5) * 2, dz: (h(6) - 0.5) * 2, r: 4 + h(7) * 3 };
  });

  let giantDept;       // lazily looked up; null when the giant department is not loaded
  const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), tmpD = new THREE.Vector3();
  const vents = [];    // [x, y, z, dx, dy, dz] or null for an inactive vent
  for (let i = 0; i < MAX_VENTS; i++) vents.push([0, 0, 0, 0, 1, 0]);
  let ventCount = 0;

  function resolveVents() {
    if (giantDept === undefined) giantDept = ctx.scene.getObjectByName('giantDept') || null;
    const list = giantDept && giantDept.userData && Array.isArray(giantDept.userData.giantVents) ? giantDept.userData.giantVents : null;
    if (list && list.length) {
      giantDept.updateMatrixWorld(true);
      ventCount = Math.min(list.length, MAX_VENTS);
      for (let i = 0; i < ventCount; i++) {
        const v = list[i];
        const active = !v.userData || typeof v.userData.active !== 'function' || v.userData.active();
        if (!active) { vents[i] = null; continue; }
        v.getWorldPosition(tmp); v.getWorldDirection(tmpD);
        vents[i] = [tmp.x, tmp.y, tmp.z, tmpD.x, tmpD.y, tmpD.z];
      }
    } else {
      ventCount = FALLBACK_VENTS.length;
      FALLBACK_VENTS.forEach((v, i) => { const L = Math.hypot(v[3], v[4], v[5]); vents[i] = [v[0], v[1], v[2], v[3] / L, v[4] / L, v[5] / L]; });
    }
  }

  return {
    update(frame, fh, info, ctx, cam) {
      // ---------------- column 440..1600
      const h = columnHeight(fh);
      if (h <= 0 || fh >= 1600) { for (const b of column) b.hide(); for (const t of tails) t.chain.hide(); }
      else {
        const thin = MAP.smooth((fh - 700) / 776);                       // 0 at 700, 1 at 1476
        const fade = fh >= T.DISSOLVE_START ? 1 - MAP.smooth((fh - T.DISSOLVE_START) / 124) : 1;
        const spin = (fh - T.STEAM_COLUMN) * 0.0012;
        for (let k = 0; k < column.length; k++) {
          const d = colData[k];
          const sc = MAP.clamp((h - d.hb) / 50, 0, 1);
          if (sc < 0.03) { column[k].hide(); continue; }
          const anvil = d.u > 0.78 ? 1 + (d.u - 0.78) * 1.8 : 1;
          const ring = d.ring * anvil * MAP.lerp(1, 0.85, thin);
          const th = d.theta + spin * (0.5 + d.u);
          const R = d.br * MAP.easeOut(sc) * MAP.lerp(1, 0.6, thin) * (1 + 0.12 * Math.sin(fh * 0.05 + k));
          const y = d.u * h + 6 + 4 * Math.sin(fh * 0.03 + k * 1.7);
          // slow rolling churn on 2s: each billow tips back and forth about its own x axis
          const roll = d.roll + 0.22 * Math.sin(fh * 0.021 + k * 2.3);
          column[k].set(AXIS.x + Math.cos(th) * ring, y, AXIS.z + Math.sin(th) * ring, R, { t: fh * 0.06, opacity: fade, spin: th, roll });
        }
        // curl tails: a log spiral of shrinking spheres hooking out and over from the column's flank
        for (const tl of tails) {
          const lv = tl.level;
          const k = lv * PER + (tl.side > 0 ? 0 : PER - 1);
          const d = colData[k];
          const sc = MAP.clamp((h - d.hb) / 50, 0, 1);
          if (sc < 0.2) { tl.chain.hide(); continue; }
          const g = column[k].group;
          const R = d.br * MAP.easeOut(sc) * MAP.lerp(1, 0.6, thin);
          const A = R * 0.9 * tl.size * MAP.smooth((sc - 0.2) / 0.5);
          // attach on the outer flank and spiral outward, up and back in (screen plane, facing the town)
          const ax = g.position.x + tl.side * R * 0.7, ay = g.position.y + R * 0.15, az = g.position.z + R * 0.2;
          const swirl = tl.ph + fh * 0.012;
          for (let i = 0; i < TAIL_N; i++) {
            const s = i / (TAIL_N - 1);
            const ang = -0.2 + s * 3.6 + 0.3 * Math.sin(swirl + s * 2);
            const rad = A * (1.0 - 0.68 * s);
            const cx = ax + tl.side * A * 0.95, cy = ay + A * 0.35;
            tailPts[i][0] = cx - tl.side * Math.cos(ang) * rad;
            tailPts[i][1] = cy + Math.sin(ang) * rad;
            tailPts[i][2] = az + 0.15 * A * Math.sin(swirl + i);
            tailPts[i][3] = A * (0.36 - 0.24 * s) * (1 + 0.06 * Math.sin(swirl * 2 + i));
          }
          tl.chain.set(tailPts, fade);
        }
      }
      // ---------------- joint steam 636..1548: a jet along the vent, then the puff rises and rounds up
      if (fh >= 636 && fh <= 1548) {
        resolveVents();
        for (let v = 0; v < MAX_VENTS; v++) for (let s = 0; s < SLOTS; s++) {
          const b = joint[v * SLOTS + s];
          const p = v < ventCount ? vents[v] : null;
          if (!p) { b.hide(); continue; }
          const base = 636 + MAP.hash2(v + 1, s) * 48 + s * 24;
          const n = Math.floor((fh - base) / 48);
          if (n < 0) { b.hide(); continue; }
          const birth = base + n * 48, age = fh - birth, life = 44;
          if (age > life) { b.hide(); continue; }
          const u = age / life, e = MAP.easeOut(u);
          const hv = MAP.hash2(v + 7, n), hw = MAP.hash2(v + 13, n + s);
          dir.set(p[3], p[4], p[5]);
          const R = MAP.lerp(1.4, 5, e) * (0.8 + 0.4 * hw);
          // elongated along the jet on the first drawing, round by the fourth (on 2s: 2.8, 2.0, 1.45, 1.1, 1)
          const st = 1 + 1.8 * Math.pow(MAP.clamp(1 - age / 8, 0, 1), 2);
          const jet = (5 + 4 * hv) * MAP.easeOut(age / 12);
          const rise = (10 + 10 * hv) * MAP.smooth((age - 4) / 40);
          const along = jet + R * st * 0.85;
          tmp.set(p[0] + dir.x * along + (hw - 0.5) * 6 * e, p[1] + dir.y * along + rise + R * 0.4 * e, p[2] + dir.z * along + 2 * e);
          // keep the puff surface clear of the camera (shot 16 sits just above the head): a continuous push, no pop
          if (cam) { const dd = tmp.distanceTo(cam), need = R * st * 1.05 + 1.5; if (dd < need) tmp.sub(cam).normalize().multiplyScalar(need).add(cam); }
          b.set(tmp.x, tmp.y, tmp.z, R, { t: fh * 0.1, opacity: 1 - MAP.smooth((u - 0.65) / 0.35), spin: hv * 6, stretch: st, dir });
        }
      } else for (const b of joint) b.hide();
      // ---------------- dissolve 1476..1600
      if (fh >= T.DISSOLVE_START && fh < 1600) {
        for (let k = 0; k < dissolve.length; k++) {
          const d = disData[k]; const life = 1596 - d.birth; const a = fh - d.birth;
          if (a < 0 || a > life) { dissolve[k].hide(); continue; }
          const u = a / life, e = MAP.easeOut(u);
          const R = MAP.lerp(d.r, d.r * 4, e);
          dissolve[k].set(d.x * (1 + 0.8 * e) + d.dx * 15 * e, d.y + 30 * u + R * 0.3, d.z + d.dz * 15 * e - 5 * e, R, { t: fh * 0.07, opacity: 1 - MAP.smooth((u - 0.6) / 0.4), spin: k });
        }
      } else for (const b of dissolve) b.hide();
    },
  };
}
