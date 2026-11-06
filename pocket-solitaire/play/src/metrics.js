// 판 지표: 판을 시작할 때와 끝날 때 웹 공개·출시 빌드가 넣어 주는 지표 모듈 NcqMetrics에 알려요
// (관리자 페이지 지표의 '판' 카드: 게임 종류별 판 수·클리어율·그만둔 판·판 시간). 부르는 곳은 main.js의 roundName 둘레.
// 개발 중이나 지표를 끈 빌드에는 NcqMetrics가 없어서 대신 써요 (아무것도 안 해요)
export const NcqMetrics = window.NcqMetrics || { levelStart() {}, levelEnd() {} };
