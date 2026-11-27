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
  // the first module of the NF-ModRack's own (not from the NF-Modular): its controls are defined below (RESO)
  reso: { name: 'Resonator', desc: 'Strike it and it rings: a tuned resonator (Ping) or a plucked string (String), with feedback.', w: 436, p: 'reso', j: 'reso', help: 'reso',
    params: ['mode', 'range', 'tune', 'decay', 'tone', 'fb'], ins: ['pitch', 'strike', 'in', 'fb'], outs: ['out'] },
};

// ---- the Resonator ----------------------------------------------------------------------------
// Ping: a tuned resonator that rings when struck, like a struck bar; Tone adds the bar's higher,
// out-of-tune partials. String: a plucked string (a short delay line fed back into itself, the
// Karplus-Strong method); Tone sets how bright the string is. Decay: how long it rings.
// Feedback sends its own output back into it: past about 90% it no longer dies away but sings on
// by itself, held at a safe level.
const secs = (v) => (v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(v < 10 ? 2 : 1) + ' s');
const pct = (v) => Math.round(v * 100) + '%';
const RESO = {
  params: {
    mode: { type: 'step', ui: 'word', label: 'Resonator mode', def: 'ping', options: [{ v: 'ping', label: 'Ping' }, { v: 'string', label: 'String' }] },
    range: { ...NFP['osc1.range'] },
    tune: { ...NFP['osc1.tune'] },
    decay: { type: 'cont', label: 'Decay', min: 0.02, max: 10, def: 1.2, curve: 'log', unit: 'sec', fmt: secs,
      marks: [[0.02, '.02'], [0.1, '.1'], [0.5, '.5'], [2, '2'], [10, '10']] },
    tone: { type: 'cont', label: 'Tone', min: 0, max: 1, def: 0.5, curve: 'lin', unit: '%', fmt: pct,
      marks: [[0, 'dark'], [0.5, '50'], [1, 'bright']] },
    fb: { type: 'cont', label: 'Feedback', min: 0, max: 1, def: 0, curve: 'lin', unit: '%', fmt: (v) => pct(v) + (v >= 0.9 ? ' (sings on)' : ''),
      marks: [[0, '0'], [0.5, '50'], [0.9, 'sing'], [1, '100']] },
  },
  ins: {
    pitch: { ...NFP['jack.vco1.pitch'] },
    strike: { ...NFP['jack.vco1.fm'], label: 'Strike' },
    in: { ...NFP['jack.mix.in1'], label: 'In' },
    fb: { ...NFP['jack.vco1.fm'], label: 'FB' },
  },
  outs: { out: { label: 'Out', audio: true } },
};
TYPES.reso.specs = RESO;
// The order of the drawer: sources, shaping, modulation
export const DRAWER = [['Sources', ['vco', 'noise', 'reso', 'mix']], ['Shaping', ['vcf', 'ring', 'vca', 'att']], ['Modulation', ['env', 'lfo', 'mfo', 'sh']]];
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
  reso: { titleSwitch: 'mode', rows: [['range', 'tune', 'decay', 'tone', 'fb']], jacks: ['pitch', 'strike', 'in', 'fb', 'out:out'] },
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
  if (params[`${inst}.mode`] && own) params[`${inst}.mode`].label = `${t.name} ${n} mode`;
  t.ins.forEach((c) => { const src = own ? own.ins[c] : NFP[`jack.${t.j}.${c}`] || jack; params[`jack.${inst}.${c}`] = { ...src, def: '' }; });
  t.outs.forEach((o) => { const src = own ? own.outs[outName(o)] : NFO[outSrc(t, o)]; outputs[`${inst}.${outName(o)}`] = { ...src, module: `${t.name} ${n}` }; });
  const P = PANELS[type];
  const full = (c) => (Array.isArray(c) ? c.map(full) : `${inst}.${c}`);
  const sock = (c) => (c.startsWith('out:') ? `out:${inst}.${c.slice(4)}` : `jack.${inst}.${c}`);
  const section = { id: inst, title: `${t.name} ${n}`, type, even: n % 2 === 0, removable: true };
  if (P.parts) section.parts = P.parts.map((part) => ({ rows: part.rows.map((r) => r.map(full)), jacks: part.jacks.map(sock) }));
  else { section.rows = P.rows.map((r) => r.map(full)); section.jacks = P.jacks.map(sock); }
  if (P.titleSwitch) section.titleSwitch = `${inst}.${P.titleSwitch}`;
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
