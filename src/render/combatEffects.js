import * as THREE from 'three';
import { createHeroAsset, disposeHeroEffect } from './heroAssets.js';
import { groundHeight } from '../map/grid.js';

// Bounded, reusable meshes: all 12 champions share the same reviewed Tripo geometry.
export class CombatEffects {
  constructor(scene, quality) {this.scene=scene;this.active=[];this.pool=new Map();this.limit=quality.particles<0.8?16:30;this.spawned=0;}
  emit(id, {x=0,y,z=0,color=0x8feaff,size=1,life=0.6,turn=0,rise=0,spin=0,mode='pulse',delay=0}={}) {
    if(this.active.length>=this.limit) return null;
    const pool=this.pool.get(id)||[];this.pool.set(id,pool);
    const root=pool.pop()||createHeroAsset(id,color,true);if(!root)return null;
    root.position.set(x,y??groundHeight(x,z)+0.12,z);root.rotation.set(0,turn,0);root.scale.setScalar(size);root.visible=delay===0;
    root.traverse(o=>{if(o.isMesh){o.material.color.set(color);o.material.opacity=0;o.renderOrder=3;}});
    const item={root,id,time:-delay,life,size,rise,spin,mode,startY:root.position.y,turn};
    this.scene.add(root);this.active.push(item);this.spawned++;return root;
  }
  basic(source,target,tip) {
    const c=source.def.accent;
    if(source.def.stats.ranged) this.emit('fx-bolt',{x:target.x,z:target.z,y:groundHeight(target.x,target.z)+0.9,color:c,size:0.36,life:0.22,rise:0.15,spin:4});
    else this.emit('fx-crescent',{x:source.x+Math.sin(source.facing)*0.7,z:source.z+Math.cos(source.facing)*0.7,y:tip?.y??groundHeight(source.x,source.z)+0.8,color:c,size:source.def.arche==='spear'?1.2:1.9,life:0.24,turn:source.facing,spin:1.7,mode:'slash'});
  }
  cast(unit,slot) {
    const ult=slot==='R';
    this.emit('fx-rune-ring',{x:unit.x,z:unit.z,color:unit.def.accent,size:ult?2.5:1.3,life:ult?0.9:0.45,spin:ult?-0.8:1.2});
    if(ult) this.emit('fx-ward',{x:unit.x,z:unit.z,y:groundHeight(unit.x,unit.z)+0.35,color:unit.def.accent,size:1.8,life:0.65,rise:0.8,spin:0.4});
  }
  named(e) {
    const u=e.u, x=e.x??u?.x, z=e.z??u?.z;
    if(x==null||z==null)return;
    const common={x,z,color:e.color??u?.def?.accent??0x9ae8ff,size:Math.min(8,(e.r||1.3)*1.5)};
    switch(e.name) {
      case 'anvilDrop': return !!this.emit('fx-anvil',{...common,size:2.1,life:e.delay||0.9,mode:'fall',rise:7});
      case 'meteorFall': return !!this.emit('fx-meteor',{...common,color:0xffd576,size:1.4,life:Math.min(0.6,e.delay||0.6),delay:Math.max(0,(e.delay||0.6)-0.6),mode:'fall',rise:9,spin:0.6});
      case 'anvilImpact': case 'meteorImpact': case 'groundSlam': case 'hammerSlam': case 'dawnBurst': case 'starBurst': case 'arcaneBlast': case 'mineBlast':
        this.emit('fx-rune-ring',{...common,life:0.65,spin:1.5});this.emit('fx-bolt',{...common,y:groundHeight(x,z)+0.6,size:0.85,life:0.35,rise:0.7,spin:3});break;
      case 'oathShield': case 'fortress': case 'ironShield': case 'sanctumRise': case 'harmonyPulse':
        this.emit('fx-ward',{...common,size:1.5,life:0.85,rise:0.2});break;
      case 'frostBloom': case 'freeze': case 'absoluteZero':
        this.emit('fx-ice-burst',{...common,color:0x99e8ff,life:0.8,rise:0.15});break;
      case 'firePillar': case 'firestormStart': case 'firestormEnd': case 'fireBurst':
        this.emit('fx-flame-vortex',{...common,color:0xff772e,life:0.9,rise:0.5,spin:3});break;
      case 'swordArc': case 'phantomSlash': case 'shieldBash': case 'thrust': case 'resonanceWave':
        this.emit('fx-crescent',{...common,y:groundHeight(x,z)+0.9,size:e.r||2.1,turn:e.dir?Math.atan2(e.dir.x,e.dir.z):u?.facing||0,life:0.3,spin:1.4,mode:'slash'});break;
      case 'forestBreath': case 'healBurst': case 'primalAura': case 'marchPulse': case 'gravityCollapse':
        this.emit('fx-rune-ring',{...common,life:0.75,rise:0.12,spin:-1});break;
    }
  }
  update(dt) {
    for(let i=this.active.length-1;i>=0;i--) {
      const f=this.active[i];f.time+=dt;
      if(f.time<0)continue;
      f.root.visible=true;
      const t=Math.min(1,f.time/f.life);
      if(t>=1) {this.scene.remove(f.root);f.root.visible=false;this.pool.get(f.id).push(f.root);this.active.splice(i,1);continue;}
      const fade=Math.min(1,t/0.12)*Math.pow(1-t,0.65)*0.72;
      f.root.traverse(o=>{if(o.isMesh)o.material.opacity=fade;});
      const expand=f.mode==='fall'?1:f.mode==='slash'?0.85+0.35*t:0.55+0.65*(1-Math.pow(1-t,3));
      f.root.scale.setScalar(f.size*expand);
      f.root.position.y=f.startY+(f.mode==='fall'?(1-t*t)*f.rise:t*f.rise);
      f.root.rotation.y=f.turn+t*f.spin;
    }
  }
  dispose() {for(const f of this.active){this.scene.remove(f.root);disposeHeroEffect(f.root);}for(const pool of this.pool.values())for(const root of pool)disposeHeroEffect(root);this.active=[];this.pool.clear();}
}
