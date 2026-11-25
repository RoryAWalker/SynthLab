// NF-MiniModular lessons: learning to patch. Students already know what each part does from the
// NF-1; here they build a synth from nothing, one cable at a time, then bend it into new shapes.
// Same challenge format as lessons.js (goal and question challenges), plus:
//   carry (lesson)   arriving at a challenge with Next keeps the student's own patch, so the
//                    synth builds up step by step. Reset (and jumping to a step) loads 'start'.
//   set (challenge)  values applied on top of the carried patch when a step needs them
//
// Patch cables are ordinary patch values: p['jack.vca.in'] === 'osc.out' means the VCO's Out
// is plugged into the VCA's In.

import { UNPATCHED } from './synths/nfm.js';

// ---- reading a patch ----------------------------------------------------------------------
const J = (p, input) => p['jack.' + input] || '';
const is = (p, input, output) => J(p, input) === output;
let unplugged = false; // 'Unplug and replug': has the cable been pulled out yet in this attempt?
// The audio path that reaches the Output, followed backwards along the cables:
// e.g. ['vca.out', 'filt.out', 'osc.out'] for VCO -> VCF -> VCA -> Output.
function audioPath(p) {
  const path = [];
  let at = J(p, 'out.in');
  const through = { 'vca.out': 'vca.in', 'filt.out': 'filt.in' };
  while (at && !path.includes(at)) {
    path.push(at);
    at = through[at] ? J(p, through[at]) : '';
  }
  return path;
}
const pathIs = (p, ...outs) => audioPath(p).join(' ') === outs.join(' ');
const share = (...bits) => bits.filter(Boolean).length / bits.length; // for the Hotter/Colder bar

// ---- the synth as it is built up in Lesson 1 ------------------------------------------------
const cable = (input, output) => ({ ['jack.' + input]: output });
const P_EMPTY = { ...UNPATCHED, 'vca.level': 0 };
const P_VCA = { ...P_EMPTY, ...cable('vca.in', 'osc.out'), ...cable('out.in', 'vca.out') };
const P_DRONE = { ...P_VCA, 'vca.level': 0.7 };
const P_FILTER = { ...P_DRONE, ...cable('filt.in', 'osc.out'), ...cable('vca.in', 'filt.out') };
const P_KEYS = { ...P_FILTER, ...cable('osc.pitch', 'kb.pitch') };
const P_ENV = { ...P_KEYS, 'vca.level': 0, ...cable('vca.cv', 'env.out') };
const P_GATE = { ...P_ENV, ...cable('env.gate', 'kb.gate') };
const P_VIBRATO = { ...P_GATE, ...cable('osc.fm', 'lfo.out'), 'osc.fm': 0.08 };

// Lesson 3's target patches (added on top of the basic synth, P_GATE)
const VIBRATO = { ...cable('osc.fm', 'lfo.out'), 'osc.fm': 0.1, 'lfo.rate': 5.5 };
const WAH = { ...cable('filt.cv', 'lfo.out'), 'filt.cv': 0.5, 'filt.cutoff': 500, 'filt.res': 0.4, 'lfo.rate': 2.5 };
const PLUCK = { ...cable('filt.cv', 'env.out'), 'filt.cv': 0.7, 'filt.cutoff': 200, 'filt.res': 0.3, 'aenv.d': 0.5, 'aenv.s': 0.15 };
const ZAP = { ...cable('osc.fm', 'env.out'), 'osc.fm': 0.6, 'aenv.d': 0.25, 'aenv.s': 0 };
const REPEAT = { ...cable('env.gate', 'lfo.out'), 'lfo.shape': 'square', 'lfo.rate': 4 };
const SELF_FM = { ...cable('osc.fm', 'osc.out'), 'osc.fm': 0.35 };
const FILTER_ONLY = { ...cable('filt.in', ''), ...cable('filt.cv', 'kb.pitch'), 'filt.cv': 0.17, 'filt.res': 1, 'filt.cutoff': 300 };

const BASIC = ['osc', 'vca', 'out'];
const WITH_FILTER = [...BASIC, 'filt'];
const WITH_KEYS = [...WITH_FILTER, 'kb'];
const WITH_ENV = [...WITH_KEYS, 'env'];
const ALL = [...WITH_ENV, 'lfo'];

export const MOD_LESSONS = [
  {
    id: 'patch1',
    number: 1,
    title: 'Patching (Basic)',
    summary: 'Build a synth from nothing, one cable at a time, and meet the parts that were hidden inside the NF-1.',
    doneText: 'You built a complete synth from nothing: VCO into VCF into VCA, played by the keyboard and shaped by an envelope, with vibrato and a filter wobble from the LFO. That is the same voice as the NF-1, but now you know where every connection is.',
    base: P_EMPTY, introUnlocked: [], carry: true, scopes: false,
    challenges: [
      {
        type: 'goal', title: 'Your first cables',
        text: 'A modular synth starts silent: nothing is connected until you patch it. Sound flows along cables from an output (on a dark plate) to an input. Drag a cable from the VCO\'s Out to the VCA\'s In, then another from the VCA\'s Out to the Output\'s In.',
        unlocked: BASIC,
        make: (c) => ({ start: P_EMPTY, note: c.note }),
        check: (s) => pathIs(s.patch, 'vca.out', 'osc.out'),
        progress: (s) => share(is(s.patch, 'vca.in', 'osc.out'), is(s.patch, 'out.in', 'vca.out')),
        hint: 'Press on the socket marked OUT in the VCO, hold, and drag to the socket marked IN in the VCA. Let go. Then do the same from the VCA\'s OUT to the Output\'s IN.',
      },
      {
        type: 'goal', title: 'Unplug and replug',
        text: 'Cables come out as easily as they go in. Pull the cable out of the Output\'s In: double-click its plug, or drag the plug off and let go over an empty part of the panel. Then patch it back in, from the VCA\'s Out to the Output\'s In.',
        unlocked: BASIC,
        make: (c) => { unplugged = false; return { start: P_VCA, note: c.note }; },
        check: (s) => { if (!J(s.patch, 'out.in')) unplugged = true; return unplugged && pathIs(s.patch, 'vca.out', 'osc.out'); },
        progress: (s) => share(unplugged || !J(s.patch, 'out.in'), unplugged && is(s.patch, 'out.in', 'vca.out')),
        hint: 'Double-click the plug in the Output module\'s IN socket: the cable disappears. Then drag from the VCA\'s OUT to the Output\'s IN again.',
      },
      {
        type: 'goal', title: 'Open the VCA',
        text: 'Everything is connected, but you hear nothing. The VCA (Voltage-Controlled Amplifier) is a volume control, and it is shut. Turn its Level up past halfway.',
        unlocked: BASIC,
        make: (c) => ({ start: P_VCA, note: c.note }),
        check: (s) => pathIs(s.patch, 'vca.out', 'osc.out') && s.patch['vca.level'] >= 0.5,
        progress: (s) => Math.min(1, s.patch['vca.level'] / 0.5),
        hint: 'Turn the Level knob on the VCA clockwise until it reads more than 50%.',
      },
      {
        type: 'question', title: 'The hidden VCA',
        text: 'That steady tone is the VCO, let through by the open VCA. The NF-1 has a VCA too, but you never saw it on the panel.',
        unlocked: BASIC,
        make: (c) => ({ start: P_DRONE, note: c.note }),
        question: {
          prompt: 'On the NF-1, what opened and closed its hidden VCA?',
          options: [
            { text: 'The Loudness Envelope', correct: true },
            { text: 'The Cutoff knob', feedback: 'Cutoff changes the tone (which harmonics get through), not how loud the sound is.' },
            { text: 'Nothing: the NF-1 has no VCA', feedback: 'Every note on the NF-1 starts, swells and fades. Something must be turning its volume up and down.' },
          ],
          explain: 'On the NF-1 the Loudness Envelope is wired, out of sight, to a VCA after the filter. Each key press opens the VCA and each release closes it. On a modular nothing is wired for you: you will make that same connection yourself in a few steps.',
        },
      },
      {
        type: 'question', title: 'Voltage control',
        text: 'VCA stands for Voltage-Controlled Amplifier. On an analogue synth, every signal is a voltage: the sound itself, and also slower signals that move knobs for you. Those slower ones are called CV, Control Voltage.',
        unlocked: BASIC,
        make: (c) => ({ start: P_DRONE, note: c.note }),
        question: {
          prompt: 'Which of the VCA\'s jacks lets another module turn its volume up and down?',
          options: [
            { text: 'CV', correct: true },
            { text: 'In', feedback: 'In is where the sound to be controlled goes in.' },
            { text: 'Out', feedback: 'Out is where the controlled sound comes out.' },
          ],
          explain: 'CV (Control Voltage) is the input that does the controlling: whatever is patched into it opens and closes the VCA, just like turning its Level knob. The same idea gives the VCO (Voltage-Controlled Oscillator) and the VCF (Voltage-Controlled Filter) their names: each has inputs that let other modules control it.',
        },
      },
      {
        type: 'goal', title: 'Add the filter',
        text: 'Put the VCF (Voltage-Controlled Filter) between the VCO and the VCA. Patch the VCO\'s Out into the VCF\'s In, then move the cable on the VCA\'s In so it comes from the VCF\'s Out instead. Then turn the Cutoff down below 500 Hz to hear the filter working.',
        unlocked: WITH_FILTER,
        make: (c) => ({ start: P_DRONE, note: c.note }),
        check: (s) => pathIs(s.patch, 'vca.out', 'filt.out', 'osc.out') && s.patch['filt.cutoff'] <= 500 && s.patch['vca.level'] > 0.05,
        progress: (s) => share(is(s.patch, 'filt.in', 'osc.out'), is(s.patch, 'vca.in', 'filt.out'), s.patch['filt.cutoff'] <= 500),
        hint: 'Drag from the VCO\'s OUT to the VCF\'s IN. Then grab the plug in the VCA\'s IN, drag it off and drop it on nothing (it disappears), and patch a new cable from the VCF\'s OUT to the VCA\'s IN. Finally turn Cutoff down.',
      },
      {
        type: 'question', title: 'Silent keys',
        text: 'Turn the Cutoff back up a little, then play a few different keys.',
        unlocked: WITH_FILTER,
        make: (c) => ({ start: { ...P_FILTER, 'filt.cutoff': 400 }, note: c.note }),
        revealWhen: (s) => s.highNote - s.lowNote >= 2,
        progress: (s) => (s.note == null ? 0 : s.highNote - s.lowNote >= 2 ? 1 : 0.5),
        hint: 'Play at least two different keys on the keyboard.',
        question: {
          prompt: 'The note did not change. Why?',
          options: [
            { text: 'The keyboard is not patched to anything', correct: true },
            { text: 'The VCA\'s Level is too high', feedback: 'Level only sets how loud it is. What tells the VCO which note to play?' },
            { text: 'The filter is blocking the keyboard', feedback: 'The filter only changes the sound passing through it. Look at the Keyboard\'s two jacks: are they connected?' },
          ],
          explain: 'The keyboard sends its own signals, Pitch and Gate, from the two jacks beside it. Until they are patched somewhere, the keys do nothing at all and the VCO just plays its own note.',
        },
      },
      {
        type: 'goal', title: 'Play a tune',
        text: 'Patch the Keyboard\'s Pitch output into the VCO\'s Pitch input, then play at least two different notes.',
        unlocked: WITH_KEYS,
        make: (c) => ({ start: P_FILTER, note: c.note }),
        check: (s) => is(s.patch, 'osc.pitch', 'kb.pitch') && s.highNote - s.lowNote >= 2 && audioPath(s.patch).includes('osc.out'),
        progress: (s) => share(is(s.patch, 'osc.pitch', 'kb.pitch'), s.highNote - s.lowNote >= 2),
        hint: 'Drag from the PITCH socket beside the keyboard up to the PITCH socket on the VCO. Then play a few keys.',
      },
      {
        type: 'question', title: 'It never stops',
        text: 'Play a note, then let go of the key.',
        unlocked: WITH_KEYS,
        make: (c) => ({ start: P_KEYS, note: c.note }),
        revealWhen: (s) => s.note != null && !s.held,
        hint: 'Click a key and let go.',
        question: {
          prompt: 'Why does the sound carry on after you let go?',
          options: [
            { text: 'The VCA is held open by its Level knob: nothing closes it when the key is released', correct: true },
            { text: 'The VCO keeps playing the last note it was sent', feedback: 'It does, but the VCO always plays: oscillators never stop. Something after it has to let the sound through, or not.' },
          ],
          explain: 'An oscillator never stops. Whether you hear it depends on the VCA. Here its Level knob holds it open all the time, so the sound drones on. To make notes start and stop, the VCA needs a control voltage that rises when a key is pressed and falls when it is let go: an envelope.',
        },
      },
      {
        type: 'question', title: 'Let the envelope open the VCA',
        text: 'Turn the VCA\'s Level down to 0, and patch the Envelope\'s Out into the VCA\'s CV. Then play a note.',
        unlocked: WITH_ENV,
        make: (c) => ({ start: P_KEYS, note: c.note }),
        // the question appears once they have patched it and heard (nothing)
        revealWhen: (s) => is(s.patch, 'vca.cv', 'env.out') && s.patch['vca.level'] < 0.05 && s.note != null && !s.held,
        progress: (s) => share(is(s.patch, 'vca.cv', 'env.out'), s.patch['vca.level'] < 0.05, s.note != null),
        hint: 'Turn the VCA\'s Level knob fully anticlockwise. Drag from the Envelope\'s OUT to the VCA\'s CV. Then click a key.',
        question: {
          prompt: 'Silence! The envelope is patched into the VCA\'s CV, but playing a key makes no sound. Why?',
          options: [
            { text: 'The Envelope does not know a key was pressed: its Gate input is empty', correct: true },
            { text: 'The VCA\'s Level must be turned up', feedback: 'That would just bring the drone back: the sound would no longer start and stop with the keys.' },
            { text: 'The Envelope\'s Attack is too slow', feedback: 'Even a slow envelope starts eventually. This one never starts at all. What starts an envelope?' },
          ],
          explain: 'An envelope runs when its Gate input goes high, and releases when it goes low. The keyboard\'s Gate output does exactly that: high while a key is held, low when it is let go. On the NF-1 this connection is hidden inside; here you have to make it.',
          hint: 'Look at the Envelope\'s jacks. What is plugged into its Gate input?',
        },
      },
      {
        type: 'goal', title: 'Gate the envelope',
        text: 'Patch the Keyboard\'s Gate output into the Envelope\'s Gate input, then play some notes. Each note now starts and stops: you have built the same voice as the NF-1.',
        unlocked: WITH_ENV,
        make: (c) => ({ start: P_ENV, note: c.note }),
        check: (s) => is(s.patch, 'env.gate', 'kb.gate') && is(s.patch, 'vca.cv', 'env.out') && pathIs(s.patch, 'vca.out', 'filt.out', 'osc.out') && s.note != null,
        progress: (s) => share(is(s.patch, 'env.gate', 'kb.gate'), s.note != null),
        hint: 'Drag from the GATE socket beside the keyboard to the GATE socket on the Envelope. Then play.',
      },
      {
        type: 'goal', title: 'Slow attack',
        text: 'The envelope shapes every note. Make each note fade in slowly: set Attack to at least half a second, then play a note.',
        unlocked: WITH_ENV,
        make: (c) => ({ start: P_GATE, note: c.note }),
        check: (s) => s.patch['aenv.a'] >= 0.5 && is(s.patch, 'env.gate', 'kb.gate') && s.note != null,
        progress: (s) => Math.min(1, Math.log10(s.patch['aenv.a'] / 0.005) / 2),
        hint: 'Turn the Envelope\'s Attack knob up until it reads 500 ms or more, then hold a key.',
      },
      {
        type: 'goal', title: 'Vibrato',
        text: 'Now the LFO. Patch its Out into the VCO\'s FM input, and turn FM Amount up just a little (no more than 25%) for a gentle vibrato. Play a long note.',
        unlocked: ALL,
        set: { 'aenv.a': 0.005 },
        make: (c) => ({ start: P_GATE, note: c.note }),
        check: (s) => is(s.patch, 'osc.fm', 'lfo.out') && s.patch['osc.fm'] >= 0.02 && s.patch['osc.fm'] <= 0.25 && s.note != null,
        progress: (s) => share(is(s.patch, 'osc.fm', 'lfo.out'), s.patch['osc.fm'] >= 0.02, s.patch['osc.fm'] <= 0.25, s.note != null),
        hint: 'Drag from the LFO\'s OUT to the VCO\'s FM. Then turn FM Amount up slowly from 0 while you hold a note: stop when the pitch wobbles gently.',
      },
      {
        type: 'question', title: 'Moving the filter',
        text: 'The LFO is moving the VCO\'s pitch. It could move other things instead.',
        unlocked: ALL,
        make: (c) => ({ start: P_VIBRATO, note: c.note }),
        question: {
          prompt: 'How could you make the LFO sweep the filter\'s cutoff up and down (a wah)?',
          options: [
            { text: 'Patch the LFO\'s Out into the VCF\'s Freq, and turn up CV Amount', correct: true },
            { text: 'Patch the LFO\'s Out into the VCF\'s In', feedback: 'In is for the sound to be filtered. The LFO is far too slow to hear, so it would not move anything.' },
            { text: 'Turn FM Amount up further', feedback: 'FM Amount only sets how far the LFO moves the pitch.' },
          ],
          explain: 'Like the VCA\'s CV, the VCF\'s Freq is a control-voltage input: a signal there moves the cutoff frequency, by as much as CV Amount allows. Any modulator can go into any control input. That is the whole idea of a modular.',
        },
      },
      {
        type: 'goal', title: 'Wah',
        text: 'Do it: patch the LFO\'s Out into the VCF\'s Freq and turn CV Amount up to at least 30%. An output can feed more than one input, so the vibrato cable can stay where it is. Play a long note.',
        unlocked: ALL,
        make: (c) => ({ start: P_VIBRATO, note: c.note }),
        check: (s) => is(s.patch, 'filt.cv', 'lfo.out') && Math.abs(s.patch['filt.cv']) >= 0.3 && s.note != null,
        progress: (s) => share(is(s.patch, 'filt.cv', 'lfo.out'), Math.abs(s.patch['filt.cv']) >= 0.3, s.note != null),
        hint: 'Start a new cable from the LFO\'s OUT (it can have several) and drop it on the VCF\'s Freq. Turn CV Amount up, and Cutoff down a little to hear the sweep.',
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'patch2',
    number: 2,
    title: 'Patching (Intermediate)',
    summary: 'Any output can go into any input. Bend the basic synth into plucks, zaps, self-playing patterns and a filter you can play like an instrument.',
    doneText: 'You patched an envelope into the filter and the pitch, made the cutoff follow the keyboard, let the LFO play the synth for you, played the filter on its own and made the VCO modulate itself. On a modular, a "sound" is really a patch.',
    base: P_GATE, introUnlocked: [], scopes: false,
    challenges: [
      {
        type: 'question', title: 'Bright, then dark',
        text: 'The basic synth is patched. Each note now has the same tone from start to end.',
        unlocked: ALL,
        make: (c) => ({ start: { ...P_GATE, 'aenv.s': 0.4, 'aenv.d': 0.6 }, note: c.note }),
        question: {
          prompt: 'How could you make each note start bright and then get darker?',
          options: [
            { text: 'Patch the Envelope\'s Out into the VCF\'s Freq as well', correct: true },
            { text: 'Patch the LFO\'s Out into the VCF\'s Freq', feedback: 'The LFO keeps swinging up and down on its own. You want something that rises at each key press, then falls.' },
            { text: 'Turn the VCF\'s Cutoff down', feedback: 'That makes the whole note darker. You want the tone to change during the note.' },
          ],
          explain: 'The envelope rises when a key is pressed and falls again, so patched into the VCF\'s Freq it opens the filter at the start of each note and lets it close. One envelope can drive the VCA and the VCF at once, because an output can feed several inputs.',
        },
      },
      {
        type: 'goal', title: 'Pluck',
        text: 'Patch the Envelope\'s Out into the VCF\'s Freq too. Turn Cutoff below 300 Hz and CV Amount above 50%, and set Sustain low so the filter closes after each attack. Play some notes.',
        unlocked: ALL,
        make: (c) => ({ start: { ...P_GATE, 'aenv.s': 0.4, 'aenv.d': 0.6 }, note: c.note }),
        check: (s) => is(s.patch, 'filt.cv', 'env.out') && s.patch['filt.cutoff'] <= 300 && s.patch['filt.cv'] >= 0.5 && s.patch['aenv.s'] <= 0.3 && s.note != null,
        progress: (s) => share(is(s.patch, 'filt.cv', 'env.out'), s.patch['filt.cutoff'] <= 300, s.patch['filt.cv'] >= 0.5, s.patch['aenv.s'] <= 0.3),
        hint: 'New cable: Envelope OUT to VCF FREQ (the other cable from the Envelope stays on the VCA). Then: Cutoff below 300 Hz, CV Amount above +50%, Sustain below 30%.',
      },
      {
        type: 'goal', title: 'Laser zap',
        text: 'An envelope can move pitch too. Patch the Envelope\'s Out into the VCO\'s FM, turn FM Amount up past 40%, and make the envelope short: Decay under 0.3 s and Sustain at 0. Play some notes.',
        unlocked: ALL,
        make: (c) => ({ start: P_GATE, note: c.note }),
        check: (s) => is(s.patch, 'osc.fm', 'env.out') && s.patch['osc.fm'] >= 0.4 && s.patch['aenv.d'] <= 0.3 && s.patch['aenv.s'] <= 0.05 && s.note != null,
        progress: (s) => share(is(s.patch, 'osc.fm', 'env.out'), s.patch['osc.fm'] >= 0.4, s.patch['aenv.d'] <= 0.3, s.patch['aenv.s'] <= 0.05),
        hint: 'Cable from the Envelope\'s OUT to the VCO\'s FM. FM Amount above 40%. Envelope: Decay below 300 ms, Sustain all the way down.',
      },
      {
        type: 'goal', title: 'A filter that follows the keys',
        text: 'Play a low note and a high note: the high one sounds duller, because the cutoff stays put. Patch the Keyboard\'s Pitch into the VCF\'s Freq as well. Full CV Amount moves the cutoff 6 octaves for each octave of the keyboard, so set it to about +17% (one sixth): one octave per octave. Then play notes far apart.',
        unlocked: ALL,
        make: (c) => ({ start: { ...P_GATE, 'filt.cutoff': 500 }, note: c.note }),
        check: (s) => is(s.patch, 'filt.cv', 'kb.pitch') && s.patch['filt.cv'] >= 0.12 && s.patch['filt.cv'] <= 0.22 && s.highNote - s.lowNote >= 12,
        progress: (s) => share(is(s.patch, 'filt.cv', 'kb.pitch'), s.patch['filt.cv'] >= 0.12 && s.patch['filt.cv'] <= 0.22, s.highNote - s.lowNote >= 12),
        hint: 'A second cable from the Keyboard\'s PITCH (the first still goes to the VCO) into the VCF\'s Freq. Turn on Show values and set CV Amount between +12% and +22%. Then play notes at least an octave apart.',
      },
      {
        type: 'goal', title: 'The LFO plays the keys',
        text: 'A gate is just a signal that goes high and low. A square-wave LFO does that too. Set the LFO\'s Shape to square and patch its Out into the Envelope\'s Gate instead of the keyboard. Hold a key and listen.',
        unlocked: ALL,
        make: (c) => ({ start: P_GATE, note: c.note }),
        check: (s) => is(s.patch, 'env.gate', 'lfo.out') && s.patch['lfo.shape'] === 'square' && s.note != null,
        progress: (s) => share(is(s.patch, 'env.gate', 'lfo.out'), s.patch['lfo.shape'] === 'square', s.note != null),
        hint: 'Turn the LFO\'s Shape to the square wave. Pull the cable out of the Envelope\'s GATE and patch the LFO\'s OUT into it. Change the LFO Rate to change the speed.',
      },
      {
        type: 'question', title: 'Who is playing?',
        text: 'Let go of the key and listen.',
        unlocked: ALL,
        make: (c) => ({ start: { ...P_GATE, 'lfo.shape': 'square', ...cable('env.gate', 'lfo.out') }, note: c.note }),
        revealWhen: (s) => s.note != null && !s.held,
        hint: 'Click a key and let go, then listen.',
        question: {
          prompt: 'Why does it keep playing after you let go?',
          options: [
            { text: 'The LFO is now the gate: it keeps starting the envelope, key or no key', correct: true },
            { text: 'The keyboard\'s gate is stuck', feedback: 'The keyboard\'s Gate is no longer patched to anything. What is in the Envelope\'s Gate input now?' },
          ],
          explain: 'The envelope does not care where its gate comes from. With the LFO in its Gate, the LFO starts a new note on every cycle, and the keyboard only chooses the pitch. Sequencers and drum machines work the same way: they send gates.',
        },
      },
      {
        type: 'goal', title: 'Play the filter',
        text: 'A filter with high resonance whistles on its own. Pull out the cable in the VCF\'s In so no sound goes into it, turn Resonance all the way up, and patch the Keyboard\'s Pitch into the VCF\'s Freq at about +17%. Play: the filter itself is the instrument.',
        unlocked: ALL,
        make: (c) => ({ start: { ...P_GATE, 'filt.cutoff': 300 }, note: c.note }),
        check: (s) => !J(s.patch, 'filt.in') && s.patch['filt.res'] >= 0.95 && is(s.patch, 'filt.cv', 'kb.pitch') && s.patch['filt.cv'] >= 0.12 && s.patch['filt.cv'] <= 0.22 && is(s.patch, 'vca.in', 'filt.out') && s.note != null,
        progress: (s) => share(!J(s.patch, 'filt.in'), s.patch['filt.res'] >= 0.95, is(s.patch, 'filt.cv', 'kb.pitch'), s.patch['filt.cv'] >= 0.12 && s.patch['filt.cv'] <= 0.22),
        hint: 'Drag the plug out of the VCF\'s IN and drop it on nothing. Resonance fully up. A cable from the Keyboard\'s PITCH to the VCF\'s Freq, with CV Amount between +12% and +22%. Move Cutoff to tune it.',
      },
      {
        type: 'goal', title: 'Feed it back',
        text: 'Audio can be a control signal too. Patch the VCO\'s Out into its own FM input and turn FM Amount up past 20%: the VCO bends its own pitch thousands of times a second, which makes a harsh, metallic tone.',
        unlocked: ALL,
        make: (c) => ({ start: P_GATE, note: c.note }),
        check: (s) => is(s.patch, 'osc.fm', 'osc.out') && s.patch['osc.fm'] >= 0.2 && s.note != null,
        progress: (s) => share(is(s.patch, 'osc.fm', 'osc.out'), s.patch['osc.fm'] >= 0.2, s.note != null),
        hint: 'Start a cable at the VCO\'s OUT (the one to the VCF stays) and drop it on the VCO\'s own FM. Turn FM Amount up while holding a note.',
      },
      {
        type: 'question', title: 'Skipping the VCA',
        text: 'Patch the VCO\'s Out straight into the Output\'s In (replacing the VCA), then play a note and let go.',
        unlocked: ALL,
        make: (c) => ({ start: P_GATE, note: c.note }),
        revealWhen: (s) => is(s.patch, 'out.in', 'osc.out') && s.note != null && !s.held,
        progress: (s) => share(is(s.patch, 'out.in', 'osc.out'), s.note != null),
        hint: 'Drag from the VCO\'s OUT to the Output\'s IN. Then click a key and let go.',
        question: {
          prompt: 'What happened, and why?',
          options: [
            { text: 'It plays all the time: without the VCA, nothing turns the sound on and off', correct: true },
            { text: 'It stopped when I let go, as before', feedback: 'Listen again after letting go. Is anything between the VCO and the Output now?' },
          ],
          explain: 'The VCO runs all the time. Notes only start and stop because the envelope opens and closes the VCA. Take the VCA out of the path and you hear the raw oscillator constantly, through no filter and with no envelope.',
        },
      },
    ],
  },
  // ---------------------------------------------------------------------------------------
  {
    id: 'patch3',
    number: 3,
    title: 'Patching (By Ear)',
    summary: 'Hear a patch, then rebuild it: work out which modulator is going where, just by listening.',
    doneText: 'You rebuilt every patch by ear: you can now hear where a modulator is patched (pitch, filter or gate) and roughly how fast and how far it moves.',
    base: P_GATE, introUnlocked: [], scopes: true,
    challenges: [
      {
        title: 'Which wobble?',
        text: 'Press Hear target. The LFO is patched somewhere: is it moving the pitch (vibrato) or the filter (wah)? Patch it the same way and play the marked key. Only the cable has to match here, but you will need some FM Amount or CV Amount to hear it.',
        unlocked: ALL, start: P_GATE, compare: ['jack.osc.fm', 'jack.filt.cv'], showKey: true,
        make: (c) => ({ patch: c.pick([VIBRATO, WAH]), note: c.note }),
      },
      {
        title: 'Pluck or zap?',
        text: 'This time the Envelope is the modulator. Is it sweeping the filter (a pluck) or the pitch (a zap)? Patch it the same way.',
        unlocked: ALL, start: P_GATE, compare: ['jack.osc.fm', 'jack.filt.cv'], showKey: true,
        make: (c) => ({ patch: c.pick([PLUCK, ZAP]), note: c.note }),
      },
      {
        title: 'How fast does it repeat?',
        text: 'The LFO is playing the Envelope\'s Gate, so the note repeats on its own. Patch it the same way, then match the speed with the LFO\'s Rate.',
        unlocked: ALL, start: P_GATE, compare: ['jack.env.gate', 'lfo.shape', 'lfo.rate'], showKey: true,
        make: (c) => ({ patch: { ...cable('env.gate', 'lfo.out'), 'lfo.shape': 'square', 'lfo.rate': c.pick([2, 3, 5, 8]) }, note: c.note }),
      },
      {
        title: 'Vibrato: speed and depth',
        text: 'Vibrato again, but now match how fast it wobbles (LFO Rate) and how far (FM Amount).',
        unlocked: ALL, start: P_GATE, compare: ['jack.osc.fm', 'osc.fm', 'lfo.rate'], showKey: true,
        make: (c) => ({ patch: { ...cable('osc.fm', 'lfo.out'), 'osc.fm': c.level(0.05, 0.2), 'lfo.rate': c.pick([3, 4, 5.5, 7]) }, note: c.note }),
      },
      {
        title: 'Filter sweep',
        text: 'The Envelope is sweeping the filter. Patch it, then match where the sweep ends (Cutoff) and how far it goes (CV Amount).',
        unlocked: ALL, start: P_GATE, compare: ['jack.filt.cv', 'filt.cutoff', 'filt.cv'], showKey: true,
        make: (c) => ({ patch: { ...cable('filt.cv', 'env.out'), 'filt.cutoff': c.pick([150, 250, 400, 600]), 'filt.cv': c.level(0.4, 0.9), 'filt.res': 0.3, 'aenv.s': 0.3, 'aenv.d': 0.5 }, note: c.note }),
      },
      {
        title: 'The shape of the wobble',
        text: 'The LFO is moving the filter. Listen to the shape: a smooth rise and fall (triangle), a slow rise then a drop (ramp), or a jump between two places (square)? Match the cable, the Shape and the Rate.',
        unlocked: ALL, start: P_GATE, compare: ['jack.filt.cv', 'lfo.shape', 'lfo.rate'], showKey: true,
        make: (c) => ({ patch: { ...WAH, 'lfo.shape': c.pick(['tri', 'saw', 'square']), 'lfo.rate': c.pick([1.5, 3, 5]) }, note: c.note }),
      },
      {
        title: 'Mystery patch',
        text: 'Anything from the last two lessons: vibrato, wah, pluck, zap, a repeating gate, the VCO feeding its own FM, or the filter played on its own. Work out which, and patch it.',
        unlocked: ALL, start: P_GATE, compare: ['jack.osc.fm', 'jack.filt.cv', 'jack.env.gate', 'jack.filt.in'], showKey: true,
        make: (c) => ({ patch: c.pick([VIBRATO, WAH, PLUCK, ZAP, REPEAT, SELF_FM, FILTER_ONLY]), note: c.note }),
      },
      {
        title: 'Two at once',
        text: 'Two modulations are patched at the same time. Find both.',
        unlocked: ALL, start: P_GATE, compare: ['jack.osc.fm', 'jack.filt.cv', 'jack.env.gate'], showKey: true,
        make: (c) => {
          const [a, b] = c.pickDistinct([
            [VIBRATO, 'fm'], [ZAP, 'fm'], [WAH, 'cv'], [PLUCK, 'cv'], [REPEAT, 'gate'],
          ], 5).reduce((acc, x) => (acc.length < 2 && !acc.some((y) => y[1] === x[1]) ? [...acc, x] : acc), []); // two that use different inputs
          return { patch: { ...a[0], ...b[0] }, note: c.note };
        },
      },
    ],
  },
];
