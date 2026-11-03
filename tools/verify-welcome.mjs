import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),errors=[],report=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.ttf':'font/ttf','.mp3':'audio/mpeg','.webp':'image/webp'};
const server=http.createServer((q,r)=>{const file=path.resolve(root,'.'+decodeURIComponent(q.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){r.writeHead(404);r.end();return;}r.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(r);});
await new Promise(r=>server.listen(8139,'127.0.0.1',r));
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
try{
  for(const mobile of [false,true]){
    const page=await browser.newPage({viewport:mobile?{width:932,height:430}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`${process.env.PANG_TEST_BASE||'http://127.0.0.1:8139/'}index.html?manual=1&autostart=choi&q=low&mobile=${mobile?1:0}`);
    await page.waitForFunction(()=>window.READY,null,{timeout:240000});await page.evaluate(()=>GAME.audio.ctx.resume());
    const before=await page.evaluate(()=>{const g=GAME;g.ais=[];g.sim.nextWave=Infinity;g.sim.camps.forEach(c=>c.respawnAt=Infinity);window.welcomeCalls=0;const play=g.welcome.playVoice.bind(g.welcome);g.welcome.playVoice=()=>{welcomeCalls++;return play();};while(g.sim.time<4.75)g.tickOnce();g.processEvents();STEP(1);g.setPaused(true);return{time:g.sim.time,shown:g.welcome.shown,font:[...document.fonts].find(f=>f.family==='Jua')?.status,duration:g.welcome.clip?.buffer.duration};});
    assert(before.time<5&&!before.shown);assert.equal(before.font,'loaded');assert(before.duration>2&&before.duration<5);
    await page.evaluate(()=>STEP(20));assert.equal(await page.evaluate(()=>GAME.sim.time),before.time);assert.equal(await page.evaluate(()=>window.welcomeCalls),0);
    const start=await page.evaluate(()=>{const g=GAME;g.setPaused(false);while(!g.welcome.shown&&g.sim.time<5.1)STEP(1);return{at:g.welcome.startedAt,voice:!!g.welcome.voice,text:g.welcome.el.textContent,calls:welcomeCalls};});
    assert(start.at>=5&&start.at<5.1);assert(start.voice);assert.equal(start.calls,1);assert.equal(start.text,'팽스닥의 협곡에 오신것을 환영합니다');
    await page.waitForTimeout(500);
    const layout=await page.evaluate(()=>{const e=GAME.welcome.el,r=e.getBoundingClientRect(),s=getComputedStyle(e);return{x:r.x,y:r.y,width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2,vw:innerWidth,vh:innerHeight,font:s.fontFamily,opacity:s.opacity,duck:GAME.audio.announcementDuck.gain.value};});
    assert(Math.abs(layout.cx-layout.vw/2)<1&&Math.abs(layout.cy-layout.vh/2)<1);assert(layout.x>=0&&layout.x+layout.width<=layout.vw);assert(layout.font.includes('Jua'));assert.equal(+layout.opacity,1);assert(layout.duck<.35);
    console.log(JSON.stringify({mobile,before,start,layout}));
    await page.evaluate(()=>GAME.renderer.getContext().finish());
    await page.screenshot({path:`dev/welcome-${mobile?'mobile':'desktop'}.png`,timeout:120000});
    await page.waitForTimeout(4200);await page.evaluate(()=>STEP(1));await page.waitForTimeout(500);
    const after=await page.evaluate(()=>{const g=GAME;while(g.sim.time<12)g.tickOnce();g.processEvents();STEP(1);const Intro=g.welcome.constructor;const late=new Intro(g);late.update();const lateSkipped=late.shown&&!late.startedAt;late.destroy();return{calls:welcomeCalls,voice:!!g.welcome.voice,opacity:getComputedStyle(g.welcome.el).opacity,lateSkipped};});
    assert.equal(after.calls,1);assert.equal(after.voice,false);assert.equal(+after.opacity,0);assert(after.lateSkipped);
    const cleanup=await page.evaluate(()=>{const g=GAME,Intro=g.welcome.constructor;g.welcome.destroy();g.sim.time=0;g.welcome=new Intro(g);g.sim.time=5;g.welcome.update();const started=!!g.welcome.voice;g.welcome.dismiss();const cleared=!g.welcome.voice&&!g.welcome.el.classList.contains('visible');g.welcome.update();const noRepeat=!g.welcome.voice;g.welcome.destroy();return{started,cleared,noRepeat,removed:!document.getElementById('match-welcome')};});
    assert(Object.values(cleanup).every(Boolean));report.push({mobile,before,start,layout,after,cleanup});await page.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync('dev/welcome-verification.json',JSON.stringify({report,errors},null,2));console.log(JSON.stringify({ok:true,report,errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
