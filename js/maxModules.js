// Maximised modules (the modular synths): the scopes, keyboard, effects and side rails step aside
// so the modules can fill the window. They keep their usual arrangement, unless (in a narrow or
// tall window) rearranging them into more rows would make them much bigger. The keyboard's outputs
// become a slim strip along the bottom, so their cables can still be seen and patched.
// Everything goes back exactly where it was when this is turned off.

const WORTH_IT = 1.2; // how much bigger a new arrangement must be

export class MaxModules {
  // root: the panel's #sections; sections: id -> element; usual: rows of module ids, as the panel has them;
  // side: a module that stands in its own column (the sequencer), or null; kb: the keyboard's module
  constructor({ root, sections, usual, side, kb, avail }) {
    Object.assign(this, { root, sections, usual, side, kb, avail });
    this.order = usual.flat();
    this.on = false;
  }

  set(on) {
    if (on === this.on) return;
    this.on = on;
    document.body.classList.toggle('modules-max', on);
    if (on) {
      this.homes = [];
      [this.side, this.kb, ...this.order].filter(Boolean).forEach((id) => { // remember where each module lives
        const el = this.sections[id], mark = document.createComment(id);
        el.before(mark);
        this.homes.push([el, mark]);
      });
      this.box = document.createElement('div');
      this.box.className = 'max-box';
      this.sideBox = document.createElement('div');
      this.sideBox.className = 'max-side';
      this.rows = document.createElement('div');
      this.rows.className = 'rack-rows max-rows';
      const main = document.createElement('div');
      main.className = 'max-main';
      main.append(this.sideBox, this.rows);
      this.kbBox = document.createElement('div');
      this.kbBox.className = 'max-kb';
      this.box.append(main, this.kbBox);
      this.root.appendChild(this.box);
      if (this.side) this.sideBox.appendChild(this.sections[this.side]);
      this.kbBox.appendChild(this.sections[this.kb]);
      this.key = null;
      this.title(this.kb, 'Keyboard'); // untitled beside the keys; named on its strip
    } else {
      this.homes.forEach(([el, mark]) => mark.replaceWith(el));
      this.box.remove();
      this.title(this.kb, '');
    }
  }

  title(id, text) {
    const span = id && this.sections[id].querySelector('.section-title span');
    if (span) span.textContent = text;
  }

  // The usual rows, or a better arrangement if there is one that is worth it.
  layout() {
    if (!this.on) return;
    const { w, h } = this.avail();
    const folded = !!this.side && this.sections[this.side].classList.contains('folded');
    const key = `${Math.round(w)}x${Math.round(h)} ${folded}`;
    if (key === this.key) return;
    this.key = key;
    const els = this.order.map((id) => this.sections[id]);
    this.place([els]);
    this.box.classList.add('measuring');
    const widths = els.map((el) => el.offsetWidth);
    this.box.classList.remove('measuring');
    const stage = document.getElementById('stage');
    const scaleOf = (split) => { this.place(split); return Math.min(w / stage.offsetWidth, h / stage.offsetHeight); };
    const usual = this.usual.map((row) => row.map((id) => this.sections[id]));
    const usualScale = scaleOf(usual);
    let best = null;
    for (let k = 1; k <= Math.min(8, els.length); k++) {
      const split = this.split(els, widths, k), scale = scaleOf(split);
      if (!best || scale > best.scale + 0.005) best = { scale, split };
    }
    this.place(best.scale > usualScale * WORTH_IT ? best.split : usual);
  }

  place(split) {
    this.rows.replaceChildren(...split.map((els) => {
      const r = document.createElement('div');
      r.className = 'rack-row';
      r.append(...els);
      return r;
    }));
  }

  // Split the modules, in order, into k rows so that the widest row is as narrow as possible.
  split(els, widths, k) {
    const n = els.length, memo = {};
    const width = (a, b) => { let s = (b - a - 1) * 8; for (let i = a; i < b; i++) s += widths[i]; return s; };
    const go = (a, rows) => { // modules a.. in this many rows: [widest, spread, breaks]
      const id = a + ',' + rows;
      if (memo[id]) return memo[id];
      if (rows === 1) return (memo[id] = [width(a, n), width(a, n) ** 2, [n]]);
      let best = null;
      for (let b = a + 1; b <= n - rows + 1; b++) {
        const rest = go(b, rows - 1), first = width(a, b);
        const c = [Math.max(first, rest[0]), first ** 2 + rest[1], [b, ...rest[2]]];
        if (!best || c[0] < best[0] - 0.5 || (Math.abs(c[0] - best[0]) <= 0.5 && c[1] < best[1])) best = c;
      }
      return (memo[id] = best);
    };
    let a = 0;
    return go(0, k)[2].map((b) => { const row = els.slice(a, b); a = b; return row; });
  }
}
