import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.cwd();
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(s); }).listen(8129);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto('http://localhost:8129/index.html?autostart=sagong&seed=4&manual=1&mobile=0&q=low');
await pg.waitForFunction('window.READY', null, { timeout: 300000 });
const S = (n) => pg.evaluate((n) => STEP(n), n);
const tick = (n) => pg.evaluate((n) => { for (let i = 0; i < n; i++) { GAME.tickOnce(); GAME.processEvents(); } }, n);
const R = {};
await pg.evaluate(() => { GAME.ais.forEach((a) => (a.next = 1e9)); const p = GAME.player; p.x = 0; p.z = 4; p.skillLv = { Q: 3, W: 3, E: 3, R: 1 }; p.mp = p.s.mp; const e = GAME.sim.champions.find((c) => c.team !== p.team); e.x = 2.5; e.z = 1.5; GAME.sim.updateVision(); GAME.world.camera.goal.set(0, 0, 4); GAME.world.camera.target.copy(GAME.world.camera.goal); });
await S(2);
const scr = (x, z) => pg.evaluate(([x, z]) => { const p = GAME.world.project(x, 0, z); return [p.x, p.y]; }, [x, z]);
// 1) 우클릭 이동
let pt = await scr(-4, 6);
await pg.mouse.move(pt[0], pt[1]); await pg.mouse.down({ button: 'right' }); await pg.mouse.up({ button: 'right' });
await tick(45);
R.rightClickMove = await pg.evaluate(() => { const p = GAME.player; return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), reached: Math.hypot(p.x + 4, p.z - 6) < 0.8 }; });
// 2) 우클릭 적 → 공격
await S(3);
const ep = await pg.evaluate(() => { const e = GAME.sim.champions.find((c) => c.team !== GAME.player.team); const p = GAME.world.project(e.x, 1.0, e.z); return [p.x, p.y, e.name]; });
await pg.mouse.move(ep[0], ep[1]); await pg.mouse.down({ button: 'right' }); await pg.mouse.up({ button: 'right' });
R.rightClickAttack = await pg.evaluate(() => GAME.player.target && GAME.player.target.name);
await tick(60);
R.attackLanded = await pg.evaluate(() => GAME.player.dmgDealt > 0);
// 3) S 정지
await pg.keyboard.press('KeyS'); R.stop = await pg.evaluate(() => !GAME.player.target && !GAME.player.path);
// 4) A + 좌클릭 공격 이동
pt = await scr(1, 3);
await pg.keyboard.press('KeyA'); await pg.mouse.move(pt[0], pt[1]); await pg.mouse.down(); await pg.mouse.up();
R.attackMove = await pg.evaluate(() => !!GAME.player.attackMove || !!GAME.player.target);
await tick(30);
R.attackMoveAcquired = await pg.evaluate(() => GAME.player.target && GAME.player.target.kind);
// 5) Q 즉시 시전 (커서 방향)
await pg.keyboard.press('KeyS');
await pg.evaluate(() => { GAME.player.mp = GAME.player.s.mp; GAME.player.cds.Q = 0; });
await pg.mouse.move(ep[0], ep[1]); await pg.keyboard.press('KeyQ'); await tick(2);
R.quickCastQ = await pg.evaluate(() => GAME.player.cds.Q > GAME.sim.time);
// 6) 범위 확인 후 시전: W 누르면 표시, 좌클릭 시전
await pg.evaluate(() => { GAME.applySetting('castMode', 'indicator'); GAME.player.cds.W = 0; GAME.player.action = null; GAME.player.mp = GAME.player.s.mp; });
await pg.keyboard.press('KeyW'); await S(1);
R.indicatorShown = await pg.evaluate(() => GAME.input.aiming === 'W' && GAME.world.ind.circle.visible);
await pg.mouse.down(); await pg.mouse.up(); await tick(2);
R.indicatorCast = await pg.evaluate(() => GAME.player.cds.W > GAME.sim.time);
await pg.evaluate(() => GAME.applySetting('castMode', 'quick'));
// 7) 자유 카메라: Y로 해제 → 가장자리 이동 → 스페이스 복귀
await pg.keyboard.press('KeyY');
const c0 = await pg.evaluate(() => GAME.world.camera.goal.x);
await pg.evaluate(() => { window.hasFocusOrig = document.hasFocus; document.hasFocus = () => true; });
await pg.mouse.move(1279, 360); await S(10);
const c1 = await pg.evaluate(() => GAME.world.camera.goal.x);
R.edgePan = { locked: await pg.evaluate(() => GAME.world.camera.locked), moved: +(c1 - c0).toFixed(2) };
await pg.mouse.move(640, 360);
await pg.keyboard.down('Space'); await S(3); await pg.keyboard.up('Space');
R.spaceRecenter = await pg.evaluate(() => { const c = GAME.world.camera, p = GAME.player; return Math.hypot(c.goal.x - p.x, c.goal.z - p.z) < 0.5; });
// 8) 휠 확대/축소 범위 제한
for (let i = 0; i < 10; i++) await pg.mouse.wheel(0, 300);
R.zoomMax = await pg.evaluate(() => GAME.world.camera.dist);
for (let i = 0; i < 20; i++) await pg.mouse.wheel(0, -300);
R.zoomMin = await pg.evaluate(() => GAME.world.camera.dist);
// 9) B 귀환, Tab 전적, Esc 메뉴(일시정지)
await pg.evaluate(() => { const e = GAME.sim.champions.find((c) => c.team !== GAME.player.team); e.x = 40; e.z = -40; GAME.sim.updateVision(); });
await pg.keyboard.press('KeyB'); R.recall = await pg.evaluate(() => !!GAME.player.recall);
await pg.keyboard.down('Tab'); R.tabScore = await pg.evaluate(() => !document.getElementById('score').classList.contains('hidden')); await pg.keyboard.up('Tab');
await pg.keyboard.press('Escape'); R.escMenuPaused = await pg.evaluate(() => GAME.paused && !document.getElementById('menu').classList.contains('hidden'));
await pg.keyboard.press('Escape'); R.escClose = await pg.evaluate(() => !GAME.paused);
R.errs = errs;
console.log(JSON.stringify(R, null, 1));
await b.close(); srv.close();
