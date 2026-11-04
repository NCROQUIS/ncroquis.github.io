// Robust chapter 3 selection. Small samples (16-24 runs) swing the fun score by ±5-8, so:
//   P: 48 novice runs → star thresholds,  Q: 48 other runs → accept only if score >= 91,
//   R: 48 more runs never used for choosing → the score we report.
// Usage: node test/robust-ch3.js 21,23 → test/robust-<first>.json.  Starts by re-checking the current CH3 board.
const C = require('./core.js'), fs = require('fs');
const TARGET = { 21: .92, 22: .90, 23: .90, 24: .82, 25: .82, 26: .82, 27: .82, 28: .75, 29: .75, 30: .66 };
const runs = (st, n, s0) => Array.from({ length: n }, (_, i) => C.playStage(st, 'novice', s0 + i * 7919));
function pars(rs) {
  const w = rs.filter(r => r.status === 'clear').map(r => r.turns).sort((a, b) => a - b); if (!w.length) return null;
  let best = null;
  for (const t of [...new Set(w)]) { const share = w.filter(x => x <= t).length / w.length, near = w.filter(x => x === t + 1).length / w.length;
    if (share < 0.2 || share > 0.5) continue; const sc = near - Math.abs(share - 0.35) * 0.5; if (!best || sc > best.sc) best = { t, sc }; }
  const p3 = best ? best.t : w[Math.floor(w.length * 0.35)], p75 = w[Math.min(w.length - 1, Math.floor(w.length * 0.75))];
  return [p3, Math.max(p75, p3 + 2)];
}
function robust(n, seed, f) {
  let st = C.makeCh3(n, seed, f); const P = runs(st, 48, 900001), p = pars(P); if (!p) return null;
  st = C.makeCh3(n, seed, f, p); const ex = C.playStage(st, 'expert'), sk = C.angleSkill(st);
  const q = C.funReport(st, runs(st, 48, 1300001), sk, ex);
  return { st, p, ex, sk, q };
}
const slots = process.argv[2].split(',').map(Number), out = {}, MINS = +(process.env.MIN || 14), ACC = +(process.env.ACC || 91), SKIP_CUR = !!process.env.SKIP_CUR, K0 = +(process.env.K0 || 0);
for (const n of slots) {
  const t0 = Date.now(), tgt = TARGET[n]; let best = null;
  const cur = C.CH3[n]; const tryOne = (seed, f, tag) => {
    const r = robust(n, seed, f); if (!r) return null;
    console.log(n, tag, 'seed', seed, 'f', f, 'par', r.p.join('/'), 'Q', r.q.score, 'clear', r.q.clearRate, JSON.stringify(r.q.parts));
    if (!best || r.q.score > best.q.score) best = { seed, f, ...r };
    return r;
  };
  // DOUBLE=1: also require a second 48-run check (seeds 2,000,001+) before accepting; the reported score then uses seeds 3,100,001+.
  const DOUBLE = !!process.env.DOUBLE;
  const good = r => { if (!(r && r.q.score >= ACC && r.ex.status === 'clear' && Math.abs(r.q.clearRate - tgt) <= 0.15)) return false;
    if (!DOUBLE) return true; const q2 = C.funReport(r.st, runs(r.st, 48, 2000001), r.sk, r.ex); console.log(n, '  second check', q2.score); return q2.score >= 91; };
  let ok = SKIP_CUR ? null : tryOne(cur.seed, cur.f, 'current'); if (ok) { ok.seed = cur.seed; ok.f = cur.f; } if (!good(ok)) ok = null;
  for (let k = K0; !ok && Date.now() - t0 < MINS * 60e3; k++) {
    const seed = n * 1000 + 500 + k * 41 + 3; let lo = 0.08, hi = 1.6;
    for (let it = 0; it < 6; it++) { const f = Math.sqrt(lo * hi), rate = runs(C.makeCh3(n, seed, f), 12, 1000).filter(r => r.status === 'clear').length / 12; if (rate >= tgt) lo = f; else hi = f; }
    const f = +lo.toFixed(3), quick = C.makeCh3(n, seed, f), A = runs(quick, 20, 3000), pa = pars(A); if (!pa) continue;
    const qs = C.makeCh3(n, seed, f, pa), fa = C.funReport(qs, A, C.angleSkill(qs), C.playStage(qs, 'expert'));
    if (fa.score < 89) { console.log(n, 'cand', k, 'quick', fa.score, 'skip'); continue; }
    const r = tryOne(seed, f, 'cand ' + k); if (r) { r.seed = seed; r.f = f; } if (good(r)) ok = r;
  }
  // Prefer the accepted board; otherwise the highest-scoring one seen.
  const b = ok || best;
  const R = C.funReport(b.st, runs(b.st, 48, process.env.DOUBLE ? 3100001 : 2700001), b.sk, b.ex);
  out[n] = { seed: b.seed, f: b.f, p: b.p, Q: b.q.score, R: R.score, clearR: R.clearRate, partsR: R.parts, warnR: R.warn.map(w => w[1]) };
  console.log('SLOT', n, 'seed', b.seed, 'Q', b.q.score, 'R(held-out)', R.score, 'clear', R.clearRate, R.score >= 90 ? 'OK' : 'BELOW-90');
  fs.writeFileSync(__dirname + '/robust-' + slots[0] + (process.env.TAG || '') + '.json', JSON.stringify(out));
}
