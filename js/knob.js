import { PARAMS, toNorm, fromNorm, formatValue, WAVE_ICONS } from './params.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const DIAL = 116;          // size of the scale area around the knob
const C = DIAL / 2;        // centre
const R_TICK_IN = 35, R_TICK_OUT = 40, R_LABEL = 48.5;

function svg(tag, attrs, parent) {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}

const polar = (r, deg) => {
  const a = (deg - 90) * Math.PI / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

export class Knob {
  constructor(id, value, onChange) {
    this.id = id;
    this.spec = PARAMS[id];
    this.onChange = onChange;
    this.stepped = this.spec.type === 'step';

    if (this.stepped) {
      const n = this.spec.options.length;
      const stepDeg = Math.min(48, 300 / (n - 1));
      this.span = stepDeg * (n - 1);
    } else {
      this.span = 300;
    }

    this.el = document.createElement('div');
    this.el.className = 'knob-cell' + (this.stepped ? ' stepped' : '');
    this.el.dataset.param = id;

    const label = document.createElement('div');
    label.className = 'knob-label';
    label.textContent = this.spec.label;
    this.el.appendChild(label);

    const dial = document.createElement('div');
    dial.className = 'dial';
    this.el.appendChild(dial);
    dial.appendChild(this.buildScale());

    this.knob = document.createElement('div');
    this.knob.className = 'knob';
    this.knob.tabIndex = 0;
    this.knob.setAttribute('role', 'slider');
    this.knob.setAttribute('aria-label', this.spec.label);
    this.knob.innerHTML = '<div class="knob-body"><div class="knob-cap"><div class="knob-pointer"></div></div></div><div class="knob-gloss"></div>';
    this.body = this.knob.querySelector('.knob-body');
    dial.appendChild(this.knob);

    this.readout = document.createElement('div');
    this.readout.className = 'knob-value';
    this.el.appendChild(this.readout);

    this.el.title = this.spec.help || '';
    this.bind();
    this.set(value);
  }

  angleFor(n) { return -this.span / 2 + n * this.span; }

  buildScale() {
    const s = svg('svg', { class: 'scale', viewBox: `0 0 ${DIAL} ${DIAL}`, width: DIAL, height: DIAL });
    const spec = this.spec;
    if (this.stepped) {
      const n = spec.options.length;
      spec.options.forEach((o, i) => {
        const a = this.angleFor(n > 1 ? i / (n - 1) : 0);
        const [x1, y1] = polar(R_TICK_IN, a), [x2, y2] = polar(o.minor ? R_TICK_OUT - 1.5 : R_TICK_OUT, a);
        svg('line', { x1, y1, x2, y2, class: 'tick' + (o.minor ? ' minor' : '') }, s);
        if (o.minor) return;
        const [lx, ly] = polar(R_LABEL, a);
        const g = svg('g', { class: 'opt', 'data-v': String(o.v) }, s);
        svg('circle', { cx: lx, cy: ly, r: 9, class: 'hit' }, g);
        if (o.icon) {
          svg('path', { d: WAVE_ICONS[o.icon], class: 'wave-icon', transform: `translate(${lx - 8},${ly - 5.5}) scale(1.33,0.92)` }, g);
        } else {
          const t = svg('text', { x: lx, y: ly + 3.5, class: 'num' + (n > 10 ? ' dense' : '') }, g);
          t.textContent = o.label;
        }
        g.addEventListener('click', (e) => { e.stopPropagation(); this.commit(o.v); });
      });
    } else {
      const tick = (n, major) => {
        const a = this.angleFor(n);
        const [x1, y1] = polar(major ? R_TICK_IN : R_TICK_IN + 1.5, a), [x2, y2] = polar(R_TICK_OUT, a);
        svg('line', { x1, y1, x2, y2, class: 'tick' + (major ? '' : ' minor') }, s);
      };
      const label = (n, text) => {
        const [lx, ly] = polar(R_LABEL, this.angleFor(n));
        svg('text', { x: lx, y: ly + 3.5, class: 'num' }, s).textContent = text;
      };
      if (spec.marks) {
        // minor ticks: 1-2-5 steps on log knobs, tenths otherwise
        if (spec.curve === 'log') {
          for (let d = Math.floor(Math.log10(spec.min)); d <= Math.ceil(Math.log10(spec.max)); d++) {
            [1, 2, 5].forEach((m) => {
              const v = m * Math.pow(10, d);
              if (v >= spec.min * 0.999 && v <= spec.max * 1.001) tick(toNorm(this.id, v), false);
            });
          }
        } else {
          for (let i = 0; i <= 10; i++) tick(i / 10, false);
        }
        spec.marks.forEach(([v, text]) => { const n = toNorm(this.id, v); tick(n, true); label(n, text); });
      } else {
        for (let i = 0; i <= 10; i++) { tick(i / 10, true); label(i / 10, String(i)); }
      }
    }
    if (spec.unit) {
      svg('text', { x: C, y: C + R_LABEL - 4, class: 'unit' }, s).textContent = spec.unit;
    }
    return s;
  }

  set(value) {
    this.value = value;
    this.norm = toNorm(this.id, value);
    this.body.style.transform = `rotate(${this.angleFor(this.norm)}deg)`;
    const text = formatValue(this.id, value);
    this.readout.textContent = text;
    this.knob.setAttribute('aria-valuetext', text);
    if (this.stepped) {
      this.el.querySelectorAll('.opt').forEach((g) => g.classList.toggle('on', g.dataset.v === String(value)));
    }
  }

  commit(value) {
    if (value === this.value) return;
    this.set(value);
    this.onChange(this.id, value);
  }

  setNorm(n) { this.commit(fromNorm(this.id, n)); }

  stepBy(delta) {
    if (this.stepped) {
      const opts = this.spec.options;
      const i = opts.findIndex((o) => o.v === this.value);
      const j = Math.min(opts.length - 1, Math.max(0, i + delta));
      this.commit(opts[j].v);
    } else {
      this.setNorm(this.norm + delta * 0.01);
    }
  }

  bind() {
    const k = this.knob;
    let startY = 0, startX = 0, startN = 0, acc = 0, dragging = false;

    k.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      k.focus();
      k.setPointerCapture(e.pointerId);
      dragging = true;
      startY = e.clientY; startX = e.clientX; startN = this.norm; acc = 0;
      this.el.classList.add('active');
      document.body.classList.add('knob-dragging');
    });
    k.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const d = (startY - e.clientY) + (e.clientX - startX) * 0.5;
      if (this.stepped) {
        const steps = Math.trunc(d / 22) - acc;
        if (steps) { acc += steps; this.stepBy(steps); }
      } else {
        const range = e.shiftKey ? 900 : 180;
        this.setNorm(startN + d / range);
        // re-anchor when switching fine mode mid-drag
        if (e.shiftKey !== this._lastShift) { startY = e.clientY; startX = e.clientX; startN = this.norm; }
        this._lastShift = e.shiftKey;
      }
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      this.el.classList.remove('active');
      document.body.classList.remove('knob-dragging');
    };
    k.addEventListener('pointerup', end);
    k.addEventListener('pointercancel', end);

    k.addEventListener('dblclick', () => this.commit(this.spec.def));
    k.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      if (this.stepped) {
        this._wheelAcc = (this._wheelAcc || 0) + dir;
        if (Math.abs(this._wheelAcc) >= 2) { this.stepBy(Math.sign(this._wheelAcc)); this._wheelAcc = 0; }
      } else this.stepBy(dir * (e.shiftKey ? 0.2 : 1));
    }, { passive: false });
    k.addEventListener('keydown', (e) => {
      const fine = e.shiftKey ? 0.2 : 1;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { this.stepBy(this.stepped ? 1 : fine); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { this.stepBy(this.stepped ? -1 : -fine); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'Home') { this.setNorm(0); e.preventDefault(); }
      else if (e.key === 'End') { this.setNorm(1); e.preventDefault(); }
    });
  }
}
