import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createOnlineServer} from './index.js';
import {Sim,TICK} from '../src/sim/sim.js';
import {CHAMPIONS} from '../src/data/champions.js';
import {snapshot,deltaSnapshot,applySnapshot} from '../src/net/wire.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function client(url,token){
  const ws=new WebSocket(url);const messages=[];ws.on('message',x=>messages.push(JSON.parse(x)));
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  const c={ws,messages,send:m=>ws.send(JSON.stringify(m)),wait:async(type,p=()=>true)=>{const end=Date.now()+12000;while(Date.now()<end){const i=messages.findIndex(m=>m.type===type&&p(m));if(i>=0)return messages.splice(i,1)[0];await delay(15);}throw Error('Timeout '+type+' '+JSON.stringify(messages.slice(-2)));}};
  c.send({type:'hello',nickname:'테스트',token});c.welcome=await c.wait('welcome');return c;
}
test('guest lobby permissions, atomic draft, team parity, server match and reconnect',async()=>{
  const app=createOnlineServer({reconnectMs:5000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const url=`ws://127.0.0.1:${app.server.address().port}/ws`;const clients=[];
  try{
    const a=await client(url),b=await client(url),c=await client(url);clients.push(a,b,c);
    a.send({type:'create',name:'대전 테스트'});const room=(await a.wait('room')).room;assert.equal(room.hostId,a.welcome.id);
    assert((await b.wait('rooms',m=>m.rooms.length===1)).rooms[0].count===1);
    b.send({type:'join',roomId:room.id});await b.wait('room',m=>m.room.members.length===2);
    b.send({type:'kick',playerId:a.welcome.id});assert.match((await b.wait('error')).reason,/방장/);
    b.send({type:'start'});assert.match((await b.wait('error')).reason,/방장/);
    a.send({type:'start'});assert.match((await a.wait('error')).reason,/준비/);
    a.send({type:'pick',champion:CHAMPIONS[0].id});b.send({type:'pick',champion:CHAMPIONS[0].id});await delay(60);
    a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await delay(60);
    const locked=app.rooms.get(room.id).members;assert.equal(locked.filter(p=>p.ready).length,1);
    const winner=locked.find(p=>p.ready).id===a.welcome.id?a:b,loser=winner===a?b:a;
    loser.send({type:'pick',champion:CHAMPIONS[0].id});assert.match((await loser.wait('error',m=>/완료/.test(m.reason))).reason,/완료/);
    loser.send({type:'pick',champion:CHAMPIONS[1].id});loser.send({type:'ready',ready:true});await delay(50);assert.equal(app.rooms.get(room.id).members.filter(p=>p.ready).length,2);
    c.send({type:'join',roomId:room.id});await c.wait('room');a.send({type:'start'});await a.wait('error');
    a.send({type:'kick',playerId:c.welcome.id});await c.wait('kicked');c.send({type:'join',roomId:room.id});assert.match((await c.wait('error')).reason,/강퇴/);
    a.send({type:'start'});const ma=await a.wait('match'),mb=await b.wait('match');assert.equal(ma.matchId,mb.matchId);assert(ma.state.units.length>0);
    await delay(100);assert.equal(app.rooms.get(room.id).status,'loading');
    a.send({type:'loaded',matchId:ma.matchId});b.send({type:'loaded',matchId:mb.matchId});await b.wait('room',m=>m.room.status==='playing');
    const st=await b.wait('snapshot',m=>m.state.time>.1);assert(st.state.time>.1);
    a.ws.close();await delay(120);assert.equal(app.rooms.get(room.id).hostId,b.welcome.id);
    const newer=await b.wait('snapshot',m=>m.state.time>st.state.time+.5);assert(newer.state.time>st.state.time+.5,'host disconnect must not stop match');
    const ar=await client(url,a.welcome.token);clients.push(ar);const resumed=await ar.wait('match');assert.equal(ar.welcome.id,a.welcome.id);assert.equal(resumed.matchId,ma.matchId);
    ar.send({type:'loaded',matchId:ma.matchId});const full=await ar.wait('snapshot',m=>m.state.full);const own=full.state.units.find(u=>u.playerId===a.welcome.id),enemy=full.state.units.find(u=>u.playerId===b.welcome.id);
    const before=own.x;ar.send({type:'command',matchId:ma.matchId,command:{action:'joy',x:.5,z:0,playerId:b.welcome.id}});
    await ar.wait('snapshot',m=>m.state.units.some(u=>u.id===own.id&&u.x!==undefined&&Math.abs(u.x-before)>.1));
    ar.send({type:'command',matchId:ma.matchId,command:{action:'buy',item:'__proto__'}});ar.send({type:'command',matchId:ma.matchId,command:{action:'cast',slot:'__proto__'}});ar.send({type:'command',matchId:ma.matchId,command:{action:'move',x:'bad',z:0}});
    ar.send({type:'sync'});const verified=await ar.wait('snapshot',m=>m.state.full&&m.state.time>full.state.time);assert(verified.state.units.find(u=>u.id===enemy.id));
    b.send({type:'leave'});await ar.wait('snapshot',m=>m.state.over);assert.equal(app.rooms.get(room.id).members.length,1);
  }finally{for(const c of clients)c.ws.terminate();await app.close();}
});
test('all champions, skill events, unit identity and delta snapshots round trip',()=>{
  const picks=CHAMPIONS.map((c,i)=>({id:c.id,team:i%2,isPlayer:true,lane:'mid'}));const sim=new Sim({seed:3,picks});sim.champions.forEach((u,i)=>u.playerId='p'+i);
  const replica=new Sim({picks});let previous=null;
  for(const c of sim.champions){for(const slot of ['Q','W','E','R']){
    c.dead=false;c.level=18;c.skillLv={Q:5,W:5,E:5,R:3};sim.recalcStats(c);c.hp=c.s.hp;c.mp=10000;c.cds={Q:0,W:0,E:0,R:0};c.action=null;c.dash=null;c.status=[];
    const target=sim.champions.find(x=>x.team!==c.team);c.x=0;c.z=0;target.x=1;target.z=0;target.dead=false;target.visibleTo=[true,true];c.visibleTo=[true,true];sim.updateVision();
    sim.cmdCast(c,slot,{point:{x:1,z:0},target:c.def.skills[slot].t==='ally'?c:target});for(let i=0;i<4;i++)sim.step(TICK);
    const data=snapshot(sim,0,sim.events.splice(0));const packet=JSON.parse(JSON.stringify(deltaSnapshot(data,previous,!previous)));applySnapshot(replica,packet,'p0');previous=data;
    assert.equal(replica.player.def.id,CHAMPIONS[0].id);assert.equal(replica.player.has('stun'),sim.champions[0].has('stun'));assert.equal(replica.time,sim.time);assert.equal(replica.player.hp,Math.round(sim.champions[0].hp*1000)/1000);replica.events.length=0;
  }}
  assert.equal(replica.champions.length,12);
});
