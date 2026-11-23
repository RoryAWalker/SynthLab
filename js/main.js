import { PARAMS, LAYOUT, KEYBED_SECTIONS, ALL_SECTIONS, PRESETS, defaultPatch } from './params.js';
import { Knob } from './knob.js';
import { Toggle } from './toggle.js';
import { Engine } from './engine.js';
import { Scope, TIMEBASES } from './scope.js';
import { Keyboard, noteName } from './keyboard.js';
import { HelpPanel } from './helpPanel.js';
import { Overlay } from './visuals.js';
import { ZoomPan } from './zoom.js';
import { LessonController } from './lessonUI.js';
import { PatchMenu } from './patches.js';

const engine = new Engine();
let patch = defaultPatch();
const knobs = {};
const sections = {};
let help = null; // HelpPanel, created at boot
let lesson = null; // LessonController, created at boot
const overlay = new Overlay(() => patch, engine); // teaching graphs on the spectrum display

// ---- panel ---------------------------------------------------------------------------
function buildSection(sec) {
  const el = document.createElement('div');
  el.className = 'section';
  el.dataset.section = sec.id;
  el.innerHTML = `<div class="section-title" data-help="section:${sec.id}"><span>${sec.title}</span></div><div class="section-grid"></div><div class="lock-veil"><span>LOCKED</span></div>`;
  const grid = el.querySelector('.section-grid');
  const cols = Math.max(...sec.rows.map((r) => r.length));
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--cell-w))`;
  sec.rows.forEach((row) => {
    for (let c = 0; c < cols; c++) {
      const id = row[c];
      if (id) {
        const k = PARAMS[id].ui === 'toggle' ? new Toggle(id, patch[id], onKnob) : new Knob(id, patch[id], onKnob);
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

// Line up the rows of single-section columns (Mixer, Filter, LFO) with the rows of
// stacked sections (Oscillator 1 / 2), so related knobs sit level across the panel.
// Runs before the stage is scaled, so measurements are in design pixels.
function alignRows() {
  LAYOUT.flat().forEach((sec) => {
    if (!sec.alignRows) return;
    const grid = sections[sec.id].querySelector('.section-grid');
    const [a, b] = sec.alignRows.map((id) => sections[id].querySelector('.section-grid').getBoundingClientRect().top);
    const rowH = grid.firstElementChild.getBoundingClientRect().height;
    grid.style.rowGap = Math.max(0, b - a - rowH) + 'px';
  });
}

// Audio can only start after a user gesture; the first key press does it.
function ensureAudio() {
  if (!engine.running) return engine.start(patch);
}

function onKnob(id, value) {
  patch[id] = value;
  if (!(lesson && lesson.busy)) engine.setParam(id, value); // while a lesson target plays, keep it intact
  if (lesson) lesson.onPatchChange();
  if (help) help.refresh(id);
  overlay.activate(id);
  if (patchMenu) patchMenu.markEdited();
}

// ---- patch API (used by presets now, by the game layer later) --------------------------
function setPatch(p) {
  patch = { ...defaultPatch(), ...p };
  for (const id in knobs) knobs[id].set(patch[id]);
  engine.setPatch(patch);
  if (help) help.refresh();
}

function lockSection(id, locked = true) {
  const el = sections[id];
  if (!el) return;
  el.classList.toggle('locked', locked);
  el.querySelectorAll('.knob, .toggle, .toggle-label').forEach((k) => (k.tabIndex = locked ? -1 : 0));
}

// ---- toolbar ------------------------------------------------------------------------------
let patchMenu = null; // Patch menu with factory and saved patches (patches.js)
function buildToolbar() {
  patchMenu = new PatchMenu({ getPatch: () => ({ ...patch }), setPatch });

  const showValues = document.getElementById('show-values');
  document.body.classList.toggle('show-values', showValues.checked);
  showValues.addEventListener('change', (e) => document.body.classList.toggle('show-values', e.target.checked));


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
// Zoom and pan (pinch to zoom, scroll to move around when zoomed); see zoom.js.
const zoomPan = new ZoomPan(document.getElementById('fit'), document.getElementById('stage'), {
  onChange: (z) => (document.getElementById('zoom-level').textContent = Math.round(z * 100) + '%'),
  onSettle: (s) => scope && scope.setPixelScale(s), // re-render the displays sharply at the new size
});
document.getElementById('zoom-in').addEventListener('click', () => zoomPan.zoomTo(zoomPan.zoom * 1.25));
document.getElementById('zoom-out').addEventListener('click', () => zoomPan.zoomTo(zoomPan.zoom / 1.25));
document.getElementById('zoom-level').addEventListener('click', () => zoomPan.reset());

function fit() {
  // help panel overlays below the top bar
  document.getElementById('help-panel').style.top = document.querySelector('.appbar').offsetHeight + 'px';
  zoomPan.fit();
}

// ---- boot ------------------------------------------------------------------------------------
buildPanel();
alignRows();
buildToolbar();

const loadPref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const savePref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

const keyboard = new Keyboard(document.getElementById('keys'), {
  octaves: Number(loadPref('nf1.octaves', 2)),
  onNoteOn: (n) => {
    if (lesson && lesson.busy) return; // listening to a lesson target
    ensureAudio(); engine.noteOn(n); // noteOn is queued until audio is up
    if (lesson) lesson.onNote(n);
  },
  onNoteOff: (n) => engine.noteOff(n),
  onOctave: (o) => (document.getElementById('oct-readout').textContent = 'C' + o),
});
document.getElementById('oct-down').addEventListener('click', () => keyboard.shiftOctave(-1));
document.getElementById('oct-up').addEventListener('click', () => keyboard.shiftOctave(1));

// Keyboard Range switch: 2-4 octaves
const rangeBtns = document.getElementById('range-buttons');
for (let o = 2; o <= 4; o++) {
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

// The cutoff marker follows the live (envelope/LFO-modulated) cutoff while a note sounds.
const liveCutoff = () => {
  const l = engine.live;
  return l && l.gate && l.a.s !== 0 ? l.fc : patch['filt.cutoff'];
};
const scope = new Scope(document.getElementById('scope'), document.getElementById('spectrum'), engine, liveCutoff);
scope.overlay = overlay;
setInterval(() => document.getElementById('trig-led').classList.toggle('on', !!scope.triggered && engine.running), 120);

// ---- help panel ----
help = new HelpPanel(document.getElementById('help-panel'), () => patch);
// when hover help opens on a control, show its graph too
help.onShow = (key) => overlay.activate(key, true); // key may be an option, e.g. osc1.wave=square
help.onHide = () => overlay.release();
function setHelp(open) {
  document.body.classList.toggle('help-open', open);
  document.getElementById('btn-help').setAttribute('aria-pressed', String(open));
  savePref('nf1.help', open ? '1' : '0');
  if (!open) help.hide();
  fit();
}
document.getElementById('btn-help').addEventListener('click', () => setHelp(!document.body.classList.contains('help-open')));
setHelp(loadPref('nf1.help', '1') === '1'); // on by default: this is a learning tool

// ---- beat light by the Detune knob ----
// Glows with the combined loudness of the two oscillators, so it pulses at the beat rate.
const beatLed = document.createElement('div');
beatLed.className = 'beat-led';
beatLed.innerHTML = '<span class="beat-lamp"></span><span class="beat-label">Beat</span>';
beatLed.dataset.help = 'beatlight';
knobs['osc2.fine'].el.appendChild(beatLed);
const beatLamp = beatLed.querySelector('.beat-lamp');
(function beatLoop() {
  requestAnimationFrame(beatLoop);
  const l = engine.live;
  let glow = 0;
  if (l && l.gate && l.a.s !== 0 && engine.running) {
    const d = overlay.detuneInfo();
    if (d.df > 0.005 && d.df <= 15 && d.m1 > 0.01 && d.m2 > 0.01) {
      // swing from dark (out of step) to bright (in step)
      const lvl = Overlay.beatLevel(d.m1, d.m2, l.beat);
      const minLvl = Math.abs(d.m1 - d.m2) / (d.m1 + d.m2);
      glow = minLvl < 0.999 ? (lvl - minLvl) / (1 - minLvl) : 0;
    }
  }
  beatLamp.style.setProperty('--glow', glow.toFixed(3));
})();

// ---- lessons ----
lesson = new LessonController({
  getPatch: () => ({ ...patch }), setPatch, engine, scope, keyboard, lockSection, ensureAudio,
  onModeChange: (mode) => {
    document.querySelectorAll('#mode-switch button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    requestAnimationFrame(fit);
  },
});
document.querySelectorAll('#mode-switch button').forEach((b) => b.addEventListener('click', () => lesson.setMode(b.dataset.mode)));
lesson.setMode('free'); // always open in Free play; Lessons is one click away

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
  get lesson() { return lesson; },
  params: PARAMS,
  noteName,
};
