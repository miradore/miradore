'use strict';
// Higgsfield image to video, through the official SDK (@higgsfield/client).
// Endpoints used, all taken from the SDK source rather than guessed:
//   POST {base}/files/generate-upload-url        -> { upload_url, public_url }   (SDK: uploadImage)
//   PUT  upload_url                               (the JPEG bytes)
//   POST {base}{model endpoint}                   -> { request_id, status_url, cancel_url, status }
//   GET  {base}/requests/{request_id}/status      -> status queued | in_progress | completed | failed | nsfw
//                                                    completed carries video.url
// Auth: "Authorization: Key KEY_ID:KEY_SECRET". The key lives in .env only.
const fs = require('fs');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { config, loadModel } = require('./config');

const BASE_URL = 'https://api.higgsfield.ai';

/** Errors where a second attempt cannot help. The queue fails these straight away. */
class FatalGenerationError extends Error {}

let clients = null;
function getClients() {
  if (clients) return clients;
  const parts = config.HF_CREDENTIALS.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new FatalGenerationError('HF_CREDENTIALS is missing in .env (format KEY_ID:KEY_SECRET)');
  }
  const { createHiggsfieldClient } = require('@higgsfield/client/v2');
  const { HiggsfieldClient } = require('@higgsfield/client');
  clients = {
    // maxRetries 0: the SDK must never silently submit (and bill) the same clip twice. The queue owns retries.
    v2: createHiggsfieldClient({ credentials: config.HF_CREDENTIALS, maxRetries: 0 }),
    files: new HiggsfieldClient({ apiKey: parts[0], apiSecret: parts[1] }),
  };
  return clients;
}

function fill(template, vars) {
  if (typeof template === 'string') return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  if (Array.isArray(template)) return template.map((t) => fill(t, vars));
  if (template && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, fill(v, vars)]));
  }
  return template;
}

function classify(err) {
  const name = err && err.constructor ? err.constructor.name : '';
  if (['AuthenticationError', 'NotEnoughCreditsError', 'BadInputError', 'ValidationError', 'CredentialsMissedError'].includes(name)) {
    const detail = typeof err.message === 'string' ? err.message : JSON.stringify(err.message);
    return new FatalGenerationError(`${name}: ${detail}`);
  }
  return err;
}

/** Uploads the photo and starts the generation. Returns the Higgsfield request id. */
async function start(job, prompt) {
  const { v2, files } = getClients();
  const model = loadModel();
  try {
    const imageUrl = await files.uploadImage(fs.readFileSync(job.photo_path), 'jpeg');
    const res = await v2.subscribe(model.endpoint, {
      input: fill(model.input, { prompt, image_url: imageUrl }),
      withPolling: false,
    });
    if (!res || !res.request_id) throw new Error('Higgsfield did not return a request_id');
    return res.request_id;
  } catch (err) {
    throw classify(err);
  }
}

/** Polls until the request finishes, then returns the video URL. */
async function waitForVideo(requestId, deadline) {
  const headers = { Authorization: `Key ${config.HF_CREDENTIALS}` };
  for (;;) {
    if (Date.now() > deadline) throw new Error(`timed out after ${config.GEN_TIMEOUT_S}s`);
    const res = await fetch(`${BASE_URL}/requests/${requestId}/status`, { headers });
    if (res.status === 401) throw new FatalGenerationError('AuthenticationError: invalid API credentials');
    if (res.ok) {
      const body = await res.json();
      if (body.status === 'completed') {
        if (!body.video || !body.video.url) throw new Error('completed without a video url');
        return body.video.url;
      }
      if (body.status === 'nsfw') throw new FatalGenerationError('nsfw: rejected by Higgsfield moderation');
      if (body.status === 'failed') throw new Error('Higgsfield reported the generation as failed');
    } else if (res.status < 500) {
      throw new Error(`status check returned HTTP ${res.status}`);
    }
    await new Promise((r) => setTimeout(r, config.POLL_INTERVAL_MS));
  }
}

async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`clip download returned HTTP ${res.status}`);
  const tmp = outPath + '.part';
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  fs.renameSync(tmp, outPath);
}

module.exports = { start, waitForVideo, download, FatalGenerationError };
