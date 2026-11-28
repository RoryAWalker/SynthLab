// NF-ModRack: an open modular rack. Three rows (tiers), like the NF-Modular's case, but you choose
// what goes in: as many oscillators, filters, envelopes... as fit. The Keyboard, Sequencer and
// Output are always there. Modules come out of the module drawer (see js/rackEdit.js).
//
// Each module in the rack is an instance of a module type, named by type and number (vco1, vco2,
// vcf1...). Its controls are '<instance>.<control>', its inputs 'jack.<instance>.<input>' and its
// outputs '<instance>.<output>'. The rack itself is the patch setting 'rack.layout': the three
// rows of instance ids, e.g. 'vco1,vco2,mix1|vcf1,vca1,out|env1,env2,lfo1'. So a saved patch
// keeps its modules, their settings and their cables together.
//
// The modules are the NF-Modular's: their controls, sounds and help are shared with it (each
// type names the NF-Modular module it comes from).

import { DEFAULT_SHAPE, valid as validShape, parse as parseShape } from '../drawShape.js';
import { valid as validTable, tableName } from '../wavetables.js';
import { PARAMS as NFP, OUTPUTS as NFO, LAYOUT as NF_LAYOUT, KEYBED_SECTIONS, SIDE_SECTIONS } from './nfmod.js';

// The rack: three rows, each this wide (in the panel's own pixels: the NF-Modular's rows) with
// this gap between modules.
export const ROW_WIDTH = 1573;
// The rack can be made wider, one rack's width (a bay) at a time ('rack.bays', 1-8): its rows scroll
export const MAX_BAYS = 8;
export const rowWidth = (bays = 1) => ROW_WIDTH * bays + GAP * (bays - 1);
export const GAP = 8;
export const ROWS = 3;

// Module types. For each:
//   name, desc          as shown in the drawer
//   w                   width in the rack (panel pixels)
//   p / j               the NF-Modular module its controls (p) and sockets (j) come from
//   params, ins, outs   its controls, inputs and outputs (an output may be [name, NF-Modular output])
//   rows, jacks         its panel: rows of controls, and its sockets ('out:' marks an output)
//   help                the NF-Modular help entry for the whole module
export const TYPES = {
  vco: { name: 'VCO', desc: 'Oscillator: saw, pulse and triangle at once, with FM, PWM and sync.', w: 436, p: 'osc1', j: 'vco1', help: 'vco1',
    params: ['range', 'tune', 'pw', 'fm', 'pwm'], ins: ['pitch', 'fm', 'pwm', 'sync'], outs: ['saw', 'sq', 'tri'] },
  noise: { name: 'Noise', desc: 'White and pink noise, and a Colour output from dark to bright.', w: 241, p: 'noise', j: 'noise', help: 'noise',
    params: ['colour'], ins: ['cv'], outs: ['white', 'pink', 'col'] },
  mix: { name: 'Mixer', desc: 'Four inputs into one, with levels that go to 11, Drive and Fold.', w: 436, p: 'mix', j: 'mix', help: 'mix',
    params: ['l1', 'l2', 'l3', 'l4', 'mode'], ins: ['in1', 'in2', 'in3', 'in4'], outs: ['out'] },
  vcf: { name: 'VCF', desc: 'Filter: low-, band- and high-pass at once, spread by Width.', w: 406, p: 'vcf', j: 'filt', help: 'filt',
    params: ['cutoff', 'res', 'width', 'cv'], ins: ['in', 'cv', 'key', 'res'], outs: [['lp', 'filt.out'], 'bp', 'hp'] },
  ring: { name: 'Ring Mod', desc: 'Multiplies two signals: bells, clangs and tremolo.', w: 186, p: 'ring', j: 'ring', help: 'ring',
    params: ['mix'], ins: ['a', 'b'], outs: ['out'] },
  vca: { name: 'VCA', desc: 'Amplifier: opens by hand (Level) or by a control signal (CV).', w: 186, p: 'vca1', j: 'vca1', help: 'vca',
    params: ['level', 'cv'], ins: ['in', 'cv'], outs: ['out'] },
  att: { name: 'Attenuverter', desc: 'Two channels that scale, flip or (with nothing in) make a steady voltage.', w: 271, p: 'att', j: 'att', help: 'att',
    params: ['a1', 'a2'], ins: ['in1', 'in2'], outs: ['out1', 'out2'] },
  env: { name: 'ENV', desc: 'Envelope (ADSR), Exponential or Linear, with an inverted output.', w: 352, p: 'env1', j: 'env1', help: 'env1',
    params: ['curve', 'a', 'd', 's', 'r'], ins: ['gate'], outs: ['out', 'inv'] },
  lfo: { name: 'LFO', desc: 'Low-frequency oscillator, up to 30 Hz, its speed movable by CV.', w: 268, p: 'lfo', j: 'lfo', help: 'lfo',
    params: ['rate', 'shape', 'rcv'], ins: ['gate', 'rate'], outs: ['out'] },
  mfo: { name: 'MFO', desc: 'Mid-frequency oscillator, up to 100 Hz, with linear or through-zero FM.', w: 352, p: 'lfo2', j: 'lfo2', help: 'mfo',
    params: ['rate', 'shape', 'fm', 'fmmode', 'pol'], ins: ['gate', 'fm'], outs: ['out'] },
  sh: { name: 'S&H', desc: 'Sample & Hold: random steps, or samples whatever is in its In.', w: 186, p: 'sh', j: 'sh', help: 'sh',
    params: ['rate', 'lag'], ins: ['in', 'clock'], outs: ['out'] },
  // the NF-ModRack's own modules (not from the NF-Modular): their controls are defined below
  ping: { name: 'Ping', desc: 'Strike it and it rings: a bank of tuned resonators, from drum skin to bell, with feedback.', w: 688, p: 'ping', j: 'ping', help: 'ping',
    params: ['range', 'tune', 'decay', 'partials', 'stretch', 'tone', 'drive', 'fb'], ins: ['pitch', 'strike', 'in', 'fb', 'stretch', 'drive'], outs: ['out'] },
  string: { name: 'String', desc: 'Pluck it: a string modelled as a wave going round a tuned loop, with feedback.', w: 520, p: 'string', j: 'string', help: 'string',
    params: ['range', 'tune', 'decay', 'tone', 'drive', 'fb'], ins: ['pitch', 'strike', 'in', 'fb', 'drive'], outs: ['out'] },
  wave: { name: 'Wave VCO', desc: 'An oscillator whose waveform you draw: one cycle, freehand or with nodes.', w: 698, p: 'wave', j: 'wave', help: 'wave',
    params: ['nodes', 'range', 'tune', 'fm'], ins: ['pitch', 'fm', 'sync'], outs: ['out'] },
  poly: { name: 'Poly', desc: 'The keyboard\'s notes on separate outputs (Pitch and Gate 1-4), for chords: paraphonic, or polyphonic built by hand.', w: 241, p: 'poly', j: 'poly', help: 'poly',
    params: ['voices'], ins: [], outs: ['p1', 'p2', 'p3', 'p4', 'g1', 'g2', 'g3', 'g4'] },
  shaper: { name: 'Shaper', desc: 'Distortion you draw: the curve that turns each input level into an output level, clipped or folded.', w: 578, p: 'shaper', j: 'shaper', help: 'shaper',
    params: ['curve', 'drive', 'edge', 'mix'], ins: ['in', 'drive'], outs: ['out'] },
  quant: { name: 'Quantizer', desc: 'Snaps a pitch to the notes of a scale, so random or hand-played pitches play in tune.', w: 496, p: 'quant', j: 'quant', help: 'quant',
    params: ['mask', 'root'], ins: ['in'], outs: ['out', 'trig'] },
  chance: { name: 'Chance', desc: 'A coin toss for every gate or trigger: it goes to Out, or (if it loses) to Else.', w: 186, p: 'chance', j: 'chance', help: 'chance',
    params: ['chance'], ins: ['in'], outs: ['out', 'else'] },
  probe: { name: 'Probe', desc: 'A small oscilloscope: patch any signal in to see it (two traces), and on through Thru.', w: 496, p: 'probe', j: 'probe', help: 'probe',
    params: ['view', 'time', 'scale'], ins: ['a', 'b'], outs: ['thru'] },
  organ: { name: 'Drawbars', desc: 'Additive, like a tonewheel organ: nine sine waves on drawbars, each of which can be retuned.', w: 606, p: 'organ', j: 'organ', help: 'organ',
    params: ['bank', 'range', 'tune', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`d${n}`, `t${n}`])], ins: ['pitch'], outs: ['out'] },
  table: { name: 'Wavetable', desc: 'An oscillator that sweeps through a table of waves: built-in ones, or any audio file you load.', w: 662, p: 'table', j: 'table', help: 'table',
    params: ['table', 'pos', 'range', 'tune', 'fm'], ins: ['pitch', 'pos', 'fm', 'sync'], outs: ['out'] },
  formant: { name: 'Formant', desc: 'Makes any sound talk: three filters tuned like a voice, sweeping A, E, I, O, U.', w: 352, p: 'formant', j: 'formant', help: 'formant',
    params: ['vowel', 'shift', 'res', 'mix'], ins: ['in', 'vowel', 'shift'], outs: ['out'] },
  xy: { name: 'XY', desc: 'A pad to play two control signals at once by hand, and record your movements to loop them.', w: 480, p: 'xy', j: 'xy', help: 'xy',
    params: ['mode', 'path', 'x', 'y', 'touch', 'rate', 'smooth', 'pol'], ins: ['gate'], outs: ['x', 'y', 'gate'] },
  bounce: { name: 'Bounce', desc: 'A bouncing ball: its height as a control signal, and a trigger at every bounce. Loops, or swings back and forth.', w: 498, p: 'bounce', j: 'bounce', help: 'bounce',
    params: ['mode', 'view', 'time', 'bounce', 'height'], ins: ['gate', 'time', 'bounce'], outs: ['out', 'hit', 'end'] },
  draw: { name: 'Draw', desc: 'Draw any shape: a custom envelope (Once), or loop it round or bounce it back and forth as an LFO.', w: 682, p: 'draw', j: 'draw', help: 'draw',
    params: ['mode', 'nodes', 'time', 'amt', 'pol'], ins: ['gate', 'time'], outs: ['out', 'end'] },
};

// ---- Ping and String: the resonators ---------------------------------------------------------
// Both ring when struck at Strike, for Decay. Ping: a bank of tuned resonators, one per partial,
// partial n at the pitch times n^Stretch, Tone setting how loud the upper ones are. String: a
// plucked string (a delay line one period long, fed back into itself), Tone setting how bright.
// Feedback sends their own sound back in: past about 90% they sing on by themselves.
const secs = (v) => (v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(v < 10 ? 2 : 1) + ' s');
const pct = (v) => Math.round(v * 100) + '%';
// what Stretch makes, by name (the nearest of these, if close)
export const MATERIALS = [[0.67, 'drum skin'], [1, 'harmonic'], [1.5, 'struck bar'], [2, 'stiff rod']];
const material = (s) => { const m = MATERIALS.find(([v]) => Math.abs(v - s) < 0.04); return m ? ` (${m[1]})` : ''; };
// Ping's partials: their frequencies (times the pitch) and loudness. The engine (modrack-processor.js) uses the same sums.
export const pingPartial = (n, stretch, tone) => ({ ratio: Math.pow(n, stretch), level: Math.pow(n, -4 * (1 - tone)) });
const common = {
  range: { ...NFP['osc1.range'] },
  tune: { ...NFP['osc1.tune'] },
  decay: { type: 'cont', label: 'Decay', min: 0.02, max: 10, def: 1.2, curve: 'log', unit: 'sec', fmt: secs,
    marks: [[0.02, '.02'], [0.1, '.1'], [0.5, '.5'], [2, '2'], [10, '10']] },
  // past 100%: too far, on purpose (the red part of the scale)
  fb: { type: 'cont', label: 'Feedback', min: 0, max: 1.5, def: 0, curve: 'lin', unit: '%', zone: [1, 1.5],
    fmt: (v) => pct(v) + (v > 1.005 ? ' (too far)' : v >= 0.9 ? ' (sings on)' : ''),
    marks: [[0, '0'], [0.5, '50'], [0.9, 'sing'], [1.2, '120'], [1.5, '150']] },
  drive: { type: 'cont', label: 'Drive', min: 0, max: 1, def: 0, curve: 'lin', unit: '%', fmt: (v) => (v < 0.005 ? 'clean' : pct(v)),
    marks: [[0, 'clean'], [0.5, '50'], [1, '100']] },
};
const commonIns = {
  pitch: { ...NFP['jack.vco1.pitch'] },
  strike: { ...NFP['jack.vco1.fm'], label: 'Strike' },
  in: { ...NFP['jack.mix.in1'], label: 'In' },
  fb: { ...NFP['jack.vco1.fm'], label: 'FB' },
  drive: { ...NFP['jack.vco1.fm'], label: 'Drive' },
};
TYPES.ping.specs = {
  params: { ...common,
    partials: { type: 'step', label: 'Partials', def: 4, span: 240, options: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ v: n, label: String(n) })) },
    stretch: { type: 'cont', label: 'Stretch', min: 0.5, max: 2, def: 1.5, curve: 'lin', unit: '',
      fmt: (v) => '×n^' + v.toFixed(2) + material(v), marks: [[0.5, '.5'], [0.67, 'drum'], [1, 'harm'], [1.5, 'bar'], [2, 'rod']] },
    tone: { type: 'cont', label: 'Tone', min: 0, max: 1, def: 0.5, curve: 'lin', unit: '%', fmt: pct, marks: [[0, 'pure'], [0.5, '50'], [1, 'all']] },
  },
  ins: { ...commonIns, stretch: { ...NFP['jack.vco1.fm'], label: 'Stretch' } },
  outs: { out: { label: 'Out', audio: true } },
};
// Formant: three band-pass filters at the formants (resonances) of a voice singing a vowel. Vowel
// glides through A E I O U; Shift moves all three together (a larger or smaller voice).
// The formants (Hz) and their levels: average adult values; the engine has the same table.
export const VOWELS = [
  { name: 'A', f: [730, 1090, 2440], g: [1, 0.6, 0.22] },  // as in "father"
  { name: 'E', f: [530, 1840, 2480], g: [1, 0.35, 0.25] }, // "bed"
  { name: 'I', f: [270, 2290, 3010], g: [1, 0.25, 0.2] },  // "beet"
  { name: 'O', f: [570, 840, 2410], g: [1, 0.5, 0.1] },    // "bought"
  { name: 'U', f: [300, 870, 2240], g: [1, 0.25, 0.08] },  // "boot"
];
// the formants at a Vowel setting (0..4, gliding between neighbours) and Shift (octaves)
export function formantsAt(vowel, shift) {
  const v = Math.min(4, Math.max(0, vowel)), i = Math.min(3, Math.floor(v)), t = v - i;
  const a = VOWELS[i], b = VOWELS[i + 1], k = Math.pow(2, shift);
  return [0, 1, 2].map((n) => ({ f: Math.exp(Math.log(a.f[n]) * (1 - t) + Math.log(b.f[n]) * t) * k, g: a.g[n] * (1 - t) + b.g[n] * t }));
}
const vowelName = (v) => { const i = Math.round(v); return Math.abs(v - i) < 0.08 ? VOWELS[i].name : `${VOWELS[Math.floor(v)].name}→${VOWELS[Math.min(4, Math.floor(v) + 1)].name}`; };
TYPES.formant.specs = {
  params: {
    vowel: { type: 'cont', label: 'Vowel', min: 0, max: 4, def: 0, curve: 'lin', unit: '', fmt: vowelName,
      marks: VOWELS.map((v, i) => [i, v.name]) },
    shift: { type: 'cont', label: 'Shift', min: -1, max: 1, def: 0, curve: 'lin', unit: 'oct',
      fmt: (v) => (Math.abs(v) < 0.01 ? '0 (adult)' : (v > 0 ? '+' : '') + v.toFixed(2) + ' oct' + (v > 0.4 ? ' (small)' : v < -0.4 ? ' (large)' : '')),
      marks: [[-1, '−1'], [-0.5, '−.5'], [0, '0'], [0.5, '+.5'], [1, '+1']] },
    res: { type: 'cont', label: 'Res', min: 0, max: 1, def: 0.5, curve: 'lin', unit: '%', fmt: pct, marks: [[0, 'soft'], [0.5, '50'], [1, 'sharp']] },
    mix: { type: 'cont', label: 'Mix', min: 0, max: 1, def: 1, curve: 'lin', unit: '%', fmt: (v) => (v < 0.005 ? 'dry' : v > 0.995 ? 'all formant' : pct(v)),
      marks: [[0, 'dry'], [0.5, '50'], [1, 'wet']] },
  },
  ins: { in: { ...NFP['jack.mix.in1'], label: 'In' }, vowel: { ...NFP['jack.vco1.fm'], label: 'Vowel' }, shift: { ...NFP['jack.vco1.fm'], label: 'Shift' } },
  outs: { out: { label: 'Out', audio: true } },
};
// XY: a pad. x, y: where the puck is (0..1, set by hand); touch: 1 while a finger is on the pad;
// path: a recorded movement ("duration;x,y;x,y;..." at a steady 50 points a second). Rate: how fast the recording plays; Smooth: a glide on the outputs.
const validPath = (v) => typeof v === 'string' && v.length < 40000 && /^(\d+(\.\d+)?)?(;\d(\.\d+)?,\d(\.\d+)?)*$/.test(v);
TYPES.xy.specs = {
  params: {
    mode: { type: 'step', ui: 'word', label: 'XY mode', def: 'live', options: [{ v: 'live', label: 'Live' }, { v: 'loop', label: 'Loop' }, { v: 'once', label: 'Once' }] },
    path: { type: 'nodes', ui: 'xy', label: 'Pad', def: '', valid: validPath,
      fmt: (v) => { const n = v ? v.split(';').length - 1 : 0; return n ? `recording: ${(Number(v.split(';')[0]) || 0).toFixed(1)} s` : 'no recording'; } },
    x: { type: 'cont', label: 'X', min: 0, max: 1, def: 0.5, curve: 'lin', unit: '', fmt: (v) => v.toFixed(2) },
    y: { type: 'cont', label: 'Y', min: 0, max: 1, def: 0.5, curve: 'lin', unit: '', fmt: (v) => v.toFixed(2) },
    touch: { type: 'step', label: 'Touch', def: 0, options: [{ v: 0, label: 'off' }, { v: 1, label: 'on' }] },
    rate: { type: 'cont', label: 'Rate', min: 0.25, max: 4, def: 1, curve: 'log', unit: '×', fmt: (v) => v.toFixed(2) + '×',
      marks: [[0.25, '¼'], [0.5, '½'], [1, '1'], [2, '2'], [4, '4']] },
    smooth: { type: 'cont', label: 'Smooth', min: 0, max: 1, def: 0.03, curve: 'pow', k: 2, unit: 'sec',
      fmt: (v) => (v < 0.002 ? 'off' : v < 1 ? Math.round(v * 1000) + ' ms' : '1 s'), marks: [[0, '0'], [0.1, '.1'], [0.5, '.5'], [1, '1']] },
    pol: { type: 'step', ui: 'toggle', titled: true, label: 'Output', def: 'bi', options: [{ v: 'uni', label: 'Uni' }, { v: 'bi', label: 'Bi' }] },
  },
  ins: { gate: { ...NFP['jack.env1.gate'] } },
  outs: { x: { label: 'X' }, y: { label: 'Y' }, gate: { label: 'Gate' } },
};
// Shaper: the transfer curve (drawn: across is the input level, -1..1; up the output), Drive (how hard
// the input is pushed into it), Edge (past the ends: Clip holds the last level, Fold mirrors back), Mix
export const DEFAULT_CURVE = '-1;0,0,0.4;0.5,0.5,-0.4;1,1,0';
TYPES.shaper.specs = {
  params: {
    curve: { type: 'nodes', ui: 'nodes', cycle: true, transfer: true, screen: [300, 178], label: 'Curve', def: DEFAULT_CURVE, valid: validShape,
      fmt: (v) => { const s = parseShape(v); return s ? `${s.nodes.length} nodes` : 'curve'; } },
    drive: { type: 'cont', label: 'Drive', min: 1, max: 20, def: 1, curve: 'log', unit: '×', fmt: (v) => v.toFixed(v < 10 ? 1 : 0) + '×',
      marks: [[1, '1'], [2, '2'], [5, '5'], [10, '10'], [20, '20']] },
    edge: { type: 'step', ui: 'toggle', titled: true, label: 'Edge', def: 'clip', options: [{ v: 'clip', label: 'Clip' }, { v: 'fold', label: 'Fold' }] },
    mix: { type: 'cont', label: 'Mix', min: 0, max: 1, def: 1, curve: 'lin', unit: '%', fmt: (v) => (v < 0.005 ? 'dry' : pct(v)), marks: [[0, 'dry'], [0.5, '50'], [1, 'wet']] },
  },
  ins: { in: { ...NFP['jack.mix.in1'], label: 'In' }, drive: { ...NFP['jack.vco1.fm'], label: 'Drive' } },
  outs: { out: { label: 'Out', audio: true } },
};
// Quantizer: the scale (which of the 12 notes, from the root: a string of 1s and 0s) and its root note
export const SCALES = [
  ['Chromatic', '111111111111'], ['Major', '101011010101'], ['Minor', '101101011010'], ['Major pentatonic', '101010010100'],
  ['Minor pentatonic', '100101010010'], ['Blues', '100101110010'], ['Dorian', '101101010110'], ['Harmonic minor', '101101011001'],
  ['Whole tone', '101010101010'], ['Octaves', '100000000000'], ['Fifths', '100000010000'],
];
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
TYPES.quant.specs = {
  params: {
    mask: { type: 'nodes', ui: 'scale', label: 'Scale', def: '101011010101', valid: (v) => typeof v === 'string' && /^[01]{12}$/.test(v) && v.includes('1'),
      fmt: (v) => (SCALES.find(([, m]) => m === v) || ['Your own scale'])[0] },
    root: { type: 'step', label: 'Root', def: 0, span: 300, options: NOTE_NAMES.map((n, i) => ({ v: i, label: n })) },
  },
  ins: { in: { ...NFP['jack.vco1.pitch'], label: 'In' } },
  outs: { out: { label: 'Out' }, trig: { label: 'Trig' } },
};
// Chance: how likely each gate is to go to Out (the rest go to Else)
TYPES.chance.specs = {
  params: {
    chance: { type: 'cont', label: 'Chance', min: 0, max: 1, def: 0.5, curve: 'lin', unit: '%', fmt: (v) => Math.round(v * 100) + '% to Out',
      marks: [[0, '0'], [0.25, '25'], [0.5, '50'], [0.75, '75'], [1, '100']] },
  },
  ins: { in: { ...NFP['jack.env1.gate'], label: 'In' } },
  outs: { out: { label: 'Out' }, else: { label: 'Else' } },
};
// Probe: Time (what the screen spans: 1 ms to 10 s) and Scale (the screen's top and bottom: +-0.5 to +-10)
TYPES.probe.specs = {
  params: {
    view: { type: 'view', ui: 'probe', label: 'Screen', def: '', fmt: () => '' },
    time: { type: 'cont', label: 'Time', min: 0.001, max: 10, def: 0.02, curve: 'log', unit: 'sec',
      fmt: (v) => (v < 1 ? (v < 0.01 ? (v * 1000).toFixed(1) : Math.round(v * 1000)) + ' ms' : v.toFixed(v < 10 ? 1 : 0) + ' s'),
      marks: [[0.001, '1m'], [0.01, '10m'], [0.1, '.1'], [1, '1'], [10, '10']] },
    scale: { type: 'step', label: 'Scale', def: 1, span: 200, options: [0.5, 1, 2, 5, 10].map((v) => ({ v, label: '±' + v })) },
  },
  ins: { a: { ...NFP['jack.vco1.fm'], label: 'A' }, b: { ...NFP['jack.vco1.fm'], label: 'B' } },
  outs: { thru: { label: 'Thru' } },
};
// Drawbars: nine sine waves at the organ's footages (16' is an octave below the note, 8' the note,
// 4' an octave above...), each pulled out 0-8 (d1-d9) and retuned up to +-12 semitones (t1-t9). The
// drawbars and their tuning boxes are one control on the panel (the 'bank': js/drawbarBank.js).
export const FOOTAGES = [
  ['16′', 0.5, 'brown'], ['5⅓′', 1.5, 'brown'], ['8′', 1, 'white'], ['4′', 2, 'white'], ['2⅔′', 3, 'black'],
  ['2′', 4, 'white'], ['1⅗′', 5, 'black'], ['1⅓′', 6, 'black'], ['1′', 8, 'white'],
];
TYPES.organ.specs = {
  params: {
    bank: { type: 'view', ui: 'drawbars', label: 'Drawbars', def: '', fmt: () => '' },
    range: { ...NFP['osc1.range'] }, tune: { ...NFP['osc1.tune'] },
    ...Object.fromEntries(FOOTAGES.flatMap(([ft], i) => [
      [`d${i + 1}`, { type: 'cont', label: `Drawbar ${ft}`, min: 0, max: 8, def: i < 3 ? 8 : 0, curve: 'lin', unit: '', fmt: (v) => String(Math.round(v)) }],
      [`t${i + 1}`, { type: 'cont', label: `Tuning ${ft}`, min: -12, max: 12, def: 0, curve: 'lin', unit: 'semi',
        fmt: (v) => (Math.abs(v) < 0.005 ? 'in tune' : (v > 0 ? '+' : '') + v.toFixed(2) + ' st') }],
    ])),
  },
  ins: { pitch: { ...NFP['jack.vco1.pitch'] } },
  outs: { out: { label: 'Out', audio: true } },
};
// Poly: how many channels it uses (so that notes only go where something is patched)
TYPES.poly.specs = {
  params: {
    // (a word in the title: click it to change)
    voices: { type: 'step', ui: 'word', label: 'Voices', def: 4, options: [4, 1, 2, 3].map((n) => ({ v: n, label: `${n} voice${n > 1 ? 's' : ''}` })) },
  },
  ins: {},
  outs: Object.fromEntries([1, 2, 3, 4].flatMap((n) => [[`p${n}`, { label: `Pitch ${n}` }], [`g${n}`, { label: `Gate ${n}` }]])),
};
// Wavetable: the table (a built-in one, or made from an audio file: see wavetables.js), Position in it
TYPES.table.specs = {
  params: {
    table: { type: 'nodes', ui: 'table', label: 'Table', def: 'b:basic', valid: validTable, fmt: (v) => tableName(v) },
    pos: { type: 'cont', label: 'Position', min: 0, max: 1, def: 0, curve: 'lin', unit: '%', fmt: pct, marks: [[0, 'first'], [0.5, '50'], [1, 'last']] },
    range: { ...NFP['osc1.range'] }, tune: { ...NFP['osc1.tune'] }, fm: { ...NFP['osc1.fm'] },
  },
  ins: { pitch: { ...NFP['jack.vco1.pitch'] }, pos: { ...NFP['jack.vco1.fm'], label: 'Position' }, fm: { ...NFP['jack.vco1.fm'] }, sync: { ...NFP['jack.vco1.sync'] } },
  outs: { out: { label: 'Out', audio: true } },
};
// Wave VCO: one cycle of the waveform, drawn (the middle line is 0; the top +1, the bottom -1)
export const DEFAULT_WAVE = '-1;0,0.5,-0.35;0.25,1,0.35;0.5,0.5,-0.35;0.75,0,0.35;1,0.5,0';
TYPES.wave.specs = {
  params: {
    nodes: { type: 'nodes', ui: 'nodes', cycle: true, screen: [420, 178], label: 'Waveform', def: DEFAULT_WAVE, valid: validShape,
      fmt: (v) => { const s = parseShape(v); return s ? `${s.nodes.length} nodes` : 'waveform'; } },
    range: { ...NFP['osc1.range'] }, tune: { ...NFP['osc1.tune'] }, fm: { ...NFP['osc1.fm'] },
  },
  ins: { pitch: { ...NFP['jack.vco1.pitch'] }, fm: { ...NFP['jack.vco1.fm'] }, sync: { ...NFP['jack.vco1.sync'] } },
  outs: { out: { label: 'Out', audio: true } },
};
// Bounce: Time (the first fall), Bounce (how much speed each bounce keeps), Height (where it is
// dropped from); its screen (view) shows the ball and where it has been
TYPES.bounce.specs = {
  params: {
    mode: { type: 'step', ui: 'word', label: 'Bounce mode', def: 'once', options: [{ v: 'once', label: 'Once' }, { v: 'loop', label: 'Loop' }, { v: 'swing', label: 'Swing' }] },
    view: { type: 'view', ui: 'bounce', label: 'Ball', def: '', fmt: () => '' },
    time: { type: 'cont', label: 'Time', min: 0.02, max: 5, def: 0.5, curve: 'log', unit: 'sec', fmt: (v) => (v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s'),
      marks: [[0.02, '.02'], [0.1, '.1'], [0.5, '.5'], [2, '2'], [5, '5']] },
    bounce: { type: 'cont', label: 'Bounce', min: 0, max: 0.98, def: 0.7, curve: 'lin', unit: '%', fmt: (v) => (v < 0.005 ? 'dead (no bounce)' : pct(v)),
      marks: [[0, 'dead'], [0.5, '50'], [0.98, 'super']] },
    height: { type: 'cont', label: 'Height', min: 0.05, max: 1, def: 1, curve: 'lin', unit: '%', fmt: pct, marks: [[0.05, '5'], [0.5, '50'], [1, '100']] },
  },
  ins: { gate: { ...NFP['jack.env1.gate'] }, time: { ...NFP['jack.vco1.fm'], label: 'Time' }, bounce: { ...NFP['jack.vco1.fm'], label: 'Bounce' } },
  outs: { out: { label: 'Out' }, hit: { label: 'Hit' }, end: { label: 'End' } },
};
// Draw: the shape (nodes), how long it takes (Time: 1 ms to 30 s, so it is an envelope or an LFO),
// Amount, and Uni (0..1) or Bi (-1..1)
const fmtTime = (v) => (v < 1 ? (v < 0.01 ? (v * 1000).toFixed(1) : Math.round(v * 1000)) + ' ms' : v.toFixed(v < 10 ? 2 : 1) + ' s');
TYPES.draw.specs = {
  params: {
    mode: { type: 'step', ui: 'word', label: 'Draw mode', def: 'once', options: [{ v: 'once', label: 'Once' }, { v: 'loop', label: 'Loop' }, { v: 'bounce', label: 'Bounce' }] },
    nodes: { type: 'nodes', ui: 'nodes', label: 'Shape', def: DEFAULT_SHAPE, valid: validShape,
      fmt: (v) => { const s = parseShape(v); return s ? `${s.nodes.length} nodes${s.sus >= 0 ? ', sustain at node ' + (s.sus + 1) : ''}` : 'shape'; } },
    time: { type: 'cont', label: 'Time', min: 0.001, max: 30, def: 1, curve: 'log', unit: 'sec', fmt: fmtTime,
      marks: [[0.001, '1m'], [0.01, '10m'], [0.1, '.1'], [1, '1'], [10, '10'], [30, '30']] },
    amt: { type: 'cont', label: 'Amount', min: 0, max: 1, def: 1, curve: 'lin', unit: '%', fmt: pct, marks: [[0, '0'], [0.5, '50'], [1, '100']] },
    pol: { type: 'step', ui: 'toggle', titled: true, label: 'Output', def: 'uni', options: [{ v: 'uni', label: 'Uni' }, { v: 'bi', label: 'Bi' }] },
  },
  ins: { gate: { ...NFP['jack.env1.gate'] }, time: { ...NFP['jack.vco1.fm'], label: 'Time' } },
  outs: { out: { label: 'Out' }, end: { label: 'End' } },
};
TYPES.string.specs = {
  params: { ...common,
    tone: { type: 'cont', label: 'Tone', min: 0, max: 1, def: 0.5, curve: 'lin', unit: '%', fmt: pct, marks: [[0, 'dark'], [0.5, '50'], [1, 'bright']] },
  },
  ins: commonIns,
  outs: { out: { label: 'Out', audio: true } },
};
// The order of the drawer: sources, shaping, modulation
export const DRAWER = [['Sources', ['poly', 'vco', 'wave', 'table', 'organ', 'noise', 'ping', 'string', 'mix']], ['Shaping', ['vcf', 'formant', 'shaper', 'ring', 'vca', 'att']], ['Modulation', ['env', 'draw', 'bounce', 'xy', 'lfo', 'mfo', 'sh', 'quant', 'chance']], ['Tools', ['probe']]];
// always in the rack: the Output (in a row, and can be moved), the Keyboard (on the keyboard) and
// the Sequencer (its own column)
const OUT_W = 100;
export const FIXED = ['out'];

// the panel of each type: rows of controls and its sockets (names, before the instance prefix)
const PANELS = {
  vco: { rows: [['range', 'tune', 'pw', 'fm', 'pwm']], jacks: ['pitch', 'fm', 'pwm', 'sync', 'out:saw', 'out:sq', 'out:tri'] },
  noise: { rows: [['colour']], jacks: ['cv', 'out:white', 'out:pink', 'out:col'] },
  mix: { rows: [['l1', 'l2', 'l3', 'l4', 'mode']], jacks: ['in1', 'in2', 'in3', 'in4', 'out:out'] },
  vcf: { rows: [['cutoff', 'res', 'width', 'cv']], jacks: ['in', 'cv', 'key', 'res', 'out:lp', 'out:bp', 'out:hp'] },
  ring: { rows: [['mix']], jacks: ['a', 'b', 'out:out'] },
  vca: { rows: [['level', 'cv']], jacks: ['in', 'cv', 'out:out'] },
  att: { parts: [{ rows: [['a1']], jacks: ['in1', 'out:out1'] }, { rows: [['a2']], jacks: ['in2', 'out:out2'] }] },
  env: { titleSwitch: 'curve', rows: [['a', 'd', 's', 'r']], jacks: ['gate', 'out:out', 'out:inv'] },
  lfo: { rows: [['rate', 'shape', 'rcv']], jacks: ['gate', 'rate', 'out:out'] },
  mfo: { rows: [['rate', 'shape', 'fm', ['fmmode', 'pol']]], jacks: ['gate', 'fm', 'out:out'] },
  sh: { rows: [['rate', 'lag']], jacks: ['in', 'clock', 'out:out'] },
  ping: { rows: [['range', 'tune', 'decay', 'partials', 'stretch', 'tone', 'drive', 'fb']], jacks: ['pitch', 'strike', 'in', 'fb', 'stretch', 'drive', 'out:out'] },
  string: { rows: [['range', 'tune', 'decay', 'tone', 'drive', 'fb']], jacks: ['pitch', 'strike', 'in', 'fb', 'drive', 'out:out'] },
  // the pad on the left, its knobs and sockets beside it
  xy: { titleSwitch: 'mode', screen: 'path', jacksBeside: true, rows: [['rate', 'smooth', 'pol']], jacks: ['gate', 'out:x', 'out:y', 'out:gate'] },
  formant: { rows: [['vowel', 'shift', 'res', 'mix']], jacks: ['in', 'vowel', 'shift', 'out:out'] },
  shaper: { screen: 'curve', jacksBeside: true, rows: [['drive', 'mix', 'edge']], jacks: ['in', 'drive', 'out:out'] },
  quant: { screen: 'mask', jacksBeside: true, rows: [['root']], jacks: ['in', 'out:out', 'out:trig'] },
  chance: { rows: [['chance']], jacks: ['in', 'out:out', 'out:else'] },
  probe: { screen: 'view', jacksBeside: true, rows: [['time', 'scale']], jacks: ['a', 'b', 'out:thru'] },
  // the drawbars (with their tuning boxes) on the left; Range, Tune and the sockets beside them
  organ: { screen: 'bank', jacksBeside: true, rows: [['range', 'tune']], jacks: ['pitch', 'out:out'] },
  // its outputs in two rows: the four Pitches over the four Gates
  poly: { titleSwitch: 'voices', rows: [], jacks: [['out:p1', 'out:p2', 'out:p3', 'out:p4'], ['out:g1', 'out:g2', 'out:g3', 'out:g4']] },
  table: { screen: 'table', jacksBeside: true, rows: [['pos', 'range', 'tune', 'fm']], jacks: ['pitch', 'pos', 'fm', 'sync', 'out:out'] },
  // its sockets under its knobs, beside the drawing screen, so the screen has the module's whole height
  wave: { screen: 'nodes', jacksBeside: true, rows: [['range', 'tune', 'fm']], jacks: ['pitch', 'fm', 'sync', 'out:out'] },
  bounce: { titleSwitch: 'mode', screen: 'view', rows: [['time', 'bounce', 'height']], jacks: ['gate', 'time', 'bounce', 'out:out', 'out:hit', 'out:end'] },
  // the drawing screen on the left, its knobs beside it
  draw: { titleSwitch: 'mode', screen: 'nodes', rows: [['time', 'amt', 'pol']], jacks: ['gate', 'time', 'out:out', 'out:end'] },
};

// 'vco12' -> ['vco', 12]; the fixed modules have no number
export function typeOf(inst) {
  const m = /^([a-z]+)(\d+)$/.exec(inst);
  return m && TYPES[m[1]] ? [m[1], Number(m[2])] : [null, 0];
}
const outName = (o) => (Array.isArray(o) ? o[0] : o);
const outSrc = (t, o) => (Array.isArray(o) ? o[1] : `${t.j}.${o}`);
export const widthOf = (inst) => (inst === 'out' ? OUT_W : TYPES[typeOf(inst)[0]] ? TYPES[typeOf(inst)[0]].w : 0);

// ---- the rack layout -------------------------------------------------------------------
// 'a,b|c|d' -> [['a','b'],['c'],['d']], keeping only real modules, each once, the Output always
// present, and no row wider than the rack (a module that doesn't fit is dropped).
export function parseLayout(str, bays = 1) {
  const W = rowWidth(bays);
  const seen = new Set();
  const rows = String(str || '').split('|').slice(0, ROWS).map((r) => r.split(',').map((s) => s.trim()).filter((id) => {
    if (seen.has(id) || !(id === 'out' || typeOf(id)[0])) return false;
    seen.add(id);
    return true;
  }));
  while (rows.length < ROWS) rows.push([]);
  if (!seen.has('out')) rows[1].push('out');
  return rows.map((row) => {
    let used = 0;
    return row.filter((id) => {
      const w = widthOf(id) + (used ? GAP : 0);
      if (id !== 'out' && used + w > W) return false;
      used += w;
      return true;
    });
  });
}
export const layoutString = (rows) => rows.map((r) => r.join(',')).join('|');
export const rowUsed = (row) => row.reduce((a, id, i) => a + widthOf(id) + (i ? GAP : 0), 0);
export const fits = (row, inst, bays = 1) => rowUsed(row) + (row.length ? GAP : 0) + widthOf(inst) <= rowWidth(bays);
// the lowest free number for a new module of this type
export function newId(rows, type) {
  const used = new Set(rows.flat());
  let n = 1;
  while (used.has(type + n)) n++;
  return type + n;
}

// ---- controls, sockets and panel for a layout ------------------------------------------------
const jack = NFP['jack.vco1.fm']; // (an unpatched input; its label and audio colour are set per socket)
// The settings that are always there: Keyboard, Sequencer, Output and the rack itself
const FIXED_PARAMS = Object.fromEntries(Object.entries(NFP).filter(([id]) => /^(kb|seq|out)\.|^jack\.(seq|out)\./.test(id))
  .map(([id, spec]) => [id, spec.type === 'jack' ? { ...spec, def: '' } : spec]));
const FIXED_OUTPUTS = Object.fromEntries(Object.entries(NFO).filter(([id]) => /^(kb|seq)\./.test(id)));
const OUT_SECTION = NF_LAYOUT.flat().find((s) => s.id === 'out');

// One module's controls, inputs and outputs
// A module's name in the rack: just its kind ('VCO') when it is the only one of its kind, numbered
// ('VCO 1', 'VCO 2') when there are more. rows: the rack's rows of module ids.
export function moduleName(inst, rows) {
  const [type, n] = typeOf(inst);
  if (!type) return inst;
  const same = rows.flat().filter((id) => typeOf(id)[0] === type).length;
  return same > 1 ? `${TYPES[type].name} ${n}` : TYPES[type].name;
}

function moduleDef(inst, rows) {
  const [type, n] = typeOf(inst);
  const t = TYPES[type], name = moduleName(inst, rows);
  const params = {}, outputs = {};
  const own = t.specs; // a module of the NF-ModRack's own (the Resonator) has its own controls
  t.params.forEach((c) => { params[`${inst}.${c}`] = { ...(own ? own.params[c] : NFP[`${t.p}.${c}`]) }; });
  if (params[`${inst}.curve`] && type === 'env') params[`${inst}.curve`].label = `${name} shape`;
  t.ins.forEach((c) => { const src = own ? own.ins[c] : NFP[`jack.${t.j}.${c}`] || jack; params[`jack.${inst}.${c}`] = { ...src, def: '' }; });
  t.outs.forEach((o) => { const src = own ? own.outs[outName(o)] : NFO[outSrc(t, o)]; outputs[`${inst}.${outName(o)}`] = { ...src, module: name }; });
  const P = PANELS[type];
  const full = (c) => (Array.isArray(c) ? c.map(full) : `${inst}.${c}`);
  const sock = (c) => (Array.isArray(c) ? c.map(sock) : c.startsWith('out:') ? `out:${inst}.${c.slice(4)}` : `jack.${inst}.${c}`);
  const section = { id: inst, title: name, type, even: n % 2 === 0, removable: true };
  if (P.parts) section.parts = P.parts.map((part) => ({ rows: part.rows.map((r) => r.map(full)), jacks: part.jacks.map(sock) }));
  else { section.rows = P.rows.map((r) => r.map(full)); section.jacks = P.jacks.map(sock); }
  if (P.titleSwitch) section.titleSwitch = `${inst}.${P.titleSwitch}`;
  if (P.screen) section.screen = `${inst}.${P.screen}`;
  if (P.jacksBeside) section.jacksBeside = true;
  return { params, outputs, section };
}

// Everything for a layout string: PARAMS, OUTPUTS and the panel's rows of modules
export function build(layout, bays = 1) {
  const rows = parseLayout(layout === undefined ? DEFAULT_LAYOUT : layout, bays);
  // (the rack's own default is itself, so defaultPatch() keeps the modules it is given)
  const PARAMS = { ...FIXED_PARAMS, 'rack.layout': { type: 'layout', label: 'Rack', def: layoutString(rows) },
    'rack.bays': { type: 'step', label: 'Rack width', def: 1, options: Array.from({ length: MAX_BAYS }, (_, i) => ({ v: i + 1, label: `${i + 1} rack${i ? 's' : ''} wide` })) } };
  const OUTPUTS = { ...FIXED_OUTPUTS };
  const LAYOUT = rows.map((row) => row.map((inst) => {
    if (inst === 'out') return { ...OUT_SECTION, movable: true };
    const d = moduleDef(inst, rows);
    Object.assign(PARAMS, d.params);
    Object.assign(OUTPUTS, d.outputs);
    return d.section;
  }));
  return { rows, PARAMS, OUTPUTS, LAYOUT };
}

// ---- the starting rack and the presets -----------------------------------------------------
// Basic Synth, the fewest modules that make a playable synth: the Keyboard's Pitch plays a VCO, its Saw
// goes through a VCF and a VCA to the Output, and an ENV, started by the Keyboard's Gate, opens the VCA
// for each note.
export const DEFAULT_LAYOUT = 'vco1|vcf1,vca1,out|env1';
const BASIC_CABLES = {
  'jack.vco1.pitch': 'kb.pitch', 'jack.vcf1.in': 'vco1.saw', 'jack.vca1.in': 'vcf1.lp',
  'jack.vca1.cv': 'env1.out', 'jack.env1.gate': 'kb.gate', 'jack.out.in': 'vca1.out',
};
// the starting cables, for the starting rack (used by defaultPatch in params.js)
export const initCables = (patch) => (patch['rack.layout'] === DEFAULT_LAYOUT ? { ...BASIC_CABLES } : {});

export const INIT_NAME = 'Basic Synth'; // (the first preset, loaded by Init)
// ---- presets: what the NF-ModRack's own modules can do that the NF-Modular cannot --------------
const C = (input, output) => ({ ['jack.' + input]: output }); // a cable
// a recorded XY movement: a slow circle (2 s), as the pad would record it (50 points a second)
const CIRCLE = '2;' + Array.from({ length: 101 }, (_, i) => {
  const a = (i / 100) * Math.PI * 2, r = (v) => Math.round(v * 1000) / 1000;
  return `${r(0.5 + 0.4 * Math.cos(a))},${r(0.5 + 0.4 * Math.sin(a))}`;
}).join(';');
// a drawn shape in steps (Draw, with Snap): levels, one per step
const steps = (levels) => '-1;' + levels.flatMap((y, i) => [`${i / levels.length},${y},0`, `${(i + 1) / levels.length},${y},0`]).join(';');
export const PRESETS = {
  'Basic Synth': {},
  'Empty Rack': { 'rack.layout': '|out|' },
  // a String and a Ping struck together, both driven hard inside their rings, then into the Mixer at 11
  // on Drive: a huge, distorted, metallic pluck that the filter envelope closes down
  'Massive Pluck': {
    'rack.layout': 'string1,ping1|mix1,vcf1,vca1,out|env1,env2',
    ...C('string1.pitch', 'kb.pitch'), ...C('string1.strike', 'kb.trig'), ...C('ping1.pitch', 'kb.pitch'), ...C('ping1.strike', 'kb.trig'),
    ...C('mix1.in1', 'string1.out'), ...C('mix1.in2', 'ping1.out'), ...C('vcf1.in', 'mix1.out'), ...C('vcf1.cv', 'env2.out'),
    ...C('vca1.in', 'vcf1.lp'), ...C('vca1.cv', 'env1.out'), ...C('env1.gate', 'kb.gate'), ...C('env2.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'string1.drive': 1, 'string1.fb': 0.8, 'string1.tone': 0.85, 'string1.decay': 2.5,
    'ping1.drive': 1, 'ping1.fb': 0.6, 'ping1.partials': 3, 'ping1.stretch': 1, 'ping1.tone': 0.7, 'ping1.decay': 1.5, 'ping1.range': -1,
    'mix1.l1': 11, 'mix1.l2': 9, 'mix1.mode': 'drive', 'vcf1.cutoff': 1800, 'vcf1.res': 0.35, 'vcf1.cv': 0.45,
    'env1.a': 0.001, 'env1.d': 1.6, 'env1.s': 0.25, 'env1.r': 0.7, 'env2.a': 0.001, 'env2.d': 0.5, 'env2.s': 0.1, 'env2.r': 0.5, 'out.vol': 0.75,
  },
  // Ping with three partials at 1, 4 and 9 times the note (Stretch 2), like a marimba's tuned bars
  'Wooden Bars': {
    'rack.layout': 'ping1|out|',
    ...C('ping1.pitch', 'kb.pitch'), ...C('ping1.strike', 'kb.trig'), ...C('out.in', 'ping1.out'),
    'ping1.partials': 3, 'ping1.stretch': 2, 'ping1.tone': 0.45, 'ping1.decay': 0.9, 'out.vol': 0.9,
  },
  // drum-machine toms: one partial, driven, so each hit bends up and falls back; the Sequencer plays them
  'Ping Toms': {
    'rack.layout': 'ping1|out|',
    ...C('ping1.pitch', 'seq.pitch'), ...C('ping1.strike', 'seq.trig'), ...C('out.in', 'ping1.out'),
    'ping1.partials': 1, 'ping1.drive': 0.75, 'ping1.decay': 0.35, 'ping1.range': -1,
    'seq.run': 'run', 'seq.rate': 6, 'seq.s1': 0, 'seq.s2': -5, 'seq.s3': 0, 'seq.s4': 7, 'seq.s5': 0, 'seq.s6': -5, 'seq.s7': 3, 'seq.s8': -12, 'seq.g6': 'off', 'out.vol': 0.9,
  },
  // eight inharmonic partials singing on through Feedback, their spacing drifting slowly (an LFO on Stretch)
  'Gong Drone': {
    'rack.layout': 'ping1|att1,out|lfo1',
    ...C('ping1.pitch', 'kb.pitch'), ...C('ping1.strike', 'kb.trig'), ...C('att1.in1', 'lfo1.out'), ...C('ping1.stretch', 'att1.out1'), ...C('out.in', 'ping1.out'),
    'ping1.partials': 8, 'ping1.stretch': 1.27, 'ping1.tone': 0.8, 'ping1.decay': 6, 'ping1.fb': 0.95, 'ping1.drive': 0.35, 'ping1.range': -1,
    'att1.a1': 0.25, 'lfo1.rate': 0.12, 'lfo1.shape': 'sine', 'out.vol': 0.8,
  },
  // no strike at all: noise into Ping's In makes the partials sound bowed, swelling in with an envelope
  'Bowed Glass': {
    'rack.layout': 'noise1,ping1|vca1,out|env1',
    ...C('ping1.pitch', 'kb.pitch'), ...C('ping1.in', 'noise1.white'), ...C('vca1.in', 'ping1.out'), ...C('vca1.cv', 'env1.out'),
    ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'ping1.partials': 4, 'ping1.stretch': 1.08, 'ping1.tone': 0.55, 'ping1.decay': 3, 'ping1.range': 1,
    'env1.a': 0.8, 'env1.d': 0.5, 'env1.s': 1, 'env1.r': 1.5, 'out.vol': 0.9,
  },
  // a String pushed too far (Feedback past 100%): a raw, screaming sustain, like a guitar feeding back
  'Screaming String': {
    'rack.layout': 'string1|vca1,out|env1',
    ...C('string1.pitch', 'kb.pitch'), ...C('string1.strike', 'kb.trig'), ...C('vca1.in', 'string1.out'), ...C('vca1.cv', 'env1.out'),
    ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'string1.fb': 1.3, 'string1.drive': 0.6, 'string1.tone': 0.6, 'string1.decay': 2,
    'env1.a': 0.005, 'env1.d': 0.3, 'env1.s': 1, 'env1.r': 0.25, 'out.vol': 0.7,
  },
  // a drawn shape, looping, moves the Formant's Vowel: the bass "says" a word on every note
  'Talking Bass': {
    'rack.layout': 'vco1,formant1|vca1,env1,out|draw1',
    ...C('vco1.pitch', 'kb.pitch'), ...C('formant1.in', 'vco1.saw'), ...C('formant1.vowel', 'draw1.out'), ...C('draw1.gate', 'kb.gate'),
    ...C('vca1.in', 'formant1.out'), ...C('vca1.cv', 'env1.out'), ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'vco1.range': -1, 'formant1.vowel': 0, 'formant1.res': 0.7,
    'draw1.mode': 'loop', 'draw1.time': 0.6, 'draw1.nodes': '-1;0,0.9,-0.4;0.3,0.2,0.3;0.55,1,0;0.8,0.45,0;1,0.9,0',
    'env1.a': 0.003, 'env1.d': 0.4, 'env1.s': 0.8, 'env1.r': 0.15, 'out.vol': 0.6,
  },
  // a recorded circle on the XY pad, looping: X sweeps the filter, Y its resonance
  'XY Filter Dance': {
    'rack.layout': 'vco1,vco2,mix1|vcf1,vca1,out|env1,xy1',
    ...C('vco1.pitch', 'kb.pitch'), ...C('vco2.pitch', 'kb.pitch'), ...C('mix1.in1', 'vco1.saw'), ...C('mix1.in2', 'vco2.saw'),
    ...C('vcf1.in', 'mix1.out'), ...C('vcf1.cv', 'xy1.x'), ...C('vcf1.res', 'xy1.y'), ...C('vca1.in', 'vcf1.lp'), ...C('vca1.cv', 'env1.out'),
    ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'vco2.tune': 0.1, 'mix1.l1': 7, 'mix1.l2': 6, 'vcf1.cutoff': 700, 'vcf1.res': 0.45, 'vcf1.cv': 0.45,
    'xy1.mode': 'loop', 'xy1.path': CIRCLE, 'xy1.smooth': 0.05, 'env1.a': 0.02, 'env1.s': 0.9, 'env1.r': 0.5,
  },
  // a slow LFO sweeps Position through the Harmonics table: the harmonics come in and go out one by one
  'Wavetable Sweep': {
    'rack.layout': 'table1|vca1,out|env1,lfo1',
    ...C('table1.pitch', 'kb.pitch'), ...C('table1.pos', 'lfo1.out'), ...C('vca1.in', 'table1.out'), ...C('vca1.cv', 'env1.out'),
    ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'table1.table': 'b:harmonics', 'table1.pos': 0.5, 'lfo1.rate': 0.25, 'lfo1.shape': 'tri', 'env1.a': 0.05, 'env1.s': 1, 'env1.r': 0.8,
  },
  // every note drops a ball onto a bell: each bounce strikes the Ping, softer and faster
  'Bouncing Bell': {
    'rack.layout': 'ping1|bounce1,out|',
    ...C('ping1.pitch', 'kb.pitch'), ...C('ping1.strike', 'bounce1.hit'), ...C('bounce1.gate', 'kb.gate'), ...C('out.in', 'ping1.out'),
    'ping1.partials': 5, 'ping1.stretch': 1.4, 'ping1.tone': 0.6, 'ping1.decay': 1.2, 'bounce1.time': 0.35, 'bounce1.bounce': 0.75, 'out.vol': 0.9,
  },
  // ---- more, combining the new modules -------------------------------------------------------
  // a drawn wave (a square with a sloped top and a notch) through a snappy filter: a growling bass
  'Drawn Bass': {
    'rack.layout': 'wave1|vcf1,vca1,out|env1,env2',
    ...C('wave1.pitch', 'kb.pitch'), ...C('vcf1.in', 'wave1.out'), ...C('vcf1.cv', 'env2.out'), ...C('vca1.in', 'vcf1.lp'), ...C('vca1.cv', 'env1.out'),
    ...C('env1.gate', 'kb.gate'), ...C('env2.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'wave1.nodes': '-1;0,0.5,0;0.02,1,0;0.42,0.78,0.4;0.46,0.95,0;0.5,0.1,0;0.75,0,-0.5;0.98,0.35,0;1,0.5,0', 'wave1.range': -1,
    'vcf1.cutoff': 260, 'vcf1.res': 0.55, 'vcf1.cv': 0.6, 'env1.a': 0.002, 'env1.d': 0.3, 'env1.s': 0.7, 'env1.r': 0.12,
    'env2.a': 0.001, 'env2.d': 0.22, 'env2.s': 0.15, 'env2.r': 0.1,
  },
  // a VCO restarts the drawn wave (hard sync); an envelope sweeps the drawn wave's pitch: a tearing lead
  'Sync Wave Lead': {
    'rack.layout': 'vco1,wave1|vca1,out|env1,env2',
    ...C('vco1.pitch', 'kb.pitch'), ...C('wave1.pitch', 'kb.pitch'), ...C('wave1.sync', 'vco1.sq'), ...C('wave1.fm', 'env2.out'),
    ...C('vca1.in', 'wave1.out'), ...C('vca1.cv', 'env1.out'), ...C('env1.gate', 'kb.gate'), ...C('env2.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'wave1.nodes': '-1;0,0.5,-0.5;0.3,1,0.5;0.6,0.15,-0.3;1,0.5,0', 'wave1.fm': 0.55,
    'env1.a': 0.005, 'env1.s': 0.85, 'env1.r': 0.3, 'env2.a': 0.001, 'env2.d': 0.9, 'env2.s': 0.2, 'env2.r': 0.4, 'out.vol': 0.7,
  },
  // the Vowels wavetable, slowly swept by an LFO, beside a detuned saw: a choir-like pad
  'Vowel Pad': {
    'rack.layout': 'table1,vco1|mix1,vca1,out|env1,lfo1',
    ...C('table1.pitch', 'kb.pitch'), ...C('vco1.pitch', 'kb.pitch'), ...C('table1.pos', 'lfo1.out'),
    ...C('mix1.in1', 'table1.out'), ...C('mix1.in2', 'vco1.saw'), ...C('vca1.in', 'mix1.out'), ...C('vca1.cv', 'env1.out'),
    ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'table1.table': 'b:vowels', 'table1.pos': 0.5, 'vco1.tune': 0.12, 'mix1.l1': 8, 'mix1.l2': 3,
    'lfo1.rate': 0.15, 'lfo1.shape': 'sine', 'env1.a': 0.9, 'env1.s': 1, 'env1.r': 1.8, 'out.vol': 0.75,
  },
  // a drawn rhythm, looping, moves through the PWM wavetable: the tone itself plays a pattern
  'Drawn Wavetable': {
    'rack.layout': 'table1|vca1,out|env1,draw1',
    ...C('table1.pitch', 'kb.pitch'), ...C('table1.pos', 'draw1.out'), ...C('draw1.gate', 'kb.gate'),
    ...C('vca1.in', 'table1.out'), ...C('vca1.cv', 'env1.out'), ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'table1.table': 'b:pwm', 'table1.pos': 0, 'draw1.mode': 'loop', 'draw1.time': 1.2,
    'draw1.nodes': steps([0, 0.9, 0.3, 1, 0, 0.6, 0.2, 0.95]), 'env1.a': 0.005, 'env1.s': 1, 'env1.r': 0.3, 'out.vol': 0.7,
  },
  // the bouncing ball sweeps the filter: each note goes "bwow-wow-wow-w-w-w" as the ball settles
  'Bouncing Filter': {
    'rack.layout': 'vco1,vco2,mix1|vcf1,vca1,out|env1,bounce1',
    ...C('vco1.pitch', 'kb.pitch'), ...C('vco2.pitch', 'kb.pitch'), ...C('mix1.in1', 'vco1.saw'), ...C('mix1.in2', 'vco2.saw'),
    ...C('vcf1.in', 'mix1.out'), ...C('vcf1.cv', 'bounce1.out'), ...C('bounce1.gate', 'kb.gate'), ...C('vca1.in', 'vcf1.lp'), ...C('vca1.cv', 'env1.out'),
    ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'vco2.tune': 0.1, 'vcf1.cutoff': 300, 'vcf1.res': 0.6, 'vcf1.cv': 0.75, 'bounce1.time': 0.3, 'bounce1.bounce': 0.72,
    'env1.a': 0.003, 'env1.s': 1, 'env1.r': 0.3, 'out.vol': 0.75,
  },
  // the ball strikes a string over and over (Loop): a rattling, slowing-down strum that starts again
  'Ratchet Strings': {
    'rack.layout': 'string1|bounce1,out|',
    ...C('string1.pitch', 'kb.pitch'), ...C('string1.strike', 'bounce1.hit'), ...C('out.in', 'string1.out'),
    'string1.decay': 1.5, 'string1.tone': 0.7, 'bounce1.mode': 'loop', 'bounce1.time': 0.25, 'bounce1.bounce': 0.78, 'out.vol': 0.65,
  },
  // the overdriven one: the ball strikes a String and a Ping, both at full Drive, into the Mixer at 11
  'Overdriven Ball': {
    'rack.layout': 'string1,ping1|mix1,vca1,out|bounce1,env1',
    ...C('string1.pitch', 'kb.pitch'), ...C('ping1.pitch', 'kb.pitch'), ...C('string1.strike', 'bounce1.hit'), ...C('ping1.strike', 'bounce1.hit'),
    ...C('bounce1.gate', 'kb.gate'), ...C('mix1.in1', 'string1.out'), ...C('mix1.in2', 'ping1.out'),
    ...C('vca1.in', 'mix1.out'), ...C('vca1.cv', 'env1.out'), ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'string1.drive': 1, 'string1.tone': 0.8, 'string1.decay': 1.2, 'ping1.drive': 1, 'ping1.partials': 2, 'ping1.stretch': 1.5, 'ping1.decay': 0.6, 'ping1.range': -1,
    'mix1.l1': 11, 'mix1.l2': 10, 'mix1.mode': 'drive', 'bounce1.time': 0.4, 'bounce1.bounce': 0.8,
    'env1.a': 0.001, 'env1.s': 1, 'env1.r': 0.8, 'out.vol': 0.6,
  },
  // a ringing gong that keeps singing (Feedback), its material swinging back and forth (Bounce, Swing, on Stretch)
  'Swinging Gong': {
    'rack.layout': 'ping1|bounce1,out|',
    ...C('ping1.pitch', 'kb.pitch'), ...C('ping1.strike', 'kb.trig'), ...C('ping1.stretch', 'bounce1.out'), ...C('out.in', 'ping1.out'),
    'ping1.partials': 6, 'ping1.stretch': 0.9, 'ping1.tone': 0.75, 'ping1.decay': 4, 'ping1.fb': 0.94, 'ping1.range': -1,
    'bounce1.mode': 'swing', 'bounce1.time': 1.5, 'bounce1.bounce': 0.6, 'out.vol': 0.8,
  },
  // play the XY pad with one finger: across moves the vowel, up makes the voice smaller; touching it plays
  'XY Talker': {
    'rack.layout': 'vco1,formant1|vca1,env1,out|xy1',
    ...C('vco1.pitch', 'kb.pitch'), ...C('formant1.in', 'vco1.saw'), ...C('formant1.vowel', 'xy1.x'), ...C('formant1.shift', 'xy1.y'),
    ...C('vca1.in', 'formant1.out'), ...C('vca1.cv', 'env1.out'), ...C('env1.gate', 'xy1.gate'), ...C('out.in', 'vca1.out'),
    'vco1.range': -1, 'formant1.vowel': 2, 'formant1.res': 0.7, 'xy1.pol': 'bi', 'xy1.smooth': 0.06,
    'env1.a': 0.02, 'env1.s': 1, 'env1.r': 0.4, 'out.vol': 0.45,
  },
  // three VCOs playing three notes of a chord through one filter and one envelope: paraphonic
  'Paraphonic Chords': {
    'rack.layout': 'vco1,vco2,vco3|poly1,mix1,vcf1,vca1,out|env1,env2',
    ...C('vco1.pitch', 'poly1.p1'), ...C('vco2.pitch', 'poly1.p2'), ...C('vco3.pitch', 'poly1.p3'),
    ...C('mix1.in1', 'vco1.saw'), ...C('mix1.in2', 'vco2.saw'), ...C('mix1.in3', 'vco3.saw'), ...C('vcf1.in', 'mix1.out'), ...C('vcf1.cv', 'env2.out'),
    ...C('vca1.in', 'vcf1.lp'), ...C('vca1.cv', 'env1.out'), ...C('env1.gate', 'kb.gate'), ...C('env2.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'poly1.voices': 3, 'vco2.tune': 0.06, 'vco3.tune': -0.06, 'mix1.l1': 6, 'mix1.l2': 6, 'mix1.l3': 6,
    'vcf1.cutoff': 900, 'vcf1.res': 0.3, 'vcf1.cv': 0.35, 'env1.a': 0.08, 'env1.s': 0.9, 'env1.r': 0.6, 'env2.d': 1.2, 'env2.s': 0.3, 'kb.mode': 'legato', 'out.vol': 0.75,
  },
  // two complete voices, each with its own envelope (its Gate from Poly): polyphony, built by hand
  'Two-Voice Poly': {
    'rack.layout': 'poly1,vco1,vco2|vca1,vca2,mix1,out|env1,env2',
    ...C('vco1.pitch', 'poly1.p1'), ...C('vco2.pitch', 'poly1.p2'), ...C('env1.gate', 'poly1.g1'), ...C('env2.gate', 'poly1.g2'),
    ...C('vca1.in', 'vco1.saw'), ...C('vca1.cv', 'env1.out'), ...C('vca2.in', 'vco2.saw'), ...C('vca2.cv', 'env2.out'),
    ...C('mix1.in1', 'vca1.out'), ...C('mix1.in2', 'vca2.out'), ...C('out.in', 'mix1.out'),
    'poly1.voices': 2, 'mix1.l1': 7, 'mix1.l2': 7, 'env1.a': 0.01, 'env1.d': 0.8, 'env1.s': 0.5, 'env1.r': 0.9,
    'env2.a': 0.01, 'env2.d': 0.8, 'env2.s': 0.5, 'env2.r': 0.9, 'env2.curve': 'curved', 'out.vol': 0.8,
  },
  // the Sequencer's steady pulse, split by a coin toss between a bell (Ping) and a pluck (String):
  // a pattern that never quite repeats
  'Chance Bells': {
    'rack.layout': 'ping1,string1|chance1,mix1,out|',
    ...C('chance1.in', 'seq.trig'), ...C('ping1.strike', 'chance1.out'), ...C('string1.strike', 'chance1.else'),
    ...C('ping1.pitch', 'seq.pitch'), ...C('string1.pitch', 'seq.pitch'), ...C('mix1.in1', 'ping1.out'), ...C('mix1.in2', 'string1.out'), ...C('out.in', 'mix1.out'),
    'chance1.chance': 0.6, 'ping1.partials': 4, 'ping1.stretch': 1.4, 'ping1.decay': 1.2, 'string1.decay': 0.8, 'string1.tone': 0.6, 'string1.range': -1,
    'mix1.l1': 7, 'mix1.l2': 7, 'seq.run': 'run', 'seq.rate': 6, 'seq.s1': 0, 'seq.s2': 7, 'seq.s3': 3, 'seq.s4': 10, 'seq.s5': 12, 'seq.s6': 7, 'seq.s7': 5, 'seq.s8': 3, 'out.vol': 0.8,
  },
  // random notes from the S&H, snapped to A minor pentatonic by the Quantizer; each new note plays
  'Quantized Wander': {
    'rack.layout': 'vco1,quant1|vcf1,vca1,out|env1,env2,sh1',
    ...C('quant1.in', 'sh1.out'), ...C('vco1.pitch', 'quant1.out'), ...C('env1.gate', 'quant1.trig'), ...C('env2.gate', 'quant1.trig'),
    ...C('vcf1.in', 'vco1.saw'), ...C('vcf1.cv', 'env2.out'), ...C('vca1.in', 'vcf1.lp'), ...C('vca1.cv', 'env1.out'), ...C('out.in', 'vca1.out'),
    'quant1.mask': '100101010010', 'quant1.root': 9, 'sh1.rate': 5, 'vco1.range': -1,
    'vcf1.cutoff': 500, 'vcf1.res': 0.5, 'vcf1.cv': 0.55, 'env1.a': 0.002, 'env1.d': 0.25, 'env1.s': 0, 'env1.r': 0.2, 'env2.a': 0.001, 'env2.d': 0.15, 'env2.s': 0, 'env2.r': 0.1,
  },
  // a triangle folded by the Shaper; an envelope on its Drive: each note starts bright and metallic, then softens
  'Folded Lead': {
    'rack.layout': 'vco1,shaper1|vcf1,vca1,out|env1,env2',
    ...C('vco1.pitch', 'kb.pitch'), ...C('shaper1.in', 'vco1.tri'), ...C('shaper1.drive', 'env2.out'), ...C('vcf1.in', 'shaper1.out'),
    ...C('vca1.in', 'vcf1.lp'), ...C('vca1.cv', 'env1.out'), ...C('env1.gate', 'kb.gate'), ...C('env2.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'shaper1.edge': 'fold', 'shaper1.drive': 1.5, 'vcf1.cutoff': 6000, 'vcf1.cv': 0,
    'env1.a': 0.003, 'env1.s': 0.8, 'env1.r': 0.4, 'env2.a': 0.001, 'env2.d': 0.7, 'env2.s': 0.15, 'env2.r': 0.4, 'out.vol': 0.7,
  },
  // a saw through a staircase drawn in the Shaper (eight steps): a gritty, bit-crushed bass
  'Bit-Crushed Bass': {
    'rack.layout': 'vco1,shaper1|vcf1,vca1,out|env1',
    ...C('vco1.pitch', 'kb.pitch'), ...C('shaper1.in', 'vco1.saw'), ...C('vcf1.in', 'shaper1.out'), ...C('vca1.in', 'vcf1.lp'),
    ...C('vca1.cv', 'env1.out'), ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'shaper1.curve': steps([0, 1, 2, 3, 4, 5, 6, 7].map((i) => i / 7)), 'vco1.range': -1, 'vcf1.cutoff': 2200, 'vcf1.res': 0.25, 'vcf1.cv': 0,
    'env1.a': 0.002, 'env1.d': 0.3, 'env1.s': 0.7, 'env1.r': 0.15, 'out.vol': 0.65,
  },
  // a teaching patch: the Probe shows the envelope (A, amber) and the sound it shapes (B, blue) as you play
  'See the Envelope': {
    'rack.layout': 'vco1,probe1|vcf1,vca1,out|env1',
    ...C('vco1.pitch', 'kb.pitch'), ...C('vcf1.in', 'vco1.saw'), ...C('vca1.in', 'vcf1.lp'), ...C('vca1.cv', 'env1.out'),
    ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'), ...C('probe1.a', 'env1.out'), ...C('probe1.b', 'vca1.out'),
    'probe1.time': 2, 'probe1.scale': 1, 'vcf1.cutoff': 1800, 'vcf1.cv': 0, 'env1.a': 0.3, 'env1.d': 0.4, 'env1.s': 0.6, 'env1.r': 0.8,
  },
  // a tonewheel organ: three drawbars and a touch of the top one, with vibrato (an LFO, through an
  // Attenuverter, into Pitch beside the Keyboard's), and an organ's instant on and off
  'Tonewheel Organ': {
    'rack.layout': 'organ1|vca1,att1,out|env1,lfo1',
    ...C('organ1.pitch', 'kb.pitch,att1.out1'), ...C('att1.in1', 'lfo1.out'), ...C('vca1.in', 'organ1.out'), ...C('vca1.cv', 'env1.out'),
    ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'organ1.d1': 8, 'organ1.d2': 8, 'organ1.d3': 8, 'organ1.d9': 4, 'att1.a1': 0.008, 'lfo1.rate': 6.5, 'lfo1.shape': 'sine',
    'env1.a': 0.004, 'env1.d': 0.1, 'env1.s': 1, 'env1.r': 0.06, 'env1.curve': 'linear', 'out.vol': 0.7,
  },
  // three Drawbars, one per note of a chord (Poly), into one VCA: an organ that plays chords
  'Organ Chords': {
    'rack.layout': 'poly1,organ1,organ2,organ3|mix1,vca1,att1,out|env1,lfo1',
    'rack.bays': 2,
    ...C('organ1.pitch', 'poly1.p1,att1.out1'), ...C('organ2.pitch', 'poly1.p2,att1.out1'), ...C('organ3.pitch', 'poly1.p3,att1.out1'),
    ...C('att1.in1', 'lfo1.out'), ...C('mix1.in1', 'organ1.out'), ...C('mix1.in2', 'organ2.out'), ...C('mix1.in3', 'organ3.out'),
    ...C('vca1.in', 'mix1.out'), ...C('vca1.cv', 'env1.out'), ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'poly1.voices': 3, 'kb.mode': 'legato',
    ...Object.fromEntries([1, 2, 3].flatMap((n) => [[`organ${n}.d1`, 8], [`organ${n}.d2`, 6], [`organ${n}.d3`, 8], [`organ${n}.d4`, 5], [`organ${n}.d6`, 3]])),
    'mix1.l1': 5, 'mix1.l2': 5, 'mix1.l3': 5, 'att1.a1': 0.008, 'lfo1.rate': 6.5, 'lfo1.shape': 'sine',
    'env1.a': 0.004, 'env1.d': 0.1, 'env1.s': 1, 'env1.r': 0.08, 'env1.curve': 'linear', 'out.vol': 0.7,
  },
  // the drawbars pulled off their harmonics by their tuning boxes: they stop blending into one note
  // and ring like a bell; an envelope that dies away makes each note a strike
  'Bell Organ': {
    'rack.layout': 'organ1|vca1,out|env1',
    ...C('organ1.pitch', 'kb.pitch'), ...C('vca1.in', 'organ1.out'), ...C('vca1.cv', 'env1.out'), ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'organ1.d1': 0, 'organ1.d2': 0, 'organ1.d3': 8, 'organ1.d4': 6, 'organ1.d5': 7, 'organ1.d6': 4, 'organ1.d7': 5, 'organ1.d8': 3, 'organ1.d9': 4,
    'organ1.t4': 0.35, 'organ1.t5': 0.7, 'organ1.t6': -0.45, 'organ1.t7': 1.1, 'organ1.t8': -0.8, 'organ1.t9': 0.6,
    'env1.a': 0.001, 'env1.d': 2.2, 'env1.s': 0, 'env1.r': 1.5, 'out.vol': 0.8,
  },
  // ---- big patches, two racks wide -----------------------------------------------------------
  // A three-note chord, each note on a different kind of oscillator (a VCO saw, a drawn wave, the
  // Vowels wavetable), each with its own envelope and VCA; an LFO gives all three vibrato (through an
  // Attenuverter), a looping Draw sweeps the wavetable, an envelope opens the shared filter on each
  // chord, an MFO slowly moves a Formant's vowel; a master VCA at the end. Hold a chord.
  'Paraphonic Orchestra': {
    'rack.layout': 'poly1,vco1,wave1,table1,mix1|vca1,vca2,vca3,vcf1,formant1,vca4,att1,out|env1,env2,env3,env4,lfo1,mfo1,draw1',
    'rack.bays': 2,
    ...C('vco1.pitch', 'poly1.p1,att1.out1'), ...C('wave1.pitch', 'poly1.p2,att1.out1'), ...C('table1.pitch', 'poly1.p3,att1.out1'),
    ...C('att1.in1', 'lfo1.out'), ...C('table1.pos', 'draw1.out'), ...C('draw1.gate', 'kb.gate'),
    ...C('env1.gate', 'poly1.g1'), ...C('env2.gate', 'poly1.g2'), ...C('env3.gate', 'poly1.g3'), ...C('env4.gate', 'kb.gate'),
    ...C('vca1.in', 'vco1.saw'), ...C('vca1.cv', 'env1.out'), ...C('vca2.in', 'wave1.out'), ...C('vca2.cv', 'env2.out'),
    ...C('vca3.in', 'table1.out'), ...C('vca3.cv', 'env3.out'),
    ...C('mix1.in1', 'vca1.out'), ...C('mix1.in2', 'vca2.out'), ...C('mix1.in3', 'vca3.out'),
    ...C('vcf1.in', 'mix1.out'), ...C('vcf1.cv', 'env4.out'), ...C('formant1.in', 'vcf1.lp'), ...C('formant1.vowel', 'mfo1.out'),
    ...C('vca4.in', 'formant1.out'), ...C('out.in', 'vca4.out'),
    'poly1.voices': 3, 'kb.mode': 'legato', 'att1.a1': 0.012, 'lfo1.rate': 5.2, 'lfo1.shape': 'sine',
    'wave1.nodes': '-1;0,0.5,-0.4;0.22,1,0.3;0.5,0.35,-0.2;0.7,0.05,0.4;1,0.5,0', 'wave1.tune': 0.06,
    'table1.table': 'b:vowels', 'table1.pos': 0.2, 'table1.tune': -0.06,
    'draw1.mode': 'bounce', 'draw1.time': 3.5, 'draw1.amt': 0.6, 'draw1.nodes': '-1;0,0,0.3;0.5,0.8,-0.3;1,0.3,0',
    'env1.a': 0.06, 'env1.d': 0.6, 'env1.s': 0.75, 'env1.r': 1.2, 'env2.a': 0.25, 'env2.d': 0.8, 'env2.s': 0.7, 'env2.r': 1.6, 'env2.curve': 'curved',
    'env3.a': 0.5, 'env3.d': 1, 'env3.s': 0.8, 'env3.r': 2, 'env3.curve': 'curved', 'env4.a': 0.01, 'env4.d': 1.4, 'env4.s': 0.35, 'env4.r': 1.5,
    'mix1.l1': 6, 'mix1.l2': 6, 'mix1.l3': 6, 'vcf1.cutoff': 800, 'vcf1.res': 0.3, 'vcf1.cv': 0.45,
    'formant1.vowel': 2, 'formant1.res': 0.45, 'formant1.mix': 0.45, 'mfo1.rate': 0.12, 'mfo1.shape': 'sine',
    'vca4.level': 0.9, 'out.vol': 0.75,
  },
  // Hold a chord and it plays itself: two of its notes go to a Ping and a String, struck by an LFO's
  // pulse through Chance (each pulse pings the bell or plucks the string), two to a pair of VCOs as a
  // pad, each with its own envelope and VCA; the lot through a filter swept by a recorded XY circle and
  // a gently driven Shaper, into a master VCA.
  'Living Chords': {
    'rack.layout': 'poly1,ping1,string1,vco1,vco2|chance1,mix1,vcf1,shaper1,vca1,vca2,vca3,out|env1,env2,env3,lfo1,xy1',
    'rack.bays': 2,
    ...C('ping1.pitch', 'poly1.p1'), ...C('string1.pitch', 'poly1.p2'), ...C('vco1.pitch', 'poly1.p3'), ...C('vco2.pitch', 'poly1.p4'),
    ...C('chance1.in', 'lfo1.out'), ...C('ping1.strike', 'chance1.out'), ...C('string1.strike', 'chance1.else'),
    ...C('env1.gate', 'poly1.g3'), ...C('env2.gate', 'poly1.g4'), ...C('env3.gate', 'kb.gate'),
    ...C('vca1.in', 'vco1.saw'), ...C('vca1.cv', 'env1.out'), ...C('vca2.in', 'vco2.sq'), ...C('vca2.cv', 'env2.out'),
    ...C('mix1.in1', 'ping1.out'), ...C('mix1.in2', 'string1.out'), ...C('mix1.in3', 'vca1.out'), ...C('mix1.in4', 'vca2.out'),
    ...C('vcf1.in', 'mix1.out'), ...C('vcf1.cv', 'xy1.x'), ...C('vcf1.res', 'xy1.y'), ...C('shaper1.in', 'vcf1.lp'),
    ...C('vca3.in', 'shaper1.out'), ...C('vca3.cv', 'env3.out'), ...C('out.in', 'vca3.out'),
    'poly1.voices': 4, 'lfo1.rate': 5, 'lfo1.shape': 'square', 'chance1.chance': 0.55,
    'ping1.partials': 4, 'ping1.stretch': 1.4, 'ping1.tone': 0.6, 'ping1.decay': 1, 'string1.decay': 1.2, 'string1.tone': 0.6,
    'vco1.range': -1, 'vco2.range': -1, 'vco2.tune': 0.08,
    'env1.a': 0.4, 'env1.s': 0.85, 'env1.r': 1.4, 'env2.a': 0.6, 'env2.s': 0.85, 'env2.r': 1.6, 'env3.a': 0.01, 'env3.d': 0.3, 'env3.s': 1, 'env3.r': 1.8,
    'mix1.l1': 7, 'mix1.l2': 7, 'mix1.l3': 4, 'mix1.l4': 3, 'vcf1.cutoff': 1400, 'vcf1.res': 0.3, 'vcf1.cv': 0.4,
    'shaper1.drive': 1.8, 'shaper1.mix': 0.6, 'xy1.mode': 'loop', 'xy1.path': CIRCLE, 'xy1.rate': 0.5, 'xy1.smooth': 0.05, 'out.vol': 0.7,
  },
  // a 16-step on/off pattern drawn with Snap, looping on the VCA: hold a chord and it chops it in rhythm
  'Drawn Gate': {
    'rack.layout': 'vco1,vco2,mix1|vcf1,vca1,out|draw1',
    ...C('vco1.pitch', 'kb.pitch'), ...C('vco2.pitch', 'kb.pitch'), ...C('mix1.in1', 'vco1.saw'), ...C('mix1.in2', 'vco2.sq'),
    ...C('vcf1.in', 'mix1.out'), ...C('vca1.in', 'vcf1.lp'), ...C('vca1.cv', 'draw1.out'), ...C('draw1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
    'vco2.tune': 7, 'vcf1.cutoff': 2600, 'vcf1.res': 0.3, 'vcf1.cv': 0, 'vca1.level': 0, 'vca1.cv': 1,
    'draw1.mode': 'loop', 'draw1.time': 2, 'draw1.nodes': steps([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0.6, 1, 0, 1, 0.6, 0.3]),
  },
};

// Help: each module shares the NF-Modular's help for the module it comes from
// ('vco3.tune' -> 'osc1.tune', 'jack.vcf2.in' -> 'jack.filt.in', 'section:mix2' -> 'section:mix').
export function helpKey(key) {
  const [base, opt] = key.split('=');
  const tail = opt === undefined ? '' : '=' + opt;
  let m = /^section:([a-z]+\d+)$/.exec(base);
  if (m) { const [type] = typeOf(m[1]); return type ? `section:${TYPES[type].help}` : null; }
  m = /^(jack\.|out:)?([a-z]+\d+)\.(\w+)$/.exec(base);
  if (!m) return null;
  const [type] = typeOf(m[2]);
  if (!type) return null;
  const t = TYPES[type];
  if (m[1] === 'jack.') return `jack.${t.j}.${m[3]}`;
  if (m[1] === 'out:') { const o = t.outs.find((x) => outName(x) === m[3]); return o ? 'out:' + outSrc(t, o) : null; }
  return `${t.p}.${m[3]}${tail}`;
}

const START = build(DEFAULT_LAYOUT);

export const MODRACK = {
  id: 'modrack',
  name: 'NF-ModRack',
  brandSub: 'OPEN MODULAR RACK',
  skin: 'modular',
  look: 'nfmod', // the NF-Modular's compact rack styles
  module: 'js/worklet/modrack-processor.js',
  processor: 'modrack-processor',
  modular: true,
  rack: true,
  openRack: true, // the modules can be chosen (js/rackEdit.js)
  lessons: true, // (explanations of its own modules: js/lessonsModRack.js)
  multiInput: true,
  octaves: 3,
  helpAs: 'nfmod',
  helpKey,
  OUTPUTS: START.OUTPUTS,
  card: {
    tagline: 'Build your own rack',
    text: 'An open modular rack: choose your modules from the drawer, as many as fit, including experimental ones.',
  },
  PARAMS: START.PARAMS, LAYOUT: START.LAYOUT, KEYBED_SECTIONS, SIDE_SECTIONS, PRESETS,
  initName: INIT_NAME,
  build, parseLayout, layoutString, initCables, rowWidth, rowUsed, MAX_BAYS, moduleName,
};
