import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { patchFow } from './terrain.js';

export const HERO_ASSETS = {
  'alchemist-staff': {height:1.65, grip:0.25}, 'guardian-shield': {size:[0.52,0.68,0.13]},
  'shadow-dagger': {height:0.48, grip:0.16, flip:true}, 'forge-hammer': {height:1.12, grip:0.23},
  'dawn-sword': {height:1.05, grip:0.16}, 'storm-bow': {height:1.02, grip:0.5},
  'astral-orb': {height:0.48}, 'forest-spear': {height:1.75, grip:0.29},
  'arcane-cannon': {size:[0.22,0.26,0.7]}, 'resonance-baton': {height:0.48, grip:0.12},
  'resonance-lyre': {height:0.58}, 'cryo-blaster': {size:[0.13,0.30,0.48], grip:0.3},
  'ember-focus': {height:0.22}, 'aegis-breastplate': {size:[0.32,0.29,0.08]},
  'aegis-pauldron': {size:[0.24,0.17,0.27]}, 'aegis-bracer': {size:[0.13,0.16,0.12]},
  'mystic-mantle': {size:[0.48,0.21,0.28]}, 'ranger-quiver': {height:0.48},
  'arcane-backpack': {size:[0.3,0.35,0.14]},
  'fx-crescent': {}, 'fx-bolt': {}, 'fx-rune-ring': {}, 'fx-ward': {},
  'fx-ice-burst': {}, 'fx-flame-vortex': {}, 'fx-meteor': {}, 'fx-anvil': {},
  'fx-radiant-star': {plane:'upright'}, 'fx-shock-crown': {plane:'ground'}, 'fx-ascend-wings': {plane:'upright'},
};
const templates = new Map(), materials = new Map();
const loader = new GLTFLoader();
let loading;
export function loadHeroAssets(base = '', onProgress = () => {}) {
  if (loading) return loading;
  loading = (async () => {
    let cursor = 0, done = 0;
    const ids = Object.keys(HERO_ASSETS), failures = [];
    await Promise.all(Array.from({length:3}, async () => {
      while (cursor < ids.length) {
        const id = ids[cursor++];
        try {
          const gltf = await loader.loadAsync(`${base}public/models/heroes/${id}.glb`);
          const root = new THREE.Group(); root.add(gltf.scene);
          // Tripo P1 renders its front on +X; characters face +Z.
          gltf.scene.rotation.y = -Math.PI / 2;
          if (HERO_ASSETS[id].flip) gltf.scene.rotation.z = Math.PI;
          root.updateMatrixWorld(true);
          const parts = [];
          root.traverse(o => { if (o.isMesh) parts.push({geometry:o.geometry.clone().applyMatrix4(o.matrixWorld), material:o.material}); });
          // Remove generated display bases / detached skirt and keep only the chest
          // panel; shoulder plates are separate articulated attachments.
          if(['astral-orb','mystic-mantle','aegis-breastplate'].includes(id)) {
            for(const part of parts) {
              const g=part.geometry;g.computeBoundingBox();const b=g.boundingBox,p=g.attributes.position;
              const cx=(b.min.x+b.max.x)/2,w=b.max.x-b.min.x,h=b.max.y-b.min.y,kept=[];
              const valid=i=>id==='aegis-breastplate'?Math.abs(p.getX(i)-cx)<w*0.34:p.getY(i)>b.min.y+h*(id==='astral-orb'?0.31:0.47);
              const idx=g.index, count=idx?idx.count:p.count;
              for(let i=0;i<count;i+=3){const tri=[0,1,2].map(k=>idx?idx.getX(i+k):i+k);if(tri.every(valid))kept.push(...tri);}
              if(kept.length){g.setIndex(kept);part.geometry=g.toNonIndexed();part.geometry.computeBoundingBox();g.dispose();}
            }
          }
          if(id==='aegis-bracer') for(const p of parts)p.geometry.rotateX(Math.PI/2);
          const def = HERO_ASSETS[id];
          // Generated effect planes can vary despite prompt axes. Align the thin
          // axis before normalizing: crowns lie on XZ, stars/wings face +Z.
          if(def.plane) {
            const bounds=new THREE.Box3();
            for(const p of parts){p.geometry.computeBoundingBox();bounds.union(p.geometry.boundingBox);}
            const d=bounds.getSize(new THREE.Vector3());
            const thin=d.x<d.y&&d.x<d.z?'x':d.y<d.z?'y':'z';
            for(const p of parts){
              if(def.plane==='ground') {if(thin==='z')p.geometry.rotateX(-Math.PI/2);else if(thin==='x')p.geometry.rotateZ(Math.PI/2);}
              else {if(thin==='x')p.geometry.rotateY(Math.PI/2);else if(thin==='y')p.geometry.rotateX(Math.PI/2);}
            }
          }
          // Straighten a generated diagonal weapon before locating the actual hilt.
          if((def.grip!=null && id!=='cryo-blaster') || id==='fx-bolt') {
            const bounds=new THREE.Box3();
            for(const p of parts){p.geometry.computeBoundingBox();bounds.union(p.geometry.boundingBox);}
            const top=new THREE.Vector3(),bottom=new THREE.Vector3();let nt=0,nb=0;
            const band=(bounds.max.y-bounds.min.y)*0.09;
            for(const p of parts){const a=p.geometry.attributes.position;for(let i=0;i<a.count;i++){
              const v=new THREE.Vector3().fromBufferAttribute(a,i);
              if(v.y>bounds.max.y-band){top.add(v);nt++;}if(v.y<bounds.min.y+band){bottom.add(v);nb++;}
            }}
            if(nt&&nb){const axis=top.divideScalar(nt).sub(bottom.divideScalar(nb)).normalize();const q=new THREE.Quaternion().setFromUnitVectors(axis,new THREE.Vector3(0,1,0));for(const p of parts)p.geometry.applyQuaternion(q);}
          }
          if(id==='fx-bolt') for(const p of parts)p.geometry.rotateX(Math.PI/2);
          if(id==='fx-ice-burst') for(const p of parts)p.geometry.rotateX(Math.PI/2);
          const box = new THREE.Box3();
          for (const p of parts) {p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox);}
          const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
          const scale = def.size ? new THREE.Vector3(...def.size).divide(size) : new THREE.Vector3().setScalar((def.height || 1) / Math.max(size.y,size.x * (id.startsWith('fx-') ? 1 : 0),size.z * (id.startsWith('fx-') ? 1 : 0),0.001));
          if (def.grip != null) {
            center.y = box.min.y + size.y * def.grip;
            let x=0,z=0,n=0;
            for(const p of parts){const a=p.geometry.attributes.position;for(let i=0;i<a.count;i++)if(Math.abs(a.getY(i)-center.y)<size.y*0.025){x+=a.getX(i);z+=a.getZ(i);n++;}}
            if(n){center.x=x/n;center.z=z/n;}
          }
          if(['fx-ward','fx-flame-vortex','fx-ice-burst','fx-anvil','fx-shock-crown'].includes(id)) center.y=box.min.y;
          for (const p of parts) p.geometry.translate(-center.x,-center.y,-center.z).scale(scale.x,scale.y,scale.z);
          templates.set(id,parts);
        } catch (e) {failures.push(id); console.warn('Hero asset fallback:',id,e.message);}
        onProgress(++done/ids.length);
      }
    }));
    return {loaded:templates.size, failures};
  })();
  return loading;
}

function equipmentMaterial(source, accent) {
  const key = `${source.uuid}:${accent}`;
  if (materials.has(key)) return materials.get(key);
  const m = source.clone();
  m.roughness = 0.48; m.metalness = 0.45;
  for (const k of ['map','normalMap','roughnessMap','metalnessMap']) if(m[k]) m[k].anisotropy=4;
  m.onBeforeCompile = sh => {
    sh.uniforms.uHeroAccent = {value:new THREE.Color(accent)};
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 uHeroAccent;')
      .replace('#include <map_fragment>',`#include <map_fragment>
      float teal = smoothstep(0.03,0.16,min(diffuseColor.g,diffuseColor.b)-diffuseColor.r);
      float lightness = max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
      diffuseColor.rgb = mix(diffuseColor.rgb,uHeroAccent*(0.3+lightness),teal*0.9);
      totalEmissiveRadiance += uHeroAccent * teal * 0.32;`);
  };
  m.customProgramCacheKey=()=>`hero-gear-${accent}`;
  patchFow(m); materials.set(key,m); return m;
}

export function createHeroAsset(id, accent = 0x78e6df, effect = false) {
  const parts = templates.get(id); if (!parts) return null;
  const root = new THREE.Group(); root.name=`tripo-hero-${id}`;
  root.userData.assetId=id;
  for (const p of parts) {
    const material = effect ? new THREE.MeshBasicMaterial({color:accent,transparent:false,opacity:1,blending:THREE.NormalBlending,depthWrite:true,side:THREE.DoubleSide,toneMapped:false,fog:false}) : equipmentMaterial(p.material,accent);
    if(effect) {
      material.onBeforeCompile=sh=>{
        sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vEffectNormal;')
          .replace('#include <begin_vertex>','#include <begin_vertex>\nvEffectNormal = normalize(normalMatrix * normal);');
        sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vEffectNormal;')
          .replace('#include <opaque_fragment>',`vec3 en=normalize(vEffectNormal);
          float rim=pow(1.0-abs(en.z),2.0);
          float facet=max(0.0,dot(en,normalize(vec3(-0.35,0.7,0.6))));
          outgoingLight*=0.72+facet*0.28;
          outgoingLight=mix(outgoingLight,vec3(1.0,0.96,0.78),rim*0.12+pow(facet,8.0)*0.32);
          #include <opaque_fragment>`);
      };
      material.customProgramCacheKey=()=> 'tripo-solid-energy-v2';
    }
    const mesh = new THREE.Mesh(p.geometry,material); mesh.castShadow=!effect; mesh.frustumCulled=false;
    mesh.userData.sharedHeroGeometry=true; root.add(mesh);
  }
  return root;
}

export function disposeHeroEffect(root) {
  root.traverse(o=>{if(o.isMesh && o.userData.sharedHeroGeometry) o.material.dispose();});
}
