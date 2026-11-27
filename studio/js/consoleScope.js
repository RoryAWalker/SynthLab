// The NF-Mix4 console's two screens, drawn in place of the synths' oscilloscope and spectrum.
//
// Left, SIGNAL FLOW: the selected channel's path, block by block, in the order the strip is laid
// out, with the live level at each stage. Branches show where Aux 1 (before the fader) and Aux 2
// (after it) are taken off, Aux 2 feeding the reverb, whose return joins the main bus, then the
// bus compressor, the main fader and the monitor. Anything switched off or muted goes dark.
//
// Right, EQ: the selected channel's high-pass filter and EQ as a frequency curve, with a strip
// along the bottom showing the bus compressor's gain reduction over the last few seconds.
//
// The selected channel is the one whose control was touched last.

import { faderDb, sendDb, preampDb, fmtDb, biquad, biquadDb, EQ_LOW, EQ_HIGH, EQ_MID_Q } from './consoleMath.js';
import { SONG_STEMS } from './sources.js';
import { fmtDbu } from './meters.js';

const PHOS = '#8dffb0';
const GRID = 'rgba(120, 255, 170, 0.12)';
const INK = 'rgba(220, 255, 230, 0.88)';
const DIM = 'rgba(220, 255, 230, 0.45)';
const DARK = 'rgba(220, 255, 230, 0.16)';
const AMBER = '#ffb547';
const RED = '#ff5a4a';
const SR = 48000;

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
// a level's colour: quiet green, hot amber, clipping red; nothing at all is dim
const levelColour = (db) => (db < -90 ? DIM : db >= -0.5 ? RED : db > -6 ? AMBER : PHOS); // (dBFS: amber above +16 dBu)
// levels are shown in console units, dBu (0 VU = +4 dBu = -18 dBFS), like the desk's meters
const fmtLevel = (db) => (db < -90 ? '—' : fmtDbu(db));

// which block of the diagram each channel control belongs to
const BLOCK_OF = { in: 'in', p48: 'in', gain: 'pre', pol: 'pre', hpf: 'hpf', hf: 'eq', mg: 'eq', mf: 'eq', lf: 'eq', eq: 'eq',
  aux1: 'aux1', aux2: 'aux2', pan: 'pan', main: 'bus', mute: 'mute', solo: 'solo', fader: 'fader' };
const MASTER_BLOCK = { 'aux1.master': 'aux1m', 'aux2.master': 'aux2m', 'rev.time': 'rev', 'rev.ret': 'rev', 'main.fader': 'mainf',
  'mon.src': 'mon', 'mon.vol': 'mon', 'tape.play': 'in' };

export class ConsoleScope {
  constructor(flowCanvas, eqCanvas, engine, getPatch) {
    this.fc = flowCanvas;
    this.ec = eqCanvas;
    this.engine = engine;
    this.getPatch = getPatch;
    this.frozen = false;
    this.sel = 0; // the selected channel (0..3)
    this.hot = null; // the block lit by the control in focus
    this.hotAt = 0;
    this.grHist = new Float32Array(240); // the bus compressor's gain reduction, last ~5 s
    this.grN = 0;
    this.lastSeq = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame(() => this.frame());
  }
  // (the lessons' target ghost on the synths' scopes: nothing to show here)
  captureTarget() {}
  showTarget() {}
  clearTarget() {}

  focus(id) {
    const m = /^ch(\d)\.(\w+)$/.exec(id);
    if (m) { this.sel = Number(m[1]) - 1; this.hot = BLOCK_OF[m[2]] || null; }
    else if (id.startsWith('bc.')) this.hot = 'comp';
    else this.hot = MASTER_BLOCK[id] || null;
    this.hotAt = performance.now();
  }
  release() { this.hotAt = Math.min(this.hotAt, performance.now() - 3000); }
  glow(block) {
    if (block !== this.hot) return 0;
    return Math.max(0, Math.min(1, 4 - (performance.now() - this.hotAt) / 1000));
  }

  resize() {
    this.a = setupCanvas(this.fc, this.pixelScale);
    this.b = setupCanvas(this.ec, this.pixelScale);
  }
  setPixelScale(s) {
    if (Math.abs((this.pixelScale || 1) - s) < 0.05) return;
    this.pixelScale = s;
    this.resize();
  }

  frame() {
    requestAnimationFrame(() => this.frame());
    const live = this.engine.running && this.engine.live && this.engine.live.console ? this.engine.live : null;
    if (live && live !== this.lastSeq) { // one gain-reduction reading per report
      this.lastSeq = live;
      this.grHist[this.grN++ % this.grHist.length] = live.grMax;
    }
    if (this.frozen || !this.a.w) return;
    const p = this.getPatch();
    this.drawFlow(this.a.ctx, this.a.w, this.a.h, p, live);
    this.drawEq(this.b.ctx, this.b.w, this.b.h, p, live);
  }

  // ---- left: the signal flow ----
  drawFlow(ctx, w, h, p, live) {
    ctx.fillStyle = '#050c07';
    ctx.fillRect(0, 0, w, h);
    const n = this.sel + 1, k = `ch${n}.`, stem = SONG_STEMS[this.sel];
    const L = live ? live.ch[this.sel] : null;
    const mic = p[k + 'in'] !== 'line';
    const needs48 = stem.input === 'mic' && mic && p[k + 'p48'] !== 'on';
    const muted = p[k + 'mute'] === 'on';
    const routed = p[k + 'main'] !== 'off';
    const anySolo = [1, 2, 3, 4].some((c) => p[`ch${c}.solo`] === 'on');

    label(ctx, `SIGNAL FLOW · CHANNEL ${n}: ${stem.label.toUpperCase()}`, 12, 15, INK, 'left', 10.5, 700);
    label(ctx, `${stem.note}`, w - 12, 15, DIM, 'right', 9.5);

    // the channel's blocks, left to right: [id, title, setting, level, active]
    const blocks = [
      ['in', mic ? 'MIC IN' : 'LINE IN', needs48 ? 'no 48 V!' : stem.input === 'mic' ? 'mic level' : 'line level', L && L.in, !needs48],
      ['pre', 'PREAMP', fmtDb(preampDb(p[k + 'gain'], mic)) + (p[k + 'pol'] === 'on' ? ' Ø' : ''), L && L.pre, true],
      ['hpf', 'HPF', p[k + 'hpf'] > 25 ? Math.round(p[k + 'hpf']) + ' Hz' : 'off', null, p[k + 'hpf'] > 25],
      ['eq', 'EQ', p[k + 'eq'] === 'off' ? 'out' : 'in', L && L.eq, p[k + 'eq'] !== 'off'],
      ['mute', 'MUTE', muted ? 'MUTED' : 'open', null, !muted],
      ['fader', 'FADER', fmtDb(faderDb(p[k + 'fader'])), L && L.post, !muted],
      ['pan', 'PAN', Math.abs(p[k + 'pan']) < 0.02 ? 'centre' : Math.round(Math.abs(p[k + 'pan']) * 100) + (p[k + 'pan'] < 0 ? ' L' : ' R'), L && Math.max(L.l, L.r), !muted],
    ];
    const top = 30, bh = 44, gap = 9;
    const bw = Math.min(70, (w - 24 - 90 - gap * blocks.length) / blocks.length);
    const x0 = 12;
    const xs = blocks.map((_, i) => x0 + i * (bw + gap));
    const busX = xs[xs.length - 1] + bw + gap + 6, busW = w - busX - 12;
    const box = (x, y, bw2, bh2, title, setting, active, hot, warn) => {
      ctx.fillStyle = hot ? 'rgba(255, 181, 71, 0.18)' : active ? 'rgba(141, 255, 176, 0.07)' : 'rgba(0,0,0,0)';
      ctx.fillRect(x, y, bw2, bh2);
      ctx.strokeStyle = warn ? RED : hot ? AMBER : active ? 'rgba(141, 255, 176, 0.55)' : DARK;
      ctx.lineWidth = hot ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, bw2 - 1, bh2 - 1);
      label(ctx, title, x + bw2 / 2, y + 16, active ? INK : DIM, 'center', 9.5, 700);
      label(ctx, setting, x + bw2 / 2, y + 31, warn ? RED : active ? AMBER : DIM, 'center', 9.5, 600);
    };
    const arrow = (x1, y1, x2, y2, on, dashed = false) => {
      ctx.strokeStyle = on ? 'rgba(141, 255, 176, 0.75)' : DARK;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dashed ? [4, 4] : []);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      const a = Math.atan2(y2 - y1, x2 - x1);
      ctx.fillStyle = on ? 'rgba(141, 255, 176, 0.9)' : DARK;
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 6 * Math.cos(a - 0.45), y2 - 6 * Math.sin(a - 0.45)); ctx.lineTo(x2 - 6 * Math.cos(a + 0.45), y2 - 6 * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
    };
    // signal present up to where? (muted: dark after the mute; no 48 V: dark from the start)
    let alive = !needs48;
    blocks.forEach(([id, title, setting, level, active], i) => {
      if (id === 'mute' && muted) alive = false;
      const hot = this.glow(id) > 0;
      const warn = (id === 'in' && needs48) || (id === 'pre' && L && L.clip) || (id === 'mute' && muted);
      box(xs[i], top, bw, bh, title, setting, active && alive, hot, warn);
      if (i > 0) arrow(xs[i - 1] + bw, top + bh / 2, xs[i] - 1, top + bh / 2, alive);
      if (level !== null && level !== undefined) {
        label(ctx, fmtLevel(level), xs[i] + bw / 2, top + bh + 13, levelColour(level), 'center', 10, 700);
      }
    });
    // routing to the main bus
    arrow(xs[xs.length - 1] + bw, top + bh / 2, busX - 1, top + bh / 2, alive && routed, !routed);
    box(busX, top, busW, bh, 'MAIN BUS', routed ? 'L-R on' : 'not routed', routed, this.glow('bus') > 0, !routed);
    label(ctx, 'level', x0 - 2, top + bh + 13, DIM, 'left', 0.1); // (spacer)

    // the aux taps: Aux 1 after the EQ (before mute/fader), Aux 2 after the fader
    const tapY = top + bh + 24, auxY = tapY + 24, auxH = 38;
    const a1 = sendDb(p[k + 'aux1']), a2 = sendDb(p[k + 'aux2']);
    const tap = (x, on, text, hot) => {
      ctx.fillStyle = on ? AMBER : DARK;
      ctx.beginPath(); ctx.arc(x, top + bh / 2, 3.5, 0, Math.PI * 2); ctx.fill();
      arrow(x, top + bh / 2 + 4, x, auxY - 1, on);
      label(ctx, text, x + 5, tapY + 6, hot ? AMBER : on ? INK : DIM, 'left', 9, 700);
    };
    const xA1 = (xs[3] + bw + xs[4]) / 2, xA2 = (xs[5] + bw + xs[6]) / 2;
    tap(xA1, alive || !muted ? Number.isFinite(a1) && !needs48 && !muted : false, 'pre-fader', this.glow('aux1') > 0);
    tap(xA2, alive && Number.isFinite(a2), 'post-fader', this.glow('aux2') > 0);

    // master row: Aux 1 -> its master; Aux 2 -> reverb -> return -> main bus; main bus -> comp -> fader -> out
    const mx = (frac) => 12 + frac * (w - 24);
    const aw = Math.min(96, (w - 24) / 6.4);
    const a1on = Number.isFinite(a1) && !needs48 && !muted;
    box(xA1 - aw / 2, auxY, aw, auxH, 'AUX 1', 'send ' + fmtDb(a1), a1on, this.glow('aux1') > 0 || this.glow('aux1m') > 0);
    if (live) label(ctx, fmtLevel(live.aux1), xA1, auxY + auxH + 12, levelColour(live.aux1), 'center', 10, 700);
    const a2on = Number.isFinite(a2) && alive;
    box(xA2 - aw / 2, auxY, aw, auxH, 'AUX 2', 'send ' + fmtDb(a2), a2on, this.glow('aux2') > 0 || this.glow('aux2m') > 0);
    if (live) label(ctx, fmtLevel(live.aux2), xA2, auxY + auxH + 12, levelColour(live.aux2), 'center', 10, 700);
    // reverb, returning to the main bus
    const revX = xA2 + aw / 2 + 14, revW = Math.min(aw, busX + busW - revX);
    const retOn = Number.isFinite(sendDb(p['rev.ret']));
    arrow(xA2 + aw / 2, auxY + auxH / 2, revX - 1, auxY + auxH / 2, a2on);
    box(revX, auxY, revW, auxH, 'REVERB', p['rev.time'].toFixed(1) + ' s', retOn, this.glow('rev') > 0);
    arrow(revX + revW / 2, auxY - 1, revX + revW / 2, top + bh + 1, retOn && live && live.ret > -70);
    label(ctx, 'return', revX + revW / 2 + 5, tapY + 6, DIM, 'left', 9);

    // the master chain along the bottom
    const by = auxY + auxH + 26, bh2 = Math.min(44, Math.max(34, h - by - 26));
    const chain = [
      ['comp', 'BUS COMP', p['bc.on'] === 'on' ? (live && live.gr > 0.1 ? '−' + live.gr.toFixed(1) + ' dB' : 'in') : 'out', p['bc.on'] === 'on'],
      ['mainf', 'MAIN FADER', fmtDb(faderDb(p['main.fader'])), true],
      ['mon', 'MONITOR', anySolo ? 'SOLO' : { main: 'Main', aux1: 'Aux 1', aux2: 'Aux 2' }[p['mon.src']], true],
    ];
    const cw = Math.min(110, (w - 24 - 40) / 4);
    const cx0 = mx(0.30);
    label(ctx, 'MAIN BUS →', cx0 - 10, by + bh2 / 2 + 4, INK, 'right', 9.5, 700);
    chain.forEach(([id, title, setting, on], i) => {
      const x = cx0 + i * (cw + 14);
      box(x, by, cw, bh2, title, setting, on, this.glow(id) > 0, id === 'mon' && anySolo);
      if (i > 0) arrow(x - 14, by + bh2 / 2, x - 1, by + bh2 / 2, true);
    });
    if (live) {
      const lv = Math.max(live.mainL, live.mainR);
      label(ctx, 'main ' + fmtLevel(lv), cx0 + (cw + 14) + cw / 2, by + bh2 + 13, levelColour(lv), 'center', 10, 700);
      label(ctx, 'you hear ' + fmtLevel(live.mon), cx0 + 2 * (cw + 14) + cw / 2, by + bh2 + 13, levelColour(live.mon), 'center', 10, 700);
    }
    if (anySolo) label(ctx, 'SOLO: you are hearing the soloed channels before their faders (PFL). The main mix is unchanged.', w / 2, h - 4, RED, 'center', 9.5, 700);
    else if (!live || !live.playing) label(ctx, 'Press Play in the Song section', w / 2, h - 4, DIM, 'center', 10, 700);
  }

  // ---- right: the EQ curve, and the bus compressor's gain reduction ----
  drawEq(ctx, w, h, p, live) {
    ctx.fillStyle = '#050c07';
    ctx.fillRect(0, 0, w, h);
    const n = this.sel + 1, k = `ch${n}.`;
    const grH = 56;
    const l = 34, r = w - 10, t = 26, b = h - grH - 26;
    const F0 = 20, F1 = 20000, DB = 18;
    const xOf = (f) => l + Math.log(f / F0) / Math.log(F1 / F0) * (r - l);
    const yOf = (d) => t + (DB - Math.max(-DB, Math.min(DB, d))) / (2 * DB) * (b - t);
    label(ctx, `EQ · CHANNEL ${n}: ${SONG_STEMS[this.sel].label.toUpperCase()}`, l, 15, INK, 'left', 10.5, 700);
    const eqOn = p[k + 'eq'] !== 'off', hpOn = p[k + 'hpf'] > 25;
    label(ctx, `EQ ${eqOn ? 'in' : 'out (bypassed)'} · HPF ${hpOn ? Math.round(p[k + 'hpf']) + ' Hz' : 'off'}`, r, 15, eqOn ? AMBER : DIM, 'right', 9.5, 700);

    // grid
    ctx.lineWidth = 1;
    [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach((f) => {
      const x = Math.round(xOf(f)) + 0.5;
      ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(x, t); ctx.lineTo(x, b); ctx.stroke();
      label(ctx, f >= 1000 ? f / 1000 + 'k' : String(f), x, b + 11, DIM, 'center', 8.5);
    });
    [-18, -12, -6, 0, 6, 12, 18].forEach((d) => {
      const y = Math.round(yOf(d)) + 0.5;
      ctx.strokeStyle = d === 0 ? 'rgba(120, 255, 170, 0.3)' : GRID; ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(r, y); ctx.stroke();
      label(ctx, (d > 0 ? '+' : '') + d, l - 5, y + 3, DIM, 'right', 8.5);
    });

    // the curve: HPF always (it has its own switch, the knob), EQ bands only while EQ is in
    const filters = [];
    if (hpOn) filters.push(biquad('hp', p[k + 'hpf'], 0.707, 0, SR));
    if (eqOn) {
      filters.push(biquad('low', EQ_LOW, 0.707, p[k + 'lf'], SR));
      filters.push(biquad('peak', p[k + 'mf'], EQ_MID_Q, p[k + 'mg'], SR));
      filters.push(biquad('high', EQ_HIGH, 0.707, p[k + 'hf'], SR));
    }
    const resp = (f) => filters.reduce((s, c) => s + biquadDb(c, f, SR), 0);
    ctx.beginPath();
    for (let x = l; x <= r; x += 2) {
      const f = F0 * Math.pow(F1 / F0, (x - l) / (r - l));
      const y = yOf(resp(f));
      x === l ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    const path = new Path2D();
    ctx.save();
    ctx.strokeStyle = AMBER; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.lineTo(r, yOf(0)); ctx.lineTo(l, yOf(0)); ctx.closePath();
    ctx.fillStyle = 'rgba(255, 181, 71, 0.12)'; ctx.fill();
    ctx.restore();
    void path;
    // band handles
    const hot = this.hot === 'eq' || this.hot === 'hpf' ? Math.max(this.glow('eq'), this.glow('hpf')) : 0;
    const dot = (f, g, text, on) => {
      const x = xOf(f), y = yOf(g);
      ctx.fillStyle = on ? (hot ? '#fff' : AMBER) : DARK;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      label(ctx, text, x, y - 8, on ? INK : DIM, 'center', 8.5, 700);
    };
    dot(EQ_LOW, eqOn ? resp(EQ_LOW) : 0, 'LOW', eqOn);
    dot(p[k + 'mf'], eqOn ? resp(p[k + 'mf']) : 0, 'MID', eqOn);
    dot(EQ_HIGH, eqOn ? resp(EQ_HIGH) : 0, 'HIGH', eqOn);
    if (hpOn) dot(p[k + 'hpf'], resp(p[k + 'hpf']), 'HPF', true);

    // bus compressor: gain reduction over the last few seconds
    const gy = h - grH, gl = l, gr = r;
    const on = p['bc.on'] === 'on';
    label(ctx, `BUS COMP · ${on ? 'in' : 'out (bypassed: not applied)'}`, gl, gy - 4, on ? INK : DIM, 'left', 9.5, 700);
    const g = live ? live.gr : 0;
    label(ctx, g > 0.1 ? 'reducing −' + g.toFixed(1) + ' dB' : '0 dB', gr, gy - 4, RED, 'right', 10, 700);
    ctx.strokeStyle = GRID;
    ctx.strokeRect(gl + 0.5, gy + 2.5, gr - gl - 1, grH - 8);
    const N = this.grHist.length, bw = (gr - gl) / N;
    ctx.fillStyle = on ? 'rgba(255, 90, 74, 0.85)' : 'rgba(255, 90, 74, 0.3)';
    for (let i = 0; i < N && i < this.grN; i++) {
      const v = this.grHist[(this.grN - 1 - i + N * 4) % N];
      const hh = Math.min(1, v / 12) * (grH - 10);
      if (hh > 0.3) ctx.fillRect(gr - (i + 1) * bw, gy + 3, Math.max(1, bw), hh);
    }
    label(ctx, '0', gl - 5, gy + 10, DIM, 'right', 8.5);
    label(ctx, '−12', gl - 5, h - 6, DIM, 'right', 8.5);
  }
}
