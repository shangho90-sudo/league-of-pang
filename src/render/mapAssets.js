// Tripo map assets: one shared template per asset, independent skeletons per unit.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { patchFow } from './terrain.js';
import { TEAM_COLORS } from '../map/layout.js';

export const MAP_ASSETS = {
  turret: { height: 5.2, width: 4.2 }, nexus: { height: 6.5, width: 8.8 },
  fountain: { height: 2.3, width: 10.8, squashY: 0.25, offsetY: -0.12 }, shop: { height: 4.1, width: 4.8 },
  'tree-oak': { height: 6.2, width: 5.8 }, 'tree-pine': { height: 6.8, width: 4.4 },
  rock: { height: 2.3, width: 3.6 }, wall: { height: 2.5, width: 4.4 },
  'minion-melee': { height: 1.25, rig: 'biped' }, 'minion-caster': { height: 1.3, rig: 'biped' },
  'minion-siege': { height: 1.2, width: 1.65 },
  golem: { height: 2.65, rig: 'biped' }, wolf: { height: 1.5, rig: 'quadruped' },
  drake: { height: 3.4, width: 7, rig: 'quadruped' }, colossus: { height: 4.5, rig: 'biped' },
};
const templates = new Map(), materialCache = new Map(), partsCache = new Map();
// Reviewed joint bindings: generated semantic names sometimes label shoulders as spines.
const JOINT_BINDINGS = {
  'minion-caster': {
    tripoSpine_0: ['arm',0], bone_4: ['arm',1], bone_6: ['arm',0], bone_7: ['arm',1],
    tripo0_Left_Limb_2: ['arm',0], tripo0_Left_Limb_3: ['arm',1], bone_16: ['leg',0], bone_17: ['leg',1],
  },
  golem: {
    tripo0_Right_Limb_0: ['arm',0], tripo0_Right_Limb_1: ['arm',1],
    tripo1_Left_Limb_0: ['arm',0], tripo1_Left_Limb_1: ['arm',1],
    bone_14: ['leg',0], bone_15: ['leg',1], tripo1_Right_Limb_1: ['leg',0], tripo1_Right_Limb_2: ['leg',1],
  },
  colossus: {
    tripoSpine_1: ['arm',0], bone_8: ['arm',1], bone_17: ['arm',0], bone_18: ['arm',1],
    tripo0_Left_Limb_1: ['leg',0], tripo0_Left_Limb_2: ['leg',1], bone_31: ['leg',0], bone_32: ['leg',1],
  },
};
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let loading;
export function loadMapAssets(onProgress = () => {}) {
  if (loading) return loading;
  loading = (async () => {
    let done = 0, cursor = 0;
    const ids = Object.keys(MAP_ASSETS), failures = [];
    // Keep simultaneous texture decode bounded on mobile browsers.
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (cursor < ids.length) {
        const id = ids[cursor++];
        try {
          const gltf = await loader.loadAsync(new URL(`public/models/environment/${id}.glb`, document.baseURI).href);
          templates.set(id, gltf);
        } catch (error) { failures.push(id); console.warn('Map asset fallback:', id, error.message); }
        onProgress(++done / ids.length);
      }
    }));
    return { loaded: templates.size, failures };
  })();
  return loading;
}

function materialFor(source, team, foliage) {
  const key = `${source.uuid}:${team}:${foliage}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const m = source.clone();
  m.roughness = Math.max(0.48, m.roughness ?? 0.7);
  m.metalness = Math.min(0.35, m.metalness ?? 0);
  for (const name of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (m[name]) m[name].anisotropy = 4;
  if (team === 0 || team === 1) {
    const color = new THREE.Color(TEAM_COLORS[team].main);
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uAssetTeam = { value: color };
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uAssetTeam;')
        .replace('#include <map_fragment>', `#include <map_fragment>
        float teal = smoothstep(0.025, 0.16, min(diffuseColor.g, diffuseColor.b) - diffuseColor.r);
        float brightness = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
        diffuseColor.rgb = mix(diffuseColor.rgb, uAssetTeam * (0.22 + brightness * 0.9), teal * 0.85);`);
    };
    m.customProgramCacheKey = () => `tripo-team-${team}`;
  }
  patchFow(m, foliage ? { wind: true, windAmp: 0.022, windMinY: 2.2, occlude: true } : {});
  materialCache.set(key, m);
  return m;
}

export function createMapAsset(id, team = -1) {
  const template = templates.get(id);
  if (!template) return null;
  const def = MAP_ASSETS[id], root = new THREE.Group(), model = cloneSkeleton(template.scene);
  // Tripo's rig export faces +X; simulation headings face +Z.
  if (def.rig || id === 'minion-siege') model.rotation.y -= Math.PI / 2;
  root.name = `tripo-${id}`;
  root.add(model);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
  const s = Math.min(def.height / Math.max(0.001, size.y), def.width ? def.width / Math.max(size.x, size.z, 0.001) : Infinity);
  model.scale.multiplyScalar(s);
  model.position.add(new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2).multiplyScalar(s));
  if (def.squashY) { model.scale.y *= def.squashY; model.position.y *= def.squashY; }
  model.position.y += def.offsetY || 0;
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    if (o.isSkinnedMesh) o.frustumCulled = false;
    o.material = Array.isArray(o.material) ? o.material.map(m => materialFor(m, team, id.startsWith('tree-'))) : materialFor(o.material, team, id.startsWith('tree-'));
  });
  root.userData = { assetId: id, h: size.y * s, model, animation: null };
  if (def.rig) root.userData.animation = new AssetMotion(model, root, template.animations, def.rig);
  return root;
}

// Geometry is flattened once, then instanced in spatial chunks by props.js.
export function mapAssetParts(id) {
  if (partsCache.has(id)) return partsCache.get(id);
  const root = createMapAsset(id);
  if (!root) return null;
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    parts.push({ geometry: o.geometry.clone().applyMatrix4(o.matrixWorld), material: o.material });
  });
  partsCache.set(id, parts);
  return parts;
}

class AssetMotion {
  constructor(model, root, clips, kind) {
    this.kind = kind; this.phase = Math.random() * Math.PI * 2;
    this.rest = []; this.mixer = null; this.action = null;
    root.updateMatrixWorld(true);
    const inv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const limbs = new Map();
    model.traverse(bone => {
      if (!bone.isBone) return;
      const match = /([01]_(?:Left|Right))_Limb_0$/.exec(bone.name);
      if (!match) return;
      const position = root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
      // Tripo numbers limb chains differently for each generated character.
      limbs.set(match[1], { arm: kind === 'biped' && position.y > root.userData.h * 0.58, side: position.x >= 0 ? 1 : -1 });
    });
    model.traverse(bone => {
      if (!bone.isBone) return;
      const parentRotation = inv.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion()));
      let armRoll = 0;
      const match = /([01]_(?:Left|Right))_Limb_(\d+)$/.exec(bone.name);
      const position = root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
      const binding = JOINT_BINDINGS[root.userData.assetId];
      const override = binding?.[bone.name];
      const limb = binding ? (override ? { arm: override[0] === 'arm', side: position.x >= 0 ? 1 : -1, joint: override[1] } : null)
        : match ? { ...limbs.get(match[1]), joint: +match[2] } : null;
      if (limb?.arm && limb.joint === 0) {
        const child = bone.children.find(b => b.isBone);
        if (child) {
          const direction = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).applyQuaternion(inv);
          armRoll = -Math.PI / 2 - Math.atan2(direction.y, direction.x);
          armRoll = Math.atan2(Math.sin(armRoll), Math.cos(armRoll));
          armRoll *= 0.85; // relax each source pose rather than assuming every model is T-posed
        }
      }
      this.rest.push({ bone, armRoll, limb, position, q: bone.quaternion.clone(), p: parentRotation, inv: parentRotation.clone().invert() });
    });
    if (clips.length) {
      this.mixer = new THREE.AnimationMixer(model);
      this.action = this.mixer.clipAction(clips.find(c => /walk/i.test(c.name)) || clips[0]).play();
      this.mixer.update(0.15);
    }
    this.delta = new THREE.Quaternion(); this.euler = new THREE.Euler();
  }
  update(dt, time, unit, alpha = 0) {
    const speed = unit.moving ? unit.speedNow : 0, weight = Math.min(1, speed / 2.5);
    this.phase += dt * speed * (this.kind === 'biped' ? 3.3 : 2.7);
    const a = unit.action;
    let attack = 0;
    if (a) { const at = a.t + alpha; attack = at < a.windup ? -0.35 * at / Math.max(a.windup, 0.01) : Math.sin(Math.min(1, (at - a.windup) / 0.3) * Math.PI); }
    if (this.mixer) {
      this.action.paused = !unit.moving;
      this.action.timeScale = Math.max(0.4, speed / 2.5);
      this.mixer.update(dt);
      return;
    }
    // Local locomotion also covers services that return a rig without animation.
    // Apply rotations in character space, regardless of each imported bone's local axes.
    for (const r of this.rest) {
      let x = 0, y = 0, z = 0;
      const n = r.bone.name;
      if (r.limb) {
        const side = r.limb.side, chain = this.kind === 'quadruped' && r.position.z < 0 ? 1 : 0, joint = r.limb.joint;
        const wave = Math.sin(this.phase + (side > 0 ? 0 : Math.PI) + (chain ? Math.PI : 0)) * weight;
        if (r.limb?.arm) {
          if (joint === 0) { z = r.armRoll; x = -wave * 0.3 - attack * 0.85; }
          if (joint === 1) y = -side * 0.3;
        } else {
          if (joint === 0) x = wave * 0.45;
          if (joint === 1) x = Math.max(0, -wave) * 0.5;
        }
      } else if (/Head_0$/.test(n)) x = Math.sin(time * 1.6) * 0.025 - attack * 0.24;
      else if (/Tail_/.test(n)) y = Math.sin(time * 2.1) * 0.045;
      else if (/Spine_0$/.test(n)) x = attack * 0.12;
      this.delta.setFromEuler(this.euler.set(x, y, z));
      r.bone.quaternion.copy(r.inv).multiply(this.delta).multiply(r.p).multiply(r.q);
    }
  }
}

export function updateAssetMotion(root, dt, time, unit, alpha) {
  root.userData.animation?.update(dt, time, unit, alpha);
}
