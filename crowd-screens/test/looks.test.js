'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Looks = require('../public/looks.js');

const ctx = (seed = 1, idx = 0, n = 1) => ({ seed, idx, n });
const cue = (at, look) => ({ at, look });

test('a phone with no cue is idle', () => {
  assert.strictEqual(Looks.create(ctx()).frame(1000).idle, true);
});

test('colour snaps at the cue time, not before', () => {
  const e = Looks.create(ctx());
  e.push(cue(1000, { type: 'color', c: [255, 0, 0], fade: 0 }));
  assert.strictEqual(e.frame(999).idle, true);
  assert.deepStrictEqual(e.frame(1000).c.map(Math.round), [255, 0, 0]);
});

test('fade starts from the colour on screen', () => {
  const e = Looks.create(ctx());
  e.push(cue(0, { type: 'color', c: [0, 0, 200], fade: 0 }));
  e.frame(10);
  e.push(cue(1000, { type: 'color', c: [200, 0, 0], fade: 1000 }));
  assert.deepStrictEqual(e.frame(1500).c.map(Math.round), [100, 0, 100]);
  assert.deepStrictEqual(e.frame(2500).c.map(Math.round), [200, 0, 0]);
});

test('two phones with the same cue agree, whatever their seed', () => {
  for (const look of [
    { type: 'rainbow', period: 6000 }, { type: 'pulse', c: [255, 255, 255], bpm: 120, t0: 0 },
    { type: 'breathe', c: [9, 99, 199], period: 4000 }, { type: 'chase', c: [255, 0, 0], period: 3000 },
    { type: 'cycle', colors: [[255, 0, 0], [0, 255, 0]], period: 8000 },
  ]) {
    const a = Looks.create(ctx(1)), b = Looks.create(ctx(987654));
    a.push(cue(0, look)); b.push(cue(0, look));
    for (const t of [1, 777, 12345.6]) assert.deepStrictEqual(a.frame(t).c, b.frame(t).c, look.type);
  }
});

test('pulse is brightest on the beat', () => {
  const e = Looks.create(ctx());
  e.push(cue(0, { type: 'pulse', c: [200, 200, 200], bpm: 120, t0: 0 }));
  assert.ok(e.frame(500).c[0] > 190);          // on the beat (500 ms per beat)
  assert.ok(e.frame(950).c[0] < 40);           // just before the next one
});

test('countdown counts down and ends on the end text', () => {
  const e = Looks.create(ctx());
  e.push(cue(0, { type: 'countdown', end: 3000, endText: 'GO!', fg: [0, 0, 0], bg: [255, 255, 255] }));
  assert.strictEqual(e.frame(1).text, '3');
  assert.strictEqual(e.frame(2001).text, '1');
  assert.strictEqual(e.frame(3001).text, 'GO!');
});

test('flash sits on top of the look and then clears', () => {
  const e = Looks.create(ctx());
  e.push(cue(0, { type: 'color', c: [0, 0, 100], fade: 0 }));
  e.push(cue(1000, { type: 'flash', c: [255, 255, 255], dur: 500 }));
  assert.ok(e.frame(1000).c[0] > 250);
  assert.deepStrictEqual(e.frame(1600).c.map(Math.round), [0, 0, 100]);
});

test('a stale flash is not replayed', () => {
  const e = Looks.create(ctx());
  e.push(cue(0, { type: 'flash', c: [255, 255, 255], dur: 500 }));
  assert.deepStrictEqual(e.frame(5000).c, [0, 0, 0]);
});

test('idle cue returns the phone to standby', () => {
  const e = Looks.create(ctx());
  e.push(cue(0, { type: 'color', c: [1, 2, 3], fade: 0 }));
  assert.strictEqual(e.frame(1).idle, false);
  e.push(cue(10, { type: 'idle' }));
  assert.strictEqual(e.frame(11).idle, true);
});

test('an older cue never replaces a newer one', () => {
  const e = Looks.create(ctx());
  e.push(cue(2000, { type: 'color', c: [0, 255, 0], fade: 0 }));
  e.push(cue(1000, { type: 'color', c: [255, 0, 0], fade: 0 }));
  assert.deepStrictEqual(e.frame(3000).c.map(Math.round), [0, 255, 0]);
});

test('master brightness dims the output', () => {
  const e = Looks.create(ctx());
  e.push(cue(0, { type: 'color', c: [200, 100, 0], fade: 0 }));
  e.setMaster(0.5, true);
  assert.deepStrictEqual(e.frame(1).c.map(Math.round), [100, 50, 0]);
});

test('split gives each phone one fixed colour and uses every colour across a crowd', () => {
  const colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
  const seen = new Set();
  for (let s = 1; s <= 300; s++) {
    const e = Looks.create(ctx(s * 7919));
    e.push(cue(0, { type: 'split', colors }));
    const a = e.frame(1).c.join(), b = e.frame(99999).c.join();
    assert.strictEqual(a, b);
    seen.add(a);
  }
  assert.strictEqual(seen.size, 3);
});

test('no look changes brightness sharply more than 3 times a second', () => {
  const looks = [
    { type: 'pulse', c: [255, 255, 255], bpm: 180, t0: 0 },
    { type: 'alt', a: [255, 255, 255], b: [0, 0, 0], bpm: 180, t0: 0 },
    { type: 'sparkle', c: [255, 255, 255] },
    { type: 'shimmer', colors: [[255, 30, 0], [255, 110, 0], [255, 200, 40]], speed: 200 },
    { type: 'breathe', c: [255, 255, 255], period: 2000 },
  ];
  const lum = (c) => (c[0] * 299 + c[1] * 587 + c[2] * 114) / 255000;
  for (const look of looks) for (const seed of [1, 2, 12345, 999999]) {
    const e = Looks.create(ctx(seed));
    e.push(cue(0, look));
    // Count dark-to-bright swings over 10 seconds.
    let rises = 0, low = true;
    for (let t = 1; t < 10000; t += 5) {
      const v = lum(e.frame(t).c);
      if (low && v > 0.6) { rises++; low = false; } else if (!low && v < 0.3) low = true;
    }
    assert.ok(rises <= 31, `${look.type} seed ${seed}: ${rises} flashes in 10s`);
  }
});
