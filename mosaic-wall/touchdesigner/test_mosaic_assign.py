"""Run outside TouchDesigner: python3 test_mosaic_assign.py"""
import numpy as np
import mosaic_assign as m

rng = np.random.default_rng(1)


def check(tiles, cells):
    cell_tile, reused = m.assign(tiles, cells)
    n, t = len(cells), len(tiles)
    assert cell_tile.shape == (n,) and cell_tile.min() >= 0 and cell_tile.max() < t
    if t >= n:
        assert not reused.any() and len(set(cell_tile)) == n, 'each cell must get its own tile'
    else:
        assert set(cell_tile[~reused]) == set(range(t)), 'every tile must appear once un-reused'
        assert reused.sum() == n - t
    return cell_tile, reused


for use_scipy in ([True, False] if m.HAVE_SCIPY else [False]):
    m.HAVE_SCIPY = use_scipy
    check(rng.random((100, 3)), rng.random((100, 3)))   # same count
    check(rng.random((10, 3)), rng.random((100, 3)))    # fewer tiles than cells: reuse
    check(rng.random((150, 3)), rng.random((100, 3)))   # more tiles than cells
    check(rng.random((1, 3)), rng.random((12, 3)))
    # a black/white target with half black, half white tiles must sort perfectly
    cells = np.repeat([[0.0, 0.0, 0.0], [1.0, 1.0, 1.0]], 50, axis=0)
    tiles = np.repeat([[0.9, 0.9, 0.9], [0.1, 0.1, 0.1]], 50, axis=0)
    ct, _ = check(tiles, cells)
    assert (tiles[ct].mean(axis=1) > 0.5).tolist() == (cells.mean(axis=1) > 0.5).tolist()
    print('assign ok', 'scipy' if use_scipy else 'greedy')

mult = m.tint([[0.5, 0.5, 0.5]], [[1.0, 0.4, 0.0]], 1.0)
assert mult.max() <= 1.0 and mult[0, 0] > mult[0, 1] > mult[0, 2]
assert np.allclose(m.tint([[0.5, 0.2, 0.9]], [[0.1, 0.1, 0.1]], 0.0), 1.0)
print('tint ok')
