// Lesson definitions. Each lesson has 10 challenges, of three types:
//   match     (default) hear a target sound and match it by ear, with the scopes as a guide
//   goal      do something (e.g. "make it darker"); the result is checked, not knob positions
//   question  try something, then pick the right answer from a short list
//
// A challenge:
//   title, text     what the student is asked to do
//   unlocked        section ids the student may use (everything else is greyed out)
//   start           patch values the student starts from (on top of Init)
//   compare         params that must match the target
//   showKey         mark the target key on the keyboard (so the challenge is about the synth)
//   make(ctx)       match: returns { patch, note }, the target. goal/question: returns
//                   { start, note }, the starting sound. ctx helps with random choices:
//                   ctx.pick(list), ctx.pickDistinct(list, n), ctx.level(lo, hi),
//                   ctx.note (the lesson's key), ctx.newNote() (a new random key)
//   check(s)        goal: true when done. s = { patch, note (last played), held, f0 }
//   progress(s)     goal (optional): 0..1 for the Hotter/Colder bar
//   question        { prompt?, options: [{ text, correct, feedback }], explain, hint? }
//   revealWhen(s)   question (optional): the question appears only once this is true
//                   (the student must try it first); before that, hint/progress work like a goal
//   hint            text shown by the Hint button (goal/question; match uses the bar)
//
// Matching is by sound (see soundMatches): each oscillator's sounding pitch (key + Range)
// and waveform must match; Detune within DETUNE_TOLERANCE cents (either sign, since +7
// and -7 beat at the same speed and sound alike); smooth controls (levels, Cutoff,
// Resonance) within KNOB_TOLERANCE of the knob's travel.

import { PARAMS, toNorm } from './params.js';

export const DETUNE_TOLERANCE = 3;
export const KNOB_TOLERANCE = 0.10; // ±10% of a knob's travel

const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
const oct = (a, b) => Math.abs(Math.log2(a / b)); // distance in octaves

const WAVES = ['sine', 'tri', 'saw', 'square', 'pulse', 'narrow'];
const NOT_SAW = WAVES.filter((w) => w !== 'saw');
const RANGES = [-2, -1, 1, 2]; // non-zero octave shifts

const OSC1 = ['osc1.range', 'osc1.wave'];
const BOTH = ['osc1.range', 'osc1.wave', 'osc2.range', 'osc2.wave', 'osc2.fine'];
// From challenge 6 Oscillator 2 is heard at the same level as Oscillator 1.
const EQUAL_MIX = { 'mix.osc1': 0.8, 'mix.osc2': 0.8 };
// Lesson 2 onwards: the whole oscillator section and the mixer
const MIXER = ['osc1.range', 'osc1.wave', 'osc2.range', 'osc2.wave', 'osc2.fine', 'mix.osc1', 'mix.osc2'];
const FILTER_UNLOCKED = ['osc1', 'osc2', 'mix', 'filt'];

export const LESSONS = [
  {
    id: 'osc',
    number: 1,
    title: 'Oscillators',
    summary: 'Pitch, octave range and waveform: the raw ingredients of every synth sound.',
    doneText: 'You matched all 10 sounds by ear. You now know how pitch, octave range, waveform and detuning shape the raw sound of an oscillator.',
    challenges: [
      {
        title: 'Find the note',
        text: 'Listen to the target, then find the key that plays the same note. Watch the scope: the same note fits the same number of waves across the screen.',
        unlocked: ['osc1'], start: {}, compare: OSC1,
        make: (c) => ({ patch: {}, note: c.newNote() }),
      },
      {
        title: 'Up or down an octave',
        text: 'From now on, play the key marked with an amber dot. The oscillator has moved up or down: use Range to match it. Each octave doubles or halves the number of waves on the scope.',
        unlocked: ['osc1'], start: {}, compare: OSC1, showKey: true,
        make: (c) => ({ patch: { 'osc1.range': c.pick(RANGES) }, note: c.note }),
      },
      {
        title: 'Find the waveform',
        text: 'Listen to the tone colour. Turn Waveform until the shape on the scope and the harmonics on the spectrum match.',
        unlocked: ['osc1'], start: {}, compare: OSC1, showKey: true,
        make: (c) => ({ patch: { 'osc1.wave': c.pick(NOT_SAW) }, note: c.note }),
      },
      {
        title: 'Waveform and range',
        text: 'The octave and the waveform have both changed. Listen for the octave first, then the tone colour.',
        unlocked: ['osc1'], start: {}, compare: OSC1, showKey: true,
        make: (c) => ({ patch: { 'osc1.wave': c.pick(NOT_SAW), 'osc1.range': c.pick(RANGES) }, note: c.note }),
      },
      {
        title: 'All three again',
        text: 'One more on a single oscillator: match the range and the waveform.',
        unlocked: ['osc1'], start: {}, compare: OSC1, showKey: true,
        make: (c) => ({ patch: { 'osc1.wave': c.pick(NOT_SAW), 'osc1.range': c.pick(RANGES) }, note: c.note }),
      },
      {
        title: 'Two oscillators',
        text: 'Oscillator 2 is now switched on, at the same level as Oscillator 1. Both are playing the same waveform: find it, and set both oscillators to it.',
        unlocked: ['osc1', 'osc2'], start: EQUAL_MIX, compare: BOTH, showKey: true,
        make: (c) => { const w = c.pick(NOT_SAW); return { patch: { ...EQUAL_MIX, 'osc1.wave': w, 'osc2.wave': w }, note: c.note }; },
      },
      {
        title: 'An octave apart',
        text: 'Both oscillators share a waveform, but one of them has moved octave. Work out which one, and how far.',
        unlocked: ['osc1', 'osc2'], start: EQUAL_MIX, compare: BOTH, showKey: true,
        make: (c) => {
          const w = c.pick(WAVES);
          const osc = c.pick([1, 2]);
          return { patch: { ...EQUAL_MIX, 'osc1.wave': w, 'osc2.wave': w, [`osc${osc}.range`]: c.pick(RANGES) }, note: c.note };
        },
      },
      {
        title: 'Two shapes',
        text: 'Each oscillator is playing a different waveform. Their harmonics add together on the spectrum. Find both shapes.',
        unlocked: ['osc1', 'osc2'], start: EQUAL_MIX, compare: BOTH, showKey: true,
        make: (c) => {
          const [w1, w2] = c.pickDistinct(WAVES, 2);
          return { patch: { ...EQUAL_MIX, 'osc1.wave': w1, 'osc2.wave': w2 }, note: c.note };
        },
      },
      {
        title: 'Shapes and octaves',
        text: 'Different waveforms and different ranges on each oscillator.',
        unlocked: ['osc1', 'osc2'], start: EQUAL_MIX, compare: BOTH, showKey: true,
        make: (c) => {
          const [w1, w2] = c.pickDistinct(WAVES, 2);
          const [r1, r2] = c.pickDistinct([-2, -1, 0, 1, 2], 2);
          return { patch: { ...EQUAL_MIX, 'osc1.wave': w1, 'osc2.wave': w2, 'osc1.range': r1, 'osc2.range': r2 }, note: c.note };
        },
      },
      {
        title: 'Detune',
        text: 'The two oscillators are slightly out of tune with each other, so the sound pulses (beats). Match the waveforms and ranges, then use Detune and the Beat light to match the speed of the pulsing.',
        unlocked: ['osc1', 'osc2'], start: EQUAL_MIX, compare: BOTH, showKey: true,
        make: (c) => {
          const r = c.pick([-1, 0, 0, 1]);
          const cents = (c.pick([1, -1])) * (4 + Math.floor(Math.random() * 18)); // 4 to 21 cents
          return { patch: { ...EQUAL_MIX, 'osc1.wave': c.pick(WAVES), 'osc2.wave': c.pick(WAVES), 'osc1.range': r, 'osc2.range': r, 'osc2.fine': cents }, note: c.note };
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'mix',
    number: 2,
    title: 'Mixer',
    summary: 'Blending oscillators: levels, layering octaves, and how balance changes the sound.',
    doneText: 'You matched all 10 blends. You now know how the Mixer chooses and balances sources, how octaves layer, and how level affects beating.',
    challenges: [
      {
        title: 'Turn it down',
        text: 'Same note, same waveform, but quieter. Use the Osc 1 level in the Mixer. Watch the height of the wave on the scope.',
        unlocked: ['osc1', 'osc2', 'mix'], start: {}, compare: MIXER, showKey: true,
        make: (c) => ({ patch: { 'mix.osc1': c.level(0.2, 0.5) }, note: c.note }),
      },
      {
        title: 'Swap sources',
        text: 'Only Oscillator 2 is playing now, with a different waveform. Turn Osc 1 down, Osc 2 up, and find its waveform.',
        unlocked: ['osc1', 'osc2', 'mix'], start: {}, compare: MIXER, showKey: true,
        make: (c) => ({ patch: { 'mix.osc1': 0, 'mix.osc2': 0.8, 'osc2.wave': c.pick(NOT_SAW) }, note: c.note }),
      },
      {
        title: 'Equal blend',
        text: 'Both oscillators at the same level, each with a different waveform. The two waves add together into a new shape.',
        unlocked: ['osc1', 'osc2', 'mix'], start: {}, compare: MIXER, showKey: true,
        make: (c) => {
          const [w1, w2] = c.pickDistinct(WAVES, 2);
          const lvl = c.level(0.5, 0.9);
          return { patch: { 'osc1.wave': w1, 'osc2.wave': w2, 'mix.osc1': lvl, 'mix.osc2': lvl }, note: c.note };
        },
      },
      {
        title: 'A touch of colour',
        text: 'Oscillator 2 is mixed in quietly underneath Oscillator 1, just adding flavour. Find its waveform and how little of it there is.',
        unlocked: ['osc1', 'osc2', 'mix'], start: {}, compare: MIXER, showKey: true,
        make: (c) => ({ patch: { 'osc2.wave': c.pick(NOT_SAW), 'mix.osc2': c.level(0.15, 0.35) }, note: c.note }),
      },
      {
        title: 'Weight underneath',
        text: 'Oscillator 2 is an octave below, at a lower level, giving the sound weight. This is a classic way to fatten a bass.',
        unlocked: ['osc1', 'osc2', 'mix'], start: {}, compare: MIXER, showKey: true,
        make: (c) => ({ patch: { 'osc2.range': -1, 'osc2.wave': c.pick(WAVES), 'mix.osc2': c.level(0.3, 0.6) }, note: c.note }),
      },
      {
        title: 'Sparkle on top',
        text: 'Oscillator 2 is an octave above, mixed in quietly. A little upper octave adds brightness, like an organ stop.',
        unlocked: ['osc1', 'osc2', 'mix'], start: {}, compare: MIXER, showKey: true,
        make: (c) => ({ patch: { 'osc2.range': 1, 'osc2.wave': c.pick(WAVES), 'mix.osc2': c.level(0.15, 0.35) }, note: c.note }),
      },
      {
        title: 'Deepest beating',
        text: 'The two oscillators are slightly detuned. Match the Detune, and both levels: the beating is strongest when the levels are equal and fades as one gets quieter.',
        unlocked: ['osc1', 'osc2', 'mix'], start: {}, compare: MIXER, showKey: true,
        make: (c) => {
          const lvl = c.level(0.5, 0.9);
          return { patch: { 'osc2.fine': c.pick([1, -1]) * (5 + Math.floor(Math.random() * 12)), 'mix.osc1': lvl, 'mix.osc2': lvl }, note: c.note };
        },
      },
      {
        title: 'New key, new blend',
        text: 'A new key this time: find the note, both waveforms and both levels.',
        unlocked: ['osc1', 'osc2', 'mix'], start: {}, compare: MIXER,
        make: (c) => {
          const [w1, w2] = c.pickDistinct(WAVES, 2);
          return { patch: { 'osc1.wave': w1, 'osc2.wave': w2, 'mix.osc1': c.level(0.3, 0.9), 'mix.osc2': c.level(0.2, 0.9) }, note: c.newNote() };
        },
      },
      {
        title: 'Octaves in the mix',
        text: 'A new key again. The oscillators sit in different octaves at different levels.',
        unlocked: ['osc1', 'osc2', 'mix'], start: {}, compare: MIXER,
        make: (c) => {
          const [r1, r2] = c.pickDistinct([-1, 0, 1], 2);
          return { patch: { 'osc1.range': r1, 'osc2.range': r2, 'mix.osc1': c.level(0.3, 0.9), 'mix.osc2': c.level(0.2, 0.9) }, note: c.newNote() };
        },
      },
      {
        title: 'The full oscillator section',
        text: 'Everything from Lessons 1 and 2: key, waveforms, octaves, levels and detune.',
        unlocked: ['osc1', 'osc2', 'mix'], start: {}, compare: MIXER,
        make: (c) => {
          const [w1, w2] = c.pickDistinct(WAVES, 2);
          const r = c.pick([-1, 0, 0, 1]);
          return { patch: { 'osc1.wave': w1, 'osc2.wave': w2, 'osc1.range': r, 'osc2.range': c.pick([r, r - 1, r + 1].filter((x) => x >= -2 && x <= 2)),
            'mix.osc1': c.level(0.4, 0.9), 'mix.osc2': c.level(0.3, 0.9), 'osc2.fine': c.pick([1, -1]) * (4 + Math.floor(Math.random() * 14)) }, note: c.newNote() };
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'filt',
    number: 3,
    title: 'Filter',
    summary: 'What a low-pass filter really does: removing harmonics, and what resonance adds. Some challenges ask you to do something, some ask a question.',
    doneText: 'You finished the Filter lesson. You now know that a filter removes harmonics (so it cannot change a sine wave), how cutoff and resonance work, and that a resonant filter can become a sound source itself.',
    challenges: [
      {
        type: 'goal', title: 'Make it darker',
        text: 'This sawtooth is bright: the filter is wide open. Hold a note and make it darker by sweeping the Cutoff down at least two octaves. Watch the harmonics disappear from the right of the spectrum.',
        unlocked: FILTER_UNLOCKED, showKey: true,
        make: (c) => ({ start: { 'osc1.wave': 'saw' }, note: c.note }),
        check: (s) => s.note != null && s.patch['filt.cutoff'] <= 5000 && s.patch['filt.cutoff'] >= s.f0,
        progress: (s) => Math.min(1, Math.log2(20000 / s.patch['filt.cutoff']) / 2),
        hint: 'Hold a note and turn Cutoff down slowly, past 5 kHz. Keep it above the note itself, or you will filter the note away entirely.',
      },
      {
        type: 'question', title: 'Filter a sine wave',
        text: 'Oscillator 1 is now a sine wave. Hold a note and try to make it darker.',
        unlocked: FILTER_UNLOCKED, showKey: true,
        make: (c) => ({ start: { 'osc1.wave': 'sine' }, note: c.note }),
        // the question appears only once the student has tried it: Cutoff down at least 3 octaves, with a note played
        revealWhen: (s) => s.note != null && s.patch['filt.cutoff'] <= 2500,
        progress: (s) => Math.min(1, Math.log2(20000 / s.patch['filt.cutoff']) / 3),
        hint: 'Hold a note and keep turning the Cutoff down, past 2.5 kHz, while you listen to the tone.',
        question: {
          prompt: 'Turning the Cutoff down did not change the timbre (tone colour) of the sine wave. Why?',
          options: [
            { text: 'Because a sine wave has no harmonics for the filter to remove', correct: true },
            { text: 'Because the Cutoff was not turned down far enough', feedback: 'You turned it down a long way: a sawtooth would have changed completely. Look at how many peaks a sine wave has on the spectrum.' },
          ],
          explain: 'A low-pass filter changes the tone by removing harmonics above the cutoff. A sine wave is only the fundamental, with no harmonics at all, so there is nothing to remove: the timbre stays the same, and once the cutoff goes below the note it simply gets quieter.',
          hint: 'Look at the spectrum: a sawtooth shows a long row of peaks, a sine wave shows just one.',
        },
      },
      {
        type: 'goal', title: 'Only the fundamental',
        text: 'Back to a sawtooth. Filter it until only the fundamental (the lowest peak) is left: the cutoff must sit between the fundamental and the 2nd harmonic. Notice it now sounds almost like a sine wave.',
        unlocked: FILTER_UNLOCKED, showKey: true,
        make: (c) => ({ start: { 'osc1.wave': 'saw' }, note: c.note }),
        check: (s) => s.note != null && s.patch['filt.cutoff'] >= 0.9 * s.f0 && s.patch['filt.cutoff'] <= 1.8 * s.f0,
        progress: (s) => (s.f0 ? Math.max(0, 1 - oct(s.patch['filt.cutoff'], 1.3 * s.f0) / 5) : 0),
        hint: 'The fundamental is the leftmost peak on the spectrum. Bring the Cutoff down until the dashed CUTOFF line sits just to the right of it, before the second peak.',
      },
      {
        type: 'goal', title: 'Brighter again',
        text: 'The filter starts almost closed. Open it until at least the first 8 harmonics are back.',
        unlocked: FILTER_UNLOCKED, showKey: true,
        make: (c) => ({ start: { 'osc1.wave': 'saw', 'filt.cutoff': Math.round(hz(c.note) * 1.2) }, note: c.note }),
        check: (s) => s.note != null && s.patch['filt.cutoff'] >= 8 * s.f0,
        progress: (s) => (s.f0 ? Math.min(1, Math.max(0, Math.log2(s.patch['filt.cutoff'] / s.f0) / 3)) : 0),
        hint: 'Count the peaks on the spectrum as you turn the Cutoff up: you need at least eight to the left of the CUTOFF line.',
      },
      {
        type: 'goal', title: 'Make a harmonic sing',
        text: 'Put the cutoff on the 4th harmonic (two octaves above the note) and turn Resonance up to at least 60%, so that harmonic jumps out.',
        unlocked: FILTER_UNLOCKED, showKey: true,
        make: (c) => ({ start: { 'osc1.wave': 'saw' }, note: c.note }),
        check: (s) => s.note != null && oct(s.patch['filt.cutoff'], 4 * s.f0) <= 0.25 && s.patch['filt.res'] >= 0.6,
        progress: (s) => (s.f0 ? Math.max(0, 1 - oct(s.patch['filt.cutoff'], 4 * s.f0) / 4) * 0.7 + Math.min(1, s.patch['filt.res'] / 0.6) * 0.3 : 0),
        hint: 'Set Resonance to about 70% first. Then move the Cutoff until the 4th peak from the left on the spectrum is the tallest.',
      },
      {
        type: 'question', title: 'High and low notes',
        text: 'The cutoff is fixed. Play a low note, then a high note, without moving the filter. Which loses more of its brightness?',
        unlocked: FILTER_UNLOCKED,
        make: (c) => ({ start: { 'osc1.wave': 'saw', 'filt.cutoff': 600 }, note: c.note }),
        question: {
          options: [
            { text: 'The high note: fewer of its harmonics are below the cutoff', correct: true },
            { text: 'The low note: low notes always sound darker', feedback: 'Count the peaks to the left of the CUTOFF line for each note.' },
            { text: 'Both lose the same amount', feedback: 'Play them one after the other and compare the spectrum.' },
          ],
          explain: 'A high note\'s harmonics start higher and are spread further apart, so a fixed cutoff removes more of them. That is why some synths let the cutoff follow the keyboard (the NiniFoog\'s Keyboard Control switches).',
        },
        hint: 'Watch the spectrum for each note: count how many peaks sit to the left of the CUTOFF line.',
      },
      {
        type: 'goal', title: 'A filter that plays itself',
        text: 'Make a sound with both oscillators turned off. Turn both Mixer levels to 0, turn Resonance all the way up, and hold a note: the filter itself starts to whistle.',
        unlocked: FILTER_UNLOCKED, showKey: true,
        make: (c) => ({ start: { 'osc1.wave': 'saw', 'filt.cutoff': 1000 }, note: c.note }),
        check: (s) => s.held && s.patch['mix.osc1'] < 0.02 && s.patch['mix.osc2'] < 0.02 && s.patch['filt.res'] >= 0.97,
        progress: (s) => ((1 - s.patch['mix.osc1']) + (1 - s.patch['mix.osc2']) + Math.min(1, s.patch['filt.res'] / 0.97)) / 3,
        hint: 'Mixer: Osc 1 and Osc 2 both to 0. Resonance: all the way up. Then hold a key and listen. Move the Cutoff to change the whistle\'s pitch.',
      },
      {
        type: 'question', title: 'Resonance and bass',
        text: 'Hold a low note and slowly turn Resonance up. Listen to the low end of the sound. What happens?',
        unlocked: FILTER_UNLOCKED,
        make: (c) => ({ start: { 'osc1.wave': 'saw', 'osc1.range': -1, 'filt.cutoff': 400 }, note: c.note }),
        question: {
          options: [
            { text: 'The bass gets thinner as the peak at the cutoff gets louder', correct: true },
            { text: 'The bass gets louder', feedback: 'Watch the leftmost peaks on the spectrum as Resonance rises.' },
            { text: 'Nothing happens to the bass', feedback: 'Listen again with Resonance at 0, then at maximum.' },
          ],
          explain: 'In a ladder filter like this one, resonance works by feeding the output back against the input, which also cancels some of the low frequencies. More resonance: a stronger peak, but less bass.',
        },
        hint: 'Watch the leftmost peaks on the spectrum while Resonance goes from 0 to the top.',
      },
      {
        title: 'Match a filtered sound',
        text: 'Listen to the target and match its Cutoff and Resonance. The oscillator is already set.',
        unlocked: FILTER_UNLOCKED, start: { 'osc1.wave': 'saw' }, compare: [...MIXER, 'filt.cutoff', 'filt.res'], showKey: true,
        make: (c) => ({ patch: { 'osc1.wave': 'saw', 'filt.cutoff': Math.round(200 * Math.pow(20, Math.random())), 'filt.res': c.level(0.1, 0.8) }, note: c.note }),
      },
      {
        title: 'The full patch',
        text: 'Everything so far: key, oscillators, mix, Cutoff and Resonance.',
        unlocked: FILTER_UNLOCKED, start: {}, compare: [...MIXER, 'filt.cutoff', 'filt.res'],
        make: (c) => {
          const [w1, w2] = c.pickDistinct(['tri', 'saw', 'square', 'pulse'], 2);
          return { patch: { 'osc1.wave': w1, 'osc2.wave': w2, 'osc2.range': c.pick([-1, 0, 1]), 'mix.osc1': c.level(0.5, 0.9), 'mix.osc2': c.level(0.3, 0.8),
            'filt.cutoff': Math.round(250 * Math.pow(16, Math.random())), 'filt.res': c.level(0.1, 0.7) }, note: c.newNote() };
        },
      },
    ],
  },
];

// One control: does the student's value match the target's?
function controlMatches(id, player, playerNote, target, targetNote) {
  const m = /^osc([12])\.range$/.exec(id);
  if (m) return playerNote + 12 * player[id] === targetNote + 12 * target[id];
  if (id === 'osc2.fine') return Math.abs(Math.abs(player[id]) - Math.abs(target[id])) <= DETUNE_TOLERANCE;
  if (PARAMS[id] && PARAMS[id].type === 'cont') return Math.abs(toNorm(id, player[id]) - toNorm(id, target[id])) <= KNOB_TOLERANCE;
  return player[id] === target[id];
}

// Only what can be heard counts: if the target has an oscillator turned down to 0 in the
// Mixer, that oscillator's waveform, octave and detune are ignored (its level still counts).
function audible(target, compare) {
  const silent = (n) => target[`mix.osc${n}`] !== undefined && target[`mix.osc${n}`] < 0.01;
  return compare.filter((id) => {
    if (silent(1) && /^osc1\.(wave|range)$/.test(id)) return false;
    if (silent(2) && /^osc2\.(wave|range|fine)$/.test(id)) return false;
    return true;
  });
}

// Does the student's sound match the target? Compared by what is heard, not by knob
// positions: the pitch each oscillator sounds is the key played plus its Range in octaves,
// so F#3 with Range +1 matches F#4 with Range 0 (they sound identical).
// The two oscillators are interchangeable: square on Osc 1 with sine on Osc 2 sounds the
// same as the reverse (with their levels swapped too). Detune only describes how far apart
// they are, so it stays as it is.
function swapOscillators(p) {
  const s = { ...p };
  for (const k of ['wave', 'range']) { s[`osc1.${k}`] = p[`osc2.${k}`]; s[`osc2.${k}`] = p[`osc1.${k}`]; }
  s['mix.osc1'] = p['mix.osc2']; s['mix.osc2'] = p['mix.osc1'];
  return s;
}
// both oscillators are being matched (not just Oscillator 1)
const bothOscillators = (compare) => compare.includes('osc1.wave') && compare.includes('osc2.wave');

function matchesAsIs(player, playerNote, target, targetNote, compareAll) {
  const compare = audible(target, compareAll);
  return compare.every((id) => controlMatches(id, player, playerNote, target, targetNote))
    && (compare.some((id) => id.endsWith('.range')) || playerNote === targetNote);
}

export function soundMatches(player, playerNote, target, targetNote, compare) {
  return matchesAsIs(player, playerNote, target, targetNote, compare)
    || (bothOscillators(compare) && matchesAsIs(swapOscillators(player), playerNote, target, targetNote, compare));
}

// Knob-for-knob comparison (used to make sure a new target differs from the start).
export function patchMatches(player, target, compare) {
  return compare.every((id) => controlMatches(id, player, 0, target, 0));
}

// How close is the student? 0 (cold) .. 1 (hot), for the Hotter/Colder hint bar.
// Stepped controls count as right or wrong; smooth ones count by how far off they are.
export function closeness(player, playerNote, target, targetNote, compareAll) {
  if (playerNote == null) return 0;
  const asIs = closenessAsIs(player, playerNote, target, targetNote, compareAll);
  if (!bothOscillators(compareAll)) return asIs;
  return Math.max(asIs, closenessAsIs(swapOscillators(player), playerNote, target, targetNote, compareAll));
}

function closenessAsIs(player, playerNote, target, targetNote, compareAll) {
  const compare = audible(target, compareAll);
  const scores = compare.map((id) => {
    if (controlMatches(id, player, playerNote, target, targetNote)) return 1;
    if (id === 'osc2.fine') return Math.max(0, 1 - Math.abs(Math.abs(player[id]) - Math.abs(target[id])) / 25);
    if (PARAMS[id] && PARAMS[id].type === 'cont') return Math.max(0, 1 - Math.abs(toNorm(id, player[id]) - toNorm(id, target[id])) / 0.6);
    return 0;
  });
  if (!compare.some((id) => id.endsWith('.range'))) scores.push(playerNote === targetNote ? 1 : 0);
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// The frequency of Oscillator 1's note (for goals about harmonics)
export function osc1Hz(patch, note) { return note == null ? 0 : hz(note + 12 * patch['osc1.range']); }
