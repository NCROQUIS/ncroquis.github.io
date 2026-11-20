import { TEXTS } from "./texts.js?v=689216405a77";

// Confirmed in the project's existing rating submission; this is not a runtime age check.
export const KAKAO_RATING = Object.freeze({ age: "ALL", number: "GOOG-SG-261111-3820", date: "2026-11-11" });

export function installWebviewUI(win, doc) {
  if (doc.documentElement.hasAttribute("data-omok-webview-ui")) return;
  doc.documentElement.setAttribute("data-omok-webview-ui", "");
  const editable = "input,textarea,select,[contenteditable]:not([contenteditable='false']),[data-copyable]";
  let gesture = null;
  doc.addEventListener("touchstart", event => {
    if (event.touches.length !== 1) { gesture = null; return; }
    const point = event.touches[0];
    gesture = { id: point.identifier, x: point.clientX, y: point.clientY,
      path: event.composedPath().filter(node => node instanceof win.Element),
      editing: !!event.target.closest?.(editable) };
  }, { passive: true });
  doc.addEventListener("touchmove", event => {
    if (!gesture || event.touches.length !== 1) return;
    const point = Array.from(event.touches).find(touch => touch.identifier === gesture.id);
    if (!point) return;
    const dx = gesture.x - point.clientX, dy = gesture.y - point.clientY;
    gesture.x = point.clientX; gesture.y = point.clientY;
    if (gesture.editing || (!dx && !dy)) return;
    const vertical = Math.abs(dy) >= Math.abs(dx), delta = vertical ? dy : dx;
    for (const node of gesture.path) {
      if (node === doc.body || node === doc.documentElement) break;
      const style = win.getComputedStyle(node), overflow = vertical ? style.overflowY : style.overflowX;
      if (!/^(auto|scroll)$/.test(overflow)) continue;
      const position = vertical ? node.scrollTop : node.scrollLeft;
      const limit = vertical ? node.scrollHeight - node.clientHeight : node.scrollWidth - node.clientWidth;
      if (limit > 1 && (delta < 0 ? position > 0 : position < limit - 1)) return;
    }
    // Stop the page's native pan/rubber band only when no inner scroller can consume it.
    if (event.cancelable) event.preventDefault();
  }, { passive: false });
  for (const type of ["touchend", "touchcancel"]) doc.addEventListener(type, () => { gesture = null; }, { passive: true });

  if (win.NCQ?.NCQ_PLATFORM !== "kakaopay" || win.NCQ?.NCQ_KAKAO?.provider !== "neptune") return;
  const requested = new URL(win.location.href).searchParams.get("lang");
  const preferred = (win.navigator.languages || [win.navigator.language]).map(code => code?.split("-")[0]);
  const language = Object.hasOwn(TEXTS, requested) ? requested : preferred.find(code => Object.hasOwn(TEXTS, code)) || "en";
  const panel = doc.createElement("aside"); panel.id = "kakao-age-rating"; panel.setAttribute("role", "note");
  panel.dataset.rating = KAKAO_RATING.age; panel.dataset.ratingNumber = KAKAO_RATING.number;
  panel.dataset.ratingDate = KAKAO_RATING.date;
  panel.dataset.i18nAttr = "aria-label:ageRatingLabel"; panel.setAttribute("aria-label", TEXTS[language].ageRatingLabel);
  const badge = doc.createElement("b"); badge.textContent = KAKAO_RATING.age; badge.setAttribute("aria-hidden", "true");
  const label = doc.createElement("span"); label.dataset.i18n = "ageRatingAll"; label.textContent = TEXTS[language].ageRatingAll;
  panel.append(badge, label); doc.body.prepend(panel); doc.body.dataset.kakaoRating = "all";
}

if (typeof window !== "undefined") installWebviewUI(window, document);
