# 숲빛 · 아이보리 · 골드 UI

2026-11-11 사용자 피드백의 `3-resources.zip` PNG와 `1-lobby.png` 시안을 바탕으로 합니다. 로비 실행 이미지 전체는 약 662KB이며, 실제 표시 크기에 맞춰 축소·WebP 압축합니다. [파일별 최적화 기록](../../docs/texture-optimization.md)에 크기와 품질을 기록했습니다.

배경·프로필 패널·코인·점수·게이지·챔피언십 배너·골드 버튼·하단 메뉴에는 제공된 리소스를 사용합니다. 하단 랭킹 아이콘은 기존 `#nav-ranking` 선형 SVG 트로피를 재사용합니다. 문구·숫자·진행도는 한국어·영어로 코드에서 표시합니다.

`lobby-layout.js`의 SVG viewport는 원본 논리 좌표로 투명 여백을 보정합니다. 이미지 해상도를 줄여도 이 좌표와 표시 크기는 유지합니다. 패널은 9분할하고, 게이지는 원본 트랙·채움 한 장씩을 둥근 경계 안에서 표시합니다.

중앙 판은 `board/reference-board.webp`(748×527, 약 328KB)입니다. 시안에서 판·돌 12개·그림자를 함께 분리한 결과를 무손실 압축합니다. 제작 원본은 `docs/design/source/reference-board.svg`에 있으며 실행 빌드에는 넣지 않습니다. 미션 버튼 외곽은 `panels/mission-button.svg`로 표시합니다.

일부 PNG 아이콘·패널의 모양은 시안과 차이가 있습니다. 측정 기준은 [로비 레이아웃 명세](../../docs/lobby-layout.md)에 있습니다.

일일 미션 창은 `panels/mission-dialog.svg`(632×778), 수령 버튼은 `panels/mission-claim.svg`(106×48)를 사용합니다. 두 파일에는 배경과 테두리만 있고 글자는 없습니다. 제목 선물은 기존 `icons/gift.webp`, 행의 돌은 기존 흑백 돌을 사용합니다. [미션 레이아웃 명세](../../docs/mission-layout.md)에 좌표·글자 크기·굵기와 시안 비교를 기록합니다.

Noto Sans KR 가변 WOFF2를 로컬에 포함하며 라이선스는 `fonts/OFL.txt`입니다. 미션에는 이 글꼴에서 178문자와 13개 굵기를 추출한 정적 WOFF2(`fonts/mission/`, 총 약 187KB)를 사용해 브라우저별 굵기 차이를 막습니다. 재생성 스크립트는 `scripts/build-mission-fonts.py`입니다. 실제 대국·관전·기보는 기존 판·돌 스킨과 격자·착수 연출을 사용합니다.

`branding/title-underline.svg`는 로비 제목 아래의 기존 초록 물결을 경로와 색상 변경 없이 분리한 공용 파일입니다. 로비와 주간 챔피언십 제목이 같은 파일을 재사용하며, 각 화면에서 지정한 높이를 유지합니다.
