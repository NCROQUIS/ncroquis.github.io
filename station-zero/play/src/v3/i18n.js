// Station Zero language layer (company guide 'Language: English first'). Korean is the source language in the code;
// the English text table lives in one place, src/v3/lang/en.txt, embedded here by tools/build.py.
// When English is on, every Korean text node / label on the page and every canvas label drawn through I18N.t
// is translated: exact line → line with {0} values → known phrases inside a joined line. Missing text stays Korean.
(function (root) {
  const EN = /*EN_TABLE*/{};
  const LANGS = [['en', 'English'], ['ko', '한국어']];   // language menu: each name in its own language
  const KEY = 'station-zero:lang';
  const SUP = { en: 1, ko: 1 }, HAN = /[가-힣]/;
  function deviceLang() {   // first supported language in the device's preference order, else English
    const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (const tag of list) { const c = String(tag).toLowerCase().split('-')[0]; if (SUP[c]) return c; }
    return 'en';
  }
  function savedLang() { try { const v = localStorage.getItem(KEY); return SUP[v] ? v : null; } catch (e) { return null; } }
  let lang = savedLang() || deviceLang();
  document.documentElement.lang = lang;

  // ---- table → exact map, value patterns, phrase list ----
  const exact = new Map(), pats = [], esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const k in EN) {
    if (/\{\w+\}/.test(k)) {
      const names = [], re = '^' + k.split(/(\{\w+\})/).map(p => { const m = /^\{(\w+)\}$/.exec(p); if (m) { names.push(m[1]); return '([\\s\\S]*?)'; } return esc(p); }).join('') + '$';
      const litS = k.replace(/\{\w+\}/g, '').trim(), lit = litS.length;
      pats.push({ re: new RegExp(re), names, en: EN[k], lit, han: HAN.test(litS) });
    } else exact.set(k, EN[k]);
  }
  pats.sort((a, b) => b.lit - a.lit);
  const phrases = [...exact.keys()].filter(k => HAN.test(k)).sort((a, b) => b.length - a.length);
  const NUMISH = /^[\s\d.,+\-−%:◆×#/·]*$/;
  const cache = new Map();
  function tr(s) {
    if (exact.has(s)) return exact.get(s);
    for (const p of pats) {
      const m = p.re.exec(s); if (!m) continue;
      if (p.han && p.lit <= 2 && !m.slice(1).every(v => NUMISH.test(v))) continue; // short Korean patterns ('{0}초') only take numbers
      const val = {}; p.names.forEach((n, i) => { val[n] = HAN.test(m[i + 1]) ? t(m[i + 1]) : m[i + 1]; });
      return p.en.replace(/\{(\w+)\}/g, (all, n) => n in val ? val[n] : all);
    }
    let out = s; // joined text: swap known phrases (whole words only), longest first
    for (const k of phrases) {
      if (!HAN.test(out)) break; let i = out.indexOf(k);
      while (i >= 0) { const a = out[i - 1], b = out[i + k.length];
        if ((!a || !HAN.test(a)) && (!b || !HAN.test(b))) { const e = exact.get(k); out = out.slice(0, i) + e + out.slice(i + k.length); i = out.indexOf(k, i + e.length); }
        else i = out.indexOf(k, i + 1); }
    }
    return out;
  }
  function t(s) {
    if (lang !== 'en' || s == null) return s;
    s = String(s); if (!HAN.test(s)) return s;
    if (cache.has(s)) return cache.get(s);
    const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.slice(lead.length, s.length - tail.length);
    const out = lead + tr(core) + tail;
    if (cache.size > 4000) cache.clear(); cache.set(s, out); return out;
  }

  // ---- page: translate text nodes and a few attributes, keep the Korean source to switch back ----
  const ATTRS = ['aria-label', 'title', 'placeholder', 'data-sub'];
  const src = new WeakMap(); // node → { s: source, o: what we wrote }
  const skip = n => { const el = n.nodeType === 3 ? n.parentElement : n; return !el || !!el.closest('[data-noi18n], script, style'); };
  function doText(n) {
    if (skip(n)) return;
    const cur = n.data, rec = src.get(n), s = rec && rec.o === cur ? rec.s : cur;
    if (!HAN.test(s)) { src.delete(n); return; }
    const o = lang === 'en' ? t(s) : s; src.set(n, { s, o }); if (o !== cur) n.data = o;
  }
  function doAttrs(el) {
    if (skip(el)) return;
    let m = src.get(el); for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue; const cur = el.getAttribute(a), rec = m && m[a], s = rec && rec.o === cur ? rec.s : cur;
      if (!HAN.test(s)) continue; const o = lang === 'en' ? t(s) : s; if (!m) src.set(el, m = {}); m[a] = { s, o }; if (o !== cur) el.setAttribute(a, o);
    }
  }
  function apply(rootEl) {
    if (!rootEl) return;
    if (rootEl.nodeType === 3) { doText(rootEl); return; }
    if (rootEl.nodeType !== 1) return;
    doAttrs(rootEl);
    const w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? doText(n) : doAttrs(n);
  }
  let obs = null;
  function watch() {
    if (obs || !document.body) return;
    obs = new MutationObserver(list => { for (const r of list) {
      if (r.type === 'characterData') doText(r.target);
      else if (r.type === 'attributes') doAttrs(r.target);
      else r.addedNodes.forEach(apply);
    } });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    apply(document.body);
  }
  function setLang(code) {   // language menu: save, then redraw the page in place (no reload)
    if (!SUP[code]) return; lang = code; document.documentElement.lang = code; cache.clear();
    try { localStorage.setItem(KEY, code); } catch (e) {}
    apply(document.body); document.title = code === 'en' ? 'Station Zero' : '스테이션 제로';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  document.title = lang === 'en' ? 'Station Zero' : (document.title || '스테이션 제로');
  root.I18N = { t, setLang, getLang: () => lang, LANGS, apply, watch, missing: s => lang === 'en' && HAN.test(t(s)) };
})(typeof window !== 'undefined' ? window : globalThis);
