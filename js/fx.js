// Effects shared by every synth: Chorus -> Delay -> Reverb, after the synth and before
// the speakers. The scopes are fed from the synth itself (before the effects), so the
// waveform and spectrum stay steady and readable.
// Controls are deliberately few: mostly "more or less".

import { fmtTime, fmtPct } from './synths/nf1.js';

export const FX_PARAMS = {
  'fx.chorus': { type: 'cont', label: 'Amount', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct, evens: true, small: true },
  // echo time 50-500 ms on a log curve; the default sits at 12 o'clock (about 160 ms)
  'fx.dtime':  { type: 'cont', label: 'Time', min: 0.05, max: 0.5, def: Math.sqrt(0.05 * 0.5), curve: 'log', fmt: fmtTime, unit: 'sec', small: true,
                 marks: [[0.05, '.05'], [0.1, '.1'], [0.2, '.2'], [0.5, '.5']] },
  'fx.delay':  { type: 'cont', label: 'Amount', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct, evens: true, small: true },
  // reverb length in seconds; log curve puts 1.5 s at 12 o'clock
  'fx.rsize':  { type: 'cont', label: 'Size', min: 0.75, max: 3, def: 1.5, curve: 'log', fmt: (v) => v.toFixed(1) + ' s', unit: 'sec', small: true,
                 marks: [[0.75, '.75'], [1.5, '1.5'], [3, '3']] },
  'fx.reverb': { type: 'cont', label: 'Amount', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct, evens: true, small: true },
};

export const FX_SECTIONS = [
  { id: 'chorus', title: 'Chorus', rows: [['fx.chorus']] },
  { id: 'delay', title: 'Delay', rows: [['fx.dtime', 'fx.delay']] },
  { id: 'reverb', title: 'Reverb', rows: [['fx.rsize', 'fx.reverb']] },
];

const T = 0.03; // smoothing time for control changes (seconds)
const DELAY_LP = 7000;  // Hz: tone of the echoes
const REVERB_LP = 7000; // Hz: tone of the reverb tail

export class FXChain {
  constructor(ctx) {
    this.ctx = ctx;
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.input = g();
    this.output = g();

    // ---- chorus: two short delays wobbled by slow LFOs, one per side, mixed with the dry sound
    const chorusOut = g();
    this.cDry = g(1); this.cWet = g(0);
    this.input.connect(this.cDry).connect(chorusOut);
    const merger = ctx.createChannelMerger(2);
    this.cDepth = [];
    [0.55, 0.8].forEach((rate, side) => {
      const d = ctx.createDelay(0.05);
      d.delayTime.value = 0.014 + side * 0.004;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const depth = g(0.002);
      lfo.connect(depth).connect(d.delayTime);
      lfo.start();
      this.input.connect(d).connect(merger, 0, side);
      this.cDepth.push(depth);
    });
    merger.connect(this.cWet).connect(chorusOut);

    // ---- delay: echoes with feedback; a low-pass in the loop makes each repeat a little darker
    const delayOut = g();
    this.dDry = g(1); this.dWet = g(0); this.dFb = g(0.25);
    this.dNode = ctx.createDelay(1);
    this.dNode.delayTime.value = FX_PARAMS['fx.dtime'].def;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = DELAY_LP; tone.Q.value = 0.5;
    this.dTone = tone;
    chorusOut.connect(this.dDry).connect(delayOut);
    chorusOut.connect(this.dNode);
    this.dNode.connect(tone).connect(this.dFb).connect(this.dNode);
    tone.connect(this.dWet).connect(delayOut);

    // ---- reverb: a convolution with a generated room-like impulse response, darkened by a
    // low-pass on the wet signal so the tail is warm rather than hissy
    this.rDry = g(1); this.rWet = g(0);
    this.conv = ctx.createConvolver();
    this.rTone = ctx.createBiquadFilter();
    this.rTone.type = 'lowpass'; this.rTone.frequency.value = REVERB_LP; this.rTone.Q.value = 0.5;
    delayOut.connect(this.rDry).connect(this.output);
    delayOut.connect(this.conv).connect(this.rTone).connect(this.rWet).connect(this.output);
    this.makeImpulse(FX_PARAMS['fx.rsize'].def);
  }

  // Exponentially decaying stereo noise: a simple, smooth-sounding artificial room.
  makeImpulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const pre = Math.floor(0.012 * ctx.sampleRate); // a short gap before the reflections start
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / ctx.sampleRate;
        d[i] = (Math.random() * 2 - 1) * Math.exp((-6.9 * t) / seconds) * 0.5;
      }
    }
    this.conv.buffer = buf;
  }

  set(id, v) {
    const now = this.ctx.currentTime;
    const to = (param, value) => param.setTargetAtTime(value, now, T);
    switch (id) {
      case 'fx.chorus':
        to(this.cWet.gain, v * 0.8);
        this.cDepth.forEach((d) => to(d.gain, 0.0012 + v * 0.0032));
        break;
      case 'fx.dtime': to(this.dNode.delayTime, v); break;
      case 'fx.delay':
        to(this.dWet.gain, v * 0.65);
        to(this.dFb.gain, 0.15 + v * 0.35); // more Amount: louder echoes that last a little longer
        break;
      case 'fx.rsize':
        clearTimeout(this.sizeTimer); // rebuilding the room is costly: wait until the knob settles
        this.sizeTimer = setTimeout(() => this.makeImpulse(v), 150);
        break;
      case 'fx.reverb':
        to(this.rWet.gain, v * 0.9);
        to(this.rDry.gain, 1 - v * 0.35);
        break;
    }
  }

  setAll(patch) { Object.keys(FX_PARAMS).forEach((id) => { if (patch[id] !== undefined) this.set(id, patch[id]); }); }
}
