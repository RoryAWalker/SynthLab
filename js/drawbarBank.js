// The NF-ModRack's Drawbars: the bank of nine drawbars, each with a tuning box above it.
//   Drag a bar down to pull it out (0-8, in whole steps, as on an organ), up to push it in.
//   Drag a tuning box up or down to retune that bar (up to +-12 semitones; hold Shift for fine);
//   double-click it to put it back in tune (double-click a bar to push it in).
// One control on the panel for eighteen settings (organ<n>.d1-d9 and t1-t9): it reads them from the
// patch whenever it is told to (set) and changes them through onChange, like any control.

import { PARAMS } from './params.js';
import { FOOTAGES } from './synths/modrack.js';

const BAR_H = 142; // the bars' travel, in panel pixels

export class DrawbarBank {
  static getPatch = () => ({}); // set by main.js

  constructor(id, value, onChange) {
    this.id = id;
    this.inst = id.split('.')[0];
    this.spec = PARAMS[id];
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'drawbar-bank';
    this.el.dataset.param = id;
    this.cols = FOOTAGES.map(([ft, , colour], i) => {
      const n = i + 1, col = document.createElement('div');
      col.className = 'db-col';
      col.innerHTML = `<div class="db-tune" data-help="${this.inst}.t${n}" title="Drag to retune; double-click to put back in tune"></div>
        <div class="db-track" data-help="${this.inst}.d${n}"><div class="db-bar ${colour}"><span class="db-cap"></span></div></div>
        <div class="db-ft">${ft}</div>`;
      this.el.appendChild(col);
      const tune = col.querySelector('.db-tune'), track = col.querySelector('.db-track');
      this.dragBar(track, n);
      this.dragTune(tune, n);
      return { tune, bar: col.querySelector('.db-bar'), cap: col.querySelector('.db-cap') };
    });
    this.set(value);
  }

  get(k) { return DrawbarBank.getPatch()[`${this.inst}.${k}`]; }
  change(k, v) {
    const id = `${this.inst}.${k}`;
    if (DrawbarBank.getPatch()[id] === v) return;
    this.onChange(id, v);
    this.set();
  }

  // a bar: where the pointer is down the track is how far it is pulled out
  dragBar(track, n) {
    const at = (e) => { const r = track.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * 8); };
    track.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      try { track.setPointerCapture(e.pointerId); } catch { /* (cannot capture: carry on) */ }
      document.body.classList.add('knob-dragging');
      this.change(`d${n}`, at(e));
      const move = (ev) => this.change(`d${n}`, at(ev));
      const up = () => { track.removeEventListener('pointermove', move); document.body.classList.remove('knob-dragging'); };
      track.addEventListener('pointermove', move);
      track.addEventListener('pointerup', up, { once: true });
      track.addEventListener('pointercancel', up, { once: true });
    });
    track.addEventListener('dblclick', () => this.change(`d${n}`, 0));
  }

  // a tuning box: up raises it, down lowers it (0.05 semitone a pixel; with Shift, 0.01)
  dragTune(box, n) {
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      try { box.setPointerCapture(e.pointerId); } catch { /* (cannot capture: carry on) */ }
      document.body.classList.add('knob-dragging');
      const y0 = e.clientY, v0 = this.get(`t${n}`) || 0;
      const move = (ev) => {
        const step = ev.shiftKey ? 0.01 : 0.05;
        let v = v0 + (y0 - ev.clientY) * step;
        v = Math.max(-12, Math.min(12, Math.round(v * 100) / 100));
        if (Math.abs(v - Math.round(v)) < 0.04 && !ev.shiftKey) v = Math.round(v); // (whole semitones catch)
        this.change(`t${n}`, v);
      };
      const up = () => { box.removeEventListener('pointermove', move); document.body.classList.remove('knob-dragging'); };
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', up, { once: true });
      box.addEventListener('pointercancel', up, { once: true });
    });
    box.addEventListener('dblclick', () => this.change(`t${n}`, 0));
  }

  set() {
    this.cols.forEach((c, i) => {
      const n = i + 1, d = this.get(`d${n}`) || 0, t = this.get(`t${n}`) || 0;
      c.bar.style.height = `${18 + (d / 8) * (BAR_H - 18)}px`;
      c.cap.textContent = String(Math.round(d));
      c.tune.textContent = Math.abs(t) < 0.005 ? '0' : (t > 0 ? '+' : '−') + (Math.abs(t) >= 10 || Math.abs(t - Math.round(t)) < 0.005 ? Math.abs(t).toFixed(0) : Math.abs(t).toFixed(2));
      c.tune.classList.toggle('off', Math.abs(t) >= 0.005);
    });
  }
  commit() { this.set(); }
}
