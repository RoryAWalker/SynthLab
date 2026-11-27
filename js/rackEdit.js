// The NF-ModRack's module drawer, and moving modules around the rack.
//
//   Modules (top bar) opens the drawer: every kind of module, grouped Sources / Shaping / Modulation.
//   Drag one from the drawer into a row of the rack (a marker shows where it will go), or click it
//   to put it in the first row with room.
//   Drag a module by the grip in its title bar to move it, within its row or to another.
//   × in a module's title bar takes it out (with its cables).
// Each row is as wide as a row of the NF-Modular's case: a module only goes in where it fits.

import { TYPES, DRAWER, ROW_WIDTH, GAP, widthOf, fits as fitsRow, newId, typeOf } from './synths/modrack.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};
// which row each group of the drawer goes to first, when clicked
const HOME_ROW = { Sources: 0, Shaping: 1, Modulation: 2 };

export class RackEdit {
  // root: the panel's #sections; getRows(): the rack's rows of module ids; change(rows): try a new
  // rack (true if it changed); toast(text)
  // getBays(): how many racks wide the rack is
  constructor({ root, button, getRows, change, toast, getBays = () => 1 }) {
    Object.assign(this, { root, getRows, change, toast, getBays });
    this.drag = null;
    this.buildDrawer();
    button.hidden = false;
    button.addEventListener('click', () => this.setOpen(!this.open));
    this.button = button;
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', () => this.cancel());
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.drag) this.cancel(); });
    this.decorate();
  }

  // ---- the drawer -------------------------------------------------------------------------
  buildDrawer() {
    const d = this.drawer = el('aside', 'module-drawer', document.body);
    d.hidden = true;
    d.setAttribute('aria-label', 'Module drawer');
    const head = el('div', 'md-head', d, '<b>Module drawer</b><span>Drag a module into the rack, or click it</span>');
    const close = el('button', 'md-close', head, '×');
    close.setAttribute('aria-label', 'Close the module drawer');
    close.addEventListener('click', () => this.setOpen(false));
    DRAWER.forEach(([group, types]) => {
      el('div', 'md-group', d, group);
      types.forEach((type) => {
        const t = TYPES[type];
        const card = el('div', 'md-card', d);
        card.dataset.type = type;
        card.dataset.help = 'section:' + type + '1';
        card.tabIndex = 0;
        const pct = Math.round((t.w / ROW_WIDTH) * 100);
        card.innerHTML = `<div class="md-name">${t.name}</div><div class="md-desc">${t.desc}</div>
          <div class="md-size" title="How much of a row it takes"><span style="width:${pct}%"></span></div>`;
        card.addEventListener('pointerdown', (e) => { this.hidePic(); this.start(e, { type, group, card }); });
        // a picture of the module while the pointer rests on its card
        card.addEventListener('pointerenter', () => { if (!this.drag) this.showPic(type, card); });
        card.addEventListener('pointerleave', () => this.hidePic());
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.addSomewhere(type, group); } });
      });
    });
    // typing in the drawer must not play notes
    d.addEventListener('keydown', (e) => e.stopPropagation());
    d.addEventListener('keyup', (e) => e.stopPropagation());
  }

  // the picture beside the drawer (img/modules/<type>.webp, made by tools/make-module-pictures.mjs)
  showPic(type, card) {
    if (!this.pic) {
      this.pic = el('div', 'md-pic', document.body, '<img alt=""><span></span>');
      this.pic.querySelector('img').addEventListener('error', () => { this.pic.hidden = true; });
      // shown at one scale for all (half the picture's pixels: 0.6 of the panel's size), so the modules
      // keep their true sizes against each other; centred again once it has its size
      this.pic.querySelector('img').addEventListener('load', (e) => { e.target.style.width = e.target.naturalWidth / 2 + 'px'; this.placePic(); });
    }
    const t = TYPES[type], img = this.pic.querySelector('img');
    img.src = `img/modules/${type}.webp`;
    this.pic.querySelector('span').textContent = `${t.name} · ${Math.round((t.w / ROW_WIDTH) * 100)}% of a row`;
    this.picCard = card;
    this.pic.hidden = false;
    this.placePic();
  }
  // beside the drawer, level with the card (and inside the window)
  placePic() {
    if (!this.pic || this.pic.hidden || !this.picCard) return;
    const d = this.drawer.getBoundingClientRect(), c = this.picCard.getBoundingClientRect();
    this.pic.style.right = window.innerWidth - d.left + 10 + 'px';
    const h = this.pic.offsetHeight || 230;
    this.pic.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, c.top + c.height / 2 - h / 2)) + 'px';
  }
  hidePic() { if (this.pic) this.pic.hidden = true; }

  setOpen(open) {
    if (!open) this.hidePic();
    this.open = open;
    this.drawer.hidden = !open;
    this.button.classList.toggle('on', open);
    this.button.setAttribute('aria-pressed', String(open));
    document.body.classList.toggle('drawer-open', open);
    if (open) {
      this.refreshCards();
      // (load the pictures now, so that each appears at once)
      if (!this.preloaded) { this.preloaded = true; Object.keys(TYPES).forEach((t) => { new Image().src = `img/modules/${t}.webp`; }); }
    }
  }

  // a card is dimmed when its module would fit in no row
  refreshCards() {
    const rows = this.getRows();
    this.drawer.querySelectorAll('.md-card').forEach((c) => {
      const id = newId(rows, c.dataset.type);
      c.classList.toggle('no-room', !rows.some((r, ri) => this.fits(rows, ri, id)));
    });
  }

  // click: the module's usual row if it fits there, else the first row with room; before the
  // Output if the Output ends that row
  addSomewhere(type, group) {
    const rows = this.getRows();
    const id = newId(rows, type);
    const home = HOME_ROW[group] ?? 0;
    const ri = [home, 0, 1, 2].find((r) => this.fits(rows, r, id));
    if (ri === undefined) { this.toast(`There is no room for a ${TYPES[type].name} in the rack. Take a module out first.`); return; }
    const row = rows[ri];
    const at = row[row.length - 1] === 'out' ? row.length - 1 : row.length;
    row.splice(at, 0, id);
    this.commit(rows, id);
  }

  commit(rows, id) {
    if (!this.change(rows)) return;
    this.refreshCards();
    // show where it went
    const sec = id && this.root.querySelector(`.rack-rows:not(.max-rows) .section[data-section="${id}"]`);
    if (sec) {
      sec.classList.add('just-added'); setTimeout(() => sec.classList.remove('just-added'), 900);
      const win = sec.closest('.rack-scroll'); // (in a wide rack, bring it into view)
      if (win) { const b = win.getBoundingClientRect(), r = sec.getBoundingClientRect(), k = win.offsetWidth / b.width || 1;
        if (r.left < b.left || r.right > b.right) win.scrollBy({ left: ((r.left + r.right) / 2 - (b.left + b.right) / 2) * k, behavior: 'smooth' }); }
    }
  }

  // room in row ri for a module
  fits(rows, ri, id) { return fitsRow(rows[ri], id, this.getBays()); }

  // ---- grips and remove buttons on the modules ---------------------------------------------
  decorate() {
    this.root.querySelectorAll('.rack-rows:not(.max-rows) > .rack-row > .section').forEach((sec) => {
      const id = sec.dataset.section;
      const title = sec.querySelector('.section-title');
      if (!title || title.querySelector('.mod-grip')) return;
      const grip = el('button', 'mod-grip', null, '⠿');
      grip.setAttribute('aria-label', 'Move this module');
      grip.dataset.help = 'movemodule';
      grip.addEventListener('pointerdown', (e) => this.start(e, { move: id, sec }));
      title.prepend(grip);
      if (id === 'out') return; // the Output is always in the rack
      const x = el('button', 'mod-remove', null, '×');
      x.setAttribute('aria-label', 'Take this module out of the rack');
      x.dataset.help = 'removemodule';
      x.addEventListener('click', (e) => { e.stopPropagation(); this.remove(id); });
      title.appendChild(x);
    });
    if (this.open) this.refreshCards(); // (a patch may have brought a different rack)
    // an empty row says what it is for
    this.root.querySelectorAll('.rack-rows:not(.max-rows) > .rack-row').forEach((r) => {
      r.classList.toggle('empty', !r.querySelector('.section'));
    });
  }

  remove(id) {
    const rows = this.getRows().map((r) => r.filter((x) => x !== id));
    const [type] = typeOf(id);
    const name = (this.root.querySelector(`.section[data-section="${id}"] .section-title > span`) || {}).textContent || (type ? TYPES[type].name : id);
    if (this.change(rows) && type) this.toast(`${name} taken out of the rack`);
    this.refreshCards();
  }

  // ---- dragging a module (from the drawer, or by its grip) -----------------------------------
  start(e, what) {
    if (e.button !== 0 || document.body.classList.contains('modules-max')) return;
    e.preventDefault(); e.stopPropagation();
    const rows = this.getRows();
    const id = what.move || newId(rows, what.type);
    const name = what.move ? (what.sec.querySelector('.section-title span') || {}).textContent : TYPES[what.type].name;
    this.drag = { ...what, id, x0: e.clientX, y0: e.clientY, moved: false, name };
  }

  onMove(e) {
    const d = this.drag;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      d.moved = true;
      d.ghost = el('div', 'mod-ghost', document.body, d.name);
      if (d.sec) d.sec.classList.add('moving');
      document.body.classList.add('rack-dragging');
    }
    d.ghost.style.left = e.clientX + 'px';
    d.ghost.style.top = e.clientY + 'px';
    // near either end of the rack's window (a rack several racks wide), it scrolls that way
    const win = this.root.querySelector('.rack-scroll');
    if (win) {
      const b = win.getBoundingClientRect(), edge = 60;
      const dir = e.clientY > b.top && e.clientY < b.bottom ? (e.clientX < b.left + edge ? -1 : e.clientX > b.right - edge ? 1 : 0) : 0;
      if (dir && !this.scrolling) {
        this.scrolling = setInterval(() => { win.scrollLeft += dir * 24; if (this.drag && this.lastMove) this.onMove(this.lastMove); }, 30);
      } else if (!dir && this.scrolling) { clearInterval(this.scrolling); this.scrolling = null; }
    }
    this.lastMove = e;
    d.target = this.targetAt(e.clientX, e.clientY);
    this.showMarker(d.target);
  }

  // the row under the pointer, and where in it: [row, index, fits]
  targetAt(x, y) {
    const rowEls = [...this.root.querySelectorAll('.rack-rows:not(.max-rows) > .rack-row')];
    const ri = rowEls.findIndex((r) => { const b = r.getBoundingClientRect(); return y >= b.top - 6 && y <= b.bottom + 6 && x >= b.left - 40 && x <= b.right + 40; });
    if (ri < 0) return null;
    const rows = this.getRows();
    const row = rows[ri].filter((m) => m !== this.drag.id);
    const secs = row.map((m) => rowEls[ri].querySelector(`.section[data-section="${m}"]`));
    let at = secs.findIndex((s) => { const b = s.getBoundingClientRect(); return x < b.left + b.width / 2; });
    if (at < 0) at = row.length;
    const others = rows.map((r) => r.filter((m) => m !== this.drag.id));
    return { ri, at, row, rowEl: rowEls[ri], secs, ok: this.fits(others, ri, this.drag.id) };
  }

  // a bar where the module will go (red, with a note, if it won't fit)
  showMarker(t) {
    if (!this.marker) this.marker = el('div', 'rack-marker');
    if (!t) { this.marker.remove(); return; }
    const { rowEl, secs, at, ok } = t;
    let left;
    const shown = secs.filter(Boolean);
    if (!shown.length) left = 0;
    else if (at < shown.length) left = shown[at].offsetLeft - GAP / 2;
    else { const last = shown[shown.length - 1]; left = last.offsetLeft + last.offsetWidth + GAP / 2; }
    this.marker.style.left = Math.max(0, left - 3) + 'px';
    this.marker.classList.toggle('full', !ok);
    this.marker.dataset.note = ok ? '' : 'No room in this row';
    if (this.marker.parentNode !== rowEl) rowEl.appendChild(this.marker);
  }

  onUp() {
    const d = this.drag;
    if (!d) return;
    this.cleanup();
    if (!d.moved) { if (d.type) this.addSomewhere(d.type, d.group); return; } // a click
    const t = d.target;
    if (!t) return;
    if (!t.ok) { this.toast(`No room for ${d.name} in that row. Take a module out, or try another row.`); return; }
    const rows = this.getRows().map((r) => r.filter((m) => m !== d.id));
    rows[t.ri].splice(t.at, 0, d.id);
    this.commit(rows, d.id);
  }

  cancel() { if (this.drag) this.cleanup(); }

  cleanup() {
    if (this.scrolling) { clearInterval(this.scrolling); this.scrolling = null; }
    const d = this.drag;
    this.drag = null;
    if (d && d.ghost) d.ghost.remove();
    if (d && d.sec) d.sec.classList.remove('moving');
    if (this.marker) this.marker.remove();
    document.body.classList.remove('rack-dragging');
  }
}

export { widthOf };
