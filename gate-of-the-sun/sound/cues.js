// Cue data for the Gate of the Sun score (77.5 s, 24 fps, 1860 frames).
// Times are seconds; F(n) converts a frame number to seconds.
// buildScore(S) places every event through the small API in render.js:
//   S.note(inst, t, opts)       sampled note
//   S.add(t, signal, opts)      synthesised mono or [L, R] signal (opts.bus:
//                               'hp' default, 'low' for sub content, 'amb')
//   S.cue(t, label)             named cue for out/score_cues.txt
//   S.hit(frame, label)         a picture-locked impact: cue plus hit list
//   S.atFrame(frame)            exact sample offset of a frame (frame * 2000)
// Gains are linear, applied to peak-normalised samples. Rough map:
// pp 0.04, p 0.07, mp 0.1, mf 0.18, f 0.3, ff 0.5, fff 0.8 and above.

import { N } from './sampler.js';
import * as syn from './synth.js';

export const FPS = 24;
export const F = (frame) => frame / FPS;
export const LENGTH = 77.5;

// Instrument folders relative to the VSCO root. Timpani files carry no pitch
// in their names, so roots were measured by autocorrelation (F#1 to F#2).
// lowEnd: true routes an instrument to the bus that skips the 60 Hz high-pass
// (bass drums, timpani, tuba, contrabass). Struck and plucked instruments use
// the 3 ms click-safe minimum attack (they used to inherit a 20 ms linear
// fade-in that blunted every hit).
const LOW = { lowEnd: true };
const HIT = { attack: 0.003 };
const TIMP_ROOTS = { Timpani1: 30, Timpani2: 34, Timpani3: 37, Timpani4: 40, Timpani5: 42 };
export const INSTRUMENTS = [
  ['vln_sus', 'Strings/Violin Section/susVib', { loop: true, attack: 0.08, release: 1.3, send: 0.32 }],
  ['vln_trem', 'Strings/Violin Section/Trem', { loop: true, attack: 0.06, release: 0.9, send: 0.3 }],
  ['vln_pizz', 'Strings/Violin Section/Pizz', { ...HIT, release: 0.4, send: 0.28 }],
  ['vla_sus', 'Strings/Viola Section/susvib', { loop: true, attack: 0.08, release: 1.3, send: 0.32 }],
  ['vla_trem', 'Strings/Viola Section/trem', { loop: true, attack: 0.06, release: 0.9, send: 0.3 }],
  ['vc_sus', 'Strings/Cello Section/susvib', { loop: true, attack: 0.07, release: 1.2, send: 0.3 }],
  ['vc_trem', 'Strings/Cello Section/trem', { loop: true, attack: 0.06, release: 0.9, send: 0.28 }],
  ['vc_pizz', 'Strings/Cello Section/pizzT', { ...HIT, release: 0.5, send: 0.25 }],
  ['cb_sus', 'Strings/Solo Contrabass/SusVib', { ...LOW, loop: true, attack: 0.1, release: 1.2, send: 0.25 }],
  ['cb_trem', 'Strings/Solo Contrabass/Trem', { ...LOW, loop: true, attack: 0.08, release: 0.9, send: 0.25 }],
  ['cb_pizz', 'Strings/Solo Contrabass/Pizz', { ...LOW, ...HIT, release: 0.6, send: 0.2 }],
  ['harp', 'Strings/Harp', { ...HIT, release: 1.5, send: 0.35 }],
  ['hn_sus', 'Brass/F Horn/sus', { loop: true, attack: 0.04, release: 0.8, send: 0.33 }],
  ['hn_stac', 'Brass/F Horn/stac', { ...HIT, release: 0.5, send: 0.3 }],
  ['tpt_sus', 'Brass/Trumpet/sus', { loop: true, attack: 0.03, release: 0.7, send: 0.3 }],
  ['tpt_stac', 'Brass/Trumpet/stac', { ...HIT, release: 0.45, send: 0.3 }],
  ['tbn_sus', 'Brass/Tenor Trombone/sus', { loop: true, attack: 0.04, release: 0.8, send: 0.3 }],
  ['tbn_stac', 'Brass/Tenor Trombone/stac', { ...HIT, release: 0.5, send: 0.3 }],
  ['tuba_sus', 'Brass/Tuba/sus', { ...LOW, loop: true, attack: 0.05, release: 0.8, send: 0.28 }],
  ['tuba_stac', 'Brass/Tuba/stac', { ...LOW, ...HIT, release: 0.5, send: 0.28 }],
  ['flute', 'Woodwinds/Flute/susvib', { loop: true, attack: 0.05, release: 0.6, send: 0.33 }],
  ['oboe', 'Woodwinds/Oboe/Sus', { loop: true, attack: 0.04, release: 0.6, send: 0.33 }],
  ['clarinet', 'Woodwinds/Clarinet/susLong', { loop: true, attack: 0.05, release: 0.6, send: 0.33 }],
  ['bassoon', 'Woodwinds/Bassoon/sus', { loop: true, attack: 0.05, release: 0.6, send: 0.3 }],
  ['timp', 'Percussion/Timpani', { ...LOW, ...HIT, filter: /_Hit_/, roots: TIMP_ROOTS, release: 1.6, send: 0.14 }],
  ['timp_roll', 'Percussion/Timpani/Rolls', { ...LOW, filter: /_Roll_/, roots: TIMP_ROOTS, loop: true, attack: 0.05, release: 1.4, send: 0.14 }],
  ['bdrum', 'Percussion', { ...LOW, ...HIT, filter: /^BDrumNewhit/, defaultRoot: 36, release: 1.5, send: 0.1 }],
  ['bdrum1', 'VSCO 1 Percussion/drums/bass', { ...LOW, ...HIT, filter: /^bdrum_(ppp|pp|p|mp|mf|f|ff|fff)_\d\.wav$/, defaultRoot: 36, release: 1.5, send: 0.1 }],
  ['bdrum_roll', 'VSCO 1 Percussion/drums/bass', { ...LOW, filter: /^bdrum_roll1\.wav$/, defaultRoot: 36, release: 0.8, send: 0.1 }],
  ['snare_roll', 'Percussion', { filter: /^Snare2-rollSN/, defaultRoot: 60, release: 0.4, send: 0.12 }],
  ['snare_hit', 'Percussion', { ...HIT, filter: /^Snare2-HitSN/, defaultRoot: 60, release: 0.4, send: 0.12 }],
  ['anvil', 'Percussion', { ...HIT, filter: /^Anvil/, defaultRoot: 60, release: 0.8, send: 0.15 }],
  ['crash', 'VSCO 1 Percussion/varMetal/Cymbals/clash', { ...HIT, filter: /^crash_hit/, defaultRoot: 60, release: 2.5, send: 0.15 }],
  ['susp_roll', 'VSCO 1 Percussion/varMetal/Cymbals/susp', { filter: /roll/, defaultRoot: 60, release: 1.5, send: 0.15 }],
  ['susp_hit', 'VSCO 1 Percussion/varMetal/Cymbals/susp', { ...HIT, filter: /^susp_hit_(softmall|hardmall)_(p|mp|mf|f|ff|fff)\.wav$/, defaultRoot: 60, release: 2.0, send: 0.15 }],
  ['gong', 'VSCO 1 Percussion/varMetal/Gong', { ...HIT, filter: /^gong_hit_/, defaultRoot: 60, release: 4.0, send: 0.12 }],
];

// Pre-impact suction: 40 ms = 1920 samples at 48 kHz, ending on the frame.
const SUCTION_N = 1920;
const SUCTION_GAIN = 0.32;

// Diegetic ambience bed under the calm opening, on its own bus ('amb', high
// passed at 60 Hz, own distant reverb, metered as a stem in render.js). All of
// it stops at the flash. Levels were set so that the stem stays below -30 dBFS
// RMS in every 1 s window of the delivered file.
function ambience(S) {
  const tF = F(348);
  const A = { bus: 'amb' };
  S.cue(0, 'Ambience bed: soft wind, distant swallows, bells, water in shot 3 (stem below -30 dBFS RMS)');
  // Wind: fades in, steady through the town shots, thins out in shot 5
  // ("silence creeping in"), cut at the flash.
  S.add(0, syn.wind({ dur: tF, gain: 0.16, seed: 51, env: [[0, 0], [1.5, 0.85], [6, 1], [10, 0.9], [12.5, 0.75], [14.3, 0.22], [tF, 0.2]] }), { ...A, send: 0.15, name: 'amb wind' });
  // Bell towers: left tower (x = -22) strikes at 1.5 s, right tower (x = 22)
  // at 4.5 s. Synthesised bells on D3 and A2, low and wet.
  S.cue(F(36), 'Bell toll, left tower (D)');
  S.add(F(36), syn.bell({ f0: 146.83, dur: tF - F(36), gain: 0.02, seed: 81 }), { ...A, pan: -0.45, send: 0.8, name: 'amb bell' });
  S.cue(F(108), 'Bell toll, right tower (A)');
  S.add(F(108), syn.bell({ f0: 110.0, dur: tF - F(108), gain: 0.02, seed: 82 }), { ...A, pan: 0.45, send: 0.8, name: 'amb bell' });
  // Swallows: sparse, distant, panned across the sky; none after shot 4.
  S.cue(0.9, 'Distant swallow chirps (sparse, to 11 s)');
  const r = syn.rng(611);
  [0.9, 2.4, 3.2, 5.7, 6.6, 8.9, 10.8].forEach((t, k) => {
    const pan = (k % 2 ? 1 : -1) * (0.35 + 0.4 * r());
    S.add(t, syn.swallowCall({ gain: 0.032 + 0.016 * r(), seed: 61 + k }), { ...A, pan, send: 0.35, name: 'amb swallows' });
  });
  // Water lapping at the canal steps, shot 3 (7.0 s) to 12.5 s.
  S.cue(7.0, 'Water lapping at the canal steps (7.0 to 12.5 s)');
  S.add(7.0, syn.waterLaps({ dur: 5.5, gain: 0.14, seed: 71, fadeIn: 0.6, fadeOut: 1.2 }), { ...A, pan: 0.15, send: 0.2, name: 'amb water' });
}

export function buildScore(S) {
  const r = syn.rng(2024);
  const PAD = { vel: 0.1 };
  ambience(S);

  // -------------------------------------------------------------------------
  // 0.0 to 14.5  Shots 1 to 5: calm, slightly uneasy town. D minor leaning to F major.
  S.cue(0, 'Shot 1: town. D minor with F major lean, pp open fifths');
  // violas: open fifth D3 A3, then F3 C4
  S.note('vla_sus', 0.0, { ...PAD, midi: N('D3'), dur: 7.4, gain: 0.045, pan: -0.2, attack: 1.4 });
  S.note('vla_sus', 0.15, { ...PAD, midi: N('A3'), dur: 7.25, gain: 0.04, pan: 0.15, attack: 1.4 });
  // violins: open fifth D4 A4
  S.note('vln_sus', 0.4, { ...PAD, midi: N('D4'), dur: 7.0, gain: 0.045, pan: -0.35, attack: 1.6 });
  S.note('vln_sus', 0.6, { ...PAD, midi: N('A4'), dur: 6.8, gain: 0.04, pan: -0.1, attack: 1.6 });
  // cellos: slow line F2 then D2 (the F major / D minor ambiguity)
  S.note('vc_sus', 0.2, { vel: 0.2, midi: N('F2'), dur: 3.7, gain: 0.06, pan: 0.2, attack: 1.0 });
  S.note('vc_sus', 4.0, { vel: 0.2, midi: N('D2'), dur: 3.3, gain: 0.06, pan: 0.2, attack: 0.5 });
  // harp arpeggio, bar 1 (66 bpm, every 2 bars = 7.27 s)
  S.cue(0.6, 'Harp arpeggio (D minor)');
  ['D2', 'A2', 'F3', 'A3', 'D4', 'F4'].forEach((n, i) => S.note('harp', 0.6 + i * 0.11, { midi: N(n), gain: 0.11, pan: -0.1 + i * 0.05 }));
  // flute phrase, shot 2
  S.cue(4.0, 'Shot 2: solo flute phrase');
  S.note('flute', 4.0, { vel: 0.3, midi: N('A4'), dur: 0.85, gain: 0.085, pan: 0.2 });
  S.note('flute', 4.85, { vel: 0.3, midi: N('C5'), dur: 0.55, gain: 0.085, pan: 0.2 });
  S.note('flute', 5.4, { vel: 0.3, midi: N('A4'), dur: 0.55, gain: 0.08, pan: 0.2 });
  S.note('flute', 5.95, { vel: 0.3, midi: N('F4'), dur: 1.3, gain: 0.08, pan: 0.2, release: 0.9 });
  // second harmony block: F major lean, 7.4 to 12.6
  S.note('vla_sus', 7.4, { ...PAD, midi: N('F3'), dur: 5.1, gain: 0.045, pan: -0.2, attack: 1.2, release: 1.5 });
  S.note('vla_sus', 7.5, { ...PAD, midi: N('C4'), dur: 5.0, gain: 0.04, pan: 0.15, attack: 1.2, release: 1.5 });
  S.note('vln_sus', 7.5, { ...PAD, midi: N('F4'), dur: 5.0, gain: 0.045, pan: -0.35, attack: 1.3, release: 1.5 });
  S.note('vln_sus', 7.6, { ...PAD, midi: N('C5'), dur: 4.9, gain: 0.038, pan: -0.1, attack: 1.3, release: 1.5 });
  S.note('vc_sus', 7.4, { vel: 0.2, midi: N('E2'), dur: 2.5, gain: 0.06, pan: 0.2, attack: 0.5 });
  S.note('vc_sus', 10.0, { vel: 0.2, midi: N('D2'), dur: 2.4, gain: 0.055, pan: 0.2, attack: 0.5, release: 1.5 });
  // harp arpeggio, bar 3
  S.cue(7.9, 'Harp arpeggio (F major)');
  ['F2', 'C3', 'A3', 'C4', 'F4', 'A4'].forEach((n, i) => S.note('harp', 7.9 + i * 0.11, { midi: N(n), gain: 0.1, pan: -0.1 + i * 0.05 }));
  // oboe answer, shot 3
  S.cue(7.4, 'Shot 3: oboe answer');
  S.note('oboe', 7.45, { vel: 0.2, midi: N('D4'), dur: 0.65, gain: 0.075, pan: -0.25 });
  S.note('oboe', 8.1, { vel: 0.2, midi: N('E4'), dur: 0.5, gain: 0.075, pan: -0.25 });
  S.note('oboe', 8.6, { vel: 0.2, midi: N('F4'), dur: 0.9, gain: 0.075, pan: -0.25 });
  S.note('oboe', 9.5, { vel: 0.2, midi: N('E4'), dur: 1.1, gain: 0.07, pan: -0.25, release: 0.9 });
  // pebble pluck exactly on frame 208
  S.hit(208, 'Pebble: pizzicato pluck (frame 208)');
  S.note('vln_pizz', F(208), { vel: 0.5, midi: N('G4'), gain: 0.16, pan: 0.35 });
  S.note('vc_pizz', F(208) + 0.012, { vel: 0.3, midi: N('G3'), gain: 0.06, pan: 0.3 });
  S.cue(10.5, 'Soft harp note');
  S.note('harp', 10.5, { midi: N('A3'), gain: 0.08, pan: 0.1 });
  // shot 5: thin to contrabass drone and violin tremolo, cut by the flash
  S.cue(12.5, 'Shot 5: thin to contrabass drone and violin tremolo');
  S.note('cb_sus', 12.5, { vel: 0.1, midi: N('D1'), dur: 1.95, gain: 0.12, attack: 0.9, release: 0.06 });
  S.note('vln_trem', 12.5, { vel: 0.1, midi: N('A4'), dur: 1.95, gain: 0.04, pan: -0.2, attack: 0.9, release: 0.06 });

  // -------------------------------------------------------------------------
  // 14.5  THE FLASH (frame 348)
  const tF = F(348);
  S.hit(348, 'THE FLASH (frame 348): bass drum, timpani, anvil, crash, brass fff cluster. Ambience bed cut');
  S.note('bdrum1', tF, { vel: 1, gain: 0.62, dur: 0.55, release: 0.12, rr: 1 });
  S.note('bdrum', tF, { vel: 1, gain: 0.465, dur: 0.55, release: 0.12, pan: 0.1 });
  S.note('timp', tF, { vel: 1, midi: 28, gain: 0.527, dur: 0.6, release: 0.15, pan: -0.15 });
  S.note('anvil', tF, { vel: 1, gain: 0.434, pan: 0.2 });
  S.note('crash', tF, { vel: 1, gain: 0.38, pan: 0.15, send: 0.1 });
  S.note('gong', tF + 0.01, { vel: 0.9, gain: 0.15, pan: -0.1, send: 0.1 });
  const BRASS = { vel: 1, dur: 0.55, attack: 0.005, release: 0.08, send: 0.12 };
  S.note('hn_sus', tF, { ...BRASS, midi: N('D3'), gain: 0.341, pan: -0.3 });
  S.note('hn_sus', tF, { ...BRASS, midi: N('D#3'), gain: 0.31, pan: -0.15 });
  S.note('hn_sus', tF, { ...BRASS, midi: N('G#2'), gain: 0.31, pan: 0.1 });
  S.note('tbn_sus', tF, { ...BRASS, midi: N('D2'), gain: 0.372, pan: 0.25 });
  S.note('tbn_sus', tF, { ...BRASS, midi: N('G#2'), gain: 0.341, pan: 0.35 });
  S.note('tbn_sus', tF, { ...BRASS, midi: N('D#2'), gain: 0.341, pan: 0.0 });
  S.note('tuba_sus', tF, { ...BRASS, midi: N('D1'), gain: 0.434, pan: 0.05 });
  S.note('tuba_sus', tF, { ...BRASS, midi: N('D#1'), gain: 0.31, pan: -0.05 });
  S.cue(tF + 0.6, 'Abrupt cut: cymbal and tam decay only, 6 kHz tinnitus ring');
  S.add(tF + 0.05, syn.sineTone({ freq: 6000, dur: 4.2, gain: 0.03, decay: 1.3 }), { send: 0.1 });

  // -------------------------------------------------------------------------
  // 17.5 to 21.0  Shock wave (frames 420 to 480)
  S.cue(17.5, 'Shots 8-9: shock wave. Bass drum roll crescendo');
  S.note('bdrum_roll', 17.5, { gain: 0.56, dur: 2.4, release: 0.8, offset: 0.4, env: [[0, 0.15], [0.1, 1], [0.7, 0.75], [2.4, 0.0]] });
  // The hit was at 17.6 s (frame 422.4); it now sits exactly on frame 422.
  const tS = F(422);
  S.hit(422, 'Shock wave hit with cymbal wash (frame 422)');
  S.note('bdrum1', tS, { vel: 0.9, gain: 0.595, rr: 2 });
  S.note('bdrum', tS, { vel: 1, gain: 0.42, pan: -0.1 });
  S.note('susp_roll', 17.55, { gain: 0.35, dur: 2.2, release: 1.2, offset: 2.5, env: [[0, 0.6], [0.2, 1], [2.2, 0.3]] });
  S.note('crash', tS, { vel: 0.7, gain: 0.315, pan: -0.2 });
  S.add(tS, syn.noiseBand({ dur: 3.4, f0: 2400, f1: 120, q: 1.0, env: [[0, 0], [0.08, 1], [1.2, 0.6], [3.4, 0]], gain: 0.6, seed: 3 }), { send: 0.3 });

  // -------------------------------------------------------------------------
  // 21.0 to 26.5  Shots 10-11: ringing silence, then dread
  S.cue(21.0, 'Shots 10-11: ringing silence then dread');
  S.cue(21.5, 'Heartbeat begins (72 bpm, to 31.5)');
  S.add(21.5, syn.heartbeat({ dur: 10.0, bpm: 72, gain: 0.16 }), { send: 0.06, bus: 'low', name: 'heartbeat' });
  S.note('cb_trem', 22.0, { vel: 0.2, midi: N('D1'), dur: 7.4, gain: 0.07, attack: 1.0, release: 1.0, env: [[0, 0.3], [4.5, 1], [7.4, 0.5]] });
  S.note('vc_trem', 22.5, { vel: 0.2, midi: N('D2'), dur: 7.0, gain: 0.055, attack: 1.0, release: 1.0, pan: 0.2, env: [[0, 0.2], [4, 1], [7, 0.4]] });
  S.cue(22.0, 'Violas: sustained minor second D3 / Eb3');
  S.note('vla_sus', 22.0, { ...PAD, midi: N('D3'), dur: 7.5, gain: 0.04, pan: -0.25, attack: 1.8, release: 1.2 });
  S.note('vla_sus', 22.2, { ...PAD, midi: N('D#3'), dur: 7.3, gain: 0.038, pan: 0.25, attack: 1.8, release: 1.2 });

  // -------------------------------------------------------------------------
  // 26.667  THE HAND (frame 640): stinger
  const tH = F(640);
  S.cue(tH - 0.04, 'Pre-impact suction: 40 ms reverse-swelled noise ending on frame 640');
  S.add(0, syn.suction({ dur: 0.04, gain: SUCTION_GAIN * 0.7, seed: 92 }), { atSample: S.atFrame(640) - SUCTION_N, send: 0.08, name: 'suction', edgeEnd: 0.001 });
  S.hit(640, 'THE HAND (frame 640): brass sfz tritone D / Ab, timpani, bass drum, rumble');
  const STING = { vel: 1, attack: 0.006, dur: 1.3, release: 1.0, send: 0.25 };
  S.note('hn_sus', tH, { ...STING, midi: N('D2'), gain: 0.35, pan: -0.25 });
  S.note('hn_sus', tH, { ...STING, midi: N('G#2'), gain: 0.336, pan: 0.2 });
  S.note('tbn_sus', tH, { ...STING, midi: N('D2'), gain: 0.385, pan: 0.3 });
  S.note('tbn_sus', tH, { ...STING, midi: N('G#1'), gain: 0.35, pan: -0.1 });
  S.note('timp', tH, { vel: 1, midi: 34, gain: 0.49, pan: -0.1 });
  S.note('bdrum1', tH, { vel: 0.9, gain: 0.49, rr: 3 });
  S.add(tH + 0.02, syn.rumble({ dur: 3.0, gain: 0.35, seed: 7 }), { send: 0.1, bus: 'low', name: 'rumble' });
  S.note('cb_trem', tH, { vel: 1, midi: N('D1'), dur: 0.8, gain: 0.14, attack: 0.01, release: 2.2 });

  // -------------------------------------------------------------------------
  // 29.5 to 31.5  Shot 13: dust, heartbeat, high violin harmonic
  S.cue(29.5, 'Shot 13: dust. Heartbeat and a held high violin harmonic');
  S.note('vln_sus', 29.3, { vel: 0, midi: N('A5'), dur: 4.4, gain: 0.03, pan: -0.1, attack: 1.6, release: 1.6, send: 0.45 });

  // -------------------------------------------------------------------------
  // 31.5 to 35.0  Shot 14: the head rises. Choir enters, brass swell to the peak at 35.0
  S.cue(31.5, 'Shot 14: head rises. Synth choir (D minor) with cellos, horns swell from pp');
  S.add(31.5, syn.choir({ notes: [N('D3'), N('F3'), N('A3'), N('D4'), N('F4'), N('A4')], dur: 2.3, attack: 1.0, release: 1.2, gain: 0.03, vowel: 0.3, seed: 21 }), { send: 0.45 });
  S.cue(33.6, 'Choir moves to B flat minor');
  S.add(33.6, syn.choir({ notes: [N('A#2'), N('C#3'), N('F3'), N('A#3'), N('C#4'), N('F4')], dur: 3.9, attack: 0.7, release: 1.8, gain: 0.045, vowel: 0.45, seed: 22, env: [[0, 0.7], [1.4, 1], [2.4, 0.9], [3.9, 0.45]] }), { send: 0.45 });
  S.note('vc_sus', 31.5, { vel: 0.4, midi: N('D2'), dur: 6.0, gain: 0.07, attack: 1.0, release: 1.4, pan: 0.15, env: [[0, 0.5], [3.5, 1], [6, 0.5]] });
  S.note('vc_sus', 31.6, { vel: 0.4, midi: N('A2'), dur: 5.9, gain: 0.06, attack: 1.0, release: 1.4, pan: 0.3, env: [[0, 0.5], [3.4, 1], [5.9, 0.5]] });
  S.note('vc_sus', 33.6, { vel: 0.5, midi: N('F2'), dur: 3.9, gain: 0.065, attack: 0.5, release: 1.4, pan: -0.1 });
  // horns pp to ff
  const SWELL = [[0, 0.06], [3.5, 1], [4.6, 1], [6.0, 0.3]];
  S.note('hn_sus', 31.5, { vel: 0.9, midi: N('F3'), dur: 6.0, gain: 0.4, attack: 0.3, release: 1.5, pan: -0.25, env: SWELL });
  S.note('hn_sus', 31.5, { vel: 0.9, midi: N('A#2'), dur: 6.0, gain: 0.4, attack: 0.3, release: 1.5, pan: 0.1, env: SWELL });
  S.note('hn_sus', 31.5, { vel: 0.9, midi: N('A3'), dur: 2.1, gain: 0.36, attack: 0.3, release: 0.6, pan: 0.2, env: [[0, 0.06], [2.1, 0.55]] });
  S.note('hn_sus', 33.6, { vel: 0.9, midi: N('C#4'), dur: 3.9, gain: 0.36, attack: 0.2, release: 1.5, pan: 0.2, env: [[0, 0.5], [1.4, 1], [2.5, 1], [3.9, 0.3]] });
  S.cue(33.0, 'Trombones join the swell');
  const TBN_SW = [[0, 0.12], [2.0, 1], [3.0, 1], [4.5, 0.3]];
  S.note('tbn_sus', 33.0, { vel: 1, midi: N('A#1'), dur: 4.5, gain: 0.44, attack: 0.2, release: 1.5, pan: 0.3, env: TBN_SW });
  S.note('tbn_sus', 33.0, { vel: 1, midi: N('F2'), dur: 4.5, gain: 0.4, attack: 0.2, release: 1.5, pan: -0.3, env: TBN_SW });
  S.cue(34.0, 'Trumpets join, tuba enters');
  const TPT_SW = [[0, 0.2], [1.0, 1], [2.0, 0.9], [3.5, 0.3]];
  S.note('tpt_sus', 34.0, { vel: 1, midi: N('F4'), dur: 3.5, gain: 0.304, attack: 0.1, release: 1.4, pan: -0.2, env: TPT_SW });
  S.note('tpt_sus', 34.0, { vel: 1, midi: N('A#4'), dur: 3.5, gain: 0.288, attack: 0.1, release: 1.4, pan: 0.15, env: TPT_SW });
  S.note('tpt_sus', 34.1, { vel: 1, midi: N('C#5'), dur: 3.4, gain: 0.24, attack: 0.1, release: 1.4, pan: 0.3, env: TPT_SW });
  S.note('tuba_sus', 34.0, { vel: 1, midi: N('A#0'), dur: 3.5, gain: 0.44, attack: 0.15, release: 1.5, env: TPT_SW });
  S.note('timp_roll', 33.5, { vel: 1, midi: 34, gain: 0.4, dur: 4.0, release: 1.2, env: [[0, 0.1], [1.5, 1], [2.5, 1], [4.0, 0.3]] });
  S.note('vln_trem', 34.0, { vel: 0.8, midi: N('D5'), dur: 3.5, gain: 0.06, attack: 0.3, release: 1.2, pan: -0.3, env: [[0, 0.2], [1, 1], [3.5, 0.3]] });
  S.note('vln_trem', 34.0, { vel: 0.8, midi: N('F5'), dur: 3.5, gain: 0.055, attack: 0.3, release: 1.2, pan: -0.1, env: [[0, 0.2], [1, 1], [3.5, 0.3]] });
  S.note('vla_trem', 34.0, { vel: 0.8, midi: N('A#3'), dur: 3.5, gain: 0.06, attack: 0.3, release: 1.2, pan: 0.2, env: [[0, 0.2], [1, 1], [3.5, 0.3]] });

  // -------------------------------------------------------------------------
  // 35.0 to 37.5  Shot 15: the mask. Peak, hold, slow decay with timpani roll beneath
  const tM = F(840);
  S.hit(840, 'Shot 15: THE MASK (frame 840). Peak ff chord, hold and decay');
  S.note('bdrum1', tM, { vel: 1, gain: 0.45, rr: 4 });
  S.note('timp', tM, { vel: 1, midi: 30, gain: 0.34, pan: -0.1 });
  S.note('crash', tM, { vel: 0.8, gain: 0.28, pan: 0.2 });

  // -------------------------------------------------------------------------
  // 37.5 to 41.5  Shots 16-17: hold, slow minor strings thinning out
  S.cue(37.5, 'Shots 16-17: slow strings in D minor, thinning. Violins alone by 41 s');
  S.note('vln_sus', 37.5, { vel: 0.2, midi: N('D4'), dur: 6.3, gain: 0.05, attack: 1.5, release: 1.5, pan: -0.3, env: [[0, 1], [3.5, 0.8], [6.3, 0.08]] });
  S.note('vln_sus', 37.6, { vel: 0.2, midi: N('F4'), dur: 6.2, gain: 0.045, attack: 1.5, release: 1.5, pan: -0.05, env: [[0, 1], [3.4, 0.8], [6.2, 0.08]] });
  S.note('vla_sus', 37.5, { vel: 0.15, midi: N('A#3'), dur: 2.9, gain: 0.045, attack: 1.2, release: 1.5, pan: 0.2 });
  S.note('vla_sus', 37.5, { vel: 0.15, midi: N('D3'), dur: 2.9, gain: 0.045, attack: 1.2, release: 1.5, pan: 0.3 });
  S.note('vc_sus', 37.5, { vel: 0.2, midi: N('G2'), dur: 1.6, gain: 0.06, attack: 0.6, release: 1.0, pan: 0.15 });
  S.note('vc_sus', 39.1, { vel: 0.2, midi: N('D2'), dur: 1.4, gain: 0.055, attack: 0.5, release: 1.2, pan: 0.15 });

  // -------------------------------------------------------------------------
  // 41.5 to 44.0  Shot 18: fade to near silence, heartbeat and low drone
  S.cue(41.5, 'Shot 18: fade to near silence. Low drone');
  S.note('cb_sus', 41.5, { vel: 0, midi: N('D1'), dur: 2.3, gain: 0.05, attack: 0.8, release: 0.5, env: [[0, 0.6], [2.3, 0.1]] });
  S.cue(42.0, 'Heartbeat returns (42 to 44 s)');
  S.add(42.0, syn.heartbeat({ dur: 2.0, bpm: 72, gain: 0.14 }), { send: 0.06, bus: 'low', name: 'heartbeat' });

  // -------------------------------------------------------------------------
  // 44.0 to 46.0  Shot 19: the leg lifts. Steam hiss and one low breath
  S.cue(44.0, 'Shot 19: near silence. Soft steam hiss');
  S.add(44.0, syn.noiseBand({ dur: 2.4, f0: 5200, f1: 4300, q: 0.8, env: [[0, 0], [0.3, 1], [2.0, 0.8], [2.4, 0]], gain: 0.02, seed: 9, flutter: 0.5 }), { send: 0.2, pan: 0.2 });
  S.cue(45.0, 'One deep breath of contrabass');
  S.note('cb_sus', 45.0, { vel: 0.1, midi: N('D1'), dur: 1.1, gain: 0.1, attack: 0.6, release: 0.25, env: [[0, 0.3], [0.7, 1], [1.1, 0.8]] });

  // -------------------------------------------------------------------------
  // 46.333  THE KICK (frame 1112): impact
  const tK = F(1112);
  S.cue(tK - 0.04, 'Pre-impact suction: 40 ms reverse-swelled noise ending on frame 1112');
  S.add(0, syn.suction({ dur: 0.04, gain: SUCTION_GAIN * 1.15, seed: 93 }), { atSample: S.atFrame(1112) - SUCTION_N, send: 0.08, name: 'suction', edgeEnd: 0.001 });
  S.hit(1112, 'THE KICK (frame 1112): bass drum ff, timpani x3, gong, crash, anvil, low brass fff, sub boom');
  S.note('bdrum1', tK, { vel: 1, gain: 0.6, rr: 2 });
  S.note('bdrum', tK, { vel: 1, gain: 0.48, pan: 0.1 });
  S.note('timp', tK, { vel: 1, midi: 30, gain: 0.51, pan: -0.15 });
  S.note('timp', tK + 0.085, { vel: 1, midi: 29, gain: 0.42, pan: -0.1 });
  S.note('timp', tK + 0.17, { vel: 1, midi: 28, gain: 0.48, pan: -0.05 });
  S.note('gong', tK, { vel: 1, gain: 0.36, pan: -0.1, send: 0.2 });
  S.note('crash', tK, { vel: 1, gain: 0.45, pan: 0.25 });
  S.note('anvil', tK, { vel: 1, gain: 0.42, pan: 0.3 });
  const KICK = { vel: 1, dur: 1.4, attack: 0.005, release: 0.7, send: 0.2 };
  S.note('hn_sus', tK, { ...KICK, midi: N('D2'), gain: 0.36, pan: -0.3 });
  S.note('hn_sus', tK, { ...KICK, midi: N('D#2'), gain: 0.33, pan: -0.1 });
  S.note('hn_sus', tK, { ...KICK, midi: N('G#2'), gain: 0.33, pan: 0.1 });
  S.note('tbn_sus', tK, { ...KICK, midi: N('D2'), gain: 0.39, pan: 0.3 });
  S.note('tbn_sus', tK, { ...KICK, midi: N('G#1'), gain: 0.36, pan: 0.0 });
  S.note('tbn_sus', tK, { ...KICK, midi: N('D#2'), gain: 0.36, pan: 0.35 });
  S.note('tuba_sus', tK, { ...KICK, midi: N('D1'), gain: 0.42, pan: 0.05 });
  S.note('tuba_sus', tK, { ...KICK, midi: N('G#0'), gain: 0.36, pan: -0.05 });
  S.add(tK, syn.subBoom({ f0: 44, f1: 29, dur: 2.6, gain: 0.54 }), { send: 0.05, bus: 'low', name: 'subBoom' });

  // -------------------------------------------------------------------------
  // 46.5 to 57.0  Chaos: percussion pattern, sawing strings, trumpet stabs, horn calls
  S.cue(46.5, 'Chaos percussion begins: snare rolls, irregular timpani and bass drum, cymbal swells');
  S.note('snare_roll', 46.5, { vel: 0.9, gain: 0.3, dur: 4.8, release: 0.3, pan: 0.3, env: [[0, 0.5], [2, 1], [4.8, 0.7]] });
  S.note('snare_roll', 51.3, { vel: 0.7, gain: 0.3, dur: 5.2, release: 0.3, pan: 0.3, env: [[0, 0.7], [2, 1], [5.2, 0.7]], rr: 2 });
  S.note('snare_roll', 56.5, { vel: 0.5, gain: 0.24, dur: 1.5, release: 0.6, pan: 0.3, env: [[0, 0.8], [1.5, 0.05]], rr: 3 });
  // irregular two-bar pattern at 150 bpm (eighth = 0.2 s), repeated to 57 s
  const step = 0.2;
  const pattern = ['bd+t1', null, 't3', 'bd', null, 't2', null, 'bd+t4', null, 'bd', 't1', null, 't3', 'bd', 't5', null];
  const timpRoots = { t1: 30, t2: 34, t3: 37, t4: 40, t5: 42 };
  for (let t = 46.5 + step, k = 1; t < 57.0; t += step, k++) {
    const cell = pattern[k % pattern.length];
    if (!cell) continue;
    const jitter = (r() - 0.5) * 0.016;
    for (const part of cell.split('+')) {
      if (part === 'bd') S.note('bdrum', t + jitter, { vel: 0.6 + r() * 0.4, gain: 0.315 + r() * 0.1, pan: (r() - 0.5) * 0.3, release: 0.8 });
      else S.note('timp', t + jitter, { vel: 0.7 + r() * 0.3, midi: timpRoots[part] + Math.round((r() - 0.5) * 2), gain: 0.255 + r() * 0.1, pan: (r() - 0.5) * 0.5, release: 0.9 });
    }
  }
  for (const [t, rr] of [[47.5, 1], [50.2, 2], [53.0, 3], [55.4, 4]]) {
    S.note('susp_roll', t, { gain: 0.225, dur: 2.4, release: 1.0, pan: 0.2 - 0.1 * rr, rr, env: [[0, 0.15], [2.0, 1], [2.4, 0.1]] });
  }
  S.cue(46.6, 'Strings sawing: violin and viola tremolo clusters, cello repeated notes');
  const sawSeg = (t0, t1, vlnNotes, vlaNotes) => {
    const d = t1 - t0;
    vlnNotes.forEach((n, i) => S.note('vln_trem', t0 + i * 0.03, { vel: 1, midi: n, dur: d, gain: 0.05, attack: 0.05, release: 0.5, pan: -0.4 + i * 0.2, env: [[0, 0.7], [0.6, 1], [d, 0.8]] }));
    vlaNotes.forEach((n, i) => S.note('vla_trem', t0 + i * 0.03, { vel: 1, midi: n, dur: d, gain: 0.05, attack: 0.05, release: 0.5, pan: 0.1 + i * 0.2, env: [[0, 0.7], [0.6, 1], [d, 0.8]] }));
  };
  sawSeg(46.6, 50.0, [N('D5'), N('D#5'), N('A4'), N('A#4')], [N('G3'), N('G#3'), N('D4')]);
  sawSeg(50.0, 53.6, [N('D#5'), N('E5'), N('A#4'), N('B4')], [N('G#3'), N('A3'), N('D#4')]);
  sawSeg(53.6, 57.2, [N('C#5'), N('D5'), N('G#4'), N('A4')], [N('F#3'), N('G3'), N('C#4')]);
  // cello repeated notes (sus samples with very short envelopes), groups of three
  for (let t = 46.6, k = 0; t < 57.0; t += step, k++) {
    const accent = k % 3 === 0;
    const midi = (k % 7 === 3 || k % 7 === 6) ? N('D#2') : N('D2');
    S.note('vc_sus', t + (r() - 0.5) * 0.01, { vel: 1, midi, dur: 0.085, attack: 0.004, release: 0.1, gain: accent ? 0.17 : 0.12, pan: 0.15, send: 0.15 });
    if (k % 4 === 0) S.note('cb_pizz', t, { vel: 1, midi: N('D1'), gain: 0.225, pan: 0.15 });
  }
  S.cue(47.3, 'Trumpet stabs (irregular, to 56 s)');
  for (const [t, n, pan] of [[47.3, 'A#4', -0.3], [47.5, 'A4', 0.3], [48.9, 'E5', 0.0], [50.7, 'A#4', -0.3], [50.9, 'B4', 0.3], [52.6, 'A4', -0.2], [52.6, 'A#4', 0.2], [54.2, 'E5', 0.1], [54.4, 'D#5', -0.1], [56.1, 'A#4', 0.0]]) {
    S.note('tpt_stac', t, { vel: 1, midi: N(n), gain: 0.3, pan });
  }
  S.cue(50.0, 'Shots 23-24: crowd runs. Horn calls in descending minor thirds');
  for (const [t, a, b] of [[50.4, 'F3', 'D3'], [52.4, 'D#3', 'C3'], [54.4, 'D3', 'B2'], [56.4, 'C3', 'A2']]) {
    S.note('hn_sus', t, { vel: 0.9, midi: N(a), dur: 0.45, attack: 0.03, release: 0.3, gain: 0.255, pan: 0.05 });
    S.note('hn_sus', t + 0.5, { vel: 0.9, midi: N(b), dur: 1.0, attack: 0.03, release: 0.7, gain: 0.255, pan: 0.05 });
    S.note('hn_sus', t + 0.5, { vel: 0.9, midi: N(b) - 12, dur: 1.0, attack: 0.03, release: 0.7, gain: 0.2, pan: 0.3 });
  }

  // boulder landings, exactly on picture
  const boulders = [1190, 1203, 1219, 1236, 1247, 1262, 1281, 1301, 1322, 1341, 1372, 1395];
  const timpOffsets = [-3, 2, -1, 4, -4, 1, -2, 3, 0, -3, 2, -1];
  boulders.forEach((frame, i) => {
    const t = F(frame);
    const big = frame === 1247;
    S.hit(frame, `Boulder landing (frame ${frame})${frame === 1236 ? ' with glass shatter' : ''}${big ? ': house facade, rumble and stone rattle' : ''}`);
    S.note('bdrum1', t, { vel: 0.95, gain: big ? 0.55 : 0.45, rr: i });
    S.note('bdrum', t, { vel: 1, gain: big ? 0.42 : 0.33, pan: 0.1, rr: i + 3 });
    S.note('timp', t, { vel: 1, midi: 30 + timpOffsets[i] + 4, gain: 0.455, pan: (i % 2 ? 0.2 : -0.2) });
    S.note('anvil', t, { vel: 1, gain: 0.325, semis: timpOffsets[i] * 0.5, pan: (i % 2 ? -0.3 : 0.3) });
    if (frame === 1236) {
      S.add(t, syn.glassShatter({ dur: 0.9, gain: 0.07, seed: 11 }), { send: 0.25 });
      const cluster = ['A6', 'G6', 'F6', 'E6', 'D6', 'C6', 'A#5', 'A5', 'G5', 'F5', 'E5', 'D5'];
      cluster.forEach((n, k) => S.note('harp', t + k * 0.022, { vel: 1, midi: N(n), gain: 0.07, dur: 0.25, release: 1.0, pan: -0.3 + k * 0.05 }));
    }
    if (big) {
      S.add(t + 0.03, syn.rumble({ dur: 2.6, gain: 0.2, seed: 13 }), { send: 0.1, bus: 'low', name: 'rumble' });
      S.note('timp', t + 0.01, { vel: 1, midi: 28, gain: 0.3, pan: 0 });
      let tt = t + 0.12;
      for (let k = 0; k < 15; k++) {
        tt += 0.03 + r() * 0.16;
        if (tt > t + 1.6) break;
        S.note('anvil', tt, { vel: 0.2 + r() * 0.5, semis: 3 + r() * 11, gain: 0.1 + r() * 0.14, dur: 0.05, attack: 0.001, release: 0.07, pan: r() * 1.4 - 0.7, send: 0.2 });
      }
    }
  });

  // -------------------------------------------------------------------------
  // 57.0 to 61.5  Shots 25-26: percussion recedes, low lament begins
  S.cue(57.0, 'Shots 25-26: percussion recedes');
  S.cue(57.5, 'Lament: cello melody in D minor begins (section samples standing in for solo)');
  // Legato line: each note holds until the next onset, then the two cross over
  // 120 ms with equal-power curves (cosine out, sine in). Connected notes start
  // 0.8 s into their sample, past the slow bow onset of the soft layer (which
  // the crossfade replaces), and every note is level-matched on its sustain so
  // changing sample does not change level. Phrase starts keep their onset.
  // Rubato on the falling minor sixth: the F4 leans in 60 ms late, the A3
  // arrives 220 ms late and the time is given back before the G3, which is on
  // the beat again at 70.5 s.
  const XF = 0.12;
  const legatoLine = (inst, base, line) => {
    line.forEach(([t, n, flag, extra = {}], i) => {
      const next = line[i + 1];
      const connectedIn = i > 0 && !line[i - 1][2]?.includes('breath');
      const connectedOut = next && !(flag || '').includes('breath') && !(flag || '').includes('end');
      const opts = { ...base, midi: N(n), matchSustain: true, ...extra };
      if (connectedIn) Object.assign(opts, { attack: XF, legatoIn: true, offset: 0.8 });
      if (connectedOut) Object.assign(opts, { dur: next[0] - t, release: XF, legatoOut: true });
      S.note(inst, t, opts);
    });
  };
  const CELLO = { vel: 0.4, gain: 0.15, attack: 0.14, release: 1.0, pan: -0.12, send: 0.35 };
  // messa di voce on the long notes: a slight swell to the middle and back
  const swell = (d, a = 0.92, b = 1.08, c = 0.94) => [[0, a], [d * 0.45, b], [d, c]];
  legatoLine('vc_sus', CELLO, [
    [57.5, 'A3', '', { attack: 0.5, env: swell(2.4, 0.85) }],
    [59.9, 'G3', '', { env: swell(1.0) }],
    [60.9, 'F3', '', { env: swell(1.1) }],
    [62.0, 'E3', '', { env: swell(2.0) }],
    // breath (bow change) before the leap up
    [64.0, 'D3', 'breath', { dur: 2.32, release: 0.5, env: swell(2.32, 0.94, 1.05, 0.85) }],
    // the falling minor sixth F4 to A3, with rubato and a lean on the F4
    [66.56, 'F4', '', { attack: 0.32, offset: 0.12, env: [[0, 0.78], [0.9, 1.16], [1.9, 1.06], [2.56, 0.98]] }],
    [69.12, 'A3', '', { env: [[0, 1.0], [1.38, 0.86]] }],
    [70.5, 'G3', '', { env: swell(1.0, 0.9, 1.0, 0.92) }],
    [71.5, 'E3', '', { env: swell(2.5) }],
    [74.0, 'D3', 'end', { dur: 1.45, release: 1.9, env: [[0, 1.0], [1.45, 0.9]] }],
  ]);
  S.cue(66.56, 'Lament: the falling minor sixth (F4 to A3), with rubato: F4 60 ms late, A3 220 ms late');
  S.note('vla_sus', 57.5, { ...PAD, midi: N('D3'), dur: 9.5, gain: 0.04, attack: 2.0, release: 1.5, pan: -0.25 });
  S.note('vla_sus', 58.0, { ...PAD, midi: N('A3'), dur: 9.0, gain: 0.035, attack: 2.0, release: 1.5, pan: 0.25 });
  // Viola counter line from 65 s, pp, panned left against the cello: a 9-8
  // suspension (E4 to D4) as the cello leaps up, then C#4 under the landing of
  // the sixth (A over the D pedal), B flat and A under G3 and E3, and the
  // leading note C#4 rising to D4 on the final chord. Same legato crossfades.
  S.cue(65.0, 'Lament: quiet viola counter line enters (E4 to D4 suspension)');
  const VLA = { vel: 0.2, gain: 0.042, attack: 0.9, release: 1.2, pan: -0.32, send: 0.42 };
  legatoLine('vla_sus', VLA, [
    [65.0, 'E4', '', { env: [[0, 0.7], [1.2, 1.0], [1.56, 1.0]] }],
    [66.56, 'D4', '', { env: swell(2.56, 1.0, 1.1, 0.95) }],
    [69.12, 'C#4', '', { env: swell(1.38) }],
    [70.5, 'A#3', '', { env: swell(1.0) }],
    [71.5, 'A3', '', { env: swell(1.3) }],
    [72.8, 'C#4', '', { env: [[0, 0.9], [1.2, 1.05]] }],
    [74.0, 'D4', 'end', { dur: 1.45, release: 1.9, env: [[0, 1.0], [1.45, 0.85]] }],
  ]);

  // -------------------------------------------------------------------------
  // 61.5 to 67.0  Shots 27-28: the giant dissolves. Distant low choir, pedal D, horn pp
  S.cue(61.5, 'Shots 27-28: giant dissolves. Distant low synth choir, contrabass pedal D, horn pp, steam fading');
  S.add(61.5, syn.choir({ notes: [N('D2'), N('A2'), N('D3'), N('F3')], dur: 5.5, attack: 1.8, release: 2.0, gain: 0.012, vowel: 0.2, seed: 31 }), { send: 0.5 });
  S.note('cb_sus', 61.5, { vel: 0.1, midi: N('D1'), dur: 14.0, gain: 0.07, attack: 2.0, release: 1.8 });
  S.note('hn_sus', 62.0, { vel: 0.1, midi: N('D3'), dur: 5.0, gain: 0.08, attack: 0.8, release: 1.5, pan: -0.15, send: 0.4 });
  S.add(61.5, syn.noiseBand({ dur: 4.5, f0: 4800, f1: 4000, q: 0.8, env: [[0, 0.8], [3, 0.5], [4.5, 0]], gain: 0.014, seed: 15, flutter: 0.5 }), { send: 0.2, pan: 0.2 });

  // -------------------------------------------------------------------------
  // 67.0 to 70.0  Shot 29: distant slow metallic footsteps
  // Footsteps on frames 1608, 1637 and 1666 (67.0, 68.208, 69.417 s; they were
  // at 67.0, 68.2 and 69.4 s, between frames).
  S.cue(F(1608), 'Shot 29: distant metallic footsteps on frames 1608, 1637, 1666');
  [[1608, -0.3, 41], [1637, 0.3, 42], [1666, -0.3, 43]].forEach(([fr, pan, seed]) => {
    S.add(0, syn.footstep({ gain: 0.06, seed }), { atSample: S.atFrame(fr), pan, send: 0.4, name: 'footstep' });
  });

  // -------------------------------------------------------------------------
  // 70.0 to 75.5  Shots 30-31: the lament closes
  S.cue(70.0, 'Shots 30-31: cello finishes the phrase');
  S.cue(72.0, 'Violins enter: high sustained D pp');
  S.note('vln_sus', 72.0, { vel: 0, midi: N('D5'), dur: 3.5, gain: 0.045, attack: 1.8, release: 1.9, pan: -0.15, send: 0.4 });
  S.cue(74.0, 'Resolve onto a held low D minor chord');
  S.note('vc_sus', 74.0, { vel: 0.2, midi: N('D2'), dur: 1.5, gain: 0.06, attack: 0.5, release: 1.9, pan: 0.2 });
  S.note('vc_sus', 74.0, { vel: 0.2, midi: N('A2'), dur: 1.5, gain: 0.05, attack: 0.5, release: 1.9, pan: 0.3 });
  S.note('vla_sus', 74.0, { ...PAD, midi: N('F3'), dur: 1.5, gain: 0.045, attack: 0.6, release: 1.9, pan: -0.2 });
  S.note('vla_sus', 74.0, { ...PAD, midi: N('A3'), dur: 1.5, gain: 0.04, attack: 0.6, release: 1.9, pan: 0.2 });
  S.note('hn_sus', 74.0, { vel: 0.1, midi: N('D3'), dur: 1.5, gain: 0.07, attack: 0.6, release: 1.8, pan: -0.1, send: 0.4 });
  S.cue(F(1812), 'Cut to black (frame 1812): chord decays naturally, reverb tail to 77.5 s');
  S.cue(LENGTH, 'End');
}
