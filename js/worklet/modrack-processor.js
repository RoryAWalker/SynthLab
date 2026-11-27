// NF-ModRack voice: an open rack of modules, running in an AudioWorklet.
// The modules (and their sound) are the NF-Modular's (see nfmod-processor.js), but here the rack is
// whatever the patch says: 'rack.layout' lists the modules, row by row, and every connection is
// a patch cable ('jack.<module>.<input>': '<output>,<output>...').
//
// When the layout or a cable changes, the rack is "compiled": each module gets a slot in one array
// of signals for each of its outputs, and each input becomes a list of the slots plugged into it.
// Each sample the Keyboard and Sequencer run first, then the modules in rack order (left to right,
// top row first); a cable that runs "backwards" in that order reads the previous sample. A module
// kept in the rack keeps its state (phase, envelope...) when the rack is recompiled.
//
// Signal conventions (like voltages on a real modular):
//   pitch  - octaves above middle C (1 V/octave)
//   gate   - 0 or 1;  trigger - a 1 lasting a few milliseconds
//   env    - 0..1 (the inverted output: 0..-1)
//   LFO, S&H, audio - about -1..1

const TWO_PI = Math.PI * 2;
const OUTPUT_GAIN = 0.5;
const C4 = 261.6256;
const FM_OCTAVES = 2;
const CUTOFF_CV_OCTAVES = 6;
const LFO_RATE_CV_OCTAVES = 4;
const TRIG_SECONDS = 0.005;
// virtual analogue (as on the NF-Modular): tiny fixed errors per part, slow drift, per-note variation
const tol = (spread) => 1 + (Math.random() * 2 - 1) * spread;
const TUNE_TOL = 0.0012;
const DRIFT_OCT = 0.0017;
const DRIFT_SECONDS = 1.6;
const ENV_NOTE_VAR = 0.03;
// feedback safety: every output held within +-LIMIT; the final output softly limited
const LIMIT = 10;
const lim = (v) => (v !== v ? 0 : v > LIMIT ? LIMIT : v < -LIMIT ? -LIMIT : v);
const CEILING = 0.8;
const NONE = new Int32Array(0);

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
function lfoWave(shape, ph) {
  return shape === 'saw' ? 2 * ph - 1 : shape === 'square' ? (ph < 0.5 ? 1 : -1)
    : shape === 'sine' ? Math.sin(TWO_PI * (ph - 0.25)) : 1 - 4 * Math.abs(ph - 0.5);
}
const mixGain = (L) => (L <= 10 ? L / 10 : Math.pow(2, (L - 10) * 3));
const fold = (x) => { const t = (x + 1) * 0.25; return 4 * Math.abs(t - Math.floor(t + 0.5)) - 1; };
function mixShape(mode, x, boost) {
  if (mode === 'drive') return Math.tanh(x * 4) * 0.7;
  if (mode === 'fold') return fold(x * 3) * 0.8;
  return x / boost;
}

// ---- modules ------------------------------------------------------------------------------------
// Each module: OUTS (its outputs, in order) and INS (its inputs); begin(p, sr) reads its settings
// once a block; tick(S, i) runs one sample, reading inputs with this.r(name) and writing its
// outputs to S[this.o + k]. reset() clears anything a runaway loop may have broken.
class Module {
  constructor(id) { this.id = id; this.o = 0; this.in = {}; }
  // the sum of everything plugged into an input
  r(name) {
    const a = this.in[name], S = this.S;
    if (a.length === 1) return S[a[0]];
    let s = 0;
    for (let q = 0; q < a.length; q++) s += S[a[q]];
    return s;
  }
  has(name) { return this.in[name].length > 0; }
  q(p, k) { return p[`${this.id}.${k}`]; }
  begin() {}
  reset() {}
}

class VCO extends Module {
  static OUTS = ['saw', 'sq', 'tri'];
  static INS = ['pitch', 'fm', 'pwm', 'sync'];
  constructor(id) {
    super(id);
    this.ph = Math.random(); this.syncWas = 0;
    this.tolTune = (Math.random() * 2 - 1) * TUNE_TOL;
    this.drift = { v: (Math.random() * 2 - 1) * DRIFT_OCT, t: (Math.random() * 2 - 1) * DRIFT_OCT };
  }
  begin(p, sr, n) {
    const d = this.drift;
    if (Math.random() < (n / sr) / DRIFT_SECONDS) d.t = (Math.random() * 2 - 1) * DRIFT_OCT;
    d.v += (d.t - d.v) * 0.004;
    this.oct = this.q(p, 'range') + this.q(p, 'tune') / 12 + this.tolTune + d.v;
    this.pw = this.q(p, 'pw'); this.fm = this.q(p, 'fm') * FM_OCTAVES; this.pwm = this.q(p, 'pwm') * 0.45;
    this.sr = sr; this.nyq = sr * 0.45;
  }
  tick(S) {
    let pw = this.pw + this.r('pwm') * this.pwm; pw = pw < 0.05 ? 0.05 : pw > 0.95 ? 0.95 : pw;
    let f = C4 * Math.pow(2, this.oct + this.r('pitch') + this.r('fm') * this.fm);
    if (f > this.nyq) f = this.nyq; else if (f < 0.01) f = 0.01;
    const dt = f / this.sr;
    const sync = this.r('sync');
    if (sync > 0 && this.syncWas <= 0) this.ph = 0;
    this.syncWas = sync;
    const ph = this.ph, d = Math.min(dt, 0.49), o = this.o;
    S[o] = 2 * ph - 1 - polyBlep(ph, d);
    let sq = ph < pw ? 1 : -1;
    sq += polyBlep(ph, d);
    let t2 = ph - pw; if (t2 < 0) t2 += 1;
    sq -= polyBlep(t2, d);
    S[o + 1] = sq - (2 * pw - 1);
    S[o + 2] = 1 - 4 * Math.abs(ph - 0.5);
    this.ph += dt; if (this.ph >= 1) this.ph -= Math.floor(this.ph);
  }
}

class Noise extends Module {
  static OUTS = ['white', 'pink', 'col'];
  static INS = ['cv'];
  constructor(id) { super(id); this.pk = [0, 0, 0]; this.lp = 0; this.hp = 0; this.prev = 0; this.n = 0; }
  coefs(cl) {
    this.lpA = cl < 0 ? 1 - Math.exp(-TWO_PI * 20000 * Math.pow(2, cl * 7) / this.sr) : 1;
    this.hpA = cl > 0 ? Math.exp(-TWO_PI * 200 * Math.pow(2, cl * 5.6) / this.sr) : 0;
    this.gain = 1 + Math.abs(cl) * 1.5;
    this.col = cl;
  }
  begin(p, sr) { this.sr = sr; this.colour = this.q(p, 'colour'); this.coefs(this.colour); }
  tick(S) {
    const white = Math.random() * 2 - 1, pk = this.pk, o = this.o;
    pk[0] = 0.99765 * pk[0] + white * 0.099046;
    pk[1] = 0.963 * pk[1] + white * 0.2965164;
    pk[2] = 0.57 * pk[2] + white * 1.0526913;
    S[o] = white * 0.7;
    S[o + 1] = (pk[0] + pk[1] + pk[2] + white * 0.1848) * 0.16;
    if (this.has('cv') && (this.n++ & 15) === 0) {
      let c = this.colour + this.r('cv');
      c = c < -1 ? -1 : c > 1 ? 1 : c;
      this.coefs(c);
    }
    this.lp += (white - this.lp) * this.lpA;
    this.hp = this.hpA * (this.hp + this.lp - this.prev); this.prev = this.lp;
    S[o + 2] = (this.col > 0 ? this.hp : this.lp) * 0.7 * this.gain;
  }
  reset() { this.lp = this.hp = this.prev = 0; this.pk.fill(0); }
}

class Mixer extends Module {
  static OUTS = ['out'];
  static INS = ['in1', 'in2', 'in3', 'in4'];
  begin(p) {
    this.lv = [1, 2, 3, 4].map((k) => mixGain(this.q(p, 'l' + k)));
    this.boost = Math.max(1, ...this.lv);
    this.mode = this.q(p, 'mode');
  }
  tick(S) {
    const lv = this.lv;
    S[this.o] = lim(mixShape(this.mode, this.r('in1') * lv[0] + this.r('in2') * lv[1] + this.r('in3') * lv[2] + this.r('in4') * lv[3], this.boost));
  }
}

// VCF: LP (4-pole ladder), HP (2-pole state-variable) and BP (the HP low-passed); Width spreads them
class VCF extends Module {
  static OUTS = ['lp', 'bp', 'hp'];
  static INS = ['in', 'cv', 'key', 'res'];
  constructor(id) { super(id); this.s = [0, 0, 0, 0]; this.ic1 = this.ic2 = this.ic3 = this.ic4 = 0; this.tolCut = Math.log2(tol(0.02)); this.fc = 1000; }
  begin(p, sr) {
    this.cut = Math.log2(this.q(p, 'cutoff')) + this.tolCut; this.cvDepth = this.q(p, 'cv') * CUTOFF_CV_OCTAVES;
    this.halfW = this.q(p, 'width') / 2; this.res = this.q(p, 'res'); this.cvAmt = this.q(p, 'cv');
    this.sr = sr; this.nyq = sr * 0.45;
  }
  tick(S) {
    const s = this.s, sr = this.sr, nyq = this.nyq, o = this.o;
    const x = this.r('in') + (Math.random() - 0.5) * 2e-5;
    const centre = this.cut + this.r('cv') * this.cvDepth + this.r('key');
    let fc = Math.pow(2, centre + this.halfW);
    if (fc > nyq) fc = nyq; else if (fc < 8) fc = 8;
    let fcH = Math.pow(2, centre - this.halfW);
    if (fcH > nyq) fcH = nyq; else if (fcH < 8) fcH = 8;
    let res = this.res + this.r('res') * this.cvAmt;
    res = res < 0 ? 0 : res > 1 ? 1 : res;
    const gg = Math.tan(Math.PI * fc / sr);
    const G = gg / (1 + gg), G2 = G * G, G4 = G2 * G2;
    const fb = res * 4.15;
    const sigma = (G2 * G * s[0] + G2 * s[1] + G * s[2] + s[3]) / (1 + gg);
    const y4est = (G4 * x + sigma) / (1 + fb * G4);
    let u = Math.tanh(x - fb * y4est);
    for (let j = 0; j < 4; j++) {
      const v = (u - s[j]) * G;
      const y = v + s[j];
      s[j] = y + v;
      u = y;
    }
    S[o] = lim(u * (1 + fb * 0.45));
    const k = 2 - 1.96 * res;
    const gA = Math.tan(Math.PI * fcH / sr);
    const a1 = 1 / (1 + gA * (gA + k)), a2 = gA * a1, a3 = gA * a2;
    const sv3 = x - this.ic2;
    const sv1 = a1 * this.ic1 + a2 * sv3;
    const sv2 = this.ic2 + a2 * this.ic1 + a3 * sv3;
    this.ic1 = 2 * sv1 - this.ic1; this.ic2 = 2 * sv2 - this.ic2;
    const hp = x - k * sv1 - sv2;
    S[o + 2] = lim(hp);
    const b1 = 1 / (1 + gg * (gg + k)), b2 = gg * b1, b3 = gg * b2;
    const sw3 = hp - this.ic4;
    const sw1 = b1 * this.ic3 + b2 * sw3;
    const sw2 = this.ic4 + b2 * this.ic3 + b3 * sw3;
    this.ic3 = 2 * sw1 - this.ic3; this.ic4 = 2 * sw2 - this.ic4;
    S[o + 1] = lim(sw2 * (0.6 + k * 0.4));
    this.fc = fc;
  }
  reset() { this.s.fill(0); this.ic1 = this.ic2 = this.ic3 = this.ic4 = 0; }
  ok() { const s = this.s; return Number.isFinite(s[0] + s[1] + s[2] + s[3] + this.ic1 + this.ic2 + this.ic3 + this.ic4); }
}

class Ring extends Module {
  static OUTS = ['out'];
  static INS = ['a', 'b'];
  begin(p) { this.mix = this.q(p, 'mix'); }
  tick(S) { const a = this.r('a'); S[this.o] = lim(a * (1 - this.mix) + a * this.r('b') * this.mix); }
}

class VCA extends Module {
  static OUTS = ['out'];
  static INS = ['in', 'cv'];
  begin(p) { this.level = this.q(p, 'level'); this.cv = this.q(p, 'cv'); }
  tick(S) {
    let g = this.level + this.r('cv') * this.cv;
    g = g < 0 ? 0 : g > 1 ? 1 : g;
    S[this.o] = lim(this.r('in') * g);
  }
}

class Att extends Module {
  static OUTS = ['out1', 'out2'];
  static INS = ['in1', 'in2'];
  begin(p) { this.a1 = this.q(p, 'a1'); this.a2 = this.q(p, 'a2'); }
  tick(S) {
    S[this.o] = lim(this.has('in1') ? this.r('in1') * this.a1 : this.a1);
    S[this.o + 1] = lim(this.has('in2') ? this.r('in2') * this.a2 : this.a2);
  }
}

// Exponential ('curved') or Linear envelope, as on the NF-Modular
class Env extends Module {
  static OUTS = ['out', 'inv'];
  static INS = ['gate'];
  constructor(id) { super(id); this.v = 0; this.stage = 0; this.was = 0; this.relFrom = 0; this.tol = tol(0.02); this.jit = 1; this.tOn = 0; this.tOff = 0; }
  begin(p, sr) {
    this.linear = this.q(p, 'curve') === 'linear';
    const k = this.tol * this.jit;
    const a = this.q(p, 'a') * k, d = this.q(p, 'd') * k, r = this.q(p, 'r') * k;
    this.aCoef = 1 - Math.exp(-1.466 / (a * sr));
    this.dCoef = 1 - Math.exp(-4.6 / (d * sr));
    this.rCoef = 1 - Math.exp(-4.6 / (r * sr));
    this.aStep = 1 / (a * sr); this.dStep = 1 / (d * sr); this.rStep = 1 / (r * sr);
    this.s = this.q(p, 's');
  }
  tick(S) {
    const g = this.r('gate') > 0.5 ? 1 : 0;
    if (g && !this.was) { this.stage = 1; this.tOn = 0; this.jit = tol(ENV_NOTE_VAR); }
    else if (!g && this.was && this.stage !== 0) { this.stage = 3; this.tOff = 0; this.relFrom = this.v; }
    this.was = g;
    if (this.linear) this.nextLinear(); else this.nextCurved();
    S[this.o] = this.v; S[this.o + 1] = -this.v;
  }
  nextCurved() {
    switch (this.stage) {
      case 1: this.v += (1.3 - this.v) * this.aCoef; if (this.v >= 1) { this.v = 1; this.stage = 2; } break;
      case 2: this.v += (this.s - this.v) * this.dCoef; break;
      case 3: this.v += (0 - this.v) * this.rCoef; if (this.v < 1e-5) { this.v = 0; this.stage = 0; } break;
    }
  }
  nextLinear() {
    switch (this.stage) {
      case 1: this.v += this.aStep; if (this.v >= 1) { this.v = 1; this.stage = 2; } break;
      case 2:
        if (this.v > this.s) this.v = Math.max(this.s, this.v - Math.max(0.02, 1 - this.s) * this.dStep);
        else this.v = Math.min(this.s, this.v + this.dStep);
        break;
      case 3: this.v -= this.relFrom * this.rStep; if (this.v <= 1e-5) { this.v = 0; this.stage = 0; } break;
    }
  }
  report() { return { s: this.stage, v: this.v, tOn: this.tOn, tOff: this.tOff }; }
}

class LFO extends Module {
  static OUTS = ['out'];
  static INS = ['gate', 'rate'];
  constructor(id) { super(id); this.ph = Math.random(); this.gateWas = 0; this.tol = tol(0.01); }
  begin(p, sr) { this.shape = this.q(p, 'shape'); this.rate = this.q(p, 'rate') * this.tol; this.rcv = this.q(p, 'rcv') * LFO_RATE_CV_OCTAVES; this.sr = sr; }
  tick(S) {
    const g = this.r('gate') > 0.5 ? 1 : 0;
    if (g && !this.gateWas) this.ph = this.shape === 'tri' || this.shape === 'sine' ? 0.25 : 0;
    this.gateWas = g;
    this.ph += (this.rate * Math.pow(2, this.r('rate') * this.rcv)) / this.sr;
    if (this.ph >= 1) this.ph -= Math.floor(this.ph);
    S[this.o] = lfoWave(this.shape, this.ph);
  }
}

class MFO extends Module {
  static OUTS = ['out'];
  static INS = ['gate', 'fm'];
  constructor(id) { super(id); this.ph = Math.random(); this.gateWas = 0; this.tol = tol(0.01); }
  begin(p, sr) {
    this.shape = this.q(p, 'shape'); this.rate = this.q(p, 'rate') * this.tol; this.fm = this.q(p, 'fm') * 4;
    this.tz = this.q(p, 'fmmode') === 'tz'; this.uni = this.q(p, 'pol') === 'uni'; this.sr = sr;
  }
  tick(S) {
    const g = this.r('gate') > 0.5 ? 1 : 0;
    if (g && !this.gateWas) this.ph = this.shape === 'tri' || this.shape === 'sine' ? 0.25 : 0;
    this.gateWas = g;
    let f = this.rate * (1 + this.r('fm') * this.fm);
    if (!this.tz && f < 0) f = 0;
    this.ph += f / this.sr; this.ph -= Math.floor(this.ph);
    const w = lfoWave(this.shape, this.ph);
    S[this.o] = this.uni ? (w + 1) / 2 : w;
  }
}

class SH extends Module {
  static OUTS = ['out'];
  static INS = ['in', 'clock'];
  constructor(id) { super(id); this.val = 0; this.out = 0; this.clockWas = 0; this.ph = Math.random(); this.tol = tol(0.01); }
  begin(p, sr) {
    this.inc = this.q(p, 'rate') * this.tol / sr;
    const lag = this.q(p, 'lag');
    this.lag = lag > 0.001 ? 1 - Math.exp(-4.6 / (lag * sr)) : 1;
  }
  tick(S) {
    let tick = false;
    if (this.has('clock')) {
      const clk = this.r('clock');
      tick = clk > 0.2 && this.clockWas <= 0.2;
      this.clockWas = clk;
    } else {
      this.ph += this.inc;
      if (this.ph >= 1) { this.ph -= 1; tick = true; }
    }
    if (tick) this.val = this.has('in') ? this.r('in') : Math.random() * 2 - 1;
    this.out += (this.val - this.out) * this.lag;
    S[this.o] = this.out;
  }
  reset() { this.val = this.out = 0; }
  ok() { return Number.isFinite(this.out); }
}

// ---- the two resonators: Ping and String ----------------------------------------------------
// Both ring when struck (a rise at Strike) at the pitch set by Pitch, Range and Tune, for Decay
// (the time to fall 60 dB). In excites them continuously. Feedback sends their own output back in:
// up to about 90% they ring longer; past that they no longer die away but sing on, softly limited.

// Ping: modal synthesis. A bank of tuned resonators (state-variable band-pass filters), one per
// partial: partial n rings at the pitch times n^Stretch (1: harmonic; 1.5: a struck bar; 0.67: a
// drum skin...), Tone sets how loud the upper partials are, and each upper partial dies away
// sooner than the note, as on a struck object. (The same sums are in modrack.js, for the graph.)
// Drive (both resonators): a saturation stage whose grit depends on how loud the ring is, so a
// hard strike is dirty and the tail cleans up as it fades. ref: the module's usual peak level; the
// stage is turned back down so that the quiet tail is only a little louder than clean (at most
// about 5 dB): the loud strike is squashed and gritty, the tail comes through nearly as it was.
function driveSetup(m, drive) {
  const d = drive || 0;
  m.drive = d;
  m.G = 1 + 14 * d * d;
  m.norm = Math.pow(m.G, -0.6);
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const driven = (m, y) => (m.drive ? m.norm * Math.tanh(y * m.G) : y);
// Feedback past 100% ("too far") gets much hotter: brought back down so it is not a sudden jump in level
// (less so with Drive up, which already squashes it)
const tooFarTrim = (fb, drive) => (fb > 1 ? 1 / (1 + (fb - 1) * 5 * (1 - 0.8 * drive)) : 1);
const MAX_PARTIALS = 8;
class Ping extends Module {
  static OUTS = ['out'];
  static INS = ['pitch', 'strike', 'in', 'fb', 'stretch', 'drive'];
  constructor(id) {
    super(id);
    this.ic1 = new Float64Array(MAX_PARTIALS); this.ic2 = new Float64Array(MAX_PARTIALS);
    this.coef = Array.from({ length: MAX_PARTIALS }, () => [1, 0, 0, 0, 0, 0]); // k, a1, a2, a3, level, in-gain
    this.strikeWas = 0; this.y = 0; this.n = 0; this.np = 1; this.env = 0;
  }
  begin(p, sr) {
    this.oct = this.q(p, 'range') + this.q(p, 'tune') / 12;
    this.decay = this.q(p, 'decay'); this.tone = this.q(p, 'tone'); this.fbKnob = this.q(p, 'fb');
    this.partials = this.q(p, 'partials') || 1; this.stretchKnob = this.q(p, 'stretch');
    this.envFall = Math.exp(-6.91 / (Math.max(0.02, this.decay * 0.25) * sr));
    this.driveKnob = this.q(p, 'drive');
    this.sr = sr; this.n = 0;
  }
  tick(S) {
    const sr = this.sr;
    // pitch, Stretch, Drive and the partials' filters, worked out again every 8 samples
    if ((this.n++ & 7) === 0) {
      driveSetup(this, clamp01(this.driveKnob + this.r('drive'))); // Drive input: 1 volt = the whole knob
      let f = C4 * Math.pow(2, this.oct + this.r('pitch'));
      // Drive also bends the pitch up when struck hard (as a hard-struck drum skin does), falling
      // back as the strike fades: up to about half an octave at full Drive. It follows the strikes,
      // not a sustained (fed-back) ring, which stays in tune.
      if (this.drive) f *= Math.pow(2, 0.6 * this.drive * Math.min(1, this.env));
      f = f < 8 ? 8 : f > sr * 0.24 ? sr * 0.24 : f;
      let st = this.stretchKnob + this.r('stretch') * 0.5; // Stretch CV: 1 volt moves it by 0.5
      st = st < 0.3 ? 0.3 : st > 2.5 ? 2.5 : st;
      const tilt = 4 * (1 - this.tone);
      let np = 0;
      for (let k = 0; k < this.partials; k++) {
        const ratio = Math.pow(k + 1, st), fk = f * ratio;
        if (fk > sr * 0.45) break; // (partials above the top of hearing are left out)
        const g = Math.tan(Math.PI * fk / sr);
        const T = this.decay / Math.sqrt(ratio); // the higher a partial, the sooner it dies away
        const Q = Math.max(0.5, T * Math.PI * fk / 6.91);
        const kk = 1 / Q, a1 = 1 / (1 + g * (g + kk));
        const c = this.coef[k];
        c[0] = kk; c[1] = a1; c[2] = g * a1; c[3] = g * g * a1;
        c[4] = Math.pow(k + 1, -tilt); // how loud: Tone
        c[5] = 2.5 * Math.sqrt(Q);      // In: louder the narrower the resonance (noise in sounds alike at any Decay)
        np++;
      }
      for (let k = np; k < this.np; k++) { this.ic1[k] = 0; this.ic2[k] = 0; } // partials just left out fall silent
      this.np = np;
    }
    let fb = this.fbKnob + this.r('fb');
    fb = fb < 0 ? 0 : fb > 1.5 ? 1.5 : fb;
    const st = this.r('strike');
    let hit = 0;
    if (st > 0.5 && this.strikeWas <= 0.5) { hit = (st > 2 ? 2 : st) * 0.45; this.env = Math.min(1.5, this.env + (st > 2 ? 2 : st)); }
    this.strikeWas = st;
    const x = this.r('in');
    // Feedback up to 100%: into the note only (unity loop gain at about 90%). Past 100% ("too far") it
    // is clipped hard and goes into every partial as well, so they fight each other: snarls and screams.
    const over = fb > 1 ? fb - 1 : 0;
    const fbIn = over ? (1.11 + over * 4) * Math.tanh(this.y * (1 + over * 12)) : fb * 1.11 * Math.tanh(this.y);
    const fbAll = over * 3 * Math.tanh(this.y * (1 + over * 12));
    let y = 0;
    for (let k = 0; k < this.np; k++) {
      const c = this.coef[k], kk = c[0];
      if (hit) this.ic1[k] += hit * c[4];
      const u = kk * (x * c[5] * c[4] + (k === 0 ? fbIn : fbAll * c[4]));
      const v3 = u - this.ic2[k];
      const v1 = c[1] * this.ic1[k] + c[2] * v3;
      const v2 = this.ic2[k] + c[2] * this.ic1[k] + c[3] * v3;
      this.ic1[k] = 2 * v1 - this.ic1[k]; this.ic2[k] = 2 * v2 - this.ic2[k];
      y += v1;
    }
    // the strike's pitch bend fades with the ring (in about a quarter of Decay)
    this.env *= this.envFall;
    y = 1.4 * Math.tanh(driven(this, y) / 1.4);
    this.y = y; // (Feedback takes the driven sound, so a sustained ring is gritty too)
    S[this.o] = lim(y * tooFarTrim(fb, this.drive));
  }
  reset() { this.ic1.fill(0); this.ic2.fill(0); this.y = 0; }
  ok() { return Number.isFinite(this.y + this.ic1[0] + this.ic2[0]); }
}

// String: a plucked string (waveguide synthesis, the Karplus-Strong method). A delay line exactly
// one period long, fed back into itself: whatever repeats at that period builds up, so the loop
// settles into the note and all its harmonics. Each time round, a gentle low-pass (Tone) takes off
// a little treble, so the note starts bright and mellows as it dies. Strike plucks it with a short
// burst of noise. The low-pass follows the pitch (every note equally bright); a DC blocker keeps
// anything below the note from building up; and an all-pass makes the fraction of a sample, with
// every filter's own delay taken off, so it is in tune.
const MAX_DELAY = 8192;
class StringRes extends Module {
  static OUTS = ['out'];
  static INS = ['pitch', 'strike', 'in', 'fb', 'drive'];
  constructor(id) {
    super(id);
    this.buf = new Float64Array(MAX_DELAY); this.w = 0; this.lp = 0;
    this.dcX = 0; this.dcY = 0; this.dcR = 0.999; this.apX = 0; this.apY = 0;
    this.burst = 0; this.burstAmp = 0; this.burstLp = 0;
    this.strikeWas = 0; this.y = 0; this.n = 0;
  }
  begin(p, sr) {
    this.oct = this.q(p, 'range') + this.q(p, 'tune') / 12;
    this.decay = this.q(p, 'decay'); this.tone = this.q(p, 'tone'); this.fbKnob = this.q(p, 'fb');
    this.driveKnob = this.q(p, 'drive');
    this.sr = sr; this.n = 0;
  }
  tick(S) {
    const sr = this.sr;
    if ((this.n++ & 7) === 0) {
      driveSetup(this, clamp01(this.driveKnob + this.r('drive'))); // Drive input: 1 volt = the whole knob
      this.L = 1.4 / (1 + 2 * this.drive); // and the limit inside the loop comes down: the string buzzes as it rings
      let f = C4 * Math.pow(2, this.oct + this.r('pitch'));
      f = f < 8 ? 8 : f > sr * 0.24 ? sr * 0.24 : f;
      // Tone: the loop's low-pass, its cutoff 2 to 42 times the pitch
      this.lpA = Math.min(1, 1 - Math.exp(-TWO_PI * f * (2 + 40 * this.tone * this.tone) / sr));
      const w = TWO_PI * f / sr, b = 1 - this.lpA;
      const R = this.dcR = Math.exp(-TWO_PI * f * 0.1 / sr); // DC blocker: a high-pass at a tenth of the pitch
      // loss each time round so that it falls 60 dB in Decay, allowing for what the filters take off
      // the note itself (it may be above 1: nothing builds up below the note, the low-pass holds the rest)
      const lpGain = this.lpA / Math.hypot(1 - b * Math.cos(w), b * Math.sin(w));
      const hpGain = Math.hypot(1 - Math.cos(w), Math.sin(w)) / Math.hypot(1 - R * Math.cos(w), R * Math.sin(w));
      this.g = Math.min(2, Math.exp(-6.91 / (f * this.decay)) / (lpGain * hpGain));
      // one period round the loop, less the filters' own delay at this pitch
      const lpDelay = Math.atan2(b * Math.sin(w), 1 - b * Math.cos(w)) / w;
      const hpDelay = -(Math.atan2(Math.sin(w), 1 - Math.cos(w)) - Math.atan2(R * Math.sin(w), 1 - R * Math.cos(w))) / w;
      const len = Math.max(2.2, Math.min(MAX_DELAY - 2, sr / f - lpDelay - hpDelay));
      this.whole = Math.floor(len - 0.1); // whole samples, plus a fraction (0.1-1.1) from the all-pass
      const fr = len - this.whole;
      this.apC = (1 - fr) / (1 + fr);
      this.len = len;
    }
    let fb = this.fbKnob + this.r('fb');
    fb = fb < 0 ? 0 : fb > 1.5 ? 1.5 : fb;
    const st = this.r('strike');
    if (st > 0.5 && this.strikeWas <= 0.5) { this.burst = Math.max(2, Math.round(this.len)); this.burstAmp = st > 2 ? 2 : st; }
    this.strikeWas = st;
    let ex = this.r('in') * 0.5;
    if (this.burst > 0) { // the pluck: one period of noise, as bright as Tone
      this.burstLp += ((Math.random() * 2 - 1) - this.burstLp) * (0.15 + 0.85 * this.tone);
      ex += this.burstLp * this.burstAmp * 4;
      this.burst--;
    }
    let r = this.w - this.whole;
    if (r < 0) r += MAX_DELAY;
    const raw = this.buf[r];
    const d = this.apC * (raw - this.apY) + this.apX;
    this.apX = raw; this.apY = d;
    this.lp += (d - this.lp) * this.lpA;
    const hp = this.lp - this.dcX + this.dcR * this.dcY;
    this.dcX = this.lp; this.dcY = hp;
    // Feedback up to 90%: rings longer (up to 10 times); past 90% the loop gains a little each time
    // round and sings on; past 100% ("too far") it gains a lot and is driven hard into its limit
    const loop = fb < 0.9 ? Math.pow(this.g, 1 - fb / 0.9 * 0.9) : fb <= 1 ? 1 + (fb - 0.9) * 0.5 : 1.05 + (fb - 1) * 1.5;
    let v = ex + hp * loop;
    // the limit inside the loop: soft at Drive 0; lower and harder with Drive, so the string
    // saturates as it rings (thicker, buzzier, the harder it is plucked)
    const L = this.L;
    v = L * Math.tanh(v / L);
    this.buf[this.w] = v;
    this.w = (this.w + 1) % MAX_DELAY;
    this.y = v;
    S[this.o] = lim(driven(this, v) * tooFarTrim(fb, this.drive) * (1 + 2 * this.drive) ** 0.5);
  }
  reset() { this.buf.fill(0); this.lp = this.y = this.burstLp = this.dcX = this.dcY = this.apX = this.apY = 0; }
  ok() { return Number.isFinite(this.y + this.lp + this.apY + this.dcY); }
}

// the Output: its sum is read by the processor after every module has run
class Out extends Module {
  static OUTS = [];
  static INS = ['in'];
  begin(p) { this.vol = p['out.vol']; }
  tick() {}
}

// the Sequencer: 8 steps of pitch and on/off, its own clock or one step per rise at Clock
class Seq extends Module {
  static OUTS = ['pitch', 'gate', 'trig'];
  static INS = ['clock', 'reset'];
  constructor(id) { super(id); this.step = 0; this.ph = 0; this.clkWas = 0; this.rstWas = 0; this.trig = 0; this.pitch = []; this.on = []; }
  begin(p, sr) {
    this.run = p['seq.run'] === 'run';
    this.len = p['seq.len'] || 8;
    this.inc = (p['seq.rate'] || 4) / sr;
    for (let k = 1; k <= 8; k++) { this.pitch[k - 1] = Math.round(p[`seq.s${k}`] || 0) / 12; this.on[k - 1] = p[`seq.g${k}`] !== 'off'; }
    this.trigN = Math.round(TRIG_SECONDS * sr);
  }
  tick(S) {
    let advance = false, high = false;
    if (this.run) {
      if (this.has('clock')) {
        const clk = this.r('clock');
        advance = clk > 0.5 && this.clkWas <= 0.5;
        this.clkWas = clk;
        high = clk > 0.5;
      } else {
        this.ph += this.inc;
        if (this.ph >= 1) { this.ph -= Math.floor(this.ph); advance = true; }
        high = this.ph < 0.5;
      }
    }
    const rst = this.r('reset');
    if (rst > 0.5 && this.rstWas <= 0.5) { this.step = -1; advance = true; this.ph = 0; }
    this.rstWas = rst;
    if (advance) {
      this.step = (this.step + 1) % this.len;
      if (this.on[this.step]) this.trig = this.trigN;
    }
    if (this.step >= this.len) this.step = 0;
    const o = this.o;
    S[o] = this.pitch[this.step];
    S[o + 1] = this.run && high && this.on[this.step] ? 1 : 0;
    S[o + 2] = this.trig > 0 ? 1 : 0;
    if (this.trig > 0) this.trig--;
  }
}

const TYPES = { vco: VCO, noise: Noise, mix: Mixer, vcf: VCF, ring: Ring, vca: VCA, att: Att, env: Env, lfo: LFO, mfo: MFO, sh: SH, ping: Ping, string: StringRes };
const typeOf = (id) => (id === 'out' ? Out : id === 'seq' ? Seq : TYPES[(/^([a-z]+)\d+$/.exec(id) || [])[1]]);

class ModRackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = {};
    this.notes = []; this.note = 60; this.target = 60; this.retrig = 0; this.trig = 0;
    this.mods = {};      // module id -> module (kept while it stays in the rack)
    this.order = [];     // the modules, in the order they run
    this.slot = {};      // output id -> its place in S
    this.S = new Float64Array(8);
    this.peak = new Float64Array(8);
    this.dirty = true;
    this.over = 0; this.resets = 0; this.blocks = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    switch (m.type) {
      case 'patch': Object.assign(this.p, m.patch); this.dirty = true; break;
      case 'param':
        this.p[m.id] = m.value;
        if (m.id === 'rack.layout' || m.id.startsWith('jack.')) this.dirty = true;
        break;
      case 'noteOn': {
        const i = this.notes.indexOf(m.note);
        if (i >= 0) this.notes.splice(i, 1);
        if (this.notes.length && this.p['kb.mode'] !== 'legato') this.retrig = 64;
        this.notes.push(m.note);
        this.target = m.note;
        this.trig = Math.round(TRIG_SECONDS * sampleRate);
        if (this.notes.length === 1 && !(this.p['kb.glide'] > 0.0005)) this.note = m.note;
        break;
      }
      case 'noteOff': {
        const i = this.notes.indexOf(m.note);
        if (i >= 0) this.notes.splice(i, 1);
        if (this.notes.length) this.target = this.notes[this.notes.length - 1];
        break;
      }
      case 'allOff': this.notes = []; break;
    }
  }

  // Build the running order and the wiring from the layout and the cables
  compile() {
    this.dirty = false;
    const p = this.p;
    const ids = ['seq', ...String(p['rack.layout'] || '').split(/[|,]/).filter(Boolean)];
    const mods = {}, order = [], slot = { 'kb.pitch': 0, 'kb.gate': 1, 'kb.trig': 2 };
    let n = 3;
    ids.forEach((id) => {
      const T = typeOf(id);
      if (!T || mods[id]) return;
      const m = this.mods[id] instanceof T ? this.mods[id] : new T(id);
      m.o = n;
      T.OUTS.forEach((o) => { slot[`${id}.${o}`] = n++; });
      mods[id] = m;
      order.push(m);
    });
    if (n > this.S.length) { this.S = new Float64Array(n + 16); this.peak = new Float64Array(n + 16); }
    order.forEach((m) => {
      m.S = this.S;
      m.constructor.INS.forEach((name) => {
        const list = String(p[`jack.${m.id}.${name}`] || '').split(',').map((o) => slot[o]).filter((k) => k !== undefined);
        m.in[name] = list.length ? Int32Array.from(list) : NONE;
      });
    });
    this.mods = mods; this.order = order; this.slot = slot; this.nSlots = n;
    this.outMod = mods.out || null;
    // the envelopes and filter the panel's graphs follow: the first of each
    this.env1 = order.find((m) => m instanceof Env) || null;
    this.env2 = order.filter((m) => m instanceof Env)[1] || null;
    this.vcf = order.find((m) => m instanceof VCF) || null;
    this.lfo = order.find((m) => m instanceof LFO) || null;
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    if (!L) return true;
    const p = this.p;
    if (p['rack.layout'] === undefined) return true; // no patch yet
    if (this.dirty) this.compile();
    const sr = sampleRate, n = L.length, S = this.S, pk = this.peak, order = this.order, nm = order.length, ns = this.nSlots;
    const scopeOut = outputs[1];
    const S1 = scopeOut && scopeOut[0];
    for (let k = 0; k < nm; k++) order[k].begin(p, sr, n);
    const glideCoef = p['kb.glide'] > 0.0005 ? 1 - Math.exp(-4.6 / (p['kb.glide'] * sr)) : 1;
    const om = this.outMod, vol = om ? om.vol : 0;

    for (let i = 0; i < n; i++) {
      this.note += (this.target - this.note) * glideCoef;
      S[0] = (this.note - 60) / 12;
      let gate = this.notes.length ? 1 : 0;
      if (this.retrig > 0) { this.retrig--; gate = 0; }
      S[1] = gate;
      S[2] = this.trig > 0 ? 1 : 0;
      if (this.trig > 0) this.trig--;

      for (let k = 0; k < nm; k++) order[k].tick(S, i);

      const pre = om ? om.r('in') * vol * OUTPUT_GAIN * 1.6 : 0;
      const a = pre < 0 ? -pre : pre;
      if (a > this.over) this.over = a;
      L[i] = CEILING * Math.tanh(pre / CEILING);
      if (S1) S1[i] = pre * 0.5;
      for (let k = 0; k < ns; k++) { const v = S[k] < 0 ? -S[k] : S[k]; if (v > pk[k]) pk[k] = v; }
    }
    // self-repair: if a runaway loop has broken the maths anywhere, reset and carry on
    let ok = Number.isFinite(L[n - 1]) && Number.isFinite(this.note);
    for (let k = 0; k < nm && ok; k++) if (order[k].ok && !order[k].ok()) ok = false;
    if (!ok) {
      order.forEach((m) => m.reset());
      if (!Number.isFinite(this.note)) this.note = this.target;
      S.fill(0);
      L.fill(0);
      this.resets++;
    }
    for (let c = 1; c < out.length; c++) out[c].set(L);

    const dtB = n / sr;
    order.forEach((m) => { if (m instanceof Env) { m.tOn += dtB; m.tOff += dtB; } });
    if (++this.blocks % 4 === 0) {
      const outs = {};
      for (const id in this.slot) outs[id] = pk[this.slot[id]];
      outs['kb.pitch'] = outs['kb.gate'];
      const idle = { s: 0, v: 0, tOn: 0, tOff: 0 }, seq = this.mods.seq;
      this.port.postMessage({
        type: 'state', gate: this.notes.length > 0, note: this.note, target: this.target, fc: this.vcf ? this.vcf.fc : 1000,
        a: this.env1 ? this.env1.report() : idle, f: this.env2 ? this.env2.report() : idle,
        lfo: this.lfo ? S[this.lfo.o] : 0, lfoT: 0, beat: 0, outs,
        seqStep: seq ? seq.step : 0, seqRun: seq ? seq.run : false,
        over: this.over, resets: this.resets,
      });
      this.over = 0;
      pk.fill(0);
    }
    return true;
  }
}

registerProcessor('modrack-processor', ModRackProcessor);
