// Move the body above the board while its independent shadow follows the surface.
export const JANGI_TRAVEL_DURATION = 240;
export function jangiMoveTiming(landing = 80) {
  return { duration:JANGI_TRAVEL_DURATION + landing, contact:JANGI_TRAVEL_DURATION + landing * .4 };
}

export function animateJangiMove(from, cell, marker, { landing = 80, onStart, shouldContinue = () => true,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame } = {}) {
  const source = from.getBoundingClientRect(), target = cell.getBoundingClientRect();
  const x = source.left + source.width / 2 - target.left - target.width / 2;
  const y = source.top + source.height / 2 - target.top - target.height / 2;
  const lift = Math.min(11, target.width * .23);
  const {duration,contact} = jangiMoveTiming(landing);
  const raised = JANGI_TRAVEL_DURATION * .25 / duration, arrived = JANGI_TRAVEL_DURATION / duration;
  const impact = contact / duration, settle = (JANGI_TRAVEL_DURATION + landing * .78) / duration;
  const pose = (dx,dy,scale = '1') => `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`;
  const smooth = 'cubic-bezier(.3, 0, .2, 1)';
  const stone = [
    {offset:0,transform:pose(x,y),easing:'ease-out'},
    {offset:raised,transform:pose(x,y-lift,'1.12'),easing:smooth},
    {offset:arrived,transform:pose(0,-lift,'1.12'),easing:'ease-in'},
    {offset:impact,transform:pose(0,0,'1.04, .98'),easing:'ease-out'},
    {offset:settle,transform:pose(0,0,'.995, 1.005')},
    {offset:1,transform:pose(0,0)},
  ];
  const shadow = [
    {offset:0,transform:pose(x,y),opacity:1,filter:'blur(0px)',easing:'ease-out'},
    {offset:raised,transform:pose(x+2,y+2,'1.1'),opacity:.48,filter:'blur(1.3px)',easing:smooth},
    {offset:arrived,transform:pose(2,2,'1.1'),opacity:.48,filter:'blur(1.3px)',easing:'ease-in'},
    {offset:impact,transform:pose(0,0,'1.05, .98'),opacity:1,filter:'blur(0px)'},
    {offset:1,transform:pose(0,0),opacity:1,filter:'blur(0px)'},
  ];
  const animations = [
    [cell.querySelector('.stone'),stone], [cell.querySelector('.stone-shadow'),shadow],
    [marker,[{offset:0,opacity:0},{offset:impact,opacity:0},{offset:settle,opacity:1},{offset:1,opacity:1}]],
  ].filter(([element]) => element).map(([element,keyframes]) => {
    const animation = element.animate(keyframes,{duration,fill:'both',easing:'linear'});
    animation.pause(); animation.currentTime = 0;
    return animation;
  });
  let frame, started, stopped = false, resolve;
  const finished = new Promise(done => { resolve = done; });
  function cancel() {
    if (stopped) return;
    stopped = true; cancelFrame(frame);
    animations.forEach(animation => animation.cancel()); resolve();
  }
  function tick(time) {
    if (!shouldContinue()) return cancel();
    // Measure from the first displayed frame, including on a busy WebView.
    if (started === undefined) { started = time; onStart?.(contact); }
    const elapsed = Math.min(duration,Math.max(0,time-started));
    animations.forEach(animation => { animation.currentTime = elapsed; });
    if (elapsed >= duration) cancel();
    else frame = requestFrame(tick);
  }
  frame = requestFrame(tick);
  return {finished,cancel};
}
