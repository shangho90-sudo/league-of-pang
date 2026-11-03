import * as THREE from 'three';
import { createHeroAsset } from './heroAssets.js';

export function upgradeHeroKit(champ, kit) {
  const asset=id=>createHeroAsset(id,champ.accent);
  const replace=(key,id,opts={})=>{
    const obj=asset(id); if(!obj) return;
    kit[key]={...(kit[key]||{}),obj,...opts}; return obj;
  };
  const grasp={grasp:true,off:[0,0,0],gripRadius:0.022};
  switch(champ.id) {
    case 'pang': replace('right','alchemist-staff',{...grasp,tip:[0,1.24,0]}); replace('back','arcane-backpack',{surface:-1,off:[0,-0.04,-0.16]}); break;
    case 'koo': {
      const sh=replace('left','guardian-shield',{...grasp,bone:'Left_Hand',grip:[0,0,0],rest:{up:[0,1,0],fwd:[0,0,1]},tip:[0,0,0.23]});
      if(sh) {
        // Keep the whole shield face beyond the knuckles. A rear handle bridges the gap.
        sh.children.forEach(o=>{o.position.z+=0.15;});
        const gripMat=new THREE.MeshStandardMaterial({color:0x342b26,roughness:0.75});
        const handle=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.15,8),gripMat);sh.add(handle);
        for(const y of [-0.075,0.075]) {const pin=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.1,6).rotateX(Math.PI/2),gripMat);pin.position.set(0,y,0.05);sh.add(pin);}
        kit.right={obj:new THREE.Group(),...grasp,bone:'Right_Hand',tip:[0,0,0.06]};
      }
      replace('chest','aegis-breastplate',{bone:'UpperChest',off:[0,-0.035,0],surface:1});
      break;
    }
    case 'bang': replace('right','shadow-dagger',{...grasp,tip:[0,0.4,0]}); replace('left','shadow-dagger',{...grasp,tip:[0,0.4,0]}); break;
    case 'park': replace('right','forge-hammer',{...grasp,tip:[0,0.86,0]}); break;
    case 'jung': replace('right','dawn-sword',{...grasp,tip:[0,0.88,0]}); replace('chest','aegis-breastplate',{bone:'UpperChest',off:[0,-0.035,0],surface:1}); break;
    case 'cha': replace('left','storm-bow',{...grasp,bone:'Left_Hand',grip:[0,0,0],rest:{up:[0,1,0],fwd:[0,0,1]},tip:[0,0,0.15]}); replace('back','ranger-quiver',{surface:-1,off:[0,0,-0.17]}); break;
    case 'sagong': {
      const orb=replace('float','astral-orb',{float:true,anchor:[0.62,1.05,0.1]});
      if(orb) {orb.position.fromArray(kit.float.anchor);delete kit.float.r1;delete kit.float.r2;delete kit.float.planets;}
      break;
    }
    case 'cho': replace('right','forest-spear',{...grasp,tip:[0,1.24,0]}); break;
    case 'kim': replace('cannon','arcane-cannon',{bone:'UpperChest',off:[-0.4,0.05,0],rot:[-8,0,0],muzzle:[0,0,0.36],tip:[0,0,0.36]}); replace('back','arcane-backpack',{surface:-1,off:[0,-0.03,-0.19]}); break;
    case 'lee': {
      replace('right','resonance-baton',{...grasp,gripRadius:0.014,tip:[0,0.42,0]});
      const lyre=replace('float','resonance-lyre',{float:true,instrument:true});if(lyre)lyre.position.set(0.5,1.15,0.05);
      break;
    }
    case 'choi': {
      const gun=replace('right','cryo-blaster',{...grasp,tip:[0,0.12,0.25]});
      // 생성 모델의 총구가 -Z(손등 쪽)를 향해 거꾸로 쥐어짐 → 손잡이 축을 기준으로 180° 돌려 총구를 앞으로
      if(gun) gun.children.forEach(o=>o.rotateY(Math.PI)); replace('back','arcane-backpack',{surface:-1,off:[0,-0.01,-0.20]}); break;
    }
    case 'flame': replace('right','ember-focus',{bone:'Right_Hand',off:[0,0.12,0.04],upright:true,tip:[0,0.15,0]}); replace('left','ember-focus',{bone:'Left_Hand',off:[0,0.12,0.04],upright:true}); break;
  }
  for(const key of ['lsh','rsh']) if(kit[key]) replace(key,'aegis-pauldron',{off:[key==='lsh'?0.025:-0.025,0.07,0]});
  for(const [key,side,sign] of [['lb','Left',1],['rb','Right',-1]]) {
    if(['koo','park','jung','cho','cha'].includes(champ.id)) replace(key,'aegis-bracer',{bone:`${side}_LowerArm`,off:[sign*0.085,0,0],rot:[0,0,90]});
  }
  if(['pang','bang','sagong','lee','flame'].includes(champ.id)) {
    const mantle=asset('mystic-mantle');
    if(mantle) {
      delete kit.cape;delete kit.scarf;delete kit.mantle;delete kit.collar;delete kit.robe;
      kit.mantle={obj:mantle,bone:'UpperChest',off:[0,0.10,-0.025]};
    }
  }
  return kit;
}
