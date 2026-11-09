// Main line (stages 1-30 re-tuned, 37-106 new) on the gentle target curve C.target(n).
//   node test/build-main.js 1-30          → re-tune: same layouts, brick hp scaled to the new target, fresh star pars
//   node test/build-main.js 37,39,41,...  → search: candidate layouts per slot, keep one with fun 90+ (two bot sets)
//   KSTART=5 node test/build-main.js 55,56   → second pass over more layouts; bake-main keeps the better one per slot
//   KEEP=1 TAG=boss node test/build-main.js 46,56 → re-tune existing main stages (same layout, new hp and pars), e.g. after a rule change
// Results go to test/main-<TAG>.json (TAG env, default first slot). Each slot: seed, f, p, target, fun Q/R, clear R.
const C = require('./core.js'), fs = require('fs');
const runs = (st, n, s0) => Array.from({ length: n }, (_, i) => C.playStage(st, 'novice', s0 + i * 7919));
function pars(rs) {
  const w = rs.filter(r => r.status === 'clear').map(r => r.turns).sort((a, b) => a - b); if (!w.length) return null;
  let best = null;
  for (const t of [...new Set(w)]) { const share = w.filter(x => x <= t).length / w.length, near = w.filter(x => x === t + 1).length / w.length;
    if (share < 0.2 || share > 0.5) continue; const sc = near - Math.abs(share - 0.35) * 0.5; if (!best || sc > best.sc) best = { t, sc }; }
  const p3 = best ? best.t : w[Math.floor(w.length * 0.35)], p75 = w[Math.min(w.length - 1, Math.floor(w.length * 0.75))];
  return [p3, Math.max(p75, p3 + 2)];
}
const parse = a => a.split(',').flatMap(x => x.includes('-') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(x.split('-').map(Number)) : [+x]);
const slots = parse(process.argv[2]), TAG = process.env.TAG || String(slots[0]), out = {};
const KSTART = +(process.env.KSTART || 0), KMAX = +(process.env.KMAX || 5), MINS = +(process.env.MIN || 9), file = __dirname + '/main-' + TAG + '.json';
// generator for a slot: (f, par) → stage. Re-tuned stages keep their layout seed.
function gen(n, seed) {
  if (n <= 20) return (f, p) => { const st = C.makeStage(n, { f }); if (p) { st.par3 = p[0]; st.par2 = p[1]; } return st; };
  if (n <= 30) return (f, p) => C.makeCh3(n, C.CH3[n].seed, f, p);
  return (f, p) => C.makeMain(n, seed, f, p);
}
function calibrate(g, tgt) {
  let lo = 0.05, hi = 2.2;
  const rate = f => runs(g(f), 12, 1000).filter(r => r.status === 'clear').length / 12;
  for (let it = 0; it < 7; it++) { const f = Math.sqrt(lo * hi); if (rate(f) >= tgt - 0.04) lo = f; else hi = f; }
  return +lo.toFixed(3);
}
for (const n of slots) {
  if (n === 2) continue;   // hand-made combo stage, already 98%
  const tgt = C.target(n), t0 = Date.now(), retune = n <= 30 || !!process.env.KEEP; let best = null, ok = null;
  for (let k = KSTART; k < (retune ? 1 : KSTART + KMAX) && !ok && Date.now() - t0 < MINS * 60e3; k++) {
    const seed = process.env.KEEP && C.MAIN[n] ? C.MAIN[n].seed : n * 1000 + k * 37 + 1, g = gen(n, seed); let f = calibrate(g, tgt), rs = runs(g(f), 30, 900001);
    // the 12-game search is coarse: nudge hp until 30 fresh games land within 8 points of the target
    for (let fix = 0; fix < 3; fix++) { const r = rs.filter(x => x.status === 'clear').length / 30; if (Math.abs(r - tgt) <= 0.08) break;
      f = +(f * (r > tgt ? 1.18 : 0.85)).toFixed(3); rs = runs(g(f), 30, 900001); }
    const p = pars(rs); if (!p) { console.log(n, 'cand', k, 'no clears at f', f); continue; }
    const st = g(f, p), ex = C.playStage(st, 'expert'), sk = C.angleSkill(st), q = C.funReport(st, runs(st, 30, 1300001), sk, ex);
    console.log(n, 'cand', k, st.style || '', 'f', f, 'par', p.join('/'), 'tgt', tgt, 'Q', q.score, 'skill', q.skill, 'clear', q.clearRate, JSON.stringify(q.parts));
    const cand = { seed: n <= 30 ? undefined : seed, f, p, st, ex, sk, q };
    if (!best || q.score > best.q.score) best = cand;
    if (retune) { ok = cand; break; }
    if (q.score >= 91 && q.skill >= 0.55 && ex.status === 'clear' && Math.abs(q.clearRate - tgt) <= 0.12) {
      const q2 = C.funReport(st, runs(st, 30, 2000001), sk, ex); console.log(n, '  second check', q2.score);
      if (q2.score >= 89) ok = cand;
    }
  }
  const b = ok || best, R = C.funReport(b.st, runs(b.st, 30, 3100001), b.sk, b.ex);
  out[n] = { seed: b.seed, f: b.f, p: b.p, tgt, style: b.st.style, Q: b.q.score, R: R.score, skill: R.skill, clearR: R.clearRate, partsR: R.parts, warn: R.warn.map(w => w[1]) };
  console.log('SLOT', n, b.st.style || (retune ? 'retune' : ''), 'f', b.f, 'tgt', tgt, 'Q', b.q.score, 'R', R.score, 'clear', R.clearRate, retune ? 'RETUNED' : ok && R.score >= 90 ? 'OK' : 'CHECK');
  fs.writeFileSync(file, JSON.stringify(out));
}
console.log('DONE', TAG);
