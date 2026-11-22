"""Makes the two starter assets for the Tessera wall (needs Pillow and ffmpeg):
  assets/brand-tile.mov          looping 320x320 HAP tile for empty cells: a glazed lapis square that catches the light
  assets/target-placeholder.png  a stand-in "M" for the reveal, until the real Miradore Labs logo is supplied
Run: python3 make_assets.py"""
import math
import os
import subprocess

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'assets')
GROUND, DEEP, LAPIS, GOLD, BONE = (14, 27, 51), (22, 40, 74), (31, 58, 107), (201, 162, 74), (230, 221, 203)


def brand_tile(size=320, frames=180, fps=30):
    """A soft band of light drifts corner to corner over six seconds. First and last frames match, so it loops."""
    ffmpeg = subprocess.Popen(
        ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (size, size), '-r', str(fps),
         '-i', 'pipe:0', '-an', '-c:v', 'hap', os.path.join(OUT, 'brand-tile.mov')], stdin=subprocess.PIPE)
    small = 64
    for f in range(frames):
        phase = f / frames
        img = Image.new('RGB', (small, small))
        px = img.load()
        for y in range(small):
            for x in range(small):
                d = (x + y) / (2 * (small - 1))
                glow = max(0.0, math.cos((d - phase) * 2 * math.pi)) ** 6
                px[x, y] = tuple(round(a + (b - a) * glow * 0.75) for a, b in zip(DEEP, LAPIS))
        ffmpeg.stdin.write(img.resize((size, size), Image.BICUBIC).tobytes())
    ffmpeg.stdin.close()
    ffmpeg.wait()


def target(cols=10, rows=10, cell=100):
    """A blocky M drawn on the grid itself, gold on the lapis ground with bone feet."""
    shape = ['..........',
             '.XX....XX.',
             '.XXX..XXX.',
             '.XXXXXXXX.',
             '.XX.XX.XX.',
             '.XX.XX.XX.',
             '.XX....XX.',
             '.XX....XX.',
             '.BB....BB.',
             '..........']
    img = Image.new('RGB', (cols * cell, rows * cell), GROUND)
    draw = ImageDraw.Draw(img)
    for r, line in enumerate(shape):
        for c, ch in enumerate(line):
            if ch != '.':
                draw.rectangle([c * cell, r * cell, (c + 1) * cell - 1, (r + 1) * cell - 1], fill=GOLD if ch == 'X' else BONE)
    img.save(os.path.join(OUT, 'target-placeholder.png'))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    brand_tile()
    target()
    print('assets written to', OUT)
