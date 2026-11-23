// Green-phosphor oscilloscope and spectrum analyser, drawn on canvases.

const PHOSPHOR = '#8dffb0';
const GRID = 'rgba(120, 255, 170, 0.13)';
const GRID_AXIS = 'rgba(120, 255, 170, 0.26)';
export const TIMEBASES = [0.5, 1, 2, 5, 10, 20]; // ms per division

function label(ctx, text, x, y, color, align = 'left', size = 10, weight = 600) {
  ctx.font = `${weight} ${size}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  // getBoundingClientRect includes the CSS transform scale; use layout size instead
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, r };
}

function drawGraticule(ctx, w, h, cols, rows) {
  ctx.lineWidth = 1;
  for (let i = 0; i <= cols; i++) {
    const x = Math.round((i / cols) * w) + 0.5;
    ctx.strokeStyle = i === cols / 2 ? GRID_AXIS : GRID;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    const y = Math.round((j / rows) * h) + 0.5;
    ctx.strokeStyle = j === rows / 2 ? GRID_AXIS : GRID;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  // minor ticks on centre axes
  ctx.strokeStyle = GRID_AXIS;
  for (let i = 0; i <= cols * 5; i++) {
    const x = Math.round((i / (cols * 5)) * w) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, h / 2 - 3); ctx.lineTo(x, h / 2 + 3); ctx.stroke();
  }
  for (let j = 0; j <= rows * 5; j++) {
    const y = Math.round((j / (rows * 5)) * h) + 0.5;
    ctx.beginPath(); ctx.moveTo(w / 2 - 3, y); ctx.lineTo(w / 2 + 3, y); ctx.stroke();
  }
}

export class Scope {
  constructor(scopeCanvas, specCanvas, engine, getCutoff) {
    this.sc = scopeCanvas;
    this.spc = specCanvas;
    this.engine = engine;
    this.getCutoff = getCutoff;
    this.timebase = 2;
    this.frozen = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame(() => this.frame());
  }

  resize() {
    this.a = setupCanvas(this.sc);
    this.b = setupCanvas(this.spc);
  }

  frame() {
    requestAnimationFrame(() => this.frame());
    if (this.overlay) this.overlay.sample();
    if (this.frozen) return;
    this.drawScope();
    this.drawSpectrum();
  }

  drawScope() {
    const { ctx, w, h } = this.a;
    ctx.clearRect(0, 0, w, h);
    drawGraticule(ctx, w, h, 10, 8);
    const an = this.engine.scope;
    const mixAlpha = this.overlay && this.overlay.group === 'mix' ? this.overlay.alpha() : 0;
    if (!an || !this.engine.running) {
      if (mixAlpha) label(ctx, 'Play a note to see each oscillator', w / 2, h / 2 - 12, 'rgba(255,181,71,' + mixAlpha + ')', 'center', 12);
      return;
    }

    if (!this.buf || this.buf.length !== an.fftSize) this.buf = new Float32Array(an.fftSize);
    const buf = this.buf;
    an.getFloatTimeDomainData(buf);
    const sr = this.engine.ctx.sampleRate;
    const win = Math.min(buf.length - 1, Math.round((this.timebase * 10 / 1000) * sr));

    // Trigger: last rising zero crossing (with hysteresis) that leaves a full window after it.
    // Searching backwards from the newest data keeps the display current.
    let trig = -1;
    const hyst = 0.02;
    let armed = false;
    for (let i = buf.length - win - 1; i > 0; i--) {
      // walking backwards: a rising edge forwards is "above then below" backwards
      if (buf[i] >= 0 && buf[i - 1] < 0) {
        // confirm a real dip below -hyst shortly before it
        armed = false;
        const lim = Math.max(0, i - 2000);
        for (let j = i - 1; j >= lim; j--) { if (buf[j] < -hyst) { armed = true; break; } if (buf[j] > hyst) break; }
        if (armed) { trig = i; break; }
      }
    }
    const start = trig >= 0 ? trig : buf.length - win - 1;
    this.triggered = trig >= 0;

    // Vertical scale: ±0.5 fills the 4 divisions either side of centre. The engine's
    // output peaks around 0.45, so loud sounds fill the screen; louder still runs off
    // the edge, as on a real oscilloscope.
    const vScale = (h / 2) * 0.92 / 0.5;
    const step = Math.max(1, Math.floor(win / (w * 2)));
    const trace = (data, color, width, dash) => {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i <= win; i += step) {
        const x = (i / win) * w;
        const y = h / 2 - data(start + i) * vScale;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    // Mixer view: each oscillator (after its mixer level) and their sum, behind the output.
    if (mixAlpha && this.engine.osc1Scope) {
      if (!this.b1 || this.b1.length !== buf.length) { this.b1 = new Float32Array(buf.length); this.b2 = new Float32Array(buf.length); }
      this.engine.osc1Scope.getFloatTimeDomainData(this.b1);
      this.engine.osc2Scope.getFloatTimeDomainData(this.b2);
      const b1 = this.b1, b2 = this.b2;
      ctx.save();
      ctx.globalAlpha = mixAlpha;
      trace((i) => b1[i], 'rgba(255, 181, 71, 0.95)', 1.6);
      trace((i) => b2[i], 'rgba(120, 205, 255, 0.95)', 1.6);
      trace((i) => b1[i] + b2[i], 'rgba(255, 255, 255, 0.8)', 1.4, [5, 4]);
      const items = [['OSC 1', '#ffb547'], ['OSC 2', '#78cdff'], ['SUM INTO FILTER - -', '#ffffff'], ['OUTPUT', PHOSPHOR]];
      let x = 10;
      items.forEach(([t, c]) => { label(ctx, t, x, 16, c, 'left', 10, 800); ctx.font = '800 10px "Helvetica Neue", Arial, sans-serif'; x += ctx.measureText(t).width + 16; });
      ctx.restore();
    }

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PHOSPHOR;
    ctx.shadowColor = 'rgba(80,255,150,0.9)';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i <= win; i += step) {
      const x = (i / win) * w;
      const y = h / 2 - buf[start + i] * vScale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawSpectrum() {
    const { ctx, w, h } = this.b;
    ctx.clearRect(0, 0, w, h);
    const fMin = 20, fMax = 20000;
    const xFor = (f) => (Math.log(f / fMin) / Math.log(fMax / fMin)) * w;

    const overlayOn = !!(this.overlay && this.overlay.group);
    // graticule: decades and dB lines
    ctx.lineWidth = 1;
    ctx.font = '9px "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = 'rgba(140,255,180,0.45)';
    [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach((f) => {
      const x = Math.round(xFor(f)) + 0.5;
      const major = [100, 1000, 10000].includes(f);
      ctx.strokeStyle = major ? GRID_AXIS : GRID;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      if (f > 20 && f < 20000) ctx.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), x + 3, h - 4);
    });
    for (let db = -20; db > -100; db -= 20) {
      const y = Math.round((-db / 100) * h) + 0.5;
      ctx.strokeStyle = GRID;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      if (!overlayOn) ctx.fillText(db + ' dB', 3, y - 3); // overlay graphs have their own labels
    }

    // cutoff marker
    const fc = this.getCutoff();
    if (fc) {
      const x = xFor(Math.min(fMax, Math.max(fMin, fc)));
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(255, 196, 90, 0.75)';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(255, 196, 90, 0.85)';
      ctx.fillText('CUTOFF', Math.min(x + 4, w - 40), 12);
    }

    const an = this.engine.spectrum;
    if (an && this.engine.running) this.drawSpectrumTrace(ctx, w, h, an, fMin, fMax);
    if (this.overlay) this.overlay.draw(ctx, w, h, this.fbuf && an ? { fbuf: this.fbuf, binHz: this.engine.ctx.sampleRate / an.fftSize } : null);
  }

  drawSpectrumTrace(ctx, w, h, an, fMin, fMax) {
    if (!this.fbuf || this.fbuf.length !== an.frequencyBinCount) this.fbuf = new Float32Array(an.frequencyBinCount);
    const fb = this.fbuf;
    an.getFloatFrequencyData(fb);
    const binHz = this.engine.ctx.sampleRate / an.fftSize;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, h);
    // one point per pixel column, taking the loudest bin in that column
    for (let x = 0; x <= w; x++) {
      const f0 = fMin * Math.pow(fMax / fMin, x / w);
      const f1 = fMin * Math.pow(fMax / fMin, (x + 1) / w);
      let b0 = Math.floor(f0 / binHz), b1 = Math.max(b0 + 1, Math.ceil(f1 / binHz));
      let m = -Infinity;
      for (let b = b0; b < b1 && b < fb.length; b++) if (fb[b] > m) m = fb[b];
      const db = Math.max(-100, Math.min(0, m));
      ctx.lineTo(x, (-db / 100) * h);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(120,255,170,0.35)');
    grad.addColorStop(1, 'rgba(120,255,170,0.03)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = PHOSPHOR;
    ctx.shadowColor = 'rgba(80,255,150,0.8)';
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }
}
