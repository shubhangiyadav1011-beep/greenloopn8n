import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {materials,filterMaterials,savings,chapterState} from '../src/journey-data.js';
import {createBeamGeometry} from '../src/scene-engine.js';
import {createMaterialModels} from '../src/material-models.js';
import {StoryClock,READ_HOLD_MS,tourPosition} from '../src/story-clock.js';
import {Box3} from 'three';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const html=await readFile(resolve(root,'dist/index.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(ids.length,new Set(ids).size,'IDs must be unique');
const scenes=[...html.matchAll(/<section[^>]+data-index="(\d+)"/g)].map(x=>+x[1]);
assert.deepEqual(scenes,Array.from({length:13},(_,i)=>i),'All thirteen chapters must be present in order');
for(const match of html.matchAll(/data-go="(\d+)"/g))assert.ok(+match[1]>=0&&+match[1]<13,'Chapter navigation target out of range');
for(const match of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)){
  if(match[1].endsWith('.zip'))continue;
  await access(resolve(root,'dist',match[1]));
}
for(const item of materials)await access(resolve(root,'dist/assets',item.image));
assert.ok(html.includes('class="india-outline"')&&html.includes('data-city="Delhi"'),'Network SVG is included in the standalone build');
assert.ok(html.includes('class="hero-wordmark">GREEN<span>LOOP</span>'),'Hero starts with the GreenLoop heading');
assert.ok(!html.includes('id="market-search"'),'Marketplace search bar was removed');
assert.equal([...html.matchAll(/data-connector="/g)].length,4,'All material labels have a dedicated connector');
assert.equal([...html.matchAll(/class="network-route"/g)].length,8,'The network uses a minimal set of connections');
assert.equal(filterMaterials({query:' S355 '})[0]?.id,'steel');
assert.equal(filterMaterials({location:'Delhi, NCR',condition:'good',availability:'now',quantity:'small'}).length,1);
assert.equal(filterMaterials({material:'steel',location:'Mumbai'}).length,0);
assert.deepEqual(filterMaterials({quantity:'large'}).map(x=>x.id),['glass','concrete']);
assert.equal(filterMaterials({availability:'later'})[0]?.id,'concrete');
assert.equal(savings(65000,38000,2.4).total,64800);
assert.equal(savings(65000,38000,0).total,0);
assert.ok(savings(100,200,2).total<0,'Higher reclaimed cost must not show a positive saving');
assert.equal(savings(-1,20,1),null);assert.equal(savings(NaN,20,1),null);
for(let position=0;position<=13;position+=.01){
  const normal=scenes.map(i=>chapterState(position,i,13));
  assert.ok(normal.reduce((sum,x)=>sum+x.opacity,0)>.99,'Scroll transition must not leave an empty stage');
  assert.equal(scenes.filter(i=>chapterState(position,i,13,true).opacity===1).length,1,'Reduced motion presents exactly one chapter');
}
const beam=createBeamGeometry();
assert.ok([...beam.attributes.position.array,...beam.attributes.normal.array].every(Number.isFinite),'3D vertices and normals must be finite');
assert.ok(beam.boundingBox.max.x-beam.boundingBox.min.x>6.2,'Beam length includes beveled end faces');
assert.ok(beam.boundingSphere.radius<3.3,'Beam fits the intended camera framing');beam.dispose();
globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})};
const models=createMaterialModels();
for(const [name,model] of Object.entries(models)){
  model.animate(0);model.animate(1);model.object.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(model.object);
  assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite),`${name} model must have finite bounds`);
  assert.ok(bounds.max.x-bounds.min.x<model.fit[0],`${name} fits the gallery camera`);
  model.object.traverse(mesh=>{if(mesh.geometry)assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));});
}
delete globalThis.document;
const clock=new StoryClock(13),holds=new Map();let previousHold=null;
for(let now=0;now<65000;now+=16){
  const state=clock.step(13,now);
  if(clock.hold&&previousHold!==clock.hold.index){holds.set(clock.hold.index,{start:now,position:state.position});previousHold=clock.hold.index;}
  if(clock.hold)assert.equal(state.position,holds.get(clock.hold.index).position,'Scene remains still during its reading hold');
  for(const [index,hold] of holds)if(clock.read.has(index)&&!hold.end){hold.end=now;assert.ok(hold.end-hold.start>=READ_HOLD_MS,'Reading hold lasts at least three seconds');}
}
assert.equal(holds.size,13,'Fast scrolling still gives all thirteen chapters a reading hold');
assert.equal(clock.position,13,'Story eventually catches up with the scroll destination');
const reverse=new StoryClock(13);reverse.seek(.52);reverse.hold={index:0,until:4000};reverse.step(.1,10);assert.equal(reverse.hold,null,'Reverse scrolling releases a reading hold');
assert.equal(new StoryClock(13).step(7.4,10,{reduced:true}).position,7.4,'Reduced motion bypasses delays');
assert.equal(tourPosition(3900,13),tourPosition(6700,13),'Guided tour also holds its completed scene');
assert.equal(tourPosition(13*9200,13),13,'Guided tour reaches the final chapter');
console.log('Passed: revised hero, no marketplace search bar, 4 anchored callouts, 8 clear map routes, filters, calculations, 13 reading holds, reverse/reduced-motion navigation and all material model geometry.');
