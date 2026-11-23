// Celebrations drawn onto canvases each frame:
//   Smiley    - a phosphor smiley face on the scope screens when a sound is matched
//   Fireworks - colourful fireworks on the scopes (and full window) when a lesson is finished

// saturated colours, so the bursts bring colour into the green screens
const COLOURS = ['#ff4d6d', '#ffb547', '#4dd2ff', '#b388ff', '#5dff8f', '#ff8a3d', '#ffe14d', '#ff5ce1'];

export class Fireworks {
  // sound: optional object with launch(pan) and burst(pan), see fireworkSound()
  constructor(sound = null) {
    this.sound = sound;
    this.particles = [];
    this.rockets = [];
    this.until = 0;
    this.last = performance.now();
  }

  get active() { return this.particles.length > 0 || this.rockets.length > 0 || performance.now() < this.until; }

  // Launch a show: `duration` seconds of rockets, `rate` rockets per second, `size` burst scale.
  start({ duration = 2.2, rate = 3.5, size = 1 } = {}) {
    this.until = performance.now() + duration * 1000;
    this.rate = rate;
    this.size = size;
    this.spawnAcc = 1; // first rocket straight away
  }

  burst(x, y, size) {
    const colour = COLOURS[Math.floor(Math.random() * COLOURS.length)];
    const second = Math.random() < 0.35 ? COLOURS[Math.floor(Math.random() * COLOURS.length)] : colour;
    const n = Math.round((50 + Math.random() * 40) * size);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const speed = (60 + Math.random() * 120) * size;
      this.particles.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 1, decay: 0.5 + Math.random() * 0.5, colour: i % 2 ? colour : second,
        px: x, py: y,
      });
    }
  }

  draw(ctx, w, h) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.active) return;

    // launch rockets from the bottom; each bursts near the top part of the screen
    if (now < this.until) {
      this.spawnAcc += dt * this.rate;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        const tx = w * (0.15 + Math.random() * 0.7), ty = h * (0.18 + Math.random() * 0.35);
        this.rockets.push({ x: tx + (Math.random() - 0.5) * w * 0.1, y: h, tx, ty, t: 0, dur: 0.45 + Math.random() * 0.25 });
        if (this.sound) this.sound.launch(tx / w);
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.rockets = this.rockets.filter((r) => {
      r.t += dt;
      const f = Math.min(1, r.t / r.dur);
      const e = 1 - (1 - f) * (1 - f);
      const x = r.x + (r.tx - r.x) * e, y = r.y + (r.ty - r.y) * e;
      ctx.fillStyle = '#fff6dd';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      if (f >= 1) {
        const big = 0.55 + Math.random() * 1.0; // this burst's size, 0.55 (small) to 1.55 (big)
        this.burst(r.tx, r.ty, big * this.size * Math.min(2.2, Math.min(w, h * 2.5) / 600));
        if (this.sound) this.sound.burst(r.tx / w, big);
        return false;
      }
      return true;
    });
    this.particles = this.particles.filter((p) => {
      p.px = p.x; p.py = p.y;
      p.vx *= 0.985; p.vy = p.vy * 0.985 + 90 * dt; // drag and gravity
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) return false;
      ctx.strokeStyle = p.colour;
      ctx.globalAlpha = Math.min(1, p.life * 1.4);
      ctx.lineWidth = 2.6;
      // a short streak behind each spark
      ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); ctx.lineTo(p.x, p.y); ctx.stroke();
      return true;
    });
    ctx.restore();
  }
}

// One-off full-window show (lesson complete). Removes its canvas when finished.
export function finale(duration = 5, audioCtx = null) {
  const canvas = document.createElement('canvas');
  canvas.className = 'finale-canvas';
  document.body.appendChild(canvas);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = () => {
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  window.addEventListener('resize', size);
  const fx = new Fireworks(fireworkSound(audioCtx));
  fx.start({ duration, rate: 4, size: 1.4 });
  const ctx = canvas.getContext('2d');
  (function loop() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    fx.draw(ctx, innerWidth, innerHeight);
    if (fx.active) requestAnimationFrame(loop);
    else { window.removeEventListener('resize', size); canvas.remove(); }
  })();
}

// A green-phosphor smiley that draws itself like a scope trace, holds, then fades.
export class Smiley {
  constructor() { this.t0 = -1; }
  start() { this.t0 = performance.now(); }
  stop() { this.t0 = -1; }

  draw(ctx, w, h) {
    if (this.t0 < 0) return;
    const t = (performance.now() - this.t0) / 1000;
    const END = 2.8;
    if (t > END) { this.t0 = -1; return; }
    const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const fade = t > END - 0.6 ? (END - t) / 0.6 : 1;
    const r = h * 0.36;
    const cx = w / 2, cy = h / 2;
    const bounce = 1 + 0.06 * Math.sin(Math.min(1, t / 0.9) * Math.PI) + (t > 1 ? 0.025 * Math.sin((t - 1) * 7) : 0);

    ctx.save();
    // dim the trace behind so the face stands out
    ctx.globalAlpha = 0.6 * fade * ease(t / 0.3);
    ctx.fillStyle = '#04100a';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = fade;
    ctx.translate(cx, cy);
    ctx.scale(bounce, bounce);
    ctx.strokeStyle = '#a8ffc4';
    ctx.fillStyle = '#a8ffc4';
    ctx.shadowColor = 'rgba(80, 255, 150, 0.95)';
    ctx.shadowBlur = 14;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, r * 0.07);
    // face: drawn round like a trace
    const a = ease(t / 0.55);
    ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + a * Math.PI * 2); ctx.stroke();
    // eyes pop in
    const e = ease((t - 0.35) / 0.25);
    if (e > 0) {
      [-1, 1].forEach((s) => {
        ctx.beginPath();
        ctx.ellipse(s * r * 0.36, -r * 0.25, r * 0.09 * e, r * 0.14 * e, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // smile sweeps across
    const m = ease((t - 0.55) / 0.4);
    if (m > 0) {
      const start = Math.PI * 0.18, span = Math.PI * 0.64;
      ctx.beginPath(); ctx.arc(0, r * 0.02, r * 0.58, start, start + span * m); ctx.stroke();
    }
    ctx.restore();
  }
}

// Synthesised firework sounds: a rising whistle per rocket, then a bang and crackle per
// burst, panned to where it bursts. Plays straight to the speakers (not via the scopes).
export function fireworkSound(ctx) {
  if (!ctx) return null;
  const out = ctx.createGain();
  out.gain.value = 0.55;
  out.connect(ctx.destination);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  let live = 0; // limit overlapping sounds
  const panned = (x) => {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-0.9, Math.min(0.9, x * 2 - 1));
    p.connect(out);
    return p;
  };
  const noiseBurst = (dest, t, dur, gain, filterType, freq) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  };
  return {
    launch(x) {
      if (live > 6) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(700 + Math.random() * 300, t);
      o.frequency.exponentialRampToValueAtTime(2200 + Math.random() * 900, t + 0.55);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g); g.connect(panned(x));
      o.start(t); o.stop(t + 0.65);
    },
    // size: 0.55 (small) to 1.55 (big). Bigger bursts are lower, louder and longer.
    burst(x, size = 1) {
      if (live > 6) return;
      const s = (size - 0.55) / 1.0; // 0..1
      const pitch = Math.pow(2, 1.2 - 2.4 * s); // about 2.3x higher for the smallest, 0.44x for the biggest
      live++;
      setTimeout(() => live--, 1200);
      const t = ctx.currentTime;
      const dest = panned(x);
      // bang: low thump plus a filtered noise blast
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const len = 0.5 + 0.7 * s;      // bigger bursts ring on longer
      const loud = 0.6 + 0.5 * s;
      o.frequency.setValueAtTime(110 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(38 * pitch, t + 0.35 * len);
      g.gain.setValueAtTime(0.5 * loud, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4 * len);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.45 * len + 0.05);
      noiseBurst(dest, t, 0.9 * len, 0.55 * loud, 'lowpass', (1400 + Math.random() * 600) * pitch);
      // crackle: tiny bright grains scattered after the bang (more of them for big bursts)
      const grains = Math.round(8 + 14 * s);
      for (let i = 0; i < grains; i++) noiseBurst(dest, t + 0.15 + Math.random() * 0.9 * len, 0.025, 0.12 + Math.random() * 0.12, 'highpass', 2500 * Math.sqrt(pitch));
    },
  };
}
