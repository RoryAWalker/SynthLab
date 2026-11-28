// The NF-MiniModular's answer book (the NF-Modular's is js/askbooks/nfmod.js): no sound recipes yet (those need their cables written out
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
