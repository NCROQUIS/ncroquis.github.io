function channel() {
  const module = window.NcqSound;
  if (!module?.enabled('sfx')) return null;
  try { const ctx = module.context(), output = module.output('sfx'); return ctx && output ? { ctx, output } : null; } catch { return null; }
}
function note(frequency, delay, duration, volume, type = 'triangle') {
  const audio = channel(); if (!audio) return;
  const { ctx, output } = audio, time = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator(), gain = ctx.createGain();
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, time);
  gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(volume, time + .006); gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
  oscillator.connect(gain).connect(output); oscillator.start(time); oscillator.stop(time + duration + .01);
}
export function playLaunch(delay = .5) {
  const audio = channel(); if (!audio) return;
  const { ctx, output } = audio, time = ctx.currentTime + delay, length = Math.floor(ctx.sampleRate * .28);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.sin(i / length * Math.PI) * .09;
  const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
  source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.setValueAtTime(350, time); filter.frequency.exponentialRampToValueAtTime(2700, time + .25);
  source.connect(filter).connect(output); source.start(time);
}
export function playClack(index) {
  const audio = channel(); if (!audio) return;
  const { ctx, output } = audio, length = Math.floor(ctx.sampleRate * .055), buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / length * 9);
  const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(); source.buffer = buffer;
  filter.type = 'bandpass'; filter.frequency.value = 1400 + index * 220; filter.Q.value = .8; gain.gain.value = .26;
  source.connect(filter).connect(gain).connect(output); source.start(); note(240 + index * 37, 0, .065, .06);
}
export function playResult(extra) { (extra ? [523.25,659.25,783.99,1046.5] : [587.33,783.99]).forEach((frequency, index) => note(frequency, index * .075, .23, .045)); }
export function playStep(index = 0, final = false) {
  note(170 + index * 13, 0, .065, final ? .055 : .04, 'triangle');
  note(520 + index * 19, 0, .035, final ? .028 : .018, 'sine');
}
export function playCapture() { note(440, 0, .12, .06); note(880, .08, .18, .05); }
