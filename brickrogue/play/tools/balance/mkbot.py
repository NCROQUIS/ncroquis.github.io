import sys
src=sys.argv[1]; dst=sys.argv[2]
s=open(src,encoding='utf8').read()
a="if(!win&&!quit&&!st.dg&&!st.loseShown)"; assert a in s
s=s.replace(a,"if(!window.__noCont&&!win&&!quit&&!st.dg&&!st.loseShown)")
a="if(!win&&!quit&&!st.dg&&!st.contUsed)"; assert a in s
s=s.replace(a,"if(!window.__noCont&&!win&&!quit&&!st.dg&&!st.contUsed)")
a="function endRun(win,quit){"; assert a in s
s=s.replace(a,a+"if(st&&st.phase!=='over')window.__lastWin=!!win;if(st&&st.phase!=='over'&&!win)window.__why=(new Error()).stack.split('\\n').slice(1,4).map(x=>x.trim().split(' ')[1]).join('<')+' sh'+st.shields+' picks:'+st.picks.map(p=>p.name).join(',');")
for a,b in [("function hpAt(S,w){return hpAt0(S,w)*(S.hx||1);}","function hpAt(S,w){return hpAt0(S,w)*(S.hx||1)*(window.__hx||1);}"),
  ("st.S.bossAbs*(st.S.hx||1):hpAt(","st.S.bossAbs*(st.S.hx||1)*(window.__hx||1):hpAt("),
  ("hp=Math.round(MINION_HP*st.S.hp*(st.S.hx||1));","hp=Math.round(MINION_HP*st.S.hp*(st.S.hx||1)*(window.__hx||1));"),
  ("const shK=dg?dgReq(dg.lv)/dgReq(1):(S.hx||1);","const shK=(dg?Math.max(1,dgReq(dg.lv)/dgReq(11)):(S.hx||1))*(window.__hx||1);")]:
    assert a in s,a
    s=s.replace(a,b)
a="function dgReq(lv){if(lv<=1)return 0.7;"; assert a in s
s=s.replace(a,"function dgReq(lv){if(window.__dx)return dgReq0(lv)*window.__dx;return dgReq0(lv);}\nfunction dgReq0(lv){if(lv<=1)return 0.7;")
i=s.rindex('})();')
s=s[:i]+r"""
window.__noCont=true;window.__syncSkills=true;
window.__t={ev:f=>eval(f)};
// 시험 봇 조준: 아래쪽(위험한) 몬스터를 더 자주 노리고, 바위에 가로막힌 방향은 피해요
window.__aim=function(){
  const L=st.bricks.filter(b=>!b.dead&&!b.rock);if(!L.length)return -Math.PI/2;
  const RK=st.rocks||[],y0=FLOOR-8,x0=st.lx,cl=a=>Math.max(-Math.PI+0.2,Math.min(-0.2,a));
  const blocked=(tx,ty)=>{for(let i=1;i<28;i++){const x=x0+(tx-x0)*i/28,y=y0+(ty-y0)*i/28,c=Math.floor(x/CELL),r=Math.floor((y-TOP)/CELL);for(const k of RK)if(k.r===r&&k.c===c)return true;}return false;};
  const wt=b=>Math.pow(b.r+b.h,2)+1,ws=L.reduce((a,b)=>a+wt(b),0);
  for(let t=0;t<14;t++){let x=Math.random()*ws,b=L[0];for(const q of L){x-=wt(q);if(x<=0){b=q;break;}}
    const c=center(b);if(!blocked(c.x,c.y))return cl(Math.atan2(c.y-y0,c.x-x0)+(Math.random()-0.5)*0.14);}
  return cl(-Math.PI/2+(Math.random()-0.5)*1.6);
};
window.__bot=function(stage,dg){
  save.stage=stage||0;save.energy=99;newRun(stage||0,dg||undefined);
  let guard=0,kills=0;const me=st;
  while(guard++<600000){
    if(!st||st!==me)break;
    if(st.phase==='over')break;
    if(window.__stopAt&&st.turn>=window.__stopAt&&st.phase==='aim'&&!ovCards.classList.contains('show'))break; // 화면 확인용: 그 웨이브에서 멈춰요
    if(ovCards.classList.contains('show')){const o=curOpts[Math.random()*curOpts.length|0];if(!o){afterPick();continue;}adBusy=false;pickCard(o,null);continue;}
    if(st.phase==='aim'){startFire(window.__aim());continue;}
    if(st.phase==='between'){if(st.pending>0&&!ovCards.classList.contains('show'))openCards();else if(!st.pending)nextWave();continue;}
    update();
  }
  const s2=me;
  return {turn:s2.turn,total:s2.total,lv:s2.level,win:window.__lastWin,left:s2.bricks.filter(b=>!b.dead).length,ph:s2.phase,why:window.__lastWin?'':window.__why,gold:s2.goldRun,g:guard,picks:s2.picks.length};
};
"""+s[i:]
open(dst,'w',encoding='utf8').write(s)
