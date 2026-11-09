import { NcqLang } from "./ncq/lang.js";
import { NcqBoard } from "./ncq/board.js?v=e53e965e0789";
import { TEXTS } from "./texts.js?v=e53e965e0789";
import { forbiddenAt, hasForbiddenMoves } from "./ncq/position.js?v=e53e965e0789";
import { mayOffer, maySwap, offerCount, openingError, openingRadius } from "./ncq/taraguchi.js?v=e53e965e0789";

NcqLang.init({ id: "matjjangomok", texts: TEXTS });
const t = NcqLang.t;
const el = id => document.getElementById(id);
const size = 15;
const columns = "ABCDEFGHJKLMNOP";
const recordsKey = "matjjangomok.records";
const appearanceKey = "matjjangomok.appearance";
const nicknameKey = "matjjangomok.nickname";
const stoneSoundKey = "matjjangomok.stoneSound";
const appearance = loadAppearance();
const board = el("board");
const boardGrid = el("board-grid");
const lastMoveMarker = el("last-move-marker");
const ownClock = el("own-clock");
const opponentClock = el("opponent-clock");
const ownProgress = el("own-progress");
const opponentProgress = el("opponent-progress");
const cells = [];
let focused = 112;
let selected = null;
let room = null;
let stream = null;
let connected = false;
let busy = false;
let reviewPly = 0;
let archive = null;
let spectator = null;
let lobbyView = "lobby";
let recordsScope = recordsKey;
let records = loadRecords();
let recordFilter = "all";
let favoritesScope;
let favorites = new Set();
let recordShareTarget = null;
let liveGames = null;
let lobbyUnavailable = false;
let lobbyLoading = false;
let playerStats = null;
let playerPhoto = null;
let playerNickname = "";
let nicknameOverride = "";
let profileLoading = false;
let profileTarget = null;
let matchmaking = null;
const ruleNames = { renju: "ruleRenju", free: "ruleFree", taraguchi: "ruleTaraguchi" };
const defaultRule = "renju";
const ruleDialog = el("rule-dialog");
let availableRules = Object.keys(ruleNames);
let preferredRule = defaultRule;
try { preferredRule = localStorage.getItem("matjjangomok.rule") ?? defaultRule; } catch {}
const placementLimits = new WeakMap();
let matchIntro = null;
let authConfig;
let authSession;
let authenticating;
let backend;
let boardApiUrl;
let tournament;
let turnDeadline = null;
let turnFrame = 0;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let placementAudio;
let placementBuffer;
let activePlacementSound;
let placementSoundCue = 0;
let activePlacement;

const gaugeObserver = new ResizeObserver(entries => {
  const inset = 4;
  for (const { target, contentRect: { width, height } } of entries) {
    if (height <= 2 * inset || width < height) continue;
    const right = width - inset;
    const bottom = height - inset;
    const radius = height / 2 - inset;
    target.querySelector("path").setAttribute("d",
      `M ${width / 2} ${inset} H ${right - radius}
       A ${radius} ${radius} 0 0 1 ${right - radius} ${bottom} H ${inset + radius}
       A ${radius} ${radius} 0 0 1 ${inset + radius} ${inset} Z`);
  }
});
for (const id of ["place-gauge", "opponent-gauge"]) gaugeObserver.observe(el(id));

applyAppearance();
const options = el("options");
const profileDialog = el("player-profile");
const nicknameEdit = el("profile-nickname-edit");
const nicknameEditor = el("profile-nickname-editor");
const nicknameInput = el("nickname");
const matchIntroDialog = el("match-intro");
const playerPhotos = ["player-photo", "match-player-photo", "match-intro-photo"].map(el);
matchIntroDialog.addEventListener("close", () => {
  if (matchIntroDialog.open) return;
  clearTimeout(matchIntro?.timer);
  matchIntro = null;
  render();
});
el("player-card").addEventListener("click", () => openPlayerProfile());
el("own-profile").addEventListener("click", () => openPlayerProfile(room.you));
el("opponent-profile").addEventListener("click", () => openPlayerProfile(3 - room.you));
el("black-profile").addEventListener("click", () => openPlayerProfile(1));
el("white-profile").addEventListener("click", () => openPlayerProfile(2));
el("review-opponent-profile").addEventListener("click", () => openPlayerProfile(3 - (room ?? archive).you));
el("review-own-profile").addEventListener("click", () => openPlayerProfile((room ?? archive).you));
profileDialog.addEventListener("close", () => {
  if (!profileDialog.open) {
    profileTarget = null;
    nicknameEditor.hidden = true;
    nicknameEdit.setAttribute("aria-expanded", "false");
  }
  render();
});
profileDialog.querySelector(".profile-close").addEventListener("click", () => profileDialog.close());
nicknameEdit.addEventListener("click", () => {
  const opening = nicknameEditor.hidden;
  nicknameEditor.hidden = !opening;
  nicknameEdit.setAttribute("aria-expanded", String(opening));
  if (!opening) return;
  nicknameInput.value = nicknameOverride;
  nicknameInput.focus();
  nicknameInput.select();
});
profileDialog.querySelector("form").addEventListener("submit", () => {
  if (!profileTarget?.own || nicknameEditor.hidden) return;
  nicknameOverride = nicknameInput.value.trim();
  try { localStorage.setItem(nicknameKey, nicknameOverride); } catch { }
});
el("profile-rankings").addEventListener("click", () => {
  profileDialog.close();
  showRankings();
});
const stoneSoundToggle = el("stone-sound");
try { stoneSoundToggle.checked = localStorage.getItem(stoneSoundKey) !== "off"; } catch { }
stoneSoundToggle.addEventListener("change", () => {
  if (stoneSoundToggle.checked) unlockPlacementAudio();
  else stopPlacementSound();
  try { localStorage.setItem(stoneSoundKey, stoneSoundToggle.checked ? "on" : "off"); } catch { }
});
document.addEventListener("click", unlockPlacementAudio, { capture: true });
document.addEventListener("keydown", unlockPlacementAudio, { capture: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPlacementSound();
  else if (placementAudio) unlockPlacementAudio();
});
try {
  nicknameOverride = localStorage.getItem(nicknameKey)?.trim() ?? "";
} catch {
  // A nickname can still be set for this visit.
}
el("show-options").addEventListener("click", () => {
  options.showModal();
  render();
});
options.addEventListener("close", render);
for (const input of options.querySelectorAll("input[type=radio]")) {
  input.checked = appearance[input.name] === input.value;
  input.addEventListener("change", () => {
    if (!input.checked) return;
    appearance[input.name] = input.value;
    applyAppearance();
    try {
      localStorage.setItem(appearanceKey, JSON.stringify(appearance));
    } catch {
      // The selected style still applies for this visit.
    }
  });
}

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
  boardGrid.append(rowEl);
}

for (const language of NcqLang.list()) {
  el("language").add(new Option(language.name, language.code));
}
el("language").addEventListener("change", event => NcqLang.set(event.target.value));
NcqLang.onChange(render);

function loadAppearance() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(appearanceKey)); } catch { }
  return {
    stones: ["classic", "glossy", "gilded"].includes(saved?.stones) ? saved.stones : "reference",
    board: ["classic", "wood", "gilded"].includes(saved?.board) ? saved.board : "reference",
    grid: saved?.grid === "soft" ? "soft" : "engraved",
  };
}

function applyAppearance() {
  document.documentElement.dataset.stoneStyle = appearance.stones;
  document.documentElement.dataset.boardStyle = appearance.board;
  document.documentElement.dataset.gridStyle = appearance.grid;
}

function unlockPlacementAudio() {
  if (!stoneSoundToggle.checked || document.hidden) return;
  const Audio = window.AudioContext ?? window.webkitAudioContext;
  if (!Audio) return;
  try {
    placementAudio ??= new Audio();
    if (placementAudio.state !== "running") placementAudio.resume().catch(() => {});
    placementBuffer ??= fetch(new URL("./assets/match-ui/stone-on-wood.wav", import.meta.url))
      .then(response => {
        if (!response.ok) throw new Error("Placement sound unavailable");
        return response.arrayBuffer();
      })
      .then(data => placementAudio.decodeAudioData(data))
      .catch(() => {
        placementBuffer = null;
        return null;
      });
  } catch {
    // The board remains playable on browsers that disable sound.
  }
}

function stopPlacementSound() {
  placementSoundCue += 1;
  if (!activePlacementSound) return;
  activePlacementSound.stop();
  activePlacementSound = null;
}

async function playPlacementSound(delay) {
  if (!stoneSoundToggle.checked || document.hidden || !placementBuffer) return;
  const audio = placementAudio;
  const cue = placementSoundCue;
  const contact = audio.currentTime + delay;
  const buffer = await placementBuffer;
  if (!buffer || cue !== placementSoundCue || !stoneSoundToggle.checked || document.hidden || audio.state !== "running") return;
  if (audio.currentTime > contact + .1) return;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.destination);
  source.addEventListener("ended", () => {
    source.disconnect();
    if (activePlacementSound === source) activePlacementSound = null;
  }, { once: true });
  source.start(Math.max(contact, audio.currentTime));
  activePlacementSound = source;
}

function cancelPlacement() {
  stopPlacementSound();
  if (!activePlacement) return;
  const { cell, animation } = activePlacement;
  activePlacement = null;
  animation.cancel();
  cell.classList.remove("placing");
}

function presentPlacement(index) {
  if (index == null || document.hidden) return;
  cancelPlacement();
  if (reducedMotion.matches) {
    playPlacementSound(0);
    return;
  }
  const cell = cells[index];
  cell.classList.add("placing");
  const animation = cell.firstElementChild.getAnimations().find(item => item.animationName === "stone-land");
  const duration = animation ? animation.effect.getTiming().duration : 0;
  playPlacementSound(duration * .6 / 1000);
  if (!animation) {
    cell.classList.remove("placing");
    return;
  }
  activePlacement = { cell, animation };
  return animation.finished.catch(() => {}).finally(() => {
    if (activePlacement?.animation !== animation) return;
    activePlacement = null;
    cell.classList.remove("placing");
  });
}

function coordinate(index) {
  return columns[index % size] + (Math.floor(index / size) + 1);
}

function canAct() {
  return room?.phase === "playing" && room.turn === room.you && connected && !busy
    && !matchIntroDialog.open && (turnDeadline === null || performance.now() < turnDeadline);
}

function activeRule() {
  if (availableRules.includes(preferredRule)) return preferredRule;
  return availableRules.includes(defaultRule) ? defaultRule : "free";
}

function moveLimits(game) {
  if (!placementLimits.has(game)) {
    const check = game.opening ? index => openingError(game, index)
      : hasForbiddenMoves(game.rule) && seatColor(game, game.you) === 1
        ? index => forbiddenAt(game.board, index, game.rule) : () => undefined;
    placementLimits.set(game, game.board.map((stone, index) => stone ? undefined : check(index)));
  }
  return placementLimits.get(game);
}

function openingStatus(game) {
  if (game.opening === "offerFive") return t("offerProgress", { n: game.offers.length, total: offerCount });
  if (game.opening === "pickFive") return t("pickFifth");
  const radius = openingRadius(game);
  const color = t(colorName(game.stone));
  return radius === null ? t("openingStone", { color, n: game.moves.length + 1 })
    : t("openingInArea", { color, n: game.moves.length + 1, size: radius * 2 + 1 });
}

function seatColor(game, seat) {
  return seat === (game?.black ?? 1) ? 1 : 2;
}

function colorName(color) {
  return color === 1 ? "black" : "white";
}

function sideName(game, seat) {
  return t(colorName(seatColor(game, seat)));
}

function matchMode(game) {
  return game.mode === "tournament" ? "weeklyTournament" : ruleNames[game.rule] ?? "onlineMatch";
}

function moveColor(game, ply) {
  return game.moveColors?.[ply] ?? ply % 2 + 1;
}

function updateTurnClock(now) {
  const remaining = Math.max(0, turnDeadline - now);
  const ownTurn = room.turn === room.you;
  const activeClock = ownTurn ? ownClock : opponentClock;
  const progress = ownTurn ? ownProgress : opponentProgress;
  const seconds = String(Math.ceil(remaining / 1000)).padStart(2, "0");
  if (activeClock.textContent !== seconds) {
    activeClock.textContent = seconds;
    if (!reducedMotion.matches) activeClock.animate([
      { opacity: .55, transform: "translateY(-3px) scale(1.12)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ], { duration: 190, easing: "ease-out" });
  }
  const percent = Math.min(100, remaining / (room.turnSeconds * 1000) * 100);
  progress.style.setProperty("--match-art-progress", percent.toFixed(2));
  progress.toggleAttribute("data-empty", remaining === 0);
  if (remaining > 0) turnFrame = requestAnimationFrame(updateTurnClock);
  else {
    el("place").disabled = true;
    board.classList.remove("selectable");
    for (const cell of cells) cell.setAttribute("aria-disabled", "true");
  }
}

function ownNickname() {
  return nicknameOverride || playerNickname || t("guestNickname");
}

function renderPlayers(game, playing, watching = false) {
  cancelAnimationFrame(turnFrame);
  for (const id of ["opponent-panel", "own-panel", "live-actions"]) el(id).hidden = !playing;
  const reviewing = !watching && game.phase === "finished";
  el("player-bar").hidden = playing || reviewing;
  if (reviewing) return;
  if (!playing) {
    for (const [color, seat] of [["black", 1], ["white", 2]]) {
      el(color + "-player-label").textContent = watching ? t(color) : game.you === seat ? ownNickname() : t("opponent");
      el(color + "-profile").disabled = watching || (game.phase === "waiting" && game.you !== seat);
    }
    return;
  }

  const nickname = ownNickname();
  const timed = turnDeadline !== null;
  const ownTurn = game.turn === game.you;
  const opponentTurn = !ownTurn;
  el("own-panel").dataset.active = el("place").dataset.active = String(ownTurn);
  el("opponent-panel").dataset.active = el("opponent-timer").dataset.active = String(opponentTurn);
  el("opponent-turn").textContent = t(opponentTurn ? "turnActive" : "turnWaiting");
  el("own-nickname").textContent = nickname;
  el("own-nickname").title = nickname;
  renderOwnRank();
  const opponentRank = el("opponent-rank");
  opponentRank.hidden = game.botLevel == null;
  if (!opponentRank.hidden) opponentRank.textContent = rankName(game.botLevel);
  for (const [side, seat] of [["own", game.you], ["opponent", 3 - game.you]]) {
    const color = colorName(seatColor(game, seat));
    const stone = el(side + "-stone");
    stone.className = "stone " + color;
    stone.setAttribute("aria-label", t(color));
  }
  for (const id of ["place-gauge", "opponent-gauge", "place-divider", "opponent-divider", "own-clock", "opponent-clock"]) {
    el(id).toggleAttribute("hidden", !timed);
  }
  if (!timed) return;

  const idleClock = ownTurn ? opponentClock : ownClock;
  const idleProgress = ownTurn ? opponentProgress : ownProgress;
  idleClock.getAnimations().forEach(animation => animation.cancel());
  idleClock.textContent = String(Math.ceil(game.turnSeconds)).padStart(2, "0");
  idleProgress.style.removeProperty("--match-art-progress");
  idleProgress.removeAttribute("data-empty");
  updateTurnClock(performance.now());
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
  const { number, round, moves, winner, line, you, finishedAt, endReason, players, bot, mode, rule, black, moveColors } = game;
  existing.set(id, { id, number, round, moves, winner, line, you, finishedAt, endReason, players, bot, mode, rule, black, moveColors });
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

function recordResult(game) {
  if (!game.winner) return t("draw");
  const reason = game.endReason;
  const outcome = reason === "disconnect" ? "recordDisconnectWin"
    : reason === "timeout" ? "recordTimeWin"
    : reason === "resign" || game.actions?.some(action => action.type === "resign") ? "recordResignWin"
    : reason === "win" || game.line?.length >= 5 ? "recordWin" : "recordUnknownWin";
  return t(outcome, { color: sideName(game, game.winner) });
}

function recordPlayer(game, seat) {
  const profile = game.players?.find(player => player.seat === seat);
  const bot = profile?.bot || (game.bot && seat !== game.you);
  const savedName = profile?.nickname || (profile?.guestCode ? t("recordGuest", { code: profile.guestCode }) : "");
  return { ...profile, savedName, name: savedName || t(bot ? "recordBot" : seat === game.you ? "you" : "opponent") };
}

function recordPhoto(profile) {
  return typeof profile?.photoUrl === "string" && /^https:\/\//i.test(profile.photoUrl) ? profile.photoUrl : "";
}

function recordRank(profile) {
  return Number.isInteger(profile.rating) ? rankName(rankLevel(profile.rating)) : "";
}

function setRecordPhoto(image, profile) {
  const url = recordPhoto(profile);
  if (image.getAttribute("src") === (url || null)) return;
  image.hidden = !url;
  if (url) image.src = url;
  else image.removeAttribute("src");
}

function recordFavorites() {
  const key = recordsScope + ".favorites";
  if (favoritesScope !== key) {
    favoritesScope = key;
    favorites = new Set();
    try {
      const ids = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(ids)) favorites = new Set(ids);
    } catch {
      // Favorites can still be used for this visit.
    }
  }
  return favorites;
}

function toggleFavorite(id) {
  const saved = recordFavorites();
  const active = !saved.has(id);
  if (active) saved.add(id);
  else saved.delete(id);
  try { localStorage.setItem(favoritesScope, JSON.stringify([...saved])); } catch {}
  return active;
}

function markFavorite(button, active) {
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute("aria-label", t("recordFavorite"));
}

const recordTokenPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/;
const recordShareDialog = el("record-share-dialog");

function recordVisibilityPath(game) {
  const code = game.code ?? game.id?.split(":")[0];
  if (!backend || game.device || !recordTokenPattern.test(code) || !Number.isInteger(game.round)) return null;
  return "/records/" + code + "/" + game.round + "/visibility";
}

function recordShareUrl(shareId) {
  const url = new URL("https://ncroquis.github.io/matjjangomok/play/");
  url.hash = "record=" + shareId;
  return url.href;
}

function renderRecordSharing() {
  if (!recordShareDialog.open || !recordShareTarget) return;
  const { path, shareId, loading, updating, ready } = recordShareTarget;
  el("record-share-note").textContent = t(shareId ? "recordShareNote" : "recordSharePrivateNote");
  el("record-link-panel").hidden = !shareId || loading;
  const link = el("record-link");
  const url = shareId ? recordShareUrl(shareId) : "";
  if (link.value !== url) link.value = url;
  el("record-copy-link").disabled = updating;
  const toggle = el("record-visibility-toggle");
  toggle.hidden = !path || !ready;
  toggle.disabled = updating;
  toggle.textContent = t(shareId ? "recordMakePrivate" : "recordMakePublic");
  el("record-share-close").disabled = updating;
  const status = el("record-share-feedback");
  if (!status.hidden) status.textContent = t(status.dataset.message);
}

async function openRecordSharing(game) {
  if (!game || recordShareDialog.open) return;
  const path = game.sharedView ? null : recordVisibilityPath(game);
  if (!path && !game.sharedView) return;
  const target = { game, path, shareId: game.sharedView ? game.shareId : null, loading: Boolean(path), ready: false };
  recordShareTarget = target;
  feedback("record-share-feedback", path ? "recordShareLoading" : "");
  recordShareDialog.showModal();
  render();
  if (!path) return;
  const result = await remoteRequest(client => client.gameRequest(path));
  if (recordShareTarget !== target || !recordShareDialog.open) return;
  target.loading = false;
  if (result.error) {
    feedback("record-share-feedback", "recordShareFailed", true);
  } else {
    target.ready = true;
    updateRecordShare(target, result.shareId);
    feedback("record-share-feedback");
  }
  render();
}

function updateRecordShare(target, shareId) {
  target.shareId = target.game.shareId = shareId;
  const id = target.game.code ? target.game.code + ":" + target.game.round : target.game.id;
  const record = records.find(item => item.id === id);
  if (record) record.shareId = shareId;
}

async function toggleRecordVisibility() {
  const target = recordShareTarget;
  if (!target?.ready || target.updating) return;
  target.updating = true;
  const makePublic = !target.shareId;
  feedback("record-share-feedback", "recordShareSaving");
  renderRecordSharing();
  const result = await remoteRequest(client => client.gameRequest(target.path, { public: makePublic }));
  target.updating = false;
  if (!result.error) updateRecordShare(target, result.shareId);
  if (recordShareTarget !== target || !recordShareDialog.open) return;
  if (result.error) {
    feedback("record-share-feedback", "recordShareFailed", true);
  } else {
    feedback("record-share-feedback", result.shareId ? "" : "recordMadePrivate");
  }
  render();
  el(result.shareId ? "record-copy-link" : "record-visibility-toggle").focus();
}

el("record-visibility-toggle").addEventListener("click", toggleRecordVisibility);
el("review-share").addEventListener("click", () => openRecordSharing(room ?? archive));
el("record-copy-link").addEventListener("click", async () => {
  const input = el("record-link");
  const target = recordShareTarget;
  try {
    await navigator.clipboard.writeText(input.value);
    if (recordShareDialog.open && recordShareTarget === target) feedback("record-share-feedback", "recordLinkCopied");
  } catch {
    if (!recordShareDialog.open || recordShareTarget !== target) return;
    input.focus();
    input.select();
    feedback("record-share-feedback", "recordCopyManually");
  }
});
recordShareDialog.addEventListener("cancel", event => {
  if (recordShareTarget?.updating) event.preventDefault();
});
recordShareDialog.addEventListener("close", () => {
  if (recordShareDialog.open) return;
  const game = recordShareTarget?.game;
  recordShareTarget = null;
  render();
  if (!el("review-header").hidden) el("review-share").focus();
  else if (game && !el("records").hidden) {
    const row = Array.from(el("record-list").children).find(item => item.dataset.recordId === game.id);
    (row?.querySelector(".record-visibility") ?? el("records-heading")).focus();
  }
});

function renderReview(game) {
  const nextColor = reviewPly < game.moves.length ? moveColor(game, reviewPly) : null;
  for (const [side, seat] of [["opponent", 3 - game.you], ["own", game.you]]) {
    const stone = seatColor(game, seat);
    const color = colorName(stone);
    const profile = recordPlayer(game, seat);
    const prefix = "review-" + side + "-";
    const label = el(prefix + "name");
    label.textContent = label.title = game.sharedView ? t(color) : profile.name;
    const seatLabel = el(prefix + "seat");
    seatLabel.hidden = Boolean(game.sharedView);
    seatLabel.textContent = [t(side === "own" ? "you" : "opponent"), t(color), recordRank(profile)].filter(Boolean).join(" · ");
    el(prefix + "stone").className = "stone " + color;
    setRecordPhoto(el(prefix + "photo"), profile);
    const active = nextColor === stone;
    const card = el(prefix + "profile");
    card.disabled = Boolean(game.sharedView);
    card.toggleAttribute("data-turn", active);
    const turn = el(prefix + "turn");
    turn.hidden = !active;
    if (active) turn.textContent = t("watchTurn", { color: t(color) });
  }
  const id = archive ? game.id : game.id + ":" + game.round;
  const favorite = el("review-favorite");
  favorite.hidden = Boolean(game.sharedView);
  favorite.dataset.recordId = id;
  markFavorite(favorite, recordFavorites().has(id));
  el("review-share").hidden = !game.sharedView && !recordVisibilityPath(game);
  const winner = game.winner && recordPlayer(game, game.winner).savedName;
  el("review-result").textContent = winner ? t("recordNamedResult", { name: winner, result: recordResult(game) }) : recordResult(game);
  el("review-mode").textContent = t(game.mode !== "tournament" && game.bot && !game.rule ? "recordBotMatch" : matchMode(game));
}

function entryRow(label, note, onOpen) {
  const row = document.createElement("li");
  row.className = "entry-row";
  const body = document.createElement(onOpen ? "button" : "div");
  body.className = "entry-body";
  const name = document.createElement("strong");
  name.textContent = label;
  const detail = document.createElement("span");
  detail.textContent = note;
  body.append(name, detail);
  if (onOpen) {
    body.type = "button";
    body.addEventListener("click", onOpen);
  }
  row.append(body);
  return row;
}

function renderLobby() {
  renderPlayerCard();
  const count = el("live-count");
  count.hidden = lobbyUnavailable || !liveGames;
  count.textContent = t("liveCount", { n: liveGames?.length ?? 0 });
  const message = lobbyUnavailable ? "liveUnavailable" : liveGames ? "noLiveGames" : "liveLoading";
  el("live-message").textContent = t(message);
  el("live-message").hidden = !lobbyUnavailable && Boolean(liveGames?.length);
  const activeCode = document.activeElement?.dataset.watchCode;
  const entries = el("live-games");
  entries.replaceChildren(...(lobbyUnavailable ? [] : liveGames ?? []).map(game => {
    const moves = t("movesCount", { n: game.moves });
    const mode = t(game.rule === "taraguchi" ? "ruleTaraguchiShort" : matchMode(game));
    const label = mode + " #" + game.number;
    if (!game.code) return entryRow(label, moves);
    const row = entryRow(label, moves + " · " + t("spectate"), () => openSpectator(game.code));
    row.firstElementChild.dataset.watchCode = game.code;
    row.firstElementChild.disabled = busy;
    return row;
  }));
  if (activeCode && !busy) {
    const active = [...entries.querySelectorAll("button")].find(button => button.dataset.watchCode === activeCode);
    (active ?? el("lobby-heading")).focus({ preventScroll: true });
  }
}

function ratingNumber(value) {
  return new Intl.NumberFormat(NcqLang.lang).format(value);
}

// Match the thresholds used by the NcqBoard Omok bot rank migration.
const danMinimums = [2200, 2260, 2340, 2440, 2560, 2700, 2860, 3040, 3240];

function rankLevel(rating) {
  if (rating < 1520) return 0;
  if (rating < danMinimums[0]) return 1 + Math.floor((rating - 1520) / 40);
  const nextDan = danMinimums.findIndex(minimum => rating < minimum);
  return nextDan === -1 ? 26 : 17 + nextDan;
}

function rankMinimum(level) {
  return level < 18 ? 1520 + 40 * (level - 1) : danMinimums[level - 18];
}

function rankName(level) {
  return level < 18 ? t("rankKyu", { n: 18 - level }) : t("rankDan", { n: level - 17 });
}

function renderOwnRank() {
  const rating = backend ? playerStats?.rating : 1500;
  const rank = el("own-rank");
  rank.hidden = !Number.isFinite(rating);
  if (!rank.hidden) rank.textContent = rankName(rankLevel(rating));
}

function renderPlayerCard() {
  const name = ownNickname();
  el("lobby-player-name").textContent = name;
  el("lobby-player-name").title = name;
  el("player-career").hidden = !playerStats;
  if (!playerStats) return;
  el("player-record").textContent = t("careerRecord", playerStats);
  const { rating } = playerStats;
  const level = rankLevel(rating);
  el("player-rating").textContent = t("rankRating", { rank: rankName(level), rating: ratingNumber(rating) });
  const nextRank = nextRankText(level, rating);
  el("player-next-rank").hidden = !nextRank;
  el("player-next-rank").textContent = nextRank;
}

function nextRankText(level, rating) {
  if (level === 26) return "";
  return t("nextRank", {
    rank: rankName(level + 1), points: ratingNumber(rankMinimum(level + 1) - rating),
  });
}

function winRate({ wins, draws, losses }) {
  const total = wins + draws + losses;
  return total > 0
    ? new Intl.NumberFormat(NcqLang.lang, { style: "percent", maximumFractionDigits: 1 }).format(wins / total)
    : "—";
}

function renderPromotionMeter(meterId, prefix, rating, previousRating = rating) {
  const level = rankLevel(rating);
  const canDemote = level > 0;
  const canPromote = level < 26;
  const lower = canDemote ? rankMinimum(level) : 1500 - (rankMinimum(1) - 1500);
  const upper = canPromote ? rankMinimum(level + 1) : lower + (lower - rankMinimum(level - 1));
  const center = (lower + upper) / 2;
  const position = score => Math.max(0, Math.min(100, 100 * (score - lower) / (upper - lower)));
  const signed = new Intl.NumberFormat(NcqLang.lang, { signDisplay: "exceptZero" });
  const value = signed.format(rating - center);
  const lowLabel = canDemote ? t("demotion") : t("lowestRank");
  const highLabel = canPromote ? t("promotion") : t("highestRank");
  const lowTick = canDemote ? signed.format(lower - center) : "—";
  const highTick = canPromote ? signed.format(upper - center) : "—";
  const meter = el(meterId);
  const from = position(previousRating);
  const to = position(rating);
  meter.style.setProperty("--promotion-position", `${to}%`);
  meter.style.setProperty("--promotion-start", `${from}%`);
  meter.style.setProperty("--promotion-fill", (to - 50) / 50);
  meter.style.setProperty("--promotion-fill-start", (from - 50) / 50);
  meter.setAttribute("aria-label", t("promotionMeter", { value, lowLabel, lowTick, highLabel, highTick }));
  el(`${prefix}-value`).textContent = value;
  el(`${prefix}-lower-label`).textContent = lowLabel;
  el(`${prefix}-upper-label`).textContent = highLabel;
  el(`${prefix}-lower`).textContent = lowTick;
  el(`${prefix}-upper`).textContent = highTick;
}

async function openPlayerProfile(seat) {
  const game = room ?? archive;
  const own = seat === undefined || seat === game?.you;
  const code = game?.code ?? game?.id?.split(":")[0];
  const online = Boolean(backend && !game?.device && /^[\da-f-]{36}$/.test(code ?? ""));
  const target = { own, seat, online, stats: null, loading: !own && online };
  profileTarget = target;
  renderPlayerProfile();
  profileDialog.showModal();
  render();
  if (own) {
    await refreshPlayerCard();
  } else if (online) {
    const stats = await getOpponentProfile(code, game.round);
    if (profileTarget !== target || !profileDialog.open) return;
    target.loading = false;
    if (!stats.error) target.stats = stats;
    renderPlayerProfile();
  }
}

function getOpponentProfile(code, round) {
  return remoteRequest(client => client.gameRequest(`/rooms/${code}/opponent-profile?round=${round}`));
}

function renderMatchIntro() {
  const { opponentRating, opponentLevel } = matchIntro;
  const ownRating = playerStats?.rating;
  el("match-intro-own-name").textContent = ownNickname();
  const level = Number.isFinite(opponentRating) ? rankLevel(opponentRating) : opponentLevel;
  const name = t("opponent");
  el("match-intro-opponent-name").textContent = level == null ? name : `${rankName(level)} ${name}`;
  for (const [id, rating] of [["match-intro-own-rating", ownRating], ["match-intro-opponent-rating", opponentRating]]) {
    const label = el(id);
    label.hidden = !Number.isFinite(rating);
    if (!label.hidden) label.textContent = t("matchIntroRating", { rating: ratingNumber(rating) });
  }

  const points = el("match-intro-points");
  points.hidden = !Number.isFinite(ownRating) || !Number.isFinite(opponentRating);
  if (points.hidden) return;
  const expected = 1 / (1 + 10 ** ((opponentRating - ownRating) / 400));
  const signed = new Intl.NumberFormat(NcqLang.lang, { signDisplay: "exceptZero" });
  el("match-intro-win").textContent = t("matchIntroWin", { points: signed.format(Math.round(32 * (1 - expected))) });
  el("match-intro-loss").textContent = t("matchIntroLoss", { points: signed.format(-Math.round(32 * expected)) });
}

async function openMatchIntro(game) {
  if (game.phase !== "playing") return;
  const intro = { opponentRating: null, opponentLevel: game.botLevel };
  matchIntro = intro;
  renderMatchIntro();
  matchIntroDialog.showModal();
  intro.timer = setTimeout(() => {
    if (matchIntro === intro && matchIntroDialog.open) matchIntroDialog.close();
  }, 5000);
  render();
  if (!backend) return;
  if (!playerStats) refreshPlayerCard();
  const stats = await getOpponentProfile(game.code, game.round);
  if (matchIntro !== intro || !matchIntroDialog.open || !Number.isFinite(stats?.rating)) return;
  intro.opponentRating = stats.rating;
  renderMatchIntro();
}

function renderPlayerProfile() {
  const { own, seat, online, loading, stats: opponentStats } = profileTarget;
  const stats = own ? playerStats : opponentStats;
  const game = room ?? archive;
  const saved = seat && game?.phase === "finished" ? recordPlayer(game, seat) : null;
  const name = saved?.savedName || (own ? ownNickname() : t("opponent"));
  const title = el("player-profile-title");
  const status = el("profile-status");
  const photo = el("profile-photo");
  const source = recordPhoto(saved) || (own ? playerPhoto : null);
  if (photo.getAttribute("src") !== source) {
    photo.hidden = true;
    if (source) photo.src = source;
    else photo.removeAttribute("src");
  }
  el("profile-stone").className = "stone " + colorName(seatColor(game, seat));
  nicknameEdit.hidden = !own;
  el("profile-rating-section").hidden = el("profile-records").hidden = !stats;
  const showStanding = own && stats && Object.hasOwn(stats, "ratingRank");
  el("profile-rating-standing-row").hidden = !showStanding;
  el("profile-rankings").hidden = !own || !backend || Boolean(room ?? archive);
  el("profile-promotion").hidden = !own || !stats;
  status.hidden = Boolean(stats);
  if (!stats) {
    title.textContent = name;
    status.textContent = t(own
      ? (!backend ? "profileOffline" : profileLoading ? "profileLoading" : "profileUnavailable")
      : (!online ? "opponentProfileOffline" : loading ? "opponentProfileLoading" : "opponentProfileUnavailable"));
    return;
  }

  const { rating, rankRecord } = stats;
  const level = rankLevel(rating);
  title.textContent = rankName(level) + " " + name;
  el("profile-rating").textContent = t("profileRatingValue", { rating: ratingNumber(rating) });
  if (showStanding) {
    const { ratingRank } = stats;
    el("profile-rating-standing").textContent = ratingRank
      ? t("profileRatingStandingValue", {
        position: ratingNumber(ratingRank.position), players: ratingNumber(ratingRank.players),
      })
      : t("profileRatingStandingPending");
  }
  const nextRank = nextRankText(level, rating);
  el("profile-next-rank").textContent = nextRank;
  el("profile-next-rank").hidden = !nextRank;
  el("profile-record").textContent = t("careerRecord", stats);
  el("profile-win-rate").textContent = winRate(stats);
  el("profile-rank-record-row").hidden = !rankRecord;
  if (rankRecord) {
    el("profile-rank-record").textContent = t("careerRecord", rankRecord);
    el("profile-rank-win-rate").textContent = t("currentRankWinRate", { rate: winRate(rankRecord) });
  }
  if (own) renderPromotionMeter("profile-promotion-meter", "promotion", rating);
}

async function refreshPlayerCard() {
  if (!backend || profileLoading) return;
  profileLoading = true;
  if (profileDialog.open) renderPlayerProfile();
  try {
    const stats = await remoteRequest(client => client.profile());
    if (!stats.error) {
      playerStats = stats;
      renderPlayerCard();
      renderOwnRank();
    }
    await refreshAuthProfile();
  } finally {
    profileLoading = false;
    if (profileDialog.open) renderPlayerProfile();
    if (matchIntroDialog.open) renderMatchIntro();
  }
}

async function refreshAuthProfile() {
  const profile = await window.NcqAuth?.profile?.().catch(() => null);
  if (!profile) return;
  const photo = profile.photoUrl ?? null;
  if (photo !== playerPhoto) {
    playerPhoto = photo;
    for (const image of playerPhotos) {
      image.hidden = true;
      if (photo) image.src = photo;
      else image.removeAttribute("src");
    }
  }
  const nickname = typeof profile.nickname === "string" ? profile.nickname.trim() : "";
  if (nickname !== playerNickname) {
    playerNickname = nickname;
    render();
  }
}

function recordDate(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value)) / 60_000));
  if (minutes < 7 * 24 * 60 && typeof Intl.RelativeTimeFormat === "function") {
    const format = new Intl.RelativeTimeFormat(NcqLang.lang, { numeric: "auto" });
    if (minutes < 60) return format.format(-minutes, "minute");
    if (minutes < 24 * 60) return format.format(-Math.floor(minutes / 60), "hour");
    return format.format(-Math.floor(minutes / (24 * 60)), "day");
  }
  return NcqLang.date(value, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function drawRecordPreview(svg, game) {
  const { moves } = game;
  const stones = document.createDocumentFragment();
  for (const [ply, cell] of moves.entries()) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= size * size) continue;
    const stone = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    stone.setAttribute("cx", cell % size + .5);
    stone.setAttribute("cy", Math.floor(cell / size) + .5);
    stone.setAttribute("r", ".42");
    stone.setAttribute("class", "preview-" + colorName(moveColor(game, ply)));
    stones.append(stone);
  }
  svg.append(stones);
}

function recordCard(game, saved) {
  const row = el("record-row").content.firstElementChild.cloneNode(true);
  row.dataset.recordId = game.id;
  const opponent = recordPlayer(game, 3 - game.you);
  const own = recordPlayer(game, game.you);
  const outcome = describeOutcome(game);
  const avatar = row.querySelector("img");
  avatar.addEventListener("error", () => { avatar.hidden = true; });
  setRecordPhoto(avatar, opponent);
  row.querySelector(".record-opponent").textContent = t("recordVersus", {
    name: [recordRank(opponent), opponent.name].filter(Boolean).join(" "),
  });
  const badge = row.querySelector(".record-outcome");
  badge.dataset.outcome = outcome;
  badge.textContent = t({ won: "winBadge", lost: "lossBadge", draw: "drawBadge" }[outcome]);
  row.querySelector(".record-summary").textContent = recordDate(game.finishedAt) + " · " + recordResult(game);
  const context = [recordRank(own), own.name].filter(Boolean).join(" ");
  row.querySelector(".record-context").textContent = context + (game.device ? " · " + t("deviceRecord") : "");
  drawRecordPreview(row.querySelector(".record-preview svg"), game);
  row.querySelector(".record-open").addEventListener("click", () => openArchive(game));
  const button = row.querySelector(".record-favorite");
  markFavorite(button, saved);
  button.addEventListener("click", () => {
    const active = toggleFavorite(game.id);
    if (recordFilter === "favorites") {
      renderRecords();
      el("record-filters").querySelector('[data-filter="favorites"]').focus();
    } else {
      markFavorite(button, active);
    }
  });
  const visibility = row.querySelector(".record-visibility");
  visibility.hidden = !recordVisibilityPath(game);
  visibility.textContent = t(game.shareId ? "recordPublic" : "recordPrivate");
  visibility.toggleAttribute("data-public", Boolean(game.shareId));
  visibility.addEventListener("click", () => openRecordSharing(game));
  return row;
}

function renderRecords() {
  const saved = recordFavorites();
  const visible = records.filter(game => recordFilter === "all" ||
    (recordFilter === "favorites" ? saved.has(game.id) : describeOutcome(game) === "won"));
  for (const button of el("record-filters").querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === recordFilter));
  }
  const empty = el("records-empty");
  empty.hidden = visible.length > 0;
  empty.textContent = t({ all: "noRecords", favorites: "recordNoFavorites", wins: "recordNoWins" }[recordFilter]);
  el("record-list").replaceChildren(...visible.map(game => recordCard(game, saved.has(game.id))));
}

async function refreshLobby() {
  if (room || archive || spectator || lobbyView !== "lobby" || lobbyLoading || document.hidden) return;
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

function renderResult(game) {
  const outcome = describeOutcome(game);
  const medals = { won: ["victoryMedal", "nav-ranking"], lost: ["defeatMedal", "result-loss-icon"],
    draw: ["drawMedal", "result-draw-icon"] };
  const [label, icon] = medals[outcome];
  el("result").dataset.outcome = outcome;
  el("result-title").textContent = t(label);
  el("result-symbol").setAttribute("href", `#${icon}`);
  const timeout = game.endReason === "timeout";
  el("result-summary").textContent = game.winner && !timeout ? recordResult(game) : t(timeout ? "resultTimeout" : "resultDraw", {
    color: sideName(game, 3 - game.winner), n: game.moves.length,
  });
  const change = game.ratingChange;
  el("result-rating").hidden = el("result-rating-change").hidden = !change;
  if (!change) return;

  const { before, after, delta } = change;
  const beforeLevel = rankLevel(before);
  const afterLevel = rankLevel(after);
  const rank = rankName(afterLevel);
  const rankLabel = beforeLevel === afterLevel ? rank : t(afterLevel > beforeLevel ? "rankUp" : "rankDown", { rank });
  el("result-rank").textContent = rankLabel;
  el("rating-range").textContent = `${ratingNumber(before)} → ${ratingNumber(after)}`;
  const signed = new Intl.NumberFormat(NcqLang.lang, { signDisplay: "exceptZero" });
  const deltaText = el("rating-delta");
  deltaText.textContent = t("profileRatingValue", { rating: signed.format(delta) });
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "same";
  deltaText.dataset.direction = el("result-promotion-meter").dataset.direction = direction;
  renderPromotionMeter("result-promotion-meter", "result-promotion", after, before);
}

function render() {
  if (profileDialog.open) renderPlayerProfile();
  renderRecordSharing();
  if (matchIntroDialog.open) renderMatchIntro();
  const game = room ?? archive ?? spectator?.game;
  const playing = !spectator && game?.phase === "playing";
  const finished = !spectator && game?.phase === "finished";
  nicknameInput.placeholder = playerNickname || t("guestNickname");
  el("language").value = NcqLang.lang;
  document.title = t("title");
  document.body.classList.toggle("in-match", Boolean(game));
  document.body.classList.toggle("match-art-backdrop", playing);
  document.body.classList.toggle("spectating", Boolean(spectator));
  document.body.classList.toggle("in-review", finished);
  document.body.classList.toggle("in-records", !game && lobbyView === "records");
  el("match").toggleAttribute("data-playing", playing);
  for (const view of ["lobby", "records", "tournament"]) {
    el(view).hidden = Boolean(game) || lobbyView !== view;
  }
  el("match").hidden = !game;
  el("review-header").hidden = !finished;
  el("review-opponent-profile").hidden = !finished || el("result").open;
  el("review-back").toggleAttribute("data-ncq-main", finished && !el("result").open && !profileDialog.open && !recordShareDialog.open);
  el("show-options").hidden = Boolean(game);
  const nav = el("lobby-nav");
  nav.hidden = Boolean(game);
  for (const button of nav.querySelectorAll("button")) {
    if (button.getAttribute("aria-controls") === lobbyView) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
    button.disabled = busy;
  }
  const mainAction = !game && !matchmaking && !options.open && !ruleDialog.open && !profileDialog.open && !recordShareDialog.open;
  el("start").disabled = busy || Boolean(matchmaking);
  el("choose-rule").disabled = busy || Boolean(matchmaking) || availableRules.length < 2;
  el("choose-rule").toggleAttribute("data-ncq-main", mainAction && lobbyView === "lobby" && availableRules.length > 1);
  const rule = activeRule();
  el("selected-rule").textContent = t(rule === "taraguchi" ? "ruleTaraguchiShort" : ruleNames[rule]);
  el("choose-rule").setAttribute("aria-label", t("currentRule", { rule: t(ruleNames[rule]) }));
  for (const option of ruleDialog.querySelectorAll(".rule-option")) {
    option.hidden = !availableRules.includes(option.value);
    option.setAttribute("aria-pressed", String(option.value === rule));
  }
  el("player-card").disabled = busy;
  el("start").toggleAttribute("data-ncq-main", mainAction && lobbyView === "lobby");
  el("show-tournament").hidden = !backend;
  el("show-tournament").disabled = busy;
  const joinTournament = el("join-tournament");
  joinTournament.hidden = !backend;
  joinTournament.disabled = busy || Boolean(matchmaking);
  joinTournament.toggleAttribute("data-ncq-main", mainAction && lobbyView === "tournament" && Boolean(backend));
  el("show-lobby").toggleAttribute("data-ncq-main", mainAction && lobbyView === "tournament" && !backend);
  el("records-back").toggleAttribute("data-ncq-main", mainAction && lobbyView === "records");
  if (!el("lobby").hidden) renderLobby();
  if (!el("records").hidden) renderRecords();
  if (!el("tournament").hidden) renderTournament();
  if (matchmaking) {
    const { canceled, mode, rule } = matchmaking;
    el("queue-status").textContent = t(canceled ? "canceling" : mode === "tournament" ? "tournamentWaiting" : "findingOpponent");
    el("queue-rule").textContent = t(ruleNames[rule]);
    el("cancel-match").disabled = canceled;
  }
  for (const node of [el("lobby-error"), el("match-error")]) {
    if (!node.hidden) node.textContent = t(node.dataset.message);
  }
  if (!game) return;
  if (spectator) {
    renderSpectator(spectator);
    return;
  }

  for (const id of ["place", "invite"]) {
    el(id).toggleAttribute("data-ncq-main", !profileDialog.open && !matchIntroDialog.open);
  }
  const openingActions = el("opening-actions");
  openingActions.hidden = !canAct() || (!maySwap(game) && !mayOffer(game));
  for (const button of openingActions.querySelectorAll("button")) {
    button.hidden = button.dataset.opening === "swap" ? !maySwap(game) : !mayOffer(game);
    button.toggleAttribute("data-ncq-main", !openingActions.hidden && !button.hidden);
  }
  const pass = el("pass-turn");
  pass.hidden = !playing || Boolean(game.opening) || !hasForbiddenMoves(game.rule);
  pass.disabled = !canAct();
  let status = "waiting";
  if (room && !connected) status = "reconnecting";
  else if (playing) status = game.turn === game.you ? "yourTurn" : "theirTurn";
  else if (finished) status = describeOutcome(game);

  el("room-label").textContent = t(archive ? "records" : "room");
  el("room-id").textContent = "#" + game.number;
  const mode = matchMode(game);
  const heading = playing && connected
    ? (game.opening ? openingStatus(game) : t(mode) + " · " + t("movesCount", { n: game.moves.length })) : t(status);
  if (el("status").textContent !== heading) el("status").textContent = heading;
  el("status").setAttribute("aria-live", playing ? "off" : "polite");
  const announcement = game.opening ? heading : t(status);
  if (playing && el("turn-announcement").textContent !== announcement) el("turn-announcement").textContent = announcement;
  el("round").textContent = t("round", { n: game.round });
  el("mode").textContent = t(finished ? (el("result").open ? "result" : "review") : mode);
  el("room-bar").hidden = playing || finished;
  el("invite").hidden = playing || finished || el("share").open;
  el("leave").disabled = el("leave-match").disabled = busy;
  el("leave").textContent = t(archive ? "backToRecords" : "leave");
  el("leave").removeAttribute("data-ncq-main");
  el("review-back").disabled = busy;

  const place = el("place");
  place.disabled = !canAct() || selected === null;
  el("place-text").textContent = t(game.opening === "offerFive" ? "offerShort" : game.opening === "pickFive" ? "pickShort" : "placeStone");
  const placeLabel = game.turn !== game.you ? t("theirTurn")
    : selected === null ? t("selectStone") : t("place", { cell: coordinate(selected) });
  place.setAttribute("aria-label", placeLabel);
  place.title = placeLabel;
  renderPlayers(game, playing);
  el("review").hidden = !finished || el("result").open;
  el("rematch").hidden = Boolean(archive) || game.mode === "tournament" || game.canRematch === false;
  el("rematch").disabled = !connected || busy || game.requested;
  el("rematch").textContent = t(game.requested ? "rematchWaiting" : game.rematch ? "rematchReady" : "rematch");

  let displayedBoard = game.board;
  let last = game.moves.at(-1);
  let winning = game.line ?? [];
  if (finished) {
    renderResult(game);
    renderReview(game);
    el("review-ply").textContent = reviewPly;
    el("review-total").textContent = " / " + game.moves.length;
    for (const button of el("review").querySelectorAll("[data-step]")) {
      const movesBack = ["first", "previous"].includes(button.dataset.step);
      button.disabled = movesBack ? reviewPly === 0 : reviewPly === game.moves.length;
    }
    if (archive || reviewPly < game.moves.length) {
      displayedBoard = Array(cells.length).fill(0);
      for (let i = 0; i < reviewPly; i += 1) displayedBoard[game.moves[i]] = moveColor(game, i);
      last = game.moves[reviewPly - 1];
      if (reviewPly < game.moves.length) winning = [];
    }
  }

  board.toggleAttribute("inert", !playing && !finished);
  drawBoard(game, displayedBoard, last, winning);
}

function drawBoard(game, displayedBoard, last, winning) {
  const selectable = canAct();
  const ownTurn = game === room && game.phase === "playing" && game.turn === game.you;
  const limits = ownTurn ? moveLimits(game) : [];
  const offers = game.phase === "playing" ? game.offers ?? [] : [];
  board.classList.toggle("selectable", selectable);
  const lastCell = cells[last];
  lastMoveMarker.toggleAttribute("hidden", !lastCell);
  if (lastCell && lastMoveMarker.parentElement !== lastCell) lastCell.append(lastMoveMarker);
  for (const [index, cell] of cells.entries()) {
    const stone = displayedBoard[index];
    const isSelected = selected === index;
    const displayed = isSelected ? game.stone ?? seatColor(game, game.you) : stone;
    const restriction = limits[index];
    const offer = offers.indexOf(index) + 1;
    cell.dataset.stone = stone;
    cell.toggleAttribute("data-foul", Boolean(restriction?.startsWith("renju")));
    cell.toggleAttribute("data-outside-opening", restriction === "outsideOpening" || restriction === "chooseOffered");
    if (offer) cell.dataset.offer = offer;
    else cell.removeAttribute("data-offer");
    cell.classList.toggle("selected", isSelected);
    cell.classList.toggle("win", winning.includes(index));
    cell.firstElementChild.hidden = !displayed;
    cell.firstElementChild.className = "stone " + (displayed === 1 ? "black" : "white");
    const cellLabel = t(["square", "blackSquare", "whiteSquare"][stone], { cell: coordinate(index) });
    const detail = restriction ? t(restriction) : offer ? t("fifthCandidate", { n: offer }) : "";
    cell.setAttribute("aria-label", detail ? cellLabel + ". " + detail : cellLabel);
    cell.title = detail;
    cell.setAttribute("aria-selected", String(isSelected));
    cell.setAttribute("aria-disabled", String(!selectable || Boolean(stone) || Boolean(restriction)));
  }
}

function renderSpectator({ game, closed, reconnecting }) {
  let heading;
  if (closed) heading = t("watchEnded");
  else if (reconnecting) heading = t("reconnecting");
  else if (game.phase === "finished") {
    heading = game.winner ? t("watchWinner", { color: sideName(game, game.winner) }) : t("draw");
  } else if (game.opening) {
    heading = openingStatus(game);
  } else heading = t("watchTurn", { color: sideName(game, game.turn) });
  const status = el("status");
  status.setAttribute("aria-live", "polite");
  if (status.textContent !== heading) status.textContent = heading;
  el("round").textContent = t("round", { n: game.round }) + " · " + t("movesCount", { n: game.moves.length });
  el("room-label").textContent = t("room");
  el("room-id").textContent = "#" + game.number;
  el("mode").textContent = game.rule ? t("spectate") + " · " + t(matchMode(game)) : t("spectate");
  el("room-bar").hidden = false;
  for (const id of ["review", "rematch", "invite"]) el(id).hidden = true;
  const leave = el("leave");
  leave.disabled = false;
  leave.textContent = t("leaveSpectating");
  leave.setAttribute("data-ncq-main", "Leave spectating");
  renderPlayers(game, false, true);
  board.removeAttribute("inert");
  drawBoard(game, game.board, game.moves.at(-1), game.line);
}

const version = window.NCQ?.NCQ_VERSION;
el("app-version").textContent = version ? "v" + version : "dev";

function applyState(next) {
  if (room?.code === next.code && next.version <= room.version) return;
  const showResult = next.phase === "finished" && (room?.phase !== "finished" || room.round !== next.round);
  const placed = room?.code === next.code && room.round === next.round && room.phase === "playing"
    && next.moves.length === room.moves.length + 1 ? next.moves.at(-1) : null;
  room = next;
  turnDeadline = next.phase === "playing" && next.turnSeconds > 0
    && Number.isFinite(next.turnEndsAt) && Number.isFinite(next.serverNow)
    ? performance.now() + Math.max(0, next.turnEndsAt - next.serverNow) : null;
  selected = null;
  if (showResult) reviewPly = room.moves.length;
  if (room.phase !== "finished") el("result").close();
  if (room.phase !== "finished") recordShareDialog.close();
  if (room.phase !== "waiting") el("share").close();
  if (room.phase !== "playing") matchIntroDialog.close();
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
  const placement = presentPlacement(placed);
  if (showResult) {
    const openResult = () => {
      if (room?.code !== next.code || room.round !== next.round || room.phase !== "finished" || el("result").open) return;
      if (profileDialog.open) profileDialog.close();
      el("result").showModal();
      render();
      refreshPlayerCard();
    };
    if (placement) placement.then(openResult);
    else openResult();
  }
}

function exitRoom(message = "") {
  stream?.close();
  stream = null;
  connected = false;
  cancelPlacement();
  el("result").close();
  el("share").close();
  recordShareDialog.close();
  matchIntroDialog.close();
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
  await refreshAuthProfile();
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

async function fetchSpectator(code) {
  if (backend) return remoteRequest(client => client.spectate(code));
  try {
    const response = await fetch("./api/spectate/" + encodeURIComponent(code), { signal: AbortSignal.timeout(3500) });
    if (!response.ok) return { error: response.status === 404 ? "notFound" : "network" };
    return await response.json();
  } catch {
    return { error: "network" };
  }
}

function scheduleSpectator(session) {
  if (session.closed || session.game.phase === "finished") return;
  session.timer = setTimeout(() => pollSpectator(session), 1000);
}

async function pollSpectator(session) {
  if (!document.hidden) {
    const next = await fetchSpectator(session.game.code);
    if (spectator !== session) return;
    if (next.error) {
      const closed = next.error === "notFound";
      if (!session.reconnecting || closed) {
        session.closed = closed;
        session.reconnecting = !closed;
        render();
      }
    } else if (session.reconnecting || next.version !== session.game.version || next.phase !== session.game.phase) {
      const previous = session.game;
      session.game = next;
      session.reconnecting = false;
      render();
      if (previous.round === next.round && next.moves.length === previous.moves.length + 1) {
        presentPlacement(next.moves.at(-1));
      }
    }
  }
  scheduleSpectator(session);
}

async function openSpectator(code) {
  if (room || archive || spectator || matchmaking || busy) return;
  await run(async () => {
    const game = await fetchSpectator(code);
    if (game.error !== "notFound") return game;
    refreshLobby();
    return { error: "watchEnded" };
  }, game => {
    selected = null;
    feedback("match-error");
    spectator = { game, closed: false, reconnecting: false, timer: null };
    scheduleSpectator(spectator);
  });
  (spectator ? el("status") : el("lobby-heading")).focus();
}

function openRoom(next) {
  lobbyView = "lobby";
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
        if (room?.phase === "finished" && next.error === "notFound") {
          connected = false;
          render();
          return;
        }
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
  run(() => post("/rooms/" + code + "/join", { nickname: ownNickname() }, client => client.join(code)), openRoom);
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
  const input = { ticket: job.ticket, mode: job.mode, rule: job.rule };
  const result = await post("/matchmaking", { ...input, nickname: ownNickname() }, client => client.match(input));
  job.pending = false;
  job.ticket = result.ticket ?? job.ticket;
  if (job.canceled) return cancelMatching(job);
  if (result.error) {
    closeMatching(result.error);
  } else if (result.game) {
    closeMatching();
    openRoom(result.game);
    openMatchIntro(result.game);
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
  const job = { canceled: false, mode, rule: mode === "tournament" ? "free" : activeRule() };
  matchmaking = job;
  feedback("lobby-error");
  render();
  el("matchmaking").showModal();
  findMatch(job);
}

el("start").addEventListener("click", () => startMatching("casual"));
el("choose-rule").addEventListener("click", () => {
  ruleDialog.returnValue = "";
  ruleDialog.showModal();
  render();
});
ruleDialog.addEventListener("close", () => {
  if (availableRules.includes(ruleDialog.returnValue)) {
    preferredRule = ruleDialog.returnValue;
    try { localStorage.setItem("matjjangomok.rule", preferredRule); } catch {}
  }
  render();
  el("choose-rule").focus();
});
el("refresh-lobby").addEventListener("click", refreshLobby);
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
  el("review-heading").focus();
}

el("show-records").addEventListener("click", () => run(async () => {
  if (backend) {
    const result = await remoteRequest(client => client.gameRequest("/records"));
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
  lobbyView = "records";
  render();
  el("records-heading").focus();
}));
function showRankings() {
  run(async () => {
    if (!backend) return {};
    const result = await remoteRequest(client => client.gameRequest("/tournament"));
    if (!result.error) tournament = result;
    return result;
  }, () => {
    lobbyView = "tournament";
    render();
    el("tournament-title").focus();
  });
}
el("show-tournament").addEventListener("click", showRankings);
el("show-rankings").addEventListener("click", showRankings);
el("join-tournament").addEventListener("click", () => startMatching("tournament"));

function renderTournament() {
  el("tournament-dates").hidden = !tournament;
  const empty = el("rank-empty");
  empty.textContent = t(backend ? "noStandings" : "rankingsUnavailable");
  empty.hidden = Boolean(tournament?.standings.length);
  if (!tournament) return;
  const date = value => NcqLang.date(value, { month: "short", day: "numeric", timeZone: "Asia/Seoul" });
  el("tournament-dates").textContent = date(tournament.startsAt) + " – " + date(tournament.endsAt);
  el("standings").replaceChildren(...tournament.standings.map(row => entryRow(
    row.rank + ". " + (row.you ? t("you") : t("playerAlias", { alias: row.alias })),
    t("pointsCount", { n: row.points }),
  )));
}
function showLobby() {
  if (lobbyView === "lobby") return;
  lobbyView = "lobby";
  feedback("lobby-error");
  render();
  refreshLobby();
  el("lobby-heading").focus();
}
el("show-lobby").addEventListener("click", showLobby);
el("records-back").addEventListener("click", showLobby);
el("record-filters").addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  recordFilter = button.dataset.filter;
  renderRecords();
  el("record-list").parentElement.scrollTop = 0;
});
function leaveMatch() {
  if (spectator) {
    clearTimeout(spectator.timer);
    spectator = null;
    cancelPlacement();
    render();
    refreshLobby();
    el("lobby-heading").focus();
    return;
  }
  if (archive) {
    cancelPlacement();
    const sharedView = archive.sharedView;
    const id = archive.id;
    archive = null;
    if (sharedView) {
      const url = new URL(location.href);
      url.hash = "";
      history.replaceState(null, "", url);
      render();
      refreshLobby();
      refreshPlayerCard();
      el("lobby-heading").focus();
      return;
    }
    render();
    const row = Array.from(el("record-list").children).find(item => item.dataset.recordId === id);
    (row?.querySelector(".record-open") ?? el("records-heading")).focus();
    return;
  }
  if (room?.phase === "finished" && !connected) return exitRoom();
  const resigning = room?.phase === "playing" && (room.moves.length > 0 || room.passed || room.mode === "tournament");
  if (room?.phase === "finished" || window.confirm(t(resigning ? "confirmResign" : "confirmLeave"))) roomAction("leave", {}, next => {
    if (!backend && next.phase === "finished") saveRecord(next);
    exitRoom();
  });
}
el("leave").addEventListener("click", leaveMatch);
el("leave-match").addEventListener("click", leaveMatch);
el("review-back").addEventListener("click", leaveMatch);
el("review-favorite").addEventListener("click", event => {
  const button = event.currentTarget;
  markFavorite(button, toggleFavorite(button.dataset.recordId));
});
for (const side of ["opponent", "own"]) {
  const image = el("review-" + side + "-photo");
  image.addEventListener("error", () => { image.hidden = true; });
}
el("place").addEventListener("click", () => {
  if (canAct() && selected !== null) roomAction("move", { index: selected, version: room.version });
});
el("opening-actions").addEventListener("click", event => {
  const button = event.target.closest("[data-opening]");
  if (!button || button.hidden || !canAct()) return;
  roomAction("move", { action: { type: button.dataset.opening }, version: room.version });
});
el("pass-turn").addEventListener("click", () => {
  if (canAct() && !room.opening && hasForbiddenMoves(room.rule)) {
    roomAction("move", { action: { type: "pass" }, version: room.version });
  }
});
el("rematch").addEventListener("click", () => roomAction("rematch", {}));
el("review").addEventListener("click", event => {
  const step = event.target.closest("[data-step]")?.dataset.step;
  const game = room ?? archive;
  if (!step || game?.phase !== "finished") return;
  const before = reviewPly;
  const last = game.moves.length;
  const destination = { first: 0, previous: reviewPly - 1, next: reviewPly + 1, last };
  reviewPly = Math.max(0, Math.min(last, destination[step]));
  render();
  if (step === "next" && reviewPly > before) presentPlacement(game.moves[before]);
  else cancelPlacement();
  if (event.target.closest("[data-step]").disabled) {
    el("review").querySelector(reviewPly ? '[data-step="previous"]' : '[data-step="next"]').focus();
  }
});
el("result").addEventListener("close", () => {
  render();
  if (room?.phase === "finished") el("review-heading").focus();
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
  if (!cell || !canAct()) return;
  const index = Number(cell.dataset.index);
  if (room.board[index]) return;
  const restriction = moveLimits(room)[index];
  selected = restriction ? null : index;
  focusCell(index);
  feedback("match-error", restriction, Boolean(restriction));
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
      /^https:\/\/[a-z0-9]{20}\.supabase\.co\/functions\/v1\/(?:ncq-board\/)?matjjangomok$/.test(config.apiUrl)) {
    backend = NcqBoard.create({
      apiUrl: config.apiUrl,
      async getToken({ forceRefresh }) {
        await ensureIdentity();
        return window.NcqAuth.getToken({ forceRefresh, expectedPlayer: authSession.player });
      },
    });
    boardApiUrl = config.apiUrl;
    availableRules = ["free"];
    const response = await fetch(boardApiUrl + "/api/rules", {
      credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(1800),
    });
    if (response.ok) {
      const rules = await response.json();
      if (Array.isArray(rules)) availableRules = Object.keys(ruleNames).filter(rule => rule === "free" || rules.includes(rule));
    }
  }
} catch {
  // Local copies can run without a kickoff profile.
}
function sharedRecordToken() {
  return new URLSearchParams(location.hash.slice(1)).get("record");
}

async function loadSharedRecord(shareId) {
  if (!boardApiUrl || !recordTokenPattern.test(shareId)) {
    feedback("lobby-error", "recordSharedUnavailable", true);
    return;
  }
  try {
    const response = await fetch(boardApiUrl + "/api/shared-records/" + shareId, {
      credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) {
      feedback("lobby-error", "recordSharedUnavailable", true);
      return;
    }
    if (!response.ok) throw new Error();
    const record = await response.json();
    openArchive({ ...record, id: shareId, shareId, sharedView: true, you: record.black === 2 ? 1 : 2 });
  } catch {
    feedback("lobby-error", "network", true);
  }
}

const shareId = sharedRecordToken();
if (shareId !== null) {
  await loadSharedRecord(shareId);
} else {
  const inviteCode = new URL(location.href).searchParams.get("room") ?? "";
  if (backend ? recordTokenPattern.test(inviteCode) : /^[A-Z2-9]{6}$/i.test(inviteCode)) {
    join(backend ? inviteCode : inviteCode.toUpperCase());
  }
}
window.addEventListener("hashchange", () => {
  if (sharedRecordToken() !== null || archive?.sharedView) location.reload();
});
render();
refreshLobby();
for (const image of [...playerPhotos, el("profile-photo")]) {
  image.addEventListener("load", () => { image.hidden = !image.hasAttribute("src"); });
  image.addEventListener("error", () => { image.hidden = true; });
}
if (shareId === null) refreshPlayerCard();
document.addEventListener("visibilitychange", refreshLobby);
setInterval(refreshLobby, 2500);
