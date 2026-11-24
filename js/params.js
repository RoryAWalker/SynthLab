// The synth in use, plus helpers shared by every synth.
// Each synth's controls, panel layout and factory patches live in js/synths/.
// The synth is chosen on the start menu and carried in the page address (?synth=nf3).

import { NF1 } from './synths/nf1.js';
import { NF3 } from './synths/nf3.js';
import { FX_PARAMS, FX_SECTIONS } from './fx.js';

export const SYNTHS = [NF1, NF3];
const wanted = new URLSearchParams(location.search).get('synth');
export const SYNTH = SYNTHS.find((s) => s.id === wanted) || NF1;
export const SYNTH_CHOSEN = SYNTHS.some((s) => s.id === wanted); // false: show the start menu

// every synth's own controls, plus the shared effects
export const PARAMS = { ...SYNTH.PARAMS, ...FX_PARAMS };
export const LAYOUT = SYNTH.LAYOUT;
export const KEYBED_SECTIONS = SYNTH.KEYBED_SECTIONS;
export const PRESETS = SYNTH.PRESETS;
export { FX_SECTIONS };
export const ALL_SECTIONS = [...LAYOUT.flat(), ...KEYBED_SECTIONS, ...FX_SECTIONS];

// A synth name for display: capitals (and digits) bold, lower-case letters lighter,
// e.g. NiniFoog -> bold N and F.
export function nameHtml(name) {
  return `<span class="synth-name">${name.replace(/[A-Z0-9-]/g, (c) => `<b>${c}</b>`)}</span>`;
}

// ---- value <-> knob position (0..1) -------------------------------------------
export function toNorm(id, v) {
  const p = PARAMS[id];
  if (p.type === 'step') {
    const i = p.options.findIndex((o) => o.v === v);
    return p.options.length > 1 ? Math.max(0, i) / (p.options.length - 1) : 0;
  }
  if (p.curve === 'log') return Math.log(v / p.min) / Math.log(p.max / p.min);
  if (p.curve === 'pow') return Math.pow((v - p.min) / (p.max - p.min), 1 / p.k);
  return (v - p.min) / (p.max - p.min);
}

export function fromNorm(id, n) {
  const p = PARAMS[id];
  n = Math.min(1, Math.max(0, n));
  if (p.type === 'step') return p.options[Math.round(n * (p.options.length - 1))].v;
  if (p.curve === 'log') return p.min * Math.pow(p.max / p.min, n);
  if (p.curve === 'pow') return p.min + (p.max - p.min) * Math.pow(n, p.k);
  return p.min + (p.max - p.min) * n;
}

// Controls whose scale changes with other settings (spec.alt, e.g. NiniFoog Osc 3 Frequency
// in Hz when it runs as an LFO). altOn holds the ids currently showing their alternative.
export const altOn = new Set();
export const scaleSpec = (id) => (altOn.has(id) ? { ...PARAMS[id], ...PARAMS[id].alt } : PARAMS[id]);
export function updateAlts(patch) {
  const changed = [];
  for (const id in PARAMS) {
    const alt = PARAMS[id].alt;
    if (!alt) continue;
    const on = !!alt.when(patch);
    if (on !== altOn.has(id)) { if (on) altOn.add(id); else altOn.delete(id); changed.push(id); }
  }
  return changed;
}

export function formatValue(id, v) {
  const p = scaleSpec(id);
  if (p.type === 'step') return (p.options.find((o) => o.v === v) || p.options[0]).label;
  return p.fmt(v);
}

export function defaultPatch() {
  const patch = {};
  for (const id in PARAMS) patch[id] = PARAMS[id].def;
  return patch;
}

export const WAVE_ICONS = {
  sine: 'M0,6 C2,-2 4,-2 6,6 S10,14 12,6',
  tri: 'M0,6 L3,0 L9,12 L12,6',
  saw: 'M0,12 L6,0 L6,12 L12,0 L12,12',
  square: 'M0,12 L0,0 L6,0 L6,12 L12,12 L12,0',
  pulse: 'M0,12 L0,0 L3,0 L3,12 L12,12 L12,0',
  narrow: 'M0,12 L0,0 L1.4,0 L1.4,12 L12,12 L12,0',
  sh: 'M0,8 L3,8 L3,2 L6,2 L6,11 L9,11 L9,5 L12,5',
  shark: 'M0,12 Q4,3 6,0 L6,12 Q10,3 12,0',
  revsaw: 'M0,12 L0,0 L6,12 L6,0 L12,12',
  wide: 'M0,12 L0,0 L4,0 L4,12 L12,12 L12,0',
};
