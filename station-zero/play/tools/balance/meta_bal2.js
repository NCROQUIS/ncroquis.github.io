require('../../src/v3/engine.js'); require('../../src/v3/run.js'); const E = globalThis.SZE, R = globalThis.SZR;
const args = JSON.parse(process.argv[2] || '{}'); Object.assign(E.TUNE, args.tune || {});
const N = args.n || 40;
function m(ups, pool) { const x = R.newMeta(); if (ups) for (const u of R.UPGRADES) x.up[u.id] = u.max; if (pool) x.unlocked = R.CODEX.map(c => c.kind + ':' + c.id); return x; }
function rate(meta, frame, threat) { let w = 0; for (let s = 1; s <= N; s++) if (R.simulate(5000 + s, false, meta, frame, threat).won) w++; return Math.round(100 * w / N) + '%'; }
console.log(JSON.stringify(args.tune), 'base', rate(m(0, 0), 'ark', 0), '| ups only', rate(m(1, 0), 'ark', 0), '| pool only', rate(m(0, 1), 'ark', 0), '| both', rate(m(1, 1), 'ark', 0), '| both carrier', rate(m(1, 1), 'carrier', 0));
