(() => {
  'use strict';
  const OUT_W = 1080, OUT_H = 1350;
  const THANKS_SECONDS = 20;   // thank-you screen returns to the start after this
  const IDLE_SECONDS = 90;     // any other screen left untouched returns to the start after this
  const UPLOAD_TIMEOUT_MS = 20000;

  const $ = (id) => document.getElementById(id);
  const video = $('video'), still = $('still'), count = $('count'), camMsg = $('camMsg'), hint = $('hint');
  const canvas = document.createElement('canvas'); // one canvas for every guest; iOS caps canvas memory
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const state = { theme: null, blob: null, stream: null, busy: false, timers: [] };

  // The booth token arrives once in the address (?k=...) and is remembered, so guests' phones cannot submit jobs.
  let token = new URLSearchParams(location.search).get('k');
  try {
    if (token) localStorage.setItem('boothToken', token);
    else token = localStorage.getItem('boothToken');
  } catch (e) { /* private mode: the address still carries it */ }

  // ---------------------------------------------------------------- navigation

  function go(name) {
    state.timers.forEach(clearTimeout);
    state.timers = [];
    state.busy = false; // a countdown cut short by leaving the screen must not lock the booth
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === name));
    if (name === 'attract') reset();
    if (name === 'themes') loadThemes();
    if (name === 'camera') startCamera();
    const heading = $(name).querySelector('h1, h2');
    if (heading) heading.focus({ preventScroll: true });
    armIdle(name);
  }

  function reset() {
    state.theme = null;
    state.blob = null;
    $('consentBox').checked = false;
    $('consentNext').disabled = true;
    clearStill();
    $('qr').removeAttribute('src');
  }

  function clearStill() {
    if (still.src) URL.revokeObjectURL(still.src);
    still.removeAttribute('src');
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

  async function loadThemes(isRetry) {
    const list = $('themeList'), msg = $('themeMsg');
    list.textContent = '';
    $('themeRetry').hidden = true;
    msg.textContent = 'Loading the worlds…';
    msg.hidden = false;
    try {
      const res = await fetch('/api/themes', { signal: AbortSignal.timeout(8000) });
      const themes = await res.json();
      if (!res.ok || !themes.length) throw new Error('no themes');
      msg.hidden = true;
      for (const t of themes) {
        const b = document.createElement('button');
        b.className = 'theme';
        b.textContent = t.label;
        b.style.background = t.color || '#FF6B35';
        b.addEventListener('click', () => { state.theme = t.id; go('camera'); });
        list.appendChild(b);
      }
    } catch (e) {
      if (!isRetry) return void state.timers.push(setTimeout(() => loadThemes(true), 2000)); // one quiet retry first
      msg.textContent = 'We could not load the worlds. Tap Try again, or ask a host.';
      $('themeRetry').hidden = false;
    }
  }
  $('themeRetry').addEventListener('click', () => loadThemes());

  // ---------------------------------------------------------------- camera

  function showLive(live) {
    $('liveBtns').hidden = !live;
    $('reviewBtns').hidden = live;
    still.hidden = live;
    video.hidden = !live;
    hint.hidden = false;
    hint.textContent = live ? 'Line your face up with the oval' : 'Happy with this one?';
  }

  const streamLive = () => state.stream && state.stream.getVideoTracks().some((t) => t.readyState === 'live');

  // The camera is opened once and kept for the whole session. Asking again for every guest can bring the
  // iOS permission prompt back in a Home Screen app.
  async function startCamera() {
    showLive(true);
    camMsg.hidden = true;
    $('camRetry').hidden = true;
    count.hidden = true;
    $('shoot').hidden = false;
    $('shoot').disabled = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('getUserMedia unavailable: the page must be opened over https');
      return cameraError('The camera is not ready. Please ask a host.', false);
    }
    try {
      if (!streamLive()) {
        hint.textContent = 'Starting the camera…';
        state.stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
        // iOS ends the track when the iPad locks or the app goes to the background.
        state.stream.getVideoTracks()[0].onended = () => { if ($('camera').classList.contains('active')) startCamera(); };
        hint.textContent = 'Line your face up with the oval';
      }
      if (video.srcObject !== state.stream) video.srcObject = state.stream;
      await video.play();
      $('shoot').disabled = false;
    } catch (e) {
      console.warn('camera error:', e && e.name, e && e.message);
      cameraError('The camera is not ready. Tap Try again, or ask a host.', true);
    }
  }

  function cameraError(text, canRetry) {
    camMsg.textContent = text;
    camMsg.hidden = false;
    hint.hidden = true;
    $('shoot').hidden = true;
    $('camRetry').hidden = !canRetry;
  }
  $('camRetry').addEventListener('click', () => { stopCamera(); startCamera(); });

  function stopCamera() {
    if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
    video.srcObject = null;
  }
  window.addEventListener('pagehide', stopCamera);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && $('camera').classList.contains('active') && !state.blob && !streamLive()) startCamera();
  });

  const wait = (ms) => new Promise((r) => state.timers.push(setTimeout(r, ms)));

  $('shoot').addEventListener('click', async () => {
    if (state.busy) return;
    if (!video.videoWidth) return startCamera(); // stream died quietly: never upload a black frame
    state.busy = true;
    $('shoot').disabled = true;
    count.hidden = false;
    for (const n of [3, 2, 1]) { count.textContent = n; await wait(1000); }
    count.hidden = true;
    if (!video.videoWidth) { state.busy = false; return startCamera(); }
    state.blob = await capture();
    clearStill();
    still.src = URL.createObjectURL(state.blob);
    document.querySelector('.stage').classList.add('flash');
    setTimeout(() => document.querySelector('.stage').classList.remove('flash'), 400);
    showLive(false);
    $('submit').disabled = false;
    $('retake').disabled = false;
    state.busy = false;
  });

  /** Centre-crops the camera frame to 4:5 and scales to 1080x1350. Saved un-mirrored, as others see the guest. */
  function capture() {
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.max(OUT_W / vw, OUT_H / vh);
    const sw = OUT_W / scale, sh = OUT_H / scale;
    canvas.getContext('2d').drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, OUT_W, OUT_H);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  }

  $('retake').addEventListener('click', () => {
    if (state.busy) return;
    state.blob = null;
    startCamera();
  });

  $('submit').addEventListener('click', async () => {
    if (state.busy || !state.blob) return;
    state.busy = true;
    $('submit').disabled = true;
    $('retake').disabled = true;
    hint.textContent = 'Sending your photo…';
    try {
      const form = new FormData();
      form.append('theme', state.theme);
      form.append('photo', state.blob, 'photo.jpg');
      const res = await fetch('/api/jobs', {
        method: 'POST', body: form, headers: { 'x-booth-token': token || '' }, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      if (!res.ok) throw Object.assign(new Error('upload failed'), { status: res.status });
      const { jobId } = await res.json();
      state.busy = false;
      showThanks(jobId);
    } catch (e) {
      console.warn('submit failed:', e && (e.status || e.name));
      state.busy = false;
      $('submit').disabled = false;
      $('retake').disabled = false;
      hint.textContent = e && e.status === 429 ? 'The wall is very busy. Please try again in a minute.'
        : e && e.status === 403 ? 'This booth is not set up yet. Please ask a host.'
        : 'That did not go through. Tap Use this photo to try again.';
    }
  });

  // ---------------------------------------------------------------- thank you

  function showThanks(jobId) {
    go('thanks');
    $('qr').src = '/api/qr/' + jobId + '.svg';
    $('jobCode').textContent = jobId;
    let left = THANKS_SECONDS;
    const tickDown = () => {
      $('resetIn').textContent = 'Next guest in ' + left;
      if (left-- <= 0) return go('attract');
      state.timers.push(setTimeout(tickDown, 1000));
    };
    tickDown();
  }

  fetch('/api/config').then((r) => r.json()).then((c) => {
    if (c.wifi) { $('wifi').textContent = 'Your phone needs to be on the Wi-Fi “' + c.wifi + '”.'; $('wifi').hidden = false; }
  }).catch(() => {});

  // Kiosk hygiene: no pinch zoom, no context menu.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
})();
