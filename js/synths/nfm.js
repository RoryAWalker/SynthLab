// MiniModular: a first modular synth. One of each basic module (LFO, Oscillator, Filter,
// Envelope, VCA, Output) plus the keyboard's Pitch and Gate outputs, all joined by patch cables.
// It opens with a simple patch already in place, so it makes a sound before anyone patches.
//
// Cables are stored in the patch like any other setting: each INPUT jack is a param
// ('jack.<module>.<input>') whose value is the output plugged into it ('' = nothing).
// An output can feed any number of inputs; each input takes one cable.

import { PARAMS as NF1_PARAMS, fmtPct } from './nf1.js';

// Outputs: id -> label on the panel / in help, and the module it belongs to.
export const OUTPUTS = {
  'kb.pitch': { label: 'Pitch', module: 'Keyboard' },
  'kb.gate':  { label: 'Gate', module: 'Keyboard' },
  'lfo.out':  { label: 'Out', module: 'LFO' },
  'osc.out':  { label: 'Out', module: 'VCO' },
  'filt.out': { label: 'Out', module: 'VCF' },
  'env.out':  { label: 'Out', module: 'Envelope' },
  'vca.out':  { label: 'Out', module: 'VCA' },
};
const fullName = (out) => (OUTPUTS[out] ? `${OUTPUTS[out].module} ${OUTPUTS[out].label}` : 'nothing');

// an input jack; def: the output patched into it when the synth opens
const jack = (label, def = '') => ({ type: 'jack', label, def, fmt: (v) => (v ? 'from ' + fullName(v) : 'not patched') });

const pick = (id, extra = {}) => ({ ...NF1_PARAMS[id], ...extra });

export const PARAMS = {
  // keyboard
  'kb.glide':    pick('ctrl.glide'),
  'kb.mode':     pick('ctrl.mode'), // Mono: every new key restarts the Gate; Legato: overlapping keys keep it high

  // LFO
  'lfo.rate':    pick('lfo.rate', { def: 5 }),
  // the three basic shapes (no random step on this simple synth)
  'lfo.shape':   pick('lfo.shape', { options: NF1_PARAMS['lfo.shape'].options.filter((o) => o.v !== 'sh') }),

  // oscillator
  'osc1.range':  pick('osc1.range'),
  'osc1.wave':   pick('osc1.wave', { def: 'saw' }),
  'osc1.tune':   { type: 'cont', label: 'Tune', min: -7, max: 7, def: 0, curve: 'lin', unit: 'semi',
                   fmt: (v) => (v > 0.005 ? '+' : '') + v.toFixed(2) + ' st',
                   marks: [[-7, '−7'], [-5, '−5'], [0, '0'], [5, '+5'], [7, '+7']] },
  'osc.fm':      { type: 'cont', label: 'FM Amount', min: 0, max: 1, def: 0, curve: 'pow', k: 2, fmt: fmtPct },

  // filter
  'filt.cutoff': pick('filt.cutoff', { def: 1800 }),
  'filt.res':    pick('filt.res', { def: 0.15 }),
  'filt.cv':     { type: 'cont', label: 'CV Amount', min: -1, max: 1, def: 0, curve: 'lin', unit: '%',
                   fmt: (v) => (v > 0.005 ? '+' : '') + Math.round(v * 100) + '%',
                   marks: [[-1, '−100'], [-0.5, '−50'], [0, '0'], [0.5, '+50'], [1, '+100']] },

  // envelope (an ADSR; the 'aenv' ids give it the NF-1's envelope graph)
  'aenv.a':      pick('aenv.a', { def: 0.005 }),
  'aenv.d':      pick('aenv.d', { def: 0.3 }),
  'aenv.s':      pick('aenv.s', { def: 0.7 }),
  'aenv.r':      pick('aenv.r', { def: 0.25 }),

  // VCA and output
  'vca.level':   { type: 'cont', label: 'Level', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
  'out.vol':     { type: 'cont', label: 'Volume', min: 0, max: 1, def: 0.8, curve: 'lin', fmt: fmtPct },

  // ---- patch cables (input jacks), with the starting patch
  'jack.lfo.gate':  jack('Gate'),
  'jack.osc.pitch': jack('Pitch', 'kb.pitch'),
  'jack.osc.fm':    jack('FM'),
  'jack.filt.in':   jack('In', 'osc.out'),
  'jack.filt.cv':   jack('CV'),
  'jack.env.gate':  jack('Gate', 'kb.gate'),
  'jack.vca.in':    jack('In', 'filt.out'),
  'jack.vca.cv':    jack('CV', 'env.out'),
  'jack.out.in':    jack('In', 'vca.out'),
};

// Panel: one module per section. 'jacks' is the row of sockets along the bottom of a module:
// input ids are params (jack.*); 'out:<id>' is an output socket.
export const LAYOUT = [
  [{ id: 'osc', title: 'VCO', rows: [['osc1.range', 'osc1.wave'], ['osc1.tune', 'osc.fm']], jacks: ['jack.osc.pitch', 'jack.osc.fm', 'out:osc.out'] }],
  [{ id: 'filt', title: 'VCF', rows: [['filt.cutoff', 'filt.res'], ['filt.cv', null]], jacks: ['jack.filt.in', 'jack.filt.cv', 'out:filt.out'] }],
  // the two modulators side by side
  [{ id: 'lfo', title: 'LFO', rows: [['lfo.rate'], ['lfo.shape']], jacks: ['jack.lfo.gate', 'out:lfo.out'] }],
  [{ id: 'env', title: 'ENV', rows: [['aenv.a', 'aenv.d'], ['aenv.s', 'aenv.r']], jacks: ['jack.env.gate', 'out:env.out'] }],
  [{ id: 'vca', title: 'VCA', rows: [['vca.level'], [null]], jacks: ['jack.vca.in', 'jack.vca.cv', 'out:vca.out'] }],
  [{ id: 'out', title: 'Output', rows: [['out.vol'], [null]], jacks: ['jack.out.in'] }],
];
export const KEYBED_SECTIONS = [{ id: 'kb', title: '', rows: [['kb.glide', 'kb.mode']], jacks: ['out:kb.pitch', 'out:kb.gate'] }];

// ---- factory patches: what differs from the starting patch -------------------------------
export const UNPATCHED = Object.fromEntries(Object.keys(PARAMS).filter((id) => id.startsWith('jack.')).map((id) => [id, '']));
export const PRESETS = {
  'Init': {},
  'No Cables': { ...UNPATCHED },
  'Vibrato': { 'jack.osc.fm': 'lfo.out', 'osc.fm': 0.08, 'lfo.rate': 5.5 },
  'Filter Sweep': { 'jack.filt.cv': 'env.out', 'filt.cv': 0.6, 'filt.cutoff': 150, 'filt.res': 0.5, 'aenv.d': 0.6, 'aenv.s': 0.3 },
  'Wah Wobble': { 'jack.filt.cv': 'lfo.out', 'filt.cv': 0.4, 'filt.cutoff': 500, 'filt.res': 0.6, 'lfo.rate': 3 },
  'Drone': { 'jack.vca.cv': '', 'vca.level': 0.8, 'jack.osc.pitch': '', 'osc1.range': -1 },
  'Siren': { 'jack.osc.fm': 'lfo.out', 'osc.fm': 0.1, 'lfo.rate': 2.8, 'lfo.shape': 'square', 'osc1.wave': 'square', 'filt.cutoff': 5600, 'filt.res': 0 },
};

export const NFM = {
  id: 'nfm',
  name: 'MiniModular',
  brandSub: 'MODULAR SYNTHESIZER',
  skin: 'modular',
  module: 'js/worklet/mod-processor.js',
  processor: 'mod-processor',
  lessons: true,
  modular: true,
  OUTPUTS,
  card: {
    tagline: 'Your first modular',
    text: 'One oscillator, filter, envelope, VCA and LFO, joined by patch cables you drag between the jacks. It starts with a simple patch, so it plays straight away.',
  },
  PARAMS, LAYOUT, KEYBED_SECTIONS, PRESETS,
};
