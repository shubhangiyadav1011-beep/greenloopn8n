import {clamp,smooth} from './journey-data.js';
const materialKeys=['steel','glass','concrete','hvac'];
const sourceTargets={steel:[.573,.27],glass:[.70,.36],concrete:[.59,.604],hvac:[.672,.821]};
const mobileTargets={steel:[.60,.48],glass:[.43,.60],concrete:[.61,.73],hvac:[.41,.84]};
export function updateAssetCallouts(scene,motion){
  const svg=scene.querySelector('#asset-connections'),bounds=scene.getBoundingClientRect();if(!svg||!bounds.width||!bounds.height)return;
  svg.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
  const image=scene.querySelector('.scene-camera img'),photo=image.getBoundingClientRect();
  const nw=image.naturalWidth||1816,nh=image.naturalHeight||866;
  const cover=Math.max(photo.width/nw,photo.height/nh),imageWidth=nw*cover,imageHeight=nh*cover;
  const small=bounds.width<=700;
  materialKeys.forEach((key,index)=>{
    const tag=scene.querySelector(`[data-callout="${key}"]`),connector=svg.querySelector(`[data-connector="${key}"]`);
    const reveal=smooth(.055+index*.13,.27+index*.14,motion);tag.style.setProperty('--reveal',reveal);connector.style.setProperty('--reveal',reveal);
    const box=tag.getBoundingClientRect(),source=sourceTargets[key];
    let tx,ty;
    if(small){tx=mobileTargets[key][0]*bounds.width;ty=mobileTargets[key][1]*bounds.height;}
    else{tx=photo.left-bounds.left+(photo.width-imageWidth)/2+source[0]*imageWidth;ty=photo.top-bounds.top+(photo.height-imageHeight)/2+source[1]*imageHeight;}
    tx=clamp(tx,20,bounds.width-20);ty=clamp(ty,110,bounds.height-60);
    const toRight=tx>box.left-bounds.left+box.width/2;
    const sx=(toRight?box.right:box.left)-bounds.left,sy=clamp(ty,box.top-bounds.top+15,box.bottom-bounds.top-15);
    const ex=tx+(toRight?-17:17),mx=sx+(ex-sx)*.45;
    const d=`M${sx.toFixed(1)} ${sy.toFixed(1)} C${mx.toFixed(1)} ${sy.toFixed(1)},${mx.toFixed(1)} ${ty.toFixed(1)},${ex.toFixed(1)} ${ty.toFixed(1)}`;
    connector.querySelectorAll('path').forEach(path=>path.setAttribute('d',d));
    connector.querySelectorAll('circle,text').forEach(node=>{node.setAttribute(node.tagName.toLowerCase()==='text'?'x':'cx',tx);node.setAttribute(node.tagName.toLowerCase()==='text'?'y':'cy',ty);});
  });
}
export function updateNetwork(scene,motion){
  const routes=[...scene.querySelectorAll('.network-route')];
  routes.forEach((route,index)=>{
    const draw=smooth(.10+index*.075,.35+index*.075,motion);route.style.setProperty('--route-draw',draw);
    const dot=scene.querySelector(`[data-route-pulse="${index}"]`);if(!dot)return;
    dot.style.setProperty('--pulse-opacity',draw>.02&&draw<.995?1:0);
    if(route.getTotalLength){const point=route.getPointAtLength(route.getTotalLength()*draw);dot.setAttribute('cx',point.x);dot.setAttribute('cy',point.y);}
  });
  scene.querySelectorAll('.map-city').forEach((city,index)=>city.style.setProperty('--city-reveal',smooth(.02+index*.055,.22+index*.055,motion)));
}
export function wireOverlayFocus(){
  document.querySelectorAll('[data-callout]').forEach(tag=>{
    const key=tag.dataset.callout,link=document.querySelector(`[data-connector="${key}"]`);
    const highlight=value=>{tag.classList.toggle('is-highlighted',value);link.classList.toggle('is-highlighted',value);};
    tag.addEventListener('pointerenter',()=>highlight(true));tag.addEventListener('pointerleave',()=>highlight(false));
    tag.addEventListener('focus',()=>highlight(true));tag.addEventListener('blur',()=>highlight(false));
  });
  document.querySelectorAll('[data-city]').forEach(city=>{
    const highlight=value=>document.querySelectorAll('.network-route').forEach(route=>route.classList.toggle('is-highlighted',value&&(route.dataset.from===city.dataset.city||route.dataset.to===city.dataset.city)));
    city.addEventListener('pointerenter',()=>highlight(true));city.addEventListener('pointerleave',()=>highlight(false));
    city.addEventListener('focus',()=>highlight(true));city.addEventListener('blur',()=>highlight(false));
  });
}
