// NF-Modular: the full modular rack, for students who have learnt to patch on the MiniModular.
// Three rows of modules:
//   sources     two VCOs (saw, pulse and triangle at once; pulse width, FM, PWM, sync), Noise
//               (white, pink and a Colour output), a four-input Mixer that goes to 11
//   shaping     a VCF with low-, band- and high-pass outputs spread by Width, Ring Mod,
//               Dual VCA, Attenuverter (with an inverter) and the Output
//   modulation  two ENVs (with inverted outputs), Dual LFO (a classic one, and one up to 100 Hz
//               with linear or through-zero FM), Sample & Hold
// plus the keyboard's Pitch, Gate and Trigger.
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
  'sh.out': { label: 'Out', module: 'S&H' },
  'vca1.out': { label: 'Out', module: 'VCA 1' },
  'vca2.out': { label: 'Out', module: 'VCA 2' },
  'ring.out': { label: 'Out', module: 'Ring Mod' },
  'att.out1': { label: 'Out', module: 'Attenuverter 1' },
  'att.out2': { label: 'Out', module: 'Attenuverter 2' },
  'att.inv': { label: 'Out', module: 'Inverter' },
};
const fullName = (out) => (OUTPUTS[out] ? `${OUTPUTS[out].module} ${OUTPUTS[out].label}` : 'nothing');
const jack = (label, def = '') => ({ type: 'jack', label, def, fmt: (v) => (v ? 'from ' + fullName(v) : 'not patched') });
const pick = (id, extra = {}) => ({ ...NF1_PARAMS[id], ...extra });
const level = (label, def) => ({ type: 'cont', label, min: 0, max: 1, def, curve: 'lin', fmt: fmtPct });
const bipolar = (label, def = 0) => ({ type: 'cont', label, min: -1, max: 1, def, curve: 'lin', unit: '%',
  fmt: (v) => (v > 0.005 ? '+' : '') + Math.round(v * 100) + '%',
  marks: [[-1, '−100'], [-0.5, '−50'], [0, '0'], [0.5, '+50'], [1, '+100']] });
const toggle = (label, a, b, def) => ({ type: 'step', ui: 'toggle', titled: true, label, def, options: [a, b] });
const tune = { type: 'cont', label: 'Tune', min: -7, max: 7, def: 0, curve: 'lin', unit: 'semi',
  fmt: (v) => (v > 0.005 ? '+' : '') + v.toFixed(2) + ' st', marks: [[-7, '−7'], [-5, '−5'], [0, '0'], [5, '+5'], [7, '+7']] };
const pw = { type: 'cont', label: 'PW', min: 0.05, max: 0.95, def: 0.5, curve: 'lin', unit: '%',
  fmt: (v) => Math.round(v * 100) + '%', marks: [[0.05, '5'], [0.25, '25'], [0.5, '50'], [0.75, '75'], [0.95, '95']] };
const fmAmt = { type: 'cont', label: 'FM Amt', min: 0, max: 1, def: 0, curve: 'pow', k: 2, fmt: fmtPct };
// mixer levels go to 11: 10 is full level, past that the mix is pushed into its Mode (Drive or Fold)
const mixLevel = (label, def) => ({ type: 'cont', label, min: 0, max: 1.5, def, curve: 'lin', fmt: (v) => (v * 10).toFixed(1),
  marks: [[0, '0'], [0.2, '2'], [0.4, '4'], [0.6, '6'], [0.8, '8'], [1, '10'], [1.5, '11']] });
// VCF cutoff: stored in Hz (20 Hz - 20 kHz, log), shown as a percentage of the knob's travel
const cutPct = (v) => Math.log(v / 20) / Math.log(1000);
const env = (n, a, d, s, r) => ({
  [`env${n}.a`]: pick('aenv.a', { def: a }), [`env${n}.d`]: pick('aenv.d', { def: d }),
  [`env${n}.s`]: pick('aenv.s', { def: s }), [`env${n}.r`]: pick('aenv.r', { def: r }),
});
const LFO_SHAPES = [
  { v: 'sine', label: 'sine', icon: 'sine' }, { v: 'tri', label: 'triangle', icon: 'tri' },
  { v: 'saw', label: 'ramp', icon: 'saw' }, { v: 'square', label: 'square', icon: 'square' }];

export const PARAMS = {
  'kb.glide': pick('ctrl.glide'),

  'osc1.range': pick('osc1.range'), 'osc1.tune': { ...tune }, 'osc1.pw': { ...pw },
  'osc1.fm': { ...fmAmt }, 'osc1.pwm': level('PWM Amt', 0),
  'osc2.range': pick('osc1.range'), 'osc2.tune': { ...tune, def: 0.08 }, 'osc2.pw': { ...pw },
  'osc2.fm': { ...fmAmt }, 'osc2.pwm': level('PWM Amt', 0),

  'noise.colour': { ...bipolar('Colour'), marks: [[-1, 'dark'], [0, 'white'], [1, 'bright']], unit: '',
    fmt: (v) => (Math.abs(v) < 0.03 ? 'white' : v < 0 ? `darker ${Math.round(-v * 100)}%` : `brighter ${Math.round(v * 100)}%`) },

  'mix.l1': mixLevel('Level 1', 0.7), 'mix.l2': mixLevel('Level 2', 0.6), 'mix.l3': mixLevel('Level 3', 0), 'mix.l4': mixLevel('Level 4', 0),
  'mix.mode': { type: 'step', label: 'Mode', def: 'clean', span: 120,
    options: [{ v: 'clean', label: 'Clean' }, { v: 'drive', label: 'Drive' }, { v: 'fold', label: 'Fold' }] },

  // VCF: Cutoff is the centre; Width spreads the high-pass below it and the low-pass above it,
  // and the band-pass output is the band between them
  'vcf.cutoff': { type: 'cont', label: 'Cutoff', min: 20, max: 20000, def: 1200, curve: 'log', unit: '%',
    fmt: (v) => Math.round(cutPct(v) * 100) + '%', marks: [0, 25, 50, 75, 100].map((p) => [20 * Math.pow(1000, p / 100), String(p)]) },
  'vcf.res': pick('filt.res', { def: 0.2 }),
  'vcf.width': { type: 'cont', label: 'Width', min: 0, max: 6, def: 0, curve: 'lin', unit: 'oct',
    fmt: (v) => v.toFixed(1) + ' oct', marks: [0, 2, 4, 6].map((o) => [o, String(o)]) },
  'vcf.cv': bipolar('CV Amount', 0.35),

  'ring.mix': { ...level('Mix', 1), fmt: (v) => (v < 0.02 ? 'A only' : v > 0.98 ? 'A × B' : Math.round(v * 100) + '% ring'),
    marks: [[0, 'A'], [1, 'A×B']], unit: '' },

  'vca1.level': level('Level 1', 0), 'vca1.cv': level('CV Amt 1', 1),
  'vca2.level': level('Level 2', 0), 'vca2.cv': level('CV Amt 2', 1),

  'att.a1': bipolar('Amount 1'),
  'att.a2': bipolar('Amount 2'),

  ...env(1, 0.005, 0.3, 0.7, 0.25),
  ...env(2, 0.005, 0.5, 0.2, 0.3),

  // LFO 1: the classic one, up to 30 Hz, its speed movable by the Rate input
  'lfo.rate': pick('lfo.rate', { label: 'Rate 1', def: 5 }),
  'lfo.shape': pick('lfo.shape', { label: 'Shape 1', options: LFO_SHAPES, def: 'tri' }),
  'lfo.rcv': level('Rate CV', 0),
  // LFO 2: up to 100 Hz (into the audio range), with FM (linear, or through zero) and a choice of
  // bipolar (-1..1) or unipolar (0..1) output
  'lfo2.rate': { type: 'cont', label: 'Rate 2', min: 0.05, max: 100, def: 0.3, curve: 'log', unit: 'Hz',
    fmt: NF1_PARAMS['lfo.rate'].fmt, marks: [[0.05, '.05'], [0.5, '.5'], [5, '5'], [100, '100']] },
  'lfo2.shape': pick('lfo.shape', { label: 'Shape 2', options: LFO_SHAPES, def: 'tri' }),
  'lfo2.fm': { ...fmAmt, label: 'FM Amt' },
  'lfo2.fmmode': toggle('FM', { v: 'lin', label: 'Lin' }, { v: 'tz', label: 'TZ' }, 'lin'),
  'lfo2.pol': toggle('Output', { v: 'bi', label: 'Bi' }, { v: 'uni', label: 'Uni' }, 'bi'),

  'sh.rate': { ...NF1_PARAMS['lfo.rate'], label: 'Speed', def: 4 },
  'sh.lag': { type: 'cont', label: 'Lag', min: 0, max: 2, def: 0, curve: 'pow', k: 2, unit: 'sec',
    fmt: (v) => (v < 0.001 ? 'off' : v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s'),
    marks: [[0, '0'], [0.1, '.1'], [0.5, '.5'], [1, '1'], [2, '2']] },

  'out.vol': { ...level('Volume', 0.8) }, // no knob: the output is just a patch point

  // ---- input jacks, with the starting patch: two detuned saws, mixed, filtered, with an
  // envelope on the VCA and a second envelope opening the filter
  'jack.vco1.pitch': jack('Pitch', 'kb.pitch'), 'jack.vco1.fm': jack('FM'), 'jack.vco1.pwm': jack('PWM'), 'jack.vco1.sync': jack('Sync'),
  'jack.vco2.pitch': jack('Pitch', 'kb.pitch'), 'jack.vco2.fm': jack('FM'), 'jack.vco2.pwm': jack('PWM'), 'jack.vco2.sync': jack('Sync'),
  'jack.mix.in1': jack('In 1', 'vco1.saw'), 'jack.mix.in2': jack('In 2', 'vco2.saw'), 'jack.mix.in3': jack('In 3'), 'jack.mix.in4': jack('In 4'),
  'jack.filt.in': jack('In', 'mix.out'), 'jack.filt.cv': jack('CV', 'env2.out'), 'jack.filt.key': jack('Key'), 'jack.filt.res': jack('Res'),
  'jack.ring.a': jack('In A'), 'jack.ring.b': jack('In B'),
  'jack.vca1.in': jack('In', 'filt.out'), 'jack.vca1.cv': jack('CV', 'env1.out'),
  'jack.vca2.in': jack('In'), 'jack.vca2.cv': jack('CV'),
  'jack.att.in1': jack('In'), 'jack.att.in2': jack('In'), 'jack.att.inv': jack('In'),
  'jack.out.in': jack('In', 'vca1.out'),
  'jack.env1.gate': jack('Gate', 'kb.gate'), 'jack.env2.gate': jack('Gate', 'kb.gate'),
  'jack.lfo.gate': jack('Gate'), 'jack.lfo.rate': jack('Rate'), 'jack.lfo2.gate': jack('Gate'), 'jack.lfo2.fm': jack('FM'),
  'jack.sh.in': jack('In'), 'jack.sh.clock': jack('Clock'),
};

// Panel: a rack of three rows (sources, shaping, modulation). Each module has one row of knobs
// and one row of jacks; '#x' labels a group of jacks, 'out:<id>' is an output socket.
export const LAYOUT = [
  [
    { id: 'vco1', title: 'VCO 1', rows: [['osc1.range', 'osc1.tune', 'osc1.pw', 'osc1.fm', 'osc1.pwm']],
      jacks: ['jack.vco1.pitch', 'jack.vco1.fm', 'jack.vco1.pwm', 'jack.vco1.sync', 'out:vco1.saw', 'out:vco1.sq', 'out:vco1.tri'] },
    { id: 'vco2', title: 'VCO 2', rows: [['osc2.range', 'osc2.tune', 'osc2.pw', 'osc2.fm', 'osc2.pwm']],
      jacks: ['jack.vco2.pitch', 'jack.vco2.fm', 'jack.vco2.pwm', 'jack.vco2.sync', 'out:vco2.saw', 'out:vco2.sq', 'out:vco2.tri'] },
    { id: 'noise', title: 'Noise', rows: [['noise.colour']], jacks: ['out:noise.white', 'out:noise.pink', 'out:noise.col'] },
    { id: 'mix', title: 'Mixer', rows: [['mix.l1', 'mix.l2', 'mix.l3', 'mix.l4', 'mix.mode']],
      jacks: ['jack.mix.in1', 'jack.mix.in2', 'jack.mix.in3', 'jack.mix.in4', 'out:mix.out'] },
  ],
  [
    { id: 'filt', title: 'VCF', rows: [['vcf.cutoff', 'vcf.res', 'vcf.width', 'vcf.cv']],
      jacks: ['jack.filt.in', 'jack.filt.cv', 'jack.filt.key', 'jack.filt.res', 'out:filt.out', 'out:filt.bp', 'out:filt.hp'] },
    { id: 'ring', title: 'Ring Mod', rows: [['ring.mix']], jacks: ['jack.ring.a', 'jack.ring.b', 'out:ring.out'] },
    { id: 'vca', title: 'Dual VCA', rows: [['vca1.level', 'vca1.cv', 'vca2.level', 'vca2.cv']],
      jacks: ['#1', 'jack.vca1.in', 'jack.vca1.cv', 'out:vca1.out', '#2', 'jack.vca2.in', 'jack.vca2.cv', 'out:vca2.out'] },
    { id: 'att', title: 'Attenuverter', rows: [['att.a1', 'att.a2']],
      jacks: ['#1', 'jack.att.in1', 'out:att.out1', '#2', 'jack.att.in2', 'out:att.out2', '#−', 'jack.att.inv', 'out:att.inv'] },
    // the output is just a patch point (with a light that shows when it is being limited)
    { id: 'out', title: 'Output', rows: [], jacks: ['jack.out.in'] },
  ],
  [
    { id: 'env1', title: 'ENV 1', rows: [['env1.a', 'env1.d', 'env1.s', 'env1.r']], jacks: ['jack.env1.gate', 'out:env1.out', 'out:env1.inv'] },
    { id: 'env2', title: 'ENV 2', rows: [['env2.a', 'env2.d', 'env2.s', 'env2.r']], jacks: ['jack.env2.gate', 'out:env2.out', 'out:env2.inv'] },
    { id: 'lfo', title: 'Dual LFO', rows: [['lfo.rate', 'lfo.shape', 'lfo.rcv', 'lfo2.rate', 'lfo2.shape', 'lfo2.fm', 'lfo2.fmmode', 'lfo2.pol']],
      jacks: ['#1', 'jack.lfo.gate', 'jack.lfo.rate', 'out:lfo.out', '#2', 'jack.lfo2.gate', 'jack.lfo2.fm', 'out:lfo2.out'] },
    { id: 'sh', title: 'S&H', rows: [['sh.rate', 'sh.lag']], jacks: ['jack.sh.in', 'jack.sh.clock', 'out:sh.out'] },
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
    'env1.a': 0.4, 'env1.r': 0.8, 'vcf.cutoff': 2500, 'vcf.cv': 0.1,
  },
  'Sync Lead': {
    ...cable('vco2.sync', 'vco1.saw'), ...cable('vco2.fm', 'env2.out'), ...cable('mix.in1', ''), 'mix.l2': 0.8,
    'osc2.range': 1, 'osc2.tune': 0, 'osc2.fm': 0.6, 'env2.d': 0.8, 'env2.s': 0.3, 'vcf.cutoff': 3000, 'vcf.cv': 0.2,
  },
  'Random Bleeps': {
    ...cable('filt.cv', 'sh.out'), 'sh.rate': 6, 'vcf.cutoff': 800, 'vcf.res': 0.7, 'vcf.cv': 0.5,
  },
  'Random Wander': {
    ...cable('filt.cv', 'sh.out'), 'sh.rate': 1.5, 'sh.lag': 0.6, 'vcf.cutoff': 700, 'vcf.res': 0.5, 'vcf.cv': 0.45, 'env1.a': 0.2, 'env1.r': 0.6,
  },
  'Thin Highpass': {
    ...cable('vca1.in', 'filt.hp'), 'vcf.cutoff': 900, 'vcf.res': 0.4, 'vcf.cv': 0,
  },
  'Vocal Band': {
    ...cable('vca1.in', 'filt.bp'), ...cable('filt.cv', 'lfo.out'), 'vcf.cutoff': 900, 'vcf.width': 1.5, 'vcf.res': 0.55, 'vcf.cv': 0.25,
    'lfo.rate': 0.8, 'lfo.shape': 'sine',
  },
  'Noise Hat': {
    ...cable('mix.in1', 'noise.col'), ...cable('mix.in2', ''), 'noise.colour': 0.6, 'mix.l1': 0.8,
    'vcf.cutoff': 9000, 'vcf.res': 0.3, 'vcf.cv': 0, 'env1.a': 0.001, 'env1.d': 0.08, 'env1.s': 0, 'env1.r': 0.05,
  },
  'Ring Bells': {
    ...cable('ring.a', 'vco1.sq'), ...cable('ring.b', 'vco2.tri'), ...cable('mix.in1', 'ring.out'), ...cable('mix.in2', ''),
    'osc2.range': 1, 'osc2.tune': 3.86, 'vcf.cutoff': 6000, 'vcf.cv': 0, 'env1.a': 0.001, 'env1.d': 1.5, 'env1.s': 0, 'env1.r': 1.2,
  },
  'Tremolo Pad': {
    ...cable('vca2.in', 'vca1.out'), ...cable('vca2.cv', 'lfo.out'), ...cable('out.in', 'vca2.out'),
    'vca2.level': 0.6, 'vca2.cv': 0.4, 'lfo.rate': 5, 'lfo.shape': 'sine', 'env1.a': 0.3, 'env1.r': 0.6, 'vcf.cutoff': 1800,
  },
  'Pitch Drop Drum': {
    ...cable('vco1.fm', 'env2.out'), ...cable('mix.in2', ''), ...cable('vco1.pitch', ''), 'osc1.range': -1, 'osc1.fm': 0.7,
    'env1.a': 0.001, 'env1.d': 0.35, 'env1.s': 0, 'env1.r': 0.3, 'env2.a': 0.001, 'env2.d': 0.12, 'env2.s': 0, 'vcf.cutoff': 3000, 'vcf.cv': 0,
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
  rack: true, // LAYOUT is rows of modules, not columns
  OUTPUTS,
  card: {
    tagline: 'The full rack',
    text: 'Two VCOs, noise, a mixer, a multimode filter, ring mod, two VCAs, an attenuverter, two envelopes, two LFOs and sample & hold, all patched with cables. For when the MiniModular feels small.',
  },
  PARAMS, LAYOUT, KEYBED_SECTIONS, PRESETS,
};
