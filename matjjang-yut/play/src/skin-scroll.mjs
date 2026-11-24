// Touch and trackpads keep native momentum; mouse dragging coasts on release.
export function enableSkinScroll(row){
  let drag=null,suppress=false,frame=0;
  function stop(){cancelAnimationFrame(frame);frame=0;}
  function coast(velocity){
    let previous=performance.now(),position=row.scrollLeft;
    function tick(now){
      const elapsed=Math.max(0,Math.min(now-previous,32));previous=now;
      const limit=Math.max(0,row.scrollWidth-row.clientWidth);
      // Keep subpixel distance even when the browser rounds scrollLeft. A short
      // first frame must not be mistaken for reaching the end of the shelf.
      position=Math.max(0,Math.min(limit,position+velocity*elapsed));
      row.scrollLeft=position;
      velocity*=Math.exp(-elapsed/180);
      if(Math.abs(velocity)>.02&&(velocity<0?position>0:position<limit))frame=requestAnimationFrame(tick);
      else frame=0;
    }
    frame=requestAnimationFrame(tick);
  }
  function end(event){
    if(!drag||drag.id!==event.pointerId)return;
    const last=drag;drag=null;row.classList.remove('is-dragging');
    if(row.hasPointerCapture(event.pointerId))row.releasePointerCapture(event.pointerId);
    if(event.type==='pointerup'&&last.moved&&event.timeStamp-last.time<80)coast(last.velocity);
    setTimeout(()=>{suppress=false;},0);
  }
  row.addEventListener('pointerdown',event=>{
    stop();row.scrollTo({left:row.scrollLeft,behavior:'instant'});
    if(event.pointerType==='mouse'&&event.button===0){
      suppress=false;drag={id:event.pointerId,start:event.clientX,x:event.clientX,left:row.scrollLeft,time:event.timeStamp,velocity:0,moved:false};
    }
  });
  row.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    if(!drag.moved&&Math.abs(event.clientX-drag.start)<=5)return;
    if(!drag.moved){drag.moved=true;suppress=true;row.classList.add('is-dragging');row.setPointerCapture(event.pointerId);}
    event.preventDefault();
    const elapsed=event.timeStamp-drag.time;
    if(elapsed>0)drag.velocity=Math.max(-2.5,Math.min(2.5,(drag.x-event.clientX)/elapsed));
    row.scrollLeft=drag.left+drag.start-event.clientX;
    drag.x=event.clientX;drag.time=event.timeStamp;
  });
  window.addEventListener('pointerup',end);
  window.addEventListener('pointercancel',end);
  row.addEventListener('lostpointercapture',end);
  row.addEventListener('wheel',stop,{passive:true});
  row.addEventListener('click',event=>{if(suppress){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
  return function center(card,behavior='smooth'){
    stop();
    const a=card.getBoundingClientRect(),b=row.getBoundingClientRect();
    row.scrollTo({left:row.scrollLeft+a.left-b.left-(b.width-a.width)/2,behavior});
  };
}
