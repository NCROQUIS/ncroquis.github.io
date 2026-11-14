export const BOT_POLICY_VERSION = 'jangi-bot-v1';
// Server tuning: level 0 = 18 kyu, 17 = 1 kyu, 18 = 1 dan, 26 = 9 dan.
export const BOT_TUNING = Object.freeze({
  rookProtection: Object.freeze({ enabled: true, fromLevel: 18 }),
  captureOversight: Object.freeze({
    percentByLevel: Object.freeze(Array.from({length:27},(_,level)=>Math.max(0,15-level))),
    maxPieceValue: 13,
  }),
  mistakeProtection: Object.freeze({
    percentByLevel: Object.freeze(Array.from({length:27},(_,level)=>Math.max(0,100-(26-level)*4))),
    minLossCp: 100,
  }),
});
const budgets = [30,40,50,60,75,90,110,135,160,190,230,280,340,410,500,600,720,850,1000,1200,1450,1750,2100,2500,3000,3600,4500];
export const BOT_PROFILES = Object.freeze(budgets.map((thinkMs,level)=>Object.freeze({
  level, name:level<18?`${18-level}급`:`${level-17}단`, version:BOT_POLICY_VERSION,
  thinkMs, maxNodes:Math.round(thinkMs*700), alternativePercent:(26-level)*3, maxLossCp:(26-level)*20,
  multiPV:27-level,
  protectRooks:BOT_TUNING.rookProtection.enabled&&level>=BOT_TUNING.rookProtection.fromLevel,
  captureOversightPercent:BOT_TUNING.captureOversight.percentByLevel[level],
  captureOversightMaxPieceValue:BOT_TUNING.captureOversight.maxPieceValue,
  mistakeProtectionPercent:BOT_TUNING.mistakeProtection.percentByLevel[level],
  mistakeProtectionMinLossCp:BOT_TUNING.mistakeProtection.minLossCp,
})));
export const botDecisionSeed = room => `${room.id??room.code}:${room.round??1}:${room.state.ply}:${room.state.turn}:${BOT_POLICY_VERSION}`;
export const botProfile = level => BOT_PROFILES[Number.isInteger(level)?Math.max(0,Math.min(26,level)):0];
export function botLimits(state, level, now=Date.now()) {
  const profile=botProfile(level);let remaining=Infinity;
  if(state.clock?.kind==='cumulative-v1') {
    const {deadline,refills}=state.clock,available=refills[state.turn-1];
    const used=now>=deadline?Math.min(available,Math.floor((now-deadline)/30000)+1):0;
    remaining=Math.max(0,deadline+used*30000-now);
  }
  const thinkMs=Math.max(1,Math.min(profile.thinkMs,remaining<=5000?300:remaining<=30000?1500:Infinity,remaining-1000));
  return {...profile,thinkMs,maxNodes:Math.max(1,Math.min(profile.maxNodes,Math.round(thinkMs*700))),remainingMs:remaining};
}
export function seededRandom(seed) {
  let n=2166136261;for(const c of String(seed))n=Math.imul(n^c.charCodeAt(0),16777619);
  return ()=>{n+=0x6D2B79F5;let t=Math.imul(n^n>>>15,n|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}
