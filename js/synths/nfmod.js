// NF-Modular: the full modular rack, for students who have learnt to patch on the MiniModular.
// Two VCOs (saw, square and triangle at once, pulse width, FM, PWM and sync), Noise, a four-input
// Mixer, a VCF (with resonance CV and 1 V/octave keyboard tracking), two ENVs (with inverted
// outputs), an LFO (with rate CV), Sample & Hold, two VCAs (with CV Amount) and the keyboard's
// Pitch, Gate and Trigger.
//
// As on the MiniModular, each INPUT jack is a param ('jack.<module>.<input>') whose value is the
// output plugged into it ('' = nothing). See js/cables.js.

import { PARAMS as NF1_PARAMS, fmtPct } from './nf1.js';

// Outputs: id -> socket label and module (for help and readouts)
export const OUTPUTS = {
  'kb.pitch': { label: 'Pitch', module: 'Keyboard' },
  'kb.gate': { label: 'Gate', module: 'Keyboard' },
  'kb.trig': { label: 'Trig', module: 'Keyboard' },
  'vco1.saw': { label: 'Saw', module: 'VCO 1' },
  'vco1.sq': { label: 'Pulse', module: 'VCO 1' },
  'vco1.tri': { label: 'Tri', module: 'VCO 1' },
  'vco2.saw': { label: 'Saw', module: 'VCO 2' },
  'vco2.sq': { label: 'Pulse', module: 'VCO 2' },
  'vco2.tri': { label: 'Tri', module: 'VCO 2' },
  'noise.white': { label: 'White', module: 'Noise' },
  'noise.pink': { label: 'Pink', module: 'Noise' },
  'noise.col': { label: 'Colour', module: 'Noise' },
  'mix.out': { label: 'Out', module: 'Mixer' },
  'filt.out': { label: 'LP', module: 'VCF' },
  'filt.bp': { label: 'BP', module: 'VCF' },
  'filt.hp': { label: 'HP', module: 'VCF' },
  'env1.out': { label: 'Out', module: 'ENV 1' },
  'env1.inv': { label: 'Inv', module: 'ENV 1' },
  'env2.out': { label: 'Out', module: 'ENV 2' },
  'env2.inv': { label: 'Inv', module: 'ENV 2' },
  'lfo.out': { label: 'Out', module: 'LFO 1' },
  'lfo2.out': { label: 'Out', module: 'LFO 2' },
  'ring.out': { label: 'Out', module: 'Ring Mod' },
  'att.out1': { label: 'Out', module: 'Attenuverter 1' },
  'att.out2': { label: 'Out', module: 'Attenuverter 2' },
  'sh.out': { label: 'Out', module: 'S&H' },
  'vca1.out': { label: 'Out', module: 'VCA 1' },
  'vca2.out': { label: 'Out', module: 'VCA 2' },
};
const fullName = (out) => (OUTPUTS[out] ? `${OUTPUTS[out].module} ${OUTPUTS[out].label}` : 'nothing');
const jack = (label, def = '') => ({ type: 'jack', label, def, fmt: (v) => (v ? 'from ' + fullName(v) : 'not patched') });
const pick = (id, extra = {}) => ({ ...NF1_PARAMS[id], ...extra });
const level = (label, def) => ({ type: 'cont', label, min: 0, max: 1, def, curve: 'lin', fmt: fmtPct });
const bipolar = (label) => ({ type: 'cont', label, min: -1, max: 1, def: 0, curve: 'lin', unit: '%',
  fmt: (v) => (v > 0.005 ? '+' : '') + Math.round(v * 100) + '%',
  marks: [[-1, '−100'], [-0.5, '−50'], [0, '0'], [0.5, '+50'], [1, '+100']] });
const tune = { type: 'cont', label: 'Tune', min: -7, max: 7, def: 0, curve: 'lin', unit: 'semi',
  fmt: (v) => (v > 0.005 ? '+' : '') + v.toFixed(2) + ' st', marks: [[-7, '−7'], [-5, '−5'], [0, '0'], [5, '+5'], [7, '+7']] };
const pw = { type: 'cont', label: 'Pulse Width', min: 0.05, max: 0.95, def: 0.5, curve: 'lin', unit: '%',
  fmt: (v) => Math.round(v * 100) + '%', marks: [[0.05, '5'], [0.25, '25'], [0.5, '50'], [0.75, '75'], [0.95, '95']] };
const mixLevel = (label, def) => ({ type: 'cont', label, min: 0, max: 1.5, def, curve: 'lin', fmt: (v) => (v * 10).toFixed(1),
  marks: [[0, '0'], [0.2, '2'], [0.4, '4'], [0.6, '6'], [0.8, '8'], [1, '10'], [1.5, '11']] });
const fmAmt = { type: 'cont', label: 'FM Amount', min: 0, max: 1, def: 0, curve: 'pow', k: 2, fmt: fmtPct };
const env = (n, a, d, s, r) => ({
  [`env${n}.a`]: pick('aenv.a', { def: a }), [`env${n}.d`]: pick('aenv.d', { def: d }),
  [`env${n}.s`]: pick('aenv.s', { def: s }), [`env${n}.r`]: pick('aenv.r', { def: r }),
});

export const PARAMS = {
  'kb.glide': pick('ctrl.glide'),

  'osc1.range': pick('osc1.range'), 'osc1.tune': { ...tune }, 'osc1.pw': { ...pw },
  'osc1.fm': { ...fmAmt }, 'osc1.pwm': level('PWM Amount', 0),
  'osc2.range': pick('osc1.range'), 'osc2.tune': { ...tune, def: 0.08 }, 'osc2.pw': { ...pw },
  'osc2.fm': { ...fmAmt }, 'osc2.pwm': level('PWM Amount', 0),

  // mixer levels go to 11: 10 is full level, past that the mix is pushed into its Mode (Drive or Fold)
  'mix.l1': mixLevel('Level 1', 0.7), 'mix.l2': mixLevel('Level 2', 0.6), 'mix.l3': mixLevel('Level 3', 0), 'mix.l4': mixLevel('Level 4', 0),
  'mix.mode': { type: 'step', label: 'Mode', def: 'clean', span: 120,
    options: [{ v: 'clean', label: 'Clean' }, { v: 'drive', label: 'Drive' }, { v: 'fold', label: 'Fold' }] },

  'filt.cutoff': pick('filt.cutoff', { def: 1200 }),
  'filt.res': pick('filt.res', { def: 0.2 }),
  'filt.cv': bipolar('CV Amount'),

  // noise colour: darker (left) through white (centre) to brighter (right), for the Colour output
  'noise.colour': { ...bipolar('Colour'), marks: [[-1, 'dark'], [0, 'white'], [1, 'bright']], unit: '',
    fmt: (v) => (Math.abs(v) < 0.03 ? 'white' : v < 0 ? `darker ${Math.round(-v * 100)}%` : `brighter ${Math.round(v * 100)}%`) },

  // sample & hold: its own clock (when nothing is in Clock) and a lag that glides between steps
  'sh.rate': { ...NF1_PARAMS['lfo.rate'], label: 'Speed', def: 4 },
  'sh.lag': { type: 'cont', label: 'Lag', min: 0, max: 2, def: 0, curve: 'pow', k: 2, unit: 'sec',
    fmt: (v) => (v < 0.001 ? 'off' : v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s'),
    marks: [[0, '0'], [0.1, '.1'], [0.5, '.5'], [1, '1'], [2, '2']] },

  ...env(1, 0.005, 0.3, 0.7, 0.25),
  ...env(2, 0.005, 0.5, 0.2, 0.3),

  'lfo.rate': pick('lfo.rate', { def: 5 }),
  'lfo.shape': pick('lfo.shape', { options: [
    { v: 'sine', label: 'sine', icon: 'sine' }, { v: 'tri', label: 'triangle', icon: 'tri' },
    { v: 'saw', label: 'ramp', icon: 'saw' }, { v: 'square', label: 'square', icon: 'square' }], def: 'tri' }),
  'lfo.rcv': level('Rate CV', 0),
  'lfo2.rate': pick('lfo.rate', { def: 0.3 }),
  'lfo2.shape': null, // filled in below (same shapes as LFO 1)

  'att.a1': bipolar('Amount 1'),
  'att.a2': bipolar('Amount 2'),

  'vca1.level': level('Level', 0), 'vca1.cv': level('CV Amount', 1),
  'vca2.level': level('Level', 0), 'vca2.cv': level('CV Amount', 1),
  'out.vol': level('Volume', 0.8),

  // ---- input jacks, with the starting patch: two detuned saws, mixed, filtered, with an
  // envelope on the VCA and a second envelope opening the filter
  'jack.vco1.pitch': jack('Pitch', 'kb.pitch'), 'jack.vco1.fm': jack('FM'), 'jack.vco1.pwm': jack('PWM'), 'jack.vco1.sync': jack('Sync'),
  'jack.vco2.pitch': jack('Pitch', 'kb.pitch'), 'jack.vco2.fm': jack('FM'), 'jack.vco2.pwm': jack('PWM'), 'jack.vco2.sync': jack('Sync'),
  'jack.mix.in1': jack('In 1', 'vco1.saw'), 'jack.mix.in2': jack('In 2', 'vco2.saw'), 'jack.mix.in3': jack('In 3'), 'jack.mix.in4': jack('In 4'),
  'jack.filt.in': jack('In', 'mix.out'), 'jack.filt.cv': jack('CV', 'env2.out'), 'jack.filt.key': jack('Key'), 'jack.filt.res': jack('Res'),
  'jack.env1.gate': jack('Gate', 'kb.gate'), 'jack.env2.gate': jack('Gate', 'kb.gate'),
  'jack.lfo.gate': jack('Gate'), 'jack.lfo.rate': jack('Rate'), 'jack.lfo2.gate': jack('Gate'),
  'jack.ring.a': jack('In A'), 'jack.ring.b': jack('In B'),
  'jack.att.in1': jack('In'), 'jack.att.in2': jack('In'),
  'jack.sh.in': jack('In'), 'jack.sh.clock': jack('Clock'),
  'jack.vca1.in': jack('In', 'filt.out'), 'jack.vca1.cv': jack('CV', 'env1.out'),
  'jack.vca2.in': jack('In'), 'jack.vca2.cv': jack('CV'),
  'jack.out.in': jack('In', 'vca1.out'),
};
PARAMS['filt.cv'].def = 0.35; // ENV 2 opens the filter a little on each note
PARAMS['lfo2.shape'] = { ...PARAMS['lfo.shape'] };

// Panel: a two-row rack. Each column stacks one or two modules. 'jacks' can be one row of
// sockets or several rows (inputs above outputs); 'out:<id>' is an output socket.
export const LAYOUT = [
  [
    { id: 'vco1', title: 'VCO 1', rows: [['osc1.range', 'osc1.tune', 'osc1.pw'], ['osc1.fm', 'osc1.pwm', null]],
      jacks: [['jack.vco1.pitch', 'jack.vco1.fm', 'jack.vco1.pwm', 'jack.vco1.sync'], ['out:vco1.saw', 'out:vco1.sq', 'out:vco1.tri']] },
    { id: 'vco2', title: 'VCO 2', rows: [['osc2.range', 'osc2.tune', 'osc2.pw'], ['osc2.fm', 'osc2.pwm', null]],
      jacks: [['jack.vco2.pitch', 'jack.vco2.fm', 'jack.vco2.pwm', 'jack.vco2.sync'], ['out:vco2.saw', 'out:vco2.sq', 'out:vco2.tri']] },
  ],
  [
    { id: 'mix', title: 'Mixer', rows: [['mix.l1', 'mix.l2'], ['mix.l3', 'mix.l4'], ['mix.mode', null]],
      jacks: [['jack.mix.in1', 'jack.mix.in2', 'jack.mix.in3', 'jack.mix.in4'], ['out:mix.out']] },
    { id: 'noise', title: 'Noise', rows: [['noise.colour']], jacks: [['out:noise.white', 'out:noise.pink', 'out:noise.col']] },
  ],
  [
    { id: 'filt', title: 'VCF', rows: [['filt.cutoff', 'filt.res'], ['filt.cv', null]],
      jacks: [['jack.filt.in', 'jack.filt.cv', 'jack.filt.key', 'jack.filt.res'], ['out:filt.out', 'out:filt.bp', 'out:filt.hp']] },
    { id: 'sh', title: 'S&H', rows: [['sh.rate', 'sh.lag']], jacks: [['jack.sh.in', 'jack.sh.clock', 'out:sh.out']] },
  ],
  [
    { id: 'env1', title: 'ENV 1', rows: [['env1.a', 'env1.d'], ['env1.s', 'env1.r']], jacks: [['jack.env1.gate', 'out:env1.out', 'out:env1.inv']] },
    { id: 'env2', title: 'ENV 2', rows: [['env2.a', 'env2.d'], ['env2.s', 'env2.r']], jacks: [['jack.env2.gate', 'out:env2.out', 'out:env2.inv']] },
  ],
  [
    { id: 'lfo', title: 'Dual LFO', rowTitles: ['LFO 1', 'LFO 2'], rows: [['lfo.rate', 'lfo.shape', 'lfo.rcv'], ['lfo2.rate', 'lfo2.shape', null]],
      jacks: [['#1', 'jack.lfo.gate', 'jack.lfo.rate', 'out:lfo.out'], ['#2', 'jack.lfo2.gate', 'out:lfo2.out']] },
    { id: 'ring', title: 'Ring Mod', rows: [], jacks: [['jack.ring.a', 'jack.ring.b', 'out:ring.out']] },
  ],
  [
    { id: 'vca', title: 'Dual VCA', rowTitles: ['VCA 1', 'VCA 2'], rows: [['vca1.level', 'vca1.cv'], ['vca2.level', 'vca2.cv']],
      jacks: [['#1', 'jack.vca1.in', 'jack.vca1.cv', 'out:vca1.out'], ['#2', 'jack.vca2.in', 'jack.vca2.cv', 'out:vca2.out']] },
    { id: 'att', title: 'Attenuverter', rows: [['att.a1', 'att.a2']], jacks: [['#1', 'jack.att.in1', 'out:att.out1'], ['#2', 'jack.att.in2', 'out:att.out2']] },
    // the output is just a patch point (with a light that shows when it is being limited)
    { id: 'out', title: 'Output', rows: [], jacks: [['jack.out.in']] },
  ],
];
export const KEYBED_SECTIONS = [{ id: 'kb', title: 'Keyboard', rows: [['kb.glide']], jacks: [['out:kb.pitch', 'out:kb.gate', 'out:kb.trig']] }];

// ---- factory patches: what differs from the starting patch --------------------------------
const UNPATCHED = Object.fromEntries(Object.keys(PARAMS).filter((id) => id.startsWith('jack.')).map((id) => [id, '']));
const cable = (input, output) => ({ ['jack.' + input]: output });
export const PRESETS = {
  'Init': {},
  'No Cables': { ...UNPATCHED },
  'PWM Strings': {
    ...cable('mix.in1', 'vco1.sq'), ...cable('mix.in2', 'vco2.sq'), ...cable('vco1.pwm', 'lfo.out'), ...cable('vco2.pwm', 'lfo.out'),
    'osc1.pwm': 0.7, 'osc2.pwm': 0.6, 'lfo.rate': 0.6, 'lfo.shape': 'sine', 'osc2.tune': 0.12,
    'env1.a': 0.4, 'env1.r': 0.8, 'filt.cutoff': 2500, 'filt.cv': 0.1,
  },
  'Sync Lead': {
    ...cable('vco2.sync', 'vco1.saw'), ...cable('vco2.fm', 'env2.out'), ...cable('mix.in1', ''), 'mix.l2': 0.8,
    'osc2.range': 1, 'osc2.tune': 0, 'osc2.fm': 0.6, 'env2.d': 0.8, 'env2.s': 0.3, 'filt.cutoff': 3000, 'filt.cv': 0.2,
  },
  'Random Bleeps': {
    ...cable('filt.cv', 'sh.out'), 'sh.rate': 6, 'filt.cutoff': 800, 'filt.res': 0.7, 'filt.cv': 0.5,
  },
  'Random Wander': {
    ...cable('filt.cv', 'sh.out'), 'sh.rate': 1.5, 'sh.lag': 0.6, 'filt.cutoff': 700, 'filt.res': 0.5, 'filt.cv': 0.45, 'env1.a': 0.2, 'env1.r': 0.6,
  },
  'Thin Highpass': {
    ...cable('vca1.in', 'filt.hp'), 'filt.cutoff': 900, 'filt.res': 0.4, 'filt.cv': 0,
  },
  'Noise Hat': {
    ...cable('mix.in1', 'noise.col'), ...cable('mix.in2', ''), 'noise.colour': 0.6, 'mix.l1': 0.8,
    'filt.cutoff': 9000, 'filt.res': 0.3, 'filt.cv': 0, 'env1.a': 0.001, 'env1.d': 0.08, 'env1.s': 0, 'env1.r': 0.05,
  },
  'Tremolo Pad': {
    ...cable('vca2.in', 'vca1.out'), ...cable('vca2.cv', 'lfo.out'), ...cable('out.in', 'vca2.out'),
    'vca2.level': 0.6, 'vca2.cv': 0.4, 'lfo.rate': 5, 'lfo.shape': 'sine', 'env1.a': 0.3, 'env1.r': 0.6, 'filt.cutoff': 1800,
  },
  'Pitch Drop Drum': {
    ...cable('vco1.fm', 'env2.out'), ...cable('mix.in2', ''), ...cable('vco1.pitch', ''), 'osc1.range': -1, 'osc1.fm': 0.7,
    'env1.a': 0.001, 'env1.d': 0.35, 'env1.s': 0, 'env1.r': 0.3, 'env2.a': 0.001, 'env2.d': 0.12, 'env2.s': 0, 'filt.cutoff': 3000, 'filt.cv': 0,
  },
};

export const NFMOD = {
  id: 'nfmod',
  name: 'NF-Modular',
  brandSub: 'MODULAR SYNTHESIZER',
  skin: 'modular',
  module: 'js/worklet/nfmod-processor.js',
  processor: 'nfmod-processor',
  lessons: false,
  modular: true,
  OUTPUTS,
  card: {
    tagline: 'The full rack',
    text: 'Two VCOs, noise, a mixer, a filter, two envelopes, an LFO, sample & hold and two VCAs, all patched with cables. For when the MiniModular feels small.',
  },
  PARAMS, LAYOUT, KEYBED_SECTIONS, PRESETS,
};
