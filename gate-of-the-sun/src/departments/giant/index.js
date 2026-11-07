// STUB for giant department (replaced by the department agent)
import * as THREE from 'three';
export default { name: 'giant', async build(ctx) { const group = new THREE.Group(); group.name = 'giant'; return { group, update() {}, colliders: { static: [], bodies: [] } }; } };
