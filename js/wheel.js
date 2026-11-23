import { PARAMS, formatValue } from './params.js';

// Pitch / modulation wheel: drag up and down. A spring wheel (pitch) returns to the
// centre when let go. Same interface as Knob: .el, .set(value), .commit(value).
export class Wheel {
  constructor(id, value, onChange) {
    this.id = id;
    this.spec = PARAMS[id];
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'wheel-cell';
    this.el.dataset.param = id;
    this.el.dataset.help = id;
    this.el.innerHTML = `
      <div class="wheel-label">${this.spec.label}</div>
      <div class="wheel-slot" tabindex="0" role="slider" aria-label="${this.spec.label} wheel">
        <div class="wheel-drum"></div><div class="wheel-mark"></div><div class="wheel-shade"></div>
      </div>
      <div class="knob-value wheel-value"></div>`;
    this.slot = this.el.querySelector('.wheel-slot');
    this.drum = this.el.querySelector('.wheel-drum');
    this.mark = this.el.querySelector('.wheel-mark');
    this.readout = this.el.querySelector('.wheel-value');
    this.bind();
    this.set(value);
  }

  set(v) {
    this.value = v;
    const { min, max } = this.spec;
    const n = (v - min) / (max - min);              // 0..1
    this.drum.style.backgroundPositionY = `${-n * 60}px`; // ridges roll as the wheel turns
    this.mark.style.top = `${(1 - n) * 82 + 6}%`;
    this.readout.textContent = formatValue(this.id, v);
    this.slot.setAttribute('aria-valuetext', this.readout.textContent);
  }

  commit(v) {
    v = Math.min(this.spec.max, Math.max(this.spec.min, v));
    if (v === this.value) return;
    this.set(v);
    this.onChange(this.id, v);
  }

  bind() {
    const s = this.slot;
    let startY = 0, startV = 0, dragging = false;
    const range = this.spec.max - this.spec.min;
    s.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      s.setPointerCapture(e.pointerId);
      dragging = true; startY = e.clientY; startV = this.value;
      document.body.classList.add('knob-dragging');
    });
    s.addEventListener('pointermove', (e) => {
      if (dragging) this.commit(startV + ((startY - e.clientY) / 110) * range);
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('knob-dragging');
      if (this.spec.spring) this.springBack();
    };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('keydown', (e) => {
      const step = range / 20;
      if (e.key === 'ArrowUp') { this.commit(this.value + step); e.preventDefault(); e.stopPropagation(); }
      if (e.key === 'ArrowDown') { this.commit(this.value - step); e.preventDefault(); e.stopPropagation(); }
    });
    s.addEventListener('keyup', (e) => { if (this.spec.spring && e.key.startsWith('Arrow')) this.springBack(); });
  }

  // glide back to the centre like a sprung wheel
  springBack() {
    const from = this.value, t0 = performance.now();
    const step = () => {
      const f = Math.min(1, (performance.now() - t0) / 140);
      this.commit(from * (1 - f) * (1 - f));
      if (f < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
