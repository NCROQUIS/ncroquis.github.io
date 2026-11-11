(()=>{
'use strict';
const V=THREE.Vector3, Y=new V(0,1,0), TAU=Math.PI*2, O=new V(0,0,0);
const $=id=>document.getElementById(id);
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const rnd=(a,b)=>a+Math.random()*(b-a);
function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(TAU*v);}
function hash32(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// ---------- 규격 (m, kg) ----------
const GV=9.81,MU_S=0.2,MU_R=0.011,SPIN_DEC=14,E_BALL=0.93,E_CUSH=0.76,E_TABLE=0.45,MU_BALL=0.06,MU_CUSH=0.22,CUSH_H=0.037;
const DT=1/1200,MISCUE=0.56,PMAX=0.8,SPIN_MAX=MISCUE,GAP_C=0.09,GAP_S=0.068;
const KIT={carom:{L:2.84,W:1.42,R:0.03075,M:0.21,pockets:false},pool:{L:2.54,W:1.27,R:0.028575,M:0.17,pockets:true}};
let tableKind='carom',L,W,HL,HW,R,M,I,D2,LIM_X,LIM_Z,hasPockets;
function setSpec(k){const t=KIT[k];tableKind=k;L=t.L;W=t.W;HL=L/2;HW=W/2;R=t.R;M=t.M;I=0.4*M*R*R;D2=2*R;LIM_X=HL-R;LIM_Z=HW-R;hasPockets=t.pockets;}
setSpec('carom');
const POCKETS=(()=>{const h=KIT.pool.L/2,w=KIT.pool.W/2;return [[h+.014,w+.014,.07],[-h-.014,w+.014,.07],[h+.014,-w-.014,.07],[-h-.014,-w-.014,.07],[0,w+.026,.064],[0,-w-.026,.064]].map(([x,z,r])=>({x,z,r}));})();
const KNUCK=(()=>{const h=KIT.pool.L/2,w=KIT.pool.W/2,k=[];for(const sz of [-1,1]){for(const sx of [-1,1])k.push([sx*(h-GAP_C),sz*w],[sx*h,sz*(w-GAP_C)]);k.push([GAP_S,sz*w],[-GAP_S,sz*w]);}return k;})();

// ---------- renderer: 필름 톤매핑 + 당구장 조명 반사 ----------
const app=$('app'),canvas=$('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.localClippingEnabled=true;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x07090c);
scene.fog=new THREE.Fog(0x07090c,5,11);
const FOV=36,TILT=17;
const camera=new THREE.PerspectiveCamera(FOV,1,0.05,60);
(function(){
  const env=new THREE.Scene(),basic=(r,g,b)=>{const m=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});m.color.setRGB(r,g,b);return m;};
  env.add(new THREE.Mesh(new THREE.BoxGeometry(14,7,10),new THREE.MeshBasicMaterial({color:0x14110e,side:THREE.BackSide})));
  const panel=(w,d,x,y,z,r,g,b,rx=Math.PI/2,ry=0)=>{const o=new THREE.Mesh(new THREE.PlaneGeometry(w,d),basic(r,g,b));o.position.set(x,y,z);o.rotation.set(rx,ry,0);env.add(o);};
  panel(1.1,.42,-1.1,3.1,0,16,14.5,12.5);panel(1.1,.42,0,3.1,0,16,14.5,12.5);panel(1.1,.42,1.1,3.1,0,16,14.5,12.5);
  panel(9,1,0,1.8,4.9,.9,1,1.25,0,0);panel(9,1,0,1.8,-4.9,.7,.75,.95,0,0);
  const p=new THREE.PMREMGenerator(renderer);scene.environment=p.fromScene(env,0.012).texture;p.dispose();
})();
scene.add(new THREE.HemisphereLight(0xcfd8ea,0x18110a,0.16));
[-0.8,0.8].forEach(x=>{const s=new THREE.SpotLight(0xfffaf3,1.12,8,1.02,0.85,1.1);s.position.set(x,2.7,0.05);s.target.position.set(x*.8,0,0);s.castShadow=true;s.shadow.mapSize.set(1024,1024);s.shadow.radius=4;s.shadow.bias=-0.0006;s.shadow.camera.near=1;s.shadow.camera.far=5;scene.add(s,s.target);});

// ---------- 절차 질감 ----------
const MAXA=Math.min(8,renderer.capabilities.getMaxAnisotropy());
function canvasTex(c,srgb,wrap){const t=new THREE.CanvasTexture(c);if(srgb)t.encoding=THREE.sRGBEncoding;t.wrapS=t.wrapT=wrap;t.anisotropy=MAXA;return t;}
const CLOTH=(function(){
  const N=512,r=new Float32Array(N*N).map(()=>Math.random()-.5),out=new Float32Array(N*N);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){let h=0,v=0;for(let k=-4;k<=4;k++){h+=r[y*N+(x+k+N)%N];v+=r[((y+k+N)%N)*N+x];}out[y*N+x]=(h+v)/5.5+r[y*N+x]*.75;}
  return out;
})();
function clothTex(hex){
  const N=512,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d'),im=g.createImageData(N,N),b=[hex>>16&255,hex>>8&255,hex&255];
  for(let i=0;i<N*N;i++){const k=1+CLOTH[i]*.085;for(let j=0;j<3;j++)im.data[i*4+j]=clamp(b[j]*k,0,255);im.data[i*4+3]=255;}
  g.putImageData(im,0,0);return canvasTex(c,true,THREE.RepeatWrapping);
}
const clothBump=(function(){const N=512,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d'),im=g.createImageData(N,N);for(let i=0;i<N*N;i++){const v=clamp(128+CLOTH[i]*150,0,255);im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=v;im.data[i*4+3]=255;}g.putImageData(im,0,0);return canvasTex(c,false,THREE.RepeatWrapping);})();
function feltMat(hex){return new THREE.MeshStandardMaterial({map:clothTex(hex),bumpMap:clothBump,bumpScale:.0012,roughness:1,metalness:0,envMapIntensity:.22});}
const WOOD=(function(){
  const W=1024,H=256,c=document.createElement('canvas'),b=document.createElement('canvas');c.width=b.width=W;c.height=b.height=H;const g=c.getContext('2d'),gb=b.getContext('2d'),im=g.createImageData(W,H),ib=gb.createImageData(W,H);
  const G=64,grid=new Float32Array(G*G).map(()=>Math.random()),vn=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),at=(a,c)=>grid[((c%G+G)%G)*G+((a%G+G)%G)];return (at(xi,yi)*(1-u)+at(xi+1,yi)*u)*(1-v)+(at(xi,yi+1)*(1-u)+at(xi+1,yi+1)*u)*v;};
  const dark=[30,12,7],light=[84,38,19];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const warp=vn(x/170,y/34)*2.2+vn(x/60,y/12)*.5,ring=.5+.5*Math.sin((y/H*3.5+warp*.55)*TAU),fine=vn(x/9,y*1.3),pore=Math.pow(vn(x/22,y*2.1),5);
    let k=clamp(ring*.42+fine*.28+vn(x/300,y/90)*.2-pore*.9,0,1);const i=(y*W+x)*4;
    for(let j=0;j<3;j++)im.data[i+j]=dark[j]+(light[j]-dark[j])*k;im.data[i+3]=255;
    const bv=200-pore*190-(1-fine)*25;ib.data[i]=ib.data[i+1]=ib.data[i+2]=bv;ib.data[i+3]=255;
  }
  g.putImageData(im,0,0);gb.putImageData(ib,0,0);return {map:canvasTex(c,true,THREE.MirroredRepeatWrapping),bump:canvasTex(b,false,THREE.MirroredRepeatWrapping)};
})();
function woodMat(tint,opts){return new THREE.MeshPhysicalMaterial(Object.assign({map:WOOD.map,bumpMap:WOOD.bump,bumpScale:.0006,color:tint,roughness:.42,metalness:0,clearcoat:1,clearcoatRoughness:.14,envMapIntensity:.42},opts||{}));}
function worldUV(g,su,sv,swap,ox=0,oy=0,oz=0){
  const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++){const x=p.getX(i)+ox,y=p.getY(i)+oy,z=p.getZ(i)+oz,ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));let a,b;
    if(ny>.5){a=swap?z:x;b=swap?x:z;}else if(nz>=Math.abs(n.getX(i))){a=x;b=y;}else{a=z;b=y;}
    uv.setXY(i,a*su,b*sv);}
  uv.needsUpdate=true;return g;
}
const mat=(c,r=0.8,m=0)=>new THREE.MeshStandardMaterial({color:new THREE.Color(c).convertSRGBToLinear(),roughness:r,metalness:m});

// ---------- 당구대 ----------
const CW=0.045,CHH=CUSH_H+0.004,RW=0.13,railY=CHH+0.002-0.026,RAIL_TOP=railY+0.0262;
const tblCarom=new THREE.Group(),tblPool=new THREE.Group();scene.add(tblCarom,tblPool);
const floorM=woodMat(0x1c1a18,{clearcoat:.5,clearcoatRoughness:.3,envMapIntensity:.35});
const floorG=worldUV(new THREE.PlaneGeometry(40,40).rotateX(-Math.PI/2),.7,2.4,false);
const floor=new THREE.Mesh(floorG,floorM);floor.position.y=-0.78;floor.receiveShadow=true;scene.add(floor);
const dg=new THREE.CircleGeometry(0.0078,20),dm=new THREE.MeshPhysicalMaterial({color:0xf2ead8,roughness:.25,clearcoat:1,clearcoatRoughness:.05});
function diamond(g,x,z){const d=new THREE.Mesh(dg,dm);d.rotation.x=-Math.PI/2;d.position.set(x,RAIL_TOP+.0004,z);g.add(d);}
function quad(arr,a,b,c,d,hint){
  const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[d[0]-a[0],d[1]-a[1],d[2]-a[2]],nx=u[1]*v[2]-u[2]*v[1],ny=u[2]*v[0]-u[0]*v[2],nz=u[0]*v[1]-u[1]*v[0];
  const flip=nx*hint[0]+ny*hint[1]+nz*hint[2]<0,t=flip?[a,c,b,a,d,c]:[a,b,c,a,c,d];t.forEach(p=>arr.push(p[0],p[1],p[2]));
}
function cushionPrism(g,m,i1,i2,o2,o1,swap){
  const yi=CUSH_H-.001,yo=CHH+.0015,arr=[],V=(p,y)=>[p[0],y,p[1]],out=[i1[0]-o1[0],0,i1[1]-o1[1]];
  quad(arr,V(i1,yi),V(i2,yi),V(o2,yo),V(o1,yo),[0,1,0]);
  quad(arr,V(i1,0),V(i2,0),V(i2,yi),V(i1,yi),out);
  quad(arr,V(i1,0),V(o1,0),V(o1,yo),V(i1,yi),[i1[0]-i2[0],0,i1[1]-i2[1]]);
  quad(arr,V(i2,0),V(o2,0),V(o2,yo),V(i2,yi),[i2[0]-i1[0],0,i2[1]-i1[1]]);
  const ge=new THREE.BufferGeometry();ge.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));ge.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(arr.length/3*2),2));ge.computeVertexNormals();worldUV(ge,1.7,1.7,swap);
  const o=new THREE.Mesh(ge,m);o.receiveShadow=true;o.castShadow=true;g.add(o);
}
// 레일: 둥근 모서리로 뽑고, 네 변을 45도로 잘라 결 방향을 맞춘다
function buildRail(g,hl,hw,shape,tint){
  const ge=new THREE.ExtrudeGeometry(shape,{depth:.04,bevelEnabled:true,bevelThickness:.006,bevelSize:.006,bevelOffset:-.006,bevelSegments:3,curveSegments:56});
  ge.rotateX(-Math.PI/2);ge.translate(0,railY-.026+.006,0);
  const gx=worldUV(ge,.5,2.6,false),gz=worldUV(ge.clone(),.5,2.6,true),s2=Math.SQRT1_2,c=(hl-hw)*s2,P=(x,z,k)=>new THREE.Plane(new V(x*s2,0,z*s2),k);
  [[gx,[P(-1,1,c),P(1,1,c)]],[gx,[P(-1,-1,c),P(1,-1,c)]],[gz,[P(1,-1,-c),P(1,1,-c)]],[gz,[P(-1,-1,-c),P(-1,1,-c)]]].forEach(([geo,planes])=>{
    const o=new THREE.Mesh(geo,woodMat(tint,{clippingPlanes:planes,roughness:.62,clearcoat:.3,clearcoatRoughness:.55,envMapIntensity:.16}));o.castShadow=true;o.receiveShadow=true;g.add(o);});
}
function bodyBox(g,w,d,tint){const ge=new THREE.BoxGeometry(w,.26,d);worldUV(ge,.5,2.6,false,0,-.17,0);const o=new THREE.Mesh(ge,woodMat(tint,{roughness:.5}));o.position.y=-.17;o.receiveShadow=true;o.castShadow=true;g.add(o);}
(function(g){
  const c=KIT.carom,hl=c.L/2,hw=c.W/2,a=hl+CW,b=hw+CW,felt=feltMat(0x174f9c),cush=feltMat(0x134686);
  const ge=new THREE.BoxGeometry(c.L+.1,.04,c.W+.1);worldUV(ge,1.7,1.7,false);const f=new THREE.Mesh(ge,felt);f.position.y=-.02;f.receiveShadow=true;g.add(f);
  cushionPrism(g,cush,[-hl,hw],[hl,hw],[a,b],[-a,b],false);cushionPrism(g,cush,[-hl,-hw],[hl,-hw],[a,-b],[-a,-b],false);
  cushionPrism(g,cush,[hl,-hw],[hl,hw],[a,b],[a,-b],true);cushionPrism(g,cush,[-hl,-hw],[-hl,hw],[-a,b],[-a,-b],true);
  const OX=a+RW,OZ=b+RW,s=new THREE.Shape();s.moveTo(-OX,-OZ);s.lineTo(OX,-OZ);s.lineTo(OX,OZ);s.lineTo(-OX,OZ);s.closePath();
  const h=new THREE.Path();h.moveTo(-a,-b);h.lineTo(-a,b);h.lineTo(a,b);h.lineTo(a,-b);h.closePath();s.holes.push(h);
  buildRail(g,hl,hw,s,0xffffff);bodyBox(g,2*OX,2*OZ,0x6b5a50);
  for(let i=1;i<8;i++){const x=-hl+i*c.L/8;diamond(g,x,b+RW/2);diamond(g,x,-b-RW/2);}
  for(let j=1;j<4;j++){const z=-hw+j*c.W/4;diamond(g,a+RW/2,z);diamond(g,-a-RW/2,z);}
})(tblCarom);
(function(g){
  const RIM_S=Math.hypot(GAP_S,.026),RIM_C=.078,c=KIT.pool,hl=c.L/2,hw=c.W/2,a=hl+CW,b=hw+CW,felt=feltMat(0x0f5f49),cush=feltMat(0x0c513e),pitM=new THREE.MeshBasicMaterial({color:0x020202,toneMapped:false}),leather=new THREE.MeshPhysicalMaterial({color:0x0c0a09,roughness:.55,clearcoat:.25,clearcoatRoughness:.35,envMapIntensity:.3});
  // 높이 차로 원이 어긋나 보이지 않게, 구멍은 레일 높이의 검은 원 한 장으로 그린다 (공·큐는 그 위에 그린다)
  const lidM=new THREE.MeshBasicMaterial({color:0x040404,toneMapped:false,depthTest:false,depthWrite:false});
  const FX=a+RW*0.6,FZ=b+RW*0.6,fs=new THREE.Shape();
  fs.moveTo(-FX,-FZ);fs.lineTo(FX,-FZ);fs.lineTo(FX,FZ);fs.lineTo(-FX,FZ);fs.closePath();
  // 구멍은 천·레일·가죽 테두리가 같은 원 하나로 이어지게 한다
  POCKETS.forEach(p=>{const rF=p.x===0?RIM_S:RIM_C,h=new THREE.Path();h.absarc(p.x,p.z,rF-.018,0,TAU,true);fs.holes.push(h);
    const lid=new THREE.Mesh(new THREE.CircleGeometry(rF+.001,72),lidM);lid.rotation.x=-Math.PI/2;lid.position.set(p.x,RAIL_TOP+.001,p.z);lid.renderOrder=1;g.add(lid);
    const pit=new THREE.Mesh(new THREE.CircleGeometry(rF+0.01,72),pitM);pit.rotation.x=-Math.PI/2;pit.position.set(p.x,-0.035,p.z);g.add(pit);});
  const fg=new THREE.ShapeGeometry(fs,72);fg.rotateX(-Math.PI/2);worldUV(fg,1.7,1.7,false);const fm=new THREE.Mesh(fg,felt);fm.receiveShadow=true;g.add(fm);
  const fl=0.028;
  for(const sz of [-1,1])for(const sx of [-1,1]){const x1=GAP_S,x2=hl-GAP_C;cushionPrism(g,cush,[sx*x1,sz*hw],[sx*x2,sz*hw],[sx*(x2+fl),sz*(hw+CW)],[sx*(x1+.009),sz*(hw+CW)],false);}
  for(const sx of [-1,1]){const z1=hw-GAP_C;cushionPrism(g,cush,[sx*hl,-z1],[sx*hl,z1],[sx*(hl+CW),z1+fl],[sx*(hl+CW),-z1-fl],true);}
  const OX=a+RW,OZ=b+RW,rs=new THREE.Shape();rs.moveTo(-OX,-OZ);rs.lineTo(OX,-OZ);rs.lineTo(OX,OZ);rs.lineTo(-OX,OZ);rs.closePath();
  const cr=0.07,sr=0.064,cx=hl+.014,cy=hw+.014,cs=hw+.026,dyC=Math.sqrt(cr*cr-(a-cx)*(a-cx)),dxC=Math.sqrt(cr*cr-(b-cy)*(b-cy)),dxS=Math.sqrt(sr*sr-(b-cs)*(b-cs));
  const p=new THREE.Path(),arc=(x,y,r,a0,a1)=>{p.absarc(x,y,r,a0,a1,false);let d=a1-a0;while(d<0)d+=TAU;const ring=new THREE.Mesh(new THREE.RingGeometry(r,r===sr?RIM_S:RIM_C,72,1,a0,d),leather);ring.rotation.x=-Math.PI/2;ring.position.set(x,RAIL_TOP+.0006,-y);g.add(ring);};
  p.moveTo(a,-(cy-dyC));p.lineTo(a,cy-dyC);arc(cx,cy,cr,Math.atan2(-dyC,a-cx),Math.atan2(b-cy,-dxC));
  p.lineTo(dxS,b);arc(0,cs,sr,Math.atan2(b-cs,dxS),Math.atan2(b-cs,-dxS));
  p.lineTo(-(cx-dxC),b);arc(-cx,cy,cr,Math.atan2(b-cy,dxC),Math.atan2(-dyC,cx-a));
  p.lineTo(-a,-(cy-dyC));arc(-cx,-cy,cr,Math.atan2(dyC,cx-a),Math.atan2(cy-b,dxC));
  p.lineTo(-dxS,-b);arc(0,-cs,sr,Math.atan2(cs-b,-dxS),Math.atan2(cs-b,dxS));
  p.lineTo(cx-dxC,-b);arc(cx,-cy,cr,Math.atan2(cy-b,-dxC),Math.atan2(dyC,a-cx));
  rs.holes.push(p);buildRail(g,hl,hw,rs,0xc9b8ac);bodyBox(g,2*OX,2*OZ,0x5a4a42);
  for(let i=1;i<8;i++){if(i===4)continue;const x=-hl+i*c.L/8;diamond(g,x,b+RW/2);diamond(g,x,-b-RW/2);}
  for(let j=1;j<4;j++){const z=-hw+j*c.W/4;diamond(g,a+RW/2,z);diamond(g,-a-RW/2,z);}
})(tblPool);
function showTable(k){tblCarom.visible=k==='carom';tblPool.visible=k==='pool';}

// ---------- 공 ----------
function ballTex(base,dot){
  const c=document.createElement('canvas');c.width=1024;c.height=512;const g=c.getContext('2d');g.scale(2,2);
  g.fillStyle=base;g.fillRect(0,0,512,256);g.fillStyle=dot;
  [[.0,.5],[.25,.5],[.5,.5],[.75,.5],[.12,.2],[.62,.2],[.37,.8],[.87,.8]].forEach(([u,v])=>{
    const s=Math.max(.35,Math.sin(v*Math.PI));g.beginPath();g.ellipse(u*512,v*256,12/s,12,0,0,TAU);g.fill();
    if(u===0){g.beginPath();g.ellipse(512,v*256,12/s,12,0,0,TAU);g.fill();}
  });
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=MAXA;return t;
}
const POOL_COL=['#f2c21b','#1d4fc4','#d3261d','#5d2a9e','#ee7a1a','#13804b','#8f1d23','#16161a'];
function poolTex(n){
  if(n===0) return ballTex('#f7f7f3','#d0362b');
  const c=document.createElement('canvas');c.width=512;c.height=256;const g=c.getContext('2d'),col=POOL_COL[(n-1)%8];
  if(n<=8){g.fillStyle=col;g.fillRect(0,0,512,256);}else{g.fillStyle='#f4f1e8';g.fillRect(0,0,512,256);g.fillStyle=col;g.fillRect(0,62,512,132);}
  [128,384].forEach(u=>{g.fillStyle='#f7f3e9';g.beginPath();g.arc(u,128,40,0,TAU);g.fill();g.fillStyle='#14141a';g.font='700 52px "Barlow Condensed",Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(String(n),u,131);});
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=MAXA;return t;
}
const sgC=new THREE.SphereGeometry(KIT.carom.R,56,40),sgP=new THREE.SphereGeometry(KIT.pool.R,48,32);
const aoGeo=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),aoMat=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false,color:0x000000,opacity:.78,map:(function(){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,6,64,64,64);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.36,'rgba(255,255,255,.72)');r.addColorStop(.62,'rgba(255,255,255,.14)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);})()});
function mkBall(name,tex,geo,rad,num){
  const m=new THREE.Mesh(geo,new THREE.MeshPhysicalMaterial({map:tex,color:0xd2d2d2,roughness:.14,metalness:0,clearcoat:1,clearcoatRoughness:.025,envMapIntensity:.85,reflectivity:.5}));
  m.castShadow=true;m.visible=false;m.renderOrder=2;scene.add(m);
  const ao=new THREE.Mesh(aoGeo,aoMat.clone());ao.visible=false;ao.renderOrder=1;ao.scale.set(rad*3,1,rad*3);ao.position.y=.0014;scene.add(ao);
  // 이름은 그때 언어로 읽어요 (판정 문구에 들어가요)
  return {ao,aoS:rad*3,get name(){return name();},num,i:0,p:new V(0,rad,0),v:new V(),w:new V(),mesh:m,off:false,pot:false,spot:null,sink:null};
}
const CAROM={w:mkBall(()=>T('ball_white'),ballTex('#f7f7f3','#d0362b'),sgC,KIT.carom.R,-1),y:mkBall(()=>T('ball_yellow'),ballTex('#f7d80f','#6f5a00'),sgC,KIT.carom.R,-1),r:mkBall(()=>T('ball_red'),ballTex('#cf1428','#ffecec'),sgC,KIT.carom.R,-1),r2:mkBall(()=>T('ball_red'),ballTex('#cf1428','#ffecec'),sgC,KIT.carom.R,-1)};
const POOL_BALLS=[];for(let n=0;n<16;n++)POOL_BALLS.push(mkBall(n?()=>T('ball_n',{n}):()=>T('ball_cue'),poolTex(n),sgP,KIT.pool.R,n));
const ALL_BALLS=[CAROM.w,CAROM.y,CAROM.r,CAROM.r2,...POOL_BALLS];
CAROM.w.glow=0xffffff;CAROM.y.glow=0xffd23a;CAROM.r.glow=CAROM.r2.glow=0xff3a45;
const POOL_GLOW=[0xffd42a,0x4f86ff,0xff3a30,0xa866ff,0xff9a3c,0x3fe08f,0xe0454f,0xc3c9d3];
POOL_BALLS.forEach(b=>{b.glow=b.num?POOL_GLOW[(b.num-1)%8]:0xffffff;});
const grp=n=>n<8?'solid':'stripe';
let LB=[];              // 지금 테이블 위 공 (라이브)
function useBalls(list){ALL_BALLS.forEach(b=>{b.mesh.visible=false;b.ao.visible=false;b.sink=null;b.fly=null;});LB=list;list.forEach((b,i)=>{b.i=i;b.off=false;b.pot=false;b.sink=null;b.v.set(0,0,0);b.w.set(0,0,0);b.p.y=R;b.mesh.visible=true;});}
function faceUp(b){b.mesh.quaternion.setFromEuler(new THREE.Euler(-Math.PI/2+rnd(-.35,.35),0,rnd(-.5,.5)));}

// ---------- 큐·가이드 ----------
const cue=new THREE.Group();
(function(){
  const rAt=y=>0.0062+(0.0148-0.0062)*Math.min(1,y/1.45),part=(y0,y1,m,seg=32)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(rAt(y1),rAt(y0),y1-y0,seg),m);o.position.y=(y0+y1)/2;o.castShadow=true;cue.add(o);return o;};
  const gloss=(c,r=.3)=>new THREE.MeshPhysicalMaterial({color:c,roughness:r,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:1.05});
  const maple=woodMat(0xfff1d8,{map:null,bumpMap:null,color:0x9c7444,roughness:.4,envMapIntensity:.35}),ebony=woodMat(0x4a3a34,{roughness:.3});
  part(0,.011,new THREE.MeshStandardMaterial({color:0x2a78c8,roughness:1}));part(.011,.031,gloss(0xf0ebdf,.25));part(.031,.74,maple);
  part(.74,.752,new THREE.MeshStandardMaterial({color:0xb9a06a,roughness:.28,metalness:1}));part(.752,1.02,ebony);part(1.02,1.28,new THREE.MeshStandardMaterial({color:0x151515,roughness:.82}));part(1.28,1.45,ebony);
})();
cue.traverse(o=>{o.renderOrder=2;});cue.visible=false;scene.add(cue);
const segGeo=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
function glowTexture(fade){
  const c=document.createElement('canvas');c.width=64;c.height=32;const g=c.getContext('2d'),img=g.createImageData(64,32);
  for(let y=0;y<32;y++)for(let x=0;x<64;x++){const v=(y+.5)/16-1,u=(x+.5)/64,a=Math.exp(-v*v*5.5)*(1-Math.pow(Math.abs(v),6))*(fade?Math.pow(1-u,.7):1),i=(y*64+x)*4;img.data[i]=img.data[i+1]=img.data[i+2]=255;img.data[i+3]=Math.round(255*a);}
  g.putImageData(img,0,0);return new THREE.CanvasTexture(c);
}
const glowPlain=glowTexture(false),glowFade=glowTexture(true),tmpColor=new THREE.Color(),WHITE=new THREE.Color(0xffffff);
// 선 하나 = 밝은 심지(짝수) + 번지는 빛(홀수)
const SEGS=[];for(let i=0;i<8;i++){const m=new THREE.Mesh(segGeo,new THREE.MeshBasicMaterial({map:glowPlain,color:0xffffff,transparent:true,depthWrite:false,toneMapped:false}));m.visible=false;m.renderOrder=i%2?2:3;scene.add(m);SEGS.push(m);}
function seg(i,x0,z0,x1,z1,col,op,fade){
  const dx=x1-x0,dz=z1-z0,l=Math.hypot(dx,dz);if(l<1e-4)return;
  for(let k=0;k<2;k++){
    const m=SEGS[2*i+k];m.visible=true;m.position.set((x0+x1)/2,k?0.0042:0.0048,(z0+z1)/2);m.rotation.y=-Math.atan2(dz,dx);m.scale.set(l,1,k?0.062:0.013);
    m.material.map=fade?glowFade:glowPlain;tmpColor.setHex(col).convertSRGBToLinear();if(!k)tmpColor.lerp(WHITE,.5);m.material.color.copy(tmpColor);m.material.opacity=k?op*.62:op;
  }
}
const ghost=new THREE.Mesh(new THREE.RingGeometry(0.86,1,36),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));
ghost.rotation.x=-Math.PI/2;ghost.visible=false;scene.add(ghost);
const cueRing=new THREE.Mesh(new THREE.RingGeometry(1.28,1.5,40),new THREE.MeshBasicMaterial({color:0x4fb3ff,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));
cueRing.rotation.x=-Math.PI/2;cueRing.visible=false;scene.add(cueRing);

// ---------- 상태 ----------
const set={guide:'long',squirt:true,miscue:true,tremor:true};
const pipCam=new THREE.PerspectiveCamera(32,1.4,0.005,10);
const ray=new THREE.Raycaster(),aimPlane=new THREE.Plane(new V(0,1,0),-R),ndc=new THREE.Vector2();
let phase='attract',aimPhi=0,elev=5,hit={a:0,b:0},power=0,pull=0.08;
let strikeT=0,stillT=0,shotT=0,history=[],pendingShot=null;
let G={mode:'attract',game:'3c',players:[],cueI:0,turn:0,over:false};
let liveLog=null;

function shotOpts(){return G.mode==='stage'?{squirt:true,miscue:true,tremor:false}:set;}

// ---------- 물리 ----------
let B=[],LOG=null,LIVE=false;
const tA=new V(),tB=new V(),tC=new V(),tD=new V(),tE=new V(),qq=new THREE.Quaternion();
function newLog(cueI,n){return {cueI,hits:[],cushAt:[],cush:0,potted:[],offCue:false,mis:false,objC:new Uint8Array(n)};}
function stepBall(b,dt){
  if(b.off) return;
  const onTable=b.p.y<=R+1e-5;
  if(!onTable){b.v.y-=GV*dt;}
  else{
    if(b.v.y<0){if(-b.v.y>0.15){if(LIVE)sfx('bounce',Math.min(1,-b.v.y/3));b.v.y=-b.v.y*E_TABLE;}else b.v.y=0;}
    if(b.v.y<=1e-6){
      const ux=b.v.x+R*b.w.z,uz=b.v.z-R*b.w.x,us=Math.sqrt(ux*ux+uz*uz);
      if(us>2e-3){
        const f=MU_S*GV*dt;
        if(3.5*f>=us){b.v.x-=ux*2/7;b.v.z-=uz*2/7;b.w.z=-b.v.x/R;b.w.x=b.v.z/R;}
        else{const Fx=-ux/us,Fz=-uz/us,k=f*M/I;b.v.x+=Fx*f;b.v.z+=Fz*f;b.w.x+=-R*Fz*k;b.w.z+=R*Fx*k;}
      }else{
        const sp=Math.sqrt(b.v.x*b.v.x+b.v.z*b.v.z),dec=MU_R*GV*dt;
        if(sp<=dec){b.v.x=0;b.v.z=0;}else{const s=(sp-dec)/sp;b.v.x*=s;b.v.z*=s;}
        b.w.z=-b.v.x/R;b.w.x=b.v.z/R;
      }
      const d=SPIN_DEC*dt;b.w.y=Math.abs(b.w.y)<=d?0:b.w.y-Math.sign(b.w.y)*d;
    }
  }
  b.p.addScaledVector(b.v,dt);
  if(b.p.y<R)b.p.y=R;
  if(LIVE&&b.mesh){const wl=b.w.length();if(wl>1e-6){tA.copy(b.w).multiplyScalar(1/wl);qq.setFromAxisAngle(tA,wl*dt);b.mesh.quaternion.premultiply(qq);}}
  if(hasPockets) railsPool(b);else{cushion(b,'x',LIM_X,HL);cushion(b,'z',LIM_Z,HW);}
  if(!b.off&&(b.p.y<-0.5||Math.abs(b.p.x)>HL+CW+RW+.005||Math.abs(b.p.z)>HW+CW+RW+.005)) offTable(b);
}
function offTable(b){if(b.off)return;b.off=true;if(LIVE&&b.mesh)b.fly={t:0,x:b.v.x,y:b.v.y,z:b.v.z};b.v.set(0,0,0);b.w.set(0,0,0);if(b.i===LOG.cueI)LOG.offCue=true;}
function cushion(b,ax,lim,half){
  const s=Math.sign(b.p[ax]);if(Math.abs(b.p[ax])<=lim)return;
  const vn=b.v[ax]*s;if(vn<=0)return;
  if(b.p.y-R>CUSH_H-0.004){if(Math.abs(b.p[ax])>half+0.06)offTable(b);return;}
  b.p[ax]=s*lim;
  const Jn=M*vn*(1+E_CUSH);
  b.v[ax]=-s*vn*E_CUSH;
  const tAx=ax==='x'?'z':'x';
  const slip=b.v[tAx]+(ax==='x'?-b.w.y*s*R:b.w.y*s*R);
  if(Math.abs(slip)>1e-6){
    const Jt=-Math.sign(slip)*Math.min(MU_CUSH*Jn,M*Math.abs(slip)/3.5);
    b.v[tAx]+=Jt/M;
    b.w.y+=(ax==='x'?-s*R*Jt:s*R*Jt)/I;
  }
  if(b.i===LOG.cueI)LOG.cush++;else LOG.objC[b.i]++;
  if(LIVE)sfx('cushion',Math.min(1,vn/4));
}
function potBall(b){
  if(b.off)return;
  b.pot=true;b.off=true;b.v.set(0,0,0);b.w.set(0,0,0);LOG.potted.push(b.i);
  if(LIVE){let p=POCKETS[0],m=1e9;for(const q of POCKETS){const d=Math.hypot(q.x-b.p.x,q.z-b.p.z);if(d<m){m=d;p=q;}}b.sink={t:0,x:b.p.x,z:b.p.z,tx:p.x,tz:p.z};sfx('pocket',.9);}
}
function railsPool(b){
  const ax=Math.abs(b.p.x),az=Math.abs(b.p.z);
  if(ax<LIM_X-0.03&&az<LIM_Z-0.03)return;
  if(b.p.y<R+0.02){
    if(ax<GAP_S&&az>HW-0.003){potBall(b);return;}
    if((HL-ax)+(HW-az)<GAP_C){potBall(b);return;}
  }
  if(az<HW-GAP_C)cushion(b,'x',LIM_X,HL);
  if(ax<HL-GAP_C&&ax>GAP_S)cushion(b,'z',LIM_Z,HW);
  if(b.off)return;
  if(b.p.y-R<CUSH_H-0.004)for(let i=0;i<KNUCK.length;i++){
    const k=KNUCK[i],dx=b.p.x-k[0],dz=b.p.z-k[1],d2=dx*dx+dz*dz;
    if(d2>=R*R||d2===0)continue;
    const d=Math.sqrt(d2),nx=dx/d,nz=dz/d,vn=b.v.x*nx+b.v.z*nz;
    b.p.x=k[0]+nx*R;b.p.z=k[1]+nz*R;
    if(vn<0){b.v.x-=nx*vn*(1+E_CUSH);b.v.z-=nz*vn*(1+E_CUSH);if(b.i===LOG.cueI)LOG.cush++;else LOG.objC[b.i]++;if(LIVE)sfx('cushion',Math.min(1,-vn/4));}
  }
}
function collide(A,C){
  tA.subVectors(C.p,A.p);const dist=tA.length();if(dist>=D2||dist===0)return;
  const n=tA.multiplyScalar(1/dist);
  const vrel=(A.v.x-C.v.x)*n.x+(A.v.y-C.v.y)*n.y+(A.v.z-C.v.z)*n.z;
  const ov=(D2-dist)/2;A.p.addScaledVector(n,-ov);C.p.addScaledVector(n,ov);
  if(vrel<=0)return;
  const Jn=(1+E_BALL)*M*vrel/2;
  A.v.addScaledVector(n,-Jn/M);C.v.addScaledVector(n,Jn/M);
  tB.copy(n).multiplyScalar(R);tC.addVectors(A.w,C.w).cross(tB);
  tD.subVectors(A.v,C.v).add(tC);tD.addScaledVector(n,-tD.dot(n));
  const vt=tD.length();
  if(vt>1e-6){const Jt=Math.min(MU_BALL*Jn,M*vt/7);tD.multiplyScalar(1/vt);
    A.v.addScaledVector(tD,-Jt/M);C.v.addScaledVector(tD,Jt/M);
    tE.crossVectors(tB,tD).multiplyScalar(-Jt/I);A.w.add(tE);C.w.add(tE);}
  const ci=LOG.cueI;
  if(A.i===ci||C.i===ci){const o=A.i===ci?C.i:A.i;if(!LOG.hits.includes(o)){LOG.hits.push(o);LOG.cushAt.push(LOG.cush);}}
  if(LIVE)sfx('ball',Math.min(1,vrel/3));
}
function stepAll(dt){
  const n=B.length;
  for(let i=0;i<n;i++)stepBall(B[i],dt);
  for(let i=0;i<n-1;i++){const A=B[i];if(A.off)continue;for(let j=i+1;j<n;j++){const C=B[j];if(C.off)continue;const dx=C.p.x-A.p.x;if(dx>D2||dx<-D2)continue;const dz=C.p.z-A.p.z;if(dz>D2||dz<-D2)continue;collide(A,C);}}
}
function anyMoving(list){for(let i=0;i<list.length;i++){const b=list[i];if(b.fly)return true;if(!b.off&&(b.v.lengthSq()>4e-6||b.p.y>R+1e-4))return true;}return false;}
function stepLive(dt){B=LB;LOG=liveLog;LIVE=true;const n=Math.ceil(dt/DT);for(let i=0;i<n;i++)stepAll(DT);LIVE=false;}

// 가상 시뮬레이션 (AI·검증용)
const SIMB=[];
function simClone(){const out=[];for(let i=0;i<LB.length;i++){const s=SIMB[i]||(SIMB[i]={p:new V(),v:new V(),w:new V(),off:false,pot:false,i,num:-1});const b=LB[i];s.p.copy(b.p);s.v.set(0,0,0);s.w.set(0,0,0);s.off=b.off;s.pot=b.pot;s.i=i;s.num=b.num;out.push(s);}return out;}
function runSim(cueI,v,w,dt,maxT){
  const sB=B,sL=LOG,sv=LIVE;B=simClone();LOG=newLog(cueI,B.length);LIVE=false;
  B[cueI].v.copy(v);B[cueI].w.copy(w);
  let t=0,k=0;while(t<maxT){stepAll(dt);t+=dt;if((++k&15)===0&&!anyMoving(B))break;}
  const res={log:LOG,balls:B};B=sB;LOG=sL;LIVE=sv;return res;
}

// ---------- 샷 ----------
function hDir(phi){return new V(Math.cos(phi),0,Math.sin(phi));}
function cueDir(phi,e){const h=hDir(phi),t=e*Math.PI/180;return new V(h.x*Math.cos(t),-Math.sin(t),h.z*Math.cos(t));}
function frame(d){const right=new V().crossVectors(d,Y).normalize();const up=new V().crossVectors(right,d).normalize();return {right,up};}
function contactRel(d,a,b){const {right,up}=frame(d);const ox=a*R,oy=b*R;const back=Math.sqrt(Math.max(0,R*R-ox*ox-oy*oy));return new V().addScaledVector(d,-back).addScaledVector(right,ox).addScaledVector(up,oy);}
function buildShot(phi,a,b,e,pw,opts){
  if(opts.tremor)phi+=gauss()*0.005*pw;
  const d=cueDir(phi,e);let V0=0.45+pw*6.6,mis=false;
  const rc=contactRel(d,a,b);
  if(opts.miscue&&Math.hypot(a,b)>MISCUE){mis=true;V0*=0.3;d.applyAxisAngle(Y,(Math.random()-.5)*0.14);rc.multiplyScalar(0.4);}
  if(opts.squirt)d.applyAxisAngle(Y,a*0.035);
  const v=d.clone().multiplyScalar(V0),J=d.clone().multiplyScalar(M*V0);
  const w=new V().crossVectors(rc,J).multiplyScalar(1/I);
  return {v,w,mis};
}
function fireLive(cueI,s){
  liveLog=newLog(cueI,LB.length);liveLog.mis=!!s.mis;liveLog.cueFoul=!!s.cueFoul;
  LB[cueI].v.copy(s.v);LB[cueI].w.copy(s.w);
  phase='shot';shotT=0;stillT=0;power=0;
  const sp=s.v.length();sfx(s.mis?'miscue':'cue',clamp(sp/7,.2,1));
  if(s.mis)toast('MISCUE',true);
  updateUI();
}
