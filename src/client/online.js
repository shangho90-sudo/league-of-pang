import {CHAMPIONS} from '../data/champions.js';
import {applySnapshot} from '../net/wire.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const laneNames={top:'상단',mid:'중앙',bot:'하단',jungle:'정글'};
export class OnlineClient extends EventTarget {
  constructor(){super();this.room=null;this.rooms=[];this.game=null;this.pending=[];this.attempt=0;this.closed=false;this.connected=false;this.matchId=null;this.running=false;this.lastSnapshot=0;}
  emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
  async connect(){
    try {
      const override=['localhost','127.0.0.1'].includes(location.hostname)?new URLSearchParams(location.search).get('server'):null;
      const config=override?{url:override}:await fetch('public/online.json',{cache:'no-store'}).then(r=>r.json());
      if(!config.url){this.emit('status','온라인 서버를 준비 중입니다. 잠시 후 다시 접속해 주세요.');return;}
      const address=new URL(config.url);
      if(address.protocol!=='https:'&&!(override&&address.protocol==='http:'))throw new Error('Invalid server address');
      this.url=address.origin;this.open();
    }catch{this.emit('status','서버 주소를 불러오지 못했습니다. 잠시 후 다시 접속해 주세요.');}
  }
  open(){
    if(this.closed)return;
    this.emit('status',this.attempt?'연결이 끊겨 다시 연결하는 중…':'온라인 서버에 연결하는 중… 첫 접속은 잠시 걸릴 수 있습니다.');
    const ws=new WebSocket(this.url.replace(/^http/,'ws')+'/ws');this.ws=ws;
    ws.onopen=()=>{let token,nickname;try{token=sessionStorage.getItem('pang-online-token');nickname=localStorage.getItem('pang-online-name');}catch{}ws.send(JSON.stringify({type:'hello',token,nickname}));};
    ws.onmessage=e=>{
      let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.type==='welcome'){
        if(this.id&&this.id!==m.id&&this.game){this.emit('lost','서버가 다시 시작되어 경기가 종료되었습니다. 대기실로 돌아가 주세요.');this.game=null;this.pending=[];this.matchId=null;}
        this.id=m.id;this.connected=true;this.attempt=0;this.name=m.name;try{sessionStorage.setItem('pang-online-token',m.token);}catch{}
        this.emit('status','실시간 연결됨');this.emit('change');
        clearInterval(this.pinger);this.pinger=setInterval(()=>this.send({type:'ping',at:Date.now()}),10000);
      }else if(m.type==='rooms'){this.rooms=m.rooms;if(!this.game)this.room=null;this.emit('change');}
      else if(m.type==='room'){this.room=m.room;this.running=m.room.status==='playing';this.emit('change');}
      else if(m.type==='pong'){this.latency=Date.now()-m.at;this.emit('latency',this.latency);}
      else if(m.type==='error'){this.emit('error',m.reason);this.game?.hud.showMsg(m.reason);}
      else if(m.type==='left'||m.type==='kicked'){this.room=null;this.matchId=null;this.running=false;this.pending=[];this.initialState=null;this.emit(m.type,m.reason);this.emit('change');}
      else if(m.type==='matchCancelled'){this.running=false;this.pending=[];this.initialState=null;this.matchId=null;this.emit('lost',m.reason);}
      else if(m.type==='match'){
        const same=this.matchId===m.matchId;this.matchId=m.matchId;this.running=m.running;
        if(m.state){this.initialState=m.state;this.pending=[m.state];}
        if(same&&this.game){this.send({type:'loaded',matchId:this.matchId});return;}
        if(!same){this.emit('match',m);}
      }else if(m.type==='snapshot'){
        if(this.matchId&&m.matchId!==this.matchId)return;
        this.lastSnapshot=performance.now();
        if(this.game){applySnapshot(this.game.sim,m.state,this.id);if(!document.hidden)this.game.processEvents();else this.game.sim.events.length=0;}
        else {if(m.state.full)this.pending=[];this.pending.push(m.state);if(m.state.full)this.initialState=m.state;}
      }
    };
    ws.onerror=()=>{};
    ws.onclose=e=>{
      this.connected=false;clearInterval(this.pinger);this.emit('change');
      if(e.code===4001){this.closed=true;this.emit('lost','다른 탭에서 같은 연결을 사용 중입니다. 이 화면을 새로 열어 주세요.');return;}
      if(!this.closed){this.emit('status','연결 복구 중… 캐릭터는 서버에서 정지하며, 60초 안에 재접속하면 복귀합니다.');this.reconnectTimer=setTimeout(()=>{this.attempt++;this.open();},Math.min(10000,800*2**this.attempt));}
    };
  }
  send(message){if(this.ws?.readyState===WebSocket.OPEN){this.ws.send(JSON.stringify(message));return true;}return false;}
  command(command){
    if(!this.connected||!this.running||performance.now()-this.lastSnapshot>5000)return {ok:false,reason:'경기 서버 연결을 기다리고 있습니다.'};
    if(command.action==='joy') {const now=performance.now();if((command.x||command.z)&&now-(this.lastJoy||0)<50)return {ok:true};this.lastJoy=now;}
    this.send({type:'command',matchId:this.matchId,command});return {ok:true};
  }
  attach(game){
    this.game=game;const s=game.sim;
    const commands={cmdMove:(_,x,z)=>({action:'move',x,z}),cmdAttackMove:(_,x,z)=>({action:'attackMove',x,z}),cmdJoy:(_,x,z)=>({action:'joy',x,z}),cmdAttack:(_,t)=>({action:'attack',target:t?.id}),cmdStop:()=>({action:'stop'}),cmdRecall:()=>({action:'recall'}),cmdCast:(_,slot,o={})=>({action:'cast',slot,point:o.point,target:o.target?.id}),cmdBuy:(_,item)=>({action:'buy',item}),cmdSell:(_,slot)=>({action:'sell',slot}),cmdUsePotion:()=>({action:'potion'}),cmdLevel:(_,slot)=>({action:'level',slot})};
    for(const [name,toCommand]of Object.entries(commands))s[name]=(...args)=>{const r=this.command(toCommand(...args));return name==='cmdLevel'?r.ok:r;};
    for(const data of this.pending)applySnapshot(s,data,this.id);this.pending=[];s.events.length=0;
    this.send({type:'loaded',matchId:this.matchId});
  }
  close(){this.closed=true;clearTimeout(this.reconnectTimer);clearInterval(this.pinger);this.ws?.close();}
}
export class OnlineScreen {
  constructor(root,portraits,network,onBack){
    this.root=root;this.portraits=portraits;this.net=network;this.onBack=onBack;this.notice='';
    this.nickname=network.name||'';try{this.nickname=localStorage.getItem('pang-online-name')||this.nickname;}catch{}
    network.addEventListener('change',()=>this.render());network.addEventListener('status',e=>{this.status=e.detail;this.render();});
    network.addEventListener('error',e=>{this.notice=e.detail;this.render();});network.addEventListener('kicked',e=>{this.notice=e.detail;this.render();});
    this.render();
  }
  send(m){this.notice='';if(!this.net.send(m)){this.notice='아직 서버에 연결 중입니다.';this.render();}}
  render(){
    const n=this.net,r=n.room,p=r?.members.find(p=>p.id===n.id),host=r?.hostId===n.id;
    const status=r?.status==='loading'?'참가자들이 전장을 불러오는 중…':r?.status==='playing'?'경기 진행 중':r?.status==='ended'?'경기 종료 · 다음 대기실 준비 중':this.status||'서버에 연결하는 중…';
    // Preserve text while live room-list updates arrive.
    this.nickname=this.root.querySelector('[name=nickname]')?.value??this.nickname;
    this.roomName=this.root.querySelector('[name=roomName]')?.value??this.roomName??'';
    const focused=document.activeElement?.name,selection=document.activeElement?.selectionStart;
    this.root.className='online-screen'+(this.root.classList.contains('hidden')?' hidden':'');
    this.root.innerHTML=`<div class="online-shell"><header class="online-head"><div><div class="online-eyebrow">LEAGUE OF PANG · ONLINE</div><h1>${r?esc(r.name):'온라인 대전'}</h1><p class="online-status"><i class="${n.connected?'on':''}"></i>${esc(status)}</p></div><button class="btn" data-act="back">${r?'대기실 나가기':'처음으로'}</button></header>
      ${this.notice?`<div class="online-notice" role="alert">${esc(this.notice)}</div>`:''}
      ${r?this.roomHTML(r,p,host):this.listHTML()}
      <footer class="online-foot">로그인 없이 참여 · 1대1 ~ 4대4 · 서버가 경기 진행 · 준비 완료한 캐릭터는 중복 선택 불가</footer></div>`;
    this.root.querySelector('[data-act=back]').onclick=()=>{if(r)this.send({type:'leave'});else{n.close();this.onBack();}};
    this.root.querySelector('[data-act=create]')?.addEventListener('click',()=>{this.saveName();this.send({type:'create',nickname:this.nickname,name:this.root.querySelector('[name=roomName]').value});});
    this.root.querySelectorAll('[data-join]').forEach(b=>b.onclick=()=>{this.saveName();this.send({type:'join',roomId:b.dataset.join,nickname:this.nickname});});
    this.root.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>this.send({type:'team',team:+b.dataset.team}));
    this.root.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>this.send({type:'pick',champion:b.dataset.pick}));
    this.root.querySelectorAll('[data-kick]').forEach(b=>b.onclick=()=>this.send({type:'kick',playerId:b.dataset.kick}));
    this.root.querySelector('[name=lane]')?.addEventListener('change',e=>this.send({type:'lane',lane:e.target.value}));
    this.root.querySelector('[data-act=ready]')?.addEventListener('click',()=>this.send({type:'ready',ready:!p.ready}));
    this.root.querySelector('[data-act=start]')?.addEventListener('click',()=>this.send({type:'start'}));
    if(focused){const field=this.root.querySelector(`[name="${focused}"]`);field?.focus();if(typeof selection==='number')field?.setSelectionRange?.(selection,selection);}
  }
  saveName(){this.nickname=this.root.querySelector('[name=nickname]')?.value.trim()||this.net.name;try{localStorage.setItem('pang-online-name',this.nickname);}catch{}}
  listHTML(){return `<div class="online-browser"><section class="online-create"><h2>바로 참여하기</h2><label>내 닉네임<input name="nickname" maxlength="16" value="${esc(this.nickname)}" placeholder="닉네임 (선택)"></label><label>새 대기실 이름<input name="roomName" maxlength="32" value="${esc(this.roomName)}" placeholder="함께하는 팽롤"></label><button class="btn gold" data-act="create" ${!this.net.connected?'disabled':''}>＋ 대기실 만들기</button><p>목록은 실시간으로 갱신됩니다.<br>입장한 뒤 팀과 캐릭터를 선택해 주세요.</p></section><section class="online-rooms"><h2>대기실 목록 <span>${this.net.rooms.length}</span><small>LIVE</small></h2><div class="online-room-list">${this.net.rooms.length?this.net.rooms.map(r=>`<article class="online-room-card"><div><h3>${esc(r.name)}</h3><p><b class="host-star">★</b> ${esc(r.hostName)} · BLUE ${r.blue} : ${r.red} RED</p></div><div><span>${r.count} / 8명 · ${{waiting:'대기 중',loading:'시작 준비',playing:'경기 중',ended:'경기 종료'}[r.status]}</span><button class="btn" data-join="${r.id}" ${r.status!=='waiting'||r.count>=8||!this.net.connected?'disabled':''}>참여</button></div></article>`).join(''):`<div class="online-empty"><span>◇</span><h3>새로운 대전을 기다리고 있어요</h3><p>첫 대기실을 만들고 친구와 함께 참여해 보세요.</p></div>`}</div></section></div>`;}
  roomHTML(r,p,host){
    if(!p)return '';
    const editable=r.status==='waiting'&&this.net.connected;
    const teams=[0,1].map(t=>`<section class="online-team team-${t}"><h2>${t===0?'BLUE':'RED'} <span>${r.members.filter(m=>m.team===t).length}/4</span><button class="btn" data-team="${t}" ${!editable||p.ready||p.team===t?'disabled':''}>${p.team===t?'내 팀':'팀 이동'}</button></h2>${Array.from({length:4},(_,i)=>{
      const m=r.members.filter(m=>m.team===t)[i],ch=m&&CHAMPIONS.find(c=>c.id===m.champion);
      return m?`<div class="online-player ${m.id===p.id?'me':''}"><div class="online-avatar">${ch?`<img src="${this.portraits[ch.id]}" alt="">`:'?'}</div><div class="online-player-info"><strong>${r.hostId===m.id?'<b class="host-star" title="방장">★</b> ':''}${esc(m.name)}${m.id===p.id?' <small>나</small>':''}</strong><span>${ch?ch.name:'캐릭터 선택 중'} · ${laneNames[m.lane]}</span></div><span class="ready-tag ${m.ready?'ready':''}">${!m.connected?'재접속 중':m.ready?'준비 완료':'준비 중'}</span>${host&&m.id!==p.id&&editable?`<button class="kick-btn" data-kick="${m.id}" aria-label="${esc(m.name)} 강퇴">강퇴</button>`:''}</div>`:'<div class="online-player empty">참가자를 기다리는 중</div>';
    }).join('')}</section>`).join('');
    return `<div class="online-teams">${teams}</div><section class="online-draft"><div class="online-draft-head"><h2>캐릭터 선택</h2><label>내 위치 <select name="lane" ${!editable||p.ready?'disabled':''}>${Object.entries(laneNames).map(([k,v])=>`<option value="${k}" ${p.lane===k?'selected':''}>${v}</option>`).join('')}</select></label><p>선택 후 준비 완료를 누르면 확정됩니다.</p></div><div class="online-champions">${CHAMPIONS.map(c=>{
      const owner=r.members.find(m=>m.id!==p.id&&m.ready&&m.champion===c.id);const disabled=!!owner||p.ready||!editable;
      return `<button class="online-champion ${owner?'locked':''} ${p.champion===c.id?'selected':''}" data-pick="${c.id}" ${disabled?'disabled':''} title="${owner?esc(owner.name)+' 님이 선택 완료':c.name}"><img src="${this.portraits[c.id]}" alt=""><strong>${c.name}</strong><span>${owner?'선택 완료':p.champion===c.id?(p.ready?'확정':'내 선택'):c.title}</span>${owner?'<b class="lock-mark">잠김</b>':''}</button>`;
    }).join('')}</div></section><div class="online-actions"><div><strong>${r.canStart?'모두 준비되었습니다!':r.members.filter(m=>m.team===0).length!==r.members.filter(m=>m.team===1).length?'BLUE·RED 인원을 같게 맞춰 주세요.':'모든 참가자의 준비 완료를 기다립니다.'}</strong><span>대기실 코드 ${r.id} · 방장만 게임을 시작할 수 있습니다.</span></div><button class="btn ${p.ready?'':'gold'}" data-act="ready" ${!editable||!p.champion?'disabled':''}>${p.ready?'준비 취소':'준비 완료'}</button>${host?`<button class="btn online-start" data-act="start" ${!r.canStart||!editable?'disabled':''}>게임 시작</button>`:''}</div>`;
  }
}
