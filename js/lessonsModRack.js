// NF-ModRack lessons: explanations of the rack's own modules (the ones the NF-Modular does not have).
// No sounds to match and no tests: each step explains one idea, loads an example patch onto the rack
// to play, and suggests something to try with it (challenge type 'explain', see lessonUI.js).
// Students meet these after the NF-Modular, so the basics (VCO, VCF, VCA, ENV, cables) are known.

import { PRESETS } from './synths/modrack.js';

const C = (input, output) => ({ ['jack.' + input]: output });
// an example patch: a preset by name, with any changes
const preset = (name, extra = {}) => ({ ...PRESETS[name], ...extra });
const step = (title, text, start, tryThis) => ({ type: 'explain', title, text, try: tryThis, unlocked: 'all', make: (ctx) => ({ start, note: ctx.note }) });

// a module played by the keyboard straight to the Output (Pitch, and Trig into Strike)
const struck = (mod, extra = {}) => ({
  'rack.layout': `${mod}1|out|`, ...C(`${mod}1.pitch`, 'kb.pitch'), ...C(`${mod}1.strike`, 'kb.trig'), ...C('out.in', `${mod}1.out`), 'out.vol': 0.9, ...extra,
});
// an oscillator through a VCA opened by an envelope (the Keyboard plays it)
const voice = (layout, osc, out, extra = {}) => ({
  'rack.layout': layout, ...C(`${osc}.pitch`, 'kb.pitch'), ...C('vca1.in', out), ...C('vca1.cv', 'env1.out'), ...C('env1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'),
  'env1.a': 0.01, 'env1.s': 0.9, 'env1.r': 0.4, 'out.vol': 0.55, ...extra,
});

export const MODRACK_LESSONS = [
  {
    id: 'mr-struck', number: 1, title: 'Struck Sounds',
    summary: 'Sound from things that ring when struck: modes, what makes a bar sound like a bar, a string as a travelling wave, and what feedback and drive do inside a resonator.',
    doneText: 'You met modal synthesis (Ping) and waveguide synthesis (String): two ways of modelling real objects, and what feedback and drive do to them.',
    introUnlocked: 'all', scopes: true,
    challenges: [
      step('Modes: how struck things ring',
        'Strike a bell, a glass or a metal bar and it rings at a few frequencies at once, each fading away on its own. These are its modes: the ways the object can vibrate. Ping builds a sound from them: inside is a bank of very sharp band-pass filters, one per mode (partial), each of which rings when struck. This is called modal synthesis.\n\nWith one partial you hear a single mode: a pure, ringing tone that dies away, like a tuning fork.',
        struck('ping', { 'ping1.partials': 1, 'ping1.decay': 1.5 }),
        'Play a few notes, then turn Partials up one step at a time to 8. Each new partial is one more mode of the object, higher up; with Help on, the screen draws where each one rings.'),
      step('Stretch: what the object is made of',
        'What makes a drum sound like a drum and a bar like a bar is not the note but how its partials are spaced. Ping places partial n at the note times n to the power of Stretch. At 1 they are harmonic (×2, ×3, ×4): perfectly in tune with each other, as in a string or a voice. At 1.5 they spread out like a struck bar\'s; at 0.67 they crowd together like a drum skin\'s; at 2, like a stiff metal rod\'s.\n\nInharmonic partials (spaced unevenly) are what our ears hear as "struck", "metallic" or "bell-like".',
        struck('ping', { 'ping1.partials': 6, 'ping1.tone': 0.8, 'ping1.decay': 4, 'ping1.fb': 0.94, 'ping1.stretch': 1, 'ping1.range': -1 }),
        'Feedback is set so the sound sings on. Play one note and hold it, then turn Stretch slowly from 0.67 to 2: the same note changes material, from drum skin to string to bar to rod.'),
      step('A string: a wave going round a loop',
        'String models a string differently: not by its modes, but by the wave travelling along it. Inside is a delay line exactly one period long, fed back into itself; each pluck drops a short burst of noise into it. Whatever repeats every period builds up and the rest cancels out, so the loop settles into the note and all its harmonics without being told about any of them. This is waveguide synthesis (its simplest form is known as Karplus-Strong).\n\nEach trip round, a gentle low-pass takes a little treble off, so the note starts bright and mellows as it dies, just as a real plucked string does.',
        struck('string', { 'string1.decay': 1.5, 'string1.tone': 0.6 }),
        'Play low and high notes. Turn Tone down for a muted, nylon-like pluck, up for a bright, wiry one; turn Decay down for a palm-muted pluck.'),
      step('Feedback and drive inside the ring',
        'Both resonators have Feedback: their own output sent back in. Up to about 90% the sound simply rings longer; past that, the loop gains a little each time round and the note sings on, held by a soft limit, as a guitar does when it feeds back through an amplifier. Past 100% (red on the scale) it is pushed hard into that limit: raw and distorted, on purpose.\n\nDrive adds saturation that follows the ring: a hard strike is gritty and the quiet tail stays clean. On Ping it also bends the pitch up on a hard strike and back as it rings, as a hard-struck drum skin does. That is why it sounds alive in a way that distortion added afterwards does not.',
        preset('Screaming String'),
        'Hold a note on this String, set past 100% Feedback. Then turn Feedback down below 90% and play again: now it dies away. Load Massive Pluck from the Patch menu for both resonators driven hard.'),
    ],
  },
  {
    id: 'mr-oscs', number: 2, title: 'Oscillators You Design',
    summary: 'Draw a waveform and hear how its shape becomes its harmonics; why a drawn wave stays clean on high notes; wavetables, and making them from your own recordings.',
    doneText: 'You designed waveforms by hand, learnt why oscillators must be band-limited, and used wavetables, including your own.',
    introUnlocked: 'all', scopes: true,
    challenges: [
      step('A waveform\'s shape is its harmonics',
        'Any repeating wave is a mix of sine waves at whole-number multiples of the note: its harmonics (this is Fourier\'s discovery). The Wave VCO lets you draw one cycle, and the shape decides the harmonics: smooth, rounded curves have few and sound soft; sharp corners add many; sudden jumps add the most (a sawtooth\'s harmonics fall only as 1/n). A wave whose second half is its first half upside down has only odd harmonics, which is why a square wave sounds hollow.',
        voice('wave1|vca1,out|env1', 'wave1', 'wave1.out'),
        'Play and hold a note with the scopes open. Click Draw and scribble a jagged wave; watch the spectrum fill with harmonics. Then click Edit and drag the lines into soft curves (drag a line up or down to bend it): the harmonics fade away.'),
      step('Additive: building a sound from sine waves',
        'The other way to design a tone is to build it from sine waves, one per harmonic: additive synthesis. A tonewheel organ does this mechanically, with drawbars for nine sines at the organ\'s footages: 16′ an octave below the note, 8′ the note, 4′ an octave above, and harmonics in between. Pull out a bar and its sine joins the sound.\n\nThe Drawbars module adds a tuning box to each bar. In tune, the sines blend into one note; retuned off the harmonic series they stop blending and the sound turns metallic and bell-like: inharmonic, like a Ping\'s partials.',
        preset('Tonewheel Organ'),
        'Push every bar in (double-click each) and pull out only 8′: a pure sine. Add bars one at a time and listen to each harmonic arrive. Then drag the 2⅔′ tuning box up a little. Load Bell Organ for bars pulled well off their harmonics.'),
      step('Clean on high notes: band-limiting',
        'A digital oscillator cannot make frequencies above half the sample rate (about 24 kHz). Harmonics that would go higher fold back down as unrelated, out-of-tune whistles: aliasing. A drawn wave with sharp corners has harmonics going very high, so played high it would alias badly.\n\nThe Wave VCO avoids this: when your drawing changes, it makes copies of the wave with fewer and fewer harmonics, one per octave, and each note plays the copy that fits below the limit. The Wavetable does the same for every frame.',
        voice('wave1|vca1,out|env1', 'wave1', 'wave1.out', { 'wave1.nodes': '-1;0,0,0;1,1,0', 'wave1.range': 2 }),
        'This Wave VCO is a drawn sawtooth, two octaves up. Play up the keyboard with the spectrum open: the harmonics thin out as the notes rise, and there are no stray lines between them. That is band-limiting at work.'),
      step('Wavetables: a row of waves',
        'A wavetable is a row of single cycles (frames), each a different shape. Position chooses where in the row to play, gliding smoothly between neighbouring frames. Turned by hand it is a tone control like no other; moved by an LFO or an envelope it makes the timbre itself move as the note plays. This is the heart of digital wavetable synthesis.\n\nThe built-in tables each tell a story: Harmonics adds one harmonic per frame, PWM narrows a pulse, Vowels glides through A E I O U, Sync sweeps a hard-synced saw.',
        preset('Wavetable Sweep'),
        'An LFO sweeps Position through the Harmonics table. Hold a note and watch the stack of frames on its screen. Then pick other tables with ◂ ▸, and try turning the LFO\'s Rate.'),
      step('Your own sounds as wavetables',
        'Load… turns an audio file into a table: it reads frames of 2048 samples one after another from the start of the file, up to 64 (anything after is cut off), and treats each as one cycle, smoothing its ends so it loops without a click. A wavetable file, made of frames of 2048 samples, loads exactly, frame for frame.\n\nAny recording works, but each frame becomes a pitched cycle, so the character comes from how the sound changes over its first few seconds: a sung vowel, a bowed note, a swelling chord, even a drum loop give very different tables.',
        preset('Wavetable Sweep', { 'lfo1.rate': 0.15 }),
        'Press Load… on the Wavetable and choose a short recording of your own (a voice works well). Then play while the LFO slowly scans through it. The table is saved with your patch.'),
    ],
  },
  {
    id: 'mr-shape', number: 3, title: 'Vowels and Distortion',
    summary: 'Formants and why vowels sound different; making a synth talk; and distortion drawn as a curve: soft and hard clipping, odd and even harmonics, wavefolding.',
    doneText: 'You used the source-filter idea of speech to make a synth talk, and shaped distortion by drawing its transfer curve.',
    introUnlocked: 'all', scopes: true,
    challenges: [
      step('Formants: why an "ah" is not an "ee"',
        'Speech works like a synth: the vocal cords make a buzz full of harmonics (the source), and the throat and mouth filter it (the filter). The filter has a few resonances, the formants, and their positions are what make each vowel: the note can change while the vowel stays the same. The first formant (F1) is high for an open mouth (A) and low for a closed one (I, U); the second (F2) is high for vowels made at the front of the mouth (I, E) and low at the back (O, U).\n\nThe Formant module is three band-pass filters at F1, F2 and F3, gliding through A E I O U.',
        voice('vco1,formant1|vca1,out|env1', 'vco1', 'formant1.out', { ...C('formant1.in', 'vco1.saw'), 'vco1.range': -1, 'formant1.res': 0.6 }),
        'Hold a note and turn Vowel slowly from A to U. With Help on, the screen shows the three formants moving. Then turn Shift: the same vowel from a larger or smaller voice (a shorter vocal tract has higher formants).'),
      step('Making it talk',
        'Moving from one vowel to another as a sound goes on is what makes speech: a diphthong like "ow" or "ay" is a glide between two vowels. Patch something that moves into the Formant\'s Vowel input and the synth talks. Here a looping shape drawn in a Draw module moves the vowel on every note.\n\nThe same idea, with an envelope instead, gives a "wah" on each note; with the XY pad, you can play the vowel by hand.',
        preset('Talking Bass'),
        'Play some bass notes. Open the Draw module\'s screen and reshape the loop: its height is the vowel. Try Loop against Bounce (the word in its title), and change its Time.'),
      step('Distortion drawn as a curve',
        'Distortion is a transfer curve: each level that comes in becomes a level that goes out. A straight diagonal changes nothing. A curve that flattens at the ends squashes the loud parts (soft clipping): warm, like an overdriven valve. A curve that is the same both ways round (flipped through the middle) adds only odd harmonics; a lopsided one adds even harmonics too, which sound richer and more "analogue".\n\nThe Shaper lets you draw that curve. Its screen shows the dashed "no change" line and a band for how far the input reaches into the curve.',
        voice('vco1,shaper1|vca1,out|env1', 'vco1', 'shaper1.out', { ...C('shaper1.in', 'vco1.tri'), 'shaper1.curve': '-1;0,0,0;1,1,0', 'shaper1.drive': 1.5 }),
        'The curve starts as a straight line: a plain triangle wave. Hold a note with the spectrum open, click Edit and drag the middle of the line into an S. Then make it lopsided (drag one end down) and listen for the even harmonics.'),
      step('Drive, clipping and folding',
        'Drive pushes the input further across the curve, so more of its shape is used, and the louder the input, the more distorted it gets. Past the ends of the curve something has to happen: Clip holds the end\'s level, flattening the wave (hard clipping); Fold mirrors the input back into the curve, again and again the harder it is driven. Folding is the heart of "West Coast" synthesis: instead of a filter taking harmonics away, a folder adds them, bright and metallic.',
        preset('Folded Lead'),
        'An envelope on the Shaper\'s Drive makes each note start folded and bright, then soften. Play, then switch Edge from Fold to Clip and compare. Load Bit-Crushed Bass for a curve drawn in steps.'),
    ],
  },
  {
    id: 'mr-mod', number: 4, title: 'Modulation You Shape',
    summary: 'Envelopes and LFOs of any shape, drawn by hand; modulation from physics, a bouncing ball; and playing and recording gestures on an XY pad.',
    doneText: 'You drew your own envelopes and LFOs, used a physical model as a modulator, and recorded gestures as modulation.',
    introUnlocked: 'all', scopes: true,
    challenges: [
      step('Draw: an envelope of any shape',
        'An ADSR envelope has four stages; real sounds often need more: a swell that dips and swells again, a second attack, a slow wobble before the release. Draw is a breakpoint envelope: nodes joined by lines you can bend (exponential or linear-like curves). In Once mode it plays from start to end each time the Gate rises.\n\nOne node can be the sustain node (marked SUS): the shape holds there while the key is held, then plays the rest when you let go, just like an ADSR\'s Sustain and Release.',
        { 'rack.layout': 'vco1|vca1,out|draw1', ...C('vco1.pitch', 'kb.pitch'), ...C('vca1.in', 'vco1.saw'), ...C('vca1.cv', 'draw1.out'), ...C('draw1.gate', 'kb.gate'), ...C('out.in', 'vca1.out'), 'draw1.time': 1.5 },
        'Draw is opening the VCA. Play long and short notes: it holds at SUS while you hold the key. Click Edit, double-click the line to add nodes, and draw a shape with two peaks; click a node then Sus to move the sustain point.'),
      step('Draw as an LFO: Loop and Bounce',
        'In Loop mode the shape plays round and round: the end jumps back to the start, so a ramp becomes a sawtooth LFO and steps drawn with Snap become a rhythm. In Bounce mode it plays forwards then backwards, so it never jumps: smooth, triangle-like movement from any shape. Time sets the length of one pass, from audio rate (1 ms) to 30 s.\n\nHere a 16-step pattern drawn with Snap chops a held chord in rhythm: a "trance gate".',
        preset('Drawn Gate'),
        'Hold a chord. Click Draw on its screen, turn on Snap: 16, and draw a new rhythm. Then try Bounce mode, and change Time to change the tempo.'),
      step('Bounce: modulation from physics',
        'A bouncing ball keeps a share of its speed at each bounce (its restitution: Bounce). So each bounce is lower than the last, and closer to the next: the rhythm speeds up as it fades, in a pattern our ears know at once from the real world. The Bounce module works the ball out exactly: Out is its height, Hit a trigger at each bounce as strong as the impact, End a trigger when it comes to rest.\n\nSwing mode plays the bouncing to rest and then backwards, as if time ran in reverse: back and forth, forever.',
        preset('Bouncing Bell'),
        'Each note drops a ball onto a Ping bell. Change Bounce (dead to super-ball) and Time (the first fall). Then try Loop mode for a bouncing rhythm that starts over.'),
      step('XY: gestures as modulation',
        'Some movements are easier to play than to program: a filter swept while the resonance rises, a vowel that drifts as the voice grows. The XY pad gives two control signals at once from one finger: X across, Y up. Rec records a movement (up to 30 s) and plays it back in Loop or Once mode: modulation made from a gesture, saved with the patch. Touch the pad any time to take over.',
        preset('XY Filter Dance'),
        'A recorded circle sweeps the filter (X) and its resonance (Y). Hold a note. Then press Rec, draw a slow figure of eight on the pad, let go, and hear your gesture loop. Smooth softens the jumps.'),
    ],
  },
  {
    id: 'mr-notes', number: 5, title: 'Notes, Chance and Chords',
    summary: 'Turning any voltage into notes of a scale; controlled randomness; paraphonic and polyphonic playing; and seeing inside a patch with the Probe.',
    doneText: 'You made generative patches that stay in key, used probability as a musical tool, played chords on a modular, and looked inside a patch with a scope.',
    introUnlocked: 'all', scopes: true,
    challenges: [
      step('The Quantizer: from voltage to notes',
        'A pitch control voltage is continuous: at 1 volt per octave, 1/12 of a volt is a semitone, and everything in between is in between. Random steps, a hand on an XY pad or a bouncing ball give pitches between the notes. The Quantizer snaps each one to the nearest note of a scale: the lit keys on its screen. A scale is simply a choice of some of the 12 notes; Root moves it to another key. Trig fires on each new note, so it can play an envelope.',
        preset('Quantized Wander'),
        'The S&H makes random pitches; the Quantizer keeps them in A minor pentatonic. Choose other scales from its menu (try Whole tone, then Blues), or click keys to make your own. Turn Root to change key.'),
      step('Chance: randomness you can play',
        'Generative music often needs a little unpredictability, but not too much. Chance gives each gate or trigger a weighted coin toss: with the chance you set it goes to Out, otherwise to Else. At 100% nothing changes; at 50% half the beats go each way, never in the same order twice. With two sounds on Out and Else, one steady pulse becomes a pattern that never quite repeats.',
        preset('Chance Bells'),
        'The Sequencer\'s pulse is split between a bell (Out) and a pluck (Else). Turn Chance and listen to the balance shift. Pull out the Else cable: now some beats just go missing.'),
      step('Paraphonic and polyphonic',
        'The Keyboard\'s Pitch carries one note. Poly gives each held note its own channel: Pitch and Gate 1 to 4. Patch three channels into three oscillators that share one filter and one envelope and the rack is paraphonic: chords, but every new note restarts the shared envelope. Give each channel its own envelope and VCA and it is polyphonic: each note starts and stops on its own, as on a big modular system. Voices (the word in its title) sets how many channels are used.',
        preset('Paraphonic Chords'),
        'Play chords: three VCOs, one filter. Then load Two-Voice Poly and Paraphonic Orchestra from the Patch menu and compare how notes start and end.'),
      step('The Probe: seeing inside a patch',
        'When a patch does something unexpected, look inside it. The Probe is an oscilloscope you patch in anywhere: A in amber, B in blue, and Thru passes A on so it can sit in a cable\'s path. Short Times show a steady picture of a waveform; long ones scroll, to watch envelopes, LFOs and sequences unfold. Comparing two points of a patch, before and after a module, is the quickest way to understand what that module does.',
        preset('See the Envelope'),
        'The Probe shows the envelope (A) and the sound it shapes (B). Play long and short notes and watch. Then move the A cable to other outputs: the VCO, the filter, the Keyboard\'s Gate.'),
    ],
  },
];
