// Synthesised elements. Every function returns a mono Float64Array (or a
// stereo pair) at 48 kHz that the mixer places in time. No samples are used
// here: the choir, heartbeat, wind, steam, glass, footsteps, sub booms, the
// ambience bed (wind, swallows, water, bells) and the pre-impact suctions are
// all generated.

import { SR, midiToFreq } from './sampler.js';
import { Biquad } from './dsp.js';

// Deterministic PRNG (mulberry32) so renders are reproducible.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buf = (sec) => new Float64Array(Math.ceil(sec * SR));

// Raised-cosine fade over the last `sec` of each channel, so signals whose
// decay is still audible at the end of their buffer do not stop abruptly.
function tailFade(chans, sec) {
  for (const ch of chans) {
    const n = Math.min(ch.length, Math.round(sec * SR));
    for (let i = 0; i < n; i++) ch[ch.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / n);
  }
}

// Breakpoint envelope [[t, g], ...] evaluated at t (linear between points).
function envAt(env, t) {
  if (!env || env.length === 0) return 1;
  if (t <= env[0][0]) return env[0][1];
  for (let i = 1; i < env.length; i++) if (t <= env[i][0]) {
    const [t0, g0] = env[i - 1], [t1, g1] = env[i];
    return g0 + (g1 - g0) * (t - t0) / Math.max(1e-9, t1 - t0);
  }
  return env[env.length - 1][1];
}

// Quiet high ringing after the flash: a sine at `freq` fading exponentially.
export function sineTone({ freq = 6000, dur = 4, gain = 0.02, decay = 1.2 } = {}) {
  const out = buf(dur);
  const w = 2 * Math.PI * freq / SR;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const fadeIn = Math.min(1, t / 0.01);
    out[i] = Math.sin(w * i) * gain * Math.exp(-t / decay) * fadeIn * (1 - Math.pow(t / dur, 8));
  }
  return out;
}

// One 'lub' or 'dub': 60 Hz sine with a pitch drop and a fast decay.
function thump(out, at, f0, f1, amp, decay) {
  const start = Math.round(at * SR);
  const len = Math.round(decay * 6 * SR);
  let phase = 0;
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t / 0.05);
    phase += 2 * Math.PI * f / SR;
    const env = Math.exp(-t / decay) * Math.min(1, t / 0.004);
    out[start + i] += Math.sin(phase) * amp * env;
  }
}

// Heartbeat at `bpm` from 0 to `dur` seconds. Each beat is lub then dub 0.18 s later.
export function heartbeat({ dur = 10, bpm = 72, gain = 0.3 } = {}) {
  const out = buf(dur + 1);
  const period = 60 / bpm;
  for (let t = 0; t < dur; t += period) {
    thump(out, t, 72, 52, gain, 0.09);
    thump(out, t + 0.18, 64, 48, gain * 0.62, 0.075);
  }
  return out;
}

// Sub boom: sine sweeping from f0 down to f1 with a long decay.
export function subBoom({ f0 = 42, f1 = 30, dur = 2.5, gain = 0.8 } = {}) {
  const out = buf(dur);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t / 0.4);
    phase += 2 * Math.PI * f / SR;
    out[i] = Math.sin(phase) * gain * Math.exp(-t / (dur * 0.35)) * Math.min(1, t / 0.006);
  }
  tailFade([out], 0.5);
  return out;
}

// Low rumble: filtered noise plus a 35 Hz sine, decaying over `dur`.
export function rumble({ dur = 3, gain = 0.5, seed = 7 } = {}) {
  const r = rng(seed);
  const out = buf(dur);
  const lp = new Biquad(); lp.set('lp', 90, 0.9);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    phase += 2 * Math.PI * 35 / SR;
    const env = Math.exp(-t / (dur * 0.4)) * Math.min(1, t / 0.02);
    out[i] = (lp.run((r() * 2 - 1) * 1.2) + 0.6 * Math.sin(phase)) * gain * env;
  }
  tailFade([out], 0.6);
  return out;
}

// Band-passed noise with a sweeping centre frequency and a breakpoint gain
// envelope. Used for the shock-wave wind and the steam hiss. Returns stereo.
export function noiseBand({ dur = 3, f0 = 2000, f1 = 150, q = 1.2, env = [[0, 0], [0.1, 1], [3, 0]], gain = 0.3, seed = 3, flutter = 0 } = {}) {
  const r = rng(seed);
  const L = buf(dur), R = buf(dur);
  const bl = new Biquad(), br = new Biquad();
  const hp = new Biquad(); hp.set('hp', 40, 0.7);
  let fl = 0, flState = 0;
  // The right channel blends two noise sources; dividing by their combined
  // RMS (sqrt(0.7^2 + 0.3^2)) keeps it level with the left. Before the polish
  // pass the right channel sat 2.4 dB low.
  const rNorm = 1 / Math.sqrt(0.7 * 0.7 + 0.3 * 0.3);
  for (let i = 0; i < L.length; i++) {
    const t = i / SR;
    if ((i & 63) === 0) {
      const f = f0 * Math.pow(f1 / f0, Math.min(1, t / dur));
      bl.set('bp', f, q); br.set('bp', f * 1.03, q);
      // slow random flutter of level for steam
      flState += (r() * 2 - 1) * 0.3; flState *= 0.9; fl = 1 + flutter * flState;
    }
    const e = envAt(env, t) * gain * fl;
    const n1 = r() * 2 - 1, n2 = r() * 2 - 1;
    L[i] = hp.run(bl.run(n1)) * e;
    R[i] = br.run((n2 * 0.7 + n1 * 0.3) * rNorm) * e;
  }
  return [L, R];
}

// Glass shatter: many very short bright noise bursts plus high sine pings.
export function glassShatter({ dur = 0.9, gain = 0.5, seed = 11 } = {}) {
  const r = rng(seed);
  const L = buf(dur), R = buf(dur);
  const bursts = 28;
  for (let b = 0; b < bursts; b++) {
    const at = Math.pow(r(), 1.6) * 0.55;
    const len = 0.006 + r() * 0.025;
    const f = 2500 + r() * 7000;
    const bp = new Biquad(); bp.set('bp', f, 6);
    const pan = r() * 2 - 1;
    const amp = gain * (0.5 + 0.5 * r()) * (1 - at / 0.7);
    const s0 = Math.round(at * SR), n = Math.round(len * SR);
    for (let i = 0; i < n && s0 + i < L.length; i++) {
      const e = Math.exp(-i / (n * 0.3)) * Math.min(1, i / 48);
      const v = bp.run(r() * 2 - 1) * amp * e * 3;
      L[s0 + i] += v * (1 - pan) * 0.5; R[s0 + i] += v * (1 + pan) * 0.5;
    }
  }
  // pings: struck-glass partials
  for (let p = 0; p < 9; p++) {
    const at = Math.pow(r(), 1.4) * 0.4;
    const f = 3200 + r() * 4800;
    const dec = 0.08 + r() * 0.25;
    const pan = r() * 2 - 1;
    const s0 = Math.round(at * SR);
    const amp = gain * 0.25 * (0.4 + r() * 0.6);
    for (let i = 0; s0 + i < L.length; i++) {
      const t = i / SR;
      const e = Math.exp(-t / dec);
      if (e < 1e-4) break;
      const v = Math.sin(2 * Math.PI * f * t) * amp * e;
      L[s0 + i] += v * (1 - pan) * 0.5; R[s0 + i] += v * (1 + pan) * 0.5;
    }
  }
  tailFade([L, R], 0.25);
  return [L, R];
}

// Metallic footstep: 50 Hz thump, a filtered noise click and struck-metal
// partials at 600, 1340 and 2100 Hz with different decay times.
export function footstep({ gain = 0.35, seed = 5 } = {}) {
  const r = rng(seed);
  const dur = 1.4;
  const out = buf(dur);
  thump(out, 0, 58, 46, gain * 1.4, 0.12);
  const bp = new Biquad(); bp.set('bp', 2200, 2.5);
  const partials = [[600, 0.75, 1.0], [1340, 0.45, 0.55], [2100, 0.3, 0.35], [3470, 0.18, 0.18]];
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let v = 0;
    if (t < 0.02) v += bp.run(r() * 2 - 1) * Math.exp(-t / 0.005) * gain * 2.5;
    for (const [f, dec, a] of partials) v += Math.sin(2 * Math.PI * f * t * (1 + 0.0007 * Math.sin(t * 9))) * a * Math.exp(-t / dec) * gain * 0.45;
    out[i] += v * Math.min(1, t / 0.0015);
  }
  tailFade([out], 0.35);
  return out;
}

// PolyBLEP sawtooth, band limited enough for formant filtering.
function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// Formant choir pad. `notes` is a list of MIDI numbers; each gets 3 detuned
// saw voices with slow vibrato, mixed through 3 parallel bandpass formant
// filters that morph from 'oo' to 'ah'. Returns stereo.
export function choir({ notes, dur = 4, gain = 0.1, attack = 0.9, release = 1.6, vowel = 0.35, seed = 21, env = null } = {}) {
  const r = rng(seed);
  const total = dur + release;
  const L = buf(total), R = buf(total);
  const oo = [[330, 9, 1.0], [870, 11, 0.42], [2250, 12, 0.22]];
  const ah = [[720, 7, 1.0], [1120, 9, 0.6], [2500, 11, 0.3]];
  for (let vi = 0; vi < notes.length; vi++) {
    const m = notes[vi];
    const f = midiToFreq(m);
    const pan = (vi / Math.max(1, notes.length - 1)) * 1.2 - 0.6;
    const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
    const voices = [];
    for (let k = 0; k < 3; k++) {
      voices.push({ ph: r(), det: Math.pow(2, ((k - 1) * 7 + (r() - 0.5) * 3) / 1200), vibRate: 4.6 + r() * 1.2, vibPh: r() * 6.28, vibDepth: 0.004 + r() * 0.004 });
    }
    const filt = [new Biquad(), new Biquad(), new Biquad()];
    const fl = new Biquad(); fl.set('lp', 3800, 0.7);
    const onset = r() * 0.25; // voices do not start exactly together
    let filtersReady = false;
    for (let i = 0; i < L.length; i++) {
      const t = i / SR - onset;
      if (t < 0) continue;
      let e;
      if (t < attack) e = Math.pow(t / attack, 1.6);
      else if (t < dur) e = 1;
      else { const q = (t - dur) / release; if (q >= 1) break; e = (1 - q) * (1 - q); }
      e *= envAt(env, t);
      if ((i & 31) === 0 || !filtersReady) {
        filtersReady = true;
        const vw = Math.max(0, Math.min(1, vowel + 0.25 * Math.sin(t * 0.35 + vi)));
        for (let k = 0; k < 3; k++) {
          const fc = oo[k][0] * (1 - vw) + ah[k][0] * vw;
          const q = oo[k][1] * (1 - vw) + ah[k][1] * vw;
          filt[k].set('bp', fc, q);
          filt[k].g = oo[k][2] * (1 - vw) + ah[k][2] * vw;
        }
      }
      let s = 0;
      for (const v of voices) {
        const vib = 1 + v.vibDepth * Math.sin(2 * Math.PI * v.vibRate * t + v.vibPh) * Math.min(1, t / 1.5);
        const dt = f * v.det * vib / SR;
        v.ph += dt; if (v.ph >= 1) v.ph -= 1;
        s += (2 * v.ph - 1) - polyBlep(v.ph, dt);
      }
      s /= 3;
      let y = 0;
      for (let k = 0; k < 3; k++) y += filt[k].run(s) * filt[k].g;
      y = fl.run(y) * e * gain;
      L[i] += y * gl; R[i] += y * gr;
    }
  }
  return [L, R];
}

// ---------------------------------------------------------------------------
// Ambience bed for the calm opening (0 to 14.5 s). Everything here is quiet,
// distant and diegetic; render.js meters it as a separate stem.

// Slow random gust curve in 0..1: a smoothed random walk updated every 64
// samples, then a one-pole lowpass with a time constant of `tau` seconds.
function gustCurve(n, r, tau = 1.4) {
  const out = new Float64Array(n);
  const k = 1 - Math.exp(-64 / (tau * SR));
  let target = 0.5, v = 0.5, w = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 63) === 0) {
      w += (r() - 0.5) * 0.06; w *= 0.995;
      target = Math.max(0, Math.min(1, 0.5 + w + (r() - 0.5) * 0.25));
      v += k * (target - v);
    }
    out[i] = v;
  }
  return out;
}

// Soft wind: decorrelated noise per channel through a bandpass whose centre
// follows the gusts (roughly 250 to 650 Hz), a faint airy band higher up, and
// a breakpoint envelope. Returns stereo.
export function wind({ dur = 14.5, gain = 0.05, seed = 51, env = [[0, 0], [1.2, 1], [dur, 1]] } = {}) {
  const r = rng(seed);
  const n = Math.ceil(dur * SR);
  const L = new Float64Array(n), R = new Float64Array(n);
  const gust = gustCurve(n, r, 1.6);
  const gustR = gustCurve(n, rng(seed + 1), 1.6);
  const chans = [[L, gust, new Biquad(), new Biquad(), new Biquad()], [R, gustR, new Biquad(), new Biquad(), new Biquad()]];
  for (const [, , , , lp] of chans) lp.set('lp', 3200, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = envAt(env, t) * gain;
    for (const [out, gc, body, air, lp] of chans) {
      // shared gust (70 percent) with a little per-channel movement
      const g = 0.7 * gust[i] + 0.3 * gc[i];
      if ((i & 63) === 0) {
        body.set('bp', 250 + 400 * g, 0.8);
        air.set('bp', 1700 + 900 * g, 3.5);
      }
      const x = r() * 2 - 1;
      const y = body.run(x) * (0.45 + 0.55 * g) + air.run(x) * 0.12 * g * g;
      out[i] = lp.run(y) * e;
    }
  }
  return [L, R];
}

// One distant swallow call: a short burst of 2 to 5 FM chirps. Each chirp is a
// sine carrier sweeping exponentially (mostly downwards, 7 to 3 kHz) with a
// fast frequency modulator (180 to 320 Hz, index about 1) for the twitter,
// under a smooth sine-power envelope. Returns mono.
export function swallowCall({ gain = 0.02, seed = 61 } = {}) {
  const r = rng(seed);
  const chirps = 2 + Math.floor(r() * 4);
  const out = buf(0.8);
  const lp = new Biquad(); lp.set('lp', 8500, 0.7);
  let at = 0.005;
  for (let c = 0; c < chirps; c++) {
    const len = 0.035 + r() * 0.035;
    const up = r() < 0.25;
    const fa = up ? 3200 + r() * 1200 : 5200 + r() * 1800;
    const fb = up ? 5200 + r() * 1500 : 2900 + r() * 1300;
    const fm = 180 + r() * 140, idx = 0.6 + r() * 0.9;
    const amp = gain * (0.6 + 0.4 * r());
    const s0 = Math.round(at * SR), n = Math.round(len * SR);
    let ph = 0;
    for (let i = 0; i < n && s0 + i < out.length; i++) {
      const x = i / n;
      const fc = fa * Math.pow(fb / fa, x);
      const f = fc + idx * fm * Math.cos(2 * Math.PI * fm * i / SR);
      ph += 2 * Math.PI * f / SR;
      const e = Math.pow(Math.sin(Math.PI * x), 1.5);
      out[s0 + i] += (Math.sin(ph) + 0.12 * Math.sin(2 * ph)) * amp * e;
    }
    at += len + 0.045 + r() * 0.09;
  }
  for (let i = 0; i < out.length; i++) out[i] = lp.run(out[i]);
  return out;
}

// Gentle water lapping against the canal steps: a series of filtered noise
// swells (bandpass rising about 220 to 650 Hz as each lap builds, then falling
// back), a small bright slap at the crest and the odd tiny gurgle. Returns
// stereo, with slightly different filtering per side.
export function waterLaps({ dur = 5.5, gain = 0.05, seed = 71, fadeIn = 0.5, fadeOut = 0.8 } = {}) {
  const r = rng(seed);
  const n = Math.ceil(dur * SR);
  const L = new Float64Array(n), R = new Float64Array(n);
  let at = 0.05;
  while (at < dur - 0.6) {
    const rise = 0.28 + r() * 0.18, fall = 0.45 + r() * 0.35;
    const amp = 0.6 + 0.4 * r();
    const fLo = 200 + r() * 60, fHi = 560 + r() * 180;
    const pan = (r() - 0.5) * 0.6;
    const bL = new Biquad(), bR = new Biquad(), slap = new Biquad();
    slap.set('bp', 1400 + r() * 1000, 2.2);
    const s0 = Math.round(at * SR), len = Math.round((rise + fall * 3) * SR);
    for (let i = 0; i < len && s0 + i < n; i++) {
      const t = i / SR;
      let e, x;
      if (t < rise) { x = t / rise; e = x * x * (3 - 2 * x); }
      else { x = 1; e = Math.exp(-(t - rise) / fall); }
      const prog = t < rise ? t / rise : Math.max(0, 1 - (t - rise) / (fall * 2));
      if ((i & 31) === 0) {
        const f = fLo + (fHi - fLo) * prog;
        bL.set('bp', f, 1.3); bR.set('bp', f * 1.07, 1.3);
      }
      const nz1 = r() * 2 - 1, nz2 = r() * 2 - 1;
      let vL = bL.run(nz1) * e, vR = bR.run(0.6 * nz1 + 0.8 * nz2) * e;
      // crest slap: 60 ms bright burst starting at the top of the swell
      const ts = t - rise;
      if (ts >= 0 && ts < 0.25) {
        const sv = slap.run(r() * 2 - 1) * Math.exp(-ts / 0.06) * 0.35 * Math.min(1, ts / 0.004);
        vL += sv; vR += sv;
      }
      L[s0 + i] += vL * amp * (1 - pan) * gain;
      R[s0 + i] += vR * amp * (1 + pan) * gain;
    }
    // occasional gurgle: tiny rising sine blip
    if (r() < 0.6) {
      const g0 = Math.round((at + rise + 0.05 + r() * 0.2) * SR);
      const gl = Math.round(0.025 * SR), f0 = 500 + r() * 500;
      let ph = 0;
      for (let i = 0; i < gl && g0 + i < n; i++) {
        const x = i / gl;
        ph += 2 * Math.PI * f0 * (1 + 0.6 * x) / SR;
        const v = Math.sin(ph) * Math.sin(Math.PI * x) * gain * 0.08;
        L[g0 + i] += v; R[g0 + i] += v;
      }
    }
    at += 0.85 + r() * 0.75;
  }
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = Math.min(1, t / fadeIn) * Math.min(1, (dur - t) / fadeOut);
    L[i] *= e; R[i] *= e;
  }
  return [L, R];
}

// Distant church bell: inharmonic partials at 1, 2.0, 2.76, 5.4 and 8.9 times
// the fundamental, each a slightly detuned pair so it beats slowly, with long
// decays (the hum rings longest), a short noise strike and a gentle lowpass
// for air absorption. Returns mono; render.js gives it a wet reverb send.
export function bell({ f0 = 146.83, dur = 12, gain = 0.03, seed = 81 } = {}) {
  const r = rng(seed);
  const out = buf(dur);
  const partials = [
    // ratio, amplitude, decay time constant (s)
    [1.0, 1.0, 5.5],
    [2.0, 0.6, 3.8],
    [2.76, 0.5, 2.6],
    [5.4, 0.28, 1.3],
    [8.9, 0.15, 0.7],
  ];
  for (const [ratio, amp, tau] of partials) {
    const f = f0 * ratio;
    const beat = 0.4 + r() * 1.1;
    const p1 = r() * 6.28, p2 = r() * 6.28;
    const w1 = 2 * Math.PI * f / SR, w2 = 2 * Math.PI * (f + beat) / SR;
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      const e = Math.exp(-t / tau);
      if (e < 1e-4) break;
      out[i] += (Math.sin(w1 * i + p1) + 0.45 * Math.sin(w2 * i + p2)) * amp * e;
    }
  }
  // strike: 4 ms of bandpassed noise
  const bp = new Biquad(); bp.set('bp', 2400, 1.5);
  for (let i = 0; i < Math.round(0.02 * SR); i++) {
    const t = i / SR;
    out[i] += bp.run(r() * 2 - 1) * Math.exp(-t / 0.004) * 1.2;
  }
  const lp = new Biquad(); lp.set('lp', 4000, 0.7);
  for (let i = 0; i < out.length; i++) out[i] = lp.run(out[i]) * gain * Math.min(1, i / 48);
  tailFade([out], Math.min(1.5, dur * 0.2));
  return out;
}

// Pre-impact suction: a 40 ms burst of decorrelated stereo noise with a fast
// exponential decay and a lowpass falling from about 9 kHz to 600 Hz, then
// reversed in time, so it swells and brightens into the hit. The last sample
// of the array is the sample just before the impact frame.
export function suction({ dur = 0.04, gain = 0.3, seed = 91 } = {}) {
  const r = rng(seed);
  const n = Math.round(dur * SR);
  const L = new Float64Array(n), R = new Float64Array(n);
  const lpL = [new Biquad(), new Biquad()], lpR = [new Biquad(), new Biquad()];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((i & 15) === 0) {
      const f = 9000 * Math.pow(600 / 9000, t / dur);
      for (const b of [...lpL, ...lpR]) b.set('lp', f, 0.8);
    }
    const e = Math.exp(-t / 0.011) * Math.min(1, t / 0.0004);
    const a = r() * 2 - 1, b = r() * 2 - 1;
    L[i] = lpL[1].run(lpL[0].run(a)) * e * gain;
    R[i] = lpR[1].run(lpR[0].run(0.5 * a + 0.866 * b)) * e * gain;
  }
  L.reverse(); R.reverse();
  return [L, R];
}
