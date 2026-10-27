import * as THREE from 'three';

function box(parent,size,position,material){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function concreteTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#aeaf9c';ctx.fillRect(0,0,256,256);
  let seed=271828;
  const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<12000;i++){
    const light=random()>.48;ctx.fillStyle=light?'rgba(226,227,207,.17)':'rgba(51,58,46,.13)';
    const r=.35+random()*1.1;ctx.beginPath();ctx.arc(random()*256,random()*256,r,0,Math.PI*2);ctx.fill();
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;return map;
}
export function createMaterialModels(){
  const models={};
  const frame=new THREE.MeshStandardMaterial({color:0x415b50,metalness:.85,roughness:.35});
  const glass=new THREE.MeshPhysicalMaterial({color:0xa8d8c1,metalness:.1,roughness:.12,transparent:true,opacity:.55,transmission:.12,thickness:.05,ior:1.5,side:THREE.DoubleSide});
  const rack=new THREE.Group();
  for(const z of [-.8,.8])box(rack,[3.6,.14,.12],[0,-.52,z],frame);
  for(const x of [-1.55,1.55])box(rack,[.13,2.8,.14],[x,.7,.78],frame);
  const panes=[];
  for(let i=0;i<4;i++){
    const pane=new THREE.Group();pane.position.set((i-1.5)*.43,.85,(i-1.5)*.32);pane.rotation.y=-.12;
    box(pane,[2.15,2.75,.055],[0,0,0],glass);
    for(const x of [-1.09,1.09])box(pane,[.055,2.86,.085],[x,0,0],frame);
    for(const y of [-1.4,1.4])box(pane,[2.23,.055,.085],[0,y,0],frame);
    rack.add(pane);panes.push(pane);
  }
  rack.position.y=-.8;models.glass={object:rack,fit:[4.9,3.8],animate(p){panes.forEach((pane,i)=>{pane.position.z=(i-1.5)*(.32+(1-p)*.34);pane.position.x=(i-1.5)*(.43+(1-p)*.16);});}};
  const concreteMap=concreteTexture();
  const concrete=new THREE.MeshStandardMaterial({map:concreteMap,bumpMap:concreteMap,bumpScale:.025,roughness:.93,color:0xd5d7c5});
  const wood=new THREE.MeshStandardMaterial({color:0x625238,roughness:.87});
  const stack=new THREE.Group(),slabs=[];
  for(const x of [-1.8,1.8])box(stack,[.35,.22,1.8],[x,-.51,0],wood);
  for(let i=0;i<5;i++){const slab=box(stack,[4.9,.25,1.55],[(i%2)*.03,-.27+i*.28,0],concrete);slabs.push(slab);}
  models.concrete={object:stack,fit:[5.8,2.8],animate(p){slabs.forEach((slab,i)=>{slab.position.y=-.27+i*.28+(1-p)*i*.17;});}};
  const unit=new THREE.Group(),metal=new THREE.MeshStandardMaterial({color:0x929f8e,metalness:.78,roughness:.43});
  const grille=new THREE.MeshStandardMaterial({color:0x192922,metalness:.65,roughness:.7});
  const panel=box(unit,[4.2,1.85,1.55],[0,.3,0],metal);
  for(const x of [-1.6,1.6])box(unit,[.22,.23,1.9],[x,-.72,0],frame);
  box(unit,[1.52,1.59,.06],[-1.22,.3,.797],grille);
  for(let i=0;i<13;i++)box(unit,[1.5,.024,.04],[-1.22,-.42+i*.12,.841],metal);
  for(let i=0;i<8;i++)box(unit,[.024,1.57,.05],[-1.91+i*.2,.3,.85],metal);
  for(const x of [-.4,.85,1.93])box(unit,[.014,1.79,.012],[x,.3,.79],grille);
  for(const x of [.68,1.76])box(unit,[.035,.18,.045],[x,.27,.817],grille);
  const fan=new THREE.Group();fan.position.set(.22,.32,.81);
  const fanRing=new THREE.Mesh(new THREE.TorusGeometry(.43,.027,8,40),frame);fan.add(fanRing);
  const motor=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.08,16),frame);motor.rotation.x=Math.PI/2;fan.add(motor);
  const blades=new THREE.Group();
  for(let i=0;i<5;i++){
    const blade=new THREE.Mesh(new THREE.CircleGeometry(.15,12,.2,Math.PI*1.5),grille);const a=i*Math.PI*2/5;blade.position.set(Math.sin(a)*.2,Math.cos(a)*.2,.02);blade.rotation.z=-a;blades.add(blade);
  }
  fan.add(blades);unit.add(fan);
  models.hvac={object:unit,fit:[5.5,3.2],animate(p){blades.rotation.z=p*Math.PI*4;panel.position.y=.3+(1-p)*.22;}};
  return models;
}
