// 휴머노이드 리그 공용 절차 애니메이션 — 뼈 이름(Hips/Spine/Left_UpperArm…) 기반
// 회전은 '휴식 자세 캐릭터 공간' 기준 오일러(도)로 정의: x=앞뒤(+는 상체 숙임/팔다리 뒤로), y=수직축 비틀기, z=좌우(팔 내림)
// 캐릭터 정면 = +Z, 캐릭터 왼쪽 = +X
import * as THREE from 'three';

const D = Math.PI / 180;
const BONES = ['Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head',
  'Left_Shoulder', 'Left_UpperArm', 'Left_LowerArm', 'Left_Hand',
  'Right_Shoulder', 'Right_UpperArm', 'Right_LowerArm', 'Right_Hand',
  'Left_UpperLeg', 'Left_LowerLeg', 'Left_Foot', 'Right_UpperLeg', 'Right_LowerLeg', 'Right_Foot'];

const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
function eulerQ(out, x, y, z) {
  // Ry * Rx * Rz (Z 먼저 적용)
  out.setFromAxisAngle(AY, y * D);
  _qa.setFromAxisAngle(AX, x * D); out.multiply(_qa);
  _qa.setFromAxisAngle(AZ, z * D); out.multiply(_qa);
  return out;
}

export class Pose {
  constructor() { this.b = {}; this.hipY = 0; this.hipZ = 0; }
  set(name, x = 0, y = 0, z = 0) { this.b[name] = [x, y, z]; return this; }
  add(name, x = 0, y = 0, z = 0, w = 1) {
    const v = this.b[name] || (this.b[name] = [0, 0, 0]);
    v[0] += x * w; v[1] += y * w; v[2] += z * w; return this;
  }
  addPose(p, w = 1) {
    if (w === 0) return this;
    for (const k in p.b) this.add(k, p.b[k][0], p.b[k][1], p.b[k][2], w);
    this.hipY += p.hipY * w; this.hipZ += p.hipZ * w;
    return this;
  }
  // 상체 관절만 덮어쓰기 블렌드
  blendTo(p, w, filter) {
    if (w <= 0) return this;
    for (const k of BONES) {
      if (filter && !filter(k)) continue;
      const a = this.b[k] || [0, 0, 0], b = p.b[k] || [0, 0, 0];
      this.b[k] = [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
    }
    if (!filter) { this.hipY += (p.hipY - this.hipY) * w; this.hipZ += (p.hipZ - this.hipZ) * w; }
    return this;
  }
  clone() { const p = new Pose(); for (const k in this.b) p.b[k] = [...this.b[k]]; p.hipY = this.hipY; p.hipZ = this.hipZ; return p; }
}
export const isUpper = (k) => !k.includes('Leg') && !k.includes('Foot') && k !== 'Hips';
export const isRightArm = (k) => k.startsWith('Right_') && !k.includes('Leg') && !k.includes('Foot');
export const isLeftArm = (k) => k.startsWith('Left_') && !k.includes('Leg') && !k.includes('Foot');

export class HumanoidRig {
  constructor(root, container) {
    this.root = root;          // 스킨 모델 루트
    this.container = container; // 캐릭터 공간 (정면 +Z)
    this.bones = {};
    root.traverse((o) => { if (o.isBone && BONES.includes(o.name) && !this.bones[o.name]) this.bones[o.name] = o; });
    container.updateMatrixWorld(true);
    const cInv = new THREE.Quaternion();
    container.getWorldQuaternion(cInv).invert();
    this.rest = {};
    for (const [name, bone] of Object.entries(this.bones)) {
      const wq = new THREE.Quaternion();
      bone.parent.getWorldQuaternion(wq);
      const P = cInv.clone().multiply(wq); // 부모의 캐릭터공간 휴식 회전
      this.rest[name] = { local: bone.quaternion.clone(), P, Pinv: P.clone().invert(), pos: bone.position.clone() };
    }
    // 다리 길이 (보폭 계산용)
    const wp = (n) => this.bones[n] ? this.bones[n].getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
    const hip = container.worldToLocal(wp('Left_UpperLeg'));
    const foot = container.worldToLocal(wp('Left_Foot'));
    this.legLen = Math.max(0.1, hip.y - foot.y);
    this.hipsRestY = this.bones.Hips ? this.bones.Hips.position.clone() : null;
    // 엉덩이 뼈의 '위' 방향(로컬) — 상하 바운스용
    if (this.bones.Hips) {
      const hb = this.bones.Hips;
      const pq = new THREE.Quaternion(); hb.parent.getWorldQuaternion(pq);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(container.getWorldQuaternion(new THREE.Quaternion()));
      up.applyQuaternion(pq.clone().invert());
      const ps = new THREE.Vector3(); hb.parent.getWorldScale(ps);
      const cs = new THREE.Vector3(); container.getWorldScale(cs);
      this.hipUpLocal = up.normalize().multiplyScalar(cs.y / ps.y);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(container.getWorldQuaternion(new THREE.Quaternion()));
      fwd.applyQuaternion(pq.clone().invert());
      this.hipFwdLocal = fwd.normalize().multiplyScalar(cs.z / ps.z);
    }
  }
  // 지면 관통 방지: 가장 낮은 발/발가락 뼈가 지면(캐릭터 공간 y=0) 아래면 그만큼 들어 올릴 값 반환
  groundLift() {
    if (!this.feet) { this.feet = []; this.root.traverse((o) => { if (o.isBone && /(Foot|Toes|ToesEnd)$/.test(o.name)) this.feet.push(o); }); this._v = new THREE.Vector3(); }
    this.container.updateMatrixWorld(true);
    let minY = Infinity;
    for (const b of this.feet) { b.getWorldPosition(this._v); this.container.worldToLocal(this._v); minY = Math.min(minY, this._v.y); }
    return Math.max(0, 0.005 - minY);
  }
  apply(pose) {
    for (const [name, r] of Object.entries(this.rest)) {
      const e = pose.b[name];
      const bone = this.bones[name];
      if (!e) { bone.quaternion.copy(r.local); continue; }
      eulerQ(_q, e[0], e[1], e[2]);
      // local = P^-1 * qc * P * restLocal
      _qb.copy(r.Pinv).multiply(_q).multiply(r.P).multiply(r.local);
      bone.quaternion.copy(_qb);
    }
    if (this.bones.Hips && this.hipsRestY) {
      this.bones.Hips.position.copy(this.hipsRestY)
        .addScaledVector(this.hipUpLocal, pose.hipY)
        .addScaledVector(this.hipFwdLocal, pose.hipZ);
    }
  }
}

// ---------- 포즈 라이브러리 ----------
export function basePose(arche) {
  const p = new Pose();
  // 기본: 팔 내림, 살짝 굽힌 팔꿈치, 무릎 약간 굽힘 (전투 대기)
  p.set('Left_UpperArm', 4, 0, -70).set('Right_UpperArm', 4, 0, 70);
  p.set('Left_LowerArm', 0, -18, 0).set('Right_LowerArm', 0, 18, 0);
  p.set('Left_UpperLeg', -6, 0, -3).set('Right_UpperLeg', -6, 0, 3);
  p.set('Left_LowerLeg', 10, 0, 0).set('Right_LowerLeg', 10, 0, 0);
  p.set('Left_Foot', -4, 0, 0).set('Right_Foot', -4, 0, 0);
  p.set('Spine', 4, 0, 0);
  p.hipY = -0.012;
  switch (arche) {
    case 'staff': // 유봉을 세워 쥔 자세
      p.set('Right_UpperArm', -10, 0, 62).set('Right_LowerArm', 0, 70, 0).set('Right_Hand', 0, 0, 0);
      p.set('Left_UpperArm', -6, 0, -62).set('Left_LowerArm', 0, -40, 0);
      break;
    case 'shield': // 방패를 앞으로, 낮은 무게중심
      p.set('Left_UpperArm', -35, 20, -55).set('Left_LowerArm', 0, -75, 0);
      p.set('Right_UpperArm', -8, 0, 64).set('Right_LowerArm', 0, 35, 0);
      p.set('Left_UpperLeg', -14, 0, -9).set('Right_UpperLeg', -10, 0, 9).set('Left_LowerLeg', 22, 0, 0).set('Right_LowerLeg', 20, 0, 0);
      p.set('Spine', 10, 0, 0); p.hipY = -0.04;
      break;
    case 'dual': // 역수로 쥔 쌍검, 낮게 웅크림
      p.set('Left_UpperArm', -20, 0, -55).set('Left_LowerArm', 0, -60, 0);
      p.set('Right_UpperArm', -20, 0, 55).set('Right_LowerArm', 0, 60, 0);
      p.set('Spine', 14, 0, 0).set('Chest', 6, 0, 0);
      p.set('Left_UpperLeg', -18, 0, -8).set('Right_UpperLeg', -8, 0, 8).set('Left_LowerLeg', 28, 0, 0).set('Right_LowerLeg', 22, 0, 0);
      p.hipY = -0.05;
      break;
    case 'hammer': // 망치를 어깨에 걸침
      p.set('Right_UpperArm', -30, 0, 30).set('Right_LowerArm', 0, 120, 0);
      p.set('Left_UpperArm', 0, 0, -68).set('Left_LowerArm', 0, -20, 0);
      p.set('Spine', 6, -6, 0);
      break;
    case 'sword': // 검을 비스듬히 아래로
      p.set('Right_UpperArm', -20, 0, 62).set('Right_LowerArm', 0, 40, 0);
      p.set('Left_UpperArm', -5, 0, -66).set('Left_LowerArm', 0, -30, 0);
      break;
    case 'bow': // 왼손에 활
      p.set('Left_UpperArm', -20, 0, -64).set('Left_LowerArm', 0, -30, 0);
      p.set('Right_UpperArm', 0, 0, 72).set('Right_LowerArm', 0, 25, 0);
      break;
    case 'orb': // 양손을 벌려 천체 장치를 조종
      p.set('Left_UpperArm', -15, 0, -52).set('Left_LowerArm', 0, -45, 0);
      p.set('Right_UpperArm', -15, 0, 52).set('Right_LowerArm', 0, 45, 0);
      break;
    case 'spear': // 창을 대각선으로
      p.set('Right_UpperArm', -25, 0, 60).set('Right_LowerArm', 0, 55, 0);
      p.set('Left_UpperArm', -35, 0, -50).set('Left_LowerArm', 0, -55, 0);
      p.set('Spine', 8, 8, 0);
      p.set('Left_UpperLeg', -14, 0, -6).set('Left_LowerLeg', 20, 0, 0);
      break;
    case 'cannon': // 어깨 포의 반동을 받치는 자세
      p.set('Right_UpperArm', -10, 0, 60).set('Right_LowerArm', 0, 50, 0);
      p.set('Left_UpperArm', -5, 0, -66).set('Left_LowerArm', 0, -25, 0);
      p.set('Spine', 2, 0, 0);
      break;
    case 'conductor': // 지휘봉
      p.set('Right_UpperArm', -30, 0, 55).set('Right_LowerArm', 0, 50, 0);
      p.set('Left_UpperArm', -20, 0, -55).set('Left_LowerArm', 0, -50, 0);
      break;
  }
  return p;
}

// 이동 주기 (phase: 라디안). 다리만이 아니라 골반·상체·팔 반대 회전·상하 움직임 포함
export function locomotion(phase, speedN, arche, legLen) {
  const p = new Pose();
  const s = Math.sin(phase), c = Math.cos(phase);
  const heavy = arche === 'shield' || arche === 'hammer';
  const sw = (heavy ? 30 : 36) * speedN;
  p.add('Left_UpperLeg', -s * sw);
  p.add('Right_UpperLeg', s * sw);
  // 무릎: 다리가 앞으로 나가며 들릴 때 굽힘
  const kneeL = Math.max(0, Math.sin(phase + 1.3)) * 62 * speedN + 6 * speedN;
  const kneeR = Math.max(0, Math.sin(phase + Math.PI + 1.3)) * 62 * speedN + 6 * speedN;
  p.add('Left_LowerLeg', kneeL);
  p.add('Right_LowerLeg', kneeR);
  p.add('Left_Foot', -kneeL * 0.35 + s * sw * 0.3);
  p.add('Right_Foot', -kneeR * 0.35 - s * sw * 0.3);
  // 골반: 비틀림 + 기울기, 상하 바운스 (2배 주파수)
  p.add('Hips', 0, s * 9 * speedN, -c * 3 * speedN);
  p.add('Spine', 6 * speedN, -s * 7 * speedN, c * 2 * speedN);
  p.add('Chest', 3 * speedN, -s * 4 * speedN, 0);
  p.add('Head', -6 * speedN, s * 4 * speedN, 0);
  p.hipY = -(0.5 + 0.5 * Math.cos(phase * 2)) * legLen * (heavy ? 0.075 : 0.06) * speedN;
  // 팔 반대 스윙 (무기 들린 팔은 감쇠)
  const armW = { staff: [0.6, 0.25], shield: [0.2, 0.6], dual: [0.7, 0.7], hammer: [0.8, 0.1], sword: [0.7, 0.35], bow: [0.3, 0.8], orb: [0.5, 0.5], spear: [0.35, 0.3], cannon: [0.8, 0.4], conductor: [0.5, 0.4] }[arche] || [1, 1];
  p.add('Left_UpperArm', s * 28 * speedN * armW[0]);
  p.add('Right_UpperArm', -s * 28 * speedN * armW[1]);
  p.add('Left_LowerArm', 0, -Math.max(0, s) * 18 * speedN * armW[0], 0);
  p.add('Right_LowerArm', 0, Math.max(0, -s) * 18 * speedN * armW[1], 0);
  return p;
}

const ease = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t;

// 공격/시전 포즈: 준비(windup) → 타격(strike) → 회수(recover)
// t: 액션 경과 시간, windup: 타격 시점. strike 구간 ~0.1초
export function actionPose(arche, kind, slot, t, windup, total, variant = 0) {
  const p = new Pose();
  const strikeDur = Math.min(0.12, (total - windup) * 0.4 + 0.02);
  let phase, k; // phase 0 windup, 1 strike, 2 recover
  if (t < windup) { phase = 0; k = ease(t / Math.max(0.001, windup)); }
  else if (t < windup + strikeDur) { phase = 1; k = easeOut((t - windup) / strikeDur); }
  else { phase = 2; k = ease(Math.min(1, (t - windup - strikeDur) / Math.max(0.05, total - windup - strikeDur))); }
  // 세 키 포즈 사이 보간
  const keys = actionKeys(arche, kind, slot, variant);
  const A = keys[0], B = keys[1], Rp = keys[2] || keys[0];
  const lerpP = (P1, P2, w) => { const o = new Pose(); o.addPose(P1, 1 - w); o.addPose(P2, w); return o; };
  const zero = new Pose();
  if (phase === 0) return lerpP(zero, A, k);
  if (phase === 1) return lerpP(A, B, k);
  return lerpP(B, zero, k).addPose(Rp, Math.sin(k * Math.PI) * 0.3);
}

function P(obj, hipY = 0) {
  const p = new Pose();
  for (const k in obj) p.set(k, ...obj[k]);
  p.hipY = hipY;
  return p;
}
// 각 아키타입의 [준비, 타격 끝, 회수 보조] 가산 포즈 (basePose 위에 더해짐)
function actionKeys(arche, kind, slot, variant) {
  const atk = kind === 'attack';
  const R = (o) => o;
  switch (arche) {
    case 'sword':
    case 'spear': {
      if (arche === 'spear' && (atk || slot === 'Q')) // 찌르기
        return [P({ Right_UpperArm: [30, 20, -10], Right_LowerArm: [0, 40, 0], Spine: [-4, 25, 0], Chest: [0, 10, 0], Left_UpperLeg: [10, 0, 0] }),
          P({ Right_UpperArm: [-70, -10, -20], Right_LowerArm: [0, -50, 0], Spine: [12, -20, 0], Chest: [4, -10, 0], Left_UpperLeg: [-22, 0, 0], Left_LowerLeg: [12, 0, 0] }, -0.03)];
      const flip = variant % 2 ? -1 : 1;
      return [P({ Right_UpperArm: [-30, 30 * flip, -70], Right_LowerArm: [0, 30, 0], Spine: [-6, 28 * flip, 0], Chest: [0, 14 * flip, 0] }),
        P({ Right_UpperArm: [-60, -55 * flip, -15], Right_LowerArm: [0, -25, 0], Spine: [14, -30 * flip, 0], Chest: [6, -16 * flip, 0], Left_UpperLeg: [-16, 0, 0], Left_LowerLeg: [10, 0, 0] }, -0.035)];
    }
    case 'hammer':
      return [P({ Right_UpperArm: [-40, 10, -60], Right_LowerArm: [0, -40, 0], Left_UpperArm: [-60, 0, 30], Left_LowerArm: [0, -40, 0], Spine: [-14, 12, 0], Chest: [-8, 0, 0] }, 0.02),
        P({ Right_UpperArm: [-40, -10, 20], Right_LowerArm: [0, -100, 0], Left_UpperArm: [-50, 0, 25], Spine: [26, -8, 0], Chest: [12, 0, 0], Left_UpperLeg: [-20, 0, 0], Left_LowerLeg: [24, 0, 0], Right_LowerLeg: [20, 0, 0] }, -0.07)];
    case 'shield':
      if (atk || slot === 'Q')
        return [P({ Left_UpperArm: [20, 30, 10], Spine: [-6, -20, 0], Chest: [0, -10, 0] }),
          P({ Left_UpperArm: [-30, -20, 25], Left_LowerArm: [0, 40, 0], Spine: [16, 22, 0], Chest: [8, 10, 0], Left_UpperLeg: [-18, 0, 0] }, -0.05)];
      return [P({ Spine: [-8, 0, 0], Left_UpperArm: [10, 0, 0] }, 0.02), P({ Spine: [20, 0, 0], Left_UpperArm: [-30, 0, 10], Left_UpperLeg: [-20, 0, 0] }, -0.06)];
    case 'dual': {
      const flip = variant % 2 ? -1 : 1;
      return [P({ Right_UpperArm: [20, 25, -20], Left_UpperArm: [20, -25, 20], Spine: [-4, 20 * flip, 0] }),
        P({ Right_UpperArm: [-75, -30 * flip, -10], Right_LowerArm: [0, -40, 0], Left_UpperArm: [-60, 30 * flip, 10], Left_LowerArm: [0, 40, 0], Spine: [16, -25 * flip, 0], Left_UpperLeg: [-14, 0, 0] }, -0.04)];
    }
    case 'bow':
      return [P({ Left_UpperArm: [-70, 25, 50], Left_LowerArm: [0, 30, 0], Right_UpperArm: [-75, -30, -60], Right_LowerArm: [0, 120, 0], Spine: [0, -35, 0], Chest: [0, -15, 0], Head: [0, 35, 0] }),
        P({ Left_UpperArm: [-72, 25, 50], Left_LowerArm: [0, 30, 0], Right_UpperArm: [-60, -50, -70], Right_LowerArm: [0, 40, 0], Spine: [-4, -35, 0], Chest: [0, -15, 0], Head: [0, 35, 0] })];
    case 'cannon':
      return [P({ Spine: [-6, 0, 0], Right_UpperArm: [-30, 0, -10], Right_LowerArm: [0, 40, 0] }),
        P({ Spine: [-14, 0, 0], Chest: [-8, 0, 0], Right_UpperArm: [-10, 0, 0], Left_UpperLeg: [12, 0, 0], Right_UpperLeg: [12, 0, 0] }, -0.03)];
    case 'staff':
      if (atk) return [P({ Right_UpperArm: [-30, 0, -20], Right_LowerArm: [0, -20, 0], Spine: [-4, 12, 0] }), P({ Right_UpperArm: [-75, -10, -30], Right_LowerArm: [0, -50, 0], Spine: [10, -10, 0] })];
      return [P({ Left_UpperArm: [-60, 20, 20], Left_LowerArm: [0, -40, 0], Right_UpperArm: [-20, 0, -10], Spine: [-8, 18, 0] }),
        P({ Left_UpperArm: [-85, -20, 40], Left_LowerArm: [0, 30, 0], Right_UpperArm: [-30, 0, -20], Spine: [12, -16, 0], Left_UpperLeg: [-14, 0, 0] }, -0.02)];
    case 'orb':
    case 'conductor':
    default: {
      const big = slot === 'R';
      if (atk) return [P({ Right_UpperArm: [-30, 20, -20], Right_LowerArm: [0, -10, 0], Spine: [-4, 14, 0] }), P({ Right_UpperArm: [-80, -10, -30], Right_LowerArm: [0, -60, 0], Spine: [8, -10, 0] })];
      return [P({ Left_UpperArm: [-30, 0, big ? 80 : 30], Right_UpperArm: [-30, 0, big ? -80 : -30], Left_LowerArm: [0, -30, 0], Right_LowerArm: [0, 30, 0], Spine: [-10, 0, 0], Head: [-10, 0, 0] }, 0.02),
        P({ Left_UpperArm: [-80, -20, 30], Right_UpperArm: [-80, 20, -30], Left_LowerArm: [0, 40, 0], Right_LowerArm: [0, -40, 0], Spine: [14, 0, 0], Left_UpperLeg: [-14, 0, 0] }, -0.03)];
    }
  }
}

export function hitPose(k) {
  // 피격: 상체가 짧게 뒤로 젖혀짐 (k: 1→0 감쇠)
  return P({ Spine: [-10 * k, 4 * k, 0], Chest: [-6 * k, 0, 0], Head: [-12 * k, 0, 0] }, 0.01 * k);
}
export function deathPose(k) {
  return P({ Spine: [-30 * k, 10 * k, 0], Chest: [-14 * k, 0, 0], Head: [-20 * k, 0, 0],
    Left_UpperArm: [-30 * k, 0, 40 * k], Right_UpperArm: [-30 * k, 0, -30 * k],
    Left_UpperLeg: [-50 * k, 0, -10 * k], Right_UpperLeg: [-30 * k, 0, 10 * k], Left_LowerLeg: [60 * k, 0, 0], Right_LowerLeg: [50 * k, 0, 0] });
}
export function recallPose(k, t) {
  // 귀환: 한쪽 무릎 꿇고 손 모아 집중
  return P({ Spine: [10 * k, 0, 0], Head: [12 * k, 0, 0],
    Left_UpperArm: [-60 * k, -30 * k, 35 * k], Right_UpperArm: [-60 * k, 30 * k, -35 * k], Left_LowerArm: [0, -60 * k, 0], Right_LowerArm: [0, 60 * k, 0],
    Left_UpperLeg: [-60 * k, 0, 0], Left_LowerLeg: [70 * k, 0, 0], Right_UpperLeg: [20 * k, 0, 0], Right_LowerLeg: [90 * k, 0, 0], Right_Foot: [-20 * k, 0, 0] },
  -0.22 * k + Math.sin(t * 2) * 0.004 * k);
}
export function idleBreath(t, arche) {
  const b = Math.sin(t * 1.8);
  return P({ Spine: [b * 1.2, 0, 0], Chest: [b * 1.5, 0, 0], Head: [-b * 1.0, Math.sin(t * 0.37) * 4, 0],
    Left_UpperArm: [0, 0, b * 1.5], Right_UpperArm: [0, 0, -b * 1.5] }, b * 0.004);
}
