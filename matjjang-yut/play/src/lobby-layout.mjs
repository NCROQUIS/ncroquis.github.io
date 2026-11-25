import {APPROVED_LAYOUT,applyLayout} from './lobby-layout-model.mjs';

export function mountLobbyLayout(){
  const root=document.querySelector('#lobby');
  let frame=0;
  const update=()=>{frame=0;if(root.dataset.layoutPreview!=='true')applyLayout(window,APPROVED_LAYOUT);};
  const queue=()=>{if(!frame)frame=requestAnimationFrame(update);};
  new ResizeObserver(queue).observe(root);
  window.addEventListener('resize',queue);
  document.fonts.ready.then(queue);
  update();
}
