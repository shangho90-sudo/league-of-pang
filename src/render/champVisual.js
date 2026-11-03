// 챔피언 외형 조립: 리깅 모델(머리·얼굴) + 체형 비율 + 가운 재채색 + 뼈 부착 장비
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HumanoidRig } from './rig.js';
import { patchFow } from './terrain.js';

export const CHAR_HEIGHT = 1.75;
export const HEAD_SCALE = 0.74;
const templates = new Map();
const loader = new GLTFLoader();
let ASSET_BASE = '';
export function setAssetBase(b) { ASSET_BASE = b; }

export async function loadModelTemplates(ids, onProgress) {
  let done = 0;
  await Promise.all(ids.map((id) => new Promise((res, rej) => {
    if (templates.has(id)) { done++; return res(); }
    loader.load(`${ASSET_BASE}public/models/m${id}.glb`, (g) => { templates.set(id, g.scene); done++; onProgress && onProgress(done / ids.length); res(); }, undefined, rej);
  })));
}

// ---------------- 재질 ----------------
const M = {};
function mat(key, make) { return M[key] || (M[key] = patchFow(make())); }
const std = (color, rough = 0.7, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const glow = (color, intensity = 1.2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
const glass = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.55 });

function mesh(geo, material, cast = true) { const m = new THREE.Mesh(geo, material); m.castShadow = cast; return m; }
function lathe(pts, seg = 10) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
function rrect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
function bladeShape(len, w, curve = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.quadraticCurveTo(-w / 2 + curve, len * 0.6, 0, len); s.quadraticCurveTo(w / 2 + curve, len * 0.55, w / 2, 0); s.lineTo(-w / 2, 0);
  return s;
}
function extrude(shape, depth, bevel = 0.01) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// ---------------- 장비 빌더 (그립 공간: 손잡이 원점, +Y 방향으로 뻗음) ----------------
const KITS = {
  pang(c) {
    const out = {};
    const staff = new THREE.Group();
    staff.add(mesh(new THREE.CylinderGeometry(0.032, 0.038, 1.55, 8).translate(0, 0.25, 0), mat('wood', () => std(0x7a5a3a, 0.8))));
    // 유봉 머리: 상아색 막자 + 청록 띠 + 빛나는 약병
    staff.add(mesh(lathe([[0.0, 0], [0.09, 0.02], [0.13, 0.12], [0.12, 0.24], [0.07, 0.3], [0, 0.31]], 12).translate(0, 1.0, 0), mat('ivory', () => std(0xefe6cf, 0.55))));
    staff.add(mesh(new THREE.TorusGeometry(0.125, 0.018, 6, 16).rotateX(Math.PI / 2).translate(0, 1.12, 0), mat('teal', () => std(c.trim, 0.4, 0.5))));
    staff.add(mesh(new THREE.TorusGeometry(0.1, 0.015, 6, 16).rotateX(Math.PI / 2).translate(0, 1.24, 0), mat('teal', () => std(c.trim, 0.4, 0.5))));
    const vial = mesh(lathe([[0, 0], [0.05, 0.01], [0.055, 0.1], [0.022, 0.14], [0.022, 0.18], [0, 0.18]], 10).translate(0, 1.3, 0), mat('glassT', () => glass(0xbff8f0)));
    staff.add(vial);
    const liquid = mesh(new THREE.SphereGeometry(0.04, 10, 8).translate(0, 1.355, 0), mat('liqT', () => glow(c.accent, 1.4)), false);
    staff.add(liquid);
    staff.add(mesh(new THREE.SphereGeometry(0.05, 8, 6).translate(0, -0.52, 0), mat('ivory', () => std(0xefe6cf, 0.55))));
    out.right = { obj: staff, grip: [90, 0, 0], off: [0, 0, 0] };
    // 등의 약병 장치
    const back = new THREE.Group();
    back.add(mesh(new THREE.BoxGeometry(0.34, 0.36, 0.08), mat('leather', () => std(0x6a4a30, 0.85))));
    for (let i = 0; i < 3; i++) {
      const v = mesh(lathe([[0, 0], [0.055, 0.01], [0.06, 0.15], [0.025, 0.2], [0, 0.2]], 10), mat('glassT', () => glass(0xbff8f0)));
      v.position.set(-0.11 + i * 0.11, 0.08, -0.07);
      back.add(v);
      const l = mesh(new THREE.CylinderGeometry(0.048, 0.05, 0.1, 10), mat('liq' + i, () => glow([0x6af0d8, 0x9aff8a, 0x5ad0ff][i], 1.1)), false);
      l.position.set(-0.11 + i * 0.11, 0.14, -0.07);
      back.add(l);
    }
    back.add(mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 14, Math.PI).translate(0, 0.2, -0.07), mat('brass', () => std(0xc09a50, 0.35, 0.8))));
    out.back = { obj: back, bone: 'UpperChest', off: [0, 0.02, -0.17] };
    out.belt = { obj: (() => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const v = mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.09, 8), mat('liq' + i, () => glow([0x6af0d8, 0x9aff8a, 0x5ad0ff][i], 1.1))); v.position.set(-0.14 + i * 0.14, 0, 0.12); g.add(v); } return g; })(), bone: 'Hips', off: [0, -0.02, 0] };
    return out;
  },
  koo(c) {
    const out = {};
    // 대형 방패: 흑철 + 리벳 + 주황 동력 코어
    const sh = new THREE.Group();
    sh.add(mesh(extrude(rrect(0.62, 0.86, 0.16), 0.06, 0.02), mat('iron', () => std(0x58606c, 0.42, 0.55))));
    sh.add(mesh(extrude(rrect(0.5, 0.74, 0.12), 0.07, 0.01).translate(0, 0, 0.012), mat('iron2', () => std(0x737b88, 0.4, 0.6))));
    for (const [x, y] of [[-0.24, 0.36], [0.24, 0.36], [-0.24, -0.36], [0.24, -0.36], [0, 0.4], [0, -0.4]]) sh.add(mesh(new THREE.SphereGeometry(0.025, 6, 4).translate(x, y, 0.05), mat('brass', () => std(0xc09a50, 0.35, 0.8))));
    sh.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.06, 6).rotateX(Math.PI / 2).translate(0, 0.02, 0.06), mat('iron', () => std(0x58606c, 0.42, 0.55))));
    sh.add(mesh(new THREE.OctahedronGeometry(0.075, 0).translate(0, 0.02, 0.1), mat('coreO', () => glow(c.accent, 1.6)), false));
    sh.scale.setScalar(0.82);
    out.left = { obj: sh, bone: 'Left_LowerArm', grip: [0, 70, 0], off: [0.2, -0.12, 0.08] };
    // 겹판 어깨 갑옷 (상체 실루엣 확대)
    const pauld = () => {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const p = mesh(new THREE.SphereGeometry(0.2 - i * 0.03, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.6, 1.0).translate(0, -i * 0.07, 0), mat(i ? 'iron2' : 'iron', () => std(i ? 0x464b55 : 0x30333b, 0.5, 0.75)));
        g.add(p);
      }
      g.add(mesh(new THREE.TorusGeometry(0.2, 0.015, 5, 14).rotateX(Math.PI / 2).scale(1.15, 1, 1), mat('coreO', () => glow(c.accent, 1.2)), false));
      return g;
    };
    const pl = pauld(), pr = pauld(); pl.scale.setScalar(0.78); pr.scale.setScalar(0.78);
    out.lsh = { obj: pl, bone: 'Left_UpperArm', off: [0.03, 0.07, 0], rot: [0, 0, -18] };
    out.rsh = { obj: pr, bone: 'Right_UpperArm', off: [-0.03, 0.07, 0], rot: [0, 0, 18] };
    const chest = mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6).rotateX(Math.PI / 2).scale(1.25, 1.0, 0.55), mat('iron', () => std(0x58606c, 0.42, 0.55)));
    const cg = new THREE.Group(); cg.add(chest);
    cg.add(mesh(new THREE.CircleGeometry(0.05, 6).translate(0, 0, 0.14), mat('coreO', () => glow(c.accent, 1.5)), false));
    out.chest = { obj: cg, bone: 'UpperChest', off: [0, -0.02, 0.06] };
    // 오른손 건틀릿
    out.right = { obj: mesh(new THREE.BoxGeometry(0.13, 0.16, 0.13), mat('iron2', () => std(0x737b88, 0.4, 0.6))), grip: [0, 0, 0], off: [0, 0, 0] };
    return out;
  },
  bang(c) {
    const out = {};
    const dagger = () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 6), mat('grip', () => std(0x1a1a24, 0.7))));
      g.add(mesh(new THREE.BoxGeometry(0.14, 0.025, 0.04).translate(0, 0.08, 0), mat('steelD', () => std(0x6a6a80, 0.35, 0.8))));
      g.add(mesh(extrude(bladeShape(0.52, 0.09, 0.05), 0.012, 0.004).translate(0, 0.09, 0), mat('bladeP', () => std(0x9a7aff, 0.25, 0.6, { emissive: 0x5a2aaa, emissiveIntensity: 0.6 }))));
      return g;
    };
    out.right = { obj: dagger(), grip: [-70, 0, 0], off: [0, 0, 0] };
    out.left = { obj: dagger(), grip: [-70, 0, 0], off: [0, 0, 0], bone: 'Left_Hand' };
    // 짧은 망토
    const cape = new THREE.PlaneGeometry(0.5, 0.55, 4, 5);
    cape.translate(0, -0.27, 0);
    const p = cape.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, -Math.pow(Math.max(0, -y), 1.3) * 0.25 - Math.abs(p.getX(i)) * 0.1); p.setX(i, p.getX(i) * (1 + -y * 0.5)); }
    cape.computeVertexNormals();
    const capeM = mesh(cape, mat('capeN', () => std(c.trim, 0.85, 0, { side: THREE.DoubleSide })));
    out.cape = { obj: capeM, bone: 'UpperChest', off: [0, 0.12, -0.15], cape: true };
    // 목도리 (상체 실루엣)
    out.scarf = { obj: mesh(new THREE.TorusGeometry(0.13, 0.05, 6, 14).rotateX(Math.PI / 2).scale(1.1, 1, 1), mat('scarf', () => std(0x5a3aa0, 0.8))), bone: 'Neck', off: [0, 0.0, 0] };
    return out;
  },
  park(c) {
    const out = {};
    const ham = new THREE.Group();
    ham.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.15, 8).translate(0, 0.32, 0), mat('wood', () => std(0x7a5a3a, 0.8))));
    ham.add(mesh(new THREE.BoxGeometry(0.42, 0.24, 0.24).translate(0, 0.95, 0), mat('steelH', () => std(0x6a6a72, 0.42, 0.6))));
    ham.add(mesh(new THREE.BoxGeometry(0.44, 0.05, 0.26).translate(0, 0.86, 0), mat('brass', () => std(0xc09a50, 0.35, 0.8))));
    ham.add(mesh(new THREE.BoxGeometry(0.44, 0.05, 0.26).translate(0, 1.04, 0), mat('brass', () => std(0xc09a50, 0.35, 0.8))));
    // 달아오른 균열
    ham.add(mesh(new THREE.BoxGeometry(0.43, 0.02, 0.18).translate(0, 0.95, 0), mat('heat', () => glow(c.accent, 1.3)), false));
    ham.add(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 8).translate(0, -0.25, 0), mat('steelH', () => std(0x6a6a72, 0.42, 0.6))));
    out.right = { obj: ham, grip: [90, 0, 0], off: [0, 0, 0] };
    // 가죽 앞치마
    const ap = new THREE.PlaneGeometry(0.42, 0.55, 3, 4);
    ap.translate(0, -0.2, 0);
    const pp = ap.attributes.position;
    for (let i = 0; i < pp.count; i++) pp.setZ(i, -Math.abs(pp.getX(i)) * 0.35);
    ap.computeVertexNormals();
    out.apron = { obj: mesh(ap, mat('apron', () => std(0x6a4426, 0.85, 0, { side: THREE.DoubleSide }))), bone: 'Spine', off: [0, 0.05, 0.16] };
    const bracer = () => mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.16, 8).rotateZ(Math.PI / 2), mat('steelH', () => std(0x6a6a72, 0.42, 0.6)));
    out.lb = { obj: bracer(), bone: 'Left_LowerArm', off: [0.08, 0, 0] };
    out.rb = { obj: bracer(), bone: 'Right_LowerArm', off: [-0.08, 0, 0] };
    // 금속 어깨 보호대 (한쪽 비대칭)
    out.lsh = { obj: mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.6, 1), mat('steelH', () => std(0x6a6a72, 0.42, 0.6))), bone: 'Left_UpperArm', off: [0.03, 0.07, 0], rot: [0, 0, -15] };
    out.goggles = { obj: (() => { const g = new THREE.Group(); g.add(mesh(new THREE.TorusGeometry(0.2, 0.02, 5, 20).rotateX(Math.PI / 2).scale(1.05, 1, 1.1), mat('leather', () => std(0x6a4a30, 0.85)))); for (const x of [-0.08, 0.08]) g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10).rotateX(Math.PI / 2).translate(x, 0, 0.2), mat('brass', () => std(0xc09a50, 0.35, 0.8)))); return g; })(), bone: 'Head', off: [0, 0.2, 0] };
    return out;
  },
  jung(c) {
    const out = {};
    const sw = new THREE.Group();
    sw.add(mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.22, 8), mat('gripB', () => std(0x2a4a8a, 0.7))));
    sw.add(mesh(new THREE.BoxGeometry(0.3, 0.04, 0.06).translate(0, 0.13, 0), mat('gold', () => std(0xd7a83a, 0.3, 0.9))));
    sw.add(mesh(new THREE.SphereGeometry(0.04, 8, 6).translate(0, -0.13, 0), mat('gold', () => std(0xd7a83a, 0.3, 0.9))));
    const blade = new THREE.Shape(); blade.moveTo(-0.045, 0); blade.lineTo(-0.04, 0.95); blade.lineTo(0, 1.08); blade.lineTo(0.04, 0.95); blade.lineTo(0.045, 0); blade.lineTo(-0.045, 0);
    sw.add(mesh(extrude(blade, 0.014, 0.004).translate(0, 0.15, 0), mat('steelW', () => std(0xd8e0ea, 0.25, 0.9))));
    out.right = { obj: sw, grip: [90, 0, 0], off: [0, 0, 0] };
    const pauld = (s) => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.65, 1.05), mat('whiteA', () => std(0xf4f1ea, 0.35, 0.3))));
      g.add(mesh(new THREE.TorusGeometry(0.18, 0.016, 5, 16).rotateX(Math.PI / 2).scale(1.2, 1, 1.05), mat('gold', () => std(0xd7a83a, 0.3, 0.9))));
      return g;
    };
    out.lsh = { obj: pauld(), bone: 'Left_UpperArm', off: [0.03, 0.08, 0], rot: [0, 0, -16] };
    out.rsh = { obj: pauld(), bone: 'Right_UpperArm', off: [-0.03, 0.08, 0], rot: [0, 0, 16] };
    // 푸른 장식 천 (앞뒤 휘장)
    const tab = (back) => {
      const g = new THREE.PlaneGeometry(0.18, 0.3, 2, 4); g.translate(0, -0.15, 0);
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, (back ? -1 : 1) * Math.pow(Math.max(0, -p.getY(i)), 1.5) * 0.12);
      g.computeVertexNormals();
      const m = new THREE.Group();
      m.add(mesh(g, mat('blueCloth', () => std(c.accent, 0.85, 0, { side: THREE.DoubleSide }))));
      m.add(mesh(new THREE.PlaneGeometry(0.19, 0.025).translate(0, -0.29, 0.002), mat('gold', () => std(0xd7a83a, 0.3, 0.9))));
      return m;
    };
    out.tabF = { obj: tab(false), bone: 'Hips', off: [0, 0.02, 0.15], cape: true };
    out.tabB = { obj: tab(true), bone: 'UpperChest', off: [0, 0.05, -0.16], cape: true };
    return out;
  },
  cha(c) {
    const out = {};
    // 기계식 장궁: 곡선 림 + 캠 + 발광 시위
    const bow = new THREE.Group();
    const limb = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.62, 0), new THREE.Vector3(0, 0, -0.32), new THREE.Vector3(0, 0.62, 0));
    bow.add(mesh(new THREE.TubeGeometry(limb, 16, 0.025, 6), mat('bowM', () => std(0x55697c, 0.4, 0.55))));
    bow.add(mesh(new THREE.BoxGeometry(0.06, 0.24, 0.07).translate(0, 0, -0.16), mat('steelW', () => std(0xd8e0ea, 0.25, 0.9))));
    for (const y of [-0.62, 0.62]) bow.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12).rotateZ(Math.PI / 2).translate(0, y, 0), mat('brass', () => std(0xc09a50, 0.35, 0.8))));
    bow.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.24, 4), mat('string', () => glow(c.accent, 1.5)), false));
    bow.add(mesh(new THREE.BoxGeometry(0.02, 0.1, 0.04).translate(0, 0.3, -0.24), mat('energy', () => glow(c.accent, 1.2)), false));
    out.left = { obj: bow, bone: 'Left_Hand', grip: [0, 0, 0], off: [0, 0, 0.16], gripOffset: true };
    const quiver = new THREE.Group();
    quiver.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.5, 10), mat('leather', () => std(0x6a4a30, 0.85))));
    for (let i = 0; i < 5; i++) quiver.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 4).translate(-0.03 + (i % 3) * 0.03, 0.33, -0.02 + Math.floor(i / 3) * 0.03), mat('steelW', () => std(0xd8e0ea, 0.25, 0.9))));
    quiver.rotation.z = 0.5;
    out.back = { obj: quiver, bone: 'UpperChest', off: [0, 0.0, -0.17] };
    out.lsh = { obj: mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.55, 1), mat('bowM', () => std(0x55697c, 0.4, 0.55))), bone: 'Left_UpperArm', off: [0.03, 0.06, 0], rot: [0, 0, -15] };
    out.visor = { obj: mesh(new THREE.TorusGeometry(0.21, 0.018, 4, 20, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI).scale(1, 1, 1.1), mat('energy', () => glow(c.accent, 1.0)), false), bone: 'Head', off: [0, 0.14, 0.02] };
    return out;
  },
  sagong(c) {
    const out = {};
    // 별자리 나침반
    const comp = new THREE.Group();
    comp.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 16).rotateX(Math.PI / 2), mat('brass', () => std(0xc09a50, 0.35, 0.8))));
    comp.add(mesh(new THREE.CircleGeometry(0.1, 16).translate(0, 0, 0.017), mat('navyG', () => std(0x1a2050, 0.4, 0, { emissive: 0x1a2a70, emissiveIntensity: 0.5 }))));
    comp.add(mesh(new THREE.ConeGeometry(0.02, 0.16, 4).rotateZ(-0.6).translate(0.02, 0.02, 0.025), mat('starG', () => glow(c.accent, 1.5)), false));
    out.left = { obj: comp, bone: 'Left_Hand', grip: [0, 90, 0], off: [0, 0, 0.08] };
    // 로브 자락 (원뿔) — 실루엣이 아래로 넓어짐
    const robe = mesh(new THREE.CylinderGeometry(0.2, 0.36, 0.5, 14, 1, true).translate(0, -0.25, 0), mat('robe', () => std(c.coat, 0.85, 0, { side: THREE.DoubleSide })));
    out.robe = { obj: robe, bone: 'Hips', off: [0, 0.02, 0] };
    const collar = mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.16, 12, 1, true, -Math.PI * 0.8, Math.PI * 1.6).translate(0, 0.06, 0), mat('collarV', () => std(c.trim, 0.8, 0, { side: THREE.DoubleSide })));
    out.collar = { obj: collar, bone: 'UpperChest', off: [0, 0.14, -0.02] };
    // 부유하는 천체 장치 (뼈가 아니라 캐릭터 공간에 떠 있음)
    const orr = new THREE.Group();
    const r1 = mesh(new THREE.TorusGeometry(0.42, 0.012, 5, 40), mat('brass', () => std(0xc09a50, 0.35, 0.8)), false);
    const r2 = mesh(new THREE.TorusGeometry(0.34, 0.01, 5, 40), mat('brass', () => std(0xc09a50, 0.35, 0.8)), false);
    r2.rotation.x = 1.1;
    orr.add(r1, r2);
    const planets = [];
    for (let i = 0; i < 3; i++) { const pl = mesh(new THREE.SphereGeometry(0.045 + i * 0.012, 10, 8), mat('pl' + i, () => glow([c.accent, 0x9ab0ff, 0xd88aff][i], 0.9)), false); orr.add(pl); planets.push(pl); }
    orr.position.set(0, 1.25, -0.1);
    out.float = { obj: orr, float: true, planets, r1, r2 };
    return out;
  },
  cho(c) {
    const out = {};
    const sp = new THREE.Group();
    sp.add(mesh(new THREE.CylinderGeometry(0.028, 0.032, 1.7, 8).translate(0, 0.35, 0), mat('woodD', () => std(0x5a3e28, 0.8))));
    sp.add(mesh(extrude(bladeShape(0.42, 0.12, 0.09), 0.014, 0.005).translate(0, 1.18, 0), mat('steelG', () => std(0xc8d2c0, 0.3, 0.85))));
    sp.add(mesh(new THREE.ConeGeometry(0.05, 0.1, 6).rotateX(Math.PI).translate(0, 1.18, 0), mat('brass', () => std(0xc09a50, 0.35, 0.8))));
    for (let i = 0; i < 3; i++) sp.add(mesh(new THREE.ConeGeometry(0.018, 0.16, 4).translate(0.04, 1.06 - i * 0.05, 0).rotateY(i * 2), mat('feather', () => std(0x9adf5a, 0.8)), false));
    out.right = { obj: sp, grip: [90, 0, 0], off: [0, 0, 0] };
    // 야수 털 망토 (뾰족한 덩어리)
    const fur = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI - Math.PI / 2;
      const k = mesh(new THREE.ConeGeometry(0.07, 0.24, 5).rotateX(Math.PI / 2 + 0.6).translate(0, 0, -0.08), mat('fur', () => std(0x8a6a4a, 0.95)));
      k.position.set(Math.sin(a) * 0.2, 0, Math.cos(a) * 0.05 - 0.04);
      k.rotation.y = a;
      fur.add(k);
    }
    fur.add(mesh(new THREE.TorusGeometry(0.17, 0.06, 6, 14).rotateX(Math.PI / 2).scale(1.2, 1, 0.9), mat('fur', () => std(0x8a6a4a, 0.95))));
    out.fur = { obj: fur, bone: 'UpperChest', off: [0, 0.14, 0] };
    out.band = { obj: mesh(new THREE.TorusGeometry(0.2, 0.025, 5, 18).rotateX(Math.PI / 2).scale(1.05, 1, 1.1), mat('leafBand', () => std(c.accent, 0.7))), bone: 'Head', off: [0, 0.16, 0] };
    return out;
  },
  kim(c) {
    const out = {};
    // 어깨 마력포
    const can = new THREE.Group();
    can.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.7, 12).rotateX(Math.PI / 2).translate(0, 0, 0.12), mat('canM', () => std(0x5a5068, 0.42, 0.55))));
    for (const z of [-0.1, 0.12, 0.34]) can.add(mesh(new THREE.TorusGeometry(0.11, 0.018, 5, 14).translate(0, 0, z), mat('brass', () => std(0xc09a50, 0.35, 0.8))));
    can.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12).rotateX(Math.PI / 2).translate(0, 0, 0.475), mat('muzzle', () => glow(c.accent, 1.6)), false));
    can.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.18).translate(0, -0.08, -0.12), mat('canM', () => std(0x5a5068, 0.42, 0.55))));
    can.add(mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04).translate(0, -0.18, -0.05), mat('brass', () => std(0xc09a50, 0.35, 0.8))));
    out.cannon = { obj: can, bone: 'UpperChest', off: [-0.22, 0.2, 0.0], muzzle: [0, 0, 0.48] };
    const pack = new THREE.Group();
    pack.add(mesh(new THREE.BoxGeometry(0.3, 0.34, 0.14), mat('canM', () => std(0x5a5068, 0.42, 0.55))));
    pack.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 10).translate(0, 0, -0.08), mat('muzzle', () => glow(c.accent, 1.2)), false));
    out.back = { obj: pack, bone: 'UpperChest', off: [0, 0, -0.19] };
    out.goggles = { obj: (() => { const g = new THREE.Group(); g.add(mesh(new THREE.TorusGeometry(0.2, 0.018, 5, 20).rotateX(Math.PI / 2).scale(1.05, 1, 1.1), mat('leather', () => std(0x6a4a30, 0.85)))); for (const x of [-0.08, 0.08]) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10).rotateX(Math.PI / 2).translate(x, 0, 0.2), mat('lensP', () => glow(0xd06aff, 0.8)), false)); return g; })(), bone: 'Head', off: [0, 0.22, 0] };
    out.rsh = { obj: mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.25, 0.6, 1.1), mat('canM', () => std(0x5a5068, 0.42, 0.55))), bone: 'Right_UpperArm', off: [-0.03, 0.06, 0], rot: [0, 0, 15] };
    return out;
  },
  lee(c) {
    const out = {};
    out.right = { obj: (() => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.45, 6).translate(0, 0.2, 0), mat('baton', () => std(0xf0e6d0, 0.4)))); g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6).translate(0, 0.43, 0), mat('note', () => glow(c.accent, 1.4)), false)); return g; })(), grip: [70, 0, 0], off: [0, 0, 0] };
    // 공명 악기: 하프형 고리 + 현
    const ins = new THREE.Group();
    const frame = new THREE.EllipseCurve(0, 0, 0.26, 0.34, Math.PI * 0.1, Math.PI * 1.9, false, 0);
    const pts = frame.getPoints(28).map((p) => new THREE.Vector3(p.x, p.y, 0));
    ins.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.018, 6), mat('gold', () => std(0xd7a83a, 0.3, 0.9)), false));
    for (let i = 0; i < 5; i++) ins.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5 - Math.abs(i - 2) * 0.08, 4).translate(-0.12 + i * 0.06, 0, 0), mat('strG', () => glow(c.accent, 1.2)), false));
    ins.add(mesh(new THREE.OctahedronGeometry(0.05).translate(0, 0.36, 0), mat('violetG', () => glow(0xc06aff, 1.1)), false));
    ins.position.set(0.5, 1.15, 0.05);
    out.float = { obj: ins, float: true, instrument: true };
    const mantle = mesh(new THREE.CylinderGeometry(0.17, 0.32, 0.3, 14, 1, true, Math.PI * 0.55, Math.PI * 0.9).translate(0, -0.1, 0), mat('mantle', () => std(c.trim, 0.8, 0, { side: THREE.DoubleSide })));
    out.mantle = { obj: mantle, bone: 'UpperChest', off: [0, 0.14, 0], cape: true };
    return out;
  },
};

// 가운 재채색 셰이더 패치 (밝고 채도 낮은 텍셀 = 흰 가운 → 캐릭터 고유색, 명암 보존)
function recolorMaterial(src, coat, trim, upAxis, hMin, hMax) {
  const m = src.clone();
  m.roughness = 0.75; m.metalness = 0;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCoat = { value: new THREE.Color(coat) };
    sh.uniforms.uTrim = { value: new THREE.Color(trim) };
    sh.uniforms.uUp = { value: upAxis };
    sh.uniforms.uHR = { value: new THREE.Vector2(hMin, hMax) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uUp; uniform vec2 uHR; varying float vH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = (dot(position, uUp) - uHR.x) / (uHR.y - uHR.x);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uCoat; uniform vec3 uTrim; varying float vH;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
          float sat = (mx - mn) / max(mx, 1e-3);
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          // 몸통 높이 대역(신발·얼굴 제외)의 흰 천만
          float band = smoothstep(0.1, 0.16, vH) * (1.0 - smoothstep(0.5, 0.56, vH));
          float w = smoothstep(0.18, 0.08, sat) * smoothstep(0.38, 0.6, lum) * band;
          vec3 tint = mix(uCoat, uTrim, smoothstep(0.42, 0.5, vH) * 0.0);
          vec3 shaded = tint * (0.55 + 0.6 * lum);
          diffuseColor.rgb = mix(c, shaded, w);
        }`);
  };
  m.customProgramCacheKey = () => 'recolor' + coat + '_' + trim;
  return patchFow(m);
}

// ---------------- 챔피언 인스턴스 생성 ----------------
export function createChampionVisual(champ) {
  const tpl = templates.get(champ.model);
  const model = SkeletonUtils.clone(tpl);
  const container = new THREE.Group();   // 캐릭터 공간 (정면 +Z, 발 = y0)
  const root = new THREE.Group();        // 월드 배치·회전
  root.add(container);
  container.add(model);
  // 크기 정규화
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const h = box.max.y - box.min.y;
  const s = CHAR_HEIGHT / h;
  model.scale.multiplyScalar(s);
  model.position.y -= box.min.y * s;
  model.position.x -= ((box.min.x + box.max.x) / 2) * s;
  model.position.z -= ((box.min.z + box.max.z) / 2) * s;
  container.scale.set(champ.body[0], champ.body[1], champ.body[2]);
  container.updateMatrixWorld(true);
  // 재채색 + 그림자
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;
      // 바인드 포즈 기준 상향 축과 높이 범위
      const g = o.geometry;
      g.computeBoundingBox();
      const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
      const upL = new THREE.Vector3(0, 1, 0).transformDirection(inv).normalize();
      const bb = g.boundingBox;
      const corners = [];
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) corners.push(new THREE.Vector3(x, y, z).dot(upL));
      o.material = recolorMaterial(o.material, champ.coat, champ.trim, upL, Math.min(...corners), Math.max(...corners));
    }
  });
  // 플레이 카메라에서 상체·무기 실루엣이 먼저 읽히도록 머리 비율 축소 (치비 비율 완화)
  model.traverse((o) => { if (o.isBone && o.name === 'Head') o.scale.setScalar(HEAD_SCALE); });
  model.updateMatrixWorld(true);
  const rig = new HumanoidRig(model, container);
  // 장비 부착
  const kit = KITS[champ.id](champ);
  const cInv = container.getWorldQuaternion(new THREE.Quaternion()).invert();
  const cScale = new THREE.Vector3(); container.getWorldScale(cScale);
  const sockets = {};
  const floats = [];
  const capes = [];
  for (const [key, part] of Object.entries(kit)) {
    if (part.float) { container.add(part.obj); floats.push(part); continue; }
    const boneName = part.bone || (key === 'right' ? 'Right_Hand' : key === 'left' ? 'Left_Hand' : 'UpperChest');
    const bone = rig.bones[boneName];
    if (!bone) continue;
    const sock = new THREE.Group();
    bone.add(sock);
    const bq = bone.getWorldQuaternion(new THREE.Quaternion());
    const Rb = cInv.clone().multiply(bq); // 뼈의 캐릭터공간 휴식 회전
    const bs = new THREE.Vector3(); bone.getWorldScale(bs);
    const user = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.grip || part.rot || [0, 0, 0]).map((d) => (d * Math.PI) / 180), 'YXZ'));
    sock.quaternion.copy(Rb.clone().invert().multiply(user));
    // 위치 오프셋은 캐릭터 공간 → 뼈 로컬
    const off = new THREE.Vector3(...(part.off || [0, 0, 0])).applyQuaternion(Rb.clone().invert());
    sock.position.copy(off).divide(bs).multiply(cScale);
    sock.scale.set(cScale.x / bs.x, cScale.y / bs.y, cScale.z / bs.z).divide(cScale).multiplyScalar(1); // 월드 단위 유지 (몸 비율 무시)
    sock.scale.set(1 / bs.x, 1 / bs.y, 1 / bs.z).multiplyScalar(cScale.x);
    sock.add(part.obj);
    part.obj.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    sockets[key] = sock;
    if (part.cape) capes.push({ obj: part.obj, base: part.obj.rotation.x });
  }
  return { root, container, model, rig, sockets, floats, capes, kit };
}

// 무기 끝(발사 지점) 월드 좌표
export function weaponTip(vis, out) {
  const s = vis.sockets.cannon || vis.sockets.right || vis.sockets.left;
  if (!s) return vis.root.getWorldPosition(out).setY(1.1);
  if (vis.sockets.cannon) return s.localToWorld(out.set(0, 0, 0.48));
  if (vis.kit.left && vis.kit.left.obj && vis.sockets.left && vis.kit.right == null) return vis.sockets.left.localToWorld(out.set(0, 0, 0));
  return s.localToWorld(out.set(0, 0.9, 0));
}
