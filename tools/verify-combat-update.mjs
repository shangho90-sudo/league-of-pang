import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {CHAMPIONS} from '../src/data/champions.js';
const root=process.cwd(),errors=[],report={};
const mime={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg','.webp':'image/webp'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(8137,'127.0.0.1',r));
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const base=process.env.PANG_TEST_BASE||'http://127.0.0.1:8137/';
const monitor=p=>{p.on('pageerror',e=>errors.push(e.stack));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(!r.ok()&&/\/public\//.test(r.url()))errors.push(`${r.status()} ${r.url()}`);});};
const setup=()=>{const g=GAME,s=g.sim;g.ais=[];s.nextWave=Infinity;s.camps.forEach(c=>c.respawnAt=Infinity);for(const c of s.champions){c.x=35;c.z=-35;c.dead=false;c.level=12;c.skillLv={Q:5,W:5,E:5,R:3};s.recalcStats(c);c.hp=c.s.hp;c.mp=c.s.mp;c.cds={Q:0,W:0,E:0,R:0};c.action=null;c.target=null;c.path=null;c.status=[];}g.player.x=-3;g.player.z=3;g.world.camera.goal.set(-3,0,3);g.world.camera.target.copy(g.world.camera.goal);s.updateVision();g.hud.annT=0;STEP(2);};
try{
 if(!process.argv.includes('--mobile-only')){
  const page=await browser.newPage({viewport:{width:1440,height:900}});monitor(page);
  const picks=CHAMPIONS.map((c,i)=>({id:c.id,team:i<6?0:1,lane:['top','mid','bot','jungle'][i%4],isPlayer:i===0}));
  await page.goto(`${base}index.html?manual=1&q=medium&mobile=0&picks=${encodeURIComponent(JSON.stringify(picks))}`);await page.waitForFunction(()=>window.READY,null,{timeout:240000});await page.evaluate(setup);await page.evaluate(()=>GAME.audio.ctx.resume());
  report.audio=await page.evaluate(()=>{
    const g=GAME,c=g.audio.combat,s=g.sim,result={decoded:c.buffers.size,clips:{},events:{}};
    for(const [key,clip] of c.buffers){let peak=0;const data=clip.buffer.getChannelData(0);for(const sample of data)peak=Math.max(peak,Math.abs(sample));result.clips[key]={peak,duration:clip.duration,offset:clip.offset,buffer:clip.buffer.duration};}
    for(const u of s.champions){u.x=-3;u.z=3;u.visibleTo=[true,true];const src=s.champions.find(t=>t!==u);c.stop();const events=[{type:'attackStart',u,t:src},{type:'dmg',t:u,src,amt:10,dmgType:'magic',basic:false},...['Q','W','E','R'].map(slot=>({type:'cast',u,slot}))];g.world.handleEvents(events,g.player);result.events[u.def.id]=Object.fromEntries(['attack','hit','Q','W','E','R'].map(k=>[k,c.stats.byKey[`${u.def.id}/${k}`]||0]));}
    c.stop();for(let i=0;i<40;i++)c.play('pang','attack',{unitId:i});result.maxVoices=c.voices.length;result.dropped=c.stats.dropped;c.play('pang','R',{unitId:999});result.ultimateAdmitted=c.voices.some(v=>v.priority===3);result.afterUltimate=c.voices.length;
    g.audio.vol.music=0;g.audio.applyVol();return result;
  });
  fs.writeFileSync('dev/audio-verification.json',JSON.stringify(report.audio,null,2));
  assert.equal(report.audio.decoded,72);for(const [key,c] of Object.entries(report.audio.clips)){assert(c.peak>.001,`${key} is silent`);assert(c.duration>.1&&c.offset<c.buffer,`${key} invalid clip`);}for(const [id,kinds]of Object.entries(report.audio.events))for(const [kind,count]of Object.entries(kinds))assert(count>0,`${id}/${kind} missing event sound`);assert.equal(report.audio.maxVoices,18);assert.equal(report.audio.afterUltimate,18);assert(report.audio.dropped>0&&report.audio.ultimateAdmitted);
  await page.waitForTimeout(3600);assert.equal(await page.evaluate(()=>GAME.audio.combat.voices.length),0);assert.equal(await page.evaluate(()=>GAME.audio.musG.gain.value),0);await page.evaluate(()=>{GAME.audio.vol.music=.4;GAME.audio.applyVol();});console.log('72 audio files and event routing passed');
  await page.evaluate(setup);await page.evaluate(()=>{GAME.world.fx.update(20);GAME.world.floating=[];});
  report.indicators=[];
  for(const [name,id,slot]of [['rectangle','cha','Q'],['circle','pang','Q'],['cone','park','Q']]){
    const state=await page.evaluate(({id,slot})=>{const g=GAME,w=g.world,p=g.player,sk=g.sim.champions.find(c=>c.def.id===id).def.skills[slot],dir={x:.70710678,z:-.70710678},point={x:p.x+3,z:p.z-3};w.showAim(p,sk,point,dir,false);w.rangeVisual.update(2);w.camera.locked=false;w.camera.goal.set(p.x+2,0,p.z-2);w.camera.target.copy(w.camera.goal);w.camera.dist=18;w.update(1/30,0,p);w.render();w.drawOverlay(0,p,1);return{sk,area:w.rangeVisual.area.params,range:w.rangeVisual.range.params,stars:w.rangeVisual.stars.map(m=>m.count),arrow:w.rangeVisual.arrow.children.length};},{id,slot});
    assert(state.stars.every(n=>n>0));assert.equal(state.arrow,2);assert.equal(state.range.radius,state.sk.range);
    if(name==='rectangle'){assert.equal(state.area.shape,1);assert.equal(state.area.length,state.sk.range);assert.equal(state.area.width,state.sk.width||1.2);}else if(name==='circle'){assert.equal(state.area.radius,state.sk.radius);}else{assert.equal(state.area.shape,2);assert.equal(state.area.cone,state.sk.angle*Math.PI/180);}
    report.indicators.push({name,...state});await page.screenshot({path:`dev/indicator-${name}.png`});
  }
  const reuse=await page.evaluate(()=>{const w=GAME.world,a=w.rangeVisual.area.geometry,r=w.rangeVisual.range.geometry;for(let i=0;i<300;i++){w.showRange(GAME.player,5);w.showAim(GAME.player,{t:'dir',range:9,width:1.4},{x:1,z:1},{x:1,z:0},false);}return a===w.rangeVisual.area.geometry&&r===w.rangeVisual.range.geometry;});assert(reuse);console.log('Range shapes, ornaments, geometry reuse passed');await page.close();
 }
  const context=await browser.newContext({viewport:{width:932,height:430},isMobile:true,hasTouch:true});const mobile=await context.newPage();monitor(mobile);
  await mobile.goto(`${base}index.html?manual=1&q=low&mobile=1&autostart=choi&seed=5`);await mobile.waitForFunction(()=>window.READY,null,{timeout:240000});await mobile.evaluate(setup);
  report.layouts=[];
  for(const [width,height,mirror,size] of [[932,430,false,1],[667,375,false,1],[1024,768,false,1],[844,390,true,1],[667,375,false,1.35],[390,844,false,1],[360,740,false,1]]){
    await mobile.setViewportSize({width,height});await mobile.evaluate(({mirror,size})=>{GAME.settings.mirror=mirror;GAME.settings.btnSize=size;GAME.input.layout();GAME.resize();STEP(1);},{mirror,size});
    assert.equal(await mobile.locator('#rotate').isVisible(),height>width,'Portrait rotation guidance');
    const state=await mobile.evaluate(()=>{const R=[...document.querySelectorAll('.mskill,#joy,#m-mm,#m-top-right .mbtn')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return{name:e.dataset.slot||e.dataset.ctl+'-'+(e.dataset.kind||'')||e.id,x:b.x,y:b.y,w:b.width,h:b.height,round:e.id!=='m-mm'};});const issues=[];for(const a of R)if(a.x<-.5||a.y<-.5||a.x+a.w>innerWidth+.5||a.y+a.h>innerHeight+.5)issues.push('clipped '+a.name);for(let i=0;i<R.length;i++)for(let j=i+1;j<R.length;j++){const a=R[i],b=R[j];if(a.round&&b.round&&Math.hypot(a.x+a.w/2-b.x-b.w/2,a.y+a.h/2-b.y-b.h/2)<(a.w+b.w)/2-1)issues.push(`overlap ${a.name}/${b.name}`);}return{rects:R,issues};});
    report.layouts.push({width,height,mirror,size,...state});await mobile.screenshot({path:`dev/mobile-controls-${width}-${mirror?'mirror':size}.png`});assert.deepEqual(state.issues,[],JSON.stringify({width,height,mirror,size}));
  }
  await mobile.setViewportSize({width:932,height:430});await mobile.evaluate(()=>{GAME.settings.mirror=false;GAME.settings.btnSize=1;GAME.input.layout();GAME.resize();});await mobile.evaluate(setup);
  const cdp=await context.newCDPSession(mobile),T=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id])=>({x,y,id,radiusX:8,radiusY:8,force:1}))});
  const center=sel=>mobile.locator(sel).evaluate(el=>{const b=el.getBoundingClientRect();return[b.x+b.width/2,b.y+b.height/2];});
  await mobile.evaluate(()=>{window.TOUCH_TRACE=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])window.addEventListener(type,e=>TOUCH_TRACE.push({type,id:e.pointerId,x:e.clientX,y:e.clientY}));});
  const step=n=>mobile.evaluate(n=>STEP(n),n),joy=await center('#joy'),q=await center('[data-slot=Q]'),before=await mobile.evaluate(()=>({x:GAME.player.x,z:GAME.player.z}));
  await T('touchStart',[[...joy,1]]);await T('touchMove',[[joy[0]+50,joy[1]-15,1]]);await step(15);
  await T('touchStart',[[joy[0]+50,joy[1]-15,1],[...q,2]]);await T('touchMove',[[joy[0]+50,joy[1]-15,1],[q[0]-65,q[1]-50,2]]);await mobile.waitForFunction(()=>GAME.input.aim?.drag&&GAME.input.aim.dx<0);await step(3);
  report.touch=await mobile.evaluate(before=>({moved:Math.hypot(GAME.player.x-before.x,GAME.player.z-before.z),aim:GAME.input.aim?.slot,joy:GAME.input.joy.active,indicator:GAME.world.rangeVisual.area.root.visible,aimDirection:GAME.input.computeAim().dir,indicatorX:GAME.world.rangeVisual.area.params.x,playerX:GAME.player.x}),before);assert(report.touch.moved>.5);assert.equal(report.touch.aim,'Q');assert(report.touch.joy&&report.touch.indicator);assert(report.touch.aimDirection.x<0&&report.touch.indicatorX<report.touch.playerX);
  await mobile.screenshot({path:'dev/mobile-skill-aim.png'});
  await T('touchEnd',[[q[0]-65,q[1]-50,2]]);await step(14);report.touch.cast=await mobile.evaluate(()=>({cd:GAME.player.cds.Q,aim:!!GAME.input.aim,joy:GAME.input.joy.active,trace:TOUCH_TRACE}));console.log(JSON.stringify(report.touch));assert(report.touch.cast.cd>0&&!report.touch.cast.aim&&report.touch.cast.joy);
  await T('touchEnd',[]);await step(2);assert.equal(await mobile.evaluate(()=>GAME.input.ptrs.size),0);
  const wb=await center('[data-slot=W]');await T('touchStart',[[...wb,3]]);const cancel=await center('#m-cancel');await T('touchMove',[[...cancel,3]]);assert(await mobile.evaluate(()=>GAME.input.aim.overCancel));await T('touchEnd',[]);await step(2);assert.equal(await mobile.evaluate(()=>GAME.player.cds.W),0);
  const shop=await center('[data-ctl=shop]');await T('touchStart',[[...shop,4]]);await T('touchEnd',[]);assert(await mobile.locator('#shop').isVisible());await mobile.locator('#shop .x').click();assert(!(await mobile.locator('#shop').isVisible()));
  const recall=await center('[data-ctl=recall]');await T('touchStart',[[...recall,5]]);await T('touchEnd',[]);assert(await mobile.evaluate(()=>!!GAME.player.recall));
  const atk=await center('[data-ctl=attack]');await T('touchStart',[[...atk,6]]);await step(1);assert(await mobile.evaluate(()=>GAME.input.attackHeld==='any'&&GAME.world.rangeVisual.range.root.visible));await T('touchEnd',[]);assert.equal(await mobile.evaluate(()=>GAME.input.attackHeld),null);
  report.touch.cancelled=true;report.touch.shop=true;report.touch.recall=true;report.touch.attackHold=true;
  await context.close();assert.deepEqual(errors,[]);fs.writeFileSync('dev/combat-update-verification.json',JSON.stringify({...report,errors},null,2));console.log(JSON.stringify({ok:true,audioFiles:72,indicatorShapes:3,mobileLayouts:report.layouts.length,touch:report.touch,errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
