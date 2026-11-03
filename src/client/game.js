// 게임 컨트롤러: 고정 틱 시뮬레이션 + 렌더 루프 + 플랫폼 입력 연결
import { Sim, TICK } from '../sim/sim.js';
import { ChampionAI } from '../sim/ai.js';
import { R_LEVELS } from '../data/champions.js';
import { World } from './world.js';
import { HUD } from './hud.js';
import { PCInput, TouchInput } from './input.js';
import { audio } from './audio.js';
import { QUALITY } from '../render/scene.js';
import { applySnapshot } from '../net/wire.js';

export class Game {
  constructor({ renderer, picks, settings, portraits, mobile, seed, onEnd, onProgress, online }) {
    this.online = online || null;
    this.renderer = renderer; this.settings = settings; this.portraits = portraits; this.mobile = mobile; this.onEnd = onEnd;
    this.picks = picks;
    this.sim = new Sim({ seed: seed ?? (Math.random() * 1e9) | 0, picks });
    if (online) applySnapshot(this.sim, online.initialState, online.id);
    this.player = this.sim.player;
    if (!online) { this.player.autoLevel = settings.autoLevel; this.sim.levelUpSkillsAuto(this.player); }
    this.ais = online ? [] : this.sim.champions.filter((c) => !c.isPlayer).map((c) => new ChampionAI(this.sim, c));
    this.autopilot = null;
    this.q = QUALITY[settings.quality] || QUALITY.medium;
    this.world = new World(renderer, this.q, settings);
    this.world.build(this.sim, this.player.team, onProgress);
    this.world.camera.shakeScale = settings.shake;
    // 시작 시 카메라를 내 캐릭터에 즉시 맞춤
    this.world.camera.goal.set(this.player.x, 0, this.player.z); this.world.camera.target.copy(this.world.camera.goal);
    this.hud = new HUD(this);
    if (online) online.attach(this);
    this.input = mobile ? new TouchInput(this) : new PCInput(this);
    this.paused = false; this.over = false; this.acc = 0; this.last = performance.now();
    this.perf = { frames: 0, t: 0, fps: 0, minFps: 999, samples: [] };
    this.resize();
    this._onResize = () => this.resize();
    this._onVis = () => this.onVisibility();
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVis);
    window.GAME = this;
    audio.startMusic('battle');
    this.hud.announce('전장에 오신 것을 환영합니다 — 미니언·몬스터 생성까지 10초', 'neutral');
  }
  resize() {
    const W = innerWidth, H = innerHeight;
    this.renderer.setSize(W, H, false);
    this.world.camera.setAspect(W / H);
    document.documentElement.style.setProperty('--ui', this.settings.uiScale);
    if (this.mobile && this.world.camera) { this.world.camera.dist = 24; this.world.camera.minDist = 24; this.world.camera.maxDist = 24; }
  }
  onVisibility() {
    if (document.hidden) {
      this.input.releaseAll?.();
      this.bgPaused = true;
      audio.suspend();
    } else {
      this.bgPaused = false;
      this.last = performance.now(); this.acc = 0;
      this.input.releaseAll?.();
      audio.resume();
    }
  }
  setPaused(v) { this.paused = v; this.last = performance.now(); this.acc = 0; }
  applySetting(k, v) {
    const S = this.settings;
    S[k] = v;
    try { localStorage.setItem('lopjh_settings', JSON.stringify(S)); } catch (e) {}
    if (k === 'shake') this.world.camera.shakeScale = v;
    if (k === 'uiScale') document.documentElement.style.setProperty('--ui', v);
    if (k === 'autoLevel') { if(this.online) this.online.command({action:'autoLevel',value:v}); else { this.player.autoLevel = v; this.sim.levelUpSkillsAuto(this.player); } }
    if (k === 'quality') {
      const q = QUALITY[v];
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
      this.renderer.shadowMap.enabled = q.shadow > 0;
      this.world.sun.castShadow = q.shadow > 0;
      if (q.shadow) { this.world.sun.shadow.mapSize.set(q.shadow, q.shadow); this.world.sun.shadow.map?.dispose(); this.world.sun.shadow.map = null; }
      this.world.q.particles = q.particles; this.q = q;
      this.renderer.setSize(innerWidth, innerHeight, false);
    }
    if (k === 'volMaster' || k === 'volSfx' || k === 'volMusic') { audio.vol = { master: S.volMaster, sfx: S.volSfx, music: S.volMusic }; audio.applyVol(); }
    if (['btnSize', 'btnAlpha', 'joySize', 'joyPos', 'mirror'].includes(k) && this.input.layout) this.input.layout();
    if (k === 'touch') { this.hud.showMsg('조작 방식은 다음 경기부터 적용됩니다', true); }
    if (k === 'flash') this.renderer.toneMappingExposure = 0.9 + v * 0.08;
  }
  canLevel(slot) {
    const p = this.player, lv = p.skillLv[slot];
    if (slot === 'R') return lv < R_LEVELS.filter((l) => p.level >= l).length;
    return lv < 5 && lv < Math.ceil(p.level / 2);
  }
  levelSkill(slot) { if (this.sim.cmdLevel(this.player, slot)) audio.play('level', 0.5); else this.hud.showMsg('지금은 이 스킬을 올릴 수 없습니다'); }
  useItem(i) {
    const id = this.player.items[i];
    if (id === 'potion') { const r = this.sim.cmdUsePotion(this.player); if (!r.ok) this.hud.showMsg(r.reason); }
    else if (id) this.hud.showMsg('사용 효과가 없는 아이템입니다');
  }
  surrender() {
    if (this.over) return;
    if (this.online) { this.online.send({type:'leave'}); return; }
    this.sim.over = true; this.sim.winner = 1 - this.player.team; this.sim.endTime = this.sim.time; this.surrendered = true;
    this.finish();
  }
  finish() {
    if (this.over) return;
    this.over = true;
    const win = this.sim.winner === this.player.team;
    audio.stopMusic();
    audio.play(win ? 'victory' : 'defeat');
    this.endTimer=setTimeout(() => this.onEnd && this.onEnd({ win, sim: this.sim, player: this.player, surrendered: this.surrendered }), this.surrendered ? 300 : 3200);
  }
  enableAutopilot() { if (!this.autopilot) this.autopilot = new ChampionAI(this.sim, this.player); }
  // 검증용: 렌더 없이 고속 진행
  fastForward(seconds) {
    const end = this.sim.time + seconds;
    while (this.sim.time < end && !this.sim.over) this.tickOnce();
    this.sim.events.length = 0;
    this.world.camera.goal.set(this.player.x, 0, this.player.z); this.world.camera.target.copy(this.world.camera.goal);
    this.hud.annT = 0;
  }
  tickOnce() {
    if (this.online) return;
    for (const a of this.ais) a.think(TICK);
    if (this.autopilot) this.autopilot.think(TICK);
    this.sim.step(TICK);
  }
  processEvents() {
    const ev = this.sim.events;
    if (!ev.length) return;
    this.world.handleEvents(ev, this.player);
    for (const e of ev) {
      if (e.type === 'killfeed') this.hud.killfeed(e);
      else if (e.type === 'announce') this.hud.announce(e.text, e.team == null ? 'neutral' : e.team === this.player.team ? 'ally' : 'enemy');
      else if (e.type === 'blocked' && e.t) this.hud.showMsg(e.t.kind === 'nexus' ? '앞선 포탑을 먼저 파괴해야 핵심 수정을 공격할 수 있습니다' : '앞선 포탑을 먼저 파괴해야 합니다');
      else if (e.type === 'level' && e.u === this.player) this.hud.showMsg(`레벨 ${e.u.level} 달성${e.u.skillPoints > 0 ? ' — 스킬 포인트 사용 가능' : ''}`, true);
      else if (e.type === 'respawn' && e.u === this.player) this.hud.showMsg('부활했습니다', true);
      else if (e.type === 'end') this.finish();
    }
    ev.length = 0;
  }
  frame() {
    const now = performance.now();
    let dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.bgPaused) return;
    if (!this.online && !this.paused && !this.over) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= TICK && n < 6) { this.tickOnce(); this.acc -= TICK; n++; this.processEvents(); }
      if (n >= 6) this.acc = 0;
    } else if (this.over) { this.processEvents(); }
    if (this.sim.over && !this.over) this.finish();
    const alpha = this.acc / TICK;
    if (!this.online || (this.online.connected && this.online.running)) this.input.update(dt);
    this.world.update(this.paused && !this.online ? 0 : dt, alpha, this.player);
    this.hud.update(dt);
    this.world.render();
    this.world.drawOverlay(dt, this.player, this.mobile ? 1.1 * this.settings.uiScale : this.settings.uiScale);
    if(this.online){const e=document.getElementById('online-game-status');if(e)e.textContent=!this.online.connected||performance.now()-this.online.lastSnapshot>5000?'연결 복구 중…':!this.online.running&&!this.over?'참가자 로딩 대기 중…':`온라인 · ${this.online.latency??'—'} ms`;}
    // 성능 측정
    const P = this.perf; P.frames++; P.t += dt;
    if (P.t >= 1) { P.fps = P.frames / P.t; P.samples.push(Math.round(P.fps)); if (P.samples.length > 600) P.samples.shift(); if (this.sim.time > 5) P.minFps = Math.min(P.minFps, P.fps); P.frames = 0; P.t = 0; const d = document.getElementById('fps'); if (d) d.textContent = `${Math.round(P.fps)} fps · ${this.renderer.info.render.calls} draw · ${(this.renderer.info.render.triangles / 1000).toFixed(0)}k tri`; }
  }
  destroy() {
    clearTimeout(this.endTimer);
    if(this.online?.game===this)this.online.game=null;
    this.world.fx.hero.dispose();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVis);
    this.input.destroy();
    audio.stopMusic();
  }
}
