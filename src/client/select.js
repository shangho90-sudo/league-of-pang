// 캐릭터 선택 화면 — 전투 카메라와 분리된 3D 무대(마법 전당) 위에 금장 패널 UI
import * as THREE from 'three';
import { CHAMPIONS, ROLES } from '../data/champions.js';
import { createChampionVisual } from '../render/champVisual.js';
import { basePose, locomotion, actionPose, idleBreath } from '../render/rig.js';
import { applyEnvironment } from '../render/scene.js';
import { skillIcon } from './icons.js';
import { audio } from './audio.js';

const LANE_KO = { top: '상단', mid: '중앙', bot: '하단', jungle: '정글·로밍' };
const KEY_COL = { Q: '#ffd75a', W: '#ffd75a', E: '#ffd75a', R: '#ffd75a' };

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

// ---------- 장식 SVG (독자 디자인) ----------
const GOLD_DEF = `<defs><linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1c4"/><stop offset=".45" stop-color="#e2b45c"/><stop offset="1" stop-color="#8a5e22"/></linearGradient></defs>`;
const CORNER = `<svg viewBox="0 0 60 60">${GOLD_DEF}<path d="M2 58 V18 Q2 2 18 2 H58" fill="none" stroke="url(#gg)" stroke-width="3"/><path d="M8 50 V20 Q8 8 20 8 H50" fill="none" stroke="url(#gg)" stroke-width="1.2" opacity=".8"/><path d="M14 14 l7 -3 l-3 7 z" fill="url(#gg)"/><circle cx="2" cy="58" r="2.5" fill="url(#gg)"/><circle cx="58" cy="2" r="2.5" fill="url(#gg)"/></svg>`;
const WING = `<svg viewBox="0 0 40 28" class="wing">${GOLD_DEF}<path d="M20 26 L14 10 Q8 14 2 8 Q8 20 18 24 Z M20 26 L26 10 Q32 14 38 8 Q32 20 22 24 Z" fill="url(#gg)"/><path d="M20 2 L24 12 L20 22 L16 12 Z" fill="url(#gg)" stroke="#fff3c8" stroke-width=".6"/></svg>`;
const DIAMOND = `<svg viewBox="0 0 20 20" class="dia">${GOLD_DEF}<path d="M10 1 L19 10 L10 19 L1 10 Z" fill="none" stroke="url(#gg)" stroke-width="2.2"/><path d="M10 6 L14 10 L10 14 L6 10 Z" fill="url(#gg)"/></svg>`;
const LAUREL = (flip) => `<svg viewBox="0 0 40 90" class="laurel" style="${flip ? 'transform:scaleX(-1)' : ''}">${GOLD_DEF}<path d="M32 86 Q6 60 18 4" fill="none" stroke="url(#gg)" stroke-width="2.4"/>${[12, 26, 40, 54, 68].map((y, i) => `<path d="M${19 + i * 1.4} ${y} q-12 -2 -14 -12 q11 1 14 12 z" fill="url(#gg)"/>`).join('')}</svg>`;
const CREST = `<svg viewBox="0 0 220 70" class="crest">${GOLD_DEF}<defs><linearGradient id="gem" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8fbff"/><stop offset="1" stop-color="#1a9ad8"/></linearGradient></defs>
  <path d="M110 64 L84 30 Q60 34 6 6 Q50 40 92 48 Z M110 64 L136 30 Q160 34 214 6 Q170 40 128 48 Z" fill="url(#gg)"/>
  <path d="M110 4 L128 30 L110 60 L92 30 Z" fill="#0a1a2c" stroke="url(#gg)" stroke-width="3"/><path d="M110 12 L122 30 L110 52 L98 30 Z" fill="url(#gem)"/></svg>`;
const ICON_TEAM = `<svg viewBox="0 0 24 24" class="hic"><g fill="url(#gg2)"><circle cx="12" cy="8" r="3.4"/><circle cx="5" cy="10" r="2.6"/><circle cx="19" cy="10" r="2.6"/><path d="M5 20 q7 -10 14 0 z"/><path d="M0 20 q4 -7 8 -3 l-1 3 z"/><path d="M24 20 q-4 -7 -8 -3 l1 3 z"/></g><defs><linearGradient id="gg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1c4"/><stop offset="1" stop-color="#b88434"/></linearGradient></defs></svg>`;
const PPL = (c) => `<svg viewBox="0 0 24 24" width="18" height="18"><g fill="${c}"><circle cx="12" cy="8" r="3.4"/><circle cx="5" cy="10" r="2.4"/><circle cx="19" cy="10" r="2.4"/><path d="M5 20 q7 -10 14 0 z"/></g></svg>`;

function frame(inner, cls = '') {
  return `<div class="fpanel ${cls}"><i class="cn tl">${CORNER}</i><i class="cn tr">${CORNER}</i><i class="cn bl">${CORNER}</i><i class="cn br">${CORNER}</i>${inner}</div>`;
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
    r.classList.add('sel2');
    r.innerHTML = `
      <canvas id="sel-stage"></canvas>
      <div class="sel-left">${frame(`
        <h2>${WING}<span>영웅 선택</span></h2><div class="hline"></div>
        <div class="grid">${CHAMPIONS.map((c) => `<div class="card" data-id="${c.id}"><img src="${this.portraits[c.id]}"><div class="nm">${c.name}</div><i class="pin t">${DIAMOND}</i><i class="pin b">${DIAMOND}</i></div>`).join('')}</div>
        <div class="hline"></div>
        <h3>${DIAMOND}<span>내 위치</span></h3>
        <div class="lanes">${Object.entries(LANE_KO).map(([k, v]) => `<button class="lane ${k === this.lane ? 'on' : ''}" data-lane="${k}">${v}</button>`).join('')}</div>
        <p class="note">4대4 AI 대전 — 플레이어 1명 + AI 7명. 같은 팀 안에서는 같은 영웅을 고를 수 없습니다.<br>기본 배치는 상단·중앙·하단·정글/로밍 1명씩이며 경기 중 자유롭게 이동할 수 있습니다.<br>실시간 온라인 대전은 별도 구현 단계로, 이 화면은 AI 대전입니다.</p>`, 'left')}</div>
      <div class="sel-center">
        ${CREST}
        <div class="titlewrap">${LAUREL(false)}<div class="tname"></div>${LAUREL(true)}</div>
        <div class="ttl"></div>
        <div class="roles"></div>
      </div>
      <div class="sel-right">
        ${frame(`<h2>${WING}<span>스킬</span></h2><div class="skills"></div>`, 'skills-p')}
        ${frame(`<h2>${ICON_TEAM}<span>팀 구성</span></h2><div class="hline"></div><div class="lineup"></div>`, 'team-p')}
      </div>
      <button class="hexstart" id="btn-start"><span class="ar l">◆━━</span><b>게임 시작</b><span class="ar r">━━◆</span></button>`;
    r.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => { audio.init(); audio.play('click'); this.choose(c.dataset.id); }));
    r.querySelectorAll('[data-lane]').forEach((b) => b.addEventListener('click', () => { audio.play('click'); this.lane = b.dataset.lane; r.querySelectorAll('[data-lane]').forEach((x) => x.classList.toggle('on', x === b)); this.updateLineup(); }));
    r.querySelector('#btn-start').addEventListener('click', () => { audio.init(); audio.play('click'); this.start(); });
  }
  choose(id) {
    this.sel = id;
    const c = CHAMPIONS.find((x) => x.id === id);
    const r = this.root;
    r.querySelectorAll('.card').forEach((k) => k.classList.toggle('sel', k.dataset.id === id));
    r.querySelector('.tname').textContent = c.name;
    r.querySelector('.sel-center .ttl').textContent = c.title;
    r.querySelector('.sel-center .roles').innerHTML = c.roles.map((x) => `<span>${ROLES[x]}</span>`).join('') + `<span>추천: ${LANE_KO[c.lanePref[0]].replace('·로밍', '')}</span>`;
    const desc = (sk) => sk.desc.replace(/\{\w+\}/g, () => `<b>${sk.base[0]}${sk.ad ? `(+${Math.round(sk.ad * 100)}% 공격력)` : sk.ap ? `(+${Math.round(sk.ap * 100)}% 주문력)` : ''}</b>`);
    r.querySelector('.skills').innerHTML =
      `<div class="sk"><div class="ic"><img src="${skillIcon(c, 'P')}"></div><div><div class="hd"><span class="tag">패시브</span><span class="nm">${c.passive.name}</span></div><p>${c.passive.desc.replace(/\{\w+\}/g, '추가')}</p></div></div>` +
      ['Q', 'W', 'E', 'R'].map((s) => { const sk = c.skills[s]; return `<div class="sk"><div class="ic"><img src="${skillIcon(c, s)}"></div><div><div class="hd"><span class="key" style="color:${KEY_COL[s]}">${s}</span><span class="nm">${sk.name}</span><span class="cd">${sk.cd}초 · ${sk.cost}</span></div><p>${desc(sk)}</p></div></div>`; }).join('');
    this.updateLineup();
    this.showModel(c);
  }
  updateLineup() {
    this.picks = autoPicks(this.sel, this.lane, mulberry(this.sel.length * 7 + this.lane.length));
    const ln = this.root.querySelector('.lineup');
    const card = (p) => { const c = CHAMPIONS.find((x) => x.id === p.id); return `<div class="tm ${p.team ? 'red' : 'blue'}"><img src="${this.portraits[c.id]}"><div><div class="n">${c.name}${p.isPlayer ? ' <em>(나)</em>' : ' <small>AI</small>'}</div><div class="l">${p.team ? '적염 팀' : '청람 팀'} · ${LANE_KO[p.lane]}</div></div></div>`; };
    ln.innerHTML = [0, 1].map((t) => `<div class="side ${t ? 'red' : 'blue'}"><div class="lab">${PPL(t ? '#ff8a8a' : '#8ac8ff')}<span>${t ? '적군' : '아군'}</span></div><div class="cards">${this.picks.filter((p) => p.team === t).map(card).join('')}</div></div>`).join('');
  }
  // ---------- 3D 무대: 마법 전당 ----------
  initStage() {
    const cv = this.root.querySelector('#sel-stage');
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    const scene = (this.scene = new THREE.Scene());
    // 배경: 중앙이 밝은 남색 방사형
    const bg = document.createElement('canvas'); bg.width = 512; bg.height = 512;
    const g = bg.getContext('2d');
    const rg = g.createRadialGradient(256, 230, 10, 256, 260, 380);
    rg.addColorStop(0, '#1f4f86'); rg.addColorStop(0.35, '#123058'); rg.addColorStop(0.75, '#081a33'); rg.addColorStop(1, '#040c1a');
    g.fillStyle = rg; g.fillRect(0, 0, 512, 512);
    const bt = new THREE.CanvasTexture(bg); bt.colorSpace = THREE.SRGBColorSpace;
    scene.background = bt;
    scene.fog = new THREE.Fog(0x0a1d38, 12, 34);
    applyEnvironment(this.renderer, scene);
    scene.environmentIntensity = 0.35;
    scene.add(new THREE.HemisphereLight(0x9ac8ff, 0x101828, 0.9));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(-3, 7, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 4; key.shadow.camera.bottom = -4; scene.add(key);
    this.rim = new THREE.DirectionalLight(0x5ad8ff, 3.0); this.rim.position.set(4, 4, -5); scene.add(this.rim);
    const rim2 = new THREE.DirectionalLight(0x6aa0ff, 1.6); rim2.position.set(-5, 3, -4); scene.add(rim2);
    const glow = new THREE.PointLight(0x4ad8ff, 6, 6, 2); glow.position.set(0, 0.6, 0.6); scene.add(glow);
    const add = (m) => { scene.add(m); return m; };
    const gold = new THREE.MeshStandardMaterial({ color: 0xd7a85a, metalness: 0.85, roughness: 0.3 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x1a2b44, metalness: 0.3, roughness: 0.45 });
    const stone2 = new THREE.MeshStandardMaterial({ color: 0x24395a, metalness: 0.35, roughness: 0.4 });
    const cyan = (o = 1) => new THREE.MeshBasicMaterial({ color: 0x5ae0ff, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    // 바닥: 넓은 원형 바닥과 동심원 문양
    const floor = add(new THREE.Mesh(new THREE.CircleGeometry(16, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0d1d33, metalness: 0.6, roughness: 0.35 })));
    floor.receiveShadow = true; floor.position.y = -0.62;
    for (const [r, o] of [[5.2, 0.25], [7.4, 0.14], [9.8, 0.08]]) add(new THREE.Mesh(new THREE.RingGeometry(r, r + 0.05, 96).rotateX(-Math.PI / 2), cyan(o))).position.y = -0.6;
    // 받침대: 3단 + 금색 테
    const ped = new THREE.Group(); scene.add(ped);
    const tier = (r0, r1, h, y, m) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 64), m); t.position.y = y; t.castShadow = t.receiveShadow = true; ped.add(t); return t; };
    tier(2.9, 3.1, 0.22, -0.5, stone);
    tier(2.55, 2.75, 0.22, -0.28, stone2);
    tier(2.15, 2.3, 0.2, -0.08, stone);
    for (const [r, y] of [[3.06, -0.4], [2.7, -0.18], [2.26, 0.02]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 96).rotateX(Math.PI / 2), gold); t.position.y = y; ped.add(t); }
    this.topRing = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.5, 96).rotateX(-Math.PI / 2), cyan(0.7)); this.topRing.position.y = 0.025; ped.add(this.topRing);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.35, 64).rotateX(-Math.PI / 2), cyan(0.1)); disc.position.y = 0.022; ped.add(disc);
    // 앞쪽 금장 문양
    const emb = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4).rotateX(Math.PI), gold); emb.position.set(0, -0.32, 2.85); emb.scale.set(1, 1, 0.3); ped.add(emb);
    // 소용돌이 빛 띠
    this.swirls = [];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.TorusGeometry(1.9 + i * 0.35, 0.012 + i * 0.004, 6, 120, Math.PI * (1.1 + i * 0.25)), cyan(0.75 - i * 0.18));
      s.rotation.x = Math.PI / 2 + 0.18 * (i - 1); s.position.y = 0.25 + i * 0.35; scene.add(s); this.swirls.push(s);
    }
    // 뒤쪽 아치와 원형 문양 (은은하게)
    const arch = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.25, 8, 64, Math.PI), new THREE.MeshStandardMaterial({ color: 0x132a4a, metalness: 0.5, roughness: 0.5, emissive: 0x0a2a55, emissiveIntensity: 0.5 }));
    arch.position.set(0, 1.0, -6.5); scene.add(arch);
    const arch2 = arch.clone(); arch2.scale.setScalar(1.35); arch2.position.z = -8; scene.add(arch2);
    this.halo = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.75, 96), cyan(0.18)); this.halo.position.set(0, 2.0, -4.5); scene.add(this.halo);
    const halo2 = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.34, 96), cyan(0.12)); halo2.position.set(0, 2.0, -4.6); scene.add(halo2);
    // 양옆 기둥 + 깃발
    const bannerTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 320; const x = c.getContext('2d');
      const gr = x.createLinearGradient(0, 0, 0, 320); gr.addColorStop(0, '#1d3a66'); gr.addColorStop(1, '#0c1d38'); x.fillStyle = gr; x.beginPath(); x.moveTo(0, 0); x.lineTo(128, 0); x.lineTo(128, 280); x.lineTo(64, 320); x.lineTo(0, 280); x.closePath(); x.fill();
      x.strokeStyle = '#c9a35a'; x.lineWidth = 5; x.stroke();
      x.fillStyle = '#7ab8e8'; x.globalAlpha = 0.8; x.beginPath(); x.moveTo(64, 110); x.lineTo(88, 160); x.lineTo(64, 215); x.lineTo(40, 160); x.closePath(); x.fill();
      x.strokeStyle = '#7ab8e8'; x.lineWidth = 4; x.beginPath(); x.moveTo(24, 130); x.quadraticCurveTo(40, 190, 64, 200); x.quadraticCurveTo(88, 190, 104, 130); x.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.2, 8), gold); pole.position.set(sx * 4.6, 1.6, -2.6); scene.add(pole);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 4), gold); tip.position.set(sx * 4.6, 4.4, -2.6); scene.add(tip);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6).rotateZ(Math.PI / 2), gold); bar.position.set(sx * 4.6, 3.9, -2.55); scene.add(bar);
      const bn = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.9, 1, 8), new THREE.MeshStandardMaterial({ map: bannerTex, transparent: true, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x0a1a33, emissiveIntensity: 0.6 }));
      bn.position.set(sx * 4.6, 2.4, -2.5); scene.add(bn); (this.banners ||= []).push(bn);
    }
    // 떠다니는 빛 입자
    const N = 160, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 6; pos.set([Math.cos(a) * r, Math.random() * 5 - 0.4, Math.sin(a) * r - 1.5], i * 3); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = document.createElement('canvas'); dot.width = dot.height = 32; const dx = dot.getContext('2d'); const dg = dx.createRadialGradient(16, 16, 0, 16, 16, 16); dg.addColorStop(0, '#fff'); dg.addColorStop(1, 'rgba(255,255,255,0)'); dx.fillStyle = dg; dx.fillRect(0, 0, 32, 32);
    this.motes = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.09, map: new THREE.CanvasTexture(dot), color: 0x8ae8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(this.motes);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    this.t = 0;
    this.loop = () => {
      if (!this.renderer) return;
      const w = innerWidth, h = innerHeight;
      if (this._w !== w || this._h !== h) { this._w = w; this._h = h; this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.frameCamera(); }
      const dt = 1 / 60; this.t += dt;
      if (this.vis) {
        const c = this.cur;
        const p = basePose(c.arche);
        const cyc = this.t % 8;
        if (cyc < 4.5) p.addPose(idleBreath(this.t, c.arche));
        else if (cyc < 6) p.addPose(actionPose(c.arche, 'attack', null, (cyc - 4.5) % 0.75 * 1.2, 0.3, 0.9, Math.floor(cyc * 2)));
        else p.addPose(actionPose(c.arche, 'cast', 'Q', Math.min(0.9, cyc - 6), 0.35, 0.9)).addPose(idleBreath(this.t, c.arche), 0.5);
        this.vis.rig.apply(p);
        this.vis.container.position.y = 0; this.vis.container.position.y = this.vis.rig.groundLift();
        this.vis.root.rotation.y = 0.35 + Math.sin(this.t * 0.35) * 0.35;
        this.vis.updateUprights && this.vis.updateUprights();
        for (const f of this.vis.floats) { f.obj.position.y = (f.instrument ? 1.15 : 1.3) + Math.sin(this.t * 2) * 0.05; if (f.r1) { f.r1.rotation.z = this.t; f.r2.rotation.y = this.t * 1.3; f.planets.forEach((pl, k) => pl.position.set(Math.cos(this.t * (1 + k * 0.4) + k * 2) * 0.38, 0, Math.sin(this.t * (1 + k * 0.4) + k * 2) * 0.38)); } }
      }
      this.swirls.forEach((s, i) => (s.rotation.z = this.t * (0.4 + i * 0.18) * (i % 2 ? -1 : 1)));
      this.topRing.material.opacity = 0.55 + Math.sin(this.t * 2.2) * 0.12;
      this.halo.rotation.z = this.t * 0.05;
      this.motes.rotation.y = this.t * 0.04;
      this.motes.position.y = Math.sin(this.t * 0.5) * 0.1;
      this.banners.forEach((b, i) => (b.rotation.y = Math.sin(this.t * 0.8 + i) * 0.06));
      this.renderer.render(this.scene, this.cam);
      this.raf = requestAnimationFrame(this.loop);
    };
    this.raf = requestAnimationFrame(this.loop);
  }
  frameCamera() {
    // 캐릭터를 가운데 열 중앙, 화면 높이의 약 45%로
    const h = 1.75 * (this.cur ? this.cur.body[1] : 1);
    const narrow = this.cam.aspect < 1.5;
    this.cam.fov = narrow ? 34 : 30;
    this.cam.updateProjectionMatrix();
    this.cam.position.set(0, h * 0.95 + 1.25, 8.2);
    this.cam.lookAt(0, h * 0.42 - 0.05, 0);
  }
  showModel(c) {
    if (this.vis) this.scene.remove(this.vis.root);
    this.cur = c;
    this.vis = createChampionVisual(c);
    this.vis.model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.vis.root.position.y = 0.03;
    this.scene.add(this.vis.root);
    this.rim.color.set(new THREE.Color(c.accent).lerp(new THREE.Color(0x5ad8ff), 0.5));
    this.frameCamera();
  }
  start() {
    this.destroy();
    this.onStart(this.picks);
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss?.(); this.renderer = null; }
    this.root.classList.remove('sel2');
  }
}
function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
