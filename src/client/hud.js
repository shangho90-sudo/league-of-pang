// HUD — PC/모바일 별도 배치. 게임 로직은 공유하고 표시·조작 배치만 다르다.
import { ITEMS, ITEM_BY_ID, itemIconSrc } from '../data/items.js';
import { ROLES, XP_TABLE, MAX_LEVEL } from '../data/champions.js';
import { MAP_HALF, LANES, JUNGLE, PITS, BASES, TEAM_COLORS } from '../map/layout.js';
import { N, walk, sd, rd, brush } from '../map/grid.js';
import { skillIcon } from './icons.js';
import { audio } from './audio.js';


// ---- 상점 장식·아이콘 (SVG) ----
const COIN = '<svg class="coin" viewBox="0 0 24 18"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b0"/><stop offset=".5" stop-color="#e2a93a"/><stop offset="1" stop-color="#8a5a14"/></linearGradient></defs><ellipse cx="12" cy="12" rx="10" ry="5" fill="#7a4e10"/><ellipse cx="12" cy="9" rx="10" ry="5" fill="url(#cg)" stroke="#6a420c" stroke-width=".8"/><ellipse cx="12" cy="9" rx="6" ry="2.6" fill="none" stroke="#fff3c0" stroke-opacity=".6" stroke-width=".8"/></svg>';
const FLEUR = '<svg viewBox="0 0 64 64"><defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".5" stop-color="#d9a441"/><stop offset="1" stop-color="#7a5216"/></linearGradient></defs><path fill="url(#fg)" stroke="#4a3008" stroke-width="1.2" d="M32 4c4 10 9 16 9 26 0 6-4 10-9 14-5-4-9-8-9-14 0-10 5-16 9-26zM6 22c10 2 16 8 18 18-2 4-5 8-5 14-6-8-13-14-13-32zm52 0c0 18-7 24-13 32 0-6-3-10-5-14 2-10 8-16 18-18zM24 50h16l-3 10h-10z"/></svg>';
const CLOSE_X = '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';
const GEM_ORN = '<svg viewBox="0 0 120 34"><defs><linearGradient id="og" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d98e"/><stop offset="1" stop-color="#8a6424"/></linearGradient><linearGradient id="bg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e4fbff"/><stop offset=".5" stop-color="#4ec3e8"/><stop offset="1" stop-color="#0a4a7a"/></linearGradient></defs><path fill="url(#og)" d="M0 2h44q10 0 16 14 6-14 16-14h44q-30 4-44 26-8 6-16 6t-16-6Q30 6 0 2z"/><path fill="url(#bg2)" stroke="#123" stroke-width="1" d="M60 6l9 10-9 12-9-12z"/></svg>';
const DIAMOND_ORN = '<svg viewBox="0 0 60 16"><path fill="#c9a253" d="M0 8h22l8-7 8 7h22l-22 1-8 7-8-7z"/></svg>';
const SI = {
  heart: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>',
  swords: '<path d="M4 3l9 9-2 2-9-9V3zm16 0h0v2l-9 9-2-2 9-9zM3 19l4-4 2 2-4 4zm18 0l-2 2-4-4 2-2z"/>',
  book: '<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1zM12 6v14" fill-opacity=".9"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
  mshield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><circle cx="12" cy="11" r="3" fill="#0b1522"/>',
  wing: '<path d="M2 18c6-1 10-4 13-9l2 1c-1 2-1 3 0 4 2-1 3-4 5-9-1 7-4 12-10 14-4 1-7 0-10-1z"/>',
  swoosh: '<path d="M3 17c5-1 9-4 12-10l2 2c-3 6-8 10-14 10zm6 3c5-1 9-4 12-10l1 3c-3 5-7 8-13 8z"/>',
  drop: '<path d="M12 2c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13z"/>',
  bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  swirl: '<path d="M12 3a9 9 0 1 0 9 9h-3a6 6 0 1 1-6-6 3 3 0 1 1-3 3H6a6 6 0 1 0 6-6z"/>',
  flask: '<path d="M9 2h6v2h-1v5l6 10a2 2 0 0 1-2 3H6a2 2 0 0 1-2-3l6-10V4H9z"/>',
  lotus: '<path d="M12 4c2 3 3 6 0 10-3-4-2-7 0-10zM3 9c4 0 7 2 8 6-4 1-7-1-8-6zm18 0c-1 5-4 7-8 6 1-4 4-6 8-6zM3 17c6 2 12 2 18 0-2 3-6 4-9 4s-7-1-9-4z"/>',
};
function statIcon(it) {
  const st = it.stats || {};
  const key = it.consumable ? 'heart' : it.id === 'essence' ? 'flask' : it.id === 'staff' || it.id === 'voidstaff' ? 'swirl' : it.id === 'orb' ? 'lotus' : it.id === 'stormbow' ? 'bolt'
    : st.lifesteal && !st.as ? 'drop' : st.ap ? 'book' : st.ad ? 'swords' : st.as ? 'swoosh' : st.ms ? 'wing' : st.mr ? 'mshield' : st.armor || st.dr ? 'shield' : st.mp ? 'drop' : 'heart';
  return `<svg viewBox="0 0 24 24" fill="#c9d2dc">${SI[key]}</svg>`;
}

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const SLOTS = ['Q', 'W', 'E', 'R'];

export class HUD {
  constructor(game) {
    this.g = game; this.sim = game.sim; this.p = game.player; this.mobile = game.mobile;
    this.root = $('#hud');
    this.root.innerHTML = '';
    this.root.className = this.mobile ? 'mobile' : 'pc';
    this.portraits = game.portraits;
    this.cache = {};
    this.msgT = 0; this.annT = 0;
    this.build();
    this.mmBg = this.renderMinimapBase(256);
  }
  build() {
    const r = this.root, p = this.p;
    r.appendChild(el('div', 'panel', `<span class="k0">0</span><div style="text-align:center"><div class="clock">0:00</div><div class="tw">포탑 <b class="tw0">7</b> : <b class="tw1">7</b></div><div class="buff"></div></div><span class="k1">0</span>`)).id = 'topbar';
    r.appendChild(el('div', 'panel', '')).id = 'mystats';
    r.appendChild(el('div')).id = 'killfeed';
    r.appendChild(el('div')).id = 'announce';
    r.appendChild(el('div')).id = 'msg';
    const dv = el('div', 'hidden'); dv.id = 'deathveil'; r.appendChild(dv);
    const tip = el('div', 'panel hidden'); tip.id = 'tooltip'; r.appendChild(tip);
    if (!this.mobile) this.buildPC(); else this.buildMobile();
    // 모달
    r.appendChild(el('div', 'panel gilt modal hidden', '')).id = 'shop';
    r.appendChild(el('div', 'panel gilt modal hidden', '')).id = 'score';
    r.appendChild(el('div', 'panel gilt modal hidden', '')).id = 'menu';
  }
  skillSlotHTML(slot, key) {
    const sk = this.p.def.skills[slot];
    return `<div class="skill" data-slot="${slot}"><img src="${skillIcon(this.p.def, slot)}"><div class="pips">${Array.from({ length: slot === 'R' ? 3 : 5 }, () => '<i></i>').join('')}</div><div class="cd"></div><div class="cdt"></div>${key ? `<span class="key">${key}</span>` : ''}<span class="cost">${sk.cost}</span></div>`;
  }
  buildPC() {
    const p = this.p;
    const bot = el('div'); bot.id = 'pc-bottom';
    const items = el('div', 'panel interactive'); items.id = 'items-panel';
    for (let i = 0; i < 6; i++) items.appendChild(el('div', 'it', `<span class="n">${i + 1}</span>`));
    items.appendChild(el('div', 'gold', `<span class="g">500</span><button class="btn" data-act="shop">상점 (P)</button>`));
    bot.appendChild(items);
    const cp = el('div', 'panel gilt interactive'); cp.id = 'champ-panel';
    cp.innerHTML = `<div style="position:relative"><div class="xp"><div></div></div><div class="portrait"><img src="${this.portraits[p.def.id]}"></div><div class="lvl">1</div></div>
      <div class="mid"><div class="skills"><div class="skill passive" data-slot="P"><img src="${skillIcon(p.def, 'P')}"><span class="stack"></span></div>${SLOTS.map((s) => `<div style="position:relative">${this.skillSlotHTML(s, s)}<button class="lvlup hidden" data-lv="${s}">+</button></div>`).join('')}</div>
      <div class="bars"><div class="bar hp"><div class="f"></div><div class="sh"></div><div class="t"></div></div><div class="bar mp"><div class="f"></div><div class="t"></div></div></div></div>
      <div class="stats"></div>`;
    bot.appendChild(cp);
    const mm = el('div', 'panel interactive'); mm.id = 'minimap-wrap';
    const c = el('canvas', 'mm'); c.width = c.height = 440; mm.appendChild(c);
    bot.appendChild(mm);
    this.root.appendChild(bot);
    this.mm = c;
    // 이벤트
    cp.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.g.levelSkill(b.dataset.lv); }));
    items.querySelector('[data-act=shop]').addEventListener('click', () => this.toggleShop());
    items.querySelectorAll('.it').forEach((it, i) => it.addEventListener('click', () => this.g.useItem(i)));
    cp.querySelectorAll('.skill').forEach((s) => {
      s.addEventListener('mouseenter', () => this.showSkillTip(s.dataset.slot, s));
      s.addEventListener('mouseleave', () => this.hideTip());
    });
  }
  buildMobile() {
    const r = this.root;
    const mmw = el('div', 'panel interactive'); mmw.id = 'm-mm';
    const c = el('canvas', 'mm'); c.width = c.height = 300; mmw.appendChild(c); r.appendChild(mmw); this.mm = c;
    r.appendChild(el('div', 'interactive', '')).id = 'm-enemies';
    const tr = el('div', 'interactive'); tr.id = 'm-top-right';
    tr.innerHTML = `<button class="mbtn" data-act="score"><i>☰</i>전적</button><button class="mbtn" data-act="menu"><i>⚙</i>설정</button>`;
    r.appendChild(tr);
    const hp = el('div', 'panel'); hp.id = 'm-hpbar';
    hp.innerHTML = `<div class="row1"><span class="lv">Lv 1</span><span class="g">500 G</span><span class="kda">0/0/0</span></div><div class="bar hp"><div class="f"></div><div class="sh"></div><div class="t"></div></div><div class="bar mp"><div class="f"></div><div class="t"></div></div>`;
    r.appendChild(hp);
    r.appendChild(el('div', 'interactive hidden', '')).id = 'm-allies';
  }
  // 모바일 컨트롤 DOM은 input(터치)에서 생성·배치
  showMsg(text, ok = false) {
    const m = $('#msg', this.root);
    m.textContent = text; m.style.opacity = 1; m.style.color = ok ? '#c8f0c0' : '#ffd0c0'; m.style.background = ok ? 'rgba(10,40,20,0.6)' : 'rgba(40,10,10,0.6)';
    this.msgT = 1.6;
    if (!ok) audio.play('deny', 0.6);
  }
  announce(text, tone = 'neutral') {
    const a = $('#announce', this.root);
    a.textContent = text; a.style.opacity = 1;
    a.style.color = tone === 'ally' ? '#9ad0ff' : tone === 'enemy' ? '#ffb0a0' : '#ffe6a0';
    this.annT = 3.5;
  }
  killfeed(e) {
    const kf = $('#killfeed', this.root);
    const k = e.killer, v = e.victim;
    const allyKill = k && k.team === this.p.team;
    const row = el('div', 'kf' + (allyKill ? '' : ' e'));
    const kimg = k && k.kind === 'champion' ? `<img src="${this.portraits[k.def.id]}">` : `<span>${k ? k.name : '?'}</span>`;
    row.innerHTML = `${kimg}<span>⚔</span><img src="${this.portraits[v.def.id]}">`;
    kf.prepend(row);
    while (kf.children.length > 5) kf.lastChild.remove();
    setTimeout(() => row.remove(), 8000);
    const mk = ['', '', '더블 킬!', '트리플 킬!', '쿼드라 킬!'];
    if (k && k.kind === 'champion') {
      if (e.multi >= 2) this.announce(`${k.name} — ${mk[Math.min(4, e.multi)]}`, allyKill ? 'ally' : 'enemy');
      else if (k === this.p) this.announce(`${v.name}을(를) 처치했습니다`, 'ally');
      else if (v === this.p) this.announce(`${k.name}에게 처치당했습니다`, 'enemy');
      else this.announce(`${k.name}이(가) ${v.name}을(를) 처치했습니다`, allyKill ? 'ally' : 'enemy');
    }
  }
  showSkillTip(slot, anchor) {
    const d = this.p.def;
    const t = $('#tooltip', this.root);
    if (slot === 'P') t.innerHTML = `<b>${d.passive.name}</b> (패시브)<br>${d.passive.desc.replace(/\{\w+\}/g, '추가')}`;
    else {
      const sk = d.skills[slot], lv = Math.max(1, this.p.skillLv[slot]);
      const v = sk.base[Math.min(sk.base.length - 1, lv - 1)];
      const ratio = sk.ad ? ` (+공격력의 ${Math.round(sk.ad * 100)}%)` : sk.ap ? ` (+주문력의 ${Math.round(sk.ap * 100)}%)` : '';
      const desc = sk.desc.replace(/\{\w+\}/g, `<span style="color:#ffd8a0">${v}${ratio}</span>`);
      t.innerHTML = `<b>${sk.name}</b> [${slot}] · 레벨 ${this.p.skillLv[slot]}<br><span style="color:#9aa8b6">재사용 ${sk.cd}초 · 소모 ${sk.cost}${sk.range ? ` · 사거리 ${sk.range}` : ''}</span><br>${desc}`;
    }
    const r = anchor.getBoundingClientRect();
    t.classList.remove('hidden');
    t.style.left = Math.max(8, r.left - 120) + 'px'; t.style.top = (r.top - t.offsetHeight - 30) + 'px';
  }
  hideTip() { $('#tooltip', this.root).classList.add('hidden'); }

  // ---------- 상점 ----------
  toggleShop(force) {
    const s = $('#shop', this.root);
    const open = force ?? s.classList.contains('hidden');
    if (!open) { s.classList.add('hidden'); return; }
    this.closeModals();
    s.classList.remove('hidden');
    this.renderShop();
  }
  renderShop() {
    const s = $('#shop', this.root), p = this.p, sim = this.sim;
    const can = sim.inShop(p);
    const card = (it) => `<div class="item ${(!can || p.gold < it.cost) ? 'no' : ''}" data-id="${it.id}">
        <div class="ic"><img src="${itemIconSrc(it.id)}" alt=""></div>
        <div class="hd"><b>${it.name}</b><div class="c">${COIN}<span>${it.cost} G</span></div></div>
        <p><i>${statIcon(it)}</i><span>${it.desc}</span></p></div>`;
    s.innerHTML = `<i class="orn top">${GEM_ORN}</i><i class="orn bot">${DIAMOND_ORN}</i>
      <div class="sh-head"><span class="emb">${FLEUR}</span><h3>상점</h3><button class="x" aria-label="닫기">${CLOSE_X}</button></div>
      <div class="status">${can ? `보유 골드 <b>${Math.floor(p.gold)} G</b> — 아이템을 눌러 구매합니다.` : '본진 상점 구역(또는 사망 중)에서만 구매할 수 있습니다. 목록은 미리 볼 수 있습니다.'}</div>
      <div class="rule"><i></i></div>
      <div class="items">${ITEMS.map(card).join('')}</div>
      <div class="rule plain"></div>
      <div class="inv"><span class="lbl">◈ 보유:</span>${p.items.map((id, i) => `<div class="it" data-sell="${i}" title="${ITEM_BY_ID[id].name} — 눌러서 판매(60%)"><img src="${itemIconSrc(id)}" alt=""></div>`).join('') || '<span class="none">없음</span>'}</div>`;
    s.querySelector('.x').onclick = () => this.toggleShop(false);
    s.querySelectorAll('.item').forEach((d) => d.addEventListener('click', () => {
      const r = sim.cmdBuy(p, d.dataset.id);
      if (!r.ok) this.showMsg(r.reason); else { audio.play('gold'); this.showMsg(`${ITEM_BY_ID[d.dataset.id].name} 구매`, true); }
      const sc = s.querySelector('.items').scrollTop;
      this.renderShop();
      s.querySelector('.items').scrollTop = sc;
    }));
    s.querySelectorAll('[data-sell]').forEach((d) => d.addEventListener('click', () => { const r = sim.cmdSell(p, +d.dataset.sell); if (!r.ok) this.showMsg(r.reason || '판매할 수 없습니다'); this.renderShop(); }));
  }
  closeModals() { for (const id of ['shop', 'score', 'menu']) $('#' + id, this.root).classList.add('hidden'); }
  anyModal() { return ['shop', 'score', 'menu'].some((id) => !$('#' + id, this.root).classList.contains('hidden')); }

  // ---------- 전적 ----------
  toggleScore(force) {
    const s = $('#score', this.root);
    const open = force ?? s.classList.contains('hidden');
    if (!open) { s.classList.add('hidden'); return; }
    s.classList.remove('hidden');
    this.renderScore();
  }
  renderScore() {
    const s = $('#score', this.root), sim = this.sim;
    const tb = sim.teamBuffs;
    const row = (c) => `<tr class="t${c.team} ${c === this.p ? 'me' : ''}"><td><img src="${this.portraits[c.def.id]}"> ${c.name}${c.isPlayer ? ' (나)' : ' <small style="color:#9aa8b6">AI</small>'}</td><td>${{ top: '상단', mid: '중앙', bot: '하단', jungle: '정글' }[c.lane]}</td><td>${c.level}</td><td>${c.k}/${c.d}/${c.a}</td><td>${c.cs}</td><td class="its">${c.items.map((i) => `<img src="${itemIconSrc(i)}" alt="" title="${ITEM_BY_ID[i].name}">`).join('')}</td><td>${c.dead ? `부활 ${Math.ceil(c.respawnAt - sim.time)}초` : ''}</td></tr>`;
    s.innerHTML = `<h3>전적 · 성장 정보 <button class="x">✕</button></h3>
      <div class="sum"><span style="color:var(--ally)">청람 ${sim.teamKills[0]}킬 · 비룡 ${tb[0].drake} · ${tb[0].colossusUntil > sim.time ? '거신 강화 중' : ''}</span><span>${fmtT(sim.time)}</span><span style="color:var(--enemy)">적염 ${sim.teamKills[1]}킬 · 비룡 ${tb[1].drake} · ${tb[1].colossusUntil > sim.time ? '거신 강화 중' : ''}</span></div>
      <table><tr><th>영웅</th><th>위치</th><th>레벨</th><th>K/D/A</th><th>CS</th><th>아이템</th><th></th></tr>${sim.champions.map(row).join('')}</table>
      <div style="margin-top:8px;font-size:12px;color:#9aa8b6">AI 대전 — 플레이어 1명 + AI 7명. 온라인 대전은 별도 구현 단계입니다.</div>`;
    s.querySelector('.x').onclick = () => this.toggleScore(false);
  }

  // ---------- 설정 ----------
  toggleMenu(force) {
    const m = $('#menu', this.root);
    const open = force ?? m.classList.contains('hidden');
    if (!open) { m.classList.add('hidden'); this.g.setPaused(false); return; }
    this.closeModals();
    m.classList.remove('hidden');
    this.g.setPaused(true);
    this.menuTab = this.menuTab || (this.mobile ? 'mobile' : 'control');
    this.renderMenu();
  }
  renderMenu() {
    const m = $('#menu', this.root), S = this.g.settings;
    const sel = (key, opts) => `<select data-k="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(S[key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const rng = (key, min, max, step) => `<input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${S[key]}">`;
    const tabs = { graphic: '그래픽', control: 'PC 조작', mobile: '터치 조작', sound: '소리' };
    let body = '';
    if (this.menuTab === 'graphic') body = `
      <div class="row"><div>품질<small>그림자·식생 밀도·파티클·해상도 (식생 밀도는 다음 경기부터)</small></div>${sel('quality', [['low', '낮음'], ['medium', '중간'], ['high', '높음']])}</div>
      <div class="row"><div>화면 흔들림 강도<small>0 = 끔</small></div>${rng('shake', 0, 1, 0.1)}</div>
      <div class="row"><div>섬광 강도<small>강한 빛 이펙트 밝기</small></div>${rng('flash', 0.2, 1, 0.1)}</div>
      <div class="row"><div>UI 크기</div>${rng('uiScale', 0.8, 1.4, 0.05)}</div>`;
    else if (this.menuTab === 'control') body = `
      <div class="row"><div>스킬 시전 방식<small>즉시: 키를 누르면 커서 위치로 시전 / 범위 확인: 키로 표시 후 좌클릭 시전</small></div>${sel('castMode', [['quick', '즉시 시전'], ['indicator', '범위 확인 후 시전']])}</div>
      <div class="row"><div>화면 가장자리 이동</div>${sel('edgePan', [['true', '켬'], ['false', '끔']])}</div>
      <div class="row"><div>스킬 자동 레벨업</div>${sel('autoLevel', [['true', '켬'], ['false', '끔 (Ctrl+Q/W/E/R 또는 + 버튼)']])}</div>
      <div class="row"><div>카메라 기본 상태</div>${sel('camLock', [['true', '내 캐릭터 고정'], ['false', '자유 카메라']])}</div>`;
    else if (this.menuTab === 'mobile') body = `
      <div class="row"><div>조작 방식<small>터치/PC HUD 전환 (즉시 적용)</small></div>${sel('touch', [['auto', '자동 감지'], ['true', '터치'], ['false', 'PC']])}</div>
      <div class="row"><div>좌우 반전 배치</div>${sel('mirror', [['false', '기본 (이동 왼쪽)'], ['true', '반전 (이동 오른쪽)']])}</div>
      <div class="row"><div>조이스틱 크기</div>${rng('joySize', 0.7, 1.5, 0.05)}</div>
      <div class="row"><div>조이스틱 위치<small>왼쪽 하단 기준 거리</small></div>${rng('joyPos', 0.6, 1.6, 0.05)}</div>
      <div class="row"><div>조이스틱 감도<small>낮을수록 큰 동작 필요</small></div>${rng('joySens', 0.5, 1.5, 0.05)}</div>
      <div class="row"><div>버튼 크기</div>${rng('btnSize', 0.75, 1.35, 0.05)}</div>
      <div class="row"><div>버튼 투명도</div>${rng('btnAlpha', 0.35, 1, 0.05)}</div>
      <div class="row"><div>기본 공격 대상 우선순위</div>${sel('targetPri', [['champ', '적 영웅 우선'], ['near', '가까운 대상 우선'], ['lowhp', '체력 비율 낮은 대상 우선']])}</div>
      <div class="row"><div>스킬 자동 조준 보조<small>빠른 터치 시 시야 내 적에게만 조준 (수동 조준 우선)</small></div>${sel('autoAim', [['true', '켬'], ['false', '끔']])}</div>`;
    else body = `
      <div class="row"><div>전체 음량</div>${rng('volMaster', 0, 1, 0.05)}</div>
      <div class="row"><div>효과음</div>${rng('volSfx', 0, 1, 0.05)}</div>
      <div class="row"><div>배경음</div>${rng('volMusic', 0, 1, 0.05)}</div>`;
    m.innerHTML = `<h3>설정 <button class="x">✕</button></h3><div class="tabs">${Object.entries(tabs).map(([k, l]) => `<button class="btn ${this.menuTab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>${body}
      <div class="actions"><button class="btn" data-act="surrender">항복</button><button class="btn primary" data-act="resume">계속하기</button></div>
      <div style="font-size:11px;color:#7a8896;margin-top:8px">AI 대전 진행 중에는 설정 창을 여는 동안 일시정지됩니다.</div>`;
    m.querySelector('.x').onclick = () => this.toggleMenu(false);
    m.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { this.menuTab = b.dataset.tab; this.renderMenu(); }));
    m.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => {
      let v = inp.value;
      if (v === 'true') v = true; else if (v === 'false') v = false; else if (inp.type === 'range') v = +v;
      this.g.applySetting(inp.dataset.k, v);
    }));
    m.querySelector('[data-act=resume]').onclick = () => this.toggleMenu(false);
    m.querySelector('[data-act=surrender]').onclick = () => { this.toggleMenu(false); this.g.surrender(); };
  }

  // ---------- 미니맵 ----------
  renderMinimapBase(S) {
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = Math.floor((x / S) * N), j = Math.floor((y / S) * N), k = j * N + i;
      let c;
      if (walk[k] || sd[k] < 0) {
        if (rd[k] < 4.4) c = [52, 104, 128];
        else c = [96, 112, 72];
      } else c = [26, 46, 32];
      if (brush[k]) c = [36, 84, 58];
      const n = 0.92 + ((x * 13 + y * 7) % 9) / 90;
      const o = (y * S + x) * 4;
      img.data[o] = c[0] * n; img.data[o + 1] = c[1] * n; img.data[o + 2] = c[2] * n; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const P = (p) => [((p.x + MAP_HALF) / (MAP_HALF * 2)) * S, ((p.z + MAP_HALF) / (MAP_HALF * 2)) * S];
    // 공격로 강조
    ctx.strokeStyle = 'rgba(214,180,120,0.75)'; ctx.lineWidth = S * 0.028; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const k of ['top', 'mid', 'bot']) { ctx.beginPath(); LANES[k].forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p)))); ctx.stroke(); }
    for (const b of BASES) { ctx.fillStyle = b.team === 0 ? 'rgba(62,155,240,0.35)' : 'rgba(229,70,59,0.35)'; ctx.beginPath(); ctx.arc(...P(b.center), (b.r / (MAP_HALF * 2)) * S, 0, 7); ctx.fill(); }
    return cv;
  }
  drawMinimap() {
    const c = this.mm; if (!c) return;
    const ctx = c.getContext('2d'), S = c.width, sim = this.sim, pt = this.p.team;
    ctx.drawImage(this.mmBg, 0, 0, S, S);
    // 안개
    const g = sim.visGrid[pt];
    if (!this.fogCv) { this.fogCv = document.createElement('canvas'); this.fogCv.width = this.fogCv.height = 136; this.fogCtx = this.fogCv.getContext('2d'); this.fogImg = this.fogCtx.createImageData(136, 136); }
    const fi = this.fogImg.data;
    for (let i = 0; i < g.length; i++) { fi[i * 4] = 8; fi[i * 4 + 1] = 12; fi[i * 4 + 2] = 20; fi[i * 4 + 3] = g[i] ? 0 : 130; }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogCv, 0, 0, S, S);
    const P = (x, z) => [((x + MAP_HALF) / (MAP_HALF * 2)) * S, ((z + MAP_HALF) / (MAP_HALF * 2)) * S];
    const sc = S / 256;
    // 큰 몬스터
    for (const cp of sim.camps) {
      if (!cp.big) continue;
      const [x, y] = P(cp.p.x, cp.p.z);
      ctx.fillStyle = cp.alive ? '#e8b84a' : 'rgba(120,110,90,0.6)';
      ctx.beginPath(); ctx.moveTo(x, y - 7 * sc); ctx.lineTo(x + 6 * sc, y); ctx.lineTo(x, y + 7 * sc); ctx.lineTo(x - 6 * sc, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    }
    // 구조물
    for (const u of sim.units) {
      if (u.kind !== 'turret' && u.kind !== 'nexus') continue;
      const [x, y] = P(u.x, u.z);
      const col = u.team === pt ? '#3e9bf0' : '#e5463b';
      const r = (u.kind === 'nexus' ? 7 : 4.5) * sc;
      ctx.fillStyle = u.dead ? 'rgba(80,80,80,0.7)' : col;
      ctx.strokeStyle = '#0a0e14'; ctx.lineWidth = 1.5 * sc;
      if (u.kind === 'nexus') { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke(); }
      else { ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.strokeRect(x - r, y - r, r * 2, r * 2); }
    }
    // 미니언
    for (const u of sim.units) {
      if (u.kind !== 'minion' || u.dead) continue;
      if (u.team !== pt && !u.visibleTo[pt]) continue;
      const [x, y] = P(u.x, u.z);
      ctx.fillStyle = u.team === pt ? '#8ac8ff' : '#ff8a7a';
      ctx.fillRect(x - 1.6 * sc, y - 1.6 * sc, 3.2 * sc, 3.2 * sc);
    }
    // 챔피언 (초상화 원)
    if (!this.mmImgs) { this.mmImgs = {}; for (const ch of sim.champions) { const im = new Image(); im.src = this.portraits[ch.def.id]; this.mmImgs[ch.def.id] = im; } }
    for (const ch of sim.champions) {
      if (ch.dead) continue;
      if (ch.team !== pt && !ch.visibleTo[pt]) continue;
      const [x, y] = P(ch.x, ch.z);
      const r = (ch === this.p ? 11 : 9) * sc;
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip();
      const im = this.mmImgs[ch.def.id]; if (im.complete) ctx.drawImage(im, x - r, y - r, r * 2, r * 2); else { ctx.fillStyle = '#333'; ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = ch === this.p ? '#f2d26a' : ch.team === pt ? '#3e9bf0' : '#e5463b'; ctx.lineWidth = 2.5 * sc;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
    }
    // 카메라 시야 사각형
    const cam = this.g.world.camera;
    const pts = [[0, 0], [innerWidth, 0], [innerWidth, innerHeight], [0, innerHeight]].map(([sx, sy]) => this.g.world.groundAt(sx, sy));
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2 * sc;
    ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = P(p.x, p.z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke();
  }
  minimapToWorld(clientX, clientY) {
    const r = this.mm.getBoundingClientRect();
    const fx = (clientX - r.left) / r.width, fy = (clientY - r.top) / r.height;
    return { x: fx * MAP_HALF * 2 - MAP_HALF, z: fy * MAP_HALF * 2 - MAP_HALF };
  }

  // ---------- 매 프레임 ----------
  set(key, el2, prop, val) { if (this.cache[key] !== val) { this.cache[key] = val; el2[prop] = val; } }
  update(dt) {
    const p = this.p, sim = this.sim, r = this.root;
    this.msgT -= dt; if (this.msgT <= 0) $('#msg', r).style.opacity = 0;
    this.annT -= dt; if (this.annT <= 0) $('#announce', r).style.opacity = 0;
    const tb = $('#topbar', r);
    this.set('k0', $('.k0', tb), 'textContent', String(sim.teamKills[p.team]));
    this.set('k1', $('.k1', tb), 'textContent', String(sim.teamKills[1 - p.team]));
    this.set('clk', $('.clock', tb), 'textContent', fmtT(sim.time));
    this.set('tw0', $('.tw0', tb), 'textContent', String(sim.turrets.filter((t) => t.team === p.team && !t.dead).length));
    this.set('tw1', $('.tw1', tb), 'textContent', String(sim.turrets.filter((t) => t.team !== p.team && !t.dead).length));
    const tbf = sim.teamBuffs[p.team];
    this.set('buf', $('.buff', tb), 'textContent', `${tbf.drake ? `비룡 ×${tbf.drake}` : ''}${tbf.colossusUntil > sim.time ? ` 거신 ${Math.ceil(tbf.colossusUntil - sim.time)}초` : ''}`);
    // 사망
    const dv = $('#deathveil', r);
    if (p.dead) { dv.classList.remove('hidden'); this.set('dv', dv, 'textContent', `부활까지 ${Math.max(0, Math.ceil(p.respawnAt - sim.time))}초 — 지금 상점을 이용할 수 있습니다`); }
    else dv.classList.add('hidden');
    const hpTxt = `${Math.ceil(p.hp)} / ${Math.round(p.s.hp)}`, mpTxt = `${Math.floor(p.mp)} / ${Math.round(p.s.mp)}`;
    const sh = p.shieldTotal(), maxEff = Math.max(p.s.hp, p.hp + sh);
    const hpBar = $('.bar.hp', r), mpBar = $('.bar.mp', r);
    if (hpBar) {
      hpBar.querySelector('.f').style.width = ((p.hp / maxEff) * 100).toFixed(1) + '%';
      const s2 = hpBar.querySelector('.sh'); s2.style.left = ((p.hp / maxEff) * 100).toFixed(1) + '%'; s2.style.width = ((sh / maxEff) * 100).toFixed(1) + '%';
      this.set('hpt', hpBar.querySelector('.t'), 'textContent', hpTxt + (sh > 0 ? ` (+${Math.round(sh)})` : ''));
      mpBar.querySelector('.f').style.width = ((p.mp / p.s.mp) * 100).toFixed(1) + '%';
      this.set('mpt', mpBar.querySelector('.t'), 'textContent', mpTxt);
    }
    if (!this.mobile) {
      const cp = $('#champ-panel', r);
      this.set('lvl', $('.lvl', cp), 'textContent', String(p.level));
      const cur = XP_TABLE[p.level - 1] || 0, nxt = XP_TABLE[p.level] || cur + 1;
      $('.xp div', cp).style.width = p.level >= MAX_LEVEL ? '100%' : (((p.xp - cur) / (nxt - cur)) * 100).toFixed(1) + '%';
      this.set('stats', $('.stats', cp), 'innerHTML', `<div><span>공격력</span>${Math.round(p.s.ad)}</div><div><span>주문력</span>${Math.round(p.s.ap)}</div><div><span>방어력</span>${Math.round(p.s.armor)}</div><div><span>마저</span>${Math.round(p.s.mr)}</div><div><span>공속</span>${p.attackSpeed().toFixed(2)}</div><div><span>이속</span>${p.moveSpeed().toFixed(2)}</div>`);
      this.set('gold', $('#items-panel .g', r), 'textContent', `${Math.floor(p.gold)} G`);
      const slots = r.querySelectorAll('#items-panel .it');
      const itemsKey = p.items.join(',');
      if (this.cache.items !== itemsKey) { this.cache.items = itemsKey; slots.forEach((s, i) => { const id = p.items[i]; s.innerHTML = `<span class="n">${i + 1}</span>${id ? `<img src="${itemIconSrc(id)}" alt="">` : ''}`; s.title = id ? `${ITEM_BY_ID[id].name} — ${ITEM_BY_ID[id].desc}` : ''; }); }
      this.set('ms', $('#mystats', r), 'innerHTML', `K/D/A <b>${p.k}/${p.d}/${p.a}</b> · CS <b>${p.cs}</b> · ${p.isPlayer ? '플레이어 1 + AI 7' : ''}`);
      cp.querySelectorAll('[data-lv]').forEach((b) => b.classList.toggle('hidden', !(p.skillPoints > 0 && this.g.canLevel(b.dataset.lv))));
    } else {
      const hp = $('#m-hpbar', r);
      this.set('mlv', $('.lv', hp), 'textContent', `Lv ${p.level}`);
      this.set('mg', $('.g', hp), 'textContent', `${Math.floor(p.gold)} G`);
      this.set('mk', $('.kda', hp), 'textContent', `${p.k}/${p.d}/${p.a} · CS ${p.cs}`);
    }
    // 스킬 쿨다운 (PC·모바일 공통 클래스)
    for (const slot of SLOTS) {
      const els = r.querySelectorAll(`[data-slot="${slot}"]`);
      const sk = p.def.skills[slot];
      const rem = Math.max(0, p.cds[slot] - sim.time);
      const total = sk.cd * (1 - (p.s.cdr || 0));
      els.forEach((e) => {
        e.classList.toggle('locked', p.skillLv[slot] === 0);
        e.classList.toggle('nomana', p.mp < sk.cost && p.skillLv[slot] > 0);
        e.classList.toggle('ready', rem <= 0 && p.skillLv[slot] > 0 && p.mp >= sk.cost);
        const cd = e.querySelector('.cd'), cdt = e.querySelector('.cdt');
        if (cd) cd.style.setProperty('--p', rem > 0 ? ((rem / total) * 100).toFixed(1) + '%' : '0%');
        if (cdt) cdt.textContent = rem > 0 ? (rem < 1 ? rem.toFixed(1) : Math.ceil(rem)) : '';
        e.querySelectorAll('.pips i').forEach((pip, i) => pip.classList.toggle('on', i < p.skillLv[slot]));
      });
    }
    // 패시브 스택 표시
    const st = r.querySelector('.passive .stack');
    if (st) { const ps = p.pass; const v = p.def.id === 'park' ? Math.floor(ps.heat) : p.def.id === 'kim' ? Math.floor(ps.charge) : p.def.id === 'pang' || p.def.id === 'sagong' ? ps.stacks : p.def.id === 'cha' ? ps.asStacks : p.def.id === 'lee' ? (ps.empowered ? '♪' : '') : ''; this.set('pst', st, 'textContent', v === 0 ? '' : String(v)); }
    // 미니맵 (10Hz)
    this.mmT = (this.mmT || 0) - dt;
    if (this.mmT <= 0) { this.mmT = 0.1; this.drawMinimap(); }
    if (!$('#score', r).classList.contains('hidden')) { this.scT = (this.scT || 0) - dt; if (this.scT <= 0) { this.scT = 0.5; this.renderScore(); } }
  }
}
