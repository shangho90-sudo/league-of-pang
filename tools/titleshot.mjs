// 시작 화면·온라인 대전 화면 캡처 (PC 16:9, 4:3, 모바일 가로)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); }).listen(8137);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
fs.mkdirSync('docs/title', { recursive: true });
for (const [name, vp, mobile] of [['pc', { width: 1600, height: 900 }, false], ['pc43', { width: 1448, height: 1086 }, false], ['mobile', { width: 844, height: 390 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: mobile, isMobile: mobile });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => console.log('[err]', e.message));
  await pg.goto(`http://localhost:8137/index.html${mobile ? '?mobile=1' : ''}`);
  await pg.waitForSelector('#t-online', { timeout: 120000 });
  await pg.waitForFunction(() => !document.querySelector('#t-online').disabled, null, { timeout: 300000 }).catch(() => console.log('online still disabled'));
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: `docs/title/${name}_title.png`, timeout: 120000 });
  const boxes = await pg.evaluate(() => ['t-start', 't-online', 't-exit'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }));
  console.log(name, JSON.stringify(boxes));
  await pg.click('#t-online', { force: true });
  await pg.waitForTimeout(2500);
  await pg.screenshot({ path: `docs/title/${name}_online.png`, timeout: 120000 });
  await ctx.close();
}
await b.close(); srv.close();
