// 10명 전원: 모바일 터치로 Q/W/E/R 드래그 시전 → 쿨다운·피해/효과 발생 확인
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.cwd();
const types = {'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.css':'text/css'};
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(s); }).listen(+process.env.PORT || 8126);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ids = (process.argv[2] || 'pang,koo,bang,park,jung,cha,sagong,cho,kim,lee').split(',');
const out = {};
for (const id of ids) {
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.addInitScript(() => localStorage.setItem('lopjh_settings', JSON.stringify({ quality: 'low' })));
  await pg.goto(`http://localhost:${process.env.PORT || 8126}/index.html?autostart=${id}&seed=9&manual=1&mobile=1&q=low`);
  await pg.waitForFunction('window.READY', null, { timeout: 300000 });
  const cdp = await ctx.newCDPSession(pg);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, i]) => ({ x, y, id: i })) });
  const step = (n) => pg.evaluate((n) => STEP(n), n);
  // 무대: 플레이어를 강가로, 적 영웅 1명을 오른쪽 위 4유닛, 아군 1명 근처
  await pg.evaluate(() => {
    const sim = GAME.sim, p = GAME.player;
    GAME.ais.forEach((a) => (a.next = 1e9));
    p.x = 0; p.z = 4; p.level = 9; p.skillLv = { Q: 4, W: 4, E: 4, R: 2 }; sim.recalcStats(p); p.hp = p.s.hp;
    const e = sim.champions.find((c) => c.team !== p.team); e.x = 3.2; e.z = 1.6; e.hp = e.s.hp = 5000;
    const a = sim.champions.find((c) => c.team === p.team && c !== p); a.x = -1.5; a.z = 5; a.hp = a.s.hp * 0.5;
    sim.champions.forEach((c) => { if (c !== p && c !== e && c !== a) { c.x = c.team ? 50 : -50; c.z = c.team ? -50 : 50; } });
    sim.updateVision(); GAME.world.camera.goal.set(0, 0, 4); GAME.world.camera.target.copy(GAME.world.camera.goal);
    window.__ev = [];
    const orig = GAME.processEvents.bind(GAME);
    GAME.processEvents = () => { for (const ev of sim.events) __ev.push(ev.type + (ev.slot || '') + (ev.name ? ':' + ev.name : '')); orig(); };
  });
  await step(2);
  const res = {};
  for (const slot of ['Q', 'W', 'E', 'R']) {
    const drag = await pg.evaluate((s) => {
      const sim = GAME.sim, p = GAME.player; p.x = 0; p.z = 4; p.mp = p.s.mp; p.cds = { Q: 0, W: 0, E: 0, R: 0 }; p.action = null; p.dash = null; p.path = null; p.target = null; p.status = [];
      const e = sim.champions.find((c) => c.team !== p.team); e.x = 3.2; e.z = 1.6; e.status = []; e.dead = false; e.hp = e.s.hp; e.path = null; e.target = null;
      sim.updateVision(); window.__ev = []; GAME.__ehp = e.hp;
      const sk = p.def.skills[s]; const d = Math.hypot(e.x - p.x, e.z - p.z);
      const f = sk.t === 'point' ? Math.min(1, d / sk.range) : 1;
      return { dx: (e.x - p.x) / d * 110 * f, dy: (e.z - p.z) / d * 110 * f };
    }, slot);
    const btn = await pg.evaluate((s) => { const r = document.querySelector(`.mskill[data-slot="${s}"]`).getBoundingClientRect(); return [(r.left + r.right) / 2, (r.top + r.bottom) / 2]; }, slot);
    // 적 방향(화면 오른쪽 위)으로 드래그
    await T('touchStart', [[btn[0], btn[1], 1]]); await step(1);
    await T('touchMove', [[btn[0] + drag.dx * 0.5, btn[1] + drag.dy * 0.5, 1]]); await step(1);
    await T('touchMove', [[btn[0] + drag.dx, btn[1] + drag.dy, 1]]); await step(1);
    await T('touchEnd', [[btn[0] + drag.dx, btn[1] + drag.dy, 1]]);
    await pg.evaluate(() => { for (let i = 0; i < 75; i++) { GAME.tickOnce(); GAME.processEvents(); } }); // 2.5초 진행 (렌더 없이 동일 로직)
    res[slot] = await pg.evaluate((s) => {
      const p = GAME.player, sim = GAME.sim, e = sim.champions.find((c) => c.team !== p.team);
      return { cast: __ev.includes('cast' + s), cd: p.cds[s] > 0, dmgToEnemy: Math.round(GAME.__ehp - e.hp), fx: [...new Set(__ev.filter((x) => x.startsWith('fx') || x === 'heal' || x === 'shield' || x === 'status'))].slice(0, 5), msg: document.getElementById('msg').textContent };
    }, slot);
  }
  if (id === 'kim' || id === 'park') { await pg.evaluate(() => GAME.renderer.getContext().finish()); }
  out[id] = { ...res, errs };
  console.log(id, JSON.stringify(res), errs.length ? errs : '');
  fs.writeFileSync(`dev/champ_${id}.json`, JSON.stringify({ ...res, errs }));
  await ctx.close();
}
fs.writeFileSync('dev/allchamps.json', JSON.stringify(out, null, 1));
await b.close(); srv.close();
