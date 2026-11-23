// Look engine shared by the audience page and the operator pad preview.
// Every look is a pure function of the shared show clock, so phones that have the
// same cue show the same thing at the same moment without any further messages.
(function (root) {
'use strict';

function hash(a, b) {
  var x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12;
  return (x >>> 0) / 4294967296;
}
function frac(x) { return ((x % 1) + 1) % 1; }
function hue(h) {
  h = frac(h) * 6;
  var x = 1 - Math.abs(h % 2 - 1), r = 0, g = 0, b = 0;
  if (h < 1) { r = 1; g = x; } else if (h < 2) { r = x; g = 1; } else if (h < 3) { g = 1; b = x; }
  else if (h < 4) { g = x; b = 1; } else if (h < 5) { r = x; b = 1; } else { r = 1; b = x; }
  return [r * 255, g * 255, b * 255];
}
function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
function dim(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
function palette(colors, p) { // p in 0..1 along a list of colours, no wrap
  var x = Math.min(0.9999, Math.max(0, p)) * (colors.length - 1), i = Math.floor(x);
  return mix(colors[i], colors[i + 1], x - i);
}

// ctx: { seed (different on every phone), idx (zone position), n (zone count) }
function colorAt(l, at, t, ctx, from) {
  var p, i, f;
  switch (l.type) {
    case 'color':
      return l.fade > 0 ? mix(from, l.c, Math.min(1, Math.max(0, (t - at) / l.fade))) : l.c;
    case 'rainbow':
      return hue(t / l.period - ctx.idx / ctx.n);
    case 'pulse':
      p = frac((t - l.t0) / (60000 / l.bpm));
      return dim(l.c, 0.08 + 0.92 * (1 - p) * (1 - p));
    case 'alt': // two colours swapping on the beat, half the crowd on each
      i = Math.floor((t - l.t0) / (60000 / l.bpm)) + (ctx.seed & 1);
      return (i & 1) ? l.b : l.a;
    case 'breathe':
      return dim(l.c, 0.12 + 0.88 * (0.5 - 0.5 * Math.cos(2 * Math.PI * t / l.period)));
    case 'sparkle':
      i = Math.floor(t / 450); f = (t / 450) % 1;
      return hash(ctx.seed, i) < 0.35 ? dim(l.c, Math.sin(Math.PI * f)) : [0, 0, 0];
    case 'chase':
      p = Math.max(0, Math.cos(2 * Math.PI * (t / l.period - ctx.idx / ctx.n)));
      return dim(l.c, p * p * p);
    case 'cycle':
      p = frac(t / l.period - ctx.idx / ctx.n) * l.colors.length; i = Math.floor(p);
      return mix(l.colors[i % l.colors.length], l.colors[(i + 1) % l.colors.length], p - i);
    case 'split': // every phone picks one colour and keeps it
      return l.colors[Math.floor(hash(ctx.seed, 77) * l.colors.length) % l.colors.length];
    case 'shimmer': // each phone drifts through the palette on its own (fire, ocean, lighters)
      p = t / l.speed + hash(ctx.seed, 5) * 1000; i = Math.floor(p); f = p - i; f = f * f * (3 - 2 * f);
      return palette(l.colors, hash(ctx.seed, i) + (hash(ctx.seed, i + 1) - hash(ctx.seed, i)) * f);
    case 'text': case 'countdown':
      return l.bg;
  }
  return [0, 0, 0];
}

function create(ctx) {
  var cur = null, queue = [], from = [0, 0, 0], last = [0, 0, 0], flash = null;
  var master = 1, masterNow = 1;
  var out = { idle: true, c: [0, 0, 0], text: '', fg: [255, 255, 255] };
  return {
    ctx: ctx,
    push: function (cue) { if (cue && cue.look) queue.push(cue); },
    setMaster: function (v, snap) { master = v; if (snap) masterNow = v; },
    reset: function () { cur = null; queue.length = 0; flash = null; },
    frame: function (t) {
      for (var i = 0; i < queue.length; i++) {
        if (queue[i].at > t) continue;
        var q = queue.splice(i, 1)[0]; i--;
        if (q.look.type === 'flash') { if (t - q.at < q.look.dur) flash = q; }
        else if (!cur || q.at >= cur.at) { from = last; cur = q.look.type === 'idle' ? null : q; if (!cur) last = [0, 0, 0]; }
      }
      masterNow += (master - masterNow) * 0.25;
      out.idle = !cur; out.text = '';
      var c = [0, 0, 0];
      if (cur) {
        var l = cur.look;
        c = colorAt(l, cur.at, t, ctx, from);
        last = c;
        if (l.type === 'text') { out.text = l.text; out.fg = l.fg; }
        else if (l.type === 'countdown') {
          var left = Math.ceil((l.end - t) / 1000);
          out.text = left > 0 ? String(left) : l.endText; out.fg = l.fg;
        }
      }
      if (flash) {
        var k = 1 - (t - flash.at) / flash.look.dur;
        if (k <= 0) flash = null; else { c = mix(c, flash.look.c, k * k); out.idle = false; }
      }
      out.c = dim(c, masterNow);
      return out;
    }
  };
}

var api = { create: create, colorAt: colorAt, hash: hash };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Looks = api;
})(this);
