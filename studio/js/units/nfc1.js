// NF-C1: the first of the processors, a clean compressor for learning the basics: Threshold,
// Ratio, Attack, Release, Knee and Makeup. It plays a loop through itself (Source), so there is
// always something to compress. No keyboard: the processors work on sounds, not notes.
// Engine: js/worklet/comp-processor.js. Sounds: js/sources.js. Its graphs: js/compScope.js.

import { SOURCES } from '../sources.js';

const db = (v, places = 1) => (v > 0.05 ? '+' : '') + v.toFixed(places) + ' dB';
const ms = (v) => (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v)) + ' ms';
const pct = (v) => Math.round(v * 100) + '%';

export const PARAMS = {
  // ---- source: the sound going in
  'src.play':  { type: 'step', ui: 'led', button: 'Play', label: 'Play / Stop', def: 'stop', options: [{ v: 'stop', label: 'Stopped' }, { v: 'play', label: 'Playing' }] },
  'src.sound': { type: 'step', label: 'Sound', def: 'drums', options: SOURCES.map((s) => ({ v: s.id, label: s.label })) },
  'src.in':    { type: 'cont', label: 'Input', min: -24, max: 12, def: 0, curve: 'lin', unit: 'dB', fmt: (v) => db(v),
                 marks: [[-24, '−24'], [-12, '−12'], [0, '0'], [12, '+12']] },

  // ---- the compressor
  'comp.thresh':  { type: 'cont', label: 'Threshold', min: -60, max: 0, def: -20, curve: 'lin', unit: 'dB', fmt: (v) => db(v),
                    marks: [[-60, '−60'], [-40, '−40'], [-20, '−20'], [0, '0']] },
  'comp.ratio':   { type: 'cont', label: 'Ratio', min: 1, max: 20, def: 4, curve: 'log', unit: ':1',
                    fmt: (v) => (v >= 19.5 ? '20:1 (limiting)' : (v < 10 ? v.toFixed(1) : Math.round(v)) + ':1'),
                    marks: [[1, '1'], [2, '2'], [4, '4'], [10, '10'], [20, '20']] },
  'comp.knee':    { type: 'cont', label: 'Knee', min: 0, max: 24, def: 0, curve: 'lin', unit: 'dB',
                    fmt: (v) => (v < 0.5 ? 'hard' : v.toFixed(0) + ' dB soft'), marks: [[0, 'hard'], [12, '12'], [24, '24']] },
  'comp.attack':  { type: 'cont', label: 'Attack', min: 0.1, max: 200, def: 10, curve: 'log', unit: 'ms', fmt: ms,
                    marks: [[0.1, '.1'], [1, '1'], [10, '10'], [100, '100']] },
  'comp.release': { type: 'cont', label: 'Release', min: 20, max: 3000, def: 150, curve: 'log', unit: 'ms', fmt: ms,
                    marks: [[20, '20'], [100, '100'], [500, '500'], [3000, '3k']] },

  // ---- output
  'comp.on':     { type: 'step', ui: 'led', button: 'Comp In', label: 'Compressor In / Bypass', def: 'in', options: [{ v: 'out', label: 'Bypassed' }, { v: 'in', label: 'In' }] },
  'comp.makeup': { type: 'cont', label: 'Makeup', min: 0, max: 24, def: 0, curve: 'lin', unit: 'dB', fmt: (v) => db(v),
                   marks: [[0, '0'], [6, '6'], [12, '12'], [24, '24']] },
  'mon.vol':     { type: 'cont', label: 'Listen', min: 0, max: 1, def: 0.7, curve: 'lin', fmt: pct },
};

export const LAYOUT = [
  [{ id: 'src', title: 'Source', head: ['src.play'], rows: [['src.sound'], ['src.in']], load: true }],
  [{ id: 'comp', title: 'Compressor', rows: [['comp.thresh', 'comp.ratio', 'comp.knee'], ['comp.attack', 'comp.release', null]] }],
  [{ id: 'out', title: 'Output', head: ['comp.on'], rows: [['comp.makeup'], ['mon.vol']] }],
  [{ id: 'meters', title: 'Meters', rows: [], meters: true }],
];

export const PRESETS = {
  'Init': {},
  'Gentle levelling': { 'src.sound': 'keys', 'comp.thresh': -24, 'comp.ratio': 2, 'comp.knee': 12, 'comp.attack': 20, 'comp.release': 300, 'comp.makeup': 4 },
  'Punchy drums': { 'src.sound': 'drums', 'comp.thresh': -22, 'comp.ratio': 4, 'comp.attack': 30, 'comp.release': 120, 'comp.makeup': 6 },
  'Squashed drums': { 'src.sound': 'drums', 'comp.thresh': -38, 'comp.ratio': 10, 'comp.attack': 0.3, 'comp.release': 60, 'comp.makeup': 14 },
  'Even bass': { 'src.sound': 'bass', 'comp.thresh': -26, 'comp.ratio': 5, 'comp.knee': 6, 'comp.attack': 8, 'comp.release': 200, 'comp.makeup': 8 },
  'Limiter': { 'src.sound': 'drums', 'src.in': 6, 'comp.thresh': -6, 'comp.ratio': 20, 'comp.attack': 0.1, 'comp.release': 80 },
  'Slow attack test': { 'src.sound': 'tone', 'comp.thresh': -24, 'comp.ratio': 8, 'comp.attack': 120, 'comp.release': 400 },
  'Pumping': { 'src.sound': 'drums', 'comp.thresh': -34, 'comp.ratio': 8, 'comp.attack': 2, 'comp.release': 600, 'comp.makeup': 12 },
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
    text: 'See and hear what Threshold, Ratio, Attack and Release do to drums, bass and keys.',
  },
  PARAMS, LAYOUT, KEYBED_SECTIONS: [], PRESETS,
};
