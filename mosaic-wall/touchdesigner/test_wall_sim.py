"""Simulates the wall logic without TouchDesigner: python3 test_wall_sim.py
Fakes just enough of the TD objects (parameters, table, operators) and drives time by hand.
It checks the bookkeeping and the maths, not the rendering. The real check is Step 4 in TouchDesigner."""
import builtins
import os
import shutil
import tempfile
import time
import types

import numpy as np

builtins.debug = lambda *a: print('  [debug]', *a)
import mosaic_assign
import wall_ext

clock = [1000.0]
time.perf_counter = lambda: clock[0]


class Par:
    def __init__(self, val=None):
        self.val = val
        self.pulses = 0

    def eval(self):
        return self.val

    def pulse(self):
        self.pulses += 1


class Pars:
    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, Par(v))


class Op:
    def __init__(self, **pars):
        self.par = Pars(**pars)
        self.cooks = 0

    def cook(self, force=False):
        self.cooks += 1


class Cell:
    def __init__(self, val):
        self.val = val


class Table(Op):
    def __init__(self):
        super().__init__()
        self.data = []

    def rows(self):
        return [[Cell(v) for v in row] for row in self.data]

    def clear(self):
        self.data = []

    def appendRow(self, row):
        self.data.append(list(row))


class Comp:
    path = '/project1/wall'

    def __init__(self, server, cols, rows):
        self.par = Pars(Serverfolder=server, Cols=cols, Rows=rows, Resw=1920, Resh=1080, Gap=0.04, Heroseconds=3.0,
                        Landseconds=1.0, Revealin=5.0, Revealhold=8.0, Revealout=3.0, Targetoverlay=0.25,
                        Tintreused=0.7, Tintall=0.35, Atlasmode=False, Logperf=True, Paused=False, Blackedout=False)
        target = Op()
        rng = np.random.default_rng(3)
        target.numpyArray = lambda: rng.random((rows, cols, 4)).astype(np.float32)
        assign = Op()
        assign.module = mosaic_assign
        self.ops = {
            'tiles': Table(), 'inst': Op(), 'geo': Op(instancetexs=''), 'hero': Op(file='', play=False, cuepulse=None),
            'hero_level': Op(opacity=0.0), 'target_level': Op(opacity=0.0), 'black_level': Op(brightness1=1.0),
            'atlas_xf': Op(sx=1, sy=1), 'target_xf': Op(sx=1, sy=1), 'atlas': Op(file='', reloadpulse=None),
            'atlas_level': Op(opacity=0.0), 'target_cells': target, 'mosaic_assign': assign,
        }

    def op(self, name):
        return self.ops.get(name)


def run(wall, seconds, step=1 / 60):
    for _ in range(int(round(seconds / step))):
        clock[0] += step
        wall.tick()


def add_tile(server, name, hero=True):
    open(os.path.join(server, 'tiles', name + '.mov'), 'w').close()
    if hero:
        open(os.path.join(server, 'hero', name + '.mp4'), 'w').close()


server = tempfile.mkdtemp()
for d in ('tiles', 'hero', 'data', 'atlas'):
    os.makedirs(os.path.join(server, d))
try:
    for i in range(5):
        add_tile(server, 'old%d' % i)
    open(os.path.join(server, 'tiles', '.half.part'), 'w').close()
    comp = Comp(server, cols=4, rows=3)
    w = wall_ext.wall(comp)
    n = w.n

    run(w, 1.5)
    assert w.cell_name[:5] == ['old%d' % i for i in range(5)] and w.cell_name[5:] == [None] * 7, w.cell_name
    assert [r[0] for r in comp.ops['tiles'].data] == ['name'] + ['t_old%d' % i for i in range(5)]
    assert comp.ops['geo'].par.instancetexs.val.split()[0].endswith('/brand_fit')
    assert list(w.arr[wall_ext.TEX, :n]) == [1, 2, 3, 4, 5] + [0] * 7
    assert comp.ops['hero_level'].par.opacity.val == 0.0, 'tiles present at start must not play heroes'
    print('first scan ok: existing tiles placed without heroes, half-written file ignored')

    add_tile(server, 'new1')
    add_tile(server, 'new2')
    run(w, 1.2)
    assert comp.ops['hero_level'].par.opacity.val == 1.0 and comp.ops['hero'].par.file.val.endswith('new1.mp4')
    assert 'new1' not in w.cell_name and w.busy
    run(w, 2.5)   # past 3 s of hero: now landing
    assert comp.ops['hero_level'].par.opacity.val == 0.0 and w.arr[wall_ext.SX, n] > w.size, 'flyer should be shrinking in'
    run(w, 1.0)
    assert w.cell_name[5] == 'new1' and w.arr[wall_ext.SX, n] == 0.0
    run(w, 4.5)
    assert w.cell_name[6] == 'new2' and not w.busy and not w.queue
    assert open(os.path.join(server, 'data', 'cells.csv')).read().count('\n') == 8
    print('hero then land ok: two new tiles played in turn and landed in cells 5 and 6')

    w.on_osc('/pause')
    add_tile(server, 'held', hero=False)
    run(w, 3)
    assert 'held' not in w.cell_name and len(w.queue) == 1 and comp.par.Paused.val
    w.on_osc('/pause')
    run(w, 2)
    assert 'held' in w.cell_name
    print('pause ok: tile waited while paused, landed after (no hero file is handled)')

    before = sorted(x for x in w.cell_name if x)
    w.on_osc('/shuffle')
    run(w, 1.5)
    assert sorted(x for x in w.cell_name if x) == before and not w.busy
    assert np.allclose(w.arr[wall_ext.TX:wall_ext.TY + 1, :n], w.home.T)
    print('shuffle ok: same tiles, new cells, instances back on the grid')

    w.on_osc('/reveal')
    assert w.busy
    run(w, 5.5)
    assert abs(comp.ops['target_level'].par.opacity.val - 0.25) < 1e-6
    pos = np.round(w.arr[wall_ext.TX:wall_ext.TY + 1, :n].T, 4)
    assert len({tuple(p) for p in pos}) == n, 'every cell must be covered by exactly one instance during the reveal'
    assert (w.arr[wall_ext.TEX, :n] > 0).all(), 'no brand tiles during the reveal: empty cells borrow a tile'
    assert w.arr[wall_ext.R:wall_ext.B + 1, :n].min() < 1.0
    add_tile(server, 'during')
    run(w, 7)
    assert w.busy and 'during' not in w.cell_name
    run(w, 4.5)
    assert comp.ops['target_level'].par.opacity.val == 0.0
    assert np.allclose(w.arr[wall_ext.R:wall_ext.B + 1, :n], 1.0)
    run(w, 5)
    assert 'during' in w.cell_name and not w.busy
    print('reveal ok: 5 s in, hold with 25% overlay, 3 s back; a tile that arrived mid-reveal waited its turn')

    w.on_osc('/blackout')
    assert comp.ops['black_level'].par.brightness1.val == 0.0
    w.on_osc('/blackout')
    assert comp.ops['black_level'].par.brightness1.val == 1.0
    print('blackout ok')

    for i in range(6):
        add_tile(server, 'fill%d' % i, hero=False)
    run(w, 12)
    assert None not in w.cell_name or len(w.order) <= n
    assert 'old0' not in w.cell_name and 'fill5' in w.cell_name and len([x for x in w.cell_name if x]) == n
    print('full wall ok: oldest tile gave up its cell, wall stays at', n, 'tiles')

    os.remove(os.path.join(server, 'tiles', 'fill5.mov'))
    run(w, 2)
    assert 'fill5' not in w.cell_name
    comp.par.Cols.val = 3
    w.layout()
    run(w, 2)
    assert w.n == 9 and len(w.cell_name) == 9 and w.arr.shape[1] == 10
    print('removal and grid resize ok')

    comp.par.Atlasmode.val = True
    baked = [x for x in w.cell_name if x][:4]
    with open(os.path.join(server, 'atlas', 'baked.csv'), 'w') as f:
        f.write('name,cell\n' + ''.join('%s,%d\n' % (x, w.cell_name.index(x)) for x in baked))
    run(w, 7)
    assert set(w.live).isdisjoint(baked) and len(comp.ops['tiles'].data) - 1 == len(w.order) - 4
    assert all(w.arr[wall_ext.SX, w.cell_name.index(x)] == 0.0 for x in baked)
    assert os.path.exists(os.path.join(server, 'data', 'perf_log.csv'))
    print('atlas mode ok: baked tiles stop playing live; perf_log.csv is being written')
    print('ALL SIMULATED CHECKS PASSED')
finally:
    shutil.rmtree(server)
