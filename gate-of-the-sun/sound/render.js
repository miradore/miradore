// Entry point: node sound/render.js
// Renders the Gate of the Sun score to out/score.wav (48 kHz, 24-bit, 77.5 s)
// and writes out/score_cues.txt.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Library, Mixer, SR } from './sampler.js';
import { reverb, limiter, peakOf, dB, windowStats } from './dsp.js';
import { INSTRUMENTS, buildScore, LENGTH, FPS } from './cues.js';
import { writeWav24 } from './wav.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'out');
mkdirSync(outDir, { recursive: true });

const VSCO = process.env.VSCO_ROOT
  || '/tmp/claude-0/-home-user-miradore/33f871d1-37f9-5946-ae24-084dd5e218cb/scratchpad/dl/vsco';
if (!existsSync(VSCO)) {
  console.error(`VSCO library not found at ${VSCO}. Set VSCO_ROOT.`);
  process.exit(1);
}

const t0 = Date.now();
const lib = new Library(VSCO);
for (const [name, folder, opts] of INSTRUMENTS) lib.define(name, folder, opts);

const mix = new Mixer(LENGTH, SR);
const cues = [];
const S = {
  note: (inst, t, opts) => mix.note(lib, inst, t, opts),
  add: (t, sig, opts = {}) => {
    for (const ch of (Array.isArray(sig) ? sig : [sig])) {
      for (let i = 0; i < ch.length; i++) if (!Number.isFinite(ch[i])) throw new Error(`non-finite sample in synth signal placed at ${t} s`);
    }
    if (Array.isArray(sig)) mix.addStereo(t, sig[0], sig[1], opts);
    else mix.addMono(t, sig, opts);
  },
  cue: (t, label) => cues.push({ t, label }),
};
buildScore(S);
console.log(`placed ${mix.voices} sampled voices in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// Reverb on the send bus
const t1 = Date.now();
const [wetL, wetR] = reverb(mix.sendL, mix.sendR, { t60: 2.2, preDelay: 0.02, damping: 0.32 });
for (let i = 0; i < mix.n; i++) { mix.L[i] += wetL[i]; mix.R[i] += wetR[i]; }
console.log(`reverb in ${((Date.now() - t1) / 1000).toFixed(1)} s`);

// Final short fade so the buffer ends on silence, then limiter and normalise.
const fade = Math.round(0.25 * SR);
for (let i = 0; i < fade; i++) {
  const g = i / fade;
  mix.L[mix.n - 1 - i] *= g; mix.R[mix.n - 1 - i] *= g;
}
let bad = 0;
for (let i = 0; i < mix.n; i++) if (!Number.isFinite(mix.L[i]) || !Number.isFinite(mix.R[i])) bad++;
if (bad) throw new Error(`${bad} non-finite samples in the mix`);
const rawPeak = peakOf(mix.L, mix.R);
if (process.env.DEBUG_RAW) {
  console.log('raw (pre-limiter) windows above -3 dBFS:');
  for (const w of windowStats(mix.L, mix.R, 0.5)) if (w.peak > -3) console.log(`  ${w.start.toFixed(1)} s  peak ${w.peak.toFixed(1)}  rms ${w.rms.toFixed(1)}`);
}
const lim = limiter(mix.L, mix.R, { ceiling: 0.95, knee: 0.3, lookahead: 0.004, release: 0.2 });
const limPeak = peakOf(mix.L, mix.R);
const target = Math.pow(10, -1 / 20);
const norm = target / limPeak;
for (let i = 0; i < mix.n; i++) { mix.L[i] *= norm; mix.R[i] *= norm; }
console.log(`peak before limiter ${dB(rawPeak).toFixed(2)} dBFS, after ${dB(limPeak).toFixed(2)}, normalised by ${dB(norm).toFixed(2)} dB to ${dB(peakOf(mix.L, mix.R)).toFixed(2)} dBFS; max gain reduction ${lim.maxReductionDb.toFixed(1)} dB`);

const wavPath = join(outDir, 'score.wav');
writeWav24(wavPath, mix.L, mix.R, SR);

// Cue list
cues.sort((a, b) => a.t - b.t);
const fmt = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
};
const lines = ['# Gate of the Sun: score cues (seconds = frame / 24)', '# time        seconds   frame   cue'];
for (const c of cues) lines.push(`${fmt(c.t)}   ${c.t.toFixed(3).padStart(7)}   ${String(Math.round(c.t * FPS)).padStart(5)}   ${c.label}`);
writeFileSync(join(outDir, 'score_cues.txt'), lines.join('\n') + '\n');

// Report
console.log(`\nwrote ${wavPath} (${mix.n} samples, ${(mix.n / SR).toFixed(3)} s) and out/score_cues.txt (${cues.length} cues)`);
const win = Number(process.env.WINDOW) || 5;
console.log(`\npeak / RMS per ${win} s window (dBFS):`);
for (const w of windowStats(mix.L, mix.R, win)) {
  console.log(`  ${w.start.toFixed(1).padStart(5)} - ${w.end.toFixed(1).padStart(5)} s   peak ${w.peak.toFixed(1).padStart(6)}   rms ${w.rms.toFixed(1).padStart(6)}`);
}
if (lib.failed.length) {
  console.log('\nsamples that failed to load:');
  for (const f of lib.failed) console.log('  ' + f);
} else console.log('\nall samples loaded');
console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
