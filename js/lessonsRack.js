// NF-Modular lessons: patching on the full rack, for students who have done the NF-MiniModular's
// lessons. Same challenge format as lessons.js. Each challenge starts from the rack's Init patch
// (plus any changes in 'start'), and is checked by its cables and settings.
// The last lesson, Fix the Patch, gives a broken patch and asks the student to find the fault.
//
// Cables are patch values: p['jack.vca1.cv'] lists the outputs plugged into VCA 1's CV input
// (several, comma-separated, are added together).

const ins = (p, input) => String(p['jack.' + input] || '').split(',').filter(Boolean);
const has = (p, input, out) => ins(p, input).includes(out);
const hasFrom = (p, input, prefix) => ins(p, input).some((o) => o.startsWith(prefix));
const only = (p, input, out) => ins(p, input).join(',') === out;
const played = (s) => s.note != null;
const share = (...bits) => bits.filter(Boolean).length / bits.length;
const semis = (p, n) => p[`osc${n}.range`] * 12 + p[`osc${n}.tune`];
const cable = (input, out) => ({ ['jack.' + input]: out });
// What the Mixer is really passing on: the outputs plugged into channels that are turned up.
// (Turning a channel down to 0 silences it just as well as pulling its cable out.)
const heard = (p) => [1, 2, 3, 4].flatMap((n) => (p[`mix.l${n}`] > 0.05 ? ins(p, `mix.in${n}`) : []));
const heardFrom = (p, prefix) => heard(p).some((o) => o.startsWith(prefix));
const heardOnly = (p, out) => heard(p).join(',') === out;
const detune = (p) => Math.abs(p['osc2.tune'] - p['osc1.tune']);
const slightDetune = (p) => detune(p) >= 0.03 && detune(p) <= 0.3;
// 'What sync does': VCO 1 syncs VCO 2, and ENV 2 sweeps VCO 2's pitch (through FM, or straight into Pitch)
const syncSwept = (p) => (has(p, 'vco2.fm', 'env2.out') && p['osc2.fm'] >= 0.5) || has(p, 'vco2.pitch', 'env2.out');
let sweptFrom = null; // how many notes had been played when the sweep was first patched
const highNote = (s) => s.note != null && s.note + semis(s.patch, 1) >= 71.5; // VCO 1 sounding at C5 or above

// 'A filter envelope': which ENV 2 shapes a new note has been played with, once the pluck is set up
let shapes = { heard: new Set(), notes: 0 };
const pluck = (p) => has(p, 'filt.cv', 'env2.out') && p['vcf.cv'] >= 0.5 && p['vcf.cutoff'] <= 159 && p['env2.d'] <= 0.5 && p['env2.s'] <= 0.2;

const ALL = ['seq', 'vco1', 'vco2', 'noise', 'mix', 'filt', 'ring', 'vca', 'att', 'out', 'env1', 'env2', 'lfo', 'mfo', 'sh', 'kb'];
const SCOPES = true;

// the sequencer patched in place of the keyboard and running (for the sequencer challenges)
const SEQ_PLAYING = {
  ...cable('vco1.pitch', 'seq.pitch'), ...cable('vco2.pitch', 'seq.pitch'), ...cable('env1.gate', 'seq.gate'), ...cable('env2.gate', 'seq.gate'),
  'seq.run': 'run', 'seq.s3': 7, 'seq.s5': 12,
};

// what every lesson starts from (on top of Init): a single VCO, so each step adds to something clear
const ONE_VCO = { ...cable('mix.in2', '') };

export const RACK_LESSONS = [
  {
    id: 'rack-vcos', number: 1, title: 'Two Oscillators',
    summary: 'Mix two VCOs, an octave apart; move a pulse with PWM; tear the tone with hard sync; and make bells with FM.',
    doneText: 'You layered two VCOs, used pulse-width modulation, hard sync and FM: the three classic ways two oscillators work together.',
    introUnlocked: [], scopes: SCOPES,
    challenges: [
      {
        type: 'goal', title: 'Both VCOs',
        text: 'Only VCO 1 is in the Mixer. Patch VCO 2\'s Saw into Mixer In 2, and play.',
        unlocked: ALL,
        make: (c) => ({ start: ONE_VCO, note: c.note }),
        check: (s) => hasFrom(s.patch, 'mix.in2', 'vco2.') && s.patch['mix.l2'] >= 3 && played(s),
        progress: (s) => share(hasFrom(s.patch, 'mix.in2', 'vco2.'), played(s)),
        hint: 'Drag from VCO 2\'s SAW socket to the Mixer\'s IN 2.',
      },
      {
        type: 'goal', title: 'An octave apart',
        text: 'Set VCO 2\'s Range one octave above or below VCO 1\'s, with both in the Mixer. Then detune it very slightly with Tune (between 0.03 and 0.3 of a semitone, up or down) so the two beat slowly against each other. Play.',
        unlocked: ALL,
        make: (c) => ({ start: { 'osc2.tune': 0 }, note: c.note }),
        check: (s) => Math.abs(s.patch['osc2.range'] - s.patch['osc1.range']) === 1 && slightDetune(s.patch) && hasFrom(s.patch, 'mix.in1', 'vco1.') && hasFrom(s.patch, 'mix.in2', 'vco2.') && played(s),
        progress: (s) => share(Math.abs(s.patch['osc2.range'] - s.patch['osc1.range']) === 1, slightDetune(s.patch), played(s)),
        hint: 'Turn VCO 2\'s Range knob one step, then nudge its Tune. Hold Shift while turning for fine control, and tick Show values to see the number.',
      },
      {
        type: 'goal', title: 'Pulse-width modulation',
        text: 'Listen to VCO 1\'s Pulse output instead of its Saw (Pulse into Mixer In 1, Saw out of it). To unplug a cable, double-click its plug, or drag the plug off and drop it on an empty part of the panel. Patch the LFO into VCO 1\'s PWM input, turn PWM Amount up past 40%, and slow the LFO below 3 Hz. Hold a note: the classic moving, chorus-like sound.',
        unlocked: ALL,
        make: (c) => ({ start: ONE_VCO, note: c.note }),
        check: (s) => only(s.patch, 'mix.in1', 'vco1.sq') && has(s.patch, 'vco1.pwm', 'lfo.out') && s.patch['osc1.pwm'] >= 0.4 && s.patch['lfo.rate'] <= 3 && s.held,
        progress: (s) => share(only(s.patch, 'mix.in1', 'vco1.sq'), has(s.patch, 'vco1.pwm', 'lfo.out'), s.patch['osc1.pwm'] >= 0.4, s.patch['lfo.rate'] <= 3),
        hint: 'Double-click the plug in Mixer IN 1 to unplug it, patch VCO 1\'s PULSE there instead, then LFO OUT to VCO 1\'s PWM.',
      },
      {
        type: 'goal', title: 'Hard sync',
        text: 'Patch VCO 1\'s Saw into VCO 2\'s Sync input. Listen to VCO 2 alone (unplug VCO 1 from the Mixer, or turn its Level down to 0), and tune VCO 2 at least 3 semitones above VCO 1 with Tune or Range. Play.',
        unlocked: ALL,
        make: (c) => ({ start: {}, note: c.note }),
        check: (s) => has(s.patch, 'vco2.sync', 'vco1.saw') && !heardFrom(s.patch, 'vco1.') && heardFrom(s.patch, 'vco2.') && semis(s.patch, 2) - semis(s.patch, 1) >= 3 && played(s),
        progress: (s) => share(has(s.patch, 'vco2.sync', 'vco1.saw'), !heardFrom(s.patch, 'vco1.') && heardFrom(s.patch, 'vco2.'), semis(s.patch, 2) - semis(s.patch, 1) >= 3),
        hint: 'VCO 1 SAW to VCO 2 SYNC. Take VCO 1 out of the Mixer, or turn Level 1 to 0. Turn VCO 2\'s Range up one step.',
      },
      {
        type: 'question', title: 'What sync does',
        text: 'Sync comes alive when VCO 2\'s pitch moves. Keep the sync patch, patch ENV 2\'s Out into VCO 2\'s FM input and turn VCO 2\'s FM Amount past 50%. Play a few notes: each one tears as ENV 2 sweeps.',
        unlocked: ALL,
        make: (c) => { sweptFrom = null; return { start: { ...cable('vco2.sync', 'vco1.saw'), ...cable('mix.in1', ''), ...cable('filt.cv', ''), 'osc2.range': 1, 'osc2.tune': 0, 'mix.l2': 8, 'vcf.cutoff': 6000, 'env2.d': 0.8, 'env2.s': 0 }, note: c.note }; },
        revealWhen: (s) => {
          if (!has(s.patch, 'vco2.sync', 'vco1.saw') || !syncSwept(s.patch)) { sweptFrom = null; return false; }
          if (sweptFrom === null) sweptFrom = s.notes;
          return s.notes - sweptFrom >= 2; // two notes heard with the sweep in place
        },
        progress: (s) => share(has(s.patch, 'vco2.sync', 'vco1.saw'), has(s.patch, 'vco2.fm', 'env2.out') || has(s.patch, 'vco2.pitch', 'env2.out'), syncSwept(s.patch), sweptFrom !== null && s.notes > sweptFrom),
        hint: 'Drag from ENV 2 OUT to VCO 2 FM, then turn VCO 2\'s FM Amount up past halfway. Play several notes.',
        question: {
          prompt: 'What changes during each note, as ENV 2 sweeps VCO 2\'s pitch?',
          options: [
            { text: 'The tone, not the note: VCO 2 keeps restarting at VCO 1\'s pitch', correct: true },
            { text: 'The note goes up and down', feedback: 'Listen to the pitch itself: does the note you hear actually move?' },
          ],
          explain: 'Each cycle of VCO 1 restarts VCO 2\'s wave, so the note heard is VCO 1\'s. VCO 2\'s own pitch decides how much of its wave fits in before each restart, which changes the harmonics: the bright, tearing "sync" sound.',
        },
      },
      {
        type: 'goal', title: 'FM bell',
        text: 'Patch VCO 2\'s Tri into VCO 1\'s FM input and turn VCO 1\'s FM Amount up past 30%. Give VCO 2 a different Range from VCO 1, and make ENV 1 bell-like: Decay of a second or more, Sustain under 10%. Bells are high: hold a note that sounds at C5 or above (an octave over middle C), from a high key or by raising VCO 1\'s Range. Listen to VCO 1 alone.',
        unlocked: ALL,
        make: (c) => ({ start: { ...ONE_VCO, ...cable('mix.in1', 'vco1.tri') }, note: c.note }),
        check: (s) => has(s.patch, 'vco1.fm', 'vco2.tri') && s.patch['osc1.fm'] >= 0.3 && s.patch['osc2.range'] !== s.patch['osc1.range'] && s.patch['env1.d'] >= 1 && s.patch['env1.s'] <= 0.1 && highNote(s) && s.held,
        progress: (s) => share(has(s.patch, 'vco1.fm', 'vco2.tri'), s.patch['osc1.fm'] >= 0.3, s.patch['osc2.range'] !== s.patch['osc1.range'], s.patch['env1.d'] >= 1, s.patch['env1.s'] <= 0.1, highNote(s)),
        hint: 'VCO 2 TRI to VCO 1 FM. FM Amount up. VCO 2 Range a step or two above VCO 1\'s. ENV 1: Decay long, Sustain at 0. For a high note, press X to move the computer keys up an octave, or turn VCO 1\'s Range up.',
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'rack-vcf', number: 2, title: 'The Multimode Filter',
    summary: 'Low-pass, band-pass and high-pass; Width; playing the filter in tune with Key; and moving the resonance with an envelope.',
    doneText: 'You heard all three filter outputs, shaped a band-pass with Width, played a self-oscillating filter through its Key input, and made the resonance move.',
    introUnlocked: [], scopes: SCOPES,
    challenges: [
      {
        type: 'goal', title: 'High-pass',
        text: 'VCA 1 is listening to the VCF\'s LP output. Swap it for the HP output (lift the LP cable from VCA 1\'s In first), turn Cutoff up past 50%, and play: the bass has gone.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', '') }, note: c.note }),
        check: (s) => only(s.patch, 'vca1.in', 'filt.hp') && s.patch['vcf.cutoff'] >= 632 && played(s),
        progress: (s) => share(only(s.patch, 'vca1.in', 'filt.hp'), s.patch['vcf.cutoff'] >= 632),
        hint: 'Drag the plug out of VCA 1\'s IN and drop it on nothing. Then VCF HP to VCA 1 IN. Cutoff past halfway.',
      },
      {
        type: 'goal', title: 'Band-pass and Width',
        text: 'Now listen to BP. Set Width to at least 2 octaves and Resonance to at least 40%, then sweep Cutoff while holding a note: a talking, vocal sound.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', '') }, note: c.note }),
        check: (s) => only(s.patch, 'vca1.in', 'filt.bp') && s.patch['vcf.width'] >= 2 && s.patch['vcf.res'] >= 0.4 && s.held,
        progress: (s) => share(only(s.patch, 'vca1.in', 'filt.bp'), s.patch['vcf.width'] >= 2, s.patch['vcf.res'] >= 0.4, s.held),
        hint: 'VCF BP into VCA 1 IN (and nothing else there). Width to 2 or more, Resonance up.',
      },
      {
        type: 'question', title: 'What Width does',
        text: 'Keep listening to BP. Turn Width from 0 to 6 and back while holding a note.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', ''), ...cable('vca1.in', 'filt.bp'), 'vcf.res': 0.3 }, note: c.note }),
        revealWhen: (s) => s.patch['vcf.width'] >= 4 && s.held,
        progress: (s) => Math.min(1, s.patch['vcf.width'] / 4),
        hint: 'Hold a key and turn Width all the way up.',
        question: {
          prompt: 'Turning Width up made the band-pass sound…',
          options: [
            { text: 'Fuller: more frequencies get through', correct: true },
            { text: 'Thinner', feedback: 'Watch the spectrum: is the band getting wider or narrower?' },
          ],
          explain: 'Width moves the high-pass down and the low-pass up. The band-pass keeps what lies between them, so a wider gap lets more through. At 0 it is a narrow, nasal peak.',
        },
      },
      {
        type: 'goal', title: 'Play the filter',
        text: 'Take the VCOs out of the Mixer, turn Resonance fully up, and patch the Keyboard\'s Pitch into the VCF\'s Key input. Play notes an octave apart: the filter whistles in tune.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', ''), 'vcf.cutoff': 262 }, note: c.note }),
        check: (s) => !heardFrom(s.patch, 'vco') && s.patch['vcf.res'] >= 0.95 && has(s.patch, 'filt.key', 'kb.pitch') && s.highNote - s.lowNote >= 12,
        progress: (s) => share(!heardFrom(s.patch, 'vco'), s.patch['vcf.res'] >= 0.95, has(s.patch, 'filt.key', 'kb.pitch'), s.highNote - s.lowNote >= 12),
        hint: 'Lift both VCO cables out of the Mixer. Resonance to the top. Keyboard PITCH to VCF KEY (the Keyboard\'s Pitch can feed several inputs).',
      },
      {
        type: 'goal', title: 'Moving resonance',
        text: 'Patch ENV 2 into the VCF\'s Res input, keep Resonance low (under 20%), give ENV 2 a short Decay (under 0.4 s) and no Sustain, and play: each note starts with a resonant zap.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', ''), 'vcf.cutoff': 800 }, note: c.note }),
        check: (s) => has(s.patch, 'filt.res', 'env2.out') && s.patch['vcf.res'] <= 0.2 && s.patch['env2.d'] <= 0.4 && s.patch['env2.s'] <= 0.05 && played(s),
        progress: (s) => share(has(s.patch, 'filt.res', 'env2.out'), s.patch['vcf.res'] <= 0.2, s.patch['env2.d'] <= 0.4, s.patch['env2.s'] <= 0.05),
        hint: 'ENV 2 OUT to VCF RES. ENV 2: Decay short, Sustain fully down.',
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'rack-envvca', number: 3, title: 'Two Envelopes, Two VCAs',
    summary: 'Separate envelopes for volume and tone, the inverted envelope, and the big idea: a VCA can control a modulation, not just a sound.',
    doneText: 'You gave the filter its own envelope, heard how Linear and Exponential shapes differ, swept it backwards with Inv, made vibrato that fades in using a VCA, and layered tremolo over an envelope with both VCAs.',
    introUnlocked: [], scopes: SCOPES,
    challenges: [
      {
        type: 'goal', title: 'A filter envelope',
        text: 'Nothing is moving the filter. Patch ENV 2 into the VCF\'s CV, turn CV Amount past 50% and Cutoff below 30%, and make ENV 2 short (Decay under 0.5 s, Sustain under 20%). Play: a pluck. ENV 2 is Linear, falling at a steady speed. Now click the word Linear in its title to make it Exponential, fast at first and then easing off, and play again: the same times, a snappier pluck.',
        unlocked: ALL,
        make: (c) => { shapes = { heard: new Set(), notes: 0 }; return { start: { ...cable('filt.cv', '') }, note: c.note }; },
        check: (s) => {
          if (s.notes > shapes.notes) { shapes.notes = s.notes; if (pluck(s.patch)) shapes.heard.add(s.patch['env2.curve']); } // a new note
          return pluck(s.patch) && shapes.heard.size === 2;
        },
        progress: (s) => share(has(s.patch, 'filt.cv', 'env2.out'), s.patch['vcf.cv'] >= 0.5, s.patch['vcf.cutoff'] <= 159, s.patch['env2.d'] <= 0.5 && s.patch['env2.s'] <= 0.2, shapes.heard.size >= 1, shapes.heard.size === 2),
        hint: 'ENV 2 OUT to VCF CV. CV Amount past +50%. Cutoff low. ENV 2 Decay short and Sustain low. Play a note, click the word LINEAR beside ENV 2 so it says EXPONENTIAL, and play another.',
      },
      {
        type: 'goal', title: 'Backwards',
        text: 'Swap ENV 2 Out for ENV 2 Inv in the VCF\'s CV, and turn Cutoff up past 75%. Play: each note starts muffled and opens up.',
        unlocked: ALL,
        make: (c) => ({ start: { 'vcf.cv': 0.6, 'env2.d': 0.8, 'env2.s': 0 }, note: c.note }),
        check: (s) => only(s.patch, 'filt.cv', 'env2.inv') && s.patch['vcf.cutoff'] >= 3557 && played(s),
        progress: (s) => share(only(s.patch, 'filt.cv', 'env2.inv'), s.patch['vcf.cutoff'] >= 3557),
        hint: 'Lift ENV 2 OUT\'s cable from VCF CV, patch ENV 2 INV there instead, and turn Cutoff up.',
      },
      {
        type: 'goal', title: 'Delayed vibrato',
        text: 'A VCA can control a modulation. Patch the LFO into VCA 2\'s In, ENV 2 into VCA 2\'s CV, and VCA 2\'s Out into VCO 1\'s and VCO 2\'s FM inputs. Keep VCA 2\'s Level at 0, give the VCOs a little FM Amount (5–15%), and ENV 2 a slow Attack (0.8 s or more). Hold a long note: the vibrato fades in.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', ''), 'lfo.rate': 5.5, 'lfo.shape': 'sine', 'env2.s': 1 }, note: c.note }),
        check: (s) => has(s.patch, 'vca2.in', 'lfo.out') && has(s.patch, 'vca2.cv', 'env2.out') && has(s.patch, 'vco1.fm', 'vca2.out') && has(s.patch, 'vco2.fm', 'vca2.out') && s.patch['vca2.level'] <= 0.05 && s.patch['osc1.fm'] >= 0.05 && s.patch['osc1.fm'] <= 0.15 && s.patch['env2.a'] >= 0.8 && s.held,
        progress: (s) => share(has(s.patch, 'vca2.in', 'lfo.out'), has(s.patch, 'vca2.cv', 'env2.out'), has(s.patch, 'vco1.fm', 'vca2.out') && has(s.patch, 'vco2.fm', 'vca2.out'), s.patch['osc1.fm'] >= 0.05 && s.patch['osc1.fm'] <= 0.15, s.patch['env2.a'] >= 0.8),
        hint: 'LFO OUT to VCA 2 IN. ENV 2 OUT to VCA 2 CV. VCA 2 OUT to both VCO FM inputs (an output can feed several). Then the knobs.',
      },
      {
        type: 'question', title: 'What VCA 2 is doing',
        text: 'Look at the patch you just made.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', ''), ...cable('vca2.in', 'lfo.out'), ...cable('vca2.cv', 'env2.out'), ...cable('vco1.fm', 'vca2.out'), ...cable('vco2.fm', 'vca2.out'), 'osc1.fm': 0.1, 'osc2.fm': 0.1, 'env2.a': 1.2, 'env2.s': 1, 'lfo.rate': 5.5 }, note: c.note }),
        question: {
          prompt: 'In that patch, what is VCA 2 controlling?',
          options: [
            { text: 'How much of the LFO reaches the pitch, opened slowly by ENV 2', correct: true },
            { text: 'How loud the note is', feedback: 'Trace the cables: where does VCA 2\'s Out go? Not to the Output.' },
            { text: 'How fast the LFO runs', feedback: 'The LFO\'s speed is still set by its Rate knob.' },
          ],
          explain: 'A VCA multiplies whatever is in its In by its CV. Here the In is the LFO, so VCA 2 is a "how much vibrato" control, turned up by ENV 2. Anything can go through a VCA, sound or control signals.',
        },
      },
      {
        type: 'goal', title: 'Envelope and tremolo',
        text: 'Use both VCAs in a row: patch VCA 1\'s Out into VCA 2\'s In and VCA 2\'s Out into the Output (instead of VCA 1). Patch the LFO into VCA 2\'s CV. Set VCA 2\'s Level between 40% and 80% and CV Amount between 20% and 60%. Hold a note: the envelope shapes it and the LFO pulses it.',
        unlocked: ALL,
        make: (c) => ({ start: { 'lfo.rate': 5, 'lfo.shape': 'sine' }, note: c.note }),
        check: (s) => has(s.patch, 'vca2.in', 'vca1.out') && only(s.patch, 'out.in', 'vca2.out') && has(s.patch, 'vca2.cv', 'lfo.out') && s.patch['vca2.level'] >= 0.4 && s.patch['vca2.level'] <= 0.8 && s.patch['vca2.cv'] >= 0.2 && s.patch['vca2.cv'] <= 0.6 && s.held,
        progress: (s) => share(has(s.patch, 'vca2.in', 'vca1.out'), only(s.patch, 'out.in', 'vca2.out'), has(s.patch, 'vca2.cv', 'lfo.out'), s.patch['vca2.level'] >= 0.4 && s.patch['vca2.level'] <= 0.8, s.patch['vca2.cv'] >= 0.2 && s.patch['vca2.cv'] <= 0.6),
        hint: 'VCA 1 OUT to VCA 2 IN. Lift VCA 1\'s cable from the Output and patch VCA 2 OUT there. LFO OUT to VCA 2 CV. Then VCA 2\'s two knobs.',
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'rack-utils', number: 4, title: 'Utilities',
    summary: 'The Attenuverter as a transposer, an inverter and a "how much" knob, and several cables into one input.',
    doneText: 'You transposed with a steady voltage, inverted and scaled control signals, and added two modulations together in one input.',
    introUnlocked: [], scopes: SCOPES,
    challenges: [
      {
        type: 'goal', title: 'Up an octave',
        text: 'A steady voltage of +1 is one octave. With nothing in its In, the Attenuverter\'s Out is a steady voltage set by its Amount. Patch Out 1 into both VCOs\' Pitch inputs alongside the Keyboard\'s Pitch, set Amount 1 to +100%, and play: everything is an octave higher.',
        unlocked: ALL,
        make: (c) => ({ start: {}, note: c.note }),
        check: (s) => ['vco1.pitch', 'vco2.pitch'].every((i) => has(s.patch, i, 'kb.pitch') && has(s.patch, i, 'att.out1')) && s.patch['att.a1'] >= 0.97 && !s.patch['jack.att.in1'] && played(s),
        progress: (s) => share(has(s.patch, 'vco1.pitch', 'att.out1'), has(s.patch, 'vco2.pitch', 'att.out1'), s.patch['att.a1'] >= 0.97),
        hint: 'Drag from Attenuverter OUT 1 to VCO 1 PITCH, then again to VCO 2 PITCH (the keyboard cables stay). Amount 1 fully right.',
      },
      {
        type: 'goal', title: 'Up a fifth',
        text: 'A fifth is 7 semitones: 7/12 of a volt. Keep the patch, and set Amount 1 to +58% (between 56% and 61%). Play.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('vco1.pitch', 'kb.pitch,att.out1'), ...cable('vco2.pitch', 'kb.pitch,att.out1'), 'att.a1': 1 }, note: c.note }),
        check: (s) => has(s.patch, 'vco1.pitch', 'att.out1') && s.patch['att.a1'] >= 0.56 && s.patch['att.a1'] <= 0.61 && played(s),
        progress: (s) => Math.max(0, 1 - Math.abs(s.patch['att.a1'] - 0.583) * 4),
        hint: 'Turn on Show values and set Amount 1 to +58%.',
      },
      {
        type: 'goal', title: 'Turn a wobble over',
        text: 'Patch the LFO through Attenuverter channel 2 (LFO Out to In 2) and Out 2 into the VCF\'s CV, with Amount 2 at −90% or lower. Turn the LFO\'s Shape to ramp and listen: the ramp now falls instead of rising.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', ''), 'vcf.cv': 0.5, 'vcf.cutoff': 600, 'vcf.res': 0.4, 'lfo.rate': 2 }, note: c.note }),
        check: (s) => has(s.patch, 'att.in2', 'lfo.out') && has(s.patch, 'filt.cv', 'att.out2') && s.patch['att.a2'] <= -0.9 && s.patch['lfo.shape'] === 'saw' && s.held,
        progress: (s) => share(has(s.patch, 'att.in2', 'lfo.out'), has(s.patch, 'filt.cv', 'att.out2'), s.patch['att.a2'] <= -0.9, s.patch['lfo.shape'] === 'saw'),
        hint: 'LFO OUT to Attenuverter IN 2, OUT 2 to VCF CV. Amount 2 fully left. LFO Shape to the ramp.',
      },
      {
        type: 'goal', title: 'Two modulations in one input',
        text: 'Several cables in one input are added together. Patch both ENV 2 and the LFO into the VCF\'s CV, and hold a note: the envelope\'s sweep with a wobble on top.',
        unlocked: ALL,
        make: (c) => ({ start: { 'vcf.cutoff': 400, 'vcf.res': 0.4, 'lfo.rate': 4 }, note: c.note }),
        check: (s) => has(s.patch, 'filt.cv', 'env2.out') && has(s.patch, 'filt.cv', 'lfo.out') && s.held,
        progress: (s) => share(has(s.patch, 'filt.cv', 'env2.out'), has(s.patch, 'filt.cv', 'lfo.out'), s.held),
        hint: 'ENV 2 is already in VCF CV. Drag a second cable from LFO OUT to the same VCF CV socket.',
      },
      {
        type: 'goal', title: 'Half the sweep',
        text: 'Route ENV 2 to the VCF\'s CV through Attenuverter channel 1 (ENV 2 Out to In 1, Out 1 to VCF CV, and nothing else in VCF CV), with Amount 1 between 40% and 60%: the same envelope, half the sweep.',
        unlocked: ALL,
        make: (c) => ({ start: { 'vcf.cutoff': 300, 'vcf.cv': 0.8, 'env2.d': 0.6, 'env2.s': 0.1 }, note: c.note }),
        check: (s) => has(s.patch, 'att.in1', 'env2.out') && only(s.patch, 'filt.cv', 'att.out1') && s.patch['att.a1'] >= 0.4 && s.patch['att.a1'] <= 0.6 && played(s),
        progress: (s) => share(has(s.patch, 'att.in1', 'env2.out'), only(s.patch, 'filt.cv', 'att.out1'), s.patch['att.a1'] >= 0.4 && s.patch['att.a1'] <= 0.6),
        hint: 'Lift ENV 2\'s cable out of VCF CV. ENV 2 OUT to Attenuverter IN 1, OUT 1 to VCF CV. Amount 1 about +50%.',
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'rack-random', number: 5, title: 'Randomness',
    summary: 'Sample & Hold for random filter steps, wandering curves and random melodies, and noise that swishes like the sea.',
    doneText: 'You made random bleeps, a wandering random LFO, a random melody scaled by the Attenuverter, and the sound of waves.',
    introUnlocked: [], scopes: SCOPES,
    challenges: [
      {
        type: 'goal', title: 'Random bleeps',
        text: 'Patch the S&H Out into the VCF\'s CV (instead of ENV 2), Resonance at least 50%, CV Amount at least 30%. Hold a note.',
        unlocked: ALL,
        make: (c) => ({ start: { 'vcf.cutoff': 700 }, note: c.note }),
        check: (s) => only(s.patch, 'filt.cv', 'sh.out') && s.patch['vcf.res'] >= 0.5 && s.patch['vcf.cv'] >= 0.3 && s.held,
        progress: (s) => share(only(s.patch, 'filt.cv', 'sh.out'), s.patch['vcf.res'] >= 0.5, s.patch['vcf.cv'] >= 0.3),
        hint: 'Lift ENV 2\'s cable from VCF CV; patch S&H OUT there. Resonance and CV Amount up.',
      },
      {
        type: 'goal', title: 'Wander',
        text: 'Smooth the steps: S&H Lag at least 0.3 s and Speed at 3 or slower. Hold a note: a slow, random drift.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', 'sh.out'), 'vcf.cutoff': 700, 'vcf.res': 0.5, 'vcf.cv': 0.4 }, note: c.note }),
        check: (s) => has(s.patch, 'filt.cv', 'sh.out') && s.patch['sh.lag'] >= 0.3 && s.patch['sh.rate'] <= 3 && s.held,
        progress: (s) => share(s.patch['sh.lag'] >= 0.3, s.patch['sh.rate'] <= 3, s.held),
        hint: 'S&H: Lag up, Speed down.',
      },
      {
        type: 'goal', title: 'Random melody',
        text: 'Replace the keyboard as the pitch: S&H Out into Attenuverter In 1, Out 1 into both VCOs\' Pitch inputs (and take the Keyboard\'s Pitch out of them). Set Amount 1 between 15% and 50% to keep the notes in a small range. Hold a key: a new random note at every step.',
        unlocked: ALL,
        make: (c) => ({ start: { 'sh.rate': 4 }, note: c.note }),
        check: (s) => has(s.patch, 'att.in1', 'sh.out') && only(s.patch, 'vco1.pitch', 'att.out1') && only(s.patch, 'vco2.pitch', 'att.out1') && s.patch['att.a1'] >= 0.15 && s.patch['att.a1'] <= 0.5 && s.held,
        progress: (s) => share(has(s.patch, 'att.in1', 'sh.out'), only(s.patch, 'vco1.pitch', 'att.out1'), only(s.patch, 'vco2.pitch', 'att.out1'), s.patch['att.a1'] >= 0.15 && s.patch['att.a1'] <= 0.5),
        hint: 'S&H OUT to Attenuverter IN 1. Lift the Keyboard\'s cables from both VCO PITCH inputs, and patch Attenuverter OUT 1 into both.',
      },
      {
        type: 'goal', title: 'The sea',
        text: 'Noise only: Noise Colour into Mixer In 1 and nothing else in the Mixer. Open VCA 1 by hand (Level 50%+) so it plays without a key, and patch a slow LFO (0.3 Hz or slower) into the Noise\'s Colour CV.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', ''), 'vcf.cutoff': 20000 }, note: c.note }),
        check: (s) => heardOnly(s.patch, 'noise.col') && s.patch['vca1.level'] >= 0.5 && has(s.patch, 'noise.cv', 'lfo.out') && s.patch['lfo.rate'] <= 0.3,
        progress: (s) => share(heardFrom(s.patch, 'noise.col'), heardOnly(s.patch, 'noise.col'), s.patch['vca1.level'] >= 0.5, has(s.patch, 'noise.cv', 'lfo.out'), s.patch['lfo.rate'] <= 0.3),
        hint: 'Lift both VCO cables from the Mixer; Noise COLOUR to IN 1. VCA 1 Level up. LFO OUT to Noise CV, LFO Rate right down.',
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'rack-drums', number: 6, title: 'Drums from Scratch',
    summary: 'A kick from a falling pitch, a hi-hat from filtered noise, and a snare from tone and noise with their own envelopes.',
    doneText: 'You built a kick, a hi-hat and a snare from nothing but oscillators, noise, envelopes and VCAs: the recipe behind every analogue drum machine.',
    introUnlocked: [], scopes: SCOPES,
    challenges: [
      {
        type: 'goal', title: 'Kick',
        text: 'A kick is a low tone whose pitch drops fast. Use VCO 1\'s Tri alone in the Mixer, with nothing in its Pitch (so every key is the same drum) and its Range at −1 or lower. Patch ENV 2 into VCO 1\'s FM (FM Amount 40%+), make ENV 2 very short (Decay up to 0.2 s, no Sustain) and ENV 1 short too (Decay 0.2–0.6 s, no Sustain). Play.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', ''), 'vcf.cutoff': 4000 }, note: c.note }),
        check: (s) => heardOnly(s.patch, 'vco1.tri') && !ins(s.patch, 'vco1.pitch').length && s.patch['osc1.range'] <= -1 && has(s.patch, 'vco1.fm', 'env2.out') && s.patch['osc1.fm'] >= 0.4 && s.patch['env2.d'] <= 0.2 && s.patch['env2.s'] <= 0.05 && s.patch['env1.d'] >= 0.2 && s.patch['env1.d'] <= 0.6 && s.patch['env1.s'] <= 0.05 && played(s),
        progress: (s) => share(heardOnly(s.patch, 'vco1.tri'), !ins(s.patch, 'vco1.pitch').length, s.patch['osc1.range'] <= -1, has(s.patch, 'vco1.fm', 'env2.out') && s.patch['osc1.fm'] >= 0.4, s.patch['env2.d'] <= 0.2 && s.patch['env2.s'] <= 0.05, s.patch['env1.d'] >= 0.2 && s.patch['env1.d'] <= 0.6 && s.patch['env1.s'] <= 0.05),
        hint: 'Mixer: only VCO 1 TRI. Lift the Keyboard cable from VCO 1 PITCH. ENV 2 OUT to VCO 1 FM. Both envelopes: Sustain 0, short Decays.',
      },
      {
        type: 'goal', title: 'Hi-hat',
        text: 'Noise (any of its outputs) into the Mixer with no VCOs, VCA 1 listening to the VCF\'s HP output, Cutoff above 5 kHz, and ENV 1 very short (Decay up to 0.12 s, no Sustain). Play.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', '') }, note: c.note }),
        check: (s) => heardFrom(s.patch, 'noise.') && !heardFrom(s.patch, 'vco') && only(s.patch, 'vca1.in', 'filt.hp') && s.patch['vcf.cutoff'] >= 5000 && s.patch['env1.d'] <= 0.12 && s.patch['env1.s'] <= 0.05 && played(s),
        progress: (s) => share(heardFrom(s.patch, 'noise.'), !heardFrom(s.patch, 'vco'), only(s.patch, 'vca1.in', 'filt.hp'), s.patch['vcf.cutoff'] >= 5000, s.patch['env1.d'] <= 0.12 && s.patch['env1.s'] <= 0.05),
        hint: 'Replace both VCO cables in the Mixer with a Noise output. VCF HP to VCA 1 IN (lift the LP cable). Cutoff high. ENV 1: tiny Decay, no Sustain.',
      },
      {
        type: 'goal', title: 'Snare',
        text: 'A snare is two layers with their own envelopes. VCA 1: a VCO into its In, ENV 1 into its CV. VCA 2: Noise into its In, ENV 2 into its CV. Both VCA Outs into the Output (both cables in its In). Give both envelopes no Sustain and short Decays (up to 0.3 s). Set ENV 2 to Exponential as well (click the word in its title): loudness that fades exponentially sounds natural, like a real drum dying away. Play.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', '') }, note: c.note }),
        check: (s) => hasFrom(s.patch, 'vca1.in', 'vco') && has(s.patch, 'vca1.cv', 'env1.out') && hasFrom(s.patch, 'vca2.in', 'noise.') && has(s.patch, 'vca2.cv', 'env2.out') && has(s.patch, 'out.in', 'vca1.out') && has(s.patch, 'out.in', 'vca2.out') && s.patch['env1.s'] <= 0.05 && s.patch['env2.s'] <= 0.05 && s.patch['env1.d'] <= 0.3 && s.patch['env2.d'] <= 0.3 && s.patch['env1.curve'] === 'curved' && s.patch['env2.curve'] === 'curved' && played(s),
        progress: (s) => share(hasFrom(s.patch, 'vca1.in', 'vco'), hasFrom(s.patch, 'vca2.in', 'noise.') && has(s.patch, 'vca2.cv', 'env2.out'), has(s.patch, 'out.in', 'vca1.out') && has(s.patch, 'out.in', 'vca2.out'), s.patch['env1.s'] <= 0.05 && s.patch['env2.s'] <= 0.05, s.patch['env1.d'] <= 0.3 && s.patch['env2.d'] <= 0.3, s.patch['env1.curve'] === 'curved' && s.patch['env2.curve'] === 'curved'),
        hint: 'Lift the VCF cable from VCA 1 IN and patch a VCO Tri there. Noise to VCA 2 IN, ENV 2 to VCA 2 CV, VCA 2 OUT into the Output\'s IN as well as VCA 1. Then the envelopes: no Sustain, short Decays, and both saying EXPONENTIAL.',
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'rack-audio', number: 7, title: 'Audio-Rate Modulation',
    summary: 'When a modulator runs fast enough to hear, it stops wobbling and starts changing the tone: growls, bells, swirls and folds.',
    doneText: 'You made a growl with the MFO, bells with the ring modulator, a swirling through-zero patch, and folded a wave harder with an envelope.',
    introUnlocked: [], scopes: SCOPES,
    challenges: [
      {
        type: 'goal', title: 'Growl',
        text: 'Patch the MFO into the VCF\'s CV, turn the MFO\'s Rate above 30 Hz and CV Amount past 30%. Hold a low note.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', ''), 'vcf.cutoff': 400, 'vcf.res': 0.5, 'osc1.range': -1, 'osc2.range': -1 }, note: c.note }),
        check: (s) => has(s.patch, 'filt.cv', 'lfo2.out') && s.patch['lfo2.rate'] >= 30 && s.patch['vcf.cv'] >= 0.3 && s.held,
        progress: (s) => share(has(s.patch, 'filt.cv', 'lfo2.out'), s.patch['lfo2.rate'] >= 30, s.patch['vcf.cv'] >= 0.3),
        hint: 'MFO OUT to VCF CV. MFO Rate well up. CV Amount up.',
      },
      {
        type: 'goal', title: 'Ring bells',
        text: 'VCO 1 into the Ring Mod\'s In A and VCO 2 into In B, the Ring Mod\'s Out as the only thing in the Mixer, Mix fully to A×B (90%+), and VCO 2 tuned to a non-octave interval (not a multiple of 12 semitones from VCO 1). Play.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', ''), 'vcf.cutoff': 8000 }, note: c.note }),
        check: (s) => hasFrom(s.patch, 'ring.a', 'vco1.') && hasFrom(s.patch, 'ring.b', 'vco2.') && heardOnly(s.patch, 'ring.out') && s.patch['ring.mix'] >= 0.9 && Math.abs(((semis(s.patch, 2) - semis(s.patch, 1)) % 12 + 12) % 12) >= 0.5 && played(s),
        progress: (s) => share(hasFrom(s.patch, 'ring.a', 'vco1.') && hasFrom(s.patch, 'ring.b', 'vco2.'), heardOnly(s.patch, 'ring.out'), s.patch['ring.mix'] >= 0.9, Math.abs(((semis(s.patch, 2) - semis(s.patch, 1)) % 12 + 12) % 12) >= 0.5),
        hint: 'VCO 1 to RING IN A, VCO 2 to IN B. Lift both VCO cables from the Mixer; RING OUT to Mixer IN 1. Turn VCO 2\'s Tune to something like +3 or +4.',
      },
      {
        type: 'goal', title: 'Through zero',
        text: 'Patch the LFO into the MFO\'s FM input, FM Amount at least 40%, switch FM to TZ, and use the MFO on the VCF\'s CV. Hold a note: the movement swirls, slowing, stopping and running backwards.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', ''), 'vcf.cutoff': 500, 'vcf.res': 0.5, 'vcf.cv': 0.4, 'lfo2.rate': 3, 'lfo.rate': 0.3 }, note: c.note }),
        check: (s) => has(s.patch, 'lfo2.fm', 'lfo.out') && s.patch['lfo2.fm'] >= 0.4 && s.patch['lfo2.fmmode'] === 'tz' && has(s.patch, 'filt.cv', 'lfo2.out') && s.held,
        progress: (s) => share(has(s.patch, 'lfo2.fm', 'lfo.out'), s.patch['lfo2.fm'] >= 0.4, s.patch['lfo2.fmmode'] === 'tz', has(s.patch, 'filt.cv', 'lfo2.out')),
        hint: 'LFO OUT to MFO FM. FM Amt up. FM switch to TZ. MFO OUT to VCF CV.',
      },
      {
        type: 'goal', title: 'Fold with an envelope',
        text: 'The harder the Mixer is pushed in Fold mode, the more the wave folds. Put a VCA before it: VCO 1\'s Tri into VCA 2\'s In, ENV 2 into VCA 2\'s CV, and VCA 2\'s Out into Mixer In 1 (alone, at a Level of 10.5 or more). Mode on Fold. Play: each note starts bright and metallic, then smooths out.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', ''), 'vcf.cutoff': 12000, 'env2.d': 0.6, 'env2.s': 0.1 }, note: c.note }),
        check: (s) => has(s.patch, 'vca2.in', 'vco1.tri') && has(s.patch, 'vca2.cv', 'env2.out') && only(s.patch, 'mix.in1', 'vca2.out') && heardOnly(s.patch, 'vca2.out') && s.patch['mix.l1'] >= 10.5 && s.patch['mix.mode'] === 'fold' && played(s),
        progress: (s) => share(has(s.patch, 'vca2.in', 'vco1.tri'), has(s.patch, 'vca2.cv', 'env2.out'), only(s.patch, 'mix.in1', 'vca2.out') && heardOnly(s.patch, 'vca2.out'), s.patch['mix.l1'] >= 10.5, s.patch['mix.mode'] === 'fold'),
        hint: 'VCO 1 TRI to VCA 2 IN; ENV 2 OUT to VCA 2 CV; Mixer IN 1: only VCA 2 OUT (and nothing in IN 2). Level 1 near 11; Mode to Fold.',
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'rack-self', number: 8, title: 'Self-Playing Patches',
    summary: 'Make the rack play itself: an LFO as the gate, the keyboard\'s Trig as a clock, and a little generative patch.',
    doneText: 'You let an LFO play the notes, used Trig to clock the S&H, and built a patch that plays forever on its own.',
    introUnlocked: [], scopes: SCOPES,
    challenges: [
      {
        type: 'goal', title: 'The LFO presses the keys',
        text: 'Set the LFO\'s Shape to square and patch it into both envelopes\' Gate inputs (instead of the keyboard). Now it plays on its own.',
        unlocked: ALL,
        make: (c) => ({ start: { 'lfo.rate': 3 }, note: c.note }),
        check: (s) => s.patch['lfo.shape'] === 'square' && only(s.patch, 'env1.gate', 'lfo.out') && only(s.patch, 'env2.gate', 'lfo.out'),
        progress: (s) => share(s.patch['lfo.shape'] === 'square', only(s.patch, 'env1.gate', 'lfo.out'), only(s.patch, 'env2.gate', 'lfo.out')),
        hint: 'LFO Shape to square. Lift the Keyboard cables from ENV 1 GATE and ENV 2 GATE, and patch LFO OUT into both.',
      },
      {
        type: 'goal', title: 'One new value per note',
        text: 'Patch the Keyboard\'s Trig into the S&H Clock and the S&H Out into the VCF\'s CV. Play several notes: each gets its own random tone.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('filt.cv', ''), 'vcf.cutoff': 600, 'vcf.res': 0.5, 'vcf.cv': 0.4 }, note: c.note }),
        check: (s) => has(s.patch, 'sh.clock', 'kb.trig') && has(s.patch, 'filt.cv', 'sh.out') && s.notes >= 4,
        progress: (s) => share(has(s.patch, 'sh.clock', 'kb.trig'), has(s.patch, 'filt.cv', 'sh.out'), s.notes >= 4),
        hint: 'Keyboard TRIG to S&H CLOCK. S&H OUT to VCF CV. Play four notes or more.',
      },
      {
        type: 'goal', title: 'A patch that plays itself',
        text: 'Combine it all: a square LFO gating both envelopes and clocking the S&H; the S&H through Attenuverter channel 1 (Amount 15–50%) into both VCOs\' Pitch, with the keyboard out of them. Leave it playing.',
        unlocked: ALL,
        make: (c) => ({ start: { 'lfo.rate': 4, 'vcf.cutoff': 800, 'vcf.cv': 0.4 }, note: c.note }),
        check: (s) => s.patch['lfo.shape'] === 'square' && has(s.patch, 'env1.gate', 'lfo.out') && has(s.patch, 'sh.clock', 'lfo.out') && has(s.patch, 'att.in1', 'sh.out') && only(s.patch, 'vco1.pitch', 'att.out1') && only(s.patch, 'vco2.pitch', 'att.out1') && s.patch['att.a1'] >= 0.15 && s.patch['att.a1'] <= 0.5,
        progress: (s) => share(s.patch['lfo.shape'] === 'square' && has(s.patch, 'env1.gate', 'lfo.out'), has(s.patch, 'sh.clock', 'lfo.out'), has(s.patch, 'att.in1', 'sh.out'), only(s.patch, 'vco1.pitch', 'att.out1') && only(s.patch, 'vco2.pitch', 'att.out1'), s.patch['att.a1'] >= 0.15 && s.patch['att.a1'] <= 0.5),
        hint: 'Lesson 5\'s Random melody plus this lesson\'s first patch, with the LFO also clocking the S&H.',
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  {
    id: 'rack-seq', number: 9, title: 'The Sequencer',
    summary: 'A sequencer is a keyboard played by a clock. Patch it in place of the keyboard, write a tune with rests, change its length, clock it from other modules, and let it sequence things that are not pitch.',
    doneText: 'You played a pattern, wrote a tune with rests and an odd length, clocked it from the LFO and from the keys, transposed it from the keyboard, and sequenced the filter.',
    introUnlocked: [], scopes: SCOPES,
    challenges: [
      {
        type: 'goal', title: 'Play a pattern',
        text: 'The sequencer has the same outputs as the keyboard. Patch its Pitch into both VCOs\' Pitch inputs and its Gate into both envelopes\' Gate inputs, in place of the keyboard\'s cables. Then press Run.',
        unlocked: ALL,
        make: (c) => ({ start: { 'seq.s3': 7, 'seq.s5': 12 }, note: c.note }),
        check: (s) => only(s.patch, 'vco1.pitch', 'seq.pitch') && only(s.patch, 'vco2.pitch', 'seq.pitch') && only(s.patch, 'env1.gate', 'seq.gate') && only(s.patch, 'env2.gate', 'seq.gate') && s.patch['seq.run'] === 'run',
        progress: (s) => share(only(s.patch, 'vco1.pitch', 'seq.pitch'), only(s.patch, 'vco2.pitch', 'seq.pitch'), only(s.patch, 'env1.gate', 'seq.gate'), only(s.patch, 'env2.gate', 'seq.gate'), s.patch['seq.run'] === 'run'),
        hint: 'Lift the Keyboard\'s cables out of both VCO PITCH inputs and both ENV GATE inputs. Patch Sequencer PITCH and GATE into them instead (an output can feed several inputs). Then press RUN.',
      },
      {
        type: 'goal', title: 'Write a tune',
        text: 'Turn the step knobs so the pattern uses at least four different notes, and keep it running.',
        unlocked: ALL,
        make: (c) => ({ start: SEQ_PLAYING, note: c.note }),
        check: (s) => new Set([1, 2, 3, 4, 5, 6, 7, 8].map((n) => Math.round(s.patch[`seq.s${n}`]))).size >= 4 && s.patch['seq.run'] === 'run',
        progress: (s) => Math.min(1, new Set([1, 2, 3, 4, 5, 6, 7, 8].map((n) => Math.round(s.patch[`seq.s${n}`]))).size / 4),
        hint: 'Each step knob sets that step\'s note in semitones. Try 0, +3, +7 and +12 for a minor chord, broken up.',
      },
      {
        type: 'goal', title: 'Rests',
        text: 'Switch off at least two steps with their lights: they become rests, and the pattern gets a rhythm.',
        unlocked: ALL,
        make: (c) => ({ start: SEQ_PLAYING, note: c.note }),
        check: (s) => [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => s.patch[`seq.g${n}`] === 'off').length >= 2 && s.patch['seq.run'] === 'run',
        progress: (s) => Math.min(1, [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => s.patch[`seq.g${n}`] === 'off').length / 2),
        hint: 'Click the small red light under a step\'s knob to switch that step off.',
      },
      {
        type: 'goal', title: 'Odd length',
        text: 'Set Length to 5 or 7: the pattern now repeats every 5 (or 7) steps instead of 8, which makes it feel lopsided and interesting.',
        unlocked: ALL,
        make: (c) => ({ start: SEQ_PLAYING, note: c.note }),
        check: (s) => [5, 7].includes(s.patch['seq.len']) && s.patch['seq.run'] === 'run',
        progress: (s) => ([5, 7].includes(s.patch['seq.len']) ? 1 : 0),
        hint: 'Turn the Length knob to 5 or 7.',
      },
      {
        type: 'goal', title: 'Clock it from the LFO',
        text: 'Set the LFO\'s Shape to square and patch its Out into the Sequencer\'s Clock input. The LFO\'s Rate now sets the speed.',
        unlocked: ALL,
        make: (c) => ({ start: { ...SEQ_PLAYING, 'lfo.rate': 3 }, note: c.note }),
        check: (s) => has(s.patch, 'seq.clock', 'lfo.out') && s.patch['lfo.shape'] === 'square' && s.patch['seq.run'] === 'run',
        progress: (s) => share(has(s.patch, 'seq.clock', 'lfo.out'), s.patch['lfo.shape'] === 'square'),
        hint: 'LFO Shape to the square wave. LFO OUT to Sequencer CLOCK.',
      },
      {
        type: 'question', title: 'Who sets the speed?',
        text: 'Keep the LFO patched into Clock and turn the Sequencer\'s own Rate knob.',
        unlocked: ALL,
        make: (c) => ({ start: { ...SEQ_PLAYING, ...cable('seq.clock', 'lfo.out'), 'lfo.shape': 'square', 'lfo.rate': 3 }, note: c.note }),
        revealWhen: (s) => Math.abs(s.patch['seq.rate'] - 4) > 1.5,
        progress: (s) => Math.min(1, Math.abs(s.patch['seq.rate'] - 4) / 1.5),
        hint: 'Turn the Sequencer\'s Rate knob a long way.',
        question: {
          prompt: 'What did the Sequencer\'s Rate knob do?',
          options: [
            { text: 'Nothing: with something in Clock, the clock sets the speed', correct: true },
            { text: 'It sped the pattern up and down', feedback: 'Listen again while turning it. Then try the LFO\'s Rate instead.' },
          ],
          explain: 'A patched Clock input takes over from the sequencer\'s own clock. That is how modules are kept in time: one clock (here the LFO) drives everything.',
        },
      },
      {
        type: 'goal', title: 'One step per key',
        text: 'Patch the Keyboard\'s Trig into the Sequencer\'s Clock instead of the LFO: now each key you press moves the pattern on one step, whatever key it is. Play at least six notes.',
        unlocked: ALL,
        make: (c) => ({ start: SEQ_PLAYING, note: c.note }),
        check: (s) => only(s.patch, 'seq.clock', 'kb.trig') && s.notes >= 6,
        progress: (s) => share(only(s.patch, 'seq.clock', 'kb.trig'), Math.min(1, s.notes / 6) >= 1),
        hint: 'Keyboard TRIG to Sequencer CLOCK. Then tap any key six times.',
      },
      {
        type: 'goal', title: 'Transpose from the keyboard',
        text: 'Patch the Keyboard\'s Pitch into both VCOs\' Pitch inputs as well as the Sequencer\'s Pitch (two cables in each, added together). Hold different keys while it runs: the whole pattern moves up and down with the key.',
        unlocked: ALL,
        make: (c) => ({ start: SEQ_PLAYING, note: c.note }),
        check: (s) => ['vco1.pitch', 'vco2.pitch'].every((i) => has(s.patch, i, 'seq.pitch') && has(s.patch, i, 'kb.pitch')) && s.patch['seq.run'] === 'run' && s.held,
        progress: (s) => share(has(s.patch, 'vco1.pitch', 'kb.pitch'), has(s.patch, 'vco2.pitch', 'kb.pitch'), s.held),
        hint: 'Drag from the Keyboard\'s PITCH to each VCO\'s PITCH: the Sequencer\'s cables stay. Then hold a key.',
      },
      {
        type: 'goal', title: 'Sequence the filter',
        text: 'A sequencer can step anything, not just pitch. Put the keyboard back on the VCOs\' Pitch and the envelopes\' Gate, and patch the Sequencer\'s Pitch into the VCF\'s CV instead (Cutoff low, CV Amount 30%+). Hold a note while it runs: the tone steps through a pattern.',
        unlocked: ALL,
        make: (c) => ({ start: { 'seq.run': 'run', 'seq.s2': 6, 'seq.s3': 12, 'seq.s5': 3, 'seq.s7': 9, ...cable('filt.cv', ''), 'vcf.cutoff': 300, 'vcf.res': 0.5 }, note: c.note }),
        check: (s) => has(s.patch, 'filt.cv', 'seq.pitch') && s.patch['vcf.cv'] >= 0.3 && has(s.patch, 'vco1.pitch', 'kb.pitch') && has(s.patch, 'env1.gate', 'kb.gate') && s.patch['seq.run'] === 'run' && s.held,
        progress: (s) => share(has(s.patch, 'filt.cv', 'seq.pitch'), s.patch['vcf.cv'] >= 0.3, s.held),
        hint: 'Sequencer PITCH to VCF CV; CV Amount up. Keep the Keyboard\'s cables on the VCOs and envelopes. Hold a key.',
      },
    ],
  },

  // ---------------------------------------------------------------------------------------
  // Fix the Patch: each challenge starts from a working patch with one fault (two in the last).
  {
    id: 'rack-fix', number: 10, title: 'Fix the Patch',
    summary: 'Each patch here is broken. Listen, look at the cables and knobs, find the fault and fix it: the most useful skill on a real modular.',
    doneText: 'You found and fixed every fault. Tracing a signal from the Output back to its source, cable by cable, is how every modular player finds problems.',
    introUnlocked: [], scopes: SCOPES,
    challenges: [
      {
        type: 'goal', title: 'Silence',
        text: 'Nothing comes out at all, whatever you play. Find out why and fix it.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('out.in', '') }, note: c.note }),
        check: (s) => hasFrom(s.patch, 'out.in', 'vca') && played(s),
        progress: (s) => (hasFrom(s.patch, 'out.in', 'vca') ? 1 : 0),
        hint: 'Start at the end: what is plugged into the Output?',
      },
      {
        type: 'goal', title: 'Dead keys',
        text: 'The keys make no sound, but the rest of the patch looks fine.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('env1.gate', '') }, note: c.note }),
        check: (s) => has(s.patch, 'env1.gate', 'kb.gate') && played(s),
        progress: (s) => (has(s.patch, 'env1.gate', 'kb.gate') ? 1 : 0),
        hint: 'VCA 1 is opened by ENV 1. What starts ENV 1?',
      },
      {
        type: 'goal', title: 'One note only',
        text: 'Every key plays the same note.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('vco1.pitch', ''), ...cable('vco2.pitch', '') }, note: c.note }),
        check: (s) => has(s.patch, 'vco1.pitch', 'kb.pitch') && has(s.patch, 'vco2.pitch', 'kb.pitch') && s.highNote - s.lowNote >= 2,
        progress: (s) => share(has(s.patch, 'vco1.pitch', 'kb.pitch'), has(s.patch, 'vco2.pitch', 'kb.pitch'), s.highNote - s.lowNote >= 2),
        hint: 'What tells a VCO which note to play? Check both VCOs.',
      },
      {
        type: 'goal', title: 'It never stops',
        text: 'Notes play, but they never stop when you let go: the sound drones on.',
        unlocked: ALL,
        make: (c) => ({ start: { 'vca1.level': 0.8 }, note: c.note }),
        check: (s) => s.patch['vca1.level'] <= 0.05 && has(s.patch, 'vca1.cv', 'env1.out') && played(s) && !s.held,
        progress: (s) => Math.max(0, 1 - s.patch['vca1.level'] / 0.8),
        hint: 'What holds VCA 1 open when no envelope is opening it?',
      },
      {
        type: 'goal', title: 'Muffled',
        text: 'Everything sounds muffled and dull, almost silent.',
        unlocked: ALL,
        make: (c) => ({ start: { 'vcf.cutoff': 40, 'vcf.cv': 0 }, note: c.note }),
        check: (s) => s.patch['vcf.cutoff'] >= 500 && played(s),
        progress: (s) => Math.min(1, Math.log(s.patch['vcf.cutoff'] / 40) / Math.log(500 / 40)),
        hint: 'Which module removes high frequencies? Where is it set?',
      },
      {
        type: 'goal', title: 'The missing oscillator',
        text: 'VCO 2 is patched into the Mixer, but you can\'t hear it.',
        unlocked: ALL,
        make: (c) => ({ start: { 'mix.l2': 0 }, note: c.note }),
        check: (s) => s.patch['mix.l2'] >= 3 && hasFrom(s.patch, 'mix.in2', 'vco2.') && played(s),
        progress: (s) => Math.min(1, s.patch['mix.l2'] / 3),
        hint: 'A cable can be patched and still silent. Check the Mixer\'s knobs.',
      },
      {
        type: 'goal', title: 'Sour',
        text: 'The two VCOs clash: the sound is sour and rough.',
        unlocked: ALL,
        make: (c) => ({ start: { 'osc2.tune': 0.55 }, note: c.note }),
        check: (s) => Math.abs(s.patch['osc2.tune'] - s.patch['osc1.tune']) <= 0.15 && played(s),
        progress: (s) => Math.max(0, 1 - Math.abs(s.patch['osc2.tune'] - s.patch['osc1.tune']) / 0.55),
        hint: 'Turn on Show values and compare the two VCOs\' Tune.',
      },
      {
        type: 'goal', title: 'Runaway',
        text: 'Something is feeding back on itself: harsh, loud, and the Output\'s Overload light glows.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('mix.in3', 'mix.out'), 'mix.l3': 11 }, note: c.note }),
        check: (s) => (!has(s.patch, 'mix.in3', 'mix.out') || s.patch['mix.l3'] <= 3) && played(s),
        progress: (s) => (!has(s.patch, 'mix.in3', 'mix.out') ? 1 : Math.max(0, 1 - (s.patch['mix.l3'] - 3) / 8)),
        hint: 'Look for an output patched back into its own module.',
      },
      {
        type: 'goal', title: 'Lost sweep',
        text: 'Each note should start bright and close down, but the filter just stays dark.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('env2.gate', ''), 'vcf.cutoff': 200, 'vcf.cv': 0.6, 'env2.d': 0.5, 'env2.s': 0.1 }, note: c.note }),
        check: (s) => has(s.patch, 'env2.gate', 'kb.gate') && played(s),
        progress: (s) => (has(s.patch, 'env2.gate', 'kb.gate') ? 1 : 0),
        hint: 'The filter is moved by ENV 2. Does ENV 2 ever start?',
      },
      {
        type: 'goal', title: 'Silent sequence',
        text: 'The sequencer is running and its Pitch reaches both VCOs, but nothing plays.',
        unlocked: ALL,
        make: (c) => ({ start: { ...SEQ_PLAYING, ...cable('env1.gate', ''), ...cable('env2.gate', '') }, note: c.note }),
        check: (s) => has(s.patch, 'env1.gate', 'seq.gate'),
        progress: (s) => (has(s.patch, 'env1.gate', 'seq.gate') ? 1 : 0),
        hint: 'Pitch says which note; something else has to say when. Which output of the Sequencer is not patched?',
      },
      {
        type: 'goal', title: 'Two faults',
        text: 'This one has two faults. Nothing comes out, and once you fix that, something else is still wrong.',
        unlocked: ALL,
        make: (c) => ({ start: { ...cable('vca1.in', ''), ...cable('vco1.pitch', '') }, note: c.note }),
        check: (s) => hasFrom(s.patch, 'vca1.in', 'filt.') && has(s.patch, 'vco1.pitch', 'kb.pitch') && s.highNote - s.lowNote >= 2,
        progress: (s) => share(hasFrom(s.patch, 'vca1.in', 'filt.'), has(s.patch, 'vco1.pitch', 'kb.pitch'), s.highNote - s.lowNote >= 2),
        hint: 'Trace the sound backwards from the Output: Output, VCA 1, then what? Then play different keys and listen to VCO 1.',
      },
    ],
  },
];
