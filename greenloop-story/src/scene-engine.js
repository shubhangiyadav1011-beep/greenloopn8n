import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMaterialModels } from './material-models.js';

// One GPU context moves between chapters; the photographic fallback is always present.
export function createBeamGeometry(length = 6.2) {
  const w = .42, h = .52, t = .082, web = .057;
  const outline = [[-w,-h],[w,-h],[w,-h+t],[web,-h+t],[web,h-t],[w,h-t],[w,h],[-w,h],[-w,h-t],[-web,h-t],[-web,-h+t],[-w,-h+t]];
  const shape = new THREE.Shape();
  outline.forEach(([x,y], i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth:length, steps:1, bevelEnabled:true, bevelSegments:3, bevelSize:.012, bevelThickness:.012, curveSegments:1 });
  geometry.translate(0,0,-length/2);
  geometry.rotateY(Math.PI/2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function steelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  let seed = 982451653;
  const rand = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  ctx.fillStyle = '#625746'; ctx.fillRect(0,0,512,512);
  for (let i=0;i<3600;i++) {
    const x=rand()*512,y=rand()*512,r=1+rand()*20;
    ctx.fillStyle = `rgba(${55+Math.floor(rand()*70)},${34+Math.floor(rand()*50)},${20+Math.floor(rand()*40)},${.025+rand()*.1})`;
    ctx.beginPath();ctx.ellipse(x,y,r,r*(.25+rand()),rand()*Math.PI,0,Math.PI*2);ctx.fill();
  }
  for(let i=0;i<6500;i++) {
    const tone=rand()>.45?175:20;
    ctx.fillStyle=`rgba(${tone},${tone*.88},${tone*.69},${rand()*.21})`;
    ctx.fillRect(rand()*512,rand()*512,.5+rand()*2,.5+rand()*3);
  }
  for(let i=0;i<190;i++) {
    ctx.strokeStyle=`rgba(199,180,142,${rand()*.16})`;ctx.lineWidth=.3+rand()*.5;
    const x=rand()*512,y=rand()*512;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+rand()*140,y+rand()*6);ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(.65,1.3);
  texture.anisotropy=4;
  return texture;
}

function chainBetween(start,end,material) {
  const chain = new THREE.Group();
  const delta = new THREE.Vector3().subVectors(end,start), length=delta.length();
  const count=Math.ceil(length/.11), unit=delta.clone().normalize();
  const geometry=new THREE.TorusGeometry(.042,.010,5,9);
  const orientation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),unit);
  for(let i=0;i<=count;i++) {
    const link=new THREE.Mesh(geometry,material);
    link.position.copy(start).addScaledVector(delta,i/count);
    link.quaternion.copy(orientation);
    if(i%2) link.rotateY(Math.PI/2);
    link.castShadow=true;chain.add(link);
  }
  return chain;
}

export function createAssetEngine() {
  let renderer;
  try { renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'}); }
  catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.2;
  renderer.setClearColor(0,0);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden','true');
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(33,1,.1,100);
  const pmrem=new THREE.PMREMGenerator(renderer);
  const room=new RoomEnvironment();
  const environment=pmrem.fromScene(room,.04);
  scene.environment=environment.texture;
  room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xeef3ce,0x15251b,2));
  const key=new THREE.DirectionalLight(0xffe4ab,5.5);key.position.set(-3,7,6);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-6;key.shadow.camera.right=6;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;
  key.shadow.bias=-.001;scene.add(key);
  const rim=new THREE.DirectionalLight(0xb6e8d3,3.8);rim.position.set(3,2,-5);scene.add(rim);
  const texture=steelTexture();
  const steel=new THREE.MeshStandardMaterial({map:texture,bumpMap:texture,bumpScale:.012,color:0xc4b49b,metalness:.72,roughness:.69,envMapIntensity:.8});
  const beam=new THREE.Mesh(createBeamGeometry(),steel);beam.castShadow=true;beam.receiveShadow=true;
  const object=new THREE.Group();object.add(beam);scene.add(object);
  // Recessed bolt marks at the recovered end faces.
  const darkSteel=new THREE.MeshStandardMaterial({color:0x23251e,metalness:.8,roughness:.61});
  const boltGeometry=new THREE.CylinderGeometry(.032,.032,.009,12);
  for(const x of [-2.91,2.91]) for(const z of [-.28,.28]) {
    const bolt=new THREE.Mesh(boltGeometry,darkSteel);bolt.position.set(x,.53,z);object.add(bolt);
  }
  const rig=new THREE.Group();
  const chainMaterial=new THREE.MeshStandardMaterial({color:0x645b43,metalness:.9,roughness:.43});
  rig.add(chainBetween(new THREE.Vector3(-2,.53,0),new THREE.Vector3(0,3.65,0),chainMaterial));
  rig.add(chainBetween(new THREE.Vector3(2,.53,0),new THREE.Vector3(0,3.65,0),chainMaterial));
  const hook=new THREE.Mesh(new THREE.TorusGeometry(.13,.043,8,22,Math.PI*1.65),chainMaterial);
  hook.position.set(0,3.76,0);hook.rotation.z=-.25;rig.add(hook);
  const wire=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,8,8),chainMaterial);wire.position.set(0,7.9,0);rig.add(wire);
  object.add(rig);
  const materialModels=createMaterialModels();
  for(const model of Object.values(materialModels)){model.object.visible=false;scene.add(model.object);}
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(22,15),new THREE.ShadowMaterial({opacity:.16}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-.59;shadow.receiveShadow=true;scene.add(shadow);
  let host=null,mode='passport',width=0,height=0,lost=false,previousP=.6,gallerySlots=[];
  function resize() {
    if(!host)return;
    const box=host.getBoundingClientRect(),w=Math.max(1,Math.round(box.width)),h=Math.max(1,Math.round(box.height));
    if(w!==width||h!==height) {
      width=w;height=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    }
  }
  function draw(progress,aspect,{reducedMotion=false,pointerX=0,pointerY=0,orbitX=0,orbitY=0}={},kind=mode) {
    const p=reducedMotion?1:Math.min(1,Math.max(0,progress));
    const ease=p*p*(3-2*p),recovery=kind==='recovery',viewer=kind.startsWith('viewer');
    const material=kind.replace('viewer:',''),model=materialModels[material];
    object.visible=!model;
    for(const [key,value] of Object.entries(materialModels))value.object.visible=key===material;
    rig.visible=recovery;shadow.visible=!recovery;
    shadow.position.y=material==='glass'?-1.43:material==='hvac'?-.85:material==='concrete'?-.64:-.59;
    const verticalFit=model?model.fit[1]:recovery?5.2:2.35,horizontalFit=model?model.fit[0]:viewer?7.1:6.9;
    camera.aspect=aspect;camera.updateProjectionMatrix();
    const distance=Math.max(verticalFit,horizontalFit/camera.aspect)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
    const push=reducedMotion?1:1.08-ease*.08;
    camera.position.set(distance*.2+pointerX*.08,distance*.29+pointerY*.06,distance*.93).multiplyScalar(push);
    camera.lookAt(0,recovery?.95:0,0);
    object.rotation.set(0,0,0);object.position.set(0,0,0);
    if(recovery) {
      object.rotation.y=-.48+ease*.60;
      object.rotation.z=.04+Math.sin(p*Math.PI)*.07;
      object.position.y=1.15-ease*1.3;
      object.position.x=.2-ease*.25;
    } else {
      object.rotation.y=.12+(ease-.65)*.90+(viewer?orbitX:0)+pointerX*.09;
      object.rotation.z=-.08+(ease-.6)*.07;
      object.rotation.x=viewer?orbitY*.6:0;
      object.position.y=Math.sin(p*Math.PI)*.025;
    }
    if(model){model.object.rotation.set(viewer?orbitY*.6:0,-.23+(ease-.6)*.65+(viewer?orbitX:0)+pointerX*.08,0);model.animate(reducedMotion?1:ease);}
    renderer.render(scene,camera);
  }
  function render(progress=.6,options={}) {
    if(!host||lost)return;
    resize();previousP=progress;
    renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);renderer.clear();
    if(mode==='gallery'){
      renderer.domElement.style.transform=`translateY(${host.scrollTop||0}px)`;
      const origin=host.getBoundingClientRect();renderer.autoClear=false;renderer.setScissorTest(true);
      gallerySlots.forEach((slot,index)=>{
        const rect=slot.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
        const x=rect.left-origin.left,y=height-(rect.bottom-origin.top);
        renderer.setViewport(x,y,rect.width,rect.height);renderer.setScissor(x,y,rect.width,rect.height);renderer.clearDepth();
        draw(Math.min(1,Math.max(0,(progress-index*.08)/.72)),rect.width/rect.height,options,slot.dataset.model);
      });
      renderer.setScissorTest(false);renderer.autoClear=true;
    }else draw(progress,width/height,options);
  }
  const observer=new ResizeObserver(()=>render(previousP));
  function attach(element,nextMode='passport') {
    if(host===element&&mode===nextMode)return;
    if(host){host.classList.remove('has-webgl');observer.unobserve(host);}
    gallerySlots.forEach(slot=>slot.classList.remove('has-webgl'));gallerySlots=[];
    host=element;mode=nextMode;width=height=0;
    renderer.domElement.style.transform='none';
    if(!host){renderer.domElement.remove();return;}
    host.append(renderer.domElement);
    if(mode==='gallery')gallerySlots=[...host.querySelectorAll('.material-visual')];
    if(!lost){host.classList.add('has-webgl');gallerySlots.forEach(slot=>slot.classList.add('has-webgl'));}
    observer.observe(host);resize();
  }
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;host?.classList.remove('has-webgl');gallerySlots.forEach(slot=>slot.classList.remove('has-webgl'));});
  renderer.domElement.addEventListener('webglcontextrestored',()=>{lost=false;host?.classList.add('has-webgl');gallerySlots.forEach(slot=>slot.classList.add('has-webgl'));render(previousP);});
  return {attach,render,resize,dispose(){observer.disconnect();scene.traverse(item=>{item.geometry?.dispose();});steel.dispose();darkSteel.dispose();chainMaterial.dispose();shadow.material.dispose();texture.dispose();environment.dispose();renderer.dispose();}};
}
