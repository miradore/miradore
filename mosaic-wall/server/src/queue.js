'use strict';
// The worker. Takes "new" jobs up to MAX_CONCURRENCY, generates, retries once, then marks failed.
const path = require('path');
const { config, loadThemes } = require('./config');
const { jobs } = require('./db');
const media = require('./media');
const hf = require('./higgsfield');

const MAX_ATTEMPTS = 2; // first try plus one retry
const active = new Set();

function promptFor(themeId) {
  const { avoid, themes } = loadThemes();
  const theme = themes.find((t) => t.id === themeId);
  if (!theme) throw new hf.FatalGenerationError(`theme "${themeId}" is not in themes.json`);
  return [theme.prompt, avoid].filter(Boolean).join(' ');
}

const clipPathFor = (id) => path.join(config.dirs.clips, `${id}.mp4`);

async function generate(job) {
  const out = clipPathFor(job.id);
  if (config.GEN_PROVIDER === 'mock') {
    await new Promise((r) => setTimeout(r, config.MOCK_SECONDS * 1000));
    if (Math.random() < config.MOCK_FAIL_RATE) throw new Error('mock failure');
    await media.makeStillClip(job.photo_path, out);
    return { clip: out, source: 'mock' };
  }
  const deadline = Date.now() + config.GEN_TIMEOUT_S * 1000;
  let requestId = job.request_id;
  if (!requestId) {
    requestId = await hf.start(job, promptFor(job.theme));
    jobs.update(job.id, { request_id: requestId });
  }
  const url = await hf.waitForVideo(requestId, deadline);
  await hf.download(url, out);
  return { clip: out, source: config.GEN_MODEL };
}

function markReady(job, clip, source) {
  const readyAt = new Date();
  jobs.update(job.id, {
    status: 'ready',
    ready_at: readyAt.toISOString(),
    seconds_taken: Math.round((readyAt - new Date(job.submitted_at)) / 100) / 10,
    clip_path: clip,
    source,
    error: null,
  });
}

async function runJob(job) {
  active.add(job.id);
  const attempts = job.request_id ? job.attempts : job.attempts + 1; // resuming after a restart is not a new attempt
  jobs.update(job.id, { status: 'generating', attempts });
  try {
    const { clip, source } = await generate(job);
    markReady(job, clip, source);
    console.log(`[queue] ${job.id} ready`);
  } catch (err) {
    const message = String(err && err.message ? err.message : err).slice(0, 500);
    const fatal = err instanceof hf.FatalGenerationError;
    const retry = !fatal && attempts < MAX_ATTEMPTS;
    jobs.update(job.id, { status: retry ? 'new' : 'failed', error: message, request_id: null });
    console.warn(`[queue] ${job.id} attempt ${attempts} failed: ${message}${retry ? ' (will retry once)' : ''}`);
  } finally {
    active.delete(job.id);
  }
}

function tick() {
  if (active.size >= config.MAX_CONCURRENCY) return;
  for (const job of jobs.byStatus('new')) {
    if (active.size >= config.MAX_CONCURRENCY) break;
    if (!active.has(job.id)) runJob(job);
  }
}

function start() {
  // Jobs caught mid-generation by a restart: resume polling if Higgsfield already has them, otherwise requeue.
  for (const job of jobs.byStatus('generating')) {
    if (job.request_id && config.GEN_PROVIDER !== 'mock') runJob(job);
    else jobs.update(job.id, { status: 'new', attempts: Math.max(0, job.attempts - 1) });
  }
  setInterval(tick, 1000).unref();
  tick();
}

/** Operator: run a failed job again from scratch. */
function retry(id) {
  jobs.update(id, { status: 'new', attempts: 0, error: null, request_id: null });
}

/** Operator: last resort. Slow push-in on the guest's photo instead of an AI clip. */
async function stillFallback(id) {
  const job = jobs.get(id);
  const clip = await media.makeStillClip(job.photo_path, clipPathFor(id));
  markReady(job, clip, 'still');
}

module.exports = { start, retry, stillFallback, activeCount: () => active.size };
