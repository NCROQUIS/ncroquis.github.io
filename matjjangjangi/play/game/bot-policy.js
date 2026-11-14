import {apply,inCheck,legalMoves,KING,ROOK,VALUES} from './rules.js';
import {botProfile,seededRandom} from './bot-profiles.js';

export const actionKey=m=>m.type==='pass'?'pass':`${m.from}:${m.to??m.index}`;
export function protectionForTurn(profile,{seed='',memory={}}={}) {
  // An old counter becomes one pending opportunity; no countdown remains after the next confirmed move.
  const eligible=typeof memory.afterMistake==='boolean'?memory.afterMistake:(memory.cooldown??0)>0;
  const active=eligible&&seededRandom(seed+':mistake-protection')()*100<profile.mistakeProtectionPercent;
  return {eligible,active};
}
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
export function selectBotCandidate(state,level,candidates,{seed='',memory={},protection}={}) {
  const profile=botProfile(level),legal=new Set(legalBotActions(state).map(actionKey));
  protection??=protectionForTurn(profile,{seed,memory});
  const valid=candidates.filter(c=>legal.has(actionKey(c.move))&&Number.isFinite(c.score));
  if(!valid.length)throw new Error('engineNoLegalCandidate');
  valid.sort((a,b)=>b.score-a.score);
  const instant=valid.find(c=>apply(state,c.move).winner===state.turn);
  if(instant)return {action:instant.move,memory:{afterMistake:false},protection,lossCp:0,alternative:false};
  const best=valid[0],random=seededRandom(seed);
  const alternatives=valid.slice(1).filter(c=>best.score-c.score<=profile.maxLossCp&&
    !(c.mate<0&&!(best.mate<0))&&!(protection.active&&best.score-c.score>=profile.mistakeProtectionMinLossCp)&&
    !(profile.protectRooks&&hangingRook(state,c.move)));
  let selected=best;
  if(alternatives.length&&random()*100<profile.alternativePercent) {
    const weights=alternatives.map(c=>Math.exp(-(best.score-c.score)/Math.max(15,profile.maxLossCp/3)));
    let point=random()*weights.reduce((a,b)=>a+b,0);
    selected=alternatives.find((_,i)=>(point-=weights[i])<=0)??alternatives.at(-1);
  }
  const lossCp=best.score-selected.score;
  return {action:selected.move,lossCp,alternative:selected!==best,protection,
    memory:{afterMistake:lossCp>=profile.mistakeProtectionMinLossCp}};
}

// One immediate exchange only: this is a tunable missed threat, not a full engine evaluation.
function captureRisk(state,move,maxPieceValue) {
  const next=apply(state,move);if(next.winner!==null)return null;
  const gained=move.type==='move'?(VALUES[Math.abs(state.board[move.to])]??0):0;
  let risk=null;
  for(const reply of legalMoves(next.board,next.turn)) {
    const piece=Math.abs(next.board[reply.to]),value=VALUES[piece]??0;
    if(!piece||piece===KING||value>maxPieceValue||value<=gained)continue;
    const after=next.board.slice(),attacker=Math.abs(after[reply.from]);
    after[reply.to]=after[reply.from];after[reply.from]=0;
    const recaptured=legalMoves(after,state.turn).some(m=>m.to===reply.to);
    const netLoss=value-gained-(recaptured?VALUES[attacker]:0);
    if(netLoss<=0||netLoss<=(risk?.netMaterialLoss??0))continue;
    risk={piece,square:reply.to,reply,netMaterialLoss:netLoss,
      kind:move.type==='move'&&reply.to===move.to?'moved-piece':'ignored-threat'};
  }
  return risk?{next,risk}:null;
}

function losesImmediately(next,side) {
  for(const reply of legalMoves(next.board,next.turn)) {
    const board=next.board.slice();board[reply.to]=board[reply.from];board[reply.from]=0;
    if(inCheck(board,side)&&!legalMoves(board,side).length)return true;
  }
  return false;
}

export function selectCaptureOversight(state,profile,candidates,{seed='',memory={},protection}={}) {
  protection??=protectionForTurn(profile,{seed,memory});
  if(!(profile.captureOversightPercent>0)||protection.active)return null;
  const random=seededRandom(seed+':capture-oversight');
  if(random()*100>=profile.captureOversightPercent)return null;
  const legal=legalBotActions(state),keys=new Set(legal.map(actionKey));
  const valid=candidates.filter(c=>keys.has(actionKey(c.move))&&Number.isFinite(c.score)).sort((a,b)=>b.score-a.score);
  if(!valid.length)return null;
  // Preserve known wins and forced-loss handling, including callers outside analyzeRoom.
  if(legal.some(move=>apply(state,move).winner===state.turn))return null;
  const best=valid[0],maximum=profile.captureOversightMaxPieceValue;
  const baseline=captureRisk(state,best.move,Infinity)?.risk.netMaterialLoss??0;
  const known=new Map(valid.map(c=>[actionKey(c.move),c]));
  // Shuffle legal moves independently of engine rank so top-N and cp caps cannot erase the mistake.
  const choices=legal.filter(move=>move.type==='move'&&actionKey(move)!==actionKey(best.move));
  for(let i=choices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
  for(const move of choices) {
    const scored=known.get(actionKey(move));
    if(scored?.mate<0&&!(best.mate<0))continue;
    if(profile.protectRooks&&hangingRook(state,move))continue;
    const exposed=captureRisk(state,move,maximum);
    if(!exposed||exposed.risk.netMaterialLoss<=baseline||losesImmediately(exposed.next,state.turn))continue;
    return {action:move,alternative:true,decisionType:'capture-oversight',protection,
      lossCp:scored?best.score-scored.score:null,captureOversight:exposed.risk,
      memory:{afterMistake:true}};
  }
  return null;
}
