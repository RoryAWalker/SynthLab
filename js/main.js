import { PARAMS, LAYOUT, KEYBED_SECTIONS, FX_SECTIONS, ALL_SECTIONS, defaultPatch, SYNTH, nameHtml } from './params.js';
import { Knob } from './knob.js';
import { Toggle } from './toggle.js';
import { Wheel } from './wheel.js';
import { StartMenu } from './startMenu.js';
import { Engine } from './engine.js';
import { Scope, TIMEBASES } from './scope.js';
import { Keyboard, noteName } from './keyboard.js';
import { HelpPanel } from './helpPanel.js';
import { Overlay } from './visuals.js';
import { ZoomPan } from './zoom.js';
import { LessonController } from './lessonUI.js';
import { PatchMenu } from './patches.js';

const engine = new Engine({ module: SYNTH.module, processor: SYNTH.processor });
document.body.dataset.skin = SYNTH.skin;
// ?preview=1: just the synth on a transparent page, for capturing the start-menu pictures
const PREVIEW = new URLSearchParams(location.search).has('preview');
document.body.classList.toggle('preview', PREVIEW);
document.body.dataset.synth = SYNTH.id;
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
  // Columns holding only switches or wheels can be narrow (NiniFoog), freeing panel space.
  const narrowCol = (c) => {
    const ids = sec.rows.map((r) => r[c]).filter(Boolean);
    return SYNTH.narrowSwitches && ids.length && ids.every((id) => PARAMS[id].ui === 'toggle' || PARAMS[id].type === 'wheel');
  };
  grid.style.gridTemplateColumns = Array.from({ length: cols }, (_, c) => (narrowCol(c) ? 'var(--narrow-w)' : 'var(--cell-w)')).join(' ');
  sec.rows.forEach((row, ri) => {
    // optional row header (e.g. "Oscillator 2"), spanning the whole section
    if (sec.rowTitles && sec.rowTitles[ri] !== undefined) {
      const rt = document.createElement('div');
      rt.className = 'row-title';
      rt.innerHTML = `<span>${sec.rowTitles[ri].trim()}</span>`;
      if (!sec.rowTitles[ri].trim()) rt.classList.add('blank');
      grid.appendChild(rt);
    }
    for (let c = 0; c < cols; c++) {
      const id = row[c];
      if (id) {
        const spec = PARAMS[id];
        const k = spec.ui === 'toggle' ? new Toggle(id, patch[id], onKnob)
          : spec.type === 'wheel' ? new Wheel(id, patch[id], onKnob)
          : new Knob(id, patch[id], onKnob);
        knobs[id] = k;
        if (spec.small) k.el.classList.add('small'); // the effects' smaller pots
        // staggered layouts: nudge a control down (e.g. the classic mixer's in-between pots)
        if (sec.offsets && sec.offsets[id]) { k.el.style.transform = `translateY(${sec.offsets[id]})`; k.el.classList.add('offset'); }
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
  // A 'bridge' column sits on the dividing line between two sections (switches that
  // belong to both), so it replaces the divider rather than adding two more.
  const isBridge = (column) => column.every((sec) => sec.bridge);
  LAYOUT.forEach((column, ci) => {
    const col = document.createElement('div');
    col.className = 'panel-column' + (column.length > 1 ? ' stacked' : '') + (isBridge(column) ? ' bridge' : '');
    column.forEach((sec) => col.appendChild(buildSection(sec)));
    root.appendChild(col);
    const next = LAYOUT[ci + 1];
    if (next && !isBridge(column) && !isBridge(next)) {
      const div = document.createElement('div');
      div.className = 'section-divider';
      root.appendChild(div);
    }
  });
  const perf = document.getElementById('perf-sections');
  KEYBED_SECTIONS.forEach((sec) => perf.appendChild(buildSection(sec)));
  // (skipped if the page is an older cached copy without the Effects unit)
  const fx = document.getElementById('fx-sections');
  if (fx) FX_SECTIONS.forEach((sec) => fx.appendChild(buildSection(sec)));
}

// Line up the rows of single-section columns (Mixer, Filter, LFO) with the rows of
// stacked sections (Oscillator 1 / 2), so related knobs sit level across the panel.
// Runs before the stage is scaled, so measurements are in design pixels.
function alignRows() {
  // switch columns on a section line take the row heights of the section they serve,
  // so each switch sits level with its row (e.g. Osc. 3 Control beside Oscillator 3)
  LAYOUT.flat().forEach((sec) => {
    if (!sec.matchRows) return;
    const src = sections[sec.matchRows].querySelector('.section-grid');
    sections[sec.id].querySelector('.section-grid').style.gridTemplateRows = getComputedStyle(src).gridTemplateRows;
  });
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
// Saved settings (per browser). Function declarations, so they can be used anywhere below.
function loadPref(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }
function savePref(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }

function buildToolbar() {
  patchMenu = new PatchMenu({ getPatch: () => ({ ...patch }), setPatch });

  // Show values: off by default, remembered
  const showValues = document.getElementById('show-values');
  showValues.checked = loadPref('sl.values', '0') === '1';
  document.body.classList.toggle('show-values', showValues.checked);
  showValues.addEventListener('change', (e) => {
    document.body.classList.toggle('show-values', e.target.checked);
    savePref('sl.values', e.target.checked ? '1' : '0');
  });


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
document.querySelector('.brand-model').innerHTML = nameHtml(SYNTH.name);
document.querySelector('.np-model').innerHTML = nameHtml(SYNTH.name); // name plate on the wood band (vintage look)
document.querySelector('.brand-sub').textContent = SYNTH.brandSub;
document.title = `SynthLab · ${SYNTH.name}`;
buildPanel();
alignRows();
buildToolbar();


const keyboard = new Keyboard(document.getElementById('keys'), {
  octaves: Number(loadPref('nf1.octaves', 2)),
  fixed: SYNTH.keyboard, // NiniFoog: a fixed 44-key keyboard
  onNoteOn: (n) => {
    if (lesson && lesson.busy) return; // listening to a lesson target
    ensureAudio(); engine.noteOn(n); // noteOn is queued until audio is up
    if (lesson) lesson.onNote(n);
  },
  onNoteOff: (n) => { engine.noteOff(n); if (lesson) lesson.onNoteOff(n); },
  onOctave: (o) => (document.getElementById('oct-readout').textContent = 'C' + o),
});
if (SYNTH.keyboard) document.querySelector('.oct-hint').textContent = 'Play with A–K on your computer keyboard';
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
  savePref('sl.help', open ? '1' : '0');
  if (!open) help.hide();
  fit();
}
document.getElementById('btn-help').addEventListener('click', () => setHelp(!document.body.classList.contains('help-open')));
setHelp(loadPref('sl.help', '0') === '1'); // off by default; the Help button turns hover help on

// ---- beat light by the Detune knob ----
// Glows with the combined loudness of the two oscillators, so it pulses at the beat rate.
const beatLed = document.createElement('div');
beatLed.className = 'beat-led';
beatLed.innerHTML = '<span class="beat-lamp"></span><span class="beat-label">Beat</span>';
beatLed.dataset.help = 'beatlight';
if (knobs['osc2.fine']) knobs['osc2.fine'].el.appendChild(beatLed); // NF-1's Detune knob
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

// ---- scopes: hidden by default (the synth fills the screen); the Scopes button shows them ----
const scopesBtn = document.getElementById('btn-scopes');
scopesBtn.hidden = PREVIEW;
const scopesPref = `sl.scopes.${SYNTH.id}`;
function setScopes(on, remember = true) {
  document.body.classList.toggle('scopes-hidden', !on);
  scopesBtn.classList.toggle('on', on);
  scopesBtn.setAttribute('aria-pressed', String(on));
  if (remember) savePref(scopesPref, on ? '1' : '0');
  fit();
  scope.resize(); // the screens had no size while hidden
}
scopesBtn.addEventListener('click', () => {
  const show = document.body.classList.contains('scopes-hidden');
  if (!show) setMaxScopes(false); // hiding the scopes also leaves the maximised view
  setScopes(show);
});

// ---- maximise the scopes: tall screens; the keyboard folds away (a button brings it back) ----
const maxBtn = document.getElementById('max-btn') || document.createElement('button');
const keysBtn = document.getElementById('keys-btn') || document.createElement('button');
function setMaxScopes(on) {
  document.body.classList.toggle('scopes-max', on);
  maxBtn.classList.toggle('on', on);
  maxBtn.textContent = on ? 'RESTORE' : 'MAXIMISE';
  keysBtn.hidden = !on;
  if (!on) { document.body.classList.remove('keys-shown'); keysBtn.classList.remove('on'); }
  if (on && document.body.classList.contains('scopes-hidden')) setScopes(true, false);
  fit();
  scope.resize(); // redraw the screens at their new size
}
maxBtn.addEventListener('click', () => setMaxScopes(!document.body.classList.contains('scopes-max')));
keysBtn.addEventListener('click', () => {
  const on = !document.body.classList.contains('keys-shown');
  document.body.classList.toggle('keys-shown', on);
  keysBtn.classList.toggle('on', on);
  fit();
});
setScopes(!PREVIEW && loadPref(scopesPref, '0') === '1', false);

// ---- effects drawer: a thin FX line below the keyboard that folds open ----
const fxDrawer = document.getElementById('fx-drawer');
const fxTab = document.getElementById('fx-tab');
const fxUnit = document.getElementById('fx-unit');
function setFxOpen(open, scroll = true) {
  if (!fxDrawer) return;
  fxDrawer.classList.toggle('open', open);
  fxUnit.hidden = !open;
  fxTab.setAttribute('aria-expanded', open);
  savePref('sl.fx', open ? '1' : '0');
  fit();
  // the open drawer extends the page rather than shrinking the synth: bring it into view
  if (open && scroll) requestAnimationFrame(() => {
    const over = fxUnit.getBoundingClientRect().bottom + 16 - window.innerHeight;
    if (over > 0) window.scrollBy({ top: over, behavior: 'smooth' });
  });
}
if (fxTab) fxTab.addEventListener('click', () => setFxOpen(!fxDrawer.classList.contains('open')));
setFxOpen(!PREVIEW && loadPref('sl.fx', '0') === '1', false);

// ---- lessons ----
lesson = new LessonController({
  getPatch: () => ({ ...patch }), setPatch, engine, scope, keyboard, lockSection, ensureAudio,
  onModeChange: (mode) => {
    document.querySelectorAll('#mode-switch button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    // lessons show the target on the scopes, so they switch the scopes on; Free play restores your setting
    setScopes(mode === 'lessons' || loadPref(scopesPref, '0') === '1', false);
    requestAnimationFrame(fit);
  },
});
document.querySelectorAll('#mode-switch button').forEach((b) => b.addEventListener('click', () => lesson.setMode(b.dataset.mode)));
document.getElementById('mode-switch').hidden = !SYNTH.lessons; // lessons are written for the NF-1
lesson.setMode('free'); // always open in Free play; Lessons is one click away

// ---- overload light by the Feedback pot (NiniFoog) ----
// Glows yellow, then red, as the mixer drives the filter harder.
if (knobs['mix.feedback']) {
  const led = document.createElement('div');
  led.className = 'overload-led';
  led.dataset.help = 'overload';
  led.innerHTML = '<span class="overload-lamp"></span><span class="beat-label">Overload</span>';
  knobs['mix.feedback'].el.appendChild(led);
  const lamp = led.querySelector('.overload-lamp');
  let shown = 0;
  (function loop() {
    requestAnimationFrame(loop);
    const l = engine.live;
    const drive = l && engine.running ? l.drive || 0 : 0;
    const level = Math.min(1, Math.max(0, (drive - 0.8) / 1.0)); // 0 below 0.8, full red by 1.8
    shown = Math.max(level, shown * 0.93); // light quickly, fade slowly
    lamp.style.setProperty('--glow', shown.toFixed(3));
    lamp.style.setProperty('--hue', String(Math.round(52 - 52 * shown))); // yellow -> red
  })();
}

// ---- start menu: choose a synth ----
const startMenu = new StartMenu({ skip: PREVIEW });
document.getElementById('btn-synths').addEventListener('click', () => startMenu.open());

// ---- lesson bar: grows over the scopes rather than pushing the synth down ----
// The page reserves the bar's resting height. When a question, hint or feedback makes it
// taller, the extra spreads over the scope screens and the synth stays where it is.
const lessonWrap = document.getElementById('lesson-wrap');
const lessonBar = document.getElementById('lesson-bar');
const barExpanded = () => !document.getElementById('lb-question').hidden
  || !document.getElementById('lb-hintbox').hidden
  || document.getElementById('lb-feedback').textContent.trim() !== '';
new ResizeObserver(() => {
  const resting = lessonBar.hidden ? 0 : lessonBar.offsetHeight;
  const expanded = !lessonBar.hidden && barExpanded();
  lessonBar.classList.toggle('overlaying', expanded);
  if (expanded) return; // keep the reserved height; the bar overlays the scopes
  if (Math.abs(lessonWrap.offsetHeight - resting) > 1) { lessonWrap.style.height = resting + 'px'; fit(); }
}).observe(lessonBar);

fit();
window.addEventListener('resize', fit);
// fit again once fonts and late layout have settled, so the whole synth stays on screen
setTimeout(fit, 250);
if (document.fonts) document.fonts.ready.then(fit);
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
  get engine() { return engine; }, // for inspecting the audio in the console
  params: PARAMS,
  noteName,
};
