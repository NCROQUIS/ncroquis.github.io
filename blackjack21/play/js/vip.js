// VIP: a 30-day pass bought in the app. While it runs there are no full-screen or banner ads (the rewarded
// "watch an ad for chips" stays), 1M chips land right away, and a gift box of 1M chips waits every day
// from midnight. Each purchase adds 30 days. Payments go through the company tool NcqIap only.
(function () {
  'use strict';
  var BJ = window.BJ, U = BJ.util, I = BJ.i18n;
  var V = BJ.vip = {};
  var NcqMetrics = BJ.ncqMetrics;
  var st, save, hooks, $ = function (id) { return document.getElementById(id); };
  var DAY = 864e5, DAYS = 30, GIFT = 1000000, NOW = 1000000;

  // Outside a release build there is no NcqIap: buying succeeds at once (dev only), as the payment guide says.
  var dev = !window.NCQ && !window.Capacitor, grantFn = null;
  var NcqIap = window.NcqIap || {
    onGrant: function (fn) { grantFn = fn; }, can: function () { return dev; }, ready: function () { return Promise.resolve(dev); },
    price: function () { return ''; }, owned: function () { return Promise.resolve(false); }, restore: function () { return Promise.resolve({ ok: dev, restored: [] }); },
    buy: function (id) { return Promise.resolve(dev && grantFn && grantFn(String(id).toUpperCase(), {}) !== false ? { ok: true, id: id } : { ok: false, id: id }); },
    buyOnce: function (id) { return Promise.resolve(dev && grantFn && grantFn(String(id).toUpperCase(), {}) !== false ? { ok: true, id: id } : { ok: false, id: id }); }
  };

  I.add('en', {
    vipTitle: 'VIP Membership', vipSub: '30 days', vipB1: 'No full-screen or banner ads', vipB1s: 'Reward ads for chips stay available',
    vipB2: '1M chips every day', vipB2s: 'A gift box appears every midnight. If you don\u2019t open it that day, it\u2019s gone', vipB3: '1M chips right away', vipB3s: 'Paid out the moment you buy',
    vipBuy: 'Become a VIP', vipExtend: 'Add 30 days', vipLeft: 'VIP · {d} days left (until {e})', vipNote: 'One-time 30-day pass. It does not renew by itself.',
    vipNoShop: 'Purchases aren’t available in this build.', vipThanks: 'Welcome to VIP! +{n} chips', vipGift: 'Daily VIP gift +{n} chips', vipNoAd: 'AD FREE', vipDays: 'D-{n}'
  });
  I.add('ko', {
    vipTitle: 'VIP 멤버십', vipSub: '30일', vipB1: '전면 광고·배너 광고 제거', vipB1s: '칩을 받는 보상형 광고는 그대로 볼 수 있어요',
    vipB2: '매일 1M 칩', vipB2s: '매일 00시에 선물상자가 생겨요. 그날 안 받으면 사라져요', vipB3: '즉시 1M 칩', vipB3s: '구매하는 순간 바로 들어와요',
    vipBuy: 'VIP 시작하기', vipExtend: '30일 연장하기', vipLeft: 'VIP · {d}일 남음 ({e}까지)', vipNote: '30일 이용권이에요. 자동으로 다시 결제되지 않아요.',
    vipNoShop: '이 빌드에서는 구매할 수 없어요.', vipThanks: 'VIP가 되었어요! 칩 +{n}', vipGift: 'VIP 매일 선물 칩 +{n}', vipNoAd: '광고 제거', vipDays: 'D-{n}'
  });

  // bought days (vipDays, filled in by each purchase) turn into time on the pass
  function applyDays() {
    var fresh = (st.vipDays || 0) - (st.vipApplied || 0);
    if (fresh > 0) { st.vipUntil = Math.max(st.vipUntil || 0, Date.now()) + fresh * DAY; st.vipApplied = st.vipDays; save(); }
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  V.active = function () { return !!st && (st.vipUntil || 0) > Date.now(); };
  function daysLeft() { return Math.max(0, Math.ceil(((st.vipUntil || 0) - Date.now()) / DAY)); }
  function giftReady() { return V.active() && st.vipGift !== today(); }

  // NCQ_IAP_VIP_30D: VIP 30일 이용권
  NcqIap.onGrant(function (id, info) {
    if (id !== 'VIP_30D' || !st) return false;            // unknown products are never granted
    var n = (info && info.quantity) || 1, change = { vipDays: DAYS * n };
    change[st.inTour ? 'bank' : 'chips'] = NOW * n;          // the chips are yours even at a tournament table
    // stored once per purchase and backed up right away; the same purchase never pays twice
    if (!window.NcqSave.grant((info && info.grantId) || ('dev-' + Date.now()), change)) return false;
    var s = window.NcqSave.get();
    st.chips = s.chips; st.bank = s.bank; st.vipDays = s.vipDays;
    applyDays();
    NcqMetrics.step("vip_buy");
    hooks.shown(NOW * n);
    V.refresh();
    hooks.toast(I.t('vipThanks', { n: U.money(NOW * n) }));
    return true;
  });

  // the corner button: the VIP medallion, or the day's gift box while one is waiting
  V.refresh = function () {
    if (!st) return;
    var on = V.active(), b = $('btnVip');
    document.body.classList.toggle('vip', on);
    b.classList.toggle('on', on);
    b.classList.toggle('gift', giftReady());
    $('vipDays').textContent = on ? I.t('vipDays', { n: daysLeft() }) : I.t('vipNoAd');
  };
  function claimGift() {
    if (!giftReady()) return;
    st.vipGift = today();
    NcqMetrics.step("vip_gift");
    hooks.give(GIFT);
    save(); V.refresh();
    hooks.toast(I.t('vipGift', { n: U.money(GIFT) }));
    BJ.audio.coinBurst && BJ.audio.coinBurst();
  }
  V.open = function () {
    NcqMetrics.step("vip_popup_open"); NcqMetrics.flow('vip', { mode: 'app' });
    var on = V.active(), can = NcqIap.can('VIP_30D'), price = NcqIap.price('VIP_30D');
    $('vipState').textContent = on ? I.t('vipLeft', { d: daysLeft(), e: new Date(st.vipUntil).toLocaleDateString(I.lang === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' }) }) : '';
    $('vipState').hidden = !on;
    var go = $('vipGo');
    go.disabled = !can;
    go.textContent = !can ? I.t('vipNoShop') : (on ? I.t('vipExtend') : I.t('vipBuy')) + (price ? ' · ' + price : '');
    $('sheetVip').classList.add('open');
  };
  function buy() {
    BJ.audio.unlock();
    NcqIap.buy('VIP_30D').then(function (r) { if (r && r.ok) { $('sheetVip').classList.remove('open'); BJ.audio.fanfare && BJ.audio.fanfare(); } });
  }

  V.init = function (state, saveFn, h) {
    st = state; save = saveFn; hooks = h;
    applyDays();
    $('vipMedal').innerHTML = medal(); $('vipBig').innerHTML = medal();
    $('btnVip').addEventListener('click', function () { BJ.audio.unlock(); BJ.audio.tick(); if (giftReady()) claimGift(); else V.open(); });
    $('vipGo').addEventListener('click', buy);
    NcqIap.ready().then(function () { V.refresh(); });
    V.refresh();
    setInterval(V.refresh, 30000);                 // the gift box turns up at midnight without a reload
  };

  // black enamel disc, gold rim and gold letters
  function medal() {
    return '<svg viewBox="0 0 100 100"><defs>' +
      '<linearGradient id="vgRim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2bf"/><stop offset=".35" stop-color="#e7b84c"/><stop offset=".7" stop-color="#9a6a17"/><stop offset="1" stop-color="#f3d27a"/></linearGradient>' +
      '<radialGradient id="vgFace" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#3a3530"/><stop offset=".55" stop-color="#121014"/><stop offset="1" stop-color="#050506"/></radialGradient>' +
      '<linearGradient id="vgTxt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d2"/><stop offset=".55" stop-color="#f0c95a"/><stop offset="1" stop-color="#b07f22"/></linearGradient></defs>' +
      '<circle cx="50" cy="50" r="48" fill="url(#vgRim)"/><circle cx="50" cy="50" r="40" fill="url(#vgFace)" stroke="#5c430f" stroke-width="1.5"/>' +
      '<path d="M16 38a36 36 0 0 1 68 0" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="7" stroke-linecap="round"/>' +
      '<text x="50" y="61" text-anchor="middle" font-family="Archivo Black, Arial Black, sans-serif" font-size="30" fill="url(#vgTxt)" letter-spacing="-0.5">VIP</text></svg>';
  }
})();
