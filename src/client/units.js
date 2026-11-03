// 유닛 외형/애니메이션 뷰. 챔피언 = 리깅 모델 + 절차 애니메이션, 미니언·몬스터 = 절차 조립 모델(임시 자산)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createChampionVisual } from '../render/champVisual.js';
import { basePose, locomotion, actionPose, idleBreath, hitPose, deathPose, recallPose, Pose, isUpper } from '../render/rig.js';
import { buildTurret, buildNexus } from '../render/structures.js';
import { patchFow } from '../render/terrain.js';
import { TEAM_COLORS } from '../map/layout.js';
import { groundHeight } from '../map/grid.js';

const D2R = Math.PI / 180;
function lerpAngle(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }

// 발밑 표시: 팀 고리 + 접지 그림자 (캐릭터 고유색은 유지, 팀은 고리/체력바로 구분)
const blobTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  const ctx = cv.getContext('2d'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function makeFoot(r, color, ring = true) {
  const g = new THREE.Group();
  const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  blob.scale.setScalar(r * 2.6); blob.position.y = 0.03; blob.renderOrder = 1;
  g.add(blob);
  if (ring) {
    const rm = new THREE.Mesh(new THREE.RingGeometry(r * 0.95, r * 1.12, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    rm.position.y = 0.05; rm.renderOrder = 2;
    g.add(rm);
    g.userData.ring = rm;
  }
  return g;
}

class BaseView {
  constructor(u) { this.u = u; this.root = new THREE.Group(); this.vis = true; this.removeAt = null; }
  setVisible(v) { this.root.visible = v; }
  headY() { return 2.2; }
}

// ---------------- 챔피언 ----------------
export class ChampionView extends BaseView {
  constructor(u, playerTeam, isPlayer) {
    super(u);
    const v = createChampionVisual(u.def);
    this.v = v;
    this.root.add(v.root);
    const color = isPlayer ? 0xf2d26a : u.team === playerTeam ? 0x4ab0ff : 0xff4a3a;
    this.foot = makeFoot(0.62, color);
    this.root.add(this.foot);
    this.phase = 0; this.facing = u.facing; this.deadT = 0; this.hitK = 0; this.lastHp = u.hp;
    this.speedSm = 0; this.lean = 0; this.prevFacing = u.facing;
    this.mats = [];
    v.model.traverse((o) => { if (o.isMesh) this.mats.push(o.material); });
    this.opacity = 1;
    this.headH = 2.15 * u.def.body[1];
  }
  headY() { return this.headH; }
  setOpacity(a) {
    if (Math.abs(a - this.opacity) < 0.01) return;
    this.opacity = a;
    for (const m of this.mats) { m.transparent = a < 0.99; m.opacity = a; m.depthWrite = a > 0.99; }
  }
  update(dt, t, alpha) {
    const u = this.u, v = this.v, arche = u.def.arche;
    // 위치·방향
    const x = u.x, z = u.z;
    let y = groundHeight(x, z);
    if (y < -0.3) y = Math.max(y, -0.45); // 강에서는 살짝 잠김(얕은 물)
    this.root.position.set(x, y, z);
    // 회전: 급회전 시 뒤틀림 방지 위해 각속도 제한 + 기울기
    const prev = this.facing;
    this.facing = lerpAngle(this.facing, u.facing, 1 - Math.exp(-dt * 18));
    let dAng = this.facing - prev; while (dAng > Math.PI) dAng -= Math.PI * 2; while (dAng < -Math.PI) dAng += Math.PI * 2;
    this.lean += ((THREE.MathUtils.clamp(dAng / Math.max(dt, 1e-3), -8, 8) * 1.2) - this.lean) * Math.min(1, dt * 8);
    v.root.rotation.y = this.facing;
    // 이동 속도 → 보폭/재생속도 (발 미끄러짐 감소)
    const sp = u.moving ? u.speedNow : 0;
    this.speedSm += (sp - this.speedSm) * Math.min(1, dt * 10);
    const speedN = THREE.MathUtils.clamp(this.speedSm / 3.3, 0, 1.25);
    const stride = v.rig.legLen * 3.1 * u.def.body[1]; // 한 주기(두 걸음) 이동 거리
    this.phase += (this.speedSm / stride) * Math.PI * 2 * dt;
    const pose = basePose(arche);
    if (u.dead) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.6);
      pose.addPose(deathPose(k));
      v.container.rotation.x = -k * 1.25;
      v.container.position.y = -k * 0.25 - Math.max(0, this.deadT - 2.2) * 0.4;
      this.foot.visible = false;
      v.rig.apply(pose);
      return;
    }
    this.deadT = 0; v.container.rotation.x = 0; v.container.position.y = 0; this.foot.visible = true;
    const moveW = Math.min(1, speedN * 1.5);
    pose.addPose(idleBreath(t, arche), 1 - moveW);
    if (speedN > 0.02) pose.addPose(locomotion(this.phase, Math.min(1.1, speedN), arche, v.rig.legLen));
    // 행동
    const a = u.action;
    if (a && (a.kind === 'attack' || a.kind === 'cast')) {
      const at = a.t + alpha;
      const total = a.channelUntil ? Math.max(a.total, at + 0.2) : a.total;
      let ap = actionPose(arche, a.kind, a.slot, Math.min(at, total), a.windup, total, a.variant || 0);
      if (a.channelUntil) ap = actionPose(arche, 'attack', null, a.windup + (at % 0.17) * 0.6, a.windup, a.windup + 0.2, 0);
      // 이동 중 공격/시전: 상체만 덮어쓰기
      if (speedN > 0.1) { const up = pose.clone(); up.addPose(ap); pose.blendTo(up, 1, isUpper); }
      else pose.addPose(ap);
    }
    // 귀환
    if (u.recall) pose.blendTo(basePose(arche).addPose(recallPose(1, t)), Math.min(1, (u.sim.time - u.recall.start) * 4));
    // 피격 반응
    if (u.hp < this.lastHp - 1) this.hitK = 1;
    this.lastHp = u.hp;
    if (this.hitK > 0) { pose.addPose(hitPose(this.hitK)); this.hitK = Math.max(0, this.hitK - dt * 6); }
    // 회전 기울기
    pose.add('Spine', 0, 0, -this.lean * 2.5);
    pose.add('Hips', 0, 0, this.lean * 1.2);
    // 기절: 비틀거림
    if (u.has('stun')) { pose.add('Head', Math.sin(t * 9) * 8, Math.sin(t * 7) * 10, 0); pose.add('Spine', 6, 0, Math.sin(t * 6) * 5); }
    v.rig.apply(pose);
    // 공중에 뜸 / 도약
    let lift = 0;
    const air = u.status.find((s) => s.type === 'airborne' && s.until > u.sim.time);
    if (air) { const k = (u.sim.time - air.start) / air.dur; lift = Math.sin(Math.PI * k) * 1.6; v.container.rotation.x = Math.sin(Math.PI * k) * 0.5; }
    if (u.dash && u.dash.leap) { const k = u.dash.t / u.dash.dur; lift = Math.sin(Math.PI * k) * 2.0; }
    // 발이 지면 아래로 내려가지 않도록 보정
    v.container.position.y = 0;
    const gl = v.rig.groundLift();
    this.gLift = (this.gLift || 0) + (gl - (this.gLift || 0)) * Math.min(1, dt * 30);
    v.container.position.y = lift + this.gLift;
    // 부유 장치
    for (const f of v.floats) {
      f.obj.position.y = (f.instrument ? 1.15 : 1.3) + Math.sin(t * 2) * 0.05;
      if (f.r1) {
        f.r1.rotation.z = t * 0.8; f.r2.rotation.y = t * 1.1;
        f.planets.forEach((pl, k) => { const ph = t * (1 + k * 0.4) + k * 2; pl.position.set(Math.cos(ph) * 0.38, Math.sin(ph) * 0.1, Math.sin(ph) * 0.38); });
        if (a && a.kind === 'cast') f.obj.scale.setScalar(1 + Math.sin(Math.min(1, a.t / 0.4) * Math.PI) * 0.4); else f.obj.scale.setScalar(1);
      }
      if (f.instrument) { f.obj.rotation.y = Math.sin(t * 1.3) * 0.3; f.obj.position.x = 0.5 + Math.sin(t * 0.9) * 0.05; }
    }
    // 망토 2차 움직임
    for (const c of v.capes) c.obj.rotation.x = c.base - speedN * 0.5 - Math.sin(t * 3 + this.phase) * 0.04 * (1 + speedN);
    // 발밑 고리: 덤불 안이면 점선 느낌으로 흐리게
    this.foot.userData.ring.material.opacity = u.brush ? 0.45 : 0.85;
  }
}

// 잔영 (방지욱 W)
export class DecoyView extends BaseView {
  constructor(u) {
    super(u);
    const v = createChampionVisual(u.def);
    this.v = v;
    v.root.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x8a5aff, transparent: true, opacity: 0.45, depthWrite: false }); } });
    this.root.add(v.root);
    this.phase = 0;
  }
  update(dt, t) {
    const u = this.u;
    this.root.position.set(u.x, groundHeight(u.x, u.z), u.z);
    this.v.root.rotation.y = u.facing;
    this.phase += dt * 9;
    const p = basePose(u.def.arche).addPose(locomotion(this.phase, 1, u.def.arche, this.v.rig.legLen));
    this.v.rig.apply(p);
  }
}

// ---------------- 미니언 (절차 조립) ----------------
const C = (h) => new THREE.Color(h);
function vcol(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const cc = fn(p.getX(i), p.getY(i), p.getZ(i)); c.set([cc.r, cc.g, cc.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const minionMats = {};
function mMat(key) { return minionMats[key] || (minionMats[key] = patchFow(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25 }))); }
const minionGeoCache = {};
function minionParts(kind, team) {
  const key = kind + team;
  if (minionGeoCache[key]) return minionGeoCache[key];
  const tc = TEAM_COLORS[team];
  const metal = team === 0 ? 0x8a9ab0 : 0x9a8a80;
  const parts = { body: [], legL: [], legR: [], armR: [], armL: [], head: [] };
  if (kind === 'melee') {
    parts.body.push(vcol(new THREE.CylinderGeometry(0.26, 0.3, 0.42, 8).translate(0, 0.62, 0), (x, y) => C(metal).multiplyScalar(0.8 + (y - 0.4))));
    parts.body.push(vcol(new THREE.CylinderGeometry(0.31, 0.31, 0.08, 8).translate(0, 0.5, 0), () => C(tc.main)));
    parts.head.push(vcol(new THREE.SphereGeometry(0.2, 10, 8).translate(0, 0.95, 0), () => C(metal)));
    parts.head.push(vcol(new THREE.BoxGeometry(0.05, 0.12, 0.3).translate(0, 1.15, -0.02), () => C(tc.main)));
    parts.head.push(vcol(new THREE.BoxGeometry(0.26, 0.04, 0.05).translate(0, 0.96, 0.18), () => C(team === 0 ? 0x9ae0ff : 0xffb08a)));
    parts.armR.push(vcol(new THREE.BoxGeometry(0.06, 0.06, 0.5).translate(0, 0, 0.25), () => C(0xd0d4da)));
    parts.armL.push(vcol(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 10).rotateZ(Math.PI / 2).translate(0, 0, 0.05), () => C(tc.main)));
  } else if (kind === 'caster') {
    parts.body.push(vcol(new THREE.ConeGeometry(0.3, 0.7, 8).translate(0, 0.45, 0), (x, y) => C(tc.main).multiplyScalar(0.55 + y * 0.4)));
    parts.head.push(vcol(new THREE.SphereGeometry(0.17, 10, 8).translate(0, 0.9, 0), () => C(0xd8c8a8)));
    parts.head.push(vcol(new THREE.ConeGeometry(0.2, 0.32, 8).translate(0, 1.1, 0), () => C(tc.main).multiplyScalar(0.7)));
    parts.armR.push(vcol(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 5).rotateX(Math.PI / 2).translate(0, 0, 0.3), () => C(0x6a4a2a)));
    parts.armR.push(vcol(new THREE.OctahedronGeometry(0.08).translate(0, 0, 0.66), () => C(tc.light)));
  } else {
    // 공성: 바퀴 달린 포차
    parts.body.push(vcol(new THREE.BoxGeometry(0.8, 0.35, 1.0).translate(0, 0.45, 0), (x, y) => C(0x6a4a30).multiplyScalar(0.8 + y * 0.3)));
    parts.body.push(vcol(new THREE.CylinderGeometry(0.15, 0.2, 0.9, 10).rotateX(Math.PI / 2).translate(0, 0.8, 0.15), () => C(metal)));
    parts.body.push(vcol(new THREE.BoxGeometry(0.84, 0.08, 1.04).translate(0, 0.64, 0), () => C(tc.main)));
    for (const [x, z] of [[-0.45, 0.35], [0.45, 0.35], [-0.45, -0.35], [0.45, -0.35]]) parts.legL.push(vcol(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12).rotateZ(Math.PI / 2).translate(x, 0.2, z), () => C(0x4a3a2a)));
  }
  if (kind !== 'siege') {
    parts.legL.push(vcol(new THREE.BoxGeometry(0.1, 0.4, 0.12).translate(0, -0.2, 0), () => C(0x3a3a40)));
    parts.legR.push(vcol(new THREE.BoxGeometry(0.1, 0.4, 0.12).translate(0, -0.2, 0), () => C(0x3a3a40)));
  }
  const out = {};
  for (const k in parts) out[k] = parts[k].length ? mergeGeometries(parts[k]) : null;
  minionGeoCache[key] = out;
  return out;
}
export class MinionView extends BaseView {
  constructor(u, playerTeam) {
    super(u);
    const kind = u.minionKind;
    const P = minionParts(kind, u.team);
    const mat = mMat('m');
    this.body = new THREE.Group();
    this.root.add(this.body);
    const mk = (g, x = 0, y = 0, z = 0) => { if (!g) return null; const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = true; this.body.add(m); return m; };
    this.torso = mk(P.body); this.head = mk(P.head);
    if (kind === 'siege') { this.wheels = mk(P.legL); }
    else { this.legL = mk(P.legL, -0.12, 0.42, 0); this.legR = mk(P.legR, 0.12, 0.42, 0); }
    this.armR = mk(P.armR, kind === 'caster' ? 0.22 : 0.3, 0.68, 0.05);
    this.armL = mk(P.armL, -0.32, 0.65, 0.1);
    const s = kind === 'siege' ? 1.0 : 1.0;
    this.body.scale.setScalar(s);
    this.root.add(makeFoot(u.r, u.team === playerTeam ? 0x4ab0ff : 0xff4a3a, false));
    this.phase = Math.random() * 6; this.facing = u.facing; this.deadT = 0;
  }
  headY() { return this.u.minionKind === 'siege' ? 1.3 : 1.45; }
  update(dt, t, alpha) {
    const u = this.u;
    this.root.position.set(u.x, Math.max(-0.45, groundHeight(u.x, u.z)), u.z);
    this.facing = lerpAngle(this.facing, u.facing, 1 - Math.exp(-dt * 14));
    this.body.rotation.y = this.facing;
    if (u.dead) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.4);
      this.body.rotation.x = -k * 1.4; this.body.position.y = -k * 0.2 - Math.max(0, this.deadT - 1) * 0.6;
      return;
    }
    const sp = u.moving ? u.speedNow : 0;
    this.phase += sp * dt * 3.2;
    const sw = Math.sin(this.phase) * Math.min(1, sp / 2) * 0.7;
    if (this.legL) { this.legL.rotation.x = sw; this.legR.rotation.x = -sw; }
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * Math.min(1, sp);
    let atk = 0;
    if (u.action) { const a = u.action, at = a.t + alpha; atk = at < a.windup ? -(at / a.windup) : Math.max(0, 1 - (at - a.windup) / 0.2); if (at >= a.windup) atk = 1 - Math.min(1, (at - a.windup) / 0.25); }
    if (this.armR) this.armR.rotation.x = -atk * 1.2 + sw * 0.4;
    if (this.torso && u.minionKind === 'siege' && u.action) this.torso.position.z = -Math.max(0, atk) * 0.1;
    this.body.rotation.x = u.hitFlash > 0 ? -0.15 : 0;
  }
}

// ---------------- 정글 몬스터 (절차 조립) ----------------
function monsterModel(kind) {
  const g = new THREE.Group();
  const mat = mMat('mon');
  const add = (geo, fn, pos = [0, 0, 0], parent = g) => { const m = new THREE.Mesh(vcol(geo, fn), mat); m.position.set(...pos); m.castShadow = true; parent.add(m); return m; };
  const parts = {};
  if (kind === 'golem') {
    parts.body = add(new THREE.DodecahedronGeometry(0.85, 1).scale(1.1, 1, 0.9), (x, y) => (y > 0.4 ? C(0x5a7a3a) : C(0x5a6470)).multiplyScalar(0.85 + Math.random() * 0.15), [0, 1.3, 0]);
    parts.head = add(new THREE.DodecahedronGeometry(0.42, 0), () => C(0x66707c), [0, 2.15, 0.25]);
    add(new THREE.SphereGeometry(0.08, 6, 4), () => C(0xb8ff6a), [0.15, 0.05, 0.36], parts.head);
    add(new THREE.SphereGeometry(0.08, 6, 4), () => C(0xb8ff6a), [-0.15, 0.05, 0.36], parts.head);
    parts.armL = add(new THREE.DodecahedronGeometry(0.4, 0).scale(0.8, 1.6, 0.8).translate(0, -0.5, 0), () => C(0x5a6470), [-0.95, 1.6, 0]);
    parts.armR = add(new THREE.DodecahedronGeometry(0.4, 0).scale(0.8, 1.6, 0.8).translate(0, -0.5, 0), () => C(0x5a6470), [0.95, 1.6, 0]);
    parts.legL = add(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 6).translate(0, -0.3, 0), () => C(0x4a5460), [-0.4, 0.6, 0]);
    parts.legR = add(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 6).translate(0, -0.3, 0), () => C(0x4a5460), [0.4, 0.6, 0]);
    g.userData.h = 2.7;
  } else if (kind === 'wolves' || kind === 'wolf') {
    const s = kind === 'wolves' ? 1.3 : 0.85;
    const fur = kind === 'wolves' ? 0x5a5a64 : 0x6a6a70;
    parts.body = add(new THREE.CapsuleGeometry(0.28 * s, 0.7 * s, 4, 8).rotateX(Math.PI / 2), (x, y) => C(fur).multiplyScalar(0.7 + y * 0.6 + 0.3), [0, 0.65 * s, 0]);
    parts.head = add(new THREE.ConeGeometry(0.22 * s, 0.55 * s, 6).rotateX(Math.PI / 2), () => C(fur), [0, 0.85 * s, 0.62 * s]);
    add(new THREE.ConeGeometry(0.07 * s, 0.18 * s, 4), () => C(0x3a3a40), [0.1 * s, 0.18 * s, -0.08 * s], parts.head);
    add(new THREE.ConeGeometry(0.07 * s, 0.18 * s, 4), () => C(0x3a3a40), [-0.1 * s, 0.18 * s, -0.08 * s], parts.head);
    add(new THREE.SphereGeometry(0.035 * s, 6, 4), () => C(0xffd06a), [0.09 * s, 0.07 * s, 0.1 * s], parts.head);
    add(new THREE.SphereGeometry(0.035 * s, 6, 4), () => C(0xffd06a), [-0.09 * s, 0.07 * s, 0.1 * s], parts.head);
    parts.tail = add(new THREE.ConeGeometry(0.08 * s, 0.5 * s, 5).rotateX(-Math.PI / 2 - 0.5), () => C(fur), [0, 0.75 * s, -0.6 * s]);
    parts.legs = [];
    for (const [x, z] of [[-0.16, 0.32], [0.16, 0.32], [-0.16, -0.32], [0.16, -0.32]]) parts.legs.push(add(new THREE.CylinderGeometry(0.05 * s, 0.04 * s, 0.5 * s, 5).translate(0, -0.25 * s, 0), () => C(0x44444a), [x * s, 0.5 * s, z * s]));
    g.userData.h = 1.2 * s;
  } else if (kind === 'drake') {
    parts.body = add(new THREE.CapsuleGeometry(0.6, 1.4, 4, 10).rotateX(Math.PI / 2), (x, y) => (y < 0 ? C(0xd8b070) : C(0x3a7a6a)).multiplyScalar(0.8 + Math.random() * 0.2), [0, 1.4, 0]);
    parts.neck = add(new THREE.CylinderGeometry(0.22, 0.35, 1.1, 8).rotateX(-0.9), () => C(0x3a7a6a), [0, 2.0, 1.0]);
    parts.head = add(new THREE.ConeGeometry(0.32, 0.9, 7).rotateX(Math.PI / 2), () => C(0x3a7a6a), [0, 2.5, 1.6]);
    add(new THREE.ConeGeometry(0.06, 0.4, 4).rotateX(-0.6), () => C(0xe8d8b0), [0.15, 0.25, -0.2], parts.head);
    add(new THREE.ConeGeometry(0.06, 0.4, 4).rotateX(-0.6), () => C(0xe8d8b0), [-0.15, 0.25, -0.2], parts.head);
    add(new THREE.SphereGeometry(0.06, 6, 4), () => C(0xff7a2a), [0.14, 0.08, 0.15], parts.head);
    add(new THREE.SphereGeometry(0.06, 6, 4), () => C(0xff7a2a), [-0.14, 0.08, 0.15], parts.head);
    const wing = (side) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(2.0 * side, 0.6); sh.lineTo(2.2 * side, -0.4); sh.lineTo(1.2 * side, -0.6); sh.lineTo(0.4 * side, -0.4); sh.lineTo(0, 0); return add(new THREE.ShapeGeometry(sh).rotateX(Math.PI / 2), () => C(0x2a5a5a), [0.4 * side, 1.9, 0.1]); };
    parts.wingL = wing(1); parts.wingR = wing(-1);
    parts.wingL.material = parts.wingR.material = patchFow(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }));
    parts.tail = add(new THREE.ConeGeometry(0.3, 1.8, 7).rotateX(-Math.PI / 2), () => C(0x3a7a6a), [0, 1.3, -1.6]);
    parts.legs = [];
    for (const [x, z] of [[-0.4, 0.5], [0.4, 0.5], [-0.4, -0.5], [0.4, -0.5]]) parts.legs.push(add(new THREE.CylinderGeometry(0.14, 0.1, 0.9, 6).translate(0, -0.45, 0), () => C(0x2a5a4a), [x, 1.0, z]));
    g.userData.h = 3.2;
  } else {
    // 협곡 거신: 뿔 달린 거대 석수(石獸)
    parts.body = add(new THREE.DodecahedronGeometry(1.4, 1).scale(1.2, 1, 1.4), (x, y) => (y > 0.6 ? C(0x4a3a6a) : C(0x3a3448)).multiplyScalar(0.85 + Math.random() * 0.15), [0, 2.0, 0]);
    parts.head = add(new THREE.DodecahedronGeometry(0.7, 0).scale(1, 0.9, 1.2), () => C(0x4a3a6a), [0, 2.9, 1.5]);
    for (const sx of [-1, 1]) add(new THREE.ConeGeometry(0.15, 1.2, 6).rotateZ(-sx * 0.9).rotateX(-0.4), () => C(0xe0d0b0), [sx * 0.6, 0.6, 0], parts.head);
    add(new THREE.SphereGeometry(0.1, 6, 4), () => C(0xc06aff), [0.25, 0.1, 0.65], parts.head);
    add(new THREE.SphereGeometry(0.1, 6, 4), () => C(0xc06aff), [-0.25, 0.1, 0.65], parts.head);
    for (let i = 0; i < 5; i++) add(new THREE.OctahedronGeometry(0.3, 0).scale(1, 2, 1), () => C(0xa06aff), [(i - 2) * 0.45, 3.3, -0.3 + Math.abs(i - 2) * 0.2]);
    parts.armL = add(new THREE.CylinderGeometry(0.35, 0.45, 1.8, 7).translate(0, -0.9, 0), () => C(0x3a3448), [-1.5, 2.6, 0.6]);
    parts.armR = add(new THREE.CylinderGeometry(0.35, 0.45, 1.8, 7).translate(0, -0.9, 0), () => C(0x3a3448), [1.5, 2.6, 0.6]);
    parts.legs = [];
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8]]) parts.legs.push(add(new THREE.CylinderGeometry(0.4, 0.5, 1.1, 7).translate(0, -0.55, 0), () => C(0x2a2438), [x, 1.1, z]));
    g.userData.h = 4.2;
  }
  g.userData.parts = parts;
  return g;
}
export class MonsterView extends BaseView {
  constructor(u) {
    super(u);
    const kind = u.monsterKind === 'wolves' && !u.big ? 'wolf' : u.monsterKind;
    this.kind = kind;
    this.model = monsterModel(kind);
    this.root.add(this.model);
    this.root.add(makeFoot(u.r, 0xd8b05a, true));
    this.phase = Math.random() * 6; this.facing = u.facing; this.deadT = 0;
  }
  headY() { return this.model.userData.h + 0.3; }
  update(dt, t, alpha) {
    const u = this.u, P = this.model.userData.parts;
    this.root.position.set(u.x, Math.max(-0.45, groundHeight(u.x, u.z)), u.z);
    this.facing = lerpAngle(this.facing, u.facing, 1 - Math.exp(-dt * 8));
    this.model.rotation.y = this.facing;
    if (u.dead) { this.deadT += dt; const k = Math.min(1, this.deadT / 0.6); this.model.rotation.z = k * 1.3; this.model.position.y = -Math.max(0, this.deadT - 1.2) * 0.8; return; }
    const sp = u.moving ? u.speedNow : 0;
    this.phase += dt * (sp * 2.6 + 0.0);
    const sw = Math.sin(this.phase) * Math.min(1, sp / 2);
    const br = Math.sin(t * 1.6) * 0.03;
    let atk = 0;
    if (u.action) { const a = u.action, at = a.t + alpha; atk = at < a.windup ? -(at / a.windup) * 0.6 : 1 - Math.min(1, (at - a.windup) / 0.3); }
    if (P.legs) P.legs.forEach((l, i) => (l.rotation.x = sw * 0.6 * (i % 2 ? -1 : 1) * (i < 2 ? 1 : -1)));
    if (P.legL) { P.legL.rotation.x = sw * 0.5; P.legR.rotation.x = -sw * 0.5; }
    if (P.armL) { P.armL.rotation.x = -sw * 0.4 - Math.max(0, atk) * 1.4; P.armR.rotation.x = sw * 0.4 - Math.max(0, atk) * 1.4 + Math.min(0, atk); }
    if (P.head) P.head.rotation.x = -atk * 0.3 + br;
    if (P.tail) P.tail.rotation.y = Math.sin(t * 4) * 0.3;
    if (P.wingL) { const f = Math.sin(t * (u.action ? 8 : 2)) * 0.25; P.wingL.rotation.z = f; P.wingR.rotation.z = -f; }
    if (P.body) P.body.position.y = (P.body.userData.y0 ??= P.body.position.y) + br + Math.abs(sw) * 0.05;
  }
}

// ---------------- 구조물 ----------------
export class TurretView extends BaseView {
  constructor(u) {
    super(u);
    this.m = buildTurret(u.team);
    this.root.add(this.m);
    this.root.position.set(u.x, groundHeight(u.x, u.z), u.z);
    this.downT = 0;
  }
  headY() { return 6.0; }
  update(dt, t) {
    const u = this.u, d = this.m.userData;
    if (u.dead) {
      this.downT += dt;
      const k = Math.min(1, this.downT / 1.2);
      d.core.visible = false; d.glow.visible = false;
      this.m.children.forEach((c, i) => { if (i > 0) { c.position.y = -k * 3.2; c.rotation.z = k * 0.3 * (i % 2 ? 1 : -1); } });
      this.m.children[0].scale.y = 1 - k * 0.6;
      return;
    }
    d.core.rotation.y = t * 1.2;
    d.core.position.y = 4.35 + Math.sin(t * 2) * 0.08;
    // 공격 중 코어 밝아짐
    const firing = u.action && u.action.t < 0.3;
    d.core.material.emissiveIntensity = firing ? 2.2 : 0.9;
    d.glow.intensity = firing ? 5 : 2.5;
  }
}
export class NexusView extends BaseView {
  constructor(u) {
    super(u);
    this.m = buildNexus(u.team);
    this.root.add(this.m);
    this.root.position.set(u.x, 0, u.z);
    this.downT = 0;
  }
  headY() { return 7.6; }
  update(dt, t) {
    const u = this.u, d = this.m.userData;
    if (u.dead) {
      this.downT += dt;
      const k = Math.min(1, this.downT / 2);
      d.crystal.position.y = 4 - k * 3.4; d.crystal.rotation.z = k * 0.8; d.crystal.material.emissiveIntensity = 0.9 * (1 - k);
      d.shards.forEach((s) => { s.position.y = Math.max(0.3, s.position.y - dt * 4); });
      return;
    }
    d.crystal.rotation.y = t * 0.5;
    d.crystal.position.y = 4 + Math.sin(t * 1.2) * 0.15;
    d.ring.rotation.z = t * 0.4;
    d.shards.forEach((s, i) => { const a = s.userData.a + t * 0.7; s.position.set(Math.cos(a) * 2.4, 4 + Math.sin(t * 2 + i) * 0.4, Math.sin(a) * 2.4); s.rotation.y = t * 2; });
    d.crystal.material.emissiveIntensity = 0.9 + (u.hitFlash > 0 ? 1.2 : 0);
  }
}
