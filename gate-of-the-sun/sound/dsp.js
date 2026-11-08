// Reverb (feedback delay network), filters, limiter and metering.

import { SR } from './sampler.js';

// RBJ biquad, direct form 1. type: 'bp' (constant skirt), 'lp', 'hp'.
export class Biquad {
  constructor() { this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; this.set('lp', 1000, 0.707); }
  set(type, f, q, sr = SR) {
    const w = 2 * Math.PI * Math.min(f, sr * 0.49) / sr;
    const sn = Math.sin(w), cs = Math.cos(w), al = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'bp') { b0 = q * al; b1 = 0; b2 = -q * al; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
    else { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
    a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// Schroeder allpass used for input diffusion.
class Allpass {
  constructor(len, g) { this.buf = new Float64Array(len); this.i = 0; this.g = g; this.len = len; }
  run(x) {
    const d = this.buf[this.i];
    const v = x - this.g * d;
    this.buf[this.i] = v;
    this.i = (this.i + 1) % this.len;
    return d + this.g * v;
  }
}

// Stereo FDN reverb: 8 delay lines, Householder feedback, one-pole damping,
// 20 ms pre-delay, T60 about 2.2 s. Returns [wetL, wetR].
export function reverb(inL, inR, { t60 = 2.2, preDelay = 0.02, damping = 0.35, sr = SR } = {}) {
  const n = inL.length;
  const outL = new Float64Array(n), outR = new Float64Array(n);
  const lens = [1433, 1801, 2251, 2797, 3331, 3889, 4463, 5147].map((l) => Math.round(l * sr / 48000));
  const N = lens.length;
  const lines = lens.map((l) => new Float64Array(l));
  const idx = new Int32Array(N);
  const gains = lens.map((l) => Math.pow(10, -3 * l / (t60 * sr)));
  const lp = new Float64Array(N);
  const pre = Math.round(preDelay * sr);
  const preBufL = new Float64Array(pre + 1), preBufR = new Float64Array(pre + 1);
  let pi = 0;
  const apL = [new Allpass(Math.round(0.0051 * sr), 0.62), new Allpass(Math.round(0.0127 * sr), 0.58)];
  const apR = [new Allpass(Math.round(0.0063 * sr), 0.62), new Allpass(Math.round(0.0139 * sr), 0.58)];
  const signL = [1, -1, 1, -1, 1, -1, 1, -1];
  const signR = [1, 1, -1, -1, 1, 1, -1, -1];
  const read = new Float64Array(N);
  const twoOverN = 2 / N;
  for (let i = 0; i < n; i++) {
    // pre-delay
    preBufL[pi] = inL[i]; preBufR[pi] = inR[i];
    const ri = (pi + 1) % (pre + 1);
    let xl = preBufL[ri], xr = preBufR[ri];
    pi = ri;
    xl = apL[1].run(apL[0].run(xl));
    xr = apR[1].run(apR[0].run(xr));
    let sum = 0;
    for (let k = 0; k < N; k++) { read[k] = lines[k][idx[k]]; sum += read[k]; }
    const hs = sum * twoOverN;
    let ol = 0, or = 0;
    for (let k = 0; k < N; k++) {
      // Householder: y_k = x_k - (2/N) * sum
      let v = (read[k] - hs) * gains[k];
      // damping (one pole lowpass in the loop)
      lp[k] += damping * (v - lp[k]);
      v = lp[k];
      const inj = (k & 1) ? xr : xl;
      lines[k][idx[k]] = v + inj * 0.5;
      idx[k] = (idx[k] + 1) % lens[k];
      ol += read[k] * signL[k];
      or += read[k] * signR[k];
    }
    outL[i] = ol * 0.35; outR[i] = or * 0.35;
  }
  return [outL, outR];
}

// Fourth-order Butterworth high-pass (two cascaded RBJ sections, Q 0.5412 and
// 1.3066), applied in place to each array given. Used at 60 Hz on every bus
// except the low-end bus. Causal, so onsets keep their exact sample positions.
export function highpass4(arrays, f = 60, sr = SR) {
  for (const x of arrays) {
    const a = new Biquad(), b = new Biquad();
    a.set('hp', f, 0.5412, sr); b.set('hp', f, 1.3066, sr);
    for (let i = 0; i < x.length; i++) x[i] = b.run(a.run(x[i]));
  }
}

// Mean square below f (fourth-order Butterworth low-pass) of the mid signal.
export function lowBandPower(L, R, f = 60, sr = SR) {
  const a = new Biquad(), b = new Biquad();
  a.set('lp', f, 0.5412, sr); b.set('lp', f, 1.3066, sr);
  let lo = 0, all = 0;
  for (let i = 0; i < L.length; i++) {
    const m = 0.5 * (L[i] + R[i]);
    const y = b.run(a.run(m));
    lo += y * y; all += m * m;
  }
  return { low: lo / L.length, all: all / L.length };
}

// Soft-knee lookahead peak limiter. Operates in place on L and R. With
// keepGain the per-sample gain curve is returned too (used to meter stems).
export function limiter(L, R, { ceiling = 0.95, knee = 0.25, lookahead = 0.004, release = 0.18, sr = SR, keepGain = false } = {}) {
  const n = L.length;
  const la = Math.round(lookahead * sr);
  const kneeLo = ceiling * (1 - knee);
  // desired gain per sample from a soft knee static curve
  const g = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (a <= kneeLo) { g[i] = 1; continue; }
    // smooth compression from kneeLo to the ceiling asymptote
    const over = a - kneeLo;
    const width = ceiling - kneeLo;
    const y = kneeLo + width * Math.tanh(over / width);
    g[i] = y / a;
  }
  // sliding window minimum over the lookahead (monotonic deque)
  const gm = new Float64Array(n);
  const dq = new Int32Array(n); let head = 0, tail = 0;
  for (let i = 0; i < n; i++) {
    while (tail > head && g[dq[tail - 1]] >= g[i]) tail--;
    dq[tail++] = i;
    const lo = i - la;
    while (dq[head] < lo) head++;
    if (i >= la) gm[i - la] = g[dq[head]];
  }
  for (let i = Math.max(0, n - la); i < n; i++) gm[i] = g[dq[head]];
  // Boxcar average of the windowed minimum over the lookahead: at a peak p every
  // gm[j] for j in [p - la, p] is <= g[p], so the average is too and the ceiling
  // is never exceeded. The release only ever raises the gain slowly.
  const sm = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += gm[i];
    if (i >= la) acc -= gm[i - la];
    sm[i] = acc / Math.min(i + 1, la);
  }
  const relCoef = Math.exp(-1 / (release * sr));
  let env = 1;
  let minEnv = 1;
  const kept = keepGain ? sm : null; // sm is reused to hold the applied gain
  for (let i = 0; i < n; i++) {
    const target = sm[i];
    if (target < env) env = target;
    else env = target + (env - target) * relCoef;
    if (env < minEnv) minEnv = env;
    L[i] *= env; R[i] *= env;
    if (kept) kept[i] = env;
  }
  return { maxReductionDb: 20 * Math.log10(minEnv), gain: kept };
}

export function peakOf(L, R) {
  let pk = 0;
  for (let i = 0; i < L.length; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > pk) pk = a; }
  return pk;
}

export function dB(x) { return x > 1e-9 ? 20 * Math.log10(x) : -180; }

// Peak and RMS per window, returned as rows.
export function windowStats(L, R, windowSec, sr = SR) {
  const w = Math.round(windowSec * sr);
  const rows = [];
  for (let s = 0; s < L.length; s += w) {
    const e = Math.min(L.length, s + w);
    let pk = 0, sq = 0;
    for (let i = s; i < e; i++) {
      const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      if (a > pk) pk = a;
      sq += 0.5 * (L[i] * L[i] + R[i] * R[i]);
    }
    rows.push({ start: s / sr, end: e / sr, peak: dB(pk), rms: dB(Math.sqrt(sq / (e - s))) });
  }
  return rows;
}
