// NF-1: the first synth students meet. Two oscillators, mixer, low-pass filter,
// filter and loudness envelopes, LFO. Every control on its panel is defined here.
// The panel UI, the audio engine and (later) the game layer all read from here.
// Patch values are stored in real-world units (Hz, seconds, cents, 0..1 levels)
// so a patch is readable and can be compared against a target.

const WAVES = [
  { v: 'sine', label: 'sine', icon: 'sine' },
  { v: 'tri', label: 'triangle', icon: 'tri' },
  { v: 'saw', label: 'sawtooth', icon: 'saw' },
  { v: 'square', label: 'square', icon: 'square' },
  { v: 'pulse', label: 'pulse 25%', icon: 'pulse' },
  { v: 'narrow', label: 'pulse 10%', icon: 'narrow' },
];

const RANGES = [
  { v: -2, label: '−2' },
  { v: -1, label: '−1' },
  { v: 0, label: '0' },
  { v: 1, label: '+1' },
  { v: 2, label: '+2' },
];

const LFO_SHAPES = [
  { v: 'tri', label: 'triangle', icon: 'tri' },
  { v: 'saw', label: 'ramp', icon: 'saw' },
  { v: 'square', label: 'square', icon: 'square' },
  { v: 'sh', label: 'sample & hold', icon: 'sh' },
];

// ---- formatters -----------------------------------------------------------
export const fmtHz = (v) => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' kHz' : v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0) + ' Hz');
export const fmtTime = (v) => (v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s');
export const fmtPct = (v) => Math.round(v * 100) + '%';
export const fmtCents = (v) => (v > 0 ? '+' : '') + Math.round(v) + ' ct';
export const fmtSemis = (v) => (v < 0.995 ? Math.round(v * 100) + ' ct' : v.toFixed(2) + ' st');
export const fmtOct = (v) => v.toFixed(2) + ' oct';

// ---- parameter definitions ---------------------------------------------------
// type 'cont': continuous knob. curve: lin | log | pow (with k).
// type 'step': rotary switch with fixed options.
// marks: [value, label] pairs printed around the knob in real units; without marks the scale is 0-10.
// unit: shown in the gap at the bottom of the scale.
export const TIME_MARKS = [[0.001, '.001'], [0.01, '.01'], [0.1, '.1'], [1, '1'], [10, '10']];

export const PARAMS = {
  'ctrl.glide':  { type: 'cont', label: 'Glide', min: 0, max: 3, def: 0, curve: 'pow', k: 3, fmt: fmtTime, unit: 'sec',
                   marks: [[0, '0'], [0.03, '.03'], [0.25, '.25'], [1, '1'], [3, '3']],
                   help: 'Portamento: time to slide from one note to the next.' },

  'ctrl.mode':   { type: 'step', ui: 'toggle', label: 'Mode', def: 'mono',
                   options: [{ v: 'mono', label: 'Mono' }, { v: 'legato', label: 'Legato' }],
                   help: 'Mono: every note restarts the envelopes and glides. Legato: notes played while another is held slide without restarting the envelopes; separate notes do not glide.' },

  'osc1.range':  { type: 'step', label: 'Range', options: RANGES, def: 0,
                   unit: 'oct', help: 'Octave shift. 0 is concert pitch; each step is one octave up or down.' },
  'osc1.wave':   { type: 'step', label: 'Waveform', options: WAVES, def: 'saw',
                   help: 'The raw shape of the wave, which sets its harmonic content.' },

  'osc2.range':  { type: 'step', label: 'Range', options: RANGES, def: 0, unit: 'oct', help: 'Octave shift of oscillator 2.' },
  'osc2.wave':   { type: 'step', label: 'Waveform', options: WAVES, def: 'saw', help: 'Waveform of oscillator 2.' },
  'osc2.fine':   { type: 'cont', label: 'Detune', min: -50, max: 50, def: 0, curve: 'lin', fmt: fmtCents, unit: 'cents',
                   marks: [[-50, '−50'], [-25, '−25'], [0, '0'], [25, '+25'], [50, '+50']],
                   help: 'Fine detune in cents. Small amounts make the two oscillators beat against each other.' },

  'mix.osc1':    { type: 'cont', label: 'Osc 1', min: 0, max: 1, def: 0.8, curve: 'lin', fmt: fmtPct, help: 'Level of oscillator 1 into the filter.' },
  'mix.osc2':    { type: 'cont', label: 'Osc 2', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct, help: 'Level of oscillator 2 into the filter.' },

  'filt.cutoff': { type: 'cont', label: 'Cutoff', min: 20, max: 20000, def: 20000, curve: 'log', fmt: fmtHz, unit: 'Hz',
                   marks: [[20, '20'], [100, '100'], [500, '500'], [2000, '2k'], [10000, '10k'], [20000, '20k']],
                   help: 'Frequency above which the 24 dB/oct low-pass filter removes harmonics.' },
  'filt.res':    { type: 'cont', label: 'Resonance', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct,
                   help: 'Boosts frequencies around the cutoff. Near maximum the filter whistles on its own.' },
  'filt.env':    { type: 'cont', label: 'Env Amount', min: -1, max: 1, def: 0, curve: 'lin', unit: '%',
                   fmt: (v) => (v > 0.005 ? '+' : '') + Math.round(v * 100) + '%',
                   marks: [[-1, '−100'], [-0.5, '−50'], [0, '0'], [0.5, '+50'], [1, '+100']],
                   help: 'How far, and which way, the filter envelope moves the cutoff. +100% sweeps it up 7 octaves; negative values sweep it down.' },

  'fenv.a':      { type: 'cont', label: 'Attack', min: 0.001, max: 10, def: 0.005, curve: 'log', fmt: fmtTime, unit: 'sec', marks: TIME_MARKS, help: 'Filter envelope: time to rise to full.' },
  'fenv.d':      { type: 'cont', label: 'Decay', min: 0.001, max: 10, def: 0.4, curve: 'log', fmt: fmtTime, unit: 'sec', marks: TIME_MARKS, help: 'Filter envelope: time to fall back to zero.' },
  'fenv.r':      { type: 'cont', label: 'Release', min: 0.001, max: 10, def: 0.4, curve: 'log', fmt: fmtTime, unit: 'sec', marks: TIME_MARKS, help: 'Filter envelope: if the key is let go before the decay ends, the time to fall to zero from there.' },

  'aenv.a':      { type: 'cont', label: 'Attack', min: 0.001, max: 10, def: 0.002, curve: 'log', fmt: fmtTime, unit: 'sec', marks: TIME_MARKS, help: 'Loudness envelope: time to rise to full volume.' },
  'aenv.d':      { type: 'cont', label: 'Decay', min: 0.001, max: 10, def: 0.3, curve: 'log', fmt: fmtTime, unit: 'sec', marks: TIME_MARKS, help: 'Loudness envelope: time to fall to the sustain level.' },
  'aenv.s':      { type: 'cont', label: 'Sustain', min: 0, max: 1, def: 1, curve: 'lin', fmt: fmtPct, help: 'Loudness envelope: level held while the key is down.' },
  'aenv.r':      { type: 'cont', label: 'Release', min: 0.001, max: 10, def: 0.15, curve: 'log', fmt: fmtTime, unit: 'sec', marks: TIME_MARKS, help: 'Loudness envelope: time to fade out after the key is let go.' },

  'lfo.rate':    { type: 'cont', label: 'Rate', min: 0.05, max: 30, def: 5, curve: 'log', fmt: fmtHz, unit: 'Hz',
                   marks: [[0.05, '.05'], [0.2, '.2'], [1, '1'], [5, '5'], [30, '30']],
                   help: 'Speed of the low-frequency oscillator, from one cycle every 20 seconds up to 30 cycles a second.' },
  'lfo.shape':   { type: 'step', label: 'Shape', options: LFO_SHAPES, def: 'tri', help: 'Waveform of the LFO.' },
  'lfo.delay':   { type: 'cont', label: 'Delay', min: 0, max: 5, def: 0, curve: 'pow', k: 2, fmt: fmtTime, unit: 'sec',
                   marks: [[0, '0'], [0.2, '.2'], [0.5, '.5'], [1, '1'], [2, '2'], [5, '5']],
                   help: 'Time for the LFO to fade in after a new note starts, like a singer adding vibrato to a held note.' },
  'lfo.pitch':   { type: 'cont', label: '→ Pitch', min: 0, max: 12, def: 0, curve: 'pow', k: 2, fmt: fmtSemis, unit: 'semi',
                   marks: [[0, '0'], [0.5, '.5'], [2, '2'], [6, '6'], [12, '12']],
                   help: 'Vibrato depth: how far the LFO bends pitch.' },
  'lfo.filter':  { type: 'cont', label: '→ Filter', min: 0, max: 4, def: 0, curve: 'lin', fmt: fmtOct, unit: 'oct',
                   marks: [0, 1, 2, 3, 4].map((o) => [o, String(o)]),
                   help: 'Wah depth: how far the LFO sweeps the cutoff.' },
  'lfo.amp':     { type: 'cont', label: '→ Amp', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct, help: 'Tremolo depth: how much the LFO varies the volume.' },
};

// Panel layout: columns left to right; each column stacks one or more sections.
// Each section is a grid of rows; null = empty cell.
// Section ids are what the game uses to lock (grey out) parts of the synth.
// place: 'keybed' puts a section in the performance area left of the keys.
// alignRows: line each row up with the rows of these sections (so the Mixer's
// Osc 1 knob sits level with Oscillator 1, and so on).
const ROW_ALIGN = ['osc1', 'osc2'];
export const LAYOUT = [
  [
    { id: 'osc1', title: 'Oscillator 1', rows: [['osc1.range', 'osc1.wave', null]] },
    { id: 'osc2', title: 'Oscillator 2', rows: [['osc2.range', 'osc2.wave', 'osc2.fine']] },
  ],
  [{ id: 'mix', title: 'Mixer', rows: [['mix.osc1'], ['mix.osc2']], alignRows: ROW_ALIGN }],
  [{ id: 'filt', title: 'Low Pass Filter', rows: [['filt.cutoff'], ['filt.res']], alignRows: ROW_ALIGN }],
  [
    { id: 'fenv', title: 'Filter Envelope', rows: [['filt.env', 'fenv.a', 'fenv.d', 'fenv.r']] },
    { id: 'aenv', title: 'Loudness Envelope', rows: [['aenv.a', 'aenv.d', 'aenv.s', 'aenv.r']] },
  ],
  [
    { id: 'lfo', title: 'LFO', rows: [['lfo.rate', 'lfo.shape', 'lfo.delay']] },
    { id: 'lfomod', title: 'LFO Modulation', rows: [['lfo.pitch', 'lfo.filter', 'lfo.amp']] },
  ],
];
export const KEYBED_SECTIONS = [{ id: 'glide', title: 'Glide', rows: [['ctrl.glide'], ['ctrl.mode']] }];

// ---- factory presets -------------------------------------------------------------
// Only the values that differ from the init patch are listed.
export const PRESETS = {
  'Init': {},
  'Fat Bass': {
    'osc1.range': -1, 'osc2.range': -1, 'osc2.wave': 'saw', 'osc2.fine': 9, 'mix.osc1': 0.8, 'mix.osc2': 0.7,
    'filt.cutoff': 300, 'filt.res': 0.35, 'filt.env': 0.45,
    'fenv.a': 0.002, 'fenv.d': 0.35, 'fenv.r': 0.2,
    'aenv.a': 0.002, 'aenv.d': 0.5, 'aenv.s': 0.85, 'aenv.r': 0.08,
  },
  'Gliding Lead': {
    'osc1.wave': 'saw', 'osc2.wave': 'square', 'osc2.fine': -6, 'mix.osc1': 0.75, 'mix.osc2': 0.55, 'ctrl.glide': 0.09, 'ctrl.mode': 'legato',
    'filt.cutoff': 2200, 'filt.res': 0.4, 'filt.env': 0.25,
    'fenv.a': 0.02, 'fenv.d': 0.8, 'aenv.r': 0.25,
    'lfo.rate': 5.5, 'lfo.pitch': 0.25, 'lfo.delay': 0.6,
  },
  'Pluck': {
    'osc1.wave': 'square', 'mix.osc1': 0.9, 'filt.cutoff': 180, 'filt.res': 0.25, 'filt.env': 0.65,
    'fenv.a': 0.001, 'fenv.d': 0.18, 'fenv.r': 0.18,
    'aenv.a': 0.001, 'aenv.d': 0.55, 'aenv.s': 0, 'aenv.r': 0.4,
  },
  'Brass': {
    'osc1.wave': 'saw', 'osc2.wave': 'saw', 'osc2.fine': 5, 'mix.osc1': 0.8, 'mix.osc2': 0.6,
    'filt.cutoff': 650, 'filt.res': 0.12, 'filt.env': 0.4,
    'fenv.a': 0.09, 'fenv.d': 1.2, 'fenv.r': 0.3,
    'aenv.a': 0.04, 'aenv.d': 0.4, 'aenv.s': 0.9, 'aenv.r': 0.25,
  },
  'Reverse Sweep': {
    'osc1.wave': 'saw', 'osc2.wave': 'saw', 'osc2.fine': 7, 'mix.osc2': 0.7,
    'filt.cutoff': 6000, 'filt.res': 0.5, 'filt.env': -0.6,
    'fenv.a': 0.002, 'fenv.d': 0.9, 'fenv.r': 0.4, 'aenv.r': 0.3,
  },
  'Wobble': {
    'osc1.range': -1, 'osc1.wave': 'saw', 'osc2.range': -1, 'osc2.wave': 'square', 'mix.osc2': 0.6, 'osc2.fine': 4,
    'filt.cutoff': 200, 'filt.res': 0.55, 'lfo.rate': 3, 'lfo.shape': 'tri', 'lfo.filter': 3.2,
  },
  'Resonant Sweep': {
    'osc1.wave': 'saw', 'filt.cutoff': 120, 'filt.res': 0.85, 'filt.env': 0.6,
    'fenv.a': 0.6, 'fenv.d': 2.5, 'fenv.r': 0.8, 'aenv.r': 0.8,
  },
};

export const NF1 = {
  id: 'nf1',
  name: 'NF-1',
  brandSub: 'MONOPHONIC ANALOG-STYLE SYNTHESIZER',
  skin: 'classic',
  module: 'js/worklet/va-processor.js',
  processor: 'va-processor',
  lessons: true,
  card: {
    tagline: 'Your first synth',
    text: 'Two oscillators, a mixer, a low-pass filter, two envelopes and an LFO. The place to learn the basics, with lessons.',
  },
  PARAMS, LAYOUT, KEYBED_SECTIONS, PRESETS,
};
