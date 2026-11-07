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
pre-limiter windows above -3 dBFS. A full render takes about 6 s.

## Files

- `sound/render.js`: entry point. Builds the library, places the score, runs the
  reverb, the limiter and the normalisation, writes the WAV and the cue list and
  prints a peak / RMS table per 5 s window plus any samples that failed to load.
- `sound/cues.js`: the cue data. Instrument definitions (folder, loop, attack,
  release, reverb send) and `buildScore()`, which places every note, synth
  signal and named cue second by second against the shot list. Frame numbers
  are converted with `F(frame) = frame / 24`.
- `sound/sampler.js`: note name parsing (C4 = 60), the sample library (scan,
  nearest pitch, velocity layer, round robin, lazy decode, peak normalisation,
  in-memory cache) and the mixer (voices with Hermite interpolation, ADSR-like
  envelope, breakpoint gain envelopes, crossfade looping, constant-power pan,
  reverb send bus).
- `sound/synth.js`: everything that is synthesised (see below).
- `sound/dsp.js`: RBJ biquads, the stereo feedback delay network reverb, the
  soft-knee lookahead limiter and the metering helpers.
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

Sustain samples are 5 to 13 s long, so notes that outlast them loop a region
between 38 and 86 percent of the file with a 0.6 s equal-power crossfade.
Envelopes: linear attack (10 to 60 ms for sustains, 5 ms for sforzando brass,
longer where pads breathe in), hold for the note length, then a smooth
polynomial release (300 to 1900 ms). Optional breakpoint gain envelopes give the
swells (horns pp to ff, cymbal rolls, tremolo crescendos).

Mixing is into Float64 stereo buffers plus a stereo reverb send. The reverb is
an 8-line feedback delay network with Householder mixing, one-pole damping in
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

## Synthesised elements (no samples involved)

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
  to 120 Hz over 3.4 s.
- Steam hiss: quiet bandpassed noise around 4 to 5 kHz with slow level
  flutter (44 to 46 s and 61.5 to 66 s).
- Sub boom at the kick (44 to 29 Hz sweep) and low rumbles (35 Hz sine plus
  90 Hz lowpassed noise) at the hand and the house facade.
- Glass shatter at frame 1236: 28 very short bright noise bursts plus nine
  struck-glass sine pings, layered with a fast descending harp cluster.
- Stone rattle at frame 1247: fifteen tiny repitched anvil hits with random
  spacing over 1.5 s (sampled anvil, randomised by a seeded generator).
- Metallic footsteps at 67.0, 68.2 and 69.4 s: 50 Hz thump, a filtered noise
  click and struck-metal partials at 600, 1340, 2100 and 3470 Hz with
  different decay times, panned left, right, left.

All random choices use a seeded generator, so the render is reproducible.

## Measured level structure

Peak and RMS per 5 s window of the delivered `out/score.wav`:

    0.0 -   5.0 s   peak  -13.0   rms  -28.8
    5.0 -  10.0 s   peak  -12.8   rms  -27.5
   10.0 -  15.0 s   peak   -1.1   rms  -21.7
   15.0 -  20.0 s   peak   -2.1   rms  -24.1
   20.0 -  25.0 s   peak  -15.0   rms  -31.3
   25.0 -  30.0 s   peak   -2.1   rms  -18.6
   30.0 -  35.0 s   peak   -1.3   rms  -17.7
   35.0 -  40.0 s   peak   -1.0   rms  -16.9
   40.0 -  45.0 s   peak  -17.3   rms  -33.8
   45.0 -  50.0 s   peak   -1.0   rms  -13.2
   50.0 -  55.0 s   peak   -1.0   rms  -11.7
   55.0 -  60.0 s   peak   -1.1   rms  -14.2
   60.0 -  65.0 s   peak  -14.2   rms  -29.0
   65.0 -  70.0 s   peak  -13.7   rms  -27.0
   70.0 -  75.0 s   peak  -16.0   rms  -29.3
   75.0 -  77.5 s   peak  -13.9   rms  -30.5

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
