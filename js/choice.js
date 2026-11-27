// A row of buttons, one per option, with the chosen one lit (the loop player's sounds: Drums,
// Bass, Keys...). For a stepped setting whose options read better as words than round a knob.
// Behaves like a control: set() and commit().

import { PARAMS } from './params.js';

export class Choice {
  constructor(id, value, onChange) {
    this.id = id;
    this.spec = PARAMS[id];
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'choice';
    this.el.dataset.param = id;
    this.el.dataset.help = id;
    this.el.setAttribute('role', 'radiogroup');
    this.el.setAttribute('aria-label', this.spec.label);
    this.buttons = this.spec.options.map((o) => {
      const b = document.createElement('button');
      b.className = 'choice-btn';
      b.textContent = o.label;
      b.dataset.v = o.v;
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => this.commit(o.v));
      this.el.appendChild(b);
      return b;
    });
    this.set(value);
  }

  set(value) {
    this.value = value;
    this.buttons.forEach((b) => {
      const on = b.dataset.v === value;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  commit(value) {
    if (value === this.value) return;
    this.set(value);
    this.onChange(this.id, value);
  }
}
