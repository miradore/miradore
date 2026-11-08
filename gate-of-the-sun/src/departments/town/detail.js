// Detail budget: decides how much drawn detail a point of the town gets, from its distance to the
// cameras of the shots that look at the backgrounds closely. Also keeps decoration clear of every camera.
import * as THREE from 'three';

// shots whose cameras sit close to facades, steps or the wall (highest detail density near them)
const PRIORITY = [2, 3, 4, 5, 9, 11, 13, 17, 23, 24, 25, 26, 30, 31];

export function makeDetail(ctx) {
  const { SHOTS } = ctx;
  const cams = [], allCams = [];
  for (const shot of SHOTS) {
    for (const f of [shot.start, Math.floor((shot.start + shot.end) / 2), shot.end - 1]) {
      const st = ctx.cameraState(f);
      const pos = st.pos.clone(), dir = st.look.clone().sub(st.pos).normalize();
      const c = { id: shot.id, pos, dir, cosHalf: Math.cos(THREE.MathUtils.degToRad(Math.min(80, (Array.isArray(shot.fov) ? shot.fov[0] : shot.fov) * 0.95 + 12))) };
      allCams.push(c);
      if (PRIORITY.includes(shot.id)) cams.push(c);
    }
  }
  const _v = new THREE.Vector3();
  /** Effective distance from the nearest priority camera (points outside its view count as farther). */
  function distAt(x, y, z) {
    let best = 1e9;
    for (const c of cams) {
      _v.set(x - c.pos.x, y - c.pos.y, z - c.pos.z);
      const d = _v.length();
      const cos = d > 1e-6 ? _v.dot(c.dir) / d : 1;
      const eff = cos >= c.cosHalf ? d : d * 3;
      if (eff < best) best = eff;
    }
    return best;
  }
  /** 2: full detail (frames, slats, balconies), 1: medium, 0: far (painted quads only). */
  function lvlAt(x, y, z) {
    const d = distAt(x, y, z);
    // the main street is seen end to end by shots 10, 14, 21, 24 and 28: never let it fall to the far level
    if (Math.abs(x) < 7.5 && z > 8 && z < 170 && d >= 75) return 1;
    return d < 40 ? 2 : d < 75 ? 1 : 0;
  }
  /** True when a box around (x, y, z) of half size r stays at least `margin` from every camera position. */
  function clear(x, y, z, r = 0.5, margin = 1.6) {
    for (const c of allCams) {
      const dx = Math.max(0, Math.abs(x - c.pos.x) - r), dy = Math.max(0, Math.abs(y - c.pos.y) - r), dz = Math.max(0, Math.abs(z - c.pos.z) - r);
      if (dx * dx + dy * dy + dz * dz < margin * margin) return false;
    }
    return true;
  }
  return { cams, allCams, distAt, lvlAt, clear };
}
