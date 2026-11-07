// STUB for fx department (replaced by the department agent)
import * as THREE from 'three';
export default { name: 'fx', async build(ctx) { const group = new THREE.Group(); group.name = 'fx'; return { group, update() {}, colliders: { static: [], bodies: [] } }; } };
