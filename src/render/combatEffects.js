import { createHeroAsset, disposeHeroEffect } from './heroAssets.js';
import { groundHeight } from '../map/grid.js';
import { GlowFX } from './glowFx.js';
import { combatPalette, COMBAT_PALETTES } from './combatPalette.js';

// Opaque silhouettes contract at the end; soft light remains a separate layer.
const EVENT_OWNER = {
  glassBurst:'pang',gooSplash:'pang',grandElixir:'pang',healBurst:'pang',
  shieldBash:'koo',groundSlam:'koo',fortress:'koo',ironShield:'koo',
  phantomRing:'bang',phantomSlash:'bang',afterimage:'bang',markPop:'bang',
  hammerSlam:'park',quench:'park',anvilDrop:'park',anvilImpact:'park',
  swordArc:'jung',oathShield:'jung',lightLand:'jung',sanctumRise:'jung',dawnBurst:'jung',
  aimFocus:'cha',windStep:'cha',bowFire:'cha',
  starHit:'sagong',starBurst:'sagong',gravityCollapse:'sagong',meteorFall:'sagong',meteorImpact:'sagong',
  thrust:'cho',forestBreath:'cho',beastLand:'cho',primalAura:'cho',beastBite:'cho',
  arcaneBlast:'kim',mineBlast:'kim',recoilBlast:'kim',cannonFire:'kim',
  harmonyPulse:'lee',marchPulse:'lee',resonanceWave:'lee',chordReady:'lee',
  frostHit:'choi',frostBloom:'choi',freeze:'choi',iceSlide:'choi',absoluteZero:'choi',absoluteZeroCharge:'choi',
  fireBurst:'flame',firePillar:'flame',pillarCharge:'flame',fireDash:'flame',firestormStart:'flame',firestormEnd:'flame',
};
const ZONE_STYLE = {
  firestorm:['fx-flame-vortex',0xff5100],fireTrail:['fx-flame-vortex',0xff6900],
  frost:['fx-ice-burst',0x00b4ff],goo:['fx-shock-crown',0x00dc81],
  elixir:['fx-shock-crown',0x50ef20],sanctum:['fx-shock-crown',0xffc400],
  gravity:['fx-shock-crown',0xa32aff],heatAura:['fx-flame-vortex',0xff7000],
};
export class CombatEffects {
  constructor(scene,quality) {
    this.scene=scene;this.active=[];this.pool=new Map();this.zones=new Map();
    this.low=quality.particles<0.8;this.limit=this.low?32:64;this.spawned=0;
    this.glow=new GlowFX(scene,quality);
  }
  take(id,color) {
    const pool=this.pool.get(id)||[];this.pool.set(id,pool);
    const root=pool.pop()||createHeroAsset(id,color,true);if(!root)return null;
    root.rotation.set(0,0,0);root.scale.setScalar(1);root.visible=true;
    root.traverse(o=>{if(o.isMesh){o.material.color.set(color);o.material.opacity=1;o.renderOrder=3;}});
    return root;
  }
  release(id,root) {this.scene.remove(root);root.visible=false;this.pool.get(id).push(root);}
  emit(id,{x=0,y,z=0,color=0x00caff,size=1,life=0.6,turn=0,pitch=0,rise=0,spin=0,mode='pulse',delay=0,stretch,follow,priority=0,travel=0}={}) {
    if(this.active.length>=this.limit){
      const i=this.active.findIndex(f=>f.priority<priority);if(i<0)return null;
      const old=this.active.splice(i,1)[0];this.release(old.id,old.root);
    }
    const root=this.take(id,color);if(!root)return null;
    if(id==='fx-radiant-star'){turn=0;pitch=-0.8;}
    if(id==='fx-ascend-wings'){turn=0;pitch=-0.25;}
    stretch??=id==='fx-shock-crown'?[1,0.45,1]:id==='fx-rune-ring'?[1,0.12,1]:undefined;
    root.position.set(x,y??groundHeight(x,z)+0.16,z);root.rotation.set(pitch,turn,0);root.scale.setScalar(size);root.visible=delay===0;
    this.active.push({root,id,time:-delay,life,size,rise,spin,mode,startY:root.position.y,x,z,turn,pitch,stretch,follow,priority,travel});
    this.scene.add(root);this.spawned++;return root;
  }
  launch(source,tip) {
    const p=combatPalette(source);
    this.glow.muzzle(tip?.x??source.x,tip?.y??groundHeight(source.x,source.z)+1,tip?.z??source.z,p.color);
  }
  basic(source,target,tip) {
    const p=combatPalette(source),c=p.color,y=groundHeight(target.x,target.z)+0.9;
    const at={x:target.x,z:target.z,y,color:c,life:0.3};
    this.glow.flash(target.x,y,target.z,c,1.2,0.24);
    this.emit('fx-radiant-star',{...at,size:0.7,turn:source.facing,spin:1});
    if(source.def.stats.ranged){
      const id={ice:'fx-ice-burst',fire:'fx-flame-vortex',music:'fx-rune-ring',alchemy:'fx-shock-crown',astral:'fx-radiant-star',wind:'fx-bolt'}[p.motif]||'fx-shock-crown';
      this.emit(id,{...at,y:y-0.5,size:p.motif==='fire'?1.1:0.8,life:0.38,spin:2,rise:0.25});
      this.glow.shards(target.x,y,target.z,c,4,3,0.32,0.4);return;
    }
    const base={x:source.x,z:source.z,y:tip?.y??y,color:c,turn:source.facing,life:0.32,mode:'slash',spin:1.8};
    if(p.motif==='forge'||p.motif==='guard'){
      this.emit('fx-shock-crown',{...at,y:y-0.7,size:2,life:0.45});
      this.glow.shards(target.x,y,target.z,p.edge,6,4,0.4,0.65);
    }else if(p.motif==='wild'){
      this.emit('fx-bolt',{...base,size:2.5,stretch:[0.45,0.45,1.3],travel:1.2,mode:'thrust'});
    }else{
      this.emit('fx-crescent',{...base,size:2.5});
      if(p.motif==='shadow')this.emit('fx-crescent',{...base,y:y-0.25,color:p.edge,size:2.1,spin:-2,delay:0.05});
    }
  }
  cast(unit,slot) {
    const p=combatPalette(unit),ult=slot==='R',y=groundHeight(unit.x,unit.z);
    const base={x:unit.x,z:unit.z,color:p.color,turn:unit.facing,follow:unit,priority:ult?2:1};
    this.glow.castFlare(unit,slot,p);
    if(ult){
      const motif={alchemy:'fx-rune-ring',guard:'fx-ward',shadow:'fx-crescent',forge:'fx-shock-crown',dawn:'fx-ascend-wings',wind:'fx-crescent',astral:'fx-radiant-star',wild:'fx-ascend-wings',arcane:'fx-shock-crown',music:'fx-rune-ring',ice:'fx-ice-burst',fire:'fx-flame-vortex'}[p.motif];
      this.emit(motif,{...base,y:y+0.25,size:3.1,life:0.85,rise:0.8,spin:p.motif==='shadow'?5:0.6});
      this.emit('fx-rune-ring',{...base,color:p.edge,size:3.8,life:0.75,spin:-1.2});
      if(['guard','dawn','alchemy'].includes(p.motif))this.emit('fx-ascend-wings',{...base,y:y+2.1,color:p.edge,size:2.4,life:0.65,rise:0.7,turn:0});
      return;
    }
    if(slot==='Q'){
      const id=['shadow','dawn','wild','wind'].includes(p.motif)?'fx-crescent':'fx-radiant-star';
      this.emit(id,{...base,y:y+1,size:1.25,life:0.3,spin:1.8});
    }else if(slot==='W'){
      const id=['guard','dawn','ice'].includes(p.motif)?'fx-ward':'fx-rune-ring';
      this.emit(id,{...base,y:y+0.3,size:2,life:0.6,spin:-1.2,rise:0.25});
    }else{
      this.emit('fx-crescent',{...base,y:y+0.7,size:1.8,life:0.4,spin:-2,stretch:[1,0.65,1.5],mode:'slash'});
    }
  }
  named(e) {
    const u=e.u,x=e.x??u?.x,z=e.z??u?.z;if(x==null||z==null)return;
    const p=COMBAT_PALETTES[EVENT_OWNER[e.name]]||combatPalette(u);
    const color=EVENT_OWNER[e.name]?p.color:(e.color??p.color),y=groundHeight(x,z),r=e.r||1.5;
    const base={x,z,color,priority:1},dir=e.dir?Math.atan2(e.dir.x,e.dir.z):u?.facing||0;
    const big=['anvilImpact','meteorImpact','absoluteZero','firestormEnd','dawnBurst','grandElixir','resonanceWave'].includes(e.name);
    if(big)base.priority=2;
    switch(e.name){
      case 'anvilDrop':return !!this.emit('fx-anvil',{...base,color:p.edge,size:2.3,life:e.delay||0.9,mode:'fall',rise:7});
      case 'meteorFall':return !!this.emit('fx-meteor',{...base,size:1.6,life:Math.min(0.6,e.delay||0.6),delay:Math.max(0,(e.delay||0.6)-0.6),mode:'fall',rise:9,spin:0.6});
      case 'shieldBash':case 'hammerSlam':case 'groundSlam':case 'anvilImpact':case 'mineBlast':case 'arcaneBlast':case 'meteorImpact':case 'beastLand':case 'glassBurst':case 'lightLand':case 'starBurst':
        this.emit('fx-shock-crown',{...base,size:Math.min(7,r*1.8),life:big?0.8:0.52});
        this.emit('fx-radiant-star',{...base,y:y+1,color:p.edge,size:big?2.3:1.2,life:0.35,rise:0.4,spin:1});
        this.glow.impact(x,z,color,big?1.8:0.8);break;
      case 'frostHit':case 'frostBloom':case 'freeze':case 'absoluteZero':
        this.emit('fx-ice-burst',{...base,size:e.name==='frostHit'?1.1:Math.min(6,r*1.5),life:big?1:0.65,rise:0.2});
        this.emit('fx-shock-crown',{...base,color:p.edge,size:r*1.8,life:0.55,spin:0.3});
        this.glow.impact(x,z,color,big?2:0.6);break;
      case 'firePillar':case 'firestormStart':case 'firestormEnd':case 'fireBurst':
        this.emit('fx-flame-vortex',{...base,size:Math.min(4.2,r*1.4),stretch:[0.85,e.name==='firePillar'?1.35:0.75,0.85],life:big?1:0.75,spin:3,rise:0.4});
        this.emit('fx-shock-crown',{...base,color:p.edge,size:r*1.65,life:0.7,spin:-1});
        this.glow.impact(x,z,color,big?2:1.1);break;
      case 'absoluteZeroCharge':case 'pillarCharge':
        this.emit('fx-rune-ring',{...base,size:r*2,life:e.dur||0.6,mode:'charge',spin:-1});break;
      case 'swordArc':case 'phantomSlash':case 'thrust':case 'recoilBlast':{
        const thrust=e.name==='thrust';
        this.emit(thrust?'fx-bolt':'fx-crescent',{...base,y:y+1,size:thrust?e.len||3:2.8,turn:dir,life:0.38,spin:thrust?0:2,mode:thrust?'thrust':'slash',travel:thrust?1.5:0,stretch:thrust?[0.5,0.5,1]:undefined});
        if(e.name==='phantomSlash')this.emit('fx-crescent',{...base,y:y+0.7,color:p.edge,size:2.5,turn:(e.i||0)*Math.PI/2,life:0.32,spin:-2});break;
      }
      case 'resonanceWave':
        for(let i=0;i<4;i++)this.emit('fx-crescent',{...base,x:x+Math.sin(dir)*(i+1)*1.3,z:z+Math.cos(dir)*(i+1)*1.3,y:y+0.8,color:i%2?p.edge:color,size:2+i,turn:dir,life:0.55,delay:i*0.065,stretch:[1,0.7,0.5]});break;
      case 'dawnBurst':case 'grandElixir':
        this.emit('fx-shock-crown',{...base,size:r*1.8,life:0.9,spin:0.3});
        this.emit('fx-ascend-wings',{...base,y:y+2,color:p.edge,size:4,life:0.85,rise:1.3});
        this.glow.impact(x,z,color,2);break;
      case 'phantomRing':
        for(let i=0;i<4;i++){const a=i*Math.PI/2;this.emit('fx-crescent',{...base,x:x+Math.sin(a)*1.7,z:z+Math.cos(a)*1.7,y:y+0.9,size:1.8,turn:a,life:0.75,spin:2});}break;
      case 'oathShield':case 'fortress':case 'ironShield':case 'sanctumRise':case 'quench':
        this.emit('fx-ward',{...base,size:2,life:0.75,rise:0.3,follow:u});break;
      case 'forestBreath':case 'healBurst':case 'primalAura':case 'harmonyPulse':case 'marchPulse':case 'gooSplash':case 'gravityCollapse':
        this.emit('fx-rune-ring',{...base,size:Math.min(8,r*1.7),life:0.7,spin:-1});
        this.emit('fx-radiant-star',{...base,y:y+1.4,color:p.edge,size:1.1,life:0.6,rise:0.8,spin:1});break;
      case 'starHit':case 'beastBite':case 'markPop':case 'impact':
        this.emit('fx-radiant-star',{...base,y:y+1,size:e.big?1.8:1,life:0.35,spin:1.2});break;
      case 'afterimage':case 'windStep':case 'iceSlide':case 'fireDash':case 'chargeTrail':
        this.emit('fx-crescent',{...base,y:y+0.6,size:2.2,life:0.4,turn:dir,spin:2,mode:'slash'});break;
      case 'aimFocus':case 'chordReady':
        this.emit('fx-radiant-star',{...base,y:y+2,size:1.1,life:0.55,rise:0.25,spin:1.5});break;
    }
  }
  // Persistent fields follow actual simulation lifetime, also across online snapshots.
  syncZones(sim,dt,isVisibleAt,team) {
    const seen=new Set();
    for(const zone of sim.zones){
      const style=ZONE_STYLE[zone.vis],s=zone.shape;
      if(!style||!s||zone.hiddenFromEnemy&&zone.team!==team)continue;
      if(zone.team!==team&&!isVisibleAt(s.x,s.z))continue;
      seen.add(zone.id);let f=this.zones.get(zone.id);
      if(!f){
        if(this.zones.size>=(this.low?8:16))continue;
        const root=this.take(style[0],style[1]);if(!root)continue;
        this.scene.add(root);f={root,id:style[0],t:0};this.zones.set(zone.id,f);
      }
      f.t+=dt;const r=s.r||1,fire=zone.vis==='firestorm'||zone.vis==='fireTrail',spread=fire?1.35:1.6;
      f.root.position.set(s.x,groundHeight(s.x,s.z)+0.18,s.z);
      f.root.rotation.y=f.t*(fire?1.8:-0.5);
      f.root.scale.set(r*spread,(fire?2.2:0.65)*(0.94+0.06*Math.sin(f.t*7)),r*spread);
      if(s.kind==='rect'){
        const x=s.x+s.dx*s.len/2,z=s.z+s.dz*s.len/2;
        f.root.position.set(x,groundHeight(x,z)+0.18,z);
        f.root.rotation.y=Math.atan2(s.dx,s.dz);
        f.root.scale.set(s.w,1.1,s.len);
      }
    }
    for(const [id,f] of this.zones)if(!seen.has(id)){this.release(f.id,f.root);this.zones.delete(id);}
  }
  update(dt) {
    this.glow.update(dt);
    for(let i=this.active.length-1;i>=0;i--){
      const f=this.active[i];f.time+=dt;if(f.time<0)continue;
      const t=Math.min(1,f.time/f.life);
      if(t>=1){this.release(f.id,f.root);this.active.splice(i,1);continue;}
      f.root.visible=true;
      const tail=t<0.78?1:Math.max(0.02,(1-t)/0.22);
      const expand=f.mode==='fall'?1:f.mode==='charge'?1-0.55*t:f.mode==='slash'?0.8+0.35*t:0.55+0.55*(1-Math.pow(1-t,3));
      const scale=f.size*expand*(f.mode==='fall'?1:tail),v=f.stretch||[1,1,1];
      f.root.scale.set(scale*v[0],scale*v[1],scale*v[2]);
      f.root.position.set(f.follow?.x??f.x,f.startY+(f.mode==='fall'?(1-t*t)*f.rise:t*f.rise),f.follow?.z??f.z);
      if(f.travel){f.root.position.x+=Math.sin(f.turn)*t*f.travel;f.root.position.z+=Math.cos(f.turn)*t*f.travel;}
      f.root.rotation.set(f.pitch,f.turn+t*f.spin,0);
    }
  }
  dispose() {
    this.glow.dispose();
    for(const f of [...this.active,...this.zones.values()]){this.scene.remove(f.root);disposeHeroEffect(f.root);}
    for(const pool of this.pool.values())for(const root of pool)disposeHeroEffect(root);
    this.active=[];this.zones.clear();this.pool.clear();
  }
}
