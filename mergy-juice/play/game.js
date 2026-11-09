'use strict';
(()=>{
const $=id=>document.getElementById(id),c=$('game'),g=c.getContext('2d'),W=720,H=1280,SCENE_Y=40;
const colors=['#ffc137','#fa6467','#39bcdc','#91c735','#ef7fa9','#b18ae0','#ff9746','#62d4bc','#f5afce','#e8c078','#ffdc6d'];
const fruits=['🍋','🍒','🫐','🥝','🍓','🍇','🍊','🍍','🍑','🥥','🥭'];
const names=['레몬 샷','체리 에이드','블루 라군','키위 쿨러','베리 선셋','그레이프 피즈','트로피컬 펀치','파라다이스','피치 블룸','코코넛 드림','망고 로열'];
const TIER_COUNT=names.length;
const juiceImages=Array(TIER_COUNT).fill(null);
const MERGE_SHRINK_SECONDS=.05;
const physics={rebound:84,slide:65,shake:70,knockback:35,snap:45,placedPush:50,collisionHeight:28,collisionWidth:96,objectScale:80,moveSpeed:100};
try{const saved=JSON.parse(localStorage.getItem('mergy-juice-physics'));for(const key of Object.keys(physics)){if(saved&&Number.isFinite(saved[key]))physics[key]=Math.max(0,Math.min(key==='moveSpeed'?200:100,saved[key]));}}catch(error){}
function restitution(){return Math.min(.98,physics.rebound/100);}
function slideDrag(){return Math.max(.6,6-physics.slide*.06);}
function knockbackSpeed(speed){return speed>65?Math.min(240,speed*.45)*physics.knockback/100:0;}
function limitImpactSpeed(o){const speed=Math.hypot(o.vx,o.vy);if(speed>1100){o.vx*=1100/speed;o.vy*=1100/speed;}}
function objectScale(){return physics.objectScale/100;}
function moveRate(){return physics.moveSpeed/100;}
function displayedSize(t){const size=imageSize(t),scale=objectScale();return {width:size.width*scale,height:size.height*scale};}
function shakeScale(){return physics.shake/70;}
function setupPhysicsControls(){for(const key of Object.keys(physics)){const input=$(key),output=$(key+'Value');input.value=physics[key];output.textContent=physics[key]+'%';input.addEventListener('input',()=>{physics[key]=Math.max(0,Math.min(key==='moveSpeed'?200:100,Number(input.value)));output.textContent=physics[key]+'%';try{localStorage.setItem('mergy-juice-physics',JSON.stringify(physics));}catch(error){}});}}

let shadowImage=null,tableImage=null,beachImage=null,beachAltImage=null;
const BEACH_INTERVAL_MS=120000,BEACH_BLEND_MS=3000,beachStart=performance.now();
let assetsReady=false;
let snaps=[];
let previewBorn=0;
const PREVIEW_TWEEN_SECONDS=.25,PREVIEW_BACK_OFFSET=15;
function previewY(){const t=Math.max(0,Math.min(1,(clock-previewBorn)/PREVIEW_TWEEN_SECONDS));const eased=1-Math.pow(1-t,3);return 1010+PREVIEW_BACK_OFFSET*(1-eased);}
let objects=[],particles=[],rings=[],floaters=[],current=0,next=0,score=0,stage=1,discovered=2,shots=0,aim=null,paused=false,ended=false,lock=0,clock=0,sound=true,audio,best=0,saveTimer=0,installPrompt;
try{best=+localStorage.getItem('mergy-juice-best')||0;const s=JSON.parse(localStorage.getItem('mergy-juice-save'));if(s&&s.version===1){({score,stage,current,next,discovered,shots}=s);objects=s.objects.filter(o=>Number.isFinite(o.x)&&Number.isFinite(o.y)&&o.t>=0&&o.t<TIER_COUNT).map(o=>({...o,vx:0,vy:0,born:-10}));}}catch(e){}
function resize(){const scale=Math.min(innerWidth/W,innerHeight/H);$('app').style.transform=`scale(${scale})`;}
addEventListener('resize',resize);resize();
function radius(t){return 23+t*3.5;}
// Gameplay dimensions are native image pixels in the 720x1280 gameplay coordinates.
// Only camera perspective and whole-app screen scaling affect their display size.
function imageSize(t){const image=juiceImages[t];return image?{width:image.naturalWidth,height:image.naturalHeight}:{width:2*(radius(t)+12),height:48+t*6+62+(t>=4?16:0)};}
function curvedContactNormal(dx,dy,horizontal,width,height){
 // The glass center is 50% of its width. Edge hits lean the contact normal outward.
 if(!horizontal){const nx=Math.max(-.85,Math.min(.85,dx/Math.max(1,width)*.9));return {x:nx,y:(dy>=0?1:-1)*Math.sqrt(1-nx*nx)};}
 const ny=Math.max(-.6,Math.min(.6,dy/Math.max(1,height)*.6));return {x:(dx>=0?1:-1)*Math.sqrt(1-ny*ny),y:ny};
}
function inverseMass(t){const size=imageSize(t),base=imageSize(0);return 1/Math.max(1,Math.min(3.5,Math.sqrt(size.width*size.height/(base.width*base.height))));}
function impact(o,speed,tilt){if(speed<65)return;o.hitAt=clock;o.hitPower=Math.min(1,speed/650);o.hitTilt=tilt;saveTimer=.7;}
function collider(o){const size=displayedSize(o.t),s=persp(o.y),height=physics.collisionHeight/100,width=physics.collisionWidth/100;return {x:360+o.x*s,y:o.y-size.height*s*height/2,width:size.width*s*width,height:size.height*s*height,scale:s};}
function topLimit(t){let y=407;for(let i=0;i<8;i++)y=381+displayedSize(t).height*persp(y);return y;}
function launchX(x){const half=displayedSize(current).width*persp(1006)/2;return Math.max(360-282*persp(1006)+half,Math.min(360+282*persp(1006)-half,x));}
async function loadNativeImage(src){
 const image=new Image();
 if(location.protocol==='file:')image.src=src;
 else{const response=await fetch(src,{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}: ${src}`);image.src=URL.createObjectURL(await response.blob());}
 await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw new Error(`빈 이미지: ${src}`);return image;
}
function drawJuiceShadow(ctx,width){
 if(!shadowImage)return;
 const w=width*.9,h=w*shadowImage.naturalHeight/shadowImage.naturalWidth;
 ctx.drawImage(shadowImage,-w/2,8-h,w,h);
}
async function loadJuiceImages(){
 const defaults=names.map((name,t)=>({name,src:`Resource/Juice${String(t+1).padStart(2,'0')}.png`}));
 let definitions=defaults,failed=[];
 try{
  // Local file previews cannot fetch JSON; native Image loading still works.
  if(location.protocol!=='file:'){
   try{const response=await fetch('./juices.json',{cache:'no-store'});if(!response.ok)throw new Error('주스 정의 로딩 실패');definitions=await response.json();}
   catch(error){console.warn('기본 주스 이미지 경로 사용',error);}
  }
  if(!Array.isArray(definitions)||definitions.length!==TIER_COUNT)throw new Error('주스 정의는 11개여야 합니다.');
  await Promise.all([loadNativeImage('Resource/Back01.png').then(image=>{beachImage=image;}).catch(error=>{console.warn('해변 배경 로딩 실패',error);}),loadNativeImage('Resource/Back01_1.png').then(image=>{beachAltImage=image;}).catch(error=>{console.warn('두 번째 해변 배경 로딩 실패',error);}),loadNativeImage('Resource/Table01.png').then(image=>{tableImage=image;}).catch(error=>{console.warn('테이블 이미지 로딩 실패',error);}),loadNativeImage('Resource/Shadow.png').then(image=>{shadowImage=image;}).catch(error=>{console.warn('그림자 이미지 로딩 실패',error);}),...definitions.map(async(definition,t)=>{
   const src=definition.src||defaults[t].src;
   try{
    juiceImages[t]=await loadNativeImage(src);
   }catch(error){failed.push(t+1);console.warn(`주스 ${t+1} 이미지 로딩 실패: ${src}`,error);}
  })]);
 }catch(error){console.warn('주스 이미지 로딩 실패',error);failed=defaults.map((_,i)=>i+1);}
 finally{assetsReady=true;ui();if(failed.length)toast(`이미지 로딩 실패: ${failed.join(', ')}단계 · Resource 파일을 확인해 주세요`);}
}
function persp(y){return .66+.34*Math.max(0,Math.min(1,(y-360)/705));}function project(x,y){return {x:360+x*persp(y),y,s:persp(y)};}
function save(){try{localStorage.setItem('mergy-juice-save',JSON.stringify({version:1,score,stage,current,next,discovered,shots,objects:objects.map(({x,y,t})=>({x,y,t}))}));localStorage.setItem('mergy-juice-best',String(best));}catch(e){}}
let collectionUnlock=-1;
function ui(){
 const goal=300+(stage-1)*450;
 $('stage').textContent=`MISSION ${String(stage).padStart(2,'0')}`;
 $('best').textContent=`BEST ${best}`;
 $('score').textContent=`${score} / ${goal}`;
 $('goal').textContent=`주스를 합쳐 ${goal}점 달성`;
 $('fill').style.width=`${Math.min(score/goal,1)*100}%`;
 $('missionText').textContent=['햇살을 담은 첫 한 잔','파도처럼 이어지는 머지','선셋 주스바의 인기 메뉴','파라다이스를 향해서'][Math.min(stage-1,3)];
 $('collection').textContent=`${discovered+1} / ${TIER_COUNT} DISCOVERED`;
 $('tiers').replaceChildren(...names.map((name,i)=>{
  const open=i<=discovered,cell=document.createElement('span');
  cell.className=open?'open':'locked';cell.title=open?name:'아직 발견하지 못한 주스';
  cell.setAttribute('aria-label',open?name:`${i+1}단계 미발견 주스`);
  if(juiceImages[i]){
   const thumb=document.createElement('img');thumb.src=juiceImages[i].src;thumb.alt='';cell.appendChild(thumb);
  }else{cell.textContent='…';}
  if(!open){const mark=document.createElement('b');mark.className='lock-mark';mark.setAttribute('aria-hidden','true');mark.textContent='?';cell.appendChild(mark);}
  if(i===collectionUnlock){
   cell.classList.add('unlock-flash');
   for(let n=0;n<8;n++){const spark=document.createElement('i');spark.className='unlock-spark';spark.style.setProperty('--angle',`${n*45}deg`);cell.appendChild(spark);}
  }
  return cell;
 }));
 collectionUnlock=-1;
 const n=$('next').getContext('2d');n.clearRect(0,0,90,100);
 const size=imageSize(next);juice(n,45,93,Math.min(76/size.width,83/size.height),next,0);
}
function toast(s){$('toast').textContent=s;$('toast').style.opacity=1;}
function tone(t){if(!sound)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),v=audio.createGain();o.type='sine';o.frequency.setValueAtTime(330*Math.pow(1.19,t),audio.currentTime);o.frequency.exponentialRampToValueAtTime(660*Math.pow(1.19,t),audio.currentTime+.15);v.gain.setValueAtTime(.075,audio.currentTime);v.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.28);o.connect(v);v.connect(audio.destination);o.start();o.stop(audio.currentTime+.3);}catch(e){}}
function path(points,fill,stroke,width=1){g.beginPath();points.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}}
function ellipse(ctx,x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function round(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();}
function juice(ctx,x,y,s,t,bounce,tilt=0){const image=juiceImages[t];if(image){ctx.save();ctx.translate(x,y);ctx.scale(s*(1+bounce*.18),s*(1-bounce*.13));drawJuiceShadow(ctx,image.naturalWidth);ctx.rotate(tilt);ctx.drawImage(image,-image.naturalWidth/2,-image.naturalHeight);ctx.restore();return;}ctx.save();ctx.translate(x,y);ctx.scale(s*(1+bounce*.18),s*(1-bounce*.13));const r=radius(t),h=48+t*6;drawJuiceShadow(ctx,imageSize(t).width);ctx.rotate(tilt);if(t>=4){round(ctx,-5,-13,10,17,3,'#bce8e3');ellipse(ctx,0,2,r*.8,7,'#8fcbd2');ellipse(ctx,0,0,r*.7,4,'#d8ffff');}
const base=t>=4?-16:0,top=base-h;const glass=ctx.createLinearGradient(-r,0,r,0);glass.addColorStop(0,'#91d6df');glass.addColorStop(.25,'#f0ffff');glass.addColorStop(.6,'#c6f0ed');glass.addColorStop(1,'#69b9ca');ctx.beginPath();ctx.moveTo(-r,top);ctx.quadraticCurveTo(-r+2,base-3,-r*.65,base);ctx.quadraticCurveTo(0,base+12,r*.65,base);ctx.quadraticCurveTo(r-2,base-3,r,top);ctx.closePath();ctx.fillStyle=glass;ctx.fill();
ctx.beginPath();ctx.moveTo(-r+5,top+8);ctx.lineTo(-r*.62,base-5);ctx.quadraticCurveTo(0,base+5,r*.62,base-5);ctx.lineTo(r-5,top+8);ctx.closePath();const liquid=ctx.createLinearGradient(-r,top,r,base);liquid.addColorStop(0,colors[t]);liquid.addColorStop(.6,colors[t]);liquid.addColorStop(1,'#ffffff');ctx.fillStyle=liquid;ctx.fill();ellipse(ctx,0,top,r,8,'#ddffff');ellipse(ctx,0,top+1,r-5,5,colors[t]);ctx.strokeStyle='#ffffff99';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-r+9,top+15);ctx.lineTo(-r*.6,base-12);ctx.stroke();
ctx.save();ctx.translate(r*.4,top+1);ctx.rotate(.25);round(ctx,-3,-43-t*2,6,44+t*2,2,'#fff5dd');ctx.fillStyle=colors[(t+2)%TIER_COUNT];for(let i=0;i<5;i++)ctx.fillRect(-3,-40+i*8,6,4);ctx.restore();ellipse(ctx,-r*.3,top+1,7,4,'#ffffff88');if(t>=2){ctx.font=`${23+t*2}px serif`;ctx.textAlign='center';ctx.fillText(fruits[t],-r*.5,top+2);}if(t===0){ellipse(ctx,r*.8,top-4,11,13,'#ffdc5f');ellipse(ctx,r*.8,top-4,7,9,'#fff0a0');}if(t===1){ellipse(ctx,-6,top-1,7,7,'#ef4053');ctx.strokeStyle='#658d49';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-6,top-5);ctx.quadraticCurveTo(-5,top-21,4,top-25);ctx.stroke();}ctx.restore();}
function background(){let sky=g.createLinearGradient(0,0,0,440);sky.addColorStop(0,'#c6eee3');sky.addColorStop(.65,'#d8f2dc');sky.addColorStop(1,'#fbdfaa');g.fillStyle=sky;g.fillRect(0,0,W,H);ellipse(g,585,305,58,58,'#fff2bf');g.fillStyle='#75cec1';g.fillRect(0,315,720,64);g.strokeStyle='#e7f9dc';g.lineWidth=3;for(let i=0;i<5;i++){g.beginPath();for(let x=0;x<=720;x+=12){const y=333+i*11+Math.sin(x*.025+clock*.3+i)*3;x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}g.fillStyle='#ead19b';g.fillRect(0,385,720,895);
// Decorative palms stay outside the play surface.
for(const [x,flip] of [[-10,1],[735,-1]]){g.save();g.translate(x,255);g.scale(flip,1);g.strokeStyle='#b58a57';g.lineWidth=15;g.beginPath();g.moveTo(20,160);g.quadraticCurveTo(48,20,3,-40);g.stroke();for(let i=0;i<5;i++){g.save();g.rotate(-.8+i*.37);g.fillStyle=i%2?'#4e9e72':'#71b47a';g.beginPath();g.moveTo(0,-45);g.quadraticCurveTo(100,-100,163,-18);g.quadraticCurveTo(90,-52,0,-45);g.fill();g.restore();}g.restore();}
// The beach art starts at the actual screen top and keeps its original aspect ratio.
if(beachImage||beachAltImage){
 const elapsed=Math.max(0,performance.now()-beachStart),phase=Math.floor(elapsed/BEACH_INTERVAL_MS);
 const previous=phase%2===1?beachImage:beachAltImage;
 const incoming=phase%2===1?beachAltImage:beachImage;
 const drawBeach=image=>{if(image)g.drawImage(image,0,-SCENE_Y,W,W*image.naturalHeight/image.naturalWidth);};
 if(phase===0||!previous||!incoming)drawBeach(incoming||previous);
 else{drawBeach(previous);g.save();g.globalAlpha=Math.min(1,(elapsed%BEACH_INTERVAL_MS)/BEACH_BLEND_MS);drawBeach(incoming);g.restore();}
}
// Align the source tabletop edge (y=31) and launch line (y=824) to the existing playfield.
// Uniform scaling preserves the image ratio and leaves physics coordinates unchanged.
if(tableImage){const scale=(916-381)/(824-31),width=tableImage.naturalWidth*scale,height=tableImage.naturalHeight*scale;g.drawImage(tableImage,(W-width)/2,381-31*scale,width,height);return;}
path([[102,365],[618,365],[697,1092],[23,1092]],'#986343');path([[104,358],[616,358],[690,1077],[30,1077]],'#d49a60','#f9d49b',4);path([[119,375],[601,375],[667,1059],[53,1059]],'#79a99a');let table=g.createLinearGradient(0,390,550,1060);table.addColorStop(0,'#f5dfb3');table.addColorStop(.5,'#ffedc6');table.addColorStop(1,'#f2dba8');path([[125,381],[595,381],[659,1050],[61,1050]],table,'#c1d3b5',3);
g.save();path([[125,381],[595,381],[659,1050],[61,1050]]);g.clip();g.strokeStyle='#fff6dc55';g.lineWidth=35;for(let i=-3;i<6;i++){g.beginPath();g.moveTo(i*170,1100);g.lineTo(i*170+800,350);g.stroke();}g.restore();g.strokeStyle='#fffdf0';g.lineWidth=3;g.setLineDash([8,10]);g.beginPath();g.moveTo(75,916);g.lineTo(645,916);g.stroke();g.setLineDash([]);g.font='10px sans-serif';g.textAlign='center';g.fillStyle='#a99876';g.fillText('LAUNCH ZONE',360,941);
// Quiet sand ornaments.
g.save();g.translate(574,845);g.rotate(.3);g.fillStyle='#dca27466';g.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5,r=i%2?9:23;g.lineTo(Math.cos(a)*r,Math.sin(a)*r);}g.closePath();g.fill();g.restore();}
function seed(){objects=[{x:-112,y:464,t:1},{x:0,y:450,t:2},{x:116,y:472,t:1},{x:-56,y:545,t:0},{x:70,y:560,t:0}].map(o=>({...o,vx:0,vy:0,born:-10}));}
if(!objects.length)seed();
discovered=Math.max(2,Math.min(TIER_COUNT-1,Number(discovered)||2));
function merge(a,b){
const t=a.t+1,x=(a.x+b.x)/2,y=Math.max(topLimit(t),(a.y+b.y)/2);
const massA=1/inverseMass(a.t),massB=1/inverseMass(b.t),mass=massA+massB;
const carry=.45+restitution()*.4;
const vx=(a.vx*massA+b.vx*massB)/mass*carry,vy=(a.vy*massA+b.vy*massB)/mass*carry;
const merged={x,y,t,vx,vy,born:clock,spawnAt:clock,spawnFrom:.8};
impact(merged,Math.hypot(a.vx-b.vx,a.vy-b.vy),Math.sign(a.x-b.x)||.6);
objects=objects.filter(o=>o!==a&&o!==b);objects.push(merged);const points=10*2**t;score+=points;best=Math.max(best,score);if(t>discovered)collectionUnlock=t;discovered=Math.max(discovered,t);for(let i=0;i<24;i++){const angle=Math.random()*Math.PI*2,speed=50+Math.random()*150;particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-60,life:.7+Math.random()*.4,max:1.1,color:i%3?'#fff5c2':colors[t],r:2+Math.random()*5});}rings.push({x,y,life:.55,color:colors[t]});floaters.push({x,y:y-70,text:`+${points}`,life:1});tone(t);toast(`${names[t]} 완성! ${t>=3?'✦':''}`);ui();saveTimer=.5;if(score>=300+(stage-1)*450){stage++;show('미션 완료! ✦',`${stage-1}번째 미션을 완성했어요. 다음 목표에 도전해 보세요!`,'다음 미션');}return true;}
function wallImpact(o,nx,ny){
 const closing=-(o.vx*nx+o.vy*ny);if(closing<=0)return;
 o.flying=false;
 const bounce=closing>65?restitution()*.6:Math.min(.1,restitution());
 const impulse=(1+bounce)*closing+knockbackSpeed(closing)*.5;
 o.vx+=impulse*nx;o.vy+=impulse*ny;limitImpactSpeed(o);
 impact(o,closing,nx||.6);
}
function beginSnap(a,b){
 const strength=physics.snap/100;
 a.snapping=true;b.snapping=true;a.flying=false;b.flying=false;
 const x=(a.x+b.x)/2,y=(a.y+b.y)/2,pull=.35+strength*.55;
 snaps.push({a,b,elapsed:0,duration:MERGE_SHRINK_SECONDS,ax:a.x,ay:a.y,bx:b.x,by:b.y,tx:x,ty:y,pull});
}
function updateSnaps(dt){
 for(const snap of [...snaps]){
  if(!objects.includes(snap.a)||!objects.includes(snap.b)){snap.a.snapping=false;snap.b.snapping=false;snaps=snaps.filter(s=>s!==snap);continue;}
  snap.elapsed+=dt;const progress=physics.snap===0?1:Math.min(1,(snap.elapsed+1e-9)/snap.duration);
  const ease=progress*progress*(3-2*progress),pull=ease*snap.pull;
  snap.a.mergeScale=1-.2*Math.min(1,snap.elapsed/MERGE_SHRINK_SECONDS);snap.b.mergeScale=snap.a.mergeScale;
  snap.a.x=snap.ax+(snap.tx-snap.ax)*pull;snap.a.y=snap.ay+(snap.ty-snap.ay)*pull;
  snap.b.x=snap.bx+(snap.tx-snap.bx)*pull;snap.b.y=snap.by+(snap.ty-snap.by)*pull;
  if(progress>=1){snap.a.snapping=false;snap.b.snapping=false;snaps=snaps.filter(s=>s!==snap);merge(snap.a,snap.b);if(paused)break;}
 }
}
function update(dt){clock+=dt;lock=Math.max(0,lock-dt);updateSnaps(dt);if(paused)return;
 for(const o of objects){
  if(o.snapping)continue;
  o.x+=o.vx*dt*moveRate();o.y+=o.vy*dt*moveRate();
  const friction=o.flying?1:Math.exp(-slideDrag()*dt);o.vx*=friction;o.vy*=friction;
  const r=displayedSize(o.t).width/2;
  if(o.x < -282+r){o.x=-282+r;wallImpact(o,1,0);}
  if(o.x > 282-r){o.x=282-r;wallImpact(o,-1,0);}
  if(o.y < topLimit(o.t)){o.y=topLimit(o.t);wallImpact(o,0,1);}
  if(o.y > 1006){o.y=1006;wallImpact(o,0,-1);}
 }
let merged=false;
for(let i=0;i<objects.length&&!merged;i++)for(let j=i+1;j<objects.length;j++){
 const a=objects[i],b=objects[j];if(a.snapping||b.snapping)continue;const ca=collider(a),cb=collider(b);
 const dx=cb.x-ca.x,dy=cb.y-ca.y;
 const overlapX=(ca.width+cb.width)/2-Math.abs(dx),overlapY=(ca.height+cb.height)/2-Math.abs(dy);
 const canMerge=a.t===b.t&&a.t<TIER_COUNT-1&&(clock-a.born>.24||a.flying)&&(clock-b.born>.24||b.flying);
 const gap=Math.hypot(Math.max(0,-overlapX),Math.max(0,-overlapY));
 const snapRange=(4+24*physics.snap/100)*(ca.scale+cb.scale)/2;
 if(canMerge&&physics.snap>0&&gap<=snapRange){beginSnap(a,b);continue;}
 if(overlapX<=0||overlapY<=0)continue;
 const pushedA=!a.flying&&b.flying,pushedB=!b.flying&&a.flying;
 const pushFactor=physics.placedPush/100;
 a.flying=false;b.flying=false;
 if(canMerge){merge(a,b);merged=true;break;}
 // Collision bounds cover the centered 95% width and only the bottom 22% of the original image.
 const horizontal=overlapX<overlapY,sx=horizontal?(dx>=0?1:-1):0,sy=horizontal?0:(dy>=0?1:-1);
 const normal=curvedContactNormal(dx,dy,horizontal,(ca.width+cb.width)/2,(ca.height+cb.height)/2),nx=normal.x,ny=normal.y;
 const invA=inverseMass(a.t),invB=inverseMass(b.t),invSum=invA+invB;
 const sepA=invA*(pushedA?pushFactor:1),sepB=invB*(pushedB?pushFactor:1),sepSum=sepA+sepB;
 const penetration=(horizontal?overlapX:overlapY)+.05;
 a.x-=sx*penetration*(sepA/sepSum)/ca.scale;b.x+=sx*penetration*(sepB/sepSum)/cb.scale;
 a.y-=sy*penetration*(sepA/sepSum);b.y+=sy*penetration*(sepB/sepSum);
 const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
 if(relative<0){
  // Stronger restitution at speed; soft resting contacts avoid persistent jitter.
  const speed=-relative,bounce=speed>65?restitution():Math.min(.08,restitution());
  const impulse=((1+bounce)*speed+knockbackSpeed(speed))/invSum;
  a.vx-=nx*impulse*invA*(pushedA?pushFactor:1);a.vy-=ny*impulse*invA*(pushedA?pushFactor:1);
  b.vx+=nx*impulse*invB*(pushedB?pushFactor:1);b.vy+=ny*impulse*invB*(pushedB?pushFactor:1);
  const tilt=horizontal?nx:Math.max(-1,Math.min(1,dx/Math.max(1,(ca.width+cb.width)*.25)))||.6;
  limitImpactSpeed(a);limitImpactSpeed(b);impact(a,speed,tilt);impact(b,speed,-tilt);
 }
}
for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=220*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);for(const r of rings)r.life-=dt;rings=rings.filter(r=>r.life>0);for(const f of floaters){f.life-=dt;f.y-=35*dt;}floaters=floaters.filter(f=>f.life>0);if(saveTimer>0){saveTimer-=dt;if(saveTimer<=0)save();}if(lock===0&&!ended&&objects.some(o=>!o.snapping&&o.y>913&&Math.hypot(o.vx,o.vy)<8)){ended=true;show('주스바가 가득 찼어요',`최종 점수 ${score}점! 빈 공간을 활용하고 같은 주스를 노려보세요.`,'다시 도전');}}
function draw(){g.clearRect(0,0,W,H);g.fillStyle="#c6eee3";g.fillRect(0,0,W,H);g.save();g.translate(0,SCENE_Y);background();if(aim){g.save();g.strokeStyle='#327e6999';g.lineWidth=3;g.setLineDash([3,13]);g.lineCap='round';g.beginPath();const start=(aim.startX-360)/persp(1006),endY=topLimit(current);
// Forward is constant world X; perspective naturally converges toward the far end.
g.moveTo(aim.startX,1006);const target=project(start,endY);g.lineTo(target.x,target.y);g.stroke();g.setLineDash([]);g.restore();}for(const o of [...objects].sort((a,b)=>a.y-b.y)){const p=project(o.x,o.y),age=clock-o.born,hitAge=clock-(o.hitAt??-100),spawnAge=clock-(o.spawnAt??-100);
const hit=hitAge<.8?(o.hitPower||0)*Math.exp(-hitAge*5.8):0;
const bounce=((age<.6?Math.sin(age*20)*Math.exp(-age*5):0)+Math.sin(hitAge*28)*hit*.65)*shakeScale();
const tilt=Math.sin(hitAge*22)*hit*(o.hitTilt||0)*.1*shakeScale();
const spawnScale=spawnAge<MERGE_SHRINK_SECONDS?.8+.2*Math.min(1,spawnAge/MERGE_SHRINK_SECONDS):1;
juice(g,p.x,p.y,p.s*objectScale()*spawnScale*(o.mergeScale||1),o.t,bounce,tilt);}for(const r of rings){const p=project(r.x,r.y);g.globalAlpha=r.life/.55;g.strokeStyle=r.color;g.lineWidth=5*r.life/.55;g.beginPath();g.ellipse(p.x,p.y-25,(1-r.life/.55)*95+15,(1-r.life/.55)*45+8,0,0,Math.PI*2);g.stroke();}g.globalAlpha=1;for(const p of particles){const q=project(p.x,p.y);g.globalAlpha=Math.min(p.life*2,1);ellipse(g,q.x,q.y,p.r,p.r,p.color);}g.globalAlpha=1;for(const f of floaters){const p=project(f.x,f.y);g.globalAlpha=f.life;g.font='bold 28px sans-serif';g.textAlign='center';g.strokeStyle='#fff9e9';g.lineWidth=5;g.strokeText(f.text,p.x,p.y);g.fillStyle='#24846e';g.fillText(f.text,p.x,p.y);}g.globalAlpha=1;if(!ended){const x=aim?aim.startX:360;juice(g,x,previewY(),objectScale(),current,Math.sin(clock*3)*.035);}g.restore();}
function coord(e){const rect=c.getBoundingClientRect();return {x:(e.clientX-rect.left)/rect.width*W,y:(e.clientY-rect.top)/rect.height*H-SCENE_Y};}
c.addEventListener('pointerdown',e=>{if(!assetsReady||paused||ended||lock>0||clock-previewBorn<PREVIEW_TWEEN_SECONDS||objects.some(o=>o.flying))return;const p=coord(e);const size=displayedSize(current),grabW=size.width*1.1,grabH=size.height*1.1;
 if(Math.abs(p.x-360)>grabW/2||p.y<1010-size.height*1.05||p.y>1010+size.height*.05)return;const x=launchX(p.x);aim={startX:x};c.setPointerCapture(e.pointerId);});
c.addEventListener('pointermove',e=>{if(!aim)return;const p=coord(e);aim.startX=launchX(p.x);});
c.addEventListener('pointerup',()=>{if(!aim||paused)return;objects.push({x:(aim.startX-360)/persp(1006),y:1006,t:current,vx:0,vy:-900,flying:true,born:clock});current=next;next=Math.floor(Math.random()*Math.min(3,2+Math.floor(shots/10)));shots++;aim=null;previewBorn=clock;lock=.55;tone(0);ui();saveTimer=2;});c.addEventListener('pointercancel',()=>aim=null);
function show(title,text,button){paused=true;aim=null;document.querySelector('.dialog').classList.toggle('mission-complete',title.startsWith('미션 완료'));$('dialogTitle').textContent=title;$('dialogText').textContent=text;$('resume').lastChild.textContent=button;$('overlay').hidden=false;save();}
function reset(){previewBorn=clock;snaps=[];objects=[];particles=[];rings=[];floaters=[];score=0;stage=1;current=0;next=0;shots=0;discovered=2;collectionUnlock=-1;ended=false;lock=0;seed();ui();save();toast('같은 주스끼리 만나면 한 단계 UP!');}
const optionsButton=$('optionsToggle');
function setOptionsVisible(visible){
 $('app').classList.toggle('options-hidden',!visible);
 optionsButton.setAttribute('aria-expanded',String(visible));
 const label=visible?'조절 옵션 가리기':'조절 옵션 보이기';
 optionsButton.setAttribute('aria-label',label);optionsButton.title=label;
 try{localStorage.setItem('mergy-juice-options-visible',visible?'1':'0');}catch(error){}
}
let optionsVisible=false;
try{optionsVisible=localStorage.getItem('mergy-juice-options-visible')==='1';}catch(error){}
setOptionsVisible(optionsVisible);
optionsButton.onclick=()=>setOptionsVisible($('app').classList.contains('options-hidden'));
$('collectionReset').onclick=()=>{discovered=2;collectionUnlock=-1;ui();save();toast('주스 콜렉션을 처음 상태로 초기화했어요');};$('dialogClose').onclick=()=>{if(ended)return;paused=false;$('overlay').hidden=true;ui();};$('settings').onclick=()=>show('잠깐, 쉬어가기','하단 점선 아래에서 좌우 드래그로 발사 위치를 옮기고 손을 놓으세요. 그 자리에서 앞으로만 끝까지 날아갑니다. 같은 주스끼리 만나면 다음 단계로 합쳐집니다. 점선을 넘기 전에 미션을 완성하세요.','계속 플레이');$('resume').onclick=()=>{if(ended)reset();paused=false;$('overlay').hidden=true;ui();};$('restart').onclick=()=>{reset();paused=false;$('overlay').hidden=true;};$('sound').onclick=()=>{sound=!sound;$('sound').lastChild.textContent=`사운드 ${sound?'켜짐':'꺼짐'}`;};$('swap').onclick=()=>{if(!assetsReady||paused||ended||lock>0||objects.some(o=>o.flying))return;[current,next]=[next,current];ui();save();toast('다음 주스와 바꿨어요');};addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install').hidden=false;});$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install').hidden=true;}};addEventListener('pagehide',save);document.addEventListener('visibilitychange',()=>{if(document.hidden){save();if(!paused&&!ended)show('잠깐, 쉬어가기','준비되면 주스바로 돌아오세요.','계속 플레이');}});
function paintNineSlice(canvas,image,source,destination){
 if(!canvas)return;const w=canvas.clientWidth,h=canvas.clientHeight;
 if(!w||!h||!image.complete||!image.naturalWidth)return;
 const ratio=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
 const ctx=canvas.getContext('2d');ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);
 const sx=[0,source.left,image.naturalWidth-source.right,image.naturalWidth];
 const sy=[0,source.top,image.naturalHeight-source.bottom,image.naturalHeight];
 const dx=[0,destination.left,w-destination.right,w];
 const dy=[0,destination.top,h-destination.bottom,h];
 // Share one source pixel across adjacent pieces so no antialiasing seam remains.
 for(let y=0;y<3;y++)for(let x=0;x<3;x++){
  const a=sx[x]-(x?1:0),b=sx[x+1]+(x<2?1:0);
  const c=sy[y]-(y?1:0),d=sy[y+1]+(y<2?1:0);
  const e=dx[x]-(x?1:0),f=dx[x+1]+(x<2?1:0);
  const q=dy[y]-(y?1:0),r=dy[y+1]+(y<2?1:0);
  ctx.drawImage(image,a,c,b-a,d-c,e,q,f-e,r-q);
 }
}
function setupPopupArt(){
 const panel=document.querySelector('.dialog'),panelCanvas=panel.querySelector('.popup-art');
 const mission=document.querySelector('.mission'),missionCanvas=mission.querySelector('.mission-art');
 const missionImage=new Image();missionImage.src='Resource/UI/Popup02.png';
 const panelImage=new Image();panelImage.src='Resource/UI/Popup01.png';
 const green=new Image();green.src='Resource/UI/Button01.png';
 const yellow=new Image();yellow.src='Resource/UI/Button02.png';
 const buttons=[...panel.querySelectorAll('button:not(.dialog-close)')];
 for(const button of buttons){const canvas=document.createElement('canvas');canvas.className='button-art';canvas.setAttribute('aria-hidden','true');button.prepend(canvas);}
 function render(){paintNineSlice(missionCanvas,missionImage,{top:45,right:45,bottom:45,left:45},{top:45,right:45,bottom:45,left:45});
  paintNineSlice(panelCanvas,panelImage,{top:220,right:60,bottom:150,left:60},{top:190,right:58,bottom:130,left:58});
  for(const button of buttons)paintNineSlice(button.querySelector('.button-art'),button.classList.contains('primary')?green:yellow,{top:42,right:65,bottom:42,left:65},{top:27,right:35,bottom:27,left:35});}
 for(const image of [missionImage,panelImage,green,yellow])image.addEventListener('load',render);
 const observer=new ResizeObserver(render);observer.observe(panel);observer.observe(mission);render();
}
setupPopupArt();
setupPhysicsControls();ui();loadJuiceImages();let last=performance.now(),acc=0;function frame(now){const dt=Math.min((now-last)/1000,.05);last=now;if(!paused&&assetsReady){acc+=dt;while(acc>=1/120){update(1/120);acc-=1/120;if(paused){acc=0;break;}}}draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(console.warn);
// Read-only snapshot for smoke checks and tuning.
window.mergySnapshot=()=>({score,stage,current,next,paused,ended,objects:objects.map(o=>({...o})),viewport:{width:innerWidth,height:innerHeight}});
})();
