// STUB characters: a capsule kid with a sphere head and eye planes at the hare anchor
import * as THREE from 'three';
export default { name: 'characters', async build(ctx) {
  const { MAP, ID, LAYER, makeCel, makeFlat, tag } = ctx;
  const group = new THREE.Group(); group.name = 'characters';
  const a = MAP.ANCHORS.hareHead;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.35, 4, 12), makeCel({ color: 0xF2E9DA, shade: 0xB7A6C9 })); body.position.set(a[0], a[1] - 0.55, a[2]);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 16), makeCel({ color: 0xE8C9A0, shade: 0xB38D73 })); head.position.set(a[0], a[1], a[2]);
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const g = cv.getContext('2d');
  g.clearRect(0, 0, 128, 128); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(64, 64, 40, 54, 0, 0, 7); g.fill(); g.fillStyle = '#3a6fd8'; g.beginPath(); g.ellipse(64, 70, 28, 40, 0, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.ellipse(64, 74, 14, 24, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(52, 50, 9, 12, 0, 0, 7); g.fill();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.14), makeFlat({ map: tex })); eye.position.set(a[0] + 0.25, a[1] + 0.02, a[2] + s * 0.09); eye.rotation.y = Math.PI / 2; eye.name = 'eye'; tag(eye, { inkId: 2, layer: LAYER.FG, castShadow: false }); group.add(eye); }
  body.name = 'hareBody'; head.name = 'hareHead'; tag(body, { inkId: 2, layer: LAYER.FG }); tag(head, { inkId: 2, layer: LAYER.FG }); group.add(body, head);
  return { group, update() {}, colliders: { static: [], bodies: [{ name: 'hare', parts: [body, head] }] } };
} };
