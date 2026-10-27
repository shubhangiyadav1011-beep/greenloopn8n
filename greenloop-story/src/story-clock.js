// Physical scrolling selects the destination. This clock lets each scene finish
// and stay readable before the visual story catches up with that destination.
export const READ_HOLD_MS=3000;
export const MOTION_END=.52;
export class StoryClock {
  constructor(count){this.count=count;this.position=0;this.target=0;this.time=null;this.hold=null;this.read=new Set();}
  seek(position,{play=false}={}){
    this.target=Math.max(0,Math.min(this.count,position));
    this.position=play?Math.floor(this.target)+.015:this.target;
    this.hold=null;this.time=null;
    if(play)this.read.delete(Math.floor(this.target));
  }
  step(target,now,{reduced=false,tour=false}={}){
    this.target=Math.max(0,Math.min(this.count,target));
    const dt=this.time===null?16:Math.min(50,Math.max(0,now-this.time));this.time=now;
    if(reduced||tour){this.position=this.target;this.hold=null;return this.state(now);}
    if(this.target<this.position-.001){if(this.hold)this.read.add(this.hold.index);this.hold=null;}
    if(this.hold){
      if(now<this.hold.until)return this.state(now);
      this.read.add(this.hold.index);this.hold=null;
    }
    const delta=this.target-this.position;
    const amount=Math.min(Math.abs(delta),dt*(delta<0?.0025:.00115),Math.abs(delta)*(1-Math.exp(-dt/105)));
    let next=this.position+Math.sign(delta)*amount;
    if(Math.abs(this.target-next)<.0005)next=this.target;
    const index=Math.min(this.count-1,Math.floor(this.position)),barrier=index+MOTION_END;
    if(delta>0&&!this.read.has(index)&&this.position<=barrier&&next>=barrier){
      next=barrier;this.hold={index,until:now+READ_HOLD_MS};
    }
    this.position=next;
    return this.state(now);
  }
  state(now){return {position:this.position,remaining:this.hold?Math.max(0,this.hold.until-now):0,moving:!!this.hold||Math.abs(this.target-this.position)>.0005};}
}
// 9.2 seconds per chapter: move, read for three seconds, then transition.
export function tourPosition(elapsed,count){
  const duration=9200,index=Math.min(count-1,Math.floor(elapsed/duration)),local=elapsed-index*duration;
  if(elapsed>=count*duration)return count;
  if(local<3800)return index+(local/3800)*MOTION_END;
  if(local<6800)return index+MOTION_END;
  return index+MOTION_END+(local-6800)/2400*(1-MOTION_END);
}
