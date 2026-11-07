# Gate of the Sun

A 77.5 second hand-drawn-looking 2D anime short, built entirely in three.js (WebGL2), rendered
headless in Chromium with a painted-background brush pass and an ink pass, scored with CC0
orchestral samples and encoded with ffmpeg. One 1920x1080, 24 fps MP4.

The scene retells the breach-of-the-wall sequence from the first episode of a well known anime shot
for shot (31 shots, the same actions, staging, lens feel and timing) with every visual redesigned
from scratch: a sun-bleached hill town of anthropomorphic animals and a 90 m bronze automaton.

## Pipeline

```
shared/map.js        world coordinates, anchors, event frames, palette, ink ids, helpers
shared/shots.json    31 shots: frame ranges, camera keys, lens, shake, haze, cue notes
shared/DEPARTMENTS.md  the contract every department follows

src/core/            renderer and look
  materials.js       cel (toon) material with hard cool shadows + paired data material
  sky.js             painted cobalt sky and hard edged cumulus with lavender undersides
  camera.js          camera rig: eased keys, anchors, bounded shake
  passes.js          Kuwahara brush pass (background), compositor with ink pass, haze, flash, fade
  app.js             layered render: data pass -> painted BG -> cel FG -> composite
  check.js           BVH geometry checks (three-mesh-bvh)

src/departments/     one folder per department, each owning its files
  town/  giant/  characters/  fx/
sound/               offline sampler and score renderer (node only)

tools/
  preview.js         render chosen frames to PNG for review
  render.js          parallel headless render of all frames
  check.js           per frame checks: intersections, camera inside mesh / below ground, jerks, pops
  encode.sh          ffmpeg mux of frames and score
```

### How a frame is drawn
1. Data pass: every mesh swaps to a data material that writes view-space normal and an object id.
   Depth comes from the depth texture. The sun shadow map is rendered once here.
2. Background pass (layer BG, half resolution): sky shader, then the town, wall, terrain, mountains
   in cel materials. A Kuwahara filter turns it into flat gouache-like strokes; paper grain is added
   in the composite.
3. Foreground pass (layer FG, full resolution): characters, giant, automatons, FX in cel materials
   with hard shadows and a flat cool shadow colour.
4. Composite: depth-combines FG over BG, applies aerial perspective and (after the kick) ochre dust
   haze, then draws ink: edges from id changes, depth discontinuities and normal creases, weighted
   by distance and coloured per class (warm dark for characters, deep teal for the automaton, soft
   sienna for the background), with a static hand wobble per shot. Flash and fade to black last.

Characters and effects animate on 2s (12 drawings per second), the camera on 1s, in the manner of
hand-drawn production.

## Running

```
npm install
node tools/preview.js out/preview 20 270 800 1113      # look at frames
node tools/check.js                                    # geometry checks on every frame
node tools/render.js --workers=2                       # all 1860 frames to out/frames
node sound/render.js                                   # out/score.wav
tools/encode.sh                                        # out/gate_of_the_sun.mp4
```

Chromium runs with SwiftShader (software WebGL2); a frame takes a few seconds.

## Sound
Real orchestral samples from the VSCO 2 Community Edition library (CC0) drive a small sampler in
node: strings, brass, woodwinds, harp, timpani, bass drum, snare, anvil, cymbals. The choir, the
heartbeat, the ringing after the flash, wind, steam hiss and the metallic footsteps are synthesised.
See `sound/README.md`.
