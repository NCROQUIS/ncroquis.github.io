// 결과 이미지 카드 (캔버스로 그려서 PNG로 만들어요) — 카톡·토스 대화방에서 눈에 띄게
import { formatTime } from "./sudoku.js";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// rec: { seconds, mistakes, stars, boxMistakes, hinted }, extra: { dateKey, streak, name, rankText }
export function drawResultCard(rec, { dateKey, streak, name, rankText }) {
  const W = 900, H = 1125;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const font = (w, px) => `${w} ${px}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif`;

  // 배경
  ctx.fillStyle = "#F6F3EC"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#3182F6"; roundRect(ctx, 0, 0, W, 210, 0); ctx.fill();
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center";
  ctx.font = font(800, 64); ctx.fillText("데일리도쿠", W / 2, 105);
  const y = Math.floor(dateKey / 10000), m = Math.floor(dateKey / 100) % 100, d = dateKey % 100;
  const dow = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  ctx.font = font(600, 36); ctx.fillStyle = "rgba(255,255,255,.88)";
  ctx.fillText(`${m}월 ${d}일 (${dow}) 오늘의 한 판`, W / 2, 165);

  // 카드
  ctx.fillStyle = "#FFFFFF"; roundRect(ctx, 60, 250, W - 120, 800, 40); ctx.fill();

  // 별
  ctx.font = font(400, 92);
  [0, 1, 2].forEach((i) => {
    ctx.globalAlpha = i < rec.stars ? 1 : 0.18;
    ctx.fillText("⭐", W / 2 + (i - 1) * 120, 375);
  });
  ctx.globalAlpha = 1;

  // 시간
  ctx.fillStyle = "#1E2A44"; ctx.font = font(800, 150);
  ctx.fillText(formatTime(rec.seconds), W / 2, 555);
  ctx.fillStyle = "#6F778A"; ctx.font = font(600, 38);
  ctx.fillText(`실수 ${rec.mistakes}  ·  🔥 ${streak}일 연속`, W / 2, 620);

  // 박스 3x3
  const size = 92, gap = 14, gx = W / 2 - (size * 3 + gap * 2) / 2, gy = 670;
  for (let b = 0; b < 9; b++) {
    const r = Math.floor(b / 3), cc = b % 3;
    ctx.fillStyle = rec.boxMistakes[b] > 0 ? "#F2C14E" : rec.hinted[b] > 0 ? "#7FB0FF" : "#56C271";
    roundRect(ctx, gx + cc * (size + gap), gy + r * (size + gap), size, size, 18); ctx.fill();
  }

  // 아래 줄
  ctx.fillStyle = "#6F778A"; ctx.font = font(600, 34);
  ctx.fillText(rankText || (name ? `${name} 님의 기록` : "전국이 같은 문제를 풀어요"), W / 2, 1010);
  ctx.fillStyle = "#1E2A44"; ctx.font = font(700, 36);
  ctx.fillText("나랑 오늘 문제 겨뤄 볼래요?", W / 2, 1100);
  return c;
}

export function canvasToBlob(canvas) {
  return new Promise((res) => {
    try { canvas.toBlob((b) => res(b), "image/png"); } catch { res(null); }
  });
}
