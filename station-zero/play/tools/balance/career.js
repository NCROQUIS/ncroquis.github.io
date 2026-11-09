require('../../src/v3/engine.js'); require('../../src/v3/run.js'); const R = globalThis.SZR;
const seed = +process.argv[2], n = +(process.argv[3] || 40);
const c = R.simulateCareer(n, seed);
const firstWin = (c.log.find(l => l.won) || {}).i || '-';
const path = c.log.map(l => l.won ? `W${l.threat}` : l.at.replace('-', '.')).join(' ');
const totalCost = R.UPGRADES.reduce((a, u) => { let s = 0; for (let L = 0; L < u.max; L++) s += R.upCost(u.id, L); return a + s; }, 0);
const fullAt = (() => { let i = 0; for (const l of c.log) { i++; if (l.ups === R.UPGRADES.reduce((a, u) => a + u.max, 0)) return i; } return '-'; })();
console.log(`career ${seed}: 첫 클리어 ${firstWin}판 · 최고 위협 ${c.meta.threatMax} · 강화 완료 ${fullAt}판 · 해금 ${c.meta.unlocked.length}/${R.CODEX.length} · 강화 총비용 ${totalCost}\n  ${path}`);
