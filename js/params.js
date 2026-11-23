// Single source of truth for every control on the synth.
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
  { v: -2, label: "32'" },
  { v: -1, label: "16'" },
  { v: 0, label: "8'" },
  { v: 1, label: "4'" },
  { v: 2, label: "2'" },
];

const SEMIS = [];
for (let s = -7; s <= 7; s++) SEMIS.push({ v: s, label: s === 0 ? '0' : (s > 0 ? '+' + s : String(s)), minor: s % 7 !== 0 });

const LFO_SHAPES = [
  { v: 'tri', label: 'triangle', icon: 'tri' },
  { v: 'saw', label: 'ramp', icon: 'saw' },
  { v: 'square', label: 'square', icon: 'square' },
  { v: 'sh', label: 'sample & hold', icon: 'sh' },
];

// ---- formatters -----------------------------------------------------------
const fmtHz = (v) => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' kHz' : v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0) + ' Hz');
const fmtTime = (v) => (v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s');
const fmtPct = (v) => Math.round(v * 100) + '%';
const fmtCents = (v) => (v > 0 ? '+' : '') + Math.round(v) + ' ct';
const fmtSemis = (v) => (v < 0.995 ? Math.round(v * 100) + ' ct' : v.toFixed(2) + ' st');
const fmtOct = (v) => v.toFixed(2) + ' oct';

// ---- parameter definitions ---------------------------------------------------
// type 'cont': continuous knob. curve: lin | log | pow (with k).
// type 'step': rotary switch with fixed options.
// scale: what is printed around the knob ('0-10', 'bi' for -5..+5, or 'options').
export const PARAMS = {
  'ctrl.tune':   { type: 'cont', label: 'Tune', min: -50, max: 50, def: 0, curve: 'lin', scale: 'bi', fmt: fmtCents,
                   help: 'Master tuning, plus or minus half a semitone.' },
  'ctrl.glide':  { type: 'cont', label: 'Glide', min: 0, max: 3, def: 0, curve: 'pow', k: 3, scale: '0-10', fmt: fmtTime,
                   help: 'Portamento: time to slide from one note to the next.' },

  'osc1.range':  { type: 'step', label: 'Range', options: RANGES, def: 0,
                   help: "Octave in organ-pipe footage. 8' is concert pitch; each halving is one octave up." },
  'osc1.wave':   { type: 'step', label: 'Waveform', options: WAVES, def: 'saw',
                   help: 'The raw shape of the wave, which sets its harmonic content.' },

  'osc2.range':  { type: 'step', label: 'Range', options: RANGES, def: 0, help: 'Octave of oscillator 2.' },
  'osc2.wave':   { type: 'step', label: 'Waveform', options: WAVES, def: 'saw', help: 'Waveform of oscillator 2.' },
  'osc2.semi':   { type: 'step', label: 'Interval', options: SEMIS, def: 0, wide: true,
                   help: 'Transpose oscillator 2 in semitones (+7 is a fifth up).' },
  'osc2.fine':   { type: 'cont', label: 'Detune', min: -50, max: 50, def: 0, curve: 'lin', scale: 'bi', fmt: fmtCents,
                   help: 'Fine detune in cents. Small amounts make the two oscillators beat against each other.' },

  'mix.osc1':    { type: 'cont', label: 'Osc 1', min: 0, max: 1, def: 0.8, curve: 'lin', scale: '0-10', fmt: fmtPct, help: 'Level of oscillator 1 into the filter.' },
  'mix.osc2':    { type: 'cont', label: 'Osc 2', min: 0, max: 1, def: 0, curve: 'lin', scale: '0-10', fmt: fmtPct, help: 'Level of oscillator 2 into the filter.' },
  'mix.noise':   { type: 'cont', label: 'Noise', min: 0, max: 1, def: 0, curve: 'lin', scale: '0-10', fmt: fmtPct, help: 'Level of white noise into the filter.' },

  'filt.cutoff': { type: 'cont', label: 'Cutoff', min: 20, max: 20000, def: 20000, curve: 'log', scale: '0-10', fmt: fmtHz,
                   help: 'Frequency above which the 24 dB/oct low-pass filter removes harmonics.' },
  'filt.res':    { type: 'cont', label: 'Emphasis', min: 0, max: 1, def: 0, curve: 'lin', scale: '0-10', fmt: fmtPct,
                   help: 'Resonance: boosts frequencies around the cutoff. Near maximum the filter whistles on its own.' },
  'filt.env':    { type: 'cont', label: 'Env Amount', min: 0, max: 1, def: 0, curve: 'lin', scale: '0-10', fmt: (v) => fmtOct(v * 7),
                   help: 'How far the filter envelope pushes the cutoff up (up to 7 octaves).' },
  'filt.key':    { type: 'cont', label: 'Key Track', min: 0, max: 1, def: 0, curve: 'lin', scale: '0-10', fmt: fmtPct,
                   help: 'How much the cutoff follows the keyboard. At 100% it moves an octave per octave played.' },

  'fenv.a':      { type: 'cont', label: 'Attack', min: 0.001, max: 10, def: 0.005, curve: 'log', scale: '0-10', fmt: fmtTime, help: 'Filter envelope: time to rise to full.' },
  'fenv.d':      { type: 'cont', label: 'Decay', min: 0.001, max: 10, def: 0.4, curve: 'log', scale: '0-10', fmt: fmtTime, help: 'Filter envelope: time to fall to the sustain level.' },
  'fenv.s':      { type: 'cont', label: 'Sustain', min: 0, max: 1, def: 0.3, curve: 'lin', scale: '0-10', fmt: fmtPct, help: 'Filter envelope: level held while the key is down.' },
  'fenv.r':      { type: 'cont', label: 'Release', min: 0.001, max: 10, def: 0.4, curve: 'log', scale: '0-10', fmt: fmtTime, help: 'Filter envelope: time to fall to zero after the key is let go.' },

  'aenv.a':      { type: 'cont', label: 'Attack', min: 0.001, max: 10, def: 0.002, curve: 'log', scale: '0-10', fmt: fmtTime, help: 'Loudness envelope: time to rise to full volume.' },
  'aenv.d':      { type: 'cont', label: 'Decay', min: 0.001, max: 10, def: 0.3, curve: 'log', scale: '0-10', fmt: fmtTime, help: 'Loudness envelope: time to fall to the sustain level.' },
  'aenv.s':      { type: 'cont', label: 'Sustain', min: 0, max: 1, def: 1, curve: 'lin', scale: '0-10', fmt: fmtPct, help: 'Loudness envelope: level held while the key is down.' },
  'aenv.r':      { type: 'cont', label: 'Release', min: 0.001, max: 10, def: 0.15, curve: 'log', scale: '0-10', fmt: fmtTime, help: 'Loudness envelope: time to fade out after the key is let go.' },

  'lfo.rate':    { type: 'cont', label: 'Rate', min: 0.05, max: 30, def: 5, curve: 'log', scale: '0-10', fmt: fmtHz, help: 'Speed of the low-frequency oscillator.' },
  'lfo.shape':   { type: 'step', label: 'Shape', options: LFO_SHAPES, def: 'tri', help: 'Waveform of the LFO.' },
  'lfo.pitch':   { type: 'cont', label: '→ Pitch', min: 0, max: 12, def: 0, curve: 'pow', k: 2, scale: '0-10', fmt: fmtSemis, help: 'Vibrato depth: how far the LFO bends pitch.' },
  'lfo.filter':  { type: 'cont', label: '→ Filter', min: 0, max: 4, def: 0, curve: 'lin', scale: '0-10', fmt: fmtOct, help: 'Wah depth: how far the LFO sweeps the cutoff.' },
  'lfo.amp':     { type: 'cont', label: '→ Amp', min: 0, max: 1, def: 0, curve: 'lin', scale: '0-10', fmt: fmtPct, help: 'Tremolo depth: how much the LFO varies the volume.' },

  'out.volume':  { type: 'cont', label: 'Volume', min: 0, max: 1, def: 0.7, curve: 'lin', scale: '0-10', fmt: fmtPct, help: 'Master output level.' },
};

// Panel layout: sections left to right. Each section is a grid of rows; null = empty cell.
// Section ids are what the game uses to lock (grey out) parts of the synth.
export const LAYOUT = [
  { id: 'ctrl', title: 'Controllers', rows: [['ctrl.tune'], ['ctrl.glide']] },
  { id: 'osc1', title: 'Oscillator 1', rows: [['osc1.range'], ['osc1.wave']] },
  { id: 'osc2', title: 'Oscillator 2', rows: [['osc2.range', 'osc2.semi'], ['osc2.wave', 'osc2.fine']] },
  { id: 'mix', title: 'Mixer', rows: [['mix.osc1', 'mix.osc2'], ['mix.noise', null]] },
  { id: 'filt', title: 'Filter', rows: [['filt.cutoff', 'filt.res'], ['filt.env', 'filt.key']] },
  { id: 'fenv', title: 'Filter Envelope', rows: [['fenv.a', 'fenv.d'], ['fenv.s', 'fenv.r']] },
  { id: 'aenv', title: 'Loudness Envelope', rows: [['aenv.a', 'aenv.d'], ['aenv.s', 'aenv.r']] },
  { id: 'lfo', title: 'Modulation', rows: [['lfo.rate', 'lfo.shape', null], ['lfo.pitch', 'lfo.filter', 'lfo.amp']] },
  { id: 'out', title: 'Output', rows: [['out.volume'], ['power']] },
];

// ---- value <-> knob position (0..1) -------------------------------------------
export function toNorm(id, v) {
  const p = PARAMS[id];
  if (p.type === 'step') {
    const i = p.options.findIndex((o) => o.v === v);
    return p.options.length > 1 ? Math.max(0, i) / (p.options.length - 1) : 0;
  }
  if (p.curve === 'log') return Math.log(v / p.min) / Math.log(p.max / p.min);
  if (p.curve === 'pow') return Math.pow((v - p.min) / (p.max - p.min), 1 / p.k);
  return (v - p.min) / (p.max - p.min);
}

export function fromNorm(id, n) {
  const p = PARAMS[id];
  n = Math.min(1, Math.max(0, n));
  if (p.type === 'step') return p.options[Math.round(n * (p.options.length - 1))].v;
  if (p.curve === 'log') return p.min * Math.pow(p.max / p.min, n);
  if (p.curve === 'pow') return p.min + (p.max - p.min) * Math.pow(n, p.k);
  return p.min + (p.max - p.min) * n;
}

export function formatValue(id, v) {
  const p = PARAMS[id];
  if (p.type === 'step') return (p.options.find((o) => o.v === v) || p.options[0]).label;
  return p.fmt(v);
}

export function defaultPatch() {
  const patch = {};
  for (const id in PARAMS) patch[id] = PARAMS[id].def;
  return patch;
}

// ---- factory presets -------------------------------------------------------------
// Only the values that differ from the init patch are listed.
export const PRESETS = {
  'Init': {},
  'Fat Bass': {
    'osc1.range': -1, 'osc2.range': -1, 'osc2.wave': 'saw', 'osc2.fine': 9, 'mix.osc1': 0.8, 'mix.osc2': 0.7,
    'filt.cutoff': 260, 'filt.res': 0.35, 'filt.env': 0.45, 'filt.key': 0.5,
    'fenv.a': 0.002, 'fenv.d': 0.28, 'fenv.s': 0.1, 'fenv.r': 0.2,
    'aenv.a': 0.002, 'aenv.d': 0.5, 'aenv.s': 0.85, 'aenv.r': 0.08,
  },
  'Gliding Lead': {
    'osc1.wave': 'saw', 'osc2.wave': 'square', 'osc2.fine': -6, 'mix.osc1': 0.75, 'mix.osc2': 0.55, 'ctrl.glide': 0.09,
    'filt.cutoff': 1400, 'filt.res': 0.4, 'filt.env': 0.3, 'filt.key': 0.7,
    'fenv.a': 0.02, 'fenv.d': 0.6, 'fenv.s': 0.4, 'aenv.r': 0.25,
    'lfo.rate': 5.5, 'lfo.pitch': 0.18,
  },
  'Pluck': {
    'osc1.wave': 'square', 'mix.osc1': 0.9, 'filt.cutoff': 180, 'filt.res': 0.25, 'filt.env': 0.65, 'filt.key': 0.8,
    'fenv.a': 0.001, 'fenv.d': 0.18, 'fenv.s': 0, 'fenv.r': 0.18,
    'aenv.a': 0.001, 'aenv.d': 0.55, 'aenv.s': 0, 'aenv.r': 0.4,
  },
  'Brass': {
    'osc1.wave': 'saw', 'osc2.wave': 'saw', 'osc2.fine': 5, 'mix.osc1': 0.8, 'mix.osc2': 0.6,
    'filt.cutoff': 380, 'filt.res': 0.12, 'filt.env': 0.5, 'filt.key': 0.6,
    'fenv.a': 0.09, 'fenv.d': 0.7, 'fenv.s': 0.45, 'fenv.r': 0.3,
    'aenv.a': 0.04, 'aenv.d': 0.4, 'aenv.s': 0.9, 'aenv.r': 0.25,
  },
  'Fifth Stab': {
    'osc1.wave': 'saw', 'osc2.wave': 'saw', 'osc2.semi': 7, 'mix.osc1': 0.8, 'mix.osc2': 0.7,
    'filt.cutoff': 700, 'filt.res': 0.3, 'filt.env': 0.4, 'fenv.d': 0.3, 'fenv.s': 0.05,
    'aenv.d': 0.45, 'aenv.s': 0.2, 'aenv.r': 0.2,
  },
  'Wobble': {
    'osc1.range': -1, 'osc1.wave': 'saw', 'osc2.range': -1, 'osc2.wave': 'square', 'mix.osc2': 0.6, 'osc2.fine': 4,
    'filt.cutoff': 200, 'filt.res': 0.55, 'filt.key': 0.4, 'lfo.rate': 3, 'lfo.shape': 'tri', 'lfo.filter': 3.2,
  },
  'Self-Osc Whistle': {
    'mix.osc1': 0, 'filt.cutoff': 880, 'filt.res': 1, 'filt.key': 1, 'aenv.a': 0.15, 'aenv.r': 0.6,
    'lfo.rate': 5, 'lfo.filter': 0.08,
  },
  'Wind': {
    'mix.osc1': 0, 'mix.noise': 0.9, 'filt.cutoff': 600, 'filt.res': 0.75, 'lfo.rate': 0.15, 'lfo.filter': 2.2,
    'aenv.a': 1.2, 'aenv.r': 2.5,
  },
};

export const WAVE_ICONS = {
  sine: 'M0,6 C2,-2 4,-2 6,6 S10,14 12,6',
  tri: 'M0,6 L3,0 L9,12 L12,6',
  saw: 'M0,12 L6,0 L6,12 L12,0 L12,12',
  square: 'M0,12 L0,0 L6,0 L6,12 L12,12 L12,0',
  pulse: 'M0,12 L0,0 L3,0 L3,12 L12,12 L12,0',
  narrow: 'M0,12 L0,0 L1.4,0 L1.4,12 L12,12 L12,0',
  sh: 'M0,8 L3,8 L3,2 L6,2 L6,11 L9,11 L9,5 L12,5',
};
