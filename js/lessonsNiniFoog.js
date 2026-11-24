// NiniFoog lessons. Matching a whole three-oscillator sound by ear is hard, so these lessons
// teach what makes the NiniFoog different (three oscillators, Osc 3 as a modulator, the Decay
// switch, feedback, a filter that plays in tune), and when they ask for matching by ear, it is
// one thing at a time. Same challenge format as lessons.js (match, goal and question).

import { lfoHz } from './synths/nf3.js';

const lfoKnob = (hz) => 14 * Math.log(hz / 0.1) / Math.log(200) - 7; // Osc 3 LFO speed -> Frequency knob
const played = (s) => s.note != null;
const mixSum = (p) => p['mix.osc1'] + p['mix.osc2'] + p['mix.osc3'];
const share = (...bits) => bits.filter(Boolean).length / bits.length;
const ALL = ['ctrl', 'oscmod', 'oscs', 'mix', 'filtsw', 'mods', 'perf'];

// starting points
const OSC3_NOTE = { 'osc3.ctrl': 'on', 'osc3.range': 0, 'osc3.freq': 0, 'osc.mod': 'off' }; // Osc 3 playing a note, not modulating
const THREE = { ...OSC3_NOTE, 'mix.osc1': 0.7, 'mix.osc2': 0.7, 'mix.osc3': 0.7 };
const OSC3_ONLY = { ...OSC3_NOTE, 'mix.osc1': 0, 'mix.osc2': 0, 'mix.osc3': 0.8 };

export const NF3_LESSONS = [
  {
    id: 'nf3-oscs', number: 1, title: 'Three Oscillators',
    summary: 'Stack the NiniFoog\'s three oscillators into octaves, intervals and slowly beating unisons, and learn the organ-pipe footages.',
    doneText: 'You stacked octaves, tuned a fifth, made two oscillators beat, and named footages and intervals by ear.',
    introUnlocked: [], scopes: true,
    challenges: [
      {
        type: 'goal', title: 'Wake the other two',
        text: 'At Init only Oscillator 1 is heard: Oscillator 3 is busy as a slow modulator. Turn Osc. 2 and Osc. 3 up past halfway in the Mixer, switch Osc. 3 Control on, and set Oscillator 3\'s Range to 8′ so it plays a note too. Then play.',
        unlocked: ALL,
        make: (c) => ({ start: {}, note: c.note }),
        check: (s) => s.patch['mix.osc2'] >= 0.5 && s.patch['mix.osc3'] >= 0.5 && s.patch['osc3.ctrl'] === 'on' && s.patch['osc3.range'] > -7 && played(s),
        progress: (s) => share(s.patch['mix.osc2'] >= 0.5, s.patch['mix.osc3'] >= 0.5, s.patch['osc3.ctrl'] === 'on', s.patch['osc3.range'] > -7),
        hint: 'Mixer: Osc. 2 and Osc. 3 knobs past 5. Osc. 3 Control switch: on. Oscillator 3 Range: 8′ (the middle setting).',
      },
      {
        type: 'goal', title: 'Stack the octaves',
        text: 'Set Oscillator 1 to 32′, Oscillator 2 to 16′ and Oscillator 3 to 8′: three octaves stacked, the classic big bass. Play a low note.',
        unlocked: ALL,
        make: (c) => ({ start: THREE, note: c.note }),
        check: (s) => s.patch['osc1.range'] === -2 && s.patch['osc2.range'] === -1 && s.patch['osc3.range'] === 0 && played(s),
        progress: (s) => share(s.patch['osc1.range'] === -2, s.patch['osc2.range'] === -1, s.patch['osc3.range'] === 0),
        hint: 'Each Range knob is marked in feet: 32′, 16′, 8′, 4′, 2′. Oscillator 1 to 32′, Oscillator 2 to 16′, Oscillator 3 to 8′.',
      },
      {
        type: 'question', title: 'Feet',
        text: 'The Range knobs are marked in feet, like the pipes of an organ.',
        unlocked: ALL,
        make: (c) => ({ start: THREE, note: c.note }),
        question: {
          prompt: 'Which footage plays the lowest note?',
          options: [
            { text: '32′', correct: true },
            { text: '2′', feedback: 'A short pipe plays a high note. Think of a tiny whistle against a huge organ pipe.' },
            { text: '8′', feedback: '8′ is "normal" pitch. Which is longer?' },
          ],
          explain: 'A longer pipe plays a lower note, and every doubling of the length drops it an octave: 32′ is two octaves below 8′, and 2′ two octaves above. Synth makers borrowed the organ\'s footages.',
        },
      },
      {
        type: 'goal', title: 'A fifth',
        text: 'Set Oscillator 2\'s Frequency to +7 semitones, with Osc. 1 and Osc. 2 both up in the Mixer, and play: a perfect fifth, the "power chord".',
        unlocked: ALL,
        make: (c) => ({ start: { ...THREE, 'mix.osc3': 0 }, note: c.note }),
        check: (s) => Math.abs(s.patch['osc2.freq'] - 7) <= 0.2 && s.patch['osc1.range'] === s.patch['osc2.range'] && s.patch['mix.osc2'] >= 0.4 && played(s),
        progress: (s) => Math.max(0, 1 - Math.abs(s.patch['osc2.freq'] - 7) / 7),
        hint: 'Oscillator 2\'s Frequency knob, all the way to +7 (turn on Show values to see exactly). Keep both Ranges the same.',
      },
      {
        type: 'question', title: 'Frequency or Range?',
        text: 'Frequency moves Oscillator 2 up to 7 semitones; Range moves it in whole octaves.',
        unlocked: ALL,
        make: (c) => ({ start: { ...THREE, 'mix.osc3': 0 }, note: c.note }),
        question: {
          prompt: 'Raising Oscillator 2 by 12 semitones would sound the same as…',
          options: [
            { text: 'Moving its Range up one step', correct: true },
            { text: 'Moving its Range up two steps', feedback: 'Two steps of Range is two octaves: 24 semitones.' },
            { text: 'Turning Osc. 2 up in the Mixer', feedback: 'The Mixer changes how loud it is, not its pitch.' },
          ],
          explain: 'An octave is 12 semitones, and each step of Range is one octave. That is why Frequency only needs to reach ±7: Range covers the octaves.',
        },
      },
      {
        type: 'goal', title: 'Slow beating',
        text: 'Two oscillators on the same note, very slightly apart, drift in and out of step: beating. Set Oscillator 2\'s Frequency between +0.03 and +0.15 semitones (Ranges the same) and hold a note.',
        unlocked: ALL,
        make: (c) => ({ start: { ...THREE, 'mix.osc3': 0 }, note: c.note }),
        check: (s) => s.patch['osc2.freq'] >= 0.03 && s.patch['osc2.freq'] <= 0.15 && s.patch['osc1.range'] === s.patch['osc2.range'] && s.held,
        progress: (s) => (s.patch['osc2.freq'] >= 0.03 && s.patch['osc2.freq'] <= 0.15 ? 1 : Math.max(0, 1 - Math.abs(s.patch['osc2.freq'] - 0.08) / 3)),
        hint: 'Turn on Show values. Nudge Oscillator 2\'s Frequency just above 0 (hold Shift while dragging for fine control) and hold a key: the sound swells and fades slowly.',
      },
      {
        title: 'Which footage?',
        text: 'Only Oscillator 3 is heard. Press Hear target: it has moved to a different footage. Match it, playing the marked key.',
        unlocked: ALL, start: OSC3_ONLY, compare: ['osc3.range'], showKey: true,
        make: (c) => ({ patch: { 'osc3.range': c.pick([-2, -1, 1, 2]) }, note: c.note }),
      },
      {
        title: 'Fifth or fourth?',
        text: 'Oscillators 1 and 2 are playing together. Oscillator 2 is either a fifth (+7) or a fourth (+5) above. Match it by ear.',
        unlocked: ALL, start: { ...THREE, 'mix.osc3': 0 }, compare: ['osc2.freq'], showKey: true,
        make: (c) => ({ patch: { 'osc2.freq': c.pick([5, 7]) }, note: c.note }),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'nf3-mod', number: 2, title: 'Osc 3: the Modulator',
    summary: 'The NiniFoog\'s big idea: Oscillator 3 can leave the keyboard, slow down below hearing, and move the pitch or the filter, with the mod wheel as the depth.',
    doneText: 'You used Oscillator 3 as an LFO for vibrato, trills and filter wobbles, swapped it for noise, brought it back as a note, and told pitch from filter modulation by ear.',
    introUnlocked: [], scopes: true,
    challenges: [
      {
        type: 'question', title: 'The mod wheel',
        text: 'Init is set up with Oscillator 3 as a slow, silent modulator. Hold a note and push the Mod wheel (left of the keys) about halfway up.',
        unlocked: ALL,
        make: (c) => ({ start: {}, note: c.note }),
        revealWhen: (s) => s.patch['perf.mod'] >= 0.4 && s.held,
        progress: (s) => Math.min(1, s.patch['perf.mod'] / 0.4),
        hint: 'Drag the Mod wheel up while holding a key.',
        question: {
          prompt: 'What does the mod wheel do here?',
          options: [
            { text: 'It adds vibrato: Oscillator 3, too slow to hear as a note, is wobbling the pitch', correct: true },
            { text: 'It makes the sound louder', feedback: 'Listen to the pitch, not the volume.' },
            { text: 'It changes the waveform', feedback: 'The tone colour stays the same. Something is moving up and down.' },
          ],
          explain: 'With its Range on LO and Osc. 3 Control off, Oscillator 3 ignores the keyboard and runs a few times a second. Oscillator Modulation sends it to the other oscillators\' pitch, and the mod wheel sets how much.',
        },
      },
      {
        type: 'goal', title: 'Slower',
        text: 'In this mode, Oscillator 3\'s Frequency knob is its speed. Slow it down below 2 Hz, push the mod wheel up, and hold a note: a lazy, seasick wobble.',
        unlocked: ALL,
        make: (c) => ({ start: { 'perf.mod': 0.45 }, note: c.note }),
        check: (s) => lfoHz(s.patch['osc3.freq']) <= 2 && s.patch['perf.mod'] >= 0.3 && s.held,
        progress: (s) => share(lfoHz(s.patch['osc3.freq']) <= 2, s.patch['perf.mod'] >= 0.3, s.held),
        hint: 'Turn Oscillator 3\'s Frequency knob down (left) until Show values reads under 2 Hz.',
      },
      {
        type: 'goal', title: 'A trill',
        text: 'Change Oscillator 3\'s Waveform to square: it now jumps between two values instead of sliding. With the mod wheel at least halfway, the pitch jumps between two notes: a trill.',
        unlocked: ALL,
        make: (c) => ({ start: { 'perf.mod': 0.3 }, note: c.note }),
        check: (s) => s.patch['osc3.wave'] === 'square' && s.patch['perf.mod'] >= 0.5 && s.held,
        progress: (s) => share(s.patch['osc3.wave'] === 'square', s.patch['perf.mod'] >= 0.5, s.held),
        hint: 'Oscillator 3\'s Waveform knob to the square wave symbol. Mod wheel above halfway. Hold a key.',
      },
      {
        type: 'goal', title: 'Wobble the filter',
        text: 'Send Oscillator 3 to the filter instead: Oscillator Modulation off, Filter Modulation on. Bring the Cutoff Frequency down below 1.5 kHz, Emphasis up a little (30%+), mod wheel up, and hold a note.',
        unlocked: ALL,
        make: (c) => ({ start: { 'perf.mod': 0.6, 'osc3.wave': 'tri' }, note: c.note }),
        check: (s) => s.patch['osc.mod'] === 'off' && s.patch['filt.mod'] === 'on' && s.patch['filt.cutoff'] <= 1500 && s.patch['filt.res'] >= 0.3 && s.patch['perf.mod'] >= 0.4 && s.held,
        progress: (s) => share(s.patch['osc.mod'] === 'off', s.patch['filt.mod'] === 'on', s.patch['filt.cutoff'] <= 1500, s.patch['filt.res'] >= 0.3, s.held),
        hint: 'The Oscillator Modulation switch is by the Oscillator Bank; Filter Modulation is by the Filter. Then Cutoff down and Emphasis up.',
      },
      {
        type: 'question', title: 'Noise as a modulator',
        text: 'Turn Modulation Mix (in Controllers) all the way to Noise, keep the filter wobble going, and hold a note.',
        unlocked: ALL,
        make: (c) => ({ start: { 'osc.mod': 'off', 'filt.mod': 'on', 'filt.cutoff': 900, 'filt.res': 0.5, 'perf.mod': 0.6 }, note: c.note }),
        revealWhen: (s) => s.patch['ctrl.modmix'] >= 0.9 && s.held,
        progress: (s) => Math.min(1, s.patch['ctrl.modmix'] / 0.9),
        hint: 'Modulation Mix is the bottom knob in Controllers. Turn it fully right.',
        question: {
          prompt: 'What changed?',
          options: [
            { text: 'The movement became random: noise has no regular cycle', correct: true },
            { text: 'It got faster but stayed regular', feedback: 'Listen for a pattern. Does it repeat?' },
          ],
          explain: 'Noise is a random signal, so as a modulator it pushes the filter about unpredictably: a bubbling, burbling sound. Modulation Mix blends between the regular Oscillator 3 and the random noise.',
        },
      },
      {
        type: 'goal', title: 'Back to a note',
        text: 'Now put Oscillator 3 back to work as a sound: Osc. 3 Control on, Range 8′, and Osc. 3 up in the Mixer. Play: it follows the keyboard again.',
        unlocked: ALL,
        make: (c) => ({ start: {}, note: c.note }),
        check: (s) => s.patch['osc3.ctrl'] === 'on' && s.patch['osc3.range'] > -7 && s.patch['mix.osc3'] >= 0.4 && played(s),
        progress: (s) => share(s.patch['osc3.ctrl'] === 'on', s.patch['osc3.range'] > -7, s.patch['mix.osc3'] >= 0.4),
        hint: 'Osc. 3 Control (the vertical switch by Oscillator 3): on. Range: 8′. Mixer Osc. 3: up.',
      },
      {
        title: 'Pitch or filter?',
        text: 'The mod wheel is up. Is Oscillator 3 moving the pitch, or the filter? Set the two modulation switches to match.',
        unlocked: ALL, start: { 'osc.mod': 'off', 'filt.mod': 'off', 'perf.mod': 0.55, 'filt.cutoff': 1200, 'filt.res': 0.4 }, compare: ['osc.mod', 'filt.mod'], showKey: true,
        make: (c) => ({ patch: c.pick([{ 'osc.mod': 'on', 'filt.mod': 'off' }, { 'osc.mod': 'off', 'filt.mod': 'on' }]), note: c.note }),
      },
      {
        title: 'Fast or slow?',
        text: 'Vibrato from Oscillator 3. Match its speed with Oscillator 3\'s Frequency knob.',
        unlocked: ALL, start: { 'perf.mod': 0.35, 'osc3.freq': lfoKnob(4) }, compare: ['osc3.freq'], showKey: true,
        make: (c) => ({ patch: { 'osc3.freq': lfoKnob(c.pick([1.2, 9])) }, note: c.note }),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'nf3-contour', number: 3, title: 'Contours',
    summary: 'The NiniFoog\'s contours have Attack, Decay and Sustain, and a Decay switch instead of a Release knob. Make plucks, swells and filter sweeps.',
    doneText: 'You found the missing Release, made a ringing note, a pluck and a swell, swept the filter with its contour, and heard how legato playing works.',
    introUnlocked: [], scopes: true,
    challenges: [
      {
        type: 'question', title: 'Where is Release?',
        text: 'Play a note and let go.',
        unlocked: ALL,
        make: (c) => ({ start: {}, note: c.note }),
        revealWhen: (s) => played(s) && !s.held,
        hint: 'Click a key and let go.',
        question: {
          prompt: 'The note stops almost instantly. Why?',
          options: [
            { text: 'The Decay switch is off, so there is no release', correct: true },
            { text: 'The Attack Time is too short', feedback: 'Attack is the start of the note. This is about the end.' },
            { text: 'The Sustain Level is at 100%', feedback: 'Sustain is how loud it holds while the key is down.' },
          ],
          explain: 'The NiniFoog has no Release knob. The Decay switch (left of the keys) decides: off, the note stops as soon as you let go; on, it fades away at the Decay Time.',
        },
      },
      {
        type: 'goal', title: 'Let it ring',
        text: 'Switch Decay on, set the Loudness Contour\'s Decay Time to at least a second, then play a note and let go: it rings on.',
        unlocked: ALL,
        make: (c) => ({ start: {}, note: c.note }),
        check: (s) => s.patch['perf.decay'] === 'on' && s.patch['aenv.d'] >= 1 && played(s) && !s.held,
        progress: (s) => share(s.patch['perf.decay'] === 'on', s.patch['aenv.d'] >= 1, played(s)),
        hint: 'Decay switch: on (left of the keys). Loudness Contour Decay Time: 1 s or more. Then tap a key.',
      },
      {
        type: 'goal', title: 'Pluck',
        text: 'A pluck starts at once and dies away by itself. Loudness Contour: Attack under 10 ms, Decay between 0.2 and 0.6 s, Sustain at 0. Decay switch on. Play.',
        unlocked: ALL,
        make: (c) => ({ start: { 'perf.decay': 'on' }, note: c.note }),
        check: (s) => s.patch['aenv.a'] <= 0.01 && s.patch['aenv.d'] >= 0.2 && s.patch['aenv.d'] <= 0.6 && s.patch['aenv.s'] <= 0.05 && played(s),
        progress: (s) => share(s.patch['aenv.a'] <= 0.01, s.patch['aenv.d'] >= 0.2 && s.patch['aenv.d'] <= 0.6, s.patch['aenv.s'] <= 0.05),
        hint: 'Loudness Contour: Attack Time fully left, Decay Time around 0.3 s, Sustain Level fully left.',
      },
      {
        type: 'goal', title: 'Swell',
        text: 'Now the opposite: a note that fades in slowly. Attack Time at least 1 s, Sustain at least 80%. Hold a key.',
        unlocked: ALL,
        make: (c) => ({ start: {}, note: c.note }),
        check: (s) => s.patch['aenv.a'] >= 1 && s.patch['aenv.s'] >= 0.8 && s.held,
        progress: (s) => share(s.patch['aenv.a'] >= 1, s.patch['aenv.s'] >= 0.8, s.held),
        hint: 'Loudness Contour Attack Time to 1 s or more, then hold a key down.',
      },
      {
        type: 'goal', title: 'The filter contour',
        text: 'The filter has its own contour. Cutoff Frequency below 400 Hz, Amount of Contour at least halfway, Filter Contour Decay between 0.2 and 1 s and Sustain under 20%. Play: each note starts bright and closes down.',
        unlocked: ALL,
        make: (c) => ({ start: {}, note: c.note }),
        check: (s) => s.patch['filt.cutoff'] <= 400 && s.patch['filt.env'] >= 0.5 && s.patch['fenv.d'] >= 0.2 && s.patch['fenv.d'] <= 1 && s.patch['fenv.s'] <= 0.2 && played(s),
        progress: (s) => share(s.patch['filt.cutoff'] <= 400, s.patch['filt.env'] >= 0.5, s.patch['fenv.d'] >= 0.2 && s.patch['fenv.d'] <= 1, s.patch['fenv.s'] <= 0.2),
        hint: 'Filter: Cutoff down, Amount of Contour up past 5. Filter Contour: Decay Time about 0.4 s, Sustain Level near 0.',
      },
      {
        type: 'question', title: 'Legato',
        text: 'Hold one key, and while still holding it, play a second key.',
        unlocked: ALL,
        make: (c) => ({ start: { 'aenv.a': 0.3, 'aenv.s': 0.6 }, note: c.note }),
        revealWhen: (s) => s.heldCount >= 2,
        hint: 'Press and hold one key, then press another before letting go of the first.',
        question: {
          prompt: 'Did the second note start its contour again (the slow attack)?',
          options: [
            { text: 'No: overlapping notes only change the pitch', correct: true },
            { text: 'Yes, it faded in again', feedback: 'Try again, holding the first key down the whole time. Listen for the fade-in.' },
          ],
          explain: 'The NiniFoog plays legato: a note played while another is held just moves the pitch, and the contours carry on. Only a note played on its own starts them again. Lead players use this to make phrases flow.',
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'nf3-feedback', number: 4, title: 'Feedback and Drive',
    summary: 'Push the mixer and the Feedback loop to overdrive the filter, and learn what the Overload light is telling you.',
    doneText: 'You lit the Overload light, heard what overdrive does to the tone, found a controlled growl, and learnt that feedback needs something to feed back.',
    introUnlocked: [], scopes: true,
    challenges: [
      {
        type: 'goal', title: 'Light the Overload',
        text: 'Turn all three oscillators up (adding up to at least 1.8 in the Mixer) and Feedback past halfway, then hold a note: the Overload light by Feedback glows.',
        unlocked: ALL,
        make: (c) => ({ start: { ...THREE, 'mix.osc1': 0.5, 'mix.osc2': 0.5, 'mix.osc3': 0.5 }, note: c.note }),
        check: (s) => mixSum(s.patch) >= 1.8 && s.patch['mix.feedback'] >= 0.5 && s.held,
        progress: (s) => share(mixSum(s.patch) >= 1.8, s.patch['mix.feedback'] >= 0.5, s.held),
        hint: 'Mixer: Osc. 1, 2 and 3 to about 7 each, Feedback past 5. Hold a key and watch the light.',
      },
      {
        type: 'question', title: 'What is overload?',
        text: 'Keep it overloaded and listen to the tone.',
        unlocked: ALL,
        make: (c) => ({ start: { ...THREE, 'mix.osc1': 0.8, 'mix.osc2': 0.8, 'mix.osc3': 0.8, 'mix.feedback': 0.7 }, note: c.note }),
        revealWhen: (s) => s.held,
        hint: 'Hold a key.',
        question: {
          prompt: 'What does driving the filter this hard do to the sound?',
          options: [
            { text: 'It gets thicker and grittier: the filter is overdriven and adds harmonics', correct: true },
            { text: 'Nothing: it just gets louder', feedback: 'Compare with Feedback at 0 and the oscillators at 3. Is it only louder?' },
          ],
          explain: 'Like a guitar amp turned up past its limit, a ladder filter pushed too hard rounds off the tops of the wave, adding harmonics: warmth at first, then grit. The Overload light shows how hard it is being pushed.',
        },
      },
      {
        type: 'goal', title: 'A controlled growl',
        text: 'Find a growl without going all the way: Feedback between 25% and 45%, the three oscillators adding up to no more than 1.6, and Cutoff below 2 kHz. Play.',
        unlocked: ALL,
        make: (c) => ({ start: { ...THREE }, note: c.note }),
        check: (s) => s.patch['mix.feedback'] >= 0.25 && s.patch['mix.feedback'] <= 0.45 && mixSum(s.patch) <= 1.6 && s.patch['filt.cutoff'] <= 2000 && played(s),
        progress: (s) => share(s.patch['mix.feedback'] >= 0.25 && s.patch['mix.feedback'] <= 0.45, mixSum(s.patch) <= 1.6, s.patch['filt.cutoff'] <= 2000),
        hint: 'Feedback around 3.5 on its scale. Oscillators around 5 each. Cutoff below 2 kHz.',
      },
      {
        type: 'question', title: 'Feedback on its own',
        text: 'Turn all three oscillators and the noise down to 0, Feedback fully up, and play.',
        unlocked: ALL,
        make: (c) => ({ start: { ...THREE }, note: c.note }),
        revealWhen: (s) => mixSum(s.patch) < 0.03 && s.patch['mix.noise'] < 0.03 && s.patch['mix.feedback'] >= 0.8 && played(s),
        progress: (s) => share(mixSum(s.patch) < 0.03, s.patch['mix.feedback'] >= 0.8),
        hint: 'Mixer: every oscillator and Noise to 0. Feedback to 10. Then play.',
        question: {
          prompt: 'Why is there no sound?',
          options: [
            { text: 'Feedback only feeds back what is already there: with every source off, there is nothing to feed back', correct: true },
            { text: 'Feedback needs the Decay switch on', feedback: 'The Decay switch only changes how notes end.' },
          ],
          explain: 'Feedback sends the synth\'s own output back into the mixer. It can thicken and overdrive a sound, but it cannot make one from nothing (unless the filter\'s Emphasis is high enough to ring by itself: see the next lesson).',
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'nf3-filter', number: 5, title: 'The Filter as an Instrument',
    summary: 'Turn the Emphasis up until the filter sings on its own, then use Keyboard Control to play it in tune.',
    doneText: 'You made the filter whistle with no oscillators at all, played it in tune with the keyboard, heard half-tracking, and kept a sound\'s tone even across the keyboard.',
    introUnlocked: [], scopes: true,
    challenges: [
      {
        type: 'goal', title: 'Whistle',
        text: 'Turn every oscillator and the noise down to 0, Emphasis fully up, and hold a note: the filter rings on its own.',
        unlocked: ALL,
        make: (c) => ({ start: { 'filt.cutoff': 800 }, note: c.note }),
        check: (s) => mixSum(s.patch) < 0.03 && s.patch['mix.noise'] < 0.03 && s.patch['filt.res'] >= 0.95 && s.held,
        progress: (s) => share(mixSum(s.patch) < 0.03, s.patch['filt.res'] >= 0.95, s.held),
        hint: 'Mixer: all oscillators to 0. Emphasis: fully right. Hold a key and move Cutoff Frequency to change the whistle\'s pitch.',
      },
      {
        type: 'goal', title: 'Play it in tune',
        text: 'Switch both Keyboard Control 1 and Keyboard Control 2 on: the cutoff (and so the whistle) now follows the keyboard. Play notes at least an octave apart.',
        unlocked: ALL,
        make: (c) => ({ start: { 'mix.osc1': 0, 'filt.res': 1, 'filt.cutoff': 400 }, note: c.note }),
        check: (s) => s.patch['filt.kb1'] === 'on' && s.patch['filt.kb2'] === 'on' && s.patch['filt.res'] >= 0.95 && s.highNote - s.lowNote >= 12,
        progress: (s) => share(s.patch['filt.kb1'] === 'on', s.patch['filt.kb2'] === 'on', s.highNote - s.lowNote >= 12),
        hint: 'The Keyboard Control switches are on the dividing line beside the filter. Both on, then play a low and a high C.',
      },
      {
        type: 'question', title: 'Half the tracking',
        text: 'Switch Keyboard Control 2 off, keep 1 on, and play notes an octave apart.',
        unlocked: ALL,
        make: (c) => ({ start: { 'mix.osc1': 0, 'filt.res': 1, 'filt.cutoff': 400, 'filt.kb1': 'on', 'filt.kb2': 'on' }, note: c.note }),
        revealWhen: (s) => s.patch['filt.kb1'] === 'on' && s.patch['filt.kb2'] === 'off' && s.highNote - s.lowNote >= 12,
        hint: 'Keyboard Control 2 off, 1 on. Play two notes an octave apart.',
        question: {
          prompt: 'How did the whistle follow the keyboard now?',
          options: [
            { text: 'Only partly: it rose less than an octave', correct: true },
            { text: 'Exactly an octave, as before', feedback: 'Listen again: is the high whistle really an octave above the low one?' },
          ],
          explain: 'Keyboard Control 1 tracks a third of an octave per octave, Keyboard Control 2 two thirds; both together, a full octave. Partial tracking is useful for sounds: high notes get a little brighter without the filter fully following.',
        },
      },
      {
        type: 'goal', title: 'Even tone',
        text: 'Back to a normal sound: Osc. 1 up in the Mixer, Emphasis below 40%, Cutoff Frequency around 600 Hz (300 Hz to 1 kHz), both Keyboard Controls on. Play notes two octaves apart: high notes are no duller than low ones.',
        unlocked: ALL,
        make: (c) => ({ start: { 'mix.osc1': 0, 'filt.res': 1 }, note: c.note }),
        check: (s) => s.patch['mix.osc1'] >= 0.4 && s.patch['filt.res'] <= 0.4 && s.patch['filt.cutoff'] >= 300 && s.patch['filt.cutoff'] <= 1000 && s.patch['filt.kb1'] === 'on' && s.patch['filt.kb2'] === 'on' && s.highNote - s.lowNote >= 24,
        progress: (s) => share(s.patch['mix.osc1'] >= 0.4, s.patch['filt.res'] <= 0.4, s.patch['filt.cutoff'] >= 300 && s.patch['filt.cutoff'] <= 1000, s.patch['filt.kb1'] === 'on' && s.patch['filt.kb2'] === 'on', s.highNote - s.lowNote >= 24),
        hint: 'Mixer Osc. 1 up; Emphasis down; Cutoff about 600 Hz; both Keyboard Control switches on; play a low C and the C two octaves up.',
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'nf3-recipes', number: 6, title: 'Classic Recipes',
    summary: 'Build four classic NiniFoog sounds from what you have learnt. Each is checked by its ingredients, not exact knob positions, so your version can be your own.',
    doneText: 'You built a three-oscillator bass, a gliding lead, a siren and the wind. These recipes are the starting points for hundreds of classic synth sounds.',
    introUnlocked: [], scopes: true,
    challenges: [
      {
        type: 'goal', title: 'Three-oscillator bass',
        text: 'All three oscillators up and playing notes (Osc. 3 Control on, Range not LO), Oscillator 1 at 16′ or 32′, Cutoff below 600 Hz, Amount of Contour at least 30%. Play a low note.',
        unlocked: ALL,
        make: (c) => ({ start: {}, note: c.note }),
        check: (s) => s.patch['mix.osc1'] >= 0.5 && s.patch['mix.osc2'] >= 0.5 && s.patch['mix.osc3'] >= 0.5 && s.patch['osc3.ctrl'] === 'on' && s.patch['osc3.range'] > -7 && s.patch['osc1.range'] <= -1 && s.patch['filt.cutoff'] <= 600 && s.patch['filt.env'] >= 0.3 && played(s),
        progress: (s) => share(s.patch['mix.osc2'] >= 0.5 && s.patch['mix.osc3'] >= 0.5, s.patch['osc3.ctrl'] === 'on' && s.patch['osc3.range'] > -7, s.patch['osc1.range'] <= -1, s.patch['filt.cutoff'] <= 600, s.patch['filt.env'] >= 0.3),
        hint: 'Lesson 1 for the oscillators, Lesson 3 for the filter contour. Try Oscillator 2 slightly detuned for extra thickness.',
      },
      {
        type: 'goal', title: 'Gliding lead',
        text: 'Glide switch on with a Glide time between 0.05 and 0.4 s, Oscillator 2 up and very slightly detuned (Frequency between ±0.03 and ±0.3), Cutoff above 1.5 kHz. Play notes at least five semitones apart.',
        unlocked: ALL,
        make: (c) => ({ start: {}, note: c.note }),
        check: (s) => s.patch['perf.glideon'] === 'on' && s.patch['ctrl.glide'] >= 0.05 && s.patch['ctrl.glide'] <= 0.4 && s.patch['mix.osc2'] >= 0.4 && Math.abs(s.patch['osc2.freq']) >= 0.03 && Math.abs(s.patch['osc2.freq']) <= 0.3 && s.patch['filt.cutoff'] >= 1500 && s.highNote - s.lowNote >= 5,
        progress: (s) => share(s.patch['perf.glideon'] === 'on', s.patch['ctrl.glide'] >= 0.05 && s.patch['ctrl.glide'] <= 0.4, s.patch['mix.osc2'] >= 0.4, Math.abs(s.patch['osc2.freq']) >= 0.03 && Math.abs(s.patch['osc2.freq']) <= 0.3, s.highNote - s.lowNote >= 5),
        hint: 'The Glide switch is left of the keys; the Glide time knob is in Controllers.',
      },
      {
        type: 'goal', title: 'Siren',
        text: 'Oscillator 3 as a very slow triangle (1 Hz or less) on the pitch, with the mod wheel fully up. Hold a note.',
        unlocked: ALL,
        make: (c) => ({ start: {}, note: c.note }),
        check: (s) => s.patch['osc3.range'] === -7 && s.patch['osc3.ctrl'] === 'off' && s.patch['osc.mod'] === 'on' && s.patch['osc3.wave'] === 'tri' && lfoHz(s.patch['osc3.freq']) <= 1 && s.patch['perf.mod'] >= 0.8 && s.held,
        progress: (s) => share(s.patch['osc.mod'] === 'on', lfoHz(s.patch['osc3.freq']) <= 1, s.patch['perf.mod'] >= 0.8, s.held),
        hint: 'Init already has Oscillator 3 as an LFO on the pitch. Slow its Frequency down to under 1 Hz and push the mod wheel all the way up.',
      },
      {
        type: 'goal', title: 'Wind',
        text: 'No oscillators: pink noise (Noise up past 70%, switch on Pink) through the filter with Emphasis at least 60%, Filter Modulation on with the mod wheel at least halfway, and a slow Attack (0.5 s or more). Hold a note.',
        unlocked: ALL,
        make: (c) => ({ start: {}, note: c.note }),
        check: (s) => mixSum(s.patch) < 0.05 && s.patch['mix.noise'] >= 0.7 && s.patch['mix.noisetype'] === 'pink' && s.patch['filt.res'] >= 0.6 && s.patch['filt.mod'] === 'on' && s.patch['perf.mod'] >= 0.5 && s.patch['aenv.a'] >= 0.5 && s.held,
        progress: (s) => share(mixSum(s.patch) < 0.05, s.patch['mix.noise'] >= 0.7 && s.patch['mix.noisetype'] === 'pink', s.patch['filt.res'] >= 0.6, s.patch['filt.mod'] === 'on' && s.patch['perf.mod'] >= 0.5, s.patch['aenv.a'] >= 0.5),
        hint: 'Mixer: oscillators to 0, Noise up, switch to Pink. Emphasis up. Filter Modulation on, mod wheel up. Loudness Contour Attack slow. Try Modulation Mix towards Noise for gusts.',
      },
    ],
  },
];
