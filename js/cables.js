// Patch cables for the modular synths (and StudioLab's patchable units, e.g. the NF-Mix4 console and
// its outboard): jack sockets on the modules and the cables between them.
//
//   Drag from an output to an input (or from an input to an output) to connect them.
//   Drag a plugged-in cable off an input to move it elsewhere; drop it anywhere else to remove it.
//   Double-click a plug (either end) to pull that cable out.
//
// Each input jack is a patch setting whose value is the output plugged into it ('' = none),
// so cables save, load and reset with the rest of the patch. Cables are drawn in an SVG
// layer laid over the whole instrument; it does not catch clicks, so knobs under a cable
// still work.

import { PARAMS, SYNTH } from './params.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const COLOURS = ['#e8463b', '#f2b632', '#3d8fe0', '#4cbf6a', '#e8833a', '#a66bd6', '#e05a9c', '#3fc4c4'];

const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };
const svg = (tag, attrs, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};

// On a synth with multiInput (the NF-Modular), an input can take several cables: its value is a
// comma-separated list of outputs, and the engine adds their signals together.
const MAX_PER_INPUT = 4;
const listOf = (v) => (v ? String(v).split(',').filter(Boolean) : []);

// An input socket: behaves like a control (set / commit) so setPatch updates it.
class JackIn {
  constructor(id, value, onChange) {
    this.id = id;
    this.spec = PARAMS[id];
    this.onChange = onChange;
    this.el = el('div', 'jack-cell in' + (this.spec.audio ? ' audio' : ''));
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
    window.addEventListener('pointermove', (e) => { this.onMove(e); this.fadeNear(e); });
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', () => this.cancel());
    // anything that moves the modules (window size, scopes, help, effects drawer) redraws the cables
    new ResizeObserver(() => this.redraw()).observe(stage);
  }

  // The sockets along the bottom of a module: one row, or several (e.g. inputs above outputs).
  buildStrip(ids) {
    if (Array.isArray(ids[0])) {
      const box = el('div', 'jack-rows');
      ids.forEach((row) => box.appendChild(this.buildStrip(row)));
      return box;
    }
    const strip = el('div', 'jack-strip');
    ids.forEach((id) => {
      if (id.startsWith('#')) { // a row label in a dual module ('#1' = the first of the pair)
        el('div', 'jack-rowlabel', strip).textContent = id.slice(1);
        return;
      }
      strip.appendChild(id.startsWith('out:') ? this.makeOut(id.slice(4)) : this.makeIn(id));
    });
    return strip;
  }

  // One output socket (a cell with its label and lamp), e.g. for a console's insert Send.
  makeOut(out) {
    const info = SYNTH.OUTPUTS && SYNTH.OUTPUTS[out];
    const cell = el('div', 'jack-cell out' + (info && info.audio ? ' audio' : ''));
    cell.dataset.help = 'out:' + out;
    el('div', 'jack-label', cell).textContent = info ? info.label : 'Out';
    const s = el('div', 'socket', cell);
    s.dataset.out = out;
    s._lamp = el('span', 'jack-lamp', cell);
    this.outs[out] = s;
    s.addEventListener('pointerdown', (e) => this.startFromOut(e, out));
    return cell;
  }

  // One input socket (a setting: the output plugged into it), e.g. for a console's insert Return.
  makeIn(id) {
    const j = new JackIn(id, this.getPatch()[id], (jid, v) => { this.onChange(jid, v); this.redraw(); });
    this.ins[id] = j;
    this.controls[id] = j;
    j.socket.addEventListener('pointerdown', (e) => this.startFromIn(e, id));
    return j.el;
  }

  // forget sockets no longer on the panel (the NF-ModRack: a module taken out of the rack)
  prune() {
    for (const id in this.ins) if (!this.ins[id].el.isConnected) { delete this.ins[id]; if (this.controls[id] && !this.controls[id].el.isConnected) delete this.controls[id]; }
    for (const out in this.outs) if (!this.outs[out].isConnected) delete this.outs[out];
  }

  // centre of a socket, in the stage's own (unscaled) pixels. A socket scrolled out of sight (the
  // NF-ModRack's wide rack) is taken to the edge of the rack's window, so its cable leads off that way.
  pos(sock) {
    const s = this.stage.getBoundingClientRect(), r = sock.getBoundingClientRect();
    const k = s.width / this.stage.offsetWidth || 1;
    let x = r.left + r.width / 2;
    const win = sock.closest('.rack-scroll');
    if (win) { const w = win.getBoundingClientRect(); x = Math.max(w.left + 4, Math.min(w.right - 4, x)); }
    return [(x - s.left) / k, (r.top + r.height / 2 - s.top) / k];
  }
  toStage(x, y) {
    const s = this.stage.getBoundingClientRect();
    const k = s.width / this.stage.offsetWidth || 1;
    return [(x - s.left) / k, (y - s.top) / k];
  }

  colourFor(inputId, k = 0) {
    const i = Object.keys(this.ins).indexOf(inputId);
    return COLOURS[((i < 0 ? 0 : i) + k * 3) % COLOURS.length];
  }

  // a hanging cable: sags more the further apart its ends are
  drawCable(a, b, colour, parent, live = false) {
    // sag mostly with the sideways distance, so long upward runs (from the keyboard) stay tidy
    const sag = Math.min(150, 26 + Math.abs(b[0] - a[0]) * 0.22 + Math.abs(b[1] - a[1]) * 0.06);
    const d = `M${a[0]},${a[1]} C${a[0]},${a[1] + sag} ${b[0]},${b[1] + sag} ${b[0]},${b[1]}`;
    const g = svg('g', { class: 'cable' + (live ? ' live' : '') }, parent);
    // points along the cable, for fading it when the mouse comes near (see fadeNear)
    const bez = (t, p0, p1, p2, p3) => (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3;
    g._pts = Array.from({ length: 25 }, (_, i) => { const t = i / 24; return [bez(t, a[0], a[0], b[0], b[0]), bez(t, a[1], a[1] + sag, b[1] + sag, b[1])]; });
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
    this.markPatched(p);
    for (const id in this.ins) {
      listOf(p[id]).forEach((from, k) => {
        if (!this.outs[from]) return;
        if (this.drag && this.drag.lifted === id && this.drag.from === from) return; // being carried
        const a = this.outs[from], b = this.ins[id].socket;
        if (!a.offsetParent || !b.offsetParent) return; // e.g. the keyboard folded away under maximised scopes
        this.drawCable(this.pos(a), this.pos(b), this.colourFor(id, k), L);
      });
    }
    if (this.drag) {
      const d = this.drag;
      d.g = this.drawCable(this.pos(d.anchor), d.at, d.colour, L, true);
    }
  }

  // Cables near the mouse fade almost away (their plugs stay), so the knobs underneath can be
  // seen and turned. While a knob is being turned, the cables stay as they are.
  fadeNear(e) {
    if (this.drag || document.body.classList.contains('knob-dragging')) return;
    const [x, y] = this.toStage(e.clientX, e.clientY);
    const R = 70; // design pixels
    this.layer.querySelectorAll('.cable').forEach((g) => {
      if (!g._pts) return;
      const near = g._pts.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < R * R);
      g.classList.toggle('near', near);
    });
  }

  // ---- dragging ----
  // Two presses on the same socket in quick succession = a double-click: pull the cable out.
  // (Detected here rather than with 'dblclick', which a trackpad tap or the redrawn cable can miss.)
  isDouble(e, key) {
    const now = performance.now(), last = this.lastPress;
    this.lastPress = { key, t: now, x: e.clientX, y: e.clientY };
    if (!last || last.key !== key || now - last.t > 450 || Math.hypot(e.clientX - last.x, e.clientY - last.y) > 12) return false;
    this.lastPress = null;
    return true;
  }

  startFromOut(e, out) {
    e.preventDefault(); e.stopPropagation();
    if (this.isDouble(e, 'out:' + out)) { this.cancel(); this.unplugOut(out); return; }
    this.drag = { want: 'in', from: out, anchor: this.outs[out], colour: '#d8d8d8', at: this.toStage(e.clientX, e.clientY) };
    document.body.classList.add('patching', 'patching-in');
    this.redraw();
  }

  startFromIn(e, id) {
    e.preventDefault(); e.stopPropagation();
    if (this.isDouble(e, 'in:' + id)) { this.cancel(); this.unplugIn(id); return; }
    const list = listOf(this.getPatch()[id]);
    const from = list[list.length - 1]; // the most recently plugged-in cable comes out first
    if (from && this.outs[from]) {
      // pick up the cable from this input; it stays attached at its output end
      this.drag = { want: 'in', from, anchor: this.outs[from], colour: this.colourFor(id, list.length - 1), at: this.toStage(e.clientX, e.clientY), lifted: id };
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
      if (d.lifted && d.lifted !== to) this.remove(d.lifted, d.from); // pulled out of where it was
      if (to && !(d.lifted === to)) this.plug(to, d.from);
    } else if (sock) {
      this.plug(d.to, sock.dataset.out);
    }
    this.redraw();
  }

  // Plug an output into an input: added alongside any cables already there (multiInput),
  // or replacing the one there
  plug(input, out) {
    const list = listOf(this.getPatch()[input]).filter((x) => x !== out);
    const next = SYNTH.multiInput ? [...list, out].slice(-MAX_PER_INPUT) : [out];
    this.ins[input].commit(next.join(','));
  }

  remove(input, out) {
    this.ins[input].commit(listOf(this.getPatch()[input]).filter((x) => x !== out).join(','));
  }

  // double-click a plug: pull out the most recent cable at that input,
  // or (at an output) the most recently drawn cable leaving it
  unplugIn(id) {
    const list = listOf(this.getPatch()[id]);
    if (list.length) this.remove(id, list[list.length - 1]);
    this.redraw();
  }

  unplugOut(out) {
    const p = this.getPatch();
    const ids = Object.keys(this.ins).filter((id) => listOf(p[id]).includes(out));
    if (ids.length) this.remove(ids[ids.length - 1], out);
    this.redraw();
  }

  cancel() {
    if (!this.drag) return;
    this.drag = null;
    document.body.classList.remove('patching', 'patching-in', 'patching-out');
    this.redraw();
  }

  // a lamp only where a cable is plugged into the output
  markPatched(p) {
    const used = new Set();
    for (const id in this.ins) listOf(p[id]).forEach((out) => used.add(out));
    for (const out in this.outs) {
      const s = this.outs[out], on = used.has(out);
      if (s._patched === on) continue;
      s._patched = on;
      s.parentNode.classList.toggle('patched', on);
      s._lamp._v = 0; s._lamp._glow = null; // starts dark
    }
  }

  // light each output socket's lamp with what it is sending (from the sound engine's live state)
  showLevels(outs) {
    for (const id in this.outs) {
      const s = this.outs[id], lamp = s._lamp;
      if (!s._patched) continue; // an output with no cable shows no lamp
      const v = outs ? Math.min(1, outs[id] || 0) : 0; // the keyboard's Pitch lamp lights while a key is down
      lamp._v = Math.max(v, (lamp._v || 0) * 0.85); // light quickly, fade slowly
      const glow = lamp._v.toFixed(2);
      if (glow === lamp._glow) continue; // nothing to redraw
      lamp._glow = glow;
      lamp.style.setProperty('--glow', glow);
    }
  }
}
