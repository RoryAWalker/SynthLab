// The Ask panel: type a request ("vibrato lead", "what does Resonance do?") and the synth's
// controls are set, or the question answered, in teaching language.
//
// Two answerers:
//   - the answer book (js/askBook.js + js/askbooks/<synth>.js): free and offline, the default;
//   - Claude, when the page is served by tools/ai/server.mjs and that server has an API key
//     (pay per use; the key never reaches the browser).
//
// Local only for now: main.js loads this file only on localhost.
//
// Nothing here is specific to one synth: the description the AI gets (every control, its range,
// its options and its help text) is generated from the synth's PARAMS, sections and help.js, so a
// new synth gets the Ask panel for free. Synths with patch cables (the modulars) are left out for
// now: a cable patch would need its own field in the answer (from/to jacks), and its own checks.

import { PARAMS, ALL_SECTIONS, SYNTH, defaultPatch, formatValue } from './params.js';
import { lookup } from './helpPanel.js';
import { helpKeyFor } from './help.js';
import { AskBook, movable } from './askBook.js';
import { NF3_BOOK } from './askbooks/nf3.js';
import { NFM_BOOK, NFMOD_BOOK } from './askbooks/modulars.js';
import { NF1_BOOK } from './askbooks/nf1.js';

const BOOKS = { nf1: NF1_BOOK, nf3: NF3_BOOK, nfm: NFM_BOOK, nfmod: NFMOD_BOOK }; // synths with an answer book

const API = '/api/ai';
const plain = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Which synths have the panel: all but the NF-ModRack (whose modules change from patch to patch)
// and the audio processors. Synths without a book of their own get the general answer book:
// questions from help.js and moving a named control, no sound recipes.
export const askSupported = () => !(SYNTH.openRack || SYNTH.kind);
// Claude mode needs a synth without cables: its answers can't patch cables yet.
const claudeSupported = () => !(SYNTH.modular || SYNTH.patchable || SYNTH.rack);

// ---- the synth, described for the AI ------------------------------------------------------------
function idsIn(sec) {
  const rows = [...(sec.rows || []), ...(sec.parts || []).flatMap((p) => p.rows || []), sec.head || [], sec.titleSwitch || [], sec.fader ? [sec.fader] : [], sec.jacks || []];
  return rows.flat(2).filter(Boolean);
}
const usable = (id) => PARAMS[id] && (PARAMS[id].type === 'cont' || PARAMS[id].type === 'step');

function describeControl(id) {
  const p = PARAMS[id];
  const h = lookup(id);
  const help = plain(h ? [...(h.body || []), h.tip ? 'Try: ' + h.tip : ''].join(' ') : p.help);
  let range;
  if (p.type === 'step') {
    range = 'switch, one of: ' + p.options.map((o) => {
      const oh = lookup(helpKeyFor(`${id}=${o.v}`));
      return `${JSON.stringify(o.v)} (${o.label}${oh && oh.body ? ': ' + plain(oh.body[0]) : ''})`;
    }).join('; ');
  } else {
    const curve = p.curve === 'log' ? ', logarithmic knob' : p.curve === 'pow' ? ', finer near the bottom' : '';
    range = `number from ${p.min} to ${p.max} (the panel shows ${p.fmt(p.min)} to ${p.fmt(p.max)}${curve})`;
  }
  return `- ${id} "${p.label}": ${range}. Default ${JSON.stringify(p.def)}. ${help}`;
}

export function buildGuide() {
  const lines = [`THE SYNTH: ${SYNTH.name}${SYNTH.brandSub ? ' (' + SYNTH.brandSub.toLowerCase() + ')' : ''}.`];
  if (SYNTH.card && SYNTH.card.text) lines.push(SYNTH.card.text);
  lines.push('', 'Its controls, section by section (id "panel label": range. default. what it does):');
  const ids = [];
  for (const sec of ALL_SECTIONS) {
    const own = idsIn(sec).filter(usable).filter((id) => !ids.includes(id));
    if (!own.length) continue;
    const sh = lookup('section:' + sec.id);
    lines.push('', `SECTION ${sec.title || sec.id}${sh && sh.body ? ': ' + plain(sh.body.join(' ')) : ''}`);
    for (const id of own) { lines.push(describeControl(id)); ids.push(id); }
  }
  return { guide: lines.join('\n'), ids };
}

// ---- checking the AI's settings against PARAMS -------------------------------------------------
// Every value is checked before it touches the synth: unknown controls are dropped, numbers are
// clamped to the knob's range, switch values must be one of the switch's options.
export function checkChanges(changes) {
  const ok = [], dropped = [];
  for (const c of changes || []) {
    const p = PARAMS[c.id];
    if (p && p.type === 'jack') { // a cable: '' (unplugged) or outputs that exist on this synth
      const v = String(c.value).trim();
      if (v.split(',').filter(Boolean).every((o) => o in (SYNTH.OUTPUTS || {}))) ok.push({ id: c.id, value: v, why: c.why });
      else dropped.push(`${p.label} cable from ${v} (no such output)`);
      continue;
    }
    if (!p || !movable(c.id)) { dropped.push(`${c.id} (no such control)`); continue; }
    if (p.type === 'step') {
      const raw = String(c.value).trim().replace(/^"|"$/g, '');
      const opt = p.options.find((o) => String(o.v) === raw) || p.options.find((o) => o.label.toLowerCase() === raw.toLowerCase());
      if (!opt) { dropped.push(`${p.label} = ${raw} (not one of its options)`); continue; }
      ok.push({ id: c.id, value: opt.v, why: c.why });
    } else {
      const n = parseFloat(String(c.value).replace(/[^\d.eE+-]/g, ''));
      if (!Number.isFinite(n)) { dropped.push(`${p.label} = ${c.value} (not a number)`); continue; }
      ok.push({ id: c.id, value: Math.min(p.max, Math.max(p.min, n)), why: c.why, clamped: n < p.min || n > p.max });
    }
  }
  return { ok, dropped };
}

// ---- the panel ------------------------------------------------------------------------------------
const EXAMPLES = ['vibrato lead', 'warm pad', 'What does Resonance do?', 'How do I make it brighter?'];
const EXAMPLES_NO_RECIPES = ['What is FM?', 'What does the filter do?', 'Turn the cutoff up', 'Does this sound use FM?']; // synths without sound recipes yet

export async function startAsk(host) {
  if (!askSupported()) return;
  let status = { ok: false, hasKey: false };
  try {
    const r = await fetch(API + '/status', { cache: 'no-store' });
    if (r.ok) status = await r.json();
  } catch { /* a plain static server: no Claude, the answer book only */ }
  if (!claudeSupported()) status = { ...status, ok: false, hasKey: false };
  const book = BOOKS[SYNTH.id] || { synthName: SYNTH.name, recipes: [], tweaks: [], aliases: {} };
  new AskPanel(host, status, new AskBook(book));
}

const sectionTitle = (id) => { const s = ALL_SECTIONS.find((x) => idsIn(x).includes(id)); return s ? s.title : ''; };
const ctlName = (id) => `${sectionTitle(id)} · ${PARAMS[id].label}`;

class AskPanel {
  constructor(host, status, book) {
    this.host = host; // { getPatch, setPatch, controlEl, play }
    this.hasKey = status.hasKey;
    this.server = status.ok; // the local Claude server is there
    this.book = book;
    this.mode = book && !status.hasKey ? 'book' : 'claude';
    this.history = []; // the conversation, for follow-ups ("more", "now add delay")
    this.busy = false;
    const { guide, ids } = buildGuide();
    this.guide = guide; this.ids = ids;

    // the toolbar button, next to Help
    this.btn = document.createElement('button');
    this.btn.className = 'btn btn-ask'; this.btn.id = 'btn-ask';
    this.btn.innerHTML = '<span class="ask-spark" aria-hidden="true">✦</span> Ask AI';
    this.btn.title = 'Ask for a sound, or ask about the synth (local only)';
    this.btn.setAttribute('aria-pressed', 'false');
    const helpBtn = document.getElementById('btn-help');
    helpBtn.parentNode.insertBefore(this.btn, helpBtn);
    this.btn.addEventListener('click', () => this.toggle());

    this.el = document.createElement('aside');
    this.el.className = 'ask-panel'; this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Ask');
    this.el.innerHTML = `
      <div class="ask-head"><span class="ask-title">Ask the ${esc(SYNTH.name)}</span><span class="ask-local"></span><button class="ask-switch" type="button" hidden></button><button class="ask-close" aria-label="Close">×</button></div>
      <div class="ask-key" hidden>
        <p>To use the Ask panel, paste an Anthropic API key. It is saved on this computer only (in <code>~/.synthlab-ai/key</code>), never in the SynthLab project or the browser, and every request is billed to that key.</p>
        <div class="ask-key-row"><input type="password" class="ask-key-input" placeholder="sk-ant-…" autocomplete="off" spellcheck="false"><button class="btn ask-key-save">Save key</button></div>
        <div class="ask-key-msg"></div>
      </div>
      <div class="ask-log" aria-live="polite"></div>
      <div class="ask-examples"></div>
      <form class="ask-form"><textarea class="ask-input" rows="2" placeholder="Ask for a sound (“vibrato lead”) or ask a question…"></textarea><button class="btn ask-send" type="submit">Ask AI</button></form>`;
    document.body.appendChild(this.el);
    this.log = this.el.querySelector('.ask-log');
    this.input = this.el.querySelector('.ask-input');
    this.el.querySelector('.ask-close').addEventListener('click', () => this.toggle(false));
    this.el.querySelector('.ask-form').addEventListener('submit', (e) => { e.preventDefault(); this.send(this.input.value); });
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing here must not play the computer keyboard's notes
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(this.input.value); }
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    const ex = this.el.querySelector('.ask-examples');
    for (const t of (this.book && this.book.book.recipes.length ? EXAMPLES : EXAMPLES_NO_RECIPES)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ask-chip'; b.textContent = t;
      b.addEventListener('click', () => this.send(t));
      ex.appendChild(b);
    }
    const keyInput = this.el.querySelector('.ask-key-input');
    keyInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.saveKey(keyInput.value); });
    keyInput.addEventListener('keyup', (e) => e.stopPropagation());
    this.el.querySelector('.ask-key-save').addEventListener('click', () => this.saveKey(keyInput.value));
    this.switchBtn = this.el.querySelector('.ask-switch');
    this.switchBtn.addEventListener('click', () => this.setMode(this.mode === 'book' ? 'claude' : 'book'));
    this.setMode(this.mode);
  }

  // the answer book (free, offline) or Claude (needs the local server and an API key)
  setMode(mode) {
    this.mode = mode;
    this.el.querySelector('.ask-local').textContent = mode === 'book' ? 'offline' : 'Claude · paid';
    this.el.querySelector('.ask-local').title = mode === 'book' ? 'Answers from a built-in book of sounds and the help text. Free, no internet.' : 'Answers from Claude through the local server. Each request is billed to the API key.';
    this.switchBtn.hidden = !(this.book && this.server);
    this.switchBtn.textContent = mode === 'book' ? 'Use Claude' : 'Use answer book';
    this.showKeyBox(mode === 'claude' && !this.hasKey);
  }

  toggle(on = this.el.hidden) {
    this.el.hidden = !on;
    this.btn.classList.toggle('on', on);
    this.btn.setAttribute('aria-pressed', String(on));
    if (on) (this.hasKey ? this.input : this.el.querySelector('.ask-key-input')).focus();
  }

  showKeyBox(show) {
    this.el.querySelector('.ask-key').hidden = !show;
    this.el.querySelector('.ask-form').hidden = show;
    this.el.querySelector('.ask-examples').hidden = show;
  }

  async saveKey(key) {
    const msg = this.el.querySelector('.ask-key-msg');
    msg.textContent = 'Saving…';
    try {
      const r = await fetch(API + '/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key.trim() }) });
      const j = await r.json();
      if (!r.ok) { msg.textContent = j.error || 'Could not save the key.'; return; }
      this.hasKey = j.hasKey;
      this.el.querySelector('.ask-key-input').value = '';
      msg.textContent = '';
      this.showKeyBox(!this.hasKey);
      if (this.hasKey) this.input.focus();
    } catch { msg.textContent = 'The local Ask server is not answering.'; }
  }

  addTurn(cls, html) {
    const d = document.createElement('div');
    d.className = 'ask-turn ' + cls;
    d.innerHTML = html;
    this.log.appendChild(d);
    this.log.scrollTop = this.log.scrollHeight;
    return d;
  }

  async send(text) {
    text = String(text || '').trim();
    if (!text || this.busy) return;
    this.busy = true;
    this.input.value = '';
    this.el.classList.add('busy');
    this.addTurn('you', esc(text));
    const wait = this.addTurn('ai pending', '<span class="ask-dots"><i></i><i></i><i></i></span>');
    const before = this.host.getPatch();
    if (this.mode === 'book') {
      const t0 = performance.now();
      let res;
      try { res = this.book.answer(text, before); } catch (e) { console.error(e); res = { kind: 'answer', base: 'current', reply: 'Sorry, something went wrong reading that.', changes: [], point_at: [] }; }
      wait.remove();
      this.apply(text, res, before, { ms: performance.now() - t0, book: true });
      this.busy = false;
      this.el.classList.remove('busy');
      return;
    }
    const patch = {};
    for (const id of this.ids) patch[id] = before[id];
    try {
      const r = await fetch(API + '/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guide: this.guide, ids: this.ids, patch, history: this.history, request: text }),
      });
      const j = await r.json();
      wait.remove();
      if (!r.ok || j.error) {
        this.addTurn('ai error', esc(j.error || 'Something went wrong.'));
        if (r.status === 401 || (r.status === 400 && /No API key/.test(j.error || ''))) { this.hasKey = false; this.showKeyBox(true); }
        return;
      }
      this.apply(text, j.result, before, j);
    } catch {
      wait.remove();
      this.addTurn('ai error', 'The local Ask server is not answering. Is <code>node tools/ai/server.mjs</code> running?');
    } finally {
      this.busy = false;
      this.el.classList.remove('busy');
    }
  }

  apply(text, res, before, meta) {
    const { ok, dropped } = checkChanges(res.changes);
    let next = null;
    if (ok.length || (res.kind === 'sound' && res.base === 'init')) {
      next = { ...(res.base === 'init' ? defaultPatch() : before) };
      for (const c of ok) next[c.id] = c.value;
      this.host.setPatch(next);
    }
    // what actually changed, old -> new, in the panel's own units
    const moved = next ? Object.keys(PARAMS).filter((id) => (movable(id) || PARAMS[id].type === 'jack') && next[id] !== before[id]) : [];
    const why = Object.fromEntries(ok.map((c) => [c.id, c.why]));
    const list = moved.map((id) => `<li title="${esc(why[id] || (res.base === 'init' ? 'back to its default (started from Init)' : ''))}"><span class="ask-ctl">${esc(ctlName(id))}</span> ${esc(formatValue(id, before[id]))} → <b>${esc(formatValue(id, next[id]))}</b></li>`).join('');
    const turn = this.addTurn('ai', `
      <p>${esc(res.reply)}</p>
      ${moved.length ? `<details class="ask-changes"${moved.length <= 6 ? ' open' : ''}><summary>${moved.length} control${moved.length === 1 ? '' : 's'} changed${res.base === 'init' ? ', starting from Init' : ''}</summary><ul>${list}</ul></details>` : ''}
      ${dropped.length ? `<p class="ask-dropped">Ignored: ${esc(dropped.join('; '))}</p>` : ''}
      <div class="ask-actions">${moved.length ? '<button class="ask-act ask-play">▶ Hear it</button><button class="ask-act ask-undo">Undo</button>' : ''}<span class="ask-cost">${meta.book ? 'answer book' : (meta.ms / 1000).toFixed(1) + ' s · Claude'}</span></div>`);
    if (moved.length) {
      turn.querySelector('.ask-undo').addEventListener('click', (e) => {
        this.host.setPatch(before);
        e.target.disabled = true; e.target.textContent = 'Undone';
        this.history.push({ role: 'user', text: '(I pressed Undo: the settings went back to how they were before your last change.)' }, { role: 'assistant', text: 'Understood.' });
      });
      turn.querySelector('.ask-play').addEventListener('click', () => this.host.play && this.host.play());
    }
    this.glow([...new Set([...moved, ...(res.point_at || [])])]);
    // the conversation so far, for follow-ups; the assistant's turn says what it set
    this.history.push({ role: 'user', text }, { role: 'assistant', text: res.reply + (ok.length ? ` [Set: ${ok.map((c) => `${c.id}=${c.value}`).join(', ')}${res.base === 'init' ? ', from init' : ''}]` : '') });
    this.history = this.history.slice(-8);
  }

  // highlight the controls the answer is about, for a few seconds
  glow(ids) {
    clearTimeout(this.glowTimer);
    document.querySelectorAll('.ask-glow').forEach((el) => el.classList.remove('ask-glow'));
    for (const id of ids) { const el = this.host.controlEl(id); if (el) el.classList.add('ask-glow'); }
    this.glowTimer = setTimeout(() => document.querySelectorAll('.ask-glow').forEach((el) => el.classList.remove('ask-glow')), 5000);
  }
}
