// 포켓 솔리테어 — 사운드 (음원 파일 없이 Web Audio로 실시간 합성)
// BGM: 느린 4코드 앰비언트(패드 + 드문드문 피아노 음 + 잔향), 효과음: 카드 놓기·뒤집기·넘기기·파운데이션 종소리·불가·힌트,
// 클리어: 상승 아르페지오 + 화음 + 반짝임 팡파르. 브라우저 정책상 첫 터치 이후에 소리가 나요.

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// D장조, 4마디 진행: Dmaj7 → Bm7 → Gmaj7 → A6 (마디당 8초)
const CHORDS = [
  { pad: [50, 57, 61, 64], bass: 38 },
  { pad: [47, 54, 57, 62], bass: 35 },
  { pad: [55, 59, 62, 66], bass: 43 },
  { pad: [57, 61, 64, 66], bass: 45 },
];
const PENTA = [74, 76, 78, 81, 83, 86, 88]; // D 펜타토닉 (멜로디)
const BAR = 8; // 초
const BEAT = 1;

let ctx = null;
let master; let musicBus; let sfxBus; let reverb; let reverbSend; let comp;
let noiseBuf = null;
let musicOn = true;
let sfxOn = true;
let musicPlaying = false;
let schedTimer = null;
let nextBeatTime = 0;
let beatIndex = 0;
let lastMelody = 3;

function makeImpulse(seconds = 3.2, decay = 2.6) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

function init() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp).connect(ctx.destination);
  reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse();
  const revOut = ctx.createGain();
  revOut.gain.value = 0.55;
  reverb.connect(revOut).connect(master);
  reverbSend = ctx.createGain();
  reverbSend.gain.value = 1;
  reverbSend.connect(reverb);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(master);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.7;
  sfxBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });
  return true;
}

// ---------- 합성 도구 ----------
function tone({ freq, type = 'sine', start, dur, gain = 0.1, attack = 0.005, release = null, out, rev = 0, detune = 0, filter = null }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + attack);
  if (release === null) g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  else {
    g.gain.setValueAtTime(gain, start + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur + release);
  }
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.value = filter.freq;
    f.Q.value = filter.q ?? 0.7;
    node.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(out);
  if (rev) {
    const s = ctx.createGain();
    s.gain.value = rev;
    g.connect(s).connect(reverbSend);
  }
  o.start(start);
  o.stop(start + dur + (release || 0) + 0.05);
  return o;
}

function noise({ start, dur, gain = 0.2, type = 'bandpass', freq = 2000, freqEnd = null, q = 1, out = sfxBus, rev = 0 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, start);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + Math.min(0.008, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(out);
  if (rev) {
    const s = ctx.createGain();
    s.gain.value = rev;
    g.connect(s).connect(reverbSend);
  }
  src.start(start, Math.random() * 0.5);
  src.stop(start + dur + 0.05);
}

// 부드러운 종·피아노 느낌 (기음 + 배음 몇 개, 빠른 감쇠)
function bell(freq, start, gain, dur = 1.2, out = sfxBus, rev = 0.5) {
  tone({ freq, start, dur, gain, attack: 0.004, out, rev });
  tone({ freq: freq * 2, start, dur: dur * 0.5, gain: gain * 0.28, attack: 0.003, out, rev });
  tone({ freq: freq * 3.01, start, dur: dur * 0.25, gain: gain * 0.1, attack: 0.002, out, rev });
}

// ---------- BGM ----------
function scheduleBeat(t, i) {
  const bar = Math.floor(i / (BAR / BEAT)) % CHORDS.length;
  const beatInBar = i % (BAR / BEAT);
  const chord = CHORDS[bar];
  if (beatInBar === 0) {
    // 패드: 살짝 어긋난 두 음으로 따뜻하게, 앞 코드와 겹치며 바뀜
    chord.pad.forEach((m, k) => {
      const f = mtof(m);
      const common = { start: t, dur: BAR - 0.5, gain: 0.032, attack: 2.4, release: 2.8, out: musicBus, rev: 0.7, filter: { freq: 900, q: 0.4 } };
      tone({ ...common, freq: f, type: 'triangle', detune: -5 + k });
      tone({ ...common, freq: f, type: 'sine', detune: 6 - k, gain: 0.026 });
    });
    tone({ freq: mtof(chord.bass), type: 'sine', start: t, dur: BAR - 1, gain: 0.07, attack: 1.2, release: 2, out: musicBus, rev: 0.2 });
  }
  // 멜로디: 드문드문, 가까운 음으로 걸어가듯 (집중을 방해하지 않게)
  const chance = beatInBar === 0 ? 0.25 : beatInBar % 2 === 0 ? 0.42 : 0.18;
  if (Math.random() < chance) {
    const step = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
    lastMelody = Math.max(0, Math.min(PENTA.length - 1, lastMelody + step));
    const swing = beatInBar % 2 ? 0.08 : 0;
    bell(mtof(PENTA[lastMelody]), t + swing, 0.045, 2.4, musicBus, 0.9);
  }
}

function scheduler() {
  while (nextBeatTime < ctx.currentTime + 0.6) {
    scheduleBeat(nextBeatTime, beatIndex++);
    nextBeatTime += BEAT;
  }
}

function startMusic() {
  if (!ctx || musicPlaying || !musicOn) return;
  musicPlaying = true;
  nextBeatTime = ctx.currentTime + 0.1;
  beatIndex = 0;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
  musicBus.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 4);
  schedTimer = setInterval(scheduler, 200);
  scheduler();
}

function stopMusic() {
  if (!ctx || !musicPlaying) return;
  musicPlaying = false;
  clearInterval(schedTimer);
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
  musicBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
}

function duck(seconds = 3) {
  if (!ctx || !musicPlaying) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setValueAtTime(musicBus.gain.value, t);
  musicBus.gain.linearRampToValueAtTime(0.12, t + 0.3);
  musicBus.gain.setValueAtTime(0.12, t + seconds);
  musicBus.gain.linearRampToValueAtTime(0.55, t + seconds + 3);
}

// ---------- 효과음 ----------
const SFX = {
  // 카드를 펠트 위에 내려놓는 소리
  place(t) {
    noise({ start: t, dur: 0.05, gain: 0.32, freq: 1900, q: 0.9 });
    tone({ freq: 170, start: t, dur: 0.07, gain: 0.12, out: sfxBus });
  },
  flip(t) {
    noise({ start: t, dur: 0.08, gain: 0.16, type: 'highpass', freq: 2600, q: 0.5 });
    noise({ start: t + 0.03, dur: 0.04, gain: 0.14, freq: 3200, q: 1.5 });
  },
  draw(t) {
    noise({ start: t, dur: 0.11, gain: 0.2, freq: 3200, freqEnd: 1300, q: 1.1 });
  },
  recycle(t) {
    noise({ start: t, dur: 0.32, gain: 0.18, freq: 900, freqEnd: 3200, q: 0.8 });
    tone({ freq: 330, start: t + 0.05, dur: 0.25, gain: 0.04, out: sfxBus, rev: 0.3 });
  },
  // 파운데이션에 올릴 때 맑은 종소리, 랭크가 오를수록 음이 올라감
  foundation(t, rank = 1) {
    SFX.place(t);
    const m = PENTA[0] - 12 + [0, 2, 4, 7, 9][(rank - 1) % 5] + 12 * Math.floor((rank - 1) / 5);
    bell(mtof(m), t + 0.01, 0.1, 0.9);
  },
  invalid(t) {
    tone({ freq: 196, type: 'triangle', start: t, dur: 0.09, gain: 0.12, out: sfxBus, filter: { freq: 700 } });
    tone({ freq: 165, type: 'triangle', start: t + 0.1, dur: 0.12, gain: 0.12, out: sfxBus, filter: { freq: 600 } });
  },
  undo(t) {
    noise({ start: t, dur: 0.09, gain: 0.18, freq: 1200, freqEnd: 2800, q: 1 });
  },
  hint(t) {
    bell(mtof(86), t, 0.06, 0.6, sfxBus, 0.6);
    bell(mtof(93), t + 0.09, 0.05, 0.7, sfxBus, 0.6);
  },
  deal(t) {
    for (let i = 0; i < 12; i++) noise({ start: t + i * 0.055, dur: 0.035, gain: 0.12, freq: 2200 + Math.random() * 800, q: 1.2 });
  },
  tap(t) {
    tone({ freq: 1200, start: t, dur: 0.03, gain: 0.03, out: sfxBus });
  },
  pop(t) {
    noise({ start: t, dur: 0.18, gain: 0.16, type: 'lowpass', freq: 900, q: 0.5, rev: 0.4 });
    for (let i = 0; i < 6; i++) noise({ start: t + 0.08 + Math.random() * 0.3, dur: 0.02, gain: 0.05, freq: 4000 + Math.random() * 3000, q: 2, rev: 0.5 });
  },
  // 클리어 팡파르: 상승 아르페지오 → 밝은 화음 → 반짝임
  win(t) {
    duck(4.5);
    const arp = [62, 66, 69, 74, 78, 81, 86];
    arp.forEach((m, i) => bell(mtof(m), t + i * 0.085, 0.09, 1.1, sfxBus, 0.5));
    const tc = t + arp.length * 0.085 + 0.05;
    [74, 78, 81, 86].forEach((m, i) => {
      tone({ freq: mtof(m), type: 'triangle', start: tc, dur: 1.2, gain: 0.055, attack: 0.02, release: 1.6, out: sfxBus, rev: 0.7, detune: i * 3 });
      tone({ freq: mtof(m) * 2, type: 'sine', start: tc, dur: 0.6, gain: 0.02, attack: 0.01, release: 1, out: sfxBus, rev: 0.7 });
    });
    tone({ freq: mtof(38), type: 'sine', start: tc, dur: 0.8, gain: 0.12, attack: 0.01, release: 1, out: sfxBus });
    noise({ start: tc - 0.05, dur: 0.6, gain: 0.08, type: 'highpass', freq: 5000, q: 0.4, rev: 0.6 });
    for (let i = 0; i < 16; i++) {
      bell(mtof(PENTA[Math.floor(Math.random() * PENTA.length)] + 12), tc + 0.2 + Math.random() * 1.6, 0.025, 0.4, sfxBus, 0.8);
    }
  },
};

export const Sound = {
  get supported() { return !!(window.AudioContext || window.webkitAudioContext); },
  // 광고를 보는 동안 멈추기
  pause() { try { if (ctx && ctx.state === 'running') ctx.suspend(); } catch { /* 무시 */ } },
  resume() { try { if (ctx && ctx.state === 'suspended' && !document.hidden) ctx.resume(); } catch { /* 무시 */ } },
  // 첫 터치에서 호출 (브라우저 자동재생 정책)
  unlock() {
    if (!init()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (musicOn) startMusic();
  },
  setMusic(on) {
    musicOn = !!on;
    if (!ctx) return;
    if (musicOn) startMusic();
    else stopMusic();
  },
  setSfx(on) { sfxOn = !!on; },
  play(name, arg, delay = 0) {
    if (!sfxOn || !ctx || ctx.state !== 'running' || !SFX[name]) return;
    try { SFX[name](ctx.currentTime + 0.005 + delay, arg); } catch { /* 소리 실패는 무시 */ }
  },
  get state() {
    return { ready: !!ctx, ctx: ctx?.state, musicOn, sfxOn, musicPlaying };
  },
};
