// 챔피언 스킬 & 패시브 구현. 모든 범위 효과는 telegraph(도형)를 먼저 등록하고, 같은 도형으로 판정한다.
import { circle, rect, cone, ring, hitShape } from './shapes.js';
import { isWalkable, nearestWalkable } from '../map/grid.js';

const V = (arr, i) => arr[Math.min(arr.length - 1, Math.max(0, i))];
const dmgOf = (u, sk, i) => V(sk.base, i) + (sk.ad || 0) * u.s.ad + (sk.ap || 0) * u.s.ap;
const fx = (sim, name, o) => sim.events.push({ type: 'fx', name, ...o });
const isChampOrMinion = (t) => t.kind === 'champion' || t.kind === 'minion' || t.kind === 'monster';

// 패시브 강화 소모 헬퍼
function consume(u, key, threshold) {
  if (u.pass[key] >= threshold) { u.pass[key] = 0; u.pass.justConsumed = true; return true; }
  return false;
}

export const PRE = {
  koo: { R: (sim, u, c) => sim.telegraph(rect(u.x, u.z, c.dir.x, c.dir.z, c.sk.range, c.sk.width), u.team, c.sk.castTime, 0, { style: 'danger', label: 'koo_R' }) },
  park: { Q: (sim, u, c) => sim.telegraph(cone(u.x, u.z, c.dir.x, c.dir.z, c.sk.range, c.sk.angle), u.team, c.sk.castTime, 0.1, { style: 'danger' }) },
  koo_Q: null,
};

export const SKILLS = {
  // ① 김두영
  pang: {
    Q(sim, u, c) {
      const emp = consume(u, 'stacks', 3);
      const p = c.point, sk = c.sk, flight = 0.5;
      const shape = circle(p.x, p.z, sk.radius);
      sim.telegraph(shape, u.team, flight, 0.15, { style: 'danger', label: 'pang_Q' });
      sim.spawnProjectile({ kind: 'lob', src: u, x: u.x, z: u.z, tx: p.x, tz: p.z, flight, arc: 2.2, vis: 'vial', onLand: () => {
        const d = dmgOf(u, sk, c.idx) * (emp ? 1.5 : 1);
        for (const t of sim.enemiesIn(shape, u.team)) sim.dealDamage(u, t, d, 'magic');
        fx(sim, 'glassBurst', { x: p.x, z: p.z, r: sk.radius, color: 0x6af0d8, emp });
      } });
    },
    W(sim, u, c) {
      const emp = consume(u, 'stacks', 3);
      const t = c.target && !c.target.dead ? c.target : u;
      const k = emp ? 1.5 : 1;
      sim.heal(u, t, (V(c.sk.base, c.idx) + c.sk.ap * u.s.ap) * k);
      const hot = V(c.sk.hot, c.idx) * k;
      for (let i = 1; i <= 6; i++) sim.after(i * 0.5, () => sim.heal(u, t, hot / 6, { silent: i % 2 === 1 }));
      fx(sim, 'healBurst', { u: t, color: 0x7af0e0 });
      sim.applyStatus(u, t, 'hot', 3, 0);
    },
    E(sim, u, c) {
      const emp = consume(u, 'stacks', 3);
      const p = c.point, sk = c.sk;
      const shape = circle(p.x, p.z, sk.radius);
      sim.telegraph(shape, u.team, 0, 3, { style: 'zone', label: 'pang_E' });
      let first = true;
      sim.spawnZone({ shape, team: u.team, until: sim.time + 3, interval: 0.5, filter: (t) => t.team !== u.team && isChampOrMinion(t), vis: 'goo', src: u,
        onTick(us) {
          for (const t of us) {
            sim.applyStatus(u, t, 'slow', 0.6, emp ? 0.55 : 0.35);
            sim.dealDamage(u, t, (V(sk.base, c.idx) + sk.ap * u.s.ap) * 0.5, 'magic');
            if (emp && first) sim.applyStatus(u, t, 'root', 0.6);
          }
          first = false;
        } });
      fx(sim, 'gooSplash', { x: p.x, z: p.z, r: sk.radius });
    },
    R(sim, u, c) {
      const p = c.point, sk = c.sk;
      const shape = circle(p.x, p.z, sk.radius);
      sim.telegraph(shape, u.team, 0, 5, { style: 'allyZone', label: 'pang_R' });
      for (const a of sim.alliesIn(shape, u.team)) sim.addShield(u, a, V(sk.shield, c.idx) + 0.3 * u.s.ap, 3);
      sim.spawnZone({ shape, team: u.team, until: sim.time + 5, interval: 1, tickDelay: 0.5, filter: (t) => t.team === u.team && t.kind === 'champion', vis: 'elixir', src: u,
        onTick(us) { for (const a of us) sim.heal(u, a, V(sk.base, c.idx) + sk.ap * u.s.ap); } });
      fx(sim, 'grandElixir', { x: p.x, z: p.z, r: sk.radius });
    },
  },
  // ② 구자현
  koo: {
    Q(sim, u, c) {
      const sk = c.sk;
      const shape = rect(u.x, u.z, c.dir.x, c.dir.z, sk.range, sk.width);
      sim.telegraph(shape, u.team, 0, 0.2, { style: 'danger' });
      for (const t of sim.enemiesIn(shape, u.team)) {
        sim.dealDamage(u, t, dmgOf(u, sk, c.idx) + u.s.hp * 0.03, 'phys');
        sim.applyStatus(u, t, 'slow', 1, 0.3);
      }
      fx(sim, 'shieldBash', { x: u.x + c.dir.x * 1.6, z: u.z + c.dir.z * 1.6, dir: c.dir });
    },
    W(sim, u, c) {
      sim.applyStatus(u, u, 'fortress', 3, V(c.sk.base, c.idx) / 100);
      sim.applyStatus(u, u, 'slow', 3, 0.25);
      sim.recalcStats(u);
      fx(sim, 'fortress', { u });
    },
    E(sim, u, c) {
      const sk = c.sk;
      let hitOne = false;
      sim.startDash(u, u.x + c.dir.x * sk.range, u.z + c.dir.z * sk.range, 16, {
        onTick(me, D) {
          if (hitOne) return;
          for (const t of sim.enemiesIn(circle(me.x, me.z, sk.width / 2 + 0.3), u.team)) {
            hitOne = true;
            sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'phys');
            if (t.kind !== 'monster' || !t.big) sim.startDash(t, t.x + c.dir.x * 3, t.z + c.dir.z * 3, 14, { face: false, forced: true });
            fx(sim, 'impact', { x: t.x, z: t.z, color: 0xff8a2a });
            me.dash.t = me.dash.dur; // 첫 적중 시 정지
            break;
          }
        },
      });
      fx(sim, 'dust', { u });
    },
    R(sim, u, c) {
      const sk = c.sk;
      const hit = new Set();
      sim.startDash(u, u.x + c.dir.x * sk.range, u.z + c.dir.z * sk.range, 17, {
        onTick(me) {
          for (const t of sim.enemiesIn(circle(me.x, me.z, sk.width / 2 + 0.2), u.team)) {
            if (hit.has(t)) continue;
            hit.add(t);
            sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'phys');
            sim.applyStatus(u, t, 'airborne', 1.0);
            fx(sim, 'impact', { x: t.x, z: t.z, color: 0xff8a2a, big: true });
          }
        },
        onEnd(me) { fx(sim, 'groundSlam', { x: me.x, z: me.z, r: 2.2, color: 0xff8a2a }); },
      });
      fx(sim, 'chargeTrail', { u, color: 0xff8a2a });
    },
  },
  // ③ 방지욱
  bang: {
    Q(sim, u, c) {
      const sk = c.sk;
      sim.spawnProjectile({ kind: 'line', src: u, x: u.x, z: u.z, dx: c.dir.x, dz: c.dir.z, speed: sk.speed, range: sk.range, w: sk.width, vis: 'shadowBlade', wallStop: true,
        onHit(p, t) { sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'phys'); sim.applyStatus(u, t, 'mark', 4); fx(sim, 'impact', { x: t.x, z: t.z, color: 0xb06aff }); } });
      sim.telegraph(rect(u.x, u.z, c.dir.x, c.dir.z, sk.range, sk.width), u.team, 0, sk.range / sk.speed, { style: 'line' });
    },
    W(sim, u, c) {
      // 잔영: 현재 진행 방향으로 계속 움직이는 가짜 유닛
      const Dec = sim.units[0].constructor;
      const d = new Dec(sim, 'decoy', u.team, u.x, u.z, { r: 0.5, sight: 0, name: u.name });
      d.def = u.def; d.until = sim.time + 2; d.facing = u.facing; d.s.ms = u.s.ms * 1.1; d.source = u; d.s.hp = d.hp = 1;
      const tx = u.x + Math.sin(u.facing) * 4, tz = u.z + Math.cos(u.facing) * 4;
      d.path = [nearestWalkable(tx, tz, 4)];
      sim.units.push(d);
      sim.applyStatus(u, u, 'haste', 1.5, 0.4);
      fx(sim, 'afterimage', { u });
    },
    E(sim, u, c) {
      sim.startDash(u, u.x + c.dir.x * c.sk.range, u.z + c.dir.z * c.sk.range, 20, {});
      u.pass.empAttack = { until: sim.time + 4, bonus: V(c.sk.base, c.idx) / 100 };
      fx(sim, 'afterimage', { u, dash: true });
    },
    R(sim, u, c) {
      const t = c.target, sk = c.sk;
      if (!t || t.dead) return;
      sim.applyStatus(u, u, 'untargetable', 1.05);
      const a0 = Math.atan2(u.x - t.x, u.z - t.z);
      const pts = [0, 1, 2, 3].map((i) => { const a = a0 + Math.PI / 2 + i * (Math.PI / 2); return { x: t.x + Math.sin(a) * 1.6, z: t.z + Math.cos(a) * 1.6 }; });
      fx(sim, 'phantomRing', { x: t.x, z: t.z, pts, u });
      pts.forEach((p, i) => sim.after(0.12 + i * 0.22, () => {
        if (t.dead || u.dead) return;
        const q = nearestWalkable(t.x + (p.x - t.x), t.z + (p.z - t.z), 3);
        u.x = q.x; u.z = q.z; u.facing = Math.atan2(t.x - u.x, t.z - u.z);
        sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'phys', { ignoreUntargetable: false });
        fx(sim, 'phantomSlash', { x: t.x, z: t.z, from: { x: q.x, z: q.z }, i });
      }));
    },
  },
  // ④ 팽재현
  park: {
    Q(sim, u, c) {
      const emp = consume(u, 'heat', 100);
      const sk = c.sk;
      const shape = cone(u.x, u.z, c.dir.x, c.dir.z, sk.range, sk.angle);
      for (const t of sim.enemiesIn(shape, u.team)) {
        sim.dealDamage(u, t, dmgOf(u, sk, c.idx) * (emp ? 1.4 : 1), 'phys');
        if (emp) sim.applyStatus(u, t, 'stun', 0.5);
      }
      fx(sim, 'hammerSlam', { x: u.x + c.dir.x * 1.8, z: u.z + c.dir.z * 1.8, dir: c.dir, r: sk.range, angle: sk.angle, emp });
    },
    W(sim, u, c) {
      const emp = consume(u, 'heat', 100);
      const sk = c.sk;
      sim.addShield(u, u, V(sk.base, c.idx) * (emp ? 1.4 : 1) + 0.08 * u.s.hp, 3);
      const shape = circle(u.x, u.z, sk.radius);
      sim.spawnZone({ shape, follow: u, team: u.team, until: sim.time + 3, interval: 0.5, filter: (t) => t.team !== u.team && isChampOrMinion(t), vis: 'heatAura', src: u,
        onTick(us) { for (const t of us) sim.dealDamage(u, t, V(sk.dps, c.idx) * 0.5 * (emp ? 1.4 : 1), 'magic'); } });
      fx(sim, 'quench', { u });
    },
    E(sim, u, c) {
      const emp = consume(u, 'heat', 100);
      const sk = c.sk, hit = new Set();
      sim.startDash(u, u.x + c.dir.x * sk.range, u.z + c.dir.z * sk.range, 14, {
        onTick(me) {
          for (const t of sim.enemiesIn(circle(me.x, me.z, sk.width / 2 + 0.2), u.team)) {
            if (hit.has(t)) continue; hit.add(t);
            sim.dealDamage(u, t, dmgOf(u, sk, c.idx) * (emp ? 1.4 : 1), 'phys');
            sim.applyStatus(u, t, 'slow', 1.5, 0.25);
            fx(sim, 'impact', { x: t.x, z: t.z, color: 0xff9a3a });
          }
        },
      });
    },
    R(sim, u, c) {
      const sk = c.sk, p = c.point;
      const outer = circle(p.x, p.z, sk.radius), inner = circle(p.x, p.z, sk.inner);
      sim.telegraph(outer, u.team, sk.delay, 0.2, { style: 'danger', label: 'park_R_outer' });
      sim.telegraph(inner, u.team, sk.delay, 0.2, { style: 'cc', label: 'park_R_inner' });
      fx(sim, 'anvilDrop', { x: p.x, z: p.z, delay: sk.delay });
      sim.after(sk.delay, () => {
        const d = dmgOf(u, sk, c.idx);
        for (const t of sim.enemiesIn(outer, u.team)) {
          if (hitShape(inner, t.x, t.z, t.r)) { sim.dealDamage(u, t, d, 'phys'); sim.applyStatus(u, t, 'stun', 1.25); }
          else { sim.dealDamage(u, t, d * 0.5, 'phys'); sim.applyStatus(u, t, 'slow', 1.5, 0.4); }
        }
        fx(sim, 'anvilImpact', { x: p.x, z: p.z, r: sk.radius, inner: sk.inner, shake: 0.5 });
      });
    },
  },
  // ⑤ 이선용
  jung: {
    Q(sim, u, c) {
      const sk = c.sk, hit = new Set();
      const shape = cone(u.x, u.z, c.dir.x, c.dir.z, 2.6, 100);
      for (const t of sim.enemiesIn(shape, u.team)) { hit.add(t); sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'phys'); }
      sim.spawnProjectile({ kind: 'line', src: u, x: u.x + c.dir.x * 0.8, z: u.z + c.dir.z * 0.8, dx: c.dir.x, dz: c.dir.z, speed: sk.speed, range: sk.range - 0.8, w: sk.width, pierce: true, vis: 'dawnWave', hit,
        onHit(p, t) { sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'phys'); fx(sim, 'impact', { x: t.x, z: t.z, color: 0xffd86a }); } });
      sim.telegraph(rect(u.x, u.z, c.dir.x, c.dir.z, sk.range, sk.width), u.team, 0, sk.range / sk.speed, { style: 'line' });
      fx(sim, 'swordArc', { u, dir: c.dir, color: 0xffe08a });
    },
    W(sim, u, c) {
      const t = c.target && !c.target.dead ? c.target : u;
      sim.addShield(u, t, V(c.sk.base, c.idx) + c.sk.ad * u.s.ad, 2.5);
      fx(sim, 'oathShield', { u: t });
    },
    E(sim, u, c) {
      const sk = c.sk;
      sim.startDash(u, u.x + c.dir.x * sk.range, u.z + c.dir.z * sk.range, 18, {
        onEnd(me) {
          const shape = circle(me.x, me.z, 1.8);
          for (const t of sim.enemiesIn(shape, u.team)) sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'phys');
          fx(sim, 'lightLand', { x: me.x, z: me.z, r: 1.8 });
        },
      });
      fx(sim, 'chargeTrail', { u, color: 0xffe08a });
    },
    R(sim, u, c) {
      const sk = c.sk;
      const shape = circle(u.x, u.z, sk.radius);
      sim.telegraph(shape, u.team, 3.7, 0.3, { style: 'allyZone', label: 'jung_R', burst: true });
      sim.spawnZone({ shape, team: u.team, until: sim.time + 4, interval: 0.25, filter: (t) => t.team === u.team && t.kind === 'champion', vis: 'sanctum', src: u,
        onTick(us) { for (const a of us) { sim.applyStatus(u, a, 'sanctum', 0.35); } },
        onEnd() {
          for (const t of sim.enemiesIn(shape, u.team)) sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic');
          fx(sim, 'dawnBurst', { x: shape.x, z: shape.z, r: sk.radius });
        } });
      fx(sim, 'sanctumRise', { x: u.x, z: u.z, r: sk.radius });
    },
  },
  // ⑥ 사공민
  cha: {
    Q(sim, u, c) {
      const sk = c.sk;
      let n = 0;
      sim.spawnProjectile({ kind: 'line', src: u, x: u.x, z: u.z, dx: c.dir.x, dz: c.dir.z, speed: sk.speed, range: sk.range, w: sk.width, pierce: true, vis: 'pierceArrow',
        onHit(p, t) { sim.dealDamage(u, t, dmgOf(u, sk, c.idx) * Math.max(0.5, 1 - 0.1 * n++), 'phys'); fx(sim, 'impact', { x: t.x, z: t.z, color: 0x9ae8ff }); } });
      sim.telegraph(rect(u.x, u.z, c.dir.x, c.dir.z, sk.range, sk.width), u.team, 0, sk.range / sk.speed, { style: 'line' });
    },
    W(sim, u, c) { sim.applyStatus(u, u, 'aim', 4, V(c.sk.base, c.idx) / 100); sim.recalcStats(u); fx(sim, 'aimFocus', { u }); },
    E(sim, u, c) { sim.startDash(u, u.x + c.dir.x * c.sk.range, u.z + c.dir.z * c.sk.range, 22, {}); fx(sim, 'windStep', { u }); },
    R(sim, u, c) {
      const sk = c.sk;
      const shape = cone(u.x, u.z, c.dir.x, c.dir.z, sk.range, sk.angle);
      sim.telegraph(shape, u.team, 0, sk.channel, { style: 'danger', label: 'cha_R' });
      c.action.channelUntil = sim.time + sk.channel;
      c.action.total = sk.channel + 0.2;
      const base = Math.atan2(c.dir.x, c.dir.z);
      for (let i = 0; i < 12; i++) sim.after(0.08 + i * (sk.channel / 12), () => {
        if (u.dead || u.cc || !(c.action === u.action)) return;
        const a = base + (sim.rand() - 0.5) * (sk.angle * Math.PI / 180) * 0.92;
        const dx = Math.sin(a), dz = Math.cos(a);
        sim.spawnProjectile({ kind: 'line', src: u, x: u.x, z: u.z, dx, dz, speed: 28, range: sk.range, w: 0.6, vis: 'stormArrow',
          onHit(p, t) { sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'phys'); fx(sim, 'impact', { x: t.x, z: t.z, color: 0x9ae8ff }); } });
        fx(sim, 'bowFire', { u });
      });
    },
  },
  // ⑦ 차동호
  sagong: {
    Q(sim, u, c) {
      const sk = c.sk;
      sim.spawnProjectile({ kind: 'line', src: u, x: u.x, z: u.z, dx: c.dir.x, dz: c.dir.z, speed: sk.speed, range: sk.range, w: sk.width, vis: 'starShard', wallStop: true,
        onHit(p, t) { sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic'); starStack(u); fx(sim, 'starHit', { x: t.x, z: t.z }); } });
      sim.telegraph(rect(u.x, u.z, c.dir.x, c.dir.z, sk.range, sk.width), u.team, 0, sk.range / sk.speed, { style: 'line' });
    },
    W(sim, u, c) {
      const sk = c.sk, p = c.point;
      const shape = circle(p.x, p.z, sk.radius);
      sim.telegraph(shape, u.team, 1.4, 0.2, { style: 'danger', label: 'sagong_W' });
      sim.spawnZone({ shape, team: u.team, until: sim.time + 1.4, interval: 0.25, filter: (t) => t.team !== u.team && isChampOrMinion(t), vis: 'gravity', src: u,
        onTick(us) { for (const t of us) sim.applyStatus(u, t, 'slow', 0.35, 0.4); },
        onEnd() {
          for (const t of sim.enemiesIn(shape, u.team)) {
            sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic'); starStack(u);
            if (!(t.kind === 'monster' && t.big)) sim.startDash(t, p.x, p.z, 12, { face: false, forced: true });
          }
          fx(sim, 'gravityCollapse', { x: p.x, z: p.z, r: sk.radius });
        } });
    },
    E(sim, u, c) {
      const sk = c.sk;
      const ox = u.x, oz = u.z;
      let tx = u.x + c.dir.x * sk.range, tz = u.z + c.dir.z * sk.range;
      if (!isWalkable(tx, tz)) { const q = nearestWalkable(tx, tz, 4); tx = q.x; tz = q.z; }
      u.x = tx; u.z = tz; u.path = null;
      fx(sim, 'blink', { from: { x: ox, z: oz }, to: { x: tx, z: tz } });
      const shape = circle(ox, oz, sk.radius);
      sim.telegraph(shape, u.team, 0.6, 0.15, { style: 'danger' });
      sim.after(0.6, () => { for (const t of sim.enemiesIn(shape, u.team)) { sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic'); starStack(u); } fx(sim, 'starBurst', { x: ox, z: oz, r: sk.radius }); });
    },
    R(sim, u, c) {
      const sk = c.sk, p = c.point;
      const big = circle(p.x, p.z, sk.radius);
      sim.telegraph(big, u.team, sk.delay + 7 * 0.22, 0.2, { style: 'dangerSoft', label: 'sagong_R' });
      const pts = [{ x: p.x, z: p.z }];
      for (let i = 1; i < 7; i++) { const a = sim.rand() * Math.PI * 2, r = 1.5 + sim.rand() * (sk.radius - 2.2); pts.push({ x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r }); }
      pts.forEach((q, i) => {
        const s = circle(q.x, q.z, 1.8), when = sk.delay + i * 0.22;
        sim.telegraph(s, u.team, when, 0.15, { style: 'danger', label: 'meteor' });
        fx(sim, 'meteorFall', { x: q.x, z: q.z, delay: when });
        sim.after(when, () => { for (const t of sim.enemiesIn(s, u.team)) { sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic'); } fx(sim, 'meteorImpact', { x: q.x, z: q.z, r: 1.8, shake: 0.15 }); });
      });
    },
  },
  // ⑧ 조강희
  cho: {
    Q(sim, u, c) {
      const sk = c.sk;
      const shape = rect(u.x, u.z, c.dir.x, c.dir.z, sk.range, sk.width);
      sim.telegraph(shape, u.team, 0, 0.18, { style: 'danger' });
      for (const t of sim.enemiesIn(shape, u.team)) sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'phys');
      fx(sim, 'thrust', { u, dir: c.dir, len: sk.range });
    },
    W(sim, u, c) {
      const total = V(c.sk.base, c.idx) + c.sk.ad * u.s.ad;
      for (let i = 1; i <= 4; i++) sim.after(i * 0.5, () => sim.heal(u, u, total / 4, { silent: i < 4 }));
      sim.applyStatus(u, u, 'armorUp', 3, 20); sim.recalcStats(u);
      fx(sim, 'forestBreath', { u });
    },
    E(sim, u, c) {
      const sk = c.sk, p = c.point;
      sim.telegraph(circle(p.x, p.z, sk.radius), u.team, Math.hypot(p.x - u.x, p.z - u.z) / 14, 0.15, { style: 'danger' });
      sim.startDash(u, p.x, p.z, 14, { leap: true,
        onEnd(me) {
          const shape = circle(me.x, me.z, sk.radius);
          for (const t of sim.enemiesIn(shape, u.team)) { sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'phys'); sim.applyStatus(u, t, 'slow', 1.5, 0.3); }
          fx(sim, 'beastLand', { x: me.x, z: me.z, r: sk.radius });
        } });
    },
    R(sim, u, c) {
      sim.applyStatus(u, u, 'chaseR', 6); sim.applyStatus(u, u, 'haste', 6, 0.3); sim.recalcStats(u);
      u.pass.rStun = { until: sim.time + 6, dmg: dmgOf(u, c.sk, c.idx) };
      fx(sim, 'primalAura', { u });
    },
  },
  // ⑨ 정석호
  kim: {
    Q(sim, u, c) {
      const sk = c.sk, p = c.point;
      const shape = circle(p.x, p.z, sk.radius);
      sim.telegraph(shape, u.team, sk.flight, 0.15, { style: 'danger', label: 'kim_Q' });
      sim.spawnProjectile({ kind: 'lob', src: u, x: u.x, z: u.z, tx: p.x, tz: p.z, flight: sk.flight, arc: 4.5, vis: 'arcaneShell', y: 1.6, onLand: () => {
        for (const t of sim.enemiesIn(shape, u.team)) sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic');
        fx(sim, 'arcaneBlast', { x: p.x, z: p.z, r: sk.radius, shake: 0.12 });
      } });
    },
    W(sim, u, c) {
      const sk = c.sk, p = c.point;
      u.pass.mines = (u.pass.mines || []).filter((z) => !z.done);
      if (u.pass.mines.length >= 3) { const old = u.pass.mines.shift(); old.done = true; }
      const shape = circle(p.x, p.z, sk.radius);
      const z = sim.spawnZone({ shape, team: u.team, until: sim.time + 30, interval: 0.1, tickDelay: 1.0, vis: 'mine', src: u, hiddenFromEnemy: true,
        filter: (t) => t.team !== u.team && isChampOrMinion(t),
        onTick(us) {
          if (!us.length) return;
          for (const t of sim.enemiesIn(shape, u.team)) { sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic'); sim.applyStatus(u, t, 'slow', 1.5, 0.4); }
          fx(sim, 'mineBlast', { x: p.x, z: p.z, r: sk.radius });
          z.done = true;
        } });
      u.pass.mines.push(z);
    },
    E(sim, u, c) {
      const sk = c.sk;
      const shape = cone(u.x, u.z, c.dir.x, c.dir.z, sk.range, sk.angle);
      sim.telegraph(shape, u.team, 0, 0.18, { style: 'danger' });
      for (const t of sim.enemiesIn(shape, u.team)) sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic');
      fx(sim, 'recoilBlast', { u, dir: c.dir, r: sk.range, angle: sk.angle });
      sim.startDash(u, u.x - c.dir.x * 3, u.z - c.dir.z * 3, 14, { face: false });
    },
    R(sim, u, c) {
      const sk = c.sk, p = c.point;
      sim.telegraph(circle(p.x, p.z, sk.radius), u.team, sk.delay + 8 * 0.2, 0.2, { style: 'dangerSoft', label: 'kim_R' });
      for (let i = 0; i < 8; i++) {
        const a = sim.rand() * Math.PI * 2, r = Math.sqrt(sim.rand()) * (sk.radius - 1.4);
        const q = { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r };
        const s = circle(q.x, q.z, 1.6), when = sk.delay + i * 0.2;
        sim.telegraph(s, u.team, when, 0.15, { style: 'danger', label: 'shell' });
        const flight = 0.8;
        // 실제 포탄: 착탄 시각에 정확히 표시 지점에 떨어짐
        sim.after(Math.max(0, when - flight), () => {
          if (u.dead) return;
          sim.spawnProjectile({ kind: 'lob', src: u, x: u.x, z: u.z, tx: q.x, tz: q.z, flight: Math.min(flight, when), arc: 7, y: 1.6, vis: 'arcaneShell', onLand: () => {
            for (const t of sim.enemiesIn(s, u.team)) sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic');
            fx(sim, 'arcaneBlast', { x: q.x, z: q.z, r: 1.6, shake: 0.08 });
          } });
          fx(sim, 'cannonFire', { u });
        });
      }
    },
  },
  // ⑩ 박철호
  lee: {
    Q(sim, u, c) {
      const sk = c.sk;
      sim.spawnProjectile({ kind: 'line', src: u, x: u.x, z: u.z, dx: c.dir.x, dz: c.dir.z, speed: sk.speed, range: sk.range, w: sk.width, pierce: true, vis: 'soundWave',
        onHit(p, t) { sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic'); } });
      sim.telegraph(rect(u.x, u.z, c.dir.x, c.dir.z, sk.range, sk.width), u.team, 0, sk.range / sk.speed, { style: 'line' });
    },
    W(sim, u, c) {
      const shape = circle(u.x, u.z, c.sk.radius);
      for (const a of sim.alliesIn(shape, u.team)) sim.addShield(u, a, V(c.sk.base, c.idx) + c.sk.ap * u.s.ap, 2.5);
      fx(sim, 'harmonyPulse', { x: u.x, z: u.z, r: c.sk.radius, color: 0x7af0e0 });
    },
    E(sim, u, c) {
      const shape = circle(u.x, u.z, c.sk.radius);
      for (const a of sim.alliesIn(shape, u.team)) sim.applyStatus(u, a, 'haste', 2.5, V(c.sk.base, c.idx) / 100);
      fx(sim, 'marchPulse', { x: u.x, z: u.z, r: c.sk.radius, color: 0xffa6e0 });
    },
    R(sim, u, c) {
      const sk = c.sk;
      const shape = cone(u.x, u.z, c.dir.x, c.dir.z, sk.range, sk.angle);
      sim.telegraph(shape, u.team, 0.25, 0.25, { style: 'cc', label: 'lee_R' });
      sim.after(0.25, () => {
        for (const t of sim.enemiesIn(shape, u.team)) { sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic'); sim.applyStatus(u, t, 'stun', 1.2); }
      });
      fx(sim, 'resonanceWave', { x: u.x, z: u.z, dir: c.dir, r: sk.range, angle: sk.angle });
    },
  },
  // ⑪ 최길용
  choi: {
    Q(sim, u, c) {
      const sk = c.sk;
      sim.spawnProjectile({ kind: 'line', src: u, x: u.x, z: u.z, dx: c.dir.x, dz: c.dir.z, speed: sk.speed, range: sk.range, w: sk.width, pierce: false, vis: 'frostBolt',
        onHit(p, t) {
          sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic');
          sim.applyStatus(u, t, 'slow', 1.5, 0.35);
          chill(sim, u, t);
          fx(sim, 'frostHit', { x: t.x, z: t.z });
        } });
      sim.telegraph(rect(u.x, u.z, c.dir.x, c.dir.z, sk.range, sk.width), u.team, 0, sk.range / sk.speed, { style: 'line' });
    },
    W(sim, u, c) {
      const sk = c.sk, p = c.point;
      const shape = circle(p.x, p.z, sk.radius);
      const chilled = new Set();
      sim.telegraph(shape, u.team, 0, 2.5, { style: 'dangerSoft', label: 'choi_W' });
      sim.spawnZone({ shape, team: u.team, until: sim.time + 2.5, interval: 0.5, vis: 'frost', src: u,
        filter: (t) => t.team !== u.team && isChampOrMinion(t),
        onTick(us) {
          for (const t of us) {
            sim.dealDamage(u, t, (V(sk.base, c.idx) + sk.ap * u.s.ap) * 0.5, 'magic');
            sim.applyStatus(u, t, 'slow', 0.6, 0.4);
            if (t.kind === 'champion' && !chilled.has(t)) { chilled.add(t); chill(sim, u, t); }
          }
        } });
      fx(sim, 'frostBloom', { x: p.x, z: p.z, r: sk.radius });
    },
    E(sim, u, c) {
      const sk = c.sk;
      sim.startDash(u, u.x + c.dir.x * sk.range, u.z + c.dir.z * sk.range, 17, {});
      sim.addShield(u, u, V(sk.base, c.idx) + sk.ap * u.s.ap, 2);
      fx(sim, 'iceSlide', { u, dir: c.dir });
    },
    R(sim, u, c) {
      const sk = c.sk, p = c.point;
      const shape = circle(p.x, p.z, sk.radius);
      sim.telegraph(shape, u.team, sk.delay, 0.25, { style: 'cc', label: 'choi_R' });
      fx(sim, 'absoluteZeroCharge', { x: p.x, z: p.z, r: sk.radius, dur: sk.delay });
      sim.after(sk.delay, () => {
        if (u.dead) return;
        for (const t of sim.enemiesIn(shape, u.team)) {
          sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic');
          sim.applyStatus(u, t, 'root', 1.2);
          if (t.kind === 'champion') chill(sim, u, t);
        }
        fx(sim, 'absoluteZero', { x: p.x, z: p.z, r: sk.radius, shake: 0.14 });
      });
    },
  },
  // ⑫ 불꽃남자
  flame: {
    Q(sim, u, c) {
      const sk = c.sk;
      let boomed = false;
      const boom = (x, z) => {
        if (boomed) return; boomed = true;
        const shape = circle(x, z, sk.radius);
        sim.telegraph(shape, u.team, 0, 0.15, { style: 'danger' });
        for (const t of sim.enemiesIn(shape, u.team)) { sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic'); ignite(sim, u, t); }
        fx(sim, 'fireBurst', { x, z, r: sk.radius });
      };
      sim.spawnProjectile({ kind: 'line', src: u, x: u.x, z: u.z, dx: c.dir.x, dz: c.dir.z, speed: sk.speed, range: sk.range, w: sk.width, pierce: false, vis: 'fireball',
        onHit(p, t) { boom(t.x, t.z); } });
      sim.telegraph(rect(u.x, u.z, c.dir.x, c.dir.z, sk.range, sk.width), u.team, 0, sk.range / sk.speed, { style: 'line' });
    },
    W(sim, u, c) {
      const sk = c.sk, p = c.point;
      const shape = circle(p.x, p.z, sk.radius);
      sim.telegraph(shape, u.team, sk.delay, 0.2, { style: 'cc', label: 'flame_W' });
      fx(sim, 'pillarCharge', { x: p.x, z: p.z, r: sk.radius, dur: sk.delay });
      sim.after(sk.delay, () => {
        if (u.dead) return;
        for (const t of sim.enemiesIn(shape, u.team)) { sim.dealDamage(u, t, dmgOf(u, sk, c.idx), 'magic'); sim.applyStatus(u, t, 'stun', 0.75); ignite(sim, u, t); }
        fx(sim, 'firePillar', { x: p.x, z: p.z, r: sk.radius, shake: 0.08 });
      });
    },
    E(sim, u, c) {
      const sk = c.sk;
      const sx = u.x, sz = u.z;
      sim.startDash(u, u.x + c.dir.x * sk.range, u.z + c.dir.z * sk.range, 18, {
        onEnd(me) {
          const len = Math.hypot(me.x - sx, me.z - sz);
          if (len < 0.3) return;
          const dx = (me.x - sx) / len, dz = (me.z - sz) / len;
          const shape = rect(sx, sz, dx, dz, len, sk.width);
          sim.telegraph(shape, u.team, 0, 2.5, { style: 'dangerSoft', label: 'flame_E' });
          sim.spawnZone({ shape, team: u.team, until: sim.time + 2.5, interval: 0.5, vis: 'fireTrail', src: u,
            filter: (t) => t.team !== u.team && isChampOrMinion(t),
            onTick(us) { for (const t of us) { sim.dealDamage(u, t, (V(sk.base, c.idx) + sk.ap * u.s.ap) * 0.5, 'magic'); ignite(sim, u, t); } } });
          fx(sim, 'fireTrailFx', { x: sx, z: sz, dir: { x: dx, z: dz }, len });
        } });
      fx(sim, 'fireDash', { u });
    },
    R(sim, u, c) {
      const sk = c.sk, p = c.point;
      const shape = circle(p.x, p.z, sk.radius);
      const per = dmgOf(u, sk, c.idx);
      sim.telegraph(shape, u.team, 3, 0.3, { style: 'dangerSoft', label: 'flame_R' });
      sim.spawnZone({ shape, team: u.team, until: sim.time + 3, interval: 0.5, tickDelay: 0.3, vis: 'firestorm', src: u,
        filter: (t) => t.team !== u.team && isChampOrMinion(t),
        onTick(us) { for (const t of us) { sim.dealDamage(u, t, per, 'magic'); sim.applyStatus(u, t, 'slow', 0.6, 0.25); ignite(sim, u, t); } },
        onEnd() {
          if (u.dead) return;
          for (const t of sim.enemiesIn(shape, u.team)) { sim.dealDamage(u, t, per * 2, 'magic'); ignite(sim, u, t); }
          fx(sim, 'firestormEnd', { x: p.x, z: p.z, r: sk.radius, shake: 0.16 });
        } });
      fx(sim, 'firestormStart', { x: p.x, z: p.z, r: sk.radius });
    },
  },
};

// 불꽃남자 패시브: 잔불 (스킬 피해 → 3초 화상, 재적중 시 갱신)
function ignite(sim, u, t) {
  if (t.dead || !isChampOrMinion(t)) return;
  const map = (u.pass.burns ||= new Map());
  const b = map.get(t);
  if (b && b.until > sim.time) { b.until = sim.time + 3; return; }
  const nb = { until: sim.time + 3 };
  map.set(t, nb);
  const tick = () => {
    if (t.dead || sim.time > nb.until + 1e-6 || map.get(t) !== nb) { if (map.get(t) === nb) map.delete(t); return; }
    sim.dealDamage(u, t, 8 + 3 * u.level + 0.08 * u.s.ap, 'magic');
    fx(sim, 'burnTick', { x: t.x, z: t.z });
    sim.after(1, tick);
  };
  sim.after(1, tick);
}

// 최길용 패시브: 냉기 누적 → 3중첩 시 빙결
function chill(sim, u, t) {
  if (t.kind !== 'champion' || t.dead) return;
  const st = (u.pass.chill ||= new Map());
  const e = st.get(t) || { n: 0, until: 0, lock: 0 };
  if (sim.time < e.lock) return;
  if (sim.time > e.until) e.n = 0;
  e.n++; e.until = sim.time + 4;
  if (e.n >= 3) {
    e.n = 0; e.lock = sim.time + 6;
    sim.applyStatus(u, t, 'root', 0.8);
    sim.after(0.01, () => sim.dealDamage(u, t, 40 + 10 * u.level + 0.3 * u.s.ap, 'magic'));
    fx(sim, 'freeze', { x: t.x, z: t.z, t });
  } else fx(sim, 'chillStack', { x: t.x, z: t.z, n: e.n });
  st.set(t, e);
  u.pass.lastChill = e.n;
}

function starStack(u) { u.pass.stacks = Math.min(3, (u.pass.stacks || 0) + 1); }

export const PASSIVES = {
  pang: {
    onCast(sim, u, slot) { if (u.pass.justConsumed) u.pass.justConsumed = false; else u.pass.stacks = Math.min(3, u.pass.stacks + 1); },
  },
  koo: {
    tick(sim, u) {
      if (sim.time - u.pass.lastCombat < 3 && sim.time >= u.pass.shieldAt) {
        sim.addShield(u, u, u.s.hp * 0.09, 4); u.pass.shieldAt = sim.time + 10;
        fx(sim, 'ironShield', { u });
      }
    },
  },
  bang: {
    onAttack(sim, u, t, dmg) {
      let d = dmg;
      if (u.pass.empAttack && u.pass.empAttack.until > sim.time) { d *= 1 + u.pass.empAttack.bonus; u.pass.empAttack = null; fx(sim, 'impact', { x: t.x, z: t.z, color: 0xb06aff, big: true }); }
      if (t.status.some((s) => s.type === 'mark' && s.src === u && s.until > sim.time)) {
        t.status = t.status.filter((s) => !(s.type === 'mark' && s.src === u));
        sim.after(0.01, () => sim.dealDamage(u, t, 30 + 8 * u.level, 'magic'));
        fx(sim, 'markPop', { x: t.x, z: t.z });
      }
      return { dmg: d };
    },
  },
  park: {
    onAttack(sim, u) { u.pass.heat = Math.min(100, u.pass.heat + 12); return null; },
    onCast(sim, u) { if (u.pass.justConsumed) u.pass.justConsumed = false; else u.pass.heat = Math.min(100, u.pass.heat + 20); },
  },
  jung: {},
  cha: {
    onAttack(sim, u, t, dmg) {
      if (u.pass.lastTarget === t) u.pass.asStacks = Math.min(5, u.pass.asStacks + 1); else u.pass.asStacks = 0;
      u.pass.lastTarget = t;
      u.status = u.status.filter((s) => s.type !== 'asBuff');
      if (u.pass.asStacks) sim.applyStatus(u, u, 'asBuff', 3, 0.08 * u.pass.asStacks);
      let d = dmg;
      if (u.has('aim')) d *= 1 + u.statusVal('aim');
      return { dmg: d };
    },
  },
  sagong: {
    onAttack(sim, u, t, dmg) {
      if (u.pass.stacks >= 3) { u.pass.stacks = 0; sim.after(0.2, () => sim.dealDamage(u, t, 60 + 12 * u.level + 0.3 * u.s.ap, 'magic')); fx(sim, 'starHit', { x: t.x, z: t.z, big: true }); }
      return null;
    },
  },
  cho: {
    onAttack(sim, u, t, dmg) {
      const r = u.pass.rStun;
      if (r && r.until > sim.time && t.kind === 'champion') { u.pass.rStun = null; sim.applyStatus(u, t, 'stun', 1.0); fx(sim, 'beastBite', { x: t.x, z: t.z }); return { dmg: dmg + r.dmg }; }
      return null;
    },
    onMonsterKill(sim, u) { sim.heal(u, u, u.s.hp * 0.08); sim.applyStatus(u, u, 'haste', 2, 0.3); },
  },
  kim: {
    tick(sim, u) {
      const lx = u.pass.lx ?? u.x, lz = u.pass.lz ?? u.z;
      u.pass.charge = Math.min(100, u.pass.charge + Math.hypot(u.x - lx, u.z - lz) * 2.2);
      u.pass.lx = u.x; u.pass.lz = u.z;
    },
    onCast(sim, u) { u.pass.charge = Math.min(100, u.pass.charge + 20); },
    onAttack(sim, u, t, dmg) {
      if (u.pass.charge >= 100) {
        u.pass.charge = 0;
        sim.after(0.35, () => { if (t.dead) return; for (const o of sim.enemiesIn(circle(t.x, t.z, 2), u.team)) if (o !== t) sim.dealDamage(u, o, dmg * 0.5, 'magic'); fx(sim, 'arcaneBlast', { x: t.x, z: t.z, r: 2 }); });
        return { dmg: dmg * 1.8 };
      }
      return null;
    },
  },
  lee: {
    onCast(sim, u, slot) {
      u.pass.chain = (u.pass.chain || []).filter((c) => sim.time - c.t < 4);
      if (u.pass.chain.some((c) => c.slot !== slot)) { u.pass.empowered = true; u.pass.chain = []; fx(sim, 'chordReady', { u }); }
      else u.pass.chain.push({ slot, t: sim.time });
    },
    onAttack(sim, u, t, dmg) {
      if (u.pass.empowered) { u.pass.empowered = false; sim.after(0.25, () => { sim.dealDamage(u, t, 40 + 10 * u.level + 0.3 * u.s.ap, 'magic'); sim.applyStatus(u, t, 'slow', 1.5, 0.2); }); }
      return null;
    },
  },
  choi: {},
  flame: {},
};
