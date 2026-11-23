// Zoom and pan for the instrument.
//   Trackpad pinch (ctrl + wheel in Chrome/Firefox, gesture events in Safari) zooms
//   around the pointer. When zoomed in, two-finger scroll or a mouse wheel pans.
//   At 100% (fitted to the window) wheel events pass through, so knobs still turn.

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export class ZoomPan {
  constructor(viewport, stage, { onChange, onSettle } = {}) {
    this.vp = viewport;
    this.stage = stage;
    this.onChange = onChange;
    this.onSettle = onSettle; // called once zooming pauses (e.g. to re-render canvases sharply)
    this.base = 1;            // scale that fits the stage to the window
    this.zoom = 1;            // extra zoom on top of that
    this.tx = 0; this.ty = 0; // stage offset inside the viewport, in screen px

    viewport.addEventListener('wheel', (e) => this.onWheel(e), { passive: false, capture: true });
    // Safari (macOS) reports trackpad pinches as gesture events rather than ctrl+wheel
    let startZoom = 1;
    viewport.addEventListener('gesturestart', (e) => { e.preventDefault(); startZoom = this.zoom; });
    viewport.addEventListener('gesturechange', (e) => { e.preventDefault(); this.zoomTo(startZoom * e.scale, e.clientX, e.clientY); });
    viewport.addEventListener('gestureend', (e) => e.preventDefault());
  }

  get scale() { return this.base * this.zoom; }

  // Recompute the fitted scale (on load and window resize), keeping the current zoom.
  fit() {
    const designW = this.stage.offsetWidth;
    const designH = this.stage.offsetHeight;
    const oldScale = this.scale;
    this.base = Math.min(1, (this.vp.clientWidth - 32) / designW);
    this.vp.style.height = designH * this.base + 'px';
    if (this.zoom === 1) this.center();
    else { // keep the same point in the middle of the view
      const cx = this.vp.clientWidth / 2, cy = this.vp.clientHeight / 2;
      const lx = (cx - this.tx) / oldScale, ly = (cy - this.ty) / oldScale;
      this.tx = cx - lx * this.scale; this.ty = cy - ly * this.scale;
    }
    this.apply();
  }

  center() {
    this.tx = (this.vp.clientWidth - this.stage.offsetWidth * this.scale) / 2;
    this.ty = 0;
  }

  // Keep the stage covering the viewport (or centred when it is smaller).
  clamp() {
    const W = this.stage.offsetWidth * this.scale, H = this.stage.offsetHeight * this.scale;
    const V = this.vp.clientWidth, Vh = this.vp.clientHeight;
    this.tx = W <= V ? (V - W) / 2 : Math.min(0, Math.max(V - W, this.tx));
    this.ty = H <= Vh ? 0 : Math.min(0, Math.max(Vh - H, this.ty));
  }

  apply() {
    this.clamp();
    this.stage.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    document.body.classList.toggle('zoomed', this.zoom > 1.001);
    if (this.onChange) this.onChange(this.zoom);
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.onSettle && this.onSettle(this.scale), 180);
  }

  // Zoom so the point under (clientX, clientY) stays put.
  zoomTo(z, clientX, clientY) {
    const r = this.vp.getBoundingClientRect();
    if (clientX === undefined) { clientX = r.left + r.width / 2; clientY = r.top + r.height / 2; }
    const px = clientX - r.left, py = clientY - r.top;
    const lx = (px - this.tx) / this.scale, ly = (py - this.ty) / this.scale;
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    if (this.zoom < 1.001) { this.zoom = 1; this.center(); }
    else { this.tx = px - lx * this.scale; this.ty = py - ly * this.scale; }
    this.apply();
  }

  reset() { this.zoom = 1; this.center(); this.apply(); }

  onWheel(e) {
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.vp.clientHeight : 1;
    if (e.ctrlKey) {
      // trackpad pinch (browsers send it as ctrl + wheel); also ctrl + mouse wheel
      e.preventDefault();
      e.stopPropagation();
      this.zoomTo(this.zoom * Math.exp(-e.deltaY * unit * 0.01), e.clientX, e.clientY);
      return;
    }
    if (this.zoom > 1.001) {
      // zoomed in: scrolling moves around the synth (instead of turning knobs)
      e.preventDefault();
      e.stopPropagation();
      let dx = e.deltaX * unit, dy = e.deltaY * unit;
      if (e.shiftKey && !dx) { dx = dy; dy = 0; } // shift + mouse wheel scrolls sideways
      this.tx -= dx; this.ty -= dy;
      this.apply();
    }
  }
}
