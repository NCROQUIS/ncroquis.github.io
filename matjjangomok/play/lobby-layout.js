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
  black: ["board/stone_black", 315, 318, [8, 9, 299, 301]],
  white: ["board/stone_white", 326, 328, [9, 8, 309, 312]],
  board: ["board/board_empty", 567, 366, [9, 9, 550, 349]],
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
  mission: ["panels/mission_button", 427, 226, [12, 9, 402, 215]],
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
function resource(parent, name, className, panel) {
  const [path, width, height, [x, y, w, h]] = art[name];
  const span = document.createElement("span");
  span.className = "lobby-resource " + className;
  span.setAttribute("aria-hidden", "true");
  span.dataset.lobbyAsset = path;
  const image = () => svgNode("image", { href: `./assets/forest-ui/${path}.webp`, width, height });
  const root = svgNode("svg", { viewBox: panel ? `0 0 ${panel[0]} ${panel[1]}` : `${x} ${y} ${w} ${h}`, preserveAspectRatio: "none", focusable: "false" });
  // Shared menu styles size SVG icons; these SVGs are full resource viewports.
  Object.assign(root.style, { width: "100%", height: "100%", display: "block" });
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
  const underline = svgNode("svg", { class: "lobby-logo-underline", viewBox: "0 0 165 16", "aria-hidden": "true" });
  underline.append(svgNode("path", { d: "M0 5C58 17 101-4 165 10C104 0 67 23 0 5Z", fill: "#d7e82b" }));
  document.querySelector(".brand").append(underline);
  resource(el("lobby-wallet"), "currency", "currency-surface", [164, 59, 52, 29]);
  resource(el("lobby-wallet").querySelector(".shop-coin"), "coin", "currency-coin");
  resource(el("show-options"), "round", "settings-surface");
  resource(el("show-options"), "settings", "settings-art");
  resource(el("player-card"), "profile", "profile-surface", [952, 130, 45, 34]);
  const avatar = el("player-card").querySelector(".player-avatar");
  resource(avatar, "avatar", "avatar-surface");
  resource(avatar, "person", "avatar-symbol");
  resource(el("player-career"), "score", "score-surface", [150, 54, 42, 19]);
  const meter = document.querySelector(".lobby-rank-meter");
  resource(meter, "track", "meter-track", [264, 24, 29, 12]);
  resource(meter.firstElementChild, "fill", "meter-fill", [264, 24, 29, 12]);
  document.querySelector(".lobby-board-image").remove();
  document.querySelectorAll(".lobby-art-stone").forEach(node => node.remove());
  const board = document.querySelector(".lobby-board-art");
  resource(board, "board", "board-art");
  for (const [color, cx, cy, sw, sh] of [
    ["white", 514, 530, 36, 31], ["black", 589, 554, 38, 32],
    ["black", 476, 584, 37, 31], ["white", 552, 585, 37, 31],
    ["white", 398, 615, 38, 32], ["black", 514, 614, 38, 32],
    ["black", 476, 645, 38, 32], ["white", 552, 645, 38, 32],
    ["white", 437, 674, 38, 32], ["black", 514, 675, 38, 32],
    ["black", 391, 705, 39, 33], ["black", 597, 704, 40, 33],
  ]) {
    const stone = resource(board, color, "board-stone");
    Object.assign(stone.style, { left: cx - 165 - sw / 2 + "px", top: cy - 417 - sh / 2 + "px", width: sw + "px", height: sh + "px" });
  }
  resource(el("show-missions"), "mission", "mission-surface", [114, 132, 45, 29]);
  resource(el("show-missions").querySelector(".mission-shortcut-icon"), "gift", "mission-gift-art");
  resource(el("show-missions"), "notice", "mission-notice");
  resource(el("show-tournament"), "championship", "championship-surface", [924, 86, 45, 28]);
  el("show-tournament").querySelector(".tournament-icon").remove();
  resource(el("show-tournament"), "trophy", "championship-trophy");
  resource(el("show-tournament"), "chevron", "championship-chevron");
  el("show-tournament").append(Object.assign(document.createElement("span"), { className: "championship-divider" }));
  resource(el("start"), "primary", "start-surface", [934, 155, 62, 77]);
  el("start").querySelector("img").remove();
  resource(el("start"), "pair", "start-stones");
  resource(el("lobby-nav"), "navigation", "navigation-surface", [952, 132, 42, 33]);
  for (const [id, artName] of [["show-records", "book"], ["show-watch", "watch"], ["show-rankings", "trophy"], ["show-shop", "shop"]]) {
    const button = el(id); button.querySelector("img").remove();
    let wrapper = button.querySelector(".lobby-nav-icon");
    if (!wrapper) { wrapper = document.createElement("span"); wrapper.className = "lobby-nav-icon"; button.prepend(wrapper); }
    resource(wrapper, artName, "navigation-art");
  }
  return { render(game) { host.hidden = Boolean(game); } };
}
