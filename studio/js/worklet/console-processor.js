// NF-Mix4 console: four channels with insert points, two aux buses, a stereo FX Return, a one-knob
// bus compressor and the main mix; plus the outboard units patched into it with cables (a reverb
// and a mono compressor). Plays a four-track song (one stem per channel) and reports the level at
// every stage, so the screens and meters can show the signal flowing through.
//
// Each channel, in order (the same order as the strip, top to bottom):
//   input (mic or line level) -> preamp gain (+ the console's own hiss, clipping if driven too hard)
//   -> polarity -> high-pass filter -> EQ -> INSERT (out on Send; back in on Return, or straight
//   through when nothing is plugged into Return) -> [Aux 1 send, pre-fader] -> mute -> fader
//   -> [Aux 2 send, post-fader] -> pan -> main L/R. Solo (PFL) listens just before the fader.
// Master: aux buses -> their masters -> the Aux 1 / Aux 2 output sockets; FX Return (from its
//   socket) -> level -> main bus; main bus -> bus compressor (auto makeup) -> main fader -> out.
//   The monitor (what you hear) is Main, Aux 1 or Aux 2, or Solo.
//
// Patching: each input socket names the output plugged into it. Every sample, the parts are worked
// out in a fixed order (channels up to their insert sends, the outboard compressor, the rest of the
// channels, the aux buses, the reverb, the FX Return). An input reads its output's value from this
// sample if that part has already been worked out, or from the sample before if not (a feedback
// loop, say Aux 1 patched back into a channel that feeds Aux 1, goes round once a sample, and howls
// as it would on a real desk: the ear protection at the end keeps it bearable).

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
    this.damp = 0.3;
  }
  setTone(t) { this.damp = 0.6 - 0.55 * Math.max(0, Math.min(1, t)); } // dark (0) .. bright (1)
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
        c.lp = y * (1 - this.damp) + c.lp * this.damp; // damping: highs die away first (Tone)
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

// The outboard compressor: mono, peak-sensing like the NF-C1, a hard knee, fixed timing
class Compressor {
  constructor() { this.peak = 0; this.gr = 0; }
  run(x, T, ratio, gainLin, atk, rel, peakFall) {
    const a = Math.abs(x);
    this.peak = a > this.peak ? a : this.peak * peakFall;
    const over = linToDb(this.peak) - T;
    const target = over > 0 ? over * (1 - 1 / ratio) : 0;
    const c = target > this.gr ? atk : rel;
    this.gr = c * this.gr + (1 - c) * target;
    return x * dbToLin(-this.gr) * gainLin;
  }
}

// which channels hold condenser microphones (silent without 48 V phantom power)
const CONDENSER = [true, false, false, false]; // the drum overheads

// the outputs (sockets that send), in the order they are worked out each sample
const OUTS = ['ch1.send', 'ch2.send', 'ch3.send', 'ch4.send', 'oc.out', 'aux1.out', 'aux2.out', 'rev.out'];
const OUT_INDEX = Object.fromEntries(OUTS.map((o, i) => [o, i]));
// the bus compressor: fixed settings (one knob, Threshold), and auto makeup that listens (as on the NF-C1)
const BC_RATIO = 4, BC_KNEE = 6, BC_ATTACK = 10, BC_RELEASE = 200;
const autoGuess = (T) => Math.max(0, (-T / 2) * (1 - 1 / BC_RATIO));
// Ear protection, last of all and after the meters (as on the NF-C1): a loudness guard at -12 dBFS
// average, a ceiling at -1 dBFS, and a fuse against runaway maths. What reaches the speakers is
// 3 dB down (OUT_LEVEL), leaving headroom; the computer's own volume sets how loud you hear it.
const OUT_LEVEL = 0.7;
const GUARD_MS = Math.pow(10, -12 / 10);
const CEIL = Math.pow(10, -1 / 20);

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
    this.oc = new Compressor();
    this.outL = new Float64Array(OUTS.length); // each output's latest value (left / mono, and right)
    this.outR = new Float64Array(OUTS.length);
    this.gr = 0; this.peak = 0;
    this.msIn = 0; this.msComp = 0; this.autoDb = null; this.lastGuess = null; // bus comp auto makeup
    this.msOut = 0; this.guard = 1; this.lim = 1; // ear protection
    this.dcL = this.dcR = this.dcxL = this.dcxR = 0; // a DC blocker on the output (a runaway loop can latch)
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
    // per channel: in (as it arrives), pre (after the preamp), eq (after HPF/EQ), ins (after the
    // insert: what the rest of the strip gets), post (after mute and fader), l / r (after pan)
    this.m = { ch: [0, 1, 2, 3].map(() => ({ in: 0, pre: 0, eq: 0, ins: 0, post: 0, l: 0, r: 0, clip: 0, sq: 0 })),
      aux1: 0, aux2: 0, fx: 0, bus: 0, mainL: 0, mainR: 0, mon: 0, gr: 0, solo: 0, ocgr: 0, prot: 0,
      ins: { 'oc.in': 0, 'rev.in': 0, 'fxr.in': 0 }, // what reaches the outboard's inputs (their mini meters)
      outs: new Float64Array(OUTS.length),
      sq: { aux1: 0, aux2: 0, fx: 0, mainL: 0, mainR: 0, solo: 0 }, n: 0 };
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

  // which output an input socket is fed from (-1: nothing plugged in)
  src(id) { const v = this.p[id]; return v && OUT_INDEX[v] !== undefined ? OUT_INDEX[v] : -1; }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    const n = L.length;
    const p = this.p;
    const song = this.song;
    const playing = p['tape.play'] === 'play' && !!song;
    const fade = 1 / (0.006 * sampleRate);
    const NOISE = dbToLin(-80); // the console's own hiss, after the preamp
    const oL = this.outL, oR = this.outR;
    const mono = (i) => (i < 0 ? 0 : (oL[i] + oR[i]) * 0.5); // a stereo output into a mono input: both sides mixed

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
        pl: Math.cos(th), pr: Math.sin(th), ret: this.src(k + 'ret'), sendI: i,
      };
    });
    const anySolo = chs.some((c) => c.solo);
    const a1m = sendGain(p['aux1.master'] ?? 0.89), a2m = sendGain(p['aux2.master'] ?? 0.89), fxLevel = sendGain(p['fxr.level'] ?? 0.89);
    // patching
    const ocIn = this.src('oc.in'), revIn = this.src('rev.in'), fxIn = this.src('fxr.in');
    // the outboard compressor
    const ocT = p['oc.thresh'] ?? -20, ocRatio = p['oc.ratio'] ?? 4, ocGain = dbToLin(p['oc.gain'] ?? 0);
    const ocAtk = Math.exp(-1 / (0.010 * sampleRate)), ocRel = Math.exp(-1 / (0.150 * sampleRate));
    // the reverb
    this.rev.setTime(p['rev.time'] ?? 1.8);
    this.rev.setTone(p['rev.tone'] ?? 0.5);
    // the bus compressor
    const T = p['bc.thresh'] ?? 0, W = BC_KNEE, slope = 1 / BC_RATIO - 1;
    const atk = Math.exp(-1 / (BC_ATTACK * 0.001 * sampleRate));
    const rel = Math.exp(-1 / (BC_RELEASE * 0.001 * sampleRate));
    const peakFall = Math.exp(-1 / (0.02 * sampleRate));
    // auto makeup: jump by the rule of thumb when the threshold moves, then fine-tune by listening
    const guess = autoGuess(T);
    if (this.autoDb === null) this.autoDb = guess;
    else if (guess !== this.lastGuess && this.msComp > 0) {
      this.msComp *= Math.pow(10, -(guess - this.lastGuess) / 10);
      if (this.msIn > 1e-9 && this.msComp > 1e-14) this.autoDb = Math.min(18, Math.max(0, 10 * Math.log10(this.msIn / this.msComp)));
    }
    this.lastGuess = guess;
    const avg = 1 - Math.exp(-1 / (3 * sampleRate));
    const mainF = dbToLin(faderDb(p['main.fader'] ?? 0.75));
    const mon = p['mon.src'] || 'main';
    const outAvg = 1 - Math.exp(-1 / (0.3 * sampleRate)), guardDown = 1 - Math.exp(-1 / (0.03 * sampleRate)), guardUp = 1 - Math.exp(-1 / (1.5 * sampleRate)), limUp = 1 - Math.exp(-1 / (0.05 * sampleRate));
    const m = this.m, mo = m.outs;
    const pre = new Float64Array(4);

    for (let i = 0; i < n; i++) {
      this.playGain = playing ? Math.min(1, this.playGain + fade) : Math.max(0, this.playGain - fade);
      // 1. each channel up to its insert send
      for (let k = 0; k < 4; k++) {
        const s = chs[k], c = s.c, mc = m.ch[k];
        const x = song && s.live ? song[k][this.pos] * this.playGain : 0;
        if (Math.abs(x) > mc.in) mc.in = Math.abs(x);
        // preamp: gain, then the console's own hiss, then the ceiling
        let y = clip(x * s.gain + this.noise() * NOISE);
        const ay = Math.abs(y);
        if (ay > mc.pre) mc.pre = ay;
        if (ay > 0.97) mc.clip = 1;
        if (c.hpOn) y = c.hp.run(y);
        if (s.eq) y = c.hi.run(c.mid.run(c.lo.run(y)));
        if (Math.abs(y) > mc.eq) mc.eq = Math.abs(y);
        pre[k] = y;
        oL[k] = oR[k] = y; // the insert Send socket
      }
      if (song && (playing || this.playGain > 0)) { if (++this.pos >= song[0].length) this.pos = 0; }
      // 2. the outboard compressor
      { const x = ocIn < 0 ? 0 : mono(ocIn); if (Math.abs(x) > m.ins['oc.in']) m.ins['oc.in'] = Math.abs(x);
        const y = this.oc.run(x, ocT, ocRatio, ocGain, ocAtk, ocRel, peakFall); // (unpatched: it lets go)
        oL[4] = oR[4] = y; if (this.oc.gr > m.ocgr) m.ocgr = this.oc.gr; }
      // 3. the rest of each channel, from its insert return
      let mainL = 0, mainR = 0, aux1 = 0, aux2 = 0, solo = 0;
      for (let k = 0; k < 4; k++) {
        const s = chs[k], mc = m.ch[k];
        let y = s.ret < 0 ? pre[k] : mono(s.ret); // nothing in Return: straight through (normalled)
        y = Math.max(-4, Math.min(4, y)); // (the desk's own rails: a feedback loop cannot run away)
        if (Math.abs(y) > mc.ins) mc.ins = Math.abs(y);
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
      // 4. the aux buses and their output sockets
      const a1 = Math.max(-4, Math.min(4, aux1 * a1m)), a2 = Math.max(-4, Math.min(4, aux2 * a2m));
      oL[5] = oR[5] = a1; oL[6] = oR[6] = a2;
      // 5. the reverb (mono in, stereo out)
      { const x = revIn < 0 ? 0 : mono(revIn); if (Math.abs(x) > m.ins['rev.in']) m.ins['rev.in'] = Math.abs(x); this.rev.run(x, this.revOut); }
      oL[7] = this.revOut[0]; oR[7] = this.revOut[1];
      // 6. the FX Return (stereo; a mono output feeds both sides)
      let fl = 0, fr = 0;
      if (fxIn >= 0) { fl = oL[fxIn] * fxLevel; fr = oR[fxIn] * fxLevel; mainL += fl; mainR += fr;
        const v = Math.max(Math.abs(oL[fxIn]), Math.abs(oR[fxIn])); if (v > m.ins['fxr.in']) m.ins['fxr.in'] = v; }
      for (let o = 0; o < OUTS.length; o++) { const v = Math.max(Math.abs(oL[o]), Math.abs(oR[o])); if (v > mo[o]) mo[o] = v; }

      m.n++;
      const sq = m.sq;
      sq.aux1 += a1 * a1; sq.aux2 += a2 * a2; sq.fx += Math.max(fl * fl, fr * fr);
      sq.solo += solo * solo;
      if (Math.abs(solo) > m.solo) m.solo = Math.abs(solo);
      if (Math.abs(a1) > m.aux1) m.aux1 = Math.abs(a1);
      if (Math.abs(a2) > m.aux2) m.aux2 = Math.abs(a2);
      if (Math.max(Math.abs(fl), Math.abs(fr)) > m.fx) m.fx = Math.max(Math.abs(fl), Math.abs(fr));
      const bus = Math.max(Math.abs(mainL), Math.abs(mainR));
      if (bus > m.bus) m.bus = bus;

      // 7. the bus compressor (both sides linked), with auto makeup
      this.peak = bus > this.peak ? bus : this.peak * peakFall;
      const xd = linToDb(this.peak), over = xd - T;
      let yd;
      if (2 * over < -W) yd = xd;
      else if (2 * Math.abs(over) <= W) yd = xd + slope * (over + W / 2) * (over + W / 2) / (2 * W);
      else yd = T + over / BC_RATIO;
      const target = xd - yd;
      const cf = target > this.gr ? atk : rel;
      this.gr = cf * this.gr + (1 - cf) * target;
      if (this.gr > m.gr) m.gr = this.gr;
      const gGr = dbToLin(-this.gr);
      const pin = (mainL * mainL + mainR * mainR) * 0.5;
      if (pin > 1e-12) {
        this.msIn += avg * (pin - this.msIn);
        this.msComp += avg * (pin * gGr * gGr - this.msComp);
        if (this.msIn > 1e-9 && this.msComp > 1e-14) this.autoDb = Math.min(18, Math.max(0, 10 * Math.log10(this.msIn / this.msComp)));
      }
      const g = gGr * dbToLin(this.autoDb);
      const outL = mainL * g * mainF, outR = mainR * g * mainF;
      if (Math.abs(outL) > m.mainL) m.mainL = Math.abs(outL);
      if (Math.abs(outR) > m.mainR) m.mainR = Math.abs(outR);
      sq.mainL += outL * outL; sq.mainR += outR * outR;

      // 8. the monitor: solo overrides everything while any channel is soloed
      let ml, mr;
      if (anySolo) ml = mr = solo;
      else if (mon === 'aux1') ml = mr = a1;
      else if (mon === 'aux2') ml = mr = a2;
      else { ml = outL; mr = outR; }
      if (Math.abs(ml) > m.mon) m.mon = Math.abs(ml);
      // 9. ear protection: no DC (a feedback loop can latch at a steady offset), a loudness guard,
      // then the ceiling
      this.dcL = ml - this.dcxL + 0.9995 * this.dcL; this.dcxL = ml;
      this.dcR = mr - this.dcxR + 0.9995 * this.dcR; this.dcxR = mr;
      let sa = this.dcL * OUT_LEVEL, sb = this.dcR * OUT_LEVEL;
      this.msOut += outAvg * ((sa * sa + sb * sb) * 0.5 - this.msOut);
      const want = this.msOut > GUARD_MS ? Math.sqrt(GUARD_MS / this.msOut) : 1;
      this.guard += (want < this.guard ? guardDown : guardUp) * (want - this.guard);
      sa *= this.guard; sb *= this.guard;
      this.lim += limUp * (1 - this.lim);
      const pk = Math.max(Math.abs(sa), Math.abs(sb)) * this.lim;
      if (pk > CEIL) this.lim *= CEIL / pk;
      sa *= this.lim; sb *= this.lim;
      const prot = -linToDb(this.guard * this.lim);
      if (prot > m.prot) m.prot = prot;
      L[i] = sa;
      if (R !== L) R[i] = sb;
    }
    // the fuse: if anything has gone wrong in the maths, silence and start again
    if (!Number.isFinite(L[n - 1]) || !Number.isFinite(this.gr) || !Number.isFinite(this.msOut) || !Number.isFinite(this.oc.gr)) {
      L.fill(0); if (R !== L) R.fill(0);
      this.gr = 0; this.peak = 0; this.msIn = this.msComp = this.msOut = 0; this.autoDb = null; this.guard = this.lim = 1;
      this.oc = new Compressor(); this.rev = new Reverb(); this.rev.setTime(p['rev.time'] ?? 1.8);
      this.outL.fill(0); this.outR.fill(0);
      this.ch.forEach((c) => { c.key = ''; c.hp = new Biquad(); c.lo = new Biquad(); c.mid = new Biquad(); c.hi = new Biquad(); });
    }

    if (++this.blocks >= 8) {
      this.blocks = 0;
      const d = (v) => linToDb(v);
      const rms = (s) => linToDb(Math.sqrt(s / Math.max(1, m.n))); // average (RMS) level, dBFS
      const outs = {}; OUTS.forEach((o, i) => { outs[o] = Math.min(1, mo[i] * 4); }); // the sockets' lamps
      this.port.postMessage({ type: 'state', console: true, playing, anySolo, gr: this.gr, pos: song ? this.pos / song[0].length : 0,
        ch: m.ch.map((c) => ({ in: d(c.in), pre: d(c.pre), eq: d(c.eq), ins: d(c.ins), post: d(c.post), l: d(c.l), r: d(c.r), clip: c.clip, rms: rms(c.sq) })),
        aux1: d(m.aux1), aux2: d(m.aux2), fx: d(m.fx), bus: d(m.bus), mainL: d(m.mainL), mainR: d(m.mainR), mon: d(m.mon), grMax: m.gr,
        solo: d(m.solo), ocgr: this.oc.gr, ocgrMax: m.ocgr, makeup: this.autoDb, protect: m.prot, outs, outsDb: Object.fromEntries(OUTS.map((o, i) => [o, d(mo[i])])), insDb: Object.fromEntries(Object.entries(m.ins).map(([k, v]) => [k, d(v)])),
        rms: { aux1: rms(m.sq.aux1), aux2: rms(m.sq.aux2), fx: rms(m.sq.fx), mainL: rms(m.sq.mainL), mainR: rms(m.sq.mainR), solo: rms(m.sq.solo) } });
      this.resetMeters();
    }
    return true;
  }
}

registerProcessor('console-processor', ConsoleProcessor);
