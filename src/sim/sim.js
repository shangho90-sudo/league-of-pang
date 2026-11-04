// 게임 시뮬레이션 — 렌더링과 분리. 플랫폼 입력(PC/모바일)과 AI가 모두 같은 명령 API를 사용한다.
import { LANES, TURRETS, BASES, JUNGLE, PITS, FOUNTAIN_R, MAP_HALF } from '../map/layout.js';
import { buildGrid, isWalkable, nearestWalkable, findPath, lineWalkable, brushAt, sdAt, toCell, walk, N as GN, cellCenter } from '../map/grid.js';
import { CHAMPIONS, CHAMP_BY_ID, XP_TABLE, MAX_LEVEL, R_LEVELS, SKILL_ORDER, respawnTime } from '../data/champions.js';
export const FIRST_SPAWN = 10; // 미니언·일반 정글 몬스터 첫 등장 (초)
export const BOSS_FIRST_SPAWN = { drake: 180, colossus: 300 };
export const XP_MULT = 1.5;   // 경험치 획득 배율
import { ITEM_BY_ID, MAX_SLOTS } from '../data/items.js';
import { hitShape } from './shapes.js';
import { SKILLS, PASSIVES, PRE } from './skills.js';

export const TICK = 1 / 30;
let UID = 1;

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Unit {
  constructor(sim, kind, team, x, z, o = {}) {
    this.sim = sim; this.id = UID++; this.kind = kind; this.team = team;
    this.x = x; this.z = z; this.r = o.r ?? 0.5; this.facing = o.facing ?? 0;
    this.base = { hp: 500, mp: 0, ad: 20, ap: 0, armor: 10, mr: 10, as: 0.7, range: 1.5, ms: 3, hpR: 0, mpR: 0, windup: 0.3, ...o.stats };
    this.s = { ...this.base, cdr: 0, lifesteal: 0, healPower: 0, dmgMult: 1, dr: 0 };
    this.hp = this.s.hp; this.mp = this.s.mp;
    this.status = []; this.shields = []; this.buffs = [];
    this.dead = false; this.target = null; this.path = null; this.action = null;
    this.attackCd = 0; this.visibleTo = [team === 0, team === 1]; this.revealUntil = 0;
    this.lastHitBy = new Map(); this.sight = o.sight ?? 7; this.name = o.name || kind;
    this.moving = false; this.speedNow = 0; this.dash = null; this.joy = null;
    this.stuckT = 0; this.lastPos = { x, z }; this.repathAt = 0; this.attackMove = null;
    this.hitFlash = 0; this.inCombatUntil = 0; this.brush = 0;
  }
  get alive() { return !this.dead; }
  has(type) { const t = this.sim.time; return this.status.some((s) => s.type === type && s.until > t); }
  statusVal(type) { const t = this.sim.time; let v = 0; for (const s of this.status) if (s.type === type && s.until > t) v = Math.max(v, s.value || 0); return v; }
  get cc() { return this.has('stun') || this.has('airborne'); }
  get rooted() { return this.cc || this.has('root'); }
  get targetable() { return !this.dead && !this.has('untargetable'); }
  shieldTotal() { const t = this.sim.time; let a = 0; for (const s of this.shields) if (s.until > t) a += s.amt; return a; }
  moveSpeed() {
    let ms = this.s.ms;
    const slow = this.statusVal('slow');
    const fast = this.statusVal('haste');
    return Math.max(0.6, ms * (1 + fast) * (1 - slow));
  }
  attackSpeed() { return Math.min(2.5, this.s.as * (1 + this.statusVal('asBuff'))); }
}

export class Sim {
  constructor({ seed = 1, picks, playerIndex = 0, fast = false } = {}) {
    buildGrid();
    this.rand = rng(seed);
    this.time = 0; this.units = []; this.champions = [];
    this.projectiles = []; this.zones = []; this.timers = []; this.telegraphs = [];
    this.events = []; this.over = false; this.winner = -1;
    this.teamKills = [0, 0]; this.teamGold = [0, 0];
    this.teamBuffs = [{ drake: 0, colossusUntil: 0 }, { drake: 0, colossusUntil: 0 }];
    this.waveN = 0; this.nextWave = FIRST_SPAWN; this.fast = fast;
    this.stats = { stuckRecoveries: 0, paths: 0, cheatChecks: 0, hiddenTargetViolations: 0 };
    this.visGrid = [new Uint8Array(136 * 136), new Uint8Array(136 * 136)];
    this.lastVision = -1;
    this.setupStructures();
    this.blockStructures();
    this.setupJungle();
    this.setupChampions(picks, playerIndex);
    this.updateVision();
  }

  // ---------------- 생성 ----------------
  setupStructures() {
    this.turrets = [];
    for (const t of TURRETS) {
      const hp = t.tier === 1 ? 2300 : t.tier === 2 ? 2700 : 3000;
      const u = new Unit(this, 'turret', t.team, t.p.x, t.p.z, { r: 1.4, sight: 9.5, name: '포탑', stats: { hp, ad: t.tier === 1 ? 150 : 170, armor: 40, mr: 40, as: 0.85, range: 7.5, windup: 0.15 } });
      u.lane = t.lane; u.tier = t.tier; u.consecutive = 0; u.lastTgt = null;
      this.units.push(u); this.turrets.push(u);
    }
    this.nexus = BASES.map((b) => {
      const u = new Unit(this, 'nexus', b.team, b.nexus.x, b.nexus.z, { r: 3.0, sight: 10, name: '핵심 수정', stats: { hp: 4000, armor: 0, mr: 0, hpR: 4 } });
      this.units.push(u);
      return u;
    });
  }
  // 구조물 바닥면을 보행 그리드에서 제외 → 경로가 구조물을 돌아감 (보이는 것 = 이동 가능 영역)
  blockStructures() {
    if (Sim._blocked) return;
    Sim._blocked = true;
    for (const u of this.units) {
      if (u.kind !== 'turret' && u.kind !== 'nexus') continue;
      const r = u.r + 0.35;
      const i0 = toCell(u.x - r), i1 = toCell(u.x + r), j0 = toCell(u.z - r), j1 = toCell(u.z + r);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(cellCenter(i) - u.x, cellCenter(j) - u.z) <= r) walk[j * GN + i] = 0;
    }
  }
  setupJungle() {
    this.camps = [];
    for (const c of JUNGLE.camps) this.camps.push({ ...c, members: [], respawnAt: FIRST_SPAWN, alive: false });
    for (const p of PITS) this.camps.push({ ...p, team: 2, members: [], respawnAt: BOSS_FIRST_SPAWN[p.kind], alive: false, big: true });
  }
  spawnCamp(c) {
    c.members = [];
    const T = this.time / 60;
    const scale = 1 + T * 0.06;
    const add = (dx, dz, name, hp, ad, r, big = false) => {
      const u = new Unit(this, 'monster', 2, c.p.x + dx, c.p.z + dz, { r, sight: 4, name, stats: { hp: hp * scale, ad: ad * scale, armor: 15 + T, mr: 15 + T, as: 0.7, range: r + 1.2, ms: 3.4, windup: 0.35 } });
      u.camp = c; u.home = { x: u.x, z: u.z }; u.big = big; u.monsterKind = c.kind; u.facing = this.rand() * 6.28;
      this.units.push(u); c.members.push(u);
      return u;
    };
    if (c.kind === 'golem') add(0, 0, '이끼 골렘', 950, 26, 1.0, true);
    else if (c.kind === 'wolves') { add(0, 0, '회색 늑대왕', 620, 20, 0.8, true); add(1.5, 1.2, '늑대', 230, 9, 0.55); add(-1.4, 1.1, '늑대', 230, 9, 0.55); }
    else if (c.kind === 'drake') { const u = add(0, 0, '비룡', 3000, 70, 1.6, true); u.base.range = 3.2; u.s.range = 3.2; u.aoe = 2.2; }
    else if (c.kind === 'colossus') { const u = add(0, 0, '협곡 거신', 5600, 95, 2.0, true); u.base.range = 3.6; u.s.range = 3.6; u.aoe = 2.8; }
    for (const m of c.members) { m.hp = m.s.hp = m.base.hp; }
    c.alive = true;
    if (c.big) this.events.push({ type: 'announce', text: c.kind === 'drake' ? '비룡이 강 하류에 나타났습니다' : '협곡 거신이 깨어났습니다', tone: 'neutral' });
  }
  setupChampions(picks, playerIndex) {
    // picks: [{id, team, lane, isPlayer}]
    const lanes = ['top', 'mid', 'bot', 'jungle'];
    for (const pk of picks) {
      const def = CHAMP_BY_ID[pk.id];
      const b = BASES[pk.team];
      const k = this.champions.filter((c) => c.team === pk.team).length;
      const a = (k / 4) * Math.PI * 2;
      const u = new Unit(this, 'champion', pk.team, b.fountain.x + Math.cos(a) * 2, b.fountain.z + Math.sin(a) * 2, { r: 0.55, sight: 11, name: def.name, stats: { ...def.stats } });
      u.def = def; u.level = 1; u.xp = 0; u.gold = 500; u.items = [];
      u.skillLv = { Q: 0, W: 0, E: 0, R: 0 }; u.skillPoints = 1; u.cds = { Q: 0, W: 0, E: 0, R: 0 };
      u.k = 0; u.d = 0; u.a = 0; u.cs = 0; u.dmgDealt = 0; u.healDone = 0;
      u.lane = pk.lane || lanes[k]; u.isPlayer = !!pk.isPlayer; u.autoLevel = !pk.isPlayer || pk.autoLevel !== false;
      u.pass = { stacks: 0, heat: 0, charge: 0, chain: [], lastTarget: null, asStacks: 0, empowered: false, lastCombat: -99, shieldAt: 0 };
      u.respawnAt = 0; u.recall = null; u.potion = null; u.supportGold = 0; u.multiKill = { n: 0, t: 0 };
      u.facing = pk.team === 0 ? -Math.PI * 0.75 : Math.PI * 0.25;
      this.units.push(u); this.champions.push(u);
      this.levelUpSkillsAuto(u);
      this.recalcStats(u);
      u.hp = u.s.hp; u.mp = u.s.mp;
    }
    this.player = this.champions.find((c) => c.isPlayer) || null;
  }

  // ---------------- 스탯 ----------------
  recalcStats(u) {
    if (u.kind !== 'champion') return;
    const d = u.def.stats, L = u.level - 1;
    const s = { hp: d.hp + d.hpG * L, mp: d.mp + d.mpG * L, ad: d.ad + d.adG * L, ap: 0, armor: d.armor + d.armG * L, mr: d.mr + d.mrG * L,
      as: d.as * (1 + d.asG * L), range: d.range, ms: d.ms, hpR: d.hpR * (1 + L * 0.1), mpR: d.mpR * (1 + L * 0.08), windup: d.windup,
      cdr: 0, lifesteal: 0, healPower: 0, dmgMult: 1, dr: 0 };
    let asBonus = 0;
    for (const id of u.items) {
      const it = ITEM_BY_ID[id];
      if (!it.stats) continue;
      for (const [k, v] of Object.entries(it.stats)) { if (k === 'as') asBonus += v; else s[k] = (s[k] || 0) + v; }
    }
    s.as *= 1 + asBonus;
    s.cdr = Math.min(0.35, s.cdr);
    const tb = this.teamBuffs[u.team];
    s.dmgMult *= 1 + tb.drake * 0.06;
    if (tb.colossusUntil > this.time) { s.ad += 30; s.ap += 30; s.hpR += 3; }
    if (u.buffs.some((b) => b.type === 'verdant' && b.until > this.time)) { s.mpR += 3; s.dmgMult *= 1.08; s.cdr = Math.min(0.4, s.cdr + 0.1); }
    // 패시브 스탯
    if (u.def.id === 'jung' && this.champions.some((c) => c !== u && c.team === u.team && !c.dead && dist(c, u) < 6)) { s.armor += 15; s.mr += 15; }
    if (u.def.id === 'cho' && u.has('chaseR')) { s.as *= 1.3; }
    if (u.def.id === 'cha' && u.has('aim')) s.range += 1.5;
    if (u.has('fortress')) s.dr = Math.max(s.dr, u.statusVal('fortress'));
    if (u.has('sanctum')) s.dr = Math.max(s.dr, 0.3);
    if (u.has('armorUp')) s.armor += u.statusVal('armorUp');
    const hpRatio = u.hp / (u.s.hp || 1), mpRatio = u.mp / (u.s.mp || 1);
    const oldMax = u.s.hp;
    u.s = s;
    if (oldMax && oldMax !== s.hp) u.hp = clamp(hpRatio * s.hp, 1, s.hp);
    u.mp = Math.min(u.mp, s.mp);
    if (!isFinite(mpRatio)) u.mp = s.mp;
  }

  // ---------------- 명령 API ----------------
  cmdMove(u, x, z) {
    if (u.dead) return;
    this.cancelRecall(u);
    u.target = null; u.attackMove = null; u.joy = null; u.pendingCast = null;
    if (u.action && u.action.kind === 'attack' && !u.action.fired) u.action = null; // 공격 준비 중 이동 = 취소
    this.setPath(u, x, z);
  }
  cmdJoy(u, dx, dz) {
    // 모바일 조이스틱: 지면 위 직접 이동 (카메라 기준 방향은 입력 계층에서 변환)
    if (u.dead) return;
    const m = Math.hypot(dx, dz);
    if (m < 0.08) { if (u.joy) { u.joy = null; u.path = null; } return; }
    this.cancelRecall(u);
    if (u.action && u.action.kind === 'attack' && !u.action.fired) u.action = null;
    u.joy = { x: dx / Math.max(1, m), z: dz / Math.max(1, m) };
    u.path = null; u.target = null; u.attackMove = null; u.pendingCast = null;
  }
  cmdAttack(u, t) {
    if (u.dead || !t || !this.canTarget(u, t)) return false;
    this.cancelRecall(u);
    u.target = t; u.attackMove = null; u.joy = null; u.path = null; u.pendingCast = null;
    return true;
  }
  cmdAttackMove(u, x, z) {
    if (u.dead) return;
    this.cancelRecall(u);
    u.attackMove = { x, z }; u.target = null; u.joy = null; u.pendingCast = null;
    this.setPath(u, x, z);
  }
  cmdStop(u) {
    u.path = null; u.target = null; u.attackMove = null; u.joy = null; u.pendingCast = null;
    if (u.action && u.action.kind === 'attack' && !u.action.fired) u.action = null;
  }
  cmdRecall(u) {
    if (u.dead || u.recall || u.cc) return { ok: false, reason: '지금은 귀환할 수 없습니다' };
    this.cmdStop(u);
    const dur = this.teamBuffs[u.team].colossusUntil > this.time ? 4 : 7;
    u.recall = { start: this.time, dur };
    this.events.push({ type: 'recall', u });
    return { ok: true };
  }
  cancelRecall(u) { if (u.recall) { u.recall = null; this.events.push({ type: 'recallCancel', u }); } }
  inShop(u) { const b = BASES[u.team]; return dist(u, b.center) < b.r + 1 || u.dead; }
  cmdBuy(u, id) {
    const it = ITEM_BY_ID[id];
    if (!it) return { ok: false, reason: '알 수 없는 아이템' };
    if (!this.inShop(u)) return { ok: false, reason: '본진 상점 구역에서만 구매할 수 있습니다' };
    if (u.gold < it.cost) return { ok: false, reason: '골드가 부족합니다' };
    if (it.consumable) {
      const n = u.items.filter((i) => i === id).length;
      if (n >= it.max) return { ok: false, reason: '더 이상 보유할 수 없습니다' };
    }
    if (u.items.length >= MAX_SLOTS) return { ok: false, reason: '인벤토리가 가득 찼습니다' };
    u.gold -= it.cost; u.items.push(id);
    this.recalcStats(u);
    if (it.stats && it.stats.hp) u.hp += it.stats.hp;
    this.events.push({ type: 'buy', u, id });
    return { ok: true };
  }
  cmdSell(u, idx) {
    if (!this.inShop(u)) return { ok: false, reason: '본진 상점 구역에서만 판매할 수 있습니다' };
    const id = u.items[idx]; if (!id) return { ok: false };
    u.items.splice(idx, 1); u.gold += Math.floor(ITEM_BY_ID[id].cost * 0.6); this.recalcStats(u);
    return { ok: true };
  }
  cmdUsePotion(u) {
    const i = u.items.indexOf('potion');
    if (i < 0) return { ok: false, reason: '회복 물약이 없습니다' };
    if (u.dead) return { ok: false, reason: '사망 상태입니다' };
    if (u.potion && u.potion.until > this.time) return { ok: false, reason: '이미 물약 효과가 적용 중입니다' };
    u.items.splice(i, 1);
    u.potion = { until: this.time + 10, rate: 13 };
    this.events.push({ type: 'fx', name: 'potion', u });
    return { ok: true };
  }
  cmdLevel(u, slot) {
    if (u.skillPoints <= 0) return false;
    const lv = u.skillLv[slot];
    if (slot === 'R') { const allowed = R_LEVELS.filter((l) => u.level >= l).length; if (lv >= allowed) return false; }
    else { if (lv >= 5 || lv >= Math.ceil(u.level / 2)) return false; }
    u.skillLv[slot]++; u.skillPoints--;
    this.events.push({ type: 'skillUp', u, slot });
    return true;
  }
  levelUpSkillsAuto(u) {
    if (!u.autoLevel) return;
    const order = SKILL_ORDER[u.def.roles.includes('support') ? 'support' : 'default'];
    let guard = 0;
    while (u.skillPoints > 0 && guard++ < 20) {
      let done = false;
      if (this.cmdLevel(u, 'R')) continue;
      for (const s of order) { if (this.cmdLevel(u, s)) { done = true; break; } }
      if (!done) for (const s of ['Q', 'W', 'E']) if (this.cmdLevel(u, s)) { done = true; break; }
      if (!done) break;
    }
  }
  canCast(u, slot) {
    const sk = u.def.skills[slot];
    if (u.dead) return { ok: false, reason: '사망 상태입니다' };
    if (u.skillLv[slot] <= 0) return { ok: false, reason: '아직 배우지 않은 스킬입니다' };
    if (u.cds[slot] > this.time) return { ok: false, reason: `재사용 대기 중 (${(u.cds[slot] - this.time).toFixed(1)}초)`, code: 'cd' };
    if (u.mp < sk.cost) return { ok: false, reason: '자원이 부족합니다', code: 'mana' };
    if (u.cc) return { ok: false, reason: '제어 효과로 시전할 수 없습니다', code: 'cc' };
    if (u.has('silence')) return { ok: false, reason: '침묵 상태입니다', code: 'cc' };
    if (u.action && u.action.kind === 'cast') return { ok: false, reason: '다른 스킬을 시전 중입니다', code: 'busy' };
    if (u.dash) return { ok: false, reason: '이동 중에는 시전할 수 없습니다', code: 'busy' };
    return { ok: true };
  }
  // opts: {point:{x,z}, target:Unit}
  cmdCast(u, slot, opts = {}) {
    const chk = this.canCast(u, slot);
    if (!chk.ok) return chk;
    const sk = u.def.skills[slot];
    let { point, target } = opts;
    if (sk.t === 'enemy') {
      if (!target || target.team === u.team || !this.canTarget(u, target)) return { ok: false, reason: '대상을 지정해야 합니다', code: 'target' };
      if (dist(u, target) > sk.range + target.r + 0.3) {
        // 사거리 밖: 접근 후 시전
        u.pendingCast = { slot, target, point };
        u.target = null; u.joy = null;
        this.setPath(u, target.x, target.z);
        return { ok: true, queued: true, reason: '사거리 밖 — 접근 중' };
      }
    }
    if (sk.t === 'ally') {
      if (!target || target.team !== u.team || target.dead || target.kind !== 'champion') target = u;
      if (target !== u && dist(u, target) > sk.range + 0.5) {
        u.pendingCast = { slot, target, point };
        u.target = null; u.joy = null;
        this.setPath(u, target.x, target.z);
        return { ok: true, queued: true, reason: '사거리 밖 — 접근 중' };
      }
    }
    if (!point) point = target ? { x: target.x, z: target.z } : { x: u.x + Math.sin(u.facing) * 3, z: u.z + Math.cos(u.facing) * 3 };
    let dx = point.x - u.x, dz = point.z - u.z;
    let d = Math.hypot(dx, dz);
    if (d < 0.01) { dx = Math.sin(u.facing); dz = Math.cos(u.facing); d = 1; point = { x: u.x + dx, z: u.z + dz }; }
    const dir = { x: dx / d, z: dz / d };
    if (sk.t === 'point' && d > sk.range) point = { x: u.x + dir.x * sk.range, z: u.z + dir.z * sk.range };
    this.cancelRecall(u);
    u.pendingCast = null;
    u.mp -= sk.cost;
    u.cds[slot] = this.time + sk.cd * (1 - (u.s.cdr || 0));
    if (sk.t !== 'self' || slot === 'R') u.facing = Math.atan2(dir.x, dir.z);
    if (u.action && u.action.kind === 'attack' && !u.action.fired) u.action = null;
    const castTime = sk.castTime || 0;
    PRE[u.def.id]?.[slot]?.(this, u, { point, dir, target, sk });
    u.action = { kind: 'cast', slot, t: 0, windup: castTime, total: castTime + 0.3, fired: false, data: { point, dir, target }, channel: sk.channel || 0 };
    if (castTime > 0.15 || slot === 'R') { u.path = null; }
    this.events.push({ type: 'cast', u, slot, point, dir, target });
    u.pass.lastCombat = this.time;
    return { ok: true };
  }

  canTarget(u, t) {
    if (!t || t.dead || !t.targetable) return false;
    if (t.team === u.team) return false;
    if (t.kind === 'decoy') return t.visibleTo[u.team];
    if (u.team !== 2 && !t.visibleTo[u.team]) return false;
    if (t.invuln && t.invuln()) return false;
    return true;
  }
  isProtected(t) {
    if (t.kind === 'turret') {
      if (t.tier === 1) return false;
      if (t.tier === 2) return this.turrets.some((o) => o.team === t.team && o.lane === t.lane && o.tier === 1 && !o.dead);
      if (t.tier === 3) return !this.turrets.some((o) => o.team === t.team && o.tier === 2 && o.dead);
    }
    if (t.kind === 'nexus') return this.turrets.some((o) => o.team === t.team && o.tier === 3 && !o.dead);
    return false;
  }

  // ---------------- 이동 ----------------
  setPath(u, x, z) {
    const p = findPath(u.x, u.z, x, z);
    this.stats.paths++;
    u.path = p && p.length ? p : null;
    u.goal = { x, z };
    u.repathAt = this.time + 0.6;
  }
  tryMove(u, nx, nz) {
    if (isWalkable(nx, nz)) { u.x = nx; u.z = nz; return true; }
    // 벽 미끄러짐: 축 분리 이동
    const dx = nx - u.x, dz = nz - u.z;
    const step = Math.hypot(dx, dz);
    if (isWalkable(u.x + dx, u.z)) { u.x += Math.sign(dx) * Math.min(step, Math.abs(dx) + step * 0.3); if (!isWalkable(u.x, u.z)) u.x -= Math.sign(dx) * step * 0.3; return true; }
    if (isWalkable(u.x, u.z + dz)) { u.z += Math.sign(dz) * Math.min(step, Math.abs(dz) + step * 0.3); if (!isWalkable(u.x, u.z)) u.z -= Math.sign(dz) * step * 0.3; return true; }
    // 대각 회전 시도
    for (const ang of [0.6, -0.6, 1.1, -1.1]) {
      const c = Math.cos(ang), s = Math.sin(ang);
      const rx = dx * c - dz * s, rz = dx * s + dz * c;
      if (isWalkable(u.x + rx * 0.8, u.z + rz * 0.8)) { u.x += rx * 0.8; u.z += rz * 0.8; return true; }
    }
    return false;
  }
  moveUnit(u, dt) {
    u.moving = false; u.speedNow = 0;
    if (u.dash) return this.updateDash(u, dt);
    if (u.rooted || (u.action && u.action.kind === 'cast' && !u.action.fired && u.action.windup > 0.15) || (u.action && u.action.channelUntil > this.time)) return;
    if (u.action && u.action.kind === 'attack' && !u.action.fired) return;
    let dx = 0, dz = 0, want = false;
    const sp = u.moveSpeed();
    if (u.joy) { dx = u.joy.x; dz = u.joy.z; want = true; }
    else if (u.path && u.path.length) {
      const wp = u.path[0];
      const ddx = wp.x - u.x, ddz = wp.z - u.z, d = Math.hypot(ddx, ddz);
      if (d < 0.15) { u.path.shift(); if (!u.path.length) u.path = null; return; }
      dx = ddx / d; dz = ddz / d; want = true;
      if (d < sp * dt) { u.x = wp.x; u.z = wp.z; u.path.shift(); if (!u.path.length) u.path = null; u.moving = true; u.speedNow = sp; u.facing = turnTo(u.facing, Math.atan2(dx, dz), dt * 16); return; }
    }
    if (!want) return;
    const ox = u.x, oz = u.z;
    const ok = this.tryMove(u, u.x + dx * sp * dt, u.z + dz * sp * dt);
    const moved = Math.hypot(u.x - ox, u.z - oz);
    u.moving = moved > 0.001; u.speedNow = moved / dt;
    if (u.moving) u.facing = turnTo(u.facing, Math.atan2(u.x - ox, u.z - oz), dt * 16);
    // 끼임 감지 및 복구
    if (moved < sp * dt * 0.25) {
      u.stuckT += dt;
      if (u.stuckT > 0.8 && !u.joy && u.goal) { this.setPath(u, u.goal.x, u.goal.z); }
      if (u.stuckT > 2.5) {
        const nw = nearestWalkable(u.x + (this.rand() - 0.5), u.z + (this.rand() - 0.5), 8);
        u.x = nw.x; u.z = nw.z; u.stuckT = 0; this.stats.stuckRecoveries++; (this.stats.stuckBy ||= {})[u.kind + (u.minionKind||'')] = ((this.stats.stuckBy ||= {})[u.kind + (u.minionKind||'')] || 0) + 1; if (globalThis.STUCK_LOG && this.stats.stuckRecoveries % 25 === 1) console.log('STUCK', u.kind, u.minionKind, u.team, ox.toFixed(1), oz.toFixed(1), 'goal', u.goal && u.goal.x.toFixed(1), u.goal && u.goal.z.toFixed(1), 'path', JSON.stringify(u.path && u.path.slice(0,2)), 'tgt', u.target && u.target.kind);
      }
    } else u.stuckT = Math.max(0, u.stuckT - dt * 2);
  }
  // 대시/넉백/도약: 벽을 넘지 못하면 마지막 보행 가능 지점에서 멈춤 (leap는 넘어갈 수 있음)
  startDash(u, tx, tz, speed, opts = {}) {
    let ex = tx, ez = tz;
    if (!opts.leap) {
      const d = Math.hypot(tx - u.x, tz - u.z);
      const steps = Math.ceil(d / 0.25);
      let lx = u.x, lz = u.z;
      for (let i = 1; i <= steps; i++) { const t = i / steps; const px = u.x + (tx - u.x) * t, pz = u.z + (tz - u.z) * t; if (!isWalkable(px, pz)) break; lx = px; lz = pz; }
      ex = lx; ez = lz;
    } else if (!isWalkable(tx, tz)) { const nw = nearestWalkable(tx, tz, 6); ex = nw.x; ez = nw.z; }
    const d = Math.hypot(ex - u.x, ez - u.z);
    u.dash = { sx: u.x, sz: u.z, ex, ez, t: 0, dur: Math.max(0.05, d / speed), hit: new Set(), ...opts };
    u.path = null; u.joy = null;
    if (opts.face !== false && d > 0.1) u.facing = Math.atan2(ex - u.x, ez - u.z);
    this.cancelRecall(u);
  }
  updateDash(u, dt) {
    const D = u.dash;
    D.t += dt;
    const k = Math.min(1, D.t / D.dur);
    u.x = D.sx + (D.ex - D.sx) * k; u.z = D.sz + (D.ez - D.sz) * k;
    u.moving = true; u.speedNow = Math.hypot(D.ex - D.sx, D.ez - D.sz) / D.dur;
    if (D.onTick) D.onTick(u, D);
    if (k >= 1) { u.dash = null; if (D.onEnd) D.onEnd(u, D); }
  }
  separate() {
    const mobile = this.units.filter((u) => !u.dead && (u.kind === 'champion' || u.kind === 'minion' || u.kind === 'monster') && !u.dash);
    for (let i = 0; i < mobile.length; i++) {
      const a = mobile[i];
      for (let j = i + 1; j < mobile.length; j++) {
        const b = mobile[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const rr = (a.r + b.r) * 0.85;
        if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
        const d = Math.hypot(dx, dz);
        if (d >= rr || d < 1e-4) continue;
        const push = (rr - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        const wa = a.kind === 'champion' ? 0.35 : 0.5, wb = b.kind === 'champion' ? 0.35 : 0.5;
        if (isWalkable(a.x - nx * push * wa, a.z - nz * push * wa)) { a.x -= nx * push * wa; a.z -= nz * push * wa; }
        if (isWalkable(b.x + nx * push * wb, b.z + nz * push * wb)) { b.x += nx * push * wb; b.z += nz * push * wb; }
      }
    }
    // 구조물과의 충돌
    for (const u of mobile) for (const s of this.units) {
      if ((s.kind !== 'turret' && s.kind !== 'nexus') || s.dead) continue;
      const dx = u.x - s.x, dz = u.z - s.z, d = Math.hypot(dx, dz), rr = s.r + u.r * 0.6;
      if (d < rr && d > 1e-4) { const nx = u.x + (dx / d) * (rr - d), nz = u.z + (dz / d) * (rr - d); if (isWalkable(nx, nz)) { u.x = nx; u.z = nz; } }
    }
  }

  // ---------------- 전투 ----------------
  inRange(u, t, extra = 0) { return dist(u, t) <= u.s.range + t.r + u.r * 0.4 + extra; }
  startAttack(u, t) {
    const as = u.attackSpeed();
    const period = 1 / as;
    const baseAs = u.base.as || 0.7;
    const windup = (u.s.windup || 0.3) * clamp(baseAs / as, 0.5, 1);
    u.action = { kind: 'attack', t: 0, windup, total: Math.min(period * 0.95, windup + 0.4), fired: false, target: t, variant: (u.atkVariant = (u.atkVariant || 0) + 1) };
    u.attackCd = period;
    u.facing = Math.atan2(t.x - u.x, t.z - u.z);
    this.events.push({ type: 'attackStart', u, t });
  }
  fireAttack(u, t) {
    if (!t || t.dead) return;
    let dmg = u.s.ad;
    const opts = { basic: true };
    if (u.kind === 'champion') {
      const r = PASSIVES[u.def.id]?.onAttack?.(this, u, t, dmg);
      if (r) { dmg = r.dmg ?? dmg; Object.assign(opts, r.opts || {}); }
    }
    if (u.kind === 'minion' || u.kind === 'monster') this.markCombat(u);
    if (u.kind === 'champion' && u.def.stats.ranged) {
      this.spawnProjectile({ kind: 'homing', src: u, target: t, x: u.x, z: u.z, speed: u.def.stats.projSpeed, vis: u.def.stats.proj, onHit: (p, tgt) => this.applyBasicHit(u, tgt, dmg, opts) });
    } else if (u.kind === 'minion' && u.ranged) {
      this.spawnProjectile({ kind: 'homing', src: u, target: t, x: u.x, z: u.z, speed: 14, vis: u.minionKind === 'siege' ? 'siege' : 'minion', onHit: (p, tgt) => this.applyBasicHit(u, tgt, dmg, opts) });
    } else if (u.kind === 'turret') {
      this.spawnProjectile({ kind: 'homing', src: u, target: t, x: u.x, z: u.z, y: 4.3, speed: 20, vis: 'turret', onHit: (p, tgt) => this.turretHit(u, tgt) });
    } else {
      if (u.aoe) {
        for (const o of this.units) if (!o.dead && o.team !== u.team && o.kind !== 'turret' && o.kind !== 'nexus' && dist(o, t) < u.aoe + o.r) this.dealDamage(u, o, dmg, 'phys', { basic: true });
        this.events.push({ type: 'fx', name: 'slam', x: t.x, z: t.z, r: u.aoe });
      } else this.applyBasicHit(u, t, dmg, opts);
    }
  }
  applyBasicHit(u, t, dmg, opts) {
    if (t.dead) return;
    if (t.kind === 'decoy') { this.events.push({ type: 'fx', name: 'decoyPop', x: t.x, z: t.z }); t.until = 0; return; }
    const dealt = this.dealDamage(u, t, dmg, 'phys', opts);
    if (u.kind === 'champion') {
      PASSIVES[u.def.id]?.afterAttack?.(this, u, t, dealt);
      if (u.s.lifesteal) this.heal(u, u, dealt * u.s.lifesteal, { silent: true });
    }
  }
  turretHit(tu, t) {
    let dmg = tu.s.ad * (1 + this.time / 600);
    if (t.kind === 'minion') dmg = t.s.hp * (t.minionKind === 'melee' ? 0.45 : t.minionKind === 'caster' ? 0.7 : 0.14);
    else if (t.kind === 'champion') {
      tu.consecutive = tu.lastTgt === t ? tu.consecutive + 1 : 0;
      dmg *= 1 + Math.min(1.2, tu.consecutive * 0.3);
    }
    tu.lastTgt = t;
    this.dealDamage(tu, t, dmg, t.kind === 'champion' ? 'true' : 'phys', { turret: true });
  }
  markCombat(u) { u.inCombatUntil = this.time + 4; }
  dealDamage(src, t, amount, type = 'phys', opts = {}) {
    if (!t || t.dead || amount <= 0) return 0;
    if (t.kind === 'decoy') return 0;
    if (this.isProtected(t)) { if (src.kind === 'champion' && src.isPlayer) this.events.push({ type: 'blocked', t }); return 0; }
    if (t.has('untargetable') && !opts.ignoreUntargetable) return 0;
    let a = amount * (src.s ? src.s.dmgMult : 1);
    // 구조물: 미니언이 주변에 없으면 피해 감소 (단독 공격로에서 포탑이 일방적으로 무너지지 않게)
    if (t.kind === 'turret' || t.kind === 'nexus') {
      const escort = this.units.some((m) => m.kind === 'minion' && !m.dead && m.team === src.team && dist(m, t) < 10);
      if (!escort) a *= 0.4;
      if (src.kind === 'minion' && src.empowered) a *= 1.5;
      if (src.kind === 'champion' && !opts.basic) a *= 0.5; // 스킬은 건물에 절반
    }
    if (src.kind === 'champion' && t.kind === 'monster') a *= 1.15;
    if (src.kind === 'monster' && t.kind === 'champion') a *= 1;
    if (type === 'phys') a *= 100 / (100 + Math.max(0, t.s.armor));
    else if (type === 'magic') a *= 100 / (100 + Math.max(0, t.s.mr));
    a *= 1 - (t.s.dr || 0);
    if (t.kind === 'minion' && t.empowered) a *= 0.7;
    // 보호막 흡수
    let rem = a;
    for (const s of t.shields) {
      if (s.until <= this.time || s.amt <= 0) continue;
      const take = Math.min(s.amt, rem); s.amt -= take; rem -= take;
      if (rem <= 0) break;
    }
    t.hp -= rem;
    t.hitFlash = 0.15;
    if (src.kind === 'champion') { src.dmgDealt += a; src.pass.lastCombat = this.time; if (t.kind === 'champion') { t.lastHitBy.set(src, this.time); src.revealUntil = Math.max(src.revealUntil, this.time + 1.0); } }
    if (t.kind === 'champion') t.pass.lastCombat = this.time;
    if (t.kind === 'champion' || t.kind === 'minion') this.cancelRecall(t);
    this.markCombat(t); this.markCombat(src);
    if (src.kind === 'champion' && t.kind === 'champion') { this.lastChampAggro = this.lastChampAggro || new Map(); this.lastChampAggro.set(src, { t: this.time, victim: t }); }
    if (t.kind === 'monster' && t.camp) { t.camp.aggroBy = src; t.aggroT = this.time; }
    this.events.push({ type: 'dmg', src, t, amt: a, dmgType: type, basic: !!opts.basic, crit: !!opts.crit });
    if (t.hp <= 0) this.kill(t, src);
    return a;
  }
  heal(src, t, amount, opts = {}) {
    if (!t || t.dead) return 0;
    const a = amount * (1 + (src.s?.healPower || 0));
    const real = Math.min(a, t.s.hp - t.hp);
    t.hp += real;
    if (!opts.silent) this.events.push({ type: 'heal', src, t, amt: a });
    if (src.kind === 'champion' && src !== t && t.kind === 'champion') { src.healDone += real; this.supportGold(src, real); }
    return real;
  }
  addShield(src, t, amt, dur) {
    if (!t || t.dead) return;
    const a = amt * (1 + (src.s?.healPower || 0));
    t.shields.push({ amt: a, until: this.time + dur, max: a });
    this.events.push({ type: 'shield', src, t, amt: a });
    if (src.kind === 'champion' && src !== t && t.kind === 'champion') this.supportGold(src, a * 0.5);
  }
  supportGold(src, amt) {
    // 서포터 성장 수단: 아군 회복·보호 효과량에 비례한 골드 (분당 상한)
    src.supportGold = (src.supportGold || 0) + amt / 7;
    const g = Math.floor(src.supportGold);
    if (g > 0) { src.supportGold -= g; src.gold += g; }
  }
  applyStatus(src, t, type, dur, value = 0) {
    if (!t || t.dead) return;
    if ((t.kind === 'turret' || t.kind === 'nexus')) return;
    if (t.kind === 'monster' && t.big && (type === 'stun' || type === 'airborne')) dur *= 0.5;
    t.status.push({ type, until: this.time + dur, value, src, start: this.time, dur });
    if (type === 'stun' || type === 'airborne') {
      if (t.action && !t.action.fired) t.action = null;
      if (t.action && t.action.channelUntil) t.action = null;
      t.path = null;
      this.cancelRecall(t);
    }
    this.events.push({ type: 'status', t, status: type, dur });
  }
  kill(t, src) {
    if (t.dead) return;
    t.dead = true; t.hp = 0; t.action = null; t.path = null; t.dash = null; t.target = null; t.recall = null;
    t.deathTime = this.time;
    // 처치자: 직접 처치자가 비챔피언이면 최근 피해를 준 챔피언에게
    let killer = src;
    if (t.kind === 'champion' && (!src || src.kind !== 'champion')) {
      let best = null, bt = -1;
      for (const [c, tt] of t.lastHitBy) if (this.time - tt < 10 && tt > bt) { best = c; bt = tt; }
      if (best) killer = best;
    }
    this.events.push({ type: 'death', u: t, killer });
    if (t.kind === 'champion') this.onChampionDeath(t, killer);
    else if (t.kind === 'minion') this.onMinionDeath(t, killer);
    else if (t.kind === 'monster') this.onMonsterDeath(t, killer);
    else if (t.kind === 'turret') this.onTurretDeath(t, killer);
    else if (t.kind === 'nexus') { this.over = true; this.winner = 1 - t.team; this.endTime = this.time; this.events.push({ type: 'end', winner: this.winner }); }
  }
  giveXp(c, amt) {
    if (c.dead && amt < 0) return;
    c.xp += amt * XP_MULT;
    while (c.level < MAX_LEVEL && c.xp >= XP_TABLE[c.level]) {
      c.level++; c.skillPoints++;
      const gainHp = c.def.stats.hpG, gainMp = c.def.stats.mpG;
      this.recalcStats(c);
      c.hp = Math.min(c.s.hp, c.hp + gainHp * 0.5); c.mp = Math.min(c.s.mp, c.mp + gainMp * 0.5);
      this.levelUpSkillsAuto(c);
      this.events.push({ type: 'level', u: c });
    }
  }
  shareXp(x, z, team, amt, radius = 13) {
    const near = this.champions.filter((c) => c.team === team && !c.dead && Math.hypot(c.x - x, c.z - z) < radius);
    if (!near.length) return;
    const each = (amt / near.length) * (1 + 0.2 * (near.length - 1));
    for (const c of near) this.giveXp(c, each);
  }
  onChampionDeath(t, killer) {
    t.d++;
    t.respawnAt = this.time + respawnTime(t.level, this.time);
    t.status = []; t.shields = [];
    const streakBonus = Math.min(300, (t.streak || 0) * 60);
    t.streak = 0;
    const assists = [...t.lastHitBy.entries()].filter(([c, tt]) => c !== killer && c.team !== t.team && this.time - tt < 10).map(([c]) => c);
    if (killer && killer.kind === 'champion' && killer.team !== t.team) {
      killer.k++; killer.streak = (killer.streak || 0) + 1;
      const g = 300 + streakBonus;
      killer.gold += g;
      this.teamKills[killer.team]++;
      this.events.push({ type: 'gold', u: killer, amt: g, x: t.x, z: t.z });
      // 다중 처치
      if (this.time - killer.multiKill.t < 10) killer.multiKill.n++; else killer.multiKill.n = 1;
      killer.multiKill.t = this.time;
    } else if (killer) this.teamKills[1 - t.team]++;
    for (const a of assists) { a.a++; a.gold += Math.round(150 / Math.max(1, assists.length)) + 25; }
    for (const c of [killer, ...assists]) if (c && c.kind === 'champion' && c.team !== t.team && !c.dead) PASSIVES[c.def.id]?.onTakedown?.(this, c, t);
    this.shareXp(t.x, t.z, 1 - t.team, 90 + t.level * 30, 15);
    t.lastHitBy.clear();
    this.events.push({ type: 'killfeed', killer, victim: t, assists, multi: killer?.multiKill?.n || 1 });
  }
  onMinionDeath(t, killer) {
    const gold = t.minionKind === 'melee' ? 21 : t.minionKind === 'caster' ? 16 : 55;
    const xp = t.minionKind === 'melee' ? 30 : t.minionKind === 'caster' ? 16 : 50;
    if (killer && killer.kind === 'champion') { killer.gold += gold; killer.cs++; this.events.push({ type: 'gold', u: killer, amt: gold, x: t.x, z: t.z }); }
    else {
      // 막타를 못 쳐도 주변 서포터 역할에게 일부 골드 (로밍·회복형 성장 보조)
      for (const c of this.champions) if (c.team !== t.team && !c.dead && c.def.roles.includes('support') && dist(c, t) < 10) c.gold += Math.round(gold * 0.5);
    }
    this.shareXp(t.x, t.z, 1 - t.team, xp);
  }
  onMonsterDeath(t, killer) {
    const c = t.camp;
    const gold = t.monsterKind === 'drake' ? 120 : t.monsterKind === 'colossus' ? 300 : t.big ? 85 : 35;
    const xp = t.monsterKind === 'drake' ? 280 : t.monsterKind === 'colossus' ? 500 : t.monsterKind === 'golem' ? 190 : t.big ? 130 : 45;
    if (killer && killer.kind === 'champion') {
      killer.gold += gold; killer.cs++;
      this.events.push({ type: 'gold', u: killer, amt: gold, x: t.x, z: t.z });
      this.shareXp(t.x, t.z, killer.team, xp, 10);
      if (t.monsterKind === 'golem' && t.big) { killer.buffs.push({ type: 'verdant', until: this.time + 75 }); this.recalcStats(killer); this.events.push({ type: 'announce', text: `${killer.name} — 이끼의 축복 획득`, tone: killer.team === this.player?.team ? 'ally' : 'enemy', team: killer.team }); }
      if (t.monsterKind === 'drake') {
        const tb = this.teamBuffs[killer.team]; tb.drake = Math.min(3, tb.drake + 1);
        for (const ch of this.champions) if (ch.team === killer.team) ch.gold += 60;
        this.champions.forEach((ch) => this.recalcStats(ch));
        this.events.push({ type: 'announce', text: `${killer.team === 0 ? '청람' : '적염'} 팀이 비룡을 처치했습니다 (피해 +${tb.drake * 6}%)`, tone: 'team', team: killer.team });
      }
      if (t.monsterKind === 'colossus') {
        this.teamBuffs[killer.team].colossusUntil = this.time + 120;
        for (const ch of this.champions) if (ch.team === killer.team) ch.gold += 150;
        this.champions.forEach((ch) => this.recalcStats(ch));
        this.events.push({ type: 'announce', text: `${killer.team === 0 ? '청람' : '적염'} 팀이 협곡 거신을 처치했습니다 — 2분간 강화`, tone: 'team', team: killer.team });
      }
    }
    if (c.members.every((m) => m.dead)) { c.alive = false; c.respawnAt = this.time + (c.big ? (c.kind === 'drake' ? 210 : 300) : 95); }
  }
  onTurretDeath(t, killer) {
    for (const c of this.champions) if (c.team !== t.team) { c.gold += 120; }
    if (killer && killer.kind === 'champion') killer.gold += 100;
    this.events.push({ type: 'announce', text: `${t.team === 0 ? '청람' : '적염'} 팀의 포탑이 파괴되었습니다`, tone: 'team', team: 1 - t.team });
    this.events.push({ type: 'fx', name: 'structureDown', x: t.x, z: t.z });
  }

  // ---------------- 투사체 / 영역 / 타이머 / 텔레그래프 ----------------
  spawnProjectile(p) {
    p.id = UID++; p.t = 0; p.hit = p.hit || new Set(); p.y = p.y ?? 1.1;
    p.sx = p.x; p.sz = p.z;
    this.projectiles.push(p);
    this.events.push({ type: 'proj', p });
    return p;
  }
  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.done) continue;
      p.t += dt;
      if (p.kind === 'homing') {
        const t = p.target;
        if (!t || t.dead) { p.done = true; continue; }
        const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
        const step = p.speed * dt;
        if (d <= step + t.r * 0.5) { p.x = t.x; p.z = t.z; p.done = true; p.onHit && p.onHit(p, t); this.events.push({ type: 'projHit', p, t }); }
        else { p.x += (dx / d) * step; p.z += (dz / d) * step; }
      } else if (p.kind === 'line') {
        const step = p.speed * dt;
        p.x += p.dx * step; p.z += p.dz * step;
        const trav = Math.hypot(p.x - p.sx, p.z - p.sz);
        for (const u of this.units) {
          if (u.dead || u.team === p.src.team || p.hit.has(u) || u.kind === 'nexus') continue;
          if (u.kind === 'turret' && !p.hitStructures) continue;
          if (u.has('untargetable')) continue;
          if (u.kind === 'decoy') { if (Math.hypot(u.x - p.x, u.z - p.z) < p.w / 2 + u.r) { u.until = 0; this.events.push({ type: 'fx', name: 'decoyPop', x: u.x, z: u.z }); if (!p.pierce) { p.done = true; break; } } continue; }
          if (Math.hypot(u.x - p.x, u.z - p.z) < p.w / 2 + u.r) {
            p.hit.add(u);
            p.onHit && p.onHit(p, u);
            this.events.push({ type: 'projHit', p, t: u });
            if (!p.pierce) { p.done = true; break; }
          }
        }
        if (trav >= p.range) { p.done = true; p.onEnd && p.onEnd(p); }
        if (!p.pierce && !p.done && sdAt(p.x, p.z) > 2.5 && p.wallStop) { p.done = true; }
      } else if (p.kind === 'lob') {
        const k = Math.min(1, p.t / p.flight);
        p.x = p.sx + (p.tx - p.sx) * k; p.z = p.sz + (p.tz - p.sz) * k;
        p.y = 1.2 + Math.sin(k * Math.PI) * p.arc;
        if (k >= 1) { p.done = true; p.onLand && p.onLand(p); }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }
  spawnZone(z) {
    z.id = UID++; z.start = this.time; z.nextTick = this.time + (z.tickDelay ?? 0);
    this.zones.push(z);
    this.events.push({ type: 'zone', z });
    return z;
  }
  updateZones() {
    for (const z of this.zones) {
      if (z.done) continue;
      if (z.follow) { z.shape.x = z.follow.x; z.shape.z = z.follow.z; }
      if (this.time >= z.nextTick && z.onTick) {
        z.nextTick += z.interval || 0.5;
        const us = this.unitsInShape(z.shape, z.filter || ((u) => true));
        z.onTick(us, z);
      }
      if (this.time >= z.until) { z.done = true; z.onEnd && z.onEnd(z); }
    }
    this.zones = this.zones.filter((z) => !z.done);
  }
  after(delay, fn) { this.timers.push({ at: this.time + delay, fn }); }
  updateTimers() {
    const due = this.timers.filter((t) => t.at <= this.time);
    this.timers = this.timers.filter((t) => t.at > this.time);
    for (const t of due) t.fn();
  }
  // style: 'enemy'(위험) | 'ally'(아군 이로운 효과)
  telegraph(shape, team, warn, active = 0.2, opts = {}) {
    const tg = { id: UID++, shape: { ...shape }, team, start: this.time, warnEnd: this.time + warn, end: this.time + warn + active, ...opts };
    this.telegraphs.push(tg);
    return tg;
  }
  unitsInShape(shape, filter) {
    const out = [];
    for (const u of this.units) {
      if (u.dead || u.kind === 'decoy') continue;
      if (filter && !filter(u)) continue;
      if (hitShape(shape, u.x, u.z, u.r)) out.push(u);
    }
    return out;
  }
  enemiesIn(shape, team, { structures = false } = {}) {
    return this.unitsInShape(shape, (u) => u.team !== team && !u.has('untargetable') && (structures || (u.kind !== 'turret' && u.kind !== 'nexus')));
  }
  alliesIn(shape, team) { return this.unitsInShape(shape, (u) => u.team === team && u.kind === 'champion'); }

  // ---------------- 시야 (전장의 안개) ----------------
  updateVision() {
    const R = 136, half = MAP_HALF;
    for (let team = 0; team < 2; team++) {
      const g = this.visGrid[team];
      g.fill(0);
      for (const u of this.units) {
        if (u.dead || u.team !== team) continue;
        if (u.kind === 'decoy') continue;
        const bx = u.x + half, bz = u.z + half;
        const rad = u.sight;
        const myBrush = brushAt(u.x, u.z);
        const ci = Math.floor(bx), cj = Math.floor(bz);
        const ri = Math.ceil(rad);
        for (let dj = -ri; dj <= ri; dj++) for (let di = -ri; di <= ri; di++) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= R || j >= R) continue;
          if (di * di + dj * dj > rad * rad) continue;
          const k = j * R + i;
          if (g[k]) continue;
          // 광선: 벽/다른 덤불이 시야를 가림
          const tx = i + 0.5 - half, tz = j + 0.5 - half;
          const d = Math.hypot(tx - u.x, tz - u.z);
          const steps = Math.ceil(d / 0.5);
          let ok = true;
          for (let s = 1; s <= steps; s++) {
            const px = u.x + ((tx - u.x) * s) / steps, pz = u.z + ((tz - u.z) * s) / steps;
            if (sdAt(px, pz) > 0.9) { ok = false; break; }
            const b = brushAt(px, pz);
            if (b && b !== myBrush && s < steps && Math.hypot(px - u.x, pz - u.z) > 1.5) { ok = false; break; }
          }
          if (ok) {
            const b = brushAt(tx, tz);
            if (b && b !== myBrush && d > 1.6) ok = false;
          }
          if (ok) g[k] = 1;
        }
      }
    }
    for (const u of this.units) {
      for (let team = 0; team < 2; team++) {
        if (u.team === team) { u.visibleTo[team] = true; continue; }
        if (u.kind === 'turret' || u.kind === 'nexus') { u.visibleTo[team] = true; continue; }
        const i = Math.floor(u.x + half), j = Math.floor(u.z + half);
        let v = i >= 0 && j >= 0 && i < R && j < R && this.visGrid[team][j * R + i] === 1;
        const b = brushAt(u.x, u.z);
        if (b) {
          // 덤불 안: 같은 덤불 안 또는 아주 가까운 적만 볼 수 있음
          v = this.units.some((o) => !o.dead && o.team === team && o.kind !== 'decoy' && (brushAt(o.x, o.z) === b || Math.hypot(o.x - u.x, o.z - u.z) < 1.6));
        }
        if (this.time < u.revealUntil && !b) v = v || false;
        u.visibleTo[team] = v;
      }
      u.brush = brushAt(u.x, u.z);
    }
    this.lastVision = this.time;
  }

  // ---------------- 웨이브 ----------------
  spawnWave() {
    this.waveN++;
    const siege = this.waveN % 3 === 0;
    const T = this.time / 60;
    for (let team = 0; team < 2; team++) {
      const colossus = this.teamBuffs[team].colossusUntil > this.time;
      for (const lane of ['top', 'mid', 'bot']) {
        const pts = team === 0 ? LANES[lane] : [...LANES[lane]].reverse();
        const kinds = ['melee', 'melee', 'melee', 'caster', 'caster'];
        if (siege) kinds.splice(3, 0, 'siege');
        kinds.forEach((k, i) => {
          this.after(i * 0.8, () => {
            if (this.over) return;
            const st = k === 'melee' ? { hp: 470 + T * 22, ad: 13 + T * 1.1, armor: 8 + T * 0.6, mr: 4, as: 0.8, range: 1.3, ms: 3.1, windup: 0.3 }
              : k === 'caster' ? { hp: 300 + T * 14, ad: 22 + T * 1.6, armor: 2, mr: 2, as: 0.7, range: 5.2, ms: 3.1, windup: 0.35 }
                : { hp: 900 + T * 40, ad: 40 + T * 3, armor: 14 + T, mr: 10, as: 0.5, range: 6.2, ms: 3.1, windup: 0.4 };
            const ddx = pts[1].x - pts[0].x, ddz = pts[1].z - pts[0].z, dd = Math.hypot(ddx, ddz);
            const sp = nearestWalkable(pts[0].x + (ddx / dd) * 5.5, pts[0].z + (ddz / dd) * 5.5, 6);
            const u = new Unit(this, 'minion', team, sp.x, sp.z, { r: k === 'siege' ? 0.75 : 0.42, sight: 7.5, name: k === 'melee' ? '근접 미니언' : k === 'caster' ? '마법 미니언' : '공성 미니언', stats: st });
            u.minionKind = k; u.ranged = k !== 'melee'; u.lanePts = pts; u.wp = 1; u.lane = lane;
            u.empowered = colossus;
            this.units.push(u);
          });
        });
      }
    }
  }

  // ---------------- 행동 (미니언/포탑/몬스터) ----------------
  findTargetFor(u, range) {
    let best = null, bs = Infinity;
    // 우선순위: 아군 챔피언을 공격한 적 챔피언 > 가까운 미니언 > 챔피언 > 건물
    const agg = this.lastChampAggro;
    for (const o of this.units) {
      if (o === u || o.dead || o.team === u.team || o.team === 2 || !this.canTarget(u, o)) continue;
      if (o.kind === 'decoy') continue;
      const d = dist(u, o);
      if (d > range + o.r) continue;
      let score = d;
      if (o.kind === 'champion') {
        const a = agg && agg.get(o);
        if (a && this.time - a.t < 2.5 && a.victim.team === u.team && dist(a.victim, u) < range + 3) score -= 100;
        else score += 12;
      } else if (o.kind === 'minion') score += 0;
      else if (o.kind === 'turret' || o.kind === 'nexus') { if (this.isProtected(o)) continue; score += u.kind === 'turret' ? 99 : 6; }
      if (score < bs) { bs = score; best = o; }
    }
    return best;
  }
  updateMinion(u, dt) {
    if (u.action) return;
    if (!u.retargetAt || this.time >= u.retargetAt || !u.target || u.target.dead || !this.canTarget(u, u.target) || dist(u, u.target) > 9) {
      u.target = this.findTargetFor(u, 6.5);
      u.retargetAt = this.time + 0.5;
    }
    if (u.target) {
      if (this.inRange(u, u.target)) { u.path = null; if (u.attackCd <= 0) this.startAttack(u, u.target); }
      else if (!u.path || this.time > u.repathAt) {
        if (lineWalkable(u.x, u.z, u.target.x, u.target.z)) { u.path = [{ x: u.target.x, z: u.target.z }]; u.repathAt = this.time + 0.3; }
        else this.setPath(u, u.target.x, u.target.z);
      }
      return;
    }
    // 공격로 따라 이동
    const pts = u.lanePts;
    while (u.wp < pts.length - 1 && dist(u, pts[u.wp]) < 2.5) u.wp++;
    const goal = u.wp >= pts.length - 1 ? this.nexus[1 - u.team] : pts[u.wp];
    if (!u.path || this.time > u.repathAt) {
      if (lineWalkable(u.x, u.z, goal.x, goal.z)) { u.path = [{ x: goal.x + (u.id % 5 - 2) * 0.35, z: goal.z + (u.id % 3 - 1) * 0.35 }]; u.repathAt = this.time + 0.5; u.goal = { x: goal.x, z: goal.z }; }
      else this.setPath(u, goal.x, goal.z);
    }
  }
  updateTurret(u) {
    if (u.action) return;
    const keep = u.target && !u.target.dead && this.canTarget(u, u.target) && dist(u, u.target) <= u.s.range + u.target.r;
    // 아군 챔피언을 공격한 적 챔피언으로 즉시 전환
    const agg = this.lastChampAggro;
    let swap = null;
    if (agg) for (const [c, a] of agg) if (!c.dead && c.team !== u.team && this.time - a.t < 0.5 && a.victim.team === u.team && dist(c, u) <= u.s.range + c.r && dist(a.victim, u) < u.s.range + 2 && this.canTarget(u, c)) swap = c;
    if (swap) u.target = swap;
    else if (!keep) u.target = this.findTargetFor(u, u.s.range);
    if (u.target && u.attackCd <= 0) this.startAttack(u, u.target);
  }
  updateMonster(u, dt) {
    const c = u.camp;
    const aggro = c.aggroBy && !c.aggroBy.dead && this.time - (c.aggroT || u.aggroT || 0) < 6 ? c.aggroBy : null;
    if (aggro && !u.target) u.target = aggro;
    if (u.target && (u.target.dead || dist(u.target, u.home) > 10 || dist(u, u.home) > 11)) { u.target = null; c.aggroBy = null; u.resetting = true; }
    if (u.resetting) {
      if (dist(u, u.home) < 0.8) { u.resetting = false; u.path = null; u.facing = u.facing; }
      else if (!u.path) this.setPath(u, u.home.x, u.home.z);
      u.hp = Math.min(u.s.hp, u.hp + u.s.hp * 0.15 * dt);
      return;
    }
    if (u.action) return;
    if (u.target) {
      if (this.inRange(u, u.target)) { u.path = null; if (u.attackCd <= 0) this.startAttack(u, u.target); }
      else if (!u.path || this.time > u.repathAt) { u.path = [{ x: u.target.x, z: u.target.z }]; u.repathAt = this.time + 0.3; }
    } else if (u.hp < u.s.hp) u.hp = Math.min(u.s.hp, u.hp + u.s.hp * 0.05 * dt);
  }

  // ---------------- 챔피언 업데이트 ----------------
  updateChampion(u, dt) {
    if (u.dead) {
      if (this.time >= u.respawnAt) this.respawn(u);
      return;
    }
    const b = BASES[u.team];
    // 재생
    const inFount = dist(u, b.fountain) < FOUNTAIN_R;
    const regen = u.s.hpR * (inFount ? 12 : 1) + (inFount ? u.s.hp * 0.1 : 0);
    if (u.hp < u.s.hp) u.hp = Math.min(u.s.hp, u.hp + regen * dt);
    u.mp = Math.min(u.s.mp, u.mp + (u.s.mpR + (inFount ? u.s.mp * 0.1 : 0)) * dt);
    if (u.potion && u.potion.until > this.time) u.hp = Math.min(u.s.hp, u.hp + u.potion.rate * dt);
    // 적 본진 샘: 진입한 적에게 강한 피해 (기지 수비)
    const eb = BASES[1 - u.team];
    if (dist(u, eb.fountain) < FOUNTAIN_R + 2) { u.hp -= 400 * dt; if (u.hp <= 0) this.kill(u, this.nexus[1 - u.team]); }
    // 패시브
    PASSIVES[u.def.id]?.tick?.(this, u, dt);
    // 귀환
    if (u.recall && this.time - u.recall.start >= u.recall.dur) {
      u.recall = null;
      u.x = b.fountain.x + (this.rand() - 0.5) * 2; u.z = b.fountain.z + (this.rand() - 0.5) * 2;
      u.path = null;
      this.events.push({ type: 'recallDone', u });
    }
    // 대기 중 시전 (접근 후)
    if (u.pendingCast && !u.action) {
      const pc = u.pendingCast;
      const sk = u.def.skills[pc.slot];
      if (!pc.target || pc.target.dead || (pc.target.team !== u.team && !this.canTarget(u, pc.target))) u.pendingCast = null;
      else if (dist(u, pc.target) <= sk.range + (pc.target.team !== u.team ? pc.target.r : 0.3)) { u.pendingCast = null; u.path = null; this.cmdCast(u, pc.slot, { target: pc.target }); }
      else if (this.time > u.repathAt) this.setPath(u, pc.target.x, pc.target.z);
    }
    // 공격 이동: 경로 진행 중 주변 적 자동 공격
    if (u.attackMove && !u.target) {
      const t = this.findTargetFor(u, u.s.range + 2.5);
      if (t) { u.target = t; }
      else if (!u.path) u.attackMove = null;
    }
    // 기본 공격
    if (u.target) {
      const t = u.target;
      if (!this.canTarget(u, t)) { u.target = null; if (u.attackMove) this.setPath(u, u.attackMove.x, u.attackMove.z); }
      else if (!u.action && !u.dash && !u.cc) {
        if (this.inRange(u, t)) {
          u.path = null;
          if (u.attackCd <= 0) this.startAttack(u, t);
          else u.facing = turnTo(u.facing, Math.atan2(t.x - u.x, t.z - u.z), dt * 12);
        } else if (!u.holdPosition) {
          if (!u.path || this.time > u.repathAt || (u.goal && dist(u.goal, t) > 1.5)) {
            if (lineWalkable(u.x, u.z, t.x, t.z)) { u.path = [{ x: t.x, z: t.z }]; u.goal = { x: t.x, z: t.z }; u.repathAt = this.time + 0.15; }
            else this.setPath(u, t.x, t.z);
          }
        }
      }
    }
  }
  respawn(u) {
    const b = BASES[u.team];
    u.dead = false; u.x = b.fountain.x; u.z = b.fountain.z;
    this.recalcStats(u);
    u.hp = u.s.hp; u.mp = u.s.mp; u.status = []; u.shields = [];
    u.target = null; u.path = null; u.action = null; u.dash = null;
    this.events.push({ type: 'respawn', u });
  }

  // ---------------- 메인 틱 ----------------
  step(dt = TICK) {
    if (this.over) return;
    // 렌더 보간용 이전 틱 위치 (화면은 60Hz 이상, 시뮬레이션은 30Hz)
    for (const u of this.units) { u.px = u.x; u.pz = u.z; }
    this.time += dt;
    // 웨이브
    if (this.time >= this.nextWave) { this.spawnWave(); this.nextWave += 30; }
    // 정글
    for (const c of this.camps) if (!c.alive && this.time >= c.respawnAt) this.spawnCamp(c);
    // 패시브 골드
    if (this.time > 60) for (const c of this.champions) c.gold += (c.def.roles.includes('support') ? 2.6 : 2.0) * dt;
    this.updateTimers();
    // 같은 틱 안의 처리 순서 편향 제거: 매 틱 순서를 번갈아 처리
    this.tickN = (this.tickN || 0) + 1;
    const order = this.tickN % 2 ? this.units : [...this.units].reverse();
    for (const u of order) {
      if (u.dead) { if (u.kind === 'champion' && this.time >= u.respawnAt) this.respawn(u); continue; }
      u.attackCd -= dt;
      if (u.hitFlash > 0) u.hitFlash -= dt;
      if (u.hp > u.s.hp) u.hp = u.s.hp;
      // 상태/보호막 정리
      if (u.status.length) u.status = u.status.filter((s) => s.until > this.time);
      if (u.shields.length) u.shields = u.shields.filter((s) => s.until > this.time && s.amt > 0);
      // 액션 진행
      if (u.action) {
        const a = u.action;
        if (a.kind === 'attack' && (!a.target || a.target.dead || (!this.canTarget(u, a.target) && !a.fired))) { u.action = null; }
        else {
          a.t += dt;
          if (!a.fired && a.t >= a.windup) {
            a.fired = true;
            if (a.kind === 'attack') this.fireAttack(u, a.target);
            else this.executeSkill(u, a);
          }
          if (a.fired && a.t >= a.total && !(a.channelUntil > this.time)) u.action = null;
        }
      }
      if (u.kind === 'champion') this.updateChampion(u, dt);
      else if (u.kind === 'minion') this.updateMinion(u, dt);
      else if (u.kind === 'turret') this.updateTurret(u, dt);
      else if (u.kind === 'monster') this.updateMonster(u, dt);
      else if (u.kind === 'nexus') { if (u.hp < u.s.hp) u.hp = Math.min(u.s.hp, u.hp + u.s.hpR * dt); }
      else if (u.kind === 'decoy') { if (this.time >= u.until) { u.dead = true; } else if (u.path) {} }
      if (!u.dead && u.kind !== 'turret' && u.kind !== 'nexus') this.moveUnit(u, dt);
    }
    // 미니언 한계 도달 후 재평가: 1초마다 챔피언 스탯 재계산 (버프 만료 반영)
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) for (const c of this.champions) if (!c.dead) this.recalcStats(c);
    this.separate();
    this.updateProjectiles(dt);
    this.updateZones();
    this.telegraphs = this.telegraphs.filter((t) => t.end + 0.4 > this.time);
    if (this.time - this.lastVision >= 0.2) this.updateVision();
    // 죽은 비챔피언 정리
    if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.units = this.units.filter((u) => !u.dead || u.kind === 'champion' || u.kind === 'turret' || u.kind === 'nexus' || this.time - u.deathTime < 3);
  }
  executeSkill(u, a) {
    const fn = SKILLS[u.def.id]?.[a.slot];
    const lv = u.skillLv[a.slot];
    if (fn) fn(this, u, { ...a.data, lv, idx: Math.max(0, lv - 1), sk: u.def.skills[a.slot], action: a });
    if (a.slot !== 'R') PASSIVES[u.def.id]?.onCast?.(this, u, a.slot);
  }
  // AI·자동조준 공정성: 해당 팀이 보고 있는 적만
  visibleEnemies(team, x, z, r) {
    return this.units.filter((u) => !u.dead && u.team !== team && u.team !== 2 && u.visibleTo[team] && u.kind !== 'decoy' && (r == null || Math.hypot(u.x - x, u.z - z) <= r));
  }
}

export function turnTo(cur, target, maxStep) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}
export { dist };
