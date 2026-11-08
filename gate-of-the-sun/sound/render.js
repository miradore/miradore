// Entry point: node sound/render.js
// Renders the Gate of the Sun score to out/score.wav (48 kHz, 24-bit, 77.5 s)
// and writes out/score_cues.txt. Prints the level table, the impact hit list
// with sample offsets, the stereo balance per section, the ambience stem
// level, the low-end check and the click check.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Library, Mixer, SR } from './sampler.js';
import { reverb, limiter, peakOf, dB, windowStats, highpass4, lowBandPower } from './dsp.js';
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

const EXPECTED_SAMPLES = 3720000;
const SAMPLES_PER_FRAME = SR / FPS; // 2000
const AMB_END = 15.0;               // the ambience bed is cut at the flash (14.5 s)

// Sections used for the stereo balance check (seconds).
const SECTIONS = [
  [0, 14.5, 'calm town'], [14.5, 17.5, 'flash'], [17.5, 21.0, 'shock wave'], [21.0, 26.667, 'dread'],
  [26.667, 29.5, 'hand'], [29.5, 31.5, 'dust'], [31.5, 35.0, 'head rises'], [35.0, 37.5, 'mask'],
  [37.5, 41.5, 'strings thin'], [41.5, 44.0, 'near silence'], [44.0, 46.333, 'leg lifts'],
  [46.333, 57.0, 'kick and chaos'], [57.0, 61.5, 'lament begins'], [61.5, 67.0, 'giant dissolves'],
  [67.0, 70.0, 'footsteps'], [70.0, 77.5, 'lament closes'],
];

const t0 = Date.now();
const lib = new Library(VSCO);
for (const [name, folder, opts] of INSTRUMENTS) lib.define(name, folder, opts);

const mix = new Mixer(LENGTH, SR);
if (mix.n !== EXPECTED_SAMPLES) throw new Error(`buffer is ${mix.n} samples, expected ${EXPECTED_SAMPLES}`);
if (process.env.DIAG) mix.enableDiag(SECTIONS);
const cues = [];
const hits = [];
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
  hit: (frame, label) => {
    const t = frame / FPS;
    if (Math.round(t * SR) !== frame * SAMPLES_PER_FRAME) throw new Error(`frame ${frame} does not map to an exact sample`);
    hits.push({ frame, t, sample: frame * SAMPLES_PER_FRAME, label });
    cues.push({ t, label });
  },
  atFrame: (frame) => frame * SAMPLES_PER_FRAME,
};
buildScore(S);
console.log(`placed ${mix.voices} sampled voices and ${mix.placed.length} synthesised signals in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// Low end: 'hp' and 'amb' are high-passed at 60 Hz, 'hp40' (cellos and
// trombones) at 40 Hz, all fourth order; 'low' is left alone.
const t1 = Date.now();
const hpBus = mix.bus.hp, ambBus = mix.bus.amb, hp40Bus = mix.bus.hp40;
const flashSample = 348 * SAMPLES_PER_FRAME;
for (let i = flashSample; i < mix.n; i++) if (ambBus.L[i] !== 0 || ambBus.R[i] !== 0) throw new Error('ambience signal found after the flash');
const lowBefore = lowBandPower(hpBus.L, hpBus.R, 50);
highpass4([hpBus.L, hpBus.R, hpBus.sL, hpBus.sR, ambBus.L, ambBus.R, ambBus.sL, ambBus.sR], 60);
const lowAfter = lowBandPower(hpBus.L, hpBus.R, 50);
const low40Before = lowBandPower(hp40Bus.L, hp40Bus.R, 35);
highpass4([hp40Bus.L, hp40Bus.R, hp40Bus.sL, hp40Bus.sR], 40);
const low40After = lowBandPower(hp40Bus.L, hp40Bus.R, 35);
// fold the 40 Hz bus into the 60 Hz one (both are filtered now)
for (let i = 0; i < mix.n; i++) { hpBus.L[i] += hp40Bus.L[i]; hpBus.R[i] += hp40Bus.R[i]; hpBus.sL[i] += hp40Bus.sL[i]; hpBus.sR[i] += hp40Bus.sR[i]; }

// Music reverb on the summed sends of the low and high-passed buses.
const lowBus = mix.bus.low;
for (let i = 0; i < mix.n; i++) { lowBus.sL[i] += hpBus.sL[i]; lowBus.sR[i] += hpBus.sR[i]; }
const [wetL, wetR] = reverb(lowBus.sL, lowBus.sR, { t60: 2.2, preDelay: 0.02, damping: 0.32 });
// Ambience reverb: longer, darker and later, for distance. Only the opening needs it.
const nA = Math.round(AMB_END * SR);
const [ambWetL, ambWetR] = reverb(ambBus.sL.subarray(0, nA), ambBus.sR.subarray(0, nA), { t60: 2.8, preDelay: 0.035, damping: 0.45 });
const ambL = new Float64Array(nA), ambR = new Float64Array(nA);
for (let i = 0; i < nA; i++) { ambL[i] = ambBus.L[i] + ambWetL[i]; ambR[i] = ambBus.R[i] + ambWetR[i]; }

// Sum: main = low + high-passed + wet, then the ambience stem.
const L = lowBus.L, R = lowBus.R;
for (let i = 0; i < mix.n; i++) { L[i] += hpBus.L[i] + wetL[i]; R[i] += hpBus.R[i] + wetR[i]; }
for (let i = 0; i < nA; i++) { L[i] += ambL[i]; R[i] += ambR[i]; }
console.log(`filters and reverbs in ${((Date.now() - t1) / 1000).toFixed(1)} s`);

// Final short fade so the buffer ends on silence, then limiter and normalise.
const fade = Math.round(0.25 * SR);
for (let i = 0; i < fade; i++) {
  const g = i / fade;
  L[mix.n - 1 - i] *= g; R[mix.n - 1 - i] *= g;
}
let bad = 0;
for (let i = 0; i < mix.n; i++) if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) bad++;
if (bad) throw new Error(`${bad} non-finite samples in the mix`);
const rawPeak = peakOf(L, R);
if (process.env.DEBUG_RAW) {
  console.log('raw (pre-limiter) windows above -3 dBFS:');
  for (const w of windowStats(L, R, 0.5)) if (w.peak > -3) console.log(`  ${w.start.toFixed(1)} s  peak ${w.peak.toFixed(1)}  rms ${w.rms.toFixed(1)}`);
}
const lim = limiter(L, R, { ceiling: 0.95, knee: 0.3, lookahead: 0.004, release: 0.2, keepGain: true });
const limPeak = peakOf(L, R);
const target = Math.pow(10, -1 / 20);
const norm = target / limPeak;
for (let i = 0; i < mix.n; i++) { L[i] *= norm; R[i] *= norm; }
const finalPeak = peakOf(L, R);
console.log(`peak before limiter ${dB(rawPeak).toFixed(2)} dBFS, after ${dB(limPeak).toFixed(2)}, normalised by ${dB(norm).toFixed(2)} dB to ${dB(finalPeak).toFixed(2)} dBFS; max gain reduction ${lim.maxReductionDb.toFixed(1)} dB`);
if (mix.n !== EXPECTED_SAMPLES) throw new Error('length changed');

const wavPath = join(outDir, 'score.wav');
writeWav24(wavPath, L, R, SR);

// Cue list
cues.sort((a, b) => a.t - b.t);
const fmt = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
};
const lines = ['# Gate of the Sun: score cues (seconds = frame / 24; sample = frame * 2000 at 48 kHz)', '# time        seconds   frame   cue'];
for (const c of cues) lines.push(`${fmt(c.t)}   ${c.t.toFixed(3).padStart(7)}   ${String(Math.round(c.t * FPS)).padStart(5)}   ${c.label}`);
lines.push('', '# Impact hits (picture-locked): frame, seconds, sample offset');
for (const h of hits) lines.push(`#   frame ${String(h.frame).padStart(4)}   ${h.t.toFixed(4).padStart(8)} s   sample ${String(h.sample).padStart(7)}   ${h.label}`);
writeFileSync(join(outDir, 'score_cues.txt'), lines.join('\n') + '\n');

// ---------------------------------------------------------------------------
// Report
console.log(`\nwrote ${wavPath} (${mix.n} samples, ${(mix.n / SR).toFixed(3)} s) and out/score_cues.txt (${cues.length} cues)`);
const win = Number(process.env.WINDOW) || 5;
console.log(`\npeak / RMS per ${win} s window (dBFS):`);
for (const w of windowStats(L, R, win)) {
  console.log(`  ${w.start.toFixed(1).padStart(5)} - ${w.end.toFixed(1).padStart(5)} s   peak ${w.peak.toFixed(1).padStart(6)}   rms ${w.rms.toFixed(1).padStart(6)}`);
}

// Impact hits: every voice or signal that starts on the hit sample, and the
// suction that ends on it.
console.log('\nimpact hits (frame, time, sample offset, voices starting on that sample, suction end):');
const suctions = mix.placed.filter((p) => p.name === 'suction');
for (const h of hits) {
  const n = mix.starts.get(h.sample) || 0;
  const su = suctions.find((p) => p.end === h.sample);
  const off = (h.sample - h.frame * SAMPLES_PER_FRAME);
  console.log(`  frame ${String(h.frame).padStart(4)}  ${h.t.toFixed(4).padStart(8)} s  sample ${String(h.sample).padStart(7)}  offset ${off}  voices ${String(n).padStart(2)}${su ? `  suction ${su.start}..${su.end - 1} (${((su.end - su.start) / SR * 1000).toFixed(1)} ms, peak ${dB(su.peak * norm).toFixed(1)} dBFS)` : ''}`);
  if (n === 0) throw new Error(`no voice starts on the hit at frame ${h.frame}`);
}

// Stereo balance per section of the delivered mix.
console.log('\nstereo balance per section (RMS dBFS, L minus R):');
const balance = [];
for (const [a, b, name] of SECTIONS) {
  let sl = 0, sr = 0; const s = Math.round(a * SR), e = Math.min(mix.n, Math.round(b * SR));
  for (let i = s; i < e; i++) { sl += L[i] * L[i]; sr += R[i] * R[i]; }
  const dl = dB(Math.sqrt(sl / (e - s))), dr = dB(Math.sqrt(sr / (e - s)));
  balance.push(dl - dr);
  console.log(`  ${a.toFixed(2).padStart(6)} - ${b.toFixed(2).padStart(6)} s  ${name.padEnd(16)}  L ${dl.toFixed(1).padStart(6)}  R ${dr.toFixed(1).padStart(6)}  diff ${(dl - dr).toFixed(2).padStart(6)}${Math.abs(dl - dr) > 3 ? '  OVER 3 dB' : ''}`);
}
if (mix.diag) {
  console.log('\nper source L minus R energy by section (DIAG):');
  for (const [name, acc] of mix.diag.acc) {
    const row = SECTIONS.map((_, k) => (acc[2 * k] + acc[2 * k + 1] > 1e-6 ? `${(10 * Math.log10((acc[2 * k] + 1e-15) / (acc[2 * k + 1] + 1e-15))).toFixed(1)}/${(10 * Math.log10(acc[2 * k] + acc[2 * k + 1])).toFixed(0)}` : '.').padStart(9)).join('');
    console.log(`  ${name.padEnd(13)}${row}`);
  }
}

// Ambience stem as delivered (after the limiter gain and the normalisation).
let ambSq = 0, ambPk = 0, worst = { rms: -200, t: 0 };
const w1 = SR;
for (let s = 0; s < nA; s += w1) {
  let sq = 0; const e = Math.min(nA, s + w1);
  for (let i = s; i < e; i++) {
    const g = lim.gain[i] * norm;
    const l = ambL[i] * g, r = ambR[i] * g;
    sq += 0.5 * (l * l + r * r); ambSq += 0.5 * (l * l + r * r);
    ambPk = Math.max(ambPk, Math.abs(l), Math.abs(r));
  }
  const rms = dB(Math.sqrt(sq / (e - s)));
  if (rms > worst.rms) worst = { rms, t: s / SR };
}
const ambRms = dB(Math.sqrt(ambSq / Math.round(14.5 * SR)));
console.log(`\nambience stem 0 to 14.5 s: RMS ${ambRms.toFixed(1)} dBFS, loudest 1 s window ${worst.rms.toFixed(1)} dBFS at ${worst.t.toFixed(0)} s, peak ${dB(ambPk).toFixed(1)} dBFS${worst.rms >= -30 ? '  OVER -30' : ' (limit -30 dBFS RMS)'}`);
const ambNames = [...new Set(mix.placed.filter((p) => p.bus === 'amb').map((p) => p.name))];
for (const nm of ambNames) {
  const pk = Math.max(...mix.placed.filter((p) => p.name === nm).map((p) => p.peak));
  console.log(`  ${nm.padEnd(13)} dry peak ${dB(pk * norm).toFixed(1)} dBFS`);
}

// Low end and clicks.
const lowDb = (x) => dB(Math.sqrt(x.low)) - dB(Math.sqrt(x.all));
console.log(`\nlow end: energy below 50 Hz on the 60 Hz bus ${lowDb(lowBefore).toFixed(1)} dB re its total before the high-pass, ${lowDb(lowAfter).toFixed(1)} dB after; below 35 Hz on the 40 Hz bus (cellos, trombones) ${lowDb(low40Before).toFixed(1)} dB before, ${lowDb(low40After).toFixed(1)} dB after`);
const E = mix.edges;
console.log(`clicks: ${E.checked} sampled notes checked; ${E.wouldClickEnd} would have ended abruptly (source ran out before the release), now faded; worst end edge ${dB(E.worstEnd).toFixed(0)} dB (was ${dB(E.worstRawEnd).toFixed(0)} dB), worst start edge ${dB(E.worstStart).toFixed(0)} dB re each note's peak`);

if (lib.failed.length) {
  console.log('\nsamples that failed to load:');
  for (const f of lib.failed) console.log('  ' + f);
} else console.log('\nall samples loaded');
console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
