// Answer books for the two modular synths: no sound recipes yet (those need their cables written out
// and checked by ear), but FM and AM, which are about how things are patched. Format: js/askbooks/nf1.js.

import { SYNTH } from '../params.js';

const sources = (p, id) => String(p[id] || '').split(',').filter(Boolean);
const audio = (out) => !!(SYNTH.OUTPUTS && SYNTH.OUTPUTS[out] && SYNTH.OUTPUTS[out].audio);
const named = (out) => (SYNTH.OUTPUTS && SYNTH.OUTPUTS[out] ? `${SYNTH.OUTPUTS[out].module} ${SYNTH.OUTPUTS[out].label}` : out);

const AM_HOW = 'patch an oscillator\'s output into a VCA\'s CV input, so the oscillator opens and closes the VCA hundreds of times a second';

export const NFM_BOOK = {
  synthName: 'NF-MiniModular',
  recipes: [],
  tweaks: [
    { name: 'fm', words: ['fm', 'frequency modulation', 'fm synthesis'],
      up: [['set', 'jack.osc.fm', 'osc.out'], ['mul', 'osc.fm', 1.5, 0.3]], down: [['mul', 'osc.fm', 0.6, null, 0.03]], off: [['set', 'jack.osc.fm', '']],
      sayUp: 'I patched the VCO\'s own Out back into its FM input and turned up FM Amount. With one oscillator this is feedback FM: the VCO bends its own pitch at audio speed, which makes the tone harsher and more metallic the higher FM Amount goes.',
      sayDown: 'I turned FM Amount down, so the FM is gentler.', sayOff: 'I unplugged the cable from the FM input: no FM.',
      howUp: 'Patch a signal into the VCO\'s FM input and turn up FM Amount. The LFO there gives vibrato (slow FM); an audio signal, such as the VCO\'s own Out, gives real FM with metallic sidebands.',
      howDown: 'Turn FM Amount down, or unplug the FM input.' },
  ],
  concepts: {
    fm: { here: 'On the NF-MiniModular, the VCO has an FM input with an FM Amount knob. With the LFO patched in it\'s vibrato; with audio (the VCO\'s own Out) it\'s feedback FM.',
      ids: ['osc.fm', 'jack.osc.fm'],
      uses: (p) => sources(p, 'jack.osc.fm').some(audio) && p['osc.fm'] > 0.02,
      usesYes: 'Yes: an audio signal is patched into the VCO\'s FM input and FM Amount is up, so the pitch is being modulated at audio speed.',
      usesNo: (p) => { const s = sources(p, 'jack.osc.fm'); return s.length ? `Not at audio speed: the FM input has ${s.map(named).join(' and ')} patched in, which is slow FM, heard as vibrato or a siren.` : 'No: nothing is patched into the VCO\'s FM input.'; } },
    am: { here: `On the NF-MiniModular, ${AM_HOW}. With only one oscillator it modulates itself, which mostly adds grit.`,
      ids: ['jack.vca.cv'],
      uses: (p) => sources(p, 'jack.vca.cv').some(audio),
      usesYes: 'Yes: an audio signal is opening and closing the VCA, so its volume is modulated at audio speed.',
      usesNo: (p) => { const s = sources(p, 'jack.vca.cv'); return s.length ? `Not at audio speed: the VCA's CV input has ${s.map(named).join(' and ')} patched in, which shapes the volume slowly (an envelope, or tremolo from the LFO).` : 'No: nothing is patched into the VCA\'s CV input.'; } },
  },
  aliases: {},
};

export const NFMOD_BOOK = {
  synthName: 'NF-Modular',
  recipes: [],
  tweaks: [
    { name: 'fm', words: ['fm', 'frequency modulation', 'fm synthesis'],
      up: [['set', 'jack.vco1.fm', 'vco2.tri'], ['set', 'jack.mix.in2', ''], ['mul', 'osc1.fm', 1.4, 0.35]],
      down: [['mul', 'osc1.fm', 0.6, null, 0.03]], off: [['set', 'jack.vco1.fm', '']],
      sayUp: 'I patched VCO 2\'s Tri output into VCO 1\'s FM input and turned up VCO 1\'s FM Amt, and unplugged VCO 2 from the Mixer so you hear only VCO 1 being modulated. Tune VCO 2 to change the ratio: whole octaves sound harmonic, odd tunings sound like bells and metal. FM Amt sets the depth, so the brightness.',
      sayDown: 'I turned VCO 1\'s FM Amt down, so the FM is gentler.', sayOff: 'I unplugged VCO 1\'s FM input: no FM.',
      howUp: 'Patch one VCO\'s output (Tri is smoothest) into the other VCO\'s FM input and turn up that VCO\'s FM Amt. Unplug the modulating VCO from the Mixer to hear only the result, then tune it to change the ratio.',
      howDown: 'Turn the FM Amt down, or unplug the FM input.' },
    { name: 'am', words: ['amplitude modulation', 'am synthesis'],
      up: [], down: [],
      sayUp: `I can't patch AM for you yet, because it means rerouting the VCAs. To try it, ${AM_HOW}, or use the Ring Mod: VCO 1 into In A, VCO 2 into In B, and its Out into the Mixer.`,
      howUp: `For AM, ${AM_HOW}. For ring modulation, the stronger kind, patch VCO 1 into the Ring Mod's In A, VCO 2 into In B, and the Ring Mod's Out into a Mixer input.`,
      limit: `I can't patch AM for you yet. To try it, ${AM_HOW}, or use the Ring Mod.` },
  ],
  concepts: {
    fm: { here: 'On the NF-Modular, both VCOs have an FM input and an FM Amt knob: patch the other VCO in for real FM, or the LFO for vibrato.',
      ids: ['osc1.fm', 'osc2.fm', 'jack.vco1.fm', 'jack.vco2.fm'],
      uses: (p) => [['jack.vco1.fm', 'osc1.fm'], ['jack.vco2.fm', 'osc2.fm']].some(([j, a]) => sources(p, j).some(audio) && p[a] > 0.02),
      usesYes: 'Yes: an audio signal is patched into a VCO\'s FM input with its FM Amt up, so that VCO\'s pitch is modulated at audio speed.',
      usesNo: (p) => { const s = [...sources(p, 'jack.vco1.fm'), ...sources(p, 'jack.vco2.fm')]; return s.length ? `Not at audio speed: the FM inputs have ${[...new Set(s)].map(named).join(' and ')} patched in, which is slow modulation (vibrato, or an envelope sweeping the pitch).` : 'No: nothing is patched into either VCO\'s FM input.'; } },
    am: { here: `On the NF-Modular, ${AM_HOW}, or use the Ring Mod, a stronger form of AM in which only the sum and difference frequencies are left.`,
      ids: ['ring.mix', 'vca1.cv', 'vca2.cv'],
      uses: (p) => (sources(p, 'jack.ring.a').some(audio) && sources(p, 'jack.ring.b').some(audio) && p['ring.mix'] > 0.02)
        || ['jack.vca1.cv', 'jack.vca2.cv'].some((j) => sources(p, j).some(audio)),
      usesYes: 'Yes: either the Ring Mod has two audio signals patched in, or an audio signal is opening a VCA. Both are amplitude modulation at audio speed.',
      usesNo: 'No: the VCAs are opened by slow signals (envelopes or the LFO), and the Ring Mod isn\'t multiplying two audio signals.' },
  },
  aliases: {},
};
