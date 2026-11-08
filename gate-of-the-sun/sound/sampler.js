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
// The VSCO 2 CE names follow the library's "middle C = C3" convention
// (measured by autocorrelation: a file named A3 sounds at 440 Hz), so a
// file named A3 maps to MIDI 69 here and every sampled note sounds at the
// pitch written in cues.js (N() is scientific, C4 = 60). The shift is set per
// instrument with `nameShift` (default +12); the harp (KSHarp) files are named
// in scientific pitch already (A2 sounds at 110 Hz) and use 0.
export const VSCO_NAME_SHIFT = 12;
function noteFromFilename(file, shift = VSCO_NAME_SHIFT) {
  const m = /(?:^|_)([A-G]#?)(\d)(?=_|\.|-)/.exec(file);
  return m ? noteToMidi(m[1] + m[2]) + shift : null;
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
      let midi = noteFromFilename(f, opts.nameShift ?? VSCO_NAME_SHIFT);
      if (opts.roots) {
        for (const [frag, root] of Object.entries(opts.roots)) if (f.includes(frag)) midi = root;
      }
      if (midi == null) midi = opts.defaultRoot ?? 60;
      return { path: join(dir, f), file: f, midi, vel: velFromFilename(f), rr: rrFromFilename(f) };
    });
    if (zones.length === 0) this.failed.push(`${name}: no samples matched in ${folder}`);
    const vels = [...new Set(zones.map((z) => z.vel))].sort((a, b) => a - b);
    this.instruments.set(name, { name, zones, vels, loop: !!opts.loop, attack: opts.attack ?? 0.02, release: opts.release ?? 0.6, send: opts.send ?? 0.3, gain: opts.gain ?? 1, hold: opts.hold ?? null, lowEnd: !!opts.lowEnd, bus: opts.bus ?? null, defaultRoot: opts.defaultRoot ?? 60 });
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

  // RMS of a zone between `a` and `b` seconds of its (peak-normalised)
  // source, cached, and the geometric mean over all the instrument's zones of
  // the settled sustain (1.2 to 3.0 s). Legato lines use the ratio of the two,
  // measured over the part of the sample that is actually played, so that
  // neighbouring notes taken from different samples sit at the same level.
  zoneRms(zone, a = 1.2, b = 3.0) {
    const s = this.load(zone);
    s.rmsCache = s.rmsCache || new Map();
    const key = `${a.toFixed(3)}:${b.toFixed(3)}`;
    let v = s.rmsCache.get(key);
    if (v == null) {
      const i0 = Math.min(s.frames - 1, Math.round(a * s.rate)), i1 = Math.min(s.frames, Math.round(b * s.rate));
      let sq = 0;
      for (let i = i0; i < i1; i++) sq += 0.5 * (s.L[i] * s.L[i] + s.R[i] * s.R[i]);
      v = Math.sqrt(sq / Math.max(1, i1 - i0)) || 1e-6;
      s.rmsCache.set(key, v);
    }
    return v;
  }
  sustainRef(inst) {
    if (inst.sustainRef == null) {
      let lg = 0;
      for (const z of inst.zones) lg += Math.log(this.zoneRms(z));
      inst.sustainRef = Math.exp(lg / Math.max(1, inst.zones.length));
    }
    return inst.sustainRef;
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
// Mixer: stereo Float64 buses, each with a reverb send.

function hermite(x0, x1, x2, x3, t) {
  const c0 = x1;
  const c1 = 0.5 * (x2 - x0);
  const c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3;
  const c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
  return ((c3 * t + c2) * t + c1) * t + c0;
}

// Buses: 'low' carries the instruments allowed below 60 Hz (bass drums,
// timpani, tuba, contrabass, sub synths, heartbeat); 'hp40' carries the
// cellos and trombones, high-passed at 40 Hz so their lowest written
// fundamentals (cello D2 at 73 Hz, trombone A#1 at 58 Hz) are untouched; 'hp'
// carries everything else and is high-passed at 60 Hz in render.js; 'amb' is
// the diegetic ambience bed, also high-passed at 60 Hz, with its own reverb so
// it can be metered as a stem. Each bus has a dry stereo pair and a reverb send.
export const BUSES = ['low', 'hp40', 'hp', 'amb'];
const EDGE = 0.003; // 3 ms click-safe fade at every note and signal edge

export class Mixer {
  constructor(seconds, sr = SR) {
    this.sr = sr;
    this.n = Math.round(seconds * sr);
    this.bus = {};
    for (const b of BUSES) {
      this.bus[b] = { L: new Float64Array(this.n), R: new Float64Array(this.n), sL: new Float64Array(this.n), sR: new Float64Array(this.n) };
    }
    this.voices = 0;
    this.edgeN = Math.max(1, Math.round(EDGE * sr));
    // Diagnostics: start sample of every voice and signal, edge levels, peaks.
    this.starts = new Map();
    this.edges = { checked: 0, wouldClickEnd: 0, worstRawEnd: 0, worstEnd: 0, worstStart: 0 };
    this.placed = [];
    this.diag = null; // optional { sections: [[a, b], ...] } for per-source L/R energy
  }

  enableDiag(sections) {
    const secOf = new Int8Array(this.n).fill(-1);
    sections.forEach(([a, b], k) => { for (let i = Math.round(a * this.sr); i < Math.min(this.n, Math.round(b * this.sr)); i++) secOf[i] = k; });
    this.diag = { sections, secOf, acc: new Map() };
  }

  _diagAcc(name) {
    if (!this.diag) return null;
    let a = this.diag.acc.get(name);
    if (!a) { a = new Float64Array(this.diag.sections.length * 2); this.diag.acc.set(name, a); }
    return a;
  }

  _markStart(j) { this.starts.set(j, (this.starts.get(j) || 0) + 1); }

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

  // Add one stereo signal (Float64Array pair) at time t (or at an exact
  // sample with `atSample`), with pan, send and bus. Both ends get a 3 ms fade
  // unless `edgeEnd` (seconds) asks for a shorter one at the end.
  addStereo(t, sigL, sigR, { gain = 1, pan = 0, send = 0.2, bus = 'hp', name = 'synth', atSample = null, edgeEnd = EDGE } = {}) {
    const B = this.bus[bus];
    if (!B) throw new Error(`Unknown bus ${bus}`);
    const start = atSample ?? Math.round(t * this.sr);
    const gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2;
    const gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
    const len = sigL.length;
    const n = Math.min(len, this.n - start);
    const en = this.edgeN;
    const enEnd = Math.max(1, Math.round(edgeEnd * this.sr));
    const acc = this._diagAcc(name);
    let pk = 0;
    for (let i = 0; i < n; i++) {
      const j = start + i; if (j < 0) continue;
      let g = gain;
      if (i < en) g *= i / en;
      if (len - 1 - i < enEnd) g *= (len - i) / (enEnd + 1);
      const l = sigL[i] * g * gl, r = sigR[i] * g * gr;
      B.L[j] += l; B.R[j] += r;
      B.sL[j] += l * send; B.sR[j] += r * send;
      const a = Math.max(Math.abs(l), Math.abs(r)); if (a > pk) pk = a;
      if (acc) { const k = this.diag.secOf[j]; if (k >= 0) { acc[2 * k] += l * l; acc[2 * k + 1] += r * r; } }
    }
    this._markStart(start);
    this.placed.push({ name, t: start / this.sr, start, end: start + len, peak: pk, bus });
  }
  addMono(t, sig, opts) { this.addStereo(t, sig, sig, opts); }

  // Render a sampled note into the mix.
  // opts: { midi, dur, vel, gain, pan, attack, release, env, send, rr, loop, offset, semis,
  //         legatoIn (equal-power sine fade-in over `attack`),
  //         legatoOut (equal-power cosine fade-out over `release`), matchSustain, bus }
  note(lib, instName, t, opts) {
    const inst = lib.get(instName);
    // Without a midi number a note plays at its sample's own root (unpitched
    // instruments such as the bass drums). Before the octave fix these were
    // asked for MIDI 60 against a root of 36 and so played two octaves up.
    const midi = opts.midi ?? null;
    const vel = opts.vel ?? 0.6;
    const zone = lib.pickZone(inst, midi ?? inst.defaultRoot, vel, opts.rr ?? Math.floor(t * 1000));
    const s = lib.load(zone);
    const semis = (midi == null ? 0 : midi - zone.midi) + (opts.semis ?? 0);
    const ratio = (s.rate / this.sr) * Math.pow(2, semis / 12);
    const attack = Math.max(EDGE, opts.attack ?? inst.attack);
    const release = Math.max(EDGE, opts.release ?? inst.release);
    const dur = opts.dur ?? (s.frames / s.rate / ratio);
    // matchSustain: level-match the played part of this sample (from the
    // offset, or 0.6 s, for 1.5 s) to the instrument's average sustain
    // (legato lines), clamped to plus or minus 6 dB.
    let match = 1;
    if (opts.matchSustain) {
      const a = Math.max(0.6, opts.offset ?? 0);
      match = Math.min(2, Math.max(0.5, lib.sustainRef(inst) / lib.zoneRms(zone, a, a + 1.5)));
    }
    const gain = (opts.gain ?? 1) * inst.gain * match;
    const pan = opts.pan ?? 0;
    const send = opts.send ?? inst.send;
    const env = opts.env ?? null;
    const loop = opts.loop ?? inst.loop;
    const legatoIn = !!opts.legatoIn, legatoOut = !!opts.legatoOut;
    const B = this.bus[opts.bus ?? inst.bus ?? (inst.lowEnd ? 'low' : 'hp')];
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
    const pos0 = (opts.offset ?? 0) * s.rate;
    let pos = pos0;
    const L = s.L, R = s.R;
    const relSamples = release * this.sr;
    const attSamples = attack * this.sr;
    const durSamples = dur * this.sr;
    const inv = 1 / this.sr;
    // Unlooped notes that run out of source before their release has finished
    // get a 3 ms fade ending exactly where the source ends.
    const srcEndI = loop ? Infinity : Math.floor((srcLen - 3 - pos0) / ratio);
    const en = this.edgeN;
    const mL = B.L, mR = B.R, sL = B.sL, sR = B.sR;
    const acc = this._diagAcc(instName);
    let peak = 0, lastRaw = 0, lastOut = 0, firstOut = -1;

    for (let i = 0; i < total; i++) {
      const j = start + i;
      if (j >= this.n) break;
      if (loop && pos >= loopEnd) pos -= loopLen;
      if (!loop && pos >= srcLen - 3) break;
      let e = 1;
      if (i < attSamples) {
        const a = i / attSamples;
        e = legatoIn ? Math.sin(a * Math.PI / 2) : a;
      }
      if (i > durSamples) {
        const r = (i - durSamples) / relSamples;
        if (r >= 1) break;
        // Legato: equal-power cosine. Otherwise a smooth cubic release to silence.
        e *= legatoOut ? Math.cos(r * Math.PI / 2) : Math.pow(1 - r, 2) * (1 - r);
      }
      if (env) e *= Mixer.envAt(env, i * inv);
      const eRaw = e;
      if (srcEndI - i < en) e *= Math.max(0, (srcEndI - i) / en);
      const ip = Math.floor(pos);
      const fr = pos - ip;
      const i0 = ip > 0 ? ip - 1 : 0;
      const i2 = ip + 1 < srcLen ? ip + 1 : srcLen - 1;
      const i3 = ip + 2 < srcLen ? ip + 2 : srcLen - 1;
      let l = hermite(L[i0], L[ip], L[i2], L[i3], fr);
      let r = hermite(R[i0], R[ip], R[i2], R[i3], fr);
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
        const a = Math.max(Math.abs(ol), Math.abs(or));
        if (a > peak) peak = a;
        if (firstOut < 0) firstOut = a;
        lastOut = a;
        lastRaw = Math.max(Math.abs(l), Math.abs(r)) * eRaw * gain * Math.max(gl, gr);
        if (acc) { const k = this.diag.secOf[j]; if (k >= 0) { acc[2 * k] += ol * ol; acc[2 * k + 1] += or * or; } }
      }
      pos += ratio;
    }
    this.voices++;
    this._markStart(start);
    // Edge check, relative to the voice's own peak (notes cut by the end of
    // the buffer are left to the master fade).
    if (peak > 0 && start + total < this.n) {
      const E = this.edges;
      E.checked++;
      if (lastRaw / peak > 1e-3) E.wouldClickEnd++;
      E.worstRawEnd = Math.max(E.worstRawEnd, lastRaw / peak);
      E.worstEnd = Math.max(E.worstEnd, lastOut / peak);
      E.worstStart = Math.max(E.worstStart, firstOut / peak);
    }
  }
}
