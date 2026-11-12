// Measured from the left panel of the supplied 1448×1086 mission reference.
export const missionReference = {
  screen: [670, 1067], panel: [632, 778], centerOffset: 46.5,
  overview: [23, 150, 586, 125], list: [23, 288, 586, 361],
  rows: [0, 93, 186, 277], eligibility: [27, 697, 578, 48],
};

export function installMeasuredMissions() {
  const dialog = document.getElementById("missions");
  const balance = document.getElementById("mission-balance");
  const layout = () => {
    const space = window.NcqSafe.space();
    const width = document.documentElement.clientWidth - space.left - space.right;
    const height = window.innerHeight - space.top - space.bottom;
    const scale = Math.min(1, width / missionReference.screen[0], height / missionReference.screen[1]);
    dialog.style.setProperty("--mission-scale", scale);
    dialog.style.width = missionReference.panel[0] * scale + "px";
    dialog.style.height = missionReference.panel[1] * scale + "px";
    dialog.style.left = space.left + (width - missionReference.panel[0] * scale) / 2 + "px";
    dialog.style.top = space.top + (height - missionReference.panel[1] * scale) / 2 + missionReference.centerOffset * scale + "px";
  };
  new ResizeObserver(layout).observe(document.documentElement);
  window.NcqSafe.onChange(layout);
  layout();
  const fitBalance = () => dialog.style.setProperty("--mission-coin-chars", Math.max(1, balance.textContent.length));
  new MutationObserver(fitBalance).observe(balance, { childList: true, characterData: true, subtree: true });
  fitBalance();
  const close = document.getElementById("mission-close");
  close.textContent = "";
  const hit = document.createElement("span");
  hit.className = "mission-close-hit";
  hit.setAttribute("aria-hidden", "true");
  close.append(hit);
  const ns = "http://www.w3.org/2000/svg";
  const wave = document.createElementNS(ns, "svg");
  wave.setAttribute("viewBox", "0 0 165 16");
  wave.setAttribute("preserveAspectRatio", "none");
  wave.setAttribute("aria-hidden", "true");
  wave.classList.add("mission-title-wave");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M0 5C58 17 101-4 165 10C104 0 67 23 0 5Z");
  path.setAttribute("fill", "#8ca532");
  wave.append(path);
  document.getElementById("missions-title").append(wave);
  dialog.querySelector(".mission-eligibility").addEventListener("toggle", event => {
    if (event.target.open) requestAnimationFrame(() => event.target.scrollIntoView({ block: "nearest" }));
  });
}
