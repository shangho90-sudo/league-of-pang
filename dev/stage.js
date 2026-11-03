// 교전 연출 스테이징 (검증용): 8명을 강가 근처에 배치, 전원 궁극기 사용
window.STAGE = function (mode = 'ult') {
  const g = GAME, sim = g.sim;
  const cx = 6, cz = 6;
  sim.champions.forEach((c, i) => {
    const k = sim.champions.filter((o) => o.team === c.team).indexOf(c);
    c.x = cx + (c.team === 0 ? -3.2 : 3.2) + (k - 1.5) * 0.6; c.z = cz + (k - 1.5) * 1.6 + (c.team === 0 ? 1 : -1);
    c.level = 11; c.skillLv = { Q: 5, W: 5, E: 4, R: 2 }; sim.recalcStats(c); c.hp = c.s.hp; c.mp = c.s.mp;
    c.cds = { Q: 0, W: 0, E: 0, R: 0 }; c.path = null; c.target = null; c.recall = null;
  });
  g.ais.forEach((a) => (a.next = 99));
  if (g.autopilot) g.autopilot.next = 99;
  sim.updateVision();
  const nearest = (c) => sim.champions.filter((o) => o.team !== c.team && !o.dead).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
  const res = [];
  for (const c of sim.champions) {
    const e = nearest(c);
    const slots = mode === 'ult' ? ['R'] : ['Q'];
    for (const s of slots) { const r = sim.cmdCast(c, s, { point: { x: e.x, z: e.z }, target: c.def.skills[s].t === 'ally' ? c : e }); res.push(c.def.id + s + ':' + (r.ok ? 'ok' : r.reason)); }
  }
  g.world.camera.goal.set(cx, 0, cz); g.world.camera.target.copy(g.world.camera.goal); g.world.camera.locked = false;
  return res;
};
