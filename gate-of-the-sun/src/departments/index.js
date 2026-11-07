// Department registry. Each department is an ES module exporting default { name, build(ctx) }.
// build(ctx) returns { group, update(frame, info, ctx), colliders: { static: Mesh[], bodies: { name, parts: Mesh[] }[] } }.
import town from './town/index.js';
import giant from './giant/index.js';
import characters from './characters/index.js';
import fx from './fx/index.js';
export const departments = [town, giant, characters, fx];
