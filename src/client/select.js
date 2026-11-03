// 캐릭터 선택 화면 — 전투 카메라와 분리된 3D 미리보기 무대
import * as THREE from 'three';
import { CHAMPIONS, ROLES } from '../data/champions.js';
import { createChampionVisual } from '../render/champVisual.js';
import { basePose, locomotion, actionPose, idleBreath } from '../render/rig.js';
import { applyEnvironment } from '../render/scene.js';
import { skillIcon } from './icons.js';
import { audio } from './audio.js';

const LANE_KO = { top: '상단', mid: '중앙', bot: '하단', jungle: '정글·로밍' };

export function autoPicks(playerId, playerLane, rand = Math.random) {
  const ids = CHAMPIONS.map((c) => c.id);
  const lanes = ['top', 'mid', 'bot', 'jungle'];
  const pick = (team, fixed) => {
    const out = [];
    const used = new Set();
    const left = [...lanes];
    if (fixed) { out.push({ id: fixed.id, team, lane: fixed.lane, isPlayer: true }); used.add(fixed.id); left.splice(left.indexOf(fixed.lane), 1); }
    for (const lane of left) {
      // 해당 공격로를 선호하는 챔피언 우선 (팀 내 중복 금지)
      const pool = ids.filter((id) => !used.has(id)).map((id) => CHAMPIONS.find((c) => c.id === id));
      pool.sort((a, b) => a.lanePref.indexOf(lane) - b.lanePref.indexOf(lane) + (rand() - 0.5) * 1.6);
      const c = pool[0];
      used.add(c.id);
      out.push({ id: c.id, team, lane });
    }
    return out;
  };
  return [...pick(0, { id: playerId, lane: playerLane }), ...pick(1, null)];
}

export class SelectScreen {
  constructor(root, portraits, onStart) {
    this.root = root; this.portraits = portraits; this.onStart = onStart;
    this.sel = CHAMPIONS[0].id; this.lane = 'bot';
    this.build();
    this.initStage();
    this.choose(this.sel);
  }
  build() {
    const r = this.root;
    r.innerHTML = `
      <div class="left panel gilt" style="padding:12px">
        <h2>영웅 선택</h2>
        <div class="grid">${CHAMPIONS.map((c) => `<div class="card" data-id="${c.id}"><img src="${this.portraits[c.id]}"><div class="nm">${c.name}</div></div>`).join('')}</div>
        <h2 style="margin-top:14px">내 위치</h2>
        <div class="lanes">${Object.entries(LANE_KO).map(([k, v]) => `<button class="btn ${k === this.lane ? 'on' : ''}" data-lane="${k}">${v}</button>`).join('')}</div>
        <div class="mode-note" style="margin-top:10px">4대4 AI 대전 — 플레이어 1명 + AI 7명. 같은 팀 안에서는 같은 영웅을 고를 수 없습니다. 기본 배치는 상단·중앙·하단·정글/로밍 1명씩이며 경기 중 자유롭게 이동할 수 있습니다.<br>실시간 온라인 대전은 별도 구현 단계로, 이 화면은 AI 대전입니다.</div>
      </div>
      <div class="center" style="position:relative;min-height:0"><canvas id="preview" style="width:100%;height:100%;display:block"></canvas>
        <div class="info" style="position:absolute;left:16px;top:10px"><div class="name"></div><div class="ttl"></div><div class="roles"></div></div>
        <div class="start" style="position:absolute;left:12%;right:12%;bottom:8px"><button class="btn gold" id="btn-start">게임 시작</button></div></div>
      <div class="right">
        <div class="panel" style="padding:10px"><h2>스킬</h2><div class="skills"></div></div>
        <div class="panel" style="padding:10px"><h2>팀 구성</h2><div class="lineup"></div></div>
      </div>`;
    r.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => { audio.init(); audio.play('click'); this.choose(c.dataset.id); }));
    r.querySelectorAll('[data-lane]').forEach((b) => b.addEventListener('click', () => { audio.play('click'); this.lane = b.dataset.lane; r.querySelectorAll('[data-lane]').forEach((x) => x.classList.toggle('on', x === b)); this.updateLineup(); }));
    r.querySelector('#btn-start').addEventListener('click', () => { audio.init(); audio.play('click'); this.start(); });
  }
  choose(id) {
    this.sel = id;
    const c = CHAMPIONS.find((x) => x.id === id);
    const r = this.root;
    r.querySelectorAll('.card').forEach((k) => k.classList.toggle('sel', k.dataset.id === id));
    r.querySelector('.info .name').textContent = c.name;
    r.querySelector('.info .ttl').textContent = c.title;
    r.querySelector('.info .roles').innerHTML = c.roles.map((x) => `<span>${ROLES[x]}</span>`).join('') + `<span>추천: ${LANE_KO[c.lanePref[0]]}</span>`;
    const desc = (sk) => sk.desc.replace(/\{\w+\}/g, (m) => `<b style="color:#ffd8a0">${sk.base[0]}${sk.ad ? `(+${Math.round(sk.ad * 100)}% 공격력)` : sk.ap ? `(+${Math.round(sk.ap * 100)}% 주문력)` : ''}</b>`);
    r.querySelector('.skills').innerHTML = `<div class="sk"><img src="${skillIcon(c, 'P')}"><div><b><span class="k">패시브</span>${c.passive.name}</b><p>${c.passive.desc.replace(/\{\w+\}/g, '추가')}</p></div></div>` +
      ['Q', 'W', 'E', 'R'].map((s) => { const sk = c.skills[s]; return `<div class="sk"><img src="${skillIcon(c, s)}"><div><b><span class="k">${s}</span>${sk.name}</b> <small style="color:#7a8896">${sk.cd}초 · ${sk.cost}</small><p>${desc(sk)}</p></div></div>`; }).join('');
    if (!c.lanePref.slice(0, 1).includes(this.lane)) { /* 위치는 플레이어 선택 유지 */ }
    this.updateLineup();
    this.showModel(c);
  }
  updateLineup() {
    this.picks = autoPicks(this.sel, this.lane, mulberry(this.sel.length * 7 + this.lane.length));
    const ln = this.root.querySelector('.lineup');
    ln.innerHTML = this.picks.map((p) => { const c = CHAMPIONS.find((x) => x.id === p.id); return `<div class="slot ${p.team ? 'red' : ''}"><img src="${this.portraits[c.id]}"><div>${c.name}${p.isPlayer ? ' <b style="color:#d8b46a">(나)</b>' : ' <small style="color:#9aa8b6">AI</small>'}<div class="ln">${p.team ? '적염 팀' : '청람 팀'} · ${LANE_KO[p.lane]}</div></div><div></div></div>`; }).join('');
    // 같은 팀 중복 금지 표시
    const mine = new Set(this.picks.filter((p) => p.team === 0 && !p.isPlayer).map((p) => p.id));
    this.root.querySelectorAll('.card').forEach((k) => k.classList.toggle('taken', false));
  }
  initStage() {
    const cv = this.root.querySelector('#preview');
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    applyEnvironment(this.renderer, this.scene);
    this.scene.environmentIntensity = 0.3;
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a2418, 1.0));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.6); key.position.set(-3, 6, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); this.scene.add(key);
    this.rim = new THREE.DirectionalLight(0x7af0e0, 2.0); this.rim.position.set(3, 3, -4); this.scene.add(this.rim);
    // 받침대: 석재 원형 단 + 문양
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.3, 40), new THREE.MeshStandardMaterial({ color: 0x5a6672, roughness: 0.8 }));
    ped.position.y = -0.15; ped.receiveShadow = true; this.scene.add(ped);
    this.glyph = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.35, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8b46a, transparent: true, opacity: 0.7 }));
    this.glyph.position.y = 0.01; this.scene.add(this.glyph);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.t = 0;
    this.loop = () => {
      if (!this.renderer) return;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * this.renderer.getPixelRatio())) { this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
      const dt = 1 / 60; this.t += dt;
      if (this.vis) {
        const c = this.cur;
        const p = basePose(c.arche);
        const cyc = this.t % 7;
        if (cyc < 3) p.addPose(idleBreath(this.t, c.arche));
        else if (cyc < 5) p.addPose(locomotion(this.t * 9, 0.8, c.arche, this.vis.rig.legLen));
        else p.addPose(actionPose(c.arche, cyc < 6 ? 'attack' : 'cast', cyc < 6 ? null : 'Q', (cyc - 5) % 1, 0.3, 0.9));
        this.vis.rig.apply(p);
        this.vis.root.rotation.y = Math.sin(this.t * 0.4) * 0.5 + 0.2;
        for (const f of this.vis.floats) { f.obj.position.y = 1.3 + Math.sin(this.t * 2) * 0.05; if (f.r1) { f.r1.rotation.z = this.t; f.r2.rotation.y = this.t * 1.3; f.planets.forEach((pl, k) => pl.position.set(Math.cos(this.t * (1 + k * 0.4) + k * 2) * 0.38, 0, Math.sin(this.t * (1 + k * 0.4) + k * 2) * 0.38)); } }
      }
      this.glyph.rotation.y += dt * 0.3;
      this.renderer.render(this.scene, this.cam);
      this.raf = requestAnimationFrame(this.loop);
    };
    this.raf = requestAnimationFrame(this.loop);
  }
  showModel(c) {
    if (this.vis) this.scene.remove(this.vis.root);
    this.cur = c;
    this.vis = createChampionVisual(c);
    this.vis.model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(this.vis.root);
    this.rim.color.set(c.accent);
    this.glyph.material.color.set(c.accent);
    const h = 1.75 * c.body[1];
    this.cam.position.set(0, h * 0.85, 7.2); this.cam.lookAt(0, h * 0.42, 0);
  }
  start() {
    this.destroy();
    this.onStart(this.picks);
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss?.(); this.renderer = null; }
  }
}
function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
