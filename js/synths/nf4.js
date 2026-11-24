// NF-4: a small four-channel mixing console, for learning signal flow. Each channel strip reads
// from top to bottom in the order the sound flows through it: input (mic or line) and preamp
// gain, polarity, high-pass filter, EQ, Aux 1 (pre-fader), Aux 2 (post-fader), pan and routing,
// mute and solo, and the fader. The master section has the aux masters and a reverb (fed by
// Aux 2), a bus compressor on the main mix, the main fader, and the monitor select.
// Engine: js/worklet/console-processor.js. Scales: js/consoleMath.js. Screens: js/consoleScope.js.

import { faderDb, sendDb, preampDb, fmtDb } from '../consoleMath.js';
import { SONG_STEMS } from '../sources.js';

const onOff = (label, button, def = 'off') => ({ type: 'step', ui: 'led', button, label, def, options: [{ v: 'off', label: 'Off' }, { v: 'on', label: 'On' }] });
const eqGain = (label) => ({ type: 'cont', label, min: -15, max: 15, def: 0, curve: 'lin', unit: 'dB', small: true, fmt: fmtDb,
  marks: [[-15, '−15'], [0, '0'], [15, '+15']] });
const send = (label, def = 0) => ({ type: 'cont', label, min: 0, max: 1, def, curve: 'lin', small: true, fmt: (v) => fmtDb(sendDb(v)),
  marks: [[0, '∞'], [0.37, '−30'], [0.89, '0'], [1, '+6']] });
const fader = (label, def = 0.75) => ({ type: 'cont', ui: 'fader', label, min: 0, max: 1, def, curve: 'lin', fmt: (v) => fmtDb(faderDb(v)) });
const hz = (v) => (v >= 1000 ? (v / 1000).toFixed(v < 10000 ? 1 : 0) + ' kHz' : Math.round(v) + ' Hz');

// sensible starting gains: each source lands around -12 dB on its meter (see sources.js)
const START_GAIN = { mic: 0.68, line: 0.32 };
const START_PAN = [0, 0, -0.35, 0.15];

function channel(n) {
  const k = `ch${n}.`, stem = SONG_STEMS[n - 1];
  const micFmt = (v) => fmtDb(preampDb(v, true)), lineFmt = (v) => fmtDb(preampDb(v, false));
  return {
    [k + 'in']: { type: 'step', ui: 'toggle', label: 'Input', def: stem.input, options: [{ v: 'mic', label: 'Mic' }, { v: 'line', label: 'Line' }] },
    [k + 'p48']: onOff('48 V phantom power', '48V', stem.input === 'mic' ? 'on' : 'off'),
    [k + 'pol']: onOff('Polarity (Ø)', 'Ø'),
    [k + 'gain']: { type: 'cont', label: 'Gain', min: 0, max: 1, def: START_GAIN[stem.input], curve: 'lin', small: true, fmt: micFmt,
      marks: [[0, '+10'], [0.5, '+35'], [1, '+60']],
      alt: { when: (p) => p[k + 'in'] === 'line', fmt: lineFmt, marks: [[0, '−20'], [0.5, '+5'], [1, '+30']] } },
    [k + 'hpf']: { type: 'cont', label: 'HPF', min: 20, max: 400, def: 20, curve: 'log', unit: 'Hz', small: true,
      fmt: (v) => (v <= 25 ? 'off' : hz(v)), marks: [[20, 'off'], [80, '80'], [400, '400']] },
    [k + 'hf']: eqGain('High'),
    [k + 'mg']: eqGain('Mid'),
    [k + 'mf']: { type: 'cont', label: 'Mid Freq', min: 100, max: 8000, def: 1000, curve: 'log', unit: 'Hz', small: true, fmt: hz,
      marks: [[100, '100'], [1000, '1k'], [8000, '8k']] },
    [k + 'lf']: eqGain('Low'),
    [k + 'eq']: onOff('EQ in', 'EQ', 'on'),
    [k + 'aux1']: send('Aux 1 (pre)'),
    [k + 'aux2']: send('Aux 2 (post)'),
    [k + 'pan']: { type: 'cont', label: 'Pan', min: -1, max: 1, def: START_PAN[n - 1], curve: 'lin', small: true,
      fmt: (v) => (Math.abs(v) < 0.02 ? 'centre' : Math.round(Math.abs(v) * 100) + '% ' + (v < 0 ? 'left' : 'right')),
      marks: [[-1, 'L'], [0, 'C'], [1, 'R']] },
    [k + 'main']: onOff('Route to Main L-R', 'L-R', 'on'),
    [k + 'mute']: onOff('Mute', 'Mute'),
    [k + 'solo']: onOff('Solo (PFL)', 'Solo'),
    [k + 'fader']: fader('Fader'),
  };
}

export const PARAMS = {
  ...channel(1), ...channel(2), ...channel(3), ...channel(4),
  // transport
  'tape.play': { type: 'step', ui: 'led', button: 'Play', label: 'Play / Stop', def: 'stop', options: [{ v: 'stop', label: 'Stopped' }, { v: 'play', label: 'Playing' }] },
  // aux masters and the reverb
  'aux1.master': send('Aux 1', 0.89),
  'aux2.master': send('Aux 2', 0.89),
  'rev.time': { type: 'cont', label: 'Rev Time', min: 0.4, max: 5, def: 1.8, curve: 'log', unit: 's', small: true, fmt: (v) => v.toFixed(1) + ' s',
    marks: [[0.4, '.4'], [1.5, '1.5'], [5, '5']] },
  'rev.ret': send('Rev Return', 0.89),
  // bus compressor
  'bc.on': onOff('Bus compressor in', 'Comp In'),
  'bc.thresh': { type: 'cont', label: 'Threshold', min: -40, max: 0, def: -12, curve: 'lin', unit: 'dB', small: true, fmt: fmtDb, marks: [[-40, '−40'], [-20, '−20'], [0, '0']] },
  'bc.ratio': { type: 'cont', label: 'Ratio', min: 1, max: 10, def: 2, curve: 'log', unit: ':1', small: true, fmt: (v) => v.toFixed(1) + ':1', marks: [[1, '1'], [2, '2'], [4, '4'], [10, '10']] },
  'bc.attack': { type: 'cont', label: 'Attack', min: 0.1, max: 30, def: 10, curve: 'log', unit: 'ms', small: true, fmt: (v) => (v < 10 ? v.toFixed(1) : Math.round(v)) + ' ms', marks: [[0.1, '.1'], [1, '1'], [10, '10'], [30, '30']] },
  'bc.release': { type: 'cont', label: 'Release', min: 50, max: 1200, def: 300, curve: 'log', unit: 'ms', small: true, fmt: (v) => Math.round(v) + ' ms', marks: [[50, '50'], [300, '300'], [1200, '1.2k']] },
  'bc.makeup': { type: 'cont', label: 'Makeup', min: 0, max: 15, def: 0, curve: 'lin', unit: 'dB', small: true, fmt: fmtDb, marks: [[0, '0'], [6, '6'], [15, '15']] },
  // main and monitor
  'main.fader': fader('Main'),
  'mon.src': { type: 'step', label: 'Monitor', def: 'main', small: true, options: [{ v: 'main', label: 'Main' }, { v: 'aux1', label: 'Aux 1' }, { v: 'aux2', label: 'Aux 2' }] },
  'mon.vol': { type: 'cont', label: 'Listen', min: 0, max: 1, def: 0.7, curve: 'lin', small: true, fmt: (v) => Math.round(v * 100) + '%' },
};

const strip = (n) => {
  const k = `ch${n}.`, stem = SONG_STEMS[n - 1];
  return [{
    id: `ch${n}`, title: String(n), strip: true,
    // one control per row, in signal order from top to bottom; the knobs zig-zag left and right
    // so the strip stays narrow (as on real desks); only small buttons sit side by side
    zigzag: true,
    rows: [[k + 'in'], [[k + 'p48', k + 'pol']], [k + 'gain'], [k + 'hpf'],
      [k + 'hf'], [k + 'mf'], [k + 'mg'], [k + 'lf'], [[k + 'eq']],
      [k + 'aux1'], [k + 'aux2'], [k + 'pan'], [[k + 'main']], [[k + 'mute', k + 'solo']]],
    fader: k + 'fader', meters: [[`ch${n}`, '', 'chmeter']], scribble: `${stem.label}`, scribbleNote: stem.note,
  }];
};

export const LAYOUT = [
  strip(1), strip(2), strip(3), strip(4),
  [
    { id: 'tape', title: 'Song', head: ['tape.play'], rows: [], scribble: 'Demo song · 96 BPM' },
    { id: 'aux', title: 'Aux Masters', rows: [['aux1.master', 'aux2.master'], ['rev.time', 'rev.ret']],
      meters: [['aux1', 'Aux 1', 'auxmeter'], ['aux2', 'Aux 2', 'auxmeter'], ['ret', 'Rev', 'auxmeter']] },
  ],
  [{ id: 'bc', title: 'Bus Comp', head: ['bc.on'], rows: [['bc.thresh', 'bc.ratio'], ['bc.attack', 'bc.release'], ['bc.makeup', null]],
    meters: [['gr', 'GR', 'grmeter']] }],
  [{ id: 'main', title: 'Main', rows: [['mon.src', 'mon.vol']], fader: 'main.fader', meters: [['mainL', 'L', 'mainmeter'], ['mainR', 'R', 'mainmeter']] }],
];

export const PRESETS = {
  'Init': {},
  'Rough mix': { 'ch1.fader': 0.72, 'ch2.fader': 0.7, 'ch3.fader': 0.66, 'ch4.fader': 0.76, 'ch1.hpf': 60, 'ch3.hpf': 120, 'ch4.hpf': 100,
    'ch4.aux2': 0.7, 'ch3.aux2': 0.5, 'rev.ret': 0.8, 'bc.on': 'on', 'bc.thresh': -16, 'bc.makeup': 3 },
  'Headphone mix (Aux 1)': { 'ch1.aux1': 0.85, 'ch2.aux1': 0.8, 'ch3.aux1': 0.5, 'ch4.aux1': 0.95, 'mon.src': 'aux1' },
  'Reverb on the lead': { 'ch4.aux2': 0.85, 'rev.time': 2.6, 'rev.ret': 0.9 },
  'Glued with the bus comp': { 'bc.on': 'on', 'bc.thresh': -20, 'bc.ratio': 3, 'bc.attack': 10, 'bc.release': 200, 'bc.makeup': 5 },
  'Badly gain-staged': { 'ch1.gain': 0.2, 'ch1.fader': 1, 'ch4.gain': 1, 'ch4.fader': 0.5 },
};

export const NF4 = {
  id: 'nf4',
  name: 'NF-4',
  brandSub: 'FOUR-CHANNEL MIXING CONSOLE',
  skin: 'studio',
  kind: 'console',
  module: 'js/worklet/console-processor.js',
  processor: 'console-processor',
  card: {
    tagline: 'Signal flow',
    text: 'A four-channel console: mic and line inputs, EQ, aux sends, mute and solo, a bus compressor.',
  },
  PARAMS, LAYOUT, KEYBED_SECTIONS: [], PRESETS,
};
