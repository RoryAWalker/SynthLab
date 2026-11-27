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
    // the two options: [off, on] (e.g. off/on, stop/run)
    [this.offV, this.onV] = this.spec.options.map((o) => o.v);
    this.btn.innerHTML = '<span class="led-lamp"></span>' + (this.spec.button ? `<span class="led-word">${this.spec.button}</span>` : '');
    if (this.spec.button) this.el.classList.add('wide');
    this.btn.addEventListener('click', () => this.commit(this.value === this.onV ? this.offV : this.onV));
    this.el.appendChild(this.btn);
    this.set(value);
  }

  set(value) {
    this.value = value;
    this.btn.classList.toggle('on', value === this.onV);
    this.btn.setAttribute('aria-pressed', String(value === this.onV));
  }

  commit(value) {
    if (value === this.value) return;
    this.set(value);
    this.onChange(this.id, value);
  }
}
