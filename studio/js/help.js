// StudioLab's help text: entries for each studio unit, looked up before the shared ones.

// Entries for the NF-C1 compressor (nfc1). Looked up first on that unit.
export const HELP_NFC1 = {
  // ---- the screens
  scope: { title: 'Levels screen', body: [
    'The last four seconds, scrolling from right to left. The shaded green area is the level going in; the amber line is the level coming out. The dashed line is the threshold.',
    'Underneath, in red, is the gain reduction: how many dB the compressor is turning the sound down at each moment. Where the red is deepest, the compressor is working hardest.',
    'Watch the gap between the green and the amber: it is the compression. When the level drops below the threshold the gap closes again, at the speed of the Release.'],
    tip: 'Choose the Test tone and turn Attack up to 100 ms: you can see the output jump up and then sink back as the compressor catches up. That rise and fall is the attack.' },
  spectrum: { title: 'Transfer curve', body: [
    'The compressor\'s rule, as a graph: across the bottom is the level going in, up the side is the level coming out. The dotted diagonal is 1:1, where out equals in (no change).',
    'Below the threshold the amber curve follows the diagonal. Above it, the curve bends over: with a ratio of 4:1, going 12 dB further in only takes the output 3 dB further up.',
    'The dot shows where the music is on the curve right now. The ring shows where the sound really comes out: it lags behind the dot because the gain reduction takes time to arrive (Attack) and to let go (Release).'],
    tip: 'Turn the Ratio slowly from 1 to 20 and watch the line above the threshold flatten. At 20:1 it is almost flat: a limiter.' },

  // ---- source
  'section:src': { title: 'Source', body: [
    'The sound going into the compressor. A compressor does nothing on its own: it reacts to whatever you put through it, so the choice of sound matters a lot.',
    'Drums have big, short peaks: good for hearing Attack and Release. Bass and Keys have loud and soft notes: good for hearing how a compressor evens out levels. The Full band is all three playing together, the way a compressor across a whole mix hears them. The Test tone simply steps between quiet and loud, the clearest way to see what each control does.'] },
  'src.play': { title: 'Play / Stop', body: ['Starts and stops the sound, looping. The space bar does the same.'] },
  'src.sound': { title: 'Sound', body: [
    'Which sound to play through the compressor. Drums, Bass and Keys are recorded loops with plenty of difference between loud and soft notes, and the Full band is the three of them together. The Test tone steps between a quiet level (−30 dB) and a loud one (−6 dB) every second.',
    'Your file plays a sound you have loaded with Load your own… (it stays on your computer).'] },
  'src.in': { title: 'Input', body: [
    'How loud the sound is when it reaches the compressor. Turning it up pushes more of the sound over the threshold, so the compressor works harder, just as turning the threshold down would.',
    'On many hardware compressors this is the main control: the threshold is fixed and you drive the input into it.'] },
  loadown: { title: 'Load your own', body: [
    'Play your own recording through the compressor: a WAV, MP3, AIFF or similar from your computer. It is read in the browser and is never uploaded anywhere. Long files are trimmed to the first minute.',
    'Mixed and mastered music is usually compressed already, so there may be little left to do. Raw recordings (a single vocal, a drum kit, an acoustic guitar) show the effect best.'] },

  // ---- compressor
  'section:comp': { title: 'Compressor', body: [
    'A compressor is an automatic volume control. When the sound gets louder than the threshold it turns it down; when it falls back below, it lets it come back up. The result: the loud parts are brought closer to the quiet parts (less dynamic range).',
    'Threshold says where it starts, Ratio says how hard it turns down, Knee says how gently it starts, and Attack and Release say how fast it reacts.'] },
  'comp.thresh': { title: 'Threshold', body: [
    'The level where compression starts. Anything quieter than the threshold passes through untouched; only the part above it is turned down.',
    'Lower the threshold and more of the sound goes over it, so more of it is compressed. On the Levels screen it is the dashed line; on the transfer curve it is where the line bends.'],
    tip: 'With Drums playing, lower the Threshold until the GR meter flickers on the loudest hits only. That is a light touch; keep going and every hit is turned down.' },
  'comp.ratio': { title: 'Ratio', body: [
    'How hard the sound over the threshold is turned down. At 4:1, for every 4 dB the input goes over the threshold, the output only goes 1 dB over. At 2:1 it is gentle; at 10:1 and above it is very strong; at 20:1 almost nothing gets past the threshold, which is limiting.',
    'At 1:1 nothing happens at all, whatever the threshold.'],
    tip: 'Ratio only matters for what is over the threshold. If nothing reaches the threshold, turning the Ratio changes nothing: try it.' },
  'comp.knee': { title: 'Knee', body: [
    'How suddenly the compression starts. With a hard knee (0) it starts all at once, exactly at the threshold. With a soft knee it fades in gradually, starting a little below the threshold and reaching the full ratio a little above it (the shaded band on the transfer curve).',
    'A soft knee sounds smoother and less noticeable; a hard knee is more obvious and more controlled.'] },
  'comp.attack': { title: 'Attack', body: [
    'How quickly the compressor turns the sound down once it goes over the threshold. Measured in milliseconds (thousandths of a second).',
    'A fast attack catches the very start of every note or drum hit and flattens it. A slower attack lets that first moment (the transient, the "click" or "smack") through before the compressor clamps down, which makes drums sound punchier.'],
    tip: 'Drums, Ratio 6:1, Threshold low: compare Attack 0.3 ms with 30 ms. The slower setting lets the snare\'s crack through and sounds louder and punchier, even though it is compressed just as much.' },
  'comp.release': { title: 'Release', body: [
    'How quickly the compressor lets go once the sound drops back below the threshold, returning to no gain reduction.',
    'A fast release recovers quickly, which keeps things lively but can make the volume flutter, or even distort low notes. A slow release holds the reduction on, which sounds smoother, but if it is too slow the quiet parts after a loud hit stay turned down. Long release with lots of reduction gives the "pumping" sound, where the whole mix ducks and swells with the beat.'],
    tip: 'Load the Pumping patch and turn the Release from 600 ms down to 50 ms: the breathing in and out gets faster and then disappears.' },

  // ---- output
  'section:out': { title: 'Output', body: ['After compression: Makeup gain, the bypass button, and how loud you hear it.'] },
  'comp.on': { title: 'Compressor In / Bypass', body: [
    'Lit: you hear the compressed sound. Off (bypassed): you hear the sound as it goes in, without the compressor, so you can compare.',
    'The screens and the GR meter keep showing what the compressor would do, even while it is bypassed.'],
    tip: 'Louder almost always sounds "better" to our ears. When you compare in and out, set the Makeup so both are equally loud first, or you will just be choosing the louder one.' },
  'comp.makeup': { title: 'Makeup', body: [
    'Turns the whole sound back up after compression. Compression only turns things down, so a compressed sound is quieter; makeup wins that level back.',
    'Because the loud peaks have been brought down, the sound can now be turned up further before it reaches the top: that is why compressed sounds seem louder and denser.'] },
  'mon.vol': { title: 'Listen', body: ['How loud you hear it. It comes after everything else and does not change the meters or the screens: it is only your listening level.'] },

  // ---- meters
  'section:meters': { title: 'Meters', body: ['In shows the level going in, Out the level coming out, and GR in between shows the gain reduction: how many dB the compressor is turning the sound down right now.'] },
  'meter-in': { title: 'In meter', body: ['The peak level going into the compressor, after the Input knob. The lamp at the top lights if it reaches 0 dB.'] },
  'meter-gr': { title: 'GR meter (gain reduction)', body: ['How far the compressor is turning the sound down, lighting from the top downwards: each light is about 1.2 dB, so a full meter is 24 dB of reduction.', 'This is the most useful meter on any compressor. A few dB on the loudest moments is gentle control; 10 dB or more all the time is heavy compression.'] },
  'meter-out': { title: 'Out meter', body: ['The peak level coming out, after Makeup. The lamp at the top lights if it reaches 0 dB, the most a digital system can take: too much Makeup will distort.'] },
};

// Entries for the NF-4 console (nf4). Each channel strip has the same controls, so its entries
// are made once per channel.
function nf4Channel(n) {
  const k = `ch${n}.`;
  return {
    [`section:ch${n}`]: { title: `Channel ${n}`, body: [
      'One channel strip: everything one source goes through, read from top to bottom in the order the sound flows. Input and gain, the high-pass filter and EQ, the two aux sends and pan, routing, mute and solo, and finally the fader.',
      'The meter beside the fader shows the level before the fader: the level the gain and EQ have left it at. Set the gain by that meter first, then use the fader to mix.'] },
    [k + 'in']: { title: 'Mic / Line', body: [
      'Which input the source comes in through. A microphone puts out a tiny signal (mic level, about 50 dB quieter than line level), so the Mic input has a preamp with lots of gain. Keyboards, DI boxes and other gear put out line level, which needs little or no gain.',
      'The wrong choice is a classic mistake: a line-level source on the Mic input is far too hot and distorts; a mic on the Line input is far too quiet, and turning it up brings up hiss.'],
      tip: 'Switch the Bass channel to Mic and watch its peak light and the signal-flow screen: the preamp clips.' },
    [k + 'p48']: { title: '48 V phantom power', body: [
      'Sends 48 volts up the microphone cable. Condenser microphones need it to work at all; dynamic microphones ignore it. On this desk the drum overheads and the lead vocal are condensers: switch their 48 V off and they go silent.',
      'In a real studio, switch phantom power on and off with the fader down (it makes a loud thump), and never with a vintage ribbon microphone plugged in, which it can damage. It does nothing on a line input.'] },
    [k + 'pol']: { title: 'Polarity (Ø)', body: [
      'Flips the signal upside down (often called phase invert). On its own it sounds the same. It matters when two microphones pick up the same source, such as the top and bottom of a snare: if one is upside down relative to the other they cancel, and flipping one brings back the missing low end.'] },
    [k + 'gain']: { title: 'Gain (preamp)', body: [
      'How much the preamp amplifies the input: the first and most important level on the desk. On Mic it runs from +10 to +60 dB; on Line from −20 to +30 dB.',
      'Gain staging: set the gain so the channel meter peaks around −12 to −6 dB, well clear of the top. Too little and you have to push the fader up, bringing up the desk\'s hiss with it; too much and the preamp clips (the red light at the top of the meter) and nothing later can undo the distortion.'],
      tip: 'Load "Badly gain-staged": the drums are too low (hissy when brought up), the lead too high (clipping). Fix both with the gain, not the fader.' },
    [k + 'hpf']: { title: 'High-pass filter (HPF)', body: [
      'Removes low frequencies below its setting, at 12 dB per octave: rumble, stand thumps, breath pops and low "mud" that most sources do not need. Off at the bottom of its travel.',
      'Most sources except kick drum and bass benefit from some high-pass: 80 to 120 Hz on a vocal, more on keys and guitars in a busy mix. Cleaning up the lows on every channel leaves room for the bass and kick.'] },
    [k + 'eq']: { title: 'EQ in', body: ['Switches the three EQ bands in and out, so you can compare. The high-pass filter is separate and stays on.'], tip: 'Toggle EQ in and out while listening: if you cannot hear the difference, the EQ is probably not needed.' },
    [k + 'hf']: { title: 'High (shelf, 12 kHz)', body: ['Turns up or down everything above about 12 kHz: air, sparkle and hiss. A shelf lifts or lowers the whole range above its frequency, like a step.'] },
    [k + 'mg']: { title: 'Mid (gain)', body: ['Boosts or cuts a band of frequencies around the Mid Freq setting: a bell-shaped curve on the EQ screen.'], tip: 'Find a problem frequency by boosting the Mid a lot and sweeping Mid Freq until it sounds worst, then cut it instead. Cutting is usually cleaner than boosting.' },
    [k + 'mf']: { title: 'Mid Freq', body: ['Where the Mid band sits, from 100 Hz to 8 kHz. Around 200 to 400 Hz is "boxy" or "muddy"; 1 to 3 kHz is presence and bite; 5 to 8 kHz is edge and sibilance.'] },
    [k + 'lf']: { title: 'Low (shelf, 80 Hz)', body: ['Turns up or down everything below about 80 Hz: weight, thump and rumble.'] },
    [k + 'aux1']: { title: 'Aux 1 (pre-fader)', body: [
      'Sends a copy of this channel to the Aux 1 bus, taken BEFORE the fader. Moving the fader does not change it. That makes it right for a performer\'s headphone or monitor mix: you can change the main mix freely without changing what they hear.',
      'Aux 1 is heard on its own by choosing Aux 1 on the Monitor switch.'],
      tip: 'Load "Headphone mix (Aux 1)", then pull a channel\'s fader right down: it disappears from the main mix but not from the headphones.' },
    [k + 'aux2']: { title: 'Aux 2 (post-fader)', body: [
      'Sends a copy of this channel to the Aux 2 bus, taken AFTER the fader. Moving the fader changes the send too, so the balance between the dry sound and its effect stays the same. That makes it right for effects: here Aux 2 feeds the reverb.',
      'The reverb comes back on the Rev Return in the master section and joins the main mix.'] },
    [k + 'pan']: { title: 'Pan', body: ['Places the channel between the left and right speakers. In the centre it goes equally to both (each 3 dB down, so it does not sound louder in the middle).'], tip: 'Bass, kick and lead vocal usually stay in the centre; keys, guitars and backing parts spread to the sides.' },
    [k + 'main']: { title: 'Route to Main L-R', body: ['Sends the channel to the main stereo mix. With it off, the channel does not reach the main mix at all, though its aux sends still work: a simple first look at routing. Bigger desks also have subgroups to route to.'] },
    [k + 'mute']: { title: 'Mute', body: ['Silences the channel: in the main mix and in both aux sends. The meter still shows the signal coming in, so you can see it is there.'] },
    [k + 'solo']: { title: 'Solo (PFL)', body: [
      'Lets you hear this channel on its own in the monitors, without changing the mix. This desk\'s solo is PFL (pre-fade listen): you hear the channel as it is before its fader, so even a channel with its fader down can be checked. Solo several channels to hear them together.',
      'While anything is soloed the monitor plays the solo instead of the main mix. The main mix itself, and its meters, carry on unchanged.'] },
    [k + 'fader']: { title: 'Fader', body: [
      'The channel\'s level in the mix. 0 dB (unity), about three quarters of the way up, leaves the level as the gain set it; above that it adds up to 10 dB, below it turns the channel down, to off at the bottom.',
      'Mixing happens on the faders, after the gain has been set properly. If a fader needs to sit near the top or bottom to get the balance right, the gain is probably wrong.'] },
  };
}
export const HELP_NF4 = {
  ...nf4Channel(1), ...nf4Channel(2), ...nf4Channel(3), ...nf4Channel(4),
  scope: { title: 'Signal flow', body: [
    'The path through the desk for the selected channel (the one you touched last), block by block in the same order as the strip, with the live peak level at each stage in dBu (the desk\'s units: +4 dBu is 0 VU, +22 dBu is digital clipping). Green is a healthy level, amber is hot, red is clipping.',
    'The two aux sends branch off underneath: Aux 1 before the mute and fader, Aux 2 after them. Aux 2 feeds the reverb, whose return goes back into the main bus. Along the bottom is the master section: bus compressor, main fader, and what the monitor is playing.',
    'Anything muted, switched off or not routed goes dark, so you can see where a signal stops.'] },
  spectrum: { title: 'EQ and bus compressor', body: [
    'The selected channel\'s high-pass filter and EQ as a curve: across is frequency (20 Hz to 20 kHz), up and down is boost or cut. The dots mark the bands: HPF, Low, Mid and High.',
    'Underneath, the bus compressor\'s gain reduction over the last few seconds.'] },
  scribble: { title: 'Scribble strip', body: ['What is plugged into the channel, written on tape the way engineers label a desk. Drums: a pair of condenser overhead microphones. Bass: a DI box. Keys: a keyboard at line level. Lead: a condenser vocal microphone.'] },
  chmeter: { title: 'Channel meter', body: ['The channel\'s level before the fader (after the gain and EQ), in dBu. Green lights are below the working level, the white light is 0 VU (+4 dBu), amber is above it and the two red lights are close to clipping. The red lamp at the top lights if the preamp clips. A single light above the rest is the peak hold: the highest peak of the last moment, whichever way the meter reads.', 'It reads VU or PPM, as set by the switch above the main meters. Set gain by the peaks: on PPM, peaks reaching the first amber light (+6 to +8 dBu, PPM 5½ to 6). A VU reads much lower on short, peaky sounds like drums: that is the point of having both.'] },
  'section:tape': { title: 'Song', body: ['The multitrack being mixed: four tracks of one song, one per channel, playing in time. Play starts and stops it (the space bar does too).'] },
  'tape.play': { title: 'Play / Stop', body: ['Starts and stops the song, looping. The space bar does the same.'] },
  'section:aux': { title: 'Aux masters', body: ['The overall level of each aux bus, and the reverb that Aux 2 feeds. The meters show Aux 1, Aux 2 and the reverb\'s return.'] },
  'aux1.master': { title: 'Aux 1 master', body: ['The overall level of the Aux 1 bus (the headphone or monitor mix) before it leaves the desk.'] },
  'aux2.master': { title: 'Aux 2 master', body: ['The overall level of the Aux 2 bus going to the reverb.'] },
  'rev.time': { title: 'Reverb time', body: ['How long the reverb takes to die away (by 60 dB): short for a small room, long for a hall.'] },
  'rev.ret': { title: 'Reverb return', body: ['How loud the reverb comes back into the main mix. Aux 2 sends set how much of each channel goes in; the return sets how much reverb you hear overall.'] },
  auxmeter: { title: 'Aux meters', body: ['The level of the Aux 1 bus, the Aux 2 bus (going into the reverb), and the reverb coming back, in dBu (the white light is 0 VU), reading VU or PPM like the rest of the desk.'] },
  'section:bc': { title: 'Bus compressor', body: ['A compressor across the whole main mix, after the channels are added together. Used gently (a low ratio, 1 to 3 dB of gain reduction) it "glues" the mix: the parts sit together and move as one. It works exactly like the NF-C1, with a soft knee fixed at 6 dB.'], tip: 'Load "Glued with the bus comp" and switch it in and out, matching the loudness with Makeup first.' },
  'bc.on': { title: 'Bus compressor in', body: ['Switches the bus compressor in and out. The GR meter keeps showing what it would do even when it is out.'] },
  'bc.thresh': { title: 'Threshold', body: ['The level of the main mix where the compression starts.'] },
  'bc.ratio': { title: 'Ratio', body: ['How strongly the mix is turned down above the threshold. Bus compression is usually gentle: 2:1 to 4:1.'] },
  'bc.attack': { title: 'Attack', body: ['How fast it reacts. Slower attacks (10 to 30 ms) let the drums\' hits through and keep the mix punchy.'] },
  'bc.release': { title: 'Release', body: ['How fast it lets go. Set it so the gain reduction meter moves in time with the music.'] },
  'bc.makeup': { title: 'Makeup', body: ['Turns the mix back up after compression, so in and out can be compared at the same loudness.'] },
  grmeter: { title: 'Bus compressor GR', body: ['How far the bus compressor is turning the mix down. Each light is 1 dB.'] },
  'section:main': { title: 'Main and monitor', body: ['The main fader sets the level of the whole mix. The Monitor switch chooses what you hear: the Main mix, Aux 1 (the headphone mix) or Aux 2 (what goes to the reverb). Solo overrides it while any channel is soloed.'] },
  'main.fader': { title: 'Main fader', body: ['The level of the whole stereo mix, after the bus compressor. Keep it near 0 dB and balance the mix on the channel faders.'] },
  'mon.src': { title: 'Monitor', body: ['What you hear: the Main mix, the Aux 1 bus (a performer\'s headphone mix) or the Aux 2 bus (what is being sent to the reverb). While any channel is soloed, you hear the solo instead.'] },
  'mon.vol': { title: 'Listen', body: ['Your listening level. It does not change the mix or any meter.'] },
  'section:mtr': { title: 'Main meters', body: [
    'A pair of moving-needle meters for the main mix (left and right), and the switch that sets how every meter on the desk reads: VU or PPM.',
    'While any channel is soloed, these meters (and the main LED meters) read the solo instead of the mix, and the PFL light flashes. That is how engineers set gain: solo the channel, switch to PPM, and turn its gain until the peaks reach about 6.'] },
  'meter.mode': { title: 'Meters: VU or PPM', body: [
    'VU (volume unit) meters show the AVERAGE level. They take about 300 ms to rise, so they ignore short peaks and show how loud the music feels. 0 VU is the desk\'s working level (+4 dBu). Normal music reads around 0 VU, with the needle swinging a few dB either side.',
    'A PPM (peak programme meter) shows the PEAKS. It rises almost instantly and falls back slowly, so you can read even the shortest hit. This is the British broadcast style: marks 1 to 7, 4 dB apart; 4 is 0 dBu and 6 (+8 dBu) is the usual highest peak.',
    'The same music reads very differently on the two. Drums, all short hits, look much louder on a PPM than on a VU; a sustained pad reads about the same on both. That gap is the music\'s peak-to-average ratio (its crest factor), which is what compressors and limiters reduce.'],
    tip: 'Solo the Drums (PFL) and switch between VU and PPM. The PPM\'s needle kicks up to about 6 on every hit; the VU\'s hardly leaves the left-hand end, around −15 VU, because the drums are short hits with little in between. Solo the Keys or the Lead: the VU sits noticeably higher, because the notes ring on.' },
  needlemeter: { title: 'Needle meter', body: ['A moving-coil meter for the main mix: left or right. Its face changes with the VU/PPM switch. The red part of the scale is above the working level (VU) or above the usual peak limit (PPM).'] },
  pfllamp: { title: 'PFL light', body: ['Flashes while any channel is soloed: you are hearing, and the main meters are showing, the solo (pre-fade listen) instead of the main mix. A flashing light is hard to miss, so nobody mixes by accident while listening to a solo.'] },
  alignment: { title: 'Alignment: 0 VU = +4 dBu = −18 dBFS', body: [
    'Analogue desks work at a nominal level of +4 dBu, shown as 0 on a VU meter. They can go about 20 dB above that before distorting: that space is headroom, there for the peaks.',
    'A digital recorder clips at 0 dBFS, so the two are lined up with 0 VU at −18 dBFS: a +4 dBu signal records at −18 dBFS, leaving 18 dB above it for peaks, and 0 dBFS is +22 dBu. All levels on this desk and its screens are in dBu.'] },
  mainmeter: { title: 'Main LED meters', body: ['The left and right levels of the main mix, after the main fader, in dBu, reading VU or PPM like the rest of the desk (the white light is 0 VU). The red lamps at the top light if the mix reaches 0 dBFS (+22 dBu), the most a digital recording can hold. While anything is soloed they read the solo instead (PFL).'] },
};
