// Growth wall check (2026-11-07): first clear for a free player vs one who bought shards first. usage: node tools/balance/wall.js . (env SEEDS=1,2,3 LEN=45 NF=150 STARTS='[0,1200,1500]' OV='{"tune":{"runHp":1.6}}')
const root = process.argv[2]; require(root + '/src/v3/engine.js'); require(root + '/src/v3/run.js'); const R = globalThis.SZR, E = globalThis.SZE;
const ov = JSON.parse(process.env.OV || '{}'); Object.assign(E.TUNE, ov.tune || {}); Object.assign(R.TUNE_RUN, ov.run || {});
const seeds = (process.env.SEEDS || '1,2,3,4,5,6,7,8').split(',').map(Number), starts = JSON.parse(process.env.STARTS || '[0,1200,1500]');
const out = [];
for (const st of starts) { const fc = [], bank = []; for (const s of seeds) { const c = R.simulateCareer(+(process.env.LEN||40), s, { start: st }); const k = c.log.findIndex(l => l.won); fc.push(k < 0 ? 99 : k + 1); } fc.sort((a,b)=>a-b); out.push(`start ${st}: 평균 ${(fc.reduce((a,b)=>a+b,0)/fc.length).toFixed(1)} 중앙 ${fc[fc.length>>1]} [${fc.join(',')}]`); }
let w = 0, N = +(process.env.NF||200); for (let s = 1; s <= N; s++) if (R.simulate(7000 + s, false, R.newMeta(), 'ark', 0).won) w++;
console.log(JSON.stringify(ov), `첫판 ${(100*w/N).toFixed(1)}%\n  ` + out.join('\n  '));
