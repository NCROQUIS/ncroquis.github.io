/* Blackjack rules and chip economy. Pure logic, no DOM: the game screen and the
   balance simulator both run on this file. */
(function (root) {
  'use strict';

  var SUITS = ['S', 'H', 'D', 'C'];
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // House rules. Every hand is dealt from a freshly shuffled shoe.
  var RULES = {
    decks: 6,
    hitSoft17: false,       // dealer stands on all 17s
    blackjackPays: 1.5,     // 3 to 2
    maxHands: 2,            // one split
    doubleAfterSplit: true
  };

  // Chip denominations that exist in the game, smallest first.
  var DENOMS = [5, 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000, 25000000, 50000000, 100000000, 500000000, 1000000000];

  // Table ladder: every table's top bet is 500 times its minimum, and it plays with four chips.
  // A table opens for good once you hold `open` of your own chips (fifty of its minimum bets).
  var TABLES = [
    { id: 'alley',   min: 500,      max: 250000,      open: 0,          chips: [500, 1000, 5000, 10000] },
    { id: 'harbor',  min: 1000,     max: 500000,      open: 50000,      chips: [1000, 5000, 10000, 50000] },
    { id: 'garden',  min: 5000,     max: 2500000,     open: 250000,     chips: [5000, 10000, 50000, 100000] },
    { id: 'grand',   min: 10000,    max: 5000000,     open: 500000,     chips: [10000, 50000, 100000, 500000] },
    { id: 'royal',   min: 50000,    max: 25000000,    open: 2500000,    chips: [50000, 100000, 500000, 1000000] },
    { id: 'sky',     min: 100000,   max: 50000000,    open: 5000000,    chips: [100000, 500000, 1000000, 5000000] },
    { id: 'monte',   min: 500000,   max: 250000000,   open: 25000000,   chips: [500000, 1000000, 5000000, 10000000] },
    { id: 'macau',   min: 1000000,  max: 500000000,   open: 50000000,   chips: [1000000, 5000000, 10000000, 50000000] },
    { id: 'vegas',   min: 5000000,  max: 2500000000,  open: 250000000,  chips: [5000000, 10000000, 50000000, 100000000] },
    { id: 'diamond', min: 10000000, max: 5000000000,  open: 500000000,  chips: [10000000, 50000000, 100000000, 500000000] },
    { id: 'crown',   min: 50000000, max: 25000000000, open: 2500000000, chips: [50000000, 100000000, 500000000, 1000000000] }
  ];
  var START_CHIPS = 20000;           // forty minimum bets at the first table

  // Experience. Every hand played earns XP, more at bigger tables. Levels open tables and pay out chips.
  var XP_HAND = 10;
  // XP by how the hand went (blackjack counts as a win). With basic strategy a hand wins about 43%, pushes 9%
  // and loses 48% of the time, so the average stays close to the old flat 10.
  var XP_RESULT = { win: 16, push: 8, lose: 4 };
  // Bigger tables pay a lot more XP: playing up is the way to level.
  var XP_MULT = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
  function xpMult(tableIndex) { return XP_MULT[tableIndex] || 1; }
  // Early levels come in a handful of hands (Harbor opens around the fourth); the last table, Lv70,
  // is about 330 days away at 60 hands a day on the best open table.
  var XP_K = 30, XP_P = 2.7;
  function xpFor(level) { return level <= 1 ? 0 : Math.round(XP_K * Math.pow(level - 1, XP_P)); }   // total XP needed to be at `level`
  function levelOf(xp) {
    var L = Math.floor(Math.pow(Math.max(0, xp) / XP_K, 1 / XP_P)) + 1;
    while (xpFor(L + 1) <= xp) L++;
    while (L > 1 && xpFor(L) > xp) L--;
    return L;
  }

  // Chips handed out for a rewarded ad when the player cannot cover the table minimum.
  function refillAmount(table) { return table.min * 10; }      // ten minimum bets of that table

  function cardValue(c) {
    var r = c.rank;
    if (r === 'A') return 11;
    if (r === 'K' || r === 'Q' || r === 'J' || r === '10') return 10;
    return +r;
  }

  function handValue(cards) {
    var total = 0, aces = 0;
    for (var i = 0; i < cards.length; i++) {
      total += cardValue(cards[i]);
      if (cards[i].rank === 'A') aces++;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total: total, soft: aces > 0 };
  }

  function makeShoe(decks, rng) {
    var shoe = [];
    for (var d = 0; d < decks; d++)
      for (var s = 0; s < 4; s++)
        for (var r = 0; r < 13; r++)
          shoe.push({ rank: RANKS[r], suit: SUITS[s] });
    for (var i = shoe.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = shoe[i]; shoe[i] = shoe[j]; shoe[j] = t;
    }
    return shoe;
  }

  function newHand(bet) {
    return { cards: [], bet: bet, doubled: false, done: false, fromSplit: false,
             splitAces: false, reason: null, result: null, payout: 0 };
  }

  function isNatural(h) {
    return !h.fromSplit && h.cards.length === 2 && handValue(h.cards).total === 21;
  }

  // Deal a round. Order on the table: player, dealer up card, player, dealer hole card.
  // `rig` (optional) is a list of cards to draw first, in dealing order; tests and demos use it.
  // `shoe` (optional) is the dealer's running shoe; cards are drawn from its end and stay gone.
  // Without it every hand is dealt from a fresh shuffle (the simulator does that).
  function deal(bet, rng, rig, shoe) {
    shoe = shoe || makeShoe(RULES.decks, rng || Math.random);
    if (rig) for (var k = rig.length - 1; k >= 0; k--) shoe.push(rig[k]);
    var h = newHand(bet);
    var round = { shoe: shoe, dealer: [], hands: [h], active: 0, phase: 'player', dealerNatural: false };
    h.cards.push(shoe.pop());
    round.dealer.push(shoe.pop());
    h.cards.push(shoe.pop());
    round.dealer.push(shoe.pop());
    // The dealer peeks under an ace or a ten, so a dealer blackjack ends the round at once.
    round.dealerNatural = handValue(round.dealer).total === 21;
    if (round.dealerNatural || isNatural(h)) {
      h.done = true;
      h.reason = isNatural(h) ? 'blackjack' : 'stand';
      round.phase = 'dealer';
    }
    return round;
  }

  function options(round, chips) {
    var o = { hit: false, stand: false, double: false, split: false };
    if (round.phase !== 'player') return o;
    var h = round.hands[round.active];
    if (!h || h.done) return o;
    o.hit = o.stand = true;
    if (h.cards.length === 2 && !h.splitAces && chips >= h.bet &&
        (!h.fromSplit || RULES.doubleAfterSplit)) o.double = true;
    if (!round.noSplit && round.hands.length < RULES.maxHands && h.cards.length === 2 &&
        cardValue(h.cards[0]) === cardValue(h.cards[1]) && chips >= h.bet) o.split = true;
    return o;
  }

  // Move to the next hand that still needs a decision, dealing split cards on the way.
  function advance(round, ev) {
    for (;;) {
      var h = round.hands[round.active];
      if (!h.done && h.cards.length === 1) {
        var c = round.shoe.pop();
        h.cards.push(c);
        ev.push({ t: 'card', to: 'player', hand: round.active, card: c });
        if (h.splitAces || handValue(h.cards).total === 21) { h.done = true; h.reason = 'stand'; }
      }
      if (!h.done) { ev.push({ t: 'turn', hand: round.active }); return ev; }
      if (round.active + 1 < round.hands.length) round.active++;
      else { round.phase = 'dealer'; ev.push({ t: 'phase', phase: 'dealer' }); return ev; }
    }
  }

  function hit(round) {
    var ev = [], h = round.hands[round.active], c = round.shoe.pop();
    h.cards.push(c);
    ev.push({ t: 'card', to: 'player', hand: round.active, card: c });
    var v = handValue(h.cards).total;
    if (v > 21) { h.done = true; h.reason = 'bust'; ev.push({ t: 'bust', hand: round.active }); advance(round, ev); }
    else if (v === 21) { h.done = true; h.reason = 'stand'; advance(round, ev); }
    else ev.push({ t: 'turn', hand: round.active });
    return ev;
  }

  function stand(round) {
    var ev = [], h = round.hands[round.active];
    h.done = true; h.reason = 'stand';
    return advance(round, ev);
  }

  // Caller takes the extra bet out of the bankroll before calling.
  function double(round) {
    var ev = [], h = round.hands[round.active], c = round.shoe.pop();
    h.bet *= 2; h.doubled = true;
    h.cards.push(c);
    ev.push({ t: 'card', to: 'player', hand: round.active, card: c, sideways: true });
    h.done = true;
    if (handValue(h.cards).total > 21) { h.reason = 'bust'; ev.push({ t: 'bust', hand: round.active }); }
    else h.reason = 'stand';
    return advance(round, ev);
  }

  // Caller takes the second bet out of the bankroll before calling.
  function split(round) {
    var ev = [], h = round.hands[round.active];
    var a = newHand(h.bet), b = newHand(h.bet);
    a.cards = [h.cards[0]]; b.cards = [h.cards[1]];
    a.fromSplit = b.fromSplit = true;
    a.splitAces = b.splitAces = (h.cards[0].rank === 'A' && h.cards[1].rank === 'A');
    round.hands = [a, b];
    round.active = 0;
    ev.push({ t: 'split' });
    return advance(round, ev);
  }

  function dealerPlay(round) {
    var ev = [{ t: 'reveal' }];
    var live = round.hands.some(function (h) { return h.reason !== 'bust' && !isNatural(h); });
    if (!round.dealerNatural && live) {
      for (;;) {
        var v = handValue(round.dealer);
        if (v.total < 17 || (v.total === 17 && v.soft && RULES.hitSoft17)) {
          var c = round.shoe.pop();
          round.dealer.push(c);
          ev.push({ t: 'card', to: 'dealer', card: c });
        } else break;
      }
    }
    round.phase = 'settle';
    return ev;
  }

  // Sets result and payout on every hand. Payout is what comes back to the
  // bankroll, stake included (the stake left the bankroll when it was bet).
  function settle(round) {
    var d = handValue(round.dealer).total, dBust = d > 21, total = 0;
    round.hands.forEach(function (h) {
      var p = handValue(h.cards).total, res, pay;
      if (h.reason === 'bust' || p > 21) { res = 'lose'; pay = 0; }
      else if (isNatural(h)) {
        if (round.dealerNatural) { res = 'push'; pay = h.bet; }
        else { res = 'blackjack'; pay = h.bet + h.bet * RULES.blackjackPays; }
      }
      else if (round.dealerNatural) { res = 'lose'; pay = 0; }
      else if (dBust || p > d) { res = 'win'; pay = h.bet * 2; }
      else if (p === d) { res = 'push'; pay = h.bet; }
      else { res = 'lose'; pay = 0; }
      h.result = res; h.payout = pay; total += pay;
    });
    round.phase = 'done';
    return total;
  }

  // Basic strategy for these rules. Used by the simulator; a hint button can use it later.
  function advise(round, opts) {
    var h = round.hands[round.active];
    var up = cardValue(round.dealer[0]);          // 2..11
    var v = handValue(h.cards), t = v.total;
    if (opts.split) {
      var pv = cardValue(h.cards[0]);
      if (pv === 11 || pv === 8) return 'split';
      if (pv === 9 && up !== 7 && up !== 10 && up !== 11) return 'split';
      if (pv === 7 && up <= 7) return 'split';
      if (pv === 6 && up <= 6) return 'split';
      if (pv === 4 && (up === 5 || up === 6)) return 'split';
      if ((pv === 3 || pv === 2) && up <= 7) return 'split';
    }
    if (v.soft) {
      if (t >= 19) return 'stand';
      if (t === 18) {
        if (up >= 3 && up <= 6) return opts.double ? 'double' : 'stand';
        if (up === 2 || up === 7 || up === 8) return 'stand';
        return 'hit';
      }
      if (t === 17) return (up >= 3 && up <= 6 && opts.double) ? 'double' : 'hit';
      if (t === 16 || t === 15) return (up >= 4 && up <= 6 && opts.double) ? 'double' : 'hit';
      return ((up === 5 || up === 6) && opts.double) ? 'double' : 'hit';
    }
    if (t >= 17) return 'stand';
    if (t >= 13) return up <= 6 ? 'stand' : 'hit';
    if (t === 12) return (up >= 4 && up <= 6) ? 'stand' : 'hit';
    if (t === 11) return (up <= 10 && opts.double) ? 'double' : 'hit';
    if (t === 10) return (up <= 9 && opts.double) ? 'double' : 'hit';
    if (t === 9) return (up >= 3 && up <= 6 && opts.double) ? 'double' : 'hit';
    return 'hit';
  }

  // Split an amount into chips, largest first. `floor` is the smallest chip allowed.
  function breakdown(amount, maxChips) {
    var out = [], left = amount;
    for (var i = DENOMS.length - 1; i >= 0 && left > 0; i--) {
      while (left >= DENOMS[i] && out.length < (maxChips || 99)) { out.push(DENOMS[i]); left -= DENOMS[i]; }
    }
    return out;
  }

  var api = {
    RULES: RULES, DENOMS: DENOMS, TABLES: TABLES, START_CHIPS: START_CHIPS,
    XP_HAND: XP_HAND, XP_RESULT: XP_RESULT, xpMult: xpMult, xpFor: xpFor, levelOf: levelOf,
    refillAmount: refillAmount, cardValue: cardValue, handValue: handValue, isNatural: isNatural,
    newShoe: function (rng) { return makeShoe(RULES.decks, rng || Math.random); },
    deal: deal, options: options, hit: hit, stand: stand, double: double, split: split,
    dealerPlay: dealerPlay, settle: settle, advise: advise, breakdown: breakdown
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.BJ = root.BJ || {}; root.BJ.engine = api; }
})(typeof window !== 'undefined' ? window : this);
