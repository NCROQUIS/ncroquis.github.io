import {KING,sideOf} from './rules.js';
import {capturedToken} from './captured-pieces.js';
import {pieceStyleForSeat} from './piece-skins.js';

export const CAPTURE_FLIGHT_MS=440;
export function captureMove(before,move){
  const from=move?.from,to=move?.to??move?.index;
  if(before?.length!==90||![from,to].every(n=>Number.isInteger(n)&&n>=0&&n<90)||from===to)return null;
  const attacker=before[from],victim=before[to];
  if(!attacker||!victim||Math.abs(victim)===KING||sideOf(attacker)===sideOf(victim))return null;
  const after=[...before];after[from]=0;after[to]=attacker;
  return{from,to,attacker,victim,after};
}

// One cosmetic transaction. The displayed position owns inventory; this only hides its arriving token.
export function createCaptureFlight(){
  let active;
  const layer=document.createElement('div');layer.className='jangi-capture-layer';layer.setAttribute('aria-hidden','true');
  document.body.append(layer);
  function cancel(){
    const run=active;if(!run)return;active=null;clearTimeout(run.timer);run.animation?.cancel();
    run.arrival?.removeAttribute('data-capture-arriving');run.node.remove();run.resolve();
  }
  function destination(run){
    const tray=document.getElementById(run.tray),pile=tray?.querySelector(`[data-kind="${Math.abs(run.victim)}"]`);
    return pile?.lastElementChild;
  }
  function synchronize({scope,board}){
    const run=active;if(!run)return;
    if(run.scope!==scope||run.after.some((p,i)=>p!==board[i]))return cancel();
    const target=destination(run);
    if(!target?.isConnected||!target.getBoundingClientRect().width)return cancel();
    if(target!==run.arrival){run.arrival?.removeAttribute('data-capture-arriving');run.arrival=target;}
    target.setAttribute('data-capture-arriving','');
  }
  function prepare({game,before,move,scope,tray,cell,localStyle}){
    cancel();const capture=captureMove(before,move);
    if(!capture||document.hidden||!cell?.getBoundingClientRect().width)return null;
    let resolve;const finished=new Promise(done=>resolve=done);
    const run={...capture,scope,tray,resolve,finished};
    const arrival=destination(run);if(!arrival?.getBoundingClientRect().width)return null;
    run.arrival=arrival;arrival.setAttribute('data-capture-arriving','');
    const seat=sideOf(capture.victim)===1?game.black??1:3-(game.black??1);
    const node=capturedToken(capture.victim,pieceStyleForSeat(game,seat,localStyle));
    node.dataset.kind=Math.abs(capture.victim);
    // Do not let this temporary defender change :has([data-kind]) rules for the moving piece's shadow.
    node.querySelector('.stone').dataset.kind='captured';
    node.classList.add('jangi-capture-victim');node.setAttribute('aria-hidden','true');
    Object.assign(node.querySelector('.stone').style,{width:'100%',height:'100%',fontSize:'inherit',transform:'none'});
    cell.append(node);
    const style=getComputedStyle(node),small=[2,7].includes(Math.abs(capture.victim));
    const size=parseFloat(style.getPropertyValue(small?'--jangi-small-size':'--jangi-piece-size'))||98;
    const font=parseFloat(style.getPropertyValue(small?'--jangi-small-type':'--jangi-type-size'))||6.5;
    const width=cell.getBoundingClientRect().width*size/100;
    node.style.width=width+'px';node.style.height=width+'px';
    node.style.fontSize=(cell.closest('.board-grid').getBoundingClientRect().width*font/100)+'px';
    run.node=node;active=run;
    return{finished,movementEnded(){if(active===run&&!run.launched)cancel();},contact(){
      if(active!==run||run.launched)return;run.launched=true;
      const a=node.getBoundingClientRect(),b=run.arrival.getBoundingClientRect();
      if(document.hidden||!b.width)return cancel();
      const x=b.x+b.width/2-a.x-a.width/2,y=b.y+b.height/2-a.y-a.height/2,scale=b.width/a.width;
      node.classList.remove('jangi-capture-victim');node.classList.add('jangi-capture-flying');
      layer.append(node);node.style.left=a.x+'px';node.style.top=a.y+'px';
      run.animation=node.animate([
        {transform:'translate(0,0) scale(1)'},
        {offset:.22,transform:`translate(${x*.28+14}px,${y*.22-20}px) scale(1.04) rotate(-7deg)`},
        {offset:.62,transform:`translate(${x*.73+8}px,${y*.68-14}px) scale(${Math.max(.8,scale)}) rotate(4deg)`},
        {transform:`translate(${x}px,${y}px) scale(${scale}) rotate(0)`},
      ],{duration:CAPTURE_FLIGHT_MS,easing:'cubic-bezier(.1,.74,.28,1)',fill:'forwards'});
      const complete=()=>{if(active===run)cancel();};
      run.animation.finished.then(complete,complete);run.timer=setTimeout(complete,CAPTURE_FLIGHT_MS+100);
    }};
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
  window.addEventListener('resize',cancel);
  window.NcqSafe?.onChange(cancel);
  return{prepare,synchronize,cancel};
}
