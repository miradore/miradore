"""Mosaic wall logic for TouchDesigner (2023 builds and later).

Lives in a Text DAT called wall_ext inside the wall COMP that build_wall.py creates. The small callback DATs
(frame start, folder change, pulses, OSC, Script CHOP) all call wall(parent()) to reach the one Wall object.

How the picture is made: one Geometry COMP draws COLS x ROWS instanced squares in a single render pass.
A Script CHOP feeds it one sample per cell (position, scale, texture index, tint) plus one extra "flyer"
sample used for the tile that is landing and one for the gold-leaf ring behind it. Texture index 0 is the brand
clip, 1 is gold leaf, 2 onwards are the tile movies.

The look is "Tessera": glazed tiles with grout gaps on a lapis ground, gold leaf for the tile that has just
arrived, a slow shimmer across the wall when nothing else is happening."""
import os
import re
import time
import random

import numpy as np

# Channel order in the instance CHOP. The Geometry COMP's instance parameters refer to these names.
CHANNELS = ['tx', 'ty', 'tz', 'sx', 'sy', 'tex', 'r', 'g', 'b']
TX, TY, TZ, SX, SY, TEX, R, G, B = range(9)

_walls = {}


def wall(comp):
    """The Wall object for this COMP. Rebuilt on its own when this file is edited and reloads."""
    w = _walls.get(comp.path)
    if w is None:
        w = _walls[comp.path] = Wall(comp)
    return w


def ease_out(t):
    return 1.0 - (1.0 - t) ** 3


def ease_settle(t):
    """Ease out with a small overshoot, so a landing tile presses into its cell and settles."""
    c1 = 1.70158
    return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2


FIRST_TILE_TEX = 2   # 0 brand clip, 1 gold leaf
RING = 1.14          # gold ring is this much larger than the tile it frames


def ease_in_out(t):
    return 4 * t * t * t if t < 0.5 else 1 - ((-2 * t + 2) ** 3) / 2


def safe_name(filename):
    """Tile file name to an operator-safe name: abc123.mov -> abc123"""
    return re.sub(r'[^A-Za-z0-9_]', '_', os.path.splitext(filename)[0])


class Wall:
    def __init__(self, comp):
        self.comp = comp
        self.cell_name = []        # for each cell: the tile shown there, or None
        self.paths = {}            # tile name -> .mov path, for tiles on the wall
        self.order = []            # tile names, oldest first (the oldest is replaced when the wall is full)
        self.retired = set()       # tiles pushed off a full wall; ignored if the folder still lists them
        self.baked = set()         # tiles currently inside the Step 4b atlas
        self.queue = []            # (name, path) waiting for their hero moment
        self.jobs = []             # (due time, function)
        self.tween = None
        self.busy = False          # a hero, landing, shuffle or reveal is running
        self.paused = False
        self.black = False
        self.first_scan = True
        self.live = []             # tile names that have a Movie File In TOP, in texture order
        self.arr = np.zeros((len(CHANNELS), 1), dtype=np.float32)
        self.last = {'scan': 0.0, 'atlas': 0.0, 'perf': 0.0, 'frames': 0, 'atlas_mtime': 0.0}
        self.filling = False
        self.wave = None           # start time of the shimmer that is crossing the wall, if any
        # This object starts clean, so put the operators back to clean too. After a file reload or reopening the
        # project they may still hold a hero on screen, a reveal overlay or a blackout from before.
        self.set_par('hero_level', 'opacity', 0.0)
        self.set_par('target_level', 'opacity', 0.0)
        self.set_par('black_level', 'brightness1', 1.0)
        self.show_state()
        self.layout()

    # ------------------------------------------------------------------ parameters and paths

    def p(self, name, default=None):
        par = getattr(self.comp.par, name, None)
        return default if par is None else par.eval()

    @property
    def cols(self):
        return max(1, int(self.p('Cols', 10)))

    @property
    def rows(self):
        return max(1, int(self.p('Rows', 10)))

    @property
    def n(self):
        return self.cols * self.rows

    def folder(self, *parts):
        return os.path.join(str(self.p('Serverfolder', '')), *parts)

    def o(self, name):
        return self.comp.op(name)

    def set_par(self, op_name, par_name, value):
        """Set a parameter if both the operator and the parameter exist. Keeps one missing name from stopping the wall."""
        target = self.o(op_name)
        par = getattr(target.par, par_name, None) if target is not None else None
        if par is None:
            return False
        try:
            par.val = value
            return True
        except Exception as e:
            debug('wall: could not set {}.{}: {}'.format(op_name, par_name, e))
            return False

    def pulse(self, op_name, par_name):
        target = self.o(op_name)
        par = getattr(target.par, par_name, None) if target is not None else None
        if par is not None:
            par.pulse()

    # ------------------------------------------------------------------ layout

    def layout(self):
        """Work out cell positions. Units: screen height is 1, screen width is the aspect ratio."""
        if self.busy:  # never pull the grid out from under a hero, landing or reveal
            return self.later(0.5, self.layout)
        cols, rows, n = self.cols, self.rows, self.n
        aspect = float(self.p('Resw', 1920)) / max(1.0, float(self.p('Resh', 1080)))
        self.cell = min(aspect / cols, 1.0 / rows)
        self.size = self.cell * (1.0 - float(self.p('Gap', 0.1)))
        idx = np.arange(n)
        self.home = np.stack([
            ((idx % cols) + 0.5 - cols / 2.0) * self.cell,
            (rows / 2.0 - (idx // cols) - 0.5) * self.cell,
        ], axis=1).astype(np.float32)

        # Keep the tiles that still fit, in their old order.
        keep = [name for name in self.cell_name if name][:n] if len(self.cell_name) != n else None
        if keep is not None:
            dropped = set(self.order) - set(keep)
            self.retired |= dropped
            self.order = [name for name in self.order if name in keep]
            self.paths = {k: v for k, v in self.paths.items() if k in keep}
            self.cell_name = keep + [None] * (n - len(keep))

        # n cells, then the flyer (index n) and its gold ring (index n + 1)
        self.arr = np.zeros((len(CHANNELS), n + 2), dtype=np.float32)
        self.arr[R:B + 1] = 1.0
        self.arr[TX:TY + 1, :n] = self.home.T
        self.arr[TZ, n] = 0.5      # the flyer draws in front of the grid
        self.arr[TZ, n + 1] = 0.4  # its ring sits just behind it
        self.arr[TEX, n + 1] = 1   # gold leaf
        self.wave = None
        self.tween = None

        # The atlas and the reveal overlay are stretched over the grid area, which may be smaller than the screen.
        for name in ('atlas_xf', 'target_xf'):
            self.set_par(name, 'sx', cols * self.cell / aspect)
            self.set_par(name, 'sy', rows * self.cell)
        self.sync()

    def sync(self):
        """Rebuild the replicator table, the texture list and each cell's texture index from cell_name."""
        atlas = bool(self.p('Atlasmode', False))
        self.live = [name for name in self.order if not (atlas and name in self.baked)]
        table = self.o('tiles')
        if table is not None:
            want = [['name', 'path']] + [['t_' + name, self.paths[name]] for name in self.live]
            have = [[c.val for c in row] for row in table.rows()]
            if want != have:
                table.clear()
                for row in want:
                    table.appendRow(row)
        geo = self.o('geo')
        if geo is not None:
            tops = ['brand_fit', 'gold'] + ['t_' + name for name in self.live]
            texs = ' '.join(self.comp.path + '/' + t for t in tops)
            for par_name in ('instancetexs', 'instancetextures'):
                par = getattr(geo.par, par_name, None)
                if par is not None:
                    if par.eval() != texs:
                        par.val = texs
                    break
        index = {name: i + FIRST_TILE_TEX for i, name in enumerate(self.live)}
        n = self.n
        self.wave = None
        for cell in range(n):
            name = self.cell_name[cell]
            hidden = atlas and name in self.baked
            self.arr[TEX, cell] = index.get(name, 0)
            self.arr[SX:SY + 1, cell] = 0.0 if hidden else self.size
        self.arr[R:B + 1, :n] = 1.0
        self.arr[TX:TY + 1, :n] = self.home.T
        self.push()

    def push(self):
        chop = self.o('inst')
        if chop is not None and not self.filling:  # not while the CHOP itself is cooking
            chop.cook(force=True)

    def fill_chop(self, script_op):
        """Called from the Script CHOP's onCook."""
        self.filling = True
        try:
            script_op.clear()
            try:
                script_op.copyNumpyArray(self.arr)
                for i, name in enumerate(CHANNELS):
                    script_op[i].name = name
            except Exception:
                script_op.clear()
                script_op.numSamples = self.arr.shape[1]
                for i, name in enumerate(CHANNELS):
                    script_op.appendChan(name).vals = self.arr[i].tolist()
        finally:
            self.filling = False

    def write_cells(self):
        """data/cells.csv tells the Step 4b atlas baker which tile sits in which cell."""
        try:
            path = self.folder('data', 'cells.csv')
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path + '.tmp', 'w') as f:
                f.write('name,cell\n')
                for cell, name in enumerate(self.cell_name):
                    if name:
                        f.write('{},{}\n'.format(name, cell))
            os.replace(path + '.tmp', path)
        except Exception as e:
            debug('wall: could not write cells.csv: {}'.format(e))

    # ------------------------------------------------------------------ frame loop

    def tick(self):
        """Called every frame from the Execute DAT."""
        now = time.perf_counter()
        self.last['frames'] += 1

        while self.jobs and self.jobs[0][0] <= now:
            self.jobs.pop(0)[1]()

        tw = self.tween
        if tw is not None:
            t = min(1.0, (now - tw['t0']) / tw['dur'])
            k = tw['ease'](t)
            for ch, (a, b) in tw['chans'].items():
                self.arr[ch, tw['idx']] = a + (b - a) * k
            if 'overlay' in tw:
                a, b = tw['overlay']
                self.set_par('target_level', 'opacity', a + (b - a) * k)
            self.push()
            if t >= 1.0:
                self.tween = None
                if tw.get('done'):
                    tw['done']()

        self.shimmer(now)

        if now - self.last['scan'] > 1.0:
            self.last['scan'] = now
            self.rescan()
        if now - self.last['atlas'] > 5.0:
            self.last['atlas'] = now
            self.check_atlas()
        if now - self.last['perf'] > 10.0:
            self.log_perf(now)

    def shimmer(self, now):
        """When the wall is idle, a slow wave lifts each tile a little as it crosses from one corner to the other."""
        n = self.n
        if self.busy or self.tween is not None or not self.p('Shimmer', True):
            if self.wave is not None:
                self.wave = None
                self.arr[SX:SY + 1, :n] = np.where(self.arr[SX, :n] > 0, self.size, 0.0)
            return
        if self.wave is None:
            if now - self.last.get('shimmer', now - 1e9) < float(self.p('Shimmerevery', 14.0)):
                return
            self.wave = self.last['shimmer'] = now
        idx = np.arange(n)
        diag = ((idx % self.cols) + (idx // self.cols)) / max(1, self.cols + self.rows - 2)
        x = np.clip((now - self.wave) / 2.4 * 1.5 - diag, 0.0, 0.5) * 2.0   # each tile's own 0..1 progress
        lift = 1.0 + 0.09 * np.sin(np.pi * x)
        self.arr[SX:SY + 1, :n] = np.where(self.arr[SX, :n] > 0, self.size * lift, 0.0)
        self.push()
        if now - self.wave > 2.4:
            self.wave = None
            self.arr[SX:SY + 1, :n] = np.where(self.arr[SX, :n] > 0, self.size, 0.0)
            self.push()

    def later(self, seconds, fn):
        self.jobs.append((time.perf_counter() + seconds, fn))
        self.jobs.sort(key=lambda j: j[0])

    def animate(self, idx, chans, dur, ease, done=None, overlay=None):
        """Tween instance channels. chans maps a channel row to its end value(s); the start is whatever is there now."""
        idx = np.atleast_1d(np.asarray(idx, dtype=int))
        tw = {
            't0': time.perf_counter(), 'dur': max(0.01, float(dur)), 'ease': ease, 'idx': idx, 'done': done,
            'chans': {ch: (self.arr[ch, idx].copy(), np.asarray(end, dtype=np.float32)) for ch, end in chans.items()},
        }
        if overlay is not None:
            tw['overlay'] = overlay
        self.tween = tw

    # ------------------------------------------------------------------ tiles in and out

    def list_tiles(self):
        """(name, path) for every finished .mov in the tiles folder. Uses the Folder DAT, with a plain listing as backup."""
        def movs(files):
            return [(safe_name(f), self.folder('tiles', f)) for f in sorted(files)
                    if f.lower().endswith('.mov') and not f.startswith('.')]

        out = []
        dat = self.o('folder1')
        if dat is not None and dat.numRows > 1:
            head = [c.val for c in dat.row(0)]
            col = head.index('name') if 'name' in head else 0
            out = movs([dat[r, col].val for r in range(1, dat.numRows)])
        if not out:
            try:
                out = movs(os.listdir(self.folder('tiles')))
            except OSError:
                pass
        return out

    def rescan(self):
        self.pulse('folder1', 'refreshpulse')
        found = self.list_tiles()
        names = {name for name, _ in found}

        # Files deleted from the folder (purge, test clean-up) leave the wall.
        gone = [name for name in self.order if name not in names]
        if gone and not self.busy:
            for name in gone:
                self.remove(name)
            self.sync()
            self.write_cells()
        self.retired &= names

        queued = {name for name, _ in self.queue}
        fresh = [(name, path) for name, path in found
                 if name not in self.paths and name not in queued and name not in self.retired]
        if self.first_scan:
            # Tiles already there when the project opens go straight to their cells, no hero.
            self.first_scan = False
            for name, path in fresh:
                self.place(name, path, self.next_cell())
            self.sync()
            self.write_cells()
        else:
            self.queue.extend(fresh)
        self.pump()

    def next_cell(self):
        """First empty cell. If the wall is full, the oldest tile gives up its cell."""
        for cell, name in enumerate(self.cell_name):
            if name is None:
                return cell
        oldest = next(name for name in self.order if name in self.cell_name)
        cell = self.cell_name.index(oldest)
        self.remove(oldest)
        self.retired.add(oldest)
        return cell

    def place(self, name, path, cell):
        self.cell_name[cell] = name
        self.paths[name] = path
        self.order.append(name)

    def remove(self, name):
        if name in self.cell_name:
            self.cell_name[self.cell_name.index(name)] = None
        self.paths.pop(name, None)
        self.baked.discard(name)
        if name in self.order:
            self.order.remove(name)

    def pump(self):
        """Start the next waiting tile if nothing else is on stage."""
        if self.busy or self.paused or not self.queue:
            return
        name, path = self.queue.pop(0)
        self.busy = True
        n = self.n
        cell = self.next_cell()
        self.sync()  # drops a replaced tile now, so its cell shows the brand clip while the hero plays
        # Register the tile so its Movie File In TOP exists and is warm before it has to appear.
        self.paths[name] = path
        self.order.append(name)
        self.sync()

        hero = self.folder('hero', name + '.mp4')
        if os.path.isfile(hero):
            # Hold the new file on its first frame for a moment before showing it; otherwise the previous
            # guest's last frame flashes up while the file opens.
            self.set_par('hero', 'file', hero)
            self.set_par('hero', 'cue', True)
            self.set_par('hero', 'play', True)

            def show():
                self.set_par('hero', 'cue', False)
                self.set_par('hero_level', 'opacity', 1.0)

            self.later(0.3, show)
            self.later(0.3 + float(self.p('Heroseconds', 3.0)), lambda: self.land(name, cell))
        else:
            self.later(0.2, lambda: self.land(name, cell))

    def land(self, name, cell):
        """Hero off; the tile flies from full screen into its cell."""
        n = self.n
        self.set_par('hero_level', 'opacity', 0.0)
        self.set_par('hero', 'play', False)
        if name not in self.live:  # removed while the hero played
            return self.landed(name, cell)
        self.arr[TEX, n] = self.live.index(name) + FIRST_TILE_TEX
        self.arr[TX:TY + 1, n:n + 2] = 0.0
        self.arr[SX:SY + 1, n] = 1.0
        self.arr[SX:SY + 1, n + 1] = 1.0 + (RING - 1.0) * self.size   # same ring thickness as it will have in the cell
        x, y, size = self.home[cell, 0], self.home[cell, 1], self.size
        self.animate([n, n + 1], {
            TX: [x, x], TY: [y, y], SX: [size, size * RING], SY: [size, size * RING],
        }, self.p('Landseconds', 1.0), ease_settle, done=lambda: self.landed(name, cell))

    def landed(self, name, cell):
        n = self.n
        if name in self.paths and cell < n:
            if self.cell_name[cell] not in (None, name):  # the cell was taken meanwhile; find another
                cell = self.next_cell()
            self.cell_name[cell] = name
        self.arr[SX:SY + 1, n] = 0.0
        ring = self.arr[SX:SY + 1, n + 1].copy()
        self.sync()
        self.write_cells()
        self.arr[SX:SY + 1, n + 1] = ring

        # The gold ring holds around the new tile for a moment, then draws back behind it.
        def ring_gone():
            self.arr[SX:SY + 1, n + 1] = 0.0
            self.busy = False
            self.push()
            self.pump()

        def ring_out():
            self.animate([n + 1], {SX: [self.size * 0.9], SY: [self.size * 0.9]}, 0.5, ease_in_out, done=ring_gone)

        self.later(float(self.p('Ringhold', 0.8)), ring_out)

    # ------------------------------------------------------------------ operator actions

    def on_pulse(self, name):
        name = name.lower()
        if name == 'reveal':
            self.reveal()
        elif name == 'shuffle':
            self.shuffle()
        elif name == 'pausenew':
            self.paused = not self.paused
            self.show_state()
            self.pump()
        elif name == 'blackout':
            self.black = not self.black
            self.set_par('black_level', 'brightness1', 0.0 if self.black else 1.0)
            self.show_state()
        elif name == 'rescan':
            self.first_scan = not self.order
            self.rescan()

    def on_osc(self, address):
        action = {'/reveal': 'Reveal', '/shuffle': 'Shuffle', '/pause': 'Pausenew', '/blackout': 'Blackout'}.get(address.lower().rstrip('/'))
        if action:
            self.on_pulse(action)

    def show_state(self):
        for par_name, value in (('Paused', self.paused), ('Blackedout', self.black)):
            par = getattr(self.comp.par, par_name, None)
            if par is not None:
                par.val = value

    def can_move(self, what):
        if self.busy:
            debug('wall: {} ignored, something is already on stage'.format(what))
            return False
        if self.p('Atlasmode', False) and self.baked:
            debug('wall: {} needs live tiles. Turn Atlas Mode off first.'.format(what))
            return False
        return True

    def shuffle(self):
        if not self.can_move('Shuffle'):
            return
        n = self.n
        dest = list(range(n))
        random.shuffle(dest)
        self.busy = True

        def done():
            moved = [None] * n
            for src, dst in enumerate(dest):
                moved[dst] = self.cell_name[src]
            self.cell_name = moved
            self.busy = False
            self.sync()
            self.write_cells()
            self.pump()

        self.animate(np.arange(n), {TX: self.home[dest, 0], TY: self.home[dest, 1]}, 1.0, ease_in_out, done=done)

    # ------------------------------------------------------------------ Step 5: mosaic reveal

    def tile_colors(self):
        """name -> average RGB of the tile's middle frame, written by the server when a clip is approved."""
        out = {}
        try:
            with open(self.folder('data', 'tile_colors.csv')) as f:
                next(f)
                for line in f:
                    parts = line.strip().split(',')
                    if len(parts) == 4:
                        out[safe_name(parts[0])] = [float(v) for v in parts[1:]]
        except (OSError, StopIteration, ValueError):
            pass
        return out

    def cell_colors(self):
        """Average RGB of every cell of the target image: the image scaled down to COLS x ROWS pixels."""
        top = self.o('target_cells')
        if top is None:
            return None
        top.cook(force=True)  # nothing displays this TOP, so make sure it is current
        pixels = top.numpyArray()
        if pixels is None or pixels.shape[0] != self.rows or pixels.shape[1] != self.cols:
            return None
        return pixels[::-1, :, :3].reshape(-1, 3).astype(np.float64)  # row 0 of a TOP is the bottom row

    def reveal(self):
        if not self.can_move('Reveal'):
            return
        names = [name for name in self.order if name in self.cell_name]
        cells = self.cell_colors()
        if not names or cells is None:
            debug('wall: Reveal needs at least one tile and a Target Image')
            return
        assign_mod = self.o('mosaic_assign').module
        if not assign_mod.HAVE_SCIPY:
            debug('wall: scipy not found, using the greedy matcher (see README)')
        colors = self.tile_colors()
        tile_rgb = np.array([colors.get(name, [0.5, 0.5, 0.5]) for name in names])
        cell_tile, reused = assign_mod.assign(tile_rgb, cells)

        n = self.n
        home_of = {name: self.cell_name.index(name) for name in names}
        spare = [cell for cell in range(n) if self.cell_name[cell] is None]  # instances showing the brand clip
        dest = np.zeros(n, dtype=int)       # instance -> cell it flies to
        tex = self.arr[TEX, :n].copy()
        strength = np.zeros(n)
        index = {name: i + FIRST_TILE_TEX for i, name in enumerate(self.live)}
        for cell in range(n):
            name = names[cell_tile[cell]]
            if reused[cell] and spare:
                inst = spare.pop(0)             # a brand instance borrows this tile's picture
                tex[inst] = index.get(name, 0)
                strength[inst] = float(self.p('Tintreused', 0.7))
            else:
                inst = home_of[name]
                strength[inst] = float(self.p('Tintall', 0.35))
            dest[inst] = cell
        inst_rgb = np.array([tile_rgb[cell_tile[dest[i]]] for i in range(n)])
        tints = assign_mod.tint(inst_rgb, cells[dest], strength).astype(np.float32)

        self.busy = True
        every = np.arange(n)
        self.arr[TEX, :n] = tex
        fly_in, hold, fly_back = float(self.p('Revealin', 5.0)), float(self.p('Revealhold', 8.0)), float(self.p('Revealout', 3.0))
        overlay = float(self.p('Targetoverlay', 0.25))

        def finished():
            self.busy = False
            self.set_par('target_level', 'opacity', 0.0)
            self.sync()
            self.pump()

        def go_back():
            self.animate(every, {
                TX: self.home[:, 0], TY: self.home[:, 1], R: np.ones(n), G: np.ones(n), B: np.ones(n),
            }, fly_back, ease_in_out, done=finished, overlay=(overlay, 0.0))

        self.animate(every, {
            TX: self.home[dest, 0], TY: self.home[dest, 1], R: tints[:, 0], G: tints[:, 1], B: tints[:, 2],
        }, fly_in, ease_in_out, done=lambda: self.later(hold, go_back), overlay=(0.0, overlay))

    # ------------------------------------------------------------------ Step 4b: atlas, and the soak log

    def check_atlas(self):
        """In Atlas Mode, tiles listed in atlas/baked.csv stop playing live and show through from the atlas movie."""
        if not self.p('Atlasmode', False):
            if self.baked:
                self.baked = set()
                self.sync()
            self.set_par('atlas_level', 'opacity', 0.0)
            return
        self.set_par('atlas_level', 'opacity', 1.0)
        path = self.folder('atlas', 'baked.csv')
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            return
        if mtime == self.last['atlas_mtime'] or self.busy:
            return
        self.last['atlas_mtime'] = mtime
        baked = set()
        with open(path) as f:
            next(f, None)
            for line in f:
                parts = line.strip().split(',')
                if len(parts) == 2 and parts[1].isdigit():
                    name, cell = safe_name(parts[0]), int(parts[1])
                    if cell < self.n and self.cell_name[cell] == name:  # only if the tile is still in that cell
                        baked.add(name)
        self.set_par('atlas', 'file', self.folder('atlas', 'atlas.mov'))
        self.pulse('atlas', 'reloadpulse')
        self.baked = baked
        self.later(0.5, self.sync_when_idle)  # give the new atlas half a second to load before the live tiles go

    def sync_when_idle(self):
        if self.busy:
            self.later(0.5, self.sync_when_idle)
        else:
            self.sync()

    def log_perf(self, now):
        """Appends fps (and whatever the Perform CHOP offers) to data/perf_log.csv every 10 s, for the 2 hour soak."""
        elapsed = now - self.last['perf']
        fps = self.last['frames'] / elapsed if self.last['perf'] else 0.0
        self.last['perf'], self.last['frames'] = now, 0
        if not fps or not self.p('Logperf', True):
            return
        row = {'time': time.strftime('%Y-%m-%d %H:%M:%S'), 'fps': round(fps, 1), 'tiles': len(self.order), 'live': len(self.live)}
        perf = self.o('perf')
        if perf is not None:
            for chan in perf.chans():
                row[chan.name] = round(chan.eval(), 2)
        try:
            path = self.folder('data', 'perf_log.csv')
            os.makedirs(os.path.dirname(path), exist_ok=True)
            is_new = not os.path.exists(path)
            with open(path, 'a') as f:
                if is_new:
                    f.write(','.join(row) + '\n')
                f.write(','.join(str(v) for v in row.values()) + '\n')
        except OSError:
            pass
