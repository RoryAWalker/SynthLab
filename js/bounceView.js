// The NF-ModRack's Bounce module: its screen. The ball, at its height, beside a trace of where it has
// been over the last few seconds (time running right to left), so each bounce and its height can be
// seen. It only shows the engine's report; it has no setting of its own to change.

import { PARAMS } from './params.js';

const W = 220, H = 116, BALL_X = 22, SECONDS = 3;

export class BounceView {
  static live = () => null; // the engine's latest report: set by main.js

  constructor(id) {
    this.id = id;
    this.inst = id.split('.')[0];
    this.spec = PARAMS[id];
    this.el = document.createElement('div');
    this.el.className = 'bounce-cell';
    this.el.dataset.param = id;
    this.el.innerHTML = `<canvas class="bounce-screen" data-help="${this.inst}.view"></canvas>`;
    this.cv = this.el.querySelector('canvas');
    this.cv.style.width = W + 'px';
    this.cv.style.height = H + 'px';
    this.trail = []; // [time, height]
    this.loop();
  }
  set() {}
  commit() {}

  loop() {
    const tick = () => {
      if (!this.el.isConnected && this.started) return;
      this.started = true;
      const l = BounceView.live(), h = l && l.bounces ? l.bounces[this.inst] : undefined;
      const now = performance.now() / 1000;
      if (h !== undefined) this.trail.push([now, h]);
      while (this.trail.length && this.trail[0][0] < now - SECONDS) this.trail.shift();
      this.draw(now, h);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  draw(now, h) {
    const cv = this.cv, k = 2;
    if (cv.width !== W * k) { cv.width = W * k; cv.height = H * k; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#06100a';
    ctx.fillRect(0, 0, W, H);
    const floor = H - 10, top = 10, yOf = (v) => floor - v * (floor - top);
    // the floor
    ctx.strokeStyle = 'rgba(120, 220, 160, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, floor + 5); ctx.lineTo(W, floor + 5); ctx.stroke();
    // where it has been: newest at the ball, older to the right
    if (this.trail.length > 1) {
      ctx.strokeStyle = 'rgba(255, 181, 71, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      this.trail.forEach(([t, v], i) => {
        const x = BALL_X + ((now - t) / SECONDS) * (W - BALL_X);
        if (i) ctx.lineTo(x, yOf(v)); else ctx.moveTo(x, yOf(v));
      });
      ctx.stroke();
    }
    // the ball
    const y = yOf(h || 0);
    ctx.save();
    ctx.fillStyle = h === undefined ? 'rgba(255, 181, 71, 0.4)' : '#fff0cf';
    ctx.shadowColor = 'rgba(255, 220, 150, 1)';
    ctx.shadowBlur = h === undefined ? 0 : 10;
    ctx.beginPath(); ctx.arc(BALL_X, y - 1, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
