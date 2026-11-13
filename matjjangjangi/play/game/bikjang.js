import {apply,facing,KING} from './rules.js';

export const isBikjangDraw = game => !game?.winner &&
  (game?.endReason ?? game?.reason ?? game?.recordDetail?.state?.endReason) === 'bikjang';

// Public snapshots omit repetition history and use 0 for an unfinished winner.
// The shared rules still decide checkmate priority and whether this action accepts bikjang.
export function endsInBikjangDraw(game,action) {
  if(!game?.bikjang || game.phase!=='playing' || game.setup)return false;
  try {
    const next=apply({...game,winner:null,positions:{},passes:0},
      action.type==='move'?{...action,to:action.to??action.index}:action);
    return next.winner===0 && next.reason==='bikjang';
  } catch {return false;}
}

export function bikjangGeometry(board,flipped=false) {
  if(!facing(board))return null;
  const kings=[board.indexOf(KING),board.indexOf(-KING)];
  const points=kings.map(index=>{
    const visible=flipped?89-index:index;
    return [visible%9+.5,Math.floor(visible/9)+.5];
  });
  return {kings,path:`M${points[0].join(' ')}L${points[1].join(' ')}`};
}
