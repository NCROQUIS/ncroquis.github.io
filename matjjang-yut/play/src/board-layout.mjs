// Fit the tray to the real play slot. Horizontal board spacing and uniform token
// size are independent, so a short screen uses its width without stretching pieces.
const perspective = (y, z = 0) => 9 / (9 - y * .06 + z * .06);
export function fitBoardLayout(slotWidth, slotHeight, tray = {}) {
  const width = Math.max(100, slotWidth), height = Math.max(100, slotHeight);
  const padding = 4;
  const { halfWidth = 3.78, halfHeight = 3.65, depth = .24 } = tray;
  const horizontalEdge = halfWidth * perspective(halfHeight, -depth);
  const topEdge = -halfHeight * perspective(-halfHeight);
  const finishY = (5 - .09 * .66) * perspective(5, .09);
  const centerY = (height - Math.max(36, height * .18)) * .5;
  const scaleX = (width - padding * 2) / (horizontalEdge * 2);
  let scale = Math.min(scaleX, (centerY - padding) / -topEdge, (height - centerY - padding - 15) / finishY);
  const finishRadius = Math.max(30, Math.min(44, scale * .9)) / 2;
  scale = Math.min(scale, (height - centerY - padding - finishRadius) / finishY);
  return { width, height, scaleX, scale, centerY };
}
