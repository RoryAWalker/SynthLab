// NF-C1 lessons: how a compressor works, from what it does to setting one up by ear.
// The format is SynthLab's (see ../../js/lessons.js), with what the processors add (see
// ../../js/lessonUI.js):
//   controls   the only controls the student may turn (others in an open section stay greyed)
//   start      may choose the Loop Player's sound ('src.sound'); the loop always plays
//   s.live     in check()/progress()/revealWhen(): what the meters showed over the last two
//              seconds: { playing, grMax, grAvg (dB of gain reduction), inDb, outDb, bypassed }
// Match challenges compare settings (within 10% of each control's travel), heard on the loop:
// 'Hear target' plays the loop through the target settings for four seconds.
//
// Lesson 1: Threshold and Ratio (how much). Lesson 2: Attack and Release (how fast).
// Lesson 3: Makeup, Bypass and Knee (hearing it fairly). Lesson 4: real jobs, matched by ear.

const OPEN = ['comp', 'meters']; // the compressor and the meters (with Bypass)
const live = (s) => s.live || { playing: false, grMax: 0, grAvg: 0, inDb: -120, outDb: -120 };
const playing = (s) => live(s).playing;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// start points: plain settings, so only what the challenge is about is doing anything
const FLAT = { 'comp.thresh': 0, 'comp.ratio': 4, 'comp.knee': 0, 'comp.attack': 10, 'comp.release': 150, 'comp.makeup': 0, 'comp.auto': 'off', 'comp.bypass': 'off' };

export const C1_LESSONS = [
  // ===================================================================================
  {
    id: 'c1-amount',
    number: 1,
    title: 'Threshold and Ratio',
    summary: 'What a compressor does: it turns the loud parts down. Threshold says where it starts, Ratio says how hard it pushes.',
    doneText: 'You can now set how much a compressor works: Threshold decides what gets turned down, Ratio decides by how much, and the GR meter shows you the result.',
    base: { ...FLAT, 'src.sound': 'drums' },
    introUnlocked: [],
    challenges: [
      {
        type: 'goal', title: 'Make it work',
        text: 'The drums are playing through the compressor, but the Threshold is at 0 dB, so nothing is loud enough to be touched and the GR (gain reduction) meter is dark. Turn the Threshold down until the GR meter lights up on the loudest hits.',
        unlocked: OPEN, controls: ['comp.thresh'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'drums' }, note: c.note }),
        check: (s) => playing(s) && live(s).grMax >= 2,
        progress: (s) => clamp01(live(s).grMax / 2) * 0.5 + clamp01(-s.patch['comp.thresh'] / 20) * 0.5,
        hint: 'Turn the Threshold anticlockwise. On the Levels screen, the dashed line comes down; once the tops of the drum hits poke above it, the red gain reduction appears underneath.',
      },
      {
        type: 'question', title: 'What gets turned down?',
        text: 'Watch the Levels screen: the green is the sound going in, the amber line is what comes out, and the dashed line is the threshold. Move the Threshold up and down a little and watch where the amber line parts from the green.',
        unlocked: OPEN, controls: ['comp.thresh'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -24 }, note: c.note }),
        question: {
          prompt: 'Which parts of the sound does the compressor turn down?',
          options: [
            { text: 'Only the parts louder than the threshold', correct: true },
            { text: 'Everything, by the same amount', feedback: 'Look between the hits: where the sound is below the dashed line, the amber line sits right on the green. Nothing is turned down there.' },
            { text: 'Only the quiet parts', feedback: 'It is the other way round: the gaps between the hits are untouched, and the tops of the hits are pulled down.' },
          ],
          explain: 'Right. Below the threshold nothing happens; only the part above it is turned down. That is how a compressor brings the loud parts closer to the quiet ones.',
        },
      },
      {
        type: 'goal', title: 'A light touch',
        text: 'Set the Threshold so the loudest drum hits are turned down by about 3 to 6 dB, no more. Watch the GR meter, or the red number on the Levels screen. This is gentle control: the drums keep their life, only the biggest peaks are tamed.',
        unlocked: OPEN, controls: ['comp.thresh'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'drums' }, note: c.note }),
        check: (s) => playing(s) && live(s).grMax >= 3 && live(s).grMax <= 6,
        progress: (s) => { const g = live(s).grMax; return g > 6 ? clamp01(1 - (g - 6) / 12) : clamp01(g / 4.5); },
        hint: 'Bring the Threshold down slowly. Each GR light is about 1.2 dB, so you want three to five lights flickering on the loudest hits. If you go too far, come back up.',
      },
      {
        type: 'goal', title: 'Heavy compression',
        text: 'Now squash them: make the compressor turn the drums down by 10 dB or more on average, not just on the peaks. Use the Threshold and the Ratio. Listen to how flat and dense the drums become.',
        unlocked: OPEN, controls: ['comp.thresh', 'comp.ratio'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'drums' }, note: c.note }),
        check: (s) => playing(s) && live(s).grAvg >= 10,
        progress: (s) => clamp01(live(s).grAvg / 10),
        hint: 'A low Threshold puts nearly all of the sound over it; a high Ratio turns everything over it down hard. Try the Threshold around −40 dB with the Ratio at 8:1 or more.',
      },
      {
        type: 'question', title: 'Ratio 1:1',
        text: 'The Threshold is low, so the compressor is working hard. Now turn the Ratio all the way down to 1, and watch the transfer curve and the GR meter.',
        unlocked: OPEN, controls: ['comp.ratio'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -40, 'comp.ratio': 6 }, note: c.note }),
        revealWhen: (s) => s.patch['comp.ratio'] <= 1.1,
        progress: (s) => clamp01((6 - s.patch['comp.ratio']) / 5),
        hint: 'Turn the Ratio anticlockwise, right down to 1.',
        question: {
          prompt: 'At a ratio of 1:1, what does the compressor do?',
          options: [
            { text: 'Nothing at all, whatever the threshold', correct: true },
            { text: 'It turns everything down by the same amount', feedback: 'Look at the GR meter: it is dark. And the curve lies on the 1:1 line.' },
            { text: 'It compresses as hard as it can', feedback: 'That is the other end of the knob. Look at the transfer curve: is it bent at all?' },
          ],
          explain: 'Right. 1:1 means 1 dB more in gives 1 dB more out, above the threshold as well as below it: the curve is a straight line and nothing is turned down. The threshold only matters once the ratio is above 1.',
        },
      },
      {
        type: 'question', title: 'Reading the curve',
        text: 'Look at the transfer curve. Across the bottom is the level going in, up the side is the level coming out. Above the threshold the line bends over: the little triangle shows what happens to a sound 12 dB over the threshold.',
        unlocked: OPEN, controls: ['comp.ratio'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -30, 'comp.ratio': 4 }, note: c.note }),
        question: {
          prompt: 'At 4:1, a drum hit goes 12 dB over the threshold. How far over the threshold does it come out?',
          options: [
            { text: '3 dB', correct: true },
            { text: '12 dB', feedback: 'That would be 1:1, no compression. The ratio divides what goes over.' },
            { text: '4 dB', feedback: 'Close, but the ratio is not added or taken away: it divides. 12 dB over, at 4:1...' },
            { text: '48 dB', feedback: 'A compressor never makes things louder above the threshold. The ratio divides what goes over.' },
          ],
          explain: 'Right: 12 ÷ 4 = 3. Every 4 dB over the threshold comes out as 1 dB over, so a 12 dB peak is turned down by 9 dB. Turn the Ratio and watch the triangle\'s numbers change.',
        },
      },
      {
        type: 'goal', title: 'A limiter',
        text: 'Turn the Ratio up to 10:1 or more. The curve above the threshold goes nearly flat: very little gets past. From 10:1 a compressor is said to be limiting, and it is used to stop peaks going much over a level; 20:1 is heavy limiting.',
        unlocked: OPEN, controls: ['comp.ratio'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -18 }, note: c.note }),
        check: (s) => s.patch['comp.ratio'] >= 10,
        progress: (s) => clamp01(Math.log(s.patch['comp.ratio'] / 4) / Math.log(10 / 4)),
        hint: 'Turn the Ratio clockwise, to 10 or beyond.',
      },
      {
        title: 'Match the threshold',
        text: 'The test tone steps between quiet (−30 dB) and loud (−6 dB). Listen to the target: which steps get turned down, and by how much? Then set the Threshold to match.',
        unlocked: OPEN, controls: ['comp.thresh'],
        start: { ...FLAT, 'src.sound': 'tone', 'comp.ratio': 8 }, compare: ['comp.thresh'],
        make: (c) => ({ patch: { 'comp.thresh': c.pick([-40, -20, -12]) }, note: c.note }),
        hint: 'If both steps are turned down, the threshold is below −30 dB. If only the loud step is, it is between −30 and −6. Watch the GR meter during the target, then do the same.',
      },
      {
        title: 'Match the ratio',
        text: 'Same drums, same threshold. Listen to how hard the target squeezes the hits, then set the Ratio to match. Bypass is there if you want to hear the drums untouched.',
        unlocked: OPEN, controls: ['comp.ratio'],
        start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -30 }, compare: ['comp.ratio'],
        make: (c) => ({ patch: { 'comp.ratio': c.pick([1.5, 10, 20]) }, note: c.note }),
        hint: 'A low ratio leaves the hits sounding natural; a high one flattens them and the GR meter lights up much further. Compare the GR during the target with yours.',
      },
      {
        title: 'Threshold and ratio',
        text: 'Both have changed, on the bass this time. Listen to how much of the bass is touched (threshold) and how hard (ratio).',
        unlocked: OPEN, controls: ['comp.thresh', 'comp.ratio'],
        start: { ...FLAT, 'src.sound': 'bass', 'comp.thresh': -20 }, compare: ['comp.thresh', 'comp.ratio'],
        make: (c) => ({ patch: { 'comp.thresh': c.pick([-36, -30, -12]), 'comp.ratio': c.pick([2, 8, 20]) }, note: c.note }),
        hint: 'Get the threshold first (if you are stuck, open the screens with Scopes: the blue line on the Levels screen is the target), then the ratio from the shape of the blue curve.',
      },
    ],
  },

  // ===================================================================================
  {
    id: 'c1-time',
    number: 2,
    title: 'Attack and Release',
    summary: 'How fast a compressor reacts: Attack is how quickly it clamps down, Release is how quickly it lets go. They change the sound\'s shape, not just its level.',
    doneText: 'You can now shape a sound with time: a slower attack lets the punch through, the release sets how the compressor breathes, and too fast a release distorts.',
    base: { ...FLAT, 'src.sound': 'tone', 'comp.thresh': -24, 'comp.ratio': 8 },
    introUnlocked: [],
    challenges: [
      {
        type: 'question', title: 'Watch the attack',
        text: 'The test tone steps up from quiet to loud every second, and the compressor is set to catch the loud step. Turn the Attack up to 100 ms or more, and watch the amber output line on the Levels screen each time the tone gets loud.',
        unlocked: OPEN, controls: ['comp.attack'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'tone', 'comp.thresh': -24, 'comp.ratio': 8, 'comp.attack': 0.1 }, note: c.note }),
        revealWhen: (s) => s.patch['comp.attack'] >= 80,
        progress: (s) => clamp01(s.patch['comp.attack'] / 80),
        hint: 'Turn the Attack clockwise, past 100.',
        question: {
          prompt: 'Each time the tone gets loud, what does the output do?',
          options: [
            { text: 'It jumps up, then sinks down as the compressor catches up', correct: true },
            { text: 'It stays perfectly flat', feedback: 'With a fast attack it would. Look closely at the start of each loud step on the amber line.' },
            { text: 'It drops first, then rises', feedback: 'Look again at the amber line at the start of each loud step: it overshoots before it settles.' },
          ],
          explain: 'Right. The compressor takes the attack time to turn the sound down, so the start of each loud sound gets through first. That overshoot is the attack: on drums, it is the punch.',
        },
      },
      {
        type: 'question', title: 'Watch the release',
        text: 'Now the attack is fast. Turn the Release up to 1 second or more and watch what happens each time the tone steps back down to quiet.',
        unlocked: OPEN, controls: ['comp.release'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'tone', 'comp.thresh': -24, 'comp.ratio': 8, 'comp.attack': 1, 'comp.release': 20 }, note: c.note }),
        revealWhen: (s) => s.patch['comp.release'] >= 800,
        progress: (s) => clamp01(Math.log(s.patch['comp.release'] / 20) / Math.log(40)),
        hint: 'Turn the Release clockwise, past 500, towards 3k.',
        question: {
          prompt: 'When the tone drops back to quiet, what does the output do?',
          options: [
            { text: 'It comes out too quiet at first, then slowly recovers', correct: true },
            { text: 'It drops straight to the right level', feedback: 'That is what a fast release does. Watch the amber line just after each loud step ends.' },
            { text: 'It jumps up louder than before', feedback: 'Watch again just after each loud step ends: the amber line starts low.' },
          ],
          explain: 'Right. The compressor is still turning the sound down when the loud part ends, and lets go only at the release speed. So the quiet part after a loud one is held down for a while: you hear it swell back up.',
        },
      },
      {
        type: 'question', title: 'Punch',
        text: 'Real drums now, with plenty of compression. Compare a very fast attack (0.1 ms) with a slower one (about 30 ms). Listen to the snare and kick: the start of each hit.',
        unlocked: OPEN, controls: ['comp.attack'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -30, 'comp.ratio': 6, 'comp.attack': 0.1 }, note: c.note }),
        revealWhen: (s) => s.patch['comp.attack'] >= 20,
        progress: (s) => clamp01(s.patch['comp.attack'] / 20),
        hint: 'Listen at 0.1 ms first, then turn the Attack up to about 30 ms.',
        question: {
          prompt: 'Which keeps the drums punchier?',
          options: [
            { text: 'The slower attack (30 ms)', correct: true },
            { text: 'The very fast attack (0.1 ms)', feedback: 'Listen again: at 0.1 ms the start of every hit is squashed flat as it happens.' },
            { text: 'They sound the same', feedback: 'Listen to the very start of the snare hits as you turn between them, and watch the amber line on the Levels screen.' },
          ],
          explain: 'Right. A slower attack lets the first few milliseconds of each hit (the transient: the crack, the click) through before the compressor clamps down. The drums are just as compressed, but they hit harder. This is one of the most used tricks in mixing.',
        },
      },
      {
        type: 'goal', title: 'Pumping',
        text: 'Make the full band pump: the whole mix ducks down on every kick and snare, then swells back up. Use a slow Release (600 ms or more) with plenty of gain reduction (8 dB or more on average).',
        unlocked: OPEN, controls: ['comp.thresh', 'comp.ratio', 'comp.release'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'band', 'comp.attack': 2 }, note: c.note }),
        check: (s) => playing(s) && s.patch['comp.release'] >= 600 && live(s).grAvg >= 8,
        progress: (s) => clamp01(Math.log(s.patch['comp.release'] / 150) / Math.log(4)) * 0.5 + clamp01(live(s).grAvg / 8) * 0.5,
        hint: 'Bring the Threshold well down (around −35 dB) and the Ratio up (8:1), then turn the Release up towards 1 second. The red on the Levels screen will rise and fall with the beat.',
      },
      {
        type: 'question', title: 'Too fast',
        text: 'On the bass, heavily compressed: turn the Release all the way down to 5 ms and listen closely to the low notes.',
        unlocked: OPEN, controls: ['comp.release'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'bass', 'comp.thresh': -40, 'comp.ratio': 10, 'comp.attack': 0.1 }, note: c.note }),
        revealWhen: (s) => s.patch['comp.release'] <= 10,
        progress: (s) => clamp01(Math.log(150 / s.patch['comp.release']) / Math.log(15)),
        hint: 'Turn the Release anticlockwise, all the way down to 5.',
        question: {
          prompt: 'What happens to the bass?',
          options: [
            { text: 'It distorts: a fuzzy, buzzy edge on the notes', correct: true },
            { text: 'It gets cleaner and smoother', feedback: 'Listen again, and compare with the Release back at 150 ms.' },
            { text: 'Nothing changes', feedback: 'Switch between 5 ms and 150 ms and listen to the low notes.' },
          ],
          explain: 'Right. A low bass note\'s waves are 10 to 20 ms long. With a release that fast the compressor turns down each wave as it rises and lets go as it falls, bending the wave\'s shape: that is distortion. Usually it is a mistake; sometimes it is used on purpose for grit.',
        },
      },
      {
        title: 'Match the attack',
        text: 'Listen to how the start of each drum hit sounds in the target (squashed, or punching through?), then set the Attack to match.',
        unlocked: OPEN, controls: ['comp.attack'],
        start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -30, 'comp.ratio': 6 }, compare: ['comp.attack'],
        make: (c) => ({ patch: { 'comp.attack': c.pick([0.3, 40, 150]) }, note: c.note }),
        hint: 'A very fast attack flattens the hits; a slow one lets them crack through, and with a very slow one the compressor hardly touches short hits at all. On the Levels screen, compare how tall the amber spikes are.',
      },
      {
        title: 'Match the release',
        text: 'Now listen to what happens between the hits: does the sound come back up quickly, or swell back slowly? Set the Release to match.',
        unlocked: OPEN, controls: ['comp.release'],
        start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -30, 'comp.ratio': 6 }, compare: ['comp.release'],
        make: (c) => ({ patch: { 'comp.release': c.pick([30, 600, 2000]) }, note: c.note }),
        hint: 'Watch the red gain reduction on the Levels screen during the target: short spikes mean a fast release, long slopes back up mean a slow one.',
      },
      {
        title: 'Attack and release',
        text: 'Both have changed, on the vocal. Listen for the start of the words (attack), then for how the level recovers between phrases (release).',
        unlocked: OPEN, controls: ['comp.attack', 'comp.release'],
        start: { ...FLAT, 'src.sound': 'vocals', 'comp.thresh': -32, 'comp.ratio': 6 }, compare: ['comp.attack', 'comp.release'],
        make: (c) => ({ patch: { 'comp.attack': c.pick([0.5, 30, 120]), 'comp.release': c.pick([30, 1000]) }, note: c.note }),
        hint: 'One at a time: get the release from the shape of the red on the Levels screen, then the attack by ear.',
      },
    ],
  },

  // ===================================================================================
  {
    id: 'c1-fair',
    number: 3,
    title: 'Makeup, Bypass and Knee',
    summary: 'Hearing compression fairly: win the level back with Makeup, compare with Bypass at the same loudness, and soften the start with Knee.',
    doneText: 'You can now judge compression fairly: match the loudness with Makeup (or Auto), compare with Bypass, and choose a hard or soft knee.',
    base: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -30, 'comp.ratio': 6 },
    introUnlocked: [],
    challenges: [
      {
        type: 'question', title: 'Quieter?',
        text: 'The drums are compressed. Press Bypass (under Meters) to hear them without the compressor, then press it again to bring it back. Do it a few times.',
        unlocked: OPEN, controls: ['comp.bypass'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -30, 'comp.ratio': 6 }, note: c.note }),
        revealWhen: (s) => s.patch['comp.bypass'] === 'on',
        hint: 'The Bypass button is above the meters. Its light comes on while the compressor is bypassed.',
        question: {
          prompt: 'Compared with Bypass, the compressed drums are...',
          options: [
            { text: 'Quieter', correct: true },
            { text: 'Louder', feedback: 'Listen again, and watch the Out meter against the In meter while it is compressing.' },
            { text: 'Just as loud', feedback: 'Watch the Out meter against the In meter while it is compressing.' },
          ],
          explain: 'Right. A compressor only ever turns things down, so the compressed sound is quieter. That is why every compressor has Makeup gain: to turn the whole sound back up afterwards.',
        },
      },
      {
        type: 'goal', title: 'Make it up',
        text: 'Turn up the Makeup until the compressed drums are as loud as they are with Bypass. Use your ears and the meters: the Out meter should read about the same as the In meter.',
        unlocked: OPEN, controls: ['comp.makeup', 'comp.bypass'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -30, 'comp.ratio': 6 }, note: c.note }),
        check: (s) => playing(s) && !live(s).bypassed && Math.abs(live(s).outDb - live(s).inDb) <= 1.5,
        progress: (s) => (live(s).bypassed ? 0 : clamp01(1 - Math.abs(live(s).outDb - live(s).inDb) / 12)),
        hint: 'Turn the Makeup up a few dB at a time and compare the In and Out meters. Press Bypass now and then to check by ear (but switch it off again to finish).',
      },
      {
        type: 'question', title: 'Why match the level?',
        text: 'Engineers always match the loudness before they compare with Bypass. Think about why.',
        unlocked: OPEN, controls: ['comp.makeup', 'comp.bypass'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -30, 'comp.ratio': 6, 'comp.makeup': 10 }, note: c.note }),
        question: {
          prompt: 'Why match the loudness before comparing with Bypass?',
          options: [
            { text: 'Because the louder version almost always sounds better to us, whatever the compressor did', correct: true },
            { text: 'Because Bypass does not work otherwise', feedback: 'Bypass works at any level. The reason is in our ears, not the compressor.' },
            { text: 'To protect the speakers', feedback: 'Not this time. Think about how we judge two versions of a sound at different loudness.' },
          ],
          explain: 'Right. Our ears prefer louder: it sounds fuller and clearer. If the compressed version is louder, you will like it for the wrong reason. Matched in level, you hear only what the compression did.',
        },
      },
      {
        type: 'goal', title: 'Auto makeup',
        text: 'Switch on Auto under the Makeup pot. Then turn the Threshold a long way down, to −40 dB or lower, and watch the Makeup pot turn by itself.',
        unlocked: OPEN, controls: ['comp.thresh', 'comp.auto', 'comp.bypass'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -20, 'comp.ratio': 6 }, note: c.note }),
        check: (s) => s.patch['comp.auto'] === 'on' && s.patch['comp.thresh'] <= -40,
        progress: (s) => (s.patch['comp.auto'] === 'on' ? 0.5 : 0) + clamp01((-20 - s.patch['comp.thresh']) / 20) * 0.5,
        hint: 'The Auto button is under the Makeup pot. Press it (its light comes on), then turn the Threshold anticlockwise.',
      },
      {
        type: 'question', title: 'What Auto does',
        text: 'Keep Auto on. Press Bypass on and off, and move the Threshold and Ratio around. Watch the Makeup pot and the Out meter.',
        unlocked: OPEN, controls: ['comp.thresh', 'comp.ratio', 'comp.auto', 'comp.bypass'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -36, 'comp.ratio': 6, 'comp.auto': 'on' }, note: c.note }),
        question: {
          prompt: 'What does Auto makeup do?',
          options: [
            { text: 'It turns the sound back up by as much as the compression turned it down', correct: true },
            { text: 'It sets the Threshold for you', feedback: 'The Threshold stays where you put it. Watch which pot moves by itself.' },
            { text: 'It makes the sound as loud as possible', feedback: 'Compare with Bypass: is it louder, or about the same?' },
          ],
          explain: 'Right. It listens to how much quieter the compression made the sound and makes up the difference, so compressed and bypassed are about equally loud. Handy for fair comparisons; engineers still often set Makeup by hand.',
        },
      },
      {
        type: 'goal', title: 'A soft knee',
        text: 'Knee sets how suddenly the compression starts. Turn it up to 12 dB or more, and watch the transfer curve: the sharp corner at the threshold becomes a gentle bend (the shaded band).',
        unlocked: OPEN, controls: ['comp.knee'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'vocals', 'comp.thresh': -30, 'comp.ratio': 6 }, note: c.note }),
        check: (s) => s.patch['comp.knee'] >= 12,
        progress: (s) => clamp01(s.patch['comp.knee'] / 12),
        hint: 'Turn the Knee clockwise, past 12.',
      },
      {
        type: 'question', title: 'Hard or soft?',
        text: 'On the vocal, compare a hard knee (0) with a soft one (24 dB). Listen to the words that just cross the threshold.',
        unlocked: OPEN, controls: ['comp.knee', 'comp.bypass'],
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'vocals', 'comp.thresh': -30, 'comp.ratio': 6 }, note: c.note }),
        revealWhen: (s) => s.patch['comp.knee'] >= 20,
        progress: (s) => clamp01(s.patch['comp.knee'] / 20),
        hint: 'Listen at 0, then turn the Knee right up to 24.',
        question: {
          prompt: 'Which is less noticeable on the vocal?',
          options: [
            { text: 'The soft knee', correct: true },
            { text: 'The hard knee', feedback: 'With a hard knee the compression switches on all at once at the threshold. Listen again.' },
          ],
          explain: 'Right. A soft knee starts compressing gradually, a little below the threshold, so there is no sudden change as a word crosses it. Hard knees sound more obvious and controlled; soft knees are smoother, which suits vocals and whole mixes.',
        },
      },
      {
        title: 'Match the knee',
        text: 'The test tone\'s quiet step sits right at the threshold. Listen to the quiet step in the target: is it touched or not? Set the Knee to match.',
        unlocked: OPEN, controls: ['comp.knee'],
        start: { ...FLAT, 'src.sound': 'tone', 'comp.thresh': -30, 'comp.ratio': 8, 'comp.knee': 12 }, compare: ['comp.knee'],
        make: (c) => ({ patch: { 'comp.knee': c.pick([0, 24]) }, note: c.note }),
        hint: 'With a hard knee (0), the quiet step at −30 dB is not touched at all; with a soft knee it is turned down a little. Watch the GR meter during the quiet steps of the target.',
      },
      {
        title: 'Match the makeup',
        text: 'Listen to how loud the target is, compared with yours. Set the Makeup to match.',
        unlocked: OPEN, controls: ['comp.makeup'],
        start: { ...FLAT, 'src.sound': 'drums', 'comp.thresh': -30, 'comp.ratio': 6 }, compare: ['comp.makeup'],
        make: (c) => ({ patch: { 'comp.makeup': c.pick([6, 12, 18]) }, note: c.note }),
        hint: 'Watch the Out meter during the target, then turn the Makeup until yours reads the same.',
      },
    ],
  },

  // ===================================================================================
  {
    id: 'c1-jobs',
    number: 4,
    title: 'Real jobs',
    summary: 'Setting up a compressor the way an engineer does: on real recordings, by ear, with every control at once.',
    doneText: 'You have set up a compressor on drums, bass, vocals and a full band by ear. You are ready for compressors that have a sound of their own.',
    base: { ...FLAT, 'src.sound': 'band' },
    introUnlocked: [],
    challenges: [
      {
        type: 'question', title: 'Where to start',
        text: 'Before the real jobs: engineers usually set up a compressor in the same order. Think about which controls decide what.',
        unlocked: OPEN,
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'band' }, note: c.note }),
        question: {
          prompt: 'Which order makes most sense?',
          options: [
            { text: 'Threshold and Ratio (how much), then Attack and Release (the shape), then Makeup (match the level)', correct: true },
            { text: 'Makeup first, then the rest', feedback: 'Makeup depends on how much the compressor turns down, so it comes last.' },
            { text: 'Attack and Release first, then the Threshold', feedback: 'Attack and Release only matter once something is over the threshold: you cannot hear them until it is set.' },
          ],
          explain: 'Right. Until the threshold and ratio make the compressor work, attack and release do nothing you can hear. Makeup comes last, to match the level for a fair comparison with Bypass.',
        },
      },
      {
        title: 'Even out the bass',
        text: 'A steadier bass line: match the target\'s Threshold and Ratio.',
        unlocked: OPEN, controls: ['comp.thresh', 'comp.ratio', 'comp.bypass'],
        start: { ...FLAT, 'src.sound': 'bass', 'comp.attack': 8, 'comp.release': 200 }, compare: ['comp.thresh', 'comp.ratio'],
        make: (c) => ({ patch: { 'comp.thresh': c.pick([-30, -24, -18]), 'comp.ratio': c.pick([3, 6]) }, note: c.note }),
        hint: 'Threshold first: how much of the bass is touched? If you are stuck, open the screens with Scopes and look for the blue target line. Then the ratio, from the angle of the blue curve.',
      },
      {
        title: 'Punchy drums',
        text: 'Drums with punch: match the Threshold and the Attack.',
        unlocked: OPEN, controls: ['comp.thresh', 'comp.attack', 'comp.bypass'],
        start: { ...FLAT, 'src.sound': 'drums', 'comp.ratio': 4, 'comp.release': 120 }, compare: ['comp.thresh', 'comp.attack'],
        make: (c) => ({ patch: { 'comp.thresh': c.pick([-30, -22]), 'comp.attack': c.pick([1, 30]) }, note: c.note }),
        hint: 'How much: compare the GR meter with the target\'s. Then the attack: is the crack of the snare there, or squashed?',
      },
      {
        title: 'A smooth vocal',
        text: 'A vocal that sits steadily: match the Threshold, Ratio and Release.',
        unlocked: OPEN, controls: ['comp.thresh', 'comp.ratio', 'comp.release', 'comp.bypass'],
        start: { ...FLAT, 'src.sound': 'vocals', 'comp.knee': 6, 'comp.attack': 5 }, compare: ['comp.thresh', 'comp.ratio', 'comp.release'],
        make: (c) => ({ patch: { 'comp.thresh': c.pick([-36, -28]), 'comp.ratio': c.pick([2, 5]), 'comp.release': c.pick([60, 400]) }, note: c.note }),
        hint: 'Get the amount right first (threshold and ratio; the screens, opened with Scopes, show the target in blue), then listen to how the vocal recovers between phrases for the release.',
      },
      {
        title: 'Glue the band',
        text: 'Compression across a whole mix: match the target\'s Threshold, Ratio and Attack on the full band.',
        unlocked: OPEN, controls: ['comp.thresh', 'comp.ratio', 'comp.attack', 'comp.bypass'],
        start: { ...FLAT, 'src.sound': 'band', 'comp.knee': 6, 'comp.release': 200 }, compare: ['comp.thresh', 'comp.ratio', 'comp.attack'],
        make: (c) => ({ patch: { 'comp.thresh': c.pick([-24, -14]), 'comp.ratio': c.pick([2, 4]), 'comp.attack': c.pick([1, 30]) }, note: c.note }),
        hint: 'Mix compression is usually gentle. Find the amount first, then listen to the drums inside the mix for the attack.',
      },
      {
        type: 'goal', title: 'Your vocal setting',
        text: 'Your turn, no target: set up the vocal yourself so it is turned down by 3 to 8 dB on average and comes out as loud as it goes in (Out matching In). Every control is yours.',
        unlocked: OPEN, controls: null,
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'vocals' }, note: c.note }),
        check: (s) => playing(s) && !live(s).bypassed && live(s).grAvg >= 3 && live(s).grAvg <= 8 && Math.abs(live(s).outDb - live(s).inDb) <= 1.5,
        progress: (s) => { const l = live(s); if (l.bypassed) return 0; const g = l.grAvg < 3 ? clamp01(l.grAvg / 3) : l.grAvg > 8 ? clamp01(1 - (l.grAvg - 8) / 8) : 1; return g * 0.6 + clamp01(1 - Math.abs(l.outDb - l.inDb) / 12) * 0.4; },
        hint: 'Threshold and Ratio until the GR meter shows a few dB most of the time, a fast-ish attack (5 to 10 ms) and a medium release (100 to 200 ms), then Makeup (or Auto) until Out matches In.',
      },
      {
        type: 'goal', title: 'Your band setting',
        text: 'And the full band: gentle glue, about 2 to 4 dB of gain reduction on average, with the drums still punching through, and matched in level.',
        unlocked: OPEN, controls: null,
        make: (c) => ({ start: { ...FLAT, 'src.sound': 'band' }, note: c.note }),
        check: (s) => playing(s) && !live(s).bypassed && live(s).grAvg >= 2 && live(s).grAvg <= 4 && s.patch['comp.attack'] >= 10 && Math.abs(live(s).outDb - live(s).inDb) <= 1.5,
        progress: (s) => { const l = live(s); if (l.bypassed) return 0; const g = l.grAvg < 2 ? clamp01(l.grAvg / 2) : l.grAvg > 4 ? clamp01(1 - (l.grAvg - 4) / 8) : 1; return g * 0.5 + clamp01(s.patch['comp.attack'] / 10) * 0.2 + clamp01(1 - Math.abs(l.outDb - l.inDb) / 12) * 0.3; },
        hint: 'A low ratio (2:1) and a threshold where the GR meter just moves, an attack of 10 ms or more so the drums get through, then Makeup or Auto to match the level.',
      },
      {
        type: 'question', title: 'Your own recording',
        text: 'Last one: load a recording of your own with Load your own… on the Loop Player (a single instrument or voice works best) and try what you have learned on it.',
        unlocked: OPEN, controls: null,
        make: (c) => ({ start: { ...FLAT }, note: c.note }),
        question: {
          prompt: 'A finished, mastered song from a streaming service hardly reacts to the compressor. Why?',
          options: [
            { text: 'It has been compressed and limited already, so its loud and quiet parts are close together', correct: true },
            { text: 'The compressor only works on the recordings that come with it', feedback: 'It works on anything. Look at how much the level moves on the Levels screen with a mastered song.' },
            { text: 'Songs are too long for a compressor', feedback: 'Length does not matter. Think about how much dynamic range a mastered song has left.' },
          ],
          explain: 'Right. Mastered music has usually been squeezed already, so there is little range left to compress. Raw recordings of a single voice or instrument show the effect best.',
        },
      },
    ],
  },
];

// Bypass is always open: comparing with the untouched sound is half of using a compressor.
// Matches are by ear: the screens start off (the Scopes button opens them, target and all).
C1_LESSONS.forEach((l) => l.challenges.forEach((ch) => {
  if (Array.isArray(ch.controls) && !ch.controls.includes('comp.bypass')) ch.controls.push('comp.bypass');
  if (!ch.type || ch.type === 'match') {
    ch.scopes = false;
    ch.text += ' The screens are off for this one, so use your ears (Scopes, top right, opens them; the target shows in blue).';
  }
}));
