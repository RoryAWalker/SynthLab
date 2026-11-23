import { PARAMS, LAYOUT, PRESETS, defaultPatch } from './params.js';
import { Knob } from './knob.js';
import { Engine } from './engine.js';
import { Scope, TIMEBASES } from './scope.js';
import { Keyboard, noteName } from './keyboard.js';

const engine = new Engine();
let patch = defaultPatch();
const knobs = {};
const sections = {};
let powerOn = false;

// ---- panel ---------------------------------------------------------------------------
function buildPanel() {
  const root = document.getElementById('sections');
  LAYOUT.forEach((sec, si) => {
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
        if (id === 'power') grid.appendChild(buildPower());
        else if (id) {
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
    root.appendChild(el);
    sections[sec.id] = el;
    if (si < LAYOUT.length - 1) {
      const div = document.createElement('div');
      div.className = 'section-divider';
      root.appendChild(div);
    }
  });
}

function buildPower() {
  const cell = document.createElement('div');
  cell.className = 'knob-cell power-cell';
  cell.innerHTML = `
    <div class="knob-label">Power</div>
    <div class="power-wrap">
      <div class="power-led" id="power-led"></div>
      <button class="rocker" id="power" aria-label="Power" aria-pressed="false"><span class="rocker-face"><i>I</i><i>O</i></span></button>
    </div>
    <div class="knob-value power-hint">Click to start</div>`;
  cell.querySelector('#power').addEventListener('click', togglePower);
  return cell;
}

async function setPower(on) {
  powerOn = on;
  document.body.classList.toggle('power-on', on);
  const btn = document.getElementById('power');
  btn.setAttribute('aria-pressed', String(on));
  if (on) await engine.start(patch);
  else await engine.suspend();
}
const togglePower = () => setPower(!powerOn);

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

  document.getElementById('show-values').addEventListener('change', (e) => document.body.classList.toggle('show-values', e.target.checked));

  const menu = document.getElementById('lock-menu');
  LAYOUT.forEach((sec) => {
    if (sec.id === 'out') return;
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
  TIMEBASES.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'tb-btn' + (t === 2 ? ' on' : '');
    b.textContent = t < 1 ? '.5' : String(t);
    b.title = `${t} ms per division`;
    b.addEventListener('click', () => {
      scope.timebase = t;
      tb.querySelectorAll('.tb-btn').forEach((x) => x.classList.toggle('on', x === b));
      document.getElementById('tb-readout').textContent = `${t} ms/div`;
    });
    tb.appendChild(b);
  });
  const hold = document.getElementById('hold-btn');
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

const keyboard = new Keyboard(document.getElementById('keys'), {
  low: 36, high: 72,
  onNoteOn: (n) => { if (!powerOn) setPower(true); engine.noteOn(n); },
  onNoteOff: (n) => engine.noteOff(n),
  onOctave: (o) => (document.getElementById('oct-readout').textContent = 'C' + o),
});
document.getElementById('oct-down').addEventListener('click', () => keyboard.shiftOctave(-1));
document.getElementById('oct-up').addEventListener('click', () => keyboard.shiftOctave(1));

const scope = new Scope(document.getElementById('scope'), document.getElementById('spectrum'), engine, () => patch['filt.cutoff']);
setInterval(() => document.getElementById('trig-led').classList.toggle('on', !!scope.triggered && engine.running), 120);

fit();
window.addEventListener('resize', fit);
document.addEventListener('visibilitychange', () => { if (document.hidden) keyboard.releaseAll(); });

// Public API for the future lesson/game layer and for poking at in the console.
window.synth = {
  getPatch: () => ({ ...patch }),
  setPatch,
  setParam: (id, v) => { if (knobs[id]) { knobs[id].commit(v); } },
  lockSection,
  unlockAll: () => LAYOUT.forEach((s) => lockSection(s.id, false)),
  noteOn: (n) => engine.noteOn(n),
  noteOff: (n) => engine.noteOff(n),
  power: setPower,
  params: PARAMS,
  noteName,
};
