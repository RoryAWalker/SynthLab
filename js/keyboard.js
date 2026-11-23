// On-screen keyboard plus computer-keyboard playing.

const KEY_MAP = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8,
  KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
};
const MAX_WHITE_PX = 80;
const BLACK = new Set([1, 3, 6, 8, 10]);
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (n) => NAMES[n % 12] + (Math.floor(n / 12) - 1);

export class Keyboard {
  // fixed: [low, high] for a keyboard of fixed size with no octave shift (NiniFoog)
  constructor(container, { octaves = 2, fixed = null, onNoteOn, onNoteOff, onOctave }) {
    this.container = container;
    this.fixed = fixed;
    this.onNoteOn = onNoteOn; this.onNoteOff = onNoteOff; this.onOctave = onOctave;
    this.base = 48;            // lowest key, and computer key A: C3
    this.octaves = Math.min(4, Math.max(2, octaves || 2));
    this.keys = new Map();
    this.held = new Map();     // source -> note
    this.build(container);
    this.bindPointer(container);
    this.bindKeys();
  }

  get low() { return this.fixed ? this.fixed[0] : this.base; }
  get high() { return this.fixed ? this.fixed[1] : this.base + this.octaves * 12; }

  setOctaves(o) {
    if (this.fixed) return;
    this.octaves = Math.min(4, Math.max(2, o));
    if (this.high > 108) this.base = 108 - this.octaves * 12;
    this.releaseAll();
    this.build(this.container);
    this.onOctave && this.onOctave(Math.floor(this.base / 12) - 1);
  }

  build(container) {
    container.querySelectorAll('.key').forEach((k) => k.remove());
    this.keys.clear();
    const whites = [];
    for (let n = this.low; n <= this.high; n++) if (!BLACK.has(n % 12)) whites.push(n);
    // keys keep a realistic width: a short keyboard is centred rather than stretched
    container.style.maxWidth = whites.length * MAX_WHITE_PX + 'px';
    const ww = 100 / whites.length;
    let wi = 0;
    for (let n = this.low; n <= this.high; n++) {
      const k = document.createElement('div');
      k.dataset.note = n;
      if (BLACK.has(n % 12)) {
        k.className = 'key black';
        k.style.left = `calc(${wi * ww}% - ${ww * 0.31}%)`;
        k.style.width = ww * 0.62 + '%';
      } else {
        k.className = 'key white';
        k.style.left = wi * ww + '%';
        k.style.width = ww + '%';
        if (n % 12 === 0) {
          const lab = document.createElement('span');
          lab.className = 'key-label';
          lab.textContent = noteName(n);
          k.appendChild(lab);
        }
        wi++;
      }
      container.appendChild(k);
      this.keys.set(n, k);
    }
    this.markComputerRange();
    this.markTarget(this.targetNote);
  }

  // Lessons: highlight the key the student should play (null clears it).
  markTarget(note) {
    this.targetNote = note;
    this.keys.forEach((k, n) => k.classList.toggle('target-key', n === note));
  }

  markComputerRange() {
    this.keys.forEach((k, n) => k.classList.toggle('in-range', n >= this.base && n <= this.base + 16));
  }

  shiftOctave(d) {
    if (this.fixed) return;
    const nb = this.base + d * 12;
    if (nb < 12 || nb + this.octaves * 12 > 108) return;
    this.releaseAll();
    this.base = nb;
    this.build(this.container);
    this.onOctave && this.onOctave(Math.floor(this.base / 12) - 1);
  }

  press(src, note) {
    const prev = this.held.get(src);
    if (prev === note) return;
    if (prev !== undefined) this.release(src);
    this.held.set(src, note);
    const k = this.keys.get(note);
    if (k) k.classList.add('down');
    this.onNoteOn(note);
  }

  release(src) {
    const note = this.held.get(src);
    if (note === undefined) return;
    this.held.delete(src);
    // keep the key lit if another source still holds the same note
    if (![...this.held.values()].includes(note)) {
      const k = this.keys.get(note);
      if (k) k.classList.remove('down');
    }
    this.onNoteOff(note);
  }

  releaseAll() { [...this.held.keys()].forEach((s) => this.release(s)); }

  bindPointer(container) {
    const noteAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el && el.closest('.key') ? Number(el.closest('.key').dataset.note) : null;
    };
    container.addEventListener('pointerdown', (e) => {
      const n = noteAt(e.clientX, e.clientY);
      if (n === null) return;
      e.preventDefault();
      container.setPointerCapture(e.pointerId);
      this.press('p' + e.pointerId, n);
    });
    container.addEventListener('pointermove', (e) => {
      const src = 'p' + e.pointerId;
      if (!this.held.has(src)) return;
      const n = noteAt(e.clientX, e.clientY);
      if (n !== null) this.press(src, n); // glissando
    });
    const up = (e) => this.release('p' + e.pointerId);
    container.addEventListener('pointerup', up);
    container.addEventListener('pointercancel', up);
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.target.closest && e.target.closest('select, input, textarea')) return;
      if (e.code === 'KeyZ') { this.shiftOctave(-1); return; }
      if (e.code === 'KeyX') { this.shiftOctave(1); return; }
      const off = KEY_MAP[e.code];
      if (off === undefined) return;
      e.preventDefault();
      this.press('k' + e.code, this.base + off);
    });
    window.addEventListener('keyup', (e) => {
      if (KEY_MAP[e.code] !== undefined) this.release('k' + e.code);
    });
    window.addEventListener('blur', () => this.releaseAll());
  }
}
