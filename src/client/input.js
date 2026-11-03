// 플랫폼별 입력. 이동·전투·스킬·판정은 동일한 sim 명령 API로 전달된다.
import { skillIcon } from './icons.js';
import { audio } from './audio.js';
import { dist } from '../sim/sim.js';

const SLOTS = ['Q', 'W', 'E', 'R'];
const enemyOf = (p) => (u) => u.team !== p.team && u.kind !== 'decoy' || (u.kind === 'decoy' && u.team !== p.team);

// 공통: 조준 계산
function aimFrom(p, sk, point) {
  let dx = point.x - p.x, dz = point.z - p.z;
  const d = Math.hypot(dx, dz) || 1;
  return { dir: { x: dx / d, z: dz / d }, dist: d };
}

// ======================= PC =======================
export class PCInput {
  constructor(game) {
    this.g = game; this.p = game.player; this.sim = game.sim; this.w = game.world; this.hud = game.hud;
    this.mx = innerWidth / 2; this.my = innerHeight / 2;
    this.aiming = null; this.amove = false; this.rDown = false; this.rRepeat = 0;
    this.spaceHeld = false;
    this.handlers = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); this.handlers.push([t, ev, fn, opt]); };
    const cv = document.getElementById('game');
    on(window, 'mousemove', (e) => { this.mx = e.clientX; this.my = e.clientY; });
    on(cv, 'contextmenu', (e) => e.preventDefault());
    on(document.getElementById('hud'), 'contextmenu', (e) => e.preventDefault());
    on(cv, 'mousedown', (e) => this.onDown(e));
    on(window, 'mouseup', (e) => { if (e.button === 2) this.rDown = false; });
    on(cv, 'wheel', (e) => { this.w.camera.zoom(Math.sign(e.deltaY) * 1.2); e.preventDefault(); }, { passive: false });
    on(window, 'keydown', (e) => this.onKey(e, true));
    on(window, 'keyup', (e) => this.onKey(e, false));
    on(window, 'blur', () => this.releaseAll());
    const mm = this.hud.mm;
    on(mm, 'mousedown', (e) => {
      e.stopPropagation(); e.preventDefault();
      const wp = this.hud.minimapToWorld(e.clientX, e.clientY);
      if (e.button === 2) { this.sim.cmdMove(this.p, wp.x, wp.z); this.w.clickMarker(wp.x, wp.z); }
      else { this.mmDrag = true; this.w.camera.locked = false; this.w.camera.goal.set(wp.x, 0, wp.z); }
    });
    on(window, 'mousemove', (e) => { if (this.mmDrag && e.buttons & 1) { const wp = this.hud.minimapToWorld(e.clientX, e.clientY); this.w.camera.goal.set(wp.x, 0, wp.z); } });
    on(window, 'mouseup', () => (this.mmDrag = false));
    this.w.camera.locked = game.settings.camLock;
  }
  destroy() { for (const [t, ev, fn, opt] of this.handlers) t.removeEventListener(ev, fn, opt); }
  releaseAll() { this.rDown = false; this.aiming = null; this.amove = false; this.spaceHeld = false; this.w.hideIndicators(); document.body.style.cursor = ''; this.hud.toggleScore(false); }
  ground() { return this.w.groundAt(this.mx, this.my); }
  onDown(e) {
    if (this.g.paused || this.g.over) return;
    audio.init();
    if (e.button === 2) {
      if (this.aiming) { this.cancelAim(); return; }
      if (this.amove) { this.amove = false; document.body.style.cursor = ''; }
      this.rDown = true; this.rRepeat = 0.18;
      this.rightClick(true);
    } else if (e.button === 0) {
      if (this.aiming) { this.castAiming(); return; }
      if (this.amove) {
        const t = this.w.pickUnit(this.mx, this.my, (u) => u.team !== this.p.team && this.sim.canTarget(this.p, u));
        if (t) this.sim.cmdAttack(this.p, t);
        else { const gp = this.ground(); this.sim.cmdAttackMove(this.p, gp.x, gp.z); this.w.clickMarker(gp.x, gp.z, 0xff7a6a); }
        this.amove = false; document.body.style.cursor = '';
      }
    }
  }
  rightClick(first) {
    const p = this.p;
    if (p.dead) return;
    const t = this.w.pickUnit(this.mx, this.my, (u) => u.team !== p.team && this.sim.canTarget(p, u));
    if (t) { if (p.target !== t) this.sim.cmdAttack(p, t); if (first) this.w.fx.ring(t.x, t.z, 1.2, 0.4, 0xff5a4a, 0.3); return; }
    const gp = this.ground();
    this.sim.cmdMove(p, gp.x, gp.z);
    if (first) this.w.clickMarker(gp.x, gp.z);
  }
  onKey(e, down) {
    const k = e.code;
    if (k === 'Tab') { e.preventDefault(); this.hud.toggleScore(down); return; }
    if (!down) { if (k === 'Space') this.spaceHeld = false; if (this.aiming && this.g.settings.castMode === 'quickIndicator' && k === 'Key' + this.aiming) this.castAiming(); return; }
    if (e.repeat && k !== 'Space') return;
    audio.init();
    if (k === 'Escape') {
      if (this.aiming) { this.cancelAim(); return; }
      if (this.hud.anyModal()) { const menuOpen = !document.getElementById('menu').classList.contains('hidden'); this.hud.closeModals(); if (menuOpen) this.g.setPaused(false); return; }
      this.hud.toggleMenu(true); return;
    }
    if (this.g.paused || this.g.over) return;
    const p = this.p;
    if (k === 'Space') { this.spaceHeld = true; this.w.camera.locked = true; e.preventDefault(); return; }
    if (k === 'KeyY') { this.w.camera.locked = !this.w.camera.locked; this.hud.showMsg(this.w.camera.locked ? '카메라 고정' : '자유 카메라', true); return; }
    if (k === 'KeyP') { this.hud.toggleShop(); return; }
    if (k === 'KeyS') { this.sim.cmdStop(p); this.cancelAim(); return; }
    if (k === 'KeyB') { const r = this.sim.cmdRecall(p); if (!r.ok) this.hud.showMsg(r.reason); return; }
    if (k === 'KeyA') { this.amove = true; document.body.style.cursor = 'crosshair'; return; }
    if (/^Digit[1-6]$/.test(k)) { this.g.useItem(+k.slice(5) - 1); return; }
    const m = k.match(/^Key([QWER])$/);
    if (m) {
      const slot = m[1];
      if (e.ctrlKey || e.altKey) { e.preventDefault(); this.g.levelSkill(slot); return; }
      const chk = this.sim.canCast(p, slot);
      if (!chk.ok) { this.hud.showMsg(chk.reason); return; }
      const sk = p.def.skills[slot];
      if (this.g.settings.castMode === 'quick' || sk.t === 'self') this.castNow(slot);
      else { this.aiming = slot; }
    }
  }
  targetFor(slot, sk) {
    const p = this.p;
    if (sk.t === 'enemy') return this.w.pickUnit(this.mx, this.my, (u) => u.team !== p.team && u.kind === 'champion' && this.sim.canTarget(p, u), 60);
    if (sk.t === 'ally') return this.w.pickUnit(this.mx, this.my, (u) => u.team === p.team && u.kind === 'champion' && !u.dead, 50) || p;
    return null;
  }
  castNow(slot) {
    const p = this.p, sk = p.def.skills[slot];
    const gp = this.ground();
    const target = this.targetFor(slot, sk);
    if (sk.t === 'enemy' && !target) { this.hud.showMsg('대상 영웅에게 커서를 올리고 사용하세요'); return; }
    const r = this.sim.cmdCast(p, slot, { point: gp, target });
    if (!r.ok) this.hud.showMsg(r.reason); else if (r.queued) this.hud.showMsg(r.reason, true);
  }
  castAiming() { const s = this.aiming; this.aiming = null; this.w.hideIndicators(); this.castNow(s); }
  cancelAim() { this.aiming = null; this.w.hideIndicators(); }
  update(dt) {
    const p = this.p, cam = this.w.camera;
    // 우클릭 유지 시 이동 갱신
    if (this.rDown && !this.g.paused) { this.rRepeat -= dt; if (this.rRepeat <= 0) { this.rRepeat = 0.15; this.rightClick(false); } }
    if (this.spaceHeld) cam.locked = true;
    // 화면 가장자리 이동
    if (this.g.settings.edgePan && !cam.locked && document.hasFocus()) {
      const m = 8, sp = 34 * dt;
      if (this.mx <= m) cam.pan(-sp, 0); else if (this.mx >= innerWidth - m) cam.pan(sp, 0);
      if (this.my <= m) cam.pan(0, -sp); else if (this.my >= innerHeight - m) cam.pan(0, sp);
    }
    // 조준 표시
    if (this.aiming) {
      const sk = p.def.skills[this.aiming];
      const gp = this.ground();
      const a = aimFrom(p, sk, gp);
      let point = gp;
      if (sk.t === 'point' && a.dist > sk.range) point = { x: p.x + a.dir.x * sk.range, z: p.z + a.dir.z * sk.range };
      this.w.showAim(p, sk, point, a.dir, !this.sim.canCast(p, this.aiming).ok);
      if (sk.t === 'enemy' || sk.t === 'ally') { const t = this.targetFor(this.aiming, sk); this.w.markTarget(t && t !== p ? t : null, sk.t === 'ally'); }
    } else if (this.amove) this.w.showRange(p, p.s.range);
    else { this.w.hideIndicators(); }
    // 마우스 아래 적 강조
    const hov = this.w.pickUnit(this.mx, this.my, (u) => u.team !== p.team && this.sim.canTarget(p, u));
    document.body.style.cursor = this.amove ? 'crosshair' : hov ? 'pointer' : '';
    if (!this.aiming) this.w.markTarget(hov || (p.target && !p.target.dead && p.target.visibleTo[p.team] ? p.target : null));
  }
}

// ======================= 터치 =======================
export class TouchInput {
  constructor(game) {
    this.g = game; this.p = game.player; this.sim = game.sim; this.w = game.world; this.hud = game.hud;
    this.ptrs = new Map(); // pointerId → {ctl, ...}
    this.joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.attackHeld = null; this.lock = null; this.aim = null;
    this.handlers = [];
    this.build();
    this.layout();
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); this.handlers.push([t, ev, fn, opt]); };
    const surf = document.getElementById('hud');
    on(window, 'pointerdown', (e) => this.down(e), { passive: false });
    on(window, 'pointermove', (e) => this.move(e), { passive: false });
    on(window, 'pointerup', (e) => this.up(e, false));
    on(window, 'pointercancel', (e) => this.up(e, true));
    on(window, 'blur', () => this.releaseAll());
    on(window, 'resize', () => this.layout());
    on(window, 'orientationchange', () => setTimeout(() => this.layout(), 200));
    on(document, 'contextmenu', (e) => e.preventDefault());
    this.w.camera.locked = true;
  }
  destroy() { for (const [t, ev, fn, opt] of this.handlers) t.removeEventListener(ev, fn, opt); this.els.wrap.remove(); }
  build() {
    const hud = document.getElementById('hud');
    const wrap = document.createElement('div'); wrap.id = 'm-controls'; wrap.className = 'm-only';
    const p = this.p;
    const btn = (cls, html, data) => { const b = document.createElement('div'); b.className = 'mskill interactive ' + cls; b.innerHTML = html; Object.assign(b.dataset, data); b.setAttribute('role','button');wrap.appendChild(b); return b; };
    const icon=(path,label)=>`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="${path}"/></svg><span class="utility-label">${label}</span>`;
    this.els = { wrap, skills: {} };
    this.els.joy = document.createElement('div'); this.els.joy.id = 'joy'; this.els.joy.setAttribute('aria-label','캐릭터 이동 패드');this.els.joy.innerHTML = '<div class="knob"><i></i></div><div class="joy-compass"></div><span class="joy-label">이동</span>'; wrap.appendChild(this.els.joy);
    this.els.atk = btn('big', `<svg class="attack-emblem" viewBox="0 0 80 80" aria-hidden="true"><path d="M19 9l36 40-8 8L9 19V9zM61 9h10v10L34 57l-9-8zM13 57l10-10 10 10-7 7-6-3-5 10-7-7 10-5zM57 47l10 10-5 5 10 5-7 7-6-11-6 2-7-8z"/></svg><div class="lbl">공격</div>`, { ctl: 'attack' });
    for (const s of SLOTS) {
      const b = btn(s === 'R' ? 'r' : '', `<img src="${skillIcon(p.def, s)}"><div class="cd"></div><div class="cdt"></div><span class="skill-letter">${s==='R'?'궁극기':s}</span><button class="lvlup hidden" data-lv="${s}" aria-label="${p.def.skills[s].name} 레벨 올리기">+</button>`, { ctl: 'skill', slot: s });
      b.setAttribute('aria-label',p.def.skills[s].name);
      b.setAttribute('data-slot', s);
      this.els.skills[s] = b;
    }
    this.els.tChamp = btn('small target-control', icon('M20 5l10 6-3 15-7 9-7-9-3-15zM15 16l5 4 5-4','영웅'), { ctl: 'tattack', kind: 'champion' });
    this.els.tMinion = btn('small target-control', icon('M10 15l10-8 10 8-3 16H13zM15 21h2M23 21h2','미니언'), { ctl: 'tattack', kind: 'minion' });
    this.els.tTower = btn('small target-control', icon('M11 7v10h18V7h-5v5h-8V7zM14 17v15h12V17M9 33h22','건물'), { ctl: 'tattack', kind: 'structure' });
    this.els.recall = btn('small utility recall', icon('M10 31h20M15 26V14l5-9 5 9v12M8 26c-8-12 1-23 12-23M8 26l-2-8M8 26l8-2','귀환'), { ctl: 'recall' });
    this.els.potion = btn('small utility potion', icon('M16 6h8M17 6v9l-7 14q-2 6 10 6t10-6l-7-14V6M13 24h14','물약'), { ctl: 'potion' });
    this.els.shop = btn('small utility shop', icon('M8 15h24l-2 18H10zM14 15V9q6-8 12 0v6M17 23h6M20 20v6','상점'), { ctl: 'shop' });
    this.els.cam = btn('small camera-control', icon('M8 12h7l3-5h7l3 5h5v19H8zM26 21a6 6 0 1 1-12 0 6 6 0 0 1 12 0','시점'), { ctl: 'camback' });
    for(const b of wrap.querySelectorAll('[data-ctl]:not([data-slot])'))b.setAttribute('aria-label',b.textContent.trim());
    this.els.cancel = document.createElement('div'); this.els.cancel.id = 'm-cancel'; this.els.cancel.className = 'hidden'; this.els.cancel.innerHTML = '<b>×</b><span>취소</span>'; wrap.appendChild(this.els.cancel);
    hud.appendChild(wrap);
    wrap.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.g.levelSkill(b.dataset.lv); }));
  }
  layout() {
    const S = this.g.settings, W = innerWidth, H = innerHeight;
    const fit=Math.max(.76,Math.min(1,W/900,H/430)),b=Math.min(S.btnSize,1.08)*fit;this.controlScale=b;
    const root = document.documentElement;
    root.style.setProperty('--btn', b); root.style.setProperty('--btn-alpha', S.btnAlpha); root.style.setProperty('--joy-s', S.joySize*fit);
    const cs = getComputedStyle(root);
    const sa = { t: parseFloat(cs.getPropertyValue('--sat')) || 0, r: parseFloat(cs.getPropertyValue('--sar')) || 0, b: parseFloat(cs.getPropertyValue('--sab')) || 0, l: parseFloat(cs.getPropertyValue('--sal')) || 0 };
    this.sa = sa;
    const mir = S.mirror;
    document.getElementById('hud').classList.toggle('mirror', !!mir);
    const X = (x) => (mir ? W - x : x); // 좌우 반전
    // 공격 버튼 (오른쪽 아래, 엄지 영역)
    const ax = W - sa.r - 90 * b, ay = H - sa.b - 90 * b;
    const place = (el, x, y) => { el.style.left = X(x) + 'px'; el.style.top = y + 'px'; };
    place(this.els.atk, ax, ay);
    const sp = { Q:[ax-107*b,ay+16*b],W:[ax-122*b,ay-75*b],E:[ax-57*b,ay-144*b],R:[ax+15*b,ay-196*b] };
    for (const s of SLOTS) place(this.els.skills[s], ...sp[s]);
    place(this.els.tChamp,W-sa.r-27*b,ay-130*b);
    place(this.els.tMinion,W-sa.r-27*b,ay-54*b);
    place(this.els.tTower,W-sa.r-27*b,ay+40*b);
    place(this.els.shop,W-sa.r-260*b,H-sa.b-36*b);
    place(this.els.recall,W-sa.r-326*b,H-sa.b-36*b);
    place(this.els.potion,W-sa.r-392*b,H-sa.b-36*b);
    if(W<H){
      place(this.els.shop,W-sa.r-30,H-sa.b-290);
      place(this.els.recall,W-sa.r-30,H-sa.b-344);
      place(this.els.potion,W-sa.r-30,H-sa.b-398);
    }
    place(this.els.cam,W-sa.r-27*b,sa.t+80*b);
    this.els.cancel.style.left = W / 2 + 'px'; this.els.cancel.style.top = (sa.t + 46 * b) + 'px'; // 취소 영역: 화면 상단 중앙 — 최대 조준 드래그(110px) 범위 밖이라 일반 조준과 겹치지 않음
    // 조이스틱 기본 위치
    const jr = this.joyRadius = 70*S.joySize*fit;
    this.joyHome = { x: X(sa.l + 28*fit + jr + 50 * (S.joyPos - 1)), y: H - sa.b - 28*fit - jr - 35 * (S.joyPos - 1) };
    if (!this.joy.active) { this.els.joy.style.left = this.joyHome.x + 'px'; this.els.joy.style.top = this.joyHome.y + 'px'; }
    this.anchors = { atk: [X(ax), ay], skills: Object.fromEntries(SLOTS.map((s) => [s, [X(sp[s][0]), sp[s][1]]])) };
  }
  releaseAll() {
    for (const [id] of this.ptrs) this.up({ pointerId: id, clientX: 0, clientY: 0 }, true);
    this.ptrs.clear();
    this.endJoy(); this.attackHeld = null; this.endAim(true);
    Object.values(this.els.skills).forEach((b) => b.classList.remove('pressed'));
    this.els.atk.classList.remove('pressed');
  }
  ctlAt(target) {
    let el = target;
    while (el && el !== document.body) { if (el.dataset && el.dataset.ctl) return el; if (el.id === 'm-mm' || el.classList?.contains('mm')) return { dataset: { ctl: 'minimap' } }; if (el.dataset && el.dataset.lv) return null; el = el.parentElement; }
    return null;
  }
  isUIElement(target) {
    let el = target;
    while (el && el !== document.body) { if (el.classList && (el.classList.contains('interactive') || el.classList.contains('modal') || el.classList.contains('mbtn') || el.tagName === 'BUTTON' || el.tagName === 'SELECT' || el.tagName === 'INPUT')) return true; el = el.parentElement; }
    return false;
  }
  down(e) {
    if (e.pointerType === 'mouse' && !this.g.settings.mouseAsTouch) { /* 마우스로도 터치 HUD 사용 가능 */ }
    audio.init();
    if (this.g.over) return;
    if (this.hud.anyModal()) return; // 모달은 일반 클릭으로 처리
    const ctl = this.ctlAt(e.target);
    const W = innerWidth, H = innerHeight;
    if (ctl) {
      e.preventDefault();
      const c = ctl.dataset.ctl;
      if (c === 'minimap') { this.ptrs.set(e.pointerId, { ctl: 'minimap' }); this.mmPan(e); return; }
      if (this.g.paused) return;
      if (c === 'attack') { this.ptrs.set(e.pointerId, { ctl: 'attack' }); this.attackHeld = 'any'; this.els.atk.classList.add('pressed'); this.attackTick(true); return; }
      if (c === 'tattack') { this.ptrs.set(e.pointerId, { ctl: 'tattack' }); this.attackHeld = ctl.dataset.kind; ctl.classList.add('pressed'); this.attackTick(true); return; }
      if (c === 'skill') { this.startAim(e, ctl.dataset.slot); return; }
      if (c === 'recall') { const r = this.sim.cmdRecall(this.p); if (!r.ok) this.hud.showMsg(r.reason); return; }
      if (c === 'potion') { const r = this.sim.cmdUsePotion(this.p); if (!r.ok) this.hud.showMsg(r.reason); return; }
      if (c === 'shop') { this.hud.toggleShop(); return; }
      if (c === 'camback') { this.w.camera.locked = true; this.w.camera.followOffset.set(0, 0, 0); return; }
      return;
    }
    if (this.isUIElement(e.target)) return;
    e.preventDefault();
    if (this.g.paused) return;
    // 조이스틱 영역 (이동 쪽 화면 하단 45%)
    const mir = this.g.settings.mirror;
    const inJoyZone = (mir ? e.clientX > W * 0.55 : e.clientX < W * 0.45) && e.clientY > H * 0.38;
    if (inJoyZone && !this.joy.active) { this.startJoy(e); return; }
    // 그 외 빈 영역: 탭 = 대상 고정 / 드래그 = 카메라 이동
    this.ptrs.set(e.pointerId, { ctl: 'pan', sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: 0, t: performance.now() });
  }
  move(e) {
    const st = this.ptrs.get(e.pointerId);
    if (!st) return;
    e.preventDefault?.();
    if (st.ctl === 'joy') this.moveJoy(e);
    else if (st.ctl === 'aim') this.moveAim(e);
    else if (st.ctl === 'minimap') this.mmPan(e);
    else if (st.ctl === 'pan') {
      const dx = e.clientX - st.lx, dy = e.clientY - st.ly;
      st.moved += Math.hypot(dx, dy); st.lx = e.clientX; st.ly = e.clientY;
      if (st.moved > 14 && !this.aim) {
        // 화면 드래그로 주변 전장 확인 (월드 단위 환산)
        const k = (this.w.camera.dist * 0.55) / innerHeight * 1.9;
        this.w.camera.pan(-dx * k, -dy * k / Math.sin(this.w.camera.pitch));
      }
    }
  }
  up(e, cancelled) {
    const st = this.ptrs.get(e.pointerId);
    if (!st) return;
    this.ptrs.delete(e.pointerId);
    if (st.ctl === 'joy') this.endJoy();
    else if (st.ctl === 'attack' || st.ctl === 'tattack') { if (![...this.ptrs.values()].some((s) => s.ctl === 'attack' || s.ctl === 'tattack')) this.attackHeld = null; this.els.wrap.querySelectorAll('.pressed').forEach((b) => b.dataset.ctl !== 'skill' && b.classList.remove('pressed')); }
    else if (st.ctl === 'aim') this.endAim(cancelled);
    else if (st.ctl === 'pan' && st.moved < 14 && !cancelled && performance.now() - st.t < 350) this.tapWorld(e.clientX, e.clientY);
  }
  mmPan(e) {
    const wp = this.hud.minimapToWorld(e.clientX, e.clientY);
    this.w.camera.locked = false; this.w.camera.goal.set(wp.x, 0, wp.z);
  }
  // ---- 조이스틱 ----
  startJoy(e) {
    const S = this.g.settings;
    const fixed=Math.hypot(e.clientX-this.joyHome.x,e.clientY-this.joyHome.y)<this.joyRadius*1.4;
    const ox=fixed?this.joyHome.x:Math.max(this.joyRadius+this.sa.l,Math.min(innerWidth-this.sa.r-this.joyRadius,e.clientX)),oy=fixed?this.joyHome.y:Math.min(innerHeight-this.sa.b-this.joyRadius,Math.max(this.joyRadius+this.sa.t,e.clientY));
    this.joy = { active: true, id: e.pointerId, ox, oy, x: 0, y: 0 };
    this.ptrs.set(e.pointerId, { ctl: 'joy' });
    this.els.joy.style.left = ox + 'px'; this.els.joy.style.top = oy + 'px';this.els.joy.classList.add('active');this.moveJoy(e);
  }
  moveJoy(e) {
    const S = this.g.settings;
    const R = this.joyRadius;
    let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    const knob = this.els.joy.firstChild;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const k = Math.min(1, d / (R * 0.95 / S.joySens));
    this.joy.x = d > 0 ? (dx / Math.max(d, 1)) * k : 0; this.joy.y = d > 0 ? (dy / Math.max(d, 1)) * k : 0;
  }
  endJoy() {
    if (!this.joy.active) return;
    this.joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.els.joy.classList.remove('active');
    this.els.joy.firstChild.style.transform = 'translate(-50%, -50%)';
    this.els.joy.style.left = this.joyHome.x + 'px'; this.els.joy.style.top = this.joyHome.y + 'px';
    this.sim.cmdJoy(this.p, 0, 0);
  }
  // ---- 기본 공격 (누르고 있는 동안 반복) ----
  pickAttackTarget(kind) {
    const p = this.p, sim = this.sim, pri = this.g.settings.targetPri;
    const range = p.s.range + 1.2;
    if (this.lock && kind === 'any') return this.lock;
    const cand = sim.units.filter((u) => !u.dead && u.team !== p.team && sim.canTarget(p, u) && dist(u, p) <= range + u.r &&
      (kind === 'any' || (kind === 'champion' && u.kind === 'champion') || (kind === 'minion' && (u.kind === 'minion' || u.kind === 'monster')) || (kind === 'structure' && (u.kind === 'turret' || u.kind === 'nexus'))));
    if (!cand.length) return null;
    const score = (u) => {
      const d = dist(u, p);
      if (pri === 'lowhp') return u.hp / u.s.hp + d * 0.01;
      if (pri === 'near') return d;
      return (u.kind === 'champion' ? 0 : u.kind === 'minion' || u.kind === 'monster' ? 100 : 200) + (kind === 'minion' ? u.hp / u.s.hp * 10 : d);
    };
    cand.sort((a, b) => score(a) - score(b));
    return cand[0];
  }
  underEnemyTurret(x, z) { return this.sim.turrets.some((t) => !t.dead && t.team !== this.p.team && Math.hypot(t.x - x, t.z - z) < t.s.range); }
  attackTick(first) {
    const p = this.p;
    if (!this.attackHeld || p.dead) return;
    if (this.joy.active && (this.joy.x || this.joy.y)) return; // 이동 입력 우선
    const t = this.pickAttackTarget(this.attackHeld);
    if (!t) { if (first) this.hud.showMsg('사거리 안에 공격할 대상이 없습니다'); return; }
    // 포탑 안으로 무리하게 추격하지 않음: 사거리 밖 대상이 적 포탑 아래면 공격 명령을 내리지 않음
    const inRange = dist(p, t) <= p.s.range + t.r + p.r * 0.4;
    if (!inRange && t.kind !== 'turret' && this.underEnemyTurret(t.x, t.z) && !this.underEnemyTurret(p.x, p.z)) return;
    if (p.target !== t) this.sim.cmdAttack(p, t);
  }
  tapWorld(x, y) {
    const p = this.p;
    const t = this.w.pickUnit(x, y, (u) => u.team !== p.team && this.sim.canTarget(p, u), 50);
    if (t) { this.lock = t; this.hud.showMsg(`${t.name} 대상 고정`, true); this.sim.cmdAttack(p, t); }
    else if (this.lock) { this.lock = null; this.hud.showMsg('대상 고정 해제', true); }
  }
  // ---- 스킬 조준 (드래그) ----
  startAim(e, slot) {
    const p = this.p, chk = this.sim.canCast(p, slot);
    if (!chk.ok) { this.hud.showMsg(chk.reason); return; }
    const sk = p.def.skills[slot];
    const a = this.anchors.skills[slot];
    this.aim = { slot, sk, id: e.pointerId, ax: a[0], ay: a[1], dx: 0, dy: 0, drag: false, overCancel: false, ally: null };
    this.ptrs.set(e.pointerId, { ctl: 'aim' });
    this.els.skills[slot].classList.add('pressed');
    this.els.cancel.classList.remove('hidden');
    if (sk.t === 'ally') this.showAllyPortraits(a);
    this.moveAim(e);
  }
  showAllyPortraits(anchor) {
    const box = document.getElementById('m-allies');
    const allies = this.sim.champions.filter((c) => c.team === this.p.team && !c.dead);
    box.innerHTML = allies.map((c) => `<div class="pt" data-uid="${c.id}"><img src="${this.g.portraits[c.def.id]}"><div class="hp" style="width:${(c.hp / c.s.hp) * 100}%"></div><span>${c === this.p ? '나' : c.name}</span></div>`).join('');
    // 조준 드래그 경로와 겹치지 않도록 스킬 묶음 바깥쪽(이동 쪽)에 세로로 배치
    const b = this.controlScale, mir = this.g.settings.mirror;
    const colW = 60 * b, colH = allies.length * 62 * b;
    box.style.flexDirection = 'column';
    const x = mir ? anchor[0] + 230 * b : anchor[0] - 230 * b - colW;
    box.style.left = Math.max(170 * b, Math.min(innerWidth - colW - 8, x)) + 'px';
    box.style.top = Math.max(8, Math.min(innerHeight - colH - 8, innerHeight * 0.5 - colH / 2)) + 'px';
    box.classList.remove('hidden');
  }
  moveAim(e) {
    const A = this.aim; if (!A) return;
    const p = this.p, sk = A.sk, b = this.controlScale;
    A.dx = e.clientX - A.ax; A.dy = e.clientY - A.ay;
    const dlen = Math.hypot(A.dx, A.dy);
    if (dlen > 14 * b) A.drag = true;
    // 취소 영역
    const cr = this.els.cancel.getBoundingClientRect();
    A.overCancel = e.clientX > cr.left - 10 && e.clientX < cr.right + 10 && e.clientY > cr.top - 10 && e.clientY < cr.bottom + 10;
    this.els.cancel.classList.toggle('hot', A.overCancel);
    // 아군 초상화 위
    A.allyPortrait = null;
    if (sk.t === 'ally') {
      document.querySelectorAll('#m-allies .pt').forEach((pt) => {
        const r = pt.getBoundingClientRect();
        const hot = e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
        pt.classList.toggle('hot', hot);
        if (hot) A.allyPortrait = this.sim.champions.find((c) => c.id === +pt.dataset.uid);
      });
    }
    this.updateAimPreview();
  }
  computeAim() {
    const A = this.aim, p = this.p, sk = A.sk, b = this.controlScale;
    const maxDrag = 110 * b;
    const len = Math.hypot(A.dx, A.dy);
    // 화면 방향 → 월드 방향 (카메라 정면 = -Z, 오른쪽 = +X)
    let dir = len > 1 ? { x: A.dx / len, z: A.dy / len } : { x: Math.sin(p.facing), z: Math.cos(p.facing) };
    const f = Math.min(1, len / maxDrag);
    let target = null, point;
    if (!A.drag) {
      // 빠른 터치: 자동 조준(시야 내 적만) 또는 정면 / 아군 스킬은 자신
      if (sk.t === 'ally') target = p;
      else if (sk.t !== 'self') {
        const t = this.autoAimTarget(sk);
        if (t) { const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz) || 1; dir = { x: dx / d, z: dz / d }; point = { x: t.x, z: t.z }; target = t; }
      }
    } else if (sk.t === 'ally') {
      target = A.allyPortrait || this.allyAlong(dir, sk.range) || p;
    } else if (sk.t === 'enemy') {
      target = this.enemyAlong(dir, sk.range);
    }
    if (!point) point = sk.t === 'point' ? { x: p.x + dir.x * sk.range * (A.drag ? f : 0.6), z: p.z + dir.z * sk.range * (A.drag ? f : 0.6) } : { x: p.x + dir.x * 3, z: p.z + dir.z * 3 };
    return { dir, point, target };
  }
  autoAimTarget(sk) {
    if (!this.g.settings.autoAim) return this.lock && this.sim.canTarget(this.p, this.lock) ? this.lock : null;
    const p = this.p, r = (sk.range || 4) + (sk.radius || 0) * 0.5;
    // 시야 내 적만 (숨은 적 유도 금지)
    const vis = this.sim.visibleEnemies(p.team, p.x, p.z, r).filter((u) => this.sim.canTarget(p, u));
    if (this.lock && vis.includes(this.lock)) return this.lock;
    const champs = vis.filter((u) => u.kind === 'champion');
    const pool = sk.t === 'enemy' ? champs : champs.length ? champs : vis;
    pool.sort((a, b) => dist(a, p) - dist(b, p));
    return pool[0] || null;
  }
  enemyAlong(dir, range) {
    const p = this.p;
    let best = null, bs = Infinity;
    for (const u of this.sim.visibleEnemies(p.team, p.x, p.z, range + 1)) {
      if (u.kind !== 'champion' || !this.sim.canTarget(p, u)) continue;
      const dx = u.x - p.x, dz = u.z - p.z, d = Math.hypot(dx, dz) || 1;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * dir.x + dz * dir.z) / d)));
      const s = ang * 3 + d * 0.1;
      if (ang < 0.6 && s < bs) { bs = s; best = u; }
    }
    return best;
  }
  allyAlong(dir, range) {
    const p = this.p;
    let best = null, bs = Infinity;
    for (const u of this.sim.champions) {
      if (u === p || u.team !== p.team || u.dead || dist(u, p) > range + 1) continue;
      const dx = u.x - p.x, dz = u.z - p.z, d = Math.hypot(dx, dz) || 1;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * dir.x + dz * dir.z) / d)));
      if (ang < 0.7 && ang < bs) { bs = ang; best = u; }
    }
    return best;
  }
  updateAimPreview() {
    const A = this.aim; if (!A) return;
    const p = this.p;
    const { dir, point, target } = this.computeAim();
    this.w.showAim(p, A.sk, point, dir, A.overCancel);
    this.w.markTarget(target && target !== p ? target : null, A.sk.t === 'ally');
    if (A.sk.t === 'ally' && target === p) this.w.markTarget(p, true);
    // 사거리 끝이 화면 밖이면 카메라를 제한적으로 이동
    const pr = this.w.project(point.x, 0.5, point.z);
    const m = 70;
    const cam = this.w.camera;
    if (pr.x < m || pr.x > innerWidth - m || pr.y < m || pr.y > innerHeight - m) {
      const ox = Math.max(-4, Math.min(4, (point.x - p.x) * 0.45)), oz = Math.max(-4, Math.min(4, (point.z - p.z) * 0.45));
      cam.aimOffset.set(ox, 0, oz);
    }
  }
  endAim(cancelled) {
    const A = this.aim;
    if (!A) return;
    this.aim = null;
    this.els.skills[A.slot].classList.remove('pressed');
    this.els.cancel.classList.add('hidden'); this.els.cancel.classList.remove('hot');
    document.getElementById('m-allies').classList.add('hidden');
    this.w.hideIndicators(); this.w.markTarget(null, true);
    this.w.camera.aimOffset.set(0, 0, 0);
    if (cancelled || A.overCancel) { if (A.overCancel) this.hud.showMsg('시전 취소', true); return; }
    const { point, target } = (() => { this.aim = A; const r = this.computeAim(); this.aim = null; return r; })();
    if (A.sk.t === 'enemy' && !target) { this.hud.showMsg('조준 방향에 대상 영웅이 없습니다'); return; }
    const r = this.sim.cmdCast(this.p, A.slot, { point, target });
    if (!r.ok) this.hud.showMsg(r.reason); else if (r.queued) this.hud.showMsg(r.reason, true);
  }
  update(dt) {
    const p = this.p;
    // 조이스틱 → 직접 이동 (화면 아래 = +Z)
    if (this.joy.active && !this.g.paused) {
      if (Math.hypot(this.joy.x, this.joy.y) > 0.12) this.sim.cmdJoy(p, this.joy.x, this.joy.y);
      else if (p.joy) this.sim.cmdJoy(p, 0, 0);
    }
    if (this.attackHeld && !this.g.paused) { this.atkT = (this.atkT || 0) - dt; if (this.atkT <= 0) { this.atkT = 0.12; this.attackTick(false); } }
    // 대상 고정 해제 조건
    if (this.lock) {
      const t = this.lock;
      if (t.dead || !t.visibleTo[p.team] || dist(t, p) > p.s.range + 9) { this.lock = null; this.hud.showMsg('대상 고정 해제 (시야/사거리 이탈)', true); }
    }
    if (this.aim) this.updateAimPreview();
    else {if(this.attackHeld)this.w.showRange(p,p.s.range);else this.w.rangeVisual.hide();this.w.markTarget(this.lock || (p.target && !p.target.dead && p.target.visibleTo[p.team] ? p.target : null));}
    // 적 초상화 (시야 내 적만, 탭으로 고정)
    this.ptT = (this.ptT || 0) - dt;
    if (this.ptT <= 0) {
      this.ptT = 0.25;
      const box = document.getElementById('m-enemies');
      const vis = this.sim.champions.filter((c) => c.team !== p.team && !c.dead && c.visibleTo[p.team]);
      const key = vis.map((c) => c.id).join(',') + '|' + (this.lock ? this.lock.id : '');
      if (box.dataset.k !== key) {
        box.dataset.k = key;
        box.innerHTML = vis.map((c) => `<div class="pt ${this.lock === c ? 'lock' : ''}" data-uid="${c.id}"><img src="${this.g.portraits[c.def.id]}"><div class="hp"></div></div>`).join('');
        box.querySelectorAll('.pt').forEach((el) => el.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); const c = this.sim.champions.find((x) => x.id === +el.dataset.uid); this.lock = c; this.sim.cmdAttack(p, c); this.hud.showMsg(`${c.name} 대상 고정`, true); box.dataset.k = ''; }));
      }
      box.querySelectorAll('.pt').forEach((el) => { const c = this.sim.champions.find((x) => x.id === +el.dataset.uid); if (c) el.querySelector('.hp').style.width = (c.hp / c.s.hp) * 100 + '%'; });
    }
    // 레벨업 버튼
    for (const s of SLOTS) this.els.skills[s].querySelector('.lvlup').classList.toggle('hidden', !(p.skillPoints > 0 && this.g.canLevel(s)));
  }
}
