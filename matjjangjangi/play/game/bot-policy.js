import {apply,inCheck,legalMoves,ROOK,VALUES} from './rules.js';
import {botProfile,seededRandom} from './bot-profiles.js';

export const actionKey=m=>m.type==='pass'?'pass':`${m.from}:${m.to??m.index}`;
export function legalBotActions(state) {
  const actions=legalMoves(state.board,state.turn);
  if(!inCheck(state.board,state.turn))actions.push({type:'pass'});
  return actions;
}
function hangingRook(state,move) {
  const next=apply(state,move);if(next.winner!==null)return false;
  const captured=move.type==='move'?VALUES[Math.abs(state.board[move.to])]:0;
  return legalMoves(next.board,next.turn).some(reply=>Math.abs(next.board[reply.to])===ROOK&&
    captured<VALUES[ROOK]-1);
}
export function selectBotCandidate(state,level,candidates,{seed='',memory={}}={}) {
  const profile=botProfile(level),legal=new Set(legalBotActions(state).map(actionKey));
  const valid=candidates.filter(c=>legal.has(actionKey(c.move))&&Number.isFinite(c.score));
  if(!valid.length)throw new Error('engineNoLegalCandidate');
  valid.sort((a,b)=>b.score-a.score);
  const instant=valid.find(c=>apply(state,c.move).winner===state.turn);
  if(instant)return {action:instant.move,memory,lossCp:0,alternative:false};
  const best=valid[0],random=seededRandom(seed);
  const alternatives=valid.slice(1).filter(c=>best.score-c.score<=profile.maxLossCp&&
    !(c.mate<0&&!(best.mate<0))&&!(memory.cooldown>0&&best.score-c.score>=100)&&!hangingRook(state,c.move));
  let selected=best;
  if(alternatives.length&&random()*100<profile.alternativePercent) {
    const weights=alternatives.map(c=>Math.exp(-(best.score-c.score)/Math.max(15,profile.maxLossCp/3)));
    let point=random()*weights.reduce((a,b)=>a+b,0);
    selected=alternatives.find((_,i)=>(point-=weights[i])<=0)??alternatives.at(-1);
  }
  const lossCp=best.score-selected.score;
  return {action:selected.move,lossCp,alternative:selected!==best,
    memory:{cooldown:lossCp>=100?3:Math.max(0,(memory.cooldown??0)-1)}};
}
