import { NcqLang } from "./ncq/lang.js";
import { NcqBoard } from "./ncq/board.js";
import { TEXTS } from "./texts.js";

NcqLang.init({ id: "matjjangomok", texts: TEXTS });
const t = NcqLang.t;
const el = id => document.getElementById(id);
const size = 15;
const columns = "ABCDEFGHJKLMNOP";
const recordsKey = "matjjangomok.records";
const board = el("board");
const cells = [];
let focused = 112;
let selected = null;
let room = null;
let stream = null;
let connected = false;
let busy = false;
let reviewPly = 0;
let archive = null;
let recordsOpen = false;
let recordsScope = recordsKey;
let records = loadRecords();
let liveGames = null;
let lobbyUnavailable = false;
let lobbyLoading = false;
let playerStats = null;
let playerPhoto = null;
let profileLoading = false;
let matchmaking = null;
let authConfig;
let authSession;
let authenticating;
let backend;
let tournament;
let turnDeadline = null;
let turnFrame = 0;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

for (let row = 0; row < size; row += 1) {
  const rowEl = document.createElement("div");
  rowEl.className = "board-row";
  rowEl.setAttribute("role", "row");
  for (let col = 0; col < size; col += 1) {
    const index = row * size + col;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.tabIndex = index === focused ? 0 : -1;
    cell.dataset.index = index;
    cell.setAttribute("role", "gridcell");
    if ([48, 56, 112, 168, 176].includes(index)) cell.classList.add("star");
    const stone = document.createElement("span");
    stone.className = "stone";
    stone.setAttribute("aria-hidden", "true");
    cell.append(stone);
    rowEl.append(cell);
    cells.push(cell);
  }
  board.append(rowEl);
}

for (const language of NcqLang.list()) {
  el("language").add(new Option(language.name, language.code));
}
el("language").addEventListener("change", event => NcqLang.set(event.target.value));
NcqLang.onChange(render);

function coordinate(index) {
  return columns[index % size] + (Math.floor(index / size) + 1);
}

function canPlace() {
  return room?.phase === "playing" && room.turn === room.you && connected && !busy
    && (turnDeadline === null || performance.now() < turnDeadline);
}

function updateTurnClock(now) {
  const remaining = Math.max(0, turnDeadline - now);
  const activeClock = el(room.turn === 1 ? "black-clock" : "white-clock");
  const seconds = String(Math.ceil(remaining / 1000)).padStart(2, "0");
  if (activeClock.textContent !== seconds) {
    activeClock.textContent = seconds;
    if (!reducedMotion.matches) activeClock.animate([
      { opacity: .55, transform: "translateY(-3px) scale(1.12)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ], { duration: 190, easing: "ease-out" });
  }
  const progress = Math.min(1, remaining / (room.turnSeconds * 1000));
  el("place").style.setProperty("--turn-progress", progress.toFixed(4));
  el("player-bar").toggleAttribute("data-time-low", remaining <= 5000);
  if (remaining > 0) turnFrame = requestAnimationFrame(updateTurnClock);
  else {
    el("place").disabled = true;
    board.classList.remove("selectable");
  }
}

function renderPlayers(game, playing) {
  const timed = playing && turnDeadline !== null;
  el("player-bar").toggleAttribute("data-playing", playing);
  for (const [color, seat] of [["black", 1], ["white", 2]]) {
    const own = game.you === seat;
    const active = playing && game.turn === seat;
    const clock = el(color + "-clock");
    const turn = el(color + "-turn");
    el(color + "-player-label").textContent = t(color) + " · " + t(own ? "you" : "opponent");
    el(color + "-player").classList.toggle("active", active);
    turn.hidden = !playing;
    turn.textContent = t(active ? (own ? "yourTurn" : "theirTurn") : "turnWaiting");
    clock.hidden = !timed;
    if (timed && !active) clock.textContent = String(Math.ceil(game.turnSeconds)).padStart(2, "0");
  }
  cancelAnimationFrame(turnFrame);
  if (timed) updateTurnClock(performance.now());
  else {
    el("player-bar").removeAttribute("data-time-low");
    el("place").style.removeProperty("--turn-progress");
  }
}

function feedback(id, message = "", error = false) {
  const node = el(id);
  node.dataset.message = message;
  node.toggleAttribute("data-error", error);
  node.hidden = !message;
  node.textContent = message ? t(message) : "";
}

function loadRecords(key = recordsScope) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveRecord(game) {
  const id = game.id + ":" + game.round;
  const existing = new Map([...records, ...loadRecords()].map(record => [record.id, record]));
  const { number, round, moves, winner, line, you, finishedAt, endReason } = game;
  existing.set(id, { id, number, round, moves, winner, line, you, finishedAt, endReason });
  records = [...existing.values()].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 50);
  try {
    localStorage.setItem(recordsScope, JSON.stringify(records));
  } catch {
    // The record stays available for this visit if the browser blocks storage.
  }
}

function describeOutcome(game) {
  return !game.winner ? "draw" : game.winner === game.you ? "won" : "lost";
}

function entryRow(item, label, note, record = false) {
  const row = document.createElement("li");
  row.className = "entry-row";
  const body = document.createElement(record ? "button" : "div");
  body.className = "entry-body";
  const name = document.createElement("strong");
  name.textContent = label;
  const detail = document.createElement("span");
  detail.textContent = note;
  body.append(name, detail);
  if (record) body.addEventListener("click", () => openArchive(item));
  row.append(body);
  return row;
}

function renderLobby() {
  renderPlayerCard();
  el("live-count").textContent = liveGames?.length ?? "";
  const message = lobbyUnavailable ? "liveUnavailable" : liveGames ? "noLiveGames" : "liveLoading";
  el("live-message").textContent = t(message);
  el("live-message").hidden = !lobbyUnavailable && Boolean(liveGames?.length);
  el("live-games").replaceChildren(...(lobbyUnavailable ? [] : liveGames ?? []).map(game => entryRow(
    game, t("onlineMatch") + " #" + game.number, t("movesCount", { n: game.moves }),
  )));
}

function ratingNumber(value) {
  return new Intl.NumberFormat(NcqLang.lang).format(value);
}

function renderPlayerCard() {
  el("player-card").hidden = !playerStats;
  if (!playerStats) return;
  el("player-record").textContent = t("careerRecord", playerStats);
  el("player-rating").textContent = t("myRating", { rating: ratingNumber(playerStats.rating) });
}

async function refreshPlayerCard() {
  if (!backend || profileLoading) return;
  profileLoading = true;
  try {
    const stats = await remoteRequest(client => client.profile());
    if (stats.error) return;
    playerStats = stats;
    renderPlayerCard();
    const profile = await window.NcqAuth.profile?.().catch(() => null);
    const photo = profile?.photoUrl ?? null;
    if (photo !== playerPhoto) {
      playerPhoto = photo;
      el("player-photo").hidden = true;
      if (photo) el("player-photo").src = photo;
      else el("player-photo").removeAttribute("src");
    }
  } finally {
    profileLoading = false;
  }
}

function renderRecords() {
  el("records-empty").hidden = records.length > 0;
  el("record-list").replaceChildren(...records.map(game => {
    const date = NcqLang.date(game.finishedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const label = t(describeOutcome(game)) + " · " + t(game.device ? "deviceRecord" : "onlineMatch");
    return entryRow(game, label, date + " · " + t("movesCount", { n: game.moves.length }), true);
  }));
}

async function refreshLobby() {
  if (room || recordsOpen || lobbyLoading || document.hidden) return;
  lobbyLoading = true;
  try {
    if (backend) {
      liveGames = await backend.lobby();
    } else {
      const response = await fetch("./api/lobby", { signal: AbortSignal.timeout(3500) });
      if (!response.ok) throw new Error();
      liveGames = await response.json();
    }
    lobbyUnavailable = false;
  } catch {
    lobbyUnavailable = true;
  } finally {
    lobbyLoading = false;
    if (!el("lobby").hidden) renderLobby();
  }
}

function render() {
  const game = room ?? archive;
  el("language").value = NcqLang.lang;
  document.title = t("title");
  document.body.classList.toggle("in-match", Boolean(game));
  el("lobby").hidden = Boolean(game) || recordsOpen;
  el("records").hidden = Boolean(game) || !recordsOpen;
  el("match").hidden = !game;
  el("start").disabled = busy || Boolean(matchmaking);
  el("start").toggleAttribute("data-ncq-main", !matchmaking && !el("tournament").open);
  el("show-records").disabled = busy;
  el("show-tournament").hidden = !backend || Boolean(game) || recordsOpen;
  if (!el("lobby").hidden) renderLobby();
  if (!el("records").hidden) renderRecords();
  if (matchmaking) {
    const { canceled, mode } = matchmaking;
    el("queue-status").textContent = t(canceled ? "canceling" : mode === "tournament" ? "tournamentWaiting" : "findingOpponent");
    el("cancel-match").disabled = canceled;
  }
  for (const node of [el("lobby-error"), el("match-error")]) {
    if (!node.hidden) node.textContent = t(node.dataset.message);
  }
  if (!game) return;

  const playing = game.phase === "playing";
  const finished = game.phase === "finished";
  let status = "waiting";
  if (room && !connected) status = "reconnecting";
  else if (playing) status = game.turn === game.you ? "yourTurn" : "theirTurn";
  else if (finished) status = describeOutcome(game);

  el("room-label").textContent = t(archive ? "records" : "room");
  el("room-id").textContent = "#" + game.number;
  if (el("status").textContent !== t(status)) el("status").textContent = t(status);
  el("round").textContent = t(playing ? "liveRound" : "round", { n: game.round, moves: game.moves.length });
  const mode = game.mode === "tournament" ? "tournamentButton" : "onlineMatch";
  el("mode").textContent = t(finished ? (el("result").open ? "result" : "review") : mode);
  el("match-actions").hidden = finished;
  el("invite").hidden = playing || finished || el("share").open;
  el("leave").disabled = busy;
  el("leave").textContent = t(archive ? "backToRecords" : "leave");
  el("leave").toggleAttribute("data-ncq-main", Boolean(archive));

  const place = el("place");
  place.hidden = !playing;
  place.disabled = !canPlace() || selected === null;
  place.classList.toggle("my-turn", playing && game.turn === game.you && connected);
  const placeLabel = game.turn !== game.you ? t("theirTurn")
    : selected === null ? t("selectStone") : t("place", { cell: coordinate(selected) });
  place.setAttribute("aria-label", placeLabel);
  place.title = placeLabel;
  renderPlayers(game, playing);
  el("review").hidden = !finished || el("result").open;
  el("rematch").hidden = Boolean(archive) || game.mode === "tournament";
  el("rematch").disabled = !connected || busy || game.requested;
  el("rematch").textContent = t(game.requested ? "rematchWaiting" : game.rematch ? "rematchReady" : "rematch");

  let displayedBoard = game.board;
  let last = game.moves.at(-1);
  let winning = game.line;
  if (finished) {
    el("result-title").textContent = t(describeOutcome(game));
    const timeout = game.endReason === "timeout";
    const color = timeout ? 3 - game.winner : game.winner;
    el("result-summary").textContent = t(timeout ? "resultTimeout" : game.winner ? "resultWinner" : "resultDraw", {
      color: t(color === 1 ? "black" : "white"),
      n: game.moves.length,
    });
    const badge = !game.winner ? "drawBadge" : game.winner === game.you ? "winBadge" : "lossBadge";
    el("result-badge").textContent = t(badge);
    el("result-badge").dataset.result = badge;
    const change = game.ratingChange;
    el("result-rating").hidden = !change;
    if (change) {
      const delta = change.delta;
      el("rating-range").textContent = ratingNumber(change.before) + " → " + ratingNumber(change.after);
      el("rating-delta").textContent = delta > 0 ? "↑ +" + delta : delta < 0 ? "↓ −" + Math.abs(delta) : "±0";
      el("rating-delta").dataset.direction = delta > 0 ? "up" : delta < 0 ? "down" : "same";
    }
    el("move-count").textContent = reviewPly + " / " + game.moves.length;
    for (const button of el("review").querySelectorAll("[data-step]")) {
      const movesBack = ["first", "previous"].includes(button.dataset.step);
      button.disabled = movesBack ? reviewPly === 0 : reviewPly === game.moves.length;
    }
    if (archive || reviewPly < game.moves.length) {
      displayedBoard = Array(cells.length).fill(0);
      for (let i = 0; i < reviewPly; i += 1) displayedBoard[game.moves[i]] = i % 2 + 1;
      last = game.moves[reviewPly - 1];
      if (reviewPly < game.moves.length) winning = [];
    }
  }

  board.classList.toggle("selectable", canPlace());
  board.toggleAttribute("inert", !playing && !finished);
  for (const [index, cell] of cells.entries()) {
    const stone = displayedBoard[index];
    const isSelected = selected === index;
    const displayed = isSelected ? game.you : stone;
    cell.dataset.stone = stone;
    cell.classList.toggle("selected", isSelected);
    cell.classList.toggle("last", index === last);
    cell.classList.toggle("win", winning.includes(index));
    cell.firstElementChild.hidden = !displayed;
    cell.firstElementChild.className = "stone " + (displayed === 1 ? "black" : "white");
    cell.setAttribute("aria-label", t(["square", "blackSquare", "whiteSquare"][stone], { cell: coordinate(index) }));
    cell.setAttribute("aria-selected", String(isSelected));
    cell.setAttribute("aria-disabled", String(!canPlace() || Boolean(stone)));
  }
}

const version = window.NCQ?.NCQ_VERSION;
el("app-version").textContent = version ? "v" + version : "dev";

function applyState(next) {
  if (room?.code === next.code && next.version <= room.version) return;
  const showResult = next.phase === "finished" && (room?.phase !== "finished" || room.round !== next.round);
  room = next;
  turnDeadline = next.phase === "playing" && next.turnSeconds > 0
    && Number.isFinite(next.turnEndsAt) && Number.isFinite(next.serverNow)
    ? performance.now() + Math.max(0, next.turnEndsAt - next.serverNow) : null;
  selected = null;
  if (showResult) reviewPly = room.moves.length;
  if (room.phase !== "finished") el("result").close();
  if (room.phase !== "waiting") el("share").close();
  const roundKey = room.code + ":" + room.round;
  const metricKey = "matjjangomok.round";
  const tracked = sessionStorage.getItem(metricKey);
  if (room.phase === "playing" && tracked !== roundKey) {
    sessionStorage.setItem(metricKey, roundKey);
    window.NcqMetrics?.levelStart("online");
  }
  if (room.phase === "finished" && tracked === roundKey) {
    sessionStorage.removeItem(metricKey);
    window.NcqMetrics?.levelEnd("online", room.winner ? room.winner === room.you : undefined);
  }
  if (room.phase === "finished" && !backend) saveRecord(room);
  render();
  if (showResult) {
    el("result").showModal();
    render();
    refreshPlayerCard();
  }
}

function exitRoom(message = "") {
  stream?.close();
  stream = null;
  connected = false;
  el("result").close();
  el("share").close();
  room = null;
  turnDeadline = null;
  cancelAnimationFrame(turnFrame);
  selected = null;
  sessionStorage.removeItem("matjjangomok.round");
  const url = new URL(location.href);
  url.searchParams.delete("room");
  history.replaceState(null, "", url);
  feedback("lobby-error", message, Boolean(message));
  render();
  refreshLobby();
  refreshPlayerCard();
  el("start").focus();
}

async function send(path, data = {}) {
  try {
    const response = await fetch("./api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json();
    if (response.ok) return result;
    if (Object.hasOwn(TEXTS.en, result.error)) return { error: result.error };
  } catch {
    // Keep the room open if a temporary outage interrupts an action.
  }
  return { error: "network" };
}

async function getAuthConfig() {
  if (authConfig) return authConfig;
  const response = await fetch(backend ? "./ncq/auth-config.json" : "./api/auth/config",
    { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error();
  authConfig = await response.json();
  return authConfig;
}

async function openPlayerSession(force) {
  const config = await getAuthConfig();
  if (backend && !config.enabled) throw new Error();
  if (!config.enabled || (!force && authSession?.expiresAt > Date.now() + 30_000)) return;
  if (!window.NcqAuth) {
    window.NCQ = { ...window.NCQ, NCQ_AUTH: {
      url: config.url ?? location.origin, game: config.game, platform: config.platform,
      environment: config.environment, firebase: config.firebase,
    } };
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = backend ? "./ncq/auth-sdk.js" : "./api/auth/sdk";
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }
  if (backend) {
    const { player } = await window.NcqAuth.ready();
    authSession = { player, expiresAt: Infinity };
    recordsScope = recordsKey + ":" + player;
    return;
  }
  const { ticket } = await window.NcqAuth.request("/api/auth/session", "POST", {});
  const session = await send("/auth/claim", { ticket });
  if (!session.player) throw new Error();
  authSession = session;
  const scope = recordsKey + ":" + session.player;
  if (recordsScope !== scope) {
    recordsScope = scope;
    records = loadRecords();
  }
}

async function ensureIdentity(force = false) {
  authenticating ??= openPlayerSession(force).finally(() => { authenticating = null; });
  return authenticating;
}

async function post(path, data = {}, online) {
  if (backend) return remoteRequest(online);
  try {
    await ensureIdentity();
    const result = await send(path, data);
    if (result.error !== "authFailed" || !authConfig?.enabled) return result;
    await ensureIdentity(true);
    return send(path, data);
  } catch {
    return { error: "authFailed" };
  }
}

async function remoteRequest(action) {
  try {
    return await action(backend);
  } catch (error) {
    const code = error.status === 401 ? "authFailed" : error.code;
    return { error: Object.hasOwn(TEXTS.en, code) ? code : "network" };
  }
}

async function run(action, success) {
  if (busy) return;
  busy = true;
  const messageId = room ? "match-error" : "lobby-error";
  feedback(messageId);
  render();
  try {
    const result = await action();
    if (result.error) feedback(messageId, result.error, true);
    else success(result);
  } finally {
    busy = false;
    render();
  }
}

function openRoom(next) {
  recordsOpen = false;
  archive = null;
  const url = new URL(location.href);
  url.searchParams.set("room", next.code);
  history.replaceState(null, "", url);
  feedback("match-error");
  connected = true;
  applyState(next);
  el("status").focus();
  connectRoom(next.code);
}

function connectRoom(code) {
  if (backend) {
    let timer;
    const polling = { close: () => clearTimeout(timer) };
    stream = polling;
    async function refresh() {
      if (stream !== polling) return;
      const next = await remoteRequest(client => client.state(code));
      if (stream !== polling) return;
      if (["notFound", "forbidden", "authFailed"].includes(next.error)) {
        exitRoom(next.error === "authFailed" ? "authFailed" : "closed");
        return;
      }
      connected = !next.error;
      if (connected) applyState(next);
      render();
      timer = setTimeout(refresh, room?.phase === "finished" || document.hidden ? 2500 : 900);
    }
    refresh();
    return;
  }
  const events = new EventSource("./api/rooms/" + code + "/events");
  stream = events;
  events.addEventListener("state", event => {
    if (stream !== events) return;
    connected = true;
    applyState(JSON.parse(event.data));
    render();
  });
  events.addEventListener("closed", () => {
    if (stream === events) exitRoom("closed");
  });
  events.addEventListener("reauth", async () => {
    if (stream !== events) return;
    events.close();
    connected = false;
    render();
    try {
      await ensureIdentity(true);
      if (stream === events) connectRoom(code);
    } catch {
      if (stream === events) exitRoom("authFailed");
    }
  });
  events.onerror = () => {
    if (stream !== events) return;
    connected = false;
    selected = null;
    render();
  };
}

function roomAction(action, details, success = applyState) {
  if (!room) return;
  const { code, round } = room;
  const input = { round, ...details };
  run(() => post("/rooms/" + code + "/" + action, input, client => client[action](code, input)), next => {
    if (room?.code === code) success(next);
  });
}

function join(code) {
  run(() => post("/rooms/" + code + "/join", {}, client => client.join(code)), openRoom);
}

function closeMatching(message = "") {
  matchmaking = null;
  el("matchmaking").close();
  feedback("lobby-error", message, Boolean(message));
  render();
  el("start").focus();
}

async function cancelMatching(job) {
  if (job.ticket) await post("/matchmaking/cancel", { ticket: job.ticket }, client => client.cancel(job.ticket));
  closeMatching();
}

async function findMatch(job) {
  job.pending = true;
  const input = { ticket: job.ticket, mode: job.mode };
  const result = await post("/matchmaking", input, client => client.match(input));
  job.pending = false;
  job.ticket = result.ticket ?? job.ticket;
  if (job.canceled) return cancelMatching(job);
  if (result.error) {
    closeMatching(result.error);
  } else if (result.game) {
    closeMatching();
    openRoom(result.game);
  } else {
    job.timer = setTimeout(() => findMatch(job), job.mode === "tournament" ? 1250 : 650);
  }
}

function requestCancel() {
  const job = matchmaking;
  if (!job || job.canceled) return;
  job.canceled = true;
  clearTimeout(job.timer);
  render();
  if (!job.pending) cancelMatching(job);
}

function startMatching(mode) {
  if (matchmaking) return;
  const job = { canceled: false, mode };
  matchmaking = job;
  feedback("lobby-error");
  render();
  el("matchmaking").showModal();
  findMatch(job);
}

el("start").addEventListener("click", () => startMatching("casual"));
el("cancel-match").addEventListener("click", requestCancel);
el("matchmaking").addEventListener("cancel", event => {
  event.preventDefault();
  requestCancel();
});

function openArchive(record) {
  archive = { ...record, phase: "finished" };
  reviewPly = record.moves.length;
  feedback("match-error");
  render();
  el("status").focus();
}

el("show-records").addEventListener("click", () => run(async () => {
  if (backend) {
    const result = await remoteRequest(client => client.records());
    if (Array.isArray(result)) {
      const device = [...loadRecords(), ...loadRecords(recordsKey)].map(game => [game.id, { ...game, device: true }]);
      const combined = new Map([...device, ...result.map(game => [game.id, game])]);
      records = [...combined.values()].sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));
    }
    return Array.isArray(result) ? {} : result;
  }
  try {
    await ensureIdentity();
    return {};
  } catch {
    return { error: "authFailed" };
  }
}, () => {
  recordsOpen = true;
  render();
  el("records-heading").focus();
}));
el("show-tournament").addEventListener("click", () => run(async () => {
  const result = await remoteRequest(client => client.tournament());
  if (!result.error) tournament = result;
  return result;
}, () => {
  renderTournament();
  el("tournament").showModal();
  render();
}));
el("tournament").addEventListener("close", render);
el("join-tournament").addEventListener("click", () => {
  el("tournament").close();
  startMatching("tournament");
});

function renderTournament() {
  if (!tournament) return;
  const date = value => NcqLang.date(value, { month: "short", day: "numeric", timeZone: "Asia/Seoul" });
  el("tournament-dates").textContent = date(tournament.startsAt) + " – " + date(tournament.endsAt);
  el("rank-empty").hidden = tournament.standings.length > 0;
  el("standings").replaceChildren(...tournament.standings.map(row => entryRow(
    row, row.rank + ". " + (row.you ? t("you") : t("playerAlias", { alias: row.alias })),
    t("pointsCount", { n: row.points }),
  )));
}
el("close-records").addEventListener("click", () => {
  recordsOpen = false;
  render();
  refreshLobby();
  el("show-records").focus();
});
el("leave").addEventListener("click", () => {
  if (archive) {
    archive = null;
    render();
    el("records-heading").focus();
    return;
  }
  if (window.confirm(t("confirmLeave"))) roomAction("leave", {}, () => exitRoom());
});
el("place").addEventListener("click", () => {
  if (canPlace() && selected !== null) roomAction("move", { index: selected, version: room.version });
});
el("rematch").addEventListener("click", () => roomAction("rematch", {}));
el("review").addEventListener("click", event => {
  const step = event.target.closest("[data-step]")?.dataset.step;
  const game = room ?? archive;
  if (!step || game?.phase !== "finished") return;
  const last = game.moves.length;
  const destination = { first: 0, previous: reviewPly - 1, next: reviewPly + 1, last };
  reviewPly = Math.max(0, Math.min(last, destination[step]));
  render();
  if (event.target.disabled) {
    el("review").querySelector(reviewPly ? '[data-step="previous"]' : '[data-step="next"]').focus();
  }
});
el("result").addEventListener("close", () => {
  render();
  if (room?.phase === "finished") el("review").querySelector('[data-step="previous"]').focus();
});
el("share").addEventListener("close", render);
el("invite").addEventListener("click", async () => {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", room.code);
  try {
    await navigator.clipboard.writeText(url.href);
    feedback("match-error", "copied");
  } catch {
    el("share-url").value = url.href;
    el("share").showModal();
    render();
    el("share-url").select();
  }
});

function focusCell(index) {
  cells[focused].tabIndex = -1;
  focused = index;
  cells[focused].tabIndex = 0;
  cells[focused].focus({ preventScroll: true });
}

board.addEventListener("click", event => {
  const cell = event.target.closest(".cell");
  if (!cell || !canPlace()) return;
  const index = Number(cell.dataset.index);
  if (room.board[index]) return;
  selected = index;
  focusCell(index);
  feedback("match-error");
  render();
});

board.addEventListener("keydown", event => {
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -size, ArrowDown: size };
  const offset = offsets[event.key];
  if (!offset) return;
  event.preventDefault();
  const next = focused + offset;
  if (next < 0 || next >= cells.length) return;
  if (Math.abs(offset) === 1 && Math.floor(next / size) !== Math.floor(focused / size)) return;
  focusCell(next);
});

try {
  const config = await (await fetch("./ncq/board-config.json", { signal: AbortSignal.timeout(3500) })).json();
  if (config.enabled !== false &&
      /^https:\/\/[a-z0-9]{20}\.supabase\.co\/functions\/v1\/ncq-board\/matjjangomok$/.test(config.apiUrl)) {
    backend = NcqBoard.create({
      apiUrl: config.apiUrl,
      async getToken({ forceRefresh }) {
        await ensureIdentity();
        return window.NcqAuth.getToken({ forceRefresh, expectedPlayer: authSession.player });
      },
    });
  }
} catch {
  // Local copies can run without a kickoff profile.
}
const inviteCode = new URL(location.href).searchParams.get("room") ?? "";
if (backend ? /^[\da-f-]{36}$/.test(inviteCode) : /^[A-Z2-9]{6}$/i.test(inviteCode)) {
  join(backend ? inviteCode : inviteCode.toUpperCase());
}
render();
refreshLobby();
el("player-photo").addEventListener("load", () => { el("player-photo").hidden = false; });
el("player-photo").addEventListener("error", () => { el("player-photo").hidden = true; });
refreshPlayerCard();
document.addEventListener("visibilitychange", refreshLobby);
setInterval(refreshLobby, 2500);
