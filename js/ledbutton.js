// A small square push button with a light, for on/off settings that need to be compact
// (the sequencer's step on/off buttons). Behaves like a control: set() and commit().

import { PARAMS } from './params.js';

export class LedButton {
  constructor(id, value, onChange) {
    this.id = id;
    this.spec = PARAMS[id];
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'led-cell';
    this.el.dataset.param = id;
    this.el.dataset.help = id;
    this.btn = document.createElement('button');
    this.btn.className = 'led-btn';
    this.btn.setAttribute('aria-label', this.spec.label);
    this.btn.innerHTML = '<span class="led-lamp"></span>';
    this.btn.addEventListener('click', () => this.commit(this.value === 'on' ? 'off' : 'on'));
    this.el.appendChild(this.btn);
    this.set(value);
  }

  set(value) {
    this.value = value;
    this.btn.classList.toggle('on', value === 'on');
    this.btn.setAttribute('aria-pressed', String(value === 'on'));
  }

  commit(value) {
    if (value === this.value) return;
    this.set(value);
    this.onChange(this.id, value);
  }
}
