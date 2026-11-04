// 사운드 — 파일 없이 Web Audio로 직접 만든다 (용량·라이선스 걱정 없음).
// 질감: 나무 블록이 부딪히는 '톡'(밀기), 마림바 같은 부드러운 음(합치기).
// 합치기 음은 타일 단계마다 C장조 5음 음계를 한 칸씩 올라가서, 2→4→8…이 노래처럼 이어진다.
// 첫 터치 뒤에 켜지고(unlock), 화면이 가려지면 멈춘다.

// C장조 5음 음계 (도 레 미 솔 라) — 어떤 순서로 겹쳐도 불협화음이 안 난다
const PENTA = [0, 2, 4, 7, 9];
const BASE = 261.63; // 도(C4)
export function tierFreq(v) {
  const step = Math.max(0, Math.round(Math.log2(v)) - 1); // 2 → 0단계, 4 → 1단계 …
  const oct = Math.floor(step / PENTA.length);
  const semi = PENTA[step % PENTA.length] + 12 * oct;
  return BASE * Math.pow(2, Math.min(semi, 36) / 12);
}

export function createSfx(isOn) {
  let ctx = null, master = null, wet = null, noiseBuf = null;

  function setup() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // 소리가 겹쳐도 튀지 않게 압축기 → 출력
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
    // 아주 짧은 잔향 (방 안에서 울리는 느낌)
    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 0.5);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    conv.buffer = ir;
    wet = ctx.createGain(); wet.gain.value = 0.16;
    wet.connect(conv).connect(master);
    // 나무 '톡'에 쓸 짧은 잡음
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
    const n = noiseBuf.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  }

  const ready = () => ctx && isOn() && !document.hidden && ctx.state === "running";
  const out = (node, dry = 1) => { const g = ctx.createGain(); g.gain.value = dry; node.connect(g).connect(master); node.connect(wet); };

  // 마림바 음: 기본음 + 4배 배음(나무 막대 특유의 '똥' 소리), 빠른 감쇠
  function mallet(freq, at = 0, vol = 0.22, dur = 0.55) {
    const t = ctx.currentTime + at;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out(g);
    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 3.99;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.35, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.25);
    o1.connect(g); o2.connect(g2).connect(g);
    o1.start(t); o2.start(t); o1.stop(t + dur); o2.stop(t + dur);
  }

  // 나무 블록 '톡': 걸러낸 잡음 + 낮은 쿵
  function knock(at = 0, pitch = 1, vol = 0.18) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700 * pitch; bp.Q.value = 3.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(bp).connect(g); out(g, 0.9);
    src.start(t); src.stop(t + 0.08);
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(190 * pitch, t); o.frequency.exponentialRampToValueAtTime(90 * pitch, t + 0.06);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(vol * 0.9, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g2); out(g2);
    o.start(t); o.stop(t + 0.08);
  }

  // 반짝임: 높은 음 여러 개가 흩어짐
  function shimmer(at = 0, count = 6, base = 1568) {
    for (let i = 0; i < count; i++) {
      const f = base * Math.pow(2, PENTA[i % 5] / 12) * (i >= 5 ? 2 : 1);
      mallet(f, at + i * 0.045 + Math.random() * 0.02, 0.05, 0.4);
    }
  }

  const api = {
    unlock() {
      try {
        if (!ctx) setup();
        if (ctx.state === "suspended") ctx.resume();
      } catch { ctx = null; }
    },
    // 밀기: 나무 블록 톡
    slide() { if (ready()) knock(0, 1, 0.14); },
    // 못 미는 방향: 둔하고 낮은 톡
    bump() { if (ready()) knock(0, 0.55, 0.10); },
    // 합치기: 이번에 합친 값들을 낮은 것부터 짧게 굴리듯 (2쌍 이상이면 화음)
    merge(values) {
      if (!ready()) return;
      const vs = [...new Set(values)].sort((a, b) => a - b).slice(-4);
      knock(0, 1.1, 0.10);
      vs.forEach((v, i) => mallet(tierFreq(v), 0.012 + i * 0.035, v >= 128 ? 0.26 : 0.2, v >= 128 ? 0.8 : 0.55));
    },
    // 최고 기록 갱신: 맑은 두 음 + 반짝
    record() { if (!ready()) return; mallet(1046.5, 0, 0.16); mallet(1568, 0.08, 0.16); shimmer(0.14, 5); },
    // 목표 달성·최고 타일: 위로 올라가는 아르페지오
    fanfare() { if (!ready()) return; [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => mallet(f, i * 0.085, 0.2, 0.7)); shimmer(0.36, 6); },
    // 큰 순간(512·1024·2048): 낮은 울림 + 화음 + 반짝임이 크게
    big(v) {
      if (!ready()) return;
      const root = tierFreq(v) / 2;
      mallet(root / 2, 0, 0.3, 1.4);
      [1, 1.25, 1.5, 2].forEach((m, i) => mallet(root * m, 0.06 + i * 0.07, 0.22, 1.1));
      shimmer(0.4, v >= 2048 ? 10 : 7, 1318.5);
    },
    // 게임 끝: 천천히 내려가는 세 음
    over() { if (!ready()) return; [392, 329.63, 261.63].forEach((f, i) => mallet(f, i * 0.16, 0.18, 0.9)); },
    suspend: () => ctx?.suspend(),
    resume: () => ctx?.resume(),
    get state() { return ctx ? ctx.state : "none"; },
  };
  return api;
}
