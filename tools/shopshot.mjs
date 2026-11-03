// 상점창 캡처: PC(구매 가능/불가) + 모바일 가로
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); }).listen(8133);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
fs.mkdirSync('docs/shop', { recursive: true });
for (const [name, vp, mobile, away] of [['pc_shop', { width: 1600, height: 1000 }, false, true], ['pc_buy', { width: 1600, height: 1000 }, false, false], ['mobile', { width: 844, height: 390 }, true, false]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: mobile, isMobile: mobile });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => console.log('[err]', e.message));
  await pg.goto(`http://localhost:8133/index.html?autostart=koo&seed=9&manual=1${mobile ? '&mobile=1' : ''}`);
  await pg.waitForFunction('window.READY', null, { timeout: 300000 });
  await pg.evaluate((away) => { const p = GAME.player; if (away) { p.x = 0; p.z = 0; } else { p.gold = 1800; } GAME.sim.cmdBuy(p, 'boots'); GAME.sim.cmdBuy(p, 'ring'); GAME.hud.toggleShop(true); }, away);
  await pg.evaluate((n) => STEP(n), 2);
  if (name === 'pc_buy') await pg.evaluate(() => { const g = document.querySelector('#shop .items'); g.scrollTop = g.scrollHeight; });
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: `docs/shop/${name}.png`, timeout: 180000 });
  await ctx.close();
}
await b.close(); srv.close();
