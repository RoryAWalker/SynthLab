// NF-4 console: four channels, two aux buses, a reverb, a bus compressor and the main mix.
// Plays a four-track song (one stem per channel) and reports the level at every stage, so the
// screens can show the signal flowing through.
//
// Each channel, in order (the same order as the strip, top to bottom):
//   input (mic or line level) -> preamp gain (+ the console's own hiss, clipping if driven too hard)
//   -> polarity -> high-pass filter -> EQ (low shelf, mid peak, high shelf)
//   -> [Aux 1 send, pre-fader] -> mute -> fader -> [Aux 2 send, post-fader] -> pan -> main L/R
//   Solo (PFL) listens to the channel before its fader.
// Master: Aux 2 feeds the reverb, whose return joins the main mix; main mix -> bus compressor
//   -> main fader -> main out. The monitor (what you hear) is Main, Aux 1 or Aux 2, or Solo.

import { faderDb, sendDb, preampDb, biquad, EQ_LOW, EQ_HIGH, EQ_MID_Q } from '../consoleMath.js';

const dbToLin = (db) => Math.pow(10, db / 20);
const linToDb = (x) => (x > 1e-7 ? 20 * Math.log10(x) : -140);
const sendGain = (v) => dbToLin(sendDb(v)); // (off -> 0)
const coefs = (type, f, q, g) => biquad(type, f, q, g, sampleRate);

class Biquad {
  constructor() { this.c = [1, 0, 0, 0, 0]; this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  run(x) {
    const c = this.c;
    const y = c[0] * x + c[1] * this.x1 + c[2] * this.x2 - c[3] * this.y1 - c[4] * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// the preamp's ceiling: clean up to -3 dBFS, then rounding off into distortion
function clip(x) {
  const a = Math.abs(x);
  if (a < 0.7) return x;
  return Math.sign(x) * (0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
}

// ---- a small plate-style reverb (Schroeder/Freeverb: parallel combs, then allpasses) ----
class Reverb {
  constructor() {
    const k = sampleRate / 44100;
    const mk = (n) => ({ buf: new Float32Array(Math.round(n * k)), i: 0, lp: 0 });
    this.combs = [[1116, 1188, 1277, 1356, 1422, 1491], [1139, 1211, 1300, 1379, 1445, 1514]].map((s) => s.map(mk));
    this.aps = [[556, 441, 341], [579, 464, 364]].map((s) => s.map(mk));
    this.time = 2;
  }
  setTime(t) {
    if (t === this.time && this.fb) return;
    this.time = t;
    this.fb = this.combs.map((side) => side.map((c) => Math.pow(10, -3 * (c.buf.length / sampleRate) / t)));
  }
  run(x, out) {
    for (let s = 0; s < 2; s++) {
      let acc = 0;
      this.combs[s].forEach((c, j) => {
        const y = c.buf[c.i];
        c.lp = y * 0.7 + c.lp * 0.3; // a little damping: highs die away first
        c.buf[c.i] = x + c.lp * this.fb[s][j];
        if (++c.i >= c.buf.length) c.i = 0;
        acc += y;
      });
      acc *= 0.05; // comes back at about the level it was sent
      this.aps[s].forEach((a) => {
        const b = a.buf[a.i];
        const y = -acc + b;
        a.buf[a.i] = acc + b * 0.5;
        if (++a.i >= a.buf.length) a.i = 0;
        acc = y;
      });
      out[s] = acc;
    }
  }
}

// which channels hold condenser microphones (silent without 48 V phantom power)
const CONDENSER = [true, false, false, true];

class ConsoleProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = {};
    this.song = null; // four Float32Arrays, already at the level each source really arrives at
    this.pos = 0;
    this.playGain = 0;
    this.ch = [0, 1, 2, 3].map(() => ({ hp: new Biquad(), lo: new Biquad(), mid: new Biquad(), hi: new Biquad(), key: '' }));
    this.rev = new Reverb();
    this.rev.setTime(2);
    this.revOut = [0, 0];
    this.gr = 0; this.peak = 0;
    this.seed = 12345;
    this.blocks = 0;
    this.resetMeters();
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'patch') Object.assign(this.p, m.patch);
      else if (m.type === 'param') {
        if (m.id === 'tape.play' && m.value === 'play' && this.p['tape.play'] !== 'play') this.pos = 0;
        this.p[m.id] = m.value;
      } else if (m.type === 'source') { this.song = m.chans; this.pos = 0; }
    };
  }

  resetMeters() {
    // per channel: in (as it arrives), pre (after the preamp), eq (after HPF/EQ: the pre-fader
    // signal), post (after mute and fader), l / r (after pan); and a clip flag
    this.m = { ch: [0, 1, 2, 3].map(() => ({ in: 0, pre: 0, eq: 0, post: 0, l: 0, r: 0, clip: 0, sq: 0 })),
      aux1: 0, aux2: 0, ret: 0, bus: 0, mainL: 0, mainR: 0, mon: 0, gr: 0, solo: 0,
      // sums of squares, for the VU meters' average level
      sq: { aux1: 0, aux2: 0, ret: 0, mainL: 0, mainR: 0, solo: 0 }, n: 0 };
  }

  noise() { // fast white noise, -1..1
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 2147483648 - 1;
  }

  updateFilters(c, n) {
    const p = this.p, k = `ch${n}.`;
    const key = [p[k + 'hpf'], p[k + 'lf'], p[k + 'mf'], p[k + 'mg'], p[k + 'hf']].join();
    if (key === c.key) return;
    c.key = key;
    c.hpOn = p[k + 'hpf'] > 25;
    c.hp.c = coefs('hp', p[k + 'hpf'] || 20, 0.707, 0);
    c.lo.c = coefs('low', EQ_LOW, 0.707, p[k + 'lf'] || 0);
    c.mid.c = coefs('peak', p[k + 'mf'] || 1000, EQ_MID_Q, p[k + 'mg'] || 0);
    c.hi.c = coefs('high', EQ_HIGH, 0.707, p[k + 'hf'] || 0);
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    const n = L.length;
    const p = this.p;
    const song = this.song;
    const playing = p['tape.play'] === 'play' && !!song;
    const fade = 1 / (0.006 * sampleRate);
    const NOISE = dbToLin(-80); // the console's own hiss, after the preamp

    // per-channel settings for this block
    const chs = this.ch.map((c, i) => {
      const k = `ch${i + 1}.`;
      this.updateFilters(c, i + 1);
      const mic = p[k + 'in'] !== 'line';
      const live = !(mic && CONDENSER[i] && p[k + 'p48'] !== 'on'); // a condenser mic needs phantom power
      const th = ((p[k + 'pan'] ?? 0) + 1) * Math.PI / 4;
      return {
        c, live, mute: p[k + 'mute'] === 'on', solo: p[k + 'solo'] === 'on', main: p[k + 'main'] !== 'off', eq: p[k + 'eq'] !== 'off',
        gain: dbToLin(preampDb(p[k + 'gain'] ?? 0.5, mic)) * (p[k + 'pol'] === 'on' ? -1 : 1),
        fader: dbToLin(faderDb(p[k + 'fader'] ?? 0.75)), a1: sendGain(p[k + 'aux1'] ?? 0), a2: sendGain(p[k + 'aux2'] ?? 0),
        pl: Math.cos(th), pr: Math.sin(th),
      };
    });
    const anySolo = chs.some((c) => c.solo);
    const a1m = sendGain(p['aux1.master'] ?? 0.89), a2m = sendGain(p['aux2.master'] ?? 0.89), ret = sendGain(p['rev.ret'] ?? 0.89);
    this.rev.setTime(p['rev.time'] ?? 2);
    // bus compressor
    const T = p['bc.thresh'] ?? -10, ratio = p['bc.ratio'] ?? 2, W = 6;
    const atk = Math.exp(-1 / (Math.max(0.05, p['bc.attack'] ?? 10) * 0.001 * sampleRate));
    const rel = Math.exp(-1 / (Math.max(1, p['bc.release'] ?? 300) * 0.001 * sampleRate));
    const peakFall = Math.exp(-1 / (0.02 * sampleRate));
    const bcOn = p['bc.on'] === 'on', makeup = dbToLin(p['bc.makeup'] ?? 0), slope = 1 / ratio - 1;
    const mainF = dbToLin(faderDb(p['main.fader'] ?? 0.75));
    const mon = p['mon.src'] || 'main', vol = p['mon.vol'] ?? 0.7;
    const m = this.m;

    for (let i = 0; i < n; i++) {
      this.playGain = playing ? Math.min(1, this.playGain + fade) : Math.max(0, this.playGain - fade);
      let mainL = 0, mainR = 0, aux1 = 0, aux2 = 0, solo = 0;
      for (let k = 0; k < 4; k++) {
        const s = chs[k], c = s.c, mc = m.ch[k];
        let x = song && s.live ? song[k][this.pos] * this.playGain : 0;
        if (Math.abs(x) > mc.in) mc.in = Math.abs(x);
        // preamp: gain, then the console's own hiss, then the ceiling
        let y = clip(x * s.gain + this.noise() * NOISE);
        const ay = Math.abs(y);
        if (ay > mc.pre) mc.pre = ay;
        if (ay > 0.97) mc.clip = 1;
        if (c.hpOn) y = c.hp.run(y);
        if (s.eq) y = c.hi.run(c.mid.run(c.lo.run(y)));
        if (Math.abs(y) > mc.eq) mc.eq = Math.abs(y);
        mc.sq += y * y;
        if (s.solo) solo += y;
        const on = s.mute ? 0 : 1;
        aux1 += y * s.a1 * on; // pre-fader: the fader does not change it
        const post = y * s.fader * on;
        if (Math.abs(post) > mc.post) mc.post = Math.abs(post);
        aux2 += post * s.a2; // post-fader: follows the fader
        const l = post * s.pl, r = post * s.pr;
        if (Math.abs(l) > mc.l) mc.l = Math.abs(l);
        if (Math.abs(r) > mc.r) mc.r = Math.abs(r);
        if (s.main) { mainL += l; mainR += r; }
      }
      if (song && (playing || this.playGain > 0)) { if (++this.pos >= song[0].length) this.pos = 0; }

      // aux buses
      const a1 = aux1 * a1m, a2 = aux2 * a2m;
      this.rev.run(a2, this.revOut);
      const rl = this.revOut[0] * ret, rr = this.revOut[1] * ret;
      mainL += rl; mainR += rr;
      m.n++;
      const sq = m.sq;
      sq.aux1 += a1 * a1; sq.aux2 += a2 * a2; sq.ret += Math.max(rl * rl, rr * rr);
      const sl = solo; // the PFL bus, as heard and metered: the channel at its own level
      sq.solo += sl * sl;
      if (Math.abs(sl) > m.solo) m.solo = Math.abs(sl);
      if (Math.abs(a1) > m.aux1) m.aux1 = Math.abs(a1);
      if (Math.abs(a2) > m.aux2) m.aux2 = Math.abs(a2);
      if (Math.max(Math.abs(rl), Math.abs(rr)) > m.ret) m.ret = Math.max(Math.abs(rl), Math.abs(rr));
      const bus = Math.max(Math.abs(mainL), Math.abs(mainR));
      if (bus > m.bus) m.bus = bus;

      // bus compressor (both sides linked), as on the NF-C1
      this.peak = bus > this.peak ? bus : this.peak * peakFall;
      const xd = linToDb(this.peak), over = xd - T;
      let yd;
      if (2 * over < -W) yd = xd;
      else if (2 * Math.abs(over) <= W) yd = xd + slope * (over + W / 2) * (over + W / 2) / (2 * W);
      else yd = T + over / ratio;
      const target = xd - yd;
      const cf = target > this.gr ? atk : rel;
      this.gr = cf * this.gr + (1 - cf) * target;
      if (this.gr > m.gr) m.gr = this.gr;
      const g = bcOn ? dbToLin(-this.gr) * makeup : 1;
      const oL = mainL * g * mainF, oR = mainR * g * mainF;
      if (Math.abs(oL) > m.mainL) m.mainL = Math.abs(oL);
      if (Math.abs(oR) > m.mainR) m.mainR = Math.abs(oR);
      sq.mainL += oL * oL; sq.mainR += oR * oR;

      // the monitor: solo overrides everything while any channel is soloed
      let ml, mr;
      if (anySolo) ml = mr = solo;
      else if (mon === 'aux1') ml = mr = a1;
      else if (mon === 'aux2') ml = mr = a2;
      else { ml = oL; mr = oR; }
      if (Math.abs(ml) > m.mon) m.mon = Math.abs(ml);
      L[i] = Math.max(-1, Math.min(1, ml * vol));
      if (R !== L) R[i] = Math.max(-1, Math.min(1, mr * vol));
    }

    if (++this.blocks >= 8) {
      this.blocks = 0;
      const d = (v) => linToDb(v);
      const rms = (s) => linToDb(Math.sqrt(s / Math.max(1, m.n))); // average (RMS) level, dBFS
      this.port.postMessage({ type: 'state', console: true, playing, anySolo, gr: this.gr, pos: song ? this.pos / song[0].length : 0,
        ch: m.ch.map((c) => ({ in: d(c.in), pre: d(c.pre), eq: d(c.eq), post: d(c.post), l: d(c.l), r: d(c.r), clip: c.clip, rms: rms(c.sq) })),
        aux1: d(m.aux1), aux2: d(m.aux2), ret: d(m.ret), bus: d(m.bus), mainL: d(m.mainL), mainR: d(m.mainR), mon: d(m.mon), grMax: m.gr,
        solo: d(m.solo),
        rms: { aux1: rms(m.sq.aux1), aux2: rms(m.sq.aux2), ret: rms(m.sq.ret), mainL: rms(m.sq.mainL), mainR: rms(m.sq.mainR), solo: rms(m.sq.solo) } });
      this.resetMeters();
    }
    return true;
  }
}

registerProcessor('console-processor', ConsoleProcessor);
