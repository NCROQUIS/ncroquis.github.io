// 자체 음원 합성기 — 작곡 결과를 Web Audio로 그때그때 연주해요. 음원 파일·라이선스가 필요 없어요.
// v0.2: 콤보 레벨별 레이어 버스, 플레이어 키사운드(일렉피아노), 리버브, 킥 사이드체인.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Synth {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = AC ? new AC({ latencyHint: 'interactive' }) : null;
    this.muted = false;
    this.timer = null;
    this.level = 0;
    this.holdVoices = new Map();
    if (!this.ctx) return;
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.85;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    this.master.connect(comp).connect(c.destination);
    // 리버브 (짧은 홀 느낌의 합성 임펄스)
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.6);
    this.revSend = c.createGain();
    this.revSend.gain.value = 0.22;
    this.revSend.connect(this.reverb).connect(this.master);
    // 노이즈 버퍼
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.keysBus = c.createGain();
    this.keysBus.gain.value = 0.9;
    this.keysBus.connect(this.master);
    this.keysBus.connect(this.revSend);
    this.buildMusicBuses();
  }

  buildMusicBuses() {
    const c = this.ctx;
    this.musicBus = c.createGain();
    this.musicBus.connect(this.master);
    // 사이드체인: 킥이 칠 때 베이스·패드가 살짝 숨을 쉬어요
    this.duck = c.createGain();
    this.duck.connect(this.musicBus);
    this.layers = [0, 1, 2, 3].map((i) => {
      const g = c.createGain();
      g.gain.value = i <= this.level ? 1 : 0;
      g.connect(i === 0 ? this.musicBus : this.duck);
      if (i >= 2) g.connect(this.revSend);
      return g;
    });
  }

  makeImpulse(sec) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  get ok() {
    return !!this.ctx;
  }

  // 출력 지연(스피커까지 걸리는 시간)을 판정 시각에 반영해요
  get latency() {
    if (!this.ctx) return 0;
    return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  now() {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  async unlock() {
    if (this.ctx && this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch (e) {
        /* 사용자 동작 전에는 실패할 수 있어요 */
      }
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.01);
  }

  // 콤보 레벨에 맞춰 레이어를 켜고 꺼요 (켤 땐 빠르게, 끌 땐 조금 천천히)
  setLevel(level) {
    this.level = level;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.layers.forEach((g, i) => {
      const on = i <= level;
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.03 : 0.25);
    });
  }

  play(comp, startAt, ghosts = []) {
    this.stop();
    if (!this.ctx) return;
    this.startAt = startAt;
    this.queue = [...comp.events, ...ghosts.map((g) => ({ t: g.t, kind: 'ghost', midi: g.midi, dur: g.dur, layer: 2 }))].sort((a, b) => a.t - b.t);
    this.idx = 0;
    const tick = () => {
      const horizon = this.ctx.currentTime + 0.2;
      const ev = this.queue;
      while (this.idx < ev.length && this.startAt + ev[this.idx].t < horizon) {
        const e = ev[this.idx++];
        const t = this.startAt + e.t;
        if (t < this.ctx.currentTime - 0.05) continue;
        this.voice(e, Math.max(t, this.ctx.currentTime));
      }
    };
    tick();
    this.timer = setInterval(tick, 25);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const v of this.holdVoices.values()) v.stop();
    this.holdVoices.clear();
    if (this.ctx && this.musicBus) {
      // 이미 예약된 소리를 끊으려고 버스를 새로 만들어요
      this.musicBus.disconnect();
      for (const g of this.layers) g.disconnect();
      this.duck.disconnect();
      this.buildMusicBuses();
    }
  }

  async pause() {
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
  }

  async resume() {
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
  }

  env(g, t, a, peak, dur, rel = 0.05) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
  }

  osc(type, freq, t, dur, peak, dest, a = 0.005, filterHz = null, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = this.ctx.createGain();
    let node = o;
    if (filterHz) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterHz;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(dest);
    this.env(g, t, a, peak, dur);
    o.start(t);
    o.stop(t + dur + 0.1);
    return o;
  }

  noiseHit(t, dur, peak, type, freq, dest) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    s.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  // 일렉피아노 한 음: FM(사인 캐리어 + 감쇠하는 모듈레이터)으로 '팅' 하는 어택을 만들어요.
  // sustain=true면 release()를 부를 때까지 울려요 (홀드 노트).
  ep(midi, t, dur, peak, dest, sustain = false) {
    const c = this.ctx;
    const f = mtof(midi);
    const car = c.createOscillator();
    car.frequency.value = f;
    const mod = c.createOscillator();
    mod.frequency.value = f * 2;
    const modGain = c.createGain();
    modGain.gain.setValueAtTime(f * 2.2, t);
    modGain.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.35);
    mod.connect(modGain).connect(car.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    const tail = sustain ? 30 : Math.max(0.25, dur);
    g.gain.exponentialRampToValueAtTime(peak * (sustain ? 0.55 : 0.35), t + 0.25);
    if (!sustain) g.gain.exponentialRampToValueAtTime(0.0001, t + tail + 0.3);
    // 한 옥타브 위 사인으로 반짝임 추가
    const bell = c.createOscillator();
    bell.frequency.value = f * 4;
    const bg = c.createGain();
    bg.gain.setValueAtTime(peak * 0.18, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    bell.connect(bg).connect(dest);
    car.connect(g).connect(dest);
    [car, mod].forEach((o) => {
      o.start(t);
      o.stop(t + tail + 0.4);
    });
    bell.start(t);
    bell.stop(t + 0.25);
    return {
      stop: () => {
        const n = c.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n);
        g.gain.exponentialRampToValueAtTime(0.0001, n + 0.12);
        [car, mod].forEach((o) => { try { o.stop(n + 0.15); } catch (e) { /* 이미 멈춤 */ } });
      },
    };
  }

  voice(e, t) {
    const bus = this.layers[e.layer ?? 0];
    switch (e.kind) {
      case 'kick': {
        const c = this.ctx;
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.setValueAtTime(160, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
        g.gain.setValueAtTime(1, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        o.connect(g).connect(bus);
        o.start(t);
        o.stop(t + 0.34);
        this.noiseHit(t, 0.012, 0.3, 'highpass', 3000, bus);
        this.duck.gain.setValueAtTime(0.45, t);
        this.duck.gain.setTargetAtTime(1, t + 0.02, 0.07);
        break;
      }
      case 'snare':
        this.noiseHit(t, 0.18, 0.5, 'bandpass', 1900, bus);
        this.osc('triangle', 185, t, 0.07, 0.3, bus);
        break;
      case 'hat':
        this.noiseHit(t, 0.03, 0.1, 'highpass', 8500, bus);
        break;
      case 'openhat':
        this.noiseHit(t, 0.12, 0.08, 'highpass', 7500, bus);
        break;
      case 'crash':
        this.noiseHit(t, 1.2, 0.18, 'highpass', 5000, bus);
        break;
      case 'bass':
        this.osc('sawtooth', mtof(e.midi), t, e.dur, 0.2, bus, 0.005, 380);
        this.osc('sine', mtof(e.midi - 12), t, e.dur, 0.22, bus);
        break;
      case 'pad':
        for (const m of e.midis) {
          this.osc('sawtooth', mtof(m), t, e.dur, 0.018, bus, 0.3, 1400, -8);
          this.osc('sawtooth', mtof(m), t, e.dur, 0.018, bus, 0.3, 1400, 8);
        }
        break;
      case 'arp':
        this.osc('square', mtof(e.midi), t, e.dur, 0.035, bus, 0.003, 2600);
        break;
      case 'ghost':
        this.ep(e.midi, t, e.dur, 0.06, bus);
        break;
      default:
    }
  }

  // 플레이어가 친 노트의 소리 (키사운드). 홀드는 hold id로 붙잡아 두고 떼면 멈춰요.
  key(note, judge, holdId = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const peak = judge === 'good' ? 0.16 : 0.24;
    const midis = note.chord || [note.midi];
    const voices = midis.map((m) => this.ep(m, t, note.dur || 0.3, peak / Math.sqrt(midis.length), this.keysBus, holdId != null));
    if (holdId != null) this.holdVoices.set(holdId, { stop: () => voices.forEach((v) => v.stop()) });
  }

  releaseKey(holdId) {
    const v = this.holdVoices.get(holdId);
    if (v) v.stop();
    this.holdVoices.delete(holdId);
  }

  // 플릭: 위로 쓸어올리는 소리 + 심벌
  flick() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(800, t);
    f.frequency.exponentialRampToValueAtTime(9000, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    s.connect(f).connect(g).connect(this.keysBus);
    s.start(t);
    s.stop(t + 0.3);
    this.noiseHit(t, 0.7, 0.14, 'highpass', 6000, this.keysBus);
  }

  // 미스: 둔탁한 '툭'
  miss() {
    if (!this.ctx || this.muted) return;
    this.osc('triangle', 110, this.ctx.currentTime, 0.08, 0.12, this.keysBus, 0.002, 600);
  }
}

// 진동 (지원 기기만). iOS Safari는 navigator.vibrate가 없어요.
export function vibrate(ms) {
  try {
    const active = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (navigator.vibrate && active) navigator.vibrate(ms);
  } catch (e) {
    /* 무시 */
  }
}
