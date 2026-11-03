// 렌더러·조명·카메라
import * as THREE from 'three';
import { MAP_HALF, PLAY_HALF } from '../map/layout.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const QUALITY = {
  low: { name: '낮음', shadow: 0, foliage: 0.45, pixelRatio: 1.0, particles: 0.5, aa: false },
  medium: { name: '중간', shadow: 1024, foliage: 0.7, pixelRatio: 1.25, particles: 0.8, aa: true },
  high: { name: '높음', shadow: 2048, foliage: 1.0, pixelRatio: 2.0, particles: 1.0, aa: true },
};

export function createRenderer(canvas, q) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.aa, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = q.shadow > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

export function createScene(q) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c2a2a);
  scene.fog = new THREE.Fog(0x5f7a80, 34, 80);
  const hemi = new THREE.HemisphereLight(0xc4d8ff, 0x34402a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffeccc, 2.35);
  sun.position.set(-14, 26, 10);
  sun.castShadow = q.shadow > 0;
  if (q.shadow) {
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    const s = sun.shadow.camera;
    s.left = -26; s.right = 26; s.top = 26; s.bottom = -26; s.near = 1; s.far = 80;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
  }
  scene.add(sun);
  scene.add(sun.target);
  return { scene, sun, hemi };
}

// 금속 재질용 환경광 (절차적 룸 환경 — 외부 HDR 없음)
export function applyEnvironment(renderer, scene) {
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.32;
  pm.dispose();
}

// 쿼터뷰 카메라: 약한 원근(시야각 30°), 내려다보는 각도 56°
export class QuarterCamera {
  constructor(aspect) {
    this.fov = 30;
    this.pitch = 53 * (Math.PI / 180);
    this.yaw = 0;            // 블루 기준 (레드는 동일 — 공정성 위해 회전하지 않음)
    this.dist = 26;
    this.minDist = 21; this.maxDist = 30;
    this.cam = new THREE.PerspectiveCamera(this.fov, aspect, 1, 200);
    this.target = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.locked = true;       // 내 캐릭터 고정 추적
    this.shake = 0;
    this.shakeScale = 1;
    this.aimOffset = new THREE.Vector3(); // 모바일 조준 보정
    this.followOffset = new THREE.Vector3();
  }
  setAspect(a) {
    // 공정한 시야: 수평 시야를 16:9 기준으로 제한 (초광폭 화면에서 더 넓게 보지 못함)
    this.cam.aspect = a;
    const maxAspect = 16 / 9 * 1.12, minAspect = 4 / 3;
    let vfov = this.fov;
    if (a > maxAspect) {
      // 화면이 더 넓으면 수직 시야를 줄여 수평 시야를 고정
      const hfov = 2 * Math.atan(Math.tan((this.fov * Math.PI) / 360) * maxAspect);
      vfov = (2 * Math.atan(Math.tan(hfov / 2) / a) * 180) / Math.PI;
    } else if (a < minAspect) {
      const hfov = 2 * Math.atan(Math.tan((this.fov * Math.PI) / 360) * minAspect);
      vfov = (2 * Math.atan(Math.tan(hfov / 2) / a) * 180) / Math.PI;
      vfov = Math.min(vfov, this.fov * 1.25);
    }
    this.cam.fov = vfov;
    this.cam.updateProjectionMatrix();
  }
  zoom(delta) { this.dist = THREE.MathUtils.clamp(this.dist + delta, this.minDist, this.maxDist); }
  pan(dx, dz) { this.locked = false; this.goal.x += dx; this.goal.z += dz; this.clamp(); }
  clamp() { const L = PLAY_HALF + 2; this.goal.x = THREE.MathUtils.clamp(this.goal.x, -L, L); this.goal.z = THREE.MathUtils.clamp(this.goal.z, -L, L); }
  update(dt, followPos) {
    if (this.locked && followPos) this.goal.set(followPos.x, 0, followPos.z).add(this.followOffset);
    this.clamp();
    const g = this.goal.clone().add(this.aimOffset);
    // 빠르지만 부드러운 추적 (지연 최소)
    const k = 1 - Math.exp(-dt * (this.locked ? 14 : 18));
    this.target.lerp(g, k);
    const off = new THREE.Vector3(0, Math.sin(this.pitch) * this.dist, Math.cos(this.pitch) * this.dist);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.cam.position.copy(this.target).add(off);
    if (this.shake > 0) {
      const a = this.shake * 0.12 * this.shakeScale;
      this.cam.position.x += (Math.random() - 0.5) * a;
      this.cam.position.y += (Math.random() - 0.5) * a;
      this.shake = Math.max(0, this.shake - dt * 4);
    }
    // 카메라는 지면보다 약간 위(캐릭터 가슴 높이)를 응시해 화면 중심에 캐릭터가 오게
    this.cam.lookAt(this.target.x, 0.6, this.target.z);
  }
  addShake(v) { this.shake = Math.min(1.2, this.shake + v); }
}

export function updateSunFollow(sun, target) {
  sun.position.set(target.x - 14, 26, target.z + 10);
  sun.target.position.set(target.x, 0, target.z);
  sun.target.updateMatrixWorld();
}
