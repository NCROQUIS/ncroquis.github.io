/* dokuduck 퍼즐 엔진: 규칙 판정, 유일해 검사, 힌트(추론) 파이프라인, 난이도 등급.
   브라우저(window.DokuEngine)와 Node(require) 양쪽에서 같은 코드를 쓴다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DokuEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BLANK = 0, XMARK = 1, DUCK = 2, WRONG = 3;
  var B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

  var nbrCache = {};
  function neighbors(n) {
    if (nbrCache[n]) return nbrCache[n];
    var out = [];
    for (var i = 0; i < n * n; i++) {
      var r = (i / n) | 0, c = i % n, a = [];
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) a.push(rr * n + cc);
      }
      out.push(a);
    }
    nbrCache[n] = out;
    return out;
  }

  /* board = { n, reg:Uint8Array(n*n), sol:Int8Array(n) (행별 정답 열), solSet:Uint8Array } */
  function makeBoard(n, reg, sol) {
    var b = { n: n, reg: reg, sol: sol, solSet: new Uint8Array(n * n), regCells: [] };
    for (var g = 0; g < n; g++) b.regCells.push([]);
    for (var i = 0; i < n * n; i++) b.regCells[reg[i]].push(i);
    for (var r = 0; r < n; r++) b.solSet[r * n + sol[r]] = 1;
    return b;
  }
  function decode(n, regStr, solStr) {
    var reg = new Uint8Array(n * n), sol = new Int8Array(n), i;
    for (i = 0; i < n * n; i++) reg[i] = B36.indexOf(regStr[i]);
    for (i = 0; i < n; i++) sol[i] = B36.indexOf(solStr[i]);
    return makeBoard(n, reg, sol);
  }
  function encode(b) {
    var rs = '', ss = '', i;
    for (i = 0; i < b.n * b.n; i++) rs += B36[b.reg[i]];
    for (i = 0; i < b.n; i++) ss += B36[b.sol[i]];
    return [rs, ss];
  }

  /* 정답 규칙 적합성: 행·열·구역 1마리, 주변 8칸 금지 */
  function validSolution(n, reg, sol) {
    var colU = {}, regU = {};
    for (var r = 0; r < n; r++) {
      var c = sol[r];
      if (c < 0 || c >= n || colU[c]) return false;
      colU[c] = 1;
      var g = reg[r * n + c];
      if (regU[g]) return false;
      regU[g] = 1;
      if (r > 0 && Math.abs(sol[r - 1] - c) < 2) return false;
    }
    return true;
  }

  /* 해의 개수 세기 (limit까지). avoid가 주어지면 그 해와 다른 해 하나를 out에 담는다. */
  function countSolutions(n, reg, limit, out) {
    var colU = new Uint8Array(n), regU = new Uint8Array(n), cur = new Int8Array(n), count = 0;
    (function rec(r) {
      if (count >= limit) return;
      if (r === n) { count++; if (out) out.push(Array.prototype.slice.call(cur)); return; }
      var prev = r > 0 ? cur[r - 1] : -9;
      for (var c = 0; c < n; c++) {
        if (colU[c] || Math.abs(c - prev) < 2) continue;
        var g = reg[r * n + c];
        if (regU[g]) continue;
        colU[c] = 1; regU[g] = 1; cur[r] = c;
        rec(r + 1);
        colU[c] = 0; regU[g] = 0;
        if (count >= limit) return;
      }
    })(0);
    return count;
  }

  /* 현재 표시를 읽어 후보 칸을 계산한다. */
  function analyze(b, marks) {
    var n = b.n, N = n * n, nb = neighbors(n), i, k;
    var rowHas = new Uint8Array(n), colHas = new Uint8Array(n), regHas = new Uint8Array(n);
    var blocked = new Uint8Array(N), ducks = [];
    for (i = 0; i < N; i++) if (marks[i] === DUCK) {
      ducks.push(i);
      rowHas[(i / n) | 0] = 1; colHas[i % n] = 1; regHas[b.reg[i]] = 1;
      for (k = 0; k < nb[i].length; k++) blocked[nb[i][k]] = 1;
    }
    var cand = new Uint8Array(N);
    for (i = 0; i < N; i++) {
      if (marks[i] !== BLANK) continue;
      if (rowHas[(i / n) | 0] || colHas[i % n] || regHas[b.reg[i]] || blocked[i]) continue;
      cand[i] = 1;
    }
    return { cand: cand, rowHas: rowHas, colHas: colHas, regHas: regHas, ducks: ducks };
  }

  function unitCells(b, type, idx) {
    var n = b.n, a = [], k;
    if (type === 'row') for (k = 0; k < n; k++) a.push(idx * n + k);
    else if (type === 'col') for (k = 0; k < n; k++) a.push(k * n + idx);
    else a = b.regCells[idx];
    return a;
  }
  function candIn(cells, cand) {
    var a = [];
    for (var k = 0; k < cells.length; k++) if (cand[cells[k]]) a.push(cells[k]);
    return a;
  }

  /* 크기 k 부분집합 열거 */
  function combos(arr, k, fn) {
    var idx = [], stop = false;
    (function rec(start) {
      if (stop) return;
      if (idx.length === k) { if (fn(idx.map(function (j) { return arr[j]; }))) stop = true; return; }
      for (var j = start; j < arr.length; j++) { idx.push(j); rec(j + 1); idx.pop(); if (stop) return; }
    })(0);
    return stop;
  }

  /* 한 칸에 오리를 가정했을 때 단일 후보 강제 배치만으로 모순이 나는지 확인 */
  function assume(b, A, c0) {
    var n = b.n, N = n * n, nb = neighbors(n);
    var cand = A.cand.slice(), rowHas = A.rowHas.slice(), colHas = A.colHas.slice(), regHas = A.regHas.slice();
    var forced = [];
    function place(c) {
      var r = (c / n) | 0, cc = c % n, g = b.reg[c], i;
      rowHas[r] = 1; colHas[cc] = 1; regHas[g] = 1;
      for (i = 0; i < n; i++) { cand[r * n + i] = 0; cand[i * n + cc] = 0; }
      var rc = b.regCells[g];
      for (i = 0; i < rc.length; i++) cand[rc[i]] = 0;
      for (i = 0; i < nb[c].length; i++) cand[nb[c][i]] = 0;
      cand[c] = 0;
    }
    place(c0);
    for (var guard = 0; guard <= n; guard++) {
      var single = -1, types = ['row', 'col', 'reg'], has = [rowHas, colHas, regHas];
      for (var t = 0; t < 3; t++) for (var u = 0; u < n; u++) {
        if (has[t][u]) continue;
        var cs = candIn(unitCells(b, types[t], u), cand);
        if (cs.length === 0) return { forced: forced, dead: { type: types[t], idx: u } };
        if (cs.length === 1 && single < 0) single = cs[0];
      }
      if (single < 0) return null;
      forced.push(single);
      place(single);
    }
    return null;
  }

  /* 힌트 파이프라인: 실제로 바꿀 칸이 있는 첫 결과 하나를 돌려준다.
     결과 = { rule, rank, action:'x'|'duck'|'unx', targets:[cell], ev:{cells, units:[{type,idx}]}, chain? }
     maxRank를 주면 그 등급을 넘는 추론은 시도하지 않는다(난이도 평가용). */
  function hint(b, marks, maxRank) {
    maxRank = maxRank || 5;
    var n = b.n, N = n * n, nb = neighbors(n), i, k, r, c, g, u, t;
    var A = analyze(b, marks), cand = A.cand;

    // 1. 기본 제외: 확정 오리의 행·열·주변에 빈칸이 남아 있음
    for (k = 0; k < A.ducks.length; k++) {
      var d = A.ducks[k], dr = (d / n) | 0, dc = d % n, tg = [], seen = {};
      for (i = 0; i < n; i++) {
        var a1 = dr * n + i, a2 = i * n + dc;
        if (marks[a1] === BLANK && !seen[a1]) { seen[a1] = 1; tg.push(a1); }
        if (marks[a2] === BLANK && !seen[a2]) { seen[a2] = 1; tg.push(a2); }
      }
      for (i = 0; i < nb[d].length; i++) { var a3 = nb[d][i]; if (marks[a3] === BLANK && !seen[a3]) { seen[a3] = 1; tg.push(a3); } }
      if (tg.length) return { rule: 'basic', rank: 0, action: 'x', targets: tg, ev: { cells: [d], units: [] } };
    }

    // 2. 잘못된 X: 정답 칸에 일반 X가 있음
    for (i = 0; i < N; i++) if (marks[i] === XMARK && b.solSet[i])
      return { rule: 'fixx', rank: 0, action: 'unx', targets: [i], ev: { cells: [], units: [] } };

    // 3. 단일 후보 (R1): 행 → 열 → 구역
    var types = ['row', 'col', 'reg'], has = [A.rowHas, A.colHas, A.regHas];
    for (t = 0; t < 3; t++) for (u = 0; u < n; u++) {
      if (has[t][u]) continue;
      var cs = candIn(unitCells(b, types[t], u), cand);
      if (cs.length === 1) return { rule: 'single', rank: 1, action: 'duck', targets: [cs[0]], ev: { cells: [], units: [{ type: types[t], idx: u }] } };
    }
    if (maxRank < 2) return null;

    // 구역별·줄별 후보 요약
    var regRows = [], regCols = [], rowRegs = [], colRegs = [], openRegs = [], openRows = [], openCols = [];
    for (u = 0; u < n; u++) { regRows.push({}); regCols.push({}); rowRegs.push({}); colRegs.push({}); }
    for (i = 0; i < N; i++) if (cand[i]) {
      r = (i / n) | 0; c = i % n; g = b.reg[i];
      regRows[g][r] = 1; regCols[g][c] = 1; rowRegs[r][g] = 1; colRegs[c][g] = 1;
    }
    for (u = 0; u < n; u++) {
      if (!A.regHas[u]) openRegs.push(u);
      if (!A.rowHas[u]) openRows.push(u);
      if (!A.colHas[u]) openCols.push(u);
    }
    function keys(o) { return Object.keys(o).map(Number); }
    function union(list, maps) { var o = {}; list.forEach(function (x) { for (var q in maps[x]) o[q] = 1; }); return keys(o); }

    // k개 구역이 k개 줄에 갇힘 → 그 줄의 다른 구역 후보 제외 / k개 줄이 k개 구역에 갇힘 → 그 구역의 줄 밖 후보 제외
    function groupRule(k) {
      var found = null;
      var passes = [
        { from: openRegs, maps: regRows, kind: 'reg>row' },
        { from: openRegs, maps: regCols, kind: 'reg>col' },
        { from: openRows, maps: rowRegs, kind: 'row>reg' },
        { from: openCols, maps: colRegs, kind: 'col>reg' }
      ];
      for (var p = 0; p < passes.length && !found; p++) {
        var P = passes[p];
        if (P.from.length <= k) continue;
        combos(P.from, k, function (S) {
          var U = union(S, P.maps);
          if (U.length !== k) return false;
          var inS = {}, inU = {}, tg = [], ev = [], j;
          S.forEach(function (x) { inS[x] = 1; }); U.forEach(function (x) { inU[x] = 1; });
          for (j = 0; j < N; j++) {
            if (!cand[j]) continue;
            var rr = (j / n) | 0, cc = j % n, gg = b.reg[j], a, bb;
            if (P.kind === 'reg>row') { a = inS[gg]; bb = inU[rr]; }
            else if (P.kind === 'reg>col') { a = inS[gg]; bb = inU[cc]; }
            else if (P.kind === 'row>reg') { a = inS[rr]; bb = inU[gg]; }
            else { a = inS[cc]; bb = inU[gg]; }
            if (a && bb) ev.push(j);
            else if (!a && bb) tg.push(j);
          }
          if (!tg.length) return false;
          var fromType = P.kind.slice(0, 3), toType = P.kind.slice(4);
          found = {
            rule: k === 1 ? 'line' : 'group', rank: k === 1 ? 2 : (k <= 3 ? 3 : 4), action: 'x', targets: tg, kind: P.kind, k: k,
            ev: { cells: ev, units: S.map(function (x) { return { type: fromType, idx: x }; }).concat(U.map(function (x) { return { type: toType, idx: x }; })) }
          };
          return true;
        });
      }
      return found;
    }

    // 4. 줄과 구역 (R2)
    var h = groupRule(1);
    if (h) return h;
    if (maxRank < 3) return null;

    // 5. 여러 구역 (R3: 2~3개)
    for (k = 2; k <= 3; k++) { h = groupRule(k); if (h) return h; }

    // 6. 모순 확인: 강제 배치가 가장 짧은 가정을 고른다
    //    R3: 놓는 즉시 어떤 줄·구역의 후보가 사라짐 / R4: 강제 배치 1~2개 뒤 모순, 또는 4~6개 묶음 / R5: 더 긴 연쇄
    var best = null;
    for (i = 0; i < N; i++) {
      if (!cand[i]) continue;
      var res = assume(b, A, i);
      if (res && (!best || res.forced.length < best.forced.length)) { best = res; best.cell = i; if (!res.forced.length) break; }
    }
    function contra(rank) { return { rule: 'contra', rank: rank, action: 'x', targets: [best.cell], ev: { cells: [best.cell], units: [best.dead] }, chain: best }; }
    if (best && best.forced.length === 0) return contra(3);
    if (maxRank < 4) return null;
    if (best && best.forced.length <= 2) return contra(4);
    for (k = 4; k <= 6; k++) { h = groupRule(k); if (h) return h; }
    if (maxRank < 5) return null;
    if (best) return contra(5);
    return null;
  }

  function applyHint(marks, h) {
    for (var k = 0; k < h.targets.length; k++) {
      var c = h.targets[k];
      marks[c] = h.action === 'x' ? XMARK : h.action === 'duck' ? DUCK : BLANK;
    }
  }

  /* 빈 판(또는 선배치)에서 힌트만으로 끝까지 풀어 본다. 막히면 null. */
  function rate(b, prefill, maxRank) {
    var n = b.n, marks = new Uint8Array(n * n), maxR = 1, steps = 0, per = [0, 0, 0, 0, 0, 0], found = 0, guard = 0;
    (prefill || []).forEach(function (c) { marks[c] = DUCK; found++; });
    while (found < n) {
      if (++guard > 2000) return null;
      var h = hint(b, marks, maxRank);
      if (!h) return null;
      applyHint(marks, h);
      if (h.action === 'duck') { found++; if (!b.solSet[h.targets[0]]) return null; }
      if (h.rank > 0) { steps++; per[h.rank]++; if (h.rank > maxR) maxR = h.rank; }
    }
    return { rank: maxR, steps: steps, per: per };
  }

  return {
    BLANK: BLANK, XMARK: XMARK, DUCK: DUCK, WRONG: WRONG,
    neighbors: neighbors, makeBoard: makeBoard, decode: decode, encode: encode,
    validSolution: validSolution, countSolutions: countSolutions,
    analyze: analyze, hint: hint, applyHint: applyHint, rate: rate, unitCells: unitCells
  };
});
