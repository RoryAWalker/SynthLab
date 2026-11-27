// NF-Mix4: a small four-channel mixing console, for learning signal flow. Each channel strip reads
// from top to bottom in the order the sound flows through it: input (mic or line) and preamp
// gain, polarity, high-pass filter, EQ, the insert point (Send and Return sockets), Aux 1
// (pre-fader), Aux 2 (post-fader), pan and routing, mute and solo, and the fader.
// Beside the channels: one narrow strip with the aux masters (and their output sockets) and the
// FX Return; then the main meters, the one-knob bus compressor and the main fader.
// For now every channel and the outboard are mono (the main mix is stereo, by the pan pots).
// Nothing is wired in behind the panel: the outboard Reverb, Delay and two Compressors (separate
// units) are patched in with cables on the patch bay, where all the patch points are. The song comes from a separate
// Multitrack Player, one track per channel.
// Engine: js/worklet/console-processor.js. Scales: js/consoleMath.js. Screens: js/consoleScope.js.

import { faderDb, sendDb, preampDb, fmtDb } from '../consoleMath.js';
import { SONG_STEMS, MIC_LOSS_DB } from '../sources.js';

const onOff = (label, button, def = 'off') => ({ type: 'step', ui: 'led', button, label, def, options: [{ v: 'off', label: 'Off' }, { v: 'on', label: 'On' }] });
const eqGain = (label) => ({ type: 'cont', label, min: -15, max: 15, def: 0, curve: 'lin', unit: 'dB', small: true, fmt: fmtDb,
  marks: [[-15, '−15'], [0, '0'], [15, '+15']] });
const send = (label, def = 0) => ({ type: 'cont', label, min: 0, max: 1, def, curve: 'lin', small: true, fmt: (v) => fmtDb(sendDb(v)),
  marks: [[0, '∞'], [0.37, '−30'], [0.89, '0'], [1, '+6']] });
const fader = (label, def = 0.75) => ({ type: 'cont', ui: 'fader', label, min: 0, max: 1, def, curve: 'lin', fmt: (v) => fmtDb(faderDb(v)) });
const hz = (v) => (v >= 1000 ? (v / 1000).toFixed(v < 10000 ? 1 : 0) + ' kHz' : Math.round(v) + ' Hz');

// Patch points. An input socket is a setting naming the output plugged into it ('' = nothing),
// so cables save and reset with the rest of the settings (see ../../js/cables.js).
// (label: as printed on the patch bay, whose rows say Out and In; name: in full)
export const OUTPUTS = {
  'ch1.send': { name: 'Channel 1 Send', label: '1 Send' }, 'ch2.send': { name: 'Channel 2 Send', label: '2 Send' },
  'ch3.send': { name: 'Channel 3 Send', label: '3 Send' }, 'ch4.send': { name: 'Channel 4 Send', label: '4 Send' },
  'aux1.out': { name: 'Aux 1', label: 'Aux 1' }, 'aux2.out': { name: 'Aux 2', label: 'Aux 2' },
  'rev.out': { name: 'Reverb Out', label: 'Rev' }, 'dl.out': { name: 'Delay Out', label: 'Dly' },
  'oc.out': { name: 'Compressor 1 Out', label: 'C1' }, 'oc2.out': { name: 'Compressor 2 Out', label: 'C2' },
};
Object.values(OUTPUTS).forEach((o) => { o.audio = true; });
const fullName = (out) => (OUTPUTS[out] ? OUTPUTS[out].name : 'nothing');
const jack = (label) => ({ type: 'jack', label, def: '', audio: true, fmt: (v) => (v ? 'from ' + fullName(v) : 'not patched') });

// The desk starts NEUTRAL (zeroed, as a desk is left at the end of a session): inputs on Line,
// no 48 V, gains and faders all the way down, pans centred, EQ flat, sends, aux masters and the FX
// Return down, the bus compressor resting. So nothing is heard until the student sets it up.
// READY (and the presets built on it) is a working setup: each source landing around -12 dB on
// its meter (see sources.js), faders at unity.
const START_GAIN = { mic: 0.68, line: 0.32 };
const START_PAN = [0, 0, -0.35, 0.15];
const READY = { 'aux1.master': 0.89, 'aux2.master': 0.89, 'fxr.level': 0.89, 'fxr2.level': 0.89, 'main.fader': 0.75 };
SONG_STEMS.forEach((st, i) => {
  const k = `ch${i + 1}.`;
  Object.assign(READY, { [k + 'in']: st.input, [k + 'p48']: st.input === 'mic' ? 'on' : 'off', [k + 'gain']: START_GAIN[st.input], [k + 'fader']: 0.75, [k + 'pan']: START_PAN[i] });
});

function channel(n) {
  const k = `ch${n}.`;
  const micFmt = (v) => fmtDb(preampDb(v, true)), lineFmt = (v) => fmtDb(preampDb(v, false));
  return {
    [k + 'in']: { type: 'step', ui: 'toggle', label: 'Input', def: 'line', options: [{ v: 'mic', label: 'Mic' }, { v: 'line', label: 'Line' }] },
    [k + 'p48']: onOff('48 V phantom power', '48V'),
    [k + 'pol']: onOff('Polarity (Ø)', 'Ø'),
    [k + 'gain']: { type: 'cont', label: 'Gain', min: 0, max: 1, def: 0, curve: 'lin', small: true, fmt: micFmt,
      marks: [[0, '+10'], [0.5, '+35'], [1, '+60']],
      alt: { when: (p) => p[k + 'in'] !== 'mic', fmt: lineFmt, marks: [[0, '−20'], [0.5, '+5'], [1, '+30']] } },
    [k + 'hpf']: { type: 'cont', label: 'HPF', min: 20, max: 400, def: 20, curve: 'log', unit: 'Hz', small: true,
      fmt: (v) => (v <= 25 ? 'off' : hz(v)), marks: [[20, 'off'], [80, '80'], [400, '400']] },
    [k + 'hf']: eqGain('High'),
    [k + 'mg']: eqGain('Mid'),
    [k + 'mf']: { type: 'cont', label: 'Mid Freq', min: 100, max: 8000, def: 1000, curve: 'log', unit: 'Hz', small: true, fmt: hz,
      marks: [[100, '100'], [1000, '1k'], [8000, '8k']] },
    [k + 'lf']: eqGain('Low'),
    [k + 'eq']: onOff('EQ in', 'EQ', 'on'),
    [k + 'ret']: jack(`${n} Ret`), // the insert point's return, on the patch bay (its Send is an output)
    [k + 'aux1']: send('Aux 1 (pre)'),
    [k + 'aux2']: send('Aux 2 (post)'),
    [k + 'pan']: { type: 'cont', label: 'Pan', min: -1, max: 1, def: 0, curve: 'lin', small: true,
      fmt: (v) => (Math.abs(v) < 0.02 ? 'centre' : Math.round(Math.abs(v) * 100) + '% ' + (v < 0 ? 'left' : 'right')),
      marks: [[-1, 'L'], [0, 'C'], [1, 'R']] },
    [k + 'main']: onOff('Route to Main L-R', 'L-R', 'on'),
    [k + 'mute']: onOff('Mute', 'M'),
    [k + 'solo']: onOff('Solo (PFL)', 'S'),
    [k + 'fader']: fader('Fader', 0),
  };
}

export const PARAMS = {
  ...channel(1), ...channel(2), ...channel(3), ...channel(4),
  // the Multitrack Player (a separate unit)
  'tape.play': { type: 'step', ui: 'led', button: 'Play', label: 'Play / Stop', def: 'stop', options: [{ v: 'stop', label: 'Stopped' }, { v: 'play', label: 'Playing' }] },
  // two FX Returns: each a plain input (on the patch bay) with one level pot
  'fxr.in': jack('FX 1'),
  'fxr.level': send('FX 1', 0),
  'fxr2.in': jack('FX 2'),
  'fxr2.level': send('FX 2', 0),
  // aux masters (their outputs are sockets)
  'aux1.master': send('Aux 1', 0),
  'aux2.master': send('Aux 2', 0),
  // bus compressor: one knob; fixed 4:1, 10 ms attack, 200 ms release, soft knee; makeup is automatic
  'bc.thresh': { type: 'cont', label: 'Threshold', min: -30, max: 0, def: 0, curve: 'lin', unit: 'dB', small: true, fmt: (v) => (v > -0.5 ? '0 dB (resting)' : fmtDb(v)),
    marks: [[-30, '−30'], [-20, '−20'], [-10, '−10'], [0, '0']] },
  // meters: how every meter on the desk reads
  'meter.mode': { type: 'step', ui: 'toggle', label: 'Meters', def: 'vu', options: [{ v: 'vu', label: 'VU' }, { v: 'ppm', label: 'PPM' }] },
  // main and monitor
  'main.fader': fader('Main', 0),
  'mon.src': { type: 'step', label: 'Monitor', def: 'main', small: true, options: [{ v: 'main', label: 'Main' }, { v: 'aux1', label: 'Aux 1' }, { v: 'aux2', label: 'Aux 2' }] },

  // ---- outboard (separate units, patched in with cables) ----
  // Reverb: 100% wet (the dry sound stays on the desk)
  'rev.in': jack('Rev'),
  'rev.time': { type: 'cont', label: 'Time', min: 0.4, max: 5, def: 1.8, curve: 'log', unit: 's', small: true, fmt: (v) => v.toFixed(1) + ' s',
    marks: [[0.4, '.4'], [1, '1'], [2, '2'], [5, '5']] },
  'rev.tone': { type: 'cont', label: 'Tone', min: 0, max: 1, def: 0.5, curve: 'lin', small: true, fmt: (v) => (v < 0.34 ? 'dark' : v > 0.66 ? 'bright' : 'natural'),
    marks: [[0, 'dark'], [1, 'bright']] },
  // Compressor: for a channel's insert point (fixed 10 ms attack, 150 ms release)
  'oc.in': jack('C1'),
  'oc.thresh': { type: 'cont', label: 'Threshold', min: -40, max: 0, def: -20, curve: 'lin', unit: 'dB', small: true, fmt: fmtDb, marks: [[-40, '−40'], [-20, '−20'], [0, '0']] },
  'oc.ratio': { type: 'cont', label: 'Ratio', min: 1, max: 20, def: 4, curve: 'log', unit: ':1', small: true,
    fmt: (v) => (v >= 19.5 ? '20:1 (heavy limiting)' : v >= 9.95 ? Math.round(v) + ':1 (limiting)' : v.toFixed(1) + ':1'), marks: [[1, '1'], [2, '2'], [4, '4'], [10, '10'], [20, '20']] },
  'oc.gain': { type: 'cont', label: 'Gain', min: 0, max: 24, def: 0, curve: 'lin', unit: 'dB', small: true, fmt: fmtDb, marks: [[0, '0'], [12, '12'], [24, '24']] },
  // Compressor 2: the same again, for a second channel
  'oc2.in': jack('C2'),
  'oc2.thresh': { type: 'cont', label: 'Threshold', min: -40, max: 0, def: -20, curve: 'lin', unit: 'dB', small: true, fmt: fmtDb, marks: [[-40, '−40'], [-20, '−20'], [0, '0']] },
  'oc2.ratio': { type: 'cont', label: 'Ratio', min: 1, max: 20, def: 4, curve: 'log', unit: ':1', small: true,
    fmt: (v) => (v >= 19.5 ? '20:1 (heavy limiting)' : v >= 9.95 ? Math.round(v) + ':1 (limiting)' : v.toFixed(1) + ':1'), marks: [[1, '1'], [2, '2'], [4, '4'], [10, '10'], [20, '20']] },
  'oc2.gain': { type: 'cont', label: 'Gain', min: 0, max: 24, def: 0, curve: 'lin', unit: 'dB', small: true, fmt: fmtDb, marks: [[0, '0'], [12, '12'], [24, '24']] },
  // Delay: one echo, 100% wet; Feedback brings it round again (repeats)
  'dl.in': jack('Dly'),
  'dl.time': { type: 'cont', label: 'Time', min: 40, max: 1200, def: 430, curve: 'log', unit: 'ms', small: true, fmt: (v) => Math.round(v) + ' ms',
    marks: [[40, '40'], [150, '150'], [430, '430'], [1200, '1.2k']] },
  'dl.fb': { type: 'cont', label: 'Feedback', min: 0, max: 0.9, def: 0.35, curve: 'lin', small: true, fmt: (v) => Math.round(v * 100) + '%',
    marks: [[0, '0'], [0.45, '50'], [0.9, '90']] },
};

const strip = (n) => {
  const k = `ch${n}.`, stem = SONG_STEMS[n - 1];
  return [{
    id: `ch${n}`, title: String(n), strip: true,
    // one control per row, in signal order from top to bottom; the knobs zig-zag left and right
    // so the strip stays narrow (as on real desks); only small buttons sit side by side
    zigzag: true,
    // (the insert point's sockets are on the patch bay; 48 V and polarity sit under the HPF,
    // closing the input section before the EQ)
    rows: [[k + 'in'], [k + 'gain'], [k + 'hpf'], [[k + 'p48', k + 'pol']],
      [k + 'hf'], [k + 'mf'], [k + 'mg'], [k + 'lf'], [[k + 'eq']],
      [k + 'aux1'], [k + 'aux2'], [k + 'pan'], [[k + 'main']], [[k + 'mute', k + 'solo']]],
    fader: k + 'fader', meters: [[`ch${n}`, '', 'chmeter']], scribble: stem.label, // (just the title)
  }];
};

export const LAYOUT = [
  strip(1), strip(2), strip(3), strip(4),
  // one narrow strip: the aux masters with their outputs, then the FX Return (no meters)
  [{ id: 'aux', title: 'Aux', rows: [['aux1.master'], ['aux2.master'], ['fxr.level'], ['fxr2.level']],
    rowTitles: [undefined, undefined, 'FX Return'] }],
  // right: the main meters, the bus compressor under them, then the main fader at the bottom
  [{ id: 'mtr', title: 'Main Meters', head: ['meter.mode'], rows: [], needles: [['mainL', 'L'], ['mainR', 'R']] },
   { id: 'bc', title: 'Bus Comp', rows: [['bc.thresh']], meters: [['gr', 'GR', 'grmeter']] },
   { id: 'main', title: 'Main', rows: [['mon.src']], fader: 'main.fader', meters: [['mainL', 'L', 'mainmeter'], ['mainR', 'R', 'mainmeter']] }],
];

// The patch bay: every patch point in one place, outputs on the top row and inputs on the bottom,
// so the usual patches are short hops straight down (a channel's Send over its Return, Aux 2 over
// the Reverb's In, the Reverb's Out over FX Return 1...).
export const PATCHBAY = { id: 'bay', title: 'Patch Bay', rows: [
  ['#Out', 'out:ch1.send', 'out:ch2.send', 'out:ch3.send', 'out:ch4.send', 'out:aux1.out', 'out:aux2.out', 'out:rev.out', 'out:dl.out', 'out:oc.out', 'out:oc2.out'],
  ['#In', 'ch1.ret', 'ch2.ret', 'ch3.ret', 'ch4.ret', 'dl.in', 'rev.in', 'fxr.in', 'fxr2.in', 'oc.in', 'oc2.in'],
] };
// The separate units: the outboard rack (beside the screens) and the Multitrack Player (under the
// desk). No sockets on them (they are on the patch bay); io: their little In and Out meters.
export const OUTBOARD = [
  { id: 'rev', title: 'Reverb', brandSub: 'REVERB', rows: [['rev.time', 'rev.tone']], io: ['rev.in', 'rev.out'] },
  { id: 'dl', title: 'Delay', brandSub: 'DELAY', rows: [['dl.time', 'dl.fb']], io: ['dl.in', 'dl.out'] },
  { id: 'oc', title: 'Compressor 1', brandSub: 'COMPRESSOR 1', rows: [['oc.thresh', 'oc.ratio', 'oc.gain']], io: ['oc.in', 'oc.out'], gr: 'ocgr' },
  { id: 'oc2', title: 'Compressor 2', brandSub: 'COMPRESSOR 2', rows: [['oc2.thresh', 'oc2.ratio', 'oc2.gain']], io: ['oc2.in', 'oc2.out'], gr: 'oc2gr' },
];
export const PLAYER = { id: 'tape', title: 'Multitrack Player', play: 'tape.play', text: 'Demo song · 105 BPM · tracks 1–4 → channels 1–4',
  // a tiny meter per track: each track's own level (the drums before they lost 50 dB as a mic signal)
  tracks: SONG_STEMS.map((st) => st.label),
  trackDb: (live) => (live && live.ch ? live.ch.map((c, i) => c.in + (SONG_STEMS[i].input === 'mic' ? MIC_LOSS_DB : 0)) : null) };

// (presets with cables: an input socket's value is the output plugged into it)
const REVERB_PATCHED = { 'rev.in': 'aux2.out', 'fxr.in': 'rev.out' };
const COMP_ON_LEAD = { 'oc.in': 'ch4.send', 'ch4.ret': 'oc.out' };
const DELAY_PATCHED = { 'dl.in': 'aux2.out', 'fxr2.in': 'dl.out' };
export const PRESETS = {
  'Init': {}, // the neutral desk
  'Ready to mix': READY,
  'Rough mix': { ...READY, 'ch1.fader': 0.72, 'ch2.fader': 0.7, 'ch3.fader': 0.66, 'ch4.fader': 0.76, 'ch1.hpf': 60, 'ch3.hpf': 120, 'ch4.hpf': 100,
    ...REVERB_PATCHED, 'ch4.aux2': 0.7, 'ch3.aux2': 0.5, 'fxr.level': 0.8, 'bc.thresh': -10 },
  'Headphone mix (Aux 1)': { ...READY, 'ch1.aux1': 0.85, 'ch2.aux1': 0.8, 'ch3.aux1': 0.5, 'ch4.aux1': 0.95, 'mon.src': 'aux1' },
  'Reverb on the lead': { ...READY, ...REVERB_PATCHED, 'ch4.aux2': 0.85, 'rev.time': 2.6 },
  'Compressor on the lead': { ...READY, ...COMP_ON_LEAD, 'oc.thresh': -32, 'oc.ratio': 4, 'oc.gain': 8 },
  'Compressors on bass and lead': { ...READY, ...COMP_ON_LEAD, 'oc.thresh': -32, 'oc.ratio': 4, 'oc.gain': 8,
    'oc2.in': 'ch2.send', 'ch2.ret': 'oc2.out', 'oc2.thresh': -28, 'oc2.ratio': 6, 'oc2.gain': 6 },
  'Delay and reverb on the lead': { ...READY, ...REVERB_PATCHED, ...DELAY_PATCHED, 'ch4.aux2': 0.8, 'dl.time': 430, 'dl.fb': 0.35, 'fxr2.level': 0.75 },
  'Glued with the bus comp': { ...READY, 'bc.thresh': -20 },
  'Badly gain-staged': { ...READY, 'ch1.gain': 0.2, 'ch1.fader': 1, 'ch4.gain': 1, 'ch4.fader': 0.5 },
};

export const NF4 = {
  id: 'nf4',
  name: 'NF-Mix4',
  brandSub: 'FOUR-CHANNEL MIXING CONSOLE',
  skin: 'studio',
  kind: 'console',
  module: 'js/worklet/console-processor.js',
  processor: 'console-processor',
  card: {
    tagline: 'Signal flow',
    text: 'A four-channel console: mic and line inputs, EQ, inserts and aux sends, with outboard reverb and compression patched in.',
  },
  patchable: true, // patch cables on the patch bay (../../js/cables.js)
  PARAMS, LAYOUT, OUTPUTS, PATCHBAY, OUTBOARD, PLAYER, KEYBED_SECTIONS: [], PRESETS,
};
