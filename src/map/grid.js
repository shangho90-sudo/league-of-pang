// 보행/높이/덤불 그리드 + A* 경로 탐색. 지형 메시와 충돌이 모두 이 그리드에서 파생된다.
import { MAP_HALF, GRID_RES, GRID_N, classify, inBrush, RIVER_HALF } from './layout.js';

export const N = GRID_N;
export const sd = new Float32Array(N * N);       // 개활지 부호 거리
export const rd = new Float32Array(N * N);       // 강 거리
export const laneD = new Float32Array(N * N);
export const jungleD = new Float32Array(N * N);
export const walk = new Uint8Array(N * N);
export const brush = new Uint8Array(N * N);
export const height = new Float32Array((N + 1) * (N + 1)); // 정점 높이 (N+1)^2
export const WALL_H = 2.4;
export const RIVER_DEPTH = 0.75;
export const WALK_MARGIN = -0.35;  // 이 값보다 깊이 들어가야 보행 가능 (절벽 바로 앞 여유)

function hash(x, z) {
  let h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) {
  return vnoise(x, z) * 0.5 + vnoise(x * 2.1, z * 2.1) * 0.27 + vnoise(x * 4.3, z * 4.3) * 0.15 + vnoise(x * 8.7, z * 8.7) * 0.08;
}

export const toCell = (v) => Math.floor((v + MAP_HALF) / GRID_RES);
export const cellCenter = (i) => -MAP_HALF + (i + 0.5) * GRID_RES;

export function heightAtVertex(x, z) {
  const c = classify(x, z);
  let h;
  if (c.sd <= 0) {
    h = 0;
  } else {
    // 절벽: 개활지 경계에서 급격히 솟고, 상단은 완만한 언덕
    const t = Math.min(1, c.sd / 2.0);
    const cliff = t * t * (3 - 2 * t);
    h = WALL_H * cliff + Math.min(1, c.sd / 8) * (fbm(x * 0.12, z * 0.12) * 1.6) * cliff;
  }
  // 강바닥
  if (c.rD < RIVER_HALF + 2.0) {
    const t = Math.max(0, Math.min(1, (RIVER_HALF + 2.0 - c.rD) / 3.2));
    const s = t * t * (3 - 2 * t);
    h = h * (1 - s) - RIVER_DEPTH * s;
  }
  // 걷는 지면의 미세 기복 (시각용, 판정에 영향 없음 수준)
  if (c.sd < 0) h += (fbm(x * 0.25 + 9, z * 0.25) - 0.5) * 0.12;
  return h;
}

let built = false;
export function buildGrid() {
  if (built) return;
  built = true;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cellCenter(i), z = cellCenter(j);
      const c = classify(x, z);
      const k = j * N + i;
      sd[k] = c.sd;
      rd[k] = c.rD;
      laneD[k] = c.laneD;
      jungleD[k] = Math.min(c.jD, c.campD + 3, c.pitD + 3);
      walk[k] = c.sd < WALK_MARGIN ? 1 : 0;
      brush[k] = walk[k] ? inBrush(x, z) : 0;
    }
  }
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = -MAP_HALF + i * GRID_RES, z = -MAP_HALF + j * GRID_RES;
      height[j * (N + 1) + i] = heightAtVertex(x, z);
    }
  }
}

export function groundHeight(x, z) {
  const fx = (x + MAP_HALF) / GRID_RES, fz = (z + MAP_HALF) / GRID_RES;
  const i = Math.max(0, Math.min(N - 1, Math.floor(fx))), j = Math.max(0, Math.min(N - 1, Math.floor(fz)));
  const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
  const M = N + 1;
  const a = height[j * M + i], b = height[j * M + i + 1], c = height[(j + 1) * M + i], d = height[(j + 1) * M + i + 1];
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function isWalkable(x, z) {
  const i = toCell(x), j = toCell(z);
  if (i < 0 || j < 0 || i >= N || j >= N) return false;
  return walk[j * N + i] === 1;
}
export function brushAt(x, z) {
  const i = toCell(x), j = toCell(z);
  if (i < 0 || j < 0 || i >= N || j >= N) return 0;
  return brush[j * N + i];
}
export function sdAt(x, z) {
  const i = toCell(x), j = toCell(z);
  if (i < 0 || j < 0 || i >= N || j >= N) return 99;
  return sd[j * N + i];
}

export function nearestWalkable(x, z, maxR = 30) {
  if (isWalkable(x, z)) return { x, z };
  const ci = toCell(x), cj = toCell(z);
  for (let r = 1; r < maxR / GRID_RES; r++) {
    let best = null, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N || !walk[j * N + i]) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = { x: cellCenter(i), z: cellCenter(j) }; }
      }
    }
    if (best) return best;
  }
  return { x, z };
}

// 셀 직선 가시성 (경로 단순화 & 이동 가능 판정)
export function lineWalkable(x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(d / (GRID_RES * 0.5));
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0;
    if (!isWalkable(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
  }
  return true;
}

// ---------------- A* (이진 힙) ----------------
const gScore = new Float32Array(N * N);
const fromIdx = new Int32Array(N * N);
const stamp = new Uint32Array(N * N);
const closed = new Uint32Array(N * N);
let curStamp = 1;
const heap = new Int32Array(N * N);
const heapF = new Float32Array(N * N);
let heapLen = 0;
function hpush(k, f) {
  let i = heapLen++;
  heap[i] = k; heapF[i] = f;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heapF[p] <= heapF[i]) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    [heapF[p], heapF[i]] = [heapF[i], heapF[p]];
    i = p;
  }
}
function hpop() {
  const top = heap[0];
  heapLen--;
  if (heapLen > 0) {
    heap[0] = heap[heapLen]; heapF[0] = heapF[heapLen];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < heapLen && heapF[l] < heapF[m]) m = l;
      if (r < heapLen && heapF[r] < heapF[m]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      [heapF[m], heapF[i]] = [heapF[i], heapF[m]];
      i = m;
    }
  }
  return top;
}
export const pathStats = { calls: 0, nodes: 0 };
export function findPath(x0, z0, x1, z1, maxNodes = 40000) {
  pathStats.calls++;
  const s = nearestWalkable(x0, z0, 6), e = nearestWalkable(x1, z1, 20);
  if (lineWalkable(s.x, s.z, e.x, e.z)) return [{ x: e.x, z: e.z }];
  const si = toCell(s.x), sj = toCell(s.z), ei = toCell(e.x), ej = toCell(e.z);
  const sk = sj * N + si, ek = ej * N + ei;
  curStamp++;
  heapLen = 0;
  gScore[sk] = 0; stamp[sk] = curStamp; fromIdx[sk] = -1;
  const h = (i, j) => { const dx = Math.abs(i - ei), dz = Math.abs(j - ej); return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)); };
  hpush(sk, h(si, sj));
  let found = false, n = 0;
  let bestK = sk, bestH = Infinity;
  while (heapLen > 0 && n < maxNodes) {
    const k = hpop();
    if (closed[k] === curStamp) continue;
    closed[k] = curStamp;
    n++;
    if (k === ek) { found = true; break; }
    const ci = k % N, cj = (k / N) | 0;
    const hh = h(ci, cj);
    if (hh < bestH) { bestH = hh; bestK = k; }
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nk = nj * N + ni;
      if (!walk[nk] || closed[nk] === curStamp) continue;
      if (di && dj && (!walk[cj * N + ni] || !walk[nj * N + ci])) continue; // 모서리 끼임 방지
      const cost = (di && dj ? Math.SQRT2 : 1) + (sd[nk] > -1.0 ? 0.6 : 0); // 벽 근처 회피 가중치
      const g = gScore[k] + cost;
      if (stamp[nk] !== curStamp || g < gScore[nk]) {
        stamp[nk] = curStamp; gScore[nk] = g; fromIdx[nk] = k;
        hpush(nk, g + h(ni, nj));
      }
    }
  }
  pathStats.nodes += n;
  const endK = found ? ek : bestK;
  const cells = [];
  for (let k = endK; k !== -1; k = fromIdx[k]) cells.push(k);
  cells.reverse();
  // 문자열 당기기(string pulling)로 경로 단순화
  const pts = cells.map((k) => ({ x: cellCenter(k % N), z: cellCenter((k / N) | 0) }));
  if (found) pts[pts.length - 1] = { x: e.x, z: e.z };
  const out = [];
  let anchor = { x: s.x, z: s.z };
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !lineWalkable(anchor.x, anchor.z, pts[j].x, pts[j].z)) j = Math.max(i, j - Math.max(1, ((j - i) / 3) | 0));
    out.push(pts[j]);
    anchor = pts[j];
    i = j + 1;
  }
  return out;
}
