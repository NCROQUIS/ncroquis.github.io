# 레슨 데이터 만들기 (`lessons.js`)

레슨 64개의 설명·문제는 체스룸이 직접 썼고, 판과 정답은 python-chess로 검사해요.

1. `python3 mine.py lessons.json mined.json` — JWTC 10.7.0(MIT) 연습 대국(마스터 단기전 1204판)에서 마지막 메이트 국면과 전술 후보 국면을 뽑아요.
2. `node ana.mjs mined.json res0.json 0 2` (·`1 2`) — 게임 엔진(index.html의 ENGINE 부분을 `/tmp/eng.mjs`로 꺼낸 것)으로 3수+잡기 탐색을 해서 "하나뿐인 좋은 수"가 있는 국면만 남겨요. 2개로 나눠 돌리면 약 40분.
3. `python3 gen.py ../../lessons.js` — 레슨을 만들어요. 별 모으기는 최단 수를 계산하고, 목표·정답 수는 모두 합법·성립하는지 확인해요. 흑 차례 국면은 판을 뒤집어 늘 백(아래쪽)이 두게 해요.
