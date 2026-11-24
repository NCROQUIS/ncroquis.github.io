# 맞짱 윷놀이 사운드 출처

맞짱 장기의 승인된 최적화 음원 11개를 재인코딩 없이 재사용한다.

- rank-promotion.mp3: 국립국악원 정악가야금 네 음과 편경 여음을 편집한 승급음. 공공누리 제1유형(출처표시). 편경 원본: Pyeongyeoing_2.wav, https://apis.gugak.go.kr/digitaleum/front/monotone/list.do?instrCd=19854
- stamp-impact.mp3: 사용자가 제공한 Boom_1.mp3의 최적화본. 국립국악원 음원이 아니다. 스테레오·전체 여음·피치를 유지한다.
- stone-on-wood.wav: 장기에서 사용하던 나무 착수음.

아래는 장기 프로젝트에 보존된 원출처 및 편집 기록이다.

# 장기 배경음·효과음

2026-11-17 사용자 선택에 따라 포획 B·장군 B·승리 A·패배 B를 적용했다. 효과음 4종은 국립국악원 「국악기 디지털 음원」 실연 녹음을 발췌·배열·편집한 것이다. **공공누리 제1유형(출처표시)**에 따라 사용한다. 배경음은 사용자가 제공한 bgm_loop.wav를 10ms 루프로 최적화한 파일을 보존하며 착수음은 `assets/match-ui/stone-on-wood.wav`를 유지한다.

- `match-bgm.mp3`: 사용자가 제공한 `bgm_loop.wav`를 10ms 원형 크로스페이드로 연결한 약 30.122초의 루프. 44.1kHz 스테레오 MP3 96kbps, 362,414바이트다. 대국·관전·오늘의 문제·함께하기에서 반복한다. 배경음 기본 꺼짐과 사용자 설정은 유지한다.
- `capture.mp3`: 포획 B, 장구 덩(중), 0.75초.
- `check.mp3`: 장군 B, 편종 두 음, 약 1.24초.
- `victory.mp3`: 승리 A, 가야금 네 음, 약 1.62초.
- `defeat.mp3`: 패배 B, 거문고 세 음, 약 2.28초.

2026-11-18에는 매칭 가야금 대기음과 성사 B(장구+거문고)를 추가했다.

- `match-wait-low.mp3`·`match-wait-high.mp3`: 짧게 다듬은 정악가야금 두 음, 각각 0.38초·0.36초. 대기창에서 1.08초 뒤 시작해 0.54초 간격으로 주고받고, 한 쌍을 4.32초마다 반복한다.
- `match-found.mp3`: 성사 B, 장구 쿵과 정악거문고의 짧은 현 울림, 1.2초. 성사 화면의 카드 접촉 300ms에 한 번 재생한다.

매칭 음원은 같은 국립국악원 실연 녹음에서 편집한 FLAC 마스터로부터 44.1kHz 모노 MP3 96kbps로 출력했다. 세 파일 합계 25,522바이트이며 긴 무음 반복 파일은 앱에 넣지 않는다. 기존 여섯 음원 파일은 그대로다. 장구는 `Janggu_3_2.wav`(쿵·중), 대기는 아래 정악가야금 원본의 발췌 구간 8·10번, 성사는 아래 정악거문고 원본의 4번 구간(0부터 세는 index)을 사용했다. 모두 같은 공공누리 제1유형이며 발췌·배열·모노 변환·음량·여음을 편집했다. 매칭 출처도 기존 옵션의 국립국악원·장구·정악가야금·정악거문고 안내에 포함된다. 자세한 출처·마스터·선택과 검증은 `docs/design/gugak-audio/matching-applied/`에 있다.

효과음은 원본 PCM에서 44.1kHz 모노 MP3 96kbps로 출력했으며 선택한 후보 MP3를 중간 재압축하지 않았다. 네 파일 합계 73,840바이트이며 선택 후보 대비 54.04% 작다. 불필요한 무음만 정리하고 피치·음순서·기존 게임 재생 시점은 유지했다. 재생 시에는 NcqSound만 사용하며 게임에 새 라이브러리를 추가하지 않는다.

## 원저작물 출처

원저작자·제공기관: **국립국악원**, 「국악기 디지털 음원」. [공공누리 제1유형 이용조건](https://www.kogl.or.kr/info/licenseType1.do).

- 포획: [장구](https://apis.gugak.go.kr/digitaleum/front/monotone/list.do?instrCd=19847), `Janggu_1_2.wav` — 덩·중. 앞 무음·여음과 음량을 정리했다.
- 장군: [편종](https://apis.gugak.go.kr/digitaleum/front/monotone/list.do?instrCd=19855), `Pyeonjong_2.wav` — 타격음·중. 실제 두 타격을 0.22초 간격으로 배열하고 여음을 정리했다.
- 승리: [정악가야금](https://apis.gugak.go.kr/digitaleum/front/monotone/list.do?instrCd=19914), `jungak_gayageum_sus_mid_04_05.wav` — 기본음계·중. 네 음을 배열하고 음량을 정리했다.
- 패배: [정악거문고](https://apis.gugak.go.kr/digitaleum/front/monotone/list.do?instrCd=19988), `gumungo_D_scale_mid_80.wav` — 기본음계(대현)·중. 세 음을 배열하고 음량을 정리했다.

게임 옵션의 ‘국악 효과음 출처’에서도 기관·저작물·사용 조건·편집 사실을 표시한다. 원본 출처 링크는 웹·Android에서 제공하며 토스에서는 외부 이동 없이 기관 주소를 글자로 표시한다.

효과음 재생성은 `scripts/optimize-selected-gugak-audio.py`, 원본 다운로드와 후보 배열은 `scripts/prepare-gugak-reference-candidates.py`를 사용한다. 기존 합성 스크립트 `scripts/create-jangi-audio.py`는 이전 음원 제작 기록이며 선택 효과음을 덮어쓰는 데 사용하지 않는다. 배경음 원본과 변환은 docs/design/user-bgm-loop/ 및 scripts/prepare-jangi-bgm.py에 보존한다. 검증·선택 기록은 `docs/design/gugak-audio/applied/`에 있다.

## 기존 배경음과 루프 보존

배경음의 무손실 원본은 `docs/design/user-bgm-loop/source.flac`, 변환은 `scripts/prepare-jangi-bgm.py`다. Python·numpy·FFmpeg로 재생성하며 출력 SHA-256 앞 12자리를 `game/audio.js`의 배경음 주소 `v=`에 반영한다. 원본의 작은 신호를 고정 이득으로 보정하고 -3dBFS 여유를 두었다. 인코딩 후 최대 피크는 약 0.684이고 클리핑은 없다. MP3의 Xing/LAME 지연·패딩 정보를 유지한다. 상세 검증은 `docs/design/user-bgm-loop/`에 있다.

재생은 `game/loop-music.js`가 공용 NcqSound의 `context()`·`output('bgm')`에 연결한 버퍼를 오디오 시계로 반복한다. 새 Audio·AudioContext를 만들지 않는다. 음량·음소거·첫 터치·광고·화면 숨김 처리는 공용 모듈을 따른다. 켜기 전에는 음악을 해독하지 않고, 켠 뒤에는 버퍼 하나만 재사용한다. 해당 기능을 지원하지 않는 환경은 기존 NcqSound.bgm으로 대체한다.
