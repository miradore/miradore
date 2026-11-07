import { createApp } from './core/app.js';
import { departments } from './departments/index.js';
import { makeChecker } from './core/check.js';

const params = new URLSearchParams(location.search);
const scale = parseFloat(params.get('scale') || '1');
const only = params.get('depts');          // comma list to load a subset
const canvas = document.getElementById('c');
const list = only ? departments.filter((d) => only.split(',').includes(d.name)) : departments;

const api = { ready: null, app: null };
api.ready = createApp({ canvas, departments: list, scale }).then((app) => {
  api.app = app;
  api.render = (f) => { app.render(f); return true; };
  api.snapshot = (f) => app.snapshot(f);
  api.grab = () => canvas.toDataURL('image/png');
  let checker = null;
  api.check = (f) => { if (!checker) checker = makeChecker(app); return checker.check(f); };
  api.checkStats = () => { if (!checker) checker = makeChecker(app); return checker.stats; };
  const f0 = parseInt(params.get('frame') || '0', 10);
  app.render(f0);
  return true;
}).catch((e) => { console.error(e); api.error = String(e && e.stack || e); throw e; });
window.__anime = api;
