// Which lab this page is. SynthLab's own page (index.html) leaves LAB_EXTENSION unset and gets the
// synths. A lab in its own folder (StudioLab: studio/) sets it from its own start-up script before
// any of this shared code runs, supplying its units, their help, and the extra parts they use.
export const EXT = globalThis.LAB_EXTENSION || {};
export const LAB_NAME = EXT.name || 'SynthLab';
