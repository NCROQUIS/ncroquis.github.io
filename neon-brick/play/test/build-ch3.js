// Search chapter 3 layouts that score 90+ on fun.  node test/build-ch3.js 21,23,25  → test/ch3-<first>.json
// Per slot: generate a candidate → tune brick hp to the slot's target clear rate (novice bot) → choose star thresholds
// so 25-45% of clears get 3 stars and as many as possible miss it by one turn → fun score on 20 runs (A).
// A candidate is kept only if it also scores 90+ on 24 fresh runs with different seeds (B), so it is not a lucky pick.
const C = require('./core.js'), fs = require('fs');
const TARGET = { 21: .92, 22: .90, 23: .90, 24: .82, 25: .82, 26: .82, 27: .82, 28: .70, 29: .70, 30: .60 };
const runs = (st, n, seed0) => Array.from({ length: n }, (_, i) => C.playStage(st, 'novice', seed0 + i * 7919));
function pars(rs) {
  const w = rs.filter(r => r.status === 'clear').map(r => r.turns).sort((a, b) => a - b); if (!w.length) return null;
  let best = null;
  for (const t of [...new Set(w)]) {
    const share = w.filter(x => x <= t).length / w.length, near = w.filter(x => x === t + 1).length / w.length;
    if (share < 0.2 || share > 0.5) continue;
    const sc = near - Math.abs(share - 0.35) * 0.5; if (!best || sc > best.sc) best = { t, sc };
  }
  const p3 = best ? best.t : w[Math.floor(w.length * 0.35)], p75 = w[Math.min(w.length - 1, Math.floor(w.length * 0.75))];
  return [p3, Math.max(p75, p3 + 2)];
}
const slots = process.argv[2].split(',').map(Number), out = {};
// Extended runs: K0 = first candidate index, KMAX = candidates to try, MIN = minutes per slot, TGT = override clear-rate target.
const K0 = +(process.env.K0 || 0), KMAX = +(process.env.KMAX || 16), MINS = +(process.env.MIN || 9), TGTO = process.env.TGT ? +process.env.TGT : null, TAG = process.env.TAG || '';
for (const n of slots) {
  const tgt = TGTO || TARGET[n]; let best = null; const t0 = Date.now();
  for (let k = K0; k < K0 + KMAX && Date.now() - t0 < MINS * 60e3; k++) {
    const seed = n * 1000 + k * 37 + 1; let lo = 0.08, hi = 1.6;
    for (let it = 0; it < 6; it++) { const f = Math.sqrt(lo * hi), rate = runs(C.makeCh3(n, seed, f), 12, 1000).filter(r => r.status === 'clear').length / 12; if (rate >= tgt) lo = f; else hi = f; }
    const f = +lo.toFixed(3); let st = C.makeCh3(n, seed, f), A = runs(st, 20, 3000);
    const p = pars(A); if (!p) continue; st = C.makeCh3(n, seed, f, p);
    const ex = C.playStage(st, 'expert'), skill = C.angleSkill(st), fa = C.funReport(st, A, skill, ex);
    let fb = null;
    if (fa.score >= 88) { const B = runs(st, 24, 77000); fb = C.funReport(st, B, skill, ex); }
    const worst = fb ? Math.min(fa.score, fb.score) : fa.score - 5;
    console.log(n, 'cand', k, 'f', f, 'par', p.join('/'), 'A', fa.score, 'B', fb ? fb.score : '-', 'clear', fa.clearRate, fb ? fb.clearRate : '', fa.warn.map(w => w[1].split(/[:.]/)[0]).join('|'));
    if (!best || worst > best.worst) best = { seed, f, p, worst, A: fa, B: fb };
    if (fb && fa.score >= 90 && fb.score >= 90 && Math.abs(fb.clearRate - tgt) <= 0.17 && ex.status === 'clear') break;
  }
  out[n] = best; console.log('SLOT', n, 'seed', best.seed, 'score A', best.A.score, 'B', best.B ? best.B.score : '-', best.worst >= 90 ? 'OK' : 'BELOW-90');
  fs.writeFileSync(__dirname + '/ch3-' + slots[0] + TAG + '.json', JSON.stringify(out));
}
