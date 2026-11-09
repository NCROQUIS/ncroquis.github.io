// high threat with ship mastery (2026-11-04): shipyard maxed, everything unlocked; mastery Lv0 vs Lv10, win % per threat level.
// usage: node tools/balance/mastery_threat.js [runs per cell] [frame]
require('../../src/v3/engine.js'); require('../../src/v3/run.js'); const R = globalThis.SZR;
const N = +(process.argv[2] || 24), F = process.argv[3] || 'carrier';
const meta = lv => { const m = R.newMeta(); for (const u of R.UPGRADES) m.up[u.id] = u.max; m.unlocked = R.CODEX.map(c => c.kind + ':' + c.id);
  let xp = 0; for (let L = 1; L <= lv; L++) xp += R.MASTERY.need(L); m.mastery = { [F]: xp }; return m; };
for (const T of [0, 5, 10, 15, 20]) {
  const row = [0, 10].map(lv => { const m = meta(lv); let w = 0; for (let s = 1; s <= N; s++) if (R.simulate(9100 + s * 7 + T, false, m, F, T).won) w++; return Math.round(100 * w / N); });
  console.log(`위협 ${String(T).padStart(2)} · 숙련 0: ${String(row[0]).padStart(3)}% · 숙련 10: ${String(row[1]).padStart(3)}%`);
}
