export const isTerminalEntry = game => ['finished','closed'].includes(game?.phase);

// Release a previous terminal room without mounting its result screen.
// Saving happens before release, and a richer terminal reply is also preserved.
export async function retirePreviousRoom(game,{save,leave}) {
  if(!isTerminalEntry(game))return {retired:false};
  if(game.phase==='finished')save(game);
  const result=await leave(game);
  if(result?.phase==='finished')save(result);
  if(result?.error&&result.error!=='notFound')return result;
  return {retired:true};
}
