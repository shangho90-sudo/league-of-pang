// 챔피언 AI — 같은 명령 API와 같은 시야 규칙(팀이 보는 적만)을 사용한다.
import { LANES, BASES, PITS } from '../map/layout.js';
import { isWalkable, nearestWalkable } from '../map/grid.js';
import { BUILDS, ITEM_BY_ID } from '../data/items.js';
import { dist } from './sim.js';

function laneArc(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return acc;
}
function project(pts, acc, x, z) {
  let best = Infinity, bs = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / l2; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
    if (d < best) { best = d; bs = acc[i] + Math.sqrt(l2) * t; }
  }
  return { s: bs, d: best };
}
function pointAt(pts, acc, s) {
  s = Math.max(0, Math.min(acc[acc.length - 1], s));
  for (let i = 0; i < pts.length - 1; i++) if (s <= acc[i + 1]) { const t = (s - acc[i]) / (acc[i + 1] - acc[i]); return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, z: pts[i].z + (pts[i + 1].z - pts[i].z) * t }; }
  return pts[pts.length - 1];
}

export class ChampionAI {
  constructor(sim, u) {
    this.sim = sim; this.u = u;
    this.next = sim.rand() * 0.3;
    const role = u.def.roles;
    this.role = role.includes('support') ? 'support' : role.includes('marksman') ? 'marksman' : role.includes('tank') ? 'tank' : role.includes('assassin') ? 'assassin' : role.includes('mage') ? 'mage' : role.includes('jungle') ? 'jungle' : 'fighter';
    this.build = [...(BUILDS[u.lane === 'jungle' ? 'jungle' : this.role] || BUILDS.fighter)];
    this.lanes = {};
    for (const k of ['top', 'mid', 'bot']) { const pts = u.team === 0 ? LANES[k] : [...LANES[k]].reverse(); this.lanes[k] = { pts, acc: laneArc(pts) }; }
    this.prev = new Map();
    this.lastMoveCheck = { t: 0, x: u.x, z: u.z };
    this.watchdogKicks = 0;
    this.campTarget = null;
    this.mode = 'lane';
    this.ranged = !!u.def.stats.ranged;
  }
  think(dt) {
    const sim = this.sim, u = this.u;
    this.next -= dt;
    if (this.next > 0) return;
    this.next = 0.22 + sim.rand() * 0.08;
    // 속도 추정 (예측 조준용)
    const vel = new Map();
    for (const e of sim.visibleEnemies(u.team)) { const p = this.prev.get(e); if (p) vel.set(e, { x: (e.x - p.x) / 0.25, z: (e.z - p.z) / 0.25 }); }
    this.prev = new Map(sim.visibleEnemies(u.team).map((e) => [e, { x: e.x, z: e.z }]));
    this.vel = vel;
    if (u.dead) { this.shop(); return; }
    if (sim.inShop(u)) this.shop();
    if (u.recall) { if (this.enemyChampsNear(7).length) sim.cancelRecall(u); else return; }
    if (u.action && u.action.kind === 'cast') return;
    this.watchdog();
    const hpR = u.hp / u.s.hp;
    const base = BASES[u.team];
    const enemies = this.enemyChampsNear(11);
    // 본진에서 회복 대기
    if (dist(u, base.fountain) < 6 && hpR < 0.85 && enemies.length === 0) { u.path = null; return; }
    // 물약
    if (hpR < 0.55 && u.items.includes('potion') && !(u.potion && u.potion.until > sim.time)) sim.cmdUsePotion(u);
    // 후퇴
    const danger = this.dangerScore(enemies);
    if ((hpR < 0.28 && enemies.length) || (hpR < 0.4 && danger > 1.6)) { this.retreat(enemies); return; }
    if (this.underEnemyTurretTargeted()) { this.retreat(enemies); return; }
    // 정글 몬스터에게 맞으며 체력이 낮으면 캠프 밖으로 이탈 (몬스터는 일정 거리에서 복귀)
    const monAggro = sim.units.some((m) => m.kind === 'monster' && !m.dead && m.target === u);
    if (monAggro && hpR < 0.3) { this.retreat([]); return; }
    // 귀환
    const nextItem = this.nextBuy();
    const wantGold = nextItem && u.gold > ITEM_BY_ID[nextItem].cost + 250;
    if ((hpR < 0.3 || (u.mp < u.s.mp * 0.12 && hpR < 0.6) || (wantGold && hpR < 0.7)) && !enemies.length && !sim.inShop(u) && !monAggro) {
      if (!this.enemyChampsNear(12).length && !this.enemyMinionsNear(6).length) { sim.cmdRecall(u); return; }
      this.retreat([]); return;
    }
    // 교전
    if (this.fight(enemies, hpR)) return;
    // 지원 (서포터·정글 로밍)
    if (this.role === 'support' && this.supportAct()) return;
    // 중립 오브젝트
    if (this.objectives()) return;
    if (u.lane === 'jungle' && sim.time < 840) { if (this.jungle()) return; }
    // 중후반: 합류
    if (sim.time > 690 && this.groupUp()) return;
    this.laneAct(u.lane === 'jungle' ? this.gankLane() : u.lane);
  }
  watchdog() {
    const u = this.u, sim = this.sim;
    if (sim.time - this.lastMoveCheck.t > 6) {
      const moved = Math.hypot(u.x - this.lastMoveCheck.x, u.z - this.lastMoveCheck.z);
      const wantsToMove = u.path && u.path.length && !u.target;
      if (moved < 1 && wantsToMove && !u.recall && !u.action) { this.watchdogKicks++; if (globalThis.WD_LOG) console.log('WD', sim.time.toFixed(0), u.def.id + u.team, u.lane, u.x.toFixed(1), u.z.toFixed(1), 'goal', u.goal && u.goal.x.toFixed(1), u.goal && u.goal.z.toFixed(1), 'path', JSON.stringify(u.path), 'tgt', u.target && u.target.name, 'cc', u.cc, 'mode', this.mode); this.mode = 'lane'; this.campTarget = null; const q = nearestWalkable(u.x + (sim.rand() - 0.5) * 3, u.z + (sim.rand() - 0.5) * 3, 6); sim.cmdMove(u, q.x, q.z); }
      this.lastMoveCheck = { t: sim.time, x: u.x, z: u.z };
    }
  }
  enemyChampsNear(r) { return this.sim.visibleEnemies(this.u.team, this.u.x, this.u.z, r).filter((e) => e.kind === 'champion'); }
  enemyMinionsNear(r) { return this.sim.visibleEnemies(this.u.team, this.u.x, this.u.z, r).filter((e) => e.kind === 'minion'); }
  alliesNear(r) { return this.sim.champions.filter((c) => c !== this.u && c.team === this.u.team && !c.dead && dist(c, this.u) < r); }
  dangerScore(enemies) {
    const u = this.u;
    let e = 0, a = u.hp / u.s.hp * u.level;
    for (const x of enemies) e += (x.hp / x.s.hp) * x.level;
    for (const x of this.alliesNear(10)) a += (x.hp / x.s.hp) * x.level;
    return a > 0 ? e / a : 9;
  }
  enemyTurretNear(x, z, pad = 0) { return this.sim.turrets.find((t) => !t.dead && t.team !== this.u.team && Math.hypot(t.x - x, t.z - z) < t.s.range + pad); }
  underEnemyTurretTargeted() { const t = this.enemyTurretNear(this.u.x, this.u.z, 0.5); return t && t.target === this.u; }
  retreat(enemies) {
    const u = this.u, sim = this.sim;
    // 이동기 사용 (후방 대시)
    const away = this.awayDir(enemies);
    if (enemies.length && dist(u, enemies[0]) < 5) {
      for (const s of ['E']) { const sk = u.def.skills[s]; if ((sk.t === 'dir' || sk.t === 'point') && sim.canCast(u, s).ok && ['cha', 'bang', 'jung', 'sagong', 'cho', 'koo'].includes(u.def.id)) { sim.cmdCast(u, s, { point: { x: u.x + away.x * 5, z: u.z + away.z * 5 } }); break; } }
      if (u.def.id === 'koo' && sim.canCast(u, 'W').ok) sim.cmdCast(u, 'W', {});
      if (u.def.id === 'pang' && sim.canCast(u, 'W').ok) sim.cmdCast(u, 'W', { target: u });
    }
    const safe = this.safePoint();
    if (!u.path || !u.goal || Math.hypot(u.goal.x - safe.x, u.goal.z - safe.z) > 3) sim.cmdMove(u, safe.x, safe.z);
  }
  awayDir(enemies) {
    const u = this.u;
    let x = 0, z = 0;
    for (const e of enemies) { const d = Math.max(0.5, dist(u, e)); x += (u.x - e.x) / d; z += (u.z - e.z) / d; }
    const b = BASES[u.team].fountain;
    const bx = b.x - u.x, bz = b.z - u.z, bd = Math.hypot(bx, bz) || 1;
    x += (bx / bd) * 0.8; z += (bz / bd) * 0.8;
    const m = Math.hypot(x, z) || 1;
    return { x: x / m, z: z / m };
  }
  safePoint() {
    const u = this.u;
    const own = this.sim.turrets.filter((t) => !t.dead && t.team === u.team);
    let best = BASES[u.team].fountain, bd = Infinity;
    for (const t of own) {
      // 내 위치보다 본진 쪽에 있는 포탑 중 가까운 곳
      const toBase = Math.hypot(t.x - BASES[u.team].fountain.x, t.z - BASES[u.team].fountain.z);
      const meBase = Math.hypot(u.x - BASES[u.team].fountain.x, u.z - BASES[u.team].fountain.z);
      if (toBase > meBase + 2) continue;
      const d = dist(u, t);
      if (d < bd) { bd = d; best = t; }
    }
    const fb = BASES[u.team].fountain;
    const k = best === fb ? 0 : 2.5;
    const dx = fb.x - best.x, dz = fb.z - best.z, m = Math.hypot(dx, dz) || 1;
    return nearestWalkable(best.x + (dx / m) * k, best.z + (dz / m) * k, 5);
  }
  shop() {
    const u = this.u, sim = this.sim;
    if (!sim.inShop(u)) return;
    let guard = 0;
    while (guard++ < 4) {
      const id = this.nextBuy();
      if (!id) break;
      const it = ITEM_BY_ID[id];
      if (u.gold < it.cost) break;
      if (u.items.length >= 6) {
        // 소모품/하위 아이템 정리
        const cheap = u.items.findIndex((i) => ITEM_BY_ID[i].cost < 500);
        if (cheap < 0) { this.build.shift(); break; }
        sim.cmdSell(u, cheap);
      }
      const r = sim.cmdBuy(u, id);
      if (r.ok) this.build.shift(); else break;
    }
    const pots = u.items.filter((i) => i === 'potion').length;
    if (sim.time < 600 && pots < 1 && u.items.length < 6 && u.gold > 50) sim.cmdBuy(u, 'potion');
  }
  nextBuy() { return this.build[0]; }

  // 교전 판단 + 스킬 사용
  fight(enemies, hpR) {
    const u = this.u, sim = this.sim;
    if (!enemies.length) return false;
    const danger = this.dangerScore(enemies);
    // 대상: 낮은 체력 + 가까움
    let target = null, best = Infinity;
    for (const e of enemies) {
      if (!sim.canTarget(u, e)) continue;
      const s = dist(u, e) * 0.6 + (e.hp / e.s.hp) * 8 - (e.cc ? 3 : 0);
      if (s < best) { best = s; target = e; }
    }
    if (!target) return false;
    const engageRange = this.role === 'tank' || this.role === 'assassin' || this.role === 'fighter' ? 9 : 8;
    const turret = this.enemyTurretNear(target.x, target.z, 1);
    const allyTurretNear = this.sim.turrets.some((t) => !t.dead && t.team === u.team && dist(t, u) < t.s.range);
    const favorable = danger < 1.15 || (target.hp / target.s.hp < 0.35 && hpR > 0.4) || allyTurretNear;
    if (turret && !(target.hp / target.s.hp < 0.25 && hpR > 0.5 && turret.target && turret.target !== u)) {
      // 적 포탑 아래로는 무리하게 추격하지 않음
      if (dist(u, target) > u.s.range + 0.5) return false;
    }
    if (!favorable && dist(u, target) > u.s.range) return false;
    if (dist(u, target) > engageRange + 2) return false;
    // 스킬 사용
    this.useSkills(target, enemies);
    if (u.action && u.action.kind === 'cast') return true;
    // 서포터: 위험한 아군 보호 우선
    if (this.role === 'support') this.supportSkills();
    // 원거리 카이팅
    if (this.ranged) {
      const melee = enemies.find((e) => !e.def.stats.ranged && dist(e, u) < 2.6);
      if (melee && u.attackCd > 0.25 && !(u.action && !u.action.fired)) {
        const away = this.awayDir([melee]);
        const q = { x: u.x + away.x * 2, z: u.z + away.z * 2 };
        if (isWalkable(q.x, q.z)) { sim.cmdMove(u, q.x, q.z); return true; }
      }
    }
    if (u.target !== target) sim.cmdAttack(u, target);
    return true;
  }
  predict(t, time) { const v = this.vel.get(t) || { x: 0, z: 0 }; return { x: t.x + v.x * time, z: t.z + v.z * time }; }
  useSkills(target, enemies) {
    const u = this.u, sim = this.sim;
    const d = dist(u, target);
    const order = ['R', 'E', 'Q', 'W'];
    for (const slot of order) {
      if (!sim.canCast(u, slot).ok) continue;
      const sk = u.def.skills[slot];
      if (slot === 'R') {
        const lowTarget = target.hp / target.s.hp < 0.55;
        const many = enemies.filter((e) => dist(e, target) < 4).length >= 2;
        const supportR = (u.def.id === 'pang' || u.def.id === 'jung' || u.def.id === 'lee') && this.alliesNear(6).length >= 1;
        if (!(lowTarget || many || supportR)) continue;
      }
      const flight = sk.speed ? d / sk.speed : (sk.flight || sk.delay || sk.castTime || 0.2);
      const p = this.predict(target, flight + (sk.castTime || 0));
      switch (sk.t) {
        case 'dir':
          if (u.def.id === 'cha' && slot === 'E') { if (d < 3) sim.cmdCast(u, slot, { point: { x: u.x - (target.x - u.x), z: u.z - (target.z - u.z) } }); continue; }
          if (u.def.id === 'kim' && slot === 'E') { if (d < 3.5) sim.cmdCast(u, slot, { point: p }); continue; }
          if (slot === 'E' && ['koo', 'jung', 'park', 'bang', 'sagong'].includes(u.def.id) && (d < 3 || d > (sk.range || 5) + 1.5)) continue;
          if (d <= (sk.range || 4) + 0.5) { sim.cmdCast(u, slot, { point: p }); return; }
          break;
        case 'point':
          if (u.def.id === 'cho' && slot === 'E' && d < 2.5) continue;
          if (d <= sk.range + (sk.radius || 0) * 0.6) { sim.cmdCast(u, slot, { point: p }); return; }
          break;
        case 'enemy':
          if (d <= sk.range) { sim.cmdCast(u, slot, { target }); return; }
          break;
        case 'self':
          if (u.def.id === 'lee' && slot === 'E' && d > u.s.range) { sim.cmdCast(u, slot, {}); return; }
          if (d < (sk.radius || 3.5) + 1.5 || ['koo', 'cha', 'cho'].includes(u.def.id)) { if (d < 5) { sim.cmdCast(u, slot, {}); return; } }
          break;
        case 'ally': {
          const low = [u, ...this.alliesNear(sk.range)].sort((a, b) => a.hp / a.s.hp - b.hp / b.s.hp)[0];
          if (low.hp / low.s.hp < 0.8) { sim.cmdCast(u, slot, { target: low }); return; }
          break;
        }
      }
    }
  }
  supportSkills() {
    const u = this.u, sim = this.sim;
    for (const slot of ['W', 'E']) {
      const sk = u.def.skills[slot];
      if (!sim.canCast(u, slot).ok) continue;
      const allies = [u, ...this.alliesNear(sk.range || sk.radius || 5)];
      const low = allies.sort((a, b) => a.hp / a.s.hp - b.hp / b.s.hp)[0];
      if (sk.t === 'ally' && low.hp / low.s.hp < 0.7) { sim.cmdCast(u, slot, { target: low }); return true; }
      if (sk.t === 'self' && slot === 'W' && low.hp / low.s.hp < 0.75 && dist(low, u) < sk.radius) { sim.cmdCast(u, slot, {}); return true; }
    }
    return false;
  }
  supportAct() {
    const u = this.u, sim = this.sim;
    if (this.supportSkills()) return true;
    // 공격로의 아군을 따라다님 (봇 우선, 없으면 가장 가까운 아군)
    const mates = sim.champions.filter((c) => c !== u && c.team === u.team && !c.dead && !c.recall);
    if (!mates.length) return false;
    const pref = mates.find((c) => c.lane === u.lane) || mates.sort((a, b) => dist(a, u) - dist(b, u))[0];
    if (dist(pref, BASES[u.team].fountain) < 15) return false;
    const fb = BASES[u.team].fountain;
    const dx = fb.x - pref.x, dz = fb.z - pref.z, m = Math.hypot(dx, dz) || 1;
    const spot = nearestWalkable(pref.x + (dx / m) * 2.5, pref.z + (dz / m) * 2.5, 4);
    // 주변 미니언 막타 / 견제
    const mins = this.enemyMinionsNear(u.s.range + 1);
    const lh = mins.find((m2) => m2.hp < u.s.ad * 1.05);
    if (lh) { sim.cmdAttack(u, lh); return true; }
    if (dist(u, spot) > 2.5) { if (!u.path || !u.goal || Math.hypot(u.goal.x - spot.x, u.goal.z - spot.z) > 2) sim.cmdMove(u, spot.x, spot.z); }
    return true;
  }
  objectives() {
    const u = this.u, sim = this.sim;
    if (sim.time < 300) return false;
    for (const c of sim.camps) {
      if (!c.big || !c.alive) continue;
      const m = c.members.find((x) => !x.dead);
      if (!m) continue;
      const allies = sim.champions.filter((x) => x.team === u.team && !x.dead && dist(x, c.p) < 22).length;
      const enemiesVisible = sim.visibleEnemies(u.team, c.p.x, c.p.z, 14).filter((e) => e.kind === 'champion').length;
      const strong = u.level >= (c.kind === 'colossus' ? 9 : 6);
      const want = strong && (u.lane === 'jungle' || dist(u, c.p) < 26) && (allies >= (c.kind === 'colossus' ? 3 : 2)) && enemiesVisible <= 1 && u.hp > u.s.hp * 0.6;
      if (want) {
        if (dist(u, m) < 12 && sim.canTarget(u, m)) { this.useSkillsOnMonster(m); if (u.target !== m) sim.cmdAttack(u, m); }
        else sim.cmdAttackMove(u, c.p.x, c.p.z);
        return true;
      }
    }
    return false;
  }
  useSkillsOnMonster(m) {
    const u = this.u, sim = this.sim;
    for (const slot of ['Q', 'E', 'W']) {
      const sk = u.def.skills[slot];
      if (!sim.canCast(u, slot).ok || u.mp < sk.cost + 40) continue;
      if ((sk.t === 'dir' && slot !== 'E') || (sk.t === 'point' && slot === 'Q')) { if (dist(u, m) < (sk.range || 4)) { sim.cmdCast(u, slot, { point: { x: m.x, z: m.z } }); return; } }
      if (sk.t === 'self' && slot === 'W' && dist(u, m) < 4) { sim.cmdCast(u, slot, {}); return; }
    }
  }
  jungle() {
    const u = this.u, sim = this.sim;
    // 갱킹 기회
    if (sim.time > 150) {
      const prey = sim.visibleEnemies(u.team).filter((e) => e.kind === 'champion' && e.hp / e.s.hp < 0.55 && dist(e, u) < 26 && !this.enemyTurretNear(e.x, e.z, 1));
      if (prey.length && u.hp > u.s.hp * 0.5) { sim.cmdAttackMove(u, prey[0].x, prey[0].z); this.mode = 'gank'; return true; }
    }
    let c = this.campTarget;
    if (!c || !c.alive || c.members.every((m) => m.dead)) {
      const mine = sim.camps.filter((k) => !k.big && k.alive && (k.team === u.team || sim.time > 300));
      mine.sort((a, b) => dist(u, a.p) - dist(u, b.p));
      c = this.campTarget = mine[0] || null;
    }
    if (!c) return false;
    const m = c.members.filter((x) => !x.dead).sort((a, b) => a.hp - b.hp)[0];
    if (!m) { this.campTarget = null; return false; }
    if (u.hp < u.s.hp * 0.35) return false;
    if (dist(u, m) < 7 && sim.canTarget(u, m)) { this.useSkillsOnMonster(m); if (u.target !== m) sim.cmdAttack(u, m); }
    else if (!u.path || !u.goal || dist(u.goal, c.p) > 2) sim.cmdMove(u, c.p.x, c.p.z);
    return true;
  }
  gankLane() {
    // 정글러 후반 / 캠프 없음: 가장 밀리고 있는 아군 공격로 지원
    const sim = this.sim, u = this.u;
    let worst = 'mid', ws = Infinity;
    for (const k of ['top', 'mid', 'bot']) {
      const L = this.lanes[k];
      let front = 0;
      for (const m of sim.units) if (m.kind === 'minion' && !m.dead && m.team === u.team && m.lane === k) front = Math.max(front, project(L.pts, L.acc, m.x, m.z).s);
      if (front < ws) { ws = front; worst = k; }
    }
    return worst;
  }
  groupUp() {
    const u = this.u, sim = this.sim;
    // 가장 앞선 아군 공격로로 집결하여 포탑/본진 공략
    const alive = sim.champions.filter((c) => c.team === u.team && !c.dead);
    if (alive.length < 3) return false;
    let bestLane = 'mid', bf = -1;
    for (const k of ['top', 'mid', 'bot']) {
      const L = this.lanes[k];
      for (const m of sim.units) if (m.kind === 'minion' && !m.dead && m.team === u.team && m.lane === k) { const s = project(L.pts, L.acc, m.x, m.z).s; if (s > bf) { bf = s; bestLane = k; } }
    }
    if (this.role === 'support') return false;
    this.laneAct(bestLane);
    return true;
  }
  laneAct(laneKey) {
    const u = this.u, sim = this.sim;
    const L = this.lanes[laneKey] || this.lanes.mid;
    const me = project(L.pts, L.acc, u.x, u.z);
    // 아군 미니언 최전선
    let front = -1, enemyFront = Infinity;
    for (const m of sim.units) {
      if (m.kind !== 'minion' || m.dead || m.lane !== laneKey) continue;
      const pr = project(L.pts, L.acc, m.x, m.z);
      if (pr.d > 8) continue;
      if (m.team === u.team) front = Math.max(front, pr.s);
      else if (m.visibleTo[u.team]) enemyFront = Math.min(enemyFront, pr.s);
    }
    // 포탑 기준선
    let ownTurretS = 0;
    for (const t of sim.turrets) if (!t.dead && t.team === u.team && (t.lane === laneKey)) ownTurretS = Math.max(ownTurretS, project(L.pts, L.acc, t.x, t.z).s);
    let enemyTurretS = L.acc[L.acc.length - 1];
    for (const t of sim.turrets) if (!t.dead && t.team !== u.team && (t.lane === laneKey || t.lane === 'nexus')) enemyTurretS = Math.min(enemyTurretS, project(L.pts, L.acc, t.x, t.z).s);
    let want;
    if (front < 0) want = Math.min(ownTurretS + 3, enemyTurretS - 9);
    else want = Math.min(front - (this.ranged ? 2.5 : 1.0), enemyTurretS - (front > enemyTurretS - 8 ? 4 : 8));
    if (enemyFront < Infinity) want = Math.min(want, enemyFront - (this.ranged ? u.s.range - 0.5 : 1));
    // 우리 미니언이 포탑을 공격 중이면 함께 공격
    const et = sim.turrets.find((t) => !t.dead && t.team !== u.team && dist(t, u) < 11 && !sim.isProtected(t));
    const escort = et && sim.units.some((m) => m.kind === 'minion' && !m.dead && m.team === u.team && dist(m, et) < et.s.range && et.target === m);
    if (escort && !this.enemyChampsNear(9).length) { if (u.target !== et) sim.cmdAttack(u, et); return; }
    const nx = sim.nexus[1 - u.team];
    if (!nx.dead && !sim.isProtected(nx) && dist(u, nx) < 14) { if (u.target !== nx) sim.cmdAttack(u, nx); return; }
    // 막타 / 미니언 공격
    const mins = this.enemyMinionsNear(u.s.range + 5).filter((m) => !this.enemyTurretNear(m.x, m.z, -0.5) || escort);
    if (mins.length) {
      const lh = mins.filter((m) => m.hp < u.s.ad * 1.1).sort((a, b) => a.hp - b.hp)[0];
      const tgt = lh || mins.sort((a, b) => a.hp - b.hp)[0];
      if (lh || u.attackCd <= 0.05) { if (u.target !== tgt) sim.cmdAttack(u, tgt); return; }
    }
    // 자리 잡기
    const spot = pointAt(L.pts, L.acc, want);
    const off = ((u.id * 7) % 5 - 2) * 0.6;
    const sp = nearestWalkable(spot.x + off, spot.z - off, 4);
    if (Math.abs(me.s - want) > 2.2 || me.d > 4) {
      if (!u.path || !u.goal || Math.hypot(u.goal.x - sp.x, u.goal.z - sp.z) > 2.5) sim.cmdMove(u, sp.x, sp.z);
    }
  }
}
