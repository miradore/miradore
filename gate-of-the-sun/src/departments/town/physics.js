// Deterministic ballistic helpers for debris: landing solved analytically at build time,
// so update(frame) is a pure function of the frame with no state carried between calls.
import * as THREE from 'three';

export const G = 9.81;

/** Positive time at which y0 + vy t - 0.5 g t^2 == ySurf (0 when it never reaches). */
export function landTime(y0, vy, ySurf) {
  const disc = vy * vy + 2 * G * (y0 - ySurf);
  if (disc < 0) return 0;
  return (vy + Math.sqrt(disc)) / G;
}

/** Surface height function: ground, or the roof of a house footprint containing (x, z). */
export function makeSurface(MAP, footprints) {
  return (x, z) => {
    let y = MAP.groundY(x, z);
    for (const f of footprints) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && f.top > y) y = f.top;
    return y;
  };
}

/** Plan a landing: iterate the landing point against the surface function. Returns { t, x, y, z }. */
export function planLanding(p0, v, surfFn, half, zMax = Infinity) {
  // start from the ground landing, then try the surface found there (a roof); a roof the parabola
  // never reaches (landTime 0) is ignored and the ground landing is kept
  let ySurf = MAP_GROUND(p0, v, surfFn), t = 0, x = p0.x, z = p0.z;
  for (let k = 0; k < 4; k++) {
    const tt = landTime(p0.y, v.y, ySurf + half);
    if (tt <= 0) break;
    t = tt;
    x = p0.x + v.x * t; z = Math.min(zMax, p0.z + v.z * t);
    const ny = surfFn(x, z);
    if (Math.abs(ny - ySurf) < 1e-3) break;
    const tn = landTime(p0.y, v.y, ny + half);
    if (tn <= 0) break;
    ySurf = ny;
  }
  if (t <= 0) { t = landTime(p0.y, v.y, half); x = p0.x + v.x * t; z = Math.min(zMax, p0.z + v.z * t); ySurf = 0; }
  return { t, x, y: ySurf + half, z };
}

function MAP_GROUND(p0, v, surfFn) {
  // ground height at the point where the parabola would meet y = 0 (the plaza level), as a first guess
  const t = landTime(p0.y, v.y, 0);
  const x = p0.x + v.x * t, z = p0.z + v.z * t;
  const g = surfFn(x, z);
  return g;
}

/** Position at time t (seconds) along the parabola. */
export function ballistic(p0, v, t, out) {
  out.set(p0.x + v.x * t, p0.y + v.y * t - 0.5 * G * t * t, p0.z + v.z * t);
  return out;
}

const _q = new THREE.Quaternion(), _axis = new THREE.Vector3();
/**
 * Tumble from the identity orientation to qFinal over tLand seconds at constant angular velocity about a
 * fixed axis, adding `turns` extra full revolutions so the piece visibly spins yet lands exactly on qFinal.
 */
export function tumble(qFinal, turns, t, tLand, out) {
  // axis-angle of qFinal
  const w = Math.min(1, Math.max(-1, qFinal.w));
  let ang = 2 * Math.acos(w);
  const s = Math.sqrt(Math.max(0, 1 - w * w));
  if (s < 1e-6) _axis.set(0, 1, 0); else _axis.set(qFinal.x / s, qFinal.y / s, qFinal.z / s);
  const total = ang + turns * Math.PI * 2;
  const u = tLand > 0 ? Math.min(1, t / tLand) : 1;
  out.setFromAxisAngle(_axis, total * u);
  return out;
}
