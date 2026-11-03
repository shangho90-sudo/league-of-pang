// 모바일 터치 검증: 레이아웃 겹침/잘림 + CDP 멀티터치 (조이스틱 이동 중 스킬 조준·시전·취소, 공격 유지)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.cwd();
const types = {'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.css':'text/css'};
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(s); }).listen(8125);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const champ = process.argv[2] || 'lee';
const sizes = (process.argv[3] || '844x390,800x450,1024x768,844x390m').split(',');
const report = {};
for (const sz of sizes) {
  const mirror = sz.endsWith('m');
  const [w, h] = sz.replace('m', '').split('x').map(Number);
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript((m) => { localStorage.setItem('lopjh_settings', JSON.stringify({ mirror: m, quality: 'low' })); }, mirror);
  await pg.goto(`http://localhost:8125/index.html?autostart=${champ}&seed=5&manual=1&mobile=1&q=low`);
  await pg.waitForFunction('window.READY', null, { timeout: 300000 });
  // 1) 레이아웃: 컨트롤 간 겹침, 화면 밖
  const lay = await pg.evaluate(() => {
    const els = [...document.querySelectorAll('.mskill:not(#m-cancel), .mbtn, #m-mm, #m-hpbar, #topbar, #joy')].filter(e => e.offsetParent !== null || e.id === 'joy');
    const R = els.map(e => ({ n: e.dataset.slot || e.textContent.trim().slice(0, 4) || e.id, r: e.getBoundingClientRect(), round: e.classList.contains('mskill') || e.classList.contains('mbtn') || e.id === 'joy' }));
    const issues = [];
    for (const a of R) { if (a.r.left < 0 || a.r.top < 0 || a.r.right > innerWidth + 0.5 || a.r.bottom > innerHeight + 0.5) issues.push('잘림:' + a.n); }
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      const a = R[i], c = R[j];
      let ov;
      if (a.round && c.round) { const d = Math.hypot((a.r.left + a.r.right) / 2 - (c.r.left + c.r.right) / 2, (a.r.top + a.r.bottom) / 2 - (c.r.top + c.r.bottom) / 2); ov = d < (a.r.width + c.r.width) / 2 - 1; }
      else ov = a.r.left < c.r.right - 1 && c.r.left < a.r.right - 1 && a.r.top < c.r.bottom - 1 && c.r.top < a.r.bottom - 1;
      if (ov) issues.push('겹침:' + a.n + '/' + c.n);
    }
    return { n: R.length, issues };
  });
  // 2) 멀티터치: 조이스tick 이동 + 동시에 Q 드래그 조준 → 손 떼면 시전
  const cdp = await ctx.newCDPSession(pg);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const center = (sel) => pg.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [(r.left + r.right) / 2, (r.top + r.bottom) / 2]; }, sel);
  await pg.evaluate(() => { const p = GAME.player; p.skillLv = { Q: 3, W: 3, E: 3, R: 1 }; p.mp = p.s.mp; GAME.sim.updateVision(); });
  const step = (n) => pg.evaluate((n) => STEP(n), n);
  const joyX = mirror ? w - 120 : 120, joyY = h - 110;
  const p0 = await pg.evaluate(() => [GAME.player.x, GAME.player.z]);
  await T('touchStart', [[joyX, joyY, 1]]);
  await T('touchMove', [[joyX + 60, joyY - 10, 1]]);
  await step(15);
  const p1 = await pg.evaluate(() => [GAME.player.x, GAME.player.z, !!GAME.player.joy]);
  const q = await center('.mskill[data-slot="Q"]');
  await T('touchMove', [[joyX + 60, joyY - 10, 1], [q[0], q[1], 2]]);
  await step(2);
  await T('touchMove', [[joyX + 60, joyY - 10, 1], [q[0] - 70, q[1] - 40, 2]]);
  await step(3);
  const aiming = await pg.evaluate(() => ({ aim: !!GAME.input.aim, ind: GAME.world.ind.rect.visible || GAME.world.ind.circle.visible || GAME.world.ind.cone.visible, joyStill: GAME.input.joy.active }));
  await T('touchEnd', [[q[0] - 70, q[1] - 40, 2]]); // 조준 손가락(2)만 뗌 → 조이스틱 손가락(1)은 유지
  await step(10);
  const afterCast = await pg.evaluate(() => ({ qcd: GAME.player.cds.Q > GAME.sim.time, aimCleared: !GAME.input.aim, joyActive: GAME.input.joy.active, ptrs: GAME.input.ptrs.size }));
  await T('touchEnd', [[joyX + 60, joyY - 10, 1]]);
  await step(25);
  const released = await pg.evaluate(() => ({ joyActive: GAME.input.joy.active, ptrs: GAME.input.ptrs.size, joy: !!GAME.player.joy, pressed: document.querySelectorAll('.mskill.pressed').length }));
  // 3) 취소: W 드래그 후 취소 영역에서 손 떼기
  const wcd0 = await pg.evaluate(() => GAME.player.cds.W);
  const wb = await center('.mskill[data-slot="W"]');
  await pg.evaluate(() => document.getElementById('m-cancel').classList.remove('hidden'));
  const cz = await center('#m-cancel');
  await pg.evaluate(() => GAME.player.cds.W = 0);
  await T('touchStart', [[wb[0], wb[1], 3]]); await step(1);
  const wAim = await pg.evaluate(() => ({ aim: GAME.input.aim && GAME.input.aim.slot, can: GAME.sim.canCast(GAME.player, 'W') }));
  await T('touchMove', [[(wb[0] + cz[0]) / 2, (wb[1] + cz[1]) / 2, 3]]); await step(1);
  await T('touchMove', [[cz[0], cz[1], 3]]); await step(1);
  const hot = await pg.evaluate(() => ({ hot: document.getElementById('m-cancel').classList.contains('hot'), over: GAME.input.aim && GAME.input.aim.overCancel }));
  await T('touchEnd', [[cz[0], cz[1], 3]]); await step(3);
  const cancelled = await pg.evaluate((c0) => ({ notCast: GAME.player.cds.W === c0, ptrs: GAME.input.ptrs.size }), wcd0);
  // 4) 백그라운드 전환 후 복구 (터치 누른 채 숨김)
  await T('touchStart', [[joyX, joyY, 4]]); await T('touchMove', [[joyX + 50, joyY, 4]]); await step(2);
  await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await step(2);
  const bg = await pg.evaluate(() => ({ t: GAME.sim.time, joy: GAME.input.joy.active, ptrs: GAME.input.ptrs.size, playerJoy: !!GAME.player.joy }));
  await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const t0 = await pg.evaluate(() => GAME.sim.time); await step(5);
  const resumed = await pg.evaluate((t0) => ({ advanced: +(GAME.sim.time - t0).toFixed(2), playerJoy: !!GAME.player.joy }), t0);
  await T('touchEnd', [[joyX + 50, joyY, 4]]);
  if (sz === sizes[0]) { await pg.evaluate(() => GAME.renderer.getContext().finish()); await pg.screenshot({ path: `dev/touch_${champ}.png`, timeout: 180000 }); }
  report[sz] = { layout: lay, moved: +Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(2), aimingWhileMoving: aiming, afterCast, released, cancelHot: hot, wAim, cz, wb, cancelled, bg, resumed, errs };
  await ctx.close();
}
console.log(JSON.stringify(report, null, 1));
await b.close(); srv.close();
