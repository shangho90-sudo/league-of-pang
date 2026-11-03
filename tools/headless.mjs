// 헤드리스 전체 경기 시뮬레이션 (AI 8명) — 경기 시간, 승패, 끼임, 공정성 지표
globalThis.STUCK_LOG = process.env.SL;
import { Sim, TICK } from '../src/sim/sim.js';
import { ChampionAI } from '../src/sim/ai.js';
import { CHAMPIONS } from '../src/data/champions.js';
const seed = +(process.argv[2] || 1);
const games = +(process.argv[3] || 1);
const out = [];
for (let g = 0; g < games; g++) {
  const ids = CHAMPIONS.map(c => c.id);
  // 시드별 무작위 8명 (팀 내 중복 없음)
  let s = seed * 100 + g; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const shuffled = [...ids].sort(() => r() - 0.5);
  const t0 = shuffled.slice(0, 4), t1 = [...ids].sort(() => r() - 0.5).slice(0, 4);
  const lanes = ['top', 'mid', 'bot', 'jungle'];
  const assign = (team, list) => {
    // 역할 선호 기반 배치
    const left = [...lanes], res = [];
    // 선호 공격로 없음: 섞인 순서대로 공격로 배정
    list.forEach((id, i) => res.push({ id, team, lane: left[i] }));
    return res;
  };
  const picks = [...assign(0, t0), ...assign(1, t1)];
  const sim = new Sim({ seed: seed + g, picks, fast: true });
  const ais = sim.champions.map(c => new ChampionAI(sim, c));
  const T0 = Date.now();
  const fair = { checks: 0, targetHidden: 0, castHidden: 0, attackHidden: 0 };
  let stepMs = 0, steps = 0;
  let lastLog = 0;
  while (!sim.over && sim.time < 40 * 60) {
    for (const a of ais) a.think(TICK);
    // 공정성 감시: AI가 보이지 않는 적 영웅을 공격 대상으로 잡거나 대상 스킬을 쓰는지
    for (const c of sim.champions) {
      if (c.target && c.target.kind === 'champion' && c.target.team !== c.team && !c.target.visibleTo[c.team]) fair.targetHidden++;
      if (c.pendingCast && c.pendingCast.target && c.pendingCast.target.team !== c.team && !c.pendingCast.target.visibleTo[c.team]) fair.castHidden++;
      fair.checks++;
    }
    for (const e of sim.events) if (e.type === 'attackStart' && e.t.kind === 'champion' && e.u.team !== 2 && e.t.team !== e.u.team && !e.t.visibleTo[e.u.team]) fair.attackHidden = (fair.attackHidden || 0) + 1;
    for (const e of sim.events) if (e.type === 'cast' && e.target && e.target.team !== e.u.team && e.target.kind === 'champion' && !e.target.visibleTo[e.u.team]) fair.castHidden++;
    const s0 = performance.now(); sim.step(TICK); stepMs += performance.now() - s0; steps++;
    for (const e of sim.events) { if (e.type === 'attackStart' && e.t.kind === 'champion' && e.u.kind === 'champion' && e.t.team !== e.u.team && !e.t.visibleTo[e.u.team]) fair.attackHidden++; if (e.type === 'cast' && e.target && e.target.kind === 'champion' && e.target.team !== e.u.team && !e.target.visibleTo[e.u.team]) fair.castHidden++; }
    sim.events.length = 0;
    if (process.env.LOG && sim.time - lastLog > 120) { lastLog = sim.time; const tt = [0,1].map(t => sim.turrets.filter(x => x.team===t && !x.dead).length); console.log(`  t=${(sim.time/60).toFixed(1)}m kills ${sim.teamKills} turrets ${tt} lv ${sim.champions.map(c=>c.level).join(',')} units ${sim.units.length}`); }
  }
  const res = {
    game: g, minutes: +(sim.time / 60).toFixed(2), winner: sim.winner, over: sim.over, realSec: ((Date.now() - T0) / 1000).toFixed(1),
    kills: sim.teamKills, turretsLeft: [0, 1].map(t => sim.turrets.filter(x => x.team === t && !x.dead).length),
    stuck: sim.stats.stuckRecoveries, stuckBy: JSON.stringify(sim.stats.stuckBy), watchdog: ais.reduce((a, b) => a + b.watchdogKicks, 0), paths: sim.stats.paths,
    champs: sim.champions.map(c => `${c.team}:${c.def.id}/${c.lane} L${c.level} ${c.k}/${c.d}/${c.a} cs${c.cs} g${Math.round(c.gold)} items${c.items.length}`),
    drakes: sim.teamBuffs.map(b => b.drake), fairness: fair, simStepMsAvg: +(stepMs / steps).toFixed(3),
  };
  out.push(res);
  console.log(JSON.stringify(res, null, 1));
}
