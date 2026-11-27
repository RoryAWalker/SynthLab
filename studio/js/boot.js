// StudioLab starts here. It registers its units, their help and the parts they use, then runs
// SynthLab's shared app (../../js/main.js), which picks them up through js/lab.js.
// Order matters: the registration must be in place before any shared code runs, so the parts
// that use the shared code (the fader) and the app itself are loaded only afterwards.
import { NFC1 } from './units/nfc1.js';
import { NF4 } from './units/nf4.js';
import { HELP_NFC1, HELP_NF4 } from './help.js';
import { CompScope } from './compScope.js';
import { ConsoleScope } from './consoleScope.js';
import { ConsoleMeters } from './meters.js';
import { loadSource, loadUserFile, userFileName, loadSong } from './sources.js';
import { C1_LESSONS } from './lessonsC1.js';

// What is public. On the public site (GitHub Pages) only the units ready for students appear, and
// with just one the page opens straight on it, with no start menu. Locally every unit appears, for
// working on the rest; add ?public to the address to see the public version locally.
const PUBLIC_UNITS = ['nfc1'];
const q = new URLSearchParams(location.search);
const isPublic = q.has('public') || /github\.io$/.test(location.hostname);
const units = isPublic ? [NFC1, NF4].filter((u) => PUBLIC_UNITS.includes(u.id)) : [NFC1, NF4];
const onlyOne = units.length === 1;
if (onlyOne && q.get('synth') !== units[0].id) {
  q.set('synth', units[0].id);
  history.replaceState(null, '', location.pathname + '?' + q + location.hash);
  document.documentElement.classList.remove('choosing'); // (see index.html: no start menu)
}

globalThis.LAB_EXTENSION = {
  name: 'StudioLab',
  units,
  help: { nfc1: HELP_NFC1, nf4: HELP_NF4 },
  lessons: { nfc1: C1_LESSONS },
  parts: { CompScope, ConsoleScope, ConsoleMeters, loadSource, loadUserFile, userFileName, loadSong },
};
globalThis.LAB_EXTENSION.parts.Fader = (await import('./fader.js')).Fader;
await import('../../js/main.js');
// one unit: nothing to choose, so no Menu button
if (onlyOne) { const b = document.getElementById('btn-synths'); if (b) b.style.display = 'none'; }
