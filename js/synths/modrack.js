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
import { PARAMS as NFP, OUTPUTS as NFO, LAYOUT as NF_LAYOUT, KEYBED_SECTIONS, SIDE_SECTIONS } from './nfmod.js';

// The rack: three rows, each this wide (in the panel's own pixels: the NF-Modular's rows) with
// this gap between modules.
export const ROW_WIDTH = 1573;
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
  formant: { name: 'Formant', desc: 'Makes any sound talk: three filters tuned like a voice, sweeping A, E, I, O, U.', w: 352, p: 'formant', j: 'formant', help: 'formant',
    params: ['vowel', 'shift', 'res', 'mix'], ins: ['in', 'vowel', 'shift'], outs: ['out'] },
  xy: { name: 'XY', desc: 'A pad to play two control signals at once by hand, and record your movements to loop them.', w: 480, p: 'xy', j: 'xy', help: 'xy',
    params: ['mode', 'path', 'x', 'y', 'touch', 'rate', 'smooth', 'pol'], ins: ['gate'], outs: ['x', 'y', 'gate'] },
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
export const DRAWER = [['Sources', ['vco', 'noise', 'ping', 'string', 'mix']], ['Shaping', ['vcf', 'formant', 'ring', 'vca', 'att']], ['Modulation', ['env', 'draw', 'xy', 'lfo', 'mfo', 'sh']]];
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
export function parseLayout(str) {
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
      if (id !== 'out' && used + w > ROW_WIDTH) return false;
      used += w;
      return true;
    });
  });
}
export const layoutString = (rows) => rows.map((r) => r.join(',')).join('|');
export const rowUsed = (row) => row.reduce((a, id, i) => a + widthOf(id) + (i ? GAP : 0), 0);
export const fits = (row, inst) => rowUsed(row) + (row.length ? GAP : 0) + widthOf(inst) <= ROW_WIDTH;
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
function moduleDef(inst) {
  const [type, n] = typeOf(inst);
  const t = TYPES[type];
  const params = {}, outputs = {};
  const own = t.specs; // a module of the NF-ModRack's own (the Resonator) has its own controls
  t.params.forEach((c) => { params[`${inst}.${c}`] = { ...(own ? own.params[c] : NFP[`${t.p}.${c}`]) }; });
  if (params[`${inst}.curve`]) params[`${inst}.curve`].label = `${t.name} ${n} shape`;
  t.ins.forEach((c) => { const src = own ? own.ins[c] : NFP[`jack.${t.j}.${c}`] || jack; params[`jack.${inst}.${c}`] = { ...src, def: '' }; });
  t.outs.forEach((o) => { const src = own ? own.outs[outName(o)] : NFO[outSrc(t, o)]; outputs[`${inst}.${outName(o)}`] = { ...src, module: `${t.name} ${n}` }; });
  const P = PANELS[type];
  const full = (c) => (Array.isArray(c) ? c.map(full) : `${inst}.${c}`);
  const sock = (c) => (c.startsWith('out:') ? `out:${inst}.${c.slice(4)}` : `jack.${inst}.${c}`);
  const section = { id: inst, title: `${t.name} ${n}`, type, even: n % 2 === 0, removable: true };
  if (P.parts) section.parts = P.parts.map((part) => ({ rows: part.rows.map((r) => r.map(full)), jacks: part.jacks.map(sock) }));
  else { section.rows = P.rows.map((r) => r.map(full)); section.jacks = P.jacks.map(sock); }
  if (P.titleSwitch) section.titleSwitch = `${inst}.${P.titleSwitch}`;
  if (P.screen) section.screen = `${inst}.${P.screen}`;
  if (P.jacksBeside) section.jacksBeside = true;
  return { params, outputs, section };
}

// Everything for a layout string: PARAMS, OUTPUTS and the panel's rows of modules
export function build(layout) {
  const rows = parseLayout(layout === undefined ? DEFAULT_LAYOUT : layout);
  // (the rack's own default is itself, so defaultPatch() keeps the modules it is given)
  const PARAMS = { ...FIXED_PARAMS, 'rack.layout': { type: 'layout', label: 'Rack', def: layoutString(rows) } };
  const OUTPUTS = { ...FIXED_OUTPUTS };
  const LAYOUT = rows.map((row) => row.map((inst) => {
    if (inst === 'out') return { ...OUT_SECTION, movable: true };
    const d = moduleDef(inst);
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
export const PRESETS = {
  'Basic Synth': {},
  'Empty Rack': { 'rack.layout': '|out|' },
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
  multiInput: true,
  octaves: 3,
  helpAs: 'nfmod',
  helpKey,
  OUTPUTS: START.OUTPUTS,
  card: {
    tagline: 'Build your own rack',
    text: 'An open modular rack: choose your modules from the drawer, as many as fit.',
  },
  PARAMS: START.PARAMS, LAYOUT: START.LAYOUT, KEYBED_SECTIONS, SIDE_SECTIONS, PRESETS,
  initName: INIT_NAME,
  build, parseLayout, layoutString, initCables,
};
