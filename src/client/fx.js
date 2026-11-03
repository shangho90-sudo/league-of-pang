// 이펙트: 풀링된 파티클(아틀라스 1장, 블렌드별 1 드로우콜), 메시 이펙트, 투사체 외형, 지형 밀착 텔레그래프
import * as THREE from 'three';
import { MAP_HALF } from '../map/layout.js';
import { N, height } from '../map/grid.js';
import { sharedUniforms } from '../render/terrain.js';

const ATLAS_KEYS = ['soft', 'spark', 'star', 'shard', 'drop', 'ring', 'smoke', 'note'];
function buildAtlas(tex) {
  const S = 64, cv = document.createElement('canvas');
  cv.width = S * 4; cv.height = S * 2;
  const ctx = cv.getContext('2d');
  ATLAS_KEYS.forEach((k, i) => { const img = tex[k].image; ctx.drawImage(img, (i % 4) * S, Math.floor(i / 4) * S, S, S); });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class ParticleSystem {
  constructor(atlas, max, additive) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); // size, rot, uvIndex, stretch
    for (const a of [this.aPos, this.aCol, this.aMisc]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iMisc', this.aMisc);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { tAtlas: { value: atlas } },
      vertexShader: `
        attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iMisc;
        varying vec2 vUv; varying vec4 vCol;
        void main() {
          float idx = iMisc.z;
          vec2 cell = vec2(mod(idx, 4.0), floor(idx / 4.0));
          vUv = (position.xy + 0.5 + cell) / vec2(4.0, 2.0);
          vUv.y = 1.0 - ((1.0 - (position.y + 0.5)) + cell.y) / 2.0;
          vCol = iCol;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float c = cos(iMisc.y), s = sin(iMisc.y);
          vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iMisc.x;
          p.y *= iMisc.w;
          vec3 wp = iPos + right * p.x + up * p.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D tAtlas; varying vec2 vUv; varying vec4 vCol;
        void main() { vec4 t = texture2D(tAtlas, vUv); gl_FragColor = vec4(vCol.rgb * t.rgb, t.a * vCol.a); if (gl_FragColor.a < 0.01) discard;
#include <colorspace_fragment>
}`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.p = [];
  }
  emit(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push(o);
  }
  update(dt) {
    const out = [];
    for (const p of this.p) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy -= (p.g || 0) * dt;
      const dr = Math.pow(1 - (p.drag || 0), dt * 60);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor != null && p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      p.rot += (p.spin || 0) * dt;
      out.push(p);
    }
    this.p = out;
    const n = out.length;
    for (let i = 0; i < n; i++) {
      const p = out[i];
      const k = p.age / p.life;
      const fade = p.fadeIn ? Math.min(1, k / p.fadeIn) * (1 - k) : 1 - k * k;
      const size = p.size * (p.grow != null ? 1 + (p.grow - 1) * k : 1);
      this.aPos.setXYZ(i, p.x, p.y, p.z);
      this.aCol.setXYZW(i, p.r, p.gc, p.b, p.a * fade);
      this.aMisc.setXYZW(i, size, p.rot, p.uv, p.stretch || 1);
    }
    this.mesh.geometry.instanceCount = n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aMisc.needsUpdate = true;
  }
}

// ---------- 텔레그래프 셰이더 ----------
const TELE_VERT = `
  uniform sampler2D uH; uniform float uMapHalf;
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vec2 uv = (w.xz + uMapHalf) / (uMapHalf * 2.0);
    float h = texture2D(uH, uv).r;
    w.y = max(h, -0.3) + 0.07;
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const TELE_FRAG = `
  uniform int uKind; uniform vec4 uP; uniform vec4 uP2; uniform vec3 uColor; uniform float uFill; uniform float uAlpha;
  uniform float uTime; uniform int uStyle;
  varying vec3 vW;
  void main() {
    vec2 p = vW.xz - uP.xy;
    float d; float inner = -1.0;
    if (uKind == 0) { d = length(p) - uP.z; }
    else if (uKind == 1) { float l = length(p); d = max(l - uP.z, uP.w - l); }
    else if (uKind == 2) {
      vec2 dir = uP2.xy; float along = dot(p, dir); float side = dot(p, vec2(-dir.y, dir.x));
      d = max(max(-along, along - uP.z), abs(side) - uP.w * 0.5);
    } else {
      vec2 dir = uP2.xy; float l = length(p);
      float a = acos(clamp(dot(p / max(l, 1e-4), dir), -1.0, 1.0));
      float half_ = uP.w;
      d = max(l - uP.z, (a - half_) * max(l, 0.5));
    }
    if (d > 0.06) discard;
    float border = smoothstep(-0.16, -0.05, d) * (1.0 - smoothstep(0.0, 0.06, d));
    // 진행도: 바깥에서 안쪽으로 차오름 (원/고리) 또는 길이 방향
    float prog;
    if (uKind == 2) { prog = step(dot(p, uP2.xy), uP.z * uFill); }
    else if (uKind == 3) { prog = step(length(p), uP.z * uFill); }
    else { prog = step(length(p), uP.z * uFill); }
    float pat = 0.0;
    if (uStyle == 0 || uStyle == 2) { pat = step(0.5, fract((vW.x + vW.z) * 1.4 - uTime * 0.8)); } // 위험: 사선 줄무늬
    if (uStyle == 2) pat = step(0.35, fract((vW.x + vW.z) * 2.2 - uTime * 1.5));                     // 제어: 촘촘한 줄무늬
    if (uStyle == 1) { vec2 g = fract(vW.xz * 1.6) - 0.5; pat = 1.0 - smoothstep(0.08, 0.14, length(g)); } // 아군/지속: 점 패턴
    float fill = (uStyle == 3 ? 0.05 : 0.13) + pat * (uStyle == 1 ? 0.12 : 0.1) + prog * 0.16;
    float a = (border * 0.95 + fill * (1.0 - border)) * uAlpha;
    // 제어 효과: 안쪽 점선 고리
    if (uStyle == 2) { float ring2 = abs(d + 0.35) < 0.05 ? step(0.5, fract(atan(p.y, p.x) * 6.0)) : 0.0; a = max(a, ring2 * 0.8 * uAlpha); }
    gl_FragColor = vec4(uColor * (0.85 + border * 0.4), a);
    #include <colorspace_fragment>
  }`;

const STYLE_ID = { danger: 0, line: 0, zone: 1, allyZone: 1, cc: 2, dangerSoft: 3 };

export class FX {
  constructor(scene, textures, quality, playerTeam) {
    this.scene = scene; this.q = quality; this.playerTeam = playerTeam;
    this.atlas = buildAtlas(textures);
    this.add = new ParticleSystem(this.atlas, Math.round(2600 * quality.particles), true);
    this.norm = new ParticleSystem(this.atlas, Math.round(1400 * quality.particles), false);
    scene.add(this.add.mesh, this.norm.mesh);
    this.meshFx = [];
    this.projViews = new Map();
    this.teleViews = new Map();
    this.zoneViews = new Map();
    this.time = 0;
    // 높이 텍스처
    const M = N + 1;
    const hData = new Float32Array(M * M); hData.set(height);
    this.hTex = new THREE.DataTexture(hData, M, M, THREE.RedFormat, THREE.FloatType);
    this.hTex.magFilter = this.hTex.minFilter = THREE.LinearFilter; this.hTex.needsUpdate = true;
    this.teleGeo = new THREE.PlaneGeometry(1, 1, 24, 24).rotateX(-Math.PI / 2);
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48, 1).rotateX(-Math.PI / 2);
    this.discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    this.projGeo = { sphere: new THREE.SphereGeometry(1, 12, 8), cone: new THREE.ConeGeometry(0.5, 1, 6).rotateX(Math.PI / 2), box: new THREE.BoxGeometry(1, 1, 1) };
    this.pool = { ring: [], arc: [] };
    this.pmMat = {};
  }
  _ptc(sys, o) {
    const c = new THREE.Color(o.color ?? 0xffffff);
    sys.emit({ x: o.x, y: o.y ?? 1, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, g: o.g || 0, drag: o.drag || 0, age: 0, life: o.life || 0.6, size: o.size || 0.4, grow: o.grow, r: c.r, gc: c.g, b: c.b, a: o.a ?? 1, rot: o.rot ?? Math.random() * 6.28, spin: o.spin || 0, uv: ATLAS_KEYS.indexOf(o.tex || 'soft'), stretch: o.stretch, fadeIn: o.fadeIn, floor: o.floor });
  }
  particle(o) { this._ptc(o.additive === false ? this.norm : this.add, o); }
  burst(x, y, z, n, o) {
    n = Math.max(1, Math.round(n * this.q.particles));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, el = (o.elev ?? 0.6) * (Math.random() * 0.8 + 0.2);
      const sp = (o.speed ?? 3) * (0.4 + Math.random() * 0.8);
      this.particle({ ...o, x: x + (Math.random() - 0.5) * (o.jitter || 0), y, z: z + (Math.random() - 0.5) * (o.jitter || 0), vx: Math.cos(a) * sp * (1 - el), vy: sp * el + (o.vy || 0), vz: Math.sin(a) * sp * (1 - el), life: (o.life || 0.6) * (0.7 + Math.random() * 0.6), size: (o.size || 0.3) * (0.7 + Math.random() * 0.6) });
    }
  }
  // 확장 고리 충격파
  ring(x, z, r0, r1, color, life = 0.45, opts = {}) {
    let m = this.pool.ring.pop();
    if (!m) { m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.renderOrder = 4; }
    m.material.color.set(color); m.material.opacity = opts.alpha ?? 0.9;
    m.position.set(x, (opts.y ?? 0.12), z); m.scale.setScalar(r0); m.visible = true;
    this.scene.add(m);
    this.meshFx.push({ m, t: 0, life, upd: (k) => { const r = r0 + (r1 - r0) * (1 - Math.pow(1 - k, 2.2)); m.scale.set(r, 1, r); m.material.opacity = (opts.alpha ?? 0.9) * (1 - k); }, pool: 'ring' });
  }
  // 무기 궤적 호 (검/창/망치)
  arc(x, y, z, dir, r, angle, color, life = 0.22, width = 0.35) {
    const a0 = Math.atan2(dir.x, dir.z);
    const half = (angle * Math.PI) / 360;
    const g = new THREE.RingGeometry(r - width, r, 24, 1, -half, half * 2);
    // UV.x 기반 페이드를 위해 정점 색 사용
    const pos = g.attributes.position, col = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) { const ang = Math.atan2(pos.getY(i), pos.getX(i)); const k = (ang + half) / (half * 2); col.set([1, 1, 1, Math.pow(k, 1.5)], i * 4); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.y = a0 - Math.PI / 2;
    m.position.set(x, y, z);
    m.renderOrder = 6;
    this.scene.add(m);
    this.meshFx.push({ m, t: 0, life, upd: (k) => { m.material.opacity = 1 - k; m.rotation.y = a0 - Math.PI / 2 + (k - 0.5) * 0.4; }, dispose: true });
  }
  column(x, z, color, life = 0.8, h = 3, r = 0.6) {
    const g = new THREE.CylinderGeometry(r, r * 1.2, h, 16, 1, true).translate(0, h / 2, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(x, 0, z);
    this.scene.add(m);
    this.meshFx.push({ m, t: 0, life, upd: (k) => { m.material.opacity = 0.5 * Math.sin(Math.PI * Math.min(1, k * 1.2)); m.scale.set(1 - k * 0.5, 1 + k * 0.3, 1 - k * 0.5); }, dispose: true });
  }
  object(obj, life, upd) {
    this.scene.add(obj);
    this.meshFx.push({ m: obj, t: 0, life, upd: (k, dt) => upd(obj, k, dt), dispose: true });
  }

  // ---------- 투사체 외형 ----------
  projMat(color, additive = true) {
    const k = color + (additive ? 'a' : 'n');
    return this.pmMat[k] || (this.pmMat[k] = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }));
  }
  makeProjView(p) {
    const g = new THREE.Group();
    const add = (geo, color, s, pos, add2 = true) => { const m = new THREE.Mesh(geo, this.projMat(color, add2)); m.scale.copy(s); if (pos) m.position.copy(pos); g.add(m); return m; };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    let trail = null, size = 0.2;
    switch (p.vis) {
      case 'arrow': case 'pierceArrow': case 'stormArrow':
        add(this.projGeo.box, 0xeaf6ff, V(0.05, 0.05, p.vis === 'pierceArrow' ? 1.3 : 0.8), null, false);
        add(this.projGeo.cone, 0x9ae8ff, V(0.14, 0.14, 0.3), V(0, 0, p.vis === 'pierceArrow' ? 0.7 : 0.45));
        trail = { color: 0x9ae8ff, tex: 'soft', size: p.vis === 'pierceArrow' ? 0.35 : 0.22, rate: 40 }; break;
      case 'alch': add(this.projGeo.sphere, 0x7af0e0, V(0.14, 0.14, 0.14)); add(this.projGeo.sphere, 0xffffff, V(0.07, 0.07, 0.07), null, false); trail = { color: 0x5ae0c8, tex: 'drop', size: 0.18, rate: 30 }; break;
      case 'star': add(this.projGeo.sphere, 0xf2c94a, V(0.12, 0.12, 0.12)); trail = { color: 0xf2d97a, tex: 'star', size: 0.25, rate: 30 }; break;
      case 'shell': add(this.projGeo.sphere, 0xd06aff, V(0.16, 0.16, 0.16)); trail = { color: 0xb05aff, tex: 'soft', size: 0.3, rate: 35 }; break;
      case 'wave': add(this.projGeo.sphere, 0xffa6e0, V(0.12, 0.12, 0.12)); trail = { color: 0x7af0e0, tex: 'note', size: 0.3, rate: 22 }; break;
      case 'turret': add(this.projGeo.sphere, p.src.team === 0 ? 0x7ab8ff : 0xff7a6a, V(0.28, 0.28, 0.28)); add(this.projGeo.sphere, 0xffffff, V(0.13, 0.13, 0.13), null, false); trail = { color: p.src.team === 0 ? 0x5a9aff : 0xff5a4a, tex: 'soft', size: 0.5, rate: 40 }; break;
      case 'minion': add(this.projGeo.sphere, p.src.team === 0 ? 0x8ac8ff : 0xffa08a, V(0.1, 0.1, 0.1)); trail = { color: p.src.team === 0 ? 0x6ab0ff : 0xff806a, tex: 'soft', size: 0.16, rate: 20 }; break;
      case 'siege': add(this.projGeo.sphere, 0x3a3a40, V(0.18, 0.18, 0.18), null, false); trail = { color: 0x888888, tex: 'smoke', size: 0.3, rate: 15, normal: true }; break;
      case 'vial': {
        const v = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0xbff8f0, transparent: true, opacity: 0.7, roughness: 0.1 }));
        g.add(v); add(this.projGeo.sphere, 0x6af0d8, V(0.07, 0.07, 0.07)); trail = { color: 0x6af0d8, tex: 'drop', size: 0.16, rate: 25 }; g.userData.spin = true; break;
      }
      case 'shadowBlade': add(this.projGeo.box, 0xb06aff, V(0.6, 0.03, 0.12)); add(this.projGeo.box, 0x6a3aaa, V(0.12, 0.03, 0.6)); trail = { color: 0x8a4adf, tex: 'shard', size: 0.3, rate: 30 }; g.userData.spinY = 18; break;
      case 'dawnWave': {
        const cr = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 20, 1, -Math.PI / 2.5, Math.PI / 1.25).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), this.projMat(0xffe08a));
        cr.scale.set(1.6, 1, 1.6); g.add(cr); trail = { color: 0xffd86a, tex: 'spark', size: 0.3, rate: 30 }; break;
      }
      case 'starShard': add(this.projGeo.sphere, 0xffe9a0, V(0.16, 0.16, 0.16)); trail = { color: 0xf2c94a, tex: 'star', size: 0.35, rate: 45 }; break;
      case 'soundWave': {
        for (let i = 0; i < 3; i++) { const cr = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 24, 1, -Math.PI / 3, Math.PI / 1.5).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), this.projMat(i === 1 ? 0xffa6e0 : 0x7af0e0)); cr.position.z = -i * 0.25; cr.scale.setScalar(1.2 + i * 0.1); g.add(cr); }
        trail = { color: 0x7af0e0, tex: 'note', size: 0.25, rate: 12 }; break;
      }
      case 'frost': add(this.projGeo.sphere, 0xbff4ff, V(0.12, 0.12, 0.12)); add(this.projGeo.sphere, 0xffffff, V(0.06, 0.06, 0.06), null, false); trail = { color: 0x8fe0ff, tex: 'shard', size: 0.18, rate: 26 }; break;
      case 'frostBolt': {
        add(this.projGeo.cone, 0xdff8ff, V(0.16, 0.16, 0.55), V(0, 0, 0.1));
        add(this.projGeo.sphere, 0x7fd8ff, V(0.2, 0.2, 0.2));
        trail = { color: 0x9fe8ff, tex: 'shard', size: 0.3, rate: 40 }; g.userData.spinZ = 8; break;
      }
      case 'ember': add(this.projGeo.sphere, 0xffb23a, V(0.13, 0.13, 0.13)); add(this.projGeo.sphere, 0xfff2c0, V(0.06, 0.06, 0.06), null, false); trail = { color: 0xff7a2a, tex: 'spark', size: 0.2, rate: 30 }; break;
      case 'fireball': add(this.projGeo.sphere, 0xff6a1a, V(0.3, 0.3, 0.3)); add(this.projGeo.sphere, 0xffe08a, V(0.17, 0.17, 0.17), null, false); trail = { color: 0xff8a2a, tex: 'soft', size: 0.55, rate: 50 }; break;
      case 'arcaneShell': add(this.projGeo.sphere, 0xe0a0ff, V(0.22, 0.22, 0.22)); add(this.projGeo.sphere, 0xffffff, V(0.1, 0.1, 0.1), null, false); trail = { color: 0xb05aff, tex: 'soft', size: 0.45, rate: 45 }; break;
      default: add(this.projGeo.sphere, 0xffffff, V(0.12, 0.12, 0.12)); trail = { color: 0xffffff, tex: 'soft', size: 0.2, rate: 20 };
    }
    g.userData.trail = trail; g.userData.acc = 0;
    this.scene.add(g);
    return g;
  }
  syncProjectiles(sim, dt, isVisibleAt, tipOf) {
    const seen = new Set();
    for (const p of sim.projectiles) {
      seen.add(p.id);
      let v = this.projViews.get(p.id);
      if (!v) {
        v = this.makeProjView(p);
        // 발사 지점 보정: 실제 무기 끝에서 출발해 판정 궤도로 수렴
        const tip = tipOf(p.src);
        v.userData.off = tip ? new THREE.Vector3(tip.x - p.x, tip.y - (p.y ?? 1.1), tip.z - p.z) : new THREE.Vector3();
        v.userData.age = 0;
        this.projViews.set(p.id, v);
      }
      v.userData.age += dt;
      const k = Math.max(0, 1 - v.userData.age / 0.14);
      const off = v.userData.off;
      const y = (p.y ?? 1.1);
      const nx = p.x + off.x * k, ny = y + off.y * k, nz = p.z + off.z * k;
      const prev = v.position.clone();
      v.position.set(nx, ny, nz);
      const mv = v.position.clone().sub(prev);
      if (mv.lengthSq() > 1e-6) v.lookAt(v.position.clone().add(mv));
      if (v.userData.spin) v.rotation.x += dt * 14;
      if (v.userData.spinY) v.rotateY(dt * v.userData.spinY);
      if (v.userData.spinZ) v.rotateZ(dt * v.userData.spinZ);
      const vis = isVisibleAt(p.x, p.z) || p.src.team === this.playerTeam;
      v.visible = vis;
      const tr = v.userData.trail;
      if (tr && vis) {
        v.userData.acc += dt * tr.rate * this.q.particles;
        while (v.userData.acc > 1) {
          v.userData.acc -= 1;
          this.particle({ x: nx + (Math.random() - 0.5) * 0.1, y: ny + (Math.random() - 0.5) * 0.1, z: nz + (Math.random() - 0.5) * 0.1, color: tr.color, tex: tr.tex, size: tr.size, life: 0.35, additive: !tr.normal, a: 0.85, vy: tr.tex === 'drop' ? -1 : 0.2, g: tr.tex === 'drop' ? 6 : 0 });
        }
      }
    }
    for (const [id, v] of this.projViews) if (!seen.has(id)) { this.scene.remove(v); this.projViews.delete(id); }
  }

  // ---------- 텔레그래프 ----------
  makeTele(tg) {
    const s = tg.shape;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uH: { value: this.hTex }, uMapHalf: { value: MAP_HALF }, uKind: { value: 0 }, uP: { value: new THREE.Vector4() }, uP2: { value: new THREE.Vector4() }, uColor: { value: new THREE.Color() }, uFill: { value: 0 }, uAlpha: { value: 1 }, uTime: sharedUniforms.uTime, uStyle: { value: STYLE_ID[tg.style] ?? 0 } },
      vertexShader: TELE_VERT, fragmentShader: TELE_FRAG,
    });
    const m = new THREE.Mesh(this.teleGeo, mat);
    m.renderOrder = 3;
    const U = mat.uniforms;
    let cx = s.x, cz = s.z, ext;
    if (s.kind === 'circle') { U.uKind.value = 0; U.uP.value.set(s.x, s.z, s.r, 0); ext = s.r * 2 + 0.4; }
    else if (s.kind === 'ring') { U.uKind.value = 1; U.uP.value.set(s.x, s.z, s.r, s.inner); ext = s.r * 2 + 0.4; }
    else if (s.kind === 'rect') { U.uKind.value = 2; U.uP.value.set(s.x, s.z, s.len, s.w); U.uP2.value.set(s.dx, s.dz, 0, 0); cx = s.x + s.dx * s.len / 2; cz = s.z + s.dz * s.len / 2; ext = Math.hypot(s.len, s.w) + 0.6; }
    else { U.uKind.value = 3; U.uP.value.set(s.x, s.z, s.r, (s.angle * Math.PI) / 360); U.uP2.value.set(s.dx, s.dz, 0, 0); ext = s.r * 2 + 0.4; }
    m.position.set(cx, 0, cz);
    m.scale.set(ext, 1, ext);
    // 색: 내 팀 = 청록/파랑, 적 = 주황/빨강 (패턴·테두리로도 구분)
    const mine = tg.team === this.playerTeam;
    const beneficial = tg.style === 'allyZone';
    U.uColor.value.set(mine ? (beneficial ? 0x5af0c8 : 0x4aa8ff) : (beneficial ? 0xff9a5a : (tg.style === 'cc' ? 0xff4adf : 0xff4a3a)));
    this.scene.add(m);
    return m;
  }
  syncTelegraphs(sim, isVisibleAt) {
    const t = sim.time;
    const seen = new Set();
    for (const tg of sim.telegraphs) {
      seen.add(tg.id);
      let m = this.teleViews.get(tg.id);
      if (!m) { m = this.makeTele(tg); this.teleViews.set(tg.id, m); }
      const U = m.material.uniforms;
      const warn = Math.max(0.001, tg.warnEnd - tg.start);
      U.uFill.value = tg.warnEnd > tg.start ? Math.min(1, (t - tg.start) / warn) : 1;
      // 단계: 사전 표시 → 발동(밝게) → 소멸(페이드)
      let a = 0.85;
      if (t > tg.warnEnd && t <= tg.end) a = 1.0;
      if (t > tg.end) a = Math.max(0, 1 - (t - tg.end) / 0.4);
      U.uAlpha.value = a;
      m.visible = tg.team === this.playerTeam || isVisibleAt(tg.shape.x, tg.shape.z);
    }
    for (const [id, m] of this.teleViews) if (!seen.has(id)) { this.scene.remove(m); m.material.dispose(); this.teleViews.delete(id); }
  }

  update(dt) {
    this.time += dt;
    this.add.update(dt); this.norm.update(dt);
    const keep = [];
    for (const f of this.meshFx) {
      f.t += dt;
      const k = Math.min(1, f.t / f.life);
      f.upd(k, dt);
      if (k >= 1) {
        this.scene.remove(f.m);
        if (f.pool) { f.m.visible = false; this.pool[f.pool].push(f.m); }
        else if (f.dispose) f.m.traverse((o) => { if (o.geometry && o.geometry !== this.ringGeo && o.geometry !== this.discGeo) o.geometry.dispose(); });
      } else keep.push(f);
    }
    this.meshFx = keep;
  }
}
