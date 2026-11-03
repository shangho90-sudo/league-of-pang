import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 400, height: 300 }, hasTouch: true, isMobile: true });
const pg = await ctx.newPage();
await pg.setContent('<body style="touch-action:none;height:100vh"></body>');
await pg.evaluate(() => { window.L = []; for (const ev of ['pointerdown', 'pointerup']) addEventListener(ev, (e) => L.push(ev + ':' + e.pointerId + '@' + Math.round(e.clientX))); });
const cdp = await ctx.newCDPSession(pg);
const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
for (const variant of ['remaining', 'released']) {
  await pg.evaluate(() => (L = []));
  await T('touchStart', [[50, 50, 1]]);
  await T('touchStart', [[50, 50, 1], [300, 50, 2]]);
  if (variant === 'remaining') await T('touchEnd', [[50, 50, 1]]); else await T('touchEnd', [[300, 50, 2]]);
  await T('touchEnd', []);
  console.log(variant, await pg.evaluate(() => L.join(' ')));
}
await b.close();
