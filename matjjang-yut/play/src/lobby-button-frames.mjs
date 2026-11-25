// Stitch slices on integer pixels before compositing. Direct border-image leaves
// hairline alpha gaps between patches when the approved side menus scale to 90%.
export function mountLobbyButtonFrames(){
  const buttons=document.querySelectorAll('.lobby-home .mode-button,.lobby-hero button,.bottom-nav button');
  const images=new Map(),cache=new Map(),pending=new Set();
  let frame=0;
  function source(skin){
    if(!images.has(skin)){
      const image=new Image();
      image.src=new URL('../assets/lobby-ui/button-'+skin+'.webp',import.meta.url).href;
      images.set(skin,image.decode().then(()=>image));
    }
    return images.get(skin);
  }
  async function paint(button){
    // Layout dimensions exclude the editor's and side menus' scale transforms.
    const width=button.getBoundingClientRect().width;
    if(!width||!button.offsetHeight)return;
    const style=getComputedStyle(button),skin=style.getPropertyValue('--button-image').match(/button-(gold|purple|brown|cream)\.webp/)?.[1];
    if(!skin)return;
    const w=parseFloat(style.width),h=parseFloat(style.height),scale=Math.max(2,window.devicePixelRatio||1);
    button.style.setProperty('--button-height',h+'px');
    const key=[skin,w,h,scale].join(':');button.dataset.buttonFramePending=key;
    const image=await source(skin);
    if(button.dataset.buttonFramePending!==key)return;
    if(!cache.has(key)){
      const canvas=document.createElement('canvas');
      canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
      const slices=style.getPropertyValue('--button-slice').trim().split(/\s+/).map(Number);
      const top=slices[0],side=slices[1]??top;
      const sx=[0,side,image.width-side,image.width],sy=[0,top,image.height-top,image.height];
      const border=top===0?h*side/image.height:parseFloat(style.getPropertyValue('--button-border'));
      const fit=top===0?1:Math.min(1,w/(border*2),h/(border*2));
      const x=Math.round(border*scale*fit),y=top===0?0:x;
      const dx=[0,x,canvas.width-x,canvas.width],dy=[0,y,canvas.height-y,canvas.height];
      const context=canvas.getContext('2d');
      for(let row=0;row<3;row++)for(let column=0;column<3;column++){
        const sw=sx[column+1]-sx[column],sh=sy[row+1]-sy[row],dw=dx[column+1]-dx[column],dh=dy[row+1]-dy[row];
        if(sw>0&&sh>0&&dw>0&&dh>0)context.drawImage(image,sx[column],sy[row],sw,sh,dx[column],dy[row],dw,dh);
      }
      if(cache.size>=32)cache.clear();
      cache.set(key,'url("'+canvas.toDataURL()+'")');
    }
    button.style.setProperty('--button-rendered',cache.get(key));
    button.dataset.buttonFrameReady=key;
  }
  const queue=button=>{
    pending.add(button);
    if(!frame)frame=requestAnimationFrame(()=>{
      frame=0;const batch=[...pending];pending.clear();
      for(const node of batch)paint(node).catch(()=>{delete node.dataset.buttonFrameReady;});
    });
  };
  const observer=new ResizeObserver(entries=>{
    for(const entry of entries)queue(entry.target);
  });
  for(const button of buttons){queue(button);observer.observe(button);}
  window.addEventListener('resize',()=>buttons.forEach(queue));
}
