// NF-C1: the first of the processors, a clean compressor for learning the basics: Threshold,
// Ratio, Attack, Release, Knee and Makeup, with Bypass to compare. A loop player (a separate
// unit above it) feeds it, so there is always something to compress: recorded drums, bass, keys and the full band, a test tone, or a
// file of the student's own. No keyboard: the processors work on sounds, not notes.
// Engine: js/worklet/comp-processor.js. Sounds: js/sources.js. Its graphs: js/compScope.js.

import { SOURCES } from '../sources.js';

const db = (v, places = 1) => (v > 0.05 ? '+' : '') + v.toFixed(places) + ' dB';
const ms = (v) => (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v)) + ' ms';

export const PARAMS = {
  // ---- the loop player: a separate unit above the compressor, playing the sound going in
  'src.play':  { type: 'step', ui: 'led', button: 'Play', label: 'Play / Stop', def: 'stop', options: [{ v: 'stop', label: 'Stopped' }, { v: 'play', label: 'Playing' }] },
  'src.sound': { type: 'step', ui: 'choice', label: 'Sound', def: 'drums', options: SOURCES.map((s) => ({ v: s.id, label: s.label })) },

  // ---- the compressor, in signal order
  'comp.thresh':  { type: 'cont', label: 'Threshold', min: -60, max: 0, def: -20, curve: 'lin', unit: 'dB', fmt: (v) => db(v),
                    marks: [[-60, '−60'], [-40, '−40'], [-20, '−20'], [0, '0']] },
  'comp.ratio':   { type: 'cont', label: 'Ratio', min: 1, max: 20, def: 4, curve: 'log', unit: ':1',
                    fmt: (v) => (v >= 19.5 ? '20:1 (limiting)' : (v < 10 ? v.toFixed(1) : Math.round(v)) + ':1'),
                    marks: [[1, '1'], [2, '2'], [4, '4'], [10, '10'], [20, '20']] },
  'comp.knee':    { type: 'cont', label: 'Knee', min: 0, max: 24, def: 0, curve: 'lin', unit: 'dB',
                    fmt: (v) => (v < 0.5 ? 'hard' : v.toFixed(0) + ' dB soft'), marks: [[0, 'hard'], [12, '12'], [24, '24']] },
  // a taper that gives the usual 10-100 ms most of the travel (a log taper crowds it into a third)
  'comp.attack':  { type: 'cont', label: 'Attack', min: 0.1, max: 200, def: 10, curve: 'pow', k: 3, unit: 'ms', fmt: ms,
                    marks: [[0.1, '.1'], [1, '1'], [10, '10'], [30, '30'], [100, '100'], [200, '200']] },
  // down to 5 ms: so fast it follows the waves of low notes and distorts them (on purpose: try it on Bass)
  'comp.release': { type: 'cont', label: 'Release', min: 5, max: 3000, def: 150, curve: 'log', unit: 'ms', fmt: ms,
                    marks: [[5, '5'], [20, '20'], [100, '100'], [500, '500'], [3000, '3k']] },
  'comp.makeup':  { type: 'cont', label: 'Makeup', min: 0, max: 24, def: 0, curve: 'lin', unit: 'dB', fmt: (v) => db(v),
                    marks: [[0, '0'], [6, '6'], [12, '12'], [24, '24']] },
  // Auto makeup: the unit sets the makeup itself, by listening (see comp-processor.js); the
  // Makeup pot turns to show the amount while it is on.
  'comp.auto':    { type: 'step', ui: 'led', button: 'Auto', label: 'Auto makeup', def: 'off', options: [{ v: 'off', label: 'Off (use the Makeup pot)' }, { v: 'on', label: 'On' }] },
  // off by default: press it to hear the sound with no compression, to compare
  'comp.bypass':  { type: 'step', ui: 'led', button: 'Bypass', label: 'Bypass', def: 'off', options: [{ v: 'off', label: 'Compressing' }, { v: 'on', label: 'Bypassed' }] },
};

// The player is its own unit (PLAYER); the compressor's faceplate has one row of pots and the meters.
export const PLAYER = { id: 'src', title: 'Loop Player', play: 'src.play', sound: 'src.sound' };
export const LAYOUT = [
  [{ id: 'comp', title: 'Compressor', rows: [['comp.thresh', 'comp.ratio', 'comp.knee', 'comp.attack', 'comp.release', ['comp.makeup', 'comp.auto']]] }],
  [{ id: 'meters', title: 'Meters', head: ['comp.bypass'], rows: [], meters: true }],
];

export const PRESETS = {
  'Init': {},
  'Gentle levelling': { 'src.sound': 'keys', 'comp.thresh': -24, 'comp.ratio': 2, 'comp.knee': 12, 'comp.attack': 20, 'comp.release': 300, 'comp.makeup': 8 },
  'Punchy drums': { 'src.sound': 'drums', 'comp.thresh': -22, 'comp.ratio': 4, 'comp.attack': 30, 'comp.release': 120, 'comp.makeup': 3 },
  'Squashed drums': { 'src.sound': 'drums', 'comp.thresh': -38, 'comp.ratio': 10, 'comp.attack': 0.3, 'comp.release': 60, 'comp.makeup': 20 },
  'Even bass': { 'src.sound': 'bass', 'comp.thresh': -22, 'comp.ratio': 5, 'comp.knee': 6, 'comp.attack': 8, 'comp.release': 200, 'comp.makeup': 6 },
  'Limiter': { 'src.sound': 'drums', 'comp.thresh': -12, 'comp.ratio': 20, 'comp.attack': 0.1, 'comp.release': 80 },
  'Slow attack test': { 'src.sound': 'tone', 'comp.thresh': -24, 'comp.ratio': 8, 'comp.attack': 120, 'comp.release': 400 },
  'Glue the band': { 'src.sound': 'band', 'comp.thresh': -13, 'comp.ratio': 2, 'comp.knee': 6, 'comp.attack': 30, 'comp.release': 200, 'comp.makeup': 1 },
  'Pumping': { 'src.sound': 'drums', 'comp.thresh': -34, 'comp.ratio': 8, 'comp.attack': 2, 'comp.release': 600, 'comp.makeup': 16 },
};

export const NFC1 = {
  id: 'nfc1',
  name: 'NF-C1',
  brandSub: 'EDUCATIONAL COMPRESSOR',
  skin: 'studio', // one faceplate, like a studio rack unit (each processor type gets its own colour)
  kind: 'processor', // no keyboard: plays a sound through itself
  module: 'js/worklet/comp-processor.js',
  processor: 'comp-processor',
  card: {
    tagline: 'Your first compressor',
    text: 'See and hear what Threshold, Ratio, Attack and Release do to drums, bass, keys and a full band.',
  },
  PARAMS, LAYOUT, PLAYER, KEYBED_SECTIONS: [], PRESETS,
};
