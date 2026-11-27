// Start menu: choose which synth to play. Shown when the page opens without a synth
// chosen, and from the Synths button. Picking another synth reloads the page with
// ?synth=<id>, so each synth starts clean with its own panel and sound engine.
// Card pictures live in img/ and are regenerated with tools/make-previews.sh.

import { SYNTHS, SYNTH, SYNTH_CHOSEN, nameHtml } from './params.js';

// Changed by tools/make-previews.sh each time the pictures are re-captured, so browsers fetch
// the new pictures instead of showing ones they have kept from before.
const PREVIEW_VERSION = '202611270834';

export class StartMenu {
  constructor({ skip = false } = {}) {
    this.el = document.getElementById('start-menu');
    const cards = document.getElementById('sm-cards');
    SYNTHS.forEach((s) => {
      const card = document.createElement('button');
      card.className = 'sm-card';
      card.dataset.synth = s.id;
      card.innerHTML = `
        <div class="sm-preview" aria-hidden="true"><img src="img/preview-${s.id}.png?v=${PREVIEW_VERSION}" alt="" loading="eager"></div>
        <div class="sm-tag">${s.card.tagline}</div>
        <div class="sm-name">${nameHtml(s.name)}</div>
        <p class="sm-text">${s.card.text}</p>
        <div class="sm-foot"><span class="sm-play">Play ${s.name} ▸</span>${s.lessons ? '<span class="sm-badge">Lessons</span>' : ''}${s.id === SYNTH.id && SYNTH_CHOSEN ? '<span class="sm-badge current">Playing now</span>' : ''}</div>`;
      card.addEventListener('click', () => this.choose(s.id));
      cards.appendChild(card);
    });
    document.getElementById('sm-close').addEventListener('click', () => this.close());
    this.el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && SYNTH_CHOSEN) this.close(); e.stopPropagation(); });
    if (!SYNTH_CHOSEN && !skip) this.open(true);
  }

  open(first = false) {
    this.el.hidden = false;
    document.getElementById('sm-close').hidden = first; // on first load, a synth must be chosen
    document.body.classList.add('start-open');
  }

  close() {
    this.el.hidden = true;
    document.body.classList.remove('start-open');
  }

  choose(id) {
    if (id === SYNTH.id && SYNTH_CHOSEN) { this.close(); return; }
    if (id === SYNTH.id) {
      // first visit, same synth as the default: just record the choice in the address
      history.replaceState(null, '', `?synth=${id}`);
      this.close();
      return;
    }
    location.search = `?synth=${id}`;
  }
}
