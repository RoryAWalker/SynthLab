// The NF-ModRack's Wavetable: its screen. Shows the wave at the current Position (bright), with the
// table's other frames stacked faintly behind, so you can see what Position will sweep through.
//   ◂ ▸     step through the built-in tables
//   Load…   make a table from an audio file of your own (see wavetables.js)
// Behaves like a control for the 'table' setting; whenever the table changes it hands the frames to
// the engine (which makes them band-limited).

import { PARAMS } from './params.js';
import { framesOf, tableName, tableFromFile, BUILT_IN, FRAME } from './wavetables.js';

const W = 300, H = 176;

export class TableScreen {
  // post(msg) to the engine; getPatch(); live() (the engine's report); toast(text): set by main.js
  static post = () => {};
  static getPatch = () => ({});
  static live = () => null;
  static toast = () => {};

  constructor(id, value, onChange) {
    this.id = id;
    this.inst = id.split('.')[0];
    this.spec = PARAMS[id];
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'node-cell table-cell';
    this.el.dataset.param = id;
    this.el.innerHTML = `
      <div class="ne-bar" style="width:${W}px">
        <span class="ne-group"><button class="ne-btn tb-prev" title="The previous built-in table">◂</button><button class="ne-btn tb-next" title="The next built-in table">▸</button></span>
        <span class="tb-name"></span>
        <button class="ne-btn tb-load" title="Make a table from an audio file of your own">Load…</button>
        <input type="file" accept="audio/*" hidden>
      </div>
      <canvas class="ne-screen table-screen" data-help="${id}"></canvas>`;
    this.cv = this.el.querySelector('canvas');
    this.cv.style.width = W + 'px';
    this.cv.style.height = H + 'px';
    this.nameEl = this.el.querySelector('.tb-name');
    const step = (d) => {
      const i = BUILT_IN.findIndex(([k]) => 'b:' + k === this.value);
      this.commit('b:' + BUILT_IN[(i + d + BUILT_IN.length) % BUILT_IN.length][0]);
    };
    this.el.querySelector('.tb-prev').addEventListener('click', (e) => { e.stopPropagation(); step(-1); });
    this.el.querySelector('.tb-next').addEventListener('click', (e) => { e.stopPropagation(); step(1); });
    const file = this.el.querySelector('input');
    this.el.querySelector('.tb-load').addEventListener('click', (e) => { e.stopPropagation(); file.click(); });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      this.nameEl.textContent = 'Loading…';
      try { this.commit(await tableFromFile(f)); TableScreen.toast(`Made a table of ${framesOf(this.value).length} frames from "${f.name}"`); }
      catch { this.set(this.value); TableScreen.toast(`"${f.name}" could not be read as audio. Try a WAV, MP3 or AIFF file.`); }
    });
    this.set(value);
    this.loop();
  }

  set(value) {
    if (value === this.value && this.frames) return;
    this.value = value;
    this.frames = framesOf(value) || framesOf(this.spec.def);
    this.nameEl.textContent = tableName(value) + ` · ${this.frames.length} frame${this.frames.length > 1 ? 's' : ''}`;
    TableScreen.post({ type: 'table', id: this.inst, frames: this.frames });
    this.draw();
  }
  commit(value) { if (value === this.value) return; this.set(value); this.onChange(this.id, value); }

  loop() {
    const tick = () => {
      if (!this.el.isConnected && this.started) return;
      this.started = true;
      const l = TableScreen.live(), pos = l && l.tables && l.tables[this.inst] !== undefined ? l.tables[this.inst] : TableScreen.getPatch()[`${this.inst}.pos`];
      if (pos !== this.pos) { this.pos = pos; this.draw(); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  draw() {
    if (!this.frames) return;
    const cv = this.cv, k = 2, fr = this.frames, n = fr.length;
    if (cv.width !== W * k) { cv.width = W * k; cv.height = H * k; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#06100a';
    ctx.fillRect(0, 0, W, H);
    // the frames, stacked: the first at the back (up and right), the last at the front
    const dx = 46, dy = 50, w = W - dx - 12, h = 60;
    const wave = (f, ox, oy, style, lw) => {
      ctx.strokeStyle = style; ctx.lineWidth = lw;
      ctx.beginPath();
      for (let s = 0; s <= FRAME; s += 2) { const x = ox + (s / FRAME) * w, y = oy - f[s % FRAME] * h / 2; if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    };
    const at = (i) => { const t = n > 1 ? i / (n - 1) : 0; return [6 + dx * (1 - t), H - 12 - h / 2 - dy * (1 - t)]; };
    const every = Math.max(1, Math.round(n / 16));
    for (let i = 0; i < n; i += every) { const [ox, oy] = at(i); wave(fr[i], ox, oy, 'rgba(120, 220, 160, 0.2)', 1); }
    // the wave at Position (between two frames, as the engine plays it), bright, in its place in the stack
    const pos = Math.max(0, Math.min(1, this.pos || 0)), x = pos * (n - 1), i = Math.min(n - 2, Math.floor(x)), t = x - i;
    const cur = n > 1 ? Float32Array.from(fr[i], (v, s) => v * (1 - t) + fr[i + 1][s] * t) : fr[0];
    const [ox, oy] = at(x);
    wave(cur, ox, oy, '#ffb547', 2);
    ctx.fillStyle = 'rgba(255, 181, 71, 0.85)';
    ctx.font = '700 10px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`frame ${(x + 1).toFixed(1)} of ${n}`, W - 6, 14);
  }
}
