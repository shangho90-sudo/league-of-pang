// 신규 아이템 아이콘 그리기 (캔버스 → public/art/items/<id>.webp)
// 기존 아이콘(상점 시안에서 잘라낸 것)과 같은 틀: 짙은 청록 배경 + 금테 + 광택 있는 물체
import { chromium } from 'playwright';
import fs from 'fs';

const painter = () => {
  const S = 192;
  const tile = (ctx, hue = '#123040') => {
    const g = ctx.createRadialGradient(S * 0.5, S * 0.45, 4, S * 0.5, S * 0.5, S * 0.75);
    g.addColorStop(0, hue); g.addColorStop(1, '#060c14');
    ctx.fillStyle = g; rr(ctx, 6, 6, S - 12, S - 12, 22); ctx.fill();
    const fr = ctx.createLinearGradient(0, 0, S, S);
    fr.addColorStop(0, '#f5d58a'); fr.addColorStop(0.5, '#8a6424'); fr.addColorStop(1, '#e9c26c');
    ctx.lineWidth = 6; ctx.strokeStyle = fr; rr(ctx, 6, 6, S - 12, S - 12, 22); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; rr(ctx, 11, 11, S - 22, S - 22, 18); ctx.stroke();
    rr(ctx, 12, 12, S - 24, S - 24, 18); ctx.clip();
    ctx.translate(96, 100); ctx.scale(1.2, 1.2); ctx.translate(-96, -100);
  };
  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  const lin = (ctx, x0, y0, x1, y1, stops) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  const rad = (ctx, x, y, r, stops) => { const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.05, x, y, r); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  const gold = (ctx) => lin(ctx, 0, 40, 0, 160, [[0, '#fff0b8'], [0.35, '#e0b04a'], [0.7, '#8a5a18'], [1, '#d9a848']]);
  const steel = (ctx, x0, y0, x1, y1) => lin(ctx, x0, y0, x1, y1, [[0, '#f4f8ff'], [0.45, '#a9b6c6'], [0.55, '#6c7a8c'], [1, '#dfe7f2']]);
  const outline = (ctx, w = 3) => { ctx.lineWidth = w; ctx.strokeStyle = 'rgba(10,8,6,0.85)'; ctx.stroke(); };
  const shadow = (ctx, on) => { ctx.shadowColor = on ? 'rgba(0,0,0,0.6)' : 'transparent'; ctx.shadowBlur = on ? 10 : 0; ctx.shadowOffsetY = on ? 5 : 0; };
  const glow = (ctx, x, y, r, c) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
  const gem = (ctx, x, y, r, c1, c2) => {
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath();
    ctx.fillStyle = rad(ctx, x, y, r, [[0, '#ffffff'], [0.25, c1], [1, c2]]); ctx.fill(); outline(ctx, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.25, r * 0.12, -0.6, 0, 7); ctx.fill();
  };
  const P = (ctx, pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };

  const D = {
    ring(ctx) {
      tile(ctx, '#123a2c'); glow(ctx, 96, 92, 70, 'rgba(120,255,160,0.25)'); shadow(ctx, true);
      ctx.lineWidth = 20; ctx.strokeStyle = gold(ctx); ctx.beginPath(); ctx.ellipse(96, 112, 46, 34, 0, 0, 7); ctx.stroke();
      shadow(ctx, false); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(40,20,0,0.8)'; ctx.beginPath(); ctx.ellipse(96, 112, 56, 44, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(96, 112, 36, 24, 0, 0, 7); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,250,210,0.7)'; ctx.beginPath(); ctx.ellipse(96, 112, 50, 38, 0, 3.6, 4.6); ctx.stroke();
      ctx.fillStyle = gold(ctx); P(ctx, [[70, 82], [122, 82], [112, 64], [80, 64]]); ctx.fill(); outline(ctx, 2);
      gem(ctx, 96, 58, 24, '#7dff9a', '#0f6a34');
    },
    amulet(ctx) {
      tile(ctx, '#142a48'); glow(ctx, 96, 112, 70, 'rgba(110,170,255,0.28)');
      ctx.lineWidth = 5; ctx.strokeStyle = gold(ctx); ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(40, 30); ctx.quadraticCurveTo(96, 110, 152, 30); ctx.stroke(); ctx.setLineDash([]);
      shadow(ctx, true); ctx.fillStyle = gold(ctx); P(ctx, [[96, 64], [140, 108], [96, 166], [52, 108]]); ctx.fill(); shadow(ctx, false); outline(ctx);
      ctx.fillStyle = '#2a1a08'; P(ctx, [[96, 76], [128, 108], [96, 152], [64, 108]]); ctx.fill();
      gem(ctx, 96, 110, 28, '#8fc8ff', '#14307a');
      ctx.fillStyle = gold(ctx); ctx.beginPath(); ctx.arc(96, 62, 9, 0, 7); ctx.fill(); outline(ctx, 2);
    },
    windboots(ctx) {
      tile(ctx, '#123a44'); glow(ctx, 100, 100, 70, 'rgba(120,240,255,0.22)'); shadow(ctx, true);
      ctx.fillStyle = lin(ctx, 60, 30, 130, 160, [[0, '#7fe6e0'], [0.5, '#2a8c96'], [1, '#124a58']]);
      P(ctx, [[70, 36], [118, 36], [116, 112], [158, 128], [162, 156], [52, 158], [56, 132], [68, 116]]); ctx.fill(); shadow(ctx, false); outline(ctx);
      ctx.fillStyle = gold(ctx); P(ctx, [[66, 36], [122, 36], [120, 50], [68, 50]]); ctx.fill(); outline(ctx, 2);
      P(ctx, [[52, 146], [162, 146], [162, 158], [52, 158]]); ctx.fill(); outline(ctx, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; P(ctx, [[78, 54], [88, 54], [86, 110], [76, 112]]); ctx.fill();
      ctx.fillStyle = lin(ctx, 120, 50, 170, 100, [[0, '#ffffff'], [1, '#a8d8e8']]);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(116, 66 + i * 14); ctx.quadraticCurveTo(150, 52 + i * 14, 172, 58 + i * 16); ctx.quadraticCurveTo(146, 74 + i * 14, 116, 80 + i * 14); ctx.closePath(); ctx.fill(); outline(ctx, 2); }
    },
    thorn(ctx) {
      tile(ctx, '#2a2a30'); shadow(ctx, true);
      ctx.fillStyle = steel(ctx, 40, 40, 150, 160);
      P(ctx, [[58, 44], [134, 44], [154, 70], [146, 130], [96, 162], [46, 130], [38, 70]]); ctx.fill(); shadow(ctx, false); outline(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; P(ctx, [[96, 50], [146, 72], [140, 128], [96, 156]]); ctx.fill();
      ctx.strokeStyle = gold(ctx); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(96, 54); ctx.lineTo(96, 150); ctx.stroke();
      ctx.fillStyle = steel(ctx, 0, 0, 30, 30);
      for (const [x, y, a] of [[44, 64, -2.4], [148, 64, -0.7], [40, 104, 3.1], [152, 104, 0], [60, 138, 2.4], [132, 138, 0.8], [76, 44, -1.9], [116, 44, -1.2]]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); P(ctx, [[0, -7], [26, 0], [0, 7]]); ctx.fill(); outline(ctx, 2); ctx.restore();
      }
      gem(ctx, 96, 86, 13, '#ff8a6a', '#7a1a10');
    },
    hourglass(ctx) {
      tile(ctx, '#2c2440'); glow(ctx, 96, 100, 60, 'rgba(255,210,120,0.22)');
      ctx.fillStyle = 'rgba(200,230,255,0.35)'; P(ctx, [[62, 46], [130, 46], [100, 98], [130, 150], [62, 150], [92, 98]]); ctx.fill(); outline(ctx, 2);
      ctx.fillStyle = lin(ctx, 0, 60, 0, 150, [[0, '#ffe08a'], [1, '#c8862a']]);
      P(ctx, [[76, 66], [116, 66], [98, 94], [94, 94]]); ctx.fill(); P(ctx, [[66, 146], [126, 146], [110, 122], [82, 122]]); ctx.fill();
      ctx.fillRect(95, 94, 2, 30);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; P(ctx, [[70, 52], [78, 52], [92, 84], [88, 86]]); ctx.fill();
      shadow(ctx, true); ctx.fillStyle = gold(ctx);
      rr(ctx, 46, 30, 100, 16, 6); ctx.fill(); rr(ctx, 46, 150, 100, 16, 6); ctx.fill(); shadow(ctx, false);
      rr(ctx, 46, 30, 100, 16, 6); outline(ctx, 2); rr(ctx, 46, 150, 100, 16, 6); outline(ctx, 2);
      ctx.fillStyle = gold(ctx); for (const x of [52, 134]) { ctx.fillRect(x, 46, 7, 104); ctx.strokeRect(x, 46, 7, 104); }
    },
    voidstaff(ctx) {
      tile(ctx, '#24143c'); glow(ctx, 112, 66, 64, 'rgba(190,110,255,0.45)'); shadow(ctx, true);
      ctx.save(); ctx.translate(96, 96); ctx.rotate(0.62);
      ctx.fillStyle = lin(ctx, -8, 0, 8, 0, [[0, '#2a1a3a'], [0.5, '#6a4a8a'], [1, '#1a1024']]); rr(ctx, -7, -20, 14, 100, 6); ctx.fill(); outline(ctx, 2);
      ctx.fillStyle = gold(ctx); rr(ctx, -12, -26, 24, 12, 4); ctx.fill(); outline(ctx, 2);
      P(ctx, [[-16, -26], [-22, -62], [-6, -40]]); ctx.fill(); outline(ctx, 2); P(ctx, [[16, -26], [22, -62], [6, -40]]); ctx.fill(); outline(ctx, 2);
      ctx.restore(); shadow(ctx, false);
      ctx.fillStyle = rad(ctx, 116, 62, 26, [[0, '#ffffff'], [0.3, '#d8a8ff'], [0.8, '#5a1a9a'], [1, '#1a0630']]); ctx.beginPath(); ctx.arc(116, 62, 24, 0, 7); ctx.fill(); outline(ctx, 2);
      ctx.strokeStyle = 'rgba(230,200,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(116, 62, 38, 12, -0.4, 0, 7); ctx.stroke();
    },
    twinblades(ctx) {
      tile(ctx, '#3a1418'); glow(ctx, 96, 96, 70, 'rgba(255,60,60,0.22)');
      const blade = (flip) => {
        ctx.save(); ctx.translate(96 - flip * 30, 140); ctx.scale(flip, 1); ctx.rotate(0.6);
        shadow(ctx, true); ctx.fillStyle = lin(ctx, -10, 0, 14, 0, [[0, '#ffd8d8'], [0.5, '#c42a32'], [1, '#5a0a12']]);
        ctx.beginPath(); ctx.moveTo(-8, 10); ctx.quadraticCurveTo(-18, -40, 6, -84); ctx.quadraticCurveTo(10, -40, 10, 10); ctx.closePath(); ctx.fill(); shadow(ctx, false); outline(ctx, 2);
        ctx.fillStyle = gold(ctx); rr(ctx, -20, 8, 40, 9, 4); ctx.fill(); outline(ctx, 2);
        ctx.fillStyle = '#2a1410'; rr(ctx, -5, 17, 10, 30, 3); ctx.fill(); outline(ctx, 2);
        ctx.fillStyle = gold(ctx); ctx.beginPath(); ctx.arc(0, 50, 6, 0, 7); ctx.fill(); outline(ctx, 2);
        ctx.restore();
      };
      blade(1); blade(-1);
    },
    bulwark(ctx) {
      tile(ctx, '#14304a'); shadow(ctx, true);
      ctx.fillStyle = steel(ctx, 40, 40, 150, 150); ctx.beginPath(); ctx.arc(96, 98, 62, 0, 7); ctx.fill(); shadow(ctx, false); outline(ctx);
      ctx.lineWidth = 9; ctx.strokeStyle = gold(ctx); ctx.beginPath(); ctx.arc(96, 98, 56, 0, 7); ctx.stroke();
      ctx.fillStyle = lin(ctx, 0, 50, 0, 150, [[0, '#2a5a9a'], [1, '#0e2448']]); ctx.beginPath(); ctx.arc(96, 98, 50, 0, 7); ctx.fill();
      ctx.fillStyle = gold(ctx); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.arc(96 + Math.cos(a) * 56, 98 + Math.sin(a) * 56, 4, 0, 7); ctx.fill(); }
      ctx.save(); ctx.translate(96, 98); for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillStyle = gold(ctx); P(ctx, [[-8, -18], [0, -46], [8, -18]]); ctx.fill(); outline(ctx, 2); } ctx.restore();
      gem(ctx, 96, 98, 17, '#9adfff', '#0a4a8a');
    },
    crystal(ctx) {
      tile(ctx, '#0e3444'); glow(ctx, 96, 100, 72, 'rgba(100,240,255,0.35)');
      const sh = (x, y, w, h, a) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.fillStyle = lin(ctx, -w, 0, w, 0, [[0, '#e8ffff'], [0.45, '#5ad8f0'], [1, '#0a4a6a']]);
        P(ctx, [[-w, 0], [-w * 0.7, -h], [0, -h - w * 1.2], [w * 0.7, -h], [w, 0]]); ctx.fill(); outline(ctx, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; P(ctx, [[-w * 0.6, -4], [-w * 0.45, -h + 4], [-w * 0.1, -h + 2], [-w * 0.2, -4]]); ctx.fill();
        ctx.restore();
      };
      shadow(ctx, true); sh(70, 152, 14, 50, -0.45); sh(124, 152, 14, 56, 0.4); sh(96, 158, 20, 88, 0); shadow(ctx, false);
      ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.ellipse(96, 156, 52, 10, 0, 0, 7); ctx.fill(); outline(ctx, 2);
    },
    axe(ctx) {
      tile(ctx, '#2c2418'); shadow(ctx, true);
      ctx.save(); ctx.translate(96, 96); ctx.rotate(-0.6);
      ctx.fillStyle = lin(ctx, -6, 0, 6, 0, [[0, '#4a2c14'], [0.5, '#9a6a3a'], [1, '#3a200c']]); rr(ctx, -6, -72, 12, 150, 5); ctx.fill(); outline(ctx, 2);
      ctx.fillStyle = steel(ctx, 0, -70, 0, 0);
      ctx.beginPath(); ctx.moveTo(4, -64); ctx.quadraticCurveTo(70, -88, 64, -20); ctx.quadraticCurveTo(40, -36, 4, -24); ctx.closePath(); ctx.fill(); outline(ctx, 3);
      ctx.beginPath(); ctx.moveTo(-4, -60); ctx.quadraticCurveTo(-40, -66, -44, -38); ctx.quadraticCurveTo(-26, -40, -4, -30); ctx.closePath(); ctx.fill(); outline(ctx, 3);
      ctx.fillStyle = gold(ctx); rr(ctx, -10, -66, 20, 46, 4); ctx.fill(); outline(ctx, 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(60, -60); ctx.quadraticCurveTo(66, -40, 62, -26); ctx.stroke();
      ctx.restore(); shadow(ctx, false);
    },
  };
  const out = {};
  for (const [id, fn] of Object.entries(D)) {
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d'); ctx.save(); fn(ctx); ctx.restore();
    // 회화풍 조명: 좌상단 하이라이트 + 가장자리 어둡게
    ctx.save(); rr(ctx, 12, 12, S - 24, S - 24, 18); ctx.clip();
    ctx.globalCompositeOperation = 'soft-light';
    const hl = ctx.createRadialGradient(S * 0.3, S * 0.25, 4, S * 0.4, S * 0.4, S * 0.8); hl.addColorStop(0, 'rgba(255,245,220,0.9)'); hl.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = hl; ctx.fillRect(0, 0, S, S); ctx.restore();
    // 붓 터치 질감 (기존 아이콘의 회화풍 질감에 맞춤)
    for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.035})`; ctx.beginPath(); ctx.ellipse(Math.random() * S, Math.random() * S, 6 + Math.random() * 14, 1.5 + Math.random() * 3, Math.random() * 3, 0, 7); ctx.fill(); }
    const small = document.createElement('canvas'); small.width = small.height = 96;
    small.getContext('2d').drawImage(cv, 0, 0, 96, 96);
    out[id] = small.toDataURL('image/webp', 0.92);
  }
  return out;
};

const b = await chromium.launch();
const pg = await b.newPage();
await pg.setContent('<html><body></body></html>');
const res = await pg.evaluate(painter);
fs.mkdirSync('public/art/items', { recursive: true });
for (const [id, url] of Object.entries(res)) fs.writeFileSync(`public/art/items/${id}.webp`, Buffer.from(url.split(',')[1], 'base64'));
console.log(Object.keys(res).join(','));
await b.close();
