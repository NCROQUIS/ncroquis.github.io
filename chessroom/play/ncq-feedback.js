/* 엔크로키 플레이어 피드백 도구 NcqFeedback (출시 빌드가 넣어요, 킥오프 서버 templates/release/web/ncq-feedback.js)
 *
 * 게임의 옵션 화면에 '피드백 보내기' 버튼을 두고 NcqFeedback.open()을 부르면 글쓰기 창이 떠요.
 * 글은 앱마다 있는 공개 게시판(<공개 페이지>/<코드네임>/feedback/)에 올라가고, 개발자가 관리자 페이지에서 답글을 달아요.
 *   NcqFeedback.can()        이 빌드에서 쓸 수 있는지 (false면 버튼을 숨겨요)
 *   NcqFeedback.open()       글쓰기 창 → 보냈으면 true, 닫았으면 false (Promise)
 *   NcqFeedback.isOpen()·close()  토스 뒤로가기(window.ncqBack)에서 창부터 닫을 때
 *   NcqFeedback.send({category, text, contact})  창 없이 보내기 → {ok, error}
 *   NcqFeedback.boardUrl()   공개 게시판 주소 (웹 공개 빌드만. 앱·토스는 밖으로 나가는 링크를 쓰지 않아서 "")
 * 앱 버전·플랫폼·기기 종류·언어는 저절로 붙어요. 연락처(이메일)는 쓰고 싶은 사람만 쓰고 공개되지 않아요.
 * 오래된 안드로이드 WebView에서도 돌게 ES2017까지만 써요 (선택적 연결·널 병합 연산자 없이). 어떤 오류도 게임을 멈추지 않게 try로 감싸요.
 */
(function (w) {
  "use strict";
  if (w.NcqFeedback) return;
  var NCQ = w.NCQ || {};
  var cfg = NCQ.NCQ_FEEDBACK && typeof NCQ.NCQ_FEEDBACK === "object" ? NCQ.NCQ_FEEDBACK : null;
  var CATS = ["bug", "idea", "praise", "other"];
  var TEXT = {
    ko: {
      title: "피드백 보내기", bug: "버그", idea: "제안", praise: "칭찬", other: "기타",
      what: "어떤 이야기인가요?", body: "내용", placeholder: "불편한 점, 바라는 점, 좋았던 점을 자유롭게 적어 주세요.",
      contact: "연락받을 이메일 (선택)", contactNote: "답을 받고 싶을 때만 적어요. 공개되지 않아요.",
      note: "보낸 글은 공개 게시판에 올라가요. 이름·전화번호 같은 개인정보는 적지 마세요.",
      send: "보내기", sending: "보내는 중…", close: "닫기", thanks: "고마워요! 잘 받았어요.",
      empty: "내용을 적어 주세요.", fail: "보내지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.",
      board: "다른 사람 의견 보기"
    },
    en: {
      title: "Send feedback", bug: "Bug", idea: "Idea", praise: "Praise", other: "Other",
      what: "What is it about?", body: "Message", placeholder: "Tell us what bothered you, what you wish for, or what you liked.",
      contact: "Email for a reply (optional)", contactNote: "Only if you want an answer. It is never shown publicly.",
      note: "Your message is posted on the public feedback board. Please don't include personal details.",
      send: "Send", sending: "Sending…", close: "Close", thanks: "Thank you! We got it.",
      empty: "Please write a message.", fail: "Couldn't send. Check your connection and try again.",
      board: "See other feedback"
    }
  };
  var MAX = 1000;
  var state = { open: false, finish: null, root: null };

  function lang() {
    var l = "";
    try {
      if (w.NcqLang && w.NcqLang.ready) l = String(w.NcqLang.lang || "");
      if (!l) l = String((w.navigator && w.navigator.language) || "");
    } catch (e) { /* 기기 언어를 못 읽으면 영어 */ }
    return l;
  }
  function t(key) {
    var table = /^ko\b/i.test(lang()) ? TEXT.ko : TEXT.en;
    return table[key] || TEXT.en[key] || key;
  }
  function osName() {
    var ua = String((w.navigator && w.navigator.userAgent) || "").toLowerCase();
    if (/android/.test(ua)) return "android";
    if (/iphone|ipad|ipod/.test(ua)) return "ios";
    if (/windows/.test(ua)) return "windows";
    if (/mac os/.test(ua)) return "mac";
    if (/cros/.test(ua)) return "chromeos";
    if (/linux/.test(ua)) return "linux";
    return "other";
  }
  function platform() {
    var p = String(NCQ.NCQ_PLATFORM || "web");
    return ["web", "android", "ios", "toss"].indexOf(p) >= 0 ? p : "web";
  }

  function send(input) {
    input = input || {};
    if (!cfg || !cfg.url) return Promise.resolve({ ok: false, error: "feedback is off in this build" });
    var body = {
      category: CATS.indexOf(input.category) >= 0 ? input.category : "other",
      text: String(input.text || "").slice(0, MAX), contact: String(input.contact || "").trim(),
      source: "game", version: String(NCQ.NCQ_VERSION || ""), platform: platform(), os: osName(),
      lang: lang().slice(0, 20)
    };
    if (!body.text.trim()) return Promise.resolve({ ok: false, error: t("empty") });
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
    return fetch(cfg.url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined, credentials: "omit"
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        return r.ok && data.ok ? { ok: true, id: data.id || "" } : { ok: false, error: data.error || t("fail") };
      });
    }).catch(function () {
      return { ok: false, error: t("fail") };
    }).then(function (out) {
      if (timer) clearTimeout(timer);
      return out;
    });
  }

  var CSS = [
    ".ncqfb{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;",
    "background:rgba(10,14,12,.62);box-sizing:border-box;padding:calc(12px + var(--ncq-top,0px)) calc(12px + var(--ncq-right,0px))",
    " calc(12px + var(--ncq-bottom,0px)) calc(12px + var(--ncq-left,0px));font:16px/1.45 system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif}",
    ".ncqfb *{box-sizing:border-box}",
    ".ncqfb-card{position:relative;width:100%;max-width:440px;max-height:100%;overflow:auto;background:#fffdf8;color:#1d2420;",
    "border-radius:14px;padding:22px 18px 18px;box-shadow:0 18px 40px rgba(0,0,0,.35)}",
    ".ncqfb-x{position:absolute;top:8px;right:8px;width:40px;height:40px;border:0;border-radius:20px;background:transparent;",
    "color:#1d2420;font-size:26px;line-height:40px;cursor:pointer}",
    ".ncqfb h2{margin:0 40px 14px 0;font-size:20px}",
    ".ncqfb-label{display:block;margin:12px 0 6px;font-weight:700;font-size:14px}",
    ".ncqfb-cats{display:flex;flex-wrap:wrap;gap:8px}",
    ".ncqfb-cat{flex:1 1 auto;min-width:64px;min-height:40px;border:2px solid #c9cfc9;border-radius:20px;background:#fff;",
    "color:#1d2420;font:inherit;font-size:15px;cursor:pointer}",
    ".ncqfb-cat[aria-pressed=true]{border-color:#1d2420;background:#1d2420;color:#fff}",
    ".ncqfb textarea,.ncqfb input{width:100%;font:inherit;font-size:16px;border:2px solid #c9cfc9;border-radius:10px;",
    "padding:10px;background:#fff;color:#1d2420}",
    ".ncqfb textarea{min-height:120px;resize:vertical}",
    "#ncq-survey select{display:block;width:100%;min-height:44px;max-width:100%;font:inherit}",
    "#ncq-survey input[type=checkbox]{width:auto;margin-right:6px}#ncq-survey textarea{min-height:60px}",
    ".ncqfb-small{margin:6px 0 0;color:#5b645f;font-size:13px}",
    ".ncqfb-err{margin:10px 0 0;color:#b3261e;font-size:14px;min-height:1em}",
    ".ncqfb-send{width:100%;min-height:48px;margin-top:12px;border:0;border-radius:12px;background:#1d2420;color:#fff;",
    "font:inherit;font-weight:700;font-size:17px;cursor:pointer}",
    ".ncqfb-send[disabled]{opacity:.55}",
    ".ncqfb-board{display:block;margin-top:12px;text-align:center;color:#1d2420;font-size:14px}",
    ".ncqfb-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}",
    ".ncqfb button:focus-visible,.ncqfb textarea:focus-visible,.ncqfb input:focus-visible,.ncqfb a:focus-visible{outline:3px solid #f2c94c;outline-offset:2px}"
  ].join("");

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function close(sent) {
    if (state.popup) { state.popup.dispose(); state.popup = null; }
    try {
      if (state.root && state.root.parentNode) state.root.parentNode.removeChild(state.root);
    } catch (e) { /* 이미 없어요 */ }
    var finish = state.finish;
    state.open = false; state.finish = null; state.root = null;
    if (finish) finish(!!sent);
  }

  function open() {
    if (!cfg || !cfg.url || typeof document === "undefined") return Promise.resolve(false);
    if (state.open) return Promise.resolve(false);
    return new Promise(function (resolve) {
      try {
        state.open = true; state.finish = resolve;
        if (!document.getElementById("ncqfb-style")) {
          var st = el("style"); st.id = "ncqfb-style"; st.textContent = CSS; document.head.appendChild(st);
        }
        var root = el("div", "ncqfb"); root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true");
        var card = el("div", "ncqfb-card");
        var x = el("button", "ncqfb-x", "×"); x.type = "button"; x.setAttribute("aria-label", t("close"));
        var title = el("h2", null, t("title")); title.id = "ncqfb-title"; root.setAttribute("aria-labelledby", title.id);
        var catLabel = el("span", "ncqfb-label", t("what"));
        var cats = el("div", "ncqfb-cats"); cats.setAttribute("role", "group");
        var chosen = "bug";
        CATS.forEach(function (c) {
          var b = el("button", "ncqfb-cat", t(c)); b.type = "button"; b.setAttribute("aria-pressed", String(c === chosen));
          b.addEventListener("click", function () {
            chosen = c;
            Array.prototype.forEach.call(cats.children, function (n, i) { n.setAttribute("aria-pressed", String(CATS[i] === c)); });
          });
          cats.appendChild(b);
        });
        var bodyLabel = el("label", "ncqfb-label", t("body")); bodyLabel.htmlFor = "ncqfb-text";
        var text = el("textarea"); text.id = "ncqfb-text"; text.maxLength = MAX; text.placeholder = t("placeholder");
        var mailLabel = el("label", "ncqfb-label", t("contact")); mailLabel.htmlFor = "ncqfb-mail";
        var mail = el("input"); mail.id = "ncqfb-mail"; mail.type = "email"; mail.autocomplete = "email"; mail.maxLength = 254;
        var mailNote = el("p", "ncqfb-small", t("contactNote"));
        var hp = el("input", "ncqfb-hp"); hp.tabIndex = -1; hp.setAttribute("aria-hidden", "true"); hp.autocomplete = "off";
        var note = el("p", "ncqfb-small", t("note"));
        var err = el("p", "ncqfb-err"); err.setAttribute("role", "status");
        var go = el("button", "ncqfb-send", t("send")); go.type = "button";
        card.appendChild(x); card.appendChild(title); card.appendChild(catLabel); card.appendChild(cats);
        card.appendChild(bodyLabel); card.appendChild(text); card.appendChild(mailLabel); card.appendChild(mail);
        card.appendChild(mailNote); card.appendChild(hp); card.appendChild(note); card.appendChild(err); card.appendChild(go);
        var board = api.boardUrl();
        if (board) {
          var a = el("a", "ncqfb-board", t("board")); a.href = board; a.target = "_blank"; a.rel = "noopener";
          card.appendChild(a);
        }
        root.appendChild(card);
        x.addEventListener("click", function () { close(false); });
        root.addEventListener("click", function (e) { if (e.target === root) close(false); });
        root.addEventListener("keydown", function (e) { if (e.key === "Escape") close(false); });
        go.addEventListener("click", function () {
          if (hp.value) { close(true); return; }
          if (!text.value.trim()) { err.textContent = t("empty"); text.focus(); return; }
          go.disabled = true; go.textContent = t("sending"); err.textContent = "";
          var lease = w.NcqPopup ? w.NcqPopup.lease(root, "feedback-send") : null;
          send({ category: chosen, text: text.value, contact: mail.value }).then(function (out) {
            if (!state.open || state.root !== root || (lease && !lease.isCurrent())) return;
            if (out.ok) {
              go.textContent = t("thanks");
              setTimeout(function () {
                if (state.root === root && (!lease || lease.isCurrent())) close(true);
              }, 1200);
            } else {
              go.disabled = false; go.textContent = t("send"); err.textContent = out.error || t("fail");
            }
          });
        });
        state.root = root;
        document.body.appendChild(root);
        if (w.NcqPopup) {
          root.id = "ncq-feedback";
          state.popup = w.NcqPopup.register(root, {
            isOpen: function () { return state.open && state.root === root; },
            show: function () {}, hide: function () { close(false); }
          });
        }
        setTimeout(function () { try { if (state.root === root) text.focus(); } catch (e) { /* 초점은 덤 */ } }, 50);
      } catch (e) {
        close(false);
      }
    });
  }

  var survey = NCQ.NCQ_SURVEY;
  var surveyText = {
    en: {title:"Game survey", prompt:"Would you like to share your experience?", start:"Take survey", skip:"Close",
      note:"Registered developers, including external developers, can read your answers. Please leave out personal details.",
      fun:"How much fun was the game?", difficulty:"How difficult was it?", favorite:"What did you enjoy?",
      pain:"What was frustrating?", comment:"Bugs or improvements", idea:"Any new ideas?", optional:"Optional",
      levels:["Very easy","Easy","About right","Hard","Very hard"], consent:"Include this game progress",
      received:"Response received", receipt:"Keep this response number if you contact us about your submission.",
      conflict:"An earlier version of these answers was already received.", choose:"Choose an answer", send:"Send", sending:"Sending…", error:"Could not send. Your answers are here. Please retry."},
    ko: {title:"게임 설문", prompt:"이번 플레이에 대한 의견을 남겨 주시겠어요?", start:"설문 참여", skip:"닫기",
      note:"등록된 사내·외 개발자 멤버가 답변을 읽습니다. 개인정보는 입력하지 마세요.",
      fun:"게임은 얼마나 재미있었나요?", difficulty:"난이도는 어땠나요?", favorite:"가장 재미있는 부분은 무엇인가요?",
      pain:"어떤 점이 불편했나요?", comment:"버그·개선 의견", idea:"새로운 아이디어", optional:"선택",
      levels:["너무 쉬움","쉬움","적당함","어려움","너무 어려움"], consent:"다음 게임 진행 정보 첨부",
      received:"설문을 받았습니다", receipt:"제출한 답변에 대해 문의할 때 이 응답 번호를 알려 주세요.",
      conflict:"먼저 보낸 답변이 이미 접수되었습니다.", choose:"선택해 주세요", send:"보내기", sending:"보내는 중…", error:"보내지 못했습니다. 입력한 답변으로 다시 시도해 주세요."}
  };
  function surveyEvent(name) {
    var metrics = w.NcqMetrics;
    try { if (metrics && typeof metrics._tool === "function") metrics._tool("survey_" + name, {trigger: state.trigger || "manual"}); }
    catch (e) { /* 지표 오류가 제출을 가로막지 않게 해요. */ }
  }
  function newResponseId() {
    var bits = new Uint8Array(16);
    w.crypto.getRandomValues(bits);
    bits[6] = (bits[6] & 15) | 64; bits[8] = (bits[8] & 63) | 128;
    var hex = Array.from(bits, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    return hex.slice(0,8) + "-" + hex.slice(8,12) + "-" + hex.slice(12,16) + "-" + hex.slice(16,20) + "-" + hex.slice(20);
  }
  function surveyAvailable() { return !!(survey && survey.url && w.crypto && w.crypto.getRandomValues); }
  function surveyDialog(auto, options) {
    options = options || {};
    if (!surveyAvailable() || state.open || typeof document === "undefined" || !document.body) return Promise.resolve(false);
    var key = "ncq:survey:" + survey.environment + ":" + survey.game + ":shown";
    if (auto) {
      if (options.eligible !== true || options.safe !== true || document.hidden) return Promise.resolve(false);
      var top = w.NcqPopup && w.NcqPopup.top();
      var review = w.NcqReview && w.NcqReview.status();
      if ((top && top !== options.parent) || (review && (review.blocks.length || review.reasons.indexOf("in_progress") >= 0))) return Promise.resolve(false);
      try { if (w.localStorage.getItem(key)) return Promise.resolve(false); }
      catch (e) { return Promise.resolve(false); }
    }
    var locale = options.language || lang() || "en", table = survey.translations || {};
    var tx = Object.assign({}, /^ko\b/i.test(locale) ? surveyText.ko : surveyText.en,
                           table[locale] || table[locale.split("-")[0]] || table.en || {});
    var result = new Promise(function (resolve) {
      var root = el("div", "ncqfb"), card = el("div", "ncqfb-card"), finished = false;
      var unlock = null, confirmed = false, opener = document.activeElement;
      try {
        state.open = true; state.root = root; state.trigger = auto ? "auto" : "manual";
        state.finish = function (sent) {
          if (!sent && !confirmed && (!auto || finished)) surveyEvent("dismiss");
          if (unlock) unlock();
          state.trigger = null;
          if (opener && opener.isConnected) opener.focus();
          resolve(auto ? finished : confirmed || !!sent);
        };
        if (!document.getElementById("ncqfb-style")) {
          var style = el("style"); style.id = "ncqfb-style"; style.textContent = CSS; document.head.appendChild(style);
        }
        root.id = "ncq-survey"; root.setAttribute("role","dialog"); root.setAttribute("aria-modal","true");
        root.setAttribute("aria-label", tx.title); root.appendChild(card);
        var closeBtn = el("button","ncqfb-x","×"); closeBtn.type = "button"; closeBtn.setAttribute("aria-label", tx.skip);
        closeBtn.onclick = function () { close(false); };
        root.onkeydown = function (e) { if (e.key === "Escape" && state.root === root) close(false); };
        document.body.appendChild(root);
        if (w.NcqPopup) state.popup = w.NcqPopup.register(root, {isOpen:function () {return state.root === root;},
          show:function () {}, hide:function () { if (state.root === root) close(false); }});
        if (w.NcqReview) unlock = w.NcqReview.block("survey");
        function heading(title) {
          card.textContent = ""; card.appendChild(closeBtn); card.appendChild(el("h2", null, title));
        }
        function form() {
          heading(tx.title); card.appendChild(el("p","ncqfb-small",tx.note));
          var id = newResponseId(), inputs = {}, questions = {}, progress = {}, consent;
          var sendForm = el("form");
          card.appendChild(sendForm);
          ["fun","difficulty","favorite","pain","comment","idea"].forEach(function (key) {
            var score = key === "fun" || key === "difficulty", choices = tx[key + "_choices"];
            var label = el("label","ncqfb-label",tx[key] + (score ? "" : " (" + tx.optional + ")"));
            questions[key] = tx[key];
            var input = el(score || choices ? "select" : "textarea");
            input.id = "ncq-survey-" + key; label.htmlFor = input.id; input.required = score;
            if (input.tagName === "SELECT") {
              input.add(new Option(tx.choose, ""));
              (score ? (key === "fun" ? ["1","2","3","4","5"] : tx.levels) : choices).forEach(function (label, i) {
                input.add(new Option(label, score ? String(i + 1) : label));
              });
            } else { input.maxLength = 600; input.rows = 2; }
            inputs[key] = input; sendForm.appendChild(label); sendForm.appendChild(input);
          });
          (survey.progress || []).forEach(function (k) {
            var v = (options.progress || {})[k];
            if (typeof v === "boolean" || (Number.isInteger(v) && v >= 0 && v <= 1000000)) progress[k] = v;
          });
          if (Object.keys(progress).length) {
            var preview = el("label","ncqfb-small"); consent = el("input"); consent.type = "checkbox";
            preview.appendChild(consent); preview.appendChild(document.createTextNode(tx.consent + " · " + JSON.stringify(progress)));
            sendForm.appendChild(preview);
          }
          var err = el("p","ncqfb-err"), go = el("button","ncqfb-send",tx.send); go.type = "submit";
          err.setAttribute("role","status"); sendForm.appendChild(err); sendForm.appendChild(go);
          sendForm.onsubmit = function (event) {
            event.preventDefault();
            if (go.disabled || !sendForm.reportValidity()) return;
            var payload = {response_id:id, schema_version:survey.schema_version, build_version:String(NCQ.NCQ_VERSION || "dev"),
              platform:NCQ.NCQ_PLATFORM || "web", language:locale, trigger:auto ? "auto" : "manual", questions:questions};
            Object.keys(inputs).forEach(function (k) { payload[k] = inputs[k].value; });
            payload.fun = Number(payload.fun); payload.difficulty = Number(payload.difficulty);
            if (consent && consent.checked) { payload.consent = true; payload.progress = progress; }
            go.disabled = true; go.textContent = tx.sending; err.textContent = ""; surveyEvent("submit_attempt");
            var ctrl = typeof AbortController === "function" ? new AbortController() : null;
            var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 12000);
            fetch(survey.url,{method:"POST", headers:{"Content-Type":"application/json"}, credentials:"omit",
              signal:ctrl ? ctrl.signal : undefined, body:JSON.stringify(payload)}).then(function (r) {
              if (r.status === 409) throw new Error("response_conflict");
              if (!r.ok) throw Error();
              return r.json();
            }).then(function (r) {
              if (!r.ok || r.response_id !== id) throw Error();
              if (state.root !== root) return;
              confirmed = true;
              surveyEvent("submit_confirmed");
              heading(tx.received);
              card.appendChild(el("p", "ncqfb-small", tx.receipt));
              card.appendChild(el("code", null, id));
              closeBtn.focus();
            }).catch(function (error) {
              if (state.root === root) {
                go.disabled = error.message === "response_conflict"; go.textContent = tx.send;
                err.textContent = go.disabled ? tx.conflict + " " + id : tx.error;
              }
            }).then(function () { if (timer) clearTimeout(timer); });
          };
          surveyEvent("open"); inputs.fun.focus();
        }
        if (auto) {
          heading(tx.prompt);
          var start = el("button","ncqfb-send",tx.start); start.type = "button"; start.onclick = form; card.appendChild(start);
          w.localStorage.setItem(key, "1"); finished = true; surveyEvent("prompt_shown"); start.focus();
        } else { form(); }
      } catch (e) { close(false); }
    });
    return result;
  }
  var api = {
    can: function () { return !!(cfg && cfg.url); },
    open: open,
    canSurvey: surveyAvailable,
    openSurvey: function (options) { return surveyDialog(false, options); },
    promptSurvey: function (options) {
      if (surveyAvailable() && w.navigator.locks) {
        return w.navigator.locks.request("ncq:survey:" + survey.environment + ":" + survey.game,
          {ifAvailable:true}, function (lock) { return lock ? surveyDialog(true, options) : false; })
          .catch(function () { return false; });
      }
      return surveyDialog(true, options);
    },
    isOpen: function () { return state.open; },
    close: function () { if (state.open) close(false); },
    send: send,
    boardUrl: function () {
      return cfg && cfg.board && platform() === "web" ? String(cfg.board) : "";
    }
  };
  w.NcqFeedback = api;
})(typeof window !== "undefined" ? window : this);
