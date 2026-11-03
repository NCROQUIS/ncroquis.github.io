// 2048 대결 — 순수 게임 로직 (화면과 분리, Node 테스트 가능)
// 원작(Gabriele Cirulli 2048) 룰 그대로: 4x4, 시작 타일 2개, 새 타일 90% 2 / 10% 4,
// 한 번 움직일 때 같은 타일은 한 번만 합쳐지고, 합친 값만큼 점수가 오른다.
//
// 대결의 공정성: 새 타일 하나는 난수를 정확히 2개(위치, 값) 쓴다.
// 그래서 같은 시드면 '몇 번째 타일이 2인지 4인지' 순서가 두 사람에게 완전히 같다.

export const SIZE = 4;
export const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

// mulberry32 — 작고 빠른 시드 난수. 상태가 숫자 하나라 되돌리기 저장이 쉽다.
export function nextRandom(rng) {
  rng.s = (rng.s + 0x6d2b79f5) | 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// 문자열 → 32비트 시드 (주간 시드 등)
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function newGame(seed) {
  const g = {
    seed: seed >>> 0,
    rng: { s: seed >>> 0 },
    cells: Array(SIZE * SIZE).fill(null), // { id, v }
    score: 0,
    moves: 0,
    nextId: 1,
    over: false,
    won: false,
  };
  spawn(g);
  spawn(g);
  return g;
}

export function cloneGame(g) {
  return {
    ...g,
    rng: { s: g.rng.s },
    cells: g.cells.map((t) => (t ? { ...t } : null)),
  };
}

export function spawn(g) {
  const empty = [];
  g.cells.forEach((t, i) => { if (!t) empty.push(i); });
  const r1 = nextRandom(g.rng);
  const r2 = nextRandom(g.rng);
  if (!empty.length) return null;
  const idx = empty[Math.floor(r1 * empty.length)];
  const tile = { id: g.nextId++, v: r2 < 0.9 ? 2 : 4 };
  g.cells[idx] = tile;
  return { idx, tile };
}

const at = (r, c) => r * SIZE + c;

// 한 방향으로 민다. 반환: { moved, gained, slides:[{id,to}], merges:[{to, tile, from:[id,id]}], spawned }
export function move(g, dir) {
  if (g.over) return { moved: false, gained: 0, slides: [], merges: [], spawned: null };
  const [dr, dc] = DIRS[dir];
  const order = [...Array(SIZE).keys()];
  const rows = dr === 1 ? [...order].reverse() : order;
  const cols = dc === 1 ? [...order].reverse() : order;

  const next = Array(SIZE * SIZE).fill(null);
  const mergedAt = new Set();
  const slides = [];
  const merges = [];
  let gained = 0;
  let moved = false;

  for (const r of rows) {
    for (const c of cols) {
      const tile = g.cells[at(r, c)];
      if (!tile) continue;
      // 가장 멀리 갈 수 있는 빈칸 찾기
      let nr = r, nc = c;
      while (true) {
        const tr = nr + dr, tc = nc + dc;
        if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
        if (next[at(tr, tc)]) break;
        nr = tr; nc = tc;
      }
      // 바로 다음 칸이 같은 값이고 이번에 합쳐지지 않았으면 합치기
      const mr = nr + dr, mc = nc + dc;
      const inside = mr >= 0 && mr < SIZE && mc >= 0 && mc < SIZE;
      const target = inside ? next[at(mr, mc)] : null;
      if (target && target.v === tile.v && !mergedAt.has(at(mr, mc))) {
        const merged = { id: g.nextId++, v: tile.v * 2 };
        next[at(mr, mc)] = merged;
        mergedAt.add(at(mr, mc));
        merges.push({ to: at(mr, mc), tile: merged, from: [target.id, tile.id] });
        slides.push({ id: tile.id, to: at(mr, mc) });
        gained += merged.v;
        moved = true;
        if (merged.v === 2048) g.won = true;
      } else {
        next[at(nr, nc)] = tile;
        slides.push({ id: tile.id, to: at(nr, nc) });
        if (nr !== r || nc !== c) moved = true;
      }
    }
  }

  if (!moved) return { moved: false, gained: 0, slides: [], merges: [], spawned: null };
  g.cells = next;
  g.score += gained;
  g.moves += 1;
  const spawned = spawn(g);
  g.over = !canMove(g);
  return { moved, gained, slides, merges, spawned };
}

export function canMove(g) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = g.cells[at(r, c)];
      if (!t) return true;
      if (c + 1 < SIZE && g.cells[at(r, c + 1)]?.v === t.v) return true;
      if (r + 1 < SIZE && g.cells[at(r + 1, c)]?.v === t.v) return true;
    }
  }
  return false;
}

export function maxTile(g) {
  return g.cells.reduce((m, t) => (t && t.v > m ? t.v : m), 0);
}

// ── 대결 링크 ─────────────────────────────
// ?d=<시드36>.<점수36>.<최고타일36>.<이름> — 서버 없이 링크만으로 도전장을 주고받는다.
export function encodeDuel({ seed, score, best, name }) {
  const n = encodeURIComponent((name || "").slice(0, 10));
  return `${(seed >>> 0).toString(36)}.${score.toString(36)}.${best.toString(36)}.${n}`;
}

export function decodeDuel(str) {
  if (!str) return null;
  const [s, sc, b, ...rest] = str.split(".");
  const ok = (x) => typeof x === "string" && /^[0-9a-z]{1,8}$/.test(x);
  if (!ok(s) || !ok(sc) || !ok(b)) return null;
  const seed = parseInt(s, 36);
  const score = parseInt(sc, 36);
  const best = parseInt(b, 36);
  if (!Number.isFinite(seed) || !Number.isFinite(score) || !Number.isFinite(best)) return null;
  let name = "";
  try { name = decodeURIComponent(rest.join(".")).slice(0, 10); } catch { name = ""; }
  return { seed: seed >>> 0, score, best, name: name || "친구" };
}

// ── 주간 시드 ─────────────────────────────
export function weekKey(date = new Date()) {
  // ISO 주차
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function weeklySeed(date = new Date()) {
  return hashSeed("duel2048:" + weekKey(date));
}
