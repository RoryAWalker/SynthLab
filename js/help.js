// Help text for every control and feature, shown in the Help panel when the mouse
// rests on a control for a second.
// Keys: a param id ('filt.cutoff'), 'section:<id>', a feature name ('scope'),
// or an option ('wave:saw', 'lfo:sh').
// Each entry: title, body (array of paragraphs), optional tip ("Try this").
// Edit freely: this file is plain text for teachers to refine.

export const HELP = {
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
  beatlight: {
    title: 'Beat light',
    body: [
      'Pulses in time with the beating between the two oscillators while a note plays. It is brightest when the two waves line up and add together, and darkest when they cancel.',
      'The beat rate equals the difference between the two frequencies in Hz, so the same Detune beats faster on higher notes.',
    ],
    tip: 'Set both Mixer levels equal, Detune to about +5 cents, and hold a low note, then a high one. Watch the light speed up.',
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
    body: ['Factory sounds, plus any patches you have saved under My patches. Each factory patch demonstrates a technique: load one, play it, then look at how its knobs are set to work out how it was made.'],
  },
  save: {
    title: 'Save',
    body: ['Saves the current sound under a name of your choice. Your patches appear under "My patches" in the Patch menu.', 'They are stored in this browser. Use the ⋯ menu to export them to a file, to keep a backup or move them to another computer.'],
  },
  delete: {
    title: 'Delete',
    body: ['Deletes the selected patch from My patches. Factory patches cannot be deleted.'],
  },
  patchfiles: {
    title: 'Export and import',
    body: ['Export saves all your patches into one file. Import loads patches from such a file, for example one shared by a classmate or teacher. Imported patches never replace yours: a patch with the same name is added with a number after it.'],
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
  mode: {
    title: 'Lessons and Free play',
    body: ['Lessons: match target sounds by ear, one challenge at a time, with only the controls you need unlocked.', 'Free play: every control is available, along with the factory patches.'],
  },
  'lesson-steps': {
    title: 'Progress',
    body: ['Each circle is one sound to match. Matched sounds get a green tick. Click a ticked circle to try that challenge again with a new random target.'],
  },
  'lesson-hear': {
    title: 'Hear target',
    body: ['Plays the target sound again. While it plays, the scope and spectrum capture it, and keep it as a dashed amber "target" trace behind your own.'],
  },
  'lesson-hint': {
    title: 'Hint',
    body: ['Appears when you seem stuck. In matching challenges it shows a Hotter/Colder bar that fills up as your sound gets closer to the target; in other challenges it gives a tip.'],
  },
  'lesson-pick': {
    title: 'Choose a lesson',
    body: ['Switch between lessons. Your progress in each lesson is kept.'],
  },
  'lesson-reset': {
    title: 'Reset controls',
    body: ['Puts the unlocked controls back to where this challenge started.'],
  },
  'lesson-ghost': {
    title: 'Show target on scopes',
    body: ['Shows the target sound as a dashed amber trace on the oscilloscope and spectrum. Turn it off to match by ear alone.'],
  },
  synths: { title: 'Menu', body: ['Opens the start menu to choose a different synth. Each synth has its own panel, sound and saved patches.'] },
  scopes: {
    title: 'Scopes',
    body: ['Shows or hides the oscilloscope and spectrum analyser. Hidden, the synth grows to fill the screen; shown, you can see the waveform and harmonics of everything you play, along with the teaching graphs.', 'Lessons always show the scopes, because the target sound is drawn on them.'],
  },
  'section:chorus': {
    title: 'Chorus',
    body: ['Adds slightly delayed copies of the sound whose timing gently wobbles, one on each side. They drift in and out of tune with the original, making it wider, shimmering and lush.', 'The effects come after the synth: the scopes show the synth itself, without them.'],
  },
  'fx.chorus': { title: 'Chorus amount', body: ['How much chorus is mixed in. At 0 it is off.'], tip: 'Try Chorus on a single sawtooth: it starts to sound like two detuned oscillators.' },
  'section:delay': {
    title: 'Delay',
    body: ['Repeats the sound as echoes. Each echo is a little quieter and darker than the last, like a tape echo.'],
  },
  'fx.dtime': { title: 'Delay time', body: ['The time between one echo and the next. Short times (under 0.1 s) thicken the sound; longer times give distinct, rhythmic echoes.'] },
  'fx.delay': { title: 'Delay amount', body: ['How loud the echoes are and how long they keep repeating. At 0 the delay is off.'], tip: 'Set Time to about 0.3 s and Amount to 40%, then play short notes.' },
  'section:reverb': {
    title: 'Reverb',
    body: ['Places the sound in a space by adding thousands of tiny reflections that fade away, like the echo of a room or a hall.'],
  },
  'fx.rsize': { title: 'Reverb size', body: ['How big the space is, as the length of its tail: from about ¾ second (a room) to 3 seconds (a hall).'] },
  'fx.reverb': { title: 'Reverb amount', body: ['How much of the reverberant space you hear. At 0 the reverb is off.'] },
  maximise: {
    title: 'Maximise',
    body: ['Makes the oscilloscope and spectrum much bigger, for looking closely at the sound. The keyboard folds away so the synth\'s controls stay in view (your computer keyboard still plays). Press RESTORE to bring the keyboard back.'],
  },
  fxtab: { title: 'Effects', body: ['Opens or closes the effects: Chorus, Delay and Reverb. They come after the synth, so the scopes still show the synth\'s own sound.'] },
  zoom: {
    title: 'Zoom',
    body: [
      'Pinch on a trackpad to zoom in on any part of the synth, or use the + and − buttons. Click the percentage to fit the whole synth back in the window.',
      'When zoomed in, scroll with two fingers or a mouse wheel to move around. Hold Shift with a mouse wheel to move sideways.',
    ],
  },
  help: {
    title: 'Help',
    body: ['Turns hover help on or off. When it is on, rest the mouse on any knob, switch or display for a second to see an explanation.', 'Grab a knob straight away to use it without help. Grab it once the help has appeared and the help stays open while you turn it.'],
  },
};

// Some options share one explanation across controls.
export function helpKeyFor(key) {
  const m = /^(osc[123]\.wave|lfo\.shape)=(.+)$/.exec(key);
  if (m) return (m[1] === 'lfo.shape' ? 'lfo:' : 'wave:') + m[2];
  if (key === 'osc2.range' || key === 'osc3.range') return 'osc1.range';
  if (key === 'osc2.wave' || key === 'osc3.wave') return 'osc1.wave';
  return key;
}

// Entries that differ on the NiniFoog (nf3), or exist only there. Looked up first on that synth.
export const HELP_NF3 = {
  'section:ctrl': { title: 'Controllers', body: ['Overall tuning, the glide (portamento) time, and Modulation Mix, which chooses what the modulation wheel applies: Oscillator 3, noise, or a blend.'] },
  'section:oscs': {
    title: 'Oscillator Bank',
    body: ['Three oscillators, each with an octave Range and a Waveform. Oscillators 2 and 3 can be tuned against Oscillator 1 with Frequency, for detuned thickness or chords such as fifths.',
      'Oscillator 3 has a second job: switch Osc. 3 Control off and set its Range to LO, and it becomes a slow modulation source (an LFO) for vibrato and filter sweeps.'],
  },
  'section:mix': { title: 'Mixer', body: ['Sets the level of each sound source going into the filter: the three oscillators, noise, and Feedback. A level of 0 switches that source off.', 'Turning several sources up drives the filter into a warm overload, shown by the Overload light.'] },
  'section:mods': {
    title: 'Modifiers',
    body: ['The low-pass filter and the two contour generators (envelopes). The filter carves harmonics away; the Filter Contour moves the cutoff on every note; the Loudness Contour shapes the volume.',
      'Contours have Attack, Decay and Sustain. Release (after letting go) is set by the Decay switch beside the keyboard: off, notes stop almost at once; on, they fade using the Decay time.'],
  },
  'section:perf': { title: 'Controllers', body: ['Glide and Decay switches, the pitch wheel (springs back to centre) and the modulation wheel (stays where you leave it).', 'The keyboard plays legato: a new note takes over the pitch straight away, but the contours only restart when you play a note with no other key held. Let go of the newest note and the pitch returns to the one you are still holding.'] },
  'osc1.range': {
    title: 'Range',
    body: ["The octave, in organ-pipe feet: 8' is normal pitch, each halving (4', 2') is an octave up and each doubling (16', 32') an octave down.",
      'LO drops the oscillator far below hearing, so it slowly wobbles rather than sounds. On Oscillator 3 that turns it into a modulation source.'],
    tip: "Set Oscillator 2 to 16' under Oscillator 1 at 8' for a solid octave bass.",
  },
  'osc3.freq': {
    title: 'Frequency',
    body: ['Tunes Oscillator 3 up or down by up to 7 semitones, like Oscillator 2.',
      'With Range on LO and Osc. 3 Control off, Oscillator 3 is a modulation source and this knob sets its speed instead: from 0.1 Hz (one slow sweep every 10 seconds) to 20 Hz (a fast buzz). About 5 Hz gives a natural vibrato.'],
    tip: 'Push the mod wheel up a little, then turn this knob to hear the vibrato speed up and slow down.',
  },
  'osc2.freq': {
    title: 'Frequency',
    body: ['Tunes this oscillator up or down by up to 7 semitones against Oscillator 1. A tiny amount gives a slow, thickening beat; +7 gives a perfect fifth; +5 a fourth.'],
    tip: 'Turn Osc. 2 up in the Mixer, then set Frequency to +0.1 semitones and listen for the slow beating.',
  },
  'osc.mod': { title: 'Oscillator Modulation', body: ['When on, the modulation source (set by Modulation Mix, scaled by the mod wheel) bends the pitch of Oscillators 1 and 2: vibrato, trills or sirens.'] },
  'osc3.ctrl': { title: 'Oscillator 3 Control', body: ['On: Oscillator 3 follows the keyboard like the others. Off: it ignores the keyboard and holds a fixed pitch, which is how it is used as a modulation source (with Range set to LO).'] },
  'ctrl.modmix': { title: 'Modulation Mix', body: ['Chooses the modulation source: fully left is Oscillator 3, fully right is noise, in between blends them. Oscillator 3 gives regular wobbles; noise gives random, jittery movement.', 'Nothing happens until the mod wheel is raised and Osc. Modulation or Filter Modulation is switched on.'] },
  'ctrl.tune': { title: 'Tune', body: ['Fine-tunes the whole synth by up to a semitone up or down. At 0 the synth is at concert pitch: the A above middle C is 440 Hz.'] },
  'ctrl.glide': { title: 'Glide', body: ['How long the pitch takes to slide from one note to the next. Only works while the Glide switch by the keyboard is on.'] },
  'mix.osc3': { title: 'Osc. 3 level', body: ['How much of Oscillator 3 is heard. When Oscillator 3 is used as a modulation source, turn this down so you only hear its effect.'] },
  'mix.feedback': {
    title: 'Feedback',
    body: ['Feeds the synth\'s own output back into the mixer. Players of the original instrument patched its headphone output back into its External Input for extra punch; this pot does the same job.',
      'A little adds weight and drive; more adds grit and growl; very high settings can squeal. Watch the Overload light.'],
    tip: 'Play a low note, turn Feedback up to about 60%, then sweep the Cutoff Frequency.',
  },
  overload: {
    title: 'Overload light',
    body: ['Shows how hard the mixer is driving the filter. It glows yellow as the filter starts to saturate and turns red when it is pushed hard.', 'Overload is not a fault: a little gives the fat, warm sound the classic three-oscillator synths are famous for. Too much just gets distorted.'],
  },
  'mix.noise': { title: 'Noise level', body: ['Level of the noise generator. White noise is bright and hissy; pink noise is darker and fuller. Use it for wind, breath, percussion, or as a modulation source.'] },
  'mix.noisetype': { title: 'White or Pink noise', body: ['White noise has equal energy at every frequency, so it sounds bright. Pink noise falls away towards the treble, so it sounds softer and more natural (rain, surf, wind).'] },
  'filt.res': { title: 'Emphasis', body: ['Emphasis is the classic name for resonance: it boosts the frequencies around the cutoff. Near the top, the filter rings and starts to whistle on its own.'], tip: 'Set Emphasis to about 70% and sweep the Cutoff Frequency.' },
  'filt.env': { title: 'Amount of Contour', body: ['How far the Filter Contour pushes the cutoff up on each note, up to 7 octaves. At 0 the contour has no effect.'], tip: 'Cutoff low, Amount of Contour about 50%, short Decay, Sustain 0: a classic plucked bass.' },
  'filt.mod': { title: 'Filter Modulation', body: ['When on, the modulation source (Modulation Mix, scaled by the mod wheel) sweeps the filter cutoff: wah and wobble with Oscillator 3, random burbles with noise.'] },
  'filt.kb1': { title: 'Keyboard Control 1', body: ['Makes the cutoff follow the keyboard by one third. With Keyboard Control 2 as well, the cutoff tracks fully, so high notes stay as bright as low ones.'] },
  'filt.kb2': { title: 'Keyboard Control 2', body: ['Makes the cutoff follow the keyboard by two thirds. With Keyboard Control 1 as well, the cutoff tracks fully. With high Emphasis and full tracking, the self-oscillating filter plays in tune.'] },
  'fenv.a': { title: 'Attack Time (filter)', body: ['Time for the filter contour to rise to its peak after a key is pressed.'] },
  'fenv.d': { title: 'Decay Time (filter)', body: ['Time to fall from the peak to the Sustain Level. With the Decay switch on, also the time it takes to fall away after the key is released.'] },
  'fenv.s': { title: 'Sustain Level (filter)', body: ['Where the filter contour settles while the key is held.'] },
  'aenv.d': { title: 'Decay Time (loudness)', body: ['Time to fall from full volume to the Sustain Level. With the Decay switch on, also the fade-out time after the key is released.'] },
  'perf.glideon': { title: 'Glide switch', body: ['Turns glide on or off. The glide time is set by the Glide knob in the Controllers section.'] },
  'perf.decay': { title: 'Decay switch', body: ['Off: notes stop quickly when you let go. On: both contours fade out using their Decay times after you let go, so notes ring on.'] },
  'perf.bend': { title: 'Pitch wheel', body: ['Bends the pitch up or down by up to 2 semitones. It springs back to the centre when you let go.'] },
  'perf.mod': { title: 'Modulation wheel', body: ['How much modulation is applied. The source is set by Modulation Mix; where it goes is set by the Osc. Modulation and Filter Modulation switches.'], tip: 'Load the Osc 3 Vibrato patch and slowly raise the mod wheel.' },
  'wave:shark': { title: 'Shark tooth', body: ['A blend of triangle and sawtooth: softer than a sawtooth but brighter than a triangle, with all harmonics present but fading faster.'] },
  'wave:revsaw': { title: 'Reverse sawtooth', body: ['A sawtooth that falls instead of rising. It sounds the same as a sawtooth, but as a modulation source it gives falling ramps rather than rising ones.'] },
  'wave:wide': { title: 'Wide pulse', body: ['A pulse wave that is high for about 30% of each cycle: hollow but a little brighter and more nasal than a square wave.'] },
};


// Entries for the MiniModular (nfm): its modules, jacks and the controls that differ from the NF-1.
export const HELP_NFM = {
  'section:lfo': { title: 'LFO', body: ['A low-frequency oscillator: a wave too slow to hear, used to move other things up and down. Patch its Out into the VCO\'s FM for vibrato, the VCF\'s CV for a wah, or the VCA\'s CV for tremolo.', 'A signal in its Gate input restarts the wave, for example with every key press.'] },
  'section:osc': { title: 'VCO (Voltage-Controlled Oscillator)', body: ['Makes the raw sound. Its Pitch input sets the note: patch the Keyboard\'s Pitch into it to play tunes. With nothing in Pitch it drones on middle C (moved by Range and Tune).', 'FM bends the pitch with whatever is patched in, by as much as FM Amount allows.'] },
  'section:filt': { title: 'VCF (Voltage-Controlled Filter)', body: ['A low-pass filter: it lets the low frequencies through and cuts the high ones, making the sound darker or brighter. Patch audio into In and take the filtered sound from Out.', 'Anything patched into CV moves the cutoff, by as much as CV Amount allows.'] },
  'section:env': { title: 'ENV (Envelope)', body: ['Makes a shape over time each time its Gate input goes high (a key is pressed): it rises (Attack), falls to a level (Decay, Sustain) and, when the key is let go, falls to zero (Release).', 'Patch its Out into the VCA\'s CV to shape the volume, or into the VCF\'s CV to shape the tone.'] },
  'section:vca': { title: 'VCA (Voltage-Controlled Amplifier)', body: ['A voltage-controlled amplifier: a volume control worked by a signal instead of a hand. Sound goes into In; whatever is patched into CV opens it.', 'With nothing opening it the VCA is shut and you hear nothing. That is why the Envelope\'s Out goes into its CV: the sound starts and stops with the keys.'] },
  'section:out': { title: 'Output', body: ['What you hear. Patch the end of your signal chain (usually the VCA\'s Out) into In.'] },
  'section:kb': { title: 'Keyboard', body: ['The keyboard sends two signals. Pitch says which note is played (patch it into the VCO\'s Pitch). Gate is high while a key is held (patch it into the Envelope\'s Gate).', 'Glide slides the Pitch from one note to the next.'] },

  'kb.glide': { title: 'Glide', body: ['How long the keyboard\'s Pitch takes to slide to a new note. 0 jumps straight there.'] },
  'osc1.range': { title: 'Range', body: ['Shifts the oscillator up or down in whole octaves.'] },
  'osc1.tune': { title: 'Tune', body: ['Tunes the oscillator up or down by up to 7 semitones.'] },
  'osc.fm': { title: 'FM Amount', body: ['How far a signal in the FM input bends the pitch. With the LFO patched in, a little gives vibrato and a lot gives a siren.', 'Patch audio (like the VCO\'s own Out) into FM for harsh, metallic frequency-modulation tones.'] },
  'filt.cv': { title: 'CV Amount', body: ['How far, and which way, a signal in the CV input moves the cutoff. Positive opens the filter as the signal rises; negative closes it.', 'Try the Envelope\'s Out into CV with a low Cutoff: each note starts bright and gets darker.'] },
  'vca.level': { title: 'Level', body: ['Opens the VCA by hand, on top of anything patched into CV. At 0 only the CV opens it; turned up, sound passes all the time (a drone).'] },
  'out.vol': { title: 'Volume', body: ['The overall loudness.'] },
  'aenv.a': { title: 'Attack', body: ['Time for the envelope to rise to full when the Gate goes high.'] },
  'aenv.d': { title: 'Decay', body: ['Time to fall from full to the Sustain level.'] },
  'aenv.s': { title: 'Sustain', body: ['The level held while the Gate stays high (the key is held).'] },
  'aenv.r': { title: 'Release', body: ['Time to fall to zero after the Gate goes low (the key is let go).'] },

  'jack.lfo.gate': { title: 'LFO: Gate input', body: ['Each time the signal here goes high, the LFO restarts its wave from the beginning. Patch the Keyboard\'s Gate here and every note gets its wobble starting the same way (key sync); with nothing here the LFO runs freely and each note catches it somewhere different.'], tip: 'Set up vibrato (LFO Out into the VCO\'s FM), then patch the Keyboard\'s Gate here and play short notes: they all start the same.' },
  'jack.osc.pitch': { title: 'VCO: Pitch input', body: ['Sets the note. Patch the Keyboard\'s Pitch here to play tunes. An LFO here makes the pitch wobble; nothing here, and it holds one note.'], tip: 'Pull this cable out and play: every key gives the same note.' },
  'jack.osc.fm': { title: 'VCO: FM input', body: ['Bends the pitch by the signal patched here, scaled by FM Amount.'], tip: 'Patch the LFO\'s Out here and turn FM Amount up a little: vibrato.' },
  'jack.filt.in': { title: 'VCF: In', body: ['The sound to be filtered, usually the VCO\'s Out.'] },
  'jack.filt.cv': { title: 'VCF: CV input', body: ['Moves the cutoff with the signal patched here, scaled by CV Amount.'], tip: 'Patch the Envelope\'s Out here, set Cutoff low and CV Amount to about +60%.' },
  'jack.env.gate': { title: 'Envelope: Gate input', body: ['Starts the envelope when the signal here goes high, and releases it when it goes low. Usually the Keyboard\'s Gate.'], tip: 'Pull this cable out: the envelope never starts, so the VCA stays shut and you hear nothing.' },
  'jack.vca.in': { title: 'VCA: In', body: ['The sound whose volume the VCA controls, usually the VCF\'s Out.'] },
  'jack.vca.cv': { title: 'VCA: CV input', body: ['Opens the VCA: the higher the signal here, the louder. Usually the Envelope\'s Out.'], tip: 'Patch the LFO\'s Out here instead and turn Level up to half: tremolo. It plays all the time, because the keys no longer open the VCA.' },
  'jack.out.in': { title: 'Output: In', body: ['What you hear. Patch any Out here to listen to it on its own, such as the VCO\'s Out for the raw, unfiltered sound.'] },

  'out:kb.pitch': { title: 'Keyboard: Pitch output', body: ['Which note is played, as a control signal: up one octave on the keyboard, up one step of signal. Drag from here to the VCO\'s Pitch input.'] },
  'out:kb.gate': { title: 'Keyboard: Gate output', body: ['High while a key is held, low when it is let go. Drag from here to the Envelope\'s Gate input.'] },
  'out:lfo.out': { title: 'LFO: Out', body: ['The slow LFO wave. Drag it to an input (FM, Filter CV, VCA CV) to make that move. The light shows it swinging.'] },
  'out:osc.out': { title: 'VCO: Out', body: ['The raw oscillator sound. Usually patched into the VCF\'s In.'] },
  'out:filt.out': { title: 'VCF: Out', body: ['The filtered sound. Usually patched into the VCA\'s In.'] },
  'out:env.out': { title: 'Envelope: Out', body: ['The envelope\'s shape over time. Drag it to the VCA\'s CV to shape volume, or the VCF\'s CV to shape tone.'] },
  'out:vca.out': { title: 'VCA: Out', body: ['The sound after the VCA. Usually patched into the Output.'] },
};

// Entries for the NF-Modular (nfmod): the full rack.
const vcoHelp = (n) => ({
  [`section:vco${n}`]: { title: `VCO ${n} (Voltage-Controlled Oscillator)`, body: ['Makes three waveforms at once, each from its own output: Saw (bright, every harmonic), Pulse (a square wave at 50%: hollow, odd harmonics; its shape set by Pulse Width) and Tri (soft). Patch any of them, or several, into the Mixer.', 'Pitch sets the note (1 V per octave), FM bends it by FM Amount, PWM moves the pulse width, and Sync restarts the wave.'] },
  [`osc${n}.range`]: { title: 'Range', body: ['Shifts the VCO up or down in whole octaves.'] },
  [`osc${n}.tune`]: { title: 'Tune', body: ['Tunes the VCO up or down by up to 7 semitones. Set VCO 2 a few hundredths of a semitone away from VCO 1 for a thick, slowly beating sound.'] },
  [`osc${n}.pw`]: { title: 'Pulse Width', body: ['The shape of the Pulse output: 50% is a true square (hollow); narrower pulses sound thinner and more nasal.'] },
  [`osc${n}.fm`]: { title: 'FM Amount', body: ['How far a signal in the FM input bends the pitch.'] },
  [`osc${n}.pwm`]: { title: 'PWM Amount', body: ['How far a signal in the PWM input moves the pulse width. A slow LFO here gives the classic moving, chorus-like PWM sound.'] },
  [`jack.vco${n}.pitch`]: { title: `VCO ${n}: Pitch input`, body: ['Sets the note: 1 V per octave. Usually the Keyboard\'s Pitch.'] },
  [`jack.vco${n}.fm`]: { title: `VCO ${n}: FM input`, body: ['Bends the pitch by the signal here, scaled by FM Amount: an LFO for vibrato, an envelope for a pitch sweep, or another VCO for metallic FM tones.'] },
  [`jack.vco${n}.pwm`]: { title: `VCO ${n}: PWM input`, body: ['Moves the Pulse output\'s width by the signal here, scaled by PWM Amount.'] },
  [`jack.vco${n}.sync`]: { title: `VCO ${n}: Sync input`, body: ['Each time the signal here rises through zero, this VCO restarts its wave. Patch the other VCO\'s Saw here and sweep this one\'s pitch for the tearing "sync" sound.'] },
  [`out:vco${n}.saw`]: { title: `VCO ${n}: Saw output`, body: ['The sawtooth wave: bright, with every harmonic.'] },
  [`out:vco${n}.sq`]: { title: `VCO ${n}: Pulse output`, body: ['The pulse wave, shaped by Pulse Width (and PWM).'] },
  [`out:vco${n}.tri`]: { title: `VCO ${n}: Tri output`, body: ['The triangle wave: soft, with a few odd harmonics.'] },
});
const envHelp = (n) => ({
  [`section:env${n}`]: { title: `ENV ${n} (Envelope)`, body: ['An ADSR envelope: starts when its Gate goes high, holds at Sustain, and falls at Release when the Gate goes low. Out rises from 0 to 1; Inv is the same shape upside down (0 to −1), for sweeps that go down instead of up.'] },
  [`env${n}.a`]: { title: 'Attack', body: ['Time to rise to full when the Gate goes high.'] },
  [`env${n}.d`]: { title: 'Decay', body: ['Time to fall from full to the Sustain level.'] },
  [`env${n}.s`]: { title: 'Sustain', body: ['The level held while the Gate stays high.'] },
  [`env${n}.r`]: { title: 'Release', body: ['Time to fall to zero after the Gate goes low.'] },
  [`jack.env${n}.gate`]: { title: `ENV ${n}: Gate input`, body: ['Starts the envelope when the signal here goes high, and releases it when it goes low. Usually the Keyboard\'s Gate; an LFO square here repeats it.'] },
  [`out:env${n}.out`]: { title: `ENV ${n}: Out`, body: ['The envelope, 0 to 1.'] },
  [`out:env${n}.inv`]: { title: `ENV ${n}: Inv (inverted)`, body: ['The envelope upside down, 0 to −1. Into the VCF\'s CV it sweeps the cutoff down at each note instead of up.'] },
});
const vcaHelp = (n) => ({
  [`section:vca${n}`]: { title: `VCA ${n} (Voltage-Controlled Amplifier)`, body: ['A volume control worked by a signal. Level opens it by hand; the CV input opens it further, by as much as CV Amount allows.'] },
  [`vca${n}.level`]: { title: 'Level', body: ['Opens the VCA by hand. At 0 only the CV opens it.'] },
  [`vca${n}.cv`]: { title: 'CV Amount', body: ['How much the CV input opens the VCA. Turn it down, with Level up, for gentle tremolo from an LFO.'] },
  [`jack.vca${n}.in`]: { title: `VCA ${n}: In`, body: ['The signal whose level the VCA controls.'] },
  [`jack.vca${n}.cv`]: { title: `VCA ${n}: CV input`, body: ['Opens the VCA: usually an envelope, or an LFO for tremolo.'] },
  [`out:vca${n}.out`]: { title: `VCA ${n}: Out`, body: ['The signal after the VCA.'] },
});
export const HELP_NFMOD = {
  ...vcoHelp(1), ...vcoHelp(2), ...envHelp(1), ...envHelp(2), ...vcaHelp(1), ...vcaHelp(2),
  'section:kb': { title: 'Keyboard', body: ['Pitch: which note (1 V per octave). Gate: high while a key is held. Trig: a short pulse at the start of every note, even when you play legato (Gate stays high when notes overlap).', 'Glide slides the Pitch from note to note.'] },
  'kb.glide': { title: 'Glide', body: ['How long the keyboard\'s Pitch takes to slide to a new note.'] },
  'out:kb.pitch': { title: 'Keyboard: Pitch output', body: ['Which note is played, 1 V per octave.'] },
  'out:kb.gate': { title: 'Keyboard: Gate output', body: ['High while a key is held.'] },
  'out:kb.trig': { title: 'Keyboard: Trig output', body: ['A short pulse each time a key is pressed. Use it to restart an LFO or clock the S&H on every note.'] },
  'section:noise': { title: 'Noise', body: ['Random signal at every frequency. White is bright and hissy (equal energy per frequency); Pink is darker and rounder (equal energy per octave). Use it as a sound (wind, drums, breath) or as a random control signal.'] },
  'out:noise.white': { title: 'Noise: White', body: ['Bright, hissing noise.'] },
  'out:noise.pink': { title: 'Noise: Pink', body: ['Darker, rumbling noise.'] },
  'section:mix': { title: 'Mixer', body: ['Adds up to four signals into one, each with its own level. Mix the two VCOs, add noise, or mix control signals (an envelope and an LFO) before they go into one CV input.'] },
  'mix.l1': { title: 'Level 1', body: ['How much of In 1 goes into the mix.'] },
  'mix.l2': { title: 'Level 2', body: ['How much of In 2 goes into the mix.'] },
  'mix.l3': { title: 'Level 3', body: ['How much of In 3 goes into the mix.'] },
  'mix.l4': { title: 'Level 4', body: ['How much of In 4 goes into the mix.'] },
  'jack.mix.in1': { title: 'Mixer: In 1', body: ['Any signal, set by Level 1.'] },
  'jack.mix.in2': { title: 'Mixer: In 2', body: ['Any signal, set by Level 2.'] },
  'jack.mix.in3': { title: 'Mixer: In 3', body: ['Any signal, set by Level 3.'] },
  'jack.mix.in4': { title: 'Mixer: In 4', body: ['Any signal, set by Level 4.'] },
  'out:mix.out': { title: 'Mixer: Out', body: ['All four inputs added together.'] },
  'section:filt': { title: 'VCF (Voltage-Controlled Filter)', body: ['A 24 dB/octave low-pass filter. Its cutoff moves with CV (scaled by CV Amount) and with Key (exactly one octave per octave: patch the Keyboard\'s Pitch here and the filter follows the notes). Res adds to the Resonance knob.'] },
  'filt.cv': { title: 'CV Amount', body: ['How far, and which way, the CV input moves the cutoff.'] },
  'jack.filt.in': { title: 'VCF: In', body: ['The sound to filter, usually the Mixer\'s Out.'] },
  'jack.filt.cv': { title: 'VCF: CV input', body: ['Moves the cutoff by the signal here, scaled by CV Amount.'] },
  'jack.filt.key': { title: 'VCF: Key input', body: ['Moves the cutoff one octave for each octave of signal, so the Keyboard\'s Pitch here makes the tone stay even from low notes to high (keyboard tracking). With Resonance up, the filter plays in tune.'] },
  'jack.filt.res': { title: 'VCF: Res input', body: ['Adds the signal here to the Resonance setting: an envelope or LFO makes the resonance come and go.'] },
  'out:filt.out': { title: 'VCF: Out', body: ['The filtered sound.'] },
  'section:lfo': { title: 'LFO', body: ['A slow wave for moving other things. Gate restarts it; Rate speeds it up or slows it down by the signal there (scaled by Rate CV).'] },
  'lfo.rcv': { title: 'Rate CV', body: ['How much a signal in the Rate input changes the LFO\'s speed. An envelope here makes the wobble speed up or slow down during a note.'] },
  'jack.lfo.gate': { title: 'LFO: Gate input', body: ['Restarts the wave each time the signal here rises: the Keyboard\'s Gate or Trig gives key sync.'] },
  'jack.lfo.rate': { title: 'LFO: Rate input', body: ['Changes the LFO\'s speed by the signal here, scaled by Rate CV.'] },
  'out:lfo.out': { title: 'LFO: Out', body: ['The slow LFO wave, −1 to 1.'] },
  'section:sh': { title: 'S&H (Sample and Hold)', body: ['Each time the Clock input rises, it measures (samples) the In and holds that value until the next clock. With nothing in In it samples noise, giving a new random value each time: the classic "random bleeps" when patched into the VCF\'s CV.'] },
  'jack.sh.in': { title: 'S&H: In', body: ['The signal to sample. Empty: noise (random values).'] },
  'jack.sh.clock': { title: 'S&H: Clock input', body: ['Each rise here takes a new sample. A square LFO gives a steady rhythm; the Keyboard\'s Trig gives one per note.'] },
  'out:sh.out': { title: 'S&H: Out', body: ['The held value: a staircase of steps.'] },
  'section:out': { title: 'Output', body: ['What you hear. Patch the end of your chain into In.'] },
  'out.vol': { title: 'Volume', body: ['The overall loudness.'] },
  'jack.out.in': { title: 'Output: In', body: ['What you hear. Patch any output here to listen to it on its own.'] },
};
