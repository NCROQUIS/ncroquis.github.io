import {createGame,ROUTES} from './game.mjs';
import {createRenderer} from './renderer.mjs';

// A separate, unsaved sample position uses the exact in-game piece geometry.
export function createSkinPreviewGame(){
  const game=createGame([1,1,1,1]);game.opening=null;
  for(const [id,node] of [[0,'o16'],[1,'o16'],[4,'o19'],[8,'o14'],[12,'o1']]){
    game.pieces[id].history=ROUTES.outer.slice(0,ROUTES.outer.indexOf(node)+1).map(node=>({node,route:'outer'}));
  }
  return game;
}

export function mountSkinPreview(canvas,{skins,getSelection}){
  const ctx=canvas.getContext('2d'),scene=document.createElement('canvas');
  const host=document.createElement('div');host.append(scene);
  const game=createSkinPreviewGame();
  const renderer=createRenderer(scene,{game,interactive:false,skins:{
    get:getSelection,image:skins.image,look:skins.look,record:skins.record,
    sprite:player=>skins.sprite(player,getSelection().pieces)
  }});
  let frame=0,disposed=false;
  function paint(){
    frame=0;if(disposed)return;
    const {width:w,height:h}=canvas.getBoundingClientRect();if(w<1||h<1)return;
    const dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    // Enlarge the lower board while keeping the actual in-game camera and
    // relative sizes. The sample pieces and all four sticks sit in this crop.
    renderer.resize(400,408,dpr);
    const source={x:16,y:128,width:368,height:216},zoom=Math.min((w-8)/source.width,(h-4)/source.height);
    const width=source.width*zoom,height=source.height*zoom;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#fcf5e7';ctx.fillRect(0,0,w,h);
    ctx.drawImage(scene,source.x*dpr,source.y*dpr,source.width*dpr,source.height*dpr,(w-width)/2,(h-height)/2,width,height);
    canvas.dataset.selection=JSON.stringify(getSelection());canvas.dataset.nodes=scene.dataset.boardNodes;
    canvas.dataset.renderer='in-game';
    canvas.dataset.framing='lower-half';
  }
  function draw(){if(disposed)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(paint);}
  const observer=new ResizeObserver(draw);observer.observe(canvas.parentElement);
  document.fonts.ready.then(draw);
  return{draw,dispose(){disposed=true;observer.disconnect();cancelAnimationFrame(frame);host.replaceChildren();}};
}
