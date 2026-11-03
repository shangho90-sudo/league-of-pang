// 구조물: 포탑, 핵심 수정(넥서스), 회복 샘, 상점, 깃발 — 독자 디자인
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TEAM_COLORS } from '../map/layout.js';
import { patchFow, sharedUniforms } from './terrain.js';
import { mulberry } from './textures.js';

const rnd = mulberry(99);
function vc(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const cc = fn(p.getX(i), p.getY(i), p.getZ(i)); c.set([cc.r, cc.g, cc.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const C = (h) => new THREE.Color(h);
function worn(base, y, amt = 0.15) {
  // 마모: 아래쪽 더러움 + 무작위 얼룩
  const c = C(base);
  c.multiplyScalar(0.85 + rnd() * amt);
  return c;
}
function lathe(points, seg = 10) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

const stoneMat = () => patchFow(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0 }));
const metalMat = () => patchFow(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.65 }));

function crystalMaterial(team) {
  const tc = TEAM_COLORS[team];
  return patchFow(new THREE.MeshStandardMaterial({
    color: tc.light, emissive: tc.main, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.92,
  }));
}

export function buildTurret(team) {
  const g = new THREE.Group();
  const tc = TEAM_COLORS[team];
  const stone = [];
  // 기단: 팔각 계단
  stone.push(vc(new THREE.CylinderGeometry(1.9, 2.1, 0.45, 8), (x, y) => worn(0x6e7782, y)).translate(0, 0.22, 0));
  stone.push(vc(new THREE.CylinderGeometry(1.55, 1.75, 0.4, 8), (x, y) => worn(0x7f8994, y)).translate(0, 0.62, 0));
  // 기둥 (위로 갈수록 좁아짐, 띠 장식)
  const pillar = lathe([[0.95, 0], [1.0, 0.3], [0.82, 0.45], [0.78, 2.3], [0.92, 2.45], [0.92, 2.7], [0.7, 2.85], [0.0, 2.85]], 8);
  stone.push(vc(pillar, (x, y) => worn(y > 2.3 ? 0x8d97a1 : 0x737d88, y)).translate(0, 0.82, 0));
  // 모서리 지지석
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const b = vc(new THREE.BoxGeometry(0.45, 1.3, 0.45), (x, y) => worn(0x66707b, y));
    b.rotateY(a); b.translate(Math.cos(a) * 1.35, 1.2, Math.sin(a) * 1.35);
    stone.push(b);
  }
  const stoneMesh = new THREE.Mesh(mergeGeometries(stone), stoneMat());
  stoneMesh.castShadow = stoneMesh.receiveShadow = true;
  g.add(stoneMesh);
  // 금속 연결 부품: 고리와 갈퀴 받침
  const metal = [];
  metal.push(vc(new THREE.TorusGeometry(0.86, 0.09, 6, 16), () => C(0x9a7a45)).rotateX(Math.PI / 2).translate(0, 1.6, 0));
  metal.push(vc(new THREE.TorusGeometry(0.98, 0.1, 6, 16), () => C(0x8a6a3a)).rotateX(Math.PI / 2).translate(0, 3.35, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const claw = vc(new THREE.ConeGeometry(0.14, 1.4, 5), () => C(0xa88850));
    claw.rotateZ(-0.5); claw.translate(0.85, 4.1, 0); claw.rotateY(a);
    metal.push(claw);
  }
  const metalMesh = new THREE.Mesh(mergeGeometries(metal), metalMat());
  metalMesh.castShadow = true;
  g.add(metalMesh);
  // 발광 핵심부 (팀 색)
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), crystalMaterial(team));
  core.position.y = 4.35;
  core.scale.set(1, 1.5, 1);
  g.add(core);
  const glow = new THREE.PointLight(tc.main, 2.5, 7, 2);
  glow.position.y = 4.3;
  g.add(glow);
  g.userData = { core, glow, height: 5.2, radius: 1.6 };
  return g;
}

export function buildNexus(team) {
  const g = new THREE.Group();
  const tc = TEAM_COLORS[team];
  const stone = [];
  stone.push(vc(new THREE.CylinderGeometry(4.2, 4.6, 0.6, 12), (x, y) => worn(0x6b7480, y)).translate(0, 0.3, 0));
  stone.push(vc(new THREE.CylinderGeometry(3.4, 3.7, 0.5, 12), (x, y) => worn(0x7b8591, y)).translate(0, 0.85, 0));
  stone.push(vc(new THREE.CylinderGeometry(2.6, 2.9, 0.5, 12), (x, y) => worn(0x8a95a0, y)).translate(0, 1.3, 0));
  // 둘러싼 기둥 6개
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = vc(lathe([[0.4, 0], [0.32, 0.2], [0.28, 2.6], [0.4, 2.8], [0.0, 2.8]], 6), (x, y) => worn(0x75808b, y));
    p.translate(Math.cos(a) * 3.6, 0.6, Math.sin(a) * 3.6);
    stone.push(p);
  }
  const sm = new THREE.Mesh(mergeGeometries(stone), stoneMat());
  sm.castShadow = sm.receiveShadow = true;
  g.add(sm);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 1), crystalMaterial(team));
  crystal.geometry = crystal.geometry.toNonIndexed();
  crystal.geometry.computeVertexNormals();
  crystal.position.y = 4.0;
  crystal.scale.set(1, 1.7, 1);
  g.add(crystal);
  const shards = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), crystalMaterial(team));
    s.userData.a = (i / 5) * Math.PI * 2;
    g.add(s);
    shards.push(s);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.07, 6, 40), metalMat());
  vc(ring.geometry, () => C(0xb39050));
  ring.geometry = vc(new THREE.TorusGeometry(2.3, 0.07, 6, 40), () => C(0xb39050));
  ring.position.y = 4.0; ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const light = new THREE.PointLight(tc.main, 5, 14, 2);
  light.position.y = 4;
  g.add(light);
  g.userData = { crystal, shards, ring, height: 7, radius: 3.2 };
  return g;
}

export function buildFountain(team) {
  const g = new THREE.Group();
  const tc = TEAM_COLORS[team];
  const st = [];
  st.push(vc(new THREE.CylinderGeometry(5.4, 5.6, 0.25, 24), (x, y) => worn(0x7d8893, y)).translate(0, 0.1, 0));
  // 테두리 석재 고리
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const b = vc(new THREE.BoxGeometry(1.6, 0.35, 0.5), (x, y) => worn(0x6b7580, y));
    b.rotateY(-a + Math.PI / 2); b.translate(Math.cos(a) * 5.3, 0.3, Math.sin(a) * 5.3);
    st.push(b);
  }
  st.push(vc(lathe([[1.4, 0], [1.2, 0.4], [0.5, 0.6], [0.45, 1.6], [1.0, 1.8], [1.1, 2.0], [0, 2.0]], 12), (x, y) => worn(0x8893a0, y)));
  const m = new THREE.Mesh(mergeGeometries(st), stoneMat());
  m.receiveShadow = true; m.castShadow = true;
  g.add(m);
  // 회복 구역 바닥 문양
  const disc = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.6, 48), new THREE.MeshBasicMaterial({ color: tc.main, transparent: true, opacity: 0.35, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.26;
  g.add(disc);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), crystalMaterial(team));
  orb.position.y = 2.6;
  g.add(orb);
  g.userData = { orb, disc };
  return g;
}

export function buildShop(team) {
  const g = new THREE.Group();
  const tc = TEAM_COLORS[team];
  const wood = [];
  for (const [x, z] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) wood.push(vc(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 6), () => C(0x6b4a2c)).translate(x, 1.3, z));
  wood.push(vc(new THREE.BoxGeometry(2.8, 0.9, 1.0), (x, y) => C(y > 0.3 ? 0x8a6238 : 0x6b4a2c)).translate(0, 0.45, -0.3));
  // 상품 상자와 약병
  for (let i = 0; i < 5; i++) wood.push(vc(new THREE.BoxGeometry(0.45, 0.45, 0.45), () => C(0x9a7040)).translate(-1.6 + rnd() * 0.3, 0.22 + (i % 2) * 0.45, 0.9 + rnd() * 0.4));
  const wm = new THREE.Mesh(mergeGeometries(wood), stoneMat());
  wm.castShadow = true;
  g.add(wm);
  const awning = new THREE.Mesh(
    vc(new THREE.CylinderGeometry(1.8, 1.8, 3.2, 10, 1, true, 0, Math.PI), (x, y, z) => C(Math.floor((Math.atan2(z, x) + Math.PI) * 3) % 2 ? tc.main : 0xe8dcc0)),
    patchFow(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })),
  );
  awning.rotation.z = Math.PI / 2; awning.position.y = 2.4; awning.scale.set(0.35, 1, 0.75);
  awning.castShadow = true;
  g.add(awning);
  for (let i = 0; i < 3; i++) {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.32, 8), new THREE.MeshStandardMaterial({ color: [0xff6a6a, 0x6ad0ff, 0x9aff7a][i], emissive: [0x601010, 0x103a60, 0x205010][i], roughness: 0.2, transparent: true, opacity: 0.85 }));
    v.position.set(-0.6 + i * 0.6, 1.07, -0.3);
    g.add(v);
  }
  return g;
}

// 천 깃발 (정점 셰이더 흔들림)
export function buildBanner(team) {
  const g = new THREE.Group();
  const tc = TEAM_COLORS[team];
  const pole = new THREE.Mesh(vc(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6), () => C(0x5b4632)), stoneMat());
  pole.position.y = 2.1; pole.castShadow = true;
  g.add(pole);
  const cloth = new THREE.PlaneGeometry(1.1, 2.0, 8, 10);
  cloth.translate(0.58, -1.0, 0);
  const mat = new THREE.MeshStandardMaterial({ color: tc.main, roughness: 0.9, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = sharedUniforms.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float w = transformed.x / 1.1;
        transformed.z += sin(uTime * 2.6 + transformed.x * 3.0 + transformed.y * 1.5) * 0.12 * w;
        transformed.x -= abs(sin(uTime * 1.3 + transformed.y)) * 0.04 * w;`);
  };
  patchFow(mat);
  const cl = new THREE.Mesh(cloth, mat);
  cl.position.y = 4.0; cl.castShadow = true;
  g.add(cl);
  // 문장(독자 문양): 원 + 삼각
  const emb = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshBasicMaterial({ color: 0xf0e2b8 }));
  emb.position.set(0.58, 3.1, 0.01);
  g.add(emb);
  return g;
}
