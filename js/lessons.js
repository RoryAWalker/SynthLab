// Lesson definitions. Each lesson has 10 challenges; each challenge makes a target
// (a patch plus a note) for the student to match by ear, with the scopes as a guide.
//
// A challenge:
//   title, text     what the student is asked to do
//   unlocked        section ids the student may use (everything else is greyed out)
//   start           patch values the student starts from (on top of Init)
//   compare         params that must match the target
//   make(ctx)       returns { patch, note }: the target. ctx helps with random choices:
//                   ctx.pick(list), ctx.pickDistinct(list, n), ctx.newNote() (a random key
//                   in the lowest octave shown on the keyboard, different from the last one)
//
// Matching is by sound (see soundMatches): each oscillator's sounding pitch (key + Range)
// and waveform must match; Detune within DETUNE_TOLERANCE cents (either sign, since +7
// and -7 beat at the same speed and sound alike).

export const DETUNE_TOLERANCE = 3;

const WAVES = ['sine', 'tri', 'saw', 'square', 'pulse', 'narrow'];
const NOT_SAW = WAVES.filter((w) => w !== 'saw');
const RANGES = [-2, -1, 1, 2]; // non-zero octave shifts

const OSC1 = ['osc1.range', 'osc1.wave'];
const BOTH = ['osc1.range', 'osc1.wave', 'osc2.range', 'osc2.wave', 'osc2.fine'];
// From challenge 6 Oscillator 2 is heard at the same level as Oscillator 1.
const EQUAL_MIX = { 'mix.osc1': 0.8, 'mix.osc2': 0.8 };

export const LESSONS = [
  {
    id: 'osc',
    number: 1,
    title: 'Oscillators',
    summary: 'Pitch, octave range and waveform: the raw ingredients of every synth sound.',
    challenges: [
      {
        title: 'Find the note',
        text: 'Listen to the target, then find the key that plays the same note. Watch the scope: the same note fits the same number of waves across the screen.',
        unlocked: ['osc1'], start: {}, compare: OSC1,
        make: (c) => ({ patch: {}, note: c.newNote() }),
      },
      {
        title: 'Up or down an octave',
        text: 'Find the key, then notice the oscillator has moved up or down. Use Range to match it. Each octave doubles or halves the number of waves on the scope.',
        unlocked: ['osc1'], start: {}, compare: OSC1,
        make: (c) => ({ patch: { 'osc1.range': c.pick(RANGES) }, note: c.newNote() }),
      },
      {
        title: 'Find the waveform',
        text: 'Find the key, then listen to the tone colour. Turn Waveform until the shape on the scope and the harmonics on the spectrum match.',
        unlocked: ['osc1'], start: {}, compare: OSC1,
        make: (c) => ({ patch: { 'osc1.wave': c.pick(NOT_SAW) }, note: c.newNote() }),
      },
      {
        title: 'Waveform and range',
        text: 'The key, the octave and the waveform have all changed. Find the key first, then the octave, then the tone colour.',
        unlocked: ['osc1'], start: {}, compare: OSC1,
        make: (c) => ({ patch: { 'osc1.wave': c.pick(NOT_SAW), 'osc1.range': c.pick(RANGES) }, note: c.newNote() }),
      },
      {
        title: 'All three again',
        text: 'One more on a single oscillator: find the key, the range and the waveform.',
        unlocked: ['osc1'], start: {}, compare: OSC1,
        make: (c) => ({ patch: { 'osc1.wave': c.pick(NOT_SAW), 'osc1.range': c.pick(RANGES) }, note: c.newNote() }),
      },
      {
        title: 'Two oscillators',
        text: 'Oscillator 2 is now switched on, at the same level as Oscillator 1. Both are playing the same waveform: find it, and set both oscillators to it.',
        unlocked: ['osc1', 'osc2'], start: EQUAL_MIX, compare: BOTH,
        make: (c) => { const w = c.pick(NOT_SAW); return { patch: { ...EQUAL_MIX, 'osc1.wave': w, 'osc2.wave': w }, note: c.newNote() }; },
      },
      {
        title: 'An octave apart',
        text: 'Both oscillators share a waveform, but one of them has moved octave. Work out which one, and how far.',
        unlocked: ['osc1', 'osc2'], start: EQUAL_MIX, compare: BOTH,
        make: (c) => {
          const w = c.pick(WAVES);
          const osc = c.pick([1, 2]);
          return { patch: { ...EQUAL_MIX, 'osc1.wave': w, 'osc2.wave': w, [`osc${osc}.range`]: c.pick(RANGES) }, note: c.newNote() };
        },
      },
      {
        title: 'Two shapes',
        text: 'Each oscillator is playing a different waveform. Their harmonics add together on the spectrum. Find both shapes.',
        unlocked: ['osc1', 'osc2'], start: EQUAL_MIX, compare: BOTH,
        make: (c) => {
          const [w1, w2] = c.pickDistinct(WAVES, 2);
          return { patch: { ...EQUAL_MIX, 'osc1.wave': w1, 'osc2.wave': w2 }, note: c.newNote() };
        },
      },
      {
        title: 'Shapes and octaves',
        text: 'Different waveforms and different ranges on each oscillator.',
        unlocked: ['osc1', 'osc2'], start: EQUAL_MIX, compare: BOTH,
        make: (c) => {
          const [w1, w2] = c.pickDistinct(WAVES, 2);
          const [r1, r2] = c.pickDistinct([-2, -1, 0, 1, 2], 2);
          return { patch: { ...EQUAL_MIX, 'osc1.wave': w1, 'osc2.wave': w2, 'osc1.range': r1, 'osc2.range': r2 }, note: c.newNote() };
        },
      },
      {
        title: 'Detune',
        text: 'The two oscillators are slightly out of tune with each other, so the sound pulses (beats). Match the waveforms and ranges, then use Detune and the Beat light to match the speed of the pulsing.',
        unlocked: ['osc1', 'osc2'], start: EQUAL_MIX, compare: BOTH,
        make: (c) => {
          const r = c.pick([-1, 0, 0, 1]);
          const cents = (c.pick([1, -1])) * (4 + Math.floor(Math.random() * 18)); // 4 to 21 cents
          return { patch: { ...EQUAL_MIX, 'osc1.wave': c.pick(WAVES), 'osc2.wave': c.pick(WAVES), 'osc1.range': r, 'osc2.range': r, 'osc2.fine': cents }, note: c.newNote() };
        },
      },
    ],
  },
];

// Does the student's sound match the target? Compared by what is heard, not by knob
// positions: the pitch each oscillator sounds is the key played plus its Range in octaves,
// so F#3 with Range +1 matches F#4 with Range 0 (they sound identical).
export function soundMatches(player, playerNote, target, targetNote, compare) {
  return compare.every((id) => {
    const m = /^osc([12])\.range$/.exec(id);
    if (m) return playerNote + 12 * player[id] === targetNote + 12 * target[id];
    if (id === 'osc2.fine') return Math.abs(Math.abs(player[id]) - Math.abs(target[id])) <= DETUNE_TOLERANCE;
    return player[id] === target[id];
  }) && (compare.some((id) => id.endsWith('.range')) || playerNote === targetNote);
}

// Knob-for-knob comparison (used to make sure a new target differs from the start).
export function patchMatches(player, target, compare) {
  return compare.every((id) => {
    if (id === 'osc2.fine') return Math.abs(Math.abs(player[id]) - Math.abs(target[id])) <= DETUNE_TOLERANCE;
    return player[id] === target[id];
  });
}
