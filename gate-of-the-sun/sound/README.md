# Gate of the Sun: score

Pure node (ESM, node 22, no dependencies) sampler, sequencer and synthesiser
that renders the 77.5 s score for the short (24 fps, 1860 frames) to
`out/score.wav` (48 kHz, 24-bit PCM stereo, exactly 3,720,000 samples) and
writes the cue list to `out/score_cues.txt`.

## Run

    node sound/render.js

The sample library root defaults to the downloaded VSCO 2 CE folder and can be
overridden with `VSCO_ROOT=/path/to/vsco`. Optional diagnostics:
`WINDOW=1` prints the level table in 1 s windows, `DEBUG_RAW=1` lists
pre-limiter windows above -3 dBFS, `DIAG=1` adds a per source table of left
minus right energy by section. A full render takes about 11 s.

Besides the level table, every render prints the impact hit list (frame,
time, sample offset, the number of voices that start on exactly that sample
and the suction that ends on it), the stereo balance per section, the
ambience stem level, the low-end check and the click check. The hit list is
also appended to `out/score_cues.txt`.

## Files

- `sound/render.js`: entry point. Builds the library, places the score,
  high-passes the buses, runs the two reverbs, the limiter and the
  normalisation, writes the WAV and the cue list and prints the reports above
  plus any samples that failed to load.
- `sound/cues.js`: the cue data. Instrument definitions (folder, loop, attack,
  release, reverb send) and `buildScore()`, which places every note, synth
  signal and named cue second by second against the shot list. Frame numbers
  are converted with `F(frame) = frame / 24`.
- `sound/sampler.js`: note name parsing (C4 = 60), the sample library (scan,
  nearest pitch, velocity layer, round robin, lazy decode, peak normalisation,
  in-memory cache) and the mixer (voices with Hermite interpolation, ADSR-like
  envelope, breakpoint gain envelopes, crossfade looping, constant-power pan,
  per-bus reverb sends, legato curves, sustain level matching, 3 ms edge
  fades and the diagnostics).
- `sound/synth.js`: everything that is synthesised (see below).
- `sound/dsp.js`: RBJ biquads, the fourth-order 60 Hz high-pass, the stereo
  feedback delay network reverb, the soft-knee lookahead limiter and the
  metering helpers.
- `sound/wav.js`: WAV reader (PCM 8/16/24/32-bit and float, mono or stereo,
  extensible headers) and 24-bit writer.

## Approach

Samples are decoded once, peak normalised (the library's levels vary by more
than 30 dB between layers, so all dynamics are set explicitly by the score) and
cached. Every library file is 44.1 kHz stereo, 16 or 24-bit. Rather than
resampling to 48 kHz at load and repitching afterwards, each voice reads its
source with 4-point Hermite interpolation at a single ratio
`(44100 / 48000) * 2^((target - sampled) / 12)`, so the rate conversion and
the repitch happen in one interpolation stage. The nearest sampled pitch is
chosen, then the velocity layer nearest the requested dynamic, then a round
robin from a per-note seed.

Pitch naming: the VSCO 2 CE file names follow the "middle C = C3"
convention (measured by autocorrelation: the files named A3 sound at 440 Hz),
whereas `N()` in the cue sheet is scientific (C4 = 60). Every sampled pitched
note therefore sounds one octave above its name in `cues.js` (the cello
"D2" sounds D3, the tuba "D1" sounds D2). Intervals between sampled
instruments are unaffected. The synthesised parts (choir, bells, sub booms)
and the measured timpani roots are at true pitch. This has been left as it
is in the polish pass; transposing the whole orchestra would be a
composition decision.

Sustain samples are 5 to 13 s long, so notes that outlast them loop a region
between 38 and 86 percent of the file with a 0.6 s equal-power crossfade.
Envelopes: linear attack (10 to 60 ms for sustains, 5 ms for sforzando brass,
3 ms for every struck and plucked instrument, longer where pads breathe in),
hold for the note length, then a smooth polynomial release (300 to 1900 ms).
Optional breakpoint gain envelopes give the swells (horns pp to ff, cymbal
rolls, tremolo crescendos).

Clicks: every note and every synthesised signal has at least a 3 ms fade at
both edges. Unlooped notes that run out of source before their release has
finished (18 of them, mostly short pizzicato and percussion tails) now fade
over the last 3 ms of the source instead of stopping dead; the rumbles, sub
boom, glass and footsteps, whose decays were still audible at the end of
their buffers, get a raised-cosine tail. The click check in the render
report measures the first and last sample of every note relative to its own
peak.

Mixing is into three Float64 stereo buses, each with a stereo reverb send:

- `low`: the instruments allowed below 60 Hz, namely bass drums, timpani,
  tuba, contrabass, the sub synths (sub boom, rumbles) and the heartbeat;
- `hp`: everything else, high-passed at 60 Hz with a fourth-order
  Butterworth (dry and send) so the low end belongs to the instruments above;
- `amb`: the diegetic ambience bed, also high-passed, with its own longer
  and darker reverb (T60 2.8 s, 35 ms pre-delay) so it reads as distant and
  can be metered as a stem after the limiter and the normalisation.

The filter is causal, so every onset keeps its exact sample position. The
music reverb is an 8-line feedback delay network with Householder mixing, one-pole damping in
the loop, two allpass diffusers on the input, 20 ms pre-delay and a T60 of
about 2.2 s. Orchestral voices send 25 to 35 percent, percussion 10 to 15,
the distant synth elements more. The final chain is a 0.25 s fade at the end
of the buffer, a soft-knee lookahead peak limiter (4 ms lookahead, 200 ms
release, ceiling -0.45 dBFS, boxcar-smoothed window minimum so it cannot
overshoot) and normalisation to a peak of -1.0 dBFS. The limiter works at most
about 5 dB on the biggest impacts; the quiet sections are left alone.

Timpani files in the library carry no pitch in their names. The fundamentals
of Timpani1 to Timpani5 were measured by autocorrelation (about 45, 60, 70, 84
and 94 Hz, F#1 to F#2) and used as roots so that boulder landings can each
take a different pitch.

The solo cello of the lament uses the cello section samples (the library has
no solo cello); the phrase is written so it still reads as a single line.
It is played legato: each note holds until the next onset and the two cross
over 120 ms with equal-power curves (cosine out, sine in); connected notes
start 0.8 s into their sample, past the slow bow onset of the soft layer, and
every note is level-matched on the part of its sample that is played, so a
change of sample does not change level. Each long note has a slight messa di
voce. There is one breath (bow change) before the leap to the F4. The
falling minor sixth is played with rubato: the F4 leans in 60 ms late at
66.56 s with a swell, the A3 arrives 220 ms late at 69.12 s and the time is
given back before the G3, which is on the beat again at 70.5 s. A quiet viola
counter line (pp, panned left) enters at 65 s: E4 resolving to D4 as the cello
leaps up (a 9-8 suspension), C#4 under the landing of the sixth, B flat and A
under the G and E, then the leading note C#4 rising to D4 on the final
chord, with the same legato crossfades.

## Synthesised elements (no samples involved)

- Ambience bed, 0 to 14.5 s (shots 1 to 5), cut at the flash. A stem below
  -30 dBFS RMS in every 1 s window (measured -33.6 at worst, -36.7 overall)
  so the music leads:
  - soft wind: decorrelated noise per side through a bandpass that follows a
    slow random gust curve (about 250 to 650 Hz) plus a faint airy band,
    fading in over 1.5 s and thinning out through shot 5;
  - distant swallows: seven sparse calls (0.9 to 10.8 s), each 2 to 5 FM
    chirps (sine carrier sweeping between about 7 and 3 kHz, 180 to 320 Hz
    modulator, index about 1), panned alternately left and right;
  - water lapping at the canal steps, 7.0 to 12.5 s: filtered noise swells
    every 0.85 to 1.6 s (bandpass rising about 220 to 650 Hz as each lap
    builds), a small bright slap at each crest and the odd tiny gurgle;
  - the two bell towers, one slow toll each: the left tower on frame 36
    (1.5 s, D3, panned left) and the right tower on frame 108 (4.5 s, A2,
    panned right). Inharmonic partials at 1, 2.0, 2.76, 5.4 and 8.9 times
    the fundamental, each a slightly detuned pair for a slow beat, decays
    from 5.5 s (hum) to 0.7 s, a 4 ms noise strike, a 4 kHz lowpass for air
    absorption and a reverb send of 0.8.
- Pre-impact suctions before the hand (frame 640) and the kick (frame 1112):
  40 ms (1920 samples) of decorrelated stereo noise with a fast exponential
  decay and a lowpass falling from 9 kHz to 600 Hz, reversed in time so it
  swells and brightens into the hit. Each is placed by sample so that its
  last sample is the one just before the impact frame (1,278,080 to
  1,279,999 and 2,222,080 to 2,223,999); the picture holds a 2-frame high
  contrast impact frame from there.
- Choir: the library has no choir, so it is synthesised by formant synthesis.
  Each chord note has three detuned polyBLEP sawtooth voices (about plus or
  minus 7 cents, slow 4.6 to 5.8 Hz vibrato with randomised phase and depth,
  staggered onsets) mixed through three parallel bandpass formant filters
  morphing between 'oo' (330, 870, 2250 Hz) and 'ah' (720, 1120, 2500 Hz),
  then a 3.8 kHz lowpass. Six voices for the D minor and B flat minor chords
  at 31.5 to 37.5 s, four low voices for the distant choir at 61.5 to 67 s.
  It is mixed under the strings and brass so it reads as a distant choir.
- Heartbeat: 'lub' and 'dub' as 60 Hz region sines with a pitch drop and fast
  decay, 72 bpm, 21.5 to 31.5 s and 42 to 44 s.
- Tinnitus ring after the flash: 6 kHz sine fading over 4 s.
- Shock-wave wind: white noise through a bandpass sweeping from 2.4 kHz down
  to 120 Hz over 3.4 s. Its right channel (a blend of two noise sources)
  used to sit 2.4 dB low; it is now level with the left. The same fix applies
  to the steam hiss.
- Steam hiss: quiet bandpassed noise around 4 to 5 kHz with slow level
  flutter (44 to 46 s and 61.5 to 66 s).
- Sub boom at the kick (44 to 29 Hz sweep) and low rumbles (35 Hz sine plus
  90 Hz lowpassed noise) at the hand and the house facade.
- Glass shatter at frame 1236: 28 very short bright noise bursts plus nine
  struck-glass sine pings, layered with a fast descending harp cluster.
- Stone rattle at frame 1247: fifteen tiny repitched anvil hits with random
  spacing over 1.5 s (sampled anvil, randomised by a seeded generator).
- Metallic footsteps on frames 1608, 1637 and 1666 (67.0, 68.208 and
  69.417 s; they sat between frames at 68.2 and 69.4 s before): 50 Hz thump, a filtered noise
  click and struck-metal partials at 600, 1340, 2100 and 3470 Hz with
  different decay times, panned left, right, left.

All random choices use a seeded generator, so the render is reproducible.

## Picture lock

Seconds are frame / 24 and samples are frame * 2000 at 48 kHz, so every frame
maps to an exact sample. Every impact is registered with its frame
(`S.hit`); the render checks that the frame maps to an exact sample and that
at least one voice starts on exactly that sample, and lists the suction that
ends on it. The shock wave hit was moved from 17.6 s (frame 422.4) onto
frame 422. Delivered hit list (frame, seconds, sample offset, voices starting
on that sample):

     frame  208    8.6667 s  sample  416000  offset 0  voices  1
     frame  348   14.5000 s  sample  696000  offset 0  voices 13
     frame  422   17.5833 s  sample  844000  offset 0  voices  4
     frame  640   26.6667 s  sample 1280000  offset 0  voices  7  suction 1278080..1279999 (40.0 ms, peak -16.0 dBFS)
     frame  840   35.0000 s  sample 1680000  offset 0  voices  3
     frame 1112   46.3333 s  sample 2224000  offset 0  voices 15  suction 2222080..2223999 (40.0 ms, peak -11.4 dBFS)
     frame 1190   49.5833 s  sample 2380000  offset 0  voices  4
     frame 1203   50.1250 s  sample 2406000  offset 0  voices  4
     frame 1219   50.7917 s  sample 2438000  offset 0  voices  4
     frame 1236   51.5000 s  sample 2472000  offset 0  voices  6
     frame 1247   51.9583 s  sample 2494000  offset 0  voices  4
     frame 1262   52.5833 s  sample 2524000  offset 0  voices  4
     frame 1281   53.3750 s  sample 2562000  offset 0  voices  4
     frame 1301   54.2083 s  sample 2602000  offset 0  voices  4
     frame 1322   55.0833 s  sample 2644000  offset 0  voices  4
     frame 1341   55.8750 s  sample 2682000  offset 0  voices  4
     frame 1372   57.1667 s  sample 2744000  offset 0  voices  4
     frame 1395   58.1250 s  sample 2790000  offset 0  voices  4

## Stereo balance

Left minus right RMS per section of the delivered file, all within 3 dB. The
polish pass fixed the chaos (was 3.25 dB left heavy: contrabass pizzicato and
horn calls moved right of centre), the start of the lament (3.2 dB, the same
cause) and the right-heavy lament (the section cello samples are recorded
right of centre, so the solo cello line is now panned slightly left to sit in
the middle), plus the noise generator imbalance described above.

       0.00 -  14.50 s  calm town         L  -28.0  R  -28.5  diff   0.46
      14.50 -  17.50 s  flash             L  -18.8  R  -19.6  diff   0.84
      17.50 -  21.00 s  shock wave        L  -22.5  R  -23.8  diff   1.31
      21.00 -  26.67 s  dread             L  -30.1  R  -30.0  diff  -0.06
      26.67 -  29.50 s  hand              L  -15.6  R  -17.0  diff   1.35
      29.50 -  31.50 s  dust              L  -31.6  R  -31.6  diff   0.01
      31.50 -  35.00 s  head rises        L  -16.0  R  -16.4  diff   0.41
      35.00 -  37.50 s  mask              L  -13.6  R  -14.4  diff   0.77
      37.50 -  41.50 s  strings thin      L  -32.1  R  -30.9  diff  -1.20
      41.50 -  44.00 s  near silence      L  -31.9  R  -31.9  diff   0.07
      44.00 -  46.33 s  leg lifts         L  -36.1  R  -38.7  diff   2.61
      46.33 -  57.00 s  kick and chaos    L  -11.7  R  -12.6  diff   0.84
      57.00 -  61.50 s  lament begins     L  -20.0  R  -21.1  diff   1.07
      61.50 -  67.00 s  giant dissolves   L  -29.3  R  -28.1  diff  -1.18
      67.00 -  70.00 s  footsteps         L  -26.9  R  -28.4  diff   1.54
      70.00 -  77.50 s  lament closes     L  -29.3  R  -29.0  diff  -0.30

## Measured level structure

Peak and RMS per 5 s window of the delivered `out/score.wav` (peak -1.0 dBFS,
3,720,000 samples; the limiter works at most 4.9 dB, on the biggest impacts):

       0.0 -   5.0 s   peak  -12.1   rms  -28.2
       5.0 -  10.0 s   peak  -12.6   rms  -26.9
      10.0 -  15.0 s   peak   -1.1   rms  -21.6
      15.0 -  20.0 s   peak   -2.6   rms  -23.5
      20.0 -  25.0 s   peak  -15.4   rms  -31.3
      25.0 -  30.0 s   peak   -2.2   rms  -18.5
      30.0 -  35.0 s   peak   -1.3   rms  -17.7
      35.0 -  40.0 s   peak   -1.0   rms  -16.9
      40.0 -  45.0 s   peak  -17.3   rms  -33.8
      45.0 -  50.0 s   peak   -1.0   rms  -13.6
      50.0 -  55.0 s   peak   -1.0   rms  -12.1
      55.0 -  60.0 s   peak   -1.2   rms  -14.7
      60.0 -  65.0 s   peak  -15.1   rms  -28.3
      65.0 -  70.0 s   peak  -14.0   rms  -28.2
      70.0 -  75.0 s   peak  -15.1   rms  -28.2
      75.0 -  77.5 s   peak  -16.3   rms  -32.3

## Licences

- Sample library: VSCO 2 Community Edition (Versilian Studios Chamber
  Orchestra 2 CE), including its VSCO 1 percussion folder, from
  https://github.com/sgossner/VSCO-2-CE. Released under CC0 1.0 Universal
  (public domain dedication); the LICENSE file in the repository is the CC0
  1.0 text. No attribution is required, but credit to Versilian Studios and
  Sam Gossner is appreciated. Only the .wav files were used; the mp3 and
  archive files in the gong folder were ignored.
- Everything in `sound/` (code and the synthesised elements) was written for
  this project.
