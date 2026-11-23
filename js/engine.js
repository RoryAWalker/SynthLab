// Main-thread side of the audio engine: owns the AudioContext, the worklet node
// and two analysers (oscilloscope + spectrum).

export class Engine {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.ready = false;
    this.pending = [];
    this.live = null; // latest envelope/LFO/cutoff state reported by the worklet
  }

  start(patch) {
    if (this.ctx) return this.ctx.resume();
    // guard against two key presses racing to create two contexts
    if (!this.starting) this.starting = this._create(patch);
    return this.starting;
  }

  async _create(patch) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule('js/worklet/va-processor.js');
    this.node = new AudioWorkletNode(this.ctx, 'va-processor', { numberOfInputs: 0, outputChannelCount: [2] });

    this.scope = this.ctx.createAnalyser();
    this.scope.fftSize = 16384;
    this.scope.smoothingTimeConstant = 0;
    this.spectrum = this.ctx.createAnalyser();
    this.spectrum.fftSize = 8192;
    this.spectrum.smoothingTimeConstant = 0.7;
    this.spectrum.minDecibels = -100;
    this.spectrum.maxDecibels = 0;

    this.node.connect(this.scope);
    this.node.connect(this.spectrum);
    this.node.connect(this.ctx.destination);

    this.node.port.onmessage = (ev) => { if (ev.data.type === 'state') this.live = ev.data; };
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

  setPatch(patch) { this.post({ type: 'patch', patch }); }
  setParam(id, value) { this.post({ type: 'param', id, value }); }
  noteOn(note) { this.post({ type: 'noteOn', note }); }
  noteOff(note) { this.post({ type: 'noteOff', note }); }
  allOff() { this.post({ type: 'allOff' }); }
}
