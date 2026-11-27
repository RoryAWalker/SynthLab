// The NF-ModRack's Quantizer: its screen. One octave of keys, C to B: the lit keys are in the scale
// (from its root), and the note it is playing now glows. Click a key to put it in or take it out
// (making your own scale); the menu chooses a ready-made scale. Behaves like a control for the
// 'mask' setting: twelve 1s and 0s, the first for the root, the next for a semitone above, and so on.

import { PARAMS } from './params.js';
import { SCALES, NOTE_NAMES } from './synths/modrack.js';

const W = 300, H = 120;
const BLACK = [1, 3, 6, 8, 10];

export class ScaleScreen {
  static live = () => null;
  static getPatch = () => ({});

  constructor(id, value, onChange) {
    this.id = id;
    this.inst = id.split('.')[0];
    this.spec = PARAMS[id];
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'node-cell scale-cell';
    this.el.dataset.param = id;
    this.el.innerHTML = `
      <div class="ne-bar" style="width:${W}px">
        <select class="sc-menu" aria-label="Scale">${SCALES.map(([name, m]) => `<option value="${m}">${name}</option>`).join('')}<option value="" disabled>Your own scale</option></select>
      </div>
      <canvas class="ne-screen scale-screen" data-help="${id}"></canvas>`;
    this.cv = this.el.querySelector('canvas');
    this.cv.style.width = W + 'px';
    this.cv.style.height = H + 'px';
    this.menu = this.el.querySelector('.sc-menu');
    this.menu.addEventListener('change', () => { if (this.menu.value) this.commit(this.menu.value); this.menu.blur(); });
    // (keys pressed while the menu has focus must not play notes)
    this.menu.addEventListener('keydown', (e) => e.stopPropagation());
    this.menu.addEventListener('keyup', (e) => e.stopPropagation());
    this.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.click(e); });
    this.set(value);
    this.loop();
  }

  set(value) {
    this.value = value;
    this.menu.value = SCALES.some(([, m]) => m === value) ? value : ''; // (one of your own: shown as such)
    this.draw();
  }
  commit(value) { if (value === this.value || !value.includes('1')) return; this.set(value); this.onChange(this.id, value); }

  // the keys: 7 white across the width, 5 black between
  keys() {
    const ww = W / 7, out = [];
    [0, 2, 4, 5, 7, 9, 11].forEach((n, i) => out.push({ n, x: i * ww, y: 0, w: ww, h: H, black: false }));
    [[1, 1], [3, 2], [6, 4], [8, 5], [10, 6]].forEach(([n, after]) => out.push({ n, x: after * ww - ww * 0.32, y: 0, w: ww * 0.64, h: H * 0.6, black: true }));
    return out;
  }
  root() { return ScaleScreen.getPatch()[`${this.inst}.root`] || 0; }
  inScale(n) { return this.value[(((n - this.root()) % 12) + 12) % 12] === '1'; }

  click(e) {
    const r = this.cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    const ks = this.keys(), hit = ks.filter((k) => k.black).find((k) => x >= k.x && x <= k.x + k.w && y <= k.h) || ks.find((k) => !k.black && x >= k.x && x <= k.x + k.w);
    if (!hit) return;
    const i = (((hit.n - this.root()) % 12) + 12) % 12;
    this.commit(this.value.slice(0, i) + (this.value[i] === '1' ? '0' : '1') + this.value.slice(i + 1));
  }

  loop() {
    const tick = () => {
      if (!this.el.isConnected && this.started) return;
      this.started = true;
      const l = ScaleScreen.live(), n = l && l.quants ? l.quants[this.inst] : undefined;
      const key = `${n}|${this.root()}|${this.value}`;
      if (key !== this.lastKey) { this.lastKey = key; this.note = n; this.draw(); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  draw() {
    const cv = this.cv, k = 2;
    if (cv.width !== W * k) { cv.width = W * k; cv.height = H * k; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#06100a';
    ctx.fillRect(0, 0, W, H);
    const playing = this.note === undefined ? -1 : ((this.note % 12) + 12) % 12, root = this.root();
    this.keys().sort((a, b) => a.black - b.black).forEach((key) => {
      const on = this.inScale(key.n), now = key.n === playing;
      ctx.fillStyle = now ? '#fff0cf' : on ? (key.black ? '#b97a1f' : '#ffb547') : key.black ? '#16181a' : '#2a2d31';
      ctx.fillRect(key.x + 1, key.y + 1, key.w - 2, key.h - 2);
      if (now) { ctx.save(); ctx.shadowColor = 'rgba(255, 220, 150, 1)'; ctx.shadowBlur = 12; ctx.fillRect(key.x + 1, key.y + 1, key.w - 2, key.h - 2); ctx.restore(); }
      ctx.font = `700 ${key.black ? 8.5 : 10}px "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = on || now ? '#1a1206' : 'rgba(236, 236, 236, 0.45)';
      ctx.fillText(NOTE_NAMES[key.n] + (key.n === root ? ' ●' : ''), key.x + key.w / 2, key.y + key.h - 7);
    });
  }
}
