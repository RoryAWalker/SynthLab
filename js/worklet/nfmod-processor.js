// NF-Modular voice: the full modular rack, running in an AudioWorklet.
// Modules: Keyboard, two VCOs, Noise, Mixer, VCF, two ENVs, LFO, Sample & Hold, two VCAs, Output.
// As on the MiniModular, nothing is wired inside: every connection is a patch cable, stored in
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

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

class Envelope {
  constructor() { this.v = 0; this.stage = 0; this.tOn = 0; this.tOff = 0; this.was = 0; }
  setTimes(a, d, s, r, sr) {
    this.aCoef = 1 - Math.exp(-1.466 / (a * sr));
    this.dCoef = 1 - Math.exp(-4.6 / (d * sr));
    this.rCoef = 1 - Math.exp(-4.6 / (r * sr));
    this.s = s;
  }
  // gate: the level at the Gate input this sample
  next(gate) {
    const g = gate > 0.5 ? 1 : 0;
    if (g && !this.was) { this.stage = 1; this.tOn = 0; }
    else if (!g && this.was && this.stage !== 0) { this.stage = 3; this.tOff = 0; }
    this.was = g;
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
  'noise.white', 'noise.pink', 'noise.col', 'mix.out', 'filt.out', 'filt.bp', 'filt.hp', 'env1.out', 'env1.inv', 'env2.out', 'env2.inv', 'lfo.out', 'sh.out',
  'vca1.out', 'vca2.out'];

class NFModProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = {};
    this.notes = [];
    this.note = 60; this.target = 60;
    this.retrig = 0; this.trig = 0;
    this.vco1 = new VCO(); this.vco2 = new VCO();
    this.env1 = new Envelope(); this.env2 = new Envelope();
    this.lfoPh = 0; this.lfoT = 0; this.lfoGateWas = 0;
    this.shVal = 0; this.shOut = 0; this.shClockWas = 0; this.shPh = 0;
    this.colLp = 0; this.colHp = 0; this.colPrev = 0;
    this.ic1 = 0; this.ic2 = 0; // the state-variable filter behind the BP and HP outputs
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
        if (this.notes.length) this.retrig = 64; // already held: a short gap in the gate restarts the envelopes
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

    const src = (jack) => p['jack.' + jack] || '';
    const J = {};
    ['vco1.pitch', 'vco1.fm', 'vco1.pwm', 'vco1.sync', 'vco2.pitch', 'vco2.fm', 'vco2.pwm', 'vco2.sync',
      'mix.in1', 'mix.in2', 'mix.in3', 'mix.in4', 'filt.in', 'filt.cv', 'filt.key', 'filt.res',
      'env1.gate', 'env2.gate', 'lfo.gate', 'lfo.rate', 'sh.in', 'sh.clock',
      'vca1.in', 'vca1.cv', 'vca2.in', 'vca2.cv', 'out.in'].forEach((k) => (J[k] = src(k)));
    const read = (k) => (J[k] ? o[J[k]] : 0);

    this.env1.setTimes(p['env1.a'], p['env1.d'], p['env1.s'], p['env1.r'], sr);
    this.env2.setTimes(p['env2.a'], p['env2.d'], p['env2.s'], p['env2.r'], sr);
    const glideCoef = p['kb.glide'] > 0.0005 ? 1 - Math.exp(-4.6 / (p['kb.glide'] * sr)) : 1;
    const v1 = { oct: p['osc1.range'] + p['osc1.tune'] / 12, pw: p['osc1.pw'], fm: p['osc1.fm'] * FM_OCTAVES, pwm: p['osc1.pwm'] * 0.45 };
    const v2 = { oct: p['osc2.range'] + p['osc2.tune'] / 12, pw: p['osc2.pw'], fm: p['osc2.fm'] * FM_OCTAVES, pwm: p['osc2.pwm'] * 0.45 };
    const lv = [p['mix.l1'], p['mix.l2'], p['mix.l3'], p['mix.l4']];
    const cut = Math.log2(p['filt.cutoff']), cvDepth = p['filt.cv'] * CUTOFF_CV_OCTAVES;
    const lfoShape = p['lfo.shape'], lfoRate = p['lfo.rate'], lfoRcv = p['lfo.rcv'] * LFO_RATE_CV_OCTAVES;
    const vcas = [[p['vca1.level'], p['vca1.cv']], [p['vca2.level'], p['vca2.cv']]];
    const vol = p['out.vol'];
    // noise colour: below 0 a low-pass darkens it (down to ~150 Hz), above 0 a high-pass thins it (from 200 Hz up to ~10 kHz)
    const colour = p['noise.colour'];
    const colLpA = colour < 0 ? 1 - Math.exp(-TWO_PI * 20000 * Math.pow(2, colour * 7) / sr) : 1;
    const colHpA = colour > 0 ? Math.exp(-TWO_PI * 200 * Math.pow(2, colour * 5.6) / sr) : 0; // 200 Hz to ~10 kHz
    const colGain = 1 + Math.abs(colour) * 1.5; // keep it roughly as loud as it gets darker or brighter
    const shInc = p['sh.rate'] / sr;
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

      // ---- noise (white, and pink through a three-pole filter)
      const white = Math.random() * 2 - 1;
      pk[0] = 0.99765 * pk[0] + white * 0.099046;
      pk[1] = 0.963 * pk[1] + white * 0.2965164;
      pk[2] = 0.57 * pk[2] + white * 1.0526913;
      o['noise.white'] = white * 0.7;
      o['noise.pink'] = (pk[0] + pk[1] + pk[2] + white * 0.1848) * 0.16;
      this.colLp += (white - this.colLp) * colLpA;
      this.colHp = colHpA * (this.colHp + this.colLp - this.colPrev); this.colPrev = this.colLp;
      o['noise.col'] = (colour > 0 ? this.colHp : this.colLp) * 0.7 * colGain;

      // ---- LFO: Rate CV speeds it up or slows it down; a rising Gate restarts it
      const lg = read('lfo.gate') > 0.5 ? 1 : 0;
      if (lg && !this.lfoGateWas) { this.lfoPh = lfoShape === 'tri' || lfoShape === 'sine' ? 0.25 : 0; this.lfoT = 0; }
      this.lfoGateWas = lg;
      this.lfoPh += (lfoRate * Math.pow(2, read('lfo.rate') * lfoRcv)) / sr;
      if (this.lfoPh >= 1) this.lfoPh -= Math.floor(this.lfoPh);
      const lp = this.lfoPh;
      o['lfo.out'] = lfoShape === 'saw' ? 2 * lp - 1 : lfoShape === 'square' ? (lp < 0.5 ? 1 : -1)
        : lfoShape === 'sine' ? Math.sin(TWO_PI * (lp - 0.25)) : 1 - 4 * Math.abs(lp - 0.5);

      // ---- envelopes
      const e1 = this.env1.next(read('env1.gate'));
      o['env1.out'] = e1; o['env1.inv'] = -e1;
      const e2 = this.env2.next(read('env2.gate'));
      o['env2.out'] = e2; o['env2.inv'] = -e2;

      // ---- sample & hold: on each rising Clock (or its own Speed clock when nothing is in Clock),
      // grab the In (or white noise if nothing is patched). Lag glides to each new value.
      let tick = false;
      if (J['sh.clock']) {
        const clk = o[J['sh.clock']];
        tick = clk > 0.2 && this.shClockWas <= 0.2;
        this.shClockWas = clk;
      } else {
        this.shPh += shInc;
        if (this.shPh >= 1) { this.shPh -= 1; tick = true; }
      }
      if (tick) this.shVal = J['sh.in'] ? o[J['sh.in']] : white;
      this.shOut += (this.shVal - this.shOut) * shLag;
      o['sh.out'] = this.shOut;

      // ---- VCOs
      let pw = v1.pw + read('vco1.pwm') * v1.pwm; pw = pw < 0.05 ? 0.05 : pw > 0.95 ? 0.95 : pw;
      this.vco1.next(v1.oct + read('vco1.pitch') + read('vco1.fm') * v1.fm, pw, read('vco1.sync'), sr, nyq, o, 'vco1.');
      pw = v2.pw + read('vco2.pwm') * v2.pwm; pw = pw < 0.05 ? 0.05 : pw > 0.95 ? 0.95 : pw;
      this.vco2.next(v2.oct + read('vco2.pitch') + read('vco2.fm') * v2.fm, pw, read('vco2.sync'), sr, nyq, o, 'vco2.');

      // ---- mixer
      o['mix.out'] = read('mix.in1') * lv[0] + read('mix.in2') * lv[1] + read('mix.in3') * lv[2] + read('mix.in4') * lv[3];

      // ---- VCF: 4-pole ladder low-pass. CV (scaled by CV Amount), Key (1 octave per octave) and Res CV.
      const x = read('filt.in') + (Math.random() - 0.5) * 2e-5;
      let fc = Math.pow(2, cut + read('filt.cv') * cvDepth + read('filt.key'));
      if (fc > nyq) fc = nyq; else if (fc < 8) fc = 8;
      let res = p['filt.res'] + read('filt.res');
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
      o['filt.out'] = u * (1 + fb * 0.45);
      // BP and HP come from a 2-pole state-variable filter at the same cutoff and resonance
      // (zero-delay-feedback form), so all three outputs move together
      const k = 2 - 1.96 * res;
      const a1 = 1 / (1 + gg * (gg + k)), a2 = gg * a1, a3 = gg * a2;
      const sv3 = x - this.ic2;
      const sv1 = a1 * this.ic1 + a2 * sv3;
      const sv2 = this.ic2 + a2 * this.ic1 + a3 * sv3;
      this.ic1 = 2 * sv1 - this.ic1; this.ic2 = 2 * sv2 - this.ic2;
      o['filt.bp'] = sv1 * (0.5 + k * 0.5);
      o['filt.hp'] = x - k * sv1 - sv2;
      if (i === n - 1) this.lastFc = fc;

      // ---- VCAs: Level opens it by hand; CV (scaled by CV Amount) opens it further
      for (let k = 0; k < 2; k++) {
        let g = vcas[k][0] + read(`vca${k + 1}.cv`) * vcas[k][1];
        g = g < 0 ? 0 : g > 1 ? 1 : g;
        o[`vca${k + 1}.out`] = read(`vca${k + 1}.in`) * g;
      }

      // ---- output
      const outV = read('out.in');
      L[i] = Math.tanh(outV * vol * OUTPUT_GAIN * 1.6);
      if (S1) S1[i] = o['mix.out'] * OUTPUT_GAIN;

      for (let k = 1; k < OUTPUTS.length; k++) { const a = Math.abs(o[OUTPUTS[k]]); if (a > pk2[OUTPUTS[k]]) pk2[OUTPUTS[k]] = a; }
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
      });
      OUTPUTS.forEach((k) => (pk2[k] = 0));
    }
    return true;
  }
}

registerProcessor('nfmod-processor', NFModProcessor);
