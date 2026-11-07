// Sampler and mixer for the Gate of the Sun score.
//
// Samples (VSCO 2 Community Edition, CC0) are decoded once, peak normalised and
// cached in memory. Each voice reads its source with 4-point Hermite
// interpolation at a ratio of (sourceRate / 48000) * 2^(semitones / 12), so the
// sample-rate conversion to 48 kHz and the repitch happen in one stage. Long
// sustains loop a crossfaded region of the sample when the note outlasts it.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readWav } from './wav.js';

export const SR = 48000;

// ---------------------------------------------------------------------------
// Note names
const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Parse a note name such as "A#3", "Db4" or "C4" to MIDI (C4 = 60).
export function noteToMidi(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`Bad note name: ${name}`);
  let n = NOTE_INDEX[m[1].toUpperCase()];
  if (m[2] === '#') n += 1; else if (m[2] === 'b') n -= 1;
  return 12 * (parseInt(m[3], 10) + 1) + n;
}

// Shorthand used by the cue sheet: N('D3') -> 50.
export const N = noteToMidi;

export function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

// Pull a note token out of a VSCO file name, e.g. "VlnEns_susVib_A#3_v1_rr1.wav".
function noteFromFilename(file) {
  const m = /(?:^|_)([A-G]#?)(\d)(?=_|\.|-)/.exec(file);
  return m ? noteToMidi(m[1] + m[2]) : null;
}
function velFromFilename(file) {
  const m = /_v(\d+)(?:_|\.)/.exec(file);
  if (m) return parseInt(m[1], 10);
  // VSCO 1 dynamic words
  const order = ['pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];
  for (let i = order.length - 1; i >= 0; i--) {
    if (new RegExp(`_${order[i]}(?:_|\\.|-)`).test(file)) return i + 1;
  }
  return 1;
}
function rrFromFilename(file) {
  const m = /_(?:rr|RR|r)(\d+)/.exec(file) || /_(\d+)\.wav$/i.exec(file);
  return m ? parseInt(m[1], 10) : 1;
}

// ---------------------------------------------------------------------------
// Library: scans instrument folders, holds zones, decodes lazily.

export class Library {
  constructor(root) {
    this.root = root;
    this.cache = new Map();
    this.failed = [];
    this.instruments = new Map();
  }

  // Register an instrument from a folder. `filter` is a RegExp on the file name,
  // `roots` optionally maps a file name fragment to a MIDI root for unpitched
  // files (used for timpani).
  define(name, folder, opts = {}) {
    const dir = join(this.root, folder);
    let files = [];
    try {
      files = readdirSync(dir).filter((f) => /\.wav$/i.test(f) && statSync(join(dir, f)).isFile());
    } catch (e) {
      this.failed.push(`${name}: cannot read folder ${dir}`);
    }
    if (opts.filter) files = files.filter((f) => opts.filter.test(f));
    const zones = files.map((f) => {
      let midi = noteFromFilename(f);
      if (opts.roots) {
        for (const [frag, root] of Object.entries(opts.roots)) if (f.includes(frag)) midi = root;
      }
      if (midi == null) midi = opts.defaultRoot ?? 60;
      return { path: join(dir, f), file: f, midi, vel: velFromFilename(f), rr: rrFromFilename(f) };
    });
    if (zones.length === 0) this.failed.push(`${name}: no samples matched in ${folder}`);
    const vels = [...new Set(zones.map((z) => z.vel))].sort((a, b) => a - b);
    this.instruments.set(name, { name, zones, vels, loop: !!opts.loop, attack: opts.attack ?? 0.02, release: opts.release ?? 0.6, send: opts.send ?? 0.3, gain: opts.gain ?? 1, hold: opts.hold ?? null });
    return this;
  }

  get(name) {
    const inst = this.instruments.get(name);
    if (!inst) throw new Error(`Unknown instrument ${name}`);
    return inst;
  }

  // Pick the zone nearest in pitch, then the velocity layer nearest `vel` (0..1),
  // then a round robin chosen by `rrSeed`.
  pickZone(inst, midi, vel, rrSeed = 0) {
    let best = Infinity;
    for (const z of inst.zones) best = Math.min(best, Math.abs(z.midi - midi));
    let cands = inst.zones.filter((z) => Math.abs(z.midi - midi) === best);
    const wantVel = inst.vels[Math.round(Math.max(0, Math.min(1, vel)) * (inst.vels.length - 1))];
    let bestV = Infinity;
    for (const z of cands) bestV = Math.min(bestV, Math.abs(z.vel - wantVel));
    cands = cands.filter((z) => Math.abs(z.vel - wantVel) === bestV);
    return cands[Math.abs(rrSeed) % cands.length];
  }

  // Decode, peak normalise, cache.
  load(zone) {
    let s = this.cache.get(zone.path);
    if (s) return s;
    try {
      const w = readWav(zone.path);
      let pk = 1e-9;
      for (const ch of w.channels) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > pk) pk = a; }
      const g = 1 / pk;
      for (const ch of w.channels) for (let i = 0; i < ch.length; i++) ch[i] *= g;
      const L = w.channels[0];
      const R = w.channels[1] || w.channels[0];
      s = { L, R, rate: w.sampleRate, frames: w.frames };
    } catch (e) {
      this.failed.push(`${zone.file}: ${e.message}`);
      s = { L: new Float32Array(16), R: new Float32Array(16), rate: 44100, frames: 16 };
    }
    this.cache.set(zone.path, s);
    return s;
  }
}

// ---------------------------------------------------------------------------
// Mixer: stereo Float64 buffers plus a reverb send bus.

function hermite(x0, x1, x2, x3, t) {
  const c0 = x1;
  const c1 = 0.5 * (x2 - x0);
  const c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3;
  const c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
  return ((c3 * t + c2) * t + c1) * t + c0;
}

export class Mixer {
  constructor(seconds, sr = SR) {
    this.sr = sr;
    this.n = Math.round(seconds * sr);
    this.L = new Float64Array(this.n);
    this.R = new Float64Array(this.n);
    this.sendL = new Float64Array(this.n);
    this.sendR = new Float64Array(this.n);
    this.voices = 0;
  }

  // Evaluate a breakpoint envelope [[t, g], ...] (t relative to note start) at time t.
  static envAt(env, t) {
    if (!env || env.length === 0) return 1;
    if (t <= env[0][0]) return env[0][1];
    for (let i = 1; i < env.length; i++) {
      if (t <= env[i][0]) {
        const [t0, g0] = env[i - 1]; const [t1, g1] = env[i];
        return g0 + (g1 - g0) * ((t - t0) / Math.max(1e-9, t1 - t0));
      }
    }
    return env[env.length - 1][1];
  }

  // Add one stereo signal (Float64Array pair) at time t, with pan and send.
  addStereo(t, sigL, sigR, { gain = 1, pan = 0, send = 0.2 } = {}) {
    const start = Math.round(t * this.sr);
    const gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2;
    const gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
    const n = Math.min(sigL.length, this.n - start);
    for (let i = 0; i < n; i++) {
      const j = start + i; if (j < 0) continue;
      const l = sigL[i] * gain * gl, r = sigR[i] * gain * gr;
      this.L[j] += l; this.R[j] += r;
      this.sendL[j] += l * send; this.sendR[j] += r * send;
    }
  }
  addMono(t, sig, opts) { this.addStereo(t, sig, sig, opts); }

  // Render a sampled note into the mix.
  // opts: { midi, dur, vel, gain, pan, attack, release, env, send, rr, loop, offset, semis }
  note(lib, instName, t, opts) {
    const inst = lib.get(instName);
    const midi = opts.midi ?? 60;
    const vel = opts.vel ?? 0.6;
    const zone = lib.pickZone(inst, midi, vel, opts.rr ?? Math.floor(t * 1000));
    const s = lib.load(zone);
    const semis = (midi - zone.midi) + (opts.semis ?? 0);
    const ratio = (s.rate / this.sr) * Math.pow(2, semis / 12);
    const attack = Math.max(0.001, opts.attack ?? inst.attack);
    const release = Math.max(0.005, opts.release ?? inst.release);
    const dur = opts.dur ?? (s.frames / s.rate / ratio);
    const gain = (opts.gain ?? 1) * inst.gain;
    const pan = opts.pan ?? 0;
    const send = opts.send ?? inst.send;
    const env = opts.env ?? null;
    const loop = opts.loop ?? inst.loop;
    const gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2;
    const gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;

    const total = Math.ceil((dur + release) * this.sr);
    const start = Math.round(t * this.sr);
    const srcLen = s.frames;
    // Loop region: middle of the sample, with an equal-power crossfade.
    const loopStart = Math.floor(srcLen * 0.38);
    const loopEnd = Math.floor(srcLen * 0.86);
    const loopLen = loopEnd - loopStart;
    const xf = Math.min(Math.floor(0.6 * s.rate), Math.floor(loopLen * 0.45));
    let pos = (opts.offset ?? 0) * s.rate;
    const L = s.L, R = s.R;
    const relSamples = release * this.sr;
    const attSamples = attack * this.sr;
    const durSamples = dur * this.sr;
    const inv = 1 / this.sr;
    const mL = this.L, mR = this.R, sL = this.sendL, sR = this.sendR;

    for (let i = 0; i < total; i++) {
      const j = start + i;
      if (j >= this.n) break;
      if (loop && pos >= loopEnd) pos -= loopLen;
      if (!loop && pos >= srcLen - 3) break;
      let e = 1;
      if (i < attSamples) e = i / attSamples;
      if (i > durSamples) {
        const r = (i - durSamples) / relSamples;
        if (r >= 1) break;
        // Exponential-like release: smooth to -60 dB
        e *= Math.pow(1 - r, 2) * (1 - r);
      }
      if (env) e *= Mixer.envAt(env, i * inv);
      const ip = Math.floor(pos);
      const fr = pos - ip;
      const i0 = ip > 0 ? ip - 1 : 0;
      const i2 = ip + 1 < srcLen ? ip + 1 : srcLen - 1;
      const i3 = ip + 2 < srcLen ? ip + 2 : srcLen - 1;
      let l = hermite(L[i0], L[ip], L[i2], L[i3], fr);
      let r = hermite(R[i0], R[ip], R[ip + 1 < srcLen ? ip + 1 : srcLen - 1], R[i3], fr);
      if (loop && pos > loopEnd - xf) {
        // Crossfade with the matching point one loop earlier
        const a = (pos - (loopEnd - xf)) / xf;
        const p2 = pos - loopLen;
        const q = Math.floor(p2), f2 = p2 - q;
        const l2 = hermite(L[q - 1], L[q], L[q + 1], L[q + 2], f2);
        const r2 = hermite(R[q - 1], R[q], R[q + 1], R[q + 2], f2);
        const wa = Math.cos(a * Math.PI / 2), wb = Math.sin(a * Math.PI / 2);
        l = l * wa + l2 * wb; r = r * wa + r2 * wb;
      }
      if (j >= 0) {
        const ol = l * e * gain * gl, or = r * e * gain * gr;
        mL[j] += ol; mR[j] += or;
        sL[j] += ol * send; sR[j] += or * send;
      }
      pos += ratio;
    }
    this.voices++;
  }
}
