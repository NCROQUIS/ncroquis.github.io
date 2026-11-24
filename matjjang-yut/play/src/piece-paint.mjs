import { TEAM_COLORS } from './team-colors.mjs';
import { paintSkinPiece } from './skin-paint.mjs';
export function paintPiece(ctx, options) {
  if(options.skin){paintSkinPiece(ctx,options);return;}
  const { x, y, r, player, lift = 0, zoom = 1, sx = 1, sy = 1, alpha = 1, rotation = 0 }=options;
  const { bright, dark } = TEAM_COLORS[player];
  const main = player === 0 ? '#327bd6' : player === 1 ? '#dc6855' : TEAM_COLORS[player].main;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.save(); ctx.translate(x, y + 2); ctx.scale(1 + lift / Math.max(1, r) * .05, .67);
  ctx.fillStyle = `rgba(63,45,31,${Math.max(.08, .22 - lift / Math.max(1, r) * .05)})`;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.12, r, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.translate(x, y - lift); ctx.rotate(rotation); ctx.scale(zoom * sx, zoom * sy);
  ctx.shadowColor = '#57351835'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 2;
  ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0, 2, r, r * .95, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = 'transparent';
  const fill = ctx.createRadialGradient(-r * .35, -r * .6, r * .04, 0, -r * .1, r * 1.15);
  fill.addColorStop(0, bright); fill.addColorStop(.52, main); fill.addColorStop(1, dark);
  ctx.fillStyle = fill; ctx.strokeStyle = '#fff0dbe0'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, -r * .13, r * .95, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#fff7e4b0'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(0, -r * .13, r * .4, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffffff7a'; ctx.beginPath(); ctx.ellipse(-r * .3, -r * .55, r * .17, r * .1, -.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
