import { resource, titleUnderline } from "./lobby-layout.js?v=f26358c196c8";

export const listDialogReference = { width: 678, height: 1430, border: 2 };

// Tabs, page counts and empty results never participate in frame sizing.
export function listDialogFrameHeight(available, scale) {
  return Math.min(available, listDialogReference.height * scale);
}

export function installListDialog(dialog, { title, close, icon, tabs, onResize = () => {} }) {
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
    const scale = dialog.clientWidth / designWidth;
    const style = getComputedStyle(dialog);
    const available = parseFloat(style.maxHeight) ||
      innerHeight - (parseFloat(style.top) || 0) - (parseFloat(style.bottom) || 0) - 20;
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
