// The NF-ModRack's Probe: its screen, a small oscilloscope. A in amber, B in blue. Short Times (up
// to 0.1 s) show a steady picture, each one starting where A rises through 0; longer ones scroll past
// from right to left. The engine sends 200 columns of (lowest, highest) for each (modrack-processor.js).

import { PARAMS } from './params.js';

const W = 300, H = 178, COLS = 200;

export class ProbeScreen {
  static live = () => null;    // the engine's latest report: set by main.js
  static getPatch = () => ({});

  constructor(id) {
    this.id = id;
    this.inst = id.split('.')[0];
    this.spec = PARAMS[id];
    this.el = document.createElement('div');
    this.el.className = 'probe-cell';
    this.el.dataset.param = id;
    this.el.innerHTML = `<canvas class="ne-screen probe-screen" data-help="${this.inst}.view"></canvas>`;
    this.cv = this.el.querySelector('canvas');
    this.cv.style.width = W + 'px';
    this.cv.style.height = H + 'px';
    this.cols = [];
    this.loop();
  }
  set() {}
  commit() {}

  loop() {
    let last = null;
    const tick = () => {
      if (!this.el.isConnected && this.started) return;
      this.started = true;
      const l = ProbeScreen.live(), r = l && l.probes ? l.probes[this.inst] : null;
      if (r && l !== last) {
        last = l;
        if (r.roll) { this.cols.push(...r.cols); if (this.cols.length > COLS) this.cols.splice(0, this.cols.length - COLS); this.roll = true; }
        else if (r.frame) { this.cols = r.frame; this.roll = false; }
      }
      this.draw(!!l);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  draw(running) {
    const cv = this.cv, k = 2;
    if (cv.width !== W * k) { cv.width = W * k; cv.height = H * k; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#06100a';
    ctx.fillRect(0, 0, W, H);
    const p = ProbeScreen.getPatch(), scale = p[`${this.inst}.scale`] || 1, T = p[`${this.inst}.time`] || 0.02;
    // grid: 10 across, 8 down; the 0 line brighter
    for (let i = 1; i < 10; i++) { ctx.strokeStyle = 'rgba(120, 220, 160, 0.08)'; const x = Math.round((i / 10) * W) + 0.5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let i = 1; i < 8; i++) { ctx.strokeStyle = i === 4 ? 'rgba(120, 220, 160, 0.22)' : 'rgba(120, 220, 160, 0.08)'; const y = Math.round((i / 8) * H) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const yOf = (v) => H / 2 - Math.max(-1.05, Math.min(1.05, v / scale)) * (H / 2 - 4);
    const trace = (lo, hi, colour) => {
      const n = this.cols.length;
      if (!n) return;
      const x0 = this.roll ? W - (n / COLS) * W : 0; // (a scrolling trace fills in from the right)
      ctx.strokeStyle = colour; ctx.lineWidth = 1.6;
      ctx.beginPath();
      this.cols.forEach((c, i) => {
        if (!(c[lo] === c[lo])) return; // (nothing in B)
        const x = x0 + ((i + 0.5) / COLS) * W, a = yOf(c[hi]), b = yOf(c[lo]);
        if (i === 0) ctx.moveTo(x, a); else ctx.lineTo(x, a);
        if (b - a > 1.5) ctx.lineTo(x, b); // (a column with a range: drawn as a line top to bottom)
      });
      ctx.stroke();
    };
    trace(2, 3, 'rgba(140, 200, 255, 0.95)');
    trace(0, 1, '#ffb547');
    // what it shows
    ctx.font = '700 9.5px "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = 'rgba(120, 220, 160, 0.7)';
    ctx.textAlign = 'left'; ctx.fillText(`+${scale}`, 4, 11); ctx.fillText(`−${scale}`, 4, H - 4);
    ctx.textAlign = 'right';
    ctx.fillText(`${T < 1 ? Math.round(T * 1000) + ' ms' : T.toFixed(1) + ' s'} across${T >= 0.1 ? ' · scrolling' : ''}`, W - 4, H - 4);
    if (this.cols.length) {
      let lo = Infinity, hi = -Infinity;
      this.cols.forEach((c) => { if (c[0] < lo) lo = c[0]; if (c[1] > hi) hi = c[1]; });
      ctx.fillStyle = 'rgba(255, 181, 71, 0.85)';
      ctx.fillText(`A ${lo.toFixed(2)} … ${hi.toFixed(2)}`, W - 4, 11);
    } else if (!running) {
      ctx.fillStyle = 'rgba(120, 220, 160, 0.6)'; ctx.textAlign = 'center';
      ctx.fillText('play a note to start the sound', W / 2, H / 2 - 8);
    }
  }
}
