// Decode one small music asset once, then loop it on the audio clock. NcqSound
// owns the context, channel volume/mute, gesture unlock and platform pauses.
export function createLoopMusic({ sound = globalThis.NcqSound, src, volume = .45, fade = .6,
  fetchAsset = (...args) => globalThis.fetch(...args) } = {}) {
  let wanted = false, ctx, bus, buffer, loading, voice, offset = 0, generation = 0;
  let streaming = typeof sound?.context !== 'function' || typeof sound?.output !== 'function';

  function stop(reset = false) {
    if (voice) {
      const old = voice, at = ctx.currentTime, tail = reset ? fade : .04;
      offset = reset ? 0 : (offset + at - old.started + tail) % buffer.duration;
      voice = null;
      old.gain.gain.cancelScheduledValues(at);
      old.gain.gain.setValueAtTime(old.gain.gain.value, at);
      old.gain.gain.linearRampToValueAtTime(0, at + tail);
      old.node.stop(at + tail);
    } else if (reset) offset = 0;
  }

  async function prepare() {
    if (buffer || streaming) return;
    if (!loading) loading = (async () => {
      ctx = sound.context(); bus = sound.output('bgm');
      if (!ctx || !bus) { streaming = true; return; }
      const response = await fetchAsset(src);
      if (!response.ok) throw Error('Music asset could not be loaded.');
      buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    })().catch(() => { streaming = true; });
    await loading;
  }

  async function sync() {
    const token = ++generation;
    if (streaming) {
      sound?.bgm(wanted ? src : null, {volume, fade, loop:true});
      return;
    }
    if (!wanted || !sound.enabled('bgm')) { stop(!wanted); return; }
    if (voice) return;
    await prepare();
    if (token !== generation || !wanted || !sound.enabled('bgm')) return;
    if (streaming) { sound.bgm(src, {volume, fade, loop:true}); return; }
    try {
      const node = ctx.createBufferSource(), gain = ctx.createGain(), at = ctx.currentTime;
      node.buffer = buffer; node.loop = true;
      node.connect(gain); gain.connect(bus);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + fade);
      voice = {node, gain, started:at};
      node.onended = () => { node.disconnect(); gain.disconnect(); };
      node.start(at, offset);
    } catch {
      streaming = true; stop(); sound.bgm(src, {volume, fade, loop:true});
    }
  }

  sound?.onChange?.(() => { void sync(); });
  return {
    scene(active) {
      active = Boolean(active);
      if (active === wanted) return;
      wanted = active; void sync();
    },
    state() {
      if (streaming) return {...sound?.state?.().bgm, mode:'stream', src:wanted ? src : '', wanted};
      return {mode:'buffer', src:wanted ? src : '', wanted, loaded:Boolean(buffer),
        playing:Boolean(voice && ctx.state === 'running' && sound.enabled('bgm') && sound.state?.().active !== false),
        duration:buffer?.duration ?? null, sampleRate:buffer?.sampleRate ?? null,
        decodedBytes:buffer ? buffer.length * buffer.numberOfChannels * 4 : 0};
    },
  };
}
