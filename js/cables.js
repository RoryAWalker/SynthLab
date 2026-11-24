// Patch cables for the NF-Modular: jack sockets on the modules and the cables between them.
//
//   Drag from an output to an input (or from an input to an output) to connect them.
//   Drag a plugged-in cable off an input to move it elsewhere; drop it anywhere else to remove it.
//
// Each input jack is a patch setting whose value is the output plugged into it ('' = none),
// so cables save, load and reset with the rest of the patch. Cables are drawn in an SVG
// layer laid over the whole instrument; it does not catch clicks, so knobs under a cable
// still work.

import { PARAMS } from './params.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const COLOURS = ['#e8463b', '#f2b632', '#3d8fe0', '#4cbf6a', '#e8833a', '#a66bd6', '#e05a9c', '#3fc4c4'];

const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };
const svg = (tag, attrs, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};

// An input socket: behaves like a control (set / commit) so setPatch updates it.
class JackIn {
  constructor(id, value, onChange) {
    this.id = id;
    this.spec = PARAMS[id];
    this.onChange = onChange;
    this.el = el('div', 'jack-cell in');
    this.el.dataset.param = id;
    this.el.dataset.help = id;
    el('div', 'jack-label', this.el).textContent = this.spec.label;
    this.socket = el('div', 'socket', this.el);
    this.socket.dataset.jack = id;
    this.set(value);
  }
  set(value) { this.value = value || ''; this.el.classList.toggle('patched', !!this.value); }
  commit(value) {
    value = value || '';
    if (value === this.value) return;
    this.set(value);
    this.onChange(this.id, value);
  }
}

export class Cables {
  // stage: the scaled instrument; getPatch(); onChange(id, value) like a knob turn; controls: the knobs map
  constructor(stage, { getPatch, onChange, controls }) {
    this.stage = stage;
    this.getPatch = getPatch;
    this.onChange = onChange;
    this.controls = controls;
    this.outs = {};   // output id -> socket element
    this.ins = {};    // input id -> JackIn
    this.layer = svg('svg', { class: 'cable-layer' });
    stage.appendChild(this.layer);
    this.drag = null;
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', () => this.cancel());
    // anything that moves the modules (window size, scopes, help, effects drawer) redraws the cables
    new ResizeObserver(() => this.redraw()).observe(stage);
  }

  // The row of sockets along the bottom of a module.
  buildStrip(ids) {
    const strip = el('div', 'jack-strip');
    ids.forEach((id) => {
      if (id.startsWith('out:')) {
        const out = id.slice(4);
        const cell = el('div', 'jack-cell out', strip);
        cell.dataset.help = id;
        el('div', 'jack-label', cell).textContent = 'Out';
        const s = el('div', 'socket', cell);
        s.dataset.out = out;
        el('span', 'jack-lamp', cell);
        this.outs[out] = s;
        s.addEventListener('pointerdown', (e) => this.startFromOut(e, out));
      } else {
        const j = new JackIn(id, this.getPatch()[id], (jid, v) => { this.onChange(jid, v); this.redraw(); });
        this.ins[id] = j;
        this.controls[id] = j;
        strip.appendChild(j.el);
        j.socket.addEventListener('pointerdown', (e) => this.startFromIn(e, id));
      }
    });
    // output labels name what they carry when a module has more than one (the keyboard's Pitch and Gate)
    if (ids.filter((i) => i.startsWith('out:')).length > 1) {
      strip.querySelectorAll('.jack-cell.out').forEach((c, i) => {
        const out = ids.filter((x) => x.startsWith('out:'))[i].slice(4);
        c.querySelector('.jack-label').textContent = out === 'kb.pitch' ? 'Pitch' : out === 'kb.gate' ? 'Gate' : 'Out';
      });
    }
    return strip;
  }

  // centre of a socket, in the stage's own (unscaled) pixels
  pos(sock) {
    const s = this.stage.getBoundingClientRect(), r = sock.getBoundingClientRect();
    const k = s.width / this.stage.offsetWidth || 1;
    return [(r.left + r.width / 2 - s.left) / k, (r.top + r.height / 2 - s.top) / k];
  }
  toStage(x, y) {
    const s = this.stage.getBoundingClientRect();
    const k = s.width / this.stage.offsetWidth || 1;
    return [(x - s.left) / k, (y - s.top) / k];
  }

  colourFor(inputId) {
    const i = Object.keys(this.ins).indexOf(inputId);
    return COLOURS[(i < 0 ? 0 : i) % COLOURS.length];
  }

  // a hanging cable: sags more the further apart its ends are
  drawCable(a, b, colour, parent, live = false) {
    // sag mostly with the sideways distance, so long upward runs (from the keyboard) stay tidy
    const sag = Math.min(150, 26 + Math.abs(b[0] - a[0]) * 0.22 + Math.abs(b[1] - a[1]) * 0.06);
    const d = `M${a[0]},${a[1]} C${a[0]},${a[1] + sag} ${b[0]},${b[1] + sag} ${b[0]},${b[1]}`;
    const g = svg('g', { class: 'cable' + (live ? ' live' : '') }, parent);
    svg('path', { d, class: 'cable-shadow' }, g);
    svg('path', { d, class: 'cable-body', stroke: colour }, g);
    svg('path', { d, class: 'cable-shine' }, g);
    [a, b].forEach(([x, y]) => {
      svg('circle', { cx: x, cy: y, r: 9, class: 'plug', fill: colour }, g);
      svg('circle', { cx: x, cy: y, r: 4, class: 'plug-tip' }, g);
    });
    return g;
  }

  redraw() {
    const L = this.layer;
    L.setAttribute('width', this.stage.offsetWidth);
    L.setAttribute('height', this.stage.offsetHeight);
    L.replaceChildren();
    const p = this.getPatch();
    for (const id in this.ins) {
      const from = p[id];
      if (!from || !this.outs[from]) continue;
      if (this.drag && this.drag.lifted === id) continue; // being carried
      const a = this.outs[from], b = this.ins[id].socket;
      if (!a.offsetParent || !b.offsetParent) continue; // e.g. the keyboard folded away under maximised scopes
      this.drawCable(this.pos(a), this.pos(b), this.colourFor(id), L);
    }
    if (this.drag) {
      const d = this.drag;
      d.g = this.drawCable(this.pos(d.anchor), d.at, d.colour, L, true);
    }
  }

  // ---- dragging ----
  startFromOut(e, out) {
    e.preventDefault(); e.stopPropagation();
    this.drag = { want: 'in', from: out, anchor: this.outs[out], colour: '#d8d8d8', at: this.toStage(e.clientX, e.clientY) };
    document.body.classList.add('patching', 'patching-in');
    this.redraw();
  }

  startFromIn(e, id) {
    e.preventDefault(); e.stopPropagation();
    const from = this.getPatch()[id];
    if (from && this.outs[from]) {
      // pick up the cable from this input; it stays attached at its output end
      this.drag = { want: 'in', from, anchor: this.outs[from], colour: this.colourFor(id), at: this.toStage(e.clientX, e.clientY), lifted: id };
      document.body.classList.add('patching', 'patching-in');
    } else {
      this.drag = { want: 'out', to: id, anchor: this.ins[id].socket, colour: this.colourFor(id), at: this.toStage(e.clientX, e.clientY) };
      document.body.classList.add('patching', 'patching-out');
    }
    this.redraw();
  }

  onMove(e) {
    if (!this.drag) return;
    this.drag.at = this.toStage(e.clientX, e.clientY);
    const over = this.target(e);
    document.querySelectorAll('.socket.hover').forEach((s) => s.classList.remove('hover'));
    if (over) over.classList.add('hover');
    this.redraw();
  }

  target(e) {
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const cell = hit && hit.closest('.jack-cell');
    const sock = cell && cell.querySelector('.socket');
    if (!sock) return null;
    return this.drag.want === 'in' ? (sock.dataset.jack ? sock : null) : (sock.dataset.out ? sock : null);
  }

  onUp(e) {
    if (!this.drag) return;
    const d = this.drag;
    const sock = this.target(e);
    this.drag = null;
    document.body.classList.remove('patching', 'patching-in', 'patching-out');
    document.querySelectorAll('.socket.hover').forEach((s) => s.classList.remove('hover'));
    if (d.want === 'in') {
      const to = sock ? sock.dataset.jack : null;
      if (d.lifted && d.lifted !== to) this.ins[d.lifted].commit(''); // pulled out of where it was
      if (to) this.ins[to].commit(d.from);
    } else if (sock) {
      this.ins[d.to].commit(sock.dataset.out);
    }
    this.redraw();
  }

  cancel() {
    if (!this.drag) return;
    this.drag = null;
    document.body.classList.remove('patching', 'patching-in', 'patching-out');
    this.redraw();
  }

  // light each output socket's lamp with what it is sending (from the sound engine's live state)
  showLevels(outs) {
    for (const id in this.outs) {
      const v = outs ? Math.min(1, outs[id] || 0) : 0; // the keyboard's Pitch lamp lights while a key is down
      const lamp = this.outs[id].parentNode.querySelector('.jack-lamp');
      if (!lamp) continue;
      const shown = Math.max(v, (lamp._v || 0) * 0.85); // light quickly, fade slowly
      lamp._v = shown;
      lamp.style.setProperty('--glow', shown.toFixed(3));
    }
  }
}
