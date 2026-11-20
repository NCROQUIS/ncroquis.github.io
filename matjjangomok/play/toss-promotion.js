// Eligibility belongs to the app. The account store only persists progress and
// reserves one payment; it does not inspect rooms, rules or native Toss identity.
export function promotionRound(game) {
  if (!game || game.device || game.sharedView || game.summaryOnly || ![1, 2].includes(game.you)
    || (game.phase && game.phase !== "finished") || !Array.isArray(game.moves)
    || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(game.code ?? "")
    || !Number.isInteger(game.round) || game.round < 0 || !Number.isFinite(Date.parse(game.finishedAt))) return null;
  const reason = game.endReason;
  if (![0, 1, 2].includes(game.winner) || !["win", "draw", "resign", "disconnect", "timeout"].includes(reason)
    || !game.moves.length || (["resign", "disconnect", "timeout"].includes(reason)
    && (game.moves.length < 6 || game.winner !== game.you))) return null;
  const actions = game.recordDetail?.actions ?? game.actions;
  const ownMoves = Array.isArray(actions)
    ? actions.filter(a => a.type === "move" && a.seat === game.you).length
    : game.moveSeats?.filter(seat => seat === game.you).length ?? 0;
  if (ownMoves < 3) return null;
  return { room: game.code, round: game.round, finishedAt: game.finishedAt };
}

export function createTossPromotion({ promo, player, request, reward, history = () => [],
  currentRound = () => null, canReward = () => true }) {
  const id = "PLAY_3_MATCHES", pending = new Map();
  let work = null, confirmation = null, again = false;
  const call = (data, owner) => request({ ...data, player: owner, missionVersion: 2 });
  const key = round => round.room + ":" + round.round;
  async function sync() {
    const sdk = promo(), owner = player();
    if (!sdk || !owner || sdk.amount(id) !== 2) return;
    const test = sdk.test === true;
    if (confirmation && confirmation.owner !== owner) confirmation = null;
    if (confirmation) {
      const result = await call({ op: "complete", test: confirmation.test, claim: confirmation.claim,
        receipt: confirmation.receipt, result: confirmation.result }, owner);
      if (!result.error && owner === player()) confirmation = null;
      return;
    }
    if (!sdk.can(id)) return;
    let state = await call({ op: "status", test, ...currentRound() }, owner);
    if (owner !== player() || state.error || state.status !== "active") return;
    const completed = new Set(state.completed ?? []), excluded = new Set(state.excluded ?? []);
    const candidates = [...pending.values()].filter(r => r.owner === owner && r.test === test).map(r => r.round)
      .concat(history().map(promotionRound).filter(Boolean));
    for (const round of candidates) {
      if (state.count >= 3) break;
      if (excluded.has(key(round)) || completed.has(key(round)) || Date.parse(round.finishedAt) < Date.parse(state.enrolledAt)) continue;
      const next = await call({ op: "progress", test, room: round.room, round: round.round }, owner);
      if (owner !== player() || next.error) return;
      state = next; completed.add(key(round)); pending.delete(owner + ":" + test + ":" + key(round));
    }
    // Only the app decides achievement. The store arbitrates a single claim.
    if (state.count < 3 || state.status !== "active" || !sdk.can(id) || !canReward()) return;
    const permit = await call({ op: "reserve", test }, owner);
    if (owner !== player() || permit.error || !permit.permit || !permit.claim) return;
    const result = await reward();
    if (owner !== player() || !["granted", "already"].includes(result?.status)) return;
    confirmation = { owner, test, claim: permit.claim, receipt: result.key || null, result: result.status };
    const saved = await call({ op: "complete", test, claim: permit.claim,
      receipt: confirmation.receipt, result: confirmation.result }, owner);
    if (!saved.error && owner === player()) confirmation = null;
  }
  function refresh() {
    again = true;
    if (work) return work;
    work = (async () => { while (again) { again = false; await sync(); } })()
      .catch(() => {}).finally(() => { work = null; });
    return work;
  }
  return { refresh, finish(game) {
    const owner = player(), sdk = promo(), round = promotionRound(game);
    if (owner && sdk?.can(id) && round) pending.set(owner + ":" + (sdk.test === true) + ":" + key(round),
      { owner, test: sdk.test === true, round });
    return refresh();
  } };
}
