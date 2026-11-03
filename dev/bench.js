import * as THREE from 'three';
import { buildGrid, groundHeight } from '../src/map/grid.js';
import { TURRETS, BASES } from '../src/map/layout.js';
import { makeGroundTextures } from '../src/render/textures.js';
import { buildTerrain, buildWater, sharedUniforms } from '../src/render/terrain.js';
import { buildProps } from '../src/render/props.js';
import { buildTurret, buildNexus, buildFountain, buildShop, buildBanner } from '../src/render/structures.js';
import { createRenderer, createScene, QuarterCamera, QUALITY, updateSunFollow, applyEnvironment } from '../src/render/scene.js';
import { loadModelTemplates, createChampionVisual, setAssetBase } from '../src/render/champVisual.js';
import { basePose, locomotion, actionPose, idleBreath, Pose, weaponMotion } from '../src/render/rig.js';
import { CHAMPIONS } from '../src/data/champions.js';
import { loadHeroAssets } from '../src/render/heroAssets.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'scene';
const W = innerWidth, H = innerHeight;
const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
const q = QUALITY[params.get('q') || 'high'];
const renderer = createRenderer(canvas, q); renderer.setSize(W, H);
const { scene, sun } = createScene(q);
applyEnvironment(renderer, scene);
const qc = new QuarterCamera(W / H); qc.setAspect(W / H);
window.INFO = {};
setAssetBase('../');

async function main() {
  const t0 = performance.now();
  buildGrid();
  const champs = (params.get('champs') || 'pang,koo').split(',').map((id) => CHAMPIONS.find((c) => c.id === id));
  await loadModelTemplates([...new Set(champs.map((c) => c.model))]);
  if(params.get('hero')) await loadHeroAssets('../');
  if (mode === 'poses') return poses(champs);
  if (mode === 'feet') return feet(champs);
  if (mode === 'lineup') return lineup(champs);
  if (mode === 'kit') return kitSheet(champs);
  const tex = makeGroundTextures();
  scene.add(buildTerrain(tex, q));
  scene.add(buildWater());
  const props = buildProps(q);
  scene.add(props.group);
  for (const t of TURRETS) { const m = buildTurret(t.team); m.position.set(t.p.x, groundHeight(t.p.x, t.p.z), t.p.z); scene.add(m); }
  for (const b of BASES) {
    const n = buildNexus(b.team); n.position.set(b.nexus.x, 0, b.nexus.z); scene.add(n);
    const f = buildFountain(b.team); f.position.set(b.fountain.x, 0, b.fountain.z); scene.add(f);
    const s = buildShop(b.team); s.position.set(b.shop.x, 0, b.shop.z); scene.add(s);
  }
  const cx = +(params.get('x') ?? -9), cz = +(params.get('z') ?? 9);
  const vis = champs.map((c, i) => { const v = createChampionVisual(c); scene.add(v.root); v.root.position.set(cx - 2 + i * 3, 0, cz + 1); return v; });
  window.INFO.build = Math.round(performance.now() - t0);
  window.INFO.props = props.stats;
  qc.goal.set(cx, 0, cz); qc.target.copy(qc.goal); qc.dist = +(params.get('d') || 21);
  let t = +(params.get('t') || 0.4);
  const anim = params.get('anim') || 'mix';
  const frame = () => {
    sharedUniforms.uTime.value = t;
    vis.forEach((v, i) => {
      const c = champs[i];
      const p = basePose(c.arche);
      if (anim === 'run' || (anim === 'mix' && i === 0)) {
        p.addPose(locomotion(t * 9, 1, c.arche, v.rig.legLen));
        v.root.position.x = cx - 2 + i * 3 + ((t * 3.3) % 10) - 5;
        v.root.rotation.y = Math.PI / 2;
      } else {
        const at = t % 1.4;
        p.addPose(idleBreath(t, c.arche));
        if (at < 1.0) p.addPose(actionPose(c.arche, 'attack', null, at, 0.32, 1.0, Math.floor(t / 1.4)));
        v.root.rotation.y = -Math.PI / 2 + 0.5;
      }
      v.rig.apply(p);
      v.root.position.y = groundHeight(v.root.position.x, v.root.position.z);
      for (const f of v.floats) { f.obj.position.y = (f.instrument ? 1.15 : 1.25) + Math.sin(t * 2) * 0.05; if (f.r1) { f.r1.rotation.z = t; f.r2.rotation.y = t * 1.3; f.planets.forEach((pl, k) => pl.position.set(Math.cos(t * (1 + k * 0.4) + k * 2) * 0.38, Math.sin(t * (1 + k * 0.4) + k * 2) * 0.1, Math.sin(t * (1 + k * 0.4) + k * 2) * 0.38)); } }
    });
    qc.update(1, null);
    updateSunFollow(sun, qc.target);
    renderer.render(scene, qc.cam);
  };
  if (params.get('live')) { const loop = () => { t += 1 / 60; frame(); requestAnimationFrame(loop); }; loop(); }
  else { frame(); frame(); }
  if (params.get('dbg')) {
    const gl = renderer.getContext(); const bad = [];
    scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) {
      const vis0 = []; scene.traverse((x) => { if (x.isMesh) { vis0.push([x, x.visible]); x.visible = false; } });
      let p = o; while (p) { p.visible = true; p = p.parent; }
      gl.getError(); renderer.render(scene, qc.cam); const e = gl.getError();
      if (e) bad.push((o.name || o.type) + ':' + (o.material.type) + ':' + (o.material.name||'') + ':' + o.parent?.type);
      vis0.forEach(([x, v]) => (x.visible = v));
    } });
    window.INFO.bad = [...new Set(bad)].slice(0, 20);
  }
  window.INFO.calls = renderer.info.render.calls; window.INFO.tris = renderer.info.render.triangles;
  window.DONE = true;
}

function poses(champs) {
  // 포즈 확인: 각 챔피언 × [대기, 달리기 4프레임, 공격 3프레임]
  scene.background = new THREE.Color(0x5a6a72);
  scene.fog = null;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x6a7a5a }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const frames = [['idle', 0], ['run', 0], ['run', Math.PI / 2], ['run', Math.PI], ['run', Math.PI * 1.5], ['atk', 0.16], ['atk', 0.36], ['atk', 0.6]];
  const side = params.get('side') === '1';
  champs.forEach((c, r) => {
    frames.forEach(([k, v], i) => {
      const vis = createChampionVisual(c);
      vis.root.position.set(i * 2.3 - 8, 0, r * 2.6 - (champs.length - 1) * 1.3);
      vis.root.rotation.y = side ? Math.PI / 2 : 0.35;
      const p = basePose(c.arche);
      if (k === 'run') p.addPose(locomotion(v, 1, c.arche, vis.rig.legLen));
      if (k === 'atk') p.addPose(actionPose(c.arche, 'attack', null, v, 0.32, 1.0));
      vis.rig.apply(p);
      scene.add(vis.root);
    });
  });
  const cam = new THREE.PerspectiveCamera(24, W / H, 1, 200);
  const rows = champs.length;
  const zoom = +(params.get('zoom') || 1); cam.position.set(0, (1.2 + rows * 1.5) / zoom, (13 + rows * 4) / zoom); cam.lookAt(+(params.get('lx') || 0), 0.8, 0);
  sun.position.set(-6, 12, 10);
  renderer.render(scene, cam);
  window.DONE = true;
}
main().catch((e) => { console.error(e.stack || e); window.DONE = true; });

// 발 미끄러짐 / 지면 관통 측정: ChampionView와 같은 보폭 공식으로 이동하면서 발 뼈 위치 추적
function feet(champs) {
  const out = {};
  for (const c of champs) {
    const v = createChampionVisual(c);
    scene.add(v.root);
    const speed = c.stats.ms;
    const stride = v.rig.legLen * 3.1 * c.body[1];
    let phase = 0, x = 0;
    const dt = 1 / 240;
    const samples = [];
    const fL = v.rig.bones.Left_Foot, fR = v.rig.bones.Right_Foot;
    const toes = [];
    v.model.traverse((o) => { if (o.isBone && /Toes$/.test(o.name)) toes.push(o); });
    const p = new THREE.Vector3();
    for (let i = 0; i < 240 * 3; i++) {
      phase += (speed / stride) * Math.PI * 2 * dt;
      x += speed * dt;
      v.root.position.set(0, 0, x); v.root.rotation.y = 0; // +Z 방향 이동
      const pose = basePose(c.arche).addPose(locomotion(phase, Math.min(1.1, speed / 3.3), c.arche, v.rig.legLen));
      v.rig.apply(pose);
      v.container.position.y = 0; v.container.position.y = v.rig.groundLift();
      v.root.updateMatrixWorld(true);
      const rec = {};
      for (const [k, bone] of [['L', fL], ['R', fR]]) { bone.getWorldPosition(p); rec[k] = { y: p.y, z: p.z }; }
      rec.toeMin = Math.min(...toes.map((t) => t.getWorldPosition(p).y));
      samples.push(rec);
    }
    // 정지 발(가장 낮은 구간)의 수평 속도
    const res = { stride: +stride.toFixed(3), speed };
    for (const k of ['L', 'R']) {
      const ys = samples.map((s) => s[k].y), minY = Math.min(...ys);
      let slip = [], n = 0;
      for (let i = 241; i < samples.length; i++) {
        if (samples[i][k].y < minY + 0.015) { slip.push(Math.abs(samples[i][k].z - samples[i - 1][k].z) / dt); n++; }
      }
      slip.sort((a, b) => a - b);
      res[k] = { plantedFrac: +(n / (samples.length - 241)).toFixed(2), medianSlip: +slip[Math.floor(slip.length / 2)].toFixed(2), slipRatio: +(slip[Math.floor(slip.length / 2)] / speed).toFixed(2), footMinY: +minY.toFixed(3) };
    }
    res.toeMinY = +Math.min(...samples.map((s) => s.toeMin)).toFixed(3);
    out[c.id] = res;
    scene.remove(v.root);
  }
  window.INFO = out;
  window.DONE = true;
}

function lineup(champs) {
  scene.background = new THREE.Color(0x2a3a3a); scene.fog = null;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x5a6a4a }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  champs.forEach((c, i) => {
    const v = createChampionVisual(c);
    const row = i < 5 ? 0 : 1;
    v.root.position.set((i % 5) * 2.1 - 4.2, 0, row * 2.6 - 1.3);
    v.root.rotation.y = 0.3;
    const p = basePose(c.arche);
    if (params.get('atk')) p.addPose(actionPose(c.arche, 'cast', 'Q', 0.32, 0.3, 0.9));
    v.rig.apply(p);
    v.container.position.y = v.rig.groundLift();
    for (const f of v.floats) f.obj.position.y = 1.3;
    scene.add(v.root);
  });
  const cam = new THREE.PerspectiveCamera(30, W / H, 1, 100);
  cam.position.set(0, 6.5, 11.5); cam.lookAt(0, 0.8, 0);
  sun.position.set(-6, 12, 10);
  renderer.render(scene, cam);
  window.DONE = true;
}

// 장비 점검: 챔피언마다 [정면, 3/4, 측면, 후면, 공격, 시전, 달리기] — 겹침·뜬 부품 확인용 근접 시트
function kitSheet(champs) {
  scene.background = new THREE.Color(0x4a5560); scene.fog = null;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x5a6650 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const cols = params.get('atk') ? [0.05, 0.15, 0.25, 0.3, 0.34, 0.42, 0.6].map((t) => ['atk', t]) : [['idle', 0], ['idle', 0.8], ['idle', Math.PI / 2], ['idle', Math.PI], ['atk', 0.35], ['cast', 0.45], ['run', 0.6]];
  champs.forEach((c, r) => {
    cols.forEach(([k, ry], i) => {
      const v = createChampionVisual(c);
      v.root.position.set(i * 1.32 - 3.96, 0, r * -2.2);
      v.root.rotation.y = k === 'idle' ? ry : +(params.get('ry') ?? 0.6);
      const p = basePose(c.arche);
      if (k === 'atk') p.addPose(actionPose(c.arche, 'attack', null, ry, 0.3, 0.9, +(params.get('var') || 0)));
      if (k === 'cast') p.addPose(actionPose(c.arche, 'cast', 'Q', ry, 0.3, 0.9));
      if (k === 'run') p.addPose(locomotion(1.2, 1, c.arche, v.rig.legLen));
      v.rig.apply(p);
      for (const f of v.floats) f.obj.position.y = f.anchor?.[1] ?? (f.instrument ? 1.15 : 1.3);
      v.updateUprights && v.updateUprights();
      scene.add(v.root);
      if (k === 'atk' && v.weaponPose) v.weaponPose('right', weaponMotion(c.arche, 'attack', ry, 0.3, 0.9));
    });
  });
  const n = champs.length;
  const cam = new THREE.PerspectiveCamera(22, W / H, 0.5, 200);
  const zf = +(params.get('zoom') || 1), lx = +(params.get('lx') || 0); cam.position.set(lx, 2.4 / zf + 0.5, 12.8 / zf); cam.lookAt(lx, 0.85, 0);
  sun.position.set(-6, 12, 10);
  renderer.render(scene, cam);
  window.DONE = true;
}
