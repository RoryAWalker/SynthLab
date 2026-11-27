// NF-C1 compressor: plays a looped source (a drum loop, a bass line, your own file...) through a
// clean feed-forward compressor, and reports its levels so the panel can draw what it is doing.
//
// The signal path, in order:
//   source -> [level detector -> gain computer -> attack/release smoothing]
//          -> gain reduction -> Makeup -> output meters -> speakers (with a little headroom)
// Bypass skips the gain reduction and Makeup, so you hear the sound as it went in.
//
// Detector: the peak level of the signal (both channels linked: the louder one counts), in dB.
// It jumps up at once and falls back over 20 ms, so it reads the peaks of a wave rather than
// dipping to nothing at every zero crossing (a steady tone gives a steady reading).
// Gain computer: the static curve. Below the threshold nothing happens; above it, every
// <ratio> dB of input over the threshold comes out as 1 dB. The knee rounds the corner.
// Smoothing: the gain reduction moves towards its target at the Attack speed when it has to
// increase (the signal got louder) and at the Release speed when it can let go.

const dbToLin = (db) => Math.pow(10, db / 20);
const linToDb = (x) => (x > 1e-6 ? 20 * Math.log10(x) : -120);
// what reaches the speakers: 3 dB down, so a loud source plus some Makeup has headroom (the
// computer's own volume sets how loud you hear it; the meters read before this)
const OUT_LEVEL = 0.7;
// Auto makeup listens: it keeps a running average of how loud the sound is going in and how loud
// it is after compression (over the last few seconds), and turns the sound up by the difference,
// so it comes out about as loud as it went in (as loud as Bypass). A long average keeps it steady
// (a short one would ride the level up and down with the beat). So that it still answers at once
// when Threshold or Ratio move, it jumps by a rule of thumb's estimate of the change (the turn-down
// a sound halfway between the threshold and 0 dB would get) and then fine-tunes by listening.
const autoGuess = (T, ratio) => Math.max(0, (-T / 2) * (1 - 1 / ratio));
const AUTO_TC = 3; // seconds of listening
const AUTO_MAX = 24; // dB, the same as the Makeup pot

class CompProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = {};
    this.sources = {}; // id -> [Float32Array (L), Float32Array (R)]
    this.pos = 0;
    this.playGain = 0; // fades in and out over a few ms, so starting and stopping never clicks
    this.gr = 0; // smoothed gain reduction, dB (positive = turned down)
    this.peak = 0; // the detector's peak level (linear)
    this.frames = []; // level reports since the last message
    this.blockIn = 0; this.blockOut = 0; this.blockGr = 0; this.blockDet = -120; this.blockN = 0;
    this.seq = 0;
    this.msIn = 0; this.msComp = 0; this.autoDb = null; // auto makeup (see above)
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'patch') Object.assign(this.p, m.patch);
      else if (m.type === 'param') {
        // a new source starts from its beginning
        if (m.id === 'src.sound' && m.value !== this.p['src.sound']) this.pos = 0;
        if (m.id === 'src.play' && m.value === 'play' && this.p['src.play'] !== 'play') this.pos = 0;
        this.p[m.id] = m.value;
      } else if (m.type === 'source') {
        this.sources[m.id] = m.chans;
        if (m.id === this.p['src.sound']) this.pos = 0;
      }
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    const n = L.length;
    const p = this.p;
    const src = this.sources[p['src.sound']];
    const playing = p['src.play'] === 'play' && !!src;
    const fade = 1 / (0.006 * sampleRate);

    const T = p['comp.thresh'] ?? -20;
    const ratio = p['comp.ratio'] ?? 4;
    const W = p['comp.knee'] ?? 0;
    const atk = Math.exp(-1 / (Math.max(0.05, p['comp.attack'] ?? 10) * 0.001 * sampleRate));
    const rel = Math.exp(-1 / (Math.max(1, p['comp.release'] ?? 150) * 0.001 * sampleRate));
    const auto = p['comp.auto'] === 'on';
    const guess = autoGuess(T, ratio);
    if (this.autoDb === null) this.autoDb = guess;
    else if (guess !== this.lastGuess && this.msComp > 0) {
      // Threshold or Ratio moved: shift the 'after compression' average by the estimated change
      this.msComp *= Math.pow(10, -(guess - this.lastGuess) / 10);
      if (this.msIn > 1e-7 && this.msComp > 1e-12) this.autoDb = Math.min(AUTO_MAX, Math.max(0, 10 * Math.log10(this.msIn / this.msComp)));
    }
    this.lastGuess = guess;
    const avg = 1 - Math.exp(-1 / (AUTO_TC * sampleRate));
    const on = p['comp.bypass'] !== 'on';
    const listen = OUT_LEVEL;
    const slope = 1 / ratio - 1;
    // the detector lets go over 20 ms, or as fast as the Release if that is faster (so a very fast
    // release can follow the waves of a low note: distortion)
    const peakFall = Math.exp(-1 / (Math.min(0.02, Math.max(1, p['comp.release'] ?? 150) * 0.001) * sampleRate));

    for (let i = 0; i < n; i++) {
      // the source, looping
      let a = 0, b = 0;
      if (src) {
        const sl = src[0], sr = src[1] || src[0];
        if (this.pos >= sl.length) this.pos = 0;
        a = sl[this.pos]; b = sr[this.pos];
        if (playing || this.playGain > 0) this.pos++;
      }
      this.playGain = playing ? Math.min(1, this.playGain + fade) : Math.max(0, this.playGain - fade);
      a *= this.playGain; b *= this.playGain;

      // detector: peak level, channels linked
      const lvl = Math.max(Math.abs(a), Math.abs(b));
      this.peak = lvl > this.peak ? lvl : this.peak * peakFall;
      const x = linToDb(this.peak);
      // gain computer: the static curve
      const over = x - T;
      let y;
      if (2 * over < -W) y = x;
      else if (W > 0 && 2 * Math.abs(over) <= W) y = x + slope * (over + W / 2) * (over + W / 2) / (2 * W);
      else y = T + over / ratio;
      const target = x - y; // how far this sample should be turned down
      // attack / release
      const c = target > this.gr ? atk : rel;
      this.gr = c * this.gr + (1 - c) * target;

      // auto makeup: compare the average loudness in with the average after the gain reduction
      const gGr = dbToLin(-this.gr);
      const pin = (a * a + b * b) * 0.5;
      if (pin > 1e-9) { // only while there is sound (not while stopped or silent)
        this.msIn += avg * (pin - this.msIn);
        this.msComp += avg * (pin * gGr * gGr - this.msComp);
        if (this.msIn > 1e-7 && this.msComp > 1e-12) this.autoDb = Math.min(AUTO_MAX, Math.max(0, 10 * Math.log10(this.msIn / this.msComp)));
      }
      const makeup = auto ? this.autoDb : (p['comp.makeup'] ?? 0);
      const g = on ? dbToLin(makeup) * gGr : 1;
      const oa = a * g, ob = b * g;
      L[i] = oa * listen;
      if (R !== L) R[i] = ob * listen;

      // level reports, one every 128 samples
      const ia = Math.max(Math.abs(a), Math.abs(b)), oo = Math.max(Math.abs(oa), Math.abs(ob));
      if (ia > this.blockIn) this.blockIn = ia;
      if (oo > this.blockOut) this.blockOut = oo;
      if (this.gr > this.blockGr) this.blockGr = this.gr;
      if (x > this.blockDet) this.blockDet = x;
      if (++this.blockN >= 128) {
        this.frames.push(linToDb(this.blockIn), linToDb(this.blockOut), this.blockGr, this.blockDet);
        this.blockIn = this.blockOut = this.blockGr = 0; this.blockDet = -120; this.blockN = 0;
      }
    }
    // the second output is unused (the synths send their oscillators there for the scope)
    if (this.frames.length >= 4 * 8) {
      this.port.postMessage({ type: 'state', seq: ++this.seq, frames: this.frames, gr: this.gr, on, playing, makeup: auto ? this.autoDb : null,
        pos: src ? this.pos / src[0].length : 0, rate: sampleRate / 128 });
      this.frames = [];
    }
    return true;
  }
}

registerProcessor('comp-processor', CompProcessor);
