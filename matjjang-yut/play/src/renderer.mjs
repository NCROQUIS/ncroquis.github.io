import { POINTS, position, OUTCOMES } from './game.mjs';
import { t } from './i18n.mjs';
import { playLaunch, playClack, playResult, playStep } from './audio.mjs';
import { createThrowPlan, heightMagnification } from './throw-motion.mjs';
export function createRenderer(canvas, options) {
  const ctx=canvas.getContext('2d'), area=canvas.parentElement;
  const PI=Math.PI,TAU=PI*2,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>t*t*(3-2*t),ease=t=>1-Math.pow(1-t,3);
  const settings={impact:.85},reduced=false;
  let width=400,height=408,scale=49,phase='idle',result='geol',thrower='me',elapsed=0,busy=false,gatherFrom=null;
  let ui={game:options.game,plan:null,pieceId:null,busy:false},moving=null,opacity=1,raf=0,run=0,resolvePending=null;
  const outcomes={geol:{flat:[0,1,1,1]}};
  const color={bg:'#fcf5e7',shadow:'#5e422c',ink:'#ac8e60',line:'#c2a77c',wood:'#e9bd7d',rim:'#f2d19a',grain:'#aa6e36',board:'#d7ae77'};
  const startX=[-1.75,-.58,.58,1.75];
  const bundleX=[-.795,-.265,.265,.795],bundleA=[-.045,-.015,.015,.045];
  const initialThrow=createThrowPlan(options.getThrowSettings?.());
  let timing=initialThrow.timing,flights=initialThrow.sticks;
  const landingAt=i=>timing.launch+flights[i].duration;
  const lastLanding=()=>timing.lastLanding;
  const direction=()=>thrower==='me'?1:-1;
  const landingX=i=>flights[i].x*direction(),landingY=i=>flights[i].y*direction();
  function pieceTokens(){
    const groups=new Map();
    for(const piece of ui.game.pieces){
      const node=position(piece);if(node==='base'||node==='finish'||moving?.ids.includes(piece.id))continue;
      const key=piece.player+':'+node;
      if(!groups.has(key)){const [x,y]=POINTS[node];groups.set(key,[x,y,piece.player===0?'blue':'red',[]]);}
      groups.get(key)[3].push(piece.id);
    }
    if(moving)groups.set('moving',[moving.x,moving.y,moving.player===0?'blue':'red',moving.ids]);
    return Array.from(groups.values());
  }
  function project(p){const k=9/(9-p.y*.06+p.z*.06);return{x:width*.5+p.x*scale*k,y:height*.5+(p.y-p.z*.66)*scale*k};}
  function stickView(p){
    if(p.view)return p.view;
    // The camera is above the board: rising sticks approach it and grow.
    const zoom=heightMagnification(p.z),floor=project({x:p.x,y:p.y,z:0});
    const ax=rotate({x:1,y:0,z:0},p),ay=rotate({x:0,y:1,z:0},p),az=rotate({x:0,y:0,z:1},p);
    const mx=(.255*Math.hypot(ax.x,az.x)+1.22*Math.abs(ay.x))*scale*zoom+7;
    const my=(.255*Math.hypot(ax.y-.66*ax.z,az.y-.66*az.z)+1.22*Math.abs(ay.y-.66*ay.z))*scale*zoom+7,lift=Math.log1p(Math.max(0,p.z))*.65*scale;
    return p.view={zoom,x:clamp(floor.x,mx,width-mx),y:clamp(floor.y-direction()*lift,my,height-my)};
  }
  function projectStick(point,p){const view=stickView(p);return{x:view.x+(point.x-p.x)*scale*view.zoom,y:view.y+((point.y-p.y)-.66*(point.z-p.z))*scale*view.zoom};}
  function path(points,close=true){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(close)ctx.closePath();}
  function roundPolygon(points,r){ctx.beginPath();for(let i=0;i<points.length;i++){const prev=points[(i+points.length-1)%points.length],cur=points[i],next=points[(i+1)%points.length];const a=Math.min(r/Math.hypot(cur.x-prev.x,cur.y-prev.y),.4),b=Math.min(r/Math.hypot(next.x-cur.x,next.y-cur.y),.4);const enter={x:lerp(cur.x,prev.x,a),y:lerp(cur.y,prev.y,a)},leave={x:lerp(cur.x,next.x,b),y:lerp(cur.y,next.y,b)};if(i===0)ctx.moveTo(enter.x,enter.y);else ctx.lineTo(enter.x,enter.y);ctx.quadraticCurveTo(cur.x,cur.y,leave.x,leave.y);}ctx.closePath();}
  function rgba(hex,a){return hex+(Math.round(clamp(a)*255).toString(16).padStart(2,'0'));}
  function background(){
    ctx.fillStyle=color.bg;ctx.fillRect(0,0,width,height);
    const halo=ctx.createRadialGradient(width*.5,height*.47,2,width*.5,height*.47,width*.65);halo.addColorStop(0,'#f2ce7e26');halo.addColorStop(1,'#f2ce7e00');ctx.fillStyle=halo;ctx.fillRect(0,0,width,height);
  }
  function tray(){
    const corners=[[-3.78,-3.65], [3.78,-3.65],[3.78,3.65],[-3.78,3.65]];
    const top=corners.map(([x,y])=>project({x,y,z:0})),bottom=corners.map(([x,y])=>project({x,y,z:-.24}));
    ctx.save();ctx.shadowColor=rgba(color.shadow,.18);ctx.shadowBlur=18*width/416;ctx.shadowOffsetY=9;roundPolygon(bottom,20*width/416);ctx.fillStyle='#b5b0a6';ctx.fill();ctx.restore();
    roundPolygon(bottom,20*width/416);ctx.fillStyle='#c7c2b8';ctx.fill();
    roundPolygon(top,20*width/416);const rim=ctx.createLinearGradient(0,top[0].y,0,top[2].y);rim.addColorStop(0,'#ffffff');rim.addColorStop(.5,'#eeece6');rim.addColorStop(1,'#f8f7f3');ctx.fillStyle=rim;ctx.fill();ctx.strokeStyle='#c6c2b8';ctx.lineWidth=1;ctx.stroke();
    const inner=[[-3.48,-3.36],[3.48,-3.36],[3.48,3.36],[-3.48,3.36]].map(([x,y])=>project({x,y,z:.02}));
    ctx.save();roundPolygon(inner,14*width/416);ctx.clip();const surface=ctx.createLinearGradient(0,inner[0].y,0,inner[2].y);surface.addColorStop(0,'#ffffff');surface.addColorStop(.5,'#fffefb');surface.addColorStop(1,'#f9f8f3');ctx.fillStyle=surface;ctx.fillRect(0,0,width,height);
    ctx.restore();roundPolygon(inner,14*width/416);ctx.strokeStyle='#d9d6cd';ctx.lineWidth=1.4;ctx.stroke();
    const highlight=top.map(p=>({x:p.x,y:p.y-1}));roundPolygon(highlight,20*width/416);ctx.strokeStyle='#ffffffd0';ctx.lineWidth=1;ctx.stroke();
  }
  function boardRoutes(){
    const a=3.08,corners=[[-a,-a],[a,-a],[a,a],[-a,a]],node=(x,y,z=.045)=>project({x,y,z});
    ctx.save();ctx.lineWidth=1.5;ctx.strokeStyle='#a9aca4';path(corners.map(([x,y])=>node(x,y)));ctx.stroke();
    for(let i=0;i<2;i++){path([node(...corners[i]),node(...corners[i+2])],false);ctx.stroke();}
    const nodes=[];
    for(let edge=0;edge<4;edge++)for(let n=0;n<5;n++){const t=n/5,start=corners[edge],end=corners[(edge+1)%4];nodes.push({x:lerp(start[0],end[0],t),y:lerp(start[1],end[1],t),corner:n===0});}
    for(const [x,y] of corners)for(const t of [1/3,2/3])nodes.push({x:x*(1-t),y:y*(1-t)});
    nodes.push({x:0,y:0,corner:true});
    nodes.forEach((n,i)=>{
      const p=node(n.x,n.y),r=scale*(n.corner?.255:.115);ctx.save();ctx.shadowColor='#77766b20';ctx.shadowBlur=2;ctx.shadowOffsetY=1.5;
      const fill=ctx.createRadialGradient(p.x-r*.3,p.y-r*.4,1,p.x,p.y,r);fill.addColorStop(0,'#ffffff');fill.addColorStop(1,n.corner?'#e8e6de':'#f0f1ec');
      ctx.fillStyle=fill;ctx.strokeStyle='#a4a79d';ctx.lineWidth=n.corner?1.8:1.2;ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.fill();ctx.stroke();ctx.restore();
      if(n.corner){ctx.strokeStyle='#ada897';ctx.lineWidth=.9;ctx.beginPath();ctx.arc(p.x,p.y,r*.74,0,TAU);ctx.stroke();for(let k=0;k<8;k++){const angle=k*TAU/8;ctx.beginPath();ctx.ellipse(p.x+Math.cos(angle)*r*.36,p.y+Math.sin(angle)*r*.36,r*.28,r*.10,angle,0,TAU);ctx.stroke();}ctx.fillStyle='#ada897';ctx.beginPath();ctx.arc(p.x,p.y,r*.12,0,TAU);ctx.fill();}
    });
    const start=node(a,a);ctx.font='600 '+Math.max(11,width*.025)+'px "Yut Sans","Yut Korean",sans-serif';ctx.textAlign='right';ctx.fillStyle='#7f847a';ctx.fillText(t('start'),start.x-17*width/448,start.y-18*width/448);
    const tokens=pieceTokens();
    for(const [x,y,team] of tokens){
      const p=node(x,y,.07),r=scale*.225,blue=team==='blue',bright=blue?'#8ecbff':'#ffb199',main=blue?'#327bd6':'#dc6855',dark=blue?'#174789':'#9e382e';
      ctx.save();ctx.shadowColor='#57351840';ctx.shadowBlur=3;ctx.shadowOffsetY=3;ctx.fillStyle=dark;ctx.beginPath();ctx.ellipse(p.x,p.y+2,r,r*.95,0,0,TAU);ctx.fill();ctx.shadowColor='transparent';
      const fill=ctx.createRadialGradient(p.x-r*.35,p.y-r*.6,r*.04,p.x,p.y-r*.1,r*1.15);fill.addColorStop(0,bright);fill.addColorStop(.52,main);fill.addColorStop(1,dark);ctx.fillStyle=fill;ctx.strokeStyle='#fff0dba8';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p.x,p.y-r*.13,r*.95,0,TAU);ctx.fill();ctx.stroke();
      ctx.strokeStyle='#fff7e4b0';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(p.x,p.y-r*.13,r*.40,0,TAU);ctx.stroke();ctx.fillStyle='#ffffff7a';ctx.beginPath();ctx.ellipse(p.x-r*.3,p.y-r*.55,r*.17,r*.1,-.5,0,TAU);ctx.fill();ctx.restore();
    }
    ctx.restore();canvas.dataset.boardNodes=String(nodes.length);
  }
  function rotate(v,p){
    let x=v.x,y=v.y,z=v.z,c=Math.cos(p.rx),s=Math.sin(p.rx),ny=y*c-z*s,nz=y*s+z*c;y=ny;z=nz;
    c=Math.cos(p.ry);s=Math.sin(p.ry);const nx=x*c+z*s;nz=-x*s+z*c;x=nx;z=nz;
    c=Math.cos(p.rz);s=Math.sin(p.rz);return{x:x*c-y*s,y:x*s+y*c,z};
  }
  function world(v,p){const r=rotate(v,p);return{x:r.x+p.x,y:r.y+p.y,z:r.z+p.z};}
  function pose(i){
    const face=outcomes[result].flat[i],idleFace=[1,0,1,0][i],base=face?.255:0;
    if(phase==='idle')return{x:startX[i],y:.47,z:idleFace?.255:0,rx:0,ry:idleFace?0:PI,rz:[-.11,.06,-.04,.13][i],h:0,t:0};
    const side=direction(),t=elapsed,from=gatherFrom[i],p=flights[i],packed={x:bundleX[i]*side,y:side*2.05,z:.28,rx:0,ry:from.ry,rz:bundleA[i]*side,h:.28,t:0};
    const flight=(t-timing.launch)/p.duration,finalRy=(face?0:PI)+(i%2?1:-1)*TAU*p.turns,startRy=packed.ry;
    if(t<timing.gather){const u=clamp(t/timing.gather),q=ease(u),lift=Math.sin(u*PI)*.1*(reduced?0:1);return{x:lerp(from.x,packed.x,q),y:lerp(from.y,packed.y,q),z:lerp(from.z,packed.z,q)+lift,rx:lerp(from.rx,packed.rx,q),ry:startRy,rz:lerp(from.rz,packed.rz,q),h:q*.22+lift,t:0};}
    if(t<timing.launch){const q=clamp((t-timing.gather)/(timing.launch-timing.gather)),dip=Math.sin(q*PI)*.09*(reduced?0:1);return{...packed,z:packed.z-dip,rx:Math.sin(q*PI)*.035,h:packed.h-dip};}
    if(flight<1){const u=clamp(flight),e=smooth(u),height=p.height-Math.pow(Math.sqrt(p.height-packed.z)*(1-u)-Math.sqrt(p.height-base)*u,2);return{x:lerp(packed.x,landingX(i),ease(clamp(u*1.4))),y:lerp(packed.y,landingY(i),e),z:height,rx:side*(TAU*(i%2?1:-1)*2*e+Math.sin(u*PI)*.3),ry:lerp(startRy,finalRy,e),rz:lerp(packed.rz,p.angle*side,e)+Math.sin(u*PI)*(i%2?.6:-.6)*side,h:height,t:u};}
    const bounce=clamp((t-landingAt(i))/timing.bounce),wave=Math.abs(Math.sin(bounce*PI*2))*Math.pow(1-bounce,1.7);
    const hop=wave*Math.min(.32,p.height*.16);
    return{x:landingX(i)+Math.sin(bounce*PI)*.07*(i%2?1:-1)*side,y:landingY(i)+Math.sin(bounce*PI)*.06*side,z:base+hop,rx:Math.sin(bounce*PI*3)*.13*(1-bounce)*side,ry:finalRy+Math.sin(bounce*PI*4)*.25*(1-bounce),rz:p.angle*side+Math.sin(bounce*PI*2)*.055*(1-bounce)*side,h:hop,t:1};
  }
  function stickShadow(p){
    const center=project({x:p.x,y:p.y,z:0});ctx.save();ctx.translate(center.x,center.y);ctx.rotate(p.rz);const h=Math.max(0,p.h),s=1+h*.12;ctx.scale(1,.97);ctx.filter='blur('+(2+h*1.4)*width/416+'px)';ctx.fillStyle=rgba('#59331c',.24/(1+h*.7));ctx.beginPath();ctx.ellipse(0,0,.33*scale*s,1.24*scale*s,0,0,TAU);ctx.fill();ctx.restore();
  }
  function buildFaces(i,p){
    const r=.255,L=1.22,faces=[];
    const add=(local,normal,type,theta=0)=>{const n=rotate(normal,p);if(n.y*.55+n.z*.83<-.015)return;const points=local.map(v=>world(v,p));const center=points.reduce((s,v)=>({x:s.x+v.x/points.length,y:s.y+v.y/points.length,z:s.z+v.z/points.length}),{x:0,y:0,z:0});faces.push({local,points,normal:n,type,theta,p,i,depth:center.y*.55+center.z*.83});};
    add([{x:-r,y:-L,z:0},{x:r,y:-L,z:0},{x:r,y:L,z:0},{x:-r,y:L,z:0}],{x:0,y:0,z:1},'flat');
    for(let k=0;k<12;k++){const a=k*PI/12,b=(k+1)*PI/12;add([{x:r*Math.cos(a),y:-L,z:-r*Math.sin(a)},{x:r*Math.cos(b),y:-L,z:-r*Math.sin(b)},{x:r*Math.cos(b),y:L,z:-r*Math.sin(b)},{x:r*Math.cos(a),y:L,z:-r*Math.sin(a)}],{x:Math.cos((a+b)/2),y:0,z:-Math.sin((a+b)/2)},'curve',(a+b)/2);}
    for(const sign of [-1,1]){const cap=[{x:r,y:sign*L,z:0}];for(let k=1;k<=12;k++)cap.push({x:r*Math.cos(k*PI/12),y:sign*L,z:-r*Math.sin(k*PI/12)});add(cap,{x:0,y:sign,z:0},'cap');}
    return faces;
  }
  function drawFace(face){
    const p=face.p,i=face.i,n=face.normal,pts=face.points.map(point=>projectStick(point,p));
    const light=clamp((n.x*-.35+n.y*-.4+n.z*.85)*.45+.62,.2,1.04),flat=face.type==='flat';
    const base=flat?[235,190,120]:face.type==='cap'?[189,134,73]:[153,89,43];
    const fill='rgb('+base.map(v=>Math.min(255,Math.round(v*light))).join(',')+')';
    ctx.save();path(pts);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=flat?'#dab07c90':'#87502c30';ctx.lineWidth=.55;ctx.stroke();ctx.clip();
    const localLine=local=>path(local.map(v=>projectStick(world(v,p),p)),false);
    if(flat){
      for(let k=0;k<18;k++){const x=-.25+k*.029;const line=[];for(let j=0;j<14;j++)line.push({x:x+Math.sin(j*.7+k+i)*.006,y:-1.22+j*.188,z:.001});localLine(line);ctx.strokeStyle=k%3?'#9155231b':'#fff4cc55';ctx.lineWidth=k%3?.55:.8;ctx.stroke();}
      for(const sy of [-.52,.5])for(const dir of [-1,1]){localLine([{x:-.095,y:sy-dir*.12,z:.004},{x:.095,y:sy+dir*.12,z:.004}]);ctx.strokeStyle='#7f421e';ctx.lineWidth=2.8*width/416*stickView(p).zoom;ctx.lineCap='round';ctx.stroke();}
      if(i===0){const dot=projectStick(world({x:0,y:.96,z:.006},p),p);const c1=projectStick(world({x:.046,y:.96,z:.006},p),p),c2=projectStick(world({x:0,y:1.012,z:.006},p),p);ctx.fillStyle='#af4e31';ctx.beginPath();ctx.ellipse(dot.x,dot.y,Math.max(1,Math.hypot(c1.x-dot.x,c1.y-dot.y)),Math.max(1,Math.hypot(c2.x-dot.x,c2.y-dot.y)),p.rz,0,TAU);ctx.fill();}
    }else if(face.type==='curve'){
      for(let k=0;k<3;k++){const theta=face.theta+(k-1)*.065;const line=[];for(let j=0;j<10;j++){const t=theta+Math.sin(j*.9+k+i)*.008;line.push({x:.256*Math.cos(t),y:-1.22+j*.273,z:-.256*Math.sin(t)});}localLine(line);ctx.strokeStyle=k===1?'#fff2bc19':'#4c27101c';ctx.lineWidth=.7;ctx.stroke();}
    }else{
      ctx.strokeStyle='#73401838';ctx.lineWidth=.7;for(let k=0;k<3;k++){const r=.1+k*.055;const line=[];for(let j=0;j<=10;j++){const a=j*PI/10;line.push({x:r*Math.cos(a),y:face.local[0].y,z:-r*Math.sin(a)-.01});}localLine(line);ctx.stroke();}
    }
    ctx.restore();
  }
  function motionEffects(poses){
    if(phase==='idle'||reduced)return;
    for(let i=0;i<4;i++){
      const land=landingAt(i),d=(elapsed-land)/240;
      if(d>=0&&d<1){const q=project({x:landingX(i),y:landingY(i),z:0});ctx.save();ctx.translate(q.x,q.y);ctx.scale(1,.6);ctx.strokeStyle=rgba('#dfc588',(1-d)*.65);ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,(18+d*20)*width/416,(18+d*20)*width/416,0,0,TAU);ctx.stroke();for(let j=0;j<5;j++){const a=j*TAU/5+i;ctx.fillStyle=rgba('#d29c51',(1-d)*.65);ctx.beginPath();ctx.arc(Math.cos(a)*(13+d*28)*width/416,Math.sin(a)*(13+d*28)*width/416,1.4*(1-d)*width/416,0,TAU);ctx.fill();}ctx.restore();}
      const p=poses[i];if(p.t>.1&&p.t<.87){ctx.save();ctx.globalAlpha=Math.sin(p.t*PI)*.25;ctx.strokeStyle='#fff8df';ctx.lineWidth=2.4;ctx.lineCap='round';const a=projectStick({x:p.x-.08,y:p.y,z:p.z-.4},p),b=projectStick({x:p.x-.12,y:p.y,z:p.z-.9},p);path([a,b],false);ctx.stroke();ctx.restore();}
    }
    const spark=clamp((elapsed-timing.reveal)/700);if(spark>0&&spark<1){ctx.save();for(let i=0;i<14;i++){const a=i*TAU/14,r=(38+ease(spark)*57)*width/416,cx=width*.5,cy=height*(thrower==='me'?.70:.31);const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.75;ctx.strokeStyle=rgba(i%3?'#dca243':'#fff3cf',Math.sin(PI*spark)*.8);ctx.lineWidth=i%2?2:3;ctx.lineCap='round';path([{x,y},{x:x+Math.cos(a)*7*(1-spark),y:y+Math.sin(a)*7*(1-spark)}],false);ctx.stroke();}ctx.restore();}
  }
  function decorations(){
    for(const [x,y,team,ids] of pieceTokens()){
      const p=project({x,y,z:.07}),r=scale*.225;
      if(ids.includes(ui.pieceId)){ctx.strokeStyle=team==='blue'?'#317bd7':'#d76351';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(p.x,p.y,r+5,0,TAU);ctx.stroke();}
      if(ids.length>1){ctx.fillStyle='#fff9eb';ctx.font='800 '+Math.max(12,scale*.28)+'px "Yut Sans",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(ids.length),p.x,p.y-1);}
    }
    if(ui.plan&&!busy&&!moving){
      const [x,y]=POINTS[ui.plan.target],p=project({x,y,z:.09}),r=Math.max(15,scale*.29);
      ctx.fillStyle=ui.game.active===0?'#3988ed24':'#e17d642b';ctx.strokeStyle=ui.game.active===0?'#286dd0':'#c45041';ctx.lineWidth=2.5;ctx.setLineDash([4,4]);ctx.beginPath();ctx.arc(p.x,p.y,r+3,0,TAU);ctx.fill();ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle=ui.game.active===0?'#174d92':'#943d30';ctx.font='800 14px "Yut Sans",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(ui.plan.target==='finish'?'✓':ui.plan.target==='base'?'−1':'•',p.x,p.y);
    }
  }
  function draw(){
    ctx.clearRect(0,0,width,height);ctx.save();let shake=0;
    for(let i=0;i<4;i++){const d=(elapsed-landingAt(i))/160;if(busy&&d>0&&d<1)shake+=Math.sin(d*TAU*2)*(1-d)*1.4*settings.impact;}
    background();tray();boardRoutes();
    ctx.save();ctx.translate(shake,shake*.55);ctx.globalAlpha=opacity;const poses=[0,1,2,3].map(pose);poses.forEach(stickShadow);motionEffects(poses);const faces=poses.flatMap((p,i)=>buildFaces(i,p));faces.sort((a,b)=>a.depth-b.depth).forEach(drawFace);ctx.restore();decorations();ctx.restore();
    canvas.dataset.phase=phase;canvas.dataset.thrower=thrower;canvas.dataset.result=result;
  }
  function size(){
    const slot=area.getBoundingClientRect();width=Math.max(100,Math.min(slot.width,slot.height/1.02));height=width*1.02;
    canvas.style.width=width+'px';canvas.style.height=height+'px';const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);scale=width/8.2;draw();
  }
  function update(next){ui={...ui,...next};if(!busy)opacity=ui.game.action===0?1:ui.game.pending.length>0?.12:.24;draw();}
  function cancel(){run++;cancelAnimationFrame(raf);busy=false;moving=null;if(resolvePending){resolvePending(false);resolvePending=null;}}
  async function animateThrow(player,outcome,bits){
    cancel();const generation=run;gatherFrom=[0,1,2,3].map(pose).map(p=>({...p,rx:Math.atan2(Math.sin(p.rx),Math.cos(p.rx)),ry:Math.atan2(Math.sin(p.ry),Math.cos(p.ry))}));
    const flightPlan=createThrowPlan(options.getThrowSettings?.());timing=flightPlan.timing;flights=flightPlan.sticks;
    if(window.NCQ_TEST_DICE)canvas.dataset.throwMotion=JSON.stringify(flightPlan);
    thrower=player===0?'me':'opponent';result=outcome;outcomes[result]={flat:bits};busy=true;phase='gather';elapsed=0;opacity=1;
    const duration=window.NCQ_TEST_DICE&&window.__yutFast?350:timing.end,speed=timing.end/duration;playLaunch((timing.launch-110)/speed/1000);
    let start=performance.now(),lastPhase='',revealed=false,clacked=[false,false,false,false],hiddenAt=0;
    const visibility=()=>{if(document.hidden)hiddenAt=performance.now();else if(hiddenAt){start+=performance.now()-hiddenAt;hiddenAt=0;}};
    document.addEventListener('visibilitychange',visibility);
    return new Promise(resolve=>{
      resolvePending=resolve;
      function frame(now){
        if(generation!==run){document.removeEventListener('visibilitychange',visibility);return;}
        if(document.hidden){raf=requestAnimationFrame(frame);return;}
        elapsed=Math.max(0,(now-start)*speed);
        phase=elapsed<timing.gather?'gather':elapsed<timing.launch?'charge':elapsed<lastLanding()?'flight':elapsed<timing.reveal?'settle':'result';
        if(phase!==lastPhase){lastPhase=phase;options.onPhase?.(phase);}
        for(let i=0;i<4;i++)if(elapsed>=landingAt(i)&&!clacked[i]){clacked[i]=true;playClack(i);}
        if(elapsed>=timing.reveal&&!revealed){revealed=true;playResult(OUTCOMES[result].extra);options.onReveal?.();}
        draw();if(elapsed<timing.end)raf=requestAnimationFrame(frame);else{busy=false;phase='result';resolvePending=null;document.removeEventListener('visibilitychange',visibility);draw();resolve(true);}
      }
      raf=requestAnimationFrame(frame);
    });
  }
  function animateMove(plan){
    cancel();const generation=run,points=[POINTS[plan.from],...plan.path.map(node=>POINTS[node])],duration=window.NCQ_TEST_DICE&&window.__yutFast?30:140;
    opacity=.05;moving={ids:plan.stackIds,player:plan.player,x:points[0][0],y:points[0][1]};const start=performance.now();let lastStep=-1;
    return new Promise(resolve=>{resolvePending=resolve;function frame(now){
      // The first frame timestamp can precede the input event's start time.
      if(generation!==run)return;const progress=clamp((now-start)/duration,0,points.length-1),index=Math.min(points.length-2,Math.floor(progress)),u=smooth(clamp(progress-index));
      moving.x=lerp(points[index][0],points[index+1][0],u);moving.y=lerp(points[index][1],points[index+1][1],u);
      if(index!==lastStep){lastStep=index;playStep();}draw();if(progress<points.length-1)raf=requestAnimationFrame(frame);else{moving=null;resolvePending=null;resolve(true);}
    }raf=requestAnimationFrame(frame);});
  }
  canvas.addEventListener('pointerup',event=>{
    if(ui.busy||busy||moving)return;const bounds=canvas.getBoundingClientRect(),x=(event.clientX-bounds.left)*width/bounds.width,y=(event.clientY-bounds.top)*height/bounds.height;
    if(ui.plan){const [tx,ty]=POINTS[ui.plan.target],target=project({x:tx,y:ty,z:.09});if(Math.hypot(target.x-x,target.y-y)<26){options.onMove?.();return;}}
    for(const [tx,ty,team,ids] of pieceTokens()){if((team==='blue'?0:1)!==ui.game.active)continue;const point=project({x:tx,y:ty,z:.07});if(Math.hypot(point.x-x,point.y-y)<25){options.onSelect?.(ids[0]);return;}}
  });
  new ResizeObserver(size).observe(area);size();
  return {update,animateThrow,animateMove,cancel,draw,projectNode:node=>project({x:POINTS[node][0],y:POINTS[node][1],z:.09})};
}
