# The wall in TouchDesigner (Steps 4, 4b, 5)

Not yet run inside TouchDesigner. The logic passes a simulation (`python3 test_wall_sim.py`) and the reveal maths passes its tests (`python3 test_mosaic_assign.py`), but operator and parameter names can differ between TD builds, so expect to fix a few by hand on the first build. The build script lists every one it could not set.

## Build

1. New project, save it. Tab > DAT > Text.
2. Paste all of `build_wall.py` into the Text DAT. Edit the `MOSAIC_DIR` line to this MacBook's path.
3. Select the Text DAT, press Cmd+R. Open the Textport (Alt+T) to read the result.
4. Go into `/project1/wall`, press H.

## After the build

On the `wall` COMP, page **Wall**:

- **Brand Clip**: the looping clip for empty cells. It starts as `assets/brand-tile.mov`, a glazed lapis tile that catches a slow band of light.
- **Target Image**: starts as `assets/target-placeholder.png`, a stand-in gold "M". Replace it with the real Miradore Labs logo, in gold and bone on the lapis ground (#0E1B33). Make it the same shape as the grid (10 x 10 grid: a square image), because it is stretched over the grid.
- **Columns / Rows**: the grid. **Output Width / Height**: the screen's native resolution from Step 0.

Use the Commercial TouchDesigner licence (Miradore has one). Non-Commercial caps output at 1280 x 1280, so check the licence is active on the playback machine before the event.

Then add a Window COMP, set its Operator to `wall/out`, pick the office screen as the monitor, and open it in Perform mode.

Start the server (`npm start` in `server/`). Tiles already in `server/tiles/` appear in their cells straight away. Each newly approved clip plays full screen for 3 seconds, then flies into the next free cell over 1 second. When the wall is full, the oldest tile gives up its cell.

The look and motion to match are in `wall-look.html` (open it in a browser): lapis ground showing as grout between tiles, a gold-leaf ring around each tile as it lands, a settle at the end of the landing, and a slow shimmer across the wall every 14 seconds when nothing else is happening. Grout Gap, Idle Shimmer and Gold Ring Hold are parameters on the `wall` COMP. `python3 make_assets.py` remakes the two starter assets.

## Controls

Pulses on the `wall` COMP, also reachable by OSC on port 7000:

| OSC address | Pulse | What it does |
|---|---|---|
| `/reveal` | Reveal | Tiles fly into the logo (5 s), hold 8 s with the logo overlaid at 25 percent, return (3 s) |
| `/shuffle` | Shuffle | Tiles swap cells over 1 s |
| `/pause` | Pause New | Toggles. While on, approved clips wait instead of playing their hero |
| `/blackout` | Blackout | Toggles the output to black |

Stream Deck: in Companion add a "Generic OSC" connection to `127.0.0.1` port `7000`, then four buttons each with the action "Send message without arguments" and the paths above.

## If the build prints warnings

Each warning names an operator and a parameter it could not find. The ones most likely to differ between builds, with where to set them by hand:

- **geo, Instance page**: Instancing On; Default Instance OP `inst`; Translate X/Y/Z `tx ty tz`; Scale X/Y `sx sy`.
- **geo, Instance 2 page**: Color R/G/B `r g b`; Instance Textures (the wall fills this in itself, starting with `brand_fit`); Texture Index OP `inst`, Texture Index `tex`.
- **replicator1**: Replication Method: By Table; Template Table `tiles`; Name from Table: Column Name, Column Name `name`; Ignore First Row On; Master Operator `tile_master`; Callbacks `rep_callbacks`. Copies must appear inside `wall` named `t_<tile name>`.
- **cam**: Projection Orthographic, Ortho Width = output width / output height, Translate Z 5.
- **tile_master, brand, hero, atlas** (Movie File In): Play Mode Sequential. If it is Locked to Timeline, tiles jump when the timeline loops and heroes start mid-clip.
- **geo/tile** (Grid SOP): middle-click it; if there is no `uv` attribute, set Texture Coordinates to Rows & Columns.
- **atlas_xf, target_xf** (Transform TOP): Extend Zero. **target_res**: Input Smoothness Mipmap Pixels.
- **folder1**: Root Folder = `server/tiles`, extension `mov`. If the Folder DAT gives trouble the wall falls back to listing the folder itself once a second.
- **tick** (Execute DAT): Frame Start On. **parexec**: OP `..`, Parameters `*`, On Pulse and Value Change On.

## Step 4 check

1. `npm run test-tiles -- 100` in `server/` to copy the 10 real tiles up to 100.
2. Dialogs > Performance Monitor: the wall holds 60 fps. `server/data/perf_log.csv` also logs fps every 10 s.
3. Approve one new clip: hero for 3 s, then it lands in its cell.
4. All four Stream Deck keys work.
5. Below 50 fps, try these first: Perform mode (not the network editor), mains power, the screen at 60 Hz, Render TOP anti-alias at 1x or 2x. Still below 50: go to Step 4b.

The hero clip is 4:5, so on a 16:9 screen it plays with the wall visible either side. To make it cover the whole screen (cropping top and bottom), set Fit to Fill on `hero_fit`.

## Step 4b, only if needed

In `server/` run `npm run bake-atlas -- --cols 10 --rows 10 --watch` (match the wall's grid), then switch on **Atlas Mode** (Advanced page). Every 2 minutes all tiles are baked into one looping HAP movie; baked tiles stop playing individually and show from the atlas. New clips still arrive live as hero plus single tile until the next bake.

Limits: Reveal and Shuffle need live tiles, so they are refused while Atlas Mode is on and tiles are baked. Switch Atlas Mode off, wait 5 seconds, then run them. The atlas is 2160 px high for a 10 x 10 grid (216 px per tile).

## Step 5: scipy

TouchDesigner does not ship scipy. Without it the reveal still runs, using a simpler greedy match (a line in the Textport says so). To get the exact match the plan asks for:

1. In TD's Textport: `import sys; print(sys.version)` to see TD's Python version (for example 3.11).
2. In Terminal, with the same Python version: `python3.11 -m pip install --target ~/td-python scipy`
3. In TD: Edit > Preferences > DATs > "Python 64-bit Module Path" = that folder. Restart TD.

Tile colours come from `server/data/tile_colors.csv`, which the server writes when a clip is approved (average colour of the tile's middle frame).

Check: with 100 tiles the logo reads from 5 metres; run Reveal 5 times in a row without a stutter. If the logo is hard to read, raise **Tint All Tiles** or **Target Overlay** on the Reveal page, or use more, smaller cells.
