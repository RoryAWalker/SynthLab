// Scales shared by the NF-4 console's engine (worklet), its controls and its screens, so the
// numbers on the panel always match what the audio does.

// fader position (0..1) -> dB: 0.75 is 0 dB (unity), the top is +10, the bottom is off
const TAPER = [[0, -Infinity], [0.04, -70], [0.15, -45], [0.3, -28], [0.45, -16], [0.6, -8], [0.75, 0], [0.875, 5], [1, 10]];
export function faderDb(p) {
  if (p <= 0.001) return -Infinity;
  for (let i = 1; i < TAPER.length; i++) {
    const [p1, d1] = TAPER[i];
    if (p <= p1) { const [p0, d0] = TAPER[i - 1]; return Number.isFinite(d0) ? d0 + (d1 - d0) * (p - p0) / (p1 - p0) : d1; }
  }
  return 10;
}
// dB -> fader position (for the scale printed beside the faders)
export function faderPos(db) {
  for (let i = 1; i < TAPER.length; i++) {
    const [p0, d0] = TAPER[i - 1], [p1, d1] = TAPER[i];
    if (db <= d1) return Number.isFinite(d0) ? p0 + (p1 - p0) * (db - d0) / (d1 - d0) : p1;
  }
  return 1;
}

// send and master knobs (0..1): off at the bottom, unity (0 dB) at 0.89, +6 dB at the top
export const sendDb = (v) => (v < 0.005 ? -Infinity : v * 56 - 50);

// the preamp's gain knob (0..1): Mic +10..+60 dB, Line -20..+30 dB
export const preampDb = (v, mic) => (mic ? 10 : -20) + 50 * v;

export const fmtDb = (d) => (!Number.isFinite(d) ? 'off' : (d > 0.05 ? '+' : d < -0.05 ? '−' : '') + Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0) + ' dB');

// The EQ's fixed frequencies
export const EQ_LOW = 80, EQ_HIGH = 12000, EQ_MID_Q = 0.9;

// RBJ biquad coefficients [b0, b1, b2, a1, a2] (normalised); type: hp, low, high, peak
export function biquad(type, f, q, gainDb, sr) {
  const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, cw = Math.cos(w), sw = Math.sin(w);
  const A = Math.pow(10, gainDb / 40), al = sw / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
  else { // shelves with a slope of 1
    const s = Math.sqrt(A) * sw * Math.SQRT2;
    if (type === 'low') {
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s;
    } else {
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s;
    }
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
// a biquad's gain in dB at frequency f (for drawing the EQ curve)
export function biquadDb(c, f, sr) {
  const w = 2 * Math.PI * f / sr;
  const re = (a, b, cc) => a + b * Math.cos(w) + cc * Math.cos(2 * w);
  const im = (a, b, cc) => -(b * Math.sin(w) + cc * Math.sin(2 * w));
  const nr = re(c[0], c[1], c[2]), ni = im(c[0], c[1], c[2]);
  const dr = re(1, c[3], c[4]), di = im(1, c[3], c[4]);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}
