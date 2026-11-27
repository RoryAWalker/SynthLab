// Sounds to feed the processors (the NF-C1 compressor): recordings in audio/, fetched the first
// time they are chosen, plus a test tone made here in code.
//
// To add a recording: put the file in audio/ and add a line to SOURCES, e.g.
//   { id: 'vocal', label: 'Vocal', url: 'audio/vocal.wav' },
// (the Sound selector in units/nfc1.js takes its options from this list). The file should not be
// compressed or limited already (or there is nothing left for the compressor to do), should
// peak around -1 to -3 dB, and loop cleanly. The url is relative to studio/index.html.
// 'user' is a file the student loads from their own computer; it never leaves the browser.
// The made-up drums, bass and keys further down are kept for the NF-4 console's song.

export const SOURCES = [
  { id: 'drums', label: 'Drums', url: 'audio/c1-drums.wav' },
  { id: 'bass', label: 'Bass', url: 'audio/c1-bass.wav' },
  { id: 'keys', label: 'Keys', url: 'audio/c1-keys.wav' },
  { id: 'vocals', label: 'Vocals', url: 'audio/c1-vocals.wav' },
  { id: 'band', label: 'Full band', url: 'audio/c1-band.wav' },
  { id: 'tone', label: 'Test tone', make: makeTone },
  { id: 'user', label: 'Your file' },
];

const cache = {};

// The two channels of a source at the audio's sample rate (made or fetched once, then kept).
// A recording is downloaded only once, even if it is asked for again while still on its way.
export function loadSource(ctx, id) {
  if (cache[id]) return Promise.resolve(cache[id]);
  const s = SOURCES.find((x) => x.id === id);
  if (!s || !(s.make || s.url)) return Promise.resolve(null);
  if (s.make) return Promise.resolve((cache[id] = s.make(ctx.sampleRate)));
  if (!pending[id]) {
    pending[id] = fetchAudio(s.url)
      .then((buf) => decode(ctx, buf))
      .then((chans) => (cache[id] = chans))
      .finally(() => { delete pending[id]; });
  }
  return pending[id];
}
const pending = {};

// a dropped connection is tried again a couple of times before giving up
async function fetchAudio(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return await res.arrayBuffer();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 300 * i));
    }
  }
}

// A file chosen by the student: decoded in the browser and kept as the 'user' source.
export async function loadUserFile(ctx, file) {
  cache.user = await decode(ctx, await file.arrayBuffer());
  cache.user.name = file.name;
  return cache.user;
}
export const userFileName = () => (cache.user && cache.user.name) || '';

async function decode(ctx, buf) {
  const ab = await ctx.decodeAudioData(buf);
  // long files are trimmed to the first 60 seconds, to keep memory sensible
  const len = Math.min(ab.length, Math.round(60 * ab.sampleRate));
  const L = ab.getChannelData(0).slice(0, len);
  const R = ab.numberOfChannels > 1 ? ab.getChannelData(1).slice(0, len) : L;
  return [L, R];
}

// ---- the made-up loops (now only for the NF-4's song) -------------------------------------------------------------------------
// All at 96 BPM, two bars, with a wide range between loud and soft hits: that range is what a
// compressor works on.
const BPM = 96;
const STEP = 60 / BPM / 4; // a sixteenth note, in seconds
const BARS2 = 32 * STEP;

function rng(seed) { // repeatable random numbers, so the loops are the same every time
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

// scale so the loudest sample peaks at -3 dB
function normalise(L, R, peakDb = -3) {
  let m = 0;
  for (let i = 0; i < L.length; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
  const g = m > 0 ? Math.pow(10, peakDb / 20) / m : 1;
  for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; }
  return [L, R];
}

// add a mono sound into the stereo buffers at time t (seconds), panned (-1 left .. 1 right)
function place(L, R, sr, t, sound, pan = 0) {
  const start = Math.round(t * sr);
  const gl = Math.sqrt((1 - pan) / 2) * Math.SQRT2, gr = Math.sqrt((1 + pan) / 2) * Math.SQRT2;
  for (let i = 0; i < sound.length; i++) {
    const j = (start + i) % L.length; // tails wrap round to the start, so the loop is seamless
    L[j] += sound[i] * gl; R[j] += sound[i] * gr;
  }
}

function makeDrums(sr) {
  const len = Math.round(BARS2 * sr);
  const L = new Float32Array(len), R = new Float32Array(len);
  const rand = rng(7);
  const kick = (vel) => {
    const n = Math.round(0.5 * sr), s = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += 2 * Math.PI * (46 + 110 * Math.exp(-t / 0.035)) / sr;
      s[i] = vel * (Math.sin(ph) * Math.exp(-t / 0.32) + 0.4 * rand() * Math.exp(-t / 0.004));
    }
    return s;
  };
  const snare = (vel) => {
    const n = Math.round(0.35 * sr), s = new Float32Array(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const nz = rand();
      lp += 0.25 * (nz - lp); // take some lows out of the noise (noise minus its low-passed self)
      s[i] = vel * (0.55 * Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t / 0.06) + 0.75 * (nz - lp) * Math.exp(-t / 0.11));
    }
    return s;
  };
  const hat = (vel, open = false) => {
    const n = Math.round((open ? 0.4 : 0.09) * sr), s = new Float32Array(n);
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const nz = rand();
      a += 0.6 * (nz - a); b += 0.6 * (a - b); // a high-pass made from two low-passes
      s[i] = vel * 0.6 * (nz - b) * Math.exp(-t / (open ? 0.12 : 0.022));
    }
    return s;
  };
  // [step, velocity]: a straight beat with soft ghost notes, so there is plenty of dynamic range
  [[0, 1], [6, 0.75], [10, 0.5], [16, 1], [22, 0.8], [25, 0.45], [26, 0.6]].forEach(([st, v]) => place(L, R, sr, st * STEP, kick(v)));
  [[4, 0.95], [12, 1], [20, 0.95], [28, 1]].forEach(([st, v]) => place(L, R, sr, st * STEP, snare(v)));
  [[7, 0.18], [9, 0.14], [15, 0.22], [23, 0.16], [30, 0.2], [31, 0.28]].forEach(([st, v]) => place(L, R, sr, st * STEP, snare(v), -0.1));
  for (let st = 0; st < 32; st += 2) {
    if (st === 14 || st === 30) continue;
    place(L, R, sr, st * STEP, hat(st % 4 === 0 ? 0.32 : 0.2), 0.35);
  }
  place(L, R, sr, 14 * STEP, hat(0.3, true), 0.35);
  place(L, R, sr, 30 * STEP, hat(0.26, true), 0.35);
  return normalise(L, R);
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function makeBass(sr) {
  const len = Math.round(BARS2 * sr);
  const L = new Float32Array(len), R = new Float32Array(len);
  // [step, length in steps, note, velocity]: some notes slapped hard, some barely touched
  const notes = [[0, 3, 33, 1], [3, 1, 33, 0.35], [4, 2, 45, 0.6], [6, 2, 33, 0.4], [8, 3, 36, 0.95], [11, 1, 38, 0.3],
    [12, 4, 40, 0.7], [16, 3, 31, 1], [19, 1, 31, 0.3], [20, 2, 43, 0.55], [22, 2, 31, 0.35], [24, 4, 38, 0.9], [28, 2, 36, 0.45], [30, 2, 35, 0.6]];
  notes.forEach(([st, dur, m, v]) => {
    const f = mtof(m), n = Math.round((dur * STEP + 0.06) * sr), s = new Float32Array(n);
    const gate = dur * STEP * 0.92;
    let ph = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph = (ph + f / sr) % 1;
      const saw = 2 * ph - 1;
      const fc = 120 + 1800 * v * Math.exp(-t / 0.09); // brighter when played harder
      const k = 1 - Math.exp(-2 * Math.PI * fc / sr);
      y1 += k * (saw - y1); y2 += k * (y1 - y2);
      const env = Math.min(1, t / 0.003) * Math.exp(-t / 0.7) * (t < gate ? 1 : Math.exp(-(t - gate) / 0.012));
      s[i] = v * y2 * env;
    }
    place(L, R, sr, st * STEP, s);
  });
  return normalise(L, R);
}

function makeKeys(sr) {
  const len = Math.round(BARS2 * sr);
  const L = new Float32Array(len), R = new Float32Array(len);
  // chords, [step, velocity, notes]: strong on the beat, soft pushes in between
  const chords = [[0, 1, [57, 60, 64, 67]], [6, 0.3, [57, 60, 64]], [10, 0.45, [57, 60, 64, 67]],
    [16, 0.95, [53, 57, 60, 64]], [22, 0.3, [53, 57, 60]], [26, 0.55, [55, 59, 62, 65]], [30, 0.25, [55, 59, 62]]];
  const rand = rng(3);
  chords.forEach(([st, v, ns]) => ns.forEach((m, k) => {
    const f = mtof(m), n = Math.round(2.2 * sr), s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const tone = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t / 0.25) + 0.12 * Math.sin(6 * Math.PI * f * t) * Math.exp(-t / 0.12);
      s[i] = 0.3 * v * tone * Math.min(1, t / 0.002) * Math.exp(-t / 0.9) * (t > 2.1 ? (2.2 - t) / 0.1 : 1);
    }
    place(L, R, sr, st * STEP + 0.004 * k + 0.002 * rand(), s, (k / (ns.length - 1)) * 0.6 - 0.3);
  }));
  return normalise(L, R);
}

// A steady tone that steps between quiet (-30 dB) and loud (-6 dB) every second: the clearest
// way to see the threshold, the ratio, and how long the attack and release take.
function makeTone(sr) {
  const len = Math.round(2 * sr);
  const L = new Float32Array(len), R = new Float32Array(len);
  const f = 1000; // the standard test tone; a whole number of cycles in each second, so the steps join cleanly
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const db = t < 1 ? -30 : -6;
    L[i] = R[i] = Math.pow(10, db / 20) * Math.sin(2 * Math.PI * f * t);
  }
  return [L, R];
}

// ---- the NF-4 console's song: four stems that play together, one per channel -------------
// Each stem arrives at the level its source really would: the two microphones (drum overheads
// and the lead, both condenser mics) about 50 dB below the two line-level sources (bass DI and
// keys). That gap is why a console has Mic and Line inputs and a preamp with so much gain.
export const SONG_STEMS = [
  { label: 'Drums', input: 'mic', note: 'condenser overhead mic' },
  { label: 'Bass', input: 'line', note: 'DI box (line level)' },
  { label: 'Keys', input: 'line', note: 'keyboard (line level)' },
  { label: 'Lead', input: 'mic', note: 'condenser vocal mic' },
];
const MIC_PEAK = -58, LINE_PEAK = -8; // dBFS peaks of the stems as they arrive

export function makeSong(sr) {
  const mono = ([L, R]) => { const m = new Float32Array(L.length); for (let i = 0; i < m.length; i++) m[i] = (L[i] + R[i]) / 2; return m; };
  const stems = [mono(makeDrums(sr)), mono(makeBass(sr)), mono(makeKeys(sr)), makeLead(sr)];
  return stems.map((s, i) => {
    let pk = 0;
    for (let j = 0; j < s.length; j++) pk = Math.max(pk, Math.abs(s[j]));
    const g = Math.pow(10, (SONG_STEMS[i].input === 'mic' ? MIC_PEAK : LINE_PEAK) / 20) / (pk || 1);
    for (let j = 0; j < s.length; j++) s[j] *= g;
    return s;
  });
}
let songCache = null;
export function loadSong(ctx) { return (songCache = songCache || makeSong(ctx.sampleRate)); }

// A singing lead line, standing in for a vocal: a buzzy tone through two vowel-like resonances,
// with vibrato that grows on long notes, and phrases that swell and fade (lots of dynamics).
function makeLead(sr) {
  const len = Math.round(BARS2 * sr);
  const out = new Float32Array(len);
  // [step, length in steps, note, loudness]
  const notes = [[2, 2, 64, 0.5], [4, 4, 67, 0.8], [8, 2, 69, 0.6], [10, 6, 67, 1], [18, 2, 62, 0.4], [20, 3, 64, 0.65], [23, 1, 62, 0.35], [24, 6, 60, 0.9]];
  const bp = (f, q) => { // a resonant band-pass (state variable)
    const st = { lo: 0, bd: 0 }, k = 2 * Math.sin(Math.PI * f / sr), d = 1 / q;
    return (x) => { st.lo += k * st.bd; const hi = x - st.lo - d * st.bd; st.bd += k * hi; return st.bd; };
  };
  notes.forEach(([stp, dur, m, v]) => {
    const f = mtof(m), n = Math.round((dur * STEP + 0.15) * sr), gate = dur * STEP;
    const f1 = bp(700, 6), f2 = bp(1150, 8), f3 = bp(2600, 10);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const vib = 1 + 0.006 * Math.min(1, t / 0.4) * Math.sin(2 * Math.PI * 5.4 * t);
      ph = (ph + f * vib / sr) % 1;
      const src = 2 * ph - 1;
      const swell = Math.min(1, t / 0.06) * (t < gate ? 0.75 + 0.25 * Math.sin(Math.PI * Math.min(1, t / gate)) : Math.exp(-(t - gate) / 0.05));
      const y = (f1(src) + 0.7 * f2(src) + 0.25 * f3(src)) * v * swell;
      out[(Math.round(stp * STEP * sr) + i) % len] += y;
    }
  });
  return out;
}
