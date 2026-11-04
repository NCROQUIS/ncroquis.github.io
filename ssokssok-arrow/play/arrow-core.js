/* 쏙쏙 화살 — core logic (browser + Node).
 * Levels are generated from a seed, so the same seed gives everyone the same board.
 * Solvability is guaranteed by construction: each arrow is placed only if its exit
 * lane is clear of the arrows placed before it, so removing arrows in reverse
 * placement order always works.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ArrowCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  var DIR_KEYS = ['U', 'D', 'L', 'R'];
  var PALETTE = 5; // number of arrow colour slots; the page maps them to colours
  var LAUNCH_DATE = '2026-10-29'; // daily puzzle #1

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ---------- pictures ---------- */
  // generated from pictures.txt by tools/pictures.py — 6 picture stages per chapter
  var PICTURES = [{"key": "paper-plane", "name": "종이비행기", "rows": ["..............TT", "...........BBBTT", ".........BBBBBT.", "......BBBBBBBTT.", "....BBBBBBBBTT..", ".BBBBBBBBBBTTT..", "BBBBBBBBBBTTTT..", "..BBBBBBBTTTT...", "...BBBBBTTTTT...", ".....BBTTTTTT...", "KK....TTTTTT....", "......TTTTTT....", ".......TTTT.....", ".......STTT.....", ".KK....STTT.....", "........TT......"]},
    {"key": "paper-heart", "name": "하트", "rows": ["..RRRRR..RRRRR..", ".RRRRKKRRRRRRRR.", "RRKKKKRRRRRRRRRR", "RRKKKRRRRRRRRRRR", "RRKKKRRRRRRRRRRR", "RRRKRRRRRRRRRRRR", "RRRRRRRRRRRRRRRR", ".RRRRRRRRRRRRRR.", "..RRRRRRRRRRRR..", "..RRRRRRRRRRRR..", "...RRRRRRRRRR...", "....RRRRRRRR....", ".....RRRRRR.....", ".....RRRRRR.....", "......RRRR......", ".......RR......."]},
    {"key": "paper-house", "name": "우리 집", "rows": ["........RR..WW....", ".......RRRRRWW....", "......RRRRRRRW....", "....RRRRRRRRRR....", "...RRRRRRRRRRRR...", "..RRRRRRRRRRRRRR..", ".RRRRRRRRRRRRRRRR.", ".RRRRRRRRRRRRRRRR.", "..YYYYYYYYYYYYYY..", "..YBBBYYYYYYBBBY..", "..YBBBYYYYYYBBBY..", "..YBBBYYWWWYBBBY..", "..YBBBYYWWWYBBBY..", "..YYYYYYWWWYYYYY..", "..YYYYYYWWYYYYYY..", "..YYYYYYWWWYYYYY..", "..YYYYYYWWWYYYYY..", "GGGGGGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGGGG"]},
    {"key": "paper-gift", "name": "선물 상자", "rows": ["...YYYY..YYYY...", "..YYYKYYYYKYYY..", "..YYKKKOOKKKYY..", "..YYKKKOOKKKYY..", "...YYYYOOYYYY...", "KKKKKKKYYKKKKKKK", "KKKKKKKYYKKKKKKK", "KKKKKKKYYKKKKKKK", ".PPPPPPYYPPPPPP.", ".PPPPPPYYPPPPPP.", ".PPPPPPYYPPPPPP.", ".PPPPPPYYPPPPPP.", ".PPPPPPYYPPPPPP.", ".PPPPPPYYPPPPPP.", ".PPPPPPYYPPPPPP.", ".PPPPPPYYPPPPPP.", ".PPPPPPYYPPPPPP.", ".PPPPPPYYPPPPPP.", ".PPPPPPYYPPPPPP."]},
    {"key": "paper-pencil", "name": "연필", "rows": ["..........KKKK", ".........SSKK.", "........YSSSK.", "........YYSS..", ".......YYYY...", "......YYYYY...", "......YYOY....", ".....YYYOY....", ".....YYYY.....", "....YYYY......", "...YYYYY......", "...YYYY.......", "..YYYY........", "..WYYY........", ".WWWY.........", ".WWW..........", ".WW...........", "DD............", "D............."]},
    {"key": "paper-balloon", "name": "풍선", "rows": ["..........BBBB..", "..RRRRR..TTBBBB.", ".RKRRRRRBTTTBBBB", ".RKKRRRRBBTBBBBB", "RRKKRRRRBBBBBBBB", "RRRRRRRRBBBBBBBB", "RRRRRRRYYBBBBBBB", "RRRRRYYYYYYBBBBB", ".RRRRYYYYYYBBBB.", ".RRRYYYYYYYYBB..", "..RRYYYYYYYY....", "....YYYYYYYY....", "....YYYYYYYY....", ".....YYYYYY.....", ".....YYYYYY.....", "......YYYY......", ".........Y......", "......S.........", "......S........."]},
    {"key": "sea-fish", "name": "물고기", "rows": ["........Y........", ".......YY........", "......YYYY.......", ".....YYYYY.......", "...OOOYOOYY.....Y", ".OOOOOYOOOYO...YY", ".OOOOOYYOYYOO.YYY", "OODDOOYYOYYOOYYYY", "OODDOYYYOYYOOYYY.", "OOOOOYYYOYYOOYYY.", "OOOOOYYYOYYOOYYY.", "OOOOOOYYOYYOOYYYY", ".OOOOOYYOYYOO.YYY", ".OOOOOYOOOYO...YY", "...OOOYOOOY.....Y", ".....OOO........."]},
    {"key": "sea-whale", "name": "고래", "rows": ["......TT..TT.......", ".....TTTTTTT.......", ".....TTTTTTT.......", "......TTTTTT.......", "........T..........", "........T..........", "........T..........", ".....BBBBBBBB.....B", "...BBBBBBBBBBBB..BB", "..BBBBBBBBBBBBBB.BB", ".BBBBBBBBBBBBBBBBBB", ".BBBBBBBBBBBBBBBBBB", "BBBBBBBBBBBBBBBBBBB", "BBBBBBTTTTTTBBBBBBB", ".BBTTTTTTTTTTTBBB.B", ".BTTTTTTTTTTTTTT...", "..TTTTTTTTTTTTT....", "...TTTTTTTTTTT.....", "......TTTTTT......."]},
    {"key": "sea-boat", "name": "돛단배", "rows": [".........W.........", ".........W.........", ".........W.R.......", ".........W.R.......", ".........W.RR......", ".......Y.W.RRR.....", "......YY.W.RRR.....", "......YY.W.RRRR....", ".....YYY.W.RRRR....", ".....YYY.W.RRRRR...", "....YYYY.W.RRRRRR..", "...YYYYY.W.RRRRRR..", "...YYYYY.W.RRRRRRR.", ".........W.........", ".OOOOOOOOOOOOOOOOO.", ".OOOOOOOOOOOOOOOOO.", "..OOOOOOOOOOOOOOO..", "..OOOOOOOOOOOOOOO..", ".BB..BBB..BBB..BBB.", "BBBBBBBBBBBBBBBBBBB", "BBBBBBBBBBBBBBBBBBB", "BBBBBBBBBBBBBBBBBBB"]},
    {"key": "sea-octopus", "name": "문어", "rows": ["......PPPPPPP......", ".....PPPPPPPPP.....", "....PPPPPPPPPPP....", "....PPPPPPPPPPP....", "...PPPPPPPPPPPPP...", "...PPPDDPPPDDPPP...", "...PPPDDPPPDDPPP...", "...PPPPPPPPPPPPP...", "....PPPPPPPPPPP....", "....PPPPKKKPPPP....", "....PPPPPPPPPPP....", "...PPP.PPPPPPPPP...", "...PP..PP.PPP.PP...", "..PPP.PP...PP.PPP..", "..PP..PP...PP..PP..", ".PPP..PP...PP..PPP.", "PPP...PP...PP...PPP", "PP....PP...PPP...PP", "PP...PP.....PP...PP", "PP...PP.....PP...PP", ".P...PP.....PP...P.", ".....PP.....PP....."]},
    {"key": "sea-crab", "name": "꽃게", "rows": [".R..R.........R..R.", "RR.RR.........RR.RR", "RRRRRR.......RRRRRR", "RRRRR.DD...DD.RRRRR", ".RRRR.DD...DD.RRRR.", "..RR...S...S...RR..", "...RR..S...S..RR...", "....ROOOOOOOOOR....", "....OOOOOOOOOOO....", "...OOOOOOOOOOOOO...", "...OOOOOOOOOOOOO...", "...OOKKOOOOOKKOO...", "..ROOOOOOOOOOOOOR..", ".RROOOOOOOOOOOOORR.", ".R..OOOOOOOOOOO..R.", ".R.RROOOOOOOOORR.R.", ".R.R...........R.R.", "..RR...........RR..", "..RR...........RR..", "...R...........R..."]},
    {"key": "sea-lighthouse", "name": "등대", "rows": [".........R.........", "YYY.....RRR.....YYY", "YYYYYYRRRRRRRYYYYYY", "YYYYY..YYYYY..YYYYY", "YY.....YYYYY.....YY", "......SSSSSSS......", "......SSSSSSS......", "......RRRRRRR......", "......RRRRRRR......", "......RRRRRRR......", "......SSSSSSS......", "......SSSSSSS......", "......RRRRRRR......", ".....RRRRRRRRR.....", ".....RRRRRRRRR.....", ".....SSSSSSSSS.....", ".....SSSSSSSSS.....", ".....SSSSSSSSS.....", ".....RRRWWWRRR.....", "...SSSSSSSSSSSSS...", ".SSSSSSSSSSSSSSSSS.", "BBBBBBBBBBBBBBBBBBB", "BBBBBBBBBBBBBBBBBBB"]},
    {"key": "forest-tree", "name": "사과나무", "rows": [".........GG.........", ".......GGGGGG.......", "......GGGGGGGG......", ".....GGGGGGGGGG.....", ".....GGGGGGRRRG.....", "..GGGGGGGGGRRGGGGG..", ".GGGGGGGGGGGGGGGGGG.", ".GGGGRRGGGGGGGGGGGG.", "GGGGGRRGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGGGGGG", ".GGGGGGGGGGGGGRRGGG.", ".GGRRGGGRRGGGGRRGGG.", "..GRRGGGRRGGGGGGGG..", "...GGGGGRGGGGGGGG...", "....GGGGGGGGGGGG....", ".....GGGGGGGGGG.....", "........WWWW........", "........WWWW........", "........WWWW........", "........WWWW........", ".......WWWWWW.......", ".....WWWWWWWWWW....."]},
    {"key": "forest-mushroom", "name": "버섯", "rows": ["......RRRRRRRR......", "....RRRRRRRSSRRR....", "...RRSRRRRRSSRRRR...", "..RRSSSRRRRSSRRRRR..", "..RRSSSRRRRRRRRRRR..", ".RRRRSRRRRRRRRRRRRR.", ".RRRRRRRRSRRRRSSSRR.", ".RSRRRRRSSRRRRRSSRR.", ".RSRRRRRRRRRRRRRRRR.", ".RRRRRRRRRRRRRRRRRR.", "......YYYYYYYY......", "......YYYYYYYY......", "......YYYYYYYY......", "......YYYYYYYY......", "......YYYYYYYY......", "......YYYYYYYY......", "......YYYYYYYY......", "......YYYYYYYY......", ".......YYYYYY.......", "GGGGGGGGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGGGGGG"]},
    {"key": "forest-cat", "name": "고양이", "rows": ["..O............O..", "..OOO........OOO..", ".OOKOO.OOOO.OOKOO.", ".OOKOOOOWWOOOOKOO.", ".OOOOOOOWWOOOOOOO.", ".OOOOOOOWWOOOOOOO.", ".OOOOOOOOOOOOOOOO.", ".OOOOOOOOOOOOOOOO.", "OOOODDOOOOOODDOOOO", "OOOODDDOOOODDDOOOO", "OOOOODOOOOOODOOOOO", "OOOOOOOYKKYOOOOOOO", "OOKKOOYYKKYYOOKKOO", ".OKKOYYYYYYYYOKKO.", ".OOOOYYYYYYYYOOOO.", "..OOOYYYYYYYYOOO..", "...OOYYYYYYYYOO...", "....OOYYYYYYOO....", ".......OOOO......."]},
    {"key": "forest-sunflower", "name": "해바라기", "rows": [".......YY.......", "...YYYOYYOYYY...", "...YYOOOOOOYY...", ".YYOOOOOOOOOOYY.", ".YYOOOWWWWOOOYY.", ".YOOOWWWWWWOOOY.", ".OOOWWDWWDWWOOO.", "YYOOWWDWWDWWOOYY", "YYOOWWWWWWWWOOYY", ".OOOWWWDDWWWOOO.", ".YOOOWWWWWWOOOY.", ".YYOOOWWWWOOOYY.", ".YYOOOOOOOOOOYY.", "...YYOOOOOOYY...", "...YYYOYYOYYY...", ".......YY.......", ".......GG.......", ".......GG.......", ".......GGGGGGG..", "...GGGGGGGGGGG..", "..GGGGGGGGGGG...", "..GGGGGGG.......", ".......GG.......", ".......GG......."]},
    {"key": "forest-ladybug", "name": "무당벌레", "rows": [".....DD......DD.....", ".....DD......DD.....", ".............D......", ".......DDDDDD.......", "......DDDDDDDD......", ".....DDYYDDYYDD.....", ".....DDDDDDDDDD.....", "......DRRRRRRD......", ".....RRRRRRRRRR.....", "....RRRRRRRRRRRR....", "...RRDDRRRRRRDDRR...", "..RRDDDDRRRRDDDDRR..", "..RRRDDRRRRRRDDRRR..", "..RRRRRRRRRRRRRRRR..", "..RRRRRRRRRRRRRRRR..", "DDRRRRRRRRRRRRRRRRDD", "..RRDDRRRRRRRRDDRR..", "..RRDDDRRRRRRDDDRR..", "...RRDRRRRRRRRDRR...", "..RRRRRRRRRRRRRRRR..", "....RRRDDRRDDRRR....", "......RRRRRRRR......", "........RRRR........"]},
    {"key": "forest-snail", "name": "달팽이", "rows": [".........OOOOOO.....", ".......OOOOOOOOOO...", "......OOOOYYYYOOOO..", "......OOOYYYYYYOOO..", ".D...OOOYYYOOOYYOOO.", ".DD.OOOYYYOOOOOYYOO.", ".D...OOYYOOYYYOOYOO.", "..T..OOYYOOYYYOOYOO.", "..T..TOYYOOOYOOYYO..", "..T..TOOYYOOOOOYOO..", ".....TOOOYYYYYYOO...", "...TTTTTOOOYYOOOO...", ".TTTTTTTTOOOOOOTTTT.", "TTTTTTTTTTTTTTTTTTTT", ".TTTTTTTTTTTTTTTTTTT", ".TTTTTTTTTTTTTTTTTTT", ".TTTTTTTTTTTTTTTTTTT", "GGGGGGGGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGGGGGG"]},
    {"key": "desert-cactus", "name": "선인장", "rows": ["......KYYK......", "......KKKK......", "......GGGG......", ".....GGGGGG..GGG", ".....GGGGGG..GGG", "GGG..GGGGGG..GGG", "GGG..GGGGGG..GGG", "GGG..GGGGGG..GGG", "GGG..GGGGGGGGGGG", "GGGGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGG", "GGGGGGGGGGG.....", ".GGGGGGGGGG.....", ".....GGGGGG.....", ".....GGGGGG.....", "......GGGGG.....", "..WWWWWWWWWWWW..", "..WWWWWWWWWWWW..", "...OOOOOOOOOO...", "...OOOOOOOOOO...", "...OOOOOOOOOO...", "....OOOOOOOO....", "....OOOOOOOO...."]},
    {"key": "desert-camel", "name": "낙타", "rows": [".WWWW...............", "WWWWW...............", "WWWWW...............", ".WWW..WWWW.WWWW.....", "..WW.WWWWWWWWWWW....", "..WWWWWWWWWWWWWW....", "..WWWWWWWWWWWWWW....", "...WWWWWWWWWWWWWW...", "...WWWWWWWWWWWWWWW..", "....WWWWWWWWWWWWWW..", "....WWWWWWWWWWWWWWW.", "....WWWWWWWWWWWWWWW.", ".....WWWWWWWWWWWW...", ".....WWWWWWWWWWW....", ".....WW.W...W..W....", ".....W..W...W..W....", ".....W..W...W..W....", "...YYW..W...WYYYY...", "..YYYYY.WY.YWYYYYY..", "YYYYYYYYYYYYYYYYYYYY", "YYYYYYYYYYYYYYYYYYYY"]},
    {"key": "desert-pyramid", "name": "피라미드", "rows": ["...............RRR..", "..............RRRRR.", "..............RRRRR.", "..............RRRR..", "................R...", "....................", ".........YO.........", "........YYOO........", "........YYOO........", ".......YYYOOO.......", "......YYYYOOOO......", "......YYYYOOOO......", "...YYYYYYYOOOOO.....", "..YYYYYYYYOOOOOO....", "..YYYYYYYYOOOOOOO...", "..YYYYYYYYOOOOOOO...", ".YYYYYOYYWWOOOOOOO..", ".YYYYYOYYWWOOOOOOOO.", "YYYYYYYYYWWOOOOOOOO.", "YYYYYYYYYYYYYYYYYYYY", "YYYYYYYYYYYYOOOOOOYY", "YYYYYYYYYYOOOOOOOOOO", "YYYYYYYYYYYOOOOOOOOO"]},
    {"key": "desert-palm", "name": "야자수", "rows": ["...........GGGG.....", ".........GGGGGGGG...", "......GGGGGGGGGGGG..", ".....GGGGGGGGG.GGGGG", "...GGGGGG..GG..GGGGG", "...GGGGGGGGGGGGGGGGG", "......GGGGWGGGGGGGG.", "........GGWWWWGGG...", "...........WWW......", "...........W........", "..........WW........", "..........WW........", "..........WW........", "..........WW........", ".........WW.........", ".........WW.........", ".........WW.........", ".........WW.........", ".........WW.........", ".....YYYYYYYYYY.....", ".YYYYYYYYYYYYYYYYYY.", "YYBBBBBBBBYYYYYYYYYY", ".YBBBBBBBBYYYYYYYYY.", "....BBBBYYYYYYYY...."]},
    {"key": "desert-sun", "name": "해님", "rows": [".......OO.......", "....O..OO..O....", "....OOYYYYOO....", "....YYYYYYYY....", ".OOYYYYYYYYYYOO.", ".OOYYYYYYYYYYOO.", "..YYYDDYYDDYYY..", "OOYYYDDYYDDYYYOO", "OOYYYYYYYYYYYYOO", "..YKKKYYYYKKKY..", "..YYYYYYYYYYYY..", ".OOYYYYRRYYYYOO.", "OOOOYYYYYYYYOOOO", "....OYYYYYYO....", "....OO.OO.OO....", ".......OO......."]},
    {"key": "desert-hourglass", "name": "모래시계", "rows": ["WWWWWWWWWWWWWW", "WWWWWWWWWWWWWW", ".W.TTTTTTTT.W.", ".W.TTTTTTTT.W.", ".W..TTTTTT..W.", ".W..YYYYYY..W.", ".W..YYYYYY..W.", ".W...YYYY...W.", ".W...YYYY...W.", ".W....YY....W.", ".W....TT....W.", ".W....TT....W.", ".W....TT....W.", ".W...TTTT...W.", ".W...TYYT...W.", ".W..TTYYTT..W.", ".W..TYYYYT..W.", ".W..TYYYYT..W.", ".W.TYYYYYYT.W.", ".W.TYYYYYYT.W.", "WWWWWWWWWWWWWW", "WWWWWWWWWWWWWW"]},
    {"key": "night-moon", "name": "달과 별", "rows": ["...............B..", "..............BBB.", "...............BB.", "....YYYY..........", "...YYYY...........", "..YYYY............", ".YYYYY............", "YYYYY.............", "YYYYY.............", "YYYYY.............", "YYYYYY............", "YYYYYY............", "YYYYYYY...........", "YYYYYYYY.......Y..", ".YYYYYYYY....YYYYY", "..YYYYYYYYYYYYYYY.", "...YYYYYYYYYY.YYY.", "....YYYYYYYY......", "..................", "..........BB......", "..........B......."]},
    {"key": "night-rocket", "name": "로켓", "rows": [".......R.......", ".......R.......", "......RRR......", ".....RRRRR.....", "....RRRRRRR....", "...RRRRRRRRR...", "...RRRRRRRRR...", "...SSSSSSSSS...", "...SSSSSSSSS...", "...SSSBBBSSS...", "...SSBBBBBSS...", "...SSBBBBBSS...", "...SSSBBBSSS...", "...SSSSBSSSS...", "..RSSSSSSSSSR..", "..RSSSSSSSSSR..", ".RRSRRRRRRRSRR.", ".RRSSRRRRRSSRR.", "RRRSSSSSSSSSRRR", ".RRSSSSSSSSSRR.", "....SSSSSSS....", ".....OOOOO.....", "......YOY......", "......YYY......", ".......Y......."]},
    {"key": "night-castle", "name": "성", "rows": ["...R.............R...", "...R.............R...", "..RRR.....R.....RRR..", "..RRR.....R.....RRR..", ".SSSSS...RRR...SSSSS.", ".SSSSS...RRR...SSSSS.", ".SSSSS..RRRRR..SSSSS.", ".SSBSS..SSSSS..SSBSS.", ".SBBBS..SSSSS..SBBBS.", ".SSBBS..SSSSS..SBBSS.", ".SSSSSSSSSSSSSSSSSSS.", ".SSSSSSSSSSSSSSSSSSS.", ".SSSSSSSSSWSSSSSSSSS.", ".SSSSSSSSWWWSSSSSSSS.", ".SSSSSSSWWWWWSSSSSSS.", ".SSSSSSSWWWWWSSSSSSS.", ".SSSSSSSWWWWWSSSSSSS.", ".SSSSSSSWWWWWSSSSSSS.", ".SSSSSSSWWWWWSSSSSSS.", ".SSSSSSSWWWWWSSSSSSS.", ".SSSSSSSWWWWWSSSSSSS.", "GGGGGGGGGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGGGGGGG"]},
    {"key": "night-owl", "name": "부엉이", "rows": ["....WW.........WW....", "....WWW..WWW..WWW....", "....WWWWWWWWWWWWW....", "...WWWYYWWWWWYYWWW...", "....YYYYYYWYYYYYY....", "....YYYDYYWYYDYYY....", "...WYYDDDYYYDDDYYW...", "...WYYDDDYYYDDDYYW...", "...WWYYYYOOOYYYYWW...", "...WWWWWWOOOWWWWWW...", "..WWWWWOOOOOOOWWWWW..", "...WWWWOOOOOOOWWWW...", "...WWWOOOOOOOOOWWW...", "...WWWOOOOOOOOOWWW...", "...WWWOOOOOOOOOWWW...", "....WWOOOOOOOOOWW....", "....WWWOOOOOOOWWW....", ".....WWOOOOOOOWW.....", "......WWOOOOOWWWWWWWW", "WWWWWWWWWWWWWWWWWWWWW", "WWWWWWW.............."]},
    {"key": "night-saturn", "name": "토성", "rows": [".BBB.................", "..BB.................", ".....................", ".....................", ".....................", "........OOOOO........", ".......OOOOOOOR......", "......RRRRRRRRRYYYYY.", ".....OOOOOOOOOOO.YYYY", "..YYYOOOOOOOOOOOOYYY.", ".YYY.OOOOOOOOOYYYY...", "YYYYOOOOYYYYYYYY.....", ".YYYYYYYYYYOOOO......", ".......OOOOOOO.......", "........OOOOO........", ".....................", ".....................", ".....................", ".................BB..", ".................BB.."]},
    {"key": "night-ufo", "name": "비행접시", "rows": ["........TTTTT........", ".......TTTTTTT.......", "......TTTGGGTTT......", "......TTTGGGTTT......", ".....TTTTGGGTTTT.....", ".....TTTSSSSSTTT.....", "....SSSSSSSSSSSSS....", "..SSSSSSSSSSSSSSSSS..", ".SSSSSSSSSSSSSSSSSSS.", "SSSYYSSSSSSSSSSSYYSSS", ".SSSSSSYYSYSYYSSSSSS.", "..SSSSSYSSYSSYSSSSS..", "...SSSSSSSSSSSSSSS...", "......GSSSSSSSG......", ".....GGGGGGGGGGG.....", ".....GGGGGGGGGGG.....", "....GGGGGGGGGGGGG....", "....GGGGGGGGGGGGG....", "...GGGGGGGGGGGGGGG...", "...GGGGGGGGGGGGGGG...", "..GGGGGGGGGGGGGGGGG..", "..GGGGGGGGGGGGGGGGG.."]},
    {"key": "neon-robot", "name": "로봇", "rows": [".........RR.........", ".........RR.........", "....................", ".....SSSSSSSSSS.....", "....SSSSSSSSSSSS....", "....SSSSSSSSSSSS....", "....SSBBBSSBBBSS....", "....SSBBBSSBBBSS....", "....SSBBSSSSBBSS....", "....SSSKKKKKKSSS....", "....SSSKKKKKKSSS....", ".....SSSSSSSSSS.....", "........SSSS........", ".S..TTTTTTTTTTTT..S.", "SSSTTTTTTTTTTTTTT.SS", "SSSTTTTOOOOOOTTTTSSS", "SSSTTTTOOOOOOTTTTSSS", "SSSTTTTOOOOOOTTTTSSS", "SSSTTTTOOOOOOTTTTSSS", "SSSTTTTTTTTTTTTTTSSS", "SS.TTTTTTTTTTTTTT.SS", "....TTTTTTTTTTTT....", ".....SSSS..SSSS.....", ".....SSSS..SSSS.....", ".....SSSS..SSSS....."]},
    {"key": "neon-crown", "name": "왕관", "rows": ["..........YY..........", "..........YY..........", "..........YY..........", "..........YY..........", "YY........YY........YY", "YY.......YYYY.......YY", ".Y.......YYYY.......Y.", ".Y......YYYYYY......Y.", ".YY.....YYYYYY.....YY.", ".YYY...YYYYYYYY...YYY.", "..YYY..YYYYYYYY..YYY..", "..YYY.YYYYYYYYYY.YYY..", "..YYYYYYYYYYYYYYYYYY..", "..YYYYYYYBBBBYYYYYYY..", "..YYKKKYYBBBBYYKKKYY..", "..YYKKKYYYBBYYYKKKYY..", "..YYYKYYYYYYYYYYKYYY..", "..YYYYYYYYYYYYYYYYYY..", "..PPPPPPPPPPPPPPPPPP..", "..PPTPPPPPPPPPPPPTPP..", "..PPTTPPPPRRPPPPTTPP..", "..PPPPPPPPPPPPPPPPPP.."]},
    {"key": "neon-bolt", "name": "번개", "rows": ["..........OO...", ".........OOO...", "........YYYO...", ".......OYYO....", ".......OYYO....", "......YYYO.....", ".....YYYYO.....", "....OYYYO......", "...OOYYYO......", "...OYYYO.......", "..YYYYYOOOOOOOO", ".OYYYYYYYYYYYO.", "OOYYYYYYYYYYY..", "OOOOOOOYYYYO...", "......OYYYYO...", "......OYYYY....", ".....OYYYY.....", ".....OYYY......", ".....OYY.......", ".....OYY.......", "....OYY........", "....OY.........", "....O..........", "....O.........."]},
    {"key": "neon-gamepad", "name": "게임기", "rows": ["......PPPPPPPPPP......", "...PPPPPPPPPPPPPPPP...", "..PPPPPPPPPPPPPPRRPP..", ".PPPDDDPPPPPPPPRRRPPP.", ".PPPDDDPPPPPPPPPPPPPP.", ".PDDDDDDDSPPSBBPPPGGP.", ".PDDDDDDDSPPSBBPPPGGG.", ".PPPDDDPPPPPPPPPPPPPP.", ".PPPDDDPPPPPPPPPYYPPP.", ".PPPPPPPPPPPPPPYYYPPP.", "PPPPPPPPPPPPPPPPPPPPPP", "PPPPPPPPPPPPPPPPPPPPPP", ".PPPPPPPP....PPPPPPPP.", ".PPPPPPPP....PPPPPPPP.", ".PPPPPPPP....PPPPPPPP.", "..PPPPPP......PPPPPP..", "..PPPPP........PPPPP..", "...PPP..........PPP..."]},
    {"key": "neon-music", "name": "음표", "rows": ["................KK..", "...........KKKKKKKK.", ".......KKKKKKKKKKKK.", ".......KKKKKKKKKKKK.", ".......KKKKKKK...KK.", ".......KK........KK.", ".......K.........KK.", ".......K.........KK.", "..B....K.........KK.", "..B....K.........KK.", "..B....K.........KK.", "..B....K.........KK.", "..B....K.......KKKK.", "..B....K.....KKKKKK.", "..B...KK....KKKKKKK.", "..BKKKKK....KKKKKK..", "..BKKKKK.....KKKK...", "..BKKKKK............", "..BKKKK.............", ".BB.K.............T.", "BBB..............TTT", "BBB...............T."]},
    {"key": "neon-diamond", "name": "보석", "rows": ["..................Y.", "..................Y.", "....................", "....TTTTTTTTTTTT....", "...KKTTTTYYTTTTKK...", "..KKKTTTTYYTTTTKKK..", ".KKKKKTTYYYYTTKKKKK.", ".KKKKKTTYYYYTTKKKKK.", "KKKKKKKYYYYYYKKKKKKK", "BBBBBBPPPPPPPPBBBBBB", ".BBBBBPPPPPPPPBBBBB.", ".BBBBBPPPPPPPPBBBBB.", "..BBBBBPPPPPPBBBBB..", "...BBBBPPPPPPBBBB...", "....BBBPPPPPPBBBB...", "....BBBBPPPPBBBB....", ".....BBBPPPPBBB.....", "......BBPPPPBB......", ".Y....BBBPPPBB......", ".Y.....BBPPBB.......", "........BPPB........", ".........PP.........", ".........BB........."]}];
  /* ---------- end pictures ---------- */

  /* ---------- stages: 6 chapters x 20 ---------- */
  var STAGES_PER_CHAPTER = 20;
  var CHAPTERS = [
    { key: 'paper', name: '종이 공방' }, { key: 'sea', name: '바닷가' }, { key: 'forest', name: '초록 숲' },
    { key: 'desert', name: '모래 사막' }, { key: 'night', name: '밤하늘' }, { key: 'neon', name: '네온 시티' }
  ];
  var TOTAL_STAGES = STAGES_PER_CHAPTER * CHAPTERS.length; // 120

  function clampStage(n) { return Math.max(1, Math.min(TOTAL_STAGES, n | 0)); }
  function chapterOf(n) { return CHAPTERS[Math.floor((clampStage(n) - 1) / STAGES_PER_CHAPTER)]; }
  // difficulty rises and falls: every 5th stage is hard, every 10th super hard, the next one eases off
  function stageTier(n) { n = clampStage(n); return n % 10 === 0 ? 'super' : n % 5 === 0 ? 'hard' : 'normal'; }

  function stageParams(n) {
    n = clampStage(n);
    var tier = stageTier(n);
    // stages 1-2 teach the rules: small board, plenty of free arrows, relaxed clock
    if (n <= 2) return { w: 5, h: 7, fill: 0.74, maxLen: 3, inward: 0.25, edgeOut: 0.5, freeTarget: 0.45, secPerArrow: 2.6, tier: tier, easyFill: true };
    // from stage 3 the real game starts: bigger dense boards, heads pointing inward, few free arrows
    var t = (n - 3) / (TOTAL_STAGES - 3);
    var bump = tier === 'super' ? 3 : tier === 'hard' ? 1 : 0;
    // 8x10 at stage 3 → 20x26 at stage 120; super hard boards may reach Maze Out's 22 columns
    var w = Math.min(8 + Math.round(t * 10) + bump, tier === 'super' ? 22 : 20);
    return {
      w: w,
      h: Math.min(Math.round(w * 1.3), 26),
      fill: Math.min(0.86 + t * 0.06, 0.93),
      maxLen: 4 + Math.round(t * 3) + bump,
      inward: Math.min(0.8 + t * 0.15 + bump * 0.05, 0.97),
      edgeOut: tier === 'super' ? 0.04 : tier === 'hard' ? 0.06 : 0.1,
      // share of arrows removable at the very start (Maze Out Super Hard: ~12-15%)
      freeTarget: tier === 'super' ? 0.12 : tier === 'hard' ? 0.15 : Math.max(0.16, 0.22 - t * 0.06),
      secPerArrow: tier === 'super' ? 1.15 : tier === 'hard' ? 1.3 : Math.max(1.4, 1.8 - t * 0.4),
      tier: tier
    };
  }
  function starsFor(mistakes) { return mistakes <= 0 ? 3 : mistakes === 1 ? 2 : 1; }
  var DAILY_PARAMS = { w: 12, h: 16, fill: 0.86, maxLen: 6, inward: 0.75, edgeOut: 0.08, freeTarget: 0.18, secPerArrow: 1.6, tier: 'hard' };

  // Picture stages: six per chapter (chapter-relative 3, 7, 9, 13, 16 and 18), all on normal stages
  // and away from the gimmick debuts, each drawing one of the chapter's six pictures.
  var PICTURE_SLOTS = [3, 7, 9, 13, 16, 18];
  function pictureFor(n) {
    n = clampStage(n);
    var ci = Math.floor((n - 1) / STAGES_PER_CHAPTER), rel = n - ci * STAGES_PER_CHAPTER, j = PICTURE_SLOTS.indexOf(rel);
    return j < 0 ? null : PICTURES[ci * PICTURE_SLOTS.length + j];
  }
  function picStages() {
    var out = [];
    for (var n = 1; n <= TOTAL_STAGES; n++) if (pictureFor(n)) out.push(n);
    return out;
  }
  function levelSpec(kind, key) {
    if (kind === 'd') return { kind: 'd', key: key, seed: hashStr('daily-' + key), params: DAILY_PARAMS };
    var n = clampStage(parseInt(key, 10) || 1), P = stageParams(n), pic = pictureFor(n);
    if (pic) {
      var W = pic.rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
      P = Object.assign({}, P, { w: W, h: pic.rows.length, fill: 0.95, maxLen: Math.max(4, P.maxLen),
        reg: pic.rows.map(function (r) { return r.split('').concat(new Array(W - r.length + 1).join('.').split('')); }) });
    }
    return { kind: 's', key: String(n), seed: hashStr('stage-' + n), params: P, picture: pic };
  }

  /* ---------- generation ---------- */
  // Each arrow is a snake: cells[0] is the head, cells[1] sits directly behind it, the body may turn.
  // Tapped, the head travels straight in `dir` and the body follows its own path, so only the head's
  // ray to the edge has to be clear. Arrows are placed one by one with a ray that is clear of
  // everything already placed, so removing them in reverse order always solves the board.
  function generate(seed, params) {
    var w = params.w, h = params.h, rnd = mulberry32(seed);
    var occ = new Array(w * h).fill(-1);
    var arrows = [];
    // region of each cell: a colour letter on picture stages ('.' = empty space arrows fly through), '#' otherwise
    var reg = function (x, y) { return params.reg ? params.reg[y][x] : '#'; };
    var area = 0;
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) if (reg(xx, yy) !== '.') area++;
    var target = Math.floor(area * params.fill), filled = 0;
    var inside = function (x, y) { return x >= 0 && y >= 0 && x < w && y < h; };
    var same = function (x, y, R) { return inside(x, y) && reg(x, y) === R; };
    var maxAttempts = w * h * 80;
    for (var round = 0; round < 2; round++) {
    if (round === 1) { growTails(arrows, occ, w, h, params.maxLen + 2, reg); filled = occ.filter(function (v) { return v !== -1; }).length; target = Math.floor(area * 0.95); }
    for (var attempt = 0; attempt < maxAttempts && filled < target; attempt++) {
      var x = Math.floor(rnd() * w), y = Math.floor(rnd() * h);
      if (occ[y * w + x] !== -1) continue;
      var R = reg(x, y);
      if (R === '.') continue;
      // pick a heading whose ray to the edge is empty right now. Maze Out's boards point most heads
      // inward: a long ray is almost certain to be crossed by arrows placed later, which is what
      // makes arrows block each other in long chains. `inward` is the chance of taking the longest ray.
      var cands = [];
      for (var k = 0; k < 4; k++) {
        var dd = DIRS[DIR_KEYS[k]], cellsAhead = {}, ok = true, len0 = 0;
        for (var px = x + dd[0], py = y + dd[1]; inside(px, py); px += dd[0], py += dd[1]) {
          if (occ[py * w + px] !== -1) { ok = false; break; }
          cellsAhead[px + ',' + py] = 1; len0++;
        }
        var bx = x - dd[0], by = y - dd[1]; // the cell behind the head must be free too
        // a head sitting on the edge and facing out is free from the start; allow only a few of those
        if (len0 === 0 && rnd() >= (params.edgeOut == null ? 1 : params.edgeOut)) ok = false;
        if (ok && same(bx, by, R) && occ[by * w + bx] === -1) cands.push({ dir: DIR_KEYS[k], ray: cellsAhead, len: len0, r: rnd() });
      }
      var dir = null, ray = null;
      if (cands.length) {
        var pick;
        if (rnd() < (params.inward || 0)) pick = cands.sort(function (a, b) { return (b.len - a.len) || (a.r - b.r); })[0];
        else pick = cands[Math.floor(rnd() * cands.length)];
        dir = pick.dir; ray = pick.ray;
      }
      if (!dir) continue;
      var d = DIRS[dir];
      var len = 2 + Math.floor(rnd() * (params.maxLen - 1));
      var cells = [[x, y], [x - d[0], y - d[1]]], mine = {};
      mine[x + ',' + y] = 1; mine[(x - d[0]) + ',' + (y - d[1])] = 1;
      var back = [-d[0], -d[1]];
      while (cells.length < len) {
        var cur = cells[cells.length - 1];
        var left = [back[1], -back[0]], right = [-back[1], back[0]];
        var opts = rnd() < 0.45 ? [back, left, right] : (rnd() < 0.5 ? [left, back, right] : [right, back, left]);
        var moved = false;
        for (var o = 0; o < 3; o++) {
          var nx = cur[0] + opts[o][0], ny = cur[1] + opts[o][1], key = nx + ',' + ny;
          if (!same(nx, ny, R) || occ[ny * w + nx] !== -1 || mine[key] || ray[key]) continue;
          cells.push([nx, ny]); mine[key] = 1; back = opts[o]; moved = true; break;
        }
        if (!moved) break;
      }
      var id = arrows.length;
      cells.forEach(function (c) { occ[c[1] * w + c[0]] = id; });
      arrows.push({ id: id, dir: dir, cells: cells, color: Math.floor(rnd() * PALETTE), region: R });
      filled += cells.length;
    }
    }
    growTails(arrows, occ, w, h, params.maxLen + 2, reg);
    var solution = arrows.map(function (a) { return a.id; }).reverse();
    return { w: w, h: h, seed: seed, arrows: arrows, solution: solution, area: area };
  }

  // Fill leftover gaps by extending tails. A cell may join arrow A only if it is outside A's own ray
  // and outside the ray of every arrow placed after A (those are removed before A, so A's new tail
  // must not stand in their way). Arrows placed before A are removed after it, so they don't matter.
  function growTails(arrows, occ, w, h, cap, reg) {
    var rays = arrows.map(function (a) {
      var d = DIRS[a.dir], r = {};
      for (var x = a.cells[0][0] + d[0], y = a.cells[0][1] + d[1]; x >= 0 && y >= 0 && x < w && y < h; x += d[0], y += d[1]) r[x + ',' + y] = 1;
      return r;
    });
    // latestRay[cell] = highest arrow id whose ray covers the cell (-1 if none)
    var latestRay = {};
    rays.forEach(function (r, id) { for (var k in r) latestRay[k] = Math.max(latestRay[k] == null ? -1 : latestRay[k], id); });
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < arrows.length; i++) {
        var a = arrows[i];
        if (a.cells.length >= cap) continue;
        var tail = a.cells[a.cells.length - 1];
        var steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var s = 0; s < 4; s++) {
          var nx = tail[0] + steps[s][0], ny = tail[1] + steps[s][1], key = nx + ',' + ny;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || occ[ny * w + nx] !== -1) continue;
          if (reg && reg(nx, ny) !== (a.region || '#')) continue;
          if (rays[i][key] || (latestRay[key] != null && latestRay[key] > i)) continue;
          a.cells.push([nx, ny]); occ[ny * w + nx] = i; changed = true; break;
        }
      }
    }
  }

  /* ---------- hardening ---------- */
  // Fast greedy solve on an id grid: removing a free arrow never blocks another, so the board is
  // solvable exactly when repeatedly removing free arrows clears it. Returns the removal order or null.
  function fastSolve(level) {
    var w = level.w, h = level.h, grid = new Int32Array(w * h).fill(-1), left = {}, n = 0;
    level.arrows.forEach(function (a) { a.cells.forEach(function (c) { grid[c[1] * w + c[0]] = a.id; }); left[a.id] = 1; n++; });
    var order = [], firstRound = 0, rounds = 0;
    while (n > 0) {
      var batch = [];
      for (var id in left) {
        var a = level.arrows[id], d = DIRS[a.dir], hx = a.cells[0][0], hy = a.cells[0][1], free = true;
        for (var x = hx + d[0], y = hy + d[1]; x >= 0 && y >= 0 && x < w && y < h; x += d[0], y += d[1]) {
          var o = grid[y * w + x]; if (o !== -1 && o !== a.id) { free = false; break; }
        }
        if (free) batch.push(+id);
      }
      if (!batch.length) return null;
      if (rounds === 0) firstRound = batch.length;
      batch.forEach(function (id) { level.arrows[id].cells.forEach(function (c) { grid[c[1] * w + c[0]] = -1; }); delete left[id]; order.push(id); n--; });
      rounds++;
    }
    return { order: order, free: firstRound, depth: rounds };
  }
  function reversed(a, w, h) {
    var cells = a.cells.slice().reverse(), hx = cells[0][0], hy = cells[0][1];
    var dx = hx - cells[1][0], dy = hy - cells[1][1], dir = null;
    for (var k in DIRS) if (DIRS[k][0] === dx && DIRS[k][1] === dy) dir = k;
    var own = {};
    cells.forEach(function (c) { own[c[0] + ',' + c[1]] = 1; });
    for (var x = hx + dx, y = hy + dy; x >= 0 && y >= 0 && x < w && y < h; x += dx, y += dy) if (own[x + ',' + y]) return null;
    return Object.assign({}, a, { dir: dir, cells: cells });
  }
  // Flip free arrows end-for-end until the opening has about `target` share of free arrows,
  // keeping only flips that leave the board solvable.
  function harden(level, target, rnd) {
    var best = fastSolve(level), want = Math.max(2, Math.round(level.arrows.length * target));
    for (var pass = 0; pass < 10 && best.free > want; pass++) {
      var ids = level.arrows.map(function (a) { return a.id; }).sort(function () { return rnd() - 0.5; });
      for (var i = 0; i < ids.length && best.free > want; i++) {
        var a = level.arrows[ids[i]], r = reversed(a, level.w, level.h);
        if (!r) continue;
        level.arrows[a.id] = r;
        var res = fastSolve(level);
        if (res && res.free < best.free) best = res; else level.arrows[a.id] = a;
      }
    }
    level.solution = best.order;
    return best;
  }

  /* ---------- no empty cells ---------- */
  // Every leftover gap is covered, and each step keeps the board solvable (checked with fastSolve).
  // Per gap, in order of preference: grow a neighbour's tail or head into it, a new 2-cell arrow over
  // two touching gaps, a 1-cell arrow. Among options that keep the board solvable, the one leaving
  // the fewest arrows free at the start wins, so filling never makes the opening easier.
  function fillGaps(level, P) {
    var w = level.w, h = level.h, A = level.arrows;
    var reg = function (x, y) { return P.reg ? P.reg[y][x] : '#'; };
    var inside = function (x, y) { return x >= 0 && y >= 0 && x < w && y < h; };
    var occ = new Int32Array(w * h).fill(-1);
    A.forEach(function (a) { a.cells.forEach(function (c) { occ[c[1] * w + c[0]] = a.id; }); });
    var STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var dirOf = function (dx, dy) { for (var k in DIRS) if (DIRS[k][0] === dx && DIRS[k][1] === dy) return k; };
    var onOwnRay = function (a, x, y) {
      var d = DIRS[a.dir];
      for (var px = a.cells[0][0] + d[0], py = a.cells[0][1] + d[1]; inside(px, py); px += d[0], py += d[1]) if (px === x && py === y) return true;
      return false;
    };
    var best = fastSolve(level);
    for (var pass = 0; pass < 3; pass++) {
      var changed = false;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        if (occ[y * w + x] !== -1 || reg(x, y) === '.') continue;
        var R = reg(x, y), opts = [];
        STEPS.forEach(function (st) {
          var nx = x + st[0], ny = y + st[1];
          if (!inside(nx, ny) || reg(nx, ny) !== R) return;
          var o = occ[ny * w + nx];
          if (o >= 0) {
            var a = A[o], tail = a.cells[a.cells.length - 1], head = a.cells[0], d = DIRS[a.dir];
            // a 1-cell arrow can only grow straight back, so the cell behind its head stays behind it
            if (tail[0] === nx && tail[1] === ny && !onOwnRay(a, x, y) && (a.cells.length > 1 || (x === head[0] - d[0] && y === head[1] - d[1])))
              opts.push({ rank: 0, apply: function () { a.cells.push([x, y]); }, undo: function () { a.cells.pop(); } });
            if (head[0] === nx && head[1] === ny && x === head[0] + d[0] && y === head[1] + d[1])
              opts.push({ rank: 0, apply: function () { a.cells.unshift([x, y]); }, undo: function () { a.cells.shift(); } });
          } else if (o === -1 && reg(nx, ny) !== '.') {
            // new 2-cell arrow: head on (x,y) pointing away from the other gap, or the other way round
            [[x, y, nx, ny], [nx, ny, x, y]].forEach(function (q) {
              var dir = dirOf(q[0] - q[2], q[1] - q[3]);
              opts.push({ rank: 1, newCells: [[q[0], q[1]], [q[2], q[3]]], dir: dir });
            });
          }
        });
        DIR_KEYS.forEach(function (dir) { opts.push({ rank: 2, newCells: [[x, y]], dir: dir }); });
        var pick = null;
        for (var r = 0; r <= 2 && !pick; r++) {
          opts.filter(function (o) { return o.rank === r; }).forEach(function (o) {
            var added = null;
            if (o.newCells) { added = { id: A.length, dir: o.dir, cells: o.newCells, color: 0, region: R }; A.push(added); }
            else o.apply();
            var res = fastSolve(level);
            // tutorial boards fill the easy way (more free arrows); everything else the hard way
            if (res && (!pick || (P.easyFill ? res.free > pick.res.free : res.free < pick.res.free))) pick = { o: o, res: res };
            if (added) A.pop(); else o.undo();
          });
        }
        if (!pick) continue;
        if (pick.o.newCells) A.push({ id: A.length, dir: pick.o.dir, cells: pick.o.newCells, color: 0, region: R });
        else pick.o.apply();
        A.forEach(function (a) { a.cells.forEach(function (c) { occ[c[1] * w + c[0]] = a.id; }); });
        best = pick.res; changed = true;
      }
      if (!changed) break;
    }
    level.solution = best.order;
  }

  /* ---------- special arrows ---------- */
  // key/lock: a locked arrow can't leave until its key has.
  // Gimmicks arrive one at a time (key/lock 8, ice 14, linked pair 24, count block 44) and then
  // come and go, so stages don't all look alike:
  //   the stage a gimmick first appears shows that gimmick alone;
  //   normal stages alternate within each block of five: pure, one gimmick, pure, another gimmick;
  //   every 5th (hard) stage mixes two gimmicks, every 10th (super hard) up to three;
  //   picture stages stay pure so the drawing reads.
  var GIMMICK_ORDER = ['locks', 'ice', 'chains', 'blocks'];
  function gimmickAmount(kind, n) {
    return kind === 'locks' ? (n < 30 ? 2 : 3) : kind === 'ice' ? (n < 50 ? 2 : 3) : kind === 'chains' ? (n < 60 ? 1 : 2) : (n < 80 ? 1 : 2);
  }
  function specialsFor(n) {
    var none = { locks: 0, ice: 0, chains: 0, blocks: 0 }, out = Object.assign({}, none);
    var start = { locks: GIMMICK_START.key, ice: GIMMICK_START.ice, chains: GIMMICK_START.chain, blocks: GIMMICK_START.block };
    var have = GIMMICK_ORDER.filter(function (k) { return n >= start[k]; });
    if (!have.length || pictureFor(n)) return out;
    var debut = GIMMICK_ORDER.filter(function (k) { return start[k] === n; })[0];
    var pick = [];
    if (debut) pick = [debut];
    else {
      var r = Math.floor(n / 5), tier = stageTier(n), pos = n % 5;
      var rot = function (i) { return have[(r + i) % have.length]; };
      if (tier === 'super') pick = [rot(0), rot(1), rot(2)];
      else if (tier === 'hard') pick = [rot(0), rot(1)];
      else if (pos === 2) pick = [rot(0)];
      else if (pos === 4) pick = [rot(1)];
    }
    pick.forEach(function (k) { out[k] = gimmickAmount(k, n); });
    return out;
  }
  var GIMMICK_START = { key: 8, ice: 14, chain: 24, block: 44 };
  // Greedy solve that respects locks. Removing arrows never blocks anything, so the board is
  // solvable exactly when repeatedly removing every exitable arrow clears it.
  function lockSolve(level) {
    // grid version of the full rules (blocks, locks, ice, links); removing never blocks, so greedy rounds decide it
    var w = level.w, h = level.h, A = level.arrows, grid = new Int32Array(w * h).fill(-1), blockAt = {};
    A.forEach(function (a) { a.cells.forEach(function (c) { grid[c[1] * w + c[0]] = a.id; }); });
    (level.blocks || []).forEach(function (b) { blockAt[b.y * w + b.x] = b.n; });
    var removed = {}, order = [], left = A.length, cnt = 0;
    var clear = function (a) {
      var d = DIRS[a.dir];
      for (var x = a.cells[0][0] + d[0], y = a.cells[0][1] + d[1]; x >= 0 && y >= 0 && x < w && y < h; x += d[0], y += d[1]) {
        var i = y * w + x, o = grid[i];
        if (o !== -1 && o !== a.id) return false;
        if (blockAt[i] != null && blockAt[i] > cnt) return false;
      }
      return true;
    };
    var base = function (id) {
      var a = A[id];
      if (removed[id]) return false;
      if (a.lock != null && !removed[a.lock]) return false;
      if (a.ice && !a.ice.some(function (o) { return removed[o]; })) return false;
      return clear(a);
    };
    while (left > 0) {
      var batch = [];
      for (var id = 0; id < A.length; id++) {
        if (removed[id] || !base(id)) continue;
        var L = A[id].link;
        if (L != null && !removed[L] && !base(L)) continue;
        batch.push(id);
      }
      if (!batch.length) return null;
      batch.forEach(function (id) { removed[id] = true; A[id].cells.forEach(function (c) { grid[c[1] * w + c[0]] = -1; }); order.push(id); });
      left -= batch.length; cnt += batch.length;
    }
    return order;
  }
  function rayCells(level, a) {
    var d = DIRS[a.dir], out = {};
    for (var x = a.cells[0][0] + d[0], y = a.cells[0][1] + d[1]; x >= 0 && y >= 0 && x < level.w && y < level.h; x += d[0], y += d[1]) out[x + ',' + y] = 1;
    return out;
  }
  function touching(a, b) {
    var near = {};
    a.cells.forEach(function (c) { [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { near[(c[0] + d[0]) + ',' + (c[1] + d[1])] = 1; }); });
    return b.cells.some(function (c) { return near[c[0] + ',' + c[1]]; });
  }
  function addSpecials(level, want) {
    level.blocks = [];
    if (!want.locks && !want.ice && !want.chains && !want.blocks) return;
    var rnd = mulberry32(level.seed ^ 0x51ed27), order = level.solution, N = order.length;
    var pickIn = function (lo, hi, used) {
      var pool = order.slice(Math.floor(N * lo), Math.max(Math.floor(N * lo) + 1, Math.floor(N * hi)))
        .filter(function (id) { return !used[id] && level.arrows[id].cells.length >= 2; });
      return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
    };
    var used = {};
    if (want.locks && N >= 10) {
      var key = pickIn(0.12, 0.4, used);
      if (key != null) {
        used[key] = 1; level.arrows[key].special = 'key';
        var placed = 0;
        for (var tries = 0; tries < 12 && placed < want.locks; tries++) {
          var L = pickIn(0.2, 0.95, used);
          if (L == null) break;
          used[L] = 1;
          level.arrows[L].lock = key;
          if (!lockSolve(level)) delete level.arrows[L].lock; else placed++;
        }
        if (!placed) delete level.arrows[key].special;
      }
    }
    // ice: frozen until an arrow touching it leaves
    for (var i = 0, iceDone = 0; i < 14 && iceDone < (want.ice || 0); i++) {
      var F = pickIn(0.3, 0.95, used);
      if (F == null) break;
      used[F] = 1;
      var nb = level.arrows.filter(function (o) { return o.id !== F && touching(level.arrows[F], o); }).map(function (o) { return o.id; });
      if (!nb.length) continue;
      level.arrows[F].ice = nb;
      if (!lockSolve(level)) delete level.arrows[F].ice; else iceDone++;
    }
    // linked pairs: two touching arrows tied together leave together; neither may stand in the other's way
    for (var c = 0, chainDone = 0; c < 20 && chainDone < (want.chains || 0); c++) {
      var A = pickIn(0.2, 0.9, used);
      if (A == null) break;
      var a = level.arrows[A], rayA = rayCells(level, a);
      var partner = level.arrows.filter(function (o) {
        if (o.id === A || used[o.id] || o.special || o.lock != null || o.ice || !touching(a, o)) return false;
        var rayO = rayCells(level, o);
        return !o.cells.some(function (q) { return rayA[q[0] + ',' + q[1]]; }) && !a.cells.some(function (q) { return rayO[q[0] + ',' + q[1]]; });
      })[0];
      used[A] = 1;
      if (!partner || a.special || a.lock != null || a.ice) continue;
      a.link = partner.id; partner.link = A;
      if (!lockSolve(level)) { delete a.link; delete partner.link; } else { used[partner.id] = 1; chainDone++; }
    }
    // count blocks: a stone on an empty cell that many rays cross; it breaks after N arrows have left
    for (var k = 0; k < (want.blocks || 0); k++) {
      var occ = {}, rays = {};
      level.arrows.forEach(function (o) { o.cells.forEach(function (q) { occ[q[0] + ',' + q[1]] = o.id; }); });
      level.blocks.forEach(function (bl) { occ[bl.x + ',' + bl.y] = 'b'; });
      level.arrows.forEach(function (o) { var r = rayCells(level, o); for (var key in r) rays[key] = (rays[key] || 0) + 1; });
      var inPic = function (x, y) { return !level.picture || level.picture.rows[y][x] !== '.'; };
      var cands = [];
      for (var y = 0; y < level.h; y++) for (var x = 0; x < level.w; x++) {
        var key = x + ',' + y;
        if (!inPic(x, y) || !rays[key]) continue;
        if (occ[key] == null) cands.push({ x: x, y: y, hits: rays[key], tail: null });
      }
      // no empty cell on a ray? take a spare tail cell from a long arrow
      if (!cands.length) level.arrows.forEach(function (o) {
        if (o.cells.length < 3 || o.special || o.link != null) return;
        var t = o.cells[o.cells.length - 1], key = t[0] + ',' + t[1];
        if (rays[key]) cands.push({ x: t[0], y: t[1], hits: rays[key], tail: o.id });
      });
      if (!cands.length) break;
      cands = cands.filter(function (c) { return level.blocks.every(function (bl) { return Math.max(Math.abs(bl.x - c.x), Math.abs(bl.y - c.y)) >= 2; }); });
      if (!cands.length) break;
      cands.sort(function (p, q) { return (q.hits - p.hits) || (p.y - q.y) || (p.x - q.x); });
      var pickB = cands[Math.floor(rnd() * Math.min(3, cands.length))];
      if (pickB.tail != null) level.arrows[pickB.tail].cells.pop();
      var block = { x: pickB.x, y: pickB.y, n: Math.max(3, Math.round(N * 0.3)) };
      level.blocks.push(block);
      while (!lockSolve(level) && block.n > 2) block.n--;
      if (!lockSolve(level)) level.blocks.pop();
    }
    level.solution = lockSolve(level);
  }

  /* ---------- prebuilt levels ---------- */
  // Stages are generated once at build time (build-levels.js → levels.js) so phones skip the
  // generator. Compact form per arrow: dir, head x.y, then the path to the tail as u/d/l/r steps.
  var PREBUILT = null;
  function usePrebuilt(data) { PREBUILT = data; }
  var STEP = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
  function encodeLevel(l) {
    var arrows = l.arrows.map(function (a) {
      var path = '';
      for (var i = 1; i < a.cells.length; i++) {
        var dx = a.cells[i][0] - a.cells[i - 1][0], dy = a.cells[i][1] - a.cells[i - 1][1];
        path += dx === 1 ? 'r' : dx === -1 ? 'l' : dy === 1 ? 'd' : 'u';
      }
      var x = a.dir + a.cells[0][0] + '.' + a.cells[0][1] + path;
      if (a.region && a.region !== '#') x += '|r' + a.region;
      if (a.special) x += '|s' + a.special.charAt(0);
      if (a.lock != null) x += '|l' + a.lock;
      if (a.ice) x += '|i' + a.ice.join('+');
      if (a.link != null) x += '|k' + a.link;
      return x;
    }).join(';');
    return { w: l.w, h: l.h, a: arrows, b: (l.blocks || []).map(function (b) { return b.x + '.' + b.y + '.' + b.n; }).join(';'),
      s: l.solution.join(','), t: l.timeLimit, d: l.depth, f: l.freeAtStart, ar: l.area, sd: l.seed };
  }
  function decodeLevel(o, spec) {
    var arrows = o.a.split(';').map(function (str, id) {
      var parts = str.split('|'), m = parts[0].match(/^([UDLR])(\d+)\.(\d+)([udlr]*)$/);
      var cells = [[+m[2], +m[3]]];
      m[4].split('').forEach(function (c) { var p = cells[cells.length - 1]; cells.push([p[0] + STEP[c][0], p[1] + STEP[c][1]]); });
      var a = { id: id, dir: m[1], cells: cells, color: id % PALETTE, region: '#' };
      parts.slice(1).forEach(function (f) {
        var k = f.charAt(0), v = f.slice(1);
        if (k === 'r') a.region = v;
        if (k === 's') a.special = 'key';
        if (k === 'l') a.lock = +v;
        if (k === 'i') a.ice = v.split('+').map(Number);
        if (k === 'k') a.link = +v;
      });
      return a;
    });
    var l = { w: o.w, h: o.h, seed: o.sd, arrows: arrows, area: o.ar, solution: o.s.split(',').map(Number),
      blocks: o.b ? o.b.split(';').map(function (s) { var q = s.split('.'); return { x: +q[0], y: +q[1], n: +q[2] }; }) : [],
      kind: spec.kind, key: spec.key, tier: spec.params.tier, timeLimit: o.t, depth: o.d, freeAtStart: o.f };
    l.chapter = chapterOf(+spec.key).key;
    if (spec.picture) l.picture = { key: spec.picture.key, name: spec.picture.name, rows: spec.params.reg.map(function (r) { return r.join(''); }) };
    return l;
  }

  function buildLevel(kind, key) {
    if (kind === 's' && PREBUILT) {
      var sp = levelSpec(kind, key);
      if (PREBUILT[sp.key]) return decodeLevel(PREBUILT[sp.key], sp);
    }
    return generateLevel(kind, key);
  }
  // opt (build tool only): {variant: n} re-rolls the seeds, {tweak: 'easier'|'harder'…'harder5'} nudges the shape.
  // build-levels.js plays every candidate with a bot and keeps the one nearest the stage's target.
  function tweakParams(P, tweak, picture) {
    if (!tweak || P.freeTarget == null) return P;
    var d = { harder: 1, harder2: 2, harder3: 3, harder4: 4, harder5: 5, easier: -1 }[tweak] || 0, Q = Object.assign({}, P);
    Q.freeTarget = Math.max(0.08, Math.min(0.4, P.freeTarget - d * 0.035));
    Q.inward = Math.max(0.5, Math.min(0.98, P.inward + d * 0.05));
    if (!picture) { Q.w = Math.max(6, Math.min(P.tier === 'super' ? 22 : 20, P.w + d)); Q.h = Math.max(8, Math.min(26, P.h + d)); Q.maxLen = Math.max(3, P.maxLen + d); }
    return Q;
  }
  function generateLevel(kind, key, opt) {
    var spec = levelSpec(kind, key);
    opt = opt || {};
    if (opt.variant) spec.seed = (spec.seed ^ hashStr('variant-' + opt.variant)) >>> 0;
    spec.params = tweakParams(spec.params, opt.tweak, spec.picture);
    var P = spec.params, lvl = null, bestScore = -Infinity;
    // Try a few seeds (seed, seed+7919, ...) and keep the hardest well-filled board.
    // Deterministic, so every player still gets the same board.
    var tries = P.freeTarget == null ? 1 : spec.picture ? 8 : P.freeTarget <= 0.15 ? 6 : P.freeTarget < 0.25 ? 4 : 2;
    for (var k = 0; k < tries; k++) {
      var cand = generate((spec.seed + k * 7919) >>> 0, P);
      var f = cand.arrows.reduce(function (n, a) { return n + a.cells.length; }, 0) / cand.area;
      var res = P.freeTarget != null ? harden(cand, P.freeTarget, mulberry32(cand.seed ^ 0x9e3779b9)) : { free: 0, depth: 0 };
      var score = (f >= 0.84 ? 10 : f * 10) - res.free / cand.arrows.length * 5 + res.depth * 0.05;
      if (score > bestScore) { bestScore = score; lvl = cand; }
    }
    fillGaps(lvl, P);
    if (spec.picture) lvl.picture = { rows: spec.params.reg.map(function (r) { return r.join(''); }) };
    addSpecials(lvl, spec.kind === 'd' ? { locks: 2, ice: 2, chains: 1, blocks: 1 } : specialsFor(+spec.key));
    lvl.kind = spec.kind; lvl.key = spec.key; lvl.tier = spec.params.tier;
    if (spec.picture) lvl.picture = { key: spec.picture.key, name: spec.picture.name, rows: spec.params.reg.map(function (r) { return r.join(''); }) };
    lvl.chapter = spec.kind === 's' ? chapterOf(+spec.key).key : 'paper';
    lvl.timeLimit = Math.floor(20 + lvl.arrows.length * (spec.params.secPerArrow || 2)); // seconds
    lvl.depth = layers(lvl);
    lvl.freeAtStart = freeArrows(lvl, {}).length;
    return lvl;
  }

  /* ---------- play rules ---------- */
  // returns {clear:true} or {clear:false, gap:<free cells before the blocker>, blocker:id}
  function removedCount(removed) { var n = 0; for (var k in removed) if (removed[k]) n++; return n; }
  function blockLeft(level, removed, b) { return Math.max(0, b.n - removedCount(removed)); }
  function probe(level, removed, id) {
    var a = level.arrows[id], d = DIRS[a.dir], head = a.cells[0];
    var occ = {};
    (level.blocks || []).forEach(function (b, i) { if (blockLeft(level, removed, b) > 0) occ[b.x + ',' + b.y] = 'block' + i; });
    level.arrows.forEach(function (b) {
      if (removed[b.id] || b.id === id) return;
      b.cells.forEach(function (c) { occ[c[0] + ',' + c[1]] = b.id; });
    });
    var gap = 0;
    for (var x = head[0] + d[0], y = head[1] + d[1]; x >= 0 && y >= 0 && x < level.w && y < level.h; x += d[0], y += d[1]) {
      var k = x + ',' + y;
      if (k in occ) return { clear: false, gap: gap, blocker: occ[k] };
      gap++;
    }
    return { clear: true };
  }

  function isLocked(level, removed, id) { var L = level.arrows[id].lock; return L != null && !removed[L]; }
  function isFrozen(level, removed, id) { var ice = level.arrows[id].ice; return !!ice && !ice.some(function (o) { return removed[o]; }); }
  function holdReason(level, removed, id) { return isLocked(level, removed, id) ? 'locked' : isFrozen(level, removed, id) ? 'frozen' : null; }
  function baseExit(level, removed, id) { return !removed[id] && !holdReason(level, removed, id) && probe(level, removed, id).clear; }
  // a linked arrow leaves only together with its partner
  function canExit(level, removed, id) {
    var L = level.arrows[id].link;
    return baseExit(level, removed, id) && (L == null || removed[L] || baseExit(level, removed, L));
  }
  function freeArrows(level, removed) {
    return level.arrows.filter(function (a) { return canExit(level, removed, a.id); }).map(function (a) { return a.id; });
  }

  // One tap, applied to `removed` in place. Same result in play, replay and ghost simulation.
  // → {ok:false, reason:'blocked', gap, blocker} | {ok:false, reason:'locked'} | {ok:true, removed:[...], unlocked:[...]}
  function snapshot(level, removed) {
    return {
      locked: level.arrows.filter(function (a) { return !removed[a.id] && isLocked(level, removed, a.id); }).map(function (a) { return a.id; }),
      frozen: level.arrows.filter(function (a) { return !removed[a.id] && isFrozen(level, removed, a.id); }).map(function (a) { return a.id; }),
      blocks: (level.blocks || []).map(function (b) { return blockLeft(level, removed, b); })
    };
  }
  function settle(level, removed, before, gone, extra) {
    var after = snapshot(level, removed);
    return Object.assign({
      ok: true, removed: gone,
      unlocked: before.locked.filter(function (L) { return !removed[L] && !isLocked(level, removed, L); }),
      thawed: before.frozen.filter(function (F) { return !removed[F] && !isFrozen(level, removed, F); }),
      broken: before.blocks.map(function (v, i) { return v > 0 && after.blocks[i] === 0 ? i : -1; }).filter(function (i) { return i >= 0; }),
      blocks: after.blocks
    }, extra);
  }
  function applyTap(level, removed, id) {
    if (removed[id]) return { ok: false, reason: 'gone' };
    var hold = holdReason(level, removed, id);
    if (hold) return { ok: false, reason: hold };
    var pr = probe(level, removed, id);
    if (!pr.clear) return { ok: false, reason: 'blocked', gap: pr.gap, blocker: pr.blocker };
    var L = level.arrows[id].link, pair = L != null && !removed[L] ? L : null;
    if (pair != null) {
      var ph = holdReason(level, removed, pair);
      if (ph) return { ok: false, reason: ph, partner: pair };
      var pp = probe(level, removed, pair);
      if (!pp.clear) return { ok: false, reason: 'blocked', gap: pp.gap, blocker: pp.blocker, bump: pair };
    }
    var before = snapshot(level, removed);
    removed[id] = true;
    if (pair != null) removed[pair] = true;
    return settle(level, removed, before, [id].concat(pair != null ? [pair] : []), { pair: pair });
  }
  // eraser booster: takes any arrow (and its partner) off the board, no questions asked
  function applyErase(level, removed, id) {
    if (removed[id]) return { ok: false, reason: 'gone' };
    var L = level.arrows[id].link, pair = L != null && !removed[L] ? L : null;
    var before = snapshot(level, removed);
    removed[id] = true; if (pair != null) removed[pair] = true;
    return settle(level, removed, before, [id].concat(pair != null ? [pair] : []), { pair: pair, erased: true });
  }

  // Cumulative arrows cleared over time for a recorded tap log (drives the friend's progress bar).
  function timeline(level, taps) {
    var removed = {}, n = 0, out = [];
    taps.forEach(function (tp) {
      if (!tp.ok || !level.arrows[tp.id]) return;
      var r = tp.e ? applyErase(level, removed, tp.id) : applyTap(level, removed, tp.id);
      if (r.ok) { n += r.removed.length; out.push({ t: tp.t, n: n }); }
    });
    return out;
  }
  function progressOn(tl, t) { var n = 0; for (var i = 0; i < tl.length && tl[i].t <= t; i++) n = tl[i].n; return n; }

  // Difficulty metric: how many rounds it takes when every free arrow is removed at once each round.
  function layers(level) {
    var removed = {}, left = level.arrows.length, rounds = 0;
    while (left > 0) {
      var free = freeArrows(level, removed);
      if (!free.length) return Infinity;
      free.forEach(function (id) { removed[id] = true; }); left -= free.length; rounds++;
    }
    return rounds;
  }

  function isSolvable(level) {
    var removed = {};
    for (var i = 0; i < level.solution.length; i++) {
      var id = level.solution[i];
      if (removed[id]) continue;
      if (!canExit(level, removed, id)) return false;
      removed[id] = true;
    }
    return Object.keys(removed).length === level.arrows.length;
  }

  /* ---------- replay (tap log) ---------- */
  // taps: [{id, ok, t(ms)}] → "3.12,~5.20" (t in tenths of a second, ~ = bumped)
  function encodeReplay(taps) {
    return taps.map(function (tp) { return (tp.e ? '!' : tp.ok ? '' : '~') + tp.id + '.' + Math.round(tp.t / 100); }).join(',');
  }
  function decodeReplay(str) {
    if (!str) return [];
    return str.split(',').map(function (part) {
      var c = part.charAt(0), e = c === '!', ok = c !== '~', body = (e || !ok) ? part.slice(1) : part, bits = body.split('.');
      var tp = { id: parseInt(bits[0], 10), ok: ok, t: parseInt(bits[1], 10) * 100 };
      if (e) tp.e = true;
      return tp;
    }).filter(function (tp) { return isFinite(tp.id) && isFinite(tp.t); });
  }
  // successful taps by time t (ms) — used for the ghost progress bar
  function progressAt(taps, t) {
    var n = 0;
    for (var i = 0; i < taps.length; i++) if (taps[i].ok && taps[i].t <= t) n++;
    return n;
  }

  /* ---------- challenge payload ---------- */
  // UTF-8 ⇄ hex: links must survive hosts that only pass [A-Za-z0-9-] in the hash
  function hexe(str) {
    var bytes = typeof Buffer !== 'undefined' ? Array.from(Buffer.from(str, 'utf8')) : Array.from(new TextEncoder().encode(str));
    return bytes.map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function hexd(h) {
    if (!/^([0-9a-f]{2})+$/i.test(h)) throw new Error('bad hex');
    var bytes = h.match(/../g).map(function (x) { return parseInt(x, 16); });
    return typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('utf8') : new TextDecoder().decode(new Uint8Array(bytes));
  }
  // c: {kind, key, name, time(ms), mistakes, replay(string)} → hash fragment "c-<hex>"
  function encodeChallenge(c) {
    return 'c-' + hexe(JSON.stringify({ v: 1, k: c.kind, p: c.key, n: (c.name || '').slice(0, 12), t: Math.round(c.time), m: c.mistakes, r: c.replay }));
  }
  function decodeChallenge(s) {
    try {
      var o = JSON.parse(hexd(String(s).replace(/^#?c-/, '')));
      if (o.v !== 1 || (o.k !== 'd' && o.k !== 's') || typeof o.t !== 'number') return null;
      return { kind: o.k, key: String(o.p), name: String(o.n || '친구').slice(0, 12) || '친구', time: o.t, mistakes: o.m | 0, replay: String(o.r || '') };
    } catch (e) { return null; }
  }

  /* ---------- daily + share ---------- */
  function kstDate(now) { // YYYY-MM-DD in Korea time
    return new Date((now == null ? Date.now() : now) + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function dailyNumber(dateStr) {
    return Math.round((Date.parse(dateStr) - Date.parse(LAUNCH_DATE)) / 86400000) + 1;
  }
  function fmtTime(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function shareText(r) { // r: {kind,key,time,mistakes,taps,url}
    var title = r.kind === 'd' ? '오늘의 퍼즐 #' + dailyNumber(r.key) : '스테이지 ' + r.key;
    var marks = r.taps.slice(0, 30).map(function (tp) { return tp.ok ? '🟩' : '🟥'; });
    var rows = [];
    for (var i = 0; i < marks.length; i += 10) rows.push(marks.slice(i, i + 10).join(''));
    return ['🏹 쏙쏙 화살 · ' + title, '⏱ ' + fmtTime(r.time) + ' · 실수 ' + r.mistakes]
      .concat(rows).concat(['같은 판으로 붙어볼래? ' + r.url]).join('\n');
  }

  return {
    DIRS: DIRS, stageParams: stageParams, stageTier: stageTier, chapterOf: chapterOf, starsFor: starsFor,
    CHAPTERS: CHAPTERS, PICTURES: PICTURES, pictureFor: pictureFor, picStages: picStages, STAGES_PER_CHAPTER: STAGES_PER_CHAPTER, TOTAL_STAGES: TOTAL_STAGES, DAILY_PARAMS: DAILY_PARAMS, levelSpec: levelSpec,
    generate: generate, buildLevel: buildLevel, probe: probe, freeArrows: freeArrows, isSolvable: isSolvable, layers: layers, fastSolve: fastSolve,
    usePrebuilt: usePrebuilt, encodeLevel: encodeLevel, generateLevel: generateLevel,
    canExit: canExit, isLocked: isLocked, isFrozen: isFrozen, holdReason: holdReason, applyTap: applyTap, applyErase: applyErase, blockLeft: blockLeft, GIMMICK_START: GIMMICK_START, timeline: timeline, progressOn: progressOn, specialsFor: specialsFor, lockSolve: lockSolve,
    encodeReplay: encodeReplay, decodeReplay: decodeReplay, progressAt: progressAt,
    encodeChallenge: encodeChallenge, decodeChallenge: decodeChallenge,
    kstDate: kstDate, dailyNumber: dailyNumber, fmtTime: fmtTime, shareText: shareText, hashStr: hashStr
  };
});
