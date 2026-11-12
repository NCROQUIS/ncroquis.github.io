import { resource, titleUnderline } from "./lobby-layout.js?v=e11c711efdfa";
import { rankingPageLimit } from "./ranking-pages.js?v=e11c711efdfa";

export const rankingReference = { width: 678, border: 2 };

export function fitRankingPage(available, chrome, rowHeight, gap, rows) {
  const capacity = Math.max(1, Math.min(rankingPageLimit,
    Math.floor((Math.max(0, available - chrome) + gap) / (rowHeight + gap))));
  const visible = Math.min(rows, capacity);
  const listHeight = visible ? visible * rowHeight + (visible - 1) * gap : 0;
  return { capacity, height: Math.min(available, chrome + listHeight) };
}

export function installMeasuredRankings(dialog, onCapacity = () => {}) {
  const el = id => document.getElementById(id);
  const stage = dialog.firstElementChild;
  stage.classList.add("ranking-stage");
  const art = (parent, name, className, panel) =>
    resource(parent, name, "ranking-resource " + className, panel);

  art(el("tournament").querySelector(".list-heading"), "trophy", "ranking-trophy");
  el("tournament").querySelector(".list-heading").append(titleUnderline("ranking-title-underline"));
  el("show-lobby").textContent = "";
  art(el("show-lobby"), "round", "ranking-close-surface");

  art(el("join-tournament"), "primary", "ranking-primary-surface", [622, 96, 55, 46]);
  for (const reward of document.querySelectorAll(".weekly-reward")) {
    art(reward.querySelector(".weekly-reward-icon"), "round", "ranking-reward-icon-surface");
  }

  let capacityQueued = false;
  let capacity = rankingPageLimit;
  const resize = () => {
    if (!dialog.open || !dialog.clientWidth) return;
    const designWidth = rankingReference.width - 2 * rankingReference.border;
    const scale = dialog.clientWidth / designWidth;
    dialog.style.setProperty("--ranking-scale", scale);
    stage.style.width = designWidth + "px";
    stage.style.height = "auto";
    stage.style.transform = `scale(${scale})`;
    stage.dataset.sized = "true";
    const panel = el("tournament").querySelector(".ranking-panel:not([hidden])");
    if (!panel) return;
    const list = panel.querySelector(".ranking-cards");
    const row = list.querySelector(".ranking-card");
    const rowHeight = row ? parseFloat(getComputedStyle(row).height) || 64 : 64;
    const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
    const style = getComputedStyle(dialog);
    const maxHeight = parseFloat(style.maxHeight) ||
      innerHeight - (parseFloat(style.top) || 0) - (parseFloat(style.bottom) || 0) - 20;
    const border = 2 * rankingReference.border;
    const chrome = stage.offsetHeight - list.offsetHeight;
    const fitted = fitRankingPage((maxHeight - border) / scale, chrome,
      rowHeight, gap, list.children.length);
    capacity = fitted.capacity;
    dialog.style.setProperty("--ranking-content-height", fitted.height * scale + border + "px");
    if (!capacityQueued) {
      capacityQueued = true;
      queueMicrotask(() => { capacityQueued = false; onCapacity(capacity); });
    }
  };
  const observer = new ResizeObserver(resize);
  observer.observe(dialog);
  observer.observe(stage);
  return resize;
}
