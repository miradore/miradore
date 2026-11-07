# Department contract

Five departments build the film in parallel. Each owns its own folder and never edits another
department's files or the core. Everything shared lives in `shared/map.js` (world coordinates,
anchors, event frames, palette, ink ids, helpers) and `shared/shots.json` (31 shots, cameras,
per-department notes). Read both before writing a line of code. British English in comments and docs.
No em dashes anywhere.

| Department | Folder | Owns |
|---|---|---|
| town | `src/departments/town/` | terrain, canal with steps, houses, domes, awnings, laundry, bougainvillea, square, bell towers, wall, towers, gate (intact and broken pieces), hero house facade collapse, fields and mountains |
| giant | `src/departments/giant/` | the 90 m bronze automaton and its animation (hand slam, head rise, head turn, leg lift, kick, dissolve), the small automatons, their joint steam emitters are FX's but the giant exposes joint positions |
| characters | `src/departments/characters/` | fox, hare (glasses), lynx, badger mother and piglet, goat mother and baby, crowd (bears, deer, dogs, sheep, raccoons, otters, boars), all poses and acting |
| fx | `src/departments/fx/` | bolt, dome of light, shock wave, steam column, joint steam, cracks, falling crenellations, impact flash, gate burst debris, boulders and their landings, dome shatter, dust bursts, dust wall, ash, splash, laundry wind |
| sound | `sound/` | the orchestral score rendered offline to `out/score.wav` (node, no browser) |

## Module API (town, giant, characters, fx)

`src/departments/<name>/index.js` default-exports:

```js
export default {
  name: 'town',
  async build(ctx) {
    // build geometry once; return handles
    return {
      group,                       // THREE.Group added to the scene by the core
      update(frame, info, ctx) {}, // called every frame BEFORE rendering. Must be a pure function of frame.
      colliders: {
        static: [mesh, ...],       // town only: steps, ground, walls, gate, houses (used by the BVH checker)
        bodies: [ { name: 'fox', parts: [mesh, ...] }, ... ], // characters & giant: parts that must not intersect
      },
      popAllowed: [mesh, ...],     // objects that may legitimately appear/vanish mid shot (debris spawn, steam puffs)
    };
  },
};
```

`info` = `{ frame, t (seconds), shot, shotId, local, dur, localT }` from `shared/shots.json`.

`ctx` provides: `THREE`, `MAP` (everything in map.js), `ID`, `LAYER`, `scene`, `camera`, `sun`, `post` (`post.flash`, `post.fade` 0..1, FX writes `flash`), `makeCel`, `makeFlat`, `setOpacity`, `tag`, `anchors` (writable anchor overrides, e.g. `ctx.anchors.hareHead = [x,y,z]`), `frameInfo(frame)`, `cameraState(frame)`.

### Materials (mandatory)
* `ctx.makeCel({ color, shade, map, emissive, emissiveIntensity, bandEdge, bandSoft, wobble, side, opacity })` for every lit surface. `color` is the lit colour, `shade` the painted shadow colour (use `MAP.PALETTE`). Never use MeshStandard/Phong/Lambert.
* `ctx.makeFlat({ color, map, alphaTest })` for unlit things: eyes, the glowing slit, glow discs.
* Opacity is dithered (screen door). `ctx.setOpacity(meshOrGroup, v)` sets it; a material must then not be shared with objects that need a different opacity.
* Eye textures etc. are drawn on a `<canvas>` and used as `CanvasTexture` with `colorSpace = THREE.SRGBColorSpace`.
* No SkinnedMesh. Build figures as Object3D hierarchies (FK joints). InstancedMesh is allowed (crowd, houses).

### Tagging (mandatory)
`ctx.tag(object, { inkId, layer, castShadow, receiveShadow })` on every mesh or group:
* `layer`: `LAYER.BG` for town/terrain/sky-scale scenery (gets the painted gouache pass), `LAYER.FG` for characters, giant, automatons and all FX (crisp cel + ink). Falling debris, boulders, broken gate pieces and the falling facade slabs are FG.
* `inkId`: from `MAP.ID`. One id per character (1..99). Giant plates cycle 100..119 so neighbouring plates get a line. Houses cycle 200..239. FX ids as listed.
* Give meshes a `name` (used by the pop checker and for debugging).

### Animation rules
* Pure function of `frame`: no state carried between calls, no `Math.random` (use `MAP.hash1/hash2/mulberry32` with fixed seeds). Render workers jump between frames.
* Characters animate on 2s: compute poses from `MAP.hold(frame, 2)`. Camera is on 1s (core). Falling debris is on 1s. Giant on 2s with smear-free holds; steam on 2s.
* Nothing may pop in or out mid shot unless listed in `popAllowed`. Hide things by `visible = false` at shot boundaries only (use `info.shotId`).
* Anchors: characters must put heads within 10 cm of `MAP.ANCHORS.*` for shots that frame them (4, 13, 30, 31). For 30 and 31 the hare stands at the top of the steps; set `ctx.anchors.hareHead` each frame in those shots.
* Clearance: feet rest 1 cm above surfaces (`MAP.stepTopY`, `MAP.groundY`), never inside. Bodies must not interpenetrate. The checker fails the render otherwise.

### Look rules
* Big anime eyes: large almond or round sclera, iris with two-tone gradient, big pupil, two highlights; dark upper lid line. Animal muzzles small. Hands are mitten-like with 4 fingers.
* Hard shadow shapes only. Flat colours. No gradients on cel surfaces, no PBR speculars.
* Ink: the core draws lines from ids, depth and normals. Model crease edges honestly (separate parts, sharp angles) and the lines will appear. Do not draw lines yourself.
* Steam and dust are inked billows: clusters of overlapping spheres (10..40) with `makeCel` steam/dust palette, `LAYER.FG`, `ID.STEAM`/`ID.DUST`, growing and rising on 2s, fading with dithered opacity.
* Palette discipline: use `MAP.PALETTE`. Walls white/sand with violet shadows, cobalt doors and shutters, turquoise domes, sandstone wall, bronze gate and sun, verdigris giant with gold edges, cyan slit.

### Testing
`node tools/preview.js out/<name> <frame> <frame> ... [--scale=0.5] [--depts=town,fx]` renders PNGs through the real pipeline (loads only the departments you name; the others are stubs). Look at every frame you render. Check your shots' frames from `shared/shots.json`. Do not run the full render.

## Sound department
Works in `sound/` only. Reads samples from the CC0 VSCO2 CE library (path given in the brief), writes `out/score.wav` (48 kHz stereo, 77.5 s, peak -1 dBFS) with `node sound/render.js`. Pure node (no browser). The cue sheet is in `shared/shots.json` (`cue` fields) and `MAP.T`.
