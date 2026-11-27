import { PARAMS, LAYOUT, KEYBED_SECTIONS, FX_SECTIONS, SIDE_SECTIONS, ALL_SECTIONS, defaultPatch, updateAlts, SYNTH, nameHtml, LAB_NAME } from './params.js';
import { Knob } from './knob.js';
import { Toggle } from './toggle.js';
import { Wheel } from './wheel.js';
import { LedButton } from './ledbutton.js';
import { Choice } from './choice.js';
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
import { EXT } from './lab.js';
// the studio units' own parts (StudioLab supplies them; SynthLab's page has none of them)
const { CompScope, ConsoleScope, Fader, ConsoleMeters, loadSource, loadUserFile, userFileName, loadSong } = EXT.parts || {};
import { startMidi } from './midi.js';
import { WordSwitch } from './wordswitch.js';
import { MaxModules } from './maxModules.js';
import { Smiley } from './fireworks.js';
import { RackEdit } from './rackEdit.js';
import { NodeEditor } from './nodeEditor.js';
import { XYPad } from './xyPad.js';

const engine = new Engine({ module: SYNTH.module, processor: SYNTH.processor });
// the Draw module's screen shows where its shape is playing, and whether it is in Once mode
NodeEditor.live = () => (engine.running ? engine.live : null);
NodeEditor.mode = (inst) => patch[`${inst}.mode`];
XYPad.getPatch = () => patch; // (and the XY's pad, where its puck is)
XYPad.live = NodeEditor.live;
document.body.dataset.skin = SYNTH.skin;
// ?preview=1: just the synth on a transparent page, for capturing the start-menu pictures
const PREVIEW = new URLSearchParams(location.search).has('preview');
document.body.classList.toggle('preview', PREVIEW);
document.body.dataset.synth = SYNTH.look || SYNTH.id; // (the NF-ModRack uses the NF-Modular's styles)
if (SYNTH.openRack) document.body.classList.add('open-rack');
// the studio units (StudioLab: compressors, consoles): no keyboard; they play sounds through themselves
const PROC = !!SYNTH.kind;
document.body.classList.toggle('processor', PROC);
let patch = defaultPatch();
const sentSources = new Set(); // processors: sounds already handed to the engine
const meters = []; // processors: the level meters
const knobs = {};
const sections = {};
let help = null; // HelpPanel, created at boot
let lesson = null; // LessonController, created at boot
let rackEdit = null; // the NF-ModRack's module drawer (rackEdit.js), created at boot
// Modular synths (and patchable units, e.g. the NF-Mix4 and its outboard): jack sockets and patch cables (cables.js)
const cables = SYNTH.modular || SYNTH.patchable ? new Cables(document.getElementById('stage'), { getPatch: () => patch, onChange: (id, v) => onKnob(id, v), controls: knobs }) : null;
const overlay = new Overlay(() => patch, engine); // teaching graphs on the spectrum display
// the console's meters (VU or PPM), see meters.js
const consoleMeters = SYNTH.kind === 'console' ? new ConsoleMeters(engine, () => patch) : null;

// ---- panel ---------------------------------------------------------------------------
function buildSection(sec) {
  const el = document.createElement('div');
  el.className = 'section';
  el.dataset.section = sec.id;
  if (sec.type) { el.dataset.type = sec.type; el.classList.toggle('even', sec.even); } // the NF-ModRack: coloured by kind of module
  // (an untitled section, e.g. the NiniFoog's switch columns on the section lines, has no help of its own)
  const titleHelp = sec.title ? ` data-help="section:${sec.id}"` : '';
  el.innerHTML = `<div class="section-title"${titleHelp}><span>${sec.title}</span></div><div class="section-grid"></div><div class="lock-veil"><span>LOCKED</span></div>`;
  const grid = el.querySelector('.section-grid');
  sections[sec.id] = el;
  // a word in the title that is a switch (the envelopes' Exponential / Linear)
  if (sec.titleSwitch) el.querySelector('.section-title').appendChild(makeControl(sec.titleSwitch, sec));
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
  // a screen beside the module's knobs (the NF-ModRack's Draw: its drawing screen)
  if (sec.screen) {
    const row = document.createElement('div');
    row.className = 'screen-row';
    grid.before(row);
    row.append(makeControl(sec.screen, sec), grid);
  }
  if (sec.meters === true) { grid.replaceWith(buildMeters()); return el; } // the NF-C1's level meters
  // the console: a fader with its meters beside it, meters on their own, a scribble strip
  // the console's needle meters, with the PFL light
  if (sec.needles) {
    grid.remove();
    const box = document.createElement('div');
    box.className = 'needle-pair';
    sec.needles.forEach(([key, text]) => box.appendChild(consoleMeters.needle(key, text)));
    el.appendChild(box);
    const foot = document.createElement('div');
    foot.className = 'needle-foot';
    foot.appendChild(consoleMeters.pflLamp());
    foot.insertAdjacentHTML('beforeend', '<span class="align-note" data-help="alignment">0 VU = +4 dBu = −18 dBFS</span>');
    el.appendChild(foot);
    return el;
  }
  if (sec.fader || Array.isArray(sec.meters) || sec.scribble) {
    if (sec.rows.length) fillGrid(grid, sec.rows, sec); else grid.remove();
    if (sec.strip) el.classList.add('strip');
    // a zig-zag strip (the console's channels): alternate knobs sit left and right of centre
    if (sec.zigzag) {
      el.classList.add('zigzag');
      [...grid.children].filter((c) => c.classList.contains('knob-cell')).forEach((c, i) => c.classList.add(i % 2 ? 'zz-r' : 'zz-l'));
    }
    const foot = document.createElement('div');
    foot.className = 'strip-foot';
    if (Array.isArray(sec.meters)) {
      const mb = document.createElement('div');
      mb.className = 'meter-group' + (sec.fader ? ' beside-fader' : '');
      sec.meters.forEach(([key, text, help]) => mb.appendChild(consoleMeters.ladder(key, text, help)));
      if (sec.fader) foot.appendChild(mb); else foot.appendChild(mb);
    }
    if (sec.fader) foot.prepend(makeControl(sec.fader, sec));
    if (foot.children.length) el.appendChild(foot);
    if (sec.scribble) {
      const sc = document.createElement('div');
      sc.className = 'scribble';
      sc.dataset.help = 'scribble';
      sc.innerHTML = `<b>${sec.scribble}</b>${sec.scribbleNote ? `<span>${sec.scribbleNote}</span>` : ''}`;
      el.appendChild(sc);
    }
    return el;
  }
  if (sec.load) el.appendChild(buildLoadButton()); // the processors: load your own sound file
  if (sec.jacks && cables) {
    const strip = cables.buildStrip(sec.jacks);
    // the sockets under the knobs, beside the screen, so the screen can use the module's whole
    // height (the NF-ModRack's XY)
    if (sec.jacksBeside && sec.screen) {
      const col = document.createElement('div');
      col.className = 'side-col';
      grid.replaceWith(col);
      col.append(grid, strip);
      el.classList.add('jacks-beside');
    } else el.appendChild(strip); // modular synths: sockets along the module's foot
  }
  if (!sec.rows.length) { grid.remove(); return el; } // a module with only jacks
  fillGrid(grid, sec.rows, sec);
  return el;
}

function makeControl(id, sec) {
  // a patch socket used as a control in a grid (the NF-Mix4's insert points and aux outputs)
  if (id.startsWith('out:')) return cables.makeOut(id.slice(4));
  if (PARAMS[id] && PARAMS[id].type === 'jack') return cables.makeIn(id);
  const spec = PARAMS[id];
  const k = spec.ui === 'toggle' ? new Toggle(id, patch[id], onKnob)
    : spec.ui === 'led' ? new LedButton(id, patch[id], onKnob)
    : spec.ui === 'fader' ? new Fader(id, patch[id], onKnob)
    : spec.ui === 'word' ? new WordSwitch(id, patch[id], onKnob)
    : spec.ui === 'nodes' ? new NodeEditor(id, patch[id], onKnob) // the NF-ModRack's Draw: its drawing screen
    : spec.ui === 'xy' ? new XYPad(id, patch[id], onKnob) // and its XY: the pad
    : spec.ui === 'choice' ? new Choice(id, patch[id], onKnob)
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
    buildRackRows(rowsBox);
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

// the rack's rows of modules (built again when the NF-ModRack's modules change)
function buildRackRows(rowsBox) {
  rowsBox.replaceChildren();
  LAYOUT.forEach((row, ri) => {
    const r = document.createElement('div');
    r.className = 'rack-row';
    r.dataset.row = ri;
    row.forEach((sec) => r.appendChild(buildSection(sec)));
    rowsBox.appendChild(r);
  });
}

// ---- the NF-ModRack: choose the modules --------------------------------------------------
// The rack's modules are the patch's 'rack.layout'. Changing them changes which controls and
// sockets exist: PARAMS, the outputs and LAYOUT are updated in place (everything else reads
// them from there), and the rack's rows are built again.
let builtLayout = null;
function setRackDefs(d) {
  for (const id in PARAMS) if (!id.startsWith('fx.') && !(id in d.PARAMS)) delete PARAMS[id];
  Object.assign(PARAMS, d.PARAMS);
  for (const k in SYNTH.OUTPUTS) delete SYNTH.OUTPUTS[k];
  Object.assign(SYNTH.OUTPUTS, d.OUTPUTS);
  LAYOUT.splice(0, LAYOUT.length, ...d.LAYOUT);
  ALL_SECTIONS.splice(0, ALL_SECTIONS.length, ...LAYOUT.flat(), ...SIDE_SECTIONS, ...KEYBED_SECTIONS, ...FX_SECTIONS);
}
function rebuildRack() {
  const maxWas = maxMods && maxMods.on;
  if (maxWas) setMaxModules(false);
  const rowsBox = document.querySelector('#sections .rack-rows');
  rowsBox.querySelectorAll('.section').forEach((el) => delete sections[el.dataset.section]);
  buildRackRows(rowsBox);
  for (const id in knobs) if (!knobs[id].el.isConnected) delete knobs[id];
  cables.prune();
  builtLayout = patch['rack.layout'];
  if (maxMods) { maxMods.usual = LAYOUT.map((row) => row.map((sec) => sec.id)); maxMods.order = maxMods.usual.flat(); }
  addOverLamp();
  if (rackEdit) rackEdit.decorate();
  fit();
  cables.redraw();
  if (maxWas) setMaxModules(true);
}
// a new rack (from the module drawer): keep every setting and cable that still has somewhere to
// go, give new modules their starting settings, and drop cables to or from modules taken out
function changeRack(rows) {
  const d = SYNTH.build(SYNTH.layoutString(rows));
  const lay = SYNTH.layoutString(d.rows);
  if (lay === patch['rack.layout']) return false;
  setRackDefs(d);
  const next = defaultPatch();
  for (const id in next) {
    if (!(id in patch) || id === 'rack.layout') continue;
    next[id] = PARAMS[id].type === 'jack'
      ? String(patch[id] || '').split(',').filter((o) => o in SYNTH.OUTPUTS).join(',') : patch[id];
  }
  next['rack.layout'] = lay;
  patch = next;
  rebuildRack();
  engine.setPatch(patch);
  if ((SYNTH.modular) && !engine.running) ensureAudio();
  if (patchMenu) patchMenu.markEdited();
  return true;
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
  const before = { ...patch };
  patch[id] = value;
  restartMeasure(); // the meters start again (see measure)
  // a control that moves another (e.g. Osc 3 Frequency snapping to 0 when Osc 3 becomes an oscillator)
  const extra = SYNTH.linked && SYNTH.linked(id, before, patch);
  if (extra) for (const k in extra) { if (patch[k] !== extra[k]) { onKnob(k, extra[k]); if (knobs[k]) knobs[k].set(extra[k]); } }
  // modular synths: a patch can sound without a key (a drone), so any change may start the audio
  if ((SYNTH.modular || PROC) && !engine.running) ensureAudio();
  if (PROC) { if (id === 'src.sound' || id === 'src.play' || id === 'tape.play') sendSource(); scope.focus(id); }
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
  // the NF-ModRack: a patch brings its own rack of modules
  if (SYNTH.openRack) {
    const d = SYNTH.build(p['rack.layout']);
    const lay = SYNTH.layoutString(d.rows);
    setRackDefs(d);
    patch = { ...defaultPatch(), ...p, 'rack.layout': lay };
    for (const id in patch) if (!(id in PARAMS)) delete patch[id];
    if (lay !== builtLayout) rebuildRack();
  } else
  patch = { ...defaultPatch(), ...p };
  restartMeasure(); // the meters start again (see measure)
  refreshScales();
  for (const id in knobs) knobs[id].set(patch[id]);
  engine.setPatch(patch);
  if (PROC) sendSource();
  if (help) help.refresh();
  if (cables) cables.redraw();
}

// A lesson can open single controls in an unlocked section (the NF-C1: one pot at a time). null
// opens them all again. The Loop Player's controls are never locked: the student chooses the sound.
function lockControls(ids) {
  for (const id in knobs) {
    if (id.startsWith('src.')) continue;
    const locked = !!ids && !ids.includes(id);
    knobs[id].el.classList.toggle('ctl-locked', locked);
    knobs[id].el.querySelectorAll('.knob, button').forEach((k) => (k.tabIndex = locked ? -1 : 0));
  }
}

// What the NF-C1's meters have shown over the last two seconds, for lessons that ask for, say,
// "about 6 dB of gain reduction": playing, peak and average gain reduction (dB), and the average
// level in and out (dBFS, before the listening level). Only since the last change of setting, and
// only once the meters have had 1.5 s to settle: until then it reports nothing (not playing), so
// a goal can't be passed on readings left over from before (Bypass pressed in the last challenge,
// or the compressor still releasing the last challenge's gain reduction).
let measureSince = 0;
// (a function declaration, safe to call while the page is still starting up, before scope exists)
function restartMeasure() { try { measureSince = scope && scope.n !== undefined ? scope.n : 0; } catch { /* not started yet */ } }
function measure() {
  if (!scope || !scope.inp) return null;
  const rate = scope.rate || 375, since = scope.n - measureSince;
  if (since < 1.5 * rate) return { playing: false, settling: true, grMax: 0, grAvg: 0, inDb: -120, outDb: -120, bypassed: patch['comp.bypass'] === 'on' };
  // (the first 0.75 s after a change is left out: the compressor is still letting go of the old setting)
  const live = engine.live || {}, frames = Math.min(since - Math.round(0.75 * rate), Math.round(2 * rate));
  let grMax = 0, grSum = 0, pin = 0, pout = 0;
  for (let a = 0; a < frames; a++) {
    const k = (scope.n - 1 - a + scope.cap) % scope.cap;
    grMax = Math.max(grMax, scope.gr[k]); grSum += scope.gr[k];
    pin += Math.pow(10, scope.inp[k] / 10); pout += Math.pow(10, scope.out[k] / 10);
  }
  const db = (pw) => (frames && pw > 0 ? 10 * Math.log10(pw / frames) : -120);
  return { playing: !!(engine.running && live.playing && patch['src.play'] === 'play'), grMax, grAvg: frames ? grSum / frames : 0, inDb: db(pin), outDb: db(pout), bypassed: patch['comp.bypass'] === 'on' };
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
  if (faded && (SYNTH.modular || SYNTH.patchable)) { // (and the patchable units, e.g. the NF-Mix4)
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

let maxMods = null; // maximised modules (modular synths), set up below
function fit() {
  // help panel overlays below the top bar; the lesson panel pins just under it
  const barH = document.querySelector('.appbar').offsetHeight;
  document.getElementById('help-panel').style.top = barH + 'px';
  document.body.style.setProperty('--appbar-h', barH + 'px');
  if (maxMods) maxMods.layout();
  zoomPan.fit();
  if (maxMods && maxMods.on && cables) cables.redraw();
}

// ---- boot ------------------------------------------------------------------------------------
document.querySelector('.brand-model').innerHTML = nameHtml(SYNTH.name);
document.querySelector('.np-model').innerHTML = nameHtml(SYNTH.name); // name plate on the wood band (vintage look)
document.querySelector('.brand-sub').textContent = SYNTH.brandSub;
document.title = `${LAB_NAME} · ${SYNTH.name}`;
buildPanel();
if (SYNTH.openRack) builtLayout = patch['rack.layout'];
if (SYNTH.OUTBOARD) buildOutboard();
if (SYNTH.PLAYER) buildPlayer();
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
// ---- MIDI keyboard: plays through the on-screen keyboard; bend and mod wheel where the synth has them ----
startMidi({
  keyboard,
  setControl: (id, v) => { if (knobs[id]) knobs[id].commit(v); },
  onDevices: (names) => {
    const light = document.getElementById('midi-light');
    light.hidden = !names || !names.length;
    if (names && names.length) light.title = 'MIDI: ' + names.join(', ');
  },
  onActivity: () => { // the light flickers as notes arrive
    const light = document.getElementById('midi-light');
    light.classList.add('hit');
    clearTimeout(light._t);
    light._t = setTimeout(() => light.classList.remove('hit'), 90);
  },
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
const scope = SYNTH.kind === 'console'
  ? new ConsoleScope(document.getElementById('scope'), document.getElementById('spectrum'), engine, () => patch)
  : PROC
  ? new CompScope(document.getElementById('scope'), document.getElementById('spectrum'), engine, () => patch)
  : new Scope(document.getElementById('scope'), document.getElementById('spectrum'), engine, liveCutoff);

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
const trigLed = document.getElementById('trig-led'); // (not on the processors' screens)
if (trigLed && !PROC) setInterval(() => trigLed.classList.toggle('on', !!scope.triggered && engine.running), 120);

// ---- help panel ----
help = new HelpPanel(document.getElementById('help-panel'), () => patch);
// when hover help opens on a control, show its graph too
help.onShow = (key) => { overlay.activate(key, true); graphPop.from(key.split('=')[0]); if (PROC) scope.focus(key.split('=')[0]); }; // key may be an option, e.g. osc1.wave=square
help.onHide = () => { overlay.release(); if (PROC) scope.release(); };
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
  const leaving = maxMods && maxMods.on; // the scopes are out of sight behind maximised modules: bring them back
  if (leaving) setMaxModules(false);
  const show = leaving || document.body.classList.contains('scopes-hidden');
  if (!show) setMaxScopes(false); // hiding the scopes also leaves the maximised view
  setScopes(show);
});

// ---- maximise the scopes: tall screens; the keyboard folds away until RESTORE ----
const maxBtn = document.getElementById('max-btn') || document.createElement('button');
function setMaxScopes(on) {
  document.body.classList.toggle('scopes-max', on);
  maxBtn.classList.toggle('on', on);
  maxBtn.textContent = on ? 'RESTORE' : 'MAXIMISE';
  if (on && maxMods && maxMods.on) setMaxModules(false);
  if (on && document.body.classList.contains('scopes-hidden')) setScopes(true, false);
  fit();
  scope.resize(); // redraw the screens at their new size
}
maxBtn.addEventListener('click', () => setMaxScopes(!document.body.classList.contains('scopes-max')));
setScopes(!PREVIEW && loadPref(scopesPref, PROC ? '1' : '0') === '1', false);

// ---- maximise the modules (modular synths): no scopes or keyboard, and the modules rearranged to fill the window ----
const modBtn = document.getElementById('btn-modmax');
if (SYNTH.modular && modBtn && !PREVIEW) {
  modBtn.hidden = false;
  maxMods = new MaxModules({
    root: document.getElementById('sections'), sections,
    usual: SYNTH.rack ? LAYOUT.map((row) => row.map((s) => s.id)) : [LAYOUT.flat().map((s) => s.id)], side: SIDE_SECTIONS.length ? SIDE_SECTIONS[0].id : null, kb: KEYBED_SECTIONS[0].id,
    avail: () => zoomPan.avail(),
  });
  modBtn.addEventListener('click', () => setMaxModules(!maxMods.on));
}
function setMaxModules(on) {
  if (!maxMods || on === maxMods.on) return;
  if (on) setMaxScopes(false); // one or the other
  maxMods.set(on);
  modBtn.classList.toggle('on', on);
  modBtn.setAttribute('aria-pressed', String(on));
  modBtn.textContent = on ? 'Restore' : 'Maximise';
  window.scrollTo(0, 0);
  zoomPan.reset();
  fit();
  if (cables) cables.redraw();
  if (!on) scope.resize(); // the screens had no size while out of sight
}
// a success while the screens are out of sight: the smiley gets a small screen of its own
function smileyPop() {
  const el = document.createElement('div');
  el.className = 'smiley-pop';
  el.innerHTML = '<canvas width="560" height="360"></canvas>';
  document.body.appendChild(el);
  const ctx = el.firstChild.getContext('2d'), face = new Smiley();
  face.start();
  (function loop() {
    ctx.fillStyle = '#04100a';
    ctx.fillRect(0, 0, 560, 360);
    face.draw(ctx, 560, 360);
    if (face.t0 < 0) el.remove(); else requestAnimationFrame(loop);
  })();
}

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
let celebrateTimer = 0;
lesson = new LessonController({
  getPatch: () => ({ ...patch }), setPatch, engine, scope, keyboard, lockSection, ensureAudio,
  lockControls: SYNTH.PLAYER ? lockControls : null, measure: SYNTH.PLAYER ? measure : null,
  onModeChange: (mode) => {
    document.querySelectorAll('#mode-switch button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    // each lesson chooses whether the scopes start on (showScopes below); Free play restores your setting
    if (mode !== 'lessons') { document.body.classList.remove('lesson-scopes-visible'); setScopes(loadPref(scopesPref, PROC ? '1' : '0') === '1', false); window.scrollTo(0, 0); }
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
      // (the processors fit everything below the lesson panel: no scrolling)
      window.scrollTo(0, on && !visible && !PROC ? Math.max(0, synthTop - pinned - 12) : 0);
    });
  },
  // A success: bring the screens into view so the smiley is seen, then put things back
  // (hidden again if they were hidden, the page scrolled back to the synth).
  celebrate: (seconds, restore = true) => {
    if (maxMods && maxMods.on) { smileyPop(); return; }
    const wasHidden = document.body.classList.contains('scopes-hidden');
    // (the processors: everything is fitted on screen; opening hidden screens would resize it all)
    if (PROC) return;
    const y = window.scrollY;
    if (wasHidden) setScopes(true, false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    clearTimeout(celebrateTimer);
    if (!restore) return;
    celebrateTimer = setTimeout(() => {
      if (lesson.mode !== 'lessons') return;
      if (wasHidden) setScopes(false, false);
      requestAnimationFrame(() => window.scrollTo({ top: wasHidden ? 0 : y, behavior: 'smooth' }));
    }, seconds * 1000);
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
    const level = Math.min(1, Math.max(0, (drive - 1.9) / 1.1)); // dark up to two oscillators at full (peaks ~1.8); Feedback lights it, red by 3.0
    shown = Math.max(level, shown * 0.93); // light quickly, fade slowly
    lamp.style.setProperty('--glow', shown.toFixed(3));
    lamp.style.setProperty('--hue', String(Math.round(52 - 52 * shown))); // yellow -> red
  })();
}

// ---- the NF-ModRack: the module drawer ----
if (SYNTH.openRack && !PREVIEW) {
  rackEdit = new RackEdit({
    root: document.getElementById('sections'), button: document.getElementById('btn-modules'),
    getRows: () => SYNTH.parseLayout(patch['rack.layout']),
    change: changeRack, toast: (t) => patchMenu.toast(t),
  });
}

// ---- start menu: choose a synth ----
const startMenu = new StartMenu({ skip: PREVIEW });
document.getElementById('btn-synths').addEventListener('click', () => startMenu.open());

// ---- lesson panel: pinned to the top of the window (see showScopes above). A question or hint
// makes it taller and the page scrolls, rather than the synth shrinking.
const lessonWrap = document.getElementById('lesson-wrap');
// (with the modules maximised they always fit the room left below it, whatever its height)
if (maxMods) new ResizeObserver(() => { if (maxMods.on) fit(); }).observe(lessonWrap);
// The processors (NF-C1): in lessons the screens, the player and the unit all fit below the lesson
// panel, so nothing needs scrolling; the panel grows and shrinks (a question, a hint), so re-fit.
if (PROC) new ResizeObserver(() => { if (document.body.classList.contains('lesson-mode')) { fit(); window.scrollTo(0, 0); } }).observe(lessonWrap);

// ---- modular synths: cables over the panel, and lamps by the output jacks ----
// The NF-Modular's Output has an Overload light: it glows while the output limiter is working
// (a patch too hot, or feeding back). If a runaway loop ever forces the rack to reset, say so.
let overLamp = null, lastResets = 0;
// (a function declaration: the NF-ModRack builds its Output module again when the rack changes)
function addOverLamp() {
  const outSection = SYNTH.modular && sections.out;
  if (!outSection || !(SYNTH.id === 'nfmod' || SYNTH.openRack)) return;
  const led = document.createElement('div');
  led.className = 'overload-led out-overload';
  led.dataset.help = 'outoverload';
  led.innerHTML = '<span class="overload-lamp"></span><span class="beat-label">Overload</span>';
  (outSection.querySelector('.jack-rows') || outSection).appendChild(led);
  overLamp = led.querySelector('.overload-lamp');
}
addOverLamp();
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

// ---- processors: the sound going in, the meters, the space bar ----
// Make (or fetch) the chosen sound once the audio is running, and hand it to the engine.
function sendSource() {
  // the console: its four-track song, all at once
  if (SYNTH.kind === 'console') {
    if (sentSources.has('song')) return;
    sentSources.add('song');
    Promise.resolve(ensureAudio()).then(async () => engine.post({ type: 'source', chans: await loadSong(engine.ctx) }))
      .catch(() => { sentSources.delete('song'); patchMenu.toast('The song could not be loaded. Check your connection and press Play again.'); });
    return;
  }
  const id = patch['src.sound'];
  if (sentSources.has(id)) return;
  Promise.resolve(ensureAudio()).then(async () => {
    if (sentSources.has(id)) return;
    if (id === 'user' && !userFileName()) {
      if (patch['src.play'] === 'play') patchMenu.toast('Load a sound file first: Load your own… on the player.');
      return;
    }
    let chans;
    try { chans = await loadSource(engine.ctx, id); } catch (e) {
      patchMenu.toast('That sound could not be loaded. Check your connection and press Play again.');
      return;
    }
    if (!chans) return;
    sentSources.add(id);
    engine.post({ type: 'source', id, chans });
  });
}

function buildLoadButton() {
  const wrap = document.createElement('div');
  wrap.className = 'load-own';
  wrap.dataset.help = 'loadown';
  wrap.innerHTML = '<button class="btn load-btn">Load your own…</button><input type="file" accept="audio/*,.wav,.mp3,.aif,.aiff,.flac,.ogg,.m4a" hidden><div class="load-name"></div>';
  const btn = wrap.querySelector('button'), input = wrap.querySelector('input'), name = wrap.querySelector('.load-name');
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    try {
      await ensureAudio();
      const chans = await loadUserFile(engine.ctx, file);
      engine.post({ type: 'source', id: 'user', chans });
      sentSources.add('user');
      name.textContent = file.name;
      name.title = file.name;
      knobs['src.sound'].commit('user');
      knobs['src.play'].commit('play');
    } catch (e) {
      patchMenu.toast('This browser could not read that file as audio. WAV, MP3, FLAC and AAC (.m4a) work in every browser; AIFF and Apple Lossless only in Safari.');
    }
  });
  return wrap;
}

// The loop player (NF-C1): a separate slim unit racked below the processor, playing the sound that goes
// into it: Play, a display (what is playing, how far through the loop), the sounds, Load your own.
function buildPlayer() {
  const P = SYNTH.PLAYER;
  const unit = document.createElement('section');
  unit.className = 'player-unit';
  unit.innerHTML = `<div class="cheek left"></div><div class="player-face section" data-section="${P.id}">
    <div class="player-brand" data-help="section:${P.id}"><span class="brand-mark">NoFoe</span><span class="player-name">${P.title}</span></div>
    <div class="player-display" data-help="${P.sound || 'section:' + P.id}"><div class="pd-row"><span class="pd-state"></span><span class="pd-now"></span></div><div class="pd-bar"><i></i></div></div>
    <div class="lock-veil"><span>LOCKED</span></div></div><div class="cheek right"></div>`;
  const face = unit.querySelector('.player-face'), display = unit.querySelector('.player-display');
  sections[P.id] = face;
  display.before(makeControl(P.play, {}));
  // a choice of sounds and Load your own (the NF-C1), or one song (the NF-Mix4's multitrack: P.text)
  if (P.sound) display.after(makeControl(P.sound, {}), buildLoadButton());
  // a tiny meter per track (the NF-Mix4's multitrack: P.tracks, levels from P.trackDb)
  const trackBars = [];
  if (P.tracks) {
    const box = document.createElement('div');
    box.className = 'pl-tracks';
    box.dataset.help = 'trackmeters';
    P.tracks.forEach((name, i) => {
      const t = document.createElement('div');
      t.className = 'pl-track';
      t.title = `Track ${i + 1}: ${name}`;
      t.innerHTML = `<div class="pl-bar"><i></i></div><span>${i + 1}</span>`;
      box.appendChild(t);
      trackBars.push({ el: t.querySelector('i'), v: 0 });
    });
    display.after(box);
  }
  const synth = document.querySelector('#stage > .synth');
  // the console (with its rack beside it): the desk and its player share one column
  if (SYNTH.OUTBOARD) {
    const col = document.createElement('div');
    col.className = 'console-col';
    synth.before(col);
    col.append(synth, unit);
  } else synth.after(unit);
  // the display follows what the engine is playing
  const state = display.querySelector('.pd-state'), now = display.querySelector('.pd-now'), bar = display.querySelector('.pd-bar i');
  let shown = '';
  (function tick() {
    requestAnimationFrame(tick);
    const id = P.sound ? patch[P.sound] : null, opt = P.sound ? PARAMS[P.sound].options.find((o) => o.v === id) : null;
    const name = !P.sound ? P.text : id === 'user' ? (userFileName() || 'No file loaded') : (opt ? opt.label : '');
    const live = engine.live || {}, playing = patch[P.play] === 'play' && engine.running && live.playing;
    const text = `${playing ? '▶' : '■'}|${name}`;
    if (text !== shown) { shown = text; state.textContent = playing ? '▶' : '■'; now.textContent = name; now.title = name; display.classList.toggle('playing', !!playing); }
    bar.style.transform = `scaleX(${playing || live.pos ? Math.min(1, live.pos || 0) : 0})`;
    if (trackBars.length) { // rise at once, fall back smoothly
      const dbs = playing && P.trackDb ? P.trackDb(live) : null;
      trackBars.forEach((b, i) => {
        const v = dbs ? Math.max(0, Math.min(1, (dbs[i] + 48) / 48)) : 0;
        b.v = Math.max(v, b.v * 0.9);
        b.el.style.transform = `scaleY(${b.v.toFixed(3)})`;
      });
    }
  })();
}

// The NF-Mix4's outboard rack, beside the screens: the patch bay on top (every patch point, as
// sockets: outputs above, inputs below), then the separate units (reverb, delay, compressors), each
// with its few controls and little In and Out meters, so students can see they have patched it.
function buildOutboard() {
  const rack = document.createElement('div');
  rack.className = 'outboard-rack';
  const unitOf = (cls, inner) => {
    const unit = document.createElement('section');
    unit.className = 'outboard-unit ' + cls;
    unit.innerHTML = `<div class="cheek left"></div><div class="outboard-face">${inner}</div><div class="cheek right"></div>`;
    rack.appendChild(unit);
    return unit.querySelector('.outboard-face');
  };
  const mini = () => { const m = document.createElement('div'); m.className = 'mini-meter'; m.innerHTML = '<i></i>'.repeat(5); return m; };
  const minis = []; // [key, the meter]
  // the patch bay: a tall unit standing between the desk and the screens, one row per pair
  // (an output on the left, the input it usually feeds on the right), with room for full labels
  if (SYNTH.PATCHBAY && cables) {
    const B = SYNTH.PATCHBAY;
    const unit = document.createElement('section');
    unit.className = 'patchbay-v';
    unit.innerHTML = `<div class="pb-head" data-help="section:${B.id}">${B.title}</div><div class="pb-cols"><span>Out</span><span>In</span></div><div class="pb-rows section" data-section="${B.id}"></div>
      <div class="pb-foot"><span class="brand-mark">NoFoe</span></div>`;
    const rows = unit.querySelector('.pb-rows');
    B.pairs.forEach((pair) => {
      const row = document.createElement('div');
      row.className = pair ? 'pb-row' : 'pb-gap';
      if (pair) row.append(cables.makeOut(pair[0].slice(4)), cables.makeIn(pair[1]));
      rows.appendChild(row);
    });
    sections[B.id] = rows;
    document.getElementById('stage').appendChild(unit);
  }
  SYNTH.OUTBOARD.forEach((sec) => {
    const face = unitOf('ob-' + sec.id, `<div class="ob-brand" data-help="section:${sec.id}"><span class="brand-mark">NoFoe</span><span class="ob-name">${sec.brandSub}</span></div>`);
    face.appendChild(buildSection(sec));
    if (sec.io) {
      const io = document.createElement('div');
      io.className = 'ob-io';
      sec.io.forEach((key, i) => {
        const row = document.createElement('div');
        row.className = 'io-row';
        row.dataset.help = 'iometer';
        row.innerHTML = `<span>${i ? 'Out' : 'In'}</span>`;
        const m = mini(); row.appendChild(m); minis.push([key, m]);
        io.appendChild(row);
      });
      face.appendChild(io);
    }
    if (sec.gr && consoleMeters) face.appendChild(consoleMeters.ladder(sec.gr, 'GR', 'ocgrmeter'));
  });
  document.getElementById('stage').appendChild(rack);
  // the mini meters: five tiny lights each, is anything arriving at an input / leaving an output?
  const STEPS = [-48, -36, -24, -12, -3]; // dBFS, one light each
  const state = minis.map(([key, m]) => ({ key, lights: [...m.children], v: -140 }));
  (function miniLoop() {
    requestAnimationFrame(miniLoop);
    const live = engine.running && engine.live && engine.live.console ? engine.live : null;
    state.forEach((mm) => {
      const db = live ? ((live.insDb && live.insDb[mm.key]) ?? (live.outsDb && live.outsDb[mm.key]) ?? -140) : -140;
      mm.v = Math.max(db, mm.v - 1.5); // falls about 90 dB a second
      mm.lights.forEach((l, i) => l.classList.toggle('on', mm.v >= STEPS[i]));
    });
  })();
}

// Level meters: In, Gain Reduction, Out. Segmented ladders, like a hardware unit.
function buildMeters() {
  const box = document.createElement('div');
  box.className = 'meters';
  [['in', 'In', 'meter-in'], ['gr', 'GR', 'meter-gr'], ['out', 'Out', 'meter-out']].forEach(([id, text, help]) => {
    const m = document.createElement('div');
    m.className = `meter meter-${id}`;
    m.dataset.help = help;
    const segs = 20;
    m.innerHTML = `<div class="meter-clip"></div><div class="meter-ladder">${'<i></i>'.repeat(segs)}</div><div class="meter-label">${text}</div>`;
    box.appendChild(m);
    meters.push({ id, el: m, segs: [...m.querySelectorAll('i')].reverse(), clip: m.querySelector('.meter-clip'), shown: id === 'gr' ? 0 : -120, clipAt: 0 });
  });
  // ear protection light (NF-C1): lit while the engine is turning the output down to protect ears
  const prot = document.createElement('div');
  prot.className = 'protect';
  prot.dataset.help = 'protect';
  prot.innerHTML = '<span class="protect-lamp"></span>Protect';
  let toldAt = -1e9;
  (function protLoop() {
    requestAnimationFrame(protLoop);
    const on = engine.running && engine.live && engine.live.protect > 1;
    prot.classList.toggle('on', !!on);
    if (on && engine.live.protect > 3 && performance.now() - toldAt > 20000) {
      toldAt = performance.now();
      patchMenu.toast('Very loud: the output is being turned down to protect your ears. Try less Makeup.');
    }
  })();
  const scale = document.createElement('div');
  scale.className = 'meter-scale';
  scale.innerHTML = '<span>0</span><span>−12</span><span>−24</span><span>−36</span><span>−48</span>';
  box.insertBefore(scale, box.children[1]);
  const wrap = document.createElement('div');
  wrap.className = 'meters-wrap';
  wrap.append(box, prot);
  return wrap;
}
if (PROC && SYNTH.kind !== 'console') {
  let last = performance.now();
  (function meterLoop() {
    requestAnimationFrame(meterLoop);
    // Auto makeup (NF-C1): the Makeup pot turns to show what the unit is adding, and goes back to
    // its own setting when Auto is switched off (the patch keeps the pot's own value throughout)
    if (PARAMS['comp.auto'] && knobs['comp.makeup']) {
      const k = knobs['comp.makeup'];
      const want = patch['comp.auto'] === 'on' && engine.live && engine.live.makeup != null ? Math.round(engine.live.makeup * 10) / 10 : patch['comp.makeup'];
      if (k.value !== want) k.set(want);
    }
    const now = performance.now(), dt = (now - last) / 1000;
    last = now;
    const n = scope.n, recent = (arr, f) => { let v = f === 'max' ? -Infinity : 0; for (let a = 0; a < 6 && a < n; a++) v = Math.max(v, arr[(n - 1 - a + scope.cap) % scope.cap]); return v; };
    meters.forEach((m) => {
      const live = engine.running && n > 0;
      if (m.id === 'gr') {
        const g = live ? recent(scope.gr, 'max') : 0;
        m.shown = Math.max(g, m.shown - 30 * dt);
        // lights from the top down: 0 to -24 dB of reduction
        m.segs.forEach((s, i) => s.classList.toggle('on', m.shown > 0.3 && (m.segs.length - 1 - i) < m.shown / 24 * m.segs.length));
        return;
      }
      const v = live ? recent(m.id === 'in' ? scope.inp : scope.out, 'max') : -120;
      m.shown = Math.max(v, m.shown - 24 * dt); // falls 24 dB a second
      m.segs.forEach((s, i) => s.classList.toggle('on', m.shown > -48 + (i / m.segs.length) * 48));
      if (v >= 0) m.clipAt = now;
      m.clip.classList.toggle('on', now - m.clipAt < 1200);
    });
  })();
}
// The console's ear protection (see console-processor.js): say why the sound has been turned down
if (SYNTH.kind === 'console') {
  let told = -1e9;
  (function protLoop() {
    requestAnimationFrame(protLoop);
    const l = engine.running && engine.live;
    if (l && l.protect > 3 && performance.now() - told > 20000) {
      told = performance.now();
      patchMenu.toast('Very loud: the output is being turned down to protect your ears. Look for a feedback loop (a bus patched back into a channel that feeds it), or turn something down.');
    }
  })();
}
if (PROC) {
  // space bar: play / stop
  const playId = PARAMS['src.play'] ? 'src.play' : 'tape.play';
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) return;
    e.preventDefault();
    knobs[playId].commit(patch[playId] === 'play' ? 'stop' : 'play');
  });
  // label the screens for what they show
  const caps = document.querySelectorAll('.screen-caption');
  const names = SYNTH.kind === 'console'
    ? ['<span>SIGNAL FLOW</span><span>the selected channel, stage by stage</span>', '<span>EQ</span><span>the selected channel · bus compressor</span>']
    : ['<span>LEVELS</span><span>in · out · gain reduction</span>', '<span>TRANSFER CURVE</span><span>out against in, dB</span>'];
  caps.forEach((cap, i) => { if (names[i]) cap.innerHTML = names[i]; });
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
