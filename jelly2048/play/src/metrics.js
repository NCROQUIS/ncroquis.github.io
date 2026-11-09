// 개발 중(npm run dev)이나 지표를 끈 빌드에는 NcqMetrics가 없어서 대신 써요 (아무것도 안 해요)
export const NcqMetrics = window.NcqMetrics || { levelStart() {}, levelEnd() {} };
