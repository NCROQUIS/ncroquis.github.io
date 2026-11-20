import { primaryButtonSurface, resource } from "./lobby-layout.js?v=689216405a77";
import { installListDialog } from "./list-dialog.js?v=689216405a77";
import { rankingPageLimit, rankingPageTarget } from "./ranking-pages.js?v=689216405a77";

export function installMeasuredRankings(dialog, onCapacity = () => {}) {
  const el = id => document.getElementById(id);
  const art = (parent, name, className, panel) =>
    resource(parent, name, "ranking-resource " + className, panel);

  const join = el("join-tournament");
  let joinSurface;
  new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0];
    const width = box?.inlineSize ?? join.offsetWidth;
    const height = box?.blockSize ?? join.offsetHeight;
    if (!width || !height) return;
    joinSurface?.remove();
    joinSurface = primaryButtonSurface(join, "ranking-resource ranking-primary-surface", width, height,
      { sourceCap: 55, capRatio: 46 / 96 });
  }).observe(join);
  for (const reward of document.querySelectorAll(".weekly-reward")) {
    art(reward.querySelector(".weekly-reward-icon"), "round", "ranking-reward-icon-surface");
  }

  let capacityQueued = false;
  let capacity = rankingPageTarget;
  return installListDialog(dialog, {
    title: el("tournament-title"), close: el("show-lobby"), icon: "trophy", tabs: el("ranking-tabs"),
    onResize(scale) {
      const panel = el("tournament").querySelector(".ranking-panel:not([hidden])");
      if (!panel) return;
      const list = panel.querySelector(".ranking-cards");
      const row = list.querySelector(".ranking-card");
      const rowHeight = row ? parseFloat(getComputedStyle(row).height) || 64 : 64;
      const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
      const body = panel.querySelector(".list-body").getBoundingClientRect();
      const reward = panel.querySelector(".weekly-reward:not([hidden])");
      const top = reward ? reward.getBoundingClientRect().bottom + 18 * scale : body.top;
      const room = Math.max(0, (body.bottom - top) / scale - 5);
      capacity = Math.max(1, Math.min(rankingPageLimit,
        Math.floor((room + gap) / (rowHeight + gap))));
      if (!capacityQueued) {
        capacityQueued = true;
        queueMicrotask(() => { capacityQueued = false; onCapacity(capacity); });
      }
    },
  });
}
