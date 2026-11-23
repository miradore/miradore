'use strict';
// Browser check with emulated phones and the operator pad. Needs Playwright installed globally.
// Start the server first:  OPERATOR_KEY=testkey ZONES="Left,Right,Pit" npm start
// Then:                    node test/manual/e2e.js [screenshot-dir]
const { chromium, devices } = require('playwright');
const assert = require('assert');
const BASE = process.env.BASE || 'http://localhost:8080';
const OUT = process.argv[2];

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const open = async (opts, url) => {
    const c = await b.newContext(opts); const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    await p.goto(BASE + url); return p;
  };
  const bg = (p) => p.evaluate(() => document.getElementById('stage').style.background);
  const txt = (p) => p.evaluate(() => document.getElementById('txt').textContent);
  const idle = (p) => p.evaluate(() => getComputedStyle(document.getElementById('idle')).display !== 'none');
  const shot = async (p, name, full) => { if (OUT) await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: !!full }); };

  const ph1 = await open(devices['iPhone 13'], '/?z=left');
  const ph2 = await open(devices['Pixel 7'], '/?z=pit');
  await shot(ph1, 'join');
  await ph1.click('#go'); await ph2.click('#go');
  const pad = await open({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 }, '/pad?key=testkey');
  const press = (name) => pad.locator('button', { hasText: new RegExp('^' + name + '$') }).dispatchEvent('pointerdown');
  const settle = () => pad.waitForTimeout(900);
  await pad.waitForTimeout(1500);

  assert.strictEqual(await pad.textContent('#status'), 'online');
  assert.strictEqual(await pad.textContent('#total'), '2');
  assert.ok(!pad.url().includes('key='), 'key should be removed from the address bar');
  await press('Standby screen'); await settle();
  assert.ok(await idle(ph1) && await idle(ph2), 'phones start on the standby screen');
  await shot(ph1, 'standby');

  await press('Teal'); await settle();
  assert.deepStrictEqual([await bg(ph1), await bg(ph2)], ['rgb(0, 188, 176)', 'rgb(0, 188, 176)']);
  assert.ok(!(await idle(ph1)));

  await pad.locator('#zones button', { hasText: 'Pit' }).dispatchEvent('pointerdown');
  await press('Red'); await settle();
  assert.deepStrictEqual([await bg(ph1), await bg(ph2)], ['rgb(0, 188, 176)', 'rgb(255, 0, 0)'], 'only Pit turns red');
  await pad.locator('#zones button', { hasText: 'Everyone' }).dispatchEvent('pointerdown');

  for (const fx of ['Rainbow wave', 'Beat pulse', 'Two-colour beat', 'Breathe', 'Sparkle', 'Two-colour split', 'Zone chase',
    'Miradore split', 'Miradore cycle', 'Fire', 'Ocean', 'Lighters']) {
    await press(fx); await settle();
    const a = await bg(ph1), c = await bg(ph2);
    assert.ok(/^rgb\(/.test(a) && /^rgb\(/.test(c), fx);
    console.log(fx.padEnd(18), a, c);
  }
  await shot(pad, 'pad-live');

  // Two-colour split: each phone holds one of the two colours.
  await press('Two-colour split'); await settle();
  for (const p of [ph1, ph2]) assert.ok(['rgb(255, 0, 0)', 'rgb(0, 188, 176)'].includes(await bg(p)));

  // Flash lifts the screen to white and falls back.
  await press('Blue'); await settle();
  await press('FLASH'); await pad.waitForTimeout(560);
  const during = await bg(ph1); await pad.waitForTimeout(900);
  assert.notStrictEqual(during, 'rgb(0, 60, 255)'); assert.strictEqual(await bg(ph1), 'rgb(0, 60, 255)');

  // Brightness
  await pad.locator('#dim').fill('50'); await pad.waitForTimeout(1200);
  assert.strictEqual(await bg(ph1), 'rgb(0, 30, 128)');
  await pad.locator('#dim').fill('100'); await pad.waitForTimeout(1200);

  await press('Orange'); await pad.fill('#text', 'welcome rox'); await press('Send text'); await settle();
  assert.strictEqual(await txt(ph1), 'WELCOME ROX'); await shot(ph1, 'text');
  await press('MAKE SOME NOISE'); await settle();
  assert.strictEqual(await txt(ph2), 'MAKE SOME NOISE'); await shot(ph2, 'text-long');

  await pad.fill('#secs', '3'); await press('Start countdown'); await pad.waitForTimeout(1200);
  assert.deepStrictEqual([await txt(ph1), await txt(ph2)], ['3', '3']);
  await pad.waitForTimeout(3200);
  assert.deepStrictEqual([await txt(ph1), await txt(ph2)], ['GO!', 'GO!']);

  // A phone that joins late shows the live look straight away.
  const ph3 = await open(devices['iPhone 13'], '/?z=right'); await ph3.click('#go'); await ph3.waitForTimeout(1200);
  assert.strictEqual(await txt(ph3), 'GO!');

  // A second pad opens already showing the live state.
  const pad2 = await open({ viewport: { width: 900, height: 700 } }, '/pad?key=testkey'); await pad2.waitForTimeout(1200);
  assert.ok((await pad2.textContent('#preview')).includes('Countdown: GO!'));

  // Wrong key
  const bad = await open({}, '/pad?key=nope'); await bad.waitForTimeout(800);
  assert.strictEqual(await bad.textContent('#status'), 'wrong key');

  await pad.locator('details summary').click(); await pad.waitForTimeout(400);
  await shot(pad, 'pad', true);
  assert.deepStrictEqual(errs.filter((e) => !/WebSocket|ERR_CONNECTION/.test(e)), []);
  console.log('E2E OK');
  await b.close();
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
