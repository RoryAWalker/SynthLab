import { PARAMS, LAYOUT, KEYBED_SECTIONS, FX_SECTIONS, SIDE_SECTIONS, ALL_SECTIONS, defaultPatch, updateAlts, SYNTH, nameHtml } from './params.js';
import { Knob } from './knob.js';
import { Toggle } from './toggle.js';
import { Wheel } from './wheel.js';
import { LedButton } from './ledbutton.js';
import { StartMenu } from './startMenu.js';
import { Engine } from './engine.js';
import { Scope, TIMEBASES } from './scope.js';
import { Keyboard, noteName } from './keyboard.js';
import { HelpPanel } from './helpPanel.js';
import { Overlay } from './visuals.js';
import { ZoomPan } from './zoom.js';
import { LessonController } from './lessonUI.js';
import { PatchMenu } from './patches.js';
import { Cables } from './cables.js';

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
// Modular synths: jack sockets and patch cables (cables.js)
const cables = SYNTH.modular ? new Cables(document.getElementById('stage'), { getPatch: () => patch, onChange: (id, v) => onKnob(id, v), controls: knobs }) : null;
const overlay = new Overlay(() => patch, engine); // teaching graphs on the spectrum display

// ---- panel ---------------------------------------------------------------------------
function buildSection(sec) {
  const el = document.createElement('div');
  el.className = 'section';
  el.dataset.section = sec.id;
  // (an untitled section, e.g. the NiniFoog's switch columns on the section lines, has no help of its own)
  const titleHelp = sec.title ? ` data-help="section:${sec.id}"` : '';
  el.innerHTML = `<div class="section-title"${titleHelp}><span>${sec.title}</span></div><div class="section-grid"></div><div class="lock-veil"><span>LOCKED</span></div>`;
  const grid = el.querySelector('.section-grid');
  sections[sec.id] = el;
  // a module that can fold away to a thin strip (the sequencer): a button in its title bar
  if (sec.foldable) {
    const fb = document.createElement('button');
    fb.className = 'fold-btn';
    fb.dataset.help = 'foldmodule';
    el.querySelector('.section-title').prepend(fb);
    const key = `${SYNTH.id}.fold.${sec.id}`;
    const setFold = (on) => {
      el.classList.toggle('folded', on);
      fb.textContent = on ? '▸' : '◂'; // it sits on the left: folds leftwards
      fb.setAttribute('aria-label', on ? `Open the ${sec.title}` : `Fold the ${sec.title} away`);
      try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* storage unavailable */ }
      requestAnimationFrame(() => { if (typeof fit === 'function') fit(); });
    };
    fb.addEventListener('click', (e) => { e.stopPropagation(); setFold(!el.classList.contains('folded')); });
    let folded = false;
    try { folded = localStorage.getItem(key) === '1'; } catch { /* storage unavailable */ }
    setFold(folded);
  }
  // A module split into side-by-side halves with a line between them (the NF-Modular's Dual
  // VCA): each part has its own knobs and jacks.
  if (sec.parts) {
    el.classList.add('split');
    grid.className = 'parts';
    sec.parts.forEach((part) => {
      const pe = document.createElement('div');
      pe.className = 'part';
      if (part.title) pe.innerHTML = `<div class="part-title">${part.title}</div>`;
      const g = document.createElement('div');
      g.className = 'section-grid';
      pe.appendChild(g);
      fillGrid(g, part.rows, sec);
      if (part.jacks && cables) pe.appendChild(cables.buildStrip(part.jacks));
      grid.appendChild(pe);
    });
    return el;
  }
  // controls across the top of a module, before its grid (the sequencer's Run button)
  if (sec.head) {
    const hd = document.createElement('div');
    hd.className = 'section-head';
    sec.head.forEach((id) => hd.appendChild(makeControl(id, sec)));
    grid.before(hd);
  }
  if (sec.jacks && cables) el.appendChild(cables.buildStrip(sec.jacks)); // modular synths: sockets along the module's foot
  if (!sec.rows.length) { grid.remove(); return el; } // a module with only jacks
  fillGrid(grid, sec.rows, sec);
  return el;
}

function makeControl(id, sec) {
  const spec = PARAMS[id];
  const k = spec.ui === 'toggle' ? new Toggle(id, patch[id], onKnob)
    : spec.ui === 'led' ? new LedButton(id, patch[id], onKnob)
    : spec.type === 'wheel' ? new Wheel(id, patch[id], onKnob)
    : new Knob(id, patch[id], onKnob);
  knobs[id] = k;
  if (spec.small) k.el.classList.add('small'); // the effects' smaller pots
  // staggered layouts: nudge a control down (e.g. the classic mixer's in-between pots)
  if (sec.offsets && sec.offsets[id]) { k.el.style.transform = `translateY(${sec.offsets[id]})`; k.el.classList.add('offset'); }
  return k.el;
}

// Lay out rows of controls in a section's grid. A cell can be a list of ids: those controls are
// stacked in one cell (e.g. two small switches on top of each other).
function fillGrid(grid, rows, sec) {
  const cols = Math.max(...rows.map((r) => r.length));
  // Columns holding only switches or wheels can be narrow (NiniFoog), freeing panel space.
  const narrowCol = (c) => {
    const ids = rows.map((r) => r[c]).filter((id) => typeof id === 'string');
    return SYNTH.narrowSwitches && ids.length && ids.every((id) => PARAMS[id].ui === 'toggle' || PARAMS[id].type === 'wheel');
  };
  grid.style.gridTemplateColumns = Array.from({ length: cols }, (_, c) => (narrowCol(c) ? 'var(--narrow-w)' : 'var(--cell-w)')).join(' ');
  rows.forEach((row, ri) => {
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
      if (Array.isArray(id)) {
        const stack = document.createElement('div');
        stack.className = 'stack-cell';
        id.forEach((x) => stack.appendChild(makeControl(x, sec)));
        grid.appendChild(stack);
      } else if (id) {
        grid.appendChild(makeControl(id, sec));
      } else {
        const blank = document.createElement('div');
        blank.className = 'knob-cell blank';
        grid.appendChild(blank);
      }
    }
  });
}

function buildPanel() {
  const root = document.getElementById('sections');
  // A rack (NF-Modular): LAYOUT is rows of modules, each row stretched across the full width.
  if (SYNTH.rack) {
    root.classList.add('rack');
    // rows of modules, with any side column (the sequencer) beside them, full height
    const rowsBox = document.createElement('div');
    rowsBox.className = 'rack-rows';
    LAYOUT.forEach((row) => {
      const r = document.createElement('div');
      r.className = 'rack-row';
      row.forEach((sec) => r.appendChild(buildSection(sec)));
      rowsBox.appendChild(r);
    });
    // the side column (the sequencer) stands on the left: it is a source of notes, like the
    // keyboard, and signals in the rack flow from left to right
    SIDE_SECTIONS.forEach((sec) => { const el = buildSection(sec); el.classList.add('rack-side'); root.appendChild(el); });
    root.appendChild(rowsBox);
    const perf = document.getElementById('perf-sections');
    KEYBED_SECTIONS.forEach((sec) => perf.appendChild(buildSection(sec)));
    const fx = document.getElementById('fx-sections');
    if (fx) FX_SECTIONS.forEach((sec) => fx.appendChild(buildSection(sec)));
    return;
  }
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
  // modular synths: a patch can sound without a key (a drone), so any change may start the audio
  if (SYNTH.modular && !engine.running) ensureAudio();
  refreshScales();
  if (!(lesson && lesson.busy)) engine.setParam(id, value); // while a lesson target plays, keep it intact
  if (lesson) lesson.onPatchChange();
  if (help) help.refresh(id);
  overlay.activate(id);
  graphPop.from(id);
  if (patchMenu) patchMenu.markEdited();
}

// ---- patch API (used by presets now, by the game layer later) --------------------------
// knobs whose scale depends on other settings (e.g. Osc 3 Frequency shown in Hz as an LFO)
function refreshScales() {
  updateAlts(patch).forEach((id) => { if (knobs[id] && knobs[id].rescale) knobs[id].rescale(); });
}

function setPatch(p) {
  patch = { ...defaultPatch(), ...p };
  refreshScales();
  for (const id in knobs) knobs[id].set(patch[id]);
  engine.setPatch(patch);
  if (help) help.refresh();
  if (cables) cables.redraw();
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


  // See-through cables (modular synths): off by default, remembered
  const faded = document.getElementById('faded-cables');
  if (faded && SYNTH.modular) {
    faded.parentNode.hidden = false;
    faded.checked = loadPref('sl.cablesFaded', '0') === '1';
    document.body.classList.toggle('cables-faded', faded.checked);
    faded.addEventListener('change', (e) => {
      document.body.classList.toggle('cables-faded', e.target.checked);
      savePref('sl.cablesFaded', e.target.checked ? '1' : '0');
    });
  }

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
  // help panel overlays below the top bar; the lesson panel pins just under it
  const barH = document.querySelector('.appbar').offsetHeight;
  document.getElementById('help-panel').style.top = barH + 'px';
  document.body.style.setProperty('--appbar-h', barH + 'px');
  zoomPan.fit();
}

// ---- boot ------------------------------------------------------------------------------------
document.querySelector('.brand-model').innerHTML = nameHtml(SYNTH.name);
document.querySelector('.np-model').innerHTML = nameHtml(SYNTH.name); // name plate on the wood band (vintage look)
document.querySelector('.brand-sub').textContent = SYNTH.brandSub;
document.title = `SynthLab · ${SYNTH.name}`;
buildPanel();
refreshScales(); // e.g. Osc 3 Frequency starts in Hz when Osc 3 is an LFO
alignRows();
buildToolbar();


// keyboard size, remembered per synth (the NF-1 keeps its original setting's name)
const octPref = SYNTH.id === 'nf1' ? 'nf1.octaves' : `${SYNTH.id}.octaves`;
const keyboard = new Keyboard(document.getElementById('keys'), {
  // the modular synths have a fixed keyboard size (their Mono/Legato switch takes the Range switch's place)
  octaves: SYNTH.modular ? (SYNTH.octaves || 2) : Number(loadPref(octPref, SYNTH.octaves || 2)),
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
    savePref(octPref, o);
    rangeBtns.querySelectorAll('.range-btn').forEach((x) => x.classList.toggle('on', x === b));
  });
  rangeBtns.appendChild(b);
}
// Modular synths: Mono/Legato sits where the Keyboard Range switch was
if (PARAMS['kb.mode']) {
  const rangeBlock = rangeBtns.closest('.oct-block');
  const mode = makeControl('kb.mode', {});
  mode.classList.add('perf-mode');
  rangeBlock.replaceWith(mode);
}

// The cutoff marker follows the live (envelope/LFO-modulated) cutoff while a note sounds.
const liveCutoff = () => {
  const l = engine.live;
  return l && l.gate && l.a.s !== 0 ? l.fc : patch['filt.cutoff'] ?? patch['vcf.cutoff']; // (the NF-Modular's is vcf.cutoff)
};
const scope = new Scope(document.getElementById('scope'), document.getElementById('spectrum'), engine, liveCutoff);

// ---- pop-out graph (with Help on) ----
// The teaching graphs are drawn on the spectrum screen. When that screen is too small to read
// them (the slim scope strip) or hidden, and Help is on, they also appear in a larger floating screen on the
// far side of the panel from the control being used, and fade away with the graph. It never
// takes clicks, so it cannot get in the way of a knob. Maximised scopes show the graph themselves.
const graphPop = (() => {
  const el = document.createElement('div');
  el.className = 'graph-pop';
  el.innerHTML = '<canvas></canvas>';
  document.body.appendChild(el);
  const cv = el.querySelector('canvas');
  const W = 620, H = 280;
  const slim = document.body.dataset.skin !== 'classic'; // NiniFoog and the modulars: the slim strip
  // only with Help on: the pop-out is part of the teaching aids, not something that appears
  // over the panel while you are just playing
  const wanted = () => document.body.classList.contains('help-open')
    && !document.body.classList.contains('scopes-max')
    && (slim || document.body.classList.contains('scopes-hidden'));
  (function loop() {
    requestAnimationFrame(loop);
    const a = overlay.group && !overlay.scopeOnly && wanted() ? overlay.alpha() : 0;
    el.style.opacity = String(a);
    if (!a) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#06100a';
    ctx.fillRect(0, 0, W, H);
    overlay.draw(ctx, W, H, null);
  })();
  return {
    // open beside the Help panel (which is on the side of the screen away from this control), above or
    // below the control, whichever has more room, sized to fit there, so it covers neither
    from(id) {
      const k = knobs[id];
      const r = k && k.el ? k.el.getBoundingClientRect() : null;
      const hp = document.getElementById('help-panel');
      const helpW = hp && hp.offsetWidth ? hp.offsetWidth : 0;
      const left = helpW ? hp.classList.contains('left') : (!!r && r.left + r.width / 2 > window.innerWidth / 2);
      const gap = 12;
      const topY = document.querySelector('.appbar').offsetHeight + gap;
      // the larger space above or below the control (the whole height below the top bar if there is no control)
      const above = r ? r.top - gap - topY : window.innerHeight - topY - gap;
      const below = r ? window.innerHeight - gap - (r.bottom + gap) : 0;
      const atBottom = below > above;
      // as large as fits beside the Help panel and in that space, keeping the screen's shape
      let w = Math.min(W, window.innerWidth - helpW - gap * 3 - 16);
      w = Math.max(240, Math.min(w, (Math.max(above, below) - 16) * W / H));
      const h = Math.round(w * H / W) + 16;
      w += 16;
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.style.left = left ? (helpW + gap) + 'px' : 'auto';
      el.style.right = left ? 'auto' : (helpW + gap) + 'px';
      el.style.top = (atBottom ? window.innerHeight - gap - h : topY) + 'px';
    },
  };
})();
scope.overlay = overlay;
setInterval(() => document.getElementById('trig-led').classList.toggle('on', !!scope.triggered && engine.running), 120);

// ---- help panel ----
help = new HelpPanel(document.getElementById('help-panel'), () => patch);
// when hover help opens on a control, show its graph too
help.onShow = (key) => { overlay.activate(key, true); graphPop.from(key.split('=')[0]); }; // key may be an option, e.g. osc1.wave=square
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

// ---- maximise the scopes: tall screens; the keyboard folds away until RESTORE ----
const maxBtn = document.getElementById('max-btn') || document.createElement('button');
function setMaxScopes(on) {
  document.body.classList.toggle('scopes-max', on);
  maxBtn.classList.toggle('on', on);
  maxBtn.textContent = on ? 'RESTORE' : 'MAXIMISE';
  if (on && document.body.classList.contains('scopes-hidden')) setScopes(true, false);
  fit();
  scope.resize(); // redraw the screens at their new size
}
maxBtn.addEventListener('click', () => setMaxScopes(!document.body.classList.contains('scopes-max')));
setScopes(!PREVIEW && loadPref(scopesPref, '0') === '1', false);

// ---- effects drawer: a thin FX line below the keyboard that folds open ----
const fxDrawer = document.getElementById('fx-drawer');
const fxTab = document.getElementById('fx-tab');
const fxUnit = document.getElementById('fx-unit');
function setFxOpen(open) {
  if (!fxDrawer) return;
  fxDrawer.classList.toggle('open', open);
  fxUnit.hidden = !open;
  fxTab.setAttribute('aria-expanded', open);
  fit();
  // the open drawer extends the page rather than shrinking the synth: bring it into view
  if (open) requestAnimationFrame(() => {
    const over = fxUnit.getBoundingClientRect().bottom + 16 - window.innerHeight;
    if (over > 0) window.scrollBy({ top: over, behavior: 'smooth' });
  });
}
if (fxTab) fxTab.addEventListener('click', () => setFxOpen(!fxDrawer.classList.contains('open')));
// always starts closed, so the synth fits the screen

// ---- lessons ----
lesson = new LessonController({
  getPatch: () => ({ ...patch }), setPatch, engine, scope, keyboard, lockSection, ensureAudio,
  onModeChange: (mode) => {
    document.querySelectorAll('#mode-switch button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    // each lesson chooses whether the scopes start on (showScopes below); Free play restores your setting
    if (mode !== 'lessons') { document.body.classList.remove('lesson-scopes-visible'); setScopes(loadPref(scopesPref, '0') === '1', false); window.scrollTo(0, 0); }
    requestAnimationFrame(fit);
  },
  // A lesson turns the scopes on or off. With them on, the page scrolls so the lesson panel
  // hangs over them and the synth sits just below it; scrolling up shows the scopes.
  // visible: show the scopes in full instead, with the whole instrument fitted below the panel.
  showScopes: (on, visible = false) => {
    document.body.classList.toggle('lesson-scopes-visible', on && visible);
    setScopes(on, false);
    requestAnimationFrame(() => {
      fit();
      const synthTop = document.querySelector('.synth').getBoundingClientRect().top + window.scrollY;
      const pinned = document.querySelector('.appbar').offsetHeight + lessonWrap.offsetHeight;
      window.scrollTo(0, on && !visible ? Math.max(0, synthTop - pinned - 12) : 0);
    });
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

// ---- lesson panel: pinned to the top of the window (see showScopes above). A question or hint
// makes it taller and the page scrolls, rather than the synth shrinking.
const lessonWrap = document.getElementById('lesson-wrap');

// ---- modular synths: cables over the panel, and lamps by the output jacks ----
// The NF-Modular's Output has an Overload light: it glows while the output limiter is working
// (a patch too hot, or feeding back). If a runaway loop ever forces the rack to reset, say so.
const outSection = SYNTH.modular && sections.out;
let overLamp = null, lastResets = 0;
if (outSection && SYNTH.id === 'nfmod') {
  const led = document.createElement('div');
  led.className = 'overload-led out-overload';
  led.dataset.help = 'outoverload';
  led.innerHTML = '<span class="overload-lamp"></span><span class="beat-label">Overload</span>';
  (outSection.querySelector('.jack-rows') || outSection).appendChild(led);
  overLamp = led.querySelector('.overload-lamp');
}
let overShown = 0;
if (cables) {
  requestAnimationFrame(() => cables.redraw());
  (function lamps() {
    requestAnimationFrame(lamps);
    const live = engine.running && engine.live;
    cables.showLevels(live ? live.outs : null);
    // the sequencer's current step lights up while it runs
    if (sections.seq) {
      const cur = live && live.seqRun ? live.seqStep + 1 : 0;
      for (let n = 1; n <= 8; n++) {
        const cell = knobs[`seq.s${n}`] && knobs[`seq.s${n}`].el.parentNode;
        if (cell) cell.classList.toggle('current', n === cur);
      }
    }
    if (overLamp) {
      const level = live ? Math.min(1, Math.max(0, ((live.over || 0) - 0.7) / 1.3)) : 0;
      overShown = Math.max(level, overShown * 0.93);
      overLamp.style.setProperty('--glow', overShown.toFixed(3));
      overLamp.style.setProperty('--hue', String(Math.round(52 - 52 * overShown)));
      if (live && live.resets > lastResets) {
        lastResets = live.resets;
        patchMenu.toast('That feedback loop ran away, so the rack reset itself. Try turning a level down.');
      }
    }
  })();
}

// Touch screens (iPhone/iPad Safari): audio may only be allowed to start when a finger
// lifts, so resume a waiting audio engine on every touch end as well
document.addEventListener('touchend', () => {
  if (engine.ctx && engine.ctx.state !== 'running' && !document.hidden) engine.ctx.resume();
}, { capture: true, passive: true });

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
  get overlay() { return overlay; }, // the teaching graphs, for testing in the console
  params: PARAMS,
  noteName,
};
