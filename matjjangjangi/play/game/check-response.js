import { inCheck, legalMoves, sideOf } from './rules.js';
import { speechPlacement } from './threat-geometry.js';

export function checkResponse(before, after, move) {
  const from = move?.from, to = move?.to ?? move?.index;
  if (![from,to].every(Number.isInteger) || from === to || before?.length !== 90 || after?.length !== 90) return null;
  const side = sideOf(before[from]);
  if (!side || !inCheck(before, side) || inCheck(after, side) || !legalMoves(before, side).some(m => m.from === from && m.to === to)) return null;
  const expected = [...before]; expected[to] = expected[from]; expected[from] = 0;
  return expected.every((piece,i) => piece === after[i]) ? { side, from, to } : null;
}

const controllers = new WeakMap();
function controller(board, cells) {
  const grid = board.querySelector('.board-grid'), bubble = document.createElement('span');
  bubble.className = 'jangi-threat-speech jangi-response-speech'; bubble.hidden = true;
  bubble.setAttribute('role','status'); bubble.setAttribute('aria-live','polite'); grid.append(bubble);
  let previous, lastScope, lastStep, caller, flipped, start, end, active = false;
  function hide() { clearTimeout(start); clearTimeout(end); bubble.hidden = true; active = false; }
  function clear() { hide(); previous = null; lastScope = null; lastStep = null; }
  function position() {
    if (bubble.hidden || caller === undefined) return;
    const bounds = grid.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const box=cell=>{
      const point=flipped?89-Number(cell.dataset.index):Number(cell.dataset.index),style=getComputedStyle(cell.querySelector('.stone'));
      const width=parseFloat(style.width)||bounds.width/9,height=parseFloat(style.height)||bounds.height/10;
      return{x:(point%9+.5)*bounds.width/9-width/2,y:(Math.floor(point/9)+.5)*bounds.height/10-height/2,width,height};
    };
    const anchor=cells[caller],size=bubble.getBoundingClientRect();
    const best=speechPlacement(box(anchor),size,bounds,cells.filter(cell=>cell!==anchor&&cell.dataset.stone!=='0').map(box),{preferredSide:'bottom'});
    bubble.style.left=best.x+'px';bubble.style.top=best.y+'px';
    bubble.dataset.tail=best.side;bubble.style.setProperty('--tail-offset',best.tail+'px');
    bubble.dataset.caller=caller;
  }
  function render({shown,scope,step,move,nextFlipped,t}) {
    const adjacent = lastScope === scope && step === lastStep+1;
    const response = adjacent && previous ? checkResponse(previous,shown,move) : null;
    const changed = lastScope !== scope || lastStep !== step || previous?.some((p,i)=>p!==shown[i]);
    if(changed)hide();
    previous=[...shown];lastScope=scope;lastStep=step;flipped=nextFlipped;
    bubble.textContent=t('jangiRepelCall');
    if(response && !document.hidden){
      caller=response.to;active=true;
      start=setTimeout(()=>{
        bubble.hidden=false;position();
        bubble.animate([{opacity:0,transform:'translateY(5px) scale(.8)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:200,easing:'ease-out'});
        end=setTimeout(hide,1100);
      },360);
    }
    position();return active;
  }
  new ResizeObserver(position).observe(grid);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});
  return {render,clear};
}
export function renderCheckResponse({board,cells,...input}) {
  if(!controllers.has(board))controllers.set(board,controller(board,cells));
  return controllers.get(board).render(input);
}
export function clearCheckResponse(board) {controllers.get(board)?.clear();}
