// Lesson mode: the lesson bar, playing targets, checking matches, progress and celebrations.

import { LESSONS, patchMatches, soundMatches } from './lessons.js';
import { defaultPatch, ALL_SECTIONS } from './params.js';
import { Fireworks, Smiley, finale } from './fireworks.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LISTEN_MS = 1600; // how long the target plays
const $ = (id) => document.getElementById(id);

function loadProgress() {
  try { return JSON.parse(localStorage.getItem('nf1.progress')) || {}; } catch { return {}; }
}
function loadNote() {
  try { const n = Number(localStorage.getItem('nf1.lessonNote')); return n > 0 ? n : null; } catch { return null; }
}
function saveNote(n) {
  try { localStorage.setItem('nf1.lessonNote', String(n)); } catch { /* storage unavailable */ }
}
function saveProgress(p) {
  try { localStorage.setItem('nf1.progress', JSON.stringify(p)); } catch { /* storage unavailable */ }
}

export class LessonController {
  // deps: { getPatch, setPatch, engine, scope, keyboard, lockSection, ensureAudio, onModeChange }
  constructor(deps) {
    this.d = deps;
    this.lessonIndex = 0;
    this.index = -1;          // current challenge (-1 = intro screen)
    this.busy = false;        // target is playing: student input is ignored
    this.solved = false;
    this.lastNote = null;
    this.note = loadNote();   // the lesson's key: found in challenge 1, reused (and marked) after
    this.progress = loadProgress();
    this.mode = 'free';

    // celebrations drawn on the two screens: a smiley per matched sound, fireworks per lesson
    this.smileys = [new Smiley(), new Smiley()];
    this.fireworks = [new Fireworks(), new Fireworks()];
    deps.scope.fx = { a: [this.smileys[0], this.fireworks[0]], b: [this.smileys[1], this.fireworks[1]] };
    deps.scope.showTarget = true;

    $('lb-hear').addEventListener('click', () => this.audition());
    $('lb-reset').addEventListener('click', () => this.resetControls());
    $('lb-start').addEventListener('click', () => this.begin());
    $('lb-ghost').addEventListener('change', (e) => { deps.scope.showTarget = e.target.checked; });
    $('lm-replay').addEventListener('click', () => { this.closeModal(); this.restartLesson(); });
    $('lm-free').addEventListener('click', () => { this.closeModal(); this.setMode('free'); });
    $('lm-next').addEventListener('click', () => {
      if (!LESSONS[this.lessonIndex + 1]) return;
      this.closeModal(); this.lessonIndex++; this.showIntro();
    });
  }

  get lesson() { return LESSONS[this.lessonIndex]; }
  get done() { return this.progress[this.lesson.id] || []; }
  get challenge() { return this.lesson.challenges[this.index]; }

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
      this.runId = (this.runId || 0) + 1; // abandon a target that is still playing
      document.body.classList.remove('auditioning');
      this.d.scope.clearTarget();
      this.d.keyboard.markTarget(null);
      ALL_SECTIONS.forEach((s) => this.d.lockSection(s.id, false));
      if (this.freePatch) this.d.setPatch(this.freePatch);
    }
    if (this.d.onModeChange) this.d.onModeChange(mode);
  }

  // ---- intro / navigation ---------------------------------------------------------------------
  showIntro() {
    this.index = -1;
    this.d.keyboard.markTarget(null);
    this.d.scope.clearTarget();
    this.lockFor(['osc1']);
    this.d.setPatch({});
    const started = this.done.some(Boolean);
    const complete = this.done.filter(Boolean).length === this.lesson.challenges.length;
    $('lb-eyebrow').textContent = `Lesson ${this.lesson.number}`;
    $('lb-title').textContent = this.lesson.title;
    $('lb-task-title').textContent = complete ? 'Lesson complete' : started ? 'Welcome back' : 'Ready?';
    $('lb-task-text').textContent = complete
      ? 'You have matched every sound in this lesson. Replay any challenge by clicking its number, or start again.'
      : `${this.lesson.summary} Listen to each target sound, then use the synth to match it. There are ${this.lesson.challenges.length} sounds to match.`;
    $('lb-start').textContent = complete ? 'Start again' : started ? 'Continue' : `Start lesson ${this.lesson.number}`;
    $('lb-start').hidden = false;
    this.setStatus('', '');
    this.showPlayControls(false);
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
    saveProgress(this.progress);
    this.note = null;
    this.enter(0);
  }

  next() {
    if (this.index < this.lesson.challenges.length - 1) this.enter(this.index + 1);
  }

  // ---- a challenge ---------------------------------------------------------------------------
  enter(i) {
    this.index = i;
    this.solved = false;
    this.lastNote = null;
    const ch = this.challenge;
    this.startPatch = { ...defaultPatch(), ...ch.start };
    this.target = this.makeTarget(ch);
    this.lockFor(ch.unlocked);
    this.d.keyboard.markTarget(ch.showKey ? this.target.note : null);
    this.d.setPatch(ch.start);
    this.d.scope.clearTarget();

    $('lb-start').hidden = true;
    this.showPlayControls(true);
    $('lb-next').hidden = true;
    $('lb-task-title').textContent = `${i + 1}. ${ch.title}`;
    $('lb-task-text').textContent = ch.text;
    this.renderSteps();
    this.audition();
  }

  makeTarget(ch) {
    const ctx = {
      note: this.note,
      pick: (list) => list[Math.floor(Math.random() * list.length)],
      pickDistinct: (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n),
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
    // the lesson's key must be on the visible keyboard (the octave may have changed)
    const kb = this.d.keyboard;
    if (ctx.note == null || ctx.note < kb.low || ctx.note > kb.high) ctx.newNote();
    let t;
    for (let tries = 0; tries < 30; tries++) {
      t = ch.make(ctx);
      t.patch = { ...this.startPatch, ...t.patch };
      // make sure there is something to change (the first challenge only asks for the note)
      if (this.index === 0 || !patchMatches(this.startPatch, t.patch, ch.compare)) break;
    }
    this.note = t.note;
    saveNote(t.note);
    return t;
  }

  lockFor(unlocked) {
    ALL_SECTIONS.forEach((s) => this.d.lockSection(s.id, !unlocked.includes(s.id)));
  }

  resetControls() {
    if (this.busy || this.index < 0) return;
    this.d.setPatch(this.challenge.start);
    this.check();
  }

  // Play the target sound, and capture it for the ghost traces on the scopes.
  async audition() {
    if (this.busy || this.index < 0) return;
    this.busy = true;
    const run = (this.runId = (this.runId || 0) + 1);
    document.body.classList.add('auditioning');
    this.setStatus('Listen…', 'listen');
    const { engine, scope, keyboard } = this.d;
    keyboard.releaseAll();
    await this.d.ensureAudio();
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

  // ---- matching -------------------------------------------------------------------------------
  onNote(n) {
    if (this.mode !== 'lessons' || this.index < 0) return;
    this.lastNote = n;
    this.check();
  }

  onPatchChange() {
    if (this.mode !== 'lessons' || this.index < 0) return;
    this.check();
  }

  check() {
    if (this.busy || this.solved || this.index < 0) return;
    if (this.lastNote == null) return;
    if (!soundMatches(this.d.getPatch(), this.lastNote, this.target.patch, this.target.note, this.challenge.compare)) return;
    this.success();
  }

  success() {
    this.solved = true;
    const done = this.done.slice();
    done[this.index] = true;
    this.progress[this.lesson.id] = done;
    saveProgress(this.progress);
    this.smileys.forEach((s) => s.start());
    this.renderSteps();
    const total = this.lesson.challenges.length;
    const all = done.filter(Boolean).length === total;
    if (all) {
      this.setStatus('Matched!', 'matched');
      setTimeout(() => this.lessonComplete(), 1400);
    } else {
      this.setStatus('Matched!', 'matched');
      const nextIdx = this.index < total - 1 ? this.index + 1 : done.findIndex((d) => !d);
      $('lb-next').hidden = false;
      $('lb-next').textContent = 'Next sound ▸';
      $('lb-next').onclick = () => this.enter(nextIdx);
    }
  }

  lessonComplete() {
    finale(5.5, this.d.engine.ctx); // with sound
    this.smileys.forEach((s) => s.stop());
    this.fireworks.forEach((f) => f.start({ duration: 6, rate: 5, size: 1.2 }));
    const nextLesson = LESSONS[this.lessonIndex + 1];
    $('lm-eyebrow').textContent = `Lesson ${this.lesson.number} complete`;
    $('lm-title').textContent = this.lesson.title;
    $('lm-text').textContent = `You matched all ${this.lesson.challenges.length} sounds by ear. You now know how pitch, octave range, waveform and detuning shape the raw sound of an oscillator.`;
    $('lm-next').textContent = nextLesson ? `Start lesson ${nextLesson.number}: ${nextLesson.title}` : `Lesson ${this.lesson.number + 1}: coming soon`;
    $('lm-next').classList.toggle('soon', !nextLesson);
    $('lm-replay').textContent = `Replay lesson ${this.lesson.number}`;
    setTimeout(() => { $('lesson-modal').hidden = false; }, 900);
    this.showIntro();
  }

  closeModal() { $('lesson-modal').hidden = true; }

  // ---- rendering ---------------------------------------------------------------------------------
  setStatus(text, kind) {
    const el = $('lb-status');
    el.textContent = text;
    el.className = 'lb-status ' + kind;
  }

  showPlayControls(on) {
    ['lb-hear', 'lb-reset', 'lb-ghost-wrap'].forEach((id) => { $(id).hidden = !on; });
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
      b.title = `${i + 1}. ${ch.title}${done[i] ? ' (matched)' : ''}`;
      b.setAttribute('aria-label', b.title);
      // completed challenges can be replayed; the next open one can be started
      const reachable = done[i] || i === firstOpen;
      b.disabled = !reachable;
      if (reachable) b.addEventListener('click', () => { if (!this.busy) this.enter(i); });
      wrap.appendChild(b);
    });
  }
}
