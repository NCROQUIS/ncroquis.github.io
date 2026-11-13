# 클래식 장기 스킨

사용자가 제공한 장기 화면의 밝은 황목 판·회백색 팔각 말·파란 초와 빨간 한을 참고한 추가 무료 스킨이다. 상점에서 판과 말을 독립적으로 선택하며 기존 선택은 유지한다. 스타일 ID는 `janggi`다.

- `board.webp`: 선·글자·말이 없는 판 재질, 900×900. 격자와 궁성은 공용 SVG로 별도 표시한다.
- `piece-body.webp`: 글자·바닥 그림자가 없는 RGBA 몸체, 256×256. 크기는 궁 / 일반 기물 / 사·졸·병의 세 단계다. 공용 그림자와 글자는 별도 표시한다.
- `piece-glyphs.ttf`: [Yuji Syuku](https://github.com/Kinutafontfactory/Yuji)의 장기말 9글자 `楚漢士車包馬象卒兵` 부분 집합. [Google Fonts 배포본](https://github.com/google/fonts/tree/main/ofl/yujisyuku), SIL Open Font License 1.1. 저작권과 라이선스 전문은 `OFL.txt`에 있다. 런타임에 외부 폰트를 요청하지 않는다.

## 이미지 제작

내장 ImageGen으로 두 자산을 각각 새로 생성했다. 첨부 사진은 재질·색·형태의 참고이며 원본 화면을 잘라 사용하지 않았다. 결과를 WebP로 축소·인코딩해 저장했으며 몸체의 알파를 유지했다.

판 최종 프롬프트:

> Use case: product-mockup. Asset type: flat board-surface texture for a Korean Janggi mobile game. Generate an evenly lit perfectly flat orthographic full-bleed wooden surface ONLY. Pale honey yellow golden bamboo/katsura wood with many fine vertical straight fibers, subtly irregular warm yellow and beige grain, familiar affordable traditional Korean janggi board feel. Low contrast fine detail so separately drawn dark grid lines will remain clear. No planks, seams, border, frame, grid, lines, symbols, text, game pieces, shadows, vignette or perspective. Entire square image is continuous finely grained yellow wood. Reference mood is a classic mobile janggi board, light straw yellow, not orange or dark brown.

말 최종 프롬프트 (`transparent_background: true`):

> Use case: product-mockup. Asset type: one reusable blank Korean Janggi piece body sprite. Generate ONE centered chunky pale cool gray / ivory plastic octagonal Korean janggi token, directly overhead orthographic camera. A regular octagon, horizontal top/bottom edges and vertical left/right edges, clipped corners at 45 degrees. Broad flat unmarked face, narrow rounded bevel around the face, visible darker gray low sidewall at the bottom suggesting thickness, soft highlight on upper-left bevel. Classic simple molded plastic Korean chess piece, matte smooth ivory-gray top, no woodgrain. Occupy 88% of a square canvas, with evenly spaced transparent margin. The piece itself must be opaque. Truly transparent exterior. No letters, Chinese characters, symbols, decoration, inset lines, board, floor, cast/contact/drop shadow or glow. Body shading only within its silhouette. Separate game text and ground shadow will be drawn by the app.

## 검증

`npm run build`와 `npm test`(26개)를 통과했다. Chrome 모바일 브라우저에서 한국어·영어 × Android 360×640·iPhone 393×852·Toss 360×640의 안전 영역, 상점 무료 적용, 새로고침 후 선택 유지, 기존 스킨 샘플 분리, 자산 로드와 실제 붓글씨 사용을 확인했다. 캡처와 검사 결과는 `build/screens/classic-jangi/`에 있다. `board.png`는 실제 상점의 초기 배치 미리보기를 검사 페이지에서만 확대한 이미지다. 실제 Android WebView의 시스템 글자 배율 검사는 수행하지 않았다.
