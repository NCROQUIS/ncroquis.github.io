// Around the table: profile (icon + nickname), achievements that unlock icons, the level ranking,
// and the mock ads (top banner, rewarded, interstitial). game.js calls BJ.meta.init() with its state.
(function () {
  'use strict';
  var BJ = window.BJ, U = BJ.util, I = BJ.i18n;
  var M = BJ.meta = {};
  var NcqMetrics = BJ.ncqMetrics;
  var st, save, hooks, $ = function (id) { return document.getElementById(id); };

  /* ---------- profile icons ---------- */
  // Each icon is a small medallion: a coloured disc, a fine gold ring and one mark in the middle.
  var ICONS = [
    { bg: ['#1f6b47', '#0d3a26'], mark: 'S' },              // 0  spade (starter)
    { bg: ['#8e2232', '#4c0f19'], mark: 'H' },              // 1  heart (starter)
    { bg: ['#24467e', '#11264a'], mark: 'D' },              // 2  Harbor Club
    { bg: ['#1d6b4a', '#0c3a27'], mark: 'C' },              // 3  Rose Garden
    { bg: ['#5b2c7c', '#2d1340'], mark: 'chip' },           // 4  Grand Hall
    { bg: ['#1a2f63', '#0b1533'], mark: 'crown' },          // 5  Royal Suite
    { bg: ['#39424f', '#171c23'], mark: 'A' },              // 6  Sky Lounge
    { bg: ['#0e5a57', '#062c2b'], mark: '7' },              // 7  Monte Carlo
    { bg: ['#a3141c', '#4d070b'], mark: '8' },              // 8  Macau Gold
    { bg: ['#6b1146', '#2e0620'], mark: 'star' },           // 9  Vegas
    { bg: ['#3a3d45', '#15161a'], mark: 'gem' },            // 10 Black Diamond
    { bg: ['#9a8350', '#4d3f1f'], mark: 'crown2' },         // 11 Imperial Crown
    { bg: ['#17171c', '#060608'], mark: '21' },             // 12 first blackjack
    { bg: ['#b8862a', '#5c3f0c'], mark: '21s' },            // 13 ten blackjacks
    { bg: ['#2a3a5a', '#101828'], mark: '500' },            // 14 500 hands
    { bg: ['#a8431a', '#4a1606'], mark: 'x5' },             // 15 five wins in a row
    { bg: ['#2f2a22', '#0f0d0b'], mark: 'crown' },          // 16 King's Cup
    { bg: ['#1f6b4b', '#0a2b1e'], mark: 'A' },              // 17 Ace Masters
    { bg: ['#8b1d2d', '#3a0914'], mark: 'star' },           // 18 World Championship
    { bg: ['#5a2a9a', '#170830'], mark: 'gem' },            // 19 Legendary League
    { bg: ['#0f4c6b', '#06202e'], mark: 'chip' },           // 20 rating
    { bg: ['#3a2a6b', '#140c2e'], mark: '21' }              // 21 tournament hands won
  ];
  var iconCache = {};
  function suit(g, s, size) {
    var k = size / 100;
    g.save(); g.scale(k, k); g.beginPath();
    if (s === 'H') { g.moveTo(0, 38); g.bezierCurveTo(-60, -8, -38, -58, 0, -26); g.bezierCurveTo(38, -58, 60, -8, 0, 38); }
    else if (s === 'D') { g.moveTo(0, -46); g.lineTo(34, 0); g.lineTo(0, 46); g.lineTo(-34, 0); g.closePath(); }
    else if (s === 'S') { g.moveTo(0, -46); g.bezierCurveTo(-62, 6, -34, 46, -6, 18); g.lineTo(-14, 44); g.lineTo(14, 44); g.lineTo(6, 18); g.bezierCurveTo(34, 46, 62, 6, 0, -46); }
    else { g.arc(0, -22, 18, 0, Math.PI * 2); g.moveTo(-22 + 18, 6); g.arc(-22, 6, 18, 0, Math.PI * 2); g.moveTo(22 + 18, 6); g.arc(22, 6, 18, 0, Math.PI * 2);
      g.moveTo(-6, 10); g.lineTo(-14, 44); g.lineTo(14, 44); g.lineTo(6, 10); }
    g.restore(); g.fill();
  }
  function crown(g, s, jewels) {
    g.beginPath(); g.moveTo(-s, s * 0.55); g.lineTo(-s, -s * 0.35); g.lineTo(-s * 0.5, s * 0.1); g.lineTo(0, -s * 0.6);
    g.lineTo(s * 0.5, s * 0.1); g.lineTo(s, -s * 0.35); g.lineTo(s, s * 0.55); g.closePath(); g.fill();
    if (jewels) { g.fillStyle = '#2e8a65'; [-s, 0, s].forEach(function (x, i) { g.beginPath(); g.arc(x, i === 1 ? -s * 0.6 : -s * 0.35, s * 0.14, 0, Math.PI * 2); g.fill(); }); }
  }
  M.icon = function (i) {
    i = ICONS[i] ? i : 0;
    if (iconCache[i]) return iconCache[i];
    var S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d'), P = ICONS[i];
    g.translate(S / 2, S / 2);
    var bg = g.createRadialGradient(-20, -26, 6, 0, 0, 70); bg.addColorStop(0, P.bg[0]); bg.addColorStop(1, P.bg[1]);
    g.fillStyle = bg; g.beginPath(); g.arc(0, 0, 64, 0, Math.PI * 2); g.fill();
    if (P.ring === 'rainbow') {
      var rg = g.createLinearGradient(-54, -54, 54, 54); ['#ff6a6a', '#ffd36a', '#6aff9c', '#6ad6ff', '#c46aff'].forEach(function (col, k) { rg.addColorStop(k / 4, col); });
      g.strokeStyle = rg; g.lineWidth = 4;
    } else { g.strokeStyle = P.ring || 'rgba(232,198,120,0.8)'; g.lineWidth = P.ring ? 3.5 : 2.5; }
    g.beginPath(); g.arc(0, 0, 54, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(232,198,120,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 49, 0, Math.PI * 2); g.stroke();
    var gold = g.createLinearGradient(0, -40, 0, 40); gold.addColorStop(0, '#fff1c4'); gold.addColorStop(0.5, '#e2b84f'); gold.addColorStop(1, '#a87a22');
    g.fillStyle = gold; g.textAlign = 'center'; g.textBaseline = 'middle';
    var m = P.mark;
    if ('SHDC'.indexOf(m) >= 0 && m.length === 1) suit(g, m, 78);
    else if (m === 'crown') crown(g, 30, false);
    else if (m === 'crown2') crown(g, 34, true);
    else if (m === 'chip') {
      g.beginPath(); g.arc(0, 0, 32, 0, Math.PI * 2); g.fill();
      g.fillStyle = P.bg[1]; for (var k = 0; k < 6; k++) { g.save(); g.rotate(k * Math.PI / 3); g.fillRect(-5, -32, 10, 10); g.restore(); }
      g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
    } else if (m === 'star') {
      g.beginPath(); for (var q = 0; q < 10; q++) { var r = q % 2 ? 14 : 34, a = -Math.PI / 2 + q * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
    } else if (m === 'gem') {
      g.beginPath(); g.moveTo(-30, -10); g.lineTo(-16, -26); g.lineTo(16, -26); g.lineTo(30, -10); g.lineTo(0, 30); g.closePath(); g.fill();
      g.strokeStyle = P.bg[1]; g.lineWidth = 2; g.beginPath(); g.moveTo(-30, -10); g.lineTo(30, -10); g.moveTo(-8, -26); g.lineTo(-14, -10); g.lineTo(0, 30); g.lineTo(14, -10); g.lineTo(8, -26); g.stroke();
    } else if (m === 'A') {
      g.font = '900 46px "Playfair Display", Georgia, serif'; g.fillText('A', -8, -4);
      g.save(); g.translate(18, 18); suit(g, 'S', 34); g.restore();
    } else {
      var txt = m === '21s' ? '21' : m;
      g.font = '900 ' + (txt.length > 2 ? 38 : 50) + 'px "Archivo Black", "Arial Black", sans-serif'; g.fillText(txt, 0, 3);
      if (m === '21s') { g.font = '900 18px sans-serif'; g.fillText('★ ★ ★', 0, 34); }
    }
    if (P.sub) {                // the count, on a little plate at the bottom
      g.font = '900 17px "Archivo Black", "Arial Black", sans-serif';
      var w = g.measureText(P.sub).width + 14;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.moveTo(-w / 2 + 8, 30); g.arcTo(w / 2, 30, w / 2, 50, 8); g.arcTo(w / 2, 50, -w / 2, 50, 8); g.arcTo(-w / 2, 50, -w / 2, 30, 8); g.arcTo(-w / 2, 30, w / 2, 30, 8); g.fill();
      g.fillStyle = gold; g.fillText(P.sub, 0, 41);
    }
    return (iconCache[i] = c.toDataURL('image/png'));
  };
  M.iconCount = ICONS.length;      // icons the sample players can wear: the original set
  // Families of goals get a run of icons: the same mark on a ladder of colours, from bronze up to a rainbow rim.
  var LADDER = [
    { bg: ['#8a5a2b', '#3d240f'], ring: '#d79a62' }, { bg: ['#7d8796', '#2c323b'], ring: '#e4e9f0' }, { bg: ['#b8892a', '#4d360a'], ring: '#ffd76a' },
    { bg: ['#1f8a5e', '#0a3322'], ring: '#7fe7b5' }, { bg: ['#2a5bc0', '#0e1f4a'], ring: '#8fc0ff' }, { bg: ['#b3203a', '#470a16'], ring: '#ff9aa8' },
    { bg: ['#7a3fc8', '#2a1050'], ring: '#d9b0ff' }, { bg: ['#25252b', '#060608'], ring: 'rainbow' }
  ];
  function ladderIcon(step, mark, sub) { var L = LADDER[Math.min(step, LADDER.length - 1)]; ICONS.push({ bg: L.bg, ring: L.ring, mark: mark, sub: sub }); return ICONS.length - 1; }
  function short(n) { return n >= 1000 ? (n / 1000) + 'K' : String(n); }

  /* ---------- achievements ---------- */
  // Opening each table is a stage clear; a few play goals round it out. Each one hands out a profile icon.
  var ACH = [];
  function buildAch() {
    ACH = [];
    var ts = function () { return st.tstats || { played: {}, best: {} }; };
    BJ.engine.TABLES.forEach(function (T, i) {
      if (!i) return;
      ACH.push({ id: 'open_' + T.id, icon: i + 1, kind: 'table', table: i,
                 title: function () { return I.t('achOpen', { t: I.t('t_' + T.id) }); },
                 desc: function () { return I.t('achOpenDesc', { n: T.level }); },
                 prog: function () { return [Math.min(BJ.engine.levelOf(st.xp), T.level), T.level]; } });
    });
    ACH.push({ id: 'bj1', icon: 12, title: function () { return I.t('achBj1'); }, desc: function () { return I.t('achBj1Desc'); }, prog: function () { return [Math.min(st.stats.bjs, 1), 1]; } });
    ACH.push({ id: 'bj10', icon: 13, title: function () { return I.t('achBj10'); }, desc: function () { return I.t('achBj10Desc'); }, prog: function () { return [Math.min(st.stats.bjs, 10), 10]; } });
    ACH.push({ id: 'h500', icon: 14, title: function () { return I.t('achH500'); }, desc: function () { return I.t('achH500Desc'); }, prog: function () { return [Math.min(st.stats.hands, 500), 500]; } });
    ACH.push({ id: 'streak5', icon: 15, title: function () { return I.t('achStreak'); }, desc: function () { return I.t('achStreakDesc'); }, prog: function () { return [Math.min(st.stats.bestStreak || 0, 5), 5]; } });
    ACH.forEach(function (a) { if (!a.kind) a.kind = 'record'; });
    ICONS.length = 22;          // rebuilt below on every build, so the indexes stay put
    // Longer ladders for the records
    function ladder(prefix, kind, steps, mark, title, desc, value, skip) {
      steps.forEach(function (n, k) {
        if (skip && skip.indexOf(n) >= 0) return;
        var icon = ladderIcon(k + 1, mark, short(n));
        ACH.push({ id: prefix + n, icon: icon, kind: kind, title: function () { return I.t(title, { n: U.fmt(n) }); }, desc: function () { return I.t(desc, { n: U.fmt(n) }); },
                   prog: function () { return [Math.min(value(), n), n]; } });
      });
    }
    ladder('streak_', 'record', [3, 5, 7, 10, 15, 20], 'x', 'achStreakN', 'achStreakNDesc', function () { return st.stats.bestStreak || 0; }, [5]);
    ladder('bj_', 'record', [50, 100, 500, 1000, 5000], '21', 'achBjN', 'achBjNDesc', function () { return st.stats.bjs || 0; });
    ladder('hands_', 'record', [100, 1000, 5000, 10000, 50000, 100000], 'chip', 'achHandsN', 'achHandsNDesc', function () { return st.stats.hands || 0; });
    ladder('won_', 'record', [50, 500, 2000, 10000, 50000], 'S', 'achWonN', 'achWonNDesc', function () { return st.stats.won || 0; });
    ladder('titles_', 'tour', [1, 3, 5, 10, 25, 50, 100], 'crown2', 'achTitlesN', 'achTitlesNDesc', function () { return ts().titles || 0; });
    ladder('tplay_', 'tour', [10, 50, 100, 300, 1000], 'star', 'achTPlayN', 'achTPlayNDesc', function () { var p = ts().played, t = 0; for (var k in p) t += p[k]; return t; });
    ladder('tw_', 'tour', [5000, 10000, 50000], '21', 'achTHands', 'achTHandsDesc', function () { return ts().wins || 0; });
    // each tournament: win it several times
    [['kings', 'crown'], ['ace', 'A'], ['world', 'star'], ['legend', 'gem']].forEach(function (x) {
      [3, 10, 30].forEach(function (n, k) {
        var icon = ladderIcon(k + 3, x[1], short(n));
        ACH.push({ id: 'tt_' + x[0] + '_' + n, icon: icon, kind: 'tour',
                   title: function () { return I.t('achTTitles', { t: I.t('tn_' + x[0]), n: n }); }, desc: function () { return I.t('achTTitlesDesc', { t: I.t('tn_' + x[0]), n: n }); },
                   prog: function () { return [Math.min((ts().titlesBy || {})[x[0]] || 0, n), n]; } });
      });
    });
    // Tournaments: play each one, finish high in it, win hands at tournament tables.
    var TOUR = [['kings', 16, [50, 10, 1]], ['ace', 17, [50, 10, 1]], ['world', 18, [50, 10, 1]], ['legend', 19, [10, 1]]];
    TOUR.forEach(function (x) {
      var id = x[0], name = function () { return I.t('tn_' + id); };
      ACH.push({ id: 'tj_' + id, icon: x[1], kind: 'tour', title: function () { return I.t('achTJoin', { t: name() }); }, desc: function () { return I.t('achTJoinDesc', { t: name() }); },
                 prog: function () { return [Math.min(ts().played[id] || 0, 1), 1]; } });
      x[2].forEach(function (n) {
        ACH.push({ id: 'tr_' + id + '_' + n, icon: x[1], kind: 'tour',
                   title: function () { return n === 1 ? I.t('achTWin', { t: name() }) : I.t('achTTop', { t: name(), n: n }); },
                   desc: function () { return n === 1 ? I.t('achTWinDesc', { t: name() }) : I.t('achTTopDesc', { t: name(), n: n }); },
                   prog: function () { var b = ts().best[id]; return [b && b <= n ? 1 : 0, 1]; } });
      });
    });
    [10, 50, 200, 1000].forEach(function (n) {
      ACH.push({ id: 'tw_' + n, icon: 21, kind: 'tour', title: function () { return I.t('achTHands', { n: n }); }, desc: function () { return I.t('achTHandsDesc', { n: n }); },
                 prog: function () { return [Math.min(ts().wins || 0, n), n]; } });
    });
    // Rating: reach each tier's line (by the best rating you've held)
    [['silver', 0.16], ['gold', 0.48], ['plat', 0.80], ['dia', 0.96], ['chall', 0.999]].forEach(function (x) {
      ACH.push({ id: 'rt_' + x[0], icon: 20, kind: 'rating',
                 title: function () { return I.t('achRate', { t: I.t('tier_' + x[0]) }); },
                 desc: function () { return I.t('achRateDesc', { t: I.t('tier_' + x[0]), r: U.fmt(BJ.tour.ratingAt(x[1])) }); },
                 prog: function () { var need = BJ.tour.ratingAt(x[1]); return [Math.min(Math.max(ts().peak || 0, st.rating || 0), need), need]; } });
    });
  }
  function iconOwned(i) { return i <= 1 || st.icons.indexOf(i) >= 0; }
  // Call after anything that could finish an achievement. New ones only light the red dot on the lobby button (no toast).
  M.check = function () {
    var fresh = [];
    ACH.forEach(function (a) {
      if (st.ach[a.id]) return;
      var p = a.prog();
      if (p[0] >= p[1]) { st.ach[a.id] = Date.now(); if (st.icons.indexOf(a.icon) < 0) st.icons.push(a.icon); fresh.push(a); }
    });
    if (fresh.length) {
      save();
      NcqMetrics.step("ach_first_done");
      refreshAchDot();
    }
  };
  function refreshAchDot() {
    var unseen = ACH.some(function (a) { return st.ach[a.id] && !st.achSeen[a.id]; });
    var b = $('btnAch'), dot = b.querySelector('.dot');
    if (unseen && !dot) { dot = document.createElement('i'); dot.className = 'dot'; b.appendChild(dot); }
    if (!unseen && dot) dot.remove();
  }
  var achTab = 'all';
  M.openAch = function (tab) {
    NcqMetrics.step("ach_open"); NcqMetrics.flow('achievements', { mode: 'app' });
    if (tab) achTab = tab;
    Array.prototype.forEach.call($('achTabs').children, function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === achTab); });
    var list = $('achList'); list.innerHTML = '';
    var done = 0;
    ACH.forEach(function (a) { if (st.ach[a.id]) done++; });
    ACH.forEach(function (a) {
      if (achTab !== 'all' && a.kind !== achTab) return;
      var p = a.prog(), ok = !!st.ach[a.id];
      var row = document.createElement('div'); row.className = 'ach' + (ok ? ' done' : ' locked');
      row.innerHTML = '<img alt=""><div><b></b><p></p><div class="bar"><i></i></div></div><span class="st"></span>';
      row.querySelector('img').src = M.icon(a.icon);
      row.querySelector('b').textContent = a.title();
      row.querySelector('p').textContent = a.desc();
      row.querySelector('.bar i').style.width = (p[0] / p[1] * 100).toFixed(0) + '%';
      row.querySelector('.st').textContent = ok ? I.t('achGot') : U.fmt(p[0]) + ' / ' + U.fmt(p[1]);
      list.appendChild(row);
      if (ok) st.achSeen[a.id] = 1;
    });
    $('achSummary').textContent = I.t('achSum', { n: done, m: ACH.length });
    save(); refreshAchDot();
    $('sheetAch').classList.add('open');
  };

  /* ---------- nickname ---------- */
  // Kept out of nicknames: swearing and slurs (Korean and English, with the common dodges), sexual terms,
  // and anything that poses as staff.
  var BANNED = ['시발', '씨발', '씨빨', '시바', '씨바', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '븅신', '개새', '개색', '개세', '새끼', '색기', '좆', '존나', '졸라', '지랄', 'ㅈㄹ',
    '닥쳐', '꺼져', '미친', '미쳤', '애미', '애비', '느금', '니미', '엠창', '창녀', '걸레', '보지', '자지', '섹스', '야동', '쌍년', '썅', '년놈', '한남', '김치녀', '틀딱', '장애인', '찐따',
    '운영자', '관리자', '운영진', 'gm', 'admin', 'staff', 'official', '공식',
    'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'asshole', 'bastard', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'sex', 'porn', 'rape', 'nazi', 'hitler'];
  function squash(s) {   // lower-case, drop spaces, digits used as letters and punctuation so "f.u.c.k" and "시1발" still match
    return s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/[^a-z가-힣ㄱ-ㅎ]/g, '');
  }
  M.checkNick = function (name) {
    name = (name || '').trim();
    if (name.length < 2 || name.length > 12) return 'nickLen';
    if (!/^[A-Za-z0-9가-힣_]+$/.test(name)) return 'nickChars';
    // three readings: as typed, with look-alike digits turned into letters, and with every digit and symbol taken out
    var raw = name.toLowerCase(), sq = squash(name), bare = raw.replace(/[^a-z가-힣ㄱ-ㅎ]/g, '');
    for (var k = 0; k < BANNED.length; k++) {
      var w = BANNED[k];
      if (raw.indexOf(w) >= 0 || sq.indexOf(w) >= 0 || bare.indexOf(w) >= 0) return 'nickBad';
    }
    if (name === st.nick) return 'nickSame';
    return null;
  };

  /* ---------- profile sheet ---------- */
  M.refreshAvatar = function () { $('avatarImg').src = M.icon(st.icon); };
  M.openProfile = function () {
    NcqMetrics.step("profile_open"); NcqMetrics.flow('profile', { mode: 'app' });
    $('profAva').src = M.icon(st.icon);
    $('profName').textContent = st.nick;
    $('profLv').textContent = 'Lv ' + BJ.engine.levelOf(st.xp) + ' · ' + I.t('hands') + ' ' + U.fmt(st.stats.hands);
    var inp = $('nickInput'); inp.value = st.nick; inp.placeholder = I.t('nickHint');
    $('btnNick').textContent = I.t('nickAd');
    setNickMsg(I.t('nickRule'), '');
    var grid = $('iconGrid'); grid.innerHTML = '';
    for (var i = 0; i < ICONS.length; i++) (function (i) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = (iconOwned(i) ? '' : 'locked') + (i === st.icon ? ' on' : '');
      b.innerHTML = '<img alt="">'; b.firstChild.src = M.icon(i);
      b.addEventListener('click', function () {
        BJ.audio.tick();
        if (!iconOwned(i)) {
          var a = ACH.filter(function (x) { return x.icon === i; })[0];
          return setNickMsg(a ? I.t('iconFrom', { a: a.title() }) : '', 'bad');
        }
        st.icon = i; save(); M.refreshAvatar(); NcqMetrics.step("icon_change"); M.openProfile();
      });
      grid.appendChild(b);
    })(i);
    $('sheetProfile').classList.add('open');
  };
  function setNickMsg(t, cls) { var m = $('nickMsg'); m.textContent = t; m.className = 'nickmsg' + (cls ? ' ' + cls : ''); }
  function changeNick() {
    NcqMetrics.step("nick_change_try");
    var name = $('nickInput').value.trim(), err = M.checkNick(name);
    if (err) { BJ.audio.deny(); return setNickMsg(I.t(err), 'bad'); }
    // a name change costs one rewarded ad
    M.rewarded(function () {
      st.nick = name; save();
      $('profName').textContent = name;
      setNickMsg(I.t('nickDone'), 'good');
      hooks.toast(I.t('nickDone'));
    });
  }

  /* ---------- ads (mock) ---------- */
  M.rewarded = function (done) {
    var box = $('adMock'), n = 3; box.hidden = false; $('adCount').textContent = n;
    var timer = setInterval(function () {
      n--; $('adCount').textContent = n;
      if (n > 0) return;
      clearInterval(timer); box.hidden = true; st.stats.ads++; save(); done();
    }, 1000);
  };
  // From Lv3 on, every tenth finished hand is followed by a full-screen ad that can be closed after 5 seconds.
  M.handDone = function () {         // true when an ad is about to show
    if (BJ.vip && BJ.vip.active()) return false;               // VIP: no full-screen ads
    if (BJ.engine.levelOf(st.xp) < 3) return false;          // no ads before Lv3
    st.adHands = (st.adHands || 0) + 1;
    if (st.adHands < 10) return false;                         // then one every 10 hands
    if (document.getElementById('unlockFx').classList.contains('on')) return false;   // wait for the next hand
    st.adHands = 0; save();
    setTimeout(showInterstitial, 150);                 // right as the hand ends
    return true;
  };
  function showInterstitial() {
    NcqMetrics.step("interstitial_first");
    var box = $('interAd'), n = 5, x = $('interClose');
    box.hidden = false; x.hidden = true; $('interCount').textContent = n;
    var timer = setInterval(function () {
      n--; $('interCount').textContent = Math.max(0, n);
      if (n > 0) return;
      clearInterval(timer); x.hidden = false;
    }, 1000);
  }
  M.debugInterstitial = showInterstitial;

  /* ---------- ranking (by level) ---------- */
  // Sample board until the game server is connected: a fixed field of players, with you placed by your XP.
  var NAMES = ['LuckySeven', '블랙잭장인', 'AceHunter', '딜러킬러', 'RoyalFlush', '하이롤러', 'CardShark', '카운팅고수', 'NightOwl', '럭키가이', 'Maverick', '올인맨', 'JackpotJin',
    '스플릿왕', 'VelvetQueen', '더블다운', 'SilverFox', '칩부자', 'MidnightAce', '포커페이스', 'GoldRush', '행운의여신', 'DiamondDave', '카지노로얄', 'Highball', '21번가', 'BlueChip',
    '하트에이스', 'Monaco', '마카오킹', 'Neon', '라스베가스', 'Ruby', '클로버', 'Phantom', '스페이드킹', 'Stardust', '이븐머니', 'Ivory', '인슈어런스', 'Blaze', '버스트없음',
    'Echo', '소프트17', 'Orchid', '하드핸드', 'Saffron', '내추럴', 'Tempest', '푸쉬', 'Willow', '셔플러'];
  M.NAMES = NAMES; M.iconCount = ICONS.length;
  var board = null;
  function sampleBoard() {
    if (board) return board;
    var x = 77, r = function () { x = (x * 9301 + 49297) % 233280; return x / 233280; };
    board = NAMES.map(function (n, i) {
      var lv = Math.max(1, Math.round(74 * Math.pow(1 - i / NAMES.length, 1.7) + r() * 3));
      return { nick: n, icon: (r() * ICONS.length) | 0, xp: BJ.engine.xpFor(lv) + Math.round(r() * 200) };
    });
    return board;
  }
  // Two boards: tournament rating (shown first) and level.
  var rankTab = 'rating';
  var legendWk = null;
  M.openRank = function (tab) {
    NcqMetrics.step("rank_open"); NcqMetrics.flow('ranking', { mode: 'app' });
    if (tab) rankTab = tab;
    if (rankTab === 'legend') return openLegend();
    $('rankSel').hidden = true;
    var rating = rankTab === 'rating';
    Array.prototype.forEach.call($('rankTabs').children, function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === rankTab); });
    $('rankNote').textContent = I.t(rating ? 'rankNoteRating' : 'rankNote');
    var me = { nick: st.nick, icon: st.icon, xp: st.xp, rating: st.rating, me: true };
    var all = rating ? BJ.tour.ratingList() : sampleBoard().concat([me]).sort(function (a, b) { return b.xp - a.xp; });
    var list = $('rankList'); list.innerHTML = '';
    var myRow = null, shown = 0;
    all.forEach(function (p, i) {
      var rk = p.rank || i + 1;
      var row = BJ.tour.rankRow(rk, p.icon, p.nick, rating ? U.fmt(p.rating) : 'Lv ' + BJ.engine.levelOf(p.xp), p.me);
      if (rating) row.querySelector('.lv').appendChild(BJ.tour.tierPill(p.rating));
      if (p.me) myRow = row;
      if (p.me && rk > shown + 1) return;            // far down the board: only in my own box below
      list.appendChild(row); shown = rk;
    });
    var meBox = $('rankMe'); meBox.innerHTML = ''; if (myRow) meBox.appendChild(myRow.cloneNode(true));
    $('sheetRank').classList.add('open');
    list.scrollTop = 0;                               // always from No. 1
  };

  // The Legendary League board: pick a season from the drop-down (the latest by default).
  function openLegend() {
    NcqMetrics.step("rank_legend_tab");
    Array.prototype.forEach.call($('rankTabs').children, function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === 'legend'); });
    $('rankNote').textContent = I.t('rankNoteLegend');
    var seasons = BJ.tour.legendSeasons(), sel = $('rankSel'), list = $('rankList'), meBox = $('rankMe');
    list.innerHTML = ''; meBox.innerHTML = '';
    sel.hidden = !seasons.length;
    if (!seasons.length) { list.appendChild(Object.assign(document.createElement('p'), { className: 'tempty', textContent: I.t('legendNone') })); $('sheetRank').classList.add('open'); return; }
    if (legendWk == null || !seasons.some(function (x) { return x.wk === legendWk; })) legendWk = seasons[0].wk;
    sel.innerHTML = '';
    seasons.forEach(function (x) { var o = document.createElement('option'); o.value = x.wk; o.textContent = BJ.tour.legendSeasonLabel(x); if (x.wk === legendWk) o.selected = true; sel.appendChild(o); });
    var myRow = null;
    BJ.tour.legendBoard(legendWk).forEach(function (p) {
      if (p.rank > 50 && !p.me) return;
      var row = BJ.tour.rankRow(p.rank, p.icon, p.nick, U.money(p.chips), p.me);
      if (p.me) myRow = row;
      if (!(p.me && p.rank > 50)) list.appendChild(row);
    });
    if (myRow) meBox.appendChild(myRow.cloneNode(true));
    $('sheetRank').classList.add('open');
    list.scrollTop = 0;
  }

  /* ---------- tablemates (multiplayer look) ---------- */
  M.randomMate = function (exclude) {
    var pool = NAMES.filter(function (n) { return exclude.indexOf(n) < 0; });
    return { nick: pool[(Math.random() * pool.length) | 0], icon: (Math.random() * ICONS.length) | 0 };
  };

  M.init = function (state, saveFn, h) {
    st = state; save = saveFn; hooks = h;
    if (!st.nick) st.nick = 'Player' + (1000 + ((Math.random() * 9000) | 0));
    if (st.icon == null) st.icon = 0;
    st.icons = st.icons || []; st.ach = st.ach || {}; st.achSeen = st.achSeen || {};
    buildAch();
    // icons for tables already open before achievements existed
    ACH.forEach(function (a) { var p = a.prog(); if (p[0] >= p[1] && !st.ach[a.id]) { st.ach[a.id] = 1; st.achSeen[a.id] = 1; if (st.icons.indexOf(a.icon) < 0) st.icons.push(a.icon); } });
    M.refreshAvatar(); refreshAchDot();
    // the profile opens from the lobby only; at a table it just says where to find it
    $('btnProfile').addEventListener('click', function () {
      BJ.audio.unlock(); BJ.audio.tick();
      if ($('game').className.indexOf('mode-lobby') < 0) return hooks.toast(I.t('profileLobby'));
      M.openProfile();
    });
    $('btnNick').addEventListener('click', function () { BJ.audio.unlock(); changeNick(); });
    $('nickInput').addEventListener('input', function () { var e = M.checkNick(this.value); setNickMsg(e && e !== 'nickSame' ? I.t(e) : I.t('nickRule'), e && e !== 'nickSame' ? 'bad' : ''); });
    $('btnAch').addEventListener('click', function () { BJ.audio.unlock(); BJ.audio.tick(); M.openAch(); });
    Array.prototype.forEach.call($('achTabs').children, function (b) { b.addEventListener('click', function () { BJ.audio.tick(); M.openAch(b.getAttribute('data-tab')); }); });
    $('btnRank').addEventListener('click', function () { BJ.audio.unlock(); BJ.audio.tick(); M.openRank('rating'); });
    Array.prototype.forEach.call($('rankTabs').children, function (b) { b.addEventListener('click', function () { BJ.audio.tick(); M.openRank(b.getAttribute('data-tab')); }); });
    $('rankSel').addEventListener('change', function () { legendWk = +this.value; BJ.audio.tick(); openLegend(); });
    $('interClose').addEventListener('click', function () { $('interAd').hidden = true; });
    save();
  };
})();
