// The NF-ModRack's Wavetable oscillator: its tables. A table is a row of frames, each one cycle of a
// wave (256 samples here; the engine makes band-limited copies of each). Position moves through
// them. The setting that holds the table is a string:
//   'b:<name>'               one of the built-in tables below
//   'u:<name>|<base64>'      a table made from an audio file: its frames as 8-bit samples
// The page turns it into frames (Float32Array, 256 each) and hands them to the engine.

import { formantsAt } from './synths/modrack.js';

export const FRAME = 256;
export const MAX_FRAMES = 64;
export const BUILT_IN = [
  ['basic', 'Basic'], ['harmonics', 'Harmonics'], ['pwm', 'PWM'], ['vowels', 'Vowels'], ['sync', 'Sync'],
];

// a frame from harmonic amplitudes (sines, all starting at 0)
function additive(amps) {
  const f = new Float32Array(FRAME);
  amps.forEach((a, i) => { if (a) for (let k = 0; k < FRAME; k++) f[k] += a * Math.sin(2 * Math.PI * (i + 1) * k / FRAME); });
  return f;
}
const N = 32; // frames in a built-in table
const gen = {
  // sine -> triangle -> saw -> square, a third of the way each
  basic: (i) => {
    const t = (i / (N - 1)) * 3, seg = Math.min(2, Math.floor(t)), u = t - seg;
    const shapes = [(n) => (n === 1 ? 1 : 0), (n) => (n % 2 ? (8 / (Math.PI * Math.PI)) * (((n - 1) / 2) % 2 ? -1 : 1) / (n * n) : 0),
      (n) => (2 / Math.PI) * (n % 2 ? 1 : -1) / n, (n) => (n % 2 ? 4 / (Math.PI * n) : 0)];
    return additive(Array.from({ length: 100 }, (_, h) => shapes[seg](h + 1) * (1 - u) + shapes[seg + 1](h + 1) * u));
  },
  // one more harmonic in each frame (each 1/n as loud): from a sine to a bright saw
  harmonics: (i) => additive(Array.from({ length: 100 }, (_, h) => (h <= i * 3 ? 1 / (h + 1) : 0))),
  // a pulse narrowing from 50% to 3%
  pwm: (i) => {
    const w = 0.5 - (i / (N - 1)) * 0.47, f = new Float32Array(FRAME);
    for (let k = 0; k < FRAME; k++) f[k] = k / FRAME < w ? 1 : -1;
    return f;
  },
  // a buzz shaped by a voice's formants, gliding A E I O U (as the Formant module), at 110 Hz
  vowels: (i) => {
    const fm = formantsAt((i / (N - 1)) * 4, 0), bw = 90;
    return additive(Array.from({ length: 100 }, (_, h) => {
      const f = 110 * (h + 1);
      return fm.reduce((a, { f: fc, g }) => a + g / Math.sqrt(1 + Math.pow((f - fc) / bw, 2)), 0) / (h + 1) ** 0.3;
    }));
  },
  // hard sync: a saw restarted by a slower one, the ratio growing from 1 to 8
  sync: (i) => {
    const r = 1 + (i / (N - 1)) * 7, f = new Float32Array(FRAME);
    for (let k = 0; k < FRAME; k++) { const p = ((k / FRAME) * r) % 1; f[k] = 2 * p - 1; }
    return f;
  },
};

const tidy = (frames) => {
  // no DC in any frame, and the loudest frame peaks at 1
  let peak = 0;
  frames.forEach((f) => { const m = f.reduce((a, v) => a + v, 0) / FRAME; for (let k = 0; k < FRAME; k++) { f[k] -= m; peak = Math.max(peak, Math.abs(f[k])); } });
  if (peak > 1e-6) frames.forEach((f) => { for (let k = 0; k < FRAME; k++) f[k] /= peak; });
  return frames;
};

const cache = new Map();
// the frames of a table string (null if it is not one)
export function framesOf(str) {
  if (cache.has(str)) return cache.get(str);
  let frames = null;
  if (typeof str === 'string' && str.startsWith('b:') && gen[str.slice(2)]) {
    frames = tidy(Array.from({ length: N }, (_, i) => gen[str.slice(2)](i)));
  } else if (typeof str === 'string' && str.startsWith('u:') && str.includes('|')) {
    try {
      const bin = atob(str.slice(str.indexOf('|') + 1)), n = Math.floor(bin.length / FRAME);
      if (n >= 1 && n <= MAX_FRAMES) frames = Array.from({ length: n }, (_, i) => Float32Array.from({ length: FRAME }, (_, k) => ((bin.charCodeAt(i * FRAME + k) << 24) >> 24) / 127));
    } catch { frames = null; }
  }
  if (cache.size > 40) cache.clear();
  cache.set(str, frames);
  return frames;
}
export const valid = (str) => typeof str === 'string' && str.length < 40000 && framesOf(str) !== null;
export const tableName = (str) => (str.startsWith('b:') ? (BUILT_IN.find(([k]) => 'b:' + k === str) || [, '?'])[1] : str.slice(2, str.indexOf('|')) || 'Your sound');

// An audio file made into a table: frames of 2048 samples one after another from its start (as a
// wavetable file has them), each one cycle (averaged down to 256 samples), the end of each faded into
// its start so that it loops without a click. Anything after 64 frames, or after the last whole
// frame, is cut off. A file shorter than one frame is stretched to make a single cycle.
export async function tableFromFile(file) {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());
  const len = buf.length, ch = buf.numberOfChannels, mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) mono[i] += d[i] / ch; }
  const CHUNK = 2048, step = CHUNK / FRAME;
  const frames = [];
  if (len < CHUNK) { // shorter than a frame: the whole file is one cycle
    const f = new Float32Array(FRAME);
    for (let k = 0; k < FRAME; k++) { const x = (k / FRAME) * len, i = Math.floor(x), t = x - i; f[k] = (mono[i] || 0) * (1 - t) + (mono[Math.min(len - 1, i + 1)] || 0) * t; }
    frames.push(f);
  }
  const n = Math.min(MAX_FRAMES, Math.floor(len / CHUNK));
  for (let i = 0; i < n; i++) {
    const off = i * CHUNK, f = new Float32Array(FRAME);
    for (let k = 0; k < FRAME; k++) { let a = 0; for (let j = 0; j < step; j++) a += mono[off + k * step + j]; f[k] = a / step; }
    const X = 24; // the last few samples fade into the first: a seamless loop
    for (let k = 0; k < X; k++) { const t = (k + 1) / (X + 1); f[FRAME - X + k] = f[FRAME - X + k] * (1 - t) + f[k] * t; }
    frames.push(f);
  }
  tidy(frames);
  let bin = '';
  frames.forEach((f) => { for (let k = 0; k < FRAME; k++) bin += String.fromCharCode(Math.max(-127, Math.min(127, Math.round(f[k] * 127))) & 255); });
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[|]/g, ' ').slice(0, 40);
  return `u:${name}|${btoa(bin)}`;
}
