// STUB town: ground, wall slab, gate, a few houses with domes (to test the passes)
import * as THREE from 'three';
export default { name: 'town', async build(ctx) {
  const { MAP, ID, LAYER, makeCel, tag } = ctx; const P = MAP.PALETTE;
  const group = new THREE.Group(); group.name = 'town';
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 60, 60), makeCel({ color: 0xE8D8B8, shade: 0xB9A4C9 }));
  ground.rotation.x = -Math.PI / 2; const pa = ground.geometry.attributes.position;
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = -pa.getY(i); pa.setZ(i, MAP.groundY(x, z)); } ground.geometry.computeVertexNormals();
  ground.name = 'ground'; tag(ground, { inkId: ID.TERRAIN, layer: LAYER.BG }); group.add(ground);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(480, 50, 12), makeCel({ color: P.sandstone, shade: P.sandstoneShade })); wall.position.set(0, 25, 0); wall.name = 'wall';
  tag(wall, { inkId: ID.WALL, layer: LAYER.BG }); group.add(wall);
  const rng = MAP.mulberry32(7);
  for (let i = 0; i < 120; i++) {
    const w = 8 + rng() * 5, d = 8 + rng() * 5, h = 9 + rng() * 3; let x = (rng() - 0.5) * 200, z = 14 + rng() * 150;
    if (Math.abs(x) < 8 || (x > 24 && x < 42)) continue;
    const c = P.stucco[i % 4];
    const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeCel({ color: c, shade: P.stuccoShade })); house.position.set(x, MAP.groundY(x, z) + h / 2, z); house.name = 'house' + i;
    tag(house, { inkId: ID.BG_MIN + (i % 40), layer: LAYER.BG }); group.add(house);
    if (rng() < 0.3) { const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 0.35, 16, 12), makeCel({ color: P.dome, shade: P.domeShade })); dome.position.set(x, MAP.groundY(x, z) + h + w * 0.1, z); tag(dome, { inkId: ID.BG_MIN + ((i + 7) % 40), layer: LAYER.BG }); group.add(dome); }
  }
  return { group, update() {}, colliders: { static: [ground, wall], bodies: [] } };
} };
