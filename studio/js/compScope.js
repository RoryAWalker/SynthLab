// The NF-C1's two screens, drawn in place of the synths' oscilloscope and spectrum.
//
// Left, LEVELS: the last few seconds, scrolling. The level going in (shaded), the level coming
// out (amber line), the threshold (dashed line) and, underneath, how far the compressor is
// turning the sound down at each moment (gain reduction, red).
//
// Right, TRANSFER CURVE: what level comes out for each level going in. Below the threshold the
// curve follows the 1:1 line (no change); above it the curve bends over by the ratio. A dot
// rides along the curve with the music; a ring shows where the sound really is, which trails
// the curve while the attack and release catch up.
//
// Turning or hovering over a control lights up its part of both screens for a few seconds.

const PHOS = '#8dffb0';
const GRID = 'rgba(120, 255, 170, 0.12)';
const GRID_HI = 'rgba(120, 255, 170, 0.28)';
const AMBER = '#ffb547';
const RED = '#ff5a4a';
const INK = 'rgba(220, 255, 230, 0.85)';
const DIM = 'rgba(220, 255, 230, 0.5)';
// the makeup in use: the pot, or with Auto on what the engine has worked out (comp-processor.js)
let liveAuto = null;
const makeupOf = (p) => (p['comp.auto'] === 'on' ? (liveAuto ?? 0) : p['comp.makeup']);

const SECONDS = 4; // shown on the levels screen
const LO = -60, HI = 12; // dB range on both screens

function label(ctx, text, x, y, color, align = 'left', size = 10, weight = 600) {
  ctx.font = `${weight} ${size}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function setupCanvas(canvas, pixelScale = 1) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * Math.min(3, Math.max(1, pixelScale));
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

// the compressor's static curve: output level (before makeup) for an input level, in dB
export function curve(x, T, R, W) {
  const over = x - T;
  if (2 * over < -W) return x;
  if (W > 0 && 2 * Math.abs(over) <= W) return x + (1 / R - 1) * (over + W / 2) * (over + W / 2) / (2 * W);
  return T + over / R;
}

const fmtDb = (v) => (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + Math.abs(v).toFixed(1) + ' dB';
const fmtRatio = (r) => (r < 10 ? r.toFixed(1) : Math.round(r)) + ':1';

// What each control does, in a sentence, shown on the curve screen while it is in focus
const FOCUS_TEXT = {
  'comp.thresh': (p) => `Above ${fmtDb(p['comp.thresh'])} the compressor starts turning the sound down. Below it, nothing changes.`,
  'comp.ratio': (p) => `Every ${fmtRatio(p['comp.ratio']).replace(':1', '')} dB the input goes over the threshold comes out as 1 dB over.`,
  'comp.knee': (p) => (p['comp.knee'] < 0.5 ? 'Hard knee: the compression starts all at once at the threshold.' : `Soft knee: the compression fades in gradually over ${Math.round(p['comp.knee'])} dB around the threshold.`),
  'comp.attack': (p) => `Attack: how quickly the gain reduction comes in when the sound goes over the threshold (${p['comp.attack'] < 10 ? p['comp.attack'].toFixed(1) : Math.round(p['comp.attack'])} ms).`,
  'comp.release': (p) => `Release: how quickly the gain reduction lets go once the sound drops back (${Math.round(p['comp.release'])} ms).`,
  'comp.makeup': (p) => (p['comp.auto'] === 'on' ? `Auto makeup is on, so the Makeup pot is not used: the unit is turning everything back up by ${fmtDb(makeupOf(p))} by itself.` : `Makeup turns everything back up by ${fmtDb(p['comp.makeup'])}, to win back the loudness the compression took away.`),
  'comp.auto': (p) => (p['comp.auto'] === 'on' ? `Auto makeup: ${fmtDb(makeupOf(p))}. It listens to how much quieter the compression made the sound and turns it back up by that much. Move the Threshold and watch the Makeup pot follow.` : 'Auto makeup is off: the Makeup pot sets the makeup.'),
  'comp.bypass': (p) => (p['comp.bypass'] === 'on' ? 'Bypassed: you hear the sound without compression (the meters still show what it would do).' : 'Compressing: you hear the compressed sound. Press Bypass to compare.'),
};

export class CompScope {
  constructor(levelCanvas, curveCanvas, engine, getPatch) {
    this.lc = levelCanvas;
    this.cc = curveCanvas;
    this.engine = engine;
    this.getPatch = getPatch;
    this.frozen = false;
    this.rate = 375; // level frames per second (set by the engine's reports)
    this.n = 0; // frames written so far
    this.cap = 4096;
    this.inp = new Float32Array(this.cap).fill(-120);
    this.out = new Float32Array(this.cap).fill(-120);
    this.gr = new Float32Array(this.cap);
    this.det = new Float32Array(this.cap).fill(-120);
    this.focusId = null;
    this.focusAt = 0;
    this.live = { det: -120, gr: 0 }; // latest
    engine.onFrames = (m) => this.add(m);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame(() => this.frame());
  }

  add(m) {
    this.rate = m.rate || this.rate;
    const f = m.frames;
    for (let i = 0; i + 3 < f.length; i += 4) {
      const k = this.n++ % this.cap;
      this.inp[k] = f[i]; this.out[k] = f[i + 1]; this.gr[k] = f[i + 2]; this.det[k] = f[i + 3];
    }
    if (f.length >= 4) this.live = { det: f[f.length - 1], gr: m.gr, on: m.on, playing: m.playing, makeup: m.makeup };
  }

  // Lessons: the target's settings, drawn as a ghost (its transfer curve, its threshold) once it
  // has been heard, while 'Show target on scopes' (this.showTarget, set by the lessons) is ticked.
  // It is drawn with the student's makeup, so the two curves can be compared directly.
  captureTarget(patch) { this.target = patch ? { ...patch } : null; }
  clearTarget() { this.target = null; }
  ghost() { return this.target && this.showTarget !== false ? this.target : null; }

  // light up a control's part of the screens (hover help, or turning it)
  focus(id) {
    if (!FOCUS_TEXT[id] && !['src.sound'].includes(id)) return;
    this.focusId = id;
    this.focusAt = performance.now();
  }
  release() { this.focusAt = Math.min(this.focusAt, performance.now() - 2500); }
  // 1 while in focus, fading out over the last second
  glow(...ids) {
    if (!ids.includes(this.focusId)) return 0;
    const age = (performance.now() - this.focusAt) / 1000;
    return Math.max(0, Math.min(1, 4 - age));
  }

  resize() {
    this.a = setupCanvas(this.lc, this.pixelScale);
    this.b = setupCanvas(this.cc, this.pixelScale);
  }
  setPixelScale(s) {
    if (Math.abs((this.pixelScale || 1) - s) < 0.05) return;
    this.pixelScale = s;
    this.resize();
  }

  frame() {
    requestAnimationFrame(() => this.frame());
    if (this.frozen || !this.a.w) return;
    const p = this.getPatch();
    this.drawLevels(this.a.ctx, this.a.w, this.a.h, p);
    this.drawCurve(this.b.ctx, this.b.w, this.b.h, p);
    // the lessons' celebrations (smileys, fireworks), drawn over the screens
    if (this.fx) {
      this.fx.a.forEach((f) => f.draw(this.a.ctx, this.a.w, this.a.h));
      this.fx.b.forEach((f) => f.draw(this.b.ctx, this.b.w, this.b.h));
    }
  }

  // ---- left: levels over time ----
  drawLevels(ctx, w, h, p) {
    ctx.fillStyle = '#050c07';
    ctx.fillRect(0, 0, w, h);
    const top = 18, grH = Math.round(h * 0.26), mid = h - grH - 16; // level area: top..mid; GR band below
    const left = 34, right = w - 6, pw = right - left;
    const yOf = (db) => top + (HI - Math.max(LO, Math.min(HI, db))) / (HI - LO) * (mid - top);
    const GR_MAX = 24;
    const grTop = mid + 14, grBot = h - 4;
    const yGr = (g) => grTop + Math.min(GR_MAX, g) / GR_MAX * (grBot - grTop);

    // grid and scale
    ctx.lineWidth = 1;
    for (let d = HI; d >= LO; d -= 12) {
      const y = Math.round(yOf(d)) + 0.5;
      ctx.strokeStyle = d === 0 ? GRID_HI : GRID;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      label(ctx, d > 0 ? '+' + d : String(d), left - 5, y + 3, DIM, 'right', 9);
    }
    for (let s = 0; s <= SECONDS; s++) {
      const x = Math.round(right - s / SECONDS * pw) + 0.5;
      ctx.strokeStyle = GRID;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, grBot); ctx.stroke();
    }
    for (let g = 0; g <= GR_MAX; g += 6) {
      const y = Math.round(yGr(g)) + 0.5;
      ctx.strokeStyle = g === 0 ? GRID_HI : GRID;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      if (g % 12 === 0) label(ctx, g ? '−' + g : '0', left - 5, y + 3, DIM, 'right', 9);
    }

    // the history, newest at the right: one column per pixel, taking the loudest frame in it
    const frames = Math.min(this.n, Math.round(SECONDS * this.rate), this.cap);
    const perPx = SECONDS * this.rate / pw;
    const col = (x, arr, pick) => {
      const age1 = (right - x) * perPx, age0 = Math.max(0, age1 - perPx);
      if (age1 > frames) return null;
      let m = pick === 'max' ? -Infinity : Infinity;
      for (let a = Math.floor(age0); a <= Math.ceil(age1) && a < frames; a++) {
        const v = arr[(this.n - 1 - a + this.cap * 4) % this.cap];
        m = pick === 'max' ? Math.max(m, v) : Math.min(m, v);
      }
      return Number.isFinite(m) ? m : null;
    };
    const inGlow = this.glow('src.sound');
    // input: shaded
    ctx.fillStyle = `rgba(141, 255, 176, ${0.22 + 0.25 * inGlow})`;
    ctx.beginPath();
    ctx.moveTo(right, mid);
    for (let x = right; x >= left; x--) { const v = col(x, this.inp, 'max'); ctx.lineTo(x, yOf(v ?? -120)); }
    ctx.lineTo(left, mid);
    ctx.closePath();
    ctx.fill();
    // output: amber line
    const outGlow = this.glow('comp.makeup', 'comp.bypass');
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1.5 + outGlow * 1.5;
    ctx.beginPath();
    let started = false;
    for (let x = right; x >= left; x--) {
      const v = col(x, this.out, 'max');
      if (v === null) break;
      const y = yOf(v);
      if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
    }
    ctx.stroke();
    // threshold
    const tg = this.glow('comp.thresh');
    const yT = Math.round(yOf(p['comp.thresh'])) + 0.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 + 0.45 * tg})`;
    ctx.lineWidth = 1 + tg * 1.5;
    ctx.beginPath(); ctx.moveTo(left, yT); ctx.lineTo(right, yT); ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, `Threshold ${fmtDb(p['comp.thresh'])}`, left + 4, yT - 4, tg ? '#fff' : INK, 'left', 9.5 + tg, 700);
    const gt = this.ghost();
    if (gt && Math.abs(gt['comp.thresh'] - p['comp.thresh']) > 0.5) { // the lesson's target threshold
      const yG = Math.round(yOf(gt['comp.thresh'])) + 0.5;
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(left, yG); ctx.lineTo(right, yG); ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, 'target', right - 4, yG - 4, 'rgba(120, 200, 255, 0.95)', 'right', 9.5, 700);
    }
    // gain reduction: red bars hanging from 0
    const arGlow = this.glow('comp.attack', 'comp.release', 'comp.ratio');
    ctx.fillStyle = p['comp.bypass'] === 'on' ? 'rgba(255, 90, 74, 0.35)' : `rgba(255, 90, 74, ${0.75 + 0.25 * arGlow})`;
    for (let x = right; x >= left; x--) {
      const g = col(x, this.gr, 'max');
      if (g === null) break;
      if (g > 0.05) ctx.fillRect(x, grTop, 1, yGr(g) - grTop);
    }
    if (arGlow) {
      ctx.strokeStyle = `rgba(255, 140, 120, ${arGlow})`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(left + 0.5, grTop - 1.5, pw - 1, grBot - grTop + 3);
    }

    // titles and key
    label(ctx, 'LEVELS · last 4 seconds', left, 12, INK, 'left', 10, 700);
    let kx = right;
    const key = (text, color, box) => {
      ctx.font = '600 9.5px "Helvetica Neue", Arial, sans-serif';
      const tw = ctx.measureText(text).width;
      kx -= tw;
      label(ctx, text, kx, 12, INK, 'left', 9.5);
      kx -= 14;
      ctx.fillStyle = color;
      if (box) ctx.fillRect(kx, 4, 10, 9); else ctx.fillRect(kx, 8, 10, 2);
      kx -= 12;
    };
    key('gain reduction', RED, true);
    key('out', AMBER, false);
    key('in', 'rgba(141, 255, 176, 0.5)', true);
    const g = this.live.gr || 0;
    label(ctx, `GAIN REDUCTION${p['comp.bypass'] === 'on' ? ' (bypassed: not applied)' : ''}`, left + 4, grTop - 3, RED, 'left', 9, 700);
    label(ctx, g > 0.05 ? '−' + g.toFixed(1) + ' dB' : '0 dB', right - 4, grTop - 3, RED, 'right', 10, 700);
    if (arGlow && this.focusId !== 'comp.ratio') {
      const txt = this.focusId === 'comp.attack' ? 'Attack: how fast the red comes in when the level jumps' : 'Release: how fast the red falls away when the level drops';
      label(ctx, txt, left + pw / 2, grBot - 6, '#ffd0c8', 'center', 10, 700);
    }
    if (!this.live.playing && this.n === 0) label(ctx, 'Press Play on the Loop Player', left + pw / 2, (top + mid) / 2, DIM, 'center', 13, 700);
  }

  // ---- right: the transfer curve ----
  drawCurve(ctx, w, h, p) {
    ctx.fillStyle = '#050c07';
    ctx.fillRect(0, 0, w, h);
    if (this.live.makeup != null) liveAuto = this.live.makeup;
    const T = p['comp.thresh'], R = p['comp.ratio'], W = p['comp.knee'], M = makeupOf(p);
    const pad = { l: 34, t: 18, b: 22 };
    const size = Math.max(60, Math.min(h - pad.t - pad.b, w * 0.55));
    const x0 = pad.l, y0 = pad.t, x1 = x0 + size, y1 = y0 + size;
    const xOf = (d) => x0 + (Math.max(LO, Math.min(HI, d)) - LO) / (HI - LO) * size;
    const yOf = (d) => y1 - (Math.max(LO, Math.min(HI, d)) - LO) / (HI - LO) * size;
    const out = (d) => curve(d, T, R, W) + M;

    // grid
    ctx.lineWidth = 1;
    for (let d = LO; d <= HI; d += 12) {
      ctx.strokeStyle = d === 0 ? GRID_HI : GRID;
      const x = Math.round(xOf(d)) + 0.5, y = Math.round(yOf(d)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      label(ctx, d > 0 ? '+' + d : String(d), x0 - 5, y + 3, DIM, 'right', 9);
      label(ctx, d > 0 ? '+' + d : String(d), x, y1 + 11, DIM, 'center', 9);
    }
    label(ctx, 'IN (dB) →', x1, y1 + 20, DIM, 'right', 9, 700);
    label(ctx, 'TRANSFER CURVE · out against in', x0, 12, INK, 'left', 10, 700);

    // 1:1: no change
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(220, 255, 230, 0.35)';
    ctx.beginPath(); ctx.moveTo(xOf(LO), yOf(LO)); ctx.lineTo(xOf(HI), yOf(HI)); ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, '1:1 no change', xOf(HI - 2) - 2, yOf(HI - 2) + 14, DIM, 'right', 8.5);

    // the knee's range, shaded
    const kg = this.glow('comp.knee');
    if (W > 0.5) {
      ctx.fillStyle = `rgba(255, 181, 71, ${0.08 + 0.18 * kg})`;
      ctx.fillRect(xOf(T - W / 2), y0, xOf(T + W / 2) - xOf(T - W / 2), size);
    }
    // threshold
    const tg = this.glow('comp.thresh');
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + 0.5 * tg})`;
    ctx.lineWidth = 1 + tg * 1.5;
    const xT = Math.round(xOf(T)) + 0.5;
    ctx.beginPath(); ctx.moveTo(xT, y0); ctx.lineTo(xT, y1); ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'threshold', xT + 3, y1 - 4, tg ? '#fff' : INK, 'left', 9, 700);

    // the curve, the part above the threshold brighter when Ratio is in focus
    const rg = this.glow('comp.ratio');
    const mg = this.glow('comp.makeup', 'comp.auto');
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, size, size); ctx.clip();
    if (M > 0.05 && mg) { // makeup: the curve before it, faint, with an arrow up
      ctx.strokeStyle = `rgba(255, 181, 71, ${0.35 * mg})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let d = LO; d <= HI; d += 0.5) { const x = xOf(d), y = yOf(curve(d, T, R, W)); d === LO ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    const gt = this.ghost();
    if (gt) { // the lesson's target curve, in blue, under the student's
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.75)';
      ctx.beginPath();
      for (let d = LO; d <= HI; d += 0.25) { const x = xOf(d), y = yOf(curve(d, gt['comp.thresh'], gt['comp.ratio'], gt['comp.knee']) + M); d === LO ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = AMBER;
    ctx.beginPath();
    for (let d = LO; d <= HI; d += 0.25) { const x = xOf(d), y = yOf(out(d)); d === LO ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    if (rg) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = `rgba(255, 220, 150, ${0.6 * rg})`;
      ctx.beginPath();
      for (let d = T; d <= HI; d += 0.25) { const x = xOf(d), y = yOf(out(d)); d === T ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.restore();

    // ratio step: 12 dB along, so many dB up
    const anyFocus = Object.keys(FOCUS_TEXT).some((k) => this.glow(k) > 0);
    const showStep = rg > 0 || !anyFocus; // the ratio's step, unless another control is being explained
    if (showStep && T + 12 <= HI - 1) {
      const a = Math.max(T + W / 2, T), b = a + 12;
      if (b <= HI) {
        const ya = yOf(out(a)), yb = yOf(out(b));
        const alpha = 0.5 + 0.5 * rg;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xOf(a), ya); ctx.lineTo(xOf(b), ya); ctx.lineTo(xOf(b), yb); ctx.stroke();
        label(ctx, '12 dB in', (xOf(a) + xOf(b)) / 2, ya + 11, `rgba(255,255,255,${alpha})`, 'center', 8.5, 700);
        label(ctx, `${(12 / R).toFixed(1)} out`, xOf(b) + 3, (ya + yb) / 2 + 3, `rgba(255,255,255,${alpha})`, 'left', 8.5, 700);
      }
    }

    // where the music is now: on the curve (target) and where it really is (after attack/release)
    const live = this.live;
    const playing = live.playing || (this.n && live.det > -100);
    if (playing && live.det > LO) {
      const xd = xOf(live.det);
      const target = out(live.det);
      const actual = live.det - (p['comp.bypass'] === 'on' ? 0 : live.gr) + (p['comp.bypass'] === 'on' ? 0 : M);
      ctx.fillStyle = AMBER;
      ctx.beginPath(); ctx.arc(xd, yOf(p['comp.bypass'] === 'on' ? live.det : target), 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(xd, yOf(actual), 6.5, 0, Math.PI * 2); ctx.stroke();
    }

    // readouts and the sentence for the control in focus
    const tx = x1 + 22, tw = w - tx - 10;
    let y = 32;
    const row = (k, v, hi) => {
      label(ctx, k, tx, y, hi ? '#fff' : DIM, 'left', 12, 700);
      label(ctx, v, tx + tw, y, hi ? '#fff' : AMBER, 'right', 15, 700);
      y += 23;
    };
    row('THRESHOLD', fmtDb(T), tg > 0);
    row('RATIO', fmtRatio(R), rg > 0);
    row('KNEE', W < 0.5 ? 'hard' : Math.round(W) + ' dB', kg > 0);
    row(p['comp.auto'] === 'on' ? 'MAKEUP (AUTO)' : 'MAKEUP', fmtDb(M), mg > 0);
    row('REDUCING BY', p['comp.bypass'] === 'on' ? 'bypassed' : (live.gr > 0.05 ? fmtDb(-live.gr) : '0 dB'), false);
    y += 4;
    label(ctx, '● where the curve wants the sound', tx, y, AMBER, 'left', 11.5, 600); y += 16;
    label(ctx, '○ where it is (after attack/release)', tx, y, '#fff', 'left', 11.5, 600); y += 21;
    const fid = anyFocus ? this.focusId : null;
    if (fid && FOCUS_TEXT[fid]) this.wrap(ctx, FOCUS_TEXT[fid](p), tx, y, tw, 16, '#ffe6bd');
  }

  wrap(ctx, text, x, y, maxW, lh, color) {
    ctx.font = '600 12.5px "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    let line = '';
    for (const word of text.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = word; } else line = t;
    }
    if (line) ctx.fillText(line, x, y);
  }
}
