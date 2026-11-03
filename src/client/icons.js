// 스킬 아이콘(캔버스 절차 생성)과 3D 초상화 렌더
import * as THREE from 'three';
import { createChampionVisual } from '../render/champVisual.js';
import { basePose } from '../render/rig.js';

const GLYPH = {
  pang: { P: 'cycle', Q: 'flask', W: 'heart', E: 'drops', R: 'elixir' },
  koo: { P: 'plates', Q: 'shield', W: 'fortress', E: 'charge', R: 'ram' },
  bang: { P: 'mark', Q: 'blade', W: 'ghost', E: 'dash', R: 'ring4' },
  park: { P: 'flame', Q: 'hammer', W: 'quench', E: 'dash', R: 'anvil' },
  jung: { P: 'oath', Q: 'crescent', W: 'shield', E: 'dash', R: 'sun' },
  cha: { P: 'arrows', Q: 'arrow', W: 'eye', E: 'wind', R: 'rain' },
  sagong: { P: 'stars', Q: 'star', W: 'vortex', E: 'orbit', R: 'meteor' },
  cho: { P: 'paw', Q: 'fang', W: 'leaf', E: 'leap', R: 'beast' },
  kim: { P: 'bolt', Q: 'shell', W: 'mine', E: 'recoil', R: 'grid' },
  choi: { P: 'snow', Q: 'icebolt', W: 'frostzone', E: 'slide', R: 'zero' },
  flame: { P: 'ember', Q: 'fireball', W: 'pillar', E: 'firedash', R: 'storm' },
  lee: { P: 'chord', Q: 'wave', W: 'harmony', E: 'boots', R: 'resonance' },
};
function drawGlyph(ctx, g, S, c) {
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = S * 0.06; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const s = S * 0.3;
  const P = (pts, close = false, fill = false) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s))); if (close) ctx.closePath(); fill ? ctx.fill() : ctx.stroke(); };
  const circ = (x, y, r, fill = false) => { ctx.beginPath(); ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2); fill ? ctx.fill() : ctx.stroke(); };
  switch (g) {
    case 'flask': P([[-0.25, -1], [0.25, -1], [0.25, -0.4], [0.8, 0.7], [-0.8, 0.7], [-0.25, -0.4]], true); P([[-0.6, 0.35], [0.6, 0.35], [0.75, 0.68], [-0.75, 0.68]], true, true); break;
    case 'heart': ctx.beginPath(); ctx.moveTo(0, 0.8 * s); ctx.bezierCurveTo(-1.2 * s, -0.1 * s, -0.6 * s, -1.1 * s, 0, -0.4 * s); ctx.bezierCurveTo(0.6 * s, -1.1 * s, 1.2 * s, -0.1 * s, 0, 0.8 * s); ctx.fill(); break;
    case 'drops': for (const [x, y] of [[-0.5, 0.1], [0.4, -0.3], [0.1, 0.6]]) { ctx.beginPath(); ctx.moveTo(x * s, (y - 0.45) * s); ctx.quadraticCurveTo((x + 0.35) * s, (y + 0.1) * s, x * s, (y + 0.3) * s); ctx.quadraticCurveTo((x - 0.35) * s, (y + 0.1) * s, x * s, (y - 0.45) * s); ctx.fill(); } break;
    case 'elixir': circ(0, 0, 0.95); P([[-0.25, -0.6], [0.25, -0.6], [0.25, -0.2], [0.55, 0.5], [-0.55, 0.5], [-0.25, -0.2]], true, true); break;
    case 'cycle': ctx.beginPath(); ctx.arc(0, 0, 0.75 * s, 0.3, Math.PI * 1.7); ctx.stroke(); P([[0.55, -0.75], [0.75, -0.45], [0.4, -0.35]], true, true); break;
    case 'shield': P([[0, -1], [0.85, -0.65], [0.7, 0.3], [0, 1], [-0.7, 0.3], [-0.85, -0.65]], true); circ(0, -0.05, 0.25, true); break;
    case 'plates': for (let i = 0; i < 3; i++) P([[-0.8, -0.6 + i * 0.5], [0, -0.85 + i * 0.5], [0.8, -0.6 + i * 0.5]]); break;
    case 'fortress': P([[-0.9, 0.9], [-0.9, -0.4], [-0.5, -0.4], [-0.5, -0.8], [0.5, -0.8], [0.5, -0.4], [0.9, -0.4], [0.9, 0.9]], true); break;
    case 'charge': case 'ram': P([[-0.9, -0.3], [0.2, -0.3], [0.2, -0.75], [0.95, 0], [0.2, 0.75], [0.2, 0.3], [-0.9, 0.3]], true, g === 'ram'); if (g === 'ram') { P([[-1, -0.7], [-0.6, -0.7]]); P([[-1, 0.7], [-0.6, 0.7]]); } break;
    case 'mark': P([[-0.7, -0.7], [0.7, 0.7]]); P([[0.7, -0.7], [-0.7, 0.7]]); circ(0, 0, 0.95); break;
    case 'blade': P([[-0.9, 0.9], [0.4, -0.4], [0.9, -0.9], [0.6, -0.2], [-0.6, 0.95]], true, true); break;
    case 'ghost': ctx.globalAlpha = 0.5; circ(-0.25, -0.2, 0.5, true); ctx.globalAlpha = 1; circ(0.25, 0.2, 0.5, true); break;
    case 'dash': P([[-0.9, 0], [0.9, 0]]); P([[0.4, -0.5], [0.9, 0], [0.4, 0.5]]); P([[-0.9, -0.5], [-0.3, -0.5]]); P([[-0.9, 0.5], [-0.3, 0.5]]); break;
    case 'ring4': for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.78; circ(Math.cos(a) * 0.65, Math.sin(a) * 0.65, 0.2, true); } P([[-0.5, 0.5], [0.5, -0.5]]); break;
    case 'flame': ctx.beginPath(); ctx.moveTo(0, -1 * s); ctx.quadraticCurveTo(0.9 * s, 0, 0.5 * s, 0.8 * s); ctx.quadraticCurveTo(0, 1 * s, -0.5 * s, 0.8 * s); ctx.quadraticCurveTo(-0.9 * s, 0, 0, -1 * s); ctx.fill(); break;
    case 'hammer': ctx.fillRect(-0.7 * s, -0.95 * s, 1.4 * s, 0.6 * s); ctx.fillRect(-0.1 * s, -0.4 * s, 0.2 * s, 1.4 * s); break;
    case 'quench': circ(0, 0, 0.8); P([[-0.4, -0.1], [0, 0.4], [0.4, -0.1]]); P([[0, -0.6], [0, 0.4]]); break;
    case 'anvil': P([[-1, -0.3], [0.9, -0.3], [0.5, 0.1], [0.3, 0.1], [0.4, 0.7], [-0.5, 0.7], [-0.4, 0.1], [-0.6, 0.1]], true, true); break;
    case 'oath': P([[0, -1], [0, 1]]); P([[-0.6, -0.4], [0.6, -0.4]]); circ(0, -0.4, 0.3); break;
    case 'crescent': ctx.beginPath(); ctx.arc(0, 0, 0.9 * s, -1.2, 1.2); ctx.arc(-0.35 * s, 0, 0.75 * s, 1.0, -1.0, true); ctx.fill(); break;
    case 'sun': circ(0, 0, 0.45, true); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P([[Math.cos(a) * 0.65, Math.sin(a) * 0.65], [Math.cos(a) * 0.95, Math.sin(a) * 0.95]]); } break;
    case 'arrows': for (let i = 0; i < 3; i++) P([[-0.9, -0.5 + i * 0.5], [0.6, -0.5 + i * 0.5], [0.4, -0.65 + i * 0.5]]); break;
    case 'arrow': P([[-0.9, 0.9], [0.9, -0.9]]); P([[0.3, -0.9], [0.9, -0.9], [0.9, -0.3]]); P([[-0.9, 0.5], [-0.5, 0.9]]); break;
    case 'eye': ctx.beginPath(); ctx.moveTo(-1 * s, 0); ctx.quadraticCurveTo(0, -0.9 * s, 1 * s, 0); ctx.quadraticCurveTo(0, 0.9 * s, -1 * s, 0); ctx.stroke(); circ(0, 0, 0.3, true); break;
    case 'wind': for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-0.9 * s, (-0.5 + i * 0.5) * s); ctx.quadraticCurveTo(0.3 * s, (-0.8 + i * 0.5) * s, 0.8 * s, (-0.4 + i * 0.5) * s); ctx.stroke(); } break;
    case 'rain': for (let i = 0; i < 5; i++) P([[-0.8 + i * 0.4, -0.9], [-0.5 + i * 0.4, 0.9]]); break;
    case 'star': case 'stars': { const n = g === 'stars' ? 3 : 1; for (let k = 0; k < n; k++) { const ox = n > 1 ? [-0.5, 0.5, 0][k] : 0, oy = n > 1 ? [0.3, 0.3, -0.5][k] : 0, rr = n > 1 ? 0.45 : 1; ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = (i % 2 ? 0.4 : 1) * rr, a = (i / 10) * Math.PI * 2 - Math.PI / 2; ctx.lineTo((ox + Math.cos(a) * r) * s, (oy + Math.sin(a) * r) * s); } ctx.closePath(); ctx.fill(); } break; }
    case 'vortex': for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, (0.3 + i * 0.3) * s, i, i + 4); ctx.stroke(); } break;
    case 'orbit': ctx.beginPath(); ctx.ellipse(0, 0, 0.95 * s, 0.4 * s, -0.5, 0, Math.PI * 2); ctx.stroke(); circ(0, 0, 0.25, true); circ(0.7, -0.45, 0.15, true); break;
    case 'meteor': circ(0.4, 0.4, 0.4, true); for (let i = 0; i < 3; i++) P([[0.1 - i * 0.2, 0.1 + i * 0.2 - 0.2], [-0.8 - i * 0.1, -0.8 + i * 0.25]]); break;
    case 'paw': circ(0, 0.3, 0.45, true); for (const [x, y] of [[-0.6, -0.35], [-0.2, -0.75], [0.2, -0.75], [0.6, -0.35]]) circ(x, y, 0.2, true); break;
    case 'fang': P([[-0.6, -0.8], [-0.3, 0.8], [0, -0.8]], true, true); P([[0.2, -0.8], [0.5, 0.5], [0.8, -0.8]], true, true); break;
    case 'leaf': ctx.beginPath(); ctx.moveTo(-0.8 * s, 0.8 * s); ctx.quadraticCurveTo(-0.8 * s, -0.8 * s, 0.8 * s, -0.8 * s); ctx.quadraticCurveTo(0.8 * s, 0.8 * s, -0.8 * s, 0.8 * s); ctx.fill(); break;
    case 'leap': ctx.beginPath(); ctx.moveTo(-0.9 * s, 0.7 * s); ctx.quadraticCurveTo(0, -1.2 * s, 0.9 * s, 0.7 * s); ctx.stroke(); P([[0.5, 0.4], [0.9, 0.7], [0.95, 0.2]]); break;
    case 'beast': P([[-0.9, 0.6], [-0.6, -0.9], [-0.2, -0.2], [0.2, -0.2], [0.6, -0.9], [0.9, 0.6], [0, 0.95]], true, true); break;
    case 'bolt': P([[0.2, -1], [-0.5, 0.1], [0, 0.1], [-0.2, 1], [0.5, -0.2], [0, -0.2]], true, true); break;
    case 'shell': circ(0.3, 0.3, 0.45, true); ctx.beginPath(); ctx.moveTo(-0.9 * s, 0.6 * s); ctx.quadraticCurveTo(-0.6 * s, -1 * s, 0.1 * s, -0.1 * s); ctx.stroke(); break;
    case 'mine': circ(0, 0, 0.5, true); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P([[Math.cos(a) * 0.55, Math.sin(a) * 0.55], [Math.cos(a) * 0.9, Math.sin(a) * 0.9]]); } break;
    case 'recoil': P([[0.9, 0], [-0.3, 0]]); P([[-0.3, -0.5], [-0.9, 0], [-0.3, 0.5]]); circ(0.6, 0, 0.3, true); break;
    case 'grid': for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) circ(-0.6 + i * 0.6, -0.6 + j * 0.6, 0.18, (i + j) % 2 === 0); break;
    case 'chord': for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0.9 * s, (0.5 + i * 0.4) * s, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke(); } break;
    case 'wave': for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-0.8 * s, 0, (0.5 + i * 0.4) * s, -0.9, 0.9); ctx.stroke(); } break;
    case 'harmony': circ(0, 0, 0.9); circ(0, 0, 0.5); circ(0, 0, 0.15, true); break;
    case 'boots': P([[-0.4, -0.9], [0.1, -0.9], [0.1, 0.3], [0.9, 0.5], [0.9, 0.9], [-0.4, 0.9]], true, true); P([[-1, -0.3], [-0.6, -0.3]]); P([[-1, 0.2], [-0.6, 0.2]]); break;
    case 'resonance': for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-0.9 * s, 0, (0.3 + i * 0.35) * s, -0.7, 0.7); ctx.stroke(); } break;
    case 'snow': for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P([[0, 0], [Math.cos(a) * 0.95, Math.sin(a) * 0.95]]); P([[Math.cos(a) * 0.55 + Math.cos(a + 1) * 0.25, Math.sin(a) * 0.55 + Math.sin(a + 1) * 0.25], [Math.cos(a) * 0.55, Math.sin(a) * 0.55], [Math.cos(a) * 0.55 + Math.cos(a - 1) * 0.25, Math.sin(a) * 0.55 + Math.sin(a - 1) * 0.25]]); } break;
    case 'icebolt': P([[0.95, -0.95], [-0.1, -0.35], [-0.75, 0.75], [-0.35, -0.1]], true, true); for (const k of [0.2, 0.5]) P([[-0.9 + k * 0.3, 0.3 + k], [-1, 0.95 - k * 0.2]]); break;
    case 'frostzone': ctx.beginPath(); ctx.ellipse(0, 0.35 * s, 0.95 * s, 0.4 * s, 0, 0, Math.PI * 2); ctx.stroke(); for (const [x, h] of [[-0.45, 0.8], [0, 1.15], [0.45, 0.7]]) P([[x - 0.17, 0.35], [x, 0.35 - h], [x + 0.17, 0.35]], true, true); break;
    case 'slide': P([[-0.9, 0.7], [0.9, 0.7]]); P([[-0.6, 0.35], [0.7, -0.7], [0.95, -0.35], [-0.2, 0.55]], true, true); P([[-1, -0.2], [-0.5, -0.2]]); P([[-0.9, 0.15], [-0.45, 0.15]]); break;
    case 'zero': circ(0, 0, 0.92); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P([[Math.cos(a) * 0.3, Math.sin(a) * 0.3], [Math.cos(a) * 0.75, Math.sin(a) * 0.75]]); } circ(0, 0, 0.22, true); break;
    case 'ember': for (const [x, y, r] of [[0, 0.2, 0.75], [-0.55, -0.45, 0.4], [0.6, -0.55, 0.32]]) { ctx.beginPath(); ctx.moveTo(x * s, (y - r) * s); ctx.quadraticCurveTo((x + r * 0.9) * s, y * s, x * s, (y + r * 0.8) * s); ctx.quadraticCurveTo((x - r * 0.9) * s, y * s, x * s, (y - r) * s); ctx.fill(); } break;
    case 'fireball': circ(0.35, -0.35, 0.5, true); ctx.beginPath(); ctx.moveTo(0.0 * s, -0.75 * s); ctx.quadraticCurveTo(-0.5 * s, -0.2 * s, -1.0 * s, 0.95 * s); ctx.quadraticCurveTo(-0.2 * s, 0.4 * s, 0.75 * s, 0.05 * s); ctx.fill(); break;
    case 'pillar': ctx.beginPath(); ctx.moveTo(-0.45 * s, 0.85 * s); ctx.quadraticCurveTo(-0.6 * s, -0.2 * s, 0, -1 * s); ctx.quadraticCurveTo(0.6 * s, -0.2 * s, 0.45 * s, 0.85 * s); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, 0.85 * s, 0.9 * s, 0.18 * s, 0, 0, Math.PI * 2); ctx.stroke(); break;
    case 'firedash': for (let i = 0; i < 3; i++) { const x = -0.7 + i * 0.5; ctx.beginPath(); ctx.moveTo(x * s, -0.5 * s + i * 0.1 * s); ctx.quadraticCurveTo((x + 0.35) * s, 0.2 * s, x * s, 0.8 * s); ctx.quadraticCurveTo((x - 0.3) * s, 0.2 * s, x * s, -0.5 * s + i * 0.1 * s); ctx.fill(); } P([[0.4, -0.6], [0.95, 0], [0.4, 0.6]]); break;
    case 'storm': for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, (0.3 + i * 0.3) * s, i * 2, i * 2 + 4.2); ctx.stroke(); } circ(0, 0, 0.18, true); break;
    default: circ(0, 0, 0.7, true);
  }
  ctx.restore();
}
const iconCache = new Map();
export function skillIcon(champ, slot, S = 96) {
  const key = champ.id + slot + S;
  if (iconCache.has(key)) return iconCache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const acc = '#' + champ.accent.toString(16).padStart(6, '0');
  const trim = '#' + champ.trim.toString(16).padStart(6, '0');
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#16202c'); g.addColorStop(0.55, trim); g.addColorStop(1, '#0c121a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  // 붓 터치 질감
  for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; ctx.beginPath(); ctx.ellipse(Math.random() * S, Math.random() * S, S * 0.3, S * 0.05, Math.random() * 3, 0, 7); ctx.fill(); }
  const rg = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.6);
  rg.addColorStop(0, acc + '88'); rg.addColorStop(1, '#0000');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, S, S);
  ctx.shadowColor = acc; ctx.shadowBlur = S * 0.12;
  drawGlyph(ctx, GLYPH[champ.id]?.[slot] || 'star', S, slot === 'R' ? '#fff2c8' : '#f4f8ff');
  const url = cv.toDataURL();
  iconCache.set(key, url);
  return url;
}

// 3D 초상화: 실제 챔피언 모델을 오프스크린 렌더
let pr = null;
export function renderPortraits(champs, size = 192) {
  if (!pr) {
    const canvas = document.createElement('canvas');
    pr = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    pr.setSize(size, size); pr.outputColorSpace = THREE.SRGBColorSpace; pr.toneMapping = THREE.ACESFilmicToneMapping;
  }
  const out = {};
  for (const c of champs) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3020, 1.4));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4); key.position.set(-1.5, 2.5, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(new THREE.Color(c.accent), 2.2); rim.position.set(2, 1.5, -2); scene.add(rim);
    const v = createChampionVisual(c);
    v.rig.apply(basePose(c.arche));
    v.root.rotation.y = 0.35; v.updateUprights && v.updateUprights();
    v.root.rotation.y = 0.35;
    scene.add(v.root);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
    const h = 1.75 * c.body[1];
    cam.position.set(0.15, h * 0.78, 2.2); cam.lookAt(0, h * 0.72, 0);
    pr.setClearColor(0x000000, 0);
    pr.render(scene, cam);
    out[c.id] = pr.domElement.toDataURL('image/png');
  }
  return out;
}
