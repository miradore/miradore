// Ambient effects: the pebble toss and splash in shot 3, and the ash flakes drifting over the town after the kick.
import * as THREE from 'three';
import * as MAP from '../../../shared/map.js';
import { torusFor } from './billow.js';

const { ID, PALETTE } = MAP;

export function makeAmbient(ctx, reg) {
  const { LAYER } = ctx;
  // ---------------- pebble and splash (shot 3: toss at 208, splash 220..232)
  const pebbleStart = new THREE.Vector3(27.4, MAP.stepTopY(0, 46.8) + 0.8, 46.8);
  const waterY = MAP.groundY(26, 46.8) - 2.2;
  const pebbleEnd = new THREE.Vector3(35, waterY, 47);
  const pebble = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), ctx.makeCel({ color: 0xB89A78, shade: 0x6E5640 }));
  pebble.name = 'pebble'; pebble.visible = false;
  ctx.tag(pebble, { inkId: ID.DEBRIS_MIN + 7, layer: LAYER.FG, castShadow: false, receiveShadow: false });
  reg.add(pebble);
  const splashMat = ctx.makeCel({ color: PALETTE.steam, shade: PALETTE.steamShade, bandEdge: 0.05 });
  const splashRings = [0, 1].map((k) => {
    const m = new THREE.Mesh(torusFor(1, 0.04), splashMat); m.name = 'splashRing' + k; m.rotation.x = Math.PI / 2; m.visible = false;
    ctx.tag(m, { inkId: ID.STEAM, layer: LAYER.FG, castShadow: false, receiveShadow: false }); reg.add(m); return m;
  });
  const drops = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06 + MAP.hash1(i + 2000) * 0.03, 8, 6), splashMat); m.name = 'drop' + i; m.visible = false;
    ctx.tag(m, { inkId: ID.STEAM, layer: LAYER.FG, castShadow: false, receiveShadow: false }); reg.add(m);
    const th = MAP.hash1(i + 2010) * Math.PI * 2, sp = 0.4 + MAP.hash1(i + 2020) * 0.8;
    drops.push({ mesh: m, vx: Math.cos(th) * sp, vz: Math.sin(th) * sp, vy: 2.2 + MAP.hash1(i + 2030) * 1.4 });
  }

  // ---------------- ash flakes 1176..1860: 70 near the hare, 130 across the town
  // an irregular little pentagon reads as a flake rather than a square
const flakeShape = new THREE.Shape();
[[0, 0.06], [0.05, 0.02], [0.04, -0.045], [-0.03, -0.05], [-0.055, 0.01]].forEach(([x, y], i) => (i === 0 ? flakeShape.moveTo(x, y) : flakeShape.lineTo(x, y)));
flakeShape.closePath();
const flakeGeo = new THREE.ShapeGeometry(flakeShape);
  const flakeMats = [ctx.makeFlat({ color: 0x4A4440, side: THREE.DoubleSide }), ctx.makeFlat({ color: 0x6E6660, side: THREE.DoubleSide }), ctx.makeFlat({ color: 0xBFB8B0, side: THREE.DoubleSide })];
  const flakes = new THREE.Group(); flakes.name = 'ash';
  const flakeInfo = [];
  for (let i = 0; i < 200; i++) {
    const h = (n) => MAP.hash1(i * 7 + n + 2100);
    const m = new THREE.Mesh(flakeGeo, flakeMats[i % 3]); m.name = 'ash' + i;
    const s = (i < 70 ? 0.5 : 0.7) + h(1) * 0.7; m.scale.setScalar(s);
    flakes.add(m);
    const near = i < 70;
    flakeInfo.push({
      x: near ? 20 + h(2) * 14 : -60 + h(2) * 120,
      z: near ? 40 + h(3) * 12 : 20 + h(3) * 100,
      top: near ? 11 : 40,
      speed: 0.6 + h(4) * 0.6, phase: h(5), wob: h(6) * 6.28,
    });
  }
  ctx.tag(flakes, { inkId: ID.DEBRIS_MAX, layer: LAYER.FG, castShadow: false, receiveShadow: false });
  flakes.visible = false; reg.add(flakes);

  return {
    update(frame, fh, info, ctx, cam) {
      // pebble arc 208..220 (1s)
      if (frame >= 208 && frame < 220) {
        pebble.visible = true;
        const Tt = 12 / 24, t = (frame - 208) / 24, u = t / Tt;
        const vy = (pebbleEnd.y - pebbleStart.y + 0.5 * 9.8 * Tt * Tt) / Tt;
        pebble.position.set(MAP.lerp(pebbleStart.x, pebbleEnd.x, u), pebbleStart.y + vy * t - 4.9 * t * t, MAP.lerp(pebbleStart.z, pebbleEnd.z, u));
      } else pebble.visible = false;
      // splash 220..232 on 2s
      const ringDefs = [{ birth: 220, life: 12, r0: 0.15, r1: 1.4 }, { birth: 224, life: 8, r0: 0.1, r1: 0.9 }];
      for (let k = 0; k < 2; k++) {
        const d = ringDefs[k], a = fh - d.birth, m = splashRings[k];
        if (a < 0 || a > d.life) { m.visible = false; continue; }
        const u = a / d.life, R = MAP.lerp(d.r0, d.r1, MAP.easeOut(u));
        m.visible = true; m.geometry = torusFor(R, 0.04 + 0.02 * (1 - u)); m.scale.setScalar(R);
        m.position.set(pebbleEnd.x, waterY + 0.03, pebbleEnd.z);
        ctx.setOpacity(m, 1 - MAP.smooth((u - 0.5) / 0.5));
      }
      if (fh >= 220 && fh <= 232) {
        const t = (fh - 220) / 24;
        for (const d of drops) {
          const y = waterY + d.vy * t - 4.9 * t * t;
          d.mesh.visible = y > waterY;
          d.mesh.position.set(pebbleEnd.x + d.vx * t, y, pebbleEnd.z + d.vz * t);
        }
      } else for (const d of drops) d.mesh.visible = false;
      // ash flakes
      if (frame >= 1176 && frame < 1860) {
        flakes.visible = true;
        const t = frame / 24;
        for (let i = 0; i < flakeInfo.length; i++) {
          const f = flakeInfo[i], m = flakes.children[i];
          const y = f.top - ((t * f.speed + f.phase * f.top) % f.top);
          m.position.set(f.x + Math.sin(t * 0.7 + f.wob) * 0.4, y, f.z + Math.cos(t * 0.5 + f.wob) * 0.3);
          if (m.position.distanceTo(cam) < 1.0) m.position.sub(cam).normalize().add(cam);
          m.rotation.set(t * 0.9 + f.wob, t * 0.6, f.wob);
        }
      } else flakes.visible = false;
    },
  };
}
