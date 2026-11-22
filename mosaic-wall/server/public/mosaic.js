// The living mosaic behind the booth: glazed squares that set themselves into a wall, turn over now and then,
// and catch a sweep of gold light. Drawn on one canvas; stops when the page is hidden or motion is reduced.
(() => {
  'use strict';
  const canvas = document.getElementById('mosaic');
  const ctx = canvas.getContext('2d');
  const GROUND = '#0E1B33';
  const QUIET = ['#16284A', '#16284A', '#1A2F56', '#132441', '#1F3A6B'];
  const GLAZE = ['#2A8C8C', '#C9A24A', '#E6DDCB', '#9C3B4E', '#0F5C4E', '#3B2F5B', '#1F3A6B'];
  const SKIN = ['#F1D6BD', '#E9C7A5', '#C68E63', '#8A5A3C'];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  let tiles = [], cell = 0, w = 0, h = 0, born = 0, raf = 0;

  function newFace() {
    const glazed = Math.random() < 0.34;
    return { color: glazed ? pick(GLAZE) : pick(QUIET), person: glazed && Math.random() < 0.55, skin: pick(SKIN) };
  }

  function build() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = Math.max(48, Math.round(Math.min(w, h) / 9));
    const cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1;
    const ox = (w - cols * cell) / 2, oy = (h - rows * cell) / 2;
    tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        tiles.push({
          x: ox + c * cell, y: oy + r * cell, ...newFace(),
          delay: 0.25 + (cols - c + r * 0.6) * 0.035 + Math.random() * 0.25, // sets in from the right
          from: { dx: (Math.random() - 0.2) * cell * 3, dy: (Math.random() - 0.5) * cell * 3, rot: (Math.random() - 0.5) * 1.6 },
          flipAt: 0, next: null, diag: c + r,
        });
      }
    }
    born = performance.now();
  }

  function drawTile(t, size, glint) {
    const s = size * 0.9, half = s / 2;
    ctx.fillStyle = t.color;
    ctx.fillRect(-half, -half, s, s);
    if (t.person) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-half, -half, s, s);
      ctx.clip();
      ctx.fillStyle = GROUND;
      ctx.beginPath();
      ctx.ellipse(0, half * 1.1, s * 0.36, s * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.skin;
      ctx.beginPath();
      ctx.arc(0, -s * 0.1, s * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (glint > 0) {
      ctx.fillStyle = 'rgba(226, 192, 106, ' + (glint * 0.5).toFixed(3) + ')';
      ctx.fillRect(-half, -half, s, s);
    }
  }

  const easeOut = (x) => 1 - Math.pow(1 - x, 4);

  function frame(now) {
    const t = (now - born) / 1000;
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, w, h);
    const sweep = ((t - 3) % 9) * 14 - 4; // a band of gold light crosses every 9 seconds
    for (const tile of tiles) {
      const k = still ? 1 : easeOut(Math.min(1, Math.max(0, (t - tile.delay) / 1.1)));
      if (k <= 0) continue;
      let flip = 1;
      if (tile.flipAt) {
        const f = (t - tile.flipAt) / 0.7;
        if (f >= 1) tile.flipAt = 0;
        else {
          if (f >= 0.5 && tile.next) { Object.assign(tile, tile.next); tile.next = null; }
          flip = Math.abs(Math.cos(f * Math.PI));
        }
      }
      const glint = still ? 0 : Math.max(0, 1 - Math.abs(tile.diag - sweep) / 2.2);
      ctx.save();
      ctx.translate(tile.x + cell / 2 + tile.from.dx * (1 - k), tile.y + cell / 2 + tile.from.dy * (1 - k));
      ctx.rotate(tile.from.rot * (1 - k));
      ctx.scale(flip * (0.4 + 0.6 * k), 0.4 + 0.6 * k);
      ctx.globalAlpha = k;
      drawTile(tile, cell, glint);
      ctx.restore();
    }
    if (still) return;
    if (t > 2.5 && Math.random() < 0.05) { // a tile turns over to a new face
      const tile = pick(tiles);
      if (!tile.flipAt) { tile.flipAt = t; tile.next = newFace(); }
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  // The booth calls this when the start screen comes back, so the wall sets itself again for each guest.
  window.mosaicReplay = () => { born = performance.now(); for (const t of tiles) Object.assign(t, newFace()); start(); };
  window.addEventListener('resize', () => { build(); start(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else start(); });
  build();
  start();
})();
