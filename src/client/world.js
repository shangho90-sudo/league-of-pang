// 게임 월드 렌더링: 정적 전장 + 유닛 뷰 + 이펙트 + 안개 + 오버레이(체력바·피해 숫자)
import * as THREE from 'three';
import { TURRETS, BASES, MAP_HALF, TEAM_COLORS } from '../map/layout.js';
import { groundHeight, brushAt } from '../map/grid.js';
import { makeGroundTextures, makeFxTextures } from '../render/textures.js';
import { buildTerrain, buildWater, bakeCanopyAO, sharedUniforms, fowData, fowTexture, FOW_RES } from '../render/terrain.js';
import { buildProps } from '../render/props.js';
import { buildFountain, buildShop, buildBanner } from '../render/structures.js';
import { createScene, QuarterCamera, updateSunFollow, applyEnvironment } from '../render/scene.js';
import { weaponTip } from '../render/champVisual.js';
import { ChampionView, MinionView, MonsterView, TurretView, NexusView, DecoyView } from './units.js';
import { FX } from './fx.js';
import { audio } from './audio.js';
import { RangeIndicators } from '../render/rangeIndicators.js';

const STATUS_LABEL = { stun: ['기절', '#ffd84a'], airborne: ['공중', '#ffb04a'], root: ['속박', '#8adf5a'], slow: ['둔화', '#6ab0ff'], silence: ['침묵', '#c08aff'], haste: ['가속', '#7af0e0'], fortress: ['요새', '#c0c8d8'], sanctum: ['성역', '#ffe08a'], untargetable: ['무적', '#b06aff'], mark: ['표식', '#b06aff'], aim: ['조준', '#9ae8ff'], chaseR: ['추적', '#9adf5a'], hot: ['회복', '#6af08a'], armorUp: ['방어', '#c0c8d8'] };
const SHOW_STATUS = ['stun', 'airborne', 'root', 'slow', 'silence', 'untargetable', 'mark', 'haste', 'fortress', 'sanctum', 'hot'];

export class World {
  constructor(renderer, quality, settings) {
    this.renderer = renderer; this.q = quality; this.settings = settings;
    const { scene, sun } = createScene(quality);
    this.scene = scene; this.sun = sun;
    applyEnvironment(renderer, scene);
    this.camera = new QuarterCamera(innerWidth / innerHeight);
    this.views = new Map();
    this.floating = [];
    this.fowSmooth = new Float32Array(FOW_RES * FOW_RES).fill(0);
    this.time = 0;
    this.overlay = document.getElementById('overlay');
    this.octx = this.overlay.getContext('2d');
    this.clickMarks = [];
    this.indicator = new THREE.Group(); this.scene.add(this.indicator);
    this.buildIndicators();
  }
  build(sim, playerTeam, onProgress = () => {}) {
    this.sim = sim; this.playerTeam = playerTeam;
    const tex = makeGroundTextures(); onProgress(0.2);
    const props = buildProps(this.q); this.scene.add(props.group); this.propStats = props.stats; onProgress(0.4);
    this.scene.add(buildTerrain(tex, this.q, bakeCanopyAO(props.aoPoints))); onProgress(0.6);
    this.scene.add(buildWater());
    this.treeMats = [];
    props.group.traverse((o) => { if (o.isInstancedMesh && o.material && !this.treeMats.includes(o.material)) this.treeMats.push(o.material); });
    for (const b of BASES) {
      const f = buildFountain(b.team); f.position.set(b.fountain.x, 0, b.fountain.z); this.scene.add(f);
      const s = buildShop(b.team); s.position.set(b.shop.x, 0, b.shop.z); s.rotation.y = b.team === 0 ? Math.PI * 0.5 : -Math.PI * 0.5; this.scene.add(s);
      for (const [dx, dz] of [[6, -3], [-3, 6], [9, 2], [2, 9]]) { const bn = buildBanner(b.team); const sx = b.team === 0 ? 1 : -1; bn.position.set(b.center.x + dx * sx, 0, b.center.z - dz * sx); bn.rotation.y = Math.random() * 6; this.scene.add(bn); }
    }
    this.fx = new FX(this.scene, makeFxTextures(), this.q, playerTeam);
    onProgress(0.8);
  }
  buildIndicators() {
    this.rangeVisual = new RangeIndicators(this.scene,this.q);
    const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
    this.ind = {
      target: new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32).rotateX(-Math.PI / 2), mat(0xff5a4a, 0.9)),
      allyTarget: new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32).rotateX(-Math.PI / 2), mat(0x6af08a, 0.95)),
    };
    for (const m of Object.values(this.ind)) { m.visible = false; m.renderOrder = 7; this.indicator.add(m); }
  }
  hideIndicators() { this.rangeVisual.hide();for (const m of Object.values(this.ind)) m.visible = false; }
  // 스킬 조준 표시 (판정과 같은 수치 사용)
  showAim(u, sk, point, dir, invalid = false) {
    this.hideIndicators();
    this.rangeVisual.aim(u,sk,point,dir,invalid);
  }
  showRange(u, r) { this.rangeVisual.showRange(u,r); }
  markTarget(t, ally = false) {
    const m = ally ? this.ind.allyTarget : this.ind.target;
    if (!t) { m.visible = false; return; }
    m.visible = true; m.position.set(t.x, groundHeight(t.x, t.z) + 0.12, t.z); m.scale.setScalar(Math.max(0.7, t.r * 1.3));
    m.rotation.y = this.time * 2;
  }
  clickMarker(x, z, color = 0x7af0a0) { this.fx.ring(x, z, 0.9, 0.2, color, 0.4, { y: groundHeight(x, z) + 0.12 }); }

  isVisibleAt(x, z) {
    const i = Math.floor(x + MAP_HALF), j = Math.floor(z + MAP_HALF);
    if (i < 0 || j < 0 || i >= FOW_RES || j >= FOW_RES) return false;
    return this.sim.visGrid[this.playerTeam][j * FOW_RES + i] === 1;
  }
  unitVisible(u) { return u.team === this.playerTeam || u.visibleTo[this.playerTeam]; }
  viewFor(u) {
    let v = this.views.get(u.id);
    if (v) return v;
    const pt = this.playerTeam;
    if (u.kind === 'champion') v = new ChampionView(u, pt, u.isPlayer);
    else if (u.kind === 'minion') v = new MinionView(u, pt);
    else if (u.kind === 'monster') v = new MonsterView(u);
    else if (u.kind === 'turret') v = new TurretView(u);
    else if (u.kind === 'nexus') v = new NexusView(u);
    else if (u.kind === 'decoy') v = new DecoyView(u);
    if (!v) return null;
    this.scene.add(v.root);
    this.views.set(u.id, v);
    return v;
  }
  tipOf(u) {
    const v = this.views.get(u.id);
    if (!v) return null;
    if (v instanceof ChampionView) return weaponTip(v.v, new THREE.Vector3());
    if (v instanceof TurretView) return new THREE.Vector3(u.x, groundHeight(u.x, u.z) + 4.35, u.z);
    return new THREE.Vector3(u.x, groundHeight(u.x, u.z) + 0.9, u.z);
  }
  updateFog(dt) {
    const g = this.sim.visGrid[this.playerTeam];
    const k = 1 - Math.exp(-dt * 8);
    for (let i = 0; i < g.length; i++) {
      const v = this.fowSmooth[i] + (g[i] - this.fowSmooth[i]) * k;
      this.fowSmooth[i] = v;
      fowData[i * 4] = Math.round(v * 255);
    }
    fowTexture.needsUpdate = true;
  }

  // ---------- 이벤트 → 이펙트·사운드 ----------
  combatSound(u,kind,player){
    if(!u?.def||!this.unitVisible(u))return false;
    const center=this.camera.target,dx=u.x-center.x,dz=u.z-center.z,d=Math.hypot(dx,dz);
    if(d>30)return true;
    return audio.playCombat(u.def.id,kind,{unitId:u.id,volume:u===player?1:Math.max(.08,.55*(1-d/30)),pan:(dx+dz)/24});
  }
  handleEvents(events, player) {
    const fx = this.fx;
    const visAt = (x, z) => this.isVisibleAt(x, z);
    for (const e of events) {
      switch (e.type) {
        case 'attackStart': if(e.u.kind==='champion')this.combatSound(e.u,'attack',player);break;
        case 'dmg': {
          const t = e.t, s = e.src;
          const vis = this.unitVisible(t);
          if (!vis) break;
          if(t.kind==='champion'&&e.amt>0)this.combatSound(t,'hit',player);
          const y = groundHeight(t.x, t.z) + (t.kind === 'turret' ? 3 : 1.0);
          const col = e.dmgType === 'magic' ? 0xb48aff : e.dmgType === 'true' ? 0xffffff : 0xffc27a;
          if (e.basic) {
            if(s.kind==='champion' && this.unitVisible(s)) fx.hero.basic(s,t,this.tipOf(s));
            fx.burst(t.x, y, t.z, s.kind === 'champion' ? 6 : 3, { color: col, tex: 'spark', speed: 3, life: 0.25, size: 0.35, elev: 0.4 });
            if (s.kind === 'champion' && !s.def.stats.ranged) {
              const a = s.def.arche;
              const d = { x: Math.sin(s.facing), z: Math.cos(s.facing) };
              const accent = s.def.accent;
              if (a === 'hammer') { fx.ring(t.x, t.z, 0.3, 1.3, 0xffb06a, 0.3); fx.burst(t.x, y - 0.6, t.z, 8, { color: 0xffa040, tex: 'spark', speed: 4, life: 0.35, g: 8, size: 0.25 }); }
              else if (a === 'dual') {
                // 쌍검: 넓게 휘두르는 두 줄기 베기 궤적 + 흰 심선 + 파편
                const gy0 = groundHeight(s.x, s.z), R = s.def.stats.range + 0.9;
                fx.arc(s.x, gy0 + 1.15, s.z, d, R, 170, accent, 0.24, 0.62);
                fx.arc(s.x, gy0 + 0.8, s.z, d, R * 0.92, 150, 0xffffff, 0.16, 0.26);
                fx.burst(t.x, y, t.z, 10, { color: accent, tex: 'shard', speed: 6, life: 0.3, size: 0.32, elev: 0.3, spin: 10 });
                audio.play('swing', 0.6);
              }
              else fx.arc(s.x, groundHeight(s.x, s.z) + 1.0, s.z, d, s.def.stats.range + 0.5, a === 'spear' ? 30 : 140, accent, 0.18, a === 'spear' ? 0.25 : 0.4);
              audio.play(a === 'hammer' || a === 'shield' ? 'hitHeavy' : 'hitPhys', s.isPlayer || t.isPlayer ? 1 : 0.4);
            } else if (s.kind === 'champion') audio.play(e.dmgType === 'magic' ? 'hitMagic' : 'hitPhys', s.isPlayer || t.isPlayer ? 0.8 : 0.3);
            else if (s.kind === 'turret') audio.play('hitHeavy', 0.4);
          } else {
            fx.burst(t.x, y, t.z, 5, { color: col, tex: 'soft', speed: 2, life: 0.3, size: 0.45 });
          }
          if (player && (s === player || t === player)) {
            const big = e.amt > 150;
            this.float(t, Math.round(e.amt).toString(), t === player ? '#ff6a5a' : e.dmgType === 'magic' ? '#c8a8ff' : e.dmgType === 'true' ? '#ffffff' : '#ffd8a0', big ? 1.35 : 1);
          }
          if (t === player && e.amt > 120) this.camera.addShake(0.15 * this.settings.shake);
          break;
        }
        case 'heal': if (e.amt > 4 && this.unitVisible(e.t)) { if (e.t === player || e.src === player) this.float(e.t, '+' + Math.round(e.amt), '#7af08a'); fx.burst(e.t.x, 1.2, e.t.z, 4, { color: 0x7af0a0, tex: 'soft', speed: 1, vy: 1.5, life: 0.6, size: 0.3 }); } break;
        case 'shield': if (this.unitVisible(e.t)) { fx.ring(e.t.x, e.t.z, 0.4, 1.0, 0xe8f4ff, 0.35, { y: groundHeight(e.t.x, e.t.z) + 0.15 }); audio.play('shield', e.src === player || e.t === player ? 1 : 0.4); } break;
        case 'gold': if (e.u === player) { this.float({ x: e.x, z: e.z }, '+' + e.amt + 'G', '#ffd24a', 0.9, 2.3); audio.play('gold', 0.6); } break;
        case 'level': if (this.unitVisible(e.u)) { fx.column(e.u.x, e.u.z, 0xffe08a, 0.9, 3, 0.7); if (e.u === player) audio.play('level'); } break;
        case 'death': {
          const u = e.u;
          if (!this.unitVisible(u) && u.kind !== 'turret') break;
          const y = groundHeight(u.x, u.z);
          if (u.kind === 'champion') { fx.burst(u.x, y + 1, u.z, 22, { color: u.team === this.playerTeam ? 0x7ab8ff : 0xff7a6a, tex: 'soft', speed: 3, life: 0.9, size: 0.5 }); audio.play('death', u === player ? 1 : 0.6); }
          else if (u.kind === 'turret' || u.kind === 'nexus') { fx.burst(u.x, y + 3, u.z, 40, { color: 0x9aa4b0, tex: 'smoke', additive: false, speed: 4, life: 1.6, size: 1.4, g: -0.5 }); fx.burst(u.x, y + 3, u.z, 30, { color: TEAM_COLORS[u.team].main, tex: 'shard', speed: 6, life: 1.0, size: 0.4, g: 9 }); audio.play('boom'); this.camera.addShake(0.4 * this.settings.shake); }
          else fx.burst(u.x, y + 0.6, u.z, 6, { color: 0xaaaaaa, tex: 'smoke', additive: false, speed: 1, life: 0.6, size: 0.4 });
          break;
        }
        case 'proj': if (e.p.src.kind === 'champion' && (e.p.src === player || this.unitVisible(e.p.src))) audio.play(e.p.vis === 'arrow' || e.p.vis === 'pierceArrow' ? 'arrow' : 'zap', e.p.src === player ? 0.7 : 0.25); else if (e.p.vis === 'turret' && this.isVisibleAt(e.p.x, e.p.z)) audio.play('turret', 0.4); break;
        case 'cast': if (e.u === player || this.unitVisible(e.u)) { fx.hero.cast(e.u,e.slot); if(!this.combatSound(e.u,e.slot,player))audio.play(e.slot === 'R' ? 'ult' : 'cast', e.u === player ? 1 : 0.4); if (e.slot === 'R') fx.ring(e.u.x, e.u.z, 0.5, 2.2, e.u.def.accent, 0.5, { y: groundHeight(e.u.x, e.u.z) + 0.15 }); } break;
        case 'recall': audio.play('recall', e.u === player ? 1 : 0.2); break;
        case 'recallDone': fx.column(e.u.x, e.u.z, TEAM_COLORS[e.u.team].main, 0.8, 4, 0.9); break;
        case 'fx': if (e.x == null || visAt(e.x, e.z) || (e.u && this.unitVisible(e.u))) this.namedFx(e); break;
      }
    }
  }
  float(u, text, color, scale = 1, yOff = 2.4) {
    this.floating.push({ x: u.x + (Math.random() - 0.5) * 0.4, z: u.z, y: groundHeight(u.x, u.z) + yOff, text, color, t: 0, life: 0.95, scale, vx: (Math.random() - 0.5) * 0.6 });
  }
  namedFx(e) {
    const fx = this.fx, gy = (x, z) => groundHeight(x, z);
    const modeled=fx.hero.named(e);
    const U = e.u;
    const at = (o) => ({ x: o.x, y: gy(o.x, o.z), z: o.z });
    switch (e.name) {
      case 'frostHit': { const p = at(e); fx.burst(p.x, p.y + 0.9, p.z, 12, { color: 0xdff8ff, tex: 'shard', speed: 4, elev: 0.5, g: 8, life: 0.45, size: 0.22, spin: 8 }); fx.ring(p.x, p.z, 0.2, 0.9, 0x9fe8ff, 0.3, { y: p.y + 0.12 }); audio.play('glass', 0.5); break; }
      case 'frostBloom': { const p = at(e); fx.ring(p.x, p.z, 0.3, e.r, 0xbff0ff, 0.5, { y: p.y + 0.13 }); fx.burst(p.x, p.y + 0.2, p.z, 16, { color: 0xeafcff, tex: 'shard', speed: 3, elev: 0.6, g: 6, life: 0.6, size: 0.25, spin: 6, floor: p.y + 0.05 }); audio.play('glass', 0.4); break; }
      case 'iceSlide': { const y = gy(U.x, U.z); fx.ring(U.x, U.z, 0.2, 1.0, 0x9fe8ff, 0.35, { y: y + 0.12 }); for (let i = 0; i < 8; i++) fx.particle({ x: U.x + (Math.random() - 0.5) * 0.6, y: y + 0.15, z: U.z + (Math.random() - 0.5) * 0.6, color: 0xdff8ff, tex: 'shard', size: 0.25, life: 0.6, vy: 0.4, spin: 5 }); audio.play('swing'); break; }
      case 'absoluteZeroCharge': { const p = at(e); fx.ring(p.x, p.z, e.r, e.r * 0.25, 0x9fe8ff, e.dur, { y: p.y + 0.14, alpha: 0.6 }); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; fx.particle({ x: p.x + Math.cos(a) * e.r, y: p.y + 0.3, z: p.z + Math.sin(a) * e.r, vx: -Math.cos(a) * e.r / e.dur, vz: -Math.sin(a) * e.r / e.dur, color: 0xcff6ff, tex: 'soft', size: 0.3, life: e.dur, a: 0.8 }); } break; }
      case 'absoluteZero': { const p = at(e); fx.ring(p.x, p.z, 0.3, e.r, 0xeafcff, 0.55, { y: p.y + 0.15 }); fx.ring(p.x, p.z, 0.2, e.r * 0.7, 0x7fd8ff, 0.45, { y: p.y + 0.14, alpha: 0.6 }); for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, r = e.r * (0.3 + Math.random() * 0.6); fx.column(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 0xcff6ff, 0.7, 1.4, 0.18); } fx.burst(p.x, p.y + 0.4, p.z, 30, { color: 0xeafcff, tex: 'shard', speed: 6, elev: 0.6, g: 10, life: 0.8, size: 0.3, spin: 8, floor: p.y + 0.05 }); audio.play('boom', 0.6); this.camera.addShake(e.shake * this.settings.shake); break; }
      case 'freeze': { const p = at(e); fx.column(p.x, p.z, 0xbff0ff, 0.8, 2.0, 0.55); fx.burst(p.x, p.y + 1.0, p.z, 14, { color: 0xffffff, tex: 'shard', speed: 3, life: 0.6, size: 0.25, spin: 6 }); audio.play('glass', 0.7); break; }
      case 'chillStack': { const p = at(e); fx.burst(p.x, p.y + 1.6, p.z, 3 + e.n * 2, { color: 0xbff0ff, tex: 'soft', speed: 1, life: 0.5, size: 0.2 }); break; }
      case 'fireBurst': { const p = at(e); fx.ring(p.x, p.z, 0.3, e.r, 0xff7a2a, 0.35, { y: p.y + 0.13 }); fx.burst(p.x, p.y + 0.6, p.z, 20, { color: 0xffa040, tex: 'soft', speed: 4, elev: 0.6, life: 0.45, size: 0.5 }); fx.burst(p.x, p.y + 0.6, p.z, 10, { color: 0xfff0b0, tex: 'spark', speed: 6, elev: 0.6, g: 8, life: 0.4, size: 0.25 }); fx.burst(p.x, p.y + 0.5, p.z, 6, { color: 0x4a3a32, tex: 'smoke', additive: false, speed: 1.5, vy: 1, life: 0.9, size: 0.8, a: 0.5 }); audio.play('boom', 0.45); break; }
      case 'pillarCharge': { const p = at(e); fx.ring(p.x, p.z, e.r * 0.2, e.r, 0xff6a1a, e.dur, { y: p.y + 0.13, alpha: 0.7 }); for (let i = 0; i < 8; i++) fx.particle({ x: p.x + (Math.random() - 0.5) * e.r, y: p.y + 0.1, z: p.z + (Math.random() - 0.5) * e.r, color: 0xff8a2a, tex: 'spark', size: 0.2, vy: 1.5, life: e.dur }); break; }
      case 'firePillar': { const p = at(e); fx.column(p.x, p.z, 0xff6a1a, 0.7, 4.2, e.r * 0.75); fx.column(p.x, p.z, 0xffe08a, 0.5, 3.6, e.r * 0.35); fx.burst(p.x, p.y + 0.4, p.z, 24, { color: 0xffa040, tex: 'soft', speed: 2.5, vy: 6, life: 0.7, size: 0.55 }); fx.ring(p.x, p.z, 0.3, e.r * 1.2, 0xff8a2a, 0.35, { y: p.y + 0.13 }); audio.play('boom', 0.55); this.camera.addShake(e.shake * this.settings.shake); break; }
      case 'fireDash': { const y = gy(U.x, U.z); fx.burst(U.x, y + 0.5, U.z, 12, { color: 0xff8a2a, tex: 'soft', speed: 2.5, vy: 1.5, life: 0.5, size: 0.45 }); audio.play('swing'); break; }
      case 'fireTrailFx': { for (let k = 0; k <= 6; k++) { const x = e.x + e.dir.x * e.len * (k / 6), z = e.z + e.dir.z * e.len * (k / 6); fx.burst(x, gy(x, z) + 0.2, z, 3, { color: 0xffb23a, tex: 'soft', speed: 1, vy: 2, life: 0.5, size: 0.45 }); } break; }
      case 'firestormStart': { const p = at(e); fx.ring(p.x, p.z, 0.4, e.r, 0xff5a1a, 0.6, { y: p.y + 0.14 }); audio.play('boom', 0.4); break; }
      case 'firestormEnd': { const p = at(e); fx.ring(p.x, p.z, 0.3, e.r * 1.1, 0xffe08a, 0.5, { y: p.y + 0.15 }); fx.burst(p.x, p.y + 0.6, p.z, 40, { color: 0xff8a2a, tex: 'soft', speed: 7, elev: 0.5, life: 0.6, size: 0.7 }); fx.burst(p.x, p.y + 0.5, p.z, 14, { color: 0x3a2e28, tex: 'smoke', additive: false, speed: 2.5, vy: 1.5, life: 1.2, size: 1.2, a: 0.55 }); audio.play('boom'); this.camera.addShake(e.shake * this.settings.shake); break; }
      case 'burnTick': { const p = at(e); fx.burst(p.x, p.y + 1.0, p.z, 3, { color: 0xff8a2a, tex: 'soft', speed: 0.6, vy: 1.4, life: 0.5, size: 0.3 }); break; }
      case 'glassBurst': { const p = at(e); fx.burst(p.x, p.y + 0.3, p.z, 18, { color: 0xdffbff, tex: 'shard', speed: 5, elev: 0.7, g: 12, life: 0.7, size: 0.22, spin: 10, floor: p.y + 0.05 }); fx.burst(p.x, p.y + 0.2, p.z, 16, { color: e.color, tex: 'drop', speed: 3.5, elev: 0.8, g: 10, life: 0.8, size: 0.3, floor: p.y + 0.05 }); fx.ring(p.x, p.z, 0.4, e.r, e.color, 0.4, { y: p.y + 0.12 }); audio.play('glass'); break; }
      case 'healBurst': { fx.column(U.x, U.z, e.color, 0.7, 2.6, 0.55); fx.burst(U.x, gy(U.x, U.z) + 0.5, U.z, 14, { color: e.color, tex: 'drop', speed: 1.5, vy: 2.5, life: 0.9, size: 0.25 }); audio.play('heal'); break; }
      case 'gooSplash': { const p = at(e); fx.burst(p.x, p.y + 0.2, p.z, 20, { color: 0x3ac8a8, tex: 'drop', speed: 3, elev: 0.5, g: 9, life: 0.7, size: 0.35, additive: false, floor: p.y + 0.05 }); break; }
      case 'grandElixir': { const p = at(e); fx.ring(p.x, p.z, 0.6, e.r, 0x7af0e0, 0.8, { y: p.y + 0.15 }); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; fx.column(p.x + Math.cos(a) * e.r * 0.75, p.z + Math.sin(a) * e.r * 0.75, 0x9af8e8, 1.2, 2.2, 0.15); } audio.play('heal'); break; }
      case 'shieldBash': { const p = at(e); fx.arc(p.x, p.y + 0.8, p.z, e.dir, 1.6, 110, 0xff9a4a, 0.22, 0.6); fx.burst(p.x, p.y + 0.8, p.z, 10, { color: 0xffb06a, tex: 'spark', speed: 5, life: 0.3, size: 0.3 }); audio.play('hitHeavy'); this.camera.addShake(0.08 * this.settings.shake); break; }
      case 'fortress': fx.ring(U.x, U.z, 0.4, 1.4, 0xc0c8d8, 0.6, { y: gy(U.x, U.z) + 0.15 }); break;
      case 'ironShield': fx.ring(U.x, U.z, 0.3, 1.1, 0xff8a2a, 0.5, { y: gy(U.x, U.z) + 0.15 }); break;
      case 'dust': for (let i = 0; i < 6; i++) fx.particle({ x: U.x + (Math.random() - 0.5), y: gy(U.x, U.z) + 0.2, z: U.z + (Math.random() - 0.5), color: 0xb8a080, tex: 'smoke', additive: false, size: 0.7, life: 0.7, vy: 0.5, a: 0.6 }); break;
      case 'impact': fx.burst(e.x, gy(e.x, e.z) + 1, e.z, e.big ? 16 : 8, { color: e.color, tex: 'spark', speed: e.big ? 6 : 4, life: 0.35, size: e.big ? 0.5 : 0.35 }); if (e.big) fx.ring(e.x, e.z, 0.3, 1.6, e.color, 0.35, { y: gy(e.x, e.z) + 0.15 }); break;
      case 'groundSlam': { const p = at(e); fx.ring(p.x, p.z, 0.4, e.r, e.color, 0.45, { y: p.y + 0.15 }); fx.burst(p.x, p.y + 0.3, p.z, 14, { color: 0x9a8a70, tex: 'smoke', additive: false, speed: 3, elev: 0.3, life: 0.8, size: 0.8, a: 0.7 }); audio.play('hitHeavy'); this.camera.addShake(0.2 * this.settings.shake); break; }
      case 'chargeTrail': for (let i = 0; i < 12; i++) setTimeout(() => !U.dead && fx.particle({ x: U.x, y: gy(U.x, U.z) + 0.8, z: U.z, color: e.color, tex: 'soft', size: 1.0, life: 0.4, a: 0.6 }), i * 40); break;
      case 'afterimage': fx.burst(U.x, gy(U.x, U.z) + 1, U.z, 10, { color: 0x8a5aff, tex: 'soft', speed: 1, life: 0.5, size: 0.6, a: 0.6 }); break;
      case 'phantomRing': { for (const p of e.pts) { fx.burst(p.x, gy(p.x, p.z) + 1, p.z, 8, { color: 0xb06aff, tex: 'soft', speed: 0.6, life: 0.9, size: 0.7, a: 0.7 }); fx.column(p.x, p.z, 0x8a5aff, 0.9, 2, 0.35); } audio.play('ult'); break; }
      case 'phantomSlash': { const d = { x: e.x - e.from.x, z: e.z - e.from.z }; const m = Math.hypot(d.x, d.z) || 1; fx.arc(e.from.x, gy(e.x, e.z) + 1, e.from.z, { x: d.x / m, z: d.z / m }, 2.2, 60, 0xd0a0ff, 0.2, 0.3); fx.burst(e.x, gy(e.x, e.z) + 1, e.z, 10, { color: 0xc08aff, tex: 'spark', speed: 5, life: 0.3, size: 0.4 }); audio.play('swing'); break; }
      case 'markPop': fx.burst(e.x, gy(e.x, e.z) + 1.2, e.z, 10, { color: 0xb06aff, tex: 'shard', speed: 3, life: 0.4, size: 0.3 }); break;
      case 'decoyPop': fx.burst(e.x, gy(e.x, e.z) + 1, e.z, 12, { color: 0x8a5aff, tex: 'soft', speed: 2, life: 0.5, size: 0.5 }); break;
      case 'hammerSlam': { const p = at(e); fx.arc(p.x - e.dir.x * 1.8, p.y + 0.5, p.z - e.dir.z * 1.8, e.dir, e.r, e.angle, e.emp ? 0xff6a2a : 0xffb06a, 0.25, 0.8); fx.ring(p.x, p.z, 0.3, 1.8, 0xffa040, 0.35, { y: p.y + 0.12 }); fx.burst(p.x, p.y + 0.3, p.z, e.emp ? 26 : 16, { color: 0xffa040, tex: 'spark', speed: 6, elev: 0.6, g: 12, life: 0.5, size: 0.25 }); audio.play('hitHeavy'); this.camera.addShake(0.1 * this.settings.shake); break; }
      case 'quench': fx.burst(U.x, gy(U.x, U.z) + 0.8, U.z, 16, { color: 0xbfe0ff, tex: 'smoke', additive: false, speed: 1.5, vy: 1.5, life: 0.9, size: 0.7, a: 0.5 }); break;
      case 'anvilDrop': {
        if(modeled) break;
        const p = at(e);
        const anvil = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.9), new THREE.MeshStandardMaterial({ color: 0x55555c, metalness: 0.6, roughness: 0.4, emissive: 0x401a00 }));
        anvil.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6).translate(0, -0.6, 0), anvil.material));
        anvil.castShadow = true;
        fx.object(anvil, e.delay + 0.6, (o, k) => { const tt = k * (e.delay + 0.6); const kk = Math.min(1, tt / e.delay); o.position.set(p.x, p.y + 0.9 + (1 - kk * kk) * 9, p.z); o.rotation.y = kk * 0.6; o.visible = tt < e.delay + 0.55; });
        break;
      }
      case 'anvilImpact': { const p = at(e); fx.ring(p.x, p.z, e.inner * 0.5, e.r, 0xffa040, 0.55, { y: p.y + 0.15 }); fx.ring(p.x, p.z, 0.2, e.inner, 0xffffff, 0.3, { y: p.y + 0.16 }); fx.burst(p.x, p.y + 0.4, p.z, 30, { color: 0xffa040, tex: 'spark', speed: 8, elev: 0.5, g: 14, life: 0.6, size: 0.3 }); fx.burst(p.x, p.y + 0.3, p.z, 14, { color: 0x8a7a68, tex: 'smoke', additive: false, speed: 3.5, elev: 0.25, life: 1.0, size: 1.0, a: 0.7 }); audio.play('boom'); this.camera.addShake(e.shake * this.settings.shake); break; }
      case 'swordArc': fx.arc(U.x, gy(U.x, U.z) + 1.0, U.z, e.dir, 2.6, 100, e.color, 0.22, 0.5); audio.play('swing'); break;
      case 'oathShield': fx.ring(U.x, U.z, 0.4, 1.3, 0xffe08a, 0.5, { y: gy(U.x, U.z) + 0.15 }); fx.burst(U.x, gy(U.x, U.z) + 1.2, U.z, 10, { color: 0xffe8a0, tex: 'star', speed: 1.2, life: 0.7, size: 0.25 }); break;
      case 'lightLand': { const p = at(e); fx.ring(p.x, p.z, 0.3, e.r, 0xffe08a, 0.35, { y: p.y + 0.14 }); fx.burst(p.x, p.y + 0.4, p.z, 12, { color: 0xfff0b0, tex: 'spark', speed: 4, life: 0.35, size: 0.3 }); break; }
      case 'sanctumRise': { const p = at(e); fx.ring(p.x, p.z, e.r * 0.4, e.r, 0xffe08a, 0.7, { y: p.y + 0.15 }); break; }
      case 'dawnBurst': { const p = at(e); fx.ring(p.x, p.z, 0.5, e.r + 0.3, 0xfff0b0, 0.5, { y: p.y + 0.15 }); fx.burst(p.x, p.y + 0.6, p.z, 28, { color: 0xffe08a, tex: 'spark', speed: 6, elev: 0.3, life: 0.5, size: 0.35 }); audio.play('boom', 0.6); break; }
      case 'aimFocus': fx.ring(U.x, U.z, 1.2, 0.3, 0x9ae8ff, 0.4, { y: gy(U.x, U.z) + 0.14 }); break;
      case 'windStep': fx.burst(U.x, gy(U.x, U.z) + 0.4, U.z, 10, { color: 0xcff4ff, tex: 'soft', speed: 2, life: 0.4, size: 0.5, a: 0.6 }); break;
      case 'bowFire': audio.play('arrow', U.isPlayer ? 0.6 : 0.25); break;
      case 'starHit': fx.burst(e.x, gy(e.x, e.z) + 1, e.z, e.big ? 14 : 8, { color: 0xf2c94a, tex: 'star', speed: 3, life: 0.5, size: e.big ? 0.4 : 0.28, spin: 4 }); break;
      case 'gravityCollapse': { const p = at(e); fx.ring(p.x, p.z, e.r + 0.6, 0.2, 0x9a7aff, 0.4, { y: p.y + 0.15 }); fx.burst(p.x, p.y + 0.6, p.z, 16, { color: 0xf2c94a, tex: 'star', speed: 2.5, life: 0.5, size: 0.3 }); audio.play('hitMagic'); break; }
      case 'blink': { fx.burst(e.from.x, gy(e.from.x, e.from.z) + 1, e.from.z, 12, { color: 0x9a8aff, tex: 'star', speed: 2, life: 0.5, size: 0.3 }); fx.burst(e.to.x, gy(e.to.x, e.to.z) + 1, e.to.z, 12, { color: 0xf2c94a, tex: 'star', speed: 2, life: 0.5, size: 0.3 }); break; }
      case 'starBurst': { const p = at(e); fx.ring(p.x, p.z, 0.3, e.r, 0xf2c94a, 0.35, { y: p.y + 0.14 }); fx.burst(p.x, p.y + 0.5, p.z, 16, { color: 0xf2d97a, tex: 'star', speed: 4, life: 0.45, size: 0.3 }); break; }
      case 'meteorFall': {
        if(modeled) break;
        const p = at(e);
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
        fx.object(m, e.delay, (o, k) => { const tt = k * e.delay, start = Math.max(0, e.delay - 0.55); const kk = tt < start ? 0 : (tt - start) / (e.delay - start); o.visible = tt >= start; o.position.set(p.x - (1 - kk) * 4, p.y + (1 - kk) * 12, p.z - (1 - kk) * 3); if (o.visible) fx.particle({ x: o.position.x, y: o.position.y, z: o.position.z, color: 0xf2c94a, tex: 'star', size: 0.6, life: 0.4 }); });
        break;
      }
      case 'meteorImpact': { const p = at(e); fx.ring(p.x, p.z, 0.3, e.r, 0xf2c94a, 0.4, { y: p.y + 0.14 }); fx.burst(p.x, p.y + 0.3, p.z, 18, { color: 0xffe9a0, tex: 'star', speed: 5, elev: 0.6, g: 6, life: 0.6, size: 0.3 }); audio.play('boom', 0.5); this.camera.addShake(e.shake * this.settings.shake); break; }
      case 'thrust': { const p = at(U); fx.arc(p.x, p.y + 1, p.z, e.dir, e.len, 18, 0x9adf5a, 0.18, 0.5); audio.play('swing'); break; }
      case 'forestBreath': fx.burst(U.x, gy(U.x, U.z) + 0.6, U.z, 14, { color: 0x9adf5a, tex: 'drop', speed: 1, vy: 1.8, life: 1, size: 0.25 }); audio.play('heal', 0.6); break;
      case 'beastLand': { const p = at(e); fx.ring(p.x, p.z, 0.3, e.r + 0.4, 0x9adf5a, 0.35, { y: p.y + 0.14 }); fx.burst(p.x, p.y + 0.2, p.z, 10, { color: 0x8a7a5a, tex: 'smoke', additive: false, speed: 2.5, elev: 0.2, life: 0.7, size: 0.7, a: 0.6 }); audio.play('hitHeavy', 0.8); break; }
      case 'primalAura': fx.column(U.x, U.z, 0x9adf5a, 0.9, 2.4, 0.7); audio.play('ult'); break;
      case 'beastBite': fx.burst(e.x, gy(e.x, e.z) + 1, e.z, 14, { color: 0xc8ff8a, tex: 'shard', speed: 4, life: 0.4, size: 0.4 }); audio.play('hitHeavy'); break;
      case 'arcaneBlast': { const p = at(e); fx.ring(p.x, p.z, 0.3, e.r, 0xd06aff, 0.4, { y: p.y + 0.14 }); fx.burst(p.x, p.y + 0.4, p.z, 18, { color: 0xe0a0ff, tex: 'spark', speed: 5, elev: 0.7, life: 0.5, size: 0.35 }); fx.burst(p.x, p.y + 0.4, p.z, 8, { color: 0x6a4a8a, tex: 'smoke', additive: false, speed: 2, life: 0.8, size: 0.8, a: 0.5 }); audio.play('boom', 0.5); if (e.shake) this.camera.addShake(e.shake * this.settings.shake); break; }
      case 'mineBlast': { const p = at(e); fx.ring(p.x, p.z, 0.2, e.r + 0.3, 0xd06aff, 0.3, { y: p.y + 0.14 }); fx.burst(p.x, p.y + 0.3, p.z, 14, { color: 0xd06aff, tex: 'spark', speed: 4, life: 0.4, size: 0.3 }); audio.play('boom', 0.4); break; }
      case 'recoilBlast': fx.arc(U.x, gy(U.x, U.z) + 1.2, U.z, e.dir, e.r, e.angle, 0xd06aff, 0.2, 1.0); audio.play('boom', 0.4); break;
      case 'cannonFire': { const tip = this.tipOf(U); if (tip) fx.burst(tip.x, tip.y, tip.z, 6, { color: 0xd06aff, tex: 'soft', speed: 1.5, life: 0.3, size: 0.4 }); break; }
      case 'harmonyPulse': case 'marchPulse': { fx.ring(e.x, e.z, 0.4, e.r, e.color, 0.55, { y: gy(e.x, e.z) + 0.14 }); fx.ring(e.x, e.z, 0.2, e.r * 0.7, e.color, 0.45, { y: gy(e.x, e.z) + 0.13, alpha: 0.5 }); audio.play('note'); break; }
      case 'resonanceWave': { const p = at(e); for (let i = 0; i < 4; i++) setTimeout(() => fx.arc(p.x, p.y + 0.6, p.z, e.dir, (e.r * (i + 1)) / 4, e.angle, i % 2 ? 0xffa6e0 : 0x7af0e0, 0.35, 0.35), i * 60); audio.play('ult'); break; }
      case 'chordReady': fx.burst(U.x, gy(U.x, U.z) + 1.8, U.z, 6, { color: 0xffa6e0, tex: 'note', speed: 1, vy: 1, life: 0.8, size: 0.3 }); break;
      case 'potion': fx.burst(U.x, gy(U.x, U.z) + 1, U.z, 8, { color: 0xff7a7a, tex: 'drop', speed: 1, vy: 1.5, life: 0.6, size: 0.25 }); break;
      case 'slam': { const p = at(e); fx.ring(p.x, p.z, 0.3, e.r, 0xc8b8a0, 0.35, { y: p.y + 0.14 }); break; }
      case 'structureDown': break;
    }
  }
  zoneFx(dt) {
    for (const z of this.sim.zones) {
      if (!z.vis) continue;
      if (z.hiddenFromEnemy && z.team !== this.playerTeam) continue;
      if (!this.isVisibleAt(z.shape.x, z.shape.z) && z.team !== this.playerTeam) continue;
      z._acc = (z._acc || 0) + dt * this.q.particles;
      const s = z.shape, r = s.r || 1, gy = groundHeight(s.x, s.z);
      const rnd = () => { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r; return [s.x + Math.cos(a) * d, s.z + Math.sin(a) * d]; };
      const rate = { frost: 16, fireTrail: 14, firestorm: 30, goo: 14, elixir: 18, heatAura: 16, sanctum: 22, gravity: 26, mine: 1 }[z.vis] || 8;
      while (z._acc > 1 / rate) {
        z._acc -= 1 / rate;
        const [x, zz] = rnd();
        if (z.vis === 'goo') this.fx.particle({ x, y: gy + 0.1, z: zz, color: 0x3ac8a8, tex: 'ring', size: 0.4, grow: 1.8, life: 0.8, a: 0.7 });
        else if (z.vis === 'elixir') this.fx.particle({ x, y: gy + 0.2, z: zz, color: 0x9af8e8, tex: 'soft', size: 0.3, vy: 1.6, life: 1.1, a: 0.8 });
        else if (z.vis === 'heatAura') this.fx.particle({ x, y: gy + 0.3, z: zz, color: 0xff8a3a, tex: 'spark', size: 0.2, vy: 1.4, life: 0.6 });
        else if (z.vis === 'sanctum') this.fx.particle({ x, y: gy + 0.2, z: zz, color: 0xffe08a, tex: 'star', size: 0.22, vy: 1.2, life: 1.0, spin: 2 });
        else if (z.vis === 'gravity') { const dx = s.x - x, dz = s.z - zz; this.fx.particle({ x, y: gy + 0.3, z: zz, vx: dx * 1.4, vz: dz * 1.4, color: 0x9a7aff, tex: 'star', size: 0.2, life: 0.6 }); }
        else if (z.vis === 'frost') this.fx.particle({ x, y: gy + 0.15, z: zz, color: 0xcff6ff, tex: Math.random() < 0.5 ? 'shard' : 'soft', size: 0.28, vy: 0.5, life: 0.9, a: 0.75, spin: 3 });
        else if (z.vis === 'fireTrail') this.fx.particle({ x, y: gy + 0.15, z: zz, color: Math.random() < 0.6 ? 0xff7a2a : 0xffc04a, tex: 'soft', size: 0.38, vy: 1.6, life: 0.55, a: 0.85 });
        else if (z.vis === 'firestorm') { const dx = x - s.x, dz = zz - s.z; this.fx.particle({ x, y: gy + 0.2, z: zz, vx: -dz * 1.2, vz: dx * 1.2, vy: 2.2, color: Math.random() < 0.5 ? 0xff5a1a : 0xffb23a, tex: Math.random() < 0.3 ? 'smoke' : 'soft', size: 0.5, life: 0.8, a: 0.8 }); }
        else if (z.vis === 'mine') this.fx.particle({ x: s.x, y: gy + 0.25, z: s.z, color: 0xd06aff, tex: 'soft', size: 0.5, life: 0.6, a: 0.8 });
      }
    }
  }
  statusFx(u, dt) {
    const t = this.time;
    if (!u._sfx) u._sfx = 0;
    u._sfx += dt;
    if (u._sfx < 0.12) return;
    u._sfx = 0;
    const y = groundHeight(u.x, u.z);
    if (u.has('stun')) for (let i = 0; i < 2; i++) { const a = t * 5 + i * Math.PI; this.fx.particle({ x: u.x + Math.cos(a) * 0.45, y: y + 2.3, z: u.z + Math.sin(a) * 0.45, color: 0xffe06a, tex: 'star', size: 0.25, life: 0.2 }); }
    if (u.has('slow')) this.fx.particle({ x: u.x + (Math.random() - 0.5) * 0.6, y: y + 0.2, z: u.z + (Math.random() - 0.5) * 0.6, color: 0x6ab0ff, tex: 'soft', size: 0.3, life: 0.5, a: 0.6 });
    if (u.has('root')) this.fx.particle({ x: u.x + (Math.random() - 0.5) * 0.7, y: y + 0.3, z: u.z + (Math.random() - 0.5) * 0.7, color: 0x8adf5a, tex: 'shard', size: 0.35, life: 0.4 });
    if (u.has('haste')) this.fx.particle({ x: u.x, y: y + 0.6, z: u.z, color: 0xcff4ff, tex: 'soft', size: 0.5, life: 0.3, a: 0.4 });
    if (u.shieldTotal && u.shieldTotal() > 0) this.fx.particle({ x: u.x + (Math.random() - 0.5) * 1, y: y + 0.4 + Math.random() * 1.4, z: u.z + (Math.random() - 0.5) * 1, color: 0xe8f4ff, tex: 'soft', size: 0.25, life: 0.4, a: 0.5 });
    if (u.recall) { this.fx.particle({ x: u.x + (Math.random() - 0.5) * 1.2, y: y + 0.1, z: u.z + (Math.random() - 0.5) * 1.2, color: TEAM_COLORS[u.team].light, tex: 'soft', size: 0.3, vy: 2.5, life: 0.8 }); }
  }

  // ---------- 프레임 ----------
  update(dt, alpha, player) {
    this.time += dt;
    this.rangeVisual.update(this.time);
    sharedUniforms.uTime.value = this.time;
    const sim = this.sim;
    // 뷰 동기화
    const seen = new Set();
    for (const u of sim.units) {
      const v = this.viewFor(u);
      if (!v) continue;
      seen.add(u.id);
      const vis = this.unitVisible(u) || u.kind === 'turret' || u.kind === 'nexus';
      v.setVisible(vis && !(u.dead && u.kind === 'champion' && sim.time - u.deathTime > 3.2));
      if (v.root.visible) {
        v.update(dt, this.time, alpha * (1 / 30));
        if(u._netFrom){const k=Math.min(1,(performance.now()-u._netFrom.t)/67);v.root.position.x=u._netFrom.x+(u.x-u._netFrom.x)*k;v.root.position.z=u._netFrom.z+(u.z-u._netFrom.z)*k;}
        if (u.kind === 'champion') {
          // 같은 팀 덤불 속 = 반투명
          v.setOpacity(u.brush && u.team === this.playerTeam ? 0.55 : 1);
          if (!u.dead) this.statusFx(u, dt);
        }
      }
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { this.scene.remove(v.root); this.views.delete(id); }
    // 투사체·텔레그래프·영역
    this.fx.syncProjectiles(sim, dt, (x, z) => this.isVisibleAt(x, z), (u) => this.tipOf(u));
    this.fx.syncTelegraphs(sim, (x, z) => this.isVisibleAt(x, z));
    this.zoneFx(dt);
    this.fx.update(dt);
    this.updateFog(dt);
    // 카메라
    // 카메라는 보간된 화면 위치를 따라감 (30Hz 틱 계단 현상 제거)
    const pv = player && this.views.get(player.id);
    const follow = pv && pv.root.visible ? pv.root.position : player;
    this.camera.update(dt, follow);
    updateSunFollow(this.sun, this.camera.target);
    // 가림 완화: 플레이어 앞(카메라 쪽) 나무를 디더링
    if (player) for (const m of this.treeMats) if (m.userData.occ) m.userData.occ.value.set(player.x, player.z);
  }
  render() { this.renderer.render(this.scene, this.camera.cam); }

  // ---------- 오버레이 (체력바·상태·피해 숫자) ----------
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera.cam);
    return { x: (v.x * 0.5 + 0.5) * this.vw, y: (-v.y * 0.5 + 0.5) * this.vh, behind: v.z > 1 };
  }
  drawOverlay(dt, player, uiScale = 1) {
    const cv = this.overlay, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    this.vw = W; this.vh = H;
    const ctx = this.octx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const s = uiScale;
    const sim = this.sim;
    const list = [];
    for (const u of sim.units) {
      if (u.dead || u.kind === 'decoy' && u.team !== this.playerTeam && !u.visibleTo[this.playerTeam]) continue;
      if (u.dead) continue;
      if (!(this.unitVisible(u) || u.kind === 'turret' || u.kind === 'nexus')) continue;
      const v = this.views.get(u.id); if (!v) continue;
      let lift = 0;
      if (u.kind === 'champion' && v.v) lift = v.v.container.position.y;
      const rp = v.root.position; const p = this.project(rp.x, groundHeight(rp.x, rp.z) + v.headY() + lift, rp.z);
      if (p.behind || p.x < -100 || p.x > W + 100 || p.y < -60 || p.y > H + 60) continue;
      list.push({ u, p });
    }
    // 챔피언은 마지막에 그려 위에 오도록
    list.sort((a, b) => (a.u.kind === 'champion') - (b.u.kind === 'champion') || (a.u === player) - (b.u === player));
    ctx.textBaseline = 'middle';
    for (const { u, p } of list) {
      const ally = u.team === this.playerTeam, me = u === player;
      const hpc = me ? '#5fd04a' : ally ? '#3e9bf0' : u.team === 2 ? '#e8b84a' : '#e5463b';
      if (u.kind === 'champion' || u.kind === 'decoy') {
        const isDecoy = u.kind === 'decoy';
        const src = isDecoy ? u.source : u;
        if (isDecoy && !ally) { /* 적 잔영은 실제와 같은 모습으로 표시 */ }
        const w = 96 * s, h = 12 * s, x = p.x - w / 2 + 8 * s, y = p.y;
        // 레벨
        ctx.fillStyle = 'rgba(10,14,20,0.9)'; ctx.fillRect(x - 20 * s, y - 2 * s, 19 * s, h + 7 * s);
        ctx.strokeStyle = '#7a8696'; ctx.lineWidth = 1; ctx.strokeRect(x - 20 * s + 0.5, y - 2 * s + 0.5, 19 * s, h + 7 * s);
        ctx.fillStyle = '#f0e6c8'; ctx.font = `700 ${11 * s}px "Noto Sans KR","Noto Sans CJK KR",sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(String(src.level), x - 10.5 * s, y + h / 2 + 1.5 * s);
        // 체력
        ctx.fillStyle = 'rgba(8,10,14,0.88)'; ctx.fillRect(x - 1, y - 2 * s, w + 2, h + 7 * s);
        const maxEff = Math.max(src.s.hp, src.hp + (src.shieldTotal ? src.shieldTotal() : 0));
        const hpW = (w * src.hp) / maxEff, shW = (w * (src.shieldTotal ? src.shieldTotal() : 0)) / maxEff;
        ctx.fillStyle = hpc; ctx.fillRect(x, y, hpW, h);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y, hpW, h * 0.35);
        if (shW > 0) { ctx.fillStyle = '#f2f4f8'; ctx.fillRect(x + hpW, y, shW, h); }
        // 100 단위 눈금
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        for (let k = 100; k < maxEff; k += 100) { const tx = x + (w * k) / maxEff; ctx.fillRect(tx, y, k % 1000 === 0 ? 2 : 1, k % 1000 === 0 ? h : h * 0.55); }
        // 자원
        if (src.s.mp) { ctx.fillStyle = '#3a6ad8'; ctx.fillRect(x, y + h + 1.5 * s, (w * src.mp) / src.s.mp, 3 * s); }
        // 이름
        ctx.font = `700 ${13 * s}px "Noto Sans KR","Noto Sans CJK KR",sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        const nm = src.name; ctx.strokeText(nm, x + w / 2, y - 9 * s);
        ctx.fillStyle = me ? '#ffe9a0' : ally ? '#cfe6ff' : '#ffd0c8'; ctx.fillText(nm, x + w / 2, y - 9 * s);
        // 상태 이상: 종류 + 남은 시간 원
        if (!isDecoy) {
          const sts = [];
          for (const st of u.status) { if (!SHOW_STATUS.includes(st.type) || st.until <= sim.time) continue; if (!sts.find((q) => q.type === st.type)) sts.push(st); }
          let sx = p.x - (sts.length * 34 * s) / 2 + 17 * s;
          for (const st of sts) {
            const [label, col] = STATUS_LABEL[st.type];
            const r = 13 * s, cy = y - 28 * s;
            const rem = (st.until - sim.time) / Math.max(0.01, st.dur || 1);
            ctx.fillStyle = 'rgba(10,14,20,0.85)'; ctx.beginPath(); ctx.arc(sx, cy, r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = col; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.arc(sx, cy, r - 1.5 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, rem))); ctx.stroke();
            ctx.fillStyle = col; ctx.font = `700 ${9 * s}px "Noto Sans KR","Noto Sans CJK KR",sans-serif`; ctx.fillText(label, sx, cy + 0.5);
            sx += 34 * s;
          }
          // 귀환 진행
          if (u.recall) { const k = (sim.time - u.recall.start) / u.recall.dur; ctx.fillStyle = 'rgba(10,14,20,0.85)'; ctx.fillRect(x, y + h + 7 * s, w, 5 * s); ctx.fillStyle = '#7ab8ff'; ctx.fillRect(x, y + h + 7 * s, w * k, 5 * s); }
        }
      } else {
        const big = u.kind === 'turret' || u.kind === 'nexus';
        const mons = u.kind === 'monster';
        const w = (big ? (u.kind === 'nexus' ? 150 : 110) : mons ? (u.big ? 80 : 46) : 42) * s;
        const h = (big ? 9 : mons && u.big ? 7 : 5) * s;
        const x = p.x - w / 2, y = p.y;
        if (!big && !mons && u.hp >= u.s.hp) { /* 미니언 체력 가득: 표시 단순화 */ }
        ctx.fillStyle = 'rgba(8,10,14,0.85)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
        ctx.fillStyle = hpc; ctx.fillRect(x, y, (w * u.hp) / u.s.hp, h);
        if (big && sim.isProtected(u)) { ctx.strokeStyle = '#d8d0b0'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 2, y - 2, w + 4, h + 4); ctx.font = `600 ${10 * s}px "Noto Sans KR","Noto Sans CJK KR",sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#d8d0b0'; ctx.fillText('보호됨', p.x, y - 8 * s); }
        if (mons && u.big) { ctx.font = `600 ${10 * s}px "Noto Sans KR","Noto Sans CJK KR",sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(u.name, p.x, y - 8 * s); ctx.fillStyle = '#ffe6a0'; ctx.fillText(u.name, p.x, y - 8 * s); }
      }
    }
    // 피해 숫자
    const keep = [];
    for (const f of this.floating) {
      f.t += dt;
      if (f.t > f.life) continue;
      keep.push(f);
      const k = f.t / f.life;
      const p = this.project(f.x + f.vx * k, f.y + k * 1.0, f.z);
      if (p.behind) continue;
      const size = (15 + 6 * (f.scale - 1) * 2) * s * (k < 0.15 ? 0.8 + k * 2.5 : 1);
      ctx.font = `800 ${size}px "Noto Sans KR","Noto Sans CJK KR",sans-serif`; ctx.textAlign = 'center';
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(f.text, p.x, p.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
    this.floating = keep.slice(-60);
  }
  // 화면 좌표 → 지면 좌표
  groundAt(sx, sy) {
    const ndc = new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera.cam);
    // 평면 y=0 교차 후 높이 보정 1회
    const o = ray.ray.origin, d = ray.ray.direction;
    let t = -o.y / d.y;
    let p = o.clone().addScaledVector(d, t);
    const h = groundHeight(p.x, p.z);
    t = (h - o.y) / d.y; p = o.clone().addScaledVector(d, t);
    return { x: p.x, z: p.z };
  }
  // 화면 좌표 근처 유닛 선택 (몸통/머리 투영 기준)
  pickUnit(sx, sy, filter, radiusPx = 42) {
    let best = null, bd = radiusPx;
    for (const u of this.sim.units) {
      if (u.dead || !filter(u)) continue;
      if (!(this.unitVisible(u) || u.kind === 'turret' || u.kind === 'nexus')) continue;
      const v = this.views.get(u.id); if (!v) continue;
      const g = groundHeight(u.x, u.z);
      const p1 = this.project(u.x, g + v.headY() * 0.45, u.z);
      const d = Math.hypot(p1.x - sx, p1.y - sy) - (u.kind === 'nexus' ? 60 : u.kind === 'turret' ? 35 : 0);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
}
