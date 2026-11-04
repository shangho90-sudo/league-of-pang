// 이펙트 확인: 챔피언별 기본 공격 / Q / R 를 여러 시점으로 캡처해 한 장으로 묶음
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); }).listen(8141);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
fs.mkdirSync('docs/fx', { recursive: true });
const ids = (process.argv[2] || 'cha').split(',');
const plan = [['atk', [16, 22, 30]], ['Q', [8, 20, 30]], ['R', [6, 14, 24, 36]]];
for (const id of ids) {
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
  pg.on('pageerror', (e) => console.log('[err]', e.message));
  await pg.goto(`http://localhost:8141/index.html?autostart=${id}&seed=9&manual=1`);
  await pg.waitForFunction('window.READY', null, { timeout: 300000 });
  for (const [what, steps] of plan) {
    await pg.evaluate((what) => {
      const sim = GAME.sim, p = GAME.player;
      GAME.ais.forEach((a) => (a.next = 1e9));
      p.x = 0; p.z = 4; p.level = 9; p.skillLv = { Q: 4, W: 4, E: 4, R: 2 }; p.cd = {}; p.cds = {}; sim.recalcStats(p); p.hp = p.s.hp; p.mp = p.s.mp;
      const e = sim.champions.find((c) => c.team !== p.team); e.x = 3.2; e.z = 1.6; e.hp = e.s.hp;
      sim.champions.forEach((c) => { if (c !== p && c !== e) { c.x = c.team ? 50 : -50; c.z = c.team ? -50 : 50; } });
      sim.updateVision(); const cam = GAME.world.camera; cam.dist = 15; cam.goal.set(1.6, 0, 2.8); cam.target.copy(cam.goal);
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (what === 'atk') sim.cmdAttack(p, e);
      else sim.cmdCast(p, what, { point: { x: e.x, z: e.z }, dir: { x: (e.x - p.x) / d, z: (e.z - p.z) / d }, target: e });
    }, what);
    let done = 0;
    for (const st of steps) {
      await pg.evaluate((n) => STEP(n, 1 / 60), st - done); done = st;
      await pg.screenshot({ path: `docs/fx/${id}_${what}_${st}.png`, timeout: 180000, clip: { x: 160, y: 40, width: 640, height: 400 } });
    }
    await pg.evaluate(() => STEP(40));
  }
  await pg.close();
}
await b.close(); srv.close();
