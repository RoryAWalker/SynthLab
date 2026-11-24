// NiniFoog voice (internal id nf3): three-oscillator monosynth in the classic 1970s layout.
// Signal path:
//   OSC1 + OSC2 + OSC3 + NOISE + FEEDBACK -> MIXER -> 4-pole ladder LOW-PASS -> VCA -> out
// Modulation: Osc 3 and/or noise (Modulation Mix), scaled by the mod wheel, sent to the
// oscillators' pitch (Osc. Modulation) and/or the filter cutoff (Filter Modulation).
// Keyboard: legato. The newest note always takes the pitch; the contours only restart
// when a note is played with no other key held.
// Like analogue oscillators, the three oscillators run all the time from random starting
// points and drift very slightly, so their phase relationship is never quite the same twice.

const TWO_PI = Math.PI * 2;
const PULSE_WIDTH = { square: 0.5, wide: 0.3, narrow: 0.12 };
const BEND_RANGE = 2;       // semitones at full pitch wheel
const MOD_PITCH = 12;       // semitones of pitch modulation at full mod wheel
const MOD_FILTER = 4;       // octaves of filter modulation at full mod wheel
const FEEDBACK_GAIN = 3;    // the output fed back into the mixer, at full Feedback
const SHORT_RELEASE = 0.012; // release when the Decay switch is off
const OUTPUT_GAIN = 0.45;   // fixed master level
const DRIFT_CENTS = 2.5;    // largest slow pitch wander of each oscillator
const DRIFT_SECONDS = 1.6;  // roughly how often each oscillator picks a new drift target

function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

function oscSample(wave, ph, dt) {
  switch (wave) {
    case 'tri': return 1 - 4 * Math.abs(ph - 0.5);
    case 'saw': return 2 * ph - 1 - polyBlep(ph, dt);
    case 'revsaw': return 1 - 2 * ph + polyBlep(ph, dt);
    case 'shark': return 0.5 * (1 - 4 * Math.abs(ph - 0.5)) + 0.5 * (2 * ph - 1 - polyBlep(ph, dt)); // triangle-saw blend
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

// Attack / Decay / Sustain contour; release is set separately (the Decay switch).
class Contour {
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

const on = (v) => v === 'on';
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
// Osc 3 as an LFO (Range LO, Control off): the Frequency knob (-7..+7) sweeps 0.1-20 Hz, log.
const LFO_MIN = 0.1, LFO_MAX = 20;
const lfoHz = (knob) => LFO_MIN * Math.pow(LFO_MAX / LFO_MIN, (knob + 7) / 14);

class VA3Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = {};
    this.notes = [];
    this.note = 60; this.target = 60; this.hasPlayed = false;
    // free-running oscillators: random starting points, never reset by notes
    this.ph1 = Math.random(); this.ph2 = Math.random(); this.ph3 = Math.random();
    this.drift = [0, 0, 0].map(() => ({ v: (Math.random() * 2 - 1) * DRIFT_CENTS, t: (Math.random() * 2 - 1) * DRIFT_CENTS }));
    this.drive = 0;     // how hard the mixer drives the filter (for the overload light)
    this.fenv = new Contour();
    this.aenv = new Contour();
    this.s = [0, 0, 0, 0];
    this.pink = [0, 0, 0];
    this.lastOut = 0;     // feedback source (the "headphone output")
    this.lastFc = 20000; this.lastMod = 0; this.blocks = 0;
    this.sm = null;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    switch (m.type) {
      case 'patch': Object.assign(this.p, m.patch); break;
      case 'param': this.p[m.id] = m.value; break;
      case 'noteOn': {
        const fresh = !this.notes.length;
        const i = this.notes.indexOf(m.note);
        if (i >= 0) this.notes.splice(i, 1);
        this.notes.push(m.note);
        this.target = m.note; // legato: the newest note takes the pitch
        if (!this.hasPlayed) { this.note = this.target; this.hasPlayed = true; }
        if (fresh) { this.fenv.gateOn(); this.aenv.gateOn(); } // contours restart only from silence
        break;
      }
      case 'noteOff': {
        const i = this.notes.indexOf(m.note);
        if (i >= 0) this.notes.splice(i, 1);
        if (this.notes.length) this.target = this.notes[this.notes.length - 1]; // back to the last key still held
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
    const mixOut = outputs[1];
    const M1 = mixOut && mixOut[0], M2 = mixOut && mixOut[1];
    const p = this.p;
    if (p['osc1.wave'] === undefined) return true;
    const sr = sampleRate;
    const n = L.length;

    // ---- per-block settings ----
    const rel = (d) => (on(p['perf.decay']) ? d : SHORT_RELEASE);
    this.fenv.setTimes(p['fenv.a'], p['fenv.d'], p['fenv.s'], rel(p['fenv.d']), sr);
    this.aenv.setTimes(p['aenv.a'], p['aenv.d'], p['aenv.s'], rel(p['aenv.d']), sr);
    const glideCoef = on(p['perf.glideon']) && p['ctrl.glide'] > 0.0005 ? 1 - Math.exp(-4.6 / (p['ctrl.glide'] * sr)) : 1;
    const w1 = p['osc1.wave'], w2 = p['osc2.wave'], w3 = p['osc3.wave'];
    const r1 = p['osc1.range'] * 12, r2 = p['osc2.range'] * 12 + p['osc2.freq'], r3 = p['osc3.range'] * 12 + p['osc3.freq'];
    const osc3Keyed = on(p['osc3.ctrl']);
    const lfo3 = !osc3Keyed && p['osc3.range'] === -7;
    const lfo3Hz = lfo3 ? lfoHz(p['osc3.freq']) : 0;
    const oscMod = on(p['osc.mod']), filtMod = on(p['filt.mod']);
    const track = (on(p['filt.kb1']) ? 1 / 3 : 0) + (on(p['filt.kb2']) ? 2 / 3 : 0);
    const pinkNoise = p['mix.noisetype'] === 'pink';
    // analogue drift: each oscillator wanders slowly towards a new random offset now and then
    const blockSecs = n / sr;
    this.drift.forEach((d) => {
      if (Math.random() < blockSecs / DRIFT_SECONDS) d.t = (Math.random() * 2 - 1) * DRIFT_CENTS;
      d.v += (d.t - d.v) * 0.004;
    });
    const dr1 = this.drift[0].v / 100, dr2 = this.drift[1].v / 100, dr3 = this.drift[2].v / 100;
    const tgt = {
      m1: p['mix.osc1'], m2: p['mix.osc2'], m3: p['mix.osc3'], mn: p['mix.noise'],
      fb: p['mix.feedback'] * FEEDBACK_GAIN,
      cut: Math.log2(p['filt.cutoff']), res: p['filt.res'], env: p['filt.env'],
      mm: p['ctrl.modmix'], wheel: p['perf.mod'] * p['perf.mod'], bend: p['perf.bend'],
      tune: p['ctrl.tune'] / 100,
    };
    let peak = 0;
    if (!this.sm) this.sm = { ...tgt };
    const sm = this.sm;
    const k = 0.0015;
    const s = this.s, pk = this.pink;
    const nyq = sr * 0.45;

    for (let i = 0; i < n; i++) {
      for (const key in tgt) sm[key] += (tgt[key] - sm[key]) * k;
      this.note += (this.target - this.note) * glideCoef;

      // Oscillator 3 first: it is also the modulation source.
      const bend = sm.bend * BEND_RANGE;
      const base3 = osc3Keyed ? this.note + bend : 60; // off the keyboard: a fixed pitch
      const f3 = lfo3 ? lfo3Hz : hz(base3 + sm.tune + r3 + dr3);
      const dt3 = Math.min(f3 / sr, 0.49);
      const o3 = oscSample(w3, this.ph3, dt3);
      this.ph3 += dt3; if (this.ph3 >= 1) this.ph3 -= 1;

      // noise (white, or pink via a three-pole filter)
      const white = Math.random() * 2 - 1;
      pk[0] = 0.99765 * pk[0] + white * 0.099046;
      pk[1] = 0.963 * pk[1] + white * 0.2965164;
      pk[2] = 0.57 * pk[2] + white * 1.0526913;
      const noise = pinkNoise ? (pk[0] + pk[1] + pk[2] + white * 0.1848) * 0.22 : white;

      // modulation source: Osc 3 <-> noise, scaled by the mod wheel
      const mod = ((1 - sm.mm) * o3 + sm.mm * noise) * sm.wheel;
      const pm = oscMod ? mod * MOD_PITCH : 0;

      const base = this.note + sm.tune + bend + pm;
      const f1 = hz(base + r1 + dr1), f2 = hz(base + r2 + dr2);
      const dt1 = Math.min(f1 / sr, 0.49), dt2 = Math.min(f2 / sr, 0.49);
      const o1 = oscSample(w1, this.ph1, dt1);
      const o2 = oscSample(w2, this.ph2, dt2);
      this.ph1 += dt1; if (this.ph1 >= 1) this.ph1 -= 1;
      this.ph2 += dt2; if (this.ph2 >= 1) this.ph2 -= 1;

      // mixer, including the output fed back in (Feedback)
      const fbk0 = Math.tanh(this.lastOut * sm.fb);
      const x = o1 * sm.m1 + o2 * sm.m2 + o3 * sm.m3 + noise * sm.mn + fbk0;
      const ax = x < 0 ? -x : x; if (ax > peak) peak = ax;
      if (M1) { M1[i] = o1 * sm.m1 * 0.45; M2[i] = o2 * sm.m2 * 0.45; }

      const fe = this.fenv.next();
      const ae = this.aenv.next();

      // filter: contour, keyboard tracking and modulation, in octaves
      let fc = Math.pow(2, sm.cut + sm.env * 7 * fe + track * (this.note - 60) / 12 + (filtMod ? mod * MOD_FILTER : 0));
      if (fc > nyq) fc = nyq; else if (fc < 8) fc = 8;

      const g = Math.tan(Math.PI * fc / sr);
      const G = g / (1 + g);
      const G2 = G * G, G4 = G2 * G2;
      const fbk = sm.res * 4.15;
      const sigma = (G2 * G * s[0] + G2 * s[1] + G * s[2] + s[3]) / (1 + g);
      const y4est = (G4 * x + sigma) / (1 + fbk * G4);
      let u = Math.tanh(x - fbk * y4est);
      for (let j = 0; j < 4; j++) {
        const v = (u - s[j]) * G;
        const y = v + s[j];
        s[j] = y + v;
        u = y;
      }
      const vca = u * (1 + fbk * 0.45) * ae;
      this.lastOut = vca;

      L[i] = Math.tanh(vca * OUTPUT_GAIN);
      if (i === n - 1) { this.lastFc = fc; this.lastMod = mod; }
    }

    for (let c = 1; c < out.length; c++) out[c].set(L);
    // only count drive while a note sounds (the mixer runs silently otherwise)
    this.drive = Math.max(this.aenv.stage !== 0 ? peak : 0, this.drive * 0.85);

    // live state for the visuals (same shape as the NF-1 engine reports)
    const dtB = n / sr;
    this.fenv.tOn += dtB; this.fenv.tOff += dtB;
    this.aenv.tOn += dtB; this.aenv.tOff += dtB;
    if (++this.blocks % 4 === 0) {
      const env = (e) => ({ s: e.stage, v: e.v, tOn: e.tOn, tOff: e.tOff });
      const kk = p['osc2.range'] - p['osc1.range'];
      const a = kk >= 0 ? this.ph1 * Math.pow(2, kk) : this.ph1;
      const b = kk >= 0 ? this.ph2 : this.ph2 * Math.pow(2, -kk);
      this.port.postMessage({
        type: 'state', gate: this.notes.length > 0, note: this.note, target: this.target, fc: this.lastFc,
        a: env(this.aenv), f: env(this.fenv), lfo: this.lastMod, lfoT: 0, beat: (((b - a) % 1) + 1) % 1, drive: this.drive,
      });
    }
    return true;
  }
}

registerProcessor('va3-processor', VA3Processor);
