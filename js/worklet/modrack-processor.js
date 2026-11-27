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
    // (any rise counts, however small: a strike's strength is its level, e.g. the Bounce's softer and softer hits)
    if (st > 0.001 && this.strikeWas <= 0.001) { hit = (st > 2 ? 2 : st) * 0.45; this.env = Math.min(1.5, this.env + (st > 2 ? 2 : st)); }
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
      const lpGain = this.lpA / Math.hypot(1 - b * Math.cos(w), b * Math.sin(w));
      // DC blocker: a high-pass below the note. It shifts each harmonic's timing a little differently;
      // corrected exactly for the note, the harmonics are left a hair flat, which matters only when
      // Feedback holds the string at its limit and locks them together (the note is then pulled flat).
      // So it sits far below the note (1/200 of it), except where the loop has to be boosted to make up
      // a dark Tone's loss: then it rises (up to 1/10 of the note) to stop a rumble building up below the note.
      const boost = Math.max(Math.exp(-6.91 / (f * this.decay)), 1) / lpGain - 1;
      const R = this.dcR = Math.exp(-TWO_PI * f * Math.min(0.1, 0.005 + Math.max(0, boost) * 2) / sr);
      const hpGain = Math.hypot(1 - Math.cos(w), Math.sin(w)) / Math.hypot(1 - R * Math.cos(w), R * Math.sin(w));
      this.unity = 1 / (lpGain * hpGain); // the loop gain that just holds the note (for Feedback's sustain)
      this.g = Math.min(2, Math.exp(-6.91 / (f * this.decay)) * this.unity);
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
    if (st > 0.001 && this.strikeWas <= 0.001) { this.burst = Math.max(2, Math.round(this.len)); this.burstAmp = st > 2 ? 2 : st; } // (any rise counts)
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
    // (both relative to the gain that just holds the note, so a dark Tone sings on as well as a bright one)
    const loop = fb < 0.9 ? Math.pow(this.g, 1 - fb / 0.9 * 0.9) : this.unity * (fb <= 1 ? 1 + (fb - 0.9) * 0.5 : 1.05 + (fb - 1) * 1.5);
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

// Formant: three band-pass filters (zero-delay-feedback state-variable filters, as in the VCF) at
// the formants of a voice singing a vowel, added together. Their bandwidths are fixed in Hz (as a
// voice's are, about 40-240 Hz, narrower with Res), so the higher formants are sharper in Q.
// (The vowel table is also in modrack.js, for the panel's graph.)
const VOWEL_TABLE = [
  [[730, 1090, 2440], [1, 0.6, 0.22]], [[530, 1840, 2480], [1, 0.35, 0.25]], [[270, 2290, 3010], [1, 0.25, 0.2]],
  [[570, 840, 2410], [1, 0.5, 0.1]], [[300, 870, 2240], [1, 0.25, 0.08]]];
class Formant extends Module {
  static OUTS = ['out'];
  static INS = ['in', 'vowel', 'shift'];
  constructor(id) { super(id); this.ic1 = [0, 0, 0]; this.ic2 = [0, 0, 0]; this.c = [[], [], []]; this.n = 0; this.y = 0; }
  begin(p, sr) {
    this.vowel = this.q(p, 'vowel'); this.shift = this.q(p, 'shift'); this.res = this.q(p, 'res'); this.mix = this.q(p, 'mix');
    this.sr = sr; this.n = 0;
  }
  tick(S) {
    const sr = this.sr;
    if ((this.n++ & 7) === 0) {
      // Vowel input: 1 volt moves it 2 vowels; Shift input: 1 volt moves it an octave
      let v = this.vowel + this.r('vowel') * 2; v = v < 0 ? 0 : v > 4 ? 4 : v;
      let sh = this.shift + this.r('shift'); sh = sh < -2 ? -2 : sh > 2 ? 2 : sh;
      const i = Math.min(3, Math.floor(v)), t = v - i, A = VOWEL_TABLE[i], B = VOWEL_TABLE[i + 1], k = Math.pow(2, sh);
      const bw = 40 + 200 * (1 - this.res);
      for (let n = 0; n < 3; n++) {
        let f = Math.exp(Math.log(A[0][n]) * (1 - t) + Math.log(B[0][n]) * t) * k;
        f = f > sr * 0.45 ? sr * 0.45 : f < 20 ? 20 : f;
        const g = Math.tan(Math.PI * f / sr), kk = Math.min(2, bw / f), a1 = 1 / (1 + g * (g + kk));
        const c = this.c[n];
        c[0] = kk; c[1] = a1; c[2] = g * a1; c[3] = g * g * a1;
        c[4] = A[1][n] * (1 - t) + B[1][n] * t; // its level
      }
      // sharper formants pass less of a broad sound: made up so it stays about as loud
      this.makeup = 2.5 + 5 * this.res;
    }
    const x = this.r('in');
    let y = 0;
    for (let n = 0; n < 3; n++) {
      const c = this.c[n];
      const v3 = x - this.ic2[n];
      const v1 = c[1] * this.ic1[n] + c[2] * v3;
      const v2 = this.ic2[n] + c[2] * this.ic1[n] + c[3] * v3;
      this.ic1[n] = 2 * v1 - this.ic1[n]; this.ic2[n] = 2 * v2 - this.ic2[n];
      y += c[4] * c[0] * v1; // (k times the band-pass: unity at the formant's centre)
    }
    y *= this.makeup;
    this.y = y;
    S[this.o] = lim(x + (y - x) * this.mix);
  }
  reset() { this.ic1 = [0, 0, 0]; this.ic2 = [0, 0, 0]; this.y = 0; }
  ok() { return Number.isFinite(this.y + this.ic1[0] + this.ic1[1] + this.ic1[2]); }
}

// XY: a pad played by hand (x, y: where the puck is, sent by the panel as it moves; touch: a
// finger on it), or a recorded movement played back (path: "duration;x,y;x,y;...", points evenly
// spaced in time). Live: the outputs follow the pad. Loop: the recording plays round and round (a
// rising Gate restarts it). Once: it plays once each time the Gate rises. A finger on the pad always
// takes over. Smooth glides the outputs; Gate is high while touched (or while a recording plays).
class XY extends Module {
  static OUTS = ['x', 'y', 'gate'];
  static INS = ['gate'];
  constructor(id) { super(id); this.ph = 0; this.playing = false; this.gateWas = 0; this.sx = 0.5; this.sy = 0.5; this.pathStr = null; this.pts = null; }
  begin(p, sr) {
    const str = this.q(p, 'path') || '';
    if (str !== this.pathStr) {
      this.pathStr = str;
      const parts = str.split(';'), dur = Number(parts.shift());
      const pts = parts.map((q) => q.split(',').map(Number)).filter((q) => q.length === 2 && q.every(Number.isFinite));
      this.pts = pts.length > 1 && dur > 0 ? pts : null;
      this.dur = dur;
    }
    this.mode = this.q(p, 'mode'); this.x = this.q(p, 'x'); this.y = this.q(p, 'y'); this.touch = this.q(p, 'touch') === 1;
    this.rate = this.q(p, 'rate'); this.bi = this.q(p, 'pol') === 'bi';
    const sm = this.q(p, 'smooth');
    this.slew = sm > 0.002 ? 1 - Math.exp(-4.6 / (sm * sr)) : 1;
    this.sr = sr;
  }
  tick(S) {
    const g = this.r('gate') > 0.5 ? 1 : 0, rise = g && !this.gateWas;
    this.gateWas = g;
    let tx = this.x, ty = this.y, on = this.touch;
    if (this.pts && this.mode !== 'live') {
      if (this.mode === 'loop') {
        if (rise) this.ph = 0;
        this.playing = true;
      } else if (rise) { this.ph = 0; this.playing = true; }
      if (this.playing) {
        this.ph += this.rate / (this.dur * this.sr);
        if (this.ph >= 1) { if (this.mode === 'loop') this.ph -= Math.floor(this.ph); else { this.ph = 1; this.playing = false; } }
      }
      if (!this.touch) { // (a finger on the pad takes over)
        const pts = this.pts, pos = this.ph * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(pos)), t = pos - i;
        tx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
        ty = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
        on = this.playing;
      }
    }
    this.sx += (tx - this.sx) * this.slew;
    this.sy += (ty - this.sy) * this.slew;
    const o = this.o;
    S[o] = this.bi ? 2 * this.sx - 1 : this.sx;
    S[o + 1] = this.bi ? 2 * this.sy - 1 : this.sy;
    S[o + 2] = on ? 1 : 0;
  }
}

// ---- band-limited single-cycle tables (the Wave VCO; the wavetable oscillator too) -------------
// One cycle of 2048 samples is turned into 11 copies, each with fewer harmonics (1024, 512, ... 1),
// so that whatever note it plays, nothing goes above the top of hearing to fold back down as
// harsh, out-of-tune whistles (aliasing). Made with a fast Fourier transform.
const TABLE = 2048, LEVELS = 11;
function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar; im[i + k] += ai;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
// one cycle (TABLE samples) -> its band-limited copies [level][sample], scaled to peak at 1, no DC
function bandLimit(cycle) {
  const re = Float64Array.from(cycle), im = new Float64Array(TABLE);
  fft(re, im, false);
  re[0] = im[0] = 0; // (no DC: the wave centred on 0)
  const levels = [];
  let scale = 0;
  for (let L = 0; L < LEVELS; L++) {
    const top = TABLE / 2 >> L, r = new Float64Array(TABLE), i2 = new Float64Array(TABLE);
    for (let h = 1; h < top; h++) { r[h] = re[h]; i2[h] = im[h]; r[TABLE - h] = re[TABLE - h]; i2[TABLE - h] = im[TABLE - h]; }
    fft(r, i2, true);
    const t = new Float32Array(TABLE + 1);
    for (let k = 0; k < TABLE; k++) t[k] = r[k];
    t[TABLE] = t[0]; // (so reading between the last sample and the first needs no wrap)
    if (L === 0) for (let k = 0; k < TABLE; k++) scale = Math.max(scale, Math.abs(t[k]));
    levels.push(t);
  }
  const g = scale > 1e-6 ? 1 / scale : 0;
  levels.forEach((t) => { for (let k = 0; k <= TABLE; k++) t[k] *= g; });
  return levels;
}
// the copy for a frequency (the most harmonics that stay below 45% of the sample rate), read at phase ph
function readTable(levels, f, ph, sr) {
  const allowed = (0.45 * sr) / f;
  let L = 0;
  while (L < LEVELS - 1 && (TABLE / 2 >> L) > allowed) L++;
  const t = levels[L], x = ph * TABLE, i = x | 0, fr = x - i;
  return t[i] + (t[i + 1] - t[i]) * fr;
}

// Wave VCO: a drawn cycle (nodes, as the Draw module's; the middle is 0) played as an oscillator.
class WaveVCO extends Module {
  static OUTS = ['out'];
  static INS = ['pitch', 'fm', 'sync'];
  constructor(id) { super(id); this.ph = Math.random(); this.syncWas = 0; this.shapeStr = null; this.levels = null; }
  begin(p, sr) {
    const str = this.q(p, 'nodes');
    if (str !== this.shapeStr) {
      this.shapeStr = str;
      const sh = parseShape(str), cyc = new Float64Array(TABLE);
      let j = 0;
      for (let k = 0; k < TABLE; k++) {
        const x = k / TABLE;
        while (j < sh.xs.length - 2 && x >= sh.xs[j + 1]) j++;
        const w = sh.xs[j + 1] - sh.xs[j];
        let t = w > 0 ? (x - sh.xs[j]) / w : 1; t = t < 0 ? 0 : t > 1 ? 1 : t;
        cyc[k] = 2 * (sh.ys[j] + (sh.ys[j + 1] - sh.ys[j]) * bendCurve(t, sh.cs[j])) - 1;
      }
      this.levels = bandLimit(cyc);
    }
    this.oct = this.q(p, 'range') + this.q(p, 'tune') / 12;
    this.fm = this.q(p, 'fm') * FM_OCTAVES;
    this.sr = sr;
  }
  tick(S) {
    let f = C4 * Math.pow(2, this.oct + this.r('pitch') + this.r('fm') * this.fm);
    f = f > this.sr * 0.45 ? this.sr * 0.45 : f < 0.01 ? 0.01 : f;
    const sync = this.r('sync');
    if (sync > 0 && this.syncWas <= 0) this.ph = 0;
    this.syncWas = sync;
    S[this.o] = readTable(this.levels, f, this.ph, this.sr);
    this.ph += f / this.sr;
    if (this.ph >= 1) this.ph -= Math.floor(this.ph);
  }
}

// Bounce: a ball dropped onto a hard floor. It falls from Height, taking Time to land, and each
// bounce keeps Bounce of its speed (0: it stops dead; 0.98: a super-ball), until it comes to rest.
// Out: its height. Hit: a trigger at each bounce, as strong as the impact (1 for the first). End: a
// trigger when it comes to rest. Once: dropped when the Gate rises. Loop: dropped again when it
// comes to rest. Swing: bounces to rest, then plays backwards (the ball gaining height), and again.
// Worked out exactly, bounce by bounce (each flight is a parabola), so it can run backwards too.
const MAX_BOUNCES = 400;
class Bounce extends Module {
  static OUTS = ['out', 'hit', 'end'];
  static INS = ['gate', 'time', 'bounce'];
  constructor(id) {
    super(id);
    this.segs = []; this.t = 0; this.dir = 1; this.idle = true; this.h = 0; this.gateWas = 0;
    this.hitN = 0; this.hitV = 0; this.endN = 0; this.seg = 0; this.n = 0; this.key = '';
  }
  begin(p, sr) {
    this.mode = this.q(p, 'mode'); this.timeK = this.q(p, 'time'); this.bounceK = this.q(p, 'bounce'); this.H = this.q(p, 'height');
    // (its triggers last 1 ms, not the usual 5: near rest the bounces come only a few ms apart, and each must be its own trigger)
    this.sr = sr; this.trigN = Math.round(0.001 * sr);
  }
  // the flights from a height h0 and upward speed v0: start times and the speed off the floor
  plan(h0, v0) {
    const g = this.g, segs = [{ t: 0, h: h0, v: v0 }];
    let t = (v0 + Math.sqrt(v0 * v0 + 2 * g * h0)) / g, u = Math.sqrt(v0 * v0 + 2 * g * h0) * this.e;
    const tiny = this.vmax * 0.003;
    let land = Math.sqrt(v0 * v0 + 2 * g * h0); // (the speed of the last landing)
    while (u > tiny && segs.length < MAX_BOUNCES) { segs.push({ t, h: 0, v: u }); t += 2 * u / g; land = u; u *= this.e; }
    this.segs = segs; this.D = t; this.t = 0; this.seg = 0; this.land = land;
  }
  // gravity and bounciness from the knobs and inputs (Time input: 1 V = 4 times as fast; Bounce: 1 V = +1)
  physics() {
    let T = this.timeK * Math.pow(4, -this.r('time')); T = T < 0.005 ? 0.005 : T > 30 ? 30 : T;
    let e = this.bounceK + this.r('bounce'); e = e < 0 ? 0 : e > 0.98 ? 0.98 : e;
    const H = Math.max(0.01, this.H);
    this.g = 2 * H / (T * T); this.vmax = this.g * T; this.e = e;
  }
  height(t) { const s = this.segs[this.seg], dt = t - s.t; return Math.max(0, s.h + s.v * dt - 0.5 * this.g * dt * dt); }
  drop() { this.physics(); this.plan(Math.max(0.01, this.H), 0); this.dir = 1; this.idle = false; }
  tick(S) {
    const g = this.r('gate') > 0.5 ? 1 : 0, rise = g && !this.gateWas;
    this.gateWas = g;
    if (rise || (this.idle && this.mode !== 'once')) this.drop(); // (Loop and Swing run by themselves)
    // Time or Bounce changed while it flies (by hand or by an input): carry on from here with the new ones
    if (!this.idle && this.dir > 0 && (this.n++ & 63) === 0) {
      const key = this.timeK.toFixed(4) + this.bounceK.toFixed(4) + this.H.toFixed(4) + this.r('time').toFixed(3) + this.r('bounce').toFixed(3);
      if (key !== this.key) {
        const was = this.key; this.key = key;
        if (was) {
          const s = this.segs[this.seg], dt = this.t - s.t, h = this.height(this.t), v = s.v - this.g * dt;
          this.physics(); this.plan(h, v);
        }
      }
    }
    if (!this.idle) {
      const dt = this.dir / this.sr, segs = this.segs;
      this.t += dt;
      // crossing into the next (or, backwards, the previous) flight is a bounce
      if (this.dir > 0) { while (this.seg < segs.length - 1 && this.t >= segs[this.seg + 1].t) { this.seg++; this.hitN = this.trigN; this.hitV = segs[this.seg].v / this.e / this.vmax; } }
      else { while (this.seg > 0 && this.t < segs[this.seg].t) { this.hitN = this.trigN; this.hitV = segs[this.seg].v / this.e / this.vmax; this.seg--; } }
      if (this.t >= this.D) { // at rest: the last landing is a hit too (with Bounce at 0, the only one: a thud)
        this.t = this.D; this.endN = this.trigN;
        if (this.dir > 0) { this.hitN = this.trigN; this.hitV = this.land / this.vmax; }
        if (this.mode === 'loop') this.drop();
        else if (this.mode === 'swing') { this.dir = -1; this.hitN = this.trigN; this.hitV = segs[this.seg].v / this.vmax; }
        else { this.idle = true; this.h = 0; }
      } else if (this.t <= 0) { this.t = 0; this.drop(); } // (Swing: back at the top: drop again)
      if (!this.idle) this.h = this.height(this.t);
    }
    const o = this.o;
    S[o] = this.h;
    S[o + 1] = this.hitN > 0 ? Math.min(1, this.hitV) : 0;
    S[o + 2] = this.endN > 0 ? 1 : 0;
    if (this.hitN > 0) this.hitN--;
    if (this.endN > 0) this.endN--;
  }
}

// Wavetable: frames of one cycle each (sent by the page: see js/wavetables.js), each made into band-
// limited copies; Position glides between neighbouring frames.
const WAVETABLES = {}; // module id -> its frames' band-limited copies
// a frame of 256 samples made into band-limited copies of TABLE samples (its spectrum, moved up)
function bandLimitFrame(frame) {
  const n = frame.length, re = Float64Array.from(frame), im = new Float64Array(n);
  fft(re, im, false);
  const big = new Float64Array(TABLE), bigIm = new Float64Array(TABLE), k = TABLE / n;
  for (let h = 1; h < n / 2; h++) { big[h] = re[h] * k; bigIm[h] = im[h] * k; big[TABLE - h] = re[n - h] * k; bigIm[TABLE - h] = im[n - h] * k; }
  fft(big, bigIm, true);
  return bandLimit(big);
}
class Wavetable extends Module {
  static OUTS = ['out'];
  static INS = ['pitch', 'pos', 'fm', 'sync'];
  constructor(id) { super(id); this.ph = Math.random(); this.syncWas = 0; }
  begin(p, sr) {
    this.oct = this.q(p, 'range') + this.q(p, 'tune') / 12;
    this.fm = this.q(p, 'fm') * FM_OCTAVES; this.posK = this.q(p, 'pos');
    this.frames = WAVETABLES[this.id] || null;
    this.sr = sr;
  }
  tick(S) {
    const fr = this.frames;
    let f = C4 * Math.pow(2, this.oct + this.r('pitch') + this.r('fm') * this.fm);
    f = f > this.sr * 0.45 ? this.sr * 0.45 : f < 0.01 ? 0.01 : f;
    const sync = this.r('sync');
    if (sync > 0 && this.syncWas <= 0) this.ph = 0;
    this.syncWas = sync;
    let y = 0;
    if (fr && fr.length) {
      // Position input: 1 volt is the whole table
      let pos = this.posK + this.r('pos'); pos = pos < 0 ? 0 : pos > 1 ? 1 : pos;
      const x = pos * (fr.length - 1), i = Math.min(fr.length - 2, Math.floor(x)), t = x - i;
      if (fr.length === 1) y = readTable(fr[0], f, this.ph, this.sr);
      else y = readTable(fr[i], f, this.ph, this.sr) * (1 - t) + readTable(fr[i + 1], f, this.ph, this.sr) * t;
      this.pos = pos;
    }
    S[this.o] = y;
    this.ph += f / this.sr;
    if (this.ph >= 1) this.ph -= Math.floor(this.ph);
  }
}

// Poly: the keyboard's notes, one per channel, for paraphonic and polyphonic patches. Each held note
// is given a channel (of Voices, up to 4): the one that has been free the longest, or, when all are
// in use, the one holding the oldest note. Each channel has its own Pitch (gliding with the
// keyboard's Glide) and Gate; a channel's Pitch stays where it was after its key is let go, so a
// release tail keeps its note. (The note events come from the processor: noteOn / noteOff.)
const POLY = 4;
class Poly extends Module {
  static OUTS = ['p1', 'p2', 'p3', 'p4', 'g1', 'g2', 'g3', 'g4'];
  static INS = [];
  constructor(id) {
    super(id);
    this.ch = Array.from({ length: POLY }, () => ({ note: 60, at: 60, held: false, since: 0, gap: 0 }));
    this.clock = 0; this.voices = POLY;
  }
  noteOn(note) {
    const ch = this.ch.slice(0, this.voices);
    let c = ch.find((x) => x.held && x.note === note);
    if (!c) c = ch.filter((x) => !x.held).sort((a, b) => a.since - b.since)[0] || ch.slice().sort((a, b) => a.since - b.since)[0];
    if (c.held) c.gap = 64; // (taking over a held note: a short gap, so its envelope starts again)
    if (!this.glide) c.at = note;
    c.note = note; c.held = true; c.since = ++this.clock;
  }
  noteOff(note) { this.ch.forEach((c) => { if (c.held && c.note === note) { c.held = false; c.since = ++this.clock; } }); }
  allOff() { this.ch.forEach((c) => { c.held = false; }); }
  // (also as soon as the rack is wired, before any sound: a note may come first)
  setup(p) { this.voices = Math.max(1, Math.min(POLY, p[`${this.id}.voices`] || POLY)); }
  begin(p, sr) {
    this.setup(p);
    this.ch.forEach((c, i) => { if (i >= this.voices) c.held = false; });
    this.glide = p['kb.glide'] > 0.0005;
    this.glideCoef = this.glide ? 1 - Math.exp(-4.6 / (p['kb.glide'] * sr)) : 1;
  }
  tick(S) {
    const o = this.o;
    for (let i = 0; i < POLY; i++) {
      const c = this.ch[i];
      c.at += (c.note - c.at) * this.glideCoef;
      S[o + i] = (c.at - 60) / 12;
      let g = c.held ? 1 : 0;
      if (c.gap > 0) { c.gap--; g = 0; }
      S[o + POLY + i] = g;
    }
  }
}

// Shaper: distortion you draw. The curve (nodes, as Draw's: across = input -1..1, up = output -1..1)
// is made into a table; Drive pushes the input harder into it; past either end, Clip holds the end's
// level and Fold mirrors the input back (wavefolding through the curve). It runs at 4 times the
// sample rate, smoothing between samples, so the harmonics it adds fold back less (less aliasing).
const SHAPE_N = 1024, OS = 4;
class Shaper extends Module {
  static OUTS = ['out'];
  static INS = ['in', 'drive'];
  constructor(id) { super(id); this.table = new Float32Array(SHAPE_N + 1); this.curveStr = null; this.xWas = 0; this.lp = 0; this.peak = 0; }
  begin(p) {
    const str = this.q(p, 'curve');
    if (str !== this.curveStr) {
      this.curveStr = str;
      const sh = parseShape(str);
      let j = 0;
      for (let k = 0; k <= SHAPE_N; k++) {
        const x = k / SHAPE_N;
        while (j < sh.xs.length - 2 && x >= sh.xs[j + 1]) j++;
        const w = sh.xs[j + 1] - sh.xs[j];
        let t = w > 0 ? (x - sh.xs[j]) / w : 1; t = t < 0 ? 0 : t > 1 ? 1 : t;
        this.table[k] = 2 * (sh.ys[j] + (sh.ys[j + 1] - sh.ys[j]) * bendCurve(t, sh.cs[j])) - 1;
      }
    }
    this.driveK = this.q(p, 'drive'); this.fold = this.q(p, 'edge') === 'fold'; this.mix = this.q(p, 'mix');
  }
  shape(x) {
    if (this.fold) { // mirror back into -1..1 as many times as it takes
      const t = (x + 1) * 0.5; const f = t - 2 * Math.floor(t / 2); x = (f > 1 ? 2 - f : f) * 2 - 1;
    } else x = x < -1 ? -1 : x > 1 ? 1 : x;
    const pos = (x + 1) * 0.5 * SHAPE_N, i = pos | 0, fr = pos - i;
    return i >= SHAPE_N ? this.table[SHAPE_N] : this.table[i] + (this.table[i + 1] - this.table[i]) * fr;
  }
  tick(S) {
    let drive = this.driveK * Math.pow(2, this.r('drive') * 4); // (Drive input: 1 V = 16 times the drive)
    drive = drive > 200 ? 200 : drive;
    const x = this.r('in') * drive;
    let acc = 0;
    for (let k = 1; k <= OS; k++) acc += this.shape(this.xWas + (x - this.xWas) * (k / OS));
    this.xWas = x;
    let y = acc / OS;
    this.lp += (y - this.lp) * 0.6; // (a little more smoothing of the very top)
    y = this.lp;
    const a = x < 0 ? -x : x;
    if (a > this.peak) this.peak = a; // (how far into the curve the input goes, for its screen)
    S[this.o] = lim(this.r('in') + (y - this.r('in')) * this.mix);
  }
}

// Quantizer: a pitch (1 V per octave) snapped to the nearest note of the scale (mask: which of the
// 12 notes above the root are in it). It changes note only once the input is clearly nearer another
// (a little hysteresis, so a wobbly input does not flicker between two). Trig fires on each change.
class Quantizer extends Module {
  static OUTS = ['out', 'trig'];
  static INS = ['in'];
  constructor(id) { super(id); this.note = 0; this.trig = 0; this.maskStr = null; this.inScale = Array(12).fill(true); }
  begin(p, sr) {
    const m = String(this.q(p, 'mask') || '');
    if (m !== this.maskStr) { this.maskStr = m; this.inScale = Array.from({ length: 12 }, (_, i) => m[i] === '1'); if (!this.inScale.some(Boolean)) this.inScale[0] = true; }
    this.root = this.q(p, 'root') || 0;
    this.trigN = Math.round(TRIG_SECONDS * sr);
  }
  allowed(n) { return this.inScale[(((n - this.root) % 12) + 12) % 12]; }
  nearest(semi) {
    const c = Math.round(semi);
    for (let d = 0; d <= 6; d++) {
      const lo = c - d, hi = c + d;
      const a = this.allowed(lo) ? lo : null, b = this.allowed(hi) ? hi : null;
      if (a !== null && b !== null) return Math.abs(semi - a) <= Math.abs(semi - b) ? a : b;
      if (a !== null) return a;
      if (b !== null) return b;
    }
    return c;
  }
  tick(S) {
    const semi = this.r('in') * 12;
    const n = this.nearest(semi);
    if (n !== this.note && (!this.allowed(this.note) || Math.abs(semi - this.note) > Math.abs(semi - n) + 0.15)) { this.note = n; this.trig = this.trigN; }
    S[this.o] = this.note / 12;
    S[this.o + 1] = this.trig > 0 ? 1 : 0;
    if (this.trig > 0) this.trig--;
  }
}

// Probe: an oscilloscope. Thru passes A on. For its screen it collects A and B over the Time setting:
// short times (up to 0.1 s) as a steady picture, each starting where A rises through 0 (as a scope
// triggers); longer ones as a trace scrolling past. Either way as 200 columns of (lowest, highest).
const PROBE_COLS = 200;
class Probe extends Module {
  static OUTS = ['thru'];
  static INS = ['a', 'b'];
  constructor(id) { super(id); this.cols = []; this.cur = null; this.frame = null; this.n = 0; this.armed = true; this.aWas = 0; this.wait = 0; }
  begin(p, sr) {
    const T = this.q(p, 'time');
    this.roll = T >= 0.1;
    this.per = Math.max(1, Math.round((T * sr) / PROBE_COLS));
    this.sr = sr;
  }
  tick(S) {
    const a = this.r('a'), b = this.has('b') ? this.r('b') : NaN;
    S[this.o] = a;
    if (this.roll) {
      if (!this.cur) this.cur = [a, a, b, b];
      const c = this.cur;
      if (a < c[0]) c[0] = a; if (a > c[1]) c[1] = a; if (b < c[2]) c[2] = b; if (b > c[3]) c[3] = b;
      if (++this.n >= this.per) { this.cols.push(c); this.cur = null; this.n = 0; if (this.cols.length > PROBE_COLS * 2) this.cols.splice(0, PROBE_COLS); }
    } else {
      // wait for A to rise through 0 (or give up after a while and draw anyway), then fill a picture
      if (!this.filling) {
        this.wait++;
        if ((a > 0 && this.aWas <= 0) || this.wait > this.per * PROBE_COLS * 2) { this.filling = []; this.cur = null; this.n = 0; this.wait = 0; }
      }
      if (this.filling) {
        if (!this.cur) this.cur = [a, a, b, b];
        const c = this.cur;
        if (a < c[0]) c[0] = a; if (a > c[1]) c[1] = a; if (b < c[2]) c[2] = b; if (b > c[3]) c[3] = b;
        if (++this.n >= this.per) { this.filling.push(c); this.cur = null; this.n = 0; }
        if (this.filling.length >= PROBE_COLS) { this.frame = this.filling; this.filling = null; }
      }
    }
    this.aWas = a;
  }
  // what the screen needs (sent with the engine's report): new scrolling columns, or the latest picture
  report() {
    if (this.roll) { const c = this.cols; this.cols = []; return { roll: true, cols: c }; }
    const f = this.frame; this.frame = null; return { roll: false, frame: f };
  }
}

// Chance: a weighted coin toss for each gate or trigger. When In rises (by any amount: a soft
// Bounce hit counts too), it goes to Out with the Chance set, else to Else; the whole gate goes
// there, at its own level, until In falls again.
class Chance extends Module {
  static OUTS = ['out', 'else'];
  static INS = ['in'];
  constructor(id) { super(id); this.side = -1; this.was = 0; }
  begin(p) { this.chance = this.q(p, 'chance'); }
  tick(S) {
    const x = this.r('in');
    if (x > 0.001 && this.was <= 0.001) this.side = Math.random() < this.chance ? 0 : 1; // (the toss)
    else if (x <= 0.001) this.side = -1;
    this.was = x;
    S[this.o] = this.side === 0 ? x : 0;
    S[this.o + 1] = this.side === 1 ? x : 0;
  }
}

// Draw: a shape you draw (nodes joined by lines that can bend; see js/drawShape.js, which has the
// same sums), played over Time. Once: start to end when the Gate rises (holding at the sustain node
// while the Gate stays high), a custom envelope. Loop: round and round (the end jumps back to the
// start). Bounce: forwards then backwards. In Loop and Bounce a rising Gate restarts it. End sends
// a trigger each time the shape finishes or comes round again.
const bendCurve = (t, c) => { if (c < 0.001 && c > -0.001) return t; const k = c * 6; return (Math.exp(k * t) - 1) / (Math.exp(k) - 1); };
function parseShape(str) {
  const parts = String(str || '').split(';');
  const sus = parseInt(parts.shift(), 10);
  const xs = [], ys = [], cs = [];
  parts.forEach((q) => { const [x, y, c] = q.split(',').map(Number); if ([x, y, c].every(Number.isFinite)) { xs.push(x); ys.push(y); cs.push(c); } });
  if (xs.length < 2) return { xs: [0, 1], ys: [0, 0], cs: [0, 0], sus: -1 };
  xs[0] = 0; xs[xs.length - 1] = 1;
  return { xs, ys, cs, sus: sus > 0 && sus < xs.length - 1 ? sus : -1 };
}
class Draw extends Module {
  static OUTS = ['out', 'end'];
  static INS = ['gate', 'time'];
  constructor(id) {
    super(id);
    this.ph = 0; this.dir = 1; this.running = false; this.gateWas = 0; this.trig = 0; this.j = 0; this.shapeStr = null; // (at the start until played)
  }
  begin(p, sr) {
    const str = this.q(p, 'nodes');
    if (str !== this.shapeStr) { this.shapeStr = str; this.shape = parseShape(str); this.j = 0; }
    this.mode = this.q(p, 'mode');
    this.time = this.q(p, 'time'); this.amt = this.q(p, 'amt'); this.bi = this.q(p, 'pol') === 'bi';
    this.sr = sr; this.trigN = Math.round(TRIG_SECONDS * sr);
  }
  // the level at the play position (moving a cursor along the nodes, rather than searching each time)
  level(x) {
    const { xs, ys, cs } = this.shape, last = xs.length - 2;
    let j = this.j > last ? last : this.j;
    while (j > 0 && x < xs[j]) j--;
    while (j < last && x >= xs[j + 1]) j++;
    this.j = j;
    const w = xs[j + 1] - xs[j];
    if (w <= 0) return ys[j + 1];
    let t = (x - xs[j]) / w; t = t < 0 ? 0 : t > 1 ? 1 : t;
    return ys[j] + (ys[j + 1] - ys[j]) * bendCurve(t, cs[j]);
  }
  tick(S) {
    const g = this.r('gate') > 0.5 ? 1 : 0, rise = g && !this.gateWas;
    this.gateWas = g;
    // Time input: 1 volt makes it 4 times as fast (and -1, 4 times as slow)
    let T = this.time * Math.pow(4, -this.r('time'));
    T = T < 0.001 ? 0.001 : T > 120 ? 120 : T;
    const dt = 1 / (T * this.sr);
    let end = false;
    if (this.mode === 'once') {
      if (rise) { this.ph = 0; this.running = true; this.j = 0; }
      if (this.running) {
        const sus = this.shape.sus;
        const hold = sus >= 0 && g ? this.shape.xs[sus] : 2;
        if (this.ph < hold) this.ph = Math.min(hold, this.ph + dt); // (holding at the sustain node while the Gate is high)
        else if (hold === 2 || this.ph > hold) this.ph += dt;
        if (this.ph >= 1) { this.ph = 1; this.running = false; end = true; }
      }
    } else if (this.mode === 'loop') {
      if (rise) { this.ph = 0; this.j = 0; }
      this.ph += dt;
      if (this.ph >= 1) { this.ph -= Math.floor(this.ph); end = true; }
    } else { // bounce
      if (rise) { this.ph = 0; this.dir = 1; this.j = 0; }
      this.ph += this.dir * dt;
      if (this.ph >= 1) { this.ph = 2 - this.ph; this.dir = -1; }
      if (this.ph <= 0) { this.ph = -this.ph; this.dir = 1; end = true; }
      if (this.ph > 1) this.ph = 1;
    }
    if (end) this.trig = this.trigN;
    const y = this.level(this.ph);
    S[this.o] = (this.bi ? 2 * y - 1 : y) * this.amt;
    S[this.o + 1] = this.trig > 0 ? 1 : 0;
    if (this.trig > 0) this.trig--;
  }
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

const TYPES = { vco: VCO, noise: Noise, mix: Mixer, vcf: VCF, ring: Ring, vca: VCA, att: Att, env: Env, lfo: LFO, mfo: MFO, sh: SH, ping: Ping, string: StringRes, draw: Draw, formant: Formant, xy: XY, wave: WaveVCO, bounce: Bounce, table: Wavetable, poly: Poly, shaper: Shaper, quant: Quantizer, probe: Probe, chance: Chance };
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
        // (the Poly modules; the rack wired first, if it has just changed, so that none miss the note)
        if (this.dirty && this.p['rack.layout'] !== undefined) this.compile();
        this.order.forEach((mod) => { if (mod.noteOn) mod.noteOn(m.note); });
        break;
      }
      case 'noteOff': {
        const i = this.notes.indexOf(m.note);
        if (i >= 0) this.notes.splice(i, 1);
        if (this.notes.length) this.target = this.notes[this.notes.length - 1];
        this.order.forEach((mod) => { if (mod.noteOff) mod.noteOff(m.note); });
        break;
      }
      case 'allOff': this.notes = []; this.order.forEach((mod) => { if (mod.allOff) mod.allOff(); }); break;
      // a Wavetable's frames, from the page (made band-limited here, once)
      case 'table': WAVETABLES[m.id] = m.frames.map(bandLimitFrame); break;
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
    order.forEach((m) => { if (m.setup) m.setup(p); });
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
        draws: Object.fromEntries(order.filter((m) => m instanceof Draw).map((m) => [m.id, m.ph])), // the Draw modules' play positions
        probes: Object.fromEntries(order.filter((m) => m instanceof Probe).map((m) => [m.id, m.report()])), // the Probes' traces
        quants: Object.fromEntries(order.filter((m) => m instanceof Quantizer).map((m) => [m.id, m.note])), // the Quantizers' notes
        shapers: Object.fromEntries(order.filter((m) => m instanceof Shaper).map((m) => { const pk = m.peak; m.peak = 0; return [m.id, pk]; })), // how far into the curve
        tables: Object.fromEntries(order.filter((m) => m instanceof Wavetable).map((m) => [m.id, m.pos || 0])), // the Wavetables' positions
        bounces: Object.fromEntries(order.filter((m) => m instanceof Bounce).map((m) => [m.id, m.h])), // the Bounce modules' balls
        xys: Object.fromEntries(order.filter((m) => m instanceof XY).map((m) => [m.id, [m.sx, m.sy, m.ph]])), // the XY pads' outputs (0..1) and play positions
        over: this.over, resets: this.resets,
      });
      this.over = 0;
      pk.fill(0);
    }
    return true;
  }
}

registerProcessor('modrack-processor', ModRackProcessor);
