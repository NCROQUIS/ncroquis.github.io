import { installMeasuredLobby } from "./lobby-layout.js?v=3000397f6d52";
import { installMeasuredRankings } from "./ranking-layout.js?v=3000397f6d52";
import { installMeasuredMissions } from "./mission-layout.js?v=3000397f6d52";

// Reuse the existing records, rankings, wallet and shop views inside modal layers.
export function createForestUI({ closeView, getView, hasGame, translate, onRankingCapacity }) {
  const el = id => document.getElementById(id);
  const wrap = (id, title, content) => {
    const dialog = document.createElement("dialog");
    dialog.id = id;
    dialog.className = "forest-page-dialog";
    dialog.setAttribute("aria-labelledby", title);
    const window = document.createElement("div");
    window.className = "forest-window";
    window.append(content);
    dialog.append(window);
    document.body.append(dialog);
    return dialog;
  };
  const recordsDialog = wrap("records-dialog", "records-heading", el("records"));
  const rankingsDialog = wrap("rankings-dialog", "tournament-title", el("tournament"));
  const meta = document.createElement("div");
  meta.className = "forest-championship-meta";
  for (const id of ["forest-championship-period", "forest-championship-countdown"]) {
    const chip = document.createElement("span");
    chip.id = id;
    meta.append(chip);
  }
  const separator = document.createElement("span");
  separator.className = "forest-championship-separator";
  separator.textContent = "|";
  separator.setAttribute("aria-hidden", "true");
  meta.insertBefore(separator, meta.lastElementChild);
  el("tournament").querySelector(".list-heading").after(meta);
  const watchDialog = wrap("watch-dialog", "lobby-heading", document.querySelector(".lobby-feed"));
  watchDialog.querySelector(".list-heading").append(el("watch-close"));
  el("show-tournament").querySelector(".tournament-icon").replaceWith(Object.assign(document.createElement("img"), {
    src: "./assets/forest-ui/icons/trophy.webp", alt: "", className: "tournament-icon",
  }));
  el("lobby-mission-slot").append(el("show-missions"));
  el("lobby-championship-slot").append(el("show-tournament"));
  el("lobby-cta-slot").append(el("lobby-entry"));
  document.querySelector(".lobby-highlights").remove();
  el("shop").classList.add("forest-page-dialog", "forest-shop");
  for (const [dialog, view] of [[recordsDialog, "records"], [rankingsDialog, "tournament"]]) {
    dialog.addEventListener("close", () => {
      if (!dialog.open && !hasGame() && getView() === view) closeView();
    });
  }
  for (const button of document.querySelectorAll("[data-close-dialog]")) {
    button.addEventListener("click", () => el(button.dataset.closeDialog).close());
  }
  const meter = document.createElement("span");
  meter.className = "lobby-rank-meter";
  meter.setAttribute("role", "progressbar");
  meter.append(document.createElement("span"));
  el("player-card").append(meter);
  const measuredLobby = installMeasuredLobby();
  const measuredRankings = installMeasuredRankings(rankingsDialog, onRankingCapacity);
  installMeasuredMissions();
  const setLayer = (dialog, visible) => {
    if (visible && !dialog.open) dialog.showModal();
    else if (!visible && dialog.open) dialog.close();
  };
  return {
    watchDialog,
    openWatch() {
      if (hasGame()) return;
      watchDialog.showModal();
      el("lobby-heading").focus();
    },
    back() {
      const dialog = [watchDialog, recordsDialog, rankingsDialog].find(layer => layer.open);
      if (!dialog) return false;
      dialog.close();
      return true;
    },
    render(game, view) {
      measuredLobby.render(game);
      const ranking = !game && view === "tournament";
      const cardParent = ranking ? el("play-footer") : el("lobby-profile-slot");
      if (el("player-card").parentElement !== cardParent) cardParent.prepend(el("player-card"));
      const footerParent = ranking ? rankingsDialog.firstElementChild : document.querySelector(".shell");
      if (el("play-footer").parentElement !== footerParent) footerParent.append(el("play-footer"));
      el("play-footer").hidden = !ranking;
      if (game || view !== "lobby") watchDialog.close();
      setLayer(recordsDialog, !game && view === "records");
      setLayer(rankingsDialog, ranking);
      if (ranking) measuredRankings();
    },
    profile(rating, lower, upper) {
      meter.setAttribute("aria-label", translate("forestPromotionProgress"));
      meter.setAttribute("aria-valuemin", lower);
      meter.setAttribute("aria-valuemax", upper);
      meter.setAttribute("aria-valuenow", Math.max(lower, Math.min(upper, rating)));
      meter.style.setProperty("--rank-fill", Math.max(0, Math.min(100, (rating - lower) / (upper - lower) * 100)) + "%");
    },
  };
}
