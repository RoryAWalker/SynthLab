// NF-Modular voice: the full modular rack, running in an AudioWorklet.
// Modules: Keyboard, two VCOs, Noise, Mixer, VCF, two ENVs, LFO, Sample & Hold, two VCAs, Output.
// As on the NF-MiniModular, nothing is wired inside: every connection is a patch cable, stored in
// the patch as 'jack.<module>.<input>': '<output id>' ('' = nothing plugged in). Each sample the
// modules run in a fixed order, each reading its inputs from the outputs computed so far; a cable
// that runs "backwards" in that order reads the previous sample.
//
// Signal conventions (like voltages on a real modular):
//   pitch  - octaves above middle C (1 V/octave)
//   gate   - 0 or 1;  trigger - a 1 lasting a few milliseconds
//   env    - 0..1 (the inverted output: 0..-1)
//   LFO, S&H, audio - about -1..1

const TWO_PI = Math.PI * 2;
const OUTPUT_GAIN = 0.5;
const C4 = 261.6256;
const FM_OCTAVES = 2;          // FM Amount fully up: an input of 1 bends the pitch 2 octaves
const CUTOFF_CV_OCTAVES = 6;   // VCF CV Amount fully up: an input of 1 moves the cutoff 6 octaves
const LFO_RATE_CV_OCTAVES = 4; // LFO Rate CV Amount fully up: an input of 1 changes the rate 4 octaves
const TRIG_SECONDS = 0.005;
// Virtual analogue: like real circuits, nothing is perfectly exact. Each time the rack starts,
// every part gets a tiny fixed error ("component tolerance"); the oscillators drift slowly; each
// new note varies the envelope times a little; and every oscillator starts at a random point
// in its cycle. All of it is far too small to put a patch out of tune, but enough that the
// sound is never quite the same twice. (The NF-MiniModular, built for learning, has none of this.)
const tol = (spread) => 1 + (Math.random() * 2 - 1) * spread;  // e.g. tol(0.01): 0.99..1.01
const TUNE_TOL = 0.0012;    // octaves: each VCO up to about +-1.5 cents out
const DRIFT_OCT = 0.0017;   // octaves: slow wander of up to about +-2 cents
const DRIFT_SECONDS = 1.6;  // roughly how often a VCO picks a new drift target
const ENV_NOTE_VAR = 0.03;  // each note's envelope times vary by up to +-3%
// Feedback safety. Any output can be patched back into an input, so a loop could otherwise grow
// without end, overflow and silence the whole rack. Every module output is held within ±LIMIT,
// the final output is softly limited below full scale, and if anything still goes wrong the
// rack resets itself (and tells the panel, which says so).
const LIMIT = 10;
const lim = (v) => (v !== v ? 0 : v > LIMIT ? LIMIT : v < -LIMIT ? -LIMIT : v);
const CEILING = 0.8; // the loudest the output can get (full scale = 1)

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// Exponential ('curved'): each sample closes a fixed share of the distance still to go, like a
// capacitor charging (natural for loudness). Decay and Release are 99% there at the time set.
// Linear: straight lines, taking exactly the set times. Each envelope can be either.
class Envelope {
  constructor() { this.linear = false; this.relFrom = 0; this.v = 0; this.stage = 0; this.tOn = 0; this.tOff = 0; this.was = 0; }
  // k: this envelope's fixed tolerance times this note's variation (virtual analogue)
  setTimes(a, d, s, r, sr) {
    const k = (this.tol || 1) * (this.jit || 1);
    a *= k; d *= k; r *= k;
    this.aCoef = 1 - Math.exp(-1.466 / (a * sr));
    this.dCoef = 1 - Math.exp(-4.6 / (d * sr));
    this.rCoef = 1 - Math.exp(-4.6 / (r * sr));
    this.aStep = 1 / (a * sr); this.dStep = 1 / (d * sr); this.rStep = 1 / (r * sr);
    this.s = s;
  }
  // gate: the level at the Gate input this sample
  next(gate) {
    const g = gate > 0.5 ? 1 : 0;
    if (g && !this.was) { this.stage = 1; this.tOn = 0; this.jit = tol(ENV_NOTE_VAR); }
    else if (!g && this.was && this.stage !== 0) { this.stage = 3; this.tOff = 0; this.relFrom = this.v; }
    this.was = g;
    if (this.linear) return this.nextLinear();
    switch (this.stage) {
      case 1:
        this.v += (1.3 - this.v) * this.aCoef;
        if (this.v >= 1) { this.v = 1; this.stage = 2; }
        break;
      case 2: this.v += (this.s - this.v) * this.dCoef; break;
      case 3:
        this.v += (0 - this.v) * this.rCoef;
        if (this.v < 1e-5) { this.v = 0; this.stage = 0; }
        break;
    }
    return this.v;
  }
  nextLinear() {
    switch (this.stage) {
      case 1:
        this.v += this.aStep;
        if (this.v >= 1) { this.v = 1; this.stage = 2; }
        break;
      case 2: // 1 down to Sustain over the Decay time (or up, if Sustain is raised while held)
        if (this.v > this.s) this.v = Math.max(this.s, this.v - Math.max(0.02, 1 - this.s) * this.dStep);
        else this.v = Math.min(this.s, this.v + this.dStep);
        break;
      case 3:
        this.v -= this.relFrom * this.rStep;
        if (this.v <= 1e-5) { this.v = 0; this.stage = 0; }
        break;
    }
    return this.v;
  }
  report() { return { s: this.stage, v: this.v, tOn: this.tOn, tOff: this.tOff }; }
}

// A VCO with all three waveforms at once, pulse width, FM and hard sync.
class VCO {
  constructor() { this.ph = Math.random(); this.syncWas = 0; }
  // oct: pitch in octaves above C4; pw: 0.05..0.95; sync: the level at the Sync input
  next(oct, pw, sync, sr, nyq, out, pre) {
    let f = C4 * Math.pow(2, oct);
    if (f > nyq) f = nyq; else if (f < 0.01) f = 0.01;
    const dt = f / sr;
    // hard sync: restart the wave each time the Sync input rises through zero
    if (sync > 0 && this.syncWas <= 0) this.ph = 0;
    this.syncWas = sync;
    const ph = this.ph, d = Math.min(dt, 0.49);
    out[pre + 'saw'] = 2 * ph - 1 - polyBlep(ph, d);
    let sq = ph < pw ? 1 : -1;
    sq += polyBlep(ph, d);
    let t2 = ph - pw; if (t2 < 0) t2 += 1;
    sq -= polyBlep(t2, d);
    out[pre + 'sq'] = sq - (2 * pw - 1);
    out[pre + 'tri'] = 1 - 4 * Math.abs(ph - 0.5);
    this.ph += dt; if (this.ph >= 1) this.ph -= Math.floor(this.ph);
  }
}

const OUTPUTS = ['kb.pitch', 'kb.gate', 'kb.trig', 'vco1.saw', 'vco1.sq', 'vco1.tri', 'vco2.saw', 'vco2.sq', 'vco2.tri',
  'noise.white', 'noise.pink', 'noise.col', 'mix.out', 'filt.out', 'filt.bp', 'filt.hp', 'env1.out', 'env1.inv', 'env2.out', 'env2.inv',
  'lfo.out', 'lfo2.out', 'sh.out', 'vca1.out', 'vca2.out', 'ring.out', 'att.out1', 'att.out2', 'seq.pitch', 'seq.gate', 'seq.trig'];

function lfoWave(shape, ph) {
  return shape === 'saw' ? 2 * ph - 1 : shape === 'square' ? (ph < 0.5 ? 1 : -1)
    : shape === 'sine' ? Math.sin(TWO_PI * (ph - 0.25)) : 1 - 4 * Math.abs(ph - 0.5);
}

// Mixer. Each level knob goes 0-11: 0-10 is gain 0..1, and 10-11 boosts steeply, up to 8x.
// Modes: Clean (the sum, turned back down by the boost so it stays sensible), Drive (hard
// saturation) and Fold (a wavefolder: the wave folds back on itself each time it passes +-1;
// the hotter the mix, the more folds). Drive and Fold are bounded, so they are trimmed to sit at
// a similar loudness to Clean.
const mixGain = (L) => (L <= 10 ? L / 10 : Math.pow(2, (L - 10) * 3));
const fold = (x) => { const t = (x + 1) * 0.25; return 4 * Math.abs(t - Math.floor(t + 0.5)) - 1; };
function mixShape(mode, x, boost) {
  if (mode === 'drive') return Math.tanh(x * 4) * 0.7;
  if (mode === 'fold') return fold(x * 3) * 0.8;
  return x / boost;
}

class NFModProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = {};
    this.notes = [];
    this.note = 60; this.target = 60;
    this.retrig = 0; this.trig = 0;
    this.vco1 = new VCO(); this.vco2 = new VCO();
    this.env1 = new Envelope(); this.env2 = new Envelope();
    // virtual analogue: random starting points, and fixed tolerances for this run
    this.lfoPh = Math.random(); this.lfoT = 0; this.lfoGateWas = 0;
    this.lfo2Ph = Math.random(); this.lfo2GateWas = 0;
    this.env1.tol = tol(0.02); this.env2.tol = tol(0.02);
    this.tolTune = [(Math.random() * 2 - 1) * TUNE_TOL, (Math.random() * 2 - 1) * TUNE_TOL];
    this.tolCut = Math.log2(tol(0.02)); this.tolLfo = tol(0.01); this.tolLfo2 = tol(0.01); this.tolSh = tol(0.01);
    this.drift = [0, 1].map(() => ({ v: (Math.random() * 2 - 1) * DRIFT_OCT, t: (Math.random() * 2 - 1) * DRIFT_OCT }));
    this.seqStep = 0; this.seqPh = 0; this.seqClkWas = 0; this.seqRstWas = 0; this.seqTrig = 0; // sequencer
    this.over = 0; this.resets = 0; // how hard the output limiter is working; how often the rack reset itself
    this.shVal = 0; this.shOut = 0; this.shClockWas = 0; this.shPh = Math.random();
    this.colLp = 0; this.colHp = 0; this.colPrev = 0;
    this.ic1 = 0; this.ic2 = 0; // state-variable filter A: the HP output
    this.ic3 = 0; this.ic4 = 0; // state-variable filter B: low-passes the HP for the BP output
    this.pink = [0, 0, 0];
    this.s = [0, 0, 0, 0];
    this.o = {}; this.peak = {};
    OUTPUTS.forEach((k) => { this.o[k] = 0; this.peak[k] = 0; });
    this.blocks = 0; this.lastFc = 1000;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    switch (m.type) {
      case 'patch': Object.assign(this.p, m.patch); break;
      case 'param': this.p[m.id] = m.value; break;
      case 'noteOn': {
        const i = this.notes.indexOf(m.note);
        if (i >= 0) this.notes.splice(i, 1);
        // already held: in Mono, a short gap in the gate restarts the envelopes; in Legato the gate stays
        // high (only Trig marks the new note)
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

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    if (!L) return true;
    const scopeOut = outputs[1];
    const S1 = scopeOut && scopeOut[0];
    const p = this.p;
    if (p['osc1.range'] === undefined) return true; // no patch yet
    const sr = sampleRate, n = L.length, o = this.o, s = this.s, pk = this.pink, nyq = sr * 0.45;

    // each input lists the outputs plugged into it (several cables are added together)
    const src = (jack) => (p['jack.' + jack] ? String(p['jack.' + jack]).split(',').filter(Boolean) : []);
    const J = {};
    ['vco1.pitch', 'vco1.fm', 'vco1.pwm', 'vco1.sync', 'vco2.pitch', 'vco2.fm', 'vco2.pwm', 'vco2.sync',
      'mix.in1', 'mix.in2', 'mix.in3', 'mix.in4', 'filt.in', 'filt.cv', 'filt.key', 'filt.res',
      'env1.gate', 'env2.gate', 'lfo.gate', 'lfo.rate', 'lfo2.gate', 'lfo2.fm', 'sh.in', 'sh.clock',
      'vca1.in', 'vca1.cv', 'vca2.in', 'vca2.cv', 'ring.a', 'ring.b', 'att.in1', 'att.in2', 'noise.cv', 'seq.clock', 'seq.reset', 'out.in'].forEach((k) => (J[k] = src(k)));
    const read = (k) => {
      const a = J[k];
      if (a.length === 1) return o[a[0]];
      let sum = 0;
      for (let q = 0; q < a.length; q++) sum += o[a[q]];
      return sum;
    };
    const has = (k) => J[k].length > 0;

    this.env1.linear = p['env1.curve'] === 'linear'; this.env2.linear = p['env2.curve'] === 'linear';
    this.env1.setTimes(p['env1.a'], p['env1.d'], p['env1.s'], p['env1.r'], sr);
    this.env2.setTimes(p['env2.a'], p['env2.d'], p['env2.s'], p['env2.r'], sr);
    const glideCoef = p['kb.glide'] > 0.0005 ? 1 - Math.exp(-4.6 / (p['kb.glide'] * sr)) : 1;
    // drift: each VCO wanders slowly towards a new random offset now and then
    this.drift.forEach((d) => {
      if (Math.random() < (n / sr) / DRIFT_SECONDS) d.t = (Math.random() * 2 - 1) * DRIFT_OCT;
      d.v += (d.t - d.v) * 0.004;
    });
    const v1 = { oct: p['osc1.range'] + p['osc1.tune'] / 12 + this.tolTune[0] + this.drift[0].v, pw: p['osc1.pw'], fm: p['osc1.fm'] * FM_OCTAVES, pwm: p['osc1.pwm'] * 0.45 };
    const v2 = { oct: p['osc2.range'] + p['osc2.tune'] / 12 + this.tolTune[1] + this.drift[1].v, pw: p['osc2.pw'], fm: p['osc2.fm'] * FM_OCTAVES, pwm: p['osc2.pwm'] * 0.45 };
    const lv = [p['mix.l1'], p['mix.l2'], p['mix.l3'], p['mix.l4']].map(mixGain);
    const boost = Math.max(1, ...lv); // Clean: turn a boosted mix back down
    const cut = Math.log2(p['vcf.cutoff']) + this.tolCut, cvDepth = p['vcf.cv'] * CUTOFF_CV_OCTAVES, halfW = p['vcf.width'] / 2;
    const lfoShape = p['lfo.shape'], lfoRate = p['lfo.rate'] * this.tolLfo, lfoRcv = p['lfo.rcv'] * LFO_RATE_CV_OCTAVES;
    const vcas = [[p['vca1.level'], p['vca1.cv']], [p['vca2.level'], p['vca2.cv']]];
    const vol = p['out.vol'];
    // sequencer: 8 steps, each a pitch (semitones, snapped) and on/off; Length steps are used
    const seqRun = p['seq.run'] === 'run';
    const seqLen = p['seq.len'] || 8;
    const seqInc = (p['seq.rate'] || 4) / sr;
    const seqPitch = [], seqOn = [];
    for (let k = 1; k <= 8; k++) { seqPitch.push(Math.round(p[`seq.s${k}`] || 0) / 12); seqOn.push(p[`seq.g${k}`] !== 'off'); }
    const seqExt = J['seq.clock'].length > 0;
    const TRIG_N = Math.round(TRIG_SECONDS * sr);
    const lfo2Shape = p['lfo2.shape'], lfo2Rate = p['lfo2.rate'] * this.tolLfo2, lfo2Fm = p['lfo2.fm'] * 4, lfo2Tz = p['lfo2.fmmode'] === 'tz', lfo2Uni = p['lfo2.pol'] === 'uni';
    const mixMode = p['mix.mode'], att1 = p['att.a1'], att2 = p['att.a2'], ringMix = p['ring.mix'];
    // noise colour: below 0 a low-pass darkens it (down to ~150 Hz), above 0 a high-pass thins it (from 200 Hz up to ~10 kHz)
    const colour = p['noise.colour'];
    const colourCoefs = (cl) => [
      cl < 0 ? 1 - Math.exp(-TWO_PI * 20000 * Math.pow(2, cl * 7) / sr) : 1,
      cl > 0 ? Math.exp(-TWO_PI * 200 * Math.pow(2, cl * 5.6) / sr) : 0, // 200 Hz to ~10 kHz
      1 + Math.abs(cl) * 1.5, // keep it roughly as loud as it gets darker or brighter
    ];
    let [colLpA, colHpA, colGain] = colourCoefs(colour);
    let col = colour;
    const shInc = p['sh.rate'] * this.tolSh / sr;
    const shLag = p['sh.lag'] > 0.001 ? 1 - Math.exp(-4.6 / (p['sh.lag'] * sr)) : 1;
    const pk2 = this.peak;

    for (let i = 0; i < n; i++) {
      // ---- keyboard
      this.note += (this.target - this.note) * glideCoef;
      o['kb.pitch'] = (this.note - 60) / 12;
      let gate = this.notes.length ? 1 : 0;
      if (this.retrig > 0) { this.retrig--; gate = 0; }
      o['kb.gate'] = gate;
      o['kb.trig'] = this.trig > 0 ? 1 : 0;
      if (this.trig > 0) this.trig--;

      // ---- sequencer. Its own clock (Rate) or, if something is patched into Clock, one step for
      // each rise there. Reset sends it back to step 1. Stopped, it holds its step with the gate low.
      let seqAdvance = false, seqHigh = false;
      if (seqRun) {
        if (seqExt) {
          const clk = read('seq.clock');
          seqAdvance = clk > 0.5 && this.seqClkWas <= 0.5;
          this.seqClkWas = clk;
          seqHigh = clk > 0.5;
        } else {
          this.seqPh += seqInc;
          if (this.seqPh >= 1) { this.seqPh -= Math.floor(this.seqPh); seqAdvance = true; }
          seqHigh = this.seqPh < 0.5; // the gate is high for the first half of each step
        }
      }
      const rst = read('seq.reset');
      if (rst > 0.5 && this.seqRstWas <= 0.5) { this.seqStep = -1; seqAdvance = true; this.seqPh = 0; }
      this.seqRstWas = rst;
      if (seqAdvance) {
        this.seqStep = (this.seqStep + 1) % seqLen;
        if (seqOn[this.seqStep]) this.seqTrig = TRIG_N;
      }
      if (this.seqStep >= seqLen) this.seqStep = 0;
      o['seq.pitch'] = seqPitch[this.seqStep];
      o['seq.gate'] = seqRun && seqHigh && seqOn[this.seqStep] ? 1 : 0;
      o['seq.trig'] = this.seqTrig > 0 ? 1 : 0;
      if (this.seqTrig > 0) this.seqTrig--;

      // ---- noise (white, and pink through a three-pole filter)
      const white = Math.random() * 2 - 1;
      pk[0] = 0.99765 * pk[0] + white * 0.099046;
      pk[1] = 0.963 * pk[1] + white * 0.2965164;
      pk[2] = 0.57 * pk[2] + white * 1.0526913;
      o['noise.white'] = white * 0.7;
      o['noise.pink'] = (pk[0] + pk[1] + pk[2] + white * 0.1848) * 0.16;
      if (has('noise.cv') && (i & 15) === 0) { // Colour CV: re-tune the colour every 16 samples
        col = colour + read('noise.cv');
        col = col < -1 ? -1 : col > 1 ? 1 : col;
        [colLpA, colHpA, colGain] = colourCoefs(col);
      }
      this.colLp += (white - this.colLp) * colLpA;
      this.colHp = colHpA * (this.colHp + this.colLp - this.colPrev); this.colPrev = this.colLp;
      o['noise.col'] = (col > 0 ? this.colHp : this.colLp) * 0.7 * colGain;

      // ---- LFO: Rate CV speeds it up or slows it down; a rising Gate restarts it
      const lg = read('lfo.gate') > 0.5 ? 1 : 0;
      if (lg && !this.lfoGateWas) { this.lfoPh = lfoShape === 'tri' || lfoShape === 'sine' ? 0.25 : 0; this.lfoT = 0; }
      this.lfoGateWas = lg;
      this.lfoPh += (lfoRate * Math.pow(2, read('lfo.rate') * lfoRcv)) / sr;
      if (this.lfoPh >= 1) this.lfoPh -= Math.floor(this.lfoPh);
      const lp = this.lfoPh;
      o['lfo.out'] = lfoWave(lfoShape, lp);
      // LFO 2: rate and shape, restarted by its Gate
      const lg2 = read('lfo2.gate') > 0.5 ? 1 : 0;
      if (lg2 && !this.lfo2GateWas) this.lfo2Ph = lfo2Shape === 'tri' || lfo2Shape === 'sine' ? 0.25 : 0;
      this.lfo2GateWas = lg2;
      // linear FM: the rate moves up and down by (FM in x FM Amount x 4) times itself. Lin stops at 0 Hz;
      // TZ (through zero) lets it go below zero, so the wave runs backwards
      let f2 = lfo2Rate * (1 + read('lfo2.fm') * lfo2Fm);
      if (!lfo2Tz && f2 < 0) f2 = 0;
      this.lfo2Ph += f2 / sr; this.lfo2Ph -= Math.floor(this.lfo2Ph);
      const w2 = lfoWave(lfo2Shape, this.lfo2Ph);
      o['lfo2.out'] = lfo2Uni ? (w2 + 1) / 2 : w2;

      // ---- envelopes
      const e1 = this.env1.next(read('env1.gate'));
      o['env1.out'] = e1; o['env1.inv'] = -e1;
      const e2 = this.env2.next(read('env2.gate'));
      o['env2.out'] = e2; o['env2.inv'] = -e2;

      // ---- sample & hold: on each rising Clock (or its own Speed clock when nothing is in Clock),
      // grab the In (or white noise if nothing is patched). Lag glides to each new value.
      let tick = false;
      if (has('sh.clock')) {
        const clk = read('sh.clock');
        tick = clk > 0.2 && this.shClockWas <= 0.2;
        this.shClockWas = clk;
      } else {
        this.shPh += shInc;
        if (this.shPh >= 1) { this.shPh -= 1; tick = true; }
      }
      if (tick) this.shVal = has('sh.in') ? read('sh.in') : white;
      this.shOut += (this.shVal - this.shOut) * shLag;
      o['sh.out'] = this.shOut;

      // ---- VCOs
      let pw = v1.pw + read('vco1.pwm') * v1.pwm; pw = pw < 0.05 ? 0.05 : pw > 0.95 ? 0.95 : pw;
      this.vco1.next(v1.oct + read('vco1.pitch') + read('vco1.fm') * v1.fm, pw, read('vco1.sync'), sr, nyq, o, 'vco1.');
      pw = v2.pw + read('vco2.pwm') * v2.pwm; pw = pw < 0.05 ? 0.05 : pw > 0.95 ? 0.95 : pw;
      this.vco2.next(v2.oct + read('vco2.pitch') + read('vco2.fm') * v2.fm, pw, read('vco2.sync'), sr, nyq, o, 'vco2.');

      // ---- mixer
      o['mix.out'] = lim(mixShape(mixMode, read('mix.in1') * lv[0] + read('mix.in2') * lv[1] + read('mix.in3') * lv[2] + read('mix.in4') * lv[3], boost));

      // ---- ring modulator: A times B
      const ra = read('ring.a');
      o['ring.out'] = lim(ra * (1 - ringMix) + ra * read('ring.b') * ringMix); // Mix: from A alone to A x B

      // ---- attenuverters: In scaled (and flipped, below 0) by Amount; with nothing in In, a steady voltage
      o['att.out1'] = lim(has('att.in1') ? read('att.in1') * att1 : att1);
      o['att.out2'] = lim(has('att.in2') ? read('att.in2') * att2 : att2);

      // ---- VCF. Cutoff (moved by Freq x CV Amount, and Pitch at one octave per octave) is the centre;
      // Width puts the low-pass half its value above the centre and the high-pass half below.
      //   LP: 4-pole ladder.  HP: 2-pole state-variable filter A.  BP: HP then a 2-pole low-pass
      //   (state-variable filter B), so it keeps the band between the two cutoffs.
      const x = read('filt.in') + (Math.random() - 0.5) * 2e-5;
      const centre = cut + read('filt.cv') * cvDepth + read('filt.key');
      let fc = Math.pow(2, centre + halfW);
      if (fc > nyq) fc = nyq; else if (fc < 8) fc = 8;
      let fcH = Math.pow(2, centre - halfW);
      if (fcH > nyq) fcH = nyq; else if (fcH < 8) fcH = 8;
      let res = p['vcf.res'] + read('filt.res') * p['vcf.cv']; // CV Amount scales Res as well as Freq
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
      o['filt.out'] = lim(u * (1 + fb * 0.45));
      // the state-variable filters (zero-delay-feedback form), with the same resonance
      const k = 2 - 1.96 * res;
      // A: high-pass at the lower cutoff
      const gA = Math.tan(Math.PI * fcH / sr);
      const a1 = 1 / (1 + gA * (gA + k)), a2 = gA * a1, a3 = gA * a2;
      const sv3 = x - this.ic2;
      const sv1 = a1 * this.ic1 + a2 * sv3;
      const sv2 = this.ic2 + a2 * this.ic1 + a3 * sv3;
      this.ic1 = 2 * sv1 - this.ic1; this.ic2 = 2 * sv2 - this.ic2;
      const hp = x - k * sv1 - sv2;
      o['filt.hp'] = lim(hp);
      // B: low-pass of that at the upper cutoff = the band between them
      const b1 = 1 / (1 + gg * (gg + k)), b2 = gg * b1, b3 = gg * b2;
      const sw3 = hp - this.ic4;
      const sw1 = b1 * this.ic3 + b2 * sw3;
      const sw2 = this.ic4 + b2 * this.ic3 + b3 * sw3;
      this.ic3 = 2 * sw1 - this.ic3; this.ic4 = 2 * sw2 - this.ic4;
      o['filt.bp'] = lim(sw2 * (0.6 + k * 0.4));
      if (i === n - 1) this.lastFc = fc;

      // ---- VCAs: Level opens it by hand; CV (scaled by CV Amount) opens it further
      for (let k = 0; k < 2; k++) {
        let g = vcas[k][0] + read(`vca${k + 1}.cv`) * vcas[k][1];
        g = g < 0 ? 0 : g > 1 ? 1 : g;
        o[`vca${k + 1}.out`] = lim(read(`vca${k + 1}.in`) * g);
      }

      // ---- output
      // output: a soft limiter that never goes past CEILING, however hot the patch
      const pre = read('out.in') * vol * OUTPUT_GAIN * 1.6;
      const a = pre < 0 ? -pre : pre;
      if (a > this.over) this.over = a;
      L[i] = CEILING * Math.tanh(pre / CEILING);
      if (S1) S1[i] = o['mix.out'] * OUTPUT_GAIN;

      for (let k = 1; k < OUTPUTS.length; k++) { const a = Math.abs(o[OUTPUTS[k]]); if (a > pk2[OUTPUTS[k]]) pk2[OUTPUTS[k]] = a; }
    }
    // self-repair: if a runaway loop has broken the maths anywhere, reset the filters and carry on
    if (!(Number.isFinite(s[0] + s[1] + s[2] + s[3] + this.ic1 + this.ic2 + this.ic3 + this.ic4 + this.shOut + this.colLp + this.colHp + this.note) && Number.isFinite(L[n - 1]))) {
      s.fill(0); this.ic1 = this.ic2 = this.ic3 = this.ic4 = 0; this.shOut = this.shVal = 0; this.colLp = this.colHp = this.colPrev = 0;
      if (!Number.isFinite(this.note)) this.note = this.target;
      OUTPUTS.forEach((k) => (o[k] = 0));
      L.fill(0);
      this.resets++;
    }
    for (let c = 1; c < out.length; c++) out[c].set(L);

    const dtB = n / sr;
    [this.env1, this.env2].forEach((e) => { e.tOn += dtB; e.tOff += dtB; });
    this.lfoT += dtB;
    if (++this.blocks % 4 === 0) {
      this.port.postMessage({
        type: 'state', gate: this.notes.length > 0, note: this.note, target: this.target, fc: this.lastFc,
        a: this.env1.report(), f: this.env2.report(), lfo: o['lfo.out'], lfoT: this.lfoT, beat: 0,
        outs: { ...pk2, 'kb.pitch': pk2['kb.gate'] },
        seqStep: this.seqStep, seqRun: seqRun,
        over: this.over, resets: this.resets, // for the Overload light, and a warning after a reset
      });
      this.over = 0;
      OUTPUTS.forEach((k) => (pk2[k] = 0));
    }
    return true;
  }
}

registerProcessor('nfmod-processor', NFModProcessor);
