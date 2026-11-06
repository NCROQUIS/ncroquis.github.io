// 스파이더 2·4무늬 '이길 수 있는 판' 목록 만들기 — 탐색으로 끝까지 풀리는 판만 골라 src/spider-seeds.js에 적어요.
// 찾을 때마다 바로 파일에 적어서, 중간에 멈춰도 그때까지 찾은 판은 남아요.
// 실행: node --max-old-space-size=6000 tools/find-spider-seeds.mjs [2무늬 개수] [4무늬 개수]
import { writeFileSync } from 'node:fs';
import { solve } from '../src/search.js';
import * as SP from '../src/spider.js';

const want = { 2: Number(process.argv[2] ?? 60), 4: Number(process.argv[3] ?? 8) };
const budget = { 2: 40000, 4: 150000 };
const out = { 2: [], 4: [] };
const file = new URL('../src/spider-seeds.js', import.meta.url);
const write = () => writeFileSync(file, `// 스파이더 '이길 수 있는 판' 목록 — tools/find-spider-seeds.mjs가 만들어요 (탐색으로 끝까지 풀어 본 판)
export const SPIDER_SEEDS = ${JSON.stringify(out)};
`);

function replayWins(seed, suits, path) {
  let g = SP.newGame({ seed, suits });
  for (const m of path) { g = m.draw ? SP.draw(g) : SP.applyMove(g, m); if (!g) return false; }
  return SP.isWon(g);
}

for (const suits of [2, 4]) {
  for (let i = 0; out[suits].length < want[suits] && i < want[suits] * 40; i++) {
    const seed = `sp${suits}-${i}`;
    const path = solve(SP.newGame({ seed, suits }), { maxNodes: budget[suits] });
    if (path && replayWins(seed, suits, path)) {
      out[suits].push(seed);
      write();
      console.log(`${suits}무늬 ${out[suits].length}/${want[suits]} (${i + 1}판 중)`);
    }
  }
}
write();
console.log('done', out[2].length, out[4].length);
