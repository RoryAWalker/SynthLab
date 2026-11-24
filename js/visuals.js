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

// Which graph a control gets, on every synth. p: the current patch (a few controls change
// graph with other settings, e.g. NiniFoog Osc 3 Frequency as an LFO).
export function overlayGroup(key, p = {}) {
  const id = key.split('=')[0];
  if (/^osc[123]\.wave$/.test(id)) return 'harm';
  if (/^osc[123]\.range$/.test(id) || id === 'ctrl.tune') return 'range';
  if (['ctrl.glide', 'ctrl.mode', 'kb.glide', 'kb.mode', 'perf.glideon'].includes(id)) return 'glide';
  if (id === 'mix.osc1' || id === 'mix.osc2') return 'mix';
  if (id === 'osc2.fine') return 'detune';
  // Tune / Frequency: a second oscillator against the first (detune view when very close)
  if (/^osc[123]\.(freq|tune)$/.test(id)) {
    if (id === 'osc3.freq' && p['osc3.range'] === -7 && p['osc3.ctrl'] === 'off') return 'osc3lfo';
    if (!PARAMS['osc2.range']) return 'range'; // one oscillator only (NF-MiniModular)
    const other = id[3] === '1' ? 2 : 1;
    const gap = Math.abs(semis(p, Number(id[3])) - semis(p, other));
    return gap < 0.6 ? 'detune' : 'interval';
  }
  if (/^osc[12]?\.?fm$/.test(id) || id === 'osc.fm') return 'fm';
  if (/^osc[12]\.(pw|pwm)$/.test(id)) return 'pw';
  if (id.startsWith('aenv.') || id.startsWith('env1.') || id.startsWith('env2.')) return 'aenv';
  if (id.startsWith('fenv.') || id === 'filt.env') return 'fenv';
  if (['filt.cutoff', 'filt.res', 'filt.cv', 'filt.kb1', 'filt.kb2'].includes(id)) return 'filter';
  if (id.startsWith('vcf.')) return 'vcf';
  if (id.startsWith('lfo.') || id.startsWith('lfo2.')) return 'lfo';
  if (id.startsWith('sh.')) return 'sh';
  if (id === 'noise.colour') return 'noise';
  if (/^mix\.(l[1-4]|mode)$/.test(id)) return 'shaper';
  if (id === 'ring.mix') return 'ring';
  if (id === 'vca.level' || /^vca[12]\.(level|cv)$/.test(id)) return 'vca';
  if (/^att\.a[12]$/.test(id)) return 'att';
  // NiniFoog: the modulation routing (what Osc 3 / noise do, and where the mod wheel sends them)
  if (['ctrl.modmix', 'osc.mod', 'filt.mod', 'perf.mod'].includes(id)) return 'modmix';
  if (id === 'osc3.ctrl') return p['osc3.range'] === -7 && p['osc3.ctrl'] === 'off' ? 'osc3lfo' : 'range';
  if (id === 'perf.decay') return 'aenv';
  if (id === 'mix.noise' || id === 'mix.noisetype') return 'noise';
  return null;
}

// An oscillator's pitch offset in semitones from its Range and its fine controls
function semis(p, osc) {
  return (p[`osc${osc}.range`] || 0) * 12 + (osc === 2 ? (p['osc2.fine'] || 0) / 100 : 0) + (p[`osc${osc}.freq`] || 0) + (p[`osc${osc}.tune`] || 0);
}

// a tidy grid step (1, 2 or 5 times a power of ten) near `raw`
function niceStep(raw) {
  const p10 = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p10;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p10;
}
// NiniFoog Osc 3 as an LFO: Frequency knob (-7..+7) -> 0.1..20 Hz (as in va3-processor.js)
const nf3LfoHz = (p) => 0.1 * Math.pow(200, ((p['osc3.freq'] || 0) + 7) / 14);
// musical names for intervals of up to an octave (semitones)
const INTERVALS = ['unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th', 'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th', 'octave'];
function intervalName(st) {
  const a = Math.abs(st), oct = Math.floor(a / 12), r = Math.round(a - oct * 12);
  const base = r === 0 && oct > 0 ? (oct === 1 ? 'octave' : `${oct} octaves`) : INTERVALS[r] + (oct ? ` + ${oct} octave${oct > 1 ? 's' : ''}` : '');
  const off = a - Math.round(a);
  return Math.abs(off) > 0.05 ? `${base} (${off > 0 ? '+' : '−'}${Math.round(Math.abs(off) * 100)} cents)` : base;
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
    case 'sine': return Math.sin(2 * Math.PI * (phase - 0.25));
    case 'revsaw': return 1 - 2 * phase;
    case 'wide': return phase < 0.3 ? 1 : -1;
    case 'narrow': return phase < 0.12 ? 1 : -1;
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
    const g = overlayGroup(key, this.getPatch());
    if (!g) { if (!hold) this.clear(); return; }
    const [id, opt] = key.split('=');
    this.group = g;
    this.param = id;
    this.oscN = /^osc([123])/.test(id) ? Number(id[3]) : 1; // the oscillator a control belongs to
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
    else if (this.group === 'interval') this.drawInterval(ctx, w, h, box);
    else if (this.group === 'vcf') this.drawVcf(ctx, w, h, box);
    else if (this.group === 'pw') this.drawPulseWidth(ctx, w, h, spectrum);
    else if (this.group === 'fm') this.drawFm(ctx, w, h, box);
    else if (this.group === 'sh') this.drawSh(ctx, w, h, box);
    else if (this.group === 'noise') this.drawNoise(ctx, w, h, box);
    else if (this.group === 'shaper') this.drawShaper(ctx, w, h, box);
    else if (this.group === 'ring') this.drawRing(ctx, w, h, box);
    else if (this.group === 'vca' || this.group === 'att') this.drawTransfer(ctx, w, h, box);
    else if (this.group === 'osc3lfo' || this.group === 'modmix') this.drawLfo(ctx, w, h, box);
    ctx.restore();
  }

  // ---- envelopes ---------------------------------------------------------------------
  drawEnvelope(ctx, w, h, box) {
    const p = this.getPatch();
    const loud = this.group === 'aenv';
    // NF-Modular: ENV 1 / ENV 2 (env1.* / env2.*), reported live as a / f
    const envN = /^env([12])\./.exec(this.param);
    const pre = envN ? `env${envN[1]}.` : loud ? 'aenv.' : 'fenv.';
    // NiniFoog: both contours are ADS, and Release comes from the Decay switch
    const decaySwitch = p['perf.decay'];
    const adsFilter = !loud && p['fenv.s'] !== undefined;
    const A = p[pre + 'a'], D = p[pre + 'd'];
    const R = p[pre + 'r'] !== undefined ? p[pre + 'r'] : decaySwitch === 'on' ? D : 0.012;
    const S = loud ? p[pre + 's'] : adsFilter ? p['fenv.s'] : 0;
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
    // on the modular synths an envelope can go anywhere, so it is named for itself, not for loudness
    let title = envN ? `ENV ${envN[1]}   ·   the shape at its Out (Inv: upside down)`
      : loud && PARAMS['jack.env.gate'] ? 'ENV   ·   the shape at its Out'
      : loud ? 'LOUDNESS ENVELOPE' : 'FILTER ENVELOPE';
    if (!loud) title += `   ·   ${PARAMS['filt.env'].label} ${formatValue('filt.env', amt)}`;
    label(ctx, title, box.x, 16, AMBER, 'left', 10.5, 800);

    // live playhead
    const live = this.engine.live;
    const env = live && (envN && envN[1] === '2' ? live.f : loud ? live.a : live.f);
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

    // CV Amount (NF-MiniModular): how far an input of 1 moves the cutoff
    if (this.param === 'filt.cv' && Math.abs(p['filt.cv']) > 0.01) {
      const f2 = Math.min(fMax, Math.max(fMin, fc * Math.pow(2, p['filt.cv'] * 6)));
      this.sweepArrow(ctx, cx, xOf(f2), yOf(peakDb) + 26, `an input of 1 moves it ${p['filt.cv'] > 0 ? 'up' : 'down'} ${Math.abs(p['filt.cv'] * 6).toFixed(1)} octaves, to ${fmtHz(f2)}`);
    }
    // keyboard control (NiniFoog): the cutoff follows the notes played
    if (this.param === 'filt.kb1' || this.param === 'filt.kb2') {
      const track = (p['filt.kb1'] === 'on' ? 1 / 3 : 0) + (p['filt.kb2'] === 'on' ? 2 / 3 : 0);
      label(ctx, track ? `follows the keyboard: ${Math.round(track * 100)}% of an octave for each octave played` : 'keyboard control off: the cutoff stays put whatever note you play', w - PAD.r, 30, HI, 'right', 10.5, 700);
    }
    label(ctx, 'LOW PASS FILTER RESPONSE', PAD.l, 16, AMBER, 'left', 10.5, 800);
    label(ctx, 'passes', Math.max(PAD.l, cx / 2), yOf(0) - 8, AMBER_DIM, 'center', 9.5);
  }

  // ---- LFO ---------------------------------------------------------------------------------
  drawLfo(ctx, w, h, box) {
    const p = this.getPatch();
    // which wave: the LFO, the MFO (lfo2.*), or the NiniFoog's Osc 3 running as an LFO
    const mfo = this.param.startsWith('lfo2.');
    const osc3 = this.group === 'osc3lfo' || this.group === 'modmix';
    const pre = mfo ? 'lfo2.' : 'lfo.';
    const rate = osc3 ? nf3LfoHz(p) : p[pre + 'rate'];
    const shape = osc3 ? p['osc3.wave'] : p[pre + 'shape'];
    const delay = mfo || osc3 ? 0 : p['lfo.delay'] || 0; // no Delay knob on the modular synths
    const uni = mfo && p['lfo2.pol'] === 'uni';
    const noiseMix = this.group === 'modmix' ? p['ctrl.modmix'] : 0; // NiniFoog: Osc 3 <-> noise
    const live = mfo || osc3 ? null : this.engine.live;
    // seconds across: three cycles at least (a fast MFO shows a few milliseconds)
    const span = mfo || osc3 ? Math.min(10, Math.max(0.02, 3 / rate)) : Math.min(10, Math.max(1.5, delay + 1.5, 3 / rate));
    const t0 = live && live.gate && live.lfoT > span * 0.85 ? live.lfoT - span * 0.85 : 0; // scroll once past the edge
    const xOf = (t) => box.x + ((t - t0) / span) * box.w;
    const mid = box.y + box.h / 2;
    const amp = box.h / 2 * 0.9;
    const fadeAt = (t) => (delay > 0.001 ? Math.min(1, t / delay) : 1);

    // centre line and time ticks
    ctx.strokeStyle = AMBER_FAINT;
    ctx.beginPath(); ctx.moveTo(box.x, mid + 0.5); ctx.lineTo(box.x + box.w, mid + 0.5); ctx.stroke();
    const step = niceStep(span / 5);
    for (let t = Math.ceil(t0 / step) * step; t <= t0 + span + 1e-6; t += step) {
      const x = xOf(t);
      ctx.beginPath(); ctx.moveTo(x + 0.5, box.y + box.h); ctx.lineTo(x + 0.5, box.y + box.h + 4); ctx.stroke();
      label(ctx, t < 1 && step < 0.1 ? Math.round(t * 1000) + ' ms' : (Math.round(t * 100) / 100) + ' s', x, h - 8, AMBER_DIM, 'center', 9);
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
    const hiWave = [pre + 'rate', pre + 'shape', 'osc3.freq', 'osc3.wave', 'ctrl.modmix'].includes(this.param);
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
      let v = lfoShapeAt(shape, cyc - Math.floor(cyc), Math.floor(cyc)) * fadeAt(t);
      if (noiseMix) { const r = Math.sin(i * 12.9898) * 43758.5453; v = v * (1 - noiseMix) + noiseMix * ((r - Math.floor(r)) * 2 - 1); }
      if (uni) v = (v + 1) / 2;
      const x = xOf(t), y = mid - v * amp;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // live dot
    if (live && live.gate) dot(ctx, xOf(live.lfoT), mid - live.lfo * amp);

    // title and destinations
    const shapeSpec = PARAMS[osc3 ? 'osc3.wave' : pre + 'shape'];
    const shapeName = (shapeSpec.options.find((o) => o.v === shape) || { label: shape }).label;
    const rateText = rate < 1 ? rate.toFixed(2) + ' Hz' : rate < 20 ? rate.toFixed(1) + ' Hz' : Math.round(rate) + ' Hz';
    const name = mfo ? 'MFO' : osc3 ? 'OSC 3 AS AN LFO' : 'LFO';
    label(ctx, `${name}   ·   ${rateText}   ·   ${shapeName}${uni ? '   ·   Uni (0 to +1)' : ''}`, box.x, 16, AMBER, 'left', 10.5, 800);
    // what the control does to it
    let note = '';
    if (this.param === 'lfo.rcv' && p['lfo.rcv'] > 0.01) note = `Rate input: ±1 moves it between ${(rate / Math.pow(2, p['lfo.rcv'] * 4)).toFixed(2)} and ${(rate * Math.pow(2, p['lfo.rcv'] * 4)).toFixed(1)} Hz`;
    if (mfo && (this.param === 'lfo2.fm' || this.param === 'lfo2.fmmode') && p['lfo2.fm'] > 0.01) {
      const lo = rate * (1 - p['lfo2.fm'] * 4), hiR = rate * (1 + p['lfo2.fm'] * 4);
      note = `FM input ±1: from ${p['lfo2.fmmode'] === 'tz' ? lo.toFixed(1) + ' Hz (below 0 = backwards)' : Math.max(0, lo).toFixed(1) + ' Hz'} to ${hiR.toFixed(1)} Hz`;
    }
    if (mfo && rate > 20) note = note || 'above about 20 Hz you hear its speed as a buzz, not a wobble';
    if (this.group === 'modmix') {
      // the source, then where the mod wheel sends it (va3-processor: the wheel's position squared,
      // up to 12 semitones of pitch and 4 octaves of filter)
      const src = noiseMix < 0.02 ? 'all Osc 3' : noiseMix > 0.98 ? 'all noise (random)' : `${Math.round((1 - noiseMix) * 100)}% Osc 3, ${Math.round(noiseMix * 100)}% noise`;
      const wheel = (p['perf.mod'] || 0) ** 2;
      const to = [];
      if (p['osc.mod'] === 'on') to.push(`pitch ±${(wheel * 12).toFixed(1)} semitones`);
      if (p['filt.mod'] === 'on') to.push(`filter ±${(wheel * 4).toFixed(1)} octaves`);
      note = `modulation: ${src}   →   ${to.length ? to.join(', ') : 'nowhere yet: switch on Oscillator or Filter Modulation'}${to.length && wheel < 0.001 ? ' (push the mod wheel up)' : ''}`;
    }
    if (note) label(ctx, note, box.x, 31, HI, 'left', 10.5, 700);
    // the NF-1's LFO depth knobs (the modular synths have none: its LFO goes wherever it is patched)
    const dests = mfo || osc3 ? [] : [['lfo.pitch', 'Pitch ±'], ['lfo.filter', 'Filter ±'], ['lfo.amp', 'Amp ']].filter(([id]) => PARAMS[id]);
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
    // Modulars: Tune in semitones. NiniFoog: the overall Tune knob, in cents.
    const fine = (osc === 2 ? (p['osc2.fine'] || 0) / 100 : 0) + (p[`osc${osc}.freq`] || 0) + (p[`osc${osc}.tune`] || 0) + (p['ctrl.tune'] || 0) / 100;
    return noteHz(this.lastNote + r * 12 + fine);
  }

  // ---- waveform harmonics -------------------------------------------------------------------
  drawHarmonics(ctx, w, h, spectrum) {
    const p = this.getPatch();
    const osc = this.oscN;
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
    const osc = this.oscN;
    const other = osc === 1 ? 2 : 1;
    const cur = p[`osc${osc}.range`];
    const fMin = 20, fMax = 20000;
    const xOf = (f) => (Math.log(f / fMin) / Math.log(fMax / fMin)) * w;
    const baseY = box.y + box.h * 0.62;

    // the other oscillator, faint, for comparison (if it is audible)
    if (p[`mix.osc${other}`] > 0.01 && p[`osc${other}.range`] !== undefined) {
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

    const isTune = /tune|freq/.test(this.param);
    label(ctx, isTune ? `${PARAMS['osc2.range'] ? 'OSC ' + osc : 'VCO'} PITCH   ·   Tune moves it between the octave steps` : `OSC ${osc} RANGE   ·   each octave step doubles or halves the frequency`, PAD.l, 16, AMBER, 'left', 10.5, 800);
    const fc = this.oscHz(osc);
    label(ctx, `${noteName(this.lastNote + cur * 12)} = ${fmtHz(fc)}`, w - PAD.r, 16, HI, 'right', 11, 800);
  }

  // ---- glide ------------------------------------------------------------------------------------
  drawGlide(ctx, w, h, box) {
    const p = this.getPatch();
    const glideId = PARAMS['kb.glide'] ? 'kb.glide' : 'ctrl.glide', modeId = PARAMS['kb.mode'] ? 'kb.mode' : 'ctrl.mode';
    const G = p['perf.glideon'] === 'off' ? 0 : p[glideId]; // NiniFoog: the Glide switch must be on
    const legato = p[modeId] === 'legato';
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

    const modeText = p[modeId] === undefined ? 'legato: contours do not restart'
      : PARAMS['kb.mode'] ? (legato ? 'Legato: overlapping notes keep the Gate high' : 'Mono: every note restarts the Gate')
      : legato ? 'Legato: only overlapping notes slide' : 'Mono: every note slides';
    label(ctx, `GLIDE   ·   ${glideOff ? 'switch off' : G > 0.0005 ? formatValue(glideId, G) : 'off'}   ·   ${modeText}`, box.x, 16, AMBER, 'left', 10.5, 800);
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
    return { fa, fb, df: Math.abs(fb - fa), what, m1: p['mix.osc1'] ?? 1, m2: p['mix.osc2'] ?? 1, k };
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

  // ---- shared bits for the newer graphs -------------------------------------------------------
  // an arrow along y from x1 to x2 with a caption (how far a CV can move something)
  sweepArrow(ctx, x1, x2, y, text) {
    ctx.save();
    ctx.strokeStyle = HI; ctx.fillStyle = HI; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    ctx.setLineDash([]);
    const d = x2 >= x1 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(x2, y); ctx.lineTo(x2 - d * 7, y - 4); ctx.lineTo(x2 - d * 7, y + 4); ctx.closePath(); ctx.fill();
    ctx.restore();
    label(ctx, text, (x1 + x2) / 2, y + 14, HI, 'center', 10, 700);
  }

  // a line through points [[x, y], ...]
  line(ctx, pts, color, width = 2, dash = null, glow = false) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    if (glow) { ctx.shadowColor = 'rgba(255, 200, 110, 0.9)'; ctx.shadowBlur = 10; }
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
  }

  // frequency of whatever is patched into an input, if it is a VCO (else null)
  vcoHzAt(input) {
    const src = String(this.getPatch()['jack.' + input] || '').split(',')[0];
    const m = /^vco([12])\./.exec(src);
    return m ? this.oscHz(Number(m[1])) : null;
  }

  // ---- interval between two oscillators -----------------------------------------------------
  // Each oscillator's harmonics on a log axis: where they land on each other is why some
  // intervals (octave, fifth) sound smooth and others rough.
  drawInterval(ctx, w, h, box) {
    const p = this.getPatch();
    const a = this.oscN, ref = a === 1 ? 2 : 1;
    const fr = this.oscHz(ref), fa = this.oscHz(a);
    const st = semis(p, a) - semis(p, ref);
    const fLo = Math.min(fr, fa) / 1.4, fHi = Math.max(fr, fa) * 9;
    const xOf = (f) => box.x + (Math.log(f / fLo) / Math.log(fHi / fLo)) * box.w;
    const base = box.y + box.h;
    const harm = (f0, color, top, name) => {
      for (let n = 1; n <= 8 && f0 * n < fHi; n++) {
        const x = xOf(f0 * n), y = base - (box.h - top) / Math.sqrt(n);
        this.line(ctx, [[x, base], [x, y]], color, n === 1 ? 3 : 1.6);
        if (n === 1) label(ctx, name, x, y - 6, color, 'center', 10.5, 800);
      }
    };
    harm(fr, 'rgba(140, 220, 255, 0.85)', 40, `Osc ${ref}`);
    harm(fa, HI, 22, `Osc ${a}`);
    // shared harmonics: where the two sets coincide (within 1%)
    let shared = 0;
    for (let i = 1; i <= 8; i++) for (let j = 1; j <= 8; j++) {
      if (Math.abs(fr * i / (fa * j) - 1) < 0.01 && fr * i < fHi) {
        shared++;
        ctx.save(); ctx.strokeStyle = AMBER; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(xOf(fr * i), base - 8, 6, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
    label(ctx, `INTERVAL   ·   Osc ${a} is ${st >= 0 ? '+' : '−'}${Math.abs(st).toFixed(2)} semitones from Osc ${ref}`, box.x, 16, AMBER, 'left', 10.5, 800);
    label(ctx, intervalName(st), w - PAD.r, 16, HI, 'right', 12, 800);
    label(ctx, `○ = harmonics the two share (${shared} shown): the more they share, the smoother the interval sounds`, w - PAD.r, 31, AMBER_DIM, 'right', 9.5, 600);
  }

  // ---- NF-Modular VCF: LP, BP and HP spread by Width -------------------------------------------
  drawVcf(ctx, w, h, box) {
    const p = this.getPatch();
    const live = this.engine.live;
    const halfW = p['vcf.width'] / 2;
    const playing = live && live.gate && live.a && live.a.s !== 0;
    const centre = playing ? live.fc / Math.pow(2, halfW) : p['vcf.cutoff'];
    const fl = Math.min(20000, centre * Math.pow(2, halfW)), fh = Math.max(20, centre / Math.pow(2, halfW));
    const res = p['vcf.res'], k = res * 4.15, k2 = 2 - 1.96 * res;
    const fMin = 20, fMax = 20000;
    const xOf = (f) => (Math.log(f / fMin) / Math.log(fMax / fMin)) * w;
    const DB_TOP = 24, DB_BOT = -60;
    const yOf = (db) => box.y + ((DB_TOP - Math.max(DB_BOT, Math.min(DB_TOP, db))) / (DB_TOP - DB_BOT)) * box.h;
    const lp4 = (f) => { const x = f / fl, p2r = 1 - x * x, p2i = 2 * x; const r = p2r * p2r - p2i * p2i + k, i = 2 * p2r * p2i; return (1 + 0.45 * k) / Math.hypot(r, i); };
    const svf = (x) => Math.hypot(1 - x * x, k2 * x);
    const hp2 = (f) => { const x = f / fh; return (x * x) / svf(x); };
    const lp2 = (f) => 1 / svf(f / fl);
    const curves = [
      { name: 'LP', fn: lp4, color: AMBER, at: Math.min(fl * 4, fMax * 0.6) },
      { name: 'BP', fn: (f) => hp2(f) * lp2(f) * (0.6 + k2 * 0.4), color: HI, at: Math.sqrt(fl * fh) },
      { name: 'HP', fn: hp2, color: '#78cdff', at: Math.max(fh / 4, fMin * 2) },
    ];
    ctx.strokeStyle = AMBER_FAINT; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(0, yOf(0) + 0.5); ctx.lineTo(w, yOf(0) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, '0 dB', w - PAD.r, yOf(0) - 4, AMBER_DIM, 'right', 9);
    curves.forEach((cv) => {
      const pts = [];
      for (let x = 0; x <= w; x += 2) { const f = fMin * Math.pow(fMax / fMin, x / w); pts.push([x, yOf(20 * Math.log10(cv.fn(f)))]); }
      this.line(ctx, pts, cv.color, cv.name === 'BP' ? 2.8 : 2, null, cv.name === 'BP');
      label(ctx, cv.name, xOf(cv.at), yOf(20 * Math.log10(cv.fn(cv.at))) - 8, cv.color, 'center', 11, 800);
    });
    // the two cutoffs
    [[fh, 'HP cutoff'], [fl, 'LP cutoff']].forEach(([f, t], i) => {
      const x = xOf(f);
      this.line(ctx, [[x, box.y + 30], [x, box.y + box.h]], AMBER_DIM, 1, [2, 4]);
      label(ctx, `${t} ${fmtHz(f)}`, x + (i ? 6 : -6), box.y + box.h - 4, AMBER_DIM, i ? 'left' : 'right', 9.5, 700);
    });
    if (this.param === 'vcf.cv' && Math.abs(p['vcf.cv']) > 0.01) {
      const f2 = Math.min(fMax, Math.max(fMin, centre * Math.pow(2, p['vcf.cv'] * 6)));
      this.sweepArrow(ctx, xOf(centre), xOf(f2), box.y + 44, `CV input of 1: the whole filter moves ${p['vcf.cv'] > 0 ? 'up' : 'down'} ${Math.abs(p['vcf.cv'] * 6).toFixed(1)} octaves`);
    }
    label(ctx, `VCF   ·   Cutoff ${fmtHz(centre)}${playing ? ' (live)' : ''}   ·   Width ${p['vcf.width'].toFixed(1)} oct`, PAD.l, 16, AMBER, 'left', 10.5, 800);
    label(ctx, p['vcf.width'] < 0.3 ? 'BP is a narrow peak at the cutoff' : 'BP keeps the band between the HP and LP cutoffs', w - PAD.r, 16, HI, 'right', 10.5, 700);
  }

  // ---- pulse width: the Pulse output's harmonics ---------------------------------------------
  drawPulseWidth(ctx, w, h) {
    const p = this.getPatch();
    const osc = this.oscN;
    const d = p[`osc${osc}.pw`], sweep = p[`osc${osc}.pwm`] * 0.45;
    const f0 = this.oscHz(osc);
    const fMin = 20, fMax = 20000;
    const xOf = (f) => (Math.log(f / fMin) / Math.log(fMax / fMin)) * w;
    const yOf = (db) => 40 + (-Math.max(-60, Math.min(0, db)) / 60) * (h - 70);
    for (let n = 1; n <= 60 && n * f0 < fMax; n++) {
      const a = Math.abs(Math.sin(Math.PI * n * d)) / (n * Math.sin(Math.PI * d));
      const x = xOf(n * f0);
      if (a < 1e-3) { ctx.save(); ctx.strokeStyle = AMBER_DIM; ctx.beginPath(); ctx.arc(x, h - 30, 3.5, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); continue; }
      const y = yOf(20 * Math.log10(a));
      this.line(ctx, [[x, h - 24], [x, y]], n === 1 ? HI : AMBER, 2);
      if (n <= 8) label(ctx, String(n), x, h - 12, n === 1 ? HI : AMBER_DIM, 'center', 9.5, 700);
    }
    // the wave itself, small, top right (and the range PWM sweeps it through)
    const bx = w - 150, by = 40, bw = 130, bh = 46;
    const pulse = (duty, color, dash) => this.line(ctx, [[bx, by + bh], [bx, by], [bx + bw * duty / 2, by], [bx + bw * duty / 2, by + bh], [bx + bw / 2, by + bh], [bx + bw / 2, by], [bx + bw / 2 + bw * duty / 2, by], [bx + bw / 2 + bw * duty / 2, by + bh], [bx + bw, by + bh]], color, 1.8, dash);
    if (sweep > 0.01) { pulse(Math.max(0.05, d - sweep), AMBER_DIM, [3, 3]); pulse(Math.min(0.95, d + sweep), AMBER_DIM, [3, 3]); }
    pulse(d, HI);
    const gaps = Math.round(1 / Math.min(d, 1 - d));
    label(ctx, `VCO ${osc} PULSE   ·   width ${Math.round(d * 100)}%   ·   EXPECTED HARMONICS`, PAD.l, 16, AMBER, 'left', 10.5, 800);
    label(ctx, Math.abs(d - 0.5) < 0.02 ? 'a square: odd harmonics only' : `every harmonic except about every ${gaps}th: narrower = thinner`, PAD.l, 30, HI, 'left', 10.5, 600);
    if (sweep > 0.01) label(ctx, `PWM sweeps the width from ${Math.round(Math.max(5, (d - sweep) * 100))}% to ${Math.round(Math.min(95, (d + sweep) * 100))}%`, w - 20, by + bh + 16, AMBER_DIM, 'right', 9.5, 700);
  }

  // ---- FM amount: how far the pitch bends -------------------------------------------------------
  drawFm(ctx, w, h, box) {
    const p = this.getPatch();
    const id = this.param;
    const amt = p[id] * 24; // FM Amount fully up: an input of 1 bends the pitch 2 octaves (24 semitones)
    const range = Math.max(2, Math.ceil(amt + 1));
    const yOf = (st) => box.y + box.h / 2 - (st / range) * (box.h / 2 - 6);
    this.line(ctx, [[box.x, yOf(0)], [box.x + box.w, yOf(0)]], AMBER_FAINT, 1, [3, 4]);
    label(ctx, '0', box.x - 6, yOf(0) + 3, AMBER_DIM, 'right', 9);
    label(ctx, `+${range}`, box.x - 6, yOf(range) + 9, AMBER_DIM, 'right', 9);
    label(ctx, `−${range}`, box.x - 6, yOf(-range), AMBER_DIM, 'right', 9);
    const input = [], pitch = [];
    for (let i = 0; i <= 200; i++) {
      const t = i / 200, s = Math.sin(t * Math.PI * 4);
      input.push([box.x + t * box.w, yOf(s * Math.min(range, 1))]);
      pitch.push([box.x + t * box.w, yOf(s * amt)]);
    }
    this.line(ctx, input, AMBER_DIM, 1.2, [4, 4]);
    this.line(ctx, pitch, HI, 2.5, null, true);
    label(ctx, `FM AMOUNT   ·   an input of ±1 bends the pitch ±${amt < 1 ? Math.round(amt * 100) + ' cents' : amt.toFixed(1) + ' semitones'}`, box.x, 16, AMBER, 'left', 10.5, 800);
    label(ctx, 'dashed = the FM input (a slow wave)   ·   bright = the pitch it causes, in semitones', w - PAD.r, h - 8, AMBER_DIM, 'right', 9.5, 600);
  }

  // ---- sample & hold ------------------------------------------------------------------------------
  drawSh(ctx, w, h, box) {
    const p = this.getPatch();
    const rate = p['sh.rate'], lag = p['sh.lag'];
    const clocked = !!p['jack.sh.clock'];
    const span = Math.min(8, Math.max(1, 8 / rate));
    const xOf = (t) => box.x + (t / span) * box.w;
    const yOf = (v) => box.y + box.h / 2 - v * (box.h / 2 - 6);
    const val = (k) => { const r = Math.sin((k + 1) * 78.233) * 43758.5453; return (r - Math.floor(r)) * 2 - 1; };
    const steps = [], glide = [];
    let out = val(0);
    const coef = lag > 0.001 ? 1 - Math.exp(-4.6 / (lag * 200)) : 1;
    for (let i = 0; i <= 600; i++) {
      const t = (i / 600) * span, k = Math.floor(t * rate);
      steps.push([xOf(t), yOf(val(k))]);
      for (let j = 0; j < 200 * span / 600; j++) out += (val(k) - out) * coef;
      glide.push([xOf(t), yOf(out)]);
    }
    this.line(ctx, steps, AMBER_DIM, 1.2, [3, 3]);
    this.line(ctx, glide, HI, 2.5, null, true);
    label(ctx, `S&H   ·   ${clocked ? 'clocked by its Clock input' : rate.toFixed(rate < 10 ? 1 : 0) + ' new values a second'}   ·   Lag ${lag < 0.001 ? 'off' : formatValue('sh.lag', lag)}`, box.x, 16, AMBER, 'left', 10.5, 800);
    label(ctx, lag < 0.001 ? 'steps: each sample is held until the next' : 'Lag smooths the steps into glides: a random LFO', w - PAD.r, h - 8, AMBER_DIM, 'right', 9.5, 600);
  }

  // ---- noise colour: its spectrum against white and pink --------------------------------------
  drawNoise(ctx, w, h, box) {
    const p = this.getPatch();
    const nf3 = p['mix.noisetype'] !== undefined; // NiniFoog: a White / Pink switch, no Colour knob
    const c = nf3 ? 0 : p['noise.colour'];
    const fMin = 20, fMax = 20000;
    const xOf = (f) => (Math.log(f / fMin) / Math.log(fMax / fMin)) * w;
    const yOf = (db) => box.y + ((12 - Math.max(-48, Math.min(12, db))) / 60) * box.h;
    const pts = (fn) => { const a = []; for (let x = 0; x <= w; x += 3) { const f = fMin * Math.pow(fMax / fMin, x / w); a.push([x, yOf(fn(f))]); } return a; };
    const gain = 20 * Math.log10(1 + Math.abs(c) * 1.5);
    const colour = (f) => {
      if (c < 0) { const fc = 20000 * Math.pow(2, c * 7); return gain - 10 * Math.log10(1 + (f / fc) ** 2); }
      if (c > 0) { const fc = 200 * Math.pow(2, c * 5.6), x = f / fc; return gain + 20 * Math.log10(x / Math.hypot(1, x)); }
      return 0;
    };
    this.line(ctx, pts(() => 0), 'rgba(140, 220, 255, 0.6)', 1.2, [4, 4]);
    this.line(ctx, pts((f) => -3 * Math.log2(f / 1000)), 'rgba(255, 140, 200, 0.6)', 1.2, [4, 4]);
    if (!nf3) this.line(ctx, pts(colour), HI, 2.8, null, true);
    else this.line(ctx, pts(p['mix.noisetype'] === 'pink' ? (f) => -3 * Math.log2(f / 1000) : () => 0), HI, 2.8, null, true);
    label(ctx, 'white: flat', w - PAD.r, yOf(0) - 6, 'rgba(140, 220, 255, 0.85)', 'right', 9.5, 700);
    if (nf3) {
      label(ctx, `NOISE   ·   ${p['mix.noisetype'] === 'pink' ? 'PINK' : 'WHITE'}   ·   level ${formatValue('mix.noise', p['mix.noise'])}`, PAD.l, 16, AMBER, 'left', 10.5, 800);
      label(ctx, p['mix.noisetype'] === 'pink' ? 'pink: each octave equally loud, so darker and rounder' : 'white: every frequency equally loud, so bright and hissy', w - PAD.r, 16, HI, 'right', 10.5, 700);
      return;
    }
    label(ctx, 'pink: −3 dB per octave', xOf(40), yOf(-3 * Math.log2(40 / 1000)) - 6, 'rgba(255, 140, 200, 0.85)', 'left', 9.5, 700);
    label(ctx, `NOISE COLOUR   ·   ${formatValue('noise.colour', c)}`, PAD.l, 16, AMBER, 'left', 10.5, 800);
    label(ctx, c < -0.03 ? 'the highs are rolled off: darker, rumbling' : c > 0.03 ? 'the lows are thinned out: brighter, hissier' : 'white: every frequency equally loud', w - PAD.r, 16, HI, 'right', 10.5, 700);
  }

  // ---- mixer: Clean / Drive / Fold ---------------------------------------------------------------
  drawShaper(ctx, w, h, box) {
    const p = this.getPatch();
    const gainOf = (L) => (L <= 10 ? L / 10 : Math.pow(2, (L - 10) * 3));
    const gains = [1, 2, 3, 4].map((n) => (p[`jack.mix.in${n}`] ? gainOf(p[`mix.l${n}`]) : 0));
    const A = Math.max(0.05, gains.reduce((s, g) => s + g, 0)); // the loudest the mix can swing
    const boost = Math.max(1, ...[1, 2, 3, 4].map((n) => gainOf(p[`mix.l${n}`])));
    const mode = p['mix.mode'];
    const fold = (x) => { const t = (x + 1) * 0.25; return 4 * Math.abs(t - Math.floor(t + 0.5)) - 1; };
    const shape = (x) => (mode === 'drive' ? Math.tanh(x * 4) * 0.7 : mode === 'fold' ? fold(x * 3) * 0.8 : x / boost);
    const half = box.w / 2 - 12;
    // left: the transfer curve, input across, output up
    const X = Math.max(1.2, A * 1.1);
    const lx = (x) => box.x + ((x + X) / (2 * X)) * half, ly = (y) => box.y + box.h / 2 - y * (box.h / 2 - 4);
    this.line(ctx, [[lx(-X), ly(0)], [lx(X), ly(0)]], AMBER_FAINT, 1);
    this.line(ctx, [[lx(0), ly(-1)], [lx(0), ly(1)]], AMBER_FAINT, 1);
    const curve = []; for (let i = 0; i <= 300; i++) { const x = -X + (i / 300) * 2 * X; curve.push([lx(x), ly(shape(x))]); }
    this.line(ctx, curve, HI, 2.5, null, true);
    ctx.save(); ctx.fillStyle = 'rgba(255, 181, 71, 0.12)'; ctx.fillRect(lx(-A), box.y, lx(A) - lx(-A), box.h); ctx.restore();
    label(ctx, 'in →', lx(X) - 4, ly(0) + 14, AMBER_DIM, 'right', 9.5, 700);
    label(ctx, 'out', lx(0) + 6, box.y + 10, AMBER_DIM, 'left', 9.5, 700);
    label(ctx, 'shaded: how far your mix swings', lx(0), box.y + box.h + 14, AMBER_DIM, 'center', 9.5, 600);
    // right: a sine at the mix's level, through the curve
    const rx = box.x + half + 24, rw = box.w - half - 24;
    const before = [], after = [];
    for (let i = 0; i <= 300; i++) { const t = i / 300, s = Math.sin(t * Math.PI * 4) * A; before.push([rx + t * rw, ly(s / Math.max(1, A))]); after.push([rx + t * rw, ly(shape(s))]); }
    this.line(ctx, before, AMBER_DIM, 1.2, [4, 4]);
    this.line(ctx, after, HI, 2.5, null, true);
    label(ctx, 'dashed: a sine going in   ·   bright: what comes out', rx + rw / 2, box.y + box.h + 14, AMBER_DIM, 'center', 9.5, 600);
    const words = { clean: 'Clean: the plain mix', drive: 'Drive: squashed towards a square', fold: 'Fold: folded back each time it passes the top' };
    label(ctx, `MIXER   ·   ${words[mode]}`, box.x, 16, AMBER, 'left', 10.5, 800);
    label(ctx, `mix swings up to ${A.toFixed(1)}×${A > 1 ? (mode === 'clean' ? ' (turned back down)' : ' (pushed into the Mode)') : ''}`, w - PAD.r, 16, HI, 'right', 10.5, 700);
  }

  // ---- ring mod: sum and difference --------------------------------------------------------------
  drawRing(ctx, w, h, box) {
    const p = this.getPatch();
    const mix = p['ring.mix'];
    const fa = this.vcoHzAt('ring.a') || 300, fb = this.vcoHzAt('ring.b') || 200;
    const example = !this.vcoHzAt('ring.a') || !this.vcoHzAt('ring.b');
    const fMin = 20, fMax = 20000;
    const xOf = (f) => (Math.log(f / fMin) / Math.log(fMax / fMin)) * w;
    const base = box.y + box.h - 6;
    const bar = (f, level, color, text, dash) => {
      if (f < fMin || f > fMax) return;
      const x = xOf(f), y = base - (box.h - 50) * level;
      this.line(ctx, [[x, base], [x, y]], color, 3, dash);
      label(ctx, text, x, y - 8, color, 'center', 10, 800);
      label(ctx, fmtHz(f), x, base + 14, color, 'center', 9, 600);
    };
    bar(fa, Math.max(0.08, 1 - mix), 'rgba(140, 220, 255, 0.85)', 'A', mix > 0.98 ? [3, 3] : null);
    if (mix > 0.98) bar(fb, 0.08, 'rgba(140, 220, 255, 0.5)', 'B', [3, 3]);
    bar(fa + fb, Math.max(0.05, mix * 0.6), HI, 'A + B');
    bar(Math.abs(fa - fb), Math.max(0.05, mix * 0.6), HI, 'A − B');
    label(ctx, `RING MOD   ·   A × B   ·   Mix ${formatValue('ring.mix', mix)}`, PAD.l, 16, AMBER, 'left', 10.5, 800);
    label(ctx, example ? 'example: A 300 Hz, B 200 Hz (patch two VCOs to see yours)' : 'the original pitches drop out; their sum and difference come in', w - PAD.r, 16, HI, 'right', 10.5, 700);
  }

  // ---- VCA and Attenuverter: output against input --------------------------------------------------
  drawTransfer(ctx, w, h, box) {
    const p = this.getPatch();
    const vca = this.group === 'vca';
    const n = /^(vca|att\.a)([12])/.exec(this.param);
    const which = n ? n[2] : '';
    const size = Math.min(box.h, box.w * 0.45);
    const gx = box.x + 30, gy = box.y + (box.h - size) / 2;
    const xOf = (x) => gx + ((x + (vca ? 0 : 1)) / (vca ? 1 : 2)) * size; // VCA: CV 0..1; att: -1..1
    const yOf = (y) => gy + size / 2 - y * (size / 2) * (vca ? 2 : 1) + (vca ? size / 2 : 0);
    ctx.strokeStyle = AMBER_FAINT; ctx.strokeRect(gx, gy, size, size);
    let fn, title, note;
    if (vca) {
      const lv = p[which ? `vca${which}.level` : 'vca.level'], amt = p[which ? `vca${which}.cv` : 'vca.cv'] ?? 1;
      fn = (x) => Math.max(0, Math.min(1, lv + x * amt));
      title = `VCA${which ? ' ' + which : ''}   ·   how open it is, against the signal at CV`;
      note = `Level alone: ${Math.round(lv * 100)}% open   ·   CV at 1 (an envelope at its peak): ${Math.round(fn(1) * 100)}% open`;
      label(ctx, 'CV in →', gx + size, gy + size + 14, AMBER_DIM, 'right', 9.5, 700);
      label(ctx, 'open', gx - 6, gy + 8, AMBER_DIM, 'right', 9.5, 700);
      label(ctx, 'shut', gx - 6, gy + size, AMBER_DIM, 'right', 9.5, 700);
    } else {
      const amt = p[`att.a${which}`];
      fn = (x) => x * amt;
      title = `ATTENUVERTER ${which}   ·   Out against In, at ${formatValue(`att.a${which}`, amt)}`;
      note = amt < -0.01 ? 'negative: the signal comes out upside down (inverted)' : Math.abs(amt) < 0.01 ? 'at 0 nothing gets through' : amt < 0.99 ? 'smaller: the signal comes out turned down' : 'at +100% the signal passes unchanged';
      this.line(ctx, [[gx, yOf(amt)], [gx + size, yOf(amt)]], AMBER_DIM, 1, [3, 4]);
      label(ctx, `with nothing in In: a steady ${amt >= 0 ? '+' : '−'}${Math.abs(amt).toFixed(2)}`, gx + size + 8, yOf(amt) + 3, AMBER_DIM, 'left', 9.5, 700);
      label(ctx, 'In →', gx + size, gy + size + 14, AMBER_DIM, 'right', 9.5, 700);
    }
    const pts = []; for (let i = 0; i <= 100; i++) { const x = vca ? i / 100 : -1 + (i / 100) * 2; pts.push([xOf(x), yOf(fn(x))]); }
    this.line(ctx, pts, HI, 2.8, null, true);
    label(ctx, title, PAD.l, 16, AMBER, 'left', 10.5, 800);
    label(ctx, note, w - PAD.r, h - 8, HI, 'right', 10.5, 700);
  }
}
