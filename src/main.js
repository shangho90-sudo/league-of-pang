// 진입점: 타이틀 → 캐릭터 선택 → 로딩 → 경기 → 결과
import * as THREE from 'three';
import { CHAMPIONS } from './data/champions.js';
import { buildGrid } from './map/grid.js';
import { loadModelTemplates } from './render/champVisual.js';
import { loadMapAssets } from './render/mapAssets.js';
import { loadHeroAssets } from './render/heroAssets.js';
import { createRenderer, QUALITY } from './render/scene.js';
import { renderPortraits } from './client/icons.js';
import { SelectScreen, autoPicks } from './client/select.js';
import { Game } from './client/game.js';
import { audio } from './client/audio.js';
import { OnlineClient, OnlineScreen } from './client/online.js';
import '../dev/stage.js'; // 검증용 스테이징 헬퍼 (게임 플레이에는 영향 없음)

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const isTouchDevice = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const DEFAULTS = {
  quality: isTouchDevice ? 'medium' : 'high', shake: 0.6, flash: 0.8, uiScale: 1, castMode: 'quick', edgePan: true, autoLevel: true, camLock: true,
  touch: 'auto', mirror: false, joySize: 1, joyPos: 1, joySens: 1, btnSize: 1, btnAlpha: 0.85, targetPri: 'champ', autoAim: true,
  volMaster: 0.7, volSfx: 0.8, volMusic: 0.35,
};
let settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('lopjh_settings') || '{}')); } catch (e) {}
if (params.get('q')) settings.quality = params.get('q');
const mobile = params.get('mobile') === '1' || (params.get('mobile') !== '0' && (settings.touch === true || (settings.touch === 'auto' && isTouchDevice)));
audio.vol = { master: settings.volMaster, sfx: settings.volSfx, music: settings.volMusic };
const unlockAudio = () => { audio.init(); audio.resume(); };
document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('keydown', unlockAudio, { capture: true });
document.addEventListener('visibilitychange', () => document.hidden ? audio.suspend() : audio.resume());

const EMBLEM = `<svg class="emblem" viewBox="0 0 120 120"><defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c8"/><stop offset=".55" stop-color="#d8a850"/><stop offset="1" stop-color="#7a5420"/></linearGradient><linearGradient id="ec" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bff8f0"/><stop offset="1" stop-color="#2fb8a8"/></linearGradient></defs>
  <path d="M60 6 L104 22 L98 72 Q90 100 60 114 Q30 100 22 72 L16 22 Z" fill="#14202a" stroke="url(#eg)" stroke-width="5"/>
  <path d="M60 22 L74 52 L60 96 L46 52 Z" fill="url(#ec)" stroke="#e8fff8" stroke-width="1.5"/>
  <path d="M60 22 L60 96" stroke="#ffffff" stroke-opacity=".5" stroke-width="1"/>
  <path d="M30 40 Q22 64 38 88 M90 40 Q98 64 82 88" fill="none" stroke="url(#eg)" stroke-width="4" stroke-linecap="round"/>
  <circle cx="60" cy="52" r="5" fill="#fff8e0"/></svg>`;

let renderer = null, portraits = null, game = null, rafId = 0;
let online = null;

// 키 아트(사용자 제공 이미지) 위 버튼 위치: 이미지 원본 좌표(1672×941)
const KEYART = { src: 'public/art/keyart.jpg', w: 1672, h: 941, start: [575, 690, 1090, 800], exit: [672, 815, 992, 882] };
// cover 배치 계산 (세로가 잘릴 때는 아래쪽 버튼이 보이도록 posY 비율 적용)
function coverMap(W, H, posY) {
  const s = Math.max(W / KEYART.w, H / KEYART.h);
  const ox = (W - KEYART.w * s) / 2, oy = (H - KEYART.h * s) * posY;
  return { s, ox, oy, rect: ([x0, y0, x1, y1]) => ({ left: ox + x0 * s, top: oy + y0 * s, width: (x1 - x0) * s, height: (y1 - y0) * s }) };
}
function showTitle() {
  audio.startMusic('title');
  const t = $('#title');
  t.classList.remove('hidden');
  t.classList.add('keyart-title');
  t.innerHTML = `<img class="keyart" src="${KEYART.src}" alt="리그 오브 팽재현">
    <button class="hot hot-start" id="t-start" aria-label="START" disabled><span class="ld">불러오는 중…</span></button>
    <button class="hot hot-exit" id="t-exit" aria-label="EXIT"></button>
    <button class="title-online" id="t-online" disabled><span>ONLINE BATTLE</span><strong>온라인 대전</strong><small>로그인 없이 · 1대1 ~ 4대4</small></button>
    <div class="title-foot"><button class="tbtn" id="t-help">조작 방법</button><button class="tbtn" id="t-music">♪ 음악 켜기</button><span>START: 4대4 AI 대전 · 온라인 대전: 실시간 서버 경기 · ${mobile ? '터치 조작 (가로 화면)' : 'PC 키보드·마우스'}</span></div>`;
  const img = t.querySelector('.keyart');
  const place = () => {
    const posY = 0.75;
    img.style.objectPosition = `50% ${posY * 100}%`;
    const m = coverMap(innerWidth, innerHeight, posY);
    for (const [id, box] of [['t-start', KEYART.start], ['t-exit', KEYART.exit]]) Object.assign($('#' + id).style, Object.fromEntries(Object.entries(m.rect(box)).map(([k, v]) => [k, v + 'px'])));
  };
  place();
  window.addEventListener('resize', place);
  t._place = place;
  $('#t-help').onclick = () => showHelp();
  $('#t-music').onclick = () => { unlockAudio(); audio.startMusic('title'); $('#t-music').textContent = '♪ 수정의 서약'; };
  $('#t-start').onclick = () => { audio.init(); audio.play('click'); window.removeEventListener('resize', place); t.classList.add('hidden'); showSelect(); };
  $('#t-online').onclick = () => { window.removeEventListener('resize',place); t.classList.add('hidden'); showOnline(); };
  $('#t-exit').onclick = () => { audio.init(); audio.play('click'); showExit(); };
}
function showExit() {
  const t = $('#title');
  if (t.querySelector('.exitbox')) return;
  const box = document.createElement('div');
  box.className = 'panel gilt modal exitbox';
  box.style.position = 'fixed'; box.style.zIndex = 70; box.style.width = 'min(360px, 90vw)'; box.style.textAlign = 'center';
  box.innerHTML = `<h3 style="justify-content:center">게임을 종료할까요?</h3><p class="msg" style="color:#c8d4e2;font-size:14px;margin:6px 0 14px">웹 게임은 브라우저 탭을 닫으면 종료됩니다.</p>
    <div style="display:flex;gap:10px;justify-content:center"><button class="btn" data-a="no">취소</button><button class="btn gold" data-a="yes">종료</button></div>`;
  t.appendChild(box);
  box.querySelector('[data-a=no]').onclick = () => box.remove();
  box.querySelector('[data-a=yes]').onclick = () => {
    audio.stopMusic();
    window.close(); // 스크립트로 연 창이 아니면 브라우저가 막음 → 안내로 대체
    setTimeout(() => { box.querySelector('.msg').textContent = '브라우저가 자동 종료를 막았습니다. 이 탭을 직접 닫아 주세요.'; box.querySelector('[data-a=yes]').remove(); box.querySelector('[data-a=no]').textContent = '돌아가기'; }, 250);
  };
}
function drawTitleArt(cv) {
  cv.width = innerWidth; cv.height = innerHeight;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, cv.height);
  g.addColorStop(0, '#0e1c22'); g.addColorStop(1, '#173028');
  ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
  // 붓 터치 숲 실루엣
  for (let layer = 0; layer < 3; layer++) {
    ctx.fillStyle = ['#12261e', '#183226', '#1e3c2c'][layer];
    for (let i = 0; i < 40; i++) {
      const x = (i / 40) * cv.width + Math.sin(i * 7.3 + layer) * 30, h = cv.height * (0.25 + layer * 0.1) + Math.sin(i * 3.1) * 40;
      ctx.beginPath(); ctx.ellipse(x, cv.height - h * 0.4, 60 + layer * 10, h * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  const rg = ctx.createRadialGradient(cv.width / 2, cv.height * 0.38, 0, cv.width / 2, cv.height * 0.38, cv.height * 0.6);
  rg.addColorStop(0, 'rgba(232,192,112,0.22)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, cv.width, cv.height);
}
function showHelp() {
  const t = $('#title');
  const box = document.createElement('div');
  box.className = 'panel gilt modal';
  box.style.position = 'fixed'; box.style.zIndex = 70; box.style.width = 'min(640px, 94vw)';
  box.innerHTML = `<h3>조작 방법 <button class="x">✕</button></h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:13px;line-height:1.7">
    <div><b style="color:#d8b46a">PC</b><br>우클릭: 이동 / 적 기본 공격<br>A + 좌클릭: 공격 이동 · S: 정지 · B: 귀환<br>Q W E R: 스킬 (설정에서 즉시/범위 확인 후 시전)<br>Ctrl + Q/W/E/R: 스킬 레벨업 (자동 레벨업 끔일 때)<br>스페이스: 내 캐릭터로 카메라 · Y: 카메라 고정 전환<br>마우스 휠: 확대·축소 · 화면 가장자리: 카메라 이동<br>Tab: 전적 · P: 상점 · 1~6: 아이템 · Esc: 설정</div>
    <div><b style="color:#d8b46a">터치 (가로 화면)</b><br>왼쪽 아래 조이스틱: 이동<br>공격 버튼 누르고 있기: 사거리 내 반복 공격<br>영웅/미니언/건물 버튼: 대상 종류 지정 공격<br>스킬 버튼 드래그: 조준 → 손 떼면 시전<br>취소 영역으로 드래그: 시전 취소<br>아군 스킬: 초상화로 대상 선택, 빠른 터치 = 자신<br>적 터치 또는 적 초상화: 대상 고정<br>빈 화면 드래그·미니맵: 주변 확인 · 카메라 버튼: 복귀</div></div>`;
  t.appendChild(box);
  box.querySelector('.x').onclick = () => box.remove();
}

function showSelect() {
  const s = $('#select');
  s.classList.remove('hidden');
  audio.startMusic('select');
  new SelectScreen(s, portraits, (picks) => { s.classList.add('hidden'); s.innerHTML = ''; startGame(picks); });
}

function showOnline() {
  audio.init();audio.startMusic('select');
  let root=$('#online');if(!root){root=document.createElement('div');root.id='online';document.body.appendChild(root);}
  root.classList.remove('hidden');online=new OnlineClient();window.ONLINE=online;
  new OnlineScreen(root,portraits,online,()=>{root.classList.add('hidden');showTitle();$('#t-start').disabled=false;$('#t-start').innerHTML='';$('#t-online').disabled=false;});
  const leaveGame=()=>{if(game?.online){cancelAnimationFrame(rafId);game.destroy();game=null;$('#hud').innerHTML='';}$('#result').classList.add('hidden');$('#loading').classList.add('hidden');root.classList.remove('hidden');audio.startMusic('select');};
  online.addEventListener('left',leaveGame);
  online.addEventListener('lost',e=>{leaveGame();online.send({type:'leave'});const note=document.createElement('div');note.className='online-notice';note.textContent=e.detail;root.prepend(note);});
  online.addEventListener('match',async e=>{
    if(game?.online&&online.matchId===game.onlineMatchId)return;
    try{
      root.classList.add('hidden');
      await startGame(e.detail.picks.map(p=>({...p,isPlayer:p.playerId===online.id})),online);
      if(game)game.onlineMatchId=e.detail.matchId;
    }catch(error){console.error(error);leaveGame();online.send({type:'leave'});root.classList.remove('hidden');}
  });
  online.connect();
}

async function startGame(picks, net = null) {
  const L = $('#loading');
  L.classList.remove('hidden');
  const col = (team) => picks.filter((p) => p.team === team).map((p) => `<div><img src="${portraits[p.id]}"><div class="cap">${CHAMPIONS.find((c) => c.id === p.id).name}${p.isPlayer ? ' (나)' : ''}</div></div>`).join('');
  L.classList.add('keyart-loading');
  L.innerHTML = `<img class="keyart" src="public/art/keyart_load.jpg" alt=""><div class="load-band"><div class="teams"><div class="col">${col(0)}</div><div class="vs">VS</div><div class="col red">${col(1)}</div></div><div class="bar"><div></div></div><div class="tip">전장을 준비하는 중… (${net?'온라인 대전':'AI 대전'})</div></div>`;
  const bar = L.querySelector('.bar div');
  await new Promise((r) => setTimeout(r, 30));
  if (params.get('holdload')) { bar.style.width = '42%'; await new Promise((r) => (window.CONTINUE = r)); } // 검증용: 로딩 화면 유지
  const q = QUALITY[settings.quality] || QUALITY.medium;
  if (!renderer) renderer = createRenderer($('#game'), q);
  renderer.setSize(innerWidth, innerHeight, false);
  bar.style.width = '15%';
  await loadMapAssets(k => { bar.style.width = Math.round(15 + k * 40) + '%'; });
  await new Promise((r) => setTimeout(r, 20));
  if(net&&!net.matchId){L.classList.add('hidden');return;}
  if(net){const deadline=performance.now()+10000;while(!net.initialState&&net.matchId&&performance.now()<deadline)await new Promise(r=>setTimeout(r,50));if(!net.initialState)throw new Error('경기 서버의 초기 상태를 받지 못했습니다. 다시 참여해 주세요.');}
  game = new Game({ renderer, picks, settings, portraits, mobile, seed: params.get('seed') ? +params.get('seed') : undefined, onProgress: (k) => (bar.style.width = Math.round(55 + k * 40) + '%'), onEnd: showResult, online:net });
  if(net){const badge=document.createElement('div');badge.id='online-game-status';$('#hud').appendChild(badge);}
  if (!net && params.get('autopilot')) game.enableAutopilot();
  if (!net && params.get('ff')) game.fastForward(+params.get('ff'));
  bar.style.width = '100%';
  // 셰이더 예열 1프레임
  game.frame();
  await new Promise((r) => setTimeout(r, 50));
  L.classList.add('hidden');
  if (params.get('debug')) { const d = document.createElement('div'); d.id = 'fps'; d.style.cssText = 'position:fixed;left:6px;bottom:4px;z-index:90;font:12px monospace;color:#9f9;background:#0008;padding:2px 6px'; document.body.appendChild(d); }
  if (params.get('manual')) {
    // 검증 모드: 실제 게임 루프를 외부에서 프레임 단위로 진행
    window.STEP = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) { game.last = performance.now() - dt * 1000; game.frame(); } return game.sim.time; };
  } else {
    const loop = () => { rafId = requestAnimationFrame(loop); game.frame(); };
    loop();
  }
  window.READY = true;
}

function showResult({ win, sim, player, surrendered }) {
  if(game?.online && game.sim!==sim)return;
  const R = $('#result');
  R.classList.remove('hidden');
  const t = sim.endTime ?? sim.time;
  const rows = sim.champions.map((c) => `<tr style="${c === player ? 'background:rgba(232,192,112,0.1)' : ''}"><td style="border-left:3px solid ${c.team === player.team ? 'var(--ally)' : 'var(--enemy)'}"><img src="${portraits[c.def.id]}" style="width:28px;height:28px;border-radius:4px;vertical-align:middle"> ${c.name}${c.isPlayer ? ' (나)' : ''}</td><td>${c.level}</td><td>${c.k}/${c.d}/${c.a}</td><td>${c.cs}</td><td>${Math.round(c.dmgDealt)}</td><td>${Math.round(c.healDone)}</td></tr>`).join('');
  R.innerHTML = `<div class="big ${win ? 'win' : 'lose'}">${win ? '승리' : '패배'}</div>
    <div class="meta">경기 시간 ${Math.floor(t / 60)}분 ${Math.floor(t % 60)}초 · 청람 ${sim.teamKills[0]} : ${sim.teamKills[1]} 적염 ${surrendered ? '· 항복' : ''} · ${game?.online?'온라인 대전':'AI 대전'}</div>
    <table><tr><th>영웅</th><th>레벨</th><th>K/D/A</th><th>CS</th><th>가한 피해</th><th>아군 회복</th></tr>${rows}</table>
    <div class="acts"><button class="btn gold" id="r-again">같은 구성으로 다시</button><button class="btn" id="r-select">캐릭터 선택</button></div>`;
  window.RESULT = { win, minutes: +(t / 60).toFixed(2), kills: sim.teamKills.slice() };
  if(game?.online){R.querySelector('.acts').innerHTML='<button class="btn gold" id="r-online">대기실 목록으로</button>';$('#r-online').onclick=()=>online.send({type:'leave'});return;}
  const picks = game.picks;
  $('#r-again').onclick = () => { location.search = '?picks=' + encodeURIComponent(JSON.stringify(picks)) + (params.get('mobile') ? '&mobile=' + params.get('mobile') : ''); };
  $('#r-select').onclick = () => { location.search = '?select=1' + (params.get('mobile') ? '&mobile=' + params.get('mobile') : ''); };
}

async function boot() {
  buildGrid();
  if (!params.get('autostart') && !params.get('picks') && !params.get('select')) showTitle();
  const ids = [...new Set(CHAMPIONS.map((c) => c.model))];
  let bodyProgress=0,gearProgress=0;
  const progress=()=>{const b=$('#t-start .ld');if(b)b.textContent=`불러오는 중… ${Math.round((bodyProgress+gearProgress)*50)}%`;};
  await Promise.all([loadModelTemplates(ids,k=>{bodyProgress=k;progress();}),loadHeroAssets('',k=>{gearProgress=k;progress();})]);
  portraits = renderPortraits(CHAMPIONS);
  const b = $('#t-start');
  if (b) { b.disabled = false; b.innerHTML = ''; b.title = 'AI 대전 시작 (플레이어 1 + AI 7)'; }
  if($('#t-online'))$('#t-online').disabled=false;
  if (params.get('autostart')) {
    const id = params.get('autostart'), lane = params.get('lane') || 'mid';
    startGame(autoPicks(id, lane, Math.random));
  } else if (params.get('picks')) {
    try { startGame(JSON.parse(params.get('picks'))); } catch (e) { showSelect(); }
  } else if (params.get('select')) showSelect();
  else if(params.get('online')){$('#title').classList.add('hidden');showOnline();}
  window.BOOTED = true;
}
boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:auto 0 0 0;background:#400;color:#fff;padding:8px;z-index:999">오류: ${e.message}</div>`); });
