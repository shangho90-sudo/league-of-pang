// The server owns the simulation. The browser receives state, never a game clock to run.
import { Unit } from '../sim/sim.js';
import { CHAMP_BY_ID } from '../data/champions.js';
const omit = new Set(['sim','def','camp','lastHitBy','path','timers','onHit','onTick','onEnd','onArrive']);
export function encode(value, root = false) {
  if (value == null) return value;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
  if (typeof value !== 'object') return typeof value === 'function' ? undefined : value;
  if (value instanceof Unit && !root) return {$u:value.id};
  if (value instanceof Map || value instanceof Set) return undefined;
  if (Array.isArray(value)) return value.map(v=>encode(v));
  const out={};
  for (const [k,v] of Object.entries(value)) if (!omit.has(k) && !k.startsWith('_')) {
    const e=encode(v); if(e!==undefined) out[k]=e;
  }
  if(value.def) out.defId=value.def.id;
  return out;
}
export function rle(grid) {
  const out=[];let start=-1;
  for(let i=0;i<=grid.length;i++) { if(grid[i] && start<0)start=i;else if(!grid[i]&&start>=0){out.push(start,i-start);start=-1;} }
  return out;
}
export function snapshot(sim, team, events=[]) {
  const isVisible=(x,z)=>{const i=Math.floor((x+68)/136*136),j=Math.floor((z+68)/136*136);return i>=0&&j>=0&&i<136&&j<136&&sim.visGrid[team][j*136+i]===1;};
  const visible=u=>u.team===team || u.visibleTo?.[team] || ['turret','nexus'].includes(u.kind);
  const units=sim.units.filter(u=>u.kind==='champion'||visible(u)).map(u=>{
    const out=encode(u,true);
    if(!visible(u)) { out.x=0;out.z=0;out.target=null;out.action=null;out.joy=null;out.dash=null;out.pass={};out.pendingCast=null; }
    return out;
  });
  // Event-only units can have left the live unit array during this tick.
  const known=new Set(units.map(u=>u.id));
  const collect=v=>{if(!v||typeof v!=='object')return;if(v instanceof Unit){if(!known.has(v.id)){known.add(v.id);units.push(encode(v,true));}return;}for(const x of Object.values(v))collect(x);};
  const safeEvents=events.filter(e=>['killfeed','announce','end'].includes(e.type)||visible(e.u||e.t||e.src||e.p?.src||{team:-1,visibleTo:[]})||(Number.isFinite(e.x)&&isVisible(e.x,e.z)));
  safeEvents.forEach(collect);
  const atVisible=o=>o.team===team||o.src?.team===team||isVisible(o.x??o.shape?.x,o.z??o.shape?.z);
  return {time:sim.time,over:sim.over,winner:sim.winner,endTime:sim.endTime,teamKills:sim.teamKills,teamGold:sim.teamGold,teamBuffs:sim.teamBuffs,
    units, live:sim.units.filter(u=>u.kind==='champion'||visible(u)).map(u=>u.id),
    projectiles:encode(sim.projectiles.filter(atVisible)),zones:encode(sim.zones.filter(atVisible)),telegraphs:encode(sim.telegraphs.filter(atVisible)),
    camps:sim.camps.map(c=>({kind:c.kind,p:c.p,alive:c.alive,respawnAt:c.respawnAt,big:c.big})),vision:rle(sim.visGrid[team]),events:encode(safeEvents)};
}
export function deltaSnapshot(next, previous, full=false) {
  const prev=new Map((previous?.units||[]).map(u=>[u.id,u]));
  return {...next,full,units:next.units.map(u=>{
    const old=full?null:prev.get(u.id);if(!old)return u;
    const d={id:u.id};for(const k of new Set([...Object.keys(u),...Object.keys(old)]))if(JSON.stringify(u[k])!==JSON.stringify(old[k]))d[k]=u[k]??null;
    return d;
  }).filter(u=>Object.keys(u).length>1)};
}
export function applySnapshot(sim, data, playerId) {
  const map=sim._netUnits ||= new Map();
  if(data.full) { for(const u of map.values())u._netRecord={}; }
  for(const rec of data.units) {
    let u=map.get(rec.id);if(!u){u=Object.create(Unit.prototype);u.sim=sim;u._netRecord={};map.set(rec.id,u);}
    Object.assign(u._netRecord,rec);
  }
  const decode=v=>{if(!v||typeof v!=='object')return v;if(v.$u)return map.get(v.$u)||null;if(Array.isArray(v))return v.map(decode);const o={};for(const[k,x]of Object.entries(v))o[k]=decode(x);return o;};
  for(const u of map.values()) {
    const oldX=u.x,oldZ=u.z;Object.assign(u,decode(u._netRecord));u.def=CHAMP_BY_ID[u.defId];u.isPlayer=u.playerId===playerId;
    if(Number.isFinite(oldX)&&Math.hypot(u.x-oldX,u.z-oldZ)<4)u._netFrom={x:oldX,z:oldZ,t:performance.now()};else u._netFrom=null;
  }
  sim.units=data.live.map(id=>map.get(id));sim.champions=sim.units.filter(u=>u.kind==='champion');
  sim.turrets=sim.units.filter(u=>u.kind==='turret');sim.nexus=sim.units.filter(u=>u.kind==='nexus');sim.player=sim.champions.find(u=>u.isPlayer);
  for(const k of ['time','over','winner','endTime','teamKills','teamGold','teamBuffs','camps','projectiles','zones','telegraphs'])sim[k]=decode(data[k]);
  sim.visGrid[sim.player.team].fill(0);for(let i=0;i<data.vision.length;i+=2)sim.visGrid[sim.player.team].fill(1,data.vision[i],data.vision[i]+data.vision[i+1]);
  sim.events.push(...decode(data.events));
  const retained=new Set(data.units.map(u=>u.id));for(const id of map.keys())if(!data.live.includes(id)&&!retained.has(id))map.delete(id);
}
