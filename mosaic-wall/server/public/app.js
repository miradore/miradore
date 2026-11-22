(() => {
  'use strict';
  const OUT_W = 1080, OUT_H = 1350;
  const THANKS_SECONDS = 20;   // thank-you screen returns to attract after this
  const IDLE_SECONDS = 90;     // any other screen left untouched returns to attract after this

  const $ = (id) => document.getElementById(id);
  const video = $('video'), still = $('still'), count = $('count'), camMsg = $('camMsg'), hint = $('hint');
  const state = { theme: null, blob: null, stream: null, busy: false, timers: [] };

  // ---------------------------------------------------------------- navigation

  function go(name) {
    state.timers.forEach(clearTimeout);
    state.timers = [];
    state.busy = false; // a countdown cut short by leaving the screen must not lock the booth
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === name));
    if (name !== 'camera') stopCamera();
    if (name === 'attract') reset();
    if (name === 'themes') loadThemes();
    if (name === 'camera') startCamera();
    armIdle(name);
  }

  function reset() {
    state.theme = null;
    state.blob = null;
    state.busy = false;
    $('consentBox').checked = false;
    $('consentNext').disabled = true;
    if (still.src) URL.revokeObjectURL(still.src);
    still.removeAttribute('src');
    $('qr').removeAttribute('src');
  }

  let idleTimer = null;
  function armIdle(name) {
    clearTimeout(idleTimer);
    const current = name || document.querySelector('.screen.active').id;
    if (current === 'attract' || current === 'thanks') return;
    idleTimer = setTimeout(() => { if (!state.busy) go('attract'); else armIdle(); }, IDLE_SECONDS * 1000);
  }
  document.addEventListener('pointerdown', () => armIdle(), true);

  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  $('consentBox').addEventListener('change', (e) => { $('consentNext').disabled = !e.target.checked; });
  $('consentNext').addEventListener('click', () => go('themes'));

  // ---------------------------------------------------------------- themes

  async function loadThemes() {
    const list = $('themeList');
    list.textContent = '';
    try {
      const themes = await (await fetch('/api/themes')).json();
      for (const t of themes) {
        const b = document.createElement('button');
        b.className = 'theme';
        b.textContent = t.label;
        b.style.background = t.color || '#FF6B35';
        b.addEventListener('click', () => { state.theme = t.id; go('camera'); });
        list.appendChild(b);
      }
    } catch (e) {
      list.textContent = 'Could not load the themes. Please call a host.';
    }
  }

  // ---------------------------------------------------------------- camera

  function showLive(live) {
    $('liveBtns').hidden = !live;
    $('reviewBtns').hidden = live;
    still.hidden = live;
    video.hidden = !live;
    hint.textContent = live ? 'Fit your face in the oval' : 'Happy with it?';
  }

  async function startCamera() {
    showLive(true);
    camMsg.hidden = true;
    count.hidden = true;
    $('shoot').disabled = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return cameraError('The camera needs a secure address. Open this page with https:// (see the README).');
    }
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1440 } },
      });
      video.srcObject = state.stream;
      await video.play();
      $('shoot').disabled = false;
    } catch (e) {
      cameraError('Camera is blocked. In Settings, Safari, Camera choose Allow, then reload.');
    }
  }

  function cameraError(text) {
    camMsg.textContent = text;
    camMsg.hidden = false;
  }

  function stopCamera() {
    if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
    video.srcObject = null;
  }

  const wait = (ms) => new Promise((r) => state.timers.push(setTimeout(r, ms)));

  $('shoot').addEventListener('click', async () => {
    if (state.busy) return;
    state.busy = true;
    $('shoot').disabled = true;
    count.hidden = false;
    for (const n of [3, 2, 1]) { count.textContent = n; await wait(1000); }
    count.hidden = true;
    state.blob = await capture();
    still.src = URL.createObjectURL(state.blob);
    document.querySelector('.stage').classList.add('flash');
    setTimeout(() => document.querySelector('.stage').classList.remove('flash'), 400);
    showLive(false);
    $('submit').disabled = false;
    state.busy = false;
  });

  /** Centre-crops the camera frame to 4:5 and scales to 1080x1350. Saved un-mirrored, as others see the guest. */
  function capture() {
    const c = document.createElement('canvas');
    c.width = OUT_W;
    c.height = OUT_H;
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.max(OUT_W / vw, OUT_H / vh);
    const sw = OUT_W / scale, sh = OUT_H / scale;
    c.getContext('2d').drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, OUT_W, OUT_H);
    return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.9));
  }

  $('retake').addEventListener('click', () => {
    if (state.busy) return;
    state.blob = null;
    showLive(true);
    $('shoot').disabled = false;
  });

  $('submit').addEventListener('click', async () => {
    if (state.busy || !state.blob) return;
    state.busy = true;
    $('submit').disabled = true;
    hint.textContent = 'Sending…';
    try {
      const form = new FormData();
      form.append('theme', state.theme);
      form.append('photo', state.blob, 'photo.jpg');
      const res = await fetch('/api/jobs', { method: 'POST', body: form });
      if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
      const { jobId } = await res.json();
      state.busy = false;
      showThanks(jobId);
    } catch (e) {
      state.busy = false;
      $('submit').disabled = false;
      hint.textContent = 'That did not send. Tap Submit to try again.';
    }
  });

  // ---------------------------------------------------------------- thank you

  function showThanks(jobId) {
    go('thanks');
    $('qr').src = '/api/qr/' + jobId + '.svg';
    $('jobCode').textContent = jobId;
    let left = THANKS_SECONDS;
    const tickDown = () => {
      $('resetIn').textContent = '(' + left + ')';
      if (left-- <= 0) return go('attract');
      state.timers.push(setTimeout(tickDown, 1000));
    };
    tickDown();
  }

  // Kiosk hygiene: no pinch zoom, no context menu.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
})();
