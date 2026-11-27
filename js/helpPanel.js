import { HELP, HELP_NF3, HELP_NFM, HELP_NFMOD, helpKeyFor } from './help.js';
import { EXT } from './lab.js';
import { PARAMS, ALL_SECTIONS, formatValue, SYNTH } from './params.js';

const HELP_FOR_SYNTH = { nf3: HELP_NF3, nfm: HELP_NFM, nfmod: HELP_NFMOD, ...(EXT.help || {}) }[SYNTH.helpAs || SYNTH.id] || {};
// (the NF-ModRack's modules share the NF-Modular's help: SYNTH.helpKey finds the entry, e.g. vco3.tune -> osc1.tune)
const direct = (k) => HELP_FOR_SYNTH[k] || HELP[k];
const lookup = (k) => {
  const m = SYNTH.helpKey && SYNTH.helpKey(k);
  return direct(k) || (m ? direct(m) || direct(helpKeyFor(m)) : undefined);
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Every control id in a section: its rows, the rows of its parts (a split module), and stacked cells
function idsIn(sec) {
  const rows = [...(sec.rows || []), ...(sec.parts || []).flatMap((p) => p.rows || []), sec.head || [], sec.titleSwitch || [], sec.fader ? [sec.fader] : []];
  return rows.flat(2).filter(Boolean);
}
function sectionOf(paramId) {
  return ALL_SECTIONS.find((s) => idsIn(s).includes(paramId));
}

function rangeText(id) {
  const p = PARAMS[id];
  if (p.type === 'step') return p.options.map((o) => o.label).join(' · ');
  if (p.type === 'wheel') return `${p.fmt(p.min)} to ${p.fmt(p.max)}`;
  return `${p.fmt(p.min)} to ${p.fmt(p.max)}`;
}

const DWELL_MS = 1000; // how long to rest on a control before its help appears
const TOUCH_DWELL_MS = 300; // touch screens can't hover: a tap shows help almost at once

const helpTarget = (node) => (node && node.closest ? node.closest('[data-help]') : null);

// Hover help. Rest the mouse on any control for a second and the panel appears on the
// far side of the screen; move off and it disappears. Grabbing a knob before the
// second is up means "just let me use it": no help for that visit. Grabbing a knob
// once its help is showing keeps the help open while you turn it.
export class HelpPanel {
  constructor(el, getPatch) {
    this.el = el;
    this.getPatch = getPatch;
    this.body = el.querySelector('.help-content');
    this.key = null;
    this.current = null;    // help element under the pointer
    this.shownFor = null;   // element whose help is showing
    this.suppressed = null; // element the user grabbed before its help appeared
    this.pinned = false;    // help is showing and its knob is being turned
    this.timer = null;

    document.addEventListener('mouseover', (e) => {
      if (this.pinned || document.body.classList.contains('knob-dragging')) return;
      this.hoverTo(helpTarget(e.target));
    });
    document.addEventListener('mouseout', (e) => { if (!e.relatedTarget && !this.pinned) this.hoverTo(null); });
    document.addEventListener('pointerdown', (e) => { this.touch = e.pointerType === 'touch'; this.engage(helpTarget(e.target)); }, true);
    document.addEventListener('wheel', (e) => this.engage(helpTarget(e.target)), { capture: true, passive: true });
    document.addEventListener('keydown', (e) => {
      if (/^(Arrow|Home$|End$)/.test(e.key)) this.engage(helpTarget(e.target));
    }, true);
    document.addEventListener('pointerup', (e) => this.release(e), true);
    document.addEventListener('pointercancel', (e) => this.release(e), true);
  }

  hoverTo(t) {
    if (t === this.current) return;
    this.current = t;
    this.suppressed = null;
    clearTimeout(this.timer);
    this.hide();
    if (!t || !this.open) return;
    this.timer = setTimeout(() => {
      if (this.current === t && this.suppressed !== t) this.showFor(t);
    }, this.touch ? TOUCH_DWELL_MS : DWELL_MS);
  }

  engage(t) {
    if (!t) return;
    if (this.touch) return; // on touch, the tap itself is how you ask for help (see release)
    if (t === this.shownFor) { this.pinned = true; return; } // help already up: keep it while turning
    if (t === this.current) { clearTimeout(this.timer); this.suppressed = t; } // too soon: no help this visit
  }

  release(e) {
    const wasPinned = this.pinned;
    this.pinned = false;
    // mouseover is ignored during a drag, so re-check what is under the pointer now
    const under = helpTarget(document.elementFromPoint(e.clientX, e.clientY));
    // touch: every tap on a control (re)opens its help; a tap on empty space closes it
    if (this.touch) { this.current = null; this.hoverTo(under); return; }
    if (under !== this.current || (wasPinned && under !== this.shownFor)) this.hoverTo(under);
  }

  showFor(t) {
    this.shownFor = t;
    this.show(t.dataset.help);
    // open on the side of the screen away from the control
    const r = t.getBoundingClientRect();
    this.el.classList.toggle('left', r.left + r.width / 2 > window.innerWidth / 2);
    this.el.classList.add('visible');
    if (this.onShow) this.onShow(t.dataset.help);
  }

  hide() {
    if (this.shownFor && this.onHide) this.onHide();
    this.shownFor = null;
    this.el.classList.remove('visible');
  }

  get open() { return document.body.classList.contains('help-open'); }

  show(rawKey) {
    if (rawKey === this.key) return;
    this.key = rawKey;
    const [paramId, optValue] = rawKey.split('=');
    // No written help: say what the control is rather than leave the last help on screen
    const entry = lookup(rawKey) || lookup(helpKeyFor(rawKey)) || lookup(paramId)
      || { title: PARAMS[paramId] ? PARAMS[paramId].label : rawKey, body: [] };

    let eyebrow = '';
    let valueHtml = '';
    if (PARAMS[paramId]) {
      const sec = sectionOf(paramId);
      eyebrow = sec ? (sec.strip ? 'Channel ' + sec.title : sec.title) : '';
      if (optValue !== undefined) {
        eyebrow += ' · ' + PARAMS[paramId].label + ' option';
      } else {
        valueHtml = `<div class="help-value"><span>Now</span><b id="help-now"></b></div>
          <div class="help-range"><span>Range</span>${esc(rangeText(paramId))}</div>`;
      }
    } else if (rawKey.startsWith('section:')) {
      eyebrow = 'Section';
    } else {
      eyebrow = ['scope', 'spectrum', 'timebase', 'hold'].includes(rawKey) ? 'Displays' : 'Feature';
    }

    this.body.innerHTML = `
      ${eyebrow ? `<div class="help-eyebrow">${esc(eyebrow)}</div>` : ''}
      <h2 class="help-title">${esc(entry.title)}</h2>
      ${valueHtml}
      ${entry.body.map((p) => `<p>${esc(p)}</p>`).join('')}
      ${entry.tip ? `<div class="help-tip"><div class="help-tip-label">Try this</div>${esc(entry.tip)}</div>` : ''}`;
    this.paramId = optValue === undefined && PARAMS[paramId] ? paramId : null;
    this.refresh();
    this.el.scrollTop = 0;
  }

  // Keep the "Now" readout live while the hovered knob is being turned.
  refresh(changedId) {
    if (!this.paramId || (changedId && changedId !== this.paramId)) return;
    const now = this.body.querySelector('#help-now');
    if (now) now.textContent = formatValue(this.paramId, this.getPatch()[this.paramId]);
  }
}
