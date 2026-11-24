import { POINTS, position, OUTCOMES } from './game.mjs';
import { t } from './i18n.mjs';
import { playLaunch, playClack, playResult, playStep, cancelMotionAudio } from './audio.mjs';
import { createThrowPlan, heightMagnification } from './throw-motion.mjs';
import { HOP_MS, HOP_CONTACT, RETURN_MS, RETURN_STAGGER_MS, hopPose, stackOffsets, returnPose } from './piece-motion.mjs';
import { paintPiece } from './piece-paint.mjs';
import { spriteBox, rackSpriteBox } from './skin-model.mjs';
import { paintSurface, paintBoardImage, overlapSurfaceSides } from './skin-paint.mjs';
import { TEAM_COLORS } from './team-colors.mjs';
import { localPlayerName } from './teams.mjs';
import { fitBoardLayout } from './board-layout.mjs';
import { STICK_RADIUS,STICK_HALF_LENGTH,STICK_SEGMENTS,STICK_VERTICES,convexHull } from './stick-geometry.mjs';
import { DEFAULT_STICK_PRESENTATION } from './stick-presentation.mjs';
export function createRenderer(canvas, options) {
  const ctx=canvas.getContext('2d'), area=canvas.parentElement;
  const interactive=options.interactive!==false;
  const stickPresentation=()=>options.getStickPresentation?.()??DEFAULT_STICK_PRESENTATION;
  const PI=Math.PI,TAU=PI*2,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>t*t*(3-2*t),ease=t=>1-Math.pow(1-t,3);
  const settings={impact:.85},reduced=false;
  let width=400,height=408,scale=49,scaleX=49,centerY=167,phase='idle',result='geol',thrower='me',elapsed=0,busy=false,gatherFrom=null;
  let ui={game:options.game,plans:[],pieceId:null,playableIds:[],busy:false},moving=null,opacity=1,raf=0,run=0,resolvePending=null,cleanupPending=null;
  const backdrop=document.createElement('canvas'),backdropCtx=backdrop.getContext('2d'),stage=area.closest('.game-stage');
  let cueRaf=0,cueEpoch=null,cuePaused=null,lastCueFrame=0,frontFaces=[],frontShake=0;
  function cueWave(now=performance.now()){return cueEpoch===null?0:(1-Math.cos(Math.max(0,now-cueEpoch)/1800*TAU))/2;}
  function cuesVisible(){return interactive&&!document.hidden&&!ui.busy&&!busy&&!moving&&ui.playableIds.length>0&&!area.closest('[hidden]')&&!document.querySelector('dialog[open]');}
  function paintFeedback(now=performance.now()){
    const wave=cueWave(now);stage?.style.setProperty('--cue-wave',wave.toFixed(4));destinationMarks(wave);pieceSelectionMarks(wave);drawPieces(wave);
    if(frontFaces.length){ctx.save();ctx.translate(frontShake,frontShake*.55);frontFaces.forEach(drawFace);ctx.restore();}
    if(window.NCQ_TEST_DICE)canvas.dataset.choiceCue=JSON.stringify({wave,scale:.96+wave*.12,alpha:.56+wave*.22,selectedScale:1,playableIds:ui.playableIds});
  }
  function syncCueLoop(){
    const now=performance.now();
    if(!cuesVisible()){
      cancelAnimationFrame(cueRaf);cueRaf=0;
      if(!ui.playableIds.length||ui.busy||busy||moving){cueEpoch=null;cuePaused=null;}
      else if(cueEpoch!==null&&cuePaused===null)cuePaused=now;
      return;
    }
    if(cueEpoch===null)cueEpoch=now;
    if(cuePaused!==null){cueEpoch+=now-cuePaused;cuePaused=null;}
    if(cueRaf)return;
    function frame(time){
      cueRaf=0;if(!cuesVisible()){syncCueLoop();return;}
      if(time-lastCueFrame>=1000/30){ctx.clearRect(0,0,width,height);ctx.drawImage(backdrop,0,0,width,height);paintFeedback(time);lastCueFrame=time;}
      cueRaf=requestAnimationFrame(frame);
    }
    cueRaf=requestAnimationFrame(frame);
  }
  const controlLayer=document.createElement('div'),controlButtons=new Map();
  controlLayer.className='board-controls';controlLayer.hidden=true;controlLayer.setAttribute('role','group');if(interactive)area.append(controlLayer);
  const flightCanvas=document.createElement('canvas'),flightCtx=flightCanvas.getContext('2d');
  flightCanvas.className='piece-flight-layer';flightCanvas.hidden=true;flightCanvas.setAttribute('aria-hidden','true');if(interactive)document.body.append(flightCanvas);
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
      if(!groups.has(key)){const [x,y]=POINTS[node];groups.set(key,[x,y,piece.player,[]]);}
      groups.get(key)[3].push(piece.id);
    }
    if(moving)groups.set('moving',[moving.x,moving.y,moving.player,moving.ids]);
    return Array.from(groups.values());
  }
  function project(p){const k=9/(9-p.y*.06+p.z*.06);return{x:width*.5+p.x*scaleX*k,y:centerY+(p.y-p.z*.66)*scale*k};}
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
  const appearance=()=>options.skins?.get()||{board:'default',sticks:'default',pieces:'default'};
  const skinTray={halfWidth:4.04,halfHeight:3.94,depth:0};
  let trayBoundsKey='';
  function publishTrayBounds(points,vertical={}){
    const bounds={left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y)),...vertical};
    const key=JSON.stringify({width,height,...bounds});
    if(key===trayBoundsKey)return;
    trayBoundsKey=key;
    if(window.NCQ_TEST_DICE)canvas.dataset.boardBounds=JSON.stringify(bounds);
    // Keep the frame stable while cards and results follow the visible tray,
    // rather than the unused space above and below it inside the canvas.
    if(interactive)options.onTrayBounds?.({top:bounds.top,bottom:height-bounds.bottom});
  }
  function trayExtent(){
    const id=appearance().board,image=options.skins?.image(id,'board');
    if(!image)return undefined;
    const info=options.skins?.record?.(id)?.assets.board;
    if(!info)return skinTray;
    const [x,y,w,h]=info.opaqueBounds;
    return{halfWidth:skinTray.halfWidth*Math.max(1-2*x/info.width,2*(x+w)/info.width-1),
      halfHeight:skinTray.halfHeight*Math.max(1-2*y/info.height,2*(y+h)/info.height-1),depth:0};
  }
  const pieceSkin=player=>options.skins?.sprite(player)||null;
  let stackLocale='',stackFormat;
  function stackLabel(count){const lang=document.documentElement.lang||'en';if(lang!==stackLocale){stackLocale=lang;stackFormat=new Intl.NumberFormat(lang);}return stackFormat.format(count);}
  const pieceOffsets=(count,r,player)=>pieceSkin(player)?.character?Array.from({length:count},()=>({x:0,y:0})):stackOffsets(count,r);
  function tray(){
    const id=appearance().board,image=options.skins?.image(id,'board');
    if(image){
      const {halfWidth:w,halfHeight:h}=skinTray;
      const quad=[[-w,-h],[w,-h],[w,h],[-w,h]].map(([x,y])=>project({x,y,z:0}));
      const extent=trayExtent(),points=[[-extent.halfWidth,-extent.halfHeight],[extent.halfWidth,-extent.halfHeight],[extent.halfWidth,extent.halfHeight],[-extent.halfWidth,extent.halfHeight]].map(([x,y])=>project({x,y,z:0}));
      const info=options.skins?.record?.(id)?.assets.board;
      const vertical=info?{top:lerp(quad[0].y,quad[3].y,info.opaqueBounds[1]/info.height),bottom:lerp(quad[0].y,quad[3].y,(info.opaqueBounds[1]+info.opaqueBounds[3])/info.height)}:{};
      publishTrayBounds(points,vertical);
      paintBoardImage(ctx,image,quad);return;
    }
    const corners=[[-3.78,-3.65], [3.78,-3.65],[3.78,3.65],[-3.78,3.65]];
    const top=corners.map(([x,y])=>project({x,y,z:0})),bottom=corners.map(([x,y])=>project({x,y,z:-.24}));
    publishTrayBounds([...top,...bottom]);
    ctx.save();ctx.shadowColor=rgba(color.shadow,.18);ctx.shadowBlur=18*width/416;ctx.shadowOffsetY=9;roundPolygon(bottom,20*width/416);ctx.fillStyle='#b5b0a6';ctx.fill();ctx.restore();
    roundPolygon(bottom,20*width/416);ctx.fillStyle='#c7c2b8';ctx.fill();
    roundPolygon(top,20*width/416);const rim=ctx.createLinearGradient(0,top[0].y,0,top[2].y);rim.addColorStop(0,'#ffffff');rim.addColorStop(.5,'#eeece6');rim.addColorStop(1,'#f8f7f3');ctx.fillStyle=rim;ctx.fill();ctx.strokeStyle='#c6c2b8';ctx.lineWidth=1;ctx.stroke();
    const inner=[[-3.48,-3.36],[3.48,-3.36],[3.48,3.36],[-3.48,3.36]].map(([x,y])=>project({x,y,z:.02}));
    ctx.save();roundPolygon(inner,14*width/416);ctx.clip();const surface=ctx.createLinearGradient(0,inner[0].y,0,inner[2].y);surface.addColorStop(0,'#ffffff');surface.addColorStop(.5,'#fffefb');surface.addColorStop(1,'#f9f8f3');ctx.fillStyle=surface;ctx.fillRect(0,0,width,height);
    ctx.restore();roundPolygon(inner,14*width/416);ctx.strokeStyle='#d9d6cd';ctx.lineWidth=1.4;ctx.stroke();
    const highlight=top.map(p=>({x:p.x,y:p.y-1}));roundPolygon(highlight,20*width/416);ctx.strokeStyle='#ffffffd0';ctx.lineWidth=1;ctx.stroke();
  }
  function boardRoutes(){
    const id=appearance().board,look=options.skins?.image(id,'board')?options.skins.look(id):null;
    const a=3.08,corners=[[-a,-a],[a,-a],[a,a],[-a,a]],node=(x,y,z=.045)=>project({x,y,z});
    ctx.save();ctx.lineWidth=1.5;ctx.strokeStyle=look?.route||'#a9aca4';path(corners.map(([x,y])=>node(x,y)));ctx.stroke();
    for(let i=0;i<2;i++){path([node(...corners[i]),node(...corners[i+2])],false);ctx.stroke();}
    const nodes=[];
    for(let edge=0;edge<4;edge++)for(let n=0;n<5;n++){const t=n/5,start=corners[edge],end=corners[(edge+1)%4];nodes.push({x:lerp(start[0],end[0],t),y:lerp(start[1],end[1],t),corner:n===0});}
    for(const [x,y] of corners)for(const t of [1/3,2/3])nodes.push({x:x*(1-t),y:y*(1-t)});
    nodes.push({x:0,y:0,corner:true});
    nodes.forEach((n,i)=>{
      const p=node(n.x,n.y),r=scale*(n.corner?.255:.115);ctx.save();ctx.shadowColor='#77766b20';ctx.shadowBlur=2;ctx.shadowOffsetY=1.5;
      const fill=ctx.createRadialGradient(p.x-r*.3,p.y-r*.4,1,p.x,p.y,r);fill.addColorStop(0,look?.node||'#ffffff');fill.addColorStop(1,look?.node||(n.corner?'#e8e6de':'#f0f1ec'));
      ctx.fillStyle=fill;ctx.strokeStyle=look?.edge||'#a4a79d';ctx.lineWidth=n.corner?1.8:1.2;ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.fill();ctx.stroke();ctx.restore();
      if(n.corner){ctx.strokeStyle=look?.medallion||'#ada897';ctx.lineWidth=.9;ctx.beginPath();ctx.arc(p.x,p.y,r*.74,0,TAU);ctx.stroke();for(let k=0;k<8;k++){const angle=k*TAU/8;ctx.beginPath();ctx.ellipse(p.x+Math.cos(angle)*r*.36,p.y+Math.sin(angle)*r*.36,r*.28,r*.10,angle,0,TAU);ctx.stroke();}ctx.fillStyle=look?.medallion||'#ada897';ctx.beginPath();ctx.arc(p.x,p.y,r*.12,0,TAU);ctx.fill();}
    });
    const start=node(a,a);ctx.font='600 '+Math.max(11,width*.025)+'px "Yut Sans","Yut Korean",sans-serif';ctx.textAlign='right';ctx.fillStyle=look?.text||'#7f847a';ctx.fillText(t('start'),start.x-17*width/448,start.y-18*width/448);
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
    const center=project({x:p.x,y:p.y,z:0}),presentation=stickPresentation();
    const dx=(presentation?.shadowX||0)*width/400,dy=(presentation?.shadowY||0)*width/400;
    center.x+=dx;center.y+=dy;
    const h=Math.max(0,p.h);let outline=null;
    ctx.save();ctx.filter='blur('+(2+h*1.4)*width/416+'px)';ctx.fillStyle=rgba('#59331c',.24/(1+h*.7));
    if(presentation?.shadowShape==='mesh'){
      // Drop the entire rotated mesh onto the board plane. A resting stick has
      // straight ends; a tumbling stick casts its actual changing silhouette.
      outline=convexHull(STICK_VERTICES.map(vertex=>{const point=world(vertex,p),floor=project({x:point.x,y:point.y,z:0});return{x:floor.x+dx,y:floor.y+dy};}));
      path(outline);
    }else{
      ctx.translate(center.x,center.y);ctx.rotate(p.rz);const s=1+h*.12;ctx.scale(1,.97);ctx.beginPath();ctx.ellipse(0,0,.33*scale*s,1.24*scale*s,0,0,TAU);
    }
    ctx.fill();ctx.restore();return{center,outline};
  }
  function buildFaces(i,p){
    const r=STICK_RADIUS,L=STICK_HALF_LENGTH,faces=[];
    const add=(local,normal,type,theta=0)=>{const n=rotate(normal,p);if(n.y*.55+n.z*.83<-.015)return;const points=local.map(v=>world(v,p));const center=points.reduce((s,v)=>({x:s.x+v.x/points.length,y:s.y+v.y/points.length,z:s.z+v.z/points.length}),{x:0,y:0,z:0});faces.push({local,points,normal:n,type,theta,p,i,depth:center.y*.55+center.z*.83});};
    add([{x:-r,y:-L,z:0},{x:r,y:-L,z:0},{x:r,y:L,z:0},{x:-r,y:L,z:0}],{x:0,y:0,z:1},'flat');
    for(let k=0;k<STICK_SEGMENTS;k++){const a=k*PI/STICK_SEGMENTS,b=(k+1)*PI/STICK_SEGMENTS;add([{x:r*Math.cos(a),y:-L,z:-r*Math.sin(a)},{x:r*Math.cos(b),y:-L,z:-r*Math.sin(b)},{x:r*Math.cos(b),y:L,z:-r*Math.sin(b)},{x:r*Math.cos(a),y:L,z:-r*Math.sin(a)}],{x:Math.cos((a+b)/2),y:0,z:-Math.sin((a+b)/2)},'curve',(a+b)/2);}
    for(const sign of [-1,1]){const cap=[{x:r,y:sign*L,z:0}];for(let k=1;k<=STICK_SEGMENTS;k++)cap.push({x:r*Math.cos(k*PI/STICK_SEGMENTS),y:sign*L,z:-r*Math.sin(k*PI/STICK_SEGMENTS)});add(cap,{x:0,y:sign,z:0},'cap');}
    return faces;
  }
  function drawFace(face){
    const p=face.p,i=face.i,n=face.normal,pts=face.points.map(point=>projectStick(point,p));
    const light=clamp((n.x*-.35+n.y*-.4+n.z*.85)*.45+.62,.2,1.04),flat=face.type==='flat';
    const id=appearance().sticks,texture=options.skins?.image(id,flat?'stick-flat':'stick-round'),look=texture?options.skins.look(id):null;
    const base=flat?[235,190,120]:face.type==='cap'?(look?.cap||[189,134,73]):[153,89,43];
    const fill='rgb('+base.map(v=>Math.min(255,Math.round(v*light))).join(',')+')';
    ctx.save();
    if(!texture||face.type==='cap'){
      path(pts);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=flat?'#dab07c90':'#87502c30';ctx.lineWidth=.55;ctx.stroke();
    }
    if(texture&&face.type!=='cap'){
      const sx=flat?0:(face.theta-PI/24)/PI*texture.naturalWidth,sw=flat?texture.naturalWidth:texture.naturalWidth/12;
      // Overlap only the long internal facet edges. No wood-colored underpaint
      // or mesh outline may show through a light glass/ivory texture.
      const surface=flat?pts:overlapSurfaceSides(pts);
      ctx.save();path(surface);ctx.clip();
      paintSurface(ctx,texture,pts,sx,sw);
      ctx.fillStyle=light<1?'rgba(0,0,0,'+(1-light)*.42+')':'rgba(255,255,255,'+(light-1)+')';path(surface);ctx.fill();ctx.restore();
    }
    path(texture&&face.type==='curve'?overlapSurfaceSides(pts):pts);ctx.clip();
    const localLine=local=>path(local.map(v=>projectStick(world(v,p),p)),false);
    if(flat){
      if(!texture)for(let k=0;k<18;k++){const x=-.25+k*.029;const line=[];for(let j=0;j<14;j++)line.push({x:x+Math.sin(j*.7+k+i)*.006,y:-1.22+j*.188,z:.001});localLine(line);ctx.strokeStyle=k%3?'#9155231b':'#fff4cc55';ctx.lineWidth=k%3?.55:.8;ctx.stroke();}
      if(i===0){
        // Keep the Back-do stamp on the marked stick's flat surface as it turns.
        const origin=projectStick(world({x:0,y:0,z:.006},p),p),x=projectStick(world({x:1,y:0,z:.006},p),p),y=projectStick(world({x:0,y:1,z:.006},p),p);
        ctx.save();ctx.transform(x.x-origin.x,x.y-origin.y,y.x-origin.x,y.y-origin.y,origin.x,origin.y);
        ctx.fillStyle=look?.flatMark||'#9b3f2c';ctx.font='900 .36px "Yut Lobby Sans","Yut Lobby Korean","Yut Lobby Thai",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
        const label=t('out_backdo'),letters=Array.from(label);
        if(letters.length<=2)letters.forEach((letter,j)=>ctx.fillText(letter,0,(j-(letters.length-1)/2)*.43,.42));
        else{ctx.rotate(-PI/2);ctx.fillText(label,0,0,1.92);}
        ctx.restore();
      }
    }else if(face.type==='curve'){
      if(!texture)for(let k=0;k<3;k++){const theta=face.theta+(k-1)*.065;const line=[];for(let j=0;j<10;j++){const t=theta+Math.sin(j*.9+k+i)*.008;line.push({x:.256*Math.cos(t),y:-1.22+j*.273,z:-.256*Math.sin(t)});}localLine(line);ctx.strokeStyle=k===1?'#fff2bc19':'#4c27101c';ctx.lineWidth=.7;ctx.stroke();}
      // Wrap both X marks around the round back, clipped to each visible facet.
      for(const sy of [-.52,.5])for(const dir of [-1,1]){
        const line=Array.from({length:13},(_,j)=>{const q=j/12,theta=PI/2+lerp(-.48,.48,q);return{x:.257*Math.cos(theta),y:sy+dir*lerp(-.12,.12,q),z:-.257*Math.sin(theta)};});
        localLine(line);ctx.lineCap='round';ctx.strokeStyle='#f3ce9633';ctx.lineWidth=4.2*width/416*stickView(p).zoom;ctx.stroke();
        ctx.strokeStyle=look?.mark||'#4d2915';ctx.lineWidth=2.8*width/416*stickView(p).zoom;ctx.stroke();
      }
    }else if(!texture){
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
  function destinationMarks(wave=0){
    if(ui.busy||busy||moving)return;
    for(const plan of ui.plans){
      const [x,y]=POINTS[plan.target],p=project({x,y,z:.045});
      const occupants=ui.game.pieces.filter(piece=>!['base','finish'].includes(position(piece))&&position(piece)===plan.target),occupied=occupants.length>0;
      const r=plan.target==='finish'?Math.max(14,Math.min(19,scale*.42)):Math.max(12,scale*(.37+Math.max(0,occupants.length-1)*.04));
      ctx.save();ctx.strokeStyle='#286dd0';ctx.lineWidth=2;ctx.setLineDash([4,3]);
      ctx.save();ctx.globalAlpha=.4+wave*.6;ctx.beginPath();ctx.arc(p.x,p.y,r*(.96+wave*.12),0,TAU);ctx.stroke();ctx.restore();ctx.setLineDash([]);
      // An occupied destination keeps its result badge outside the piece's rim.
      const tx=p.x+(occupied?r*.94:0),ty=p.y-(occupied?r*.94:0),font=Math.max(11,Math.min(14,scale*.34));
      const family='"Yut Sans","Yut Korean","Yut Thai",sans-serif';
      ctx.fillStyle='#174d92';ctx.font='800 '+font+'px '+family;ctx.textAlign='center';ctx.textBaseline='middle';
      if(plan.target==='finish'){
        // A vector check stays sharp without requiring a symbol font glyph.
        ctx.strokeStyle='#174d92';ctx.lineWidth=2.6;ctx.lineCap='round';ctx.lineJoin='round';
        path([{x:tx-5,y:ty},{x:tx-1,y:ty+4},{x:tx+6,y:ty-5}],false);ctx.stroke();
      }else{
        const text=t('out_'+plan.outcome),available=r*1.8;
        let lines=[text];
        // Keep longer localized names readable inside the destination ring.
        if(ctx.measureText(text).width>available*font/9){
          const letters=Array.from(text),middle=Math.ceil(letters.length/2);
          lines=text.includes('-')?text.split('-'):[letters.slice(0,middle).join(''),letters.slice(middle).join('')];
        }
        const fitted=Math.min(font,...lines.map(line=>font*available/Math.max(1,ctx.measureText(line).width)));
        ctx.font='800 '+fitted+'px '+family;
        lines.forEach((line,index)=>{
          const y=ty+(index-(lines.length-1)/2)*fitted*1.05;
          ctx.strokeStyle='#102a4a';ctx.lineWidth=Math.max(2.6,fitted*.24);ctx.lineJoin='round';
          ctx.strokeText(line,tx,y);ctx.fillStyle='#fffce3';ctx.fillText(line,tx,y);
        });
      }
      ctx.restore();
    }
  }
  function pieceSelectionMarks(wave=0){
    if(ui.busy||busy||moving)return;
    for(const [x,y,team,ids] of pieceTokens()){
      const p=project({x,y,z:.07}),r=scale*.225;
      if(ids.some(id=>ui.playableIds.includes(id))){
        const zoom=.96+wave*.12;
        if(!ids.includes(ui.pieceId)){
          ctx.save();ctx.globalAlpha=.56+wave*.22;ctx.fillStyle='#39ff14';
          ctx.beginPath();ctx.ellipse(p.x,p.y,r*(1.30+(ids.length-1)*.12)*zoom,r*(1.30+(ids.length-1)*.18)*zoom,-.2,0,TAU);ctx.fill();ctx.restore();
        }
        if(ids.includes(ui.pieceId)){
          ctx.save();ctx.globalAlpha=.55+wave*.45;
          ctx.shadowColor='#eaff00b0';ctx.shadowBlur=10;
          ctx.beginPath();ctx.ellipse(p.x,p.y,r*(1.45+(ids.length-1)*.12),r*(1.45+(ids.length-1)*.18),-.2,0,TAU);
          ctx.strokeStyle='#435500b0';ctx.lineWidth=4.6;ctx.stroke();
          ctx.strokeStyle='#f2ff00';ctx.lineWidth=2.8;ctx.stroke();ctx.restore();
        }
      }
    }
  }
  function drawPieces(wave=0){
    const disks=[];
    for(const [x,y,team,ids] of pieceTokens()){
      const p=project({x,y,z:.07}),r=scale*.225;
      const motion=moving&&ids===moving.ids?moving.pose:null,player=team;
      const skin=pieceSkin(player),offsets=pieceOffsets(ids.length,r,player);
      for(let index=0;index<ids.length;index++){
        const token={x:p.x+offsets[index].x,y:p.y+offsets[index].y,r,player,lift:(motion?.lift||0)*scale,zoom:motion?.zoom??1,sx:motion?.sx??1,sy:motion?.sy??1,selected:!ui.busy&&!busy&&!moving&&ids.includes(ui.pieceId)&&ids.some(id=>ui.playableIds.includes(id))};
        if(!skin?.character||index===0)paintPiece(ctx,{...token,skin,stackCount:ids.length,stackLabel:skin?.character&&ids.length>1?stackLabel(ids.length):String(ids.length)});
        disks.push({id:ids[index],...token,skin:skin?.id||'default',representative:!skin?.character||index===0,stackCount:ids.length});
      }
    }
    if(moving?.impact>0){
      const p=project({x:moving.x,y:moving.y,z:.04}),q=moving.impact;
      ctx.save();ctx.strokeStyle=rgba(TEAM_COLORS[moving.player].main,(1-q)*.6);ctx.lineWidth=1.6;
      ctx.beginPath();ctx.ellipse(p.x,p.y+2,scale*(.25+q*.32),scale*(.19+q*.2),0,0,TAU);ctx.stroke();
      for(let i=0;i<5;i++){const angle=i*TAU/5;ctx.fillStyle=rgba('#d7b875',(1-q)*.8);ctx.beginPath();ctx.arc(p.x+Math.cos(angle)*scale*(.2+q*.38),p.y+Math.sin(angle)*scale*(.12+q*.22),1.5*(1-q),0,TAU);ctx.fill();}ctx.restore();
    }
    if(window.NCQ_TEST_DICE)canvas.dataset.pieceDisks=JSON.stringify(disks);
  }
  function friendlyDestination(plan){return !['base','finish'].includes(plan.target)&&ui.game.pieces.some(piece=>piece.player===plan.player&&position(piece)===plan.target);}
  function pieceControlSize(count,player=ui.game.active){
    const r=scale*.225,minimum=Math.max(22,Math.min(34,scale*.68)),skin=pieceSkin(player);
    if(skin?.character){const box=spriteBox(skin,r);return{width:Math.max(minimum,box.visibleWidth+8),height:Math.max(minimum,box.visibleHeight+8),dx:box.visibleLeft+box.visibleWidth/2,dy:box.visibleTop+box.visibleHeight/2};}
    return{width:Math.max(minimum,r*(2+(count-1)*.34)+8),height:Math.max(minimum,r*(2+(count-1)*.42)+8),dx:0,dy:0};
  }
  function stackControl(plan,used){
    const [x,y]=POINTS[plan.target],point=project({x,y,z:.07}),text=t('stackAction'),selectText=t('selectAction'),font=Math.max(11,Math.min(14,scale*.34));
    ctx.save();ctx.font='850 '+font+'px "Yut Lobby Sans","Yut Lobby Korean","Yut Lobby Thai",sans-serif';
    const w=Math.max(60,Math.ceil(ctx.measureText(text).width)+26),sw=Math.max(60,Math.ceil(ctx.measureText(selectText).width)+26),h=matchMedia('(pointer:coarse)').matches?44:38;ctx.restore();
    const tokens=pieceTokens().map(([x,y,team,ids])=>{const point=project({x,y,z:.07}),hit=pieceControlSize(ids.length,team);return{x:point.x+hit.dx,y:point.y+hit.dy,...hit};});
    const destinations=ui.plans.filter(other=>other.target!==plan.target).map(other=>{const [x,y]=POINTS[other.target];return{...project({x,y,z:.09}),width:34,height:34};});
    const own=pieceControlSize(ui.game.pieces.filter(piece=>piece.player===plan.player&&position(piece)===plan.target).length,plan.player),gap=own.width+16,total=w+gap+sw;
    point.x+=own.dx;point.y+=own.dy;
    const dy=h/2+(own?.height||34)/2+10,sx=point.x>width/2?-1:1,sy=point.y>height/2?-1:1;
    const candidates=[[0,0],[0,sy*dy],[0,-sy*dy],[sx*total/2,sy*dy],[sx*total/2,-sy*dy],[0,sy*dy*2],[0,-sy*dy*2]];
    const overlap=(a,b)=>Math.max(0,(a.width+b.width)/2+5-Math.abs(a.x-b.x))*Math.max(0,(a.height+b.height)/2+5-Math.abs(a.y-b.y));
    const scored=candidates.map(([dx,dy],index)=>{
      const centerX=clamp(point.x+dx,total/2+4,width-total/2-4),centerY=clamp(point.y+dy,h/2+7,height-h/2-9);
      const left={x:centerX-total/2+w/2,y:centerY,width:w,height:h},right={x:centerX+total/2-sw/2,y:centerY,width:sw,height:h};
      const intersections=[...tokens,...destinations,...used].reduce((sum,box)=>sum+overlap(left,box)+overlap(right,box),0);
      return {left,right,score:intersections*100+index};
    }).sort((a,b)=>a.score-b.score);
    const best=scored[0];used.push(best.left,best.right);
    const piece=ui.game.pieces.find(piece=>piece.player===plan.player&&position(piece)===plan.target);
    return {...best.left,text,select:{...best.right,text:selectText,pieceId:piece.id}};
  }
  function syncBoardControls(){
    if(!interactive)return;
    controlLayer.hidden=ui.busy||busy||!!moving||ui.plans.length===0;
    if(controlLayer.hidden){controlLayer.replaceChildren();controlButtons.clear();return;}
    controlLayer.setAttribute('aria-label',t('moveHint'));
    const bounds=canvas.getBoundingClientRect(),slot=area.getBoundingClientRect(),wanted=new Set(),stackControls=[];
    const diameter=Math.max(22,Math.min(34,scale*.68));
    function button(key,point,kind,label,text,activate){
      wanted.add(key);let element=controlButtons.get(key);
      if(!element){element=document.createElement('button');element.type='button';element.addEventListener('click',activate);controlButtons.set(key,element);controlLayer.append(element);}
      element.className=kind;element.textContent=text;element.setAttribute('aria-label',label);element.dataset.player=String(ui.game.active);
      element.style.left=(bounds.left-slot.left+point.x*bounds.width/width)+'px';element.style.top=(bounds.top-slot.top+point.y*bounds.height/height)+'px';
      element.style.width=diameter+'px';element.style.height=diameter+'px';element.style.fontSize=Math.max(11,Math.min(14,scale*.34))+'px';
      return element;
    }
    for(const [x,y,team,ids] of pieceTokens()){
      const player=team;if(player!==ui.game.active)continue;
      const label=localPlayerName(ui.game,player)+' · '+t('piece',{n:ids[0]%4+1})+(ids.length>1?' · '+t('stack',{n:ids.length}):'');
      const hit=pieceControlSize(ids.length,player),point=project({x,y,z:.07});point.x+=hit.dx;point.y+=hit.dy;
      const element=button('piece:'+ids[0],point,'board-piece-select',label,'',()=>options.onSelect?.(ids[0]));
      element.style.width=hit.width+'px';element.style.height=hit.height+'px';
      element.dataset.boardPiece=String(ids[0]);element.setAttribute('aria-pressed',String(ids.includes(ui.pieceId)));
    }
    for(const plan of ui.plans){
      const [x,y]=POINTS[plan.target],move=plan.steps<0?t('backward'):t('move',{n:plan.steps});
      const stack=friendlyDestination(plan)?stackControl(plan,stackControls):null;
      const finish=plan.target==='finish',occupant=ui.game.pieces.find(piece=>piece.player!==plan.player&&position(piece)===plan.target);
      const captureHit=occupant&&pieceSkin(occupant.player)?.character?pieceControlSize(1,occupant.player):null;
      const target=project({x,y,z:.09});if(captureHit){target.x+=captureHit.dx;target.y+=captureHit.dy;}
      const element=button('move:'+plan.pieceId+':'+plan.resultId,stack||target,'move-target'+(stack?' stack-target':'')+(finish?' finish-target':''),t('out_'+plan.outcome)+' · '+(stack?t('stackAction'):finish?t('finishAction'):move),stack?.text||'',()=>options.onMove?.(plan.resultId));
      if(captureHit){element.style.width=captureHit.width+'px';element.style.height=captureHit.height+'px';}
      if(finish){const hit=Math.max(30,Math.min(44,scale*.9));element.style.width=hit+'px';element.style.height=hit+'px';}
      if(stack){
        element.style.width=stack.width+'px';element.style.height=stack.height+'px';element.dataset.pair=plan.target;
        const choice=button('choose-target:'+plan.pieceId+':'+plan.resultId,stack.select,'select-target',stack.select.text+' · '+t('piece',{n:stack.select.pieceId%4+1}),stack.select.text,()=>options.onSelect?.(stack.select.pieceId));
        choice.style.width=stack.select.width+'px';choice.style.height=stack.select.height+'px';choice.dataset.pair=plan.target;choice.dataset.selectPiece=String(stack.select.pieceId);
      }
      element.dataset.resultId=String(plan.resultId);element.dataset.target=plan.target;
    }
    for(const [key,element] of controlButtons)if(!wanted.has(key)){element.remove();controlButtons.delete(key);}
  }
  function draw(){
    // Refit when a decoded skin changes, even if the play slot did not resize.
    ({scaleX,scale,centerY}=fitBoardLayout(width,height,trayExtent()));
    ctx.clearRect(0,0,width,height);ctx.save();let shake=0;
    for(let i=0;i<4;i++){const d=(elapsed-landingAt(i))/160;if(busy&&d>0&&d<1)shake+=Math.sin(d*TAU*2)*(1-d)*1.4*settings.impact;}
    background();tray();boardRoutes();
    const foreground=stickPresentation().foreground===true&&phase!=='idle'&&opacity===1;
    ctx.save();ctx.translate(shake,shake*.55);ctx.globalAlpha=opacity;const poses=[0,1,2,3].map(pose),shadows=poses.map(stickShadow);motionEffects(poses);const faces=poses.flatMap((p,i)=>buildFaces(i,p)).sort((a,b)=>a.depth-b.depth);
    frontFaces=foreground?faces:[];frontShake=shake;if(!foreground)faces.forEach(drawFace);ctx.restore();
    if(backdrop.width!==canvas.width||backdrop.height!==canvas.height){backdrop.width=canvas.width;backdrop.height=canvas.height;}
    backdropCtx.clearRect(0,0,backdrop.width,backdrop.height);backdropCtx.drawImage(canvas,0,0);paintFeedback();ctx.restore();
    canvas.dataset.phase=phase;canvas.dataset.thrower=thrower;canvas.dataset.result=result;
    if(window.NCQ_TEST_DICE){canvas.dataset.stickLayer=foreground?'above-pieces':'below-pieces';canvas.dataset.stickShadows=JSON.stringify(shadows.map(shadow=>shadow.center));canvas.dataset.stickShadowContours=JSON.stringify(shadows.map(shadow=>shadow.outline));canvas.dataset.stickOpacity=String(opacity);}
    syncBoardControls();syncCueLoop();
  }
  function resize(w,h,dpr=Math.min(devicePixelRatio||1,2)){
    ({width,height,scaleX,scale,centerY}=fitBoardLayout(w,h));
    canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();
  }
  function size(){
    const slot=area.getBoundingClientRect();resize(slot.width,slot.height);
  }
  function update(next){ui={...ui,...next};if(!busy)opacity=ui.game.action===0?1:ui.game.pending.length>0?.12:.24;draw();}
  function cancel(){cancelMotionAudio();run++;cancelAnimationFrame(raf);cancelAnimationFrame(cueRaf);cueRaf=0;cleanupPending?.();cleanupPending=null;busy=false;moving=null;if(resolvePending){resolvePending(false);resolvePending=null;}}
  function reset(){cancel();phase='idle';result='geol';thrower='me';elapsed=0;gatherFrom=null;opacity=1;draw();}
  function restoreThrow(roll){
    if(!roll){reset();return;}
    cancel();phase='idle';result=roll.outcome;outcomes[result]={flat:roll.bits};thrower=roll.player===0||roll.player===3?'me':'opponent';
    gatherFrom=[0,1,2,3].map(pose);phase='result';elapsed=timing.end;draw();
  }
  async function animateThrow(player,outcome,bits){
    cancel();const generation=run;gatherFrom=[0,1,2,3].map(pose).map(p=>({...p,rx:Math.atan2(Math.sin(p.rx),Math.cos(p.rx)),ry:Math.atan2(Math.sin(p.ry),Math.cos(p.ry))}));
    const flightPlan=createThrowPlan(options.getThrowSettings?.());timing=flightPlan.timing;flights=flightPlan.sticks;
    if(window.NCQ_TEST_DICE)canvas.dataset.throwMotion=JSON.stringify(flightPlan);
    thrower=player===0||player===3?'me':'opponent';result=outcome;outcomes[result]={flat:bits};busy=true;phase='gather';elapsed=0;opacity=1;
    const duration=window.NCQ_TEST_DICE&&window.__yutFast?350:Math.min(timing.end,options.getMaxThrowDuration?.()??Infinity),speed=timing.end/duration;playLaunch((timing.launch-110)/speed/1000);
    let start=performance.now(),lastPhase='',revealed=false,clacked=[false,false,false,false],hiddenAt=0;
    const visibility=()=>{if(document.hidden)hiddenAt=performance.now();else if(hiddenAt){start+=performance.now()-hiddenAt;hiddenAt=0;}};
    document.addEventListener('visibilitychange',visibility);
    cleanupPending=()=>document.removeEventListener('visibilitychange',visibility);
    return new Promise(resolve=>{
      resolvePending=resolve;
      function frame(now){
        if(generation!==run){document.removeEventListener('visibilitychange',visibility);return;}
        if(document.hidden){raf=requestAnimationFrame(frame);return;}
        elapsed=Math.max(0,(now-start)*speed);
        phase=elapsed<timing.gather?'gather':elapsed<timing.launch?'charge':elapsed<lastLanding()?'flight':elapsed<timing.reveal?'settle':'result';
        if(phase!==lastPhase){lastPhase=phase;options.onPhase?.(phase);}
        for(let i=0;i<4;i++)if(elapsed>=landingAt(i)&&!clacked[i]){clacked[i]=true;playClack(i);}
        if(elapsed>=timing.reveal&&!revealed){revealed=true;playResult(!ui.game.opening&&OUTCOMES[result].extra);options.onReveal?.();}
        draw();if(elapsed<timing.end)raf=requestAnimationFrame(frame);else{busy=false;phase='result';resolvePending=null;cleanupPending?.();cleanupPending=null;draw();resolve(true);}
      }
      raf=requestAnimationFrame(frame);
    });
  }
  function animateMove(plan,{onContact=()=>true}={}){
    cancel();const generation=run,points=[POINTS[plan.from],...plan.path.map(node=>POINTS[node])],fast=window.NCQ_TEST_DICE&&window.__yutFast;
    const stepMs=fast?30:HOP_MS,returnMs=fast?90:RETURN_MS,stagger=fast?8:RETURN_STAGGER_MS;
    opacity=.05;moving={ids:plan.stackIds,player:plan.player,x:points[0][0],y:points[0][1],pose:hopPose(0),impact:0};
    let started,hiddenAt=0,contacted=false,contacts=0,returnStart=0,arrivals=[];
    const visibility=()=>{if(document.hidden)hiddenAt=performance.now();else if(hiddenAt){if(started!==undefined)started+=performance.now()-hiddenAt;hiddenAt=0;}};
    document.addEventListener('visibilitychange',visibility);
    cleanupPending=()=>{document.removeEventListener('visibilitychange',visibility);for(const element of arrivals)element.removeAttribute('data-piece-arriving');flightCanvas.hidden=true;};
    function drawReturns(time){
      const host=(canvas.closest('.game-stage')||area).getBoundingClientRect();
      flightCanvas.style.left=host.left+'px';flightCanvas.style.top=host.top+'px';flightCanvas.style.width=host.width+'px';flightCanvas.style.height=host.height+'px';
      const bounds=flightCanvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
      if(flightCanvas.width!==Math.round(bounds.width*dpr)||flightCanvas.height!==Math.round(bounds.height*dpr)){flightCanvas.width=Math.round(bounds.width*dpr);flightCanvas.height=Math.round(bounds.height*dpr);}
      flightCtx.setTransform(dpr,0,0,dpr,0,0);flightCtx.clearRect(0,0,bounds.width,bounds.height);
      const board=canvas.getBoundingClientRect(),p=project({x:POINTS[plan.target][0],y:POINTS[plan.target][1],z:.07}),r=scale*.225,capturedPlayer=ui.game.pieces[plan.captured[0]]?.player,skin=pieceSkin(capturedPlayer),offsets=pieceOffsets(plan.captured.length,r,capturedPlayer),poses=[];
      for(let index=0;index<plan.captured.length;index++){
        const element=arrivals[index],rect=element?.getBoundingClientRect();if(!rect?.width)continue;
        const from={x:board.left+(p.x+offsets[index].x)*board.width/width,y:board.top+(p.y+offsets[index].y)*board.height/height,r:r*board.width/width};
        const rackSize=parseFloat(getComputedStyle(element).getPropertyValue('--size'))||24,rack=skin?rackSpriteBox(skin,rackSize):{dx:0,dy:0,r:rackSize/2};
        const to={x:rect.left+rect.width/2+rack.dx,y:rect.top+rect.height/2+rack.dy,r:rack.r,alpha:parseFloat(getComputedStyle(element.closest('.player-card')).opacity)||1};
        const progress=clamp((time-index*stagger)/returnMs),pose=returnPose(from,to,progress);
        if(progress<1)paintPiece(flightCtx,{...pose,x:pose.x-bounds.left,y:pose.y-bounds.top,player:ui.game.pieces[plan.captured[index]].player,skin});
        else element.removeAttribute('data-piece-arriving');
        poses.push({id:plan.captured[index],progress,...pose,to});
      }
      if(window.NCQ_TEST_DICE)flightCanvas.dataset.flights=JSON.stringify(poses);
    }
    return new Promise(resolve=>{resolvePending=resolve;function frame(now){
      if(generation!==run)return;if(document.hidden){raf=requestAnimationFrame(frame);return;}
      if(started===undefined)started=now;
      const time=Math.max(0,now-started),progress=Math.min(points.length-1,time/stepMs),index=Math.min(points.length-2,Math.floor(progress)),local=clamp(progress-index),pose=hopPose(local);
      moving.x=lerp(points[index][0],points[index+1][0],pose.advance);moving.y=lerp(points[index][1],points[index+1][1],pose.advance);moving.pose=pose;
      while(contacts<points.length-1&&time>=(contacts+HOP_CONTACT)*stepMs){contacts++;playStep(contacts-1,contacts===points.length-1);}
      moving.impact=local>=HOP_CONTACT?(local-HOP_CONTACT)/(1-HOP_CONTACT):0;
      if(!contacted&&contacts===points.length-1){
        contacted=true;returnStart=time;
        // Commit once at contact. Reloading during the flight keeps the capture.
        if(onContact()===false||generation!==run){if(generation===run)cancel();return;}
        if(!['base','finish'].includes(plan.target))moving.ids=ui.game.pieces.filter(piece=>piece.player===plan.player&&position(piece)===plan.target).map(piece=>piece.id);
        arrivals=plan.captured.map(id=>options.getPieceElement?.(id));
        for(const element of arrivals)element?.setAttribute('data-piece-arriving','');
        flightCanvas.hidden=arrivals.length===0;
      }
      if(contacted&&arrivals.length)drawReturns(time-returnStart);
      if(window.NCQ_TEST_DICE){canvas.dataset.moveStep=String(index);canvas.dataset.moveContacts=String(contacts);canvas.dataset.movePose=JSON.stringify(pose);canvas.dataset.movePhase=contacted&&arrivals.length?'return':local<HOP_CONTACT?'hop':'contact';}
      draw();
      const ended=progress>=points.length-1&&(!arrivals.length||time-returnStart>=returnMs+(arrivals.length-1)*stagger);
      if(!ended)raf=requestAnimationFrame(frame);else{cleanupPending?.();cleanupPending=null;moving=null;resolvePending=null;draw();resolve(true);}
    }raf=requestAnimationFrame(frame);});
  }
  // A static view shares every paint/projection function, but creates no game
  // controls, audio, input listeners, observers or animation loop.
  if(!interactive){
    resize(400,408);
    const preview=options.preview?{previewFrame({progress=1,alpha=1,player=0,outcome='geol',bits=[0,1,1,1]}){
      phase='idle';result=outcome;outcomes[result]={flat:bits};thrower=player===0||player===3?'me':'opponent';gatherFrom=[0,1,2,3].map(pose);
      elapsed=clamp(progress)*timing.end;opacity=clamp(alpha);busy=progress<1;
      phase=elapsed<timing.gather?'gather':elapsed<timing.launch?'charge':elapsed<lastLanding()?'flight':elapsed<timing.reveal?'settle':'result';
      draw();return{phase,duration:timing.end};
    }}:{};
    return{update,draw,resize,...preview};
  }
  canvas.addEventListener('pointerup',event=>{
    if(ui.busy||busy||moving)return;const bounds=canvas.getBoundingClientRect(),x=(event.clientX-bounds.left)*width/bounds.width,y=(event.clientY-bounds.top)*height/bounds.height;
    // Selecting an owned piece must never spend a result, even at a destination.
    for(const [tx,ty,team,ids] of pieceTokens()){
      if(team!==ui.game.active)continue;const point=project({x:tx,y:ty,z:.07}),hit=pieceControlSize(ids.length,team);point.x+=hit.dx;point.y+=hit.dy;
      if(Math.abs(point.x-x)<=hit.width/2&&Math.abs(point.y-y)<=hit.height/2){options.onSelect?.(ids[0]);return;}
    }
    const nearest=ui.plans.filter(plan=>!friendlyDestination(plan)).map(plan=>{
      const [tx,ty]=POINTS[plan.target],target=project({x:tx,y:ty,z:.09}),occupant=ui.game.pieces.find(piece=>piece.player!==plan.player&&position(piece)===plan.target);
      const hit=occupant&&pieceSkin(occupant.player)?.character?pieceControlSize(1,occupant.player):null;
      if(hit){target.x+=hit.dx;target.y+=hit.dy;if(Math.abs(target.x-x)<=hit.width/2&&Math.abs(target.y-y)<=hit.height/2)return{plan,distance:0};}
      return{plan,distance:Math.hypot(target.x-x,target.y-y)};
    }).sort((a,b)=>a.distance-b.distance)[0];
    if(nearest?.distance<26){options.onMove?.(nearest.plan.resultId);return;}
  });
  new ResizeObserver(size).observe(area);size();
  document.addEventListener('visibilitychange',syncCueLoop);
  new MutationObserver(syncCueLoop).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden','open']});
  return {update,animateThrow,animateMove,cancel,reset,restoreThrow,draw,projectNode:node=>project({x:POINTS[node][0],y:POINTS[node][1],z:.09})};
}
