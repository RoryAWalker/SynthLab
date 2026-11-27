// The NF-ModRack's XY module: the pad. Behaves like a control for its recording (the 'path' setting:
// set / commit), and moves the module's other settings as you play it: x and y (where the puck is),
// touch (a finger on the pad), mode (Live / Loop / Once) and size (1 or 2 rows tall).
//
//   Drag on the pad: X and Y follow (always, in any mode: a finger takes over from a recording).
//   Rec: the next movement is recorded (up to 30 s), then plays back in Loop.
//   Clear: forget the recording.   Size: 1 or 2 rows tall.

import { PARAMS } from './params.js';

const RATE = 50;                  // recorded points a second
const MAX_SECONDS = 30;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class XYPad {
  // getPatch(), live() (the engine's latest report, for playback): set by main.js
  static getPatch = () => ({});
  static live = () => null;

  constructor(id, value, onChange) {
    this.id = id;
    this.inst = id.split('.')[0];
    this.spec = PARAMS[id];
    this.onChange = onChange;
    const p = XYPad.getPatch();
    this.tall = p[`${this.inst}.size`] === '2';
    this.S = this.tall ? 270 : 112; // the pad's size (panel pixels): larger at two rows tall
    this.el = document.createElement('div');
    this.el.className = 'xy-cell' + (this.tall ? ' tall' : '');
    this.el.dataset.param = id;
    this.el.innerHTML = `
      <div class="ne-bar xy-bar" style="min-width:${this.S}px">
        <button class="ne-btn xy-rec" title="Record your next movement on the pad">● Rec</button>
        <button class="ne-btn xy-clear" title="Forget the recording">Clear</button>
        <button class="ne-btn xy-size" data-help="xysize" title="One or two rows tall">${this.tall ? '2 rows' : '1 row'}</button>
      </div>
      <canvas class="xy-screen" data-help="${id}"></canvas>`;
    this.cv = this.el.querySelector('canvas');
    this.cv.style.width = this.cv.style.height = this.S + 'px';
    this.recBtn = this.el.querySelector('.xy-rec');
    this.recBtn.addEventListener('click', (e) => { e.stopPropagation(); this.armed = !this.armed; this.recBtn.classList.toggle('armed', this.armed); this.draw(); });
    this.el.querySelector('.xy-clear').addEventListener('click', (e) => { e.stopPropagation(); this.commit(''); if (XYPad.getPatch()[`${this.inst}.mode`] !== 'live') this.onChange(`${this.inst}.mode`, 'live'); });
    this.el.querySelector('.xy-size').addEventListener('click', (e) => { e.stopPropagation(); this.onChange(`${this.inst}.size`, this.tall ? '1' : '2'); });
    this.cv.addEventListener('pointerdown', (e) => this.down(e));
    this.cv.addEventListener('pointermove', (e) => this.move(e));
    this.cv.addEventListener('pointerup', () => this.up());
    this.cv.addEventListener('pointercancel', () => this.up());
    this.set(value);
    this.loop();
  }

  set(value) { this.value = value || ''; this.pts = this.parse(this.value); this.draw(); }
  commit(value) { if (value === this.value) return; this.set(value); this.onChange(this.id, value); }
  parse(str) {
    if (!str) return null;
    const parts = str.split(';');
    parts.shift();
    const pts = parts.map((q) => q.split(',').map(Number));
    return pts.length > 1 ? pts : null;
  }

  at(e) {
    const r = this.cv.getBoundingClientRect();
    return [clamp01((e.clientX - r.left) / r.width), clamp01(1 - (e.clientY - r.top) / r.height)];
  }
  send(x, y) {
    this.pos = [x, y];
    this.onChange(`${this.inst}.x`, x);
    this.onChange(`${this.inst}.y`, y);
  }

  down(e) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    try { this.cv.setPointerCapture(e.pointerId); } catch { /* (a pointer that cannot be captured: carry on) */ }
    document.body.classList.add('knob-dragging');
    this.held = true;
    const [x, y] = this.at(e);
    this.send(x, y);
    this.onChange(`${this.inst}.touch`, 1);
    if (this.armed) { // record: the puck's place, 50 times a second, until the finger lifts
      this.rec = [[x, y]];
      this.recTimer = setInterval(() => {
        this.rec.push(this.pos.slice());
        if (this.rec.length >= RATE * MAX_SECONDS) this.up();
      }, 1000 / RATE);
    }
    this.draw();
  }

  move(e) {
    if (!this.held) return;
    const [x, y] = this.at(e);
    this.send(x, y);
    this.draw();
  }

  up() {
    if (!this.held) return;
    this.held = false;
    document.body.classList.remove('knob-dragging');
    this.onChange(`${this.inst}.touch`, 0);
    if (this.recTimer) {
      clearInterval(this.recTimer);
      this.recTimer = null;
      const pts = this.rec;
      this.rec = null;
      this.armed = false;
      this.recBtn.classList.remove('armed');
      if (pts.length > 2) {
        const r = (v) => Math.round(v * 1000) / 1000;
        this.commit(`${(pts.length - 1) / RATE};` + pts.map(([x, y]) => `${r(x)},${r(y)}`).join(';'));
        this.onChange(`${this.inst}.mode`, 'loop'); // play it back
      }
    }
    this.draw();
  }

  loop() {
    const tick = () => {
      if (!this.el.isConnected && this.started) return;
      this.started = true;
      const l = XYPad.live(), v = l && l.xys ? l.xys[this.inst] : null;
      const key = v ? v[0].toFixed(3) + v[1].toFixed(3) : '';
      if (key !== this.lastKey) { this.lastKey = key; this.draw(); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  draw() {
    const S = this.S, k = 2, cv = this.cv;
    if (cv.width !== S * k) { cv.width = cv.height = S * k; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#06100a';
    ctx.fillRect(0, 0, S, S);
    // a grid of quarters, and the centre lines
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.strokeStyle = i === 2 ? 'rgba(120, 220, 160, 0.18)' : 'rgba(120, 220, 160, 0.08)';
      const q = Math.round((i / 4) * S) + 0.5;
      ctx.beginPath(); ctx.moveTo(q, 0); ctx.lineTo(q, S); ctx.moveTo(0, q); ctx.lineTo(S, q); ctx.stroke();
    }
    const P = ([x, y]) => [x * S, (1 - y) * S];
    // the recording (or the one being made)
    const path = this.rec || this.pts;
    if (path && path.length > 1) {
      ctx.strokeStyle = this.rec ? 'rgba(255, 90, 80, 0.8)' : 'rgba(255, 181, 71, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      path.forEach((q, i) => { const [a, b] = P(q); if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
      ctx.stroke();
    }
    // the puck: under the finger, else where the engine has it (a recording playing), else the setting
    const p = XYPad.getPatch(), l = XYPad.live(), v = l && l.xys ? l.xys[this.inst] : null;
    const at = this.held ? this.pos : v ? [v[0], v[1]] : [p[`${this.inst}.x`] ?? 0.5, p[`${this.inst}.y`] ?? 0.5];
    const [cx, cy] = P(at);
    ctx.strokeStyle = 'rgba(255, 181, 71, 0.35)';
    ctx.beginPath(); ctx.moveTo(cx + 0.5, 0); ctx.lineTo(cx + 0.5, S); ctx.moveTo(0, cy + 0.5); ctx.lineTo(S, cy + 0.5); ctx.stroke();
    ctx.save();
    ctx.fillStyle = this.held ? '#fff' : '#ffb547';
    ctx.shadowColor = 'rgba(255, 220, 150, 1)';
    ctx.shadowBlur = this.held ? 14 : 8;
    ctx.beginPath(); ctx.arc(cx, cy, this.tall ? 7 : 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.font = '700 9px "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = 'rgba(120, 220, 160, 0.5)';
    ctx.textAlign = 'right'; ctx.fillText('X →', S - 4, S - 4);
    ctx.textAlign = 'left'; ctx.fillText('Y ↑', 4, 11);
    if (this.armed && !this.rec) {
      ctx.fillStyle = 'rgba(255, 90, 80, 0.9)';
      ctx.font = '700 10px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MOVE ON THE PAD TO RECORD', S / 2, S / 2 - 8);
    }
  }
}
