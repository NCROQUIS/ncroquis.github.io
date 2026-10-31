// 쉬운 판·보통 판 찾기: 힌트만 따라 둬도 깨지는 배치를 골라 src/easy-seeds.js에 저장해요.
// - 쉬움: 덱을 한 번만 넘겨도(되감기 0회) 깨짐 → 첫 판
// - 보통: 되감기 1~2회 필요 → 2~3판째
// 실행: node tools/find-easy-seeds.mjs [개수]
import { writeFileSync } from 'node:fs';
import { greedyPlay } from '../src/solver.js';

export { greedyPlay };

if (import.meta.url === `file://${process.argv[1]}`) {
  const want = Number(process.argv[2] || 30);
  const easy = [];
  const normal = [];
  for (let i = 0; (easy.length < want || normal.length < want) && i < 300000; i++) {
    if (easy.length < want) {
      const seed = `easy-${i}`;
      if (greedyPlay(seed, 1, 0)) easy.push(seed);
    }
    if (normal.length < want) {
      const seed = `normal-${i}`;
      if (!greedyPlay(seed, 1, 0) && greedyPlay(seed, 1, 2)) normal.push(seed);
    }
  }
  console.log(`쉬움 ${easy.length}개, 보통 ${normal.length}개`);
  writeFileSync(new URL('../src/easy-seeds.js', import.meta.url),
    '// 자동 생성 (tools/find-easy-seeds.mjs) — 1장 뽑기 기준\n'
    + '// 쉬움: 힌트만 따라 둬도 덱 한 번 넘기기 안에 깨짐 (첫 판)\n'
    + `export const EASY_SEEDS = ${JSON.stringify(easy)};\n`
    + '// 보통: 힌트만 따라 둬도 덱 되감기 1~2회 안에 깨짐 (2~3판째)\n'
    + `export const NORMAL_SEEDS = ${JSON.stringify(normal)};\n`);
}
