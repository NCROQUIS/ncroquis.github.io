import { resource, titleUnderline } from "./lobby-layout.js?v=3000397f6d52";

// Right panel of the supplied 1448×1086 mockup: (742, 10), 678×1062.
export const rankingReference = { width: 678, height: 1062, border: 2 };

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
  let capacity = 5;
  const resize = () => {
    if (!dialog.open || !dialog.clientWidth || !dialog.clientHeight) return;
    const designWidth = rankingReference.width - 2 * rankingReference.border;
    const scale = dialog.clientWidth / designWidth;
    dialog.style.setProperty("--ranking-scale", scale);
    stage.style.width = designWidth + "px";
    stage.style.height = dialog.clientHeight / scale + "px";
    stage.style.transform = `scale(${scale})`;
    stage.dataset.sized = "true";
    const panel = el("tournament").querySelector(".ranking-panel:not([hidden])");
    if (!panel) return;
    const body = panel.querySelector(".list-body").getBoundingClientRect();
    const reward = panel.querySelector(".weekly-reward:not([hidden])");
    const top = reward ? reward.getBoundingClientRect().bottom + 18 * scale : body.top;
    const room = Math.max(0, (body.bottom - top) / scale - 5);
    capacity = Math.max(1, Math.min(5, Math.floor((room + 6) / 82.4)));
    if (!capacityQueued) {
      capacityQueued = true;
      queueMicrotask(() => { capacityQueued = false; onCapacity(capacity); });
    }
  };
  new ResizeObserver(resize).observe(dialog);
  return resize;
}
