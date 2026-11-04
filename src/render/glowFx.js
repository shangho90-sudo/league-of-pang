// 화려한 전투 연출 레이어: 섬광 · 지면 충격파 · 빛기둥 · 비산 파편
// Tripo 이펙트 모델(combatEffects.js) 위에 겹쳐, 첨부 참고 이미지처럼 "밝은 중심 + 금빛/고유색 외곽 + 사방으로 튀는 파편" 구성을 만든다.
// 모든 메시는 풀링하며 동시에 살아 있는 개수를 제한한다 (모바일 오버드로 억제).
import * as THREE from 'three';
import { groundHeight } from '../map/grid.js';

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const TEX = {};
function tex() {
  if (TEX.flash) return TEX;
  TEX.flash = canvasTex(128, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,255,0.95)'); g.addColorStop(0.4, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    // 십자 광채
    x.globalCompositeOperation = 'lighter';
    for (const [w, h] of [[s, s * 0.05], [s * 0.05, s]]) { const l = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); l.addColorStop(0, 'rgba(255,255,255,0.9)'); l.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = l; x.fillRect((s - w) / 2, (s - h) / 2, w, h); }
  });
  TEX.ring = canvasTex(256, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, s * 0.28, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.15)'); g.addColorStop(0.82, 'rgba(255,255,255,1)'); g.addColorStop(0.9, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    // 룬 눈금
    x.translate(s / 2, s / 2); x.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 36; i++) { x.rotate(Math.PI * 2 / 36); x.fillRect(s * 0.355, -1.5, i % 3 ? 6 : 14, 3); }
  });
  TEX.beam = canvasTex(64, (x, s) => {
    const v = x.createLinearGradient(0, s, 0, 0); v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(0.35, 'rgba(255,255,255,0.65)'); v.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = v; x.fillRect(0, 0, s, s);
    x.globalCompositeOperation = 'destination-in';
    const h = x.createLinearGradient(0, 0, s, 0); h.addColorStop(0, 'rgba(0,0,0,0.35)'); h.addColorStop(0.5, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0.35)');
    x.fillStyle = h; x.fillRect(0, 0, s, s);
  });
  TEX.beam.wrapS = THREE.RepeatWrapping;
  return TEX;
}
const vivid = (c) => { const col = new THREE.Color(c), h = {}; col.getHSL(h); col.setHSL(h.h, Math.min(1, h.s * 1.5 + 0.25), Math.min(0.66, Math.max(0.52, h.l))); return col; };

export class GlowFX {
  constructor(scene, quality) {
    this.scene = scene; this.items = []; this.pools = { flash: [], ring: [], pillar: [], shard: [] };
    this.max = quality && quality.particles < 0.8 ? 40 : 90;
    this.shardMax = quality && quality.particles < 0.8 ? 30 : 70;
    this.shardCount = 0;
    const T = tex();
    this.geo = { plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), cyl: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0), shard: new THREE.OctahedronGeometry(0.5, 0).scale(0.22, 1, 0.22) };
    this.T = T;
  }
  take(kind, color) {
    const T = this.T, pool = this.pools[kind];
    let o = pool.pop();
    if (!o) {
      const base = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };
      if (kind === 'flash') o = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.flash, ...base }));
      else if (kind === 'ring') o = new THREE.Mesh(this.geo.plane, new THREE.MeshBasicMaterial({ map: T.ring, ...base, side: THREE.DoubleSide }));
      else if (kind === 'pillar') o = new THREE.Mesh(this.geo.cyl, new THREE.MeshBasicMaterial({ map: T.beam, ...base, side: THREE.DoubleSide }));
      else o = new THREE.Mesh(this.geo.shard, new THREE.MeshBasicMaterial({ ...base }));
      o.renderOrder = 4; o.frustumCulled = false;
    }
    o.material.color.copy(color); o.material.opacity = 0; o.visible = true; o.rotation.set(0, 0, 0);
    this.scene.add(o);
    return o;
  }
  add(kind, color, life, upd, delay = 0) {
    if (this.items.length >= this.max) return;
    if (kind === 'shard') { if (this.shardCount >= this.shardMax) return; this.shardCount++; }
    const o = this.take(kind, color);
    o.visible = delay <= 0;
    this.items.push({ kind, o, t: -delay, life, upd });
  }
  // ---- 구성 요소 ----
  flash(x, y, z, color, size = 1.6, life = 0.28, delay = 0) {
    const c = vivid(color);
    this.add('flash', c, life, (o, k) => { o.position.set(x, y, z); o.scale.setScalar(size * (0.4 + 0.9 * Math.sqrt(k))); o.material.opacity = (1 - k) * (k < 0.15 ? k / 0.15 : 1); }, delay);
    this.add('flash', new THREE.Color(0xffffff), life * 0.6, (o, k) => { o.position.set(x, y, z); o.scale.setScalar(size * 0.35 * (0.6 + 0.6 * k)); o.material.opacity = (1 - k) * 0.8; }, delay);
  }
  shock(x, z, color, r = 2, life = 0.45, delay = 0, y) {
    const c = vivid(color), gy = (y ?? groundHeight(x, z)) + 0.14, spin = Math.random() * 6;
    this.add('ring', c, life, (o, k) => { const e = 1 - Math.pow(1 - k, 3); o.position.set(x, gy, z); o.scale.setScalar(r * 2 * (0.25 + 0.85 * e)); o.rotation.y = spin + k * 0.8; o.material.opacity = Math.pow(1 - k, 1.3); }, delay);
  }
  pillar(x, z, color, h = 5, r = 0.8, life = 0.7, delay = 0) {
    const c = vivid(color), gy = groundHeight(x, z);
    this.add('pillar', c, life, (o, k) => { const up = Math.min(1, k / 0.18); o.position.set(x, gy, z); o.scale.set(r * (1 - 0.5 * k), h * (0.3 + 0.7 * up), r * (1 - 0.5 * k)); o.rotation.y = k * 3; o.material.opacity = (k < 0.18 ? up : Math.pow(1 - (k - 0.18) / 0.82, 1.2)) * 0.62; }, delay);
    this.add('pillar', new THREE.Color(0xffffff), life * 0.7, (o, k) => { o.position.set(x, gy, z); o.scale.set(r * 0.22, h * 1.05 * Math.min(1, k / 0.15), r * 0.22); o.material.opacity = (1 - k) * 0.45; }, delay);
  }
  shards(x, y, z, color, n = 10, speed = 6, life = 0.7, up = 0.6, delay = 0) {
    const c = vivid(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, el = up * (0.3 + Math.random() * 0.7), sp = speed * (0.6 + Math.random() * 0.6);
      const vx = Math.cos(a) * sp, vz = Math.sin(a) * sp, vy = sp * el * 1.4, rx = Math.random() * 6, rz = Math.random() * 6, sz = 0.35 + Math.random() * 0.45;
      this.add('shard', i % 3 ? c : new THREE.Color(0xffffff), life * (0.7 + Math.random() * 0.5), (o, k, t) => {
        o.position.set(x + vx * t, y + vy * t - 7 * t * t, z + vz * t); o.rotation.set(rx + t * 9, 0, rz + t * 7); o.scale.setScalar(sz * (1 - k * 0.6)); o.material.opacity = 1 - k * k;
      }, delay);
    }
  }
  // ---- 조합 ----
  impact(x, z, color, power = 1, y) {
    const gy = groundHeight(x, z);
    this.flash(x, (y ?? gy + 0.9), z, color, 1.4 + power * 1.2, 0.22 + power * 0.08);
    this.shock(x, z, color, 0.9 + power * 1.3, 0.35 + power * 0.12);
    if (power >= 0.6) this.shards(x, (y ?? gy + 0.8), z, color, Math.round(5 + power * 8), 4 + power * 3, 0.55, 0.7);
    if (power >= 1.5) this.pillar(x, z, color, 3 + power * 1.5, 0.45 + power * 0.25, 0.55 + power * 0.1);
  }
  castFlare(u, slot) {
    const x = u.x, z = u.z, gy = groundHeight(x, z), c = u.def.accent, ult = slot === 'R';
    if (!ult) { this.flash(x, gy + 1.1, z, c, 1.6, 0.25); this.shock(x, z, c, 1.6, 0.4); this.shards(x, gy + 1.0, z, c, 6, 3.5, 0.5, 0.9); return; }
    // 궁극기: 승천 — 빛기둥 + 이중 룬 고리 + 위로 흩날리는 금빛 파편 (참고 이미지 2번째 장면)
    this.pillar(x, z, c, 7, 1.0, 0.95);
    this.pillar(x, z, 0xffd27a, 5.5, 0.6, 0.8, 0.05);
    this.flash(x, gy + 2.2, z, c, 2.6, 0.4);
    this.shock(x, z, c, 3.2, 0.7); this.shock(x, z, 0xffd27a, 2.2, 0.6, 0.12);
    this.shards(x, gy + 0.6, z, 0xffd27a, 14, 3.2, 1.0, 1.6);
    this.shards(x, gy + 1.2, z, c, 8, 5, 0.8, 0.8, 0.1);
  }
  muzzle(x, y, z, color) { this.flash(x, y, z, color, 1.1, 0.14); }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.t += dt;
      if (it.t < 0) continue;
      it.o.visible = true;
      const k = Math.min(1, it.t / it.life);
      it.upd(it.o, k, it.t);
      if (k >= 1) { this.scene.remove(it.o); it.o.visible = false; this.pools[it.kind].push(it.o); if (it.kind === 'shard') this.shardCount--; this.items.splice(i, 1); }
    }
  }
  dispose() { for (const it of this.items) this.scene.remove(it.o); this.items = []; }
}
