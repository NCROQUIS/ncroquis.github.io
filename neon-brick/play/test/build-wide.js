// Wide specials (31-36). Each slot has a fixed trick type; candidates of that type are tuned to the slot's target
// clear rate, star thresholds come from 40 runs (P), acceptance needs fun >= 91 and angle reward >= 0.6 on 40 other
// runs (Q) plus >= 89 on a second 40 (Q2); the reported score uses 40 more runs never used for choosing (R).
// node test/build-wide.js 31,33,35 → test/wide-<first>.json
const C = require('./core.js'), fs = require('fs');
const KIND = { 31: 0, 32: 2, 33: 1, 34: 0, 35: 2, 36: 1 }, TGT = { 31: .88, 32: .85, 33: .82, 34: .80, 35: .78, 36: .72 };
const runs = (st, n, s0) => Array.from({ length: n }, (_, i) => C.playStage(st, 'novice', s0 + i * 7919));
function pars(rs) {
  const w = rs.filter(r => r.status === 'clear').map(r => r.turns).sort((a, b) => a - b); if (!w.length) return null;
  let best = null;
  for (const t of [...new Set(w)]) { const share = w.filter(x => x <= t).length / w.length, near = w.filter(x => x === t + 1).length / w.length;
    if (share < 0.2 || share > 0.5) continue; const sc = near - Math.abs(share - 0.35) * 0.5; if (!best || sc > best.sc) best = { t, sc }; }
  const p3 = best ? best.t : w[Math.floor(w.length * 0.35)], p75 = w[Math.min(w.length - 1, Math.floor(w.length * 0.75))];
  return [p3, Math.max(p75, p3 + 2)];
}
const slots = process.argv[2].split(','). map(Number), out = {}, MINS = +(process.env.MIN || 30);
for (const n of slots) {
  const cols = C.WIDE_COLS[n], tgt = TGT[n], t0 = Date.now(); let best = null, ok = null;
  for (let k = 0; !ok && Date.now() - t0 < MINS * 60e3; k++) {
    const base = n * 1000, seed = base + k * 3 + ((KIND[n] - base % 3) % 3 + 3) % 3; let lo = 0.06, hi = 1.4;  // seed % 3 picks the trick type
    for (let it = 0; it < 6; it++) { const f = Math.sqrt(lo * hi), rate = runs(C.makeWide(n, cols, seed, f), 10, 1000).filter(r => r.status === 'clear').length / 10; if (rate >= tgt) lo = f; else hi = f; }
    const f = +lo.toFixed(3), P = runs(C.makeWide(n, cols, seed, f), 40, 900001), p = pars(P); if (!p) continue;
    const st = C.makeWide(n, cols, seed, f, p), ex = C.playStage(st, 'expert'), sk = C.angleSkill(st);
    const q = C.funReport(st, runs(st, 40, 1300001), sk, ex);
    console.log(n, 'cand', k, st.kind, 'f', f, 'par', p.join('/'), 'Q', q.score, 'skill', q.skill, 'clear', q.clearRate, 'chain', q.chain, JSON.stringify(q.parts));
    const cand = { seed, f, p, st, ex, sk, q };
    if (!best || q.score > best.q.score) best = cand;
    if (q.score >= 91 && q.skill >= 0.6 && ex.status === 'clear' && Math.abs(q.clearRate - tgt) <= 0.15) {
      const q2 = C.funReport(st, runs(st, 40, 2000001), sk, ex); console.log(n, '  second check', q2.score);
      if (q2.score >= 89) ok = cand;
    }
  }
  const b = ok || best, R = C.funReport(b.st, runs(b.st, 40, 3100001), b.sk, b.ex);
  out[n] = { seed: b.seed, f: b.f, p: b.p, kind: b.st.kind, Q: b.q.score, R: R.score, skill: R.skill, chain: R.chain, clearR: R.clearRate, partsR: R.parts, warn: R.warn.map(w => w[1]) };
  console.log('SLOT', n, cols + 'cols', b.st.kind, 'seed', b.seed, 'Q', b.q.score, 'R', R.score, 'skill', R.skill, 'clear', R.clearRate, ok && R.score >= 90 ? 'OK' : 'CHECK');
  fs.writeFileSync(__dirname + '/wide-' + slots[0] + '.json', JSON.stringify(out));
}
