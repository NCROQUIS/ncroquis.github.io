// Human-calibrated difficulty: per stage, find the brick-hp factor where the novice bot
// clears at the target rate, then set 3-star / 2-star pars from the novice turn distribution.
// Usage: node test/calibrate.js 1,3,5   (writes test/calib-<first>.json)
const Core = require('./core.js'), fs0 = require('fs');
// Use fitted novice params when test/novice.json exists (from test/fit-novice.js).
if (fs0.existsSync(__dirname + '/novice.json')) Object.assign(Core.BOTS.novice, JSON.parse(fs0.readFileSync(__dirname + '/novice.json', 'utf8')));
const TARGET = { 1: .98, 2: .98, 3: .70, 4: .85, 5: .85, 6: .85, 7: .85, 8: .70, 9: .70, 10: .60,
  11: .92, 12: .90, 13: .90, 14: .82, 15: .82, 16: .82, 17: .82, 18: .68, 19: .68, 20: .58 };
const ROLE = n => n === 2 ? '연쇄' : n === 1 ? '쉬움' : n === 3 ? '약간 어려움' : [0, 'easy', 'easy', 'easy', 'normal', 'normal', 'normal', 'normal', 'hard', 'hard', 'boss'][((n - 1) % 10) + 1];
const stages = process.argv[2].split(',').map(Number), out = {};
for (const n of stages) {
  const tgt = TARGET[n]; let lo = 0.12, hi = 1.6, f = 1, ev;
  const run = (f, trials) => { Core.TUNE[n] = { f, p: null }; return Core.evaluate(Core.makeStage(n), trials); };
  if (Core.CUSTOM[n]) { ev = run(1, 40); f = 1; }
  else {
    for (let it = 0; it < 7; it++) { f = Math.sqrt(lo * hi); ev = run(f, 24); if (ev.clearRate >= tgt) lo = f; else hi = f; }
    f = +lo.toFixed(3); ev = run(f, 40);
  }
  let p3 = ev.p35, p2 = ev.p75; if (p2 <= p3) p2 = p3 + 1;
  const ex = Core.playStage(Core.makeStage(n), 'expert');
  out[n] = { f, p: [p3, p2], target: tgt, clearRate: ev.clearRate, median: ev.median, first: +ev.first.toFixed(1), expertTurns: ex.turns, role: ROLE(n) };
  console.log(n, JSON.stringify(out[n]));
}
require('fs').writeFileSync(__dirname + '/calib-' + stages[0] + '.json', JSON.stringify(out));
