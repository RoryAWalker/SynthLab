# SynthLab

**Learn sound design by ear.** SynthLab is a browser-based virtual-analogue synthesiser built for teaching synthesis at university level, with an oscilloscope, a spectrum analyser and gamified lessons where students match target sounds.

**Play it:** https://roryawalker.github.io/SynthLab/

## What's inside

Choose a synth from the start menu:

- **NF-1**, the first synth students meet: a monophonic virtual-analogue synth in the classic one-knob-per-function style. Two oscillators (six waveforms, octave range, detune), mixer, 24 dB/octave ladder low-pass filter with resonance, filter envelope, loudness envelope, LFO with delay, glide and mono/legato modes. Comes with lessons.
- **NiniFoog**, a three-oscillator monosynth laid out in the style of the classic 1970s three-oscillator synths: Oscillator 3 doubles as a modulation source, noise, a feedback loop with an overload light, a ladder filter with keyboard tracking, legato playing, pitch and mod wheels, and free-running, gently drifting oscillators. Its names and artwork are SynthLab's own.
- **MiniModular**, a first modular synth: one LFO, oscillator, filter, envelope and VCA, plus the keyboard's Pitch and Gate, all joined by patch cables you drag between the jacks. It opens with a simple patch already in place, so it plays straight away; pull cables out and re-patch to hear what each connection does.
- **NF-Modular**, the full rack: two VCOs (saw, pulse and triangle outputs, pulse width, FM, PWM and sync), noise, a four-input mixer, a VCF with resonance CV and keyboard tracking, two envelopes with inverted outputs, an LFO with rate CV, sample & hold, two VCAs and the keyboard's Pitch, Gate and Trigger.

All the synths share:

- **Oscilloscope and spectrum analyser** showing the sound in real time.
- **Teaching graphs**: turn a knob and its effect is drawn over the displays: envelope shapes with a live playhead, the filter's response curve, the LFO wave, expected waveform harmonics, octave ranges, glide, each oscillator in the mix, and detune beating (with a beat light).
- **Hover help**: rest the mouse on any control for a second for a plain-English explanation and a "Try this" exercise.
- **Lessons**: listen to a target sound, then use the synth to match it. Only the controls the lesson needs are unlocked, and the target is shown as a ghost trace on the displays. Lesson 1 (Oscillators) has 10 challenges.
- **Patches**: factory sounds, plus save, export and import your own.
- **Zoom**: pinch to zoom into the panel, scroll to move around.

## Playing

- Click the keys, or use your computer keyboard: **A W S E D F T G Y H U J K** play an octave, **Z / X** shift octave.
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
| `js/lessons.js` | Lesson and challenge definitions |
| `js/help.js` | All help text |
| `js/visuals.js`, `js/scope.js` | Teaching graphs, oscilloscope and spectrum |

Help text and lessons are kept in their own files so teachers can edit them without touching the rest of the code.

The start-menu pictures in `img/` are captured from the running app. After changing a synth's look, start the local server and run `sh tools/make-previews.sh` to refresh them (needs Google Chrome).

## Licence

SynthLab is released under the [MIT License](LICENSE): you're free to use, change and share it, as long as the copyright notice is kept.

---

A NoFoe project.
