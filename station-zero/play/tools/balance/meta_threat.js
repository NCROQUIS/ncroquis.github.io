require('../../src/v3/engine.js'); require('../../src/v3/run.js'); const E = globalThis.SZE, R = globalThis.SZR;
E.TUNE.runHp = +(process.env.HP || 0.8); E.TUNE.runAtk = +(process.env.ATK || 0.78); const N = 40, T = +process.argv[2];
const m = R.newMeta(); for (const u of R.UPGRADES) m.up[u.id] = u.max; m.unlocked = R.CODEX.map(c => c.kind + ':' + c.id);
let w = 0; for (let s = 1; s <= N; s++) if (R.simulate(7000 + s, false, m, 'carrier', T).won) w++;
console.log('threat', T, Math.round(100 * w / N) + '%');
