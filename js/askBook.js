// The answer book: the Ask panel's free, offline answerer. No AI model and no internet; it costs
// nothing to use.
//
// It reads a request and does one of three things:
//   - a sound ("vibrato lead", "warm pad"): starts from Init, applies a recipe from the synth's book,
//     then any tweaks named alongside it ("vibrato", "warm");
//   - a tweak ("brighter", "more vibrato", "how do I make it brighter?"): nudges the current sound;
//   - a question ("what does Resonance do?", "what is a sawtooth?"): answers from help.js, the same
//     text as the hover help, and highlights the control.
//
// The engine knows nothing about any one synth. Recipes, tweaks and extra names for controls come
// from the synth's book (js/askbooks/<synth>.js); questions are answered from PARAMS and help.js,
// so they work on any synth. The answer has the same shape as the Claude answer in js/ai.js
// ({ kind, base, reply, changes, point_at }), so both go through the same checks and Undo.

import { PARAMS, ALL_SECTIONS, defaultPatch, toNorm, fromNorm, formatValue } from './params.js';
import { lookup } from './helpPanel.js';
import { helpKeyFor } from './help.js';

const plain = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const norm = (s) => ' ' + String(s).toLowerCase().replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9+#.\- ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// does the (normalised) text contain this phrase as whole words? (a plural "s" is allowed)
function findPhrase(t, phrase) {
  const m = new RegExp(' ' + reEsc(phrase.toLowerCase()) + '(?:s|es)? ').exec(t);
  return m ? m.index : -1;
}
const round = (v) => (typeof v === 'number' ? Number(v.toPrecision(3)) : v);
const hasAny = (t, list) => list.some((p) => findPhrase(t, p) >= 0);
const firstHit = (t, list) => { // the longest phrase from the list found in the text
  let best = null;
  for (const p of list) { const i = findPhrase(t, p); if (i >= 0 && (!best || p.length > best.p.length)) best = { p, i }; }
  return best;
};

const LESS = ['less', 'fewer', 'reduce', 'lower the', 'decrease', 'weaker', 'subtler', 'smaller', 'turn down', 'tone down', 'not so', 'not as', 'too much'];
const OFF = ['no', 'without', 'remove', 'get rid of', 'turn off', 'switch off', 'stop', 'kill', 'lose the', 'take away', 'take off'];
const MUCH = ['much', 'lot', 'lots', 'way', 'really', 'very', 'loads', 'heaps', 'tons', 'massively', 'extremely'];
const LITTLE = ['bit', 'little', 'slightly', 'touch', 'tad', 'tiny', 'subtle', 'hint'];
const REFERENT = ['it', 'this', 'that', 'the sound', 'my sound', 'more', 'less', 'add', 'make it', 'turn', 'bit', 'lot', 'slightly'];
const QUESTION = /^ (what|whats|how|why|which|where|when|who|can|could|does|do|is|are|should|explain|tell me|describe|define|meaning) /;
const VAGUE = ['lower', 'higher', 'faster', 'slower', 'deeper', 'bigger', 'big', 'more open'];
const MAKE = ['make', 'give', 'create', 'design', 'build', 'want', 'need', 'id like', 'patch', 'sound', 'program', 'set up', 'get'];

// ---- operations on a patch ----------------------------------------------------------------------
// An op is an array:
//   ['set', id, value]            set it
//   ['mul', id, factor, start, zeroBelow]  multiply; if it's at its minimum, jump to `start` instead;
//                                  if it falls below `zeroBelow`, drop to the minimum
//   ['add', id, delta]            add (a switch: move that many options along)
//   ['range', id, lo, hi, value]  if it's outside lo..hi, set it to value
//   ['atLeast', id, v] / ['atMost', id, v]
// `k` scales the strength: 2 for "much brighter", 0.5 for "a bit brighter".
function applyOp(p, op, k = 1) {
  const [kind, id] = op;
  const s = PARAMS[id];
  if (!s) return;
  const cur = p[id];
  const clamp = (v) => Math.min(s.max, Math.max(s.min, v));
  if (s.type === 'step') {
    const i = s.options.findIndex((o) => o.v === cur);
    if (kind === 'set') p[id] = op[2];
    else if (kind === 'add') p[id] = s.options[Math.min(s.options.length - 1, Math.max(0, i + op[2]))].v; // (a switch moves one option, however strongly asked)
    return;
  }
  if (kind === 'set') p[id] = clamp(op[2]);
  else if (kind === 'mul') {
    const [, , f, start, zeroBelow] = op;
    const atMin = cur <= s.min + (s.max - s.min) * 0.002;
    if (atMin && start != null) p[id] = clamp(start * (k > 1 ? 1.5 : k < 1 ? 0.6 : 1));
    else { const v = cur * Math.pow(f, k); p[id] = zeroBelow != null && v < zeroBelow ? s.min : clamp(v); }
  } else if (kind === 'add') p[id] = clamp(cur + op[2] * k);
  else if (kind === 'range') { if (cur < op[2] || cur > op[3]) p[id] = clamp(op[4]); }
  else if (kind === 'atLeast') { if (cur < op[2]) p[id] = clamp(op[2]); }
  else if (kind === 'atMost') { if (cur > op[2]) p[id] = clamp(op[2]); }
}
const applyOps = (p, ops, k) => { for (const op of ops || []) applyOp(p, op, k); };
function offOps(tw) { // "no vibrato": every op of the tweak's "up" set back to its minimum
  return tw.off || (tw.up || []).filter((op) => op[0] === 'mul' || op[0] === 'add').map((op) => ['set', op[1], PARAMS[op[1]] && PARAMS[op[1]].type === 'cont' ? (op[1] === 'filt.cutoff' ? PARAMS[op[1]].max : PARAMS[op[1]].min) : PARAMS[op[1]] && PARAMS[op[1]].def]);
}

// ---- controls and options by name, for questions ------------------------------------------------
function idsIn(sec) {
  const rows = [...(sec.rows || []), ...(sec.parts || []).flatMap((p) => p.rows || []), sec.head || [], sec.titleSwitch || [], sec.fader ? [sec.fader] : []];
  return rows.flat(2).filter(Boolean);
}
const sectionOf = (id) => ALL_SECTIONS.find((s) => idsIn(s).includes(id));
const cleanLabel = (l) => String(l).replace(/[→←↑↓]/g, '').trim().toLowerCase();

function buildIndex(book) {
  const entries = []; // { names: [phrases], key: help key, ids: [controls to highlight], context: [words that favour it] }
  for (const sec of ALL_SECTIONS) {
    const ids = idsIn(sec).filter((id) => PARAMS[id]);
    if (!ids.length) continue;
    const title = (sec.title || sec.id).toLowerCase();
    entries.push({ names: [title], key: 'section:' + sec.id, ids, context: [] });
    for (const id of ids) {
      const p = PARAMS[id];
      const ctx = title.split(/\s+/).filter((w) => w.length > 2);
      entries.push({ names: [cleanLabel(p.label)], key: id, ids: [id], context: ctx });
      if (p.type === 'step') for (const o of p.options) {
        const key = helpKeyFor(`${id}=${o.v}`);
        if (key !== id && lookup(key)) entries.push({ names: [String(o.label).toLowerCase(), String(o.v).toLowerCase()].filter((n) => n.length > 2), key, ids: [id], context: ctx, option: true });
      }
    }
  }
  for (const [phrase, target] of Object.entries(book.aliases || {})) {
    const ids = [].concat(target.ids || target.key || target);
    const key = target.key || ids[0];
    if (lookup(key) || PARAMS[key]) entries.push({ names: [phrase], key, ids: ids.filter((i) => PARAMS[i]), context: [], alias: true, note: target.note });
  }
  // an alias for a section or an option ("lfo", "sawtooth") highlights what that entry highlights
  for (const e of entries) if (e.alias && !e.ids.length) { const same = entries.find((x) => !x.alias && x.key === e.key && x.ids.length); if (same) e.ids = same.ids; }
  return entries;
}

// the entries a question is about, best first
function findTopics(t, index, prefer = []) {
  const scored = [];
  for (const e of index) {
    const hit = firstHit(t, e.names);
    if (!hit) continue;
    let score = 2 + hit.p.length / 20 + (e.alias ? 0.6 : 0) + (e.key.startsWith('section:') ? 0.3 : 0);
    for (const c of e.context) if (findPhrase(t, c) >= 0 && c !== hit.p) score += 1;
    if (prefer.includes(e.key)) score += 0.5; // the book's choice when a name is shared ("Attack": loudness, not filter)
    scored.push({ e, score, at: hit.i, len: hit.p.length, p: hit.p });
  }
  scored.sort((a, b) => b.score - a.score);
  // drop entries whose matched words sit inside a better match ("filter envelope" beats "filter")
  const out = [];
  for (const s of scored) {
    if (out.some((o) => s.at >= o.at && s.at + s.len <= o.at + o.len && o.e.key !== s.e.key && o.len > s.len)) continue;
    if (out.some((o) => o.e.key === s.e.key)) continue;
    out.push(s);
  }
  return out;
}

function helpText(key) {
  const h = lookup(key);
  if (!h) return PARAMS[key] && PARAMS[key].help ? plain(PARAMS[key].help) : '';
  const body = (h.body || []).slice(0, 2).map(plain).join(' ');
  return body + (h.tip ? ' Try this: ' + plain(h.tip) : '');
}
function helpTitle(key) {
  const h = lookup(key);
  if (h && h.title) return plain(h.title);
  if (PARAMS[key]) { const s = sectionOf(key); return (s ? s.title + ' ' : '') + PARAMS[key].label; }
  return key;
}

// ---- the answerer ---------------------------------------------------------------------------------
export class AskBook {
  constructor(book) {
    this.book = book;
    this.index = buildIndex(book);
    this.last = null; // the last tweak, so "more" or "again" can repeat it
  }

  answer(text, current) {
    const t = norm(text);
    const book = this.book;
    const question = QUESTION.test(t) || /\?\s*$/.test(text);
    const k = hasAny(t, MUCH) ? 2 : hasAny(t, LITTLE) ? 0.5 : 1;

    // greetings, "what can you do", "help"
    if (/^ (hi|hello|hey|help|yo|hiya)( there)? $/.test(t) || hasAny(t, ['what can you do', 'what can i ask', 'what do you know', 'how does this work', 'how do you work']))
      return this.reply(this.intro());
    if (hasAny(t, ['what sounds', 'which sounds', 'list of sounds', 'list sounds', 'sounds can you', 'recipes', 'what presets']))
      return this.reply(`I know these sounds: ${book.recipes.map((r) => r.name.toLowerCase()).join(', ')}. Add a word or two to change them, for example "dark bass" or "pad with vibrato".`);
    if (hasAny(t, ['surprise me', 'random sound', 'anything', 'something cool', 'something random'])) {
      const r = book.recipes[Math.floor(Math.random() * book.recipes.length)];
      return this.sound(r, [], t);
    }
    if (hasAny(t, ['start again', 'start over', 'reset', 'from scratch', 'init', 'blank', 'clear it', 'default sound']) && !question)
      return { kind: 'sound', base: 'init', reply: 'Back to the init patch: every control at its starting position. A plain sawtooth with the filter wide open, a good place to build a new sound from.', changes: [], point_at: [] };

    // "more" / "again" / "less" on their own repeat (or reverse) the last tweak
    if (this.last && /^ (more|again|even more|more more|keep going|further|do that again|another bit|bit more|a bit more|lots more|a lot more|much more) $/.test(t))
      return this.tweak([{ tw: this.last.tw, dir: this.last.dir }], current, k, false);
    if (this.last && /^ (less|bit less|a bit less|too much|go back a bit|less please|a little less) $/.test(t))
      return this.tweak([{ tw: this.last.tw, dir: this.last.dir === 'up' ? 'down' : 'up' }], current, k, false);

    let recipe = this.findRecipe(t);
    if (recipe) {
      const at = findPhrase(t, recipe.hit);
      if (this.findTweaks(t).some((f) => f.len > recipe.hit.length && at >= f.at && at + recipe.hit.length <= f.at + f.len)) recipe = null;
    }
    let tweaks = this.findTweaks(recipe ? this.without(t, recipe.hit) : t);
    const topicsEarly = findTopics(t, this.index, book.prefer);
    const param = topicsEarly.length && PARAMS[topicsEarly[0].e.key] && topicsEarly[0].e.ids.length === 1 ? topicsEarly[0].e.key : null;
    // "lower the resonance", "turn the cutoff up": a named control beats the vaguer tweaks
    // ("lower" alone means an octave down, "faster" alone means the LFO)
    if (param && !recipe) {
      const d0 = this.direction(t);
      if (d0 === 'max' || d0 === 'min') return this.nudge(param, d0, current, k); // "max resonance"
      tweaks = tweaks.filter((f) => !VAGUE.includes(t.substr(f.at + 1, f.len)) || [...(f.tw.up || []), ...(f.tw.down || [])].some((op) => op[1] === param));
      const dir = this.direction(t);
      if (!tweaks.length && dir) return this.nudge(param, dir, current, k);
    }
    const asksMeaning = /^ (what|whats|why|explain|describe|define|tell me|meaning|which) /.test(t) && !hasAny(t, MAKE.concat(['more', 'less', 'brighter', 'darker']));
    const topics = topicsEarly;

    // "what does Resonance do?", "what is a sawtooth?"
    if (asksMeaning && (topics.length || !recipe)) {
      if (topics.length) return this.explain(topics, t);
    }
    // a recipe word that is also a tweak word ("wobble", "pluck") used about the current sound
    // ("make it wobble") is a tweak, not a new sound
    const recipeIsTweak = recipe && recipe.hit && this.findTweaks(norm(recipe.hit)).length && hasAny(t, REFERENT) && !hasAny(t, recipe.r.nouns || []);
    if (recipe && !recipeIsTweak) return this.sound(recipe.r, tweaks, t);
    if (tweaks.length) return this.tweak(tweaks, current, k, question);
    if (recipeIsTweak) return this.tweak(this.findTweaks(norm(recipe.hit)), current, k, question);
    if (topics.length) return this.explain(topics, t);
    return this.reply(`I don't have that in my answer book yet. I can make sounds (${book.recipes.slice(0, 8).map((r) => r.name.toLowerCase()).join(', ')}, and more: ask "what sounds do you know?"), change the current sound ("brighter", "more vibrato", "slower attack"), or explain any control ("what does Cutoff do?").`);
  }

  // which way a control was asked to move, or null
  direction(t) {
    if (hasAny(t, ['max', 'maximum', 'all the way up', 'full', 'fully'])) return 'max';
    if (hasAny(t, ['min', 'minimum', 'zero', 'all the way down', 'turn off', 'switch off'])) return 'min';
    if (hasAny(t, ['turn down', 'down', 'lower', 'less', 'decrease', 'reduce', 'smaller', 'shorter', 'slower', 'quieter'])) return 'down';
    if (hasAny(t, ['turn up', 'up', 'raise', 'higher', 'more', 'increase', 'boost', 'bigger', 'longer', 'faster', 'louder'])) return 'up';
    return null;
  }

  // move one named control: a fifth of its travel (more for "much", less for "a bit")
  nudge(id, dir, current, k) {
    const p = PARAMS[id];
    const n = toNorm(id, current[id]);
    const target = dir === 'max' ? 1 : dir === 'min' ? 0 : Math.min(1, Math.max(0, n + (dir === 'up' ? 1 : -1) * 0.2 * k));
    let v = fromNorm(id, target);
    if (p.type === 'step') {
      const i = p.options.findIndex((o) => o.v === current[id]);
      const j = dir === 'max' ? p.options.length - 1 : dir === 'min' ? 0 : Math.min(p.options.length - 1, Math.max(0, i + (dir === 'up' ? 1 : -1)));
      v = p.options[j].v;
    } else if (typeof v === 'number') v = Number(v.toPrecision(3));
    const sec = sectionOf(id);
    const name = (sec ? 'the ' + sec.title + '\'s ' : '') + cleanLabel(p.label).replace(/^./, (c) => c.toUpperCase());
    const help = helpText(id).split(/(?<=\.)\s/)[0];
    this.last = null;
    if (v === current[id]) return this.reply(`${name} is already at ${formatValue(id, v)}, as far as it goes that way. ${help}`, [id]);
    return { kind: 'sound', base: 'current', reply: `I turned ${name} ${dir === 'up' || dir === 'max' ? 'up' : 'down'}, from ${formatValue(id, current[id])} to ${formatValue(id, v)}. ${help}`, changes: [{ id, value: String(v), why: '' }], point_at: [id] };
  }

  intro() {
    return `I'm the ${this.book.synthName || 'synth'}'s answer book, and I work offline. Ask me for a sound ("vibrato lead", "warm pad"), to change the current sound ("brighter", "more vibrato", "longer release"), or about any control ("what does Resonance do?"). Every change I make can be undone.`;
  }

  reply(text, point_at = []) { return { kind: 'answer', base: 'current', reply: text, changes: [], point_at }; }

  without(t, phrase) { const i = findPhrase(t, phrase); return i < 0 ? t : t.slice(0, i) + ' ' + t.slice(i + phrase.length + 1).replace(/^(s|es) /, ' '); }

  findRecipe(t) {
    let best = null;
    for (const r of this.book.recipes) {
      const hit = firstHit(t, r.words);
      if (hit && (!best || hit.p.length > best.hit.length)) best = { r, hit: hit.p };
    }
    return best;
  }

  findTweaks(t) {
    const found = [];
    for (const tw of this.book.tweaks) {
      let dir = null, hit = null;
      const up = tw.upWords && firstHit(t, tw.upWords), down = tw.downWords && firstHit(t, tw.downWords), subj = tw.words && firstHit(t, tw.words);
      if (down && (!up || down.p.length >= up.p.length)) { dir = 'down'; hit = down; }
      else if (up) { dir = 'up'; hit = up; }
      else if (subj) { dir = 'up'; hit = subj; }
      if (!dir) continue;
      // "less bright", "no vibrato", "without reverb": look just before the matched words
      const before = t.slice(Math.max(0, hit.i - 24), hit.i + 1);
      if (hasAny(before + ' ', OFF)) dir = 'off';
      else if (hasAny(before + ' ', LESS)) dir = dir === 'up' ? 'down' : 'up';
      found.push({ tw, dir, at: hit.i, len: hit.p.length });
    }
    // two tweaks matched on the same words: keep the longer match ("faster attack" over "faster")
    return found.filter((f) => !found.some((g) => g !== f && g.len > f.len && f.at >= g.at && f.at + f.len <= g.at + g.len)).sort((a, b) => a.at - b.at);
  }

  sound(r, tweaks, t) {
    const p = { ...defaultPatch(), ...r.set };
    const notes = [];
    const k = hasAny(t, MUCH) ? 2 : hasAny(t, LITTLE) ? 0.5 : 1; // "bass with lots of reverb"
    if (!r.set) return this.reply('That recipe is empty.');
    for (const { tw, dir } of tweaks) {
      if (tw.noSound) continue;
      applyOps(p, dir === 'off' ? offOps(tw) : dir === 'down' ? tw.down : tw.up, k);
      const say = dir === 'down' ? tw.sayDown : dir === 'off' ? tw.sayOff : tw.sayUp;
      if (say) notes.push(say);
    }
    const base = defaultPatch();
    const changes = Object.keys(p).filter((id) => p[id] !== base[id] && PARAMS[id]).map((id) => ({ id, value: String(round(p[id])), why: r.why && r.why[id] || '' }));
    this.last = null;
    return {
      kind: 'sound', base: 'init',
      reply: [r.teach, ...notes].join(' '),
      changes, point_at: r.key || [],
    };
  }

  tweak(list, current, k, question) {
    const p = { ...current };
    const said = [], pointAt = [];
    for (const { tw, dir } of list) {
      const before = { ...p };
      applyOps(p, dir === 'off' ? offOps(tw) : dir === 'down' ? tw.down : tw.up, k);
      const moved = Object.keys(p).some((id) => p[id] !== before[id]);
      const ids = [...new Set([...(tw.up || []), ...(tw.down || [])].map((op) => op[1]))].filter((id) => PARAMS[id]);
      pointAt.push(...ids);
      if (question) said.push(dir === 'down' ? tw.howDown || tw.sayDown : dir === 'off' ? tw.sayOff || tw.howDown : tw.howUp || tw.sayUp);
      else if (!moved) said.push(dir === 'up' ? tw.limit || `That's already as far as it goes on this synth.` : tw.limitDown || `There's nothing to take away: that's already at its minimum.`);
      else said.push(dir === 'down' ? tw.sayDown : dir === 'off' ? tw.sayOff || tw.sayDown : tw.sayUp);
      this.last = { tw, dir: dir === 'off' ? 'down' : dir };
    }
    const changes = Object.keys(p).filter((id) => p[id] !== current[id] && PARAMS[id]).map((id) => ({ id, value: String(round(p[id])), why: '' }));
    let reply = said.filter(Boolean).join(' ');
    if (question && changes.length) reply += ' I\'ve done it for you so you can hear it; press Undo to go back.';
    return { kind: changes.length ? 'sound' : 'answer', base: 'current', reply, changes, point_at: [...new Set(pointAt)] };
  }

  explain(topics, t = '') {
    let top;
    if (/ (difference|differ|vs|versus|compare|and) /.test(t)) { // "attack and decay": two different controls
      top = [];
      for (const s of topics) if (top.length < 2 && !top.some((x) => x.p === s.p)) top.push(s);
    } else top = topics.slice(0, topics.length > 1 && topics[1].score >= topics[0].score - 0.01 ? 2 : 1);
    const parts = top.map(({ e }) => {
      const body = helpText(e.key);
      return (top.length > 1 ? helpTitle(e.key) + ': ' : '') + (e.note ? e.note + ' ' : '') + body;
    });
    this.last = null;
    return this.reply(parts.join(' '), [...new Set(top.flatMap(({ e }) => e.ids))]);
  }
}
