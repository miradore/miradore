// Geometry checks run inside the page on the real meshes with three-mesh-bvh.
// Tests per frame: body parts vs static colliders (steps, walls, gate, houses), body vs body,
// camera inside a mesh, camera below ground. Pure queries, no rendering.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { surfaceY } from '../../shared/map.js';

const bvhCache = new Map();
function bvhOf(mesh) {
  const g = mesh.geometry;
  let b = bvhCache.get(g.uuid);
  if (!b) { b = new MeshBVH(g, { maxLeafTris: 8 }); bvhCache.set(g.uuid, b); }
  return b;
}
const _box = new THREE.Box3(), _box2 = new THREE.Box3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
function worldBox(mesh) { if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox(); return _box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld); }
function worldBox2(mesh) { if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox(); return _box2.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld); }
function visibleUp(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

function meshesIntersect(a, b) {
  // exact triangle test of b's geometry against a's BVH, in a's local space
  const bvh = bvhOf(a);
  _inv.copy(a.matrixWorld).invert();
  _m.multiplyMatrices(_inv, b.matrixWorld);
  return bvh.intersectsGeometry(b.geometry, _m);
}

export function makeChecker(app) {
  const { scene, camera, built } = app;
  const statics = [];
  const bodies = [];
  const popAllowed = new Set();
  for (const d of built) {
    const c = d.colliders || {};
    for (const m of (c.static || [])) if (m && m.isMesh) statics.push(m);
    for (const b of (c.bodies || [])) bodies.push({ name: b.name, dept: d.name, parts: (b.parts || []).filter((p) => p && p.isMesh) });
    for (const p of (d.popAllowed || [])) p.traverse((o) => { if (o.name) popAllowed.add(o.name); });
  }
  const frustum = new THREE.Frustum(); const pv = new THREE.Matrix4(); const sph = new THREE.Sphere();

  function check(frame) {
    app.update(frame);
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const out = { frame, intersections: [], cameraInside: [], belowGround: false, camera: camera.position.toArray(), quat: camera.quaternion.toArray(), fov: camera.fov, vis: [] };
    // body parts vs statics and vs other bodies
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      if (!A.parts.length || !visibleUp(A.parts[0])) continue;
      for (const pa of A.parts) {
        if (!visibleUp(pa)) continue;
        const ba = worldBox(pa).clone();
        for (const s of statics) {
          if (!visibleUp(s)) continue;
          if (!ba.intersectsBox(worldBox2(s))) continue;
          if (meshesIntersect(s, pa)) out.intersections.push({ a: A.name + ':' + (pa.name || 'part'), b: s.name || 'static' });
        }
        for (let j = i + 1; j < bodies.length; j++) {
          const B = bodies[j];
          if (!B.parts.length || !visibleUp(B.parts[0])) continue;
          for (const pb of B.parts) {
            if (!visibleUp(pb)) continue;
            if (!ba.intersectsBox(worldBox2(pb))) continue;
            if (meshesIntersect(pa, pb)) out.intersections.push({ a: A.name + ':' + (pa.name || 'part'), b: B.name + ':' + (pb.name || 'part') });
          }
        }
      }
    }
    // camera inside a mesh: AABB test then ray along +y hitting a back face
    const cp = camera.position;
    const ray = new THREE.Ray(cp.clone(), new THREE.Vector3(0, 1, 0));
    const localRay = new THREE.Ray();
    const candidates = [...statics, ...bodies.flatMap((b) => b.parts)];
    for (const s of candidates) {
      if (!visibleUp(s)) continue;
      if (!worldBox(s).containsPoint(cp)) continue;
      _inv.copy(s.matrixWorld).invert();
      localRay.copy(ray).applyMatrix4(_inv);
      const hit = bvhOf(s).raycastFirst(localRay, THREE.DoubleSide);
      if (hit && hit.face) {
        const n = hit.face.normal.clone().transformDirection(s.matrixWorld);
        if (n.y > 0) out.cameraInside.push(s.name || 'mesh');   // first hit faces away: we are inside
      }
    }
    out.belowGround = cp.y < surfaceY(cp.x, cp.z) + 0.05;
    // visibility list for pop detection (named meshes in frustum)
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
    scene.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh) || !o.name) return;
      const vis = visibleUp(o);
      let inF = false;
      if (vis) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); inF = frustum.intersectsSphere(sph); }
      out.vis.push([o.name, vis ? 1 : 0, inF ? 1 : 0, popAllowed.has(o.name) ? 1 : 0]);
    });
    return out;
  }
  return { check, stats: { statics: statics.length, bodies: bodies.map((b) => b.name + '(' + b.parts.length + ')'), popAllowed: popAllowed.size } };
}
