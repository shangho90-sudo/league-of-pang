// 그래픽 전후 비교용 결정적 장면 캡처 (실제 빌드)
// 사용: node tools/compare.mjs <접두사> [camDist] [camPitchDeg]   — 카메라 값을 주면 그 값으로 고정
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const [,, prefix = 'before', camDist, camPitch] = process.argv;
const root = process.cwd();
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(s); }).listen(8131);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const picks = [{id:'jung',team:0,lane:'mid',isPlayer:true},{id:'koo',team:0,lane:'top'},{id:'cha',team:0,lane:'bot'},{id:'cho',team:0,lane:'jungle'},{id:'park',team:1,lane:'mid'},{id:'sagong',team:1,lane:'bot'},{id:'bang',team:1,lane:'jungle'},{id:'pang',team:1,lane:'top'}];
const SETUP = (cam) => `(() => {
  GAME.fastForward(95);
  const sim = GAME.sim; GAME.ais.forEach(a => a.next = 1e9);
  const pos = { jung:[-7.5,8.5], koo:[-9,6.5], cha:[-10.5,10.5], cho:[-6,11], park:[-2.5,4.2], sagong:[-0.5,6.5], bang:[-3.5,1.8], pang:[0.5,3.2] };
  for (const c of sim.champions) { const p = pos[c.def.id]; c.x = p[0]; c.z = p[1]; c.path = null; c.target = null; c.recall = null; c.dead = false; c.hp = c.s.hp * (c.team ? 0.7 : 0.85); c.facing = c.team ? -2.2 : 0.9; }
  sim.updateVision();
  const C = GAME.world.camera; ${cam}
  C.locked = false; C.goal.set(-5.5, 0, 6.5); C.target.copy(C.goal);
  STEP(3); return { dist: C.dist, pitch: +(C.pitch*180/Math.PI).toFixed(1), calls: GAME.renderer.info.render.calls, tris: GAME.renderer.info.render.triangles, geom: GAME.renderer.info.memory.geometries, tex: GAME.renderer.info.memory.textures };
})()`;
const camCode = camDist ? `C.dist = ${camDist}; C.minDist = Math.min(C.minDist, ${camDist}); C.maxDist = Math.max(C.maxDist, ${camDist}); C.pitch = ${camPitch || 53} * Math.PI / 180;` : '';
const shots = [
  { name: 'pc', w: 1600, h: 900, q: `?picks=${encodeURIComponent(JSON.stringify(picks))}&seed=77&manual=1&mobile=0&q=high` },
  { name: 'mobile', w: 1024, h: 768, touch: true, q: `?picks=${encodeURIComponent(JSON.stringify(picks))}&seed=77&manual=1&mobile=1&q=medium` },
];
for (const s of shots) {
  const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, hasTouch: !!s.touch, isMobile: !!s.touch });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (/Error|error/.test(m.text()) && !/toNonIndexed/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await pg.goto('http://localhost:8131/index.html' + s.q);
  await pg.waitForFunction('window.READY', null, { timeout: 300000 });
  const info = await pg.evaluate(SETUP(camCode));
  await pg.evaluate(() => GAME.renderer.getContext().finish());
  await pg.screenshot({ path: `docs/compare/${prefix}_${s.name}.png`, timeout: 180000 });
  // 4:4 교전: 전원 Q 사용 후 몇 프레임
  if (s.name === 'pc') {
    await pg.evaluate(() => { const sim = GAME.sim; for (const c of sim.champions) { c.level = 9; c.skillLv = { Q: 4, W: 4, E: 3, R: 2 }; sim.recalcStats(c); c.mp = c.s.mp; c.cds = { Q: 0, W: 0, E: 0, R: 0 }; const e = sim.champions.filter(o => o.team !== c.team).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0]; const slot = ['koo','park','sagong','pang'].includes(c.def.id) ? 'R' : 'Q'; sim.cmdCast(c, slot, { point: { x: e.x, z: e.z }, target: c.def.skills[slot].t === 'ally' ? c : e }); } STEP(12); });
    await pg.evaluate(() => GAME.renderer.getContext().finish());
    await pg.screenshot({ path: `docs/compare/${prefix}_fight.png`, timeout: 180000 });
    info.fight = await pg.evaluate(() => ({ calls: GAME.renderer.info.render.calls, tris: GAME.renderer.info.render.triangles, particles: GAME.world.fx.add.p.length + GAME.world.fx.norm.p.length }));
  }
  console.log(s.name, JSON.stringify(info), errs.slice(0, 3));
  await ctx.close();
}
await b.close(); srv.close();
