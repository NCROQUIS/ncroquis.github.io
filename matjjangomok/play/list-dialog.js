import { resource, titleUnderline } from "./lobby-layout.js?v=689216405a77";

// The minimum height fits fixed championship controls, reward feedback and four rows.
export const listDialogReference = { width: 678, height: 1430, minStageHeight: 1060, border: 2 };

// Tabs, page counts and empty results never participate in frame sizing.
export function listDialogFrameHeight(available, scale) {
  const { height, border } = listDialogReference;
  return Math.min(available, (height - 2 * border) * scale + 2 * border);
}

export function installListDialog(dialog, {
  title, close, icon, tabs, minStageHeight = listDialogReference.minStageHeight, onResize = () => {},
}) {
  dialog.classList.add("forest-list-dialog");
  const stage = dialog.firstElementChild;
  stage.classList.add("list-dialog-stage");
  const heading = title.closest(".list-heading, .review-header");
  heading.classList.add("list-dialog-heading");
  title.classList.add("list-dialog-title");
  close.classList.add("list-dialog-close");
  close.textContent = "";
  heading.prepend(title);
  heading.append(close);
  resource(heading, icon, "list-dialog-resource list-dialog-icon");
  heading.append(titleUnderline("list-dialog-underline"));
  resource(close, "round", "list-dialog-resource list-dialog-close-surface");
  tabs?.classList.add("list-dialog-tabs");

  const resize = () => {
    if (!dialog.open || !dialog.clientWidth) return;
    const { width, border } = listDialogReference;
    const designWidth = width - 2 * border;
    const style = getComputedStyle(dialog);
    const available = parseFloat(style.maxHeight) ||
      innerHeight - (parseFloat(style.top) || 0) - (parseFloat(style.bottom) || 0) - 20;
    // A wide, short viewport must reduce width as well as height; otherwise fixed
    // headers and footers can consume the entire flexible list. Use only viewport
    // space, never the active tab's content, so pagination cannot resize the frame.
    if (minStageHeight > 0) {
      const widthForHeight = 2 * border + Math.max(0, available - 2 * border) * designWidth / minStageHeight;
      dialog.style.setProperty("--list-dialog-height-width", widthForHeight + "px");
    }
    const scale = dialog.clientWidth / designWidth;
    const height = listDialogFrameHeight(available, scale);
    dialog.style.setProperty("--list-dialog-scale", scale);
    dialog.style.setProperty("--list-dialog-height", height + "px");
    stage.style.width = designWidth + "px";
    stage.style.height = (height - 2 * border) / scale + "px";
    stage.style.transform = `scale(${scale})`;
    stage.dataset.sized = "true";
    onResize(scale);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(dialog);
  observer.observe(stage);
  window.addEventListener("resize", resize);
  window.addEventListener("ncq-banner", resize);
  return resize;
}
