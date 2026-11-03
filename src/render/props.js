// 환경 소품: 나무, 바위, 양치식물, 풀, 덤불, 뿌리 — 전부 절차적으로 독자 제작
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP_HALF, GRID_RES, classify, BRUSHES } from '../map/layout.js';
import { groundHeight, sdAt, brushAt, isWalkable, fbm } from '../map/grid.js';
import { mulberry } from './textures.js';
import { patchFow } from './terrain.js';

const col = (h) => new THREE.Color(h);

function colorize(geo, fn) {
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const cc = fn(p.getX(i), p.getY(i), p.getZ(i), i);
    c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
function strip(geo) {
  // merge 호환을 위해 동일한 속성 세트로 정리
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
function jitter(geo, amt, rnd) {
  const p = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, [(rnd() - 0.5) * amt, (rnd() - 0.5) * amt, (rnd() - 0.5) * amt]);
    const d = map.get(key);
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  return geo;
}
// 덩어리형 잎: 구형 법선 + 아래 어둡고 위 밝은 색
let FOLIAGE_DETAIL = 1;
function foliageClump(r, cx, cy, cz, dark, light, rnd, squash = 0.8) {
  let g = new THREE.IcosahedronGeometry(r, FOLIAGE_DETAIL);
  g = g.toNonIndexed();
  jitter(g, r * 0.35, rnd);
  g.scale(1, squash, 1);
  const p = g.attributes.position;
  const nrm = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i) * 1.2 + r * 0.25, p.getZ(i)).normalize();
    nrm[i * 3] = v.x; nrm[i * 3 + 1] = v.y; nrm[i * 3 + 2] = v.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.translate(cx, cy, cz);
  const dc = col(dark), lc = col(light);
  colorize(g, (x, y, z) => {
    const t = THREE.MathUtils.clamp((y - (cy - r * squash)) / (2 * r * squash), 0, 1);
    const c = dc.clone().lerp(lc, Math.pow(t, 0.9));
    const n = 0.92 + rnd() * 0.16;
    return c.multiplyScalar(n);
  });
  return strip(g);
}
function trunk(h, r0, r1, bend, colr, rnd, roots = 0) {
  const parts = [];
  const g = new THREE.CylinderGeometry(r1, r0, h, 7, 4, true);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h;
    p.setX(i, p.getX(i) + Math.sin(t * 2.2) * bend);
  }
  g.computeVertexNormals();
  const c = col(colr);
  colorize(g, (x, y) => c.clone().multiplyScalar(0.6 + 0.5 * (y / h)));
  parts.push(strip(g));
  for (let k = 0; k < roots; k++) {
    const a = (k / roots) * Math.PI * 2 + rnd() * 0.6;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Vector3(Math.cos(a) * r0 * 1.8, 0.15, Math.sin(a) * r0 * 1.8),
      new THREE.Vector3(Math.cos(a) * (r0 * 3 + rnd() * 0.6), -0.08, Math.sin(a) * (r0 * 3 + rnd() * 0.6)),
    );
    const rg = new THREE.TubeGeometry(curve, 5, r0 * 0.32, 5, false);
    colorize(rg, () => c.clone().multiplyScalar(0.55));
    parts.push(strip(rg));
  }
  return parts;
}

function makeTreeVariants(rnd) {
  const variants = [];
  // A: 둥근 활엽수 (짙은 녹색)
  for (let v = 0; v < 2; v++) {
    const parts = trunk(2.2, 0.32, 0.2, 0.15, 0x5a3e2b, rnd, 4);
    const n = 4 + v;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd();
      const rr = 0.7 + rnd() * 0.5;
      parts.push(foliageClump(1.1 + rnd() * 0.5, Math.cos(a) * rr, 2.6 + rnd() * 0.9, Math.sin(a) * rr, 0x173020, 0x4a7a32, rnd));
    }
    parts.push(foliageClump(1.3, 0, 3.6, 0, 0x204526, 0x5f8f3c, rnd));
    variants.push({ geo: mergeGeometries(parts), windMinY: 1.6 });
  }
  // B: 양식화된 침엽수 (청록)
  {
    const parts = trunk(1.6, 0.25, 0.14, 0.05, 0x4a3426, rnd, 3);
    for (let i = 0; i < 4; i++) {
      const r = 1.55 - i * 0.32, y = 1.3 + i * 0.95;
      let g = new THREE.ConeGeometry(r, 1.5, 8, 2).toNonIndexed();
      jitter(g, 0.12, rnd);
      g.translate(0, y + 0.75, 0);
      g.computeVertexNormals();
      const p = g.attributes.position;
      const nr = g.attributes.normal;
      for (let k = 0; k < p.count; k++) { const nn = new THREE.Vector3(nr.getX(k), nr.getY(k) + 0.6, nr.getZ(k)).normalize(); nr.setXYZ(k, nn.x, nn.y, nn.z); }
      colorize(g, (x, yy) => col(0x173a2e).lerp(col(0x4f8a5a), THREE.MathUtils.clamp((yy - y) / 1.5, 0, 1)).multiplyScalar(0.92 + rnd() * 0.15));
      parts.push(strip(g));
    }
    variants.push({ geo: mergeGeometries(parts), windMinY: 1.2 });
  }
  // C: 넓게 퍼진 연두빛 나무
  {
    const parts = trunk(1.9, 0.36, 0.22, -0.2, 0x6b4a33, rnd, 5);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rnd() * 0.5;
      parts.push(foliageClump(0.95 + rnd() * 0.35, Math.cos(a) * 1.3, 2.3 + rnd() * 0.5, Math.sin(a) * 1.3, 0x24401e, 0x6e9440, rnd, 0.7));
    }
    parts.push(foliageClump(1.2, 0, 2.9, 0, 0x2c4c22, 0x7aa046, rnd, 0.7));
    variants.push({ geo: mergeGeometries(parts), windMinY: 1.4 });
  }
  // D: 가을빛 악센트 나무 (드물게)
  {
    const parts = trunk(2.0, 0.28, 0.16, 0.25, 0x5b4033, rnd, 3);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rnd();
      parts.push(foliageClump(0.9 + rnd() * 0.3, Math.cos(a) * 0.7, 2.6 + rnd() * 0.6, Math.sin(a) * 0.7, 0x4d3a1c, 0xb68a3a, rnd));
    }
    variants.push({ geo: mergeGeometries(parts), windMinY: 1.6, rare: true });
  }
  return variants;
}

function makeRockVariants(rnd) {
  const out = [];
  for (let v = 0; v < 4; v++) {
    let g = new THREE.IcosahedronGeometry(1, 1);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g = mergeVertices(g);
    const pp = g.attributes.position;
    for (let k = 0; k < pp.count; k++) { const f = 0.78 + rnd() * 0.42; pp.setXYZ(k, pp.getX(k) * f, pp.getY(k) * f, pp.getZ(k) * f); }
    g.scale(1 + rnd() * 0.6, 0.55 + rnd() * 0.35, 1 + rnd() * 0.4);
    // 바닥을 평평하게
    for (let k = 0; k < pp.count; k++) if (pp.getY(k) < -0.25) pp.setY(k, -0.25 + (pp.getY(k) + 0.25) * 0.2);
    g.translate(0, 0.15, 0);
    g.computeVertexNormals();
    g = g.toNonIndexed();
    const mossy = rnd() > 0.4;
    colorize(g, (x, y, z) => {
      const top = THREE.MathUtils.clamp((y + 0.1) * 1.3, 0, 1);
      const c = col(0x333d47).lerp(col(0x6c7b88), top);
      if (mossy && y > 0.3) c.lerp(col(0x4a6630), THREE.MathUtils.clamp((y - 0.3) * 2.5, 0, 0.75));
      return c.multiplyScalar(0.92 + rnd() * 0.1);
    });
    out.push(strip(g));
  }
  return out;
}

function makeFern(rnd) {
  const parts = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const len = 0.7 + rnd() * 0.4;
    const g = new THREE.PlaneGeometry(0.28, len, 1, 3);
    g.translate(0, len / 2, 0);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const t = p.getY(k) / len; p.setZ(k, t * t * 0.45); p.setX(k, p.getX(k) * (1 - t * 0.7)); }
    g.rotateX(-0.5); g.rotateY(a);
    g.computeVertexNormals();
    const nr = g.attributes.normal;
    for (let k = 0; k < nr.count; k++) nr.setXYZ(k, 0, 1, 0);
    colorize(g, (x, y) => col(0x1e3a1c).lerp(col(0x5c8e3a), THREE.MathUtils.clamp(y / 0.7, 0, 1)));
    parts.push(strip(g));
  }
  return mergeGeometries(parts);
}
function makeGrassTuft(rnd, dark, light, h = 0.45, blades = 9) {
  const parts = [];
  for (let i = 0; i < blades; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * 0.25;
    const hh = h * (0.6 + rnd() * 0.6);
    const g = new THREE.BufferGeometry();
    const w = 0.06;
    const lean = (rnd() - 0.5) * 0.3;
    const pos = new Float32Array([-w, 0, 0, w, 0, 0, lean, hh, 0]);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
    g.rotateY(rnd() * Math.PI);
    g.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    colorize(g, (x, y) => col(dark).lerp(col(light), y / hh));
    parts.push(g);
  }
  return mergeGeometries(parts);
}
function makeBrushClump(rnd) {
  const parts = [];
  for (let i = 0; i < 20; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.9;
    const h = 0.8 + rnd() * 0.45;
    const g = new THREE.PlaneGeometry(0.34, h, 1, 3);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position;
    const bend = 0.25 + rnd() * 0.35;
    for (let k = 0; k < p.count; k++) { const t = p.getY(k) / h; p.setZ(k, t * t * bend); p.setX(k, p.getX(k) * (1 - t * 0.85)); }
    g.rotateY(a + Math.PI / 2);
    g.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    const nr = g.attributes.normal;
    for (let k = 0; k < nr.count; k++) { const v = new THREE.Vector3(Math.cos(a), 1.4, Math.sin(a)).normalize(); nr.setXYZ(k, v.x, v.y, v.z); }
    colorize(g, (x, y) => col(0x123528).lerp(col(0x3f8a5c), THREE.MathUtils.clamp(y / h, 0, 1)).multiplyScalar(0.9 + rnd() * 0.2));
    parts.push(strip(g));
  }
  return mergeGeometries(parts);
}

// 공간 청크 분할 인스턴싱 (절두체 컬링 효율)
const CHUNKS = 6;
function chunkedInstances(geo, material, items, { cast = true, receive = true } = {}) {
  const group = new THREE.Group();
  const buckets = Array.from({ length: CHUNKS * CHUNKS }, () => []);
  for (const it of items) {
    const ci = Math.min(CHUNKS - 1, Math.max(0, Math.floor(((it.x + MAP_HALF) / (MAP_HALF * 2)) * CHUNKS)));
    const cj = Math.min(CHUNKS - 1, Math.max(0, Math.floor(((it.z + MAP_HALF) / (MAP_HALF * 2)) * CHUNKS)));
    buckets[cj * CHUNKS + ci].push(it);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  for (const b of buckets) {
    if (!b.length) continue;
    const im = new THREE.InstancedMesh(geo, material, b.length);
    b.forEach((it, i) => {
      e.set(it.tilt || 0, it.rot || 0, it.tilt2 || 0);
      q.setFromEuler(e);
      s.set(it.s * (it.sx || 1), it.s * (it.sy || 1), it.s * (it.sz || 1));
      p.set(it.x, it.y, it.z);
      m4.compose(p, q, s);
      im.setMatrixAt(i, m4);
      if (it.color) im.setColorAt(i, it.color);
    });
    im.castShadow = cast; im.receiveShadow = receive;
    im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}

export function buildProps(quality) {
  const rnd = mulberry(1234);
  const group = new THREE.Group();
  group.name = 'props';
  const density = quality.foliage; // 0.4 ~ 1
  FOLIAGE_DETAIL = quality.foliage >= 0.95 ? 1 : 0; // 모델 LOD: 낮음/중간 품질은 저폴리 잎
  const trees = makeTreeVariants(rnd);
  const treeItems = trees.map(() => []);
  // 나무 배치: 지터 격자 + 노이즈 클러스터 → 일정 간격 반복 방지
  const step = 2.3;
  for (let z = -MAP_HALF; z < MAP_HALF; z += step) {
    for (let x = -MAP_HALF; x < MAP_HALF; x += step) {
      const px = x + (rnd() - 0.5) * step * 0.95, pz = z + (rnd() - 0.5) * step * 0.95;
      const s = sdAt(px, pz);
      if (s < 1.0) continue;
      const cluster = fbm(px * 0.08, pz * 0.08);
      // 가장자리일수록 다양한 크기, 내부는 듬성듬성(가려진 부분 비용 절약)
      const keep = s < 5 ? 0.95 : 0.55 + cluster * 0.4;
      if (rnd() > keep * (s > 8 ? density : 1)) continue;
      let vi;
      const r = rnd();
      if (r < 0.05) vi = 4; else if (cluster > 0.55) vi = r < 0.6 ? 2 : 0; else if (cluster < 0.4) vi = r < 0.5 ? 3 : 1; else vi = Math.floor(rnd() * 4);
      vi = Math.min(vi, trees.length - 1);
      const sc = (s < 2.5 ? 0.55 + rnd() * 0.3 : 0.7 + rnd() * 0.45);
      treeItems[vi].push({ x: px, z: pz, y: groundHeight(px, pz) - 0.1, s: sc, rot: rnd() * Math.PI * 2, tilt: (rnd() - 0.5) * 0.12, tilt2: (rnd() - 0.5) * 0.12 });
    }
  }
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  trees.forEach((t, i) => {
    const m = patchFow(treeMat.clone(), { wind: true, windAmp: 0.05, windMinY: t.windMinY, occlude: true });
    group.add(chunkedInstances(t.geo, m, treeItems[i]));
  });
  let treeCount = treeItems.reduce((a, b) => a + b.length, 0);

  // 바위: 절벽면 + 숲 가장자리
  const rocks = makeRockVariants(rnd);
  const rockItems = rocks.map(() => []);
  for (let i = 0; i < 2600; i++) {
    const x = (rnd() * 2 - 1) * MAP_HALF, z = (rnd() * 2 - 1) * MAP_HALF;
    const s = sdAt(x, z);
    if (s > 0.15 && s < 2.2) {
      if (rnd() > 0.55) continue;
      rockItems[i % 4].push({ x, z, y: groundHeight(x, z) - 0.2, s: 0.35 + rnd() * 0.6, rot: rnd() * 6.28, tilt: (rnd() - 0.5) * 0.4 });
    } else if (s > 2.2 && s < 6 && rnd() < 0.12) {
      rockItems[i % 4].push({ x, z, y: groundHeight(x, z) - 0.2, s: 0.6 + rnd() * 0.8, rot: rnd() * 6.28 });
    }
  }
  // 이동 경로 가장자리의 작은 돌 (판정 없음, 평평)
  for (let i = 0; i < 2200; i++) {
    const x = (rnd() * 2 - 1) * MAP_HALF, z = (rnd() * 2 - 1) * MAP_HALF;
    const s = sdAt(x, z);
    if (s > -1.3 && s < -0.15 && rnd() < 0.5) rockItems[(i + 1) % 4].push({ x, z, y: groundHeight(x, z) - 0.05, s: 0.12 + rnd() * 0.16, rot: rnd() * 6.28 });
  }
  const rockMat = patchFow(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: false }));
  rocks.forEach((g, i) => group.add(chunkedInstances(g, rockMat, rockItems[i])));

  // 양치식물·낮은 식생: 숲 가장자리
  const fern = makeFern(rnd);
  const fernItems = [];
  for (let i = 0; i < 9000 * density; i++) {
    const x = (rnd() * 2 - 1) * MAP_HALF, z = (rnd() * 2 - 1) * MAP_HALF;
    const s = sdAt(x, z);
    if (s > -0.7 && s < 3 && rnd() < 0.6) fernItems.push({ x, z, y: groundHeight(x, z) - 0.02, s: 0.45 + rnd() * 0.5, rot: rnd() * 6.28 });
  }
  const fernMat = patchFow(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), { wind: true, windAmp: 0.12, windMinY: 0.05 });
  group.add(chunkedInstances(fern, fernMat, fernItems, { cast: false }));

  // 풀 덤불(장식): 공격로가 아닌 잔디
  const tuft = makeGrassTuft(rnd, 0x2a4f24, 0x7fa64a, 0.3, 11);
  const tuftItems = [];
  for (let i = 0; i < 22000 * density; i++) {
    const x = (rnd() * 2 - 1) * MAP_HALF, z = (rnd() * 2 - 1) * MAP_HALF;
    if (!isWalkable(x, z)) continue;
    const c = classify(x, z);
    if (c.laneD < 4.4 || c.rD < 5 || c.baseD < -2) continue;
    if (c.jD < 2.0 && rnd() < 0.8) continue;
    tuftItems.push({ x, z, y: groundHeight(x, z) - 0.02, s: 0.6 + rnd() * 0.6, rot: rnd() * 6.28 });
  }
  const tuftMat = patchFow(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), { wind: true, windAmp: 0.18, windMinY: 0.02 });
  group.add(chunkedInstances(tuft, tuftMat, tuftItems, { cast: false }));

  // 시야 덤불: 진한 청록 키 큰 풀 — 일반 잔디와 확실히 구분
  const clump = makeBrushClump(rnd);
  const brushItems = [];
  for (const b of BRUSHES) {
    const area = Math.PI * b.rx * b.rz;
    const n = Math.ceil(area / 1.5);
    for (let i = 0; i < n * 2; i++) {
      const lx = (rnd() * 2 - 1) * b.rx, lz = (rnd() * 2 - 1) * b.rz;
      if ((lx * lx) / (b.rx * b.rx) + (lz * lz) / (b.rz * b.rz) > 1) continue;
      const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
      const x = b.p.x + lx * c - lz * s, z = b.p.z + lx * s + lz * c;
      if (!brushAt(x, z)) continue;
      brushItems.push({ x, z, y: groundHeight(x, z) - 0.05, s: 0.85 + rnd() * 0.4, rot: rnd() * 6.28 });
    }
  }
  const brushMat = patchFow(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), { wind: true, windAmp: 0.1, windMinY: 0.1 });
  const brushGroup = chunkedInstances(clump, brushMat, brushItems, { cast: true });
  group.add(brushGroup);

  return { group, stats: { trees: treeCount, rocks: rockItems.reduce((a, b) => a + b.length, 0), ferns: fernItems.length, tufts: tuftItems.length, brush: brushItems.length } };
}
