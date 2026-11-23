import { PARAMS } from './params.js';

// Two-position lever switch for two-option params (e.g. Mono / Legato).
// Same interface as Knob: .el, .set(value), .commit(value).
export class Toggle {
  constructor(id, value, onChange) {
    this.id = id;
    this.spec = PARAMS[id];
    this.onChange = onChange;
    const [a, b] = this.spec.options;

    this.el = document.createElement('div');
    this.el.className = 'toggle-cell';
    this.el.dataset.param = id;
    this.el.title = this.spec.help || '';
    this.el.innerHTML = `
      <button class="toggle-label" data-v="${a.v}">${a.label}</button>
      <button class="toggle" role="switch" aria-label="${this.spec.label}"><span class="toggle-lever"></span></button>
      <button class="toggle-label" data-v="${b.v}">${b.label}</button>`;

    this.sw = this.el.querySelector('.toggle');
    this.sw.addEventListener('click', () => this.commit(this.value === a.v ? b.v : a.v));
    this.el.querySelectorAll('.toggle-label').forEach((l) =>
      l.addEventListener('click', () => this.commit(this.spec.options.find((o) => String(o.v) === l.dataset.v).v)));
    this.set(value);
  }

  set(value) {
    this.value = value;
    const second = value === this.spec.options[1].v;
    this.sw.classList.toggle('right', second);
    this.sw.setAttribute('aria-checked', String(second));
    this.el.querySelectorAll('.toggle-label').forEach((l) => l.classList.toggle('on', l.dataset.v === String(value)));
  }

  commit(value) {
    if (value === this.value) return;
    this.set(value);
    this.onChange(this.id, value);
  }
}
