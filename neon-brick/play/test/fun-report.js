// Fun score for campaign stages: node test/fun-report.js 1,2,3   → test/fun-<first>.json
const C = require('./core.js'), fs = require('fs');
const ids = process.argv[2].split(',').map(Number), out = {};
for (const n of ids) {
  const st = C.makeStage(n), runs = [];
  const s0 = +(process.env.SEED0 || 1000); for (let i = 0; i < 16; i++) runs.push(C.playStage(st, 'novice', s0 + i * 7919));
  const ex = C.playStage(st, 'expert'), r = C.funReport(st, runs, C.angleSkill(st), ex);
  out[n] = r; console.log(n, r.score, r.warn.map(w => w[1].split(':')[0].split('.')[0]).join(' | '));
}
fs.writeFileSync(__dirname + '/fun-' + ids[0] + '.json', JSON.stringify(out));
