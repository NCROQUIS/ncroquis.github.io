/* English and Korean. Table callouts (WIN, BUST, ...) stay in English in both. */
(function () {
  'use strict';
  var BJ = window.BJ;
  var STR = {
    en: {
      deal: 'DEAL', clear: 'CLEAR', rebet: 'REBET',
      hit: 'HIT', stand: 'STAND', double: 'DOUBLE DOWN', split: 'SPLIT',
      tables: 'Tables', limits: 'TABLE LIMITS', min: 'MIN', max: 'MAX',
      playing: 'Playing here', sit: 'Sit down', unlock: 'Unlock for {n}', short: '{n} more to unlock',
      settings: 'Settings', sound: 'Sound', language: 'Language', on: 'On', off: 'Off',
      stats: 'Session record', level: 'Level', levelUp: 'Level up! Lv {n} · +{c} chips', bannerTxt: 'Banner ad (320×50)', ach: 'Achievements', rank: 'Ranking', multi: 'Multiplayer', multiSub: 'Up to 3 at a table', single: 'Single Play', profile: 'Profile', icons: 'Profile icons',
      rankNote: 'Ranked by level · sample board until the game server is connected', interNote: 'Full-screen ad · closes in', achOpen: 'Open {t}', achOpenDesc: 'Reach Lv {n}', achBj1: 'First Blackjack',
      achBj1Desc: 'Get a blackjack', achBj10: 'Blackjack Collector', achBj10Desc: 'Get 10 blackjacks', achH500: 'Regular', achH500Desc: 'Play 500 hands', achStreak: 'On a Roll', achStreakDesc: 'Win 5 hands in a row',
      achDone: 'Achievement! {a} · new profile icon', achReward: 'Reward: profile icon', achGot: 'Done', achSum: '{n} of {m} done', nickLen: 'Use 2 to 12 characters.', nickChars: 'Letters, numbers and _ only.',
      nickBad: 'That name isn\'t allowed.', nickSame: 'That is already your name.', nickHint: 'New nickname', nickAd: 'Watch ad to change', nickRule: '2–12 letters or numbers. Changing it costs one ad.',
      iconFrom: 'Unlock with: {a}', nickDone: 'Nickname changed', multiWait: 'A hand is in play · you join the next one', joined: '{n} sat down', left: '{n} left the table', aiTag: 'AI', coachBet: 'Tap a chip to place your bet', waitOthers: 'Waiting for other players…', idleKick: 'No moves for a while · back to the lobby', coachStand: '20 is a strong hand. Tap STAND to keep it.', profileLobby: 'You can open your profile from the lobby.', leaveAfter: 'You can leave once this hand is over.', autoBet: 'Time\'s up · auto bet {n}', watchingAd: 'Watching an ad…', sittingOut: 'Sitting this hand out', timeOut: 'Time\'s up · you sit this hand out', brokeLeave: 'Out of chips · back to the lobby', outLobby: 'Watch a short ad to get chips and get back to the tables.', later: 'Later', gotChips: '+{n} chips', backIn: 'You\'re back in from this hand', coachDeal: 'Now tap DEAL to start the hand', coachHelp: 'Any questions? Tap ? for the rules any time.', coachTap: 'Tap anywhere to keep playing', levelOpen: 'Lv {n}! {t} is open · +{c} chips', newTable: 'New table', ufxMeta: 'Lv {n} reached · <b>{lim}</b> · XP ×{x}<br>Seat-in bonus <b>+{c}</b>', ufxGo: 'Take a look', mThink: 'Thinking', mBetThink: 'Choosing a bet', mReady: 'Ready', findPlayer: 'Looking for a player…', netFail: 'Couldn\'t reach the table server · playing here instead', netRetry: 'Connection hiccup · try again', mTimeout: 'Time\'s up · STAND', mAutoBet: 'Time\'s up · auto bet', mKicked: '{n} was idle too long and left the table', cheatTitle: 'TEST (not in release builds)', cheatChips: 'Chips +{n}', cheatLevel: 'Level +1', coachPick: 'Pick a mode to start', ufxStay: 'Keep playing', needLv: 'Lv {n}', needLvPlay: 'Opens at Lv {n}', hands: 'Hands', won: 'Won', lost: 'Lost', pushed: 'Push', bjs: 'Blackjacks',
      ads: 'Ads watched', peak: 'Most chips held', reset: 'Reset progress', resetAsk: 'Erase chips, tables and record?',
      yes: 'Erase', no: 'Keep', close: 'Close',
      outTitle: 'Out of chips', outBody: 'This table needs at least {n} a hand.',
      watchAd: 'Watch an ad for {n} chips', moveDown: 'Move down to {t}',
      adLabel: 'AD PLACEHOLDER', adNote: 'A rewarded video plays here in the real build.',
      betMin: 'Minimum bet here is {n}', betMax: 'Maximum bet here is {n}', noChips: 'Not enough chips for that',
      place: 'Place your bet', unlocked: '{t} unlocked', bet: 'BET',
      play: 'PLAY', open: 'Open', fee: 'Unlock {n}', prevFirst: 'Unlock the table before it first',
      shuffling: 'Shuffling {n} decks into the shoe', back: 'Back to lobby', menu: 'Menu', newShoe: 'Shuffle a new shoe', howto: 'How to play',
      loading: 'Setting the table', webgl: 'This device could not draw the 3D table.',
      t_alley: 'Back Alley', t_harbor: 'Harbor Club', t_garden: 'Rose Garden',
      t_grand: 'Grand Hall', t_royal: 'Royal Suite', t_sky: 'Sky Lounge',
      t_monte: 'Monte Carlo', t_macau: 'Macau Gold', t_vegas: 'Vegas High Roller', t_diamond: 'Black Diamond', t_crown: 'Imperial Crown'
    },
    ko: {
      deal: '딜', clear: '지우기', rebet: '다시 걸기',
      hit: '히트', stand: '스탠드', double: '더블 다운', split: '스플릿',
      tables: '테이블', limits: 'TABLE LIMITS', min: 'MIN', max: 'MAX',
      playing: '플레이 중', sit: '앉기', unlock: '{n} 내고 해금', short: '해금까지 {n} 부족',
      settings: '설정', sound: '소리', language: '언어', on: '켬', off: '끔',
      stats: '플레이 기록', level: '레벨', levelUp: '레벨 업! Lv {n} · 칩 +{c}', bannerTxt: '배너 광고 영역 (320×50)', ach: '업적', rank: '랭킹', multi: '멀티 플레이', multiSub: '최대 3명이 한 테이블', single: '싱글 플레이', profile: '프로필', icons: '프로필 아이콘',
      rankNote: '레벨 순 · 게임 서버 연결 전까지는 샘플 순위예요', interNote: '전면 광고 · 잠시 후 닫을 수 있어요', achOpen: '{t} 오픈', achOpenDesc: 'Lv {n} 달성', achBj1: '첫 블랙잭',
      achBj1Desc: '블랙잭 1회', achBj10: '블랙잭 수집가', achBj10Desc: '블랙잭 10회', achH500: '단골손님', achH500Desc: '500판 플레이', achStreak: '연승 행진', achStreakDesc: '5연승',
      achDone: '업적 달성! {a} · 새 프로필 아이콘', achReward: '보상: 프로필 아이콘', achGot: '달성', achSum: '{m}개 중 {n}개 달성', nickLen: '2~12자로 정해 주세요.', nickChars: '한글, 영문, 숫자, _만 쓸 수 있어요.',
      nickBad: '사용할 수 없는 닉네임이에요.', nickSame: '지금 쓰는 닉네임이에요.', nickHint: '새 닉네임', nickAd: '광고 보고 변경', nickRule: '2~12자, 한글·영문·숫자. 바꿀 때마다 광고 1회.',
      iconFrom: '획득 조건: {a}', nickDone: '닉네임을 바꿨어요', multiWait: '진행 중인 판이 끝나면 함께 시작해요', joined: '{n}님이 앉았어요', left: '{n}님이 자리를 떠났어요', aiTag: 'AI', coachBet: '칩을 눌러 베팅을 해 보세요', waitOthers: '다른 플레이어를 기다리는 중…', idleKick: '일정 시간 동안 조작하지 않아 로비로 퇴장합니다.', coachStand: '20이면 좋은 패예요. 스탠드를 눌러 보세요', profileLobby: '프로필은 로비에서 진입 가능합니다.', leaveAfter: '핸드가 종료된 후 나갈 수 있습니다.', autoBet: '시간이 다 되어 {n} 자동 베팅', watchingAd: '광고 보는 중…', sittingOut: '이번 판은 쉬는 중', timeOut: '시간이 지나 이번 판은 쉬어요', brokeLeave: '칩이 다 떨어져 로비로 나가요', outLobby: '짧은 광고를 보면 칩을 받고 다시 테이블에 앉을 수 있어요.', later: '나중에', gotChips: '칩 +{n}', backIn: '이번 판부터 다시 함께해요', coachDeal: '이제 딜을 눌러 시작해요', coachHelp: '궁금한 점은 ? 버튼을 누르면 언제든 볼 수 있어요', coachTap: '아무 곳이나 누르면 계속해요', levelOpen: 'Lv {n}! {t} 오픈 · 칩 +{c}', newTable: '새 테이블 오픈', ufxMeta: 'Lv {n} 달성 · <b>{lim}</b> · XP ×{x}<br>입장 축하 칩 <b>+{c}</b>', ufxGo: '확인해 보자', mThink: '고민 중', mBetThink: '베팅 고민 중', mReady: '준비 완료', findPlayer: '함께할 플레이어를 찾는 중…', netFail: '서버에 연결하지 못해 이 기기에서 진행해요', netRetry: '연결이 잠깐 끊겼어요 · 다시 눌러 주세요', mTimeout: '시간 초과 · 스탠드', mAutoBet: '시간 초과 · 자동 베팅', mKicked: '{n}님이 일정 시간 조작하지 않아 퇴장했어요', cheatTitle: '테스트 (출시 빌드에서는 빠져요)', cheatChips: '칩 +{n}', cheatLevel: '레벨 +1', coachPick: '원하는 모드를 눌러 시작해 보세요', ufxStay: '계속하기', needLv: 'Lv {n} 해금', needLvPlay: 'Lv {n}에 열려요', hands: '핸드', won: '승', lost: '패', pushed: '무승부', bjs: '블랙잭',
      ads: '광고 시청', peak: '최고 보유 칩', reset: '처음부터 다시', resetAsk: '칩, 테이블, 기록을 모두 지울까요?',
      yes: '지우기', no: '그대로 두기', close: '닫기',
      outTitle: '칩이 부족해요', outBody: '이 테이블은 한 핸드에 최소 {n}이 필요해요.',
      watchAd: '광고 보고 칩 {n} 받기', moveDown: '{t} 테이블로 내려가기',
      adLabel: '광고 자리', adNote: '실제 빌드에서는 여기서 보상형 영상이 재생돼요.',
      betMin: '이 테이블 최소 베팅은 {n}이에요', betMax: '이 테이블 최대 베팅은 {n}이에요', noChips: '칩이 모자라요',
      place: '베팅하세요', unlocked: '{t} 해금', bet: 'BET',
      play: '게임 시작', open: '입장 가능', fee: '해금 {n}', prevFirst: '앞 테이블부터 해금하세요',
      shuffling: '{n}덱을 섞어 슈에 넣는 중', back: '로비로 나가기', menu: '메뉴', newShoe: '새 덱으로 섞기', howto: '게임 방법',
      loading: '테이블 준비 중', webgl: '이 기기에서는 3D 테이블을 그릴 수 없어요.',
      t_alley: '뒷골목', t_harbor: '하버 클럽', t_garden: '로즈 가든',
      t_grand: '그랜드 홀', t_royal: '로열 스위트', t_sky: '스카이 라운지',
      t_monte: '몬테카를로', t_macau: '마카오 골드', t_vegas: '베가스 하이롤러', t_diamond: '블랙 다이아몬드', t_crown: '임페리얼 크라운'
    }
  };
  // How to play: one picture and a few plain sentences a page.
  var HELP = {
    ko: [
      ['goal', '목표', '딜러보다 21에 더 가깝게 만들면 이겨요. 21을 넘으면 "버스트"로 바로 져요.\n카드 점수: 2~10은 숫자 그대로, J·Q·K는 10, A는 1 또는 11 중 유리한 쪽으로 자동 계산돼요.'],
      ['bet', '베팅하고 시작', '아래 칩을 눌러 베팅해요. 금액은 베팅 칸 위에 떠요.\n지우기: 건 칩을 돌려받아요.\n딜: 카드를 받으며 시작해요.\n다시 걸기: 지난 판과 같은 금액을 걸고 바로 시작해요.'],
      ['turn', '히트와 스탠드', '내 카드 합계를 보고 정해요.\n히트: 카드를 한 장 더 받아요.\n스탠드: 지금 점수로 멈추고 딜러 차례로 넘겨요.\n멀티 플레이에서는 베팅과 선택마다 30초가 있어요. 버튼 테두리가 시계처럼 줄어들고, 시간이 지나면 베팅은 최대 금액으로 자동으로 걸리고 선택은 스탠드가 돼요.'],
      ['double', '더블 다운', '처음 두 장일 때만 할 수 있어요. 베팅을 두 배로 올리고 카드를 딱 한 장만 더 받은 뒤 자동으로 멈춰요. 받은 카드는 옆으로 눕혀 놓여요.\n합계가 10이나 11일 때 노려보기 좋아요.'],
      ['split', '스플릿', '처음 두 장의 점수가 같으면(예: 8과 8) 두 손으로 나눌 수 있어요.\n1. 같은 금액을 한 번 더 걸어요.\n2. 두 장이 좌우로 갈라지고 각 손에 카드가 한 장씩 더 와요.\n3. 왼쪽 손부터 히트/스탠드를 하고, 끝나면 오른쪽 손을 해요. 지금 하는 손 합계가 금색 테두리로 표시돼요.\n4. 두 손은 따로따로 딜러와 비교해요.\nA를 나누면 한 장씩만 받고, 스플릿 후 21은 블랙잭이 아닌 그냥 21이에요. 스플릿은 한 번만 할 수 있어요.'],
      ['dealer', '딜러 규칙', '딜러는 정해진 대로만 움직여요. 16 이하면 무조건 한 장 더, 17 이상이면 멈춰요.\n딜러가 A나 10점 카드를 보이면 뒷면 카드를 살짝 들어 블랙잭인지 먼저 확인해요. 블랙잭이면 판이 바로 끝나요.'],
      ['result', '정산', '이기면 건 만큼 더 받아요(1:1).\n처음 두 장이 A와 10점 카드면 블랙잭! 건 금액의 1.5배를 더 받아요(3:2).\n점수가 같으면 무승부로 건 칩을 돌려받아요.\n세 장 이상으로 만든 21은 블랙잭이 아니라 그냥 21이에요.'],
      ['lobby', '칩과 테이블', '칩이 모자라면 광고를 보고 충전할 수 있어요.\n핸드를 플레이하면 경험치가 쌓이고, 레벨이 오르면 더 큰 테이블이 열려요. 큰 테이블일수록 경험치 배율이 커요.\n로비에서 좌우로 밀어 테이블을 고를 수 있어요. 멀티 플레이에서는 30초 안에 베팅하고 딜을 눌러야 해요(딜 버튼 테두리가 시계예요). 칩이 떨어지면 로비로 나가 광고를 보고 칩을 받을 수 있어요. 테이블마다 최소·최대 베팅이 달라요.\n오른쪽 위 버튼에서 설정, 새 덱으로 섞기, 로비로 나가기를 할 수 있어요.']
    ],
    en: [
      ['goal', 'The goal', 'Get closer to 21 than the dealer. Go over 21 and you "bust": you lose at once.\nCard values: 2-10 as marked, J Q K are 10, an Ace is 1 or 11, whichever helps.'],
      ['bet', 'Bet and deal', 'Tap the chips below to bet. The amount shows above the betting spot.\nCLEAR takes your chips back. DEAL starts the hand. REBET bets the same as last hand and deals right away.'],
      ['turn', 'Hit or stand', 'Look at your total.\nHIT takes one more card. STAND keeps your total and hands over to the dealer.\nIn multiplayer you get 30 seconds to bet and for each decision. The button border runs down like a clock; when it runs out your bet goes in at the table maximum and your hand stands.'],
      ['double', 'Double down', 'Only on your first two cards. Your bet doubles, you get exactly one more card, and your hand stops. That card is laid sideways.\nGood on a total of 10 or 11.'],
      ['split', 'Split', 'If your first two cards have the same value (say 8 and 8) you can split them into two hands.\n1. You put down a second, equal bet.\n2. The cards move apart and each hand gets one more card.\n3. Play the left hand, then the right. The hand in play has a gold ring on its total.\n4. Each hand is settled against the dealer on its own.\nSplit Aces get one card each, 21 after a split is not a blackjack, and you can split once.'],
      ['dealer', 'Dealer rules', 'The dealer has no choices: hits on 16 or less, stands on 17 or more.\nWith an Ace or a ten showing, the dealer peeks at the hole card first. A dealer blackjack ends the hand.'],
      ['result', 'Payouts', 'Win: you get your bet again (1:1).\nAce plus a ten-value card as your first two cards is a blackjack and pays 3:2.\nSame total: a push, your bet comes back.\n21 made with three or more cards is just 21.'],
      ['lobby', 'Chips and tables', 'Out of chips? Watch an ad to top up.\nEvery hand earns XP; levels open bigger tables, and bigger tables pay much more XP.\nSwipe in the lobby to pick a table. In multiplayer you have 30 seconds to bet and press DEAL (its border is the clock); run out of chips and you go back to the lobby, where an ad tops you up; each has its own minimum and maximum.\nThe top-right button has settings, a fresh shuffle and the way back to the lobby.']
    ]
  };
  var I = BJ.i18n = {
    add: function (lang, o) { STR[lang] = STR[lang] || {}; for (var k in o) STR[lang][k] = o[k]; },
    help: function () { return HELP[I.lang] || HELP.en; },
    lang: 'en',
    t: function (key, vars) {
      var s = (STR[I.lang] && STR[I.lang][key]) || STR.en[key] || key;
      if (vars) for (var k in vars) s = s.replace('{' + k + '}', vars[k]);
      return s;
    },
    // Fill every element marked data-i18n.
    apply: function (root) {
      var list = (root || document).querySelectorAll('[data-i18n]');
      for (var i = 0; i < list.length; i++) list[i].textContent = I.t(list[i].getAttribute('data-i18n'));
      document.documentElement.lang = I.lang;
    }
  };
})();
