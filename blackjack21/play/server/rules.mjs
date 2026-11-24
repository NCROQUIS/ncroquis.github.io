// Blackjack 21 — shared table rules for NcqBoard (mode "rules", 2 seats: you and one other player or a house bot).
// One room plays one hand: bets, the deal, each seat's decisions in seat order, the dealer, the payout. The next
// hand starts with board.rematch. 6-deck shoe, dealer stands on all 17s, blackjack pays 3:2, one double, one
// split, the dealer peeks with an Ace or ten showing. The shoe, the dealer's hole card and nothing private is
// ever sent to a device: view() builds what each seat may see.
// Chips stay in each player's own save; the server only checks the bet is within the table's limits and works
// out each seat's net result (payouts) so both screens agree.

const TABLES = {
  alley: [10, 500], harbor: [50, 2500], garden: [100, 5000], grand: [500, 25000], royal: [1000, 50000],
  sky: [5000, 250000], monte: [10000, 500000], macau: [50000, 2500000], vegas: [100000, 5000000],
  diamond: [500000, 25000000], crown: [1000000, 50000000]
};
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"], SUITS = ["S", "H", "D", "C"];
const VERSION = "blackjack21-table-v1";

function newShoe() {
  const shoe = [];
  for (let d = 0; d < 6; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s });
  for (let i = shoe.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shoe[i], shoe[j]] = [shoe[j], shoe[i]]; }
  return shoe;
}
function value(c) { return c.r === "A" ? 11 : ["J", "Q", "K", "10"].includes(c.r) ? 10 : Number(c.r); }
function total(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { t += value(c); if (c.r === "A") aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
}
function natural(cards) { return cards.length === 2 && total(cards).total === 21; }
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function draw(st) { if (st.shoe.length < 20) st.shoe = newShoe(); return st.shoe.pop(); }

function initial(input) {
  const players = Math.max(1, Math.min(8, Number(input && input.players) || 2));
  const queue = input && input.queue && TABLES[input.queue] ? input.queue : "alley";
  const [min, max] = TABLES[queue];
  return {
    rulesVersion: VERSION, table: queue, min, max,
    phase: "bet", turn: 1, winner: null, done: false, results: null, payouts: null,
    shoe: newShoe(), dealer: [],
    seats: Array.from({ length: players }, () => ({ bet: 0, hands: [], active: 0, last: null })),
    seq: 0
  };
}

// the first seat (from turn onward) that still has something to do in this phase
function nextTurn(st) {
  if (st.phase === "bet") {
    const i = st.seats.findIndex((s) => !s.bet);
    return i < 0 ? 0 : i + 1;
  }
  for (let i = 0; i < st.seats.length; i++) {
    const s = st.seats[i];
    if (s.hands.some((h) => !h.done)) return i + 1;
  }
  return 0;
}

function dealRound(st) {
  st.dealer = [];
  for (const s of st.seats) s.hands = [{ cards: [], bet: s.bet, done: false, doubled: false, split: false }];
  for (let k = 0; k < 2; k++) {
    for (const s of st.seats) s.hands[0].cards.push(draw(st));
    st.dealer.push(draw(st));
  }
  for (const s of st.seats) if (natural(s.hands[0].cards)) s.hands[0].done = true;
  st.phase = "play";
  // the dealer peeks with an Ace or a ten up: a dealer blackjack ends the hand at once
  if (value(st.dealer[0]) >= 10 && natural(st.dealer)) { for (const s of st.seats) for (const h of s.hands) h.done = true; return finishRound(st, true); }
  st.turn = nextTurn(st);
  if (!st.turn) finishRound(st, false);
}

function finishRound(st, dealerBJ) {
  st.phase = "dealer";
  const live = st.seats.some((s) => s.hands.some((h) => total(h.cards).total <= 21 && !(natural(h.cards) && !h.split)));
  if (!dealerBJ && live) while (total(st.dealer).total < 17) st.dealer.push(draw(st));
  const d = total(st.dealer).total, dBJ = natural(st.dealer);
  st.payouts = st.seats.map((s) => {
    let net = 0;
    for (const h of s.hands) {
      const v = total(h.cards).total, bj = natural(h.cards) && !h.split;
      if (v > 21) { h.result = "lose"; net -= h.bet; }
      else if (bj && !dBJ) { h.result = "blackjack"; net += h.bet * 1.5; }
      else if (dBJ) { h.result = bj ? "push" : "lose"; net -= bj ? 0 : h.bet; }
      else if (d > 21 || v > d) { h.result = "win"; net += h.bet; }
      else if (v === d) { h.result = "push"; }
      else { h.result = "lose"; net -= h.bet; }
    }
    return Math.round(net);
  });
  st.results = st.payouts.map((n) => (n > 0 ? "win" : n < 0 ? "loss" : "draw"));
  st.phase = "finished"; st.done = true; st.turn = 0; st.winner = null;
  return st;
}

function apply(state, seat, action) {
  const st = clone(state);
  const me = st.seats[seat - 1];
  if (!me) throw new Error("bad_seat");
  if (st.done) throw new Error("finished");
  const a = action || {};
  st.seq += 1;
  if (st.phase === "bet") {
    if (a.type !== "bet") throw new Error("bet_phase");
    if (me.bet) throw new Error("already_bet");
    const amount = Math.floor(Number(a.amount));
    if (!(amount >= st.min && amount <= st.max)) throw new Error("bad_amount");
    me.bet = amount; me.last = "bet";
    st.turn = nextTurn(st);
    if (!st.turn) dealRound(st);
    return st;
  }
  if (st.phase !== "play") throw new Error("not_playing");
  if (seat !== st.turn) throw new Error("not_your_turn");
  const h = me.hands[me.active];
  if (!h || h.done) throw new Error("hand_done");
  const first = h.cards.length === 2 && !h.doubled;
  if (a.type === "hit") { h.cards.push(draw(st)); if (total(h.cards).total >= 21) h.done = true; }
  else if (a.type === "stand") { h.done = true; }
  else if (a.type === "double") {
    if (!first || me.hands.length > 1 && h.split && h.cards[0].r === "A") throw new Error("no_double");
    h.bet *= 2; h.doubled = true; h.cards.push(draw(st)); h.done = true;
  } else if (a.type === "split") {
    if (!first || me.hands.length > 1 || value(h.cards[0]) !== value(h.cards[1])) throw new Error("no_split");
    const b = { cards: [h.cards.pop()], bet: h.bet, done: false, doubled: false, split: true };
    h.split = true;
    h.cards.push(draw(st)); b.cards.push(draw(st));
    me.hands.push(b);
    if (h.cards[0].r === "A") { h.done = true; b.done = true; }       // split aces get one card each
    else if (total(h.cards).total === 21) h.done = true;
  } else throw new Error("bad_action");
  me.last = a.type;
  while (me.hands[me.active] && me.hands[me.active].done && me.active < me.hands.length - 1) {
    me.active += 1;
    if (total(me.hands[me.active].cards).total === 21) me.hands[me.active].done = true;
  }
  st.turn = nextTurn(st);
  if (!st.turn) finishRound(st, false);
  return st;
}

// what one seat may see: no shoe, and the dealer's hole card stays face down until the round is over
function view(state, seat) {
  const st = state;
  const showHole = st.phase === "finished";
  return {
    rulesVersion: st.rulesVersion, table: st.table, min: st.min, max: st.max, phase: st.phase, turn: st.turn,
    winner: st.winner, done: st.done, results: st.results, payouts: st.payouts, seq: st.seq, you: seat,
    dealer: st.dealer.map((c, i) => (i === 1 && !showHole ? null : { r: c.r, s: c.s })),
    shoeLeft: st.shoe.length,
    seats: st.seats.map((s) => ({ bet: s.bet, active: s.active, last: s.last,
      hands: s.hands.map((h) => ({ cards: h.cards.map((c) => ({ r: c.r, s: c.s })), bet: h.bet, done: h.done, doubled: h.doubled, split: h.split, result: h.result || null })) }))
  };
}

// the house bot: a fair bet and basic strategy
function advise(cards, up, canDouble, canSplit) {
  const t = total(cards), u = value(up);
  if (canSplit && value(cards[0]) === value(cards[1])) {
    const p = value(cards[0]);
    if (p === 11 || p === 8) return "split";
    if (p === 9 && ![7, 10, 11].includes(u)) return "split";
    if ((p === 7 || p === 6 || p === 3 || p === 2) && u <= 7) return "split";
  }
  if (t.soft && t.total <= 21) {
    if (t.total >= 19) return "stand";
    if (t.total === 18) return u >= 9 ? "hit" : canDouble && u >= 3 && u <= 6 ? "double" : "stand";
    return canDouble && u >= 4 && u <= 6 ? "double" : "hit";
  }
  if (t.total >= 17) return "stand";
  if (t.total >= 13) return u <= 6 ? "stand" : "hit";
  if (t.total === 12) return u >= 4 && u <= 6 ? "stand" : "hit";
  if (t.total === 11) return canDouble ? "double" : "hit";
  if (t.total === 10) return canDouble && u <= 9 ? "double" : "hit";
  return "hit";
}
function bot(room) {
  const st = room.state, seat = st.turn || 1, s = st.seats[seat - 1];
  if (st.phase === "bet") {
    const steps = [1, 1, 2, 3, 5, 5, 10, 20][Math.floor(Math.random() * 8)];
    return { type: "bet", amount: Math.min(st.max, st.min * steps) };
  }
  const h = s.hands[s.active], first = h.cards.length === 2 && !h.doubled;
  return { type: advise(h.cards, st.dealer[0], first, first && s.hands.length === 1) };
}
// time's up: a missed bet goes in at the table maximum, a missed decision stands
function timeout(room) {
  const st = room.state;
  if (st.phase === "bet") return { type: "bet", amount: st.max };
  return { type: "stand" };
}

export default { initial, apply, view, bot, timeout };
export { initial, apply, view, bot, timeout, total };
