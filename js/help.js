// Help text for every control and feature, shown in the Help panel on hover.
// Keys: a param id ('filt.cutoff'), 'section:<id>', a feature name ('scope'),
// or an option ('wave:saw', 'lfo:sh').
// Each entry: title, body (array of paragraphs), optional tip ("Try this").
// Edit freely: this file is plain text for teachers to refine.

export const HELP = {
  // ---- intro (shown when nothing is hovered) ---------------------------------
  intro: {
    title: 'Help',
    body: [
      'Hover over any knob, switch, section title or display to see what it does.',
      'The NF-1 is a subtractive synthesiser. Sound flows left to right across the panel: the oscillators make a bright, buzzy tone; the mixer blends them; the filter carves away harmonics; the envelopes shape how each note changes over time; and the LFO adds movement.',
    ],
    tip: 'Press Init, hold a key (A on your computer keyboard plays C) and turn one knob at a time while watching the oscilloscope and spectrum.',
  },

  // ---- sections ----------------------------------------------------------------
  'section:osc1': {
    title: 'Oscillator 1',
    body: [
      'The sound source. An oscillator produces a wave that repeats over and over. How fast it repeats sets the pitch; the shape of the wave sets the tone colour (timbre).',
      'Everything to the right of the oscillators only shapes what they produce: a filter can remove harmonics but never add ones that were not there.',
    ],
  },
  'section:osc2': {
    title: 'Oscillator 2',
    body: [
      'A second oscillator, mixed with the first. Two oscillators set slightly apart in tuning, or an octave apart, give a thicker, richer sound than one alone.',
      'Oscillator 2 is silent until you turn up Osc 2 in the Mixer.',
    ],
  },
  'section:mix': {
    title: 'Mixer',
    body: [
      'Sets how much of each oscillator is sent to the filter. It is where the two sound sources are blended.',
      'Turning both up drives the filter harder, which adds a little warm saturation, as on analogue synths.',
    ],
  },
  'section:filt': {
    title: 'Low Pass Filter',
    body: [
      'The heart of subtractive synthesis: start with a harmonically rich wave and carve some of it away.',
      'A low-pass filter lets frequencies below the cutoff pass and progressively removes those above it. This one is a 4-pole ladder design, removing 24 dB per octave above the cutoff, in the style of classic 1970s synthesisers.',
    ],
  },
  'section:fenv': {
    title: 'Filter Envelope',
    body: [
      'Moves the filter cutoff automatically every time you play a note, so the tone changes over the life of the note: a bright attack that mellows, or a slow opening swell.',
      'It has Attack, Decay and Release but no Sustain, so after each sweep the cutoff always returns to where the Cutoff knob is set. Env Amount sets how far, and in which direction, it sweeps.',
    ],
  },
  'section:aenv': {
    title: 'Loudness Envelope',
    body: [
      'Shapes the volume of every note from the moment you press a key until after you let go, using four stages: Attack, Decay, Sustain and Release (ADSR).',
      'The envelope is a large part of what makes a sound recognisable: a piano, a violin and an organ playing the same pitch differ greatly in how their volume changes over time.',
    ],
  },
  'section:lfo': {
    title: 'LFO',
    body: [
      'A Low Frequency Oscillator: an oscillator running too slowly to be heard as a pitch (typically below 20 Hz). Instead of being listened to, it is used to move other controls up and down automatically.',
      'Rate, Shape and Delay set how it moves. LFO Modulation sets what it moves.',
    ],
  },
  'section:lfomod': {
    title: 'LFO Modulation',
    body: [
      'Chooses where the LFO is sent and how strongly. The same LFO can move the pitch (vibrato), the filter cutoff (wah or wobble) and the volume (tremolo), alone or together.',
    ],
  },
  'section:glide': {
    title: 'Glide',
    body: ['Controls how the pitch moves from one note to the next, and whether the envelopes restart on each note.'],
  },

  // ---- oscillators ---------------------------------------------------------------
  'osc1.range': {
    title: 'Range',
    body: [
      'Shifts the oscillator up or down in whole octaves. Each octave up doubles the frequency; each octave down halves it.',
      '0 is normal pitch: the A key above middle C plays 440 Hz.',
    ],
    tip: 'With both oscillators in the Mixer, set Oscillator 2 Range to −1. The lower octave adds weight underneath, a common trick for basses.',
  },
  'osc1.wave': {
    title: 'Waveform',
    body: [
      'Chooses the shape of the wave. Each shape contains a different recipe of harmonics (quieter multiples of the main pitch), which is why they sound different at the same note.',
      'Hover over each symbol around the knob to learn about that shape.',
    ],
    tip: 'Hold a note and step through the shapes. Watch the spectrum: sine shows one peak, sawtooth shows a long row of them.',
  },
  'osc2.fine': {
    title: 'Detune',
    body: [
      'Tunes Oscillator 2 slightly sharp or flat, in cents. There are 100 cents in a semitone.',
      'Two oscillators a few cents apart drift in and out of phase with each other, creating a slow pulsing or "beating" that makes the sound wider and livelier. The bigger the detune, the faster the beating.',
    ],
    tip: 'Turn Osc 2 up in the Mixer, then set Detune to +7 cents. Watch the waveform on the oscilloscope slowly change shape as the two waves drift.',
  },
  'wave:sine': {
    title: 'Sine wave',
    body: ['The purest sound: just the fundamental, with no harmonics at all. Smooth and round, like a whistle or a tuning fork. Ideal for sub-bass.', 'Because there are no harmonics, the filter has almost nothing to remove.'],
  },
  'wave:tri': {
    title: 'Triangle wave',
    body: ['Mostly fundamental, with weak odd-numbered harmonics (3rd, 5th, 7th…) that fade away quickly. Soft and hollow, like a muted flute or ocarina.'],
  },
  'wave:saw': {
    title: 'Sawtooth wave',
    body: ['Contains every harmonic, each a little quieter than the last. The brightest, buzziest shape.', 'The classic starting point for subtractive synthesis: brass, strings, basses and leads all start here, with the filter shaping the result.'],
  },
  'wave:square': {
    title: 'Square wave',
    body: ['Odd-numbered harmonics only (3rd, 5th, 7th…). Hollow and woody, often compared to a clarinet. Spends exactly half its time high and half low.'],
  },
  'wave:pulse': {
    title: 'Pulse wave, 25%',
    body: ['High for a quarter of each cycle, low for the rest. Has both odd and even harmonics (except every 4th), giving a nasal, reedy tone.', 'Narrowing a pulse wave moves its sound from hollow (square) towards thin and buzzy.'],
  },
  'wave:narrow': {
    title: 'Pulse wave, 10%',
    body: ['A very narrow pulse: high for only a tenth of each cycle. Thin, buzzy and nasal, like an oboe or harpsichord.'],
  },

  // ---- mixer --------------------------------------------------------------------
  'mix.osc1': { title: 'Osc 1 level', body: ['How much of Oscillator 1 is sent into the filter. At 0 it is silent.'] },
  'mix.osc2': {
    title: 'Osc 2 level',
    body: ['How much of Oscillator 2 is sent into the filter. At 0 it is silent, so Oscillator 2 settings have no effect.'],
    tip: 'Set Osc 1 and Osc 2 to the same level, then try different waveforms on each: their harmonics combine.',
  },

  // ---- filter ---------------------------------------------------------------------
  'filt.cutoff': {
    title: 'Cutoff',
    body: [
      'The frequency where the filter starts to cut. Harmonics above it are reduced, making the sound darker and duller. Fully open (20 kHz) lets everything through.',
      'Turning cutoff is the single most important gesture in subtractive synthesis.',
    ],
    tip: 'Hold a sawtooth note and slowly turn Cutoff down. On the spectrum, the high harmonics on the right collapse; on the scope, the sharp edges of the wave round off.',
  },
  'filt.res': {
    title: 'Resonance',
    body: [
      'Boosts the frequencies right at the cutoff point, adding a peak. Moderate amounts give a vocal, "wah" character that makes filter sweeps stand out.',
      'Near maximum, the filter rings and starts to oscillate by itself, producing a pure whistling tone even with no input.',
    ],
    tip: 'Set Resonance to about 70%, then sweep Cutoff up and down. Watch the peak move across the spectrum.',
  },
  'filt.env': {
    title: 'Env Amount',
    body: [
      'How far, and in which direction, the Filter Envelope moves the cutoff on each note.',
      'Positive values sweep the cutoff up from where the Cutoff knob is set (+100% is up to 7 octaves). Negative values sweep it down instead. At 0 the envelope has no effect.',
    ],
    tip: 'Classic plucked bass: Cutoff around 200 Hz, Env Amount +60%, Decay about 300 ms.',
  },

  // ---- filter envelope ---------------------------------------------------------------
  'fenv.a': {
    title: 'Attack (filter)',
    body: ['Time for the cutoff to sweep from its starting point to its peak after a key is pressed.', 'Short: an instant bright edge. Long: the tone slowly opens, like a brass player blowing harder.'],
  },
  'fenv.d': {
    title: 'Decay (filter)',
    body: ['Time for the cutoff to sweep back from its peak to where the Cutoff knob is set.', 'Short decays give plucky, percussive sounds; long decays give slow, evolving ones.'],
  },
  'fenv.r': {
    title: 'Release (filter)',
    body: ['If you let go of the key before the Decay has finished, this is the time the cutoff takes to return from wherever it has reached.'],
  },

  // ---- loudness envelope ----------------------------------------------------------------
  'aenv.a': {
    title: 'Attack (loudness)',
    body: ['Time to rise from silence to full volume after a key is pressed.', 'Short: a percussive start (pluck, piano). Long: a gentle swell (strings, pads).'],
  },
  'aenv.d': {
    title: 'Decay (loudness)',
    body: ['Time to fall from full volume down to the Sustain level, while the key is still held.'],
  },
  'aenv.s': {
    title: 'Sustain (loudness)',
    body: [
      'The volume held for as long as the key stays down. Unlike the other three stages, Sustain is a level, not a time.',
      'At 100% the note stays at full volume (organ). At 0 the note dies away during Decay even if you keep holding the key (piano, pluck).',
    ],
  },
  'aenv.r': {
    title: 'Release (loudness)',
    body: ['Time to fade to silence after the key is let go. Short: notes stop abruptly. Long: notes ring on after release.'],
    tip: 'Set Release to about 2 seconds and play short notes: each one now has a tail.',
  },

  // ---- LFO -------------------------------------------------------------------------
  'lfo.rate': {
    title: 'Rate',
    body: [
      'How fast the LFO cycles, in hertz (cycles per second). 0.1 Hz is one sweep every 10 seconds; 5 to 7 Hz is a typical vibrato speed.',
      'Above about 20 Hz the movement becomes too fast to hear as movement and instead turns into a buzz or roughness in the tone.',
    ],
  },
  'lfo.shape': {
    title: 'Shape',
    body: ['The pattern the LFO moves in. Hover over each symbol around the knob to learn about that shape.'],
  },
  'lfo:tri': { title: 'Triangle LFO', body: ['Smooth, even up-and-down movement. The natural choice for vibrato and gentle filter sweeps.'] },
  'lfo:saw': { title: 'Ramp LFO', body: ['Rises steadily, then snaps back to the start. Gives repeating rising sweeps, or "zips" when sent to the filter.'] },
  'lfo:square': { title: 'Square LFO', body: ['Jumps between two values with nothing in between. Sent to pitch it makes a trill between two notes; sent to the volume, a choppy on-off effect.'] },
  'lfo:sh': { title: 'Sample & Hold', body: ['Jumps to a new random value at every cycle and holds it until the next. Sent to the filter it gives the classic burbling "computer" sound of science-fiction films.'] },
  'lfo.delay': {
    title: 'Delay',
    body: [
      'Time for the LFO effect to fade in after each new note. At 0 the modulation is there from the start.',
      'This copies how singers and violinists play: a note starts straight, and vibrato is added as it is held.',
    ],
    tip: 'Set → Pitch to about 30 cents, Rate to 5 Hz, then raise Delay to 1 s. Hold a note and listen for the vibrato arriving.',
  },
  'lfo.pitch': {
    title: '→ Pitch (vibrato)',
    body: ['How far the LFO bends the pitch up and down. Small amounts (10 to 30 cents) give a musical vibrato; several semitones gives sirens and sci-fi effects.'],
  },
  'lfo.filter': {
    title: '→ Filter (wah)',
    body: ['How far the LFO sweeps the filter cutoff, in octaves either side of where the Cutoff knob is set. Works best with the cutoff partly closed and some Resonance.'],
    tip: 'Cutoff 300 Hz, Resonance 50%, → Filter 3 oct, Rate 2 Hz: a wobble bass.',
  },
  'lfo.amp': {
    title: '→ Amp (tremolo)',
    body: ['How much the LFO dips the volume. Gives the pulsing tremolo effect heard on electric pianos and guitar amps.'],
  },

  // ---- performance ----------------------------------------------------------------------
  'ctrl.glide': {
    title: 'Glide',
    body: ['Also called portamento. Instead of jumping straight to a new note, the pitch slides there over this length of time. At 0 there is no slide.'],
    tip: 'Set Glide to about 0.25 s and play notes far apart.',
  },
  'ctrl.mode': {
    title: 'Mono / Legato',
    body: [
      'This synth plays one note at a time (monophonic). The mode sets what happens when you play a new note while another is held.',
      'Mono: every note restarts both envelopes and glides from the previous pitch.',
      'Legato: a note played while another key is still held slides smoothly without restarting the envelopes, so a phrase sounds like one breath. A separate note restarts everything and does not glide.',
    ],
    tip: 'Turn up Glide, choose Legato, then hold one key and press another: compare it with playing the keys one after the other.',
  },

  // ---- scope unit --------------------------------------------------------------------
  scope: {
    title: 'Oscilloscope',
    body: [
      'Draws the actual waveform being produced. Left to right is time; up and down is the level of the signal.',
      'It is triggered: it waits for the wave to cross the centre line going upwards before drawing, so a repeating wave stands still. The TRIG light shows when it has locked on.',
    ],
  },
  spectrum: {
    title: 'Spectrum analyser',
    body: [
      'Shows which frequencies are in the sound and how loud each one is. Low frequencies are on the left, high on the right.',
      'A pitched note appears as a row of peaks: the fundamental (the pitch you hear) and its harmonics above it. The dashed orange line marks the Cutoff knob.',
    ],
  },
  timebase: {
    title: 'Time / Div',
    body: [
      'How many milliseconds each grid square represents across the oscilloscope. The screen is 10 squares wide.',
      'Small settings zoom in on one or two cycles of the wave. Large settings show many cycles, so you can see the envelope shaping the volume.',
    ],
  },
  hold: {
    title: 'Hold',
    body: ['Freezes both displays so you can study the waveform and spectrum. Choosing a new Time / Div setting releases it.'],
  },

  // ---- keyboard ------------------------------------------------------------------------
  octave: {
    title: 'Octave',
    body: ['Moves the keyboard up or down one octave. The readout shows the note of the lowest key. Z and X on your computer keyboard do the same.'],
  },
  kbrange: {
    title: 'Keyboard Range',
    body: ['How many octaves of keys are shown: 2, 3 or 4.'],
  },
  keyboard: {
    title: 'Keyboard',
    body: [
      'Click or drag across the keys to play. On your computer keyboard, the A row plays white keys (A S D F G H J K) and the row above plays black keys (W E T Y U).',
      'The amber marks on the keys show which notes your computer keyboard reaches.',
    ],
  },

  // ---- top bar -------------------------------------------------------------------------
  presets: {
    title: 'Patch',
    body: ['Factory sounds. Each one demonstrates a technique: load one, play it, then look at how its knobs are set to work out how it was made.'],
  },
  init: {
    title: 'Init',
    body: ['Resets every control to a plain starting sound: one sawtooth wave, filter fully open, organ-style envelope. The best place to start building a sound from scratch.'],
  },
  showvalues: {
    title: 'Show values',
    body: ['Shows the exact setting under every knob, in real units such as Hz, seconds and cents. Turn it off to train your ears instead of your eyes.'],
  },
  lock: {
    title: 'Lock sections',
    body: ['Greys out parts of the panel so they cannot be changed. Locked sections keep their settings and still affect the sound. Useful for focusing on one section at a time.'],
  },
  help: {
    title: 'Help',
    body: ['Opens and closes this panel.'],
  },
};

// Some options share one explanation across controls.
export function helpKeyFor(key) {
  const m = /^(osc[12]\.wave|lfo\.shape)=(.+)$/.exec(key);
  if (m) return (m[1] === 'lfo.shape' ? 'lfo:' : 'wave:') + m[2];
  if (key === 'osc2.range') return 'osc1.range';
  if (key === 'osc2.wave') return 'osc1.wave';
  return key;
}
