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
const SUN = new THREE.Vector3(-14, 26, 10).normalize();
// 잎 카드 텍스처: 잎 묶음 실루엣 (알파)
let LEAF_TEX = null;
function leafTexture() {
  if (LEAF_TEX) return LEAF_TEX;
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const r = mulberry(77);
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S * 0.32;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.85;
    const L = S * (0.11 + r() * 0.08), W = L * 0.42, rot = a + (r() - 0.5) * 1.2;
    const sh = 0.72 + r() * 0.28 + (1 - y / S) * 0.15;
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = `rgb(${Math.round(255 * sh)},${Math.round(255 * sh)},${Math.round(255 * sh)})`;
    g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(0, -W, L, 0); g.quadraticCurveTo(0, W, -L, 0); g.fill();
    g.strokeStyle = `rgba(0,0,0,0.25)`; g.lineWidth = 1; g.beginPath(); g.moveTo(-L * 0.9, 0); g.lineTo(L * 0.9, 0); g.stroke();
    g.restore();
  }
  LEAF_TEX = new THREE.CanvasTexture(cv);
  LEAF_TEX.colorSpace = THREE.SRGBColorSpace;
  return LEAF_TEX;
}
// 정점 색에 주광원 방향 명암을 구워 넣음 (실제 조명과 같은 방향)
function bakeLight(n, base, ao = 1) {
  const l = Math.max(0, n.dot(SUN));
  return base.clone().multiplyScalar((0.68 + l * 0.5) * ao);
}
// 잎 덩어리: 울퉁불퉁한 구 + 구형 법선 + 아래 어둡고 위 밝은 색 + 수관 안쪽 음영
function foliageClump(r, cx, cy, cz, dark, light, rnd, squash = 0.8, treeC = null) {
  let g = new THREE.IcosahedronGeometry(r, FOLIAGE_DETAIL);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const n = fbm(v.x * 2.1 + cx * 3, v.z * 2.1 + v.y * 1.7 + cz);
    v.multiplyScalar(0.78 + n * 0.5);
    p.setXYZ(i, v.x, v.y * squash, v.z);
  }
  g = g.toNonIndexed();
  const q = g.attributes.position;
  const nrm = new Float32Array(q.count * 3);
  const dc = col(dark), lc = col(light), cols = new Float32Array(q.count * 3);
  for (let i = 0; i < q.count; i++) {
    const v = new THREE.Vector3(q.getX(i), q.getY(i) * 1.15 + r * 0.25, q.getZ(i)).normalize();
    nrm.set([v.x, v.y, v.z], i * 3);
    const t = THREE.MathUtils.clamp((q.getY(i) + r * squash) / (2 * r * squash), 0, 1);
    let c = dc.clone().lerp(lc, Math.pow(t, 0.85));
    const wy = cy + q.getY(i), wx = cx + q.getX(i), wz = cz + q.getZ(i);
    const ao = treeC ? THREE.MathUtils.clamp(0.7 + Math.hypot(wx - treeC.x, wz - treeC.z) * 0.18 + (wy - treeC.y) * 0.08, 0.6, 1.08) : 1;
    c = bakeLight(v, c, ao).multiplyScalar(0.94 + rnd() * 0.1);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.translate(cx, cy, cz);
  return strip(g);
}
// 잎 카드: 덩어리 표면에서 바깥을 향한 사각형 → 실루엣이 잎 묶음으로 끊어짐
function leafCards(r, cx, cy, cz, dark, light, rnd, n, squash = 0.8) {
  const parts = [];
  const dc = col(dark), lc = col(light);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(th), Math.abs(u) * 0.8 + 0.1, Math.sqrt(1 - u * u) * Math.sin(th)).normalize();
    const s = r * (0.75 + rnd() * 0.5);
    const g = new THREE.PlaneGeometry(s, s);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0));
    g.applyMatrix4(m);
    g.rotateOnAxis?.(dir, rnd() * 6);
    const c = dir.clone().multiplyScalar(r * 0.92); c.y *= squash;
    g.translate(cx + c.x, cy + c.y, cz + c.z);
    const t = THREE.MathUtils.clamp(dir.y * 0.5 + 0.5, 0, 1);
    const cc = bakeLight(dir, dc.clone().lerp(lc, t)).multiplyScalar(0.95 + rnd() * 0.1);
    const p = g.attributes.position, colA = new Float32Array(p.count * 3), nA = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) { colA.set([cc.r, cc.g, cc.b], k * 3); nA.set([dir.x, dir.y, dir.z], k * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nA, 3));
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  return parts;
}
function trunk(h, r0, r1, bend, colr, rnd, roots = 0, branches = []) {
  const parts = [];
  const g = new THREE.CylinderGeometry(r1, r0, h, 8, 5, true);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / h; p.setX(i, p.getX(i) + Math.sin(t * 2.2) * bend); }
  g.computeVertexNormals();
  const c = col(colr);
  const nr = g.attributes.normal;
  colorize(g, (x, y, z, i) => bakeLight(new THREE.Vector3(nr.getX(i), nr.getY(i), nr.getZ(i)), c, 0.55 + 0.5 * (y / h)));
  parts.push(strip(g));
  // 가지: 줄기에서 잎 덩어리로
  for (const b of branches) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.sin(b.from * 2.2) * bend, b.from * h, 0), new THREE.Vector3(b.x * 0.4, b.y * 0.85, b.z * 0.4), new THREE.Vector3(b.x, b.y, b.z));
    const bg = new THREE.TubeGeometry(curve, 5, r1 * 0.55, 5, false);
    colorize(bg, (x, y) => c.clone().multiplyScalar(0.7 + 0.25 * (y / (b.y || 1))));
    parts.push(strip(bg));
  }
  for (let k = 0; k < roots; k++) {
    const a = (k / roots) * Math.PI * 2 + rnd() * 0.6;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Vector3(Math.cos(a) * r0 * 1.8, 0.15, Math.sin(a) * r0 * 1.8),
      new THREE.Vector3(Math.cos(a) * (r0 * 3 + rnd() * 0.6), -0.08, Math.sin(a) * (r0 * 3 + rnd() * 0.6)),
    );
    const rg = new THREE.TubeGeometry(curve, 5, r0 * 0.32, 5, false);
    colorize(rg, () => c.clone().multiplyScalar(0.5));
    parts.push(strip(rg));
  }
  return parts;
}

// 나무 종류: 불투명 몸체(줄기·가지·잎 덩어리) + 잎 카드(알파 테스트)
function makeTreeVariants(rnd, cardsPerClump) {
  const variants = [];
  const broad = (trunkCol, dark, light, nCl, spread, hTop, sq, roots, extra = {}) => {
    const clumps = [];
    for (let i = 0; i < nCl; i++) { const a = (i / nCl) * Math.PI * 2 + rnd() * 0.7; const rr = spread * (0.7 + rnd() * 0.5); clumps.push({ x: Math.cos(a) * rr, y: hTop - 0.4 + rnd() * 0.9, z: Math.sin(a) * rr, r: 0.95 + rnd() * 0.45 }); }
    clumps.push({ x: 0, y: hTop + 0.65, z: 0, r: 1.15 + rnd() * 0.2 });
    const tc = { x: 0, y: hTop, z: 0 };
    const parts = trunk(hTop - 0.5, 0.3, 0.18, extra.bend ?? 0.15, trunkCol, rnd, roots, clumps.slice(0, nCl).map((c) => ({ from: 0.55 + rnd() * 0.25, x: c.x * 0.8, y: c.y - 0.3, z: c.z * 0.8 })));
    const cards = [];
    for (const c of clumps) { parts.push(foliageClump(c.r, c.x, c.y, c.z, dark, light, rnd, sq, tc)); cards.push(...leafCards(c.r, c.x, c.y, c.z, dark, light, rnd, cardsPerClump, sq)); }
    return { geo: mergeGeometries(parts), cards: cards.length ? mergeGeometries(cards) : null, windMinY: hTop - 1.2, rare: extra.rare };
  };
  variants.push(broad(0x5a3e2b, 0x163020, 0x5f9238, 4, 0.85, 2.7, 0.82, 4));          // 짙은 활엽수
  variants.push(broad(0x4d3627, 0x1a3a26, 0x6a9a3e, 5, 1.05, 2.9, 0.78, 4));          // 큰 활엽수
  // 침엽수: 층층이 쌓인 원뿔 (톱니 가장자리)
  {
    const parts = trunk(1.6, 0.25, 0.14, 0.05, 0x4a3426, rnd, 3);
    const cards = [];
    for (let i = 0; i < 4; i++) {
      const r = 1.55 - i * 0.32, y = 1.3 + i * 0.95;
      let g = new THREE.ConeGeometry(r, 1.5, 9, 2);
      const pp = g.attributes.position;
      for (let k = 0; k < pp.count; k++) { const yy = pp.getY(k); if (yy < -0.6) { const a = Math.atan2(pp.getZ(k), pp.getX(k)); const f = 1 + 0.18 * Math.sin(a * 9); pp.setX(k, pp.getX(k) * f); pp.setZ(k, pp.getZ(k) * f); pp.setY(k, yy - (f - 1) * 0.6); } }
      g = g.toNonIndexed(); g.translate(0, y + 0.75, 0); g.computeVertexNormals();
      const nr = g.attributes.normal;
      for (let k = 0; k < nr.count; k++) { const nn = new THREE.Vector3(nr.getX(k), nr.getY(k) + 0.55, nr.getZ(k)).normalize(); nr.setXYZ(k, nn.x, nn.y, nn.z); }
      colorize(g, (x, yy, z, k) => bakeLight(new THREE.Vector3(nr.getX(k), nr.getY(k), nr.getZ(k)), col(0x10302a).lerp(col(0x3f7a52), THREE.MathUtils.clamp((yy - y) / 1.5, 0, 1))).multiplyScalar(0.93 + rnd() * 0.12));
      parts.push(strip(g));
    }
    variants.push({ geo: mergeGeometries(parts), cards: null, windMinY: 1.2 });
  }
  variants.push(broad(0x6b4a33, 0x24401e, 0x86a848, 6, 1.25, 2.3, 0.7, 5, { bend: -0.2 })); // 넓게 퍼진 연두빛
  variants.push(broad(0x5b4033, 0x4a3518, 0xc0903a, 4, 0.7, 2.6, 0.8, 3, { bend: 0.25, rare: true })); // 가을빛 악센트
  return variants;
}

// 바위: 큰 면/작은 면이 구분되는 깎인 형태 (플랫 셰이딩) + 위쪽 이끼, 면 방향별 명암을 정점 색에 반영
function makeRockVariants(rnd) {
  const out = [];
  const one = (sx, sy, sz, ox = 0, oz = 0, mossy = true) => {
    let g = new THREE.IcosahedronGeometry(1, 0);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);
    const pp = g.attributes.position;
    for (let k = 0; k < pp.count; k++) { const f = 0.72 + rnd() * 0.5; pp.setXYZ(k, pp.getX(k) * f * sx, pp.getY(k) * f * sy, pp.getZ(k) * f * sz); if (pp.getY(k) < -0.2 * sy) pp.setY(k, -0.2 * sy); }
    g = g.toNonIndexed(); g.computeVertexNormals();
    g.translate(ox, 0.18 * sy, oz);
    const nr = g.attributes.normal;
    const faceRand = [];
    colorize(g, (x, y, z, i) => {
      const f = Math.floor(i / 3);
      faceRand[f] ??= rnd();
      const n = new THREE.Vector3(nr.getX(i), nr.getY(i), nr.getZ(i));
      let c = col(0x46515d).lerp(col(0x7a8794), THREE.MathUtils.clamp(n.y * 0.6 + 0.4, 0, 1)).multiplyScalar(0.88 + faceRand[f] * 0.22);
      if (mossy && n.y > 0.72 && faceRand[f] > 0.25) c.lerp(col(0x4f6e2e), 0.75);
      c = bakeLight(n, c, 0.8 + THREE.MathUtils.clamp(y, 0, 1) * 0.25);
      return c;
    });
    return strip(g);
  };
  out.push(mergeGeometries([one(1.2, 0.8, 1.0), one(0.45, 0.35, 0.5, 1.1, 0.5)]));
  out.push(mergeGeometries([one(1.0, 1.1, 0.9)]));
  out.push(mergeGeometries([one(1.4, 0.6, 1.1), one(0.5, 0.45, 0.4, -1.1, -0.4), one(0.35, 0.3, 0.35, 0.6, -1.0)]));
  out.push(mergeGeometries([one(0.9, 0.7, 1.3, 0, 0, false)]));
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
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.95;
    const h = 0.42 + rnd() * 0.26;
    const g = new THREE.PlaneGeometry(0.26, h, 1, 3);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position;
    const bend = 0.25 + rnd() * 0.35;
    for (let k = 0; k < p.count; k++) { const t = p.getY(k) / h; p.setZ(k, t * t * bend); p.setX(k, p.getX(k) * (1 - t * 0.85)); }
    g.rotateY(a + Math.PI / 2);
    g.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    const nr = g.attributes.normal;
    for (let k = 0; k < nr.count; k++) { const v = new THREE.Vector3(Math.cos(a), 1.4, Math.sin(a)).normalize(); nr.setXYZ(k, v.x, v.y, v.z); }
    colorize(g, (x, y) => col(0x24624a).lerp(col(0x7cc98a), THREE.MathUtils.clamp(y / h, 0, 1)).multiplyScalar(0.9 + rnd() * 0.2));
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
  const cardsPerClump = quality.foliage >= 0.95 ? 9 : quality.foliage >= 0.6 ? 6 : 3;
  const trees = makeTreeVariants(rnd, cardsPerClump);
  const aoPoints = [];
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
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const cardMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide });
  trees.forEach((t, i) => {
    const m = patchFow(treeMat.clone(), { wind: true, windAmp: 0.05, windMinY: t.windMinY, occlude: true });
    group.add(chunkedInstances(t.geo, m, treeItems[i]));
    if (t.cards) {
      const cm = patchFow(cardMat.clone(), { wind: true, windAmp: 0.07, windMinY: t.windMinY, occlude: true });
      group.add(chunkedInstances(t.cards, cm, treeItems[i], { cast: true }));
    }
    for (const it of treeItems[i]) aoPoints.push({ x: it.x, z: it.z, r: 2.6 * it.s, a: 0.5 });
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
  // 강둑 바위 돌출부: 강과 맞닿은 절벽/숲 가장자리 (이동 불가 영역에만 → 판정과 어긋나지 않음)
  for (let i = 0; i < 5000; i++) {
    const x = (rnd() * 2 - 1) * MAP_HALF, z = (rnd() * 2 - 1) * MAP_HALF;
    const c = classify(x, z);
    if (c.rD < 9 && c.sd > 0.05 && c.sd < 1.6 && rnd() < 0.5) rockItems[i % 4].push({ x, z, y: groundHeight(x, z) - 0.25, s: 0.55 + rnd() * 0.75, rot: rnd() * 6.28, tilt: (rnd() - 0.5) * 0.3 });
  }
  // 이동 경로 가장자리의 작은 돌 (판정 없음, 평평)
  for (let i = 0; i < 2200; i++) {
    const x = (rnd() * 2 - 1) * MAP_HALF, z = (rnd() * 2 - 1) * MAP_HALF;
    const s = sdAt(x, z);
    if (s > -1.3 && s < -0.15 && rnd() < 0.5) rockItems[(i + 1) % 4].push({ x, z, y: groundHeight(x, z) - 0.05, s: 0.12 + rnd() * 0.16, rot: rnd() * 6.28 });
  }
  const rockMat = patchFow(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }));
  rocks.forEach((g, i) => group.add(chunkedInstances(g, rockMat, rockItems[i])));
  for (const r of rockItems) for (const it of r) if (it.s > 0.3) aoPoints.push({ x: it.x, z: it.z, r: 1.6 * it.s, a: 0.35 });

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
    const n = Math.ceil(area / 1.9);
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

  return { group, aoPoints, stats: { trees: treeCount, rocks: rockItems.reduce((a, b) => a + b.length, 0), ferns: fernItems.length, tufts: tuftItems.length, brush: brushItems.length } };
}
