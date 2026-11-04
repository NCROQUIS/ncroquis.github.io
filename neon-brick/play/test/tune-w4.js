// W4 (34) clear rate was 0.60 vs target 0.80: same board, lower HP factor, re-derive pars, report on held-out runs.
const C = require('./core.js');
const runs = (st, n, s0) => Array.from({ length: n }, (_, i) => C.playStage(st, 'novice', s0 + i * 7919));
function pars(rs) {
  const w = rs.filter(r => r.status === 'clear').map(r => r.turns).sort((a, b) => a - b); if (!w.length) return null;
  let best = null;
  for (const t of [...new Set(w)]) { const share = w.filter(x => x <= t).length / w.length, near = w.filter(x => x === t + 1).length / w.length;
    if (share < 0.2 || share > 0.5) continue; const sc = near - Math.abs(share - 0.35) * 0.5; if (!best || sc > best.sc) best = { t, sc }; }
  const p3 = best ? best.t : w[Math.floor(w.length * 0.35)], p75 = w[Math.min(w.length - 1, Math.floor(w.length * 0.75))];
  return [p3, Math.max(p75, p3 + 2)];
}
for (const f of (process.argv[2] || '0.255,0.24,0.225,0.21').split(',').map(Number)) {
  const p = pars(runs(C.makeWide(34, 11, 34008, f), 40, 900001)); const st = C.makeWide(34, 11, 34008, f, p);
  const ex = C.playStage(st, 'expert'), sk = C.angleSkill(st);
  const Q = C.funReport(st, runs(st, 40, 1300001), sk, ex), R = C.funReport(st, runs(st, 40, 3100001), sk, ex);
  console.log('F', f, 'par', p.join('/'), 'Q', Q.score, 'clearQ', Q.clearRate, 'R', R.score, 'clearR', R.clearRate, 'skill', R.skill, ex.status, JSON.stringify(R.parts));
}
console.log('done');
