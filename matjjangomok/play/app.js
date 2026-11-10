import { NcqLang } from "./ncq/lang.js";
import { NcqBoard } from "./ncq/board.js?v=d9f620e27616";
import { TEXTS } from "./texts.js?v=d9f620e27616";
import { forbiddenAt, hasForbiddenMoves } from "./ncq/position.js?v=d9f620e27616";
import { mayOffer, maySwap, offerCount, openingError, openingRadius } from "./ncq/taraguchi.js?v=d9f620e27616";

NcqLang.init({ id: "matjjangomok", texts: TEXTS });
const t = NcqLang.t;
const el = id => document.getElementById(id);
const size = 15;
const columns = "ABCDEFGHJKLMNOP";
const recordsKey = "matjjangomok.records";
const appearanceKey = "matjjangomok.appearance";
const nicknameKey = "matjjangomok.nickname";
const stoneSoundKey = "matjjangomok.stoneSound";
const matchAdsKey = "matjjangomok.matchAds";
const matchAdCooldown = 90_000;
const NcqAds = window.NcqAds;
const NcqIap = window.NcqIap;
let adsRemoved = false;
let adPurchaseBusy = false;
let matchAds = { freeRounds: [], lastShownAt: 0, lastAttemptedRound: null };
let resultAdRound = null;
const starterCoins = 0;
const goldenPlacementPrice = 120;
const dayMs = 24 * 60 * 60_000;
const koreaOffset = 9 * 60 * 60_000;
const dailyMissions = [
  { target: 1, coins: 30 },
  { target: 3, coins: 50 },
  { target: 6, coins: 80 },
];
const repeatMission = { after: dailyMissions.at(-1).target, limit: 10, coins: 5 };
const dailyMissionLimit = repeatMission.after + repeatMission.limit;
const missionRewards = new Map(dailyMissions.map(({ target, coins }) => [target, coins]));
for (let target = repeatMission.after + 1; target <= dailyMissionLimit; target += 1) {
  missionRewards.set(target, repeatMission.coins);
}
const missionTargets = [...missionRewards.keys()];
let missionClaiming = false;
const pairedSkinPrices = {
  reference: 0, classic: 0, vintage: 300, porcelain: 800, jade: 1000,
  lacquer: 400, ocean: 700, soda: 600, gilded: 500,
};
const skinPrices = {
  stones: { ...pairedSkinPrices, glossy: 200 },
  board: { ...pairedSkinPrices, wood: 200 },
};
const skinKinds = Object.keys(skinPrices);
let shopState = loadShopState();
let shopPreview = { ...shopState.appearance };
let shopTab = "skins";
let shopSaving = false;
const board = el("board");
const boardGrid = el("board-grid");
const lastMoveMarker = el("last-move-marker");
const reviewMoveNumbers = el("review-move-numbers");
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
let showMoveNumbers = false;
let archive = null;
let spectator = null;
let lobbyView = "lobby";
let recordsReturnView = "lobby";
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
const foulMarkers = { renjuDoubleThree: "33", renjuDoubleFour: "44", renjuOverline: "6+" };
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
let rankingTab = "weekly";
let rankingResults = {};
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
const shop = el("shop");
const shopAction = el("shop-action");
const missionDialog = el("missions");
const optionsDialog = el("options");
const feedbackButton = el("send-feedback");
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
el("show-options").addEventListener("click", () => {
  feedback("restore-feedback");
  feedbackButton.hidden = Boolean(room ?? archive ?? spectator) || !window.NcqFeedback?.can();
  optionsDialog.showModal();
  render();
});
optionsDialog.addEventListener("close", render);
feedbackButton.addEventListener("click", () => {
  optionsDialog.close();
  window.NcqFeedback.open();
});
window.ncqBack = () => {
  if (window.NcqFeedback?.isOpen()) {
    window.NcqFeedback.close();
    return true;
  }
  if (!optionsDialog.open) return false;
  optionsDialog.close();
  return true;
};
const stoneSoundToggle = el("stone-sound");
const adPrivacy = el("ad-privacy");
NcqAds?.ready().then(() => { adPrivacy.hidden = !NcqAds.privacyRequired(); }).catch(() => {});
adPrivacy.addEventListener("click", () => NcqAds?.showPrivacyOptions());
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
const shopRadios = Array.from(shop.querySelectorAll('input[type="radio"]'));
const skinCards = shopRadios.filter(input => input.name !== "grid").map(input => {
  const label = input.closest("label");
  const boardSample = label.querySelector(".board-sample");
  const status = document.createElement("span");
  const price = document.createElement("span");
  status.className = "shop-skin-status";
  price.className = "shop-skin-price";
  label.append(status, price);
  return { input, label, boardSample, status, price };
});
function openShop() {
  shopPreview = { ...shopState.appearance };
  shopTab = "skins";
  feedback("shop-feedback");
  shop.showModal();
  shop.querySelector(".shop-content").scrollTop = 0;
  render();
}
const shopTabs = ["currency", "skins", "ads"];
const missionRows = [...dailyMissions, repeatMission].map((_, index) => {
  const row = el("daily-mission-row").content.firstElementChild.cloneNode(true);
  row.querySelector(".mission-goal").id = "mission-goal-" + index;
  row.querySelector(".mission-claim").setAttribute("aria-describedby", "mission-goal-" + index);
  el("daily-mission-list").append(row);
  return row;
});
const missionSteps = dailyMissions.map(() => {
  const step = document.createElement("span");
  step.className = "mission-step";
  el("daily-mission-steps").append(step);
  return step;
});
const repeatMissionRow = missionRows.at(-1);
const repeatCount = document.createElement("span");
repeatCount.id = "mission-repeat-count";
repeatMissionRow.querySelector(".mission-label").append(repeatCount);
repeatMissionRow.classList.add("mission-repeat");
const missionMarkers = [...el("mission-markers").children];
el("show-shop").addEventListener("click", openShop);
el("show-missions").addEventListener("click", () => {
  feedback("mission-feedback");
  missionDialog.showModal();
  el("mission-content").scrollTop = 0;
  render();
});
missionDialog.addEventListener("close", render);
missionDialog.addEventListener("click", event => {
  const button = event.target.closest(".mission-claim");
  if (button) void claimMission(button);
});
shop.addEventListener("close", render);
for (const tab of shopTabs) {
  el("shop-tab-" + tab).addEventListener("click", () => {
    shopTab = tab;
    feedback("shop-feedback");
    renderShop();
    shop.querySelector(".shop-content").scrollTop = 0;
  });
}
for (const input of shopRadios) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    shopPreview[input.name] = input.value;
    feedback("shop-feedback");
    renderShop();
  });
}
shopAction.addEventListener("click", () => saveShopSelection(shopAction.hasAttribute("data-purchase")));
el("shop-buy-effect").addEventListener("click", buyGoldenPlacement);
el("shop-buy-remove-ads").addEventListener("click", buyRemoveAds);
el("shop-restore-ads").addEventListener("click", () => restoreAdPurchase("shop-feedback"));
el("restore-purchases").addEventListener("click", () => restoreAdPurchase("restore-feedback"));
window.addEventListener("ncq-iap", refreshAdPurchase);
window.addEventListener("storage", event => {
  if (event.key !== appearanceKey && event.key !== null) return;
  shopState = loadShopState();
  applyAppearance();
  renderCoinBalance();
  renderDailyMissions();
  if (shop.open) renderShop();
});

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

function loadShopState(fallback) {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(appearanceKey)); } catch {}
  if (!saved && fallback) return fallback;
  const appearance = {
    stones: Object.hasOwn(skinPrices.stones, saved?.stones) ? saved.stones : "reference",
    board: Object.hasOwn(skinPrices.board, saved?.board) ? saved.board : "reference",
    grid: saved?.grid === "soft" ? "soft" : "engraved",
  };
  const ownedSkins = new Set(Array.isArray(saved?.ownedSkins) ? saved.ownedSkins : []);
  // An equipped skin may have been free in an earlier version.
  for (const kind of skinKinds) {
    if (skinPrices[kind][appearance[kind]] > 0) ownedSkins.add(kind + ":" + appearance[kind]);
  }
  const missionRounds = Array.isArray(saved?.missionRounds) ? saved.missionRounds : [];
  // Older builds paid eligible missions as soon as each match ended.
  const missionClaims = Array.isArray(saved?.missionClaims) ? saved.missionClaims
    : missionTargets.filter(target => target <= missionRounds.length);
  return {
    appearance,
    ownedSkins: [...ownedSkins],
    coins: Number.isSafeInteger(saved?.coins) && saved.coins >= 0 ? saved.coins : starterCoins,
    goldenPlacementUntil: Number.isSafeInteger(saved?.goldenPlacementUntil) ? saved.goldenPlacementUntil : 0,
    missionDay: saved?.missionDay ?? "",
    missionRounds,
    missionClaims,
  };
}

function persistShopState({ appearance, ...wallet }) {
  localStorage.setItem(appearanceKey, JSON.stringify({ ...appearance, ...wallet }));
}

async function updateShop(action) {
  if (navigator.locks) return navigator.locks.request(appearanceKey, action);
  return action();
}

function setAppearanceTheme(element, appearance) {
  element.dataset.stoneStyle = appearance.stones;
  element.dataset.boardStyle = appearance.board;
  element.dataset.gridStyle = appearance.grid;
}

function applyAppearance() {
  setAppearanceTheme(document.documentElement, shopState.appearance);
}

function ownsSkin(state, kind, style) {
  return skinPrices[kind][style] === 0 || state.ownedSkins.includes(kind + ":" + style);
}

function shopPurchase(selection, state) {
  const locked = skinKinds.filter(kind => !ownsSkin(state, kind, selection[kind]));
  return {
    skins: locked.map(kind => kind + ":" + selection[kind]),
    price: locked.reduce((sum, kind) => sum + skinPrices[kind][selection[kind]], 0),
  };
}

function koreaDay(timestamp) {
  return new Date(timestamp + koreaOffset).toISOString().slice(0, 10);
}

function missionProgress(count, target) {
  return { count: NcqLang.num(Math.min(count, target)), target: NcqLang.num(target) };
}

function renderCoinBalance() {
  const coins = NcqLang.num(shopState.coins);
  el("lobby-coin-count").textContent = coins;
  el("shop-balance").textContent = coins;
}

function renderDailyMissions() {
  const today = koreaDay(Date.now()) === shopState.missionDay;
  const count = today ? shopState.missionRounds.length : 0;
  const claimed = today ? shopState.missionClaims : [];
  const ready = missionTargets.filter(target => target <= count && !claimed.includes(target));
  const completed = dailyMissions.filter(({ target }) => count >= target).length;
  const progress = missionProgress(completed, dailyMissions.length);
  el("daily-mission-count").textContent = progress.count;
  el("daily-mission-total").textContent = t("missionMilestoneTotal", progress);
  const filledSegments = Math.max(0, completed - 1);
  el("daily-mission-steps").style.setProperty("--mission-rail-fill", filledSegments / (dailyMissions.length - 1) * 100 + "%");
  missionSteps.forEach((step, index) => step.toggleAttribute("data-completed", index < completed));
  el("show-missions").toggleAttribute("data-ready", ready.length > 0);
  el("daily-mission-action").textContent = t(ready.length ? "missionClaim" : "missionView");
  if (!missionDialog.open) return;

  el("mission-balance").textContent = NcqLang.num(shopState.coins);
  const overview = el("mission-overview-progress");
  overview.setAttribute("aria-valuenow", completed);
  overview.style.setProperty("--mission-fill", completed / dailyMissions.length * 100 + "%");
  el("mission-total").textContent = t("missionOverviewCount", progress);
  missionMarkers.forEach((marker, index) => {
    const done = index < completed;
    marker.toggleAttribute("data-done", done);
    marker.textContent = done ? "✓" : "";
  });
  dailyMissions.forEach(({ target, coins }, index) => {
    const goal = t(target === 1 ? "missionFirstGoal" : "missionGoal", { n: NcqLang.num(target) });
    renderMissionRow(missionRows[index], {
      goal, coins, progress: Math.min(count, target), max: target,
      claim: ready.includes(target) ? target : null, done: claimed.includes(target),
    });
  });
  const { after, limit, coins } = repeatMission;
  const repeats = claimed.filter(target => target > after).length;
  renderMissionRow(repeatMissionRow, {
    goal: t("missionRepeatGoal"), coins,
    progress: Math.min(Math.max(0, count - after), limit), max: limit,
    claim: ready.find(target => target > after), done: repeats >= limit,
  });
  el("mission-repeat-count").textContent = t("missionRepeatProgress", missionProgress(repeats, limit));
  el("mission-repeat-note").textContent = t("missionRepeatNote", { after: NcqLang.num(after), n: NcqLang.num(limit) });
  const status = el("mission-feedback");
  if (!status.hidden) status.textContent = t(status.dataset.message);
}

function renderMissionRow(row, { goal, coins, progress, max, claim, done }) {
  row.dataset.state = claim ? "ready" : done ? "done" : "pending";
  row.querySelector(".mission-goal").textContent = goal;
  row.querySelector(".mission-coins").textContent = t("shopPrice", { n: NcqLang.num(coins) });
  const track = row.querySelector(".mission-track");
  track.setAttribute("aria-label", goal);
  track.setAttribute("aria-valuemax", max);
  track.setAttribute("aria-valuenow", progress);
  track.style.setProperty("--mission-fill", progress / max * 100 + "%");
  track.toggleAttribute("data-filled", progress * 2 >= max);
  track.querySelector("span").textContent = t("missionTrackCount", missionProgress(progress, max));
  const button = row.querySelector(".mission-claim");
  button.textContent = t("missionClaim");
  button.hidden = !claim;
  button.toggleAttribute("data-ncq-main", Boolean(claim));
  button.disabled = missionClaiming;
  button.value = claim ?? "";
  const status = row.querySelector(".mission-status");
  status.hidden = Boolean(claim);
  status.textContent = t(done ? "missionClaimed" : "missionInProgress");
}

async function claimMission(button) {
  if (missionClaiming || !missionDialog.open) return;
  const target = Number(button.value);
  const reward = missionRewards.get(target);
  if (!reward) return;
  const day = koreaDay(Date.now());
  const restoreFocus = document.activeElement === button;
  missionClaiming = true;
  renderDailyMissions();
  try {
    await updateShop(() => {
      const state = loadShopState(shopState);
      shopState = state;
      if (day !== koreaDay(Date.now()) || day !== state.missionDay
          || state.missionRounds.length < target || state.missionClaims.includes(target)) return;
      const next = { ...state, coins: state.coins + reward, missionClaims: [...state.missionClaims, target] };
      persistShopState(next);
      shopState = next;
      feedback("mission-feedback", "missionClaimSuccess");
    });
  } catch {
    feedback("mission-feedback", "missionClaimFailed", true);
  } finally {
    missionClaiming = false;
    renderCoinBalance();
    renderDailyMissions();
    if (shop.open) renderShop();
    if (restoreFocus && missionDialog.open) (button.hidden ? el("mission-close") : button).focus({ preventScroll: true });
  }
}

function scheduleMissionReset() {
  setTimeout(() => {
    renderDailyMissions();
    scheduleMissionReset();
  }, dayMs - (Date.now() + koreaOffset) % dayMs);
}

function renderShop() {
  renderAdPurchase();
  const skins = shopTab === "skins";
  for (const tab of shopTabs) {
    const active = shopTab === tab;
    el("shop-tab-" + tab).setAttribute("aria-pressed", String(active));
    el("shop-" + tab).hidden = !active;
  }
  shopAction.hidden = !skins;
  el("shop-starter").textContent = t("shopStarter", { n: NcqLang.num(starterCoins) });
  const effectActive = shopState.goldenPlacementUntil > Date.now();
  const effectStatus = el("shop-effect-status");
  effectStatus.hidden = !effectActive;
  if (effectActive) {
    effectStatus.textContent = t("shopEffectActiveUntil", {
      time: NcqLang.date(shopState.goldenPlacementUntil, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    });
  }
  const effectAction = el("shop-buy-effect");
  effectAction.hidden = shopTab !== "currency";
  effectAction.disabled = shopSaving || shopState.coins < goldenPlacementPrice;
  effectAction.textContent = t(effectActive ? "shopExtendEffect" : "shopBuyEffect", { n: NcqLang.num(goldenPlacementPrice) });
  setAppearanceTheme(el("appearance-preview"), shopPreview);
  for (const input of shopRadios) {
    input.checked = shopPreview[input.name] === input.value;
    input.disabled = shopSaving;
  }
  for (const { input, label, boardSample, status, price } of skinCards) {
    const { name, value, checked } = input;
    const applied = shopState.appearance[name] === value;
    const owned = ownsSkin(shopState, name, value);
    label.toggleAttribute("data-locked", !owned);
    label.toggleAttribute("data-applied", applied);
    if (boardSample) boardSample.dataset.gridStyle = shopPreview.grid;
    status.textContent = t(!owned ? (checked ? "shopSelectedLocked" : "shopLocked")
      : applied ? "shopApplied" : checked ? "shopSelected" : "shopOwned");
    price.hidden = owned;
    price.textContent = owned ? "" : t("shopPrice", { n: NcqLang.num(skinPrices[name][value]) });
  }
  const { price } = shopPurchase(shopPreview, shopState);
  const changed = Object.keys(shopPreview).some(kind => shopPreview[kind] !== shopState.appearance[kind]);
  const buying = price > 0;
  const enough = price <= shopState.coins;
  shopAction.toggleAttribute("data-purchase", buying);
  shopAction.disabled = shopSaving || (buying ? !enough : !changed);
  shopAction.textContent = buying ? t("shopBuyPrice", { n: NcqLang.num(price) }) : t("shopApply");
  el("shop-preview-guide").textContent = t(buying ? (enough ? "shopLockedPreview" : "shopNotEnough") : "shopPreviewGuide");
  const status = el("shop-feedback");
  if (!status.hidden) status.textContent = t(status.dataset.message);
}

function renderAdPurchase() {
  const store = NcqIap?.status();
  const sellable = store?.ready && NcqIap.can("REMOVE_ADS");
  const price = sellable ? NcqIap.price("REMOVE_ADS") : "";
  const visible = Boolean(price || adsRemoved);
  const canRestore = adsRemoved || (store && (store.mode === "simulate"
    || (store.mode !== "off" && store.products.REMOVE_ADS?.on)));
  el("shop-tab-ads").hidden = !visible;
  if (!visible && shopTab === "ads") shopTab = "skins";
  el("shop-remove-ads-owned").hidden = !adsRemoved;
  const buy = el("shop-buy-remove-ads");
  buy.hidden = shopTab !== "ads" || adsRemoved || !price;
  buy.disabled = adPurchaseBusy;
  buy.textContent = price ? t("shopRemoveAdsBuy", { price }) : "";
  el("shop-restore-ads").hidden = shopTab !== "ads" || !canRestore;
  el("restore-purchases").hidden = !canRestore;
  el("shop-restore-ads").disabled = el("restore-purchases").disabled = adPurchaseBusy;
  const status = el("restore-feedback");
  if (!status.hidden) status.textContent = t(status.dataset.message);
}

function refreshAdPurchase() {
  if (shop.open) renderShop();
  else renderAdPurchase();
}

function showGameBanner() {
  if (adsRemoved || !NcqAds?.can("BANNER")) return;
  // NCQ_ADS_BANNER: 상단 배너 광고
  void NcqAds.banner("BANNER", { position: "top" }).catch(() => {});
}

function enableAdRemoval() {
  if (adsRemoved) return;
  adsRemoved = true;
  NcqAds?.hideBanner().catch(() => {});
  refreshAdPurchase();
}

async function initializeAdPurchase() {
  if (NcqIap) {
    // NCQ_IAP_REMOVE_ADS: 영구 광고 제거
    NcqIap.onGrant(id => {
      if (id !== "REMOVE_ADS") return false;
      enableAdRemoval();
      return true;
    });
    void NcqIap.ready().then(refreshAdPurchase, refreshAdPurchase);
    try {
      if (await NcqIap.owned("REMOVE_ADS")) enableAdRemoval();
    } catch {
      // The store can retry purchase recovery when the app returns to the foreground.
    }
  }
  showGameBanner();
  refreshAdPurchase();
}

async function buyRemoveAds() {
  if (adPurchaseBusy || adsRemoved || !NcqIap?.can("REMOVE_ADS")) return;
  adPurchaseBusy = true;
  feedback("shop-feedback");
  const content = shop.querySelector(".shop-content");
  const scrollTop = content.scrollTop;
  const shell = document.querySelector(".shell");
  // The shared build's checkout is attached to the page, below native dialogs.
  shop.close();
  shell.inert = true;
  try {
    await adOwnershipReady;
    if (adsRemoved) return;
    const result = await NcqIap.buyOnce("REMOVE_ADS");
    if (result.ok) feedback("shop-feedback", "shopRemoveAdsActivated");
    else if (["PENDING", "CHECKING"].includes(result.code)) feedback("shop-feedback", "shopRemoveAdsPending");
    else if (result.code !== "USER_CANCELED") feedback("shop-feedback", "shopRemoveAdsFailed", true);
  } catch {
    feedback("shop-feedback", "shopRemoveAdsFailed", true);
  } finally {
    shell.inert = false;
    adPurchaseBusy = false;
    shop.showModal();
    render();
    content.scrollTop = scrollTop;
  }
}

async function restoreAdPurchase(statusId) {
  if (adPurchaseBusy || !NcqIap) return;
  adPurchaseBusy = true;
  feedback(statusId);
  refreshAdPurchase();
  try {
    await adOwnershipReady;
    const result = await NcqIap.restore();
    if (!result.ok) {
      feedback(statusId, "purchaseRestoreFailed", true);
    } else if (result.restored.includes("REMOVE_ADS")) {
      feedback(statusId, "purchaseRestored");
    } else {
      if (adsRemoved && !(await NcqIap.owned("REMOVE_ADS"))) {
        adsRemoved = false;
        showGameBanner();
      }
      feedback(statusId, adsRemoved ? "purchaseRestored" : "purchaseRestoreEmpty");
    }
  } catch {
    feedback(statusId, "purchaseRestoreFailed", true);
  } finally {
    adPurchaseBusy = false;
    refreshAdPurchase();
  }
}

async function saveShopSelection(buy) {
  if (shopSaving) return;
  const selection = { ...shopPreview };
  shopSaving = true;
  renderShop();
  const save = () => {
    const state = loadShopState(shopState);
    const { skins, price } = shopPurchase(selection, state);
    if ((buy && (!price || price > state.coins)) || (!buy && price)) {
      shopState = state;
      return;
    }
    const next = buy
      ? { ...state, coins: state.coins - price, ownedSkins: [...state.ownedSkins, ...skins] }
      : { ...state, appearance: selection };
    try {
      persistShopState(next);
      feedback("shop-feedback", buy ? "shopPurchased" : "shopApplied");
    } catch {
      if (buy) {
        feedback("shop-feedback", "shopSaveFailed", true);
        return;
      }
      feedback("shop-feedback", "shopAppliedTemporarily");
    }
    shopState = next;
  };
  try {
    await updateShop(save);
  } catch {
    feedback("shop-feedback", "shopSaveFailed", true);
  } finally {
    shopSaving = false;
    applyAppearance();
    renderCoinBalance();
    if (shop.open) renderShop();
  }
}

async function buyGoldenPlacement() {
  if (shopSaving) return;
  shopSaving = true;
  renderShop();
  try {
    await updateShop(() => {
      const state = loadShopState(shopState);
      shopState = state;
      if (state.coins < goldenPlacementPrice) return;
      const next = {
        ...state,
        coins: state.coins - goldenPlacementPrice,
        goldenPlacementUntil: Math.max(state.goldenPlacementUntil, Date.now()) + dayMs,
      };
      persistShopState(next);
      shopState = next;
      feedback("shop-feedback", "shopEffectPurchased");
    });
  } catch {
    feedback("shop-feedback", "shopSaveFailed", true);
  } finally {
    shopSaving = false;
    renderCoinBalance();
    if (shop.open) renderShop();
  }
}

async function recordMissionRound(game, roundKey) {
  if (!game.moves.length || (["resign", "disconnect", "timeout"].includes(game.endReason) && game.moves.length < 6)) return;
  const finishedAt = new Date(game.finishedAt ?? Date.now()).getTime();
  if (!Number.isFinite(finishedAt)) return;
  const day = koreaDay(finishedAt);
  let recorded;
  try {
    recorded = await updateShop(() => {
      const state = loadShopState(shopState);
      if (day < state.missionDay) return;
      const sameDay = day === state.missionDay;
      const rounds = sameDay ? state.missionRounds : [];
      if (rounds.length >= dailyMissionLimit || rounds.includes(roundKey)) return;
      const next = { ...state, missionDay: day, missionRounds: [...rounds, roundKey], missionClaims: sameDay ? state.missionClaims : [] };
      persistShopState(next);
      shopState = next;
      return true;
    });
  } catch {
    return;
  }
  if (!recorded || day !== koreaDay(Date.now())) return;
  renderDailyMissions();
  if (shop.open) renderShop();
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
  cell.classList.remove("placing", "golden-placement");
}

function presentPlacement(index, ownMove = false) {
  if (index == null || document.hidden) return;
  cancelPlacement();
  if (reducedMotion.matches) {
    playPlacementSound(0);
    return;
  }
  const cell = cells[index];
  cell.classList.add("placing");
  cell.classList.toggle("golden-placement", ownMove && shopState.goldenPlacementUntil > Date.now());
  const animation = cell.firstElementChild.getAnimations().find(item => item.animationName === "stone-land");
  const duration = animation ? animation.effect.getTiming().duration : 0;
  playPlacementSound(duration * .6 / 1000);
  if (!animation) {
    cell.classList.remove("placing", "golden-placement");
    return;
  }
  activePlacement = { cell, animation };
  return animation.finished.catch(() => {}).finally(() => {
    if (activePlacement?.animation !== animation) return;
    activePlacement = null;
    cell.classList.remove("placing", "golden-placement");
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
  if (game.mode === "tournament") return "weeklyTournament";
  if (game.rule === "taraguchi") return "ruleTaraguchiShort";
  return ruleNames[game.rule] ?? "onlineMatch";
}

function recordModeLabel(game) {
  const mode = t(game.mode === "tournament" ? "weeklyTournament" : "casualMatch");
  return game.rule ? mode + " · " + t(ruleNames[game.rule]) : mode;
}

function moveColor(game, ply) {
  return game.moveColors?.[ply] ?? ply % 2 + 1;
}

function clockDeadline(game) {
  return game.phase === "playing" && game.turnSeconds > 0
    && Number.isFinite(game.turnEndsAt) && Number.isFinite(game.serverNow)
    ? performance.now() + Math.max(0, game.turnEndsAt - game.serverNow) : null;
}

function updateTurnClock(now, deadline, secondsPerTurn, ownTurn, watching) {
  const remaining = Math.max(0, deadline - now);
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
  const percent = Math.min(100, remaining / (secondsPerTurn * 1000) * 100);
  progress.style.setProperty("--match-art-progress", percent.toFixed(2));
  progress.toggleAttribute("data-empty", remaining === 0);
  if (remaining > 0) {
    turnFrame = requestAnimationFrame(time => updateTurnClock(time, deadline, secondsPerTurn, ownTurn, watching));
  } else if (!watching) {
    el("place").disabled = true;
    board.classList.remove("selectable");
    for (const cell of cells) cell.setAttribute("aria-disabled", "true");
  }
}

function resetTurnGauge(clock, progress, text) {
  clock.getAnimations().forEach(animation => animation.cancel());
  clock.textContent = text;
  progress.style.removeProperty("--match-art-progress");
  progress.removeAttribute("data-empty");
}

function ownNickname() {
  return nicknameOverride || playerNickname || t("guestNickname");
}

function renderPlayers(game, playing, watching = false) {
  cancelAnimationFrame(turnFrame);
  const showPanels = playing || watching;
  for (const id of ["opponent-panel", "own-panel"]) el(id).hidden = !showPanels;
  el("live-actions").hidden = !playing || watching;
  for (const id of ["opponent-profile", "own-profile"]) el(id).disabled = watching;
  const reviewing = !watching && game.phase === "finished";
  el("player-bar").hidden = showPanels || reviewing;
  if (reviewing) return;
  if (!showPanels) {
    for (const [color, seat] of [["black", 1], ["white", 2]]) {
      const profile = recordPlayer(game, seat);
      el(color + "-player-label").textContent = game.you === seat ? ownNickname() : profile.name;
      el(color + "-profile").disabled = game.phase === "waiting" && game.you !== seat;
    }
    return;
  }

  const lowerSeat = watching ? game.black ?? 1 : game.you;
  const deadline = watching ? spectator.deadline : turnDeadline;
  const live = playing || (watching && game.phase === "playing" && !spectator.closed && !spectator.reconnecting);
  const ownTurn = live && game.turn === lowerSeat;
  const opponentTurn = live && !ownTurn;
  el("own-panel").dataset.active = el("place").dataset.active = String(ownTurn);
  el("opponent-panel").dataset.active = el("opponent-timer").dataset.active = String(opponentTurn);
  el("opponent-turn").textContent = t(opponentTurn ? "turnActive" : "turnWaiting");
  for (const [side, seat] of [["own", lowerSeat], ["opponent", 3 - lowerSeat]]) {
    const color = colorName(seatColor(game, seat));
    const profile = recordPlayer(game, seat);
    const nickname = watching ? profile.savedName || t(color) : side === "own" ? ownNickname() : profile.name;
    el(side + "-nickname").textContent = nickname;
    el(side + "-nickname").title = nickname;
    if (!watching && side === "own") renderOwnRank();
    else {
      const rank = recordRank(profile) || (!watching && game.botLevel != null ? rankName(game.botLevel) : "");
      el(side + "-rank").hidden = !rank;
      el(side + "-rank").textContent = rank;
    }
    const stone = el(side + "-stone");
    stone.className = "stone " + color;
    stone.setAttribute("aria-label", t(color));
  }
  for (const id of ["place-gauge", "opponent-gauge", "place-divider", "opponent-divider", "own-clock", "opponent-clock"]) {
    el(id).toggleAttribute("hidden", !watching && deadline === null);
  }
  if (!live || deadline === null) {
    if (watching) {
      resetTurnGauge(ownClock, ownProgress, "—");
      resetTurnGauge(opponentClock, opponentProgress, "—");
    }
    return;
  }

  const idleClock = ownTurn ? opponentClock : ownClock;
  const idleProgress = ownTurn ? opponentProgress : ownProgress;
  resetTurnGauge(idleClock, idleProgress, String(Math.ceil(game.turnSeconds)).padStart(2, "0"));
  updateTurnClock(performance.now(), deadline, game.turnSeconds, ownTurn, watching);
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
  const { number, round, moves, winner, line, you, finishedAt, endReason, players, bot, mode, rule, black, moveColors, passes } = game;
  existing.set(id, { id, number, round, moves, winner, line, you, finishedAt, endReason, players, bot, mode, rule, black, moveColors, passes });
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

const recordResultTexts = {
  win: { neutral: "recordWin", won: "recordPersonalWin", lost: "recordPersonalLoss" },
  timeout: { neutral: "recordTimeWin", won: "recordPersonalTimeWin", lost: "recordPersonalTimeLoss" },
  resign: { neutral: "recordResignWin", won: "recordPersonalResignWin", lost: "recordPersonalResignLoss" },
  disconnect: { neutral: "recordDisconnectWin", won: "recordPersonalDisconnectWin", lost: "recordPersonalDisconnectLoss" },
  unknown: { neutral: "recordUnknownWin", won: "recordPersonalUnknownWin", lost: "recordPersonalUnknownLoss" },
};

function recordResult(game, { personal = false } = {}) {
  if (!game.winner) return t("draw");
  const reason = game.endReason;
  const ending = reason === "disconnect" || reason === "timeout" ? reason
    : reason === "resign" || game.actions?.some(action => action.type === "resign") ? "resign"
    : reason === "win" || game.line?.length >= 5 ? "win" : "unknown";
  const labels = recordResultTexts[ending];
  if (personal && !game.sharedView && (game.you === 1 || game.you === 2)) {
    return t(labels[describeOutcome(game)]);
  }
  return t(labels.neutral, { color: sideName(game, game.winner) });
}

function recordPlayer(game, seat) {
  const profile = game.players?.find(player => player.seat === seat);
  const savedName = profile?.nickname || (profile?.guestCode ? t("recordGuest", { code: profile.guestCode }) : "");
  return { ...profile, savedName, name: savedName || t(seat === game.you ? "you" : "opponent") };
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
const publicPlayUrl = "https://ncroquis.github.io/matjjangomok/play/";
const reviewPlay = el("review-play");
const reviewRoomAction = el("review-room-action");
reviewPlay.href = window.NcqShare?.playUrl?.() || publicPlayUrl;

function recordVisibilityPath(game) {
  const code = game.code ?? game.id?.split(":")[0];
  if (!backend || game.device || !recordTokenPattern.test(code) || !Number.isInteger(game.round)) return null;
  return "/records/" + code + "/" + game.round + "/visibility";
}

function recordShareUrl(shareId) {
  const url = new URL(publicPlayUrl);
  url.hash = "record=" + shareId;
  return url.href;
}

function renderRecordSharing() {
  if (!recordShareDialog.open || !recordShareTarget) return;
  const { path, shareId, loading, updating, ready, prepared, sharing } = recordShareTarget;
  const pending = updating || sharing;
  el("record-share-note").textContent = t(shareId ? "recordShareNote" : "recordSharePrivateNote");
  el("record-link-panel").hidden = !shareId || loading;
  const link = el("record-link");
  const url = shareId ? recordShareUrl(shareId) : "";
  if (link.value !== url) link.value = url;
  const send = el("record-send-link");
  send.hidden = !prepared;
  send.disabled = pending;
  el("record-copy-link").disabled = pending;
  const toggle = el("record-visibility-toggle");
  toggle.hidden = !path || !ready;
  toggle.disabled = pending;
  toggle.textContent = t(shareId ? "recordMakePrivate" : "recordMakePublic");
  el("record-share-close").disabled = pending;
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
  if (!path) return prepareRecordShare(target);
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
  prepareRecordShare(target);
}

async function prepareRecordShare(target) {
  target.prepared = null;
  const { shareId } = target;
  if (!shareId || !window.NcqShare?.can()) return;
  const url = recordShareUrl(shareId);
  try {
    const prepared = await window.NcqShare.prepareShare({ url, title: t("title"), message: t("recordShareMessage") });
    if (recordShareTarget !== target || target.shareId !== shareId || prepared.url !== url) return;
    target.prepared = prepared;
    renderRecordSharing();
  } catch {
    // The public link can still be copied.
  }
}

async function toggleRecordVisibility() {
  const target = recordShareTarget;
  if (!target?.ready || target.updating || target.sharing) return;
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
reviewPlay.addEventListener("click", event => {
  if (archive?.sharedView && ["android", "ios", "toss"].includes(window.NCQ?.NCQ_PLATFORM)) {
    event.preventDefault();
    leaveMatch();
  }
});

function selectPublicRecordLink() {
  const input = el("record-link");
  input.focus();
  input.select();
  feedback("record-share-feedback", "recordCopyManually");
}

el("record-send-link").addEventListener("click", async () => {
  const target = recordShareTarget;
  if (!target?.prepared || target.updating || target.sharing) return;
  target.sharing = true;
  feedback("record-share-feedback");
  renderRecordSharing();
  let status = "failed";
  try { ({ status } = await window.NcqShare.share(target.prepared)); } catch {}
  target.sharing = false;
  if (!recordShareDialog.open || recordShareTarget !== target) return;
  renderRecordSharing();
  if (status === "copied") feedback("record-share-feedback", "recordLinkCopied");
  if (status === "failed") selectPublicRecordLink();
});
el("record-copy-link").addEventListener("click", async () => {
  const input = el("record-link");
  const target = recordShareTarget;
  try {
    await navigator.clipboard.writeText(input.value);
    if (recordShareDialog.open && recordShareTarget === target) feedback("record-share-feedback", "recordLinkCopied");
  } catch {
    if (!recordShareDialog.open || recordShareTarget !== target) return;
    selectPublicRecordLink();
  }
});
recordShareDialog.addEventListener("cancel", event => {
  if (recordShareTarget?.updating || recordShareTarget?.sharing) event.preventDefault();
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
  reviewMoveNumbers.setAttribute("aria-pressed", String(showMoveNumbers));
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
  el("review-result").textContent = recordResult(game, { personal: true });
  el("review-mode").textContent = recordModeLabel(game);
  const passes = game.actions ? [0, 0] : game.passes ?? [0, 0];
  if (game.actions) {
    for (const action of game.actions) {
      if (action.type === "pass" && (action.seat === 1 || action.seat === 2)) passes[action.seat - 1]++;
    }
  }
  const black = game.black ?? 1;
  el("review-passes").hidden = !passes.some(Boolean);
  el("review-passes").textContent = t("recordPasses", { black: passes[black - 1], white: passes[2 - black] });
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

function liveGameRow(game, label) {
  const row = el("live-game-row").content.firstElementChild.cloneNode(true);
  const button = row.firstElementChild;
  button.title = label;
  const black = game.black ?? 1;
  row.querySelectorAll(".live-game-player").forEach((playerRow, index) => {
    const profile = recordPlayer(game, index === 0 ? black : 3 - black);
    playerRow.querySelector(".stone").setAttribute("aria-label", t(colorName(index + 1)));
    playerRow.querySelector(".live-game-rank").textContent = recordRank(profile);
    const name = profile.savedName || t("guestNickname");
    const nickname = playerRow.querySelector(".live-game-name");
    nickname.textContent = name;
    nickname.title = name;
  });
  const watchers = row.querySelector(".live-game-watchers");
  watchers.hidden = !Number.isInteger(game.spectators);
  watchers.textContent = watchers.hidden ? "" : t("liveWatchers", { n: game.spectators });
  row.querySelector(".live-game-moves").textContent = t("liveMoves", { n: game.moves });
  button.addEventListener("click", () => openSpectator(game.code));
  return row;
}

function renderChampionship(now = Date.now()) {
  const koreaNow = now + koreaOffset;
  const daysSinceMonday = (new Date(koreaNow).getUTCDay() + 6) % 7;
  const monday = new Date((Math.floor(koreaNow / dayMs) - daysSinceMonday) * dayMs);
  const end = monday.getTime() + 7 * dayMs - koreaOffset;
  const month = NcqLang.date(monday, { month: "long", timeZone: "UTC" });
  const week = NcqLang.num(Math.ceil(monday.getUTCDate() / 7));
  el("lobby-championship").textContent = t("championshipName", { month, week });

  const minutesLeft = Math.ceil((end - now) / 60_000);
  const hoursLeft = Math.floor(minutesLeft / 60);
  const countdown = el("championship-countdown");
  countdown.dateTime = new Date(end).toISOString();
  countdown.textContent = t(hoursLeft >= 24 ? "championshipEndsDays"
    : hoursLeft ? "championshipEndsHours" : "championshipEndsMinutes", {
    days: NcqLang.num(Math.floor(hoursLeft / 24)),
    hours: NcqLang.num(hoursLeft % 24),
    minutes: NcqLang.num(minutesLeft % 60),
  });
}

function renderLobby() {
  if (backend) renderChampionship();
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
    const mode = t(matchMode(game));
    const label = mode + " #" + game.number;
    if (!game.code) return entryRow(label, moves);
    const row = game.players?.length === 2 ? liveGameRow(game, label)
      : entryRow(label, moves + " · " + t("spectate"), () => openSpectator(game.code));
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
  if (spectator) return;
  const rating = backend ? playerStats?.rating : 1500;
  const rank = el("own-rank");
  rank.hidden = !Number.isFinite(rating);
  if (!rank.hidden) rank.textContent = rankName(rankLevel(rating));
}

function renderPlayerCard() {
  const name = ownNickname();
  el("lobby-player-name").textContent = name;
  el("lobby-player-name").title = name;
  el("lobby-player-rank").hidden = el("player-career").hidden = !playerStats;
  const record = el("player-record");
  const rankRecord = playerStats?.rankRecord;
  record.hidden = !rankRecord;
  if (rankRecord) record.textContent = t("lobbyRankRecord", { record: t("careerRecord", rankRecord) });
  if (!playerStats) return;
  const { rating } = playerStats;
  const level = rankLevel(rating);
  el("lobby-player-rank").textContent = rankName(level);
  el("player-rating-value").textContent = t("profileRatingValue", { rating: ratingNumber(rating) });
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

function renderPromotionMeter(meterId, prefix, rating, { previousRating, showSigns = true } = {}) {
  const level = rankLevel(rating);
  const canDemote = level > 0;
  const canPromote = level < 26;
  const lower = canDemote ? rankMinimum(level) : 1500 - (rankMinimum(1) - 1500);
  const upper = canPromote ? rankMinimum(level + 1) : lower + (lower - rankMinimum(level - 1));
  const center = (lower + upper) / 2;
  const comparing = previousRating !== undefined;
  const start = comparing ? Math.min(lower, previousRating, rating) : lower;
  const end = comparing ? Math.max(upper, previousRating, rating) : upper;
  const position = score => Math.max(0, Math.min(100, 100 * (score - start) / (end - start)));
  const signed = new Intl.NumberFormat(NcqLang.lang, { signDisplay: "exceptZero" });
  const displayNumber = showSigns ? signed : new Intl.NumberFormat(NcqLang.lang, { signDisplay: "never" });
  const currentOffset = rating - center;
  const lowerOffset = lower - center;
  const upperOffset = upper - center;
  const lowLabel = canDemote ? t("demotion") : t("lowestRank");
  const highLabel = canPromote ? t("promotion") : t("highestRank");
  const meter = el(meterId);
  const to = position(rating);
  meter.style.setProperty("--promotion-position", `${to}%`);
  const announcement = {
    value: signed.format(currentOffset),
    lowLabel,
    lowTick: canDemote ? signed.format(lowerOffset) : "—",
    highLabel,
    highTick: canPromote ? signed.format(upperOffset) : "—",
  };
  if (comparing) {
    const from = position(previousRating);
    meter.style.setProperty("--promotion-start", `${from}%`);
    meter.style.setProperty("--promotion-change-left", `${Math.min(from, to)}%`);
    meter.style.setProperty("--promotion-change-right", `${Math.max(from, to)}%`);
    meter.style.setProperty("--promotion-band-start", `${position(lower)}%`);
    meter.style.setProperty("--promotion-band-end", `${position(upper)}%`);
    const previousOffset = previousRating - center;
    el(`${prefix}-previous`).textContent = displayNumber.format(previousOffset);
    announcement.previous = signed.format(previousOffset);
  }
  meter.setAttribute("aria-label", t(comparing ? "resultPromotionMeter" : "promotionMeter", announcement));
  el(`${prefix}-value`).textContent = displayNumber.format(currentOffset);
  el(`${prefix}-lower-label`).textContent = lowLabel;
  el(`${prefix}-upper-label`).textContent = highLabel;
  el(`${prefix}-lower`).textContent = canDemote ? displayNumber.format(lowerOffset) : "—";
  el(`${prefix}-upper`).textContent = canPromote ? displayNumber.format(upperOffset) : "—";
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
  const { game, opponentLevel } = matchIntro;
  const opponent = recordPlayer(room?.code === game.code ? room : game, 3 - game.you);
  const opponentRating = matchIntro.opponentRating ?? opponent.rating;
  const ownRating = playerStats?.rating;
  el("match-intro-own-name").textContent = ownNickname();
  const level = Number.isFinite(opponentRating) ? rankLevel(opponentRating) : opponentLevel;
  const name = opponent.name;
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
  const intro = { game, opponentRating: null, opponentLevel: game.botLevel };
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
  const saved = seat && game && (!own || game.phase === "finished") ? recordPlayer(game, seat) : null;
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
  const overallWinRate = winRate(stats);
  el("profile-win-rate").hidden = !own;
  el("profile-opponent-win-rate-row").hidden = own;
  if (own) el("profile-win-rate").textContent = t("profileWinRate", { rate: overallWinRate });
  else el("profile-opponent-win-rate").textContent = overallWinRate;
  el("profile-rank-record-row").hidden = !rankRecord;
  if (rankRecord) {
    el("profile-rank-record").textContent = t("careerRecord", rankRecord);
    el("profile-rank-win-rate").textContent = t("profileWinRate", { rate: winRate(rankRecord) });
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
  row.querySelector(".record-summary").textContent = recordDate(game.finishedAt) + " · " + recordResult(game, { personal: true });
  const context = [recordRank(own), own.name].filter(Boolean).join(" ");
  const mode = t(game.device ? "deviceRecord" : game.mode === "tournament" ? "weeklyTournament" : "casualMatch");
  row.querySelector(".record-context").textContent = mode + " · " + context;
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
  const tournamentOnly = recordsReturnView === "tournament";
  el("records-heading").textContent = t(tournamentOnly ? "tournamentRecords" : "recordList");
  const visible = records.filter(game => recordFilter === "all" ||
    (recordFilter === "favorites" ? saved.has(game.id) : describeOutcome(game) === "won"));
  for (const button of el("record-filters").querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === recordFilter));
  }
  const empty = el("records-empty");
  empty.hidden = visible.length > 0;
  empty.textContent = t({ all: tournamentOnly ? "noTournamentRecords" : "noRecords",
    favorites: "recordNoFavorites", wins: "recordNoWins" }[recordFilter]);
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
  el("result-summary").textContent = game.winner ? recordResult(game) : t("resultDraw", { n: game.moves.length });
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
  renderPromotionMeter("result-promotion-meter", "result-promotion", after, { previousRating: before, showSigns: false });
}

function render() {
  if (profileDialog.open) renderPlayerProfile();
  renderRecordSharing();
  if (matchIntroDialog.open) renderMatchIntro();
  const game = room ?? archive ?? spectator?.game;
  const playing = !spectator && game?.phase === "playing";
  const finished = !spectator && game?.phase === "finished";
  const sharedReview = Boolean(finished && game.sharedView);
  const liveLayout = playing || Boolean(spectator);
  nicknameInput.placeholder = playerNickname || t("guestNickname");
  el("language").value = NcqLang.lang;
  document.title = t("title");
  document.body.classList.toggle("in-match", Boolean(game));
  document.body.classList.toggle("match-art-backdrop", liveLayout);
  document.body.classList.toggle("spectating", Boolean(spectator));
  document.body.classList.toggle("in-review", finished);
  document.body.classList.toggle("shared-review", sharedReview);
  document.body.classList.toggle("in-records", !game && lobbyView === "records");
  el("match").toggleAttribute("data-playing", liveLayout);
  el("match").toggleAttribute("data-taraguchi", liveLayout && game.rule === "taraguchi");
  for (const view of ["lobby", "records", "tournament"]) {
    el(view).hidden = Boolean(game) || lobbyView !== view;
  }
  el("match").hidden = !game;
  el("watch-back").hidden = !spectator;
  el("watch-back").toggleAttribute("data-ncq-main", Boolean(spectator));
  el("review-header").hidden = !finished;
  el("review-opponent-profile").hidden = !finished || el("result").open;
  const reviewActionsVisible = finished && !el("result").open && !profileDialog.open && !recordShareDialog.open;
  el("review-back").toggleAttribute("data-ncq-main", reviewActionsVisible && !sharedReview);
  reviewPlay.hidden = !sharedReview;
  reviewPlay.toggleAttribute("data-ncq-main", reviewActionsVisible && sharedReview);
  el("show-shop").hidden = Boolean(game);
  el("lobby-wallet").hidden = Boolean(game);
  renderCoinBalance();
  if (!game) renderDailyMissions();
  if (shop.open) renderShop();
  const nav = el("lobby-nav");
  nav.hidden = Boolean(game);
  for (const button of nav.querySelectorAll("button[aria-controls]")) {
    if (button.getAttribute("aria-controls") === lobbyView) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
    button.disabled = busy;
  }
  const mainAction = !game && !matchmaking && !shop.open && !missionDialog.open && !optionsDialog.open
    && !ruleDialog.open && !profileDialog.open && !recordShareDialog.open;
  el("start").disabled = busy || Boolean(matchmaking);
  el("show-records").disabled = busy || Boolean(matchmaking);
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
  const canJoinTournament = Boolean(backend) && rankingTab === "weekly";
  const tournamentStatus = rankingResults.weekly?.result;
  const attempts = tournamentStatus?.remaining;
  const attemptsLabel = el("tournament-attempts");
  el("tournament-entry").hidden = !canJoinTournament;
  attemptsLabel.hidden = attempts !== 0;
  attemptsLabel.textContent = t("tournamentLimit");
  joinTournament.textContent = Number.isInteger(attempts)
    ? t("joinTournamentAttempts", { remaining: attempts, limit: tournamentStatus.dailyLimit })
    : t("joinTournament");
  el("tournament-records").disabled = busy || Boolean(matchmaking);
  joinTournament.disabled = busy || Boolean(matchmaking) || !(attempts > 0);
  const joinVisible = canJoinTournament && !joinTournament.disabled;
  joinTournament.toggleAttribute("data-ncq-main", mainAction && lobbyView === "tournament" && joinVisible);
  el("show-lobby").toggleAttribute("data-ncq-main", mainAction && lobbyView === "tournament" && !joinVisible);
  el("records-back").toggleAttribute("data-ncq-main", mainAction && lobbyView === "records");
  if (!el("lobby").hidden) renderLobby();
  if (!el("records").hidden) renderRecords();
  if (!el("tournament").hidden) renderRankings();
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
  const canRematch = !game.bot && game.mode !== "tournament" && game.canRematch !== false
    && game.endReason !== "resign" && game.endReason !== "disconnect";
  reviewRoomAction.hidden = !finished || !room;
  reviewRoomAction.toggleAttribute("data-ncq-main", reviewActionsVisible && Boolean(room));
  reviewRoomAction.dataset.action = canRematch ? "rematch" : "leave";
  reviewRoomAction.disabled = busy || (canRematch && (!connected || game.requested));
  reviewRoomAction.textContent = t(!canRematch ? "leave" : game.requested ? "rematchWaiting" : game.rematch ? "rematchReady" : "rematch");

  if (finished) {
    renderResult(game);
    renderReview(game);
    renderReplayControls(reviewPly, game.moves.length);
  }

  board.toggleAttribute("inert", !playing && !finished);
  drawGamePosition(game, finished ? reviewPly : game.moves.length, finished);
}

function renderReplayControls(ply, total, watching = false) {
  el("review-ply").textContent = ply;
  el("review-total").textContent = " / " + total;
  for (const button of el("review").querySelectorAll("[data-step]")) {
    const step = button.dataset.step;
    button.disabled = ["first", "previous"].includes(step) ? ply === 0 : ply === total;
    button.toggleAttribute("data-ncq-main", watching && !button.disabled);
    if (step === "last") button.setAttribute("aria-label", t(watching ? "watchLatestMove" : "lastMove"));
  }
}

function drawGamePosition(game, ply, reviewing = false) {
  const latest = ply === game.moves.length;
  let displayedBoard = game.board;
  if (!latest || game === archive || !displayedBoard) {
    displayedBoard = Array(cells.length).fill(0);
    for (let i = 0; i < ply; i += 1) displayedBoard[game.moves[i]] = moveColor(game, i);
  }
  const moveNumbers = reviewing && showMoveNumbers ? Array(cells.length) : null;
  if (moveNumbers) {
    for (let i = 0; i < ply; i += 1) moveNumbers[game.moves[i]] = i + 1;
  }
  const showReplayFouls = reviewing && !latest && hasForbiddenMoves(game.rule)
    && moveColor(game, ply) === 1 && (game.rule !== "taraguchi" || ply >= 6);
  drawBoard(game, displayedBoard, game.moves[ply - 1], latest ? game.line ?? [] : [], {
    latest, moveNumbers, showReplayFouls,
  });
}

function drawBoard(game, displayedBoard, last, winning, { latest, moveNumbers, showReplayFouls }) {
  const selectable = canAct();
  const ownTurn = game === room && game.phase === "playing" && game.turn === game.you;
  const limits = ownTurn ? moveLimits(game) : [];
  const offers = latest && game.phase === "playing" ? game.offers ?? [] : [];
  board.classList.toggle("selectable", selectable);
  board.toggleAttribute("data-move-numbers", Boolean(moveNumbers));
  const lastCell = cells[last];
  lastMoveMarker.toggleAttribute("hidden", !lastCell);
  if (lastCell && lastMoveMarker.parentElement !== lastCell) lastCell.append(lastMoveMarker);
  for (const [index, cell] of cells.entries()) {
    const stone = displayedBoard[index];
    const isSelected = selected === index;
    const displayed = isSelected ? game.stone ?? seatColor(game, game.you) : stone;
    const restriction = showReplayFouls ? forbiddenAt(displayedBoard, index, game.rule) : limits[index];
    const foul = foulMarkers[restriction];
    const offer = offers.indexOf(index) + 1;
    cell.dataset.stone = stone;
    if (foul) cell.dataset.foul = foul;
    else cell.removeAttribute("data-foul");
    cell.toggleAttribute("data-outside-opening", restriction === "outsideOpening" || restriction === "chooseOffered");
    if (offer) cell.dataset.offer = offer;
    else cell.removeAttribute("data-offer");
    cell.classList.toggle("selected", isSelected);
    cell.classList.toggle("win", winning.includes(index));
    const stoneElement = cell.firstElementChild;
    const moveNumber = moveNumbers?.[index];
    const numberText = moveNumber ? String(moveNumber) : "";
    stoneElement.hidden = !displayed;
    stoneElement.className = "stone " + (displayed === 1 ? "black" : "white");
    if (stoneElement.textContent !== numberText) stoneElement.textContent = numberText;
    const cellLabel = t(["square", "blackSquare", "whiteSquare"][stone], { cell: coordinate(index) });
    const detail = restriction ? t(restriction) : offer ? t("fifthCandidate", { n: offer })
      : moveNumber ? t("moveNumber", { n: moveNumber }) : "";
    cell.setAttribute("aria-label", detail ? cellLabel + ". " + detail : cellLabel);
    cell.title = detail;
    cell.setAttribute("aria-selected", String(isSelected));
    cell.setAttribute("aria-disabled", String(!selectable || Boolean(stone) || Boolean(restriction)));
  }
}

function renderSpectator({ game, closed, reconnecting, ply }) {
  let announcement;
  if (closed) announcement = t("watchEnded");
  else if (reconnecting) announcement = t("reconnecting");
  else if (game.phase === "finished") {
    announcement = game.winner ? t("watchWinner", { color: sideName(game, game.winner) }) : t("draw");
  } else if (game.opening) {
    announcement = openingStatus(game);
  } else announcement = t("watchTurn", { color: sideName(game, game.turn) });
  const current = ply ?? game.moves.length;
  const live = !closed && !reconnecting && game.phase === "playing";
  const heading = ply !== null ? t("watchReplay", { n: current })
    : live && !game.opening ? t(matchMode(game)) + " · " + t("movesCount", { n: current }) : announcement;
  const status = el("status");
  status.setAttribute("aria-live", live ? "off" : "polite");
  if (status.textContent !== heading) status.textContent = heading;
  if (el("turn-announcement").textContent !== announcement) el("turn-announcement").textContent = announcement;
  el("room-bar").hidden = reviewRoomAction.hidden = el("invite").hidden = true;
  el("review").hidden = false;
  const place = el("place");
  place.disabled = true;
  place.removeAttribute("data-ncq-main");
  const lowerLabel = t(live && game.turn === (game.black ?? 1) ? "turnActive" : "turnWaiting");
  el("place-text").textContent = lowerLabel;
  place.setAttribute("aria-label", lowerLabel);
  place.title = lowerLabel;
  renderPlayers(game, false, true);
  renderReplayControls(current, game.moves.length, true);
  board.removeAttribute("inert");
  drawGamePosition(game, current);
}

const version = window.NCQ?.NCQ_VERSION;
el("app-version").textContent = version ? "v" + version : "dev";

function loadMatchAds() {
  try {
    const saved = JSON.parse(localStorage.getItem(matchAdsKey));
    if (Array.isArray(saved?.freeRounds) && Number.isFinite(saved.lastShownAt)) return saved;
  } catch {}
  return matchAds;
}

function saveMatchAds(next) {
  matchAds = next;
  try { localStorage.setItem(matchAdsKey, JSON.stringify(next)); } catch {}
}

function recordCompletedRound(roundKey) {
  const progress = loadMatchAds();
  if (progress.freeRounds.includes(roundKey)) return;
  if (progress.freeRounds.length < 3) {
    saveMatchAds({ ...progress, freeRounds: [...progress.freeRounds, roundKey] });
    return;
  }
  resultAdRound = roundKey;
}

async function showMatchAd(roundKey) {
  if (adsRemoved || !NcqAds?.can("MATCH_END")) return;
  await adOwnershipReady;
  const show = async () => {
    if (adsRemoved || document.hidden || room?.phase !== "finished" || `${room.code}:${room.round}` !== roundKey) return;
    const progress = loadMatchAds();
    if (progress.lastAttemptedRound === roundKey || Date.now() - progress.lastShownAt < matchAdCooldown) return;
    saveMatchAds({ ...progress, lastAttemptedRound: roundKey });
    const shell = document.querySelector(".shell");
    shell.inert = true;
    try {
      stopPlacementSound();
      // NCQ_ADS_MATCH_END: 대국 종료 전면 광고
      if (await NcqAds.interstitial("MATCH_END")) saveMatchAds({ ...loadMatchAds(), lastShownAt: Date.now() });
    } finally {
      shell.inert = false;
    }
  };
  try {
    if (navigator.locks) {
      await navigator.locks.request(matchAdsKey, { ifAvailable: true }, lock => lock && show());
    } else {
      await show();
    }
  } catch {
    // Continue to the review if the ad cannot be displayed.
  }
}

function applyState(next) {
  if (room?.code === next.code && next.version <= room.version) {
    if (next.version === room.version && next.players) room = { ...room, players: next.players };
    return;
  }
  const showResult = next.phase === "finished" && (room?.phase !== "finished" || room.round !== next.round);
  const placed = room?.code === next.code && room.round === next.round && room.phase === "playing"
    && next.moves.length === room.moves.length + 1 ? next.moves.at(-1) : null;
  const lastAction = next.actions?.at(-1);
  const moveSeat = lastAction?.type === "move" ? lastAction.seat : null;
  const ownMove = placed != null && (moveSeat ?? room.turn) === next.you;
  room = next;
  turnDeadline = clockDeadline(next);
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
    if (room.moves.length) recordCompletedRound(roundKey);
    void recordMissionRound(room, roundKey);
  }
  if (room.phase === "finished" && !backend) saveRecord(room);
  render();
  const placement = presentPlacement(placed, ownMove);
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
  const tournamentMatch = room?.mode === "tournament";
  stream?.close();
  stream = null;
  connected = false;
  resultAdRound = null;
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
  if (tournamentMatch) showRankings();
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

function spectatorUrl(code, viewer) {
  const base = boardApiUrl ? boardApiUrl + "/" : document.baseURI;
  const url = new URL("api/spectate/" + encodeURIComponent(code), base);
  if (viewer) url.searchParams.set("viewer", viewer);
  return url;
}

async function fetchSpectator(code, viewer) {
  try {
    const response = await fetch(spectatorUrl(code, viewer), {
      credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3500),
    });
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
    const renew = session.viewer && performance.now() >= session.renewAt;
    const request = fetchSpectator(session.game.code, renew ? session.viewer : null);
    if (renew) session.pendingPresence = request;
    const next = await request;
    if (renew) {
      session.pendingPresence = null;
      if (!next.error) session.renewAt = performance.now() + 5000;
    }
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
      session.deadline = clockDeadline(next);
      if (previous.round !== next.round) session.ply = null;
      session.reconnecting = false;
      render();
      if (session.ply === null && previous.round === next.round && next.moves.length === previous.moves.length + 1) {
        presentPlacement(next.moves.at(-1));
      }
    }
  }
  scheduleSpectator(session);
}

async function openSpectator(code) {
  if (room || archive || spectator || matchmaking || busy) return;
  const viewer = crypto.randomUUID?.();
  await run(async () => {
    const game = await fetchSpectator(code, viewer);
    if (game.error !== "notFound") return game;
    refreshLobby();
    return { error: "watchEnded" };
  }, game => {
    selected = null;
    feedback("match-error");
    spectator = {
      game, viewer, renewAt: performance.now() + 5000, pendingPresence: null,
      ply: null, deadline: clockDeadline(game), closed: false, reconnecting: false, timer: null,
    };
    scheduleSpectator(spectator);
  });
  (spectator ? el("status") : el("lobby-heading")).focus();
}

async function releaseSpectator(session) {
  // An in-flight renewal must reach the server before the leave request.
  await session.pendingPresence;
  try {
    await fetch(spectatorUrl(session.game.code, session.viewer), {
      method: "POST", credentials: "omit", keepalive: true, redirect: "error", signal: AbortSignal.timeout(3500),
    });
  } catch {
    // If the connection is lost, presence expires on the server.
  }
  refreshLobby();
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
      if (["notFound", "forbidden", "authFailed", "tournamentClosed"].includes(next.error)) {
        if (next.error === "notFound") {
          if (room?.phase === "playing") {
            // The other player can leave before this client polls the finished room.
            const history = await remoteRequest(client => client.gameRequest("/records"));
            if (stream !== polling) return;
            if (room.phase === "playing") {
              const result = Array.isArray(history) && history.find(record => record.id === code + ":" + room.round);
              if (result) {
                connected = false;
                applyState({ ...result, code, phase: "finished", version: room.version + 1, canRematch: false });
                return;
              }
            }
          }
          if (room?.phase === "finished") {
            connected = false;
            room.canRematch = false;
            render();
            return;
          }
        }
        exitRoom(["authFailed", "tournamentClosed"].includes(next.error) ? next.error : "closed");
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
  run(async () => {
    const next = await post("/rooms/" + code + "/" + action, input, client => client[action](code, input));
    if (action === "leave" && next.error === "notFound") return {};
    return next;
  }, next => {
    if (room?.code === code) success(next);
  });
}

function join(code) {
  run(() => post("/rooms/" + code + "/join", { nickname: ownNickname() }, client => client.join(code)), openRoom);
}

function closeMatching(message = "") {
  const tournamentMatch = matchmaking?.mode === "tournament";
  matchmaking = null;
  el("matchmaking").close();
  feedback("lobby-error", message, Boolean(message));
  render();
  (tournamentMatch ? el("ranking-weekly-tab") : el("start")).focus();
  if (tournamentMatch && lobbyView === "tournament") loadRankings("weekly");
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
  if (matchmaking || (mode === "tournament" && !(rankingResults.weekly?.result?.remaining > 0))) return;
  const job = { canceled: false, mode, rule: mode === "tournament" ? "renju" : activeRule() };
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

function showRecords() {
  const source = lobbyView;
  const tournamentOnly = source === "tournament";
  run(async () => {
    if (backend) {
      const result = await remoteRequest(client => client.gameRequest(tournamentOnly ? "/records?mode=tournament" : "/records"));
      if (Array.isArray(result)) {
        const device = tournamentOnly ? [] : [...loadRecords(), ...loadRecords(recordsKey)].map(game => [game.id, { ...game, device: true }]);
        const remote = tournamentOnly ? result.filter(game => game.mode === "tournament") : result;
        const combined = new Map([...device, ...remote.map(game => [game.id, game])]);
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
    if (recordsReturnView !== source) recordFilter = "all";
    recordsReturnView = source;
    lobbyView = "records";
    render();
    el("records-heading").focus();
  });
}
el("show-records").addEventListener("click", showRecords);
el("tournament-records").addEventListener("click", showRecords);
function showRankings() {
  lobbyView = "tournament";
  rankingTab = "weekly";
  for (const state of Object.values(rankingResults)) clearTimeout(state.refresh);
  rankingResults = {};
  feedback("lobby-error");
  render();
  el("tournament-title").focus();
  loadRankings("weekly");
}
el("show-tournament").addEventListener("click", showRankings);
el("show-rankings").addEventListener("click", showRankings);
el("join-tournament").addEventListener("click", () => startMatching("tournament"));

const rankingTabs = [...el("ranking-tabs").querySelectorAll("button")];
for (const button of rankingTabs) {
  const tab = button.dataset.ranking;
  button.addEventListener("click", () => {
    rankingTab = tab;
    render();
    if (!rankingResults[tab]) loadRankings(tab);
  });
  el("ranking-" + tab + "-retry").addEventListener("click", () => {
    el("ranking-" + tab + "-panel").focus();
    loadRankings(tab, rankingResults[tab]?.page);
  });
}
el("ranking-tabs").addEventListener("keydown", event => {
  const index = rankingTabs.indexOf(event.target);
  const length = rankingTabs.length;
  const destinations = {
    ArrowLeft: (index + length - 1) % length,
    ArrowRight: (index + 1) % length,
    Home: 0,
    End: length - 1,
  };
  const button = rankingTabs[destinations[event.key]];
  if (!button) return;
  event.preventDefault();
  button.focus();
  button.click();
});
for (const [direction, step] of [["prev", -1], ["next", 1]]) {
  el("ranking-" + direction).addEventListener("click", event => {
    if (event.currentTarget.getAttribute("aria-disabled") === "true") return;
    loadRankings("rating", rankingResults.rating.page + step);
  });
}

async function loadRankings(tab, page = 1) {
  if (!backend || rankingResults[tab]?.loading) return;
  clearTimeout(rankingResults[tab]?.refresh);
  const state = { page, loading: true };
  rankingResults[tab] = state;
  const visible = () => lobbyView === "tournament" && rankingTab === tab && rankingResults[tab] === state;
  if (visible()) render();
  const path = tab === "rating" ? "/rankings/rating?page=" + page
    : tab === "previous" ? "/tournament?view=previous" : "/tournament";
  state.result = await remoteRequest(client => client.gameRequest(path));
  state.loading = false;
  if (rankingResults[tab] !== state) return;
  const { resetsAt, serverNow, finalized, finalizesAt } = state.result;
  const refreshAt = tab === "previous" && finalized === false ? finalizesAt : resetsAt;
  const refreshAfter = Date.parse(refreshAt) - Date.parse(serverNow);
  if (Number.isFinite(refreshAfter)) {
    state.refresh = setTimeout(() => {
      if (rankingResults[tab] !== state) return;
      delete rankingResults[tab];
      if (lobbyView === "tournament" && rankingTab === tab) loadRankings(tab, page);
    }, Math.max(1000, refreshAfter + 100));
  }
  if (visible()) {
    render();
    el("ranking-" + tab + "-list").scrollTop = 0;
  }
}

function rankingCard(row, { rating = false, pinned = false } = {}) {
  const card = el("ranking-card-template").content.firstElementChild.cloneNode(true);
  const own = pinned || row.you;
  card.toggleAttribute("data-own-ranking", Boolean(own));
  const place = card.querySelector(".ranking-place");
  const position = t("rankingPosition", { rank: ratingNumber(row.rank) });
  place.textContent = ratingNumber(row.rank);
  place.title = position;
  place.hidden = pinned;
  if (!pinned && row.rank <= 3) place.dataset.medal = row.rank;

  const badge = card.querySelector(".player-card-badge");
  badge.hidden = !own;
  if (own) badge.textContent = t("playerInfo");
  const photo = card.querySelector("img");
  photo.addEventListener("error", () => { photo.hidden = true; }, { once: true });
  setRecordPhoto(photo, own ? { photoUrl: playerPhoto } : row);
  const rank = card.querySelector(".player-card-rank");
  const label = recordRank({ rating: own ? playerStats?.rating ?? row.rating : row.rating });
  rank.textContent = label;
  rank.hidden = !label;
  const name = card.querySelector(".player-card-name");
  name.textContent = name.title = own ? ownNickname() : row.nickname || t("playerAlias", { alias: row.alias });

  const record = card.querySelector(".player-card-record");
  record.hidden = ![row.wins, row.draws, row.losses].every(Number.isInteger);
  if (!record.hidden) record.textContent = t("careerRecord", row) + " · " + t("profileWinRate", { rate: winRate(row) });
  card.querySelector(".ranking-card-score strong").textContent = rating
    ? t("profileRatingValue", { rating: ratingNumber(row.rating) })
    : t("pointsCount", { n: row.points });
  const detail = card.querySelector(".ranking-card-score small");
  detail.hidden = !pinned;
  if (pinned) detail.textContent = position;
  return card;
}

function renderRankings() {
  for (const button of rankingTabs) {
    const selected = button.dataset.ranking === rankingTab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    el(button.getAttribute("aria-controls")).hidden = !selected;
  }
  const rating = rankingTab === "rating";
  const previous = rankingTab === "previous";
  const state = rankingResults[rankingTab];
  const result = state?.result;
  const rows = result?.standings ?? [];
  const summary = el("ranking-" + rankingTab + "-summary");
  summary.hidden = !result || Boolean(result.error);
  if (!summary.hidden) {
    const total = result.total ?? rows.length;
    summary.querySelector("span").textContent = t("rankingPlayerCount", { n: total, count: ratingNumber(total) });
  }
  const message = el("ranking-" + rankingTab + "-message");
  const empty = rating ? "noRatingStandings" : previous
    ? result?.finalized === false ? "tournamentFinalizing" : "noPreviousStandings"
    : "noStandings";
  message.textContent = t(!backend ? "rankingsUnavailable" : result?.error ? "rankingsLoadFailed" : result ? empty : "rankingsLoading");
  message.hidden = rows.length > 0;
  el("ranking-" + rankingTab + "-retry").hidden = !result?.error;
  const standings = rating ? "rating-standings" : previous ? "previous-standings" : "standings";
  el(standings).replaceChildren(...rows.map(row => {
    const entry = document.createElement("li");
    entry.append(rankingCard(row, { rating }));
    return entry;
  }));
  if (!rating) {
    const dates = el("ranking-" + rankingTab + "-dates");
    dates.hidden = !result?.startsAt;
    if (!dates.hidden) {
      const date = value => NcqLang.date(value, { month: "short", day: "numeric", timeZone: "Asia/Seoul" });
      dates.textContent = date(Date.parse(result.startsAt)) + " – " + date(Date.parse(result.endsAt) - 1);
      if (previous) dates.textContent += " · " + t(result.finalized ? "tournamentFinalized" : "tournamentFinalizing");
    }
    const own = el("ranking-" + rankingTab + "-own");
    own.hidden = !result?.own;
    own.replaceChildren(...(result?.own ? [rankingCard(result.own, { pinned: true })] : []));
  } else {
    const page = state?.page ?? 1;
    const pagination = el("ranking-pagination");
    pagination.hidden = page === 1 && !result?.hasMore && (!state?.loading || pagination.hidden);
    el("ranking-page").textContent = t("rankingPage", { page: ratingNumber(page) });
    el("ranking-prev").setAttribute("aria-disabled", String(page === 1 || state?.loading === true));
    el("ranking-next").setAttribute("aria-disabled", String(!result?.hasMore || state?.loading === true));
  }
}
function showLobby() {
  if (lobbyView === "lobby") return;
  const fromRecords = lobbyView === "records";
  lobbyView = "lobby";
  feedback("lobby-error");
  render();
  refreshLobby();
  el(fromRecords ? "show-records" : "lobby-heading").focus();
}
el("show-lobby").addEventListener("click", showLobby);
el("records-back").addEventListener("click", () => {
  if (recordsReturnView === "tournament") {
    showRankings();
    el("tournament-records").focus();
  } else {
    showLobby();
  }
});
el("record-filters").addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  recordFilter = button.dataset.filter;
  renderRecords();
  el("record-list").parentElement.scrollTop = 0;
});
function leaveMatch() {
  if (spectator) {
    const session = spectator;
    clearTimeout(session.timer);
    cancelAnimationFrame(turnFrame);
    spectator = null;
    cancelPlacement();
    render();
    refreshLobby();
    if (session.viewer) releaseSpectator(session);
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
    if (next.phase === "finished") {
      if (resigning) void recordMissionRound(next, next.code + ":" + next.round);
      if (!backend) saveRecord(next);
    }
    exitRoom();
  });
}
el("leave").addEventListener("click", leaveMatch);
el("watch-back").addEventListener("click", leaveMatch);
el("leave-match").addEventListener("click", leaveMatch);
el("review-back").addEventListener("click", leaveMatch);
reviewMoveNumbers.addEventListener("click", () => {
  showMoveNumbers = !showMoveNumbers;
  render();
});
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
  if (!canAct() || room.opening || !hasForbiddenMoves(room.rule)) return;
  if (!window.confirm(t("confirmPass")) || !canAct()) return;
  roomAction("move", { action: { type: "pass" }, version: room.version });
});
reviewRoomAction.addEventListener("click", () => {
  if (reviewRoomAction.dataset.action === "leave") leaveMatch();
  else roomAction("rematch", {});
});
el("review").addEventListener("click", event => {
  const button = event.target.closest("[data-step]");
  const game = room ?? archive ?? spectator?.game;
  if (!button || button.disabled || (!spectator && game?.phase !== "finished")) return;
  const step = button.dataset.step;
  const last = game.moves.length;
  const before = spectator ? spectator.ply ?? last : reviewPly;
  const destination = { first: 0, previous: before - 1, next: before + 1, last };
  const ply = Math.max(0, Math.min(last, destination[step]));
  if (spectator) spectator.ply = ply === last ? null : ply;
  else reviewPly = ply;
  render();
  if (step === "next" && ply > before) presentPlacement(game.moves[before]);
  else cancelPlacement();
  if (button.disabled) {
    el("review").querySelector(ply ? '[data-step="previous"]' : '[data-step="next"]').focus();
  }
});
el("result").addEventListener("close", async () => {
  const roundKey = resultAdRound;
  resultAdRound = null;
  render();
  if (roundKey) await showMatchAd(roundKey);
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

const adOwnershipReady = initializeAdPurchase();
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
scheduleMissionReset();
if (lobbyView === "tournament" && !rankingResults[rankingTab]) loadRankings(rankingTab);
refreshLobby();
for (const image of [...playerPhotos, el("profile-photo")]) {
  image.addEventListener("load", () => { image.hidden = !image.hasAttribute("src"); });
  image.addEventListener("error", () => { image.hidden = true; });
}
if (shareId === null) refreshPlayerCard();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) renderDailyMissions();
  refreshLobby();
});
setInterval(refreshLobby, 2500);
