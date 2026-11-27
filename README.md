# SynthLab

**Learn sound design by ear.** SynthLab is a browser-based virtual-analogue synthesiser built for teaching synthesis at university level, with an oscilloscope, a spectrum analyser and gamified lessons where students match target sounds.

**Play it:** https://roryawalker.github.io/SynthLab/

## What's inside

Choose a synth from the start menu:

- **NF-1**, the first synth students meet: a monophonic virtual-analogue synth in the classic one-knob-per-function style. Two oscillators (six waveforms, octave range, detune), mixer, 24 dB/octave ladder low-pass filter with resonance, filter envelope, loudness envelope, LFO with delay, glide and mono/legato modes. Comes with lessons.
- **NiniFoog**, a three-oscillator monosynth laid out in the style of the classic 1970s three-oscillator synths: Oscillator 3 doubles as a modulation source, noise, a feedback loop with an overload light, a ladder filter with keyboard tracking, legato playing, pitch and mod wheels, and free-running, gently drifting oscillators. Its names and artwork are SynthLab's own.
- **NF-MiniModular**, a first modular synth: one LFO, oscillator, filter, envelope and VCA, plus the keyboard's Pitch and Gate, all joined by patch cables you drag between the jacks (double-click a plug to pull it out). It opens with a simple patch already in place, so it plays straight away; pull cables out and re-patch to hear what each connection does.
- **NF-Modular**, the full rack: two VCOs (saw, pulse and triangle outputs, pulse width, FM, PWM and sync), noise, a four-input mixer with drive and wavefolding, a multimode VCF (low-pass, band-pass, high-pass, width, Freq, Pitch and Res inputs), a ring modulator, two envelopes (each switchable between exponential and linear) with inverted outputs, an LFO, an audio-rate MFO, sample & hold, two VCAs, two attenuverters, an eight-step sequencer and the keyboard's Pitch, Gate and Trigger. Several cables can go into one input, and they add together.

On both modular synths, the ring round each socket shows what it carries (coral for sound, blue for control), outputs sit on a dark plate, and a lamp lights by every output in use. **Maximise** clears the screens and keyboard away so the modules fill the window.

All the synths share:

- **Oscilloscope and spectrum analyser** showing the sound in real time. **Maximise** makes the screens much bigger for a closer look.
- **Teaching graphs**: turn a knob and its effect is drawn over the displays: envelope shapes with a live playhead, the filter's response curve, the LFO wave, expected waveform harmonics, octave ranges, glide, each oscillator in the mix, and detune beating (with a beat light).
- **Hover help**: rest the mouse on any control for a second for a plain-English explanation and a "Try this" exercise.
- **Lessons**: match target sounds by ear, build patches step by step, and answer short questions, with hints, a hotter/colder meter and a smiley for every success. Only the controls a challenge needs are unlocked, and target sounds are drawn as ghost traces on the displays.
  - **NF-1**: Oscillators, Mixer, Filter (30 challenges).
  - **NiniFoog**: Three Oscillators, Osc 3 the Modulator, Contours, Feedback and Drive, The Filter as an Instrument, Classic Recipes.
  - **NF-MiniModular**: Patching (Basic), Patching (Intermediate), Patching (By Ear).
  - **NF-Modular**: Two Oscillators, The Multimode Filter, Two Envelopes Two VCAs, Utilities, Randomness, Drums from Scratch, Audio-Rate Modulation, Self-Playing Patches, The Sequencer, and **Fix the Patch**: broken patches to diagnose and repair.
- **Effects**: Chorus, Delay and Reverb, in a fold-out FX panel below the keyboard.
- **Patches**: factory sounds, plus save, export and import your own (cables included).
- **Zoom**: pinch to zoom into the panel, scroll to move around.

## Playing

- Click the keys, or use your computer keyboard: **A W S E D F T G Y H U J K** play an octave, **Z / X** shift octave.
- Plug in a **MIDI keyboard** and it plays straight away (Chrome, Edge and Firefox; Safari has no MIDI). On the NiniFoog its pitch bend and mod wheels move the synth's wheels.
- Drag knobs up and down (hold Shift for fine control); double-click to reset.
- Works in current Chrome, Edge, Firefox and Safari on a desktop or laptop.

## Running locally

SynthLab is plain HTML, CSS and JavaScript with no build step, but it needs to be served over HTTP (browsers block the audio engine on `file://` pages):

```bash
python3 -m http.server 8660
```

Then open http://localhost:8660.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/synth.css` | Page and styling |
| `js/synths/` | Each synth's controls, panel layout and factory patches |
| `js/params.js` | The synth in use, and helpers shared by all synths |
| `js/worklet/` | The sound engines (AudioWorklets): one per synth |
| `js/lessons.js`, `js/lessonsNiniFoog.js`, `js/lessonsModular.js`, `js/lessonsRack.js` | Lessons and challenges for the NF-1, NiniFoog, NF-MiniModular and NF-Modular |
| `js/help.js` | All help text |
| `js/visuals.js`, `js/scope.js` | Teaching graphs, oscilloscope and spectrum |

Help text and lessons are kept in their own files so teachers can edit them without touching the rest of the code.

The start-menu pictures in `img/` are captured from the running app. After changing a synth's look, start the local server and run `sh tools/make-previews.sh` to refresh them (needs Google Chrome).

## Licence

SynthLab is released under the [MIT License](LICENSE): you're free to use, change and share it, as long as the copyright notice is kept.

---

A NoFoe project.
