import { HELP, helpKeyFor } from './help.js';
import { PARAMS, ALL_SECTIONS, formatValue } from './params.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function sectionOf(paramId) {
  return ALL_SECTIONS.find((s) => s.rows.some((r) => r.includes(paramId)));
}

function rangeText(id) {
  const p = PARAMS[id];
  if (p.type === 'step') return p.options.map((o) => o.label).join(' · ');
  return `${p.fmt(p.min)} to ${p.fmt(p.max)}`;
}

// Side panel that explains whatever element (with a data-help attribute) is hovered.
export class HelpPanel {
  constructor(el, getPatch) {
    this.el = el;
    this.getPatch = getPatch;
    this.key = null;
    this.body = el.querySelector('.help-content');
    this.show('intro');

    const onHover = (e) => {
      if (!this.open || document.body.classList.contains('knob-dragging')) return;
      const t = e.target.closest && e.target.closest('[data-help]');
      if (t && !el.contains(t)) {
        this.show(t.dataset.help);
        if (e.type === 'focusin') this.moveAwayFromElement(t); // keyboard users
      }
    };
    document.addEventListener('mouseover', onHover);
    document.addEventListener('focusin', onHover);
    // The panel lets the mouse pass through. When the pointer goes underneath it,
    // the panel jumps to the other side of the screen.
    document.addEventListener('mousemove', (e) => {
      if (!this.open) return;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top) this.flip();
    });
  }

  flip() {
    this.el.classList.toggle('left');
    this.el.classList.remove('flipping');
    void this.el.offsetWidth; // restart the fade
    this.el.classList.add('flipping');
  }

  // For keyboard focus: if the focused control sits under the panel, move the panel.
  moveAwayFromElement(target) {
    const r = target.getBoundingClientRect();
    const p = this.el.getBoundingClientRect();
    if (r.right > p.left && r.left < p.right && r.width < window.innerWidth - p.width) this.flip();
  }

  get open() { return document.body.classList.contains('help-open'); }

  show(rawKey) {
    if (rawKey === this.key) return;
    this.key = rawKey;
    const [paramId, optValue] = rawKey.split('=');
    const entry = HELP[helpKeyFor(rawKey)] || HELP[paramId];
    if (!entry) return;

    let eyebrow = '';
    let valueHtml = '';
    if (PARAMS[paramId]) {
      const sec = sectionOf(paramId);
      eyebrow = sec ? sec.title : '';
      if (optValue !== undefined) {
        eyebrow += ' · ' + PARAMS[paramId].label + ' option';
      } else {
        valueHtml = `<div class="help-value"><span>Now</span><b id="help-now"></b></div>
          <div class="help-range"><span>Range</span>${esc(rangeText(paramId))}</div>`;
      }
    } else if (rawKey.startsWith('section:')) {
      eyebrow = 'Section';
    } else if (rawKey !== 'intro') {
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
  }

  // Keep the "Now" readout live while the hovered knob is being turned.
  refresh(changedId) {
    if (!this.paramId || (changedId && changedId !== this.paramId)) return;
    const now = this.body.querySelector('#help-now');
    if (now) now.textContent = formatValue(this.paramId, this.getPatch()[this.paramId]);
  }
}
