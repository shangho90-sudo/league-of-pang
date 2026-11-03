import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd(), errors = [], audioRequests = new Set();
const mobile = process.argv.includes('--mobile'), prefix = mobile ? 'mobile' : 'updated';
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.json':'application/json','.webp':'image/webp','.jpg':'image/jpeg'};
const srv = http.createServer((q,s) => {
  const p = path.resolve(root, '.' + decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(root + path.sep) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, {'Content-Type':types[path.extname(p)] || 'application/octet-stream', 'Content-Length':fs.statSync(p).size}); fs.createReadStream(p).pipe(s);
});
await new Promise(r=>srv.listen(8127,'127.0.0.1',r));
const browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try {
  const page = await browser.newPage(mobile ? {viewport:{width:932,height:430},isMobile:true,hasTouch:true,deviceScaleFactor:1} : {viewport:{width:1440,height:900}});
  await page.addInitScript(() => {
    window.TEST_AUDIO = [];
    const create = document.createElement.bind(document);
    document.createElement = function(name,opts) { const el = create(name,opts); if (name === 'audio') window.TEST_AUDIO.push(el); return el; };
  });
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
  page.on('request',r=>{ if(r.url().endsWith('.mp3')) audioRequests.add(path.basename(new URL(r.url()).pathname)); });
  await page.goto(`http://127.0.0.1:8127/index.html?mobile=${mobile?1:0}&q=${mobile?'low':'medium'}&manual=1`);
  await page.locator('#t-music').click();
  await page.waitForFunction(()=>TEST_AUDIO.some(a=>a.src.endsWith('title.mp3')&&!a.paused&&a.currentTime>0.2),null,{timeout:30000});
  await page.waitForFunction(()=>!document.querySelector('#t-start').disabled,null,{timeout:180000});
  await page.screenshot({path:`dev/${prefix}-title.png`});
  await page.locator('#t-start').click();
  await page.waitForFunction(()=>TEST_AUDIO.some(a=>a.src.endsWith('select.mp3')&&!a.paused&&a.currentTime>0.2),null,{timeout:30000});
  await page.screenshot({path:`dev/${prefix}-select.png`});
  await page.locator('#btn-start').click();
  await page.waitForFunction(()=>window.READY,null,{timeout:240000});
  await page.waitForFunction(()=>TEST_AUDIO.some(a=>a.src.endsWith('battle.mp3')&&!a.paused&&a.currentTime>0.2),null,{timeout:30000});
  await page.evaluate(()=>STEP(3));
  await page.screenshot({path:`dev/${prefix}-base.png`});
  const base = await page.evaluate(()=>({props:GAME.world.propStats,assets:[...GAME.world.views.values()].map(v=>v.m?.userData.assetId||v.model?.userData.assetId||v.body?.userData.assetId).filter(Boolean),render:GAME.renderer.info.render}));
  assert(base.assets.includes('turret')); assert(base.assets.includes('nexus')); assert(base.props.walls>0);
  const units = await page.evaluate(()=>{
    const g=GAME; g.fastForward(90);
    for(const c of g.sim.camps) if(!c.alive) g.sim.spawnCamp(c);
    for(const u of g.sim.units) if(u.kind==='monster'||u.kind==='minion') {u.visibleTo[g.player.team]=true; const v=g.world.viewFor(u);v.setVisible(true);v.update(1/30,g.sim.time,0);}
    const views=[...g.world.views.values()];
    const assets=views.map(v=>v.model?.userData.assetId||v.body?.userData.assetId).filter(Boolean);
    const rig=views.find(v=>v.body?.userData.assetId==='minion-melee')?.body;
    const bones=[]; rig?.traverse(o=>{if(o.isBone&&/Limb_[01]$/.test(o.name)){const p=o.getWorldPosition(o.position.clone()); bones.push({name:o.name,world:p.toArray()});}});
    return {assets:[...new Set(assets)],bones};
  });
  for(const id of ['minion-melee','minion-caster','golem','wolf','drake','colossus']) assert(units.assets.includes(id),id);
  await page.evaluate(()=>{ const g=GAME, p=g.player;p.x=-14;p.z=14;g.world.camera.locked=false;g.world.camera.goal.set(-14,0,14);g.world.camera.target.copy(g.world.camera.goal);STEP(3); });
  await page.screenshot({path:`dev/${prefix}-lane.png`});
  const audio = await page.evaluate(async()=>{
    GAME.applySetting('volMusic',0); GAME.applySetting('volMusic',0.35);
    const tracks=TEST_AUDIO.filter(a=>a.src).map(a=>({file:a.src.split('/').pop(),duration:a.duration,time:a.currentTime,playing:!a.paused,loop:a.loop}));
    return tracks;
  });
  assert.deepEqual([...audioRequests].sort(),['battle.mp3','select.mp3','title.mp3']);
  await page.evaluate(()=>GAME.surrender());
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(()=>TEST_AUDIO.filter(a=>!a.paused).length),0);
  const report={base,units,audio,audioRequests:[...audioRequests],errors};
  fs.writeFileSync(`dev/${prefix}-verification.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  assert.deepEqual(errors,[]);
} finally { await browser.close(); await new Promise(r=>srv.close(r)); }
