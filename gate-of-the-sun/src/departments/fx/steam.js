// Steam: the vast column behind the wall, the joint steam puffs on the giant, and the dissolve burst.
// All on 2s (positions from the held frame fh).
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import { makeBillows, steamStyle } from './billow.js';

const { T } = MAP;
const AXIS = { x: 0, z: -50 };

// fallback vents when the giant department exposes none (world positions)
const FALLBACK_VENTS = [[0, 72, -46], [22, 66, -46], [-22, 66, -46], [10, 45, -46], [-10, 45, -46], [9, 22, -46], [-9, 22, -46], [30, 50, -46], [-30, 50, -46]];

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
  // ---------------- column: 12 levels x 3 billows, arranged in a U open toward the town
  const LEVELS = 12, PER = 3;
  const column = makeBillows(ctx, reg, LEVELS * PER, { seed: 61, count: 11, style, name: 'steamCol' });
  const colData = column.map((b, k) => {
    const level = Math.floor(k / PER), j = k % PER;
    const h1 = MAP.hash1(k + 600), h2 = MAP.hash1(k + 620), h3 = MAP.hash1(k + 640);
    const u = (level + 0.3 + h1 * 0.5) / LEVELS;
    const theta = -Math.PI * (0.1 + 0.8 * ((j + 0.15 + h2 * 0.7) / PER));
    return { u, theta, ring: 36 + 28 * h3, br: 16 + 9 * h1 + 10 * u, hb: u * 200 * 0.6 };
  });
  // ---------------- joint steam: two puff slots per vent
  const MAX_VENTS = 12, SLOTS = 2;
  const joint = makeBillows(ctx, reg, MAX_VENTS * SLOTS, { seed: 71, count: 6, style, name: 'jointPuff' });
  // ---------------- dissolve burst along the body volume
  const dissolve = makeBillows(ctx, reg, 60, { seed: 81, count: 7, style, name: 'dissolve' });
  const disData = dissolve.map((b, k) => {
    const h = (n) => MAP.hash2(800 + n, k);
    return { birth: MAP.hold(T.DISSOLVE_START + Math.floor(h(1) * 44), 2), x: (h(2) - 0.5) * 50, y: 10 + h(3) * 80, z: -60 + h(4) * 30, dx: (h(5) - 0.5) * 2, dz: (h(6) - 0.5) * 2, r: 4 + h(7) * 3 };
  });

  let giant;           // lazily looked up; null when not present
  const tmp = new THREE.Vector3();
  const ventPos = [];

  function resolveVents() {
    if (giant === undefined) giant = ctx.scene.getObjectByName('giant') || null;
    const vents = giant && giant.userData && Array.isArray(giant.userData.vents) ? giant.userData.vents : null;
    ventPos.length = 0;
    if (vents && vents.length) {
      giant.updateMatrixWorld(true);
      for (let i = 0; i < Math.min(vents.length, MAX_VENTS); i++) { vents[i].getWorldPosition(tmp); ventPos.push([tmp.x, tmp.y, tmp.z]); }
    } else for (const v of FALLBACK_VENTS) ventPos.push(v);
  }

  return {
    update(frame, fh, info, ctx, cam) {
      // ---------------- column 440..1600
      const h = columnHeight(fh);
      if (h <= 0 || fh >= 1600) { for (const b of column) b.hide(); }
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
          const R = d.br * MAP.easeOut(sc) * MAP.lerp(1, 0.6, thin) * (1 + 0.15 * Math.sin(fh * 0.05 + k));
          const y = d.u * h + 6 + 4 * Math.sin(fh * 0.03 + k * 1.7);
          column[k].set(AXIS.x + Math.cos(th) * ring, y, AXIS.z + Math.sin(th) * ring, R, { t: fh * 0.06, opacity: fade, spin: th });
        }
      }
      // ---------------- joint steam 636..1548
      if (fh >= 636 && fh <= 1548) {
        resolveVents();
        for (let v = 0; v < MAX_VENTS; v++) for (let s = 0; s < SLOTS; s++) {
          const b = joint[v * SLOTS + s];
          if (v >= ventPos.length) { b.hide(); continue; }
          const base = 636 + MAP.hash2(v + 1, s) * 48 + s * 24;
          const n = Math.floor((fh - base) / 48);
          if (n < 0) { b.hide(); continue; }
          const birth = base + n * 48, age = fh - birth, life = 44;
          if (age > life) { b.hide(); continue; }
          const u = age / life, e = MAP.easeOut(u);
          const hv = MAP.hash2(v + 7, n), hw = MAP.hash2(v + 13, n + s);
          const rise = 10 + 10 * hv;
          const p = ventPos[v];
          const R = MAP.lerp(2, 5, e) * (0.8 + 0.4 * hw);
          tmp.set(p[0] + (hw - 0.5) * 6 * e, p[1] + rise * u + R * 0.4, p[2] + 2 + 4 * e);
          // keep the puff surface clear of the camera (shot 16 sits just above the head): a continuous push, no pop
          if (cam) { const d = tmp.distanceTo(cam), need = R * 1.05 + 1.5; if (d < need) tmp.sub(cam).normalize().multiplyScalar(need).add(cam); }
          b.set(tmp.x, tmp.y, tmp.z, R, { t: fh * 0.1, opacity: 1 - MAP.smooth((u - 0.65) / 0.35), spin: hv * 6 });
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
