// Lesson mode: the lesson bar, playing targets, checking answers, hints, progress and celebrations.
// Challenge types (see lessons.js): match (hear a target and match it), goal (do something,
// the result is checked) and question (try something, then choose the right answer). Also explain
// (the NF-ModRack's lessons): an explanation with an example patch to play and a "Try this"; it asks
// nothing, so Next is there at once.

import { LESSONS as NF1_LESSONS, patchMatches, soundMatches, closeness, patchCloseness, osc1Hz } from './lessons.js';
import { MOD_LESSONS } from './lessonsModular.js';
import { NF3_LESSONS } from './lessonsNiniFoog.js';
import { RACK_LESSONS } from './lessonsRack.js';
import { MODRACK_LESSONS } from './lessonsModRack.js';
import { defaultPatch, ALL_SECTIONS, SYNTH } from './params.js';
import { EXT } from './lab.js';

// each synth with lessons has its own set (a lab in its own folder, like StudioLab, brings its own)
const LESSONS = (EXT.lessons && EXT.lessons[SYNTH.id]) || { nfm: MOD_LESSONS, nf3: NF3_LESSONS, nfmod: RACK_LESSONS, modrack: MODRACK_LESSONS }[SYNTH.id] || NF1_LESSONS;
// The processors (the NF-C1) have no keyboard: a loop plays through them all the time. Their
// targets are settings heard on the loop, answers are checked as the controls move (and, for
// goals about what the meters show, several times a second), and a lesson can open single
// controls (challenge.controls) rather than whole sections.
const PROC = !!SYNTH.kind;
const PROC_LISTEN_MS = 4000; // how long a processor's target plays
const INDEX_KEY = SYNTH.id === 'nf1' ? 'sl.lessonIndex' : `sl.lessonIndex.${SYNTH.id}`;
import { Fireworks, Smiley, finale } from './fireworks.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LISTEN_MS = 1600; // how long the target plays
// The Hint button appears when a student seems stuck:
const HINT_AFTER_MS = 40000;  // ...after this long on one challenge,
const HINT_AFTER_NOTES = 10;  // ...or this many notes played without success,
const HINT_AFTER_LISTENS = 3; // ...or this many replays of the target (a wrong answer also counts)
const $ = (id) => document.getElementById(id);

function load(key, d) { try { const v = localStorage.getItem(key); return v == null ? d : JSON.parse(v); } catch { return d; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }

export class LessonController {
  // deps: { getPatch, setPatch, engine, scope, keyboard, lockSection, ensureAudio, onModeChange, showScopes }
  constructor(deps) {
    this.d = deps;
    this.lessonIndex = Math.min(LESSONS.length - 1, Math.max(0, load(INDEX_KEY, 0)));
    this.index = -1;          // current challenge (-1 = intro screen)
    this.busy = false;        // target is playing: student input is ignored
    this.solved = false;
    this.lastNote = null;
    this.held = 0;            // keys currently held
    const n = Number(load('nf1.lessonNote', 0));
    this.note = n > 0 ? n : null; // the lessons' key, reused and marked between challenges
    this.progress = load('nf1.progress', {});
    this.mode = null; // set by setMode() at start-up

    // celebrations drawn on the two screens: a smiley per success, fireworks per lesson
    this.smileys = [new Smiley(), new Smiley()];
    this.fireworks = [new Fireworks(), new Fireworks()];
    deps.scope.fx = { a: [this.smileys[0], this.fireworks[0]], b: [this.smileys[1], this.fireworks[1]] };
    deps.scope.showTarget = true;

    $('lb-hear').addEventListener('click', () => { this.listens++; this.audition(); });
    $('lb-reset').addEventListener('click', () => this.resetControls());
    $('lb-start').addEventListener('click', () => this.begin());
    $('lb-hint').addEventListener('click', () => this.showHint());
    $('lb-ghost').addEventListener('change', (e) => { deps.scope.showTarget = e.target.checked; });
    $('lm-replay').addEventListener('click', () => { this.closeModal(); this.restartLesson(); });
    $('lm-free').addEventListener('click', () => { this.closeModal(); this.setMode('free'); });
    $('lm-next').addEventListener('click', () => {
      if (!LESSONS[this.lessonIndex + 1]) return;
      this.closeModal(); this.chooseLesson(this.lessonIndex + 1);
    });

    // lesson picker
    const pick = $('lb-lesson');
    LESSONS.forEach((l, i) => pick.appendChild(new Option(`Lesson ${l.number}: ${l.title}`, String(i))));
    pick.value = String(this.lessonIndex);
    pick.addEventListener('change', () => { this.chooseLesson(Number(pick.value)); pick.blur(); });

    // the Hint button appears when the student seems stuck
    setInterval(() => this.maybeOfferHint(), 1000);
    // the processors' goals depend on what the meters show, which changes as the loop plays
    if (PROC) setInterval(() => { if (this.mode === 'lessons' && this.index >= 0 && this.type !== 'match') this.check(); }, 250);
  }

  get lesson() { return LESSONS[this.lessonIndex]; }
  get done() { return this.progress[this.lesson.id] || []; }
  get challenge() { return this.lesson.challenges[this.index]; }
  get type() { return (this.challenge && this.challenge.type) || 'match'; }

  // ---- modes ------------------------------------------------------------------------------
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    document.body.classList.toggle('lesson-mode', mode === 'lessons');
    $('lesson-bar').hidden = mode !== 'lessons';
    if (mode === 'lessons') {
      this.freePatch = this.d.getPatch();
      this.showIntro();
    } else {
      this.busy = false;
      this.index = -1;
      this.runId = (this.runId || 0) + 1; // abandon a target that is still playing
      document.body.classList.remove('auditioning');
      this.d.scope.clearTarget();
      this.d.keyboard.markTarget(null);
      ALL_SECTIONS.forEach((s) => this.d.lockSection(s.id, false));
      if (this.d.lockControls) this.d.lockControls(null);
      if (this.freePatch) this.d.setPatch(this.freePatch);
    }
    if (this.d.onModeChange) this.d.onModeChange(mode);
  }

  chooseLesson(i) {
    this.lessonIndex = i;
    save(INDEX_KEY, i);
    $('lb-lesson').value = String(i);
    this.showIntro();
  }

  // ---- intro / navigation ---------------------------------------------------------------------
  // keep: at the end of a lesson, leave the student's last sound (and the controls) alone
  // so they can carry on playing it under the fireworks
  showIntro(keep = false) {
    this.index = -1;
    this.chScopes = undefined;
    this.runId = (this.runId || 0) + 1;
    this.busy = false;
    document.body.classList.remove('auditioning');
    this.d.keyboard.markTarget(null);
    this.d.scope.clearTarget();
    // the intro shows the lesson's starting point (NF-1: Init, with only Oscillator 1 open)
    if (!keep) {
      this.lockFor(this.lesson.introUnlocked || ['osc1']);
      this.d.setPatch(this.withLoop(this.lesson.base || {}));
    }
    // Scopes: the NF-1's lessons (no 'scopes' setting) show them in full, since matching by ear
    // leans on them. The NF-MiniModular's lessons choose: false = off, true = on, under the panel.
    const sc = this.lesson.scopes;
    if (!keep && this.d.showScopes && this.mode === 'lessons') this.d.showScopes(sc !== false, sc === undefined);
    const started = this.done.some(Boolean);
    const total = this.lesson.challenges.length;
    const complete = this.done.filter(Boolean).length === total;
    const allMatch = this.lesson.challenges.every((c) => !c.type || c.type === 'match');
    $('lb-eyebrow').textContent = `Lesson ${this.lesson.number}`;
    $('lb-title').textContent = this.lesson.title;
    $('lb-task-title').textContent = complete ? 'Lesson complete' : started ? 'Welcome back' : 'Ready?';
    $('lb-task-text').textContent = complete
      ? 'You have completed every challenge in this lesson. Replay any of them by clicking its number, or start again.'
      : `${this.lesson.summary} ${allMatch ? `Listen to each target sound, then use the synth to match it. There are ${total} sounds to match.` : `There are ${total} challenges.`}`;
    $('lb-start').textContent = complete ? 'Start again' : started ? 'Continue' : `Start lesson ${this.lesson.number}`;
    $('lb-start').hidden = false;
    this.setStatus('', '');
    this.showPlayControls(false);
    this.clearQuestion();
    this.hideHint();
    this.renderSteps();
  }

  begin() {
    const complete = this.done.filter(Boolean).length === this.lesson.challenges.length;
    if (complete) { this.restartLesson(); return; }
    const first = this.lesson.challenges.findIndex((_, i) => !this.done[i]);
    this.enter(Math.max(0, first));
  }

  restartLesson() {
    this.progress[this.lesson.id] = [];
    save('nf1.progress', this.progress);
    this.enter(0);
  }

  // ---- a challenge ---------------------------------------------------------------------------
  // carry: arrived with Next from the previous challenge. Lessons marked 'carry' (the
  // NF-MiniModular's patching lessons) then keep the student's own patch, so it builds up step
  // by step; otherwise (and with Reset) the challenge's starting patch is loaded.
  enter(i, carry = false) {
    this.index = i;
    this.solved = false;
    this.lastNote = null;
    this.enteredAt = performance.now();
    this.notesPlayed = 0;
    this.listens = 0;
    this.wrongAnswers = 0;
    this.revealed = false;
    this.lowNote = Infinity; this.highNote = -Infinity; // range of notes played in this challenge
    const ch = this.challenge;
    this.target = this.makeTarget(ch);
    this.lockFor(ch.unlocked, ch.controls);
    // a challenge can turn the screens off for itself (the NF-C1's matches: by ear, not by eye;
    // the Scopes button still opens them). The next challenge goes back to the lesson's setting.
    if (this.d.showScopes && (ch.scopes !== undefined || this.chScopes !== undefined)) {
      const sc = ch.scopes !== undefined ? ch.scopes : this.lesson.scopes;
      this.d.showScopes(sc !== false, sc === undefined);
    }
    this.chScopes = ch.scopes;
    this.d.keyboard.markTarget(ch.showKey ? this.target.note : null);
    if (PROC) this.d.ensureAudio();
    if (!(carry && this.lesson.carry)) this.d.setPatch(this.withLoop(this.startOverrides));
    else if (this.challenge.set) this.d.setPatch({ ...this.d.getPatch(), ...this.challenge.set });
    this.d.scope.clearTarget();

    $('lb-start').hidden = true;
    this.showPlayControls(true);
    $('lb-next').hidden = true;
    $('lb-task-title').textContent = `${i + 1}. ${ch.title}`;
    if (this.type === 'explain') this.showExplanation(ch);
    else $('lb-task-text').textContent = ch.text;
    this.clearQuestion();
    this.hideHint();
    if (this.type === 'explain') { this.explained(); return; }
    if (this.type === 'question' && !ch.revealWhen) this.revealQuestion();
    this.renderSteps();
    if (this.type === 'match') this.audition();
    else this.setStatus('Your turn', 'turn');
  }

  // an explanation: its paragraphs, and what to try on the example patch now on the rack
  showExplanation(ch) {
    const box = $('lb-task-text');
    box.innerHTML = '';
    String(ch.text).split('\n\n').forEach((t) => { const p = document.createElement('p'); p.className = 'lb-para'; p.textContent = t; box.appendChild(p); });
    if (ch.try) {
      const t = document.createElement('div');
      t.className = 'lb-try';
      t.innerHTML = '<b>Try this</b>';
      t.appendChild(document.createTextNode(ch.try));
      box.appendChild(t);
    }
  }
  // nothing to pass: counted as done, and Next (or, at the end, Finish) is there at once
  explained() {
    this.solved = true;
    const done = this.done.slice();
    done[this.index] = true;
    this.progress[this.lesson.id] = done;
    save('nf1.progress', this.progress);
    this.renderSteps();
    this.setStatus('Play the example', 'turn');
    const total = this.lesson.challenges.length;
    const last = this.index === total - 1;
    $('lb-next').hidden = false;
    $('lb-next').textContent = last ? 'Finish lesson ▸' : 'Next ▸';
    $('lb-next').onclick = () => (last ? this.lessonComplete() : this.enter(this.index + 1));
  }

  makeTarget(ch) {
    const ctx = {
      note: this.note,
      pick: (list) => list[Math.floor(Math.random() * list.length)],
      pickDistinct: (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n),
      level: (lo, hi) => Math.round((lo + Math.random() * (hi - lo)) * 20) / 20, // in steps of 5%
      newNote: () => {
        // a random key in the lowest octave shown on the keyboard (12 notes from its C)
        const lo = this.d.keyboard.low;
        let n;
        do { n = lo + Math.floor(Math.random() * 12); } while (n === this.note);
        this.note = n;
        ctx.note = n;
        return n;
      },
    };
    // the lessons' key must be on the visible keyboard (the octave may have changed)
    const kb = this.d.keyboard;
    if (ctx.note == null || ctx.note < kb.low || ctx.note > kb.high) ctx.newNote();
    let t;
    if (this.type === 'match') {
      this.startOverrides = ch.start || {};
      this.startPatch = { ...defaultPatch(), ...this.startOverrides };
      for (let tries = 0; tries < 30; tries++) {
        t = ch.make(ctx);
        t.patch = { ...this.startPatch, ...t.patch };
        // make sure there is something to change (Lesson 1's first challenge only asks for the note)
        if ((this.lessonIndex === 0 && this.index === 0) || !patchMatches(this.startPatch, t.patch, ch.compare)) break;
      }
    } else {
      t = ch.make(ctx); // { start, note }
      this.startOverrides = t.start || {};
      this.startPatch = { ...defaultPatch(), ...this.startOverrides };
    }
    this.note = t.note;
    save('nf1.lessonNote', t.note);
    return t;
  }

  lockFor(unlocked, controls = null) {
    // ('all': nothing locked, as in the NF-ModRack's lessons, whose racks change from step to step)
    ALL_SECTIONS.forEach((s) => this.d.lockSection(s.id, unlocked !== 'all' && !unlocked.includes(s.id)));
    if (this.d.lockControls) this.d.lockControls(controls);
  }

  // The processors: a challenge's settings keep the loop going, on the challenge's sound or, if it
  // names none, on whatever the student is listening to (the Loop Player is always theirs to use).
  withLoop(p) {
    if (!PROC) return p;
    const now = this.d.getPatch();
    const sound = p['src.sound'] || now['src.sound'];
    // the loop plays during a challenge; the lesson's start screen is quiet (Start begins it)
    return { ...p, 'src.sound': sound, 'src.play': this.mode === 'lessons' && this.index >= 0 ? 'play' : 'stop' };
  }

  resetControls() {
    if (this.busy || this.index < 0) return;
    this.d.setPatch(this.withLoop(this.startOverrides));
    this.check();
  }

  // Play the target sound, and capture it for the ghost traces on the scopes.
  async audition() {
    if (this.busy || this.index < 0 || this.type !== 'match') return;
    this.busy = true;
    const run = (this.runId = (this.runId || 0) + 1);
    document.body.classList.add('auditioning');
    this.setStatus('Listen…', 'listen');
    const { engine, scope, keyboard } = this.d;
    keyboard.releaseAll();
    await this.d.ensureAudio();
    if (PROC) {
      // the loop plays through the target settings for a few seconds, then through the student's
      const now = this.d.getPatch();
      scope.frozen = false;
      engine.setPatch({ ...this.target.patch, 'src.sound': now['src.sound'], 'src.play': 'play' });
      if (scope.captureTarget) scope.captureTarget(this.target.patch);
      await wait(PROC_LISTEN_MS);
      if (run !== this.runId) return;
      engine.setPatch(this.d.getPatch());
      this.busy = false;
      document.body.classList.remove('auditioning');
      if (!this.solved) this.setStatus('Your turn', 'turn');
      return;
    }
    engine.allOff();
    scope.frozen = false;
    document.getElementById('hold-btn').classList.remove('on');
    engine.setPatch(this.target.patch);
    await wait(80);
    engine.noteOn(this.target.note);
    await wait(LISTEN_MS * 0.6);
    if (run === this.runId) scope.captureTarget();
    await wait(LISTEN_MS * 0.4);
    engine.noteOff(this.target.note);
    await wait(this.target.patch['aenv.r'] * 1000 + 250);
    if (run !== this.runId) return;
    engine.setPatch(this.d.getPatch());
    this.busy = false;
    document.body.classList.remove('auditioning');
    if (!this.solved) this.setStatus('Your turn', 'turn');
  }

  // ---- checking --------------------------------------------------------------------------------
  onNote(n) {
    if (this.mode !== 'lessons' || this.index < 0) return;
    this.lastNote = n;
    this.lowNote = Math.min(this.lowNote, n);
    this.highNote = Math.max(this.highNote, n);
    this.held++;
    this.notesPlayed = (this.notesPlayed || 0) + 1;
    this.check();
  }

  onNoteOff() {
    this.held = Math.max(0, this.held - 1);
    if (this.mode === 'lessons' && this.index >= 0) this.check();
  }

  onPatchChange() {
    if (this.mode !== 'lessons' || this.index < 0) return;
    this.check();
  }

  state() {
    const patch = this.d.getPatch();
    // live: the processors' measurements (playing, gain reduction, levels in and out), see main.js
    return { patch, note: this.lastNote, held: this.held > 0, heldCount: this.held, notes: this.notesPlayed || 0, f0: osc1Hz(patch, this.lastNote), lowNote: this.lowNote, highNote: this.highNote, live: this.d.measure ? this.d.measure() : null };
  }

  check() {
    if (this.busy || this.index < 0) return;
    this.updateHintBar();
    if (this.solved) return;
    const ch = this.challenge;
    if (this.type === 'match' && PROC) {
      if (patchMatches(this.d.getPatch(), this.target.patch, ch.compare)) this.success('Matched!');
    } else if (this.type === 'match') {
      if (this.lastNote == null) return;
      if (soundMatches(this.d.getPatch(), this.lastNote, this.target.patch, this.target.note, ch.compare)) this.success('Matched!');
    } else if (this.type === 'goal') {
      if (ch.check(this.state())) this.success('Done!');
    } else if (this.type === 'question' && !this.revealed && ch.revealWhen && ch.revealWhen(this.state())) {
      this.revealQuestion(); // they have tried it: now ask
    }
  }

  success(label, delay = 1500) {
    this.solved = true;
    const done = this.done.slice();
    done[this.index] = true;
    this.progress[this.lesson.id] = done;
    save('nf1.progress', this.progress);
    // a sound that has just been played gets heard before the congratulations
    const entered = this.enteredAt;
    setTimeout(() => { if (this.mode === 'lessons' && this.index >= 0 && this.solved && this.enteredAt === entered) this.celebrate(label, done); }, delay);
  }

  celebrate(label, done) {
    this.smileys.forEach((s) => s.start());
    if (this.d.celebrate) this.d.celebrate(3, done.filter(Boolean).length < this.lesson.challenges.length);
    this.renderSteps();
    this.setStatus(label, 'matched');
    const total = this.lesson.challenges.length;
    if (done.filter(Boolean).length === total) {
      setTimeout(() => this.lessonComplete(), 1400);
    } else {
      const nextIdx = this.index < total - 1 ? this.index + 1 : done.findIndex((d) => !d);
      $('lb-next').hidden = false;
      $('lb-next').textContent = 'Next ▸';
      $('lb-next').onclick = () => this.enter(nextIdx, nextIdx === this.index + 1);
    }
  }

  lessonComplete() {
    finale(5.5, this.d.engine.ctx); // with sound
    this.smileys.forEach((s) => s.stop());
    this.fireworks.forEach((f) => f.start({ duration: 6, rate: 5, size: 1.2 }));
    const nextLesson = LESSONS[this.lessonIndex + 1];
    $('lm-eyebrow').textContent = `Lesson ${this.lesson.number} complete`;
    $('lm-title').textContent = this.lesson.title;
    $('lm-text').textContent = this.lesson.doneText;
    $('lm-next').textContent = nextLesson ? `Start lesson ${nextLesson.number}: ${nextLesson.title}` : `Lesson ${this.lesson.number + 1}: coming soon`;
    $('lm-next').classList.toggle('soon', !nextLesson);
    $('lm-replay').textContent = `Replay lesson ${this.lesson.number}`;
    setTimeout(() => { $('lesson-modal').hidden = false; }, 900);
    this.showIntro(true);
  }

  closeModal() { $('lesson-modal').hidden = true; }

  // ---- questions --------------------------------------------------------------------------------
  revealQuestion() {
    this.revealed = true;
    const q = this.challenge.question;
    if (q.prompt) {
      const p = document.createElement('div');
      p.className = 'lb-prompt';
      p.textContent = q.prompt;
      $('lb-question').appendChild(p);
    }
    this.renderQuestion(q);
    this.setStatus('Question', 'turn');
    // a hint offered before the question now refers to the question instead
    if (this.hintShown) this.showHint();
  }

  renderQuestion(q) {
    const wrap = $('lb-question');
    wrap.hidden = false;
    // in a random order each time, so the right answer is not always in the same place
    const opts = [...q.options];
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    opts.forEach((opt) => {
      const b = document.createElement('button');
      b.className = 'lb-answer';
      b.textContent = opt.text;
      b.addEventListener('click', () => this.answer(opt, b));
      wrap.appendChild(b);
    });
  }

  answer(opt, btn) {
    if (this.solved) return;
    const fb = $('lb-feedback');
    if (opt.correct) {
      btn.classList.add('right');
      $('lb-question').querySelectorAll('.lb-answer').forEach((b) => { b.disabled = true; });
      fb.textContent = this.challenge.question.explain;
      fb.className = 'lb-feedback right';
      this.success('Correct!', 0);
    } else {
      btn.classList.add('wrong');
      btn.disabled = true;
      fb.textContent = `Not quite. ${opt.feedback || ''}`;
      fb.className = 'lb-feedback wrong';
      this.wrongAnswers++;
    }
  }

  clearQuestion() {
    $('lb-question').innerHTML = '';
    $('lb-question').hidden = true;
    $('lb-feedback').textContent = '';
    $('lb-feedback').className = 'lb-feedback';
  }

  // ---- hints -----------------------------------------------------------------------------------
  maybeOfferHint() {
    if (this.type === 'explain') return;
    if (this.mode !== 'lessons' || this.index < 0 || this.solved || !$('lb-hint').hidden || this.hintShown) return;
    const stuck = performance.now() - this.enteredAt > HINT_AFTER_MS
      || this.notesPlayed >= HINT_AFTER_NOTES
      || this.listens >= HINT_AFTER_LISTENS
      || this.wrongAnswers > 0;
    if (stuck) $('lb-hint').hidden = false;
  }

  showHint() {
    this.hintShown = true;
    $('lb-hint').hidden = true;
    const ch = this.challenge;
    const box = $('lb-hintbox');
    box.hidden = false;
    const asking = this.type === 'question' && this.revealed;
    $('lb-hint-text').textContent = (asking && ch.question.hint) || ch.hint || 'Turn one control at a time and watch the bar: it fills up as you get closer to the target sound.';
    const hasBar = this.type === 'match' || (ch.progress && (this.type === 'goal' || (this.type === 'question' && !this.revealed)));
    $('lb-heat').hidden = !hasBar;
    this.updateHintBar();
  }

  hideHint() {
    this.hintShown = false;
    $('lb-hint').hidden = true;
    $('lb-hintbox').hidden = true;
  }

  updateHintBar() {
    if (!this.hintShown || $('lb-heat').hidden || this.index < 0) return;
    let v = 0;
    if (this.type === 'match' && PROC) {
      v = patchCloseness(this.d.getPatch(), this.target.patch, this.challenge.compare);
    } else if (this.type === 'match') {
      v = closeness(this.d.getPatch(), this.lastNote, this.target.patch, this.target.note, this.challenge.compare);
    } else if (this.challenge.progress && !(this.type === 'question' && this.revealed)) {
      const s = this.state();
      v = s.note == null && !PROC ? 0 : this.challenge.progress(s);
    }
    v = Math.max(0, Math.min(1, v || 0));
    $('lb-heat-fill').style.width = `${Math.round(v * 100)}%`;
    $('lb-heat-word').textContent = v > 0.95 ? 'Hot!' : v > 0.75 ? 'Warmer' : v > 0.5 ? 'Getting there' : 'Cold';
  }

  // ---- rendering ---------------------------------------------------------------------------------
  setStatus(text, kind) {
    const el = $('lb-status');
    el.textContent = text;
    el.className = 'lb-status ' + kind;
  }

  showPlayControls(on) {
    const match = on && this.index >= 0 && this.type === 'match';
    $('lb-hear').hidden = !match;
    $('lb-ghost-wrap').hidden = !match;
    $('lb-reset').hidden = !on;
  }

  renderSteps() {
    const wrap = $('lb-steps');
    wrap.innerHTML = '';
    const done = this.done;
    const firstOpen = this.lesson.challenges.findIndex((_, i) => !done[i]);
    this.lesson.challenges.forEach((ch, i) => {
      const b = document.createElement('button');
      b.className = 'lb-step' + (done[i] ? ' done' : '') + (i === this.index ? ' current' : '');
      b.innerHTML = done[i] ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>' : String(i + 1);
      b.title = `${i + 1}. ${ch.title}${done[i] ? ' (done)' : ''}`;
      b.setAttribute('aria-label', b.title);
      // completed challenges can be replayed; the next open one can be started
      const reachable = done[i] || i === firstOpen;
      b.disabled = !reachable;
      if (reachable) b.addEventListener('click', () => { if (!this.busy) this.enter(i); });
      wrap.appendChild(b);
    });
  }
}
