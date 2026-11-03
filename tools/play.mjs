// 실제 빌드 구동 검증: 페이지 열기 → 대기 → 스크립트 실행 → 스크린샷
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const args = JSON.parse(process.argv[2]);
const root = process.cwd();
const types = {'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.png':'image/png','.css':'text/css','.json':'application/json'};
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(s); }).listen(8124);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctxOpts = { viewport: { width: args.w || 1600, height: args.h || 900 }, deviceScaleFactor: args.dpr || 1 };
if (args.touch) { ctxOpts.hasTouch = true; ctxOpts.isMobile = true; }
const ctx = await b.newContext(ctxOpts);
const pg = await ctx.newPage();
const logs = [];
pg.on('console', m => { const t = m.text(); if (!/toNonIndexed|PCFSoft/.test(t)) { logs.push(t); if (args.verbose) console.log('[c]', t); } });
pg.on('pageerror', e => { logs.push('ERR ' + e.message); console.log('[err]', e.message); });
await pg.goto('http://localhost:8124/index.html' + (args.q || ''));
for (const st of args.steps || []) {
  if (st.wait) await pg.waitForFunction(st.wait, null, { timeout: st.timeout || 240000 });
  if (st.sleep) await pg.waitForTimeout(st.sleep);
  if (st.eval) { const r = await pg.evaluate(st.eval); if (r !== undefined) console.log('EVAL', JSON.stringify(r)); }
  if (st.click) await pg.mouse.click(st.click[0], st.click[1], { button: st.button || 'left' });
  if (st.key) await pg.keyboard.press(st.key);
  if (st.tap) await pg.touchscreen.tap(st.tap[0], st.tap[1]);
  if (st.shot) { await pg.evaluate(() => { const gl = window.GAME?.renderer?.getContext(); gl && gl.finish(); }); await pg.screenshot({ path: st.shot, timeout: 180000 }); console.log('SHOT', st.shot); }
}
console.log('LOG errors:', logs.filter(l => /ERR|rror/.test(l)).slice(0, 10));
await b.close(); srv.close();
