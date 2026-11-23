// NF-1 voice: a monophonic virtual-analog synth running in an AudioWorklet.
// Signal path (classic subtractive):
//   OSC1 + OSC2 -> MIXER -> 4-pole ladder LOW-PASS -> VCA -> out
// Modulators: filter envelope (AD-R, bipolar amount), loudness envelope (ADSR),
// LFO with fade-in delay, glide.

const TWO_PI = Math.PI * 2;
const OUTPUT_GAIN = 0.45; // fixed master level (no volume knob on the panel)
const PULSE_WIDTH = { square: 0.5, pulse: 0.25, narrow: 0.1 };

// PolyBLEP: smooths the jump in saw/square waves to cut aliasing.
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
      // keep the average at zero for narrow pulses
      return v - (2 * pw - 1);
    }
  }
}

// Analog-style envelope: exponential segments, like a capacitor charging.
class Envelope {
  constructor() { this.v = 0; this.stage = 0; } // 0 idle, 1 attack, 2 decay/sustain, 3 release
  setTimes(a, d, s, r, sr) {
    // attack aims past 1.0 (overshoot target) so it reaches the top in ~a seconds
    this.aCoef = 1 - Math.exp(-1.466 / (a * sr));
    this.dCoef = 1 - Math.exp(-4.6 / (d * sr));
    this.rCoef = 1 - Math.exp(-4.6 / (r * sr));
    this.s = s;
  }
  gateOn() { this.stage = 1; }
  gateOff() { if (this.stage !== 0) this.stage = 3; }
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

class VAProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = {};
    this.notes = [];
    this.note = 60;        // current (gliding) pitch in semitones
    this.target = 60;
    this.hasPlayed = false;
    this.ph1 = 0; this.ph2 = 0;
    this.lfoPh = 0; this.shVal = 0;
    this.lfoFade = 1;      // 0..1 LFO depth multiplier, ramps up after a fresh note (LFO delay)
    this.fenv = new Envelope();
    this.aenv = new Envelope();
    this.s = [0, 0, 0, 0];  // ladder filter state
    // smoothed copies of continuous controls (avoid zipper noise)
    this.sm = null;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    switch (m.type) {
      case 'patch': Object.assign(this.p, m.patch); break;
      case 'param': this.p[m.id] = m.value; break;
      case 'noteOn': {
        const i = this.notes.indexOf(m.note);
        if (i >= 0) this.notes.splice(i, 1);
        const fresh = !this.notes.length;          // no other key held
        const legato = this.p['ctrl.mode'] === 'legato';
        this.notes.push(m.note);
        this.target = m.note;
        // Legato: a separate (non-overlapping) note jumps straight to pitch; only overlapping notes glide.
        if (!this.hasPlayed || (legato && fresh)) { this.note = m.note; this.hasPlayed = true; }
        // Mono: every note restarts the envelopes and LFO delay. Legato: only separate notes do.
        if (!legato || fresh) {
          this.fenv.gateOn();
          this.aenv.gateOn();
          this.lfoFade = 0;
        }
        break;
      }
      case 'noteOff': {
        const i = this.notes.indexOf(m.note);
        if (i >= 0) this.notes.splice(i, 1);
        if (this.notes.length) this.target = this.notes[this.notes.length - 1]; // fall back to held note
        else { this.fenv.gateOff(); this.aenv.gateOff(); }
        break;
      }
      case 'allOff':
        this.notes = [];
        this.fenv.gateOff(); this.aenv.gateOff();
        break;
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    if (!L) return true;
    const p = this.p;
    if (p['osc1.wave'] === undefined) return true; // no patch yet
    const sr = sampleRate;
    const n = L.length;

    // ---- per-block derived values ----
    this.fenv.setTimes(p['fenv.a'], p['fenv.d'], 0, p['fenv.r'], sr); // no sustain: AD-R
    this.aenv.setTimes(p['aenv.a'], p['aenv.d'], p['aenv.s'], p['aenv.r'], sr);
    const glideCoef = p['ctrl.glide'] > 0.0005 ? 1 - Math.exp(-4.6 / (p['ctrl.glide'] * sr)) : 1;
    const lfoInc = p['lfo.rate'] / sr;
    const fadeInc = p['lfo.delay'] > 0.001 ? 1 / (p['lfo.delay'] * sr) : 1;
    const lfoShape = p['lfo.shape'];
    const w1 = p['osc1.wave'], w2 = p['osc2.wave'];
    const off1 = p['osc1.range'] * 12;
    const off2 = p['osc2.range'] * 12 + p['osc2.fine'] / 100;

    const tgt = {
      m1: p['mix.osc1'], m2: p['mix.osc2'],
      cut: Math.log2(p['filt.cutoff']), res: p['filt.res'], env: p['filt.env'],
      lp: p['lfo.pitch'], lf: p['lfo.filter'], la: p['lfo.amp'],
    };
    if (!this.sm) this.sm = { ...tgt };
    const sm = this.sm;
    const k = 0.0015; // smoothing per sample (~15 ms)
    const s = this.s;
    const nyq = sr * 0.45;

    for (let i = 0; i < n; i++) {
      for (const key in tgt) sm[key] += (tgt[key] - sm[key]) * k;

      // glide
      this.note += (this.target - this.note) * glideCoef;

      // LFO (-1..1)
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
      if (this.lfoFade < 1) this.lfoFade = Math.min(1, this.lfoFade + fadeInc);
      const lfoDepth = this.lfoFade;

      // oscillators
      const vib = lfo * sm.lp * lfoDepth;
      const f1 = 440 * Math.pow(2, (this.note + off1 + vib - 69) / 12);
      const f2 = 440 * Math.pow(2, (this.note + off2 + vib - 69) / 12);
      const dt1 = Math.min(f1 / sr, 0.49), dt2 = Math.min(f2 / sr, 0.49);
      const o1 = oscSample(w1, this.ph1, dt1);
      const o2 = oscSample(w2, this.ph2, dt2);
      this.ph1 += dt1; if (this.ph1 >= 1) this.ph1 -= 1;
      this.ph2 += dt2; if (this.ph2 >= 1) this.ph2 -= 1;

      // mixer
      const x = o1 * sm.m1 + o2 * sm.m2;

      // envelopes
      const fe = this.fenv.next();
      const ae = this.aenv.next();

      // filter cutoff in octaves
      let fc = Math.pow(2, sm.cut + sm.env * 7 * fe + sm.lf * lfo * lfoDepth);
      if (fc > nyq) fc = nyq; else if (fc < 8) fc = 8;

      // 4-pole ladder low-pass, zero-delay-feedback (TPT) form with input saturation
      const g = Math.tan(Math.PI * fc / sr);
      const G = g / (1 + g);
      const G2 = G * G, G4 = G2 * G2;
      const fb = sm.res * 4.15;
      const sigma = (G2 * G * s[0] + G2 * s[1] + G * s[2] + s[3]) / (1 + g);
      const y4est = (G4 * x + sigma) / (1 + fb * G4);
      let u = Math.tanh(x - fb * y4est);
      for (let j = 0; j < 4; j++) {
        const v = (u - s[j]) * G;
        const y = v + s[j];
        s[j] = y + v;
        u = y;
      }
      const filtered = u * (1 + fb * 0.45); // partial passband make-up gain

      // VCA
      const trem = 1 - sm.la * lfoDepth * (0.5 + 0.5 * lfo);
      L[i] = Math.tanh(filtered * ae * trem * OUTPUT_GAIN);
    }

    for (let c = 1; c < out.length; c++) out[c].set(L);
    return true;
  }
}

registerProcessor('va-processor', VAProcessor);
