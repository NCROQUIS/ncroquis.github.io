// Fit the novice bot to real playtest data.
//   node test/fit-novice.js plays.json            → prints the best novice params, writes test/novice.json
//   node test/fit-novice.js --selftest            → generates fake players with known params and checks the fit recovers them
// plays.json: { "<stage>": { "clears": 12, "fails": 5, "turns": [9, 11, ...] }, ... }
// (export from the game's shared store: plays/<user>/stages/<n>, summed per stage)
const Core = require('./core.js'), fs = require('fs');
const NOISE = [2, 4, 6, 8, 10], TOPS = { sharp: [0.55, 0.3, 0.15], loose: [0.35, 0.35, 0.3] };
function predict(params, stages, trials, seed0) {
  const saved = { ...Core.BOTS.novice }; Object.assign(Core.BOTS.novice, params);
  const out = {};
  for (const n of stages) { const e = Core.evaluate(Core.makeStage(+n), trials, seed0); out[n] = { rate: e.clearRate, median: e.median }; }
  Object.assign(Core.BOTS.novice, saved); return out;
}
function fit(obs, trials = 12) {
  const stages = Object.keys(obs), res = [];
  for (const [tname, top] of Object.entries(TOPS)) for (const noise of NOISE) {
    const p = predict({ noise, top }, stages, trials, 5000);
    let loss = 0, w = 0;
    for (const n of stages) { const o = obs[n], att = o.clears + o.fails, rate = o.clears / Math.max(1, att); loss += att * (p[n].rate - rate) ** 2; w += att; }
    res.push({ noise, top: tname, loss: loss / w, pred: p });
  }
  res.sort((a, b) => a.loss - b.loss); return res;
}
if (process.argv[2] === '--selftest') {
  const truth = { noise: 7, top: TOPS.loose }, stages = [3, 5, 8, 12], obs = {};
  const sim = predict(truth, stages, 30, 90000);
  for (const n of stages) { const c = Math.round(sim[n].rate * 30); obs[n] = { clears: c, fails: 30 - c }; }
  console.log('fake players (noise 7°, loose choices):', JSON.stringify(Object.fromEntries(stages.map(n => [n, Math.round(sim[n].rate * 100) + '%']))));
  const r = fit(obs);
  r.slice(0, 4).forEach((x, i) => console.log(i + 1, `noise ${x.noise}° top ${x.top} loss ${x.loss.toFixed(4)}`, JSON.stringify(Object.fromEntries(stages.map(n => [n, Math.round(x.pred[n].rate * 100) + '%'])))));
  const best = r[0], ok = Math.abs(best.noise - truth.noise) <= 3;
  console.log(ok ? 'PASS' : 'FAIL', `fit recovered noise ${best.noise}° (true 7°)`); process.exit(ok ? 0 : 1);
} else {
  const obs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), r = fit(obs), best = r[0];
  console.log('best:', best.noise + '°', best.top, 'loss', best.loss.toFixed(4));
  fs.writeFileSync(__dirname + '/novice.json', JSON.stringify({ step: 8, top: TOPS[best.top], noise: best.noise }));
  console.log('wrote test/novice.json → rerun: node test/calibrate.js <stages>');
}
