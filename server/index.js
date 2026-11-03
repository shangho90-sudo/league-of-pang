import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import {CHAMP_BY_ID} from '../src/data/champions.js';
const id=()=>randomBytes(12).toString('hex');
const clean=(v,n)=>typeof v==='string'?v.replace(/[<>\x00-\x1f\x7f]/g,'').trim().slice(0,n):'';
const lanes=['top','mid','bot','jungle'];
export function createOnlineServer({maxMatches=Number(process.env.MAX_MATCHES)||3,reconnectMs=60000,loadMs=120000}={}) {
  const sessions=new Map(),rooms=new Map();let closing=false;
  const send=(s,m)=>{if(s?.ws?.readyState===WebSocket.OPEN){if(s.ws.bufferedAmount>1024*1024){s.ws.close(1013,'Connection too slow');return;}s.ws.send(JSON.stringify(m));}};
  const roomFor=s=>rooms.get(s.roomId);
  const canStart=r=>r.status==='waiting'&&r.members.length>=2&&[0,1].every(t=>r.members.filter(p=>p.team===t).length===r.members.length/2)&&r.members.every(p=>p.ready&&p.connected)&&new Set(r.members.map(p=>p.champion)).size===r.members.length;
  const publicRoom=r=>({id:r.id,name:r.name,hostId:r.hostId,status:r.status,canStart:canStart(r),capacity:8,members:r.members.map(p=>({id:p.id,name:p.name,team:p.team,lane:p.lane,champion:p.champion,ready:p.ready,connected:p.connected,loaded:p.loaded||false}))});
  const list=()=>[...rooms.values()].map(r=>({id:r.id,name:r.name,status:r.status,count:r.members.length,blue:r.members.filter(p=>p.team===0).length,red:r.members.filter(p=>p.team===1).length,hostName:r.members.find(p=>p.id===r.hostId)?.name||'',capacity:8}));
  const publishList=()=>{const m={type:'rooms',rooms:list()};for(const s of sessions.values())if(!s.roomId)send(s,m);};
  const publishRoom=r=>{for(const p of r.members)send(sessions.get(p.id),{type:'room',room:publicRoom(r)});publishList();};
  const err=(s,reason)=>send(s,{type:'error',reason});
  const playerFor=s=>roomFor(s)?.members.find(p=>p.id===s.id);
  function deleteRoom(r){clearTimeout(r.loadingTimer);clearTimeout(r.endTimer);r.worker?.terminate();rooms.delete(r.id);publishList();}
  function transfer(r){if(!r.members.some(p=>p.id===r.hostId&&p.connected))r.hostId=r.members.find(p=>p.connected)?.id||r.members[0]?.id;}
  function cancelLoad(r,reason){clearTimeout(r.loadingTimer);r.worker?.terminate();r.worker=null;r.matchId=null;r.sentStart=false;r.status='waiting';r.members.forEach(p=>{p.ready=false;p.loaded=false;send(sessions.get(p.id),{type:'matchCancelled',reason});});publishRoom(r);}
  function leave(s,reason='left') {
    const r=roomFor(s);if(!r)return;s.roomId=null;clearTimeout(s.expireTimer);
    const p=r.members.find(p=>p.id===s.id);r.members=r.members.filter(p=>p.id!==s.id);
    send(s,{type:reason==='kicked'?'kicked':'left',reason:reason==='kicked'?'방장이 대기실에서 내보냈습니다.':undefined});send(s,{type:'rooms',rooms:list()});
    if(!r.members.length){deleteRoom(r);return;}
    if(r.status==='loading')cancelLoad(r,'참가자가 나가서 시작 준비가 취소되었습니다.');
    if(r.status==='playing'){r.worker.postMessage({type:'stopPlayer',playerId:s.id});if(!r.members.some(m=>m.team===p.team))r.worker.postMessage({type:'forfeit',team:p.team});}
    transfer(r);publishRoom(r);
  }
  function start(r){
    const active=[...rooms.values()].filter(x=>['loading','playing'].includes(x.status)).length;
    if(active>=maxMatches)return '진행 중인 경기가 많습니다. 잠시 후 시작해 주세요.';
    r.status='loading';r.matchId=id();r.members.forEach(p=>p.loaded=false);
    r.picks=r.members.map(p=>({id:p.champion,team:p.team,lane:p.lane,playerId:p.id,name:p.name}));r.seed=randomBytes(4).readUInt32LE(0);
    r.worker=new Worker(new URL('./match-worker.js',import.meta.url),{workerData:{picks:r.picks,seed:r.seed}});
    r.worker.on('message',m=>{
      if(closing||!rooms.has(r.id))return;
      if(m.type==='state') {
        for(const p of r.members)send(sessions.get(p.id),{type:'snapshot',matchId:r.matchId,state:m.states[p.team]});
        if(m.fullStates&&!r.sentStart){r.sentStart=true;for(const p of r.members)send(sessions.get(p.id),{type:'match',matchId:r.matchId,picks:r.picks,seed:r.seed,state:m.fullStates[p.team],running:false});}
      }
      if(m.type==='commandError')err(sessions.get(m.playerId),m.reason);
      if(m.type==='ended'){r.status='ended';publishRoom(r);r.endTimer=setTimeout(()=>{r.worker?.terminate();r.worker=null;r.sentStart=false;r.status='waiting';r.members.forEach(p=>{p.ready=false;p.loaded=false;});publishRoom(r);},10000);}
    });
    r.worker.on('error',e=>{console.error('Match worker failed:',e.message);if(rooms.has(r.id))cancelLoad(r,'경기 서버를 다시 준비합니다. 대기실에서 다시 시작해 주세요.');});
    r.loadingTimer=setTimeout(()=>{if(r.status==='loading')cancelLoad(r,'불러오기를 완료하지 못한 참가자가 있어 시작을 취소했습니다.');},loadMs);
    publishRoom(r);return null;
  }
  function handle(s,m){
    if(!m||typeof m!=='object'||Array.isArray(m))return;
    if(m.type==='ping'){send(s,{type:'pong',at:m.at});return;}
    if(m.type==='list'){send(s,{type:'rooms',rooms:list()});return;}
    if(m.type==='leave'){leave(s);return;}
    if(m.type==='create'||m.type==='join') {
      if(s.roomId)return err(s,'먼저 현재 대기실에서 나가 주세요.');
      let r;if(m.type==='create'){
        if(rooms.size>=30)return err(s,'대기실이 가득 찼습니다. 잠시 후 다시 시도해 주세요.');
        r={id:randomBytes(4).toString('hex').toUpperCase(),name:clean(m.name,32)||'함께하는 팽롤',hostId:s.id,status:'waiting',members:[],banned:new Set(),sentStart:false};rooms.set(r.id,r);
      }else r=rooms.get(m.roomId);
      if(!r)return err(s,'대기실이 없어졌습니다. 목록을 확인해 주세요.');
      if(r.banned.has(s.id))return err(s,'강퇴된 대기실에는 다시 참여할 수 없습니다.');
      if(r.status!=='waiting'||r.members.length>=8)return err(s,'지금은 입장할 수 없는 대기실입니다.');
      s.name=clean(m.nickname,16)||s.name;const blue=r.members.filter(p=>p.team===0).length,red=r.members.length-blue;
      r.members.push({id:s.id,name:s.name,team:blue<=red?0:1,lane:'mid',champion:null,ready:false,connected:true});s.roomId=r.id;publishRoom(r);return;
    }
    const r=roomFor(s),p=playerFor(s);if(!r||!p)return err(s,'먼저 대기실에 참여해 주세요.');
    if(m.type==='loaded'&&m.matchId===r.matchId){p.loaded=true;if(r.status==='loading'&&r.members.every(p=>p.loaded&&p.connected)){clearTimeout(r.loadingTimer);r.status='playing';r.worker.postMessage({type:'run'});}publishRoom(r);return;}
    if(m.type==='sync'&&r.worker){r.worker.postMessage({type:'sync'});return;}
    if(m.type==='command'){if(r.status==='playing'&&p.loaded&&m.matchId===r.matchId&&m.command&&typeof m.command==='object')r.worker.postMessage({type:'command',playerId:s.id,command:m.command});return;}
    if(r.status!=='waiting')return err(s,'경기가 시작된 뒤에는 대기실 구성을 바꿀 수 없습니다.');
    if(m.type==='kick'){if(r.hostId!==s.id)return err(s,'방장만 강퇴할 수 있습니다.');if(m.playerId===s.id)return err(s,'자신은 강퇴할 수 없습니다.');const victim=sessions.get(m.playerId);if(victim?.roomId!==r.id)return; r.banned.add(victim.id);leave(victim,'kicked');return;}
    if(m.type==='start'){if(r.hostId!==s.id)return err(s,'방장만 시작할 수 있습니다.');if(!canStart(r))return err(s,'BLUE·RED 인원이 같고 모두 준비 완료해야 시작할 수 있습니다.');const reason=start(r);if(reason)err(s,reason);return;}
    if(m.type==='ready'){
      if(m.ready===false){p.ready=false;publishRoom(r);return;}
      if(!p.champion)return err(s,'캐릭터를 먼저 선택해 주세요.');
      if(r.members.some(o=>o.id!==s.id&&o.ready&&o.champion===p.champion))return err(s,'다른 참가자가 먼저 준비를 완료한 캐릭터입니다.');
      p.ready=true;for(const o of r.members)if(o.id!==s.id&&!o.ready&&o.champion===p.champion)o.champion=null;publishRoom(r);return;
    }
    if(p.ready)return err(s,'준비를 취소한 뒤 변경해 주세요.');
    if(m.type==='team'&&[0,1].includes(m.team)){if(r.members.filter(o=>o.team===m.team).length>=4&&p.team!==m.team)return err(s,'해당 팀은 4명으로 가득 찼습니다.');p.team=m.team;}
    if(m.type==='lane'&&lanes.includes(m.lane))p.lane=m.lane;
    if(m.type==='pick') {if(!Object.hasOwn(CHAMP_BY_ID,m.champion))return err(s,'선택할 수 없는 캐릭터입니다.');if(r.members.some(o=>o.id!==s.id&&o.ready&&o.champion===m.champion))return err(s,'준비 완료한 참가자가 선택한 캐릭터입니다.');p.champion=m.champion;}
    publishRoom(r);
  }
  const server=http.createServer((req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    if(req.url==='/health'||req.url==='/'){res.end(JSON.stringify({ok:!closing,service:'league-of-pang-online',protocol:1,rooms:rooms.size,matches:[...rooms.values()].filter(r=>r.status==='playing').length}));}
    else if(req.url==='/rooms')res.end(JSON.stringify({rooms:list()}));else{res.writeHead(404);res.end('{}');}
  });
  const wss=new WebSocketServer({server,path:'/ws',maxPayload:4096,perMessageDeflate:{threshold:1024,serverNoContextTakeover:true,clientNoContextTakeover:true,concurrencyLimit:4}});
  wss.on('connection',(ws)=>{
    if(closing||wss.clients.size>256){ws.close(1013,'Server busy');return;}
    let session=null,count=0,windowAt=Date.now();ws.alive=true;
    const helloTimer=setTimeout(()=>{if(!session)ws.close(1008,'Hello required');},10000);
    ws.on('pong',()=>ws.alive=true);
    ws.on('message',raw=>{
      if(Date.now()-windowAt>1000){count=0;windowAt=Date.now();}if(++count>90){ws.close(1008,'Rate limit');return;}
      let m;try{m=JSON.parse(raw);}catch{return ws.close(1008,'Invalid JSON');}
      if(!session){
        if(m?.type!=='hello')return;
        session=typeof m.token==='string'?[...sessions.values()].find(s=>s.token===m.token):null;
        if(!session){if(sessions.size>=1024){ws.close(1013,'Server busy');return;}session={id:id(),token:randomBytes(32).toString('hex'),name:clean(m.nickname,16)||`여행자${randomBytes(2).toString('hex')}`,roomId:null};sessions.set(session.id,session);}
        const s=session;clearTimeout(helloTimer);clearTimeout(s.expireTimer);if(s.ws&&s.ws!==ws)s.ws.close(4001,'Session replaced');s.ws=ws;
        send(s,{type:'welcome',id:s.id,token:s.token,name:s.name,protocol:1});
        const r=roomFor(s),p=playerFor(s);
        if(r&&p){p.connected=true;transfer(r);publishRoom(r);if(r.worker){send(s,{type:'match',matchId:r.matchId,picks:r.picks,seed:r.seed,running:r.status!=='loading'});r.worker.postMessage({type:'sync'});}}
        else send(s,{type:'rooms',rooms:list()});return;
      }
      try{handle(session,m);}catch(e){console.error('Protocol error:',e.message);err(session,'요청을 처리하지 못했습니다. 다시 시도해 주세요.');}
    });
    ws.on('error',()=>{});
    ws.on('close',()=>{clearTimeout(helloTimer);const s=session;if(!s||s.ws!==ws||closing)return;s.ws=null;const r=roomFor(s),p=playerFor(s);if(p){p.connected=false;if(r.status==='waiting')p.ready=false;r.worker?.postMessage({type:'stopPlayer',playerId:s.id});transfer(r);publishRoom(r);}s.expireTimer=setTimeout(()=>{leave(s);sessions.delete(s.id);},reconnectMs);});
  });
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},15000);
  return {server,rooms,sessions,close:async()=>{closing=true;clearInterval(heartbeat);for(const r of rooms.values())deleteRoom(r);for(const s of sessions.values()){clearTimeout(s.expireTimer);s.ws?.terminate();}await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const app=createOnlineServer();app.server.listen(Number(process.env.PORT)||8787,'0.0.0.0',()=>console.log('Online match server listening on',app.server.address().port));
  process.on('SIGTERM',()=>app.close().then(()=>process.exit(0)));process.on('SIGINT',()=>app.close().then(()=>process.exit(0)));
}
