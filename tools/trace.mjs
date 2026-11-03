import { Sim, TICK } from '../src/sim/sim.js';
import { ChampionAI } from '../src/sim/ai.js';
globalThis.WD_LOG = 1;
const picks = process.env.P2 ? [{id:'bang',team:0,lane:'mid'},{id:'pang',team:0,lane:'bot'},{id:'cha',team:0,lane:'top'},{id:'kim',team:0,lane:'jungle'},{id:'bang',team:1,lane:'mid'},{id:'koo',team:1,lane:'top'},{id:'lee',team:1,lane:'bot'},{id:'sagong',team:1,lane:'jungle'}] : [{id:'koo',team:0,lane:'top'},{id:'lee',team:0,lane:'bot'},{id:'park',team:0,lane:'jungle'},{id:'sagong',team:0,lane:'mid'},{id:'park',team:1,lane:'top'},{id:'koo',team:1,lane:'jungle'},{id:'bang',team:1,lane:'mid'},{id:'kim',team:1,lane:'bot'}];
const sim = new Sim({ seed: 2, picks });
const ais = sim.champions.map(c => new ChampionAI(sim, c));
const watch = (process.argv[2]||'2,6').split(',').map(Number);
let last = 0;
while (sim.time < +(process.argv[3]||200)) {
  for (const a of ais) a.think(TICK);
  sim.step(TICK); sim.events.length = 0;
  if (process.env.Q) continue; if (sim.time - last >= 5) { last = sim.time;
    for (const i of watch) { const c = sim.champions[i]; const a = ais[i];
      console.log(`${sim.time.toFixed(0)}s ${c.def.id}${c.team} pos(${c.x.toFixed(1)},${c.z.toFixed(1)}) hp${Math.round(c.hp)}/${Math.round(c.s.hp)} L${c.level} dead${c.dead} tgt=${c.target?.name||'-'} path=${c.path?.length||0} goal=${c.goal?`${c.goal.x.toFixed(0)},${c.goal.z.toFixed(0)}`:'-'} act=${c.action?.kind||'-'} recall=${!!c.recall} camp=${a.campTarget?.id||'-'} wd=${a.watchdogKicks}`); }
  }
}
