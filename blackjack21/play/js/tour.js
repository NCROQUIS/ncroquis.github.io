// Blackjack tournaments: King's Cup (every week), Ace Masters (one week on, two off) and the World Championship
// (one week on, four off). Everyone pays the same entry, gets the same stack of tournament chips and 30 hands a day;
// when the week ends the biggest stacks win chips and rating points.
// The field is a sample until the game server (NcqBoard) is connected. game.js calls BJ.tour.init() with its state.
(function () {
  'use strict';
  var BJ = window.BJ, U = BJ.util, I = BJ.i18n;
  var T = BJ.tour = {};
  var NcqMetrics = BJ.ncqMetrics;
  var st, save, hooks, $ = function (id) { return document.getElementById(id); };

  var DAY = 864e5, HANDS = 30;
  var EPOCH = Date.UTC(2026, 0, 5);                 // a Monday: week 0
  var TOURS = [
    { id: 'kings', cycle: 1, phase: 0, fee: 1000, stack: 10000, min: 100, max: 2000, chips: [100, 500, 1000], field: 240, weight: 0, theme: 4, house: 'Kings Cup' },
    { id: 'ace', cycle: 3, phase: 1, fee: 10000, stack: 1000000, min: 10000, max: 200000, chips: [10000, 50000, 100000], field: 160, weight: 1, theme: 6, house: 'Ace Masters' },
    { id: 'world', cycle: 5, phase: 3, fee: 1000000, stack: 100000000, min: 1000000, max: 20000000, chips: [1000000, 5000000, 10000000], field: 480, weight: 4, theme: 7, house: 'World Champ', big: true },
    // once a season (the last full week of each quarter), for the top 30% by rating; when it ends, the season ends and rating resets
    { id: 'legend', legend: true, fee: 10000000, stack: 1000000000, min: 5000000, max: 50000000, chips: [1000000, 5000000, 10000000], field: 64, weight: 0, theme: 10, house: 'Legendary League', topPct: 0.3 }
  ];
  var byId = {}; TOURS.forEach(function (t) { byId[t.id] = t; });
  // Tiers go by percentile, the way chess ladders do: the share of players you're rated above.
  var TIERS = [[0, 'iron'], [0.01, 'bronze'], [0.16, 'silver'], [0.48, 'gold'], [0.80, 'plat'], [0.96, 'dia'], [0.999, 'chall']];
  // Until the server keeps the real ladder, the player base is modelled: 10,000 players, ratings spread
  // normally around 1,050 (sd 230). Percentile, rank and the top-50 board all come from that.
  var POP = 10000, MU = 1050, SD = 230;
  function erf(x) { var t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
  function pctOf(r) { return 0.5 * (1 + erf((r - MU) / SD / Math.SQRT2)); }
  function zOf(p) {                 // inverse normal (Acklam), good to ~1e-9
    var a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924], b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857],
        c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878], d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742], q, r;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function ratingAt(p) { return Math.round(MU + SD * zOf(p)); }   // the rating that sits at percentile p

  I.add('en', {
    tourBtn: 'Blackjack Tournaments', tLiveN: '{n} live', tourTitle: 'Tournaments', tourBig: 'Biggest', tourSched: 'Schedule', myRating: 'My rating',
    tn_kings: "King's Cup", tn_ace: 'Ace Masters', tn_world: 'World Championship',
    tc_kings: 'Every week', tc_ace: 'Every 3 weeks', tc_world: 'Every 5 weeks',
    tLive: 'Live · {t} left', tPlaying: '#{r} · {t} left', tNext: 'Starts {d} · D-{n}',
    tDH: '{d}d {h}h', tHM: '{h}h {m}m', tEd: '#{n}', tEnds: 'Live · ends in {t}', tStarts: 'Starts {d} · D-{n}',
    tFee: 'Entry', tStack: 'Starting chips', tDaily: 'Hands a day', tMyRank: 'My rank', tMyChips: 'Tour chips', tToday: 'Hands left today', tRankOf: '#{r} / {n}',
    tabBoard: 'Standings', tabPrize: 'Prizes', tabRules: 'How it works',
    tJoin: 'Join · entry {n}', tPlay: 'Play · {n} hands left today', tDoneToday: 'Next {n} hands in {t}', tOut: 'Out of chips · eliminated',
    tSoon: 'Opens {d}', tNoFee: 'Not enough chips · entry {n}', tJoined: "You're in! You start with {n} tournament chips",
    tBoardWait: 'Standings show up once the tournament starts.', tPlayers: '{n} players', tSample: 'sample field until the game server is connected',
    tRank1: '#{a}', tRankR: '#{a}–{b}', tTop30: 'Top 30%', tPrizeNote: 'Prizes are paid in chips when the week ends.', tRp_kings: 'King\u2019s Cup gives no rating points (RP).', tRp_ace: 'A few rating points (RP) are at stake; the lower half loses some.', tRp_world: 'The most rating points (RP) of any tournament; the lower half loses some.',
    tRules: 'Everyone pays the same entry and starts with the same {s} tournament chips.\nYou get {h} hands every day. Hands you don’t play don’t carry over to the next day.\nBets at the tournament table are {min}–{max}.\nWhen the week ends, players are ranked by the chips they hold.\nYour rank pays prize chips and rating points. Lose all your chips and you’re out.\nTournament chips stay in the tournament; your own chips aren’t touched.',
    tHands: 'Hands {n}/{m}', tChipTag: 'TOUR', tTodayDone: 'All {n} hands played today · see you tomorrow', tBust: 'Out of chips · you’re out of this tournament',
    tResTitle: '{t} #{n} is over', tResOf: 'of {n} players · {c} chips', tResOut: 'Eliminated', tResPrize: 'Prize', tResRate: 'Rating', tOk: 'OK',
    calDays: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', calCad_kings: 'Every week', calCad_ace: '1 week on · 2 weeks off', calCad_world: '1 week on · 4 weeks off', calNow: 'Live now', calHint: 'Each tournament runs Monday to Sunday.',
    rankRating: 'Rating', rankLevel: 'Level', rankNoteRating: 'Ranked by tournament rating · sample board until the game server is connected',
    tn_legend: 'Legendary League', tc_legend: 'Once a season', calCad_legend: 'Last week of each quarter · top 30% only', thRpv_legend: 'None', tRp_legend: 'No rating points here: when it ends, the season ends and every rating goes back to 1,000.', tNeedRank: 'Top {a}% rating only · you are top {b}', tourSeason: 'Season finale', tReq: 'Entry {f} · top {a}% rating', seasonOver: 'Season {n} is over', seasonFinal: 'Final rating {r} · ratings start again at 1,000', seasonReset: 'reset', rateHelp: 'Rating', rhTop: 'Top {a} · #{r}', rhReset: 'Next reset: {d} (D-{n})', rhSeason: 'Season {n}', rhSecs: 'What rating is\nRating starts at 1,000 and moves with where you finish in tournaments.\nKing\u2019s Cup gives no rating points, Ace Masters a few, the World Championship the most.\nThe lower half of a tournament loses some points.||Seasons and the reset\nA season is a calendar quarter. It ends with the Legendary League in the quarter\u2019s last full week.\nWhen the Legendary League ends, every rating goes back to 1,000 and a new season starts.\nThe Legendary League is open to the top 30% by rating, entry 10M.||Tiers\nYour tier comes from your percentile, the way chess ladders work: the share of players rated below you.\nOnly the top 0.1% are Challengers.', achTJoin: 'Play the {t}', achTJoinDesc: 'Enter the {t} once', achTTop: '{t} top {n}', achTTopDesc: 'Finish the {t} in the top {n}', achTWin: '{t} champion', achTWinDesc: 'Win the {t}', achTHands: '{n} tournament wins', achTHandsDesc: 'Win {n} hands at tournament tables', achRate: 'Reach {t}', achRateDesc: 'Reach a rating of {r} ({t})', achAll: 'All', achTable: 'Tables', achTour: 'Tournaments', achRating: 'Rating', achRecord: 'Records', achStreakN: '{n} wins in a row', achStreakNDesc: 'Win {n} hands in a row', achBjN: '{n} blackjacks', achBjNDesc: 'Get {n} blackjacks', achHandsN: '{n} hands', achHandsNDesc: 'Play {n} hands', achWonN: '{n} hands won', achWonNDesc: 'Win {n} hands', achTitlesN: '{n} tournament titles', achTitlesNDesc: 'Win tournaments {n} times (any)', achTPlayN: '{n} tournaments', achTPlayNDesc: 'Enter tournaments {n} times', achTTitles: '{t} ×{n}', achTTitlesDesc: 'Win the {t} {n} times', rankLegend: 'Legendary', rankNoteLegend: 'Final standings of the Legendary League · sample until the game server is connected', legendLive: 'live', legendNone: 'No Legendary League has been held yet.', tier_iron: 'Iron', tier_bronze: 'Bronze', tier_silver: 'Silver', tier_gold: 'Gold', tier_plat: 'Platinum', tier_dia: 'Diamond', tier_chall: 'Challenger', tierTop: 'Top: {a}+', tierBand: '{a} – {b}', tierBelow: 'Under {b}', tourHelp: 'Tournament guide', thBets: 'Bets', thRp: 'RP', thWhen: 'Runs', thRpv_kings: 'None', thRpv_ace: 'Low', thRpv_world: 'High', thTiers: 'Rating tiers', thSecs: 'How it works\nEveryone pays the same entry and gets the same stack of tournament chips.\nThe three tournaments at a glance:||Hands\nYou get 30 hands every day. Unplayed hands don\u2019t carry over.\nNew hands arrive at midnight.\nTournament chips are separate from your own chips. Running out of them knocks you out.||Prizes\nWhen the week ends, players are ranked by the tournament chips they hold.\nPrize chips go to your own chips; the top 30% at least get the entry back.\nResults show up the next time you open the lobby.||Rating (RP)\nRating starts at 1,000 and moves with your finishing place.\nKing\u2019s Cup gives no RP, Ace Masters a little, the World Championship the most.\nThe lower half of a field loses RP. Rankings show rating first.||Schedule\nEvery tournament runs Monday to Sunday.\nKing\u2019s Cup every week, Ace Masters one week on and two off, the World Championship one week on and four off.', tHandsShort: 'Today {n}/{m}', tOutShort: 'Eliminated', tourInGame: 'Tournaments open from the lobby.'
  });
  I.add('ko', {
    tourBtn: '블랙잭 대회', tLiveN: '{n}개 진행 중', tourTitle: '블랙잭 대회', tourBig: '최대 규모', tourSched: '대회 일정', myRating: '내 레이팅',
    tn_kings: '킹스 컵', tn_ace: '에이스 마스터즈', tn_world: '월드 챔피언십',
    tc_kings: '매주 개최', tc_ace: '3주마다 개최', tc_world: '5주마다 개최',
    tLive: '진행 중 · {t} 남음', tPlaying: '{r}위 · {t} 남음', tNext: '{d} 개최 · D-{n}',
    tDH: '{d}일 {h}시간', tHM: '{h}시간 {m}분', tEd: '제 {n}회', tEnds: '진행 중 · 종료까지 {t}', tStarts: '{d} 시작 · D-{n}',
    tFee: '참가비', tStack: '시작 칩', tDaily: '하루 핸드', tMyRank: '내 순위', tMyChips: '대회 칩', tToday: '오늘 남은 핸드', tRankOf: '{r}위 / {n}명',
    tabBoard: '순위', tabPrize: '상금', tabRules: '진행 방식',
    tJoin: '참가하기 · 참가비 {n}', tPlay: '대회 테이블로 · 오늘 {n}핸드 남음', tDoneToday: '{t} 뒤 {n}핸드 충전', tOut: '칩을 모두 잃어 탈락했어요',
    tSoon: '{d}에 열려요', tNoFee: '칩이 모자라요 · 참가비 {n}', tJoined: '참가 완료! 대회 칩 {n}으로 시작해요',
    tBoardWait: '대회가 시작되면 순위가 보여요.', tPlayers: '{n}명 참가', tSample: '게임 서버 연결 전까지는 샘플 참가자예요',
    tRank1: '{a}위', tRankR: '{a}–{b}위', tTop30: '상위 30%', tPrizeNote: '상금은 대회가 끝나면 칩으로 지급돼요.', tRp_kings: '킹스 컵은 레이팅 점수(RP)가 없어요.', tRp_ace: '레이팅 점수(RP)가 조금 걸려요. 하위 절반은 조금 깎여요.', tRp_world: '레이팅 점수(RP)가 가장 많이 걸려요. 하위 절반은 깎여요.',
    tRules: '모든 참가자가 같은 참가비를 내고 같은 대회 칩 {s}으로 시작해요.\n매일 {h}핸드가 주어져요. 그날 쓰지 않은 핸드는 다음 날로 넘어가지 않아요.\n대회 테이블 베팅은 {min}–{max}이에요.\n대회가 끝날 때 가진 칩이 많은 순으로 순위를 정해요.\n순위에 따라 상금(칩)과 레이팅 점수를 받아요. 칩을 다 잃으면 탈락이에요.\n대회 칩은 대회 안에서만 쓰이고, 내 칩과 섞이지 않아요.',
    tHands: '남은 핸드 {n}/{m}', tChipTag: '대회', tTodayDone: '오늘 {n}핸드를 모두 마쳤어요 · 내일 또 만나요', tBust: '칩을 모두 잃어 대회에서 탈락했어요',
    tResTitle: '{t} 제 {n}회 종료', tResOf: '{n}명 중 · 최종 칩 {c}', tResOut: '탈락', tResPrize: '상금', tResRate: '레이팅', tOk: '확인',
    calDays: '월,화,수,목,금,토,일', calCad_kings: '매주 진행', calCad_ace: '1주 진행 · 2주 휴식', calCad_world: '1주 진행 · 4주 휴식', calNow: '진행 중', calHint: '모든 대회는 월요일에 시작해 일요일에 끝나요.',
    rankRating: '레이팅', rankLevel: '레벨', rankNoteRating: '대회 레이팅 순 · 게임 서버 연결 전까지는 샘플 순위예요',
    tn_legend: '레전더리 리그', tc_legend: '시즌마다 한 번', calCad_legend: '분기 마지막 주 · 레이팅 상위 30%', thRpv_legend: '없음', tRp_legend: '레이팅 점수는 없어요. 이 대회가 끝나면 시즌이 끝나고 모든 레이팅이 1,000으로 초기화돼요.', tNeedRank: '레이팅 상위 {a}%만 참가 · 지금 상위 {b}', tourSeason: '시즌 결승', tReq: '참가비 {f} · 레이팅 상위 {a}%', seasonOver: '시즌 {n} 종료', seasonFinal: '최종 레이팅 {r} · 레이팅은 1,000부터 다시 시작해요', seasonReset: '초기화', rateHelp: '레이팅', rhTop: '상위 {a} · {r}위', rhReset: '다음 초기화: {d} (D-{n})', rhSeason: '시즌 {n}', rhSecs: '레이팅이란\n레이팅은 1,000에서 시작해 대회 순위에 따라 오르내려요.\n킹스 컵은 레이팅 점수가 없고, 에이스 마스터즈는 조금, 월드 챔피언십은 가장 많이 걸려요.\n대회 하위 절반은 점수가 깎여요.||시즌과 초기화\n시즌은 3달(분기) 단위예요. 분기 마지막 주에 레전더리 리그가 열리고 그 주가 시즌의 끝이에요.\n레전더리 리그가 끝나면 모든 레이팅이 1,000으로 초기화되고 새 시즌이 시작돼요.\n레전더리 리그는 레이팅 상위 30%만, 참가비 10M으로 들어갈 수 있어요.||티어\n티어는 체스 랭킹처럼 백분위로 정해요. 나보다 레이팅이 낮은 사람의 비율이에요.\n상위 0.1%만 챌린저가 될 수 있어요.', achTJoin: '{t} 첫 참가', achTJoinDesc: '{t}에 한 번 참가하기', achTTop: '{t} {n}위 안', achTTopDesc: '{t}에서 {n}위 안에 들기', achTWin: '{t} 우승', achTWinDesc: '{t}에서 1위 하기', achTHands: '대회 {n}승', achTHandsDesc: '대회 테이블에서 {n}핸드 이기기', achRate: '{t} 달성', achRateDesc: '레이팅 {r}({t}) 달성하기', achAll: '전체', achTable: '테이블', achTour: '대회', achRating: '레이팅', achRecord: '기록', achStreakN: '{n}연승', achStreakNDesc: '{n}핸드 연속으로 이기기', achBjN: '블랙잭 {n}번', achBjNDesc: '블랙잭 {n}번 만들기', achHandsN: '{n}핸드', achHandsNDesc: '{n}핸드 플레이하기', achWonN: '{n}승', achWonNDesc: '{n}핸드 이기기', achTitlesN: '대회 우승 {n}회', achTitlesNDesc: '어떤 대회든 {n}번 우승하기', achTPlayN: '대회 {n}회 참가', achTPlayNDesc: '대회에 {n}번 참가하기', achTTitles: '{t} {n}회 우승', achTTitlesDesc: '{t}에서 {n}번 우승하기', rankLegend: '레전더리', rankNoteLegend: '레전더리 리그 최종 순위 · 게임 서버 연결 전까지는 샘플이에요', legendLive: '진행 중', legendNone: '아직 열린 레전더리 리그가 없어요.', tier_iron: '아이언', tier_bronze: '브론즈', tier_silver: '실버', tier_gold: '골드', tier_plat: '플래티넘', tier_dia: '다이아몬드', tier_chall: '챌린저', tierTop: '{a} 이상', tierBand: '{a} 이상 {b} 미만', tierBelow: '{b} 미만', tourHelp: '대회 도움말', thBets: '베팅', thRp: 'RP', thWhen: '개최', thRpv_kings: '없음', thRpv_ace: '적음', thRpv_world: '많음', thTiers: '레이팅 등급', thSecs: '대회 방식\n모든 참가자가 같은 참가비를 내고 같은 대회 칩으로 시작해요.\n대회별 참가비와 시작 칩은 아래와 같아요.||핸드\n하루에 30핸드를 할 수 있어요. 그날 쓰지 않은 핸드는 다음 날로 넘어가지 않아요.\n자정이 지나면 30핸드가 새로 채워져요.\n대회 칩은 내 칩과 따로예요. 대회 칩을 다 잃으면 탈락이에요.||상금\n대회가 끝나는 순간 가진 대회 칩이 많은 순으로 순위를 정해요.\n상금은 내 칩으로 들어오고, 상위 30%는 적어도 참가비를 돌려받아요.\n결과는 대회가 끝난 뒤 로비에 들어오면 보여요.||레이팅(RP)\n레이팅은 1,000에서 시작해 대회 순위에 따라 오르내려요.\n킹스 컵은 RP가 없고, 에이스 마스터즈는 조금, 월드 챔피언십은 가장 많이 걸려요.\n하위 절반은 RP가 깎여요. 랭킹은 레이팅 순이 먼저 보여요.||대회 일정\n모든 대회는 월요일에 시작해 일요일에 끝나요.\n킹스 컵은 매주, 에이스 마스터즈는 1주 진행·2주 휴식, 월드 챔피언십은 1주 진행·4주 휴식이에요.', tHandsShort: '오늘 {n}/{m}핸드', tOutShort: '탈락', tourInGame: '대회는 로비에서 들어갈 수 있어요.'
  });

  /* ---------- calendar ---------- */
  var shift = 0;                                     // test hook: move the clock
  T.now = function () { return Date.now() + shift; };
  function dayIndex(t) { var d = new Date(t); return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / DAY); }
  function curWk() { return Math.floor(dayIndex(T.now()) / 7); }
  function wkStart(wk) { return new Date(2026, 0, 5 + wk * 7); }
  // Seasons follow the calendar quarters. Each one closes with the Legendary League in the quarter's last full
  // Monday-to-Sunday week; when that week ends, everyone's rating goes back to the start.
  function quarterOf(d) { return d.getFullYear() * 4 + Math.floor(d.getMonth() / 3); }
  function legendWkOfQuarter(q) {
    var end = new Date(Math.floor(q / 4), (q % 4) * 3 + 3, 0);          // last day of the quarter
    var sunday = new Date(end.getFullYear(), end.getMonth(), end.getDate() - end.getDay());
    return Math.floor(dayIndex(sunday.getTime()) / 7);
  }
  function isLegendWk(wk) { return legendWkOfQuarter(quarterOf(wkStart(wk))) === wk; }
  function isOn(t, wk) { return t.legend ? isLegendWk(wk) : ((wk - t.phase) % t.cycle + t.cycle) % t.cycle === 0; }
  function nextOn(t, wk) { while (!isOn(t, wk)) wk++; return wk; }
  function edition(t, wk) { return t.legend ? quarterOf(wkStart(wk)) - quarterOf(new Date(2026, 0, 5)) + 1 : Math.floor((wk - t.phase) / t.cycle) + 1; }
  // The next rating reset: the end of the coming (or running) Legendary League week.
  function nextReset() { var wk = nextOn(byId.legend, curWk()); return wkStart(wk + 1); }
  T.nextReset = function () { return nextReset(); };
  function progress(wk) { return Math.max(0, Math.min(1, (T.now() - wkStart(wk).getTime()) / (7 * DAY))); }
  function today() { return String(dayIndex(T.now())); }
  function fmtDate(d, wd) {
    return d.toLocaleDateString(I.lang === 'ko' ? 'ko-KR' : 'en-US', wd ? { month: 'short', day: 'numeric', weekday: 'short' } : { month: 'short', day: 'numeric' });
  }
  function fmtLeft(ms) {
    var m = Math.max(0, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
    return d ? I.t('tDH', { d: d, h: h }) : I.t('tHM', { h: h, m: m % 60 });
  }
  function dDay(date) { return Math.max(1, Math.round((date.getTime() - new Date(new Date(T.now()).toDateString()).getTime()) / DAY)); }
  function untilMidnight() { var n = new Date(T.now()); return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - n.getTime(); }

  // Where a tournament stands right now.
  function status(t) {
    var wk = curWk();
    if (isOn(t, wk)) return { live: true, wk: wk, ends: wkStart(wk + 1), start: wkStart(wk) };
    var n = nextOn(t, wk);
    return { live: false, wk: n, start: wkStart(n), ends: wkStart(n + 1) };
  }
  function keyOf(t, wk) { return t.id + ':' + wk; }
  function entry(t, wk) { return st.tours[keyOf(t, wk)] || null; }

  /* ---------- the field (sample) ---------- */
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var x = seed || 1; return function () { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; }; }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-6)) * Math.cos(6.2832 * r()); }
  var fields = {};
  function field(t, wk) {
    var k = t.id + wk;
    if (fields[k]) return fields[k];
    var r = rng(hash(k)), names = BJ.meta.NAMES.slice(), out = [];
    for (var i = names.length - 1; i > 0; i--) { var j = (r() * (i + 1)) | 0, tmp = names[i]; names[i] = names[j]; names[j] = tmp; }
    for (i = 0; i < t.field; i++) {
      var nick = i < names.length ? names[i] : names[(r() * names.length) | 0] + ((r() * 900 + 100) | 0);
      out.push({ nick: nick, icon: (r() * BJ.meta.iconCount) | 0, fin: t.stack * Math.exp(0.5 * gauss(r) + 0.05), bust: r() < 0.1 ? 0.15 + r() * 0.85 : 2, wob: r() * 6.28 });
    }
    return (fields[k] = out);
  }
  function chipsAt(t, q, p) {
    if (p >= q.bust) return 0;
    var S = t.stack, c = S + (q.fin - S) * Math.pow(p, 0.85) + Math.sin(q.wob + p * 9) * S * 0.24 * Math.sqrt(p * (1 - p));
    return Math.max(0, Math.round(c / t.min) * t.min);
  }
  function myChips(t, wk) {
    var e = entry(t, wk);
    if (!e) return null;
    if (st.inTour === keyOf(t, wk)) return st.chips;
    return e.out ? 0 : e.chips;
  }
  function standings(t, wk, p) {
    var list = field(t, wk).map(function (q) { return { nick: q.nick, icon: q.icon, chips: chipsAt(t, q, p) }; });
    var mine = myChips(t, wk);
    if (mine != null) list.push({ nick: st.nick, icon: st.icon, chips: mine, me: true });
    list.sort(function (a, b) { return b.chips - a.chips || (a.me ? -1 : b.me ? 1 : 0); });
    return list;
  }
  function myRank(list) { for (var i = 0; i < list.length; i++) if (list[i].me) return i + 1; return 0; }

  /* ---------- prizes and rating ---------- */
  function prizeTiers(t, n) {
    var f = t.fee, top = Math.ceil(n * 0.3);
    var tiers = [[1, 1, f * 100], [2, 2, f * 60], [3, 3, f * 40], [4, 10, f * 15], [11, 25, f * 6], [26, 50, f * 3]];
    if (top > 50) tiers.push([51, top, f * 1.5]);
    return tiers.filter(function (x) { return x[0] <= n; }).map(function (x) { return [x[0], Math.min(x[1], n), x[2]]; });
  }
  function prizeFor(t, rank, n, chips) {
    if (!chips) return 0;
    var tiers = prizeTiers(t, n);
    for (var i = 0; i < tiers.length; i++) if (rank >= tiers[i][0] && rank <= tiers[i][1]) return tiers[i][2];
    return 0;
  }
  function ratingDelta(t, rank, n) { var p = (rank - 1) / Math.max(1, n - 1); return Math.round(t.weight * (40 - 65 * p + (rank === 1 ? 20 : 0))); }   // King's Cup: no rating at all
  function tierOf(r) { var p = pctOf(r), k = TIERS[0][1]; TIERS.forEach(function (x) { if (p >= x[0]) k = x[1]; }); return k; }
  T.tierOf = tierOf;
  function myRatingPct() { return 1 - pctOf(st.rating); }      // share of players above you: 0.3 = top 30%
  T.myRatingPct = myRatingPct;
  function myRatingRank() {
    var board = T.ratingBoard(), above = board.filter(function (p) { return p.rating > st.rating; }).length;
    return above < board.length ? above + 1 : Math.max(board.length + 1, Math.round((1 - pctOf(st.rating)) * POP) + 1);
  }
  T.myRatingRank = myRatingRank;
  // The rating board: the top 50 of the modelled ladder, plus you in your place (or under them with your rank).
  T.ratingList = function () {
    var list = T.ratingBoard().map(function (p, i) { return { nick: p.nick, icon: p.icon, rating: p.rating, rank: i + 1 }; });
    var me = { nick: st.nick, icon: st.icon, rating: st.rating, me: true, rank: myRatingRank() };
    if (me.rank <= list.length) { list.splice(me.rank - 1, 0, me); for (var i = me.rank; i < list.length; i++) list[i].rank = i + 1; list.pop(); }
    else list.push(me);
    return list;
  };
  function tierPill(r) { var k = tierOf(r), s = document.createElement('i'); s.className = 'tier t-' + k; s.textContent = I.t('tier_' + k); return s; }
  T.tierPill = tierPill;
  function tierPillK(k) { var s = document.createElement('i'); s.className = 'tier t-' + k; s.textContent = I.t('tier_' + k); return s; }
  // tier, percentile band and about where that is in rating today
  function tierTable(box) {
    TIERS.slice().reverse().forEach(function (x, i, arr) {
      var up = i ? arr[i - 1][0] : null, w = el('span', '');
      w.appendChild(tierPillK(x[1]));
      var band = up == null ? I.t('tierTop', { a: pct(x[0]) }) : x[0] === 0 ? I.t('tierBelow', { b: pct(up) }) : I.t('tierBand', { a: pct(x[0]), b: pct(up) });
      w.appendChild(el('small', '', band)); w.appendChild(el('em', '', x[0] ? '≈' + U.fmt(ratingAt(x[0])) + '+' : ''));
      box.appendChild(w);
    });
  }
  function pct(p) { return (Math.round(p * 1000) / 10) + '%'; }
  T.tierTable = tierTable;
  T.ratingAt = ratingAt;
  var rboard = null;
  T.ratingBoard = function () {
    if (rboard) return rboard;
    var r = rng(hash('rating')), names = BJ.meta.NAMES;
    rboard = [];
    for (var i = 0; i < 50; i++) rboard.push({ nick: i < names.length ? names[i] : names[i % names.length] + (i + 7), icon: (r() * BJ.meta.iconCount) | 0, rating: ratingAt(1 - (i + 0.5) / POP) });
    return rboard;
  };

  /* ---------- art ---------- */
  var SPADE = 'M0-46C-62 6-34 46-6 18L-14 44H14L6 18C34 46 62 6 0-46Z';
  function spade(x, y, k, fill) { return '<path transform="translate(' + x + ' ' + y + ') scale(' + k + ')" d="' + SPADE + '" fill="' + (fill || '#16161b') + '"/>'; }
  function card(cx, cy, rot, letter, s, mid) {
    var w = 34 * s, h = 48 * s;
    return '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + rot + ')">' +
      '<rect x="' + (-w / 2 + 1.5) + '" y="' + (-h / 2 + 2.5) + '" width="' + w + '" height="' + h + '" rx="' + 4 * s + '" fill="#000" opacity=".35"/>' +
      '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="' + 4 * s + '" fill="url(#tgCard)" stroke="#b49a63" stroke-width=".8"/>' +
      '<text x="' + (-w / 2 + 3.4 * s) + '" y="' + (-h / 2 + 12.5 * s) + '" font-family="Playfair Display,Georgia,serif" font-weight="900" font-size="' + 12.5 * s + '" fill="#16161b">' + letter + '</text>' +
      spade(-w / 2 + 7.8 * s, -h / 2 + 19.5 * s, 0.07 * s) + (mid || spade(1.5 * s, 5 * s, 0.24 * s)) + '</g>';
  }
  function crown(cx, cy, s) {
    var p = [[-1, .5], [-1, -.42], [-.5, .02], [0, -.68], [.5, .02], [1, -.42], [1, .5]].map(function (q) { return (cx + q[0] * s).toFixed(1) + ',' + (cy + q[1] * s).toFixed(1); }).join(' ');
    return '<g><polygon points="' + p + '" fill="url(#tgGold)" stroke="#7a520f" stroke-width=".9" stroke-linejoin="round"/>' +
      '<rect x="' + (cx - s) + '" y="' + (cy + s * .32) + '" width="' + 2 * s + '" height="' + s * .32 + '" rx="1" fill="url(#tgGold)" stroke="#7a520f" stroke-width=".8"/>' +
      [[-1, -.42], [0, -.68], [1, -.42]].map(function (q) { return '<circle cx="' + (cx + q[0] * s) + '" cy="' + (cy + q[1] * s - 1.6) + '" r="' + s * .12 + '" fill="url(#tgGold)" stroke="#7a520f" stroke-width=".6"/>'; }).join('') +
      '<circle cx="' + cx + '" cy="' + (cy + s * .47) + '" r="' + s * .1 + '" fill="#c0283a"/><circle cx="' + (cx - s * .55) + '" cy="' + (cy + s * .47) + '" r="' + s * .07 + '" fill="#2b7fd0"/><circle cx="' + (cx + s * .55) + '" cy="' + (cy + s * .47) + '" r="' + s * .07 + '" fill="#2b7fd0"/></g>';
  }
  function laurel(cx, cy, r, s) {
    var out = '';
    [-1, 1].forEach(function (side) {
      for (var k = 0; k < 9; k++) {
        var a = (100 + k * 15) * Math.PI / 180, x = cx + side * -Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.95;
        var rot = side * (k * 15 + 10) + (side < 0 ? 180 : 0);
        out += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="' + 2.4 * s + '" ry="' + 5.4 * s + '" transform="rotate(' + (rot + side * 35).toFixed(0) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')" fill="url(#tgGold)" stroke="#7a520f" stroke-width=".5"/>';
      }
    });
    return out + '<path d="M' + (cx - 6) + ' ' + (cy + r * .98) + 'q6 4 12 0" stroke="url(#tgGold)" stroke-width="2.2" fill="none"/>';
  }
  function trophy(cx, cy, s) {
    var g = 'fill="url(#tgGold)" stroke="#6e480c" stroke-width=".9"';
    return '<g transform="translate(' + cx + ' ' + cy + ') scale(' + s + ')">' +
      '<path d="M-17-20c-12 0-12 16 1 17M17-20c12 0 12 16-1 17" fill="none" stroke="url(#tgGold)" stroke-width="3.2"/>' +
      '<path d="M-19-24H19V-12C19 4 9 12 0 13C-9 12-19 4-19-12Z" ' + g + '/>' +
      '<circle cx="0" cy="-8" r="9" fill="url(#tgGlobe)" stroke="#6e480c" stroke-width=".7"/>' +
      '<path d="M-9-8H9M0-17V1M-6-15c4 4 4 10 0 14M6-15c-4 4-4 10 0 14M-8-12.5h16M-8-3.5h16" stroke="#7a520f" stroke-width=".6" fill="none" opacity=".8"/>' +
      '<rect x="-3.5" y="12" width="7" height="8" ' + g + '/><rect x="-11" y="20" width="22" height="5" rx="1" ' + g + '/><rect x="-14" y="25" width="28" height="6" rx="1.5" fill="#1c1410" stroke="url(#tgGold)" stroke-width="1"/>' +
      spade(0, 28, 0.045, '#e8c463') + '</g>';
  }
  var ART = {
    kings: function () { return '<svg viewBox="0 0 100 70">' + card(43, 33, -9, 'K', 1.1, crown(1, 4, 7.5)) + crown(66, 50, 15) + '</svg>'; },
    ace: function () { return '<svg viewBox="0 0 100 70">' + laurel(50, 33, 27, 1) + card(50, 32, -5, 'A', 1.08) + '</svg>'; },
    world: function () { return '<svg viewBox="0 0 100 70">' + laurel(50, 33, 30, 1) + trophy(50, 33, 0.95) + '</svg>'; },
    legend: function () {
      return '<svg viewBox="0 0 100 70">' + laurel(50, 35, 29, 1) +
        '<polygon points="50,62 30,36 38,26 62,26 70,36" fill="url(#tgGem)" stroke="#e8d3ff" stroke-width="1"/>' +
        '<path d="M30 36H70M38 26L44 36L50 26L56 36L62 26M44 36L50 62L56 36" fill="none" stroke="#f4e8ff" stroke-width=".8" opacity=".75"/>' +
        crown(50, 16, 10) + '</svg>';
    },
    banner: function () { return '<svg viewBox="0 0 62 50">' + card(22, 26, -12, 'A', 0.82) + card(38, 25, 9, 'K', 0.82, crown(1, 4, 6)) + '</svg>'; },
    cal: function () {
      var d = '';
      for (var y = 0; y < 2; y++) for (var x = 0; x < 3; x++) d += '<rect x="' + (13 + x * 9) + '" y="' + (27 + y * 8) + '" width="6" height="5" rx="1" fill="url(#tgGold)"/>';
      return '<svg viewBox="0 0 50 50"><rect x="8" y="12" width="34" height="30" rx="4" fill="none" stroke="url(#tgGold)" stroke-width="3"/><rect x="8" y="12" width="34" height="9" rx="3" fill="url(#tgGold)"/>' +
        '<rect x="15" y="7" width="4" height="9" rx="2" fill="url(#tgGold)"/><rect x="31" y="7" width="4" height="9" rx="2" fill="url(#tgGold)"/>' + d + '</svg>';
    },
    ornament: function () {
      return '<svg viewBox="0 0 160 30"><path d="M8 20c20 0 34-8 52-6 8 1 12 4 14 6M152 20c-20 0-34-8-52-6-8 1-12 4-14 6" fill="none" stroke="url(#tgGold)" stroke-width="1.6"/>' +
        '<path d="M44 19c4-6 10-6 13-2M116 19c-4-6-10-6-13-2" fill="none" stroke="url(#tgGold)" stroke-width="1.2"/>' + spade(80, 15, 0.27, 'url(#tgGold)') + '</svg>';
    }
  };
  T.art = function (k) { return ART[k](); };
  // The tournament chip: a violet chip with gold edge inserts and a gold crown, so it never reads as your own gold coin.
  var tokenUrl = null;
  T.tokenUrl = function () {
    if (tokenUrl) return tokenUrl;
    var S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d'); g.translate(S / 2, S / 2);
    var body = g.createRadialGradient(-18, -22, 8, 0, 0, 64); body.addColorStop(0, '#7b55d6'); body.addColorStop(0.7, '#3d2384'); body.addColorStop(1, '#22124f');
    g.fillStyle = body; g.beginPath(); g.arc(0, 0, 62, 0, Math.PI * 2); g.fill();
    var gold = g.createLinearGradient(0, -60, 0, 60); gold.addColorStop(0, '#fff2bf'); gold.addColorStop(0.5, '#e9bd52'); gold.addColorStop(1, '#9a6a17');
    g.fillStyle = gold;
    for (var k = 0; k < 8; k++) { g.save(); g.rotate(k * Math.PI / 4); g.fillRect(-7, -62, 14, 15); g.restore(); }
    g.strokeStyle = gold; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 41, 0, Math.PI * 2); g.stroke();
    var inner = g.createRadialGradient(-10, -14, 4, 0, 0, 40); inner.addColorStop(0, '#2f1d66'); inner.addColorStop(1, '#170b3a');
    g.fillStyle = inner; g.beginPath(); g.arc(0, 0, 38, 0, Math.PI * 2); g.fill();
    g.fillStyle = gold; g.beginPath();
    [[-22, 14], [-22, -10], [-11, 2], [0, -20], [11, 2], [22, -10], [22, 14]].forEach(function (q, i) { if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    g.closePath(); g.fill(); g.fillRect(-22, 16, 44, 7);
    [[-22, -13], [0, -24], [22, -13]].forEach(function (q) { g.beginPath(); g.arc(q[0], q[1], 4, 0, Math.PI * 2); g.fill(); });
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 60, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
    return (tokenUrl = c.toDataURL('image/png'));
  };
  var QSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.07 12.85c.77-1.39 2.25-2.21 3.11-3.44.91-1.29.4-3.7-2.18-3.7-1.69 0-2.52 1.28-2.87 2.34L6.54 6.96C7.25 4.83 9.18 3 11.99 3c2.35 0 3.96 1.07 4.78 2.41.7 1.15 1.11 3.3.03 4.9-1.2 1.77-2.35 2.31-2.97 3.45-.25.46-.35.76-.35 2.24h-2.89c-.01-.78-.13-2.05.48-3.15zM14 20c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" transform="translate(0 -0.5)"/></svg>';
  var CHEV = '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- hub ---------- */
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function statusLine(t) {
    var s = status(t), e = s.live && entry(t, s.wk), span = el('span', 'st');
    if (s.live && e) {
      var list = standings(t, s.wk, progress(s.wk));
      span.appendChild(el('i', 'ldot')); span.appendChild(document.createTextNode(I.t('tPlaying', { r: myRank(list), t: fmtLeft(s.ends - T.now()) })));
    } else if (s.live) { span.appendChild(el('i', 'ldot')); span.appendChild(document.createTextNode(I.t('tLive', { t: fmtLeft(s.ends - T.now()) }))); }
    else span.appendChild(document.createTextNode(I.t('tNext', { d: fmtDate(s.start, true), n: dDay(s.start) })));
    return span;
  }
  // Playing in it: today's hands left and the tournament chips, as two small pills under the status line.
  function myLine(t) {
    var s = status(t), e = s.live && entry(t, s.wk);
    if (!e) return null;
    var row = el('span', 'my');
    if (e.out) { row.appendChild(el('em', 'out', I.t('tOutShort'))); return row; }
    var h = el('em', 'hands'); h.appendChild(el('i', 'ico')); h.appendChild(document.createTextNode(I.t('tHandsShort', { n: handsLeft(t, s.wk), m: HANDS })));
    var c = el('em', 'chips'); c.appendChild(el('i', 'tcoin')); c.appendChild(document.createTextNode(U.money(myChips(t, s.wk))));
    row.appendChild(h); row.appendChild(c);
    return row;
  }
  T.openHub = function () {
    NcqMetrics.step("tour_hub_open"); NcqMetrics.flow('tour_list', { mode: 'app' });
    T.check();
    var box = $('tourList'); box.innerHTML = '';
    var me = $('tourMe'); me.innerHTML = '';
    me.appendChild(el('span', '', I.t('myRating'))); me.appendChild(el('b', '', U.fmt(st.rating))); me.appendChild(tierPill(st.rating));
    var q = el('button', 'qbtn'); q.innerHTML = QSVG; q.type = 'button'; q.setAttribute('aria-label', 'Rating help'); q.addEventListener('click', function () { BJ.audio.tick(); T.openRating(); }); me.appendChild(q);
    TOURS.forEach(function (t) {
      var b = el('button', 'trow ' + t.id); b.type = 'button';
      var art = el('span', 'art'); art.innerHTML = ART[t.id]();
      var tx = el('span', 'tx');
      tx.appendChild(el('b', 'nm', I.t('tn_' + t.id))); tx.appendChild(statusLine(t)); var mine = myLine(t); if (mine) tx.appendChild(mine);
      var ch = el('span', 'chev'); ch.innerHTML = CHEV;
      b.appendChild(art); b.appendChild(tx); b.appendChild(ch);
      if (t.legend) { b.appendChild(el('span', 'badge legend', I.t('tourSeason'))); tx.insertBefore(el('span', 'req', I.t('tReq', { f: U.money(t.fee), a: Math.round(t.topPct * 100) })), tx.children[1]); }
      b.addEventListener('click', function () { BJ.audio.tick(); T.openInfo(t.id); });
      box.appendChild(b);
    });
    var c = el('button', 'trow cal'); c.type = 'button';
    var ca = el('span', 'art'); ca.innerHTML = ART.cal();
    var ct = el('span', 'tx'); ct.appendChild(el('b', 'nm', I.t('tourSched')));
    var cc = el('span', 'chev'); cc.innerHTML = CHEV;
    c.appendChild(ca); c.appendChild(ct); c.appendChild(cc);
    c.addEventListener('click', function () { BJ.audio.tick(); T.openCal(); });
    box.appendChild(c);
    $('sheetTour').classList.add('open');
  };

  /* ---------- help ---------- */
  T.openHelp = function () {
    NcqMetrics.step("tour_help_open");
    var box = $('thBody'); box.innerHTML = '';
    I.t('thSecs').split('||').forEach(function (sec) {
      var parts = sec.split('\n'), d = el('section', 'thsec');
      d.appendChild(el('h3', '', parts[0]));
      var ul = el('ul', 'trules'); parts.slice(1).forEach(function (li) { ul.appendChild(el('li', '', li)); }); d.appendChild(ul);
      box.appendChild(d);
    });
    // the three tournaments side by side
    var tb = el('div', 'thtable');
    [['', 'tFee', 'tStack', 'thBets', 'thRp', 'thWhen']].concat(TOURS.map(function (t) { return [t.id]; })).forEach(function (r, i) {
      var row = el('div', 'thr' + (i ? ' ' + r[0] : ' head'));
      if (!i) r.forEach(function (k) { row.appendChild(el('span', '', k ? I.t(k) : '')); });
      else {
        var t = byId[r[0]];
        [I.t('tn_' + t.id), U.money(t.fee), U.money(t.stack), U.money(t.min) + '–' + U.money(t.max), I.t('thRpv_' + t.id), I.t('calCad_' + t.id)].forEach(function (v) { row.appendChild(el('span', '', v)); });
      }
      tb.appendChild(row);
    });
    box.insertBefore(tb, box.children[1] || null);
    var tiers = el('div', 'thtiers');
    tierTable(tiers);
    box.appendChild(el('h3', 'thth', I.t('thTiers')));
    box.appendChild(tiers);
    $('sheetTourHelp').classList.add('open');
  };

  /* ---------- one tournament ---------- */
  var infoId = null, infoTab = 'board';
  T.openInfo = function (id, tab) {
    var t = byId[id]; infoId = id; if (tab) infoTab = tab;
    NcqMetrics.step("tour_info_open"); if (id === 'legend') NcqMetrics.step("legend_info_open");
    var s = status(t), e = s.live ? entry(t, s.wk) : null, p = progress(s.wk);
    var box = $('tinfo'); box.className = 'tpanel tinfo ' + id;
    $('tiArt').innerHTML = ART[id]();
    $('tiName').textContent = I.t('tn_' + id);
    $('tiSub').textContent = I.t('tEd', { n: edition(t, s.wk) }) + ' · ' + fmtDate(s.start) + ' – ' + fmtDate(new Date(s.ends.getTime() - DAY));
    var line = $('tiStatus'); line.innerHTML = ''; line.className = 'tistatus' + (s.live ? ' live' : '');
    if (s.live) { line.appendChild(el('i', 'ldot')); line.appendChild(document.createTextNode(I.t('tEnds', { t: fmtLeft(s.ends - T.now()) }))); }
    else line.textContent = I.t('tStarts', { d: fmtDate(s.start, true), n: dDay(s.start) });
    $('tiFee').textContent = U.money(t.fee); $('tiStack').textContent = U.money(t.stack); $('tiHands').textContent = HANDS;
    // my standing
    var mine = $('tiMine'), list = s.live ? standings(t, s.wk, p) : null;
    mine.hidden = !e;
    if (e) {
      var left = handsLeft(t, s.wk);
      $('tiRank').textContent = e.out ? '—' : I.t('tRankOf', { r: myRank(list), n: list.length });
      $('tiChips').textContent = U.money(myChips(t, s.wk));
      $('tiLeft').textContent = left + ' / ' + HANDS;
      $('tiBar').style.width = (left / HANDS * 100) + '%';
    }
    // tabs
    Array.prototype.forEach.call($('tiTabs').children, function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === infoTab); });
    var pane = $('tiPane'); pane.innerHTML = ''; pane.scrollTop = 0;
    Array.prototype.forEach.call(document.querySelectorAll('#tinfo .tipme'), function (x) { x.remove(); });
    if (infoTab === 'board') {
      if (!s.live) pane.appendChild(el('p', 'tempty', I.t('tBoardWait')));
      else {
        pane.appendChild(el('p', 'tnote', I.t('tPlayers', { n: U.fmt(list.length) }) + ' · ' + I.t('tSample')));
        var myRow = null;
        list.forEach(function (q, i) {
          if (i >= 100 && !q.me) return;
          var r = rankRow(i + 1, q.icon, q.nick, U.money(q.chips), q.me);
          if (q.me) myRow = r;
          if (!(q.me && i >= 100)) pane.appendChild(r);
        });
        if (myRow) { var mine = el('div', 'rankme tipme'); mine.appendChild(myRow.cloneNode(true)); pane.parentNode.insertBefore(mine, pane.nextSibling); }
      }
    } else if (infoTab === 'prize') {
      var n = list ? list.length : t.field + 1;
      prizeTiers(t, n).forEach(function (x) {
        var row = el('div', 'prow' + (x[0] <= 3 ? ' top' + x[0] : ''));
        row.appendChild(el('span', 'pr', x[0] === 51 ? I.t('tTop30') : x[0] === x[1] ? I.t('tRank1', { a: x[0] }) : I.t('tRankR', { a: x[0], b: x[1] })));
        var v = el('span', 'pv'); v.appendChild(el('i', 'coin')); v.appendChild(document.createTextNode('+' + U.money(x[2]))); row.appendChild(v);
        if (t.weight) row.appendChild(el('span', 'pd', '+' + ratingDelta(t, x[0], n))); else row.classList.add('norp');
        pane.appendChild(row);
      });
      pane.appendChild(el('p', 'tnote', I.t('tPrizeNote') + ' ' + I.t('tRp_' + t.id)));
    } else {
      var ul = el('ul', 'trules');
      I.t('tRules').split('\n').forEach(function (li) {
        ul.appendChild(el('li', '', li.replace('{s}', U.money(t.stack)).replace('{h}', HANDS).replace('{min}', U.money(t.min)).replace('{max}', U.money(t.max))));
      });
      pane.appendChild(ul);
    }
    // the main button
    var go = $('tiGo'); go.disabled = false; go.onclick = null;
    if (!s.live) { go.textContent = I.t('tSoon', { d: fmtDate(s.start, true) }); go.disabled = true; }
    else if (!e) {
      if (t.topPct && myRatingPct() > t.topPct) { go.textContent = I.t('tNeedRank', { a: Math.round(t.topPct * 100), b: pct(myRatingPct()) }); go.disabled = true; }
      else if (st.chips < t.fee) { go.textContent = I.t('tNoFee', { n: U.money(t.fee) }); go.disabled = true; }
      else { go.textContent = I.t('tJoin', { n: U.money(t.fee) }); go.onclick = function () { join(t, s.wk); }; }
    } else if (e.out) { go.textContent = I.t('tOut'); go.disabled = true; }
    else if (!handsLeft(t, s.wk)) { go.textContent = I.t('tDoneToday', { t: fmtLeft(untilMidnight()), n: HANDS }); go.disabled = true; }
    else { go.textContent = I.t('tPlay', { n: handsLeft(t, s.wk) }); go.onclick = function () { play(t, s.wk); }; }
    $('sheetTourInfo').classList.add('open');
  };
  function rankRow(no, icon, nick, value, me) {
    var row = el('div', 'rrow' + (no <= 3 ? ' top' + no : '') + (me ? ' me' : ''));
    row.appendChild(el('span', 'no', no));
    var img = document.createElement('img'); img.alt = ''; img.src = BJ.meta.icon(icon); row.appendChild(img);
    row.appendChild(el('span', 'nm', nick)); row.appendChild(el('span', 'lv', value));
    return row;
  }
  T.rankRow = rankRow;
  function handsLeft(t, wk) { var e = entry(t, wk); return e ? Math.max(0, HANDS - (e.used[today()] || 0)) : 0; }
  function join(t, wk) {
    if (st.chips < t.fee || entry(t, wk) || (t.topPct && myRatingPct() > t.topPct)) return;
    hooks.spend(t.fee);
    st.tours[keyOf(t, wk)] = { chips: t.stack, used: {}, out: false };
    var ts = st.tstats; ts.played[t.id] = (ts.played[t.id] || 0) + 1;
    NcqMetrics.step("tour_join"); if (t.legend) NcqMetrics.step("legend_join");
    save(); BJ.audio.unlock(); BJ.audio.fanfare && BJ.audio.fanfare();
    hooks.toast(I.t('tJoined', { n: U.money(t.stack) }));
    T.openInfo(t.id, 'board');
  }
  function play(t, wk) {
    ['sheetTourInfo', 'sheetTour', 'sheetCal'].forEach(function (id) { $(id).classList.remove('open'); });
    hooks.enter(keyOf(t, wk));
  }

  /* ---------- schedule ---------- */
  var calAt = null;
  T.openCal = function (step) {
    NcqMetrics.step("tour_calendar_open");
    var now = new Date(T.now());
    if (!calAt || !step) calAt = new Date(now.getFullYear(), now.getMonth(), 1);
    if (step) calAt = new Date(calAt.getFullYear(), calAt.getMonth() + step, 1);
    $('calTitle').textContent = calAt.toLocaleDateString(I.lang === 'ko' ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long' });
    var grid = $('calGrid'); grid.innerHTML = '';
    var head = el('div', 'cwd');
    I.t('calDays').split(',').forEach(function (d, i) { head.appendChild(el('span', i === 6 ? 'sun' : i === 5 ? 'sat' : '', d)); });
    grid.appendChild(head);
    var first = calAt, month = first.getMonth();
    var wk = Math.floor(dayIndex(first.getTime()) / 7);
    var todayIdx = dayIndex(T.now());
    for (var w = 0; w < 6; w++, wk++) {
      var start = wkStart(wk);
      if (w && start.getMonth() !== month) break;
      var row = el('div', 'cweek' + (wk === curWk() ? ' now' : ''));
      var days = el('div', 'cdays');
      for (var d = 0; d < 7; d++) {
        var day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
        var cell = el('span', (day.getMonth() !== month ? 'out' : '') + (dayIndex(day.getTime()) === todayIdx ? ' today' : '') + (d === 6 ? ' sun' : d === 5 ? ' sat' : ''), day.getDate());
        days.appendChild(cell);
      }
      row.appendChild(days);
      var bars = el('div', 'cbars');
      TOURS.forEach(function (t) {
        if (!isOn(t, wk)) { bars.appendChild(el('i', 'cbar none')); return; }
        var b = el('i', 'cbar ' + t.id, I.t('tn_' + t.id) + ' · ' + I.t('tEd', { n: edition(t, wk) }));
        bars.appendChild(b);
      });
      row.appendChild(bars);
      grid.appendChild(row);
    }
    var leg = $('calLegend'); leg.innerHTML = '';
    TOURS.forEach(function (t) {
      var s = status(t), li = el('div', 'cleg ' + t.id);
      li.appendChild(el('i', 'sw'));
      var tx = el('span', 'lt'); tx.appendChild(el('b', '', I.t('tn_' + t.id))); tx.appendChild(el('small', '', I.t('calCad_' + t.id))); li.appendChild(tx);
      li.appendChild(el('span', 'ln', s.live ? I.t('calNow') : fmtDate(s.start, true)));
      li.addEventListener('click', function () { BJ.audio.tick(); T.openInfo(t.id); });
      leg.appendChild(li);
    });
    $('sheetCal').classList.add('open');
  };

  /* ---------- at the table ---------- */
  T.isKey = function (k) { return !!(k && st.tours[k]); };
  T.table = function (k) { var t = byId[k.split(':')[0]]; return { id: 'tour_' + t.id, min: t.min, max: t.max, chips: t.chips, house: t.house, name: I.t('tn_' + t.id) }; };
  T.theme = function (k) { return byId[k.split(':')[0]].theme; };
  T.chipsOf = function (k) { return st.tours[k].chips; };
  T.setChips = function (k, n) { var e = st.tours[k]; e.chips = n; if (n < byId[k.split(':')[0]].min) e.out = true; };
  T.handsLeft = function (k) { var p = k.split(':'); return handsLeft(byId[p[0]], +p[1]); };
  T.useHand = function (k) { var e = st.tours[k], d = today(), n = (e.used[d] || 0) + 1; e.used = {}; e.used[d] = n; };   // only today's count is kept
  T.HANDS = HANDS;
  T.reopen = function (k) { T.openInfo(k.split(':')[0], 'board'); };

  /* ---------- the week is over: results ---------- */
  var queue = [];
  T.check = function () {
    if (st.inTour) return;
    var wk = curWk();
    Object.keys(st.tours).forEach(function (k) {
      var e = st.tours[k], p = k.split(':'), t = byId[p[0]], w = +p[1];
      if (!t || w >= wk || e.done) return;
      var list = standings(t, w, 1), rank = myRank(list), n = list.length, mine = e.out ? 0 : e.chips;
      var prize = prizeFor(t, rank, n, mine), dr = ratingDelta(t, rank, n), before = st.rating;
      st.rating = Math.max(0, st.rating + dr); notePeak();
      if (mine && (!st.tstats.best[t.id] || rank < st.tstats.best[t.id])) st.tstats.best[t.id] = rank;
      if (mine && rank === 1) { st.tstats.titles = (st.tstats.titles || 0) + 1; st.tstats.titlesBy = st.tstats.titlesBy || {}; st.tstats.titlesBy[t.id] = (st.tstats.titlesBy[t.id] || 0) + 1; }
      if (prize) hooks.addChips(prize);
      e.done = true; e.rank = rank; e.n = n; e.prize = prize; e.dr = dr;
      st.tourLog.unshift({ id: t.id, ed: edition(t, w), rank: rank, n: n, prize: prize, dr: dr });
      st.tourLog = st.tourLog.slice(0, 20);
      NcqMetrics.step("tour_result");
      queue.push({ t: t, w: w, rank: rank, n: n, prize: prize, before: before, after: st.rating, chips: mine });
    });
    // finished entries older than a month are dropped
    Object.keys(st.tours).forEach(function (k) { if (st.tours[k].done && +k.split(':')[1] < wk - 5) delete st.tours[k]; });
    // the season is over (the Legendary League week has ended): ratings go back to the start
    if (T.now() >= st.seasonEnds) {
      NcqMetrics.step("season_reset");
      queue.push({ season: true, before: st.rating, n: st.season });
      st.ratingLog = (st.ratingLog || []).concat([{ season: st.season, rating: st.rating }]).slice(-8);
      st.rating = 1000; st.season += 1; st.seasonEnds = nextReset().getTime();
    }
    save();
    if (hooks.check) hooks.check();
    showResult();
  };
  function showResult() {
    if (!queue.length || $('sheetTourRes').classList.contains('open')) return;
    var r = queue.shift(), t = r.t;
    if (r.season) return showSeason(r);
    $('trPrizeRow').hidden = false;
    $('trBox').className = 'tpanel tres ' + t.id;
    $('trArt').innerHTML = ART[t.id]();
    $('trTitle').textContent = I.t('tResTitle', { t: I.t('tn_' + t.id), n: edition(t, r.w) });
    $('trRank').textContent = r.chips ? I.t('tRank1', { a: r.rank }) : I.t('tResOut');
    $('trOf').textContent = I.t('tResOf', { n: U.fmt(r.n), c: U.money(r.chips) });
    $('trPrize').textContent = r.prize ? '+' + U.money(r.prize) : '—';
    var d = r.after - r.before;
    $('trRate').textContent = U.fmt(r.before) + ' → ' + U.fmt(r.after);
    var dd = $('trDelta'); dd.textContent = (d >= 0 ? '+' : '') + d; dd.className = d >= 0 ? 'up' : 'down';
    var tp = $('trTier'); tp.innerHTML = ''; tp.appendChild(tierPill(r.after));
    $('sheetTourRes').classList.add('open');
    BJ.audio.fanfare && r.prize && BJ.audio.fanfare();
  }

  function showSeason(r) {
    $('trBox').className = 'tpanel tres legend';
    $('trArt').innerHTML = ART.legend();
    $('trTitle').textContent = I.t('seasonOver', { n: r.n });
    $('trRank').textContent = I.t('tier_' + tierOf(r.before));
    $('trOf').textContent = I.t('seasonFinal', { r: U.fmt(r.before) });
    $('trPrizeRow').hidden = true;
    $('trRate').textContent = U.fmt(r.before) + ' → ' + U.fmt(st.rating);
    var dd = $('trDelta'); dd.textContent = I.t('seasonReset'); dd.className = '';
    var tp = $('trTier'); tp.innerHTML = ''; tp.appendChild(tierPill(st.rating));
    $('sheetTourRes').classList.add('open');
  }
  function notePeak() { if (st.rating > (st.tstats.peak || 0)) st.tstats.peak = st.rating; }
  // a hand at a tournament table, for the tournament achievements
  T.noteHand = function (result) { if (result === 'win' || result === 'blackjack') st.tstats.wins = (st.tstats.wins || 0) + 1; };

  /* ---------- Legendary League boards ---------- */
  T.legendSeasons = function () {
    var out = [], lg = byId.legend, q0 = quarterOf(new Date(2026, 0, 5)), qn = quarterOf(new Date(T.now()));
    for (var q = q0; q <= qn; q++) {
      var wk = legendWkOfQuarter(q);
      if (wkStart(wk).getTime() > T.now()) continue;            // not started yet
      out.push({ wk: wk, ed: edition(lg, wk), live: wk === curWk(), start: wkStart(wk) });
    }
    return out.reverse();
  };
  T.legendSeasonLabel = function (x) { return I.t('tn_legend') + ' ' + I.t('tEd', { n: x.ed }) + ' · ' + x.start.toLocaleDateString(I.lang === 'ko' ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'short' }) + (x.live ? ' · ' + I.t('legendLive') : ''); };
  T.legendBoard = function (wk) {
    var t = byId.legend, list = standings(t, wk, wk === curWk() ? progress(wk) : 1);
    return list.map(function (q, i) { return { rank: i + 1, nick: q.nick, icon: q.icon, chips: q.chips, me: q.me }; });
  };

  /* ---------- rating help: what rating is, the tiers, and when the season resets ---------- */
  T.openRating = function () {
    NcqMetrics.step("rating_help_open");
    var reset = nextReset(), box = $('rhBody'); box.innerHTML = '';
    var me = el('div', 'rhme');
    me.appendChild(el('span', '', I.t('myRating'))); me.appendChild(el('b', '', U.fmt(st.rating))); me.appendChild(tierPill(st.rating));
    me.appendChild(el('small', '', I.t('rhTop', { a: pct(myRatingPct()), r: U.fmt(myRatingRank()) })));
    box.appendChild(me);
    var rs = el('div', 'rhreset');
    rs.appendChild(el('b', '', I.t('rhReset', { d: fmtDate(new Date(reset.getTime() - 1), true), n: dDay(reset) })));
    rs.appendChild(el('small', '', I.t('rhSeason', { n: st.season })));
    box.appendChild(rs);
    I.t('rhSecs').split('||').forEach(function (sec) {
      var parts = sec.split('\n'), d = el('section', 'thsec');
      d.appendChild(el('h3', '', parts[0]));
      var ul = el('ul', 'trules'); parts.slice(1).forEach(function (li) { ul.appendChild(el('li', '', li)); }); d.appendChild(ul);
      box.appendChild(d);
    });
    box.appendChild(el('h3', 'thth', I.t('thTiers')));
    var tb = el('div', 'thtiers'); tierTable(tb); box.appendChild(tb);
    $('sheetRateHelp').classList.add('open');
  };

  /* ---------- lobby button ---------- */
  T.refreshButton = function () {
    var n = TOURS.filter(function (t) { return isOn(t, curWk()); }).length;
    $('tourLive').textContent = I.t('tLiveN', { n: n });
  };

  T.init = function (state, saveFn, h) {
    st = state; save = saveFn; hooks = h;
    st.tours = st.tours || {}; if (st.rating == null) st.rating = 1000; st.tourLog = st.tourLog || [];
    st.tstats = st.tstats || {}; st.tstats.played = st.tstats.played || {}; st.tstats.best = st.tstats.best || {};
    if (!st.season) st.season = 1;
    if (!st.seasonEnds) st.seasonEnds = nextReset().getTime();
    $('btnRateHelp').addEventListener('click', function () { BJ.audio.tick(); T.openRating(); });
    $('btnRankHelp').addEventListener('click', function () { BJ.audio.tick(); T.openRating(); });
    if (!document.getElementById('tgDefs')) {
      var d = document.createElement('div');
      d.innerHTML = '<svg id="tgDefs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
        '<linearGradient id="tgGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4c8"/><stop offset=".45" stop-color="#eec65a"/><stop offset="1" stop-color="#9a6a17"/></linearGradient>' +
        '<linearGradient id="tgCard" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf7"/><stop offset="1" stop-color="#e6d9bd"/></linearGradient>' +
        '<linearGradient id="tgGem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9c9ff"/><stop offset=".5" stop-color="#9b4fe0"/><stop offset="1" stop-color="#3d1178"/></linearGradient>' +
        '<radialGradient id="tgGlobe" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff0b8"/><stop offset=".6" stop-color="#d9a640"/><stop offset="1" stop-color="#7d5410"/></radialGradient></defs></svg>';
      document.body.appendChild(d.firstChild);
    }
    $('tourArt').innerHTML = ART.banner();
    document.documentElement.style.setProperty('--tcoin', 'url(' + T.tokenUrl() + ')');
    $('btnTourHelp').addEventListener('click', function () { BJ.audio.tick(); T.openHelp(); });
    $('tourOrn').innerHTML = ART.ornament();
    $('btnTour').addEventListener('click', function () { BJ.audio.unlock(); BJ.audio.tick(); T.openHub(); });
    Array.prototype.forEach.call($('tiTabs').children, function (b) {
      b.addEventListener('click', function () { BJ.audio.tick(); T.openInfo(infoId, b.getAttribute('data-tab')); });
    });
    $('calPrev').addEventListener('click', function () { BJ.audio.tick(); T.openCal(-1); });
    $('calNext').addEventListener('click', function () { BJ.audio.tick(); T.openCal(1); });
    $('trOk').addEventListener('click', function () { $('sheetTourRes').classList.remove('open'); setTimeout(showResult, 250); });
    // keep the countdowns fresh while a sheet is up
    setInterval(function () {
      if ($('sheetTourInfo').classList.contains('open') && infoId) T.openInfo(infoId);
      else if ($('sheetTour').classList.contains('open')) T.openHub();
    }, 30000);
    T.refreshButton();
  };
  T.debugShift = function (days) { shift += days * DAY; fields = {}; };
})();
