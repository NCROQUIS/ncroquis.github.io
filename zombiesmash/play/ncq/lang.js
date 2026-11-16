// NcqLang — 엔크로키 공용 언어 모듈 (ncq/lang.js)
// 킥오프 서버가 모든 웹 프로젝트 레포에 넣고 최신으로 맞춰요. 이 파일은 고치지 않아요 (고쳐도 다음 맞추기 때 덮여요).
// 쓰는 법은 AGENTS.md의 '언어'에 있어요. 오래된 안드로이드 WebView에서도 돌게 ES2017까지만 써요.
//
//   import { NcqLang } from "./ncq/lang.js";
//   NcqLang.init({ id: "<코드네임>", texts: { en: { play: "Play" }, ko: { play: "시작" } } });
//   NcqLang.t("play");                       // 지금 언어의 글자 (빠진 글자는 영어로)
//   NcqLang.t("hints_left", { n: 3 });      // {n} 끼워 넣기, { one: "...", other: "..." }면 복수형
//   NcqLang.set("ko");                       // 언어 메뉴에서 고르면: 저장하고 바꾸고 알려요
//   NcqLang.onChange(redraw);                // 바뀌면 화면을 다시 그려요
//
// 기본 언어: 주소의 ?lang= (시험·스크린샷, 저장 안 함) → 고른 언어(저장) → 기기 언어(선호 순서) → 영어.

const VERSION = 1;

// 언어 메뉴에 보일 이름 (그 언어로). 없으면 Intl.DisplayNames, 그것도 없으면 코드 그대로
const NAMES = {
  en: "English", ko: "한국어", ja: "日本語", "zh-Hans": "简体中文", "zh-Hant": "繁體中文",
  es: "Español", fr: "Français", de: "Deutsch", it: "Italiano", pt: "Português", "pt-BR": "Português (Brasil)",
  ru: "Русский", id: "Bahasa Indonesia", ms: "Bahasa Melayu", th: "ไทย", vi: "Tiếng Việt", tr: "Türkçe",
  pl: "Polski", nl: "Nederlands", ar: "العربية", hi: "हिन्दी",
};
// 기기가 지역으로 알려 주는 중국어를 글자 체계로 (zh-TW → zh-Hant)
const ALIAS = {
  "zh-tw": "zh-hant", "zh-hk": "zh-hant", "zh-mo": "zh-hant",
  "zh-cn": "zh-hans", "zh-sg": "zh-hans", "zh-my": "zh-hans", zh: "zh-hans",
};
const RTL = ["ar", "he", "fa", "ur"];

let texts = {};
let codes = [];
let fallback = "en";
let current = "en";
let storeKey = "ncq:lang";
let started = false;
const listeners = [];
const warned = {};
const plurals = {};

const own = (obj, key) => obj !== null && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);
const dev = () => typeof window !== "undefined" && !window.NCQ && !window.Capacitor;

function base(code) {
  return String(code).toLowerCase().split("-")[0];
}

// 언어 태그 하나(ko-KR, zh-Hant-TW, pt_BR)를 지원 언어로. 정확히 → 뒤에서부터 줄여 가며 → 같은 기본 언어(pt-PT → pt-BR, 중국어 빼고)
function match(tag) {
  if (typeof tag !== "string" || !tag.trim()) return null;
  const parts = tag.trim().replace(/_/g, "-").toLowerCase().split("-");
  while (parts.length) {
    const want = parts.join("-");
    for (const name of [want, ALIAS[want]]) {
      if (!name) continue;
      for (const code of codes) if (code.toLowerCase() === name) return code;
    }
    parts.pop();
  }
  const b = base(tag.trim().replace(/_/g, "-"));
  if (b === "zh") return null;  // 간체·번체는 글자 체계가 달라서 서로 대신하지 않아요 (영어로)
  for (const code of codes) if (base(code) === b) return code;
  return null;
}

function deviceTags() {
  if (typeof navigator === "undefined" || !navigator) return [];
  const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
  return Array.prototype.slice.call(list);
}

function fromDevice() {
  for (const tag of deviceTags()) {
    const code = match(tag);
    if (code) return code;
  }
  return null;
}

function fromAddress() {
  try {
    const m = /[?&]lang=([A-Za-z_-]+)/.exec(String(location.search || ""));
    return m ? match(m[1]) : null;
  } catch (e) {
    return null;
  }
}

function fromStore() {
  try {
    return match(localStorage.getItem(storeKey));
  } catch (e) {
    return null;
  }
}

function store(code) {
  try {
    localStorage.setItem(storeKey, code);
  } catch (e) { /* 저장소가 막혀 있어도 이번 실행에는 바뀐 언어로 */ }
}

function markDocument() {
  try {
    const root = document.documentElement;
    root.lang = current;
    root.dir = RTL.indexOf(base(current)) >= 0 ? "rtl" : "ltr";
  } catch (e) { /* 문서가 없는 곳 (시험) */ }
}

function warn(key, code) {
  if (!dev() || warned[code + ":" + key]) return;
  warned[code + ":" + key] = true;
  try {
    console.warn("[NcqLang] '" + code + "' 글자 표에 '" + key + "'가 없어요");
  } catch (e) { /* 콘솔이 없는 곳 */ }
}

function pluralForm(code, n) {
  try {
    if (typeof Intl !== "undefined" && Intl.PluralRules) {
      const rules = plurals[code] || (plurals[code] = new Intl.PluralRules(code));
      return rules.select(n);
    }
  } catch (e) { /* 아래 간단한 규칙으로 */ }
  return n === 1 ? "one" : "other";
}

function pick(forms, params, code) {
  let n = null;
  if (params && typeof params.n === "number") n = params.n;
  else if (params && typeof params.count === "number") n = params.count;
  if (n !== null) {
    if (n === 0 && own(forms, "zero")) return forms.zero;
    const form = pluralForm(code, n);
    if (own(forms, form)) return forms[form];
  }
  if (own(forms, "other")) return forms.other;
  if (own(forms, "one")) return forms.one;
  return "";
}

function fill(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (own(params, name) ? String(params[name]) : whole));
}

function lookup(key) {
  if (own(texts[current], key)) return [current, texts[current][key]];
  if (current !== fallback) warn(key, current);
  if (own(texts[fallback], key)) return [fallback, texts[fallback][key]];
  for (const code of codes) if (own(texts[code], key)) return [code, texts[code][key]];
  warn(key, fallback);
  return null;
}

// 지금 언어의 글자. 없으면 영어(기본 언어) → 다른 언어 → 키 그대로
function t(key, params) {
  const found = lookup(String(key));
  if (!found) return String(key);
  let value = found[1];
  if (value !== null && typeof value === "object") value = pick(value, params, found[0]);
  return fill(String(value), params);
}

// 글자 표에 그 키가 있는지 (지금 언어나 기본 언어)
function has(key) {
  return own(texts[current], key) || own(texts[fallback], key);
}

// HTML에 바로 쓴 글자: data-i18n="키"는 글자를, data-i18n-attr="aria-label:키; title:키"는 속성을 채워요
function apply(root) {
  let scope = root;
  try {
    if (!scope) scope = document;
    if (!scope || !scope.querySelectorAll) return;
  } catch (e) {
    return;
  }
  scope.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  scope.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    String(el.getAttribute("data-i18n-attr")).split(";").forEach((pair) => {
      const at = pair.indexOf(":");
      if (at < 1) return;
      const attr = pair.slice(0, at).trim();
      const key = pair.slice(at + 1).trim();
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
}

function emit() {
  listeners.slice().forEach((fn) => {
    try {
      fn(current);
    } catch (e) {
      try { console.error(e); } catch (e2) { /* 콘솔이 없는 곳 */ }
    }
  });
  try {
    window.dispatchEvent(new CustomEvent("ncq-lang", { detail: { lang: current } }));
  } catch (e) { /* 창이 없는 곳 (시험) */ }
  apply();
}

// 처음 한 번 (화면을 그리기 전에): 글자 표와 저장 키(코드네임)를 받아 언어를 정해요. 정한 언어를 돌려줘요
function init(options) {
  const opts = options || {};
  texts = {};
  codes = [];
  const given = opts.texts && typeof opts.texts === "object" ? opts.texts : {};
  Object.keys(given).forEach((code) => {
    if (given[code] && typeof given[code] === "object") {
      texts[code] = given[code];
      codes.push(code);
    }
  });
  if (!codes.length) {
    texts = { en: {} };
    codes = ["en"];
  }
  fallback = own(texts, "en") ? "en" : codes[0];  // 영어가 기본. 영어 표가 없는 예외 프로젝트는 첫 언어
  storeKey = (opts.id ? String(opts.id) : "ncq") + ":lang";
  current = fromAddress() || fromStore() || fromDevice() || fallback;
  started = true;
  markDocument();
  apply();
  return current;
}

// 언어 메뉴에서 고르면: 저장하고, 바뀌었으면 알려요 (onChange, window의 'ncq-lang', data-i18n)
function set(code) {
  const next = match(code);
  if (!next) return false;
  store(next);
  if (next !== current) {
    current = next;
    markDocument();
    emit();
  }
  return true;
}

function onChange(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.push(fn);
  return () => {
    const at = listeners.indexOf(fn);
    if (at >= 0) listeners.splice(at, 1);
  };
}

function nameOf(code) {
  if (own(NAMES, code)) return NAMES[code];
  try {
    if (typeof Intl !== "undefined" && Intl.DisplayNames) {
      const shown = new Intl.DisplayNames([code], { type: "language" }).of(code);
      if (shown) return shown.charAt(0).toUpperCase() + shown.slice(1);
    }
  } catch (e) { /* 아래 코드 그대로 */ }
  return code;
}

// 언어 메뉴용: 지원 언어와 그 언어로 쓴 이름, 지금 언어 표시
function list() {
  return codes.map((code) => ({ code, name: nameOf(code), current: code === current }));
}

// 숫자·날짜를 지금 언어 형식으로 (Intl이 없으면 그대로)
function num(value, options) {
  try {
    return new Intl.NumberFormat(current, options).format(value);
  } catch (e) {
    return String(value);
  }
}

function date(value, options) {
  try {
    return new Intl.DateTimeFormat(current, options).format(value);
  } catch (e) {
    return String(value);
  }
}

// 시험용: 언어마다 빠진 키 { ko: ["..."] } (어느 표에든 있는 키 기준). 다 있으면 {}
function missing() {
  const all = {};
  codes.forEach((code) => Object.keys(texts[code]).forEach((key) => { all[key] = true; }));
  const out = {};
  codes.forEach((code) => {
    const gaps = Object.keys(all).filter((key) => !own(texts[code], key));
    if (gaps.length) out[code] = gaps;
  });
  return out;
}

export const NcqLang = {
  version: VERSION,
  init, t, has, set, onChange, list, apply, num, date, missing,
  get lang() { return current; },
  get fallback() { return fallback; },
  get ready() { return started; },
};

export default NcqLang;

try {
  if (typeof window !== "undefined") window.NcqLang = NcqLang;
} catch (e) { /* 창이 없는 곳 */ }
