// The NF-ModRack's Draw module: the screen you draw its shape on. Behaves like a control (set /
// commit), its value the shape string (see drawShape.js).
//
//   Draw   scribble the shape freehand; when you let go it becomes a few nodes that follow your line
//          (with Snap on: steps, one per grid column). It replaces the shape only where you drew.
//   Edit   drag a node to move it; drag a line up or down to bend it; double-click empty space to
//          add a node, or a node to delete it. Click a node to select it; Sus makes it the sustain node.
//   Snap   Off, 8 or 16: a grid that nodes (and drawn steps) snap to.
// A dot shows where the shape is being played.

import { PARAMS } from './params.js';
import { parse, serialize, valueAt, simplify, bend, MAX_NODES } from './drawShape.js';

const W0 = 404, H0 = 112;         // the screen's usual size, in panel pixels (spec.screen: [width, height] for another)
const PAD = 7;                    // room round the edge for the nodes
const HIT = 9;                    // how close (panel pixels) counts as on a node
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SNAPS = [0, 8, 16];

export class NodeEditor {
  // live(): the engine's latest report (for the play position); mode(): Once, Loop or Bounce
  static live = () => null;
  static mode = () => 'once';

  constructor(id, value, onChange) {
    this.id = id;
    this.inst = id.split('.')[0];
    this.spec = PARAMS[id];
    [this.W, this.H] = this.spec.screen || [W0, H0];
    this.onChange = onChange;
    this.tool = 'edit';
    this.snap = 0;
    this.sel = -1;
    this.el = document.createElement('div');
    this.el.className = 'node-cell';
    this.el.dataset.param = id;
    this.el.innerHTML = `
      <div class="ne-bar">
        <span class="ne-group"><button class="ne-btn" data-tool="draw" title="Draw the shape freehand">Draw</button><button class="ne-btn" data-tool="edit" title="Move nodes, bend lines, double-click to add or delete">Edit</button></span>
        <button class="ne-btn ne-snap" title="Snap to a grid">Snap: Off</button>
        <button class="ne-btn ne-sus" title="Make the selected node the sustain node (Once mode)">Sus</button>
      </div>
      <canvas class="ne-screen" data-help="${id}"></canvas>`;
    this.cv = this.el.querySelector('canvas');
    this.cv.style.width = this.W + 'px';
    this.el.querySelector('.ne-bar').style.width = this.W + 'px';
    this.cv.style.height = this.H + 'px';
    this.el.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.setTool(b.dataset.tool); }));
    this.snapBtn = this.el.querySelector('.ne-snap');
    this.snapBtn.addEventListener('click', (e) => { e.stopPropagation(); this.snap = SNAPS[(SNAPS.indexOf(this.snap) + 1) % SNAPS.length]; this.snapBtn.textContent = 'Snap: ' + (this.snap || 'Off'); this.draw(); });
    this.susBtn = this.el.querySelector('.ne-sus');
    this.susBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleSus(); });
    this.cv.addEventListener('pointerdown', (e) => this.down(e));
    this.cv.addEventListener('pointermove', (e) => this.move(e));
    this.cv.addEventListener('pointerup', (e) => this.up(e));
    this.cv.addEventListener('pointercancel', () => { this.drag = null; this.draw(); });
    this.cv.addEventListener('dblclick', (e) => e.preventDefault());
    // a waveform (the Wave VCO): one cycle, no sustain node
    this.cycle = !!this.spec.cycle;
    if (this.cycle) { this.susBtn.hidden = true; this.cv.classList.add('cycle'); }
    this.setTool('edit');
    this.set(value);
    this.loop();
  }

  setTool(t) {
    this.tool = t;
    this.el.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    this.cv.classList.toggle('drawing', t === 'draw');
    this.draw();
  }

  set(value) {
    this.value = value;
    this.shape = parse(value) || parse(this.spec.def);
    if (this.sel >= this.shape.nodes.length) this.sel = -1;
    this.draw();
  }

  commit(value) {
    if (value === this.value) return;
    this.set(value);
    this.onChange(this.id, value);
  }
  save() { this.commit(serialize(this.shape)); }

  // ---- positions ---------------------------------------------------------------------------
  px(n) { return [PAD + n.x * (this.W - 2 * PAD), PAD + (1 - n.y) * (this.H - 2 * PAD)]; }
  // a pointer position as shape coordinates (the panel is scaled, so measure the screen's real size)
  at(e) {
    const r = this.cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * this.W, y = ((e.clientY - r.top) / r.height) * this.H;
    return { x: clamp((x - PAD) / (this.W - 2 * PAD), 0, 1), y: clamp(1 - (y - PAD) / (this.H - 2 * PAD), 0, 1), cx: x, cy: y };
  }
  snapTo(v) { return this.snap ? Math.round(v * this.snap) / this.snap : v; }
  nodeAt(p) {
    let best = -1, d = HIT;
    this.shape.nodes.forEach((n, i) => { const [x, y] = this.px(n); const dd = Math.hypot(x - p.cx, y - p.cy); if (dd < d) { d = dd; best = i; } });
    return best;
  }
  segmentAt(p) {
    const ns = this.shape.nodes;
    for (let i = 0; i < ns.length - 1; i++) if (p.x >= ns[i].x && p.x <= ns[i + 1].x && ns[i + 1].x > ns[i].x) return i;
    return -1;
  }
  // a double press (detected here: a trackpad tap can miss 'dblclick')
  isDouble(e) {
    const now = performance.now(), last = this.lastPress;
    this.lastPress = { t: now, x: e.clientX, y: e.clientY };
    if (!last || now - last.t > 400 || Math.hypot(e.clientX - last.x, e.clientY - last.y) > 8) return false;
    this.lastPress = null;
    return true;
  }

  // ---- editing -------------------------------------------------------------------------------
  down(e) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    try { this.cv.setPointerCapture(e.pointerId); } catch { /* (a pointer that cannot be captured: carry on) */ }
    document.body.classList.add('knob-dragging'); // (cables and help hold still meanwhile)
    const p = this.at(e);
    if (this.tool === 'draw') { this.drag = { kind: 'draw', pts: [{ x: p.x, y: p.y }] }; this.draw(); return; }
    const ns = this.shape.nodes, hit = this.nodeAt(p);
    if (this.isDouble(e)) {
      if (hit > 0 && hit < ns.length - 1) { // delete a node (not the first or last)
        ns.splice(hit, 1);
        if (this.shape.sus === hit) this.shape.sus = -1; else if (this.shape.sus > hit) this.shape.sus--;
        this.sel = -1; this.save(); return;
      }
      if (hit < 0 && ns.length < MAX_NODES) { // add a node on the spot, where the line was
        const x = this.snapTo(p.x), y = this.snapTo(p.y);
        let i = ns.findIndex((n) => n.x > x);
        if (i <= 0) i = ns.length - 1;
        ns.splice(i, 0, { x, y, c: 0 });
        if (this.shape.sus >= i) this.shape.sus++;
        this.sel = i; this.save(); return;
      }
    }
    if (hit >= 0) { this.sel = hit; this.drag = { kind: 'node', i: hit }; this.draw(); return; }
    const seg = this.segmentAt(p);
    if (seg >= 0) this.drag = { kind: 'bend', i: seg, y0: p.cy, c0: ns[seg].c, up: ns[seg + 1].y >= ns[seg].y };
    this.sel = -1;
    this.draw();
  }

  move(e) {
    const d = this.drag;
    if (!d) return;
    const p = this.at(e), ns = this.shape.nodes;
    if (d.kind === 'node') {
      const n = ns[d.i], last = ns.length - 1;
      // the first and last nodes stay at the start and end; the others move between their neighbours
      if (d.i > 0 && d.i < last) n.x = clamp(this.snapTo(p.x), ns[d.i - 1].x, ns[d.i + 1].x);
      n.y = this.snapTo(p.y);
    } else if (d.kind === 'bend') {
      // drag the line up to bow it upwards, down to bow it downwards (whichever way it runs)
      const dy = (d.y0 - p.cy) / 50;
      ns[d.i].c = clamp(d.c0 + (d.up ? -dy : dy), -1, 1);
    } else if (d.kind === 'draw') {
      // a line drawn back over itself replaces what was drawn there
      while (d.pts.length > 1 && d.pts[d.pts.length - 1].x > p.x) d.pts.pop();
      d.pts.push({ x: p.x, y: p.y });
    }
    this.draw();
  }

  up() {
    const d = this.drag;
    this.drag = null;
    document.body.classList.remove('knob-dragging');
    if (!d) return;
    if (d.kind === 'draw') this.finishDrawing(d.pts);
    else this.save();
  }

  // the freehand line becomes nodes, replacing the shape between where it started and ended
  finishDrawing(pts) {
    if (pts.length < 2 || pts[pts.length - 1].x - pts[0].x < 0.01) { this.draw(); return; }
    let x0 = pts[0].x, x1 = pts[pts.length - 1].x;
    // (a line that starts or ends near the edge reaches it)
    if (x0 < 0.03) { x0 = 0; pts[0].x = 0; }
    if (x1 > 0.97) { x1 = 1; pts[pts.length - 1].x = 1; }
    let made;
    if (this.snap) { // steps: one level per grid column (the average of the line there)
      made = [];
      const g = this.snap, c0 = Math.floor(x0 * g + 1e-9), c1 = Math.ceil(x1 * g - 1e-9);
      for (let c = c0; c < c1; c++) {
        const inCol = pts.filter((q) => q.x >= c / g && q.x <= (c + 1) / g);
        const y = inCol.length ? inCol.reduce((a, q) => a + q.y, 0) / inCol.length : valueAt(pts.map((q) => ({ ...q, c: 0 })), (c + 0.5) / g);
        made.push({ x: c / g, y: this.snapTo(y), c: 0 }, { x: (c + 1) / g, y: this.snapTo(y), c: 0 });
      }
      x0 = c0 / g; x1 = c1 / g;
    } else {
      made = simplify(pts, 0.015).map((q) => ({ x: q.x, y: q.y, c: 0 }));
    }
    const ns = this.shape.nodes;
    // keep the nodes outside what was drawn, joined to it where it starts and ends
    const before = ns.filter((n) => n.x < x0), after = ns.filter((n) => n.x > x1);
    if (before.length) before.push({ x: x0, y: valueAt(ns, x0), c: 0 });
    if (after.length) after.unshift({ x: x1, y: valueAt(ns, x1), c: 0 });
    let all = [...before, ...made, ...after];
    if (all.length > MAX_NODES) all = all.filter((_, i) => i === 0 || i === all.length - 1 || i % Math.ceil(all.length / MAX_NODES) === 0);
    all[0].x = 0; all[all.length - 1].x = 1;
    // the sustain node stays if it was outside the drawing
    const susNode = this.shape.sus >= 0 ? ns[this.shape.sus] : null;
    this.shape = { nodes: all, sus: susNode ? all.indexOf(susNode) : -1 };
    if (this.shape.sus === 0 || this.shape.sus === all.length - 1) this.shape.sus = -1;
    this.sel = -1;
    this.save();
  }

  toggleSus() {
    const last = this.shape.nodes.length - 1;
    if (this.sel <= 0 || this.sel >= last) {
      // (nothing suitable selected: Sus off, or a hint)
      if (this.shape.sus >= 0) { this.shape.sus = -1; this.save(); }
      this.flash = performance.now();
      this.draw();
      return;
    }
    this.shape.sus = this.shape.sus === this.sel ? -1 : this.sel;
    this.save();
  }

  // ---- drawing the screen --------------------------------------------------------------------
  loop() {
    const tick = () => {
      if (!this.el.isConnected && this.started) return; // (taken out of the rack)
      this.started = true;
      const live = NodeEditor.live();
      const ph = live && live.draws ? live.draws[this.inst] : undefined;
      const pk = this.spec.transfer && live && live.shapers ? live.shapers[this.inst] : undefined;
      if (ph !== this.ph || pk !== this.pk) { this.ph = ph; this.pk = pk; this.draw(); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  draw() {
    if (!this.shape) return; // (not set yet)
    const cv = this.cv, k = 2; // drawn at twice the size, so it stays sharp when the panel is zoomed
    if (cv.width !== this.W * k) { cv.width = this.W * k; cv.height = this.H * k; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#06100a';
    ctx.fillRect(0, 0, this.W, this.H);
    // grid: quarters (or the Snap grid), and the middle level
    const g = this.snap || 4;
    ctx.strokeStyle = this.snap ? 'rgba(120, 220, 160, 0.16)' : 'rgba(120, 220, 160, 0.09)';
    ctx.lineWidth = 1;
    for (let i = 1; i < g; i++) {
      const x = PAD + (i / g) * (this.W - 2 * PAD) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, this.H - PAD); ctx.stroke();
      const y = PAD + (i / g) * (this.H - 2 * PAD) + 0.5;
      if (this.snap) { ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(this.W - PAD, y); ctx.stroke(); }
    }
    ctx.strokeStyle = 'rgba(120, 220, 160, 0.14)';
    ctx.beginPath(); ctx.moveTo(PAD, this.H / 2 + 0.5); ctx.lineTo(this.W - PAD, this.H / 2 + 0.5); ctx.stroke();

    const { nodes, sus } = this.shape;
    const mode = NodeEditor.mode(this.inst);
    if (this.spec.transfer) {
      // a Shaper's curve: the straight diagonal is "no change"; the band is how far the input
      // reaches into the curve (beyond the screen: past the edge, where Clip or Fold take over)
      ctx.save();
      ctx.strokeStyle = 'rgba(120, 220, 160, 0.3)'; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(PAD, this.H - PAD); ctx.lineTo(this.W - PAD, PAD); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.W / 2 + 0.5, PAD); ctx.lineTo(this.W / 2 + 0.5, this.H - PAD); ctx.stroke();
      ctx.restore();
      const l = NodeEditor.live(), pk = l && l.shapers ? l.shapers[this.inst] : 0;
      if (pk > 0.002) {
        const half = (this.W - 2 * PAD) / 2, reach = Math.min(1, pk) * half;
        ctx.fillStyle = pk > 1 ? 'rgba(232, 70, 59, 0.12)' : 'rgba(140, 220, 255, 0.1)';
        ctx.fillRect(this.W / 2 - reach, PAD, reach * 2, this.H - 2 * PAD);
        if (pk > 1) { ctx.fillStyle = 'rgba(255, 140, 120, 0.9)'; ctx.font = '700 9.5px "Helvetica Neue", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`input reaches ${pk.toFixed(1)}× past the edge`, this.W / 2, PAD + 11); }
      }
      ctx.fillStyle = 'rgba(120, 220, 160, 0.55)';
      ctx.font = '700 9px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'right'; ctx.fillText('in →', this.W - PAD - 2, this.H / 2 + 11);
      ctx.textAlign = 'left'; ctx.fillText('out ↑', this.W / 2 + 4, PAD + 9);
    } else if (this.cycle) { // the waveform's 0 line, and +1 / -1
      ctx.fillStyle = 'rgba(120, 220, 160, 0.5)';
      ctx.font = '700 9px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('+1', 2, PAD + 7); ctx.fillText('0', 2, this.H / 2 - 2); ctx.fillText('−1', 2, this.H - PAD - 1);
    }
    // the sustain node (Once mode): a dashed line and S
    if (sus >= 0 && !this.cycle) {
      const [sx] = this.px(nodes[sus]);
      ctx.save();
      ctx.strokeStyle = mode === 'once' ? 'rgba(140, 220, 255, 0.7)' : 'rgba(140, 220, 255, 0.25)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(sx + 0.5, PAD); ctx.lineTo(sx + 0.5, this.H - PAD); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = mode === 'once' ? 'rgba(140, 220, 255, 0.9)' : 'rgba(140, 220, 255, 0.35)';
      ctx.font = '700 10px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(mode === 'once' ? 'SUS' : 'SUS (Once only)', sx, this.H - 1);
    }
    // the shape: filled underneath (to the 0 line, for a waveform), and its line
    const path = new Path2D();
    const steps = 2;
    let [x, y] = this.px(nodes[0]);
    path.moveTo(x, y);
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const [ax] = this.px(a), [bx] = this.px(b);
      const n = Math.max(1, Math.ceil((bx - ax) / steps));
      for (let s = 1; s <= n; s++) {
        const t = s / n;
        path.lineTo(ax + (bx - ax) * t, this.px({ x: 0, y: a.y + (b.y - a.y) * bend(t, a.c) })[1]);
      }
      if (bx === ax) path.lineTo(bx, this.px(b)[1]);
    }
    const fill = new Path2D(path);
    const base = this.cycle ? this.H / 2 : this.H - PAD;
    fill.lineTo(this.W - PAD, base); fill.lineTo(PAD, base); fill.closePath();
    ctx.fillStyle = 'rgba(255, 181, 71, 0.12)';
    ctx.fill(fill);
    ctx.strokeStyle = '#ffb547';
    ctx.lineWidth = 2;
    ctx.stroke(path);
    // nodes (in Edit), the selected one larger
    if (this.tool === 'edit') {
      nodes.forEach((n, i) => {
        const [nx, ny] = this.px(n);
        ctx.fillStyle = i === this.sel ? '#fff0cf' : i === sus ? '#8cdcff' : '#ffb547';
        ctx.beginPath(); ctx.arc(nx, ny, i === this.sel ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
      });
    }
    // the line being drawn
    if (this.drag && this.drag.kind === 'draw') {
      ctx.strokeStyle = '#fff0cf';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      this.drag.pts.forEach((q, i) => { const [qx, qy] = this.px(q); if (i) ctx.lineTo(qx, qy); else ctx.moveTo(qx, qy); });
      ctx.stroke();
    }
    // where it is playing
    if (this.ph !== undefined && NodeEditor.live() && !this.cycle) {
      const [px] = this.px({ x: this.ph, y: 0 }), [, py] = this.px({ x: 0, y: valueAt(nodes, this.ph) });
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(255, 220, 150, 1)';
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Sus pressed with no node selected: say how
    if (this.flash && performance.now() - this.flash < 1800) {
      ctx.fillStyle = 'rgba(6, 16, 10, 0.85)';
      ctx.fillRect(this.W / 2 - 150, this.H / 2 - 12, 300, 22);
      ctx.fillStyle = '#8cdcff';
      ctx.font = '600 11px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click a node in Edit first, then Sus', this.W / 2, this.H / 2 + 3);
      setTimeout(() => this.draw(), 1850);
    }
    this.susBtn.classList.toggle('on', sus >= 0);
  }
}
