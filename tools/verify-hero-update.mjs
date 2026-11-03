import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {CHAMPIONS} from '../src/data/champions.js';
const root=process.cwd(),mobile=process.argv.includes('--mobile'),errors=[],requests=new Set();
const mime={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(8133,'127.0.0.1',resolve));
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage(mobile?{viewport:{width:932,height:430},isMobile:true,hasTouch:true}:{viewport:{width:1600,height:900}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.url().includes('/models/heroes/')){requests.add(path.basename(new URL(r.url()).pathname));if(!r.ok())errors.push(`${r.status()} ${r.url()}`);}});
  const picks=CHAMPIONS.map((c,i)=>({id:c.id,team:i<6?0:1,lane:['top','mid','bot','jungle'][i%4],isPlayer:i===0}));
  const base=process.env.PANG_TEST_BASE||'http://127.0.0.1:8133/';
  await page.goto(`${base}index.html?manual=1&q=${mobile?'low':'medium'}&mobile=${mobile?1:0}&picks=${encodeURIComponent(JSON.stringify(picks))}`);
  await page.waitForFunction(()=>window.READY,null,{timeout:240000});
  const report=await page.evaluate((mobile)=>{
    const g=GAME,s=g.sim;g.ais.forEach(a=>a.next=1e9);s.nextWave=Infinity;for(const camp of s.camps)camp.respawnAt=Infinity;
    const result={gear:{},skills:{},basic:{}};
    const reset=()=>{for(const c of s.champions){c.dead=false;c.level=12;c.skillLv={Q:5,W:5,E:5,R:3};s.recalcStats(c);c.hp=c.s.hp=100000;c.mp=c.s.mp=10000;c.cds={Q:0,W:0,E:0,R:0};c.action=null;c.dash=null;c.path=null;c.target=null;c.status=[];c.recall=null;c.x=45;c.z=45;c.attackCd=0;}s.projectiles=[];s.zones=[];s.timers=[];s.telegraphs=[];s.events=[];};
    const step=n=>{for(let i=0;i<n;i++){g.tickOnce();g.processEvents();g.world.update(1/30,0,g.player);}};
    for(const c of s.champions){
      const target=s.champions.find(t=>t.team!==c.team),id=c.def.id;
      const v=g.world.viewFor(c),assetIds=[];
      v.v.root.traverse(o=>{if(o.userData.assetId)assetIds.push(o.userData.assetId);});result.gear[id]=assetIds;
      result.skills[id]={};
      for(const slot of ['Q','W','E','R']){
        reset();c.x=-3;c.z=3;target.x=-1.4;target.z=3;c.facing=Math.PI/2;c.visibleTo=[true,true];target.visibleTo=[true,true];s.updateVision();
        const before=g.world.fx.hero.spawned,sk=c.def.skills[slot];
        const cast=s.cmdCast(c,slot,{point:{x:target.x,z:target.z},target:sk.t==='ally'?c:target});
        g.processEvents();step(100);
        result.skills[id][slot]={ok:cast.ok,reason:cast.reason,effects:g.world.fx.hero.spawned-before};
      }
      reset();c.x=-3;c.z=3;target.x=-2;target.z=3;c.facing=Math.PI/2;c.visibleTo=[true,true];target.visibleTo=[true,true];s.updateVision();
      const before=g.world.fx.hero.spawned;s.cmdAttack(c,target);step(45);
      result.basic[id]=g.world.fx.hero.spawned-before;
    }
    reset();s.champions.forEach((c,i)=>{c.x=(i%6)*2.1-5.25;c.z=i<6?3:-0.3;c.visibleTo=[true,true];});s.updateVision();
    g.world.camera.locked=false;g.world.camera.goal.set(0,0,1.4);g.world.camera.target.copy(g.world.camera.goal);g.world.camera.dist=mobile?24:18;g.world.update(1/30,0,g.player);
    g.world.fx.hero.update(10);
    for(const [i,id] of ['fx-crescent','fx-bolt','fx-rune-ring','fx-ward','fx-ice-burst','fx-flame-vortex','fx-meteor','fx-anvil'].entries())g.world.fx.hero.emit(id,{x:(i%4)*2.4-3.6,z:1.5+Math.floor(i/4)*-3.2,size:1.6,color:[0x78e6df,0xffca70,0xae85ff,0x87dfff][i%4],life:1.0});
    g.world.fx.hero.update(0.18);g.world.render();g.world.drawOverlay(0,g.player,mobile?1.1:1);
    result.active=g.world.fx.hero.active.length;result.limit=g.world.fx.hero.limit;
    return result;
  },mobile);
  await page.screenshot({path:`dev/hero-${mobile?'mobile':'desktop'}.png`});
  const cleanup=await page.evaluate(()=>{const fx=GAME.world.fx;fx.hero.update(20);return {active:fx.hero.active.length,pools:[...fx.hero.pool].map(([k,v])=>[k,v.length]),render:GAME.renderer.info.render};});
  for(const c of CHAMPIONS){assert(report.gear[c.id].length>=1,c.id+' missing new gear');for(const slot of ['Q','W','E','R']){assert(report.skills[c.id][slot].ok,`${c.id} ${slot}: ${report.skills[c.id][slot].reason}`);assert(report.skills[c.id][slot].effects>0,`${c.id} ${slot}: missing modeled effect`);}assert(report.basic[c.id]>0,c.id+' basic effect');}
  assert.equal(requests.size,27);assert(report.active<=report.limit);assert.equal(cleanup.active,0);assert.deepEqual(errors,[]);
  fs.writeFileSync(`dev/hero-${mobile?'mobile':'desktop'}-verification.json`,JSON.stringify({report,cleanup,requests:[...requests],errors},null,2));
  console.log(JSON.stringify({champions:12,skills:48,models:requests.size,cleanup,errors}));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
