/* NcqViewport — fixed game page, native inner scrolling and editable controls. ES2017. */
(function (w, d) {
  "use strict";
  if (!w || !d || !d.documentElement || !d.createElement || w.NcqViewport) return;
  var root = d.documentElement, gesture = null;
  var editable = "input,textarea,select,[contenteditable]:not([contenteditable='false']),[data-ncq-selectable],[data-copyable]";
  var config = (w.NCQ || {}).NCQ_VIEWPORT || {};
  var pageScroll = root.getAttribute("data-ncq-page-scroll") === "true" || config.pageScroll === true;
  var css = "html[data-ncq-viewport=locked]{height:100%;overflow:hidden;overscroll-behavior:none}" +
    "html[data-ncq-viewport=locked] body{height:100%;overflow:hidden;overscroll-behavior:none}" +
    "html[data-ncq-viewport] *{-webkit-tap-highlight-color:transparent}" +
    "html[data-ncq-viewport=locked] *{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}" +
    editable.split(",").map(function (selector) { return "html[data-ncq-viewport] " + selector; }).join(",") + "," +
    "html[data-ncq-viewport] [contenteditable]:not([contenteditable=false]) *,html[data-ncq-viewport] [data-ncq-selectable] *,html[data-ncq-viewport] [data-copyable] *" +
    "{-webkit-touch-callout:default;-webkit-user-select:text;user-select:text}" +
    "html[data-ncq-viewport=locked] img{-webkit-user-drag:none}";
  var style = d.createElement("style"); style.id = "ncq-viewport-style"; style.textContent = css;
  (d.head || root).appendChild(style);
  function apply() {
    root.setAttribute("data-ncq-viewport", pageScroll ? "scroll" : "locked");
    if (!pageScroll) w.scrollTo(0, 0);
  }
  function path(event) {
    if (event.composedPath) return event.composedPath().filter(function (node) { return node && node.nodeType === 1; });
    var nodes = [], node = event.target;
    while (node) { if (node.nodeType === 1) nodes.push(node); node = node.parentElement; }
    return nodes;
  }
  d.addEventListener("touchstart", function (event) {
    if (pageScroll || event.touches.length !== 1) { gesture = null; return; }
    var point = event.touches[0], nodes = path(event);
    gesture = { id:point.identifier, x:point.clientX, y:point.clientY, startX:point.clientX, startY:point.clientY, axis:null, nodes:nodes,
      editing:nodes.some(function (node) { return node.matches(editable); }) };
  }, { passive:true });
  d.addEventListener("touchmove", function (event) {
    if (pageScroll || !gesture || event.touches.length !== 1 || gesture.editing) return;
    var point = Array.prototype.find.call(event.touches, function (touch) { return touch.identifier === gesture.id; });
    if (!point) return;
    var dx = gesture.x - point.clientX, dy = gesture.y - point.clientY;
    gesture.x = point.clientX; gesture.y = point.clientY;
    if (!dx && !dy) return;
    var totalX = gesture.startX - point.clientX, totalY = gesture.startY - point.clientY;
    if (gesture.axis === null) {
      if (Math.max(Math.abs(totalX), Math.abs(totalY)) < 4) return;
      gesture.axis = Math.abs(totalY) >= Math.abs(totalX) ? "y" : "x";
    }
    var vertical = gesture.axis === "y", delta = vertical ? dy : dx;
    if (!delta) return;
    for (var i = 0; i < gesture.nodes.length; i++) {
      var node = gesture.nodes[i];
      if (node === d.body || node === root) break;
      var computed = w.getComputedStyle(node), overflow = vertical ? computed.overflowY : computed.overflowX;
      if (!/^(auto|scroll)$/.test(overflow)) continue;
      var position = vertical ? node.scrollTop : node.scrollLeft;
      var limit = vertical ? node.scrollHeight - node.clientHeight : node.scrollWidth - node.clientWidth;
      var direction = delta;
      if (!vertical && computed.direction === "rtl") { position = -position; direction = -delta; }
      if (limit > 1 && (direction < 0 ? position > 0 : position < limit - 1)) return;
    }
    if (event.cancelable) event.preventDefault();
  }, { passive:false });
  ["touchend", "touchcancel"].forEach(function (type) {
    d.addEventListener(type, function () { gesture = null; }, { passive:true });
  });
  w.NcqViewport = {
    configure:function (options) {
      if (options && typeof options.pageScroll === "boolean") { pageScroll = options.pageScroll; gesture = null; apply(); }
      return { pageScroll:pageScroll };
    },
    status:function () { return { pageScroll:pageScroll }; }
  };
  apply();
})(typeof window !== "undefined" ? window : null, typeof document !== "undefined" ? document : null);
