// Coordinates measured from 1-lobby.png (1024×1536). The top 56px belong to ads.
export const lobbyReference = {
  width: 1024, height: 1536, adHeight: 56, contentHeight: 1480,
  boxes: {
    header: [36, 96, 952, 80], profile: [36, 205, 952, 130],
    board: [165, 417, 692, 457], missions: [839, 407, 114, 132],
    championship: [50, 956, 924, 86], start: [45, 1090, 934, 155],
    navigation: [36, 1349, 952, 132],
  },
};

const art = {
  pair: ["board/stones_pair", 383, 362, [9, 9, 366, 344]],
  profile: ["panels/profile_panel", 476, 177, [11, 10, 456, 155]],
  avatar: ["panels/avatar_frame", 243, 234, [11, 8, 220, 226]],
  person: ["icons/profile", 210, 234, [8, 9, 194, 217]],
  score: ["panels/score_badge", 310, 126, [11, 9, 289, 106]],
  track: ["panels/progress_track", 439, 179, [10, 105, 417, 62]],
  fill: ["panels/progress_fill", 433, 179, [10, 106, 413, 60]],
  currency: ["panels/currency_capsule", 347, 127, [10, 8, 326, 108]],
  coin: ["icons/coin", 229, 233, [9, 9, 211, 216]],
  round: ["panels/round_button", 231, 228, [11, 10, 209, 216]],
  settings: ["icons/settings", 239, 243, [8, 8, 222, 226]],
  gift: ["icons/gift", 244, 258, [9, 8, 227, 241]],
  notice: ["icons/notification", 188, 192, [8, 8, 172, 176]],
  championship: ["panels/championship_banner", 475, 178, [11, 9, 453, 157]],
  trophy: ["icons/trophy", 326, 211, [8, 9, 310, 193]],
  chevron: ["icons/chevron_right", 145, 214, [8, 9, 129, 197]],
  primary: ["panels/primary_button", 483, 147, [11, 10, 462, 125]],
  navigation: ["panels/bottom_navigation", 477, 139, [11, 8, 456, 119]],
  book: ["icons/book", 260, 197, [9, 9, 242, 180]],
  watch: ["icons/watch", 262, 184, [8, 9, 246, 167]],
  shop: ["icons/shop", 242, 231, [9, 8, 225, 214]],
};

const ns = "http://www.w3.org/2000/svg";
const svgNode = (tag, attributes) => {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
};

// SVG viewports remove the resource's transparent padding without altering it.
// Nine slices retain corners and rims when a panel has a different aspect ratio.
export function resource(parent, name, className, panel, clip = false) {
  const [path, width, height, [x, y, w, h]] = art[name];
  const span = document.createElement("span");
  span.className = "lobby-resource " + className;
  span.setAttribute("aria-hidden", "true");
  span.dataset.lobbyAsset = path;
  // These are logical source coordinates; texture resolution can be reduced
  // independently without changing the crop or the rendered layout.
  const image = () => svgNode("image", { href: `./assets/forest-ui/${path}.webp`, width, height, preserveAspectRatio: "none" });
  const root = svgNode("svg", { viewBox: panel ? `0 0 ${panel[0]} ${panel[1]}` : `${x} ${y} ${w} ${h}`, preserveAspectRatio: "none", focusable: "false" });
  // Shared menu styles size SVG icons; these SVGs are full resource viewports.
  Object.assign(root.style, { width: "100%", height: "100%", display: "block", overflow: clip ? "hidden" : "visible" });
  if (panel) {
    const [dw, dh, sourceCap, targetCap] = panel;
    const sx = [x, x + sourceCap, x + w - sourceCap, x + w];
    const sy = [y, y + sourceCap, y + h - sourceCap, y + h];
    const dx = [0, targetCap, dw - targetCap, dw];
    const dy = [0, targetCap, dh - targetCap, dh];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const tile = (source, destination, index, fullSize) => {
        const scale = (source[index + 1] - source[index]) / (destination[index + 1] - destination[index]);
        // Overlap interior edges by half a design pixel to avoid hairline gaps
        // after mobile scaling. Outer tiles keep the original soft shadows.
        const from = index ? destination[index] - .5 : destination[index] - source[0] / scale;
        const to = index < 2 ? destination[index + 1] + .5 : destination[index + 1] + (fullSize - source[3]) / scale;
        return [from, to - from, source[index] + (from - destination[index]) * scale, (to - from) * scale];
      };
      if (dx[col] === dx[col + 1] || dy[row] === dy[row + 1]) continue;
      const [tx, tw, vx, vw] = tile(sx, dx, col, width);
      const [ty, th, vy, vh] = tile(sy, dy, row, height);
      const piece = svgNode("svg", {
        x: tx, y: ty, width: tw, height: th,
        viewBox: `${vx} ${vy} ${vw} ${vh}`,
        preserveAspectRatio: "none", overflow: "hidden",
      });
      Object.assign(piece.style, { width: tw + "px", height: th + "px" });
      piece.append(image()); root.append(piece);
    }
  } else root.append(image());
  span.append(root); parent.append(span);
  return span;
}

export function titleUnderline(className) {
  const image = document.createElement("img");
  image.className = className;
  image.src = "./assets/forest-ui/branding/title-underline.svg";
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  return image;
}

export function installMeasuredLobby() {
  const el = id => document.getElementById(id);
  const shell = document.querySelector(".shell");
  const host = document.createElement("div"); host.id = "lobby-stage-host";
  const stage = document.createElement("div"); stage.id = "lobby-stage";
  stage.append(document.querySelector(".topbar"), el("lobby"), el("lobby-nav"), el("lobby-error"));
  host.append(stage); shell.querySelector("main").append(host);
  new ResizeObserver(([{ contentRect: { width, height } }]) => {
    if (!width || !height) return;
    // Keep the footer in the grid flow. Gaps absorb height changes before the
    // whole design scales down on unusually short screens.
    const { width: referenceWidth, adHeight, boxes: { navigation } } = lobbyReference;
    const minimumHeight = navigation[1] + navigation[3] - adHeight;
    const scale = Math.min(width / referenceWidth, height / minimumHeight);
    stage.style.setProperty("--lobby-scale", scale);
    stage.style.width = referenceWidth + "px";
    stage.style.height = height / scale + "px";
    stage.style.transform = `scale(${scale}) translateX(-50%)`;
    stage.dataset.sized = "true";
  }).observe(host);

  resource(document.querySelector(".mark"), "pair", "logo-stones");
  document.querySelector(".brand").append(titleUnderline("lobby-logo-underline"));
  resource(el("lobby-wallet"), "currency", "currency-surface", [164, 59, 52, 29]);
  resource(el("lobby-wallet").querySelector(".shop-coin"), "coin", "currency-coin");
  resource(el("show-options"), "round", "settings-surface");
  resource(el("show-options"), "settings", "settings-art");
  resource(el("player-card"), "profile", "profile-surface", [952, 130, 45, 34]);
  const avatar = el("player-card").querySelector(".player-avatar");
  resource(avatar, "avatar", "avatar-surface");
  resource(avatar, "person", "avatar-symbol");
  resource(el("player-career"), "score", "score-surface", [154, 54, 42, 19]);
  const meter = document.querySelector(".lobby-rank-meter");
  // The thin gauge cannot use the panel's nine-slice caps: both vertical
  // caps meet, and the original transparent padding bleeds past the rim.
  resource(meter, "track", "meter-track", undefined, true);
  resource(meter.firstElementChild, "fill", "meter-fill", undefined, true);
  const missionSurface = document.createElement("img");
  missionSurface.src = "./assets/forest-ui/panels/mission-button.svg";
  missionSurface.alt = "";
  missionSurface.className = "lobby-resource mission-surface";
  el("show-missions").append(missionSurface);
  resource(el("show-missions").querySelector(".mission-shortcut-icon"), "gift", "mission-gift-art");
  resource(el("show-missions"), "notice", "mission-notice");
  resource(el("show-tournament"), "championship", "championship-surface", [924, 86, 45, 28]);
  el("show-tournament").querySelector(".tournament-icon").remove();
  resource(el("show-tournament"), "trophy", "championship-trophy");
  resource(el("show-tournament"), "chevron", "championship-chevron");
  el("show-tournament").append(Object.assign(document.createElement("span"), { className: "championship-divider" }));
  resource(el("start"), "primary", "start-surface", [934, 155, 62, 77]);
  el("start").querySelector("img").remove();
  const startContent = document.createElement("span");
  startContent.className = "start-content";
  startContent.append(el("start").querySelector("[data-i18n]"));
  resource(startContent, "pair", "start-stones");
  el("start").append(startContent);
  resource(el("lobby-nav"), "navigation", "navigation-surface", [952, 132, 42, 33]);
  for (const [id, artName] of [["show-records", "book"], ["show-watch", "watch"], ["show-rankings", null], ["show-shop", "shop"]]) {
    const button = el(id); button.querySelector("img").remove();
    let wrapper = button.querySelector(".lobby-nav-icon");
    if (!wrapper) { wrapper = document.createElement("span"); wrapper.className = "lobby-nav-icon"; button.prepend(wrapper); }
    if (artName) resource(wrapper, artName, "navigation-art");
    else {
      const art = document.createElement("span");
      art.className = "lobby-resource navigation-art";
      art.setAttribute("aria-hidden", "true");
      const trophy = svgNode("svg", { viewBox: "2 2 20 20", preserveAspectRatio: "none", focusable: "false" });
      Object.assign(trophy.style, { width: "100%", height: "100%", display: "block", overflow: "visible" });
      trophy.append(svgNode("use", { href: "#nav-ranking", width: 24, height: 24 }));
      art.append(trophy); wrapper.append(art);
    }
  }
  return { render(game) { host.hidden = Boolean(game); } };
}
