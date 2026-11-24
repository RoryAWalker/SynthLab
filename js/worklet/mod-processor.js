// NF-MiniModular voice: a small modular synth running in an AudioWorklet.
// Modules: Keyboard, LFO, Oscillator, Filter, Envelope, VCA, Output. Nothing is wired
// inside: every connection is a patch cable, stored in the patch as
//   'jack.<module>.<input>': '<output id>'  (or '' when nothing is plugged in)
// Each sample, the modules run in a fixed order (keyboard, LFO, envelope, oscillator,
// filter, VCA, output), each reading its inputs from the outputs computed so far. A cable
// that runs "backwards" (e.g. VCA out into the oscillator's FM) reads the previous sample.
//
// Signal conventions (like voltages on a real modular):
//   pitch  - octaves above middle C (1 V/octave)
//   gate   - 0 (key up) or 1 (key down)
//   env    - 0..1
//   LFO    - -1..1
//   audio  - about -1..1

const TWO_PI = Math.PI * 2;
const OUTPUT_GAIN = 0.5;
const C4 = 261.6256;          // the oscillator's pitch with nothing in its Pitch input
const FM_OCTAVES = 2;         // FM Amount fully up: an input of 1 bends the pitch 2 octaves
const CUTOFF_CV_OCTAVES = 6;  // Filter CV Amount fully up: an input of 1 opens it 6 octaves
const PULSE_WIDTH = { square: 0.5, pulse: 0.25, narrow: 0.1 };

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

function oscSample(wave, ph, dt) {
  switch (wave) {
    case 'sine': return Math.sin(TWO_PI * ph);
    case 'tri': return 1 - 4 * Math.abs(ph - 0.5);
    case 'saw': return 2 * ph - 1 - polyBlep(ph, dt);
    default: {
      const pw = PULSE_WIDTH[wave] || 0.5;
      let v = ph < pw ? 1 : -1;
      v += polyBlep(ph, dt);
      let t2 = ph - pw; if (t2 < 0) t2 += 1;
      v -= polyBlep(t2, dt);
      return v - (2 * pw - 1);
    }
  }
}

// ADSR with exponential segments (same shape as the NF-1's, so the teaching graph matches).
class Envelope {
  constructor() { this.v = 0; this.stage = 0; this.tOn = 0; this.tOff = 0; }
  setTimes(a, d, s, r, sr) {
    this.aCoef = 1 - Math.exp(-1.466 / (a * sr));
    this.dCoef = 1 - Math.exp(-4.6 / (d * sr));
    this.rCoef = 1 - Math.exp(-4.6 / (r * sr));
    this.s = s;
  }
  gateOn() { this.stage = 1; this.tOn = 0; }
  gateOff() { if (this.stage !== 0) { this.stage = 3; this.tOff = 0; } }
  next() {
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
}

const OUTPUTS = ['kb.pitch', 'kb.gate', 'lfo.out', 'env.out', 'osc.out', 'filt.out', 'vca.out'];

class ModProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = {};
    this.notes = [];
    this.note = 60; this.target = 60;
    this.retrig = 0;           // samples left of a short gap in the gate (a new note while one is held)
    this.ph = 0; this.lfoPh = 0; this.shVal = 0; this.lfoT = 0;
    this.env = new Envelope();
    this.gateWas = 0;
    this.lfoGateWas = 0;
    this.s = [0, 0, 0, 0];     // ladder filter state
    this.o = {};               // every output's latest value
    OUTPUTS.forEach((k) => (this.o[k] = 0));
    this.blocks = 0; this.lastFc = 1000;
    this.peak = {}; OUTPUTS.forEach((k) => (this.peak[k] = 0)); // loudest value of each output since the last report
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    switch (m.type) {
      case 'patch': Object.assign(this.p, m.patch); break;
      case 'param': this.p[m.id] = m.value; break;
      case 'noteOn': {
        const i = this.notes.indexOf(m.note);
        if (i >= 0) this.notes.splice(i, 1);
        // already held: in Mono, drop the gate briefly so the envelope restarts; in Legato, keep it high
        if (this.notes.length && this.p['kb.mode'] !== 'legato') this.retrig = 64;
        this.notes.push(m.note);
        this.target = m.note;
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
    if (p['osc1.wave'] === undefined) return true; // no patch yet
    const sr = sampleRate, n = L.length, o = this.o;

    // where each input is plugged in ('' = nothing)
    const src = (jack) => p['jack.' + jack] || '';
    const jLfoGate = src('lfo.gate'), jPitch = src('osc.pitch'), jFm = src('osc.fm'), jFiltIn = src('filt.in'), jFiltCv = src('filt.cv'),
      jGate = src('env.gate'), jVcaIn = src('vca.in'), jVcaCv = src('vca.cv'), jOut = src('out.in');
    const read = (j) => (j ? o[j] : 0);

    this.env.setTimes(p['aenv.a'], p['aenv.d'], p['aenv.s'], p['aenv.r'], sr);
    const glideCoef = p['kb.glide'] > 0.0005 ? 1 - Math.exp(-4.6 / (p['kb.glide'] * sr)) : 1;
    const lfoInc = p['lfo.rate'] / sr;
    const lfoShape = p['lfo.shape'], wave = p['osc1.wave'];
    const oscOct = p['osc1.range'] + p['osc1.tune'] / 12;
    const fmDepth = p['osc.fm'] * FM_OCTAVES;
    const cut = Math.log2(p['filt.cutoff']), res = p['filt.res'];
    const cvDepth = p['filt.cv'] * CUTOFF_CV_OCTAVES;
    const level = p['vca.level'], vol = p['out.vol'];
    const s = this.s, nyq = sr * 0.45;

    for (let i = 0; i < n; i++) {
      // ---- keyboard: pitch (glides) and gate
      this.note += (this.target - this.note) * glideCoef;
      o['kb.pitch'] = (this.note - 60) / 12;
      let gate = this.notes.length ? 1 : 0;
      if (this.retrig > 0) { this.retrig--; gate = 0; }
      o['kb.gate'] = gate;

      // ---- LFO: a rising Gate restarts the wave from its start (a new random step for S&H)
      const lg = read(jLfoGate) > 0.5 ? 1 : 0;
      if (lg && !this.lfoGateWas) {
        this.lfoPh = lfoShape === 'tri' ? 0.25 : 0; // the triangle starts at its centre, rising
        this.lfoT = 0;
        this.shVal = Math.random() * 2 - 1;
      }
      this.lfoGateWas = lg;
      this.lfoPh += lfoInc;
      let wrapped = false;
      if (this.lfoPh >= 1) { this.lfoPh -= 1; wrapped = true; }
      let lfo;
      switch (lfoShape) {
        case 'saw': lfo = 2 * this.lfoPh - 1; break;
        case 'square': lfo = this.lfoPh < 0.5 ? 1 : -1; break;
        case 'sh': if (wrapped) this.shVal = Math.random() * 2 - 1; lfo = this.shVal; break;
        default: lfo = 1 - 4 * Math.abs(this.lfoPh - 0.5);
      }
      o['lfo.out'] = lfo;

      // ---- envelope: starts when its Gate input goes high, releases when it goes low
      const g = read(jGate) > 0.5 ? 1 : 0;
      if (g && !this.gateWas) this.env.gateOn();
      else if (!g && this.gateWas) this.env.gateOff();
      this.gateWas = g;
      o['env.out'] = this.env.next();

      // ---- oscillator
      const oct = oscOct + read(jPitch) + read(jFm) * fmDepth;
      let f = C4 * Math.pow(2, oct);
      if (f > nyq) f = nyq; else if (f < 0.01) f = 0.01;
      const dt = f / sr;
      const osc = oscSample(wave, this.ph, Math.min(dt, 0.49));
      this.ph += dt; if (this.ph >= 1) this.ph -= Math.floor(this.ph);
      o['osc.out'] = osc;
      if (S1) S1[i] = osc * OUTPUT_GAIN;

      // ---- filter: 4-pole ladder low-pass (as on the NF-1)
      const x = read(jFiltIn) + (Math.random() - 0.5) * 2e-5; // a whisper of noise, so it can self-oscillate
      let fc = Math.pow(2, cut + read(jFiltCv) * cvDepth);
      if (fc > nyq) fc = nyq; else if (fc < 8) fc = 8;
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
      o['filt.out'] = u * (1 + fb * 0.45);
      if (i === n - 1) this.lastFc = fc;

      // ---- VCA: Level sets how open it is with nothing plugged into CV; CV opens it further
      let gain = level + read(jVcaCv);
      if (gain < 0) gain = 0; else if (gain > 1) gain = 1;
      o['vca.out'] = read(jVcaIn) * gain;

      // ---- output
      L[i] = Math.tanh(read(jOut) * vol * OUTPUT_GAIN * 1.6);

      const pk = this.peak;
      for (let k = 2; k < OUTPUTS.length; k++) { const a = Math.abs(o[OUTPUTS[k]]); if (a > pk[OUTPUTS[k]]) pk[OUTPUTS[k]] = a; }
      if (o['kb.gate'] > pk['kb.gate']) pk['kb.gate'] = o['kb.gate'];
    }
    for (let c = 1; c < out.length; c++) out[c].set(L);

    // live state for the panel's lights and teaching graphs
    const dtB = n / sr;
    this.env.tOn += dtB; this.env.tOff += dtB;
    this.lfoT += dtB;
    if (++this.blocks % 4 === 0) {
      const e = this.env;
      const env = { s: e.stage, v: e.v, tOn: e.tOn, tOff: e.tOff };
      this.port.postMessage({
        type: 'state', gate: this.notes.length > 0, note: this.note, target: this.target, fc: this.lastFc,
        a: env, f: env, lfo: o['lfo.out'], lfoT: this.lfoT, beat: 0,
        // each output's loudest value since the last report, for the lamps by the output jacks
        outs: { ...this.peak, 'kb.pitch': this.peak['kb.gate'] },
      });
    }
    if (this.blocks % 4 === 0) OUTPUTS.forEach((k) => (this.peak[k] = 0));
    return true;
  }
}

registerProcessor('mod-processor', ModProcessor);
