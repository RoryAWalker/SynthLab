// NiniFoog (internal id nf3): a three-oscillator monosynth whose controls
// and panel layout follow the classic 1970s three-oscillator design. Oscillator 3 can
// leave the keyboard and run slowly, becoming the modulation source, blended with noise
// by Modulation Mix and applied with the modulation wheel. All names and artwork are our own.

import { fmtHz, fmtTime, fmtPct, fmtOct, TIME_MARKS } from './nf1.js';

const NAME = 'NiniFoog'; // the synth's name, shown on the panel, name plate and start menu

const OFF_ON = [{ v: 'off', label: 'Off' }, { v: 'on', label: 'On' }];
const sw = (label, def, extra = {}) => ({ type: 'step', ui: 'toggle', titled: !!label, label: label || '', options: OFF_ON, def, ...extra });

// Range in organ-pipe feet, plus LO (far below hearing: Oscillator 3 becomes an LFO).
const RANGES = [
  { v: -7, label: 'LO' },
  { v: -2, label: "32'" },
  { v: -1, label: "16'" },
  { v: 0, label: "8'" },
  { v: 1, label: "4'" },
  { v: 2, label: "2'" },
];
const WAVES_12 = [
  { v: 'tri', label: 'triangle', icon: 'tri' },
  { v: 'shark', label: 'shark tooth', icon: 'shark' },
  { v: 'saw', label: 'sawtooth', icon: 'saw' },
  { v: 'square', label: 'square', icon: 'square' },
  { v: 'wide', label: 'wide pulse', icon: 'wide' },
  { v: 'narrow', label: 'narrow pulse', icon: 'narrow' },
];
const WAVES_3 = [
  { v: 'tri', label: 'triangle', icon: 'tri' },
  { v: 'revsaw', label: 'reverse sawtooth', icon: 'revsaw' },
  { v: 'saw', label: 'sawtooth', icon: 'saw' },
  { v: 'square', label: 'square', icon: 'square' },
  { v: 'wide', label: 'wide pulse', icon: 'wide' },
  { v: 'narrow', label: 'narrow pulse', icon: 'narrow' },
];
const FREQ_MARKS = [[-7, '−7'], [-5, '−5'], [-3, '−3'], [0, '0'], [3, '+3'], [5, '+5'], [7, '+7']];
const fmtSt = (v) => (v > 0.005 ? '+' : '') + v.toFixed(2) + ' st';
// Osc 3 as an LFO (Range LO, Control off): Frequency sweeps 0.1-20 Hz. The knob keeps its
// stored -7..+7 position; these convert between that position and Hz (same as the worklet).
const LFO_MIN = 0.1, LFO_MAX = 20;
export const lfoHz = (knob) => LFO_MIN * Math.pow(LFO_MAX / LFO_MIN, (knob + 7) / 14);
const lfoKnob = (h) => Math.round((14 * Math.log(h / LFO_MIN) / Math.log(LFO_MAX / LFO_MIN) - 7) * 100) / 100;
const fmtLfo = (v) => { const h = lfoHz(v); return (h < 1 ? h.toFixed(2) : h < 10 ? h.toFixed(1) : h.toFixed(0)) + ' Hz'; };
const level = (label, def) => ({ type: 'cont', label, min: 0, max: 1, def, curve: 'lin', fmt: fmtPct, evens: true });
const time = (label, def) => ({ type: 'cont', label, min: 0.001, max: 10, def, curve: 'log', fmt: fmtTime, unit: 'sec', marks: TIME_MARKS });

export const PARAMS = {
  // controllers
  'ctrl.tune':   { type: 'cont', label: 'Tune', min: -100, max: 100, def: 0, curve: 'lin', unit: 'cents',
                   fmt: (v) => (v > 0.5 ? '+' : '') + Math.round(v) + ' ct', marks: [[-100, '−100'], [-50, '−50'], [0, '0'], [50, '+50'], [100, '+100']] },
  'ctrl.glide':  { type: 'cont', label: 'Glide', min: 0, max: 3, def: 0.12, curve: 'pow', k: 3, fmt: fmtTime, unit: 'sec',
                   marks: [[0, '0'], [0.03, '.03'], [0.25, '.25'], [1, '1'], [3, '3']] },
  'ctrl.modmix': { type: 'cont', label: 'Modulation Mix', min: 0, max: 1, def: 0, curve: 'lin',
                   fmt: (v) => (v < 0.02 ? 'Osc 3' : v > 0.98 ? 'Noise' : `${Math.round((1 - v) * 100)}% Osc 3`), marks: [[0, 'Osc 3'], [1, 'Noise']] },

  // oscillator bank
  // By default Osc 3 is a slow LFO routed to pitch: push the mod wheel and you get vibrato.
  'osc.mod':     sw('Oscillator Modulation', 'on'),
  'osc3.ctrl':   sw('Osc. 3 Control', 'off', { vertical: true }),
  'osc1.range':  { type: 'step', label: 'Range', options: RANGES, def: 0, span: 180 },
  'osc2.range':  { type: 'step', label: 'Range', options: RANGES, def: 0, span: 180 },
  'osc3.range':  { type: 'step', label: 'Range', options: RANGES, def: -7, span: 180 },
  'osc2.freq':   { type: 'cont', label: 'Frequency', min: -7, max: 7, def: 0, curve: 'lin', fmt: fmtSt, unit: 'semi', marks: FREQ_MARKS },
  // default: a 5 Hz vibrato (Osc 3 starts as an LFO)
  'osc3.freq':   { type: 'cont', label: 'Frequency', min: -7, max: 7, def: lfoKnob(5), curve: 'lin', fmt: fmtSt, unit: 'semi', marks: FREQ_MARKS,
                   alt: { when: (p) => p['osc3.range'] === -7 && p['osc3.ctrl'] === 'off', fmt: fmtLfo, unit: 'Hz',
                          marks: [[0.1, '.1'], [0.5, '.5'], [2, '2'], [5, '5'], [20, '20']].map(([h, t]) => [lfoKnob(h), t]) } },
  'osc1.wave':   { type: 'step', label: 'Waveform', options: WAVES_12, def: 'saw', span: 180 },
  'osc2.wave':   { type: 'step', label: 'Waveform', options: WAVES_12, def: 'saw', span: 180 },
  'osc3.wave':   { type: 'step', label: 'Waveform', options: WAVES_3, def: 'tri', span: 180 },

  // mixer (a level of 0 is off)
  'mix.osc1':    level('Osc. 1', 0.8),
  'mix.osc2':    level('Osc. 2', 0),
  'mix.osc3':    level('Osc. 3', 0),
  'mix.feedback': level('Feedback', 0),
  'mix.noise':   level('Noise', 0),
  'mix.noisetype': { type: 'step', ui: 'toggle', titled: true, label: 'Noise', options: [{ v: 'white', label: 'White' }, { v: 'pink', label: 'Pink' }], def: 'white', vertical: true },

  // modifiers: filter
  'filt.mod':    sw('Filter Modulation', 'off'),
  'filt.kb1':    sw('Keyboard Control 1', 'off'),
  'filt.kb2':    sw('Keyboard Control 2', 'off'),
  'filt.cutoff': { type: 'cont', label: 'Cutoff Frequency', min: 20, max: 20000, def: 632, // 12 o'clock: gentler on the ears than fully open
                   curve: 'log', fmt: fmtHz, unit: 'Hz',
                   marks: [[20, '20'], [100, '100'], [500, '500'], [2000, '2k'], [10000, '10k'], [20000, '20k']] },
  'filt.res':    { type: 'cont', label: 'Emphasis', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
  'filt.env':    { type: 'cont', label: 'Amount of Contour', min: 0, max: 1, def: 0, curve: 'lin', fmt: (v) => fmtOct(v * 7), evens: true },
  'fenv.a':      time('Attack Time', 0.005),
  'fenv.d':      time('Decay Time', 0.4),
  'fenv.s':      level('Sustain Level', 0.3),
  'aenv.a':      time('Attack Time', 0.003),
  'aenv.d':      time('Decay Time', 0.3),
  'aenv.s':      level('Sustain Level', 1),

  // left of the keyboard
  'perf.glideon': sw('Glide', 'off'),
  'perf.decay':   sw('Decay', 'off'),
  'perf.bend':   { type: 'wheel', label: 'Pitch', min: -1, max: 1, def: 0, spring: true,
                   fmt: (v) => (Math.abs(v) < 0.01 ? 'centre' : (v > 0 ? '+' : '') + (v * 2).toFixed(2) + ' st') },
  'perf.mod':    { type: 'wheel', label: 'Mod', min: 0, max: 1, def: 0, fmt: fmtPct },
};

// Panel: Controllers | Oscillator Bank | Mixer | Modifiers, with switches on the lines between.
// rowTitles label each row (Oscillator 1 / 2 / 3; Filter / Filter Contour / Loudness Contour).
export const LAYOUT = [
  // Controllers: Tune, Glide and Modulation Mix in one column
  [{ id: 'ctrl', title: 'Controllers', rowTitles: [' ', ' ', ' '], rows: [['ctrl.tune'], ['ctrl.glide'], ['ctrl.modmix']] }],
  // on the line between Controllers and the Oscillator Bank: Oscillator Modulation and Osc. 3 Control
  [{ id: 'oscmod', title: '', bridge: true, matchRows: 'oscs', rowTitles: [' ', ' ', ' '], rows: [['osc.mod'], [null], ['osc3.ctrl']] }],
  [{
    id: 'oscs', title: 'Oscillator Bank', rowTitles: ['Oscillator 1', 'Oscillator 2', 'Oscillator 3'],
    rows: [['osc1.range', null, 'osc1.wave'], ['osc2.range', 'osc2.freq', 'osc2.wave'], ['osc3.range', 'osc3.freq', 'osc3.wave']],
  }],
  [{
    // staggered like the classic mixer: Feedback sits between Osc 1 and 2, Noise between Osc 2 and 3,
    // with the White/Pink switch under the Noise pot
    id: 'mix', title: 'Mixer', rowTitles: [' ', ' ', ' '],
    rows: [['mix.osc1', 'mix.feedback'], ['mix.osc2', 'mix.noise'], ['mix.osc3', 'mix.noisetype']],
    offsets: { 'mix.feedback': '50%', 'mix.noise': '50%', 'mix.noisetype': '36px' },
  }],
  // on the line between the Mixer and the Modifiers
  [{ id: 'filtsw', title: '', bridge: true, matchRows: 'mods', rowTitles: [' ', ' ', ' '], rows: [['filt.mod'], ['filt.kb1'], ['filt.kb2']] }],
  [{
    id: 'mods', title: 'Modifiers', rowTitles: ['Filter', 'Filter Contour', 'Loudness Contour'],
    rows: [['filt.cutoff', 'filt.res', 'filt.env'], ['fenv.a', 'fenv.d', 'fenv.s'], ['aenv.a', 'aenv.d', 'aenv.s']],
  }],
];
// Left of the keys: Glide and Decay side by side, long pitch and mod wheels below
export const KEYBED_SECTIONS = [{ id: 'perf', title: 'Controllers', rows: [['perf.glideon', 'perf.decay'], ['perf.bend', 'perf.mod']] }];

// Factory patches: only the values that differ from Init.
export const PRESETS = {
  'Init': {},
  'Three-Oscillator Bass': {
    'osc1.range': -2, 'osc2.range': -2, 'osc2.freq': 0.08, 'osc3.range': -1, 'osc3.ctrl': 'on', 'osc3.freq': 0, 'osc3.wave': 'square', 'osc.mod': 'off',
    'mix.osc1': 0.9, 'mix.osc2': 0.8, 'mix.osc3': 0.55,
    'filt.cutoff': 230, 'filt.res': 0.25, 'filt.env': 0.55, 'filt.kb1': 'on',
    'fenv.a': 0.002, 'fenv.d': 0.35, 'fenv.s': 0.1, 'aenv.d': 0.6, 'aenv.s': 0.8,
  },
  'Gliding Lead': {
    'osc2.freq': 0.1, 'osc3.range': 0, 'osc3.ctrl': 'on', 'osc3.wave': 'saw', 'osc3.freq': -0.08, 'osc.mod': 'off', 'mix.osc1': 0.8, 'mix.osc2': 0.7, 'mix.osc3': 0.6,
    'filt.cutoff': 1500, 'filt.res': 0.45, 'filt.env': 0.3, 'filt.kb1': 'on', 'filt.kb2': 'on',
    'perf.glideon': 'on', 'ctrl.glide': 0.08, 'perf.decay': 'on', 'aenv.d': 0.5, 'aenv.s': 0.9,
  },
  'Osc 3 Vibrato': {
    'osc2.freq': 0.06, 'mix.osc2': 0.6, 'osc3.range': -7, 'osc3.ctrl': 'off', 'osc3.freq': lfoKnob(5.5), 'mix.osc3': 0,
    'osc.mod': 'on', 'perf.mod': 0.22, 'filt.cutoff': 2500, 'filt.res': 0.2,
  },
  'Osc 3 Filter Wobble': {
    'osc1.range': -1, 'osc2.range': -1, 'osc2.freq': 0.12, 'mix.osc2': 0.7,
    'osc3.range': -7, 'osc3.ctrl': 'off', 'osc3.freq': lfoKnob(3), 'mix.osc3': 0, 'osc.mod': 'off',
    'filt.mod': 'on', 'perf.mod': 0.65, 'filt.cutoff': 320, 'filt.res': 0.6,
  },
  'Fifth Stack': {
    'osc2.freq': 7, 'osc3.range': -1, 'osc3.ctrl': 'on', 'osc3.freq': 0, 'osc3.wave': 'saw', 'osc.mod': 'off', 'mix.osc2': 0.7, 'mix.osc3': 0.5,
    'filt.cutoff': 900, 'filt.res': 0.3, 'filt.env': 0.35, 'fenv.d': 0.5, 'fenv.s': 0.2,
  },
  'Pluck': {
    'osc1.wave': 'square', 'mix.osc1': 0.9, 'filt.cutoff': 200, 'filt.env': 0.6, 'filt.kb1': 'on', 'filt.kb2': 'on',
    'fenv.a': 0.001, 'fenv.d': 0.2, 'fenv.s': 0, 'aenv.a': 0.001, 'aenv.d': 0.5, 'aenv.s': 0, 'perf.decay': 'on',
  },
  'Wind': {
    'mix.osc1': 0, 'mix.noise': 0.9, 'mix.noisetype': 'pink',
    'osc3.range': -7, 'osc3.ctrl': 'off', 'osc3.freq': lfoKnob(1.4), 'mix.osc3': 0, 'osc.mod': 'off', 'filt.mod': 'on', 'perf.mod': 0.7,
    'filt.cutoff': 700, 'filt.res': 0.8, 'aenv.a': 1.2, 'aenv.d': 2.5, 'perf.decay': 'on',
  },
  'Feedback Growl': {
    'osc1.range': -1, 'mix.osc1': 0.8, 'mix.feedback': 0.6,
    'filt.cutoff': 900, 'filt.res': 0.3, 'filt.env': 0.3, 'fenv.d': 0.6, 'fenv.s': 0.4,
  },
};

export const NF3 = {
  id: 'nf3',
  name: NAME,
  brandSub: 'THREE-OSCILLATOR MONOPHONIC SYNTHESIZER',
  skin: 'vintage',
  module: 'js/worklet/va3-processor.js',
  processor: 'va3-processor',
  lessons: true,
  keyboard: [41, 84], // fixed 44 keys, F to C (3½ octaves); no octave shift
  narrowSwitches: true, // vertical rockers in narrow columns, as on the original
  card: {
    tagline: 'Three oscillators, 1970s style',
    text: 'A classic three-oscillator monosynth with mod wheels and feedback.',
  },
  PARAMS, LAYOUT, KEYBED_SECTIONS, PRESETS,
  // Osc 3 leaving LFO duty (Control on, or a range above LO) becomes a pitched oscillator:
  // its Frequency knob, left at the vibrato speed, would be out of tune, so it snaps to 0.
  linked: (id, before, after) => {
    const lfo = (p) => p['osc3.range'] === -7 && p['osc3.ctrl'] === 'off';
    if ((id === 'osc3.ctrl' || id === 'osc3.range') && lfo(before) && !lfo(after)) return { 'osc3.freq': 0 };
    return null;
  },
};
