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

export function buildTerrain(textures, quality) {
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
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const k = j * M + i;
    const x = pos.getX(k), z = pos.getZ(k);
    const c = classify(x, z);
    const n1 = fbm(x * 0.35, z * 0.35) - 0.5;
    const n2 = fbm(x * 0.11 + 30, z * 0.11) - 0.5;
    let dirt = 1 - smooth(LANE_HALF_WIDTH - 1.8, LANE_HALF_WIDTH + 0.3, c.laneD + n1 * 2.2);
    const path = 1 - smooth(JUNGLE_PATH_HALF - 1.8, JUNGLE_PATH_HALF + 0.2, c.jD + n1 * 1.6);
    dirt = Math.max(dirt, path * 0.55, (1 - smooth(-3.5, -0.5, c.campD + n1 * 2)) * 0.4, (1 - smooth(-6, -1, c.pitD + n1 * 2)) * 0.5);
    const sand = 1 - smooth(RIVER_HALF - 0.4, RIVER_HALF + 1.6, c.rD + n1 * 1.8);
    const ny = nrm.getY(k);
    let rock = smooth(0.9, 0.62, ny);
    if (c.sd > 0 && c.sd < 3.2) rock = Math.max(rock, smooth(3.2, 1.2, c.sd) * smooth(-0.2, 0.25, c.sd) * 0.9);
    const forest = smooth(0.6, 2.5, c.sd + n1 * 1.5);
    let tiles = 0;
    for (const b of BASES) {
      const d = Math.hypot(x - b.center.x, z - b.center.z);
      tiles = Math.max(tiles, 1 - smooth(b.r - 4.5, b.r - 1.5, d + n1 * 2));
    }
    // 접지 음영: 절벽 아래 + 벽 위 숲 바닥
    const ao = c.sd < 0 ? 0.55 + 0.45 * smooth(-0.1, -2.6, c.sd) : 0.75 + 0.25 * smooth(4, 1.5, c.sd);
    splatA.set([dirt, rock, sand, forest], k * 4);
    splatB.set([tiles, ao, n2, path], k * 4);
  }
  geo.setAttribute('splatA', new THREE.BufferAttribute(splatA, 4));
  geo.setAttribute('splatB', new THREE.BufferAttribute(splatB, 4));

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tGrass: { value: textures.grass }, tDirt: { value: textures.dirt }, tRock: { value: textures.rock },
      tSand: { value: textures.sand }, tForest: { value: textures.forest }, tTiles: { value: textures.tiles },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 splatA; attribute vec4 splatB;
        varying vec4 vSA; varying vec4 vSB; varying vec3 vTW; varying vec3 vTN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSA = splatA; vSB = splatB; vTW = (modelMatrix * vec4(transformed,1.0)).xyz; vTN = normal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass, tDirt, tRock, tSand, tForest, tTiles;
        varying vec4 vSA; varying vec4 vSB; varying vec3 vTW; varying vec3 vTN;
        float bl(float w, float h) { return smoothstep(0.32, 0.68, w + (h - 0.5) * 0.55); }
        vec3 triRock(vec3 p, vec3 n) {
          vec3 bw = pow(abs(n), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          return texture2D(tRock, p.zy * 0.18).rgb * bw.x + texture2D(tRock, p.xz * 0.18).rgb * bw.y + texture2D(tRock, p.xy * 0.18).rgb * bw.z;
        }`)
      .replace('#include <map_fragment>', `
        vec2 wuv = vTW.xz;
        vec3 grass = texture2D(tGrass, wuv * 0.16).rgb;
        vec3 grass2 = texture2D(tGrass, wuv * 0.043 + 0.3).rgb;
        grass = mix(grass, grass2, 0.35);
        // 거시적 색 변화: 따뜻한 풀/차가운 풀 패치
        grass *= mix(vec3(0.92, 1.0, 0.86), vec3(1.08, 1.04, 0.9), smoothstep(-0.25, 0.25, vSB.z));
        vec3 dirt = texture2D(tDirt, wuv * 0.14).rgb;
        vec3 sand = texture2D(tSand, wuv * 0.17).rgb;
        vec3 forest = texture2D(tForest, wuv * 0.12).rgb;
        vec3 tiles = texture2D(tTiles, wuv * 0.2).rgb;
        vec3 rock = triRock(vTW, normalize(vTN));
        float hn = texture2D(tDirt, wuv * 0.05).g;
        vec3 col = grass;
        col = mix(col, forest, bl(vSA.w, hn));
        col = mix(col, mix(grass * vec3(1.05,0.98,0.8), dirt, 0.75), bl(vSB.w * 0.9, hn) * 0.7);
        col = mix(col, dirt, bl(vSA.x, hn));
        col = mix(col, sand, bl(vSA.z, hn));
        col = mix(col, tiles, bl(vSB.x, hn));
        col = mix(col, rock, bl(vSA.y, hn));
        // 절벽 위쪽 이끼
        float moss = smoothstep(0.55, 0.85, normalize(vTN).y) * vSA.y * smoothstep(1.2, 2.2, vTW.y);
        col = mix(col, forest * 1.2, moss * 0.6);
        col *= vSB.y;
        // 젖은 강가
        col *= mix(1.0, 0.7, smoothstep(-0.15, -0.45, vTW.y));
        vec4 diffuseColor = vec4(col, 1.0);
      `)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', '');
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
      void main() {
        vec2 uv = (vW.xz + uMapHalf) / (uMapHalf * 2.0);
        float g = texture2D(uH, uv).r;
        float depth = uWaterY - g;
        if (depth < -0.02) discard;
        vec2 flowDir = normalize(vec2(1.0, 1.0));
        vec2 side = vec2(-flowDir.y, flowDir.x);
        vec2 q = vec2(dot(vW.xz, flowDir), dot(vW.xz, side));
        float n1 = vn(vec2(q.x * 0.35 - uTime * 0.6, q.y * 1.4));
        float n2 = vn(vec2(q.x * 0.9 - uTime * 1.1, q.y * 2.6) + 7.0);
        float streak = smoothstep(0.62, 0.9, n1 * 0.6 + n2 * 0.5);
        vec3 shallow = vec3(0.36, 0.62, 0.62);
        vec3 deep = vec3(0.12, 0.30, 0.42);
        float dt = smoothstep(0.0, 0.45, depth);
        vec3 col = mix(shallow, deep, dt);
        col += streak * 0.12 * vec3(0.85, 0.95, 1.0);
        // 해안선 거품
        float foamBand = 1.0 - smoothstep(0.0, 0.07 + n2 * 0.05, depth);
        float foam = foamBand * smoothstep(0.35, 0.65, vn(vW.xz * 2.2 + uTime * 0.4));
        col = mix(col, vec3(0.9, 0.97, 1.0), clamp(foam + foamBand * 0.35, 0.0, 1.0) * 0.75);
        float alpha = mix(0.55, 0.86, dt);
        alpha = max(alpha, foamBand * 0.6) * smoothstep(-0.02, 0.03, depth);
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
