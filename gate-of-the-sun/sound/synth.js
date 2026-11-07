// Synthesised elements. Every function returns a mono Float64Array (or a
// stereo pair) at 48 kHz that the mixer places in time. No samples are used
// here: the choir, heartbeat, wind, steam, glass, footsteps and sub booms are
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
  const envAt = (t) => {
    if (t <= env[0][0]) return env[0][1];
    for (let i = 1; i < env.length; i++) if (t <= env[i][0]) {
      const [t0, g0] = env[i - 1], [t1, g1] = env[i];
      return g0 + (g1 - g0) * (t - t0) / Math.max(1e-9, t1 - t0);
    }
    return env[env.length - 1][1];
  };
  for (let i = 0; i < L.length; i++) {
    const t = i / SR;
    if ((i & 63) === 0) {
      const f = f0 * Math.pow(f1 / f0, Math.min(1, t / dur));
      bl.set('bp', f, q); br.set('bp', f * 1.03, q);
      // slow random flutter of level for steam
      flState += (r() * 2 - 1) * 0.3; flState *= 0.9; fl = 1 + flutter * flState;
    }
    const e = envAt(t) * gain * fl;
    const n1 = r() * 2 - 1, n2 = r() * 2 - 1;
    L[i] = hp.run(bl.run(n1)) * e;
    R[i] = br.run(n2 * 0.7 + n1 * 0.3) * e;
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
  const envAt = (t) => {
    if (!env) return 1;
    if (t <= env[0][0]) return env[0][1];
    for (let i = 1; i < env.length; i++) if (t <= env[i][0]) {
      const [t0, g0] = env[i - 1], [t1, g1] = env[i];
      return g0 + (g1 - g0) * (t - t0) / Math.max(1e-9, t1 - t0);
    }
    return env[env.length - 1][1];
  };
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
      e *= envAt(t);
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
