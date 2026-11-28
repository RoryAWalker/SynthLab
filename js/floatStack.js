// Floating panels that can overlap (the Ask panel, the Help panel, the module drawer): whichever
// was opened or clicked most recently goes in front. Nothing folds away: each panel stays where
// it is, so the one behind is still there when the one in front is closed.
//
// Panels stack between z-index 61 and 69: above the panel's own layers and the pop-out graph (60),
// below the finale fireworks (70), the toast (80) and full-screen dialogs (90).

const BASE = 61, TOP = 69;
const panels = []; // back to front

function restack() { panels.forEach((el, i) => { el.style.zIndex = String(Math.min(TOP, BASE + i)); }); }

export function raise(el) {
  const i = panels.indexOf(el);
  if (i >= 0) panels.splice(i, 1);
  panels.push(el);
  restack();
}

const shown = (el) => !el.hidden && getComputedStyle(el).display !== 'none';

// Watch one panel: it comes to the front when it appears and whenever it is clicked.
export function float(el) {
  if (!el || el.dataset.float) return;
  el.dataset.float = '1';
  panels.unshift(el); // a new panel starts at the back until it's shown
  let was = shown(el);
  if (was) raise(el);
  new MutationObserver(() => { const now = shown(el); if (now && !was) raise(el); was = now; })
    .observe(el, { attributes: true, attributeFilter: ['hidden', 'class'] });
  el.addEventListener('pointerdown', () => raise(el), true);
}

// The panels made elsewhere: the Help panel is in the page, the module drawer is added later.
export function floatAll() {
  const pick = () => document.querySelectorAll('.help-panel, .module-drawer, .ask-panel').forEach(float);
  pick();
  new MutationObserver(pick).observe(document.body, { childList: true });
}
