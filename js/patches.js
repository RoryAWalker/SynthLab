// The Patch menu: factory presets plus the user's own saved patches.
// Saved patches live in this browser (localStorage); Export/Import moves them between
// browsers and computers as a .json file.

import { PARAMS, PRESETS, defaultPatch, SYNTH, SYNTHS } from './params.js';

const STORE = `${SYNTH.id}.userPatches`; // each synth keeps its own saved patches
const FILE_FORMAT = 'synthlab-patches';

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save(all) {
  try { localStorage.setItem(STORE, JSON.stringify(all)); return true; } catch { return false; }
}

// Keep only known controls with valid values (anything else falls back to the default),
// so an imported or old patch can never put the synth in a broken state.
// The cables in an input: only outputs this synth has, each once, up to four (one where an input
// takes a single cable). '' is no cable.
function cablesIn(v, outs = SYNTH.OUTPUTS || {}) {
  const list = [...new Set(v.split(',').map((x) => x.trim()).filter((x) => x in outs))];
  return list.slice(-(SYNTH.multiInput ? 4 : 1)).join(',');
}

// the NF-ModRack's width (in racks) in a patch, if it is a sensible one
const bays = (obj) => (obj && Number.isInteger(obj['rack.bays']) && obj['rack.bays'] >= 1 && obj['rack.bays'] <= (SYNTH.MAX_BAYS || 1) ? obj['rack.bays'] : 1);
export function sanitizePatch(obj) {
  // the NF-ModRack: the patch's own rack of modules decides which controls and sockets it has
  const rack = SYNTH.openRack ? SYNTH.build(obj && typeof obj['rack.layout'] === 'string' ? obj['rack.layout'] : undefined, bays(obj)) : null;
  const P = rack ? { ...PARAMS, ...rack.PARAMS } : PARAMS, OUTS = rack ? rack.OUTPUTS : SYNTH.OUTPUTS;
  const out = {};
  for (const id in P) out[id] = P[id].def;
  if (!obj || typeof obj !== 'object') return rack ? { ...out, 'rack.layout': SYNTH.layoutString(rack.rows) } : defaultPatch();
  if (rack) { out['rack.layout'] = SYNTH.layoutString(rack.rows); Object.keys(out).forEach((id) => { if (!(id in rack.PARAMS) && !id.startsWith('fx.')) delete out[id]; }); }
  else Object.assign(out, defaultPatch());
  for (const id in out) {
    const spec = P[id], v = obj[id];
    if (v === undefined || spec.type === 'layout') continue;
    if (spec.type === 'step') { if (spec.options.some((o) => o.v === v)) out[id] = v; }
    else if (spec.type === 'jack') { if (typeof v === 'string') out[id] = cablesIn(v, OUTS); } // a cable (or several) into an input
    else if (spec.type === 'nodes') { if (spec.valid(v)) out[id] = v; } // a drawn shape (the NF-ModRack's Draw)
    else if (typeof v === 'number' && Number.isFinite(v)) out[id] = Math.min(spec.max, Math.max(spec.min, v));
  }
  return out;
}

export class PatchMenu {
  // deps: { getPatch, setPatch }
  constructor(deps) {
    this.d = deps;
    this.user = load();
    this.sel = document.getElementById('preset');
    this.sel.addEventListener('change', () => { this.loadSelected(); this.sel.blur(); });
    document.getElementById('btn-save').addEventListener('click', () => this.openSave());
    document.getElementById('btn-delete').addEventListener('click', () => this.deleteSelected());
    document.getElementById('btn-init').addEventListener('click', () => { this.d.setPatch({}); this.select('f:' + (SYNTH.initName || 'Init')); });

    // ⋯ menu
    const more = document.getElementById('patch-more');
    const menu = document.getElementById('patch-more-menu');
    more.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.hidden = true; });
    document.getElementById('btn-export').addEventListener('click', () => { menu.hidden = true; this.exportFile(); });
    document.getElementById('btn-import').addEventListener('click', () => { menu.hidden = true; document.getElementById('import-file').click(); });
    document.getElementById('import-file').addEventListener('change', (e) => { this.importFile(e.target.files[0]); e.target.value = ''; });

    // save dialog
    this.dlg = document.getElementById('save-dialog');
    this.nameInput = document.getElementById('save-name');
    this.err = document.getElementById('save-error');
    document.getElementById('save-cancel').addEventListener('click', () => this.closeSave());
    document.getElementById('save-form').addEventListener('submit', (e) => { e.preventDefault(); this.confirmSave(); });
    this.nameInput.addEventListener('input', () => { this.err.textContent = ''; this.replacing = false; this.updateSaveButton(); });
    this.dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeSave(); e.stopPropagation(); });
    this.dlg.addEventListener('keyup', (e) => e.stopPropagation()); // typing a name must not play notes

    this.render();
    this.select('f:' + (SYNTH.initName || 'Init'));
  }

  render() {
    const keep = this.sel.value;
    this.sel.innerHTML = '';
    const edited = new Option('— edited —', '');
    edited.disabled = true;
    this.sel.appendChild(edited);
    const factory = document.createElement('optgroup');
    factory.label = 'Factory';
    Object.keys(PRESETS).forEach((n) => factory.appendChild(new Option(n, 'f:' + n)));
    this.sel.appendChild(factory);
    const names = Object.keys(this.user).sort((a, b) => a.localeCompare(b));
    if (names.length) {
      const mine = document.createElement('optgroup');
      mine.label = 'My patches';
      names.forEach((n) => mine.appendChild(new Option(n, 'u:' + n)));
      this.sel.appendChild(mine);
    }
    this.sel.value = keep;
    if (this.sel.selectedIndex < 0) this.sel.value = '';
    this.updateDelete();
  }

  select(value) { this.sel.value = value; this.updateDelete(); }
  markEdited() { if (this.sel.value !== '') this.select(''); }
  get selectedUserName() { return this.sel.value.startsWith('u:') ? this.sel.value.slice(2) : null; }
  updateDelete() { document.getElementById('btn-delete').hidden = !this.selectedUserName; }

  loadSelected() {
    const v = this.sel.value;
    if (v.startsWith('f:')) this.d.setPatch(PRESETS[v.slice(2)]);
    else if (v.startsWith('u:')) this.d.setPatch(sanitizePatch(this.user[v.slice(2)]));
    this.updateDelete();
  }

  // ---- save ----
  openSave() {
    this.lastName = this.selectedUserName || this.lastName || '';
    this.nameInput.value = this.lastName;
    this.err.textContent = '';
    this.replacing = false;
    this.dlg.hidden = false;
    this.updateSaveButton();
    setTimeout(() => { this.nameInput.focus(); this.nameInput.select(); }, 0);
  }
  closeSave() { this.dlg.hidden = true; }

  updateSaveButton() {
    const name = this.nameInput.value.trim();
    document.getElementById('save-ok').textContent = this.user[name] ? (this.replacing ? 'Replace' : 'Save') : 'Save';
  }

  confirmSave() {
    const name = this.nameInput.value.trim().slice(0, 40);
    if (!name) { this.err.textContent = 'Enter a name for your patch.'; this.nameInput.focus(); return; }
    if (this.user[name] && !this.replacing && name !== this.selectedUserName) {
      this.err.textContent = `You already have a patch called "${name}". Save again to replace it.`;
      this.replacing = true;
      this.updateSaveButton();
      return;
    }
    this.user[name] = sanitizePatch(this.d.getPatch());
    if (!save(this.user)) { this.err.textContent = "Couldn't save: this browser is blocking storage."; return; }
    this.lastName = name;
    this.render();
    this.select('u:' + name);
    this.closeSave();
    this.toast(`Saved "${name}"`);
  }

  deleteSelected() {
    const name = this.selectedUserName;
    if (!name) return;
    if (!window.confirm(`Delete your patch "${name}"? This can't be undone.`)) return;
    delete this.user[name];
    save(this.user);
    this.render();
    this.select('');
    this.toast(`Deleted "${name}"`);
  }

  // ---- export / import ----
  exportFile() {
    const names = Object.keys(this.user);
    if (!names.length) { this.toast('You have no saved patches to export yet'); return; }
    const data = JSON.stringify({ format: FILE_FORMAT, version: 1, synth: SYNTH.id, patches: this.user }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = `synthlab-${SYNTH.id}-patches.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.toast(`Exported ${names.length} patch${names.length > 1 ? 'es' : ''}`);
  }

  async importFile(file) {
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { this.toast("That file isn't a SynthLab patch file"); return; }
    if (!data || data.format !== FILE_FORMAT || typeof data.patches !== 'object') { this.toast("That file isn't a SynthLab patch file"); return; }
    const fileSynth = data.synth || 'nf1'; // files from before the second synth are NF-1 patches
    if (fileSynth !== SYNTH.id) {
      const other = SYNTHS.find((s) => s.id === fileSynth);
      this.toast(`Those patches are for the ${other ? other.name : 'another synth'}. Switch synth to import them.`);
      return;
    }
    let count = 0;
    for (const [rawName, p] of Object.entries(data.patches)) {
      let name = String(rawName).trim().slice(0, 40) || 'Imported';
      if (this.user[name]) { let i = 2; while (this.user[`${name} (${i})`]) i++; name = `${name} (${i})`; }
      this.user[name] = sanitizePatch(p);
      count++;
    }
    save(this.user);
    this.render();
    this.toast(`Imported ${count} patch${count === 1 ? '' : 'es'}`);
  }

  toast(text) {
    const t = document.getElementById('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), Math.max(2200, text.length * 55)); // long messages stay longer
  }
}
