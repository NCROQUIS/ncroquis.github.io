// A replay snapshot excludes transient room state and mutable public-link settings.
export function recordSnapshot(game, online) {
  if (!game || typeof game !== "object" || game.summaryOnly) return null;
  const code = game.code ?? game.id?.split(":")[0];
  if (!code || !Number.isInteger(game.round) || !Array.isArray(game.moves)) return null;
  const snapshot = { id: code + ":" + game.round, code, device: game.device === true || !online };
  for (const key of ["number", "round", "moves", "winner", "line", "you", "finishedAt", "endReason", "players", "bot", "mode", "rule",
    "black", "moveColors", "passes", "moveSeats", "placementStyles", "ratingChange", "recordDetail", "botLevel", "aiVersion", "aiUndoCount"]) {
    if (game[key] !== undefined) snapshot[key] = game[key];
  }
  const actions = game.recordDetail?.actions ?? game.actions;
  if (Array.isArray(actions)) {
    snapshot.passes = [1, 2].map(seat => actions.filter(action => action.type === "pass" && action.seat === seat).length);
  }
  return JSON.parse(JSON.stringify(snapshot));
}

export function createRecordHistory(NcqSave, { player, cloud, legacy = [], changed }) {
  // NcqSave 3 arrives through kickoff guide sync; previous builds keep their local fallback.
  if (!NcqSave?.records) return null;
  const archive = NcqSave.records({ id: "matjjangomok", collection: "games", player, cloud });
  for (const game of legacy) {
    const record = recordSnapshot(game, cloud && game.device !== true);
    if (record) archive.add(record.id, record);
  }
  const unsubscribe = archive.onChange(info => {
    if (info.source === "cloud" || info.source === "other-tab") changed?.();
  });
  return {
    player,
    list: () => archive.list().map(item => recordSnapshot(item.data, cloud)).filter(Boolean)
      .sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt)),
    add: game => {
      const record = recordSnapshot(game, cloud);
      return record ? archive.add(record.id, record) : false;
    },
    ready: () => archive.ready(),
    status: () => archive.status(),
    dispose: () => { unsubscribe(); archive.dispose(); },
  };
}

export function restoreResult(previous, result, saved) {
  const code = result.id?.split(":")[0] ?? previous.code;
  const local = saved?.find(game => game.id === code + ":" + result.round);
  return { ...previous, ...local, ...result.state, code, round: result.round,
    you: result.you, ratingChange: result.ratingChange, winner: result.state.winner,
    finishedAt: result.finishedAt, phase: "finished", canRematch: false,
    version: Math.max(previous.version + 1, result.version ?? 0),
    summaryOnly: !local, ...(local ? { recordDetail: local.recordDetail } : {}),
    ...(local ? { board: replayBoard(local), actions: local.recordDetail?.actions } : {}),
  };
}

function replayBoard(game) {
  const board = Array(225).fill(0);
  for (const [i, index] of game.moves.entries()) {
    if (Number.isInteger(index) && index >= 0 && index < 225) board[index] = game.moveColors?.[i] ?? i % 2 + 1;
  }
  return board;
}

export function mergeFinishedRoom(previous, next, records) {
  if (!next.summaryOnly) return next;
  const local = records.find(game => game.id === next.code + ":" + next.round);
  const current = previous?.code === next.code && previous.round === next.round ? previous : {};
  return { ...current, ...local, ...next,
    moves: local?.moves ?? current.moves ?? [],
    moveColors: local?.moveColors ?? current.moveColors, moveSeats: local?.moveSeats ?? current.moveSeats,
    line: local?.line ?? current.line ?? [], placementStyles: local?.placementStyles ?? current.placementStyles,
    board: local ? replayBoard(local) : current.board ?? next.board,
    recordDetail: local?.recordDetail ?? current.recordDetail, summaryOnly: !local,
    actions: local?.recordDetail?.actions ?? current.recordDetail?.actions ?? next.actions,
  };
}
