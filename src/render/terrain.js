// 지형 메시 + 강물 + 전장의 안개 셰이더 패치
import * as THREE from 'three';
import { MAP_HALF, GRID_RES, LANE_HALF_WIDTH, JUNGLE_PATH_HALF, RIVER_HALF, classify, BASES } from '../map/layout.js';
import { N, height, fbm } from '../map/grid.js';

// ---------------- 전장의 안개 ----------------
export const FOW_RES = 136; // 1 셀 = 1 유닛
export const fowData = new Uint8Array(FOW_RES * FOW_RES * 4);
for (let i = 0; i < fowData.length; i += 4) { fowData[i] = 255; fowData[i + 3] = 255; }
export const fowTexture = new THREE.DataTexture(fowData, FOW_RES, FOW_RES, THREE.RGBAFormat);
fowTexture.magFilter = THREE.LinearFilter;
fowTexture.minFilter = THREE.LinearFilter;
fowTexture.needsUpdate = true;
export const sharedUniforms = {
  uFow: { value: fowTexture },
  uMapHalf: { value: MAP_HALF },
  uTime: { value: 0 },
  uFowEnabled: { value: 1 },
};

// 임의의 three 머티리얼에 안개(시야) 어둡게 처리를 주입
export function patchFow(material, { wind = false, windAmp = 0.08, windMinY = 0.8, occlude = false } = {}) {
  if (occlude) material.userData.occ = { value: new THREE.Vector2(9999, 9999) };
  const prev = material.onBeforeCompile;
  const prevKeyFn = material.customProgramCacheKey;
  const prevKey = (prevKeyFn && prevKeyFn !== THREE.Material.prototype.customProgramCacheKey) ? prevKeyFn.call(material) : (prev ? prev.toString() : '');
  material.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.uniforms.uFow = sharedUniforms.uFow;
    shader.uniforms.uMapHalf = sharedUniforms.uMapHalf;
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uFowEnabled = sharedUniforms.uFowEnabled;
    if (occlude) shader.uniforms.uOcc = material.userData.occ;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFowW;${shader.vertexShader.includes('uniform float uTime;') ? '' : '\nuniform float uTime;'}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      ${wind ? `{
        vec4 ip = vec4(0.0,0.0,0.0,1.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix * ip;
        #endif
        float hgt = max(0.0, transformed.y - ${windMinY.toFixed(2)});
        float ph = ip.x * 0.37 + ip.z * 0.23;
        transformed.x += sin(uTime * 1.3 + ph) * ${windAmp.toFixed(3)} * hgt;
        transformed.z += cos(uTime * 1.1 + ph * 1.3) * ${(windAmp * 0.6).toFixed(3)} * hgt;
      }` : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 fw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fw = instanceMatrix * fw;
        #endif
        vFowW = (modelMatrix * fw).xyz;
      }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFowW;\nuniform sampler2D uFow;\nuniform float uMapHalf;\nuniform float uFowEnabled;${occlude ? '\nuniform vec2 uOcc;' : ''}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      ${occlude ? `{
        // 가림 완화: 내 캐릭터와 카메라 사이(화면 아래쪽)의 높은 잎을 디더링으로 비움
        vec2 dd = vFowW.xz - uOcc;
        float near_ = 1.0 - smoothstep(2.2, 3.6, length(vec2(dd.x, max(dd.y, 0.0) * 0.6)));
        float front = smoothstep(-1.0, 0.5, dd.y);
        float hcut = smoothstep(0.9, 1.6, vFowW.y);
        float k = near_ * front * hcut;
        vec2 fc = floor(gl_FragCoord.xy);
        float dither = mod(fc.x + fc.y, 2.0) + mod(fc.y, 2.0) * 0.5;
        if (k > 0.5 && dither < 1.0 + (k - 0.5)) discard;
      }` : ''}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
      {
        vec2 fuv = (vFowW.xz + uMapHalf) / (uMapHalf * 2.0);
        float vis = texture2D(uFow, fuv).r;
        float f = mix(1.0, mix(0.38, 1.0, vis), uFowEnabled);
        gl_FragColor.rgb *= f;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.78, 0.86, 1.05), (1.0 - vis) * uFowEnabled * 0.6);
      }`);
  };
  material.customProgramCacheKey = () => prevKey + '|fow' + (wind ? 'w' + windAmp + '_' + windMinY : '') + (occlude ? 'occ' : '');
  return material;
}

// ---------------- 지형 ----------------
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 수관·바위 그늘 베이크 텍스처 (나무 위치로 그린 부드러운 음영, 주광원 반대쪽으로 약간 밀림)
export function bakeCanopyAO(points) {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S);
  const k = S / (MAP_HALF * 2);
  // 태양: (-14, 26, 10) → 그림자는 +x, -z 쪽으로 늘어짐
  for (const p of points) {
    const x = (p.x + MAP_HALF + p.r * 0.35) * k, y = (p.z + MAP_HALF - p.r * 0.25) * k, r = p.r * k;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${p.a})`); g.addColorStop(0.55, `rgba(0,0,0,${p.a * 0.55})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  return t;
}

export function buildTerrain(textures, quality, aoTex) {
  const size = MAP_HALF * 2;
  const geo = new THREE.PlaneGeometry(size, size, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const M = N + 1;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) pos.setY(j * M + i, height[j * M + i]);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const splatA = new Float32Array(M * M * 4); // dirt, rock, sand, forest
  const splatB = new Float32Array(M * M * 4); // tiles, ao, macro, path
  const splatC = new Float32Array(M * M * 2); // 석판 길 가중치, 절벽 상단 가장자리
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const k = j * M + i;
    const x = pos.getX(k), z = pos.getZ(k);
    const c = classify(x, z);
    const n1 = fbm(x * 0.35, z * 0.35) - 0.5;
    const n2 = fbm(x * 0.11 + 30, z * 0.11) - 0.5;
    let dirt = 1 - smooth(LANE_HALF_WIDTH - 1.6, LANE_HALF_WIDTH + 0.6, c.laneD + n1 * 2.6);
    const path = 1 - smooth(JUNGLE_PATH_HALF - 1.8, JUNGLE_PATH_HALF + 0.2, c.jD + n1 * 1.6);
    dirt = Math.max(dirt, path * 0.55, (1 - smooth(-3.5, -0.5, c.campD + n1 * 2)) * 0.4, (1 - smooth(-6, -1, c.pitD + n1 * 2)) * 0.5);
    const sand = 1 - smooth(RIVER_HALF - 0.6, RIVER_HALF + 1.4, c.rD + n1 * 1.8);
    const ny = nrm.getY(k);
    let rock = smooth(0.9, 0.62, ny);
    if (c.sd > 0 && c.sd < 3.2) rock = Math.max(rock, smooth(3.2, 1.2, c.sd) * smooth(-0.2, 0.25, c.sd) * 0.9);
    const forest = smooth(0.6, 2.5, c.sd + n1 * 1.5);
    let tiles = 0;
    for (const bb of BASES) {
      const d = Math.hypot(x - bb.center.x, z - bb.center.z);
      tiles = Math.max(tiles, 1 - smooth(bb.r - 4.5, bb.r - 1.5, d + n1 * 2));
    }
    // 접지 음영: 절벽 아래를 더 깊게 + 벽 위 숲 바닥
    const ao = c.sd < 0 ? 0.48 + 0.52 * smooth(-0.1, -3.0, c.sd) : 0.72 + 0.28 * smooth(4, 1.5, c.sd);
    // 석판: 공격로 중심부(강 위는 제외)
    const slab = (1 - smooth(LANE_HALF_WIDTH - 2.4, LANE_HALF_WIDTH - 0.6, c.laneD + n1 * 1.4)) * smooth(RIVER_HALF + 0.5, RIVER_HALF + 2.5, c.rD);
    const lip = smooth(1.4, 2.2, c.sd) * (1 - smooth(2.4, 3.6, c.sd));
    splatA.set([dirt, rock, sand, forest], k * 4);
    splatB.set([tiles, ao, n2, path], k * 4);
    splatC.set([slab, lip], k * 2);
  }
  geo.setAttribute('splatA', new THREE.BufferAttribute(splatA, 4));
  geo.setAttribute('splatB', new THREE.BufferAttribute(splatB, 4));
  geo.setAttribute('splatC', new THREE.BufferAttribute(splatC, 2));

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tGrass: { value: textures.grass }, tDirt: { value: textures.dirt }, tRock: { value: textures.rock },
      tSand: { value: textures.sand }, tForest: { value: textures.forest }, tTiles: { value: textures.tiles },
      tAO: { value: aoTex || null }, uHasAO: { value: aoTex ? 1 : 0 }, uTT: sharedUniforms.uTime, uMH: { value: MAP_HALF },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 splatA; attribute vec4 splatB; attribute vec2 splatC;
        varying vec4 vSA; varying vec4 vSB; varying vec2 vSC; varying vec3 vTW; varying vec3 vTN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSA = splatA; vSB = splatB; vSC = splatC; vTW = (modelMatrix * vec4(transformed,1.0)).xyz; vTN = normal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass, tDirt, tRock, tSand, tForest, tTiles, tAO;
        uniform float uHasAO, uTT, uMH;
        varying vec4 vSA; varying vec4 vSB; varying vec2 vSC; varying vec3 vTW; varying vec3 vTN;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        vec2 h22(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        // 타일 반복 제거: 노이즈 영역마다 다른 오프셋으로 샘플링해 섞음
        vec3 tnt(sampler2D t, vec2 uv) {
          float k = vn(uv * 0.37) * 6.0;
          float i = floor(k), f = fract(k);
          vec2 oa = sin(vec2(3.1, 7.3) * i), ob = sin(vec2(3.1, 7.3) * (i + 1.0));
          vec3 a = texture2D(t, uv + oa).rgb, b = texture2D(t, uv + ob).rgb;
          return mix(a, b, smoothstep(0.25, 0.75, f - 0.1 * dot(a - b, vec3(1.0))));
        }
        float bl(float w, float h) { return smoothstep(0.32, 0.68, w + (h - 0.5) * 0.55); }
        vec3 triRock(vec3 p, vec3 n) {
          vec3 bw = pow(abs(n), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          // 층리: 높이에 따라 밝기 띠
          float strata = 0.86 + 0.18 * sin(p.y * 5.0 + vn(p.xz * 0.6) * 3.0);
          return (texture2D(tRock, p.zy * vec2(0.18, 0.32)).rgb * bw.x + tnt(tRock, p.xz * 0.18) * bw.y + texture2D(tRock, p.xy * vec2(0.18, 0.32)).rgb * bw.z) * strata;
        }
        // 석판 (보로노이): x=가장자리 거리, y=판 난수, zw=중심 방향
        vec4 slabs(vec2 p) {
          vec2 ip = floor(p), fp = fract(p);
          float d1 = 8.0, d2 = 8.0; vec2 r1 = vec2(0.0); vec2 c1 = vec2(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = 0.15 + 0.7 * h22(ip + g);
            vec2 r = g + o - fp; float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; r1 = r; c1 = ip + g; } else if (d < d2) d2 = d;
          }
          return vec4(sqrt(d2) - sqrt(d1), h21(c1), r1);
        }
        vec3 pNA(vec3 sp, vec3 sn, vec2 dH) {
          vec3 sx = dFdx(sp), sy = dFdy(sp);
          vec3 R1 = cross(sy, sn), R2 = cross(sn, sx);
          float det = dot(sx, R1);
          vec3 g = sign(det) * (dH.x * R1 + dH.y * R2);
          return normalize(abs(det) * sn - g);
        }`)
      .replace('#include <map_fragment>', `
        vec2 wuv = vTW.xz;
        vec3 grass = tnt(tGrass, wuv * 0.16);
        vec3 grass2 = tnt(tGrass, wuv * 0.047 + 0.3);
        grass = mix(grass, grass2, 0.4);
        // 거시적 색 변화: 따뜻한 풀/차가운 풀 패치 + 밝은 햇살 패치
        float mac = vn(wuv * 0.06) ;
        grass *= mix(vec3(0.86, 0.98, 0.84), vec3(1.12, 1.06, 0.86), smoothstep(0.25, 0.75, mac));
        grass *= mix(vec3(0.9), vec3(1.06), smoothstep(-0.2, 0.25, vSB.z));
        vec3 dirt = tnt(tDirt, wuv * 0.14);
        vec3 sand = tnt(tSand, wuv * 0.17);
        vec3 forest = tnt(tForest, wuv * 0.12);
        vec3 tiles = tnt(tTiles, wuv * 0.2);
        vec3 rock = triRock(vTW, normalize(vTN));
        float hn = tnt(tDirt, wuv * 0.05).g;
        vec3 col = grass;
        float gH = dot(grass, vec3(0.3)) * 0.35;
        col = mix(col, forest, bl(vSA.w, hn));
        col = mix(col, mix(grass * vec3(1.05,0.98,0.8), dirt, 0.75), bl(vSB.w * 0.9, hn) * 0.7);
        float wd = bl(vSA.x, hn);
        col = mix(col, dirt, wd);
        gH = mix(gH, dot(dirt, vec3(0.3)) * 0.5, wd);
        // 석판 길
        float slabW = vSC.x * smoothstep(0.5, 0.72, vn(wuv * 0.17) * 0.65 + vn(wuv * 0.8) * 0.35 + vSC.x * 0.22);
        if (slabW > 0.01) {
          vec4 sl = slabs(wuv * 0.78);
          float edge = sl.x;
          float stoneM = smoothstep(0.018, 0.05, edge);
          vec3 stone = mix(vec3(0.47, 0.44, 0.39), vec3(0.66, 0.6, 0.5), sl.y) * (0.82 + 0.3 * tnt(tRock, wuv * 0.22).r) * mix(vec3(1.0), vec3(1.04, 1.0, 0.92), step(0.5, fract(sl.y * 7.0)));
          stone *= 0.9 + 0.12 * smoothstep(0.1, 0.5, edge); // 중앙이 닳아 밝음
          // 균열
          float crack = smoothstep(0.018, 0.0, abs(vn(wuv * 1.9 + sl.y * 9.0) - 0.5)) * step(0.72, sl.y) * smoothstep(0.06, 0.16, sl.x);
          stone *= 1.0 - crack * 0.45;
          vec3 grout = mix(dirt * 0.66, grass * 0.62, smoothstep(0.45, 0.8, vn(wuv * 1.3)) * 0.7);
          vec3 sc = mix(grout, stone, stoneM);
          col = mix(col, sc, slabW);
          float sH = stoneM * (0.55 + 0.25 * smoothstep(0.05, 0.25, edge)) - crack * 0.25;
          gH = mix(gH, sH, slabW);
        }
        float sw = bl(vSA.z, hn);
        col = mix(col, sand, sw);
        col = mix(col, tiles, bl(vSB.x, hn));
        float rw = bl(vSA.y, hn);
        col = mix(col, rock, rw);
        gH = mix(gH, dot(rock, vec3(0.33)) * 0.9, rw);
        // 절벽 위 가장자리: 풀이 덮인 테두리 + 이끼
        float moss = smoothstep(0.55, 0.85, normalize(vTN).y) * vSA.y * smoothstep(1.2, 2.2, vTW.y);
        col = mix(col, grass * 0.95, max(moss * 0.7, vSC.y * 0.55));
        col *= vSB.y;
        // 수관·바위 그늘 (베이크)
        if (uHasAO > 0.5) { float ca = texture2D(tAO, (vTW.xz + uMH) / (uMH * 2.0)).r; col *= mix(vec3(0.62, 0.68, 0.8), vec3(1.0), ca); }
        // 젖은 강가 + 강바닥 빛 무늬
        float wet = smoothstep(-0.12, -0.42, vTW.y);
        col *= mix(1.0, 0.68, wet);
        if (vTW.y < -0.3) {
          vec2 cu = wuv * 0.9 + vec2(uTT * 0.25, uTT * 0.2);
          float ca2 = abs(vn(cu) - vn(cu * 1.7 + 3.0));
          col += vec3(0.5, 0.75, 0.8) * smoothstep(0.06, 0.0, ca2) * 0.12 * smoothstep(-0.3, -0.6, vTW.y);
        }
        vec4 diffuseColor = vec4(col, 1.0);
      `)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', '')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // 석판 모서리·질감 요철을 실제 법선에 반영 → 주광원 방향과 명암 일치
        normal = pNA(-vViewPosition, normal, vec2(dFdx(gH), dFdy(gH)) * 2.2);`);
  };
  patchFow(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// ---------------- 강물 ----------------
export function buildWater() {
  const M = N + 1;
  const hData = new Float32Array(M * M);
  hData.set(height);
  const hTex = new THREE.DataTexture(hData, M, M, THREE.RedFormat, THREE.FloatType);
  hTex.magFilter = THREE.LinearFilter; hTex.minFilter = THREE.LinearFilter; hTex.needsUpdate = true;
  const len = 50 * Math.SQRT2 * 2 + 16, wid = (RIVER_HALF + 3) * 2;
  const geo = new THREE.PlaneGeometry(len, wid, 160, 12);
  geo.rotateX(-Math.PI / 2);
  geo.rotateY(-Math.PI / 4);
  const WATER_Y = -0.3;
  geo.translate(0, WATER_Y, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...sharedUniforms, uH: { value: hTex }, uWaterY: { value: WATER_Y } },
    vertexShader: `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform sampler2D uH; uniform sampler2D uFow; uniform float uMapHalf; uniform float uTime; uniform float uWaterY; uniform float uFowEnabled;
      varying vec3 vW;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      float rip(vec2 q) { return vn(q) * 0.6 + vn(q * 2.3 + 5.0) * 0.4; }
      void main() {
        vec2 uv = (vW.xz + uMapHalf) / (uMapHalf * 2.0);
        float g = texture2D(uH, uv).r;
        float depth = uWaterY - g;
        if (depth < -0.02) discard;
        vec2 flowDir = normalize(vec2(1.0, 1.0));
        vec2 side = vec2(-flowDir.y, flowDir.x);
        vec2 q = vec2(dot(vW.xz, flowDir), dot(vW.xz, side));
        // 흐르는 잔물결 → 의사 법선
        vec2 q1 = vec2(q.x * 0.9 - uTime * 0.7, q.y * 1.3), q2 = vec2(q.x * 1.6 - uTime * 1.2, q.y * 2.2) + 11.0;
        float e = 0.08;
        float r0 = rip(q1) + rip(q2) * 0.5;
        float rx = rip(q1 + vec2(e, 0.0)) + rip(q2 + vec2(e, 0.0)) * 0.5;
        float ry = rip(q1 + vec2(0.0, e)) + rip(q2 + vec2(0.0, e)) * 0.5;
        vec3 n = normalize(vec3((r0 - rx) * 1.4, 1.0, (r0 - ry) * 1.4));
        float dt = smoothstep(0.0, 0.5, depth);
        vec3 shallow = vec3(0.32, 0.6, 0.58);
        vec3 deep = vec3(0.06, 0.22, 0.34);
        vec3 col = mix(shallow, deep, dt);
        // 하늘 반사 (스치는 각도일수록)
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(0.0, dot(V, n)), 3.0);
        col = mix(col, vec3(0.62, 0.78, 0.9), fres * 0.5);
        // 잔물결 밝은 선 (은은하게)
        float crest = smoothstep(0.66, 0.8, r0 / 1.5 + 0.2);
        col += crest * 0.05 * vec3(0.9, 1.0, 1.0);
        // 작은 햇빛 반짝임 (스킬과 혼동되지 않도록 작고 희미하게)
        vec3 L = normalize(vec3(-14.0, 26.0, 10.0));
        float spec = pow(max(0.0, dot(reflect(-L, n), V)), 140.0);
        col += vec3(1.0, 0.97, 0.88) * spec * 0.55;
        // 물가: 얇고 부드러운 거품
        float shore = 1.0 - smoothstep(0.0, 0.09 + vn(vW.xz * 1.5 + uTime * 0.3) * 0.05, depth);
        float foam = shore * smoothstep(0.4, 0.7, vn(vW.xz * 3.0 + vec2(uTime * 0.5, 0.0)));
        col = mix(col, vec3(0.88, 0.95, 0.98), clamp(foam * 0.7 + shore * 0.2, 0.0, 1.0));
        // 얕은 가장자리는 투명 → 강바닥이 비침, 깊은 중앙은 불투명
        float alpha = mix(0.22, 0.86, dt);
        alpha = max(alpha, foam * 0.55) * smoothstep(-0.02, 0.025, depth);
        alpha = min(1.0, alpha + spec * 0.4);
        float vis = texture2D(uFow, uv).r;
        col *= mix(1.0, mix(0.4, 1.0, vis), uFowEnabled);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.name = 'water';
  return mesh;
}
