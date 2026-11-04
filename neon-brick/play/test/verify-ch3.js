// Final check of the shipped chapter 3: build each stage exactly as the game does, play 48 novice runs on seeds
// never used during selection, and report the fun score. node test/verify-ch3.js 21,22 → test/verify-<first>.json
const C = require('./core.js'), fs = require('fs'), ids = process.argv[2].split(',').map(Number), out = {};
for (const n of ids) {
  const st = C.makeStage(n), runs = Array.from({ length: 48 }, (_, i) => C.playStage(st, 'novice', 4200001 + i * 7919));
  const r = C.funReport(st, runs, C.angleSkill(st), C.playStage(st, 'expert')); out[n] = r;
  console.log(n, r.score, 'clear', r.clearRate, JSON.stringify(r.parts), r.warn.map(w => w[1].split(/[:.]/)[0]).join(' | '));
}
fs.writeFileSync(__dirname + '/verify-' + ids[0] + '.json', JSON.stringify(out));
