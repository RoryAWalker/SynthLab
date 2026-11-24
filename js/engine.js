// Main-thread side of the audio engine: owns the AudioContext, the worklet node,
// the effects (chorus, delay, reverb) and the analysers (oscilloscope + spectrum).

import { FXChain } from './fx.js';

export class Engine {
  // module / processor: the synth's AudioWorklet file and processor name
  constructor({ module = 'js/worklet/va-processor.js', processor = 'va-processor' } = {}) {
    this.module = module;
    this.processor = processor;
    this.ctx = null;
    this.node = null;
    this.ready = false;
    this.pending = [];
    this.live = null; // latest envelope/LFO/cutoff state reported by the worklet
    this.fxValues = {}; // effect settings, applied once the audio starts
  }

  start(patch) {
    if (this.ctx) return this.ctx.resume();
    // guard against two key presses racing to create two contexts
    if (!this.starting) this.starting = this._create(patch);
    return this.starting;
  }

  async _create(patch) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule(this.module);
    this.node = new AudioWorkletNode(this.ctx, this.processor, { numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [2, 2] });

    this.scope = this.ctx.createAnalyser();
    this.scope.fftSize = 16384;
    this.scope.smoothingTimeConstant = 0;
    this.spectrum = this.ctx.createAnalyser();
    this.spectrum.fftSize = 8192;
    this.spectrum.smoothingTimeConstant = 0.7;
    this.spectrum.minDecibels = -100;
    this.spectrum.maxDecibels = 0;

    // Output 1 carries Osc 1 and Osc 2 (after the mixer) on separate channels, for the
    // oscilloscope's mixer view. Analysers are read without being heard.
    const split = this.ctx.createChannelSplitter(2);
    this.node.connect(split, 1);
    this.osc1Scope = this.ctx.createAnalyser();
    this.osc2Scope = this.ctx.createAnalyser();
    [this.osc1Scope, this.osc2Scope].forEach((a, i) => { a.fftSize = this.scope.fftSize; a.smoothingTimeConstant = 0; split.connect(a, i); });

    // the scopes see the synth itself; the speakers hear it through the effects
    this.node.connect(this.scope);
    this.node.connect(this.spectrum);
    this.fx = new FXChain(this.ctx);
    this.node.connect(this.fx.input);
    this.fx.output.connect(this.ctx.destination);
    this.fx.setAll({ ...patch, ...this.fxValues });

    this.node.port.onmessage = (ev) => {
      if (ev.data.type !== 'state') return;
      this.live = ev.data;
      if (ev.data.frames && this.onFrames) this.onFrames(ev.data); // the processors' level reports
    };
    this.node.port.postMessage({ type: 'patch', patch });
    this.ready = true;
    this.pending.forEach((m) => this.node.port.postMessage(m));
    this.pending = [];
  }

  async suspend() { if (this.ctx) { this.allOff(); await this.ctx.suspend(); } }

  get running() { return !!this.ctx && this.ctx.state === 'running'; }

  post(msg) {
    if (this.ready) this.node.port.postMessage(msg);
    else this.pending.push(msg);
  }

  setPatch(patch) {
    this.post({ type: 'patch', patch });
    Object.keys(patch).forEach((id) => { if (id.startsWith('fx.')) this.fxValues[id] = patch[id]; });
    if (this.fx) this.fx.setAll(patch);
  }
  setParam(id, value) {
    if (id.startsWith('fx.')) { // effects live here, not in the worklet
      this.fxValues[id] = value;
      if (this.fx) this.fx.set(id, value);
      return;
    }
    this.post({ type: 'param', id, value });
  }
  noteOn(note) { this.post({ type: 'noteOn', note }); }
  noteOff(note) { this.post({ type: 'noteOff', note }); }
  allOff() { this.post({ type: 'allOff' }); }
}
