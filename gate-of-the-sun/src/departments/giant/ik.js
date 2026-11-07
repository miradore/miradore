// Small analytic rig helpers for the FK hierarchies of the giant and the automatons.
// Bones are Groups whose geometry extends along local -y; a child joint sits at (0, -length, 0).
// Everything here is a pure function of its inputs (no state), so render workers can jump frames.
import * as THREE from 'three';

const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wp = new THREE.Vector3();

/**
 * Two bone IK. root/target are world positions, L1/L2 bone lengths, pole a world direction the
 * middle joint (knee or elbow) bends toward. Writes the middle joint world position into out and
 * returns the (possibly clamped) reachable target in outTarget.
 */
export function solveTwoBone(root, target, L1, L2, pole, out, outTarget) {
  _d.subVectors(target, root);
  let dist = _d.length();
  const maxD = (L1 + L2) * 0.999, minD = Math.abs(L1 - L2) * 1.001 + 0.01;
  if (dist < 1e-6) { _d.set(0, -1, 0); dist = 1e-6; }
  _d.multiplyScalar(1 / dist);
  const reach = Math.max(minD, Math.min(maxD, dist));
  outTarget.copy(root).addScaledVector(_d, reach);
  const a = (L1 * L1 - L2 * L2 + reach * reach) / (2 * reach);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-6) { _p.set(0, 0, 1).addScaledVector(_d, -_d.z); if (_p.lengthSq() < 1e-6) _p.set(1, 0, 0); }
  _p.normalize();
  out.copy(root).addScaledVector(_d, a).addScaledVector(_p, h);
  return out;
}

/** World quaternion that points local -y along dir and local +z toward the pole (perpendicular part). */
export function quatFromBone(dir, pole, target) {
  _y.copy(dir).normalize().multiplyScalar(-1);
  _z.copy(pole).addScaledVector(_y, -pole.dot(_y));
  if (_z.lengthSq() < 1e-6) { _z.set(0, 0, 1).addScaledVector(_y, -_y.z); if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0); }
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  return target.setFromRotationMatrix(_m);
}

/** Set a group's local quaternion so that its world quaternion equals q. */
export function setWorldQuaternion(group, q) {
  if (group.parent) { group.parent.getWorldQuaternion(_pq); _pq.invert(); group.quaternion.copy(_pq).multiply(q); }
  else group.quaternion.copy(q);
  group.updateMatrixWorld(true);
}

/** Aim a bone group (its origin is already placed by the hierarchy) so that -y points from its world position to `to`. */
export function aimBone(group, to, pole) {
  group.getWorldPosition(_wp);
  _d.subVectors(to, _wp);
  quatFromBone(_d, pole, _q);
  setWorldQuaternion(group, _q);
}

/**
 * Solve and apply a two bone chain: upper (at the root joint), lower (child at (0,-L1,0)), optional end
 * group whose world quaternion is set to endQuat. Returns the reachable ankle/wrist world position.
 */
export function applyTwoBone(upper, lower, L1, L2, target, pole, end, endQuat, tmp) {
  upper.getWorldPosition(tmp.root);
  solveTwoBone(tmp.root, target, L1, L2, pole, tmp.mid, tmp.reach);
  aimBone(upper, tmp.mid, pole);
  aimBone(lower, tmp.reach, pole);
  if (end && endQuat) setWorldQuaternion(end, endQuat);
  return tmp.reach;
}

export function makeIkTemps() { return { root: new THREE.Vector3(), mid: new THREE.Vector3(), reach: new THREE.Vector3() }; }
