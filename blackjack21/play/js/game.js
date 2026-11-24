/* Game flow and HUD: lobby, the walk-up to the table and opening shuffle, betting,
   dealing, player actions, dealer play, results and payout, running out of chips, settings. */
(function () {
  'use strict';
  var BJ = window.BJ, E = BJ.engine, U = BJ.util, anim = BJ.anim, S = BJ.stage, C = BJ.cards, Ch = BJ.chips, A = BJ.audio, I = BJ.i18n;
  var $ = function (id) { return document.getElementById(id); };
  var NcqMetrics = BJ.ncqMetrics;

  /* ---------- saved state: the shared save module NcqSave (on the device, backed up to the cloud in release builds) ---------- */
  var KEY = 'blackjack-proto-1';          // the save from before NcqSave, moved over once
  function fresh() {
    return { chips: E.START_CHIPS, xp: 0, table: 0, lastTable: null, unlocked: [true, false, false, false, false, false, false, false, false, false, false], starter: 0, tut: 0, nick: null, icon: 0, icons: [], ach: {}, achSeen: {}, adHands: 0, unveil: -1, tours: {}, rating: 1000, tourLog: [], inTour: null, bank: null, lang: null, sound: true,
             vipUntil: 0, vipDays: 0, vipApplied: 0, vipGift: null, migrated: false, firstDay: null, dayHands: {},
             stats: { hands: 0, won: 0, lost: 0, pushed: 0, bjs: 0, ads: 0, peak: E.START_CHIPS } };
  }
  function load() {
    var N = window.NcqSave, f = fresh();
    N.init({ id: 'blackjack21', data: f });
    var d = N.get();
    if (!d.migrated) {
      var old = null;
      try { old = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { old = null; }
      N.update(function (s) {
        if (old) {
          Object.keys(old).forEach(function (k) { s[k] = old[k]; });
          if (old.starter === undefined) s.starter = Math.min(3, (old.stats && old.stats.hands) || 0);
          if (old.tut === undefined && old.stats && old.stats.hands > 0) s.tut = 9;      // older players skip the first-time pointers
        }
        s.migrated = true;
      });
      if (old) { try { localStorage.removeItem(KEY); } catch (e) { /* nothing to clear */ } }
      d = N.get();
    }
    for (var k in f) if (d[k] === undefined) d[k] = f[k];
    for (var q in f.stats) if (d.stats[q] === undefined) d.stats[q] = f.stats[q];
    while (d.unlocked.length < f.unlocked.length) d.unlocked.push(false);
    // closed mid-tournament: the tournament chips go back to the entry and the player's own chips come back
    if (d.inTour) { if (d.tours && d.tours[d.inTour]) d.tours[d.inTour].chips = d.chips; d.chips = d.bank != null ? d.bank : d.chips; d.inTour = null; d.bank = null; }
    return d;
  }
  function save() { window.NcqSave.update(function (s) { Object.keys(st).forEach(function (k) { s[k] = st[k]; }); }); }

  var st = load();
  var table = E.TABLES[st.table];
  var mode = 'boot';            // lobby | intro (camera move + shuffle, no HUD) | table
  var sel = 0;                  // table highlighted in the lobby (set at boot)
  var phase = 'busy';           // bet | busy | player
  var round = null;
  var bet = 0, betChips = [], lastBet = [];
  var view = { dealer: [], hands: [[], []] };
  var split = false;
  var shown = st.chips;         // the balance on screen counts toward st.chips
  var busted = [false, false];  // hands whose chips were already taken
  var boost = 1;                // animation speed-up (the shuffle runs at SHUFFLE_SPEED)
  var SHUFFLE_SPEED = 1.5;      // the deck shuffle plays a little brisker, and can't be tapped away
  var shoe = null;              // the dealer's running shoe; reshuffled when it runs down to the cut card
  var CUT = 78;                 // about three quarters dealt

  /* ---------- where things sit on the felt ---------- */
  var DEALER = { x: 0, z: S.LAYOUT.dealerZ }, HAND = { x: 0, z: 4.4 }, PILE = { x: 0, z: 17.6 };
  var SPLIT_X = 7.7, SPLIT_PILE_X = 5.3;

  function handCenter(i) { return split ? { x: i ? SPLIT_X : -SPLIT_X, z: HAND.z } : HAND; }

  // Slot for every card of a hand: a tight overlapping row, re-centred as it grows.
  function slots(who, i) {
    var list = who === 'dealer' ? view.dealer : view.hands[i];
    var n = list.length, ctr = who === 'dealer' ? DEALER : handCenter(i), off;
    // A doubled hand ends with one card laid sideways across the row.
    var m = n && list[n - 1].sideways ? n - 1 : n, out = [];
    if (who === 'dealer') off = n <= 2 ? 8.7 : Math.min(3.6, (S.LAYOUT.dealerHalf * 2 - C.W) / (n - 1));   // two cards sit in their printed boxes
    else off = split ? Math.min(2.4, 6.6 / Math.max(1, m - 1)) : Math.min(3.3, 13.5 / Math.max(1, m - 1));
    for (var k = 0; k < n; k++) {
      var c = list[k], o = { x: ctr.x + (k - (m - 1) / 2) * off, y: 0.04 + k * 0.058, z: ctr.z, yaw: c.jit };
      if (c.sideways) { o.x = ctr.x + 0.9; o.z = ctr.z + 2.4; o.yaw = Math.PI / 2 + c.jit; }
      out.push(o);
    }
    return out;
  }

  function dealTo(who, i, card, faceUp, sideways) {
    var list = who === 'dealer' ? view.dealer : view.hands[i];
    var c = C.make(card);
    c.jit = U.rand(-0.03, 0.03); c.sideways = !!sideways;
    dealtFromShoe++; S.setShoeCount(Math.max(0, shoeTotal() - dealtFromShoe)); refreshShoeTag();
    list.push(c);
    var sl = slots(who, i);
    for (var k = 0; k < list.length - 1; k++) C.moveTo(list[k], sl[k], 0.22);
    var tg = sl[list.length - 1];
    tg.faceUp = faceUp;
    return C.deal(c, tg).then(refreshTotals);
  }

  // What the shoe shows: cards still in it. Cards are pulled out of the array at deal time, so count the ones animated.
  var dealtFromShoe = 0, shoeAtDeal = 312;
  function shoeTotal() { return shoeAtDeal; }
  function refreshShoeTag() { var el = $('shoeTag'); el.textContent = Math.max(0, shoeAtDeal - dealtFromShoe); }




  /* ---------- multiplayer bet clock ---------- */
  // At a shared table you get 30 seconds to bet and press DEAL. The DEAL button's border runs down like a clock,
  // shows the seconds left, and starts to nod for the last five. If time runs out with a bet down it deals;
  // with nothing down you sit this hand out.
  var BET_SECONDS = 30, betTimer = 0, betEnds = 0;
  function startBetTimer() {
    stopBetTimer();
    betEnds = Date.now() + BET_SECONDS * 1000;
    var btn = $('btnDeal'); btn.classList.add('timed');
    var badge = $('dealClock');
    if (!badge) { badge = document.createElement('i'); badge.id = 'dealClock'; btn.parentNode.appendChild(badge); }
    badge.className = 'on';
    tickBet(); betTimer = setInterval(tickBet, 100);
  }
  function tickBet() {
    var left = Math.max(0, betEnds - Date.now()), btn = $('btnDeal'), badge = $('dealClock');
    btn.style.setProperty('--p', (left / (BET_SECONDS * 1000)).toFixed(3));
    badge.textContent = Math.ceil(left / 1000);
    var r = btn.getBoundingClientRect(), pr = btn.parentNode.getBoundingClientRect();
    badge.style.left = (r.left - pr.left + r.width / 2) + 'px'; badge.style.top = (r.top - pr.top) + 'px';
    btn.classList.toggle('hurry', left < 5000);
    if (left > 0) return;
    stopBetTimer();
    if (phase !== 'bet') return;
    // time's up: whatever is down is topped up to the table maximum (or all you have) and dealt
    var want = Math.min(table.max, st.chips + bet) - bet;
    autoBet = true;
    if (bet + want >= table.min) {
      toast(I.t('autoBet', { n: U.money(bet + want) }));
      E.breakdown(want, 30).forEach(function (d) { st.chips -= d; bet += d; betChips.push(d); Ch.bet(d, 'h0'); });
      refreshBetTags(); refreshButtons();
      return anim.wait(0.6).then(function () { if (phase === 'bet') deal(); });
    }
    clearBet(); toast(I.t('timeOut'));
    if (mates.some(Boolean)) sitOutHand(I.t('sittingOut')); else startBetTimer();
  }

  /* ---------- multiplayer turn clock ---------- */
  // Your decisions at a shared table get 30 seconds too: every action button carries the running border,
  // they nod harder as time runs low, and when it's out you stand.
  var autoBet = false, handIdle = false;     // a hand that ran only on timeouts
  var ACT_SECONDS = 30, actTimer = 0, actEnds = 0;
  function startActTimer() {
    stopActTimer();
    if (!multi) return;
    actEnds = Date.now() + ACT_SECONDS * 1000;
    var bar = $('actBar'), badge = $('actClock');
    if (!badge) { badge = document.createElement('i'); badge.id = 'actClock'; bar.appendChild(badge); }
    badge.className = 'on';
    tickAct(); actTimer = setInterval(tickAct, 100);
  }
  function tickAct() {
    var left = Math.max(0, actEnds - Date.now()), frac = left / (ACT_SECONDS * 1000);
    var btns = $('actBar').querySelectorAll('.btn.act');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.classList.toggle('timed', !b.disabled);
      b.style.setProperty('--p', frac.toFixed(3));
      b.classList.toggle('hurry', !b.disabled && left < 10000);
      b.classList.toggle('panic', !b.disabled && left < 4000);
    }
    $('actClock').textContent = Math.ceil(left / 1000);
    if (left > 0) return;
    stopActTimer();
    if (phase === 'player') act('stand', true);
  }
  function stopActTimer() {
    clearInterval(actTimer); actTimer = 0;
    Array.prototype.forEach.call($('actBar').querySelectorAll('.btn.act'), function (b) { b.classList.remove('timed', 'hurry', 'panic'); });
    var badge = $('actClock'); if (badge) badge.className = '';
  }
  function stopBetTimer() {
    clearInterval(betTimer); betTimer = 0;
    var btn = $('btnDeal'); btn.classList.remove('timed', 'hurry');
    var badge = $('dealClock'); if (badge) badge.className = '';
  }

  /* ---------- metrics: hands (levelStart/levelEnd), first-time steps, screen flow ---------- */
  // The full plan with every observation point is in docs/metrics-plan.md.
  function handMode() { return st.inTour ? 'tour_' + st.inTour.split(':')[0] : multi ? 'multi' : 'single'; }
  function dayNo() { var d = new Date(); var k = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5); if (st.firstDay == null) { st.firstDay = k; save(); } return k - st.firstDay + 1; }
  function handCountSteps(n) {
    if (n === 1) NcqMetrics.step("010_hand1_end");
    else if (n === 2) NcqMetrics.step("013_hand2_end");
    else if (n === 3) NcqMetrics.step("014_hand3_end");
    else if (n === 5) NcqMetrics.step("015_hand5_end");
    else if (n === 10) NcqMetrics.step("016_hand10_end");
    else if (n === 25) NcqMetrics.step("021_hand25_end");
    else if (n === 50) NcqMetrics.step("022_hand50_end");
    else if (n === 100) NcqMetrics.step("024_hand100_end");
    else if (n === 200) NcqMetrics.step("026_hand200_end");
    else if (n === 500) NcqMetrics.step("027_hand500_end");
  }
  function levelSteps(L) {
    if (L >= 2) NcqMetrics.step("017_level2");
    if (L >= 5) NcqMetrics.step("023_level5");
    if (L >= 9) NcqMetrics.step("025_level9");
    if (L >= 14) NcqMetrics.step("028_level14");
  }
  function dayOpenStep() {
    var n = dayNo();
    if (n === 2) NcqMetrics.step("080_day2_open");
    else if (n === 3) NcqMetrics.step("083_day3_open");
    else if (n === 4) NcqMetrics.step("086_day4_open");
    else if (n === 5) NcqMetrics.step("089_day5_open");
  }
  function dayHandSteps() {
    var n = dayNo(); if (n < 2 || n > 5) return;
    var key = 'd' + n; st.dayHands = st.dayHands || {}; st.dayHands[key] = (st.dayHands[key] || 0) + 1;
    var c = st.dayHands[key];
    if (n === 2) { NcqMetrics.step("081_day2_hand_end"); if (c >= 10) NcqMetrics.step("082_day2_hand10"); }
    else if (n === 3) { NcqMetrics.step("084_day3_hand_end"); if (c >= 10) NcqMetrics.step("085_day3_hand10"); }
    else if (n === 4) { NcqMetrics.step("087_day4_hand_end"); if (c >= 10) NcqMetrics.step("088_day4_hand10"); }
    else { NcqMetrics.step("090_day5_hand_end"); if (c >= 10) NcqMetrics.step("091_day5_hand10"); }
  }
  // hand results worth noting once
  function handResultSteps(best, net) {
    if (best === 'win' || best === 'blackjack') NcqMetrics.step("first_win");
    if (best === 'blackjack') NcqMetrics.step("first_blackjack");
    if (best === 'push') NcqMetrics.step("first_push");
    if (best === 'lose') NcqMetrics.step("first_loss");
    if ((st.stats.streak || 0) >= 3) NcqMetrics.step("streak3");
    if (multi) NcqMetrics.step("multi_first_hand_end");
    if (st.inTour) NcqMetrics.step("tour_first_hand_end");
    void net;
  }

  /* ---------- first-time pointers ---------- */
  // The first time at a table: light up the chips ("place a bet"), then DEAL, play the hand, and after it the ? button.
  // Everything else is dimmed and can't be pressed while a pointer is up.
  var coachStep = 0, coachTarget = null;
  function coachShow(el, text, sub, tapClose) {
    var box = $('coach'), g = $('game').getBoundingClientRect(), r = el.getBoundingClientRect(), pad = 8;
    var x0 = r.left - g.left - pad, y0 = r.top - g.top - pad, x1 = r.right - g.left + pad, y1 = r.bottom - g.top + pad, W = g.width, H = g.height;
    var b = box.querySelectorAll('.blk');
    function put(e, l, t, w, h) { e.style.left = l + 'px'; e.style.top = t + 'px'; e.style.width = Math.max(0, w) + 'px'; e.style.height = Math.max(0, h) + 'px'; }
    put(b[0], 0, 0, W, y0); put(b[1], 0, y1, W, H - y1); put(b[2], 0, y0, x0, y1 - y0); put(b[3], x1, y0, W - x1, y1 - y0);
    put(box.querySelector('.ring'), x0, y0, x1 - x0, y1 - y0);
    var tip = box.querySelector('.tip');
    tip.innerHTML = ''; tip.appendChild(document.createTextNode(text));
    if (sub) { var sm = document.createElement('small'); sm.textContent = sub; tip.appendChild(sm); }
    box.className = 'on' + (tapClose ? ' tapclose' : '');
    var below = y1 + 14, above = y0 - 14 - tip.offsetHeight;
    tip.style.top = ((y0 + y1) / 2 > H * 0.5 ? above : below) + 'px';
    coachTarget = el;
  }
  function coachHide() { $('coach').className = ''; coachTarget = null; }
  // keep the lit hole on its target while bars slide in or the window changes size
  setInterval(function () { if (coachTarget && $('coach').className) coachRelayout(); }, 250);
  function coachRelayout() {
    if (!coachTarget) return;
    if (coachStep === 1) { coachShow($('chipRow'), I.t('coachBet')); NcqMetrics.step("004_coach_bet"); }
    else if (coachStep === 2) { coachShow($('btnDeal'), I.t('coachDeal')); NcqMetrics.step("006_coach_deal"); }
    else if (coachStep === 3) { coachShow($('btnHelp'), I.t('coachHelp'), I.t('coachTap'), true); NcqMetrics.step("011_coach_help"); }
    else if (coachStep === 4) { coachShow(document.querySelector('[data-act=stand]'), I.t('coachStand')); NcqMetrics.step("008_coach_stand"); }
    else if (coachStep === 5) { coachShow(document.querySelector('.playrow'), I.t('coachPick')); NcqMetrics.step("020_unveil_done"); }
  }
  function coachBegin() {
    if (st.tut >= 1 || mode !== 'table') return;
    st.tut = 1; coachStep = 1; save();
    setTimeout(coachRelayout, 350); coachTarget = $('chipRow'); coachRelayout();
  }
  function coachAfterBet() { if (coachStep === 1 && bet >= table.min) { coachStep = 2; st.tut = 2; coachRelayout(); } }
  var standPending = false, coachShownAt = 0;
  function coachAfterDeal() { if (coachStep === 2) { coachStep = 0; st.tut = 3; coachHide(); save(); standPending = true; } }
  // first decision of the first hand: point at STAND (the welcome hand is a 20)
  function coachPlayerTurn() {
    if (!standPending) return;
    standPending = false; coachStep = 4; coachTarget = $('actBar');
    setTimeout(coachRelayout, 300); coachRelayout();
  }
  function coachAfterAct() { if (coachStep === 4) { coachStep = 0; coachHide(); } }
  function coachAfterHand() {
    standPending = false; if (coachStep === 4) { coachStep = 0; coachHide(); }
    if (st.tut !== 3) return;
    st.tut = 4; save();
    setTimeout(function () { if (mode !== 'table' || phase !== 'bet') { st.tut = 3; return; } coachStep = 3; coachTarget = $('btnHelp'); coachShownAt = Date.now(); coachRelayout(); }, 900);
  }
  // the ? pointer stays at least a second, so a quick double tap doesn't skip past it unread
  // after a new table pops open in the lobby: point at MULTI / SINGLE and let the player pick one
  function coachPickMode() {
    if (mode !== 'lobby') return;
    coachStep = 5; coachTarget = document.querySelector('.playrow');
    setTimeout(coachRelayout, 300); coachRelayout();
  }
  function coachPickDone() { if (coachStep === 5) { coachStep = 0; coachHide(); } }
  function coachEnd() { if (coachStep === 3 && Date.now() - coachShownAt >= 1000) { coachStep = 0; st.tut = 9; save(); coachHide(); NcqMetrics.step("012_coach_help_done"); } }

  /* ---------- tablemates (multiplayer look, no real matching yet) ---------- */
  // Up to two AI players sit to either side. They bet, take cards from the same shoe, play basic strategy
  // before you, and settle against the dealer like you do. Between hands people now and then sit down or leave.
  var multi = false;
  // seats either side of yours along the curve of the table, cards turned toward the dealer
  // Side seats sit level with your hand, cards turned 45° in toward you, each with its own betting spot below.
  // Side seats copy your own seat — the same betting box and the same gap from the box to the cards
  // (HAND.z to PILE.z) — only turned in toward the dealer and set up the table's curve.
  var SEATS = [-1, 1].map(function (side) {
    var spin = 0.34 * side, px = 25 * side, pz = 13, gap = PILE.z - HAND.z;
    return { px: px, pz: pz, spin: spin, yaw: spin, x: px - Math.sin(spin) * gap, z: pz - Math.cos(spin) * gap };
  });
  Ch.setPile('m0', SEATS[0].px, SEATS[0].pz, 3.2); Ch.setPile('m1', SEATS[1].px, SEATS[1].pz, 3.2);
  var mates = [null, null];
  function seatEl(i) {
    var id = 'seat' + i, el = $(id);
    if (!el) {
      el = document.createElement('div'); el.id = id; el.className = 'seat off';
      el.innerHTML = '<div class="who"><span class="ord"></span><img alt=""><b></b></div><div class="info"><span class="bet"></span><span class="tot"></span></div><div class="status"></div>';
      $('marks').appendChild(el);
      var res = document.createElement('div'); res.className = 'seat seatres'; res.id = 'seatRes' + i; res.innerHTML = '<div class="res"></div>';
      $('marks').appendChild(res);
      // the seat's total over its cards and its stake above its box, like yours but smaller
      var tot = document.createElement('div'); tot.className = 'total mini'; tot.id = 'seatTot' + i; $('marks').appendChild(tot);
      var bt = document.createElement('div'); bt.className = 'bettag mini'; bt.id = 'seatBet' + i; $('marks').appendChild(bt);
    }
    return el;
  }
  function seatCards(i) {
    var m = mates[i], sp = SEATS[i], n = m.cards.length, off = Math.min(2.6, 9 / Math.max(1, n - 1)), out = [];
    var ux = Math.cos(sp.yaw), uz = -Math.sin(sp.yaw);
    if (m.sets) {               // a split seat: two little rows side by side along the seat
      return m.cards.map(function (c) {
        var k = m.sets[0].indexOf(c) >= 0 ? 0 : 1, set = m.sets[k], j = set.indexOf(c), o = Math.min(1.6, 4.5 / Math.max(1, set.length - 1));
        var d = (k ? 5.2 : -5.2) + (j - (set.length - 1) / 2) * o;
        return { x: sp.x + ux * d, y: 0.04 + j * 0.058, z: sp.z + uz * d, yaw: sp.yaw + c.jit, faceUp: true };
      });
    }
    for (var k = 0; k < n; k++) {
      var d = (k - (n - 1) / 2) * off;
      out.push({ x: sp.x + ux * d, y: 0.04 + k * 0.058, z: sp.z + uz * d, yaw: sp.yaw + m.cards[k].jit, faceUp: true });
    }
    return out;
  }
  function mateDrawCard(i, card) {
    var m = mates[i], c = C.make(card);
    c.jit = U.rand(-0.03, 0.03);
    m.hand.push(card); m.cards.push(c); if (m.sets) m.sets[m.active].push(c);
    var sl = seatCards(i);
    for (var k = 0; k < m.cards.length - 1; k++) C.moveTo(m.cards[k], sl[k], 0.2);
    return C.deal(c, sl[sl.length - 1]).then(function () { refreshSeat(i); });
  }
  function mateDraw(i) {
    // from the far end of the shoe, so set-up hands (the welcome deals) stay in order for the player and dealer
    var m = mates[i], card = shoe.shift(), c = C.make(card);
    c.jit = U.rand(-0.03, 0.03);
    m.hand.push(card); m.cards.push(c); if (m.sets) m.sets[m.active].push(c);
    dealtFromShoe++; S.setShoeCount(Math.max(0, shoeTotal() - dealtFromShoe)); refreshShoeTag();
    var sl = seatCards(i);
    for (var k = 0; k < m.cards.length - 1; k++) C.moveTo(m.cards[k], sl[k], 0.2);
    return C.deal(c, sl[sl.length - 1]).then(function () { refreshSeat(i); });
  }
  function refreshSeat(i) {
    var m = mates[i], el = seatEl(i), tot = $('seatTot' + i), bt = $('seatBet' + i);
    if (!m) { el.classList.add('off'); tot.className = 'total mini'; bt.className = 'bettag mini'; $('seatRes' + i).querySelector('.res').className = 'res'; return; }
    el.classList.remove('off');
    el.querySelector('img').src = BJ.meta.icon(m.icon);
    el.querySelector('b').textContent = m.nick;
    el.querySelector('.bet').textContent = m.bet ? '● ' + U.money(m.bet) : '';
    var v = m.hand.length ? E.handValue(m.hand) : null;
    if (m.hands) v = null;
    el.querySelector('.tot').textContent = '';
    el.querySelector('.bet').textContent = '';
    tot.textContent = v ? (v.soft && v.total < 21 ? (v.total - 10) + '/' + v.total : v.total) : '';
    tot.className = 'total mini' + (v ? ' on' : '') + (v && v.total > 21 ? ' bust' : '');
    if (m.hands) { tot.textContent = m.hands.map(function (h) { return h.length ? E.handValue(h).total : '·'; }).join(' · '); tot.className = 'total mini on'; }
    bt.textContent = m.bet ? U.money(m.bet) : '';
    bt.className = 'bettag mini' + (m.bet ? ' on' : '');
    el.querySelector('.status').textContent = '';
    // the seat's move (HIT, STAND, ...) shows in its call-out spot until the hand is settled there
    var res = $('seatRes' + i).querySelector('.res');
    if (!/\bdone\b/.test(res.className)) {
      var word = { THINK: I.t('mThink'), BETTHINK: I.t('mBetThink'), READY: I.t('mReady'), TIMEOUT: I.t('mTimeout'), AUTOBET: I.t('mAutoBet') }[m.status] || m.status || '';
      res.textContent = word;
      res.className = 'res' + (m.status ? ' on act' + (m.status === 'BUST' ? ' lose' : '') + (/THINK/.test(m.status) ? ' think' : '') + (m.status === 'READY' ? ' ready' : '') : '');
    }
  }
  function layoutSeats() {
    for (var i = 0; i < 2; i++) {
      var sp = SEATS[i], el = $('seat' + i);      // the name sits just past the outer end of the seat's box, out toward the rail
      if (el) pin(el, sp.px * 0.72 + Math.sin(sp.spin) * 6, 0.5, sp.pz + Math.cos(sp.spin) * 7.5);   // pulled in a little so it stays on screen
      var up = { x: -Math.sin(sp.spin), z: -Math.cos(sp.spin) }, tt = $('seatTot' + i), bt = $('seatBet' + i);
      if (tt) pin(tt, sp.x + up.x * (C.H / 2 + 0.4), 0.5, sp.z + up.z * (C.H / 2 + 0.4));
      if (bt) pin(bt, sp.px + up.x * 5.9, 0.3, sp.pz + up.z * 5.9);
      var r = $('seatRes' + i), out = { x: -Math.cos(sp.spin) * (i ? -1 : 1), z: Math.sin(sp.spin) * (i ? -1 : 1) };   // call-out spot: above the cards, toward the outside
      if (r) { pin(r, sp.x + up.x * (C.H / 2 + 3.6) + out.x * 5.5, 0.6, sp.z + up.z * (C.H / 2 + 3.6) + out.z * 5.5); r.style.transform = r.style.transform.replace('translate(-50%,-50%)', i ? 'translate(-100%,-50%)' : 'translate(0,-50%)'); r.style.textAlign = i ? 'right' : 'left'; }
    }
  }
  function seatMate(i, quiet) {
    var taken = mates.filter(Boolean).map(function (m) { return m.nick; }).concat([st.nick]);
    var m = BJ.meta.randomMate(taken);
    mates[i] = { nick: m.nick, icon: m.icon, bet: 0, hand: [], cards: [], status: '', seq: ++joinSeq };
    refreshSeat(i); refreshOrder();
    if (!quiet) { toast(I.t('joined', { n: m.nick })); A.tick(); }
  }
  function leaveMate(i) {
    var m = mates[i]; if (!m) return;
    mateClear(i);
    mates[i] = null; refreshSeat(i); refreshOrder();
    toast(I.t('left', { n: m.nick }));
  }
  // Turn order: everyone sees themselves in the middle, but play goes by when you sat down: first come, first
  // to play, and whoever arrives later goes to the back. The number shows beside each player's picture.
  var joinSeq = 0, mySeq = 0;
  function turnOrder() {
    var list = [{ me: true, seq: mySeq }];
    mates.forEach(function (m, i) { if (m) list.push({ i: i, seq: m.seq }); });
    return list.sort(function (a, b) { return a.seq - b.seq; });
  }
  function refreshOrder() {
    var ord = turnOrder(), mine = $('myOrd');
    ord.forEach(function (o, k) { if (!o.me) { var e = $('seat' + o.i); if (e) e.querySelector('.ord').textContent = k + 1; } });
    if (!mine) { mine = document.createElement('span'); mine.id = 'myOrd'; mine.className = 'ord'; $('btnProfile').appendChild(mine); }
    ord.forEach(function (o, k) { if (o.me) mine.textContent = k + 1; });
    mine.hidden = !multi || mode === 'lobby';
  }
  function clearSeats() { if (Ch.count) { mateClear(0); mateClear(1); } mates = [null, null]; for (var i = 0; i < 2; i++) refreshSeat(i); }
  // Coming to a multiplayer table: one or two players already there, mid-hand. You watch it play out, then everyone starts together.
  function joinTable() {
    clearSeats();
    var n = Math.random() < 0.55 ? 2 : 1, first = Math.random() < 0.5 ? 0 : 1;
    seatMate(first, true); if (n === 2) seatMate(1 - first, true);
    mySeq = ++joinSeq; refreshOrder();          // you sat down last, so you play after the ones already here
    S.fly(S.POSES.multi, 0.8);
    toastHold(I.t('waitOthers'));
    return anim.wait(1.2).then(function () { toastEnd(); });
  }
  // Each tablemate has a mood: careful ones creep up by the minimum, bold ones throw big round numbers,
  // and now and then someone pushes a stack to the max.
  function mateStake(m) {
    if (!m.style) m.style = ['careful', 'steady', 'bold', 'wild'][(Math.random() * 4) | 0];
    var r = Math.random(), mult;
    if (m.style === 'careful') mult = [1, 1, 2, 3][(r * 4) | 0];
    else if (m.style === 'steady') mult = [2, 3, 5, 5, 10][(r * 5) | 0];
    else if (m.style === 'bold') mult = [5, 10, 15, 20, 25][(r * 5) | 0];
    else mult = r < 0.2 ? table.max / table.min : [3, 7, 12, 30][(Math.random() * 4) | 0];
    return Math.max(table.min, Math.min(table.max, table.min * mult));
  }
  function mateChips(i, amount) {
    var sp = SEATS[i], from = { x: sp.px + (i ? 9 : -9), y: 7, z: sp.pz + 8 };
    E.breakdown(amount, 10).forEach(function (d, k) { anim.wait(k * 0.06).then(function () { Ch.betFrom(d, 'm' + i, from); }); });
  }
  function mateClear(i) { if (Ch.count('m' + i)) Ch.sweep('m' + i); }
  // A hand you're not in: the others play it out against the dealer in full view, dealer cards and all.
  function watchHand() {
    var dc = [];
    function dealerCard(faceUp) {
      var card = shoe.shift(); dc.push(card);
      return dealTo('dealer', 0, card, faceUp);
    }
    var chain = Promise.resolve();
    mates.forEach(function (m, i) { if (m) chain = chain.then(function () { return mateDraw(i); }); });
    chain = chain.then(function () { return dealerCard(true); });
    mates.forEach(function (m, i) { if (m) chain = chain.then(function () { return mateDraw(i); }); });
    chain = chain.then(function () { return dealerCard(false); });
    return chain.then(function () { return matesPlay(dc.slice(0, 1)); })
      .then(function () { return C.reveal(view.dealer[1]).then(refreshTotals); })
      .then(function draw() {
        var live = mates.some(function (m) { return m && m.hand.length && E.handValue(m.hand).total <= 21; });
        if (!live || E.handValue(dc).total >= 17) return;
        return anim.wait(0.35).then(function () { return dealerCard(true); }).then(draw);
      })
      .then(function () { matesSettle(dc); return anim.wait(1.6); })
      .then(function () {
        var all = view.dealer.concat(matesCards()); view.dealer = [];
        mates.forEach(function (m, i) { mateClear(i); if (m) { m.hand = []; m.bet = 0; m.status = ''; m.hands = m.sets = m.stakes = null; m.active = 0; $('seatRes' + i).querySelector('.res').className = 'res'; refreshSeat(i); } });
        refreshTotals();
        return C.collect(all);
      });
  }
  function fakeDealer() { return [{ rank: ['7', '8', '9', '10', 'K'][(Math.random() * 5) | 0], suit: 'S' }]; }
  function matesBet() {
    mates.forEach(function (m, i) {
      if (!m) return;
      if (!m.placed) { m.bet = m.idle ? table.max : mateStake(m); mateChips(i, m.bet); }
      m.hand = []; m.cards = []; m.status = ''; m.thought = false; m.placed = false; m.turnDone = false; m.hands = m.sets = m.stakes = null; m.active = 0;
      $('seatRes' + i).querySelector('.res').className = 'res';
      refreshSeat(i);
    });
  }
  function matesDeal() {
    var chain = Promise.resolve();
    [0, 1].forEach(function (k) { mates.forEach(function (m, i) { if (m) chain = chain.then(function () { return mateDraw(i); }); }); });
    return chain;
  }
  // A tablemate stops to think before each move like a person would: from a blink to ten seconds.
  function think(i, long) {
    var m = mates[i]; if (!m) return Promise.resolve();
    m.status = 'THINK'; refreshSeat(i);
    if (m.idle) return anim.wait(ACT_SECONDS);           // the AFK seat: the whole clock runs out
    return anim.wait(U.rand(0.1, 10));                  // anywhere from an instant to ten seconds
  }
  // While you bet, the others make up their minds too and put their chips down when they've decided: some
  // straight away, most after a good think. The cards only come out once everyone's stake is down.
  var betThinkId = 0;
  function matesThinkBets() {
    var id = ++betThinkId;
    mates.forEach(function (m, i) {
      if (!m) return;
      m.placed = false;
      // now and then (about one hand in 200 per seat) someone has wandered off: they never decide, the clock
      // decides for them, and they're sent off the table after the hand, just like a real player would be
      if (!m.idle && Math.random() < 0.005) m.idle = true;
      m.status = 'BETTHINK'; refreshSeat(i);
      var wait = m.idle ? BET_SECONDS : U.rand(0.1, 10);
      anim.wait(wait).then(function () {
        if (id !== betThinkId || mates[i] !== m || m.placed) return;
        placeMate(i, m.idle ? 'AUTOBET' : 'READY');
      });
    });
  }
  function placeMate(i, status) {
    var m = mates[i];
    m.bet = m.idle ? table.max : mateStake(m); m.placed = true; m.status = status;
    mateChips(i, m.bet); A.tick && A.tick();
    refreshSeat(i);
  }
  function matesAllPlaced() { return mates.every(function (m) { return !m || m.placed; }); }
  function waitMates() { return matesAllPlaced() ? Promise.resolve() : anim.wait(0.25).then(waitMates); }
  // Each AI plays its hand out by basic strategy (hit or stand only), one after the other.
  function matesPlay(dealerCards) {
    var chain = Promise.resolve();
    mates.forEach(function (m, i) {
      if (!m) return;
      var first = true;
      chain = chain.then(function step() {
        var v = E.handValue(m.hand);
        if (v.total >= 21) { m.status = v.total > 21 ? 'BUST' : ''; refreshSeat(i); return; }
        if (!m.thought) { m.thought = true; var long = first; first = false; return think(i, long).then(step); }
        m.thought = false;
        if (m.idle) { m.status = 'TIMEOUT'; refreshSeat(i); return; }
        var move = E.advise({ hands: [{ cards: m.hand }], active: 0, dealer: dealerCards }, { double: m.hand.length === 2, split: false });
        if (move === 'double' && m.style !== 'careful') {
          mateChips(i, m.bet); m.bet = m.bet * 2; m.status = 'DOUBLE'; refreshSeat(i);
          return anim.wait(0.35).then(function () { return mateDraw(i); }).then(function () { if (E.handValue(m.hand).total > 21) m.status = 'BUST'; refreshSeat(i); });
        }
        if (move !== 'hit') { m.status = 'STAND'; refreshSeat(i); return anim.wait(0.25); }
        m.status = 'HIT'; refreshSeat(i);
        return anim.wait(0.35).then(function () { return mateDraw(i); }).then(step);
      });
    });
    return chain;
  }
  // Seats take their turns in join order: the ones ahead of you before your turn, the rest after it.
  function matesTurns(which, dealerCards) {
    var chain = Promise.resolve();
    turnOrder().forEach(function (o, k) {
      if (o.me || !which(k)) return;
      chain = chain.then(function () { return mateTurn(o.i, dealerCards); });
    });
    return chain;
  }
  function myPos() { var ord = turnOrder(); for (var k = 0; k < ord.length; k++) if (ord[k].me) return k; return 0; }
  function mateTurn(i, dealerCards) {
    var m = mates[i];
    if (!m || !m.hand.length || m.turnDone) return Promise.resolve();
    m.turnDone = true;
    var first = true;
    return (function step() {
        var v = E.handValue(m.hand);
        if (v.total >= 21) { m.status = v.total > 21 ? 'BUST' : ''; refreshSeat(i); return next(); }
        if (!m.thought) { m.thought = true; var long = first; first = false; return think(i, long).then(step); }
        m.thought = false;
        if (m.idle) { m.status = 'TIMEOUT'; refreshSeat(i); return next(); }
        if (!m.sets && wantsSplit(m, dealerCards)) return splitMate(i).then(step);
        var move = E.advise({ hands: [{ cards: m.hand }], active: 0, dealer: dealerCards }, { double: m.hand.length === 2, split: false });
        if (move === 'double' && m.style !== 'careful') {
          var stake = m.stakes ? m.stakes[m.active] : m.bet;
          mateChips(i, stake); m.bet += stake; if (m.stakes) m.stakes[m.active] *= 2; m.status = 'DOUBLE';
          return mateDraw(i).then(function () { if (E.handValue(m.hand).total > 21) m.status = 'BUST'; refreshSeat(i); return next(); });
        }
        if (move !== 'hit') { m.status = 'STAND'; refreshSeat(i); return next(); }
        m.status = 'HIT'; refreshSeat(i);
        return mateDraw(i).then(step);
    })();
    // after a split's first hand, the second one gets its card and its turn
    function next() {
      if (!m.sets || m.active === 1) return;
      m.active = 1; m.hand = m.hands[1]; m.thought = false;
      return anim.wait(0.4).then(function () { return mateDraw(i); }).then(function () { return step2(); });
    }
    function step2() { return mateTurnStep(i, dealerCards, next); }
  }
  // People don't always split by the book: most do when the chart says so, a few split what they shouldn't.
  function wantsSplit(m, dealerCards) {
    if (m.hand.length !== 2 || E.cardValue(m.hand[0]) !== E.cardValue(m.hand[1])) return false;
    var adv = E.advise({ hands: [{ cards: m.hand }], active: 0, dealer: dealerCards }, { double: true, split: true });
    if (BJ.debug.forceSplit) return true;
    if (adv === 'split') return Math.random() < 0.85;
    return Math.random() < (E.cardValue(m.hand[0]) === 10 ? 0.04 : 0.1);
  }
  function splitMate(i) {
    var m = mates[i], h = m.hand, c = m.cards;
    m.status = 'SPLIT'; refreshSeat(i);
    mateChips(i, m.bet); m.stakes = [m.bet, m.bet]; m.bet *= 2;
    m.hands = [[h[0]], [h[1]]]; m.sets = [[c[0]], [c[1]]]; m.active = 0; m.hand = m.hands[0];
    var sl = seatCards(i);
    m.cards.forEach(function (card, k) { C.moveTo(card, sl[k], 0.3); });
    return anim.wait(0.5).then(function () { return mateDraw(i); }).then(function () { m.thought = false; refreshSeat(i); });
  }
  // the second hand of a split plays the same way as the first
  function mateTurnStep(i, dealerCards, next) {
    var m = mates[i];
    return (function step() {
      var v = E.handValue(m.hand);
      if (v.total >= 21) { m.status = v.total > 21 ? 'BUST' : ''; refreshSeat(i); return next(); }
      if (!m.thought) { m.thought = true; return think(i).then(step); }
      m.thought = false;
      var move = E.advise({ hands: [{ cards: m.hand }], active: 0, dealer: dealerCards }, { double: m.hand.length === 2, split: false });
      if (move === 'double' && m.style !== 'careful') {
        mateChips(i, m.stakes[1]); m.bet += m.stakes[1]; m.stakes[1] *= 2; m.status = 'DOUBLE';
        return mateDraw(i).then(function () { if (E.handValue(m.hand).total > 21) m.status = 'BUST'; refreshSeat(i); return next(); });
      }
      if (move !== 'hit') { m.status = 'STAND'; refreshSeat(i); return next(); }
      m.status = 'HIT'; refreshSeat(i);
      return mateDraw(i).then(step);
    })();
  }
  function matesSettle(dc) {
    dc = dc || round.dealer;
    var d = E.handValue(dc).total, dBJ = dc.length === 2 && d === 21;
    mates.forEach(function (m, i) {
      if (!m || !m.hand.length) return;
      if (m.hands) return settleSplit(m, i, d, dBJ);
      var v = E.handValue(m.hand).total, bj = m.hand.length === 2 && v === 21, r, amt;
      if (v > 21) { r = 'lose'; amt = -m.bet; }
      else if (bj && !dBJ) { r = 'win'; amt = m.bet * 1.5; }
      else if (dBJ) { r = bj ? 'push' : 'lose'; amt = bj ? 0 : -m.bet; }
      else if (d > 21 || v > d) { r = 'win'; amt = m.bet; }
      else if (v === d) { r = 'push'; amt = 0; }
      else { r = 'lose'; amt = -m.bet; }
      var el = $('seatRes' + i).querySelector('.res');
      el.textContent = r === 'win' ? (bj ? 'BLACKJACK ' : 'WIN ') + '+' + U.money(amt) : r === 'push' ? 'PUSH' : 'LOSE';
      el.className = 'res on done ' + r;
      if (r === 'lose') Ch.sweep('m' + i);
      else if (r === 'win') Ch.pay(E.breakdown(amt, 10), 'm' + i);
    });
  }
  function settleSplit(m, i, d, dBJ) {
    var net = 0, words = m.hands.map(function (h, k) {
      var v = E.handValue(h).total, st = m.stakes[k];
      if (v > 21 || dBJ) { net -= st; return 'LOSE'; }
      if (d > 21 || v > d) { net += st; return 'WIN'; }
      if (v === d) return 'PUSH';
      net -= st; return 'LOSE';
    });
    var el = $('seatRes' + i).querySelector('.res');
    el.textContent = words.join(' · ') + (net ? ' ' + (net > 0 ? '+' : '−') + U.money(Math.abs(net)) : '');
    el.className = 'res on done ' + (net > 0 ? 'win' : net < 0 ? 'lose' : 'push');
    if (net < 0) Ch.sweep('m' + i); else if (net > 0) Ch.pay(E.breakdown(net, 10), 'm' + i);
  }
  function dealerBJ() { return round.dealer.length === 2 && E.handValue(round.dealer).total === 21; }
  function matesCards() { var out = []; mates.forEach(function (m) { if (m) { out = out.concat(m.cards); m.cards = []; } }); return out; }
  function matesBetween() {           // between hands: someone may sit down, someone may leave
    if (!multi) return;
    var gone = false;
    mates.forEach(function (m, i) { if (m && m.idle) { mateClear(i); mates[i] = null; refreshSeat(i); toast(I.t('mKicked', { n: m.nick })); gone = true; } });
    if (gone) { mates.forEach(function (m, i) { if (m) { m.hand = []; m.bet = 0; m.status = ''; m.hands = m.sets = m.stakes = null; m.active = 0; $('seatRes' + i).querySelector('.res').className = 'res'; refreshSeat(i); } }); return; }
    var free = [0, 1].filter(function (i) { return !mates[i]; }), busy = [0, 1].filter(function (i) { return mates[i]; });
    if (free.length && Math.random() < 0.28) seatMate(free[(Math.random() * free.length) | 0]);
    else if (busy.length === 2 && Math.random() < 0.12) leaveMate(busy[(Math.random() * 2) | 0]);
    mates.forEach(function (m, i) { mateClear(i); if (m) { m.hand = []; m.bet = 0; m.status = ''; m.hands = m.sets = m.stakes = null; m.active = 0; $('seatRes' + i).querySelector('.res').className = 'res'; refreshSeat(i); } });
  }


  /* ---------- the online shared table (NcqBoard) ---------- */
  // With a sign-in (release builds) a shared table is a real room on the company game server: you and one other
  // player, or a house player when nobody comes. The server deals and settles; here we turn each new server view
  // into the same card, chip and label animations the local table uses.
  var net = null;
  function cardOf(c) { return c ? { rank: c.r, suit: c.s } : null; }
  var HOLE_STANDIN = { rank: '2', suit: 'S' };      // face-down until the server shows the real card
  function netOppIndex(oppSeat) { return oppSeat < net.you ? 0 : 1; }   // the earlier seat sits on your left
  function joinOnline() {
    clearSeats();
    S.fly(S.POSES.multi, 0.8);
    toastHold(I.t('findPlayer'));
    return BJ.online.find(table.id).then(function (room) {
      net = { room: room, you: room.state.you || room.you, oppSeat: 0, oi: 0, dealt: false, settled: false, chain: Promise.resolve(), conn: null, pending: null };
      net.oppSeat = net.you === 1 ? 2 : 1; net.oi = netOppIndex(net.oppSeat);
      return BJ.online.seats(room.code).catch(function () { return null; });
    }).then(function (info) {
      toastEnd();
      var list = info && (info.seats || info) || [], o = null;
      if (list.forEach) list.forEach(function (x) { if ((x.seat || x.you) === net.oppSeat) o = x; });
      var nick = (o && (o.nickname || o.name)) || BJ.meta.randomMate([st.nick]).nick;
      mates = [null, null];
      mates[net.oi] = { nick: nick, icon: (o && typeof o.avatar === 'number') ? o.avatar : (Math.random() * BJ.meta.iconCount) | 0, bet: 0, hand: [], cards: [], status: '', seq: net.oppSeat };
      mySeq = net.you; refreshSeat(net.oi); refreshOrder();
      net.conn = BJ.online.subscribe(net.room.code, net.room, function (next) { netState(next); });
      netState(net.room, true);
    }).catch(function (e) {
      toastEnd(); net = null;
      if (e && e.message === 'cancelled') return;
      toast(I.t('netFail')); return joinTable();     // can't reach the server: the local table instead
    });
  }
  function netLeave() {
    if (!net) return;
    BJ.online.cancel();
    if (net.conn && net.conn.close) net.conn.close();
    BJ.online.leave(net.room.code);
    net = null;
  }
  // New server views are drawn one after another, never out of order.
  function netState(room, first) {
    if (!net) return;
    if (!first && net.room && room.round === net.room.round && room.version <= net.room.version && room !== net.room) return;
    net.room = room;
    net.chain = net.chain.then(function () { return netDraw(room); }).catch(function (e) { if (window.console) console.warn(e); });
  }
  function netMirror(v) {
    var me = v.seats[net.you - 1];
    round = round || { dealer: [], hands: [], active: 0, phase: 'dealer' };
    round.dealer = v.dealer.map(function (c) { return cardOf(c) || HOLE_STANDIN; });
    round.hands = me.hands.map(function (h) { return { cards: h.cards.map(cardOf), bet: h.bet, doubled: h.doubled, done: h.done, fromSplit: h.split && me.hands.length > 1, splitAces: h.split && h.cards[0].r === 'A', result: null, payout: 0 }; });
    round.active = me.active;
    round.phase = v.phase === 'play' && v.turn === net.you ? 'player' : 'dealer';
    round.noSplit = false;
  }
  function netDraw(room) {
    if (!net || mode !== 'table') return;
    var v = room.state, me = v.seats[net.you - 1], op = v.seats[net.oppSeat - 1], m = mates[net.oi];
    // betting: the other seat's chips go down when they've decided; your bet bar opens until you've sent yours
    if (v.phase === 'bet') {
      if (net.settled) return;
      if (m) {
        if (op.bet && !m.placed) { m.bet = op.bet; m.placed = true; m.status = 'READY'; mateChips(net.oi, op.bet); refreshSeat(net.oi); }
        else if (!op.bet && m.status !== 'BETTHINK') { m.status = 'BETTHINK'; refreshSeat(net.oi); }
      }
      if (!me.bet && phase !== 'bet' && !dealWaiting) setPhase('bet');
      return;
    }
    var jobs = Promise.resolve();
    // the deal: two cards each, seat by seat, then the dealer
    if (!net.dealt) {
      net.dealt = true;
      if (m && !m.placed) { m.bet = op.bet; m.placed = true; mateChips(net.oi, op.bet); }
      if (dealWaiting) { dealWaiting = false; toastEnd(); }
      setPhase('busy');
      st.stats.hands++;
      NcqMetrics.step("007_first_deal"); NcqMetrics.levelStart(handMode());
      round = null; netMirror(v); busted = [false, false];
      if (m) { m.hand = []; m.cards = []; m.status = ''; m.hands = m.sets = m.stakes = null; m.active = 0; }
      var order = net.you < net.oppSeat ? ['me', 'op'] : ['op', 'me'];
      [0, 1].forEach(function (k) {
        order.forEach(function (who) {
          jobs = jobs.then(function () {
            if (who === 'me') return dealTo('player', 0, cardOf(me.hands[0].cards[k]) || cardOf(v.seats[net.you - 1].hands[0].cards[k]), true);
            return m ? mateDrawCard(net.oi, cardOf(op.hands[0].cards[k])) : null;
          });
        });
        jobs = jobs.then(function () { return dealTo('dealer', 0, cardOf(v.dealer[k]) || HOLE_STANDIN, k === 0); });
      });
      net.shown = { me: [2, 0], op: [2, 0], dealer: 2, opSplit: false };
    }
    return jobs.then(function () { return netUpdate(room); });
  }
  // after the deal: new cards, splits and moves for both seats
  function netUpdate(room) {
    var v = room.state, me = v.seats[net.you - 1], op = v.seats[net.oppSeat - 1], m = mates[net.oi], jobs = Promise.resolve();
    netMirror(v);
    // your seat
    if (me.hands.length > 1 && !split) jobs = jobs.then(function () { return splitTable(me.hands[1].bet); });
    me.hands.forEach(function (h, i) {
      var have = view.hands[i] ? view.hands[i].length : 0;
      for (var k = have; k < h.cards.length; k++) (function (card, side) {
        jobs = jobs.then(function () { return dealTo('player', i, card, true, side); });
      })(cardOf(h.cards[k]), h.doubled && k === 2);
      if (h.cards.length && E.handValue(h.cards.map(cardOf)).total > 21 && !busted[i]) jobs = jobs.then(function () {
        busted[i] = true; A.bust(); A.voice('bust'); setResult(i, 'bust', -h.bet); marks.t[i].classList.add('lost'); st.stats.lost++;
        return Promise.all([Ch.sweep('h' + i, 'dealer'), anim.wait(0.6)]);
      });
    });
    // the other seat
    if (m) jobs = jobs.then(function () {
      if (op.hands.length > 1 && !m.sets) {
        var c = m.cards; m.stakes = [op.hands[0].bet, op.hands[1].bet]; mateChips(net.oi, op.hands[1].bet);
        m.hands = [[m.hand[0]], [m.hand[1]]]; m.sets = [[c[0]], [c[1]]]; m.active = 0; m.hand = m.hands[0];
        var sl = seatCards(net.oi); m.cards.forEach(function (card, k) { C.moveTo(card, sl[k], 0.3); });
      }
      var p = Promise.resolve();
      op.hands.forEach(function (h, hi) {
        var have = m.sets ? m.sets[hi].length : m.cards.length;
        for (var k = have; k < h.cards.length; k++) (function (card) {
          p = p.then(function () { if (m.sets) { m.active = hi; m.hand = m.hands[hi]; } return mateDrawCard(net.oi, card); });
        })(cardOf(h.cards[k]));
        if (h.doubled && m.bet < op.hands.reduce(function (a, x) { return a + x.bet; }, 0)) { var add = h.bet / 2; m.bet += add; mateChips(net.oi, add); }
      });
      return p.then(function () {
        var thinking = v.phase === 'play' && v.turn === net.oppSeat;
        var last = op.last && op.last !== 'bet' ? op.last.toUpperCase() : '';
        var bust = op.hands.some(function (h) { return E.handValue(h.cards.map(cardOf)).total > 21; }) && !op.hands.some(function (h) { return E.handValue(h.cards.map(cardOf)).total <= 21; });
        m.status = bust ? 'BUST' : thinking ? 'THINK' : last;
        refreshSeat(net.oi);
      });
    });
    return jobs.then(function () {
      refreshTotals(); refreshBetTags();
      if (v.phase === 'finished') return netSettle(room);
      if (v.phase === 'play' && v.turn === net.you) { if (phase !== 'player') setPhase('player'); else refreshButtons(); }
      else if (phase === 'player') setPhase('busy');
    });
  }
  // the server's result: turn the hole card, the dealer draws, then the usual payout
  function netSettle(room) {
    if (net.settled) return; net.settled = true;
    var v = room.state, me = v.seats[net.you - 1], op = v.seats[net.oppSeat - 1], m = mates[net.oi];
    setPhase('busy');
    var p = Promise.resolve();
    if (view.dealer[1] && v.dealer[1]) p = p.then(function () { C.setFace(view.dealer[1], cardOf(v.dealer[1])); return C.reveal(view.dealer[1]).then(refreshTotals); });
    for (var k = 2; k < v.dealer.length; k++) (function (c) { p = p.then(function () { return dealTo('dealer', 0, c, true); }); })(cardOf(v.dealer[k]));
    return p.then(function () {
      netMirror(v);
      round.hands.forEach(function (h, i) {
        var r = me.hands[i].result; h.result = r; h.done = true;
        h.payout = r === 'blackjack' ? h.bet * 2.5 : r === 'win' ? h.bet * 2 : r === 'push' ? h.bet : 0;
      });
      if (m) {
        var n = v.payouts ? v.payouts[net.oppSeat - 1] : 0, words = op.hands.map(function (h) { return (h.result === 'blackjack' ? 'BLACKJACK' : h.result === 'lose' ? 'LOSE' : (h.result || '').toUpperCase()); });
        var el = $('seatRes' + net.oi).querySelector('.res');
        el.textContent = (op.hands.length > 1 ? words.join(' · ') : words[0] === 'WIN' || words[0] === 'BLACKJACK' ? words[0] : words[0]) + (n > 0 ? ' +' + U.money(n) : '');
        el.className = 'res on done ' + (n > 0 ? 'win' : n < 0 ? 'lose' : 'push');
        if (n < 0) Ch.sweep('m' + net.oi); else if (n > 0) Ch.pay(E.breakdown(n, 10), 'm' + net.oi);
      }
      return settleHand(true);
    });
  }
  // the next hand at the same table; if the other player has gone, find another
  function netNextHand() {
    var old = net.room, m = mates[net.oi];
    net.dealt = false; net.settled = false;
    if (m) { mateClear(net.oi); m.hand = []; m.cards = []; m.bet = 0; m.placed = false; m.status = ''; m.hands = m.sets = m.stakes = null; $('seatRes' + net.oi).querySelector('.res').className = 'res'; refreshSeat(net.oi); }
    return BJ.online.rematch(old).then(function (room) { if (room && room.state) netState(room); else setPhase('bet'); })
      .catch(function () {
        if (m) toast(I.t('left', { n: m.nick }));
        netLeave(); return joinOnline();
      });
  }

  /* ---------- labels pinned to the table ---------- */
  var marks = { tDealer: $('tDealer'), t: [$('tHand0'), $('tHand1')], b: [$('bHand0'), $('bHand1')], r: [$('rHand0'), $('rHand1')] };

  function pin(el, x, y, z) {
    var p = S.project(x, y, z);
    el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-50%)';
  }
  function layoutMarks() {
    pin(marks.tDealer, DEALER.x, 0.3, DEALER.z + C.H / 2 + 0.2);
    var sh = S.shoe;                                                   // on the lower part of the front card, near the mouth
    pin($('shoeTag'), sh.tag.x, sh.tag.y, sh.tag.z);
    layoutSeats();
    for (var i = 0; i < 2; i++) {
      var hc = handCenter(i), px = split ? (i ? SPLIT_PILE_X : -SPLIT_PILE_X) : PILE.x;
      pin(marks.t[i], hc.x, 0.5, hc.z - C.H / 2 - 0.4);
      pin(marks.r[i], hc.x, 0.6, hc.z - C.H / 2 - 4.5);       // verdict sits above the hand, clear of the cards
      pin(marks.b[i], px, 0.3, PILE.z - 5.9);
    }
  }

  function totalText(cards, final) {
    var v = E.handValue(cards);
    if (v.soft && v.total < 21 && !final) return (v.total - 10) + '/' + v.total;
    return '' + v.total;
  }
  function faceUpCards(list) { return list.filter(function (c) { return c.faceUp; }).map(function (c) { return c.card; }); }

  function refreshTotals() {
    var d = faceUpCards(view.dealer), el = marks.tDealer;
    el.className = 'total' + (d.length ? ' on' : '');
    if (d.length) {
      var dv = E.handValue(d), all = d.length === view.dealer.length;
      el.textContent = totalText(d, all);
      if (all && dv.total > 21) { el.className += ' bust'; el.innerHTML = '<small>BUST</small>' + dv.total; }
      else if (all && d.length === 2 && dv.total === 21) el.className += ' bj';
    }
    for (var i = 0; i < 2; i++) {
      var cards = faceUpCards(view.hands[i]), t = marks.t[i], h = round && round.hands[i];
      t.className = 'total' + (cards.length ? ' on' : '');
      if (!cards.length) continue;
      var v = E.handValue(cards), done = h && h.done;
      t.textContent = totalText(cards, done);
      if (v.total > 21) { t.className += ' bust'; t.innerHTML = '<small>BUST</small>' + v.total; }
      else if (h && E.isNatural(h) && cards.length === 2) t.className += ' bj';
      else if (v.total === 21) t.className += ' best';
      if (phase === 'player' && round && round.active === i && split) t.className += ' live';
    }
  }

  function refreshBetTags() {
    for (var i = 0; i < 2; i++) {
      var amt = round ? (round.hands[i] && !busted[i] ? round.hands[i].bet : 0) : (i === 0 ? bet : 0);
      marks.b[i].className = 'bettag' + (amt > 0 ? ' on' : '');
      marks.b[i].textContent = U.money(amt);
    }
  }

  /* ---------- winnings: coins burst off the pile and stream into the balance ---------- */
  function coinBurst(wx, wz, amount, bj, onCoin) {
    var layer = $('fx'), game = $('game').getBoundingClientRect(), bal = document.querySelector('.balance');
    var tr = document.querySelector('.balance .coin').getBoundingClientRect();
    var tx = tr.left + tr.width / 2 - game.left, ty = tr.top + tr.height / 2 - game.top;
    var src = S.project(wx, 0.5, wz), u = game.width / 100;
    // more coins and a wider burst for a bigger win, capped so it stays quick
    var n = Math.round(U.clamp(6 + 3.2 * Math.log(Math.max(1, amount / table.min)) / Math.LN2, 6, 30) * (bj ? 1.35 : 1));
    var spread = (bj ? 26 : 18) + Math.min(10, n * 0.4);
    A.coinBurst();
    var jobs = [];
    for (var i = 0; i < n; i++) (function (i) {
      var el = document.createElement('i'); el.className = 'fxcoin'; el.style.opacity = '0'; layer.appendChild(el);
      var a = U.rand(-Math.PI, 0), d = U.rand(0.35, 1) * spread * u;
      var bx = src.x + Math.cos(a) * d * 1.25, by = src.y + Math.sin(a) * d - U.rand(2, 8) * u;
      var spin = U.rand(-540, 540), cx = (bx + tx) / 2 + U.rand(-14, 14) * u, cy = Math.min(by, ty) - U.rand(4, 18) * u;
      function put(x, y, sc, r) { el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + sc.toFixed(3) + ') rotate(' + r.toFixed(0) + 'deg)'; }
      jobs.push(anim.wait(i * (bj ? 0.016 : 0.02)).then(function () {
        el.style.opacity = '1';
        // 1) 촤라락: pop out of the pile
        return anim.tween(0.2, function (e) { put(U.lerp(src.x, bx, e), U.lerp(src.y, by, e), 0.5 + 0.6 * e, spin * e * 0.3); }, U.outQuart);
      }).then(function () { return anim.wait(0.06 + Math.random() * 0.06); }).then(function () {
        // 2) 슈루룩: whip up into the purse, speeding up
        return anim.tween(0.34, function (e) {
          var x = (1 - e) * (1 - e) * bx + 2 * (1 - e) * e * cx + e * e * tx, y = (1 - e) * (1 - e) * by + 2 * (1 - e) * e * cy + e * e * ty;
          put(x, y, U.lerp(1.1, 0.45, e), spin * (0.3 + e));
        }, U.inCubic);
      }).then(function () {
        layer.removeChild(el);
        A.coinIn(i);
        if (onCoin) onCoin(i, n);
        bal.classList.remove('hit'); void bal.offsetWidth; bal.classList.add('hit');
        if (i % 3 === 0) spark(tx, ty, u);
      }));
    })(i);
    return Promise.all(jobs).then(function () {
      bal.classList.remove('hit', 'wow'); void bal.offsetWidth; bal.classList.add('wow');      // 와!
      for (var k = 0; k < (bj ? 14 : 9); k++) spark(tx, ty, u, true);
      setTimeout(function () { bal.classList.remove('wow'); }, 700);
    });
  }
  function spark(x, y, u, wide) {
    var el = document.createElement('i'); el.className = 'fxspark'; $('fx').appendChild(el);
    var a = U.rand(0, Math.PI * 2), d = U.rand(3, wide ? 13 : 7) * u;
    anim.tween(wide ? 0.45 : 0.3, function (e) {
      el.style.transform = 'translate(' + (x + Math.cos(a) * d * e).toFixed(1) + 'px,' + (y + Math.sin(a) * d * e).toFixed(1) + 'px) scale(' + (1.4 - e).toFixed(2) + ')';
      el.style.opacity = (1 - e).toFixed(2);
    }, U.outCubic).then(function () { el.remove(); });
  }

  /* ---------- telling the player how it went ---------- */
  var VERDICT = { win: 'WIN', lose: 'LOSE', push: 'DRAW', bj: 'BLACKJACK', bust: 'BUST' };

  // Big word over the hand, and what it did to the stake where the chips are.
  function setResult(i, kind, delta) {
    var el = marks.r[i];
    el.className = 'result';
    void el.offsetWidth;                                   // restart the pop animation
    el.className = 'result on ' + kind + (split ? ' two' : '');
    el.innerHTML = '<span></span>'; el.firstChild.textContent = VERDICT[kind];
    var tag = marks.b[i];
    tag.className = 'bettag on ' + (delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'even') + (split ? ' two' : '');
    tag.textContent = delta > 0 ? '+' + U.money(delta) : delta < 0 ? '−' + U.money(-delta) : '±0';
  }
  // The hand that won gets the gold number, the one that lost is dimmed.
  function markTotals() {
    var allLost = true, allWon = true;
    round.hands.forEach(function (h, i) {
      var won = h.result === 'win' || h.result === 'blackjack', lost = h.result === 'lose';
      if (!lost) allLost = false; if (!won) allWon = false;
      if (won) marks.t[i].classList.add('won'); else if (lost) marks.t[i].classList.add('lost');
      marks.t[i].classList.remove('live');
    });
    if (allLost) marks.tDealer.classList.add('won'); else if (allWon) marks.tDealer.classList.add('lost');
  }
  // Net change of the round floats under the balance.
  function floatDelta(net) {
    if (!net) return;
    var el = $('delta');
    el.className = '';
    void el.offsetWidth;
    el.textContent = (net > 0 ? '+' : '−') + U.money(Math.abs(net));
    el.className = 'on ' + (net > 0 ? 'up' : 'down');
  }
  function clearMarks() {
    for (var i = 0; i < 2; i++) { marks.r[i].className = 'result'; marks.t[i].className = 'total'; marks.b[i].className = 'bettag'; }
    marks.tDealer.className = 'total';
  }

  // A band across the middle of the screen: glides in, holds, then drifts up and fades.
  var toastTimer = 0;
  function toast(msg) {
    var el = $('toast'); el.textContent = msg;
    el.className = ''; void el.offsetWidth; el.className = 'in';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.className = 'out'; }, 1300);
  }

  // A toast that stays up while something runs (shuffling the decks), then drifts away when it's done.
  function toastHold(msg) {
    var el = $('toast'); el.textContent = msg; clearTimeout(toastTimer);
    el.className = ''; void el.offsetWidth; el.className = 'in';
  }
  function toastEnd() { var el = $('toast'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.className = 'out'; }, 250); }

  function setMode(m) { mode = m; $('game').className = 'mode-' + m + (st.inTour ? ' intour' : ''); }

  function setPhase(p) {
    phase = p;
    if (p === 'bet' && multi && mode === 'table' && !coachStep) startBetTimer(); else if (p !== 'bet') stopBetTimer();
    if (p === 'bet' && multi && mode === 'table' && !net) matesThinkBets(); else if (p !== 'bet') betThinkId++;
    if (p === 'player' && multi) startActTimer(); else if (p !== 'player') stopActTimer();
    if (p === 'player') coachPlayerTurn();
    $('betBar').className = 'bar' + (p === 'bet' ? ' on' : '');
    $('actBar').className = 'bar' + (p === 'player' || p === 'busy' ? ' on' : '');
    refreshButtons();
  }

  function refreshButtons() {
    var i, row = $('chipRow').children;
    if (phase === 'bet') {
      for (i = 0; i < row.length; i++) {
        var d = +row[i].getAttribute('data-denom');
        row[i].className = 'chipbtn' + ((st.chips < d || bet + d > table.max) ? ' off' : '');
      }
      $('btnDeal').disabled = bet < table.min;
      $('btnClear').disabled = bet === 0;
      $('btnRebet').disabled = bet > 0 || !lastBet.length;
    }
    var o = (phase === 'player' && round) ? E.options(round, st.chips) : { hit: false, stand: false, double: false, split: false };
    var acts = $('actBar').children;
    for (i = 0; i < acts.length; i++) acts[i].disabled = !o[acts[i].getAttribute('data-act')];
  }

  function buildChipRow() {
    var row = $('chipRow'); row.innerHTML = '';
    table.chips.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chipbtn'; b.setAttribute('data-denom', d);
      b.setAttribute('aria-label', I.t('bet') + ' ' + U.money(d));
      b.style.backgroundImage = 'url(' + BJ.art.chipUrl(d) + ')';
      b.addEventListener('click', function () { A.unlock(); addBet(d); });
      row.appendChild(b);
    });
  }

  var HOUSE = { alley: 'Alley', harbor: 'Harbor', garden: 'Garden', grand: 'Grand', royal: 'Royal', sky: 'Sky', monte: 'Monte', macau: 'Macau', vegas: 'Vegas', diamond: 'Diamond', crown: 'Crown' };
  function themeLabels(T) { return { house: HOUSE[T.id], title: I.t('limits'), lines: [I.t('min') + ' ' + U.money(T.min), I.t('max') + ' ' + U.money(T.max)] }; }

  function applyTable() {
    if (st.inTour) {                      // a tournament table: its own limits and lounge, hands left in place of the limits
      table = BJ.tour.table(st.inTour);
      var th = BJ.tour.theme(st.inTour);
      S.setTheme(th, E.TABLES[th], { house: table.house, title: I.t('limits'), lines: [I.t('min') + ' ' + U.money(table.min), I.t('max') + ' ' + U.money(table.max)] });
      $('tblName').textContent = table.name;
      refreshTourHands();
    } else {
      table = E.TABLES[st.table];
      S.setTheme(st.table, table, themeLabels(table));
      $('tblName').textContent = I.t('t_' + table.id);
      $('tblLim').textContent = U.money(table.min) + ' – ' + U.money(table.max);
    }
    buildChipRow();
    lastBet = [];
    refreshButtons();
  }

  function refreshTourHands() {
    if (!st.inTour) return;
    var n = BJ.tour.handsLeft(st.inTour), m = BJ.tour.HANDS;
    $('tblLim').textContent = $('thHands').textContent = I.t('tHands', { n: n, m: m });
    $('thName').textContent = BJ.tour.table(st.inTour).name;
    $('thBar').style.width = (n / m * 100) + '%';
  }

  /* ---------- tournaments ---------- */
  // Sit down at a tournament: your own chips are set aside and the tournament stack is put in front of you.
  function enterTour(key) {
    if (mode !== 'lobby' || !BJ.tour.isKey(key)) return;
    coachPickDone();
    multi = false;
    st.bank = st.chips; st.chips = BJ.tour.chipsOf(key); st.inTour = key; shown = st.chips; $('chips').textContent = U.money(st.chips);
    save();
    enterTable();
  }
  // Back to the lobby from a tournament: the stack goes back to the entry and your own chips return.
  function leaveTour() {
    var key = st.inTour;
    BJ.tour.setChips(key, st.chips);
    st.chips = st.bank; st.bank = null; st.inTour = null; shown = st.chips; $('chips').textContent = U.money(st.chips);
    $('game').classList.remove('intour');
    save();
    return key;
  }
  function tourOver(msg) {
    phase = 'bet';                        // toLobby only leaves from the betting phase
    toast(msg);
    setTimeout(function () { toLobby(); }, 1300);
  }

  /* ---------- level ---------- */
  // mouse/pen drag scrolls lists the way a finger swipe does on a phone (touch already scrolls natively);
  // a drag that moved swallows the click that would follow
  function dragScroll() {
    var box = null, sx = 0, sy = 0, st0 = 0, sl0 = 0, moved = false;
    function scroller(el) {
      for (; el && el !== document.body; el = el.parentElement) {
        var cs = getComputedStyle(el);
        if ((/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) ||
            (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1)) return el;
      }
      return null;
    }
    document.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch' || e.button !== 0 || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      box = scroller(e.target); if (!box) return;
      sx = e.clientX; sy = e.clientY; st0 = box.scrollTop; sl0 = box.scrollLeft; moved = false;
    });
    document.addEventListener('pointermove', function (e) {
      if (!box) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      moved = true; box.scrollTop = st0 - dy; box.scrollLeft = sl0 - dx;
    });
    document.addEventListener('pointerup', function () {
      if (box && moved) { var swallow = function (ev) { ev.stopPropagation(); ev.preventDefault(); }; window.addEventListener('click', swallow, true); setTimeout(function () { window.removeEventListener('click', swallow, true); }, 0); }
      box = null;
    });
  }
  function levelFrac() { var L = E.levelOf(st.xp), a = E.xpFor(L), b = E.xpFor(L + 1); return { L: L, have: st.xp - a, need: b - a }; }
  function refreshLevel() {
    var f = levelFrac();
    $('lvlNum').textContent = f.L;
    $('lvlBar').style.width = (Math.min(1, f.have / f.need) * 100).toFixed(1) + '%';
    if ($('xpTip').classList.contains('on')) $('xpTip').textContent = U.fmt(f.have) + ' / ' + U.fmt(f.need);
  }
  // Settling a hand: the pill lights up sky blue, "EXP +N" shows beside it and the bar fills
  // (to the end first and round again when a level is crossed).
  var xpGlowTimer = 0;
  function showXpGain(n, levelled) {
    var pill = $('lvl'), bar = $('lvlBar'), g = $('xpGain');
    g.textContent = 'EXP +' + U.fmt(n);
    g.classList.remove('on'); void g.offsetWidth; g.classList.add('on');
    pill.classList.add('xp');
    clearTimeout(xpGlowTimer);
    xpGlowTimer = setTimeout(function () { pill.classList.remove('xp'); }, 1500);
    if (levelled) {
      bar.style.width = '100%';
      setTimeout(function () {
        bar.classList.add('snap'); bar.style.width = '0%'; void bar.offsetWidth; bar.classList.remove('snap');
        refreshLevel();
      }, 720);
    } else refreshLevel();
  }
  var tipTimer = 0;
  function toggleXpTip() {
    var tip = $('xpTip'), f = levelFrac();
    tip.textContent = U.fmt(f.have) + ' / ' + U.fmt(f.need);
    tip.classList.toggle('on');
    clearTimeout(tipTimer);
    if (tip.classList.contains('on')) tipTimer = setTimeout(function () { tip.classList.remove('on'); }, 2600);
  }

  // Tables open by level; this keeps st.unlocked in step with the player's level.
  function syncUnlocks() {
    var L = E.levelOf(st.xp), fresh = [];
    E.TABLES.forEach(function (T, i) { var open = L >= T.level; if (open && !st.unlocked[i]) fresh.push(i); st.unlocked[i] = open; });
    return fresh;
  }
  function topOpen() { var t = 0; for (var i = 0; i < E.TABLES.length; i++) if (st.unlocked[i]) t = i; return t; }

  // A finished hand earns XP at this table's rate. Each level reached pays twenty minimum bets of the
  // best open table; a level that opens a new table pays fifty of that table's minimum, enough to sit down there.
  function gainXp(result) {
    var base = E.XP_RESULT[result === 'blackjack' ? 'win' : result] || E.XP_HAND;
    if (st.inTour) BJ.tour.noteHand(result);
    var before = E.levelOf(st.xp), gain = Math.round(base * (st.inTour ? 1 : E.xpMult(st.table)));
    st.xp += gain;
    var after = E.levelOf(st.xp);
    var num = $('lvlNum'); if (after > before) num.textContent = before;   // the number ticks over when the bar wraps
    showXpGain(gain, after > before);
    if (after > before) {
      levelSteps(after);
      BJ.vip.refresh();
      var opened = syncUnlocks(), top = topOpen();
      var reward = E.TABLES[top].min * (opened.length ? 50 : 20 * (after - before));
      if (st.inTour) st.bank += reward; else { addChips(reward); floatDelta(reward); }   // level rewards go to your own chips
      if (opened.length) showUnlock(opened[opened.length - 1], after, reward);
      else { A.fanfare(); toast(I.t('levelUp', { n: after, c: U.money(reward) })); }
      var el = $('lvl'); el.classList.remove('up'); void el.offsetWidth; el.classList.add('up');
      setTimeout(function () { el.classList.remove('up'); }, 900);
      save();
    }
  }

  // A new table opens mid-session: the room dims, a little table in its felt colour is unlocked, and the
  // player can head straight there or keep playing.
  var ufxTarget = -1;
  function showUnlock(i, level, reward) {
    var T = E.TABLES[i], fx = $('unlockFx');
    ufxTarget = i; st.unveil = i; save();
    if (i === 1) NcqMetrics.step("019_level3_unlock");
    $('ufxKicker').textContent = I.t('newTable');
    $('ufxName').textContent = I.t('t_' + T.id);
    $('ufxTable').style.setProperty('--felt', S.THEMES[i].felt);
    $('ufxMeta').innerHTML = I.t('ufxMeta', { n: level, lim: U.money(T.min) + ' – ' + U.money(T.max), x: E.xpMult(i), c: U.money(reward) });
    $('ufxGo').textContent = I.t('ufxGo'); $('ufxStay').textContent = I.t('ufxStay');
    fx.className = 'on'; void fx.offsetWidth; fx.className = 'on show';
    setTimeout(function () { fx.classList.add('open'); A.unlockTable(); }, 650);
  }
  function closeUnlock(go) {
    var fx = $('unlockFx');
    if (!fx.classList.contains('on')) return;
    fx.classList.remove('show');
    setTimeout(function () { fx.className = ''; }, 420);
    A.tick();
    if (go) NcqMetrics.step("unlock_go"); else NcqMetrics.step("unlock_stay");
    if (!go) return;
    var target = topOpen();
    st.lastTable = target; save();
    (function tryGo(n) {                       // wait for the round's chips to settle before walking off
      if (mode === 'table' && phase === 'bet') toLobby(target);
      else if (n < 60) setTimeout(function () { tryGo(n + 1); }, 150);
    })(0);
  }

  function addChips(n) {
    st.chips += n;
    if (!st.inTour && st.chips > st.stats.peak) st.stats.peak = st.chips;
  }

  /* ---------- lobby ---------- */
  function buildLobby() {
    var box = $('lobbyTables'); box.innerHTML = '';
    var LOCK = '<svg viewBox="0 0 40 48"><path class="sh" d="M11 22v-7a9 9 0 0 1 18 0v7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><rect x="6" y="21" width="28" height="22" rx="4" fill="currentColor"/><circle cx="20" cy="31" r="3" fill="#000" opacity=".45"/><rect x="18.6" y="31" width="2.8" height="6" rx="1.2" fill="#000" opacity=".45"/></svg>';
    E.TABLES.forEach(function (T, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tcard' + (i === sel ? ' sel' : '') + (st.unlocked[i] && i !== popPending ? '' : ' locked');
      b.innerHTML = '<span class="felt"><span class="chip"></span><span class="deck"></span></span>' +
        '<span class="info"><span class="tn"></span><span class="tl"></span><span class="row"><span class="xp"></span><span class="ts"></span></span></span>' +
        '<span class="lock">' + LOCK + '<span class="lv"></span><span class="gold"><i></i><em></em></span></span><span class="burst"></span>';
      var felt = b.querySelector('.felt');
      felt.style.backgroundColor = S.THEMES[i].felt;
      b.querySelector('.deck').style.backgroundImage = 'url(' + backThumb(i) + ')';
      b.querySelector('.chip').style.backgroundImage = 'url(' + BJ.art.chipUrl(T.chips[2]) + ')';
      b.querySelector('.tn').textContent = I.t('t_' + T.id);
      b.querySelector('.tl').textContent = U.money(T.min) + ' – ' + U.money(T.max);
      b.querySelector('.xp').textContent = 'EXP ×' + E.xpMult(i);
      b.querySelector('.ts').textContent = I.t('open');
      b.querySelector('.lv').textContent = 'Lv ' + T.level;
      b.querySelector('.gold em').textContent = '+' + U.money(T.min * 50);
      var burst = b.querySelector('.burst');
      for (var k = 0; k < 10; k++) {
        var sp = document.createElement('b'), ang = k / 10 * Math.PI * 2;
        sp.style.setProperty('--dx', (Math.cos(ang) * 60).toFixed(0) + 'px'); sp.style.setProperty('--dy', (Math.sin(ang) * 60).toFixed(0) + 'px');
        burst.appendChild(sp);
      }
      b.addEventListener('click', function () { A.unlock(); if (!dragged) pick(i); });
      box.appendChild(b);
    });
    centreCard(false);
    refreshPlay();
  }
  var backThumbs = {};
  function backThumb(i) {          // a small copy of the lounge's card back for its lobby card
    if (backThumbs[i]) return backThumbs[i];
    var src = BJ.art.cardBack(i), c = document.createElement('canvas'); c.width = 120; c.height = 168;
    c.getContext('2d').drawImage(src, 0, 0, 120, 168);
    return (backThumbs[i] = c.toDataURL('image/jpeg', 0.85));
  }
  function refreshPlay() {
    var T = E.TABLES[sel], b = $('btnPlay');
    var ok = st.unlocked[sel] && sel !== popPending;
    b.textContent = ok ? I.t('single') : I.t('needLvPlay', { n: T.level }); b.disabled = !ok;
    $('btnMulti').disabled = !ok;
  }
  // Looking at another table in the lobby re-dresses the one in front of the camera.
  function pick(i, fromScroll) {
    if (mode !== 'lobby') return;
    i = Math.max(0, Math.min(E.TABLES.length - 1, i));
    if (i === sel) return;
    sel = i;
    S.setTheme(i, E.TABLES[i], themeLabels(E.TABLES[i]));
    var cards = $('lobbyTables').children;
    for (var k = 0; k < cards.length; k++) cards[k].classList.toggle('sel', k === sel);
    if (!fromScroll) centreCard(true);
    refreshPlay();
    A.tick();
  }
  function centreCard(smooth) {
    var box = $('lobbyTables'), cur = box.children[sel];
    if (!cur) return;
    var left = cur.offsetLeft - (box.clientWidth - cur.offsetWidth) / 2;
    if (smooth && box.scrollTo) box.scrollTo({ left: left, behavior: 'smooth' }); else box.scrollLeft = left;
  }
  // The table to show first: the one played last, or else the best one open.
  function defaultPick() {
    if (st.lastTable != null && st.unlocked[st.lastTable]) return st.lastTable;
    return topOpen();
  }
  function lobbyGo() {
    if (mode !== 'lobby') return;
    if (!st.unlocked[sel]) { A.deny(); toast(I.t('needLvPlay', { n: E.TABLES[sel].level })); return; }
    // Not enough chips for this table: offer the ad top-up first, and sit down straight after it
    if (st.chips < E.TABLES[sel].min) { goAfterAd = true; openLobbyRefill(); return; }
    enterTable();
  }

  // Walk up to the table: the camera cranes over, the decks are shuffled into the shoe, then the controls appear.
  function enterTable() {
    if (mode !== 'lobby') return;                       // one walk to the table at a time (a tap can race the first-launch entry)
    if (!st.inTour) { st.table = sel; st.lastTable = sel; }
    applyTable(); save();
    NcqMetrics.step("002_intro_table");
    if (multi) NcqMetrics.step("multi_first_enter"); else if (st.stats.hands) NcqMetrics.step("single_from_lobby");
    setPhase('busy'); setMode('intro'); boost = 1;
    if (!multi) clearSeats();
    S.placeEdges(multi ? 'multi' : 'table');
    S.seatSpots(multi ? SEATS.map(function (sp) { return { x: sp.px, z: sp.pz, yaw: sp.spin }; }) : null);
    S.fly(multi ? S.POSES.multi : S.POSES.table, 1.5).then(function () {
      toastHold(I.t('shuffling', { n: E.RULES.decks }));
      boost = SHUFFLE_SPEED; A.shuffleRate = SHUFFLE_SPEED;
      return BJ.intro.play(E.RULES.decks);
    }).catch(function (err) { if (window.console) console.error(err); S.setShoe(true); })     // never leave the player without a shoe
      .then(function () {
        toastEnd(); boost = 1;
        freshShoe();
        NcqMetrics.step("003_shuffle_done");
        setMode('table');
        NcqMetrics.flow('table', { mode: handMode() });
        if (!multi) { setPhase('bet'); if (st.chips < table.min) openRefill(); coachBegin(); return; }
        if (BJ.online.on()) return joinOnline();
        return joinTable().then(function () { setPhase('bet'); if (st.chips < table.min) openRefill(); coachBegin(); });
      });
  }
  // Arriving from "Go now": the new table's card is still shown locked, slides to the middle, its padlock
  // springs open with a little burst of sparks, and then the camera walks straight in.
  var popPending = -1;
  function popOpen(i) {
    st.unveil = -1; save();
    popPending = i; buildLobby();
    if (i !== sel) pick(i);
    var card = $('lobbyTables').children[i];
    setTimeout(function () {
      if (mode !== 'lobby') return;
      card.classList.add('opening'); A.unlockTable();
      setTimeout(function () {
        popPending = -1; card.classList.remove('locked', 'opening'); refreshPlay();
        setTimeout(coachPickMode, 450);
      }, 1500);
    }, 650);
  }
  function pendingUnveil() { return st.unveil != null && st.unveil >= 0 && st.unlocked[st.unveil]; }
  function toLobby(target) {
    if (mode !== 'table' || phase !== 'bet') return;
    clearBet(); coachPickDone();
    if (coachStep === 3) { coachStep = 0; coachHide(); st.tut = 3; }     // the ? pointer waits for the next table
    netLeave();
    var fromTour = st.inTour ? leaveTour() : null;
    setPhase('busy'); setMode('intro'); boost = 1;
    sel = st.table;
    clearSeats(); S.seatSpots(null); stopBetTimer();
    // The pack comes back out of the shoe and is cut into decks while the camera pulls away.
    Promise.all([S.fly(S.POSES.lobby, 1.4), BJ.intro.unload(E.RULES.decks).catch(function () { BJ.intro.setOut(E.RULES.decks); })])
      .then(function () {
        boost = 1; setMode('lobby');
        NcqMetrics.step("018_first_lobby"); NcqMetrics.flow('lobby', { mode: 'app' });
        if (fromTour) { applyTable(); BJ.tour.refreshButton(); }
        if (target == null && pendingUnveil()) target = topOpen();
        if (target != null) popOpen(target); else buildLobby();
        if (fromTour && target == null) setTimeout(function () { BJ.tour.check(); BJ.tour.reopen(fromTour); }, 250);
        else BJ.tour.check();
      });
  }

  /* ---------- betting ---------- */
  function addBet(d) {
    if (phase !== 'bet') return;
    if (bet + d > table.max) { A.deny(); return toast(I.t('betMax', { n: U.money(table.max) })); }
    if (st.chips < d) { A.deny(); toast(I.t('noChips')); if (st.chips + bet < table.min) openRefill(); return; }
    st.chips -= d; bet += d; betChips.push(d);
    Ch.bet(d, 'h0');
    NcqMetrics.step("005_first_chip");
    refreshBetTags(); refreshButtons();
    coachAfterBet();
  }

  function clearBet() {
    if (phase !== 'bet' || !bet) return;
    st.chips += bet; bet = 0; betChips = [];
    Ch.sweep('h0', 'player');
    refreshBetTags(); refreshButtons();
  }

  function rebet() {
    if (phase !== 'bet' || bet || !lastBet.length) return;
    var want = lastBet.reduce(function (a, b) { return a + b; }, 0), list = lastBet;
    if (want > st.chips) {                                   // cannot cover it: bet what is left, in table steps
      want = Math.floor(st.chips / table.min) * table.min;
      list = E.breakdown(want, 24);
    }
    if (want < table.min) { A.deny(); return toast(I.t('noChips')); }
    list.forEach(function (d, k) {
      st.chips -= d; bet += d; betChips.push(d);
      anim.wait(k * 0.06).then(function () { Ch.bet(d, 'h0'); });
    });
    refreshBetTags(); refreshButtons();
    // Same bet again means "go": deal as soon as the last chip is down.
    setPhase('busy');
    anim.wait(list.length * 0.06 + 0.6).then(function () { phase = 'bet'; deal(); });
  }

  /* ---------- a round ---------- */
  function guard(p) { return p.catch(function (err) { if (window.console) console.error(err); recover(); }); }
  function recover() {      // something threw mid-animation: put the table back in a playable state
    view.dealer.concat(view.hands[0], view.hands[1], matesCards()).forEach(function (c) { c.remove(); });
    view = { dealer: [], hands: [[], []] }; Ch.clearAll();
    if (round) { round.hands.forEach(function (h, i) { if (!busted[i]) st.chips += h.bet; }); } else st.chips += bet;
    endRound();
  }

  // A new player's first three hands are set up to land well: 20, then 12 that hits to 21, then a blackjack. The dealer shows
  // a 6 over a 10 and then draws tens, so it busts every time; only hitting into a bust can lose these.
  function starterHand() {
    if (st.starter >= 3 || BJ.debug.noStarter || st.inTour) return null;
    var suits = ['S', 'H', 'D', 'C'], sx = function () { return suits[(Math.random() * 4) | 0]; };
    st.starter++;
    // take the real cards out of the shoe so the count stays true
    var c = function (r) {
      if (shoe) for (var k = shoe.length - 1; k >= 0; k--) if (shoe[k].rank === r) return shoe.splice(k, 1)[0];
      return { rank: r, suit: sx() };
    };
    // player's two cards, dealer's up and hole card, then what comes off the shoe next
    var plan = [
      { me: ['K', 'Q'],  dlr: ['5', '7'],  next: ['4', 'K', '10', 'J'] },   // 20 vs 12: the dealer draws to 16, then busts
      { me: ['7', '5'],  dlr: ['6', '10'], next: ['9', '10', 'J', 'Q'] },  // 12: hit or double catches a 9 for 21; the dealer's 16 then busts either way
      { me: ['A', 'K'],  dlr: ['9', '7'],  next: ['10', 'J', 'Q', 'K'] }    // blackjack
    ][st.starter - 1];
    return [c(plan.me[0]), c(plan.dlr[0]), c(plan.me[1]), c(plan.dlr[1])].concat(plan.next.map(c));
  }
  var dealWaiting = false;
  function deal() {
    if (phase !== 'bet' || bet < table.min) { if (phase === 'bet') { A.deny(); toast(I.t('betMin', { n: U.money(table.min) })); } return; }
    if (net) {
      if (dealWaiting) return;
      dealWaiting = true; phase = 'busy'; $('betBar').className = 'bar'; refreshButtons(); stopBetTimer();
      coachAfterDeal(); handIdle = autoBet; autoBet = false; lastBet = betChips.slice();
      toastHold(I.t('waitOthers'));
      BJ.online.move(net.room, { type: 'bet', amount: bet }).then(function (room) { netState(room); })
        .catch(function () { dealWaiting = false; toastEnd(); phase = 'bet'; setPhase('bet'); toast(I.t('netRetry')); });
      return;
    }
    // at a shared table the cards wait until every seat has put its chips down
    if (multi && !matesAllPlaced()) {
      if (dealWaiting) return;
      dealWaiting = true; phase = 'busy'; $('betBar').className = 'bar'; refreshButtons();
      toastHold(I.t('waitOthers'));
      return waitMates().then(function () { dealWaiting = false; toastEnd(); phase = 'bet'; deal(); });
    }
    setPhase('busy');
    coachAfterDeal();
    handIdle = multi && autoBet; autoBet = false;
    lastBet = betChips.slice();
    if (!shoe) shoe = E.newShoe();
    shoeAtDeal = shoe.length; dealtFromShoe = 0;
    if (!shoe) shoe = E.newShoe();
    var welcome = !BJ.debug.rig && starterHand();
    round = E.deal(bet, Math.random, BJ.debug.rig || welcome, shoe); BJ.debug.rig = null;
    if (welcome) round.noSplit = true;            // the welcome 20 is a pair of tens: keep it a plain stand
    busted = [false, false];
    st.stats.hands++;
    if (st.inTour) { BJ.tour.useHand(st.inTour); refreshTourHands(); }
    NcqMetrics.step("007_first_deal");
    NcqMetrics.levelStart(handMode());
    var h = round.hands[0], gap = 0.38, jobs = [];
    jobs.push(dealTo('player', 0, h.cards[0], true));
    jobs.push(anim.wait(gap).then(function () { return dealTo('dealer', 0, round.dealer[0], true); }));
    jobs.push(anim.wait(gap * 2).then(function () { return dealTo('player', 0, h.cards[1], true); }));
    jobs.push(anim.wait(gap * 3).then(function () { return dealTo('dealer', 0, round.dealer[1], false); }));
    if (multi) matesBet();
    guard(Promise.all(jobs).then(function () {
      if (multi) return matesDeal();
    }).then(function () {
      if (E.cardValue(round.dealer[0]) >= 10) return C.peek(view.dealer[1]);
    }).then(function () {
      if (multi && !dealerBJ()) { var me = myPos(); return matesTurns(function (k) { return k < me; }, round.dealer.slice(0, 1)); }   // the seats ahead of you go first
    }).then(function () {
      if (round.phase === 'dealer') return finish();
      setPhase('player'); refreshTotals();
    }));
  }

  function throwStake(amount, pile) {
    E.breakdown(amount, 12).forEach(function (d, k) { anim.wait(k * 0.05).then(function () { Ch.bet(d, pile); }); });
  }

  function act(kind, byClock) {
    if (phase !== 'player' || !round) return;
    if (!byClock) handIdle = false;
    coachAfterAct();
    var o = E.options(round, st.chips);
    if (!o[kind]) return;
    NcqMetrics.step("009_first_action");
    if (kind === 'double') NcqMetrics.step("first_double"); else if (kind === 'split') NcqMetrics.step("first_split");
    if (net) {
      setPhase('busy');
      var hh = round.hands[round.active];
      if (kind === 'double') { st.chips -= hh.bet; throwStake(hh.bet, 'h' + round.active); }
      else if (kind === 'split') st.chips -= hh.bet;
      BJ.online.move(net.room, { type: kind }).then(function (room) { netState(room); })
        .catch(function () { if (kind === 'double' || kind === 'split') st.chips += hh.bet; toast(I.t('netRetry')); setPhase('player'); });
      return;
    }
    setPhase('busy');
    var i = round.active, h = round.hands[i], ev, pre = Promise.resolve();
    if (kind === 'hit') ev = E.hit(round);
    else if (kind === 'stand') ev = E.stand(round);
    else if (kind === 'double') { st.chips -= h.bet; throwStake(h.bet, 'h' + i); ev = E.double(round); }
    else { st.chips -= h.bet; pre = splitTable(h.bet); ev = E.split(round); }
    refreshBetTags();
    guard(pre.then(function () { return play(ev); }).then(function () {
      if (round.phase === 'dealer') return finish();
      setPhase('player'); refreshTotals();
    }));
  }

  // Pull the pair apart and put a second stake down.
  function splitTable(stake) {
    var a = view.hands[0][0], b = view.hands[0][1];
    view.hands = [[a], [b]];
    split = true;
    Ch.setPile('h0', -SPLIT_PILE_X, PILE.z); Ch.setPile('h1', SPLIT_PILE_X, PILE.z);
    Ch.shift('h0', -SPLIT_PILE_X);
    throwStake(stake, 'h1');
    refreshTotals();
    return Promise.all([C.moveTo(a, slots('player', 0)[0], 0.28), C.moveTo(b, slots('player', 1)[0], 0.28)]);
  }

  // Animate what the engine said happened, in order.
  function play(events) {
    var p = Promise.resolve();
    events.forEach(function (e) {
      p = p.then(function () {
        if (e.t === 'card') return e.to === 'dealer' ? dealTo('dealer', 0, e.card, true) : dealTo('player', e.hand, e.card, true, e.sideways);
        if (e.t === 'bust') {
          busted[e.hand] = true;
          A.bust(); A.voice('bust'); setResult(e.hand, 'bust', -round.hands[e.hand].bet);
          marks.t[e.hand].classList.add('lost');
          st.stats.lost++;
          return Promise.all([Ch.sweep('h' + e.hand, 'dealer'), anim.wait(0.6)]);
        }
        if (e.t === 'turn') { refreshTotals(); return; }
        if (e.t === 'reveal') return C.reveal(view.dealer[1]).then(refreshTotals).then(function () { return anim.wait(0.22); });
      });
    });
    return p;
  }

  // Which chips the dealer pays with: the table's own denominations, never one fat chip.
  function payChips(amount) {
    var out = [], left = amount, D = E.DENOMS, top = table.chips[table.chips.length - 1];
    for (var i = D.length - 1; i >= 0 && left > 0; i--) {
      if (D[i] > top) continue;
      while (left >= D[i] && out.length < 18) { out.push(D[i]); left -= D[i]; }
    }
    // A small win still deserves a few chips: break the largest one down once.
    if (out.length && out.length < 4) {
      var k = D.indexOf(out[0]);
      if (k > 0 && out[0] / D[k - 1] <= 5) { var big = out.shift(); for (var n = 0; n < big / D[k - 1]; n++) out.unshift(D[k - 1]); }
    }
    return out.length ? out : E.breakdown(amount, 18);
  }

  function finish() {
    setPhase('busy');
    refreshTotals();
    // at a shared table everyone else's decisions land together once you're done, then the dealer plays
    var others = multi && !dealerBJ() ? matesTurns(function () { return true; }, round.dealer.slice(0, 1)) : Promise.resolve();   // whoever hasn't played yet, in order
    return others.then(function () { return play(E.dealerPlay(round)); }).then(function () { return settleHand(false); });
  }
  function settleHand(fromServer) {
    return Promise.resolve().then(function () {
      refreshTotals();
      if (!fromServer) { E.settle(round); if (multi) matesSettle(); }
      var jobs = [], best = 'lose', net = 0, staked = 0;
      round.hands.forEach(function (h, i) {
        var pile = 'h' + i;
        net += h.payout - h.bet; staked += h.bet;
        if (h.result === 'lose') {
          if (!busted[i]) { st.stats.lost++; setResult(i, 'lose', -h.bet); jobs.push(Ch.sweep(pile, 'dealer')); }
        } else if (h.result === 'push') {
          st.stats.pushed++; if (best === 'lose') best = 'push';
          setResult(i, 'push', 0);
          jobs.push(anim.wait(0.7).then(function () { addChips(h.payout); return Ch.sweep(pile, 'player'); }));
        } else {
          var bj = h.result === 'blackjack';
          st.stats.won++; if (bj) st.stats.bjs++;
          best = bj ? 'blackjack' : (best === 'blackjack' ? best : 'win');
          setResult(i, bj ? 'bj' : 'win', h.payout - h.bet);
          jobs.push(Ch.pay(payChips(h.payout - h.bet), pile).then(function () {
            // each coin that lands adds its share, so the balance runs up 쫘라락 with the stream
            var p = Ch.pile(pile), paid = 0;
            var burst = coinBurst(p.x, p.z, h.payout - h.bet, bj, function (k, n) {
              var to = k === n - 1 ? h.payout : Math.round(h.payout * (k + 1) / n);
              addChips(to - paid); paid = to;
            }).then(function () { if (paid < h.payout) { addChips(h.payout - paid); paid = h.payout; } });
            return Promise.all([Ch.sweep(pile, 'player'), burst]);
          }));
        }
      });
      markTotals();
      floatDelta(net);
      NcqMetrics.levelEnd(handMode(), best === 'push' ? undefined : best !== 'lose', { score: net });
      handCountSteps(st.stats.hands); handResultSteps(best, net); dayHandSteps();
      if (busted[0] || busted[1]) NcqMetrics.step("first_bust");
      if (best === 'win' || best === 'blackjack') { st.stats.streak = (st.stats.streak || 0) + 1; st.stats.bestStreak = Math.max(st.stats.bestStreak || 0, st.stats.streak); }
      else if (best === 'lose') st.stats.streak = 0;
      anim.wait(1.6).then(function () { gainXp(best); });
      // A big win is a blackjack, or winning at least ten table minimums in one round.
      var big = best === 'blackjack' || net >= table.min * 10;
      if (best === 'blackjack') { A.jingle('big'); A.voice('blackjack'); }
      else if (best === 'win') { A.jingle(big ? 'big' : 'win'); A.voice('win'); }
      else if (best === 'push') { A.push(); A.voice('draw'); }
      else { A.jingle('lose'); if (!busted[0] || (round.hands[1] && !busted[1])) A.voice('lose'); }   // a bust already said its piece
      // The verdict stays up long enough to read even when the chips are gone in a blink.
      return Promise.all([Promise.all(jobs), anim.wait(1.35)]);
    }).then(function () { return anim.wait(0.55); })
      .then(function () {
        clearMarks();
        var all = view.dealer.concat(view.hands[0], view.hands[1], matesCards());
        view = { dealer: [], hands: [[], []] };
        return C.collect(all);
      }).then(endRound);
  }

  function endRound() {
    round = null; bet = 0; betChips = []; split = false; busted = [false, false];
    Ch.setPile('h0', PILE.x, PILE.z); Ch.setPile('h1', SPLIT_PILE_X, PILE.z);
    clearMarks(); refreshBetTags();
    if (!net) matesBetween();
    save();
    BJ.meta.check();
    var adNow = BJ.meta.handDone();
    coachAfterHand();
    // Cut card reached: the discards and what is left go back on the felt and the whole shoe is reshuffled.
    if (st.inTour && st.chips < table.min) { NcqMetrics.step("tour_bust"); return tourOver(I.t('tBust')); }
    if (st.inTour && !BJ.tour.handsLeft(st.inTour)) NcqMetrics.step("tour_day_done");
    if (st.inTour && !BJ.tour.handsLeft(st.inTour)) return tourOver(I.t('tTodayDone', { n: BJ.tour.HANDS }));
    if (shoe && shoe.length < CUT) return reshuffle();
    if (multi && st.chips < table.min) return brokeToLobby();
    if (multi && handIdle) { handIdle = false; return idleToLobby(); }
    if (net) return netNextHand();
    if (adNow && multi && mates.some(Boolean)) return sitOutHand();
    setPhase('bet');
    if (st.chips < table.min) openRefill();
  }
  function idleToLobby() {
    NcqMetrics.step("multi_idle_kick");
    phase = 'bet';
    toast(I.t('idleKick'));
    setTimeout(function () { toLobby(); }, 1200);
  }
  function brokeToLobby() {
    NcqMetrics.step("multi_broke");
    phase = 'bet';                     // toLobby only leaves from the betting phase
    toast(I.t('brokeLeave'));
    setTimeout(function () { toLobby(); }, 900);
    var wait = setInterval(function () { if (mode === 'lobby') { clearInterval(wait); setTimeout(openLobbyRefill, 500); } }, 200);
  }
  // The lobby top-up pays the most a player can bet at the best table they've opened.
  var refillMode = 'table', goAfterAd = false;
  function lobbyRefillAmount() { return E.TABLES[topOpen()].max; }
  function openLobbyRefill() {
    NcqMetrics.step("lobby_refill_offer"); NcqMetrics.flow('refill', { mode: 'lobby' });
    refillMode = 'lobby';
    $('refillBody').textContent = I.t('outLobby');
    $('btnAd').textContent = I.t('watchAd', { n: U.money(lobbyRefillAmount()) });
    $('btnDown').hidden = false; $('btnDown').textContent = I.t('later');
    $('btnDown').onclick = function () { close('sheetRefill'); goAfterAd = false; };
    open('sheetRefill');
  }
  // While you watch an ad at a shared table the others play a hand without you; your seat says so,
  // and you're dealt back in from the next hand.
  function sitOutHand(label) {
    setPhase('busy');
    var tag = $('sitOut');
    if (!tag) { tag = document.createElement('div'); tag.id = 'sitOut'; tag.className = 'seat sitout'; $('marks').appendChild(tag); }
    tag.textContent = label || I.t('watchingAd'); tag.classList.remove('off'); pin(tag, PILE.x, 0.5, PILE.z - 2);
    matesThinkBets();
    return waitMates().then(function () { mates.forEach(function (m, i) { if (m) { m.status = ''; m.placed = false; m.thought = false; refreshSeat(i); } }); return anim.wait(0.6); }).then(watchHand)
.then(function waitAd() {
        if (!$('interAd').hidden) return anim.wait(0.5).then(waitAd);
      }).then(function () {
        tag.classList.add('off');
        toast(I.t('backIn'));
        setPhase('bet');
        if (st.chips < table.min) openRefill();
      });
  }
  function reshuffle() {
    if (mode !== 'table') return;
    clearBet();
    setPhase('busy');
    toastHold(I.t('shuffling', { n: E.RULES.decks }));
    BJ.intro.setOut(E.RULES.decks);
    boost = SHUFFLE_SPEED; A.shuffleRate = SHUFFLE_SPEED;
    return BJ.intro.play(E.RULES.decks).catch(function () { S.setShoe(true); }).then(function () {
      boost = 1; freshShoe(); toastEnd();
      setPhase('bet');
      if (st.chips < table.min) openRefill();
    });
  }
  // How-to pages
  var helpAt = 0;
  function openHelp(i) {
    NcqMetrics.step("help_open");
    var pages = I.help(); helpAt = Math.max(0, Math.min(pages.length - 1, i));
    var pg = pages[helpAt];
    $('helpImg').src = 'img/help/' + pg[0] + '.jpg'; $('helpImg').alt = pg[1];
    $('helpTitle').textContent = (helpAt + 1) + '. ' + pg[1];
    $('helpText').textContent = pg[2];
    var dots = $('helpDots'); dots.innerHTML = '';
    pages.forEach(function (_, k) { var d = document.createElement('i'); if (k === helpAt) d.className = 'on'; dots.appendChild(d); });
    $('helpPrev').disabled = helpAt === 0;
    $('helpNext').textContent = helpAt === pages.length - 1 ? '✓' : '›';
    open('sheetHelp');
  }
  function freshShoe() { shoe = E.newShoe(); shoeAtDeal = shoe.length; dealtFromShoe = 0; S.setShoeCount(shoe.length); refreshShoeTag(); }

  /* ---------- sheets ---------- */
  function open(id) { $(id).classList.add('open'); }
  function close(id) { $(id).classList.remove('open'); }

  // Step down to a cheaper table without leaving the felt.
  function sit(i) {
    clearBet();
    st.table = i; sel = i; applyTable(); save();
    A.tick();
    if (st.chips < table.min) openRefill();
  }

  function openRefill() {
    if (st.inTour) return;
    NcqMetrics.step("refill_offer"); NcqMetrics.flow('refill', { mode: handMode() });            // a tournament has no top-ups: running out ends it
    $('refillBody').textContent = I.t('outBody', { n: U.money(table.min) });
    $('btnAd').textContent = I.t('watchAd', { n: U.money(E.refillAmount(table)) });
    var lower = -1;
    for (var i = st.table - 1; i >= 0; i--) if (st.chips >= E.TABLES[i].min) { lower = i; break; }
    var down = $('btnDown');
    down.hidden = lower < 0;
    if (lower >= 0) { down.textContent = I.t('moveDown', { t: I.t('t_' + E.TABLES[lower].id) }); down.onclick = function () { close('sheetRefill'); sit(lower); }; }
    open('sheetRefill');
  }
  function watchAd() {
    close('sheetRefill');
    var box = $('adMock'), n = 3; box.hidden = false; $('adCount').textContent = n;
    var timer = setInterval(function () {
      n--; $('adCount').textContent = n;
      if (n > 0) return;
      clearInterval(timer); box.hidden = true;
      var amount = E.refillAmount(table);
      st.stats.ads++; setPhase('busy');
      NcqMetrics.step("refill_ad_done");
      Ch.pay(E.breakdown(amount, 18), 'h0').then(function () { addChips(amount); floatDelta(amount); return Ch.sweep('h0', 'player'); }).then(function () { save(); setPhase('bet'); });
    }, 1000);
  }

  function openSettings() {
    NcqMetrics.step("settings_open"); NcqMetrics.flow('settings', { mode: 'app' });
    $('btnSound').textContent = I.t(st.sound ? 'on' : 'off');
    $('btnLang').textContent = I.lang === 'ko' ? '한국어' : 'English';
    var s = st.stats, rows = [['level', E.levelOf(st.xp) + ' (' + U.money(st.xp) + ' XP)'], ['hands', s.hands], ['won', s.won], ['lost', s.lost], ['pushed', s.pushed], ['bjs', s.bjs], ['ads', s.ads], ['peak', U.money(s.peak)]];
    var dl = $('statList'); dl.innerHTML = '';
    rows.forEach(function (r) {
      var d = document.createElement('div'); d.innerHTML = '<dt></dt><dd></dd>';
      d.firstChild.textContent = I.t(r[0]); d.lastChild.textContent = r[1]; dl.appendChild(d);
    });
    askReset(false);
    $('btnShuffle').disabled = !(mode === 'table' && phase === 'bet');
    $('btnLobby').disabled = mode !== 'table';
    $('menuTitle').textContent = I.t(mode === 'lobby' ? 'settings' : 'menu');
    open('sheetSettings');
  }
  function askReset(on) {
    $('btnReset').hidden = on; $('btnResetYes').hidden = !on; $('btnResetNo').hidden = !on;
    $('resetAsk').textContent = I.t(on ? 'resetAsk' : 'reset');
  }
  function setLang(l) {
    I.lang = l; st.lang = l; I.apply();
    $('tblName').textContent = st.inTour ? BJ.tour.table(st.inTour).name : I.t('t_' + table.id);
    refreshTourHands(); BJ.tour.refreshButton();
    Array.prototype.forEach.call(document.querySelectorAll('[data-cheat=chips]'), function (b) { b.textContent = I.t('cheatChips', { n: U.money(+b.getAttribute('data-n')) }); });
    if (mode === 'lobby') buildLobby();
    save();
  }

  /* ---------- lobby swiping ---------- */
  // Drag the table cards (mouse or finger) or swipe anywhere over the table to step through lounges.
  var dragged = false;
  function wireSwipe() {
    var box = $('lobbyTables'), scrollTimer = 0;
    // the card nearest the middle after a scroll becomes the selection
    box.addEventListener('scroll', function () {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        var mid = box.scrollLeft + box.clientWidth / 2, best = sel, bd = 1e9;
        for (var k = 0; k < box.children.length; k++) {
          var c = box.children[k], d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
          if (d < bd) { bd = d; best = k; }
        }
        if (best !== sel) pick(best, true);
      }, 110);
    });
    // mouse drag on the cards (touch already scrolls natively)
    var down = null;
    box.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; down = { x: e.clientX, left: box.scrollLeft }; dragged = false; });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - down.x;
      if (Math.abs(dx) > 6) { dragged = true; box.style.scrollSnapType = 'none'; }
      box.scrollLeft = down.left - dx;
    });
    window.addEventListener('pointerup', function () {
      if (!down) return; down = null; box.style.scrollSnapType = '';
      setTimeout(function () { dragged = false; }, 0);
    });
    // a horizontal swipe over the table itself
    var lobby = $('lobby'), start = null;
    lobby.addEventListener('pointerdown', function (e) { if (e.target.closest('.tcar, button')) return; start = { x: e.clientX, y: e.clientY }; });
    lobby.addEventListener('pointerup', function (e) {
      if (!start) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y; start = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) { A.unlock(); pick(sel + (dx < 0 ? 1 : -1)); }
    });
  }

  /* ---------- wiring ---------- */
  function wire() {
    $('btnPlay').addEventListener('click', function () { A.unlock(); coachPickDone(); multi = false; lobbyGo(); });
    $('btnMulti').addEventListener('click', function () { A.unlock(); coachPickDone(); multi = true; lobbyGo(); });
    $('btnDeal').addEventListener('click', function () { A.unlock(); deal(); });
    $('btnClear').addEventListener('click', function () { A.unlock(); clearBet(); });
    $('btnRebet').addEventListener('click', function () { A.unlock(); rebet(); });
    Array.prototype.forEach.call($('actBar').children, function (b) {
      b.addEventListener('click', function () { A.unlock(); A.tick(); act(b.getAttribute('data-act')); });
    });
    $('btnHelp').addEventListener('click', function () { A.unlock(); openHelp(0); });
    $('helpPrev').addEventListener('click', function () { openHelp(helpAt - 1); });
    $('helpNext').addEventListener('click', function () { if (helpAt >= I.help().length - 1) close('sheetHelp'); else openHelp(helpAt + 1); });
    $('btnGear').addEventListener('click', function () { A.unlock(); if (mode !== 'intro') openSettings(); });
    $('btnLobby').addEventListener('click', function () {
      if (phase !== 'bet') { NcqMetrics.step("leave_blocked"); return toast(I.t('leaveAfter')); }     // mid-hand: the menu stays open, it just says to wait
      NcqMetrics.step("leave_table");
      close('sheetSettings');
      toLobby();
    });
    $('lvl').addEventListener('click', function (e) { e.stopPropagation(); A.unlock(); A.tick(); toggleXpTip(); });
    Array.prototype.forEach.call(document.querySelectorAll('#coach .blk'), function (b) { b.addEventListener('click', function () { if ($('coach').classList.contains('tapclose')) coachEnd(); }); });
    $('btnHelp').addEventListener('click', coachEnd);
    window.addEventListener('resize', function () { setTimeout(coachRelayout, 60); });
    $('ufxGo').addEventListener('click', function () { A.unlock(); closeUnlock(true); });
    $('ufxStay').addEventListener('click', function () { A.unlock(); closeUnlock(false); });
    $('btnShuffle').addEventListener('click', function () { close('sheetSettings'); reshuffle(); });
    // NCQ_TEST_CHEAT: 테스트용 칩 추가·레벨업
    // Shown while developing (no build flags yet) and in builds made with the test cheat turned on.
    if (window.NCQ_TEST_CHEAT || !window.NCQ) {
      $('cheatBox').hidden = false;
      Array.prototype.forEach.call(document.querySelectorAll('[data-cheat]'), function (b) {
        if (b.getAttribute('data-cheat') === 'chips') b.textContent = I.t('cheatChips', { n: U.money(+b.getAttribute('data-n')) });
        b.addEventListener('click', function () {
          A.unlock(); A.tick();
          if (b.getAttribute('data-cheat') === 'chips') {
            var n = +b.getAttribute('data-n');
            if (st.inTour) st.bank += n; else { addChips(n); floatDelta(n); }    // at a tournament table it goes to your own chips
            toast(I.t('gotChips', { n: U.money(n) }));
            if (mode === 'lobby') buildLobby();
          } else {
            close('sheetSettings');
            st.xp = Math.max(st.xp, E.xpFor(E.levelOf(st.xp) + 1) - 1);   // one step short, then a hand's worth of XP crosses it
            gainXp('push');
            if (mode === 'lobby') buildLobby();
          }
          save(); refreshButtons();
        });
      });
    }
    $('btnAd').addEventListener('click', function () {
      A.unlock();
      if (refillMode !== 'lobby') return watchAd();
      close('sheetRefill'); refillMode = 'table';
      BJ.meta.rewarded(function () { NcqMetrics.step("lobby_refill_done"); var n = lobbyRefillAmount(); addChips(n); floatDelta(n); A.coinBurst && A.coinBurst(); toast(I.t('gotChips', { n: U.money(n) })); save(); buildLobby(); if (goAfterAd) { goAfterAd = false; setTimeout(lobbyGo, 700); } });
    });
    $('btnSound').addEventListener('click', function () { NcqMetrics.step("sound_toggle"); st.sound = !st.sound; A.on = st.sound; save(); openSettings(); A.tick(); });
    $('btnLang').addEventListener('click', function () { NcqMetrics.step("lang_change"); setLang(I.lang === 'ko' ? 'en' : 'ko'); openSettings(); });
    $('btnReset').addEventListener('click', function () { askReset(true); });
    $('btnResetNo').addEventListener('click', function () { askReset(false); });
    $('btnResetYes').addEventListener('click', function () {
      // Start over from scratch: a fresh save (language and sound kept), then the game reloads and, like a
      // first launch, walks straight into the first table with the shuffle and the first-time pointers.
      var lang = st.lang, sound = st.sound;
      window.NcqSave.reset();
      window.NcqSave.update(function (s) { s.lang = lang; s.sound = sound; s.migrated = true; });
      close('sheetSettings');
      try { localStorage.removeItem('bj-noauto'); } catch (e) {}
      $('loading').className = '';
      setTimeout(function () { location.reload(); }, 150);
    });
    // popups: the text close button moves from the top-right to a footer centred at the bottom;
    // everything between the header and that footer scrolls (by swipe, no scrollbar)
    Array.prototype.forEach.call(document.querySelectorAll('.panel > .phead > .btn[data-close]'), function (b) {
      var panel = b.closest('.panel'), head = b.parentNode, body = document.createElement('div'), foot = document.createElement('div');
      body.className = 'pscroll'; foot.className = 'pfoot';
      while (head.nextSibling) body.appendChild(head.nextSibling);
      b.classList.remove('small', 'ghost'); b.classList.add('pclose');
      foot.appendChild(b); panel.appendChild(body); panel.appendChild(foot); panel.classList.add('hasfoot');
    });
    // the round ✕ on the centred popups becomes the same text close button at the bottom
    Array.prototype.forEach.call(document.querySelectorAll('.tpanel > .tclose, .tpanel .tihead > .tclose'), function (x) {
      var panel = x.closest('.tpanel'), foot = document.createElement('div'), b = document.createElement('button');
      b.type = 'button'; b.className = 'btn pclose'; b.setAttribute('data-close', ''); b.setAttribute('data-i18n', 'close'); b.textContent = I.t('close');
      x.remove(); foot.className = 'pfoot'; foot.appendChild(b);
      if (getComputedStyle(panel).overflowY === 'auto') {          // the panel scrolled as a whole: keep the footer outside the scroll
        var body = document.createElement('div'); body.className = 'pscroll';
        while (panel.firstChild) body.appendChild(panel.firstChild);
        panel.appendChild(body); panel.classList.add('hasfoot');
      }
      panel.appendChild(foot);
    });
    dragScroll();
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', function () { b.closest('.sheet').classList.remove('open'); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.sheet'), function (s) {
      s.addEventListener('click', function (e) { if (e.target === s && s.id !== 'sheetRefill') s.classList.remove('open'); });
    });
    window.addEventListener('resize', fit);
    document.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var k = e.key.toLowerCase();
      if (mode === 'lobby') { if (k === 'enter' || k === ' ') { A.unlock(); lobbyGo(); } }
      else if (phase === 'bet') { if (k === 'enter' || k === ' ') { A.unlock(); if (!bet && lastBet.length) rebet(); else deal(); } if (k >= '1' && k <= '3' && table.chips[+k - 1]) { A.unlock(); addBet(table.chips[+k - 1]); } }
      else if (phase === 'player') { var m = { h: 'hit', s: 'stand', d: 'double', p: 'split' }[k]; if (m) { A.unlock(); act(m); } }
    });
  }

  function fit() {
    var g = $('game');
    document.documentElement.style.setProperty('--u', (g.clientWidth / 100) + 'px');
    S.resize();
  }

  var last = 0, wall = 0;
  function frame(t) {
    var dt = Math.min(0.034, (t - last) / 1000 || 0.016), left = dt * anim.speed * boost; last = t; wall += dt;
    BJ.debug.clock += left;
    while (left > 1e-6) {                       // fixed-size steps keep the chips stable at any speed
      var stepDt = Math.min(0.034, left);
      anim.update(stepDt); Ch.update(stepDt);
      left -= stepDt;
    }
    if (mode === 'lobby') S.drift(wall); else S.driftStop();
    layoutMarks();
    if (shown !== st.chips) {
      var diff = st.chips - shown;
      shown = Math.abs(diff) < 1 ? st.chips : shown + diff * Math.min(1, dt * 14);
      $('chips').textContent = U.money(shown);
    }
    // a popup covers the table: the 3D scene behind it only needs a slow refresh (saves battery and heat)
    var covered = sheetOpen();
    if (!BJ.debug.noRender && (!covered || (frameN++ % 3) === 0)) S.render();
    tuneQuality(dt);
    requestAnimationFrame(frame);
  }

  var frameN = 0, sheetCache = null;
  function sheetOpen() {
    if (!sheetCache) sheetCache = document.getElementsByClassName('sheet');   // live list, no per-frame query
    for (var i = 0; i < sheetCache.length; i++) if (sheetCache[i].classList.contains('open')) return true;
    return false;
  }
  // Slow phone: trade sharpness for frame rate. Checked twice, early on.
  var qFrames = 0, qTime = 0, qStep = 0;
  function tuneQuality(dt) {
    if (qStep > 1 || BJ.debug.fixedQuality || sheetOpen()) return;   // judge speed only while the table is in view
    qFrames++; qTime += dt;
    if (qFrames < 80) return;
    var avg = qTime / qFrames; qFrames = 0; qTime = 0;
    if (avg > 0.024) { qStep++; S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qStep === 1 ? 1.5 : 1)); S.resize(); }
    else qStep = 2;
  }

  // Test and demo hooks.
  BJ.debug = {
    stackPairs: function () { if (!shoe) shoe = E.newShoe(); ['8', '8', '8', '8', '3', '2', 'K', 'Q', '9', '7'].reverse().forEach(function (r) { shoe.unshift({ rank: r, suit: 'H' }); }); BJ.debug.forceSplit = true; },
    idleMate: function () { var m = mates.filter(Boolean)[0]; if (m) m.idle = true; },
    fillSeats: function () { for (var i = 0; i < 2; i++) { if (!mates[i]) seatMate(i, true); mates[i].bet = table.min * 5; mateChips(i, mates[i].bet); mateDraw(i); mateDraw(i); } },
    seatGeo: function (px, pz, spin) { SEATS.forEach(function (sp, i) { var side = i ? 1 : -1, gap = PILE.z - HAND.z; sp.px = px * side; sp.pz = pz; sp.spin = sp.yaw = spin * side; sp.x = sp.px - Math.sin(sp.spin) * gap; sp.z = sp.pz - Math.cos(sp.spin) * gap; Ch.setPile('m' + i, sp.px, sp.pz, 3.2); }); S.seatSpots(SEATS.map(function (sp) { return { x: sp.px, z: sp.pz, yaw: sp.spin }; })); layoutSeats(); },
    useHands: function (n) { for (var i = 0; i < n; i++) BJ.tour.useHand(st.inTour); refreshTourHands(); },
    tourDays: function (d) { BJ.tour.debugShift(d); if (mode === 'lobby') BJ.tour.check(); },
    gain: function (xp, r) { st.xp = xp; gainXp(r || 'win'); },
    rig: null,
    noStarter: false,
    state: function () { return { mode: mode, phase: phase, chips: st.chips, bet: bet, table: st.table, split: split, round: round && { phase: round.phase, active: round.active, hands: round.hands.map(function (h) { return { cards: h.cards.map(function (c) { return c.rank + c.suit; }), bet: h.bet, result: h.result }; }), dealer: round.dealer.map(function (c) { return c.rank + c.suit; }) }, chipsOnTable: Ch.all().length, chipZ: Ch.all().filter(function (c) { return c.state === 'rest' || c.state === 'slide'; }).map(function (c) { return +c.z.toFixed(2); }) }; },
    unlockFx: function (i) { showUnlock(i, E.TABLES[i].level, E.TABLES[i].min * 50); },
    theme: function (i) { S.setTheme(i, E.TABLES[i], themeLabels(E.TABLES[i])); },
    skipCoach: function () { st.tut = 9; coachStep = 0; coachHide(); save(); },
    coachInfo: function () { return [coachStep, st.tut, $('coach').className, mode, phase]; },
    cam: function () { var p = S.camera.position; return [p.x, p.y, p.z, S.camera.fov].map(function (v) { return +v.toFixed(1); }); },
    give: function (n) { st.chips = n; refreshButtons(); if (mode === 'lobby') buildLobby(); },
    speed: function (x) { anim.speed = x; },
    pixelRatio: function (r) { BJ.debug.fixedQuality = true; S.renderer.setPixelRatio(r); S.resize(); },
    fixedQuality: false,
    noRender: false,
    clock: 0
  };

  function boot() {
    // 앱 버전 표시: 빌드가 넣은 버전 (웹 공개·구글플레이·토스), 개발 중에는 없어서 dev
    var version = window.NCQ && window.NCQ.NCQ_VERSION;
    $('appVersion').textContent = version ? 'v' + version : 'dev';
    window.NcqSave.onChange(function (s, info) {
      if (info.source !== 'cloud' || mode === 'table' || mode === 'intro') return;
      Object.keys(s).forEach(function (k) { st[k] = s[k]; });
      shown = st.chips; $('chips').textContent = U.money(st.chips); refreshLevel(); syncUnlocks();
      if (mode === 'lobby') buildLobby();
    });
    BJ.online.ready();
    BJ.meta.init(st, save, { toast: function (m) { toast(m); } });
    BJ.tour.init(st, save, {
      toast: function (m) { toast(m); },
      enter: enterTour,
      spend: function (n) { st.chips -= n; save(); },
      addChips: function (n) { addChips(n); floatDelta(n); save(); },
      check: function () { BJ.meta.check(); }
    });
    BJ.vip.init(st, save, {
      toast: function (m) { toast(m); },
      give: function (n) { if (st.inTour) st.bank += n; else { addChips(n); floatDelta(n); } save(); if (mode === 'lobby') buildLobby(); },   // always your own chips
      shown: function (n) { if (!st.inTour) { if (st.chips > st.stats.peak) st.stats.peak = st.chips; floatDelta(n); } if (mode === 'lobby') buildLobby(); }
    });
    I.lang = st.lang || ((navigator.language || 'en').toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en');
    I.apply(); BJ.tour.refreshButton();
    A.on = st.sound;
    fit();
    var fonts = (document.fonts && document.fonts.load)
      ? Promise.all(BJ.art.fonts.map(function (f) { return document.fonts.load(f).catch(function () {}); }))
      : Promise.resolve();
    var timeout = new Promise(function (r) { setTimeout(r, 2500); });
    Promise.race([fonts, timeout]).then(function () {
      try { S.init($('stage')); }
      catch (err) {
        if (window.console) console.error(err);
        $('loading').querySelector('.lbox').innerHTML = '<span></span>';
        $('loading').querySelector('span').textContent = I.t('webgl');
        return;
      }
      Ch.setPile('h0', PILE.x, PILE.z); Ch.setPile('h1', SPLIT_PILE_X, PILE.z);
      var coin = BJ.art.coinUrl();
      document.documentElement.style.setProperty('--coin', 'url(' + coin + ')');
      applyTable();
      BJ.intro.setOut(E.RULES.decks);           // lobby: empty shoe, decks lying on the felt
      wire();
      fit();
      $('chips').textContent = U.money(st.chips);
      refreshLevel();
      refreshBetTags();
      setPhase('busy');
      syncUnlocks();
      sel = defaultPick(); st.table = sel;
      S.setTheme(sel, E.TABLES[sel], themeLabels(E.TABLES[sel]));
      setMode('lobby');
      if (pendingUnveil() && (st.stats.hands || st.tut)) { sel = topOpen(); st.table = sel; S.setTheme(sel, E.TABLES[sel], themeLabels(E.TABLES[sel])); popOpen(sel); } else buildLobby();
      wireSwipe();
      setTimeout(function () { if (mode === 'lobby') BJ.tour.check(); }, 600);
      requestAnimationFrame(function (t) { last = t; frame(t); $('loading').className = 'gone'; });
      NcqMetrics.step("001_loading_done"); dayOpenStep();
      // A brand-new player skips the lobby: straight to the first table, the decks shuffle into the shoe,
      // and the first-time pointers take over from there.
      var noAuto = false; try { noAuto = !!localStorage.getItem('bj-noauto'); } catch (e) {}   // test runs that start in the lobby
      if (!st.stats.hands && !st.tut && !noAuto) { sel = 0; multi = false; setTimeout(function () { if (mode === 'lobby') enterTable(); }, 400); }
    });
  }
  boot();
})();
