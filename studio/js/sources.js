// Sounds to feed the processors (the NF-C1 compressor): recordings in audio/, fetched the first
// time they are chosen, plus a test tone made here in code.
//
// To add a recording: put the file in audio/ and add a line to SOURCES, e.g.
//   { id: 'vocal', label: 'Vocal', url: 'audio/vocal.wav' },
// (the Sound selector in units/nfc1.js takes its options from this list). The file should not be
// compressed or limited already (or there is nothing left for the compressor to do), should
// peak around -1 to -3 dB, and loop cleanly. The url is relative to studio/index.html.
// 'user' is a file the student loads from their own computer; it never leaves the browser.

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

// ---- the test tone -----------------------------------------------------------------------------
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

// ---- the NF-Mix4 console's song: four stems that play together, one per channel -------------
// Each stem arrives at the level its source really would: the drum overheads (a condenser
// microphone) 50 dB below the line-level sources (bass DI, keys, lead synth). That gap is why a
// console has Mic and Line inputs and a preamp with so much gain. The stems are stereo files;
// for now everything on the desk is mono, so each is mixed down to one channel.
export const SONG_STEMS = [
  { label: 'Drums', input: 'mic', note: 'condenser overhead mic', url: 'audio/NF-Mix4_Drumkit_01.wav' },
  { label: 'Bass', input: 'line', note: 'DI box (line level)', url: 'audio/NF-Mix4_Bass_02.wav' },
  { label: 'Keys', input: 'line', note: 'keyboard (line level)', url: 'audio/NF-Mix4_Keys_03.wav' },
  { label: 'Lead', input: 'line', note: 'synth (line level)', url: 'audio/NF-Mix4_Lead%20Synth_01.wav' },
];
export const MIC_LOSS_DB = 50; // how far below line level a microphone arrives

let songPending = null;
// The four tracks, mono, at the level each arrives at the desk (downloaded once)
export function loadSong(ctx) {
  if (!songPending) {
    songPending = Promise.all(SONG_STEMS.map(async (st) => {
      const [L, R] = await decode(ctx, await fetchAudio(st.url));
      const g = 0.5 * (st.input === 'mic' ? Math.pow(10, -MIC_LOSS_DB / 20) : 1);
      const m = new Float32Array(L.length);
      for (let i = 0; i < m.length; i++) m[i] = (L[i] + R[i]) * g;
      return m;
    })).then((tracks) => {
      const len = Math.min(...tracks.map((t) => t.length)); // all the same length, so they loop together
      return tracks.map((t) => t.subarray(0, len));
    }).catch((e) => { songPending = null; throw e; });
  }
  return songPending;
}
