import {spriteBox} from './skin-model.mjs';
import {TEAM_COLORS} from './team-colors.mjs';
// Narrow cylinder facets use an affine texture approximation. The caller clips
// each face with a small overlap; keep neighboring UVs available at that edge.
export function paintSurface(ctx,image,quad,sx=0,sw=image.naturalWidth){
  const h=image.naturalHeight,a=quad[0],b=quad[1],d=quad[3];
  ctx.save();ctx.transform((b.x-a.x)/sw,(b.y-a.y)/sw,(d.x-a.x)/h,(d.y-a.y)/h,a.x,a.y);
  ctx.drawImage(image,-sx,0);ctx.restore();
}
export function overlapSurfaceSides(quad,padding=.55){
  const [a,b,c,d]=quad,top=Math.hypot(b.x-a.x,b.y-a.y),bottom=Math.hypot(c.x-d.x,c.y-d.y);
  if(top<1e-6||bottom<1e-6)return quad;
  const tx=(b.x-a.x)/top*padding,ty=(b.y-a.y)/top*padding,bx=(c.x-d.x)/bottom*padding,by=(c.y-d.y)/bottom*padding;
  return[{x:a.x-tx,y:a.y-ty},{x:b.x+tx,y:b.y+ty},{x:c.x+bx,y:c.y+by},{x:d.x-bx,y:d.y-by}];
}
export function paintBoardImage(ctx,image,quad){
  const w=image.naturalWidth,h=image.naturalHeight;
  ctx.save();ctx.beginPath();quad.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.clip();
  for(const indices of [[0,1,2],[0,2,3]]){
    const source=indices.map(i=>[[0,0],[w,0],[w,h],[0,h]][i]),target=indices.map(i=>quad[i]);
    const [s0,s1,s2]=source,[t0,t1,t2]=target;
    const den=s0[0]*(s1[1]-s2[1])+s1[0]*(s2[1]-s0[1])+s2[0]*(s0[1]-s1[1]);
    const coefficients=key=>[
      (t0[key]*(s1[1]-s2[1])+t1[key]*(s2[1]-s0[1])+t2[key]*(s0[1]-s1[1]))/den,
      (t0[key]*(s2[0]-s1[0])+t1[key]*(s0[0]-s2[0])+t2[key]*(s1[0]-s0[0]))/den,
      (t0[key]*(s1[0]*s2[1]-s2[0]*s1[1])+t1[key]*(s2[0]*s0[1]-s0[0]*s2[1])+t2[key]*(s0[0]*s1[1]-s1[0]*s0[1]))/den
    ];
    const [a,c,e]=coefficients('x'),[b,d,f]=coefficients('y');
    const center={x:target.reduce((n,p)=>n+p.x/3,0),y:target.reduce((n,p)=>n+p.y/3,0)};
    const expanded=target.map(p=>{const distance=Math.hypot(p.x-center.x,p.y-center.y)||1;return{x:p.x+(p.x-center.x)/distance*.6,y:p.y+(p.y-center.y)/distance*.6};});
    ctx.save();ctx.beginPath();expanded.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.clip();ctx.transform(a,b,c,d,e,f);ctx.drawImage(image,0,0);ctx.restore();
  }
  ctx.restore();
}
export function paintSkinPiece(ctx,{x,y,r,player,skin,lift=0,zoom=1,sx=1,sy=1,alpha=1,rotation=0,stackCount=1,stackLabel=String(stackCount)}){
  const box=spriteBox(skin,r);
  ctx.save();ctx.globalAlpha*=alpha;
  ctx.save();ctx.translate(x,y+2);ctx.scale(1+lift/Math.max(1,r)*.05,.67);ctx.fillStyle='rgba(63,45,31,'+Math.max(.08,.22-lift/Math.max(1,r)*.05)+')';ctx.beginPath();ctx.ellipse(0,0,r*1.12,r,0,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.translate(x,y-lift);ctx.rotate(rotation);ctx.scale(zoom*sx,zoom*sy);
  ctx.drawImage(skin.image,box.left,box.top,box.width,box.height);
  if(skin.character&&stackCount>1){
    const radius=Math.max(6,Math.min(9,r*.75)),bx=box.visibleLeft+box.visibleWidth-radius*.15,by=box.visibleTop+radius*.7;
    ctx.beginPath();ctx.arc(bx,by,radius,0,Math.PI*2);ctx.fillStyle=TEAM_COLORS[player].dark;ctx.fill();ctx.strokeStyle='#fff6e6';ctx.lineWidth=1.2;ctx.stroke();
    ctx.fillStyle='#fffaf0';ctx.font='850 '+Math.max(9,radius*1.35)+'px "Yut Sans","Yut Korean",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(stackLabel,bx,by+.1);
  }
  ctx.restore();
}
