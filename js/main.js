import { PARAMS, LAYOUT, KEYBED_SECTIONS, ALL_SECTIONS, PRESETS, defaultPatch } from './params.js';
import { Knob } from './knob.js';
import { Engine } from './engine.js';
import { Scope, TIMEBASES } from './scope.js';
import { Keyboard, noteName } from './keyboard.js';

const engine = new Engine();
let patch = defaultPatch();
const knobs = {};
const sections = {};

// ---- panel ---------------------------------------------------------------------------
function buildSection(sec) {
  const el = document.createElement('div');
  el.className = 'section';
  el.dataset.section = sec.id;
  el.innerHTML = `<div class="section-title"><span>${sec.title}</span></div><div class="section-grid"></div><div class="lock-veil"><span>LOCKED</span></div>`;
  const grid = el.querySelector('.section-grid');
  const cols = Math.max(...sec.rows.map((r) => r.length));
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--cell-w))`;
  sec.rows.forEach((row) => {
    for (let c = 0; c < cols; c++) {
      const id = row[c];
      if (id) {
        const k = new Knob(id, patch[id], onKnob);
        knobs[id] = k;
        grid.appendChild(k.el);
      } else {
        const blank = document.createElement('div');
        blank.className = 'knob-cell blank';
        grid.appendChild(blank);
      }
    }
  });
  sections[sec.id] = el;
  return el;
}

function buildPanel() {
  const root = document.getElementById('sections');
  LAYOUT.forEach((column, ci) => {
    const col = document.createElement('div');
    col.className = 'panel-column' + (column.length > 1 ? ' stacked' : '');
    column.forEach((sec) => col.appendChild(buildSection(sec)));
    root.appendChild(col);
    if (ci < LAYOUT.length - 1) {
      const div = document.createElement('div');
      div.className = 'section-divider';
      root.appendChild(div);
    }
  });
  const perf = document.getElementById('perf-sections');
  KEYBED_SECTIONS.forEach((sec) => perf.appendChild(buildSection(sec)));
}

// Audio can only start after a user gesture; the first key press does it.
function ensureAudio() {
  if (!engine.running) return engine.start(patch);
}

function onKnob(id, value) {
  patch[id] = value;
  engine.setParam(id, value);
  if (presetSel.value !== '') presetSel.value = '';
}

// ---- patch API (used by presets now, by the game layer later) --------------------------
function setPatch(p) {
  patch = { ...defaultPatch(), ...p };
  for (const id in knobs) knobs[id].set(patch[id]);
  engine.setPatch(patch);
}

function lockSection(id, locked = true) {
  const el = sections[id];
  if (!el) return;
  el.classList.toggle('locked', locked);
  el.querySelectorAll('.knob').forEach((k) => (k.tabIndex = locked ? -1 : 0));
  const cb = document.querySelector(`#lock-menu input[data-section="${id}"]`);
  if (cb) cb.checked = locked;
}

// ---- toolbar ------------------------------------------------------------------------------
const presetSel = document.getElementById('preset');
function buildToolbar() {
  const custom = document.createElement('option');
  custom.value = ''; custom.textContent = '— edited —'; custom.disabled = true;
  presetSel.appendChild(custom);
  Object.keys(PRESETS).forEach((name) => {
    const o = document.createElement('option');
    o.value = name; o.textContent = name;
    presetSel.appendChild(o);
  });
  presetSel.value = 'Init';
  presetSel.addEventListener('change', () => { setPatch(PRESETS[presetSel.value]); presetSel.blur(); });
  document.getElementById('btn-init').addEventListener('click', () => { setPatch({}); presetSel.value = 'Init'; });

  const showValues = document.getElementById('show-values');
  document.body.classList.toggle('show-values', showValues.checked);
  showValues.addEventListener('change', (e) => document.body.classList.toggle('show-values', e.target.checked));

  const menu = document.getElementById('lock-menu');
  ALL_SECTIONS.forEach((sec) => {
    const lab = document.createElement('label');
    lab.innerHTML = `<input type="checkbox" data-section="${sec.id}"> ${sec.title}`;
    lab.querySelector('input').addEventListener('change', (e) => lockSection(sec.id, e.target.checked));
    menu.appendChild(lab);
  });
  const btn = document.getElementById('btn-lock');
  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.classList.remove('open'); });

  // scope timebase
  const tb = document.getElementById('tb-buttons');
  const hold = document.getElementById('hold-btn');
  TIMEBASES.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'tb-btn' + (t === 2 ? ' on' : '');
    b.textContent = t < 1 ? '.5' : String(t);
    b.title = `${t} ms per division`;
    b.addEventListener('click', () => {
      scope.timebase = t;
      // changing the timebase means you want to see the live signal again
      scope.frozen = false;
      hold.classList.remove('on');
      tb.querySelectorAll('.tb-btn').forEach((x) => x.classList.toggle('on', x === b));
      document.getElementById('tb-readout').textContent = `${t} ms/div`;
    });
    tb.appendChild(b);
  });
  hold.addEventListener('click', () => { scope.frozen = !scope.frozen; hold.classList.toggle('on', scope.frozen); });
}

// ---- fit the fixed-size instrument to the window --------------------------------------
function fit() {
  const stage = document.getElementById('stage');
  const fitEl = document.getElementById('fit');
  const designW = stage.offsetWidth;
  const scale = Math.min(1, (window.innerWidth - 32) / designW);
  stage.style.transform = `scale(${scale})`;
  fitEl.style.height = stage.offsetHeight * scale + 40 + 'px';
}

// ---- boot ------------------------------------------------------------------------------------
buildPanel();
buildToolbar();

const loadPref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const savePref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

const keyboard = new Keyboard(document.getElementById('keys'), {
  octaves: Number(loadPref('nf1.octaves', 2)),
  onNoteOn: (n) => { ensureAudio(); engine.noteOn(n); }, // noteOn is queued until audio is up
  onNoteOff: (n) => engine.noteOff(n),
  onOctave: (o) => (document.getElementById('oct-readout').textContent = 'C' + o),
});
document.getElementById('oct-down').addEventListener('click', () => keyboard.shiftOctave(-1));
document.getElementById('oct-up').addEventListener('click', () => keyboard.shiftOctave(1));

// Keyboard Range switch: 1-4 octaves
const rangeBtns = document.getElementById('range-buttons');
for (let o = 1; o <= 4; o++) {
  const b = document.createElement('button');
  b.className = 'range-btn' + (o === keyboard.octaves ? ' on' : '');
  b.textContent = o;
  b.title = `${o} octave${o > 1 ? 's' : ''}`;
  b.addEventListener('click', () => {
    keyboard.setOctaves(o);
    savePref('nf1.octaves', o);
    rangeBtns.querySelectorAll('.range-btn').forEach((x) => x.classList.toggle('on', x === b));
  });
  rangeBtns.appendChild(b);
}

const scope = new Scope(document.getElementById('scope'), document.getElementById('spectrum'), engine, () => patch['filt.cutoff']);
setInterval(() => document.getElementById('trig-led').classList.toggle('on', !!scope.triggered && engine.running), 120);

fit();
window.addEventListener('resize', fit);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { keyboard.releaseAll(); engine.suspend(); }
});

// Public API for the future lesson/game layer and for poking at in the console.
window.synth = {
  getPatch: () => ({ ...patch }),
  setPatch,
  setParam: (id, v) => { if (knobs[id]) { knobs[id].commit(v); } },
  lockSection,
  unlockAll: () => ALL_SECTIONS.forEach((s) => lockSection(s.id, false)),
  noteOn: (n) => { ensureAudio(); engine.noteOn(n); },
  noteOff: (n) => engine.noteOff(n),
  setKeyboardOctaves: (o) => keyboard.setOctaves(o),
  params: PARAMS,
  noteName,
};
