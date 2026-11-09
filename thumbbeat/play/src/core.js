// 엄지비트 코어 로직 — 작곡, 채보 생성, 판정. 브라우저와 Node 테스트에서 함께 쓰는 순수 모듈이에요.
//
// v0.2 재미 설계 (기존 리듬게임 분석 반영)
// - 키사운드: 노트마다 음높이(midi)를 붙여, 플레이어가 쳐야 멜로디가 나와요 (Piano Tiles·Magic Tiles).
// - 콤보 레벨: 콤보가 쌓이면 레벨 0→3. 레벨마다 악기 레이어·점수 배율이 올라가고 3이면 FEVER (Amplitude·Rez의 레이어 음악).
//   미스해도 레벨은 한 칸만 내려가요 (Beatstar의 '공정한 난이도').
// - PERFECT+: ±25ms 구간을 따로 둬서 완벽을 노리게 해요 (Beatstar Perfect+).
// - 플릭 노트: 곡의 강조 지점(구간 시작, 후렴 첫 박)에 위로 튕기는 노트 (Beatstar 스와이프).

export const WINDOWS = { perfectPlus: 0.025, perfect: 0.05, great: 0.1, good: 0.15 };
export const HOLD_RELEASE_GRACE = 0.12; // 홀드 끝 이 정도 전에 떼도 성공으로 봐요
export const LEVEL_UP = [10, 25, 50]; // 이 콤보에 닿으면 다음 레벨
export const LEVEL_MULT = [1, 2, 3, 4];
export const LEVEL_NAMES = ['드럼', '베이스', '코드', 'FEVER'];

export const DIFFS = [
  { id: 'easy', name: '쉬움', minGap: 0.42, stepMod: 4, hold: false, flick: 'sections', approach: 1.35 },
  { id: 'normal', name: '보통', minGap: 0.24, stepMod: 2, hold: true, holdMin: 0.55, flick: 'accents', approach: 1.1 },
  { id: 'hard', name: '어려움', minGap: 0.14, stepMod: 1, hold: true, holdMin: 0.45, flick: 'accents', approach: 0.9 },
];

// 곡은 모두 이 게임용으로 즉석 작곡되는 자체 음원이에요 (라이선스 없음).
export const SONGS = [
  { id: 'line2', title: '2호선 아침', sub: '출근길 워밍업', bpm: 104, key: 0, scale: 'major', prog: 0, seed: 11, color: '#ff7a59', unlock: 0 },
  { id: 'transfer', title: '환승 브레이크', sub: '빠르게 갈아타기', bpm: 124, key: 2, scale: 'minor', prog: 1, seed: 29, color: '#3ddc97', unlock: 2 },
  { id: 'hangang', title: '한강 노을', sub: '퇴근길 다리 위', bpm: 96, key: 5, scale: 'major', prog: 2, seed: 47, color: '#ffc145', unlock: 5 },
  { id: 'lasttrain', title: '막차 시티팝', sub: '마지막 열차', bpm: 116, key: 9, scale: 'minor', prog: 0, seed: 83, color: '#9b7bff', unlock: 8 },
];

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const PROGS = {
  major: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4]],
  minor: [[0, 5, 2, 6], [0, 3, 6, 2], [5, 6, 0, 0]],
};
const SECTIONS = [
  { name: '출발', bars: 4, type: 'intro' },
  { name: '1구간', bars: 8, type: 'verse' },
  { name: '환승', bars: 8, type: 'chorus' },
  { name: '2구간', bars: 8, type: 'verse' },
  { name: '도착', bars: 4, type: 'outro' },
];

export function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function degreeToMidi(scale, key, base, deg) {
  const oct = Math.floor(deg / 7);
  const idx = ((deg % 7) + 7) % 7;
  return base + key + oct * 12 + scale[idx];
}

// 2마디(32스텝) 멜로디 모티프를 만들어요.
function makeMotif(r, density, chordDegs) {
  const onsets = [];
  for (let s = 0; s < 32; s++) {
    let w = s % 4 === 0 ? 1.6 : s % 2 === 0 ? 1.0 : 0.35;
    if (s === 0 || s === 16) w = 9;
    if (r() < density * w) onsets.push(s);
  }
  let deg = chordDegs[0] + 7;
  return onsets.map((s, i) => {
    const next = i + 1 < onsets.length ? onsets[i + 1] : 32;
    const len = Math.min(next - s, 8);
    if (s % 16 === 0) {
      const chord = chordDegs[s >= 16 ? 1 : 0];
      const tones = [chord, chord + 2, chord + 4].map((d) => d + 7);
      deg = tones.reduce((best, d) => (Math.abs(d - deg) < Math.abs(best - deg) ? d : best), tones[0]);
    } else {
      const step = [-2, -1, -1, 1, 1, 2, 0][Math.floor(r() * 7)];
      deg = Math.max(3, Math.min(16, deg + step));
    }
    return { step: s, len, deg };
  });
}

// 이벤트 kind와 음악 레이어(콤보 레벨이 이 이상이어야 들려요)
// kick·hat: 0 / snare·bass: 1 / pad·ghost(채보에 없는 멜로디): 2 / arp·crash·openhat: 3
export function compose(song) {
  const r = rng(song.seed);
  const scale = SCALES[song.scale];
  const prog = PROGS[song.scale][song.prog % PROGS[song.scale].length];
  const stepDur = 60 / song.bpm / 4;
  const barDur = stepDur * 16;
  const events = [];
  const leads = [];
  const sections = [];
  const motifs = {
    verse: makeMotif(r, 0.3, [prog[0], prog[1]]),
    chorus: makeMotif(r, 0.42, [prog[2], prog[3]]),
  };
  let bar = 0;
  for (const sec of SECTIONS) {
    sections.push({ name: sec.name, type: sec.type, t: bar * barDur, bar });
    for (let b = 0; b < sec.bars; b++, bar++) {
      const t0 = bar * barDur;
      const chordDeg = prog[bar % 4];
      const rootMidi = degreeToMidi(scale, song.key, 36, chordDeg);
      const chordMidis = [0, 2, 4].map((o) => degreeToMidi(scale, song.key, 60, chordDeg + o));
      for (let s = 0; s < 16; s++) {
        const t = t0 + s * stepDur;
        const kick = s === 0 || s === 8 || (sec.type === 'chorus' && (s === 10 || s === 14));
        if (kick) events.push({ t, kind: 'kick', layer: 0 });
        if (sec.type !== 'intro' && (s === 4 || s === 12)) events.push({ t, kind: 'snare', layer: 1 });
        if (s % 2 === 0 && !(sec.type === 'outro' && b >= 2)) events.push({ t, kind: 'hat', layer: 0 });
        if (s % 4 === 2) events.push({ t, kind: 'openhat', layer: 3 });
        // FEVER 아르페지오: 16분음표로 코드 구성음을 돌아요
        if (sec.type !== 'intro') events.push({ t, kind: 'arp', midi: chordMidis[[0, 1, 2, 1][s % 4]] + 12, dur: stepDur * 0.9, layer: 3 });
      }
      if (b === 0 && sec.type !== 'intro') events.push({ t: t0, kind: 'crash', layer: 3 });
      for (let s = 0; s < 16; s += 2) {
        events.push({ t: t0 + s * stepDur, kind: 'bass', midi: rootMidi + (s % 8 === 6 ? 12 : 0), dur: stepDur * 1.6, layer: 1 });
      }
      events.push({ t: t0, kind: 'pad', midis: chordMidis, dur: barDur * 0.98, layer: 2 });
      if (sec.type === 'verse' || sec.type === 'chorus' || sec.type === 'outro') {
        const motif = motifs[sec.type === 'outro' ? 'verse' : sec.type];
        const half = b % 2;
        const variation = b >= 6 && sec.type !== 'outro';
        for (const n of motif) {
          if (Math.floor(n.step / 16) !== half) continue;
          if (sec.type === 'outro' && n.step % 8 !== 0) continue;
          const deg = n.deg + (variation && n.step % 16 !== 0 ? 1 : 0);
          const len = Math.min(n.len, 16 - (n.step % 16));
          leads.push({
            t: t0 + (n.step % 16) * stepDur,
            midi: degreeToMidi(scale, song.key, 60, deg),
            dur: len * stepDur,
            step: n.step % 16,
            bar,
            secType: sec.type,
            secBar: b,
          });
        }
      } else if (sec.type === 'intro' && b >= 1) {
        // 출발 구간: 2박마다 코드 스탭을 플레이어가 쳐요
        for (const s of [0, 8]) {
          leads.push({ t: t0 + s * stepDur, midi: chordMidis[0] + 12, chord: chordMidis.map((m) => m + 12), dur: stepDur * 4, step: s, bar, secType: 'intro', secBar: b });
        }
      }
    }
  }
  const duration = bar * barDur;
  const beats = [];
  for (let t = 0; t < duration - 1e-6; t += stepDur * 4) beats.push(t);
  events.sort((a, b) => a.t - b.t);
  leads.sort((a, b) => a.t - b.t);
  return { song, stepDur, barDur, duration, events, leads, sections, beats };
}

// 플릭이 어울리는 강조 지점인지
function isAccent(l, mode) {
  const sectionStart = l.secBar === 0 && l.step === 0 && l.secType !== 'intro';
  if (mode === 'sections') return sectionStart;
  return sectionStart || (l.secType === 'chorus' && l.secBar % 2 === 0 && l.step === 0);
}

// 멜로디 윤곽을 따라 레인을 정하고, 한 손 규칙(동시 노트 없음, 홀드 중 다른 노트 없음)을 지켜요.
// 채보에서 빠진 멜로디는 ghost로 돌려줘서 콤보 레벨 2부터 배경으로 들려요.
export function buildChart(comp, diff) {
  const notes = [];
  const ghosts = [];
  let lastEnd = -Infinity;
  let lane = 1;
  let prev = null;
  let introK = 0;
  for (const l of comp.leads) {
    let cl;
    if (l.secType === 'intro') cl = [1, 0, 1, 2][introK++ % 4];
    else {
      if (!prev || prev.secType === 'intro' || l.t - prev.t > comp.barDur) lane = 1;
      else if (l.midi > prev.midi) lane = lane === 2 ? 1 : lane + 1;
      else if (l.midi < prev.midi) lane = lane === 0 ? 1 : lane - 1;
      cl = lane;
    }
    prev = l;
    const flick = isAccent(l, diff.flick);
    // 강조 지점은 우선권: 바로 앞 노트 때문에 간격이 모자라면 앞 노트를 배경 멜로디로 돌려요
    while (flick && notes.length && l.t - lastEnd < diff.minGap - 1e-6) {
      const dropped = notes.pop();
      ghosts.push(comp.leads.find((x) => x.t === dropped.t) || { t: dropped.t, midi: dropped.midi, dur: dropped.dur });
      const pl = notes[notes.length - 1];
      lastEnd = pl ? (pl.end ?? pl.t) + (pl.flick ? 0.12 : 0) : -Infinity;
    }
    const ok = (l.step % diff.stepMod === 0 || flick) && l.t - lastEnd >= diff.minGap - 1e-6;
    if (!ok) {
      ghosts.push(l);
      continue;
    }
    let end = null;
    const prevHold = notes.length && notes[notes.length - 1].end != null;
    if (!flick && diff.hold && l.dur >= diff.holdMin && !prevHold && !l.chord) end = l.t + l.dur * 0.8;
    const last = notes[notes.length - 1];
    if (last && last.lane === cl && l.t - (last.end ?? last.t) < 0.2) cl = cl === 1 ? 2 : 1;
    notes.push({ id: notes.length, t: l.t, lane: cl, end, flick, midi: l.midi, chord: l.chord || null, dur: l.dur });
    // 플릭 뒤에는 엄지가 돌아올 시간을 조금 더 줘요
    lastEnd = (end ?? l.t) + (flick ? 0.12 : 0);
  }
  notes.ghosts = ghosts;
  return notes;
}

export function judgeOffset(dt) {
  const a = Math.abs(dt);
  if (a <= WINDOWS.perfectPlus) return 'perfectPlus';
  if (a <= WINDOWS.perfect) return 'perfect';
  if (a <= WINDOWS.great) return 'great';
  if (a <= WINDOWS.good) return 'good';
  return null;
}

const BASE = { perfectPlus: 350, perfect: 300, great: 200, good: 100, hold: 100, flick: 150 };
const ACC = { perfectPlus: 1, perfect: 1, great: 0.7, good: 0.4 };

// 판정 엔진: 노트 상태, 점수, 콤보, 콤보 레벨, 체력을 관리해요.
export class JudgeEngine {
  constructor(notes) {
    this.notes = notes.map((n) => ({ ...n, state: 'pending', judge: null }));
    this.counts = { perfectPlus: 0, perfect: 0, great: 0, good: 0, miss: 0 };
    this.holdsOk = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.score = 0;
    this.health = 100;
    this.level = 0;
    this.maxLevel = 0;
    this.activeHold = new Map(); // lane -> note
    this.cursor = 0;
    this.events = []; // 레벨 변화 등 화면 연출용 알림
  }
  get total() {
    return this.notes.length + this.notes.filter((n) => n.end != null).length;
  }
  get mult() {
    return LEVEL_MULT[this.level];
  }
  _add(kind, flick = false) {
    if (kind === 'miss') {
      this.counts.miss++;
      this.combo = 0;
      this.health = Math.max(0, this.health - 8);
      if (this.level > 0) {
        this.level--;
        this.events.push({ type: 'levelDown', level: this.level });
      }
      return;
    }
    if (kind !== 'hold') this.counts[kind]++;
    else this.holdsOk++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += (BASE[kind] + (flick ? BASE.flick : 0)) * this.mult;
    this.health = Math.min(100, this.health + (kind === 'perfectPlus' || kind === 'perfect' ? 2 : 1.5));
    if (this.level < 3 && this.combo >= LEVEL_UP[this.level]) {
      this.level++;
      this.maxLevel = Math.max(this.maxLevel, this.level);
      this.events.push({ type: 'levelUp', level: this.level });
    }
    if (this.combo % 25 === 0) this.events.push({ type: 'milestone', combo: this.combo });
  }
  // 이 레인에서 지금 칠 수 있는 노트 (판정하지 않고 보기만)
  peek(lane, now) {
    let best = null;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - now > WINDOWS.good) break;
      if (n.state !== 'pending' || n.lane !== lane) continue;
      if (Math.abs(n.t - now) > WINDOWS.good) continue;
      if (!best || Math.abs(n.t - now) < Math.abs(best.t - now)) best = n;
    }
    return best;
  }
  // swiped: 위로 튕겼는지. 플릭 노트를 그냥 탭하면 GOOD으로 낮춰요.
  press(lane, now, swiped = false) {
    const best = this.peek(lane, now);
    if (!best) return null;
    let j = judgeOffset(now - best.t);
    if (!j) return null;
    if (best.flick && !swiped) j = 'good';
    best.judge = j;
    this._add(j, best.flick && swiped);
    if (best.end != null) {
      best.state = 'holding';
      this.activeHold.set(lane, best);
    } else best.state = 'done';
    return { note: best, judge: j, offset: now - best.t, flicked: best.flick && swiped };
  }
  release(lane, now) {
    const n = this.activeHold.get(lane);
    if (!n) return null;
    this.activeHold.delete(lane);
    if (now >= n.end - HOLD_RELEASE_GRACE) {
      n.state = 'done';
      this._add('hold');
      return { note: n, judge: 'hold' };
    }
    n.state = 'broken';
    this._add('miss');
    return { note: n, judge: 'miss' };
  }
  update(now) {
    const out = [];
    for (const [lane, n] of this.activeHold) {
      if (now >= n.end) {
        this.activeHold.delete(lane);
        n.state = 'done';
        this._add('hold');
        out.push({ note: n, judge: 'hold' });
      }
    }
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > now) break;
      if (n.state === 'pending' && now - n.t > WINDOWS.good) {
        n.state = 'missed';
        this._add('miss');
        if (n.end != null) this._add('miss'); // 홀드는 머리와 꼬리 둘 다 놓친 것
        out.push({ note: n, judge: 'miss' });
      }
    }
    while (this.cursor < this.notes.length && !['pending', 'holding'].includes(this.notes[this.cursor].state)) this.cursor++;
    return out;
  }
  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
  accuracy() {
    const c = this.counts;
    const tails = this.notes.filter((n) => n.end != null).length;
    const pts = (c.perfectPlus + c.perfect) * ACC.perfect + c.great * ACC.great + c.good * ACC.good + this.holdsOk;
    const denom = this.notes.length + tails;
    return denom ? pts / denom : 0;
  }
  get fullCombo() {
    return this.counts.miss === 0 && this.finished;
  }
  get finished() {
    return this.notes.every((n) => n.state === 'done' || n.state === 'missed' || n.state === 'broken');
  }
}

export function starsFor(acc, cleared) {
  if (!cleared) return 0;
  if (acc >= 0.93) return 3;
  if (acc >= 0.8) return 2;
  if (acc >= 0.6) return 1;
  return 0;
}

export function coinsFor(stars, score, fullCombo = false) {
  return stars * 10 + Math.floor(score / 4000) + (fullCombo ? 15 : 0);
}
