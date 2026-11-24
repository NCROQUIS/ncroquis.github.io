import {getGameAudio} from './game-audio.mjs';
const noiseBuffers = new WeakMap();
function noiseBuffer(ctx) {
  if (!noiseBuffers.has(ctx)) {
    const length = Math.floor(ctx.sampleRate * .28);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const envelope = Math.sin(i / length * Math.PI) * .09;
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    noiseBuffers.set(ctx, buffer);
  }
  return noiseBuffers.get(ctx);
}
function releaseOnEnd(source, ...nodes) {
  source.onended = () => {
    source.disconnect();
    for (const node of nodes) node.disconnect();
    source.onended = null;
  };
}
function channel() {
  const module = window.NcqSound;
  if (!module?.enabled('sfx') || module.volume?.('sfx')===0 || module.state?.().active===false || globalThis.document?.hidden) return null;
  try { const ctx = module.context(), output = module.output('sfx'); return ctx && output ? { ctx, output } : null; } catch { return null; }
}
export function playLaunch(delay = .5) {
  const audio = channel(); if (!audio) return;
  const { ctx, output } = audio, time = ctx.currentTime + delay;
  const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
  source.buffer = noiseBuffer(ctx); filter.type = 'lowpass'; filter.frequency.setValueAtTime(350, time); filter.frequency.exponentialRampToValueAtTime(2700, time + .25);
  source.connect(filter).connect(output); releaseOnEnd(source, filter); source.start(time);
  getGameAudio()?.track({stop(){try{source.stop();}catch{}}},'motion',delay+.3);
}
export function playClack(index) {
  return getGameAudio()?.play('wood',{volume:.24+index*.005,gap:0});
}
export function playResult(extra) {return getGameAudio()?.play(extra?'bonus':'normal',{volume:extra?.65:.55});}
export function playStep(index = 0, final = false) {
  return getGameAudio()?.play('wood',{volume:final?.2:.16,gap:0});
}
export function playCapture() {return getGameAudio()?.play('capture',{volume:.8,group:'effects'});}
export function cancelMotionAudio(){getGameAudio()?.cancel('motion');}
