export const materials = [
  {id:'steel',title:'Structural Steel Beams',grade:'S355',quantity:'12 beams · 6.2 m',location:'Delhi, NCR',tonnes:2.4,condition:'good',availability:'now',image:'beam-product.webp',icon:'beam',record:'GL / 001'},
  {id:'glass',title:'Facade Glass Units',grade:'Double-glazed facade',quantity:'208 units · 1.5 × 3 m',location:'Mumbai',tonnes:6,condition:'excellent',availability:'now',image:'glass-product.webp',icon:'building',record:'GL / 002'},
  {id:'concrete',title:'Concrete Panels',grade:'Precast concrete',quantity:'50 panels · 3 × 1.2 m',location:'Bengaluru',tonnes:12,condition:'good',availability:'later',image:'concrete-product.webp',icon:'cube',record:'GL / 003'},
  {id:'hvac',title:'HVAC Units',grade:'Commercial air handling',quantity:'10 recovered units',location:'Hyderabad',tonnes:3,condition:'good',availability:'now',image:'hvac-product.webp',icon:'hvac',record:'GL / 004'}
];
export const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,value));
export function smooth(start,end,value){const p=clamp((value-start)/(end-start));return p*p*(3-2*p);}
export function filterMaterials(filters={}) {
  const query=(filters.query||'').trim().toLowerCase();
  return materials.filter(item=>
    (!filters.material||filters.material==='all'||item.id===filters.material)&&
    (!filters.location||filters.location==='all'||item.location===filters.location)&&
    (!filters.condition||filters.condition==='all'||item.condition===filters.condition)&&
    (!filters.availability||filters.availability==='all'||item.availability===filters.availability)&&
    (!filters.quantity||filters.quantity==='all'||(filters.quantity==='small'?item.tonnes<=5:item.tonnes>5))&&
    (!query||`${item.title} ${item.grade} ${item.location} ${item.record}`.toLowerCase().includes(query))
  );
}
export function savings(newCost,reclaimedCost,tonnes=1) {
  const valid=[newCost,reclaimedCost,tonnes].every(n=>Number.isFinite(n)&&n>=0);
  if(!valid)return null;
  const perTonne=newCost-reclaimedCost;
  return {perTonne,total:perTonne*tonnes,percentage:newCost?perTonne/newCost*100:0};
}
export function chapterState(position,index,count,reduced=false) {
  const local=position-index,p=clamp(local/.52);
  const enter=index===0?1:smooth(-.17,.015,local);
  const leave=index===count-1?1:1-smooth(.83,1.015,local);
  return {p,opacity:reduced?(Math.min(count-1,Math.floor(position+.085))===index?1:0):enter*leave,draw:reduced||index===0?1:smooth(.035,.68,p)};
}
