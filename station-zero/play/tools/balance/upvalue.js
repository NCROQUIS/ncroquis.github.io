// Shipyard upgrade value (2026-11-07): how far does one more level carry a run? Baseline = every upgrade at level B,
// then each upgrade +1 level on its own. Progress = floors cleared (sector × 11 + row, a win counts 33) and win rate,
// plus shards per run (for economy upgrades). usage: node tools/balance/upvalue.js [runs=120] [baseLevel=1]
require('../../src/v3/engine.js'); require('../../src/v3/run.js'); const R = globalThis.SZR;
const N = +(process.argv[2] || 120), B = +(process.argv[3] || 1);
function meta(extra) { const m = R.newMeta(); for (const u of R.UPGRADES) m.up[u.id] = Math.min(u.max, B); if (extra) m.up[extra] = Math.min(R.UPGRADES.find(u => u.id === extra).max, m.up[extra] + 1); return m; }
function measure(m) {
  let prog = 0, win = 0, sh = 0;
  for (let s = 1; s <= N; s++) { const mm = JSON.parse(JSON.stringify(m)), r = R.simulate(5000 + s * 7, false, mm, 'ark', 0); const fl = r.won ? 33 : r.sector * 11 + r.row; prog += fl; win += r.won ? 1 : 0; sh += R.settleRun(mm, r.run).shards; }
  return { prog: prog / N, win: win / N, sh: sh / N };
}
const base = measure(meta()); console.log(`기준(모든 강화 Lv${B}) 오른 층 ${base.prog.toFixed(2)} · 승률 ${(base.win * 100).toFixed(1)}% · 조각 ${base.sh.toFixed(1)}`);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
for (const u of R.UPGRADES) { if (B >= u.max || (ONLY && !ONLY.includes(u.id))) continue; const v = measure(meta(u.id)), cost = R.upCost(u.id, B);
  console.log(`${u.id.padEnd(8)} Lv${B}→${B + 1} 비용 ${String(cost).padStart(4)} · 오른 층 ${(v.prog - base.prog >= 0 ? '+' : '') + (v.prog - base.prog).toFixed(2)} · 승률 ${((v.win - base.win) * 100).toFixed(1)}%p · 조각 ${(v.sh - base.sh >= 0 ? '+' : '') + (v.sh - base.sh).toFixed(1)}`); }
