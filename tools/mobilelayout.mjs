// 모바일 HUD 배치 점검: 여러 가로 화면 크기에서 버튼끼리 겹침·화면 밖 여부와 체력바 위치를 측정하고 캡처
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); }).listen(8139);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
fs.mkdirSync('docs/mobile', { recursive: true });
const sizes = (process.argv[2] || '844x390,812x300,740x310,667x300,926x428').split(',');
for (const sz of sizes) {
  const [w, h] = sz.split('x').map(Number);
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => console.log('[err]', e.message));
  await pg.goto(`http://localhost:8139/index.html?autostart=cho&seed=9&manual=1&mobile=1&q=low`);
  await pg.waitForFunction('window.READY', null, { timeout: 300000 });
  await pg.evaluate(() => STEP(3));
  const res = await pg.evaluate(() => {
    const els = [...document.querySelectorAll('#m-controls .mskill, #m-top-right .mbtn, #m-hpbar, #m-mm')].filter((e) => e.offsetParent || e.getClientRects().length);
    const box = (e) => { const r = e.getBoundingClientRect(); return { n: e.dataset.slot || e.dataset.ctl || e.id || e.textContent.trim().slice(0, 6), x: r.left, y: r.top, w: r.width, h: r.height }; };
    const bs = els.map(box);
    const circ = (q) => ({ cx: q.x + q.w / 2, cy: q.y + q.h / 2, r: Math.min(q.w, q.h) / 2 });
    const over = [];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const A = bs[i], B = bs[j];
      const rectHit = A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h;
      if (!rectHit) continue;
      const roundA = !['m-hpbar', 'm-mm'].includes(A.n), roundB = !['m-hpbar', 'm-mm'].includes(B.n);
      if (roundA && roundB) { const a = circ(A), c = circ(B); if (Math.hypot(a.cx - c.cx, a.cy - c.cy) >= a.r + c.r) continue; }
      over.push(A.n + '×' + B.n);
    }
    const off = bs.filter((q) => q.x < 0 || q.y < 0 || q.x + q.w > innerWidth || q.y + q.h > innerHeight).map((q) => q.n);
    const hp = bs.find((q) => q.n === 'm-hpbar');
    return { overlaps: over, offscreen: off, hpBottomGap: hp ? Math.round(innerHeight - (hp.y + hp.h)) : null, R: bs.find((q) => q.n === 'R'), col: bs.filter((q) => ['tattack','attack','camback'].includes(q.n)).map((q) => [q.n, Math.round(q.x + q.w / 2), Math.round(q.y + q.h / 2), Math.round(q.w)]) };
  });
  console.log(sz, JSON.stringify(res));
  await pg.screenshot({ path: `docs/mobile/layout_${sz}.png`, timeout: 120000 });
  await ctx.close();
}
await b.close(); srv.close();
