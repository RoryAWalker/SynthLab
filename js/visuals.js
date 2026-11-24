// Teaching overlays drawn on top of the spectrum display, in amber so they read
// clearly against the green spectrum. One shows at a time, chosen by the control
// being adjusted (or whose hover help is open):
//   envelopes  -> the envelope shape, adjusted stage highlighted, live playhead dot
//   cutoff/res -> the filter's frequency response, moving with the live cutoff
//   LFO        -> the LFO wave over time with its delay fade-in, live dot
//   waveform   -> the harmonics that shape should contain, over the real spectrum
//   range      -> each oscillator's fundamental, and where every octave step puts it
//   glide      -> pitch over time, showing the slide between notes
//   mixer      -> (drawn on the oscilloscope by scope.js) each oscillator and their sum
//   detune     -> zoomed spectrum of the two close peaks; scope.js shows the slow beating

import { PARAMS, formatValue } from './params.js';

const AMBER = '#ffb547';
const AMBER_DIM = 'rgba(255, 181, 71, 0.55)';
const AMBER_FAINT = 'rgba(255, 181, 71, 0.18)';
const HI = '#fff0cf';
const FONT = '"Helvetica Neue", Arial, sans-serif';
const PAD = { l: 44, r: 16, t: 26, b: 26 };
const HOLD_MS = 2200; // how long a graph stays after the last knob movement
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (n) => NAMES[((Math.round(n) % 12) + 12) % 12] + (Math.floor(Math.round(n) / 12) - 1);
const noteHz = (n) => 440 * Math.pow(2, (n - 69) / 12);
const fmtHz = (f) => (f >= 1000 ? (f / 1000).toFixed(2) + ' kHz' : f.toFixed(f < 100 ? 1 : 0) + ' Hz');

// Theoretical harmonic amplitudes (relative to the fundamental) for each waveform.
const PULSE = { square: 0.5, pulse: 0.25, narrow: 0.1, wide: 0.3 };
function harmonicAmp(wave, n) {
  switch (wave) {
    case 'sine': return n === 1 ? 1 : 0;
    case 'saw': case 'revsaw': return 1 / n;
    case 'tri': return n % 2 ? 1 / (n * n) : 0;
    case 'shark': return Math.abs(0.5 / n + (n % 2 ? 0.5 * (8 / (Math.PI * Math.PI)) / (n * n) * (Math.PI / 2) : 0)) / (0.5 + 0.5 * 4 / Math.PI);
    default: { // square and pulses: |sin(pi n d)| / n, normalised to the fundamental
      const d = PULSE[wave];
      const a = Math.abs(Math.sin(Math.PI * n * d)) / (n * Math.sin(Math.PI * d));
      return a < 1e-6 ? 0 : a;
    }
  }
}
const WAVE_RECIPE = {
  sine: 'the fundamental only: no harmonics',
  tri: 'odd harmonics only (1, 3, 5…), fading fast (1/n²)',
  saw: 'every harmonic, each one 1/n as loud',
  square: 'odd harmonics only (1, 3, 5…), each 1/n as loud',
  pulse: 'every harmonic except every 4th',
  narrow: 'every harmonic except every 10th, fading slowly',
  wide: 'every harmonic, with gaps near every 3rd and 10th',
  shark: 'every harmonic, fading faster than a sawtooth',
  revsaw: 'every harmonic, each one 1/n as loud (a sawtooth reversed)',
};

export function overlayGroup(key) {
  const id = key.split('=')[0];
  if (/^osc[123]\.wave$/.test(id)) return 'harm';
  if (/^osc[123]\.range$/.test(id)) return 'range';
  if (id === 'ctrl.glide' || id === 'ctrl.mode') return 'glide';
  if (id === 'mix.osc1' || id === 'mix.osc2') return 'mix';
  if (id === 'osc2.fine') return 'detune';
  if (id.startsWith('aenv.')) return 'aenv';
  if (id.startsWith('fenv.') || id === 'filt.env') return 'fenv';
  if (id === 'filt.cutoff' || id === 'filt.res') return 'filter';
  if (id.startsWith('lfo.')) return 'lfo';
  return null;
}

// Envelope curves: the same maths as the audio engine (va-processor.js).
const attackAt = (t, A) => Math.min(1, 1.3 * (1 - Math.exp((-1.466 * t) / A)));
const decayAt = (t, D, S) => S + (1 - S) * Math.exp((-4.6 * t) / D);
const releaseAt = (t, R, v0) => v0 * Math.exp((-4.6 * t) / R);

function lfoShapeAt(shape, phase, cycle) {
  switch (shape) {
    case 'saw': return 2 * phase - 1;
    case 'square': return phase < 0.5 ? 1 : -1;
    case 'sh': { const x = Math.sin(cycle * 12.9898 + 4.1414) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }
    default: return 1 - 4 * Math.abs(phase - 0.5);
  }
}

function label(ctx, text, x, y, color, align = 'left', size = 10, weight = 600) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function dot(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(255, 220, 150, 1)';
  ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export class Overlay {
  constructor(getPatch, engine) {
    this.getPatch = getPatch;
    this.engine = engine;
    this.group = null;
    this.param = null;
    this.until = 0;
    this.held = false;
    this.option = null;   // option being previewed (hovering a waveform symbol)
    this.lastNote = 57;   // most recent note played (A3 until something is played)
    this.history = [];    // recent pitch samples for the glide graph
  }

  // Called every animation frame: remember recent pitch for the glide graph.
  sample() {
    const l = this.engine.live;
    if (!l) return;
    this.lastNote = l.note;
    const now = performance.now() / 1000;
    this.history.push({ t: now, n: l.note, tg: l.target, g: l.gate });
    while (this.history.length && this.history[0].t < now - 4) this.history.shift();
  }

  get scopeOnly() { return this.group === 'mix'; }

  // Show the graph for this control. hold: keep it until release() (hover help).
  activate(key, hold = false) {
    const g = overlayGroup(key);
    if (!g) { if (!hold) this.clear(); return; }
    const [id, opt] = key.split('=');
    this.group = g;
    this.param = id;
    this.option = opt === undefined ? null : opt;
    this.until = performance.now() + HOLD_MS;
    if (hold) this.held = true;
  }

  release() { this.held = false; this.until = Math.min(this.until, performance.now() + 500); }
  clear() { this.group = null; this.held = false; }

  alpha() {
    if (!this.group) return 0;
    const now = performance.now();
    // stay up while the knob is held down or its help is open
    if (this.held || document.body.classList.contains('knob-dragging')) this.until = Math.max(this.until, now + 800);
    const a = Math.min(1, (this.until - now) / 400);
    if (a <= 0) { this.group = null; return 0; }
    return a;
  }

  draw(ctx, w, h, spectrum) {
    const a = this.alpha();
    if (!a || this.scopeOnly) return;
    ctx.save();
    ctx.globalAlpha = a;
    // darken the spectrum so the graph reads clearly (almost fully for the zoomed detune view,
    // whose frequency axis differs from the spectrum's)
    ctx.fillStyle = this.group === 'detune' ? 'rgba(3, 10, 6, 0.9)' : 'rgba(3, 10, 6, 0.45)';
    ctx.fillRect(0, 0, w, h);
    const box = { x: PAD.l, y: PAD.t, w: w - PAD.l - PAD.r, h: h - PAD.t - PAD.b };
    if (this.group === 'aenv' || this.group === 'fenv') this.drawEnvelope(ctx, w, h, box);
    else if (this.group === 'filter') this.drawFilter(ctx, w, h, box);
    else if (this.group === 'lfo') this.drawLfo(ctx, w, h, box);
    else if (this.group === 'harm') this.drawHarmonics(ctx, w, h, spectrum);
    else if (this.group === 'range') this.drawRange(ctx, w, h, box);
    else if (this.group === 'glide') this.drawGlide(ctx, w, h, box);
    else if (this.group === 'detune') this.drawDetune(ctx, w, h);
    ctx.restore();
  }

  // ---- envelopes ---------------------------------------------------------------------
  drawEnvelope(ctx, w, h, box) {
    const p = this.getPatch();
    const loud = this.group === 'aenv';
    const pre = loud ? 'aenv.' : 'fenv.';
    // NiniFoog: both contours are ADS, and Release comes from the Decay switch
    const decaySwitch = p['perf.decay'];
    const adsFilter = !loud && p['fenv.s'] !== undefined;
    const A = p[pre + 'a'], D = p[pre + 'd'];
    const R = p[pre + 'r'] !== undefined ? p[pre + 'r'] : decaySwitch === 'on' ? D : 0.012;
    const S = loud ? p['aenv.s'] : adsFilter ? p['fenv.s'] : 0;
    const amt = loud ? 1 : p['filt.env'];
    const loudStyle = loud || adsFilter; // drawn with a sustain plateau
    const stage = this.param === 'filt.env' ? 'amt' : this.param.split('.')[1];

    // Horizontal layout: real (linear) time, but every stage keeps a visible minimum width.
    // The loudness envelope gets a fixed-width sustain plateau; the filter envelope has none,
    // and shows Release as a dashed branch from half-way through the decay.
    const minW = 16;
    let segs;
    if (loudStyle) {
      const holdW = box.w * 0.2;
      const avail = box.w - holdW;
      const T = A + D + R;
      let wa = Math.max(minW, (A / T) * avail), wd = Math.max(minW, (D / T) * avail), wr = Math.max(minW, (R / T) * avail);
      const k = avail / (wa + wd + wr); wa *= k; wd *= k; wr *= k;
      segs = { a: [box.x, wa], d: [box.x + wa, wd], s: [box.x + wa + wd, holdW], r: [box.x + wa + wd + holdW, wr] };
    } else {
      const T = Math.max(A + D, A + D / 2 + R);
      const px = (t) => (t / T) * box.w;
      const wa = Math.max(minW, px(A)), wd = Math.max(minW, px(D));
      const k = Math.min(1, box.w / (wa + wd));
      segs = { a: [box.x, wa * k], d: [box.x + wa * k, wd * k], r: [box.x + wa * k + (wd * k) / 2, Math.max(minW, px(R))] };
    }

    // Vertical: loudness 0..1 (bottom..top). Filter envelope is bipolar around the Cutoff setting.
    const yOf = loud
      ? (v) => box.y + (1 - v) * box.h
      : adsFilter
        ? (v) => box.y + (1 - v * Math.max(0.04, amt)) * box.h
        : (v) => box.y + box.h / 2 - v * amt * (box.h / 2);

    // axes
    ctx.lineWidth = 1;
    ctx.strokeStyle = AMBER_FAINT;
    if (loudStyle) {
      ctx.beginPath(); ctx.moveTo(box.x, yOf(0) + 0.5); ctx.lineTo(box.x + box.w, yOf(0) + 0.5); ctx.stroke();
      label(ctx, '100%', box.x - 6, yOf(1) + 4, AMBER_DIM, 'right', 9);
      label(ctx, '0', box.x - 6, yOf(0) + 3, AMBER_DIM, 'right', 9);
      if (S > 0.02 && S < 0.98) label(ctx, Math.round(S * 100) + '%', box.x - 6, yOf(S) + 3, stage === 's' ? HI : AMBER_DIM, 'right', 9);
    } else {
      const y0 = box.y + box.h / 2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(box.x, y0 + 0.5); ctx.lineTo(box.x + box.w, y0 + 0.5); ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, 'cutoff', box.x - 6, y0 + 3, AMBER_DIM, 'right', 9);
      label(ctx, '+7 oct', box.x - 6, box.y + 4, AMBER_DIM, 'right', 9);
      label(ctx, '−7 oct', box.x - 6, box.y + box.h, AMBER_DIM, 'right', 9);
    }

    // curve, one stage at a time so the adjusted stage can be highlighted
    const strokeStage = (name, fn, x0, wpx, dur, dashed) => {
      const hi = stage === name || stage === 'amt';
      ctx.save();
      ctx.strokeStyle = hi ? HI : AMBER;
      ctx.lineWidth = hi ? 3 : 2;
      if (hi) { ctx.shadowColor = 'rgba(255, 200, 110, 0.9)'; ctx.shadowBlur = 10; }
      if (dashed) ctx.setLineDash([5, 4]);
      ctx.beginPath();
      const steps = Math.max(8, Math.round(wpx / 2));
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const x = x0 + f * wpx, y = yOf(fn(f * dur));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };
    const [ax, aw] = segs.a, [dx, dw] = segs.d, [rx, rw] = segs.r;
    strokeStage('a', (t) => attackAt(t, A), ax, aw, A);
    strokeStage('d', (t) => decayAt(t, D, S), dx, dw, D);
    if (loudStyle) {
      const [sx, sw] = segs.s;
      strokeStage('s', () => S, sx, sw, 1);
      strokeStage('r', (t) => releaseAt(t, R, S), rx, rw, R);
    } else {
      const vMid = decayAt(D / 2, D, 0);
      strokeStage('r', (t) => releaseAt(t, R, vMid), rx, rw, R, true);
    }

    // stage labels along the bottom
    const names = loudStyle ? ['a', 'd', 's', 'r'] : ['a', 'd', 'r'];
    const letters = { a: 'A', d: 'D', s: 'S', r: 'R' };
    names.forEach((n) => {
      const [x0, wpx] = segs[n];
      let val = n === 's' ? Math.round(S * 100) + '%' : PARAMS[pre + n] ? formatValue(pre + n, p[pre + n]) : '';
      if (n === 'r' && PARAMS[pre + 'r'] === undefined) val = decaySwitch === 'on' ? '= Decay (switch on)' : 'short (Decay switch off)';
      const hi = stage === n;
      const text = (n === 'r' && !loudStyle ? 'R (if let go early) ' : letters[n] + ' ') + val;
      label(ctx, text, x0 + wpx / 2, h - 8, hi ? HI : AMBER_DIM, 'center', hi ? 11 : 10, hi ? 800 : 600);
    });

    // title
    let title = loud ? 'LOUDNESS ENVELOPE' : 'FILTER ENVELOPE';
    if (!loud) title += `   ·   ${PARAMS['filt.env'].label} ${formatValue('filt.env', amt)}`;
    label(ctx, title, box.x, 16, AMBER, 'left', 10.5, 800);

    // live playhead
    const live = this.engine.live;
    const env = live && (loud ? live.a : live.f);
    if (env && env.s !== 0) {
      let x;
      const t = env.tOn;
      if (env.s === 3 && loudStyle) x = rx + Math.min(1, env.tOff / R) * rw;
      else if (t <= A) x = ax + (t / A) * aw;
      else if (t <= A + D) x = dx + ((t - A) / D) * dw;
      else x = loudStyle ? segs.s[0] + Math.min(1, (t - A - D) / 2) * segs.s[1] : dx + dw;
      if (env.s === 3 && !loudStyle) x = Math.min(box.x + box.w, x);
      dot(ctx, x, yOf(env.v));
    }
  }

  // ---- filter response -------------------------------------------------------------------
  drawFilter(ctx, w, h, box) {
    const p = this.getPatch();
    const live = this.engine.live;
    const playing = live && live.gate && live.a.s !== 0;
    const fc = playing ? live.fc : p['filt.cutoff'];
    const k = p['filt.res'] * 4.15;
    const fMin = 20, fMax = 20000;
    const xOf = (f) => (Math.log(f / fMin) / Math.log(fMax / fMin)) * w;
    const DB_TOP = 24, DB_BOT = -60;
    const yOf = (db) => box.y + ((DB_TOP - Math.max(DB_BOT, Math.min(DB_TOP, db))) / (DB_TOP - DB_BOT)) * box.h;

    // |H| of a 4-pole ladder with feedback k (analogue prototype), with the engine's make-up gain
    const dbAt = (f) => {
      const x = f / fc;
      const p2r = 1 - x * x, p2i = 2 * x;            // (1 + jx)^2
      const p4r = p2r * p2r - p2i * p2i + k, p4i = 2 * p2r * p2i; // (1 + jx)^4 + k
      return 20 * Math.log10((1 + 0.45 * k) / Math.hypot(p4r, p4i));
    };

    // 0 dB reference
    ctx.strokeStyle = AMBER_FAINT;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(0, yOf(0) + 0.5); ctx.lineTo(w, yOf(0) + 0.5); ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, '0 dB', w - PAD.r, yOf(0) - 4, AMBER_DIM, 'right', 9);
    label(ctx, '−24 dB', w - PAD.r, yOf(-24) - 4, AMBER_DIM, 'right', 9);

    // curve + fill
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const f = fMin * Math.pow(fMax / fMin, x / w);
      const y = yOf(dbAt(f));
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.save();
    ctx.lineTo(w, box.y + box.h); ctx.lineTo(0, box.y + box.h); ctx.closePath();
    ctx.fillStyle = 'rgba(255, 181, 71, 0.12)';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const f = fMin * Math.pow(fMax / fMin, x / w);
      const y = yOf(dbAt(f));
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = HI;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(255, 200, 110, 0.9)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // cutoff point and resonance peak
    const cx = xOf(Math.min(fMax, Math.max(fMin, fc)));
    const peakDb = dbAt(fc);
    dot(ctx, cx, yOf(peakDb));
    const cutText = formatValue('filt.cutoff', Math.min(fMax, fc)) + (playing ? ' (live)' : '');
    const rightSide = cx < w - 120;
    label(ctx, cutText, cx + (rightSide ? 10 : -10), yOf(peakDb) - 10, HI, rightSide ? 'left' : 'right', 11, 800);
    if (p['filt.res'] > 0.05) {
      const peakText = peakDb >= DB_TOP ? `peak > +${DB_TOP} dB (self-oscillating)` : `peak ${peakDb >= 0 ? '+' : ''}${peakDb.toFixed(1)} dB`;
      label(ctx, peakText, cx + (rightSide ? 10 : -10), yOf(peakDb) + 6, AMBER, rightSide ? 'left' : 'right', 10, 600);
    }
    // slope annotation, one octave above the cutoff
    const fSlope = fc * 3;
    if (fSlope < fMax * 0.7) label(ctx, '−24 dB / octave', xOf(fSlope) + 6, yOf(dbAt(fSlope)) + 14, AMBER_DIM, 'left', 9.5);

    label(ctx, 'LOW PASS FILTER RESPONSE', PAD.l, 16, AMBER, 'left', 10.5, 800);
    label(ctx, 'passes', Math.max(PAD.l, cx / 2), yOf(0) - 8, AMBER_DIM, 'center', 9.5);
  }

  // ---- LFO ---------------------------------------------------------------------------------
  drawLfo(ctx, w, h, box) {
    const p = this.getPatch();
    const rate = p['lfo.rate'], shape = p['lfo.shape'], delay = p['lfo.delay'] || 0; // no Delay knob on the NF-Modular
    const live = this.engine.live;
    const span = Math.min(10, Math.max(1.5, delay + 1.5, 3 / rate)); // seconds across the graph
    const t0 = live && live.gate && live.lfoT > span * 0.85 ? live.lfoT - span * 0.85 : 0; // scroll once past the edge
    const xOf = (t) => box.x + ((t - t0) / span) * box.w;
    const mid = box.y + box.h / 2;
    const amp = box.h / 2 * 0.9;
    const fadeAt = (t) => (delay > 0.001 ? Math.min(1, t / delay) : 1);

    // centre line and time ticks
    ctx.strokeStyle = AMBER_FAINT;
    ctx.beginPath(); ctx.moveTo(box.x, mid + 0.5); ctx.lineTo(box.x + box.w, mid + 0.5); ctx.stroke();
    const step = span > 6 ? 2 : span > 2.5 ? 1 : span > 1 ? 0.5 : 0.25;
    for (let t = Math.ceil(t0 / step) * step; t <= t0 + span + 1e-6; t += step) {
      const x = xOf(t);
      ctx.beginPath(); ctx.moveTo(x + 0.5, box.y + box.h); ctx.lineTo(x + 0.5, box.y + box.h + 4); ctx.stroke();
      label(ctx, (Math.round(t * 100) / 100) + ' s', x, h - 8, AMBER_DIM, 'center', 9);
    }

    // delay: fade-in envelope and marker
    if (delay > 0.001) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = this.param === 'lfo.delay' ? HI : AMBER_DIM;
      ctx.lineWidth = this.param === 'lfo.delay' ? 2 : 1;
      [1, -1].forEach((sgn) => {
        ctx.beginPath();
        ctx.moveTo(xOf(Math.max(t0, 0)), mid - sgn * amp * fadeAt(Math.max(t0, 0)));
        if (delay > t0) ctx.lineTo(xOf(delay), mid - sgn * amp);
        ctx.lineTo(xOf(t0 + span), mid - sgn * amp);
        ctx.stroke();
      });
      ctx.restore();
      if (delay > t0) label(ctx, 'delay ' + formatValue('lfo.delay', delay), xOf(delay) + 5, box.y + 10, this.param === 'lfo.delay' ? HI : AMBER_DIM, 'left', 10, 700);
    }

    // the wave
    const hiWave = ['lfo.rate', 'lfo.shape'].includes(this.param);
    ctx.save();
    ctx.strokeStyle = hiWave ? HI : AMBER;
    ctx.lineWidth = hiWave ? 2.5 : 2;
    ctx.shadowColor = 'rgba(255, 200, 110, 0.8)';
    ctx.shadowBlur = hiWave ? 10 : 4;
    ctx.beginPath();
    const n = Math.round(box.w * 1.5);
    for (let i = 0; i <= n; i++) {
      const t = t0 + (i / n) * span;
      const cyc = t * rate;
      const v = lfoShapeAt(shape, cyc - Math.floor(cyc), Math.floor(cyc)) * fadeAt(t);
      const x = xOf(t), y = mid - v * amp;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // live dot
    if (live && live.gate) dot(ctx, xOf(live.lfoT), mid - live.lfo * amp);

    // title and destinations
    const shapeName = PARAMS['lfo.shape'].options.find((o) => o.v === shape).label;
    label(ctx, `LFO   ·   ${formatValue('lfo.rate', rate)}   ·   ${shapeName}`, box.x, 16, AMBER, 'left', 10.5, 800);
    // the NF-1's LFO depth knobs (the NF-Modular has none: its LFO goes wherever it is patched)
    const dests = [['lfo.pitch', 'Pitch ±'], ['lfo.filter', 'Filter ±'], ['lfo.amp', 'Amp ']].filter(([id]) => PARAMS[id]);
    let x = w - PAD.r;
    for (let i = dests.length - 1; i >= 0; i--) {
      const [id, pre] = dests[i];
      const hi = this.param === id;
      const text = pre + formatValue(id, p[id]);
      ctx.font = `${hi ? 800 : 600} ${hi ? 11 : 10}px ${FONT}`;
      label(ctx, text, x, 16, hi ? HI : AMBER_DIM, 'right', hi ? 11 : 10, hi ? 800 : 600);
      x -= ctx.measureText(text).width + 16;
    }
  }

  // ---- shared: an oscillator's fundamental at a given range ----------------------------
  oscHz(osc, range) {
    const p = this.getPatch();
    const r = range === undefined ? p[`osc${osc}.range`] : range;
    // NF-1: Detune in cents on Osc 2. NiniFoog: Frequency in semitones on Osc 2 and 3.
    const fine = (osc === 2 ? (p['osc2.fine'] || 0) / 100 : 0) + (p[`osc${osc}.freq`] || 0);
    return noteHz(this.lastNote + r * 12 + fine);
  }

  // ---- waveform harmonics -------------------------------------------------------------------
  drawHarmonics(ctx, w, h, spectrum) {
    const p = this.getPatch();
    const osc = Number(this.param[3]);
    const wave = this.option || p[`osc${osc}.wave`];
    const f0 = this.oscHz(osc);
    const fMin = 20, fMax = 20000;
    const xOf = (f) => (Math.log(f / fMin) / Math.log(fMax / fMin)) * w;
    const yOf = (db) => (-Math.max(-100, Math.min(0, db)) / 100) * h;

    // Line the fundamental up with the real spectrum when a note is sounding.
    let ref = -12;
    const live = this.engine.live;
    if (spectrum && live && live.gate && live.a.s !== 0) {
      const { fbuf, binHz } = spectrum;
      let m = -Infinity;
      for (let b = Math.floor((f0 * 0.94) / binHz); b <= Math.ceil((f0 * 1.06) / binHz) && b < fbuf.length; b++) m = Math.max(m, fbuf[b]);
      if (m > -90) ref = m;
    }

    ctx.save();
    ctx.lineWidth = 2;
    let last = null;
    for (let n = 1; n <= 80 && n * f0 < fMax; n++) {
      const f = n * f0;
      if (f < fMin) continue;
      const x = xOf(f);
      const a = harmonicAmp(wave, n);
      if (a === 0) {
        // a harmonic this shape does not contain
        ctx.strokeStyle = AMBER_DIM;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, h - 30, 3.5, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 2;
      } else {
        const y = yOf(ref + 20 * Math.log10(a));
        ctx.strokeStyle = n === 1 ? HI : AMBER;
        ctx.beginPath(); ctx.moveTo(x, h - 24); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = n === 1 ? HI : AMBER;
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
        if (last) { // dashed line joining the tops shows the slope
          ctx.save(); ctx.setLineDash([2, 3]); ctx.strokeStyle = AMBER_DIM; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
        }
        last = [x, y];
      }
      if (n <= 8 && (n === 1 || xOf(f) - xOf((n - 1) * f0) > 14)) label(ctx, String(n), x, h - 12, n === 1 ? HI : AMBER_DIM, 'center', 9.5, 700);
    }
    ctx.restore();

    const waveName = PARAMS[`osc${osc}.wave`].options.find((o) => o.v === wave).label.toUpperCase();
    label(ctx, `OSC ${osc} · ${waveName} · EXPECTED HARMONICS`, PAD.l, 16, AMBER, 'left', 10.5, 800);
    label(ctx, WAVE_RECIPE[wave], PAD.l, 30, HI, 'left', 10.5, 600);
    let note = `fundamental ${fmtHz(f0)} (${noteName(this.lastNote + p[`osc${osc}.range`] * 12)})`;
    if (p[`mix.osc${osc}`] < 0.01) note += ` · Osc ${osc} is turned down in the Mixer`;
    label(ctx, note, w - PAD.r, 16, AMBER_DIM, 'right', 10, 600);
    label(ctx, '○ = harmonic not present', w - PAD.r, 30, AMBER_DIM, 'right', 9.5, 600);
  }

  // ---- oscillator range -----------------------------------------------------------------------
  drawRange(ctx, w, h, box) {
    const p = this.getPatch();
    const osc = Number(this.param[3]);
    const other = osc === 1 ? 2 : 1;
    const cur = p[`osc${osc}.range`];
    const fMin = 20, fMax = 20000;
    const xOf = (f) => (Math.log(f / fMin) / Math.log(fMax / fMin)) * w;
    const baseY = box.y + box.h * 0.62;

    // the other oscillator, faint, for comparison (if it is audible)
    if (p[`mix.osc${other}`] > 0.01) {
      const fo = this.oscHz(other);
      ctx.save(); ctx.strokeStyle = 'rgba(140, 220, 255, 0.55)'; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(xOf(fo), box.y + 20); ctx.lineTo(xOf(fo), box.y + box.h); ctx.stroke(); ctx.restore();
      label(ctx, `Osc ${other}`, xOf(fo), box.y + box.h + 12, 'rgba(140, 220, 255, 0.8)', 'center', 9.5, 700);
    }

    // all five range positions
    const positions = [-2, -1, 0, 1, 2].map((r) => ({ r, f: this.oscHz(osc, r) }));
    positions.forEach(({ r, f }, i) => {
      const x = xOf(f);
      const on = r === cur;
      ctx.save();
      ctx.strokeStyle = on ? HI : AMBER_DIM;
      ctx.lineWidth = on ? 3 : 1;
      if (on) { ctx.shadowColor = 'rgba(255, 200, 110, 0.9)'; ctx.shadowBlur = 12; } else ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(x, on ? box.y + 22 : baseY - 30); ctx.lineTo(x, box.y + box.h); ctx.stroke();
      ctx.restore();
      label(ctx, (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r), x, baseY - 36, on ? HI : AMBER_DIM, 'center', on ? 13 : 11, 800);
      label(ctx, fmtHz(f), x, box.y + box.h - 4, on ? HI : AMBER_DIM, 'center', on ? 11 : 9.5, on ? 800 : 600);
      if (i > 0) { // "×2" between neighbours
        const xm = (x + xOf(positions[i - 1].f)) / 2;
        label(ctx, '×2', xm, baseY, AMBER_DIM, 'center', 10, 700);
      }
    });

    label(ctx, `OSC ${osc} RANGE   ·   each octave step doubles or halves the frequency`, PAD.l, 16, AMBER, 'left', 10.5, 800);
    const fc = this.oscHz(osc);
    label(ctx, `${noteName(this.lastNote + cur * 12)} = ${fmtHz(fc)}`, w - PAD.r, 16, HI, 'right', 11, 800);
  }

  // ---- glide ------------------------------------------------------------------------------------
  drawGlide(ctx, w, h, box) {
    const p = this.getPatch();
    const G = p['perf.glideon'] === 'off' ? 0 : p['ctrl.glide']; // NiniFoog: the Glide switch must be on
    const legato = p['ctrl.mode'] === 'legato';
    const glideOff = p['perf.glideon'] === 'off'; // NiniFoog: glide needs its switch
    const span = 3; // seconds across
    const now = performance.now() / 1000;
    const hist = this.history.filter((s) => s.t >= now - span);
    const played = hist.some((s) => s.g);
    let pts, tgt;
    if (played) {
      pts = hist.map((s) => ({ t: s.t - (now - span), n: s.n }));
      tgt = hist.map((s) => ({ t: s.t - (now - span), n: s.tg, g: s.g }));
    } else {
      // nothing played recently: an example slide from C4 up to G4 and back
      pts = []; tgt = [];
      for (let i = 0; i <= 300; i++) {
        const t = (i / 300) * span;
        const target = t < 0.5 ? 60 : t < 1.8 ? 67 : 60;
        const since = t < 0.5 ? t : t < 1.8 ? t - 0.5 : t - 1.8;
        const from = t < 0.5 ? 60 : t < 1.8 ? 60 : 67;
        const n = G > 0.0005 ? target + (from - target) * Math.exp((-4.6 * since) / G) : target;
        pts.push({ t, n }); tgt.push({ t, n: target, g: true });
      }
    }
    const all = pts.map((s) => s.n).concat(tgt.map((s) => s.n));
    let lo = Math.floor(Math.min(...all)) - 2, hi = Math.ceil(Math.max(...all)) + 2;
    if (hi - lo < 12) { const m = (hi + lo) / 2; lo = Math.floor(m - 6); hi = Math.ceil(m + 6); }
    const xOf = (t) => box.x + (t / span) * box.w;
    const yOf = (n) => box.y + ((hi - n) / (hi - lo)) * box.h;

    // note grid: label naturals sparsely
    const stepN = hi - lo > 24 ? 12 : hi - lo > 14 ? 5 : 2;
    for (let n = Math.ceil(lo); n <= hi; n++) {
      if ((n - Math.ceil(lo)) % stepN) continue;
      ctx.strokeStyle = AMBER_FAINT;
      ctx.beginPath(); ctx.moveTo(box.x, yOf(n) + 0.5); ctx.lineTo(box.x + box.w, yOf(n) + 0.5); ctx.stroke();
      label(ctx, noteName(n), box.x - 6, yOf(n) + 3, AMBER_DIM, 'right', 9);
    }

    // target notes (dashed steps) and actual pitch (solid)
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = AMBER_DIM;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    tgt.forEach((s, i) => { const x = xOf(s.t), y = yOf(s.n); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = HI;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(255, 200, 110, 0.9)';
    ctx.shadowBlur = 10;
    if (!played) ctx.globalAlpha *= 0.75;
    ctx.beginPath();
    pts.forEach((s, i) => { const x = xOf(s.t), y = yOf(s.n); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
    ctx.restore();
    if (played) { const s = pts[pts.length - 1]; if (hist[hist.length - 1].g) dot(ctx, xOf(s.t), yOf(s.n)); }

    const modeText = p['ctrl.mode'] === undefined ? 'legato: contours do not restart' : legato ? 'Legato: only overlapping notes slide' : 'Mono: every note slides';
    label(ctx, `GLIDE   ·   ${glideOff ? 'switch off' : G > 0.0005 ? formatValue('ctrl.glide', G) : 'off'}   ·   ${modeText}`, box.x, 16, AMBER, 'left', 10.5, 800);
    label(ctx, played ? 'pitch over the last 3 seconds  ·  dashed = notes played' : 'example: play notes to see your own slides  ·  dashed = notes played', w - PAD.r, h - 8, AMBER_DIM, 'right', 9.5, 600);
  }

  // ---- detune -------------------------------------------------------------------------------
  // Which frequencies beat against each other. With equal ranges it is the two fundamentals;
  // otherwise Osc 2 beats against the matching harmonic of the lower oscillator.
  detuneInfo() {
    const p = this.getPatch();
    const k = p['osc2.range'] - p['osc1.range'];
    const fa = this.oscHz(1) * Math.pow(2, Math.max(0, k));
    const fb = this.oscHz(2) * Math.pow(2, Math.max(0, -k));
    const nth = (m) => (m === 2 ? '2nd' : m + 'th');
    let what = 'Osc 1 and Osc 2';
    if (k > 0) what = `Osc 2 and Osc 1's ${nth(2 ** k)} harmonic`;
    if (k < 0) what = `Osc 1 and Osc 2's ${nth(2 ** -k)} harmonic`;
    return { fa, fb, df: Math.abs(fb - fa), what, m1: p['mix.osc1'], m2: p['mix.osc2'], k };
  }

  // Loudness of two summed waves of levels m1, m2 whose cycles are `phase` (0..1) apart,
  // relative to their maximum. This is the swell you hear as beating.
  static beatLevel(m1, m2, phase) {
    if (m1 + m2 < 1e-6) return 0;
    return Math.sqrt(Math.max(0, m1 * m1 + m2 * m2 + 2 * m1 * m2 * Math.cos(2 * Math.PI * phase))) / (m1 + m2);
  }

  drawDetune(ctx, w, h) {
    const d = this.detuneInfo();
    const half = Math.max(4, d.df * 3);
    const lo = d.fa - half, hi = d.fa + half;
    const xOf = (f) => ((f - lo) / (hi - lo)) * w;
    const base = h - 26, top = 46;

    // frequency grid
    ctx.strokeStyle = 'rgba(120, 255, 170, 0.12)';
    ctx.lineWidth = 1;
    const step = half > 30 ? 10 : half > 12 ? 5 : half > 5 ? 2 : 1;
    for (let f = Math.ceil(lo / step) * step; f <= hi; f += step) {
      const x = Math.round(xOf(f)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, top - 10); ctx.lineTo(x, base); ctx.stroke();
      label(ctx, String(f), x, h - 10, 'rgba(140, 255, 180, 0.45)', 'center', 9);
    }

    // the two peaks, heights by mixer level
    const peak = (f, level, color, name) => {
      const x = xOf(f), y = base - (base - top) * Math.max(0.04, level);
      ctx.save();
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i <= w; i++) {
        const fr = lo + (i / w) * (hi - lo);
        const g = Math.exp(-Math.pow((fr - f) / (half * 0.04), 2));
        const yy = base - (base - y) * g;
        if (i === 0) ctx.moveTo(i, yy); else ctx.lineTo(i, yy);
      }
      ctx.stroke();
      ctx.restore();
      label(ctx, name, x, y - 8, color, 'center', 10.5, 800);
      return { x, y };
    };
    const A = peak(d.fa, d.m1, AMBER, d.k > 0 ? `Osc 1 ×${2 ** d.k}` : 'Osc 1');
    const B = peak(d.fb, d.m2, '#78cdff', d.k < 0 ? `Osc 2 ×${2 ** -d.k}` : 'Osc 2');

    // the gap
    if (d.df > 0.005) {
      const y = Math.min(A.y, B.y) - 26;
      ctx.strokeStyle = HI; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(A.x, y); ctx.lineTo(B.x, y); ctx.stroke();
      [A.x, B.x].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke(); });
      label(ctx, `gap ${d.df.toFixed(2)} Hz`, (A.x + B.x) / 2, y - 7, HI, 'center', 11, 800);
    }

    label(ctx, 'DETUNE   ·   SPECTRUM ZOOMED IN', 12, 16, AMBER, 'left', 10.5, 800);
    let rate;
    if (d.df < 0.005) rate = 'same pitch: no beating';
    else if (d.df > 15) rate = `${d.df.toFixed(1)} per second: too fast to hear as beats, heard as roughness`;
    else rate = `beating ${d.df.toFixed(2)} times per second`;
    label(ctx, rate, w - 12, 16, HI, 'right', 11, 800);
    label(ctx, `${d.what}: ${fmtHz(d.fa)} and ${fmtHz(d.fb)}`, w - 12, 31, AMBER_DIM, 'right', 10, 600);
    if (d.m1 < 0.01 || d.m2 < 0.01) label(ctx, 'Turn up both oscillators in the Mixer to hear beating', w / 2, top + 6, HI, 'center', 11, 700);
  }
}
