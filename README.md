# SynthLab

**Learn sound design by ear.** SynthLab is a browser-based virtual-analogue synthesiser built for teaching synthesis at university level, with an oscilloscope, a spectrum analyser and gamified lessons where students match target sounds.

**Play it:** https://roryawalker.github.io/SynthLab/

## What's inside

- **NF-1 synthesiser**: a monophonic virtual-analogue synth in the classic one-knob-per-function style. Two oscillators (six waveforms, octave range, detune), mixer, 24 dB/octave ladder low-pass filter with resonance, filter envelope, loudness envelope, LFO with delay, glide and mono/legato modes.
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
| `js/params.js` | Every control: ranges, labels, panel layout, factory patches |
| `js/worklet/va-processor.js` | The audio engine (AudioWorklet): oscillators, filter, envelopes, LFO |
| `js/lessons.js` | Lesson and challenge definitions |
| `js/help.js` | All help text |
| `js/visuals.js`, `js/scope.js` | Teaching graphs, oscilloscope and spectrum |

Help text and lessons are kept in their own files so teachers can edit them without touching the rest of the code.

---

A NoFoe project.
