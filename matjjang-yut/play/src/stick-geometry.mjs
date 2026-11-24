export const STICK_RADIUS=.255,STICK_HALF_LENGTH=1.22,STICK_SEGMENTS=12;
// Both flat ends and the half-cylinder rim come from the rendered stick mesh.
export const STICK_VERTICES=Object.freeze([-1,1].flatMap(sign=>Array.from({length:STICK_SEGMENTS+1},(_,index)=>({
  x:STICK_RADIUS*Math.cos(index*Math.PI/STICK_SEGMENTS),y:sign*STICK_HALF_LENGTH,z:-STICK_RADIUS*Math.sin(index*Math.PI/STICK_SEGMENTS)
}))));

export function convexHull(points){
  const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);
  if(sorted.length<3)return sorted;
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  function half(list){
    const result=[];
    for(const point of list){while(result.length>1&&cross(result.at(-2),result.at(-1),point)<=1e-8)result.pop();result.push(point);}
    return result;
  }
  const lower=half(sorted),upper=half(sorted.reverse());
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
