// NcqAccount — 공용 설정창의 CS 유저 ID. ES2017, 로그인·저장·분석 요청을 만들지 않아요.
(function (w, d) {
  "use strict";
  if (!w || !d || (w.NcqAccount && w.NcqAccount.version >= 1)) return;
  var registered = null, rows = [], timer = null, scheduled = null;
  var words = {
    en: ["User ID", "Copy", "Copied", "Select and copy the ID"],
    ko: ["유저 ID", "복사", "복사했어요", "ID를 선택해 복사해 주세요"],
    id: ["ID pengguna", "Salin", "Disalin", "Pilih dan salin ID"],
    pt: ["ID do usuário", "Copiar", "Copiado", "Selecione e copie o ID"],
    es: ["ID de usuario", "Copiar", "Copiado", "Selecciona y copia el ID"],
    th: ["ไอดีผู้ใช้", "คัดลอก", "คัดลอกแล้ว", "เลือกและคัดลอกไอดี"],
    vi: ["ID người dùng", "Sao chép", "Đã sao chép", "Chọn và sao chép ID"],
    pl: ["ID użytkownika", "Kopiuj", "Skopiowano", "Zaznacz i skopiuj ID"],
    tr: ["Kullanıcı kimliği", "Kopyala", "Kopyalandı", "Kimliği seçip kopyalayın"],
    ms: ["ID pengguna", "Salin", "Disalin", "Pilih dan salin ID"],
    fr: ["ID utilisateur", "Copier", "Copié", "Sélectionnez et copiez l’ID"],
    de: ["Benutzer-ID", "Kopieren", "Kopiert", "ID auswählen und kopieren"],
    it: ["ID utente", "Copia", "Copiato", "Seleziona e copia l’ID"],
    ja: ["ユーザーID", "コピー", "コピーしました", "IDを選択してコピーしてください"],
    "zh-hans": ["用户ID", "复制", "已复制", "请选择并复制ID"],
    "zh-hant": ["使用者ID", "複製", "已複製", "請選取並複製ID"]
  };
  function language() {
    var value;
    try { value = (w.NcqLang || {}).lang || (w.navigator || {}).language; } catch (e) { /* default */ }
    value = String(value || "en").toLowerCase().replace(/_/g, "-");
    if (/^zh-(hant|tw|hk|mo)/.test(value)) return "zh-hant";
    if (/^zh/.test(value)) return "zh-hans";
    return words[value] ? value : (words[value.split("-")[0]] ? value.split("-")[0] : "en");
  }
  function clean(value) {
    if (typeof value === "number" && Number.isSafeInteger(value)) value = String(value);
    return typeof value === "string" && value.length <= 512 && value.trim() &&
      !/[\x00-\x1f\x7f]/.test(value) && value !== "editor_test_user" ? value : null;
  }
  function sdk() {
    var value = w.HLSDK;
    var instance = value && Object.getOwnPropertyDescriptor(value, "Instance");
    return instance && instance.value ? instance.value : value; // no lazy SDK initialization
  }
  function read() {
    var cfg = w.NCQ || {}, native = cfg.NCQ_KAKAO || {}, platform = cfg.NCQ_PLATFORM || (cfg.NCQ_AUTH || {}).platform || "web";
    var source = "none", id = null, issue = "pending";
    try {
      var hl = sdk(), type = hl && hl.provider && hl.provider.ProviderType;
      var hlPlatform = type === "WEBGL_KAKAO" ? "kakaotalk" : (type === "WEBGL_KAKAOPAY" ? "kakaopay" : null);
      if (hlPlatform) platform = hlPlatform;
      var kakao = platform === "kakaopay" || platform === "kakaotalk" || !!cfg.NCQ_KAKAO;
      if (registered && (!kakao || registered.platform === platform)) {
        source = registered.id; platform = registered.platform;
        if (registered.ready() === true) id = clean(registered.userId());
      } else if (native.provider === "neptune" || (kakao && w.NcqNeptune && !hlPlatform)) {
        source = "neptune";
        var neptune = w.NcqNeptune;
        if (neptune && neptune.status().ready === true && typeof neptune.userKey === "function") id = clean(neptune.userKey());
      } else if (hlPlatform) {
        source = "hyperlane";
        // GetUserKey alone can return guest_<device ID>. Check the official login state first.
        if (typeof hl.CheckLoginStatus === "function" && hl.CheckLoginStatus() === true &&
            typeof hl.GetUserKey === "function") id = clean(hl.GetUserKey());
        if (id && /^guest_/.test(id)) id = null; // the SDK's device fallback is never a CS account ID
      } else if (!kakao && w.NcqAuth && typeof w.NcqAuth.account === "function") {
        source = "auth";
        var account = w.NcqAuth.account();
        if (account) {
          platform = account.platform;
          if (platform !== "kakaopay" && platform !== "kakaotalk") id = clean(account.player);
        }
      } else issue = "unavailable";
    } catch (e) { issue = "provider_error"; }
    return {id: id, source: source, platform: platform, issue: id ? null : issue};
  }
  function status() {
    var value = read();
    return {version: 1, available: !!value.id, source: value.source, platform: value.platform, issue: value.issue};
  }
  function registerProvider(provider) {
    if (!provider || !/^[a-z][a-z0-9_-]{0,39}$/.test(provider.id || "") ||
        !/^[a-z][a-z0-9_-]{0,39}$/.test(provider.platform || "") ||
        typeof provider.ready !== "function" || typeof provider.userId !== "function") {
      throw new TypeError("NcqAccount.registerProvider: id, platform, ready, userId");
    }
    registered = provider; refresh();
    return function () { if (registered === provider) { registered = null; refresh(); } };
  }
  function text(node, value) { if (node.textContent !== value) node.textContent = value; }
  function visible(row) {
    if (d.visibilityState === "hidden" || !row.host.isConnected || !row.settings.getClientRects().length) return false;
    for (var node = row.settings; node && node.nodeType === 1; node = node.parentElement) {
      var style = w.getComputedStyle(node);
      if (node.hidden || node.getAttribute("aria-hidden") === "true" || style.visibility === "hidden" || style.opacity === "0") return false;
    }
    return true;
  }
  function apply(row) {
    var value = visible(row) ? read() : {id: null, platform: "web"};
    var lang = language(), strings = words[lang], brand = value.platform === "kakaotalk" ? "KakaoTalk" :
      (value.platform === "kakaopay" ? "KakaoPay" : "");
    if (lang === "ko") brand = brand === "KakaoTalk" ? "카카오톡" : (brand === "KakaoPay" ? "카카오페이" : "");
    var label = (brand ? brand + " " : "") + strings[0];
    text(row.label, label); text(row.button, strings[1]); row.input.setAttribute("aria-label", label);
    if (row.input.value !== (value.id || "")) { row.input.value = value.id || ""; row.feedback = null; text(row.message, ""); row.epoch++; }
    if (row.feedback !== null) text(row.message, strings[row.feedback]);
    if (row.host.hidden !== !value.id) row.host.hidden = !value.id;
    row.button.disabled = !value.id;
    return value;
  }
  function copy(row) {
    var value = apply(row), id = value.id, epoch = row.epoch;
    if (!id) return;
    var clipboard = (w.navigator || {}).clipboard;
    function current() { return row.epoch === epoch && visible(row) && read().id === id; }
    function manual() {
      if (!current()) { refresh(); return; }
      row.input.focus(); row.input.select(); row.input.setSelectionRange(0, id.length);
      row.feedback = 3; text(row.message, words[language()][3]);
    }
    try {
      if (!clipboard || typeof clipboard.writeText !== "function") { manual(); return; }
      Promise.resolve(clipboard.writeText(id)).then(function () {
        if (current()) { row.feedback = 2; text(row.message, words[language()][2]); } else refresh();
      }, manual);
    } catch (e) { manual(); }
  }
  function mount(host) {
    if (!host || host.nodeType !== 1) throw new TypeError("NcqAccount.mount: element");
    var old = rows.filter(function (row) { return row.host === host; })[0];
    if (old) return old.destroy;
    host.setAttribute("data-ncq-account", "");
    var box = d.createElement("div"), label = d.createElement("span"), input = d.createElement("input");
    var button = d.createElement("button"), message = d.createElement("span");
    box.className = "ncq-account-row"; label.className = "ncq-account-label";
    input.type = "text"; input.readOnly = true; input.autocomplete = "off"; input.spellcheck = false;
    input.setAttribute("data-ncq-selectable", ""); input.setAttribute("data-ncq-account-id", "");
    button.type = "button"; button.setAttribute("data-ncq-account-copy", "");
    message.className = "ncq-account-message"; message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite");
    box.appendChild(label); box.appendChild(input); box.appendChild(button); box.appendChild(message); host.appendChild(box);
    var settings = (host.parentElement && host.parentElement.closest("[data-ncq-settings],dialog,[role=dialog]")) || host.parentElement || host;
    var wasHidden = host.hidden;
    var row = {host: host, settings: settings, label: label, input: input, button: button, message: message, epoch: 0, feedback: null};
    row.destroy = function () {
      rows = rows.filter(function (item) { return item !== row; }); row.epoch++; input.value = "";
      host.removeAttribute("data-ncq-account"); host.hidden = wasHidden;
      if (box.parentNode) box.parentNode.removeChild(box);
    };
    button.addEventListener("click", function () { copy(row); }); rows.push(row); apply(row); schedule();
    return row.destroy;
  }
  function schedule() {
    if (scheduled !== null) return;
    scheduled = w.setTimeout(function () { scheduled = null; refresh(); }, 0);
  }
  function refresh() {
    if (timer !== null) { w.clearTimeout(timer); timer = null; }
    rows.slice().forEach(function (row) { if (!row.host.isConnected) row.destroy(); });
    Array.prototype.forEach.call(d.querySelectorAll("[data-ncq-account]"), function (host) { mount(host); });
    rows.forEach(apply);
    if (rows.some(visible)) timer = w.setTimeout(refresh, 500); // only while the settings UI is visible
  }
  function boot() {
    if (!d.getElementById("ncq-account-style")) {
      var style = d.createElement("style"); style.id = "ncq-account-style";
      style.textContent = "[data-ncq-account][hidden]{display:none!important}.ncq-account-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;max-width:100%;min-width:0;font:inherit}.ncq-account-label,.ncq-account-message{grid-column:1/-1;font-size:.85em}.ncq-account-row input{min-width:0;width:100%;box-sizing:border-box;font:inherit;user-select:text;-webkit-user-select:text}.ncq-account-row button{font:inherit;min-height:36px}.ncq-account-message:empty{display:none}";
      (d.head || d.documentElement).appendChild(style);
    }
    if (w.MutationObserver) new w.MutationObserver(function (records) {
      if (rows.some(function (row) { return !row.host.isConnected; }) || records.some(function (record) {
        var target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (target && (target.matches("[data-ncq-settings],[data-ncq-account]") || target.closest("[data-ncq-settings]") ||
            (record.attributeName === "lang" && target === d.documentElement))) return true;
        if (record.type === "attributes" && rows.some(function (row) { return target && target.contains(row.settings); })) return true;
        return Array.prototype.some.call(record.addedNodes || [], function (node) {
          return node.nodeType === 1 && (node.matches("[data-ncq-account],[data-ncq-settings]") || node.querySelector("[data-ncq-account],[data-ncq-settings]"));
        });
      })) schedule();
    }).observe(d.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "aria-hidden", "open", "class", "style", "lang", "data-ncq-account", "data-ncq-settings"]
    });
    refresh();
  }
  w.NcqAccount = {version: 1, userId: function () { return read().id; }, status: status,
    registerProvider: registerProvider, mount: mount, refresh: refresh};
  d.addEventListener("visibilitychange", refresh); w.addEventListener("ncq-neptune-state", refresh);
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot, {once: true}); else boot();
})(typeof window !== "undefined" ? window : null, typeof document !== "undefined" ? document : null);
