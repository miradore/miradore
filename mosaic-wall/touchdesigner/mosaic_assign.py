"""Step 5 maths: which tile goes to which cell of the target image. Pure numpy, no TouchDesigner imports,
so it can be tested outside TD (python3 test_mosaic_assign.py).

scipy is optional. TouchDesigner does not ship it; see README.md for installing it into TD's Python.
Without scipy a greedy matcher is used, which is slightly worse but still reads well."""
import numpy as np

try:
    from scipy.optimize import linear_sum_assignment
    HAVE_SCIPY = True
except Exception:  # scipy missing or built for another Python
    linear_sum_assignment = None
    HAVE_SCIPY = False


def color_cost(tile_rgb, cell_rgb):
    """(T, N) squared colour distance between every tile and every cell. Inputs are (T,3) and (N,3), 0..1."""
    t = np.asarray(tile_rgb, dtype=np.float64).reshape(-1, 3)
    c = np.asarray(cell_rgb, dtype=np.float64).reshape(-1, 3)
    d = t[:, None, :] - c[None, :, :]
    return (d * d).sum(axis=2)


def _greedy(cost):
    """Cheapest pair first, each row and column used once. Returns (rows, cols) like linear_sum_assignment."""
    t, n = cost.shape
    order = np.argsort(cost, axis=None)
    row_used = np.zeros(t, dtype=bool)
    col_used = np.zeros(n, dtype=bool)
    rows, cols = [], []
    need = min(t, n)
    for flat in order:
        r, c = divmod(int(flat), n)
        if row_used[r] or col_used[c]:
            continue
        row_used[r] = col_used[c] = True
        rows.append(r)
        cols.append(c)
        if len(rows) == need:
            break
    return np.array(rows, dtype=int), np.array(cols, dtype=int)


def assign(tile_rgb, cell_rgb):
    """Returns (cell_tile, reused).

    cell_tile[c] is the index of the tile shown in cell c. reused[c] is True where that tile already has a
    cell of its own and is being shown a second time (only happens when there are fewer tiles than cells).
    Every tile is used at least once when tiles <= cells."""
    cost = color_cost(tile_rgb, cell_rgb)
    t, n = cost.shape
    if t == 0:
        raise ValueError('no tiles to assign')
    rows, cols = linear_sum_assignment(cost) if HAVE_SCIPY else _greedy(cost)
    cell_tile = np.full(n, -1, dtype=int)
    cell_tile[cols] = rows
    reused = cell_tile < 0
    if reused.any():
        cell_tile[reused] = cost[:, reused].argmin(axis=0)
    return cell_tile, reused


def tint(tile_rgb, cell_rgb, strength):
    """Per-cell colour multiplier that pulls a tile's average colour towards its cell's colour.

    strength 0 leaves the tile alone, 1 matches the cell's hue as far as a multiplier (never above 1) can."""
    t = np.clip(np.asarray(tile_rgb, dtype=np.float64).reshape(-1, 3), 0.02, 1.0)
    c = np.clip(np.asarray(cell_rgb, dtype=np.float64).reshape(-1, 3), 0.0, 1.0)
    ratio = c / t
    ratio = ratio / np.maximum(1.0, ratio.max(axis=1, keepdims=True))
    s = np.asarray(strength, dtype=np.float64).reshape(-1, 1)
    return 1.0 + (ratio - 1.0) * np.clip(s, 0.0, 1.0)
