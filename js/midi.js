// MIDI input: any MIDI keyboard plugged in (before or after the page opens) plays the synth.
// Notes go through the on-screen keyboard (so its keys light and lessons hear them);
// pitch bend and the mod wheel (CC 1) move the synth's wheels where it has them.
// Uses Web MIDI: Chrome, Edge and Firefox. Safari has none, so nothing happens there.

export function startMidi({ keyboard, setControl, onDevices, onActivity }) {
  if (!navigator.requestMIDIAccess) { onDevices(null); return; }
  navigator.requestMIDIAccess().then((access) => {
    const bind = () => {
      const names = [];
      access.inputs.forEach((input) => {
        input.onmidimessage = onMessage;
        if (input.state !== 'connected') return;
        names.push(input.name || 'MIDI keyboard');
      });
      onDevices(names);
    };
    access.onstatechange = bind; // plugged in or out while the page is open
    bind();
  }).catch(() => onDevices(null)); // permission refused

  function onMessage(e) {
    const [status, a, b] = e.data;
    const type = status & 0xf0;
    if (onActivity && type !== 0xf0) onActivity();
    if (type === 0x90 && b > 0) keyboard.press('midi' + a, a);
    else if (type === 0x80 || (type === 0x90 && b === 0)) keyboard.release('midi' + a);
    else if (type === 0xe0) setControl('perf.bend', Math.max(-1, (((b << 7) | a) - 8192) / 8191));
    else if (type === 0xb0 && a === 1) setControl('perf.mod', b / 127);
    else if (type === 0xb0 && (a === 123 || a === 120)) [...keyboard.held.keys()].filter((s) => s.startsWith('midi')).forEach((s) => keyboard.release(s)); // all notes off
  }
}
