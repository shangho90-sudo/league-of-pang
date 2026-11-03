// 전장 레이아웃 정의 — 지형, 내비게이션, AI, 미니맵이 모두 이 데이터 하나를 공유한다.
// 좌표계: 월드 X(오른쪽), Z(화면 아래쪽). 블루 팀 = 좌하단, 레드 팀 = 우상단. 점대칭 (x,z)->(-x,-z).

export const MAP_SCALE = 0.84;       // 4대4 기준 축소 (5대5 설계 대비 공격로·합류 거리 단축)
export const MAP_HALF = 68;          // 월드 범위 [-68, 68]
export const PLAY_HALF = 63.5;         // 이동 가능 한계
export const GRID_RES = 0.5;         // 내비게이션 셀 크기
export const GRID_N = Math.round((MAP_HALF * 2) / GRID_RES); // 320

const P = (x, z) => ({ x: x * MAP_SCALE, z: z * MAP_SCALE });
const Praw = (x, z) => ({ x, z });
const mirrorPoint = (p) => Praw(-p.x, -p.z);           // 블루 <-> 레드
const mirrorMid = (p) => Praw(-p.z, -p.x);             // 상단 정글 <-> 하단 정글 (미드 축 반사)

// 공격로 (블루 기준 시작 -> 레드 기지)
export const LANES = {
  top: [P(-62, 52), P(-66, 20), P(-67, -46), P(-60, -61), P(-46, -67), P(20, -66), P(52, -62)],
  mid: [P(-56, 56), P(-30, 30), P(0, 0), P(30, -30), P(56, -56)],
  bot: [P(-52, 62), P(-20, 66), P(46, 67), P(61, 60), P(67, 46), P(66, -20), P(62, -52)],
};
export const LANE_HALF_WIDTH = 4.6;

// 블루 상단 정글 사분면 경로/캠프 정의 — 나머지 세 사분면은 반사로 생성
const JUNGLE_BASE = {
  paths: [
    [P(-24, 24), P(-34, 14), P(-44, 8), P(-52, 6), P(-62, 6)],   // 미드 -> 상단 공격로
    [P(-44, 8), P(-40, -6), P(-30, -20), P(-24, -24)],              // 캠프 -> 강
    [P(-30, 20), P(-22, 8), P(-17, -3), P(-11, -11)],              // 로밍 연결로: 미드 -> 강 중앙
    [P(-52, 6), P(-54, -10), P(-60, -24), P(-66, -28)],             // 상단 공격로 측면
    [P(-40, -6), P(-54, -10)],
  ],
  camps: [
    { id: 'buffA', p: P(-44, 9), r: 5.5, kind: 'golem' },   // 큰 캠프 (재생 버프)
    { id: 'wolves', p: P(-54, -12), r: 4.6, kind: 'wolves' },
  ],
};
export const JUNGLE_PATH_HALF = 3.0;

function buildJungle() {
  const quads = [];
  const xforms = [
    { team: 0, side: 'top', f: (p) => p },
    { team: 0, side: 'bot', f: mirrorMid },
    { team: 1, side: 'bot', f: mirrorPoint },
    { team: 1, side: 'top', f: (p) => mirrorPoint(mirrorMid(p)) },
  ];
  const paths = [];
  const camps = [];
  for (const xf of xforms) {
    for (const path of JUNGLE_BASE.paths) paths.push(path.map(xf.f));
    for (const c of JUNGLE_BASE.camps) {
      camps.push({ id: `${c.id}_${xf.team}_${xf.side}`, p: xf.f(c.p), r: c.r, kind: c.kind, team: xf.team, side: xf.side });
    }
    quads.push(xf);
  }
  return { paths, camps };
}
export const JUNGLE = buildJungle();

// 강: z = x 대각선
export const RIVER_HALF = 4.4;
export const RIVER_EXTENT = 50; // 강 끝 (공격로와 만나는 지점까지)

// 대형 중립 몬스터 구역 (강 위)
export const PITS = [
  { id: 'colossus', p: P(-30, -30), r: 8.5, kind: 'colossus' },  // 상단 강: 협곡 거신
  { id: 'drake', p: P(30, 30), r: 8.5, kind: 'drake' },          // 하단 강: 비룡
];

// 기지
export const BASES = [
  { team: 0, center: P(-63, 63), r: 14.5, fountain: P(-71, 71), nexus: P(-57, 57), shop: P(-74, 64) },
  { team: 1, center: P(63, -63), r: 14.5, fountain: P(71, -71), nexus: P(57, -57), shop: P(74, -64) },
];
export const FOUNTAIN_R = 5.5;

// 포탑 (블루 기준, 레드는 점대칭)
const TURRETS_BLUE = [
  { lane: 'top', tier: 1, p: P(-66.6, -14) },
  { lane: 'top', tier: 2, p: P(-64.8, 34) },
  { lane: 'mid', tier: 1, p: P(-17, 17) },
  { lane: 'mid', tier: 2, p: P(-38, 38) },
  { lane: 'bot', tier: 1, p: P(14, 66.6) },
  { lane: 'bot', tier: 2, p: P(-34, 64.8) },
  { lane: 'nexus', tier: 3, p: P(-51, 51) },
];
export const TURRETS = [
  ...TURRETS_BLUE.map((t, i) => ({ ...t, team: 0, id: `t0_${i}` })),
  ...TURRETS_BLUE.map((t, i) => ({ ...t, p: mirrorPoint(t.p), team: 1, id: `t1_${i}` })),
];

// 덤불 (타원: 중심, 반지름, 회전)
const BRUSH_BLUE = [
  { p: P(-61, -6), rx: 2.2, rz: 5.0, rot: 0 },            // 상단 공격로 옆
  { p: P(-70, -36), rx: 2.0, rz: 4.5, rot: 0 },
  { p: P(-12, 9), rx: 1.8, rz: 4.5, rot: Math.PI / 4 },    // 미드 옆
  { p: P(-20, -26), rx: 2.0, rz: 4.5, rot: -Math.PI / 4 },   // 강 입구
  { p: P(-40, -38), rx: 2.0, rz: 5.0, rot: Math.PI / 4 },   // 거신 앞
  { p: P(-30, 6), rx: 2.0, rz: 3.8, rot: 0.6 },           // 중앙 로밍 연결로
];
export const BRUSHES = [];
for (const b of BRUSH_BLUE) {
  BRUSHES.push(b);
  BRUSHES.push({ ...b, p: mirrorMid(b.p), rot: Math.PI / 2 - b.rot });
}
for (const b of [...BRUSHES]) BRUSHES.push({ ...b, p: mirrorPoint(b.p) });
BRUSHES.forEach((b, i) => (b.id = i + 1));

// ---------------- 기하 유틸 ----------------
export function distToSeg(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + dx * t - px, qz = a.z + dz * t - pz;
  return Math.sqrt(qx * qx + qz * qz);
}
export function distToPolyline(px, pz, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSeg(px, pz, pts[i], pts[i + 1]));
  return d;
}
export function riverDist(x, z) {
  // 강 중심선(z=x)까지의 거리. 강 범위를 벗어난 부분은 무한대 처리
  const along = (x + z) / Math.SQRT2;
  if (Math.abs(along) > RIVER_EXTENT * Math.SQRT2 * 0.5 + 40) return Infinity;
  const ex = Math.abs(x) > RIVER_EXTENT || Math.abs(z) > RIVER_EXTENT ? 1e3 : 0;
  return Math.abs(z - x) / Math.SQRT2 + ex;
}
export function inBrush(x, z) {
  for (const b of BRUSHES) {
    const dx = x - b.p.x, dz = z - b.p.z;
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if ((lx * lx) / (b.rx * b.rx) + (lz * lz) / (b.rz * b.rz) <= 1) return b.id;
  }
  return 0;
}

// 지면 종류 분류 (지형 셰이딩과 보행 판정 공용)
// 반환: { walk: 0/1, lane: 차선까지 거리, river: 강 거리, jungle: 정글 경로 거리, base: 기지 거리 }
export function classify(x, z) {
  const laneD = Math.min(distToPolyline(x, z, LANES.top), distToPolyline(x, z, LANES.mid), distToPolyline(x, z, LANES.bot));
  let jD = Infinity;
  for (const p of JUNGLE.paths) jD = Math.min(jD, distToPolyline(x, z, p));
  let campD = Infinity;
  for (const c of JUNGLE.camps) campD = Math.min(campD, Math.hypot(x - c.p.x, z - c.p.z) - c.r);
  let pitD = Infinity;
  for (const p of PITS) pitD = Math.min(pitD, Math.hypot(x - p.p.x, z - p.p.z) - p.r);
  let baseD = Infinity;
  for (const b of BASES) baseD = Math.min(baseD, Math.hypot(x - b.center.x, z - b.center.z) - b.r);
  const rD = riverDist(x, z);
  // 통합 "개활지까지의 부호 거리": 음수 = 이동 가능 영역 내부
  const open = Math.min(laneD - LANE_HALF_WIDTH, jD - JUNGLE_PATH_HALF, campD, pitD, baseD, rD - RIVER_HALF);
  const edge = Math.max(Math.abs(x), Math.abs(z)) - PLAY_HALF;
  const sd = Math.max(open, edge);
  return { sd, laneD, jD, campD, pitD, baseD, rD };
}

export const TEAM_COLORS = [
  { main: 0x3d8bff, light: 0x8cc4ff, css: '#4b9bff', name: '청람' },
  { main: 0xe2483d, light: 0xff9a8a, css: '#ff5a4a', name: '적염' },
];
