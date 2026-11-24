// A console fader: a cap sliding in a vertical slot, with a dB scale beside it (0 dB, unity,
// three quarters of the way up). The value is the fader's position, 0..1; consoleMath.js turns
// it into dB. Same interface as Knob: .el, .set(value), .commit(value).

import { PARAMS, formatValue } from './params.js';
import { faderPos } from './consoleMath.js';

const MARKS = [[10, '+10'], [5, '+5'], [0, '0'], [-5, '5'], [-10, '10'], [-20, '20'], [-30, '30'], [-40, '40'], [-60, '60']];

export class Fader {
  constructor(id, value, onChange) {
    this.id = id;
    this.spec = PARAMS[id];
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'fader-cell';
    this.el.dataset.param = id;
    this.el.dataset.help = id;
    this.el.innerHTML = `
      <div class="fader-body">
        <div class="fader-scale">${MARKS.map(([d, t]) => `<span style="bottom:${(faderPos(d) * 100).toFixed(2)}%"${d === 0 ? ' class="unity"' : ''}>${t}</span>`).join('')}<span style="bottom:0">∞</span></div>
        <div class="fader-slot" role="slider" tabindex="0" aria-label="${this.spec.label}"><div class="fader-cap"><i></i></div></div>
      </div>
      <div class="fader-value"></div>`;
    this.slot = this.el.querySelector('.fader-slot');
    this.cap = this.el.querySelector('.fader-cap');
    this.readout = this.el.querySelector('.fader-value');
    this.bind();
    this.set(value);
  }

  set(value) {
    this.value = Math.min(1, Math.max(0, value));
    this.cap.style.bottom = `calc(${(this.value * 100).toFixed(3)}% - 11px)`;
    const text = formatValue(this.id, this.value);
    this.readout.textContent = text;
    this.slot.setAttribute('aria-valuetext', text);
  }

  commit(value) {
    value = Math.min(1, Math.max(0, value));
    if (value === this.value) return;
    this.set(value);
    this.onChange(this.id, this.value);
  }

  bind() {
    const s = this.slot;
    let startY = 0, startV = 0, dragging = false, lastTap = 0;
    s.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (e.pointerType === 'touch') { // double tap: back to unity
        const now = performance.now();
        if (now - lastTap < 300) { this.commit(this.spec.def); lastTap = 0; return; }
        lastTap = now;
      }
      s.focus();
      try { s.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      // a press on the slot away from the cap moves the fader there; on the cap, it is grabbed
      const r = s.getBoundingClientRect();
      const scale = r.height / s.offsetHeight || 1; // the stage may be scaled
      if (!e.target.closest('.fader-cap')) this.commit(1 - (e.clientY - r.top) / r.height);
      dragging = true;
      startY = e.clientY; startV = this.value; this.scale = scale;
      this.el.classList.add('active');
      document.body.classList.add('knob-dragging');
    });
    s.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const travel = s.offsetHeight * this.scale * (e.shiftKey ? 4 : 1);
      this.commit(startV + (startY - e.clientY) / travel);
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      this.el.classList.remove('active');
      document.body.classList.remove('knob-dragging');
    };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('dblclick', () => this.commit(this.spec.def));
    s.addEventListener('wheel', (e) => { e.preventDefault(); this.commit(this.value + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.002 : 0.01)); }, { passive: false });
    s.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.002 : 0.01;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { this.commit(this.value + step); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { this.commit(this.value - step); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'Home') { this.commit(0); e.preventDefault(); }
      else if (e.key === 'End') { this.commit(1); e.preventDefault(); }
    });
  }
}
