// 프리셀 '이길 수 있는 판' 목록 만들기 — 탐색으로 끝까지 풀리는 판만 골라 src/freecell-seeds.js에 적어요.
// 게임을 시작할 때 풀어 보지 않아도 돼서 느린 휴대폰에서도 바로 시작해요. 힌트도 이 판들은 반드시 길이 있어요.
// 실행: node tools/find-freecell-seeds.mjs [개수]
import { writeFileSync } from 'node:fs';
import { solve } from '../src/search.js';
import * as FC from '../src/freecell.js';

const want = Number(process.argv[2] ?? 300);
const out = [];
for (let i = 0; out.length < want && i < want * 3; i++) {
  const seed = `fc-${i}`;
  const path = solve(FC.newGame({ seed }), { maxNodes: 20000 });
  if (!path) continue;
  let g = FC.newGame({ seed });
  for (const m of path) { g = FC.applyMove(g, m); if (!g) break; }
  if (g && FC.isWon(g)) out.push(seed);
}
writeFileSync(new URL('../src/freecell-seeds.js', import.meta.url), `// 프리셀 '이길 수 있는 판' 목록 — tools/find-freecell-seeds.mjs가 만들어요 (탐색으로 끝까지 풀어 본 판)
export const FREECELL_SEEDS = ${JSON.stringify(out)};
`);
console.log('done', out.length);
