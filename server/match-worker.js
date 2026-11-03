import {parentPort,workerData} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import {Sim,TICK} from '../src/sim/sim.js';
import {ITEM_BY_ID} from '../src/data/items.js';
import {snapshot,deltaSnapshot} from '../src/net/wire.js';
const sim=new Sim({seed:workerData.seed,picks:workerData.picks.map(p=>({...p,isPlayer:true}))});
sim.champions.forEach((u,i)=>{u.playerId=workerData.picks[i].playerId;u.nickname=workerData.picks[i].name;});
const previous=[null,null];let ticks=0,running=false,last=performance.now(),acc=0,done=false;
const states=()=>{const events=sim.events.splice(0);return [0,1].map(team=>snapshot(sim,team,events));};
const publish=(full=false)=>{const next=states();parentPort.postMessage({type:'state',states:next.map((s,t)=>deltaSnapshot(s,previous[t],full)),fullStates:full?next:null});next.forEach((s,t)=>previous[t]=s);};
publish(true);
function command(playerId,c) {
  const u=sim.champions.find(u=>u.playerId===playerId);if(!u||sim.over||!running)return;
  const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<=70&&Math.abs(p.z)<=70;
  const target=()=>sim.units.find(t=>t.id===c.target);
  let r;
  switch(c.action) {
    case 'move':case 'attackMove':if(point(c))r=sim[c.action==='move'?'cmdMove':'cmdAttackMove'](u,c.x,c.z);break;
    case 'joy':if(point(c)&&Math.abs(c.x)<=1&&Math.abs(c.z)<=1)r=sim.cmdJoy(u,c.x,c.z);break;
    case 'attack':r=sim.cmdAttack(u,target());break;
    case 'stop':r=sim.cmdStop(u);break;
    case 'recall':r=sim.cmdRecall(u);break;
    case 'cast':if(['Q','W','E','R'].includes(c.slot)&&(!c.point||point(c.point)))r=sim.cmdCast(u,c.slot,{point:c.point,target:target()});break;
    case 'buy':if(typeof c.item==='string'&&Object.hasOwn(ITEM_BY_ID,c.item))r=sim.cmdBuy(u,c.item);break;
    case 'sell':if(Number.isInteger(c.slot)&&c.slot>=0&&c.slot<6)r=sim.cmdSell(u,c.slot);break;
    case 'potion':r=sim.cmdUsePotion(u);break;
    case 'level':if(['Q','W','E','R'].includes(c.slot))r=sim.cmdLevel(u,c.slot);break;
    case 'autoLevel':u.autoLevel=!!c.value;sim.levelUpSkillsAuto(u);break;
  }
  if(r?.ok===false)parentPort.postMessage({type:'commandError',playerId,reason:r.reason});
}
parentPort.on('message',m=>{
  if(m.type==='run'){running=true;last=performance.now();publish(true);}
  if(m.type==='command')command(m.playerId,m.command);
  if(m.type==='stopPlayer'){const u=sim.champions.find(u=>u.playerId===m.playerId);if(u)sim.cmdStop(u);}
  if(m.type==='sync')publish(true);
  if(m.type==='forfeit'&&!sim.over){sim.over=true;sim.winner=1-m.team;sim.endTime=sim.time;sim.events.push({type:'end',winner:sim.winner});publish(true);}
});
setInterval(()=>{
  const now=performance.now();if(!running||sim.over){last=now;if(sim.over&&!done){done=true;parentPort.postMessage({type:'ended'});}return;}
  acc+=Math.min(0.25,(now-last)/1000);last=now;
  let n=0;while(acc>=TICK&&n<6){sim.step(TICK);acc-=TICK;ticks++;n++;if(ticks%2===0)publish(ticks%90===0);if(sim.over){publish(true);break;}}
  if(sim.time>=5400&&!sim.over){sim.over=true;sim.winner=sim.nexus[0].hp===sim.nexus[1].hp?-1:sim.nexus[0].hp>sim.nexus[1].hp?0:1;sim.endTime=sim.time;publish(true);}
},8);
