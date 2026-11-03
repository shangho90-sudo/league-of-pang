// 이동 떨림 측정: 플레이어가 직선 이동하는 동안 화면 프레임마다 캐릭터·카메라 위치 변화량의 고르기
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); }).listen(8135);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 800, height: 450 } });
pg.on('pageerror', (e) => console.log('[err]', e.message));
await pg.goto('http://localhost:8135/index.html?autostart=bang&seed=9&q=low&manual=1');
await pg.waitForFunction('window.READY', null, { timeout: 300000 });
const res = await pg.evaluate(() => {
  const p = GAME.player; GAME.ais.forEach((a) => (a.next = 1e9));
  STEP(10);
  GAME.sim.cmdMove(p, p.x + 30, p.z - 30);
  STEP(6);
  const v = GAME.world.views.get(p.id), cam = GAME.world.camera.cam;
  const sam = []; const dt = 1 / 72; let ts = 0; // 72Hz 화면 가정 (30Hz 틱과 어긋남)
  for (let i = 0; i < 150; i++) { STEP(1, dt); ts += dt * 1000; const r = v.root.position, c = cam.position; sam.push({ ts, x: r.x, z: r.z, cx: c.x, cz: c.z, sx: p.x, sz: p.z }); }
  return sam;
});
const stat = (key) => {
  const sp = [];
  for (let i = 1; i < res.length; i++) { const dt = (res[i].ts - res[i - 1].ts) / 1000; if (dt <= 0) continue; sp.push(Math.hypot(res[i][key[0]] - res[i - 1][key[0]], res[i][key[1]] - res[i - 1][key[1]]) / dt); }
  const m = sp.reduce((a, b) => a + b, 0) / sp.length, sd = Math.sqrt(sp.reduce((a, b) => a + (b - m) ** 2, 0) / sp.length);
  return { meanSpeed: +m.toFixed(2), cv: +(sd / m).toFixed(3), zeroFrames: sp.filter((v) => v < 0.05).length, frames: sp.length };
};
console.log(JSON.stringify({ character: stat(['x', 'z']), camera: stat(['cx', 'cz']), simRaw: stat(['sx', 'sz']) }));
await b.close(); srv.close();
