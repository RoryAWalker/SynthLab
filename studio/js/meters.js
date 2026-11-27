// The NF-Mix4 console's meters: LED ladders on the channels, aux and main buses, and a pair of
// moving-needle meters for the main mix. A switch on the desk sets how they all behave:
//
//   VU  (volume units): reads the AVERAGE level, slowly (300 ms to rise), so it shows how loud
//       things feel rather than the peaks. 0 VU is the desk's working level, +4 dBu.
//   PPM (peak programme meter, British style): reads the PEAKS, rising almost at once and falling
//       back slowly (24 dB in 2.8 s) so the eye can catch them. Marks 1 to 7, 4 dB apart; mark 4
//       is 0 dBu and mark 6 is +8 dBu, the usual peak limit.
//
// Everything is in console units: 0 VU = +4 dBu = -18 dBFS in a digital recorder, so the desk has
// 18 dB of headroom above its working level before 0 dBFS (+22 dBu), where digital audio clips.
// While anything is soloed, the main meters read the solo (PFL) bus instead of the mix.

export const DBU_AT_0DBFS = 22; // dBu = dBFS + 22
export const toDbu = (dbfs) => dbfs + DBU_AT_0DBFS;
export const fmtDbu = (dbfs) => (dbfs < -90 ? '—' : (toDbu(dbfs) >= 0.5 ? '+' : toDbu(dbfs) <= -0.5 ? '−' : '') + Math.abs(Math.round(toDbu(dbfs))) + ' dBu');

// the LED ladders' lights, in dBu (bottom to top); +4 is 0 VU, the working level
const LIGHTS = [-26, -22, -18, -14, -10, -6, -2, 2, 4, 6, 8, 10, 12, 16, 20, 22];
const lightClass = (d) => (d >= 20 ? 'red' : d > 4 ? 'amber' : d === 4 ? 'ref' : 'green');

const lin = (db) => Math.pow(10, db / 20);
const db = (x) => (x > 1e-7 ? 20 * Math.log10(x) : -140);

export class ConsoleMeters {
  constructor(engine, getPatch) {
    this.engine = engine;
    this.getPatch = getPatch;
    this.meters = [];
    this.last = performance.now();
    requestAnimationFrame(() => this.loop());
  }

  get mode() { return this.getPatch()['meter.mode'] === 'ppm' ? 'ppm' : 'vu'; }

  // a segmented LED ladder; key: ch1..ch4, aux1, aux2, fx, mainL, mainR, gr (bus comp), ocgr (outboard comp)
  ladder(key, text, help) {
    const el = document.createElement('div');
    const gr = key === 'gr' || key === 'ocgr';
    el.className = `meter meter-${help}` + (gr ? ' meter-gr' : '');
    el.dataset.help = help;
    const lights = gr ? 12 : LIGHTS.length;
    el.innerHTML = `<div class="meter-clip"></div><div class="meter-ladder">${Array.from({ length: lights }, (_, i) =>
      `<i class="${gr ? '' : lightClass(LIGHTS[lights - 1 - i])}"></i>`).join('')}</div>${text ? `<div class="meter-label">${text}</div>` : ''}`;
    this.meters.push({ kind: 'ladder', key, el, segs: [...el.querySelectorAll('i')].reverse(), clip: el.querySelector('.meter-clip'), v: 0, clipAt: 0, hold: -1, holdAt: 0 });
    return el;
  }

  // a moving-needle meter (the main mix, left or right)
  needle(key, text) {
    const el = document.createElement('div');
    el.className = 'needle-meter';
    el.dataset.help = 'needlemeter';
    el.innerHTML = `<canvas></canvas><div class="needle-label">${text}</div>`;
    const cv = el.querySelector('canvas');
    this.meters.push({ kind: 'needle', key, el, cv, text, v: 0, shown: null });
    return el;
  }

  // lit while the main meters are reading the solo bus
  pflLamp() {
    const el = document.createElement('div');
    el.className = 'pfl-lamp';
    el.dataset.help = 'pfllamp';
    el.innerHTML = '<span class="pfl-dot"></span>PFL';
    this.pfl = el;
    return el;
  }

  // the level a meter is fed (dBFS peak and RMS) from the engine's latest report
  feed(key, live) {
    if (!live) return [-140, -140, false];
    const ch = /^ch(\d)$/.exec(key);
    if (ch) { const c = live.ch[ch[1] - 1]; return [c.eq, c.rms, !!c.clip]; }
    // the main meters show the solo bus while anything is soloed
    if ((key === 'mainL' || key === 'mainR') && live.anySolo) return [live.solo, live.rms.solo, live.solo >= -0.1];
    return [live[key], live.rms ? live.rms[key] : live[key], live[key] >= -0.1];
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const live = this.engine.running && this.engine.live && this.engine.live.console ? this.engine.live : null;
    const mode = this.mode;
    if (this.pfl) this.pfl.classList.toggle('on', !!(live && live.anySolo));
    this.meters.forEach((m) => {
      if (m.key === 'gr' || m.key === 'ocgr') { // gain reduction (bus comp, outboard comp): its own simple fall
        const g = live ? (m.key === 'gr' ? live.grMax : live.ocgrMax) || 0 : 0;
        m.v = Math.max(g, m.v - 30 * dt);
        m.segs.forEach((s, i) => s.classList.toggle('on', m.v > 0.3 && (m.segs.length - 1 - i) < m.v / 12 * m.segs.length));
        return;
      }
      const [peak, rms, clipped] = this.feed(m.key, live);
      if (mode === 'vu') {
        // VU: the average level, rising and falling over about 300 ms
        m.v += (lin(rms) - m.v) * (1 - Math.exp(-dt / 0.065));
      } else {
        // PPM: up at once to the peak, back down 24 dB in 2.8 seconds
        const fall = m.v * lin(-24 / 2.8 * dt);
        m.v = Math.max(lin(peak), fall);
      }
      const dbu = toDbu(db(m.v));
      if (m.kind === 'ladder') {
        // peak hold: the highest light reached stays lit for 1.5 s (always from the true peak)
        const pk = toDbu(peak);
        let top = -1;
        LIGHTS.forEach((d, i) => { if (pk >= d - 0.01) top = i; });
        if (top >= m.hold || now - m.holdAt > 1500) { m.hold = top; m.holdAt = now; }
        m.segs.forEach((s, i) => {
          s.classList.toggle('on', dbu >= LIGHTS[i] - 0.01);
          s.classList.toggle('hold', i === m.hold && m.hold >= 0 && dbu < LIGHTS[i] - 0.01);
        });
        if (clipped) m.clipAt = now;
        m.clip.classList.toggle('on', now - m.clipAt < 1200);
      } else {
        this.drawNeedle(m, dbu, mode, !!(live && live.anySolo));
      }
    });
  }

  // ---- the needle meters' faces ----
  drawNeedle(m, dbu, mode, pfl) {
    const cv = m.cv;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * 1.5;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vu = mode === 'vu';
    // the face
    ctx.fillStyle = vu ? '#f1e3b5' : '#141414';
    ctx.fillRect(0, 0, w, h);
    if (vu) { // a warm backlight
      const g = ctx.createRadialGradient(w / 2, h, 10, w / 2, h, h * 1.2);
      g.addColorStop(0, 'rgba(255, 220, 140, 0.55)'); g.addColorStop(1, 'rgba(255, 220, 140, 0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    const cx = w / 2, cy = h * 1.05, R = h * 0.82;
    const A0 = -0.80, A1 = 0.80; // the needle's swing, radians either side of upright
    // position (0..1) along the scale for a reading in dBu
    const posOf = vu
      ? (d) => Math.min(1.02, Math.max(-0.02, Math.pow(10, (d - 4) / 20) / Math.pow(10, 3 / 20))) // a VU scale is spaced by voltage
      : (d) => Math.min(1.02, Math.max(-0.02, d < -12 ? 0.08 * Math.max(0, (d + 24) / 12) : 0.08 + (d + 12) / 24 * 0.84)); // PPM: marks evenly spaced
    const angOf = (pos) => A0 + (A1 - A0) * pos;
    const at = (a, r) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    const ink = vu ? '#1d1a14' : '#f2f2f2', red = vu ? '#c32a1d' : '#ff5a4a';
    ctx.lineWidth = 1.2;
    // scale arc (red above 0 VU / mark 6)
    const redFrom = vu ? posOf(4) : posOf(8);
    ctx.strokeStyle = ink;
    ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2 + A0, -Math.PI / 2 + angOf(redFrom)); ctx.stroke();
    ctx.strokeStyle = red; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, R + 1, -Math.PI / 2 + angOf(redFrom), -Math.PI / 2 + A1); ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.font = `700 ${Math.round(h * 0.11)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    const tick = (d, text, big, colour) => {
      const a = angOf(posOf(d));
      const [x0, y0] = at(a, R - (big ? 7 : 4)), [x1, y1] = at(a, R + 2);
      ctx.strokeStyle = colour; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      if (text) { const [tx, ty] = at(a, R + 9); ctx.fillStyle = colour; ctx.fillText(text, tx, ty); }
    };
    if (vu) {
      [[-20, '20'], [-10, '10'], [-7, '7'], [-5, '5'], [-3, '3'], [-2, ''], [-1, ''], [0, '0'], [1, ''], [2, ''], [3, '+3']].forEach(([v, t]) =>
        tick(v + 4, t, !!t, v > 0 ? red : ink));
      ctx.fillStyle = ink; ctx.font = `800 ${Math.round(h * 0.17)}px Georgia, serif`;
      ctx.fillText('VU', cx, cy - R * 0.42);
    } else {
      for (let k = 1; k <= 7; k++) tick(-12 + (k - 1) * 4, String(k), true, k >= 7 ? red : ink);
      ctx.fillStyle = ink; ctx.font = `800 ${Math.round(h * 0.12)}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText('PPM', cx, cy - R * 0.42);
    }
    if (pfl) { ctx.fillStyle = '#e08a00'; ctx.font = `800 ${Math.round(h * 0.11)}px "Helvetica Neue", Arial, sans-serif`; ctx.fillText('PFL', cx, cy - R * 0.22); }
    // the needle, with a little mechanical lag so it moves like a real one
    const target = angOf(posOf(Number.isFinite(dbu) ? dbu : -60));
    m.shown = m.shown === null ? target : m.shown + (target - m.shown) * 0.5;
    const [nx, ny] = at(m.shown, R + 4);
    ctx.strokeStyle = vu ? '#111' : '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();
    // glass shading
    const gl = ctx.createLinearGradient(0, 0, 0, h);
    gl.addColorStop(0, 'rgba(255,255,255,0.18)'); gl.addColorStop(0.4, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, w, h);
  }
}
