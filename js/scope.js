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

function setupCanvas(canvas, pixelScale = 1) {
  // pixelScale: how much the stage is magnified on screen, so zoomed displays stay sharp
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * Math.min(3, Math.max(1, pixelScale));
  const r = canvas.getBoundingClientRect();
  // getBoundingClientRect includes the CSS transform scale; use layout size instead
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, r };
}

// Trigger: last rising zero crossing (with hysteresis) that leaves a full window after it.
// Searching backwards from the newest data keeps the display current. Returns -1 if none.
function findTrigger(buf, win) {
  const hyst = 0.02;
  for (let i = buf.length - win - 1; i > 0; i--) {
    // walking backwards: a rising edge forwards is "above then below" backwards
    if (buf[i] >= 0 && buf[i - 1] < 0) {
      // confirm a real dip below -hyst shortly before it
      const lim = Math.max(0, i - 2000);
      for (let j = i - 1; j >= lim; j--) { if (buf[j] < -hyst) return i; if (buf[j] > hyst) break; }
    }
  }
  return -1;
}

// Spectrum outline: one point per pixel column, taking the loudest bin in that column.
// In the low end a bin spans several columns, so there the curve is interpolated smoothly
// between bin centres (Catmull-Rom) instead of drawing flat steps.
function spectrumPath(ctx, fb, binHz, w, h, fMin, fMax) {
  const n = fb.length;
  const bin = (k) => Math.max(-120, fb[Math.min(n - 1, Math.max(0, k))]);
  for (let x = 0; x <= w; x++) {
    const f0 = fMin * Math.pow(fMax / fMin, x / w);
    const f1 = fMin * Math.pow(fMax / fMin, (x + 1) / w);
    let m;
    if (f1 - f0 < binHz) {
      const pos = f0 / binHz, i = Math.floor(pos), t = pos - i;
      const p0 = bin(i - 1), p1 = bin(i), p2 = bin(i + 1), p3 = bin(i + 2);
      m = p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    } else {
      const b0 = Math.floor(f0 / binHz), b1 = Math.max(b0 + 1, Math.ceil(f1 / binHz));
      m = -Infinity;
      for (let b = b0; b < b1 && b < n; b++) if (fb[b] > m) m = fb[b];
    }
    const db = Math.max(-100, Math.min(0, m));
    ctx.lineTo(x, (-db / 100) * h);
  }
}

const GHOST = 'rgba(255, 181, 71, 0.7)';

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
    this.a = setupCanvas(this.sc, this.pixelScale);
    this.b = setupCanvas(this.spc, this.pixelScale);
  }

  setPixelScale(s) {
    if (Math.abs((this.pixelScale || 1) - s) < 0.05) return;
    this.pixelScale = s;
    this.resize();
  }

  frame() {
    requestAnimationFrame(() => this.frame());
    if (this.overlay) this.overlay.sample();
    if (this.frozen) return;
    this.drawScope();
    this.drawSpectrum();
    // celebration fireworks drawn on top of both screens
    if (this.fx) {
      this.fx.a.forEach((f) => f.draw(this.a.ctx, this.a.w, this.a.h));
      this.fx.b.forEach((f) => f.draw(this.b.ctx, this.b.w, this.b.h));
    }
  }

  // Lesson target: keep a copy of what the scope and spectrum showed while the target
  // played, to draw as an amber ghost behind the player's own trace.
  captureTarget() {
    const an = this.engine.scope, sp = this.engine.spectrum;
    if (!an || !sp) return;
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    const fbuf = new Float32Array(sp.frequencyBinCount);
    sp.getFloatFrequencyData(fbuf);
    this.target = { buf, fbuf, binHz: this.engine.ctx.sampleRate / sp.fftSize };
  }
  clearTarget() { this.target = null; }

  drawScope() {
    const { ctx, w, h } = this.a;
    ctx.clearRect(0, 0, w, h);
    drawGraticule(ctx, w, h, 10, 8);
    if (this.overlay && this.overlay.group === 'detune') {
      const a = this.overlay.alpha();
      if (a) { this.drawBeating(ctx, w, h, a); return; }
    }
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

    const trig = findTrigger(buf, win);
    const start = trig >= 0 ? trig : buf.length - win - 1;
    this.triggered = trig >= 0;

    // Vertical scale: ±0.5 fills the 4 divisions either side of centre. The engine's
    // output peaks around 0.45, so loud sounds fill the screen; louder still runs off
    // the edge, as on a real oscilloscope.
    const vScale = (h / 2) * 0.92 / 0.5;
    const step = Math.max(1, Math.floor(win / (w * 2)));
    const trace = (data, color, width, dash, from = start) => {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i <= win; i += step) {
        const x = (i / win) * w;
        const y = h / 2 - data(from + i) * vScale;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    // Lesson target ghost, triggered the same way so matching waves line up.
    if (this.target && this.showTarget) {
      const tb = this.target.buf;
      const tt = findTrigger(tb, win);
      trace((i) => tb[i], GHOST, 2, [5, 3], tt >= 0 ? tt : tb.length - win - 1);
      label(ctx, 'TARGET - -', w - 10, 16, '#ffb547', 'right', 10, 800);
      label(ctx, 'YOU', w - 10, 30, PHOSPHOR, 'right', 10, 800);
    }

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

  // While Detune is being adjusted: zoom the timebase out to 2 seconds so the slow swell
  // of the two detuned waves is visible. The dense wave is drawn as a band whose height is
  // the combined loudness; the amber outline is the beating envelope.
  drawBeating(ctx, w, h, alpha) {
    const d = this.overlay.detuneInfo();
    const live = this.engine.live;
    const span = 2;
    const mid = h / 2, amp = h * 0.42;
    const level = (phase) => this.overlay.constructor.beatLevel(d.m1, d.m2, phase);
    // phase of the beat at the right-hand edge (now): from the engine when a note sounds
    const now = performance.now() / 1000;
    const phaseNow = live && live.gate ? live.beat : (now * d.df) % 1;
    const phaseAt = (secsAgo) => phaseNow - d.df * secsAgo;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(141, 255, 176, 0.35)';
    ctx.beginPath();
    for (let x = 0; x <= w; x++) ctx.lineTo(x, mid - level(phaseAt(span * (1 - x / w))) * amp);
    for (let x = w; x >= 0; x--) ctx.lineTo(x, mid + level(phaseAt(span * (1 - x / w))) * amp);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffb547';
    ctx.lineWidth = 2;
    [1, -1].forEach((sgn) => {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const y = mid - sgn * level(phaseAt(span * (1 - x / w))) * amp;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // beat markers at each loudness peak
    if (d.df > 0.25 && d.df < 15) {
      const per = 1 / d.df;
      const firstAgo = ((phaseNow % 1) + 1) % 1 / d.df; // seconds since the last peak
      let labelled = false;
      for (let ago = firstAgo; ago < span; ago += per) {
        const x = w * (1 - ago / span);
        ctx.fillStyle = '#ffb547';
        ctx.fillRect(x - 0.5, h - 16, 1, 10);
        const xPrev = w * (1 - (ago + per) / span);
        if (!labelled && xPrev > 0) {
          label(ctx, '1 beat = ' + (per < 1 ? Math.round(per * 1000) + ' ms' : per.toFixed(2) + ' s'), (x + xPrev) / 2, h - 6, '#ffb547', 'center', 10, 700);
          labelled = true;
        }
      }
    }
    label(ctx, 'SLOWED TO 2 s   ·   Osc 1 + Osc 2 swell and fade as they drift in and out of step', 10, 16, '#ffb547', 'left', 10, 800);
    if (d.m1 < 0.01 || d.m2 < 0.01) label(ctx, 'Turn up both oscillators in the Mixer to hear beating', w / 2, mid - 14, '#fff0cf', 'center', 12, 700);
    ctx.restore();
    this.triggered = false;
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
    if (this.target && this.showTarget) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, h);
      spectrumPath(ctx, this.target.fbuf, this.target.binHz, w, h, fMin, fMax);
      ctx.strokeStyle = GHOST;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.restore();
      label(ctx, 'TARGET - -', w - 10, 28, '#ffb547', 'right', 10, 800);
    }
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
    spectrumPath(ctx, fb, binHz, w, h, fMin, fMax);
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
