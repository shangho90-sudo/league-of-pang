// 신규 챔피언 시각 확인: 인게임 근접 캡처(스킬 시전 중) + 선택창
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); }).listen(8131);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
fs.mkdirSync('docs/newchamp', { recursive: true });
for (const id of process.argv.slice(2)) {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  pg.on('pageerror', (e) => console.log('[err]', e.message));
  await pg.goto(`http://localhost:8131/index.html?autostart=${id}&seed=9&manual=1`);
  await pg.waitForFunction('window.READY', null, { timeout: 300000 });
  for (const slot of ['Q', 'W', 'R']) {
    await pg.evaluate((slot) => {
      const sim = GAME.sim, p = GAME.player;
      GAME.ais.forEach((a) => (a.next = 1e9));
      p.x = 0; p.z = 4; p.level = 9; p.skillLv = { Q: 4, W: 4, E: 4, R: 2 }; p.cd = {}; sim.recalcStats(p); p.hp = p.s.hp; p.mp = p.s.mp;
      const e = sim.champions.find((c) => c.team !== p.team); e.x = 3.5; e.z = 1.0; e.hp = e.s.hp;
      sim.champions.forEach((c) => { if (c !== p && c !== e) { c.x = c.team ? 50 : -50; c.z = c.team ? -50 : 50; } });
      sim.updateVision(); const cam = GAME.world.camera; cam.dist = 16; cam.goal.set(1.5, 0, 3); cam.target.copy(cam.goal);
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      sim.cmdCast(p, slot, { point: { x: e.x, z: e.z }, dir: { x: (e.x - p.x) / d, z: (e.z - p.z) / d }, target: e, x: e.x, z: e.z });
    }, slot);
    await pg.evaluate((n) => STEP(n), slot === 'R' ? 32 : 12);
    await pg.screenshot({ path: `docs/newchamp/${id}_${slot}.png`, timeout: 180000 });
  }
  await pg.close();
}
const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
pg.on('pageerror', (e) => console.log('[err]', e.message));
await pg.goto('http://localhost:8131/index.html?select=1');
await pg.waitForSelector('#select .card', { timeout: 120000 }).catch(() => console.log('no select'));
await pg.waitForTimeout(4000);
const cards = await pg.$$('#select .card');
if (cards.length) { await cards[cards.length - 1].click(); await pg.waitForTimeout(3000); }
await pg.screenshot({ path: 'docs/newchamp/select.png', timeout: 180000 });
console.log('cards', cards.length);
await b.close(); srv.close();
