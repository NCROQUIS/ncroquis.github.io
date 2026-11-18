# 맞짱 오목 효과음 출처

2026-11-18. 맞짱 장기에 사용자가 승인해 적용한 최종 MP3 6개를 바이트 변경 없이 복사했다. 재압축·피치·음순서 변경은 없다. 팝업 wood는 공용 NcqSound가 만드는 기본음이며 파일을 추가하지 않는다. 기존 `assets/match-ui/stone-on-wood.wav`는 그대로 유지한다.

| 파일 | 구성 | 원본 녹음 |
| --- | --- | --- |
| match-wait-low.mp3 / match-wait-high.mp3 | 가야금 응답 두 음 | 정악가야금 jungak_gayageum_sus_mid_04_05.wav |
| match-found.mp3 | 장구 쿵+거문고 | Janggu_3_2.wav / gumungo_D_scale_mid_80.wav |
| victory.mp3 | 가야금 네 음 | jungak_gayageum_sus_mid_04_05.wav |
| defeat.mp3 | 거문고 세 음 | gumungo_D_scale_mid_80.wav |
| rank-promotion.mp3 | 가야금+편경 | jungak_gayageum_sus_mid_04_05.wav / Pyeongyeoing_2.wav |

원저작자·제공기관은 **국립국악원**, 저작물은 「국악기 디지털 음원」이다. **공공누리 제1유형(출처표시)**에 따라 실연 녹음을 발췌·배열·음량 및 여음 편집해 사용한다. 승급을 포함해 배포 파일은 44.1kHz 모노 MP3 96kbps다.

- [공공누리 제1유형 이용조건](https://www.kogl.or.kr/info/licenseType1.do)
- [정악가야금 원본 목록](https://apis.gugak.go.kr/digitaleum/front/monotone/list.do?instrCd=19914)
- [정악거문고 원본 목록](https://apis.gugak.go.kr/digitaleum/front/monotone/list.do?instrCd=19988)
- [장구 원본 목록](https://apis.gugak.go.kr/digitaleum/front/monotone/list.do?instrCd=19847)
- [편경 원본 목록](https://apis.gugak.go.kr/digitaleum/front/monotone/list.do?instrCd=19854)

게임 옵션의 국악 효과음 출처에 한국어·영어 기관·저작물·조건·편집 사실을 표시한다. 토스에서는 기관 주소만 표시하며 외부 이동 링크를 두지 않는다. 원본 편집·승인 기록은 맞짱 장기의 `docs/design/gugak-audio/{applied,matching-applied}`와 `docs/design/end-sound-preview/APPLIED.md`에 있다. 오목의 내용 해시 주소는 `audio-assets.js`에 있으며 자동 검사에서 각 MP3 및 기존 착수음의 해시를 확인한다.
