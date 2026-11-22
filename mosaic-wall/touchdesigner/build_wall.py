# ============================================================
# AI VIDEO MOSAIC WALL — TouchDesigner auto-build (2023 builds and later)
# ============================================================
# 1. Open TouchDesigner with a NEW project (File > New) and save it.
# 2. Tab > DAT > Text to create a Text DAT.
# 3. Paste ALL of this file into it.
# 4. Edit MOSAIC_DIR below to the mosaic-wall folder on this MacBook.
# 5. With the Text DAT selected press Cmd+R (Mac) / Ctrl+R (Win).
# 6. Go into /project1/wall and press H. Then follow touchdesigner/README.md ("After the build").
# Running it again rebuilds /project1/wall from scratch.
# ============================================================

MOSAIC_DIR = '/Users/CHANGE_ME/miradore/mosaic-wall'   # <- edit this line

import os

SERVER = os.path.join(MOSAIC_DIR, 'server')
TD_DIR = os.path.join(MOSAIC_DIR, 'touchdesigner')
warnings = []


def setp(node, names, value):
    """Set the first parameter that exists from a list of candidate names. Notes a warning if none do."""
    for name in ([names] if isinstance(names, str) else names):
        par = getattr(node.par, name, None)
        if par is not None:
            try:
                par.val = value
                return par
            except Exception as e:
                warnings.append('{}.par.{} = {!r} failed: {}'.format(node.name, name, value, e))
                return None
    warnings.append('{}: no parameter named {}'.format(node.name, names))
    return None


def expr(node, names, expression):
    for name in ([names] if isinstance(names, str) else names):
        par = getattr(node.par, name, None)
        if par is not None:
            par.expr = expression
            par.mode = ParMode.EXPRESSION
            return par
    warnings.append('{}: no parameter named {}'.format(node.name, names))
    return None


def make(parent_comp, op_type, name, x, y):
    node = parent_comp.create(op_type, name)
    node.nodeX, node.nodeY = x, y
    return node


def wire(src, dst, index=0):
    dst.inputConnectors[index].connect(src.outputConnectors[0])


def text_dat(parent_comp, name, x, y, text=None, file_path=None):
    dat = make(parent_comp, textDAT, name, x, y)
    if file_path:
        if os.path.isfile(file_path):
            with open(file_path) as f:
                dat.text = f.read()
            setp(dat, 'file', file_path)
            setp(dat, 'syncfile', True)   # edits to the .py file on disk reload on their own
        else:
            warnings.append('missing file {} (is MOSAIC_DIR right?)'.format(file_path))
    elif text is not None:
        dat.text = text
    return dat


def full_res(node):
    """Give a TOP the wall's output resolution."""
    setp(node, 'outputresolution', 'custom')
    expr(node, 'resolutionw', "parent().par.Resw")
    expr(node, 'resolutionh', "parent().par.Resh")


root = op('/project1')
old = root.op('wall')
if old is not None:
    old.destroy()
w = make(root, baseCOMP, 'wall', 0, -200)

# ------------------------------------------------------------ custom parameters

page = w.appendCustomPage('Wall')
page.appendFolder('Serverfolder', label='Server Folder')[0].val = SERVER
page.appendFile('Brandclip', label='Brand Clip (empty cells)')
page.appendFile('Targetimage', label='Target Image (reveal)')
for name, label, value in (('Cols', 'Columns', 10), ('Rows', 'Rows', 10), ('Resw', 'Output Width', 1920), ('Resh', 'Output Height', 1080)):
    par = page.appendInt(name, label=label)[0]
    par.val = par.default = value
    par.normMin, par.normMax, par.min, par.clampMin = 1, (40 if name in ('Cols', 'Rows') else 3840), 1, True
for name, label, value in (('Gap', 'Gap Between Tiles', 0.04), ('Heroseconds', 'Hero Seconds', 3.0), ('Landseconds', 'Land Seconds', 1.0)):
    par = page.appendFloat(name, label=label)[0]
    par.val = par.default = value
for name, label in (('Reveal', 'Reveal'), ('Shuffle', 'Shuffle'), ('Pausenew', 'Pause New'), ('Blackout', 'Blackout'), ('Rescan', 'Rescan Folder')):
    page.appendPulse(name, label=label)
for name, label in (('Paused', 'New Tiles Paused'), ('Blackedout', 'Blacked Out')):
    page.appendToggle(name, label=label)[0].readOnly = True

page = w.appendCustomPage('Reveal')
for name, label, value in (('Revealin', 'Fly In Seconds', 5.0), ('Revealhold', 'Hold Seconds', 8.0), ('Revealout', 'Return Seconds', 3.0),
                           ('Targetoverlay', 'Target Overlay', 0.25), ('Tintreused', 'Tint Reused Tiles', 0.7), ('Tintall', 'Tint All Tiles', 0.35)):
    par = page.appendFloat(name, label=label)[0]
    par.val = par.default = value

page = w.appendCustomPage('Advanced')
page.appendToggle('Atlasmode', label='Atlas Mode (Step 4b)')
page.appendToggle('Logperf', label='Log FPS To perf_log.csv')[0].val = True
page.appendInt('Oscport', label='OSC In Port')[0].val = 7000

# ------------------------------------------------------------ code

text_dat(w, 'wall_ext', -1000, 600, file_path=os.path.join(TD_DIR, 'wall_ext.py'))
text_dat(w, 'mosaic_assign', -1000, 500, file_path=os.path.join(TD_DIR, 'mosaic_assign.py'))

WALL = "parent().op('wall_ext').module.wall(parent())"

# ------------------------------------------------------------ tile intake: Folder DAT -> table -> Replicator

folder = make(w, folderDAT, 'folder1', -1000, 300)
expr(folder, 'rootfolder', "parent().par.Serverfolder.eval() + '/tiles'")
setp(folder, 'extensions', 'mov')

folder_exec = make(w, datexecuteDAT, 'folder_exec', -800, 300)
setp(folder_exec, 'dat', 'folder1')
setp(folder_exec, 'tablechange', True)
folder_exec.text = "def onTableChange(dat):\n\t" + WALL + ".rescan()\n\treturn\n"

tiles = make(w, tableDAT, 'tiles', -600, 300)
tiles.clear()
tiles.appendRow(['name', 'path'])

master = make(w, moviefileinTOP, 'tile_master', -400, 400)
setp(master, 'play', True)
master.bypass = True  # only its copies play

rep_cb = text_dat(w, 'rep_callbacks', -400, 200, text=(
    "def onRemoveReplicant(comp, replicant):\n"
    "\treplicant.destroy()\n"
    "\treturn\n\n"
    "def onReplicate(comp, allOps, newOps, template, master):\n"
    "\tfor c in newOps:\n"
    "\t\tc.bypass = False\n"
    "\t\tc.par.file = template[c.name, 'path'].val\n"
    "\t\tc.par.play = True\n"
    "\treturn\n"))

rep = make(w, replicatorCOMP, 'replicator1', -400, 300)
setp(rep, 'template', 'tiles')
setp(rep, 'namefromtable', 'name')      # operator name = first column (t_<tile name>)
setp(rep, 'ignorefirstrow', True)
setp(rep, 'opprefix', '')
setp(rep, 'master', 'tile_master')
setp(rep, 'destination', '..')          # copies sit next to the replicator, inside wall
setp(rep, 'domaxops', False)
setp(rep, 'callbacks', 'rep_callbacks')

brand = make(w, moviefileinTOP, 'brand', -1000, 0)
expr(brand, 'file', "parent().par.Brandclip")
setp(brand, 'play', True)
brand_fit = make(w, resolutionTOP, 'brand_fit', -800, 0)   # same size as the tiles, so they share one texture array
wire(brand, brand_fit)
setp(brand_fit, 'outputresolution', 'custom')
setp(brand_fit, 'resolutionw', 320)
setp(brand_fit, 'resolutionh', 320)

# ------------------------------------------------------------ one-pass instanced render

inst_cb = text_dat(w, 'inst_callbacks', -600, -200, text=(
    "def onSetupParameters(scriptOp):\n\treturn\n\n"
    "def onCook(scriptOp):\n\t" + WALL + ".fill_chop(scriptOp)\n\treturn\n"))
inst = make(w, scriptCHOP, 'inst', -400, -200)
setp(inst, 'callbacks', 'inst_callbacks')

geo = make(w, geometryCOMP, 'geo', -200, -200)
for child in geo.children:
    child.destroy()
grid = make(geo, gridSOP, 'tile', 0, 0)
setp(grid, 'orient', 'xy')
setp(grid, 'sizex', 1)
setp(grid, 'sizey', 1)
setp(grid, 'rows', 2)
setp(grid, 'cols', 2)
grid.render = True
grid.display = True

mat = make(w, constantMAT, 'tile_mat', -200, -350)
setp(mat, 'colormap', 'brand_fit')
setp(geo, 'material', 'tile_mat')

setp(geo, 'instancing', True)
setp(geo, 'instanceop', 'inst')
for par_name, chan in (('instancetx', 'tx'), ('instancety', 'ty'), ('instancetz', 'tz'), ('instancesx', 'sx'), ('instancesy', 'sy'),
                       ('instancer', 'r'), ('instanceg', 'g'), ('instanceb', 'b')):
    setp(geo, par_name, chan)
setp(geo, ['instancetexindexop', 'instancetexop'], 'inst')
setp(geo, 'instancetexindex', 'tex')
setp(geo, ['instancetexs', 'instancetextures'], w.path + '/brand_fit')

cam = make(w, cameraCOMP, 'cam', -200, -50)
setp(cam, 'projection', 'ortho')
expr(cam, 'orthowidth', "parent().par.Resw / parent().par.Resh")   # view is 1 unit high
setp(cam, 'tz', 5)

render = make(w, renderTOP, 'render', 0, -200)
setp(render, 'camera', 'cam')
setp(render, 'geometry', 'geo')
setp(render, 'lights', '')
full_res(render)

# ------------------------------------------------------------ layers: atlas (4b) under the tiles, hero and reveal overlay on top

atlas = make(w, moviefileinTOP, 'atlas', -200, -550)
setp(atlas, 'play', True)
atlas_xf = make(w, transformTOP, 'atlas_xf', 0, -550)
wire(atlas, atlas_xf)
full_res(atlas_xf)
atlas_level = make(w, levelTOP, 'atlas_level', 200, -550)
wire(atlas_xf, atlas_level)
setp(atlas_level, 'opacity', 0)

over_atlas = make(w, overTOP, 'over_atlas', 400, -200)
wire(render, over_atlas, 0)
wire(atlas_level, over_atlas, 1)

hero = make(w, moviefileinTOP, 'hero', 0, 150)
hero_fit = make(w, fitTOP, 'hero_fit', 200, 150)
wire(hero, hero_fit)
full_res(hero_fit)
hero_level = make(w, levelTOP, 'hero_level', 400, 150)
wire(hero_fit, hero_level)
setp(hero_level, 'opacity', 0)

over_hero = make(w, overTOP, 'over_hero', 600, -200)
wire(hero_level, over_hero, 0)
wire(over_atlas, over_hero, 1)

target = make(w, moviefileinTOP, 'target', 0, 450)
expr(target, 'file', "parent().par.Targetimage")
target_bg = make(w, constantTOP, 'target_bg', 0, 550)       # logo transparency reads as black for colour matching
for par_name in ('colorr', 'colorg', 'colorb'):
    setp(target_bg, par_name, 0)
setp(target_bg, 'alpha', 1)
target_flat = make(w, overTOP, 'target_flat', 200, 500)
wire(target, target_flat, 0)
wire(target_bg, target_flat, 1)
target_res = make(w, resolutionTOP, 'target_res', 400, 500)  # one pixel per cell = each cell's average colour
wire(target_flat, target_res)
setp(target_res, 'outputresolution', 'custom')
expr(target_res, 'resolutionw', "parent().par.Cols")
expr(target_res, 'resolutionh', "parent().par.Rows")
target_cells = make(w, nullTOP, 'target_cells', 600, 500)
wire(target_res, target_cells)

target_xf = make(w, transformTOP, 'target_xf', 200, 350)
wire(target, target_xf)
full_res(target_xf)
target_level = make(w, levelTOP, 'target_level', 400, 350)
wire(target_xf, target_level)
setp(target_level, 'opacity', 0)

over_target = make(w, overTOP, 'over_target', 800, -200)
wire(target_level, over_target, 0)
wire(over_hero, over_target, 1)

black_level = make(w, levelTOP, 'black_level', 1000, -200)
wire(over_target, black_level)
out = make(w, nullTOP, 'out', 1200, -200)
wire(black_level, out)
out.viewer = True

# ------------------------------------------------------------ control: frame tick, pulses, OSC, fps log

tick = make(w, executeDAT, 'tick', -1000, -500)
setp(tick, 'framestart', True)
setp(tick, 'active', True)
tick.text = "def onFrameStart(frame):\n\t" + WALL + ".tick()\n\treturn\n"

parexec = make(w, parameterexecuteDAT, 'parexec', -800, -500)
setp(parexec, 'op', '..')
setp(parexec, 'pars', '*')
setp(parexec, 'onpulse', True)
setp(parexec, 'valuechange', True)
parexec.text = (
    "def onPulse(par):\n\t" + WALL + ".on_pulse(par.name)\n\treturn\n\n"
    "def onValueChange(par, prev):\n"
    "\tif par.name in ('Cols', 'Rows', 'Resw', 'Resh', 'Gap'):\n\t\t" + WALL + ".layout()\n"
    "\telif par.name == 'Atlasmode':\n\t\t" + WALL + ".check_atlas()\n\t\t" + WALL + ".sync_when_idle()\n"
    "\treturn\n")

osc = make(w, oscinDAT, 'oscin1', -600, -500)
expr(osc, 'port', "parent().par.Oscport")
osc_cb = text_dat(w, 'oscin1_callbacks', -600, -600, text=(
    "def onReceiveOSC(dat, rowIndex, message, byteData, timeStamp, address, args, peer):\n\t"
    + WALL + ".on_osc(address)\n\treturn\n"))
setp(osc, 'callbacks', 'oscin1_callbacks')

perf = make(w, performCHOP, 'perf', -400, -500)

# ------------------------------------------------------------ done

debug('MOSAIC WALL BUILT in /project1/wall')
if warnings:
    debug('Fix these by hand (see touchdesigner/README.md, "If the build prints warnings"):')
    for line in warnings:
        debug('  - ' + line)
else:
    debug('No warnings. Next: set Brand Clip and Target Image on the wall COMP, then point a Window COMP at wall/out.')
