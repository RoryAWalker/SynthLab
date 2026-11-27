// A word in a module's title that is also a switch: click it to change to the other option
// (the NF-Modular's envelopes: Exponential / Linear). Behaves like a control: set() and commit().

import { PARAMS } from './params.js';

export class WordSwitch {
  constructor(id, value, onChange) {
    this.id = id;
    this.spec = PARAMS[id];
    this.onChange = onChange;
    this.el = document.createElement('button');
    this.el.className = 'word-switch';
    this.el.dataset.param = id;
    this.el.dataset.help = id;
    this.el.addEventListener('click', (e) => { e.stopPropagation(); this.commit(this.other().v); });
    this.set(value);
  }

  other() {
    const o = this.spec.options;
    return o[(o.findIndex((x) => x.v === this.value) + 1) % o.length];
  }

  set(value) {
    this.value = value;
    const now = this.spec.options.find((o) => o.v === value) || this.spec.options[0];
    this.el.textContent = now.label;
    this.el.setAttribute('aria-label', `${this.spec.label}: ${now.label}. Click for ${this.other().label}`);
  }

  commit(value) {
    if (value === this.value) return;
    this.set(value);
    this.onChange(this.id, value);
  }
}
