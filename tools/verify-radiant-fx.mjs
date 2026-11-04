import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {CHAMPIONS} from '../src/data/champions.js';
const root=process.cwd(),mobile=process.argv.includes('--mobile'),errors=[],assets=new Set();
const mime={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){console.log('404',req.url);res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(8146,'127.0.0.1',r));
const browser=await chromium.launch({channel:process.env.PANG_BROWSER||'msedge',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage(mobile?{viewport:{width:932,height:430},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.url().includes('/models/heroes/'))assets.add(path.basename(new URL(r.url()).pathname));if(!r.ok())errors.push(`${r.status()} ${r.url()}`);});
  const picks=CHAMPIONS.map((c,i)=>({id:c.id,team:i<6?0:1,lane:['top','mid','bot','jungle'][i%4],isPlayer:i===0}));
  const base=process.env.PANG_TEST_BASE||'http://127.0.0.1:8146/';
  await page.goto(`${base}index.html?manual=1&q=${mobile?'low':'medium'}&mobile=${mobile?1:0}&picks=${encodeURIComponent(JSON.stringify(picks))}`);
  await page.waitForFunction(()=>window.READY,null,{timeout:240000});
  await page.evaluate(()=>{
    const g=GAME,s=g.sim;g.ais=[];s.nextWave=Infinity;s.camps.forEach(c=>c.respawnAt=Infinity);g.settings.shake=0;
    window.resetFXTest=(id)=>{
      for(const c of s.champions){c.dead=false;c.level=12;c.skillLv={Q:5,W:5,E:5,R:3};s.recalcStats(c);c.hp=c.s.hp=100000;c.mp=c.s.mp=10000;c.cds={Q:0,W:0,E:0,R:0};c.action=null;c.dash=null;c.path=null;c.target=null;c.status=[];c.recall=null;c.pendingCast=null;c.attackCd=0;c.x=40;c.z=-40;c.pass={};}
      s.projectiles=[];s.zones=[];s.telegraphs=[];s.timers=[];s.events=[];
      const c=s.champions.find(c=>c.def.id===id),target=s.champions.find(t=>t.team!==c.team);
      g.player=c;s.player=c;g.world.playerTeam=c.team;c.x=-3;c.z=3;c.facing=Math.PI/2;target.x=-1.4;target.z=3;
      c.visibleTo=[true,true];target.visibleTo=[true,true];s.updateVision();
      g.world.fx.update(20);g.world.fx.hero.syncZones(s,0,()=>true,c.team);g.world.floating=[];
      g.world.camera.locked=false;g.world.camera.goal.set(-1,0,2);g.world.camera.target.copy(g.world.camera.goal);g.world.camera.dist=23;
      g.world.update(1/30,0,c);return{c,target};
    };
    window.stepFXTest=n=>{for(let i=0;i<n;i++){g.tickOnce();g.processEvents();g.world.update(1/30,0,g.player);}};
  });
  const report=await page.evaluate(()=>{
    const g=GAME,s=g.sim,h=g.world.fx.hero,result={skills:{},basic:{},opaque:true,projectiles:{}};
    for(const unit of s.champions){
      const id=unit.def.id;result.skills[id]={};
      for(const slot of ['Q','W','E','R']){
        const {c,target}=resetFXTest(id),before=h.spawned,sk=c.def.skills[slot];
        const cast=s.cmdCast(c,slot,{point:{x:target.x,z:target.z},target:sk.t==='ally'?c:target,dir:{x:1,z:0}});
        g.processEvents();stepFXTest(15);
        for(const f of h.active)f.root.traverse(o=>{if(o.isMesh&&(!o.material.depthWrite||o.material.transparent||o.material.opacity!==1))result.opaque=false;});
        stepFXTest(85);
        result.skills[id][slot]={ok:cast.ok,reason:cast.reason,effects:h.spawned-before};
      }
      const {c,target}=resetFXTest(id),before=h.spawned;s.cmdAttack(c,target);stepFXTest(45);result.basic[id]=h.spawned-before;
      if(c.def.stats.ranged){
        const p={src:c,vis:c.def.stats.proj},view=g.world.fx.makeProjView(p);
        result.projectiles[id]={model:view.userData.heroModel?.userData.assetId||null,meshes:view.children.filter(o=>o.isMesh&&o.visible).length,trail:view.userData.trail.color};
        g.world.fx.projViews.set('test-'+id,view);
      }
    }
    resetFXTest('flame');
    const zone={id:987,vis:'firestorm',team:1,shape:{x:0,z:0,r:3}};
    h.syncZones({zones:[zone]},1/30,()=>false,0);result.hiddenZones=h.zones.size;
    h.syncZones({zones:[{...zone,team:0}]},1/30,()=>false,0);result.allyZones=h.zones.size;
    h.syncZones({zones:[]},1/30,()=>true,0);result.expiredZones=h.zones.size;
    h.update(20);for(let i=0;i<h.limit+20;i++)h.emit('fx-radiant-star',{size:1});
    h.cast(g.player,'R');result.budget={active:h.active.length,limit:h.limit,ultimate:h.active.some(f=>f.priority===2)};
    h.update(20);g.world.fx.syncProjectiles({projectiles:[]},0,()=>true,()=>null);
    result.cleanup={active:h.active.length,glow:h.glow.items.length,projectiles:g.world.fx.projViews.size};
    return result;
  });
  for(const c of CHAMPIONS){for(const slot of ['Q','W','E','R']){assert(report.skills[c.id][slot].ok,`${c.id}/${slot} failed`);assert(report.skills[c.id][slot].effects>0,`${c.id}/${slot} no model effect`);}assert(report.basic[c.id]>0,`${c.id} attack missing`);}
  assert(report.opaque);assert.equal(report.hiddenZones,0);assert.equal(report.allyZones,1);assert.equal(report.expiredZones,0);
  assert(report.budget.active<=report.budget.limit&&report.budget.ultimate);assert.deepEqual(report.cleanup,{active:0,glow:0,projectiles:0});
  assert.equal(assets.size,30);assert(new Set(Object.values(report.projectiles).map(p=>p.trail)).size>=7);
  console.log('12 basic attacks, 48 skills, opaque materials, fog visibility, lifetime and budgets passed');
  // In-game captures use real casts and the normal camera distance.
  for(const [id,slot,frames] of [['flame','R',30],['choi','R',42],['jung','R',18],['bang','R',15],['sagong','R',53],['pang','R',20]]){
    console.log('Capture',id);
    await page.evaluate(({id,slot,frames})=>{
      const {c,target}=resetFXTest(id),g=GAME;target.x=0.5;target.z=1;
      g.sim.updateVision();g.sim.cmdCast(c,slot,{point:{x:target.x,z:target.z},target,dir:{x:.87,z:-.5}});
      g.processEvents();stepFXTest(frames);g.world.render();g.world.drawOverlay(0,c,1);
    },{id,slot,frames});
    await page.screenshot({path:`dev/radiant-${mobile?'mobile':'desktop'}-${id}.png`});
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(`dev/radiant-${mobile?'mobile':'desktop'}-verification.json`,JSON.stringify({report,assets:[...assets],errors},null,2));
  console.log(JSON.stringify({ok:true,mobile,champions:12,skills:48,models:assets.size,errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
