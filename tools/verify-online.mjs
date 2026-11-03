import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createOnlineServer} from '../server/index.js';
import {CHAMPIONS} from '../src/data/champions.js';
const app=createOnlineServer();await new Promise(r=>app.server.listen(8787,'127.0.0.1',r));
const root=process.cwd(),mime={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg','.webp':'image/webp'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(8135,'127.0.0.1',r));
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const errors=[];
try{
  const a=await browser.newPage({viewport:{width:1600,height:1000}}),b=await browser.newPage({viewport:{width:932,height:430},isMobile:true,hasTouch:true});
  for(const p of [a,b]){p.on('pageerror',e=>{errors.push(e.stack);console.error(e.stack);});p.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});}
  const base=(process.env.PANG_ONLINE_BASE||'http://127.0.0.1:8135/')+'index.html';const query=base.includes('127.0.0.1')?'&server=http://127.0.0.1:8787':'';
  await a.goto(base+'?online=1&q=low&mobile=0'+query);console.log('Desktop loaded');await a.waitForFunction(()=>window.BOOTED&&window.ONLINE?.connected,null,{timeout:90000});console.log('Desktop connected');
  await a.locator('[name=nickname]').fill('방장테스트');await a.locator('[name=roomName]').fill('실시간 온라인 검증');await a.locator('[data-act=create]').click();
  await a.waitForFunction(()=>ONLINE.room?.members.length===1);assert.equal(await a.locator('[data-act=start]').isDisabled(),true);
  await a.locator(`[data-pick=${CHAMPIONS[0].id}]`).click();await a.locator('[data-act=ready]').click();await a.waitForFunction(()=>ONLINE.room.members[0].ready);
  await b.goto(base+'?online=1&q=low&mobile=1'+query);await b.waitForFunction(()=>window.BOOTED&&window.ONLINE?.connected,null,{timeout:240000});
  await b.screenshot({path:'dev/online-rooms-mobile.png'});
  await b.locator('[name=nickname]').fill('참가자테스트');const roomId=await a.evaluate(()=>ONLINE.room.id);await b.locator(`[data-join="${roomId}"]`).click();
  await b.waitForFunction(()=>ONLINE.room?.members.length===2);
  assert.equal(await b.locator(`[data-pick=${CHAMPIONS[0].id}]`).isDisabled(),true);assert(await b.locator(`[data-pick=${CHAMPIONS[0].id}]`).evaluate(el=>el.classList.contains('locked')));
  assert.equal(await b.locator('[data-act=start]').count(),0);assert.equal(await a.locator('.host-star').count(),1);
  await b.locator(`[data-pick=${CHAMPIONS[1].id}]`).click();await b.locator('[data-act=ready]').click();await a.waitForFunction(()=>ONLINE.room.canStart);
  await a.screenshot({path:'dev/online-room-desktop.png'});await b.screenshot({path:'dev/online-room-mobile.png'});
  await a.locator('[data-act=start]').click();
  for(const p of [a,b])await p.waitForFunction(()=>window.GAME?.online&&ONLINE.running&&GAME.sim.time>1,null,{timeout:240000});
  assert.equal(await a.evaluate(()=>GAME.ais.length),0);assert.equal(await b.evaluate(()=>GAME.ais.length),0);
  const start=await b.evaluate(()=>({x:GAME.player.x,z:GAME.player.z}));await b.evaluate(()=>GAME.sim.cmdJoy(GAME.player,.6,.6));
  await b.waitForFunction(({x,z})=>Math.hypot(GAME.player.x-x,GAME.player.z-z)>.4,start);await b.evaluate(()=>GAME.sim.cmdJoy(GAME.player,0,0));
  await b.evaluate(()=>GAME.sim.cmdCast(GAME.player,'Q',{point:{x:GAME.player.x+1,z:GAME.player.z+1}}));
  await b.waitForFunction(()=>GAME.player.cds.Q>0);
  const time=await b.evaluate(()=>GAME.sim.time);await a.evaluate(()=>ONLINE.ws.close());await b.waitForFunction(t=>GAME.sim.time>t+.6,time);await a.waitForFunction(()=>ONLINE.connected&&GAME.sim.time>2);
  await a.evaluate(()=>GAME.hud.toggleMenu(true));const paused=await b.evaluate(()=>GAME.sim.time);await b.waitForFunction(t=>GAME.sim.time>t+.5,paused);await a.evaluate(()=>GAME.hud.toggleMenu(false));
  for(const p of [a,b])await p.waitForFunction(()=>GAME.sim.time>12,null,{timeout:30000});
  for(const p of [a,b]){const intro=await p.evaluate(()=>({at:GAME.welcome.startedAt,shown:GAME.welcome.shown}));assert(intro.shown&&intro.at>=5&&intro.at<9,'One greeting at match start');}
  await b.screenshot({path:'dev/online-game-mobile.png'});
  const result=await a.evaluate(()=>({time:GAME.sim.time,players:GAME.sim.champions.length,units:GAME.sim.units.length,ais:GAME.ais.length,connected:ONLINE.connected,latency:ONLINE.latency}));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,result,errors}));
  await a.evaluate(()=>ONLINE.send({type:'leave'}));await b.waitForFunction(()=>GAME.sim.over,null,{timeout:15000});await b.waitForSelector('#r-online',{timeout:15000});await b.locator('#r-online').click();await b.waitForFunction(()=>!ONLINE.room);
}finally{await browser.close();await app.close();await new Promise(r=>server.close(r));}
