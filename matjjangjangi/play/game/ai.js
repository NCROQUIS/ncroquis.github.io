import { apply, inCheck, legalMoves, pseudoMoves, sideOf, VALUES, SOLDIER, KING, ROOK, CANNON, HORSE, ELEPHANT } from './rules.js';

// A small deterministic practice opponent; it is explicitly labelled as AI in the UI.
export function evaluate(board, side) {
  let total = 0;
  const attacks=[null,new Set(),new Set()];
  for(let i=0;i<90;i++)if(board[i])for(const to of pseudoMoves(board,i))attacks[sideOf(board[i])].add(to);
  for (let i = 0; i < 90; i++) {
    const piece = board[i];
    if (!piece) continue;
    const owner = sideOf(piece), kind = Math.abs(piece), y = Math.floor(i / 9), x = i % 9;
    let value = VALUES[kind] * 100;
    if (kind !== KING) value += (4 - Math.abs(4 - x)) * 5;
    if (kind === SOLDIER) value += (owner === 1 ? 9 - y : y) * 12;
    if ([ROOK,HORSE,ELEPHANT].includes(kind)) value += pseudoMoves(board,i).length*3;
    if (kind===CANNON) value += pseudoMoves(board,i).length*4;
    if (kind!==KING && attacks[3-owner].has(i)) value -= VALUES[kind]*(attacks[owner].has(i)?8:45);
    total += owner === side ? value : -value;
  }
  if(inCheck(board,side))total-=60;if(inCheck(board,3-side))total+=60;
  return total;
}
function ordered(board, side) {
  return legalMoves(board, side).sort((a, b) =>
    ((VALUES[Math.abs(board[b.to])] || 0) * 100 - VALUES[Math.abs(board[b.from])]) -
    ((VALUES[Math.abs(board[a.to])] || 0) * 100 - VALUES[Math.abs(board[a.from])]));
}

export function analyzeMoves(state,{depth=3,nodeLimit=6000,timeLimitMs=180,now=()=>performance.now()}={}) {
  if(state.winner!==null)return {candidates:[],nodes:0,depth:0};
  const deadline=now()+timeLimitMs;let nodes=0,aborted=false,completedDepth=0;
  const expired=()=>nodes>=nodeLimit||now()>=deadline;
  function actions(s) {const list=ordered(s.board,s.turn);if(!inCheck(s.board,s.turn))list.push({type:'pass'});return list;}
  function search(s,remaining,alpha,beta,qdepth=2) {
    if(s.winner!==null)return s.winner===0?0:s.winner===s.turn?1000000-s.ply:-1000000+s.ply;
    if(expired()){aborted=true;return evaluate(s.board,s.turn);}nodes++;
    const checked=inCheck(s.board,s.turn);
    if(remaining<=0&&!checked) {
      const stand=evaluate(s.board,s.turn);if(qdepth<=0||stand>=beta)return stand;
      alpha=Math.max(alpha,stand);
      for(const m of actions(s).filter(m=>m.type==='move'&&s.board[m.to])) {
        const value=-search(apply(s,m),0,-beta,-alpha,qdepth-1);
        if(aborted)return alpha;alpha=Math.max(alpha,value);if(alpha>=beta)break;
      }
      return alpha;
    }
    if(remaining<=0&&qdepth<=0)return evaluate(s.board,s.turn);
    const moves=actions(s);if(!moves.length)return checked?-1000000-s.ply:0;
    let best=-Infinity;
    for(const m of moves) {
      const value=-search(apply(s,m),remaining-1,-beta,-alpha,remaining<=0?qdepth-1:qdepth);
      if(aborted)return best===-Infinity?evaluate(s.board,s.turn):best;
      best=Math.max(best,value);alpha=Math.max(alpha,value);if(alpha>=beta)break;
    }
    return best;
  }
  const moves=actions(state);let candidates=[];
  for(const move of moves) {
    const next=apply(state,move);
    const score=next.winner!==null?(next.winner===0?0:next.winner===state.turn?1000000:-1000000):-evaluate(next.board,next.turn);
    candidates.push({move,score});
    if(next.winner===state.turn)return {candidates:[{move,score:1000000,mate:1}],nodes,depth:1};
  }
  candidates.sort((a,b)=>b.score-a.score);
  for(let level=1;level<=depth&&!expired();level++) {
    const iteration=[];
    for(const entry of candidates) {
      if(expired()){aborted=true;break;}
      const score=-search(apply(state,entry.move),level-1,-Infinity,Infinity);
      if(aborted)break;iteration.push({move:entry.move,score});
    }
    if(aborted)break;
    candidates=iteration.sort((a,b)=>b.score-a.score);completedDepth=level;
  }
  return {candidates,nodes,depth:completedDepth};
}
export function chooseMove(state,options={}) {return analyzeMoves(state,options).candidates[0]?.move??null;}
