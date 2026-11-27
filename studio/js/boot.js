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

globalThis.LAB_EXTENSION = {
  name: 'StudioLab',
  units: [NFC1, NF4],
  help: { nfc1: HELP_NFC1, nf4: HELP_NF4 },
  parts: { CompScope, ConsoleScope, ConsoleMeters, loadSource, loadUserFile, userFileName, loadSong },
};
globalThis.LAB_EXTENSION.parts.Fader = (await import('./fader.js')).Fader;
await import('../../js/main.js');
